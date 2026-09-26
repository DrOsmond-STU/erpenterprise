/* Uji peramban aplikasi Vue terhadap API sungguhan (Playwright).
 *   Prasyarat: API di :3000 (sudah di-seed) dan `vite preview` di :5173.
 *   node tools/web-e2e.mjs [dir-tangkapan-layar]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'dist/shots-web';
mkdirSync(out, { recursive: true });
const PW = process.env.SEED_PASSWORD || 'Rahasia-2026!';
const problems = [];
const ok = (c, label, extra) => { if (c) console.log('  ✓ ' + label); else { problems.push(label); console.log('  ✗ ' + label, extra ?? ''); } };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/40[13]|422|Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
const base = 'http://localhost:5173';
const login = async (email) => {
  await page.goto(base + '/masuk'); await page.waitForSelector('#email');
  await page.fill('#email', email); await page.fill('#password', PW); await page.click('button[type=submit]');
  await page.waitForURL(/\/(dasbor|jurnal)/, { timeout: 15000 }); await page.waitForTimeout(600);
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });

console.log('Masuk & dasbor');
await page.goto(base + '/masuk'); await shot('01-masuk');
await login('andi@knm.co.id');
ok(await page.locator('.kpi-tile').count() >= 4, 'dasbor memuat ubin KPI dari API'); await shot('02-dasbor');
ok((await page.locator('.contextbar').innerText()).includes('Semua cabang'), 'akuntan senior mulai pada konteks semua cabang');

console.log('Laporan');
for (const [path, name, check] of [
  ['/jurnal', '03-jurnal', 'tbody tr[data-row]'], ['/buku-besar', '04-buku-besar', '.table.report tbody tr'], ['/neraca-saldo', '05-neraca-saldo', '.pill[data-tone=ok]'],
  ['/laba-rugi', '06-laba-rugi', '.report-stmt'], ['/neraca', '07-neraca', '.report-stmt'], ['/konsolidasi', '08-konsolidasi', '.report-stmt'],
  ['/integrasi', '09-integrasi', '.pill'], ['/cabang', '10-cabang', '.branch-card'], ['/bagan-akun', '11-bagan-akun', '.coa-summary'], ['/kas-bank', '12-kas-bank', 'tbody tr'], ['/jejak-audit', '13-jejak-audit', 'tbody tr'],
]) {
  await page.goto(base + path); await page.waitForSelector(check, { timeout: 15000 }).catch(() => null); await page.waitForTimeout(400);
  ok(await page.locator(check).count() > 0, `${path} dirender dengan data`); await shot(name);
}
await page.goto(base + '/integrasi'); await page.waitForSelector('.pill');
ok(await page.locator('.pill[data-tone=danger]').count() === 0, 'tidak ada selisih rekonsiliasi');
await page.goto(base + '/neraca'); await page.waitForSelector('.report-stmt');
ok((await page.locator('.kpi-tile .pill').innerText()).includes('Aset = Liabilitas'), 'neraca konsolidasi seimbang');

console.log('Konteks cabang');
await page.click('.contextbar [data-action="switch-branch"]'); await page.click('[data-set-branch="CKR"]'); await page.waitForTimeout(700);
ok((await page.locator('.contextbar').innerText()).includes('Cikarang'), 'pemilih cabang mengubah konteks');
await page.waitForSelector('.report-stmt'); await shot('14-neraca-cikarang');
ok((await page.locator('.kpi-tile .pill').innerText()).includes('Aset = Liabilitas'), 'neraca cabang Cikarang seimbang');
await page.click('.contextbar [data-action="switch-period"]'); await page.click('[data-set-period="2026"]'); await page.waitForTimeout(700);
ok((await page.locator('.contextbar').innerText()).includes('TA 2026'), 'pemilih periode mengubah konteks');
await page.click('.contextbar [data-action="switch-branch"]'); await page.click('[data-set-branch="ALL"]'); await page.waitForTimeout(300);
await page.click('.contextbar [data-action="switch-period"]'); await page.click('[data-set-period="2026-08"]'); await page.waitForTimeout(300);

console.log('Jurnal: laci & buku besar');
await page.goto(base + '/jurnal'); await page.waitForSelector('tbody tr[data-row]');
await page.click('tbody tr[data-row]'); await page.waitForSelector('.drawer .table');
ok(await page.locator('.drawer .table tbody tr').count() >= 2, 'laci jurnal menampilkan baris debit/kredit'); await shot('15-jurnal-laci');
await page.click('.drawer [data-gl]'); await page.waitForURL(/buku-besar/); await page.waitForSelector('.table.report');
ok(page.url().includes('buku-besar'), 'tautan baris jurnal membuka kartu buku besar');

console.log('Alur memorial: staf membuat, akuntan memposting');
await page.click('.topbar-user button'); await page.click('.user-menu .menu-item:has-text("Keluar")'); await page.waitForURL(/masuk/);
await login('sari@knm.co.id');
await page.goto(base + '/jurnal'); await page.waitForSelector('[data-action="new-journal"]');
await page.click('[data-action="new-journal"]'); await page.waitForSelector('#jv-body');
await page.fill('#jv-desc', 'Uji peramban: perlengkapan kantor dari kas kecil');
await page.selectOption('#jv-body tr:nth-child(1) [data-jv-acc]', '5-3700'); await page.fill('#jv-body tr:nth-child(1) [data-jv-debit]', '175000');
await page.selectOption('#jv-body tr:nth-child(2) [data-jv-acc]', '1-1100'); await page.waitForSelector('#jv-body tr:nth-child(2) [data-jv-bank]');
await page.selectOption('#jv-body tr:nth-child(2) [data-jv-bank]', 'BNK-007'); await page.fill('#jv-body tr:nth-child(2) [data-jv-credit]', '175000');
await shot('16-jurnal-modal');
await page.click('[data-action="submit-journal"]'); await page.waitForSelector('.toast', { timeout: 10000 });
const t1 = await page.locator('.toast').last().innerText();
ok(/persetujuan/.test(t1), 'staf keuangan mengirim jurnal untuk persetujuan', t1);
await page.click('.chip:has-text("Menunggu")'); await page.waitForTimeout(500);
await page.click('tbody tr[data-row]'); await page.waitForSelector('.drawer');
ok(await page.locator('.drawer [data-action="post-journal"]').count() === 0, 'pembuat tidak melihat tombol posting');
await page.keyboard.press('Escape');
await page.click('.topbar-user button'); await page.click('.user-menu .menu-item:has-text("Keluar")'); await page.waitForURL(/masuk/);
await login('andi@knm.co.id');
await page.goto(base + '/jurnal?status=pending'); await page.waitForSelector('tbody tr[data-row]');
await page.click('tbody tr[data-row]:has-text("Uji peramban")'); await page.waitForSelector('.drawer [data-action="post-journal"]');
await page.click('.drawer [data-action="post-journal"]'); await page.waitForSelector('.toast');
const t2 = await page.locator('.toast').last().innerText();
ok(/diposting/.test(t2), 'akuntan senior memposting jurnal staf', t2);
await page.goto(base + '/integrasi'); await page.waitForSelector('.pill'); await page.waitForTimeout(500);
ok(await page.locator('.pill[data-tone=danger]').count() === 0, 'rekonsiliasi tetap cocok setelah posting lewat UI');

console.log('Asisten AI');
ok((await page.locator('.rail-link-text').allInnerTexts()).includes('Asisten AI'), 'menu Asisten AI tampil bagi akuntan senior');
await page.goto(base + '/asisten'); await page.waitForSelector('.empty-title, .assistant', { timeout: 15000 });
ok((await page.locator('.empty-title').innerText().catch(() => '')).includes('belum diaktifkan'), 'tanpa kunci API halaman asisten menjelaskan cara mengaktifkan');
/* Respons asisten dicegat: menguji tampilan tanpa memanggil Claude API. */
const chatBodies = [];
const REPLY = [
  '**Laba bersih** periode Agustus 2026 per cabang:',
  '',
  '| Cabang | Pendapatan | Laba bersih | Margin |',
  '| --- | ---: | ---: | ---: |',
  '| Jakarta | Rp 1.250.000.000 | Rp 180.000.000 | 14,4% |',
  '| Surabaya | Rp 640.000.000 | Rp 52.000.000 | 8,1% |',
  '',
  '- Margin Surabaya paling rendah.',
  '- Uraian jurnal berisi <img src=x onerror="window.__xss=1"> tetap tampil sebagai teks.',
].join('\n');
await page.route('**/api/v1/assistant/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, model: 'claude-opus-5' }) }));
await page.route('**/api/v1/assistant/chat', async (r) => {
  chatBodies.push(JSON.parse(r.request().postData() || '{}'));
  await new Promise((res) => setTimeout(res, 400));
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: REPLY, toolsUsed: [{ name: 'konsolidasi', ok: true }, { name: 'laba_rugi', ok: true }], usage: { inputTokens: 1, outputTokens: 1 }, model: 'claude-opus-5', stopReason: 'end_turn' }) });
});
await page.reload(); await page.waitForSelector('.assistant-suggest .chip', { timeout: 15000 });
await page.click('.assistant-suggest .chip >> nth=0');
await page.waitForSelector('.assistant-typing', { timeout: 5000 }).catch(() => null);
await page.waitForSelector('.assistant-msg.is-assistant .md table', { timeout: 15000 });
ok(chatBodies[0]?.messages?.length === 1 && chatBodies[0].messages[0].role === 'user', 'pertanyaan pertama dikirim tanpa riwayat', chatBodies[0]);
ok(await page.locator('.assistant-msg.is-assistant .md table tbody tr').count() === 2, 'tabel Markdown jawaban dirender sebagai tabel');
ok(await page.locator('.md td.ta-r.num').count() >= 6, 'kolom angka rata kanan');
ok(await page.locator('.md img').count() === 0 && !(await page.evaluate(() => window.__xss)) && (await page.locator('.md').innerText()).includes('<img'), 'HTML di jawaban di-escape (tanpa XSS)');
ok((await page.locator('.assistant-tools').innerText()).includes('Konsolidasi'), 'sumber data yang dibaca asisten ditampilkan');
await page.fill('#assistant-input', 'Kenapa margin Surabaya rendah?'); await page.press('#assistant-input', 'Enter');
await page.waitForFunction(() => document.querySelectorAll('.assistant-msg.is-assistant .md').length === 2, null, { timeout: 15000 });
ok(chatBodies[1]?.messages?.length === 3 && chatBodies[1].messages.map((m) => m.role).join() === 'user,assistant,user', 'pertanyaan lanjutan membawa riwayat tanya-jawab', chatBodies[1]?.messages?.map((m) => m.role));
await shot('19-asisten');
await page.unroute('**/api/v1/assistant/status'); await page.unroute('**/api/v1/assistant/chat');

