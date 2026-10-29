# Currency cycle 1 — server validation of rates and amounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every route that writes a rate or a POT amount refuses, before any write, a value that is not a finite number ≥ 0 with at most its currency's decimals (`400 { error, code: 'MONEY_RULE' }`); a structure rate of 0 is stored as 0; a role created with per-currency rates keeps them.

**Architecture:** a pure rule module `api/src/lib/money-rules.js` (`amountError`, `overridesError`), built on `currencyDigits` newly exported from `api/src/lib/money-format.js`, called by the five write paths in `cost-grids.js`, `projects.js`, `config.js` and `pots.js`. The cost-grid autosave shows a `MONEY_RULE` refusal the way it already shows `DATE_RULE`.

**Tech Stack:** Node/Express + PostgreSQL 16 (`node:test`), classic-script frontend (vitest + jsdom), `test-api.js` integration suite via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-10-29-currency-c1-server-rate-validation-design.md`
**Branch:** `currency-c1-server-rate-validation`
**Risk class:** high-risk — money o valute (PROCESS.md §6.1b)

**Task dependencies:** Task 1 first (the module). Task 2 creates `testMoneyRules()` in `test-api.js`, which Tasks 4-6 append to, so it runs before them. Tasks 3, 4, 5 and 6 are independent of each other: different route files, and each uses only Task 1's interface.

## Global Constraints

- Refusal shape: `res.status(400).json({ error, code: MONEY_RULE_CODE })`, returned before `BEGIN`, before any `INSERT`/`UPDATE`/`DELETE`.
- Message, one form only: `` `${label} must be a number ≥ 0 with at most ${digits} decimal(s) for ${code}.` `` (Spec §2).
- Only `typeof value === 'number'` is a valid amount: `"150"` is refused (Spec decision 4). Extra decimals are refused, never rounded (decision 3).
- Absent/`null`: allowed in structure `roles[].rate` and role `hourlyRate` (→ `NULL`); saved as `0` in project resources (`""`, `null`, absent); refused in ratecard `hourlyRate`; POT keeps today's `"amount is required"` 400 (Spec §3 table).
- `rateOverrides` keys are not validated; each value is checked with the key as currency (decision 7).
- `js/api-sync.js` is referenced with `?v=29` by six pages: bump every reference to `?v=30` (`grep -rn "js/api-sync.js?v=" --include=*.html .`).
- User-facing text in English. Edit HTML with the Edit tool, never PowerShell `Set-Content` (BOM).
- Out of scope: PTC and phasing (B-185), form formatting (cycles 2-3), "Missing rate" warning (cycle 2 input).
- Integration tests run with `scripts/run-tests.sh` from the worktree (copy `.env` from the main checkout first; never commit it). Never `docker compose` against the main stack.

## Review Focus

1. **A cost-grid autosave refused with `MONEY_RULE`** (a user types `175.555` in a USD rate: the `type="number"` input still allows it until cycle 2) must tell the user once instead of failing silently in the console — Task 3, vitest `a MONEY_RULE refusal of the structure is shown once`.
2. **A stored NULL role rate**, re-sent by autosave as `rate: null` (JSON of `NaN`), must still save with 200 — Task 2, MR-05.
3. **Project-config saving a cleared resource rate** (`v-model.number` sends `""`) must save with 200 and store 0 — Task 4, MR-07.
4. **A rejected request leaves nothing half-written**: the ratecard `PATCH` loops over entries without a transaction, so validation must cover every entry before the first upsert — Task 5, MR-12 (second entry invalid, first entry unchanged).
5. **A version or project whose currency has no Intl data** (unknown code) must fall back to 2 decimals, not throw — Task 1, `amountError` unknown-code case.

---

### Task 1: The rule module

**Files:**
- Modify: `api/src/lib/money-format.js` (export `currencyDigits`)
- Modify: `api/src/lib/money-format.test.js`
- Create: `api/src/lib/money-rules.js`
- Create: `api/src/lib/money-rules.test.js`

**Interfaces:**
- Produces:
  - `currencyDigits(locale: string, code: string) -> number` (now exported; body unchanged; 2 when `Intl` refuses the code).
  - `MONEY_RULE_CODE = 'MONEY_RULE'`
  - `amountError(value: any, currencyCode: string, label: string) -> string | null`
  - `overridesError(overrides: any, label: string) -> string | null` — `label` prefixes the per-key label as `` `${label} (${key})` ``.

- [ ] **Step 1: Write the failing tests**

In `money-format.test.js`, add a test `money-format: currencyDigits follows the currency`: `currencyDigits('en', 'EUR') === 2`, `currencyDigits('en', 'JPY') === 0`, `currencyDigits('en', 'XX1') === 2`.

`money-rules.test.js` (`node:test`, `assert/strict`, modelled on `project-rules.test.js`):
- `amountError: accepts numbers ≥ 0 within the currency decimals` — `null` for `(0,'EUR')`, `(150,'EUR')`, `(175.5,'EUR')`, `(175.55,'EUR')`, `(1500,'JPY')`, `(175.55,'XX1')`.
- `amountError: refuses with the one message` — `amountError(175.555, 'EUR', 'Rate for role "PM"') === 'Rate for role "PM" must be a number ≥ 0 with at most 2 decimal(s) for EUR.'`; `amountError(1.5, 'JPY', 'X') === 'X must be a number ≥ 0 with at most 0 decimal(s) for JPY.'`.
- `amountError: refuses non-numbers and negatives` — not `null` for `-1`, `NaN`, `Infinity`, `'150'`, `null`, `undefined` (EUR).
- `overridesError: accepts empty and valid overrides` — `null` for `undefined`, `null`, `{}`, `{ USD: 9999 }`, `{ USD: 175.5, JPY: 1500 }`.
- `overridesError: names the key of the first bad value` — `overridesError({ USD: -1 }, 'Rate overrides of role "PM"') === 'Rate overrides of role "PM" (USD) must be a number ≥ 0 with at most 2 decimal(s) for USD.'`; `{ JPY: 1.5 }` not `null`.
- `overridesError: refuses arrays and non-objects` — `overridesError([], 'L') === 'L must be an object.'`, same for `'x'` and `5`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && node --test src/lib/money-rules.test.js src/lib/money-format.test.js`
Expected: FAIL — `Cannot find module './money-rules'` and `currencyDigits is not a function`.

