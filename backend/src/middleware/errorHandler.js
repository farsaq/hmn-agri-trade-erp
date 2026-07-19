import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/http.js';
import { normalizeError } from '../utils/normalizeError.js';
import { errorResponse } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, res) {
  return res.status(HTTP_STATUS.NOT_FOUND).json(
    errorResponse({
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      code: 'ROUTE_NOT_FOUND',
      requestId: req.requestId,
    }),
  );
}

export function errorHandler(error, req, res, _next) {
  if (res.headersSent) return _next(error);
  const normalized = normalizeError(error);
  logger.error('Request failed', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: normalized.statusCode,
    error,
  });
  const safeMessage = normalized.statusCode >= 500 && env.isProduction ? 'Internal server error' : normalized.message;
  const details = env.isProduction && normalized.statusCode >= 500 ? undefined : normalized.details;
  return res.status(normalized.statusCode).json(
    errorResponse({
      message: safeMessage,
      code: normalized.code,
      details,
      requestId: req.requestId,
    }),
  );
}
