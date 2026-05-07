import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['localhost', '127.0.0.1', 'refly-workspace.refly.com'],
    proxy: {
      '/api': proxyTarget,
      '/css': proxyTarget,
      '/js': proxyTarget,
      '/generate-standard': proxyTarget,
      '/generate-lufthansa': proxyTarget,
      '/generate-aerlingus': proxyTarget,
      '/admin/users': proxyTarget,
      '/admin/usage': proxyTarget,
      '/admin/logs': proxyTarget,
      '/admin/reload-clients': proxyTarget,
      '/admin/recalculate-costs': proxyTarget,
      '/logout': proxyTarget
    }
  }
});
