import crypto from 'crypto';
import { env } from '../config/env.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function sanitizeValue(value, path = 'body') {
  if (Array.isArray(value)) return value.map((item, index) => sanitizeValue(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;

  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key) || key.startsWith('$') || key.includes('.')) {
      const error = new Error(`Unsafe input key rejected at ${path}.${key}`);
      error.statusCode = 400;
      error.code = 'UNSAFE_INPUT_KEY';
      throw error;
    }
    clean[key] = sanitizeValue(item, `${path}.${key}`);
  }
  return clean;
}

export function sanitizeRequest(req, _res, next) {
  try {
    if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body, 'body');
    if (req.params && typeof req.params === 'object') req.params = sanitizeValue(req.params, 'params');
    if (req.query && typeof req.query === 'object') {
      const cleanQuery = sanitizeValue(req.query, 'query');
      for (const key of Object.keys(req.query)) delete req.query[key];
      Object.assign(req.query, cleanQuery);
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function csrfGuard(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const cookieAuthenticatedRoute = req.path.endsWith('/auth/refresh') || req.path.endsWith('/auth/logout');
  const hasAuthCookie = Boolean(req.cookies?.hmn_refresh || req.cookies?.hmn_trusted_device);
  if (!cookieAuthenticatedRoute && !hasAuthCookie) return next();

  const origin = req.get('origin');
  if (!origin || !env.clientUrls.includes(origin)) {
    return res.status(403).json({
      success: false,
      message: 'CSRF origin validation failed',
      error: { code: 'CSRF_ORIGIN_DENIED' },
      requestId: req.requestId,
    });
  }
  if (req.get('x-hmn-csrf') !== '1') {
    return res.status(403).json({
      success: false,
      message: 'CSRF header is required',
      error: { code: 'CSRF_HEADER_REQUIRED' },
      requestId: req.requestId,
    });
  }
  return next();
}

export function securityResponseHeaders(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

export function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
