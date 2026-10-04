import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { LEAD_STATUSES, TICKET_PRIORITIES } from '@erp/domain';
import { AppRequest, CurrentUser, RequirePermission, RequestUser, Scope, ScopeContext } from '../common/context.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { LeadsService } from './leads.service.js';
import { RelationsService } from './relations.service.js';
import { ServiceDeskService } from './service-desk.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional();
const text = (max: number) => z.string().trim().max(max);
const branch = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const money = z.number().int('Nilai rupiah bulat').min(0).max(1e14);
const uuid = z.string().uuid('ID tidak sah');
const email = z.string().trim().email('Email tidak sah').max(200).or(z.literal(''));
const reason = z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);

const leadBase = {
  branch: opt(branch), name: opt(z.string().trim().min(2, 'Nama minimal 2 karakter').max(120)), companyName: opt(text(160).nullable()), title: opt(text(80).nullable()),
  phone: opt(text(40).nullable()), email: opt(email.nullable()), city: opt(text(80).nullable()), source: opt(text(40)), campaignId: opt(uuid.nullable()),
  ownerName: opt(text(120)), estimatedValue: opt(money), notes: opt(text(1000).nullable()),
};
const leadCreate = z.object({ ...leadBase, name: leadBase.name.unwrap() });
const leadPatch = z.object(leadBase);
const leadStatus = z.object({ status: z.enum(LEAD_STATUSES), reason: opt(text(300).nullable()) });
const convert = z.object({
  customerId: opt(uuid.nullable()),
  newCustomer: opt(z.object({ name: opt(text(160)), segment: opt(z.enum(['Langsung', 'Distributor', 'Kontrak', 'Ritel'])), city: opt(text(80)), creditLimit: opt(money), termsDays: opt(z.number().int().min(0).max(365)) }).nullable()),
  opportunityName: opt(text(200)), value: opt(money), expectedClose: opt(date.nullable()),
});
const campaignBase = { name: opt(z.string().trim().min(3).max(160)), channel: opt(text(40)), startDate: opt(date), endDate: opt(date), budget: opt(money), status: opt(z.enum(['rencana', 'berjalan', 'selesai', 'batal'])), notes: opt(text(1000).nullable()) };
const campaignCreate = z.object({ ...campaignBase, name: campaignBase.name.unwrap(), startDate: date, endDate: date });
const campaignPatch = z.object(campaignBase);
const contact = z.object({
  partyType: opt(z.enum(['customer', 'supplier'])), partyId: opt(uuid), name: opt(z.string().trim().min(2).max(120)), title: opt(text(80).nullable()), phone: opt(text(40).nullable()),
  email: opt(email.nullable()), isPrimary: opt(z.boolean()), notes: opt(text(500).nullable()), status: opt(z.enum(['aktif', 'nonaktif'])),
});
const contactQuery = z.object({ partyType: z.enum(['customer', 'supplier']), partyId: uuid });
const activity = z.object({
  kind: z.enum(['telepon', 'rapat', 'email', 'kunjungan', 'tugas', 'penagihan', 'catatan']), subject: z.string().trim().min(3, 'Judul minimal 3 karakter').max(200), notes: opt(text(2000).nullable()),
  dueAt: opt(z.string().datetime({ offset: true, message: 'Tenggat tidak sah' }).nullable()), done: opt(z.boolean()), result: opt(text(1000).nullable()), assigneeName: opt(text(120).nullable()),
  customerId: opt(uuid.nullable()), supplierId: opt(uuid.nullable()), leadId: opt(uuid.nullable()), opportunityId: opt(uuid.nullable()), invoiceId: opt(uuid.nullable()), ticketId: opt(uuid.nullable()),
});
const activityQuery = z.object({
  mine: opt(z.enum(['1', '0'])), status: opt(z.enum(['terbuka', 'selesai', 'batal', 'all'])), customerId: opt(uuid), supplierId: opt(uuid), leadId: opt(uuid), opportunityId: opt(uuid), invoiceId: opt(uuid), ticketId: opt(uuid),
});
const complete = z.object({ result: opt(text(1000).nullable()), followUp: opt(z.object({ subject: z.string().trim().min(3).max(200), dueAt: z.string().datetime({ offset: true }) }).nullable()) });
const collLog = z.object({ invoiceId: uuid, kind: z.enum(['telepon', 'email', 'kunjungan', 'penagihan']), note: z.string().trim().min(3, 'Catatan minimal 3 karakter').max(1000), nextDate: opt(date.nullable()) });
const promise = z.object({ invoiceId: uuid, promiseDate: date, amount: z.number().int().positive('Nilai janji harus lebih dari nol').max(1e14), note: opt(text(500).nullable()) });
const reasonOnly = z.object({ reason });
const ticketCreate = z.object({
  branch: opt(branch), partyType: opt(z.enum(['customer', 'supplier'])), customerId: opt(uuid.nullable()), supplierId: opt(uuid.nullable()), invoiceId: opt(uuid.nullable()), salesOrderId: opt(uuid.nullable()),
  purchaseOrderId: opt(uuid.nullable()), subject: z.string().trim().min(5, 'Judul minimal 5 karakter').max(200), description: opt(text(4000).nullable()),
  category: opt(z.enum(['produk', 'pengiriman', 'tagihan', 'layanan', 'mutu', 'lainnya'])), priority: opt(z.enum(TICKET_PRIORITIES)), assigneeName: opt(text(120).nullable()),
});
const ticketPatch = z.object({ priority: opt(z.enum(TICKET_PRIORITIES)), assigneeName: opt(text(120)), category: opt(z.enum(['produk', 'pengiriman', 'tagihan', 'layanan', 'mutu', 'lainnya'])) });
const ticketStatus = z.object({ status: z.enum(['baru', 'diproses', 'menunggu', 'selesai', 'ditutup']), resolution: opt(text(2000).nullable()), satisfaction: opt(z.number().int().min(1).max(5).nullable()), note: opt(text(1000).nullable()) });

