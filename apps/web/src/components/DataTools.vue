<script setup lang="ts">
/**
 * Bilah alat tabel standar: cari di semua kolom, saring (faset & rentang tanggal),
 * dan ekspor ke Excel/PDF.
 *  - Dengan `paged` (hasil usePaged): saringan diterapkan ke seluruh baris data
 *    sebelum paginasi; ekspor memuat semua baris tersaring (bukan hanya halaman tampil).
 *  - Tanpa `paged`: bekerja pada tabel DOM di kartu yang sama (tabel laporan/tanpa paginasi).
 * RBAC: data yang dicari/disaring/diekspor hanya data yang sudah diizinkan API
 * (izin, cabang/RLS, penyamaran). Ekspor memerlukan izin `report.export`, diperiksa
 * dan dicatat API (jejak audit) sebelum berkas dibuat.
 *  - Tabel berpaginasi di peladen (jurnal, jejak audit): halaman memberi `prepare` yang
 *    memuat seluruh baris sesuai saringan peladen sebelum dibaca, lalu mengembalikan pemulih.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { post } from '@/lib/api';
import { fileSlug, headText, readTable, saveBlob, textOf, toPdf, toXlsx, type ExportMeta } from '@/lib/export';
import { exportMode } from '@/lib/format';
import { activeCount, clearTools, describeTools, matchesQuery, newToolsState, type Facet, type ToolsState } from '@/lib/table-tools';
import type { Paged } from '@/lib/usePaged';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import Icon from './Icon.vue';

const props = withDefaults(defineProps<{ paged?: Paged; title?: string; search?: boolean; filter?: boolean; placeholder?: string; table?: string; resource?: string; prepare?: () => Promise<(() => void) | void> }>(), { search: true, filter: true, placeholder: 'Cari di semua kolom…' });
const ctx = useContext();
const session = useSession();
const toast = useToast();
const route = useRoute();
const root = ref<HTMLElement | null>(null);
const canExport = computed(() => session.can('report.export'));

/* --- Status saringan: milik usePaged (mode data) atau lokal (mode DOM) --- */
const local = newToolsState();
const state: ToolsState = props.paged ? props.paged.tools : local;
const domFacets = ref<Facet[]>([]);
const facets = computed<Facet[]>(() => (props.paged ? props.paged.facets.value : domFacets.value));
const dateKeys = computed(() => (props.paged ? props.paged.dateKeys.value : []));
watch(dateKeys, (d) => { if (d.length && !d.some((x) => x.key === state.dateKey)) state.dateKey = d[0].key; }, { immediate: true });
const active = computed(() => activeCount(state));
const shown = ref(0), totalRows = ref(0);

function tableEl(): HTMLTableElement | null {
  const scope = root.value?.closest('[data-tools-scope], .card') ?? document;
  const pick = (el: ParentNode) => (props.table ? el.querySelector<HTMLTableElement>(props.table) : [...el.querySelectorAll<HTMLTableElement>('table')].find((t) => t.offsetParent !== null) ?? el.querySelector('table'));
  return pick(scope) ?? (props.table ? document.querySelector<HTMLTableElement>(props.table) : null);
}

/* --- Mode DOM: faset dari kolom berkategori, penyaringan baris dengan atribut hidden --- */
const dataRows = (t: HTMLTableElement) => {
  const n = t.tHead?.rows[t.tHead.rows.length - 1]?.cells.length ?? 0;
  return [...t.tBodies].flatMap((b) => [...b.rows]).filter((r) => r.cells.length > 1 && (!n || r.cells.length === n));
};
/* Teks sel seperti tampil — nilai kontrol formulir (dropdown/isian) dipakai, bukan seluruh opsinya. */
const cellText = (c: HTMLTableCellElement | undefined) => (c ? textOf(c) : '');
function buildDomFacets() {
  const t = tableEl();
  if (!t) return;
  const heads = [...(t.tHead?.rows[t.tHead.rows.length - 1]?.cells ?? [])];
  const rows = dataRows(t);
  const out: Facet[] = [];
  heads.forEach((h, i) => {
    const label = headText(h);
    if (!label || h.classList.contains('ta-r') || rows.length < 2) return;
    const counts = new Map<string, number>();
    for (const r of rows) { const v = cellText(r.cells[i]); if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
    if (counts.size < 2 || counts.size > 12 || counts.size > rows.length * 0.6 || [...counts.keys()].some((v) => v.length > 40)) return;
    out.push({ key: String(i), label, options: [...counts].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: value, count })) });
  });
  domFacets.value = out.slice(0, 6);
}
function applyDom() {
  const t = tableEl();
  if (!t || props.paged) return;
  const rows = dataRows(t);
  const facetsOn = Object.entries(state.facets).filter(([, v]) => v);
  let n = 0;
  for (const r of rows) {
    const ok = facetsOn.every(([k, v]) => cellText(r.cells[Number(k)]) === v) && (!state.q.trim() || matchesQuery([...r.cells].map((c) => cellText(c)).join(' ').toLowerCase(), state.q));
    if (r.hidden !== !ok) r.hidden = !ok;
    if (ok) n += 1;
  }
  shown.value = n; totalRows.value = rows.length;
}
let observer: MutationObserver | null = null;
let raf = 0;
onMounted(() => {
  if (props.paged) return;
  nextTick(() => {
    buildDomFacets(); applyDom();
    const t = tableEl();
    if (!t) return;
    /* Vue merender ulang baris saat data/konteks berubah: hitung ulang faset & saringan. */
    observer = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { buildDomFacets(); applyDom(); }); });
    observer.observe(t, { childList: true, subtree: true, characterData: true });
  });
});
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(raf); });
watch(() => [state.q, JSON.stringify(state.facets)], () => { if (!props.paged) applyDom(); });

