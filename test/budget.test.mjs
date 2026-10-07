/* Uji penganggaran: anggaran COA bulanan + alur persetujuan, laporan anggaran vs
   realisasi (konsisten dengan buku besar), kontrol anggaran, salin anggaran,
   anggaran proyek (RAB), komitmen PO, dan laporan proyek. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db } from './helpers.mjs';

let admin, osmond, rina;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const acc = (code) => id('accounts', code);
const KNM = () => id('companies', 'KNM');
const JKT = () => id('branches', 'JKT');
const months = (b) => Array.from({ length: 12 }, (_, i) => b[`m${String(i + 1).padStart(2, '0')}`]);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  rina = await as('rina.akuntan');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
});
after(stop);

test('anggaran merata dibagi 12 bulan; pola manual menjumlahkan bulan; duplikat & akun induk ditolak', async () => {
  const b = await rina.post(`/api/e/budgets?company=${KNM()}`, { branch_id: JKT(), year: 2027, account_id: acc('6-2600'), phasing: 'rata', amount: 100_000_000 });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.status, 'draf');
  const m = months(b.body);
  near(m.reduce((s, x) => s + x, 0), 100_000_000, 'jumlah bulan = setahun');
  near(m[0], 8_333_333.33, 'Januari');

  const manual = await rina.post(`/api/e/budgets?company=${KNM()}`, { branch_id: JKT(), year: 2027, account_id: acc('6-2400'), phasing: 'manual', m01: 10_000_000, m06: 20_000_000, m12: 30_000_000 });
  assert.equal(manual.status, 200, JSON.stringify(manual.body));
  assert.equal(manual.body.amount, 60_000_000);

  const upd = await rina.put(`/api/e/budgets/${b.body.id}?company=${KNM()}`, { amount: 120_000_000, row_version: b.body.row_version });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  near(upd.body.m01, 10_000_000, 'pembagian ulang setelah diubah');

  const dup = await rina.post(`/api/e/budgets?company=${KNM()}`, { branch_id: JKT(), year: 2027, account_id: acc('6-2600'), phasing: 'rata', amount: 1_000_000 });
  assert.equal(dup.status, 400);
  const header = await rina.post(`/api/e/budgets?company=${KNM()}`, { branch_id: JKT(), year: 2027, account_id: acc('6'), phasing: 'rata', amount: 1_000_000 });
  assert.equal(header.status, 400);
});

test('alur persetujuan anggaran: ajukan → pemisahan tugas → setujui → revisi; laporan memakai versi disetujui', async () => {
  const b = await rina.post(`/api/e/budgets?company=${KNM()}`, { branch_id: JKT(), year: 2027, account_id: acc('6-2100'), phasing: 'rata', amount: 240_000_000 });
  assert.equal((await rina.post(`/api/e/budgets/${b.body.id}/actions/submit?company=${KNM()}`)).status, 200);
  assert.equal((await rina.post(`/api/e/budgets/${b.body.id}/actions/approve?company=${KNM()}`)).status, 403, 'pembuat tidak boleh menyetujui');
  const inbox = (await osmond.get(`/api/approvals?company=${KNM()}`)).body;
  assert.ok(inbox.some((a) => a.entity === 'budgets' && a.id === b.body.id), 'muncul di Kotak Persetujuan');

  const before = (await admin.get(`/api/reports/anggaran?company=${KNM()}&year=2027&to=2027-06-30`)).body;
  const ap = await osmond.post(`/api/e/budgets/${b.body.id}/actions/approve?company=${KNM()}`);
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  assert.equal(ap.body.record.status, 'disetujui');
  const after = (await admin.get(`/api/reports/anggaran?company=${KNM()}&year=2027&to=2027-06-30`)).body;
  near(after.summary.cost.budget - before.summary.cost.budget, 240_000_000, 'anggaran disetujui masuk laporan');
  const semua = (await admin.get(`/api/reports/anggaran?company=${KNM()}&year=2027&to=2027-06-30&version=semua`)).body;
  assert.ok(semua.summary.cost.budget > after.summary.cost.budget, 'versi "semua" memuat draf');

  assert.equal((await rina.post(`/api/e/budgets/${b.body.id}/actions/revise?company=${KNM()}`)).status, 403, 'revisi butuh tingkat setujui');
  const rv = await osmond.post(`/api/e/budgets/${b.body.id}/actions/revise?company=${KNM()}`);
  assert.equal(rv.body.record.status, 'draf');
  const back = (await admin.get(`/api/reports/anggaran?company=${KNM()}&year=2027&to=2027-06-30`)).body;
  near(back.summary.cost.budget, before.summary.cost.budget, 'revisi mengeluarkan anggaran dari laporan');
});

test('laporan anggaran vs realisasi: realisasi = laba rugi buku besar, anggaran s.d. periode diprorata', async () => {
  const c = KNM();
  const r = (await admin.get(`/api/reports/anggaran?company=${c}&year=2026&to=2026-10-07`)).body;
  const pl = (await admin.get(`/api/reports/laba-rugi?company=${c}&from=2026-01-01&to=2026-10-07`)).body;
  const net = pl.blocks.find((b) => b.grand).values;
  near(r.summary.net.actual, Object.values(net)[0], 'laba bersih realisasi = laba rugi');
  // Anggaran s.d. 7 Oktober = Jan–Sep + 7/31 Oktober.
  const all = db.all("SELECT * FROM budgets WHERE company_id = ? AND year = 2026 AND status = 'disetujui'", c);
  const sales = all.filter((b) => b.account_id === acc('4-1100'));
  const exp = sales.reduce((s, b) => s + months(b).slice(0, 9).reduce((a, x) => a + x, 0) + b.m10 * 7 / 31, 0);
  const row = r.sections.find((s) => s.key === 'revenue').rows.find((x) => x.code === '4-1100');
  near(row.ytdBudget, exp, 'anggaran s.d. periode');
  assert.equal(row.favorable, row.actual >= row.ytdBudget, 'pendapatan menguntungkan bila di atas anggaran');
  // Akun induk = jumlah anak; akun tanpa anggaran ditandai.
  const opex = r.sections.find((s) => s.key === 'expense');
  const head = opex.rows.find((x) => x.header && x.level === 0);
  near(head.actual, opex.rows.filter((x) => !x.header).reduce((s, x) => s + x.actual, 0), 'agregasi induk');
  assert.ok(r.sections.flatMap((s) => s.rows).some((x) => x.noBudget), 'ada akun tanpa anggaran');
  // Tampilan bulanan & per pusat biaya.
  const m = (await admin.get(`/api/reports/anggaran?company=${c}&year=2026&to=2026-10-07&view=bulanan`)).body;
  assert.equal(m.sections[0].rows[0].months.length, 12);
  const cc = (await admin.get(`/api/reports/anggaran?company=${c}&year=2026&to=2026-10-07&view=pusat-biaya`)).body;
  assert.ok(cc.costCenters.some((x) => x.code === 'CC-300' && x.cost.actual > 0));
  // Kolom realisasi di daftar anggaran = realisasi buku besar (per cabang & pusat biaya).
  const rent = db.get("SELECT b.id FROM budgets b JOIN accounts a ON a.id = b.account_id WHERE a.code = '6-2000' AND b.branch_id = ? AND b.year = 2026", JKT()).id;
  const listed = (await admin.get(`/api/e/budgets/${rent}?company=${c}`)).body;
  const gl = db.get("SELECT ROUND(SUM(jl.debit - jl.credit),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status = 'diposting' AND jl.account_id = ? AND jl.branch_id = ? AND jl.cost_center_id = ? AND j.date LIKE '2026-%'", acc('6-2000'), JKT(), id('cost_centers', 'CC-100')).v;
  assert.equal(listed.actual, gl, 'realisasi daftar anggaran = buku besar');
  assert.ok(listed.usage > 0);
  // Bagan akun: anggaran per akun.
  const coa = (await admin.get(`/api/reports/anggaran-akun?company=${c}&year=2026&to=2026-10-07`)).body;
  near(coa.accounts[acc('4-1100')].budget, 19_200_000_000, 'anggaran 4-1100 di bagan akun');
});

test('kontrol anggaran: peringatan atau blokir transaksi yang melampaui anggaran', async () => {
  const c = KNM();
  const bank = id('bank_accounts', 'KAS-JKT');
  const mk = async () => (await rina.post(`/api/e/cash_transactions?company=${c}`, { date: '2026-10-07', direction: 'keluar', bank_account_id: bank, description: 'Biaya pemasaran besar', lines: [{ account_id: acc('6-2400'), amount: 500_000_000 }] })).body.id;
  await admin.put('/api/settings/approval_policy', { budgetControl: 'block' });
  const blocked = await osmond.post(`/api/e/cash_transactions/${await mk()}/actions/post?company=${c}`);
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /Kontrol anggaran/);
  await admin.put('/api/settings/approval_policy', { budgetControl: 'warn' });
  const warned = await osmond.post(`/api/e/cash_transactions/${await mk()}/actions/post?company=${c}`);
  assert.equal(warned.status, 200, JSON.stringify(warned.body));
  assert.match(warned.body.message, /Peringatan anggaran/);
  assert.equal((await admin.put('/api/settings/approval_policy', { budgetControl: 'longgar' })).status, 400);
});

test('salin anggaran 2026 → 2028 dengan penyesuaian, sebagai draf dan teraudit', async () => {
  const c = KNM();
  const r = await rina.post(`/api/budgets/copy?company=${c}`, { fromYear: 2026, toYear: 2028, adjustPct: 10, basis: 'anggaran' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const src = db.get("SELECT COUNT(*) n, SUM(amount) a FROM budgets WHERE company_id = ? AND year = 2026 AND status = 'disetujui'", c);
  const dst = db.get("SELECT COUNT(*) n, SUM(amount) a, SUM(status = 'draf') d FROM budgets WHERE company_id = ? AND year = 2028", c);
  assert.equal(r.body.created, src.n);
  assert.equal(dst.d, dst.n, 'seluruh salinan berstatus draf');
  assert.ok(Math.abs(dst.a - src.a * 1.1) < 1, 'penyesuaian +10% (selisih pembulatan bulanan < Rp 1)');
  const again = (await rina.post(`/api/budgets/copy?company=${c}`, { fromYear: 2026, toYear: 2028, adjustPct: 10 })).body;
  assert.equal(again.created, 0); assert.equal(again.skipped, src.n);
  const real = (await rina.post(`/api/budgets/copy?company=${c}`, { fromYear: 2026, toYear: 2029, basis: 'realisasi' })).body;
  assert.ok(real.created > 5, 'salin dari realisasi');
  assert.ok(db.get("SELECT id FROM audit_log WHERE action = 'budgets.copy'"), 'tercatat di jejak audit');
  const sales = await as('sari.sales');
  assert.equal((await sales.post(`/api/budgets/copy`, { fromYear: 2026, toYear: 2030 })).status, 403);
});

test('anggaran proyek (RAB): total dari rincian, realisasi dari tagihan & kas berdimensi proyek, komitmen PO, laporan proyek', async () => {
  const c = KNM();
  const p = await admin.post(`/api/e/projects?company=${c}`, { branch_id: JKT(), code: 'PRJ-UJI', name: 'Proyek uji anggaran', contract_value: 300_000_000, start_date: '2026-09-01', end_date: '2026-12-31', progress: 25, status: 'berjalan',
    lines: [{ account_id: acc('5-1300'), description: 'Material', amount: 120_000_000 }, { account_id: acc('6-2900'), description: 'Subkon', amount: 80_000_000 }] });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.budget, 200_000_000, 'RAB = jumlah rincian');
  const pid = p.body.id;

  // Tagihan dengan proyek di header → baris beban berdimensi proyek.
  const bill = await rina.post(`/api/e/purchase_bills?company=${c}`, { branch_id: JKT(), date: '2026-10-06', supplier_id: id('suppliers', 'S004'), supplier_invoice_no: 'UJI-PRJ-1', project_id: pid, tax_rate: 11, lines: [{ account_id: acc('5-1300'), qty: 1, price: 90_000_000 }] });
  assert.equal((await osmond.post(`/api/e/purchase_bills/${bill.body.id}/actions/post?company=${c}`)).status, 200);
  // Kas keluar berdimensi proyek pada baris.
  const cash = await rina.post(`/api/e/cash_transactions?company=${c}`, { date: '2026-10-06', direction: 'keluar', bank_account_id: id('bank_accounts', 'BCA-JKT'), description: 'Subkon uji', lines: [{ account_id: acc('6-2900'), amount: 30_000_000, project_id: pid }] });
  assert.equal((await osmond.post(`/api/e/cash_transactions/${cash.body.id}/actions/post?company=${c}`)).status, 200);
  // PO proyek → komitmen; PO melampaui sisa RAB menunggu persetujuan dengan peringatan.
  const po = await admin.post(`/api/e/purchase_orders?company=${c}`, { branch_id: JKT(), date: '2026-10-06', supplier_id: id('suppliers', 'S001'), warehouse_id: id('warehouses', 'WH-JKT'), project_id: pid, tax_rate: 11, lines: [{ product_id: id('products', 'SV-302'), qty: 40, price: 2_500_000 }] });
  const sub = await admin.post(`/api/e/purchase_orders/${po.body.id}/actions/submit?company=${c}`);
  assert.equal(sub.body.record.status, 'menunggu', 'melebihi RAB → perlu persetujuan');
  assert.match(sub.body.message, /anggaran proyek/i);
  // Faktur termin berdimensi proyek → pendapatan proyek.
  const inv = await admin.post(`/api/e/sales_invoices?company=${c}`, { branch_id: JKT(), date: '2026-10-06', customer_id: id('customers', 'C001'), warehouse_id: id('warehouses', 'WH-JKT'), project_id: pid, tax_rate: 11, lines: [{ product_id: id('products', 'SV-301'), qty: 300, price: 350_000 }] });
  assert.equal((await osmond.post(`/api/e/sales_invoices/${inv.body.id}/actions/post?company=${c}`)).status, 200);

  const d = (await admin.get(`/api/reports/proyek-detail?company=${c}&project=${pid}&to=2026-10-07`)).body;
  assert.equal(d.figures.cost, 120_000_000);
  assert.equal(d.figures.commitment, 100_000_000);
  assert.equal(d.figures.available, -20_000_000);
  assert.equal(d.figures.revenue, 105_000_000);
  assert.equal(d.figures.ev, 50_000_000, 'EV = RAB × kemajuan');
  near(d.figures.cpi, 0.42, 'CPI');
  assert.equal(d.figures.health, 'kritis');
  const mat = d.costRows.find((x) => x.code === '5-1300');
  assert.equal(mat.actual, 90_000_000); assert.equal(mat.commitment, 100_000_000);
  assert.ok(d.transactions.length >= 3 && d.curve.length >= 2);

  const list = (await admin.get(`/api/e/projects/${pid}?company=${c}`)).body;
  assert.equal(list.actual, 120_000_000); assert.equal(list.remaining, 80_000_000);
  const sum = (await admin.get(`/api/reports/proyek?company=${c}&to=2026-10-07`)).body;
  assert.ok(sum.rows.find((x) => x.id === pid));
  near(sum.totals.cost, sum.rows.reduce((s, x) => s + x.cost, 0), 'total ringkasan');

  // Hak akses: staf penjualan (proyek: lihat) boleh membaca laporan proyek, tetapi bukan laporan anggaran COA.
  const sales = await as('sari.sales');
  assert.equal((await sales.get('/api/reports/proyek')).status, 200);
  assert.equal((await sales.get('/api/reports/anggaran?year=2026')).status, 403);
  // Proyek perusahaan lain tidak dapat dibuka (anti-IDOR).
  assert.equal((await admin.get(`/api/reports/proyek-detail?company=${id('companies', 'NLP')}&project=${pid}`)).status, 400);
});

test('proyek terbawa dari PR → PO → tagihan dan SO → faktur', async () => {
  const c = KNM();
  const pid = id('projects', 'PRJ-02');
  const so = await admin.post(`/api/e/sales_orders?company=${c}`, { branch_id: JKT(), date: '2026-10-06', customer_id: id('customers', 'C006'), warehouse_id: id('warehouses', 'WH-JKT'), project_id: pid, tax_rate: 11, lines: [{ product_id: id('products', 'SV-301'), qty: 10, price: 350_000 }] });
  await admin.post(`/api/e/sales_orders/${so.body.id}/actions/submit?company=${c}`);
  if ((await admin.get(`/api/e/sales_orders/${so.body.id}?company=${c}`)).body.status === 'menunggu') await osmond.post(`/api/e/sales_orders/${so.body.id}/actions/approve?company=${c}`);
  const inv = await admin.post(`/api/e/sales_orders/${so.body.id}/actions/to_invoice?company=${c}`);
  assert.equal(db.get('SELECT project_id FROM sales_invoices WHERE id = ?', inv.body.redirect.id).project_id, pid);

  const pr = await admin.post(`/api/e/purchase_requests?company=${c}`, { branch_id: JKT(), date: '2026-10-06', requester: 'Wahyu', project_id: pid, lines: [{ product_id: id('products', 'SV-302'), qty: 1, price: 2_500_000 }] });
  await admin.post(`/api/e/purchase_requests/${pr.body.id}/actions/submit?company=${c}`);
  await osmond.post(`/api/e/purchase_requests/${pr.body.id}/actions/approve?company=${c}`);
  const po = await admin.post(`/api/e/purchase_requests/${pr.body.id}/actions/to_po?company=${c}`, { supplier_id: id('suppliers', 'S001'), warehouse_id: id('warehouses', 'WH-JKT') });
  assert.equal(po.status, 200, JSON.stringify(po.body));
  const poId = po.body.redirect.id;
  assert.equal(db.get('SELECT project_id FROM purchase_orders WHERE id = ?', poId).project_id, pid);
  await admin.post(`/api/e/purchase_orders/${poId}/actions/submit?company=${c}`);
  if ((await admin.get(`/api/e/purchase_orders/${poId}?company=${c}`)).body.status === 'menunggu') await osmond.post(`/api/e/purchase_orders/${poId}/actions/approve?company=${c}`);
  const bill = await admin.post(`/api/e/purchase_orders/${poId}/actions/to_bill?company=${c}`, { supplier_invoice_no: 'UJI-PR-PO' });
  assert.equal(db.get('SELECT project_id FROM purchase_bills WHERE id = ?', bill.body.redirect.id).project_id, pid);
});

test('peningkatan basis data lama: anggaran tanpa rincian bulanan dibagi rata dan dianggap disetujui', async () => {
  const { upgrade } = await import('../server/upgrade.js');
  const b = db.get("SELECT id, amount FROM budgets WHERE status = 'disetujui' LIMIT 1");
  db.run('UPDATE budgets SET status = NULL, phasing = NULL, m01 = NULL WHERE id = ?', b.id);
  upgrade();
  const after = db.get('SELECT * FROM budgets WHERE id = ?', b.id);
  assert.equal(after.status, 'disetujui'); assert.equal(after.phasing, 'rata');
  near(months(after).reduce((s, x) => s + x, 0), b.amount, 'bulan = setahun');
});
