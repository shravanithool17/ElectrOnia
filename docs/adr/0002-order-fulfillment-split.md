# ADR 0002 — Split Order from Fulfillment

**Status:** Accepted · 2026-09-15

## Context

The current `Order` document has a single `status` field with values
`Pending | Processing | Shipped | Delivered | Cancelled`.

ElectrOnia is a **multi-vendor** marketplace. One checkout can contain items
from several vendors, shipped from different warehouses, on different days. The
moment that happens, a single status field has no correct value: vendor A has
shipped, vendor B has not. Whatever you display is wrong for one of them.

Related problems the single field cannot express:
- Two tracking numbers for one order.
- A partial cancellation — one vendor out of stock, the rest proceeding.
- A partial return of one vendor's item.
- Vendor A seeing only their own portion of an order.

## Decision

Split the concept in two.

**`Order`** — the customer's commercial event. What they bought, what they paid,
one invoice, one payment, one shipping address snapshot. It carries
`paymentStatus`, and a `derivedStatus` rolled up from its fulfillments **for
display only**.

**`Fulfillment`** — one vendor's shippable package out of that order, one per
`(order, vendor, warehouse)`. It owns:
- `status` and the full `statusHistory`
- `carrier`, `trackingNumber`, `trackingUrl`
- `shippedAt`, `deliveredAt`, `expectedDeliveryAt`

`order_items` carry a `fulfillmentId`, so every line knows which package it
travels in.

Transitions live in a **data table**, not `if` statements, so one definition
drives validation, the vendor UI's available actions, and the tests:

```js
TRANSITIONS = {
  placed:    { confirmed: ['vendor','admin'], cancelled: [...] },
  confirmed: { packed: ['vendor','warehouse'], cancelled: [...] },
  ...
}
```

Payment status stays **separate** from fulfillment status. A paid order can
hold an unshipped package; a COD order can be delivered while unpaid. One field
cannot express either.

## Consequences

**Accepted:**
- The UI can show "Package 1 of 2 — shipped, arriving Thursday" per vendor,
  which is what every real marketplace does.
- Vendor queries are one indexed lookup on `{ vendorId, status, createdAt }`.
- Partial cancellation, partial return and partial refund all become natural
  rather than special cases.

**Costs:**
- One more collection and a join for the customer's order page — mitigated by a
  single `$in` query on `fulfillments` by `orderId`.
- `derivedStatus` is denormalised and must be recomputed on every fulfillment
  transition. It is display-only; no logic may branch on it.
- Migration work: existing orders need one fulfillment each, carrying the
  current status.

## Alternatives rejected

- **Keep one status, add `vendorStatuses: { [vendorId]: status }`.** A map
  cannot be indexed, cannot hold per-vendor tracking numbers, and cannot carry
  per-vendor history.
- **One order per vendor at checkout.** Simple, but the customer then gets three
  order numbers and three invoices for one purchase, and a single payment cannot
  cleanly span them.
