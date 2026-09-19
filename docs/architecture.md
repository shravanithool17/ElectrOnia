# ElectrOnia — architecture

Target architecture for the platform, the data model behind it, and the
reasoning. Written to be the document a new contributor reads first.

Status markers: **[built]** exists today · **[next]** in the current phase ·
**[planned]** on the roadmap.

---

## 1. System context

Three client surfaces, one API, a small set of stateful dependencies.

```
┌─────────────────┐  ┌───────────────┐  ┌────────────────┐
│ Customer web    │  │ Vendor portal │  │ Admin console  │
│ React 19 + Vite │  │ React 19      │  │ (route section │
└────────┬────────┘  └───────┬───────┘  │  of vendor app)│
         │                   │          └───────┬────────┘
         └───────────────────┼──────────────────┘
                             ▼
              ┌──────────────────────────────┐
              │  Reverse proxy — TLS, gzip   │
              └──────────────┬───────────────┘
                             ▼
   ┌─────────────────────────────────────────────────────┐
   │  ElectrOnia API — modular monolith (Express 5)      │
   │                                                     │
   │  helmet · cors · auth · RBAC · validate · ratelimit │
   │  ┌──────┬──────┬──────────┬────────┬──────────────┐ │
   │  │catalog│ cart │ checkout │ orders │  payments   │ │
   │  ├──────┼──────┼──────────┼────────┼──────────────┤ │
   │  │inventory│ vendors │ reviews │ returns │ admin  │ │
   │  └──────┴──────┴──────────┴────────┴──────────────┘ │
   └───────┬──────────────┬───────────────┬──────────────┘
           ▼              ▼               ▼
   ┌───────────────┐ ┌──────────┐ ┌────────────────┐
   │ MongoDB Atlas │ │  Redis   │ │  Cloudinary    │
   │ replica set   │ │ cache ·  │ │  images, KYC   │
   │               │ │ queues   │ │  documents     │
   └───────────────┘ └────┬─────┘ └────────────────┘
                          ▼
              ┌───────────────────────────┐
              │  Workers (same image,     │
              │  different entrypoint)    │
              │  email · invoices ·       │
              │  search index · payouts   │
              └───────────────────────────┘
```

### Why each dependency exists

| Component | Job | What breaks without it |
|---|---|---|
| MongoDB Atlas **[built]** | System of record | — |
| Redis **[next]** | Catalogue cache, BullMQ queues, OTP store, distributed rate limits | OTPs held in process memory die on restart and cannot work across more than one instance — a real defect today |
| Workers **[next]** | Anything slow or retryable | Sending email inside the request holds a customer's checkout open on an SMTP round trip |
| Atlas Search **[planned]** | Fuzzy matching, autocomplete, faceting | A Mongo text index cannot do typo tolerance or suggestions |
| Cloudinary **[planned]** | Image and document storage, on-the-fly resizing | The single API instance spends its capacity serving image bytes |
| Outbox collection **[planned]** | Records the intent to send inside the business transaction | An order is placed but its confirmation email is silently lost on a crash |

**Modular monolith, not microservices.** One deployable, hard module
boundaries. See [ADR 0001](adr/0001-modular-monolith.md).

---

## 2. Request lifecycle

Order matters. Rate limiting precedes body parsing so a flood of large bodies is
cheap to reject; authentication precedes validation so error messages never leak
schema shape to anonymous callers.

```
request
  → requestId        assign/propagate X-Request-Id, bind to the log context
  → helmet           security headers
  → cors             origin allowlist from env
  → ipRateLimit      coarse, per IP, before anything expensive
  → bodyParser       json, 1mb cap
  → mongoSanitize    strip $ and . from keys
  → authenticate     verify access token → req.user { id, role, sessionId }
  → authorize(...)   RBAC per route
  → routeRateLimit   fine-grained, per user per route
  → validate(schema) zod on params, query, body; 422 on failure
  → controller       HTTP only: parse the request, call a service, shape a response
  → service          business rules, transactions, invariants
  → repository       Mongoose queries — the only layer that knows about Mongo
  → errorHandler     typed errors → status codes, log, report
```

