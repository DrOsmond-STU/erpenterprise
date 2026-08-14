/* Uji asap purwarupa: buka setiap layar di kedua tema, tangkap galat konsol,
 * periksa luapan horizontal, lalu simpan tangkapan layar ke dist/shots/.
 *
 *   node tools/smoke.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + resolve(root, 'dist/prototipe.html');
const shots = resolve(root, 'dist/shots');
await mkdir(shots, { recursive: true });

const VIEWS = [
  'dasbor', 'pesanan-penjualan', 'faktur', 'pelanggan', 'pesanan-pembelian',
  'pemasok', 'stok', 'mutasi', 'perintah-kerja', 'piutang', 'jurnal',
  'karyawan', 'peran', 'pengaturan', 'sistem-desain',
  'lead', 'penawaran', 'kasir', 'permintaan-pembelian', 'proyek',
  'anggaran', 'penggajian', 'aset', 'pemeliharaan', 'dokumen', 'jejak-audit',
];

const problems = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${scheme}] console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${scheme}] pageerror: ${e.message}`));

  for (const view of VIEWS) {
    await page.goto(`${url}#/${view}`);
    await page.evaluate((v) => { location.hash = `#/${v}`; }, view);
    await page.waitForTimeout(220);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push(`[${scheme}] ${view}: badan meluap ${overflow}px secara horizontal`);

    const empty = await page.evaluate(() => document.querySelector('.content-inner')?.children.length ?? 0);
    if (!empty) problems.push(`[${scheme}] ${view}: konten kosong`);

    if (scheme === 'light' || ['dasbor', 'pesanan-penjualan', 'perintah-kerja'].includes(view)) {
      await page.screenshot({ path: resolve(shots, `${scheme}-${view}.png`), fullPage: false });
    }
  }

  /* Interaksi: laci rekaman, palet perintah, modal, dan tema. */
  await page.goto(`${url}#/pesanan-penjualan`);
  await page.waitForTimeout(200);
  await page.click('tbody tr[data-row]');
  await page.waitForTimeout(250);
  if (!(await page.locator('.drawer').count())) problems.push(`[${scheme}] laci rekaman tidak terbuka`);
  await page.screenshot({ path: resolve(shots, `${scheme}-laci.png`) });
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k');
  await page.waitForTimeout(220);
  if (!(await page.locator('.palette').count())) problems.push(`[${scheme}] palet perintah tidak terbuka`);
  await page.fill('#palette-input', 'sentosa');
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(shots, `${scheme}-palet.png`) });
  await page.keyboard.press('Escape');

  await page.click('[data-action="new-so"]');
  await page.waitForTimeout(250);
  if (!(await page.locator('.modal').count())) problems.push(`[${scheme}] modal pesanan baru tidak terbuka`);
  await page.screenshot({ path: resolve(shots, `${scheme}-modal.png`) });
  await page.click('[data-action="submit-so"][data-mode="kirim"]');
  await page.waitForTimeout(300);
  if (!(await page.locator('.toast').count())) problems.push(`[${scheme}] toast tidak muncul setelah simpan`);

  await ctx.close();
}

/* Lebar sempit — rail menciut, tabel menggulir di dalam wadahnya. */
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push(`[mobile] pageerror: ${e.message}`));
for (const view of ['dasbor', 'pesanan-penjualan', 'perintah-kerja']) {
  await page.goto(`${url}#/${view}`);
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) problems.push(`[mobile] ${view}: badan meluap ${overflow}px`);
  await page.screenshot({ path: resolve(shots, `mobile-${view}.png`), fullPage: false });
}
await ctx.close();
await browser.close();

if (problems.length) {
  console.error(`GAGAL — ${problems.length} masalah:`);
  for (const p of problems) console.error('  · ' + p);
  process.exit(1);
}
console.log(`LULUS — ${VIEWS.length} layar × 2 tema + interaksi + tampilan sempit, tanpa galat.`);
