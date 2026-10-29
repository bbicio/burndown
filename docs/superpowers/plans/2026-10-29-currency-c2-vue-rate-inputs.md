# Currency cycle 2 — rate and POT inputs under money.js in the Vue pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every rate field and the POT amount in `costgrid.html`, `project-config.html`, `master-roles.html` and `master-pipelines.html` is a text input formatted and read in its context currency through `js/lib/money.js`; text in the wrong convention is refused with a message; converted rates round to the currency's decimals; a guard pins it.

**Architecture:** two pure additions to `js/lib/money.js` (`readMoneyInput`, `moneyFormatExample`) and one to `js/lib/costgrid-calc.js` (`cgRateIsMissing`), plus currency-aware rounding in `resolveRoleRate`; each page wires them with inline handlers modelled on the existing PTC/phasing inputs; a new test in `js/lib/money-guard.test.js` refuses `type="number"` money inputs.

**Tech Stack:** Vue 3 via CDN (no build), native ES modules in `js/lib/`, vitest + jsdom, `scripts/shoot.mjs` (headless Chrome).

**Spec:** `docs/superpowers/specs/2026-10-29-currency-c2-vue-rate-inputs-design.md`
**Branch:** `currency-c2-vue-rate-inputs`
**Risk class:** high-risk — money o valute, file condivisi caricati da più pagine (`js/lib/money.js`) (PROCESS.md §6.1b)

**Task dependencies:** Task 1 first (it defines `readMoneyInput`/`moneyFormatExample` and bumps `money.js`). Task 2 next (it changes `costgrid-calc.js`, which Task 3 uses). Tasks 3, 4, 5 and 6 are independent of each other: each touches one page and uses only Tasks 1-2's interfaces. Task 7 last: its guard passes only after Tasks 3-6.

## Global Constraints

- Context currencies (Spec §1/§3): costgrid → `draft.currency || 'EUR'`; project-config → `project.currency`; master-roles → `'EUR'` for the base rate, the field's currency for each override; master-pipelines POT → `'EUR'`.
- Read text only with `readMoneyInput`; `parseMoney` is not changed and not used by the new code. PTC and phasing inputs are not touched (Spec decision 4).
- Error message copy, exactly: `` `Enter a valid amount in ${code}, e.g. ${moneyFormatExample(code, currencies)}.` `` (master pages); in-cell note / tooltip: `` `Format: ${moneyFormatExample(code, currencies)}` `` (costgrid, project-config).
- `?v=N`: `js/lib/money.js` `?v=2` → `?v=3` in every reference, including the new `import` in `costgrid-calc.js` (`grep -rn "money.js?v=" --include=*.html --include=*.js . | grep -v node_modules`, 13 files today); `js/lib/costgrid-calc.js` `?v=9` → `?v=10` (`costgrid.html`, `pipeline.html`); `css/costgrid.css` `?v=7` → `?v=8` (`costgrid.html`).
- All user-facing text in English. Edit HTML with the Edit tool, never PowerShell `Set-Content` (BOM).
- No Docker lifecycle command against the main stack. Visual check with `scripts/shoot.mjs` against `scripts/test-branch.sh up` (see `docs/scripts/shoot.md`); reading the PNGs back is part of the step. Copy `.env` from the main checkout into the worktree first; never commit it.
- Out of scope: `master-clients.html`, `js/ratecards.js` (cycle 3), B-183 (`current_rate` in `roleBaseline`/`roleModalRoleRow` stays), server routes.

## Review Focus

1. **Focus then blur without typing must not change a rate** (a stored `107.5` shown as `107,5` and read back) — Task 1, test `round-trips formatMoneyInput for every test currency`.
2. **Intermediate text while typing in the cost grid** (`107,` on the way to `107,5`) must not mark the field invalid nor write a wrong value — Task 1, test `accepts a trailing decimal separator`.
3. **Pasted text carrying the symbol or ISO code** (`€ 1.234,50`, `$175.50`, `175.50 USD`) must be read, not refused — Task 1, test `ignores the currency symbol, the ISO code and spaces`.
4. **Clearing an existing override in master-roles** must remove it, not store 0 — Task 5, manual step 4.
5. **A viewer / read-only cost grid** must still show the formatted rate in the disabled input — Task 3, shoot step.

---

