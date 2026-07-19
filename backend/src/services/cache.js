import { createClient } from 'redis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let client;
let connecting;
const memory = new Map();

function memoryGet(key) {
  const item = memory.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return item.value;
}

async function getClient() {
  if (!env.cacheEnabled || !env.redisUrl) return null;
  if (client?.isReady) return client;
  if (!connecting) {
    client = createClient({
      url: env.redisUrl,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) },
    });
    client.on('error', (error) => logger.warn('Redis cache error', { error: error.message }));
    connecting = client
      .connect()
      .catch((error) => {
        logger.warn('Redis cache unavailable; using memory fallback', { error: error.message });
        return null;
      })
      .finally(() => {
        connecting = null;
      });
  }
  await connecting;
  return client?.isReady ? client : null;
}

export async function cacheGet(key) {
  const redis = await getClient();
  if (redis) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  return memoryGet(key);
}

export async function cacheSet(key, value, ttlSeconds = env.cacheDefaultTtlSeconds) {
  const redis = await getClient();
  if (redis) return redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function cacheDeletePattern(pattern) {
  const redis = await getClient();
  if (redis) {
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length) await redis.del(result.keys);
    } while (cursor !== '0');
    return;
  }
  const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
}

export async function closeCache() {
  if (client?.isOpen) await client.quit();
  client = undefined;
  memory.clear();
}
