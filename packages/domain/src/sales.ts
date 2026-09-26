/**
 * Penjualan & piutang (dok. 07 §4, §10.2): perhitungan dokumen, status faktur,
 * umur piutang, dan pemeriksaan plafon kredit. Murni — dipakai API dan web.
 */
import { PPN_RATE, round } from './money.js';
import type { Rupiah } from './types.js';

export const REVENUE_GOODS = '4-1000';
export const REVENUE_SERVICE = '4-2000';
export const PPN_OUT = '2-1400';
export const COGS_ACCOUNT = '5-1000';
export const FINISHED_GOODS = '1-1500';
export const RAW_MATERIALS = '1-1400';

export type ItemKind = 'barang' | 'jasa';
export interface SalesLineInput { qty: number; price: Rupiah; discPct?: number; kind: ItemKind }
export interface SalesTotals { lines: Rupiah[]; subtotal: Rupiah; discount: Rupiah; net: Rupiah; netGoods: Rupiah; netService: Rupiah; ppn: Rupiah; total: Rupiah }

/** Neto per baris = qty × harga × (1 − diskon%), dibulatkan ke rupiah; PPN 11% dari total neto. */
export function salesTotals(lines: SalesLineInput[], rate = PPN_RATE): SalesTotals {
  let subtotal = 0, netGoods = 0, netService = 0;
  const nets = lines.map((l) => {
    const gross = round(l.qty * l.price);
    const net = round(gross * (1 - (l.discPct ?? 0) / 100));
    subtotal += gross;
    if (l.kind === 'jasa') netService += net; else netGoods += net;
    return net;
  });
  const net = netGoods + netService;
  const ppn = round(net * rate);
  return { lines: nets, subtotal, discount: subtotal - net, net, netGoods, netService, ppn, total: net + ppn };
}

export function lineProblems(l: { qty: number; price: number; discPct?: number }, i: number): string[] {
  const out: string[] = [];
  const n = `Baris ${i + 1}`;
  if (!(l.qty > 0)) out.push(`${n}: kuantitas harus lebih dari nol.`);
  if (!Number.isInteger(l.price) || l.price < 0) out.push(`${n}: harga harus rupiah bulat ≥ 0.`);
  if ((l.discPct ?? 0) < 0 || (l.discPct ?? 0) > 100) out.push(`${n}: diskon 0–100%.`);
  return out;
}

export const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

export type InvoiceStatus = 'draf' | 'belum-dibayar' | 'sebagian' | 'lunas' | 'batal';
/** Status tersimpan dari nilai & pembayaran. Jatuh tempo dihitung saat tampil, bukan disimpan. */
export function invoiceStatus(total: Rupiah, paid: Rupiah): Exclude<InvoiceStatus, 'draf' | 'batal'> {
  if (paid <= 0) return 'belum-dibayar';
  return paid >= total ? 'lunas' : 'sebagian';
}
export function overdueDays(dueDate: string, asOf: string, open: Rupiah): number {
  return open > 0 ? Math.max(0, daysBetween(dueDate, asOf)) : 0;
}

export const AGING_BUCKETS = [
  { key: 'current', label: 'Belum jatuh tempo', min: -Infinity, max: 0 },
  { key: 'd30', label: '1–30 hari', min: 1, max: 30 },
  { key: 'd60', label: '31–60 hari', min: 31, max: 60 },
  { key: 'd90', label: '61–90 hari', min: 61, max: 90 },
  { key: 'over90', label: 'Lebih dari 90 hari', min: 91, max: Infinity },
] as const;
export type AgingKey = (typeof AGING_BUCKETS)[number]['key'];
export const agingKey = (dueDate: string, asOf: string): AgingKey => {
  const d = daysBetween(dueDate, asOf);
  return AGING_BUCKETS.find((b) => d >= b.min && d <= b.max)!.key;
};
export function aging(docs: { dueDate: string; open: Rupiah }[], asOf: string) {
  const buckets = AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, value: 0, count: 0 }));
  for (const d of docs) {
    if (d.open <= 0) continue;
    const b = buckets.find((x) => x.key === agingKey(d.dueDate, asOf))!;
    b.value += d.open; b.count += 1;
  }
  return buckets;
}

export interface CreditPolicy { salesApprovalThreshold: number; blockOverCreditLimit: boolean }
export interface CreditCheck { needsApproval: boolean; reasons: string[]; available: Rupiah; exposureAfter: Rupiah }
/**
 * Pesanan butuh persetujuan manajer bila pelanggan ditahan, nilai melebihi sisa
 * plafon (bila kebijakan memblokir), atau melampaui batas persetujuan perusahaan.
 */
export function creditCheck(customer: { status: string; creditLimit: Rupiah }, exposure: Rupiah, amount: Rupiah, policy: CreditPolicy): CreditCheck {
  const reasons: string[] = [];
  const available = customer.creditLimit - exposure;
  if (customer.status === 'ditahan') reasons.push('Pelanggan berstatus ditahan.');
  if (amount > available && policy.blockOverCreditLimit) reasons.push(`Nilai pesanan melebihi sisa plafon kredit (sisa Rp ${Math.max(0, available).toLocaleString('id-ID')}).`);
  if (policy.salesApprovalThreshold > 0 && amount > policy.salesApprovalThreshold) reasons.push(`Nilai pesanan di atas batas persetujuan Rp ${policy.salesApprovalThreshold.toLocaleString('id-ID')}.`);
  return { needsApproval: reasons.length > 0, reasons, available, exposureAfter: exposure + amount };
}

/** Termin → jumlah hari ("Net 30" → 30, "Tunai" → 0). */
export const termDays = (terms: string | number): number => (typeof terms === 'number' ? terms : Number(/(\d+)/.exec(terms)?.[1] ?? 0));
