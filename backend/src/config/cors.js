import { env } from './env.js';

export const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.clientUrls.includes(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS');
    error.statusCode = 403;
    error.code = 'CORS_ORIGIN_DENIED';
    return callback(error);
  },
};
