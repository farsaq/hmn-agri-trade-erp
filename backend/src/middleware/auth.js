import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { extractBearerToken, userHasPermission } from '../utils/authPolicy.js';

export const ROLE_PERMISSIONS = {
  admin: ['*'],
  manager: [
    'dashboard.view',
    'customers.*',
    'suppliers.*',
    'products.*',
    'inventory.*',
    'sales.*',
    'purchases.*',
    'expenses.*',
    'reports.view',
    'users.view',
    'notifications.view',
    'audit.view',
    'roles.view',
    'settings.view',
    'security.view',
    'ai.*',
    'integrations.*',
    'backup.*',
    'payments.*',
    'webhooks.*',
    'accounting.*',
    'accounting.journal.*',
    'accounting.export',
  ],
  accountant: [
    'dashboard.view',
    'customers.view',
    'suppliers.view',
    'sales.view',
    'purchases.view',
    'expenses.*',
    'reports.view',
    'ledger.*',
    'notifications.view',
    'audit.view',
    'settings.view',
    'security.view',
    'ai.view',
    'ai.query',
    'integrations.view',
    'payments.view',
    'accounting.*',
    'accounting.journal.*',
    'accounting.export',
  ],
  sales: [
    'dashboard.view',
    'customers.view',
    'customers.create',
    'customers.update',
    'products.view',
    'sales.*',
    'ledger.view',
    'notifications.view',
    'settings.view',
    'security.view',
    'ai.view',
    'ai.query',
    'integrations.view',
    'payments.view',
    'accounting.view',
  ],
  warehouse: [
    'dashboard.view',
    'products.view',
    'inventory.*',
    'purchases.view',
    'notifications.view',
    'settings.view',
    'security.view',
  ],
  operator: [
    'dashboard.view',
    'customers.view',
    'suppliers.view',
    'products.view',
    'inventory.view',
    'sales.view',
    'purchases.view',
    'expenses.view',
    'notifications.view',
    'security.view',
  ],
  viewer: [
    'dashboard.view',
    'customers.view',
    'suppliers.view',
    'products.view',
    'inventory.view',
    'reports.view',
    'security.view',
    'ai.view',
  ],
};

export async function protect(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      logger.security('Authentication token missing', { requestId: req.requestId, path: req.originalUrl, ip: req.ip });
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: { code: 'AUTH_TOKEN_REQUIRED' },
        requestId: req.requestId,
      });
    }
    const decoded = jwt.verify(token, env.jwtSecret, {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      algorithms: ['HS256'],
    });
    const user = await User.findById(decoded.id)
      .select('-password -otpHash -twoFactorSecret -recoveryCodeHashes')
      .populate('customRole');
    if (!user || !user.active) {
      logger.security('Inactive or invalid user attempted access', {
        requestId: req.requestId,
        userId: decoded.id,
        ip: req.ip,
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid user',
        error: { code: 'AUTH_USER_INVALID' },
        requestId: req.requestId,
      });
    }
    req.user = user;
    next();
  } catch (error) {
    logger.security('Invalid or expired token', { requestId: req.requestId, path: req.originalUrl, ip: req.ip, error });
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      error: { code: 'AUTH_TOKEN_INVALID' },
      requestId: req.requestId,
    });
  }
}
export const permit =
  (...roles) =>
  (req, res, next) => {
    if (!req.user)
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: { code: 'AUTH_USER_REQUIRED' },
        requestId: req.requestId,
      });
    return roles.includes(req.user.role)
      ? next()
      : res.status(403).json({
          success: false,
          message: 'Permission denied',
          error: { code: 'AUTH_ROLE_FORBIDDEN' },
          requestId: req.requestId,
        });
  };
export function hasPermission(user, permission) {
  return userHasPermission(user, permission, ROLE_PERMISSIONS);
}
export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user)
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      error: { code: 'AUTH_USER_REQUIRED' },
      requestId: req.requestId,
    });
  return hasPermission(req.user, permission)
    ? next()
    : res.status(403).json({
        success: false,
        message: `Missing permission: ${permission}`,
        error: { code: 'AUTH_PERMISSION_FORBIDDEN', permission },
        requestId: req.requestId,
      });
};