console.log('Pembatasan hak: staf gudang Surabaya');
await page.click('.topbar-user button'); await page.click('.user-menu .menu-item:has-text("Keluar")'); await page.waitForURL(/masuk/);
await page.goto(base + '/masuk'); await page.fill('#email', 'fitri@knm.co.id'); await page.fill('#password', PW); await page.click('button[type=submit]'); await page.waitForTimeout(1200);
const nav = await page.locator('.rail-link-text').allInnerTexts();
ok(!nav.includes('Neraca') && !nav.includes('Jurnal Umum') && !nav.includes('Asisten AI'), 'menu laporan, jurnal & asisten tersembunyi bagi staf gudang', nav);
ok(!(await page.locator('.contextbar').innerText()).includes('Semua cabang'), 'staf gudang tidak mendapat konteks semua cabang');
await shot('17-gudang');

const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mob.newPage();
await mp.goto(base + '/masuk'); await mp.fill('#email', 'andi@knm.co.id'); await mp.fill('#password', PW); await mp.click('button[type=submit]'); await mp.waitForURL(/dasbor/); await mp.waitForTimeout(800);
await mp.goto(base + '/laba-rugi'); await mp.waitForSelector('.report-stmt'); await mp.waitForTimeout(300);
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflow <= 1, 'tampilan sempit tanpa luapan horizontal', overflow); await mp.screenshot({ path: `${out}/18-mobile-laba-rugi.png` });
await mp.route('**/api/v1/assistant/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, model: 'claude-opus-5' }) }));
await mp.route('**/api/v1/assistant/chat', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: REPLY, toolsUsed: [{ name: 'konsolidasi', ok: true }], usage: { inputTokens: 1, outputTokens: 1 }, model: 'claude-opus-5', stopReason: 'end_turn' }) }));
await mp.goto(base + '/asisten'); await mp.waitForSelector('.assistant-suggest .chip'); await mp.click('.assistant-suggest .chip >> nth=0'); await mp.waitForSelector('.md table'); await mp.waitForTimeout(300);
const overflowA = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflowA <= 1, 'halaman asisten di ponsel tanpa luapan horizontal', overflowA); await mp.screenshot({ path: `${out}/20-mobile-asisten.png` });
await browser.close();
if (problems.length) { console.error(`GAGAL — ${problems.length} masalah:`); problems.forEach((p) => console.error('  · ' + p)); process.exit(1); }
console.log('LULUS — uji peramban aplikasi web');
