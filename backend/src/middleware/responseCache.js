import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { cacheDeletePattern, cacheGet, cacheSet } from '../services/cache.js';

const CACHEABLE_PREFIXES = ['/dashboard', '/ai/insights', '/ai-pro/dashboard', '/ai-pro/report-summary'];

function cacheKey(req) {
  const identitySource =
    req.get('authorization') || req.cookies?.accessToken || req.cookies?.token || req.ip || 'anonymous';
  const identity = crypto.createHash('sha256').update(String(identitySource)).digest('hex').slice(0, 24);
  return `http:${identity}:${req.originalUrl}`;
}

export async function responseCache(req, res, next) {
  if (!env.cacheEnabled) return next();
  if (!['GET', 'HEAD'].includes(req.method)) {
    if (!['OPTIONS'].includes(req.method)) cacheDeletePattern('http:*').catch(() => {});
    return next();
  }
  const path = req.path.replace(/^\/api(?:\/v1)?/, '');
  if (!CACHEABLE_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();
  try {
    const key = cacheKey(req);
    const cached = await cacheGet(key);
    if (cached) {
      res.setHeader('x-cache', 'HIT');
      return res.status(cached.statusCode || 200).json(cached.body);
    }
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300)
        cacheSet(key, { statusCode: res.statusCode, body }).catch(() => {});
      res.setHeader('x-cache', 'MISS');
      return originalJson(body);
    };
    return next();
  } catch {
    return next();
  }
}
