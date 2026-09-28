/**
 * Kas & bank (dok. 07 §8, rencana Fase 2 sprint 6): impor mutasi rekening koran
 * (CSV / MT940), pencocokan otomatis dengan baris buku, jurnal transfer antar
 * rekening/cabang lewat rekening koran antar kantor (RK), dan setoran PPN masa
 * terpusat di kantor pusat. Murni — dipakai API dan web.
 */
import type { Rupiah } from './types.js';

export interface StatementLineInput { date: string; description: string; reference: string | null; amount: Rupiah; balance: Rupiah | null }
export interface ParsedStatement { format: 'csv' | 'mt940'; account: string | null; opening: Rupiah | null; closing: Rupiah | null; lines: StatementLineInput[]; errors: string[] }

/* ------------------------------------------------------------------ angka & tanggal */

/** "1.234.567,50" | "1,234,567.50" | "-1234567" | "(1.000)" → rupiah bulat (dibulatkan). */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/\s|Rp|IDR/gi, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (/[dD][bB]?$/.test(s)) { neg = true; s = s.replace(/[dD][bB]?$/, ''); }
  s = s.replace(/[cC][rR]?$/, '');
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot > -1 && !/\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Math.round(Number(s));
  return neg ? -v : v;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
/** YYYY-MM-DD | DD/MM/YYYY | DD-MM-YYYY | DD/MM/YY | DD Mon YYYY → ISO. */
export function parseDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) { d = +r[1]; m = +r[2]; y = +r[3] < 100 ? 2000 + +r[3] : +r[3]; }
  else if ((r = /^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2,4})$/.exec(s)) && MONTHS[r[2].toLowerCase()]) { d = +r[1]; m = MONTHS[r[2].toLowerCase()]; y = +r[3] < 100 ? 2000 + +r[3] : +r[3]; }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso + 'T00:00:00Z')) || new Date(iso + 'T00:00:00Z').getUTCDate() !== d ? null : iso;
}

/* ------------------------------------------------------------------ CSV */

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const COLS: Record<string, RegExp> = {
  date: /^(tanggal|tgl|date|tanggal transaksi|posting date|value date|tgl\.? ?transaksi)$/i,
  description: /^(keterangan|deskripsi|description|uraian|remark|remarks|narasi|transaksi)$/i,
  reference: /^(referensi|ref|reference|no\.? ?ref|no\.? ?referensi|nomor referensi|cabang)$/i,
  amount: /^(jumlah|nominal|amount|mutasi|nilai)$/i,
  debit: /^(debit|debet|db|keluar|penarikan|withdrawal)$/i,
  credit: /^(kredit|credit|cr|masuk|setoran|deposit)$/i,
  balance: /^(saldo|balance|saldo akhir|running balance)$/i,
};

/**
 * CSV mutasi rekening dari internet banking. Kolom dikenali dari judulnya:
 * tanggal, keterangan, referensi, lalu salah satu dari (jumlah bertanda) atau
 * (debit, kredit); saldo opsional. Debit = uang keluar dari rekening.
 */