### The layering rule

**Controllers never touch the database. Services never touch `req` or `res`.**

A service is a plain function of its arguments, which is what lets it be
unit-tested without HTTP and reused from a worker or a CLI script. The current
`index.js` mixes all four layers in every handler; unwinding that is Phase 0 of
the roadmap.

---

## 3. Module boundaries

Modules communicate through exported service functions — never by importing
another module's repository or Mongoose model. Where a module needs to react
rather than ask, it subscribes to a domain event.

| Module | Owns | Emits | Listens for |
|---|---|---|---|
| `catalog` | products, variants, categories, brands, reviews | `product.published` | `order.delivered` → allow review |
| `inventory` | stock per variant per warehouse, reservations | `stock.low` | `order.placed`, `order.cancelled` |
| `cart` | server-side carts, price snapshots | — | `product.priceChanged` |
| `checkout` | the place-order transaction, coupon application | `order.placed` | `payment.captured` |
| `orders` | orders, fulfillments, status machine, returns | `fulfillment.shipped`, `order.delivered` | `payment.captured`, `payment.failed` |
| `payments` | payment intents, webhooks, refunds | `payment.captured`, `payment.refunded` | `order.cancelled` |
| `vendors` | vendor accounts, KYC, payouts, ledger | `vendor.approved` | `order.delivered` → accrue earnings |
| `notifications` | email and in-app delivery | — | every event above |

---

## 4. Data model

### 4.1 Relationships

```
User ─┬─< Address
      ├─o Cart
      ├─< Order ─┬─< OrderItem >─┬─ Fulfillment >─ Vendor
      │          ├─o Payment ─< Refund
      │          └─o Coupon
      ├─< Review
      └─< WishlistItem

Vendor ─┬─< Product ─< Variant ─< Inventory >─ Warehouse
        ├─< LedgerEntry
        └─< Payout

Category ─< Category (self, via ancestors[])
Category ─< Product
OrderItem ─o ReturnRequest
```

### 4.2 Collections

Money is **integer paise** throughout ([ADR 0003](adr/0003-money-as-integer-paise.md)).

#### users · addresses

```js
users {
  _id, email (unique, lowercase), passwordHash,
  name, phone, phoneVerifiedAt, emailVerifiedAt,
  role: 'customer'|'vendor'|'admin',
  avatarUrl, status: 'active'|'suspended'|'deleted',
  failedLoginCount, lockedUntil,                    // account locking
  oauth: [{ provider, providerId, linkedAt }],
  createdAt, updatedAt
}
{ email: 1 } unique
{ role: 1, status: 1, createdAt: -1 }
{ 'oauth.provider': 1, 'oauth.providerId': 1 }

addresses {
  _id, userId, label, line1, line2, city, state, pincode,
  country: 'IN', phone, isDefault, deletedAt
}
{ userId: 1, isDefault: -1 }
```

Addresses are a separate collection rather than an array on the user, because an
order must **snapshot** the address it shipped to. As a live reference, editing
your address would rewrite where a past order went.

#### products · variants · categories

```js
products {
  _id, vendorId, slug (unique), title, description,
  brand, categoryId, categoryPath: [ObjectId],
  attributes: { ram: '16GB', screen: '15.6"' },   // faceted filtering
  images: [{ url, alt, position }],
  specifications: [{ group, key, value }],        // array, not Map
  ratingAvg, ratingCount,
  status: 'draft'|'pending_review'|'active'|'rejected'|'archived',
  moderation: { reviewedBy, reviewedAt, reason },
  priceFrom, priceTo,                             // denormalised from variants
  featured, publishedAt, createdAt, updatedAt
}
{ slug: 1 } unique
{ status: 1, categoryId: 1, priceFrom: 1 }        // the catalogue query
{ status: 1, featured: 1, publishedAt: -1 }       // homepage
{ vendorId: 1, status: 1, createdAt: -1 }         // vendor's own list
{ status: 1, brand: 1, priceFrom: 1 }

variants {
  _id, productId, vendorId, sku (unique),
  optionValues: { color, storage },
  price, mrp, currency: 'INR',
  weightGrams, dimensionsCm: { l, w, h },         // shipping inputs
  images: [String], status
}
{ sku: 1 } unique
{ productId: 1, status: 1 }

categories {
  _id, parentId, name, slug (unique),
  ancestors: [ObjectId], depth, position, iconUrl, isActive
}
{ slug: 1 } unique · { ancestors: 1 } · { parentId: 1, position: 1 }
```