- [ ] **Step 3: Implement**

`money-format.js`: `module.exports = { formatMoney, currencyDigits };`.
`money-rules.js`: `amountError` is valid iff `typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number(value.toFixed(digits)) === value`, with `digits = currencyDigits('en', currencyCode)`. `overridesError`: `undefined`/`null` → `null`; `Array.isArray` or `typeof !== 'object'` → `` `${label} must be an object.` ``; otherwise the first non-null `amountError(v, key, `${label} (${key})`)`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd api && node --test src/lib/money-rules.test.js src/lib/money-format.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/money-format.js api/src/lib/money-format.test.js api/src/lib/money-rules.js api/src/lib/money-rules.test.js
git commit -m "feat(api): money-rules module — amounts ≥ 0 with the currency's decimals"
```

### Task 2: Structure PUT — validation and 0 stored as 0 (M-04)

**Files:**
- Modify: `api/src/routes/cost-grids.js` (imports; line 682 `locked` query; lines 714-721 `rateByCode`)
- Modify: `test-api.js` (new `testMoneyRules()`, called in `main()` after `await testPeriodWithTasks();`)
- Modify: `docs/BACKLOG.md` (row B-186)

**Interfaces:**
- Consumes: `amountError`, `MONEY_RULE_CODE` from Task 1.
- Produces: `async function testMoneyRules()` in `test-api.js` with `section('Money rules')`, a role fixture `mrRole = { id, code }` created with `hourlyRate: 100` (cleanup via `later('DELETE', …)`), and the helper `const isMoneyRefusal = r => r.status === 400 && r.data?.code === 'MONEY_RULE';`. Tasks 4-6 append their checks at the end of this function.

- [ ] **Step 1: Write the integration checks**

Setup like `testPotReferenceVersion` (pipeline year of the current year, a cost grid, cleanup with `later('POST', `/api/admin/reset/cost-grid/${cgId}`)`): one EUR version and one USD version. Body shape: `{ phases: [{ phaseName: 'P1', tasks: [{ taskName: 'T1', hours: { [mrRole.code]: 2 } }] }], roles: [{ roleCode: mrRole.code, rate }] }`. Read back `rate_override` from `GET …/structure` (`phases[0].tasks[0].roles[0].rate_override`), and the fee from `GET /api/cost-grids/budgets` (row with `version_id === vId`).
- MR-01: EUR, `rate: 120` → 200 (baseline).
- MR-02: EUR, `rate: -1` → `isMoneyRefusal`; `rate_override` still 120.
- MR-03: EUR, `rate: '150'` → `isMoneyRefusal`; `rate_override` still 120.
- MR-04: EUR, `rate: 0` → 200; `Number(rate_override) === 0`; `Number(fee) === 0` (role default is 100).
- MR-05: EUR, `rate: null` → 200; `rate_override === null` (unset rate tolerated).
- MR-06: USD, `rate: 175.555` → `isMoneyRefusal`; `rate: 175.55` → 200.

- [ ] **Step 2: Implement in `cost-grids.js`**

Require `{ amountError, MONEY_RULE_CODE }` from `../lib/money-rules`. Line 682 becomes `SELECT locked, currency FROM cost_grid_versions WHERE id = $1`. Right after the sold-hours loop, for each `r` of `rolesBody` with `r?.rate != null`: `amountError(r.rate, currency, `Rate for role "${r.roleCode || ''}"`)` → refuse with `MONEY_RULE_CODE`. Line 719: `rateByCode[r.roleCode] = r.rate;`.

- [ ] **Step 3: Add B-186 to `docs/BACKLOG.md`**

After B-185, same columns: source `2026-10-29-currency-c1-server-rate-validation` Plan; Low: the structure `PUT`'s second body shape (`tasks[].roles[]` with `roleId`/`rateOverride`, used by no client, only by `test-api.js`) still writes `tr.rateOverride || null`, so 0 becomes `NULL` there and the value is not validated; location `api/src/routes/cost-grids.js` `tr.rateOverride || null`; open; verification `grep -n "tr.rateOverride || null" api/src/routes/cost-grids.js` → one hit, 2026-10-29.

- [ ] **Step 4: Run**

Run: `scripts/run-tests.sh` — Expected: MR-01..MR-06 pass, `all passed ✓`.
Run: `npx vitest run scripts/doc-paths-guard.test.js` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/cost-grids.js test-api.js docs/BACKLOG.md
git commit -m "fix(api): structure PUT validates role rates; a rate of 0 is stored as 0 (M-04, M-05)"
```

