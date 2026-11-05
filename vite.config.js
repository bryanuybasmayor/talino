import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves project sites under /<repo>/, so the built bundle needs
  // that prefix. `vite dev` keeps serving from the root.
  base: command === 'build' ? (process.env.BASE_PATH || '/talino/') : '/',
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
