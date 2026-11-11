# Backlog cycle 2 — server validation and integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the routes named by the spec answer 400/404/409 instead of 500 or a silent 200, repeated checks live in `api/src/lib/input-rules.js`, NUMERIC values reach every reader as numbers.

**Architecture:** one pure module (`input-rules.js`) consumed by the routes; per-route fixes move currency reads inside the existing locks; the rate card gets an optimistic `version` column; the phasing export's per-month arithmetic moves to a pure, tested function.

**Tech Stack:** Node.js/Express, `pg`, PostgreSQL 16, `node:test` (backend), vitest (frontend guards), `test-api.js` (integration, via `scripts/run-tests.sh`).

**Spec:** `docs/superpowers/specs/2026-11-11-backlog-c02-server-validation-integrity-design.md`
**Branch:** `backlog-c02-server-validation`
**Risk class:** high-risk — DB migration (`035`), money and currencies (`money-rules.js`, currency rates), shared file loaded by every page (`js/api.js`)

**Task independence:** Task 1 produces `isUuid`, which Tasks 2, 4, 5 and 6 import; after it, Tasks 2-8 touch disjoint route files and are independent of each other, but all of them append to `test-api.js`, so they run one at a time in order. Task 9 depends on all of them.

## Global Constraints

- All user-visible text in English.
- Error shape: `res.status(N).json({ error })`, plus `code` where the spec names one (`MONEY_RULE`, `RATECARD_STALE`).
- New 404s apply to admin and sysadmin; a non-admin on a nonexistent id keeps the `403` of `canEdit`.
- Every `js/api.js?v=N` reference moves to the same new `N` (today `14` → `15`).
- `master-clients.html` and `master-pipelines.html`: edit with the Edit tool only, never PowerShell `Set-Content` (BOM) or shell `sed -i` on CRLF-mixed files.
- Never `docker compose` against the main stack. Migration `035` is applied to the main DB only by `/finish-cycle` Gate 4.
- During tasks run only the touched test files: `cd api && node --test src/lib/<file>.test.js`, `npx vitest run <file>`; `test-api.js` changes are syntax-checked with `node --check test-api.js` and run once, in Task 9.
- New `test-api.js` checks go in one new function `testServerValidation()` (section `'Server validation (cycle 2)'`, IDs `SV-01`…), called from `main()` after `testRatecards()`, except where a task says to change an existing check.

## Review Focus

1. **B-193 changes the JSON type of every NUMERIC field** — a page that calls a string method (`.trim()`, `.replace(`, `.split(`, `.padStart(`) on `hourly_rate`, `rate_override`, `amount`, `current_rate`, `currency_rate`, `ptc`, `days`, `hours`, `budget`, `fee` would throw. Task 3 Step 5 sweeps for it.
2. **A refused rate card save must not look saved** — after a 409 the modal keeps its rows dirty (no `row.initial` / `row.stored` update) and shows the server message. Task 6 Step 7 pins it.
3. **Validation moved inside a transaction must ROLLBACK and release the client on every early return** — `PUT /api/projects/:id/tasks` and `PUT …/structure`. Tasks 4 and 5 assert that a valid request right after a refused one succeeds.
4. **Existing rate cards start at `version = 0`** — the first save after deploy from a freshly opened modal must succeed (`version: 0` sent and accepted). Task 6 SV case.
5. **`proposals` must not leak to non-admins** — `GET /api/pipeline-years` for a user has no `proposals` key. Task 7 SV case.

---

### Task 1: `input-rules.js` and the server UUID copies (B-010, B-212 UUID part)

**Files:**
- Create: `api/src/lib/input-rules.js`, `api/src/lib/input-rules.test.js`
- Modify: `api/src/routes/auth.js`, `api/src/routes/config.js`, `api/src/routes/cost-grids.js`, `api/src/routes/topics.js` (each: drop `const UUID_RE = …`, use `isUuid`), `api/src/routes/projects.js` (`POST /` and `PATCH /:id`: drop inline `uuidRe`)

