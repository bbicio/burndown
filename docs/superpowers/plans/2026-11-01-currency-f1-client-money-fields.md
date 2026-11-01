# Currency f1 — client money fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every money `<input>` reads its text through a strict `readMoneyInput` that re-reads `formatMoney`'s own output (Indian grouping included), refuses inner symbols/spaces, keeps an untouched stored value as it is, and owns the "stored 0 opens as `'0'`" rule; PTC and phasing join the rate inputs.

**Architecture:** `js/lib/money.js` gains a stricter `readMoneyInput(text, code, currencies, { stored })` and `formatMoneyInput(amount, code, currencies, { keepZero })`. The pages drop their hand-written zero rule and pass `stored`/`keepZero`. `costgrid.html`'s PTC copies the page's rate-cell pattern; `project-config.html`'s PTC and phasing copy `onResRateBlur`'s pattern.

**Tech Stack:** Vue 3 via CDN (no build), native ES module `js/lib/money.js` bridged on `window`, vitest + jsdom, static HTML guard tests.

**Spec:** `docs/superpowers/specs/2026-11-01-currency-f1-client-money-fields-design.md`
**Branch:** `currency-f1-client-money-fields`
**Risk class:** high-risk — money o valute; `js/lib/money.js` è un file condiviso caricato da più pagine (PROCESS.md §6.1b)

**Task dependencies:** Task 1 first (it defines the interface every other task calls). Tasks 2, 3 and 4 are **independent of each other** (disjoint files: `master-*.html` / `project-config.html` / `costgrid.html`), each depends only on Task 1. Task 5 last (cache-busting over every touched file, docs, backlog).

## Global Constraints

- No `Intl.NumberFormat` outside `js/lib/money.js` (`js/lib/money-guard.test.js`).
- Always pass the row's own currency code; amounts sent to the server are JS numbers, never NUMERIC strings.
- `js/lib/money.js?v=3` → `?v=4` in every reference, including the `import` inside `js/lib/costgrid-calc.js`; then `js/lib/costgrid-calc.js?v=13` → `?v=14` in `costgrid.html` and `pipeline.html`. Check: `grep -rn "money.js?v=\|costgrid-calc.js?v=" --include=*.html --include=*.js . | grep -v node_modules`.
- HTML files have mixed CRLF/LF line endings: edit with the Edit tool only, never PowerShell `Get-Content`/`Set-Content`; after each commit compare `git show HEAD~1:<file> | grep -c $'\r'` with `git show HEAD:<file> | grep -c $'\r'` (the count may only change by the lines added/removed).
- User-visible text in English.
- `parseMoney` and its `stripDecoration` helper are not changed (B-012 out of scope).

## Review Focus

1. A stored amount that arrives as a NUMERIC string from `pg` (`'108.7654'`) → `stored` is coerced, and the returned value is a Number; pinned in Task 1.
2. A phasing month holding invalid text that leaves the project period (date change) or is overwritten by Derive/Reforecast → no invisible invalid entry may block Save; pinned in Task 3.
3. A PTC row removed while a later row holds invalid text → the invalid text follows its row; pinned in Task 3.
4. Symbol typed after the number (`1.234,50 €`, `175.50 USD`) or with no space (`$175.50`) → still read; pinned in Task 1.
5. INR ≥ 1 crore (`₹ 1,00,00,000.00`) and SEK/fr-FR with U+00A0/U+202F/plain-space groups → read; pinned in Task 1.

---

### Task 1: `money.js` — strict read, `stored`, `keepZero`

**Files:**
- Modify: `js/lib/money.js` (`formatMoneyInput`, `separators`, `readMoneyInput`)
- Test: `js/lib/money.test.js`