### Task 3: Cost-grid autosave shows a MONEY_RULE refusal

**Files:**
- Modify: `js/api-sync.js:233` (the structure-save `catch`)
- Modify: `js/lib/api-sync-upsert.test.js`
- Modify: `costgrid.html:767`, `pipeline.html:519`, `planning.html:266`, `portfolio.html:702`, `program.html:275`, `project-config.html:421` (`js/api-sync.js?v=29` → `?v=30`)

**Interfaces:**
- Consumes: the server code string `'MONEY_RULE'` (Task 1); nothing in JS imports the module.

- [ ] **Step 1: Write the failing test**

In `api-sync-upsert.test.js`, `it('a MONEY_RULE refusal of the structure is shown once', …)`: `saveStructure` rejects with `{ data: { code: 'MONEY_RULE', error: 'Rate for role "PM" must be a number ≥ 0 with at most 2 decimal(s) for USD.' } }`; two calls both resolve `false`; `showInfo` called once with `['Rate for role "PM" must be a number ≥ 0 with at most 2 decimal(s) for USD. Tasks and the period of this version are not saved until this is fixed; other changes are saved.', '⚠️ Changes not saved']`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run js/lib/api-sync-upsert.test.js` — Expected: the new test FAILS (`showInfo` called 0 times).

- [ ] **Step 3: Implement**

Line 233: add `|| e.data?.code === 'MONEY_RULE'` to the condition that calls `notifyRefusal(e, true)`. Bump the six `?v=29` references to `?v=30`.

- [ ] **Step 4: Run to verify**

Run: `npx vitest run js/lib/api-sync-upsert.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js` — Expected: PASS.
Run: `grep -rn "js/api-sync.js?v=" --include=*.html . | grep -v "?v=30"` — Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add js/api-sync.js js/lib/api-sync-upsert.test.js costgrid.html pipeline.html planning.html portfolio.html program.html project-config.html
git commit -m "fix(costgrid): autosave shows a MONEY_RULE refusal of the structure"
```

