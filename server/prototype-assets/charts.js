/* ==========================================================================
   ERP Enterprise — Pemformat angka & mesin grafik SVG
   --------------------------------------------------------------------------
   Tanpa pustaka eksternal. Warna selalu dibaca dari token CSS saat menggambar,
   sehingga pergantian tema langsung menghasilkan palet mode yang benar
   (dipilih ulang, bukan dibalik otomatis).

   Aturan yang dipatuhi:
   - satu sumbu nilai per grafik; tidak pernah dua skala y;
   - kategorikal dipakai untuk identitas, ramp sekuensial untuk ember ordinal,
     satu rona untuk peringkat satu ukuran;
   - marka tipis, ujung data membulat 4px menempel garis dasar, celah 2px
     antar isian, penanda >= 8px, cincin permukaan 2px pada marka bertumpuk;
   - label langsung selektif, bukan angka di setiap titik;
   - lapisan hover (crosshair + tooltip) ada secara bawaan.
   ========================================================================== */

/* --- Pemformat (id-ID) ---------------------------------------------------- */
const FMT = (() => {
  const nf = (min, max) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: min, maximumFractionDigits: max });
  const n0 = nf(0, 0), n1 = nf(1, 1), n2 = nf(2, 2);
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  const int = (v) => n0.format(v);
  const dec = (v, d = 1) => (d === 2 ? n2 : n1).format(v);

  /** "Rp 4.823.400.000" */
  const rp = (v) => 'Rp ' + n0.format(Math.round(v));

  /** "Rp 4,82 M" — rb / jt / M / T */
  const rpCompact = (v) => {
    const s = v < 0 ? '-' : '';
    const a = Math.abs(v);
    if (a >= 1e12) return `${s}Rp ${n2.format(a / 1e12)} T`;
    if (a >= 1e9) return `${s}Rp ${n2.format(a / 1e9)} M`;
    if (a >= 1e6) return `${s}Rp ${n1.format(a / 1e6)} jt`;
    if (a >= 1e3) return `${s}Rp ${n0.format(a / 1e3)} rb`;
    return `${s}Rp ${n0.format(a)}`;
  };

  /** Ringkas tanpa awalan mata uang, untuk label sumbu. */
  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e12) return n1.format(v / 1e12) + ' T';
    if (a >= 1e9) return n1.format(v / 1e9) + ' M';
    if (a >= 1e6) return n1.format(v / 1e6) + ' jt';
    if (a >= 1e3) return n0.format(v / 1e3) + ' rb';
    return n0.format(v);
  };

  const pct = (v, d = 1) => dec(v, d) + '%';
  const signedPct = (v, d = 1) => (v > 0 ? '+' : '') + dec(v, d) + '%';

  /** "2026-08-14" -> "14 Agu 2026" */
  const date = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y || !m || !d) return iso;
    return `${d} ${BULAN[m - 1]} ${y}`;
  };

  const value = (v, format) => {
    switch (format) {
      case 'rp': return rp(v);
      case 'rp-compact': return rpCompact(v);
      case 'int': return int(v);
      case 'pct': return pct(v);
      case 'miliar': return 'Rp ' + n2.format(v) + ' M';
      default: return int(v);
    }
  };

  return { int, dec, rp, rpCompact, compact, pct, signedPct, date, value };
})();

