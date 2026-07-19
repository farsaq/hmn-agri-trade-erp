import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const response = (code, message) => ({ success: false, message, error: { code } });

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '')
      .trim()
      .toLowerCase()}`,
  message: response('AUTH_LOGIN_RATE_LIMITED', 'Too many failed login attempts. Try again later.'),
});

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: response('AUTH_OTP_RATE_LIMITED', 'Too many OTP requests. Try again later.'),
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: response('AUTH_RESET_RATE_LIMITED', 'Too many password reset requests. Try again later.'),
});

export const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: response('AUTH_REFRESH_RATE_LIMITED', 'Too many session refresh attempts.'),
});
