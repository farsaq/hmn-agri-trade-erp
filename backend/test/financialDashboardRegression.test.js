import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller = fs.readFileSync(new URL('../src/controllers/financialStatements.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/services/financialDashboardService.js', import.meta.url), 'utf8');

test('ratios endpoint passes statement item arrays to calculateRatios', () => {
  assert.match(controller, /assets:\s*bs\.assets\.items/);
  assert.match(controller, /liabilities:\s*bs\.liabilities\.items/);
  assert.match(controller, /equity:\s*bs\.equity\.items/);
});

test('dashboard ratios pass statement item arrays to calculateRatios', () => {
  assert.match(dashboard, /assets:\s*bs\.assets\.items/);
  assert.match(dashboard, /liabilities:\s*bs\.liabilities\.items/);
  assert.match(dashboard, /equity:\s*bs\.equity\.items/);
});

test('monthly trend clamps its first bucket and keeps the most recent 24 months', () => {
  assert.match(dashboard, /cursor\s*<\s*trendFrom\s*\?\s*new Date\(trendFrom\)/);
  assert.match(dashboard, /dateTo\.getMonth\(\) - 23/);
});
