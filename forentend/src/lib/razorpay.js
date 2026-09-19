// src/lib/razorpay.js — loading and opening Razorpay Checkout.
//
// Razorpay ships a script that has to be on the page before `window.Razorpay`
// exists. Two ways to get it there:
//
//   - a <script> tag in index.html: every visitor downloads it, including the
//     ones who never reach checkout
//   - load it on demand, which is this
//
// The promise is cached, so ten clicks load one script.
//
// NOTHING SECRET IS IN HERE. The key id is public by design — it identifies
// the merchant so Checkout knows whose account to charge. The key secret never
// leaves the server, and the payment is only trusted after the server verifies
// the signature (and re-reads the amount from Razorpay).

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

let loader = null;

/** Resolves once window.Razorpay is available. Rejects if the script fails. */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => resolve(window.Razorpay));
    script.addEventListener('error', () => {
      // Let a later attempt retry rather than caching the failure forever —
      // this is usually a blocked request or a dropped connection, not a
      // permanent condition.
      loader = null;
      reject(new Error('Could not load Razorpay Checkout. Check your connection or ad blocker.'));
    });

    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return loader;
}

/**
 * Opens Checkout and resolves with what the browser was handed back.
 *
 * The resolved value is NOT proof of payment — it is three ids and a
 * signature that the SERVER verifies. Treating this resolution as success
 * would let anyone mark an order paid from the console.
 *
 * @param {object} options the `checkout` block the API returned
 * @returns {Promise<{razorpay_order_id, razorpay_payment_id, razorpay_signature}>}
 */
export function openCheckout(options) {
  return loadRazorpay().then(
    (Razorpay) =>
      new Promise((resolve, reject) => {
        // The most recent decline, if any. Kept rather than acted on — see
        // the payment.failed handler below.
        let lastFailure = null;

        const checkout = new Razorpay({
          ...options,
          handler: (response) => resolve(response),
          modal: {
            // Closing the window is the only way this ends without a payment.
            // If a card was declined before they gave up, say so; otherwise
            // it is a plain cancel, which the checkout page treats as normal.
            ondismiss: () =>
              reject(
                lastFailure
                  ? Object.assign(new Error(lastFailure), { cancelled: true, declined: true })
                  : Object.assign(new Error('Payment cancelled'), { cancelled: true })
              ),
            escape: true,
          },
        });

        // A declined card does NOT end the payment. Razorpay keeps the window
        // open so the customer can try another card or UPI — and that retry
        // can succeed.
        //
        // This used to reject() right here. The promise was then settled, so
        // when the retry succeeded, handler() called resolve() on it and was
        // silently ignored: the customer paid, and the server was never told.
        // With no webhook configured, that order then expired and its stock
        // was released — money taken, nothing shipped.
        checkout.on('payment.failed', (event) => {
          lastFailure =
            event?.error?.description ?? 'The payment was declined. No money has been taken.';
        });

        checkout.open();
      })
  );
}
