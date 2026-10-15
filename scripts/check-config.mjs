/**
 * Static configuration checks (no dependencies): `npm run check:config`.
 * Verifies that render.yaml, package.json and the server sources agree with each other.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const render = read('render.yaml');
const frontend = render.slice(render.indexOf('name: precursorx-frontend'));
check(/runtime: node/.test(frontend), 'frontend must be runtime: node');
check(!/runtime: static/.test(render), 'no static-site runtime may remain');
check(!/staticPublishPath|type: rewrite/.test(render), 'no static-site rewrite rules may remain');
check(/startCommand: "?npm start"?/.test(frontend), 'frontend startCommand must be npm start');
check(/npm ci/.test(frontend) && /npm run build/.test(frontend), 'frontend buildCommand must install and build');
check(/key: BACKEND_URL/.test(frontend), 'frontend must declare BACKEND_URL');
check(/healthCheckPath: \/healthz/.test(frontend), 'frontend health check must be /healthz');
check((render.match(/- name: precursorx-db/g) || []).length === 1, 'exactly one database');
check(/name: precursorx-backend/.test(render) && /alembic upgrade head/.test(render), 'backend service and migrations preserved');
check(/openai\/gpt-oss-120b/.test(render), 'Groq model openai/gpt-oss-120b preserved');
check(!/AUTH_COOKIE_SAMESITE/.test(render), 'cross-site cookie override must be gone');

const pkg = JSON.parse(read('package.json'));
check(pkg.dependencies && pkg.dependencies.express, 'express must be a dependency');
check(pkg.scripts && pkg.scripts.start === 'node server/index.js', 'npm start must launch server/index.js');
check(/from 'express'/.test(read('server/app.js')), 'server/app.js must import express');
check(/createApiProxy/.test(read('server/app.js')) && /app\.use\('\/api'/.test(read('server/app.js')), 'Express must mount the /api proxy');

const files = fs.readdirSync(root);
const locks = files.filter((f) => /lock/i.test(f) && /\.(json|yaml|lock|lockb)$/.test(f));
check(locks.length === 1 && locks[0] === 'package-lock.json', `only package-lock.json may exist (found: ${locks.join(', ') || 'none'})`);

if (failures.length) {
  console.error('Configuration check FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('Configuration check passed (' + 'render.yaml, package.json, server sources)');
