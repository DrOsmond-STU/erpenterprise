import type { Rupiah } from './types.js';

export const PPN_RATE = 0.11;

export const round = (v: number): Rupiah => Math.round(v);

/** Memecah nilai kotor (termasuk PPN) menjadi neto dan PPN, dibulatkan ke rupiah. */
export function splitPPN(gross: Rupiah, rate = PPN_RATE): { net: Rupiah; ppn: Rupiah } {
  const net = round(gross / (1 + rate));
  return { net, ppn: round(gross) - net };
}

/** Membagi nilai ke beberapa porsi tanpa kehilangan rupiah karena pembulatan. */
export function allocate(total: Rupiah, weights: number[]): Rupiah[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!sum) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let rest = total - parts.reduce((s, p) => s + p, 0);
  for (let i = 0; rest > 0 && i < parts.length; i += 1) { parts[i] += 1; rest -= 1; }
  return parts;
}

export function assertRupiah(v: unknown, field: string): asserts v is Rupiah {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new TypeError(`${field} harus bilangan bulat rupiah`);
  }
}
