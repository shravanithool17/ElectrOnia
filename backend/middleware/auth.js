// middleware/auth.js — the single place that decides who a request is from.
//
// Before this existed, every protected route ran its own jwt.verify() and only
// checked that *some* valid token was present. Customer and vendor tokens were
// structurally identical, so a customer token was accepted on the "vendor only"
// routes. Tokens now carry a role claim and requireRole() enforces it.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

export const ROLES = {
  CUSTOMER: 'customer',
  VENDOR: 'vendor',
  ADMIN: 'admin',
};

export function signToken(payload) {
  if (!payload.role) throw new Error('signToken: a role claim is required');
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function decode(token) {
  try {
    return { ok: true, payload: jwt.verify(token, env.jwtSecret) };
  } catch (err) {
    return { ok: false, expired: err.name === 'TokenExpiredError' };
  }
}

export function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next(new UnauthorizedError());

  const result = decode(token);
  if (!result.ok) {
    return next(
      result.expired
        ? new UnauthorizedError('TOKEN_EXPIRED', 'Session expired. Please log in again.')
        : new UnauthorizedError('INVALID_TOKEN', 'Invalid token')
    );
  }

  // Tokens issued before roles existed cannot be authorised safely.
  if (!result.payload.role) {
    return next(
      new UnauthorizedError('LEGACY_TOKEN', 'Your session is out of date. Please log in again.')
    );
  }

  req.user = {
    id: result.payload.id,
    email: result.payload.email,
    name: result.payload.name,
    role: result.payload.role,
  };
  return next();
}

/** Attaches req.user when a valid token is present, but never rejects. */
/**
 * For routes a guest may use (the cart). No token → guest.
 *
 * A token that is PRESENT but rejected is different from no token, and used to
 * be treated the same: the request silently became a guest request. That is
 * how the cart drawer showed items (from the guest cart) while checkout, which
 * requires auth, said "Invalid token" — two views of two different carts, and
 * nothing telling the browser its session was dead.
 *
 * It still proceeds as a guest, so a stale token never breaks browsing, but
 * the response now says so in `X-Auth-Status`. The frontend's api() helper
 * reads that header, drops the dead token, and the cart re-reads as the
 * identity it actually has.
 */
export function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next();

  const result = decode(token);
  if (result.ok && result.payload.role) {
    req.user = {
      id: result.payload.id,
      email: result.payload.email,
      name: result.payload.name,
      role: result.payload.role,
    };
    return next();
  }

  res.set(
    'X-Auth-Status',
    result.expired ? 'expired' : !result.ok ? 'invalid' : 'legacy'
  );
  return next();
}

/** Use after requireAuth: requireRole(ROLES.VENDOR) or requireRole(V, ADMIN). */
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!allowed.includes(req.user.role)) {
      return next(
        new ForbiddenError('ROLE_REQUIRED', `This action requires: ${allowed.join(' or ')}`)
      );
    }
    return next();
  };
}
