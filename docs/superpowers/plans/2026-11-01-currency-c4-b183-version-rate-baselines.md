# Currency cycle 4 — role baselines use the version's rate (B-183) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** in a non-EUR cost-grid version, every role baseline (sync, "Custom" flag, reset, role-selector badge) is computed with the version's own `draft.currencyRate`, not the currency's live `current_rate`.

**Architecture:** three callers of `resolveRoleRate` switch the rate they pass; `resolveRoleRate` itself is unchanged. `cgPreviewRateChange` keeps the target currency's `current_rate` (it is what `versionRate` will apply). `onCurrencyChange` sets `draft.currencyRate` before the forced sync. A guard test pins where `current_rate` may still be read.

**Tech Stack:** Vue 3 via CDN (no build), classic script `js/costgrid.js`, vitest + jsdom, `extractBlock` from `scripts/lib/extract-source.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-01-currency-c4-b183-version-rate-baselines-design.md`
**Branch:** `currency-c4-version-rate`
**Risk class:** high-risk — money o valute; `js/costgrid.js` è un file condiviso caricato da più pagine (PROCESS.md §6.1b)

**Task dependencies:** sequential. Task 2's guard test fails until Task 1 has removed the `current_rate` read from `cgSyncRoleRatesToBaseline`, and Task 2's order test only means something once that function reads `_cgDraft.currencyRate`. The tasks are **not** independent.

## Global Constraints

- Version rate expression: `parseFloat(<draft>.currencyRate) || 1.0` (`this.draft` in `costgrid.html`, `_cgDraft` in `js/costgrid.js`).
- `resolveRoleRate` (`js/lib/costgrid-calc.js`) is not modified, so `costgrid-calc.js?v=` is not bumped.
- `js/costgrid.js?v=53` → `?v=54` in every reference; check with `grep -rn "costgrid.js?v=" --include=*.html . | grep -v node_modules` (today `costgrid.html`, `pipeline.html`).
- Mixed CRLF/LF files: edit with the Edit tool, then check the committed blob keeps its line endings (`git show HEAD:<file> | grep -c $'\r'` before and after).
- No user-visible text changes.

## Review Focus

1. A version whose `currencyRate` is missing or `0` (legacy row) → baseline falls back to rate 1, as `|| 1.0` does today for a missing currency; pinned in Task 1.
2. Currency change on a version with **no** roles → `draft.currencyRate` still set before the sync; pinned in Task 2.
3. Role with a per-currency override (ratecard or role) → override wins, rate irrelevant; already pinned by `js/lib/costgrid-calc.test.js`, not repeated.
4. EUR version → effective rate equals EUR rate whatever `currencyRate` holds; pinned in Task 1.
5. Cancelled currency-change modal → `draft.currencyRate` and roles untouched; already pinned by `js/lib/costgrid-currency-change.test.js`, kept green.

---

### Task 1: `cgSyncRoleRatesToBaseline` reads the version's rate

**Files:**
- Modify: `js/costgrid.js` (`cgSyncRoleRatesToBaseline`, comment above `cgPreviewRateChange`)
- Modify: `costgrid.html`, `pipeline.html` (`js/costgrid.js?v=54`)
- Test: `js/lib/costgrid-version-rate.test.js` (new)

**Interfaces:**
- Produces: `cgSyncRoleRatesToBaseline(force = false)` unchanged signature, now reading `_cgDraft.currencyRate`. `cgPreviewRateChange(targetCurrency)` unchanged.

- [ ] **Step 1: Write the failing tests** in `js/lib/costgrid-version-rate.test.js`. Import `./money.js` and `./costgrid-calc.js` (real `resolveRoleRate`); cut `function cgSyncRoleRatesToBaseline(` and `function cgPreviewRateChange(` out of `js/costgrid.js` with `extractBlock` and run them with stubs `_cgDraft`, `getRoles` (one role `{ id: 1, code: 'PM', rate: 100, rateOverrides: {} }`), `resolveRoleRate`, `_cgActiveRatecardMap = {}`, `_cgActiveRatecardOverrides = {}`, and `window.__currencies` holding EUR (`current_rate '1.000000'`) and USD (`current_rate '1.200000'`, `locale 'en-US'`, `symbol '$'`).
  - `sync uses the version rate, not the live one`: `_cgDraft = { currency: 'USD', currencyRate: 1.1, roles: [{ roleCode: 'PM', rate: 0, rateIsCustom: false }] }` → after `cgSyncRoleRatesToBaseline()`, `roles[0].rate === 110`.
  - `sync falls back to 1 without a version rate`: same with `currencyRate: undefined` → `100`.
  - `EUR version ignores currencyRate`: `currency: 'EUR', currencyRate: 1.1` → `100`.
  - `preview uses the target currency's current rate`: `_cgDraft = { currency: 'EUR', currencyRate: 1, roles: [{ roleCode: 'PM', rate: 100 }] }` → `cgPreviewRateChange('USD')[0].newRate === 120`.

- [ ] **Step 2: Run** `npx vitest run js/lib/costgrid-version-rate.test.js` — expected: the first two tests FAIL (120 instead of 110/100), the other two PASS.