**Interfaces:**
- Produces:
  - `formatMoneyInput(amount, code, currencies, { keepZero = false } = {}) → string` — unchanged without the option; with `keepZero`, a finite amount equal to 0 (number `0` or string `'0'`/`'0.00'`) returns `'0'`; `null`/`undefined`/`''` still return `''`.
  - `readMoneyInput(text, code, currencies, { stored } = {}) → number | null | NaN` — `null` blank, `NaN` invalid, else the amount; when `stored` is given (number or numeric string) and the read amount equals `Number(Number(stored).toFixed(digits))`, returns `Number(stored)`.

- [ ] **Step 1: Write the failing tests** in `js/lib/money.test.js` (`C` already has EUR it-IT, USD, CHF de-CH, SEK sv-SE, INR hi-IN, JPY, EGP ar-EG; add a local `FR = [{ code: 'EUR', symbol: '€', locale: 'fr-FR' }]`):

```js
describe('readMoneyInput — strict read (f1)', () => {
  it('re-reads formatMoney for every test currency, above 1,00,000 too', () => {
    for (const c of ['EUR', 'USD', 'CHF', 'JPY', 'INR', 'SEK', 'EGP'])
      for (const a of [123456, 1234567.5, 100000000])
        { const v = Number(a.toFixed(currencyInfo(c, C).digits)); expect(readMoneyInput(formatMoney(v, c, C), c, C)).toBe(v); }
    expect(readMoneyInput(formatMoney(1234567.5, 'EUR', FR), 'EUR', FR)).toBe(1234567.5);
  });
  it('reads Indian grouping and refuses western grouping for INR', () => {
    expect(readMoneyInput('₹ 1,23,456.00', 'INR', C)).toBe(123456);
    expect(readMoneyInput('1,00,00,000', 'INR', C)).toBe(10000000);
    expect(readMoneyInput('123,456', 'INR', C)).toBeNaN();
  });
  it('refuses a symbol or a space between the digits', () => {
    expect(readMoneyInput('1 50', 'EUR', C)).toBeNaN();
    expect(readMoneyInput('15€0', 'EUR', C)).toBeNaN();
    expect(readMoneyInput('1E£ 5', 'EGP', C)).toBeNaN();
  });
  it('checks space groups (plain, U+00A0, U+202F)', () => {
    expect(readMoneyInput('1 234 567,5', 'EUR', FR)).toBe(1234567.5);
    expect(readMoneyInput('1 234 567,5', 'EUR', FR)).toBe(1234567.5);
    expect(readMoneyInput('12 34 567,5', 'EUR', FR)).toBeNaN();
    expect(readMoneyInput('1 234,5', 'SEK', C)).toBe(1234.5);
  });
  it('accepts the symbol or ISO code at either end', () => {
    expect(readMoneyInput('1.234,50 €', 'EUR', C)).toBe(1234.5);
    expect(readMoneyInput('EUR 1.234,50', 'EUR', C)).toBe(1234.5);
    expect(readMoneyInput('$175.50', 'USD', C)).toBe(175.5);
  });
});

describe('readMoneyInput — stored (f1)', () => {
  it('keeps an untouched stored value with more decimals than the currency', () => {
    expect(readMoneyInput(formatMoneyInput(108.7654, 'EUR', C), 'EUR', C, { stored: 108.7654 })).toBe(108.7654);
    expect(readMoneyInput(formatMoney(108.7654, 'EUR', C), 'EUR', C, { stored: 108.7654 })).toBe(108.7654);
    expect(readMoneyInput('108,7', 'EUR', C, { stored: 108.7654 })).toBe(108.7);
  });
  it('coerces a NUMERIC string and returns a number', () => {
    expect(readMoneyInput('108,77', 'EUR', C, { stored: '108.7654' })).toBe(108.7654);
  });
  it('leaves blank and invalid results alone', () => {
    expect(readMoneyInput('', 'EUR', C, { stored: 5 })).toBeNull();
    expect(readMoneyInput('x', 'EUR', C, { stored: 5 })).toBeNaN();
  });
});

describe('formatMoneyInput — keepZero (f1)', () => {
  it('opens a stored 0 as "0" only with keepZero', () => {
    expect(formatMoneyInput(0, 'EUR', C, { keepZero: true })).toBe('0');
    expect(formatMoneyInput('0.00', 'EUR', C, { keepZero: true })).toBe('0');
    expect(formatMoneyInput(0, 'EUR', C)).toBe('');
    for (const v of [null, undefined, '']) expect(formatMoneyInput(v, 'EUR', C, { keepZero: true })).toBe('');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run js/lib/money.test.js` — expected: the new tests FAIL (INR `NaN`, `1 50` → 150, `stored` ignored, keepZero `''`); the existing ones pass.

