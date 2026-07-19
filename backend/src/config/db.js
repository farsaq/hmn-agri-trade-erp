import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import { recordDatabaseCommand } from '../utils/metrics.js';

mongoose.set('strictQuery', true);

const startedCommands = new Map();
let monitoringAttached = false;

function summarizeCommand(event) {
  const command = event.command || {};
  const collection =
    command[event.commandName] || command.aggregate || command.find || command.update || command.delete || 'unknown';
  return {
    commandName: event.commandName,
    database: event.databaseName,
    collection: String(collection),
    requestId: event.requestId,
  };
}

function attachCommandMonitoring(client) {
  if (monitoringAttached) return;
  monitoringAttached = true;
  client.on('commandStarted', (event) =>
    startedCommands.set(event.requestId, { startedAt: process.hrtime.bigint(), ...summarizeCommand(event) }),
  );
  client.on('commandSucceeded', (event) => {
    const item = startedCommands.get(event.requestId);
    if (!item) return;
    startedCommands.delete(event.requestId);
    const durationMs = Number(process.hrtime.bigint() - item.startedAt) / 1_000_000;
    recordDatabaseCommand({ ...item, durationMs, success: true });
    if (durationMs >= env.mongoSlowQueryMs)
      logger.warn('Slow MongoDB command', { ...item, durationMs: Number(durationMs.toFixed(2)) });
  });
  client.on('commandFailed', (event) => {
    const item = startedCommands.get(event.requestId);
    startedCommands.delete(event.requestId);
    const durationMs = item ? Number(process.hrtime.bigint() - item.startedAt) / 1_000_000 : 0;
    recordDatabaseCommand({
      ...(item || { commandName: event.commandName, requestId: event.requestId }),
      durationMs,
      success: false,
    });
    logger.error('MongoDB command failed', {
      ...(item || {}),
      commandName: event.commandName,
      durationMs: Number(durationMs.toFixed(2)),
      failure: event.failure?.message,
    });
  });
}

export async function connectDB() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: env.mongoServerSelectionTimeoutMs,
    socketTimeoutMS: env.mongoSocketTimeoutMs,
    maxPoolSize: env.mongoMaxPoolSize,
    minPoolSize: env.isProduction ? Math.max(2, env.mongoMinPoolSize) : env.mongoMinPoolSize,
    monitorCommands: true,
  });
  attachCommandMonitoring(mongoose.connection.getClient());
  logger.info('MongoDB connected', {
    database: mongoose.connection.name,
    maxPoolSize: env.mongoMaxPoolSize,
    minPoolSize: env.isProduction ? Math.max(2, env.mongoMinPoolSize) : env.mongoMinPoolSize,
    slowQueryMs: env.mongoSlowQueryMs,
  });
  return mongoose.connection;
}

export async function disconnectDB() {
  startedCommands.clear();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
