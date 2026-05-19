import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

// During `nodemon` restarts there is a brief window where the backend port is
// closed; any in-flight request the browser makes lands as ECONNREFUSED and
// Vite prints a noisy stack trace. Catch it, respond quietly with 503, and
// let everything else log normally.
const isBackendDown = (err) => {
  if (!err) return false;
  if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') return true;
  if (Array.isArray(err.errors)) {
    return err.errors.some((e) => e?.code === 'ECONNREFUSED' || e?.code === 'ECONNRESET');
  }
  return false;
};

const proxyConfig = {
  target: proxyTarget,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('error', (err, _req, res) => {
      if (isBackendDown(err)) {
        try {
          if (res && !res.headersSent && typeof res.writeHead === 'function') {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Backend restarting' }));
          } else if (res && typeof res.end === 'function') {
            res.end();
          }
        } catch { /* socket already closed */ }
        return;
      }
      console.error('[vite proxy]', err.message || err);
    });
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['localhost', '127.0.0.1', 'refly-workspace.refly.com'],
    proxy: {
      '/api': proxyConfig,
      '/css': proxyConfig,
      '/js': proxyConfig,
      '/generate-standard': proxyConfig,
      '/generate-lufthansa': proxyConfig,
      '/generate-aerlingus': proxyConfig,
      '/admin/users': proxyConfig,
      '/admin/usage': proxyConfig,
      '/admin/logs': proxyConfig,
      '/admin/reload-clients': proxyConfig,
      '/admin/recalculate-costs': proxyConfig,
      '/logout': proxyConfig,
    },
  },
});
