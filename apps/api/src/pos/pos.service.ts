/**
 * POS / kasir: buka shift (toko = gudang, kas laci + rekening penampung non-tunai),
 * transaksi (stok dicadangkan sampai posting), tutup shift dengan hitung kas, lalu
 * posting oleh orang lain: satu jurnal penjualan, PPN, HPP, dan selisih kas;
 * stok toko berkurang saat posting sehingga kartu stok = buku besar.
 */
import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { salesTotals, shiftJournalLines, shiftSummary, type PayMethod } from '@erp/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { conflict, DomainError, forbidden, notFound } from '../common/errors.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from '../ledger/ledger.shared.js';
import { usableBank } from '../cash/cash.shared.js';
import { assertBranch, auditTrail, invalid, nextDocNo, postAutoJournal, todayWib, trimBranch, UUID } from '../sales/sales.shared.js';
import { addTo, issueStock, warehouseOf } from '../inventory/stock.shared.js';

export interface OpenShiftInput { warehouse: string; cashAccount: string; settlementAccount?: string; openingCash: number; date?: string }
export interface SaleInput { lines: { sku: string; qty: number; discPct?: number }[]; method: PayMethod; tendered?: number; reference?: string }

const STATUS_LABEL: Record<string, string> = { buka: 'Buka', ditutup: 'Ditutup — menunggu posting', diposting: 'Diposting' };
const mapShift = (s: any) => ({
  id: s.id, docNo: s.doc_no, branch: trimBranch(s.branch_code), warehouse: s.warehouse_code, cashAccount: s.cash_account, settlementAccount: s.settlement_account,
  cashierId: s.cashier_id, cashierName: s.cashier_name, date: s.shift_date, openedAt: s.opened_at, openingCash: Number(s.opening_cash), closedAt: s.closed_at,
  countedCash: s.counted_cash === null ? null : Number(s.counted_cash), expectedCash: s.expected_cash === null ? null : Number(s.expected_cash), cashDiff: s.cash_diff === null ? null : Number(s.cash_diff),
  cogs: s.cogs === null ? null : Number(s.cogs), status: s.status, statusLabel: STATUS_LABEL[s.status] ?? s.status, closeNote: s.close_note, postedByName: s.posted_by_name, postedAt: s.posted_at,
});
const mapTrx = (t: any) => ({
  id: t.id, trxNo: t.trx_no, at: t.trx_at, net: Number(t.net), ppn: Number(t.ppn), total: Number(t.total), method: t.payment_method as PayMethod,
  tendered: t.tendered === null ? null : Number(t.tendered), change: t.change_amount === null ? null : Number(t.change_amount), reference: t.reference,
  status: t.status as 'selesai' | 'void', voidReason: t.void_reason, voidedByName: t.voided_by_name, createdByName: t.created_by_name,
});

