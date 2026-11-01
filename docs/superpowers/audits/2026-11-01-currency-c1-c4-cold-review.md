# Currency cycles c1-c4 — cold review

**Date:** 2026-11-01
**Scope (agreed with the user before any code was read):** verification-only. The full non-docs diff of the four currency cycles — `git diff 5d2c1bc^1 2704c47 -- . ':!docs'` (c1 `5d2c1bc` server `MONEY_RULE`, c2 `0d3aa48` rate/POT inputs on `money.js`, c3 `3e37f54` client rate card + migration `029`, c4 `2704c47` B-183 version rate) — plus what that code calls directly, as far as needed to verify it. A finding is a correctness bug, a divergence between the code and a c1-c4 Spec decision or acceptance criterion, a document (CLAUDE.md, `docs/`, `docs/BACKLOG.md`, reports, the handoff) that states something false about the merged code, or a Spec rule pinned by no test. Explicitly in: c4 Spec decision 2, follow-ups B-213/B-214/B-215, and the re-run of B-208's count.
**Ground truth:** the four Specs (`docs/superpowers/specs/2026-10-29-currency-c1-server-rate-validation-design.md`, `…-c2-vue-rate-inputs-design.md`, `2026-10-30-currency-c3-ratecard-design.md`, `2026-11-01-currency-c4-b183-version-rate-baselines-design.md`), the audit they came from (`2026-10-29-currency-forms-audit.md`) and the handoff `docs/superpowers/briefs/2026-11-01-currency-c4-and-findings-handoff.md`.

## Method

- Read the diff of each merge (`git diff <merge>^1 <merge>`), the c4 Spec in full and the c2 Spec's decimals rules.
- Read the load/save path of a cost-grid role rate end to end: `PUT …/structure` (`api/src/routes/cost-grids.js`), `cgLoadStructureFromApi` (`js/api-sync.js`), `cgSyncRoleRatesToBaseline`/`cgPreviewRateChange` (`js/costgrid.js`), `roleBaseline`/`onRate*`/`resetRoleRate` (`costgrid.html`), `resolveRoleRate` (`js/lib/costgrid-calc.js`).
- Read every path that puts a version into the in-memory store (new grid, new version, clone) for its `currencyRate`, since c4 makes the baselines depend on it.
- Read the c3 rate card routes and modal, and every server reader of `ratecard_entries.hourly_rate` (now nullable).
- Re-ran the evidence command of every open row B-184..B-215 in `docs/BACKLOG.md`, and the node probes of B-196/B-197/B-204.
- Read-only `SELECT`s on the main stack's `pdash-db` (no container lifecycle operation).

### Existing data (main stack, 2026-11-01)

| Measure | Command | Result |
|---|---|---|
| `task_roles` without `rate_override` / total | `select count(*) filter (where rate_override is null), count(*) from task_roles` | `0|86` |
| versions by currency, `currency_rate` | `select currency, count(*), min(currency_rate), max(currency_rate) from cost_grid_versions group by 1` | EUR 14 (1.0), USD 1 (1.3) |
| the USD version's rate vs the live one | `… join currencies c on c.code=v.currency where v.currency<>'EUR'` | `currency_rate` 1.300000, `current_rate` 1.300000 |
| the USD version's stored role rates | distinct `ro.hourly_rate`, `tr.rate_override` | 135→175.50, 180→234.00, 150→195.00 (= EUR × 1.3) |
| B-208 rows | `select count(*) from ratecard_entries where hourly_rate = 0 and rate_overrides <> '{}'` | `0` |
| rate card entries | `select count(*) filter (where hourly_rate = 0), count(*) filter (where hourly_rate is null), count(*), count(distinct ratecard_id) from ratecard_entries` | `0|0|8|1` |

## Findings

### F-01 — c4 Spec decision 2 does not hold: no saved version ever realigns on open

- **Type:** Spec/code divergence (design premise)
- **Severity:** Low today (0 versions affected), Medium as a design gap — it is B-195's root cause, now also blocking the correction c4 relied on
- **Location:** `api/src/routes/cost-grids.js:837`, `js/api-sync.js:107`, `js/costgrid.js:358`
- **Evidence:**
  - the structure save writes an override for every role with hours: `rateOverride: rateByCode[code] ?? null,` (`cost-grids.js:837`), where `rateByCode[r.roleCode] = r.rate;` for every role the client sends (`cost-grids.js:725-728`);
  - the load marks every stored override custom: `const isCustom = override != null;` (`api-sync.js:107`);
  - the sync on open skips custom roles: `if (r.rateIsCustom && !force) return;` (`costgrid.js:358`), reached from `cgUpdateActiveRatecardMap` → `cgSyncRoleRatesToBaseline();` (`costgrid.js:346`);
  - main DB: `task_roles` without `rate_override` = 0 of 86.
