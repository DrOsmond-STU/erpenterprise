import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AssetsService } from './assets.service.js';
import { MaintenanceService } from './maintenance.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode berformat YYYY-MM');
const money = z.number().int('Nilai rupiah bulat').min(0).max(1e13);
const text = (max: number) => z.string().trim().max(max);
const bankCode = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening'));
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);

const assetInput = z.object({
  name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(120), category: z.string().trim().min(3).max(60), glAccount: z.string().trim().regex(/^\d-\d{4}$/, 'Pilih akun aset'),
  branch: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Pilih cabang'), location: text(120).optional(), acquisitionDate: date, cost: money.min(1, 'Harga perolehan wajib'),
  usefulLifeMonths: z.number().int().min(1, 'Umur manfaat minimal 1 bulan').max(600), salvage: money.optional(), bank: bankCode,
});
const runInput = z.object({ period });
const disposeInput = z.object({ date, proceeds: money, bank: bankCode.optional(), note: reason });
const maintInput = z.object({
  assetId: z.string().uuid('Pilih aset'), kind: z.enum(['preventif', 'korektif']), priority: z.enum(['rendah', 'sedang', 'tinggi']).default('sedang'),
  assignee: text(80).optional(), scheduledDate: date, description: z.string().trim().min(3, 'Uraian minimal 3 karakter').max(300), estimatedCost: money.optional(),
});
const completeInput = z.object({
  date: date.optional(), serviceCost: money, bank: bankCode.optional(), notes: text(300).optional(),
  parts: z.array(z.object({ warehouse: z.string().trim().min(1).max(40), sku: z.string().trim().min(1).max(40), qty: z.number().finite().positive().max(1e6) })).max(50).optional(),
});
const reasonOnly = z.object({ reason });

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService, private readonly maint: MaintenanceService) {}

  @Get() @RequirePermission('asset.read')
  list(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.assets.list(u, s, r.requestId); }

  @Get('depreciation/runs') @RequirePermission('asset.read')
  runs(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.assets.runs(u, s, r.requestId); }

  @Get('depreciation/preview') @RequirePermission('asset.read')
  preview(@Query(new ZodValidationPipe(runInput)) q: z.infer<typeof runInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.assets.preview(u, s, q.period, r.requestId); }

  @Post('depreciation/run') @HttpCode(200) @RequirePermission('asset.depreciate')
  run(@Body(new ZodValidationPipe(runInput)) b: z.infer<typeof runInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.assets.runDepreciation(u, s, b.period, r.requestId); }

  @Get('maintenance') @RequirePermission('asset.read')
  listMaint(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.maint.list(u, s, r.requestId); }

  @Get('maintenance/:id') @RequirePermission('asset.read')
  getMaint(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.maint.get(u, s, id, r.requestId); }

  @Post('maintenance') @RequirePermission('asset.manage')
  createMaint(@Body(new ZodValidationPipe(maintInput)) b: z.infer<typeof maintInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.maint.create(u, s, b, r.requestId); }

  @Post('maintenance/:id/start') @HttpCode(200) @RequirePermission('asset.manage')
  startMaint(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.maint.start(u, s, id, r.requestId); }

  @Post('maintenance/:id/complete') @HttpCode(200) @RequirePermission('asset.manage')
  completeMaint(@Param('id') id: string, @Body(new ZodValidationPipe(completeInput)) b: z.infer<typeof completeInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.maint.complete(u, s, id, b, r.requestId);
  }

  @Post('maintenance/:id/cancel') @HttpCode(200) @RequirePermission('asset.manage')
  cancelMaint(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.maint.cancel(u, s, id, b.reason, r.requestId);
  }

  @Get(':id') @RequirePermission('asset.read')
  get(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.assets.get(u, s, id, r.requestId); }

  @Post() @RequirePermission('asset.manage')
  create(@Body(new ZodValidationPipe(assetInput)) b: z.infer<typeof assetInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.assets.create(u, s, b, r.requestId); }

  @Post(':id/dispose') @HttpCode(200) @RequirePermission('asset.depreciate')
  dispose(@Param('id') id: string, @Body(new ZodValidationPipe(disposeInput)) b: z.infer<typeof disposeInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.assets.dispose(u, s, id, b, r.requestId);
  }
}
