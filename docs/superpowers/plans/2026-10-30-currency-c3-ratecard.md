# Currency cycle 3 — the client rate card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** in the client rate card, an empty EUR field means "agency default" (`NULL`), a cleared role loses its entry, every rate field is a text input formatted and read in its column's currency through `js/lib/money.js`, and the dead editor of `js/ratecards.js` is gone.

**Architecture:** one migration makes `ratecard_entries.hourly_rate` nullable. `PATCH /api/ratecards/:id/entries` becomes a full replacement in a transaction, validated by a new pure `ratecardEntryError` in `api/src/lib/money-rules.js`. `js/costgrid.js` reads entries through a new pure `cgRatecardMaps` in `js/lib/costgrid-calc.js`. The `master-clients.html` modal moves into `#app` as a Vue template using the cycle 2 money-input technique.

**Tech Stack:** Express + `pg`, PostgreSQL 16, `node:test`, Vue 3 via CDN (no build), vitest + jsdom, `test-api.js` via `scripts/run-tests.sh`, `scripts/shoot.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-30-currency-c3-ratecard-design.md`
**Branch:** `currency-c3-ratecard`
**Risk class:** high-risk — migrazione DB, money o valute (PROCESS.md §6.1b)

**Task dependencies:** sequential. Task 1 (migration + server) comes first: Task 3's save sends `hourlyRate: null`, which only Task 1 accepts. Task 2 is independent of Task 1. Task 3 uses Task 2's semantics only implicitly (none of its code). Task 4 comes last, because its guard change passes only after Task 3. The tasks are **not** declared independent.

## Global Constraints

- `NULL` `hourly_rate` = "no client EUR rate, the agency default applies". `0` is a rate, stored as 0 (cycle 1, M-04).
- Refusal shape, exactly: `400 { error, code: 'MONEY_RULE' }`, with no write. Message for an empty entry: `` `${label} has neither a rate nor a currency override.` ``
- Form error copy, exactly: `` `Enter a valid amount in ${code}, e.g. ${moneyFormatExample(code, currencies)}.` ``
- Placeholder copy: `` `${formatMoney(default, code, currencies)} (agency)` ``, or `agency default` when the role has none.
- "Agency default" = `roles.hourly_rate` for EUR, `roles.rate_overrides[code]` for other columns. Never a client-less rate card.
- `?v=N`: `js/lib/costgrid-calc.js` `?v=11` → `?v=12` (`costgrid.html`, `pipeline.html`). `js/ratecards.js` has no `?v=` today (`costgrid.html:772`), so leave it unversioned. Check with `grep -rn "costgrid-calc.js?v=\|ratecards.js" --include=*.html --include=*.js . | grep -v node_modules`.
- `master-clients.html` guards that must stay green: `js/lib/master-data-guard.test.js` (keeps `id="clientRcModal"`, `window.__cfgApp`, `window.__currencies = await Api.currencies.active()`, `this.roles    = roles.map(`, and the `.md-layout > .md-content` structure), and `js/lib/content-surface-guard.test.js` (the inline `<style>` contents are hashed, so add no inline `<style>` and use existing classes or `style=` attributes).
- All user-facing text in English. Edit HTML with the Edit tool, never PowerShell `Set-Content` (BOM).
- Migration `api/src/db/migrations/029_ratecard_entry_rate_nullable.sql`, applied by hand. A branch stack from `scripts/test-branch.sh up` does not get it: apply it there by hand with `docker exec -i <branch db container> psql -U pdash -d pdash < …`. `scripts/run-tests.sh` builds its schema from every migration.
- No Docker lifecycle command against the main stack. Copy `.env` from the main checkout into the worktree, and never commit it.
- Out of scope: `POST /api/ratecards` without a client and `/ratecards/clone` (BACKLOG line in Task 4), `DECIMAL(10,2)`, the other pages, B-183.

## Review Focus