**Interfaces:**
- Produces: `isUuid(v: any): boolean`; `decimalRangeError(n: any, { min: number, max: number, label: string }): string|null`; `SPECIAL_POT_LABELS: readonly string[]`; `specialLabelError(v: any): string|null`. CommonJS `module.exports`.

- [ ] **Step 1: Write the failing tests** in `input-rules.test.js` (`node:test` + `node:assert/strict`):
  - `isUuid`: `true` for `'123e4567-e89b-12d3-a456-426614174000'` and its upper-case form; `false` for `'123e4567-e89b-12d3-a456-42661417400'`, `'__unassigned__'`, `''`, `null`, `123`.
  - `decimalRangeError(x, { min: 0.000001, max: 9999.999999, label: 'Rate' })`: `null` for `0.000001`, `1.3`, `9999.999999`; the message `'Rate must be between 0.000001 and 9999.999999'` for `0.0000001`, `16500`, `NaN`, `Infinity`, `'1.2'`, `null`.
  - `SPECIAL_POT_LABELS` deep-equals `['Unassigned / To be Identified', 'New Biz']`; `specialLabelError` is `null` for both; `'specialLabel must be one of: Unassigned / To be Identified, New Biz'` for `'New Biz '`, `'new biz'`, `'Other'`, `42`.
- [ ] **Step 2: Run** `cd api && node --test src/lib/input-rules.test.js` — FAIL (module not found).
- [ ] **Step 3: Implement** the four exports. The message of `decimalRangeError` is `` `${label} must be between ${min} and ${max}` `` with each bound printed by `n => n.toFixed(6).replace(/\.?0+$/, '')` (so `0.000001`, not `1e-6`). Write this file with the Write tool, not via a shell (backslash escapes).
- [ ] **Step 4: Run** the same command — PASS.
- [ ] **Step 5: Replace the six server copies** with `const { isUuid } = require('../lib/input-rules');` and `isUuid(x)` in place of `UUID_RE.test(x)` / `uuidRe.test(x)`. Behaviour unchanged.
- [ ] **Step 6: Verify** `grep -rn "0-9a-f\]{8}" api/src/routes` → no output; `cd api && node --test src/**/*.test.js` → PASS.
- [ ] **Step 7: Commit** `feat(api): input-rules module; one isUuid for every route (B-010, B-212)`.

### Task 2: POTs and currency rates (B-042, B-236, B-334)

**Files:**
- Modify: `api/src/routes/pots.js` (`GET /summary`, `POST /`), `api/src/routes/currencies.js` (`POST /:code/activate`, `PATCH /:code/rate`)
- Test: `test-api.js` (`testServerValidation`)

**Interfaces:**
- Consumes: `isUuid`, `specialLabelError`, `decimalRangeError` from Task 1.

- [ ] **Step 1: Write the SV checks** in a new `testServerValidation()` (create it, with its `section(...)` line and its call in `main()`):
  - `SV-01` `GET /api/pots/summary?year=2026&clientId=not-a-uuid` → 400; `SV-02` same with `clientGroupId=not-a-uuid` → 400; `SV-03` `year=abc&clientId=<valid uuid>` → 400.
  - `SV-04` admin `POST /api/pots` `{ specialLabel: 'New Biz ', year: 2097, amount: 1 }` → 400, and `GET /api/pots?year=2097` (or the list route the POT tests already use) has no row with that label.
  - `SV-05` `POST /api/currencies/USD/rate`-style: `PATCH /api/currencies/<an active test currency>/rate` with `{ rate: 0.0000001 }` and `{ rate: 16500 }` → 400 each with error `'Rate must be between 0.000001 and 9999.999999'`; `GET /api/currencies` shows the rate unchanged. `SV-06` the same two values on `POST /api/currencies/<an inactive code>/activate` → 400 and the currency still inactive. Use the currencies `ensureTestCurrencies()` already sets up.
