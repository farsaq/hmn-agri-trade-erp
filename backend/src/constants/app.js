export const APP_NAME = 'HMN Agri Trade ERP';
export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;
export const LEGACY_API_PREFIX = '/api';
export const DEFAULT_PORT = 5000;
export const DEFAULT_CLIENT_URL = 'http://localhost:5173';
export const JSON_BODY_LIMIT = '5mb';
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 300;
export const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordConfirm',
  'currentPassword',
  'newPassword',
  'otp',
  'otpHash',
  'twoFactorCode',
  'twoFactorSecret',
  'recoveryCode',
  'recoveryCodeHashes',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
]);
