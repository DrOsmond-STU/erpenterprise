<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { download, fileToBase64, get, patch, post } from '@/lib/api';
import { errorList } from '@/lib/errors';
import * as F from '@/lib/format';
import { useLoader } from '@/lib/useLoader';
import { usePaged } from '@/lib/usePaged';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';
import BranchTag from '@/components/BranchTag.vue';
import Drawer from '@/components/Drawer.vue';
import Icon from '@/components/Icon.vue';
import KpiTile from '@/components/KpiTile.vue';
import Modal from '@/components/Modal.vue';
import Pager from '@/components/Pager.vue';
import Pill from '@/components/Pill.vue';
import ReportHead from '@/components/ReportHead.vue';

const session = useSession();
const toast = useToast();
const { data, loading, reload } = useLoader<any[]>(() => get('/documents'));
const all = computed(() => data.value ?? []);
const folder = ref('');
const q = ref('');
const folders = computed(() => [...new Set(all.value.map((d) => d.folder))].sort());
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return all.value.filter((d) => (!folder.value || d.folder === folder.value) && (!s || [d.docNo, d.name, d.docType, d.owner, d.entityRef ?? ''].some((x) => String(x).toLowerCase().includes(s))));
});
const pg = usePaged<any>(filtered, 25);
watch([q, folder], pg.reset);
const soon = (d: any) => d.expiryDate && d.status === 'berlaku' && d.expiryDate <= new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
const kpi = computed(() => ({ count: all.value.length, active: all.value.filter((d) => d.status === 'berlaku').length, expired: all.value.filter((d) => d.status === 'kedaluwarsa').length, soon: all.value.filter(soon).length }));
const canManage = computed(() => session.can('doc.manage'));
const TYPES = ['Kontrak', 'SOP', 'Kebijakan', 'Laporan', 'Sertifikat', 'Teknis', 'Lampiran', 'Lainnya'];

/* Laci */
const openId = ref<string | null>(null);
const d = ref<any>(null);
const loadOne = async () => { d.value = null; if (openId.value) { try { d.value = await get(`/documents/${openId.value}`); } catch (e) { toast.error(e, 'Dokumen tidak dapat dimuat'); openId.value = null; } } };
watch(openId, loadOne);
const busy = ref(false);
async function newVersion(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
  busy.value = true;
  try {
    if (f.size > 1_048_576) throw new Error('Ukuran berkas maksimal 1 MB.');
    await post(`/documents/${openId.value}/versions`, { file: { name: f.name, mime: f.type || 'application/octet-stream', base64: await fileToBase64(f) } });
    toast.push('Versi baru diunggah', f.name, 'ok'); await Promise.all([loadOne(), reload()]);
  } catch (e) { toast.error(e, 'Unggah gagal'); } finally { busy.value = false; (ev.target as HTMLInputElement).value = ''; }
}
async function setStatus(status: string) { try { await patch(`/documents/${openId.value}`, { status }); await Promise.all([loadOne(), reload()]); } catch (e) { toast.error(e, 'Gagal'); } }

/* Unggah baru */
const show = ref(false);
const form = ref({ name: '', docType: 'Kontrak', folder: 'Umum', branch: '', status: 'berlaku', expiryDate: '', note: '' });
const file = ref<File | null>(null);
const errors = ref<string[]>([]);
function openNew() { errors.value = []; file.value = null; form.value = { name: '', docType: 'Kontrak', folder: folder.value || 'Umum', branch: '', status: 'berlaku', expiryDate: '', note: '' }; show.value = true; }
function pick(ev: Event) { file.value = (ev.target as HTMLInputElement).files?.[0] ?? null; if (file.value && !form.value.name) form.value.name = file.value.name.replace(/\.[^.]+$/, ''); }
async function save() {
  errors.value = []; busy.value = true;
  try {
    const f = file.value!;
    if (f.size > 1_048_576) throw new Error('Ukuran berkas maksimal 1 MB.');
    const r = await post('/documents', { ...form.value, branch: form.value.branch || undefined, expiryDate: form.value.expiryDate || undefined, note: form.value.note || undefined,
      file: { name: f.name, mime: f.type || 'application/octet-stream', base64: await fileToBase64(f) } });
    toast.push('Dokumen diunggah', r.docNo, 'ok'); show.value = false; await reload(); openId.value = r.id;
  } catch (e) { errors.value = e instanceof Error && !(e as any).status ? [e.message] : errorList(e); } finally { busy.value = false; }
}
</script>

