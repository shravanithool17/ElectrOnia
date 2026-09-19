// middleware/errorHandler.js — the only place that maps an error to a status.
import mongoose from 'mongoose';
import { AppError } from '../lib/errors.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export function notFound(req, res) {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    requestId: req.id,
  });
}

// Express identifies an error handler by its four-parameter signature, so
// `next` must stay even though it is unused.
export function errorHandler(err, req, res, _next) {
  const mapped = mapError(err);
  const log = logger.child({ requestId: req.id, route: `${req.method} ${req.path}` });

  if (mapped.status >= 500) {
    // A genuine crash — keep the stack.
    log.error({ err, code: mapped.code }, 'Unhandled error');
  } else {
    // An expected refusal — one line, no stack.
    log.warn({ code: mapped.code, status: mapped.status }, mapped.message);
  }

  res.status(mapped.status).json({
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details ? { details: mapped.details } : {}),
    },
    requestId: req.id,
  });
}

function mapError(err) {
  if (err instanceof AppError || err?.expected || (err?.status && err?.code)) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }

  // Mongoose schema validation that got past zod.
  if (err instanceof mongoose.Error.ValidationError) {
    return {
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Some fields need attention',
      details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  }

  // Mongoose could not reach the database at all.
  if (
    err.name === 'MongooseServerSelectionError' ||
    err.name === 'MongoNetworkError' ||
    /buffering timed out|failed to connect/i.test(err.message ?? '')
  ) {
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'The database is unreachable. Check that MongoDB is running.',
    };
  }

  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, code: 'INVALID_ID', message: `Invalid ${err.path}` };
  }

  // Unique index violation.
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return { status: 409, code: 'DUPLICATE_KEY', message: `That ${field} is already in use` };
  }

  if (err.message?.includes('is not allowed')) {
    return { status: 403, code: 'ORIGIN_NOT_ALLOWED', message: err.message };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    // Never leak an internal message in production.
    message: env.isProd ? 'Something went wrong' : err.message || 'Something went wrong',
  };
}
