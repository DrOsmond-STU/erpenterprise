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
exports.ProjectsService = void 0;
/**
 * Proyek (dok. 07 §9.1): register proyek dengan tugas (Gantt), kemajuan tertimbang,
 * dan biaya/pendapatan aktual dari baris jurnal bertanda proyek (dimensi
 * journal_lines.project_id — jurnal memorial & tagihan pemasok atas PO proyek).
 * Kesehatan: aktual > anggaran → merah; serapan > 85% saat kemajuan < 80% → kuning.
 */
const common_1 = require("@nestjs/common");
const domain_1 = require("@erp/domain");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const STATUS_LABEL = { perencanaan: 'Perencanaan', berjalan: 'Berjalan', ditunda: 'Ditunda', selesai: 'Selesai', batal: 'Batal' };
/* Biaya = beban & aset (belanja modal) bertanda proyek; pendapatan = akun pendapatan bertanda proyek. */
const ACTUALS = `SELECT l.project_id,
    coalesce(sum(CASE WHEN a.category IN ('Beban','Aset') THEN l.debit - l.credit END), 0)::bigint AS cost,
    coalesce(sum(CASE WHEN a.category = 'Pendapatan' THEN l.credit - l.debit END), 0)::bigint AS revenue
  FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN chart_of_accounts a ON a.company_id = l.company_id AND a.code = l.account_code
  WHERE l.company_id = $1 AND l.project_id IS NOT NULL AND j.status IN ('posted','reversed')`;
