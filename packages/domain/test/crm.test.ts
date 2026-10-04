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

import { dunningLevel, leadConvertProblems, leadScore, promiseStatus, supplierScore, ticketSlaDue } from '../src/crm.js';

describe('CRM lengkap', () => {
  it('skor lead naik dengan kelengkapan & kualifikasi', () => {
    const base = { status: 'baru', source: 'Website' };
    const full = { status: 'kualifikasi', email: 'a@b.c', phone: '08', companyName: 'PT X', source: 'Referensi', campaignId: 'c', estimatedValue: 600_000_000, activities: 3 };
    expect(leadScore(base)).toBeLessThan(leadScore(full));
    expect(leadScore({ ...full, status: 'diskualifikasi' })).toBe(0);
    expect(leadScore(full)).toBeLessThanOrEqual(99);
  });
  it('konversi lead hanya setelah dihubungi/kualifikasi', () => {
    expect(leadConvertProblems('baru')).toHaveLength(1);
    expect(leadConvertProblems('kualifikasi')).toEqual([]);
  });
  it('SLA tiket kritis 4 jam', () => {
    expect(ticketSlaDue(new Date('2026-10-01T00:00:00Z'), 'kritis').toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });
  it('janji bayar ditepati dari pembayaran setelah janji', () => {
    const p = { amount: 1000, paidBefore: 500, promiseDate: '2026-10-05', status: 'aktif' };
    expect(promiseStatus(p, 1500, '2026-10-10')).toBe('ditepati');
    expect(promiseStatus(p, 900, '2026-10-10')).toBe('ingkar');
    expect(promiseStatus(p, 900, '2026-10-01')).toBe('menunggu');
  });
  it('tingkat penagihan & skor pemasok', () => {
    expect(dunningLevel(45).level).toBe(2);
    expect(dunningLevel(120).label).toBe('Eskalasi');
    expect(supplierScore({ onTimeRate: 100, tickets: 0, receipts: 10, rfqWinRate: 100 })).toBe(100);
  });
});
