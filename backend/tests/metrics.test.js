import test from 'node:test';
import assert from 'node:assert/strict';
import { recordRequest, recordDatabaseCommand, getMetrics, resetMetrics } from '../src/utils/metrics.js';
test('aggregates API latency and status metrics', () => {
  resetMetrics();
  recordRequest({ method: 'GET', path: '/api/v1/customers', statusCode: 200, durationMs: 10 });
  recordRequest({ method: 'GET', path: '/api/v1/customers', statusCode: 200, durationMs: 30 });
  const data = getMetrics();
  assert.equal(data.api.totalRequests, 2);
  assert.equal(data.api.averageDurationMs, 20);
  assert.equal(data.api.statusClasses['2xx'], 2);
});

test('aggregates database command latency and failures', () => {
  resetMetrics();
  recordDatabaseCommand({ commandName: 'find', collection: 'customers', durationMs: 20, success: true });
  recordDatabaseCommand({ commandName: 'find', collection: 'customers', durationMs: 80, success: false });
  const data = getMetrics();
  assert.equal(data.databaseCommands.totalCommands, 2);
  assert.equal(data.databaseCommands.failedCommands, 1);
  assert.equal(data.databaseCommands.averageDurationMs, 50);
  assert.equal(data.databaseCommands.slowestCommands[0].command, 'find:customers');
});