const mapProject = (p, tasks = [], act) => {
    const progress = (0, domain_1.projectProgress)(tasks.map((t) => ({ progress: t.progress, weight: Number(t.weight) })), p.manual_progress);
    const actual = act?.cost ?? 0;
    return {
        id: p.id, code: p.code, branch: (0, sales_shared_js_1.trimBranch)(p.branch_code), name: p.name, customerId: p.customer_id, customerName: p.customer_name, pmName: p.pm_name,
        budget: Number(p.budget), contractValue: Number(p.contract_value), startDate: p.start_date, endDate: p.end_date, status: p.status, statusLabel: STATUS_LABEL[p.status] ?? p.status,
        manualProgress: p.manual_progress, notes: p.notes, progress, actual, revenue: act?.revenue ?? 0, margin: (act?.revenue ?? 0) - actual,
        absorption: Number(p.budget) > 0 ? Math.round((actual / Number(p.budget)) * 1000) / 10 : 0, health: (0, domain_1.projectHealth)(Number(p.budget), actual, progress),
        overdue: !['selesai', 'batal'].includes(p.status) && p.end_date < (0, sales_shared_js_1.todayWib)(), taskCount: tasks.length, createdByName: p.created_by_name, createdAt: p.created_at,
    };
};
const mapTask = (t) => ({ id: Number(t.id), lineNo: t.line_no, name: t.name, startDate: t.start_date, endDate: t.end_date, progress: t.progress, weight: Number(t.weight), assignee: t.assignee });
let ProjectsService = class ProjectsService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    async actuals(c, companyId, ids) {
        const rows = (await c.query(`${ACTUALS} ${ids ? 'AND l.project_id = ANY($2::uuid[])' : ''} GROUP BY l.project_id`, ids ? [companyId, ids] : [companyId])).rows;
        return new Map(rows.map((r) => [r.project_id, { cost: Number(r.cost), revenue: Number(r.revenue) }]));
    }
    async list(u, s, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const ps = (await c.query(`SELECT * FROM projects WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) ORDER BY start_date DESC, code DESC`, [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows;
            const tasks = (await c.query('SELECT * FROM project_tasks WHERE company_id = $1 ORDER BY line_no', [u.companyId])).rows;
            const act = await this.actuals(c, u.companyId);
            return ps.map((p) => mapProject(p, tasks.filter((t) => t.project_id === p.id), act.get(p.id)));
        });
    }
    /** Proyek aktif untuk pilihan dimensi pada jurnal / PR / PO (cabang tertentu). */
    async options(u, s, branch, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => (await c.query(`SELECT id, code, name, trim(branch_code) AS branch, status FROM projects WHERE company_id = $1 AND status IN ('perencanaan','berjalan','ditunda')
                       AND ($2::text IS NULL OR branch_code = $2) ORDER BY code`, [u.companyId, branch ?? (s.branch === 'ALL' ? null : s.branch)])).rows);
    }
    async row(c, companyId, id, lock = false) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Proyek');
        const p = (await c.query(`SELECT * FROM projects WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
        if (!p)
            throw (0, errors_js_1.notFound)('Proyek');
        return p;
    }
    async load(c, companyId, id) {
        const p = await this.row(c, companyId, id);
        const tasks = (await c.query('SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY line_no', [id])).rows;
        const act = await this.actuals(c, companyId, [id]);
        const byAccount = (await c.query(`SELECT l.account_code, a.name, a.category, sum(l.debit)::bigint AS d, sum(l.credit)::bigint AS c FROM journal_lines l JOIN journals j ON j.id = l.journal_id
         JOIN chart_of_accounts a ON a.company_id = l.company_id AND a.code = l.account_code
        WHERE l.company_id = $1 AND l.project_id = $2 AND j.status IN ('posted','reversed') GROUP BY 1, 2, 3 ORDER BY 1`, [companyId, id])).rows
            .map((r) => ({ account: r.account_code, name: r.name, category: r.category, amount: ['Beban', 'Aset'].includes(r.category) ? Number(r.d) - Number(r.c) : Number(r.c) - Number(r.d) }));
        const entries = (await c.query(`SELECT j.id AS journal_id, j.journal_no, j.journal_date, j.description, j.source_type, l.account_code, l.debit, l.credit, l.memo FROM journal_lines l JOIN journals j ON j.id = l.journal_id
        WHERE l.company_id = $1 AND l.project_id = $2 AND j.status IN ('posted','reversed') ORDER BY j.journal_date DESC, j.journal_no DESC, l.line_no LIMIT 100`, [companyId, id])).rows
            .map((r) => ({ journalId: r.journal_id, journalNo: r.journal_no, date: r.journal_date, description: r.description, source: r.source_type, account: r.account_code, debit: Number(r.debit), credit: Number(r.credit), memo: r.memo }));
        const pending = Number((await c.query(`SELECT count(*) FROM journal_lines l JOIN journals j ON j.id = l.journal_id WHERE l.company_id = $1 AND l.project_id = $2 AND j.status = 'pending'`, [companyId, id])).rows[0].count);
        const orders = (await c.query(`SELECT id, doc_no, order_date, total, status FROM purchase_orders WHERE company_id = $1 AND project_id = $2 ORDER BY order_date DESC LIMIT 50`, [companyId, id])).rows
            .map((o) => ({ id: o.id, docNo: o.doc_no, date: o.order_date, total: Number(o.total), status: o.status }));
        return { ...mapProject(p, tasks, act.get(id)), tasks: tasks.map(mapTask), byAccount, entries, pendingJournalLines: pending, orders, timeline: await (0, sales_shared_js_1.auditTrail)(c, companyId, 'project', p.code) };
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), (c) => this.load(c, u.companyId, id));
    }
    checkTasks(tasks, start, end) {
        const errs = [];
        tasks.forEach((t, i) => {
            if (!t.name?.trim())
                errs.push(`Tugas ${i + 1}: nama wajib diisi.`);
            if (t.endDate < t.startDate)
                errs.push(`Tugas ${i + 1}: tanggal selesai sebelum tanggal mulai.`);
            if (t.startDate < start || t.endDate > end)
                errs.push(`Tugas ${i + 1} (${t.name}): di luar rentang proyek ${start} s.d. ${end}.`);
        });
        if (errs.length)
            throw (0, sales_shared_js_1.invalid)('PROJECT_TASKS_INVALID', errs[0], errs);
    }
    async writeTasks(c, p, tasks) {
        await c.query('DELETE FROM project_tasks WHERE project_id = $1', [p.id]);
        let n = 0;
        for (const t of tasks) {
            n += 1;
            await c.query('INSERT INTO project_tasks (project_id, company_id, branch_code, line_no, name, start_date, end_date, progress, weight, assignee) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [p.id, p.company_id, p.branch_code, n, t.name.trim(), t.startDate, t.endDate, t.progress ?? 0, t.weight ?? 1, t.assignee ?? null]);
        }
    }
    async customer(c, companyId, id, name) {
        if (!id)
            return { id: null, name: name?.trim() || 'Internal' };
        const r = (await c.query('SELECT id, name FROM customers WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
        if (!r)
            throw (0, sales_shared_js_1.invalid)('CUSTOMER_UNKNOWN', 'Pelanggan tidak dikenal.');
        return r;
    }
    async create(u, s, b, requestId) {
        const branch = String(b.branch ?? (s.branch === 'ALL' ? '' : s.branch)).toUpperCase();
        if (!/^[A-Z]{3}$/.test(branch))
            throw (0, sales_shared_js_1.invalid)('BRANCH_REQUIRED', 'Pilih cabang proyek.');
        (0, sales_shared_js_1.assertBranch)(u, s, branch);
        if (!b.name?.trim() || !b.startDate || !b.endDate || !b.pmName?.trim())
            throw (0, sales_shared_js_1.invalid)('PROJECT_REQUIRED', 'Nama, manajer proyek, tanggal mulai & selesai wajib diisi.');
        if (b.endDate < b.startDate)
            throw (0, sales_shared_js_1.invalid)('PROJECT_DATES', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
        this.checkTasks(b.tasks ?? [], b.startDate, b.endDate);
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const cust = await this.customer(c, u.companyId, b.customerId, b.customerName);
            const code = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'PRJ', Number(b.startDate.slice(0, 4)), 3);
            const p = (await c.query(`INSERT INTO projects (company_id, branch_code, code, name, customer_id, customer_name, pm_name, budget, contract_value, start_date, end_date, status, manual_progress, notes, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, [u.companyId, branch, code, b.name.trim(), cust.id, cust.name, b.pmName.trim(), b.budget ?? 0, b.contractValue ?? 0, b.startDate, b.endDate, b.status ?? 'perencanaan', b.manualProgress ?? null, b.notes ?? null, u.id, u.name])).rows[0];
            await this.writeTasks(c, p, b.tasks ?? []);
            await this.audit.record(c, { companyId: u.companyId, branchCode: branch, userId: u.id, sessionId: u.sessionId, action: 'project.created', entityType: 'project', entityId: code, after: { name: p.name, budget: b.budget ?? 0, tasks: b.tasks?.length ?? 0 }, requestId });
            return this.load(c, u.companyId, p.id);
        });
    }
    async update(u, s, id, b, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, s, requestId), async (c) => {
            const p = await this.row(c, u.companyId, id, true);
            if (['selesai', 'batal'].includes(p.status) && (!b.status || b.status === p.status))
                throw (0, errors_js_1.conflict)('PROJECT_CLOSED', `Proyek ${p.code} berstatus ${STATUS_LABEL[p.status]}; ubah status untuk membukanya kembali.`);
            const start = b.startDate ?? p.start_date, end = b.endDate ?? p.end_date;
            if (end < start)
                throw (0, sales_shared_js_1.invalid)('PROJECT_DATES', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
            if (b.tasks)
                this.checkTasks(b.tasks, start, end);
            if (b.status === 'batal') {
                const used = Number((await c.query('SELECT count(*) FROM journal_lines WHERE company_id = $1 AND project_id = $2', [u.companyId, id])).rows[0].count);
                if (used)
                    throw (0, errors_js_1.conflict)('PROJECT_HAS_ENTRIES', `Proyek ${p.code} sudah memiliki ${used} baris jurnal; tutup sebagai selesai, bukan batal.`);
            }
            const cust = b.customerId !== undefined || b.customerName !== undefined ? await this.customer(c, u.companyId, b.customerId, b.customerName) : { id: p.customer_id, name: p.customer_name };
            await c.query(`UPDATE projects SET name = coalesce($2, name), customer_id = $3, customer_name = $4, pm_name = coalesce($5, pm_name), budget = coalesce($6, budget), contract_value = coalesce($7, contract_value),
            start_date = $8, end_date = $9, status = coalesce($10, status), manual_progress = $11, notes = coalesce($12, notes), updated_at = now() WHERE id = $1`, [id, b.name?.trim() || null, cust.id, cust.name, b.pmName?.trim() || null, b.budget ?? null, b.contractValue ?? null, start, end, b.status ?? null,
                b.manualProgress === undefined ? p.manual_progress : b.manualProgress, b.notes ?? null]);
            if (b.tasks)
                await this.writeTasks(c, p, b.tasks);
            await this.audit.record(c, { companyId: u.companyId, branchCode: (0, sales_shared_js_1.trimBranch)(p.branch_code), userId: u.id, sessionId: u.sessionId, action: b.status && b.status !== p.status ? 'project.status_changed' : 'project.updated',
                entityType: 'project', entityId: p.code, before: { status: p.status, budget: Number(p.budget) }, after: { status: b.status ?? p.status, budget: b.budget ?? Number(p.budget), tasks: b.tasks?.length }, requestId });
            return this.load(c, u.companyId, id);
        });
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map