- [ ] **Step 3: Implement.** `formatMoneyInput`: the `keepZero` branch before the `> 0` check. `separators(locale)` also returns `secondary`: the length of the second-to-last integer part of `formatToParts(1234567)` (hi-IN → 2, everything else → 3). `readMoneyInput` no longer calls `stripDecoration`; the algorithm:

```text
blank → null
s = text with Arabic-Indic / Extended Arabic-Indic digits converted (same two replaces as stripDecoration), trimmed
strip ONE leading (symbol | ISO code, code case-insensitive) + following whitespace, ONE trailing whitespace + (symbol | code), trim again
G = group is whitespace (/^\s$/u) ? '[   ]' : apostrophe ? "['’]" : escaped group
intPart = group ? `(?:\d+|\d{1,P}(?:G\d{P})*G\d{3})` with P = secondary : '\d+'
frac as today; test ^intPart frac$ else NaN
amount = Number(plain); if stored given and Number.isFinite(Number(stored)) and amount === Number(Number(stored).toFixed(digits)) → Number(stored)
```

Keep the existing `readMoneyInput` tests green (`'$175.50'`, `'175.50 USD'`, trailing decimal separator).

- [ ] **Step 4: Run** `npx vitest run js/lib/money.test.js js/lib/money-guard.test.js` — expected: all PASS.

- [ ] **Step 5: Commit** `git add js/lib/money.js js/lib/money.test.js && git commit -m "fix(money): strict readMoneyInput, stored value kept, keepZero (B-196, B-197)"`.

---

### Task 2: master pages — `keepZero`, `stored`, rate card polish (B-204, B-205, B-210)

**Files:**
- Modify: `master-roles.html` (`amountText`, `openRoleForm`, `onMoneyFocus`, `onMoneyBlur`, `saveRole`)
- Modify: `master-pipelines.html` (`openPotForm`, `onPotAmountFocus`, `onPotAmountBlur`, `savePot`)
- Modify: `master-clients.html` (`loadAll`, `data().roles`, `amountText`, `onRcFocus`, `onRcBlur`, row build in the rate card open method, `saveClientRatecard`)
- Test: `js/lib/master-roles-rate-input-guard.test.js`, `js/lib/master-pipelines-pot-input-guard.test.js`, `js/lib/master-clients-ratecard-guard.test.js`

**Interfaces:**
- Consumes: `formatMoneyInput(…, { keepZero: true })`, `readMoneyInput(…, { stored })` (Task 1).
- Produces: `rf.stored` (`{ EUR: number|null, [code]: number }`) in master-roles; `potf.stored` (number|null) in master-pipelines; `row.stored` (`{ [code]: number|null }`) and `rc.msgSeq` (number) in master-clients.

