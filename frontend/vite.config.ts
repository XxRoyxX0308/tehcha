import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022' }, // main.ts uses top-level await
  // the API runs on :8787 in development (npm run dev:api); on Vercel both share one origin
  server: { proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } } },
  test: { environment: 'node' },
})
