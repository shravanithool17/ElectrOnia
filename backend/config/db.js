// config/db.js — connection lifecycle, kept out of server.js.
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

export async function connectDb(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  // Fail a query fast when the database is unreachable, instead of letting it
  // hang for the default 10s buffering window and surface as a timeout.
  mongoose.set('bufferTimeoutMS', 2000);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info('MongoDB connected');

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
}

export async function disconnectDb() {
  await mongoose.connection.close();
  logger.info('MongoDB disconnected');
}

/**
 * Creates any index declared on a model but not yet present in Mongo.
 * Called once on boot so a fresh clone gets the catalogue indexes without a
 * manual step.
 */
export async function syncIndexes(models) {
  await Promise.all(models.map((model) => model.syncIndexes()));
  logger.info('Indexes in sync');
}

export function dbState() {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][
    mongoose.connection.readyState
  ] ?? 'unknown';
}
