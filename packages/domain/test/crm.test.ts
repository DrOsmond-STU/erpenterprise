import { describe, expect, it } from 'vitest';
import { pipelineValue, probabilityFor, quoteExpired, stageProblems } from '../src/crm.js';

describe('CRM', () => {
  it('pipeline tertimbang hanya peluang terbuka', () => {
    expect(pipelineValue([{ value: 1000, probability: 50, stage: 'penawaran' }, { value: 400, probability: 75, stage: 'negosiasi' }, { value: 9999, probability: 100, stage: 'menang' }])).toBe(800);
  });
  it('probabilitas menurut tahap', () => {
    expect(probabilityFor('menang', 40)).toBe(100);
    expect(probabilityFor('kalah')).toBe(0);
    expect(probabilityFor('negosiasi')).toBe(75);
    expect(probabilityFor('penawaran', 120)).toBe(99);
  });
  it('aturan tahap', () => {
    expect(stageProblems('negosiasi', 'kalah', 'mahal')).toEqual([]);
    expect(stageProblems('negosiasi', 'kalah', '')[0]).toMatch(/alasan/);
    expect(stageProblems('penawaran', 'menang')[0]).toMatch(/pesanan/);
    expect(stageProblems('penawaran', 'menang', null, true)).toEqual([]);
    expect(stageProblems('kalah', 'prospek')[0]).toMatch(/sudah kalah/);
  });
  it('penawaran kedaluwarsa', () => {
    expect(quoteExpired('2026-09-30', '2026-10-01', 'terkirim')).toBe(true);
    expect(quoteExpired('2026-09-30', '2026-10-01', 'diterima')).toBe(false);
  });
});
