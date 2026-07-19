export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') return null;
  const match = authorizationHeader.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || null;
}

export function permissionMatches(grantedPermission, requiredPermission) {
  if (!grantedPermission || !requiredPermission) return false;
  if (grantedPermission === '*' || grantedPermission === requiredPermission) return true;
  if (!grantedPermission.endsWith('.*')) return false;
  const namespace = grantedPermission.slice(0, -2);
  return requiredPermission === namespace || requiredPermission.startsWith(`${namespace}.`);
}

export function collectPermissions(user = {}, rolePermissions = {}) {
  return [
    ...(rolePermissions[user.role] || []),
    ...(user.customRole?.permissions || []),
    ...(user.permissions || []),
  ].filter((permission, index, all) => typeof permission === 'string' && all.indexOf(permission) === index);
}

export function userHasPermission(user, requiredPermission, rolePermissions = {}) {
  return collectPermissions(user, rolePermissions).some((grantedPermission) =>
    permissionMatches(grantedPermission, requiredPermission),
  );
}
