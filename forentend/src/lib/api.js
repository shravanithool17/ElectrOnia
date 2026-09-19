// src/lib/api.js — one place that knows where the API lives.
//
// The host used to be hardcoded as http://localhost:3000 in thirteen files,
// which meant the app could not be deployed without a find-and-replace. It
// now comes from the Vite environment, with the local default kept so
// nothing changes for development.
//
// Set VITE_API_URL in .env.production (or in your Vercel project settings)
// to the deployed API origin, e.g. https://electronia-api.onrender.com
import { getToken, clearToken } from './auth';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Re-exported so existing imports of getToken from here keep working.
export { getToken };

/** Server codes meaning "the token you sent is no good" — as opposed to "no access". */
const DEAD_TOKEN_CODES = new Set(['INVALID_TOKEN', 'TOKEN_EXPIRED', 'LEGACY_TOKEN']);

/**
 * Thin fetch wrapper: prefixes the API base, attaches the bearer token when
 * asked, parses JSON, and throws an Error carrying the server's message so
 * callers can show something better than "Failed to fetch".
 */
export async function api(path, { role, auth = false, headers = {}, ...options } = {}) {
  const token = auth ? getToken(role) : null;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    // The guest cart is owned by an httpOnly `cartToken` cookie the server
    // issues, so cross-origin requests have to carry credentials or every
    // page load looks like a brand-new visitor. The API's CORS config sets
    // credentials: true and allowlists origins, so this is not open to
    // arbitrary sites.
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Empty or non-JSON body — leave payload null.
  }

  // A token we sent was rejected. Two ways the server says so:
  //   - the cart, which lets guests in, still answers 200 but sets
  //     X-Auth-Status, because treating a dead token as "no token" is correct
  //     for browsing but must not go unnoticed
  //   - authenticated routes answer 401 with a dead-token code
  // Either way the token is dropped here, once, for the whole app — which is
  // what makes the cart re-read as a guest instead of silently diverging from
  // what checkout can see.
  if (token) {
    const authStatus = response.headers.get('X-Auth-Status');
    const deadOn401 = response.status === 401 && DEAD_TOKEN_CODES.has(payload?.error?.code);
    if (authStatus || deadOn401) {
      clearToken(role ?? 'customer', authStatus ?? payload.error.code);
    }
  }

  if (!response.ok) {
    // The API's error shape is { error: { code, message, details }, requestId }.
    // This used to read payload.message and payload.code off the top level,
    // which are never there — so every server-side message ("Coupon has
    // expired", "Enter a valid 6-digit PIN code") was replaced by a generic
    // "Request failed (400)". The flat form is still accepted in case an
    // older route has not been migrated.
    const body = payload?.error ?? payload ?? {};

    const error = new Error(body.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = body.code;
    // Field-level validation errors, so a form can render them inline rather
    // than as one opaque sentence.
    error.details = body.details ?? [];
    error.requestId = payload?.requestId;
    throw error;
  }

  return payload;
}

/**
 * The catalogue endpoint returns { items, page, total, totalPages }.
 * Older code expected a bare array, so this accepts either shape.
 */
export function toList(data) {
  if (Array.isArray(data)) return data;
  return data?.items ?? [];
}
