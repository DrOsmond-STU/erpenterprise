<script setup lang="ts">
/** Kaki tabel standar: info baris, ukuran halaman, dan navigasi halaman. */
import { computed } from 'vue';
import Icon from './Icon.vue';
import { PAGE_SIZES } from '@/lib/usePaged';

const props = withDefaults(defineProps<{ total: number; page: number; size: number; sizes?: number[]; label?: string }>(), { sizes: () => PAGE_SIZES, label: 'baris' });
const emit = defineEmits<{ 'update:page': [number]; 'update:size': [number] }>();

const pages = computed(() => Math.max(1, Math.ceil(props.total / props.size)));
const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.size + 1));
const to = computed(() => Math.min(props.total, props.page * props.size));
const nf = new Intl.NumberFormat('id-ID');
/** Nomor halaman yang ditampilkan: pertama, terakhir, dan dua di sekitar halaman aktif. */
const nums = computed<(number | '…')[]>(() => {
  const n = pages.value, p = props.page;
  const set = new Set([1, n, p - 1, p, p + 1].filter((x) => x >= 1 && x <= n));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((x, i) => { if (i && x - sorted[i - 1] > 1) out.push('…'); out.push(x); });
  return out;
});
const go = (p: number) => { if (p >= 1 && p <= pages.value && p !== props.page) emit('update:page', p); };
</script>

<template>
  <div class="pager-bar" role="navigation" aria-label="Paginasi tabel">
    <span class="pager-info" data-pager-info>Menampilkan {{ nf.format(from) }}–{{ nf.format(to) }} dari {{ nf.format(total) }} {{ label }}</span>
    <label class="pager-size">
      <span>Per halaman</span>
      <select class="select" :value="size" aria-label="Baris per halaman" @change="emit('update:size', Number(($event.target as HTMLSelectElement).value))">
        <option v-for="s in sizes" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>
    <div class="toolbar-spacer"></div>
    <div class="pager">
      <button class="btn btn-sm btn-icon" type="button" :disabled="page <= 1" aria-label="Halaman pertama" @click="go(1)"><Icon name="chevron-left" /><Icon name="chevron-left" cls="pager-dbl" /></button>
      <button class="btn btn-sm btn-icon" type="button" :disabled="page <= 1" aria-label="Halaman sebelumnya" data-pager-prev @click="go(page - 1)"><Icon name="chevron-left" /></button>
      <template v-for="(n, i) in nums" :key="i">
        <span v-if="n === '…'" class="pager-gap">…</span>
        <button v-else class="btn btn-sm pager-num" type="button" :aria-current="n === page ? 'page' : undefined" :class="{ 'is-current': n === page }" @click="go(n)">{{ n }}</button>
      </template>
      <button class="btn btn-sm btn-icon" type="button" :disabled="page >= pages" aria-label="Halaman berikutnya" data-pager-next @click="go(page + 1)"><Icon name="chevron-right" /></button>
      <button class="btn btn-sm btn-icon" type="button" :disabled="page >= pages" aria-label="Halaman terakhir" @click="go(pages)"><Icon name="chevron-right" /><Icon name="chevron-right" cls="pager-dbl" /></button>
    </div>
  </div>
</template>
