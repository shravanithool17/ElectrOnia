# Phase 0 — what changed and what you have to do

The backend was restructured. Behaviour is the same where it matters, but the
internals moved and money changed units, so this is the short list of what to
run and what to expect.

See `docs/roadmap.md` for why Phase 0 came before any new feature.

---

## Run these, in order

```bash
cd backend
npm install                 # new: zod, pino, helmet, compression, jest, supertest…
npm run migrate:paise -- --dry   # look at what the migration will do
npm run migrate:paise            # convert existing rupee amounts to paise
npm run test:unit                # 26 tests, no database needed — should pass
npm run dev
```

Then the frontend:

```bash
cd forentend
npm run dev
```

**Everyone has to log in again.** Nothing about tokens changed in this phase,
but if you were still holding a token from before roles existed it is rejected
with `LEGACY_TOKEN`. Clear `token` and `vendorToken` from localStorage if a
stale session sticks.

---

## The money change is the one that can bite

All monetary values are now **integer paise**. ₹2,499.00 is stored as
`249900` — see `docs/adr/0003-money-as-integer-paise.md` for why.

- `npm run migrate:paise` multiplies existing product and order amounts by 100.
  It is idempotent: it records itself in a `migrations` collection, so running
  it twice does nothing the second time.
- The API returns both `price` (paise) and `priceLabel` (`"₹2,499.00"`). The
  frontend prefers the label and falls back to `formatINR()`.
- The vendor product form still collects rupees, because that is what a person
  types; `toPaise()` converts at submit.
- **If you skip the migration**, existing products will display as ₹24.99
  instead of ₹2,499.00. That is the symptom to recognise.

---

## New structure

```
backend/
├─ server.js            builds the app, no listen()  ← what Supertest imports
├─ index.js             listen() + graceful shutdown only
├─ config/              env (validated at boot), logger (pino), db
├─ middleware/          requestId, sanitize, validate, auth, rateLimiters,
│                       errorHandler
├─ lib/                 errors, money, pagination, otpStore, seed, asyncHandler
├─ modules/
│  ├─ auth/             routes · controller · service · repo · schema
│  ├─ catalog/          + dto
│  ├─ orders/           + dto
│  └─ health/
├─ routes/index.js      mounts /api/v1 and the legacy paths
├─ scripts/             migrate-money-to-paise.js
├─ tests/
│  ├─ unit/             26 tests, no database
│  └─ integration/      needs MongoDB (downloaded on first run)
├─ Dockerfile
└─ index.legacy.js      the original 600-line file, kept for diffing
```

The layering rule: **controllers never touch the database, services never
touch `req` or `res`.** That is what makes a service callable from a worker or
a script, and unit-testable without HTTP.

---

## API versioning

Everything now lives under `/api/v1`. The old paths still work — they are
mounted onto the same routers, so there is no duplicated logic:

| Legacy | v1 |
|---|---|
| `POST /logincustomer` | `POST /api/v1/auth/customers/login` |
| `POST /signupcustomer` | `POST /api/v1/auth/customers/register` |
| `POST /send-otp` | `POST /api/v1/auth/send-otp` |
| `POST /sendvendorotp` | `POST /api/v1/auth/vendor/send-otp` |
| `GET /profile` | `GET /api/v1/auth/me` |
| `GET /api/products` | `GET /api/v1/products` |
| `GET /api/orders/my-orders` | `GET /api/v1/orders/mine` |
| `GET /api/orders/vendor-orders` | `GET /api/v1/orders/vendor` |

Migrate the frontend to `/v1` when convenient, then delete the legacy block in
`routes/index.js`. Until then both are live.

---

## Behaviour that is deliberately stricter

These are not regressions. Each one used to fail silently.

| Now | Before |
|---|---|
| `422` with field-level detail on bad input | manual `if` checks, inconsistent messages |
| `?sort=cheapest` → `422` | silently ignored, returned newest |
| `GET /products/not-an-id` → `422` | `500` cast error |
| `PATCH` with an empty body → `422` | silent no-op, `200` |
| A price with decimals → `422` | accepted, stored as a float |
| Every response carries `requestId` | nothing to correlate a log with |
| One error shape everywhere | `{message}` sometimes, `{error}` others |

---

## Docker

```bash
docker compose up
```

Brings up Mongo (as a single-member replica set, so transactions work), Redis
(unused until Phase 1, wired up now so the seam exists), and the API.

---

## Still open after Phase 0

Phase 1, in `docs/roadmap.md`: the Order/Fulfillment split, server-side cart,
variants and inventory, transactional checkout, Razorpay with idempotent
webhooks, Redis-backed OTP storage, refresh-token rotation.

Also unresolved: `admin/admin1` still does not compile — it imports
`./page/adminsignup`, and `src/page/` is empty. Build it or delete it.
