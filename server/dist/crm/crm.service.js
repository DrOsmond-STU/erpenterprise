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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrmService = void 0;
/**
 * CRM & penawaran (dok. 07 §3.1, §4.1). Peluang bergerak di kanban prospek →
 * kualifikasi → penawaran → negosiasi → menang/kalah (kalah wajib beralasan;
 * menang hanya lewat penawaran diterima → pesanan penjualan). Penawaran berbaris
 * dengan masa berlaku; diterima → pesanan penjualan (alur plafon kredit biasa) →
 * faktur → jurnal pendapatan/PPN/HPP. CRM sendiri tidak menjurnal.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const lines_js_1 = require("../sales/lines.js");
const orders_service_js_1 = require("../sales/orders.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const Q_LABEL = { draf: 'Draf', terkirim: 'Terkirim', diterima: 'Diterima', ditolak: 'Ditolak', batal: 'Batal' };
const mapOpp = (o) => ({
    id: o.id, code: o.code, branch: (0, sales_shared_js_1.trimBranch)(o.branch_code), name: o.name, customerId: o.customer_id, companyName: o.company_name,
    contactName: o.contact_name, contactPhone: o.contact_phone, contactEmail: o.contact_email, value: Number(o.value), stage: o.stage, probability: o.probability,
    weighted: (0, domain_1.isClosedStage)(o.stage) ? 0 : Math.round((Number(o.value) * o.probability) / 100), source: o.source, ownerName: o.owner_name, expectedClose: o.expected_close,
    nextAction: o.next_action, nextActionDate: o.next_action_date, overdueAction: !(0, domain_1.isClosedStage)(o.stage) && o.next_action_date && o.next_action_date < (0, sales_shared_js_1.todayWib)(),
    lostReason: o.lost_reason, closedAt: o.closed_at, quoteCount: o.quote_count ?? undefined, createdByName: o.created_by_name, createdAt: o.created_at, updatedAt: o.updated_at,
});
const mapQuote = (q, asOf = (0, sales_shared_js_1.todayWib)()) => ({
    id: q.id, docNo: q.doc_no, branch: (0, sales_shared_js_1.trimBranch)(q.branch_code), opportunityId: q.opportunity_id, opportunityCode: q.opp_code ?? null, opportunityName: q.opp_name ?? null,
    customerId: q.customer_id, customerName: q.customer_name, date: q.quote_date, validUntil: q.valid_until, status: q.status, statusLabel: Q_LABEL[q.status] ?? q.status,
    expired: (0, domain_1.quoteExpired)(q.valid_until, asOf, q.status), subtotal: Number(q.subtotal), discount: Number(q.discount), net: Number(q.net_amount), ppn: Number(q.ppn_amount), total: Number(q.total),
    terms: q.terms, notes: q.notes, createdBy: q.created_by, createdByName: q.created_by_name, sentAt: q.sent_at, sentByName: q.sent_by_name, decidedAt: q.decided_at, decidedByName: q.decided_by_name,
    decisionNote: q.decision_note, salesOrderId: q.sales_order_id, salesOrderNo: q.so_no ?? null, salesOrderStatus: q.so_status ?? null, createdAt: q.created_at,
});
const Q_SELECT = `SELECT q.*, c.name AS customer_name, o.code AS opp_code, o.name AS opp_name, so.doc_no AS so_no, so.status AS so_status
  FROM quotations q JOIN customers c ON c.id = q.customer_id LEFT JOIN opportunities o ON o.id = q.opportunity_id LEFT JOIN sales_orders so ON so.id = q.sales_order_id`;
let CrmService = class CrmService {
    db;
    audit;
    orders;
    constructor(db, audit, orders) {
        this.db = db;
        this.audit = audit;
        this.orders = orders;
    }
    rec(c, u, branch, action, entityType, entityId, after, requestId) {
        return this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action, entityType, entityId, after, requestId });
    }
    activity(c, u, o, kind, note) {
        return c.query('INSERT INTO opportunity_activities (opportunity_id, company_id, branch_code, kind, note, by_user, by_name) VALUES ($1,$2,$3,$4,$5,$6,$7)', [o.id, o.company_id, o.branch_code, kind, note.slice(0, 1000), u.id, u.name]);
    }
    /* ------------------------------ Peluang ------------------------------ */
    async listOpps(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query(`SELECT o.*, (SELECT count(*)::int FROM quotations q WHERE q.opportunity_id = o.id AND q.status <> 'batal') AS quote_count
          FROM opportunities o WHERE o.company_id = $1 AND ($2::text IS NULL OR o.branch_code = $2) ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapOpp);
            const won = rows.filter((o) => o.stage === 'menang'), lost = rows.filter((o) => o.stage === 'kalah'), open = rows.filter((o) => !(0, domain_1.isClosedStage)(o.stage));
            return {
                rows,
                summary: { pipeline: (0, domain_1.pipelineValue)(rows), openCount: open.length, openValue: open.reduce((t, o) => t + o.value, 0), avgDeal: won.length ? Math.round(won.reduce((t, o) => t + o.value, 0) / won.length) : 0,
                    won: won.length, wonValue: won.reduce((t, o) => t + o.value, 0), lost: lost.length, winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 1000) / 10 : 0 },
            };
        });
    }
    async oppRow(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Peluang');
        const o = (await c.query(`SELECT * FROM opportunities WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
        if (!o)
            throw (0, errors_js_1.notFound)('Peluang');
        return o;
    }
    async loadOpp(c, companyId, id) {
        const o = await this.oppRow(c, companyId, id);
        const activities = (await c.query('SELECT * FROM opportunity_activities WHERE opportunity_id = $1 ORDER BY at DESC, id DESC LIMIT 200', [id])).rows
            .map((a) => ({ id: Number(a.id), kind: a.kind, note: a.note, at: a.at, byName: a.by_name }));
        const quotes = (await c.query(`${Q_SELECT} WHERE q.company_id = $1 AND q.opportunity_id = $2 ORDER BY q.quote_date DESC, q.doc_no DESC`, [companyId, id])).rows.map((q) => mapQuote(q));
        return { ...mapOpp(o), activities, quotes, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'opportunity', o.code) };
    }
    async getOpp(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.loadOpp(c, u.companyId, id));
    }
    async customer(c, companyId, id, required = false) {
        if (!id) {
            if (required)
                throw (0, sales_shared_js_1.invalid)('CUSTOMER_REQUIRED', 'Pilih pelanggan.');
            return null;
        }
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, sales_shared_js_1.invalid)('CUSTOMER_UNKNOWN', 'Pelanggan tidak dikenal.');
        const r = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
        if (!r)
            throw (0, sales_shared_js_1.invalid)('CUSTOMER_UNKNOWN', 'Pelanggan tidak dikenal.');
        if (r.status === 'nonaktif')
            throw (0, sales_shared_js_1.invalid)('CUSTOMER_INACTIVE', `Pelanggan ${r.name} nonaktif.`);
        return r;
    }
    async createOpp(u, s, b, requestId) {
        const branch = String(b.branch ?? (s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
        if (!/^[A-Z]{3}$/.test(branch))
            throw (0, sales_shared_js_1.invalid)('BRANCH_REQUIRED', 'Pilih cabang peluang.');
        (0, sales_shared_js_1.assertBranch)(u, s, branch);
        const stage = b.stage ?? 'prospek';
        if ((0, domain_1.isClosedStage)(stage))
            throw (0, sales_shared_js_1.invalid)('OPP_STAGE', 'Peluang baru dimulai dari tahap terbuka (prospek s.d. negosiasi).');
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cust = await this.customer(c, u.companyId, b.customerId);
            const companyName = cust?.name ?? b.companyName?.trim();
            if (!companyName)
                throw (0, sales_shared_js_1.invalid)('OPP_COMPANY', 'Isi nama perusahaan prospek atau pilih pelanggan.');
            if (!b.name?.trim())
                throw (0, sales_shared_js_1.invalid)('OPP_NAME', 'Isi nama peluang.');
            const year = Number((0, sales_shared_js_1.todayWib)().slice(0, 4));
            const code = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'OPP', year);
            const o = (await c.query(`INSERT INTO opportunities (company_id, branch_code, code, name, customer_id, company_name, contact_name, contact_phone, contact_email, value, stage, probability, source, owner_name, expected_close, next_action, next_action_date, created_by, created_by_name, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now()) RETURNING *`, [u.companyId, branch, code, b.name.trim(), cust?.id ?? null, companyName, b.contactName ?? null, b.contactPhone ?? null, b.contactEmail ?? null, b.value ?? 0, stage,
                (0, domain_1.probabilityFor)(stage, b.probability), b.source ?? 'Langsung', b.ownerName?.trim() || u.name, b.expectedClose ?? null, b.nextAction ?? null, b.nextActionDate ?? null, u.id, u.name])).rows[0];
            await this.activity(c, u, o, 'tahap', `Peluang dibuat pada tahap ${stage}`);
            await this.rec(c, u, branch, 'opportunity.created', 'opportunity', code, { name: o.name, value: Number(o.value), stage }, requestId);
            return this.loadOpp(c, u.companyId, o.id);
        });
    }
    async updateOpp(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const o = await this.oppRow(c, u.companyId, id, true);
            if ((0, domain_1.isClosedStage)(o.stage))
                throw (0, errors_js_1.conflict)('OPP_CLOSED', `Peluang ${o.code} sudah ${o.stage}.`);
            const cust = b.customerId !== undefined ? await this.customer(c, u.companyId, b.customerId) : undefined;
            await c.query(`UPDATE opportunities SET name = coalesce($2, name), customer_id = CASE WHEN $3::boolean THEN $4 ELSE customer_id END, company_name = coalesce($5, company_name),
            contact_name = coalesce($6, contact_name), contact_phone = coalesce($7, contact_phone), contact_email = coalesce($8, contact_email), value = coalesce($9, value),
            probability = coalesce($10, probability), source = coalesce($11, source), owner_name = coalesce($12, owner_name), expected_close = coalesce($13, expected_close),
            next_action = coalesce($14, next_action), next_action_date = coalesce($15, next_action_date), updated_at = now() WHERE id = $1`, [id, b.name?.trim() || null, cust !== undefined, cust?.id ?? null, cust?.name ?? (b.companyName?.trim() || null), b.contactName ?? null, b.contactPhone ?? null, b.contactEmail ?? null,
                b.value ?? null, b.probability === undefined || b.probability === null ? null : (0, domain_1.probabilityFor)(o.stage, b.probability), b.source ?? null, b.ownerName?.trim() || null,
                b.expectedClose ?? null, b.nextAction ?? null, b.nextActionDate ?? null]);
            await this.rec(c, u, (0, sales_shared_js_1.trimBranch)(o.branch_code), 'opportunity.updated', 'opportunity', o.code, { value: b.value ?? Number(o.value) }, requestId);
            return this.loadOpp(c, u.companyId, id);
        });
    }
    /** Pindah tahap (kanban). Menang hanya lewat konversi penawaran; kalah wajib beralasan. */
    async moveStage(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const o = await this.oppRow(c, u.companyId, id, true);
            const errs = (0, domain_1.stageProblems)(o.stage, b.stage, b.lostReason);
            if (errs.length)
                throw (0, sales_shared_js_1.invalid)('OPP_STAGE', errs[0], errs);
            const prob = (0, domain_1.probabilityFor)(b.stage, b.probability);
            await c.query(`UPDATE opportunities SET stage = $2, probability = $3, lost_reason = $4, closed_at = CASE WHEN $2 = 'kalah' THEN now() END, updated_at = now() WHERE id = $1`, [id, b.stage, prob, b.stage === 'kalah' ? b.lostReason.trim() : null]);
            await this.activity(c, u, o, 'tahap', `Tahap ${o.stage} → ${b.stage}${b.stage === 'kalah' ? ` — ${b.lostReason}` : ''}`);
            await this.rec(c, u, (0, sales_shared_js_1.trimBranch)(o.branch_code), b.stage === 'kalah' ? 'opportunity.lost' : 'opportunity.stage_changed', 'opportunity', o.code, { from: o.stage, to: b.stage, probability: prob, reason: b.lostReason ?? undefined }, requestId);
            return this.loadOpp(c, u.companyId, id);
        });
    }
    async addActivity(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const o = await this.oppRow(c, u.companyId, id, true);
            await this.activity(c, u, o, b.kind, b.note);
            await c.query('UPDATE opportunities SET next_action = coalesce($2, next_action), next_action_date = coalesce($3, next_action_date), updated_at = now() WHERE id = $1', [id, b.nextAction ?? null, b.nextActionDate ?? null]);
            return this.loadOpp(c, u.companyId, id);
        });
    }
    /* ------------------------------ Penawaran ------------------------------ */
    async listQuotes(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`${Q_SELECT} WHERE q.company_id = $1 AND ($2::text IS NULL OR q.branch_code = $2) ORDER BY q.quote_date DESC, q.doc_no DESC LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map((q) => mapQuote(q)));
    }
    async quoteRow(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Penawaran');
        if (lock)
            await c.query('SELECT 1 FROM quotations WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
        const q = (await c.query(`${Q_SELECT} WHERE q.company_id = $1 AND q.id = $2`, [companyId, id])).rows[0];
        if (!q)
            throw (0, errors_js_1.notFound)('Penawaran');
        return q;
    }
    async loadQuote(c, companyId, id) {
        const q = await this.quoteRow(c, companyId, id);
        const lines = (await c.query('SELECT * FROM quotation_lines WHERE quotation_id = $1 ORDER BY line_no', [id])).rows.map(lines_js_1.mapLine);
        return { ...mapQuote(q), lines, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'quotation', q.doc_no) };
    }
    async getQuote(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.loadQuote(c, u.companyId, id));
    }
    async writeLines(c, companyId, q, input) {
        const { lines, totals } = await (0, lines_js_1.resolveLines)(c, companyId, input);
        await c.query('DELETE FROM quotation_lines WHERE quotation_id = $1', [q.id]);
        let n = 0;
        for (const l of lines) {
            n += 1;
            await c.query(`INSERT INTO quotation_lines (quotation_id, company_id, branch_code, line_no, product_id, sku, description, kind, qty, unit, price, disc_pct, net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [q.id, companyId, q.branch, n, l.productId, l.sku, l.description, l.kind, l.qty, l.unit, l.price, l.discPct, l.net]);
        }
        await c.query('UPDATE quotations SET subtotal = $2, discount = $3, net_amount = $4, ppn_amount = $5, total = $6 WHERE id = $1', [q.id, totals.subtotal, totals.discount, totals.net, totals.ppn, totals.total]);
        return totals;
    }
    async createQuote(u, s, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            let opp = null;
            if (b.opportunityId) {
                opp = await this.oppRow(c, u.companyId, b.opportunityId, true);
                if ((0, domain_1.isClosedStage)(opp.stage))
                    throw (0, errors_js_1.conflict)('OPP_CLOSED', `Peluang ${opp.code} sudah ${opp.stage}.`);
            }
            const branch = String(b.branch ?? (opp ? (0, sales_shared_js_1.trimBranch)(opp.branch_code) : s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
            if (!/^[A-Z]{3}$/.test(branch))
                throw (0, sales_shared_js_1.invalid)('BRANCH_REQUIRED', 'Pilih cabang penawaran.');
            (0, sales_shared_js_1.assertBranch)(u, s, branch);
            if (opp && (0, sales_shared_js_1.trimBranch)(opp.branch_code) !== branch)
                throw (0, sales_shared_js_1.invalid)('OPP_BRANCH', `Peluang ${opp.code} milik cabang ${(0, sales_shared_js_1.trimBranch)(opp.branch_code)}.`);
            const cust = await this.customer(c, u.companyId, b.customerId ?? opp?.customer_id, true);
            const date = b.quoteDate ?? (0, sales_shared_js_1.todayWib)();
            const valid = b.validUntil ?? (0, domain_1.addDays)(date, 30);
            if (valid < date)
                throw (0, sales_shared_js_1.invalid)('QUOTE_VALIDITY', 'Masa berlaku tidak boleh sebelum tanggal penawaran.');
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'QT', Number(date.slice(0, 4)));
            const q = (await c.query(`INSERT INTO quotations (company_id, branch_code, doc_no, opportunity_id, customer_id, quote_date, valid_until, terms, notes, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [u.companyId, branch, docNo, opp?.id ?? null, cust.id, date, valid, b.terms ?? null, b.notes ?? null, u.id, u.name])).rows[0];
            const totals = await this.writeLines(c, u.companyId, { id: q.id, branch }, b.lines ?? []);
            if (opp) {
                /* Penawaran pertama menaikkan peluang ke tahap penawaran; prospek tanpa pelanggan menjadi pelanggan itu. */
                const nextStage = ['prospek', 'kualifikasi'].includes(opp.stage) ? 'penawaran' : opp.stage;
                await c.query(`UPDATE opportunities SET stage = $2, probability = CASE WHEN $2 <> stage THEN $3 ELSE probability END, customer_id = coalesce(customer_id, $4), company_name = CASE WHEN customer_id IS NULL THEN $5 ELSE company_name END, updated_at = now() WHERE id = $1`, [opp.id, nextStage, (0, domain_1.probabilityFor)(nextStage), cust.id, cust.name]);
                await this.activity(c, u, opp, 'catatan', `Penawaran ${docNo} dibuat (${totals.total.toLocaleString('id-ID')})${nextStage !== opp.stage ? ` — tahap ${opp.stage} → ${nextStage}` : ''}`);
            }
            await this.rec(c, u, branch, 'quotation.created', 'quotation', docNo, { customer: cust.name, total: totals.total, opportunity: opp?.code }, requestId);
            return this.loadQuote(c, u.companyId, q.id);
        });
    }
    async updateQuote(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const q = await this.quoteRow(c, u.companyId, id, true);
            /* Draf dapat diubah penuh; penawaran terkirim hanya diperpanjang masa berlakunya. */
            if (q.status === 'terkirim') {
                if (b.lines || b.customerId)
                    throw (0, errors_js_1.conflict)('QUOTE_SENT', `${q.doc_no} sudah terkirim; ubah isi dengan membuat penawaran revisi.`);
            }
            else if (q.status !== 'draf')
                throw (0, errors_js_1.conflict)('QUOTE_LOCKED', `${q.doc_no} berstatus ${Q_LABEL[q.status]}.`);
            const date = b.quoteDate ?? q.quote_date, valid = b.validUntil ?? q.valid_until;
            if (valid < date)
                throw (0, sales_shared_js_1.invalid)('QUOTE_VALIDITY', 'Masa berlaku tidak boleh sebelum tanggal penawaran.');
            const cust = b.customerId ? await this.customer(c, u.companyId, b.customerId, true) : null;
            await c.query('UPDATE quotations SET quote_date = $2, valid_until = $3, customer_id = coalesce($4, customer_id), terms = coalesce($5, terms), notes = coalesce($6, notes), updated_at = now() WHERE id = $1', [id, date, valid, cust?.id ?? null, b.terms ?? null, b.notes ?? null]);
            if (b.lines)
                await this.writeLines(c, u.companyId, { id, branch: (0, sales_shared_js_1.trimBranch)(q.branch_code) }, b.lines);
            await this.rec(c, u, (0, sales_shared_js_1.trimBranch)(q.branch_code), 'quotation.updated', 'quotation', q.doc_no, { validUntil: valid }, requestId);
            return this.loadQuote(c, u.companyId, id);
        });
    }
    async sendQuote(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const q = await this.quoteRow(c, u.companyId, id, true);
            if (q.status !== 'draf')
                throw (0, errors_js_1.conflict)('QUOTE_NOT_DRAFT', `${q.doc_no} bukan draf.`);
            if (q.valid_until < (0, sales_shared_js_1.todayWib)())
                throw (0, sales_shared_js_1.invalid)('QUOTE_EXPIRED', `Masa berlaku ${q.doc_no} sudah lewat; perpanjang sebelum dikirim.`);
            if (Number(q.total) <= 0)
                throw (0, sales_shared_js_1.invalid)('QUOTE_EMPTY', 'Nilai penawaran nol.');
            await c.query(`UPDATE quotations SET status = 'terkirim', sent_at = now(), sent_by_name = $2, updated_at = now() WHERE id = $1`, [id, u.name]);
            await this.rec(c, u, (0, sales_shared_js_1.trimBranch)(q.branch_code), 'quotation.sent', 'quotation', q.doc_no, { total: Number(q.total), validUntil: q.valid_until }, requestId);
            return this.loadQuote(c, u.companyId, id);
        });
    }
    /** Keputusan pelanggan atas penawaran terkirim. Diterima hanya dalam masa berlaku. */
    async decideQuote(u, s, id, accept, note, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const q = await this.quoteRow(c, u.companyId, id, true);
            if (q.status !== 'terkirim')
                throw (0, errors_js_1.conflict)('QUOTE_NOT_SENT', `${q.doc_no} belum terkirim atau sudah diputus.`);
            if (accept && q.valid_until < (0, sales_shared_js_1.todayWib)())
                throw (0, sales_shared_js_1.invalid)('QUOTE_EXPIRED', `Masa berlaku ${q.doc_no} lewat (${q.valid_until}); perpanjang dengan persetujuan pelanggan lalu catat ulang.`);
            if (!accept && (!note || note.trim().length < 3))
                throw (0, sales_shared_js_1.invalid)('REASON_REQUIRED', 'Penolakan penawaran wajib diberi alasan.');
            await c.query(`UPDATE quotations SET status = $2, decided_at = now(), decided_by_name = $3, decision_note = $4, updated_at = now() WHERE id = $1`, [id, accept ? 'diterima' : 'ditolak', u.name, note ?? null]);
            if (q.opportunity_id) {
                const opp = await this.oppRow(c, u.companyId, q.opportunity_id, true);
                if (accept && !(0, domain_1.isClosedStage)(opp.stage))
                    await c.query(`UPDATE opportunities SET stage = 'negosiasi', probability = greatest(probability, 90), updated_at = now() WHERE id = $1`, [opp.id]);
                await this.activity(c, u, opp, 'catatan', `Penawaran ${q.doc_no} ${accept ? 'diterima pelanggan' : `ditolak pelanggan — ${note}`}`);
            }
            await this.rec(c, u, (0, sales_shared_js_1.trimBranch)(q.branch_code), accept ? 'quotation.accepted' : 'quotation.rejected', 'quotation', q.doc_no, { note }, requestId);
            return this.loadQuote(c, u.companyId, id);
        });
    }
    /** Penawaran diterima → pesanan penjualan (plafon kredit & persetujuan biasa); peluang menang. */
    async quoteToOrder(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const q = await this.quoteRow(c, u.companyId, id, true);
            if (q.status !== 'diterima')
                throw (0, errors_js_1.conflict)('QUOTE_NOT_ACCEPTED', `${q.doc_no} berstatus ${Q_LABEL[q.status]}; hanya penawaran diterima yang menjadi pesanan.`);
            if (q.sales_order_id && q.so_status !== 'batal')
                throw (0, errors_js_1.conflict)('QUOTE_HAS_ORDER', `${q.doc_no} sudah menjadi ${q.so_no}.`);
            const branch = (0, sales_shared_js_1.trimBranch)(q.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, s, branch);
            const lines = (await c.query('SELECT * FROM quotation_lines WHERE quotation_id = $1 ORDER BY line_no', [id])).rows;
            const orderId = await this.orders.createIn(c, u, branch, {
                customerId: q.customer_id, orderDate: b.orderDate, deliveryDate: b.deliveryDate ?? undefined, submit: true, quotationId: id,
                notes: `Dari penawaran ${q.doc_no}${q.opp_code ? ` / ${q.opp_code}` : ''}`,
                lines: lines.map((l) => ({ productId: l.product_id, description: l.description, kind: l.kind, unit: l.unit, qty: Number(l.qty), price: Number(l.price), discPct: Number(l.disc_pct) })),
            }, requestId);
            const so = (await c.query('SELECT doc_no, total, status FROM sales_orders WHERE id = $1', [orderId])).rows[0];
            await c.query('UPDATE quotations SET sales_order_id = $2, updated_at = now() WHERE id = $1', [id, orderId]);
            if (q.opportunity_id) {
                const opp = await this.oppRow(c, u.companyId, q.opportunity_id, true);
                if (!(0, domain_1.isClosedStage)(opp.stage)) {
                    await c.query(`UPDATE opportunities SET stage = 'menang', probability = 100, value = $2, closed_at = now(), next_action = 'Proses pesanan ' || $3, next_action_date = NULL, updated_at = now() WHERE id = $1`, [opp.id, Number(q.net_amount), so.doc_no]);
                    await this.activity(c, u, opp, 'tahap', `Tahap ${opp.stage} → menang: penawaran ${q.doc_no} menjadi ${so.doc_no}`);
                    await this.rec(c, u, branch, 'opportunity.won', 'opportunity', opp.code, { quotation: q.doc_no, order: so.doc_no, value: Number(q.net_amount) }, requestId);
                }
            }
            await this.rec(c, u, branch, 'quotation.ordered', 'quotation', q.doc_no, { order: so.doc_no, orderStatus: so.status, total: Number(so.total) }, requestId);
            return this.orders.loadIn(c, u.companyId, orderId);
        });
    }
    async cancelQuote(u, s, id, reason, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const q = await this.quoteRow(c, u.companyId, id, true);
            if (!['draf', 'terkirim'].includes(q.status))
                throw (0, errors_js_1.conflict)('QUOTE_LOCKED', `${q.doc_no} berstatus ${Q_LABEL[q.status]} dan tidak dapat dibatalkan.`);
            await c.query(`UPDATE quotations SET status = 'batal', decision_note = $2, updated_at = now() WHERE id = $1`, [id, reason]);
            await this.rec(c, u, (0, sales_shared_js_1.trimBranch)(q.branch_code), 'quotation.cancelled', 'quotation', q.doc_no, { reason }, requestId);
            return this.loadQuote(c, u.companyId, id);
        });
    }
};
exports.CrmService = CrmService;
exports.CrmService = CrmService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService, orders_service_js_1.OrdersService])
], CrmService);
//# sourceMappingURL=crm.service.js.map