/**
 * Same-origin API proxy for PRECURSOR-X.
 *
 *   Browser -> this Node/Express server (same origin) -> FastAPI backend -> PostgreSQL
 *
 * The browser only ever talks to its own origin, so the HttpOnly session cookie issued by
 * FastAPI is a first-party cookie. This module is deliberately built on Node's http/https
 * modules (no body parsing): request and response bodies are streamed through untouched, so
 * JSON, text, binary and empty responses all behave the same, and every request header
 * (including Cookie) and every response header (including multiple Set-Cookie headers) is
 * preserved.
 *
 * Security notes:
 *  - Nothing sensitive is logged: no headers, cookies, bodies or query strings. Only
 *    method, path (without query), status and duration.
 *  - The upstream host is fixed by configuration; the request path can never change it.
 *  - State-changing requests (POST/PUT/PATCH/DELETE) that carry a browser Origin header from a
 *    different origin are rejected (defence in depth next to SameSite cookies).
 */
import http from 'node:http';
import https from 'node:https';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function sendJson(res, status, body) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-length', Buffer.byteLength(payload));
  res.end(payload);
}

/** Names listed in a Connection header are hop-by-hop for that message as well. */
function connectionTokens(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeBackendUrl(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('BACKEND_URL is required, e.g. https://precursorx-backend.onrender.com');
  }
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('BACKEND_URL is not a valid URL: it must look like https://host or http://host:port');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('BACKEND_URL must use http:// or https://');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      'BACKEND_URL must be an origin only (no path, query or fragment). ' +
        'Use https://host, not https://host/api/v1: the /api/v1 prefix is added by the frontend.'
    );
  }
  return url;
}

function sameOrigin(origin, hostHeader, forwardedHost) {
  try {
    const originHost = new URL(origin).host.toLowerCase();
    if (originHost === String(hostHeader || '').toLowerCase()) return true;
    if (forwardedHost && originHost === String(forwardedHost).toLowerCase()) return true;
    return false;
  } catch {
    return false; // includes the literal string "null"
  }
}

/**
 * @param {object} options
 * @param {string} options.target            Backend origin, e.g. https://precursorx-backend.onrender.com
 * @param {number} [options.timeoutMs]       Idle timeout for the upstream connection (default 120s, enough for a cold start)
 * @param {string[]} [options.allowedOrigins] Extra browser origins allowed to make state-changing calls
 * @param {{info?:Function,warn?:Function,error?:Function}} [options.logger]
 */
export function createApiProxy({ target, timeoutMs = 120_000, allowedOrigins = [], logger = console } = {}) {
  const base = normalizeBackendUrl(target);
  const transport = base.protocol === 'https:' ? https : http;
  const agent = new transport.Agent({ keepAlive: true, maxSockets: 64 });
  const allowed = new Set(allowedOrigins.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean));
  const log = (level, message) => {
    const fn = logger && typeof logger[level] === 'function' ? logger[level] : null;
    if (fn) fn.call(logger, message);
  };

  return function apiProxy(req, res) {
    const started = Date.now();
    // Express strips the mount path from req.url; originalUrl keeps the full /api/... path.
    const incoming = req.originalUrl || req.url || '/';
    const pathOnly = incoming.split('?')[0];

    if (!(pathOnly === '/api' || pathOnly.startsWith('/api/'))) {
      sendJson(res, 404, { detail: 'Not found.' });
      return;
    }

    const origin = req.headers.origin;
    if (
      UNSAFE_METHODS.has(req.method) &&
      origin !== undefined &&
      !sameOrigin(origin, req.headers.host, req.headers['x-forwarded-host']) &&
      !allowed.has(String(origin).replace(/\/+$/, ''))
    ) {
      log('warn', `[proxy] ${req.method} ${pathOnly} -> 403 cross-origin request blocked`);
      sendJson(res, 403, { detail: 'Cross-origin state-changing requests are not allowed.' });
      return;
    }

    const extraHopByHop = new Set(connectionTokens(req.headers.connection));
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      const lower = name.toLowerCase();
      if (HOP_BY_HOP.has(lower) || extraHopByHop.has(lower) || lower === 'host') continue;
      headers[lower] = value;
    }
    // Render's edge routes by Host header, so the upstream must see the backend's own host.
    headers.host = base.host;
    const remote = req.socket && req.socket.remoteAddress;
    if (remote) {
      headers['x-forwarded-for'] = req.headers['x-forwarded-for']
        ? `${req.headers['x-forwarded-for']}, ${remote}`
        : remote;
    }
    headers['x-forwarded-proto'] =
      req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http');
    if (req.headers.host) headers['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers.host;

    const proxyReq = transport.request({
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port || (base.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: incoming,
      headers,
      agent,
    });

    proxyReq.setTimeout(timeoutMs, () => {
      proxyReq.destroy(Object.assign(new Error('Upstream timeout'), { code: 'PROXY_TIMEOUT' }));
    });

    proxyReq.on('response', (upstream) => {
      const outHeaders = {};
      const upstreamHop = new Set(connectionTokens(upstream.headers.connection));
      for (const [name, value] of Object.entries(upstream.headers)) {
        const lower = name.toLowerCase();
        if (HOP_BY_HOP.has(lower) || upstreamHop.has(lower)) continue;
        outHeaders[lower] = value; // set-cookie stays an array, so every cookie is preserved
      }
      res.writeHead(upstream.statusCode || 502, upstream.statusMessage, outHeaders);
      upstream.on('error', () => res.destroy());
      upstream.pipe(res);
      res.on('finish', () => {
        log('info', `[proxy] ${req.method} ${pathOnly} -> ${upstream.statusCode} ${Date.now() - started}ms`);
      });
    });

    proxyReq.on('error', (err) => {
      const timedOut = err && err.code === 'PROXY_TIMEOUT';
      // Only the response side matters: IncomingMessage.destroyed is also true after a fully read body.
      const clientGone = res.destroyed || res.writableEnded;
      if (!clientGone) {
        log('error', `[proxy] ${req.method} ${pathOnly} -> ${timedOut ? 504 : 502} ${(err && err.code) || 'error'}`);
        sendJson(
          res,
          timedOut ? 504 : 502,
          { detail: timedOut ? 'The backend service timed out.' : 'The backend service is unavailable.' }
        );
      }
    });

    // If the browser disconnects mid-request, stop the upstream request too.
    res.on('close', () => {
      if (!res.writableEnded) proxyReq.destroy();
    });

    req.on('error', () => proxyReq.destroy());
    req.pipe(proxyReq);
  };
}
