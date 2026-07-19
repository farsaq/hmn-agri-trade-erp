import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const controller = await readFile(new URL('../src/controllers/auth.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../src/middleware/auth.js', import.meta.url), 'utf8');

test('refresh token rotation is atomic to prevent replay races', () => {
  assert.match(controller, /Session\.findOneAndUpdate\(/);
  assert.match(controller, /revokeReason:\s*['"']rotated['"']/);
  assert.doesNotMatch(controller, /const session=await Session\.findOne\(\{tokenHash:sha\(raw\)/);
});

test('logout clears refresh and trusted-device cookies', () => {
  assert.match(controller, /clearCookie\('hmn_refresh'/);
  assert.match(controller, /clearCookie\('hmn_trusted_device'/);
});

test('authorization middleware uses strict bearer parsing', () => {
  assert.match(middleware, /extractBearerToken\(req\.headers\.authorization\)/);
  assert.doesNotMatch(middleware, /replace\('Bearer '/);
});
