# Money centralization — design spec

Date: 2026-10-01 · Scenario 2 (evolution of existing behaviour) · Path: architectural

## 1. Problem

Currency amounts are formatted and parsed by several independent implementations that disagree.

- **Bug (found 2026-09-30):** in `project-config.html` the phasing inputs (l. 210-213) and the PTC amount input (l. 254-257) show the raw number with a dot on focus (`350.28`). On blur `parseMoney` (l. 913-919) reads it with the de-DE rule used for every currency except `$`/`£` (dot = thousands separator), so focus + blur without editing turns `350.28` into `35028` (x100) and saving persists it. Phasing reproduced in the browser; PTC inferred from code only.
- **Related defect:** `costgrid.html:329` parses the per-task PTC live with `parseFloat`, so a typed `150,75` becomes `150`.
- **Root cause:** there is no single money module. Formatters: `js/core.js:212` `fmtMoney`, `js/costgrid.js:57` `cgFmtCurrency`, `js/lib/pipeline-calc.js:85-91` `pbFmtMoney`, two copies in `config.html` (l. 1104, 1197), and a divergent one in `project-config.html:908-919` (fixed map `$`/`£` -> en-US, everything else -> de-DE, currency symbols used as keys). The others take the `locale` of the currency from the `currencies` table. Hardcoded `en`/`it-IT` amount formatting exists in `costgrid.html:1362`/`:1401`, `js/costgrid.js:633`, `pipeline.html:749`, `config.html:1953-1956`/`:2015`, and (server) `api/src/routes/cost-grids.js:37`.
- **Currency identity:** the DB and the API already use ISO codes (`projects.currency`, `cost_grid_versions.currency` FK to `currencies`). In memory `js/api-sync.js:216` converts `EUR/USD/GBP` to `€/$/£` (and `:254-258` back), other codes pass through, so `project.currency` is a symbol for three currencies and a code for the rest.
- **Loading gap:** `window.__currencies` (active currencies, with `locale`) is loaded by `costgrid`, `pipeline`, `config`, `timesheets`, but not by `portfolio.html` (48 `fmtMoney` calls) or `project-config.html`. There `fmtMoney` falls back to the code as symbol and the `it-IT` locale for non-EUR currencies (`js/core.js:216-217`).

## 2. Goal

One locale-driven implementation of money formatting and parsing, used by every page, for input and output. The rule: the active currencies in `currencies` are the single source; each currency's `locale` decides separators, and its own fraction digits decide decimals. The same currency reads and writes identically everywhere. The x100 bug disappears by construction (focus text and parser use the same rule).

## 3. Decisions (taken with the user during brainstorming)

1. New module `js/lib/money.js` (ES module + `window.*` bridge, like the other `js/lib/` modules), pure functions, the currency list passed as data.
2. The canonical in-memory currency is the ISO code everywhere; the symbol is derived only for display.
3. Decimals follow the currency (`Intl`, e.g. JPY 0, most 2), not a fixed 2. "Rounded" views are an explicit option.
4. Parse is **strict**: only the locale convention of the field's currency is valid; blur reformats so the user sees what was read. No heuristics.
5. The server-side pipeline-change notification (an in-app bell notification to admins, not an email) is included.
6. **Approach 1:** the existing functions stay as one-line wrappers around the module so the ~114 call sites do not change. Removing the wrappers (call the module directly) is a future cycle (memory: `project_money_wrapper_cleanup_future_cycle`).
7. Scope is one branch, one `/finish-cycle`, built in phases (section 9).

## 4. Module: `js/lib/money.js`

All functions are pure and receive the currency list (`window.__currencies` shape: `{ code, symbol, locale, ... }`).

- `currencyInfo(code, currencies)` -> `{ code, symbol, locale, digits }`. `digits` from `new Intl.NumberFormat(locale, { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits`, with a `try/catch` defaulting to 2 (Intl throws on a non-ISO code such as a stray `€`). A falsy code means `EUR`. Code not in the list: `{ symbol: code === 'EUR' ? '€' : code, locale: 'it-IT', digits }` (the existing fallback, now in one place).
- `formatMoney(amount, code, currencies, { rounded } = {})` -> `€ 12.345,00`; with `rounded`, no decimals (`€ 12.345`). Symbol prefix and a space, as today.
- `formatMoneyInput(amount, code, currencies)` -> bare number in the locale format, no symbol, no grouping, currency digits (`350,28`). Empty for 0/null.
- `parseMoney(text, code, currencies)` -> number. Group and decimal separators derived from the locale with `formatToParts`. A leading symbol or ISO code is tolerated. Rounded to the currency digits. Empty or unparseable text returns 0.
- Bridge: `window.formatMoney`, `window.formatMoneyInput`, `window.parseMoney`, `window.currencyInfo`.

