import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['refly-workspace.refly.com'],
    proxy: {
      '/api': 'http://localhost:3000',
      '/css': 'http://localhost:3000',
      '/js': 'http://localhost:3000',
      '/generate-standard': 'http://localhost:3000',
      '/generate-lufthansa': 'http://localhost:3000',
      '/generate-aerlingus': 'http://localhost:3000',
      '/admin/users': 'http://localhost:3000',
      '/admin/usage': 'http://localhost:3000',
      '/admin/logs': 'http://localhost:3000',
      '/admin/reload-clients': 'http://localhost:3000',
      '/admin/recalculate-costs': 'http://localhost:3000',
      '/logout': 'http://localhost:3000'
    }
  }
});
