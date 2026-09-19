# ElectrOnia — API reference

Conventions, the target endpoint map, error codes and the fulfillment state
machine.

Markers: **[built]** exists today · **[next]** current phase · **[planned]** roadmap.

---

## Conventions

**Versioned prefix.** `/api/v1/...`. Routes today are unversioned and
inconsistent (`/logincustomer` alongside `/api/products`); the v1 migration
happens in Phase 0, while there are no external consumers.

**Resource nouns, plural, nested one level at most.**
`/api/v1/orders/:id/fulfillments` — never `/getOrdersByVendor`.

**Every list is paginated** and returns the same envelope. Offset paging for
admin tables that need page numbers; **cursor paging** for the customer
catalogue, because `skip(20000)` makes Mongo walk 20,000 documents.

**Idempotency.** Any mutating request may carry an `Idempotency-Key` header;
checkout and payment routes must. The same key with the same body inside 24 h
replays the stored response rather than acting twice.

**One error shape, always.**

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 2 units of MacBook Pro 16\" are available.",
    "details": { "variantId": "...", "requested": 5, "available": 2 }
  },
  "requestId": "01JH2Z..."
}
```

`code` is a stable machine string safe to branch on; `message` is for humans
and may change wording at any time.

**List envelope.**

```json
{
  "items": [],
  "page": { "cursor": "eyJpZCI6...", "hasMore": true, "limit": 24, "total": 1284 },
  "facets": { "brand": [{ "value": "Apple", "count": 42 }] }
}
```

### Status codes

| Code | Used for |
|---|---|
| 200 / 201 | Success; 201 on resource creation |
| 400 | Malformed request — bad ObjectId, unparseable body, bad signature |
| 401 | No token, expired token, invalid token |
| 403 | Authenticated but the role is not permitted |
| 404 | Not found **or not yours** — never confirm existence to someone not entitled to see it |
| 409 | State conflict — insufficient stock, invalid transition, duplicate |
| 422 | Validation failure, with field paths in `details` |
| 429 | Rate limited |
| 500 | Unhandled — message suppressed in production |

**404 rather than 403 for another vendor's resource** is deliberate: a 403
confirms the record exists, which is itself a leak.

---

## Endpoints today **[built]**

Base: `http://localhost:3000`

### Auth

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/send-otp` | public | Rate limited 5 / 15 min |
| POST | `/sendvendorotp` | public | Rate limited 5 / 15 min |
| POST | `/verify-otp` | public | 5 attempts, then the code is destroyed |
| POST | `/signupcustomer` | public | Requires a verified code; consumes it |
| POST | `/logincustomer` | public | Rate limited 10 / 15 min |
| GET | `/profile` | customer | |
| POST | `/signupvendor` | public | Requires a verified code |
| POST | `/loginvendor` | public | Rate limited 10 / 15 min |

### Products

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/products` | public | `search, category, brand, minPrice, maxPrice, sort, featured, page, limit` → `{ items, page, limit, total, totalPages }` |
| GET | `/api/products/mine` | vendor | Own listings only. Declared before `/:id` so "mine" is not parsed as an id |
| GET | `/api/products/:id` | public | |
| POST | `/api/products` | vendor | `companyId` comes from the token, never the body |
| PATCH | `/api/products/:id` | vendor | Owner only; allow-listed fields; `companyId` not updatable |
| DELETE | `/api/products/:id` | vendor | Owner only — ownership is the query filter |

