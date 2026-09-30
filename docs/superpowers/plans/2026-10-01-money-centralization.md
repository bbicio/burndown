# Money centralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every duplicated currency formatter and the broken money parser with one locale-driven module (`js/lib/money.js`) so the same currency reads and writes identically on every page, and fix the x100 money-input bug by construction.

**Architecture:** A pure ES module (`js/lib/money.js`, bridged onto `window`) derives symbol, locale, fraction digits and separators from the active-currency list (`window.__currencies`, from the `currencies` table). Existing formatters (`fmtMoney`, `cgFmtCurrency`, `pbFmtMoney`, two copies in `config.html`) become one-line wrappers so the ~114 call sites stay untouched. The three text money inputs use format-for-focus + strict locale parse. The in-memory project currency becomes an ISO code (symbols only derived for display). A server twin (`api/src/lib/money-format.js`) formats the pipeline-change notification. A vitest guard forbids `Intl.NumberFormat` outside the two modules.

**Tech Stack:** Vanilla JS (no build step), Vue 3 via CDN, vitest + jsdom (frontend), `node:test` (backend), Express/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-01-money-centralization-design.md`

## Global Constraints

- No bundler, no build step for the runtime: nginx serves `js/`/`css/` as they are on disk.
- `js/lib/*.js` are native ES modules loaded with `<script type="module" src="js/lib/…?v=N">`, each with a `window.<name> = <name>` bridge; a module that needs another module uses a native `import`, never the `window` bridge.
- Any `window.*` bridged global may only be read inside a function invoked after `DOMContentLoaded`, never at the top level of a parse-time classic script.
- Every `?v=N` reference to a modified project file is bumped in every page that references it (repo-wide grep before the last commit).
- All user-facing text is English. No native `alert`/`confirm` for new behaviour.
- Stored values stay plain numbers; no API/DB schema change; no data migration.
- Never run `docker compose` against the main stack (`pdash-*`, project `burndown`); browser verification uses `scripts/test-branch.sh` only; never `-v`/`--volumes` anywhere.
- Project currency in memory is always an ISO code (`EUR`, `USD`, `CHF`, …). Symbols are derived only for display.
- Decimals follow the currency (`Intl`: JPY 0, others 2); "rounded" is an explicit option. Parse is strict: only the locale convention of the field's currency is valid, no heuristics.
- Out of scope: hours, dates, exchange rates, per-hour EUR rate labels (`€/h`), `fmtRate`, `type="number"` rate inputs, data repair, removing the wrappers (future cycle).

## Review Focus

- **Non-ISO / unknown currency code (legacy `€`, `XYZ`, lowercase, empty)** reaching `formatMoney`/`parseMoney`: must never throw, must format with the fallback (`it-IT`, 2 decimals). Pinned in Task 2.
- **`window.__currencies` undefined, empty, or not yet loaded:** formatting falls back to `it-IT`/EUR instead of throwing. Pinned in Task 2 and Task 4.
- **Text the user pastes or types with stray characters** (symbol before or after the number, NBSP/regular spaces in `sv-SE`, ASCII `'` for the `de-CH` group separator, surrounding blanks): parsed as the locale intends. Pinned in Task 2.
- **Zero, negative, empty, non-numeric, huge and over-precise input:** `''`/`abc` → 0, `-5` → -5 (callers treat ≤ 0 as "clear the field"), `1234567890,123` → rounded to the currency digits. Pinned in Task 2.
- **A locale with non-Latin digits and separators** (`ar-EG`): round trip still holds. Pinned in Task 2.
- **Page that calls a money wrapper but never loads `money.js`** (a silent `window.formatMoney is not a function` at runtime on one page): pinned by the load-order guard test in Task 9.
- **A `?v=N` bumped in a tag but not in the `import` inside `pipeline-calc.js`** (module evaluated twice, stale cache): pinned by the version-consistency guard in Task 9.

---

### Task 0: Worktree setup

**Files:** none modified.

- [ ] **Step 1: Install the frontend test toolchain in the worktree**

The worktree has no `node_modules` (gitignored). From the worktree root run:

```powershell
npm ci
```

Expected: completes without error; `npx vitest --version` prints a version.

- [ ] **Step 2: Confirm the baseline is green**

```powershell
npm test
```

Expected: all existing vitest tests PASS. If anything fails on a clean checkout, stop and report it: it is not part of this cycle.

- [ ] **Step 3: Copy the gitignored `.env` for later browser verification (Task 10)**

```powershell
Copy-Item "C:\Users\fafortini\Progetti\burndown\.env" "C:\Users\fafortini\Progetti\burndown\.claude\worktrees\money-centralization\.env"
```

Never commit it (it is gitignored; `git status` must not list it).

---

### Task 1: Characterization tests for the existing formatters

Pins today's output so the wrapper change in Task 4 is provably the intended one (Scenario 2 rule).

**Files:**
- Create: `js/lib/money-characterization.test.js`

**Interfaces:**
- Consumes: `pbFmtMoney` from `js/lib/pipeline-calc.js`; `fmtMoney` in `js/core.js:212`; `cgFmtCurrency` in `js/costgrid.js:57` (both classic scripts, read as text).
- Produces: a test file that keeps passing unchanged through Task 4 except for one import line added there.

- [ ] **Step 1: Write the test file**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pbFmtMoney } from './pipeline-calc.js';

// core.js and costgrid.js are classic scripts full of globals: pull one top-level function out of the
// source text and build it with the globals it reads passed in as parameters. Path is relative to the
// repo root (vitest's cwd).
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { i++; break; }
  }
  return src.slice(start, i);
}

const coreSrc = readFileSync('js/core.js', 'utf8');
const costgridSrc = readFileSync('js/costgrid.js', 'utf8');

// After Task 4 the wrappers call window.formatMoney; the bridge is read at call time.
const bridge = () => ({ formatMoney: window.formatMoney });

function loadFmtMoney(currencies, currentCfg = null) {
  const win = { __currencies: currencies, ...bridge() };
  return new Function('window', 'currentCfg', `${extractFn(coreSrc, 'fmtMoney')}; return fmtMoney;`)(win, currentCfg);
}
function loadCgFmtCurrency(currencies) {
  const win = { __currencies: currencies, ...bridge() };
  return new Function('window', `${extractFn(costgridSrc, 'cgFmtCurrency')}; return cgFmtCurrency;`)(win);
}

const USD = { code: 'USD', symbol: '$', locale: 'en-US' };

describe('fmtMoney (js/core.js) — current behaviour', () => {
  it.each([
    [1234.5, 'USD', [USD], '$ 1,234.50'],
    [12345.5, 'EUR', [], '€ 12.345,50'],
    [5, 'XYZ', [], 'XYZ 5,00'],
    [0, 'EUR', [], '€ 0,00'],
    [10, undefined, [], '€ 10,00'],
  ])('fmtMoney(%s, %s) -> %s', (n, code, currencies, expected) => {
    expect(loadFmtMoney(currencies)(n, code)).toBe(expected);
  });

  it('returns an em dash for null and undefined', () => {
    const fmt = loadFmtMoney([]);
    expect(fmt(null)).toBe('—');
    expect(fmt(undefined)).toBe('—');
  });

  it('defaults the currency to currentCfg.currency', () => {
    expect(loadFmtMoney([USD], { currency: 'USD' })(10)).toBe('$ 10.00');
  });
});

describe('cgFmtCurrency (js/costgrid.js) — current behaviour', () => {
  it.each([
    [1234.5, 'USD', [USD], '$ 1,234.50'],
    [12345.5, 'EUR', [], '€ 12.345,50'],
    [5, 'XYZ', [], 'XYZ 5,00'],
    ['abc', 'EUR', [], '€ 0,00'],
  ])('cgFmtCurrency(%s, %s) -> %s', (n, code, currencies, expected) => {
    expect(loadCgFmtCurrency(currencies)(n, code)).toBe(expected);
  });
});

describe('pbFmtMoney (js/lib/pipeline-calc.js) — current behaviour', () => {
  it.each([
    [1234.5, 'USD', [USD], '$ 1,234.50'],
    [12345.5, 'EUR', [], '€ 12.345,50'],
    [5, 'XYZ', [], 'XYZ 5,00'],
    [NaN, 'EUR', [], '€ 0,00'],
  ])('pbFmtMoney(%s, %s) -> %s', (n, code, currencies, expected) => {
    expect(pbFmtMoney(n, code, currencies)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run it against the unchanged code**

```powershell
npx vitest run js/lib/money-characterization.test.js
```

Expected: all PASS (this pins existing behaviour; if a case fails, fix the expected string to match the real output of the current code, not the code).

- [ ] **Step 3: Commit**

```powershell
git add js/lib/money-characterization.test.js
git commit -m "test: characterize current money formatters before centralization" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `js/lib/money.js` with its tests

**Files:**
- Create: `js/lib/money.js`
- Test: `js/lib/money.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (ES exports, also on `window`): `currencyInfo(code, currencies) -> { code, symbol, locale, digits }`; `formatMoney(amount, code, currencies, { rounded } = {}) -> string`; `formatMoneyInput(amount, code, currencies) -> string` (bare locale number, no symbol/grouping, `''` for ≤ 0 or non-numeric); `parseMoney(text, code, currencies) -> number` (strict locale, rounded to the currency digits, `0` for empty/unparseable). `currencies` is the `window.__currencies` shape `{ code, symbol, locale, … }[]`, may be `undefined`/`[]`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { currencyInfo, formatMoney, formatMoneyInput, parseMoney } from './money.js';

const C = [
  { code: 'EUR', symbol: '€',   locale: 'it-IT' },
  { code: 'USD', symbol: '$',   locale: 'en-US' },
  { code: 'CHF', symbol: 'CHF', locale: 'de-CH' },
  { code: 'SEK', symbol: 'kr',  locale: 'sv-SE' },
  { code: 'INR', symbol: '₹',   locale: 'hi-IN' },
  { code: 'JPY', symbol: '¥',   locale: 'ja-JP' },
  { code: 'EGP', symbol: 'E£',  locale: 'ar-EG' },
];
const AMOUNTS = [0.05, 350.28, 1234.5, 12345.67, 100000.75];

describe('currencyInfo', () => {
  it('reads symbol, locale and fraction digits from the currency list', () => {
    expect(currencyInfo('USD', C)).toEqual({ code: 'USD', symbol: '$', locale: 'en-US', digits: 2 });
    expect(currencyInfo('JPY', C).digits).toBe(0);
  });
  it('falls back to it-IT, EUR symbol and 2 digits when the list is missing or empty', () => {
    expect(currencyInfo('EUR', undefined)).toEqual({ code: 'EUR', symbol: '€', locale: 'it-IT', digits: 2 });
    expect(currencyInfo(undefined, [])).toEqual({ code: 'EUR', symbol: '€', locale: 'it-IT', digits: 2 });
    expect(currencyInfo('XYZ', [])).toEqual({ code: 'XYZ', symbol: 'XYZ', locale: 'it-IT', digits: 2 });
  });
  it('never throws on a non-ISO code such as a legacy symbol', () => {
    expect(() => currencyInfo('€', C)).not.toThrow();
    expect(currencyInfo('€', C).digits).toBe(2);
  });
});

describe('formatMoney', () => {
  it('formats with the locale of the currency', () => {
    expect(formatMoney(12345, 'EUR', C)).toBe('€ 12.345,00');
    expect(formatMoney(12345, 'USD', C)).toBe('$ 12,345.00');
  });
  it('uses the currency fraction digits (JPY has none)', () => {
    expect(formatMoney(12345.6, 'JPY', C)).toBe('¥ 12,346');
  });
  it('rounded drops the decimals', () => {
    expect(formatMoney(12345.67, 'EUR', C, { rounded: true })).toBe('€ 12.346');
  });
  it('renders a non-finite amount as zero', () => {
    expect(formatMoney(NaN, 'EUR', C)).toBe('€ 0,00');
    expect(formatMoney(undefined, 'EUR', C)).toBe('€ 0,00');
    expect(formatMoney('abc', 'USD', C)).toBe('$ 0.00');
  });
  it('falls back without throwing when the currency list is missing', () => {
    expect(formatMoney(10, 'EUR', [])).toBe('€ 10,00');
    expect(formatMoney(5, 'XYZ', [])).toBe('XYZ 5,00');
    expect(formatMoney(5, 'EUR', undefined)).toBe('€ 5,00');
    expect(formatMoney(5, '€', C)).toBe('€ 5,00');
  });
});

describe('formatMoneyInput', () => {
  it('is the bare number in the locale format, without symbol or grouping', () => {
    expect(formatMoneyInput(350.28, 'EUR', C)).toBe('350,28');
    expect(formatMoneyInput(350.28, 'USD', C)).toBe('350.28');
    expect(formatMoneyInput(12345.67, 'EUR', C)).toBe('12345,67');
    expect(formatMoneyInput(350, 'EUR', C)).toBe('350');
  });
  it('is empty for zero, negative and non-numeric values', () => {
    expect(formatMoneyInput(0, 'EUR', C)).toBe('');
    expect(formatMoneyInput(-3, 'EUR', C)).toBe('');
    expect(formatMoneyInput(undefined, 'EUR', C)).toBe('');
  });
});

describe('parseMoney', () => {
  it('reads the locale convention of the currency', () => {
    expect(parseMoney('350,28', 'EUR', C)).toBe(350.28);
    expect(parseMoney('150,75', 'EUR', C)).toBe(150.75);
    expect(parseMoney('1.234,5', 'EUR', C)).toBe(1234.5);
    expect(parseMoney('1,234.50', 'USD', C)).toBe(1234.5);
  });
  it('is strict: the other convention is NOT guessed (documented behaviour)', () => {
    expect(parseMoney('350.28', 'EUR', C)).toBe(35028);
  });
  it('tolerates a symbol or ISO code before or after the number and surrounding blanks', () => {
    expect(parseMoney('  € 350,28 ', 'EUR', C)).toBe(350.28);
    expect(parseMoney('350,28 €', 'EUR', C)).toBe(350.28);
    expect(parseMoney('EUR 1.234,5', 'EUR', C)).toBe(1234.5);
    expect(parseMoney('$ 1,234.50', 'USD', C)).toBe(1234.5);
  });
  it('treats regular, non-breaking and narrow spaces alike as a group separator (sv-SE)', () => {
    expect(parseMoney('1 234,5', 'SEK', C)).toBe(1234.5);
    expect(parseMoney('1\u00a0234,5', 'SEK', C)).toBe(1234.5);
    expect(parseMoney('1\u202f234,5', 'SEK', C)).toBe(1234.5);
  });
  it('accepts an ASCII apostrophe for the de-CH group separator', () => {
    expect(parseMoney("1'234.50", 'CHF', C)).toBe(1234.5);
    expect(parseMoney('1\u2019234.50', 'CHF', C)).toBe(1234.5);
  });
  it('returns 0 for empty and unparseable text, keeps a negative sign', () => {
    expect(parseMoney('', 'EUR', C)).toBe(0);
    expect(parseMoney(undefined, 'EUR', C)).toBe(0);
    expect(parseMoney('abc', 'EUR', C)).toBe(0);
    expect(parseMoney('12,3,4', 'EUR', C)).toBe(0);
    expect(parseMoney('-5', 'EUR', C)).toBe(-5);
  });
  it('rounds to the fraction digits of the currency', () => {
    expect(parseMoney('1.234.567.890,123', 'EUR', C)).toBe(1234567890.12);
    expect(parseMoney('1234.6', 'JPY', C)).toBe(1235); // ja-JP: '.' is the decimal, ',' the group separator
  });
});

describe('round trip (focus text and display text parse back to the same value)', () => {
  const codes = C.map(c => c.code);
  for (const code of codes) {
    it(`${code}: parse(formatMoneyInput(x)) and parse(formatMoney(x)) equal x rounded to the currency digits`, () => {
      const digits = currencyInfo(code, C).digits;
      for (const a of AMOUNTS) {
        const want = Number(a.toFixed(digits));
        if (!(want > 0)) continue;
        expect(parseMoney(formatMoneyInput(a, code, C), code, C)).toBe(want);
        expect(parseMoney(formatMoney(a, code, C), code, C)).toBe(want);
      }
    });
  }

  it('regression x100: focus then blur of 350.28 EUR leaves 350.28', () => {
    const focusText = formatMoneyInput(350.28, 'EUR', C);
    expect(parseMoney(focusText, 'EUR', C)).toBe(350.28);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```powershell
npx vitest run js/lib/money.test.js
```

Expected: FAIL (`./money.js` cannot be resolved).

- [ ] **Step 3: Write `js/lib/money.js`**

```js
// js/lib/money.js
// The single implementation of currency formatting and parsing. Loaded as a native ES module
// (<script type="module" src="js/lib/money.js?v=N">) and bridged onto `window` so the classic-script
// wrappers (fmtMoney, cgFmtCurrency, …) and the Vue pages can call it. Pure: the currency list
// (window.__currencies shape, { code, symbol, locale, … }[]) is always passed in.

const FALLBACK_LOCALE = 'it-IT';

function numberFormat(locale, options) {
  try { return new Intl.NumberFormat(locale, options); }
  catch { return new Intl.NumberFormat(FALLBACK_LOCALE, options); }
}

// Intl throws on a code that is not a valid ISO 4217 shape (e.g. a stray '€'): default to 2 digits.
function currencyDigits(locale, code) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
  } catch { return 2; }
}

export function currencyInfo(code, currencies) {
  const c = code || 'EUR';
  const entry = (currencies || []).find(cu => cu.code === c);
  const locale = entry?.locale || FALLBACK_LOCALE;
  return {
    code: c,
    symbol: entry ? entry.symbol : (c === 'EUR' ? '€' : c),
    locale,
    digits: currencyDigits(locale, c),
  };
}

export function formatMoney(amount, code, currencies, { rounded = false } = {}) {
  const info = currencyInfo(code, currencies);
  const digits = rounded ? 0 : info.digits;
  const n = parseFloat(amount);
  const nf = numberFormat(info.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${info.symbol} ${nf.format(Number.isFinite(n) ? n : 0)}`;
}

// Text shown in a money <input> while it has focus: same number format the parser reads.
export function formatMoneyInput(amount, code, currencies) {
  const n = parseFloat(amount);
  if (!(n > 0)) return '';
  const info = currencyInfo(code, currencies);
  return numberFormat(info.locale, {
    useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: info.digits,
  }).format(n);
}

function separators(locale) {
  // 12345.6 has five integer digits, so locales that skip grouping for 4-digit numbers still group it.
  const parts = numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).formatToParts(12345.6);
  return {
    group: parts.find(p => p.type === 'group')?.value || '',
    decimal: parts.find(p => p.type === 'decimal')?.value || '.',
  };
}

// Strict: only the locale convention of `code` is valid. Returns 0 for empty/unparseable text.
export function parseMoney(text, code, currencies) {
  const info = currencyInfo(code, currencies);
  const { group, decimal } = separators(info.locale);
  let s = String(text ?? '');
  s = s.split(info.symbol).join('');
  if (/^[A-Za-z]+$/.test(info.code)) s = s.replace(new RegExp(info.code, 'gi'), '');
  s = s.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660))
       .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x6F0));
  s = s.replace(/[\s\u00a0\u202f]/g, '');
  if (/^['\u2019]$/.test(group)) s = s.replace(/['\u2019]/g, '');
  else if (group) s = s.split(group).join('');
  if (decimal !== '.') s = s.split(decimal).join('.');
  if (!/^-?\d*\.?\d*$/.test(s)) return 0;
  const v = parseFloat(s);
  if (!Number.isFinite(v)) return 0;
  return Number(v.toFixed(info.digits));
}

if (typeof window !== 'undefined') {
  window.currencyInfo = currencyInfo;
  window.formatMoney = formatMoney;
  window.formatMoneyInput = formatMoneyInput;
  window.parseMoney = parseMoney;
}
```

- [ ] **Step 4: Run the tests**

```powershell
npx vitest run js/lib/money.test.js
```

Expected: PASS. If an exact-string assertion fails only because of ICU data differences (for example a different group character), confirm the real `Intl` output in a quick node one-liner and adjust the **expected string** in the test, not the algorithm; the round-trip cases are the contract.

- [ ] **Step 5: Commit**

```powershell
git add js/lib/money.js js/lib/money.test.js
git commit -m "feat: add locale-driven money module (format, input text, strict parse)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server twin `api/src/lib/money-format.js`

**Files:**
- Create: `api/src/lib/money-format.js`
- Test: `api/src/lib/money-format.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatMoney(amount, { code, symbol, locale } = {}, { rounded } = {}) -> string`, same output as the browser `formatMoney` for the same inputs.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMoney } = require('./money-format');

// Same cases as js/lib/money.test.js (a file cannot be shared between browser and Node without a build step).
const EUR = { code: 'EUR', symbol: '€', locale: 'it-IT' };
const USD = { code: 'USD', symbol: '$', locale: 'en-US' };
const JPY = { code: 'JPY', symbol: '¥', locale: 'ja-JP' };

test('money-format: formats with the locale of the currency', () => {
  assert.equal(formatMoney(12345, EUR), '€ 12.345,00');
  assert.equal(formatMoney(12345, USD), '$ 12,345.00');
});

test('money-format: uses the currency fraction digits', () => {
  assert.equal(formatMoney(12345.6, JPY), '¥ 12,346');
});

test('money-format: rounded drops the decimals', () => {
  assert.equal(formatMoney(12345.67, EUR, { rounded: true }), '€ 12.346');
});

test('money-format: a non-finite amount renders as zero', () => {
  assert.equal(formatMoney(NaN, EUR), '€ 0,00');
  assert.equal(formatMoney(undefined, EUR), '€ 0,00');
  assert.equal(formatMoney('abc', USD), '$ 0.00');
});

test('money-format: falls back without throwing when currency info is missing', () => {
  assert.equal(formatMoney(10, { code: 'EUR' }), '€ 10,00');
  assert.equal(formatMoney(5, { code: 'XYZ' }), 'XYZ 5,00');
  assert.equal(formatMoney(5), '€ 5,00');
  assert.equal(formatMoney(5, { code: '€' }), '€ 5,00');
});
```

- [ ] **Step 2: Run it to verify it fails**

```powershell
cd api
node --test src/lib/money-format.test.js
cd ..
```

Expected: FAIL (`Cannot find module './money-format'`).

- [ ] **Step 3: Write `api/src/lib/money-format.js`**

```js
// Server-side twin of js/lib/money.js's formatMoney (no build step, so the browser module cannot be
// required here). Same output for the same inputs; keep the two test tables in sync.
const FALLBACK_LOCALE = 'it-IT';

function numberFormat(locale, options) {
  try { return new Intl.NumberFormat(locale, options); }
  catch { return new Intl.NumberFormat(FALLBACK_LOCALE, options); }
}

function currencyDigits(locale, code) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
  } catch { return 2; }
}

function formatMoney(amount, { code, symbol, locale } = {}, { rounded = false } = {}) {
  const c = code || 'EUR';
  const loc = locale || FALLBACK_LOCALE;
  const sym = symbol || (c === 'EUR' ? '€' : c);
  const digits = rounded ? 0 : currencyDigits(loc, c);
  const n = parseFloat(amount);
  const nf = numberFormat(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${sym} ${nf.format(Number.isFinite(n) ? n : 0)}`;
}

module.exports = { formatMoney };
```

- [ ] **Step 4: Run the test**

```powershell
cd api
node --test src/lib/money-format.test.js
cd ..
```

Expected: PASS (pure lib, no `api/node_modules` needed).

- [ ] **Step 5: Commit**

```powershell
git add api/src/lib/money-format.js api/src/lib/money-format.test.js
git commit -m "feat: add server-side money formatter twin" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wrappers around the module, and module loading on every money page

**Files:**
- Modify: `js/core.js:212-219`, `js/costgrid.js:57-63`, `js/lib/pipeline-calc.js:85-92` (+ an import at the top), `config.html:1097-1105` and `:1190-1198`
- Modify (add the `money.js` script tag): `pipeline.html`, `portfolio.html`, `costgrid.html`, `project-config.html`, `config.html`, `timesheets.html`, `planning.html`
- Test: `js/lib/money-characterization.test.js` (one import line)

**Interfaces:**
- Consumes: `window.formatMoney` / `formatMoney` from Task 2.
- Produces: unchanged signatures `fmtMoney(n, currencyCode)`, `cgFmtCurrency(amount, code)`, `pbFmtMoney(n, code, currencies)`.

- [ ] **Step 1: Make the characterization test load the bridge**

In `js/lib/money-characterization.test.js` add, right after the `pbFmtMoney` import line:

```js
import './money.js'; // sets window.formatMoney, which the wrappers read at call time
```

Run `npx vitest run js/lib/money-characterization.test.js`: still PASS (old code ignores the bridge).

- [ ] **Step 2: Replace `fmtMoney` in `js/core.js`**

Replace the function (lines 212-219) with:

```js
function fmtMoney(n, currencyCode) {
  if (n === null || n === undefined) return '—';
  return window.formatMoney(n, currencyCode || currentCfg?.currency || 'EUR', window.__currencies);
}
```

- [ ] **Step 3: Replace `cgFmtCurrency` in `js/costgrid.js`**

Replace the function (lines 57-63) with:

```js
function cgFmtCurrency(amount, code) {
  return window.formatMoney(amount, code, window.__currencies);
}
```

- [ ] **Step 4: Replace `pbFmtMoney` in `js/lib/pipeline-calc.js`**

Add as the first statement of the file:

```js
import { formatMoney } from './money.js?v=1';
```

Replace the function (lines 85-92) with:

```js
export function pbFmtMoney(n, code, currencies) {
  return formatMoney(n, code, currencies);
}
```

(The import uses the same URL as the page's `<script type="module">` tag so the module is evaluated once; the `?v=N` here is bumped together with the tags in Task 9.)

- [ ] **Step 5: Replace the two copies in `config.html`**

At `config.html:1097-1105` delete the `const opts = …;` line (1097) and replace the `fmtAmtC` arrow function (1098-1105) with:

```js
      const fmtAmtC = (n, cur) => {
        if (!n) return '—';
        return window.formatMoney(n, (cur || 'EUR').trim(), window.__currencies);
      };
```

At `config.html:1190-1198` delete the `const opts = …;` line and replace that `fmtAmtC` with:

```js
      const fmtAmtC = (n, cur) => {
        if (n == null || n === 0) return '—';
        return window.formatMoney(n, (cur || 'EUR').trim(), window.__currencies);
      };
```

Run `grep -n "\bopts\b" config.html`: no remaining references in those two functions.

- [ ] **Step 6: Load `money.js` on every page that uses a wrapper**

In each of `pipeline.html`, `portfolio.html`, `costgrid.html`, `project-config.html`, `config.html`, `timesheets.html`, `planning.html`, use the Edit tool to replace the line

```html
<script type="module" src="js/lib/notif-browser.js?v=2"></script>
```

with itself followed by

```html
<script type="module" src="js/lib/money.js?v=1"></script>
```

(keep each file's existing indentation and line endings).

- [ ] **Step 7: Run the characterization and module tests**

```powershell
npx vitest run js/lib
```

Expected: PASS — the same outputs as before the change for EUR/USD/unknown-code cases. If vitest cannot resolve the `./money.js?v=1` specifier in `pipeline-calc.js`, stop and report it (do not silently drop the query: the query keeps the browser to a single module instance and a versioned cache key).

- [ ] **Step 8: Commit**

```powershell
git add js/core.js js/costgrid.js js/lib/pipeline-calc.js config.html pipeline.html portfolio.html costgrid.html project-config.html timesheets.html planning.html js/lib/money-characterization.test.js
git commit -m "refactor: route fmtMoney, cgFmtCurrency, pbFmtMoney and config copies through money.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ISO codes in memory and currency loading

**Files:**
- Modify: `js/api-sync.js:216` and `:253-258`, `js/costgrid.js:884`, `project-config.html` (l. 80, 419, data `currencies`, `currencyOptions`, init at ~501), `portfolio.html:900`, `planning.html:1321`
- Test: `js/api-sync.test.js`

**Interfaces:**
- Consumes: `loadCurrenciesFromApi()` (`js/api-sync.js:73`, already exists).
- Produces: `project.currency` is always an ISO code; `project-config.html` Vue data `currencies` (array) and computed `currencyOptions`.

- [ ] **Step 1: Update the test (failing)**

In `js/api-sync.test.js`:

1. Next to `let failing;` add `let argsByPart = {};`.
2. In the `fake` Proxy handler, record the args: change `calls.push(part);` to `calls.push(part); argsByPart[part] = args;`.
3. Return the extra function: change the `return { _pushProjectToApiDetailed, _pushProjectToApi };` inside the `new Function` string to `return { _pushProjectToApiDetailed, _pushProjectToApi, _apiProjectToLocal };`.
4. Change the fixture to `const base = { id: 'p1', name: 'P', currency: 'EUR', clientId: null };`.
5. Append:

```js
describe('project currency is an ISO code in memory and on the wire', () => {
  beforeEach(() => { calls = []; failing = new Set(); argsByPart = {}; });

  it('keeps the code when loading a project from the API', () => {
    const { _apiProjectToLocal } = loadSync();
    expect(_apiProjectToLocal({ id: 'p', currency: 'USD' }).currency).toBe('USD');
    expect(_apiProjectToLocal({ id: 'p', currency: 'CHF' }).currency).toBe('CHF');
    expect(_apiProjectToLocal({ id: 'p' }).currency).toBe('EUR');
  });

  it('sends the code unchanged when saving', async () => {
    const { _pushProjectToApiDetailed } = loadSync();
    await _pushProjectToApiDetailed({ ...base, currency: 'GBP', tasks: [] });
    expect(argsByPart.update[1].currency).toBe('GBP');
  });
});
```

Run `npx vitest run js/api-sync.test.js`. Expected: the first new test FAILS (`'USD'` comes back as `'$'`).

- [ ] **Step 2: Remove the symbol translation in `js/api-sync.js`**

Line 216 becomes:

```js
    currency:   p.currency || 'EUR',
```

Delete lines 253-258 (the comment `// Convert currency symbol to ISO code …`, the `currencySymbolMap` constant and the `if (meta.currency) { … }` block). `meta.currency` now goes to the server as it is.

- [ ] **Step 3: Run the test**

```powershell
npx vitest run js/api-sync.test.js
```

Expected: PASS.

- [ ] **Step 4: New cost-grid draft uses the code**

`js/costgrid.js:884`: change `currency:       '€',` to `currency:       'EUR',`.

- [ ] **Step 5: `project-config.html` — default, menu and currency loading**

1. Line 419 (`BLANK_PROJECT`): `currency: '€'` → `currency: 'EUR'`.
2. In `data()` (after `ready: false,` at line 428) add `currencies: [],`.
3. Line 80: replace the whole `<select …>…</select>` (the four fixed `<option>`s) with:

```html
<select class="form-select form-select-sm" v-model="project.currency" :disabled="isViewer"><option v-for="cu in currencyOptions" :key="cu.code" :value="cu.code">{{ cu.symbol }} {{ cu.name }}</option></select>
```

4. Add a computed (next to the other `computed:` entries of this Vue app):

```js
      currencyOptions() {
        const list = (this.currencies || []).slice();
        const cur = this.project?.currency;
        if (cur && !list.some(cu => cu.code === cur)) list.push({ code: cur, symbol: cur, name: '(inactive)' });
        return list;
      },
```

5. Line 501: replace

```js
      await Promise.all([loadClientsFromApi(), loadProgramsFromApi()]);
```

with

```js
      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadCurrenciesFromApi()]);
      this.currencies = window.__currencies || [];
```

- [ ] **Step 6: Load currencies on `portfolio.html` and `planning.html`**

`portfolio.html:900`: add `loadCurrenciesFromApi()` to the array:

```js
      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadCurrenciesFromApi()]);
```

`planning.html:1321`:

```js
      await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadRolesFromApi(), loadCurrenciesFromApi()]);
```

- [ ] **Step 7: Run all frontend tests**

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add js/api-sync.js js/api-sync.test.js js/costgrid.js project-config.html portfolio.html planning.html
git commit -m "refactor: project currency is an ISO code in memory; load active currencies on money pages" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Money inputs use the module (the x100 fix)

**Files:**
- Modify: `project-config.html` (inputs at l. 210-213 and 254-257, methods at l. 907-919, `cfgCurrencyLocale` users), `costgrid.html` (input l. 326-330, methods near l. 1216)

**Interfaces:**
- Consumes: `window.formatMoney`, `window.formatMoneyInput`, `window.parseMoney` (Task 2), `window.__currencies`.
- Produces: Vue methods on `project-config.html`: `fmtMoney(amount, cur?)`, `moneyInput(amount)`, `parseMoney(str)`; on `costgrid.html`: `moneyInput(amount)`, `parseMoneyInput(text)`.

- [ ] **Step 1: Replace the project-config money methods**

Replace lines 906-919 (the `cfgCurrencyLocale`, `fmtMoney` and `parseMoney` methods and the comment above them) with:

```js
      // Money formatting/parsing: one implementation in js/lib/money.js, driven by the locale of the project currency.
      fmtMoney(amount, cur) { return window.formatMoney(amount || 0, cur || this.project?.currency, window.__currencies); },
      moneyInput(amount) { return window.formatMoneyInput(amount, this.project?.currency, window.__currencies); },
      parseMoney(str) { return window.parseMoney(str, this.project?.currency, window.__currencies); },
```

Run `grep -n "cfgCurrencyLocale" project-config.html`: no remaining references (the only users were the removed methods).

- [ ] **Step 2: Focus text for the phasing inputs**

Line 212 becomes:

```html
               @focus="e => { e.target.value = moneyInput(project.phasing[ym]); }"
```

(The `:value` and `@blur` lines stay as they are: blur already calls `parseMoney`/`fmtMoney`, now the shared implementation.)

- [ ] **Step 3: Focus text for the PTC amount input**

Line 256 becomes:

```html
               @focus="e => { e.target.value = moneyInput(item.amount); }"
```

- [ ] **Step 4: `costgrid.html` per-task PTC**

Lines 328-329 become:

```html
                      @focus="ptcFocusedTask = task.taskId; ptcRaw = moneyInput(task.ptc)"
                      @input="ptcRaw = $event.target.value; task.ptc = parseMoneyInput($event.target.value); cgScheduleAutoSave()"
```

Add these methods right after `fmtCur(amount) { … },` (line ~1216):

```js
    moneyInput(amount) { return window.formatMoneyInput(amount, this.draft?.currency || 'EUR', window.__currencies); },
    parseMoneyInput(text) { return window.parseMoney(text, this.draft?.currency || 'EUR', window.__currencies); },
```

- [ ] **Step 5: Run the frontend tests**

```powershell
npm test
```

Expected: PASS (no test touches these templates; the behaviour is verified in the browser in Task 10).

- [ ] **Step 6: Commit**

```powershell
git add project-config.html costgrid.html
git commit -m "fix: money inputs show and read the same locale format (no more x100 on focus/blur)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Remaining hardcoded amount formatting

**Files:**
- Modify: `costgrid.html` (l. 943, 1362, 1397-1407), `js/costgrid.js:633`, `pipeline.html` (l. 693, 749), `config.html:1955-1957`

**Interfaces:**
- Consumes: `window.formatMoney`, `window.currencyInfo`, `window.__currencies`.
- Produces: no new names.

- [ ] **Step 1: `costgrid.html`**

1. Line 943: `curSym: (this.currencies || []).find(c => c.code === currency)?.symbol || '€',` → `curSym: window.currencyInfo(currency, this.currencies).symbol,`
2. Line 1362: replace the method with
```js
    phasingFmtAmount(n) { return window.formatMoney(n, this.draft.currency || 'EUR', window.__currencies, { rounded: true }); },
```
3. Lines 1397-1407 (`newEntry`/`prevEntry`/`newSym`/`prevSym`, `fmtR` and its two uses): replace the `fmtR` definition with
```js
      const fmtR = (n, code) => window.formatMoney(n, code, window.__currencies);
```
and in the row template change `fmtR(r.currentRate, prevSym)` → `fmtR(r.currentRate, prevCurrency)` and `fmtR(r.newRate, newSym)` → `fmtR(r.newRate, newCurrency)`. Then `grep -n "newSym\|prevSym\|newEntry\|prevEntry" costgrid.html`: delete the now-unused declarations (lines 1397-1400) only if no other reference remains in that function.

- [ ] **Step 2: `js/costgrid.js:633`**

```js
  const fmtA  = n => window.formatMoney(n, cur, window.__currencies, { rounded: true });
```

- [ ] **Step 3: `pipeline.html`**

1. Line 693: `const cur = card.v.currency || '€';` → `const cur = card.v.currency || 'EUR';` (with the old `'€'` default the following `cur !== 'EUR'` test was wrongly true for a missing currency).
2. Line 749: replace with
```js
    potFmtMoney(n) { return window.formatMoney(n, 'EUR', window.__currencies, { rounded: true }); },
```

- [ ] **Step 4: `config.html:1955-1957`**

```js
    fmtAmount(n) {
      return window.formatMoney(n, 'EUR', window.__currencies);
    },
```

- [ ] **Step 5: Audit what is left**

```powershell
git grep -n "toLocaleString('en'" -- "*.html" "*.js"
```

Expected: only non-money uses remain (exchange rates at `costgrid.html:108`, `config.html:751/1341/1342/1953/2015`, `pipeline.html:219/789-790`, month labels). Any other hit that formats an amount must be migrated here.

- [ ] **Step 6: Run the frontend tests**

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add costgrid.html js/costgrid.js pipeline.html config.html
git commit -m "refactor: move remaining hardcoded amount formatting to money.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Pipeline-change notification uses the currency locale

**Files:**
- Modify: `api/src/routes/cost-grids.js` (import, query at l. 17-33, l. 36-37)

**Interfaces:**
- Consumes: `formatMoney` from `api/src/lib/money-format.js` (Task 3).
- Produces: notification body line `Value: € 12.345` (locale of the version currency).

- [ ] **Step 1: Import the formatter**

After `const { isAdminRole } = require('../lib/is-admin');` add:

```js
const { formatMoney } = require('../lib/money-format');
```

- [ ] **Step 2: Select the locale and format with it**

In the query add `cu.locale AS currency_locale,` after the `currency_symbol` line and extend the group: `GROUP BY cg.name, c.name, cgv.currency, cu.symbol, cu.locale`. Replace lines 36-37 with:

```js
    const { cg_name, client_name, currency, currency_symbol, currency_locale, fee } = info[0];
    const feeStr = formatMoney(fee, { code: currency, symbol: currency_symbol, locale: currency_locale }, { rounded: true });
```

- [ ] **Step 3: Sanity check the module loads**

```powershell
node -e "require('./api/src/lib/money-format'); console.log('ok')"
```

Expected: `ok`. (The route itself needs `api/node_modules`; it is exercised in Task 10.)

- [ ] **Step 4: Commit**

```powershell
git add api/src/routes/cost-grids.js
git commit -m "fix: pipeline-change notification formats the amount with the currency locale" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Guard tests, cache-busting and final audit

**Files:**
- Create: `js/lib/money-guard.test.js`
- Modify: every `*.html` that references a bumped file; `js/lib/pipeline-calc.js` only if its `money.js` import version changes (it does not: stays `?v=1`)

**Interfaces:**
- Consumes: the final repo state.
- Produces: tests that fail if a second money formatter appears, a money page lacks `money.js`, or the `money.js` version references diverge.

- [ ] **Step 1: Write the guard tests**

```js
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ALLOWED = new Set(['js/lib/money.js', 'api/src/lib/money-format.js']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'docs', 'backups', 'coverage']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = p => p.slice(ROOT.length + 1).replace(/\\/g, '/');
const files = walk(ROOT).map(rel);
const sources = files.filter(f => /\.(js|html)$/.test(f) && !/\.test\.js$/.test(f));
const read = f => readFileSync(join(ROOT, f), 'utf8');

describe('money guard', () => {
  it('Intl.NumberFormat is used only inside the two money modules', () => {
    const offenders = sources.filter(f => !ALLOWED.has(f) && /Intl\.NumberFormat/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('every page that loads core.js and uses a money function also loads js/lib/money.js', () => {
    const uses = /\b(fmtMoney|cgFmtCurrency|pbFmtMoney|formatMoney|formatMoneyInput|parseMoney|fmtAmtC)\(|js\/costgrid\.js|js\/lib\/pipeline-calc\.js|js\/portfolio\.js/;
    const offenders = files
      .filter(f => /^[^/]+\.html$/.test(f))
      .filter(f => { const t = read(f); return /js\/core\.js/.test(t) && uses.test(t) && !/js\/lib\/money\.js/.test(t); });
    expect(offenders).toEqual([]);
  });

  it('every reference to js/lib/money.js carries the same ?v=N', () => {
    const versions = new Set();
    for (const f of sources) for (const m of read(f).matchAll(/money\.js\?v=(\d+)/g)) versions.add(m[1]);
    expect([...versions].length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the guard tests**

```powershell
npx vitest run js/lib/money-guard.test.js
```

Expected: PASS. If the first test names a file, that file still has its own `Intl.NumberFormat`: migrate it to `money.js` (it belongs in Task 4 or 7). If the second names a page, add the `money.js` tag to it (Task 4, Step 6).

- [ ] **Step 3: Bump the `?v=N` of every modified versioned file, in every page**

Files modified in this cycle that carry a version: `js/core.js` (7 → 8), `js/costgrid.js` (34 → 35), `js/api-sync.js` (19 → 20), `js/lib/pipeline-calc.js` (2 → 3). `js/lib/money.js` is new at `?v=1`. Run from the worktree root:

```powershell
$enc = New-Object System.Text.UTF8Encoding($false)
foreach ($f in Get-ChildItem -Filter *.html) {
  $t = [System.IO.File]::ReadAllText($f.FullName)
  $n = $t.Replace('js/core.js?v=7','js/core.js?v=8').Replace('js/costgrid.js?v=34','js/costgrid.js?v=35').Replace('js/api-sync.js?v=19','js/api-sync.js?v=20').Replace('js/lib/pipeline-calc.js?v=2','js/lib/pipeline-calc.js?v=3')
  if ($n -ne $t) { [System.IO.File]::WriteAllText($f.FullName, $n, $enc) }
}
```

- [ ] **Step 4: Prove nothing stale remains**

```powershell
git grep -n "js/core.js?v=7\|js/costgrid.js?v=34\|js/api-sync.js?v=19\|pipeline-calc.js?v=2" -- "*.html" "*.js"
```

Expected: no output. Also run `git grep -n "js/core.js?v=\|js/costgrid.js?v=\|js/api-sync.js?v=\|pipeline-calc.js?v=\|money.js?v="` and confirm each file appears with one single version everywhere (8 / 35 / 20 / 3 / 1). Fix any divergence.

- [ ] **Step 5: Final audit of symbols used as currency values**

```powershell
git grep -n "currency: '€'\|currency === '€'\|currencySymbolMap\|cfgCurrencyLocale" -- "*.html" "*.js"
```

Expected: no output (test fixtures excluded; if a hit is a legitimate display-only symbol, leave it and note why in the PR description).

- [ ] **Step 6: Run the whole test suites**

```powershell
npm test
cd api
node --test src/lib/money-format.test.js
cd ..
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "test: money guard tests; bump ?v=N of every modified script" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(`git status` must not list `.env`.)

---

### Task 10: Browser verification on an isolated branch stack

No code is written here unless a defect is found (fix it in the task that owns it, with a test if it can be tested). Follow `CLAUDE.md` infrastructure rules: never touch the main stack with `docker compose`; use the isolated script only. This task ends where `/finish-cycle` Gate 2 picks up (it will reuse or rebuild the branch environment; do not tear it down yourself: only after the user's own "yes" there).

- [ ] **Step 1: Start the isolated stack**

```powershell
bash scripts/test-branch.sh up
```

Expected: branch containers healthy (`bash scripts/test-branch.sh status` exits 0). Note the printed URL/port.

- [ ] **Step 2: Activate two extra currencies and set up data**

In `config.html` → Currencies, activate `USD` and `CHF` (and, if available for the check, `JPY`). Create or open one project per currency (EUR, USD, CHF) in `project-config.html`.

- [ ] **Step 3: Check each scenario and record the result**

- `project-config.html`, EUR project: phasing cell `350,28` → focus shows `350,28` → blur leaves `€ 350,28`, stored 350.28 (no ×100). Same on a PTC amount. Type `150,75` → `€ 150,75`.
- USD project: `1,234.50` → `$ 1,234.50`; focus shows `1234.50`; blur unchanged.
- CHF project: value reads and shows in `de-CH` (`CHF 1’234.50`), focus/blur unchanged; the same CHF amount looks identical in `costgrid.html`.
- `costgrid.html` per-task PTC (EUR cost grid): type `150,75` → total uses 150.75; focus/blur leaves it unchanged; repeat on a USD grid.
- The currency menu in `project-config.html` lists exactly the active currencies (plus the project's own one if it was deactivated).
- `pipeline.html`, `portfolio.html`, `planning.html` (if it shows amounts), `config.html` (POT amounts, phasing tables): amounts for EUR/USD/CHF projects render in the currency locale, no `USD 1.234,00` style fallback.
- Change a version's pipeline stage; as admin open the bell: the notification shows `Value: € 12.345` (locale format, no decimals).
- Optional (JPY active): a JPY grid shows no decimals and the PTC input accepts integers.

- [ ] **Step 4: Report**

Write the outcome (pass/fail per bullet, any defect found and its fix commit) in the cycle notes handed to `/finish-cycle`. If everything passes, the cycle is ready for `/finish-cycle` (test gate, code review, merge, sync-docs).

---

## Self-review (run after writing; results)

- **Spec coverage:** module (Task 2), server twin (3), wrappers + hardcoded spots (4, 7), ISO model + menu + currency loading (5), inputs (6), notification (8), guard + cache-bust + audit (9), characterization tests (1), browser verification (10), excluded scope respected (no `€/h`, hours, rates, data repair). Spec criterion 9 (`?v=N`) → Task 9; criterion 10 → Task 10.
- **Placeholders:** none; every code step carries the code.
- **Type consistency:** `currencyInfo/formatMoney/formatMoneyInput/parseMoney` signatures identical in Tasks 2, 4, 5, 6, 7; server `formatMoney(amount, { code, symbol, locale }, { rounded })` identical in Tasks 3 and 8; Vue method names `moneyInput`, `parseMoney` (project-config), `moneyInput`, `parseMoneyInput` (costgrid) consistent between Task 6 steps.
- **Review Focus:** each line maps to a test in Task 2, Task 4 (wrapper characterization) or Task 9.
