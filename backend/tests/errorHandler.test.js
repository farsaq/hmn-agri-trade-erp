import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeError } from '../src/utils/normalizeError.js';

test('normalizes duplicate key errors', () => {
  assert.deepEqual(normalizeError({ code: 11000, keyValue: { mobile: '0300' } }), {
    statusCode: 409,
    code: 'DUPLICATE_RESOURCE',
    message: 'A record with the same unique value already exists',
    details: { mobile: '0300' },
  });
});

test('normalizes JWT expiry errors', () => {
  assert.equal(normalizeError({ name: 'TokenExpiredError' }).code, 'TOKEN_EXPIRED');
});

test('normalizes malformed JSON errors', () => {
  const error = new SyntaxError('Unexpected token');
  error.status = 400;
  error.type = 'entity.parse.failed';
  error.body = '{';
  assert.equal(normalizeError(error).code, 'INVALID_JSON');
});
