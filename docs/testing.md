# ElectrOnia — testing strategy

Not "80% coverage". Coverage percentage is a vanity metric; the money paths
either have tests or they do not.

## The pyramid

| Layer | Tooling | Covers | Target |
|---|---|---|---|
| Unit | Jest | Pure logic: money maths, coupon rules, tax, state-machine guards, commission split | ~150 fast tests |
| Integration | Jest + Supertest + mongodb-memory-server | Route → service → real DB. Auth, RBAC, checkout, payments, inventory | ~80 tests — the real safety net |
| Contract | zod schemas in `packages/shared` | API and web validate against one schema, so drift is a type error | every endpoint |
| E2E | Playwright | Five journeys: browse→buy, vendor lists→sells, return→refund, auth recovery, admin approves vendor | 5 specs |
| Load | k6 | Catalogue at 200 rps; 50 concurrent checkouts on one low-stock item | 2 scripts + a report |

## The ten tests to write first

Each one encodes a bug that has already existed in this codebase.

1. Placing an order with a tampered `totalAmount` charges the database price.
2. Two concurrent orders for the last unit: exactly one succeeds, the other gets
   409, and `onHand` never goes negative.
3. A failed order insert after reservation releases the reserved stock.
4. A customer token on `POST /v1/vendor/products` returns 403.
5. Vendor A cannot read, update or delete vendor B's product — 404, not 403.
6. `GET /v1/vendor/fulfillments` returns only the caller's own lines.
7. The same Razorpay webhook delivered twice captures once and creates one
   ledger entry.
8. A webhook with a bad signature is rejected 400 and changes nothing.
9. An invalid state transition (`placed → delivered`) returns 409.
10. A per-user single-use coupon used concurrently in two checkouts applies once.

## The one that matters most

```js
// tests/integration/checkout.test.js
it('charges the database price, not the price in the request body', async () => {
  const product = await factories.product({ price: 249900 });   // ₹2,499
  const { token } = await factories.customer();

  const res = await request(app)
    .post('/api/v1/checkout/place-order')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', randomUUID())
    .send({
      items: [{ variantId: product.variantId, qty: 1, unitPrice: 100 }], // ₹1 — tampered
      addressId: address._id,
    })
    .expect(201);

  expect(res.body.order.amounts.grandTotal).toBe(249900);
});
```

## Conventions

- **`server.js` exports the app without calling `listen()`** so Supertest can
  import it. Without that split, integration tests fight over the port in CI.
- **`mongodb-memory-server` as a replica set of one**, so transactions work in
  tests exactly as they do in production.
- **Factories, not fixtures.** `factories.product({ price })` with sensible
  defaults beats a large JSON fixture nobody dares change.
- **One assertion of intent per test.** A test named
  `rejects a customer token on vendor routes` should fail for exactly one reason.
- **No shared state between tests.** Truncate collections in `afterEach`; a test
  that passes only in order is worse than no test.