Two corrections against the current model:

- **Price belongs on the variant.** A 256 GB and a 512 GB phone are one product
  at two prices. `priceFrom`/`priceTo` are denormalised onto the product so
  list-page sort and filter stay one indexed query.
- **`specifications: Map` cannot be indexed or filtered.** Use an array of
  `{group, key, value}` for display and a flat `attributes` object for the few
  fields actually faceted on.

#### inventory · warehouses

```js
warehouses {
  _id, code (unique), name, address,
  servesPincodes: [String], isActive, priority
}

inventory {
  _id, variantId, warehouseId, vendorId,
  onHand,        // physically present
  reserved,      // committed to unshipped orders
  // available = onHand - reserved — computed, never stored
  reorderLevel, lastCountedAt, updatedAt
}
{ variantId: 1, warehouseId: 1 } unique
{ vendorId: 1, onHand: 1 }                        // low-stock alerts

stock_ledger {                                     // append-only
  _id, variantId, warehouseId, delta,
  reason: 'purchase'|'reservation'|'release'|'shipment'
         |'return'|'adjustment'|'damage',
  refType, refId, balanceAfter, actorId, createdAt
}
{ variantId: 1, createdAt: -1 } · { refType: 1, refId: 1 }
```

The `onHand`/`reserved` split lets the storefront say "only 2 left" honestly
while orders are in flight. The append-only ledger answers "why does this say 7
when I counted 9" — the first question a warehouse team asks.

#### carts

```js
carts {
  _id, userId (unique sparse), guestToken (unique sparse),
  items: [{ variantId, productId, vendorId, qty, priceSnapshot, snapshotAt }],
  couponCode, updatedAt, expiresAt
}
{ userId: 1 } unique sparse
{ guestToken: 1 } unique sparse
{ expiresAt: 1 } expireAfterSeconds: 0            // guest carts self-clean
```

`priceSnapshot` is **not** the price charged — checkout always re-reads the live
price. It exists so the cart can say *"this item's price changed from ₹2,399 to
₹2,499 since you added it"* instead of silently charging more. That is the
difference between a cart and a trustworthy cart.

#### orders · order_items · fulfillments

```js
orders {
  _id, orderNumber (unique, 'ELN-2026-0000123'),
  customerId,
  customerSnapshot: { name, email, phone },
  shippingAddressSnapshot, billingAddressSnapshot,
  currency: 'INR',
  amounts: { itemsSubtotal, discountTotal, shippingTotal, taxTotal, grandTotal },
  couponCode, couponSnapshot,
  paymentStatus: 'pending'|'authorized'|'paid'
                |'partially_refunded'|'refunded'|'failed',
  derivedStatus,        // rolled up from fulfillments, display only
  placedAt, createdAt, updatedAt
}
{ orderNumber: 1 } unique
{ customerId: 1, placedAt: -1 }
{ paymentStatus: 1, placedAt: -1 }

order_items {
  _id, orderId, fulfillmentId,
  productId, variantId, vendorId,
  titleSnapshot, skuSnapshot, imageSnapshot,
  unitPrice, qty, lineDiscount, lineTax, lineTotal,
  taxRatePct, hsnCode,                            // GST needs both
  commissionPct, commissionAmount, vendorEarning
}
{ orderId: 1 } · { vendorId: 1, createdAt: -1 } · { fulfillmentId: 1 }

fulfillments {              // one per vendor per warehouse per order
  _id, orderId, vendorId, warehouseId,
  status: 'placed'|'confirmed'|'packed'|'shipped'|'out_for_delivery'
         |'delivered'|'cancelled'|'returned'|'refunded',
  statusHistory: [{ status, at, byUserId, byRole, note }],
  carrier, trackingNumber, trackingUrl,
  shippedAt, deliveredAt, expectedDeliveryAt,
  cancellation: { reason, byRole, at }
}
{ orderId: 1 }
{ vendorId: 1, status: 1, createdAt: -1 }         // the vendor's queue
{ trackingNumber: 1 } sparse
{ status: 1, expectedDeliveryAt: 1 }              // SLA breach report
```

