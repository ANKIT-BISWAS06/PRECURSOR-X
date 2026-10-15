/**
 * Executed tests for the same-origin API proxy (server/proxy.js).
 * Uses only Node built-ins: `node --test server/`.
 *
 * The backend here is a small fake that mimics FastAPI's auth contract (HttpOnly cookie on
 * login, 401 without it, cookie cleared on logout). It verifies the PROXY's behaviour
 * (cookies, bodies, queries, errors, origin checks). It is not a substitute for the real
 * FastAPI/PostgreSQL tests in backend/tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiProxy, normalizeBackendUrl } from './proxy.js';

// ---------------------------------------------------------------- helpers
function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
function close(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, raw, text: raw.toString('utf8') });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
const json = (r) => JSON.parse(r.text);

/** Minimal browser cookie jar: stores Set-Cookie from responses, replays Cookie, honours Max-Age=0. */
class CookieJar {
  constructor(initial = {}) { this.cookies = { ...initial }; }
  store(res) {
    for (const line of res.headers['set-cookie'] || []) {
      const [pair, ...attrs] = line.split(';').map((p) => p.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith('max-age='));
      if ((maxAge && Number(maxAge.split('=')[1]) <= 0) || value === '') delete this.cookies[name];
      else this.cookies[name] = value;
    }
  }
  header() {
    const pairs = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`);
    return pairs.length ? { cookie: pairs.join('; ') } : {};
  }
  clone() { return new CookieJar(this.cookies); }
}

// ---------------------------------------------------------------- fake FastAPI backend
const SECRET_TOKEN = 'tok_SECRET_SESSION_VALUE_123';
const users = new Map(); // email -> password
const seen = []; // what the backend actually received

function fakeBackend() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://backend.local');
    const body = await readBody(req);
    seen.push({ method: req.method, url: req.url, headers: req.headers, body });
    const send = (status, obj, extra = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...extra });
      res.end(JSON.stringify(obj));
    };
    const authed = (req.headers.cookie || '').split(/;\s*/).includes(`access_token=${SECRET_TOKEN}`);

    switch (`${req.method} ${url.pathname}`) {
      case 'GET /api/v1/health': return send(200, { status: 'healthy' });
      case 'GET /api/v1/echo':
        return send(200, { query: Object.fromEntries(url.searchParams), all: url.searchParams.getAll('tag'), host: req.headers.host,
          cookie: req.headers.cookie || null, xfp: req.headers['x-forwarded-proto'], xfh: req.headers['x-forwarded-host'], xff: req.headers['x-forwarded-for'] || null });
      case 'POST /api/v1/echo':
      case 'PATCH /api/v1/echo':
      case 'DELETE /api/v1/echo':
        return send(200, { method: req.method, contentType: req.headers['content-type'] || null, body: body.toString('utf8') });
      case 'POST /api/v1/auth/register': {
        const p = JSON.parse(body.toString() || '{}');
        if (users.has(p.email)) return send(409, { detail: 'exists' });
        users.set(p.email, p.password);
        return send(201, { user: { email: p.email }, token_type: 'cookie' }, {
          'set-cookie': [`access_token=${SECRET_TOKEN}; HttpOnly; Path=/; SameSite=lax; Max-Age=86400`] });
      }
      case 'POST /api/v1/auth/login': {
        const p = JSON.parse(body.toString() || '{}');
        if (users.get(p.email) !== p.password) return send(401, { detail: 'Invalid email or password.' });
        return send(200, { user: { email: p.email }, token_type: 'cookie' }, {
          'set-cookie': [`access_token=${SECRET_TOKEN}; HttpOnly; Path=/; SameSite=lax; Max-Age=86400`, 'ui_pref=compact; Path=/; SameSite=lax'] });
      }
      case 'GET /api/v1/auth/me':
        return authed ? send(200, { email: 'user@example.com' }) : send(401, { detail: 'Authentication credentials required.' });
      case 'GET /api/v1/dashboard/summary':
        return authed ? send(200, { ok: true }) : send(401, { detail: 'Authentication credentials required.' });
      case 'POST /api/v1/auth/logout':
        return send(200, { status: 'ok' }, { 'set-cookie': ['access_token=; Max-Age=0; Path=/; HttpOnly; SameSite=lax'] });
      case 'GET /api/v1/text':
        res.writeHead(200, { 'content-type': 'text/csv' }); return res.end('a,b\n1,2\n');
      case 'GET /api/v1/binary':
        res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(Buffer.from([0, 255, 1, 254, 2, 253]));
      case 'GET /api/v1/empty':
        res.writeHead(204); return res.end();
      case 'GET /api/v1/unprocessable':
        return send(422, { detail: [{ loc: ['body', 'email'], msg: 'field required' }] });
      case 'GET /api/v1/slow':
        return void setTimeout(() => send(200, { late: true }), 600);
      default:
        return send(404, { detail: 'Not Found' });
    }
  });
}

// ---------------------------------------------------------------- fixtures
const logs = [];
const logger = { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) };
let backend, backendPort, proxyServer, proxyPort, slowProxyServer, slowProxyPort;

test.before(async () => {
  backend = fakeBackend();
  backendPort = await listen(backend);
  const proxy = createApiProxy({ target: `http://127.0.0.1:${backendPort}`, logger });
  proxyServer = http.createServer(proxy);
  proxyPort = await listen(proxyServer);
  const slow = createApiProxy({ target: `http://127.0.0.1:${backendPort}`, timeoutMs: 150, logger });
  slowProxyServer = http.createServer(slow);
  slowProxyPort = await listen(slowProxyServer);
});
test.after(async () => {
  await Promise.all([close(proxyServer), close(slowProxyServer), close(backend)]);
});

