import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { PERMISSION_CATALOG, PASSWORD_MIN } from '@erp/domain';
import { AppRequest, CurrentUser, RequirePermission, RequestUser } from '../common/context.js';
import { forbidden } from '../common/errors.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { IamService } from './iam.service.js';
import { SettingsService } from './settings.service.js';

const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const assignment = z.object({
  role: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Kode peran tidak sah'),
  branch: z.string().trim().toUpperCase().pipe(z.string().regex(/^(ALL|[A-Z]{3})$/, 'Cabang: ALL atau kode 3 huruf')),
});
const userCreate = z.object({
  email: z.string().trim().email('Email tidak sah').max(200),
  name: z.string().trim().min(2).max(120),
  roles: z.array(assignment).min(1, 'Minimal satu peran').max(20),
  password: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
});
const userPatch = z.object({
  email: z.string().trim().email('Email tidak sah').max(200).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(['aktif', 'nonaktif']).optional(),
  roles: z.array(assignment).min(1, 'Minimal satu peran').max(20).optional(),
  reason,
});
const resetSchema = z.object({ password: z.string().max(200).optional().or(z.literal('').transform(() => undefined)), reason });
const reasonOnly = z.object({ reason });
const roleCreate = z.object({
  code: z.string().trim().toLowerCase().pipe(z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Kode peran: huruf kecil, angka, garis bawah (2–40)')),
  name: z.string().trim().min(3).max(80),
  permissions: z.array(z.string()).max(100),
});
const rolePatch = z.object({ name: z.string().trim().min(3).max(80).optional(), permissions: z.array(z.string()).max(100).optional(), reason });
const settingsPatch = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  npwp: z.string().trim().regex(/^[0-9.\-\s]{15,25}$/, 'NPWP berupa angka (15/16 digit) dengan titik/tanda hubung').optional().or(z.literal('')),
  address: z.string().trim().max(400).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email('Email tidak sah').max(200).optional().or(z.literal('')),
  website: z.string().trim().max(200).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  policies: z.object({
    salesApprovalThreshold: z.number().int().min(0).max(1e13).optional(),
    blockOverCreditLimit: z.boolean().optional(),
    allowPartialShipment: z.boolean().optional(),
    autoDocumentNumbering: z.boolean().optional(),
  }).optional(),
});

@Controller()
export class IamController {
  constructor(private readonly iam: IamService, private readonly settings: SettingsService) {}

  /* --- Katalog --- */
  @Get('admin/permissions')
  catalog() { return { groups: PERMISSION_CATALOG, passwordMinLength: PASSWORD_MIN }; }

  /* --- Pengguna --- */
  @Get('admin/users') @RequirePermission('admin.user.manage')
  users(@CurrentUser() u: RequestUser) { return this.iam.listUsers(u); }

  @Post('admin/users') @RequirePermission('admin.user.manage')
  createUser(@Body(new ZodValidationPipe(userCreate)) b: z.infer<typeof userCreate>, @CurrentUser() u: RequestUser, @Req() r: AppRequest) {
    return this.iam.createUser(u, b, r.requestId);
  }

  @Patch('admin/users/:id') @RequirePermission('admin.user.manage')
  patchUser(@Param('id') id: string, @Body(new ZodValidationPipe(userPatch)) b: z.infer<typeof userPatch>, @CurrentUser() u: RequestUser, @Req() r: AppRequest) {
    return this.iam.patchUser(u, id, b, r.requestId);
  }

  @Post('admin/users/:id/reset-password') @RequirePermission('admin.user.manage') @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  reset(@Param('id') id: string, @Body(new ZodValidationPipe(resetSchema)) b: z.infer<typeof resetSchema>, @CurrentUser() u: RequestUser, @Req() r: AppRequest) {
    return this.iam.resetPassword(u, id, b.password, b.reason, r.requestId);
  }

  @Post('admin/users/:id/unlock') @RequirePermission('admin.user.manage') @HttpCode(200)
  unlock(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Req() r: AppRequest) {
    return this.iam.unlock(u, id, b.reason, r.requestId);
  }

  /* --- Peran --- */
  /** Dibaca oleh pengelola peran maupun pengelola pengguna (untuk memilih peran). */
  @Get('admin/roles')
  roles(@CurrentUser() u: RequestUser) {
    if (!u.permissions.has('admin.role.manage') && !u.permissions.has('admin.user.manage')) throw forbidden('Memerlukan izin admin.role.manage atau admin.user.manage.');
    return this.iam.listRoles(u);
  }

  @Post('admin/roles') @RequirePermission('admin.role.manage')
  createRole(@Body(new ZodValidationPipe(roleCreate)) b: z.infer<typeof roleCreate>, @CurrentUser() u: RequestUser, @Req() r: AppRequest) {
    return this.iam.createRole(u, b, r.requestId);
  }

  @Patch('admin/roles/:code') @RequirePermission('admin.role.manage')
  patchRole(@Param('code') code: string, @Body(new ZodValidationPipe(rolePatch)) b: z.infer<typeof rolePatch>, @CurrentUser() u: RequestUser, @Req() r: AppRequest) {
    return this.iam.patchRole(u, code.slice(0, 40), b, r.requestId);
  }

  @Delete('admin/roles/:code') @RequirePermission('admin.role.manage')
  deleteRole(@Param('code') code: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Req() r: AppRequest) {
    return this.iam.deleteRole(u, code.slice(0, 40), b.reason, r.requestId);
  }

  /* --- Pengaturan --- */
  @Get('settings')
  getSettings(@CurrentUser() u: RequestUser) { return this.settings.get(u); }

  @Patch('settings') @RequirePermission('admin.settings.manage')
  patchSettings(@Body(new ZodValidationPipe(settingsPatch)) b: z.infer<typeof settingsPatch>, @CurrentUser() u: RequestUser, @Req() r: AppRequest) {
    return this.settings.patch(u, b, r.requestId);
  }
}
