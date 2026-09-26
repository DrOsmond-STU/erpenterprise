<script setup lang="ts">
/* Ikon garis 16×16 — subset dari purwarupa. */
const ICONS: Record<string, string> = {
  sparkles: '<path d="M6.4 1.8 7.5 5a2 2 0 0 0 1.3 1.3l3.2 1.1-3.2 1.1a2 2 0 0 0-1.3 1.3l-1.1 3.2-1.1-3.2A2 2 0 0 0 4 8.5L.8 7.4 4 6.3A2 2 0 0 0 5.3 5z"/><path d="M12.6 1.6v3M11.1 3.1h3M12.6 10.8v2.8M11.2 12.2H14"/>',
  send: '<path d="M14.4 1.6 7.2 8.8"/><path d="m14.4 1.6-4.6 12.8-2.6-5.6-5.6-2.6z"/>',
  minus: '<path d="M4 8h8"/>',
  eye: '<path d="M1.2 8S3.8 3.6 8 3.6 14.8 8 14.8 8 12.2 12.4 8 12.4 1.2 8 1.2 8z"/><circle cx="8" cy="8" r="1.9"/>',
  users: '<circle cx="6" cy="5.4" r="2.4"/><path d="M1.6 13.6a4.4 4.4 0 0 1 8.8 0"/><circle cx="11.4" cy="6" r="1.9"/><path d="M11 9.4a3.6 3.6 0 0 1 3.6 3.6"/>',
  key: '<circle cx="5.4" cy="10.6" r="2.8"/><path d="m7.4 8.6 6-6M11.4 4.6l1.6 1.6M9.6 6.4l1.4 1.4"/>',
  copy: '<rect x="5.4" y="5.4" width="8.2" height="8.2" rx="1.4"/><path d="M10.6 5.4V3.8a1.4 1.4 0 0 0-1.4-1.4H3.8a1.4 1.4 0 0 0-1.4 1.4v5.4a1.4 1.4 0 0 0 1.4 1.4h1.6"/>',
  grid: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  ledger: '<path d="M4 1.6h8.4a1 1 0 0 1 1 1v11.8H4a1.6 1.6 0 0 1 0-3.2h9.4"/><path d="M6.8 5.2h4M6.8 7.8h4"/>',
  tree: '<path d="M8 2v5M8 7H4.5M8 7h3.5M4.5 7v3M11.5 7v3M4.5 10H2.5v2.5h4V10H4.5zM11.5 10H9.5v2.5h4V10H11.5z"/>',
  vault: '<rect x="2" y="2.4" width="12" height="11.2" rx="1.4"/><circle cx="8" cy="8" r="2.6"/><path d="M8 5.4v5.2M5.4 8h5.2"/><path d="M2 5.6h1M2 10.4h1M13 5.6h1M13 10.4h1"/>',
  book: '<path d="M2.6 2.6h4.2a1.6 1.6 0 0 1 1.2.6 1.6 1.6 0 0 1 1.2-.6h4.2v9.8H9.2a1.2 1.2 0 0 0-1.2.9 1.2 1.2 0 0 0-1.2-.9H2.6z"/><path d="M8 3.2v10"/>',
  scale: '<path d="M8 2v12M3 5l5-3 5 3"/><path d="M1.6 9.4 3 5l1.4 4.4a2.4 2.4 0 0 1-2.8 0z"/><path d="M11.6 9.4 13 5l1.4 4.4a2.4 2.4 0 0 1-2.8 0z"/>',
  trending: '<path d="M1.8 11.6 6 7.4l2.8 2.8 5.4-5.4"/><path d="M10.4 4.8h3.8v3.8"/>',
  columns: '<rect x="1.6" y="2.4" width="12.8" height="11.2" rx="1.4"/><path d="M8 2.4v11.2M1.6 6h12.8"/>',
  layers: '<path d="m8 1.8 6.2 3.2L8 8.2 1.8 5z"/><path d="m1.8 8 6.2 3.2L14.2 8"/><path d="m1.8 11 6.2 3.2 6.2-3.2"/>',
  link: '<path d="M7.2 8.8a3.2 3.2 0 0 0 4.5.5l1.8-1.8a3.2 3.2 0 0 0-4.5-4.5L7.8 4.2"/><path d="M8.8 7.2a3.2 3.2 0 0 0-4.5-.5L2.5 8.5a3.2 3.2 0 0 0 4.5 4.5l1.2-1.2"/>',
  'map-pin': '<path d="M8 14.4s-4.6-4.4-4.6-8a4.6 4.6 0 0 1 9.2 0c0 3.6-4.6 8-4.6 8z"/><circle cx="8" cy="6.4" r="1.7"/>',
  scroll: '<path d="M12 2.4H5.6A1.6 1.6 0 0 0 4 4v8a1.6 1.6 0 0 0 1.6 1.6h8V4a1.6 1.6 0 0 0-1.6-1.6z"/><path d="M4 12a1.6 1.6 0 0 1-1.6-1.6V4.8"/><path d="M7 6h3.6M7 8.4h3.6M7 10.8h2"/>',
  boxes: '<path d="M8 1.6 14 4.6 8 7.6 2 4.6z"/><path d="M2 4.6v6.8L8 14.4l6-3V4.6"/><path d="M8 7.6v6.8"/>',
  search: '<circle cx="7" cy="7" r="4.6"/><path d="m10.4 10.4 3.6 3.6"/>',
  'chevron-down': '<path d="m4 6.2 4 4 4-4"/>', 'chevron-up': '<path d="m4 9.8 4-4 4 4"/>', 'chevron-right': '<path d="m6.2 4 4 4-4 4"/>', 'chevron-left': '<path d="m9.8 4-4 4 4 4"/>',
  plus: '<path d="M8 3.2v9.6M3.2 8h9.6"/>', x: '<path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6"/>', check: '<path d="m3.6 8.4 3 3 5.8-6.8"/>',
  alert: '<path d="M8 2.2 15 13.6H1z"/><path d="M8 6.6v3.2"/><circle cx="8" cy="11.8" r=".6" fill="currentColor" stroke="none"/>',
  panel: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.2v1.5M8 13.3v1.5M14.8 8h-1.5M2.7 8H1.2M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1M12.8 12.8l-1.1-1.1M4.3 4.3 3.2 3.2"/>',
  moon: '<path d="M13.4 9.7A5.8 5.8 0 0 1 6.3 2.6a5.8 5.8 0 1 0 7.1 7.1z"/>',
  monitor: '<rect x="1.5" y="2.6" width="13" height="8.8" rx="1.4"/><path d="M5.6 14.2h4.8M8 11.4v2.8"/>',
  logout: '<path d="M6.2 2.4H3.4a1 1 0 0 0-1 1v9.2a1 1 0 0 0 1 1h2.8"/><path d="M10 5 13 8l-3 3"/><path d="M13 8H6.4"/>',
  calendar: '<rect x="2.4" y="3" width="11.2" height="10.6" rx="1.4"/><path d="M5.2 1.4v3.2M10.8 1.4v3.2M2.4 6.6h11.2"/>',
  building: '<path d="M2.6 14.2V3.4l6-1.8v12.6z"/><path d="M8.6 6.2h4.8v8"/><path d="M4.6 5.6h2M4.6 8.2h2M4.6 10.8h2M10.6 8.8h1M10.6 11.4h1"/>',
  external: '<path d="M9.2 2.4h4.4v4.4"/><path d="M13.6 2.4 7.2 8.8"/><path d="M12 9.6v3.4a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V5.4a1 1 0 0 1 1-1h3.4"/>',
  'arrow-up': '<path d="M8 13.2V3.4M4.2 7.2 8 3.4l3.8 3.8"/>', 'arrow-down': '<path d="M8 2.8v9.8M4.2 8.8 8 12.6l3.8-3.8"/>',
  print: '<path d="M4.6 6V2.2h6.8V6"/><rect x="1.5" y="6" width="13" height="5.4" rx="1.2"/><path d="M4.6 9.6h6.8v4.8H4.6z"/>',
  download: '<path d="M8 2.2v8.2M4.6 7 8 10.4 11.4 7"/><path d="M2.4 13.6h11.2"/>',
  gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7 3.5 3.5"/>',
  shield: '<path d="M8 1.5 13.4 3.4v4c0 3.4-2.2 6-5.4 7-3.2-1-5.4-3.6-5.4-7v-4z"/><path d="m5.8 8 1.6 1.6 3-3.2"/>',
  clock: '<circle cx="8" cy="8" r="6.3"/><path d="M8 4.3V8l2.6 1.6"/>',
  filter: '<path d="M2 3.4h12l-4.6 5.3v4.4l-2.8 1.5V8.7z"/>',
  bell: '<path d="M4.2 6.6a3.8 3.8 0 0 1 7.6 0c0 2.9 1 3.9 1 3.9H3.2s1-1 1-3.9z"/><path d="M6.4 12.9a1.7 1.7 0 0 0 3.2 0"/>',
};
defineProps<{ name: string; cls?: string }>();
</script>

<template>
  <svg :class="cls" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" v-html="ICONS[name] || ''" />
</template>
