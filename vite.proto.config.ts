// 視覺原型專用建置：只打包 proto.html，輸出到 dist-proto/，有自己的 Service Worker（不影響正式版）。
// npx vite build -c vite.proto.config.ts
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist-proto', chunkSizeWarningLimit: 3000, assetsInlineLimit: 0, rollupOptions: { input: { proto: 'proto.html' } } },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      filename: 'proto-sw.js',
      manifestFilename: 'proto.webmanifest',
      manifest: {
        name: '亡者之塔 視覺原型', short_name: '塔原型', lang: 'zh-Hant', start_url: './proto.html', scope: './',
        display: 'fullscreen', orientation: 'landscape', background_color: '#05080a', theme_color: '#05080a',
        icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      },
      workbox: {
        globPatterns: ['proto.html', 'assets/*.js', 'models/kaykit/*.glb', 'icons/icon-192.png', 'proto.webmanifest'],
        maximumFileSizeToCacheInBytes: 8_000_000,
        cleanupOutdatedCaches: true,
        navigateFallback: 'proto.html',
        cacheId: 'tower-proto',
      },
    }),
  ],
});