### Task 1: `readMoneyInput` and `moneyFormatExample` in `js/lib/money.js`

**Files:**
- Modify: `js/lib/money.js`
- Test: `js/lib/money.test.js`
- Modify (`?v=2` → `?v=3`): every file listed by `grep -rln "money.js?v=" --include=*.html --include=*.js . | grep -v node_modules`

**Interfaces:**
- Produces: `readMoneyInput(text: string, code: string, currencies: object[]) → number | null | NaN` (`null` = blank, `NaN` = invalid); `moneyFormatExample(code: string, currencies: object[]) → string` (`'1.234,50'` EUR it-IT, `'1,234.50'` USD en-US, `'1,235'` JPY). Both bridged on `window`.

- [ ] **Step 1: Write the failing tests** in `js/lib/money.test.js` (reuse its `C` list), `describe('readMoneyInput')`:
  - `returns null for blank text`: `''`, `'   '`, `null`, `undefined` → `null`.
  - `reads the locale convention of the currency`: `('107,5','EUR')` → `107.5`; `('175.5','USD')` → `175.5`; `('1.234,50','EUR')` → `1234.5`; `('1,234.50','USD')` → `1234.5`; `('1234','EUR')` → `1234`; `('0','EUR')` → `0`; `('1.075','EUR')` → `1075`.
  - `refuses the other convention`: `('107.5','EUR')`, `('175,5','USD')`, `('1.23,4','EUR')`, `('12.34.567','EUR')` → `NaN`.
  - `refuses negatives, letters and extra decimals`: `('-5','EUR')`, `('abc','EUR')`, `('12,345','EUR')`, `('12.5','JPY')` → `NaN`.
  - `accepts a trailing decimal separator`: `('107,','EUR')` → `107`.
  - `ignores the currency symbol, the ISO code and spaces`: `('€ 1.234,50','EUR')` → `1234.5`; `('$175.50','USD')` → `175.5`; `('175.50 USD','USD')` → `175.5`.
  - `round-trips formatMoneyInput for every test currency`: for each `c` in `C` and each `a` in `AMOUNTS`, `const v = Number(a.toFixed(currencyInfo(c.code, C).digits)); expect(readMoneyInput(formatMoneyInput(v, c.code, C), c.code, C)).toBe(v)` (skip `v === 0`, which `formatMoneyInput` renders as `''`).
  - `formats with formatMoney after reading` (Spec criterion 3): `formatMoney(readMoneyInput('175.5','USD',C),'USD',C)` → `'$ 175.50'`; `formatMoney(readMoneyInput('107,5','EUR',C),'EUR',C)` → `'€ 107,50'`.
  - `describe('moneyFormatExample')`: EUR → `'1.234,50'`, USD → `'1,234.50'`, JPY → `'1,235'`.

- [ ] **Step 2: Run them to see them fail**
  Run: `npx vitest run js/lib/money.test.js`
  Expected: FAIL, `readMoneyInput is not a function` (import undefined).

