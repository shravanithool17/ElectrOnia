# ElectrOnia — roadmap

Sequenced so every phase ends with something demoable and nothing is built
twice. Estimates assume part-time work alongside coursework.

## Scope principle

The original scope was ~150 features. That is 18–24 months for a team of six,
and chasing it produces 150 features at 40% done. **Phases 0 and 1 are the
whole game**: five weeks, after which the commerce core is production-grade and
defensible under detailed questioning. Everything after that is additive.

---

## Phase 0 — Restructure before adding anything · 2 weeks

Adding features to a 600-line `index.js` makes the eventual refactor more
expensive every week. Pay this now, while the codebase is small.

- [ ] Split into `modules/<domain>/{routes,controller,service,repo,schema}`
- [ ] `server.js` exports the app; `index.js` only calls `listen()`
- [ ] zod validation on every route; typed error classes; one error handler
- [ ] pino structured logging with request-id correlation
- [ ] `/api/v1` prefix, consistent list envelope, cursor pagination
- [ ] Money → integer paise everywhere, with a `lib/money.js` helper; migrate seed data
- [ ] helmet, express-mongo-sanitize, compression
- [ ] Docker Compose: api + worker + mongo (replica set of 1) + redis
- [ ] Jest + Supertest wired up, with the first five tests from `testing.md`

**Done when:** every route goes controller → service → repo, `npm test` passes,
and `docker compose up` gives a working stack from a clean clone.

---

## Phase 1 — The commerce core, properly · 3 weeks

The phase that makes ElectrOnia a real project rather than a CRUD demo.

- [ ] **Order → Fulfillment split** with the state-machine table (ADR 0002)
- [ ] **Server-side cart** with price-change notices and stock validation
- [ ] **Product variants** + `inventory` keyed by variant × warehouse, with
      `onHand`/`reserved` and the append-only stock ledger
- [ ] **Transactional checkout**: reserve, create order, create fulfillments,
      write the outbox event — one atomic unit
- [ ] **Razorpay**: signature verification, idempotent webhooks, refunds (ADR 0005)
- [ ] Redis for caching, OTP storage and BullMQ; email moves to a worker
- [ ] Refresh-token rotation with reuse detection; tokens out of `localStorage`

**Done when:** a stranger can browse, buy with a test card, and watch the status
change as the vendor ships — and the ten tests in `testing.md` all pass.

---

## Phase 2 — Make it operable · 2–3 weeks

- [ ] Vendor KYC with document upload; admin approval queue; product moderation
- [ ] Ledger and commission accrual; payout requests; nightly reconciliation job
- [ ] Returns and refunds end to end, with the return window enforced
- [ ] Admin metrics, user and vendor management, audit logs
- [ ] GST invoice PDF generation in a worker
- [ ] Playwright: the five critical journeys. k6: 50 concurrent checkouts on one
      low-stock item

---

## Phase 3 — Discovery and growth · 2–3 weeks

- [ ] Atlas Search: fuzzy matching, autocomplete, faceting, search analytics
- [ ] Reviews with verified-purchase enforcement and image uploads
- [ ] Wishlist, compare, recently viewed
- [ ] Recommendations — "related" from category and attribute similarity,
      "bought together" from a nightly co-purchase aggregation. Plain data, no ML
- [ ] Coupons with atomic per-user limits; homepage CMS banners

---

## Phase 4 — The layers most projects never reach · 2–3 weeks

- [ ] Multi-warehouse allocation: pick the warehouse per line by pincode
      serviceability and stock
- [ ] Shipping rates from weight and dimensions; carrier tracking
- [ ] Google and GitHub OAuth with PKCE and account linking
- [ ] In-app notifications; email preference centre
- [ ] Frontend performance: route-level code splitting, virtualised product grid,
      responsive Cloudinary images, prefetch on hover

---

## Phase 5 — AI, last and deliberately · 1–2 weeks

Last because AI features are the easiest to fake and the most obvious when the
commerce underneath them is broken.

- [ ] **Natural-language search** — an LLM converts "gaming laptop under
      ₹80,000" into the existing filter query. Structured output validated by the
      same zod schema, then run through the normal search path. No vector
      database; degrades to keyword search when the model is unavailable
- [ ] **Review summaries** — generated once per product, cached on the document,
      regenerated when the review count moves 10%. Never per page view
- [ ] **Shopping assistant** — tool-calling over the existing API (search,
      compare, check stock), scoped to read-only tools. It never places an order

---

## Deliberately out of scope for v1

See the table in the root `README.md`. Each entry is a decision with a reason,
not an omission — a considered scope boundary is worth more than a long feature
list.