Line items snapshot title and price deliberately: if a vendor later edits the
product, a past order must still show what the customer actually bought.

See [ADR 0002](adr/0002-order-fulfillment-split.md) for why status lives on the
fulfillment.

#### payments · refunds · webhook_events

```js
payments {
  _id, orderId, provider: 'razorpay'|'stripe'|'cod',
  providerOrderId, providerPaymentId,
  method: 'card'|'upi'|'netbanking'|'wallet'|'cod',
  amount, currency, amountRefunded,
  status: 'created'|'authorized'|'captured'|'failed'|'refunded',
  failureReason, idempotencyKey (unique),
  capturedAt, rawProviderPayload, createdAt
}
{ orderId: 1 }
{ providerPaymentId: 1 } unique sparse
{ idempotencyKey: 1 } unique

webhook_events {                                   // the idempotency guard
  _id, provider, providerEventId (unique),
  type, signatureVerified, payload, processedAt,
  status: 'received'|'processed'|'failed'|'ignored',
  attempts, lastError
}
{ provider: 1, providerEventId: 1 } unique
```

The unique index on `providerEventId` **is** the duplicate-webhook defence.
Providers guarantee at-least-once delivery, so `payment.captured` will arrive
twice; without it you capture twice and pay the vendor twice.
See [ADR 0005](adr/0005-webhook-idempotency.md).

#### vendors · ledger · payouts

```js
vendors {
  _id, userId, legalName, displayName, slug (unique),
  gstin,                                          // 15 chars
  pan,                                            // 10 chars
  documents: [{ type, url, uploadedAt, verifiedAt, rejectionReason }],
  kycStatus: 'draft'|'submitted'|'under_review'|'approved'|'rejected',
  commissionPct,
  bankAccount: { holderName, accountLast4, ifsc, tokenRef },
  status: 'pending'|'active'|'suspended', rating,
  approvedBy, approvedAt, createdAt
}
{ slug: 1 } unique · { kycStatus: 1, createdAt: -1 } · { status: 1 }

ledger_entries {                    // append-only: never UPDATE, never DELETE
  _id, vendorId,
  type: 'sale'|'commission'|'refund'|'reversal'|'payout'|'adjustment',
  refType, refId,
  amount,                           // signed: credit +, debit −
  balanceAfter, availableAt,        // delivery + return window
  createdAt
}
{ vendorId: 1, createdAt: -1 }
{ vendorId: 1, availableAt: 1, type: 1 }
{ refType: 1, refId: 1 } unique     // one entry per source event

payouts {
  _id, vendorId, amount, periodStart, periodEnd, entryIds: [ObjectId],
  status: 'requested'|'approved'|'processing'|'paid'|'failed',
  utr, processedAt, notes
}
```

See [ADR 0004](adr/0004-append-only-ledger.md).

#### reviews · coupons · returns · audit · outbox