1. **Reopening a saved override-only role:** the EUR field must reopen empty, not as `0` or `NaN` — Task 1, test-api check `RC-07` (`hourlyRate === null`), plus Task 3 manual step 3.
2. **Saving the modal twice without touching anything:** must not change any entry (a stored `0` must reopen as `0`, a stored `107.5` round-trips) — Task 3, manual step 3.
3. **A role deleted while its entry exists:** the replacement must not fail on a stale `roleId` in the body (FK) — the form only sends the roles it lists, and `ON DELETE CASCADE` already removed the entry. Task 1, test `RC-10` sends a well-formed body built only from listed roles.
4. **Invalid text in one column, valid in others:** the save is refused as a whole and nothing is written — Task 3, manual step 4.
5. **A JPY column:** it shows and accepts no decimals — Task 3, manual step 2 (only if a JPY currency is active; otherwise skipped and reported).

---

### Task 1: Nullable EUR rate and full-replacement `PATCH`

**Files:**
- Create: `api/src/db/migrations/029_ratecard_entry_rate_nullable.sql`
- Modify: `api/src/lib/money-rules.js`, `api/src/lib/money-rules.test.js`
- Modify: `api/src/routes/config.js:399-421`
- Modify: `test-api.js` (`testRatecards`, lines 405-468)
- Modify: `docs/db/migrations.md`, `docs/api/config.md`, `docs/api/lib.md`

**Interfaces:**
- Produces: `ratecardEntryError(entry, label) → string | null`, exported from `api/src/lib/money-rules.js`. Route contract: the body is the full set of entries, `hourlyRate: number | null`, `rateOverrides: object`, and roles missing from the body lose their entry.

- [ ] **Step 1: Write the failing `node:test` tests** in `api/src/lib/money-rules.test.js`:

```js
test('ratecardEntryError: accepts a null EUR rate with an override, and 0', () => {
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: null, rateOverrides: { USD: 175.5 } }, 'E'), null);
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: 0, rateOverrides: {} }, 'E'), null);
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: 150 }, 'E'), null);
});
test('ratecardEntryError: refuses an entry that expresses nothing', () => {
  assert.equal(ratecardEntryError({ roleId: 'r', hourlyRate: null, rateOverrides: {} }, 'Entry 1'),
    'Entry 1 has neither a rate nor a currency override.');
  assert.notEqual(ratecardEntryError({ roleId: 'r', hourlyRate: null }, 'E'), null);
});
test('ratecardEntryError: refuses a bad EUR rate or override', () => {
  assert.notEqual(ratecardEntryError({ hourlyRate: -1 }, 'E'), null);
  assert.notEqual(ratecardEntryError({ hourlyRate: 1.555 }, 'E'), null);
  assert.notEqual(ratecardEntryError({ hourlyRate: '150' }, 'E'), null);
  assert.notEqual(ratecardEntryError({ hourlyRate: null, rateOverrides: { USD: -1 } }, 'E'), null);
});
```

- [ ] **Step 2: Run** `cd api && node --test src/lib/money-rules.test.js` — expected FAIL (`ratecardEntryError is not a function`).

- [ ] **Step 3: Implement `ratecardEntryError`.** It returns `amountError(hourlyRate, 'EUR', \`${label}: hourly rate\`)` when `hourlyRate` is not `null`/`undefined`, then the `overridesError(rateOverrides, \`${label}: rate overrides\`)` result. When `hourlyRate` is null and there are zero override keys, it returns the empty-entry message. Export it, and update the module header comment to mention cycle 3.

- [ ] **Step 4: Run step 2 again** — expected PASS.

- [ ] **Step 5: Write the migration** `029_ratecard_entry_rate_nullable.sql`: a header comment (cycle, meaning of `NULL`, idempotent) and `ALTER TABLE ratecard_entries ALTER COLUMN hourly_rate DROP NOT NULL;`.

