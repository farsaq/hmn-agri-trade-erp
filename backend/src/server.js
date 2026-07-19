import http from 'http';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { User } from './models/index.js';
import { setRealtime } from './services/realtime.js';
import { startBackupScheduler } from './services/backup.js';
import { startCloudSyncScheduler } from './controllers/cloudinaryEnterprise.js';
import { logger } from './utils/logger.js';
import {
  loadRuntimeConfig,
  watchRuntimeConfig,
  closeRuntimeConfigWatcher,
  isFeatureEnabled,
} from './config/runtime.js';
import { startRecurringJournalScheduler, stopRecurringJournalScheduler } from './services/recurringJournals.js';
import { closeCache } from './services/cache.js';

const app = createApp();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: env.clientUrls, credentials: true } });
setRealtime(io);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(decoded.id).populate('customRole');
    if (!user || !user.active) return next(new Error('Invalid user'));
    socket.user = user;
    return next();
  } catch {
    return next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user._id}`);
  socket.join(`role:${socket.user.role}`);
  socket.emit('realtime:ready', { connected: true });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutdown signal received', { signal });
  server.close(async () => {
    try {
      closeRuntimeConfigWatcher();
      stopRecurringJournalScheduler();
      await closeCache();
      await disconnectDB();
      logger.info('Server stopped');
      logger.close();
      process.exit(0);
    } catch (error) {
      logger.error('Graceful shutdown failed', { error });
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGHUP', () => {
  try {
    loadRuntimeConfig();
    logger.info('Runtime configuration reloaded via SIGHUP');
  } catch (error) {
    logger.error('Runtime configuration reload failed', { error });
  }
});
process.on('unhandledRejection', (error) => logger.error('Unhandled rejection', { error }));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  shutdown('uncaughtException');
});

try {
  await connectDB();
  server.listen(env.port, () => {
    logger.info('API server listening', { port: env.port, apiPrefix: '/api/v1', legacyApiPrefix: '/api' });
    watchRuntimeConfig();
    const backupStatus = isFeatureEnabled('automaticBackups') ? startBackupScheduler() : { enabled: false };
    if (isFeatureEnabled('cloudinary')) startCloudSyncScheduler();
    const recurringStatus = startRecurringJournalScheduler();
    if (recurringStatus.enabled) logger.info('Recurring journal scheduler enabled', recurringStatus);
    if (backupStatus.enabled) {
      logger.info('Automatic backup enabled', {
        intervalHours: backupStatus.intervalHours,
        provider: backupStatus.provider,
      });
    }
  });
} catch (error) {
  logger.error('Application startup failed', { error });
  process.exit(1);
}
