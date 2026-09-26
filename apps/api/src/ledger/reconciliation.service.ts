import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { balanceSheet, intercompanyMismatch, trialBalance, type ReconciliationCheck } from '@erp/domain';
import type { RequestUser, ScopeContext } from '../common/context.js';
import { contextOf, DbService } from '../db/db.service.js';
import { LedgerRefs } from './ledger.shared.js';

/**
 * K-28: 11 pemeriksaan sub-buku vs buku besar (diturunkan dari halaman
 * Integrasi purwarupa). Hasil disimpan di reconciliation_runs.
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly db: DbService, private readonly refs: LedgerRefs) {}

  async forScope(u: RequestUser, s: ScopeContext, requestId: string) {
    return this.db.run(contextOf(u, s, requestId), async (c) => {
      const period = await this.refs.resolvePeriod(c, u.companyId, s.period);
      const checks = await this.run(c, u.companyId, s.branch, period, u.id);
      const summary = (await c.query(
        `SELECT source_type AS source, count(*)::int AS count, count(*) FILTER (WHERE status IN ('posted','reversed'))::int AS posted,
                count(*) FILTER (WHERE status = 'pending')::int AS pending, coalesce(sum(total_debit) FILTER (WHERE status IN ('posted','reversed')),0)::bigint AS amount
           FROM journals WHERE company_id = $1 AND journal_date BETWEEN $2 AND $3 AND ($4::text IS NULL OR branch_code = $4) GROUP BY 1 ORDER BY amount DESC`,
        [u.companyId, period.from, period.to, s.branch === 'ALL' ? null : s.branch])).rows;
      return { period, scope: s.branch, checks, postingSummary: summary };
    });
  }

  async run(c: PoolClient, companyId: string, branch: string | 'ALL', period: { id: string; from: string; to: string }, userId: string | null): Promise<ReconciliationCheck[]> {
    const b = branch === 'ALL' ? null : branch;
    const asOf = period.to;
    const accounts = await this.refs.accounts(c, companyId);
    const bal = await this.refs.balances(c, companyId, b, period.from, period.to);
    const gl = (code: string) => bal[code]?.ending ?? 0;
    const one = async (sql: string, args: unknown[]) => Number((await c.query(sql, args)).rows[0]?.v ?? 0);
    const res: ReconciliationCheck[] = [];
    const add = (id: string, label: string, module: string, source: string, sub: number, glv: number, note: string, count = false) =>
      res.push({ id, label, module, source, subledger: sub, ledger: glv, diff: sub - glv, ok: Math.abs(sub - glv) < 1, note, count });

    /* Faktur terbit s.d. tanggal (draf belum dijurnal; batal dihitung sampai tanggal pembatalannya) − penerimaan s.d. tanggal. */
    const ar = await one(
      `SELECT (SELECT coalesce(sum(total_gross),0) FROM invoices WHERE company_id = $1 AND status <> 'draf' AND invoice_date <= $2 AND (status <> 'batal' OR cancel_date > $2) AND ($3::text IS NULL OR branch_code = $3))
            - (SELECT coalesce(sum(amount),0) FROM receipts WHERE company_id = $1 AND receipt_date <= $2 AND ($3::text IS NULL OR branch_code = $3)) AS v`, [companyId, asOf, b]);
    add('ar', 'Piutang usaha', 'faktur', 'Σ sisa tagihan faktur (modul Faktur)', ar, gl('1-1200'), 'Setiap faktur & penerimaan diposting otomatis ke 1-1200');
    const ap = await one(`SELECT coalesce(sum(total_gross - CASE WHEN coalesce(paid_date, invoice_date) <= $2 THEN paid_amount ELSE 0 END),0)::bigint AS v FROM ap_invoices WHERE company_id = $1 AND invoice_date <= $2 AND ($3::text IS NULL OR branch_code = $3)`, [companyId, asOf, b]);
    add('ap', 'Hutang usaha', 'hutang', 'Σ sisa bayar tagihan pemasok (modul Hutang)', ap, gl('2-1100'), 'Setiap tagihan & pembayaran diposting otomatis ke 2-1100');
    const bank = await one(
      `SELECT coalesce(sum(jl.debit - jl.credit),0)::bigint AS v FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN bank_accounts ba ON ba.company_id = jl.company_id AND ba.code = jl.bank_account_code
        WHERE jl.company_id = $1 AND j.status IN ('posted','reversed') AND jl.journal_date <= $2 AND ba.currency = 'IDR' AND ($3::text IS NULL OR ba.branch_code = $3)`, [companyId, asOf, b]);
    add('bank', 'Kas & bank', 'kas-bank', 'Σ saldo rekening IDR (modul Kas & Bank)', bank, gl('1-1100'), 'Rekening valas tidak dikonsolidasi ke IDR');
    /* Pemeriksaan potret (stok, aset, gaji) hanya bermakna untuk periode termutakhir buku besar. */
    const lastPosting = (await c.query(`SELECT max(journal_date) AS d FROM journals WHERE company_id = $1 AND status IN ('posted','reversed')`, [companyId])).rows[0]?.d ?? asOf;
    if (asOf >= String(lastPosting)) {
      const inv = await one(`SELECT coalesce(sum(on_hand * avg_cost),0)::bigint AS v FROM stock_items WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2)`, [companyId, b]);
      add('inv', 'Persediaan', 'stok', 'Σ kuantitas × harga pokok (kartu stok)', inv, gl('1-1400') + gl('1-1450') + gl('1-1500'), 'Bahan baku, barang dalam proses, dan barang jadi');
      const fa = await one(`SELECT coalesce(sum(acquisition_cost),0)::bigint AS v FROM assets WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2)`, [companyId, b]);
      add('fa', 'Aset tetap — harga perolehan', 'aset', 'Σ nilai perolehan (register aset)', fa, gl('1-2300') + gl('1-2400') + gl('1-2500'), 'Tanah & bangunan dicatat langsung di buku besar');
      const nbv = await one(`SELECT coalesce(sum(book_value) FILTER (WHERE status = 'aktif'),0)::bigint AS v FROM assets WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2)`, [companyId, b]);
      add('nbv', 'Aset tetap — nilai buku', 'aset', 'Σ nilai buku register aset', nbv, gl('1-2300') + gl('1-2400') + gl('1-2500') + gl('1-2900'), 'Akumulasi penyusutan (1-2900) bersaldo kredit sebagai akun kontra');
      const pay = await one(`SELECT coalesce(sum(net_pay) FILTER (WHERE status = 'diproses'),0)::bigint AS v FROM payslips WHERE company_id = $1 AND ($2::text IS NULL OR branch_code = $2)`, [companyId, b]);
      add('pay', 'Utang gaji', 'penggajian', 'Σ gaji bersih berstatus diproses (modul Penggajian)', pay, gl('2-1200'), 'Slip berstatus draf belum dijurnal');
    }
    const tb = trialBalance(accounts, bal);
    add('tb', 'Neraca saldo', 'neraca-saldo', 'Σ debit', tb.totals.endD, tb.totals.endK, 'Σ debit harus sama dengan Σ kredit');
    const bs = balanceSheet(accounts, bal, asOf);
    add('bs', 'Neraca', 'neraca', 'Total aset', bs.totalAssets, bs.totalLiabEquity, 'Aset = liabilitas + ekuitas (termasuk laba periode berjalan)');
    if (!b) {
      const rkC = gl('1-3100'), rkP = gl('3-1500');
      add('rk', 'Rekening koran antar kantor', 'cabang', 'RK Cabang (kantor pusat)', rkC, rkP, 'Dieliminasi pada laporan konsolidasi');
      void intercompanyMismatch;
    }
    const unbalanced = await one(`SELECT count(*)::int AS v FROM journals j WHERE j.company_id = $1 AND j.status IN ('posted','reversed') AND j.total_debit <> j.total_credit`, [companyId]);
    add('jv', 'Keseimbangan jurnal', 'jurnal', 'Jurnal tidak seimbang', unbalanced, 0, 'Setiap jurnal wajib Σ debit = Σ kredit', true);

    for (const k of res) {
      await c.query(`INSERT INTO reconciliation_runs (company_id, branch_code, period_code, check_code, subledger_value, gl_value, diff, ok, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [companyId, b, period.id, k.id, Math.round(k.subledger), Math.round(k.ledger), Math.round(k.diff), k.ok, userId ? `oleh ${userId}` : 'terjadwal']);
    }
    return res;
  }
}
