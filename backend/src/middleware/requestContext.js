import crypto from 'crypto';

export function requestContext(req, res, next) {
  const requestId = req.get('x-request-id')?.trim() || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  res.success = ({ statusCode = 200, data = null, message, meta } = {}) => {
    const payload = { success: true, message: message || 'Request completed successfully', data };
    if (meta !== undefined) payload.meta = meta;
    return res.status(statusCode).json(payload);
  };
  next();
}