const CRM_ANY = 'crm.read|crm.collection|crm.ticket';

@Controller('crm')
export class CrmFullController {
  constructor(private readonly leads: LeadsService, private readonly rel: RelationsService, private readonly desk: ServiceDeskService) {}

  @Get('dashboard') @RequirePermission('crm.read')
  dashboard(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.dashboard(u, s, r.requestId); }

  /* --- Lead --- */
  @Get('leads') @RequirePermission('crm.read')
  leadsList(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.list(u, s, r.requestId); }
  @Get('leads/:id') @RequirePermission('crm.read')
  lead(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.get(u, s, id, r.requestId); }
  @Post('leads') @RequirePermission('crm.manage')
  leadCreate(@Body(new ZodValidationPipe(leadCreate)) b: z.infer<typeof leadCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.create(u, s, b, r.requestId); }
  @Patch('leads/:id') @RequirePermission('crm.manage')
  leadPatch(@Param('id') id: string, @Body(new ZodValidationPipe(leadPatch)) b: z.infer<typeof leadPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.update(u, s, id, b, r.requestId); }
  @Post('leads/:id/status') @HttpCode(200) @RequirePermission('crm.manage')
  leadStatus(@Param('id') id: string, @Body(new ZodValidationPipe(leadStatus)) b: z.infer<typeof leadStatus>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.setStatus(u, s, id, b, r.requestId); }
  @Post('leads/:id/convert') @HttpCode(200) @RequirePermission('crm.manage')
  leadConvert(@Param('id') id: string, @Body(new ZodValidationPipe(convert)) b: z.infer<typeof convert>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.convert(u, s, id, b, r.requestId); }

  /* --- Kampanye --- */
  @Get('campaigns') @RequirePermission('crm.read')
  campaigns(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.listCampaigns(u, s, r.requestId); }
  @Get('campaigns/:id') @RequirePermission('crm.read')
  campaign(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.getCampaign(u, s, id, r.requestId); }
  @Post('campaigns') @RequirePermission('crm.campaign')
  campaignCreate(@Body(new ZodValidationPipe(campaignCreate)) b: z.infer<typeof campaignCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.createCampaign(u, s, b, r.requestId); }
  @Patch('campaigns/:id') @RequirePermission('crm.campaign')
  campaignPatch(@Param('id') id: string, @Body(new ZodValidationPipe(campaignPatch)) b: z.infer<typeof campaignPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.leads.updateCampaign(u, s, id, b, r.requestId); }
  @Get('campaign-options') @RequirePermission('crm.read|purchasing.invoice.create')
  campaignOptions(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) {
    return this.leads.listCampaigns(u, s, r.requestId).then((xs) => xs.filter((k) => k.status !== 'batal').map((k) => ({ id: k.id, code: k.code, name: k.name, status: k.status })));
  }

