/* ==========================================================================
   Inisialisasi basis data.
   - Produksi: hanya peran, bagan akun, satu perusahaan, dan akun admin
     (sandi dari ADMIN_INITIAL_PASSWORD, wajib diganti saat masuk pertama).
   - Demo: grup 3 perusahaan, 7 cabang, data induk, dan transaksi Jan–Okt 2026
     yang SELURUHNYA dibuat lewat layanan CRUD & aksi dokumen yang sama dengan
     antarmuka — sehingga buku besar, stok, dan sub-buku selalu konsisten.
   ========================================================================== */
import * as db from './db.js';
import * as crud from './modules/crud.js';
import { resolveScope, permissionsFor } from './security/rbac.js';
import { setPassword } from './security/auth.js';
import { setSetting } from './lib/settings.js';
import { nowIso, setToday, round2, monthEnd } from './lib/util.js';
import { ROLES, COMPANIES, BRANCHES, COA, PRODUCTS, BOMS } from './seed-master.js';
import { DEFAULT_SECURITY_POLICY } from './config.js';

export const DEMO_PASSWORD = 'Erp#Demo2026!';

const id = (table, field, value) => db.get(`SELECT id FROM "${table}" WHERE "${field}" = ?`, value)?.id;
const A = (code) => id('accounts', 'code', code);

function seedCore() {
  for (const r of ROLES) {
    const rid = db.insert('roles', { code: r.code, name: r.name, description: r.description, created_at: nowIso() });
    for (const [m, lvl] of Object.entries(r.perms)) db.run('INSERT INTO role_permissions(role_id, module, level) VALUES (?, ?, ?)', rid, m, lvl);
  }
  const ids = {};
  for (const [code, name, type, parent, header, subtype = null, cf = 'operating', ic = 0] of COA) {
    ids[code] = db.insert('accounts', { code, name, type, parent_id: parent ? ids[parent] : null, is_header: header, subtype, cash_flow: cf, is_intercompany: ic, status: 'aktif', created_at: nowIso() });
  }
  setSetting('security_policy', DEFAULT_SECURITY_POLICY);
}

async function createUser({ username, full_name, email, role, company = null, branch = null, password, mustChange = false }) {
  const uid = db.insert('users', {
    username, full_name, email, role_id: id('roles', 'code', role), company_id: company ? id('companies', 'code', company) : null,
    branch_id: branch ? id('branches', 'code', branch) : null, status: 'aktif', mfa_enabled: 0, failed_attempts: 0, created_at: nowIso(),
  });
  await setPassword(uid, password, { mustChange });
  return uid;
}

export async function seed({ demo = true, adminPassword = '' } = {}) {
  if (!demo) {
    // Validasi sebelum menulis apa pun agar inisialisasi gagal bersih.
    const { checkPasswordPolicy } = await import('./security/auth.js');
    const errs = await checkPasswordPolicy(adminPassword, { username: 'admin' });
    if (errs.length) throw new Error(`ADMIN_INITIAL_PASSWORD harus ${errs.join(', ')}.`);
  }
  db.tx(() => {
    seedCore();
    for (const c of demo ? COMPANIES : COMPANIES.slice(0, 1)) {
      db.insert('companies', { code: c.code, name: c.name, legal_name: c.legal_name, npwp: c.npwp, address: c.address, currency: 'IDR', parent_id: c.parent ? id('companies', 'code', c.parent) : null, ownership_pct: c.ownership_pct, status: 'aktif', created_at: nowIso() });
    }
    for (const [co, code, name, city, ho] of BRANCHES) {
      const cid = id('companies', 'code', co);
      if (cid) db.insert('branches', { company_id: cid, code, name, city, is_head_office: ho, status: 'aktif', created_at: nowIso() });
    }
  });
  if (!demo) {
    await createUser({ username: 'admin', full_name: 'Administrator', email: 'admin@localhost', role: 'ADMIN', password: adminPassword, mustChange: true });
    return;
  }
  await createUser({ username: 'admin', full_name: 'Administrator Sistem', email: 'admin@knm.co.id', role: 'ADMIN', password: DEMO_PASSWORD });
  await createUser({ username: 'osmond', full_name: 'Osmond Pratama', email: 'osmond@knm.co.id', role: 'DIREKSI', password: DEMO_PASSWORD });
  await createUser({ username: 'rina.akuntan', full_name: 'Rina Kartika', email: 'rina@knm.co.id', role: 'AKUNTAN', password: DEMO_PASSWORD });
  await createUser({ username: 'budi.ops', full_name: 'Budi Santoso', email: 'budi@knm.co.id', role: 'OPS', company: 'KNM', password: DEMO_PASSWORD });
  await createUser({ username: 'sari.sales', full_name: 'Sari Wulandari', email: 'sari@knm.co.id', role: 'SALES', company: 'KNM', branch: 'JKT', password: DEMO_PASSWORD });
  await createUser({ username: 'agus.gudang', full_name: 'Agus Setiawan', email: 'agus@knm.co.id', role: 'GUDANG', company: 'KNM', branch: 'CKR', password: DEMO_PASSWORD });
  await createUser({ username: 'dewi.hr', full_name: 'Dewi Lestari', email: 'dewi@knm.co.id', role: 'HR', company: 'KNM', password: DEMO_PASSWORD });
  await createUser({ username: 'yoga.kasir', full_name: 'Yoga Prasetyo', email: 'yoga@knm.co.id', role: 'KASIR', company: 'KNM', branch: 'MDN', password: DEMO_PASSWORD });
  await createUser({ username: 'auditor', full_name: 'Maya Hidayat', email: 'maya.audit@knm.co.id', role: 'AUDITOR', password: DEMO_PASSWORD });
  await seedDemo();
}

/* ======================================================================== */
/* Data demo                                                                */
/* ======================================================================== */
let rngState = 20260101;
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) % 4294967296; return rngState / 4294967296; };
const rint = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const d = (m, day) => `2026-${String(m).padStart(2, '0')}-${String(Math.min(day, Number(monthEnd(2026, m).slice(8)))).padStart(2, '0')}`;

function makeCtx(username) {
  const user = db.get('SELECT * FROM users WHERE username = ?', username);
  return { user, perms: permissionsFor(user.role_id), ip: '127.0.0.1', ua: 'seed', headers: {} };
}

