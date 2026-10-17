/**
 * Ekspor tabel ke Excel (.xlsx) atau PDF dari tabel yang sedang ditampilkan —
 * kolom, urutan, format, dan penyamaran mengikuti tampilan pengguna (WYSIWYG),
 * sehingga isi berkas tidak pernah melebihi apa yang boleh dilihat pengguna.
 * Pustaka PDF dimuat hanya saat dibutuhkan.
 */
import { strToU8, zipSync } from 'fflate';

export interface ExportMeta { title: string; company: string; scope: string; period: string; user: string; filters: string; at: Date; classification: string }
export interface TableData { headers: string[]; rows: string[][]; numeric: boolean[] }

const clean = (s: string) => s.replace(/\s*\n+\s*/g, ' · ').replace(/[ \t\u00a0]+/g, ' ').trim();
/** Teks sel seperti tampil (baris sub dipisah " · "), tanpa huruf kapital dari CSS text-transform. */
/** Teks judul kolom: simpul teks digabung dengan spasi (judul bertingkat tidak menempel), tanpa CSS text-transform. */
export const headText = (el: Element) => {
  const parts: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) parts.push(n.textContent ?? '');
  return clean(parts.join(' '));
};
export const textOf = (el: HTMLElement): string => {
  const controls = el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');
  /* Sel berupa tombol sakelar tanpa teks (mis. matriks izin): Ya/Tidak dari aria-pressed. */
  const toggle = el.querySelector('[aria-pressed]');
  if (!controls.length && toggle && !(el.textContent ?? '').trim()) return toggle.getAttribute('aria-pressed') === 'true' ? 'Ya' : 'Tidak';
  if (controls.length) {
    /* Sel berisi kontrol formulir (grid yang dapat disunting): pakai nilai yang tampil, bukan seluruh daftar opsi. */
    const copy = el.cloneNode(true) as HTMLElement;
    const copies = copy.querySelectorAll('input, select, textarea');
    controls.forEach((c, k) => {
      const v = c instanceof HTMLSelectElement ? c.selectedOptions[0]?.text ?? ''
        : c instanceof HTMLInputElement && (c.type === 'checkbox' || c.type === 'radio') ? (c.checked ? 'Ya' : 'Tidak') : c.value;
      copies[k]?.replaceWith(document.createTextNode(` ${v} `));
    });
    return clean(copy.textContent ?? '');
  }
  return clean(getComputedStyle(el).textTransform === 'uppercase' ? el.textContent ?? '' : el.innerText || el.textContent || '');
};

/** Baca tabel DOM: lewati kolom aksi (tanpa judul), baris kosong/penanda, dan baris yang disembunyikan saringan. */
export function readTable(table: HTMLTableElement): TableData {
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  const ths = headRow ? [...headRow.cells] : [];
  let headers = ths.map((c) => headText(c));
  const keep = headers.map((h, i) => Boolean(h) && !ths[i].hasAttribute('data-no-export'));
  const numeric = ths.map((c) => c.classList.contains('ta-r'));
  const rows: string[][] = [];
  const bodies = [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])];
  const width = Math.max(ths.length, ...bodies.flatMap((b) => [...b.rows].map((r) => r.cells.length)));
  for (const tb of bodies) for (const tr of [...tb.rows]) {
    if (tr.hidden || tr.style.display === 'none') continue;
    const cells = [...tr.cells];
    if (!cells.length) continue;
    /* Baris penanda (memuat/kosong) memakai satu sel colspan selebar tabel. */
    if (cells.length === 1 && width > 1 && !tr.classList.contains('report-section')) continue;
    const out: string[] = [];
    let col = 0;
    for (const td of cells) {
      const span = td.colSpan || 1;
      const txt = textOf(td as HTMLElement);
      for (let k = 0; k < span; k++) out[col + k] = k === 0 ? txt : '';
      col += span;
    }
    rows.push(out);
  }
  if (!headers.length && rows.length) headers = rows[0].map((_, i) => `Kolom ${i + 1}`);
  const idx = headers.map((_, i) => i).filter((i) => keep[i] ?? true);
  return { headers: idx.map((i) => headers[i]), rows: rows.map((r) => idx.map((i) => r[i] ?? '')), numeric: idx.map((i) => numeric[i] ?? false) };
}

