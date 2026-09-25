/* Menyalin token & gaya purwarupa ke paket @erp/ui agar aplikasi Vue memakai sumber yang sama. */
import { copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['tokens.css', 'app.css']) copyFileSync(resolve(root, 'prototype/assets', f), resolve(root, 'packages/ui', f));
console.log('packages/ui disinkronkan dari prototype/assets');
