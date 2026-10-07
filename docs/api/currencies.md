# api/src/routes/currencies.js

The currencies admin surface, backing `master-currencies.html`. `CLAUDE.md`'s File structure entry keeps only a short summary plus a pointer here. See `/sync-docs`'s routing rule for where future changes belong. Money formatting that consumes these rates: `CLAUDE.md` → "Money formatting and parsing", [docs/js/lib.md](../js/lib.md) (`money.js`), [docs/api/lib.md](lib.md) (`money-format.js`).

## Routes

| Route | Auth | What it does |
|---|---|---|
| `GET /active` | `requireAuth` | Active currencies, for dropdowns and money formatting |
| `GET /` | admin | All currencies + last rate-update timestamp from `currency_rates` |
| `POST /:code/activate` | admin | Activates a currency with an initial rate — EUR is always active, re-activation is rejected |
| `PATCH /:code/rate` | admin | Updates the rate of an already-active non-EUR currency — EUR's rate is fixed at 1:1 |
| `GET /:code/history` | admin | Chronological rate-change log, last 100 entries |

## Rate history invariant

Every rate change — whether it comes from `activate` or from `rate` — both updates `currencies.current_rate` and inserts a `currency_rates` row. The history table is therefore complete by construction; nothing reconstructs it after the fact.

Schema: `012_currencies.sql` (see `CLAUDE.md` → "DB migrations").
