// server.js — builds the Express app and returns it WITHOUT calling listen().
//
// The split matters: Supertest imports this module directly, so integration
// tests never bind a port and cannot collide in CI. index.js is the only file
// that listens.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { requestId } from './middleware/requestId.js';
import { sanitize } from './middleware/sanitize.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { mountRoutes } from './routes/index.js';

export function createApp() {
  const app = express();

  // Needed for correct client IPs behind Render/Vercel, which rate limiting
  // depends on.
  app.set('trust proxy', 1);

  // Order is deliberate: an id first so every later log line carries it;
  // rate limiting before body parsing so a flood of large bodies is cheap to
  // reject; sanitising after parsing, since it operates on parsed objects.
  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: curl, same-origin, server-to-server.
        if (!origin) return callback(null, true);
        if (
          env.corsOrigins.includes(origin) ||
          env.corsOrigins.includes('*') ||
          origin.endsWith('.vercel.app')
        ) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
      // Browsers hide response headers from scripts unless they are listed
      // here. X-Auth-Status is how optionalAuth tells the frontend its token
      // is dead; without this line the header is sent and never seen.
      exposedHeaders: ['X-Auth-Status', 'X-Request-Id'],
    })
  );
  app.use(compression());
  app.use(apiLimiter);
  app.use(
    express.json({
      limit: '1mb',
      // Keep the exact bytes for routes that verify a signature over the body.
      //
      // Razorpay signs the RAW payload. By the time express.json() has parsed
      // and the handler re-serialises, key order and whitespace can differ
      // from what was hashed — so the signature fails, and it fails
      // INTERMITTENTLY, which is far worse to debug than never working.
      //
      // The buffer is kept only for the webhook path, so ordinary requests do
      // not carry a second copy of their body through the request lifetime.
      verify: (req, _res, buf) => {
        if (req.originalUrl.startsWith('/api/v1/payments/') && req.originalUrl.includes('webhook')) {
          req.rawBody = buf;
        }
      },
    })
  );
  // The guest cart token is an httpOnly cookie — see cart.controller.js.
  app.use(cookieParser());
  app.use(sanitize);

  if (!env.isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.id,
        autoLogging: { ignore: (req) => req.url === '/health' },
      })
    );
  }

  mountRoutes(app);

  // Must come last, and in this order.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