Server: `api/src/lib/money-format.js` (CommonJS) exporting `formatMoney(amount, { code, symbol, locale }, { rounded } = {})`, same output as the browser function for the same inputs, with its own `node:test`. A shared table of cases (same inputs/expected strings) is repeated in both test files, since a file cannot be shared between browser and Node without a build step.

## 5. Loading currencies

Every page with money calls `loadCurrenciesFromApi()` (`js/api-sync.js:73`) before the first render, in parallel with the other startup fetches. Added to `portfolio.html`, `project-config.html` and `planning.html` (all three already load `api-sync.js`). `config.html:1272` and `timesheets.html:276-280` keep their own direct `Api.currencies.active()` load: neither page loads `api-sync.js`, and both already load before first use. The error fallback stays (EUR only, `it-IT`) with the existing `console.warn`. `window.__currencies` remains an in-memory per-page cache, no localStorage. Every page that uses a wrapper loads `<script type="module" src="js/lib/money.js?v=1">` before the scripts that call it.

## 6. In-memory currency model (ISO codes)

- `js/api-sync.js:216` -> `currency: p.currency || 'EUR'`; `:254-258` symbol-to-code map removed, `meta.currency` sent as is (default `'EUR'`).
- `project-config.html:419` default `'EUR'`; `js/costgrid.js:884` default `'EUR'` (check the context when implementing).
- `project-config.html:80`: the menu is built from the active currencies (`value = code`, label `symbol + name`). If the project's own currency is no longer active, it is shown as an extra option so saving never erases it.
- `project-config.html:907-919` (`cfgCurrencyLocale`, `fmtMoney`, `parseMoney`) removed in favour of the module; display fallbacks `'€'` in `pipeline.html:693`, `costgrid.html:943`, `js/lib/pipeline-calc.js:89` simplified to the module's single fallback.
- `js/api-sync.test.js:23` fixture `currency: '€'` -> `'EUR'`; the test asserts that nothing is converted anymore.
- Server routes (`projects.js`, `reporting.js`, `exports.js`, `timesheets.js`) already use codes: no change. No migration: the DB already holds codes and the in-memory state is not persisted. As a side effect `portfolio.html:1109` (`currentCfg = cfg`) and `js/core.js:214` (`currentCfg?.currency` as a code) start finding the currency instead of failing silently.

## 7. Inputs

Three text inputs migrate; all behave the same:
- **Rest:** `formatMoney`. **Focus:** `formatMoneyInput`. **Blur:** `parseMoney`, store the value, reformat with `formatMoney`. A value <= 0 or unparseable clears the field (phasing: the key is deleted; PTC: 0), as today. No new alert.
- Fields: phasing (`project-config.html:210-213`), PTC amount (`project-config.html:254-257`), per-task PTC (`costgrid.html:326-330`).
- Per-task PTC keeps its live update and autosave on each keystroke, but with `parseMoney` instead of `parseFloat`. Intermediate values while typing can look odd under strict parse (for example `1.2` in a euro field reads as 12 until completed); the final value is correct and blur reformats.
- **Out of scope (verified):** `costgrid.html:1308/1313` are sold hours, not money. Rate fields (`costgrid.html:241`, `config.html:878/883`, `js/ratecards.js:276/286`) are `type="number"`: the browser handles the separator and the internal value always has a dot, so they are not affected.

## 8. Outputs and guard

