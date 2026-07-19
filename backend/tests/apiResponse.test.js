import test from 'node:test';
import assert from 'node:assert/strict';
import { successResponse, errorResponse } from '../src/utils/apiResponse.js';
import { redactSensitive } from '../src/utils/redact.js';

test('successResponse returns the standard envelope', () => {
  assert.deepEqual(successResponse({ data: { id: 1 }, message: 'Created', meta: { page: 1 } }), {
    success: true,
    message: 'Created',
    data: { id: 1 },
    meta: { page: 1 },
  });
});

test('errorResponse returns the standard error envelope', () => {
  assert.deepEqual(errorResponse({ message: 'Invalid', code: 'VALIDATION_ERROR', requestId: 'req-1' }), {
    success: false,
    message: 'Invalid',
    error: { code: 'VALIDATION_ERROR' },
    requestId: 'req-1',
  });
});

test('redactSensitive removes secrets recursively', () => {
  const value = redactSensitive({ user: { password: 'secret' }, token: 'jwt', safe: 'ok' });
  assert.deepEqual(value, { user: { password: '[REDACTED]' }, token: '[REDACTED]', safe: 'ok' });
});
