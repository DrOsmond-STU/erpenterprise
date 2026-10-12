/* ==========================================================================
   Akun buku besar per data master.
   Setiap pelanggan, pemasok, barang/jasa, aset tetap, karyawan, rekening kas/bank, kode pajak,
   gudang, cabang, perusahaan, mata uang, dan BOM menyimpan akun buku
   besarnya sendiri (piutang/hutang, uang muka, deposit, potongan; persediaan,
   HPP, pendapatan, retur, beban jasa; aset, akumulasi & beban penyusutan,
   laba/rugi pelepasan, beban pemeliharaan; beban gaji, hutang gaji, PPh 21, BPJS;
   biaya bank, giro mundur, selisih kas). Saat data master dibuat, kolom akun yang
   kosong diisi akun bawaan; nilainya dapat diubah per data. Posting membaca
   akun dari data master (akun bawaan hanya cadangan bila kolom kosong) dan
   rekonsiliasi sub-buku menjumlahkan seluruh akun yang dipakai data master.
   ========================================================================== */
import * as db from '../db.js';
import { acct, accountByCode } from './posting.js';
import { bad } from '../lib/util.js';

const ic = (p) => !!p?.related_company_id;

/** [kolom master, kunci akun bawaan (atau fungsi atas data master), label]. */
export const PARTY_ACCOUNTS = {
  customer: {
    table: 'customers',
    keys: {
      control: ['ar_account_id', (p) => (ic(p) ? 'ic_receivable' : 'ar'), 'Akun piutang usaha'],
      sales: ['sales_account_id', (p) => (ic(p) ? 'ic_sales' : null), 'Akun pendapatan (kosong = akun barang/jasa)'],
      discount: ['discount_account_id', 'sales_discount', 'Akun potongan penjualan'],
      advance: ['advance_account_id', 'customer_advance', 'Akun titipan / uang muka pelanggan'],
      dp: ['dp_account_id', 'sales_dp', 'Akun uang muka penjualan (faktur uang muka)'],
      deposit: ['deposit_account_id', 'deposit_saldo', 'Akun deposit pelanggan (saldo)'],
      guarantee: ['guarantee_account_id', 'deposit_guarantee', 'Akun uang jaminan pelanggan'],
      forfeit: ['forfeit_account_id', 'deposit_forfeit', 'Akun pendapatan kompensasi (jaminan dicairkan)'],
    },
  },
  supplier: {
    table: 'suppliers',
    keys: {
      control: ['ap_account_id', (p) => (ic(p) ? 'ic_payable' : 'ap'), 'Akun hutang usaha'],
      discount: ['discount_account_id', 'purchase_discount', 'Akun potongan pembelian'],
      advance: ['advance_account_id', 'supplier_advance', 'Akun titipan / uang muka ke pemasok'],
      dp: ['dp_account_id', 'purchase_dp', 'Akun uang muka pembelian (faktur uang muka)'],
      deposit: ['deposit_account_id', 'sdeposit_saldo', 'Akun deposit di pemasok (saldo)'],
      guarantee: ['guarantee_account_id', 'sdeposit_guarantee', 'Akun uang jaminan di pemasok'],
      forfeit: ['forfeit_account_id', 'sdeposit_forfeit', 'Akun beban jaminan hangus'],
    },
  },
};

const STOCK_KINDS = new Set(['barang_dagang', 'bahan_baku', 'barang_jadi']);
const isService = (p) => p?.kind === 'jasa';
/** Akun barang/jasa: persediaan & HPP & barang terkirim hanya untuk barang persediaan; beban pembelian untuk jasa. */
export const PRODUCT_ACCOUNTS = {
  inventory: ['inventory_account_id', (p) => (isService(p) ? null : 'inventory'), 'Akun persediaan'],
  cogs: ['cogs_account_id', (p) => (isService(p) ? null : 'cogs'), 'Akun HPP'],
  delivered: ['delivered_account_id', (p) => (isService(p) ? null : 'goods_delivered'), 'Akun persediaan terkirim belum difakturkan'],
  revenue: ['revenue_account_id', 'sales', 'Akun pendapatan'],
  returns: ['sales_return_account_id', 'sales_returns', 'Akun retur penjualan'],
  expense: ['expense_account_id', (p) => (isService(p) ? 'cogs' : null), 'Akun beban pembelian (jasa / non-persediaan)'],
  variance: ['variance_account_id', 'purchase_variance', 'Akun selisih harga pembelian / retur'],
};

