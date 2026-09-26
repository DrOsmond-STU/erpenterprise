import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { OrgService } from './org.service.js';

const branchSchema = z.object({
  code: z.string().regex(/^[A-Za-z]{3}$/, 'Kode cabang tepat 3 huruf').transform((s) => s.toUpperCase()),
  name: z.string().trim().min(3).max(120),
  shortName: z.string().trim().min(2).max(40).optional(),
  type: z.string().trim().min(3).max(60),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  managerName: z.string().trim().max(120).optional(),
  bankName: z.string().trim().min(2).max(60).default('BCA'),
  targetMonthly: z.number().int().min(0).default(0),
});
const branchPatch = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  shortName: z.string().trim().min(2).max(40).optional(),
  type: z.string().trim().min(3).max(60).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  managerName: z.string().trim().max(120).optional(),
  status: z.enum(['aktif', 'nonaktif']).optional(),
  targetMonthly: z.number().int().min(0).optional(),
  reason: z.string().trim().min(3).max(300),
});
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });

@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('branches') @RequirePermission('org.branch.read')
  list(@CurrentUser() u: RequestUser) { return this.org.listBranches(u); }

  @Post('branches') @RequirePermission('org.branch.manage')
  create(@Body(new ZodValidationPipe(branchSchema)) body: z.infer<typeof branchSchema>, @CurrentUser() u: RequestUser, @Req() req: AppRequest) {
    return this.org.createBranch(u, body, req.requestId);
  }

  @Patch('branches/:code') @RequirePermission('org.branch.manage')
  patch(@Param('code') code: string, @Body(new ZodValidationPipe(branchPatch)) body: z.infer<typeof branchPatch>, @CurrentUser() u: RequestUser, @Req() req: AppRequest) {
    return this.org.patchBranch(u, code.toUpperCase(), body, req.requestId);
  }

  @Get('periods') @RequirePermission('org.period.read')
  periods(@CurrentUser() u: RequestUser) { return this.org.listPeriods(u); }

  @Post('periods/:code/close') @RequirePermission('ledger.period.close') @HttpCode(200)
  close(@Param('code') code: string, @Body(new ZodValidationPipe(reasonSchema)) body: { reason: string }, @CurrentUser() u: RequestUser, @Req() req: AppRequest) {
    return this.org.closePeriod(u, code, body.reason, req.requestId);
  }

  @Post('periods/:code/reopen') @RequirePermission('ledger.period.reopen') @HttpCode(200)
  reopen(@Param('code') code: string, @Body(new ZodValidationPipe(reasonSchema)) body: { reason: string }, @CurrentUser() u: RequestUser, @Req() req: AppRequest) {
    return this.org.reopenPeriod(u, code, body.reason, req.requestId);
  }
}