  /* --- Kontak --- */
  @Get('contacts') @RequirePermission('crm.read|sales.invoice.read|purchasing.invoice.read|purchasing.receipt.create')
  contacts(@Query(new ZodValidationPipe(contactQuery)) q: z.infer<typeof contactQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.contacts(u, s, q.partyType, q.partyId, r.requestId); }
  @Post('contacts') @RequirePermission('crm.manage|sales.customer.manage|purchasing.supplier.manage')
  contactCreate(@Body(new ZodValidationPipe(contact)) b: z.infer<typeof contact>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.saveContact(u, s, null, b, r.requestId); }
  @Patch('contacts/:id') @RequirePermission('crm.manage|sales.customer.manage|purchasing.supplier.manage')
  contactPatch(@Param('id') id: string, @Body(new ZodValidationPipe(contact)) b: z.infer<typeof contact>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.saveContact(u, s, id, b, r.requestId); }

  /* --- Aktivitas & tugas --- */
  @Get('activities') @RequirePermission(CRM_ANY)
  activities(@Query(new ZodValidationPipe(activityQuery)) q: z.infer<typeof activityQuery>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.listActivities(u, s, { ...q, mine: q.mine === '1' }, r.requestId); }
  @Post('activities') @RequirePermission(`${CRM_ANY}|crm.manage`)
  activityCreate(@Body(new ZodValidationPipe(activity)) b: z.infer<typeof activity>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.createActivity(u, s, b, r.requestId); }
  @Post('activities/:id/complete') @HttpCode(200) @RequirePermission(CRM_ANY)
  activityDone(@Param('id') id: string, @Body(new ZodValidationPipe(complete)) b: z.infer<typeof complete>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.completeActivity(u, s, id, b, r.requestId); }
  @Post('activities/:id/cancel') @HttpCode(200) @RequirePermission(CRM_ANY)
  activityCancel(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.cancelActivity(u, s, id, r.requestId); }

  /* --- Profil 360 --- */
  @Get('customers/:id/profile') @RequirePermission('crm.read|sales.invoice.read')
  customerProfile(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.customerProfile(u, s, id, r.requestId); }
  @Get('suppliers/:id/profile') @RequirePermission('crm.read|purchasing.invoice.read')
  supplierProfile(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.rel.supplierProfile(u, s, id, r.requestId); }

  /* --- Penagihan --- */
  @Get('collections') @RequirePermission('crm.collection|sales.invoice.read')
  collections(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.collections(u, s, r.requestId); }
  @Post('collections/log') @HttpCode(200) @RequirePermission('crm.collection')
  collLog(@Body(new ZodValidationPipe(collLog)) b: z.infer<typeof collLog>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.logCollection(u, s, b, r.requestId); }
  @Post('collections/promises') @RequirePermission('crm.collection')
  promise(@Body(new ZodValidationPipe(promise)) b: z.infer<typeof promise>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.promise(u, s, b, r.requestId); }
  @Post('collections/promises/:id/cancel') @HttpCode(200) @RequirePermission('crm.collection')
  promiseCancel(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.cancelPromise(u, s, id, r.requestId); }
  @Post('collections/customers/:id/hold') @HttpCode(200) @RequirePermission('crm.collection')
  hold(@Param('id') id: string, @Body(new ZodValidationPipe(reasonOnly)) b: z.infer<typeof reasonOnly>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.holdCustomer(u, s, id, b.reason, r.requestId); }

  /* --- Tiket --- */
  @Get('tickets') @RequirePermission('crm.read|crm.ticket')
  tickets(@CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.listTickets(u, s, r.requestId); }
  @Get('tickets/:id') @RequirePermission('crm.read|crm.ticket')
  ticket(@Param('id') id: string, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.getTicket(u, s, id, r.requestId); }
  @Post('tickets') @RequirePermission('crm.ticket')
  ticketCreate(@Body(new ZodValidationPipe(ticketCreate)) b: z.infer<typeof ticketCreate>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.createTicket(u, s, b, r.requestId); }
  @Patch('tickets/:id') @RequirePermission('crm.ticket')
  ticketPatch(@Param('id') id: string, @Body(new ZodValidationPipe(ticketPatch)) b: z.infer<typeof ticketPatch>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.updateTicket(u, s, id, b, r.requestId); }
  @Post('tickets/:id/status') @HttpCode(200) @RequirePermission('crm.ticket')
  ticketStatus(@Param('id') id: string, @Body(new ZodValidationPipe(ticketStatus)) b: z.infer<typeof ticketStatus>, @CurrentUser() u: RequestUser, @Scope() s: ScopeContext, @Req() r: AppRequest) { return this.desk.setTicketStatus(u, s, id, b, r.requestId); }
}
