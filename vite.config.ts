import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { coffeeData } from './lib/vite-plugin-coffee.ts';

// GitHub Pages serves this repo from /personal-site/; CI passes the exact path
// through BASE_PATH so a custom domain later just works.
function basePath(): string {
  const raw = process.env.BASE_PATH ?? '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

// Absolute URL of the published site, for link previews (og:image needs one).
const siteUrl = (process.env.SITE_URL || 'https://rohit9mehta.github.io/personal-site').replace(/\/$/, '');

export default defineConfig({
  base: basePath(),
  plugins: [
    react(),
    coffeeData(),
    { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl) },
  ],
  build: {
    // MapLibre alone is ~1 MB; it gets its own lazily loaded chunk.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        coffee: resolve(import.meta.dirname, 'coffee/index.html'),
      },
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