- [ ] **Step 6: Write the failing test-api checks** in `testRatecards`, inside the `rcPerClientId && roles.length` branch. They need `roles.length >= 2`; otherwise use `ok(true, '… skipped')` lines like the existing ones. `entriesOf` = `(await api('GET', \`/api/ratecards/${rcPerClientId}\`, null, adminCookie)).data.entries` filtered to non-null `roleId`:
  - `RC-06`: after the existing empty-array `PATCH`, `entriesOf` has length 0.
  - `RC-07`: `PATCH [{ roleId: A, hourlyRate: null, rateOverrides: { USD: 175.5 } }]` → 200. The entry for A has `hourlyRate === null` and `rateOverrides.USD === 175.5`, and no entry for A has `Number(hourlyRate) === 0`. Use `ensureTestCurrencies()` if USD may be missing.
  - `RC-08`: `PATCH [{ roleId: A, hourlyRate: null, rateOverrides: {} }]` → 400 with `code === 'MONEY_RULE'`. `entriesOf` is unchanged from RC-07 (no write).
  - `RC-09`: `PATCH [{ roleId: A, hourlyRate: 0 }, { roleId: B, hourlyRate: 120 }]` → 200. A reads back `Number(hourlyRate) === 0`, B reads back `120`.
  - `RC-10`: `PATCH [{ roleId: B, hourlyRate: 120 }]` → 200. `entriesOf` has no entry for A and still has B at 120.

- [ ] **Step 7: Run** `scripts/run-tests.sh` — expected: RC-06 and RC-07 to RC-10 FAIL, everything else as on `main`.

- [ ] **Step 8: Rewrite the route.** First validate every entry with `ratecardEntryError(e, \`Entry ${i + 1}\`)` (also refuse a non-object entry). Then, on one client from the pool (follow the transaction idiom already in `api/src/routes/` — `grep -rn "BEGIN" api/src/routes | head`): `BEGIN`; `DELETE FROM ratecard_entries WHERE ratecard_id = $1 AND NOT (role_id = ANY($2::uuid[]))`; the existing upsert per entry (`hourlyRate ?? null`); `COMMIT`. On error `ROLLBACK`, and always release the client.

- [ ] **Step 9: Run** `cd api && node --test src/lib/money-rules.test.js` and `scripts/run-tests.sh` — expected all PASS, RC-01 to RC-10 included.

- [ ] **Step 10: Docs.** Add a `029` row to `docs/db/migrations.md` in the table's style (meaning of `NULL`, by-hand caveat for `test-branch.sh`). In `docs/api/config.md`, describe the entries `PATCH` as a full replacement in a transaction, with nullable `hourlyRate` and the empty-entry refusal. In `docs/api/lib.md`, add `ratecardEntryError` under `money-rules.js`.

- [ ] **Step 11: Commit** — `feat(ratecards): nullable EUR rate, entries PATCH replaces the set in a transaction`.

### Task 2: `cgRatecardMaps` in `js/lib/costgrid-calc.js`

**Files:**
- Modify: `js/lib/costgrid-calc.js`, `js/lib/costgrid-calc.test.js`
- Modify: `js/costgrid.js:338-346`
- Modify: `costgrid.html:765`, `pipeline.html:513` (`?v=11` → `?v=12`)
- Modify: `docs/js/lib.md`

**Interfaces:**
- Produces: `cgRatecardMaps(entries: Array<{roleId|role_id, hourlyRate|hourly_rate, rateOverrides|rate_overrides}>) → { rates: {[roleId]: number}, overrides: {[roleId]: object} }`, plus the `window.cgRatecardMaps` bridge.

- [ ] **Step 1: Characterization test first** (it must pass on the current code): `resolveRoleRate keeps the role rate when the ratecard has no entry for it`. With `ratecardMap: {}`, `globalRate: 100`: EUR → `effectiveRate === 100`; USD at `currencyRate: 1.1` with no overrides → `110`.

- [ ] **Step 2: Write the failing tests:**

```js
it('cgRatecardMaps leaves a null EUR rate out of rates but keeps its overrides', () => {
  const { rates, overrides } = cgRatecardMaps([
    { roleId: 'a', hourlyRate: null, rateOverrides: { USD: 175.5 } },
    { role_id: 'b', hourly_rate: '0', rate_overrides: {} },
    { roleId: 'c', hourlyRate: '120.00' },
  ]);
  expect(rates).toEqual({ b: 0, c: 120 });
  expect(overrides.a).toEqual({ USD: 175.5 });
});
it('a null EUR rate resolves to the role rate in EUR and to the override in USD', () => {
  const { rates, overrides } = cgRatecardMaps([{ roleId: 'a', hourlyRate: null, rateOverrides: { USD: 175.5 } }]);
  const base = { roleId: 'a', globalRate: 100, ratecardMap: rates, ratecardOverrides: overrides, roleOverrides: {} };
  expect(resolveRoleRate({ ...base, currency: 'EUR', currencyRate: 1 }).effectiveRate).toBe(100);
  expect(resolveRoleRate({ ...base, currency: 'USD', currencyRate: 1.1 }).effectiveRate).toBe(175.5);
});
```

