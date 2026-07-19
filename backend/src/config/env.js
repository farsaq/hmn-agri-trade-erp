import dotenv from 'dotenv';
import { z } from 'zod';
import { DEFAULT_CLIENT_URL, DEFAULT_PORT } from '../constants/app.js';

dotenv.config({ quiet: true });

const bool = (fallback = false) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return value;
  }, z.boolean());

const integer = (fallback, min, max) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return fallback;
    return Number(value);
  }, z.number().int().min(min).max(max));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: integer(DEFAULT_PORT, 1, 65535),
    TRUST_PROXY: integer(1, 0, 10),
    MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
    JWT_ISSUER: z.string().default('hmn-agri-trade-api'),
    JWT_AUDIENCE: z.string().default('hmn-agri-trade-web'),
    CLIENT_URL: z.string().default(DEFAULT_CLIENT_URL),
    REQUIRE_EMAIL_VERIFICATION: bool(false),
    BACKUP_AUTO_ENABLED: bool(false),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    LOG_TO_FILES: bool(true),
    LOG_TO_CONSOLE: bool(true),
    LOG_RETENTION_DAYS: integer(30, 1, 3650),
    LOG_DIRECTORY: z.string().default('logs'),
    METRICS_TOKEN: z.string().optional(),
    RUNTIME_CONFIG_PATH: z.string().optional(),
    JSON_BODY_LIMIT: z.string().default('2mb'),
    COMPRESSION_THRESHOLD_BYTES: integer(1024, 0, 10_000_000),
    MONGO_MAX_POOL_SIZE: integer(20, 1, 500),
    MONGO_MIN_POOL_SIZE: integer(0, 0, 100),
    MONGO_SERVER_SELECTION_TIMEOUT_MS: integer(10_000, 1000, 120_000),
    MONGO_SOCKET_TIMEOUT_MS: integer(45_000, 1000, 300_000),
    MONGO_SLOW_QUERY_MS: integer(250, 10, 60_000),
    CACHE_ENABLED: bool(false),
    CACHE_DEFAULT_TTL_SECONDS: integer(60, 1, 86_400),
    REDIS_URL: z.string().optional(),
  })
  .passthrough();

export function validateEnvironment(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Environment validation failed: ${details}`);
  }
  const value = parsed.data;
  if (value.NODE_ENV === 'production') {
    const normalizedSecret = value.JWT_SECRET.toLowerCase();
    const weakMarkers = ['replace', 'changeme', 'change_me', 'local_development', 'development_only', 'example'];
    if (weakMarkers.some((marker) => normalizedSecret.includes(marker)) || new Set(value.JWT_SECRET).size < 12) {
      throw new Error('JWT_SECRET is weak or uses a placeholder value in production');
    }
  }
  const clientUrls = value.CLIENT_URL.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!clientUrls.length) throw new Error('CLIENT_URL must include at least one allowed origin');
  return Object.freeze({
    nodeEnv: value.NODE_ENV,
    isProduction: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
    port: value.PORT,
    mongoUri: value.MONGO_URI,
    jwtSecret: value.JWT_SECRET,
    jwtIssuer: value.JWT_ISSUER,
    jwtAudience: value.JWT_AUDIENCE,
    clientUrls: Object.freeze(clientUrls),
    trustProxy: value.TRUST_PROXY,
    requireEmailVerification: value.REQUIRE_EMAIL_VERIFICATION,
    backupAutoEnabled: value.BACKUP_AUTO_ENABLED,
    logLevel: value.LOG_LEVEL,
    logToFiles: value.LOG_TO_FILES,
    logToConsole: value.LOG_TO_CONSOLE,
    logRetentionDays: value.LOG_RETENTION_DAYS,
    logDirectory: value.LOG_DIRECTORY,
    metricsToken: value.METRICS_TOKEN,
    runtimeConfigPath: value.RUNTIME_CONFIG_PATH,
    jsonBodyLimit: value.JSON_BODY_LIMIT,
    compressionThresholdBytes: value.COMPRESSION_THRESHOLD_BYTES,
    mongoMaxPoolSize: value.MONGO_MAX_POOL_SIZE,
    mongoMinPoolSize: value.MONGO_MIN_POOL_SIZE,
    mongoServerSelectionTimeoutMs: value.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    mongoSocketTimeoutMs: value.MONGO_SOCKET_TIMEOUT_MS,
    mongoSlowQueryMs: value.MONGO_SLOW_QUERY_MS,
    cacheEnabled: value.CACHE_ENABLED,
    cacheDefaultTtlSeconds: value.CACHE_DEFAULT_TTL_SECONDS,
    redisUrl: value.REDIS_URL,
  });
}

export const env = validateEnvironment();
