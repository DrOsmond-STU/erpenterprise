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
exports.LeadsService = void 0;
/**
 * Prospek (lead) & kampanye. Lead dikualifikasi lalu dikonversi menjadi pelanggan (baru
 * atau yang ada) + kontak utama + peluang di pipeline. Kampanye mengukur lead, peluang,
 * nilai menang, dan biaya aktual = tagihan pemasok bertanda kampanye yang sudah diposting.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const mapLead = (l) => ({
    id: l.id, code: l.code, branch: (0, sales_shared_js_1.trimBranch)(l.branch_code), name: l.name, companyName: l.company_name, title: l.title, phone: l.phone, email: l.email, city: l.city,
    source: l.source, campaignId: l.campaign_id, campaignName: l.campaign_name ?? null, status: l.status, ownerName: l.owner_name, estimatedValue: Number(l.estimated_value), notes: l.notes,
    disqualifyReason: l.disqualify_reason, convertedCustomerId: l.converted_customer_id, convertedCustomerName: l.customer_name ?? null, convertedOpportunityId: l.converted_opportunity_id,
    convertedOpportunityCode: l.opp_code ?? null, convertedAt: l.converted_at, activityCount: l.activity_count ?? 0, createdByName: l.created_by_name, createdAt: l.created_at, updatedAt: l.updated_at,
    score: (0, domain_1.leadScore)({ email: l.email, phone: l.phone, companyName: l.company_name, source: l.source, campaignId: l.campaign_id, estimatedValue: Number(l.estimated_value), status: l.status, activities: l.activity_count ?? 0 }),
});
const LEAD_SELECT = `SELECT l.*, c.name AS campaign_name, cu.name AS customer_name, o.code AS opp_code,
  (SELECT count(*)::int FROM crm_activities a WHERE a.lead_id = l.id) AS activity_count
  FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id LEFT JOIN customers cu ON cu.id = l.converted_customer_id LEFT JOIN opportunities o ON o.id = l.converted_opportunity_id`;
let LeadsService = class LeadsService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    rec(c, u, branch, action, entityType, entityId, after, requestId) {
        return this.audit.record(c, { companyId: u.companyId, branchCode: branch ?? undefined, userId: u.id, sessionId: u.sessionId, action, entityType, entityId, after, requestId });
    }
    /* ------------------------------ Lead ------------------------------ */
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const rows = (await c.query(`${LEAD_SELECT} WHERE l.company_id = $1 AND ($2::text IS NULL OR l.branch_code = $2) ORDER BY l.created_at DESC LIMIT 5000`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows.map(mapLead);
            const by = (k) => rows.filter((r) => r.status === k).length;
            const closed = by('dikonversi') + by('diskualifikasi');
            return { rows, summary: { total: rows.length, open: rows.length - closed, converted: by('dikonversi'), disqualified: by('diskualifikasi'), conversionRate: closed ? Math.round((by('dikonversi') / closed) * 1000) / 10 : 0,
                    bySource: Object.entries(rows.reduce((m, r) => { m[r.source] = (m[r.source] ?? 0) + 1; return m; }, {})).map(([source, count]) => ({ source, count })) } };
        });
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Lead');
        if (lock)
            await c.query('SELECT 1 FROM leads WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
        const l = (await c.query(`${LEAD_SELECT} WHERE l.company_id = $1 AND l.id = $2`, [companyId, id])).rows[0];
        if (!l)
            throw (0, errors_js_1.notFound)('Lead');
        return l;
    }
    async load(c, companyId, id) {
        const l = await this.row(c, companyId, id);
        return { ...mapLead(l), timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'lead', l.code) };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    async campaign(c, companyId, id) {
        if (!id)
            return null;
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, sales_shared_js_1.invalid)('CAMPAIGN_UNKNOWN', 'Kampanye tidak dikenal.');
        const r = (await c.query('SELECT id, status, name FROM campaigns WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
        if (!r)
            throw (0, sales_shared_js_1.invalid)('CAMPAIGN_UNKNOWN', 'Kampanye tidak dikenal.');
        return r;
    }
    async create(u, s, b, requestId) {
        const branch = String(b.branch ?? (s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
        if (!/^[A-Z]{3}$/.test(branch))
            throw (0, sales_shared_js_1.invalid)('BRANCH_REQUIRED', 'Pilih cabang lead.');
        (0, sales_shared_js_1.assertBranch)(u, s, branch);
        if (!b.name?.trim())
            throw (0, sales_shared_js_1.invalid)('LEAD_NAME', 'Isi nama kontak lead.');
        if (!b.phone?.trim() && !b.email?.trim())
            throw (0, sales_shared_js_1.invalid)('LEAD_CONTACT', 'Isi minimal telepon atau email lead.');
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const camp = await this.campaign(c, u.companyId, b.campaignId);
            /* Cegah duplikasi: email/telepon yang sama pada lead terbuka. */
            const dup = (await c.query(`SELECT code FROM leads WHERE company_id = $1 AND status NOT IN ('dikonversi','diskualifikasi') AND ((lower(email) = lower($2) AND $2 <> '') OR (phone = $3 AND $3 <> '')) LIMIT 1`, [u.companyId, b.email?.trim() ?? '', b.phone?.trim() ?? ''])).rows[0];
            if (dup)
                throw (0, errors_js_1.conflict)('LEAD_DUPLICATE', `Kontak ini sudah tercatat sebagai lead ${dup.code}.`);
            const code = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'LEAD', Number((0, sales_shared_js_1.todayWib)().slice(0, 4)));
            const l = (await c.query(`INSERT INTO leads (company_id, branch_code, code, name, company_name, title, phone, email, city, source, campaign_id, owner_name, estimated_value, notes, created_by, created_by_name, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now()) RETURNING id`, [u.companyId, branch, code, b.name.trim(), b.companyName?.trim() || null, b.title ?? null, b.phone?.trim() || null, b.email?.trim() || null, b.city ?? null,
                b.source ?? 'Lainnya', camp?.id ?? null, b.ownerName?.trim() || u.name, b.estimatedValue ?? 0, b.notes ?? null, u.id, u.name])).rows[0];
            await this.rec(c, u, branch, 'lead.created', 'lead', code, { name: b.name, company: b.companyName, source: b.source }, requestId);
            return this.load(c, u.companyId, l.id);
        });
    }
    async update(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const l = await this.row(c, u.companyId, id, true);
            if (l.status === 'dikonversi')
                throw (0, errors_js_1.conflict)('LEAD_CONVERTED', `${l.code} sudah dikonversi.`);
            const camp = b.campaignId !== undefined ? await this.campaign(c, u.companyId, b.campaignId) : undefined;
            await c.query(`UPDATE leads SET name = coalesce($2, name), company_name = coalesce($3, company_name), title = coalesce($4, title), phone = coalesce($5, phone), email = coalesce($6, email),
            city = coalesce($7, city), source = coalesce($8, source), campaign_id = CASE WHEN $9::boolean THEN $10 ELSE campaign_id END, owner_name = coalesce($11, owner_name),
            estimated_value = coalesce($12, estimated_value), notes = coalesce($13, notes), updated_at = now() WHERE id = $1`, [id, b.name?.trim() || null, b.companyName?.trim() || null, b.title ?? null, b.phone?.trim() || null, b.email?.trim() || null, b.city ?? null, b.source ?? null,
                camp !== undefined, camp?.id ?? null, b.ownerName?.trim() || null, b.estimatedValue ?? null, b.notes ?? null]);
            await this.rec(c, u, (0, sales_shared_js_1.trimBranch)(l.branch_code), 'lead.updated', 'lead', l.code, {}, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    /** Status manual: baru → dihubungi → kualifikasi; diskualifikasi wajib beralasan; diskualifikasi dapat diaktifkan kembali. */
    async setStatus(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const l = await this.row(c, u.companyId, id, true);
            if (l.status === 'dikonversi')
                throw (0, errors_js_1.conflict)('LEAD_CONVERTED', `${l.code} sudah dikonversi.`);
            if (b.status === 'dikonversi')
                throw (0, sales_shared_js_1.invalid)('LEAD_STATUS', 'Gunakan konversi untuk menjadikan lead pelanggan & peluang.');
            if (b.status === 'diskualifikasi' && (b.reason ?? '').trim().length < 5)
                throw (0, sales_shared_js_1.invalid)('REASON_REQUIRED', 'Diskualifikasi lead wajib diberi alasan (minimal 5 karakter).');
            await c.query(`UPDATE leads SET status = $2, disqualify_reason = CASE WHEN $2 = 'diskualifikasi' THEN $3 ELSE NULL END, updated_at = now() WHERE id = $1`, [id, b.status, b.reason ?? null]);
            await this.rec(c, u, (0, sales_shared_js_1.trimBranch)(l.branch_code), 'lead.status_changed', 'lead', l.code, { from: l.status, to: b.status, reason: b.reason ?? undefined }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    /** Konversi: pelanggan (ada / baru) + kontak utama + peluang tahap kualifikasi. */
    async convert(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const l = await this.row(c, u.companyId, id, true);
            const errs = (0, domain_1.leadConvertProblems)(l.status);
            if (errs.length)
                throw (0, sales_shared_js_1.invalid)('LEAD_CONVERT', errs[0], errs);
            const branch = (0, sales_shared_js_1.trimBranch)(l.branch_code);
            (0, sales_shared_js_1.assertBranch)(u, s, branch);
            let cust = null;
            if (b.customerId) {
                if (!sales_shared_js_1.UUID.test(b.customerId))
                    throw (0, sales_shared_js_1.invalid)('CUSTOMER_UNKNOWN', 'Pelanggan tidak dikenal.');
                cust = (await c.query('SELECT * FROM customers WHERE company_id = $1 AND id = $2', [u.companyId, b.customerId])).rows[0];
                if (!cust)
                    throw (0, sales_shared_js_1.invalid)('CUSTOMER_UNKNOWN', 'Pelanggan tidak dikenal.');
            }
            else if (b.newCustomer) {
                if (!u.permissions.has('sales.customer.manage'))
                    throw new errors_js_1.DomainError('FORBIDDEN', 'Membuat pelanggan baru memerlukan izin kelola pelanggan; pilih pelanggan yang sudah ada atau minta manajer.', common_1.HttpStatus.FORBIDDEN);
                const name = (b.newCustomer.name?.trim() || l.company_name || l.name).slice(0, 160);
                const dup = (await c.query('SELECT code FROM customers WHERE company_id = $1 AND lower(name) = lower($2)', [u.companyId, name])).rows[0];
                if (dup)
                    throw (0, errors_js_1.conflict)('CUSTOMER_EXISTS', `Pelanggan "${name}" sudah terdaftar (${dup.code}); pilih pelanggan itu.`);
                const n = (await c.query(`SELECT next_doc_no($1, 'CUST', 0) AS n`, [u.companyId])).rows[0].n;
                const code = `CUST-${String(n).padStart(4, '0')}`;
                /* Plafon kredit bawaan 0: pesanan pertama otomatis menunggu persetujuan manajer sampai plafon ditetapkan. */
                cust = (await c.query(`INSERT INTO customers (company_id, code, name, segment, pic, phone, email, city, branch_code, credit_limit, terms_days, status, account_manager, lead_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'aktif',$12,$13) RETURNING *`, [u.companyId, code, name, b.newCustomer.segment ?? 'Langsung', l.name, l.phone, l.email, b.newCustomer.city ?? l.city, branch, b.newCustomer.creditLimit ?? 0,
                    b.newCustomer.termsDays ?? 30, l.owner_name, l.id])).rows[0];
                await this.rec(c, u, branch, 'customer.created', 'customer', code, { name, fromLead: l.code, creditLimit: b.newCustomer.creditLimit ?? 0 }, requestId);
            }
            if (cust) {
                const hasPrimary = (await c.query(`SELECT 1 FROM contacts WHERE company_id = $1 AND party_type = 'customer' AND party_id = $2 AND is_primary AND status = 'aktif'`, [u.companyId, cust.id])).rowCount;
                const same = (await c.query(`SELECT 1 FROM contacts WHERE company_id = $1 AND party_type = 'customer' AND party_id = $2 AND lower(name) = lower($3)`, [u.companyId, cust.id, l.name])).rowCount;
                if (!same)
                    await c.query(`INSERT INTO contacts (company_id, party_type, party_id, name, title, phone, email, is_primary, created_by_name) VALUES ($1,'customer',$2,$3,$4,$5,$6,$7,$8)`, [u.companyId, cust.id, l.name, l.title, l.phone, l.email, !hasPrimary, u.name]);
            }
            const year = Number((0, sales_shared_js_1.todayWib)().slice(0, 4));
            const oppCode = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'OPP', year);
            const opp = (await c.query(`INSERT INTO opportunities (company_id, branch_code, code, name, customer_id, company_name, contact_name, contact_phone, contact_email, value, stage, probability, source, owner_name, expected_close, lead_id, campaign_id, created_by, created_by_name, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'kualifikasi',$11,$12,$13,$14,$15,$16,$17,$18,now()) RETURNING *`, [u.companyId, branch, oppCode, (b.opportunityName?.trim() || `Peluang ${l.company_name ?? l.name}`).slice(0, 200), cust?.id ?? null, cust?.name ?? l.company_name ?? l.name,
                l.name, l.phone, l.email, b.value ?? Number(l.estimated_value), (0, domain_1.probabilityFor)('kualifikasi'), l.source, l.owner_name, b.expectedClose ?? null, l.id, l.campaign_id, u.id, u.name])).rows[0];
            await c.query('INSERT INTO opportunity_activities (opportunity_id, company_id, branch_code, kind, note, by_user, by_name) VALUES ($1,$2,$3,$4,$5,$6,$7)', [opp.id, u.companyId, branch, 'tahap', `Dibuat dari konversi lead ${l.code}`, u.id, u.name]);
            /* Riwayat aktivitas lead ikut tampil di pelanggan & peluang baru. */
            await c.query('UPDATE crm_activities SET customer_id = coalesce(customer_id, $2), opportunity_id = coalesce(opportunity_id, $3) WHERE company_id = $1 AND lead_id = $4', [u.companyId, cust?.id ?? null, opp.id, l.id]);
            await c.query(`UPDATE leads SET status = 'dikonversi', converted_customer_id = $2, converted_opportunity_id = $3, converted_at = now(), updated_at = now() WHERE id = $1`, [id, cust?.id ?? null, opp.id]);
            await this.rec(c, u, branch, 'lead.converted', 'lead', l.code, { customer: cust?.code ?? null, opportunity: oppCode }, requestId);
            await this.rec(c, u, branch, 'opportunity.created', 'opportunity', oppCode, { fromLead: l.code, value: Number(opp.value) }, requestId);
            return this.load(c, u.companyId, id);
        });
    }
    /* ------------------------------ Kampanye ------------------------------ */
    async campaignStats(c, companyId, ids) {
        const rows = (await c.query(`SELECT k.id,
         (SELECT count(*)::int FROM leads l WHERE l.campaign_id = k.id) AS leads,
         (SELECT count(*)::int FROM leads l WHERE l.campaign_id = k.id AND l.status = 'dikonversi') AS converted,
         (SELECT count(*)::int FROM opportunities o WHERE o.campaign_id = k.id) AS opps,
         (SELECT coalesce(sum(o.value), 0)::bigint FROM opportunities o WHERE o.campaign_id = k.id AND o.stage = 'menang') AS won_value,
         (SELECT coalesce(sum(o.value * o.probability / 100), 0)::bigint FROM opportunities o WHERE o.campaign_id = k.id AND o.stage NOT IN ('menang','kalah')) AS pipeline,
         (SELECT coalesce(sum(a.net_amount), 0)::bigint FROM ap_invoices a WHERE a.campaign_id = k.id AND a.status NOT IN ('draf','batal')) AS spend
       FROM campaigns k WHERE k.company_id = $1 ${ids ? 'AND k.id = ANY($2::uuid[])' : ''}`, ids ? [companyId, ids] : [companyId])).rows;
        return new Map(rows.map((r) => [r.id, { leads: r.leads, converted: r.converted, opportunities: r.opps, wonValue: Number(r.won_value), pipeline: Number(r.pipeline), spend: Number(r.spend) }]));
    }
    mapCampaign(k, st) {
        const spend = st?.spend ?? 0;
        return {
            id: k.id, code: k.code, name: k.name, channel: k.channel, startDate: k.start_date, endDate: k.end_date, budget: Number(k.budget), status: k.status, notes: k.notes, createdByName: k.created_by_name,
            ...(st ?? { leads: 0, converted: 0, opportunities: 0, wonValue: 0, pipeline: 0, spend: 0 }),
            budgetUsed: Number(k.budget) > 0 ? Math.round((spend / Number(k.budget)) * 1000) / 10 : 0,
            costPerLead: st?.leads ? Math.round(spend / st.leads) : 0,
            roi: spend > 0 ? Math.round((((st?.wonValue ?? 0) - spend) / spend) * 1000) / 10 : null,
        };
    }
    async listCampaigns(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
            const rows = (await c.query('SELECT * FROM campaigns WHERE company_id = $1 ORDER BY start_date DESC, code DESC', [u.companyId])).rows;
            const st = await this.campaignStats(c, u.companyId);
            return rows.map((k) => this.mapCampaign(k, st.get(k.id)));
        });
    }
    async getCampaign(u, s, id, requestId) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Kampanye');
        return this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
            const k = (await c.query('SELECT * FROM campaigns WHERE company_id = $1 AND id = $2', [u.companyId, id])).rows[0];
            if (!k)
                throw (0, errors_js_1.notFound)('Kampanye');
            const st = await this.campaignStats(c, u.companyId, [id]);
            const leads = (await c.query(`${LEAD_SELECT} WHERE l.company_id = $1 AND l.campaign_id = $2 ORDER BY l.created_at DESC`, [u.companyId, id])).rows.map(mapLead);
            const invoices = (await c.query(`SELECT id, doc_no, supplier_name, invoice_date, net_amount, status FROM ap_invoices WHERE company_id = $1 AND campaign_id = $2 ORDER BY invoice_date DESC`, [u.companyId, id])).rows
                .map((i) => ({ id: i.id, docNo: i.doc_no, supplierName: i.supplier_name, date: i.invoice_date, net: Number(i.net_amount), status: i.status }));
            const opps = (await c.query('SELECT id, code, name, company_name, value, stage, probability FROM opportunities WHERE company_id = $1 AND campaign_id = $2 ORDER BY created_at DESC', [u.companyId, id])).rows
                .map((o) => ({ id: o.id, code: o.code, name: o.name, companyName: o.company_name, value: Number(o.value), stage: o.stage, probability: o.probability }));
            return { ...this.mapCampaign(k, st.get(id)), leadList: leads, invoices, opportunityList: opps, timeline: await (0, sales_shared_js_1.auditTrail)(c, u.companyId, 'campaign', k.code) };
        });
    }
    async createCampaign(u, s, b, requestId) {
        if (!b.name?.trim() || !b.startDate || !b.endDate)
            throw (0, sales_shared_js_1.invalid)('CAMPAIGN_REQUIRED', 'Nama, tanggal mulai & selesai kampanye wajib diisi.');
        if (b.endDate < b.startDate)
            throw (0, sales_shared_js_1.invalid)('CAMPAIGN_DATES', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
        return this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
            const code = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'CMP', Number(b.startDate.slice(0, 4)), 3);
            const k = (await c.query(`INSERT INTO campaigns (company_id, code, name, channel, start_date, end_date, budget, status, notes, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [u.companyId, code, b.name.trim(), b.channel ?? 'Lainnya', b.startDate, b.endDate, b.budget ?? 0, b.status ?? 'rencana', b.notes ?? null, u.id, u.name])).rows[0];
            await this.rec(c, u, null, 'campaign.created', 'campaign', code, { name: b.name, budget: b.budget ?? 0 }, requestId);
            return this.getCampaignIn(c, u, k.id);
        });
    }
    async getCampaignIn(c, u, id) {
        const k = (await c.query('SELECT * FROM campaigns WHERE id = $1', [id])).rows[0];
        return this.mapCampaign(k, (await this.campaignStats(c, u.companyId, [id])).get(id));
    }
    async updateCampaign(u, s, id, b, requestId) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Kampanye');
        return this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
            const k = (await c.query('SELECT * FROM campaigns WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, id])).rows[0];
            if (!k)
                throw (0, errors_js_1.notFound)('Kampanye');
            const start = b.startDate ?? k.start_date, end = b.endDate ?? k.end_date;
            if (end < start)
                throw (0, sales_shared_js_1.invalid)('CAMPAIGN_DATES', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
            await c.query(`UPDATE campaigns SET name = coalesce($2, name), channel = coalesce($3, channel), start_date = $4, end_date = $5, budget = coalesce($6, budget), status = coalesce($7, status), notes = coalesce($8, notes), updated_at = now() WHERE id = $1`, [id, b.name?.trim() || null, b.channel ?? null, start, end, b.budget ?? null, b.status ?? null, b.notes ?? null]);
            await this.rec(c, u, null, 'campaign.updated', 'campaign', k.code, { status: b.status ?? k.status, budget: b.budget ?? Number(k.budget) }, requestId);
            return this.getCampaignIn(c, u, id);
        });
    }
};
exports.LeadsService = LeadsService;
exports.LeadsService = LeadsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], LeadsService);
//# sourceMappingURL=leads.service.js.map