### Orders

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/api/orders` | customer | Total computed server-side; `totalAmount` in the body is ignored; stock reserved atomically |
| GET | `/api/orders/my-orders` | customer | |
| GET | `/api/orders/vendor-orders` | vendor | Scoped by `vendorIds`; items filtered to the caller's own lines |
| PATCH | `/api/orders/:id/status` | vendor, admin | Vendor limited to orders containing their products; appends to `statusHistory` |

### Operations

| Method | Path | Role |
|---|---|---|
| GET | `/health` | public |

**Authentication:** `Authorization: Bearer <token>`. Every token carries a
`role` claim. Tokens issued before roles existed are rejected with
`code: "LEGACY_TOKEN"` and require a fresh login.

---

## Target endpoint map

Roles: **P** public · **C** customer · **V** vendor · **A** admin.

### Auth & identity

| Endpoint | Purpose | Role | Status |
|---|---|---|---|
| `POST /v1/auth/register` | Create account, send verification email | P | next |
| `POST /v1/auth/verify-email` | Consume emailed token | P | next |
| `POST /v1/auth/login` | Access token + httpOnly refresh cookie | P | next |
| `POST /v1/auth/refresh` | Rotate refresh token | P | next |
| `POST /v1/auth/logout` | Revoke this session | C V A | next |
| `POST /v1/auth/logout-all` | Revoke every session | C V A | next |
| `POST /v1/auth/forgot-password` | Email a single-use reset token | P | next |
| `POST /v1/auth/reset-password` | Consume token, revoke all sessions | P | next |
| `POST /v1/auth/change-password` | Requires the current password | C V A | next |
| `GET /v1/auth/oauth/:provider` | Start Google/GitHub flow (PKCE) | P | planned |
| `GET /v1/auth/oauth/:provider/callback` | Exchange code, link or create | P | planned |
| `GET /v1/me` | Profile + permissions | C V A | next |
| `PATCH /v1/me` | Edit name, avatar, phone | C V A | next |
| `GET\|POST /v1/me/addresses` | Address book | C | next |
| `PATCH\|DELETE /v1/me/addresses/:id` | Edit, soft-delete, set default | C | next |

### Catalogue & discovery

| Endpoint | Purpose | Role | Status |
|---|---|---|---|
| `GET /v1/categories/tree` | Nav tree, heavily cached | P | planned |
| `GET /v1/products` | Filters, sort, facets, cursor | P | built* |
| `GET /v1/products/:slug` | Detail + variants + availability | P | built* |
| `GET /v1/products/:id/related` | Related / similar | P | planned |
| `GET /v1/products/:id/bought-together` | Co-purchase recommendations | P | planned |
| `GET /v1/search` | Atlas Search with facets | P | planned |
| `GET /v1/search/suggest` | Autocomplete, ≤ 50 ms | P | planned |
| `GET /v1/search/trending` | Top queries, cached 10 min | P | planned |
| `GET\|POST /v1/products/:id/reviews` | Read / write; write needs a delivered item | P / C | planned |
| `GET\|POST\|DELETE /v1/wishlist` | Server-synced wishlist | C | planned |
| `GET /v1/compare?ids=` | Normalised spec comparison | P | planned |

<sub>* exists at the unversioned path, by id rather than slug</sub>

### Cart & checkout

| Endpoint | Purpose | Role | Status |
|---|---|---|---|
| `GET /v1/cart` | Cart, re-priced, with change notices | C P | next |
| `POST /v1/cart/items` | Add — validated against available stock | C P | next |
| `PATCH\|DELETE /v1/cart/items/:variantId` | Change qty, remove | C P | next |
| `POST /v1/cart/merge` | Fold a guest cart in on login | C | next |
| `POST\|DELETE /v1/cart/coupon` | Apply / remove a coupon | C | planned |
| `POST /v1/checkout/quote` | Priced, taxed, split preview — no writes | C | next |
| `POST /v1/checkout/place-order` | Reserve stock, create order + payment intent | C | next |
| `POST /v1/payments/:id/verify` | Verify the client-side payment signature | C | next |
| `POST /v1/webhooks/razorpay` | Signed, idempotent, raw body | P† | next |
| `GET /v1/payments/:id` | Payment status for the polling UI | C | next |

<sub>† public by route, authenticated by HMAC signature rather than a token</sub>

### Orders & returns

| Endpoint | Purpose | Role | Status |
|---|---|---|---|
| `GET /v1/orders` | Order history | C | built* |
| `GET /v1/orders/:id` | Order + fulfillments + timeline | C | next |
| `GET /v1/orders/:id/invoice` | GST invoice PDF | C | planned |
| `POST /v1/orders/:id/reorder` | Refill the cart from a past order | C | planned |
| `POST /v1/orders/:id/cancel` | Pre-shipment only | C | next |
| `POST /v1/returns` | Open a return inside the window | C | planned |
| `GET /v1/returns/:id` | Return status timeline | C V A | planned |

### Vendor

| Endpoint | Purpose | Role | Status |
|---|---|---|---|
| `POST /v1/vendor/apply` | Submit KYC: GSTIN, PAN, documents | C | planned |
| `GET /v1/vendor/dashboard` | Revenue, orders, top products | V | planned |
| `GET\|POST /v1/vendor/products` | Own listings | V | built* |
| `PATCH\|DELETE /v1/vendor/products/:id` | Ownership enforced in the filter | V | built* |
| `POST /v1/vendor/products/bulk` | CSV upload → async job + report | V | out of scope v1 |
| `GET\|PATCH /v1/vendor/inventory` | Per variant per warehouse | V | next |
| `GET /v1/vendor/fulfillments` | The shipping queue | V | next |
| `PATCH /v1/vendor/fulfillments/:id/status` | State machine transition | V | next |
| `GET /v1/vendor/ledger` | Earnings and commission entries | V | planned |
| `POST /v1/vendor/payouts` | Request a payout | V | planned |

### Admin

| Endpoint | Purpose | Role | Status |
|---|---|---|---|
| `GET /v1/admin/metrics` | GMV, users, vendors, AOV | A | planned |
| `GET /v1/admin/users` | Search, filter, suspend | A | planned |
| `POST /v1/admin/vendors/:id/approve` | Approve or reject KYC | A | planned |
| `POST /v1/admin/products/:id/moderate` | Approve, reject, feature | A | planned |
| `POST /v1/admin/orders/:id/refund` | Full or partial refund | A | planned |
| `CRUD /v1/admin/coupons` | Coupon lifecycle | A | planned |
| `CRUD /v1/admin/banners` | Homepage CMS | A | planned |
| `GET /v1/admin/audit-logs` | Who did what, when | A | planned |

### AI

| Endpoint | Purpose | Role | Status |
|---|---|---|---|
| `POST /v1/ai/search` | Natural language → structured filters | P | planned |
| `POST /v1/ai/assistant` | Shopping assistant, read-only tools | P C | planned |
| `GET /v1/products/:id/review-summary` | Cached AI review digest | P | planned |

---

## Fulfillment state machine

Status lives on the **fulfillment**, never on the order
([ADR 0002](adr/0002-order-fulfillment-split.md)).

```
                 ┌─────────┐
                 │ placed  │
                 └────┬────┘
        ┌─────────────┼──────────────┐
        ▼             ▼              │
  ┌───────────┐  ┌──────────┐        │
  │ confirmed │  │cancelled │◄───────┘
  └─────┬─────┘  └────┬─────┘
        ▼             ▼
  ┌──────────┐   ┌──────────┐
  │  packed  │   │ refunded │
  └────┬─────┘   └──────────┘
       ▼
  ┌──────────┐      ┌──────────┐
  │ shipped  │◄────►│ out_for_ │
  └──────────┘      │ delivery │
                    └────┬─────┘
                         ▼
                   ┌───────────┐     ┌──────────┐     ┌──────────┐
                   │ delivered │────►│ returned │────►│ refunded │
                   └───────────┘     └──────────┘     └──────────┘
