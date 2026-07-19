import test from 'node:test';
import assert from 'node:assert/strict';
import { getRuntimeConfig, isFeatureEnabled } from '../src/config/runtime.js';
test('runtime configuration exposes feature flags', () => {
  assert.equal(typeof getRuntimeConfig().featureFlags, 'object');
  assert.equal(isFeatureEnabled('legacyApi'), true);
});