@Injectable()
export class PosService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly refs: LedgerRefs) {}

  /** Qty yang sudah terjual di shift yang belum diposting (dicadangkan). */
  private async reserved(c: PoolClient, companyId: string, warehouse: string) {
    const rows = (await c.query(
      `SELECT l.sku, sum(l.qty) AS q FROM pos_transaction_lines l JOIN pos_transactions t ON t.id = l.trx_id JOIN pos_shifts sh ON sh.id = t.shift_id
        WHERE sh.company_id = $1 AND sh.warehouse_code = $2 AND sh.status IN ('buka','ditutup') AND t.status = 'selesai' GROUP BY l.sku`, [companyId, warehouse])).rows;
    return new Map(rows.map((r: any) => [r.sku, Number(r.q)]));
  }

  async catalog(u: RequestUser, s: ScopeContext, warehouse: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const wh = await warehouseOf(c, u.companyId, warehouse);
      const res = await this.reserved(c, u.companyId, wh.code);
      return (await c.query(
        `SELECT p.sku, p.name, p.unit, p.price, si.on_hand FROM products p JOIN stock_items si ON si.company_id = p.company_id AND si.sku = p.sku AND si.warehouse_code = $2
          WHERE p.company_id = $1 AND p.kind = 'barang' AND p.status = 'aktif' ORDER BY p.name`, [u.companyId, wh.code])).rows
        .map((p: any) => ({ sku: p.sku, name: p.name, uom: p.unit, price: Number(p.price), available: Math.max(0, Number(p.on_hand) - (res.get(p.sku) ?? 0)) }));
    });
  }

  private async summarize(c: PoolClient, shift: any) {
    const trx = (await c.query('SELECT * FROM pos_transactions WHERE shift_id = $1 ORDER BY trx_at, trx_no', [shift.id])).rows.map(mapTrx);
    return { trx, summary: shiftSummary(trx, Number(shift.opening_cash)) };
  }

  async list(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const rows = (await c.query(`SELECT * FROM pos_shifts WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2) ORDER BY (status = 'buka') DESC, (status = 'ditutup') DESC, opened_at DESC LIMIT 500`,
        [u.companyId, s.branch === 'ALL' ? null : s.branch])).rows;
      const out = [];
      for (const r of rows) out.push({ ...mapShift(r), summary: r.summary ?? (await this.summarize(c, r)).summary });
      return out;
    });
  }

  private async row(c: PoolClient, companyId: string, id: string, lock = false) {
    if (!UUID.test(id)) throw notFound('Shift kasir');
    const r = (await c.query(`SELECT * FROM pos_shifts WHERE company_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`, [companyId, id])).rows[0];
    if (!r) throw notFound('Shift kasir');
    return r;
  }

  private async load(c: PoolClient, companyId: string, id: string) {
    const sh = await this.row(c, companyId, id);
    const { trx, summary } = await this.summarize(c, sh);
    const lines = (await c.query('SELECT l.* FROM pos_transaction_lines l JOIN pos_transactions t ON t.id = l.trx_id WHERE t.shift_id = $1 ORDER BY l.trx_id, l.line_no', [id])).rows;
    const journals = (await c.query(`SELECT id, journal_no, journal_date, rule_code, status, total_debit FROM journals WHERE company_id = $1 AND source_type = 'pos_shift' AND source_id = $2 ORDER BY journal_no`, [companyId, id])).rows
      .map((j: any) => ({ id: j.id, journalNo: j.journal_no, date: j.journal_date, rule: j.rule_code, status: j.status, total: j.total_debit }));
    return {
      ...mapShift(sh), summary,
      transactions: trx.map((t) => ({ ...t, lines: lines.filter((l: any) => l.trx_id === t.id).map((l: any) => ({ sku: l.sku, name: l.name, uom: l.uom, qty: Number(l.qty), price: Number(l.price), discPct: Number(l.disc_pct), net: Number(l.net) })) })),
      journals, timeline: await auditTrail(c, companyId, 'pos_shift', sh.doc_no),
    };
  }

  async get(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), (c) => this.load(c, u.companyId, id));
  }

  private log(c: PoolClient, u: RequestUser, sh: any, action: string, after: unknown, requestId: string) {
    return this.audit.record(c, { companyId: u.companyId, branchCode: trimBranch(sh.branch_code), userId: u.id, sessionId: u.sessionId, action: `pos_shift.${action}`, entityType: 'pos_shift', entityId: sh.doc_no, after, requestId });
  }

  async open(u: RequestUser, s: ScopeContext, b: OpenShiftInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const wh = await warehouseOf(c, u.companyId, b.warehouse);
      assertBranch(u, s, wh.branch_code);
      const cash = await usableBank(c, u.companyId, b.cashAccount, 'Rekening kas');
      if (cash.branch_code !== wh.branch_code) throw invalid('BANK_BRANCH', `Rekening kas ${cash.code} bukan milik cabang ${wh.branch_code}.`);
      let settle: any = null;
      if (b.settlementAccount) {
        settle = await usableBank(c, u.companyId, b.settlementAccount, 'Rekening penampung');
        if (settle.branch_code !== wh.branch_code) throw invalid('BANK_BRANCH', `Rekening penampung ${settle.code} bukan milik cabang ${wh.branch_code}.`);
        if (settle.code === cash.code) throw invalid('BANK_SAME', 'Rekening penampung non-tunai harus berbeda dari kas laci.');
      }
      if ((await c.query(`SELECT 1 FROM pos_shifts WHERE company_id = $1 AND cashier_id = $2 AND status = 'buka'`, [u.companyId, u.id])).rowCount) throw conflict('SHIFT_ALREADY_OPEN', 'Anda masih memiliki shift terbuka; tutup dulu sebelum membuka shift baru.');
      const date = b.date ?? todayWib();
      const docNo = await nextDocNo(c, u.companyId, 'SHF', Number(date.slice(0, 4)));
      const r = (await c.query(`INSERT INTO pos_shifts (company_id, branch_code, doc_no, warehouse_code, cash_account, settlement_account, cashier_id, cashier_name, shift_date, opening_cash)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [u.companyId, wh.branch_code, docNo, wh.code, cash.code, settle?.code ?? null, u.id, u.name, date, b.openingCash])).rows[0];
      await this.log(c, u, r, 'opened', { warehouse: wh.code, cash: cash.code, openingCash: b.openingCash }, requestId);
      return this.load(c, u.companyId, r.id);
    });
  }

  async sale(u: RequestUser, s: ScopeContext, id: string, b: SaleInput, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const sh = await this.row(c, u.companyId, id, true);
      if (sh.status !== 'buka') throw conflict('SHIFT_NOT_OPEN', `Shift ${sh.doc_no} sudah ditutup.`);
      if (sh.cashier_id !== u.id) throw forbidden('Transaksi hanya dapat dicatat oleh kasir pemilik shift.');
      if (b.method !== 'tunai' && !sh.settlement_account) throw invalid('NO_SETTLEMENT_ACCOUNT', 'Shift ini tidak memiliki rekening penampung non-tunai; hanya pembayaran tunai.');
      const seen = new Set<string>();
      for (const l of b.lines) { if (seen.has(l.sku)) throw invalid('POS_DUP_SKU', `SKU ${l.sku} tercantum lebih dari sekali.`); seen.add(l.sku); }
      const res = await this.reserved(c, u.companyId, sh.warehouse_code);
      const items = [];
      for (const l of b.lines) {
        const p = (await c.query(`SELECT p.sku, p.name, p.unit, p.price, p.kind, p.status, si.on_hand FROM products p LEFT JOIN stock_items si ON si.company_id = p.company_id AND si.sku = p.sku AND si.warehouse_code = $3
                                   WHERE p.company_id = $1 AND p.sku = $2`, [u.companyId, l.sku, sh.warehouse_code])).rows[0];
        if (!p || p.kind !== 'barang' || p.status !== 'aktif') throw invalid('POS_PRODUCT', `Barang ${l.sku} tidak tersedia untuk dijual.`);
        const avail = Number(p.on_hand ?? 0) - (res.get(l.sku) ?? 0);
        if (l.qty > avail + 1e-9) throw invalid('STOCK_INSUFFICIENT', `Stok ${p.name} di toko hanya ${Math.max(0, avail).toLocaleString('id-ID')} ${p.unit}.`);
        items.push({ ...l, name: p.name, uom: p.unit, price: Number(p.price), discPct: l.discPct ?? 0 });
      }
      const t = salesTotals(items.map((i) => ({ qty: i.qty, price: i.price, discPct: i.discPct, kind: 'barang' as const })));
      if (t.total <= 0) throw invalid('POS_ZERO', 'Total transaksi harus lebih dari nol.');
      let change: number | null = null;
      if (b.method === 'tunai') {
        const tendered = b.tendered ?? t.total;
        if (tendered < t.total) throw invalid('POS_TENDERED', `Uang diterima kurang dari total ${t.total.toLocaleString('id-ID')}.`);
        change = tendered - t.total;
        b.tendered = tendered;
      }
      const trxNo = await nextDocNo(c, u.companyId, 'TRX', Number(String(sh.shift_date).slice(0, 4)), 5);
      const r = (await c.query(`INSERT INTO pos_transactions (shift_id, company_id, branch_code, trx_no, net, ppn, total, payment_method, tendered, change_amount, reference, created_by_name)
                                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [id, u.companyId, sh.branch_code, trxNo, t.net, t.ppn, t.total, b.method, b.method === 'tunai' ? b.tendered : null, change, b.reference ?? null, u.name])).rows[0];
      let n = 0;
      for (const [i, it] of items.entries()) {
        n += 1;
        await c.query(`INSERT INTO pos_transaction_lines (trx_id, company_id, branch_code, line_no, sku, name, uom, qty, price, disc_pct, net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [r.id, u.companyId, sh.branch_code, n, it.sku, it.name, it.uom, it.qty, it.price, it.discPct, t.lines[i]]);
      }
      return { ...mapTrx(r), lines: items.map((it, i) => ({ sku: it.sku, name: it.name, uom: it.uom, qty: it.qty, price: it.price, discPct: it.discPct, net: t.lines[i] })) };
    });
  }

  async voidTrx(u: RequestUser, s: ScopeContext, trxId: string, reason: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      if (!UUID.test(trxId)) throw notFound('Transaksi');
      const t = (await c.query('SELECT * FROM pos_transactions WHERE company_id = $1 AND id = $2 FOR UPDATE', [u.companyId, trxId])).rows[0];
      if (!t) throw notFound('Transaksi');
      const sh = await this.row(c, u.companyId, t.shift_id, true);
      if (sh.status !== 'buka') throw conflict('SHIFT_NOT_OPEN', 'Transaksi hanya dapat dibatalkan selama shift masih buka.');
      if (t.status === 'void') throw conflict('TRX_VOID', `Transaksi ${t.trx_no} sudah dibatalkan.`);
      await c.query(`UPDATE pos_transactions SET status = 'void', void_reason = $2, voided_by_name = $3, voided_at = now() WHERE id = $1`, [trxId, reason, u.name]);
      await this.log(c, u, sh, 'trx_voided', { trx: t.trx_no, total: Number(t.total), reason }, requestId);
      return this.load(c, u.companyId, sh.id);
    });
  }

  async close(u: RequestUser, s: ScopeContext, id: string, b: { countedCash: number; note?: string }, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const sh = await this.row(c, u.companyId, id, true);
      if (sh.status !== 'buka') throw conflict('SHIFT_NOT_OPEN', `Shift ${sh.doc_no} sudah ditutup.`);
      if (sh.cashier_id !== u.id && !u.permissions.has('pos.shift.post')) throw forbidden('Shift hanya dapat ditutup oleh kasirnya atau supervisor.');
      const { summary } = await this.summarize(c, sh);
      const diff = b.countedCash - summary.expectedCash;
      await c.query(`UPDATE pos_shifts SET status = 'ditutup', closed_at = now(), counted_cash = $2, expected_cash = $3, cash_diff = $4, summary = $5, close_note = $6 WHERE id = $1`,
        [id, b.countedCash, summary.expectedCash, diff, JSON.stringify(summary), b.note ?? null]);
      await this.log(c, u, sh, 'closed', { counted: b.countedCash, expected: summary.expectedCash, diff, note: b.note }, requestId);
      return this.load(c, u.companyId, id);
    });
  }

  async post(u: RequestUser, s: ScopeContext, id: string, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const sh = await this.row(c, u.companyId, id, true);
      const branch = trimBranch(sh.branch_code);
      assertBranch(u, { ...s, branch: 'ALL' }, branch);
      if (sh.status !== 'ditutup') throw conflict('SHIFT_NOT_CLOSED', `Shift ${sh.doc_no} ${sh.status === 'buka' ? 'masih buka' : 'sudah diposting'}.`);
      if (sh.cashier_id === u.id) throw new DomainError('SOD_POS_SHIFT', 'Kasir tidak boleh memposting shift-nya sendiri (hitung kas diperiksa orang lain).', HttpStatus.FORBIDDEN);
      const links = await this.refs.links(c, u.companyId);
      const { summary } = await this.summarize(c, sh);
      const qty = (await c.query(`SELECT l.sku, sum(l.qty) AS q FROM pos_transaction_lines l JOIN pos_transactions t ON t.id = l.trx_id WHERE t.shift_id = $1 AND t.status = 'selesai' GROUP BY l.sku ORDER BY l.sku`, [id])).rows;
      const cogsBy = new Map<string, number>();
      let cogs = 0;
      for (const q of qty) {
        const out = await issueStock(c, u, links, { branch, warehouse: sh.warehouse_code, sku: q.sku, qty: Number(q.q), date: sh.shift_date, refType: 'pos', refId: id, refNo: sh.doc_no });
        addTo(cogsBy, out.account, out.value);
        cogs += out.value;
      }
      const cash = await usableBank(c, u.companyId, sh.cash_account, 'Rekening kas');
      const settle = sh.settlement_account ? await usableBank(c, u.companyId, sh.settlement_account, 'Rekening penampung') : null;
      const j = shiftJournalLines({
        summary, countedCash: Number(sh.counted_cash), cashAccount: cash.gl_account_code, cashBank: cash.code, settlementAccount: settle?.gl_account_code ?? null, settlementBank: settle?.code ?? null,
        salesGoods: links.salesGoods, ppnOut: links.ppnOut, cogs: links.cogs, overShort: links.cashOverShort, cogsByAccount: Object.fromEntries(cogsBy),
      });
      if (j.lines.length) {
        await postAutoJournal(c, u, { branch, date: sh.shift_date, source: 'pos_shift', sourceId: id, rule: 'POS_SHIFT', ref: sh.doc_no,
          description: `Penjualan POS ${sh.doc_no} — ${sh.cashier_name}, toko ${sh.warehouse_code} (${summary.count} transaksi)`, lines: j.lines });
      }
      await c.query(`UPDATE pos_shifts SET status = 'diposting', cogs = $2, posted_by = $3, posted_by_name = $4, posted_at = now() WHERE id = $1`, [id, cogs, u.id, u.name]);
      await this.log(c, u, sh, 'posted', { gross: summary.gross, cogs, diff: Number(sh.cash_diff) }, requestId);
      return this.load(c, u.companyId, id);
    });
  }
}
