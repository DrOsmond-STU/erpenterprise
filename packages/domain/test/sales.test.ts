import { describe, expect, it } from 'vitest';
import { aging, creditCheck, invoiceStatus, lineProblems, overdueDays, salesTotals, termDays, addDays } from '../src/sales.js';

describe('penjualan', () => {
  it('menghitung neto, diskon, PPN 11% dan total per jenis', () => {
    const t = salesTotals([
      { qty: 480, price: 512_000, discPct: 5, kind: 'barang' },
      { qty: 1, price: 24_500_000, kind: 'jasa' },
    ]);
    expect(t.subtotal).toBe(480 * 512_000 + 24_500_000);
    expect(t.netGoods).toBe(Math.round(480 * 512_000 * 0.95));
    expect(t.netService).toBe(24_500_000);
    expect(t.ppn).toBe(Math.round(t.net * 0.11));
    expect(t.total).toBe(t.net + t.ppn);
    expect(t.discount).toBe(t.subtotal - t.net);
  });
  it('status faktur dari pembayaran', () => {
    expect(invoiceStatus(100, 0)).toBe('belum-dibayar');
    expect(invoiceStatus(100, 40)).toBe('sebagian');
    expect(invoiceStatus(100, 100)).toBe('lunas');
    expect(overdueDays('2026-08-01', '2026-08-15', 10)).toBe(14);
    expect(overdueDays('2026-08-01', '2026-08-15', 0)).toBe(0);
  });
  it('ember umur piutang', () => {
    const b = aging([{ dueDate: '2026-09-01', open: 5 }, { dueDate: '2026-08-10', open: 7 }, { dueDate: '2026-04-01', open: 9 }, { dueDate: '2026-01-01', open: 0 }], '2026-08-31');
    expect(b.find((x) => x.key === 'current')!.value).toBe(5);
    expect(b.find((x) => x.key === 'd30')!.value).toBe(7);
    expect(b.find((x) => x.key === 'over90')!.value).toBe(9);
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(3);
  });
  it('pemeriksaan plafon kredit & batas persetujuan', () => {
    const pol = { salesApprovalThreshold: 150_000_000, blockOverCreditLimit: true };
    expect(creditCheck({ status: 'aktif', creditLimit: 500 }, 100, 300, { ...pol, salesApprovalThreshold: 0 }).needsApproval).toBe(false);
    expect(creditCheck({ status: 'aktif', creditLimit: 500 }, 300, 300, { ...pol, salesApprovalThreshold: 0 }).reasons).toHaveLength(1);
    expect(creditCheck({ status: 'aktif', creditLimit: 500 }, 300, 300, { salesApprovalThreshold: 0, blockOverCreditLimit: false }).needsApproval).toBe(false);
    expect(creditCheck({ status: 'ditahan', creditLimit: 1e12 }, 0, 1, pol).needsApproval).toBe(true);
    expect(creditCheck({ status: 'aktif', creditLimit: 1e12 }, 0, 200_000_000, pol).needsApproval).toBe(true);
  });
  it('validasi baris, termin & tanggal', () => {
    expect(lineProblems({ qty: 0, price: 1 }, 0)).toHaveLength(1);
    expect(lineProblems({ qty: 1, price: 1.5, discPct: 120 }, 0)).toHaveLength(2);
    expect(termDays('Net 45')).toBe(45);
    expect(termDays('Tunai')).toBe(0);
    expect(addDays('2026-08-14', 30)).toBe('2026-09-13');
  });
});
