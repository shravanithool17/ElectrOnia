// lib/razorpay.js — the payment provider boundary.
//
// Everything that knows Razorpay's wire format lives here. The rest of the
// app talks in orders and amounts; swapping provider means rewriting this file
// and nothing else.
//
// THREE THINGS THAT MATTER MORE THAN THE REST
//
// 1. SIGNATURES ARE COMPARED IN CONSTANT TIME. `a === b` on a string returns
//    as soon as two bytes differ, and that timing difference is enough to
//    recover a signature byte by byte. crypto.timingSafeEqual does not leak
//    that, and it is one line either way.
//
// 2. THE WEBHOOK IS SIGNED OVER THE RAW BYTES. Once express.json() has parsed
//    and re-serialised the body, key order and whitespace can differ from what
//    Razorpay hashed, and the signature will not match — intermittently, which
//    is worse than never. server.js keeps the raw buffer for that one route.
//
// 3. AMOUNTS ARE ALREADY PAISE. Razorpay's smallest unit for INR is paise, and
//    ADR 0003 says money is stored in paise, so nothing is converted here.
//    Converting "just to be safe" is how you ship a 100× charge.
//
// The provider callback the browser posts back is a convenience: it lets the
// success screen appear immediately. The WEBHOOK is the source of truth (ADR
// 0005), because the browser can be closed, throttled, or lying.
import crypto from 'crypto';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const API_BASE = 'https://api.razorpay.com/v1';

/** Razorpay caps receipt at 40 characters; an ObjectId plus a prefix fits. */
const receiptFor = (orderId) => `ord_${String(orderId)}`.slice(0, 40);

/**
 * HMAC-SHA256, hex. Razorpay signs everything this way; only the secret and
 * the payload differ.
 */
function hmac(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two hex signatures.
 *
 * timingSafeEqual throws if the buffers differ in length, which itself would
 * leak length — so length is checked first and returns the same `false` the
 * mismatch path returns.
 */
export function signaturesMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  if (expected.length !== received.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Verifies the signature Checkout hands back to the browser.
 *
 * Razorpay signs `${razorpay_order_id}|${razorpay_payment_id}` with the KEY
 * SECRET. The pipe matters: concatenating without it would let a different
 * split of the same characters produce the same signature.
 *
 * @returns {boolean}
 */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!env.razorpay.keySecret) return false;
  if (!orderId || !paymentId || !signature) return false;

  return signaturesMatch(hmac(`${orderId}|${paymentId}`, env.razorpay.keySecret), signature);
}

/**
 * Verifies a webhook. Signed over the RAW request body with the WEBHOOK
 * SECRET — a different secret from the key secret, set when you create the
 * webhook in the dashboard.
 *
 * @param {Buffer|string} rawBody exactly the bytes received
 * @param {string} signature the X-Razorpay-Signature header
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret) return false;
  if (!rawBody || !signature) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  return signaturesMatch(hmac(body, env.razorpay.webhookSecret), signature);
}

/** Basic-auth header. key id is the user, key secret is the password. */
function authHeader() {
  const token = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64');
  return `Basic ${token}`;
}

/**
 * Creates the provider-side order the browser needs to open Checkout.
 *
 * @param {{amountPaise: number, orderId: string, notes?: object}} input
 * @returns {Promise<{id: string, amount: number, currency: string, status: string}>}
 */
export async function createProviderOrder({ amountPaise, orderId, notes = {} }) {
  if (!env.razorpay.enabled) {
    throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).');
  }
  if (!Number.isInteger(amountPaise) || amountPaise < 100) {
    // Razorpay's minimum is ₹1.00. A non-integer here means paise/rupees got
    // mixed up somewhere upstream, which is worth failing loudly over.
    throw new Error(`Invalid amount for Razorpay: ${amountPaise} (must be an integer ≥ 100 paise)`);
  }

  const response = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amountPaise, // already paise — see note 3 above
      currency: 'INR',
      receipt: receiptFor(orderId),
      // Notes come back on the webhook, which is how a webhook arriving with
      // no browser callback still finds its order.
      notes: { electroniaOrderId: String(orderId), ...notes },
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const description = payload?.error?.description ?? `HTTP ${response.status}`;
    logger.error({ status: response.status, err: description }, 'Razorpay order creation failed');
    throw new Error(`Razorpay rejected the order: ${description}`);
  }

  return payload;
}

/**
 * Reads a payment back from Razorpay. Used to confirm a browser callback
 * against the provider rather than trusting the browser's word for the amount
 * — a valid signature proves the ids were not tampered with, not that the
 * amount charged is the amount owed.
 */
export async function fetchPayment(paymentId) {
  const response = await fetch(`${API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.description ?? `Could not read payment ${paymentId}`);
  }
  return payload;
}

/** What the browser needs to open Checkout. No secret is in here. */
export function checkoutOptions({ providerOrder, order, customer }) {
  return {
    key: env.razorpay.keyId,
    amount: providerOrder.amount,
    currency: providerOrder.currency,
    name: 'ElectrOnia',
    description: `Order ${String(order._id).slice(-8).toUpperCase()}`,
    order_id: providerOrder.id,
    prefill: {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      contact: customer?.phone ?? '',
    },
    notes: { electroniaOrderId: String(order._id) },
    theme: { color: '#2D2BF5' },
  };
}

/**
 * Which webhook events this app acts on. Everything else is acknowledged with
 * a 200 and ignored — returning an error for an event you simply do not handle
 * makes Razorpay retry it forever.
 */
export const HANDLED_EVENTS = new Set(['payment.captured', 'payment.failed', 'order.paid']);
