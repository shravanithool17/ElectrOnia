# Architecture decision records

Each record captures one decision, the context that forced it, and the
consequences accepted. They exist so a decision is not re-litigated every time
someone new reads the code — and so that "why is it like this?" has an answer
that is not "I don't remember".

Format: context → decision → consequences → alternatives rejected.

| # | Decision | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith, not microservices | Accepted |
| [0002](0002-order-fulfillment-split.md) | Split Order from Fulfillment | Accepted |
| [0003](0003-money-as-integer-paise.md) | Store money as integer paise | Accepted |
| [0004](0004-append-only-ledger.md) | Append-only ledger for vendor earnings | Accepted |
| [0005](0005-webhook-idempotency.md) | Webhooks are the source of truth for payments | Accepted |