/* --- Mesin grafik ---------------------------------------------------------- */
const Charts = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const registry = new Set();

  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const theme = () => ({
    grid: cssVar('--chart-grid'),
    axis: cssVar('--chart-axis'),
    reference: cssVar('--chart-reference'),
    surface: cssVar('--chart-surface'),
    ink3: cssVar('--ink-3'),
    ink4: cssVar('--ink-4'),
    cat: [cssVar('--cat-1'), cssVar('--cat-2'), cssVar('--cat-3'), cssVar('--cat-4'), cssVar('--cat-5')],
    seq: [cssVar('--seq-1'), cssVar('--seq-2'), cssVar('--seq-3'), cssVar('--seq-4'), cssVar('--seq-5')],
  });

  const el = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  };

  /** Batas atas "rapi" dan langkah tik untuk sumbu nilai.
      Kandidat langkah dibuat rapat agar marka mengisi tinggi plot; tangga
      1/2/5 saja membuat puncak data kerap berhenti di separuh grafik. */
  const STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  function niceScale(max, ticks = 4) {
    if (!(max > 0)) return { max: 1, step: 0.25 };
    const raw = max / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (STEPS.find((s) => norm <= s) ?? 10) * mag;
    return { max: step * ticks, step };
  }

  /** Persegi dengan dua sudut atas membulat, menempel garis dasar. */
  function topRoundedPath(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, h, w / 2));
    if (h <= 0) return `M${x},${y} L${x + w},${y}`;
    return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} ` +
           `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
  }

  function ensureTip(container) {
    let tip = container.querySelector('.chart-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      tip.setAttribute('role', 'status');
      container.appendChild(tip);
    }
    return tip;
  }

  function placeTip(container, tip, x, y) {
    const w = container.clientWidth;
    const half = tip.offsetWidth / 2;
    const left = Math.max(half + 4, Math.min(w - half - 4, x));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(tip.offsetHeight + 6, y - 10)}px`;
  }

  /* --- Grafik garis: aktual (area + garis) vs acuan (garis putus) --------- */
  function lineChart(container, opts) {
    const draw = () => {
      const t = theme();
      const W = container.clientWidth || 600;
      const H = opts.height || 236;
      const pad = { t: 16, r: 16, b: 26, l: 58 };
      const iw = Math.max(40, W - pad.l - pad.r);
      const ih = Math.max(40, H - pad.t - pad.b);
      const { labels, actual, target } = opts;
      const n = labels.length;

      const peak = Math.max(...actual, ...target);
      const { max, step } = niceScale(peak, 4);
      const x = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      const y = (v) => pad.t + ih - (v / max) * ih;

      const svg = el('svg', {
        class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H,
        role: 'img',
        'aria-label': `${opts.title}. ${labels[0]} ${FMT.value(actual[0], opts.format)} hingga ${labels[n - 1]} ${FMT.value(actual[n - 1], opts.format)}.`,
      });

      const defs = el('defs');
      const gid = `fill-${Math.random().toString(36).slice(2, 8)}`;
      const grad = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.appendChild(el('stop', { offset: '0%', 'stop-color': t.cat[0], 'stop-opacity': 0.22 }));
      grad.appendChild(el('stop', { offset: '100%', 'stop-color': t.cat[0], 'stop-opacity': 0.02 }));
      defs.appendChild(grad);
      svg.appendChild(defs);

      /* Kisi & label sumbu nilai — resesif. */
      for (let v = 0; v <= max + 1e-9; v += step) {
        const yy = y(v);
        svg.appendChild(el('line', {
          x1: pad.l, y1: yy, x2: pad.l + iw, y2: yy,
          stroke: v === 0 ? t.axis : t.grid, 'stroke-width': 1,
        }));
        const label = el('text', {
          x: pad.l - 10, y: yy + 4, 'text-anchor': 'end',
          fill: t.ink4, 'font-size': 11, 'font-family': 'var(--font-num)',
        });
        label.textContent = FMT.compact(v * (opts.scale || 1));
        svg.appendChild(label);
      }

      /* Label sumbu kategori — dijarangkan bila sempit. */
      const every = iw / n < 40 ? 2 : 1;
      labels.forEach((lab, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        const label = el('text', {
          x: x(i), y: pad.t + ih + 17, 'text-anchor': 'middle',
          fill: t.ink4, 'font-size': 11, 'font-family': 'var(--font-num)',
        });
        label.textContent = lab;
        svg.appendChild(label);
      });

      const line = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

      svg.appendChild(el('path', {
        d: `${line(actual)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`,
        fill: `url(#${gid})`, stroke: 'none',
      }));

      /* Acuan target: garis putus netral, bukan rona kategorikal kedua. */
      svg.appendChild(el('path', {
        d: line(target), fill: 'none', stroke: t.reference,
        'stroke-width': 2, 'stroke-dasharray': '5 4', 'stroke-linecap': 'round',
      }));

      svg.appendChild(el('path', {
        d: line(actual), fill: 'none', stroke: t.cat[0],
        'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));

      /* Titik akhir ditekankan, dengan cincin permukaan 2px. */
      svg.appendChild(el('circle', {
        cx: x(n - 1), cy: y(actual[n - 1]), r: 4.5,
        fill: t.cat[0], stroke: t.surface, 'stroke-width': 2,
      }));

      /* Lapisan hover */
      const hoverLine = el('line', {
        y1: pad.t, y2: pad.t + ih, stroke: t.axis, 'stroke-width': 1,
        'stroke-dasharray': '3 3', opacity: 0,
      });
      const dotA = el('circle', { r: 4.5, fill: t.cat[0], stroke: t.surface, 'stroke-width': 2, opacity: 0 });
      const dotT = el('circle', { r: 4, fill: t.reference, stroke: t.surface, 'stroke-width': 2, opacity: 0 });
      svg.appendChild(hoverLine); svg.appendChild(dotA); svg.appendChild(dotT);

      const hit = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent' });
      svg.appendChild(hit);

      container.textContent = '';
      container.appendChild(svg);
      const tip = ensureTip(container);

      const show = (i) => {
        hoverLine.setAttribute('x1', x(i)); hoverLine.setAttribute('x2', x(i));
        hoverLine.setAttribute('opacity', 1);
        dotA.setAttribute('cx', x(i)); dotA.setAttribute('cy', y(actual[i])); dotA.setAttribute('opacity', 1);
        dotT.setAttribute('cx', x(i)); dotT.setAttribute('cy', y(target[i])); dotT.setAttribute('opacity', 1);
        tip.innerHTML =
          `<div class="chart-tip-head">${labels[i]} 2026</div>` +
          `<div class="chart-tip-row"><i class="chart-swatch" style="background:${t.cat[0]}"></i><span>Pendapatan</span><b>${FMT.value(actual[i] * (opts.scale || 1), opts.format)}</b></div>` +
          `<div class="chart-tip-row"><i class="chart-swatch chart-swatch-line"></i><span>Target</span><b>${FMT.value(target[i] * (opts.scale || 1), opts.format)}</b></div>`;
        tip.dataset.show = 'true';
        placeTip(container, tip, x(i), y(Math.max(actual[i], target[i])));
      };
      const hide = () => {
        hoverLine.setAttribute('opacity', 0);
        dotA.setAttribute('opacity', 0); dotT.setAttribute('opacity', 0);
        tip.dataset.show = 'false';
      };

      const onMove = (ev) => {
        const rect = svg.getBoundingClientRect();
        const px = ((ev.clientX - rect.left) / rect.width) * W;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / iw) * (n - 1))));
        show(i);
      };
      hit.addEventListener('pointermove', onMove);
      hit.addEventListener('pointerdown', onMove);
      hit.addEventListener('pointerleave', hide);
    };

    return register(container, draw);
  }

  /* --- Kolom dengan ramp sekuensial (ember ordinal, mis. umur piutang) ---- */
  function columnChart(container, opts) {
    const draw = () => {
      const t = theme();
      const W = container.clientWidth || 480;
      const H = opts.height || 210;
      const pad = { t: 26, r: 8, b: 40, l: 8 };
      const iw = Math.max(40, W - pad.l - pad.r);
      const ih = Math.max(40, H - pad.t - pad.b);
      const items = opts.items;
      const n = items.length;
      const { max } = niceScale(Math.max(...items.map((d) => d.value)), 4);

      const band = iw / n;
      const barW = Math.min(band - 12, 62);
      const cx = (i) => pad.l + band * i + band / 2;
      const y = (v) => pad.t + ih - (v / max) * ih;

      const svg = el('svg', {
        class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H,
        role: 'img', 'aria-label': opts.ariaLabel || opts.title,
      });

      svg.appendChild(el('line', {
        x1: pad.l, y1: pad.t + ih, x2: pad.l + iw, y2: pad.t + ih,
        stroke: t.axis, 'stroke-width': 1,
      }));

      const tip = ensureTip(container);

      items.forEach((d, i) => {
        const h = Math.max(2, (d.value / max) * ih);
        const bx = cx(i) - barW / 2;
        const by = pad.t + ih - h;
        const bar = el('path', {
          d: topRoundedPath(bx, by, barW, h, 4),
          fill: t.seq[Math.min(i, t.seq.length - 1)],
        });
        bar.style.cursor = 'default';
        svg.appendChild(bar);

        const val = el('text', {
          x: cx(i), y: by - 8, 'text-anchor': 'middle',
          fill: t.ink3, 'font-size': 11, 'font-weight': 600, 'font-family': 'var(--font-num)',
        });
        val.textContent = FMT.compact(d.value);
        svg.appendChild(val);

        const lab = el('text', {
          x: cx(i), y: pad.t + ih + 16, 'text-anchor': 'middle',
          fill: t.ink4, 'font-size': 11, 'font-family': 'var(--font-num)',
        });
        lab.textContent = d.short || d.label;
        svg.appendChild(lab);

        const cnt = el('text', {
          x: cx(i), y: pad.t + ih + 30, 'text-anchor': 'middle',
          fill: t.ink4, 'font-size': 10, 'font-family': 'var(--font-num)',
        });
        cnt.textContent = `${d.count} faktur`;
        svg.appendChild(cnt);

        /* Target sentuh lebih besar dari marka. */
        const hit = el('rect', { x: cx(i) - band / 2, y: pad.t, width: band, height: ih, fill: 'transparent' });
        hit.addEventListener('pointerenter', () => {
          bar.setAttribute('opacity', 0.82);
          tip.innerHTML =
            `<div class="chart-tip-head">${d.label}</div>` +
            `<div class="chart-tip-row"><span>Nilai</span><b>${FMT.rpCompact(d.value)}</b></div>` +
            `<div class="chart-tip-row"><span>Jumlah faktur</span><b>${FMT.int(d.count)}</b></div>`;
          tip.dataset.show = 'true';
          placeTip(container, tip, cx(i), by);
        });
        hit.addEventListener('pointerleave', () => {
          bar.removeAttribute('opacity');
          tip.dataset.show = 'false';
        });
        svg.appendChild(hit);
      });

      container.textContent = '';
      container.appendChild(svg);
      ensureTip(container);
    };

    return register(container, draw);
  }

  /* --- Batang horizontal, satu rona (peringkat satu ukuran) ---------------- */
  function rankBars(container, opts) {
    const draw = () => {
      const t = theme();
      const items = opts.items;
      const max = Math.max(...items.map((d) => d.value));
      container.textContent = '';
      const list = document.createElement('div');
      list.className = 'stack-legend';
      list.setAttribute('role', 'list');

      items.forEach((d) => {
        const row = document.createElement('div');
        row.className = 'stack-legend-row';
        row.setAttribute('role', 'listitem');
        row.innerHTML =
          `<span class="stack-name">${d.label}</span>` +
          `<span class="meter" style="flex:0 0 42%">` +
            `<span class="meter-track" style="height:8px">` +
              `<span class="meter-fill" style="width:${(d.value / max) * 100}%;background:${t.cat[0]};border-radius:0 3px 3px 0"></span>` +
            `</span>` +
          `</span>` +
          `<b class="num">${FMT.rpCompact(d.value)}</b>`;
        list.appendChild(row);
      });
      container.appendChild(list);
    };
    return register(container, draw);
  }

  /* --- Bilah komposisi bertumpuk (identitas -> palet kategorikal) --------- */
  function compositionBar(barEl, legendEl, opts) {
    const draw = () => {
      const t = theme();
      const items = opts.items;
      const total = items.reduce((s, d) => s + d.value, 0);

      barEl.textContent = '';
      barEl.className = 'stackbar';
      barEl.setAttribute('role', 'img');
      barEl.setAttribute('aria-label',
        `${opts.title}: ` + items.map((d) => `${d.label} ${FMT.pct((d.value / total) * 100)}`).join(', '));

      const tipHost = barEl.parentElement;
      const tip = ensureTip(tipHost);

      items.forEach((d, i) => {
        const seg = document.createElement('div');
        seg.className = 'stackbar-seg';
        seg.style.flex = `${d.value} 0 0`;
        seg.style.background = t.cat[i % t.cat.length];
        seg.addEventListener('pointerenter', (ev) => {
          const hostRect = tipHost.getBoundingClientRect();
          const r = seg.getBoundingClientRect();
          tip.innerHTML =
            `<div class="chart-tip-head">${d.label}</div>` +
            `<div class="chart-tip-row"><i class="chart-swatch" style="background:${t.cat[i % t.cat.length]}"></i><span>Nilai</span><b>${FMT.rpCompact(d.value)}</b></div>` +
            `<div class="chart-tip-row"><span>Porsi</span><b>${FMT.pct((d.value / total) * 100)}</b></div>`;
          tip.dataset.show = 'true';
          placeTip(tipHost, tip, r.left - hostRect.left + r.width / 2, r.top - hostRect.top);
        });
        seg.addEventListener('pointerleave', () => { tip.dataset.show = 'false'; });
        barEl.appendChild(seg);
      });

      if (legendEl) {
        legendEl.textContent = '';
        legendEl.className = 'stack-legend';
        items.forEach((d, i) => {
          const row = document.createElement('div');
          row.className = 'stack-legend-row';
          row.innerHTML =
            `<i class="chart-swatch" style="background:${t.cat[i % t.cat.length]}"></i>` +
            `<span class="stack-name">${d.label}</span>` +
            `<b class="num">${FMT.rpCompact(d.value)}</b>` +
            `<span class="stack-share num">${FMT.pct((d.value / total) * 100)}</span>`;
          legendEl.appendChild(row);
        });
      }
    };
    return register(barEl, draw);
  }

  /* --- Sparkline untuk ubin KPI ------------------------------------------- */
  function sparkline(container, values) {
    const draw = () => {
      const t = theme();
      const W = 80, H = 28, pad = 3;
      const min = Math.min(...values), max = Math.max(...values);
      const span = max - min || 1;
      const x = (i) => pad + (i / (values.length - 1)) * (W - pad * 2);
      const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);

      const svg = el('svg', { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true', focusable: 'false' });
      const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

      svg.appendChild(el('path', {
        d: `${d} L${x(values.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`,
        fill: t.cat[0], opacity: 0.12, stroke: 'none',
      }));
      svg.appendChild(el('path', {
        d, fill: 'none', stroke: t.cat[0], 'stroke-width': 1.5,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));
      svg.appendChild(el('circle', {
        cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 2.75,
        fill: t.cat[0], stroke: t.surface, 'stroke-width': 1.5,
      }));

      container.textContent = '';
      container.appendChild(svg);
    };
    return register(container, draw);
  }

  /* --- Registri: gambar ulang saat lebar atau tema berubah ---------------- */
  function register(node, draw) {
    const entry = { node, draw };
    registry.add(entry);
    draw();
    if (typeof ResizeObserver !== 'undefined') {
      let last = node.clientWidth;
      const ro = new ResizeObserver(() => {
        if (node.clientWidth !== last && node.clientWidth > 0) { last = node.clientWidth; draw(); }
      });
      ro.observe(node);
      entry.ro = ro;
    }
    return entry;
  }

  function redrawAll() {
    for (const entry of registry) {
      if (!entry.node.isConnected) { entry.ro?.disconnect(); registry.delete(entry); continue; }
      entry.draw();
    }
  }

  /** Buang instans yang nodenya sudah lepas dari dokumen. */
  function prune() {
    for (const entry of registry) {
      if (!entry.node.isConnected) { entry.ro?.disconnect(); registry.delete(entry); }
    }
  }

  return { lineChart, columnChart, rankBars, compositionBar, sparkline, redrawAll, prune, cssVar };
})();
