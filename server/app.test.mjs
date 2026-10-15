/**
 * Express-level tests (static serving, SPA fallback, /api handling).
 * They need the `express` package. If it is not installed these tests are SKIPPED, not passed;
 * run `npm install` and then `npm run test:server` to execute them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let express = null;
try {
  express = (await import('express')).default;
} catch {
  /* express not installed in this environment */
}
const skip = express ? false : 'express is not installed (run npm install)';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
function get(port, p, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    }).on('error', reject);
  });
}

test('Express app: healthz, static files, SPA fallback, API JSON errors', { skip }, async () => {
  const { createApp } = await import('./app.js');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'px-dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>PRECURSOR-X</title><div id="root"></div>');
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');

  const backend = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', path: req.url }));
  });
  const backendPort = await listen(backend);
  const app = createApp({ backendUrl: `http://127.0.0.1:${backendPort}`, distDir: dist, logger: { info() {}, warn() {}, error() {} } });
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    assert.equal((await get(port, '/healthz')).status, 200);
    const health = await get(port, '/api/v1/health?x=1');
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.text), { status: 'healthy', path: '/api/v1/health?x=1' });

    const root = await get(port, '/');
    assert.match(root.text, /PRECURSOR-X/);
    const deep = await get(port, '/dashboard');
    assert.equal(deep.status, 200);
    assert.match(deep.text, /id="root"/);

    const asset = await get(port, '/assets/app.js');
    assert.equal(asset.status, 200);
    assert.match(asset.headers['cache-control'], /immutable/);
    assert.equal((await get(port, '/assets/missing.js')).status, 404);
  } finally {
    server.closeAllConnections?.();
    backend.closeAllConnections?.();
    server.close();
    backend.close();
  }
});

test('Express app: unreachable backend gives JSON 502 for /api, never the SPA HTML', { skip }, async () => {
  const { createApp } = await import('./app.js');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'px-dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
  const dead = http.createServer();
  const deadPort = await listen(dead);
  await new Promise((r) => dead.close(r));
  const app = createApp({ backendUrl: `http://127.0.0.1:${deadPort}`, distDir: dist, logger: { info() {}, warn() {}, error() {} } });
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const r = await get(port, '/api/v1/dashboard/summary');
    assert.equal(r.status, 502);
    assert.match(r.headers['content-type'], /application\/json/);
    assert.ok(!r.text.includes('<div id="root">'));
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