/* --- Popover (teleport, posisi tetap di bawah tombol) --- */
const open = ref<'filter' | 'export' | null>(null);
const pos = reactive<{ top: number | null; bottom: number | null; left: number }>({ top: 0, bottom: null, left: 0 });
const popStyle = computed(() => ({ left: `${pos.left}px`, ...(pos.bottom !== null ? { bottom: `${pos.bottom}px` } : { top: `${pos.top}px` }) }));
function toggle(which: 'filter' | 'export', ev: MouseEvent) {
  if (open.value === which) { open.value = null; return; }
  if (which === 'filter' && !props.paged) buildDomFacets();
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
  /* Buka ke atas bila ruang di bawah tombol tidak cukup (tombol dekat dasar layar). */
  const need = which === 'export' ? 160 : 360;
  if (window.innerHeight - r.bottom < need && r.top > window.innerHeight - r.bottom) { pos.bottom = window.innerHeight - r.top + 6; pos.top = null; }
  else { pos.top = r.bottom + 6; pos.bottom = null; }
  pos.left = Math.max(12, Math.min(r.left, window.innerWidth - 352));
  open.value = which; openedAt = Date.now();
}
const close = (e?: Event) => { if (e && (e.target as HTMLElement)?.closest?.('.dt-pop, [data-dt-trigger]')) return; open.value = null; };
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open.value) { e.stopPropagation(); open.value = null; } };
const onResize = () => close();
/* Gulir halaman menutup menu (posisinya tetap); gulir sesaat setelah membuka (tombol digulir ke tampilan) diabaikan. */
let openedAt = 0;
const onScroll = (e: Event) => { if (open.value && Date.now() - openedAt > 400 && !(e.target as HTMLElement)?.closest?.('.dt-pop')) open.value = null; };
onMounted(() => { document.addEventListener('mousedown', close); document.addEventListener('keydown', onKey, true); window.addEventListener('resize', onResize); document.addEventListener('scroll', onScroll, true); });
onBeforeUnmount(() => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); document.removeEventListener('scroll', onScroll, true); });
const setFacet = (k: string, v: string) => { state.facets = { ...state.facets, [k]: v }; };

