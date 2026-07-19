import { logger } from '../utils/logger.js';
import { recordRequest } from '../utils/metrics.js';

export function httpLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const rounded = Number(durationMs.toFixed(2));
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: rounded,
      ip: req.ip,
      userId: req.user?._id?.toString(),
      userAgent: req.get('user-agent'),
    };
    recordRequest(meta);
    if (res.statusCode >= 500) logger.error('HTTP request completed', meta);
    else if (res.statusCode >= 400) logger.warn('HTTP request completed', meta);
    else logger.info('HTTP request completed', meta);
  });
  next();
}