- **Description:** decision 2 says existing versions whose role rates were computed with a rate other than the version's "realign by themselves on open" through the non-forced sync. Every role with hours in every saved version reloads with `rateIsCustom: true`, so that sync never touches it. Such a version keeps its old rates until the user resets each role or changes the currency. **Root cause:** whether a rate is a deliberate custom value is not persisted (B-195); the Spec reasoned from the sync's code, not from what a reload feeds it. The merged docs already state the true behaviour (`docs/pages/costgrid.md:418`, report `2026-11-01-currency-c4-version-rate-finish-cycle.md:41`); only the frozen Spec carries the false sentence. The one non-EUR version on the main DB is aligned (rates = EUR × 1.3 = live rate), so nothing needs repairing now.
- **Fix direction (not applied):** belongs with B-195 — persist custom-ness, then decision 2 becomes true. Add F-01 to B-195's row rather than opening a new one.

### F-02 — B-190 is fixed but still open in the backlog

- **Type:** docs/code divergence (`docs/BACKLOG.md`)
- **Severity:** Low (misleads the cycle planning)
- **Location:** `docs/BACKLOG.md` row B-190; `js/lib/costgrid-calc.js:103-104`
- **Evidence:** B-190's command `grep -n "Math.round(eurRate \* (currencyRate || 1) \* 100) / 100" js/lib/costgrid-calc.js` → 0 hits; the code is now `const info = currencyInfo(currency);` / `const converted = Number((eurRate * (currencyRate || 1)).toFixed(info.digits));`. `git log -S` on the old line → removed by `8d14dd9` ("converted role rates round to the currency's decimals"), on `main` through c2 (`0d3aa48`). c2 Spec M-02 and acceptance criterion 2 ("`resolveRoleRate` dà 0 decimali per JPY") are that fix.
- **Description:** c2's Gate 5 did not close the row its M-02 resolved. **Root cause:** the c2 Spec cites the audit's M-02, not B-190, so the backlog sweep had no id to match.
- **Fix direction:** close B-190 citing `8d14dd9` and the re-run grep.

### F-03 — `docs/js/lib.md` still says `resolveRoleRate` uses the live rate

- **Type:** docs/code divergence
- **Severity:** Low
- **Location:** `docs/js/lib.md:51`
- **Evidence:** "`… → EUR baseline × live exchange rate factor`"; since c4 the three baseline callers pass `parseFloat(_cgDraft.currencyRate) || 1.0` (`js/costgrid.js:355`, `costgrid.html:1170`, `costgrid.html:1595`) and only `cgPreviewRateChange` passes `current_rate` (`js/costgrid.js:376-377`); the module's own comment says so (`js/lib/costgrid-calc.js:91`).
- **Description:** c4 updated `docs/pages/costgrid.md` and `docs/js/costgrid.md` (its Spec §7) but not this second description of the same function. **Root cause:** the function is described twice in `docs/js/lib.md` (lines 39 and 51), against the "a rule lives in one file" writing rule; §7 listed only the costgrid docs.
- **Fix direction:** reword line 51 to "the caller's `currencyRate`", or delete it in favour of line 39.

### F-04 — The handoff files the `parseMoney` inputs under B-185, which is a server row