- **Wrappers (same signature, one-line bodies calling the module):** `fmtMoney` (`js/core.js:212`, keeps its `currentCfg?.currency` default and the `—` for null/undefined), `cgFmtCurrency` (`js/costgrid.js:57`), `pbFmtMoney` (`js/lib/pipeline-calc.js:85-92`, via native ES `import { formatMoney } from './money.js?v=1'`: same URL as the page's script tag so the module is evaluated once, and the `?v=N` in the import is bumped together with the others), the two copies in `config.html:1104` and `:1197`.
- **Hardcoded spots moved to the module** (with `rounded: true` where they round today): `costgrid.html:1362` and `js/costgrid.js:633` (phasing amounts), `costgrid.html:1401` (`fmtR`), `pipeline.html:749` (`potFmtMoney`, EUR), `config.html:1956` (`fmtAmount`, EUR).
- **Excluded, not amounts:** per-hour rate labels and values in EUR (`config.html:877/920/2015/2054`, `js/ratecards.js:292/302`: role rates are EUR by definition and already show the real symbol in the other-currency columns), `fmtRate` (`config.html:1952`), exchange rates (4-6 decimals: `costgrid.html:108`, `config.html:751/1341/1342`, `pipeline.html:219/789`), hours, counts.
- **Server:** `api/src/routes/cost-grids.js:21` adds `cu.locale` to the query, `:37` uses `money-format.js` with `rounded: true`. The notification text changes from `€ 12,345` to `€ 12.345` (same as the app).
- **Guard test (vitest):** reads `js/`, `*.html` and `api/src/` and fails if `Intl.NumberFormat` appears outside `js/lib/money.js` and `api/src/lib/money-format.js`. `toLocaleString` has legitimate non-money uses (hours, counts, rates), so it cannot be banned wholesale; for it the review of the listed spots applies.

## 9. Phases (one branch)

0. **Characterization tests** (scenario 2 rule): pin the current output of `fmtMoney`/`cgFmtCurrency`/`pbFmtMoney` for EUR, USD, GBP, CHF and a non-EUR currency with a locale, so the wrapper change is provably the intended one.
1. **Foundations:** `money.js` + vitest, `money-format.js` + node:test, no behaviour change.
2. **Data model:** ISO codes in memory, dynamic currency menu, currency loading on every money page.
3. **Inputs:** the three fields migrate; the x100 bug is gone.
4. **Outputs:** wrappers, hardcoded spots, notification, guard test, bump of every `?v=N` (grep each modified file repo-wide; `money.js?v=1` added to the pages that load it).
5. **Browser verification** on an isolated branch stack (`scripts/test-branch.sh`), several active currencies, focus + blur on every money field, portfolio/pipeline/costgrid/project-config/config display.

## 10. Acceptance criteria

1. One implementation of money format/parse: the guard test passes; no other `Intl.NumberFormat` in the repo.
2. Focus + blur without editing never changes a stored value, for every active currency, on the three fields.
3. Typing `150,75` in a euro field stores 150.75 (project-config phasing, PTC; costgrid per-task PTC).
4. Round-trip (format -> parse) passes for `it-IT`, `en-US`, `de-CH`, `sv-SE`, `hi-IN`, `ja-JP`, including empty, no decimals, thousands, currency symbol/code prefix, JPY without decimals.
5. `project.currency` is an ISO code in memory everywhere; `grep` for `'€'`, `'$'`, `'£'` used as currency values finds none.
6. The same currency renders identically in costgrid, pipeline, portfolio, project-config and config (including CHF).
7. Activating a currency in `config.html` makes it appear in the costgrid and project-config menus and format correctly downstream.
8. The pipeline-change notification shows the amount in the currency locale; node:test covers it.
9. Every `?v=N` of a modified file is bumped in every page that references it (verified by grep).
10. Verified in the browser on a branch test stack.

## 11. Excluded scope

- Correcting already-stored money values (no corrupted data exists; main stack values are the originals).
- Hours, dates, exchange rates and conversion logic; new currencies or changes to the `currencies` table.
- Removing the wrappers (future cycle, Approach 2).
- Replacing native `type="number"` rate inputs.

## 12. Risks

- `project.currency` symbol usage found with pattern greps; an indirect use (a map key built from the currency) could be missed. Mitigation: the grep criterion (5) and a browser check of views that read the project currency.
- The money module runs as a deferred module; wrappers read `window.formatMoney` only when called after `DOMContentLoaded`, as the project's bridge rule requires.
- Currency loading order cannot be unit-tested on the frontend; it is covered by the browser verification on every page (phase 5).
- Strict parse: a value pasted in the other convention (`350.28` in a euro field) is read as 35.028. Mitigated by blur reformatting; accepted by the user as the predictable behaviour.
