# ADR 0004 — Append-only ledger for vendor earnings

**Status:** Accepted · 2026-09-15

## Context

Vendors earn money when their items sell, minus platform commission, and are
paid out periodically. Refunds reverse earnings. Returns reverse them after the
fact. Payouts have to be defensible: a vendor who disputes a figure needs an
answer, and "the number in the database says so" is not one.

The obvious design is `vendor.balance`, incremented on each sale and decremented
on each payout. The problem is that when it is wrong — and it will be, through a
crash between two writes, a double-processed webhook, or a bug in commission
maths — there is no way to reconstruct how it got there, and no way to know
which figure was right.

## Decision

**A vendor's balance is never stored. It is the sum of `ledger_entries`.**

```js
ledger_entries {
  vendorId,
  type: 'sale'|'commission'|'refund'|'reversal'|'payout'|'adjustment',
  refType, refId,        // what caused this entry
  amount,                // signed: credit positive, debit negative
  balanceAfter,          // running total, for auditing not for reading
  availableAt,           // delivery + return window = when it becomes payable
  createdAt
}
```

Rules:

1. **Append-only.** Never `UPDATE`, never `DELETE`. A mistake is corrected by
   writing a reversing entry, so the error and its correction are both visible.
2. **`{ refType: 1, refId: 1 }` is unique.** One entry per source event, so a
   replayed webhook or a retried job cannot credit twice. The database enforces
   it; application logic does not have to be trusted.
3. **`availableAt` gates payouts.** Earnings become payable only after delivery
   plus the return window, so a refunded order is never paid out.
4. **A payout references the exact entry ids it settles** (`payouts.entryIds`),
   so every payout can be expanded into the lines that made it up.
5. **A nightly reconciliation job** recomputes each vendor's payable balance
   from the ledger and compares it to what the last payout run assumed, alerting
   on drift.

## Consequences

**Accepted:**
- Any figure is explainable: "show me every rupee in this payout" is a query.
- Double-crediting is structurally impossible, not merely unlikely.
- The audit trail is the data model, so no separate audit mechanism is needed
  for money.
- This is how real payment systems work, which makes the design explainable to
  anyone who has seen one.

**Costs:**
- Reading a balance is an aggregation rather than a field read. Mitigated by an
  index on `{ vendorId, availableAt, type }` and, if it ever matters, a cached
  snapshot that is always recomputable from the entries.
- More rows: one or two per order item rather than one counter per vendor.
  Cheap, and they are never updated.
- Developers must resist the urge to add a `balance` column "just for the
  dashboard". The dashboard reads the aggregation.

## Alternatives rejected

- **`vendor.balance` counter.** Unauditable, and it is the design this ADR
  exists to prevent.
- **Recompute earnings from orders on demand.** Works until commission rates
  change, or an order is partially refunded, or an adjustment is made outside
  the order flow. The ledger records what was *decided*, not what can be
  re-derived from current data.
