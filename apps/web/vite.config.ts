import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  // Separate browser-check servers from the user's running development server.
  // Otherwise one optimizer can replace chunks still used by the other's open tabs.
  cacheDir: process.env.CAPY_VITE_CACHE_DIR ?? 'node_modules/.vite',
  optimizeDeps: {
    // These icons are used by the lazy chat room. Discover them at startup so
    // opening the widget does not introduce a new Svelte runtime bundle.
    include: ['@lucide/svelte/icons/mic', '@lucide/svelte/icons/send', '@lucide/svelte/icons/square'],
  },
  server: { proxy: { '/api': { target: process.env.API_INTERNAL_URL ?? 'http://localhost:3000', changeOrigin: false } } },
  preview: { proxy: { '/api': { target: process.env.API_INTERNAL_URL ?? 'http://localhost:3000', changeOrigin: false } } },
  plugins: [tailwindcss(), sveltekit(), VitePWA({
    registerType: 'autoUpdate',
    workbox: {
      importScripts: ['/push-worker.js'],
      navigateFallback: undefined,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      // Authenticated HTML/data must come from the current server build, never
      // an old cached page whose route components can differ after an update.
      runtimeCaching: [
        {urlPattern: ({ request, url }) => request.mode === 'navigate' || url.pathname.endsWith('/__data.json'), handler: 'NetworkOnly'},
        {urlPattern: /\/api\//,handler: 'NetworkOnly'},
      ],
      navigateFallbackDenylist: [
        /^\/api\//,
        /^\/dashboard(?:\/|$)/,
        /^\/onboarding(?:\/|$)/,
        /^\/(?:login|sign-up|verify-email|forgot-password|reset-password)(?:\/|$)/
      ]
    },
    manifest: {
      name: 'CapyBudget',
      short_name: 'CapyBudget',
      description: 'A clear view of your money.',
      theme_color: '#8A5F3A',
      background_color: '#FFF8EC',
      display: 'standalone',
      start_url: '/'
    }
  })]
});
