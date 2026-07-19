import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import routes from './routes/index.js';
import enterpriseRoutes from './routes/enterprise.js';
import operationsRoutes from './routes/operations.js';
import financeRoutes from './routes/finance.js';
import governanceRoutes from './routes/governance.js';
import aiRoutes from './routes/ai.js';
import integrationRoutes from './routes/integrations.js';
import healthRoutes from './routes/health.js';
import accountingRoutes from './routes/accounting.js';
import { config } from './config/index.js';
import { getRuntimeConfig, isFeatureEnabled } from './config/runtime.js';
import { API_PREFIX, APP_NAME, LEGACY_API_PREFIX } from './constants/app.js';
import { requestContext } from './middleware/requestContext.js';
import { httpLogger } from './middleware/httpLogger.js';
import { auditMutation } from './middleware/auditMutation.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { csrfGuard, sanitizeRequest, securityResponseHeaders } from './middleware/security.js';
import { responseCache } from './middleware/responseCache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsPath = path.resolve(__dirname, '../uploads');
const apiRouters = Object.freeze([
  routes,
  enterpriseRoutes,
  operationsRoutes,
  financeRoutes,
  governanceRoutes,
  aiRoutes,
  integrationRoutes,
  accountingRoutes,
]);

function mountApi(app, prefix, limiter) {
  app.use(prefix, limiter, healthRoutes, ...apiRouters);
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.env.trustProxy);

  app.use(requestContext);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors(config.cors));
  app.use(compression({ threshold: config.app.compressionThresholdBytes }));
  app.use(express.json({ limit: config.app.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.app.jsonBodyLimit }));
  app.use(cookieParser());
  app.use(securityResponseHeaders);
  app.use(sanitizeRequest);
  app.use(csrfGuard);
  app.use(responseCache);
  app.use((req, res, next) => {
    const maintenance = getRuntimeConfig().maintenance;
    if (!maintenance.enabled || req.path.includes('/health')) return next();
    return res.status(503).json({
      success: false,
      message: maintenance.message,
      error: { code: 'MAINTENANCE_MODE' },
      requestId: req.requestId,
    });
  });
  if (!config.env.isTest) app.use(httpLogger);
  app.use(
    '/uploads',
    express.static(uploadsPath, { index: false, dotfiles: 'deny', maxAge: config.env.isProduction ? '1d' : 0 }),
  );
  app.use(auditMutation);

  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.maxRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests', error: { code: 'RATE_LIMIT_EXCEEDED' } },
  });

  mountApi(app, API_PREFIX, limiter);

  // Backward-compatible routes. New clients should use /api/v1.
  if (isFeatureEnabled('legacyApi')) mountApi(app, LEGACY_API_PREFIX, limiter);

  app.get('/', (req, res) =>
    res.success({
      message: `${APP_NAME} API is running`,
      data: {
        version: '4.7.0',
        currentApi: API_PREFIX,
        health: `${API_PREFIX}/health`,
        realtime: true,
      },
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
