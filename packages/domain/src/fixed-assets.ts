/**
 * Aset tetap (rencana Fase 4 sprint 10): penyusutan garis lurus bulanan, pelepasan.
 *   Perolehan: Dr aset tetap / Cr bank (atau utang).
 *   Penyusutan: Dr beban penyusutan / Cr akumulasi penyusutan (tidak melewati nilai residu).
 *   Pelepasan: Dr akumulasi + Dr bank (hasil) / Cr aset; selisih ke laba/rugi lain-lain.
 */
import type { Rupiah } from './types.js';

export const monthlyStraightLine = (cost: Rupiah, salvage: Rupiah, lifeMonths: number): Rupiah => (lifeMonths > 0 ? Math.round((cost - salvage) / lifeMonths) : 0);

/** Penyusutan bulan ini: tarif bulanan, dibatasi sisa nilai buku di atas residu. */
export const depreciationFor = (bookValue: Rupiah, salvage: Rupiah, monthly: Rupiah): Rupiah => Math.max(0, Math.min(monthly, bookValue - salvage));

export function disposalLines(x: { cost: Rupiah; bookValue: Rupiah; proceeds: Rupiah; assetAccount: string; accumAccount: string; bankAccount?: string; bank?: string; gainAccount: string; lossAccount: string }) {
  const accum = x.cost - x.bookValue;
  const gain = x.proceeds - x.bookValue;
  const lines: { account: string; debit: Rupiah; credit: Rupiah; bank?: string; memo?: string | null }[] = [];
  if (accum) lines.push({ account: x.accumAccount, debit: accum, credit: 0, memo: 'Akumulasi penyusutan aset dilepas' });
  if (x.proceeds) lines.push({ account: x.bankAccount!, debit: x.proceeds, credit: 0, bank: x.bank, memo: 'Hasil pelepasan' });
  if (gain < 0) lines.push({ account: x.lossAccount, debit: -gain, credit: 0, memo: 'Rugi pelepasan aset' });
  lines.push({ account: x.assetAccount, debit: 0, credit: x.cost, memo: 'Harga perolehan aset dilepas' });
  if (gain > 0) lines.push({ account: x.gainAccount, debit: 0, credit: gain, memo: 'Laba pelepasan aset' });
  return { lines, gain };
}

/** Periode YYYY-MM berikutnya. */
export function nextMonth(period: string) {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
export const monthEndOf = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
