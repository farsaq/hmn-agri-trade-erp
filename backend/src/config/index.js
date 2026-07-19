import { env } from './env.js';
import { corsOptions } from './cors.js';
import { getRuntimeConfig } from './runtime.js';
import {
  API_PREFIX,
  APP_NAME,
  LEGACY_API_PREFIX,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from '../constants/app.js';

export const config = Object.freeze({
  app: Object.freeze({
    name: APP_NAME,
    apiPrefix: API_PREFIX,
    legacyApiPrefix: LEGACY_API_PREFIX,
    jsonBodyLimit: env.jsonBodyLimit,
    compressionThresholdBytes: env.compressionThresholdBytes,
  }),
  env,
  cors: corsOptions,
  rateLimit: Object.freeze({ windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: RATE_LIMIT_MAX_REQUESTS }),
  runtime: getRuntimeConfig,
});
