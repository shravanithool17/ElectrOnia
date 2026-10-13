# ElectrOnia

A multi-vendor electronics marketplace. Customers buy, vendors list and fulfil,
admins moderate — one Express API, MongoDB, and a React storefront.

> **Status:** active development. The commerce core (catalogue, cart, orders,
> vendor portal, and Razorpay payments with idempotent HMAC-verified webhooks)
> works end to end, backed by 340+ automated Jest tests. Post-order returns and the
> dedicated admin moderation console are on the roadmap — see [`docs/roadmap.md`](docs/roadmap.md).

---

## Contents

- [Stack](#stack)
- [Running it locally](#running-it-locally)
- [Architecture at a glance](#architecture-at-a-glance)
- [API](#api)
- [Testing](#testing)
- [Security](#security)
- [Documentation](#documentation)
- [Deliberately out of scope for v1](#deliberately-out-of-scope-for-v1)

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| API | Node.js 20, Express 5 | Async error handling built in; modular monolith architecture |
| Data | MongoDB 8 via Mongoose, Atlas | Flexible product/variant shapes; replica set gives transactions |
| Auth | JWT access tokens + bcrypt | Stateless verification; role claims drive RBAC |
| Payments | Razorpay SDK & Webhooks | Idempotent HMAC-SHA256 verified webhooks; raw body retention |
| Storefront | React 19, Vite 7, React Router 7, Tailwind 4 | Fast dev loop, no SSR requirement yet |
| Testing | Jest 29, Supertest, mongodb-memory-server | 340+ unit & integration tests; in-memory replica set for transactions |
| Email | Nodemailer | OTP delivery; falls back to console in development |

## Running it locally

**Prerequisites:** Node 20+, a MongoDB connection string (Atlas free tier is fine).

```bash
# 1. API
cd backend
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # → JWT_SECRET
# paste your MongoDB connection string into MONGO_URI
npm install
npm run dev                     # http://localhost:3000

# 2. Storefront (separate terminal)
cd forentend
echo "VITE_API_URL=http://localhost:3000" > .env
npm install
npm run dev                     # http://localhost:5173

# 3. Automated Tests
cd backend
npm test                        # runs all 340+ Jest tests in-band
npm run test:unit               # runs unit test suite only
npm run test:integration        # runs integration test suite with in-memory replica set
```

The catalogue seeds itself on first boot if the products collection is empty.
Re-seed at any time with `npm run seed`.

**With no SMTP credentials configured, verification codes are printed to the API
console** instead of being emailed, so signup works offline.

Health check: `GET http://localhost:3000/health`

## Architecture at a glance

Three surfaces, one API, one database. The API is a **modular monolith**: a
single deployable with hard internal boundaries, so a module can be extracted
into a service later without a rewrite. See
[ADR 0001](docs/adr/0001-modular-monolith.md).

```
React storefront ─┐
Vendor portal   ─┼─→  Express API  ─→  MongoDB Atlas
Admin console   ─┘         │
                           ├─→  Nodemailer (OTP)
                           └─→  Razorpay (Checkout & Webhooks)
```

Four decisions shape the data model more than anything else:

| Decision | In short | ADR |
|---|---|---|
| Order / Fulfillment split | An order is one commercial event; a fulfillment is one vendor's package, and owns the status machine | [0002](docs/adr/0002-order-fulfillment-split.md) |
| Money as integer paise | Never floats — commission maths must reconcile exactly | [0003](docs/adr/0003-money-as-integer-paise.md) |
| Append-only vendor ledger | Balance is the sum of entries, never a mutable column | [0004](docs/adr/0004-append-only-ledger.md) |
| Webhook-first payments | The provider webhook is the source of truth; the browser callback is a convenience | [0005](docs/adr/0005-webhook-idempotency.md) |

Full target design, schemas and diagrams: [`docs/architecture.md`](docs/architecture.md).

## API

50+ endpoints across 10 domain modules under `/api/v1` (with backward-compatible legacy routes). Conventions, the full endpoint map and the error shape are in [`docs/api.md`](docs/api.md).

| Module | Base Path | Key Capabilities |
|---|---|---|
| **Auth & Identity** | `/api/v1/auth` | Customer & vendor registration/login, bcrypt-hashed single-use OTPs, password reset, session info |
| **Catalog** | `/api/v1/products` | Paginated product browsing, search, dynamic facets, vendor-scoped CRUD, related items |
| **Cart** | `/api/v1/cart` | Guest cart cookies, authenticated sync, price-change notices, coupon validation, guest cart merge |
| **Addresses** | `/api/v1/addresses` | Customer shipping address book with default selection |
| **Checkout** | `/api/v1/checkout` | Real-time quote preview, server-side pricing, atomic stock reservation & rollback |
| **Orders** | `/api/v1/orders` | Customer order history, vendor-scoped orders with multi-vendor line filtering |
| **Fulfillment** | `/api/v1/orders/:id/*` | Vendor package lifecycle (`ship`, `out-for-delivery`, `deliver`, `cancel-package`, customer cancellation) |
| **Payments** | `/api/v1/payments` | Razorpay order intent creation, client signature confirmation, idempotent HMAC-verified webhook |
| **Vendor** | `/api/v1/vendor` | Vendor analytics and metrics dashboard |
| **Operations & Media** | `/health`, `/ready`, `/media/products` | Liveness/readiness probes, zero-CDN procedural SVG product media generation |

Key endpoint samples:

```
POST   /api/v1/checkout/place-order          # Customer — atomic stock reservation & order placement
POST   /api/v1/payments/razorpay/intent      # Customer — initiates Razorpay payment order
POST   /api/v1/payments/razorpay/confirm     # Customer — verifies checkout signature
POST   /api/v1/payments/razorpay/webhook     # Public — HMAC-SHA256 verified, raw-body, idempotent event ingestion
POST   /api/v1/orders/:id/ship               # Vendor/Admin — marks a vendor's fulfillment package shipped
POST   /api/v1/cart/merge                    # Customer — merges guest cart on login
GET    /api/v1/products/facets               # Public — dynamic aggregate facets
```

## Testing

ElectrOnia includes a comprehensive test suite of **341 Jest tests** across **17 test suites** (unit and integration), verifying core commerce invariants:

- **Unit tests (Jest):** Money maths (integer paise calculations), coupon rules, server-side pricing calculations, OTP delivery/expiry, token authentication, and SVG art generation.
- **Integration tests (Jest + Supertest + mongodb-memory-server):** Tests run against an in-memory MongoDB replica set to validate transactional operations — atomic stock reservations, race conditions on low-inventory items, multi-vendor order placement, guest-to-customer cart merge, and payment lifecycle with duplicate webhook replays.

```bash
cd backend
npm test
```

## Security

Role-based access control with three roles (`customer`, `vendor`, `admin`).
Every token carries a `role` claim; `requireRole()` gates routes, and ownership
is enforced inside the query filter so another vendor's record returns 404
rather than 403.

Implemented: bcrypt password hashing, bcrypt-hashed single-use OTPs with a
5-minute expiry and attempt limit, rate limiting on auth and OTP routes,
server-side order pricing, atomic stock reservation with rollback, CORS
allowlist, constant-time HMAC signature verification (`crypto.timingSafeEqual`),
and boot-time environment validation that refuses to start without a real JWT secret.

**A full account of what was fixed and why — plus what is still open — is in
[`backend/SECURITY.md`](backend/SECURITY.md).** Worth reading before touching
the auth or order code.

## Documentation

| Document | What's in it |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Target architecture, data model, module boundaries, scalability, monitoring |
| [`docs/api.md`](docs/api.md) | API conventions, endpoint map, error codes, state machine |
| [`docs/roadmap.md`](docs/roadmap.md) | Phased build plan with scope boundaries |
| [`docs/testing.md`](docs/testing.md) | Test strategy and the ten tests that matter most |
| [`docs/adr/`](docs/adr/) | Architecture decision records |
| [`backend/SECURITY.md`](backend/SECURITY.md) | Security review: findings, fixes, open items |

## Deliberately out of scope for v1

Listed here as decisions, not omissions. Each is a real feature that was
considered and deferred, with the reason:

| Not building yet | Why |
|---|---|
| SMS phone verification | Per-message cost, and email verification already establishes identity |
| Stripe alongside Razorpay | One provider proves the integration pattern; a second is copy-paste |
| Personalised recommendations | Requires behavioural data the platform does not yet have. Category and co-purchase recommendations cover the need without it |
| Wallet, loyalty points | No retention problem to solve at current scale |
| Bulk CSV product import | Vendors have tens of products, not thousands |
| Warehouse and support-agent roles | No operational volume to justify separate roles; admin covers it |
| Separate admin application | Admin becomes a route section of the vendor app — three near-identical React apps triples maintenance for no benefit |
| Microservices | Would add distributed failure modes and zero capacity benefit at this traffic. The module boundaries make extraction possible later |

---

## Licence

ISC