export function parseBankCsv(text: string): ParsedStatement {
  const errors: string[] = [];
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!rows.length) return { format: 'csv', account: null, opening: null, closing: null, lines: [], errors: ['Berkas kosong.'] };
  const sep = [';', '\t', ','].map((s) => [s, rows[0].split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  let headerAt = rows.findIndex((r) => { const cells = splitCsvLine(r, sep); return cells.some((c) => COLS.date.test(c)) && cells.some((c) => COLS.amount.test(c) || COLS.debit.test(c) || COLS.credit.test(c)); });
  if (headerAt < 0) return { format: 'csv', account: null, opening: null, closing: null, lines: [], errors: ['Baris judul tidak ditemukan: perlu kolom Tanggal dan Jumlah (atau Debit/Kredit).'] };
  const head = splitCsvLine(rows[headerAt], sep);
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, head.findIndex((h) => re.test(h))])) as Record<keyof typeof COLS, number>;
  const lines: StatementLineInput[] = [];
  let opening: number | null = null, closing: number | null = null;
  for (const [n, row] of rows.slice(headerAt + 1).entries()) {
    const c = splitCsvLine(row, sep);
    const label = (c[idx.description] ?? c[1] ?? '').toLowerCase();
    if (/^saldo awal|opening balance/.test(label) || /^saldo awal|opening/.test((c[0] ?? '').toLowerCase())) { opening = parseAmount(c[idx.balance] ?? c[idx.amount] ?? c[c.length - 1]); continue; }
    if (/^saldo akhir|closing balance|^total/.test(label) || /^saldo akhir|closing|^total/.test((c[0] ?? '').toLowerCase())) { if (!/^total/.test(label + (c[0] ?? '').toLowerCase())) closing = parseAmount(c[idx.balance] ?? c[idx.amount] ?? c[c.length - 1]); continue; }
    const date = parseDate(c[idx.date]);
    if (!date) { errors.push(`Baris ${headerAt + n + 2}: tanggal "${c[idx.date] ?? ''}" tidak dikenali.`); continue; }
    let amount: number | null;
    if (idx.amount >= 0) amount = parseAmount(c[idx.amount]);
    else {
      const d = parseAmount(c[idx.debit]) ?? 0, k = parseAmount(c[idx.credit]) ?? 0;
      amount = Math.abs(k) - Math.abs(d);
    }
    if (amount === null || amount === 0) { errors.push(`Baris ${headerAt + n + 2}: jumlah tidak valid.`); continue; }
    lines.push({ date, description: (c[idx.description] ?? '').slice(0, 300) || '(tanpa keterangan)', reference: idx.reference >= 0 ? (c[idx.reference] || null) : null, amount, balance: idx.balance >= 0 ? parseAmount(c[idx.balance]) : null });
  }
  if (opening === null && lines[0]?.balance !== null && lines[0]?.balance !== undefined) opening = lines[0].balance - lines[0].amount;
  if (closing === null && lines.length && lines[lines.length - 1].balance !== null) closing = lines[lines.length - 1].balance;
  return { format: 'csv', account: null, opening, closing, lines, errors };
}

/* ------------------------------------------------------------------ MT940 */

