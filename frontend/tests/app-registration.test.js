import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');
test('frontend entry and accounting route are registered', () => {
  const app = read('src/App.jsx');
  assert.match(app, /path="\/admin\/accounting"/);
  assert.ok(fs.existsSync(path.resolve('src/main.jsx')));
});
test('admin routes are lazy loaded to keep the entry bundle small', () => {
  const app = read('src/App.jsx');
  assert.match(app, /lazy\(\s*\(\)\s*=>\s*import\('\.\/admin\/AccountingPage'\)\s*\)/);
  assert.match(app, /Suspense/);
});
test('public contact details are environment driven', () => {
  const page = read('src/pages/PublicSite.jsx');
  assert.match(page, /VITE_COMPANY_PHONE/);
  assert.doesNotMatch(page, /\+92 300 0000000/);
});
test('release version is consistent in package metadata', () => {
  for (const file of ['../package.json', 'package.json', '../backend/package.json'])
    assert.equal(JSON.parse(read(file)).version, '5.7.8');
});
