/**
 * Uji ujung-ke-ujung API terhadap basis data yang sudah di-seed:
 * autentikasi, izin, pembatasan cabang (RLS + guard), SoD posting, invarian
 * buku besar, laporan, dan rekonsiliasi. Menjalankan peladen sendiri.
 *
 *   npm run build && npm run test:e2e
 */
import { createApp } from '../main.js';
import { loadConfig } from '../config.js';
import { AssistantService } from '../assistant/assistant.service.js';

const cfg = loadConfig();
const PW = cfg.SEED_PASSWORD ?? 'Rahasia-2026!';
let failures = 0;
const ok = (cond: unknown, label: string, extra?: unknown) => {
  if (cond) console.log(`  ✓ ${label}`);
  else { failures += 1; console.log(`  ✗ ${label}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); }
};

async function main() {
  const app = await createApp();
  await app.listen(0);
  const base = `${await app.getUrl()}/api/v1`.replace('[::1]', '127.0.0.1');
  const call = async (path: string, init: RequestInit & { token?: string; branch?: string; period?: string } = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as any) };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.branch) headers['X-Branch-Id'] = init.branch;
    if (init.period) headers['X-Period-Id'] = init.period;
    const res = await fetch(base + path, { ...init, headers });
    const text = await res.text();
    let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, body, headers: res.headers };
  };
  const login = async (email: string) => {
    const r = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: PW }) });
    if (r.status !== 200) throw new Error(`login ${email} gagal: ${JSON.stringify(r.body)}`);
    return r.body.access_token as string;
  };

  console.log('Autentikasi');
  const bad = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'andi@knm.co.id', password: 'salah' }) });
  ok(bad.status === 401 && !JSON.stringify(bad.body).includes('stack'), 'kata sandi salah → 401 tanpa detail');
  ok((await call('/me')).status === 401, 'tanpa token → 401');
  const andi = await login('andi@knm.co.id');
  const sari = await login('sari@knm.co.id');
  const fitri = await login('fitri@knm.co.id');
  const taufik = await login('taufik@knm.co.id');
  const me = await call('/me', { token: andi });
  ok(me.status === 200 && me.body.user.permissions.includes('ledger.journal.post'), '/me memuat izin efektif');
  ok(me.headers.get('x-request-id'), 'setiap balasan membawa X-Request-Id');
  ok(me.headers.get('content-security-policy')?.includes("default-src 'none'"), 'header CSP ketat aktif');

  console.log('Otorisasi & pembatasan cabang');
  const f1 = await call('/reports/trial-balance', { token: fitri, branch: 'SBY' });
  ok(f1.status === 403, 'staf gudang tanpa izin laporan → 403', f1.status);
  const f2 = await call('/ledger/journals', { token: fitri, branch: 'CKR' });
  ok(f2.status === 403, 'staf gudang SBY mengakses cabang CKR → 403', f2.status);
  const s1 = await call('/reports/consolidation', { token: sari, branch: 'ALL' });
  ok(s1.status === 403, 'staf keuangan tanpa report.consolidated → 403 untuk konsolidasi', s1.status);
  const t1 = await call('/ledger/journals?size=5', { token: taufik, branch: 'MDN', period: '2026-08' });
  ok(t1.status === 200 && t1.body.data.length > 0 && t1.body.data.every((j: any) => j.branch === 'MDN'), 'manajer Medan hanya melihat jurnal Medan', t1.body?.meta);
  const t2 = await call('/ledger/journals?size=50', { token: taufik, branch: 'ALL', period: '2026-08' });
  ok(t2.status === 200 && t2.body.data.length > 0 && t2.body.data.every((j: any) => j.branch === 'MDN'), 'konteks "semua cabang" bagi manajer Medan tetap dibatasi RLS ke Medan', t2.body?.meta);
  const t3 = await call('/reports/trial-balance', { token: taufik, branch: 'ALL', period: '2026-08' });
  const t4 = await call('/reports/trial-balance', { token: andi, branch: 'MDN', period: '2026-08' });
  ok(t3.status === 200 && t3.body.totals.endD === t4.body.totals.endD, 'neraca saldo "semua cabang" manajer Medan = neraca saldo Medan (RLS di lapisan SQL)', [t3.body?.totals?.endD, t4.body?.totals?.endD]);

  console.log('Laporan & invarian');
  for (const branch of ['ALL', 'JKT', 'CKR', 'SBY', 'MDN']) {
    const tb = await call('/reports/trial-balance', { token: andi, branch, period: '2026-08' });
    const bs = await call('/reports/balance-sheet', { token: andi, branch, period: '2026-08' });
    ok(tb.status === 200 && tb.body.balanced, `neraca saldo ${branch} seimbang`, tb.body?.totals ?? tb.body);
    ok(bs.status === 200 && bs.body.balanced, `neraca ${branch} seimbang`, bs.body?.totalAssets ?? bs.body);
  }
  const tbAll = await call('/reports/trial-balance', { token: andi, branch: 'ALL', period: '2026-08' });
  ok(tbAll.body.totals.endD > 60e9 && tbAll.body.totals.endD === tbAll.body.totals.endK, 'total neraca saldo konsolidasi sesuai golden dataset', tbAll.body.totals);
  const cons = await call('/reports/consolidation', { token: andi, branch: 'ALL', period: '2026-08' });
  ok(cons.status === 200 && cons.body.intercompanyMismatch === 0 && cons.body.balanceSheet.eliminations.length === 2, 'konsolidasi: RK antar kantor tereliminasi', cons.body?.intercompanyMismatch ?? cons.body);
  const pl = await call('/reports/income-statement', { token: andi, branch: 'ALL', period: '2026' });
  ok(pl.status === 200 && pl.body.net > 0 && pl.body.revenue > 30e9, 'laba rugi TA 2026 dari buku besar', pl.body?.net ?? pl.body);
  const rec = await call('/reports/reconciliation', { token: andi, branch: 'ALL', period: '2026-08' });
  /* Pemeriksaan potret (stok, aset, gaji) hanya muncul untuk periode termutakhir buku besar → 7 atau 11. */
  ok(rec.status === 200 && [7, 11].includes(rec.body.checks.length) && rec.body.checks.every((k: any) => k.ok), 'rekonsiliasi sub-buku cocok', rec.body?.checks?.filter((k: any) => !k.ok) ?? rec.body);
  const card = await call('/ledger/accounts/1-1100/card?bank=BNK-001', { token: andi, branch: 'JKT', period: '2026-08' });
  ok(card.status === 200 && card.body.lines.length > 0 && card.body.ending === card.body.lines.at(-1).balance, 'kartu buku besar rekening dengan saldo berjalan', card.body?.error);
  const kpi = await call('/reports/kpis', { token: andi, branch: 'CKR', period: '2026-08' });
  ok(kpi.status === 200 && kpi.body.revenue > 0 && kpi.body.monthlyRevenue.length === 12, 'KPI dasbor cabang', kpi.body?.error);

  console.log('Jurnal memorial & pemisahan tugas');
  const draft = { date: '2026-08-14', branch: 'JKT', description: 'Uji e2e: perlengkapan kantor dari kas kecil', lines: [
    { account: '5-3700', debit: 250000, credit: 0 }, { account: '1-1100', debit: 0, credit: 250000, bankAccountId: 'BNK-007' }] };
  const created = await call('/ledger/journals', { method: 'POST', token: sari, branch: 'JKT', body: JSON.stringify(draft) });
  ok(created.status === 201 && created.body.status === 'pending', 'staf keuangan membuat jurnal → pending', created.body);
  const jid = created.body.id;
  const own = await call(`/ledger/journals/${jid}/post`, { method: 'POST', token: sari, branch: 'JKT' });
  ok(own.status === 403, 'pembuat tidak dapat memposting (SoD / tanpa izin)', own.status);
  const posted = await call(`/ledger/journals/${jid}/post`, { method: 'POST', token: andi, branch: 'JKT' });
  ok(posted.status === 200 && posted.body.status === 'posted' && posted.body.total === 250000, 'akuntan senior memposting jurnal', posted.body);
  const closed = await call('/ledger/journals', { method: 'POST', token: sari, branch: 'JKT', body: JSON.stringify({ ...draft, date: '2026-07-10' }) });
  ok(closed.status === 422 && /ditutup/.test(JSON.stringify(closed.body)), 'jurnal ke periode tertutup ditolak', closed.body);
  const unbalanced = await call('/ledger/journals', { method: 'POST', token: sari, branch: 'JKT', body: JSON.stringify({ ...draft, lines: [{ ...draft.lines[0], debit: 300000 }, draft.lines[1]] }) });
  ok(unbalanced.status === 422 && /seimbang/.test(JSON.stringify(unbalanced.body)), 'jurnal tidak seimbang ditolak', unbalanced.body);
  const header = await call('/ledger/journals', { method: 'POST', token: sari, branch: 'JKT', body: JSON.stringify({ ...draft, lines: [{ account: '5-0000', debit: 250000, credit: 0 }, draft.lines[1]] }) });
  ok(header.status === 422 && /header/.test(JSON.stringify(header.body)), 'akun header ditolak', header.body);
  const noBank = await call('/ledger/journals', { method: 'POST', token: sari, branch: 'JKT', body: JSON.stringify({ ...draft, lines: [draft.lines[0], { account: '1-1100', debit: 0, credit: 250000 }] }) });
  ok(noBank.status === 422 && /rekening/.test(JSON.stringify(noBank.body)), 'baris kas tanpa rekening ditolak', noBank.body);
  const wrongBranch = await call('/ledger/journals', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify(draft) });
  ok(wrongBranch.status === 403, 'jurnal cabang JKT dari konteks CKR ditolak', wrongBranch.status);
  const rev = await call(`/ledger/journals/${jid}/reverse`, { method: 'POST', token: andi, branch: 'JKT', body: JSON.stringify({ reason: 'uji pembalikan', date: '2026-08-14' }) });
  ok(rev.status === 201 && rev.body.status === 'posted' && rev.body.lines[0].credit === 250000, 'jurnal balik terposting dengan sisi tertukar', rev.body);
  const orig = await call(`/ledger/journals/${jid}`, { token: andi, branch: 'JKT' });
  ok(orig.body.status === 'reversed' && orig.body.reversedByJournalId === rev.body.id, 'jurnal asal berstatus dibalik');
  const recAfter = await call('/reports/reconciliation', { token: andi, branch: 'ALL', period: '2026-08' });
  ok(recAfter.body.checks.every((k: any) => k.ok), 'rekonsiliasi tetap cocok setelah jurnal & pembalikan');
  const audit = await call('/admin/audit-log?entity=journal&size=5', { token: andi, branch: 'ALL' });
  ok(audit.status === 200 && audit.body.meta.chain.brokenAt === null && audit.body.data.some((a: any) => a.action === 'journal.reversed'), 'jejak audit tercatat dan rantai hash utuh', audit.body?.meta);

  console.log('Manajemen cabang');
  const admin = await login('admin@knm.co.id');
  const code = 'Z' + String.fromCharCode(65 + (Date.now() % 26)) + String.fromCharCode(65 + (Math.floor(Date.now() / 26) % 26));
  const br = await call('/branches', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code: code.toLowerCase(), name: 'Bandung — Cabang', type: 'Cabang penjualan', city: 'Bandung', targetMonthly: 150000000 }) });
  ok(br.status === 201 && br.body.code === code, 'cabang baru dibuat dengan giro & kas kecil', br.body);
  const dup = await call('/branches', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code, name: 'Dup', type: 'xxx', city: 'yy' }) });
  ok(dup.status === 409, 'kode cabang ganda → 409', dup.status);
  const cons2 = await call('/reports/consolidation', { token: andi, branch: 'ALL', period: '2026-08' });
  ok(cons2.body.branches.some((b: any) => b.code === code) && cons2.body.balanceSheet.combined.balanced, 'konsolidasi memuat cabang baru dan tetap seimbang');
  const off = await call(`/branches/${code}`, { method: 'PATCH', token: admin, branch: 'ALL', body: JSON.stringify({ status: 'nonaktif', reason: 'uji' }) });
  ok(off.status === 200 && off.body.status === 'nonaktif', 'cabang dinonaktifkan', off.body);


  console.log('CRUD data induk: bagan akun');
  const accs = (await call('/ledger/accounts', { token: admin, branch: 'ALL', period: '2026-08' })).body.accounts;
  const denyAcc = await call('/ledger/accounts', { method: 'POST', token: andi, branch: 'ALL', body: JSON.stringify({ code: '5-3990', name: 'Uji', type: 'detail', parentCode: '5-3000' }) });
  ok(denyAcc.status === 403, 'akuntan tanpa ledger.account.manage tidak dapat menambah akun', denyAcc.status);
  const newCode = `5-39${String(Date.now() % 90 + 10)}`;
  const cAcc = await call('/ledger/accounts', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code: newCode, name: 'Beban Uji Otomatis', type: 'detail', parentCode: '5-3000' }) });
  const parent = accs.find((a: any) => a.code === '5-3000');
  ok(cAcc.status === 201 && cAcc.body.category === 'Beban' && cAcc.body.level === parent.level + 1 && cAcc.body.normalSide === parent.normalSide, 'akun baru mewarisi kategori, level, dan sisi normal induk', cAcc.body);
  ok((await call('/ledger/accounts', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code: newCode, name: 'Dup', type: 'detail', parentCode: '5-3000' }) })).status === 409, 'kode akun ganda → 409');
  const badCat = await call('/ledger/accounts', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code: '4-3991', name: 'Salah kelompok', type: 'detail', parentCode: '5-3000' }) });
  ok(badCat.status === 422 && badCat.body.error.code === 'ACCOUNT_CODE_CATEGORY', 'kode akun harus sekelompok dengan induk', badCat.body);
  const someDetail = accs.find((a: any) => a.type === 'detail' && a.category === 'Beban' && !a.isComputed);
  const badParent = await call('/ledger/accounts', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code: '5-3992', name: 'Induk detail', type: 'detail', parentCode: someDetail.code }) });
  ok(badParent.status === 422 && badParent.body.error.code === 'ACCOUNT_PARENT_DETAIL', 'akun tidak dapat dibuat di bawah akun detail', badParent.body);
  const accBadShape = await call('/ledger/accounts', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code: '53990', name: 'x', type: 'detail', parentCode: '5-3000' }) });
  ok(accBadShape.status === 400 || accBadShape.status === 422, 'format kode & nama divalidasi', accBadShape.status);
  const renamed = await call(`/ledger/accounts/${newCode}`, { method: 'PATCH', token: admin, branch: 'ALL', body: JSON.stringify({ name: 'Beban Uji Otomatis (ubah)', reason: 'uji ubah nama' }) });
  ok(renamed.status === 200 && renamed.body.name === 'Beban Uji Otomatis (ubah)', 'nama akun dapat diubah', renamed.body);
  const accOff = await call(`/ledger/accounts/${newCode}`, { method: 'PATCH', token: admin, branch: 'ALL', body: JSON.stringify({ status: 'nonaktif', reason: 'uji nonaktif' }) });
  ok(accOff.status === 200 && accOff.body.status === 'nonaktif', 'akun tanpa saldo dapat dinonaktifkan', accOff.body);
  const sariX = await login('sari@knm.co.id');
  const jInactive = await call('/ledger/journals', { method: 'POST', token: sariX, branch: 'JKT', body: JSON.stringify({ date: '2026-09-10', branch: 'JKT', description: 'Uji akun nonaktif', lines: [{ account: newCode, debit: 1000, credit: 0 }, { account: '2-1100', debit: 0, credit: 1000 }] }) });
  ok(jInactive.status === 422 && /nonaktif/.test(JSON.stringify(jInactive.body)), 'jurnal ke akun nonaktif ditolak', jInactive.body);
  const on1 = await call(`/ledger/accounts/${newCode}`, { method: 'PATCH', token: admin, branch: 'ALL', body: JSON.stringify({ status: 'aktif', reason: 'uji aktif' }) });
  ok(on1.status === 200 && on1.body.status === 'aktif', 'akun dapat diaktifkan kembali');
  const delAcc = await call(`/ledger/accounts/${newCode}`, { method: 'DELETE', token: admin, branch: 'ALL', body: JSON.stringify({ reason: 'uji hapus' }) });
  const after = (await call('/ledger/accounts', { token: admin, branch: 'ALL' })).body.accounts;
  ok(delAcc.status === 200 && !after.some((a: any) => a.code === newCode), 'akun yang belum dipakai dapat dihapus', delAcc.body);
  const delSys = await call('/ledger/accounts/1-1100', { method: 'DELETE', token: admin, branch: 'ALL', body: JSON.stringify({ reason: 'uji' }) });
  ok(delSys.status === 403, 'akun sistem tidak dapat dihapus', delSys.status);
  const used = accs.find((a: any) => a.type === 'detail' && a.category === 'Beban' && a.balance !== 0 && !a.isComputed);
  const delUsed = await call(`/ledger/accounts/${used.code}`, { method: 'DELETE', token: admin, branch: 'ALL', body: JSON.stringify({ reason: 'uji' }) });
  ok(delUsed.status === 422 && delUsed.body.error.code === 'ACCOUNT_IN_USE', 'akun yang sudah dipakai jurnal tidak dapat dihapus', delUsed.body);
  const offUsed = await call(`/ledger/accounts/${used.code}`, { method: 'PATCH', token: admin, branch: 'ALL', body: JSON.stringify({ status: 'nonaktif', reason: 'uji' }) });
  ok(offUsed.status === 422 && offUsed.body.error.code === 'ACCOUNT_HAS_BALANCE', 'akun bersaldo tidak dapat dinonaktifkan', offUsed.body);
  const delNoReason = await call(`/ledger/accounts/${used.code}`, { method: 'DELETE', token: admin, branch: 'ALL', body: JSON.stringify({}) });
  ok(delNoReason.status === 400 || delNoReason.status === 422, 'hapus tanpa alasan ditolak', delNoReason.status);

  console.log('CRUD data induk: rekening kas & bank');
  const bankCode = `BNK-CKR-U${String(Date.now() % 1000)}`;
  const cBank = await call('/ledger/bank-accounts', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code: bankCode.toLowerCase(), branch: 'ckr', name: 'Mandiri — Rekening Uji', bankName: 'Mandiri', accountNoLast4: '4321' }) });
  ok(cBank.status === 201 && cBank.body.code === bankCode && cBank.body.branchCode === 'CKR' && cBank.body.accountNoMasked === '••••4321', 'rekening baru dibuat (kode & cabang dinormalkan, nomor tersamar)', cBank.body);
  ok((await call('/ledger/bank-accounts', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code: bankCode, branch: 'CKR', name: 'Dup rekening', bankName: 'BCA' }) })).status === 409, 'kode rekening ganda → 409');
  const scopedBank = await call('/ledger/bank-accounts', { method: 'POST', token: admin, branch: 'JKT', body: JSON.stringify({ code: 'BNK-CKR-X1', branch: 'CKR', name: 'Beda konteks', bankName: 'BCA' }) });
  ok(scopedBank.status === 403, 'rekening cabang lain tidak dapat dibuat dari konteks cabang berbeda', scopedBank.status);
  const eBank = await call(`/ledger/bank-accounts/${bankCode}`, { method: 'PATCH', token: admin, branch: 'ALL', body: JSON.stringify({ name: 'Mandiri — Rekening Uji (ubah)', accountNoLast4: '9876', reason: 'uji ubah' }) });
  ok(eBank.status === 200 && eBank.body.name.endsWith('(ubah)') && eBank.body.accountNoMasked === '••••9876', 'data rekening dapat diubah', eBank.body);
  const offBank = await call(`/ledger/bank-accounts/${bankCode}`, { method: 'PATCH', token: admin, branch: 'ALL', body: JSON.stringify({ status: 'nonaktif', reason: 'uji' }) });
  ok(offBank.status === 200 && offBank.body.status === 'nonaktif', 'rekening tanpa saldo dapat dinonaktifkan');
  const jBank = await call('/ledger/journals', { method: 'POST', token: sariX, branch: 'CKR', body: JSON.stringify({ date: '2026-09-10', branch: 'CKR', description: 'Uji rekening nonaktif', lines: [{ account: '1-1100', debit: 1000, credit: 0, bankAccountId: bankCode }, { account: '2-1100', debit: 0, credit: 1000 }] }) });
  ok(jBank.status === 422 && /nonaktif/.test(JSON.stringify(jBank.body)), 'jurnal ke rekening nonaktif ditolak', jBank.body);
  const delBank = await call(`/ledger/bank-accounts/${bankCode}`, { method: 'DELETE', token: admin, branch: 'ALL', body: JSON.stringify({ reason: 'uji hapus' }) });
  ok(delBank.status === 200, 'rekening yang belum dipakai dapat dihapus', delBank.body);
  const jktBranch = (await call('/branches', { token: admin })).body.find((b: any) => b.code === 'JKT');
  const delMain = await call(`/ledger/bank-accounts/${jktBranch.mainBankAccountId}`, { method: 'DELETE', token: admin, branch: 'ALL', body: JSON.stringify({ reason: 'uji' }) });
  ok(delMain.status === 422 && delMain.body.error.code === 'BANK_IS_BRANCH_MAIN', 'rekening utama cabang tidak dapat dihapus', delMain.body);
  ok((await call('/ledger/bank-accounts', { method: 'POST', token: andi, branch: 'ALL', body: JSON.stringify({ code: 'BNK-JKT-ZZ', branch: 'JKT', name: 'Tanpa izin', bankName: 'BCA' }) })).status === 403, 'tanpa ledger.account.manage tidak dapat menambah rekening');

  console.log('CRUD cabang & periode');
  const eBr = await call('/branches/MDN', { method: 'PATCH', token: admin, body: JSON.stringify({ city: 'Medan Kota', phone: '061-555-0101', address: 'Jl. Uji No. 1', type: 'Cabang penjualan', shortName: 'Medan', reason: 'uji ubah cabang' }) });
  ok(eBr.status === 200 && eBr.body.city === 'Medan Kota' && eBr.body.phone === '061-555-0101' && eBr.body.address === 'Jl. Uji No. 1', 'data cabang dapat diubah lengkap', eBr.body);
  await call('/branches/MDN', { method: 'PATCH', token: admin, body: JSON.stringify({ city: 'Medan', reason: 'uji kembalikan' }) });
  const clP = await call('/periods/2026-12/close', { method: 'POST', token: andi, body: JSON.stringify({ reason: 'uji tutup' }) });
  ok(clP.status === 200 && clP.body.status === 'closed', 'akuntan senior menutup periode', clP.body);
  const reAndi = await call('/periods/2026-12/reopen', { method: 'POST', token: andi, body: JSON.stringify({ reason: 'uji' }) });
  ok(reAndi.status === 403, 'penutup periode tidak dapat membuka kembali (izin terpisah)', reAndi.status);
  const reAdm = await call('/periods/2026-12/reopen', { method: 'POST', token: admin, body: JSON.stringify({ reason: 'uji buka' }) });
  ok(reAdm.status === 200 && reAdm.body.status === 'open', 'admin membuka kembali periode', reAdm.body);

  console.log('Paginasi API');
  const p1 = await call('/ledger/journals?page=1&size=10', { token: andi, branch: 'ALL', period: '2026-08' });
  const p2 = await call('/ledger/journals?page=2&size=10', { token: andi, branch: 'ALL', period: '2026-08' });
  ok(p1.body.data.length === 10 && p2.body.data.length === 10 && !p1.body.data.some((j: any) => p2.body.data.some((k: any) => k.id === j.id)) && p1.body.meta.total > 20, 'jurnal berpaginasi di server tanpa tumpang tindih', p1.body.meta);
  const al = await call('/admin/audit-log?page=1&size=5', { token: andi, branch: 'ALL' });
  ok(al.status === 200 && al.body.data.length === 5 && al.body.meta.total >= 5, 'jejak audit berpaginasi dan melaporkan total', al.body.meta);


  console.log('Pengguna, peran & pengaturan');
  /* Setiap percobaan masuk di bagian ini memakai alamat klien sendiri agar tidak terkena batas laju login per IP. */
  let ipSeq = 0;
  const authCall = (email: string, password: string) => call('/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': `10.77.0.${(ipSeq += 1) % 250 + 1}` }, body: JSON.stringify({ email, password }) });
  ok((await call('/admin/users', { token: andi })).status === 403, 'tanpa admin.user.manage tidak dapat melihat pengguna');
  /* Rotasi & deteksi pemakaian ulang refresh token (K-05). */
  const ro = await authCall('osmond@knm.co.id', PW);
  const cookieOf = (r: any) => (r.headers.getSetCookie?.() ?? []).find((c: string) => c.startsWith('erp_refresh='))?.split(';')[0];
  const ck1 = cookieOf(ro);
  const rr1 = await call('/auth/refresh', { method: 'POST', headers: { Cookie: ck1 } });
  const ck2 = cookieOf(rr1);
  ok(ro.status === 200 && rr1.status === 200 && ck2 && ck2 !== ck1, 'refresh token dirotasi setiap dipakai', { a: ro.status, b: rr1.status });
  ok((await call('/auth/refresh', { method: 'POST', headers: { Cookie: ck1 } })).status === 401, 'refresh token lama yang dipakai ulang ditolak');
  ok((await call('/auth/refresh', { method: 'POST', headers: { Cookie: ck2 } })).status === 401, 'pemakaian ulang mencabut seluruh sesi pengguna (termasuk sesi terbaru)');
  ok((await call('/me', { token: rr1.body.access_token })).status === 401, 'token akses dari sesi yang dicabut ditolak');

  const ulist = await call('/admin/users', { token: admin });
  ok(ulist.status === 200 && ulist.body.some((x: any) => x.email === 'andi@knm.co.id' && x.roles.length > 0) && !ulist.body.some((x: any) => x.email.startsWith('sistem@')), 'daftar pengguna memuat peran & menyembunyikan akun sistem', ulist.body?.length);
  const email = `uji.${Date.now()}@knm.co.id`;
  const cu = await call('/admin/users', { method: 'POST', token: admin, body: JSON.stringify({ email, name: 'Pengguna Uji', roles: [{ role: 'staf_keuangan', branch: 'jkt' }] }) });
  ok(cu.status === 201 && typeof cu.body.temporaryPassword === 'string' && cu.body.temporaryPassword.length >= 12, 'pengguna baru dibuat dengan kata sandi sementara', cu.body);
  ok((await call('/admin/users', { method: 'POST', token: admin, body: JSON.stringify({ email: email.toUpperCase(), name: 'Dup', roles: [{ role: 'manajer', branch: 'ALL' }] }) })).status === 409, 'email ganda (beda huruf besar/kecil) → 409');
  const weak = await call('/admin/users', { method: 'POST', token: admin, body: JSON.stringify({ email: `lemah.${Date.now()}@knm.co.id`, name: 'Lemah', password: 'pendek1', roles: [{ role: 'manajer', branch: 'ALL' }] }) });
  ok(weak.status === 422 && weak.body.error.code === 'PASSWORD_WEAK', 'kata sandi lemah ditolak', weak.body);
  const sod = await call('/admin/users', { method: 'POST', token: admin, body: JSON.stringify({ email: `sod.${Date.now()}@knm.co.id`, name: 'SoD', roles: [{ role: 'akuntan_senior', branch: 'ALL' }, { role: 'admin', branch: 'ALL' }] }) });
  ok(sod.status === 422 && sod.body.error.code === 'SOD_CONFLICT', 'kombinasi peran yang melanggar pemisahan tugas ditolak', sod.body);
  const noRole = await call('/admin/users', { method: 'POST', token: admin, body: JSON.stringify({ email: `nr.${Date.now()}@knm.co.id`, name: 'Tanpa peran', roles: [] }) });
  ok(noRole.status === 400 || noRole.status === 422, 'pengguna tanpa peran ditolak', noRole.status);

  const tmpPw = cu.body.temporaryPassword;
  const lg = await authCall(email, tmpPw);
  ok(lg.status === 200 && lg.body.user.mustChangePassword === true, 'masuk dengan kata sandi sementara → wajib ganti', lg.body?.user);
  const ut = lg.body.access_token;
  const blocked = await call('/ledger/journals', { token: ut, branch: 'JKT' });
  ok(blocked.status === 403 && blocked.body.error.code === 'PASSWORD_CHANGE_REQUIRED', 'sebelum ganti kata sandi, data lain terkunci', blocked.body);
  ok((await call('/me', { token: ut })).status === 200, 'profil tetap dapat dibaca');
  const wrongCur = await call('/me/password', { method: 'POST', token: ut, body: JSON.stringify({ currentPassword: 'salah-12345678', newPassword: 'SandiBaru-2026-xyz' }) });
  ok(wrongCur.status === 422 && wrongCur.body.error.code === 'PASSWORD_WRONG', 'kata sandi lama salah ditolak', wrongCur.body);
  const weakNew = await call('/me/password', { method: 'POST', token: ut, body: JSON.stringify({ currentPassword: tmpPw, newPassword: 'abc' }) });
  ok(weakNew.status === 422 && weakNew.body.error.code === 'PASSWORD_WEAK', 'kata sandi baru yang lemah ditolak', weakNew.body);
  const chg = await call('/me/password', { method: 'POST', token: ut, body: JSON.stringify({ currentPassword: tmpPw, newPassword: 'SandiBaru-2026-xyz' }) });
  ok(chg.status === 200, 'kata sandi diganti', chg.body);
  const afterChg = await call('/ledger/journals?size=5', { token: ut, branch: 'JKT', period: '2026-08' });
  ok(afterChg.status === 200 && (await call('/me', { token: ut })).body.user.mustChangePassword === false, 'setelah diganti, akses normal sesuai peran');
  ok((await call('/ledger/journals', { token: ut, branch: 'SBY' })).status === 403, 'pengguna cabang Jakarta tidak dapat membuka Surabaya');

  const patched = await call(`/admin/users/${cu.body.id}`, { method: 'PATCH', token: admin, body: JSON.stringify({ name: 'Pengguna Uji Diubah', roles: [{ role: 'manajer', branch: 'ALL' }], reason: 'uji ubah peran' }) });
  ok(patched.status === 200 && patched.body.name === 'Pengguna Uji Diubah' && patched.body.roles[0].role === 'manajer', 'nama & peran pengguna diubah', patched.body);
  ok((await call('/me', { token: ut })).status === 401, 'perubahan peran mencabut sesi lama');
  const rs = await call(`/admin/users/${cu.body.id}/reset-password`, { method: 'POST', token: admin, body: JSON.stringify({ reason: 'uji reset' }) });
  ok(rs.status === 200 && rs.body.temporaryPassword, 'reset kata sandi menghasilkan kata sandi sementara baru', rs.body);
  const lg2 = await authCall(email, rs.body.temporaryPassword);
  ok(lg2.status === 200 && lg2.body.user.mustChangePassword === true, 'hasil reset kembali wajib ganti kata sandi');
  ok((await authCall(email, 'SandiBaru-2026-xyz')).status === 401, 'kata sandi lama tidak berlaku setelah reset');
  for (let i = 0; i < 5; i += 1) await authCall(email, 'salah-salah-123');
  const locked = await authCall(email, rs.body.temporaryPassword);
  ok(locked.status === 423, 'akun terkunci setelah 5 kali gagal', locked.status);
  const lockedRow = (await call('/admin/users', { token: admin })).body.find((x: any) => x.id === cu.body.id);
  ok(lockedRow.locked === true, 'status terkunci terlihat di daftar pengguna', lockedRow);
  ok((await call(`/admin/users/${cu.body.id}/unlock`, { method: 'POST', token: admin, body: JSON.stringify({ reason: 'uji buka kunci' }) })).status === 200, 'admin membuka kunci akun');
  ok((await authCall(email, rs.body.temporaryPassword)).status === 200, 'setelah dibuka, pengguna dapat masuk');
  const deact = await call(`/admin/users/${cu.body.id}`, { method: 'PATCH', token: admin, body: JSON.stringify({ status: 'nonaktif', reason: 'uji nonaktif' }) });
  ok(deact.status === 200 && deact.body.status === 'nonaktif', 'pengguna dinonaktifkan');
  ok((await authCall(email, rs.body.temporaryPassword)).status === 401, 'pengguna nonaktif tidak dapat masuk');
  const me2 = (await call('/me', { token: admin })).body.user;
  ok((await call(`/admin/users/${me2.id}`, { method: 'PATCH', token: admin, body: JSON.stringify({ status: 'nonaktif', reason: 'uji' }) })).status === 403, 'admin tidak dapat menonaktifkan dirinya sendiri');
  const lastAdm = await call(`/admin/users/${me2.id}`, { method: 'PATCH', token: admin, body: JSON.stringify({ roles: [{ role: 'manajer', branch: 'ALL' }], reason: 'uji' }) });
  ok(lastAdm.status === 422 && lastAdm.body.error.code === 'LAST_ADMIN', 'admin terakhir tidak dapat melepas hak admin', lastAdm.body);

  const roles = await call('/admin/roles', { token: admin });
  ok(roles.status === 200 && roles.body[0].code === 'admin' && roles.body.find((r: any) => r.code === 'admin').permissions.includes('admin.settings.manage'), 'daftar peran memuat izin & jumlah pengguna', roles.body?.[0]);
  ok((await call('/admin/roles', { token: sariX })).status === 403, 'staf tanpa hak admin tidak dapat melihat peran');
  const rc = `auditor_${Date.now() % 100000}`;
  const cr = await call('/admin/roles', { method: 'POST', token: admin, body: JSON.stringify({ code: rc, name: 'Auditor Internal Uji', permissions: ['admin.audit.read', 'ledger.report.read'] }) });
  ok(cr.status === 201 && cr.body.permissions.length === 2 && cr.body.users === 0, 'peran baru dibuat', cr.body);
  const rSod = await call('/admin/roles', { method: 'POST', token: admin, body: JSON.stringify({ code: `${rc}x`, name: 'Peran SoD', permissions: ['ledger.period.close', 'ledger.period.reopen'] }) });
  ok(rSod.status === 422 && rSod.body.error.code === 'SOD_CONFLICT', 'peran yang melanggar pemisahan tugas ditolak', rSod.body);
  const rUnk = await call('/admin/roles', { method: 'POST', token: admin, body: JSON.stringify({ code: `${rc}y`, name: 'Peran salah', permissions: ['hack.everything'] }) });
  ok(rUnk.status === 422 && rUnk.body.error.code === 'PERMISSION_UNKNOWN', 'izin tak dikenal ditolak', rUnk.body);
  const rp = await call(`/admin/roles/${rc}`, { method: 'PATCH', token: admin, body: JSON.stringify({ name: 'Auditor Internal', permissions: ['admin.audit.read', 'ledger.report.read', 'ledger.journal.read'], reason: 'uji matriks' }) });
  ok(rp.status === 200 && rp.body.permissions.includes('ledger.journal.read') && rp.body.name === 'Auditor Internal', 'izin & nama peran diubah', rp.body);
  const admStrip = await call('/admin/roles/admin', { method: 'PATCH', token: admin, body: JSON.stringify({ permissions: ['admin.audit.read'], reason: 'uji' }) });
  ok(admStrip.status === 403, 'peran Admin Sistem tidak dapat kehilangan hak kelola pengguna/peran', admStrip.status);
  const holder = await call('/admin/users', { method: 'POST', token: admin, body: JSON.stringify({ email: `h.${Date.now()}@knm.co.id`, name: 'Pemegang', roles: [{ role: 'akuntan_senior', branch: 'ALL' }, { role: rc, branch: 'ALL' }] }) });
  ok(holder.status === 201, 'pengguna dengan dua peran dibuat');
  const hSod = await call(`/admin/roles/${rc}`, { method: 'PATCH', token: admin, body: JSON.stringify({ permissions: ['admin.audit.read', 'ledger.period.reopen'], reason: 'uji' }) });
  ok(hSod.status === 422 && hSod.body.error.code === 'SOD_CONFLICT', 'perubahan peran yang membuat pemegangnya melanggar SoD ditolak', hSod.body);
  const roleDelUsed = await call(`/admin/roles/${rc}`, { method: 'DELETE', token: admin, body: JSON.stringify({ reason: 'uji' }) });
  ok(roleDelUsed.status === 422 && roleDelUsed.body.error.code === 'ROLE_IN_USE', 'peran yang dipakai tidak dapat dihapus', roleDelUsed.body);
  await call(`/admin/users/${holder.body.id}`, { method: 'PATCH', token: admin, body: JSON.stringify({ roles: [{ role: 'akuntan_senior', branch: 'ALL' }], status: 'nonaktif', reason: 'uji lepas peran' }) });
  ok((await call(`/admin/roles/${rc}`, { method: 'DELETE', token: admin, body: JSON.stringify({ reason: 'uji hapus' }) })).status === 200, 'peran yang tidak dipakai dihapus');
  ok((await call('/admin/roles/admin', { method: 'DELETE', token: admin, body: JSON.stringify({ reason: 'uji' }) })).status === 403, 'peran Admin Sistem tidak dapat dihapus');
  const cat = await call('/admin/permissions', { token: andi });
  ok(cat.status === 200 && cat.body.groups.flatMap((g: any) => g.items).length >= 28, 'katalog izin berlabel tersedia');

  const settingsRead = await call('/settings', { token: andi });
  ok(settingsRead.status === 200 && settingsRead.body.baseCurrency === 'IDR' && typeof settingsRead.body.policies.salesApprovalThreshold === 'number', 'pengaturan dapat dibaca', settingsRead.body);
  ok((await call('/settings', { method: 'PATCH', token: andi, body: JSON.stringify({ npwp: '01.234.567.8-052.000' }) })).status === 403, 'tanpa admin.settings.manage tidak dapat mengubah pengaturan');
  const sp = await call('/settings', { method: 'PATCH', token: admin, body: JSON.stringify({ npwp: '01.234.567.8-052.000', address: 'Jl. Industri Raya No. 42, Cikarang', phone: '021-555-0000', policies: { salesApprovalThreshold: 200000000, allowPartialShipment: true } }) });
  ok(sp.status === 200 && sp.body.npwp === '01.234.567.8-052.000' && sp.body.policies.salesApprovalThreshold === 200000000 && sp.body.policies.allowPartialShipment === true && sp.body.policies.blockOverCreditLimit === true, 'profil & kebijakan disimpan (kebijakan lain tetap)', sp.body);
  const badMail = await call('/settings', { method: 'PATCH', token: admin, body: JSON.stringify({ email: 'bukan-email' }) });
  ok(badMail.status === 400 || badMail.status === 422, 'email pengaturan divalidasi', badMail.status);

  console.log('Penjualan & piutang');
  {
    const tag = Date.now().toString(36);
    const osmond = (await authCall('osmond@knm.co.id', PW)).body.access_token as string;
    const pol0 = (await call('/settings', { token: admin })).body.policies;
    await call('/settings', { method: 'PATCH', token: admin, body: JSON.stringify({ policies: { salesApprovalThreshold: 150_000_000, blockOverCreditLimit: true } }) });
    const D = '2026-09-20';

    /* Data induk */
    const custs = await call('/sales/customers', { token: sari, branch: 'ALL' });
    ok(custs.status === 200 && custs.body.length >= 11 && typeof custs.body[0].exposure?.total === 'number', 'daftar pelanggan dengan eksposur kredit', custs.body?.[0]);
    ok((await call('/sales/customers', { token: fitri, branch: 'SBY' })).status === 403, 'staf gudang tanpa izin penjualan → 403');
    const custBody = { name: `PT Uji Penjualan ${tag}`, segment: 'Langsung', city: 'Bekasi', branch: 'CKR', creditLimit: 50_000_000, termsDays: 30 };
    ok((await call('/sales/customers', { method: 'POST', token: sari, body: JSON.stringify(custBody) })).status === 403, 'staf tanpa sales.customer.manage tidak dapat menambah pelanggan');
    const zero = await call('/sales/customers', { method: 'POST', token: osmond, body: JSON.stringify({ ...custBody, creditLimit: 0 }) });
    ok(zero.status === 422, 'pelanggan aktif wajib berplafon > 0', zero.body);
    const cu = await call('/sales/customers', { method: 'POST', token: osmond, body: JSON.stringify(custBody) });
    ok(cu.status === 201 && /^CUST-\d{4}$/.test(cu.body.code), 'manajer menambah pelanggan (kode otomatis)', cu.body);
    ok((await call('/sales/customers', { method: 'POST', token: osmond, body: JSON.stringify(custBody) })).status === 409, 'nama pelanggan ganda ditolak');
    const noReason = await call(`/sales/customers/${cu.body.id}`, { method: 'PATCH', token: osmond, body: JSON.stringify({ creditLimit: 60_000_000 }) });
    ok(noReason.status === 422 && noReason.body.error.code === 'REASON_REQUIRED', 'ubah plafon wajib beralasan', noReason.body);
    const lim = await call(`/sales/customers/${cu.body.id}`, { method: 'PATCH', token: osmond, body: JSON.stringify({ creditLimit: 60_000_000, reason: 'evaluasi kredit' }) });
    ok(lim.status === 200 && lim.body.creditLimit === 60_000_000, 'plafon diperbarui dengan alasan', lim.body);
    const prods = (await call('/sales/products', { token: sari, branch: 'ALL' })).body;
    const braket = prods.find((p: any) => p.sku === 'BRG-1108');
    const bearing = prods.find((p: any) => p.sku === 'BRG-2217');
    const stockCkr = (p: any) => p.stock.filter((x: any) => x.branch === 'CKR').reduce((t: number, x: any) => t + Number(x.onHand), 0);
    const stock0 = stockCkr(braket);
    const pr = await call('/sales/products', { method: 'POST', token: osmond, body: JSON.stringify({ sku: `JAS-${tag}`.toUpperCase().slice(0, 30), name: 'Jasa uji e2e', kind: 'jasa', unit: 'paket', price: 5_000_000 }) });
    ok(pr.status === 201 && pr.body.kind === 'jasa', 'produk jasa ditambahkan', pr.body);
    const svc = pr.body;

    /* Pesanan: lolos otomatis, perlu persetujuan, ditolak lalu diajukan ulang */
    ok((await call('/sales/orders', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ branch: 'MDN', customerId: cu.body.id, orderDate: D, lines: [{ productId: svc.id, qty: 1 }] }) })).status === 403, 'pesanan cabang lain dari konteks CKR → 403');
    const noProd = await call('/sales/orders', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, orderDate: D, lines: [{ kind: 'barang', description: 'Barang tanpa produk', qty: 1, price: 1000 }] }) });
    ok(noProd.status === 422 && noProd.body.error.code === 'SALES_INVALID_LINES', 'baris barang wajib memilih produk (stok & HPP)', noProd.body);
    const so1 = await call('/sales/orders', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, orderDate: D, lines: [{ productId: braket.id, qty: 10 }, { productId: svc.id, qty: 1, discPct: 10 }], submit: true }) });
    const exp1 = Math.round(10 * braket.price) + 4_500_000;
    ok(so1.status === 201 && so1.body.status === 'disetujui' && so1.body.net === exp1 && so1.body.ppn === Math.round(exp1 * 0.11) && so1.body.total === exp1 + Math.round(exp1 * 0.11), 'pesanan di bawah plafon & batas → disetujui otomatis, PPN 11% benar', so1.body);
    const so2 = await call('/sales/orders', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, orderDate: D, lines: [{ productId: braket.id, qty: 150 }], submit: true }) });
    ok(so2.status === 201 && so2.body.status === 'menunggu' && so2.body.approvalReasons.some((r: string) => /plafon/.test(r)), 'pesanan melebihi sisa plafon → menunggu persetujuan', so2.body?.approvalReasons);
    ok((await call(`/sales/orders/${so2.body.id}/approve`, { method: 'POST', token: sari, branch: 'CKR', body: '{}' })).status === 403, 'staf tidak dapat menyetujui pesanan');
    const rej = await call(`/sales/orders/${so2.body.id}/reject`, { method: 'POST', token: osmond, branch: 'ALL', body: JSON.stringify({ reason: 'kurangi kuantitas' }) });
    ok(rej.status === 200 && rej.body.status === 'ditolak', 'manajer menolak pesanan dengan alasan', rej.body?.status);
    const upd = await call(`/sales/orders/${so2.body.id}`, { method: 'PATCH', token: sari, branch: 'CKR', body: JSON.stringify({ lines: [{ productId: braket.id, qty: 20 }], submit: true }) });
    ok(upd.status === 200 && upd.body.status === 'disetujui' && upd.body.timeline.some((t: any) => t.action === 'sales_order.rejected'), 'pesanan ditolak diubah lalu diajukan ulang → disetujui; linimasa tercatat', upd.body?.status);
    const so3 = await call('/sales/orders', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, orderDate: D, lines: [{ productId: braket.id, qty: 200 }], submit: true }) });
    const ap3 = await call(`/sales/orders/${so3.body.id}/approve`, { method: 'POST', token: osmond, branch: 'ALL', body: JSON.stringify({ note: 'disetujui khusus' }) });
    ok(ap3.status === 200 && ap3.body.status === 'disetujui' && ap3.body.decidedByName === 'Osmond Pratama', 'manajer menyetujui pesanan', ap3.body?.status);
    const cn3 = await call(`/sales/orders/${so3.body.id}/cancel`, { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ reason: 'pelanggan batal' }) });
    ok(cn3.status === 200 && cn3.body.status === 'batal', 'pembuat membatalkan pesanan', cn3.body?.status);
    await call(`/sales/customers/${cu.body.id}`, { method: 'PATCH', token: osmond, body: JSON.stringify({ status: 'ditahan', reason: 'uji status ditahan' }) });
    const soHeld = await call('/sales/orders', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, orderDate: D, lines: [{ productId: svc.id, qty: 1 }], submit: true }) });
    ok(soHeld.body.status === 'menunggu' && soHeld.body.approvalReasons.some((r: string) => /ditahan/.test(r)), 'pelanggan ditahan → pesanan kecil pun menunggu persetujuan', soHeld.body?.approvalReasons);
    await call(`/sales/orders/${soHeld.body.id}/cancel`, { method: 'POST', token: osmond, branch: 'ALL', body: JSON.stringify({ reason: 'bersihkan uji' }) });
    await call(`/sales/customers/${cu.body.id}`, { method: 'PATCH', token: osmond, body: JSON.stringify({ status: 'aktif', reason: 'aktif kembali' }) });

    /* SoD per dokumen: pengguna yang memegang buat & setujui tetap tidak boleh menyetujui pesanannya sendiri. */
    const rcode = `uji_jual_${tag}`.slice(0, 40);
    const rr = await call('/admin/roles', { method: 'POST', token: admin, body: JSON.stringify({ code: rcode, name: 'Uji penjual-penyetuju', permissions: ['sales.invoice.read', 'sales.order.create', 'sales.order.approve', 'sales.invoice.create', 'sales.invoice.issue'] }) });
    ok(rr.status === 201, 'peran uji penjual-penyetuju dibuat (pasangan buat/setujui ditegakkan per dokumen)', rr.body);
    const suEmail = `jual.${tag}@knm.co.id`;
    const su = await call('/admin/users', { method: 'POST', token: admin, body: JSON.stringify({ email: suEmail, name: 'Uji Penjual', roles: [{ role: rcode, branch: 'CKR' }] }) });
    const suTok0 = (await authCall(suEmail, su.body.temporaryPassword)).body.access_token;
    await call('/me/password', { method: 'POST', token: suTok0, body: JSON.stringify({ currentPassword: su.body.temporaryPassword, newPassword: 'Penjual-Uji-2026x' }) });
    const suTok = (await authCall(suEmail, 'Penjual-Uji-2026x')).body.access_token;
    const soS = await call('/sales/orders', { method: 'POST', token: suTok, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, orderDate: D, lines: [{ productId: braket.id, qty: 400 }], submit: true }) });
    const selfAp = await call(`/sales/orders/${soS.body.id}/approve`, { method: 'POST', token: suTok, branch: 'CKR', body: '{}' });
    ok(soS.body.status === 'menunggu' && selfAp.status === 403 && selfAp.body.error.code === 'SOD_ORDER', 'pembuat pesanan tidak dapat menyetujui pesanannya sendiri', selfAp.body);
    await call(`/sales/orders/${soS.body.id}/cancel`, { method: 'POST', token: suTok, branch: 'CKR', body: JSON.stringify({ reason: 'bersihkan uji' }) });
    const invS = await call('/sales/invoices', { method: 'POST', token: suTok, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, invoiceDate: D, lines: [{ productId: svc.id, qty: 1 }] }) });
    const selfIss = await call(`/sales/invoices/${invS.body.id}/issue`, { method: 'POST', token: suTok, branch: 'CKR' });
    ok(invS.status === 201 && selfIss.status === 403 && selfIss.body.error.code === 'SOD_INVOICE', 'pembuat faktur tidak dapat menerbitkan fakturnya sendiri', selfIss.body);
    const cnDraft = await call(`/sales/invoices/${invS.body.id}/cancel`, { method: 'POST', token: suTok, branch: 'CKR', body: JSON.stringify({ reason: 'draf uji' }) });
    ok(cnDraft.status === 200 && cnDraft.body.status === 'batal' && cnDraft.body.journals.length === 0, 'pembuat membatalkan draf fakturnya (tanpa jurnal)', cnDraft.body?.status);

    /* Faktur dari pesanan → terbit (jurnal + HPP + stok) → penerimaan */
    const ti = await call(`/sales/orders/${so1.body.id}/invoice`, { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ invoiceDate: D }) });
    ok(ti.status === 200 && /^INV-2026-\d{4}$/.test(ti.body.invoiceNo) && ti.body.order.status === 'selesai', 'pesanan disetujui menjadi draf faktur; pesanan selesai', ti.body?.invoiceNo);
    const invId = ti.body.invoiceId;
    const detail0 = await call(`/sales/customers/${cu.body.id}`, { token: osmond, branch: 'ALL' });
    ok(detail0.body.exposure.drafts === so1.body.total, 'faktur draf tetap dihitung dalam eksposur kredit', detail0.body.exposure);
    ok((await call(`/sales/invoices/${invId}/issue`, { method: 'POST', token: sari, branch: 'CKR' })).status === 403, 'staf tanpa sales.invoice.issue tidak dapat menerbitkan');
    const iss = await call(`/sales/invoices/${invId}/issue`, { method: 'POST', token: andi, branch: 'CKR' });
    ok(iss.status === 200 && iss.body.status === 'belum-dibayar' && iss.body.cogs === 10 * 264_000, 'akuntan menerbitkan faktur; HPP = qty × harga pokok rata-rata', { s: iss.body?.status, cogs: iss.body?.cogs, e: iss.body?.error });
    const rules = (iss.body.journals ?? []).map((j: any) => j.rule).sort();
    ok(JSON.stringify(rules) === JSON.stringify(['SALES_COGS', 'SALES_INVOICE']), 'jurnal penjualan & HPP diposting otomatis', rules);
    const jSales = await call(`/ledger/journals/${iss.body.journals.find((j: any) => j.rule === 'SALES_INVOICE').id}`, { token: andi, branch: 'ALL' });
    const amt = (acc: string, side: 'debit' | 'credit') => jSales.body.lines.filter((l: any) => l.account === acc).reduce((t: number, l: any) => t + l[side], 0);
    ok(jSales.body.status === 'posted' && amt('1-1200', 'debit') === iss.body.total && amt('4-1000', 'credit') === 10 * braket.price && amt('4-2000', 'credit') === 4_500_000 && amt('2-1400', 'credit') === iss.body.ppn,
      'jurnal: Dr piutang total; Cr pendapatan barang, jasa, PPN keluaran', jSales.body.lines);
    const prods2 = (await call('/sales/products', { token: sari, branch: 'ALL' })).body;
    ok(stockCkr(prods2.find((p: any) => p.sku === 'BRG-1108')) === stock0 - 10, 'stok cabang berkurang saat faktur terbit', [stock0, stockCkr(prods2.find((p: any) => p.sku === 'BRG-1108'))]);
    ok((await call(`/sales/invoices/${invId}/issue`, { method: 'POST', token: andi, branch: 'CKR' })).status === 409, 'faktur tidak dapat diterbitkan dua kali');
    const banks = (await call('/ledger/bank-accounts', { token: andi, branch: 'ALL' })).body.accounts;
    const ckrBank = banks.find((b: any) => b.branchCode === 'CKR' && b.status === 'aktif' && b.bankName !== 'Kas').code;
    const jktBank = banks.find((b: any) => b.branchCode === 'JKT' && b.status === 'aktif').code;
    const over = await call(`/sales/invoices/${invId}/receipts`, { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ date: '2026-09-25', amount: iss.body.total + 1, bankAccount: ckrBank }) });
    ok(over.status === 422 && over.body.error.code === 'RECEIPT_OVERPAY', 'penerimaan melebihi sisa tagihan ditolak', over.body);
    const wrongBank = await call(`/sales/invoices/${invId}/receipts`, { method: 'POST', token: sari, branch: 'ALL', body: JSON.stringify({ date: '2026-09-25', amount: 1_000_000, bankAccount: jktBank }) });
    ok(wrongBank.status === 422 && wrongBank.body.error.code === 'BANK_BRANCH', 'rekening cabang lain ditolak', wrongBank.body);
    const r1 = await call(`/sales/invoices/${invId}/receipts`, { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ date: '2026-09-25', amount: 1_000_000, bankAccount: ckrBank, reference: 'TRF-1' }) });
    ok(r1.status === 200 && r1.body.status === 'sebagian' && r1.body.open === iss.body.total - 1_000_000 && r1.body.receipts[0].journalNo, 'penerimaan sebagian → status sebagian, jurnal kas diposting', r1.body?.status);
    const r2 = await call(`/sales/invoices/${invId}/receipts`, { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ date: '2026-09-25', amount: r1.body.open, bankAccount: ckrBank }) });
    ok(r2.status === 200 && r2.body.status === 'lunas' && r2.body.open === 0, 'pelunasan → lunas', r2.body?.status);
    ok((await call(`/sales/invoices/${invId}/receipts`, { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ amount: 1, bankAccount: ckrBank }) })).status === 409, 'faktur lunas tidak menerima penerimaan lagi');
    const cnPaid = await call(`/sales/invoices/${invId}/cancel`, { method: 'POST', token: andi, branch: 'CKR', body: JSON.stringify({ reason: 'uji' }) });
    ok(cnPaid.status === 409 && cnPaid.body.error.code === 'INVOICE_HAS_RECEIPTS', 'faktur yang sudah dibayar tidak dapat dibatalkan', cnPaid.body);

    /* Faktur langsung: stok kurang, periode tertutup, pembatalan membalik jurnal & mengembalikan stok */
    const short = await call('/sales/invoices', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, invoiceDate: D, lines: [{ productId: bearing.id, qty: 100000 }] }) });
    const shortIss = await call(`/sales/invoices/${short.body.id}/issue`, { method: 'POST', token: andi, branch: 'CKR' });
    const shortAfter = await call(`/sales/invoices/${short.body.id}`, { token: andi, branch: 'CKR' });
    ok(shortIss.status === 422 && shortIss.body.error.code === 'STOCK_INSUFFICIENT' && shortAfter.body.status === 'draf' && shortAfter.body.journals.length === 0, 'stok tidak cukup → penerbitan ditolak utuh (tanpa jurnal)', shortIss.body);
    await call(`/sales/invoices/${short.body.id}/cancel`, { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ reason: 'bersihkan' }) });
    const oldInv = await call('/sales/invoices', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, invoiceDate: '2026-07-15', lines: [{ productId: svc.id, qty: 1 }] }) });
    const oldIss = await call(`/sales/invoices/${oldInv.body.id}/issue`, { method: 'POST', token: andi, branch: 'CKR' });
    ok(oldIss.status === 422 && oldIss.body.error.code === 'LEDGER_PERIOD_CLOSED', 'faktur bertanggal periode tertutup tidak dapat diterbitkan', oldIss.body);
    await call(`/sales/invoices/${oldInv.body.id}/cancel`, { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ reason: 'bersihkan' }) });
    const inv2 = await call('/sales/invoices', { method: 'POST', token: sari, branch: 'CKR', body: JSON.stringify({ branch: 'CKR', customerId: cu.body.id, invoiceDate: D, lines: [{ productId: braket.id, qty: 5 }] }) });
    await call(`/sales/invoices/${inv2.body.id}/issue`, { method: 'POST', token: andi, branch: 'CKR' });
    const cn2 = await call(`/sales/invoices/${inv2.body.id}/cancel`, { method: 'POST', token: andi, branch: 'CKR', body: JSON.stringify({ reason: 'salah harga', date: '2026-09-25' }) });
    const revd = (cn2.body.journals ?? []).filter((j: any) => j.status === 'reversed').length;
    const revs = (cn2.body.journals ?? []).filter((j: any) => j.rule === 'REVERSAL').length;
    ok(cn2.status === 200 && cn2.body.status === 'batal' && revd === 2 && revs === 2, 'pembatalan faktur terbit membalik jurnal penjualan & HPP', cn2.body?.journals);
    const prods3 = (await call('/sales/products', { token: sari, branch: 'ALL' })).body;
    ok(stockCkr(prods3.find((p: any) => p.sku === 'BRG-1108')) === stock0 - 10, 'stok dikembalikan saat faktur dibatalkan');

    /* Integrasi buku besar & RLS */
    for (const b of ['CKR', 'ALL']) {
      const rec = await call('/reports/reconciliation', { token: andi, branch: b, period: '2026-09' });
      const bad = rec.body.checks.filter((c: any) => !c.ok).map((c: any) => `${c.id}:${c.diff}`);
      ok(rec.status === 200 && bad.length === 0, `rekonsiliasi ${b} Sep 2026 tetap cocok (piutang, kas, persediaan)`, bad);
    }
    const recAug = await call('/reports/reconciliation', { token: andi, branch: 'ALL', period: '2026-08' });
    ok(recAug.body.checks.find((c: any) => c.id === 'ar').ok, 'rekonsiliasi piutang Agu 2026 (data awal + penerimaan historis) cocok');
    const recv = await call('/sales/receivables', { token: andi, branch: 'ALL', period: '2026-08' });
    ok(recv.status === 200 && recv.body.kpi.reconciled && recv.body.aging.reduce((t: number, b: any) => t + b.value, 0) === recv.body.kpi.total, 'umur piutang = saldo 1-1200 dan jumlah ember = total', recv.body?.kpi);
    const tInv = await call('/sales/invoices', { token: taufik, branch: 'ALL' });
    ok(tInv.status === 200 && tInv.body.length > 0 && tInv.body.every((i: any) => i.branch === 'MDN'), 'manajer Medan hanya melihat faktur Medan (RLS)');
    ok((await call(`/sales/invoices/${invId}`, { token: taufik, branch: 'ALL' })).status === 404, 'faktur cabang lain → 404 bagi manajer Medan');
    const aud = await call(`/admin/audit-log?entity=invoice&entityId=${ti.body.invoiceNo}&size=50`, { token: admin, branch: 'ALL' });
    ok(aud.status === 200 && ['invoice.created', 'invoice.issued', 'invoice.receipt'].every((x) => aud.body.data.some((a: any) => a.action === x)), 'siklus faktur tercatat di jejak audit', aud.body?.data?.map((a: any) => a.action));

    await call('/settings', { method: 'PATCH', token: admin, body: JSON.stringify({ policies: pol0 }) });
    await call(`/admin/users/${su.body.id}`, { method: 'PATCH', token: admin, body: JSON.stringify({ status: 'nonaktif', reason: 'bersihkan uji' }) });
  }

  console.log('Asisten AI');
  const assistant = app.get(AssistantService);
  assistant.useClientForTest(null);
  const st = await call('/assistant/status', { token: andi, branch: 'ALL' });
  ok(st.status === 200 && st.body.enabled === false, 'status asisten: nonaktif tanpa kunci API', st.body);
  const off1 = await call('/assistant/chat', { method: 'POST', token: andi, branch: 'ALL', body: JSON.stringify({ messages: [{ role: 'user', content: 'Berapa laba bulan ini?' }] }) });
  ok(off1.status === 503 && off1.body.error.code === 'ASSISTANT_DISABLED', 'chat tanpa kunci API → 503 ASSISTANT_DISABLED', off1.body);
  const fitriChat = await call('/assistant/chat', { method: 'POST', token: fitri, branch: 'SBY', body: JSON.stringify({ messages: [{ role: 'user', content: 'halo' }] }) });
  ok(fitriChat.status === 403, 'pengguna tanpa izin laporan tidak dapat memakai asisten', fitriChat.status);
  const badShape = await call('/assistant/chat', { method: 'POST', token: andi, branch: 'ALL', body: JSON.stringify({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }) });
  ok(badShape.status === 400 || badShape.status === 422, 'riwayat yang diakhiri pesan asisten ditolak', badShape.status);

  /* Klien tiruan: langkah 1 memanggil alat, langkah 2 menjawab teks. */
  const scripted = (toolUses: { name: string; input: unknown }[]) => {
    const calls: any[] = [];
    let n = 0;
    const msg = (content: any[], stop: string) => ({ id: `msg_${n}`, type: 'message', role: 'assistant', model: 'claude-opus-5', content, stop_reason: stop, stop_sequence: null, stop_details: null, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
    return {
      calls,
      client: { beta: { messages: { create: async (params: any) => {
        calls.push(JSON.parse(JSON.stringify(params)));
        n += 1;
        if (n === 1) return msg([{ type: 'thinking', thinking: '', signature: 'sig' }, ...toolUses.map((t, i) => ({ type: 'tool_use', id: `tu_${i}`, name: t.name, input: t.input }))], 'tool_use') as any;
        return msg([{ type: 'text', text: 'Laba bersih Surabaya tercatat pada periode ini.' }], 'end_turn') as any;
      } } } },
    };
  };
  const m1 = scripted([{ name: 'laba_rugi', input: { cabang: 'SBY', periode: '2026-08' } }, { name: 'konsolidasi', input: { periode: '2026-08' } }]);
  assistant.useClientForTest(m1.client);
  const c1 = await call('/assistant/chat', { method: 'POST', token: andi, branch: 'ALL', period: '2026-08', body: JSON.stringify({ messages: [{ role: 'user', content: 'Bandingkan laba Surabaya dengan konsolidasi' }] }) });
  ok(c1.status === 200 && c1.body.reply.includes('Surabaya') && c1.body.toolsUsed.length === 2 && c1.body.toolsUsed.every((t: any) => t.ok), 'asisten menjalankan dua alat lalu menjawab', c1.body);
  const req1 = m1.calls[0];
  ok(req1.model === 'claude-opus-5' && req1.fallbacks === 'default' && req1.betas.includes('server-side-fallback-2026-07-01') && !('thinking' in req1), 'permintaan memakai model & cadangan sisi server bawaan', { model: req1.model, betas: req1.betas });
  const results1 = m1.calls[1].messages[m1.calls[1].messages.length - 1].content;
  ok(Array.isArray(results1) && results1.length === 2 && results1.every((r: any) => r.type === 'tool_result'), 'seluruh hasil alat dikirim dalam satu pesan pengguna');
  const pl1 = JSON.parse(results1.find((r: any) => r.tool_use_id === 'tu_0').content);
  ok(pl1.scope === 'SBY' && pl1.period.kode === '2026-08' && typeof pl1.net === 'number', 'alat laba_rugi memakai cabang & periode yang diminta', pl1.period);
  ok(m1.calls[1].messages.some((mm: any) => mm.role === 'assistant' && mm.content.some((b: any) => b.type === 'thinking')), 'blok thinking dikembalikan utuh pada langkah berikutnya');

  const m2 = scripted([{ name: 'konsolidasi', input: {} }, { name: 'neraca', input: { cabang: 'JKT' } }]);
  assistant.useClientForTest(m2.client);
  const c2 = await call('/assistant/chat', { method: 'POST', token: taufik, branch: 'MDN', period: '2026-08', body: JSON.stringify({ messages: [{ role: 'user', content: 'Tunjukkan neraca Jakarta' }] }) });
  const offered = m2.calls[0].tools.map((t: any) => t.name);
  ok(c2.status === 200 && offered.includes('neraca') && offered.includes('konsolidasi') && offered.includes('piutang_usaha'), 'alat ditawarkan sesuai izin pengguna (termasuk piutang usaha)', offered);
  const res2 = m2.calls[1].messages[m2.calls[1].messages.length - 1].content;
  const jkt = res2.find((r: any) => r.tool_use_id === 'tu_1');
  ok(jkt.is_error === true && /akses ke cabang JKT/.test(jkt.content), 'manajer Medan tidak dapat membaca neraca Jakarta lewat asisten', jkt);

  const m3 = scripted([{ name: 'konsolidasi', input: {} }]);
  assistant.useClientForTest(m3.client);
  const sari2 = await login('sari@knm.co.id');
  const c3 = await call('/assistant/chat', { method: 'POST', token: sari2, branch: 'JKT', period: '2026-08', body: JSON.stringify({ messages: [{ role: 'user', content: 'konsolidasi?' }] }) });
  const offered3 = m3.calls[0].tools.map((t: any) => t.name);
  const r3 = m3.calls[1].messages[m3.calls[1].messages.length - 1].content[0];
  ok(c3.status === 200 && !offered3.includes('konsolidasi') && r3.is_error === true, 'alat konsolidasi tidak ditawarkan & ditolak tanpa report.consolidated', { offered3, r3 });
  const aud = await call('/admin/audit-log?entity=assistant&size=5', { token: andi, branch: 'ALL' });
  ok(aud.status === 200 && aud.body.data.some((a: any) => a.action === 'assistant.query' && Array.isArray(a.after?.tools)) && !JSON.stringify(aud.body.data).includes('Bandingkan laba'), 'pertanyaan tercatat di jejak audit tanpa isi percakapan', aud.body?.data?.[0]);
  assistant.useClientForTest(null);

  console.log('Sesi');
  const logout = await call('/auth/logout', { method: 'POST', token: sari });
  ok(logout.status === 204, 'logout mencabut sesi', logout.status);
  ok((await call('/me', { token: sari })).status === 401, 'token sesi yang dicabut ditolak');

  await app.close();
  console.log(failures ? `\nGAGAL — ${failures} pemeriksaan` : '\nLULUS — seluruh pemeriksaan e2e API');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
