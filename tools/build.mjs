/* Menggabungkan purwarupa menjadi berkas tunggal.
 *
 *   node tools/build.mjs
 *
 * Keluaran:
 *   dist/prototipe.html — dokumen lengkap, dapat dibuka langsung di peramban
 *   dist/artifact.html  — hanya isi badan, untuk penerbit yang membungkus
 *                         sendiri <!doctype>/<head>/<body>
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(resolve(root, p), 'utf8');

const [html, tokens, appCss, dataJs, chartsJs, appJs] = await Promise.all([
  read('prototype/index.html'),
  read('prototype/assets/tokens.css'),
  read('prototype/assets/app.css'),
  read('prototype/assets/data.js'),
  read('prototype/assets/charts.js'),
  read('prototype/assets/app.js'),
]);

const styles = `<style>\n${tokens}\n${appCss}\n</style>`;
const scripts = `<script>\n${dataJs}\n${chartsJs}\n${appJs}\n</script>`;

/* Penggantian memakai fungsi, bukan string: pola `$$`/`$&` di dalam kode
   sumber akan ditafsirkan sebagai rujukan khusus bila dilewatkan sebagai
   string pengganti — dan `$$` diam-diam menjadi `$`. */
const standalone = html
  .replace(
    /<link rel="stylesheet" href="assets\/tokens\.css">\s*<link rel="stylesheet" href="assets\/app\.css">/,
    () => styles,
  )
  .replace(
    /<script src="assets\/data\.js"><\/script>\s*<script src="assets\/charts\.js"><\/script>\s*<script src="assets\/app\.js"><\/script>/,
    () => scripts,
  );

if (standalone.includes('assets/')) {
  throw new Error('Masih ada rujukan ke assets/ — pola penggantian tidak cocok.');
}

/* Versi artifact: tanpa <!doctype>/<html>/<head>/<body>, tetapi <title> tetap
   di awal agar terbaca oleh penerbit. */
const body = standalone
  .slice(standalone.indexOf('<body>') + '<body>'.length, standalone.lastIndexOf('</body>'))
  .trim();

const artifact = `<title>ERP Enterprise</title>\n${styles}\n${body}`;

await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/prototipe.html'), standalone);
await writeFile(resolve(root, 'dist/artifact.html'), artifact);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;
console.log(`dist/prototipe.html  ${kb(standalone)}`);
console.log(`dist/artifact.html   ${kb(artifact)}`);
