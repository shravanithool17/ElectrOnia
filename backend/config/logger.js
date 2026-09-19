// config/logger.js — structured JSON logs.
//
// pino rather than winston + morgan: one dependency covers both request
// logging and application logging, and it is measurably faster.
//
// Redaction is configured here, at the serialiser, rather than relying on
// every call site to remember not to log a password.
import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.otp',
      'req.body.token',
      '*.passwordHash',
      '*.otpHash',
      'password',
      'otp',
    ],
    censor: '[redacted]',
  },
  // Pretty output in development; raw JSON everywhere else so a log shipper
  // can parse it.
  transport: env.isProd || env.isTest
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});