### Task 4: Project tasks PUT — resource rates

**Files:**
- Modify: `api/src/routes/projects.js` (imports; `PUT /:id/tasks`, after the sold-hours loop and in the `INSERT` of `resources`)
- Modify: `test-api.js` (append to `testMoneyRules()`)

**Interfaces:**
- Consumes: `amountError`, `MONEY_RULE_CODE` (Task 1); `testMoneyRules`, `isMoneyRefusal` (Task 2).

- [ ] **Step 1: Write the integration checks**

Project created as `sysadminCookie` with `{ name: '__test_mr_project__', currency: 'EUR' }` (cleanup `later('DELETE', …)`). Body `[{ name: 'T1', resources: [{ role: 'R', hourlyRate, soldHours: 1 }] }]`, read back with `GET /api/projects/:id/tasks` (`[0].resources[0].hourlyRate`).
- MR-07: `hourlyRate: 150` → 200; `hourlyRate: ''` → 200 and read back `0`.
- MR-08: after re-saving 150, `hourlyRate: -1` and `hourlyRate: 'abc'` → `isMoneyRefusal`; read back still `150`.

- [ ] **Step 2: Implement**

Before `pool.connect()`: read `SELECT currency FROM projects WHERE id = $1`. For each resource, `""`, `null` or absent `hourlyRate` is normalised to `0` in the object that is serialised into `resources`; any other value goes through `amountError(r.hourlyRate, currency, `Hourly rate of "${r.role || ''}" on task "${t.name || ''}"`)` → refuse with `MONEY_RULE_CODE`.

- [ ] **Step 3: Run**

Run: `scripts/run-tests.sh` — Expected: MR-07, MR-08 pass, `all passed ✓`.

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/projects.js test-api.js
git commit -m "fix(api): project tasks PUT validates resource rates; a blank rate is saved as 0"
```

### Task 5: Roles and ratecard entries (M-05, M-07)

**Files:**
- Modify: `api/src/routes/config.js:223-235` (`POST /roles`), `:237-255` (`PATCH /roles/:id`), `:392-406` (`PATCH /ratecards/:id/entries`)
- Modify: `master-roles.html:318-319` (create sends `rateOverrides`, local push uses it)
- Modify: `test-api.js` (append to `testMoneyRules()`)

**Interfaces:**
- Consumes: `amountError`, `overridesError`, `MONEY_RULE_CODE` (Task 1); `testMoneyRules`, `isMoneyRefusal`, `mrRole` (Task 2).

- [ ] **Step 1: Write the integration checks**

Roles read with `GET /api/roles` (find by id); ratecard read with `GET /api/ratecards/:id` (`entries[].hourlyRate`, `entries[].rateOverrides`).
- MR-09: `POST /api/roles` `{ label, code, hourlyRate: 0, rateOverrides: { USD: 120 } }` → 201; read back `Number(hourly_rate) === 0` and `rate_overrides.USD === 120` (cleanup `later`).
- MR-10: `POST /api/roles` with `hourlyRate: -1`, then with `rateOverrides: { USD: 'x' }` → `isMoneyRefusal`; no role with that code in `GET /api/roles`.
- MR-11: `PATCH /api/roles/:id` (the MR-09 role) with `hourlyRate: '100'`, then `rateOverrides: [1]` → `isMoneyRefusal`; read back unchanged.
- MR-12: global ratecard (`POST /api/ratecards { name, clientId: null }`, cleanup `later`); `PATCH …/entries` `[{ roleId: mrRole.id, hourlyRate: 80, rateOverrides: {} }]` → 200. Then `[{ roleId: mrRole.id, hourlyRate: 90 }, { roleId: <MR-09 role id>, hourlyRate: -1 }]`, then `[{ roleId: mrRole.id }]` (absent rate), then `[{ roleId: mrRole.id, hourlyRate: 90, rateOverrides: { USD: 1.234 } }]` → each `isMoneyRefusal`; the `mrRole` entry still reads `80`.

- [ ] **Step 2: Implement**

`POST /roles`: destructure `rateOverrides`; `hourlyRate != null` → `amountError(hourlyRate, 'EUR', 'Hourly rate')`; `overridesError(rateOverrides, 'Rate overrides')`; refuse with `MONEY_RULE_CODE`. Insert `rate_overrides` as `JSON.stringify(rateOverrides ?? {})` and `hourlyRate ?? null`.
`PATCH /roles/:id`: the same two checks, only for fields present in the body (`hourlyRate !== undefined && hourlyRate !== null`, `rateOverrides !== undefined`), before building `fields`.
`PATCH /ratecards/:id/entries`: a first loop over all entries — `amountError(e?.hourlyRate, 'EUR', `Hourly rate of entry ${i + 1}`)` (absent is refused), `overridesError(e?.rateOverrides, `Rate overrides of entry ${i + 1}`)` — then the existing upsert loop unchanged.
`master-roles.html`: `Api.roles.create({ label, code, hourlyRate: rate, rateOverrides })` and `rateOverrides` (not `{}`) in the `this.roles.push`.

- [ ] **Step 3: Run**

Run: `scripts/run-tests.sh` — Expected: MR-09..MR-12 and the existing `Roles`/`Ratecards` sections pass, `all passed ✓`.
Run: `git diff --numstat master-roles.html` and `head -c 3 master-roles.html | od -An -tx1` — Expected: a few lines changed, first bytes not `ef bb bf`.

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/config.js master-roles.html test-api.js
git commit -m "fix(api): roles and ratecard entries validate rates; role create keeps its rate overrides (M-05, M-07)"
```

