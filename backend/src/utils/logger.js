import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { getRuntimeConfig, runtimeEvents } from '../config/runtime.js';
import { redactSensitive } from './redact.js';

const LEVEL_WEIGHT = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const CHANNELS = Object.freeze(['application', 'error', 'security', 'audit']);
const streams = new Map();
let currentDate = '';
let cleanupDate = '';

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
function resolveLevel() {
  return getRuntimeConfig().logging.level || env.logLevel || (env.isProduction ? 'info' : 'debug');
}
function consoleEnabled() {
  return getRuntimeConfig().logging.console ?? env.logToConsole;
}
function logDirectory() {
  return path.resolve(process.cwd(), env.logDirectory);
}

function serializeError(error) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    stack: env.isProduction ? undefined : error.stack,
    cause: error.cause instanceof Error ? serializeError(error.cause) : error.cause,
  };
}

function normalizeMeta(meta = {}) {
  return redactSensitive(
    Object.fromEntries(
      Object.entries(meta).map(([key, value]) => [key, value instanceof Error ? serializeError(value) : value]),
    ),
  );
}

function closeStreams() {
  for (const stream of streams.values()) stream.end();
  streams.clear();
}

function cleanupOldLogs(today) {
  if (!env.logToFiles || cleanupDate === today) return;
  cleanupDate = today;
  const cutoff = Date.now() - env.logRetentionDays * 86_400_000;
  fs.mkdirSync(logDirectory(), { recursive: true });
  for (const file of fs.readdirSync(logDirectory())) {
    const match = file.match(/^(application|error|security|audit)-(\d{4}-\d{2}-\d{2})\.log$/);
    if (!match) continue;
    const timestamp = Date.parse(`${match[2]}T00:00:00.000Z`);
    if (Number.isFinite(timestamp) && timestamp < cutoff) {
      try {
        fs.unlinkSync(path.join(logDirectory(), file));
      } catch {
        /* next cleanup will retry */
      }
    }
  }
}

function getStream(channel, today) {
  if (!env.logToFiles || env.isTest) return undefined;
  if (currentDate !== today) {
    closeStreams();
    currentDate = today;
  }
  cleanupOldLogs(today);
  if (!streams.has(channel)) {
    fs.mkdirSync(logDirectory(), { recursive: true });
    streams.set(channel, fs.createWriteStream(path.join(logDirectory(), `${channel}-${today}.log`), { flags: 'a' }));
  }
  return streams.get(channel);
}

function write(level, message, meta = {}, channel = 'application') {
  if ((LEVEL_WEIGHT[level] ?? 20) < (LEVEL_WEIGHT[resolveLevel()] ?? 20)) return;
  if (!CHANNELS.includes(channel)) channel = 'application';
  const entry = redactSensitive({
    timestamp: new Date().toISOString(),
    level,
    channel,
    service: 'hmn-agri-trade-api',
    message,
    ...normalizeMeta(meta),
  });
  const output = `${JSON.stringify(entry, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))}\n`;
  if (consoleEnabled()) {
    if (level === 'error') console.error(output.trimEnd());
    else if (level === 'warn') console.warn(output.trimEnd());
    else console.log(output.trimEnd());
  }
  getStream(channel, dateKey())?.write(output);
  if (level === 'error' && channel !== 'error') getStream('error', dateKey())?.write(output);
}

runtimeEvents.on('reloaded', () => write('info', 'Runtime configuration reloaded'));
runtimeEvents.on('error', (error) => write('error', 'Runtime configuration reload failed', { error }));
process.once('beforeExit', closeStreams);

export const logger = Object.freeze({
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  security: (message, meta, level = 'warn') => write(level, message, meta, 'security'),
  audit: (message, meta, level = 'info') => write(level, message, meta, 'audit'),
  close: closeStreams,
});