- [ ] **Step 2: Syntax check** `node --check test-api.js`.
- [ ] **Step 3: Implement.** `/summary`: after the existing required check, `Number.isInteger(Number(year))` else `400 { error: 'year must be an integer' }`; a present `clientId`/`clientGroupId` failing `isUuid` → `400 { error: 'clientId must be a valid UUID' }` / `'clientGroupId must be a valid UUID'`. `POST /`: a present `specialLabel` → `specialLabelError` → 400. Currencies: replace the `rate <= 0` check with `decimalRangeError(rate, { min: 0.000001, max: 9999.999999, label: 'Rate' })` → 400.
- [ ] **Step 4: Commit** `fix(api): pots and currency rates refuse malformed input with 400 (B-042, B-236, B-334)`.

### Task 3: money caps and NUMERIC parsing (B-223, B-193)

**Files:**
- Modify: `api/src/lib/money-rules.js` (`ptcRowsError`, `phasingError`), `api/src/lib/money-rules.test.js`, `api/src/db/client.js`
- Test: `test-api.js` (`testServerValidation`)

- [ ] **Step 1: Write the failing unit tests** in `money-rules.test.js`: `phasingError({ '2026-01': 100000000 }, 'EUR')` and `ptcRowsError([{ amount: 100000000 }], 'EUR')` → `null`; with `1000000000000` → a message containing `must not exceed 999999999999.99 EUR`.
- [ ] **Step 2: Run** `cd api && node --test src/lib/money-rules.test.js` — FAIL.
- [ ] **Step 3: Implement:** both functions use `MAX_NUMERIC_14_2`; other `MAX_DECIMAL_10_2` uses unchanged. Run again — PASS.
- [ ] **Step 4: Parser.** In `api/src/db/client.js`, before `new Pool`: `const { Pool, types } = require('pg'); types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));` with a one-line comment citing B-193. SV check `SV-07`: `GET /api/roles` → `typeof data[0].hourly_rate === 'number'` for a role with a rate; `SV-08`: `GET /api/pots/<a test pot id>/details` or `GET /api/pots?year=…` → `typeof amount === 'number'`. `node --check test-api.js`.
- [ ] **Step 5: Sweep for string methods on NUMERIC fields.** Run
  `grep -rnE "(hourly_rate|rate_override|current_rate|currency_rate|amount|ptc|days|hours|budget|fee)\)?\.(trim|replace|split|padStart|toUpperCase|slice)\(" --include=*.html --include=*.js . | grep -v node_modules | grep -v "\.test\."`
  and read every hit: if the value can come from a NUMERIC column, wrap it in `String(...)` at that site; list each hit and its verdict in the commit message body. No hit → say so in the body.
- [ ] **Step 6: Commit** `fix(api): NUMERIC parsed as numbers; project PTC/phasing capped at NUMERIC(14,2) (B-193, B-223)`.

### Task 4: project currency reads and 404s (B-189, B-191, B-192)

**Files:**
- Modify: `api/src/routes/projects.js` (`PUT /:id/tasks`, `PATCH /:id/phasing`, `PATCH /:id/ptc`)
- Test: `test-api.js` (`testServerValidation`)

**Interfaces:**
- Consumes: `isUuid` (Task 1).

- [ ] **Step 1: Write the SV checks** (admin cookie unless stated):
  - `SV-10` `PATCH /api/projects/<random valid uuid>/phasing` `{ phasing: { '2026-01': 10 } }` → 404 `{ error: 'Project not found' }`; `SV-11` same for `/ptc` with `{ ptc: [{ amount: 10 }] }`; `SV-12` `PUT /api/projects/<random uuid>/tasks` `[]` → 404.
  - `SV-13` `/api/projects/not-a-uuid/phasing` → 400.
  - `SV-14` on a test project (created the way the PR-* tests do, as sysadmin): `PUT …/tasks` with `[{ name: 'T', resources: [null] }]` → 400 `{ error: 'Task "T" has an empty resource entry.' }`; then a valid `PUT …/tasks` → 200 (pool not leaked); `SV-15` `PATCH …/phasing` with an invalid amount → 400 and `GET` of the project shows the phasing unchanged.
