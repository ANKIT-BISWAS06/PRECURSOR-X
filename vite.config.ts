import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: true,
      proxy: {
        '/api': {
          target: process.env.BACKEND_URL || 'https://precursor-x-backend.onrender.com',
          changeOrigin: true,
          secure: true,
          cookieDomainRewrite: '',
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const cookies = proxyRes.headers['set-cookie'];
              if (cookies && Array.isArray(cookies)) {
                proxyRes.headers['set-cookie'] = cookies.map((cookieStr: string) => {
                  let updated = cookieStr.replace(/;\s*Domain=[^;]+/i, '');
                  if (!/;\s*Secure/i.test(updated)) {
                    updated += '; Secure';
                  }
                  if (/;\s*SameSite=[^;]+/i.test(updated)) {
                    updated = updated.replace(/;\s*SameSite=[^;]+/i, '; SameSite=None');
                  } else {
                    updated += '; SameSite=None';
                  }
                  if (!/;\s*Partitioned/i.test(updated)) {
                    updated += '; Partitioned';
                  }
                  return updated;
                });
              }
            });
          },
        },
      },
    },
  };
});
