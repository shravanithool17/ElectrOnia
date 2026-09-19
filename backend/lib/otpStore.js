// lib/otpStore.js — one-time codes, stored hashed.
//
// The code itself is never kept in memory: only a bcrypt hash of it, with an
// expiry and an attempt counter. A verified code is marked consumed and is
// deleted the moment it is spent on a signup, so the same code can never be
// replayed.
//
// Note: this is still process memory, so codes are lost on restart and it
// would not work across multiple server instances. Moving it to Redis (or a
// short-lived Mongo collection with a TTL index) is the next step if this is
// ever deployed to more than one instance.
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { env } from '../config/env.js';

const store = new Map(); // email -> { hash, expiresAt, attempts, verified, purpose }

/** Cryptographically random 6-digit code — Math.random() is not suitable here. */
function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function issueOtp(email, purpose = 'signup') {
  const code = generateCode();
  const hash = await bcrypt.hash(code, 10);

  store.set(email, {
    hash,
    expiresAt: Date.now() + env.otp.ttlMs,
    attempts: 0,
    verified: false,
    purpose,
  });

  // Returned only so the caller can email it. It is not retained anywhere.
  return code;
}

/** @returns {{ok: true} | {ok: false, reason: string}} */
export async function verifyOtp(email, code) {
  const record = store.get(email);

  if (!record) return { ok: false, reason: 'No code was requested for this email' };

  if (Date.now() > record.expiresAt) {
    store.delete(email);
    return { ok: false, reason: 'Code expired. Request a new one.' };
  }

  if (record.verified) return { ok: false, reason: 'This code has already been used' };

  if (record.attempts >= env.otp.maxAttempts) {
    store.delete(email);
    return { ok: false, reason: 'Too many incorrect attempts. Request a new code.' };
  }

  record.attempts += 1;

  const matches = await bcrypt.compare(String(code), record.hash);
  if (!matches) {
    const left = env.otp.maxAttempts - record.attempts;
    return { ok: false, reason: `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` };
  }

  record.verified = true;
  return { ok: true };
}

/** True only if this email has a verified, unexpired, unspent code. */
export function isVerified(email) {
  const record = store.get(email);
  return Boolean(record && record.verified && Date.now() <= record.expiresAt);
}

/** Call once the code has been spent (after a successful signup). */
export function consumeOtp(email) {
  store.delete(email);
}

// Drop expired entries every 5 minutes so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [email, record] of store) {
    if (now > record.expiresAt) store.delete(email);
  }
}, 5 * 60 * 1000).unref();