- [ ] **Step 2: Syntax check** `node --check test-api.js`.
- [ ] **Step 3: Implement.**
  - The three routes: id failing `isUuid` → `400 { error: 'Invalid project id' }` before `canEdit`.
  - `phasing`/`ptc`: one `pool.connect()` transaction; `SELECT currency FROM projects WHERE id = $1 FOR UPDATE`; no row → ROLLBACK + 404; amount check with that currency → ROLLBACK + 400 `MONEY_RULE`; `UPDATE`; COMMIT; `finally` release.
  - `tasks`: the non-object resource check (`r === null || typeof r !== 'object'`) runs with the sold-hours loop, before the transaction; the currency moves into the existing `SELECT start_date, end_date … FOR UPDATE` (add `currency`); no row → ROLLBACK + 404; the rate loop runs right after it, inside the transaction, ROLLBACK + 400 on error.
- [ ] **Step 4: Commit** `fix(api): project tasks/phasing/PTC read the currency under the row lock and answer 404 (B-189, B-191, B-192)`.

### Task 5: cost grid structure (B-189, B-192, B-229)

**Files:**
- Modify: `api/src/routes/cost-grids.js` (`PUT /:id/versions/:vId/structure`)
- Test: `test-api.js` (`testServerValidation`)

- [ ] **Step 1: Write the SV checks:**
  - `SV-20` `PUT /api/cost-grids/<test grid id>/versions/<random uuid>/structure` `{ phases: [], roles: [{ roleCode: 'X', rate: 10 }] }` → 404 `{ error: 'Version not found' }`; `SV-21` `…/versions/not-a-uuid/structure` → 400.
  - `SV-22` on a test version: `roles: [{ roleCode: <an existing role code>, rate: null, rateIsCustom: true }]` with one task using that role → 200; `GET …/structure` returns that task role with `rate_is_custom === false`. Then a valid structure PUT → 200.
- [ ] **Step 2: Syntax check** `node --check test-api.js`.
- [ ] **Step 3: Implement.** `:vId` failing `isUuid` → 400 `{ error: 'Invalid version id' }`. The pre-transaction query keeps only `locked` (404 when no row, 400 when locked). After `lockVersion`, `SELECT start_date, end_date, currency …` (one query); the three amount loops (role rates, task PTC, rate overrides) move there and use that currency, each ROLLBACK + 400 `MONEY_RULE`. `customByCode[r.roleCode] = r.rateIsCustom === true && r.rate != null`. The whole handler body sits in `try { … } catch (err) { next(err) }` if it does not already.
- [ ] **Step 4: Commit** `fix(api): structure PUT checks rates under the version lock, 404 on a missing version, no custom flag without a rate (B-189, B-192, B-229)`.

### Task 6: rate cards (B-207, B-209, B-212)

**Files:**
- Create: `api/src/db/migrations/035_ratecard_version.sql`
- Modify: `api/src/routes/config.js` (rate card routes), `js/api.js` (drop `clone`), every `*.html` referencing `js/api.js?v=14`, `master-clients.html` (`openClientRatecard`, `saveClientRatecard`), `docs/db/migrations.md`, `scripts/run-tests.sh` only if it does not already apply every migration file (check, do not assume)
- Test: `test-api.js` (`testRatecards` RC-02 and the entries checks, plus `testServerValidation`), `js/lib/master-clients-ratecard-guard.test.js`

**Interfaces:**
- Produces: `GET /api/ratecards[/:id]` rows carry `version: number`; `PATCH /api/ratecards/:id/entries` body `{ version: number, entries: Entry[] }` → `200 { ok: true, version }` | `409 { error, code: 'RATECARD_STALE' }`.