```

Transitions are **data, not `if` statements** — one table drives validation, the
vendor UI's available actions, and the tests.

```js
// modules/orders/fulfillment.states.js
export const TRANSITIONS = {
  placed:           { confirmed: ['vendor','admin'],
                      cancelled: ['customer','vendor','admin','system'] },
  confirmed:        { packed: ['vendor','warehouse'],
                      cancelled: ['vendor','admin'] },
  packed:           { shipped: ['vendor','warehouse'] },
  shipped:          { out_for_delivery: ['vendor','system'] },
  out_for_delivery: { delivered: ['vendor','system'],
                      shipped: ['vendor','system'] },     // reattempt
  delivered:        { returned: ['admin','support'] },
  returned:         { refunded: ['admin'] },
  cancelled:        { refunded: ['admin','system'] },
  refunded:         {},
};

export function assertTransition(from, to, role) {
  const allowedRoles = TRANSITIONS[from]?.[to];
  if (!allowedRoles) {
    throw new ConflictError('INVALID_TRANSITION', `${from} → ${to} is not allowed`);
  }
  if (!allowedRoles.includes(role)) {
    throw new ForbiddenError('ROLE_CANNOT_TRANSITION');
  }
}
```

Payment status is tracked **separately** on the order (`pending` → `authorized`
→ `paid` → `partially_refunded` / `refunded` / `failed`). A paid order can hold
an unshipped fulfillment, and an unpaid COD order can be delivered — collapsing
the two into one field cannot express either.

---

## Error codes

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 422 | Schema validation failed; `details` lists field paths |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password — identical for both, so accounts cannot be enumerated |
| `LEGACY_TOKEN` | 401 | Token predates role claims; log in again |
| `TOKEN_EXPIRED` | 401 | Access token expired; refresh |
| `ACCOUNT_LOCKED` | 429 | Too many failed logins |
| `OTP_INVALID` | 400 | Wrong code; remaining attempts in the message |
| `OTP_EXPIRED` | 400 | Past its 5-minute window |
| `EMAIL_NOT_VERIFIED` | 403 | Signup attempted without a verified code |
| `ROLE_REQUIRED` | 403 | Authenticated but the wrong role |
| `INSUFFICIENT_STOCK` | 409 | Requested quantity exceeds available |
| `INVALID_TRANSITION` | 409 | Not a legal state-machine edge |
| `DUPLICATE_REQUEST` | 200 | Idempotency key replay — the original response is returned |
| `BAD_SIGNATURE` | 400 | Webhook or payment signature verification failed |
| `COUPON_INVALID` | 422 | Expired, over its limit, or not applicable to the cart |
| `RATE_LIMITED` | 429 | Too many requests |
