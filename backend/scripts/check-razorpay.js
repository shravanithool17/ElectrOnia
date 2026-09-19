// scripts/check-razorpay.js — prove the Razorpay credentials work.
//
//   npm run pay:check
//
// Creates a real order for ₹1 against whichever keys are in .env, then checks
// that a signature built the way Razorpay builds one verifies. No money moves:
// creating an order is free, and nothing is captured.
//
// WHY THIS EXISTS
//
// The alternative is debugging keys through the checkout UI, which means
// building a cart and an address every attempt, and where "Razorpay isn't
// opening" could be the keys, the amount, the order, or the frontend script.
// This isolates the one question: do these credentials talk to Razorpay.
import crypto from 'crypto';

import { env } from '../config/env.js';
import { createProviderOrder, verifyCheckoutSignature } from '../lib/razorpay.js';

const mask = (value) => (value ? `${value.slice(0, 12)}…` : '(empty)');

console.log('\nRazorpay configuration');
console.log(`  key id:         ${mask(env.razorpay.keyId)}`);
console.log(`  key secret:     ${env.razorpay.keySecret ? 'set' : '(empty)'}`);
console.log(`  webhook secret: ${env.razorpay.webhookSecret ? 'set' : '(empty)'}`);
console.log(`  mode:           ${env.razorpay.keyId.startsWith('rzp_test') ? 'TEST' : 'LIVE'}\n`);

if (!env.razorpay.enabled) {
  console.error(
    '❌ RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not both set in backend/.env.\n' +
      '   Dashboard → Settings → API Keys → Generate Test Key.\n'
  );
  process.exit(1);
}

if (!env.razorpay.keyId.startsWith('rzp_test')) {
  console.error(
    '⚠️  These look like LIVE keys. This script creates a real order against them.\n' +
      '   Use test keys (rzp_test_…) while developing.\n'
  );
  process.exit(1);
}

// ---------------------------------------------------------------- 1. create
let providerOrder;
try {
  providerOrder = await createProviderOrder({
    amountPaise: 100, // ₹1.00 — Razorpay's minimum
    orderId: '000000000000000000000000',
    notes: { source: 'pay:check' },
  });
  console.log('✅ Order created against Razorpay');
  console.log(`   id:       ${providerOrder.id}`);
  console.log(`   amount:   ${providerOrder.amount} paise (₹${providerOrder.amount / 100})`);
  console.log(`   currency: ${providerOrder.currency}`);
  console.log(`   status:   ${providerOrder.status}\n`);
} catch (err) {
  console.error(`❌ Razorpay rejected the request: ${err.message}\n`);
  console.error(
    '   "Authentication failed" means the key id and key secret do not match,\n' +
      '   or one of them has a stray space or quote in .env.\n'
  );
  process.exit(1);
}

// ------------------------------------------------------- 2. verify signature
// Builds a signature exactly as Razorpay does after a successful payment, and
// runs it through the app's own verifier. If this fails, no real payment would
// ever be accepted either.
const fakePaymentId = 'pay_TESTSIGNATURE0001';
const signature = crypto
  .createHmac('sha256', env.razorpay.keySecret)
  .update(`${providerOrder.id}|${fakePaymentId}`, 'utf8')
  .digest('hex');

const accepted = verifyCheckoutSignature({
  orderId: providerOrder.id,
  paymentId: fakePaymentId,
  signature,
});

const rejectedTampered = !verifyCheckoutSignature({
  orderId: providerOrder.id,
  paymentId: 'pay_SOMETHINGELSE',
  signature,
});

console.log(`${accepted ? '✅' : '❌'} A correctly-signed callback is accepted`);
console.log(`${rejectedTampered ? '✅' : '❌'} A tampered callback is rejected\n`);

if (!env.razorpay.webhookSecret) {
  console.log(
    '⚠️  RAZORPAY_WEBHOOK_SECRET is not set, so webhooks will be REJECTED.\n' +
      '   Payments still work through the browser callback, but the webhook is\n' +
      '   the source of truth — without it, a customer who closes the tab mid-\n' +
      '   payment leaves an order stuck in PendingPayment.\n\n' +
      '   Dashboard → Settings → Webhooks → Add New Webhook\n' +
      '     URL:    <your public API>/api/v1/payments/razorpay/webhook\n' +
      '     Events: payment.captured, payment.failed, order.paid\n' +
      '     Secret: choose one, and put it in .env as RAZORPAY_WEBHOOK_SECRET\n\n' +
      '   Locally, expose the API with a tunnel (ngrok, cloudflared) and use\n' +
      '   that URL — Razorpay cannot reach localhost.\n'
  );
}

process.exit(accepted && rejectedTampered ? 0 : 1);
