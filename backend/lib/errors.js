// lib/errors.js — typed errors so services never touch res.status().
//
// A service throws a domain error; the error handler is the single place that
// decides the HTTP status. That is what lets a service be called from a worker
// or a script without dragging HTTP concepts along.

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.expected = true; // distinguishes "we threw this" from a real crash
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(422, 'VALIDATION_FAILED', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = 'UNAUTHORIZED', message = 'Authentication required') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN', message = 'You do not have access to this') {
    super(403, code, message);
  }
}

/**
 * Also used for "exists but is not yours". Returning 403 there would confirm
 * the record exists, which is itself a leak — so ownership failures are 404.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Not found', code = 'NOT_FOUND') {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code, message, details) {
    super(409, code, message, details);
  }
}

export class BadRequestError extends AppError {
  constructor(code = 'BAD_REQUEST', message = 'Malformed request', details) {
    super(400, code, message, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, 'RATE_LIMITED', message);
  }
}
