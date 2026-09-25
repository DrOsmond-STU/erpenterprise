<script setup lang="ts">
import { computed } from 'vue';
const STATUS: Record<string, { label: string; tone?: string }> = {
  posted: { label: 'Diposting', tone: 'ok' }, pending: { label: 'Menunggu persetujuan', tone: 'warn' }, rejected: { label: 'Ditolak', tone: 'danger' },
  reversed: { label: 'Dibalik', tone: 'info' }, draft: { label: 'Draf' },
  aktif: { label: 'Aktif', tone: 'ok' }, nonaktif: { label: 'Nonaktif' }, open: { label: 'Terbuka', tone: 'ok' }, closed: { label: 'Ditutup' }, closing: { label: 'Tutup buku', tone: 'warn' },
  ok: { label: 'Cocok', tone: 'ok' }, diff: { label: 'Selisih', tone: 'danger' },
};
const props = defineProps<{ status?: string; label?: string; tone?: string }>();
const s = computed(() => (props.status ? STATUS[props.status] ?? { label: props.status } : { label: props.label ?? '', tone: props.tone }));
const tone = computed(() => props.tone ?? s.value.tone);
</script>

<template>
  <span class="pill" :data-tone="tone || undefined"><i class="pill-dot"></i>{{ label ?? s.label }}</span>
</template>
