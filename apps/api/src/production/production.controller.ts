import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { BomsService } from './boms.service.js';
import { WorkOrdersService } from './work-orders.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const text = (max: number) => z.string().trim().max(max);
const sku = z.string().trim().min(1, 'Pilih barang').max(40);
const qty = z.number().finite().positive('Jumlah harus lebih dari nol').max(1e9);
const bomLines = z.array(z.object({ sku, qty })).min(1, 'Minimal satu bahan').max(200);

const bomInput = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/, 'Kode BOM 2–30 huruf/angka/tanda hubung'), sku, name: text(120).optional(),
  batchQty: qty, notes: text(300).optional(), lines: bomLines,
});
const bomPatch = z.object({ name: text(120).min(3).optional(), batchQty: qty.optional(), notes: text(300).optional(), status: z.enum(['aktif', 'nonaktif']).optional(), lines: bomLines.optional() });
const woInput = z.object({
  bomId: z.string().uuid('Pilih BOM'), warehouse: z.string().trim().min(1, 'Pilih gudang').max(40), plannedQty: qty, date: date.optional(), dueDate: date.optional(),
  line: text(60).optional(), pic: text(80).optional(), notes: text(300).optional(),
});
const woPatch = z.object({ progress: z.number().int().min(0).max(100).optional(), flag: text(120).nullable().optional(), line: text(60).optional(), pic: text(80).optional(), dueDate: date.nullable().optional(), notes: text(300).optional() });
const issueInput = z.object({ date: date.optional(), lines: z.array(z.object({ sku, qty: z.number().finite().min(0).max(1e9) })).max(200).optional() });
const qcInput = z.object({ goodQty: qty, rejectQty: z.number().finite().min(0).max(1e9).default(0), note: text(300).optional() });
const completeInput = z.object({ date: date.optional(), note: text(300).optional() });
const reworkInput = z.object({ note: reason });
const reasonOnly = z.object({ reason });

const READ = 'production.read';
const MANAGE = 'production.manage';

@Controller('production')
export class ProductionController {
  constructor(private readonly boms: BomsService, private readonly wo: WorkOrdersService) {}

  /* --- BOM --- */
  @Get('boms') @RequirePermission(READ)
  listBoms(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.boms.list(u, s, r.requestId); }

  @Get('boms/:id') @RequirePermission(READ)
  getBom(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.boms.get(u, s, id, r.requestId); }

  @Post('boms') @RequirePermission(MANAGE)
  createBom(@Body(new ZodValidationPipe(bomInput)) b: z.infer<typeof bomInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.boms.create(u, s, b, r.requestId); }

  @Patch('boms/:id') @RequirePermission(MANAGE)
  updateBom(@Param('id') id: string, @Body(new ZodValidationPipe(bomPatch)) b: z.infer<typeof bomPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.boms.update(u, s, id, b, r.requestId);
  }

  /* --- Perintah kerja --- */
  @Get('work-orders') @RequirePermission(READ)
  listWo(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.wo.list(u, s, r.requestId); }

  @Get('work-orders/:id') @RequirePermission(READ)
  getWo(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.wo.get(u, s, id, r.requestId); }

  @Post('work-orders') @RequirePermission(MANAGE)
  createWo(@Body(new ZodValidationPipe(woInput)) b: z.infer<typeof woInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.wo.create(u, s, b, r.requestId); }

  @Patch('work-orders/:id') @RequirePermission(MANAGE)
  updateWo(@Param('id') id: string, @Body(new ZodValidationPipe(woPatch)) b: z.infer<typeof woPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.wo.update(u, s, id, b, r.requestId);
  }

  @Post('work-orders/:id/issue') @HttpCode(200) @RequirePermission(MANAGE)
  issue(@Param('id') id: string, @Body(new ZodValidationPipe(issueInput)) b: z.infer<typeof issueInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.wo.issue(u, s, id, b, r.requestId);
  }

  @Post('work-orders/:id/qc') @HttpCode(200) @RequirePermission(MANAGE)
  submitQc(@Param('id') id: string, @Body(new ZodValidationPipe(qcInput)) b: z.infer<typeof qcInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.wo.submitQc(u, s, id, b, r.requestId);
  }

  @Post('work-orders/:id/complete') @HttpCode(200) @RequirePermission('production.complete')
  complete(@Param('id') id: string, @Body(new ZodValidationPipe(completeInput)) b: z.infer<typeof completeInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.wo.complete(u, s, id, b, r.requestId);
  }

  @Post('work-orders/:id/rework') @HttpCode(200) @RequirePermission('production.complete')
  rework(@Param('id') id: string, @Body(new ZodValidationPipe(reworkInput)) b: z.infer<typeof reworkInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.wo.rework(u, s, id, b.note, r.requestId);
  }

  @Post('work-orders/:id/cancel') @HttpCode(200) @RequirePermission(MANAGE)
  cancel(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.wo.cancel(u, s, id, b.reason, r.requestId);
  }
}
