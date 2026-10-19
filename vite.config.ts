import { defineConfig, type Plugin } from 'vite';

// Web shell is index.html; the Playgama Bridge bootstrap lives in src/platform/bridgeBootstrap.ts.
// Phaser is split into its own chunk so the (small) game code can change without re-downloading it.

/** Production only: load the bundled Bridge with a static classic script before the game module (dev runs without it). */
const bundledBridge = (): Plugin => ({
  name: 'bundled-bridge',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'script', attrs: { src: './playgama-bridge.js' }, injectTo: 'head' }],
});

export default defineConfig({
  base: './',
  plugins: [bundledBridge()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
  },
  server: { host: '0.0.0.0', port: 5180, open: false },
});
