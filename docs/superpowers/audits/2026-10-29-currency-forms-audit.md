# Currency Handling in Forms Audit (manual-test findings, item 5)

**Date:** 2026-10-29
**Scope (agreed with the user before any code was read):** verification-only. Every editable field that holds an hourly rate or a money amount, on every page — including inputs generated in `js/*.js`, injected modals and Vue templates — plus the API routes that write those values (accepted type, rounding, negatives, decimals). A finding is a field that diverges from the money rule (`formatMoneyInput` on focus, `parseMoney` on blur, then `formatMoney`, with the locale and decimals of the field's own currency), a server write that accepts or rounds inconsistently with the client, or a value formatted or computed in the wrong currency. B-183 is included as its own finding. **Out:** hours, the exchange rates of `master-currencies.html`, the monthly-distribution percentages, dates (cycles C1..C4), the rest of item 3 (non-money field validation), B-184, and the server's decision of the version rate (`api/src/lib/version-rate.js`).
**Ground truth:** CLAUDE.md "Money formatting and parsing" **without** its exception for `type="number"` rate inputs (removed by the user's decision recorded in `docs/superpowers/briefs/2026-10-29-currency-forms-audit-handoff.md`), `js/lib/money.js` and its server twin `api/src/lib/money-format.js`. The handoff's three directions were confirmed by the user at scope time: (1) each rate is formatted in the currency of its context — the version in `costgrid.html`, the column in the rate card, the field in `master-roles.html`, the project in `project-config.html`; (2) allowed decimals are the currency's (2 for EUR/USD/CHF, 0 for JPY), so `step="1"` vs `step="0.01"` is an inconsistency; (3) the POT amount is under the rule, in EUR. Reference implementations: the PTC input of `costgrid.html` and the phasing/PTC inputs of `project-config.html`.

## Method

- Re-ran the handoff's census (`grep -n 'type="number"' *.html`) and extended it to `js/*.js` (`grep -n '<input' js/*.js`), to every `<input>` in every page, and to `contenteditable` (none).
- Read each field's template, its handler, the save path and the API route it calls; read `js/lib/money.js` and `resolveRoleRate` (`js/lib/costgrid-calc.js`).
- Read the column types in `api/src/db/migrations/` (001, 005, 012, 013).
- Ran read-only `SELECT`s against the main stack's `pdash-db` (no container lifecycle operation) to measure existing data against each finding.

### Field inventory

| Page | Field | Control | Currency it should use | Uses money.js |
|---|---|---|---|---|
| `costgrid.html:336` | role hourly rate (`cg-rate-input`) | `type="number" min="0" step="1"`, `@change="onRateChange"` | version (`draft.currency`) | no |
| `costgrid.html:425-429` | task PTC | `type="text"`, `moneyInput`/`parseMoneyInput` | version | **yes** (reference) |
| `master-roles.html:128` | "Default rate (€/h)" | `type="number" min="0" step="1"`, `v-model="rf.rate"` | EUR | no |
| `master-roles.html:133-136` | "Default rate (<symbol>/h)" per active non-EUR currency | `type="number" min="0" step="0.01"` | that currency | no |
| `master-clients.html:386` | client rate card, EUR rate (`rc-client-rate`) | `type="number" min="0" step="1"`, HTML string | EUR | no |
| `master-clients.html:374` | client rate card, per-currency override (`rc-override-rate`) | `type="number" min="0" step="0.01"`, HTML string | the column's currency | no |
| `project-config.html:182` | task resource `hourlyRate` | `type="number" min="0" step="1"`, `v-model.number` | project | no |
| `project-config.html:217-220` | monthly phasing | `type="text"`, `moneyInput`/`parseMoney` | project | **yes** (reference) |
| `project-config.html:261-264` | PTC amount | `type="text"`, `moneyInput`/`parseMoney` | project | **yes** (reference) |
| `master-pipelines.html:301` | POT target amount | `type="number" min="0" step="1000"`, `v-model="potf.amount"` | EUR | no |
| `js/ratecards.js:276,286` | rate card editor modal, override and EUR rate | as `master-clients.html` | as above | no — unreachable, see "Out of scope" |

### Existing data (main stack, 2026-10-29)

| Measure | Count |
|---|---|
| active currencies | 2 (EUR `it-IT`, USD `en-US`); JPY and 17 others exist, inactive |
| versions by currency | EUR 14, USD 1 |
| `task_roles.rate_override` with a fractional part | 6 (USD `175.50` ×5, EUR `107.50` ×1) |
| project resources with a fractional `hourlyRate` | 1 (EUR `107.5`, stored as a JSON number) |
| `task_roles.rate_override IS NULL` | 0 |
| `ratecard_entries.hourly_rate = 0` | 0 |
| roles with `rate_overrides` set | 1 |
| negative rates (`task_roles`, `roles`, `ratecard_entries`) | 0 |
| POT amounts with a fractional part | 0 |

## Findings

### M-01 — Every rate input and the POT amount bypass `money.js`
- **Type:** DIVERGENT · **Severity:** Medium
- **Location:** `costgrid.html:336`, `master-roles.html:128,133-136`, `master-clients.html:374,386`, `project-config.html:182`, `master-pipelines.html:301-302`
- **Evidence:**
  ```html
  <input type="number" min="0" step="1" :value="r.rate" @change="onRateChange(r, $event)" :disabled="isReadOnly" class="cg-rate-input"
  ```
  ```js
  const newRate = parseFloat(val) || 0;          // costgrid.html:1600
  const rate  = parseFloat(this.rf.rate);        // master-roles.html:297
  if (v !== '') rateMap[inp.dataset.roleId] = parseFloat(v) || 0;   // master-clients.html:427
  const amount = parseFloat(this.potf.amount);   // master-pipelines.html:881
  ```
- **Description:** none of these fields formats on focus/blur or parses with the currency's locale; they rely on the browser's `type="number"` parsing (always `.` as the decimal separator in the DOM value, browser-locale display) and `parseFloat`. They are formatted in no currency at all, so the confirmed direction 1 (context currency) is unimplemented everywhere except the PTC/phasing inputs. **Root cause:** the money centralisation cycle (`f963069`) converted only the text money inputs and wrote the `type="number"` rate inputs into CLAUDE.md as an explicit exception; the POT amount was never considered a money input.

### M-02 — Allowed decimals do not follow the currency
- **Type:** INCONSISTENT · **Severity:** Medium
- **Location:** `costgrid.html:336` (`step="1"`), `master-roles.html:128` (`step="1"`) vs `:133` (`step="0.01"`), `master-clients.html:386` (`step="1"`) vs `:374` (`step="0.01"`), `project-config.html:182` (`step="1"`), `master-pipelines.html:301` (`step="1000"`); `js/lib/costgrid-calc.js:100`; `master-roles.html:136,349-351`
- **Evidence:**
  ```js
  const converted = Math.round(eurRate * (currencyRate || 1) * 100) / 100;   // costgrid-calc.js:100
  ```
  ```js
  fmtRate(n) { return Number(n).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }   // master-roles.html:349-351
  ```
- **Description:** EUR rates take integers in four fields and cents in none, while the non-EUR overrides beside them take cents; the POT steps by 1000. Existing data already has fractional rates in `step="1"` fields (6 `task_roles`, 1 project resource): the browser marks them `:invalid` and the spinner jumps them to an integer. `resolveRoleRate` rounds every converted rate to 2 decimals whatever the currency (a JPY version would get cents, against direction 2), and the roles table shows the EUR rate with 0 decimals, so a `107.50` role would read `108 €/h`. The server does not round to the currency's digits either: every rate column is `DECIMAL(10,2)` (`001_initial.sql:45,61,108`), so it rounds to 2 whatever the currency. **Root cause:** each field's `step` was picked on its own when it was added; there was no single notion of "the currency's decimals" outside `money.js` (`currencyInfo().digits`).

### M-03 — Rate labels and read-only rate displays hardcode `€` or show the raw number
- **Type:** DIVERGENT · **Severity:** Low
- **Location:** `master-roles.html:127` (`Default rate (€/h)`), `:170` (`{{ fmtRate(r.rate) }} €/h`); `master-clients.html:366` (`defFmt`, `toLocaleString('en', …)} €/h`), `:372` (placeholder `${roleDefault} (agency)`); `costgrid.html:337,338,479` (`roleBaseline(r).effectiveRate` raw), `:594` (`{{ row.effectiveRate }} {{ row.curCode }}/h`); `master-pipelines.html:298` (`Target (€)`)
- **Evidence:**
  ```js
  const defFmt   = defRate != null ? `${Number(defRate).toLocaleString('en', {minimumFractionDigits:0,maximumFractionDigits:2})} €/h` : '—';   // master-clients.html:366
  ```
  ```html
  <span class="cg-rm-rate" …>{{ row.effectiveRate }} {{ row.curCode }}/h</span>   <!-- costgrid.html:594 -->
  ```
- **Description:** the values shown next to the rate inputs (the baseline in the "Custom · reset" note and tooltip, the role-picker badge, the agency-default column, the placeholders) use an English locale, or no formatting, and a hardcoded `€`, so in the same row the number convention can differ from the input's. The role-picker comment cites board 5.16's `135.00 EUR/h`; the template prints `135 EUR/h`. **Root cause:** same as M-01: rates were outside the money rule, so their displays never went through `formatMoney`/`currencyInfo`. `toLocaleString` is allowed by the guard test for non-money numbers, which is why `js/lib/money-guard.test.js` does not catch these.

### M-04 — A cost-grid rate of 0 is saved as "no rate" and the budget then uses the role's EUR rate
- **Type:** BUG (server) · **Severity:** Medium
- **Location:** `api/src/routes/cost-grids.js:716-720`, `:825-830`, `:32`, `:281`; `js/api-sync.js:104-107`
- **Evidence:**
  ```js
  rateByCode[r.roleCode] = parseFloat(r.rate) || null;                    // cost-grids.js:719
  rateOverride: rateByCode[code] ?? null,                                 // cost-grids.js:828
  COALESCE(SUM(tr.days * COALESCE(tr.rate_override, r.hourly_rate, 0)), 0) AS fee   // cost-grids.js:32, :281
  ```
- **Description:** typing `0` in a role's rate sets `role.rate = 0` (`costgrid.html:1600-1602`), but the structure `PUT` turns `0` into `NULL`, and both budget queries then fall back to `roles.hourly_rate`, the role's **EUR** default, applied as is in a USD version and ignoring the client rate card in an EUR one. On reload `cgLoadStructureFromApi` reads `tr.hourly_rate` for that role with `isCustom = false` (`api-sync.js:106-107`), so the editor too shows a rate the user never chose. 0 rows are `NULL` today. **Root cause:** `|| null` was written to skip a missing rate, and makes no difference between a missing rate and a rate of 0.

### M-05 — Negative and non-numeric rates and amounts reach the database or a 500
- **Type:** MISSING (client + server) · **Severity:** Medium
- **Location:** client: `costgrid.html:1596-1603`, `master-clients.html:425-437`, `project-config.html:182`; server: `api/src/routes/cost-grids.js:716-720`, `api/src/routes/config.js:223-229` (roles `POST`), `:238-248` (roles `PATCH`), `:392-404` (rate card entries `PATCH`), `api/src/routes/projects.js:418-428,479-485` (tasks `PUT`), `api/src/routes/pots.js:243-257,377-388`
- **Evidence:**
  ```js
  if (hourlyRate !== undefined)   { params.push(hourlyRate);  fields.push(`hourly_rate = $${params.length}`); }   // config.js:247
  [req.params.id, e.roleId, e.hourlyRate, JSON.stringify(overrides)]                                         // config.js:403
  [clientGroupId || null, clientId || null, specialLabel || null, parseInt(year), parseFloat(amount)]          // pots.js:253
  ```
- **Description:** `min="0"` only constrains the spinner; a typed `-50` passes `parseFloat` in the cost grid, the rate card and project-config (only `master-roles.html:302` and `master-pipelines.html:882` check `< 0` client-side). No route checks that a rate is a finite number ≥ 0: the roles, rate card and structure routes store whatever arrives (a non-numeric string becomes a Postgres error, i.e. a 500); project resources are stored as an unvalidated JSON blob, where only `soldHours` is checked. The POT routes `parseFloat` without a `NaN` check and rely on `CHECK (amount >= 0)` (`005_drafts_pipeline_year_pot.sql:34`), so a negative or invalid amount is a 500, not a 400. 0 negative rates exist today. **Root cause:** the routes validate what earlier cycles needed (sold hours, dates, project rules); rates and amounts were trusted to the `type="number"` control.

### M-06 — Client rate card: a blank EUR rate is saved as 0, and a cleared rate is never removed
- **Type:** BUG · **Severity:** Medium
- **Location:** `master-clients.html:425-447`, `api/src/routes/config.js:392-404`, `js/costgrid.js:342-343`
- **Evidence:**
  ```js
  hourlyRate:    rateMap[rid] ?? 0,                       // master-clients.html:445
  if (!isNaN(rate)) _cgActiveRatecardMap[rid] = rate;      // js/costgrid.js:343
  ```
- **Description:** (a) a role with a USD override and a blank EUR field ("agency default") is sent with `hourlyRate: 0`, stored as 0, and the cost grid then takes 0 as the client's EUR rate (`!isNaN(0)`), so the role's default rate is replaced by 0 in every EUR proposal on that rate card. The form reloads it blank (`entryMap[rid] = parseFloat(…) || null`, `master-clients.html:346`), so the user never sees it. (b) The payload carries only non-blank fields and the route only upserts, so clearing a field to go back to the agency default leaves the old entry in place. 0 entries with `hourly_rate = 0` exist today. **Root cause:** the payload has no "unset" value: blank and 0 both end up as 0, and the route never deletes an entry.

### M-07 — Creating a role drops the per-currency default rates typed in the form
- **Type:** BUG · **Severity:** Medium
- **Location:** `master-roles.html:309-320`, `api/src/routes/config.js:223-229`
- **Evidence:**
  ```js
  const created = await Api.roles.create({ label, code, hourlyRate: rate });   // master-roles.html:319
  this.roles.push({ id: created.id, label, code, rate, rateOverrides: {} });
  ```
- **Description:** the "New role" form shows a "Default rate (<symbol>/h)" field per active non-EUR currency, and `saveRole` builds `rateOverrides` from them, but only the update path sends it; the create call and `POST /api/config/roles` ignore them, so the values are lost without a message. The `POST` also stores `hourlyRate || null`, so a role created with rate 0 gets `NULL`. **Root cause:** the per-currency fields were added to the shared form (migration `013_role_rate_overrides.sql`) and wired into `PATCH` only.

### M-08 — The cost-grid editor converts EUR rates with the live rate, not the version's (B-183)
- **Type:** DIVERGENT (value) · **Severity:** Medium
- **Location:** `costgrid.html:1166` (`roleModalRoleRow`), `:1591` (`roleBaseline`); `js/costgrid.js:359-361` (`cgSyncRoleRatesToBaseline`), `:381-383` (`cgPreviewRateChange`)
- **Evidence:**
  ```js
  const currencyRate = parseFloat((this.currencies || []).find(c => c.code === currency)?.current_rate) || 1.0;   // costgrid.html:1166
  ```
- **Description:** the baseline of every non-overridden role in a non-EUR version is `eurRate × currencies.current_rate`, while the version's own rate (`draft.currencyRate`, decided by the server through `version-rate.js`) is what converts the version to EUR. Once the two rates differ, the "Custom" flag (`newRate !== baseline.effectiveRate`, `costgrid.html:1602`), the reset value and the role-picker badge all use a rate the version does not. It touches the same fields as M-01 but concerns the value, not the format. **Root cause:** `resolveRoleRate` predates the per-version rate snapshot; its callers were not switched to `draft.currencyRate` when the server became the owner of the rate (B-176). The currency-change paths (`costgrid.html:1838,1911`) also read `current_rate`, but only as the optimistic value before the server's answer, which this audit does not reopen.

## Ruled out

- **Reference inputs:** the cost-grid PTC (`costgrid.html:425-429`) and project-config phasing and PTC (`project-config.html:217-220,261-264`) follow the rule with the right currency (version, project). The cost-grid PTC parses on `@input` rather than on blur, keeping the raw text while focused (`ptcRaw`); the result is the same, and it is what lets autosave run while typing.
- **Currency list in the rate forms:** `master-clients.html:242` loads `Api.currencies.active()` and `master-roles.html:131` filters `c.active`, so both show columns for the same currencies.
- **Project resource rates in storage:** the one fractional value is a JSON number, `v-model.number` keeps numbers, and `resolveFee` (`api/src/lib/rate-resolve.js:13-15`) falls back to 0 on a blank.
- **POT currency:** POT amounts are formatted with `'EUR'` everywhere they are displayed (`master-pipelines.html:157-172,351-356`), which matches direction 3; only the input diverges (M-01, M-02).
- **Version rate on the server:** `cost-grids.js:408-412,481-487` decides it through `versionRate`; not in question.

## Out of scope / roadmap notes

- **Dead code:** `js/ratecards.js`'s rate card editor modal (`openRatecardsModal`, `:393`, and `_rcRenderEntries`/`_rcSaveEntries`, `:243-391`) has no caller in any page; only `loadRatecardsForDropdown` (`:404`) is used (`costgrid.html:1366`, `js/costgrid.js:334`). It duplicates the rate inputs and the save logic of `master-clients.html`, M-06 included. A fix cycle has to delete or align it.
- **`PATCH /api/config/ratecards/:id/entries`** (`config.js:392-404`) upserts entry by entry through `query()` with no transaction, so a failure halfway through leaves a partially saved rate card.
- **Column limits:** `tasks.ptc`, `task_roles.rate_override` and `ratecard_entries.hourly_rate` are `DECIMAL(10,2)` (max 99,999,999.99) while `pots.amount` is `NUMERIC(14,2)`. In a 0-decimal currency such as JPY, a PTC larger than that would be a 500 (follows from the column type; not executed).
- **Inputs for the brief (facts, not findings):**
  - `formatMoneyInput` returns `''` for any amount ≤ 0 (`money.js:46`) and `parseMoney('')` returns 0 (`:75-78`). Today a blank cost-grid rate means "reset to baseline" (`costgrid.html:1598`), and a blank rate card field means "agency default". So the fix has to test for empty text before parsing, or it will lose the difference between 0, blank and "missing" (see M-04, M-06).
  - `money.js` parsing is strict: text in the other convention returns 0, and the phasing input then removes the month (`project-config.html:220`). The rate inputs will inherit that behaviour.
  - `master-roles.html` keeps its currencies in `this.currencies` and does not set `window.__currencies`; the rate-card markup is built as an HTML string, not a Vue template, so applying focus/blur formatting there means event listeners or a rewrite to a template.
  - `js/lib/money-guard.test.js` is the existing pattern for pinning "no money input outside money.js"; it currently checks `Intl.NumberFormat`, not `type="number"` money fields.
  - The CLAUDE.md "Money formatting and parsing" bullet that exempts `type="number"` rate inputs has to change in the same fix cycle (handoff decision).

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
