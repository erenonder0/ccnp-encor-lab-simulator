import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
    allowedHosts: ['5a18-176-33-61-158.ngrok-free.app'],
    watch: {
      // backend bu dosyalari calisirken yazar (or. data/progress.json); frontend hicbirini
      // import etmiyor, izlenirse her "Kontrol Et" tikinde gereksiz tam sayfa reload olur
      ignored: ['**/data/**', '**/work/**'],
    },
  },
});
