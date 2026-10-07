/* ==========================================================================
   Formulir generik: pembentuk input dari metadata entitas, editor baris
   dokumen dengan perhitungan langsung, pemuat rujukan (lookup), dan
   pengumpul nilai formulir. Validasi akhir tetap di server.
   ========================================================================== */
/* global ERP, FMT */
(() => {
  'use strict';
  const { $, $$, esc, icon, api, qs, state, num } = ERP;

  /* --- Lookup rujukan (cache per sesi tampilan) ------------------------------ */
  async function lookup(entity, filter = {}) {
    const key = `${state.companyId}|${entity}|${JSON.stringify(filter)}`;
    if (!state.lookups.has(key)) state.lookups.set(key, api('GET', `/api/lookup/${entity}${qs(filter)}`).catch((e) => { state.lookups.delete(key); throw e; }));
    return state.lookups.get(key);
  }
  const clearLookups = () => state.lookups.clear();

  function refFilterQuery(f) {
    const q = {};
    for (const [k, v] of Object.entries(f.refFilter || {})) q[`f_${k}`] = Array.isArray(v) ? v.join(',') : v;
    if (f.refScope === 'company') q.scope = 'company';
    return q;
  }

  /* --- Input tunggal ------------------------------------------------------------ */
  function input(f, value, { prefix = '', compact = false } = {}) {
    const name = prefix + f.name;
    const id = `fld-${name.replace(/[^\w-]/g, '_')}-${Math.random().toString(36).slice(2, 6)}`;
    const req = f.required ? ' required aria-required="true"' : '';
    const v = value ?? (f.default !== undefined ? f.default : '');
    let ctl;
    switch (f.type) {
      case 'textarea':
        ctl = `<textarea class="textarea" id="${id}" name="${esc(name)}" rows="${compact ? 1 : 2}" maxlength="${f.max || 2000}"${req}>${esc(v)}</textarea>`; break;
      case 'money': case 'number': case 'int': case 'pct': {
        const step = f.type === 'int' ? '1' : f.type === 'money' ? '0.01' : 'any';
        ctl = `<input class="input num" type="number" inputmode="decimal" step="${step}" id="${id}" name="${esc(name)}" value="${esc(v)}"${f.min !== undefined && f.min !== null ? ` min="${f.min}"` : ''}${f.max !== undefined && f.type !== 'money' && f.type !== 'number' ? ` max="${f.max}"` : ''}${req}>`; break;
      }
      case 'date':
        ctl = `<input class="input num" type="date" id="${id}" name="${esc(name)}" value="${esc(v ? String(v).slice(0, 10) : '')}"${req}>`; break;
      case 'bool':
        ctl = `<label class="check-inline"><input type="checkbox" id="${id}" name="${esc(name)}" ${v ? 'checked' : ''}> <span>${esc(f.label)}</span></label>`; break;
      case 'select':
        ctl = `<select class="select" id="${id}" name="${esc(name)}"${req}>${f.required ? '' : '<option value="">—</option>'}${(f.options || []).map((o) => {
          const [ov, ol] = Array.isArray(o) ? o : [o, ERP.state.meta?.status?.[o]?.[0] || o];
          return `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`;
        }).join('')}</select>`; break;
      case 'ref':
        ctl = `<select class="select" id="${id}" name="${esc(name)}" data-ref="${esc(f.ref)}" data-ref-filter="${esc(JSON.stringify(refFilterQuery(f)))}" data-value="${esc(v ?? '')}" ${f.refParent ? `data-ref-parent="${esc(f.refParent)}"` : ''}${req}><option value="">Memuat…</option></select>`; break;
      case 'password':
        ctl = `<input class="input" type="password" autocomplete="new-password" id="${id}" name="${esc(name)}" maxlength="128"${req}>`; break;
      case 'email':
        ctl = `<input class="input" type="email" autocomplete="off" id="${id}" name="${esc(name)}" value="${esc(v)}" maxlength="${f.max || 160}"${req}>`; break;
      default:
        ctl = `<input class="input${/code|number|no$|_no|npwp|nik/.test(f.name) ? ' code' : ''}" type="text" autocomplete="off" id="${id}" name="${esc(name)}" value="${esc(v)}" maxlength="${f.max || 200}"${f.pattern ? ` pattern="${esc(f.pattern)}"` : ''}${req}>`;
    }
    if (compact) return ctl;
    if (f.type === 'bool') return `<div class="field">${ctl}${f.help ? `<span class="field-hint">${esc(f.help)}</span>` : ''}</div>`;
    const wide = f.type === 'textarea' ? ' form-grid-full' : '';
    return `<div class="field${wide}"><label for="${id}">${esc(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}${f.sensitive ? ` <span class="pill pill-xs" data-tone="warn" title="Data sensitif">${icon('shield')}</span>` : ''}</label>${ctl}${f.help ? `<span class="field-hint">${esc(f.help)}</span>` : ''}</div>`;
  }

  /** Isi seluruh <select data-ref> di dalam root dengan data lookup. */
  async function hydrateRefs(root, ctxValues = {}) {
    const sels = $$('select[data-ref]', root);
    await Promise.all(sels.map((s) => fillRef(s, root, ctxValues)));
  }

  async function fillRef(sel, root, ctxValues = {}) {
    const filter = JSON.parse(sel.dataset.refFilter || '{}');
    const parent = sel.dataset.refParent;
    if (parent) {
      const pv = $(`[name="${parent}"]`, root.closest('form') || root)?.value || ctxValues[parent];
      if (pv) filter[`f_${parent}`] = pv;
    }
    const cur = sel.dataset.value ?? '';
    try {
      const items = await lookup(sel.dataset.ref, filter);
      sel._items = items;
      const auto = !cur && sel.required && items.length === 1 ? String(items[0].id) : null;
      const has = items.some((i) => String(i.id) === String(cur));
      sel.innerHTML = `<option value="">${sel.required ? 'Pilih…' : '—'}</option>` +
        (cur && !has ? `<option value="${esc(cur)}" selected>${esc(sel.dataset.label || `#${cur}`)}</option>` : '') +
        items.map((i) => `<option value="${i.id}" ${String(i.id) === String(cur) || String(i.id) === auto ? 'selected' : ''}>${esc(i.label)}${i.open_amount != null ? ` — sisa ${esc(FMT.rp(i.open_amount))}` : ''}</option>`).join('');
    } catch (e) {
      sel.innerHTML = `<option value="${esc(cur)}">${esc(cur ? sel.dataset.label || `#${cur}` : '— tidak dapat memuat —')}</option>`;
    }
  }

  /* --- Editor baris ---------------------------------------------------------- */
  const TRADE = (fields) => fields.some((f) => f.name === 'qty') && fields.some((f) => f.name === 'price');

  function linesEditor(e, lines = []) {
    const fields = e.lines.fields;
    const head = fields.map((f) => `<th class="${['money', 'number', 'int', 'pct'].includes(f.type) ? 'ta-r' : ''}">${esc(f.label)}</th>`).join('');
    return `
      <div class="field form-grid-full">
        <label>Baris dokumen</label>
        <div class="lines lines-edit">
          <div class="table-scroll">
            <table class="table" data-lines>
              <thead><tr><th class="col-no">#</th>${head}<th></th></tr></thead>
              <tbody>${(lines.length ? lines : [{}]).map((l, i) => lineRow(fields, l, i)).join('')}</tbody>
            </table>
          </div>
        </div>
        <div class="lines-actions">
          <button type="button" class="btn btn-sm" data-line-add>${icon('plus')} Tambah baris</button>
          <span class="field-hint" data-lines-summary></span>
        </div>
      </div>`;
  }

  function lineRow(fields, l, i) {
    return `<tr data-line>
      <td class="col-no num muted">${i + 1}</td>
      ${fields.map((f) => `<td class="${['money', 'number', 'int', 'pct'].includes(f.type) ? 'ta-r' : ''}">${f.readonly ? `<output class="num" data-out="${esc(f.name)}">${l[f.name] != null ? esc(num(l[f.name])) : ''}</output>` : input(f, l[f.name], { compact: true })}</td>`).join('')}
      <td class="ta-r"><button type="button" class="btn btn-sm btn-icon btn-ghost" data-line-del aria-label="Hapus baris">${icon('x')}</button></td>
    </tr>`;
  }

  function bindLines(root, e, onChange) {
    const tbody = $('[data-lines] tbody', root);
    if (!tbody) return;
    const fields = e.lines.fields;
    const recalc = () => {
      let total = 0, debit = 0, credit = 0;
      $$('tr[data-line]', tbody).forEach((tr, i) => {
        tr.querySelector('.col-no').textContent = i + 1;
        const val = (n) => Number($(`[name="${n}"]`, tr)?.value || 0);
        if (TRADE(fields)) {
          const amt = val('qty') * val('price') * (1 - val('discount_pct') / 100);
          const out = $('[data-out="amount"]', tr);
          if (out) out.textContent = num(Math.round(amt * 100) / 100);
          total += amt;
        } else if (fields.some((f) => f.name === 'debit')) {
          debit += val('debit'); credit += val('credit');
        } else if (fields.some((f) => f.name === 'amount' && !f.readonly)) {
          total += val('amount');
        } else if (fields.some((f) => f.name === 'basic')) {
          const net = val('basic') + val('allowance') + val('overtime') - val('bpjs') - val('pph21');
          const out = $('[data-out="net"]', tr);
          if (out) out.textContent = num(net);
          total += net;
        }
      });
      const sum = $('[data-lines-summary]', root);
      if (fields.some((f) => f.name === 'debit')) {
        const diff = Math.round((debit - credit) * 100) / 100;
        sum.innerHTML = `Debit <b class="num">${esc(FMT.rp(debit))}</b> · Kredit <b class="num">${esc(FMT.rp(credit))}</b> · ${diff === 0 ? '<span class="pos">Seimbang</span>' : `<span class="neg">Selisih ${esc(FMT.rp(diff))}</span>`}`;
      } else if (sum) sum.innerHTML = `Jumlah baris <b class="num">${esc(FMT.rp(total))}</b>`;
      onChange?.(total);
    };
    root.addEventListener('input', (ev) => { if (ev.target.closest('[data-lines]')) recalc(); });
    root.addEventListener('change', async (ev) => {
      const t = ev.target;
      if (!t.closest('[data-lines]')) return;
      const tr = t.closest('tr');
      // Isi harga otomatis dari data produk.
      if (t.name === 'product_id' && t._items) {
        const p = t._items.find((x) => String(x.id) === t.value);
        const price = $('[name="price"]', tr);
        if (p && price && !Number(price.value)) {
          const isPurchase = ['purchase_orders', 'purchase_bills', 'purchase_requests'].includes(e.key);
          price.value = isPurchase ? (p.standard_cost || p.price || 0) : (p.price || 0);
        }
      }
      // Isi jumlah otomatis = sisa tagihan.
      if ((t.name === 'invoice_id' || t.name === 'bill_id') && t._items) {
        const it = t._items.find((x) => String(x.id) === t.value);
        const amt = $('[name="amount"]', tr);
        if (it && amt && !Number(amt.value)) amt.value = it.open_amount;
      }
      recalc();
    });
    root.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-line-add]')) {
        const tmp = document.createElement('tbody');
        tmp.innerHTML = lineRow(fields, {}, tbody.children.length);
        const tr = tmp.firstElementChild;
        tbody.appendChild(tr);
        await hydrateRefs(tr, collectValues(root));
        $('select,input', tr)?.focus();
        recalc();
      }
      const del = ev.target.closest('[data-line-del]');
      if (del) { if ($$('tr[data-line]', tbody).length > 1) del.closest('tr').remove(); else $$('input,select', del.closest('tr')).forEach((x) => { x.value = ''; }); recalc(); }
    });
    recalc();
  }

  /* --- Pengumpul nilai -------------------------------------------------------- */
  function readControl(el, f) {
    if (!el) return undefined;
    if (f?.type === 'bool' || el.type === 'checkbox') return el.checked ? 1 : 0;
    const v = el.value;
    if (v === '') return null;
    if (f && ['money', 'number', 'int', 'pct'].includes(f.type)) return Number(v);
    if (f && f.type === 'ref') return Number(v);
    return v;
  }

  function collectValues(root) {
    const out = {};
    for (const el of $$('[name]', root)) {
      if (el.closest('[data-lines]')) continue;
      out[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value;
    }
    return out;
  }

  function collect(root, e, { includeLines = true } = {}) {
    const body = {};
    for (const f of e.fields) {
      if (f.readonly) continue;
      const el = $(`[name="${f.name}"]`, root);
      if (!el || el.closest('[data-lines]')) continue;
      body[f.name] = readControl(el, f);
    }
    const br = $('[name="branch_id"]', root);
    if (br && !e.fields.some((f) => f.name === 'branch_id')) body.branch_id = br.value ? Number(br.value) : null;
    if (includeLines && e.lines) {
      body.lines = $$('[data-lines] tr[data-line]', root).map((tr) => {
        const l = {};
        for (const f of e.lines.fields) if (!f.readonly) l[f.name] = readControl($(`[name="${f.name}"]`, tr), f);
        return l;
      }).filter((l) => Object.values(l).some((v) => v !== null && v !== '' && v !== 0));
    }
    return body;
  }

  ERP.forms = { input, hydrateRefs, fillRef, linesEditor, bindLines, collect, collectValues, lookup, clearLookups, readControl };
})();