- [ ] **Step 1: Migration** `035_ratecard_version.sql`: `ALTER TABLE ratecards ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;` with a header comment (B-209); a `docs/db/migrations.md` entry in the file's existing format.
- [ ] **Step 2: Update/write the integration checks.**
  - RC-02 creates the rate card with the RC client (no `clientId: null`); every existing entries `PATCH` in `testRatecards` sends `{ version, entries }` reading `version` from the preceding GET/response.
  - `SV-30` `POST /api/ratecards { name }` → 400; `SV-31` with a random valid uuid as `clientId` → 400; `SV-32` `POST /api/ratecards/clone` → 404.
  - `SV-33` entries `PATCH` with a bare array → 409 `RATECARD_STALE`, entries unchanged; `SV-34` with `version: 0` on a fresh card → 200 `{ version: 1 }`; `SV-35` again with `version: 0` → 409, entries equal to those of SV-34; `SV-36` duplicate `roleId` → 400; `SV-37` an entry whose role was deleted (create a role, delete it) → 200 and that role absent from the card.
- [ ] **Step 3: Syntax check** `node --check test-api.js`.
- [ ] **Step 4: Implement the routes** (`config.js`): `POST /ratecards` requires `isUuid(clientId)` (400 `{ error: 'clientId is required' }`), maps 23503 to 400 `{ error: 'Client not found' }`, returns `version`; delete `POST /ratecards/clone`; GETs select `r.version`; entries `PATCH`: `Array.isArray(req.body)` → 409; `entries` array check; duplicate `roleId` → 400 `{ error: 'Entry N repeats a role' }`; under the existing `FOR UPDATE`, `SELECT id, version` and compare with `req.body.version` → 409; drop entries whose `roleId` is not in `SELECT id FROM roles WHERE id = ANY($1)`; one `INSERT … SELECT * FROM unnest($2::uuid[], $3::numeric[], $4::jsonb[]) … ON CONFLICT (ratecard_id, role_id) DO UPDATE`; `UPDATE ratecards SET version = version + 1 … RETURNING version`.
- [ ] **Step 5: `js/api.js`**: remove the `clone` line; `grep -rl "js/api.js?v=14" --include=*.html .` → bump each to `?v=15`; verify `grep -rhoE "js/api\.js\?v=[0-9]+" --include=*.html . | sort | uniq -c` prints one line.
- [ ] **Step 6: Guard tests** in `master-clients-ratecard-guard.test.js`: `saveClientRatecard` body contains `version:` in the `updateEntries` argument; it reads the response's `version`; the `row.initial`/`row.stored` refresh sits after the `await Api.ratecards.updateEntries` line inside the `try`, so a 409 (thrown by `apiFetch`) skips it. `npx vitest run js/lib/master-clients-ratecard-guard.test.js` — FAIL.
- [ ] **Step 7: `master-clients.html`**: `openClientRatecard` stores `state.version = rc.version ?? 0` (a newly created card: the POST response's `version`); `saveClientRatecard` calls `Api.ratecards.updateEntries(state.id, { version: state.version, entries: built.entries })` and sets `state.version` from the response; the existing `catch` shows `e.message` as the error (the server's 409 text). Keep the existing "no `this.rc.` after the first await" rule. Rerun the guard — PASS.
- [ ] **Step 8: Commit** `fix(ratecards): client required, clone removed, stale saves refused by version (B-207, B-209, B-212)`.

### Task 7: pipeline years with hidden proposals (B-297)

**Files:**
- Modify: `api/src/routes/pipeline-years.js` (`GET /`), `master-pipelines.html` (`deleteBlock`)
- Test: `test-api.js` (`testServerValidation`), `js/lib/master-data-guard.test.js`

- [ ] **Step 1: Write the checks.** `SV-40` admin `GET /api/pipeline-years` → every row has a numeric `proposals`; with a test year that has only one Draft version (create a grid as a user, version `pipeline_year` = that year, stage Draft), that row has `offers === 0` and `proposals === 1`; `SV-41` the same GET as a plain user has no `proposals` key. Guard in `master-data-guard.test.js`: `deleteBlock` contains `py.proposals > (py.offers || 0)` and the text `'proposals (Drafts and Canceled included) use this pipeline. Hide it instead.'`. `node --check test-api.js`; `npx vitest run js/lib/master-data-guard.test.js` — FAIL.
- [ ] **Step 2: Implement.** Admin branch only: `SELECT pipeline_year AS year, COUNT(DISTINCT cost_grid_id)::int AS proposals FROM cost_grid_versions WHERE pipeline_year IS NOT NULL GROUP BY pipeline_year`, merged as `proposals` (0 when absent). `deleteBlock`, after the `offers` branch: `if (py.proposals > (py.offers || 0)) return 'Not available: ' + py.proposals + ' proposals (Drafts and Canceled included) use this pipeline. Hide it instead.';`. Guard — PASS.
- [ ] **Step 3: Commit** `fix(pipelines): Delete shows the proposals the server counts, Drafts included (B-297)`.

