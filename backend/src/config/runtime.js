import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RUNTIME_PATH = path.resolve(__dirname, '../../config/runtime.json');
const runtimePath = path.resolve(process.env.RUNTIME_CONFIG_PATH || DEFAULT_RUNTIME_PATH);

const runtimeSchema = z
  .object({
    featureFlags: z.record(z.string(), z.boolean()).default({}),
    logging: z
      .object({
        level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
        console: z.boolean().optional(),
      })
      .default({}),
    maintenance: z
      .object({
        enabled: z.boolean().default(false),
        message: z.string().max(500).default('Service is temporarily unavailable'),
      })
      .default({}),
  })
  .strict();

const defaults = Object.freeze({
  featureFlags: Object.freeze({
    ai: true,
    integrations: true,
    cloudinary: true,
    automaticBackups: true,
    realtimeNotifications: true,
    legacyApi: true,
  }),
  logging: Object.freeze({}),
  maintenance: Object.freeze({ enabled: false, message: 'Service is temporarily unavailable' }),
});

let current = defaults;
let watcher;
export const runtimeEvents = new EventEmitter();

function mergeRuntime(parsed) {
  return Object.freeze({
    featureFlags: Object.freeze({ ...defaults.featureFlags, ...parsed.featureFlags }),
    logging: Object.freeze({ ...defaults.logging, ...parsed.logging }),
    maintenance: Object.freeze({ ...defaults.maintenance, ...parsed.maintenance }),
  });
}

export function loadRuntimeConfig({ allowMissing = true } = {}) {
  if (!fs.existsSync(runtimePath)) {
    if (!allowMissing) throw new Error(`Runtime configuration file not found: ${runtimePath}`);
    current = defaults;
    return current;
  }
  const raw = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  current = mergeRuntime(runtimeSchema.parse(raw));
  runtimeEvents.emit('reloaded', current);
  return current;
}

export function getRuntimeConfig() {
  return current;
}

export function isFeatureEnabled(name) {
  return current.featureFlags[name] === true;
}

export function watchRuntimeConfig() {
  if (watcher || process.env.NODE_ENV === 'test') return;
  const directory = path.dirname(runtimePath);
  fs.mkdirSync(directory, { recursive: true });
  watcher = fs.watch(directory, { persistent: false }, (_event, filename) => {
    if (!filename || path.resolve(directory, filename.toString()) !== runtimePath) return;
    clearTimeout(watchRuntimeConfig.timer);
    watchRuntimeConfig.timer = setTimeout(() => {
      try {
        loadRuntimeConfig();
      } catch (error) {
        runtimeEvents.emit('error', error);
      }
    }, 250);
  });
}

export function closeRuntimeConfigWatcher() {
  watcher?.close();
  watcher = undefined;
}

export { runtimePath };
loadRuntimeConfig();