- [ ] **Step 3: Implement.** In `cgSyncRoleRatesToBaseline`, replace the `current_rate` lookup with `parseFloat(_cgDraft.currencyRate) || 1.0`; update the function's header comment ("convert EUR × the version's rate"). Above `cgPreviewRateChange`, add a one-line comment: it reads the target currency's `current_rate` because that is the rate `versionRate` (`api/src/lib/version-rate.js`) gives the version on a currency change. Bump `js/costgrid.js?v=53` → `?v=54` in both pages.

- [ ] **Step 4: Run** `npx vitest run js/lib/costgrid-version-rate.test.js` — expected: 4 PASS.

- [ ] **Step 5: Commit** — `fix(costgrid): role baseline sync uses the version's rate (B-183); costgrid.js ?v=54`.

### Task 2: `costgrid.html` baselines, currency-change order, `current_rate` guard

**Files:**
- Modify: `costgrid.html` (`roleModalRoleRow`, `roleBaseline`, both branches of `onCurrencyChange`)
- Test: `js/lib/costgrid-version-rate.test.js`, `js/lib/costgrid-currency-change.test.js`
- Docs: `docs/BACKLOG.md` (B-183), `docs/pages/costgrid.md`, `docs/js/costgrid.md`

**Interfaces:**
- Consumes: Task 1's `cgSyncRoleRatesToBaseline` reading `_cgDraft.currencyRate` (here `this.draft` is `_cgDraft`).

- [ ] **Step 1: Write the failing tests.**
  - In `costgrid-version-rate.test.js`, cut `roleBaseline(role) {` and `roleModalRoleRow(r) {` out of `costgrid.html` as object methods (`const o = { <block> }`) with stubs `getRoles` and `resolveRoleRate`; context `{ draft: { currency: 'USD', currencyRate: 1.1 }, currencies: window.__currencies, ratecardMap: {}, ratecardOverrides: {}, roleModalCurrentCodes: new Set(), isClientRatecard: false, roleModalMode: 'add', roleModalSourceCode: null }`.
    - `roleBaseline uses the version rate`: `roleBaseline({ roleCode: 'PM', rate: 0 }).effectiveRate === 110`.
    - `role selector badge uses the version rate`: `roleModalRoleRow({ id: 1, code: 'PM', rate: 100, rateOverrides: {} }).effectiveRate === 110`.
    - `current_rate is read only by the currency-change paths`: remove `extractBlock(html, 'onCurrencyChange() {')` from `costgrid.html` and `extractBlock(js, 'function cgPreviewRateChange(')` from `js/costgrid.js`; expect neither remaining source to contain `current_rate`.
  - In `costgrid-currency-change.test.js`, make the `sync` stub record `this`-independent state: `sync = vi.fn(() => seen.push(ctx.draft.currencyRate))` (keep `ctx` in a variable the stub can read).
    - `confirm sets the new rate before syncing`: CHF (`current_rate '0.950000'`), click confirm → `seen` equals `[0.95]`.
    - `no-roles branch sets the new rate before syncing`: `draft.roles = []` → `seen` equals `[0.95]`.

- [ ] **Step 2: Run** `npx vitest run js/lib/costgrid-version-rate.test.js js/lib/costgrid-currency-change.test.js` — expected: the five new tests FAIL (120, 120, guard finds `current_rate`, `[1]`, `[1]`).

- [ ] **Step 3: Implement.** `roleModalRoleRow` and `roleBaseline` pass `parseFloat(this.draft?.currencyRate) || 1.0` (drop the `currencies` lookup). In both branches of `onCurrencyChange`, move the `this.draft.currencyRate = …current_rate…` line above `cgSyncRoleRatesToBaseline(true)`.

- [ ] **Step 4: Run** `npx vitest run js/lib/costgrid-version-rate.test.js js/lib/costgrid-currency-change.test.js` — expected: all PASS.

- [ ] **Step 5: Docs.** Close the B-183 row in `docs/BACKLOG.md` (status `closed`, with the commit and the re-run `grep -n "current_rate" costgrid.html js/costgrid.js` result); in `docs/pages/costgrid.md` and `docs/js/costgrid.md`, where the role-rate conversion is described, say baselines use the version's `currencyRate` and only the currency-change preview reads the live rate.

- [ ] **Step 6: Full suite** — `npm test`, expected: all pass.

- [ ] **Step 7: Commit** — `fix(costgrid): role baseline, badge and currency change use the version's rate (B-183)`.

## Decisioni aperte

1. **Due task sequenziali, non tre.** Alternativa scartata: un task a sé per la guardia `current_rate`. Perché: la guardia passa solo dopo le modifiche a `costgrid.html` e un revisore non la rifiuterebbe separatamente.
2. **Nuovo file `js/lib/costgrid-version-rate.test.js`.** Alternativa scartata: aggiungere i casi a `costgrid-calc.test.js`. Perché: quel file testa il modulo puro, questi test tagliano sorgenti di pagina con `extractBlock` come `costgrid-clone.test.js`.
