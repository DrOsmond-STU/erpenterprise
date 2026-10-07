/* Uji end-to-end peramban (Playwright) terhadap server sungguhan.
 *
 *   node tools/e2e.mjs
 *
 * Menjalankan server dengan basis data sementara berisi data demo, masuk
 * sebagai admin, membuka SELURUH menu pada tema terang & gelap, lalu menguji
 * alur: buat & posting faktur, jurnal manual dengan pemisahan tugas, laporan
 * cabang & konsolidasi, kasir POS, dan keluar. Tangkapan layar ke dist/shots/.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'dist', 'shots');
mkdirSync(shots, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const base = `http://127.0.0.1:${port}`;
const tmp = mkdtempSync(join(tmpdir(), 'erp-e2e-'));
const server = spawn(process.execPath, ['--no-warnings', 'server/index.js'], {
  cwd: root, env: { ...process.env, PORT: String(port), DB_FILE: join(tmp, 'e2e.sqlite'), BACKUP_DIR: join(tmp, 'bk'), SEED_DEMO: '1', LOG_LEVEL: 'error' }, stdio: ['ignore', 'inherit', 'inherit'],
});
const cleanup = () => { try { server.kill(); } catch { /* sudah berhenti */ } };
process.on('exit', cleanup);

for (let i = 0; i < 60; i++) {
  try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* belum siap */ }
  await new Promise((r) => setTimeout(r, 500));
}

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'lulus' : 'GAGAL'}  ${msg}`); if (!ok) failures.push(msg); };

async function session(viewport = { width: 1440, height: 900 }, theme = 'light') {
  const ctx = await browser.newContext({ viewport, colorScheme: theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + '/');
  await page.fill('#lg-user', 'admin');
  await page.fill('#lg-pass', 'Erp#Demo2026!');
  await page.click('button[type=submit]');
  await page.waitForSelector('.rail');
  return { ctx, page, errors };
}

try {
  // 1) Seluruh menu, dua tema.
  for (const theme of ['light', 'dark']) {
    const { ctx, page, errors } = await session(undefined, theme);
    const ids = await page.$$eval('.rail [data-nav]', (els) => els.map((e) => e.dataset.nav));
    let empty = 0;
    for (const id of ids) {
      await page.evaluate((i) => { location.hash = '#/' + i; }, id);
      await page.waitForTimeout(450);
      const text = await page.$eval('.view-root', (e) => e.innerText.trim()).catch(() => '');
      if (text.length < 20) empty++;
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) failures.push(`${theme}/${id}: luapan horizontal`);
      if (theme === 'light' && ['dasbor', 'faktur', 'lap-neraca', 'lap-konsolidasi', 'lap-cabang', 'bagan-akun', 'lead', 'perintah-kerja', 'kasir', 'keamanan', 'peran', 'jejak-audit'].includes(id)) {
        await page.screenshot({ path: join(shots, `${id}.png`) });
      }
    }
    check(ids.length >= 60, `${theme}: ${ids.length} menu tampil di navigasi`);
    check(empty === 0, `${theme}: semua layar menghasilkan konten`);
    check(errors.length === 0, `${theme}: tanpa galat konsol ${errors.join(' | ')}`);
    await ctx.close();
  }

  // 2) Alur transaksi.
  const { ctx, page, errors } = await session();
  await page.selectOption('[data-ctx="branch"]', { label: 'Jakarta — Kantor Pusat' });
  await page.waitForTimeout(700);
  await page.evaluate(() => { location.hash = '#/faktur'; });
  await page.waitForTimeout(700);
  await page.click('[data-new="sales_invoices"]');
  await page.waitForSelector('.modal form');
  await page.waitForTimeout(700);
  await page.selectOption('.modal [name="customer_id"]', { index: 1 });
  await page.selectOption('.modal [name="warehouse_id"]', { index: 1 });
  const l1 = page.locator('.modal tr[data-line]').first();
  await l1.locator('[name="product_id"]').selectOption({ label: 'FG-101 · Panel kontrol PK-200' });
  await l1.locator('[name="qty"]').fill('3');
  await page.screenshot({ path: join(shots, 'form-faktur.png') });
  await page.click('[data-save]');
  await page.waitForSelector('.drawer');
  await page.click('[data-action-run$=":post"]');
  await page.waitForTimeout(300);
  if (await page.$('[data-confirm-ok]')) await page.click('[data-confirm-ok]');
  await page.waitForTimeout(1000);
  check(/Terbit/.test(await page.textContent('.drawer-eyebrow')), 'faktur baru terbit setelah posting');
  check((await page.$$('.drawer [data-open^="journals:"]')).length === 1, 'faktur menghasilkan jurnal buku besar');
  await page.screenshot({ path: join(shots, 'laci-faktur.png') });
  await page.keyboard.press('Escape');

  await page.evaluate(() => { location.hash = '#/jurnal'; });
  await page.waitForTimeout(700);
  await page.click('[data-new="journals"]');
  await page.waitForTimeout(800);
  await page.fill('.modal [name="description"]', 'Uji E2E jurnal');
  await page.locator('.modal tr[data-line]').first().locator('[name="account_id"]').selectOption({ label: '6-2600 · Beban Kantor & ATK' });
  await page.locator('.modal tr[data-line]').first().locator('[name="debit"]').fill('250000');
  await page.click('[data-line-add]');
  await page.waitForTimeout(300);
  await page.locator('.modal tr[data-line]').nth(1).locator('[name="account_id"]').selectOption({ label: '1-1110 · Kas Kecil' });
  await page.locator('.modal tr[data-line]').nth(1).locator('[name="credit"]').fill('250000');
  check(/Seimbang/.test(await page.textContent('[data-lines-summary]')), 'editor jurnal menampilkan status seimbang');
  await page.click('[data-save]');
  await page.waitForSelector('.drawer');
  await page.click('[data-action-run$=":submit"]');
  await page.waitForTimeout(900);
  check(await page.$eval('[data-action-run$=":approve"]', (b) => b.disabled), 'pembuat jurnal tidak dapat menyetujui sendiri (SoD)');
  await page.keyboard.press('Escape');

  await page.selectOption('[data-ctx="branch"]', 'all');
  await page.waitForTimeout(700);
  for (const [view, tab] of [['lap-cabang', 'neraca'], ['lap-konsolidasi', 'neraca'], ['lap-konsolidasi', 'laba-rugi']]) {
    await page.evaluate((v) => { location.hash = '#/' + v; }, view);
    await page.waitForTimeout(900);
    await page.click(`[data-rtab="${tab}"]`);
    await page.waitForTimeout(1200);
    if (tab === 'neraca') check(/seimbang/.test(await page.textContent('.report-body .notice')), `${view}: neraca seimbang`);
    else check((await page.$$('.report-body tr.row-grand')).length > 0, `${view}: laba rugi tersaji`);
  }

  await page.evaluate(() => { location.hash = '#/kasir'; });
  await page.waitForTimeout(1000);
  await page.click('[data-pos-add]');
  await page.selectOption('[data-pos-form] [name="warehouse_id"]', { label: 'WH-MDN · Gudang Toko Medan' });
  await page.selectOption('[data-pos-form] [name="bank_account_id"]', { label: 'KAS-MDN · Laci Kasir Toko Medan' });
  await page.click('[data-pos-pay]');
  await page.waitForTimeout(1200);
  check((await page.$$eval('.toast', (t) => t.map((x) => x.innerText))).some((t) => /lunas/i.test(t)), 'transaksi kasir lunas & terposting');

  // Fase 2: cetak, lampiran, asisten, pencarian, rekonsiliasi, widget dasbor.
  await page.selectOption('[data-ctx="branch"]', { label: 'Jakarta — Kantor Pusat' });
  await page.waitForTimeout(700);
  await page.evaluate(() => { location.hash = '#/faktur'; });
  await page.waitForTimeout(800);
  await page.click('tbody tr[data-open] td:nth-child(2)');
  await page.waitForSelector('.drawer');
  await page.waitForTimeout(400);
  const tmpFile = join(tmp, 'bukti.txt');
  writeFileSync(tmpFile, 'Bukti transfer');
  await page.setInputFiles('[data-att-upload]', tmpFile);
  await page.waitForTimeout(900);
  check((await page.$$('.att-list li')).length === 1, 'lampiran terunggah & tercantum di rekaman');
  await page.click('[data-print-record]');
  await page.waitForSelector('.print-sheet');
  check(/rupiah/i.test(await page.textContent('.ps-words')), 'cetak faktur dengan terbilang');
  await page.screenshot({ path: join(shots, 'cetak-faktur.png') });
  await page.click('.print-toolbar [data-close]');
  await page.click('[data-open-assistant]');
  await page.fill('[data-chat-form] input', 'Apakah neraca seimbang?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  check(/seimbang/.test((await page.$$eval('.chat-bot', (e) => e.map((x) => x.innerText))).pop()), 'asisten menjawab dari buku besar');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.fill('[data-palette-input]', 'astra');
  await page.waitForTimeout(1300);
  check((await page.$$('[data-palette-list] [data-open]')).length > 0, 'pencarian global menemukan dokumen');
  await page.keyboard.press('Escape');
  await page.selectOption('[data-ctx="branch"]', 'all');
  await page.waitForTimeout(700);
  await page.evaluate(() => { location.hash = '#/rekonsiliasi'; });
  await page.waitForTimeout(800);
  await page.click('[data-status="draf"]');
  await page.waitForTimeout(500);
  await page.click('tbody tr[data-open] td:nth-child(2)');
  await page.click('[data-recon-open]');
  await page.waitForTimeout(1000);
  await page.click('[data-recon-all]');
  check(/Rp 0$/.test((await page.textContent('[data-recon-diff]')).trim()), 'rekonsiliasi bank: selisih nol setelah mencocokkan mutasi');
  await page.screenshot({ path: join(shots, 'rekonsiliasi.png') });
  await page.evaluate(() => { location.hash = '#/dasbor'; });
  await page.waitForTimeout(1200);
  await page.click('[data-dash-config]');
  await page.uncheck('[data-wcheck="trend"]');
  await page.click('[data-wsave]');
  await page.waitForTimeout(1200);
  check(!(await page.$('[data-chart="rev"]')), 'widget dasbor dapat disembunyikan & tersimpan');
  for (const v of ['analitik', 'bsc', 'mrp', 'lap-pajak', 'kartu-piutang']) {
    await page.evaluate((x) => { location.hash = '#/' + x; }, v);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(shots, `${v}.png`) });
  }

  // Penganggaran: anggaran vs realisasi (3 tampilan), salin anggaran, kolom anggaran COA, laporan proyek.
  await page.evaluate(() => { location.hash = '#/realisasi-anggaran'; });
  await page.waitForSelector('[data-report-body] .report-table', { timeout: 8000 });
  check((await page.$$('[data-report-body] tr[data-gl]')).length > 10, 'anggaran vs realisasi: baris akun tampil');
  await page.screenshot({ path: join(shots, 'anggaran-realisasi.png'), fullPage: true });
  await page.click('[data-bview="bulanan"]');
  await page.waitForTimeout(1200);
  check((await page.$$eval('[data-report-body] thead th', (t) => t.length)) === 14, 'anggaran: matriks 12 bulan');
  await page.click('[data-bview="pusat-biaya"]');
  await page.waitForTimeout(1200);
  check(/CC-300/.test(await page.textContent('[data-report-body]')), 'anggaran: rincian per pusat biaya');
  await page.click('[data-budget-copy]');
  await page.fill('[data-budget-copy-form] [name=toYear]', '2027');
  await page.fill('[data-budget-copy-form] [name=fromYear]', '2026');
  await page.click('[data-budget-copy-run]');
  await page.waitForTimeout(1500);
  check(/2027/.test(await page.textContent('.report-head')), 'salin anggaran 2026 → 2027 (draf) & tampil di versi semua');
  await page.evaluate(() => { location.hash = '#/bagan-akun'; });
  await page.waitForTimeout(1500);
  check(/Anggaran 20\d\d/i.test(await page.textContent('.coa-table thead')), 'bagan akun: kolom anggaran & realisasi');
  await page.evaluate(() => { location.hash = '#/lap-proyek'; });
  await page.waitForSelector('[data-proj-open]');
  await page.screenshot({ path: join(shots, 'laporan-proyek.png') });
  await page.click('[data-proj-open]');
  await page.waitForSelector('[data-chart="scurve"] svg', { timeout: 8000 });
  check(/RAB/.test(await page.textContent('.view-root')), 'laporan proyek: rincian RAB, kurva-S, transaksi');
  await page.screenshot({ path: join(shots, 'laporan-proyek-rinci.png'), fullPage: true });

  // Tampilan sempit (ponsel).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = '#/dasbor'; });
  await page.waitForTimeout(900);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'tanpa luapan horizontal pada 390 px');
  await page.screenshot({ path: join(shots, 'dasbor-390.png') });

  await page.click('[data-open-user]');
  await page.click('.menu [data-logout]');
  await page.waitForSelector('#lg-user');
  check(true, 'keluar mengembalikan ke layar masuk');
  check(errors.length === 0, `alur transaksi tanpa galat konsol ${errors.join(' | ')}`);
  await ctx.close();

  // Portal pelanggan.
  const pctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const pp = await pctx.newPage();
  const perr = [];
  pp.on('pageerror', (e) => perr.push(e.message));
  await pp.goto(base + '/');
  await pp.fill('#lg-user', 'portal.astra');
  await pp.fill('#lg-pass', 'Erp#Demo2026!');
  await pp.click('button[type=submit]');
  await pp.waitForSelector('.portal-shell');
  await pp.click('[data-portal-tab="invoices"]');
  await pp.waitForTimeout(700);
  await pp.click('[data-portal-doc]');
  await pp.waitForSelector('.print-sheet');
  await pp.screenshot({ path: join(shots, 'portal-faktur.png') });
  check(perr.length === 0 && !(await pp.$('.rail')), 'portal pelanggan terpisah dari aplikasi internal');
  await pctx.close();

  // Peran terbatas: tidak ada galat API saat menjelajah menu & membuka formulir.
  for (const user of ['yoga.kasir', 'sari.sales', 'dewi.hr', 'auditor']) {
    const rc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const rp = await rc.newPage();
    const errs = [];
    rp.on('pageerror', (e) => errs.push(e.message));
    rp.on('response', (r) => { if (r.status() >= 400 && r.status() !== 401 && r.url().includes('/api/')) errs.push(`${r.status()} ${r.url().replace(base, '')}`); });
    await rp.goto(base + '/');
    await rp.fill('#lg-user', user);
    await rp.fill('#lg-pass', 'Erp#Demo2026!');
    await rp.click('button[type=submit]');
    await rp.waitForSelector('.rail');
    for (const navId of await rp.$$eval('.rail [data-nav]', (els) => els.map((e) => e.dataset.nav))) {
      await rp.evaluate((i) => { location.hash = '#/' + i; }, navId);
      await rp.waitForTimeout(350);
      const nb = await rp.$('[data-new]');
      if (nb) { await nb.click(); await rp.waitForTimeout(400); await rp.keyboard.press('Escape'); }
    }
    check(errs.length === 0, `peran ${user}: tanpa galat API ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
    await rc.close();
  }
} catch (err) {
  failures.push(err.message);
  console.error(err);
} finally {
  await browser.close();
  cleanup();
}

console.log(failures.length ? `\n${failures.length} pemeriksaan GAGAL:\n- ${failures.join('\n- ')}` : '\nSemua pemeriksaan E2E lulus.');
process.exit(failures.length ? 1 : 0);
