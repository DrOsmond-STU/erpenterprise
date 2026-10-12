/* Uji akun buku besar per data master: pelanggan, pemasok, barang persediaan, dan jasa menyimpan
   akunnya sendiri (diisi akun bawaan saat dibuat, dapat diubah per data); posting memakai akun
   master; umur piutang/hutang & kartu mitra tetap terekonsiliasi lintas akun; akun bersaldo tidak
   dapat diganti; Pengaturan hanya berisi akun sistem. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, as, db } from './helpers.mjs';

let admin, osmond;
const id = (table, code, field = 'code') => db.get(`SELECT id FROM ${table} WHERE ${field} = ?`, code).id;
const acc = (code) => id('accounts', code);
const JKT = () => id('branches', 'JKT');
const WH = () => id('warehouses', 'WH-JKT');
const ok = (r, msg = '') => { assert.equal(r.status, 200, `${msg} ${JSON.stringify(r.body)}`); return r.body; };
const glPartner = (code, type, pid) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND a.code = ? AND jl.partner_type = ? AND jl.partner_id = ?", code, type, pid).v;
const gl = (code) => db.get("SELECT ROUND(COALESCE(SUM(jl.debit - jl.credit),0),2) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id JOIN accounts a ON a.id = jl.account_id WHERE j.status = 'diposting' AND a.code = ? AND jl.company_id = 1", code).v;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} ≠ ${b}`);
async function reconciled() {
  for (const r of ['umur-piutang', 'umur-hutang']) {
    const x = (await admin.get(`/api/reports/${r}?to=2026-12-31`)).body;
    assert.ok(x.reconciled, `${r}: sub-buku ${x.totals.total} = buku besar ${x.glBalance}`);
  }
}

before(async () => {
  await start();
  admin = await as('admin');
  osmond = await as('osmond');
  await admin.put('/api/settings/security_policy', { apiRateLimitPerMinute: 100000, loginRateLimitPerMinute: 1000 });
  // Akun khusus: piutang ekspor, hutang impor, persediaan & pendapatan lini produk, beban jasa subkon.
  const parent = (code) => acc(code);
  for (const [code, name, type, par, subtype] of [
    ['1-1210', 'Piutang Usaha — Ekspor', 'asset', '1-1000', 'ar'], ['2-1110', 'Hutang Usaha — Impor', 'liability', '2-1000', 'ap'],
    ['1-1345', 'Persediaan Barang Dagangan — Lini Premium', 'asset', '1-1300', 'inventory'], ['4-1150', 'Penjualan Lini Premium', 'revenue', '4', ''],
    ['5-1150', 'HPP Lini Premium', 'cogs', '5', ''], ['6-2970', 'Beban Jasa Subkontraktor', 'expense', '6', ''],
  ]) {
    if (db.get('SELECT id FROM accounts WHERE code = ?', code)) continue;
    ok(await admin.post('/api/e/accounts', { code, name, type, parent_id: parent(par), is_header: 0, subtype, status: 'aktif' }), `akun ${code}`);
  }
});
after(stop);

test('data master baru diisi akun bawaan; pelanggan/pemasok antar perusahaan memakai akun antar perusahaan', async () => {
  const c = ok(await admin.post('/api/e/customers', { code: 'CUJI1', name: 'PT Uji Akun', terms_days: 30 }));
  assert.equal(c.ar_account_id, acc('1-1200')); assert.equal(c.advance_account_id, acc('2-1600')); assert.equal(c.dp_account_id, acc('2-1610'));
  assert.equal(c.deposit_account_id, acc('2-1620')); assert.equal(c.guarantee_account_id, acc('2-1630')); assert.equal(c.discount_account_id, acc('4-1900'));
  assert.equal(c.sales_account_id, null, 'pendapatan mengikuti barang/jasa');
  const ic = ok(await admin.post('/api/e/customers', { code: 'CUJI2', name: 'PT Grup Uji', related_company_id: id('companies', 'KNMT'), terms_days: 30 }));
  assert.equal(ic.ar_account_id, acc('1-1600')); assert.equal(ic.sales_account_id, acc('4-1400'));
  const s = ok(await admin.post('/api/e/suppliers', { code: 'SUJI1', name: 'CV Uji Akun', terms_days: 30 }));
  assert.equal(s.ap_account_id, acc('2-1100')); assert.equal(s.advance_account_id, acc('1-1510')); assert.equal(s.dp_account_id, acc('1-1520'));
  assert.equal(s.deposit_account_id, acc('1-1530')); assert.equal(s.guarantee_account_id, acc('1-1540')); assert.equal(s.discount_account_id, acc('7-1300'));
  const g = ok(await admin.post('/api/e/products', { code: 'UJI-BRG', name: 'Barang uji', kind: 'barang_dagang', uom: 'pcs', price: 100_000 }));
  assert.equal(g.inventory_account_id, acc('1-1340')); assert.equal(g.cogs_account_id, acc('5-1100')); assert.equal(g.delivered_account_id, acc('1-1350'));
  assert.equal(g.revenue_account_id, acc('4-1100')); assert.equal(g.sales_return_account_id, acc('4-1900')); assert.equal(g.expense_account_id, null);
  const j = ok(await admin.post('/api/e/products', { code: 'UJI-JASA', name: 'Jasa uji', kind: 'jasa', uom: 'jam', price: 50_000 }));
  assert.equal(j.inventory_account_id, null, 'jasa tanpa akun persediaan'); assert.equal(j.cogs_account_id, null); assert.equal(j.expense_account_id, acc('5-1100'));
  // Data master lama tanpa akun (mis. hasil konversi lead) diisi saat migrasi; posting tetap memakai akun bawaan bila kosong.
  const seeded = db.get("SELECT ar_account_id FROM customers WHERE code = 'C001'");
  assert.equal(seeded.ar_account_id, acc('1-1200'));
});

test('pelanggan & barang dengan akun khusus: faktur, penerimaan, retur memakai akun master; umur piutang & kartu tetap cocok', async () => {
  const c = ok(await admin.post('/api/e/customers', { code: 'CEKS', name: 'Overseas Buyer Ltd', terms_days: 45, ar_account_id: acc('1-1210') }));
  const p = ok(await admin.post('/api/e/products', { code: 'PRM-01', name: 'Panel premium', kind: 'barang_dagang', uom: 'unit', price: 2_000_000, standard_cost: 1_200_000, inventory_account_id: acc('1-1345'), revenue_account_id: acc('4-1150'), cogs_account_id: acc('5-1150') }));
  // Stok masuk lewat tagihan pembelian → persediaan lini premium.
  const b = ok(await admin.post('/api/e/purchase_bills', { branch_id: JKT(), date: '2026-10-07', supplier_id: id('suppliers', 'S001'), supplier_invoice_no: 'UJI-PRM', warehouse_id: WH(), tax_rate: 11, lines: [{ product_id: p.id, qty: 5, price: 1_200_000 }] }));
  ok(await osmond.post(`/api/e/purchase_bills/${b.id}/actions/post`));
  near(gl('1-1345'), 6_000_000, 'persediaan lini premium');
  const inv = ok(await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: c.id, warehouse_id: WH(), tax_rate: 11, lines: [{ product_id: p.id, qty: 2, price: 2_000_000 }] }));
  ok(await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/post`));
  near(glPartner('1-1210', 'customer', c.id), 4_440_000, 'piutang di akun ekspor');
  near(glPartner('1-1200', 'customer', c.id), 0, 'tidak di akun piutang umum');
  near(gl('4-1150'), -4_000_000, 'pendapatan lini premium');
  near(gl('5-1150'), 2_400_000, 'HPP lini premium');
  near(gl('1-1345'), 3_600_000, 'persediaan berkurang');
  await reconciled();
  const card = (await admin.get(`/api/reports/kartu-mitra?partner_type=customer&partner=${c.id}&from=2026-01-01&to=2026-12-31`)).body;
  assert.equal(card.closing, 4_440_000, 'kartu piutang membaca akun khusus');
  ok(await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-JKT'), amount: 2_000_000, discount: 0, pph23: 0, bank_charge: 0 }));
  near(glPartner('1-1210', 'customer', c.id), 2_440_000, 'pelunasan mengkredit akun ekspor');
  // Akun piutang bersaldo tidak dapat diganti.
  const cur = (await admin.get(`/api/e/customers/${c.id}`)).body;
  const ch = await admin.put(`/api/e/customers/${c.id}`, { row_version: cur.row_version, ar_account_id: acc('1-1200') });
  assert.equal(ch.status, 409, 'akun piutang bersaldo dikunci'); assert.match(ch.body.error, /masih ada saldo/);
  // Akun persediaan barang yang masih berstok dikunci; akun pendapatan boleh diganti.
  const pp = (await admin.get(`/api/e/products/${p.id}`)).body;
  assert.equal((await admin.put(`/api/e/products/${p.id}`, { row_version: pp.row_version, inventory_account_id: acc('1-1340') })).status, 409);
  ok(await admin.put(`/api/e/products/${p.id}`, { row_version: pp.row_version, revenue_account_id: acc('4-1100') }), 'akun pendapatan dapat diganti');
  await reconciled();
});

test('pemasok dengan akun hutang khusus & jasa dengan akun beban: tagihan dan pembayaran memakai akun master', async () => {
  const s = ok(await admin.post('/api/e/suppliers', { code: 'SIMP', name: 'Global Parts Trading', terms_days: 30, ap_account_id: acc('2-1110') }));
  const j = ok(await admin.post('/api/e/products', { code: 'JS-SUB', name: 'Jasa subkon instalasi', kind: 'jasa', uom: 'paket', price: 0, expense_account_id: acc('6-2970') }));
  const b = ok(await admin.post('/api/e/purchase_bills', { branch_id: JKT(), date: '2026-10-07', supplier_id: s.id, supplier_invoice_no: 'GPT-01', tax_rate: 11, lines: [{ product_id: j.id, qty: 1, price: 3_000_000 }] }));
  ok(await osmond.post(`/api/e/purchase_bills/${b.id}/actions/post`));
  near(glPartner('2-1110', 'supplier', s.id), -3_330_000, 'hutang di akun impor');
  near(gl('6-2970'), 3_000_000, 'beban jasa subkon dari akun jasa');
  await reconciled();
  const rina = await as('rina.akuntan');
  const pay = ok(await rina.post(`/api/e/purchase_bills/${b.id}/actions/pay`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-JKT'), amount: 3_330_000, discount: 0, pph23: 0, bank_charge: 0 }));
  ok(await osmond.post(`/api/e/supplier_payments/${pay.redirect.id}/actions/post`));
  near(glPartner('2-1110', 'supplier', s.id), 0, 'pelunasan mendebit akun impor');
  // Akun hutang tanpa saldo boleh diganti.
  const cur = (await admin.get(`/api/e/suppliers/${s.id}`)).body;
  ok(await admin.put(`/api/e/suppliers/${s.id}`, { row_version: cur.row_version, ap_account_id: acc('2-1100') }), 'ganti akun tanpa saldo');
  await reconciled();
});

test('Pengaturan hanya berisi akun sistem; akun data master tidak dapat diatur di sana', async () => {
  const s = (await admin.get('/api/settings')).body.account_map;
  assert.ok(s.inter_branch && s.retained_earnings && s.fx_gain, 'akun sistem tersedia');
  for (const k of ['ar', 'ap', 'inventory', 'cogs', 'sales', 'customer_advance', 'supplier_advance', 'deposit_saldo', 'sales_returns']) assert.ok(!(k in s), `${k} tidak di Pengaturan`);
  assert.equal((await admin.put('/api/settings/account_map', { ar: '1-1210' })).status, 400, 'akun piutang tidak lagi di Pengaturan');
  ok(await admin.put('/api/settings/account_map', { fx_gain: '7-1200' }), 'akun sistem tetap dapat diubah');
});

test('migrasi: kolom akun kosong diisi dari pemetaan lama di Pengaturan, lalu kunci data master dihapus dari Pengaturan', async () => {
  const { upgrade } = await import('../server/upgrade.js');
  const { setSetting, getSetting, clearSettingsCache } = await import('../server/lib/settings.js');
  const cid = id('customers', 'C002');
  db.run('UPDATE customers SET ar_account_id = NULL WHERE id = ?', cid);
  db.run("UPDATE products SET revenue_account_id = NULL WHERE code = 'SV-301'");
  setSetting('account_map', { ar: '1-1210', sales: '4-1150', fx_gain: '7-1200' }, null);
  clearSettingsCache();
  upgrade();
  assert.equal(db.get('SELECT ar_account_id v FROM customers WHERE id = ?', cid).v, acc('1-1210'), 'penyesuaian lama pindah ke pelanggan');
  assert.equal(db.get("SELECT revenue_account_id v FROM products WHERE code = 'SV-301'").v, acc('4-1150'), 'penyesuaian lama pindah ke barang/jasa');
  assert.deepEqual(getSetting('account_map', {}), { fx_gain: '7-1200' }, 'hanya akun sistem tersisa');
  assert.equal(db.get("SELECT ar_account_id v FROM customers WHERE code = 'C001'").v, acc('1-1200'), 'data master lain tidak berubah');
});

test('aset tetap: akun bawaan menurut kategori, akun pelepasan & pemeliharaan per aset, aset aktif hanya boleh ganti akun beban', async () => {
  const pre = acc('6-2970'); // beban jasa subkon (dibuat di before) dipakai sebagai akun pemeliharaan khusus
  const a = ok(await admin.post('/api/e/fixed_assets', { branch_id: JKT(), code: 'AST-UJI-1', name: 'Truk uji', category: 'Kendaraan', acquisition_date: '2026-01-10', cost: 120_000_000, salvage_value: 0, useful_life_months: 60, credit_account_id: acc('1-1130') }));
  assert.equal(a.asset_account_id, acc('1-2400')); assert.equal(a.accum_account_id, acc('1-2410')); assert.equal(a.expense_account_id, acc('6-2500'));
  assert.equal(a.gain_account_id, acc('7-1100')); assert.equal(a.loss_account_id, acc('7-2200')); assert.equal(a.maintenance_account_id, acc('6-2200'));
  ok(await osmond.post(`/api/e/fixed_assets/${a.id}/actions/activate`), 'aktifkan');
  // Aset aktif: akun pemeliharaan & laba pelepasan boleh diganti, nilai perolehan & akun aset tidak.
  let cur = (await admin.get(`/api/e/fixed_assets/${a.id}`)).body;
  ok(await admin.put(`/api/e/fixed_assets/${a.id}`, { row_version: cur.row_version, maintenance_account_id: pre, location: 'Pool Cikarang' }), 'ganti akun pemeliharaan');
  cur = (await admin.get(`/api/e/fixed_assets/${a.id}`)).body;
  assert.equal((await admin.put(`/api/e/fixed_assets/${a.id}`, { row_version: cur.row_version, cost: 1 })).status, 409, 'harga perolehan terkunci');
  assert.equal((await admin.put(`/api/e/fixed_assets/${a.id}`, { row_version: cur.row_version, asset_account_id: acc('1-2300') })).status, 409, 'akun aset terkunci');
  assert.equal((await admin.del(`/api/e/fixed_assets/${a.id}`)).status, 409, 'aset aktif tidak dapat dihapus');
  // Pemeliharaan dibebankan ke akun pemeliharaan aset.
  const before = gl('6-2970'), maint0 = gl('6-2200');
  const mo = ok(await admin.post('/api/e/maintenance_orders', { branch_id: JKT(), asset_id: a.id, scheduled_date: '2026-10-07', cost: 750_000, bank_account_id: id('bank_accounts', 'BCA-JKT'), description: 'Ganti ban' }));
  ok(await osmond.post(`/api/e/maintenance_orders/${mo.id}/actions/complete`));
  near(gl('6-2970') - before, 750_000, 'beban pemeliharaan di akun aset'); near(gl('6-2200') - maint0, 0, 'bukan akun pemeliharaan umum');
  // Pelepasan dengan laba → akun laba pelepasan aset.
  const gain0 = gl('7-1100');
  ok(await osmond.post(`/api/e/fixed_assets/${a.id}/actions/dispose`, { date: '2026-10-07', proceeds: 125_000_000, bank_account_id: id('bank_accounts', 'BCA-JKT') }), 'lepas');
  near(gl('7-1100') - gain0, -5_000_000, 'laba pelepasan');
  assert.ok(!('gain_disposal' in (await admin.get('/api/settings')).body.account_map), 'akun pelepasan tidak lagi di Pengaturan');
});

test('karyawan: akun beban gaji, hutang gaji, PPh 21 & BPJS per karyawan; pembayaran mendebit akun hutang saat posting', async () => {
  if (!db.get("SELECT id FROM accounts WHERE code = '2-1305'")) ok(await admin.post('/api/e/accounts', { code: '2-1305', name: 'Hutang Gaji — Tenaga Kontrak', type: 'liability', parent_id: acc('2-1000'), is_header: 0, subtype: 'current_liability', status: 'aktif' }));
  const CKR = id('branches', 'CKR');
  const e = ok(await admin.post('/api/e/employees', { branch_id: CKR, code: 'EUJI1', name: 'Karyawan Uji', department: 'Produksi', position: 'Operator', basic_salary: 5_000_000, allowance: 0, salary_expense_account_id: acc('5-1400'), salary_payable_account_id: acc('2-1305') }));
  assert.equal(e.pph21_account_id, acc('2-1310')); assert.equal(e.bpjs_account_id, acc('2-1320'), 'kolom kosong diisi akun bawaan');
  const office = ok(await admin.post('/api/e/employees', { branch_id: CKR, code: 'EUJI2', name: 'Staf Uji', department: 'Keuangan', position: 'Admin', basic_salary: 6_000_000, allowance: 0 }));
  assert.equal(office.salary_expense_account_id, acc('6-1000')); assert.equal(office.salary_payable_account_id, acc('2-1300'));
  const tk0 = gl('5-1400'), hp0 = gl('2-1305');
  const run = ok(await admin.post('/api/e/payroll_runs', { branch_id: CKR, period: '2026-11', pay_date: '2026-10-07', bank_account_id: id('bank_accounts', 'BCA-CKR') }));
  ok(await admin.post(`/api/e/payroll_runs/${run.id}/actions/generate`));
  ok(await osmond.post(`/api/e/payroll_runs/${run.id}/actions/approve`));
  ok(await osmond.post(`/api/e/payroll_runs/${run.id}/actions/post`), 'posting');
  const line = db.get('SELECT * FROM payroll_lines WHERE parent_id = ? AND employee_id = ?', run.id, e.id);
  assert.equal(line.payable_account_id, acc('2-1305'), 'akun hutang dicatat pada slip');
  assert.ok(gl('5-1400') - tk0 >= 5_000_000, 'beban tenaga kerja langsung');
  near(gl('2-1305') - hp0, -line.net, 'hutang gaji tenaga kontrak');
  const j = db.get("SELECT id FROM journals WHERE source_type = 'payroll_runs' AND source_id = ? AND description LIKE 'Beban gaji%'", run.id);
  assert.ok(db.get('SELECT COUNT(DISTINCT account_id) n FROM journal_lines WHERE parent_id = ? AND debit > 0', j.id).n >= 2, 'beban dipecah per akun karyawan');
  // Akun hutang diganti setelah posting → pembayaran tetap mendebit akun saat posting.
  const cur = (await admin.get(`/api/e/employees/${e.id}`)).body;
  ok(await admin.put(`/api/e/employees/${e.id}`, { row_version: cur.row_version, salary_payable_account_id: acc('2-1300') }));
  ok(await osmond.post(`/api/e/payroll_runs/${run.id}/actions/pay`), 'bayar');
  near(gl('2-1305') - hp0, 0, 'hutang gaji tenaga kontrak lunas');
  const s = (await admin.get('/api/settings')).body.account_map;
  for (const k of ['salary_expense', 'salary_payable', 'pph21_payable', 'bpjs_payable']) assert.ok(!(k in s), `${k} tidak di Pengaturan`);
});

test('kas & bank: akun biaya bank, giro mundur & selisih kas per rekening; register giro terekonsiliasi; akun giro bersaldo dikunci', async () => {
  for (const [code, name, type, par, subtype] of [['7-2110', 'Biaya Administrasi Bank — Rekening Proyek', 'other_expense', '7', ''], ['1-1255', 'Giro Mundur Diterima — Rekening Proyek', 'asset', '1-1000', 'current_asset'], ['1-1135', 'Bank Mandiri — Rekening Proyek', 'asset', '1-1100', 'cash']]) {
    if (!db.get('SELECT id FROM accounts WHERE code = ?', code)) ok(await admin.post('/api/e/accounts', { code, name, type, parent_id: acc(par), is_header: 0, subtype, status: 'aktif' }), code);
  }
  const plain = ok(await admin.post('/api/e/bank_accounts', { branch_id: JKT(), code: 'KAS-UJI', name: 'Kas uji', bank_name: '—', account_id: acc('1-1110') }));
  assert.equal(plain.charge_account_id, acc('7-2100')); assert.equal(plain.giro_in_account_id, acc('1-1250'));
  assert.equal(plain.giro_out_account_id, acc('2-1150')); assert.equal(plain.cash_diff_account_id, acc('6-2950'));
  const b = ok(await admin.post('/api/e/bank_accounts', { branch_id: JKT(), code: 'MDR-PRJ', name: 'Mandiri Proyek', bank_name: 'Mandiri', account_id: acc('1-1135'), charge_account_id: acc('7-2110'), giro_in_account_id: acc('1-1255') }));
  // Pelunasan transfer dengan biaya bank → akun biaya rekening ini.
  const inv = ok(await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C002'), warehouse_id: WH(), tax_rate: 11, lines: [{ product_id: id('products', 'SV-301'), qty: 4, price: 1_000_000 }] }));
  ok(await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/post`));
  const ch0 = gl('7-2110'), gen0 = gl('7-2100');
  ok(await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: b.id, amount: 1_000_000, discount: 0, pph23: 0, bank_charge: 6_500 }));
  near(gl('7-2110') - ch0, 6_500, 'biaya bank rekening proyek'); near(gl('7-2100') - gen0, 0, 'bukan akun biaya bank umum');
  // Giro disetor ke rekening proyek → akun giro rekening tersebut; register giro tetap cocok.
  const g0 = gl('1-1255');
  ok(await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'giro', bank_account_id: b.id, giro_no: 'BG-UJI-1255', giro_bank: 'BRI', giro_due: '2026-10-07', amount: 2_000_000, discount: 0, pph23: 0, bank_charge: 0 }));
  near(gl('1-1255') - g0, 2_000_000, 'giro belum cair di akun rekening proyek');
  let reg = (await admin.get('/api/reports/giro?side=in')).body;
  assert.ok(reg.reconciled, `register giro ${reg.totals.open} = buku besar ${reg.glBalance}`);
  const cur = (await admin.get(`/api/e/bank_accounts/${b.id}`)).body;
  assert.equal((await admin.put(`/api/e/bank_accounts/${b.id}`, { row_version: cur.row_version, giro_in_account_id: acc('1-1250') })).status, 409, 'akun giro dikunci selama ada giro belum cair');
  const rcp = db.get("SELECT id FROM customer_receipts WHERE giro_no = 'BG-UJI-1255'");
  ok(await osmond.post(`/api/e/customer_receipts/${rcp.id}/actions/giro_clear`, { date: '2026-10-07', bank_charge: 3_000 }), 'giro cair');
  near(gl('1-1255') - g0, 0, 'giro cair mengkredit akun giro rekening'); near(gl('7-2110') - ch0, 9_500, 'biaya kliring di akun rekening');
  reg = (await admin.get('/api/reports/giro?side=in')).body;
  assert.ok(reg.reconciled, 'register giro setelah cair');
  const cur2 = (await admin.get(`/api/e/bank_accounts/${b.id}`)).body;
  ok(await admin.put(`/api/e/bank_accounts/${b.id}`, { row_version: cur2.row_version, giro_in_account_id: acc('1-1250') }), 'akun giro dapat diganti setelah tidak ada giro beredar');
  const s = (await admin.get('/api/settings')).body.account_map;
  for (const k of ['bank_charge', 'giro_receivable', 'giro_payable', 'cash_over_short']) assert.ok(!(k in s), `${k} tidak di Pengaturan`);
});

test('master pajak: kode PPN/PPh 23 dengan akun sendiri; dokumen, pelanggan & pemasok memakai kode pajak; rekap pajak mencakup semua akun', async () => {
  for (const [code, name, type, par, subtype] of [['2-1210', 'PPN Keluaran — Tarif 12%', 'liability', '2-1000', 'current_liability'], ['1-1405', 'PPN Masukan — Tarif 12%', 'asset', '1-1000', 'current_asset'], ['1-1415', 'PPh 23 Dibayar di Muka — BUMN', 'asset', '1-1000', 'current_asset']]) {
    if (!db.get('SELECT id FROM accounts WHERE code = ?', code)) ok(await admin.post('/api/e/accounts', { code, name, type, parent_id: acc(par), is_header: 0, subtype, status: 'aktif' }), code);
  }
  const tax = (code) => db.get('SELECT * FROM taxes WHERE code = ?', code);
  const ppn11 = tax('PPN11'), ppn12 = tax('PPN12'), ppn0 = tax('PPN0'), pph = tax('PPH23');
  assert.ok(ppn11.is_default && pph.is_default, 'kode bawaan PPN 11% & PPh 23');
  assert.equal(ppn11.sales_account_id, acc('2-1200')); assert.equal(ppn11.purchase_account_id, acc('1-1400'));
  assert.equal(pph.sales_account_id, acc('1-1410')); assert.equal(pph.purchase_account_id, acc('2-1330'));
  let cur = (await admin.get(`/api/e/taxes/${ppn12.id}`)).body;
  ok(await admin.put(`/api/e/taxes/${ppn12.id}`, { row_version: cur.row_version, sales_account_id: acc('2-1210'), purchase_account_id: acc('1-1405') }), 'akun PPN 12%');

  // Faktur dengan kode PPN 12% → tarif 12% dan PPN keluaran ke akun kode tersebut.
  const rep0 = (await admin.get('/api/reports/pajak?to=2026-12-31')).body.totals.vatOut;
  const k12 = gl('2-1210'), k11 = gl('2-1200');
  const inv = ok(await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C002'), warehouse_id: WH(), tax_id: ppn12.id, lines: [{ product_id: id('products', 'SV-301'), qty: 2, price: 1_000_000 }] }));
  assert.equal(inv.tax_rate, 12); near(inv.tax, inv.subtotal * 0.12, 'PPN 12%');
  ok(await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/post`));
  near(gl('2-1210') - k12, -inv.tax, 'PPN keluaran akun 12%'); near(gl('2-1200') - k11, 0, 'bukan akun PPN umum');
  near((await admin.get('/api/reports/pajak?to=2026-12-31')).body.totals.vatOut - rep0, inv.tax, 'rekap pajak mencakup akun kode 12%');
  assert.equal((await admin.del(`/api/e/taxes/${ppn12.id}`)).status, 409, 'kode yang dipakai tidak dapat dihapus');

  // Tanpa kode: kode bawaan pelanggan (PPN 0%), lalu bawaan perusahaan; tarif lama dicocokkan ke kode.
  const c5 = id('customers', 'C005');
  cur = (await admin.get(`/api/e/customers/${c5}`)).body;
  ok(await admin.put(`/api/e/customers/${c5}`, { row_version: cur.row_version, tax_id: ppn0.id }));
  const exp = ok(await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: c5, warehouse_id: WH(), lines: [{ product_id: id('products', 'SV-301'), qty: 1, price: 1_000_000 }] }));
  assert.equal(exp.tax_id, ppn0.id); assert.equal(exp.tax, 0, 'PPN 0% dari pelanggan');
  const dom = ok(await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: id('customers', 'C002'), warehouse_id: WH(), lines: [{ product_id: id('products', 'SV-301'), qty: 1, price: 1_000_000 }] }));
  assert.equal(dom.tax_id, ppn11.id); assert.equal(dom.tax_rate, 11, 'kode PPN bawaan');
  const legacy = ok(await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: c5, warehouse_id: WH(), tax_rate: 12, lines: [{ product_id: id('products', 'SV-301'), qty: 1, price: 1_000_000 }] }));
  assert.equal(legacy.tax_id, ppn12.id, 'tarif dicocokkan ke kode');
  cur = (await admin.get(`/api/e/sales_invoices/${dom.id}`)).body;
  const ch = ok(await admin.put(`/api/e/sales_invoices/${dom.id}`, { row_version: cur.row_version, tax_id: ppn12.id }));
  assert.equal(ch.tax_rate, 12, 'ganti kode → tarif ikut');
  assert.equal((await admin.post('/api/e/sales_invoices', { branch_id: JKT(), date: '2026-10-07', customer_id: c5, warehouse_id: WH(), tax_id: pph.id, lines: [{ product_id: id('products', 'SV-301'), qty: 1, price: 1 }] })).status, 400, 'kode PPh tidak untuk PPN dokumen');
  cur = (await admin.get(`/api/e/customers/${c5}`)).body;
  ok(await admin.put(`/api/e/customers/${c5}`, { row_version: cur.row_version, tax_id: null }));

  // PPh 23 dengan akun sendiri (mis. pemotong BUMN) saat penerimaan.
  const bumn = ok(await admin.post('/api/e/taxes', { code: 'PPH23-BUMN', name: 'PPh 23 dipotong BUMN', kind: 'pph23', rate: 2, sales_account_id: acc('1-1415') }));
  assert.equal(bumn.purchase_account_id, acc('2-1330'), 'akun kosong diisi bawaan jenisnya');
  const p0 = gl('1-1415'), pg0 = gl('1-1410');
  ok(await osmond.post(`/api/e/sales_invoices/${inv.id}/actions/receive`, { date: '2026-10-07', source: 'bank', bank_account_id: id('bank_accounts', 'BCA-JKT'), amount: 1_000_000, discount: 0, pph23: 40_000, pph_tax_id: bumn.id, bank_charge: 0 }));
  near(gl('1-1415') - p0, 40_000, 'PPh 23 ke akun kode BUMN'); near(gl('1-1410') - pg0, 0, 'bukan akun PPh 23 umum');
  await reconciled();

  // Satu kode bawaan per jenis.
  const alt = ok(await admin.post('/api/e/taxes', { code: 'PPN11-ALT', name: 'PPN 11% alternatif', kind: 'ppn', rate: 11, is_default: 1 }));
  assert.equal(tax('PPN11').is_default, 0, 'bawaan lama dilepas');
  cur = (await admin.get(`/api/e/taxes/${ppn11.id}`)).body;
  ok(await admin.put(`/api/e/taxes/${ppn11.id}`, { row_version: cur.row_version, is_default: 1 }));
  assert.equal(tax('PPN11-ALT').is_default, 0);
  ok(await admin.del(`/api/e/taxes/${alt.id}`), 'kode belum dipakai dapat dihapus');

  const s = (await admin.get('/api/settings')).body.account_map;
  for (const k of ['vat_out', 'vat_in', 'pph23_prepaid', 'pph23_payable']) assert.ok(!(k in s), `${k} tidak di Pengaturan`);
});
