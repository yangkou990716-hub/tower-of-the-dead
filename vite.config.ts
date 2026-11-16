import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// base './' → 可部署在任何子路徑（GitHub Pages 的 /repo/ 也可）
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2020', chunkSizeWarningLimit: 3000, assetsInlineLimit: 0 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['fonts/*.woff2', 'icons/*.png'],
      manifest: {
        name: '亡者之塔：無盡深界',
        short_name: '亡者之塔',
        description: '提燈走入倒懸之塔的動作 Roguelike。完全離線可玩。',
        lang: 'zh-Hant',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#0b0e12',
        theme_color: '#0b0e12',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8_000_000,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // 3D 模型（只有選 3D 畫面時才下載）：第一次載入後快取，之後可離線
        runtimeCaching: [{ urlPattern: /\/models\/.*\.glb$/, handler: 'CacheFirst', options: { cacheName: 'tower-models', expiration: { maxEntries: 80 } } }],
      },
    }),
  ],
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
} as any);
