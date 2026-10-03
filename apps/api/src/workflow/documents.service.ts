/** Repositori dokumen berversi: lampiran tersimpan di basis data dengan SHA-256 per versi. */
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { invalid, nextDocNo, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';

export interface FileInput { name: string; mime: string; base64: string }
export interface DocumentInput { name: string; docType: string; folder: string; branch?: string; entityType?: string; entityRef?: string; status: 'draf' | 'berlaku' | 'arsip'; expiryDate?: string; note?: string; file: FileInput }

const ALLOWED = /^(application\/pdf|image\/(png|jpeg|webp)|text\/(plain|csv)|application\/(vnd\.openxmlformats-officedocument\.[a-z.]+|msword|vnd\.ms-excel|zip))$/;
const map = (d: any) => {
  const today = todayWib();
  const effective = d.status === 'berlaku' && d.expiry_date && d.expiry_date < today ? 'kedaluwarsa' : d.status;
  return { id: d.id, docNo: d.doc_no, name: d.name, docType: d.doc_type, folder: d.folder, branch: d.branch_code ? trimBranch(d.branch_code) : null, entityType: d.entity_type, entityRef: d.entity_ref,
    owner: d.owner_name, status: effective, expiryDate: d.expiry_date, version: d.current_version, size: d.size_bytes === undefined ? undefined : Number(d.size_bytes), fileName: d.file_name, updatedAt: d.updated_at ?? d.created_at };
};

@Injectable()
export class DocumentsService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  private decode(f: FileInput) {
    if (!ALLOWED.test(f.mime)) throw invalid('DOC_TYPE', `Jenis berkas ${f.mime} tidak diizinkan (PDF, gambar, Office, CSV/teks, ZIP).`);
    const buf = Buffer.from(f.base64, 'base64');
    if (!buf.length) throw invalid('DOC_EMPTY', 'Berkas kosong.');
    if (buf.length > 1_048_576) throw invalid('DOC_TOO_LARGE', 'Ukuran berkas maksimal 1 MB.');
    return { buf, sha: createHash('sha256').update(buf).digest() };
  }

  async list(u: RequestUser, s: ScopeContext, q: { entityType?: string; entityRef?: string }, requestId: string) {
    return this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) =>
      (await c.query(`SELECT d.*, v.size_bytes, v.file_name FROM documents d LEFT JOIN document_versions v ON v.document_id = d.id AND v.version = d.current_version
          WHERE d.company_id = $1 AND ($2::text IS NULL OR d.entity_type = $2) AND ($3::text IS NULL OR d.entity_ref = $3)
            AND ($4::text IS NULL OR d.branch_code IS NULL OR d.branch_code = $4)
          ORDER BY d.folder, d.name LIMIT 2000`, [u.companyId, q.entityType ?? null, q.entityRef ?? null, s.branch === 'ALL' ? null : s.branch])).rows.map(map));
  }

  private async row(c: PoolClient, companyId: string, id: string) {
    if (!UUID.test(id)) throw notFound('Dokumen');
    const d = (await c.query('SELECT * FROM documents WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
    if (!d) throw notFound('Dokumen');
    return d;
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      const d = await this.row(c, u.companyId, id);
      const versions = (await c.query(`SELECT version, file_name, mime, size_bytes, encode(sha256, 'hex') AS sha, note, uploaded_by_name, uploaded_at FROM document_versions WHERE document_id = $1 ORDER BY version DESC`, [id])).rows
        .map((v: any) => ({ version: v.version, fileName: v.file_name, mime: v.mime, size: v.size_bytes, sha256: v.sha, note: v.note, by: v.uploaded_by_name, at: v.uploaded_at }));
      return { ...map(d), versions };
    });
  }

  async create(u: RequestUser, s: ScopeContext, b: DocumentInput, requestId: string) {
    const id = await this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      if (b.branch && u.branches !== '*' && !u.branches.includes(b.branch)) throw invalid('DOC_BRANCH', `Tidak ada akses ke cabang ${b.branch}.`);
      const f = this.decode(b.file);
      const docNo = await nextDocNo(c, u.companyId, 'DOC', Number(todayWib().slice(0, 4)));
      const d = (await c.query(`INSERT INTO documents (company_id, branch_code, doc_no, name, doc_type, folder, entity_type, entity_ref, owner_name, status, expiry_date, current_version, created_by)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12) RETURNING *`,
        [u.companyId, b.branch ?? null, docNo, b.name, b.docType, b.folder, b.entityType ?? null, b.entityRef ?? null, u.name, b.status, b.expiryDate ?? null, u.id])).rows[0];
      await c.query(`INSERT INTO document_versions (document_id, company_id, version, file_name, mime, size_bytes, sha256, content, note, uploaded_by, uploaded_by_name) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [d.id, u.companyId, b.file.name, b.file.mime, f.buf.length, f.sha, f.buf, b.note ?? null, u.id, u.name]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: b.branch ?? null, userId: u.id, sessionId: u.sessionId, action: 'document.uploaded', entityType: 'document', entityId: docNo,
        after: { name: b.name, version: 1, sha256: f.sha.toString('hex'), entity: b.entityRef ?? null }, requestId });
      return d.id as string;
    });
    return this.get(u, s, id, requestId);
  }

  async addVersion(u: RequestUser, s: ScopeContext, id: string, b: { file: FileInput; note?: string }, requestId: string) {
    await this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      const d = await this.row(c, u.companyId, id);
      const f = this.decode(b.file);
      const v = d.current_version + 1;
      await c.query(`INSERT INTO document_versions (document_id, company_id, version, file_name, mime, size_bytes, sha256, content, note, uploaded_by, uploaded_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, u.companyId, v, b.file.name, b.file.mime, f.buf.length, f.sha, f.buf, b.note ?? null, u.id, u.name]);
      await c.query('UPDATE documents SET current_version = $2, updated_at = now() WHERE id = $1', [id, v]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: d.branch_code ? trimBranch(d.branch_code) : null, userId: u.id, sessionId: u.sessionId, action: 'document.versioned', entityType: 'document', entityId: d.doc_no, after: { version: v, sha256: f.sha.toString('hex'), note: b.note }, requestId });
    });
    return this.get(u, s, id, requestId);
  }

  async update(u: RequestUser, s: ScopeContext, id: string, b: { status?: 'draf' | 'berlaku' | 'arsip'; expiryDate?: string | null; folder?: string; name?: string }, requestId: string) {
    await this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      const d = await this.row(c, u.companyId, id);
      await c.query(`UPDATE documents SET status = coalesce($2, status), expiry_date = CASE WHEN $3::boolean THEN $4::date ELSE expiry_date END, folder = coalesce($5, folder), name = coalesce($6, name), updated_at = now() WHERE id = $1`,
        [id, b.status ?? null, b.expiryDate !== undefined, b.expiryDate ?? null, b.folder ?? null, b.name ?? null]);
      await this.audit.record(c, { companyId: u.companyId, branchCode: d.branch_code ? trimBranch(d.branch_code) : null, userId: u.id, sessionId: u.sessionId, action: 'document.updated', entityType: 'document', entityId: d.doc_no, after: b, requestId });
    });
    return this.get(u, s, id, requestId);
  }

  async download(u: RequestUser, s: ScopeContext, id: string, version: number | null, requestId: string) {
    return this.db.run(contextOf(u, { ...s, branch: 'ALL' }, requestId), async (c) => {
      const d = await this.row(c, u.companyId, id);
      const v = (await c.query('SELECT file_name, mime, content, encode(sha256, \'hex\') AS sha FROM document_versions WHERE document_id = $1 AND version = $2', [id, version ?? d.current_version])).rows[0];
      if (!v) throw notFound('Versi dokumen');
      return { fileName: v.file_name as string, mime: v.mime as string, content: v.content as Buffer, sha256: v.sha as string };
    });
  }
}