const mtAmount = (s: string) => parseAmount(s.replace(',', '.').replace(/\.$/, '')) ?? 0;
const mtDate = (yymmdd: string) => `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;

/** SWIFT MT940: :25: rekening, :60F:/:60M: saldo awal, :61: mutasi, :86: keterangan, :62F:/:62M: saldo akhir. */
export function parseMt940(text: string): ParsedStatement {
  const errors: string[] = [];
  const lines: StatementLineInput[] = [];
  let account: string | null = null, opening: number | null = null, closing: number | null = null;
  const tags = text.replace(/\r/g, '').split('\n').reduce((acc: { tag: string; value: string }[], raw) => {
    const m = /^:(\d{2}[A-Z]?):(.*)$/.exec(raw);
    if (m) acc.push({ tag: m[1], value: m[2] }); else if (acc.length && !/^-}?$/.test(raw.trim())) acc[acc.length - 1].value += '\n' + raw;
    return acc;
  }, []);
  for (const t of tags) {
    if (t.tag === '25') account = t.value.trim();
    else if (/^60[FM]$/.test(t.tag) && opening === null) {
      const m = /^([CD])(\d{6})([A-Z]{3})([\d,]+)/.exec(t.value.trim());
      if (m) opening = (m[1] === 'D' ? -1 : 1) * mtAmount(m[4]); else errors.push(`Saldo awal (:${t.tag}:) tidak dapat dibaca.`);
    } else if (/^62[FM]$/.test(t.tag)) {
      const m = /^([CD])(\d{6})([A-Z]{3})([\d,]+)/.exec(t.value.trim());
      if (m) closing = (m[1] === 'D' ? -1 : 1) * mtAmount(m[4]); else errors.push(`Saldo akhir (:${t.tag}:) tidak dapat dibaca.`);
    } else if (t.tag === '61') {
      const m = /^(\d{6})(\d{4})?(R?[CD])[A-Z]?([\d,]+)(N[A-Z0-9]{3}|[A-Z]{4})?([^\n/]*)(?:\/\/([^\n]*))?/.exec(t.value.trim());
      if (!m) { errors.push(`Mutasi tidak dapat dibaca: ${t.value.slice(0, 40)}`); continue; }
      const sign = m[3] === 'C' || m[3] === 'RD' ? 1 : -1;
      lines.push({ date: mtDate(m[1]), description: '', reference: (m[6] || m[7] || '').trim() || null, amount: sign * mtAmount(m[4]), balance: null });
    } else if (t.tag === '86' && lines.length) {
      lines[lines.length - 1].description = t.value.replace(/\n/g, ' ').replace(/\?\d{2}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    }
  }
  for (const l of lines) if (!l.description) l.description = l.reference ?? '(tanpa keterangan)';
  if (!lines.length && !errors.length) errors.push('Tidak ada mutasi (:61:) dalam berkas.');
  return { format: 'mt940', account, opening, closing, lines, errors };
}

export function parseStatement(text: string): ParsedStatement {
  return /^:20:|\n:20:|:60F:/.test(text) ? parseMt940(text) : parseBankCsv(text);
}

/** Saldo awal + Σ mutasi = saldo akhir (bila keduanya diketahui). */
export function statementProblems(p: { opening: Rupiah; closing: Rupiah; lines: { amount: Rupiah }[] }): string[] {
  const sum = p.lines.reduce((t, l) => t + l.amount, 0);
  return p.opening + sum === p.closing ? [] : [`Saldo awal ${p.opening.toLocaleString('id-ID')} + mutasi ${sum.toLocaleString('id-ID')} ≠ saldo akhir ${p.closing.toLocaleString('id-ID')}.`];
}

/* ------------------------------------------------------------------ pencocokan */

export interface MatchStatementLine { id: number; date: string; amount: Rupiah; reference: string | null; description: string }
export interface MatchBookLine { id: number; date: string; amount: Rupiah; text: string }

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000;
const tokens = (s: string | null) => new Set(String(s ?? '').toUpperCase().split(/[^A-Z0-9-]+/).filter((t) => t.length >= 4 && /\d/.test(t)));

/**
 * Pencocokan otomatis satu-satu: jumlah bertanda sama persis, selisih tanggal
 * ≤ `days`; bila beberapa calon, pilih yang memuat nomor referensi yang sama,
 * lalu yang tanggalnya paling dekat. Baris yang sudah dipakai tidak dipakai lagi.
 */
export function autoMatch(stmt: MatchStatementLine[], book: MatchBookLine[], days = 3): { statementLineId: number; bookLineId: number }[] {
  const used = new Set<number>();
  const out: { statementLineId: number; bookLineId: number }[] = [];
  const order = [...stmt].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  for (const s of order) {
    const st = tokens(`${s.reference ?? ''} ${s.description}`);
    const cands = book.filter((b) => !used.has(b.id) && b.amount === s.amount && dayDiff(b.date, s.date) <= days)
      .map((b) => ({ b, ref: [...tokens(b.text)].some((t) => st.has(t)) ? 0 : 1, gap: dayDiff(b.date, s.date) }))
      .sort((x, y) => x.ref - y.ref || x.gap - y.gap || x.b.id - y.b.id);
    if (cands.length) { used.add(cands[0].b.id); out.push({ statementLineId: s.id, bookLineId: cands[0].b.id }); }
  }
  return out;
}

/**
 * Ringkasan rekonsiliasi bank: saldo rekening koran = saldo buku − transaksi buku
 * yang belum muncul di bank (setoran dalam perjalanan / cek beredar) + transaksi
 * bank yang belum dibukukan (belum dicocokkan / diabaikan). Selisih ≠ 0 berarti
 * saldo awal rekening koran tidak sama dengan saldo buku awal periode.
 */
export function bankRecSummary(p: { statementOpening: Rupiah; statementClosing: Rupiah; bookOpening: Rupiah; bookClosing: Rupiah; bookOnly: Rupiah[]; unmatched: Rupiah[]; ignored: Rupiah[] }) {
  const inTransit = p.bookOnly.filter((a) => a > 0).reduce((t, a) => t + a, 0);
  const outstanding = -p.bookOnly.filter((a) => a < 0).reduce((t, a) => t + a, 0);
  const unmatched = p.unmatched.reduce((t, a) => t + a, 0);
  const ignored = p.ignored.reduce((t, a) => t + a, 0);
  const adjustedBook = p.bookClosing - inTransit + outstanding + unmatched + ignored;
  const difference = p.statementClosing - adjustedBook;
  return { inTransit, outstanding, unmatched, ignored, adjustedBook, difference, openingDifference: p.statementOpening - p.bookOpening, balanced: difference === 0 };
}

/* ------------------------------------------------------------------ transfer & RK */

export interface TransferLeg { branch: string; lines: { account: string; debit: Rupiah; credit: Rupiah; bank?: string | null; counterBranch?: string | null }[] }

/**
 * Jurnal transfer kas/bank. Satu cabang → satu jurnal. Antar cabang → satu
 * jurnal per cabang, diseimbangkan dengan RK: kantor pusat memakai RK Cabang
 * (aset), cabang memakai RK Kantor Pusat (ekuitas), selalu dengan cabang lawan.
 */
export function transferLegs(t: { fromBranch: string; toBranch: string; fromGl: string; toGl: string; fromBank: string; toBank: string; amount: Rupiah; headOffice: string; rkBranch: string; rkHeadOffice: string }): TransferLeg[] {
  if (t.fromBranch === t.toBranch) {
    return [{ branch: t.fromBranch, lines: [{ account: t.toGl, debit: t.amount, credit: 0, bank: t.toBank }, { account: t.fromGl, debit: 0, credit: t.amount, bank: t.fromBank }] }];
  }
  const rkOf = (b: string) => (b === t.headOffice ? t.rkBranch : t.rkHeadOffice);
  return [
    { branch: t.fromBranch, lines: [{ account: rkOf(t.fromBranch), debit: t.amount, credit: 0, counterBranch: t.toBranch }, { account: t.fromGl, debit: 0, credit: t.amount, bank: t.fromBank }] },
    { branch: t.toBranch, lines: [{ account: t.toGl, debit: t.amount, credit: 0, bank: t.toBank }, { account: rkOf(t.toBranch), debit: 0, credit: t.amount, counterBranch: t.fromBranch }] },
  ];
}

/* ------------------------------------------------------------------ PPN */

export interface PpnBranchBalance { branch: string; output: Rupiah; input: Rupiah }

/**
 * Setoran PPN masa terpusat (pemusatan PPN di kantor pusat): tiap cabang
 * menutup saldo PPN keluaran & masukannya; selisihnya dipindah ke kantor pusat
 * lewat RK. Kantor pusat mencatat total kurang bayar sebagai utang pajak, atau
 * lebih bayar sebagai PPN masukan yang dikompensasikan ke masa berikutnya.
 */
export function ppnSettlementLegs(balances: PpnBranchBalance[], a: { headOffice: string; ppnOut: string; ppnIn: string; taxPayable: string; rkBranch: string; rkHeadOffice: string }) {
  const legs: TransferLeg[] = [];
  const hoLines: TransferLeg['lines'] = [];
  let total = 0;
  for (const b of balances) {
    const net = b.output - b.input;
    total += net;
    const own: TransferLeg['lines'] = [];
    if (b.output) own.push({ account: a.ppnOut, debit: b.output > 0 ? b.output : 0, credit: b.output < 0 ? -b.output : 0 });
    if (b.input) own.push({ account: a.ppnIn, debit: b.input < 0 ? -b.input : 0, credit: b.input > 0 ? b.input : 0 });
    if (b.branch === a.headOffice) { hoLines.push(...own); continue; }
    if (!own.length) continue;
    if (net) {
      own.push({ account: a.rkHeadOffice, debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, counterBranch: a.headOffice });
      hoLines.push({ account: a.rkBranch, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, counterBranch: b.branch });
    }
    legs.push({ branch: b.branch, lines: own });
  }
  if (total > 0) hoLines.push({ account: a.taxPayable, debit: 0, credit: total });
  else if (total < 0) hoLines.push({ account: a.ppnIn, debit: -total, credit: 0 });
  if (hoLines.length) legs.unshift({ branch: a.headOffice, lines: hoLines });
  return { legs, total };
}
