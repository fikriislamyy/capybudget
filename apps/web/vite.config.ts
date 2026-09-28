import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), VitePWA({
    registerType: 'autoUpdate',
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
