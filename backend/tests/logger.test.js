import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitive } from '../src/utils/redact.js';

test('redacts nested secrets before logging', () => {
  const input = { email: 'a@example.com', password: 'secret', nested: { token: 'abc' } };
  const output = redactSensitive(input);
  assert.equal(output.password, '[REDACTED]');
  assert.equal(output.nested.token, '[REDACTED]');
  assert.equal(output.email, 'a@example.com');
});
