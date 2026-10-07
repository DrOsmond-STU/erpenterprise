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
import { mkdirSync, mkdtempSync, existsSync } from 'node:fs';
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
} catch (err) {
  failures.push(err.message);
  console.error(err);
} finally {
  await browser.close();
  cleanup();
}

console.log(failures.length ? `\n${failures.length} pemeriksaan GAGAL:\n- ${failures.join('\n- ')}` : '\nSemua pemeriksaan E2E lulus.');
process.exit(failures.length ? 1 : 0);
