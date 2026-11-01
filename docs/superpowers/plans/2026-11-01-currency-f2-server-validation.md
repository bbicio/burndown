# Currency f2 — server validation of PTC, phasing and column bounds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every PTC and phasing amount the server writes, and every rate/POT, passes `amountError` with a column bound, refused with `400 MONEY_RULE`; Derive/Reforecast stop producing float noise and the stored noise is rounded away.

**Architecture:** the rules stay pure in `api/src/lib/money-rules.js` (a required `max`, two column limits, two shape checks); routes call them before any write. The client fix is in `js/lib/config-form-calc.js`; one idempotent migration cleans the stored data.

**Tech Stack:** Node/Express + `pg`, `node:test` (api lib), vitest + jsdom (frontend lib), `test-api.js` integration profile via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-11-01-currency-f2-server-validation-design.md`
**Branch:** `currency-f2-server-validation`
**Risk class:** high-risk — money/currencies and a DB migration

## Global Constraints

- Only a JS number is an amount; extra decimals are refused, never rounded on the server.
- Refusal shape: `400 { error, code: 'MONEY_RULE' }`, returned before any write (no partial writes).
- `MAX_DECIMAL_10_2 = 99999999.99`, `MAX_NUMERIC_14_2 = 999999999999.99`; `max` is required, no default.
- Currency context: version currency for task PTC and structure rates; project currency for project PTC, phasing and resource rates; EUR for role rates, rate card and POT (as today).
- All user-facing text in English.
- Every `?v=N` reference to an edited versioned file is bumped (CLAUDE.md "Cache-busting").
- New finding during execution: not fixed here — a `docs/BACKLOG.md` row (PROCESS.md, Scenario 3).

## Review Focus

1. `ptc: 0`, `ptc: null` and an absent `ptc` in the structure `PUT` stay accepted and store 0 — the editor sends 0 for every untouched task. Pinned in Task 2 (MR-15).
2. An empty phasing `{}` and an empty PTC `[]` are accepted — that is how the user clears a section. Pinned in Task 3 (MR-18, MR-19).
3. The currency context is right: `175.555` is refused for a USD version task PTC and `1.5` for a JPY project phasing while `175.55`/`1500` pass. Pinned in Tasks 2-3.
4. Exactly `max` is accepted, `max + 0.01` refused — off-by-one at the column edge. Pinned in Task 1 (lib) and Task 2 (route, rate `1e8` → MONEY_RULE, not 500).
5. A refused request leaves the stored value unchanged — validation runs before the write, not inside a half-done transaction. Pinned in Tasks 2-3 by reading back after each refusal.

## Task independence

Task 1 changes `amountError`'s signature and updates every caller; Tasks 2 and 3 consume it and are independent of each other. Tasks 4 and 5 are independent of 1-3 and of each other. Task 6 (docs, backlog) runs last.

---

### Task 1: `amountError` column bound and the two shape rules

**Files:**
- Modify: `api/src/lib/money-rules.js`
- Modify: `api/src/lib/money-rules.test.js`
- Modify callers: `api/src/routes/config.js` (lines ~228, ~245), `api/src/routes/pots.js` (~246, ~382), `api/src/routes/cost-grids.js` (~714), `api/src/routes/projects.js` (~439)
- Modify: `test-api.js` (`testMoneyRules`)

**Interfaces:**
- Produces: `amountError(value, currencyCode, label, { max })` → `string | null`; throws `Error('amountError: max is required')` when `max` is not a finite number. Over-limit message: `` `${label} must not exceed ${max} ${currencyCode}.` ``
- Produces: `MAX_DECIMAL_10_2`, `MAX_NUMERIC_14_2` (exports).
- Produces: `ptcRowsError(rows, currencyCode)` → `string | null` — not an array → `'PTC must be an array.'`; a non-object element → `` `PTC row ${i + 1} must be an object.` ``; else `amountError(row.amount, code, `PTC row ${i + 1}`, { max: MAX_DECIMAL_10_2 })`.
- Produces: `phasingError(phasing, currencyCode)` → `string | null` — not a plain object (null, array, primitive) → `'Phasing must be an object.'`; else each value via `amountError(v, code, `Phasing ${key}`, { max: MAX_DECIMAL_10_2 })`.
- `overridesError` and `ratecardEntryError` keep their signatures and pass `MAX_DECIMAL_10_2` internally.

- [ ] **Step 1: Write the failing lib tests** in `money-rules.test.js`; update every existing `amountError(...)` call in the file to pass `{ max: MAX_DECIMAL_10_2 }`. New tests:
  - `amountError: column bound` — `amountError(99999999.99,'EUR','L',{max:MAX_DECIMAL_10_2})` is `null`; `100000000` gives `'L must not exceed 99999999.99 EUR.'`; `999999999999.99` with `MAX_NUMERIC_14_2` is `null`, `1e12` is not.
  - `amountError: max is required` — `assert.throws(() => amountError(1,'EUR','L'), /max is required/)`.
  - `overridesError: bound` — `{ USD: 1e8 }` refused.
  - `ptcRowsError` — `[]` → null; `[{amount:100,month:'202601',title:'T',note:''}]` → null; `{}` → `'PTC must be an array.'`; `[5]` → `'PTC row 1 must be an object.'`; `[{amount:-1}]`, `[{amount:'100'}]`, `[{amount:1.234}]`, `[{}]` → non-null; `[{amount:1.5}]` with `'JPY'` → non-null.
  - `phasingError` — `{}` → null; `{'202601':1120.3}` → null; `null`, `[]`, `'x'` → `'Phasing must be an object.'`; `{'202601':1120.304347826087}`, `{'202601':-1}`, `{'202601':'5'}` → non-null; `{'202601':1e8}` → non-null.

- [ ] **Step 2: Run** `node --test src/lib/money-rules.test.js` from `api/` — expected: FAIL (`MAX_DECIMAL_10_2` undefined / no throw).

- [ ] **Step 3: Implement** the Interfaces above in `money-rules.js`; extend the header comment with one line for cycle f2.

- [ ] **Step 4: Update every caller** to pass the bound: `config.js` role `hourlyRate` → `MAX_DECIMAL_10_2`; `pots.js` both → `MAX_NUMERIC_14_2`; `cost-grids.js` role rate → `MAX_DECIMAL_10_2`; `projects.js` resource rate → `MAX_DECIMAL_10_2`. Check with `grep -rn "amountError(" api/src --include=*.js | grep -v "\.test\.js" | grep -v "max:"` → only the definition line in `money-rules.js`.

- [ ] **Step 5: Run** `node --test src/lib/money-rules.test.js` → PASS; `node --test src/**/*.test.js` from `api/` → PASS (`routes/*.test.js` need `api/node_modules`; else `docker exec pdash-api node --test src/...` is read-only and allowed).

- [ ] **Step 6: Add integration tests** to `testMoneyRules` in `test-api.js`, after MR-14:
  - `MR-15a` structure `PUT` role rate `100000000` on `eurV` → `isMoneyRefusal`, stored rate unchanged (use `putRate`/`storedRate`; set a known rate first).
  - `MR-15b` POT update `amount: 1e12` on `mrPotId` → `isMoneyRefusal`, amount still `1000`; `999999999999.99` → 200 (restore `1000` after).
  (Run with Task 2's suite; Step 7 of Task 2 runs the profile.)

- [ ] **Step 7: Commit** — `git add api/src/lib/money-rules.js api/src/lib/money-rules.test.js api/src/routes/config.js api/src/routes/pots.js api/src/routes/cost-grids.js api/src/routes/projects.js test-api.js` — `feat(currency-f2): column bound on amountError, PTC/phasing shape rules (B-188)`.

### Task 2: structure `PUT` — task PTC and the second body shape

**Files:**
- Modify: `api/src/routes/cost-grids.js` (pre-check after the role-rate loop ~line 711; task `INSERT`s ~822/826; second-shape push ~843)
- Modify: `test-api.js` (`testMoneyRules`)

**Interfaces:**
- Consumes: `amountError(…, { max })`, `MAX_DECIMAL_10_2`, `MONEY_RULE_CODE` (Task 1).

- [ ] **Step 1: Write failing tests** in `testMoneyRules` (reuse `eurV`, `usdV`, `mrRole`, `isMoneyRefusal`). Helpers: `putPtc(vId, ptc)` → structure `PUT` with `phases:[{phaseName:'P1',tasks:[{taskName:'T1',hours:{[mrRole.code]:2}, ptc}]}]`, `roles:[{roleCode:mrRole.code, rate:100}]`; `storedPtc(vId)` → `GET …/structure` `.data.phases[0].tasks[0].ptc`. A body without the `ptc` key is sent for the "absent" case.
  - `MR-16a` `ptc: 500` → 200, stored 500; then `ptc: 0`, `null`, absent → each 200, stored 0.
  - `MR-16b` after storing 500: `-1`, `'500'`, `500.555`, `100000000` → each `isMoneyRefusal`, stored still 500.
  - `MR-16c` on `usdV`: `175.555` → MONEY_RULE, `175.55` → 200.
  - `MR-17` second shape: `phases:[{title:'P1',tasks:[{title:'T1',roles:[{roleId:mrRole.id,days:2,rateOverride}]}]}]` — `rateOverride: 0` → 200 and stored `rate_override` is `0` (not null); absent → stored `null`; `-1` → MONEY_RULE and stored value unchanged.

- [ ] **Step 2: Run** the integration profile: `scripts/run-tests.sh` (worktree needs `.env` copied from the main checkout, never committed) — expected: MR-16/MR-17 FAIL (`ptc: -1` → 200 today, `rateOverride: 0` → null).

- [ ] **Step 3: Implement.** In the pre-check, after the role-rate loop, for every task: `ptc` absent/`null` is fine; else `amountError(tk.ptc, currency, `PTC of task "${tk.taskName || tk.title || ''}"`, { max: MAX_DECIMAL_10_2 })` → `400 MONEY_RULE`. For every `tk.roles[]` entry (only when `tk.hours` is not an object — same branch as the insert): `rateOverride` absent/`null` is fine; else `amountError` with label `` `Rate override in task "${…}"` ``. Inserts write `tk.ptc ?? 0`; the second shape pushes `rateOverride: tr.rateOverride ?? null`.

- [ ] **Step 4: Run** `scripts/run-tests.sh` → MR-01..MR-17 PASS, nothing else red.

- [ ] **Step 5: Commit** — `fix(currency-f2): structure PUT validates task PTC and the second body shape (B-185, B-186)`.

### Task 3: project `PATCH …/ptc` and `PATCH …/phasing`

**Files:**
- Modify: `api/src/routes/projects.js` (lines ~519-540)
- Modify: `test-api.js` (`testMoneyRules`, inside the `if (mrProj)` block)

**Interfaces:**
- Consumes: `ptcRowsError(rows, code)`, `phasingError(phasing, code)`, `MONEY_RULE_CODE` (Task 1).

- [ ] **Step 1: Write failing tests.** Read back with `GET /api/projects/${mrProj}` (`.data.phasing`, `.data.ptc`) as `sysadminCookie`. Create a second project `__test_mr_project_jpy__` with `currency: 'JPY'` (sysadmin, `later('DELETE', …)`).
  - `MR-18a` phasing `{'202601': 1000.5}` → 200, read back equal; `{}` → 200.
  - `MR-18b` after storing `{'202601': 1000.5}`: `{'202601': -1}`, `{'202601':'5'}`, `{'202601': 1120.304347826087}`, `{'202601': 1e8}`, `[]`, `null` → each `isMoneyRefusal`, read back still `{'202601': 1000.5}`.
  - `MR-18c` JPY project: `{'202601': 1.5}` → MONEY_RULE, `{'202601': 1500}` → 200.
  - `MR-19a` ptc `[{note:'',month:'202601',title:'T',amount:100}]` → 200; `[]` → 200.
  - `MR-19b` after storing the one-row PTC: `[{…amount:-1}]`, `[{…amount:'100'}]`, `[{…amount:100.555}]`, `{}`, `[5]` → each `isMoneyRefusal`, read back unchanged.

- [ ] **Step 2: Run** `scripts/run-tests.sh` — expected: MR-18/MR-19 FAIL.

- [ ] **Step 3: Implement.** In both routes, after `canEdit`: read `SELECT currency FROM projects WHERE id = $1`; run `phasingError(phasing, currency)` / `ptcRowsError(ptc, currency)`; an error → `400 { error, code: MONEY_RULE_CODE }` before the `UPDATE`.

- [ ] **Step 4: Run** `scripts/run-tests.sh` → all PASS.

- [ ] **Step 5: Commit** — `fix(currency-f2): project PTC and phasing PATCH validate amounts (B-185)`.

### Task 4: Derive and Reforecast round to the currency's decimals

**Files:**
- Modify: `js/lib/config-form-calc.js`
- Modify: `js/lib/config-form-calc.test.js`
- Modify: `project-config.html` (calls at ~1127 and ~1158; `<script … config-form-calc.js?v=4>` at ~418)

**Interfaces:**
- Produces: `deriveDistribution(tasks, months, cfgStart, cfgEnd, digits = 2)`, `reforecastDistribution(tasks, months, actualsRows, currentYm, digits = 2)` — every phasing month rounded to `digits` (past months of the reforecast included). Planning (hours) unchanged.

- [ ] **Step 1: Write failing tests** in `config-form-calc.test.js`:
  - `deriveDistribution rounds every month to digits` — a task whose budget splits unevenly over 3 months (e.g. 1000 over 23+28+… days); with `digits` 2 every value equals `Math.round(v*100)/100`; with `digits` 0 every value is an integer.
  - `reforecastDistribution rounds past months too` — actuals spend that scales to a non-terminating value (reuse the file's existing reforecast fixture, set a spend like `1000/3`); every month of `newPhasing` (past and future) has at most `digits` decimals, for 2 and for 0.

- [ ] **Step 2: Run** `npx vitest run js/lib/config-form-calc.test.js` → FAIL (past months unrounded; digits ignored).

- [ ] **Step 3: Implement.** One local `round(v, digits)` helper (`Number(v.toFixed(digits))` is not enough for halves — use `Math.round(v * 10 ** digits) / 10 ** digits`); replace both `Math.round(x * 100) / 100` and apply it to every key of the reforecast `newPhasing`, not only future ones.

- [ ] **Step 4: Wire the caller.** `project-config.html` passes `window.currencyInfo(this.project.currency, window.__currencies).digits` as the last argument of both calls; bump every `config-form-calc.js?v=4` reference to `?v=5` (`grep -rn "config-form-calc.js?v=" --include=*.html --include=*.js .` → all `v=5`).

- [ ] **Step 5: Run** `npm test` → PASS.

- [ ] **Step 6: Commit** — `fix(currency-f2): Derive and Reforecast round phasing to the currency decimals (B-217)`.

### Task 5: migration 030 — round the stored phasing noise

**Files:**
- Create: `api/src/db/migrations/030_round_project_phasing.sql`
- Modify: `docs/db/migrations.md` (new row after `029`)

- [ ] **Step 1: Write the migration.** One transaction:
  1. `DO $$ … RAISE EXCEPTION … $$` if any project with `currency <> 'EUR'` has a phasing value `v::numeric <> round(v::numeric, 2)` (message names the count) — same pattern as `025_resource_role_id.sql`.
  2. `UPDATE projects SET phasing = (SELECT jsonb_object_agg(k, round(v::numeric, 2)) FROM jsonb_each_text(phasing) e(k, v)) WHERE currency = 'EUR' AND phasing IS NOT NULL AND jsonb_typeof(phasing) = 'object' AND EXISTS (SELECT 1 FROM jsonb_each_text(phasing) e(k, v) WHERE v::numeric <> round(v::numeric, 2));`
  Idempotent: a second run updates 0 rows.

- [ ] **Step 2: Verify on a disposable stack only** (never the main stack): `scripts/run-tests.sh` applies every migration from scratch with `ON_ERROR_STOP=1` — expected: the run reaches the test phase. The real data is verified after Gate 4 applies it (criterion 5).

- [ ] **Step 3: Document** the `030` row in `docs/db/migrations.md`: what it rounds, EUR only, aborts on non-EUR noise, idempotent, applied by `/finish-cycle` Gate 4 on the main stack; a `test-branch.sh` stack needs it by hand.

- [ ] **Step 4: Commit** — `feat(currency-f2): migration 030 rounds stored EUR phasing noise (B-217)`.

### Task 6: docs and backlog

**Files:**
- Modify: `docs/api/lib.md` (`money-rules.js` section: `max`, limits, `ptcRowsError`/`phasingError`, callers; replace "Out of scope: PTC and phasing amounts (B-185)"; tests `MR-01..MR-19`)
- Modify: `docs/js/lib.md` (`config-form-calc.js`: the `digits` parameter)
- Modify: `CLAUDE.md` "Money formatting and parsing" — the bullet "Every route that writes a rate or a POT amount…" becomes "…a rate, a POT, a PTC or a phasing amount…" (keep the bullet one line; `scripts/claude-md-guard.test.js` ceiling)
- Modify: `docs/BACKLOG.md` rows B-185, B-186, B-188, B-217 — status `closed 2026-11-01 by branch currency-f2-server-validation`, each with its re-run command and output:
  - B-185: `grep -n "tk.ptc || 0\|JSON.stringify(phasing)\|JSON.stringify(ptc)" api/src/routes/cost-grids.js api/src/routes/projects.js` → only lines preceded by a `phasingError`/`ptcRowsError` check (report what it prints)
  - B-186: `grep -n "tr.rateOverride || null" api/src/routes/cost-grids.js` → no output
  - B-188: `grep -c "MAX_" api/src/lib/money-rules.js` → > 0
  - B-217: the row's own `psql` count → `0|68` after migration — fill in at Gate 4/5 if the migration is not yet applied, saying so

- [ ] **Step 1: Edit the four docs.**
- [ ] **Step 2: Run** `npx vitest run scripts/` → PASS (doc guards).
- [ ] **Step 3: Commit** — `docs(currency-f2): money-rules, config-form-calc, migration 030, close B-185/B-186/B-188/B-217`.

## Criteri di accettazione

1. **Rifiuti del PTC e del phasing** — `test-api.js` MR-16, MR-18, MR-19: structure `PUT`, `PATCH …/ptc` e `PATCH …/phasing` rifiutano con `MONEY_RULE` un negativo, una stringa, un importo con troppi decimali e uno oltre il limite, lasciano invariato il dato salvato, e accettano un importo valido.
2. **Seconda forma** — `test-api.js` MR-17: la seconda forma salva un `rateOverride` 0 come 0 e rifiuta con `MONEY_RULE` un negativo.
3. **Limite di colonna** — `api/src/lib/money-rules.test.js` verifica che `amountError` rifiuti un valore oltre `MAX_DECIMAL_10_2` e oltre `MAX_NUMERIC_14_2`, accetti il valore al limite, e lanci senza `max`.
4. **Phasing arrotondato** — `js/lib/config-form-calc.test.js` verifica che ogni mese del phasing di Derive e di Reforecast, mesi passati compresi, abbia al massimo i decimali passati (2 e 0).
5. **Dati esistenti** — dopo la migrazione 030, `docker exec pdash-db psql -U pdash -d pdash -Atc "select count(*) from projects, jsonb_each_text(coalesce(phasing,'{}')) as e(k,v) where v::numeric <> round(v::numeric,2)"` dà `0`.
6. **Verifica nel browser** — in `project-config.html`, Reforecast su un progetto con actuals e poi Save riesce; un phasing inviato con un valore negativo via `fetch` dalla console riceve `400` con `code: 'MONEY_RULE'`.
7. **Backlog** — le righe B-185, B-186, B-188 e B-217 di `docs/BACKLOG.md` sono chiuse, ciascuna con il comando rieseguito.
8. **Suite** — `npm test`, i test `node:test` di `api/` e il profilo di integrazione (`scripts/run-tests.sh`) passano.

## Decisioni aperte

1. **`overridesError` e `ratecardEntryError` tengono la firma e passano il limite dentro.** Alternativa scartata: aggiungere `max` anche a loro. Perché: proteggono solo tariffe, sempre `DECIMAL(10,2)`; un parametro in più non deciderebbe niente.
2. **Il controllo della seconda forma vive nel pre-controllo, fuori dalla transazione.** Alternativa scartata: controllarla nel ciclo degli `INSERT`. Perché: il pre-controllo delle tariffe sta già lì e il rifiuto non deve mai trovare una transazione a metà.
3. **La migrazione si prova solo sullo stack usa-e-getta di `run-tests.sh`; sui dati reali la applica il Gate 4.** Alternativa scartata: provarla a mano su `pdash-db` durante l'esecuzione. Perché: CLAUDE.md, "Infrastructure safety", vieta di toccare lo stack principale fuori dal Gate 4.