// ---------------------------------------------------------------- tests
test('GET /api/v1/health reaches the backend through the proxy', async () => {
  const r = await request(proxyPort, { path: '/api/v1/health' });
  assert.equal(r.status, 200);
  assert.deepEqual(json(r), { status: 'healthy' });
});

test('query parameters are preserved exactly, including repeated and encoded keys', async () => {
  const r = await request(proxyPort, { path: '/api/v1/echo?site=a%20b&tag=x&tag=y&q=caf%C3%A9' });
  const b = json(r);
  assert.equal(b.query.site, 'a b');
  assert.deepEqual(b.all, ['x', 'y']);
  assert.equal(b.query.q, 'café');
  assert.equal(seen.at(-1).url, '/api/v1/echo?site=a%20b&tag=x&tag=y&q=caf%C3%A9');
});

test('request bodies, methods and content-type are preserved (POST, PATCH, DELETE)', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const payload = JSON.stringify({ narrative: 'Gas test omitted — night shift', n: 1 });
    const r = await request(proxyPort, {
      method, path: '/api/v1/echo',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }, body: payload,
    });
    const b = json(r);
    assert.equal(b.method, method);
    assert.equal(b.contentType, 'application/json');
    assert.equal(b.body, payload, `${method} body must arrive byte-for-byte`);
  }
});

test('a 1 MB body streams through unchanged', async () => {
  const big = JSON.stringify({ narrative: 'x'.repeat(1_000_000) });
  const r = await request(proxyPort, { method: 'POST', path: '/api/v1/echo',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(big) }, body: big });
  assert.equal(json(r).body.length, big.length);
});

test('cookies are forwarded; Host is rewritten to the backend; forwarding headers are added', async () => {
  const r = await request(proxyPort, { path: '/api/v1/echo',
    headers: { cookie: 'access_token=abc; other=1', host: 'frontend.example.com', 'x-forwarded-proto': 'https' } });
  const b = json(r);
  assert.equal(b.cookie, 'access_token=abc; other=1');
  assert.equal(b.host, `127.0.0.1:${backendPort}`);
  assert.equal(b.xfp, 'https');
  assert.equal(b.xfh, 'frontend.example.com');
  assert.match(b.xff, /127\.0\.0\.1/);
});

