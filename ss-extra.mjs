import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'dist', 'prototipe.html');
const ssDir = '/tmp/claude-0/-home-user-erpenterprise/6e4e2e82-53ea-5102-98f9-624e15d1a975/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const v of ['lead', 'proyek', 'dasbor']) {
  await page.goto(`file://${filePath}#/${v}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${ssDir}/tbl-${v}.png`, fullPage: false });
  console.log(v);
}
await browser.close();
