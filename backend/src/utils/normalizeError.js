import { HTTP_STATUS } from '../constants/http.js';

export function normalizeError(error) {
  if (
    error?.type === 'entity.parse.failed' ||
    (error instanceof SyntaxError && error.status === 400 && 'body' in error)
  ) {
    return { statusCode: HTTP_STATUS.BAD_REQUEST, code: 'INVALID_JSON', message: 'Request body contains invalid JSON' };
  }
  if (error?.name === 'ValidationError') {
    return {
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: Object.values(error.errors || {}).map((item) => ({ path: item.path, message: item.message })),
    };
  }
  if (error?.name === 'CastError') {
    return { statusCode: HTTP_STATUS.BAD_REQUEST, code: 'INVALID_IDENTIFIER', message: `Invalid ${error.path}` };
  }
  if (error?.code === 11000) {
    return {
      statusCode: HTTP_STATUS.CONFLICT,
      code: 'DUPLICATE_RESOURCE',
      message: 'A record with the same unique value already exists',
      details: error.keyValue,
    };
  }
  if (error?.name === 'JsonWebTokenError') {
    return { statusCode: HTTP_STATUS.UNAUTHORIZED, code: 'INVALID_TOKEN', message: 'Invalid authentication token' };
  }
  if (error?.name === 'TokenExpiredError') {
    return { statusCode: HTTP_STATUS.UNAUTHORIZED, code: 'TOKEN_EXPIRED', message: 'Authentication token has expired' };
  }
  if (error?.name === 'MulterError') {
    return { statusCode: HTTP_STATUS.BAD_REQUEST, code: 'UPLOAD_ERROR', message: error.message };
  }
  return {
    statusCode: Number(error?.statusCode || error?.status) || HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code: error?.code && typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR',
    message: error?.message || 'Internal server error',
    details: error?.details,
  };
}
