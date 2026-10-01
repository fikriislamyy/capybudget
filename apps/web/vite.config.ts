import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/api': { target: process.env.API_INTERNAL_URL ?? 'http://localhost:3000', changeOrigin: false } } },
  preview: { proxy: { '/api': { target: process.env.API_INTERNAL_URL ?? 'http://localhost:3000', changeOrigin: false } } },
  plugins: [tailwindcss(), sveltekit(), VitePWA({
    registerType: 'autoUpdate',
    workbox: {
      importScripts: ['/push-worker.js'],
      navigateFallback: undefined,
      runtimeCaching: [{urlPattern: /\/api\//,handler: 'NetworkOnly'}],
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
      theme_color: '#397958',
      background_color: '#f5f7f4',
      display: 'standalone',
      start_url: '/'
    }
  })]
});
