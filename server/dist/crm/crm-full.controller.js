"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrmFullController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const domain_1 = require("@erp/domain");
const context_js_1 = require("../common/context.js");
const zod_pipe_js_1 = require("../common/zod.pipe.js");
const leads_service_js_1 = require("./leads.service.js");
const relations_service_js_1 = require("./relations.service.js");
const service_desk_service_js_1 = require("./service-desk.service.js");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal berformat YYYY-MM-DD');
const opt = (t) => t.optional();
const text = (max) => zod_1.z.string().trim().max(max);
const branch = zod_1.z.string().trim().toUpperCase().pipe(zod_1.z.string().regex(/^[A-Z]{3}$/, 'Kode cabang 3 huruf'));
const money = zod_1.z.number().int('Nilai rupiah bulat').min(0).max(1e14);
const uuid = zod_1.z.string().uuid('ID tidak sah');
const email = zod_1.z.string().trim().email('Email tidak sah').max(200).or(zod_1.z.literal(''));
const reason = zod_1.z.string().trim().min(3, 'Alasan minimal 3 karakter').max(300);
const leadBase = {
    branch: opt(branch), name: opt(zod_1.z.string().trim().min(2, 'Nama minimal 2 karakter').max(120)), companyName: opt(text(160).nullable()), title: opt(text(80).nullable()),
    phone: opt(text(40).nullable()), email: opt(email.nullable()), city: opt(text(80).nullable()), source: opt(text(40)), campaignId: opt(uuid.nullable()),
    ownerName: opt(text(120)), estimatedValue: opt(money), notes: opt(text(1000).nullable()),
};
const leadCreate = zod_1.z.object({ ...leadBase, name: leadBase.name.unwrap() });
const leadPatch = zod_1.z.object(leadBase);
const leadStatus = zod_1.z.object({ status: zod_1.z.enum(domain_1.LEAD_STATUSES), reason: opt(text(300).nullable()) });
const convert = zod_1.z.object({
    customerId: opt(uuid.nullable()),
    newCustomer: opt(zod_1.z.object({ name: opt(text(160)), segment: opt(zod_1.z.enum(['Langsung', 'Distributor', 'Kontrak', 'Ritel'])), city: opt(text(80)), creditLimit: opt(money), termsDays: opt(zod_1.z.number().int().min(0).max(365)) }).nullable()),
    opportunityName: opt(text(200)), value: opt(money), expectedClose: opt(date.nullable()),
});
const campaignBase = { name: opt(zod_1.z.string().trim().min(3).max(160)), channel: opt(text(40)), startDate: opt(date), endDate: opt(date), budget: opt(money), status: opt(zod_1.z.enum(['rencana', 'berjalan', 'selesai', 'batal'])), notes: opt(text(1000).nullable()) };
const campaignCreate = zod_1.z.object({ ...campaignBase, name: campaignBase.name.unwrap(), startDate: date, endDate: date });
const campaignPatch = zod_1.z.object(campaignBase);
const contact = zod_1.z.object({
    partyType: opt(zod_1.z.enum(['customer', 'supplier'])), partyId: opt(uuid), name: opt(zod_1.z.string().trim().min(2).max(120)), title: opt(text(80).nullable()), phone: opt(text(40).nullable()),
    email: opt(email.nullable()), isPrimary: opt(zod_1.z.boolean()), notes: opt(text(500).nullable()), status: opt(zod_1.z.enum(['aktif', 'nonaktif'])),
});
const contactQuery = zod_1.z.object({ partyType: zod_1.z.enum(['customer', 'supplier']), partyId: uuid });
const activity = zod_1.z.object({
    kind: zod_1.z.enum(['telepon', 'rapat', 'email', 'kunjungan', 'tugas', 'penagihan', 'catatan']), subject: zod_1.z.string().trim().min(3, 'Judul minimal 3 karakter').max(200), notes: opt(text(2000).nullable()),
    dueAt: opt(zod_1.z.string().datetime({ offset: true, message: 'Tenggat tidak sah' }).nullable()), done: opt(zod_1.z.boolean()), result: opt(text(1000).nullable()), assigneeName: opt(text(120).nullable()),
    customerId: opt(uuid.nullable()), supplierId: opt(uuid.nullable()), leadId: opt(uuid.nullable()), opportunityId: opt(uuid.nullable()), invoiceId: opt(uuid.nullable()), ticketId: opt(uuid.nullable()),
});
const activityQuery = zod_1.z.object({
    mine: opt(zod_1.z.enum(['1', '0'])), status: opt(zod_1.z.enum(['terbuka', 'selesai', 'batal', 'all'])), customerId: opt(uuid), supplierId: opt(uuid), leadId: opt(uuid), opportunityId: opt(uuid), invoiceId: opt(uuid), ticketId: opt(uuid),
});
const complete = zod_1.z.object({ result: opt(text(1000).nullable()), followUp: opt(zod_1.z.object({ subject: zod_1.z.string().trim().min(3).max(200), dueAt: zod_1.z.string().datetime({ offset: true }) }).nullable()) });
const collLog = zod_1.z.object({ invoiceId: uuid, kind: zod_1.z.enum(['telepon', 'email', 'kunjungan', 'penagihan']), note: zod_1.z.string().trim().min(3, 'Catatan minimal 3 karakter').max(1000), nextDate: opt(date.nullable()) });
const promise = zod_1.z.object({ invoiceId: uuid, promiseDate: date, amount: zod_1.z.number().int().positive('Nilai janji harus lebih dari nol').max(1e14), note: opt(text(500).nullable()) });
const reasonOnly = zod_1.z.object({ reason });
const ticketCreate = zod_1.z.object({
    branch: opt(branch), partyType: opt(zod_1.z.enum(['customer', 'supplier'])), customerId: opt(uuid.nullable()), supplierId: opt(uuid.nullable()), invoiceId: opt(uuid.nullable()), salesOrderId: opt(uuid.nullable()),
    purchaseOrderId: opt(uuid.nullable()), subject: zod_1.z.string().trim().min(5, 'Judul minimal 5 karakter').max(200), description: opt(text(4000).nullable()),
    category: opt(zod_1.z.enum(['produk', 'pengiriman', 'tagihan', 'layanan', 'mutu', 'lainnya'])), priority: opt(zod_1.z.enum(domain_1.TICKET_PRIORITIES)), assigneeName: opt(text(120).nullable()),
});
const ticketPatch = zod_1.z.object({ priority: opt(zod_1.z.enum(domain_1.TICKET_PRIORITIES)), assigneeName: opt(text(120)), category: opt(zod_1.z.enum(['produk', 'pengiriman', 'tagihan', 'layanan', 'mutu', 'lainnya'])) });
const ticketStatus = zod_1.z.object({ status: zod_1.z.enum(['baru', 'diproses', 'menunggu', 'selesai', 'ditutup']), resolution: opt(text(2000).nullable()), satisfaction: opt(zod_1.z.number().int().min(1).max(5).nullable()), note: opt(text(1000).nullable()) });
const CRM_ANY = 'crm.read|crm.collection|crm.ticket';
let CrmFullController = class CrmFullController {
    leads;
    rel;
    desk;
    constructor(leads, rel, desk) {
        this.leads = leads;
        this.rel = rel;
        this.desk = desk;
    }
    dashboard(u, s, r) { return this.rel.dashboard(u, s, r.requestId); }
    /* --- Lead --- */
    leadsList(u, s, r) { return this.leads.list(u, s, r.requestId); }
    lead(id, u, s, r) { return this.leads.get(u, s, id, r.requestId); }
    leadCreate(b, u, s, r) { return this.leads.create(u, s, b, r.requestId); }
    leadPatch(id, b, u, s, r) { return this.leads.update(u, s, id, b, r.requestId); }
    leadStatus(id, b, u, s, r) { return this.leads.setStatus(u, s, id, b, r.requestId); }
    leadConvert(id, b, u, s, r) { return this.leads.convert(u, s, id, b, r.requestId); }
    /* --- Kampanye --- */
    campaigns(u, s, r) { return this.leads.listCampaigns(u, s, r.requestId); }
    campaign(id, u, s, r) { return this.leads.getCampaign(u, s, id, r.requestId); }
    campaignCreate(b, u, s, r) { return this.leads.createCampaign(u, s, b, r.requestId); }
    campaignPatch(id, b, u, s, r) { return this.leads.updateCampaign(u, s, id, b, r.requestId); }
    campaignOptions(u, s, r) {
        return this.leads.listCampaigns(u, s, r.requestId).then((xs) => xs.filter((k) => k.status !== 'batal').map((k) => ({ id: k.id, code: k.code, name: k.name, status: k.status })));
    }
    /* --- Kontak --- */
    contacts(q, u, s, r) { return this.rel.contacts(u, s, q.partyType, q.partyId, r.requestId); }
    contactCreate(b, u, s, r) { return this.rel.saveContact(u, s, null, b, r.requestId); }
    contactPatch(id, b, u, s, r) { return this.rel.saveContact(u, s, id, b, r.requestId); }
    /* --- Aktivitas & tugas --- */
    activities(q, u, s, r) { return this.rel.listActivities(u, s, { ...q, mine: q.mine === '1' }, r.requestId); }
    activityCreate(b, u, s, r) { return this.rel.createActivity(u, s, b, r.requestId); }
    activityDone(id, b, u, s, r) { return this.rel.completeActivity(u, s, id, b, r.requestId); }
    activityCancel(id, u, s, r) { return this.rel.cancelActivity(u, s, id, r.requestId); }
    /* --- Profil 360 --- */
    customerProfile(id, u, s, r) { return this.rel.customerProfile(u, s, id, r.requestId); }
    supplierProfile(id, u, s, r) { return this.rel.supplierProfile(u, s, id, r.requestId); }
    /* --- Penagihan --- */
    collections(u, s, r) { return this.desk.collections(u, s, r.requestId); }
    collLog(b, u, s, r) { return this.desk.logCollection(u, s, b, r.requestId); }
    promise(b, u, s, r) { return this.desk.promise(u, s, b, r.requestId); }
    promiseCancel(id, u, s, r) { return this.desk.cancelPromise(u, s, id, r.requestId); }
    hold(id, b, u, s, r) { return this.desk.holdCustomer(u, s, id, b.reason, r.requestId); }
    /* --- Tiket --- */
    tickets(u, s, r) { return this.desk.listTickets(u, s, r.requestId); }
    ticket(id, u, s, r) { return this.desk.getTicket(u, s, id, r.requestId); }
    ticketCreate(b, u, s, r) { return this.desk.createTicket(u, s, b, r.requestId); }
    ticketPatch(id, b, u, s, r) { return this.desk.updateTicket(u, s, id, b, r.requestId); }
    ticketStatus(id, b, u, s, r) { return this.desk.setTicketStatus(u, s, id, b, r.requestId); }
};
exports.CrmFullController = CrmFullController;
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, context_js_1.RequirePermission)('crm.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)('leads'),
    (0, context_js_1.RequirePermission)('crm.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "leadsList", null);
__decorate([
    (0, common_1.Get)('leads/:id'),
    (0, context_js_1.RequirePermission)('crm.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "lead", null);
__decorate([
    (0, common_1.Post)('leads'),
    (0, context_js_1.RequirePermission)('crm.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(leadCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "leadCreate", null);
__decorate([
    (0, common_1.Patch)('leads/:id'),
    (0, context_js_1.RequirePermission)('crm.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(leadPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "leadPatch", null);
__decorate([
    (0, common_1.Post)('leads/:id/status'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('crm.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(leadStatus))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "leadStatus", null);
__decorate([
    (0, common_1.Post)('leads/:id/convert'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('crm.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(convert))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "leadConvert", null);
__decorate([
    (0, common_1.Get)('campaigns'),
    (0, context_js_1.RequirePermission)('crm.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "campaigns", null);
__decorate([
    (0, common_1.Get)('campaigns/:id'),
    (0, context_js_1.RequirePermission)('crm.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "campaign", null);
__decorate([
    (0, common_1.Post)('campaigns'),
    (0, context_js_1.RequirePermission)('crm.campaign'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(campaignCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "campaignCreate", null);
__decorate([
    (0, common_1.Patch)('campaigns/:id'),
    (0, context_js_1.RequirePermission)('crm.campaign'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(campaignPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "campaignPatch", null);
__decorate([
    (0, common_1.Get)('campaign-options'),
    (0, context_js_1.RequirePermission)('crm.read|purchasing.invoice.create'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "campaignOptions", null);
__decorate([
    (0, common_1.Get)('contacts'),
    (0, context_js_1.RequirePermission)('crm.read|sales.invoice.read|purchasing.invoice.read|purchasing.receipt.create'),
    __param(0, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(contactQuery))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "contacts", null);
__decorate([
    (0, common_1.Post)('contacts'),
    (0, context_js_1.RequirePermission)('crm.manage|sales.customer.manage|purchasing.supplier.manage'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(contact))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "contactCreate", null);
__decorate([
    (0, common_1.Patch)('contacts/:id'),
    (0, context_js_1.RequirePermission)('crm.manage|sales.customer.manage|purchasing.supplier.manage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(contact))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "contactPatch", null);
__decorate([
    (0, common_1.Get)('activities'),
    (0, context_js_1.RequirePermission)(CRM_ANY),
    __param(0, (0, common_1.Query)(new zod_pipe_js_1.ZodValidationPipe(activityQuery))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "activities", null);
__decorate([
    (0, common_1.Post)('activities'),
    (0, context_js_1.RequirePermission)(`${CRM_ANY}|crm.manage`),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(activity))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "activityCreate", null);
__decorate([
    (0, common_1.Post)('activities/:id/complete'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)(CRM_ANY),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(complete))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "activityDone", null);
__decorate([
    (0, common_1.Post)('activities/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)(CRM_ANY),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "activityCancel", null);
__decorate([
    (0, common_1.Get)('customers/:id/profile'),
    (0, context_js_1.RequirePermission)('crm.read|sales.invoice.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "customerProfile", null);
__decorate([
    (0, common_1.Get)('suppliers/:id/profile'),
    (0, context_js_1.RequirePermission)('crm.read|purchasing.invoice.read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "supplierProfile", null);
__decorate([
    (0, common_1.Get)('collections'),
    (0, context_js_1.RequirePermission)('crm.collection|sales.invoice.read'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "collections", null);
__decorate([
    (0, common_1.Post)('collections/log'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('crm.collection'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(collLog))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "collLog", null);
__decorate([
    (0, common_1.Post)('collections/promises'),
    (0, context_js_1.RequirePermission)('crm.collection'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(promise))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "promise", null);
__decorate([
    (0, common_1.Post)('collections/promises/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('crm.collection'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "promiseCancel", null);
__decorate([
    (0, common_1.Post)('collections/customers/:id/hold'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('crm.collection'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(reasonOnly))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "hold", null);
__decorate([
    (0, common_1.Get)('tickets'),
    (0, context_js_1.RequirePermission)('crm.read|crm.ticket'),
    __param(0, (0, context_js_1.CurrentUser)()),
    __param(1, (0, context_js_1.Scope)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "tickets", null);
__decorate([
    (0, common_1.Get)('tickets/:id'),
    (0, context_js_1.RequirePermission)('crm.read|crm.ticket'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "ticket", null);
__decorate([
    (0, common_1.Post)('tickets'),
    (0, context_js_1.RequirePermission)('crm.ticket'),
    __param(0, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(ticketCreate))),
    __param(1, (0, context_js_1.CurrentUser)()),
    __param(2, (0, context_js_1.Scope)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "ticketCreate", null);
__decorate([
    (0, common_1.Patch)('tickets/:id'),
    (0, context_js_1.RequirePermission)('crm.ticket'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(ticketPatch))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "ticketPatch", null);
__decorate([
    (0, common_1.Post)('tickets/:id/status'),
    (0, common_1.HttpCode)(200),
    (0, context_js_1.RequirePermission)('crm.ticket'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(new zod_pipe_js_1.ZodValidationPipe(ticketStatus))),
    __param(2, (0, context_js_1.CurrentUser)()),
    __param(3, (0, context_js_1.Scope)()),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CrmFullController.prototype, "ticketStatus", null);
exports.CrmFullController = CrmFullController = __decorate([
    (0, common_1.Controller)('crm'),
    __metadata("design:paramtypes", [leads_service_js_1.LeadsService, relations_service_js_1.RelationsService, service_desk_service_js_1.ServiceDeskService])
], CrmFullController);
//# sourceMappingURL=crm-full.controller.js.map