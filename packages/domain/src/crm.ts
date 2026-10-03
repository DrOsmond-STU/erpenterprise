/**
 * CRM & penawaran (dok. 07 §3.1, §4.1): tahap peluang & probabilitas bawaan, nilai
 * pipeline tertimbang, dan aturan masa berlaku / konversi penawaran.
 */
export const OPP_STAGES = ['prospek', 'kualifikasi', 'penawaran', 'negosiasi', 'menang', 'kalah'] as const;
export type OppStage = (typeof OPP_STAGES)[number];
export const STAGE_PROBABILITY: Record<OppStage, number> = { prospek: 10, kualifikasi: 30, penawaran: 50, negosiasi: 75, menang: 100, kalah: 0 };
export const OPP_SOURCES = ['Website', 'Referensi', 'Tender', 'Pameran', 'Langsung', 'Lainnya'];
export const isClosedStage = (s: string) => s === 'menang' || s === 'kalah';

/** Pipeline = Σ nilai × probabilitas untuk peluang yang belum menang/kalah. */
export function pipelineValue(opps: { value: number; probability: number; stage: string }[]): number {
  return Math.round(opps.filter((o) => !isClosedStage(o.stage)).reduce((t, o) => t + (o.value * o.probability) / 100, 0));
}

/** Probabilitas mengikuti tahap; menang = 100, kalah = 0; tahap terbuka boleh disesuaikan 1–99. */
export function probabilityFor(stage: OppStage, requested?: number | null): number {
  if (stage === 'menang') return 100;
  if (stage === 'kalah') return 0;
  if (requested === undefined || requested === null) return STAGE_PROBABILITY[stage];
  return Math.min(99, Math.max(1, Math.round(requested)));
}

/** Masalah perpindahan tahap: kalah wajib beralasan; menang hanya lewat penawaran diterima → pesanan. */
export function stageProblems(from: string, to: OppStage, lostReason?: string | null, viaOrder = false): string[] {
  if (isClosedStage(from) && from !== to) return [`Peluang sudah ${from}; buka kembali tidak didukung — buat peluang baru.`];
  if (to === 'kalah' && (lostReason ?? '').trim().length < 5) return ['Peluang kalah wajib diberi alasan (minimal 5 karakter) untuk evaluasi.'];
  if (to === 'menang' && !viaOrder) return ['Peluang menjadi menang saat penawarannya diterima dan dikonversi menjadi pesanan penjualan.'];
  return [];
}

/** Penawaran kedaluwarsa bila masa berlaku lewat sebelum diterima. */
export const quoteExpired = (validUntil: string, asOf: string, status: string) => (status === 'draf' || status === 'terkirim') && validUntil < asOf;
