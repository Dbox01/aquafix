import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// DISABLE_PWA=1 for the hosted single-file build: the service worker would
// look for /sw.js, which an Edge Function bundle does not serve.
const pwaDisabled = process.env.DISABLE_PWA === '1';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    ...(pwaDisabled ? [] : [
    // The field-capture half of AquaFix runs on phones with unreliable signal.
    // See CLAUDE.md, "The mobile half is real".
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'AquaFix',
        short_name: 'AquaFix',
        description: 'Asset inspection and incident management',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        // Relative, not '/'. GitHub Pages serves the app from /<repo>/, so an
        // absolute start_url would launch the installed PWA at the domain root
        // and show a 404.
        start_url: './',
        scope: './',
      },
    })]),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
