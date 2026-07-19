import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectPermissions,
  extractBearerToken,
  permissionMatches,
  userHasPermission,
} from '../src/utils/authPolicy.js';

test('extractBearerToken accepts a valid bearer header', () => {
  assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearerToken('bearer token-123'), 'token-123');
});

test('extractBearerToken rejects malformed authorization headers', () => {
  assert.equal(extractBearerToken(), null);
  assert.equal(extractBearerToken('abc Bearer token'), null);
  assert.equal(extractBearerToken('Bearer'), null);
  assert.equal(extractBearerToken('Basic dXNlcjpwYXNz'), null);
  assert.equal(extractBearerToken('Bearer token extra'), null);
});

test('permission wildcard only matches its own namespace', () => {
  assert.equal(permissionMatches('customers.*', 'customers.view'), true);
  assert.equal(permissionMatches('customers.*', 'customers'), true);
  assert.equal(permissionMatches('customers.*', 'customerSecrets.view'), false);
  assert.equal(permissionMatches('customers.view', 'customers.update'), false);
});

test('permissions combine role, custom role and direct grants without duplicates', () => {
  const permissions = collectPermissions(
    {
      role: 'sales',
      customRole: { permissions: ['reports.view', 'customers.view'] },
      permissions: ['payments.view', 'reports.view'],
    },
    { sales: ['customers.view', 'sales.*'] },
  );
  assert.deepEqual(permissions, ['customers.view', 'sales.*', 'reports.view', 'payments.view']);
});

test('userHasPermission supports admin and scoped wildcards', () => {
  const rolePermissions = { admin: ['*'], warehouse: ['inventory.*'] };
  assert.equal(userHasPermission({ role: 'admin' }, 'users.delete', rolePermissions), true);
  assert.equal(userHasPermission({ role: 'warehouse' }, 'inventory.adjust', rolePermissions), true);
  assert.equal(userHasPermission({ role: 'warehouse' }, 'sales.create', rolePermissions), false);
});