/** Angka format id-ID → number ("Rp 1.234.567", "(12.500)", "12,5%"); null bila bukan angka murni. */
export function parseIdNumber(s: string): number | null {
  const t = s.replace(/^Rp\s*/i, '').replace(/\s/g, '');
  if (!t || t === '—' || t === '-') return null;
  const m = /^(\()?(-|−)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?(\))?(%)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[3].replace(/\./g, '') + (m[4] ? `.${m[4]}` : ''));
  return (m[1] && m[5]) || m[2] ? -n : n;
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i: number) => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/** Berkas .xlsx minimal (OOXML) — kepala dokumen, baris judul tebal & beku, angka sebagai angka (#.##0). */
export function toXlsx(meta: ExportMeta, data: TableData): Blob {
  const lines: { cells: { v: string | number; s: number }[] }[] = [];
  const text = (v: string, s = 0) => ({ v, s });
  lines.push({ cells: [text(meta.title, 1)] });
  lines.push({ cells: [text(`${meta.company} · ${meta.scope} · ${meta.period}`)] });
  lines.push({ cells: [text(`Diekspor ${meta.at.toLocaleString('id-ID')} oleh ${meta.user}${meta.filters ? ` · Saringan: ${meta.filters}` : ''}`)] });
  lines.push({ cells: [text(meta.classification)] });
  lines.push({ cells: [] });
  const headerRow = lines.length + 1;
  lines.push({ cells: data.headers.map((h) => text(h, 1)) });
  for (const r of data.rows) {
    lines.push({ cells: r.map((v, i) => { const n = data.numeric[i] ? parseIdNumber(v) : null; return n === null ? text(v) : { v: n, s: Number.isInteger(n) ? 2 : 3 }; }) });
  }
  const widths = data.headers.map((h, i) => Math.min(60, Math.max(8, h.length + 2, ...data.rows.slice(0, 500).map((r) => (r[i] ?? '').length + 2))));
  const rowsXml = lines.map((l, ri) => `<row r="${ri + 1}">${l.cells.map((c, ci) => {
    const ref = `${colName(ci)}${ri + 1}`;
    return typeof c.v === 'number' ? `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>` : c.v === '' ? '' : `<c r="${ref}" t="inlineStr" s="${c.s}"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rowsXml}</sheetData>
${data.headers.length ? `<autoFilter ref="A${headerRow}:${colName(data.headers.length - 1)}${headerRow + data.rows.length}"/>` : ''}</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const sheetName = esc(meta.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Data');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(meta.title)}</dc:title><dc:creator>${esc(meta.user)}</dc:creator><cp:keywords>${esc(meta.classification)}</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">${meta.at.toISOString()}</dcterms:created></cp:coreProperties>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>${data.headers.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName.replace(/'/g, "''")}'!$A$${headerRow}:$${colName(data.headers.length - 1)}$${headerRow + data.rows.length}</definedName></definedNames>` : ''}</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/styles.xml': strToU8(styles),
  };
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** PDF lanskap A4 (jsPDF + autotable): kepala dokumen, tabel berulang judul, nomor halaman & klasifikasi di kaki. */
export async function toPdf(meta: ExportMeta, data: TableData): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: data.headers.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(meta.title, 36, 40);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
  doc.text(`${meta.company} · ${meta.scope} · ${meta.period}`, 36, 56);
  const sub = doc.splitTextToSize(`Diekspor ${meta.at.toLocaleString('id-ID')} oleh ${meta.user}${meta.filters ? ` · Saringan: ${meta.filters}` : ''} · ${data.rows.length} baris`, w - 72);
  doc.text(sub, 36, 68);
  autoTable(doc, {
    head: [data.headers], body: data.rows, startY: 72 + sub.length * 10, margin: { left: 36, right: 36, bottom: 40 },
    styles: { fontSize: data.headers.length > 9 ? 6.5 : 7.5, cellPadding: 3, overflow: 'linebreak', textColor: 30 },
    headStyles: { fillColor: [21, 64, 140], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 251] },
    columnStyles: Object.fromEntries(data.numeric.map((n, i) => [i, n ? { halign: 'right' as const } : {}])),
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7); doc.setTextColor(120);
      doc.text(meta.classification, 36, h - 20);
      doc.text(`Halaman ${doc.getNumberOfPages()}`, w - 36, h - 20, { align: 'right' });
    },
  });
  return doc.output('blob');
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fileSlug = (s: string) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'data';