/* Aset tetap: akun aset & akumulasi bawaan menurut kategori; beban penyusutan, laba/rugi pelepasan, pemeliharaan. */
const ASSET_CATEGORY = {
  Bangunan: ['1-2200', '1-2210'], 'Mesin & Peralatan': ['1-2300', '1-2310'], Kendaraan: ['1-2400', '1-2410'], 'Peralatan Kantor & TI': ['1-2500', '1-2510'],
};
const byCategory = (i) => (a) => { const c = ASSET_CATEGORY[a?.category]; return c ? { code: c[i] } : null; };
export const ASSET_ACCOUNTS = {
  asset: ['asset_account_id', byCategory(0), 'Akun aset tetap'],
  accum: ['accum_account_id', byCategory(1), 'Akun akumulasi penyusutan'],
  expense: ['expense_account_id', 'depreciation_expense', 'Akun beban penyusutan'],
  gain: ['gain_account_id', 'gain_disposal', 'Akun laba pelepasan aset'],
  loss: ['loss_account_id', 'loss_disposal', 'Akun rugi pelepasan aset'],
  maintenance: ['maintenance_account_id', 'maintenance_expense', 'Akun beban pemeliharaan'],
};

/* Karyawan: beban gaji (bruto: gaji pokok, tunjangan, lembur) dan akun hutang gaji, PPh 21, BPJS. */
export const EMPLOYEE_ACCOUNTS = {
  expense: ['salary_expense_account_id', 'salary_expense', 'Akun beban gaji & tunjangan'],
  payable: ['salary_payable_account_id', 'salary_payable', 'Akun hutang gaji'],
  pph21: ['pph21_account_id', 'pph21_payable', 'Akun hutang PPh 21'],
  bpjs: ['bpjs_account_id', 'bpjs_payable', 'Akun hutang BPJS'],
};

/* Kas & bank: akun kas/bank (account_id, wajib) + biaya administrasi bank, giro mundur diterima
   (rekening setor) / diberikan (rekening penerbit), dan selisih kas kasir (laci kas). */
export const BANK_ACCOUNTS = {
  charge: ['charge_account_id', 'bank_charge', 'Akun biaya administrasi bank'],
  giro_in: ['giro_in_account_id', 'giro_receivable', 'Akun giro mundur diterima (belum cair)'],
  giro_out: ['giro_out_account_id', 'giro_payable', 'Akun giro mundur diberikan (belum cair)'],
  cash_diff: ['cash_diff_account_id', 'cash_over_short', 'Akun selisih kas (kasir)'],
};

/* Data master lain yang terhubung ke bagan akun & laporan keuangan:
   gudang (akun penyesuaian/selisih stok bawaan), cabang (rekening antar cabang/RAK), perusahaan
   (modal disetor, saldo laba untuk tutup buku & konsolidasi, investasi pada entitas anak), mata uang
   (laba/rugi selisih kurs), dan BOM (barang dalam proses produksi). */
export const MASTER_ACCOUNTS = {
  warehouses: { adjustment: ['adjustment_account_id', 'stock_adjustment', 'Akun penyesuaian / selisih stok'] },
  branches: { rak: ['rak_account_id', 'inter_branch', 'Akun rekening antar cabang (RAK)'] },
  companies: {
    capital: ['share_capital_account_id', 'share_capital', 'Akun modal disetor'],
    retained: ['retained_earnings_account_id', 'retained_earnings', 'Akun saldo laba'],
    investment: ['investment_account_id', 'investment_sub', 'Akun investasi pada entitas anak'],
  },
  currencies: {
    gain: ['fx_gain_account_id', 'fx_gain', 'Akun laba selisih kurs'],
    loss: ['fx_loss_account_id', 'fx_loss', 'Akun rugi selisih kurs'],
  },
  boms: { wip: ['wip_account_id', 'wip', 'Akun barang dalam proses'] },
};