async function seedDemo() {
  const maker = makeCtx('admin');
  const checker = makeCtx('osmond');
  const CO = Object.fromEntries(COMPANIES.map((c) => [c.code, id('companies', 'code', c.code)]));
  const BR = Object.fromEntries(BRANCHES.map(([, code]) => [code, id('branches', 'code', code)]));
  const at = (ctx, co, br = null) => resolveScope(ctx, CO[co], br ? BR[br] : 'all');
  const mk = async (ctx, co, br, entity, body) => (await crud.create(at(ctx, co, br), entity, body)).id;
  const run = async (ctx, co, entity, docId, action, params = {}) => crud.runAction(at(ctx, co), entity, docId, action, params);

  /* --- Data induk global ----------------------------------------------------- */
  const acctFor = { bahan_baku: ['1-1310', '4-1200', '5-1100'], barang_jadi: ['1-1330', '4-1100', '5-1100'], barang_dagang: ['1-1340', '4-1200', '5-1200'], jasa: [null, '4-1300', '5-1300'] };
  const P = {};
  for (const [code, name, kind, category, uom, price, cost, min] of PRODUCTS) {
    const [inv, rev, cogs] = acctFor[kind];
    P[code] = await mk(maker, 'KNM', null, 'products', { code, name, kind, category, uom, price, standard_cost: cost, min_stock: min, max_stock: min * 6, inventory_account_id: inv ? A(inv) : null, revenue_account_id: A(rev), cogs_account_id: A(cogs), status: 'aktif' });
  }
  const BOM = {};
  for (const [code, name, fg, comps] of BOMS) {
    BOM[fg] = await mk(maker, 'KNM', null, 'boms', { code, name, product_id: P[fg], output_qty: 1, status: 'aktif', lines: comps.map(([c, q]) => ({ component_id: P[c], qty: q })) });
  }

  /* --- Gudang, rekening, pusat biaya ---------------------------------------- */
  const WH = {};
  for (const [co, br, code, name] of [['KNM', 'JKT', 'WH-JKT', 'Gudang Jakarta'], ['KNM', 'CKR', 'WH-CKR', 'Gudang Pabrik Cikarang'], ['KNM', 'SBY', 'WH-SBY', 'Gudang Distribusi Surabaya'], ['KNM', 'MDN', 'WH-MDN', 'Gudang Toko Medan'], ['KNMT', 'TJK', 'WH-TJK', 'Gudang Showroom'], ['NLP', 'NJK', 'WH-NJK', 'Gudang Transit Cakung']]) {
    WH[code] = await mk(maker, co, br, 'warehouses', { code, name, status: 'aktif' });
  }
  const BA = {};
  for (const [co, br, code, name, bank, no, acc] of [
    ['KNM', 'JKT', 'BCA-JKT', 'BCA Operasional Jakarta', 'BCA', '5270 1188 21', '1-1130'], ['KNM', 'JKT', 'MDR-PAY', 'Mandiri Penggajian', 'Mandiri', '1270 0099 8812', '1-1140'],
    ['KNM', 'JKT', 'KAS-JKT', 'Kas Kecil Jakarta', '—', '—', '1-1110'], ['KNM', 'CKR', 'BCA-CKR', 'BCA Pabrik Cikarang', 'BCA', '5270 2200 13', '1-1130'],
    ['KNM', 'CKR', 'KAS-CKR', 'Kas Kecil Cikarang', '—', '—', '1-1110'], ['KNM', 'SBY', 'BCA-SBY', 'BCA Surabaya', 'BCA', '0880 3311 45', '1-1130'],
    ['KNM', 'SBY', 'KAS-SBY', 'Kas Kecil Surabaya', '—', '—', '1-1110'], ['KNM', 'MDN', 'BRI-MDN', 'BRI Medan', 'BRI', '0331 01 000771 30 9', '1-1150'],
    ['KNM', 'MDN', 'KAS-MDN', 'Laci Kasir Toko Medan', '—', '—', '1-1120'],
    ['NLP', 'NJK', 'NLP-BCA', 'BCA Operasional NLP', 'BCA', '7710 5521 90', '1-1130'], ['NLP', 'NJK', 'NLP-KAS', 'Kas Kecil NLP', '—', '—', '1-1110'],
    ['NLP', 'NSB', 'NLP-MDR', 'Mandiri NLP Surabaya', 'Mandiri', '1410 0021 5521', '1-1140'],
    ['KNMT', 'TJK', 'TRD-BCA', 'BCA KNM Trading', 'BCA', '6650 1290 11', '1-1130'], ['KNMT', 'TJK', 'TRD-KAS', 'Laci Kasir Showroom', '—', '—', '1-1120'],
  ]) BA[code] = await mk(maker, co, br, 'bank_accounts', { code, name, bank_name: bank, account_no: no, account_id: A(acc), currency: 'IDR', status: 'aktif' });

  const CC = {};
  for (const [code, name, dept, kind] of [['CC-100', 'Direksi & Umum', 'Umum', 'OPEX'], ['CC-200', 'Penjualan & Pemasaran', 'Penjualan', 'OPEX'], ['CC-300', 'Produksi', 'Produksi', 'OPEX'], ['CC-310', 'Mesin Baru Lini C', 'Produksi', 'CAPEX'], ['CC-400', 'Gudang & Logistik', 'Logistik', 'OPEX'], ['CC-500', 'Keuangan & Akuntansi', 'Keuangan', 'OPEX'], ['CC-600', 'Teknologi Informasi', 'TI', 'OPEX'], ['CC-610', 'Infrastruktur TI', 'TI', 'CAPEX'], ['CC-700', 'SDM', 'SDM', 'OPEX']]) {
    CC[code] = await mk(maker, 'KNM', null, 'cost_centers', { code, name, department: dept, kind, status: 'aktif' });
  }

  /* --- Pelanggan & pemasok -------------------------------------------------- */
  const CU = {};
  for (const [co, code, name, seg, city, limit, terms, status = 'aktif', related = null] of [
    ['KNM', 'C001', 'PT Astra Komponen Indonesia', 'Korporasi', 'Jakarta', 6_000_000_000, 30], ['KNM', 'C002', 'PT Wijaya Karya Industri', 'Korporasi', 'Jakarta', 4_000_000_000, 45],
    ['KNM', 'C003', 'CV Sinar Elektrik', 'Distributor', 'Surabaya', 2_500_000_000, 30], ['KNM', 'C004', 'PT Mega Konstruksi', 'Korporasi', 'Bekasi', 3_000_000_000, 30],
    ['KNM', 'C005', 'PT Sumber Makmur Retail', 'Ritel', 'Medan', 900_000_000, 30], ['KNM', 'C006', 'Dinas PU Provinsi Jawa Timur', 'Pemerintah', 'Surabaya', 2_500_000_000, 60],
    ['KNM', 'C007', 'UD Bintang Teknik', 'Distributor', 'Medan', 150_000_000, 14, 'ditahan'], ['KNM', 'C008', 'PT Graha Elektrindo', 'Distributor', 'Jakarta', 400_000_000, 30],
    ['NLP', 'L001', 'PT Karya Nusantara Mandiri', 'Antar perusahaan', 'Jakarta', 0, 30, 'aktif', 'KNM'], ['NLP', 'L002', 'PT KNM Trading', 'Antar perusahaan', 'Jakarta', 0, 30, 'aktif', 'KNMT'],
    ['NLP', 'L003', 'PT Indo Retail Logistik', 'Korporasi', 'Jakarta', 1_500_000_000, 30], ['NLP', 'L004', 'PT Agro Sumatera Lestari', 'Korporasi', 'Medan', 1_000_000_000, 30],
    ['KNMT', 'T001', 'CV Cahaya Listrik', 'Ritel', 'Jakarta', 500_000_000, 14], ['KNMT', 'T002', 'PT Bangun Persada', 'Korporasi', 'Tangerang', 800_000_000, 30],
  ]) CU[code] = await mk(maker, co, null, 'customers', { code, name, segment: seg, city, credit_limit: limit, terms_days: terms, status, pic: pick(['Hendra', 'Lina', 'Rudi', 'Fitri', 'Joko', 'Ayu']), email: `ap@${code.toLowerCase()}.example.co.id`, npwp: `0${rint(1, 9)}.${rint(100, 999)}.${rint(100, 999)}.${rint(1, 9)}-${rint(100, 999)}.000`, related_company_id: related ? CO[related] : null });

  const SU = {};
  for (const [co, code, name, cat, city, terms, lead, related = null] of [
    ['KNM', 'S001', 'PT Krakatau Baja Niaga', 'Baja', 'Cilegon', 30, 7], ['KNM', 'S002', 'PT Chandra Asri Resin', 'Plastik', 'Cilegon', 30, 10],
    ['KNM', 'S003', 'CV Sumber Baut Jaya', 'Komponen', 'Jakarta', 14, 3], ['KNM', 'S004', 'PT Jotun Powder Coatings', 'Cat', 'Bekasi', 30, 5],
    ['KNM', 'S005', 'PT Kemasindo Cipta', 'Kemasan', 'Tangerang', 30, 4], ['KNM', 'S006', 'PT Supreme Cable Distribusi', 'Kelistrikan', 'Jakarta', 30, 5],
    ['KNM', 'S007', 'PT PLN (Persero)', 'Utilitas', 'Jakarta', 0, 0], ['KNM', 'S008', 'PT Nusantara Logistik Prima', 'Logistik', 'Jakarta', 30, 1, 'NLP'],
    ['KNMT', 'S101', 'PT Supreme Cable Distribusi', 'Kelistrikan', 'Jakarta', 30, 5], ['KNMT', 'S102', 'PT Nusantara Logistik Prima', 'Logistik', 'Jakarta', 30, 1, 'NLP'],
    ['NLP', 'S201', 'PT Pertamina Retail', 'BBM', 'Jakarta', 14, 1],
  ]) SU[code] = await mk(maker, co, null, 'suppliers', { code, name, category: cat, city, terms_days: terms, lead_time_days: lead, status: 'aktif', bank_account_no: `BCA ${rint(1000, 9999)} ${rint(100000, 999999)}`, related_company_id: related ? CO[related] : null });

  /* --- Karyawan -------------------------------------------------------------- */
  const EMP = {};
  const people = [
    ['KNM', 'JKT', 'Osmond Pratama', 'Direksi', 'Direktur Keuangan', 45_000_000], ['KNM', 'JKT', 'Rina Kartika', 'Keuangan', 'Akuntan Senior', 14_000_000],
    ['KNM', 'JKT', 'Sari Wulandari', 'Penjualan', 'Account Manager', 12_500_000], ['KNM', 'JKT', 'Hendra Gunawan', 'Penjualan', 'Sales Engineer', 11_000_000],
    ['KNM', 'JKT', 'Dewi Lestari', 'SDM', 'HR Generalist', 10_500_000], ['KNM', 'JKT', 'Fajar Nugroho', 'TI', 'IT & Security Officer', 16_000_000],
    ['KNM', 'CKR', 'Budi Santoso', 'Produksi', 'Manajer Pabrik', 24_000_000], ['KNM', 'CKR', 'Agus Setiawan', 'Gudang', 'Kepala Gudang', 9_500_000],
    ['KNM', 'CKR', 'Teguh Wibowo', 'Produksi', 'Operator Press', 6_200_000], ['KNM', 'CKR', 'Slamet Riyadi', 'Produksi', 'Operator Injeksi', 6_200_000],
    ['KNM', 'CKR', 'Nur Aini', 'Produksi', 'QC Inspector', 7_000_000], ['KNM', 'CKR', 'Rahmat Hidayat', 'Produksi', 'Teknisi Mesin', 8_000_000],
    ['KNM', 'SBY', 'Wahyu Kurniawan', 'Penjualan', 'Kepala Cabang', 15_000_000], ['KNM', 'SBY', 'Indah Permata', 'Gudang', 'Admin Gudang', 6_500_000],
    ['KNM', 'SBY', 'Eko Prasetyo', 'Logistik', 'Driver', 5_800_000], ['KNM', 'MDN', 'Rizky Ananda', 'Penjualan', 'Kepala Toko', 11_000_000],
    ['KNM', 'MDN', 'Yoga Prasetyo', 'Penjualan', 'Kasir', 5_200_000], ['KNM', 'MDN', 'Putri Siregar', 'Penjualan', 'Pramuniaga', 5_000_000],
    ['NLP', 'NJK', 'Bambang Susilo', 'Operasional', 'Manajer Logistik', 20_000_000], ['NLP', 'NJK', 'Andi Firmansyah', 'Operasional', 'Dispatcher', 8_000_000],
    ['NLP', 'NSB', 'Rudi Hartono', 'Operasional', 'Kepala Hub', 13_000_000], ['NLP', 'NSB', 'Sugeng Riyanto', 'Operasional', 'Driver', 6_000_000],
    ['KNMT', 'TJK', 'Lina Marlina', 'Penjualan', 'Manajer Showroom', 15_000_000], ['KNMT', 'TJK', 'Doni Saputra', 'Penjualan', 'Sales', 7_500_000],
    ['KNMT', 'TJK', 'Citra Ayu', 'Keuangan', 'Admin Keuangan', 7_000_000],
  ];
  let ei = 1;
  for (const [co, br, name, dept, pos, sal] of people) {
    const code = `E${String(ei++).padStart(3, '0')}`;
    EMP[name] = await mk(maker, co, br, 'employees', { code, name, department: dept, position: pos, join_date: `20${rint(15, 24)}-${String(rint(1, 12)).padStart(2, '0')}-0${rint(1, 9)}`, employment_type: sal < 6_100_000 ? 'kontrak' : 'tetap', email: `${name.split(' ')[0].toLowerCase()}@${co.toLowerCase()}.co.id`, phone: `08${rint(11, 99)}${rint(1000000, 9999999)}`, nik: `317${rint(1000000000000, 9999999999999)}`.slice(0, 16), bank_account_no: `${rint(100000000, 999999999)}`, basic_salary: sal, allowance: round2(sal * 0.15), status: 'aktif' });
  }

  /* --- Saldo awal 1 Januari 2026 ------------------------------------------- */
  setToday('2026-01-01');
  const opening = async (co, br, lines) => {
    const jid = await mk(maker, co, br, 'journals', { date: '2026-01-01', description: 'Saldo awal tahun buku 2026', reference: 'OPENING', lines });
    await run(maker, co, 'journals', jid, 'submit');
    await run(checker, co, 'journals', jid, 'approve');
  };
  await opening('KNM', 'JKT', [
    { account_id: A('1-1130'), branch_id: BR.JKT, debit: 6_500_000_000 }, { account_id: A('1-1140'), branch_id: BR.JKT, debit: 1_200_000_000 },
    { account_id: A('1-1110'), branch_id: BR.JKT, debit: 25_000_000 }, { account_id: A('1-1130'), branch_id: BR.CKR, debit: 1_800_000_000 },
    { account_id: A('1-1110'), branch_id: BR.CKR, debit: 25_000_000 }, { account_id: A('1-1130'), branch_id: BR.SBY, debit: 900_000_000 },
    { account_id: A('1-1110'), branch_id: BR.SBY, debit: 25_000_000 }, { account_id: A('1-1150'), branch_id: BR.MDN, debit: 600_000_000 },
    { account_id: A('1-1120'), branch_id: BR.MDN, debit: 50_000_000 }, { account_id: A('1-2900'), branch_id: BR.JKT, debit: 2_900_000_000 },
    { account_id: A('2-2100'), branch_id: BR.JKT, credit: 3_000_000_000 }, { account_id: A('3-1000'), branch_id: BR.JKT, credit: 10_000_000_000 },
    { account_id: A('3-2000'), branch_id: BR.JKT, credit: 1_025_000_000 },
  ]);
  await opening('NLP', 'NJK', [
    { account_id: A('1-1130'), branch_id: BR.NJK, debit: 1_500_000_000 }, { account_id: A('1-1110'), branch_id: BR.NJK, debit: 20_000_000 },
    { account_id: A('1-1140'), branch_id: BR.NSB, debit: 400_000_000 }, { account_id: A('3-2000'), branch_id: BR.NJK, debit: 80_000_000 },
    { account_id: A('3-1000'), branch_id: BR.NJK, credit: 2_000_000_000 },
  ]);
  await opening('KNMT', 'TJK', [
    { account_id: A('1-1130'), branch_id: BR.TJK, debit: 700_000_000 }, { account_id: A('1-1120'), branch_id: BR.TJK, debit: 15_000_000 },
    { account_id: A('3-2000'), branch_id: BR.TJK, debit: 285_000_000 }, { account_id: A('3-1000'), branch_id: BR.TJK, credit: 1_000_000_000 },
  ]);

  const stockOpen = async (co, br, wh, items) => {
    const aid = await mk(maker, co, br, 'stock_adjustments', { date: '2026-01-01', warehouse_id: WH[wh], account_id: A('3-2000'), reason: 'Saldo awal persediaan', lines: items.map(([p, q]) => ({ product_id: P[p], qty: q, unit_cost: db.get('SELECT standard_cost c FROM products WHERE id = ?', P[p]).c })) });
    await run(maker, co, 'stock_adjustments', aid, 'post');
  };
  await stockOpen('KNM', 'CKR', 'WH-CKR', [['RM-001', 900], ['RM-002', 4000], ['RM-003', 400], ['RM-004', 300], ['RM-005', 2500], ['FG-101', 40], ['FG-102', 60], ['FG-103', 500]]);
  await stockOpen('KNM', 'JKT', 'WH-JKT', [['FG-101', 60], ['FG-102', 80], ['FG-103', 800]]);
  await stockOpen('KNM', 'SBY', 'WH-SBY', [['FG-101', 20], ['FG-102', 50], ['FG-103', 600], ['TG-201', 60], ['TG-202', 400], ['TG-203', 900], ['TG-204', 700]]);
  await stockOpen('KNM', 'MDN', 'WH-MDN', [['TG-201', 30], ['TG-202', 200], ['TG-203', 500], ['TG-204', 400], ['TG-205', 25]]);
  await stockOpen('KNMT', 'TJK', 'WH-TJK', [['TG-201', 40], ['TG-202', 300], ['TG-203', 600], ['TG-204', 500], ['TG-205', 30]]);

  /* --- Aset tetap ------------------------------------------------------------ */
  const asset = async (co, br, code, name, cat, cost, life, acq, credit = '3-2000', salvage = 0) => {
    const map = { 'Bangunan': ['1-2200', '1-2210'], 'Mesin & Peralatan': ['1-2300', '1-2310'], 'Kendaraan': ['1-2400', '1-2410'], 'Peralatan Kantor & TI': ['1-2500', '1-2510'] }[cat];
    setToday(acq);
    const aid = await mk(maker, co, br, 'fixed_assets', { code, name, category: cat, acquisition_date: acq, cost, salvage_value: salvage, useful_life_months: life, asset_account_id: A(map[0]), accum_account_id: A(map[1]), expense_account_id: A('6-2500'), credit_account_id: A(credit), location: br });
    await run(checker, co, 'fixed_assets', aid, 'activate');
    return aid;
  };
  const AST = {};
  AST.gedung = await asset('KNM', 'JKT', 'AST-001', 'Gedung kantor Sudirman (lt. 12)', 'Bangunan', 6_000_000_000, 240, '2026-01-01');
  AST.press = await asset('KNM', 'CKR', 'AST-002', 'Mesin press hidrolik 200T', 'Mesin & Peralatan', 2_400_000_000, 120, '2026-01-01', '3-2000', 240_000_000);
  AST.injeksi = await asset('KNM', 'CKR', 'AST-003', 'Mesin injeksi plastik 350T', 'Mesin & Peralatan', 1_800_000_000, 96, '2026-01-01');
  AST.forklift = await asset('KNM', 'SBY', 'AST-004', 'Forklift listrik 3 ton', 'Kendaraan', 450_000_000, 60, '2026-01-01');
  AST.mobil = await asset('KNM', 'MDN', 'AST-005', 'Mobil operasional Avanza', 'Kendaraan', 380_000_000, 60, '2026-01-01');
  AST.server = await asset('KNM', 'JKT', 'AST-006', 'Server & jaringan pusat data', 'Peralatan Kantor & TI', 650_000_000, 48, '2026-01-01');
  AST.truk = await asset('NLP', 'NJK', 'AST-N01', 'Truk Hino Ranger (4 unit)', 'Kendaraan', 1_200_000_000, 96, '2026-01-01');
  AST.rak = await asset('NLP', 'NSB', 'AST-N02', 'Peralatan hub Surabaya', 'Mesin & Peralatan', 300_000_000, 60, '2026-01-01');
  AST.showroom = await asset('KNMT', 'TJK', 'AST-T01', 'Interior & display showroom', 'Peralatan Kantor & TI', 250_000_000, 60, '2026-01-01');
  AST.laptop = await asset('KNM', 'JKT', 'AST-007', 'Laptop karyawan (20 unit)', 'Peralatan Kantor & TI', 240_000_000, 36, '2026-04-15', '1-1130');

  /* --- Transaksi bulanan Jan–Sep 2026 -------------------------------------- */
  const tradeLine = (code, qty, price) => ({ product_id: P[code], qty, price: price ?? db.get('SELECT price FROM products WHERE id = ?', P[code]).price, discount_pct: 0 });
  const openInvoices = { KNM: [], NLP: [], KNMT: [] };
  const openBills = { KNM: [], NLP: [], KNMT: [] };

  const invoice = async (co, br, wh, cust, lines, date, viaSO = false) => {
    setToday(date);
    let invId;
    if (viaSO) {
      const so = await mk(maker, co, br, 'sales_orders', { date, delivery_date: date, customer_id: CU[cust], warehouse_id: WH[wh], tax_rate: 11, lines });
      await run(maker, co, 'sales_orders', so, 'submit');
      if (db.get('SELECT status FROM sales_orders WHERE id = ?', so).status === 'menunggu') await run(checker, co, 'sales_orders', so, 'approve');
      const r = await run(maker, co, 'sales_orders', so, 'to_invoice');
      invId = r.redirect.id;
    } else {
      invId = await mk(maker, co, br, 'sales_invoices', { date, customer_id: CU[cust], warehouse_id: WH[wh], tax_rate: 11, lines });
    }
    await run(checker, co, 'sales_invoices', invId, 'post');
    openInvoices[co].push({ id: invId, cust, br, date });
    return invId;
  };

  const bill = async (co, br, wh, sup, lines, date, viaPO = true) => {
    setToday(date);
    let billId;
    if (viaPO) {
      const po = await mk(maker, co, br, 'purchase_orders', { date, eta: date, supplier_id: SU[sup], warehouse_id: WH[wh], buyer: 'Agus Setiawan', tax_rate: 11, lines });
      await run(maker, co, 'purchase_orders', po, 'submit');
      if (db.get('SELECT status FROM purchase_orders WHERE id = ?', po).status === 'menunggu') await run(checker, co, 'purchase_orders', po, 'approve');
      const r = await run(maker, co, 'purchase_orders', po, 'to_bill', { supplier_invoice_no: `F-${sup}-${date.replace(/-/g, '')}` });
      billId = r.redirect.id;
    } else {
      billId = await mk(maker, co, br, 'purchase_bills', { date, supplier_id: SU[sup], warehouse_id: wh ? WH[wh] : null, supplier_invoice_no: `F-${sup}-${date.replace(/-/g, '')}`, tax_rate: 11, lines });
    }
    await run(checker, co, 'purchase_bills', billId, 'post');
    openBills[co].push({ id: billId, sup, br, date });
    return billId;
  };

  const receiveAll = async (co, bankFor, date, filter, share = 1) => {
    setToday(date);
    const byCust = new Map();
    for (const inv of openInvoices[co].filter(filter)) {
      const row = db.get('SELECT total, paid, status, branch_id FROM sales_invoices WHERE id = ?', inv.id);
      if (!['terbit', 'sebagian'].includes(row.status)) continue;
      const amt = round2((row.total - row.paid) * share);
      if (amt <= 0) continue;
      const k = `${inv.cust}|${inv.br}`;
      byCust.set(k, [...(byCust.get(k) || []), { invoice_id: inv.id, amount: amt }]);
    }
    for (const [k, lines] of byCust) {
      const [cust, br] = k.split('|');
      const rid = await mk(maker, co, br, 'customer_receipts', { date, customer_id: CU[cust], bank_account_id: BA[bankFor(br)], reference: `TRF ${cust}`, lines });
      await run(checker, co, 'customer_receipts', rid, 'post');
    }
  };

  const payAll = async (co, bankFor, date, filter) => {
    setToday(date);
    const bySup = new Map();
    for (const b of openBills[co].filter(filter)) {
      const row = db.get('SELECT total, paid, status FROM purchase_bills WHERE id = ?', b.id);
      if (!['terbit', 'sebagian'].includes(row.status)) continue;
      const k = `${b.sup}|${b.br}`;
      bySup.set(k, [...(bySup.get(k) || []), { bill_id: b.id, amount: round2(row.total - row.paid) }]);
    }
    for (const [k, lines] of bySup) {
      const [sup, br] = k.split('|');
      const pid = await mk(maker, co, br, 'supplier_payments', { date, supplier_id: SU[sup], bank_account_id: BA[bankFor(br)], reference: `Pembayaran ${sup}`, lines });
      await run(maker, co, 'supplier_payments', pid, 'submit');
      await run(checker, co, 'supplier_payments', pid, 'post');
    }
  };

  const cash = async (co, br, bank, date, direction, description, lines, payee = '') => {
    setToday(date);
    const cid = await mk(maker, co, br, 'cash_transactions', { date, direction, bank_account_id: BA[bank], description, payee, lines });
    await run(checker, co, 'cash_transactions', cid, 'post');
  };

  const transfer = async (co, br, from, to, amount, date, description) => {
    setToday(date);
    const tid = await mk(maker, co, br, 'bank_transfers', { date, from_bank_id: BA[from], to_bank_id: BA[to], amount, description });
    await run(checker, co, 'bank_transfers', tid, 'post');
  };

  const payroll = async (co, br, bank, period, payDate) => {
    setToday(payDate);
    const pid = await mk(maker, co, br, 'payroll_runs', { period, pay_date: payDate, bank_account_id: BA[bank] });
    await run(maker, co, 'payroll_runs', pid, 'generate');
    await run(checker, co, 'payroll_runs', pid, 'approve');
    await run(checker, co, 'payroll_runs', pid, 'post');
    await run(checker, co, 'payroll_runs', pid, 'pay');
  };

  const KNM_BANK = { JKT: 'BCA-JKT', CKR: 'BCA-CKR', SBY: 'BCA-SBY', MDN: 'BRI-MDN' };
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  for (const m of months) {
    const period = `2026-${String(m).padStart(2, '0')}`;
    // Pembelian bahan baku → pabrik Cikarang
    await bill('KNM', 'CKR', 'WH-CKR', 'S001', [tradeLine('RM-001', rint(1650, 1750), 285000)], d(m, 2));
    await bill('KNM', 'CKR', 'WH-CKR', 'S002', [tradeLine('RM-002', rint(5900, 6200), 38000)], d(m, 2));
    await bill('KNM', 'CKR', 'WH-CKR', 'S003', [tradeLine('RM-003', 800, 65000)], d(m, 3));
    await bill('KNM', 'CKR', 'WH-CKR', 'S004', [tradeLine('RM-004', 600, 92000)], d(m, 3));
    await bill('KNM', 'CKR', 'WH-CKR', 'S005', [tradeLine('RM-005', 3600, 6500)], d(m, 3));
    // Barang dagangan → Surabaya & Medan
    await bill('KNM', 'SBY', 'WH-SBY', 'S006', [tradeLine('TG-201', 45, 410000), tradeLine('TG-202', 320, 52000), tradeLine('TG-203', 650, 28000), tradeLine('TG-204', 520, 18000)], d(m, 4));
    await bill('KNM', 'MDN', 'WH-MDN', 'S006', [tradeLine('TG-201', 25, 410000), tradeLine('TG-202', 170, 52000), tradeLine('TG-203', 420, 28000), tradeLine('TG-204', 330, 18000), tradeLine('TG-205', 18, 310000)], d(m, 4));
    await bill('KNMT', 'TJK', 'WH-TJK', 'S101', [tradeLine('TG-201', 100, 410000), tradeLine('TG-202', 850, 52000), tradeLine('TG-203', 1700, 28000), tradeLine('TG-205', 60, 310000)], d(m, 4));

    // Produksi
    for (const [fg, qty] of [['FG-101', 200], ['FG-102', 300], ['FG-103', 3000]]) {
      setToday(d(m, 5));
      const wo = await mk(maker, 'KNM', 'CKR', 'work_orders', { date: d(m, 5), bom_id: BOM[fg], qty, warehouse_id: WH['WH-CKR'], line: fg === 'FG-103' ? 'Lini C' : fg === 'FG-101' ? 'Lini A' : 'Lini B', due_date: d(m, 9), pic: 'Budi Santoso' });
      await run(maker, 'KNM', 'work_orders', wo, 'start');
      await run(maker, 'KNM', 'work_orders', wo, 'to_qc');
      setToday(d(m, 8));
      await run(checker, 'KNM', 'work_orders', wo, 'complete');
    }
    // Distribusi barang jadi antar cabang
    for (const [to, items] of [['WH-JKT', [['FG-101', 125], ['FG-102', 150], ['FG-103', 1500]]], ['WH-SBY', [['FG-101', 45], ['FG-102', 110], ['FG-103', 1250]]]]) {
      setToday(d(m, 9));
      const tr = await mk(maker, 'KNM', 'CKR', 'stock_transfers', { date: d(m, 9), from_warehouse_id: WH['WH-CKR'], to_warehouse_id: WH[to], notes: `Distribusi ${period}`, lines: items.map(([p, q]) => ({ product_id: P[p], qty: q })) });
      await run(checker, 'KNM', 'stock_transfers', tr, 'post');
    }

    // Penjualan Jakarta
    await invoice('KNM', 'JKT', 'WH-JKT', 'C001', [tradeLine('FG-101', rint(45, 55)), tradeLine('FG-102', rint(40, 50)), tradeLine('SV-301', rint(30, 50))], d(m, 11), true);
    await invoice('KNM', 'JKT', 'WH-JKT', 'C002', [tradeLine('FG-101', rint(30, 40)), tradeLine('FG-103', rint(600, 700))], d(m, 13), m % 2 === 0);
    await invoice('KNM', 'JKT', 'WH-JKT', 'C004', [tradeLine('FG-102', rint(60, 75)), tradeLine('SV-303', 1)], d(m, 16));
    await invoice('KNM', 'JKT', 'WH-JKT', 'C008', [tradeLine('FG-103', rint(500, 650)), tradeLine('FG-102', rint(20, 25))], d(m, 21));
    await invoice('KNM', 'JKT', 'WH-JKT', 'C001', [tradeLine('FG-101', rint(20, 25)), tradeLine('SV-303', 1)], d(m, 24));
    // Penjualan Surabaya
    await invoice('KNM', 'SBY', 'WH-SBY', 'C003', [tradeLine('FG-102', rint(50, 60)), tradeLine('FG-103', rint(600, 700)), tradeLine('TG-202', rint(150, 180)), tradeLine('TG-203', rint(300, 350))], d(m, 12), true);
    await invoice('KNM', 'SBY', 'WH-SBY', 'C006', [tradeLine('FG-101', rint(35, 42)), tradeLine('FG-102', rint(30, 40)), tradeLine('FG-103', rint(450, 520)), tradeLine('TG-201', rint(30, 40))], d(m, 18));
    await invoice('KNM', 'SBY', 'WH-SBY', 'C003', [tradeLine('TG-203', rint(250, 290)), tradeLine('TG-204', rint(400, 480)), tradeLine('TG-202', rint(120, 140))], d(m, 26));
    // Medan: faktur + POS
    await invoice('KNM', 'MDN', 'WH-MDN', 'C005', [tradeLine('TG-201', rint(12, 18)), tradeLine('TG-202', rint(80, 100)), tradeLine('TG-203', rint(200, 240)), tradeLine('TG-204', rint(150, 190))], d(m, 15));
    for (const day of [7, 14, 22, 28]) {
      setToday(d(m, day));
      const pos = await mk(maker, 'KNM', 'MDN', 'pos_sales', { date: d(m, day), warehouse_id: WH['WH-MDN'], bank_account_id: BA['KAS-MDN'], payment_method: pick(['Tunai', 'QRIS', 'Debit', 'Transfer']), customer_name: 'Umum', tax_rate: 11, lines: [tradeLine('TG-202', rint(10, 18)), tradeLine('TG-203', rint(30, 40)), tradeLine('TG-204', rint(25, 35)), tradeLine('TG-205', rint(2, 3))] });
      await run(maker, 'KNM', 'pos_sales', pos, 'pay');
    }
    // KNM Trading
    await invoice('KNMT', 'TJK', 'WH-TJK', 'T002', [tradeLine('TG-201', rint(45, 60)), tradeLine('TG-202', rint(300, 390)), tradeLine('TG-203', rint(600, 750))], d(m, 14));
    await invoice('KNMT', 'TJK', 'WH-TJK', 'T001', [tradeLine('TG-202', rint(240, 300)), tradeLine('TG-203', rint(450, 600)), tradeLine('TG-205', rint(24, 36))], d(m, 23));
    for (const day of [10, 20]) {
      setToday(d(m, day));
      const pos = await mk(maker, 'KNMT', 'TJK', 'pos_sales', { date: d(m, day), warehouse_id: WH['WH-TJK'], bank_account_id: BA['TRD-KAS'], payment_method: pick(['Tunai', 'QRIS', 'Debit']), tax_rate: 11, lines: [tradeLine('TG-201', rint(9, 18)), tradeLine('TG-202', rint(45, 75)), tradeLine('TG-203', rint(120, 180))] });
      await run(maker, 'KNMT', 'pos_sales', pos, 'pay');
    }
    // NLP: jasa logistik eksternal & antar perusahaan
    const trips = rint(5, 7), tripsT = rint(2, 3);
    await invoice('NLP', 'NJK', 'WH-NJK', 'L001', [tradeLine('SV-302', trips)], d(m, 27));
    await invoice('NLP', 'NJK', 'WH-NJK', 'L002', [tradeLine('SV-302', tripsT)], d(m, 27));
    await invoice('NLP', 'NJK', 'WH-NJK', 'L003', [tradeLine('SV-302', rint(40, 50))], d(m, 17));
    await invoice('NLP', 'NSB', 'WH-NJK', 'L004', [tradeLine('SV-302', rint(25, 30))], d(m, 19));
    // Sisi pembeli mencatat tagihan antar perusahaan (akun beban IC).
    await bill('KNM', 'JKT', null, 'S008', [{ account_id: A('6-2800'), description: `Jasa logistik ${period}`, qty: trips, price: 2_500_000 }], d(m, 28), false);
    await bill('KNMT', 'TJK', null, 'S102', [{ account_id: A('6-2800'), description: `Jasa logistik ${period}`, qty: tripsT, price: 2_500_000 }], d(m, 28), false);
    await bill('NLP', 'NJK', null, 'S201', [{ account_id: A('5-1300'), description: `BBM armada ${period}`, qty: 1, price: rint(55, 70) * 1_000_000 }], d(m, 25), false);

    // Biaya operasional rutin
    await cash('KNM', 'JKT', 'BCA-JKT', d(m, 5), 'keluar', `Sewa & service charge kantor ${period}`, [{ account_id: A('6-2000'), amount: 85_000_000, cost_center_id: CC['CC-100'] }], 'PT Graha Sudirman');
    await cash('KNM', 'MDN', 'BRI-MDN', d(m, 5), 'keluar', `Sewa toko Medan ${period}`, [{ account_id: A('6-2000'), amount: 25_000_000 }], 'Pemilik ruko');
    await cash('KNM', 'CKR', 'BCA-CKR', d(m, 20), 'keluar', `Listrik & air pabrik ${period}`, [{ account_id: A('6-2100'), amount: rint(110, 135) * 1_000_000, cost_center_id: CC['CC-300'] }], 'PT PLN (Persero)');
    await cash('KNM', 'JKT', 'BCA-JKT', d(m, 20), 'keluar', `Telepon, internet & utilitas ${period}`, [{ account_id: A('6-2100'), amount: 18_500_000, cost_center_id: CC['CC-600'] }], 'Telkom');
    await cash('KNM', 'JKT', 'BCA-JKT', d(m, 12), 'keluar', `Kampanye pemasaran ${period}`, [{ account_id: A('6-2400'), amount: rint(25, 45) * 1_000_000, cost_center_id: CC['CC-200'] }], 'Agensi iklan');
    await cash('KNM', 'SBY', 'BCA-SBY', d(m, 15), 'keluar', `BBM & tol armada Surabaya ${period}`, [{ account_id: A('6-2300'), amount: rint(8, 12) * 1_000_000, cost_center_id: CC['CC-400'] }]);
    await cash('KNM', 'JKT', 'KAS-JKT', d(m, 10), 'keluar', `ATK & keperluan kantor ${period}`, [{ account_id: A('6-2600'), amount: rint(4, 7) * 1_000_000 }]);
    await cash('KNM', 'JKT', 'BCA-JKT', d(m, 25), 'keluar', `Bunga & angsuran pinjaman bank ${period}`, [{ account_id: A('7-2000'), amount: 22_500_000 }, { account_id: A('2-2100'), amount: 50_000_000 }], 'Bank BCA');
    await cash('KNM', 'JKT', 'BCA-JKT', d(m, 15), 'keluar', `Angsuran PPh 25 ${period}`, [{ account_id: A('8-1000'), amount: 120_000_000 }], 'Kas Negara');
    await cash('NLP', 'NJK', 'NLP-BCA', d(m, 5), 'keluar', `Sewa pool & gudang transit ${period}`, [{ account_id: A('6-2000'), amount: 30_000_000 }]);
    await cash('KNMT', 'TJK', 'TRD-BCA', d(m, 5), 'keluar', `Sewa showroom ${period}`, [{ account_id: A('6-2000'), amount: 35_000_000 }]);
    await cash('KNM', 'JKT', 'BCA-JKT', d(m, 27), 'masuk', `Jasa giro ${period}`, [{ account_id: A('7-1000'), amount: rint(9, 14) * 1_000_000 }], 'Bank BCA');
    await cash('KNM', 'JKT', 'BCA-JKT', d(m, 27), 'keluar', `Biaya administrasi bank ${period}`, [{ account_id: A('7-2100'), amount: 750_000 }], 'Bank BCA');

    // Pendanaan penggajian & kas cabang
    await transfer('KNM', 'JKT', 'BCA-JKT', 'MDR-PAY', 200_000_000, d(m, 22), `Pendanaan rekening gaji ${period}`);
    if (m % 3 === 0) await transfer('KNM', 'JKT', 'BCA-JKT', 'BRI-MDN', 150_000_000, d(m, 6), `Dropping dana cabang Medan ${period}`);
    if (m % 2 === 0) await transfer('KNM', 'MDN', 'KAS-MDN', 'BRI-MDN', 35_000_000, d(m, 28), `Setor kas toko ke bank ${period}`);
    await transfer('KNM', 'JKT', 'BCA-JKT', 'KAS-JKT', 7_000_000, d(m, 2), `Pengisian kas kecil ${period}`);
    await transfer('KNMT', 'TJK', 'TRD-KAS', 'TRD-BCA', 40_000_000, d(m, 28), `Setor kas showroom ke bank ${period}`);

    // Penggajian
    for (const [co, br, bank] of [['KNM', 'JKT', 'MDR-PAY'], ['KNM', 'CKR', 'BCA-CKR'], ['KNM', 'SBY', 'BCA-SBY'], ['KNM', 'MDN', 'BRI-MDN'], ['NLP', 'NJK', 'NLP-BCA'], ['NLP', 'NSB', 'NLP-MDR'], ['KNMT', 'TJK', 'TRD-BCA']]) {
      await payroll(co, br, bank, period, d(m, 25));
    }
    // Setor PPh 21 & BPJS bulan sebelumnya
    if (m > 1) {
      for (const co of ['KNM', 'NLP', 'KNMT']) {
        const br = { KNM: 'JKT', NLP: 'NJK', KNMT: 'TJK' }[co];
        const bal = (code) => round2(-(db.get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status='diposting' AND jl.company_id = ? AND jl.account_id = ? AND j.date < ?`, CO[co], A(code), d(m, 1)).v));
        const pph = bal('2-1310'), bpjs = bal('2-1320');
        if (pph + bpjs > 0) await cash(co, br, { KNM: 'BCA-JKT', NLP: 'NLP-BCA', KNMT: 'TRD-BCA' }[co], d(m, 10), 'keluar', `Setor PPh 21 & BPJS ${String(m - 1).padStart(2, '0')}/2026`, [{ account_id: A('2-1310'), amount: pph }, { account_id: A('2-1320'), amount: bpjs }].filter((l) => l.amount > 0), 'Kas Negara / BPJS');
      }
    }

    // Penyusutan bulanan
    setToday(monthEnd(2026, m));
    for (const co of ['KNM', 'NLP', 'KNMT']) {
      const dep = await mk(maker, co, null, 'depreciation_runs', { period });
      await run(checker, co, 'depreciation_runs', dep, 'post');
    }

    // Pelunasan: piutang & hutang bulan sebelumnya
    if (m > 1) {
      const prev = `2026-${String(m - 1).padStart(2, '0')}`;
      const before = (x) => x.date.startsWith(prev) || x.date < prev;
      const share = m === 9 ? 0.6 : 1;
      await receiveAll('KNM', (br) => KNM_BANK[br], d(m, 20), before, share);
      await receiveAll('NLP', () => 'NLP-BCA', d(m, 20), before);
      await receiveAll('KNMT', () => 'TRD-BCA', d(m, 20), before);
      await payAll('KNM', (br) => KNM_BANK[br], d(m, 10), before);
      await payAll('NLP', () => 'NLP-BCA', d(m, 10), before);
      await payAll('KNMT', () => 'TRD-BCA', d(m, 10), before);
    }

    // Kompensasi PPN masukan terhadap keluaran (jurnal manual, maker–checker)
    const vat = (code) => db.get(`SELECT COALESCE(SUM(jl.debit - jl.credit),0) v FROM journal_lines jl JOIN journals j ON j.id = jl.parent_id WHERE j.status='diposting' AND jl.company_id = ? AND jl.account_id = ?`, CO.KNM, A(code)).v;
    const vin = round2(vat('1-1400')), vout = round2(-vat('2-1200'));
    if (vin > 0 && vout > vin) {
      setToday(monthEnd(2026, m));
      const jid = await mk(makeCtx('rina.akuntan'), 'KNM', 'JKT', 'journals', { date: monthEnd(2026, m), description: `Kompensasi PPN masukan ${period}`, reference: `SPT-PPN-${period}`, lines: [{ account_id: A('2-1200'), debit: vin }, { account_id: A('1-1400'), credit: vin }] });
      await run(makeCtx('rina.akuntan'), 'KNM', 'journals', jid, 'submit');
      await run(checker, 'KNM', 'journals', jid, 'approve');
      await cash('KNM', 'JKT', 'BCA-JKT', d(m, 28), 'keluar', `Setor PPN kurang bayar ${period}`, [{ account_id: A('2-1200'), amount: round2(vout - vin) }], 'Kas Negara');
    }
  }

  /* --- Anggaran 2026 (KNM) -------------------------------------------------- */
  for (const [br, code, amount, cc] of [
    ['JKT', '4-1100', 26_000_000_000, null], ['SBY', '4-1100', 11_000_000_000, null], ['SBY', '4-1200', 2_400_000_000, null], ['MDN', '4-1200', 2_000_000_000, null],
    ['JKT', '6-1000', 1_200_000_000, 'CC-100'], ['CKR', '6-1000', 900_000_000, 'CC-300'], ['JKT', '6-2000', 1_020_000_000, 'CC-100'], ['CKR', '6-2100', 1_500_000_000, 'CC-300'],
    ['JKT', '6-2400', 360_000_000, 'CC-200'], ['JKT', '6-2500', 1_150_000_000, null], ['JKT', '6-2600', 60_000_000, null], ['SBY', '6-2300', 140_000_000, 'CC-400'],
    ['JKT', '7-2000', 270_000_000, null], ['JKT', '6-2800', 200_000_000, 'CC-400'], ['MDN', '6-2000', 300_000_000, null],
  ]) await mk(maker, 'KNM', br, 'budgets', { year: 2026, account_id: A(code), cost_center_id: cc ? CC[cc] : null, amount, notes: 'RKAP 2026' });

  /* --- Data operasional non-keuangan --------------------------------------- */
  setToday('2026-10-06');
  for (const [title, company, src, value, stage, close] of [
    ['Panel otomasi gedung B', 'PT Summarecon Agung', 'Referensi', 1_850_000_000, 'negosiasi', '2026-10-30'], ['Rak gudang e-commerce', 'PT Logistik Cepat Indonesia', 'Situs web', 920_000_000, 'penawaran', '2026-11-15'],
    ['Housing meteran listrik', 'PT Meter Presisi', 'Pameran', 1_200_000_000, 'kualifikasi', '2026-12-10'], ['Kontrak pemeliharaan 2027', 'PT Astra Komponen Indonesia', 'Referensi', 360_000_000, 'negosiasi', '2026-10-25'],
    ['Panel distribusi RSUD', 'RSUD Kota Bekasi', 'Telemarketing', 680_000_000, 'prospek', '2027-01-20'], ['Rak arsip kantor pajak', 'KPP Pratama Surabaya', 'Mitra', 240_000_000, 'menang', '2026-09-30'],
    ['Komponen panel surya', 'PT Surya Energi Hijau', 'Pameran', 1_500_000_000, 'kalah', '2026-08-31'], ['Instalasi pabrik baru', 'PT Mega Konstruksi', 'Referensi', 2_300_000_000, 'kualifikasi', '2026-12-01'],
  ]) await mk(maker, 'KNM', 'JKT', 'leads', { title, company_name: company, contact: pick(['Bpk. Hadi', 'Ibu Ratna', 'Bpk. Yusuf', 'Ibu Melati']), source: src, value, stage, owner: 'Sari Wulandari', expected_close: close });

  for (const [code, name, cust, mgr, budget, start, end, progress, status] of [
    ['PRJ-01', 'Instalasi panel Gedung Astra Sunter', 'C001', 'Hendra Gunawan', 950_000_000, '2026-03-01', '2026-11-30', 72, 'berjalan'],
    ['PRJ-02', 'Rak gudang PU Jatim', 'C006', 'Wahyu Kurniawan', 1_400_000_000, '2026-05-15', '2026-12-20', 45, 'berjalan'],
    ['PRJ-03', 'Implementasi ISO 27001 internal', null, 'Fajar Nugroho', 450_000_000, '2026-02-01', '2026-12-31', 60, 'berjalan'],
  ]) {
    const pid = await mk(maker, 'KNM', 'JKT', 'projects', { code, name, customer_id: cust ? CU[cust] : null, manager: mgr, budget, start_date: start, end_date: end, progress, status });
    const tasks = [['Survei & desain', 0, 1, 100], ['Pengadaan material', 1, 3, 90], ['Fabrikasi', 2, 5, 70], ['Instalasi', 4, 7, 40], ['Komisioning & serah terima', 7, 9, 0]];
    for (const [t, s, e, p] of tasks) {
      const sd = new Date(start); sd.setMonth(sd.getMonth() + s);
      const ed = new Date(start); ed.setMonth(ed.getMonth() + e);
      await mk(maker, 'KNM', 'JKT', 'project_tasks', { project_id: pid, name: t, start_date: sd.toISOString().slice(0, 10), end_date: ed.toISOString().slice(0, 10), progress: p, assignee: mgr });
    }
    // Biaya proyek dibebankan dengan dimensi proyek → realisasi dihitung dari buku besar.
    await cash('KNM', 'JKT', 'BCA-JKT', '2026-09-18', 'keluar', `Biaya subkon ${code}`, [{ account_id: A('6-2900'), amount: round2(budget * 0.35), project_id: pid }], 'Subkontraktor');
  }

  for (const [title, src, origin, dest, carrier, status, eta] of [
    ['SHP', 'WH-CKR', 'Cikarang', 'Jakarta', 'PT Nusantara Logistik Prima', 'diterima', '2026-09-10'], ['SHP', 'WH-CKR', 'Cikarang', 'Surabaya', 'PT Nusantara Logistik Prima', 'diterima', '2026-09-12'],
    ['SHP', 'WH-CKR', 'Cikarang', 'Jakarta', 'PT Nusantara Logistik Prima', 'transit', '2026-10-08'], ['SHP', 'WH-SBY', 'Surabaya', 'Malang', 'JNE Trucking', 'transit', '2026-10-09'],
    ['SHP', 'WH-JKT', 'Jakarta', 'Bekasi', 'Armada sendiri', 'disiapkan', '2026-10-10'], ['SHP', 'WH-CKR', 'Cikarang', 'Medan', 'Tempo Cargo', 'transit', '2026-10-14'],
  ]) await mk(maker, 'KNM', 'CKR', 'shipments', { date: '2026-10-05', origin, destination: dest, carrier, reference: src, weight_kg: rint(800, 6000), eta, status });

  for (const [aid, kind, desc, cost, status, date] of [
    [AST.press, 'Preventif', 'Penggantian oli hidrolik & seal silinder', 18_500_000, 'dijadwalkan', '2026-10-12'], [AST.injeksi, 'Korektif', 'Perbaikan heater barrel zona 3', 12_000_000, 'berjalan', '2026-10-03'],
    [AST.forklift, 'Preventif', 'Servis baterai & rem', 4_500_000, 'dijadwalkan', '2026-10-20'], [AST.server, 'Preventif', 'Pembaruan firmware & uji pemulihan cadangan', 0, 'dijadwalkan', '2026-10-15'],
  ]) {
    const br = db.get('SELECT branch_id FROM fixed_assets WHERE id = ?', aid).branch_id;
    const brCode = db.get('SELECT code FROM branches WHERE id = ?', br).code;
    await mk(maker, 'KNM', brCode, 'maintenance_orders', { asset_id: aid, kind, priority: kind === 'Korektif' ? 'tinggi' : 'sedang', pic: 'Rahmat Hidayat', scheduled_date: date, cost, bank_account_id: BA[KNM_BANK[brCode]], description: desc });
  }
  // Satu pemeliharaan selesai → beban diposting
  setToday('2026-09-14');
  const mo = await mk(maker, 'KNM', 'CKR', 'maintenance_orders', { asset_id: AST.press, kind: 'Korektif', priority: 'tinggi', pic: 'Rahmat Hidayat', scheduled_date: '2026-09-12', cost: 27_500_000, bank_account_id: BA['BCA-CKR'], description: 'Penggantian pompa hidrolik utama' });
  await run(checker, 'KNM', 'maintenance_orders', mo, 'complete');

  /* --- Kehadiran & cuti ----------------------------------------------------- */
  setToday('2026-10-06');
  for (const name of ['Teguh Wibowo', 'Slamet Riyadi', 'Nur Aini', 'Agus Setiawan', 'Rahmat Hidayat']) {
    for (const day of [1, 2, 5, 6]) {
      const late = rnd() < 0.15;
      await mk(maker, 'KNM', 'CKR', 'attendance', { employee_id: EMP[name], date: d(10, day), shift: 'Shift 1', clock_in: late ? '08:27' : '07:5' + rint(0, 9), clock_out: '17:0' + rint(0, 9), overtime_hours: rint(0, 3), status: late ? 'terlambat' : 'hadir' });
    }
  }
  for (const [name, br, kind, s, e, reason] of [['Hendra Gunawan', 'JKT', 'Cuti tahunan', '2026-10-19', '2026-10-23', 'Liburan keluarga'], ['Nur Aini', 'CKR', 'Sakit', '2026-10-07', '2026-10-08', 'Demam (surat dokter)'], ['Indah Permata', 'SBY', 'Izin', '2026-10-12', '2026-10-12', 'Urusan keluarga']]) {
    await mk(maker, 'KNM', br, 'leave_requests', { employee_id: EMP[name], kind, start_date: s, end_date: e, reason });
  }

  /* --- Dokumen, alur kerja, kepatuhan, risiko, insiden --------------------- */
  for (const [name, type, folder, cls, ver, exp] of [
    ['Kebijakan Keamanan Informasi', 'Kebijakan', 'ISMS/Kebijakan', 'Internal', '2.1', '2027-06-30'], ['Prosedur Kontrol Akses', 'Prosedur', 'ISMS/Prosedur', 'Internal', '1.4', '2027-06-30'],
    ['Prosedur Penanganan Insiden', 'Prosedur', 'ISMS/Prosedur', 'Internal', '1.2', '2027-03-31'], ['Rencana Kelangsungan Bisnis (BCP)', 'Kebijakan', 'ISMS/BCP', 'Rahasia', '1.0', '2027-01-31'],
    ['Sertifikat ISO 9001:2015', 'Sertifikat', 'Legal/Sertifikat', 'Publik', '—', '2027-08-14'], ['Kontrak Sewa Gedung Sudirman', 'Kontrak', 'Legal/Kontrak', 'Rahasia', '1.0', '2028-12-31'],
    ['Perjanjian Kerahasiaan (NDA) Vendor TI', 'Kontrak', 'Legal/Kontrak', 'Rahasia', '1.0', '2026-09-30'], ['SOP Tutup Buku Bulanan', 'Prosedur', 'Keuangan/SOP', 'Internal', '3.0', '2027-12-31'],
  ]) await mk(maker, 'KNM', null, 'documents', { name, doc_type: type, folder, owner: 'Fajar Nugroho', classification: cls, version: ver, expiry_date: exp, status: exp < '2026-10-07' ? 'kedaluwarsa' : 'berlaku' });

  for (const [name, trig, steps, sla, thr] of [
    ['Persetujuan pesanan penjualan', 'SO melebihi plafon kredit', 'Staf penjualan → Manajer operasional → Direksi', 4, 0], ['Persetujuan pesanan pembelian', 'PO > ambang', 'Pembeli → Manajer operasional', 8, 150_000_000],
    ['Persetujuan permintaan pembelian', 'PR diajukan', 'Peminta → Manajer departemen', 24, 0], ['Persetujuan jurnal manual', 'Jurnal diajukan', 'Akuntan → Direktur keuangan', 4, 0],
    ['Pembayaran pemasok', 'Pembayaran diajukan', 'Akuntan → Direktur keuangan', 8, 0], ['Penggajian bulanan', 'Draf penggajian', 'SDM → Direktur keuangan', 24, 0],
    ['Tutup buku periode', 'Akhir bulan', 'Rekonsiliasi → Review → Tutup periode', 72, 0],
  ]) await mk(maker, 'KNM', null, 'workflows', { name, trigger_event: trig, steps, sla_hours: sla, threshold: thr, status: 'aktif' });

  for (const [code, title, cat, owner, due, risk, status] of [
    ['ISO-5.1', 'Kebijakan keamanan informasi ditinjau tahunan', 'ISO 27001', 'Fajar Nugroho', '2027-06-30', 'sedang', 'patuh'],
    ['ISO-5.15', 'Tinjauan hak akses pengguna per kuartal', 'ISO 27001', 'Fajar Nugroho', '2026-10-31', 'tinggi', 'peninjauan'],
    ['ISO-8.13', 'Uji pemulihan cadangan basis data', 'ISO 27001', 'Fajar Nugroho', '2026-10-15', 'tinggi', 'dijadwalkan'],
    ['ISO-8.15', 'Verifikasi integritas jejak audit bulanan', 'ISO 27001', 'Maya Hidayat', '2026-10-31', 'sedang', 'patuh'],
    ['ISO-5.24', 'Simulasi respons insiden semesteran', 'ISO 27001', 'Fajar Nugroho', '2026-12-15', 'sedang', 'dijadwalkan'],
    ['PDP-01', 'Register pemrosesan data pribadi (UU 27/2022)', 'Pelindungan data', 'Dewi Lestari', '2026-11-30', 'tinggi', 'peninjauan'],
    ['TAX-01', 'SPT Masa PPN September 2026', 'Pajak', 'Rina Kartika', '2026-10-31', 'sedang', 'dijadwalkan'],
    ['AUD-01', 'Audit internal siklus pendapatan', 'Audit', 'Maya Hidayat', '2026-11-20', 'sedang', 'dijadwalkan'],
  ]) await mk(maker, 'KNM', null, 'compliance_items', { code, title, category: cat, owner, due_date: due, last_review: '2026-07-01', risk, status });

  for (const [code, title, asset, threat, vuln, l, i, ctrl, status] of [
    ['R-01', 'Akses tidak sah ke data keuangan', 'Basis data ERP', 'Peretas eksternal', 'Sandi lemah / tanpa MFA', 3, 5, 'A.5.17, A.8.5', 'diterapkan'],
    ['R-02', 'Kehilangan data akibat kerusakan server', 'Server ERP', 'Kegagalan perangkat', 'Tanpa cadangan luar lokasi', 2, 5, 'A.8.13, A.8.14', 'diterapkan'],
    ['R-03', 'Manipulasi jurnal oleh orang dalam', 'Buku besar', 'Penyalahgunaan wewenang', 'Tanpa pemisahan tugas', 2, 4, 'A.5.3, A.8.15', 'diterapkan'],
    ['R-04', 'Kebocoran data pribadi karyawan', 'Data SDM', 'Orang dalam / phishing', 'Akses luas ke data PII', 3, 4, 'A.5.34, A.8.11', 'diterapkan'],
    ['R-05', 'Ransomware pada laptop karyawan', 'Endpoint', 'Malware', 'Patch tertunda', 3, 4, 'A.8.7, A.8.8', 'direncanakan'],
    ['R-06', 'Gangguan layanan akibat DoS', 'Aplikasi web', 'Serangan DoS', 'Tanpa pembatas laju', 2, 3, 'A.8.20, A.8.6', 'diterapkan'],
    ['R-07', 'Sesi dibajak di jaringan publik', 'Sesi pengguna', 'Penyadapan', 'Cookie tanpa Secure/HttpOnly', 2, 4, 'A.8.24, A.8.5', 'diterapkan'],
  ]) await mk(maker, 'KNM', null, 'risks', { code, title, asset, threat, vulnerability: vuln, likelihood: l, impact: i, treatment: 'Mitigasi', controls: ctrl, owner: 'Fajar Nugroho', review_date: '2027-01-15', status });

  for (const [date, title, sev, cat, status, desc] of [
    ['2026-08-21', 'Upaya masuk berulang dari IP luar negeri', 'sedang', 'Akses tidak sah', 'tutup', 'Terdeteksi 40 percobaan masuk gagal ke akun admin dalam 5 menit; akun terkunci otomatis dan IP diblokir di firewall.'],
    ['2026-09-30', 'Surel phishing mengatasnamakan bank', 'rendah', 'Phishing', 'ditangani', 'Tiga karyawan menerima surel phishing; tidak ada yang mengklik tautan. Edukasi ulang dilakukan.'],
  ]) await mk(maker, 'KNM', null, 'security_incidents', { reported_at: date, title, severity: sev, category: cat, reporter: 'Fajar Nugroho', description: desc, actions_taken: 'Lihat kronologi.', status });

  /* --- Dokumen menunggu (untuk Kotak Persetujuan) & Oktober berjalan ------- */
  setToday('2026-10-05');
  const soPending = await mk(makeCtx('sari.sales'), 'KNM', 'JKT', 'sales_orders', { date: '2026-10-05', delivery_date: '2026-10-12', customer_id: CU.C008, warehouse_id: WH['WH-JKT'], customer_po: 'PO-GE-2210', tax_rate: 11, lines: [tradeLine('FG-101', 80), tradeLine('FG-102', 40)] });
  await run(makeCtx('sari.sales'), 'KNM', 'sales_orders', soPending, 'submit');
  const soHeld = await mk(makeCtx('sari.sales'), 'KNM', 'JKT', 'sales_orders', { date: '2026-10-06', customer_id: CU.C007, warehouse_id: WH['WH-JKT'], tax_rate: 11, lines: [tradeLine('FG-103', 300)] });
  await run(makeCtx('sari.sales'), 'KNM', 'sales_orders', soHeld, 'submit');
  await mk(makeCtx('sari.sales'), 'KNM', 'JKT', 'sales_orders', { date: '2026-10-06', customer_id: CU.C002, warehouse_id: WH['WH-JKT'], tax_rate: 11, lines: [tradeLine('FG-102', 25), tradeLine('SV-301', 16)] });
  const poPending = await mk(maker, 'KNM', 'CKR', 'purchase_orders', { date: '2026-10-02', eta: '2026-10-09', supplier_id: SU.S001, warehouse_id: WH['WH-CKR'], buyer: 'Agus Setiawan', tax_rate: 11, lines: [tradeLine('RM-001', 1700, 287500)] });
  await run(maker, 'KNM', 'purchase_orders', poPending, 'submit');
  const pr = await mk(makeCtx('agus.gudang'), 'KNM', 'CKR', 'purchase_requests', { date: '2026-10-03', requester: 'Agus Setiawan', cost_center_id: CC['CC-310'], priority: 'tinggi', needed_by: '2026-10-20', notes: 'Cetakan (mold) baru untuk lini C', lines: [{ product_id: P['RM-002'], description: 'Resin ABS grade injeksi', qty: 2000, price: 38500 }] });
  await run(makeCtx('agus.gudang'), 'KNM', 'purchase_requests', pr, 'submit');
  await mk(maker, 'KNM', 'CKR', 'rfqs', { date: '2026-10-04', title: 'Pengadaan resin ABS Q4', purchase_request_id: pr, deadline: '2026-10-10', lines: [{ supplier_id: SU.S002, amount: 77_000_000, lead_time_days: 10 }, { supplier_id: SU.S005, amount: 79_500_000, lead_time_days: 7 }] });
  const accrual = await mk(makeCtx('rina.akuntan'), 'KNM', 'JKT', 'journals', { date: '2026-09-30', description: 'Akrual biaya audit eksternal Q3', reference: 'ACR-2026-09', lines: [{ account_id: A('6-2900'), debit: 45_000_000, cost_center_id: CC['CC-500'] }, { account_id: A('2-1400'), credit: 45_000_000 }] });
  await run(makeCtx('rina.akuntan'), 'KNM', 'journals', accrual, 'submit');
  await mk(maker, 'KNM', 'JKT', 'quotations', { date: '2026-10-01', valid_until: '2026-10-31', customer_id: CU.C004, tax_rate: 11, notes: 'Instalasi pabrik baru', lines: [tradeLine('FG-101', 120), tradeLine('SV-301', 200)] });
  const sentQt = await mk(maker, 'KNM', 'JKT', 'quotations', { date: '2026-09-25', valid_until: '2026-10-25', customer_id: CU.C001, tax_rate: 11, lines: [tradeLine('SV-303', 12)] });
  await run(maker, 'KNM', 'quotations', sentQt, 'send');
  // Penjualan & pembelian awal Oktober (belum jatuh tempo)
  await invoice('KNM', 'JKT', 'WH-JKT', 'C001', [tradeLine('FG-101', 40), tradeLine('FG-102', 30)], '2026-10-02');
  await invoice('KNM', 'SBY', 'WH-SBY', 'C003', [tradeLine('FG-103', 400), tradeLine('TG-203', 200)], '2026-10-03');
  const wo = await mk(maker, 'KNM', 'CKR', 'work_orders', { date: '2026-10-05', bom_id: BOM['FG-101'], qty: 180, warehouse_id: WH['WH-CKR'], line: 'Lini A', due_date: '2026-10-09', pic: 'Budi Santoso', progress: 35 });
  await run(maker, 'KNM', 'work_orders', wo, 'start');
  await mk(maker, 'KNM', 'CKR', 'work_orders', { date: '2026-10-06', bom_id: BOM['FG-103'], qty: 2500, warehouse_id: WH['WH-CKR'], line: 'Lini C', due_date: '2026-10-12', pic: 'Budi Santoso' });
  await mk(maker, 'KNM', 'JKT', 'payroll_runs', { period: '2026-10', pay_date: '2026-10-25', bank_account_id: BA['MDR-PAY'] });

  setToday(null);
}
