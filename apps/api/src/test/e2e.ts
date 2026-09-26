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
  ok(rec.status === 200 && rec.body.checks.length === 11 && rec.body.checks.every((k: any) => k.ok), '11 rekonsiliasi sub-buku cocok', rec.body?.checks?.filter((k: any) => !k.ok) ?? rec.body);
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
  ok(c2.status === 200 && offered.includes('neraca') && offered.includes('konsolidasi'), 'alat ditawarkan sesuai izin pengguna', offered);
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
