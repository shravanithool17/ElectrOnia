# ADR 0005 — Webhooks are the source of truth for payments

**Status:** Accepted · 2026-09-15

## Context

A card, UPI, net-banking or wallet payment completes in two places at once:

1. The **browser callback** — the payment modal calls back into the page with a
   signature the server can verify. Fast, but it only happens if the customer
   stays on the page. They may close the tab, lose signal, or have the browser
   killed by the OS the instant after paying.
2. The **provider webhook** — Razorpay POSTs `payment.captured` to the server.
   Reliable, but delivered **at least once**, meaning duplicates, and it may
   arrive before, after, or simultaneously with the browser callback.

If only the callback confirms the order, a customer who closes the tab pays and
gets nothing. If both confirm without coordination, the order is confirmed
twice, the vendor is credited twice, and two confirmation emails go out.

## Decision

**The webhook is the source of truth. The browser callback is a UX
optimisation.** Both call the same idempotent function.

```
confirmPayment(providerPaymentId)     ← one implementation, two entry points
```

Five mechanisms make this safe:

1. **Signature verification over the raw body.** HMAC-SHA256 with the webhook
   secret, compared with `crypto.timingSafeEqual`. The raw body parser is
   mounted **on the webhook route only, before `express.json()`** — if the body
   has been parsed and re-serialised, the HMAC can never match. This is the most
   common integration bug in the ecosystem.

2. **Idempotency by insert, not by read-then-write.** Insert into
   `webhook_events` with a unique index on `(provider, providerEventId)`. A
   duplicate throws `E11000`, which is caught and answered `200 duplicate`.
   Checking "does this event exist?" first has a race; letting the index reject
   it does not.

3. **Acknowledge fast, process in a worker.** The route does one indexed insert
   and one queue push, then returns 200. Providers time out in seconds, and
   confirmation touches five collections.

4. **Re-fetch from the provider API** rather than trusting the payload, then run
   one transaction: update the payment, set `paymentStatus: 'paid'`, transition
   each fulfillment `placed → confirmed`, convert reserved stock to committed,
   insert ledger entries, write the outbox event for the email. The function
   returns early if the payment is already `captured`, so it is re-entrant.

5. **A nightly reconciliation job** lists the provider's payments for the
   previous day and compares them against local records — which is what catches
   a webhook that never arrived at all.

Supporting rules:

- **Always return 200, including for events you ignore.** A non-2xx makes the
  provider retry an event you deliberately skipped.
- Stock is reserved when the order is created, before payment, with a 15-minute
  hold. A worker releases the reservation and cancels the order if payment never
  completes.
- Reject payloads older than 5 minutes, bounding replay in addition to the
  uniqueness check.
- The client never sends the amount. It receives a `providerOrderId` and an
  amount it can display but cannot influence.

## Consequences

**Accepted:**
- A customer who closes the tab after paying still gets their order.
- Duplicate delivery is a no-op, enforced by a database constraint.
- The race between the two paths is safe because both funnel into one
  re-entrant function.
- "What happens when the webhook arrives twice?" has a concrete answer — which
  is, not incidentally, the most common payments interview question.

**Costs:**
- The customer may briefly see "confirming your payment" while the webhook is
  processed. The UI polls `GET /payments/:id` for ~20 s, then falls back to
  "you will get an email" — it must **never** report failure because a poll
  timed out.
- Two extra collections (`payments`, `webhook_events`) and a worker.
- The raw-body middleware ordering is subtle and easy to break later. It is
  commented in the code and tested.

## Alternatives rejected

- **Callback only.** Loses orders whenever a customer closes the tab. Not viable.
- **Webhook only.** Correct but the confirmation page would always show a
  pending state, which reads as a failed payment to the customer.
- **Application-level duplicate check** (`findOne` then `create`). Races under
  concurrent delivery; the unique index does not.
- **Trusting the webhook payload** instead of re-fetching. A payload is an
  assertion by a request; the provider API is the authority.
