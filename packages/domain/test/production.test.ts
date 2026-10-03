import { describe, expect, it } from 'vitest';
import { bomRequirement, canMove, unitCostOf, usageVariance, wipBalance } from '../src/production.js';

describe('produksi', () => {
  it('kebutuhan bahan proporsional terhadap ukuran batch BOM', () => {
    expect(bomRequirement([{ sku: 'A', qty: 25 }, { sku: 'B', qty: 0.5 }], 100, 80)).toEqual([{ sku: 'A', qty: 20 }, { sku: 'B', qty: 0.4 }]);
    expect(bomRequirement([{ sku: 'A', qty: 1 }], 3, 1)).toEqual([{ sku: 'A', qty: 0.3333 }]);
    expect(bomRequirement([{ sku: 'A', qty: 1 }], 0, 5)).toEqual([]);
  });

  it('transisi status perintah kerja', () => {
    expect(canMove('antre', 'berjalan')).toBe(true);
    expect(canMove('berjalan', 'qc')).toBe(true);
    expect(canMove('qc', 'selesai')).toBe(true);
    expect(canMove('qc', 'berjalan')).toBe(true);
    expect(canMove('berjalan', 'batal')).toBe(false);
    expect(canMove('selesai', 'berjalan')).toBe(false);
  });

  it('saldo WIP dan HPP per unit hasil', () => {
    expect(wipBalance([1000, 500], [0])).toBe(1500);
    expect(unitCostOf(1500, 7)).toBe(214);
    expect(unitCostOf(1500, 0)).toBe(0);
  });

  it('selisih pemakaian aktual vs standar', () => {
    expect(usageVariance([{ sku: 'A', qty: 20 }], [{ sku: 'A', qty: 10 }, { sku: 'A', qty: 12 }])).toEqual([{ sku: 'A', standard: 20, actual: 22, diff: 2 }]);
  });
});
