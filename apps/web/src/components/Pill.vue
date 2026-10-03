<script setup lang="ts">
import { computed } from 'vue';
const STATUS: Record<string, { label: string; tone?: string }> = {
  posted: { label: 'Diposting', tone: 'ok' }, pending: { label: 'Menunggu persetujuan', tone: 'warn' }, rejected: { label: 'Ditolak', tone: 'danger' },
  reversed: { label: 'Dibalik', tone: 'info' }, draft: { label: 'Draf' }, draf: { label: 'Draf' },
  menunggu: { label: 'Menunggu persetujuan', tone: 'warn' }, disetujui: { label: 'Disetujui', tone: 'info' }, ditolak: { label: 'Ditolak', tone: 'danger' }, dikirim: { label: 'Dikirim', tone: 'info' },
  selesai: { label: 'Selesai', tone: 'ok' }, batal: { label: 'Batal' }, 'belum-dibayar': { label: 'Belum dibayar', tone: 'warn' }, sebagian: { label: 'Dibayar sebagian', tone: 'info' },
  lunas: { label: 'Lunas', tone: 'ok' }, 'jatuh-tempo': { label: 'Jatuh tempo', tone: 'danger' }, ditahan: { label: 'Ditahan', tone: 'warn' },
  aktif: { label: 'Aktif', tone: 'ok' }, pantau: { label: 'Dipantau', tone: 'warn' }, diblokir: { label: 'Diblokir', tone: 'danger' }, 'diterima-sebagian': { label: 'Diterima sebagian', tone: 'info' }, dibayar: { label: 'Dibayar', tone: 'ok' }, diposting: { label: 'Diposting', tone: 'ok' }, dibalik: { label: 'Dibalik', tone: 'info' }, proses: { label: 'Dalam proses', tone: 'warn' }, cocok: { label: 'Cocok', tone: 'ok' }, belum: { label: 'Belum cocok', tone: 'warn' }, diabaikan: { label: 'Diabaikan' }, nonaktif: { label: 'Nonaktif' }, open: { label: 'Terbuka', tone: 'ok' }, closed: { label: 'Ditutup' }, closing: { label: 'Tutup buku', tone: 'warn' },
  ok: { label: 'Cocok', tone: 'ok' }, diff: { label: 'Selisih', tone: 'danger' },
  diterima: { label: 'Diterima', tone: 'ok' }, antre: { label: 'Antre' }, buka: { label: 'Buka', tone: 'info' }, dijadwalkan: { label: 'Dijadwalkan', tone: 'info' }, dihapuskan: { label: 'Dilepas' }, keluar: { label: 'Keluar' }, diproses: { label: 'Diposting — belum dibayar', tone: 'warn' }, hadir: { label: 'Hadir', tone: 'ok' }, terlambat: { label: 'Terlambat', tone: 'warn' }, izin: { label: 'Izin', tone: 'info' }, sakit: { label: 'Sakit', tone: 'info' }, cuti: { label: 'Cuti', tone: 'info' }, alpa: { label: 'Alpa', tone: 'danger' }, ditutup: { label: 'Ditutup — menunggu posting', tone: 'warn' }, void: { label: 'Void', tone: 'danger' }, berjalan: { label: 'Berjalan', tone: 'info' }, qc: { label: 'Pemeriksaan mutu', tone: 'warn' }, habis: { label: 'Habis', tone: 'danger' }, 'di-bawah-minimum': { label: 'Di bawah minimum', tone: 'warn' }, 'di-atas-maksimum': { label: 'Di atas maksimum', tone: 'info' }, normal: { label: 'Normal', tone: 'ok' },
  tinggi: { label: 'Tinggi', tone: 'danger' }, sedang: { label: 'Sedang', tone: 'warn' }, rendah: { label: 'Rendah' }, terbuka: { label: 'Terbuka', tone: 'info' }, dipesan: { label: 'Dipesan', tone: 'ok' }, masuk: { label: 'Penawaran masuk', tone: 'ok' }, diundang: { label: 'Diundang' }, menolak: { label: 'Tidak menawar', tone: 'danger' },
  hijau: { label: 'Sehat', tone: 'ok' }, kuning: { label: 'Risiko melampaui', tone: 'warn' }, merah: { label: 'Melampaui anggaran', tone: 'danger' }, perencanaan: { label: 'Perencanaan', tone: 'info' }, ditunda: { label: 'Ditunda', tone: 'warn' },
};
const props = defineProps<{ status?: string; label?: string; tone?: string }>();
const s = computed(() => (props.status ? STATUS[props.status] ?? { label: props.status } : { label: props.label ?? '', tone: props.tone }));
const tone = computed(() => props.tone ?? s.value.tone);
</script>

<template>
  <span class="pill" :data-tone="tone || undefined"><i class="pill-dot"></i>{{ label ?? s.label }}</span>
</template>
