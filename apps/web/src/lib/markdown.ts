/**
 * Pengubah Markdown minimal & aman untuk jawaban asisten AI.
 * Seluruh teks di-escape lebih dulu; hanya tag buatan fungsi ini yang keluar.
 * Tidak mendukung tautan, gambar, atau HTML mentah (K-33: tanpa konten aktif).
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(s: string): string {
  const parts = s.split(/(`[^`]+`)/g);
  return parts.map((p) => {
    if (/^`[^`]+`$/.test(p)) return `<code>${esc(p.slice(1, -1))}</code>`;
    return esc(p)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  }).join('');
}

const NUMERIC = /^[-−(]?\s*(Rp\s?)?[\d.,]+\s?(%|jt|juta|M|miliar|rb|T)?\)?$/i;
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      for (i += 1; i < lines.length && !/^\s*```/.test(lines[i]); i += 1) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i += 1) rows.push(cells(lines[i]));
      i -= 1;
      const td = (c: string, tag: 'td' | 'th') => `<${tag}${NUMERIC.test(c.replace(/\*\*/g, '')) ? ' class="ta-r num"' : ''}>${inline(c)}</${tag}>`;
      out.push(`<div class="md-table"><table class="table"><thead><tr>${head.map((c) => td(c, 'th')).join('')}</tr></thead><tbody>${rows.map((r) => `<tr class="is-static">${r.map((c) => td(c, 'td')).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const h = /^\s*(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length <= 2 ? 3 : 4}>${inline(h[2])}</h${h[1].length <= 2 ? 3 : 4}>`); continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      for (; i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]); i += 1) items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      i -= 1;
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    if (!line.trim()) { flush(); continue; }
    para.push(line.trim());
  }
  flush();
  return out.join('');
}