- [ ] **Step 3: Implement both functions in `js/lib/money.js`**
  `readMoneyInput`: blank check first. Then apply the same normalisation `parseMoney` does: strip the symbol and the ISO code, convert Arabic-Indic digits, strip whitespace. Extract the shared steps into one internal helper so both functions use it. Then validate against the locale's `separators(locale)` and `info.digits`, with `G` = escaped group separator (for a `'`/`’` group, accept either character) and `D` = escaped decimal separator:
  ```
  int  = \d+  |  \d{1,3}(G\d{3})+          // G alternative omitted when the group is whitespace (already stripped) or empty
  frac = digits > 0 ? (D\d{0,digits})? : ''
  ^(int)(frac)$  else → NaN
  ```
  On a match, remove `G`, replace `D` with `.`, and return `Number(...)`.
  `moneyFormatExample`: `formatMoney(1234.5, code, currencies)` with the leading `` `${currencyInfo(code, currencies).symbol} ` `` removed. Add `window.readMoneyInput` and `window.moneyFormatExample` to the bridge block.

- [ ] **Step 4: Run the tests to see them pass**
  Run: `npx vitest run js/lib/money.test.js`
  Expected: PASS, the existing `parseMoney`/`formatMoney` tests included.

- [ ] **Step 5: Bump `money.js?v=2` → `?v=3` everywhere**, then run `npx vitest run js/lib/money-guard.test.js js/lib/foundations-guard.test.js`. Expected: PASS (one `?v=` value).

- [ ] **Step 6: Commit**
  ```bash
  git add js/lib/money.js js/lib/money.test.js *.html
  git commit -m "feat(money): readMoneyInput tells blank, invalid and amount apart; moneyFormatExample"
  ```

### Task 2: currency decimals in `resolveRoleRate`, and `cgRateIsMissing`

**Files:**
- Modify: `js/lib/costgrid-calc.js:89-103` and its `window` bridge block
- Test: `js/lib/costgrid-calc.test.js` (`describe('resolveRoleRate')`, new `describe('cgRateIsMissing')`)
- Modify (`?v=9` → `?v=10`): `costgrid.html:762`, `pipeline.html:513`

**Interfaces:**
- Consumes: `currencyInfo` from Task 1's `./money.js?v=3`.
- Produces: `resolveRoleRate(...)` unchanged signature, converted `effectiveRate` rounded to `currencyInfo(currency).digits`; `cgRateIsMissing(role: { rate, rateIsCustom }) → boolean`, `true` when `!(role.rate > 0) && !role.rateIsCustom`. Bridged as `window.cgRateIsMissing`.

- [ ] **Step 1: Write the failing tests**
  - `rounds a converted JPY rate to 0 decimals`: `resolveRoleRate({ roleId: 5, globalRate: 100, currency: 'JPY', currencyRate: 162.347, ratecardMap: {}, ratecardOverrides: {}, roleOverrides: {} }).effectiveRate` → `16235`.
  - `rounds a converted USD rate to 2 decimals`: `globalRate: 100, currency: 'USD', currencyRate: 1.08766` → `108.77`.
  - `cgRateIsMissing`: `{ rate: 0, rateIsCustom: false }` → `true`; `{ rate: 0, rateIsCustom: true }` → `false`; `{ rate: 120, rateIsCustom: false }` → `false`; `{ rate: undefined }` → `true`.

- [ ] **Step 2: Run to see them fail**
  Run: `npx vitest run js/lib/costgrid-calc.test.js`
  Expected: FAIL. The JPY case gets `16234.7`, and `cgRateIsMissing` is not defined.

- [ ] **Step 3: Implement.** Add `import { currencyInfo } from './money.js?v=3';` at the top of `costgrid-calc.js`. For the converted rate, use `Number((eurRate * (currencyRate || 1)).toFixed(currencyInfo(currency).digits))`. Add `cgRateIsMissing`.

- [ ] **Step 4: Run to see them pass**
  Run: `npx vitest run js/lib/costgrid-calc.test.js js/lib/money-guard.test.js`
  Expected: PASS. The existing USD `1.005` case and the GBP `42.5` case must still pass.

- [ ] **Step 5: Bump `costgrid-calc.js?v=9` → `?v=10`** in `costgrid.html` and `pipeline.html`.

- [ ] **Step 6: Commit**
  ```bash
  git add js/lib/costgrid-calc.js js/lib/costgrid-calc.test.js costgrid.html pipeline.html
  git commit -m "feat(costgrid): converted role rates round to the currency's decimals; cgRateIsMissing"
  ```

### Task 3: `costgrid.html` — rate input, rate displays, "Missing rate"

**Files:**
- Modify: `costgrid.html:334-339` (rate cell), `:349,353` (column header `is-zero` and "Missing rate"), `:479` (menu "Reset rate to"), `:594` (role-picker badge), `data()` near `:818`, methods `roleBaseline`/`onRateChange` near `:1584-1604`, `cgRateIsMissing` exposed to the template
- Modify: `css/costgrid.css` (after `:447`), `costgrid.html:13` (`costgrid.css?v=7` → `?v=8`)
- Test: `js/lib/costgrid-rate-input-guard.test.js` (new)

**Interfaces:**
- Consumes: `window.readMoneyInput`, `window.moneyFormatExample`, `window.formatMoneyInput`, `window.formatMoney` (Task 1); `window.cgRateIsMissing` (Task 2).
- Produces: methods `onRateFocus(role)`, `onRateInput(role, event)`, `onRateBlur(role)`; data `rateFocusedRole` (roleCode or `null`), `rateRaw` (`''`), `rateInvalid` (`false`). `onRateChange` is removed.

- [ ] **Step 1: Write the failing guard test** `js/lib/costgrid-rate-input-guard.test.js`, which reads `costgrid.html` as text:
  - the `<input …class="cg-rate-input"…>` tag contains `type="text"`, `@focus="onRateFocus(r)"`, `@input="onRateInput(r, $event)"`, `@blur="onRateBlur(r)"`;
  - the file contains no `onRateChange`;
  - the methods block contains `window.readMoneyInput(`;
  - every `is-zero` binding and every `Missing rate` element in the role-column templates goes through `cgRateIsMissing(`: assert that `/'is-zero':\s*(?!cgRateIsMissing)/` does not match in the rate cell and the column header;
  - the role-picker badge does not print `{{ row.effectiveRate }}` raw.

- [ ] **Step 2: Run it to see it fail**
  Run: `npx vitest run js/lib/costgrid-rate-input-guard.test.js`
  Expected: FAIL. The input is still `type="number"`.

- [ ] **Step 3: Implement the rate input** (Spec §3.1).
  - Set `:value="rateFocusedRole === r.roleCode ? rateRaw : formatMoney(r.rate, cur, currencies)"`, with `cur = draft.currency || 'EUR'`.
  - `onRateFocus` sets `rateFocusedRole`, and sets `rateRaw = window.formatMoneyInput(role.rate, cur, this.currencies)`.
  - `onRateInput` stores the text, then reads `v = window.readMoneyInput(...)`. A number writes `role.rate`, `role.rateIsCustom = v !== this.roleBaseline(role).effectiveRate`, sets `rateInvalid = false` and calls `cgScheduleAutoSave()`. `NaN` sets `rateInvalid = true`. `null` sets `rateInvalid = false` and writes nothing.
  - `onRateBlur`: blank `rateRaw` → `this.resetRoleRate(role)`. Then reset `rateFocusedRole`, `rateRaw` and `rateInvalid`.
  - Bind `:class="{ 'is-invalid': rateInvalid && rateFocusedRole === r.roleCode }"` on the input. Show a first note branch `<div v-if="rateInvalid && rateFocusedRole === r.roleCode" class="cg-rate-note cg-rate-note--zero">Format: {{ moneyFormatExample(cur, currencies) }}</div>` before the custom and missing branches.
  - Expose `moneyFormatExample: window.moneyFormatExample` and `cgRateIsMissing: window.cgRateIsMissing` in `data()`, next to `formatMoney`.

- [ ] **Step 4: Implement the displays and "Missing rate"** (Spec §4, §5).
  - Format with `formatMoney(…, cur, currencies)`: the custom note (`Custom · reset {{ … }}`), the input `:title` (`'Custom (baseline: ' + formatMoney(…) + '/h) — clear to restore'`), the menu item (`Reset rate to {{ … }}`), and the badge (`{{ formatMoney(row.effectiveRate, row.curCode, currencies) }}/h`).
  - Replace the conditions `!r.rate || r.rate === 0` with `cgRateIsMissing(r)` in the cell's `is-zero`, the cell's "Missing rate" branch, the header's `is-zero` and the header's "Missing rate".
  - Leave `:data-rate` and the badge's `row.zeroRate` unchanged.

- [ ] **Step 5: Add the CSS.** Put `.cg-rate-input.is-invalid { border-color: var(--color-danger); color: var(--color-danger); }` after `css/costgrid.css:447`, then bump `costgrid.css?v=7` → `?v=8`.

- [ ] **Step 6: Run the tests**
  Run: `npx vitest run js/lib/costgrid-rate-input-guard.test.js js/lib/costgrid` (all costgrid tests)
  Expected: PASS.

- [ ] **Step 7: Visual check.** Use `scripts/shoot.mjs` on `costgrid.html` for one EUR version, one USD version and one viewer (read-only) version, at the widths in `docs/scripts/shoot.md`. Read the PNGs:
  - the rate cells show `€ 107,50` / `$ 175.50`;
  - a custom 0 shows "Custom · reset" with no red;
  - the disabled input shows the formatted rate;
  - the cell width does not clip a 4-digit rate.

  Report what each PNG shows.

- [ ] **Step 8: Commit**
  ```bash
  git add costgrid.html css/costgrid.css js/lib/costgrid-rate-input-guard.test.js
  git commit -m "feat(costgrid): role rates typed and shown in the version's currency; a custom 0 is not a missing rate"
  ```

### Task 4: `project-config.html` — resource hourly rate

**Files:**
- Modify: `project-config.html:182` (input), `data()` at `:434` (`rateInvalid: {}`), methods near `:945` (`moneyInput`/`parseMoney` neighbours)
- Test: `js/lib/project-config-rate-input-guard.test.js` (new)

**Interfaces:**
- Consumes: `window.readMoneyInput`, `window.moneyFormatExample` (Task 1); the page's existing `moneyInput(amount)`.
- Produces: method `onResRateBlur(ti, ri, event)`; data `rateInvalid` (object keyed `` `${ti}-${ri}` ``). Nothing is added to the resource object.

- [ ] **Step 1: Write the failing guard test.** It reads `project-config.html` and asserts:
  - the `hourlyRate` input tag has `type="text"` and contains no `v-model.number="res.hourlyRate"`;
  - it has `@focus` calling `moneyInput(res.hourlyRate)` and `@blur="onResRateBlur(ti, ri, $event)"`;
  - the methods contain `window.readMoneyInput(`;
  - the file contains no `_rateInvalid`.

- [ ] **Step 2: Run it to see it fail**
  Run: `npx vitest run js/lib/project-config-rate-input-guard.test.js`
  Expected: FAIL.

- [ ] **Step 3: Implement** (Spec §3.2).
  - `:value="res.hourlyRate > 0 ? formatMoney(res.hourlyRate, project.currency, currencies) : ''"`.
  - `onResRateBlur` reads `v = window.readMoneyInput(e.target.value, this.project?.currency, window.__currencies)`:
    - `null` → `res.hourlyRate = 0`;
    - number → `res.hourlyRate = v`;
    - in both cases delete `rateInvalid[key]` and reformat the text with `formatMoney`, or `''` when the value is 0;
    - `NaN` → `rateInvalid[key] = true`, the text stays, and nothing is written.
  - Bind `:class="{ 'is-invalid': rateInvalid[ti + '-' + ri] }"` and `:title="rateInvalid[ti + '-' + ri] ? 'Format: ' + moneyFormatExample(project.currency, currencies) : ''"`.
  - Keep `:disabled="isViewer"`.
  - Removing a resource (`confirmRemoveResource`) clears `rateInvalid`: reset it to `{}`, because the indices shift.

- [ ] **Step 4: Run the tests**
  Run: `npx vitest run js/lib/project-config-rate-input-guard.test.js js/lib/project-config-task-period-guard.test.js js/lib/config-form-calc.test.js`
  Expected: PASS.

- [ ] **Step 5: Visual check.** Use `scripts/shoot.mjs` on `project-config.html?projectId=<an EUR project with a fractional rate>`. Read the PNG: the rate reads `€ 107,50` and the subtotal is unchanged.

- [ ] **Step 6: Commit**
  ```bash
  git add project-config.html js/lib/project-config-rate-input-guard.test.js
  git commit -m "feat(project-config): resource rates typed and shown in the project's currency"
  ```

### Task 5: `master-roles.html` — base rate, per-currency overrides, roles table

**Files:**
- Modify: `master-roles.html:126-137` (form fields), `:170` (table cell), `openRoleForm`/`saveRole` near `:281-330`, `fmtRate` at `:349-351` (delete)
- Test: `js/lib/master-roles-rate-input-guard.test.js` (new)

**Interfaces:**
- Consumes: `window.readMoneyInput`, `window.moneyFormatExample`, `window.formatMoneyInput`, `window.formatMoney`, `window.currencyInfo` (Task 1). Currencies come from `this.currencies` (Spec decision 11).
- Produces: form state `rf.rateText: string` and `rf.overrideTexts: { [code]: string }`, replacing `rf.rate` and `rf.rateOverrides`. Methods `onMoneyFocus(e, amountText, code)` and `onMoneyBlur(e, code)` are optional. Either handlers or inline code is fine, but the text must be reformatted on focus and blur.

- [ ] **Step 1: Write the failing guard test.** It asserts:
  - no `type="number"` remains in `master-roles.html`;
  - no `fmtRate` remains;
  - no `toLocaleString(` remains;
  - no `€/h` literal remains;
  - `saveRole` contains `readMoneyInput(`;
  - the base-rate error copy `'Default rate is required.'` is present.

- [ ] **Step 2: Run it to see it fail**
  Run: `npx vitest run js/lib/master-roles-rate-input-guard.test.js`
  Expected: FAIL.

- [ ] **Step 3: Implement** (Spec §3.3).
  - **Form open.** `openRoleForm` fills `rateText = formatMoneyInput(role.rate, 'EUR', this.currencies)`, and the same for each override in its own code.
  - **Saving the base rate.** `saveRole` reads the base with `readMoneyInput(rf.rateText, 'EUR', this.currencies)`. `null` → `'Default rate is required.'`. `NaN` → the Global Constraints copy with `EUR`.
  - **Saving the overrides.** Each override goes through `readMoneyInput` in its own code. `null` → no override. `NaN` → the Global Constraints copy with that code. A number, 0 included, → `rateOverrides[code] = v` (Spec decision 12).
  - **Labels.** `Default rate ({{ currencyInfo('EUR', currencies).symbol }}/h)`.
  - **Override placeholder.** `'e.g. ' + formatMoneyInput((readMoneyInput(rf.rateText,'EUR',currencies) || 0) * cu.current_rate, cu.code, currencies)`.
  - **Table cell.** `{{ formatMoney(r.rate, 'EUR', currencies) }}/h`. The "⚠️ Not set" branch is unchanged.
  - **Template helpers.** Expose `formatMoney`, `formatMoneyInput`, `readMoneyInput` and `currencyInfo` to the template as `window.*` references in `data()`.

- [ ] **Step 4: Run the tests**
  Run: `npx vitest run js/lib/master-roles-rate-input-guard.test.js js/lib/master-data-guard.test.js`
  Expected: PASS.

- [ ] **Step 5: Manual + visual check** on the branch stack:
  - edit a role, type `107,5` in the base and `175.5` in USD, save, and reload: the table shows `€ 107,50/h`, and the edit form shows `107,5` and `175.5`;
  - type `107.5` in the base: the banner shows `Enter a valid amount in EUR, e.g. 1.234,50.`;
  - clear the USD field and save: after a reload the role has no USD override (Review Focus 4).

  Use `scripts/shoot.mjs` on `master-roles.html` with the form open, and read the PNG.

- [ ] **Step 6: Commit**
  ```bash
  git add master-roles.html js/lib/master-roles-rate-input-guard.test.js
  git commit -m "feat(master-roles): role rates typed and shown in each field's currency"
  ```

### Task 6: `master-pipelines.html` — POT amount

**Files:**
- Modify: `master-pipelines.html:296-302` (label + input), the `potf` initialisers (`:553` and the open-form method near `:870`), `savePot` near `:879-882`
- Test: `js/lib/master-pipelines-pot-details.test.js` (extend) or `js/lib/master-pipelines-pot-input-guard.test.js` (new)

**Interfaces:**
- Consumes: `window.readMoneyInput`, `window.moneyFormatExample`, `window.formatMoneyInput`, `window.formatMoney`, `window.currencyInfo` (Task 1), `window.__currencies` (already set by this page).
- Produces: `potf.amountText: string` replacing `potf.amount` in the form state. The API call still receives a number.

- [ ] **Step 1: Write the failing guard test.** It asserts:
  - the POT amount input has `type="text"`, and no `type="number"` input bound to `potf.amount`/`potf.amountText` exists;
  - `savePot` contains `readMoneyInput(` and no `parseFloat(this.potf.amount`;
  - no `Target (€)` literal remains.

- [ ] **Step 2: Run it to see it fail**
  Run: `npx vitest run js/lib/master-pipelines-pot-input-guard.test.js`
  Expected: FAIL.

- [ ] **Step 3: Implement** (Spec §3.4).
  - **Form init.** Every `potf` initialiser sets `amountText`: `''` for a new POT, or `formatMoneyInput(pot.amount, 'EUR', window.__currencies)` when editing. Focus and blur reformat the text.
  - **Saving.** `savePot` reads `amount = readMoneyInput(this.potf.amountText, 'EUR', window.__currencies)`. `null` or `NaN` → `potf.error = 'Enter a valid amount in EUR, e.g. ' + moneyFormatExample('EUR', window.__currencies) + '.'`. A number, 0 included, is sent as it is today.
  - **Label.** `Target ({{ currencyInfo('EUR', currencies).symbol }})`, or the page's own currencies reference.
  - Keep `@keydown.enter="savePot"`.

- [ ] **Step 4: Run the tests**
  Run: `npx vitest run js/lib/master-pipelines-pot-input-guard.test.js js/lib/master-pipelines-pot-details.test.js`
  Expected: PASS.

- [ ] **Step 5: Manual + visual check.**
  - Create a POT with `500.000` → it saves 500000 and shows `€ 500.000,00`.
  - Edit it with `500000.5` → the banner error appears.
  - Press Enter in the field → it saves.

  Use `scripts/shoot.mjs` on `master-pipelines.html` with the POT form open, and read the PNG.

- [ ] **Step 6: Commit**
  ```bash
  git add master-pipelines.html js/lib/master-pipelines-pot-*.test.js
  git commit -m "feat(master-pipelines): POT amount typed and shown in EUR through money.js"
  ```

### Task 7: the guard, CLAUDE.md and `docs/js/lib.md`

**Files:**
- Modify: `js/lib/money-guard.test.js`
- Modify: `CLAUDE.md:368`, `docs/js/lib.md` (the `money.js` and `costgrid-calc.js` entries)

**Interfaces:**
- Consumes: Tasks 3-6 done (the guard has no offenders outside its exemption).

- [ ] **Step 1: Add the test** `no money <input> is type="number"` to `money-guard.test.js` (Spec §7).
  - Scope: every file in `sources` that ends in `.html`, or that matches `^js/.*\.js$`.
  - Matching: each `<input[^>]*>` tag (`[^>]` spans newlines) that contains `type="number"` and matches `/rate|amount|ptc|price|fee/i` is an offender, reported as `file: tag`.
  - `PENDING_CYCLE_3 = new Set(['master-clients.html', 'js/ratecards.js'])` is skipped, with a comment that currency cycle 3 removes the set.
  - Header comment: the test does not pin `parseFloat` (Spec decision 9).
  - Expect `offenders` to equal `[]`.

- [ ] **Step 2: See the guard bite.** Temporarily change `costgrid.html`'s `cg-rate-input` back to `type="number"`, then run `npx vitest run js/lib/money-guard.test.js`. Expected: FAIL, naming `costgrid.html`. Revert the change and re-run. Expected: PASS. Run `git diff --stat costgrid.html` and expect empty output.

- [ ] **Step 3: Update the docs.**
  - **CLAUDE.md:368** — the sentence `` `type="number"` rate inputs and hours inputs are not part of this. `` becomes: `` read the text with `readMoneyInput(text, code, currencies)` (`null` blank, `NaN` invalid — refuse it with `moneyFormatExample`), never with `parseFloat`; hours inputs are not part of this. ``
  - **`docs/js/lib.md`:**
    - `money.js` entry: add `readMoneyInput` and `moneyFormatExample`;
    - `costgrid-calc.js` entry: `resolveRoleRate` rounds to the currency's decimals, and add `cgRateIsMissing`.

  Then run `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js`. Expected: PASS.

- [ ] **Step 4: Full suite**
  Run: `npm test`. Expected: PASS, with 0 failed.
  Run: `cd api && node --test src/lib/*.test.js`. Expected: PASS. `api/` is untouched, so this is a regression gate only.

- [ ] **Step 5: Commit**
  ```bash
  git add js/lib/money-guard.test.js CLAUDE.md docs/js/lib.md
  git commit -m "test(money): guard against type=\"number\" money inputs; CLAUDE.md drops the rate exception"
  ```

## Decisioni aperte

1. **Two small pure helpers, `moneyFormatExample` in `money.js` and `cgRateIsMissing` in `costgrid-calc.js`, carry the example copy and the "Missing rate" condition.** Alternativa scartata: writing both inline in each template. Perché: one definition each, and a unit test can pin them. They are implementation details of Spec §3 and §5, not new behaviour.
2. **Each page gets a source-level guard test, and the manual steps cover the behaviour.** Alternativa scartata: mounting the Vue pages in jsdom. Perché: no test in the repo mounts a whole page, and these pages load Vue from a CDN. The parsing behaviour is pinned in `money.test.js`, where it lives.
3. **In project-config, removing a resource clears all its invalid flags.** Alternativa scartata: re-keying the flags. Perché: the indices shift, and a stale flag would mark the wrong row. Losing the flag costs one retype.
