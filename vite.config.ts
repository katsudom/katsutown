import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Deployment base path.
//  - GitHub Pages project site:  BASE_PATH=/katsutown/  (i.e. your repo name)
//  - Root/custom domain:         BASE_PATH=/
// Defaults to the GitHub Pages repo subpath; override with an env var at build time.
const base = process.env.BASE_PATH ?? '/katsutown/';

export default defineConfig(({ command, isPreview }) => ({
  // The deploy subpath only matters for the built site. Serving it in dev would
  // mean browsing to http://localhost:5173/katsutown/, which helps nobody.
  // `preview` serves the BUILT files, whose URLs already bake in the subpath,
  // so it has to mount at the same base or every asset 404s back to index.html.
  base: command === 'build' || isPreview ? base : '/',
  plugins: [react()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0, // keep pixel-art PNGs as real files so the browser can cache them
    // Phaser alone is ~1.5 MB, which is expected and is split into its own
    // cacheable chunk below. Raise the warning threshold past it so a genuine
    // regression in our own code still trips the warning.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        classic: resolve(__dirname, 'classic.html'),
      },
      output: {
        // Phaser is ~1.5 MB and never changes between deploys. Splitting it out
        // means a content change ships a small chunk and leaves the engine cached.
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
}));
