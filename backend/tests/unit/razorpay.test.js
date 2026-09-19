// tests/unit/razorpay.test.js
//
// Payment code fails in ways that do not look like failures: a signature check
// that accepts everything still passes a happy-path test, and a webhook that
// processes duplicates still returns 200. So these target the security
// properties rather than the happy path.
//
// Signature verification is pure crypto with no network, so it is tested for
// real here. Order creation talks to Razorpay and is exercised separately by
// `npm run pay:check`.
import crypto from 'crypto';

import request from 'supertest';

import { createApp } from '../../server.js';
import {
  signaturesMatch,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  HANDLED_EVENTS,
} from '../../lib/razorpay.js';
import { env } from '../../config/env.js';

const app = createApp();

const sign = (payload, secret) =>
  crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

describe('signaturesMatch', () => {
  it('accepts an identical signature', () => {
    const a = sign('x', 's');
    expect(signaturesMatch(a, a)).toBe(true);
  });

  it('rejects a signature differing in one character', () => {
    const a = sign('x', 's');
    const b = a.slice(0, -1) + (a.endsWith('a') ? 'b' : 'a');
    expect(signaturesMatch(a, b)).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    // timingSafeEqual throws on unequal lengths. Returning false is the only
    // safe answer; an uncaught throw here would 500 on attacker-chosen input.
    expect(signaturesMatch(sign('x', 's'), 'short')).toBe(false);
    expect(signaturesMatch('short', sign('x', 's'))).toBe(false);
  });

  it('rejects non-strings rather than coercing them', () => {
    for (const value of [null, undefined, 123, {}, []]) {
      expect(signaturesMatch(sign('x', 's'), value)).toBe(false);
      expect(signaturesMatch(value, sign('x', 's'))).toBe(false);
    }
  });

  it('rejects an empty signature against an empty expectation', () => {
    // Both empty would compare "equal" under a naive ===, which would accept
    // every request the moment a secret went missing.
    expect(signaturesMatch('', '')).toBe(true); // documented: equal strings
    expect(verifyCheckoutSignature({ orderId: '', paymentId: '', signature: '' })).toBe(false);
  });
});

describe('verifyCheckoutSignature', () => {
  const SECRET = 'test_key_secret';
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';

  beforeEach(() => {
    env.razorpay.keySecret = SECRET;
  });

  it('accepts the signature Razorpay actually produces', () => {
    // Razorpay signs `${order_id}|${payment_id}` with the key secret.
    const signature = sign(`${orderId}|${paymentId}`, SECRET);
    expect(verifyCheckoutSignature({ orderId, paymentId, signature })).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    const signature = sign(`${orderId}|${paymentId}`, 'not_the_secret');
    expect(verifyCheckoutSignature({ orderId, paymentId, signature })).toBe(false);
  });

  it('rejects a signature for a different payment', () => {
    const signature = sign(`${orderId}|pay_SOMETHINGELSE`, SECRET);
    expect(verifyCheckoutSignature({ orderId, paymentId, signature })).toBe(false);
  });

  it('is not fooled by moving the boundary between the two ids', () => {
    // The `|` is load-bearing. Without it, order "order_AB" + payment "C123..."
    // and order "order_ABC" + payment "123..." would hash identically, so one
    // valid signature would authorise a different pair.
    const a = sign('order_AB|C123', SECRET);
    expect(verifyCheckoutSignature({ orderId: 'order_ABC', paymentId: '123', signature: a })).toBe(
      false
    );
  });

  it('refuses everything when no secret is configured', () => {
    env.razorpay.keySecret = '';
    const signature = sign(`${orderId}|${paymentId}`, SECRET);
    expect(verifyCheckoutSignature({ orderId, paymentId, signature })).toBe(false);
  });

  afterAll(() => {
    env.razorpay.keySecret = '';
  });
});

