import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

test('sensitive environment files are ignored', () => {
  const ignore = read('../.gitignore');
  assert.match(ignore, /^\*\*\/\.env$/m);
  assert.match(ignore, /^\*\*\/\.env\.\*$/m);
});

test('production build uses route-level lazy loading', () => {
  const app = read('src/App.jsx');
  for (const route of ['AdminApp', 'AccountingPage', 'IntegrationsPage', 'PublicSite'])
    assert.match(app, new RegExp('lazy.*' + route));
});

test('public page list rendering has stable keys', () => {
  const page = read('src/pages/PublicSite.jsx');
  assert.match(page, /services\.map\(\s*\(\[a,\s*b,\s*I\]\)\s*=>\s*\(\s*<Fade key=\{a\}/);
  assert.match(page, /products\.map\(\s*\(p\)\s*=>\s*\(\s*<Fade key=\{p\.name\}/);
});

test('production configuration contains no real secret material in frontend variables', () => {
  const example = read('.env.example');
  assert.doesNotMatch(example, /PASSWORD|JWT_SECRET|MONGO_URI|API_KEY/);
});

test('security and release workflows are present', () => {
  for (const file of [
    '../.github/workflows/ci.yml',
    '../.github/workflows/security.yml',
    '../.github/workflows/release.yml',
  ])
    assert.ok(fs.existsSync(path.resolve(file)));
});

test('production readiness runbook exists', () => {
  assert.ok(fs.existsSync(path.resolve('../docs/PRODUCTION-READINESS.md')));
});
test('media and socket URLs are environment driven', () => {
  const service = read('src/services/api.js');
  const customers = read('src/admin/CustomerManagement.jsx');
  const operations = read('src/admin/OperationsPages.jsx');
  assert.match(service, /export const apiOrigin/);
  assert.match(service, /export const assetUrl/);
  assert.doesNotMatch(customers, /http:\/\/localhost:5000/);
  assert.doesNotMatch(operations, /http:\/\/localhost:5000/);
});

test('public and security images expose accessible alternative text', () => {
  const publicPage = read('src/pages/PublicSite.jsx');
  const security = read('src/admin/SecurityPage.jsx');
  assert.match(publicPage, /alt=\{p\.name\}/);
  assert.match(security, /alt="Two-factor authentication QR code"/);
});
