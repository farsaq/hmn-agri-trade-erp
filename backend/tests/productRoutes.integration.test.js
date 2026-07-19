import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('product enterprise API routes are registered', () => {
  const src = fs.readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  for (const route of [
    '/products-deleted',
    '/products/:id/restore',
    '/products/:id/timeline',
    '/products/:id/report.pdf',
    '/products/:id/adjust-stock',
    '/products/:id/reconcile-stock',
  ])
    assert.ok(src.includes(route), route);
});
