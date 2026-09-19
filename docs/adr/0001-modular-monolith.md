# ADR 0001 — Modular monolith, not microservices

**Status:** Accepted · 2026-09-15

## Context

ElectrOnia has three surfaces (customer, vendor, admin) and eight or so domains
(catalogue, cart, checkout, orders, payments, inventory, vendors, admin).
"Production-grade marketplace" is often read as "microservices", and the
reference architectures published by large e-commerce companies describe dozens
of services.

Those architectures solve problems we do not have: hundreds of engineers who
cannot coordinate a single deploy, and domains with wildly different scaling
profiles. We have one engineer and single-digit concurrent users.

## Decision

One deployable Express application, internally divided into modules with hard
boundaries:

```
modules/<domain>/{routes,controller,service,repo,schema}.js
```

Rules that make the boundary real rather than cosmetic:

1. A module never imports another module's repository or Mongoose model.
2. Cross-module calls go through exported service functions.
3. Where a module needs to react rather than ask, it subscribes to a domain
   event (via the outbox) instead of calling in.
4. Controllers never touch the database; services never touch `req`/`res`.

Background work runs from the **same image with a different entrypoint**
(`worker.js`), so there is one dependency tree and no drift between what the API
and the worker believe about the models.

## Consequences

**Accepted:**
- One deploy, one log stream, one database — debugging is tractable for one person.
- Multi-document transactions across domains are possible (reserve inventory,
  insert order, insert fulfillments) in one atomic unit. This is genuinely hard
  across service boundaries and is the strongest argument for the monolith here.
- A module can be extracted into a service later by replacing direct service
  calls with HTTP or queue messages — the seam is already there.

**Costs:**
- Discipline substitutes for enforcement. Nothing at runtime stops a lazy import
  across modules; code review and lint rules have to.
- The whole app scales as one unit. At our traffic that is irrelevant; at
  1,000 rps we would run several stateless instances, which the design supports.

## Alternatives rejected

- **Microservices now.** Would add network failure modes, distributed
  transactions, service discovery and multiple deploy pipelines for zero
  capacity benefit. The answer to "why not microservices" is capacity numbers,
  not preference.
- **Serverless functions per route.** Cold starts on a checkout path, no
  long-lived Mongo connection pool, and transactions become awkward.
- **Unstructured monolith** (what exists today: a 600-line `index.js`). Already
  demonstrating the cost — every feature touches the same file and nothing is
  unit-testable.
