import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'dist', 'prototipe.html');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const views = ['dasbor','kas-bank','rantai-pasok','anggaran','bagan-akun','kasir','piutang','lead','proyek'];
for (const v of views) {
  await page.goto(`file://${filePath}#/${v}`);
  await page.waitForTimeout(600);
}
await browser.close();
if (errors.length) { console.log('ERRORS:', errors); process.exit(1); }
else { console.log('No JS errors across', views.length, 'views'); }
