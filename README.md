# ElectrOnia

A multi-vendor electronics marketplace. Customers buy, vendors list and fulfil,
admins moderate — one Express API, MongoDB, and a React storefront.

> **Status:** active development. The commerce core (catalogue, cart, orders,
> vendor portal) works end to end. Payments, returns and the admin console are
> on the roadmap — see [`docs/roadmap.md`](docs/roadmap.md).

---

## Contents

- [Stack](#stack)
- [Running it locally](#running-it-locally)
- [Architecture at a glance](#architecture-at-a-glance)
- [API](#api)
- [Security](#security)
- [Documentation](#documentation)
- [Deliberately out of scope for v1](#deliberately-out-of-scope-for-v1)

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| API | Node.js 20, Express 5 | Async error handling built in; familiar middleware model |
| Data | MongoDB 8 via Mongoose, Atlas | Flexible product/variant shapes; replica set gives transactions |
| Auth | JWT access tokens + bcrypt | Stateless verification; role claims drive RBAC |
| Storefront | React 19, Vite 7, React Router 7, Tailwind 4 | Fast dev loop, no SSR requirement yet |
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
                           └─→  Nodemailer (OTP)
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

19 endpoints today. Conventions, the full endpoint map and the error shape are
in [`docs/api.md`](docs/api.md).

```
GET    /api/products              # filter, sort, paginate → { items, page, total, totalPages }
GET    /api/products/:id
GET    /api/products/mine         # vendor's own listings
POST   /api/products              # vendor
PATCH  /api/products/:id          # vendor, owner only
DELETE /api/products/:id          # vendor, owner only
POST   /api/orders                # customer — total computed server-side
GET    /api/orders/my-orders      # customer
GET    /api/orders/vendor-orders  # vendor — scoped to their own lines
PATCH  /api/orders/:id/status     # vendor or admin
```

## Security

Role-based access control with three roles (`customer`, `vendor`, `admin`).
Every token carries a `role` claim; `requireRole()` gates routes, and ownership
is enforced inside the query filter so another vendor's record returns 404
rather than 403.

Implemented: bcrypt password hashing, bcrypt-hashed single-use OTPs with a
5-minute expiry and attempt limit, rate limiting on auth and OTP routes,
server-side order pricing, atomic stock reservation with rollback, CORS
allowlist, and boot-time environment validation that refuses to start without a
real JWT secret.

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