<template>
  <ReportHead title="Repositori Dokumen" sub="Kontrak, SOP, sertifikat, dan lampiran transaksi dengan riwayat versi. Setiap versi disimpan utuh dengan sidik SHA-256; unggahan dan perubahan tercatat di jejak audit. Masa berlaku dipantau otomatis.">
    <button v-if="canManage" class="btn btn-primary" data-action="new-document" @click="openNew"><Icon name="plus" /> Unggah dokumen</button>
  </ReportHead>
  <div class="kpi-row" style="margin-bottom:var(--sp-4)">
    <KpiTile label="Dokumen" :value="String(kpi.count)" :foot="`${kpi.active} berlaku`" />
    <KpiTile label="Kedaluwarsa" :value="String(kpi.expired)" foot="Perlu diperbarui" :tone="kpi.expired ? 'neg' : ''" />
    <KpiTile label="Habis ≤ 60 hari" :value="String(kpi.soon)" foot="Masa berlaku" :tone="kpi.soon ? 'neg' : ''" />
    <KpiTile label="Folder" :value="String(folders.length)" foot="Pengelompokan" />
  </div>
  <article class="card">
    <div class="toolbar">
      <div class="search-wrap toolbar-search"><Icon name="search" /><input v-model="q" class="input" type="search" placeholder="Cari nomor, nama, jenis, pemilik…" aria-label="Cari dokumen"></div>
      <select v-model="folder" class="select" style="max-width:260px" aria-label="Folder"><option value="">Semua folder</option><option v-for="f in folders" :key="f" :value="f">{{ f }}</option></select>
    </div>
    <div class="table-scroll"><table class="table" data-table="documents">
      <thead><tr><th>Dokumen</th><th>Folder</th><th>Pemilik</th><th class="ta-r">Versi</th><th>Berlaku s.d.</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-if="loading && !data"><td colspan="6"><div class="loading">Memuat…</div></td></tr>
        <tr v-for="x in pg.pageRows.value" :key="x.id" data-row :data-document="x.docNo" @click="openId = x.id">
          <td><span class="cell-strong">{{ x.name }}</span><span class="cell-sub"><span class="code">{{ x.docNo }}</span> · {{ x.docType }}<template v-if="x.entityRef"> · {{ x.entityRef }}</template></span></td>
          <td>{{ x.folder }}<span v-if="x.branch" class="cell-sub"><BranchTag :code="x.branch" /></span></td><td>{{ x.owner }}</td><td class="ta-r num">v{{ x.version }}</td>
          <td class="num" :class="{ neg: soon(x) }">{{ x.expiryDate ? F.date(x.expiryDate) : '—' }}</td>
          <td><Pill :status="x.status" :label="x.status === 'kedaluwarsa' ? 'Kedaluwarsa' : x.status === 'berlaku' ? 'Berlaku' : x.status === 'arsip' ? 'Arsip' : undefined" :tone="x.status === 'kedaluwarsa' ? 'danger' : x.status === 'berlaku' ? 'ok' : undefined" /></td>
        </tr>
        <tr v-if="data && !filtered.length" class="is-static"><td colspan="6"><div class="empty"><div class="empty-card"><span class="empty-title">Belum ada dokumen</span></div></div></td></tr>
      </tbody>
    </table></div>
    <Pager v-model:page="pg.page.value" v-model:size="pg.size.value" :total="pg.total.value" label="dokumen" />
  </article>

  <Drawer v-if="openId" :title="d ? d.name : 'Memuat…'" :subtitle="d ? `${d.docType} · ${d.folder}` : ''" @close="openId = null">
    <template #eyebrow><template v-if="d"><span class="code">{{ d.docNo }}</span><span class="muted">v{{ d.version }}</span></template></template>
    <template v-if="d">
      <div class="section"><dl class="deflist">
        <dt>Pemilik</dt><dd>{{ d.owner }}</dd><dt>Status</dt><dd>{{ d.status }}</dd>
        <dt>Berlaku s.d.</dt><dd>{{ d.expiryDate ? F.date(d.expiryDate) : '—' }}</dd>
        <dt v-if="d.entityRef">Tautan transaksi</dt><dd v-if="d.entityRef" class="code">{{ d.entityType }} · {{ d.entityRef }}</dd>
      </dl></div>
      <div class="section"><span class="section-title">Riwayat versi</span>
        <div class="table-scroll"><table class="table" data-table="doc-versions"><tbody>
          <tr v-for="v in d.versions" :key="v.version" class="is-static">
            <td class="num">v{{ v.version }}</td><td>{{ v.fileName }}<span class="cell-sub">{{ v.by }} · {{ F.datetime(v.at) }}<template v-if="v.note"> — {{ v.note }}</template></span><span class="cell-sub code" :title="v.sha256">SHA-256 {{ v.sha256.slice(0, 16) }}…</span></td>
            <td class="ta-r num">{{ F.int(v.size / 1024) }} KB</td>
            <td><button class="btn btn-sm btn-ghost" :aria-label="`Unduh v${v.version}`" data-action="download-version" @click="download(`/documents/${d.id}/download?version=${v.version}`, v.fileName)"><Icon name="download" /></button></td>
          </tr>
        </tbody></table></div></div>
    </template>
    <template #foot><template v-if="d">
      <label v-if="canManage" class="btn btn-primary" style="cursor:pointer"><Icon name="plus" /> Versi baru<input type="file" hidden data-field="new-version" @change="newVersion"></label>
      <button v-if="canManage && d.status !== 'arsip'" class="btn" @click="setStatus('arsip')">Arsipkan</button>
      <button v-if="canManage && d.status === 'arsip'" class="btn" @click="setStatus('berlaku')">Aktifkan</button>
      <div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="openId = null">Tutup</button>
    </template></template>
  </Drawer>

  <Modal v-if="show" title="Unggah dokumen" subtitle="PDF, gambar, Office, CSV/teks, atau ZIP; maksimal 1 MB per versi." width="600px" @close="show = false">
    <div class="form-grid">
      <div class="field form-grid-full"><label for="dc-file">Berkas</label><input id="dc-file" class="input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip" data-field="doc-file" @change="pick"></div>
      <div class="field form-grid-full"><label for="dc-name">Nama</label><input id="dc-name" v-model="form.name" class="input" maxlength="200"></div>
      <div class="field"><label for="dc-type">Jenis</label><select id="dc-type" v-model="form.docType" class="select"><option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option></select></div>
      <div class="field"><label for="dc-folder">Folder</label><input id="dc-folder" v-model="form.folder" class="input" list="dc-folders" maxlength="120"><datalist id="dc-folders"><option v-for="f in folders" :key="f" :value="f" /></datalist></div>
      <div class="field"><label for="dc-branch">Cabang</label><select id="dc-branch" v-model="form.branch" class="select"><option value="">Seluruh perusahaan</option><option v-for="b in session.branches" :key="b.code" :value="b.code">{{ b.code }} · {{ b.short_name }}</option></select></div>
      <div class="field"><label for="dc-exp">Berlaku s.d.</label><input id="dc-exp" v-model="form.expiryDate" class="input" type="date"></div>
      <div v-if="errors.length" class="field form-grid-full"><div class="field-hint neg" role="alert"><div v-for="e in errors" :key="e">• {{ e }}</div></div></div>
    </div>
    <template #foot><button class="btn btn-primary" data-action="save-document" :disabled="busy || !file || form.name.trim().length < 3" @click="save"><Icon name="check" /> Unggah</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" @click="show = false">Batal</button></template>
  </Modal>
</template>