- **Type:** docs divergence (handoff)
- **Severity:** Low, but it shapes the next cycle's grouping
- **Location:** handoff `2026-11-01-currency-c4-and-findings-handoff.md`, "Campi soldi lato client" bullet; `docs/BACKLOG.md` row B-185
- **Evidence:** the handoff lists "B-185 (PTC e phasing ancora su `parseMoney`)" under the client-side cycle; B-185 reads "money amounts other than rates are written without any server check — `tasks.ptc` in the structure `PUT`, `PATCH /api/projects/:id/ptc` and `PATCH /api/projects/:id/phasing`". The client inputs still on `parseMoney` are `costgrid.html:431` (PTC), `project-config.html:220` (phasing) and `:264` (PTC); no open row names them (B-012 covers only `parseMoney`'s strict parse in general).
- **Description:** two different items share one id in the plan: the server validation of PTC/phasing (B-185, belongs with "Validazione server residua", next to B-186/B-207) and the client move of those three inputs to `readMoneyInput` (no row). **Root cause:** the handoff summarised B-185 from its topic (PTC/phasing) rather than its text.
- **Fix direction:** move B-185 to the server group; open a row for the three client inputs and put it in the client cycle.

### F-05 — B-215's false confirmation is pinned by a test

- **Type:** test that pins a known-false behaviour (affects B-215's fix)
- **Severity:** Low
- **Location:** `pipeline.html:975`, `js/lib/costgrid-version-rate.test.js` (describe "pipeline.html refresh-rate confirmation")
- **Evidence:** the dialog says "The EUR equivalent and the editor's \"reset to\" rates change to the new rate."; the test asserts exactly that string (`expect(shown[0][0]).toContain("The EUR equivalent and the editor's \"reset to\" rates change to the new rate.")`). For a role with a per-currency override the reset value ignores the rate: `if (ratecardOverride != null) return { …, effectiveRate: ratecardOverride, … }` / `if (roleOverride != null) return { …, effectiveRate: roleOverride, … }` (`js/lib/costgrid-calc.js:101-102`).
- **Description:** B-215 is confirmed. Its fix must change the test's expected text together with the dialog, or the suite fails. **Root cause:** the round-4 fix and its test were written together from the same wording.

## Follow-ups re-checked

| Row | Re-run | Verdict |
|---|---|---|
| B-213 | `grep -n "current_rate" costgrid.html` → 1859, 1932, both in `onCurrencyChange` | confirmed, open (Spec decisions 1 and 3) |
| B-214 | `grep -n "current_rate" costgrid.html js/costgrid.js` → `costgrid.html` 1859, 1932, `js/costgrid.js` 377 — still matches the B-183 note today | confirmed as a quality item; trivial, fold into any cycle touching `docs/BACKLOG.md` |
| B-215 | `grep -n "reset to" pipeline.html` → 975 | confirmed, see F-05 |
| B-208 | count above → `0`; the c3 save sends `hourlyRate = null` for a blank EUR field (`master-clients.html:432-443`) and the server stores it (`config.js:432-434`, `e.hourlyRate ?? null`) | **can be closed** with that count. The only remaining way to write a new such row is a browser on the cached pre-c3 `master-clients.html`, which is B-209's case — cite B-209 in the closing note |
| B-190 | see F-02 | fixed, close |
| B-184..B-189, B-191..B-207, B-209..B-212 | each row's own command (and the node probes for B-196 `NaN`, B-197 `150 150`, B-204 `108,77`) | still reproduce. B-185's cited lines drifted: `JSON.stringify` writes are now `api/src/routes/projects.js:525` and `:537` |

## Ruled out

- **Every path that seeds a version in memory carries the version's rate.** Load: `currencyRate: parseFloat(v.currency_rate) || 1.0` (`js/api-sync.js:30`). New version: the server copies `s.currency_rate` (`cost-grids.js:570-572`) and the client clones the source draft (`js/costgrid.js:831`). Clone: `verRate = parseFloat(newVer.currency_rate) || 1.0` (`js/costgrid.js:994`, `:1031`), pinned by `costgrid-clone.test.js`. New grid: EUR, where `resolveRoleRate` returns before using the rate (`costgrid-calc.js:96-98`).
- **Currency change order (c4 AC3).** Both branches set `this.draft.currencyRate` before `cgSyncRoleRatesToBaseline(true)` (`costgrid.html:1859-1860`, `:1932-1933`); pinned by "confirm sets the new rate before syncing" / "no-roles branch sets the new rate before syncing" (`costgrid-currency-change.test.js`).
- **`current_rate` guard (c4 AC2)** is a test, not prose: "current_rate is read only by the currency-change paths" (`costgrid-version-rate.test.js`).
- **Nullable `ratecard_entries.hourly_rate` (migration 029) in server readers.** Every SQL reader falls back to the role's rate: `COALESCE(pf_tr.rate_override, (SELECT pf_re.hourly_rate …), pf_ro.hourly_rate, 0)` (`api/src/lib/pot-fee-sql.js:8-12`), same in `api/src/routes/exports.js:265-270`. Client: `cgRatecardMaps` drops a `NaN` rate (`costgrid-calc.js:113-114`).
- **Removal of the old rate card modal (c3, `js/ratecards.js`).** No page, script or doc still calls `openRatecardsModal`, `_rcSaveEntries`, `_rcOpenEdit` or `_rcClonePrompt` (grep over `*.html`, `js/**/*.js`, `docs/js`, `docs/pages`, CLAUDE.md → 0).
- **c1 write paths.** Every route that writes a role rate, a rate card entry, a cost-grid role rate, a project resource rate or a POT amount runs `amountError`/`overridesError`/`ratecardEntryError` before writing (`config.js:226-228`, `:245-247`, `:407-413`; `cost-grids.js:711-716`; `projects.js:431-442`; `pots.js:246-247`, `:382-383`). The two unchecked shapes are already rows (B-186, B-185).

## Out of scope / roadmap notes

- **The rate card CSV export prints a NULL EUR rate as blank and drops every override** (`api/src/routes/exports.js:216-219`: `return rate != null ? rate : '';`, and the entries query reads only `hourly_rate`, `:191`). `/api/exports/*` has no UI since the Settings cycle, so nobody reads it today.
- **The server's fee fallback prices a non-EUR version with the EUR rate card/role rate, unconverted**, when a `task_roles` row has no `rate_override` (`pot-fee-sql.js:8-12`, `cost-grids.js:33`, `:282`). Unreachable while every row has an override (0 of 86 without), but it becomes reachable the day B-195 stops writing overrides for non-custom roles — that cycle must convert there or keep the snapshot.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