```js
reviews {
  _id, productId, variantId, userId,
  orderItemId,                                    // proves purchase
  rating: 1..5, title, body, images: [String],
  isVerifiedPurchase, status, helpfulCount, createdAt
}
{ productId: 1, status: 1, createdAt: -1 }
{ userId: 1, orderItemId: 1 } unique              // one review per purchase

coupons {
  _id, code (unique, uppercase),
  type: 'percent'|'fixed'|'free_shipping',
  value, maxDiscount, minOrderValue,
  appliesTo: { categoryIds, vendorIds, productIds },
  startsAt, endsAt, usageLimitTotal, usageLimitPerUser, usedCount,
  isActive, createdBy
}
{ code: 1 } unique · { isActive: 1, startsAt: 1, endsAt: 1 }

coupon_redemptions {                 // enforces per-user limits atomically
  _id, couponCode, userId, orderId, discountAmount, createdAt
}
{ couponCode: 1, userId: 1 } · { couponCode: 1, orderId: 1 } unique

return_requests {
  _id, orderId, orderItemIds, customerId, vendorId,
  reason: 'damaged'|'wrong_item'|'not_as_described'|'changed_mind'|'defective',
  description, images,
  status: 'requested'|'approved'|'rejected'|'pickup_scheduled'
         |'in_transit'|'received'|'refund_initiated'|'refunded',
  statusHistory, refundAmount, refundId, windowExpiresAt
}

audit_logs {
  _id, actorId, actorRole, action, targetType, targetId,
  before, after,                                  // redacted diff
  ip, userAgent, requestId, createdAt
}
{ actorId: 1, createdAt: -1 }
{ targetType: 1, targetId: 1, createdAt: -1 }

outbox_events {          // written in the same transaction as the business write
  _id, aggregateType, aggregateId, type, payload,
  status: 'pending'|'sent'|'failed', attempts, availableAt, sentAt
}
{ status: 1, availableAt: 1 }
```

---

## 5. Target folder structure

One repo, npm workspaces. The admin console becomes a route section of the
vendor app rather than a third Vite project.

```
electronia/
├─ package.json                  # workspaces: apps/*, packages/*
├─ docker-compose.yml            # api + worker + mongo (rs of 1) + redis
├─ .github/workflows/ci.yml
├─ packages/shared/              # zod schemas + types shared by api and web
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ server.js            # express app, no listen()  ← supertest imports this
│  │  │  ├─ index.js             # listen() only
│  │  │  ├─ worker.js            # BullMQ consumers
│  │  │  ├─ config/              # env, db, redis, logger
│  │  │  ├─ middleware/          # auth, rbac, validate, errorHandler,
│  │  │  │                       # requestId, idempotency, rateLimit
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/             # .routes .controller .service .repo .schema
│  │  │  │  ├─ catalog/  cart/  checkout/
│  │  │  │  ├─ orders/           # + fulfillment.states.js
│  │  │  │  ├─ payments/         # + providers/razorpay.js, webhooks.js
│  │  │  │  ├─ inventory/  vendors/  reviews/  returns/
│  │  │  │  └─ coupons/  search/  notifications/  admin/  ai/
│  │  │  ├─ models/  jobs/  lib/  scripts/
│  │  └─ tests/{integration,fixtures,setup.js}
│  └─ web/
│     └─ src/
│        ├─ app/                 # router, providers, layouts
│        ├─ features/            # catalog/ cart/ checkout/ orders/ vendor/ admin/
│        ├─ components/ui/  lib/  styles/
└─ docs/
```

Two details that matter more than they look:

- **`server.js` exports the app; `index.js` calls `listen()`.** Without the
  split, Supertest cannot import the app without binding a port, and integration
  tests fight each other in CI.
- **Feature-first, not type-first.** `modules/orders/*` rather than
  `controllers/`, `services/`, `models/`. One feature change touches one
  directory, and the module boundary is visible in the filesystem — which is
  what makes "this could be extracted into a service" a credible claim.

---

## 6. Security architecture

### Token strategy **[planned]**

