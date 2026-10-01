# Money wrapper cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every one-line money wrapper and call `formatMoney(amount, code, currencies)` from `js/lib/money.js` directly, with the same output on screen as today.

**Architecture:** One task and one commit per page/file group; each task migrates call sites, bumps the `?v=N` of every file it edits, and keeps `npm test` green. The wrapper definitions are deleted only in the last task, once a repo-wide grep finds no caller. Accessory rules (`'—'` for null/zero, `|| 0`, `trim()`) stay at the call site as explicit ternaries, reproducing that site's own current rule.

**Tech Stack:** Vue 3 (CDN, no build), classic scripts + ES modules, vitest + jsdom (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-01-money-wrapper-cleanup-design.md`

## Global Constraints

- Behaviour unchanged: every amount shown is identical to today; differences between sites (null vs zero handling) are NOT unified.
- No intermediate helper (not in `money.js`, not per page): call sites call `formatMoney` directly.
- Non-money formats (hours, counts, dates, exchange rates) keep `toLocaleString`; `api/src/lib/money-format.js` untouched.
- No `Intl.NumberFormat`/`toLocaleString` on an amount outside `js/lib/money.js` (guard test).
- Cache-busting: after editing a versioned file, grep the whole repo for every `?v=N` reference to that exact path and bump all to the same new N. `.html` pages are not versioned. Current versions: `js/core.js?v=8` (~13 pages), `js/costgrid.js?v=37` (pipeline.html, costgrid.html), `js/lib/pipeline-calc.js?v=3` (pipeline.html), `js/portfolio.js` (planning.html, currently **unversioned**: add `?v=2`).
- `window.formatMoney` is set by `js/lib/money.js` (a module script). Vue pages must read it only after it has run (inside `data()`/`created`/`mounted`/methods, which run at mount after the deferred/module queue). Never at the top level of a classic inline script.
- Run `git` from the repo root; commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Work happens on a feature branch/worktree (per `/finish-cycle` process), never directly on `main`; do not touch the main Docker stack.

## Review Focus

- A Vue template referencing `formatMoney`/`currencies` that is not exposed on the instance renders blank or throws at runtime, not in tests → every task ends with a manual page check and a clean console.
- `window.__currencies` empty at the time `currencies` is copied into `data` (portfolio.html, timesheets.html) → amounts silently fall back to the EUR default format; copy it right after the load call.
- Zero/null amounts: `config.html`'s two `fmtAmtC` differ (`!n` vs `n == null || n === 0`) and `fmtAmount` formats zero as `€ 0,00`; keep each site's rule (a mistaken unification changes `0` display).
- `portfolio.html` overview (`pinnedSummary`) used `currentCfg`, which is `null` on a fresh load (→ EUR) but stale after a dashboard visit; the plan fixes it to EUR explicitly (see Task 6) — mixed-currency totals remain out of scope.
- A removed name still referenced by a page not in the grep scope (`test-cases.html`, docs) → final guard test + grep of `*.html`.

---

### Task 1: `timesheets.html`

**Files:**
- Modify: `timesheets.html:188-189` (template), `:295` (returned `fmtMoney`), the init block at `:275-282`, the Vue `data`/setup that owns `modal`.
- Modify: `timesheets.html` `<script src="js/core.js?v=8">` → handled in Task 8 (core.js is edited there).

**Interfaces:**
- Consumes: `window.formatMoney(amount, code, currencies)`, `window.__currencies` (set at `timesheets.html:281`).
- Produces: template identifiers `formatMoney` and `currencies` on this page's Vue instance.

- [ ] **Step 1: Read `timesheets.html:268-300`** to see how the Vue app is created (setup vs options API) and where `window.__currencies` is assigned relative to `.mount()`.

- [ ] **Step 2: Expose `formatMoney` and `currencies`.** In the returned object/`data` that today contains `fmtMoney,` (`:295`) replace that entry with:

```js
      formatMoney: window.formatMoney,
      currencies: window.__currencies || [],
```
If `.mount()` can run before `window.__currencies` is assigned (`:281`), instead declare `currencies: []` and assign `this.currencies = window.__currencies;` immediately after the assignment at `:281` (use the instance/ref in scope there).

- [ ] **Step 3: Replace the two template calls.**

`timesheets.html:188`: `{{ fmtMoney(row.fee || 0, modal.currency) }}` → `{{ formatMoney(row.fee || 0, modal.currency || 'EUR', currencies) }}`
`timesheets.html:189`: `{{ fmtMoney((row.fee || 0) * (row.hours || 0), modal.currency) }}` → `{{ formatMoney((row.fee || 0) * (row.hours || 0), modal.currency || 'EUR', currencies) }}`

(`fmtMoney` returned `—` only for null/undefined; both arguments here are already numbers via `|| 0`, so no ternary is needed. The `|| 'EUR'` reproduces `core.js`'s default when `modal.currency` is empty.)

- [ ] **Step 4: Verify.** `grep -n "fmtMoney" timesheets.html` → no match. Run `npm test` → PASS. Open `/timesheets.html`, open a project's detail modal: fee and total columns show the same amounts as before the change; console clean.

- [ ] **Step 5: Commit**

```bash
git add timesheets.html
git commit -m "refactor: timesheets.html calls formatMoney directly

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `js/costgrid.js` + `costgrid.html` (`cgFmtCurrency`, `fmtCur`)

**Files:**
- Modify: `js/costgrid.js:57-59` (delete `cgFmtCurrency`), `:209` (use site)
- Modify: `costgrid.html:228,235,236,238,292,293,295,323,327,336,356,357,359` (template `fmtCur(` calls), `:1227` (delete method `fmtCur`), the `data()`/created that owns `currencies` (`:718`, `:1509`)
- Modify: `js/lib/money-characterization.test.js` (drop the `cgFmtCurrency` block and its loader)
- Bump: `js/costgrid.js?v=37` → `?v=38` in `pipeline.html:422` and `costgrid.html:675` (re-grep `js/costgrid.js` first; bump every hit)

**Interfaces:**
- Consumes: `window.formatMoney`, `this.currencies` (already `costgrid.html:718`, filled at `:1509`).
- Produces: `formatMoney` data property on costgrid's Vue app.

- [ ] **Step 1: Replace the use in `js/costgrid.js:209`.**

```js
      const fmt         = a => window.formatMoney(a, v.currency || 'EUR', window.__currencies);
```

- [ ] **Step 2: Delete `cgFmtCurrency`** (`js/costgrid.js:57-59`, three lines plus the blank line after it). `grep -n "cgFmtCurrency" js/costgrid.js costgrid.html pipeline.html` → only `costgrid.html:1227` remains.

- [ ] **Step 3: Expose `formatMoney` on costgrid's Vue app.** In `data()` next to `clients: [], currencies: [],` (`costgrid.html:718`) add `formatMoney: window.formatMoney,`. If that line is not reached after money.js ran (it is: the Vue app mounts inside `DOMContentLoaded`), no further change.

- [ ] **Step 4: Replace all `fmtCur(X)` in the template** with `formatMoney(X, draft.currency || 'EUR', currencies)` (same `X`, including parenthesised expressions). The 13 template lines are: 228, 235, 236, 238, 292, 293, 295, 323, 327, 336, 356, 357, 359. Example (`:236`):

Before: `{{ grand.ptc > 0 ? fmtCur(grand.ptc) : '—' }}`
After:  `{{ grand.ptc > 0 ? formatMoney(grand.ptc, draft.currency || 'EUR', currencies) : '—' }}`

Example with a nested expression (`:292`):

Before: `fmtCur(phaseTotals(phase).fee + phaseTotals(phase).ptc)`
After:  `formatMoney(phaseTotals(phase).fee + phaseTotals(phase).ptc, draft.currency || 'EUR', currencies)`

Keep every surrounding ternary (`> 0 ? … : '—'`) exactly as is. The old method used `this.draft?.currency`; in templates `draft` is always set where these rows render (they already read `draft.roles`/`draft.currency` nearby).

- [ ] **Step 5: Delete the method** `fmtCur(amount) { return cgFmtCurrency(...); },` at `costgrid.html:1227`.

- [ ] **Step 6: Test migration.** In `js/lib/money-characterization.test.js` remove `loadCgFmtCurrency` (lines 31-34) and the `describe('cgFmtCurrency …')` block (lines 60-69). `costgridSrc` (line 22) becomes unused: delete it too.

- [ ] **Step 7: Bump `?v=`.** `grep -rn "js/costgrid.js" *.html` and change every `?v=37` to `?v=38`.

- [ ] **Step 8: Verify.** `grep -rn "cgFmtCurrency\|fmtCur\b" --include=*.js --include=*.html .` (excluding `node_modules`, `docs`) → no match. `npm test` → PASS. Manual: `/costgrid.html?cgId=…&verId=…` — grid totals, per-phase and per-task amounts, PTC input (focused and blurred) and the pipeline board's linked-version rows (`js/costgrid.js:209`, `pipeline.html` versions list) show the same amounts in EUR and in a non-EUR currency; console clean.

- [ ] **Step 9: Commit**

```bash
git add js/costgrid.js costgrid.html pipeline.html js/lib/money-characterization.test.js
git commit -m "refactor: remove cgFmtCurrency and fmtCur wrappers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `js/lib/pipeline-calc.js` + `pipeline.html` (`pbFmtMoney`)

**Files:**
- Modify: `js/lib/pipeline-calc.js:87-89` (delete function), `:119` (delete `window.pbFmtMoney = pbFmtMoney;`)
- Modify: `pipeline.html:225,229,233,290,296` (template), `:581-588`, `:697-702` (HTML strings), `:811-814` (comment + Vue method)
- Modify: `js/lib/pipeline-calc.test.js:3,74-93` (import and `describe('pbFmtMoney')`), `js/lib/money-characterization.test.js` (import line 3, `describe('pbFmtMoney …')` lines 71-80)
- Bump: `js/lib/pipeline-calc.js?v=3` → `?v=4` (re-grep; `pipeline.html:421` and any other page)

**Interfaces:**
- Consumes: `window.formatMoney`, `this.currencies` (filled `pipeline.html:876`), `window.__currencies`.
- Produces: `formatMoney` data property on pipeline's Vue app.

- [ ] **Step 1: Delete `pbFmtMoney`** from `js/lib/pipeline-calc.js` (the `export function pbFmtMoney(n, code, currencies) { return formatMoney(...) }` block) and the bridge line `window.pbFmtMoney = pbFmtMoney;`. If `formatMoney` was imported only for it (check the top-of-file imports), remove that import too.

- [ ] **Step 2: Expose `formatMoney`.** In pipeline's `data()` next to `currencies: [],` (`pipeline.html:484`) add `formatMoney: window.formatMoney,`. Delete the comment at `:811-813` and the method `pbFmtMoney(n, code) { return window.pbFmtMoney(n, code, this.currencies); },` at `:814`.

- [ ] **Step 3: Template calls** (`pipeline.html:225,229,233,290,296`): `pbFmtMoney(X, selectedVersion.currency || 'EUR', currencies)` → `formatMoney(X, selectedVersion.currency || 'EUR', currencies)`. Argument lists are already complete; only the function name changes.

- [ ] **Step 4: JS-string sites** (`pipeline.html:581-588`, `:697-702`): `pbFmtMoney(X, C, window.__currencies)` → `window.formatMoney(X, C, window.__currencies)` (name change only; these are inside methods).

- [ ] **Step 5: Tests.** In `js/lib/pipeline-calc.test.js` remove `pbFmtMoney` from the import list (line 3) and delete the whole `describe('pbFmtMoney', …)` block (lines 74-93); its cases are covered by `js/lib/money.test.js`. In `js/lib/money-characterization.test.js` remove the `import { pbFmtMoney } …` line (3) and the `describe('pbFmtMoney …')` block (71-80).

- [ ] **Step 6: Bump `?v=`.** `grep -rn "pipeline-calc.js" *.html js` → change `?v=3` to `?v=4` everywhere it is referenced.

- [ ] **Step 7: Verify.** `grep -rn "pbFmtMoney" --include=*.js --include=*.html .` (excluding `node_modules`, `docs`) → no match. `npm test` → PASS. Manual: `/pipeline.html` — column totals footer (EUR and secondary PTC line), card amounts, detail panel (fee, PTC, total, phase and task totals) for a EUR and a non-EUR proposal; "≈ EUR" equivalents; console clean.

- [ ] **Step 8: Commit**

```bash
git add js/lib/pipeline-calc.js js/lib/pipeline-calc.test.js js/lib/money-characterization.test.js pipeline.html
git commit -m "refactor: remove pbFmtMoney wrapper and its window bridge

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `config.html` (`fmtAmount`, two `fmtAmtC`)

**Files:**
- Modify: `config.html:316,322,325,327,381,386,403,504-507,555` (template `fmtAmount(`), `:1846,1848,1860,1876,1884,1893,1902` (`this.fmtAmount(` inside template strings), `:1946-1948` (method), `:1098-1102` and `:1186-1190` (two local `fmtAmtC`/`fmtAmt` closures and their uses at `:1151,1156,1229,1230,1234`)

**Interfaces:**
- Consumes: `window.formatMoney`, `window.__currencies` (set `config.html:1263`). `this.currencies` on this page is the *admin list of all currencies* (different shape), so it must NOT be used for formatting — keep passing `window.__currencies`.
- Produces: `formatMoney` data property on config's Vue app (templates cannot read `window`).

- [ ] **Step 1: Expose.** In `data()` next to `currencies:    [],` (`config.html:1055`) add `formatMoney: window.formatMoney,` and `activeCurrencies: [],`. Right after `window.__currencies = await Api.currencies.active();` (`:1263`, inside the mounted/created hook) add `this.activeCurrencies = window.__currencies || [];` (wrap per the existing try/catch; if that line is outside the component, set it where `this` is available, immediately after the same load).

- [ ] **Step 2: Template sites (`fmtAmount(X)`)** → `formatMoney(X, 'EUR', activeCurrencies)` for lines 316, 322, 325, 327, 381, 386, 403, 504-507, 555. Example (`:505`):

Before: `{{ fmtAmount(+pot.achieved_total || 0) }}`
After:  `{{ formatMoney(+pot.achieved_total || 0, 'EUR', activeCurrencies) }}`

Keep the existing ternaries (`:316` `yearTotals[…] ? … : '—'`).

- [ ] **Step 3: Method-body sites (`this.fmtAmount(X)`)** at lines 1846, 1848, 1860, 1876, 1884, 1893, 1902 → `window.formatMoney(X, 'EUR', window.__currencies)`. Example (`:1846`):

Before: `${h.old_value != null ? this.fmtAmount(h.old_value) : '—'}`
After:  `${h.old_value != null ? window.formatMoney(h.old_value, 'EUR', window.__currencies) : '—'}`

- [ ] **Step 4: Delete the method** `fmtAmount(n) { return window.formatMoney(n, 'EUR', window.__currencies); },` (`config.html:1946-1948`). Do **not** touch `fmtRate` (`:1943`, a rate, not money).

- [ ] **Step 5: The two `fmtAmtC` closures.** Replace each local definition and its `fmtAmt` shorthand by inline calls that keep that closure's own zero rule:

First closure (`:1098-1102`, rule: `!n` → `'—'`): remove the two definitions and rewrite the uses at `:1151` and `:1156`:

```js
// :1151
? `${(rowTotal ? window.formatMoney(rowTotal, (p.currency || 'EUR').trim(), window.__currencies) : '—')}<br><span style="font-size:.7rem;color:#6b7280">(${(rowTotalEur ? window.formatMoney(rowTotalEur, 'EUR', window.__currencies) : '—')})</span>`
// :1156
const localStr = val.amount ? window.formatMoney(val.amount, (p.currency || 'EUR').trim(), window.__currencies) : '—';
```
Second closure (`:1186-1190`, rule: `n == null || n === 0` → `'—'`): same shape with that rule, for the uses at `:1229`, `:1230`, `:1234`:

```js
// :1229
? `${(rowTotal == null || rowTotal === 0 ? '—' : window.formatMoney(rowTotal, (p.currency || 'EUR').trim(), window.__currencies))}<br><span style="font-size:.7rem;color:#6b7280">(${(rowTotalEur == null || rowTotalEur === 0 ? '—' : window.formatMoney(rowTotalEur, 'EUR', window.__currencies))})</span>`
// :1230
: (rowTotal == null || rowTotal === 0 ? '—' : window.formatMoney(rowTotal, (p.currency || 'EUR').trim(), window.__currencies));
// :1234
const localStr = (v == null || v === 0) ? '—' : window.formatMoney(v, (p.currency || 'EUR').trim(), window.__currencies);
```
Read each of those lines first and adapt the surrounding template literal exactly (the snippets show the replaced expressions only; keep the rest of each line).

- [ ] **Step 6: Verify.** `grep -n "fmtAmount\|fmtAmtC\|fmtAmt\b" config.html` → no match. `npm test` → PASS. Manual `/config.html`: Pipelines & POT tab (year totals, pot rows, history modal, pot detail), Currency/rate-card print/export tables with a zero amount and a non-EUR project; same values as before; console clean.

- [ ] **Step 7: Commit**

```bash
git add config.html
git commit -m "refactor: config.html calls formatMoney directly

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `project-config.html` (`fmtMoney` Vue method)

**Files:**
- Modify: `project-config.html:176,183,194,211,213,217,255,257,268` (template), `:365-366` (template, passes `project.currency`), `:925` (method), `:1036`, `:1063` (method bodies `this.fmtMoney`), `data()` (`:431` region)

**Interfaces:**
- Consumes: `this.currencies` (`:431`, filled `:515`), `window.formatMoney`.
- Produces: `formatMoney` data property.

- [ ] **Step 1: Expose.** In `data()` next to `currencies: [],` (`:431`) add `formatMoney: window.formatMoney,`.

- [ ] **Step 2: Template.** The method was `formatMoney(amount || 0, cur || this.project?.currency, window.__currencies)`. Replace every `fmtMoney(X)` in the template (lines 176, 183, 194, 211, 213, 217 (two calls), 255, 257, 268) with `formatMoney(X || 0, project.currency, currencies)`. Example (`:194`):

Before: `{{ grandTotalBudget > 0 ? fmtMoney(grandTotalBudget) : '—' }}`
After:  `{{ grandTotalBudget > 0 ? formatMoney(grandTotalBudget, project.currency, currencies) : '—' }}`

(`|| 0` is only needed where `X` can be non-numeric; the guarded `> 0 ? … : '—'` sites and `parseMoney` results are numbers, so omit it there. Where `X` is `project.phasing[ym]` under `> 0 ?` it is also a number.) The two `@blur` handlers (`:213`, `:257`) use `fmtMoney(v)` / `fmtMoney(item.amount)` inside arrow functions: same replacement (`formatMoney(v, project.currency, currencies)`).

- [ ] **Step 3: Explicit-currency sites** (`:365-366`): `fmtMoney(row.fee || 0, project.currency)` → `formatMoney(row.fee || 0, project.currency, currencies)`; `fmtMoney((row.fee || 0) * (row.hours || 0), project.currency)` → `formatMoney((row.fee || 0) * (row.hours || 0), project.currency, currencies)`.

- [ ] **Step 4: Method bodies** (`:1036`, `:1063`): `const fmtB = n => this.fmtMoney(n);` → `const fmtB = n => window.formatMoney(n || 0, this.project?.currency, window.__currencies);` and `const fmtB = n => this.fmtMoney(Math.abs(n));` → `const fmtB = n => window.formatMoney(Math.abs(n) || 0, this.project?.currency, window.__currencies);`.

- [ ] **Step 5: Delete the method** `fmtMoney(amount, cur) {…},` at `:925` (keep `moneyInput`/`parseMoney` at `:926-927`).

- [ ] **Step 6: Verify.** `grep -n "fmtMoney" project-config.html` → no match. `npm test` → PASS. Manual `/project-config.html?projectId=…`: task rows, total budget, phasing inputs (focus shows raw, blur reformats), PTC items and total, rate-card/linked-version table (`:365`) in EUR and CHF; console clean.

- [ ] **Step 7: Commit**

```bash
git add project-config.html
git commit -m "refactor: project-config.html calls formatMoney directly

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `portfolio.html` (`fmtMoney`, `fmtVar`, `currentCfg`)

**Files:**
- Modify: `portfolio.html` — every `fmtMoney` use (list from `grep -n "fmtMoney" portfolio.html`: lines 91-92, 126-127, 154-155, 187-188, 245, 247, 249, 295-298, 305-308, 327, 329, 361-363, 378-380, 395-397, 419-421, 425-427, 451, 457, `:653`, `:934`, `:1027`, `:1083`, `:1185-1187` and the lines the earlier grep reported as "[Omitted long matching line]" — re-run the grep and treat every hit), `fmtVar` (`:93,128,156,189,1027`), `:1121` (`currentCfg = cfg;`)

**Interfaces:**
- Consumes: `window.formatMoney`, `window.__currencies` (loaded `portfolio.html:910` via `loadCurrenciesFromApi()`).
- Produces: instance members `formatMoney`, `currencies`, computed `dashCurrency`, method `fmtVar(v, cur)` (kept: it is a sign-prefix formatter, not a wrapper of a wrapper — its body now calls `formatMoney`).

- [ ] **Step 1: Expose and define `dashCurrency`.** In the Vue app:
  - `data()`: add `formatMoney: window.formatMoney,` and `currencies: [],`.
  - Right after `await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadCurrenciesFromApi()]);` (`:910`) add `this.currencies = window.__currencies || [];`.
  - `computed` (next to `dashboardProject`, `:635`):

```js
      dashCurrency() {
        return this.dashboardProject?.currency || 'EUR';
      },
```
(`currentCfg` was `dashboardProject`, so this is the exact value `fmtMoney(n)` used while a dashboard is open.)

- [ ] **Step 2: Rewrite `fmtVar`** (`:1027`) and drop `fmtMoney,` from the returned methods (`:934`). Inside a method `formatMoney` is not in scope, so use `this.`:

```js
      fmtVar(v, cur) { return `${v >= 0 ? '+' : ''}${this.formatMoney(v, cur || this.dashCurrency, this.currencies)}`; },
```
`fmtVar` calls without `cur` (the two at `:93`, pinned summary) would now use the dashboard currency; Step 4 makes them pass `'EUR'` explicitly.

- [ ] **Step 3: Dashboard sites (no code passed) → `dashCurrency`.** For every `fmtMoney(X)` in the dashboard view (lines 245, 247, 249, 295-298, 305-308, 327, 329, 361-364, 378-381, 395-398, 419-427, 451, 457 — everything under the `view === 'dashboard'` block, i.e. `portfolio.html` lines ~200-460): `fmtMoney(X)` → `formatMoney(X, dashCurrency, currencies)`. Example (`:296`):

Before: `{{ m.spent !== null ? fmtMoney(m.spent) : '—' }}`
After:  `{{ m.spent !== null ? formatMoney(m.spent, dashCurrency, currencies) : '—' }}`

Note: fields named `…Eur` (`soldEur`, `inPeriodEur`, …) were formatted with the same code-less `fmtMoney`, i.e. the project currency; keep exactly that (`dashCurrency`) — do not "fix" it here.

`fmtMoney(p.amount || 0)` (`:327`) → `formatMoney(p.amount || 0, dashCurrency, currencies)`. The null case: `fmtMoney` returned `—` for null/undefined; `formatMoney` would format them as 0. For every dashboard site whose argument can be `null`/`undefined` and is NOT already guarded by a ternary in the same expression (check each: `:91-92` are overview, `:361-364`/`:378-381`/`:395-398` `c.soldEur`/`c.inPeriodEur`, `:419-427`, `:451`), reproduce the old rule with `X == null ? '—' : formatMoney(X, dashCurrency, currencies)`. When an expression is already guarded by `!== null`/`> 0`, leave the guard and drop nothing.

- [ ] **Step 4: Overview sites.** The pinned summary (`:91-93`) has no currency of its own and mixes currencies (out of scope); `currentCfg` was `null` on a fresh load → `'EUR'`. Make it explicit: `fmtMoney(pinnedSummary.phasing[ym])` → `formatMoney(pinnedSummary.phasing[ym], 'EUR', currencies)` (lines 91, 92: four calls) and `fmtVar(…)` at `:93` → `fmtVar(…, 'EUR')` (two calls). Sites that already pass a code (`:126-127`, `:154-155`, `:187-188`, `:128`, `:156`, `:189`) → `formatMoney(X, <that code>, currencies)` / unchanged `fmtVar(…, <that code>)`; keep their `|| 'EUR'` and ternaries.

Deliberate difference (record it in the commit message): after visiting a dashboard and returning to the overview in the same page session, the pinned summary used to inherit the last dashboard's currency (stale `currentCfg`); it now always shows EUR.

- [ ] **Step 5: Computed and methods using the global `fmtMoney`.**
  - `:653` `kpiBudgetEurSub`: `${fmtMoney(this.kpis.feesOnly)} fees + ${fmtMoney(this.kpis.totalPtc)} PTC` → `${this.formatMoney(this.kpis.feesOnly, this.dashCurrency, this.currencies)} fees + ${this.formatMoney(this.kpis.totalPtc, this.dashCurrency, this.currencies)} PTC`.
  - `:1083` (`fmtMoney(displayTotal, cur)`, `displayFee`, `totalPtc`, with explicit `cur`) → `window.formatMoney(X, cur, window.__currencies)`.
  - `:1185-1187` (chart tooltip callbacks): read the surrounding lines; inside a non-arrow callback `this` is not the Vue instance, so use `window.formatMoney(X, currencyForChart, window.__currencies)` with `const currencyForChart = this.dashCurrency;` captured before building the chart options (same method, above the Chart config).

- [ ] **Step 6: Remove `currentCfg`.** Delete the assignment line `portfolio.html:1121` (`currentCfg = cfg; …`). Keep `const cfg = this.dashboardProject;` (`:1120`) only if `cfg` is still used below (it is: breadcrumbs).

- [ ] **Step 7: Verify.** `grep -n "fmtMoney\|currentCfg" portfolio.html` → no match. `npm test` → PASS. Manual `/portfolio.html`: overview (cards, program summaries, pinned summary with a selected project), then a dashboard of an EUR project and a CHF project: KPIs, monthly table, PTC table, task/role/group summaries (hours + amount lines), burndown tooltip; compare against the same screens on `main` (`git stash`/second tab on the main stack is NOT needed: use `scripts/test-branch.sh up` for the branch, main stays untouched). Console clean.

- [ ] **Step 8: Commit**

```bash
git add portfolio.html
git commit -m "refactor: portfolio.html calls formatMoney directly, drop currentCfg

The pinned summary now always shows EUR (it used to inherit the last
dashboard's currency through the stale currentCfg).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `js/portfolio.js` dead code (+ `planning.html` version tag)

**Context (verified):** `js/portfolio.js` is loaded only by `planning.html` (`:254`), which overrides `showPortfolioView`/`showDashboardView` (`:260-265`) and calls `readXLS(f, onComplete)` with a callback, so `showPortfolioView()` (`js/upload.js:13`) is never reached; `readXLSForProject` (`js/upload.js:37`, the `typeof renderPortfolioView` guard) is only called from `portfolio.html`, which does not load `js/portfolio.js`. The only live exports are `fmtProjectTitle` and `getMonthRangeFromCfg`. All 21 `fmtMoney` calls live in `renderPortfolioSummary`, `buildProjectCard`, `buildProgramSummary`, whose only caller is `renderPortfolioView`.

**Files:**
- Modify: `js/portfolio.js` — delete `renderPortfolioSummary` (`:30-100`), `buildProjectCard` (`:101-243`), `buildProgramSummary` (`:244-316`), `renderPortfolioView` (`:317-458`), `showPortfolioView` (`:460-480`) and the now-unused module variables (`_portfolioSort`, `_portfolioClientFilter` — confirm by grep first). Keep `fmtProjectTitle`, `getMonthRangeFromCfg`, `showPortfolioPlanningView`, `showDashboardView` untouched (out of scope).
- Modify: `planning.html:254` `<script defer src="js/portfolio.js">` → `js/portfolio.js?v=2`

- [ ] **Step 1: Re-verify reachability.** `grep -rn "renderPortfolioView\|renderPortfolioSummary\|buildProjectCard\|buildProgramSummary\|showPortfolioView" --include=*.js --include=*.html .` (excl. `node_modules`, `docs`). Expected: only `js/portfolio.js` itself, `js/upload.js:13,37`, `costgrid.html` (own local `showPortfolioView`), and `planning.html:260`. If any other live caller appears, STOP and report: migrate the builders instead (replace `fmtMoney(x)` with `window.formatMoney(x, <cfg currency>, window.__currencies)`) and note it in the commit.

- [ ] **Step 2: Delete the functions listed above** and verify `node --check js/portfolio.js` passes (no syntax error), then `grep -n "_portfolioSort\|_portfolioClientFilter\|portfolioProjectFilters" js/portfolio.js`: delete declarations only if no remaining reference in the whole repo (`grep -rn` excl. `node_modules`).

- [ ] **Step 3: Version tag.** `planning.html:254` → `<script defer src="js/portfolio.js?v=2"></script>` (the tag was unversioned; the new URL forces a refetch).

- [ ] **Step 4: Verify.** `grep -n "fmtMoney" js/portfolio.js` → no match. `npm test` → PASS. Manual `/planning.html`: By Role / By Project / By Owner render, project titles and month ranges unchanged (they use `fmtProjectTitle`/`getMonthRangeFromCfg`); console clean.

- [ ] **Step 5: Commit**

```bash
git add js/portfolio.js planning.html
git commit -m "refactor: remove unreachable portfolio builders that used fmtMoney

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Delete `fmtMoney` / `currentCfg` from `js/core.js` and add the guard

**Files:**
- Modify: `js/core.js:15` (`let currentCfg = null;`), `:212-215` (`fmtMoney`), and the comment near `:226` if it mentions `fmtMoney`
- Modify: `js/lib/money-characterization.test.js` (delete the file if only the `fmtMoney` block remains)
- Modify: `js/lib/money-guard.test.js`
- Bump: `js/core.js?v=8` → `?v=9` in every page that loads it (re-grep: profile-jobs, portfolio, attribute-lists, planning, pipeline, admin, costgrid, config, project-config, team, settings, timesheets, `_terms-editor`, `_db-reset`, and any other hit)

- [ ] **Step 1: Final caller check.** `grep -rn "fmtMoney\|currentCfg" --include=*.js --include=*.html . --exclude-dir=node_modules --exclude-dir=docs` → only `js/core.js` itself and the characterization test. If anything else appears, fix that site first (it belongs to an earlier task).

- [ ] **Step 2: Write the failing guard test.** Add to `js/lib/money-guard.test.js` inside `describe('money guard', …)`:

```js
  it('the removed money wrappers are not defined or called anywhere', () => {
    const removed = /\b(fmtMoney|cgFmtCurrency|pbFmtMoney|fmtAmtC|fmtAmount|fmtCur|currentCfg)\b/;
    const offenders = sources.filter(f => removed.test(read(f)));
    expect(offenders).toEqual([]);
  });
```
Also update the existing `uses` regex in the second test: remove `fmtMoney|cgFmtCurrency|pbFmtMoney|` and `|fmtAmtC` from it (leave `formatMoney|formatMoneyInput|parseMoney`).

- [ ] **Step 3: Run it** `npm test -- money-guard` → FAIL, with `offenders` equal to `['js/core.js']`. If the list holds any other file, that file still has a caller: fix it (it belongs to an earlier task) before continuing.

- [ ] **Step 4: Delete the code.** Remove `let currentCfg = null;` and the `fmtMoney` function from `js/core.js` (and fix any comment that mentions them). Re-run the guard: PASS. Delete `js/lib/money-characterization.test.js` if no block remains (the `fmtMoney` block is the last one; its cases — `formatMoney` with USD/EUR/unknown code — are covered by `js/lib/money.test.js`; verify that file has a case for an unknown currency code and for a non-finite amount, and add them there if missing).

- [ ] **Step 5: Bump `?v=`** for `js/core.js` in every page (8 → 9) after `grep -rn "js/core.js" *.html`.

- [ ] **Step 6: Verify.** `npm test` → all PASS. `grep -rn "?v=8" *.html | grep core.js` → no match. Smoke every page that loads core.js (login, pipeline, portfolio, costgrid, project-config, config, timesheets, planning, admin, team, settings): loads, console clean (core.js is shared by all pages).

- [ ] **Step 7: Commit**

```bash
git add js/core.js js/lib/money-guard.test.js js/lib/money-characterization.test.js js/lib/money.test.js *.html
git commit -m "refactor: delete fmtMoney and currentCfg from core.js, guard removed wrappers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Documentation pointers

**Files:**
- Modify: `CLAUDE.md` (file-structure entries for `js/core.js`, `js/costgrid.js`, `js/lib/` and the "Money formatting and parsing" section's last bullet: the wrappers/"known open items" sentence about removing them), `docs/js/core.md`, `docs/js/costgrid.md`, `docs/js/lib.md`, `docs/pages/{pipeline,portfolio,costgrid,config,project-config,timesheets}.md` where they name a removed wrapper.

- [ ] **Step 1:** `grep -rn "fmtMoney\|cgFmtCurrency\|pbFmtMoney\|fmtAmtC\|fmtAmount\|currentCfg" CLAUDE.md docs --include=*.md` (excluding `docs/superpowers/` history). For each hit that describes **current** behaviour, update the sentence to say the call sites use `formatMoney` directly; leave dated historical narrative alone. (`/sync-docs` at finish-cycle also checks this; keep it minimal here.)

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md docs
git commit -m "docs: money call sites use formatMoney directly

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage:** replacement rule (Tasks 1-6), currency without fallback (Task 6 `dashCurrency`, Task 8 removes `currentCfg`), task order (1-8 as spec §3 — core.js last so no caller breaks), `js/portfolio.js` (Task 7, with the reachability evidence), tests (Tasks 2, 3, 8; guard in 8), residual risk (manual check per task), acceptance criteria 1-7 (grep in each task + Task 8 guard + `?v=` bumps + manual EUR/CHF checks). Spec open points resolved: `renderPortfolioView` is unreachable (removed), `currentCfg` removable (no other reader).
- **Placeholders:** none; the line lists must be re-grepped by the implementer (line numbers drift after earlier edits) — each task says to re-run the grep.
- **Deviation to confirm at review:** Task 6 Step 4 changes the stale-`currentCfg` case of the portfolio overview's pinned summary (EUR always).
