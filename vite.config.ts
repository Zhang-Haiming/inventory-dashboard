import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Tauri 要求：不使用 localhost，改用 127.0.0.1
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
  },
  // 生产构建输出到 dist/，tauri.conf.json 里 frontendDist 指向这里
  build: {
    outDir: 'dist',
    target: ['es2021', 'chrome105', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
