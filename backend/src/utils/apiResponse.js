export function successResponse({ data = null, message = 'Request completed successfully', meta } = {}) {
  const response = { success: true, message, data };
  if (meta !== undefined) response.meta = meta;
  return response;
}

export function errorResponse({ message = 'Request failed', code = 'INTERNAL_ERROR', details, requestId } = {}) {
  const response = { success: false, message, error: { code } };
  if (details !== undefined) response.error.details = details;
  if (requestId) response.requestId = requestId;
  return response;
}