/* --- Ekspor --- */
const busy = ref(false);
function titleOf() {
  if (props.title) return props.title;
  const page = document.querySelector('.page-title')?.textContent?.trim() ?? 'Data';
  const card = root.value?.closest('.card')?.querySelector('.card-title')?.textContent?.trim();
  return card && card !== page ? `${page} — ${card}` : page;
}
async function doExport(format: 'xlsx' | 'pdf') {
  open.value = null;
  const t0 = tableEl();
  if (!t0) { toast.push('Tidak ada tabel', 'Tabel untuk diekspor tidak ditemukan.', 'warn'); return; }
  busy.value = true;
  const title = titleOf();
  const filters = props.paged ? describeTools(state, facets.value, dateKeys.value) : describeTools({ ...state, from: '', to: '' }, facets.value, []);
  const rowsCount = props.paged ? props.paged.total.value : dataRows(t0).filter((r) => !r.hidden).length;
  try {
    /* Izin & jejak audit diperiksa peladen lebih dulu (403 = tanpa izin report.export). */
    const rec = await post('/exports', { resource: props.resource ?? route.path, title, format, rows: rowsCount, filters: filters || undefined });
    const p = props.paged;
    const keep = p ? { page: p.page.value, size: p.size.value } : null;
    const restore = props.prepare ? await props.prepare() : undefined;
    exportMode.value = true;
    if (p) p.size.value = Math.max(p.total.value, 1);
    await nextTick(); await nextTick();
    const data = readTable(tableEl() ?? t0);
    exportMode.value = false;
    if (p && keep) { p.size.value = keep.size; await nextTick(); p.page.value = keep.page; }
    restore?.();
    const meta: ExportMeta = {
      title, company: session.company?.name ?? '', scope: ctx.branchName, period: ctx.periodLabel, user: `${session.user?.name ?? ''} (${session.user?.email ?? ''})`,
      filters, at: new Date(), classification: `RAHASIA — penggunaan internal ${session.company?.name ?? ''}. Diekspor sesuai hak akses pengguna · ref. ${rec?.id ?? ''}`,
    };
    const blob = format === 'xlsx' ? toXlsx(meta, data) : await toPdf(meta, data);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    saveBlob(blob, `${fileSlug(title)}-${fileSlug(ctx.branch)}-${stamp}.${format}`);
    toast.push('Ekspor selesai', `${data.rows.length} baris · ${format === 'xlsx' ? 'Excel' : 'PDF'}`, 'ok');
  } catch (e) {
    exportMode.value = false;
    toast.error(e, 'Ekspor gagal');
  } finally { busy.value = false; }
}
</script>

<template>
  <div ref="root" class="dt-tools" data-table-tools>
    <div v-if="search" class="search-wrap toolbar-search"><Icon name="search" /><input v-model="state.q" class="input" type="search" :placeholder="placeholder" aria-label="Cari di tabel" data-dt-search></div>
    <button v-if="filter && (facets.length || dateKeys.length)" class="btn btn-sm" :class="{ 'btn-primary': active }" type="button" data-dt-trigger data-dt-filter :aria-expanded="open === 'filter'" @click="toggle('filter', $event)">
      <Icon name="filter" /> Filter<span v-if="active" class="chip-count dt-count">{{ active }}</span>
    </button>
    <span v-if="!paged && (state.q || active)" class="muted dt-shown" data-dt-shown>{{ shown }} dari {{ totalRows }}</span>
    <button v-if="canExport" class="btn btn-sm" type="button" data-dt-trigger data-dt-export :disabled="busy" :aria-expanded="open === 'export'" @click="toggle('export', $event)">
      <Icon name="download" /> {{ busy ? 'Mengekspor…' : 'Ekspor' }}
    </button>
    <Teleport to="body">
      <div v-if="open === 'filter'" class="popover dt-pop" role="dialog" aria-label="Saring tabel" :style="popStyle" data-dt-filter-panel>
        <div class="popover-head"><div class="card-head-text"><span class="card-title">Saring data</span><span class="card-note">Berlaku untuk seluruh baris{{ paged ? '' : ' tabel ini' }}</span></div>
          <button class="btn btn-sm btn-ghost" type="button" data-dt-clear @click="clearTools(state, true)">Atur ulang</button></div>
        <div class="dt-fields">
          <label v-for="f in facets" :key="f.key" class="field"><span>{{ f.label }}</span>
            <select class="select" :value="state.facets[f.key] ?? ''" :data-dt-facet="f.key" @change="setFacet(f.key, ($event.target as HTMLSelectElement).value)">
              <option value="">Semua</option><option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }} ({{ o.count }})</option>
            </select></label>
          <template v-if="dateKeys.length">
            <label class="field"><span>Kolom tanggal</span><select v-model="state.dateKey" class="select" data-dt-date-key><option v-for="d in dateKeys" :key="d.key" :value="d.key">{{ d.label }}</option></select></label>
            <div class="dt-range"><label class="field"><span>Dari</span><input v-model="state.from" class="input" type="date" data-dt-from></label><label class="field"><span>Sampai</span><input v-model="state.to" class="input" type="date" data-dt-to></label></div>
          </template>
        </div>
      </div>
      <div v-if="open === 'export'" class="popover dt-pop" role="menu" :style="{ ...popStyle, width: '280px' }" data-dt-export-menu>
        <div class="popover-head"><div class="card-head-text"><span class="card-title">Ekspor {{ paged ? paged.total.value : '' }} baris</span><span class="card-note">Sesuai saringan & hak akses Anda; tercatat di jejak audit</span></div></div>
        <div class="menu">
          <button class="menu-item" type="button" role="menuitem" data-dt-xlsx @click="doExport('xlsx')"><Icon name="download" /> Excel (.xlsx)</button>
          <button class="menu-item" type="button" role="menuitem" data-dt-pdf @click="doExport('pdf')"><Icon name="print" /> PDF</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
