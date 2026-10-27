// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Review page listing every template (and its variants) — dev server only.
 * @type {import('astro').AstroIntegration}
 */
const devCatalog = {
  name: 'dev-catalog',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev') {
        injectRoute({ pattern: '/dev/catalog', entrypoint: './src/dev/catalog.astro', prerender: false });
      }
    },
  },
};

// Set SITE / BASE_PATH when deploying under a sub-path (e.g. GitHub Pages).
export default defineConfig({
  site: process.env.SITE,
  base: process.env.BASE_PATH ?? '/',
  integrations: [react(), devCatalog],
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
