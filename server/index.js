/**
 * Production entry point: `npm start`.
 *
 * Environment:
 *   PORT            Port to listen on (Render provides this).
 *   BACKEND_URL     Origin of the FastAPI service, e.g. https://precursorx-backend.onrender.com
 *                   (required in production; defaults to http://127.0.0.1:8000 elsewhere).
 *   PUBLIC_ORIGIN   Optional comma-separated extra origins allowed to make state-changing calls
 *                   (only needed if browsers reach this server through a different Host than it sees).
 *   PROXY_TIMEOUT_MS Idle timeout for backend requests in ms (default 120000).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { normalizeBackendUrl } from './proxy.js';

const isProduction = process.env.NODE_ENV === 'production';
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '..', 'dist');

let backendUrl;
try {
  backendUrl = normalizeBackendUrl(process.env.BACKEND_URL || 'https://precursorx-backend.onrender.com').origin;
} catch (err) {
  console.error(`[server] Configuration error: ${err.message}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  const msg = '[server] dist/index.html not found. Run "npm run build" before "npm start".';
  if (isProduction) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(msg);
}

const port = Number(process.env.PORT) || 3000;
const timeoutMs = Number(process.env.PROXY_TIMEOUT_MS) || 120_000;
const allowedOrigins = (process.env.PUBLIC_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);

const app = createApp({ backendUrl, distDir, timeoutMs, allowedOrigins });
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[server] PRECURSOR-X frontend listening on :${port}; proxying /api/* to ${backendUrl}`);
});

// Longer than typical load-balancer idle timeouts, to avoid spurious 502s on reused connections.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
