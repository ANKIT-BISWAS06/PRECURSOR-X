/**
 * Express application: serves the compiled Vite frontend and proxies /api/* to FastAPI.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApiProxy, sendJson } from './proxy.js';

export function createApp({ backendUrl, distDir, timeoutMs, allowedOrigins = [], logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Local liveness check (does not depend on the backend). /api/v1/health is proxied to FastAPI.
  app.get('/healthz', (_req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.json({ status: 'ok', service: 'precursorx-frontend' });
  });

  // No body parser is mounted before the proxy: bodies are streamed through untouched.
  app.use('/api', createApiProxy({ target: backendUrl, timeoutMs, allowedOrigins, logger }));

  const indexHtml = path.join(distDir, 'index.html');

  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  // React Router fallback: only for page navigations, never for missing files or API calls.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (path.extname(req.path)) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    if (!fs.existsSync(indexHtml)) {
      sendJson(res, 503, { detail: 'The frontend build is missing. Run "npm run build" first.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });

  app.use((_req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });

  return app;
}
