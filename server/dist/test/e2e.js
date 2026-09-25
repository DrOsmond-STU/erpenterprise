"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Uji ujung-ke-ujung API terhadap basis data yang sudah di-seed:
 * autentikasi, izin, pembatasan cabang (RLS + guard), SoD posting, invarian
 * buku besar, laporan, dan rekonsiliasi. Menjalankan peladen sendiri.
 *
 *   npm run build && npm run test:e2e
 */
const main_js_1 = require("../main.js");
const config_js_1 = require("../config.js");
const cfg = (0, config_js_1.loadConfig)();
const PW = cfg.SEED_PASSWORD ?? 'Rahasia-2026!';
let failures = 0;
const ok = (cond, label, extra) => {
    if (cond)
        console.log(`  ✓ ${label}`);
    else {
        failures += 1;
        console.log(`  ✗ ${label}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400));
    }
};
async function main() {
    const app = await (0, main_js_1.createApp)();
    await app.listen(0);
    const base = `${await app.getUrl()}/api/v1`.replace('[::1]', '127.0.0.1');
    const call = async (path, init = {}) => {
        const headers = { 'Content-Type': 'application/json', ...init.headers };
        if (init.token)
            headers.Authorization = `Bearer ${init.token}`;
        if (init.branch)
            headers['X-Branch-Id'] = init.branch;
        if (init.period)
            headers['X-Period-Id'] = init.period;
        const res = await fetch(base + path, { ...init, headers });
        const text = await res.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        }
        catch {
            body = text;
        }
        return { status: res.status, body, headers: res.headers };
    };
    const login = async (email) => {
        const r = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: PW }) });
        if (r.status !== 200)
            throw new Error(`login ${email} gagal: ${JSON.stringify(r.body)}`);
        return r.body.access_token;
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
    ok(t1.status === 200 && t1.body.data.length > 0 && t1.body.data.every((j) => j.branch === 'MDN'), 'manajer Medan hanya melihat jurnal Medan', t1.body?.meta);
    const t2 = await call('/ledger/journals?size=50', { token: taufik, branch: 'ALL', period: '2026-08' });
    ok(t2.status === 200 && t2.body.data.length > 0 && t2.body.data.every((j) => j.branch === 'MDN'), 'konteks "semua cabang" bagi manajer Medan tetap dibatasi RLS ke Medan', t2.body?.meta);
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
    ok(rec.status === 200 && rec.body.checks.length === 11 && rec.body.checks.every((k) => k.ok), '11 rekonsiliasi sub-buku cocok', rec.body?.checks?.filter((k) => !k.ok) ?? rec.body);
    const card = await call('/ledger/accounts/1-1100/card?bank=BNK-001', { token: andi, branch: 'JKT', period: '2026-08' });
    ok(card.status === 200 && card.body.lines.length > 0 && card.body.ending === card.body.lines.at(-1).balance, 'kartu buku besar rekening dengan saldo berjalan', card.body?.error);
    const kpi = await call('/reports/kpis', { token: andi, branch: 'CKR', period: '2026-08' });
    ok(kpi.status === 200 && kpi.body.revenue > 0 && kpi.body.monthlyRevenue.length === 12, 'KPI dasbor cabang', kpi.body?.error);
    console.log('Jurnal memorial & pemisahan tugas');
    const draft = { date: '2026-08-14', branch: 'JKT', description: 'Uji e2e: perlengkapan kantor dari kas kecil', lines: [
            { account: '5-3700', debit: 250000, credit: 0 }, { account: '1-1100', debit: 0, credit: 250000, bankAccountId: 'BNK-007' }
        ] };
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
    ok(recAfter.body.checks.every((k) => k.ok), 'rekonsiliasi tetap cocok setelah jurnal & pembalikan');
    const audit = await call('/admin/audit-log?entity=journal&size=5', { token: andi, branch: 'ALL' });
    ok(audit.status === 200 && audit.body.meta.chain.brokenAt === null && audit.body.data.some((a) => a.action === 'journal.reversed'), 'jejak audit tercatat dan rantai hash utuh', audit.body?.meta);
    console.log('Manajemen cabang');
    const admin = await login('admin@knm.co.id');
    const code = 'Z' + String.fromCharCode(65 + (Date.now() % 26)) + String.fromCharCode(65 + (Math.floor(Date.now() / 26) % 26));
    const br = await call('/branches', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code: code.toLowerCase(), name: 'Bandung — Cabang', type: 'Cabang penjualan', city: 'Bandung', targetMonthly: 150000000 }) });
    ok(br.status === 201 && br.body.code === code, 'cabang baru dibuat dengan giro & kas kecil', br.body);
    const dup = await call('/branches', { method: 'POST', token: admin, branch: 'ALL', body: JSON.stringify({ code, name: 'Dup', type: 'xxx', city: 'yy' }) });
    ok(dup.status === 409, 'kode cabang ganda → 409', dup.status);
    const cons2 = await call('/reports/consolidation', { token: andi, branch: 'ALL', period: '2026-08' });
    ok(cons2.body.branches.some((b) => b.code === code) && cons2.body.balanceSheet.combined.balanced, 'konsolidasi memuat cabang baru dan tetap seimbang');
    const off = await call(`/branches/${code}`, { method: 'PATCH', token: admin, branch: 'ALL', body: JSON.stringify({ status: 'nonaktif', reason: 'uji' }) });
    ok(off.status === 200 && off.body.status === 'nonaktif', 'cabang dinonaktifkan', off.body);
    console.log('Sesi');
    const logout = await call('/auth/logout', { method: 'POST', token: sari });
    ok(logout.status === 204, 'logout mencabut sesi', logout.status);
    ok((await call('/me', { token: sari })).status === 401, 'token sesi yang dicabut ditolak');
    await app.close();
    console.log(failures ? `\nGAGAL — ${failures} pemeriksaan` : '\nLULUS — seluruh pemeriksaan e2e API');
    process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=e2e.js.map