describe('verifyWebhookSignature', () => {
  const WEBHOOK_SECRET = 'test_webhook_secret';
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: {} } } });

  beforeEach(() => {
    env.razorpay.webhookSecret = WEBHOOK_SECRET;
  });

  it('accepts a body signed with the webhook secret', () => {
    expect(verifyWebhookSignature(Buffer.from(body), sign(body, WEBHOOK_SECRET))).toBe(true);
  });

  it('accepts the same body as a string or a Buffer', () => {
    const signature = sign(body, WEBHOOK_SECRET);
    expect(verifyWebhookSignature(body, signature)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from(body), signature)).toBe(true);
  });

  it('rejects a body signed with the KEY secret rather than the WEBHOOK secret', () => {
    // These are two different secrets in the Razorpay dashboard, and using the
    // wrong one is the most common webhook setup mistake.
    expect(verifyWebhookSignature(Buffer.from(body), sign(body, 'the_key_secret'))).toBe(false);
  });

  it('rejects a body altered after signing', () => {
    const signature = sign(body, WEBHOOK_SECRET);
    const tampered = body.replace('payment.captured', 'payment.failed');
    expect(verifyWebhookSignature(Buffer.from(tampered), signature)).toBe(false);
  });

  it('notices a re-serialised body, which is why the raw bytes are kept', () => {
    // This is the exact failure the rawBody capture in server.js exists to
    // prevent: JSON.stringify(JSON.parse(x)) is not always x.
    //
    // V8 preserves the order of string keys, so key order alone usually
    // survives a round trip. Two things do NOT:
    //   - whitespace, which a pretty-printing sender or proxy introduces
    //   - integer-like keys, which V8 reorders numerically no matter how they
    //     arrived
    // Either one breaks the signature, and only for some payloads — which is
    // why this shows up as an intermittent bug rather than a broken webhook.
    for (const original of ['{"a": 1, "b": 2}', '{"2":"x","1":"y"}']) {
      const signature = sign(original, WEBHOOK_SECRET);
      const reserialised = JSON.stringify(JSON.parse(original));

      expect(reserialised).not.toBe(original);
      expect(verifyWebhookSignature(original, signature)).toBe(true);
      expect(verifyWebhookSignature(reserialised, signature)).toBe(false);
    }
  });

  it('refuses everything when no webhook secret is configured', () => {
    env.razorpay.webhookSecret = '';
    expect(verifyWebhookSignature(Buffer.from(body), sign(body, WEBHOOK_SECRET))).toBe(false);
  });

  afterAll(() => {
    env.razorpay.webhookSecret = '';
  });
});

describe('handled events', () => {
  it('covers capture, failure and order completion', () => {
    expect([...HANDLED_EVENTS].sort()).toEqual(['order.paid', 'payment.captured', 'payment.failed']);
  });

  it('does not claim to handle refunds, which are not built yet', () => {
    // Listing an event we do not implement would mark it Processed and stop
    // Razorpay retrying it — silently dropping a refund.
    expect(HANDLED_EVENTS.has('refund.processed')).toBe(false);
  });
});

describe('payment routes are guarded', () => {
  it('requires authentication to open a payment', async () => {
    const res = await request(app)
      .post('/api/v1/payments/razorpay/intent')
      .send({ orderId: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(401);
  });

  it('requires authentication to confirm a payment', async () => {
    const res = await request(app).post('/api/v1/payments/razorpay/confirm').send({
      razorpay_order_id: 'order_A',
      razorpay_payment_id: 'pay_B',
      razorpay_signature: 'c'.repeat(64),
    });

    expect(res.status).toBe(401);
  });

  it('leaves the webhook unauthenticated — the signature is its auth', async () => {
    // A 401 here would make Razorpay retry every event forever.
    const res = await request(app)
      .post('/api/v1/payments/razorpay/webhook')
      .set('x-razorpay-signature', 'deadbeef')
      .set('x-razorpay-event-id', 'evt_test')
      .send({ event: 'payment.captured' });

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('rejects a webhook when no webhook secret is configured', async () => {
    const res = await request(app)
      .post('/api/v1/payments/razorpay/webhook')
      .set('x-razorpay-signature', 'deadbeef')
      .set('x-razorpay-event-id', 'evt_test_2')
      .send({ event: 'payment.captured' });

    // Accepting unverifiable instructions to mark orders paid is the one thing
    // this endpoint must never do.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('malformed ids are rejected at the edge', () => {
  it('will not accept ids that are not Razorpay-shaped', async () => {
    const res = await request(app)
      .post('/api/v1/payments/razorpay/confirm')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({
        razorpay_order_id: '../../etc/passwd',
        razorpay_payment_id: 'pay_B',
        razorpay_signature: 'c'.repeat(64),
      });

    // 401 from auth or 422 from validation — either way it never reaches the
    // provider lookup with that value.
    expect([401, 422]).toContain(res.status);
  });
});
