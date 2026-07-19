import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hmn_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_only_secret_with_more_than_32_characters_123';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const { sanitizeRequest, csrfGuard } = await import('../src/middleware/security.js');

function runMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ res: this, nextCalled: false });
      },
    };
    middleware(req, res, (error) => (error ? reject(error) : resolve({ res, nextCalled: true })));
  });
}

test('request sanitizer rejects Mongo operator keys', async () => {
  const req = { body: { email: { $ne: null } }, params: {}, query: {} };
  await assert.rejects(
    () => runMiddleware(sanitizeRequest, req),
    (error) => error.code === 'UNSAFE_INPUT_KEY',
  );
});

test('request sanitizer keeps normal nested data', async () => {
  const req = { body: { profile: { name: 'HMN' } }, params: {}, query: {} };
  const result = await runMiddleware(sanitizeRequest, req);
  assert.equal(result.nextCalled, true);
  assert.equal(req.body.profile.name, 'HMN');
});

test('CSRF guard rejects cookie-auth mutation without header', async () => {
  const req = {
    method: 'POST',
    path: '/api/v1/auth/refresh',
    cookies: { hmn_refresh: 'x' },
    requestId: 'r1',
    get(name) {
      return name.toLowerCase() === 'origin' ? 'http://localhost:5173' : undefined;
    },
  };
  const result = await runMiddleware(csrfGuard, req);
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.body.error.code, 'CSRF_HEADER_REQUIRED');
});
test('seeded company contact is environment driven', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/seed.js', import.meta.url), 'utf8'),
  );
  assert.match(source, /process\.env\.COMPANY_PHONE/);
  assert.doesNotMatch(source, /\+92 300 0000000/);
});
