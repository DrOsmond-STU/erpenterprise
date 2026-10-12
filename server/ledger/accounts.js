/* ==========================================================================
   Akun buku besar per data master.
   Setiap pelanggan, pemasok, dan barang/jasa menyimpan akun buku besarnya
   sendiri (piutang/hutang, uang muka, deposit, potongan; persediaan, HPP,
   pendapatan, retur, beban jasa). Saat data master dibuat, kolom akun yang
   kosong diisi akun bawaan; nilainya dapat diubah per data. Posting membaca
   akun dari data master (akun bawaan hanya cadangan bila kolom kosong) dan
   rekonsiliasi sub-buku menjumlahkan seluruh akun yang dipakai data master.
   ========================================================================== */
import * as db from '../db.js';
import { acct } from './posting.js';

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
};

/** Semua kunci akun bawaan yang kini diatur di data master (tidak lagi di Pengaturan). */
export const MASTER_KEYS = new Set(['ar', 'ic_receivable', 'ic_sales', 'sales_discount', 'customer_advance', 'sales_dp', 'deposit_saldo', 'deposit_guarantee',
  'ap', 'ic_payable', 'purchase_discount', 'supplier_advance', 'purchase_dp', 'sdeposit_saldo', 'sdeposit_guarantee',
  'inventory', 'cogs', 'goods_delivered', 'sales', 'sales_returns']);

const keyOf = (def, row) => (typeof def === 'function' ? def(row || {}) : def);
const defaultId = (def, row) => { const k = keyOf(def, row); return k ? acct(k) : null; };

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

/** SQL "IN (…)" aman untuk daftar id akun. */
export const inList = (ids) => (ids.length ? `(${ids.map((x) => Number(x)).join(',')})` : '(NULL)');
