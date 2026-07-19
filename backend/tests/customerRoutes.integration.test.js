import test from 'node:test';
import assert from 'node:assert/strict';

test('customer enterprise API routes are registered', async () => {
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/hmn_test';
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-validation-123456789';
  const { default: router } = await import('../src/routes/index.js');
  const paths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  const has = (method, path) => paths.some((x) => x.path === path && x.methods.includes(method));
  assert.ok(has('get', '/customers'));
  assert.ok(has('get', '/customers-deleted'));
  assert.ok(has('post', '/customers'));
  assert.ok(has('put', '/customers/:id'));
  assert.ok(has('delete', '/customers/:id'));
  assert.ok(has('post', '/customers/:id/restore'));
  assert.ok(has('get', '/customers/:id/timeline'));
  assert.ok(has('get', '/customers/:id/ageing'));
  assert.ok(has('get', '/customers/:id/statement.pdf'));
});