```
Access token   JWT, 15 min, held in memory (never localStorage)
               claims: { sub, role, sessionId, jti, iat, exp }

Refresh token  opaque 32-byte random, 30 days
               cookie: httpOnly; Secure; SameSite=Lax; Path=/v1/auth
               stored server-side as a SHA-256 hash in Redis

Rotation       every refresh issues a new token and revokes the old one
Reuse          presenting an already-rotated token ⇒ family compromised
               ⇒ revoke every session in that family, alert the user
```

Today's design — a 7-day token in `localStorage` — means one XSS is a full
account takeover with no revocation path.

### Control checklist

| Control | Implementation | Status |
|---|---|---|
| Security headers | `helmet()` + explicit CSP | planned |
| CSRF | Double-submit token on cookie auth; `SameSite=Lax`; verify `Origin` | planned |
| XSS | React escapes by default; ban `dangerouslySetInnerHTML`; DOMPurify on vendor HTML | partial |
| NoSQL injection | `express-mongo-sanitize` + zod; never pass `req.body` into a query | planned |
| Input validation | zod per route, 422 with field paths, unknown keys stripped | planned |
| Mass assignment | Explicit allow-lists on update | **built** |
| Password policy | bcrypt cost 12, 8+ chars, breached-list check | partial |
| Account locking | 5 failures → 15 min, exponential after; per account and per IP | planned |
| OTP | bcrypt-hashed, 5 min TTL, 5 attempts, single-use | **built** |
| RBAC | `requireRole` + ownership in the query filter | **built** |
| Webhook auth | HMAC-SHA256 over the raw body, timing-safe compare, replay window | planned |
| Idempotency | `Idempotency-Key` on mutations; unique index on provider event ids | planned |
| Secrets | Env only, validated at boot, rotated on exposure | **built** |
| File uploads | Signed direct-to-Cloudinary, MIME sniffing, size caps, private KYC | planned |
| PII exposure | Field projections per role; vendors see only their own lines | **built** |
| Audit trail | Every admin and money action to `audit_logs` | planned |
| Dependency scanning | `npm audit` + Dependabot in CI | planned |

### Threat model

The four attacks that actually matter for a marketplace:

| Threat | Control | Status |
|---|---|---|
| Price tampering | Server-side pricing from the database | **built** |
| Vendor pivoting to another vendor's data | Ownership inside the query filter | **built** |
| Coupon abuse via concurrent redemption | Unique index on `couponCode + orderId`, atomic `$inc` under a cap | planned |
| Webhook forgery and replay | HMAC + unique event id + age window | planned |

Everything else on the checklist is hygiene. These four cost real money.

---

## 7. Deployment

| Environment | Runs on | Data | Purpose |
|---|---|---|---|
| local | docker-compose: api, worker, mongo (rs of 1), redis | seeded, disposable | development; replica set of one so transactions work locally |
| preview | Vercel + Render preview per PR | shared staging DB | review each PR as a running app |
| staging | production topology, smallest tier | anonymised copy | payment sandbox, migration rehearsal |
| production | web on Vercel; api + worker on Render; Atlas M10+ | real, backed up | live |

```
# CI — .github/workflows/ci.yml
lint          eslint + prettier --check
typecheck     tsc --noEmit  (packages/shared)
unit          jest — services and pure logic
integration   jest + supertest + mongodb-memory-server
e2e           playwright against a compose stack
security      npm audit --audit-level=high
build         docker build, tag with the commit sha
deploy        staging on merge to main; production on a release tag
migrate       run pending migrations BEFORE the new image takes traffic
```

Deployment rules that prevent 3am incidents:

- **Migrations are forward-only and backward-compatible for one release.** Add
  the field, deploy code that writes both, backfill, deploy code that reads the
  new field, then drop the old one. Four boring deploys beat one outage.
- **Never build an index on a live large collection in the foreground** — it
  locks the collection.
- **The worker is the same image with a different entrypoint.** One build, no
  drift between what the API and the worker believe about the models.

---

## 8. Scalability

> Current traffic is single-digit concurrent users. Everything here is worth
> designing for and almost none of it is worth building yet. Build the seams —
> a cache interface, a queue, stateless handlers — and leave the boxes empty.