- [ ] **Step 3: Run** `npx vitest run js/lib/costgrid-calc.test.js` — expected: the characterization test PASSES, the two new tests FAIL (`cgRatecardMaps` not exported).

- [ ] **Step 4: Implement `cgRatecardMaps`** with the same rule as the loop it replaces (`parseFloat`, skip `NaN`; overrides only when an object). Then replace the loop in `js/costgrid.js` with `const m = cgRatecardMaps(rc.entries || []); _cgActiveRatecardMap = m.rates; _cgActiveRatecardOverrides = m.overrides;`. Add the bridge and bump `?v=` in both pages.

- [ ] **Step 5: Run** `npm test` — expected all PASS.

- [ ] **Step 6: Docs.** Add `cgRatecardMaps` under `costgrid-calc.js` in `docs/js/lib.md`.

- [ ] **Step 7: Commit** — `refactor(costgrid): read the ratecard through the pure cgRatecardMaps`.

### Task 3: The rate card modal as a Vue template under `money.js`

**Files:**
- Modify: `master-clients.html` — modal markup (`:162-195`) moved inside `#app` (before `:157`), `openClientRatecard`/`saveClientRatecard` (`:316-473`)
- Modify: `docs/pages/config.md` (master-clients rate card section)

**Interfaces:**
- Consumes: `window.formatMoney`, `formatMoneyInput`, `readMoneyInput`, `moneyFormatExample`, `currencyInfo` (`js/lib/money.js`, already loaded, `?v=3`). Route contract from Task 1.
- Model: `master-roles.html` `amountText`, `onMoneyFocus`, `onMoneyBlur`, `saveRole` (lines 288-345). Copy the technique, keyed by row and column instead of by one form.

- [ ] **Step 1: Data.** Add `rc: { title, loading, error, msg, msgKind, saving, id: null, currencies: [], rows: [] }`. Each row is `{ roleId, label, code, defaults: {[code]: number|null}, texts: {[code]: string} }`, with `'EUR'` plus every active non-EUR code. `defaults.EUR = role.hourly_rate`, `defaults[cu] = role.rate_overrides?.[cu]`, and `texts` is filled with `amountText(stored, code)` (a stored 0 shows `'0'`, a `null` shows `''`). Remove `globalRc`/`globalMap` and the `window._clientRcId` global.

- [ ] **Step 2: Template.** Same columns as today (Role, Code, Agency default, `Client custom (${currencyInfo('EUR').symbol}/h)`, one `${cu.symbol} ${cu.code}/h` per non-EUR currency). Every input is `type="text"`, `inputmode="decimal"`, with `v-model="row.texts[code]"`, `@focus`/`@blur` → `onRcFocus(row, code)` / `onRcBlur(row, code)`, and the placeholder from Global Constraints. "Agency default" shows `formatMoney(row.defaults.EUR, 'EUR', currencies)`, or `—`. The spinner, error and success message come from `rc.*` with `v-if`. The modal keeps `id="clientRcModal"` and is shown via `bootstrap.Modal.getOrCreateInstance`.

- [ ] **Step 3: Save.** For each row and code, call `readMoneyInput`. The first `NaN` sets `rc.error` to the Global Constraints copy and stops with no request. A row with `EUR === null` and no override is not sent. Otherwise send `{ roleId, hourlyRate: eur /* null when blank */, rateOverrides }`. Success/failure messages keep today's copy (`Rates saved successfully.` / `e.message || 'Failed to save.'`).