/** Semua kunci akun bawaan yang kini diatur di data master (tidak lagi di Pengaturan). */
export const MASTER_KEYS = new Set(['ar', 'ic_receivable', 'ic_sales', 'sales_discount', 'customer_advance', 'sales_dp', 'deposit_saldo', 'deposit_guarantee',
  'ap', 'ic_payable', 'purchase_discount', 'supplier_advance', 'purchase_dp', 'sdeposit_saldo', 'sdeposit_guarantee',
  'inventory', 'cogs', 'goods_delivered', 'sales', 'sales_returns',
  'depreciation_expense', 'gain_disposal', 'loss_disposal', 'maintenance_expense',
  'salary_expense', 'salary_payable', 'pph21_payable', 'bpjs_payable',
  'bank_charge', 'giro_receivable', 'giro_payable', 'cash_over_short',
  'vat_out', 'vat_in', 'pph23_prepaid', 'pph23_payable',
  'deposit_forfeit', 'sdeposit_forfeit', 'purchase_variance',
  'stock_adjustment', 'inter_branch', 'share_capital', 'retained_earnings', 'investment_sub', 'fx_gain', 'fx_loss', 'wip']);

const keyOf = (def, row) => (typeof def === 'function' ? def(row || {}) : def);
/* Bawaan berupa kunci pemetaan (mis. 'ar') atau kode akun langsung ({ code }) — mis. akun aset per kategori. */
const defaultId = (def, row) => { const k = keyOf(def, row); return !k ? null : typeof k === 'object' ? accountByCode(k.code).id : acct(k); };

/** id akun mitra untuk satu jenis (dari master; bila kosong → akun bawaan). */
export function partyAcct(type, partyOrId, key) {
  const cfg = PARTY_ACCOUNTS[type];
  const p = partyOrId && typeof partyOrId === 'object' ? partyOrId : db.get(`SELECT * FROM ${cfg.table} WHERE id = ?`, partyOrId);
  const [field, def] = cfg.keys[key];
  return p?.[field] || defaultId(def, p);
}

/** id akun barang/jasa (dari master; bila kosong → akun bawaan, atau akun cadangan yang diberikan). */
export function productAccount(p, key, fallbackKey = null) {
  const [field, def] = PRODUCT_ACCOUNTS[key];
  return p?.[field] || defaultId(def, p) || (fallbackKey ? acct(fallbackKey) : null);
}

/** Seluruh akun yang dipakai mitra untuk satu jenis (override master + bawaan) — dasar rekonsiliasi sub-buku. */
export function partyAccountSet(type, key) {
  const cfg = PARTY_ACCOUNTS[type];
  const [field, def] = cfg.keys[key];
  const ids = new Set(db.all(`SELECT DISTINCT ${field} id FROM ${cfg.table} WHERE ${field} IS NOT NULL`).map((r) => r.id));
  for (const sample of [{}, { related_company_id: 1 }]) { const id = defaultId(def, sample); if (id) ids.add(id); }
  return [...ids];
}

/** Seluruh akun barang untuk satu jenis (override master + bawaan). */
export function productAccountSet(key) {
  const [field, def] = PRODUCT_ACCOUNTS[key];
  const ids = new Set(db.all(`SELECT DISTINCT ${field} id FROM products WHERE ${field} IS NOT NULL`).map((r) => r.id));
  for (const kind of STOCK_KINDS) { const id = defaultId(def, { kind }); if (id) ids.add(id); }
  return [...ids];
}

/** Isi kolom akun yang kosong pada data master dengan akun bawaan (dipakai saat simpan & migrasi). */
export function fillPartyDefaults(type, row) {
  for (const [field, def] of Object.values(PARTY_ACCOUNTS[type].keys)) if (row[field] == null || row[field] === '') row[field] = defaultId(def, row);
  return row;
}
export function fillProductDefaults(row) {
  for (const [field, def] of Object.values(PRODUCT_ACCOUNTS)) if (row[field] == null || row[field] === '') row[field] = defaultId(def, row);
  return row;
}

