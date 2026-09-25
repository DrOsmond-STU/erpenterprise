/**
 * Merakit pohon deploy untuk shared hosting cPanel (tanpa build di server):
 *
 *   <out>/               hasil build SPA (index.html, assets/) + .htaccess
 *   <out>/server/        dist API, node_modules produksi, @erp/domain, aset purwarupa
 *                        untuk seed, erp-runner.sh
 *
 * Pohon ini di-commit sebagai branch deploy/hosting lalu ditarik Git Deploy
 * cPanel ke document root. Jalankan setelah `npm run build:all`:
 *
 *   node tools/build-hosting.mjs [dir-keluaran]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(process.argv[2] || resolve(root, 'dist/hosting'));
const must = (p) => { if (!existsSync(p)) throw new Error(`Belum ada: ${p} — jalankan npm run build:all dulu`); return p; };

rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'server'), { recursive: true });

cpSync(must(resolve(root, 'apps/web/dist')), out, { recursive: true });
cpSync(resolve(root, 'infra/hosting/htaccess'), resolve(out, '.htaccess'));
cpSync(must(resolve(root, 'apps/api/dist')), resolve(out, 'server/dist'), { recursive: true });
cpSync(resolve(root, 'infra/hosting/erp-runner.sh'), resolve(out, 'server/erp-runner.sh'));
cpSync(resolve(root, 'infra/hosting/env.example'), resolve(out, 'server/env.example'));
mkdirSync(resolve(out, 'server/prototype-assets'));
for (const f of ['data.js', 'charts.js', 'ledger.js']) cpSync(resolve(root, 'prototype/assets', f), resolve(out, 'server/prototype-assets', f));

const apiPkg = JSON.parse(readFileSync(resolve(root, 'apps/api/package.json'), 'utf8'));
const deps = { ...apiPkg.dependencies }; delete deps['@erp/domain'];
const serverPkg = { name: 'erp-server', version: apiPkg.version, private: true, description: 'ERP Enterprise — artefak API untuk hosting', dependencies: deps };
writeFileSync(resolve(out, 'server/package.json'), JSON.stringify(serverPkg, null, 2) + '\n');

/* Dependensi produksi dipasang di direktori kerja terpisah agar tidak membawa
   symlink workspace, lalu disalin. */
const work = resolve(out, '../hosting-deps');
rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
writeFileSync(resolve(work, 'package.json'), JSON.stringify({ name: 'erp-server-deps', private: true, dependencies: deps }));
execSync('npm install --omit=dev --no-audit --no-fund --silent', { cwd: work, stdio: 'inherit' });
cpSync(resolve(work, 'node_modules'), resolve(out, 'server/node_modules'), { recursive: true });
rmSync(work, { recursive: true, force: true });

const dom = resolve(out, 'server/node_modules/@erp/domain');
mkdirSync(dom, { recursive: true });
cpSync(resolve(root, 'packages/domain/package.json'), resolve(dom, 'package.json'));
cpSync(must(resolve(root, 'packages/domain/dist')), resolve(dom, 'dist'), { recursive: true });

writeFileSync(resolve(out, 'README.md'), `# ERP Enterprise — artefak hosting\n\nBranch ini dibangkitkan oleh \`tools/build-hosting.mjs\`; jangan disunting langsung.\nSumber: branch pengembangan di repositori yang sama. Lihat infra/hosting/ pada sumber.\n`);
console.log('Pohon deploy siap di', out);
