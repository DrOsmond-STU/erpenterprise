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
exports.DocumentsService = void 0;
/** Repositori dokumen berversi: lampiran tersimpan di basis data dengan SHA-256 per versi. */
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const audit_service_js_1 = require("../audit/audit.service.js");
const errors_js_1 = require("../common/errors.js");
const db_service_js_1 = require("../db/db.service.js");
const sales_shared_js_1 = require("../sales/sales.shared.js");
const ALLOWED = /^(application\/pdf|image\/(png|jpeg|webp)|text\/(plain|csv)|application\/(vnd\.openxmlformats-officedocument\.[a-z.]+|msword|vnd\.ms-excel|zip))$/;
const map = (d) => {
    const today = (0, sales_shared_js_1.todayWib)();
    const effective = d.status === 'berlaku' && d.expiry_date && d.expiry_date < today ? 'kedaluwarsa' : d.status;
    return { id: d.id, docNo: d.doc_no, name: d.name, docType: d.doc_type, folder: d.folder, branch: d.branch_code ? (0, sales_shared_js_1.trimBranch)(d.branch_code) : null, entityType: d.entity_type, entityRef: d.entity_ref,
        owner: d.owner_name, status: effective, expiryDate: d.expiry_date, version: d.current_version, size: d.size_bytes === undefined ? undefined : Number(d.size_bytes), fileName: d.file_name, updatedAt: d.updated_at ?? d.created_at };
};
let DocumentsService = class DocumentsService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    decode(f) {
        if (!ALLOWED.test(f.mime))
            throw (0, sales_shared_js_1.invalid)('DOC_TYPE', `Jenis berkas ${f.mime} tidak diizinkan (PDF, gambar, Office, CSV/teks, ZIP).`);
        const buf = Buffer.from(f.base64, 'base64');
        if (!buf.length)
            throw (0, sales_shared_js_1.invalid)('DOC_EMPTY', 'Berkas kosong.');
        if (buf.length > 1_048_576)
            throw (0, sales_shared_js_1.invalid)('DOC_TOO_LARGE', 'Ukuran berkas maksimal 1 MB.');
        return { buf, sha: (0, node_crypto_1.createHash)('sha256').update(buf).digest() };
    }
    async list(u, s, q, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => (await c.query(`SELECT d.*, v.size_bytes, v.file_name FROM documents d LEFT JOIN document_versions v ON v.document_id = d.id AND v.version = d.current_version
          WHERE d.company_id = $1 AND ($2::text IS NULL OR d.entity_type = $2) AND ($3::text IS NULL OR d.entity_ref = $3)
            AND ($4::text IS NULL OR d.branch_code IS NULL OR d.branch_code = $4)
          ORDER BY d.folder, d.name LIMIT 2000`, [u.companyId, q.entityType ?? null, q.entityRef ?? null, s.branch === 'ALL' ? null : s.branch])).rows.map(map));
    }
    async row(c, companyId, id) {
        if (!sales_shared_js_1.UUID.test(id))
            throw (0, errors_js_1.notFound)('Dokumen');
        const d = (await c.query('SELECT * FROM documents WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
        if (!d)
            throw (0, errors_js_1.notFound)('Dokumen');
        return d;
    }
    async get(u, s, id, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
            const d = await this.row(c, u.companyId, id);
            const versions = (await c.query(`SELECT version, file_name, mime, size_bytes, encode(sha256, 'hex') AS sha, note, uploaded_by_name, uploaded_at FROM document_versions WHERE document_id = $1 ORDER BY version DESC`, [id])).rows
                .map((v) => ({ version: v.version, fileName: v.file_name, mime: v.mime, size: v.size_bytes, sha256: v.sha, note: v.note, by: v.uploaded_by_name, at: v.uploaded_at }));
            return { ...map(d), versions };
        });
    }
    async create(u, s, b, requestId) {
        const id = await this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
            if (b.branch && u.branches !== '*' && !u.branches.includes(b.branch))
                throw (0, sales_shared_js_1.invalid)('DOC_BRANCH', `Tidak ada akses ke cabang ${b.branch}.`);
            const f = this.decode(b.file);
            const docNo = await (0, sales_shared_js_1.nextDocNo)(c, u.companyId, 'DOC', Number((0, sales_shared_js_1.todayWib)().slice(0, 4)));
            const d = (await c.query(`INSERT INTO documents (company_id, branch_code, doc_no, name, doc_type, folder, entity_type, entity_ref, owner_name, status, expiry_date, current_version, created_by)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12) RETURNING *`, [u.companyId, b.branch ?? null, docNo, b.name, b.docType, b.folder, b.entityType ?? null, b.entityRef ?? null, u.name, b.status, b.expiryDate ?? null, u.id])).rows[0];
            await c.query(`INSERT INTO document_versions (document_id, company_id, version, file_name, mime, size_bytes, sha256, content, note, uploaded_by, uploaded_by_name) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10)`, [d.id, u.companyId, b.file.name, b.file.mime, f.buf.length, f.sha, f.buf, b.note ?? null, u.id, u.name]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: b.branch ?? null, userId: u.id, sessionId: u.sessionId, action: 'document.uploaded', entityType: 'document', entityId: docNo,
                after: { name: b.name, version: 1, sha256: f.sha.toString('hex'), entity: b.entityRef ?? null }, requestId });
            return d.id;
        });
        return this.get(u, s, id, requestId);
    }
    async addVersion(u, s, id, b, requestId) {
        await this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
            const d = await this.row(c, u.companyId, id);
            const f = this.decode(b.file);
            const v = d.current_version + 1;
            await c.query(`INSERT INTO document_versions (document_id, company_id, version, file_name, mime, size_bytes, sha256, content, note, uploaded_by, uploaded_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, u.companyId, v, b.file.name, b.file.mime, f.buf.length, f.sha, f.buf, b.note ?? null, u.id, u.name]);
            await c.query('UPDATE documents SET current_version = $2, updated_at = now() WHERE id = $1', [id, v]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: d.branch_code ? (0, sales_shared_js_1.trimBranch)(d.branch_code) : null, userId: u.id, sessionId: u.sessionId, action: 'document.versioned', entityType: 'document', entityId: d.doc_no, after: { version: v, sha256: f.sha.toString('hex'), note: b.note }, requestId });
        });
        return this.get(u, s, id, requestId);
    }
    async update(u, s, id, b, requestId) {
        await this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
            const d = await this.row(c, u.companyId, id);
            await c.query(`UPDATE documents SET status = coalesce($2, status), expiry_date = CASE WHEN $3::boolean THEN $4::date ELSE expiry_date END, folder = coalesce($5, folder), name = coalesce($6, name), updated_at = now() WHERE id = $1`, [id, b.status ?? null, b.expiryDate !== undefined, b.expiryDate ?? null, b.folder ?? null, b.name ?? null]);
            await this.audit.record(c, { companyId: u.companyId, branchCode: d.branch_code ? (0, sales_shared_js_1.trimBranch)(d.branch_code) : null, userId: u.id, sessionId: u.sessionId, action: 'document.updated', entityType: 'document', entityId: d.doc_no, after: b, requestId });
        });
        return this.get(u, s, id, requestId);
    }
    async download(u, s, id, version, requestId) {
        return this.db.run((0, db_service_js_1.contextOf)(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
            const d = await this.row(c, u.companyId, id);
            const v = (await c.query('SELECT file_name, mime, content, encode(sha256, \'hex\') AS sha FROM document_versions WHERE document_id = $1 AND version = $2', [id, version ?? d.current_version])).rows[0];
            if (!v)
                throw (0, errors_js_1.notFound)('Versi dokumen');
            return { fileName: v.file_name, mime: v.mime, content: v.content, sha256: v.sha };
        });
    }
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_js_1.DbService, audit_service_js_1.AuditService])
], DocumentsService);
//# sourceMappingURL=documents.service.js.map