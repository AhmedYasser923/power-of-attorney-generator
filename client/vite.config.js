import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/css': 'http://localhost:3000',
      '/js': 'http://localhost:3000',
      '/generate-standard': 'http://localhost:3000',
      '/generate-lufthansa': 'http://localhost:3000',
      '/generate-aerlingus': 'http://localhost:3000',
      '/logout': 'http://localhost:3000'
    }
  }
});