/** id akun aset tetap (dari master; bila kosong → akun bawaan). */
export function assetAccount(a, key) {
  const [field, def] = ASSET_ACCOUNTS[key];
  return a?.[field] || defaultId(def, a);
}
export function fillAssetDefaults(row) {
  for (const [field, def] of Object.values(ASSET_ACCOUNTS)) if (row[field] == null || row[field] === '') row[field] = defaultId(def, row);
  return row;
}

/** id akun karyawan (dari master; bila kosong → akun bawaan). */
export function employeeAccount(e, key) {
  const [field, def] = EMPLOYEE_ACCOUNTS[key];
  return e?.[field] || defaultId(def, e);
}
export function fillEmployeeDefaults(row) {
  for (const [field, def] of Object.values(EMPLOYEE_ACCOUNTS)) if (row[field] == null || row[field] === '') row[field] = defaultId(def, row);
  return row;
}

/** id akun rekening kas/bank (dari master; bila kosong → akun bawaan). */
export function bankAccount(b, key) {
  const [field, def] = BANK_ACCOUNTS[key];
  return b?.[field] || defaultId(def, b);
}
export function fillBankDefaults(row) {
  for (const [field, def] of Object.values(BANK_ACCOUNTS)) if (row[field] == null || row[field] === '') row[field] = defaultId(def, row);
  return row;
}
/** Seluruh akun giro yang dipakai rekening (override master + bawaan) — rekonsiliasi register giro. */
export function bankAccountSet(key) {
  const [field, def] = BANK_ACCOUNTS[key];
  const ids = new Set(db.all(`SELECT DISTINCT ${field} id FROM bank_accounts WHERE ${field} IS NOT NULL`).map((r) => r.id));
  const d = defaultId(def, {}); if (d) ids.add(d);
  return [...ids];
}

/** id akun data master lain (gudang, cabang, perusahaan, mata uang, BOM); kolom kosong → akun bawaan. */
export function masterAcct(table, rowOrId, key) {
  const [field, def] = MASTER_ACCOUNTS[table][key];
  const r = rowOrId && typeof rowOrId === 'object' ? rowOrId : rowOrId ? db.get(`SELECT * FROM ${table} WHERE id = ?`, rowOrId) : null;
  return r?.[field] || defaultId(def, r);
}
export function fillMasterDefaults(table, row) {
  for (const [field, def] of Object.values(MASTER_ACCOUNTS[table])) if (row[field] == null || row[field] === '') row[field] = defaultId(def, row);
  return row;
}
/** Seluruh akun satu jenis pada data master lain (+ bawaan) — mis. semua akun RAK cabang. */
export function masterKeySet(table, key) {
  const [field, def] = MASTER_ACCOUNTS[table][key];
  return masterAccountSet(table, field, def);
}

/* --- Master pajak ---------------------------------------------------------------------
   Kode pajak menyimpan tarif dan akunnya: PPN (keluaran untuk penjualan, masukan untuk pembelian)
   dan PPh 23 (dibayar di muka bila dipotong pelanggan, hutang bila kita memotong pemasok). */
export const TAX_KINDS = [['ppn', 'PPN'], ['pph23', 'PPh 23']];
const TAX_DEFAULT_KEYS = { ppn: ['vat_out', 'vat_in'], pph23: ['pph23_prepaid', 'pph23_payable'] };
/** Kode pajak bawaan sistem (dibuat saat pemutakhiran bila master pajak masih kosong). */
export const DEFAULT_TAXES = [
  ['PPN11', 'PPN 11%', 'ppn', 11, 1], ['PPN12', 'PPN 12% (barang mewah / tarif umum baru)', 'ppn', 12, 0],
  ['PPN0', 'PPN 0% — ekspor / dibebaskan', 'ppn', 0, 0], ['PPH23', 'PPh 23 — jasa 2%', 'pph23', 2, 1],
];
export const getTax = (id) => (id ? db.get('SELECT * FROM taxes WHERE id = ?', id) : null);
export const defaultTax = (kind) => db.get("SELECT * FROM taxes WHERE kind = ? AND is_default = 1 AND status = 'aktif' ORDER BY id LIMIT 1", kind) || null;
const taxByRate = (rate) => db.get("SELECT * FROM taxes WHERE kind = 'ppn' AND rate = ? AND status = 'aktif' ORDER BY is_default DESC, id LIMIT 1", Number(rate) || 0) || null;
export function fillTaxDefaults(row) {
  const [o, i] = TAX_DEFAULT_KEYS[row.kind] || TAX_DEFAULT_KEYS.ppn;
  if (row.sales_account_id == null || row.sales_account_id === '') row.sales_account_id = acct(o);
  if (row.purchase_account_id == null || row.purchase_account_id === '') row.purchase_account_id = acct(i);
  return row;
}