### Task 8: phasing export hours and client-groups query (B-292, B-280)

**Files:**
- Create: `api/src/lib/phasing-export.js`, `api/src/lib/phasing-export.test.js`
- Modify: `api/src/routes/exports.js` (`GET /phasing`: `distribute` and the per-version month loop move to the lib), `api/src/routes/client-groups.js` (`GET /`)
- Test: `test-api.js` (`testServerValidation`)

**Interfaces:**
- Produces: `phasingByVersion(rows, year): Map<versionId, { name, versionLabel, pipeline, startDate, endDate, months: { [YYYY-MM]: { hours, amount } } }>` where `rows` are the export query's rows.

- [ ] **Step 1: Write the failing unit test**: one row `{ version_id: 'v', days: 120, task_start: '20260101', task_end: '20260331', hourly_rate: '50', … }`, year 2026 → `months['2026-01']` deep-equals `{ hours: 40, amount: 2000 }`; a row with no task dates falls back to the version dates; a row with neither yields no months.
- [ ] **Step 2: Run** `cd api && node --test src/lib/phasing-export.test.js` — FAIL.
- [ ] **Step 3: Implement** by moving `distribute` and the map-building loop out of `exports.js` unchanged except `hrs = d` (was `d * 8`); `exports.js` calls `phasingByVersion(rows, yr)`. Run — PASS.
- [ ] **Step 4: client-groups**: build the SQL with the `pots` subquery only when `isAdmin`; the non-admin branch selects no `pots` and the JS stripping goes. `SV-45` plain user `GET /api/client-groups` → no row has `pots`; admin → every row has an array `pots`. `node --check test-api.js`.
- [ ] **Step 5: Commit** `fix(api): phasing export hours are the stored hours; pots subquery only for admins (B-292, B-280)`.

### Task 9: integration run and backlog rows

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Run** `scripts/run-tests.sh` once (worktree has `.env` copied and `npm ci` in root and `api/`). Expected: 0 failures. A red SV/RC check is fixed in the task's file it belongs to, then this step reruns.
- [ ] **Step 2: Add two `docs/BACKLOG.md` rows** (next free IDs, existing column format, source `backlog-c02-server-validation` brainstorming): the client copies of `UUID_RE` (`js/api-sync.js`, `js/lib/costgrid-calc.js`), evidence `grep -rln "0-9a-f\]{8}" js/ | grep -v test`; `/api/reporting/pipeline` and `/api/reporting/portfolio` compute the budget with `tr.days * 8` and have no caller, evidence `grep -n "tr.days \* 8" api/src/routes/reporting.js` and `grep -rn "reporting.pipeline\|reporting.portfolio" --include=*.html .` → no hit.
- [ ] **Step 3: Commit** `docs(backlog): two findings from cycle 2 brainstorming`.

The closing of B-010, B-042, B-189, B-191, B-192, B-193, B-207, B-209, B-212, B-223, B-229, B-236, B-280, B-292, B-297, B-334 is written by `/finish-cycle` Gate 5 (`/sync-docs`), not here; B-378 stays open.

## Criteri di accettazione

Defined by the Spec (`## Criteri di accettazione`).

## Decisioni aperte

1. **The phasing export's month arithmetic moves to `api/src/lib/phasing-export.js`.** Alternativa scartata: an integration check that parses the XLS. Perché: the `test` container has no `xlsx`, and adding it would change `docker-compose.yml`.
2. **Integration checks run once, in Task 9.** Alternativa scartata: `scripts/run-tests.sh` per task. Perché: PROCESS.md §6.2 allows it only for the task whose product is the check, and every task here adds some.