### Reads

- **Cache-aside in Redis**: category tree (1 h), product detail (10 m), facet
  counts (5 m), trending searches (10 m). Invalidate by key on write; never wait
  for a TTL to correct a stale price.
- **Cursor pagination** everywhere customer-facing. `skip(20000)` walks 20,000
  documents; a cursor on `(publishedAt, _id)` is one index seek.
- **Denormalise deliberately**: `priceFrom`, `ratingAvg`, `categoryPath`,
  `vendorIds`. Each turns an aggregation into an indexed find — and each needs a
  backfill script written at the same time.
- **Projections** on every list query. The list page needs six fields, not the
  900-word description.
- **`secondaryPreferred`** read preference for catalogue and search; primary for
  anything in a checkout path.

### Writes

- **Multi-document transactions** for place-order: reserve inventory, insert
  order, insert fulfillments, write the outbox event — one atomic unit. Replaces
  the compensating-rollback code currently in `reserveStock()`.
- **Optimistic concurrency** on inventory: conditional `$inc` guarded by
  `{ reserved: { $lte: onHand - qty } }`. No locks, no lost updates.
- **Queues for everything slow**: email, invoices, search indexing, CSV imports,
  payout runs.
- **Outbox pattern** so a side effect is never lost.

### Capacity

| Scale | Needs | Does not need |
|---|---|---|
| < 100 rps | One API instance, Atlas M10, Redis, one worker | Sharding, read replicas for load, CQRS, brokers |
| ~1,000 rps | 3–5 stateless instances behind a load balancer, secondary reads, CDN, Atlas Search | Sharding, microservices |
| 10,000 rps+ | Shard by `customerId` hash, separate catalogue read model, regional replicas, Kafka event spine | — |

Because the API is stateless — no in-process session, OTP map or cache — going
from one instance to five is a config change. That property is the whole
scalability story at this stage, and the in-memory OTP store is the one thing
currently violating it.

---

## 9. Monitoring

- **Structured JSON logs** (pino). Every line carries `requestId`, `userId`,
  `route`, `durationMs`, `statusCode`. Redact `password`, `token`,
  `authorization`, `otp` and card fields **at the serialiser**, not by
  remembering at each call site.
- **Correlation.** One `X-Request-Id` flows request → service → queue job →
  worker log, so a failed email traces back to the checkout that triggered it.
- **Sentry** for exceptions, with release tagging and source maps.
- **RED metrics per route** — Rate, Errors, Duration at p50/p95/p99. Percentiles,
  never averages: an average hides the 2% of checkouts taking 8 seconds.
- **`/health` is liveness, `/ready` is readiness.** Conflating them makes a
  deploy route traffic to an instance with no database.

### Business-level alerts

| Alert | Condition | Why |
|---|---|---|
| Payment failure spike | > 10% over 15 min | Silent revenue loss while the API looks healthy |
| Webhook backlog | > 50 unprocessed, or age > 10 min | Paid orders stuck unconfirmed |
| Checkout error rate | 5xx > 1% | The only path where an error is directly money |
| Oversell detected | any `inventory.onHand < 0` | Proves a concurrency bug; should be impossible |
| Queue dead-letter | any job exhausts retries | A lost side effect a customer is waiting on |
| Ledger drift | sum(entries) ≠ expected payable | Reconciliation bug — catch it before a payout run |
| p95 latency | > 800 ms for 10 min | Usually a query that lost its index |

A nightly reconciliation job should recompute every vendor's payable balance
from the ledger and compare it against what the last payout run assumed.
Finding a discrepancy yourself at 2am beats a vendor finding it.

---

## Related documents

- [`api.md`](api.md) — conventions, endpoint map, state machine
- [`roadmap.md`](roadmap.md) — phased build plan
- [`testing.md`](testing.md) — test strategy
- [`adr/`](adr/) — decision records
- [`../backend/SECURITY.md`](../backend/SECURITY.md) — security review
