/**
 * Seed lingkungan dev/staging dari golden dataset purwarupa:
 *   node dist/seed/seed.js
 *
 * Memuat prototype/assets/{data,charts,ledger}.js, lalu memasukkan perusahaan,
 * cabang, periode, bagan akun, rekening, pengguna & peran, seluruh jurnal
 * (otomatis + manual), dan sub-buku minimum. Idempoten: melewati perusahaan
 * yang sudah ada.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { fromPrototype, ROLE_TEMPLATES } from '@erp/domain';
import { AuthService } from '../auth/auth.service.js';
import { seedSales } from './sales-seed.js';
import { loadConfig } from '../config.js';

const STATUS: Record<string, string> = { diposting: 'posted', menunggu: 'pending', ditolak: 'rejected' };
const SOURCE: Record<string, string> = { penjualan: 'invoice', pembelian: 'ap_invoice', persediaan: 'stock_move', produksi: 'work_order', penggajian: 'payslip', aset: 'depreciation', pemeliharaan: 'maintenance', pos: 'pos_shift', 'kas-bank': 'cash', pajak: 'tax', 'saldo-awal': 'opening', manual: 'manual' };

function loadPrototype(root: string) {
  const src = ['data.js', 'charts.js', 'ledger.js'].map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n') + '\nreturn { DATA, Ledger };';
  const g: any = globalThis;
  g.document ||= { documentElement: {} }; g.getComputedStyle ||= () => ({ getPropertyValue: () => '' }); g.window ||= {};
  return new Function(src)() as { DATA: any; Ledger: any };
}

export async function seed(adminUrl: string, password: string, protoRoot: string) {
  const { DATA, Ledger } = loadPrototype(protoRoot);
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.migration', 'on', true)`);   // izinkan posting historis ke periode tertutup
    const exists = await c.query('SELECT id FROM companies WHERE code = $1', ['KNM']);
    if (exists.rowCount) {
      /* Upgrade: lengkapi data contoh modul yang ditambahkan setelah seed pertama (idempoten). */
      const id = exists.rows[0].id;
      await c.query(`SELECT set_config('app.company_id', $1, true), set_config('app.branch_codes', '*', true)`, [id]);
      const sales = await seedSales(c, id, DATA);
      await c.query('COMMIT');
      return { skipped: true, companyId: id, upgraded: sales.skipped ? [] : [`penjualan: ${sales.customers} pelanggan, ${sales.orders} pesanan`] };
    }

    const company = (await c.query(`INSERT INTO companies (code, name, npwp) VALUES ('KNM', $1, '01.234.567.8-901.000') RETURNING id`, [DATA.org.company])).rows[0].id;
    /* RLS berlaku juga untuk pemilik skema (FORCE); seed berjalan sebagai konteks sistem lintas cabang. */
    await c.query(`SELECT set_config('app.company_id', $1, true), set_config('app.branch_codes', '*', true)`, [company]);

    for (const b of DATA.branches) {
      await c.query(`INSERT INTO branches (company_id, code, name, short_name, type, city, address, phone, manager_name, is_head_office, main_bank_account_code, petty_cash_account_code, target_monthly, budget_share, status, opened_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [company, b.id, b.name, b.short, b.type, b.city, b.address, b.phone, b.manager, b.id === Ledger.HO, b.mainBank, b.pettyCash, b.targetMonthly, b.budgetShare, b.status, b.openedAt]);
    }
    /* Periode purwarupa (Jan–Agu) + sisa tahun buku agar jurnal hari ini selalu punya periode. */
    const extra = [
      { id: '2026-09', label: 'Sep 2026', from: '2026-09-01', to: '2026-09-30' }, { id: '2026-10', label: 'Okt 2026', from: '2026-10-01', to: '2026-10-31' },
      { id: '2026-11', label: 'Nov 2026', from: '2026-11-01', to: '2026-11-30' }, { id: '2026-12', label: 'Des 2026', from: '2026-12-01', to: '2026-12-31' },
      { id: '2026-Q4', label: 'Kuartal IV 2026', from: '2026-10-01', to: '2026-12-31', group: 'Kuartal' },
    ];
    for (const p of [...DATA.periods, ...extra]) {
      await c.query(`INSERT INTO fiscal_periods (company_id, code, label, date_from, date_to, period_group, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [company, p.id, p.label, p.from, p.to, p.group ?? 'Bulan', p.closed ? 'closed' : 'open']);
    }
    for (const raw of DATA.chartOfAccounts) {
      const a = fromPrototype(raw);
      await c.query(`INSERT INTO chart_of_accounts (company_id, code, name, type, category, parent_code, level, normal_side, is_intercompany, is_contra, is_cash, is_computed, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [company, a.code, a.name, a.type, a.category, a.parentCode, a.level, a.normalSide, a.isIntercompany, a.isContra, a.isCash, a.isComputed, a.status]);
    }
    for (const k of DATA.bankAccounts) {
      const masked = k.accountNo && k.accountNo !== '—' ? `****${k.accountNo.replace(/\D/g, '').slice(-4)}` : '—';
      await c.query(`INSERT INTO bank_accounts (company_id, branch_code, code, name, bank_name, account_no_masked, currency, opening_balance, opening_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'2026-01-01',$9)`,
        [company, k.branch, k.id, k.name, k.bank, masked, k.currency, k.opening, k.status]);
    }

    /* Peran & pengguna dev (K-11: pembatasan cabang berbeda-beda) */
    const roleIds: Record<string, string> = {};
    for (const [code, t] of Object.entries(ROLE_TEMPLATES)) {
      const r = (await c.query('INSERT INTO roles (company_id, code, name) VALUES ($1,$2,$3) RETURNING id', [company, code, t.name])).rows[0];
      roleIds[code] = r.id;
      for (const p of t.permissions) await c.query('INSERT INTO role_permissions (role_id, permission_code) VALUES ($1,$2)', [r.id, p]);
    }
    const hash = await AuthService.hashPassword(password);
    const users: [string, string, string, string | null][] = [
      ['admin@knm.co.id', 'Admin Sistem', 'admin', null],
      ['andi@knm.co.id', 'Andi Firmansyah', 'akuntan_senior', null],
      ['sari@knm.co.id', 'Sari Melati', 'staf_keuangan', null],
      ['osmond@knm.co.id', 'Osmond Pratama', 'manajer', null],
      ['fitri@knm.co.id', 'Fitri Ramadhani', 'gudang', 'SBY'],
      ['taufik@knm.co.id', 'Taufik Hidayat', 'manajer', 'MDN'],
    ];
    const userIds: Record<string, string> = {};
    for (const [email, name, role, branch] of users) {
      const u = (await c.query('INSERT INTO users (company_id, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id', [company, email, name, hash])).rows[0];
      userIds[name] = u.id;
      await c.query('INSERT INTO user_roles (user_id, role_id, branch_code) VALUES ($1,$2,$3)', [u.id, roleIds[role], branch ?? 'ALL']);
    }
    const system = (await c.query('INSERT INTO users (company_id, email, display_name, status) VALUES ($1,$2,$3,$4) RETURNING id', [company, 'sistem@knm.co.id', 'Sistem', 'nonaktif'])).rows[0].id;

    /* Jurnal dari mesin purwarupa */
    let n = 0;
    for (const j of Ledger.all()) {
      const period = DATA.periods.find((p: any) => !p.group && j.date >= p.from && j.date <= p.to);
      const status = STATUS[j.status] ?? 'posted';
      const source = SOURCE[j.source] ?? j.source;
      const creator = userIds[j.by] ?? null;
      const ins = await c.query(
        `INSERT INTO journals (company_id, branch_code, period_code, journal_no, journal_date, source_type, source_id, rule_code, ref, description, status, total_debit, total_credit, created_by, created_by_name, posted_by, posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14,$15,$16) RETURNING id`,
        [company, j.branch, period.id, j.id, j.date, source, source === 'manual' ? null : j.ref, source === 'manual' ? 'MANUAL' : `AUTO_${source.toUpperCase()}_${j.branch}`, j.ref ?? null, j.desc, status, j.total,
          creator ?? system, j.by, status === 'posted' ? (creator ? userIds['Andi Firmansyah'] : system) : null, status === 'posted' ? `${j.date}T08:00:00Z` : null]);
      let ln = 0;
      for (const l of j.lines) {
        ln += 1;
        await c.query(`INSERT INTO journal_lines (journal_id, company_id, branch_code, journal_date, line_no, account_code, debit, credit, bank_account_code, party, counter_branch) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [ins.rows[0].id, company, j.branch, j.date, ln, l.account, l.debit, l.credit, l.bank ?? null, l.party ?? null, l.interBranch ?? null]);
      }
      n += 1;
    }
    await c.query(`INSERT INTO document_sequences (company_id, doc_type, year, last_no) VALUES ($1, 'JV', 2026, 1000)`, [company]);

    /* Sub-buku minimum untuk rekonsiliasi */
    for (const i of DATA.invoices) {
      await c.query(`INSERT INTO invoices (company_id, branch_code, doc_no, customer_name, invoice_date, due_date, total_gross, cogs_amount, paid_amount, paid_date, bank_account_code, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [company, i.branch, i.id, i.customer, i.date, i.dueDate, i.amount, i.cogs ?? 0, i.paid, i.paidDate ?? null, i.bank ?? null, i.paid <= 0 ? 'belum-dibayar' : i.paid >= i.amount ? 'lunas' : 'sebagian']);
    }
    for (const a of DATA.payables) {
      await c.query(`INSERT INTO ap_invoices (company_id, branch_code, doc_no, supplier_name, po_ref, kind, expense_account_code, invoice_date, due_date, total_gross, paid_amount, paid_date, bank_account_code, three_way_matched, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [company, a.branch, a.id, a.supplier, a.poRef, a.kind === 'jasa' ? 'service' : 'goods', a.account ?? null, a.date, a.dueDate, a.amount, a.paid, a.paidDate ?? null, a.bank ?? null, a.matched, a.status]);
    }
    for (const s of DATA.stockItems) {
      await c.query(`INSERT INTO stock_items (company_id, branch_code, warehouse_code, sku, name, category, uom, on_hand, min_qty, max_qty, avg_cost) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [company, s.branch, s.wh, s.sku, s.name, s.category, s.unit, s.onHand, s.min, s.max, s.cost]);
    }
    for (const a of DATA.assets) {
      await c.query(`INSERT INTO assets (company_id, branch_code, code, name, category, gl_account_code, acquisition_date, acquisition_cost, book_value, monthly_depreciation, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [company, a.branch, a.id, a.name, a.category, a.account, a.acquisitionDate, a.acquisitionCost, a.bookValue, a.monthlyDepr, a.status]);
    }
    for (const p of DATA.payroll) {
      await c.query(`INSERT INTO payslips (company_id, branch_code, doc_no, employee_code, employee_name, dept, period_code, basic, allowance, overtime, deduction, net_pay, status) VALUES ($1,$2,$3,$4,$5,$6,'2026-08',$7,$8,$9,$10,$11,$12)`,
        [company, p.branch, p.id, p.employeeId, p.name, p.dept, p.basic, p.allowance, p.overtime, p.deduction, p.netPay, p.status]);
    }
    await seedSales(c, company, DATA);   // setelah faktur & kartu stok
    await c.query(`INSERT INTO audit_log (company_id, action, entity_type, entity_id, after) VALUES ($1, 'seed.completed', 'company', 'KNM', $2)`, [company, JSON.stringify({ journals: n, users: users.length })]);
    await c.query('COMMIT');
    return { skipped: false, companyId: company, journals: n };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

if (require.main === module) {
  const cfg = loadConfig();
  const url = cfg.DATABASE_ADMIN_URL;
  if (!url) { console.error('DATABASE_ADMIN_URL belum disetel.'); process.exit(1); }
  if (!cfg.SEED_PASSWORD) { console.error('SEED_PASSWORD belum disetel (min. 12 karakter).'); process.exit(1); }
  const root = process.env.PROTOTYPE_ASSETS_DIR || resolve(__dirname, '../../../../prototype/assets');
  seed(url, cfg.SEED_PASSWORD, root).then((r: any) => console.log(r.skipped ? `Seed dilewati: perusahaan sudah ada.${r.upgraded?.length ? ` Dilengkapi: ${r.upgraded.join('; ')}.` : ''}` : `Seed selesai: ${r.journals} jurnal.`))
    .catch((e) => { console.error(e); process.exit(1); });
}