- [ ] **Step 1: Write the failing tests** (static, in each page's guard file):
  - every one of the three files: `expect(html).not.toMatch(/===\s*0\s*\?\s*'0'/)` and `expect(html).toContain('keepZero: true')`;
  - master-roles: `saveRole` body contains `stored: this.rf.stored[` (both for `'EUR'` and the override loop), `onMoneyFocus` and `onMoneyBlur` bodies contain `stored:`;
  - master-pipelines: `savePot`, `onPotAmountFocus`, `onPotAmountBlur` bodies contain `stored: this.potf.stored`;
  - master-clients: `saveClientRatecard`, `onRcFocus`, `onRcBlur` bodies contain `stored: row.stored[code]`; `loadAll` body does not contain `Api.roles.list()`; `html` does not match `/this\.roles\b/`; the success `setTimeout` callback compares `state.msgSeq` with a value captured before it (`expect(save).toMatch(/const seq = \+\+state\.msgSeq/)` and `toContain('state.msgSeq === seq')`).

- [ ] **Step 2: Run** `npx vitest run js/lib/master-roles-rate-input-guard.test.js js/lib/master-pipelines-pot-input-guard.test.js js/lib/master-clients-ratecard-guard.test.js` — expected: the new assertions FAIL.

- [ ] **Step 3: Implement.**
  - `amountText(v, code)` becomes `v == null || v === '' ? '' : window.formatMoneyInput(v, code, this.currencies, { keepZero: true })`; the POT form uses the same expression inline; the focus handlers call `formatMoneyInput(v, code, …, { keepZero: true })`.
  - `stored` holds the amounts the form was opened with, as Numbers (`Number(...)`, `null` when missing): set in `openRoleForm`, `openPotForm` and the rate card row builder (`stored: { EUR: eur, ...each extra currency's ov[c] }`); new forms get `{}`/`null`. Every `readMoneyInput` call in the focus, blur and save handlers passes `{ stored: … }`.
  - master-clients: `loadAll` loads only `Api.clients.list()`; remove `roles: []` from `data()`; `rc` gets `msgSeq: 0`; on success `const seq = ++state.msgSeq;` and the timer clears only `if (state.msgSeq === seq && state.msgKind === 'success')`.

- [ ] **Step 4: Run** the three guard files plus `npx vitest run js/lib/money-guard.test.js js/lib/roles-load.test.js` — expected: PASS.

- [ ] **Step 5: Commit** `git add master-roles.html master-pipelines.html master-clients.html js/lib/master-*.test.js && git commit -m "fix(master): stored 0 and untouched amounts via money.js, rate card message timer (B-204, B-205, B-210)"`; check CR counts per Global Constraints.

---

### Task 3: `project-config.html` — PTC and phasing on `readMoneyInput`, `stored` (B-204, B-216)

**Files:**
- Modify: `project-config.html` (phasing input ~line 218, PTC amount input ~line 262, `onResRateBlur`, `onSave`, PTC remove method ~line 675, `derivePhasing`, `runReforecast`, `parseMoney` method removed)
- Test: `js/lib/project-config-rate-input-guard.test.js` (existing), Create: `js/lib/project-config-ptc-phasing-guard.test.js`

**Interfaces:**
- Consumes: `readMoneyInput(…, { stored })` (Task 1).
- Produces: data `ptcInvalid: {}` (key: PTC index as string → invalid text) and `phasingInvalid: {}` (key: `ym` → invalid text); methods `onPtcBlur(pi, e)`, `onPhasingBlur(ym, e)`, `dropPtcInvalid(pi)`.

- [ ] **Step 1: Write the failing tests** in the new guard (same static style as `project-config-rate-input-guard.test.js`, executing method bodies with `new Function` where behaviour matters):
  - `html` does not contain `parseMoney(`;
  - the phasing and PTC `<input>` tags: `@blur="onPhasingBlur(ym, $event)"` / `@blur="onPtcBlur(pi, $event)"`, `'is-invalid'` bound to the invalid map, `:title` containing `moneyFormatExample(project.currency, currencies)`, `:value` showing the invalid text while it is set, focus not overwriting invalid text;
  - `onPhasingBlur` run on a fake vm: invalid text → stored in `phasingInvalid`, `project.phasing` unchanged; blank → month deleted; `'1.120,30'` with stored `1120.304347826087` → value kept as `1120.304347826087`;
  - `onPtcBlur`: invalid → `ptcInvalid[pi]` set, amount unchanged; blank → `0`;
  - `dropPtcInvalid(1)` on `{ '0': 'a', '1': 'b', '2': 'c' }` → `{ '0': 'a', '1': 'c' }`;
  - `onSave` refuses while `Object.keys(this.ptcInvalid).length` or a `phasingInvalid` key that is in `projectMonths` is set, with the message `Fix the highlighted PTC and phasing amounts before saving: enter amounts in ${currency}, e.g. ${example}.`; a `phasingInvalid` key outside `projectMonths` is dropped, not blocking;
  - `derivePhasing` and `runReforecast` reset `this.phasingInvalid = {}` where they assign `project.phasing`;
  - existing guard: `onResRateBlur` passes `{ stored: res.hourlyRate }`.

- [ ] **Step 2: Run** `npx vitest run js/lib/project-config-ptc-phasing-guard.test.js js/lib/project-config-rate-input-guard.test.js` — expected: FAIL.

- [ ] **Step 3: Implement** to the pattern of `onResRateBlur` (invalid text kept and flagged, nothing written; valid → write, delete the key, reformat with `formatMoney`; phasing `v > 0` writes, else deletes the month; PTC blank → `0`). The PTC remove method calls `this.dropPtcInvalid(pi)` after the splice. Remove the page's `parseMoney` method.

- [ ] **Step 4: Run** `npx vitest run js/lib/project-config-*.test.js js/lib/config-form-calc.test.js` — expected: PASS.

- [ ] **Step 5: Commit** `git add project-config.html js/lib/project-config-*.test.js && git commit -m "fix(project-config): PTC and phasing read via readMoneyInput, stored amounts kept (B-204, B-216)"`; check CR counts.

---

### Task 4: `costgrid.html` — PTC on `readMoneyInput`, rate `keepZero` (B-205, B-216)

**Files:**
- Modify: `costgrid.html` (task PTC `<input>` ~line 428, `data()` ~line 814, `onRateFocus`, `parseMoneyInput` removed)
- Test: `js/lib/costgrid-rate-input-guard.test.js` (existing), Create: `js/lib/costgrid-ptc-input-guard.test.js`

**Interfaces:**
- Consumes: `readMoneyInput`, `formatMoneyInput(…, { keepZero })` (Task 1).
- Produces: data `ptcInvalid: false`, `ptcSnapshot: null`; methods `onPtcFocus(task)`, `onPtcInput(task, event)`, `onPtcBlur(task)`.

- [ ] **Step 1: Write the failing tests:** `html` does not contain `parseMoney` (neither `parseMoneyInput(` nor `window.parseMoney(`); the PTC tag binds `@focus="onPtcFocus(task)"`, `@input="onPtcInput(task, $event)"`, `@blur="onPtcBlur(task)"`, `'is-invalid': ptcInvalid && ptcFocusedTask === task.taskId` and a `:title` with `moneyFormatExample(draft.currency || 'EUR', currencies)`; run `onPtcInput`/`onPtcBlur` bodies on a fake vm: `'12a'` → `ptcInvalid` true, `task.ptc` unchanged; blur after invalid → `task.ptc` back to the focus snapshot; blank → `0`; existing rate guard: `onRateFocus` uses `{ keepZero: true }` and no `=== 0) ? '0'`.

- [ ] **Step 2: Run** `npx vitest run js/lib/costgrid-ptc-input-guard.test.js js/lib/costgrid-rate-input-guard.test.js` — expected: FAIL.

- [ ] **Step 3: Implement** to the pattern of `onRateFocus`/`onRateInput`/`onRateBlur`: focus snapshots `task.ptc` and sets `ptcRaw = moneyInput(task.ptc)`; input reads at every keystroke (null → `task.ptc = 0`, NaN → flag, number → write) and calls `cgScheduleAutoSave()` only on a write; blur with the flag restores the snapshot and autosaves, then clears `ptcFocusedTask`, `ptcRaw`, `ptcInvalid`, `ptcSnapshot`. `onRateFocus` becomes `role.rateIsCustom ? formatMoneyInput(role.rate, …, { keepZero: true }) : formatMoneyInput(role.rate, …)`.

- [ ] **Step 4: Run** `npx vitest run js/lib/costgrid*.test.js` — expected: PASS.

- [ ] **Step 5: Commit** `git add costgrid.html js/lib/costgrid-*.test.js && git commit -m "fix(costgrid): task PTC read via readMoneyInput, rate stored-0 via keepZero (B-205, B-216)"`; check CR counts.

---

### Task 5: cache-busting, docs, backlog

**Files:**
- Modify: every `money.js?v=3` reference (11 HTML pages + `js/lib/costgrid-calc.js`), `costgrid-calc.js?v=13` in `costgrid.html`/`pipeline.html`
- Modify: `docs/js/lib.md` (`money.js` section), `CLAUDE.md` ("Money formatting and parsing", the `parseMoney` clause), `docs/BACKLOG.md` (B-196, B-197, B-204, B-205, B-210, B-216)

- [ ] **Step 1:** bump the versions (Global Constraints); run the grep there — expected: only `money.js?v=4` and `costgrid-calc.js?v=14`, plus the `?v=N` placeholder in `money.js`'s header comment.
- [ ] **Step 2:** `docs/js/lib.md`: describe `keepZero`, the strict read (symbol/code only at the ends, space groups, Indian grouping) and `stored`; update `?v=4`. `CLAUDE.md`: remove "the PTC inputs … still use `parseMoney`" and add that a field reopening a stored amount passes `stored` and a meaningful 0 uses `keepZero` — keep it one sentence (`scripts/claude-md-guard.test.js` ceiling).
- [ ] **Step 3:** close the six backlog rows, each with the re-run command and its output (node probe of `money.js` for B-196/B-197/B-204, `grep -n "=== 0 ? '0'\|parseMoney(" costgrid.html project-config.html master-*.html` for B-205/B-216, `grep -n "Api.roles.list()" master-clients.html` for B-210).
- [ ] **Step 4: Run** `npm test` — expected: all PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "chore(money): bump money.js and costgrid-calc.js versions, docs, close B-196..B-216"`; check CR counts on the HTML files.

## Criteri di accettazione

1. **Round-trip** — `readMoneyInput(formatMoney(x, c), c)` returns `x` for EUR, USD, CHF, JPY and INR above 1,00,000 (Task 1 test).
2. **Rifiuti** — `1 50` and `15€0` in EUR and `12 34 567,5` in fr-FR give `NaN` (Task 1 test).
3. **Valore non toccato** — `readMoneyInput` with `stored: 108.7654` returns `108.7654` from both the focus and the rest text (Task 1 test).
4. **Regola dello 0 in un punto** — no page holds the hand-written zero rule; `formatMoneyInput(0, …, { keepZero: true })` is `'0'` (Tasks 1, 2, 4 tests).
5. **PTC e phasing** — `costgrid.html` and `project-config.html` do not call `parseMoney(`, and their PTC/phasing inputs show `moneyFormatExample` on invalid text (Tasks 3, 4 tests).
6. **Verifica nel browser** — in `project-config.html` unreadable phasing/PTC text stays flagged and blocks Save; in the cost grid's PTC it reverts on blur; in `master-roles.html` an INR rate above 1,00,000 saves without retyping.
7. **Backlog** — B-196, B-197, B-204, B-205, B-210, B-216 closed with the re-run command (Task 5).
8. **Suite** — `npm test` passes (Task 5).

## Decisioni aperte

1. **The PTC/phasing save refusal uses its own message** (`Fix the highlighted PTC and phasing amounts before saving…`). Alternativa scartata: one shared message for rates, PTC and phasing. Perché: the existing rate message is pinned by `project-config-rate-input-guard.test.js` and names the field to fix.
2. **A `phasingInvalid` entry for a month outside `projectMonths` is dropped at Save; Derive/Reforecast clear the whole map.** Alternativa scartata: blocking Save on it. Perché: the field is no longer on screen, so the user could not fix it.
