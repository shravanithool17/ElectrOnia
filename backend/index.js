// index.js — the only file that listens. Everything else is in server.js.
//
// The listener starts FIRST, then the database connects in the background.
// That ordering is deliberate: if the process waited for Mongo and exited on
// failure, an unreachable database would present in the browser as
// "Failed to fetch" — a connection refused, with no clue as to why. Starting
// the listener means the same situation returns a readable 503 from /ready and
// a clear message in the log.
import { createApp } from './server.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb, syncIndexes, disconnectDb } from './config/db.js';
import { seedIfEmpty } from './lib/seed.js';
import { verifyMailer } from './lib/mailer.js';
import { paymentService } from './modules/payments/payment.service.js';
import Product from './model/product.model.js';
import Order from './model/order.model.js';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`ElectrOnia API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  logger.info(`Health: http://localhost:${env.port}/health   Readiness: /ready`);
});

async function initDatabase() {
  try {
    await connectDb();
    if (env.seedOnBoot) await seedIfEmpty();
    await syncIndexes([Product, Order]);
  } catch (err) {
    logger.error(
      { err: err.message },
      'Could not reach MongoDB. The API is listening but /ready will report not-ready ' +
        'and every database-backed route will fail. Check that MongoDB is running and ' +
        'that MONGO_URI in .env is correct.'
    );
    // Mongoose keeps retrying on its own, so a database that comes up later is
    // picked up without a restart.
  }
}

initDatabase();

// Checked at boot so bad SMTP credentials appear in the startup log, not the
// first time somebody tries to sign up. It never prevents the app from
// starting — email degrades to the console.
verifyMailer();

// Release stock held by online orders nobody paid for. Without a sweep, an
// abandoned Razorpay window keeps its units off sale until that same customer
// happens to check out again. Every five minutes is far more often than the
// 30-minute payment window needs, and each run touches at most 100 orders.
// It is safe to run on every instance: each release is a conditional update,
// so two sweeps racing on one order release it once.
const SWEEP_EVERY_MS = 5 * 60 * 1000;
const sweep = setInterval(() => {
  paymentService.expireStale().catch((err) =>
    logger.error({ err: err.message }, 'Unpaid-order sweep failed')
  );
}, SWEEP_EVERY_MS);
sweep.unref();

// Finish in-flight requests before exiting, so a deploy does not drop a
// checkout mid-transaction.
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    await disconnectDb().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
