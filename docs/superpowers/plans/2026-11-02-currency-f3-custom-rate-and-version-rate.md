# Currency f3 — persisted Custom rates and the version rate in the editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a saved version is never re-priced by itself: the Custom flag of a role rate survives save/reload (`task_roles.rate_is_custom`), the editor syncs rates to the baseline only on an explicit ratecard change, and the editor adopts the rate the server applied on a currency change (B-195 + F-01, B-213, B-215).

**Architecture:** one column and three SQL touch points in `api/src/routes/cost-grids.js`; `js/api-sync.js` reads the flag instead of inferring it from `rate_override`; `js/costgrid.js`'s `cgUpdateActiveRatecardMap` syncs only on `{ syncRates: true }`; `_cgUpsertVersionToApi` hands the `PATCH` response's `currency_rate` to a callback that `cgAutoSave` supplies.

**Tech Stack:** Node/Express + `pg`, PostgreSQL migration applied by hand, Vue 3 via CDN (no build), classic scripts tested by cutting functions out with `scripts/lib/extract-source.mjs` (vitest + jsdom), `test-api.js` integration profile via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-11-02-currency-f3-custom-rate-and-version-rate-design.md`
**Branch:** `currency-f3-custom-rate-version-rate`
**Risk class:** high-risk — DB migration, money/currencies, and shared files loaded by several pages (`js/api-sync.js`, `js/costgrid.js`, `js/lib/costgrid-calc.js`)

## Global Constraints

- §1 of the Spec is the rule: role rates change only on a ratecard change (non-Custom roles), a currency change (all roles, Custom included), or a single-role reset. Nothing else re-prices.
- Custom keeps its definition: `onRateBlur` sets `role.rateIsCustom = v !== baseline` — not changed.
- Only the literal `true` is Custom, on the server (`r.rateIsCustom === true`) and on load (`(tr.rate_is_custom ?? tr.rateIsCustom) === true`).
- `rate_override` stays the snapshot of every role's rate; `/budgets`, `api/src/lib/pot-fee-sql.js`, `exports.js`, `reporting.js` are not touched. No backfill.
- Never run `docker compose` against the main stack; the migration is proven on `scripts/run-tests.sh`'s disposable stack only (CLAUDE.md "Infrastructure safety"). A fresh worktree needs `.env` copied from the main checkout before `run-tests.sh` (never commit it).
- HTML files: edit with the Edit tool only, never PowerShell `Get-Content`/`Set-Content` (BOM).
- User-visible text in English.
- New finding during execution: not fixed here — a `docs/BACKLOG.md` row.

## Review Focus

1. **A normal save (server rate equal to the draft's) must not call `onServerRate`** — otherwise every autosave schedules another autosave forever. Pinned in Task 5 (`equal rate → no callback`).
2. **The `PATCH` comes back after the user switched version** — the adopted rate must not land on the other version's draft. Pinned in Task 5 (`cgAdoptServerRate` with another active version).
3. **A client change that leaves the ratecard valid must not re-price.** Pinned in Task 3 (`refreshRatecards` valid case → `{ syncRates: false }`).
4. **`rateIsCustom` sent as `'true'`, `1` or absent** is stored `false`. Pinned in Task 1 (RC-02).
5. **A version with a role whose `rate_override` is NULL** (saved with `rate: null`) and roles already in memory keeps the in-memory roles; with no roles in memory it rebuilds them. Pinned in Task 2.

## Task independence

Tasks are **not** independent: Tasks 3, 4 and 5 all edit `costgrid.html`, Tasks 3 and 5 both edit `js/costgrid.js`, Tasks 2 and 5 both edit `js/api-sync.js`. Run them in order 1 → 7. Task 1 (server) and Task 6 (`pipeline.html` copy) touch no file another task touches; Task 7 (cache-busting, docs, backlog) runs last.

---

### Task 1: migration 031 and the server round-trip of `rate_is_custom`

**Files:**
- Create: `api/src/db/migrations/031_task_role_rate_is_custom.sql`
- Modify: `api/src/routes/cost-grids.js` — duplicate copy (~line 590), structure `GET` `SELECT` (~656), structure `PUT` `rateByCode` (~745), hours branch (~857), `tk.roles` branch (~866), `INSERT` (~869)
- Modify: `test-api.js` — new `testRateIsCustom()`, registered right after `await testMoneyRules();` (~line 3803)
- Modify: `ARCHITECTURE.md` — `task_roles` block (~line 437)
- Modify: `docs/db/migrations.md` — row for `031`

**Interfaces:**
- Produces: structure `GET` role rows carry `rate_is_custom: boolean`.
- Produces: structure `PUT` reads `roles[].rateIsCustom` (hours shape, via `customByCode[r.roleCode] = r.rateIsCustom === true`) and `phases[].tasks[].roles[].rateIsCustom` (array shape, `tr.rateIsCustom === true`); every `task_roles` `INSERT` writes `rate_is_custom`.
- Produces: `POST /:id/versions/:vId/duplicate` copies `rate_is_custom`.

- [ ] **Step 1: Write the migration** — exactly the Spec §2 statement, with a 3-line header comment in the style of `029` (cycle, meaning, "Idempotent. Applied by hand.").

- [ ] **Step 2: Write the failing integration test** `testRateIsCustom()` in `test-api.js` (section `'Custom rate flag (f3)'`): two roles via `makeTestRole('RCA')`/`makeTestRole('RCB')`, a proposal (`later('POST', '/api/admin/reset/cost-grid/${cgId}')`), an EUR version. Helper `flags(vId)` = map `code → rate_is_custom` from the structure `GET`'s first task.
  - `RC-01` hours shape `PUT` with `hours: { [A]: 2, [B]: 3 }`, `roles: [{ roleCode: A, rate: 150, rateIsCustom: true }, { roleCode: B, rate: 80, rateIsCustom: false }]` → 200; `flags` = `{ A: true, B: false }`.
  - `RC-02` same `PUT` with A `rateIsCustom: 'true'` and B `rateIsCustom: 1`, then once with the field absent → every flag `false`.
  - `RC-03` re-`PUT` RC-01's body, `POST .../duplicate { label: 'copy' }` → 201; the copy's `flags` = `{ A: true, B: false }`.
  - `RC-04` array shape `phases: [{ title: 'P1', tasks: [{ title: 'T1', roles: [{ roleId: A.id, days: 2, rateOverride: 90, rateIsCustom: true }, { roleId: B.id, days: 1 }] }] }]` → `{ A: true, B: false }`.

- [ ] **Step 3: Implement** the Interfaces above in `cost-grids.js`; the duplicate copy becomes `INSERT INTO task_roles (task_id, role_id, days, rate_override, months, rate_is_custom) SELECT $1, role_id, days, rate_override, months, rate_is_custom FROM task_roles WHERE task_id = $2`.

- [ ] **Step 4: Document the column** — `ARCHITECTURE.md` `task_roles` block gains `rate_is_custom BOOLEAN NOT NULL DEFAULT false, -- migration 031: the rate was written by hand (Custom)`; `docs/db/migrations.md` gains the `031` row (currency f3: the column, no backfill, existing rows start non-Custom; idempotent; applied by `/finish-cycle` Gate 4 on the main stack, by hand on a `scripts/test-branch.sh up` stack).

- [ ] **Step 5: Run** `npx vitest run scripts/architecture-guard.test.js` → PASS; `bash scripts/run-tests.sh` → `RC-01`..`RC-04` PASS, no new failures (the migration is applied by the script).

- [ ] **Step 6: Commit** — `git add api/src/db/migrations/031_task_role_rate_is_custom.sql api/src/routes/cost-grids.js test-api.js ARCHITECTURE.md docs/db/migrations.md` — `feat(currency-f3): persist task_roles.rate_is_custom (B-195)`.

### Task 2: load the flag in `cgLoadStructureFromApi`

**Files:**
- Modify: `js/api-sync.js` (`cgLoadStructureFromApi`, ~lines 103-137)
- Test: `js/lib/api-sync-upsert.test.js` (new `describe`)

**Interfaces:**
- Consumes: `rate_is_custom` from Task 1's structure `GET`.
- Produces: `ver.roles[].rateIsCustom` = `(tr.rate_is_custom ?? tr.rateIsCustom) === true`; `ver.roles` is rebuilt when every role has a non-null `rate_override` (or `ver.roles` is empty).

- [ ] **Step 1: Write the failing tests** — `describe('cgLoadStructureFromApi — Custom flag (f3)')`, building the loader as the existing "successful structure reload" test does (`Api` stub returning one phase, one task, `roles` rows):
  - `reloads rateIsCustom from the flag, not from rate_override` — rows `{ code: 'PM', rate_override: '100.00', rate_is_custom: false, days: 2 }`, `{ code: 'DEV', rate_override: '90.00', rate_is_custom: true, days: 1 }`, `ver.roles = []` → `ver.roles` = `[{ roleCode: 'PM', rate: 100, rateIsCustom: false, … }, { roleCode: 'DEV', rate: 90, rateIsCustom: true, … }]` (use `toMatchObject`).
  - `a missing flag is not Custom` — row without `rate_is_custom` → `rateIsCustom: false`.
  - `rebuilds stale in-memory roles when every role has rate_override` — `ver.roles = [{ roleCode: 'PM', rate: 50, rateIsCustom: true }]`, row PM `rate_override: '100.00', rate_is_custom: false` → `{ rate: 100, rateIsCustom: false }`.
  - `keeps in-memory roles when a role has no rate_override` — row PM `rate_override: null, hourly_rate: '100'`, `ver.roles = [{ roleCode: 'PM', rate: 120, rateIsCustom: false }]` → unchanged; same row with `ver.roles = []` → rebuilt with rate 100.

- [ ] **Step 2: Run** `npx vitest run js/lib/api-sync-upsert.test.js` → the first test FAILS (`rateIsCustom` true on PM).

- [ ] **Step 3: Implement** — `rolesMap` stores `{ label, rate, isCustom, hasOverride: override != null }`; the rebuild condition reads `hasOverride`; rewrite the comment above it to say: rebuilt when every role carries its saved rate (`rate_override`), Custom comes from `rate_is_custom`.

- [ ] **Step 4: Run** `npx vitest run js/lib/api-sync-upsert.test.js` → PASS.

- [ ] **Step 5: Commit** — `feat(currency-f3): reload the Custom flag from rate_is_custom (B-195)`.

### Task 3: no silent re-pricing — `cgUpdateActiveRatecardMap({ syncRates })`

**Files:**
- Modify: `js/costgrid.js` (`cgUpdateActiveRatecardMap`, ~line 329)
- Modify: `costgrid.html` — `openRoleModal` (~1258), `openVersion` (~1363, and its comment), `onRatecardChange` (~1550), `refreshRatecards` (~1557)
- Test: create `js/lib/costgrid-rate-sync.test.js`

**Interfaces:**
- Produces: `async function cgUpdateActiveRatecardMap({ syncRates = false } = {})` — always loads the three ratecard globals; calls `cgSyncRoleRatesToBaseline()` only when `syncRates === true`.
- Callers (Spec §5 table): `openVersion` and `openRoleModal` → `cgUpdateActiveRatecardMap()`; `onRatecardChange` → `cgUpdateActiveRatecardMap({ syncRates: true })`; `refreshRatecards` → `cgUpdateActiveRatecardMap({ syncRates: cleared })` where `cleared` is true only when it just set `draft.ratecardId = null`.

- [ ] **Step 1: Write the failing tests** in the new file. Build `cgUpdateActiveRatecardMap` and `cgSyncRoleRatesToBaseline` in **one** `new Function` (so the assignments to `_cgActiveRatecardMap`/`_cgActiveRatecardOverrides`/`_cgIsClientRatecard` reach the sync), declaring those three as `let` inside the source, with stubs `_cgDraft`, `getRoles` → `[{ id: 1, code: 'PM', rate: 100, rateOverrides: {} }, { id: 2, code: 'DEV', rate: 80, rateOverrides: {} }]`, `loadRatecardsForDropdown` → `[{ id: 7, client_id: null, entries: [{ role_id: 1, hourly_rate: 150 }, { role_id: 2, hourly_rate: 120 }] }]`, real `cgRatecardMaps` and `resolveRoleRate` from `./costgrid-calc.js`. Draft: `{ currency: 'EUR', currencyRate: 1, ratecardId: 7, roles: [{ roleCode: 'PM', rate: 100, rateIsCustom: false }, { roleCode: 'DEV', rate: 95, rateIsCustom: true }] }`.
  - `opening leaves saved rates as they are` — `await fn()` → PM 100, DEV 95.
  - `syncRates realigns non-Custom roles and keeps Custom` — `await fn({ syncRates: true })` → PM 150, DEV 95.
  - Callers (static, `extractBlock` on `costgrid.html`): `async openVersion(` and `async openRoleModal(` contain `cgUpdateActiveRatecardMap()` and not `syncRates`; `async onRatecardChange(` contains `cgUpdateActiveRatecardMap({ syncRates: true })`; `costgrid.html` has exactly 4 occurrences of `cgUpdateActiveRatecardMap(`.
  - `refreshRatecards` (run against stubs, `cgUpdateActiveRatecardMap = vi.fn()`, `$forceUpdate` spy): `draft { clientId: 'c1', ratecardId: 9 }`, `allRatecards [{ id: 9, client_id: 'c2' }]` → `draft.ratecardId === null`, called with `{ syncRates: true }`; `allRatecards [{ id: 9, client_id: 'c1' }]` → `ratecardId` 9, called with `{ syncRates: false }`.

- [ ] **Step 2: Run** `npx vitest run js/lib/costgrid-rate-sync.test.js` → FAIL (PM becomes 150 on open; caller assertions fail).

- [ ] **Step 3: Implement** the Interfaces; update the inline comments that say the call "may mutate"/"mutates `_cgDraft.roles[].rate`" so they match (open: loads the maps only; ratecard change: re-prices non-Custom roles).

- [ ] **Step 4: Run** `npx vitest run js/lib/costgrid-rate-sync.test.js js/lib/costgrid-version-rate.test.js` → PASS.

- [ ] **Step 5: Commit** — `feat(currency-f3): sync role rates only on an explicit ratecard change (F-01)`.

### Task 4: `cgRateIsMissing(role)` (B-195)

**Files:**
- Modify: `js/lib/costgrid-calc.js` (~lines 122-125, comment and signature)
- Modify: `costgrid.html` (lines ~334, 342, 353, 356)
- Test: `js/lib/costgrid-calc.test.js` (`describe('cgRateIsMissing')`), `js/lib/costgrid-rate-input-guard.test.js` (~lines 26-33)

**Interfaces:**
- Produces: `cgRateIsMissing(role) → boolean` = `!(role.rate > 0) && !role.rateIsCustom`.

- [ ] **Step 1: Rewrite the tests** — `costgrid-calc.test.js`: `{ rate: 0, rateIsCustom: false }` → true; `{ rate: 0, rateIsCustom: true }` → false; `{ rate: 120, rateIsCustom: false }` → false; `{ rate: undefined }` → true (drop every baseline argument). Guard: every `cgRateIsMissing(...)` call in `costgrid.html` (`/cgRateIsMissing\([^)]*\)/g`) is exactly `cgRateIsMissing(r)`.

- [ ] **Step 2: Run** `npx vitest run js/lib/costgrid-calc.test.js js/lib/costgrid-rate-input-guard.test.js` → FAIL.

- [ ] **Step 3: Implement**; the new one-line comment says a 0 is missing unless written by hand (Custom). Replace the four calls in `costgrid.html` with `cgRateIsMissing(r)`.

- [ ] **Step 4: Run** the same command → PASS.

- [ ] **Step 5: Commit** — `fix(currency-f3): a custom 0 is never a missing rate (B-195)`.

### Task 5: editor and DB on the same rate (B-213)

**Files:**
- Modify: `js/api-sync.js` (`_cgUpsertVersionToApi`, the `PATCH` try block ~line 212, and its header comment)
- Modify: `js/costgrid.js` (`cgAutoSave` ~687; new `_cgCurrencyChangePending`, `cgMarkCurrencyChange`, `cgAdoptServerRate` next to it)
- Modify: `costgrid.html` (`onCurrencyChange`, confirm handler ~1955)
- Test: `js/lib/api-sync-upsert.test.js`, `js/lib/costgrid-rate-sync.test.js`, `js/lib/costgrid-currency-change.test.js`

**Interfaces:**
- Produces: `_cgUpsertVersionToApi(cgId, versionId, { strict, onServerRate })` — after a successful `PATCH`, with `const r = parseFloat(resp?.currency_rate)`, calls `onServerRate(r)` when `Number.isFinite(r)` and `r !== (parseFloat(meta.currencyRate) || 1)`.
- Produces: `let _cgCurrencyChangePending = false;` and `function cgMarkCurrencyChange()` (sets it true).
- Produces: `function cgAdoptServerRate(cgId, versionId, rate, afterCurrencyChange)` — sets `currencyRate = rate` on the stored version (`cgLoad`/`cgSave`); when `_cgActiveCgId === cgId && _cgActiveVersionId === versionId && _cgDraft`, sets `_cgDraft.currencyRate = rate` and, if `afterCurrencyChange`, calls `cgSyncRoleRatesToBaseline()` and `cgScheduleAutoSave()`; then `renderCgEditor()`.
- Produces: `cgAutoSave(strict)` reads and clears `_cgCurrencyChangePending` at call time, and passes `{ strict: !!strict, onServerRate: rate => cgAdoptServerRate(cgId, verId, rate, afterCurrencyChange) }` with the ids captured at call time.
- `onCurrencyChange`'s confirm handler calls `cgMarkCurrencyChange()` right before `cgAutoSave()`; the no-roles branch and Cancel do not.

- [ ] **Step 1: Write the failing tests.**
  - `api-sync-upsert.test.js`, `describe('onServerRate (f3, B-213)')` — give `build()` an optional third parameter `meta = {}` spread into the version; version `currency: 'USD', currencyRate: 1.1`. `update` resolves `{ currency_rate: '1.200000' }` → callback called once with `1.2`; resolves `{ currency_rate: '1.100000' }` → not called; resolves `undefined` → not called; rejects → not called and the result is `false`.
  - `costgrid-rate-sync.test.js`, `describe('cgAdoptServerRate')` — real `cgSyncRoleRatesToBaseline`, `renderCgEditor`/`cgScheduleAutoSave` spies, an in-memory store for `cgLoad`/`cgSave`; draft `{ currency: 'USD', currencyRate: 1.1, roles: [{ roleCode: 'PM', rate: 110, rateIsCustom: false }, { roleCode: 'DEV', rate: 95, rateIsCustom: true }] }`, `getRoles` PM 100:
    - after a currency change: `adopt('cg1', 'v1', 1.2, true)` → draft rate 1.2, PM 120, DEV 95, stored version rate 1.2, `cgScheduleAutoSave` once.
    - otherwise: `adopt('cg1', 'v1', 1.2, false)` → draft rate 1.2, PM 110, no autosave scheduled.
    - another version active (`_cgActiveVersionId = 'v2'`) → draft unchanged, stored `v1` rate 1.2.
  - same file, `describe('cgAutoSave passes the currency-change flag')` — `_cgUpsertVersionToApi` stub capturing `opts`, `cgAdoptServerRate` spy: `cgMarkCurrencyChange(); cgAutoSave(); opts.onServerRate(1.2)` → spy called with `('cg1', 'v1', 1.2, true)`; a second `cgAutoSave()` then `onServerRate(1.2)` → `false`; `cgAutoSave(true)` passes `strict: true`.
  - `costgrid-currency-change.test.js` — add a `cgMarkCurrencyChange` spy to the stubs; confirm → called once, before `cgAutoSave` (record order); Cancel and the no-roles branch → not called.

- [ ] **Step 2: Run** `npx vitest run js/lib/api-sync-upsert.test.js js/lib/costgrid-rate-sync.test.js js/lib/costgrid-currency-change.test.js` → FAIL.

- [ ] **Step 3: Implement** the Interfaces. One header-comment line on `_cgUpsertVersionToApi` for `opts.onServerRate`; one comment on `cgAdoptServerRate` citing Spec §8 (rates re-synced only after a currency change).

- [ ] **Step 4: Run** the Step 2 command plus `npx vitest run js/lib/costgrid-autosave-toast.test.js js/lib/costgrid-version-rate.test.js` → PASS.

- [ ] **Step 5: Commit** — `feat(currency-f3): adopt the version rate the server applied (B-213)`.

### Task 6: refresh-rate confirmation copy (B-215)

**Files:**
- Modify: `pipeline.html` (`confirmRefreshRate`, ~line 975)
- Test: `js/lib/costgrid-version-rate.test.js` (last `describe` and its comment)

- [ ] **Step 1: Update the test** — `expect(shown[0][0]).toContain('Budget amounts and role rates remain in USD. Only the EUR equivalent changes. In the editor, a change of ratecard or a rate reset uses the new rate.')`, `not.toContain('reset to')`, `not.toContain('recalculated')`; its comment says saved rates are never re-priced by a rate refresh (Spec §1).

- [ ] **Step 2: Run** `npx vitest run js/lib/costgrid-version-rate.test.js` → FAIL.

- [ ] **Step 3: Implement** — replace the confirmation's last sentence with the Spec §7 text verbatim (with `${cur}`).

- [ ] **Step 4: Run** the same command → PASS.

- [ ] **Step 5: Commit** — `fix(currency-f3): refresh-rate confirmation describes what changes (B-215)`.

### Task 7: cache-busting, docs, backlog, full suite

**Files:**
- Modify: every `?v=` reference — `js/costgrid.js?v=54` → `55` (`costgrid.html`, `pipeline.html`); `js/api-sync.js?v=30` → `31` (`costgrid.html`, `pipeline.html`, `planning.html`, `portfolio.html`, `program.html`, `project-config.html`); `js/lib/costgrid-calc.js?v=14` → `15` (`costgrid.html`, `pipeline.html`)
- Modify: `docs/pages/costgrid.md`, `docs/js/costgrid.md`, `docs/js/api-sync.md`, `docs/BACKLOG.md`

- [ ] **Step 1: Bump** the references. Check: `grep -rn "costgrid.js?v=\|api-sync.js?v=\|costgrid-calc.js?v=" --include=*.html --include=*.js . | grep -v node_modules` → only `v=55`, `v=31`, `v=15`; `grep -rn "costgrid.js?v=54\|api-sync.js?v=30\|costgrid-calc.js?v=14" js/lib scripts` → nothing.

- [ ] **Step 2: Docs** (CLAUDE.md "Writing documentation" rules): the Spec §1 rule and "sync only on an explicit ratecard change" in `docs/pages/costgrid.md` (current-state section, not a cycle narrative), `cgUpdateActiveRatecardMap({ syncRates })`, `cgMarkCurrencyChange`, `cgAdoptServerRate` in `docs/js/costgrid.md`, the flag on load and `opts.onServerRate` in `docs/js/api-sync.md`. Remove any sentence saying a reloaded version marks every role Custom.

- [ ] **Step 3: Backlog** — close B-195 (citing F-01 of `docs/superpowers/audits/2026-11-01-currency-c1-c4-cold-review.md`), B-213, B-215: State `closed 2026-11-02 by branch currency-f3-custom-rate-version-rate`; Verified how, each re-run with its output: B-195 `grep -n "const isCustom = override != null" js/api-sync.js` → no match; B-213 `grep -n "onServerRate" js/api-sync.js js/costgrid.js` → the two sites; B-215 `grep -n "reset to" pipeline.html` → no match.

- [ ] **Step 4: Full suite** — `npm test` → PASS; from `api/`: `node --test src/**/*.test.js` → PASS (if `api/node_modules` is missing, read-only `docker exec pdash-api node --test src/...` is allowed); `bash scripts/run-tests.sh` → PASS.

- [ ] **Step 5: Commit** — `chore(currency-f3): cache-busting, docs, backlog closures`.

Acceptance criterion 10 (browser) is verified at `/finish-cycle` Gate 2 on the branch stack, after applying `031` to it by hand (`scripts/test-branch.sh up` skips migrations).

## Decisioni aperte

1. **Il flag del cambio di valuta lo legge e lo azzera `cgAutoSave` al momento della chiamata, e lo passa al callback in una closure.** Alternativa scartata: un flag globale letto e azzerato dal callback. Perché: lega il flag al salvataggio che segue il cambio di valuta; un salvataggio successivo in volo non lo eredita.
2. **`cgAdoptServerRate` aggiorna `_cgDraft` solo se la versione attiva è ancora quella salvata; lo store si aggiorna sempre.** Alternativa scartata: scrivere su `_cgDraft` senza controllo. Perché: la risposta del `PATCH` può arrivare dopo un cambio di versione.
3. **Il ramo senza ruoli di `onCurrencyChange` non segna il cambio di valuta.** Alternativa scartata: segnarlo anche lì. Perché: senza ruoli la sincronizzazione non ha niente da riallineare e la Spec lega il flag alla conferma.
4. **I test di integrazione stanno in una funzione nuova, `testRateIsCustom` (RC-01..RC-04), che copre anche "+ New version".** Alternativa scartata: estendere `testVersionDuplicate`. Perché: le due forme del body e la copia del flag si leggono in un posto solo.
5. **La migrazione si prova solo sullo stack usa-e-getta di `run-tests.sh`; sui dati reali la applica il Gate 4.** Alternativa scartata: provarla a mano su `pdash-db` durante l'esecuzione. Perché: CLAUDE.md, "Infrastructure safety", vieta di toccare lo stack principale fuori dal Gate 4.
