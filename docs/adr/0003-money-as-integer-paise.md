# ADR 0003 — Store money as integer paise

**Status:** Accepted · 2026-09-15

## Context

Prices and totals are currently `Number` fields holding rupees — `2499`,
sometimes `2499.50`. JavaScript numbers are IEEE-754 doubles, where
`0.1 + 0.2 === 0.30000000000000004`.

A marketplace multiplies money constantly: line totals, percentage discounts,
GST at 18%, commission at 8%, partial refunds. Each operation can introduce a
fractional error, and those errors compound. Vendor payouts are the sum of
thousands of commission calculations — if they do not reconcile exactly against
what customers paid, someone is owed money and nobody can prove how much.

## Decision

**All monetary values are integers, in paise** (1 rupee = 100 paise).
`₹2,499.00` is stored as `249900`.

- Every money field in every schema: `unitPrice`, `lineTotal`, `grandTotal`,
  `commissionAmount`, `vendorEarning`, `amount` on payments, refunds and ledger
  entries.
- Arithmetic happens only through `lib/money.js`, which owns the rounding rules.
- Rounding is applied **once per line**, at a defined point, with `Math.round`
  (half-up) — not wherever a calculation happens to land.
- Formatting to `₹2,499.00` happens at the edge: the API response DTO or the
  React component. Nothing downstream of storage rounds.
- `currency: 'INR'` is stored alongside, so a future second currency is a data
  change rather than a schema change.

## Consequences

**Accepted:**
- All money arithmetic is exact. `249900 * 3` is exactly `749700`.
- Sums reconcile: the ledger total always equals the sum of its entries.
- Provider integration is simpler, not harder — Razorpay and Stripe both take
  amounts in the minor unit already, so no conversion at the boundary.

**Costs:**
- Every read path must divide by 100 for display. Centralised in one formatter,
  and a `formatINR()` helper in the frontend.
- A migration is required for existing documents and the seed data. Doing it now
  while the data is disposable is the entire reason this ADR is dated today.
- A raw database query returns `249900`, which looks alarming until you know the
  convention. Hence this document.

## Alternatives rejected

- **`Decimal128`.** Mongo supports it and it is exact, but it arrives in
  JavaScript as an object needing conversion for every operation, and the
  ecosystem (Razorpay SDK, JSON responses) expects numbers. More friction for no
  additional correctness over integers.
- **A decimal library (`decimal.js`, `big.js`).** Correct, but every arithmetic
  site becomes a method call, and the values still have to serialise to
  something. Integers give the same guarantee with no dependency.
- **Floats plus rounding at the end.** This is the status quo, and the reason
  it fails is that "the end" is not one place — it is every line, every tax
  calculation and every commission split.
