import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// 扩展脚本构建：background.js、content.js 与 content-main.js 均为自包含单文件。
// - background.js：ESM Service Worker（manifest type=module）
// - content.js   ：classic 注入，禁止出现 import/export
// - content-main.js：MAIN 世界桥（SPA history 包装），同样自包含
// 各入口之间不共享任何运行时模块，Rollup 不会产生共享 chunk。
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome116',
    minify: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/main.ts'),
        'content-main': resolve(__dirname, 'src/content/spa-bridge.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
      },
    },
  },
})
