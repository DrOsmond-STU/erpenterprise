import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { PAY_METHODS } from '@erp/domain';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { PosService } from './pos.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const bankCode = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9-]{3,30}$/, 'Pilih rekening'));
const money = z.number().int('Nilai rupiah bulat').min(0).max(1e12);
const openInput = z.object({ warehouse: z.string().trim().min(1, 'Pilih toko').max(40), cashAccount: bankCode, settlementAccount: bankCode.optional(), openingCash: money, date: date.optional() });
const saleInput = z.object({
  lines: z.array(z.object({ sku: z.string().trim().min(1).max(40), qty: z.number().finite().positive('Jumlah harus lebih dari nol').max(1e6), discPct: z.number().min(0).max(100).optional() })).min(1, 'Keranjang kosong').max(100),
  method: z.enum(PAY_METHODS), tendered: money.optional(), reference: z.string().trim().max(80).optional(),
});
const closeInput = z.object({ countedCash: money, note: z.string().trim().max(300).optional() });
const reasonOnly = z.object({ reason: z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300) });

@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Get('shifts') @RequirePermission('pos.read')
  list(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pos.list(u, s, r.requestId); }

  @Get('shifts/:id') @RequirePermission('pos.read')
  get(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pos.get(u, s, id, r.requestId); }

  @Get('catalog') @RequirePermission('pos.operate')
  catalog(@Query('warehouse') warehouse: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pos.catalog(u, s, String(warehouse ?? ''), r.requestId); }

  @Post('shifts') @RequirePermission('pos.operate')
  open(@Body(new ZodValidationPipe(openInput)) b: z.infer<typeof openInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pos.open(u, s, b, r.requestId); }

  @Post('shifts/:id/transactions') @RequirePermission('pos.operate')
  sale(@Param('id') id: string, @Body(new ZodValidationPipe(saleInput)) b: z.infer<typeof saleInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.pos.sale(u, s, id, b, r.requestId);
  }

  @Post('transactions/:id/void') @HttpCode(200) @RequirePermission('pos.shift.post')
  voidTrx(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.pos.voidTrx(u, s, id, b.reason, r.requestId);
  }

  @Post('shifts/:id/close') @HttpCode(200) @RequirePermission('pos.operate|pos.shift.post')
  close(@Param('id') id: string, @Body(new ZodValidationPipe(closeInput)) b: z.infer<typeof closeInput>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.pos.close(u, s, id, b, r.requestId);
  }

  @Post('shifts/:id/post') @HttpCode(200) @RequirePermission('pos.shift.post')
  post(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.pos.post(u, s, id, r.requestId); }
}
