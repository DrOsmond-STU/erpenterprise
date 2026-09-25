import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

/* /api diproksi ke API agar cookie refresh (SameSite=Strict) tetap same-origin, baik dev maupun preview. */
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: API, changeOrigin: false } } },
  preview: { port: 5173, strictPort: true, proxy: { '/api': { target: API, changeOrigin: false } } },
  build: { sourcemap: false, target: 'es2022' },
});