test('multiple Set-Cookie headers and all attributes are preserved untouched', async () => {
  users.set('a@example.com', 'pw');
  const r = await request(proxyPort, { method: 'POST', path: '/api/v1/auth/login',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@example.com', password: 'pw' }) });
  const cookies = r.headers['set-cookie'];
  assert.equal(cookies.length, 2);
  assert.equal(cookies[0], `access_token=${SECRET_TOKEN}; HttpOnly; Path=/; SameSite=lax; Max-Age=86400`);
  assert.equal(cookies[1], 'ui_pref=compact; Path=/; SameSite=lax');
  assert.ok(!/domain=/i.test(cookies.join(';')), 'the proxy must not add a Domain attribute (host-only cookie)');
});

test('auth flow through the proxy: register, bad login, login, protected call, reload, logout', async () => {
  const jar = new CookieJar();
  const post = (path, obj, j = jar) => request(proxyPort, { method: 'POST', path,
    headers: { 'content-type': 'application/json', ...j.header() }, body: JSON.stringify(obj) });
  const get = (path, j = jar) => request(proxyPort, { path, headers: j.header() });

  // 1. registration
  const reg = await post('/api/v1/auth/register', { email: 'flow@example.com', password: 'Str0ng#Pass' });
  assert.equal(reg.status, 201);
  jar.store(reg);
  assert.equal(await Promise.resolve(Object.keys(jar.cookies).includes('access_token')), true);

  // 2. a fresh browser with no cookie is unauthenticated (item 8)
  assert.equal((await get('/api/v1/auth/me', new CookieJar())).status, 401);
  assert.equal((await get('/api/v1/dashboard/summary', new CookieJar())).status, 401);

  // 3. invalid credentials: 401 JSON passed through and no cookie issued
  const bad = await post('/api/v1/auth/login', { email: 'flow@example.com', password: 'wrong' }, new CookieJar());
  assert.equal(bad.status, 401);
  assert.equal(json(bad).detail, 'Invalid email or password.');
  assert.equal(bad.headers['set-cookie'], undefined);

  // 4. successful login issues the cookie
  const login = await post('/api/v1/auth/login', { email: 'flow@example.com', password: 'Str0ng#Pass' }, new CookieJar());
  assert.equal(login.status, 200);
  const session = new CookieJar();
  session.store(login);
  assert.ok(session.cookies.access_token, 'login must issue the session cookie');

  // 5. protected request succeeds only because the issued cookie is replayed
  assert.equal((await get('/api/v1/dashboard/summary', session)).status, 200);
  assert.equal((await get('/api/v1/auth/me', session)).status, 200);

  // 6. "page reload": a new page load holds the same stored cookie and the session is restored
  const reloaded = session.clone();
  assert.equal((await get('/api/v1/auth/me', reloaded)).status, 200);

  // 7. logout clears the cookie and the session no longer works
  const out = await post('/api/v1/auth/logout', {}, session);
  assert.equal(out.status, 200);
  session.store(out);
  assert.equal(session.cookies.access_token, undefined, 'logout must clear the cookie');
  assert.equal((await get('/api/v1/auth/me', session)).status, 401);
});

test('non-JSON responses pass through byte-for-byte (text, binary, 204)', async () => {
  const t = await request(proxyPort, { path: '/api/v1/text' });
  assert.equal(t.headers['content-type'], 'text/csv');
  assert.equal(t.text, 'a,b\n1,2\n');
  const bin = await request(proxyPort, { path: '/api/v1/binary' });
  assert.deepEqual([...bin.raw], [0, 255, 1, 254, 2, 253]);
  const empty = await request(proxyPort, { path: '/api/v1/empty' });
  assert.equal(empty.status, 204);
  assert.equal(empty.raw.length, 0);
});

test('backend API errors keep their status and JSON body', async () => {
  const r = await request(proxyPort, { path: '/api/v1/unprocessable' });
  assert.equal(r.status, 422);
  assert.equal(json(r).detail[0].msg, 'field required');
  const nf = await request(proxyPort, { path: '/api/v1/nope' });
  assert.equal(nf.status, 404);
  assert.match(nf.headers['content-type'], /application\/json/);
});

test('unreachable backend returns a JSON 502, never HTML', async () => {
  const dead = http.createServer();
  const port = await listen(dead);
  await close(dead); // port is now closed
  const p = http.createServer(createApiProxy({ target: `http://127.0.0.1:${port}`, logger }));
  const pp = await listen(p);
  const r = await request(pp, { path: '/api/v1/health' });
  await close(p);
  assert.equal(r.status, 502);
  assert.match(r.headers['content-type'], /application\/json/);
  assert.match(json(r).detail, /unavailable/i);
});

test('a backend that is too slow returns a JSON 504', async () => {
  const r = await request(slowProxyPort, { path: '/api/v1/slow' });
  assert.equal(r.status, 504);
  assert.match(r.headers['content-type'], /application\/json/);
});

test('CSRF: cross-origin state-changing requests are blocked before reaching the backend', async () => {
  const before = seen.length;
  const evil = await request(proxyPort, { method: 'POST', path: '/api/v1/echo',
    headers: { host: 'app.example.com', origin: 'https://evil.example.net', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(evil.status, 403);
  assert.match(evil.headers['content-type'], /application\/json/);
  const nul = await request(proxyPort, { method: 'DELETE', path: '/api/v1/echo',
    headers: { host: 'app.example.com', origin: 'null' } });
  assert.equal(nul.status, 403);
  assert.equal(seen.length, before, 'blocked requests must never reach the backend');

  const same = await request(proxyPort, { method: 'POST', path: '/api/v1/echo',
    headers: { host: 'app.example.com', origin: 'https://app.example.com', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(same.status, 200);

  // reads and requests with no Origin header (non-browser clients) are not affected
  const read = await request(proxyPort, { path: '/api/v1/health', headers: { origin: 'https://evil.example.net' } });
  assert.equal(read.status, 200);
});

test('extra allowed origins are honoured', async () => {
  const p = http.createServer(createApiProxy({ target: `http://127.0.0.1:${backendPort}`, allowedOrigins: ['https://custom.example.org/'], logger }));
  const pp = await listen(p);
  const ok = await request(pp, { method: 'POST', path: '/api/v1/echo',
    headers: { host: 'internal-host', origin: 'https://custom.example.org', 'content-type': 'application/json' }, body: '{}' });
  await close(p);
  assert.equal(ok.status, 200);
});

test('non-/api paths are refused by the proxy itself', async () => {
  const r = await request(proxyPort, { path: '/etc/passwd' });
  assert.equal(r.status, 404);
});

test('logs never contain cookies, passwords, tokens or query strings', async () => {
  await request(proxyPort, { method: 'POST', path: '/api/v1/auth/login?secret_q=hunter2',
    headers: { 'content-type': 'application/json', cookie: `access_token=${SECRET_TOKEN}` },
    body: JSON.stringify({ email: 'a@example.com', password: 'pw-very-secret' }) });
  const all = logs.join('\n');
  assert.ok(all.includes('/api/v1/auth/login'), 'requests are logged by path');
  for (const secret of [SECRET_TOKEN, 'pw-very-secret', 'hunter2', 'secret_q', 'access_token']) {
    assert.ok(!all.includes(secret), `logs must not contain "${secret}"`);
  }
});

test('BACKEND_URL validation rejects values that would break routing', () => {
  assert.throws(() => normalizeBackendUrl(''), /required/);
  assert.throws(() => normalizeBackendUrl('not a url'), /valid URL/);
  assert.throws(() => normalizeBackendUrl('ftp://x.example'), /http/);
  assert.throws(() => normalizeBackendUrl('https://x.example/api/v1'), /origin only/);
  assert.equal(normalizeBackendUrl('https://x.example/').origin, 'https://x.example');
});

test('regression: POST with a fully read body to a dead backend still answers 502 (no hang)', async () => {
  const dead = http.createServer();
  const port = await listen(dead);
  await close(dead);
  const p = http.createServer(createApiProxy({ target: `http://127.0.0.1:${port}`, logger }));
  const pp = await listen(p);
  const body = JSON.stringify({ email: 'x@example.com', password: 'pw' });
  const r = await Promise.race([
    request(pp, { method: 'POST', path: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, body }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('proxy hung')), 3000)),
  ]);
  await close(p);
  assert.equal(r.status, 502);
});