/**
 * Kode & tarif PPN dokumen: kode pajak menentukan tarif; tanpa kode, tarif yang dikirim dicocokkan ke
 * kode PPN bertarif sama; tanpa keduanya dipakai kode bawaan mitra lalu PPN bawaan.
 */
export function applyTax(row, partyTable = null, partyField = null, { optional = false } = {}) {
  if (row.tax_id) {
    const t = getTax(row.tax_id);
    if (!t || t.kind !== 'ppn') throw bad('Kode pajak dokumen harus berjenis PPN.');
    row.tax_rate = t.rate;
    return;
  }
  if (row.tax_rate != null && row.tax_rate !== '') { row.tax_id = (Number(row.tax_rate) > 0 || !optional ? taxByRate(row.tax_rate)?.id : null) ?? null; return; }
  if (optional) { row.tax_rate = 0; row.tax_id = null; return; }
  const p = partyTable && row[partyField] ? db.get(`SELECT tax_id FROM ${partyTable} WHERE id = ?`, row[partyField]) : null;
  const t = getTax(p?.tax_id) || defaultTax('ppn');
  row.tax_id = t?.id ?? null;
  row.tax_rate = t ? t.rate : 11;
}

/** Akun PPN dokumen: 'out' = keluaran (penjualan), 'in' = masukan (pembelian). */
export function vatAccount(doc, side) {
  const t = getTax(doc?.tax_id) || taxByRate(doc?.tax_rate);
  return t?.[side === 'out' ? 'sales_account_id' : 'purchase_account_id'] || acct(side === 'out' ? 'vat_out' : 'vat_in');
}
/** Akun PPh 23: 'out' = dibayar di muka (dipotong pelanggan), 'in' = hutang (kita potong pemasok). */
export function pphAccount(taxId, side) {
  const t = getTax(taxId) || defaultTax('pph23');
  if (t && t.kind !== 'pph23') throw bad('Kode PPh harus berjenis PPh 23.');
  return t?.[side === 'out' ? 'sales_account_id' : 'purchase_account_id'] || acct(side === 'out' ? 'pph23_prepaid' : 'pph23_payable');
}
/** Seluruh akun pajak satu jenis & sisi (master + bawaan) — rekap pajak. */
export function taxAccountSet(kind, side) {
  const field = side === 'out' ? 'sales_account_id' : 'purchase_account_id';
  const ids = new Set(db.all(`SELECT DISTINCT ${field} id FROM taxes WHERE kind = ? AND ${field} IS NOT NULL`, kind).map((r) => r.id));
  ids.add(acct(TAX_DEFAULT_KEYS[kind][side === 'out' ? 0 : 1]));
  return [...ids];
}
/** Seluruh akun pada satu kolom data master (+ akun bawaan) — mis. hutang PPh 21 karyawan. */
export function masterAccountSet(table, field, defaultKey) {
  const ids = new Set(db.all(`SELECT DISTINCT ${field} id FROM ${table} WHERE ${field} IS NOT NULL`).map((r) => r.id));
  ids.add(acct(defaultKey));
  return [...ids];
}

/** SQL "IN (…)" aman untuk daftar id akun. */
export const inList = (ids) => (ids.length ? `(${ids.map((x) => Number(x)).join(',')})` : '(NULL)');
