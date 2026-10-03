import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { StockAdjustmentsService } from './adjustments.service.js';
import { InventoryService } from './inventory.service.js';
import { StockTransfersService } from './stock-transfers.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const text = (max: number) => z.string().trim().max(max);
const code = z.string().trim().min(1, 'Wajib diisi').max(40);
const qty = z.number().finite().max(1e9);

const adjustmentInput = z.object({
  warehouse: code, date: date.optional(), reason: z.enum(['opname', 'rusak', 'hilang', 'koreksi']), notes: text(300).optional(),
  lines: z.array(z.object({ sku: code, countedQty: qty.min(0, 'Jumlah hitung tidak boleh negatif'), note: text(200).optional() })).min(1, 'Minimal satu barang').max(500),
});
const transferInput = z.object({
  fromWarehouse: code, toWarehouse: code, date: date.optional(), notes: text(300).optional(),
  lines: z.array(z.object({ sku: code, qty: qty.positive('Jumlah harus lebih dari nol') })).min(1, 'Minimal satu barang').max(500),
});
const noteInput = z.object({ note: text(300).optional() });
const rejectInput = z.object({ note: reason });
const reasonOnly = z.object({ reason });
const receiveInput = z.object({ date: date.optional() });

const warehouseInput = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/, 'Kode gudang 2–30 huruf/angka/tanda hubung'), name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(80),
  branch: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Pilih cabang'),
});
const warehousePatch = z.object({ name: z.string().trim().min(3).max(80).optional(), status: z.enum(['aktif', 'nonaktif']).optional() });

const READ = 'inventory.read';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inv: InventoryService, private readonly adj: StockAdjustmentsService, private readonly trf: StockTransfersService) {}

  @Get('warehouses') @RequirePermission(READ)
  warehouses(@Query('all') all: string | undefined, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.inv.warehouses(u, s, all === '1', r.requestId); }

  @Post('warehouses') @RequirePermission('inventory.warehouse.manage')
  createWarehouse(@Body(new ZodValidationPipe(warehouseInput)) b: z.infer<typeof warehouseInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.inv.createWarehouse(u, s, b, r.requestId);
  }

  @Patch('warehouses/:code') @RequirePermission('inventory.warehouse.manage')
  updateWarehouse(@Param('code') code: string, @Body(new ZodValidationPipe(warehousePatch)) b: z.infer<typeof warehousePatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.inv.updateWarehouse(u, s, code, b, r.requestId);
  }

  @Get('stock') @RequirePermission(READ)
  stock(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.inv.stock(u, s, r.requestId); }

  @Get('card') @RequirePermission(READ)
  card(@Query('sku') sku: string, @Query('warehouse') warehouse: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.inv.card(u, s, String(sku ?? ''), String(warehouse ?? ''), r.requestId);
  }

  /* --- Penyesuaian / opname --- */
  @Get('adjustments') @RequirePermission(READ)
  listAdjustments(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.adj.list(u, s, r.requestId); }

  @Get('adjustments/:id') @RequirePermission(READ)
  getAdjustment(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.adj.get(u, s, id, r.requestId); }

  @Post('adjustments') @RequirePermission('inventory.adjust')
  createAdjustment(@Body(new ZodValidationPipe(adjustmentInput)) b: z.infer<typeof adjustmentInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.adj.create(u, s, b, r.requestId);
  }

  @Post('adjustments/:id/approve') @HttpCode(200) @RequirePermission('inventory.adjust.approve')
  approveAdjustment(@Param('id') id: string, @Body(new ZodValidationPipe(noteInput)) b: z.infer<typeof noteInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.adj.approve(u, s, id, b.note, r.requestId);
  }

  @Post('adjustments/:id/reject') @HttpCode(200) @RequirePermission('inventory.adjust.approve')
  rejectAdjustment(@Param('id') id: string, @Body(new ZodValidationPipe(rejectInput)) b: z.infer<typeof rejectInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.adj.reject(u, s, id, b.note, r.requestId);
  }

  @Post('adjustments/:id/cancel') @HttpCode(200) @RequirePermission('inventory.adjust|inventory.adjust.approve')
  cancelAdjustment(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.adj.cancel(u, s, id, b.reason, r.requestId);
  }

  /* --- Transfer stok --- */
  @Get('transfers') @RequirePermission(READ)
  listTransfers(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.trf.list(u, s, r.requestId); }

  @Get('transfers/:id') @RequirePermission(READ)
  getTransfer(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.trf.get(u, s, id, r.requestId); }

  @Post('transfers') @RequirePermission('inventory.transfer')
  createTransfer(@Body(new ZodValidationPipe(transferInput)) b: z.infer<typeof transferInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.trf.create(u, s, b, r.requestId);
  }

  @Post('transfers/:id/ship') @HttpCode(200) @RequirePermission('inventory.transfer')
  ship(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.trf.ship(u, s, id, r.requestId); }

  @Post('transfers/:id/receive') @HttpCode(200) @RequirePermission('inventory.transfer')
  receive(@Param('id') id: string, @Body(new ZodValidationPipe(receiveInput)) b: z.infer<typeof receiveInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.trf.receive(u, s, id, b.date, r.requestId);
  }

  @Post('transfers/:id/cancel') @HttpCode(200) @RequirePermission('inventory.transfer')
  cancelTransfer(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.trf.cancel(u, s, id, b.reason, r.requestId);
  }
}