- [ ] **Step 4: Run** `npm test` — expected all PASS, `money-guard` included (`master-clients.html` is still exempt until Task 4).

- [ ] **Step 5: Manual / visual check** on a branch stack (`scripts/test-branch.sh up`, then apply `029` by hand as in Global Constraints), as admin, Master Data → Clients → Rate Card:
  1. Type `1234,5` in EUR and blur → `€ 1.234,50` (or the EUR locale's form). Type `1234.5` in USD and blur → `$ 1,234.50`. "Agency default" shows `formatMoney` output.
  2. If JPY is active: `12.5` is refused on save with the JPY example.
  3. Set role A to USD only (EUR empty) and role B to EUR `0`, save, close, reopen. A's EUR field is empty with the agency placeholder, B shows `0`. Save again without changes, reload: same values (Review Focus 1, 2).
  4. Type `abc` in one column and a valid value in another, then save: refused with the copy, and reopen shows the previous values.
  5. Clear A completely, save, reopen: A is empty everywhere.
  6. `node scripts/shoot.mjs` of `master-clients.html` with the modal open (`--eval` opening the first client's rate card, see `docs/scripts/shoot.md`) at the default widths. **Read the PNGs back** and report what they show.

- [ ] **Step 6: Docs.** Update the `docs/pages/config.md` rate-card paragraph: text inputs under `money.js`, empty means agency default, a cleared role loses its entry, and "Agency default" comes from the role.

- [ ] **Step 7: Commit** — `fix(master-clients): rate card fields under money.js, empty EUR means agency default`.

### Task 4: Delete the dead editor, close the guard exemption

**Files:**
- Modify: `js/ratecards.js` (delete `:1-403` except what `loadRatecardsForDropdown` needs; keep its header comment accurate)
- Modify: `js/lib/money-guard.test.js:24-25,59`
- Modify: `admin.html:212` comment only if it now misleads (it mentions `ratecards.js`; check whether `admin.html` still loads the file — it does not today)
- Modify: `docs/js/shared-libs.md` (`ratecards.js` entry), `docs/BACKLOG.md` (new line)

**Interfaces:**
- Consumes: nothing new. Keeps `loadRatecardsForDropdown()` with the same signature and behaviour.

- [ ] **Step 1: Prove no caller exists:** `grep -rn "openRatecardsModal\|_rc[A-Z]\|_injectRatecardsModal" --include=*.html --include=*.js . | grep -v node_modules | grep -v "^./js/ratecards.js"` → expected no output. If anything prints, stop and report.

- [ ] **Step 2: Remove `PENDING_CYCLE_3`** and its `continue` from `money-guard.test.js`. Run `npx vitest run js/lib/money-guard.test.js` — expected FAIL, naming `js/ratecards.js` (its dead editor still has `type="number"` rate inputs) and **not** `master-clients.html`. If `master-clients.html` is named, Task 3 is not done.

- [ ] **Step 3: Delete the dead editor** from `js/ratecards.js`, keeping `loadRatecardsForDropdown` and any helper it calls.

- [ ] **Step 4: Run** `npm test` — expected all PASS. Then open a cost grid on the branch stack and check that the Ratecard dropdown still lists the client rate cards (`loadRatecardsForDropdown`).

- [ ] **Step 5: Docs.** Make the `docs/js/shared-libs.md` `ratecards.js` entry say only `loadRatecardsForDropdown`. Add a `docs/BACKLOG.md` line in its format: `POST /api/ratecards` without `clientId` and `POST /api/ratecards/clone` can still create a rate card with no client, which no consumer reads as the agency default (found in currency cycle 3, Spec §8).

- [ ] **Step 6: Commit** — `chore(ratecards): delete the uncalled editor; money guard covers master-clients and ratecards.js`.

## Decisioni aperte

1. **Tasks are sequential, not declared independent.** Alternativa scartata: dispatching Tasks 1 and 2 in parallel. Perché: they are small and the native mode does not need it.
2. **`js/ratecards.js` stays unversioned.** Alternativa scartata: adding `?v=1` in `costgrid.html`. Perché: `loadRatecardsForDropdown` does not change, so a stale cached copy behaves the same.
