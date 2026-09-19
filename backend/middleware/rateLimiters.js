// middleware/rateLimiters.js
//
// The OTP and login routes are the ones worth brute-forcing, so they get
// tighter limits than the rest of the API. Disabled under test so the suite
// does not trip them.
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const passthrough = (req, res, next) => next();

function build({ windowMs, max, message }) {
  if (env.isTest || !env.isProd) return passthrough;
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message },
        requestId: req.id,
      }),
  });
}

export const otpLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many code requests. Try again in 15 minutes.',
});

export const loginLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Try again in 15 minutes.',
});

export const apiLimiter = build({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Too many requests. Slow down.',
});

// Forgot-password: requesting a code and submitting one. Each code also has
// its own 5-guess limit, stored with the code; this caps a single client
// across many codes and many emails.
export const passwordResetLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many password reset attempts. Try again in 15 minutes.',
});
