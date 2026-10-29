# POT reference version + server-owned version rate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every POT route counts each proposal once through its reference version, and the exchange rate of a version is decided only by the server (fixed, EUR = 1).

**Architecture:** two CTE generators in `api/src/lib/pot-fee-sql.js` (`ref_v` = one non-Draft reference version per proposal, `pot_v` = `ref_v` + the fee computed once) replace every direct read of `cost_grid_versions` in `pots.js` and the `disp` CTE of `pipeline-years.js`. A pure rule `api/src/lib/version-rate.js` decides the rate in the version `POST`/`PATCH`/`refresh-rate` routes; the client stops sending `currencyRate`.

**Tech Stack:** Node/Express + PostgreSQL 16 (`node:test`), classic-script frontend (vitest + jsdom), `test-api.js` integration suite via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-10-29-pot-reference-version-and-version-rate-design.md`
**Branch:** `pot-reference-version-rate`
**Risk class:** high-risk — money o valute (PROCESS.md §6.1b)

## Global Constraints

- Totals stay in EUR; only Committed and Anticipated count, Expected and SIP are informative (cycle B rules).
- "Has projects" = a `cg_version_projects` row **or** a `projects.cg_version_id`, exactly as `versionHasProjects` in `api/src/routes/cost-grids.js`.
- Reference version: non-Draft, `ORDER BY` has-projects `DESC`, then `created_at DESC`, one per `cost_grid_id`.
- `pots.js` keeps no literal `currency_rate` (existing test `pots.js has no fee expression of its own`).
- Refusal shape: `400 { error, code: 'CURRENCY_RULE' }`; `js/api-sync.js` never retries a refused `PATCH` as a `POST`.
- Every edited `js/`/`css/` file gets its `?v=N` bumped in **every** reference (`grep -rn "js/api-sync.js?v=" *.html`).
- User-facing text in English. Edit HTML with the Edit tool, never PowerShell `Set-Content` (BOM).
- Response shapes of all POT routes are unchanged.

## Review Focus

1. **A version whose currency was deactivated after creation**, saved again by autosave with the same `currency`: must save with 200 and keep its rate — Task 5 test `PATCH same inactive currency keeps the rate`.
2. **A proposal whose only non-Draft version is Canceled** must still appear in the Canceled card of `/pipeline-summary` but not in `/:id/details` — Task 8, POT-21.
3. **Old cached pages still sending `currencyRate`** on every autosave must not change the rate nor get a 400 — Task 5, `PATCH ignores currencyRate`.
4. **A version with `currency_rate = 0`** keeps counting as rate 1 in `fee_eur` — Task 2 shape test asserts `NULLIF(…currency_rate, 0)`.
5. **A non-admin caller of `GET /api/pipeline-years`** keeps seeing only visible proposals in `offers` after the CTE swap — Task 4 relies on PY-10..PY-14, which already cover it; the task must run them.

## Task independence

Tasks 1, 2, 6, 7 are independent of each other. Task 3 and Task 4 consume Task 2; Task 5 consumes Task 1; Task 8 (integration tests) consumes all of them and runs last.

## Files

| File | Responsibility | Task |
|---|---|---|
| `api/src/lib/version-rate.js` (new) + `.test.js` | the rate rule | 1 |
| `api/src/lib/pot-fee-sql.js` + `.test.js` | `ref_v` / `pot_v` CTEs; shape guards on `pots.js`/`pipeline-years.js` | 2, 3, 4 |
| `api/src/routes/pots.js` | the five POT routes on `pot_v` | 3 |
| `api/src/routes/pipeline-years.js` | `offers` on `ref_v` | 4 |
| `api/src/routes/cost-grids.js` | rate in version `POST`/`PATCH`/`refresh-rate` | 5 |
| `js/api-sync.js`, `js/lib/api-sync-upsert.test.js`, the six pages loading `api-sync.js` | payload without `currencyRate`; `CURRENCY_RULE` notice; `?v=` | 6 |
| `master-pipelines.html`, `TEST_CASES.md`, `js/lib/test-cases-parse.test.js` | B-177 | 7 |
| `test-api.js`, `TEST_CASES.md` | currency setup, fixed POT-13/14 + ND-05, new POT-18..POT-26 | 8 |

---

### Task 1: The rate rule

**Files:**
- Create: `api/src/lib/version-rate.js`
- Test: `api/src/lib/version-rate.test.js`

**Interfaces:**
- Produces: `versionRate(currency: string, currencyRow: { active: boolean, current_rate: string|number } | null) → { rate: number } | { error: string }`; `CURRENCY_RULE_CODE = 'CURRENCY_RULE'`. CommonJS, `module.exports = { versionRate, CURRENCY_RULE_CODE }`.

- [ ] **Step 1: Write the failing tests** (`node:test`, `assert/strict`)
  - `EUR is 1 whatever the row` — `versionRate('EUR', null)`, `versionRate('EUR', { active: false, current_rate: 3 })` and `versionRate('EUR', { active: true, current_rate: '1.000000' })` all `deepEqual { rate: 1 }`.
  - `an active currency takes its current rate` — `versionRate('USD', { active: true, current_rate: '1.300000' })` → `{ rate: 1.3 }`.
  - `an inactive currency is refused` — `versionRate('CHF', { active: false, current_rate: '0.8' })` → `{ error: 'Currency CHF is not active' }`.
  - `an unknown currency is refused` — `versionRate('XXX', null)` → `{ error: 'Currency XXX is not active' }`.
  - `CURRENCY_RULE_CODE` equals `'CURRENCY_RULE'`.
- [ ] **Step 2: Run** `cd api && node --test src/lib/version-rate.test.js` — Expected: FAIL, `Cannot find module './version-rate'`.
- [ ] **Step 3: Implement** `versionRate` (a header comment of one sentence, in the style of `pot-fee-sql.js`).
- [ ] **Step 4: Run** the same command — Expected: PASS (5 tests).
- [ ] **Step 5: Commit** `feat(api): versionRate rule for the version exchange rate`.

### Task 2: Reference-version and POT-version CTEs

**Files:**
- Modify: `api/src/lib/pot-fee-sql.js`
- Test: `api/src/lib/pot-fee-sql.test.js`

**Interfaces:**
- Produces:
  - `referenceVersionsCte() → string`: the text `ref_v AS ( … )` (no leading `WITH`), selecting `rv.*` per the Spec §2 SQL, internal aliases `rv`, `rv_c`, `rv_p`.
  - `potVersionsCte() → string`: `referenceVersionsCte()` + `,\n` + `pot_v AS (SELECT ref_v.*, pf_fee.fee_original, pf_fee.fee_original / COALESCE(NULLIF(ref_v.currency_rate, 0), 1) AS fee_eur FROM ref_v CROSS JOIN LATERAL (SELECT <feeSql('ref_v', '')> AS fee_original) pf_fee)`. Columns of `pot_v`: every `cost_grid_versions` column + `fee_original` + `fee_eur`.
  - Export after this task: `{ feeEurSql, feeOriginalSql, referenceVersionsCte, potVersionsCte }`; `feeSql` stays internal. `feeEurSql`/`feeOriginalSql` and their three tests stay until Task 3 removes their only caller.
- [ ] **Step 1: Write the failing tests** (new tests; the existing ones stay):
  - `referenceVersionsCte picks one non-Draft version per proposal` — matches `/^ref_v AS \(/`, `/DISTINCT ON \(rv\.cost_grid_id\)/`, `/rv\.pipeline <> 'Draft'/`, `/rv\.created_at DESC/`.
  - `has projects counts both links` — matches `/cg_version_projects rv_c WHERE rv_c\.cost_grid_version_id = rv\.id/` and `/projects rv_p WHERE rv_p\.cg_version_id = rv\.id/`, and the has-projects expression appears before `rv.created_at DESC` (compare `indexOf`).
  - `potVersionsCte computes the fee once` — `(sql.match(/SUM\(pf_tr\.days/g) || []).length === 1`; matches `/NULLIF\(ref_v\.currency_rate, 0\)/`, `/AS fee_original/`, `/AS fee_eur/`.
  - `no internal alias collides with the routes' aliases` — neither CTE matches `/\b(cgv|cgv2|cg|ph|tk|tr|ro|re)\./`.
- [ ] **Step 2: Run** `cd api && node --test src/lib/pot-fee-sql.test.js` — Expected: FAIL, `referenceVersionsCte is not a function`.
- [ ] **Step 3: Implement** both generators.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): reference-version and POT-version CTEs`.

### Task 3: POT routes on `pot_v` (B-175, B-174, B-182)

**Files:**
- Modify: `api/src/routes/pots.js` (the routes `/pipeline-summary`, `/year-totals`, `/summary`, `GET /`, `/:id/details`)
- Modify: `api/src/lib/pot-fee-sql.js` (drop `feeEurSql`/`feeOriginalSql`)
- Test: `api/src/lib/pot-fee-sql.test.js`

**Interfaces:**
- Consumes: `potVersionsCte()` from Task 2.
- Produces: unchanged response shapes.

- [ ] **Step 1: Write the failing test** `pots.js reads versions only through pot_v` — in `pots.js` source: `doesNotMatch(/FROM cost_grid_versions/)`, `doesNotMatch(/JOIN cost_grid_versions/)`, `doesNotMatch(/feeEurSql|feeOriginalSql/)`, `match(/potVersionsCte\(\)/)`, and `(src.match(/WITH \$\{potVersionsCte\(\)\}/g) || []).length >= 5`.
- [ ] **Step 2: Run** `cd api && node --test src/lib/pot-fee-sql.test.js` — Expected: FAIL on that test.
- [ ] **Step 3: Rewrite the five routes** per Spec §3:
  - every query opens `WITH ${potVersionsCte()}` and reads `pot_v cgv` (or `pot_v cgv2` in the `LATERAL` of `GET /` and in the totals of `/summary`);
  - `/pipeline-summary`: `COUNT(*)::int AS count`, `COALESCE(SUM(cgv.fee_eur), 0) AS total`;
  - `/year-totals`: `cgv.fee_eur AS fee`; one local `const zeroTotals = () => ({ pot_total: 0, committed_total: 0, anticipated_total: 0, expected_total: 0, sip_total: 0 })` used in both places (the `potRows` loop spreads it and sets `pot_total`);
  - `/summary`: list without `DISTINCT`, `cgv.fee_eur AS value`; totals `COALESCE(SUM(cgv2.fee_eur) FILTER (WHERE cgv2.pipeline = 'Committed'), 0) AS committed_total` and the same for Anticipated/Expected/SIP;
  - `GET /`: the `LATERAL` uses `SUM(cgv2.fee_eur) FILTER (…)` for the four stages;
  - `/:id/details`: no `DISTINCT ON`, `cgv.fee_eur AS value`, `cgv.fee_original AS value_original`, `AND cgv.pipeline NOT IN ('Draft', 'Canceled')`, `ORDER BY cgv.created_at DESC`;
  - then remove `feeEurSql`/`feeOriginalSql` from `pot-fee-sql.js`, its export and the three tests that call them (`feeEurSql divides…`, `feeOriginalSql is the same fee…`, `neither expression uses an alias…`).
- [ ] **Step 4: Run** `cd api && node --test src/lib/pot-fee-sql.test.js` — Expected: PASS. Then `node -e "require('./src/routes/pots.js')"` from `api/` (or `docker exec` on a branch stack if `api/node_modules` is absent) — Expected: no error.
- [ ] **Step 5: Commit** `fix(api): POT routes count each proposal once through its reference version (B-175, B-174, B-182)`.

### Task 4: `pipeline-years.js` offers on `ref_v`

**Files:**
- Modify: `api/src/routes/pipeline-years.js` (`GET /`, the `disp` CTE and the `counts` query)
- Test: `api/src/lib/pot-fee-sql.test.js`

**Interfaces:**
- Consumes: `referenceVersionsCte()` from Task 2.

- [ ] **Step 1: Write the failing test** `pipeline-years.js counts offers on the reference version` — source of `../routes/pipeline-years.js`: `match(/referenceVersionsCte\(\)/)`, `doesNotMatch(/DISTINCT ON \(cg\.id\)/)`, `doesNotMatch(/SELECT DISTINCT cost_grid_id, pipeline_year/)`.
- [ ] **Step 2: Run** it — Expected: FAIL.
- [ ] **Step 3: Rewrite** the `counts` query: `WITH ${referenceVersionsCte()} SELECT ref_v.pipeline_year AS year, COUNT(*)::int AS offers FROM ref_v JOIN cost_grids cg ON cg.id = ref_v.cost_grid_id WHERE ref_v.pipeline <> 'Canceled' AND ref_v.pipeline_year IS NOT NULL ${visibility} GROUP BY ref_v.pipeline_year` (the `visibility` clause unchanged, still `$1` for non-admins). Update the comment above it: the display version is the shared server rule, "has projects" via both links.
- [ ] **Step 4: Run** the test — Expected: PASS. PY-10..PY-14 run in Task 8.
- [ ] **Step 5: Commit** `fix(api): pipeline-years offers use the shared reference-version rule`.

### Task 5: The server decides the version rate (B-176)

**Files:**
- Modify: `api/src/routes/cost-grids.js` — `POST /:id/versions`, `PATCH /:id/versions/:vId`, `POST /:id/versions/:vId/refresh-rate`
- Test: `api/src/lib/version-rate.test.js` (source guard on the route)

**Interfaces:**
- Consumes: `versionRate`, `CURRENCY_RULE_CODE` from Task 1.
- Produces: the behaviours of Spec §5; Task 6 and Task 8 rely on `400 { code: 'CURRENCY_RULE' }`.

- [ ] **Step 1: Write the failing test** `the version routes never write a rate taken from the body` — source of `../routes/cost-grids.js`: `doesNotMatch(/parseFloat\(currencyRate\)/)`, `match(/versionRate\(/)`, and the `refresh-rate` block (cut between `'/:id/versions/:vId/refresh-rate'` and the next `router.`) matches `/UPDATE cost_grid_versions SET currency_rate = 1/`.
- [ ] **Step 2: Run** `cd api && node --test src/lib/version-rate.test.js` — Expected: FAIL on that test.
- [ ] **Step 3: Implement**:
  - a local helper `async function currencyRow(code, q = query)` → `SELECT active, current_rate FROM currencies WHERE code = $1` first row or `null`;
  - `POST`: drop `currencyRate` from the destructuring; `const r = versionRate(resolvedCurrency, await currencyRow(resolvedCurrency))`; on `r.error` → `res.status(400).json({ error: r.error, code: CURRENCY_RULE_CODE })` before the insert;
  - `PATCH`: drop `currencyRate` from the destructuring and its `fields.push`. Inside the existing `withVersionLock` branch (taken whenever `currency !== undefined`), after `versionCurrencyChangeError` passes: if `currency || 'EUR'` is `'EUR'` → push `currency_rate = 1`; else if it differs from `stored.currency` → `versionRate(…, await currencyRow(…, client.query.bind(client)))`, error → `return { rateErr: r.error }`, else push `currency_rate = r.rate`; else (same non-EUR currency) push nothing. The `UPDATE` text is built after this decision, so `updateSql` moves inside the branch (or is rebuilt there). `out.rateErr` → `400 { error, code: CURRENCY_RULE_CODE }`;
  - `refresh-rate`: for EUR run `UPDATE cost_grid_versions SET currency_rate = 1 WHERE id = $1` before responding `{ currency, currency_rate: 1.0 }`.
- [ ] **Step 4: Run** the test — Expected: PASS. Behaviour is proven by Task 8 (POT-22..POT-26).
- [ ] **Step 5: Commit** `fix(api): the version exchange rate is set only by the server (B-176)`.

### Task 6: Autosave without `currencyRate`

**Files:**
- Modify: `js/api-sync.js` (`_cgUpsertVersionToApi`, `serverMeta` and the `catch` of the version `PATCH`)
- Modify: every page with `js/api-sync.js?v=28` (`grep -rln "js/api-sync.js?v=" *.html`) → `?v=29`
- Test: `js/lib/api-sync-upsert.test.js`

- [ ] **Step 1: Write the failing tests** in the existing `describe`:
  - `does not send a currency rate` — after `await build()('cg1', 'v1')`, `expect(api.costGrids.versions.update.mock.calls[0][2]).not.toHaveProperty('currencyRate')`.
  - `reports a CURRENCY_RULE refusal and never retries as POST` — `api.costGrids.versions.update` rejects with `Object.assign(new Error('Currency CHF is not active'), { data: { code: 'CURRENCY_RULE', error: 'Currency CHF is not active' } })`; expect `showInfo` called once and `api.costGrids.versions.create` not called.
- [ ] **Step 2: Run** `npx vitest run js/lib/api-sync-upsert.test.js` — Expected: the two new tests FAIL.
- [ ] **Step 3: Implement**: remove the `currencyRate` line from `serverMeta`; the `catch` notifies `if (e.data?.code === 'DATE_RULE' || e.data?.code === 'CURRENCY_RULE')`. Bump `?v=28` → `?v=29` in every page found by the grep.
- [ ] **Step 4: Run** `npx vitest run js/lib/api-sync-upsert.test.js js/lib/nav-shell-guard.test.js` — Expected: PASS; `grep -rn "js/api-sync.js?v=28" *.html` → no output.
- [ ] **Step 5: Commit** `fix(api-sync): autosave no longer sends the version rate (B-176)`.

### Task 7: Inactive currencies in Master Data (B-177)

**Files:**
- Modify: `master-pipelines.html` (the `mounted`/init block that calls `Api.currencies.active()`)
- Modify: `TEST_CASES.md` (new case after PP-48), `js/lib/test-cases-parse.test.js` (case count pin +1)

- [ ] **Step 1: Write the failing check**: bump the pin in `js/lib/test-cases-parse.test.js` by one, then run `npx vitest run js/lib/test-cases-parse.test.js` — Expected: FAIL (count mismatch).
- [ ] **Step 2: Add the case** `PP-49 | View Details — inactive currency | View Details modal for a POT with a Committed proposal in a currency that is no longer active | The Value cell shows the amount with that currency's own locale and symbol (e.g. CHF in the de-CH format), below it "(€ …)"; totals unchanged | |`.
- [ ] **Step 3: Implement**: `try { window.__currencies = await Api.currencies.list(); } catch {}` in place of `Api.currencies.active()`; `this.activeCurrencies = window.__currencies || []` unchanged.
- [ ] **Step 4: Run** `npx vitest run js/lib/test-cases-parse.test.js js/lib/money-guard.test.js` — Expected: PASS; `grep -n "Api.currencies.active()" master-pipelines.html` → no output.
- [ ] **Step 5: Commit** `fix(master-pipelines): format inactive currencies with their own locale (B-177)`.

### Task 8: Integration tests

**Files:**
- Modify: `test-api.js` — new `ensureTestCurrencies()`, `testPotMasterDataFields` (POT-13/14 setup), `testVersionDuplicate` (ND-05), new `testPotReferenceVersion()` called after `testPotMasterDataFields()`
- Modify: `TEST_CASES.md` (one automated row citing POT-18..POT-26, marked `✓`) and the pin in `js/lib/test-cases-parse.test.js` +1

**Interfaces:**
- Consumes: everything above.
- Produces: `async function ensureTestCurrencies() → { USD: number, CHF: number }`, called once in `main()` right after `testAuth()`; results stored in a module-level `const testRates = {}`.

- [ ] **Step 1: Currency setup**: `ensureTestCurrencies` activates `USD` (rate 1.3) and `CHF` (rate 0.8) with `POST /api/currencies/:code/activate`, accepting 200 or 409, then reads `GET /api/currencies` (admin) and stores each `current_rate`. It also asserts `NOK` is inactive (`ok(…, 'CUR-setup NOK is inactive (used as the inactive currency)')`). The fresh DB of `run-tests.sh` seeds every currency but EUR as inactive (`012_currencies.sql`), so PR-04..PR-14's `USD` changes keep passing.
- [ ] **Step 2: Fix the existing tests broken by the new rule**:
  - POT-13..POT-17: `makeProposal` drops the `currencyRate` argument; the CHF proposal relies on the active CHF; POT-14 expects `value ≈ 1000 / testRates.CHF`; the comment "CHF is seeded inactive…" is removed.
  - ND-05: the source gets its snapshot with `PATCH { currency: 'USD' }` instead of `{ currencyRate: 1.2345 }`; the assertion becomes `Math.abs(budgets[newId].currencyRate - testRates.USD) < 1e-6`, label unchanged.
- [ ] **Step 3: Write `testPotReferenceVersion()`** (section `POT reference version`, setup as **sysadmin** — creating a second version after publish needs it; its own client `__test_pot_ref_client__`, a POT on it for the current year, `makeTestRole`, structure `days` × `rateOverride: 100`). Helper: a proposal with v1 published and moved to stage A, then v2 created by sysadmin, published, moved to stage B. Assertions:
  - **POT-18** v1 Expected (2 days) + v2 Committed (4 days): `/:id/details` lists the proposal once with `pipeline === 'Committed'`, `committed_total ≈ 400`, `expected_total ≈ 0`; `GET /api/pots?year=` the same totals; `/summary?clientId=&year=` lists it once and `expected_total ≈ 0`.
  - **POT-19** `/year-totals[year].expected_total` does not grow by 200 between before and after creating POT-18's proposal (read before setup, compare after); `/pipeline-summary?year=` Expected `count` does not grow.
  - **POT-20** v1 Committed linked through `POST /api/projects { name, cgVersionId: v1, currency: 'EUR' }` (sysadmin; that route writes only `projects.cg_version_id`), v2 Anticipated newer: `/:id/details` shows the proposal as `Committed`; `GET /api/pipeline-years` `offers` for the year grows by exactly 1 for the proposal (read before/after).
  - **POT-21** a proposal whose reference version is Canceled is absent from `/:id/details` `proposals`, and `/pipeline-summary` Canceled `count` grows by 1.
  - **POT-22** `PATCH { currencyRate: 2.5 }` and `PATCH { label: 'x', currencyRate: 2.5 }` on a USD version → 200, `currency_rate` (read via `GET /api/cost-grids/:id/versions`) still `testRates.USD`.
  - **POT-23** `PATCH { currency: 'EUR', currencyRate: 2.5 }` → `currency_rate === 1`; `PATCH { currency: 'USD' }` → `testRates.USD`.
  - **POT-24** `PATCH { currency: 'NOK' }` → 400 `code === 'CURRENCY_RULE'`, currency and rate unchanged; `POST /versions { currency: 'NOK' }` on a Draft-only grid → 400 `CURRENCY_RULE`.
  - **POT-25** `POST /versions { currency: 'EUR', currencyRate: 3 }` → `currency_rate === 1`; `refresh-rate` on that version → `{ currency_rate: 1 }`.
  - **POT-26** `PATCH { currency: 'USD' }` (same currency) on a USD version → 200 and rate unchanged (the "same currency, rate kept" path; deactivation is not testable through the API, see Decisioni aperte 2).
- [ ] **Step 4: Run** `scripts/run-tests.sh` (copy `.env` into the worktree first) — Expected: `all passed ✓`, including POT-01..POT-26, PY-10..PY-14, PR-01..PR-14, ND-01..ND-05.
- [ ] **Step 5: Update `TEST_CASES.md`** with one row `PP-50 | POT reference version and version rate | … (test-api POT-18..POT-26) | ✓`, bump the pin, run `npx vitest run js/lib/test-cases-parse.test.js` — Expected: PASS.
- [ ] **Step 6: Commit** `test(api): POT reference version and server-owned rate (POT-18..POT-26)`.

---

## Decisioni aperte

1. **Spec acceptance criterion 3 (anno della versione di riferimento) is proven by the shape tests of Tasks 3-4, not by `test-api.js`.** Alternativa scartata: a `test-api.js` case with two versions in different years. Perché: no API writes `pipeline_year` (publish stamps the current calendar year), so two years cannot be built over HTTP; the shape tests pin that `pots.js` reads only `pot_v` and that `pipeline-years.js` no longer joins the years of any non-Draft version.
2. **The "same currency, deactivated afterwards" path is proven in `test-api.js` only with an active currency (POT-26), plus the code path of Task 5.** Alternativa scartata: a route to deactivate a currency, or direct SQL from `test-api.js`. Perché: there is no deactivate route and `test-api.js` speaks only HTTP; adding a route is out of scope.
3. **The suite activates `USD` and `CHF` once (`ensureTestCurrencies`), and uses `NOK` as the inactive currency.** Alternativa scartata: each test activating what it needs. Perché: PR-04..PR-14 already change versions to `USD`, which the new rule refuses on a fresh DB where only EUR is active.