### Task 6: POT amounts

**Files:**
- Modify: `api/src/routes/pots.js:241-262` (`POST /`), `:375-392` (`PATCH /:id`)
- Modify: `test-api.js` (append to `testMoneyRules()`)

**Interfaces:**
- Consumes: `amountError`, `MONEY_RULE_CODE` (Task 1); `testMoneyRules`, `isMoneyRefusal` (Task 2).

- [ ] **Step 1: Write the integration checks**

A POT `{ specialLabel: '__test_mr_pot__', year: 2099, amount: 1000 }` → 201 (cleanup `later('DELETE', `/api/pots/${id}`)`); read back through `GET /api/pots?year=2099` (find by id) and `GET /api/pots/:id/history` (array).
- MR-13: `POST` with `amount: -5` and with `amount: 'abc'` (another `specialLabel`) → `isMoneyRefusal` (not 500).
- MR-14: `PATCH /api/pots/:id` `{ amount: 'abc', note: 'x' }` and `{ amount: 1.234, note: 'x' }` → `isMoneyRefusal`; amount still 1000 and the history length unchanged.

- [ ] **Step 2: Implement**

After the existing `amount == null` check in both routes: `amountError(amount, 'EUR', 'POT amount')` → refuse with `MONEY_RULE_CODE`. Replace every `parseFloat(amount)` with `amount`.

- [ ] **Step 3: Run**

Run: `scripts/run-tests.sh` — Expected: MR-13, MR-14 and the `POT Targets` sections pass, `all passed ✓`.
Run: `grep -n "parseFloat(amount)" api/src/routes/pots.js` — Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/pots.js test-api.js
git commit -m "fix(api): POT amounts refused with MONEY_RULE instead of a 500"
```

## Decisioni aperte

1. **The cost-grid autosave shows a `MONEY_RULE` refusal (Task 3).** Alternativa scartata: no client change, as the Spec §4 says. Perché: until cycle 2 a USD rate typed with three decimals is refused by the server, and `_cgUpsertVersionToApi` would only log it — the save would fail silently on every keystroke. The notice is the one `DATE_RULE` already uses; it costs a `?v=` bump on six pages.
2. **The structure's second body shape (`tasks[].roles[].rateOverride`) is left alone and tracked as B-186.** Alternativa scartata: validate it in Task 2. Perché: no client sends it (only `test-api.js`), and it is a finding the audit did not have (Scenario 3).
3. **Integration checks are written and run per task, not as one red run up front.** Alternativa scartata: write all MR checks first and run the suite red. Perché: each `scripts/run-tests.sh` run builds a whole stack; the module's red/green is in Task 1.
