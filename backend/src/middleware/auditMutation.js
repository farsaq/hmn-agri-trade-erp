import { MUTATION_METHODS } from '../constants/app.js';
import { AuditLog } from '../models/index.js';
import { redactSensitive } from '../utils/redact.js';
import { logger } from '../utils/logger.js';

export function auditMutation(req, res, next) {
  res.on('finish', () => {
    if (!MUTATION_METHODS.has(req.method) || req.auditLogged || !req.originalUrl.startsWith('/api')) return;
    const entry = {
      user: req.user?._id,
      action: `${req.method} ${req.originalUrl.split('?')[0]}`,
      entity: 'HTTP',
      description: 'Mutation request',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      device: req.get('sec-ch-ua-platform') || req.get('user-agent'),
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      after: redactSensitive(req.body),
    };
    logger.audit('Mutation request', { requestId: req.requestId, ...entry });
    AuditLog.create(entry).catch((error) =>
      logger.error('Audit log write failed', { requestId: req.requestId, error }),
    );
  });
  next();
}
