/* ==========================================================================
   Register (daftar), laci rekaman, formulir buat/ubah, dan aksi alur kerja
   untuk seluruh entitas — dibangun dari metadata server.
   ========================================================================== */
/* global ERP, FMT */
(() => {
  'use strict';
  const { $, $$, esc, icon, api, qs, state, money, pill, fieldHtml, openDrawer, openModal, closeOverlay, confirmBox, toast, fail, num } = ERP;
  const F = () => ERP.forms;

  const ent = (key) => state.meta?.entities?.[key];
  const regState = (key) => (state.reg[key] = state.reg[key] || { q: '', status: 'semua', sort: null, dir: null, page: 1, filters: {} });

  /* --- Kolom daftar ------------------------------------------------------------ */
  function listColumns(e) {
    const cols = [];
    if (e.number) cols.push({ name: 'number', label: 'Nomor', type: 'text', cls: 'code cell-strong' });
    for (const f of e.fields) if (f.list && f.name !== 'number' && f.name !== e.statusField) cols.push(f);
    for (const [name, c] of Object.entries(e.computed || {})) if (c.list) cols.push({ name, ...c, computed: true });
    if (e.scope === 'branch' && !state.meta.branchId) cols.push({ name: 'branch_id', label: 'Cabang', type: 'ref' });
    if (e.statusField) cols.push(e.fields.find((f) => f.name === e.statusField));
    return cols;
  }

  const isNum = (c) => ['money', 'number', 'int', 'pct'].includes(c.type);

  /* --- Register ------------------------------------------------------------------- */
  async function renderRegister(root, key, { title, sub, extraTools = '' } = {}) {
    const e = ent(key);
    if (!e) { root.innerHTML = noAccess(); return; }
    const st = regState(key);
    root.innerHTML = `
      <div class="page-head">
        <div class="page-head-text">
          <h1 class="page-title">${esc(title || e.label)}</h1>
          <p class="page-sub">${esc(sub || `Kelola ${e.label.toLowerCase()} — data tersimpan di server dan setiap perubahan tercatat di jejak audit.`)}</p>
        </div>
        <div class="page-actions">
          ${extraTools}
          ${state.meta.importable?.includes(key) ? `<button class="btn" data-import="${key}">${icon('arrow-up')} Impor CSV</button>` : ''}
          <button class="btn" data-export="${key}">${icon('download')} Ekspor CSV</button>
          ${e.canWrite ? `<button class="btn btn-primary" data-new="${key}">${icon('plus')} ${esc(e.one ? e.one[0].toUpperCase() + e.one.slice(1) : 'Data')} baru</button>` : ''}
        </div>
      </div>
      <article class="card" data-register="${key}">
        <div class="toolbar">
          <div class="search-wrap toolbar-search">${icon('search')}
            <input class="input" type="search" data-reg-search="${key}" placeholder="Cari…" value="${esc(st.q)}" aria-label="Cari dalam ${esc(e.label)}">
          </div>
          <div class="chips" data-chips role="group" aria-label="Saring status"></div>
          <div class="toolbar-spacer"></div>
          <span class="pager-info" data-count></span>
        </div>
        <div class="table-scroll"><table class="table"><thead></thead><tbody><tr><td class="loading-cell">Memuat…</td></tr></tbody></table></div>
        <div class="card-foot">
          <span class="pager-info" data-pageinfo></span>
          <div class="toolbar-spacer"></div>
          <div class="pager">
            <button class="btn btn-sm btn-icon" data-page="prev" aria-label="Halaman sebelumnya">${icon('chevron-left')}</button>
            <button class="btn btn-sm btn-icon" data-page="next" aria-label="Halaman berikutnya">${icon('chevron-right')}</button>
          </div>
        </div>
      </article>`;
    await loadRegister(key);
  }

  async function loadRegister(key) {
    const card = $(`[data-register="${key}"]`);
    if (!card) return;
    const e = ent(key);
    const st = regState(key);
    const cols = listColumns(e);
    const size = 25;
    let data;
    try {
      data = await api('GET', `/api/e/${key}${qs({ q: st.q, status: st.status !== 'semua' ? st.status : '', sort: st.sort, dir: st.dir, page: st.page, size, ...st.filters })}`);
    } catch (err) {
      $('tbody', card).innerHTML = `<tr><td class="loading-cell neg">${esc(err.message)}</td></tr>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(data.total / size));
    const sortKey = st.sort || e.sort, dir = st.dir || e.sortDir;
    const selectable = !!e.number || ERP.more.bulkActions(key).length > 0;
    st.selected = st.selected || new Set();
    $('thead', card).innerHTML = `<tr>${selectable ? `<th class="col-check"><input type="checkbox" data-check-all aria-label="Pilih semua baris di halaman ini" ${data.rows.length && data.rows.every((r) => st.selected.has(r.id)) ? 'checked' : ''}></th>` : ''}${cols.map((c) => `<th class="${isNum(c) ? 'ta-r' : ''}"><button class="th-sort" data-sort="${esc(c.name)}" data-active="${sortKey === c.name}">${esc(c.label)}<span class="sort-caret">${icon(sortKey === c.name && dir === 'desc' ? 'chevron-down' : 'chevron-up')}</span></button></th>`).join('')}</tr>`;
    $('tbody', card).innerHTML = data.rows.length ? data.rows.map((r) => `<tr data-open="${key}:${r.id}" tabindex="0" ${st.selected.has(r.id) ? 'aria-selected="true"' : ''}>${selectable ? `<td class="col-check" data-stop><input type="checkbox" data-row-check="${r.id}" aria-label="Pilih ${esc(r.number || r.code || r.id)}" ${st.selected.has(r.id) ? 'checked' : ''}></td>` : ''}${cols.map((c) => `<td class="${isNum(c) ? 'ta-r ' : ''}${c.cls || ''}">${c.computed && c.type === 'money' ? money(r[c.name]) : c.computed && c.type === 'pct' ? `<span class="num${r[c.name] > 100 ? ' neg' : ''}">${esc(num(r[c.name], 1))}%</span>` : c.computed ? esc(num(r[c.name])) : fieldHtml(c, r)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length + 1}"><div class="empty"><div class="empty-card"><span class="empty-title">Belum ada data</span><span class="empty-note">${st.q || st.status !== 'semua' ? 'Ubah kata kunci atau lepas saringan.' : 'Tambahkan data pertama dengan tombol di kanan atas.'}</span></div></div></td></tr>`;
    if (e.statusField) {
      const opts = e.fields.find((f) => f.name === e.statusField).options || [];
      const total = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);
      $('[data-chips]', card).innerHTML = `<button class="chip" data-status="semua" aria-pressed="${st.status === 'semua'}">Semua <span class="chip-count">${total}</span></button>` +
        opts.map((o) => { const v = Array.isArray(o) ? o[0] : o; return `<button class="chip" data-status="${esc(v)}" aria-pressed="${st.status === v}">${esc(state.meta.status[v]?.[0] || v)} <span class="chip-count">${data.statusCounts[v] || 0}</span></button>`; }).join('');
    }
    $('[data-count]', card).textContent = `${FMT.int(data.total)} baris`;
    $('[data-pageinfo]', card).textContent = `Halaman ${st.page} dari ${pages}`;
    $('[data-page="prev"]', card).disabled = st.page <= 1;
    $('[data-page="next"]', card).disabled = st.page >= pages;
    ERP.more.renderBulkbar(key);
  }

  /* --- Laci rekaman ------------------------------------------------------------- */
  async function openRecord(key, id) {
    const e = ent(key);
    if (!e) return toast('Tidak ada akses', 'Anda tidak memiliki izin melihat data ini.', 'warn');
    let r;
    try { r = await api('GET', `/api/e/${key}/${id}`); } catch (err) { return fail(err); }
    const title = r.number || (e.title && r[e.title]) || r.code || r.name || `#${r.id}`;
    const details = e.fields.filter((f) => !f.hidden && f.type !== 'password' && f.name !== 'number')
      .map((f) => `<dt>${esc(f.label)}</dt><dd>${fieldHtml(f, r)}</dd>`).join('') +
      Object.entries(e.computed || {}).map(([n, c]) => `<dt>${esc(c.label)}</dt><dd>${c.type === 'money' ? money(r[n]) : c.type === 'pct' ? `${esc(num(r[n], 1))}%` : esc(num(r[n]))}</dd>`).join('') +
      (e.scope === 'branch' ? `<dt>Cabang</dt><dd>${esc(r.branch_id__label || '')}</dd>` : '') +
      `<dt>Dibuat</dt><dd class="num">${esc(ERP.dateTime(r.created_at))}</dd><dt>Diubah</dt><dd class="num">${esc(ERP.dateTime(r.updated_at))} · v${r.row_version}</dd>`;

    let linesHtml = '';
    if (e.lines && r.lines) {
      const lf = e.lines.fields;
      linesHtml = `<div class="section"><span class="section-title">Baris (${r.lines.length})</span>
        <div class="lines"><div class="table-scroll"><table class="table tbl-sm"><thead><tr>${lf.map((f) => `<th class="${isNum(f) ? 'ta-r' : ''}">${esc(f.label)}</th>`).join('')}</tr></thead>
        <tbody>${r.lines.map((l) => `<tr>${lf.map((f) => `<td class="${isNum(f) ? 'ta-r' : ''}">${fieldHtml(f, l)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${lf.length}" class="muted">Belum ada baris.</td></tr>`}</tbody></table></div></div>
        ${r.subtotal !== undefined && r.tax !== undefined ? `<div class="totals"><div class="totals-row"><span>Subtotal</span><b>${esc(FMT.rp(r.subtotal || 0))}</b></div><div class="totals-row"><span>PPN ${esc(num(r.tax_rate))}%</span><b>${esc(FMT.rp(r.tax || 0))}</b></div><div class="totals-row totals-grand"><span>Total</span><b>${esc(FMT.rp(r.total || 0))}</b></div>${r.paid !== undefined ? `<div class="totals-row"><span>Terbayar</span><b>${esc(FMT.rp(r.paid || 0))}</b></div><div class="totals-row"><span>Sisa</span><b>${esc(FMT.rp((r.total || 0) - (r.paid || 0)))}</b></div>` : ''}</div>` : ''}
      </div>`;
    }
    const journals = r.__journals?.length ? `<div class="section"><span class="section-title">Jurnal buku besar terkait</span>
      <div class="lines"><table class="table tbl-sm"><thead><tr><th>Nomor</th><th>Tanggal</th><th>Uraian</th><th class="ta-r">Nilai</th><th>Status</th></tr></thead><tbody>
      ${r.__journals.map((j) => `<tr data-open="journals:${j.id}" tabindex="0"><td class="code">${esc(j.number)}</td><td class="num">${esc(ERP.date(j.date))}</td><td>${esc(j.description)}${j.reversal_of ? ' <span class="pill" data-tone="warn"><i class="pill-dot"></i>Pembalik</span>' : ''}</td><td class="ta-r">${money(j.total)}</td><td>${pill(j.status)}</td></tr>`).join('')}
      </tbody></table></div></div>` : '';
    const auditHtml = r.__audit?.length ? `<div class="section"><span class="section-title">Jejak audit</span><div class="timeline">
      ${r.__audit.map((a) => `<div class="tl-item"><span class="tl-rail"><i class="tl-node" data-tone="${/action\.(approve|post|pay)/.test(a.action) ? 'ok' : /create/.test(a.action) ? 'accent' : 'warn'}"></i><i class="tl-line"></i></span>
        <span class="tl-body"><span class="tl-title"><b>${esc(a.username || 'sistem')}</b> — ${esc(actionLabel(e, a.action))}</span><span class="tl-meta">${esc(ERP.dateTime(a.ts))}</span></span></div>`).join('')}
      </div></div>` : '';
    let extra = '';
    if (key === 'projects') extra = (await ERP.budget.projectDrawer(r.id)) + (await projectGantt(r.id));
    if (key === 'quotations') {
      const exp = r.valid_until && r.valid_until < state.meta.today;
      const msg = { draf: 'Lengkapi baris, lalu "Ajukan" — harga diperiksa terhadap kebijakan diskon, margin, dan nilai.', menunggu: 'Menunggu persetujuan harga oleh penyetuju penjualan.', disetujui: `Harga disetujui — kirim ke pelanggan sebelum ${ERP.date(r.valid_until)}.`, terkirim: `Menunggu tanggapan pelanggan (portal atau dicatat tenaga penjual) — berlaku sampai ${ERP.date(r.valid_until)}.`, diterima: 'Diterima pelanggan — buat pesanan penjualan.', kedaluwarsa: 'Masa berlaku habis — buat revisi untuk menawarkan kembali.' }[r.status];
      if (msg) extra = `<div class="section"><div class="notice" data-tone="${r.status === 'diterima' ? 'ok' : exp || r.status === 'kedaluwarsa' ? 'danger' : 'info'}">${icon(r.status === 'diterima' ? 'check' : 'clock')} ${esc(msg)}</div></div>`;
    }
    if (key === 'roles') extra = `<div class="section"><button class="btn" data-nav="peran">${icon('shield')} Buka matriks izin</button></div>`;
    if (key === 'bank_reconciliations') extra = `<div class="section"><button class="btn btn-primary" data-recon-open="${r.id}">${icon('check')} Cocokkan mutasi dengan rekening koran</button></div>`;

    const actions = (r.__actions || []).map((a) => `<button class="btn ${/approve|post|pay|complete|activate/.test(a.name) ? 'btn-primary' : /void|reject|cancel|reverse|dispose/.test(a.name) ? 'btn-danger-ghost' : ''}" data-action-run="${key}:${r.id}:${a.name}" ${a.sodBlocked ? 'disabled title="Pemisahan tugas: pembuat dokumen tidak dapat menyetujui sendiri"' : ''}>${esc(a.label)}</button>`).join('');
    openDrawer({
      eyebrow: `<span class="code">${esc(r.number || r.code || `#${r.id}`)}</span>${e.statusField ? pill(r[e.statusField]) : ''}${r.__masked ? ' <span class="pill" data-tone="warn"><i class="pill-dot"></i>Data sensitif disamarkan</span>' : ''}`,
      title: String(title), subtitle: e.label,
      body: `${r.approval_note ? `<div class="section"><div class="notice" data-tone="${r.status === 'menunggu' ? 'warn' : 'info'}">${icon('alert')} ${esc(r.approval_note)}</div></div>` : ''}
        <div class="section"><span class="section-title">Rincian</span><dl class="deflist">${details}</dl></div>${linesHtml}${extra}${journals}<div class="section" data-attachments="${key}:${r.id}"></div>${auditHtml}`,
      foot: `${actions}<div class="toolbar-spacer"></div>
        ${r.__editable && e.canWrite ? `<button class="btn" data-edit="${key}:${r.id}">${icon('edit')} Ubah</button><button class="btn btn-ghost btn-danger-ghost" data-delete="${key}:${r.id}" aria-label="Hapus">Hapus</button>` : ''}
        <button class="btn btn-ghost" data-print-record="${key}:${r.id}">${icon('print')} Cetak</button>`,
    });
    state.drawerRecord = { key, id: r.id, row: r };
    ERP.more.loadAttachments(key, r.id);
  }

  function actionLabel(e, action) {
    const map = { create: 'membuat data', update: 'mengubah data', delete: 'menghapus data', export: 'mengekspor data' };
    if (map[action]) return map[action];
    const a = e.actions?.find((x) => `action.${x.name}` === action);
    return a ? a.label : action;
  }

  async function projectGantt(projectId) {
    try {
      const { rows } = await api('GET', `/api/e/project_tasks${qs({ f_project_id: projectId, size: 100, sort: 'start_date' })}`);
      if (!rows.length) return '';
      const min = Math.min(...rows.map((t) => Date.parse(t.start_date))), max = Math.max(...rows.map((t) => Date.parse(t.end_date)));
      const span = Math.max(max - min, 864e5);
      return `<div class="section"><span class="section-title">Linimasa tugas</span><div class="gantt">${rows.map((t) => {
        const l = ((Date.parse(t.start_date) - min) / span) * 100, w = Math.max(2, ((Date.parse(t.end_date) - Date.parse(t.start_date)) / span) * 100);
        return `<div class="gantt-row"><span class="gantt-label">${esc(t.name)}</span><span class="gantt-track"><span class="gantt-bar" style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%"><span class="gantt-fill" style="width:${Number(t.progress) || 0}%"></span></span></span><span class="num muted">${esc(num(t.progress, 0))}%</span></div>`;
      }).join('')}</div></div>`;
    } catch { return ''; }
  }

  /* --- Formulir buat / ubah --------------------------------------------------------- */
  async function openForm(key, id = null, preset = {}) {
    const e = ent(key);
    let row = { ...preset };
    if (id) {
      try { row = await api('GET', `/api/e/${key}/${id}`); } catch (err) { return fail(err); }
    }
    const fields = e.fields.filter((f) => !f.readonly && !f.hidden && !(f.createOnly && id) && !(e.editable && f.name === e.statusField));
    const inferable = e.fields.some((f) => f.type === 'ref' && ent(f.ref)?.scope === 'branch' && f.required);
    const branchPicker = e.scope === 'branch' && !id && !state.meta.branchId && state.meta.branches.length > 1
      ? `<div class="field"><label for="fld-branch">Cabang${inferable ? '' : ' <span class="req">*</span>'}</label><select class="select" id="fld-branch" name="branch_id" ${inferable ? '' : 'required'}>${inferable ? '<option value="">Otomatis (ikut gudang/rekening)</option>' : ''}${state.meta.branches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div>` : '';
    const today = state.meta.today;
    for (const f of fields) if (!id && f.type === 'date' && ['date', 'reported_at', 'pay_date'].includes(f.name) && row[f.name] == null) row[f.name] = today;
    const m = openModal({
      title: id ? `Ubah ${e.one}` : `${e.one[0].toUpperCase()}${e.one.slice(1)} baru`,
      note: id ? `${row.number || row.code || ''} · versi ${row.row_version}` : (e.number ? 'Nomor dibuat otomatis saat disimpan.' : ''),
      wide: !!e.lines || fields.length > 10,
      body: `<form class="form-grid" data-record-form novalidate>${branchPicker}${fields.map((f) => F().input(f, row[f.name])).join('')}${e.lines ? F().linesEditor(e, row.lines || []) : ''}</form><div class="form-error" role="alert" hidden></div>`,
      foot: `<button class="btn btn-primary" data-save>${icon('check')} Simpan</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" data-close>Batal</button>`,
    });
    const form = $('form', m);
    $$('select[data-ref]', form).forEach((s) => { const f = e.fields.find((x) => x.name === s.name); if (f && row[`${f.name}__label`]) s.dataset.label = row[`${f.name}__label`]; });
    if (e.lines) $$('[data-lines] tr[data-line]', form).forEach((tr, i) => $$('select[data-ref]', tr).forEach((s) => { const l = row.lines?.[i]; if (l?.[`${s.name}__label`]) s.dataset.label = l[`${s.name}__label`]; }));
    await F().hydrateRefs(form, row);
    ERP.more.bindFx(form);
    if (e.lines) F().bindLines(form, e);
    // Rujukan bergantung (mis. faktur milik pelanggan terpilih).
    form.addEventListener('change', async (ev) => {
      const name = ev.target.name;
      const deps = $$(`select[data-ref-parent="${name}"]`, form);
      for (const s of deps) { s.dataset.value = ''; await F().fillRef(s, form); }
    });
    form.addEventListener('submit', (ev) => ev.preventDefault());
    $('[data-save]', m).addEventListener('click', async () => {
      const errBox = $('.form-error', m);
      const missing = $$('[required]', form).filter((x) => !x.value && !x.closest('[data-lines]'));
      if (missing.length) { errBox.hidden = false; errBox.textContent = 'Lengkapi bidang wajib yang ditandai *.'; missing[0].focus(); return; }
      const body = F().collect(form, e);
      if (id) body.row_version = row.row_version;
      const btn = $('[data-save]', m);
      btn.disabled = true;
      try {
        const saved = await api(id ? 'PUT' : 'POST', id ? `/api/e/${key}/${id}` : `/api/e/${key}`, body);
        F().clearLookups();
        closeOverlay();
        toast(id ? 'Perubahan disimpan' : 'Data dibuat', saved.number || saved.code || saved.name || '');
        await loadRegister(key);
        ERP.app.refreshView?.(key);
        openRecord(key, saved.id);
      } catch (err) {
        errBox.hidden = false; errBox.textContent = err.message;
        btn.disabled = false;
      }
    });
  }

  /* --- Aksi alur kerja ------------------------------------------------------------- */
  async function runAction(key, id, actionName) {
    const rec = state.drawerRecord?.key === key && state.drawerRecord?.id === Number(id) ? state.drawerRecord.row : await api('GET', `/api/e/${key}/${id}`);
    const a = (rec.__actions || []).find((x) => x.name === actionName) || { name: actionName, label: actionName };
    let params = {};
    if (a.params?.length) {
      params = await new Promise((resolve) => {
        const m = openModal({
          title: a.label, note: `${rec.number || rec.code || ''}`,
          body: `<form class="form-grid" data-action-form>${a.params.map((p) => F().input({ ...p, default: p.type === 'date' ? state.meta.today : p.default }, null)).join('')}</form><div class="form-error" role="alert" hidden></div>`,
          foot: `<button class="btn btn-primary" data-ok>${esc(a.label)}</button><div class="toolbar-spacer"></div><button class="btn btn-ghost" data-close>Batal</button>`,
        });
        const form = $('form', m);
        F().hydrateRefs(form);
        $$('[data-close]', ERP.overlays()).forEach((b) => b.addEventListener('click', () => resolve(null), { once: true }));
        $('[data-ok]', m).addEventListener('click', () => {
          const out = {};
          for (const p of a.params) out[p.name] = F().readControl($(`[name="${p.name}"]`, form), p);
          const miss = a.params.find((p) => p.required && (out[p.name] === null || out[p.name] === ''));
          if (miss) { const eb = $('.form-error', m); eb.hidden = false; eb.textContent = `${miss.label} wajib diisi.`; return; }
          closeOverlay();
          resolve(out);
        });
      });
      if (!params) return;
    } else if (a.confirm || /void|reverse|cancel|reject|dispose|close/.test(actionName)) {
      if (!(await confirmBox(a.label, a.confirm || `Lanjutkan aksi "${a.label}" untuk ${rec.number || rec.code || 'dokumen ini'}?`, { danger: /void|cancel|reject|reverse|dispose/.test(actionName), ok: a.label }))) return;
    }
    try {
      const out = await api('POST', `/api/e/${key}/${id}/actions/${actionName}`, params);
      F().clearLookups();
      toast(a.label, out.message || 'Berhasil diproses.');
      await loadRegister(key);
      ERP.app.refreshView?.(key);
      if (out.redirect) openRecord(out.redirect.entity, out.redirect.id);
      else if (state.overlay?.kind === 'drawer' || !state.overlay) openRecord(key, id);
    } catch (err) { fail(err); }
  }

  async function removeRecord(key, id) {
    const e = ent(key);
    if (!(await confirmBox(`Hapus ${e.one}`, 'Data yang dihapus tidak dapat dikembalikan. Jejak audit tetap menyimpan salinannya.', { danger: true, ok: 'Hapus' }))) return;
    try {
      await api('DELETE', `/api/e/${key}/${id}`);
      F().clearLookups();
      toast('Data dihapus');
      closeOverlay();
      await loadRegister(key);
      ERP.app.refreshView?.(key);
    } catch (err) { fail(err); }
  }

  async function exportCsv(key) {
    const st = regState(key);
    try {
      const res = await api('GET', `/api/export/${key}${qs({ q: st.q, status: st.status !== 'semua' ? st.status : '', ...st.filters })}`, undefined, { raw: true });
      ERP.download(`${key}-${state.meta.today}.csv`, await res.blob());
      toast('Ekspor selesai', 'Ekspor dicatat di jejak audit.');
    } catch (err) { fail(err); }
  }

  const noAccess = () => `<div class="empty"><div class="empty-card"><span class="empty-title">Tidak ada akses</span><span class="empty-note">Peran Anda tidak memiliki izin untuk modul ini. Hubungi administrator.</span></div></div>`;

  ERP.records = { renderRegister, loadRegister, openRecord, openForm, runAction, removeRecord, exportCsv, regState, ent, noAccess, listColumns };
})();
