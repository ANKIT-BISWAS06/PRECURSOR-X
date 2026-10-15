/**
 * Verifies package-lock.json lists every dependency declared in package.json: `npm run check:lock`.
 * `npm ci` fails when the two disagree. Fix by running `npm install` once and committing the lockfile.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const rootEntry = (lock.packages && lock.packages['']) || {};
const problems = [];
for (const section of ['dependencies', 'devDependencies']) {
  const declared = pkg[section] || {};
  const locked = rootEntry[section] || {};
  for (const [name, range] of Object.entries(declared)) {
    if (!(name in locked)) problems.push(`${section}.${name} is in package.json but missing from package-lock.json`);
    else if (locked[name] !== range) problems.push(`${section}.${name}: package.json has ${range}, lockfile has ${locked[name]}`);
    if (!lock.packages[`node_modules/${name}`]) problems.push(`node_modules/${name} entry missing from package-lock.json`);
  }
  for (const name of Object.keys(locked)) {
    if (!(name in declared)) problems.push(`${section}.${name} is in the lockfile but not in package.json`);
  }
}
if (problems.length) {
  console.error('package.json and package-lock.json are OUT OF SYNC:\n - ' + problems.join('\n - '));
  console.error('\nRun "npm install" with network access, then commit the updated package-lock.json.');
  process.exit(1);
}
console.log('package.json and package-lock.json are in sync.');
