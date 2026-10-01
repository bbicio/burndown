# Money wrapper cleanup — design

Date: 2026-10-01. Follow-up of the money centralization cycle (`f963069`, spec `2026-10-01-money-centralization-design.md`), which kept the existing formatting functions as one-line wrappers over `js/lib/money.js` (Approach 1) and deferred this cleanup (Approach 2).

## Goal

One formatting entry point. Remove the one-line money wrappers and call `formatMoney(amount, code, currencies)` from `js/lib/money.js` directly, with the currency code and the `currencies` list always passed explicitly. **Behaviour is unchanged**: every amount shown on screen is identical to today.

## Current behaviour (read from code)

| Wrapper | Location | What it adds over `formatMoney` |
|---|---|---|
| `fmtMoney(n, code)` | `js/core.js:212` | `null`/`undefined` → `'—'`; code defaults to `currentCfg?.currency \|\| 'EUR'` |
| `cgFmtCurrency(amount, code)` | `js/costgrid.js:57` | nothing (passes `window.__currencies`) |
| `pbFmtMoney(n, code, currencies)` | `js/lib/pipeline-calc.js:87`, bridge `window.pbFmtMoney` at `:119` | nothing (pass-through) |
| `fmtAmtC(n, cur)` | `config.html:1098` | `!n` → `'—'`; `(cur \|\| 'EUR').trim()` |
| `fmtAmtC(n, cur)` | `config.html:1186` | `n == null \|\| n === 0` → `'—'`; `(cur \|\| 'EUR').trim()` |
| `fmtAmount(n)` | `config.html:1946` | fixed code `'EUR'` |
| `fmtMoney(amount, cur)` (Vue method) | `project-config.html:925` | `amount \|\| 0`; default `this.project?.currency` |
| `fmtCur(amount)` (Vue method) | `costgrid.html:1227` | calls `cgFmtCurrency` with `draft.currency \|\| 'EUR'` |

About 128 occurrences of the three main names across 13 files (most: `portfolio.html` 49, `js/portfolio.js` 21, `pipeline.html` 15, `project-config.html` 14). `portfolio.html`'s dashboard calls `fmtMoney(x)` with no code in about 35 places and relies on `currentCfg`, assigned at `portfolio.html:1121`.

`js/portfolio.js` is mostly unreachable (see CLAUDE.md): only `fmtProjectTitle` and `getMonthRangeFromCfg` are used (by `planning.html`). Its `fmtMoney` calls are all inside `renderPortfolioSummary`, `buildProjectCard`, `buildProgramSummary`, reachable only through `renderPortfolioView` (called by `showPortfolioView` and guarded by `typeof` in `js/upload.js:37`).

## Design

### 1. Replacement rule
- Every wrapper call becomes `formatMoney(n, code, currencies)`.
- The accessory rules (`'—'` for null, `'—'` for zero, `|| 0`, `trim()`) stay at the call site as an explicit ternary, reproducing **that site's own rule**. Differences between sites are not unified here (behaviour is unchanged).
- No intermediate helper, in `money.js` or per page: the call site is explicit.
- Vue templates get `formatMoney` and `currencies` as instance properties (`window.formatMoney`, `window.__currencies`).

### 2. Currency without fallback
- `portfolio.html`: one computed property `dashCurrency` (currency of the open project) replaces `currentCfg` as the implicit source. The ~35 code-less calls pass it.
- `project-config.html`: `project.currency` passed explicitly.
- After the migration `currentCfg` is no longer read for formatting. Whether its assignment can be removed is decided in the plan with a repo-wide grep; it is not removed if anything else reads it.

### 3. Task order (one plan, one task and commit per page)
`core.js` + `timesheets.html` → `costgrid.js` + `costgrid.html` → `pipeline-calc.js` + `pipeline.html` → `config.html` → `project-config.html` → `portfolio.html` → `js/portfolio.js` (reachable parts only) → delete the wrapper definitions and the `window.pbFmtMoney` bridge.

Each task bumps `?v=N` of every file it modifies in every page that loads it, and ends with the unit tests plus a manual check of the page.

### 4. `js/portfolio.js`
Only reachable code is migrated. The plan first verifies whether the `typeof renderPortfolioView` branch in `js/upload.js:37` can fire on `planning.html`. If the three dead builders are unreachable, they are removed in a separate commit rather than migrated; if reachable, they are migrated like the rest.

### 5. Tests
- `js/lib/money-guard.test.js` gains a check: the names `fmtMoney`, `cgFmtCurrency`, `pbFmtMoney`, `fmtAmtC`, `fmtAmount` (definition or call) fail the test in any served file. The existing rules (no money `Intl.NumberFormat`/`toLocaleString` outside the module; pages using money functions must load `money.js`) stay.
- Tests calling the wrappers (`pipeline-calc.test.js`, `money-characterization.test.js`) move to `formatMoney` with the same expected values.
- Manual check per page in EUR and CHF (different locales).

### 6. Residual risk
No frontend integration tests: a Vue template referencing a property that is not exposed fails at runtime, not in tests. Mitigation: a manual check per page at the end of each task with a clean browser console.

## Acceptance criteria
1. A repo-wide grep finds no definition or call of `fmtMoney`, `cgFmtCurrency`, `pbFmtMoney`, `fmtAmtC`, `fmtAmount`, `fmtCur` or the Vue wrapper methods.
2. `window.pbFmtMoney` no longer exists; `pipeline-calc.js` no longer exports `pbFmtMoney`.
3. Every call site passes the currency code and `currencies` explicitly; none depends on `currentCfg` for the currency.
4. The output of every call site is identical to before, including null/zero → `'—'` per site.
5. `npm test` passes; the guard test covers the removed names.
6. Every `?v=N` of a modified file is bumped in every page that loads it.
7. Manual check on `portfolio.html`, `pipeline.html`, `costgrid.html`, `project-config.html`, `config.html`, `timesheets.html`: identical amounts in at least EUR and CHF.

## Excluded scope
- Changes to `formatMoney`, `parseMoney`, `formatMoneyInput` and locale logic.
- Currency conversion for projects without a proposal, re-enabling direct project creation, mixed-currency program totals.
- Project deletion/unlink cycle.
- Non-money formats (hours, counts, dates, exchange rates), which keep `toLocaleString`.
- The server twin `api/src/lib/money-format.js`.
- Removing other dead code in `js/portfolio.js` beyond what the money calls force.
- Unifying the behaviour differences between sites (null vs zero handling).

## Open points for the plan
- Whether `js/upload.js:37`'s `renderPortfolioView` branch can run on `planning.html` (decides migrate vs remove for the three builders).
- Whether `currentCfg`'s assignment can be removed after the migration.
- The exact `portfolio.html` sites without a code (the plan lists them one by one, from a grep, before editing).
