# Frontend Test Infrastructure — Ciclo 1 (cfg-parse pilot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a vitest + jsdom test toolchain (dev-only, never served by nginx) and extract `cfgParseHours`, `cfgFmtHours`, and a new shared `roundToQuarterHour` helper from `js/config-form.js` into a testable ES module (`js/lib/cfg-parse.js`), covered by characterization tests that lock down current behavior — including the historical REG-13 (de-DE locale inflating "22.25" to 2225) and REG-14 (quarter-hour rounding) regressions.

**Architecture:** `js/lib/cfg-parse.js` is written as a native ES module (`export function ...`) with a `window.<name> = <name>` bridge line per function, so it works unmodified as both a `<script type="module">` in the existing no-build-step pages and as a plain `import` target in vitest — no bundler, no adapter. `config-form.js` keeps calling the functions as globals (unchanged call sites), now resolved via the bridge instead of local declarations. The toolchain (npm, vitest, jsdom) lives only on the dev machine; nginx gets explicit deny rules so none of it is ever reachable over HTTP even though nginx bind-mounts the whole repo root.

**Tech Stack:** vitest, jsdom, npm (root `package.json`, separate from `api/package.json`)

## Global Constraints

- Runtime (nginx-served files) must not change behavior for any existing page — `config-form.js` callers keep calling `cfgParseHours`/`cfgFmtHours` exactly as before.
- No bundler, no build step for the runtime. The new module is a plain file loaded via `<script type="module">`, not compiled.
- `node_modules/`, `package.json`, `package-lock.json`, `vitest.config.js`, and any `*.test.js`/`*.spec.js` file must return 404 from nginx even though `./:/usr/share/nginx/html:ro` mounts the entire repo root and `^/(css|js)/` is public without auth.
- `cfgFmtHours` (round + format) and the reforecast rounding at `config-form.js:848` (round only, no formatting) are distinct operations that only share the `Math.round(n * 4) / 4` sub-expression — do not collapse them into one function; only extract the shared math into `roundToQuarterHour(n)`.
- Bridged `window.*` globals may only be read from inside async handlers or `DOMContentLoaded` callbacks, never at top-level parse time of a classic script (module scripts are deferred; classic non-deferred scripts run immediately at parse time).
- All user-facing text stays in English (not relevant to this plan — no UI copy is touched).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `package.json` | Create (root) | npm scripts (`test`, `test:watch`) + vitest/jsdom devDependencies, scoped to frontend tooling only |
| `.gitignore` | Modify | add root `/node_modules/` |
| `vitest.config.js` | Create (root) | vitest config, `environment: 'jsdom'` |
| `nginx.conf` | Modify | deny rules for dev-only toolchain artifacts |
| `js/lib/cfg-parse.js` | Create | `cfgParseHours`, `cfgFmtHours`, `roundToQuarterHour` — ES module + window bridge |
| `js/lib/cfg-parse.test.js` | Create | characterization tests for all three functions |
| `js/config-form.js` | Modify | remove the three function definitions (now resolved via bridge); line 848 calls `roundToQuarterHour` instead of the inline expression |
| `project-config.html` | Modify | add `<script type="module" src="js/lib/cfg-parse.js">` before the existing `config-form.js` tag |
| `portfolio.html` | Modify | same |
| `planning.html` | Modify | same |
| `CLAUDE.md` | Modify | toolchain wording + module loading-order rule + `js/lib/cfg-parse.js` file-structure entry |

---

### Task 1: Test toolchain setup

**Files:**
- Create: `package.json` (root)
- Create: `vitest.config.js` (root)
- Create: `js/lib/smoke.test.js` (deleted at the end of this task — its only purpose is to prove the pipeline runs)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` and `npm run test:watch` commands, usable by every later task

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "pdash-frontend",
  "version": "1.0.0",
  "private": true,
  "description": "PDash frontend test toolchain (dev-only; never bundled or served)",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install vitest and jsdom as dev dependencies**

Run: `npm install -D vitest jsdom`
Expected: `node_modules/` created at repo root, `package.json` gains a `devDependencies` block with `vitest` and `jsdom` entries, `package-lock.json` created.

- [ ] **Step 3: Add root `node_modules/` to `.gitignore`**

Edit `.gitignore`, under the existing `# Node` section:

```gitignore
# Node
api/node_modules/
node_modules/
```

- [ ] **Step 4: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['js/**/*.test.js'],
  },
});
```

- [ ] **Step 5: Write a throwaway smoke test**

Create `js/lib/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest';

describe('vitest pipeline smoke test', () => {
  it('runs and asserts', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the smoke test**

Run: `npm test`
Expected: 1 test file, 1 test passed (`js/lib/smoke.test.js > vitest pipeline smoke test > runs and asserts`)

- [ ] **Step 7: Delete the smoke test**

The smoke test's only job was to prove the toolchain works end-to-end; real characterization tests start in Task 3.

Run: `rm js/lib/smoke.test.js` (or delete via your editor)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.js .gitignore
git commit -m "chore: add vitest + jsdom dev-only test toolchain"
```

---

### Task 2: nginx deny rules for dev-only toolchain artifacts

**Files:**
- Modify: `nginx.conf`

**Interfaces:**
- Consumes: nothing
- Produces: guarantee (independently verifiable) that `node_modules/`, `package.json`, `package-lock.json`, `vitest.config.js`, and any `*.test.js`/`*.spec.js` file are never served over HTTP

- [ ] **Step 1: Add deny blocks to `nginx.conf`**

Open `nginx.conf`. Insert the following block immediately **before** the existing `# ── PUBLIC ASSETS (no auth — needed by login/activate pages) ──` block (currently at line 59), so the regex deny rules are evaluated ahead of the `^/(css|js)/` prefix match:

```nginx
    # ── DEV-ONLY TOOLCHAIN — never served, even though nginx mounts the repo root ──
    location ~ /node_modules/ { deny all; return 404; }
    location ~ \.test\.js$    { deny all; return 404; }
    location ~ \.spec\.js$    { deny all; return 404; }
    location = /package.json      { deny all; return 404; }
    location = /package-lock.json { deny all; return 404; }
    location = /vitest.config.js  { deny all; return 404; }

```

The full `location` block order in the file should now read: `/auth-check` → `@to_login` → `/api/notifications/stream` → `/api/` → dev-only deny block (new) → public pages → public assets → protected app.

- [ ] **Step 2: Verify the deny rules with an isolated nginx container**

This spins up only the `nginx` service (not the full stack) to check the config in isolation.

Run:
```bash
docker run --rm -d --name pdash-nginx-test -p 8081:80 \
  -v "$(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$(pwd):/usr/share/nginx/html:ro" \
  nginx:alpine
```

Expected: container starts (nginx will log upstream connection errors for `/api/` and `/auth-check` since there's no `api` container in this isolated run — that's fine, we're only checking the deny rules, not the auth-gated routes).

- [ ] **Step 3: Curl the denied paths**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/node_modules/vitest/package.json
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/package.json
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/package-lock.json
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/vitest.config.js
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/js/lib/cfg-parse.test.js
```

Expected: all five return `404`.

Note: `js/lib/cfg-parse.test.js` does not exist on disk yet at this point in the plan (it's created in Task 3) — the 404 here comes from the nginx deny rule itself (`return 404`), not from a missing-file 404, so this check is valid even before the file exists. After Task 3 creates the file, re-running this same curl still returns 404, now for the same deny-rule reason.

- [ ] **Step 4: Confirm a legitimate JS asset still loads**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/js/core.js`
Expected: `200` — proves the deny rules don't collateral-damage the public `/js/` assets.

- [ ] **Step 5: Tear down the test container**

Run: `docker stop pdash-nginx-test`

- [ ] **Step 6: Commit**

```bash
git add nginx.conf
git commit -m "chore: deny nginx access to dev-only test toolchain files"
```

---

### Task 3: Extract and characterize `cfgParseHours`

**Files:**
- Create: `js/lib/cfg-parse.js`
- Create: `js/lib/cfg-parse.test.js`
- Read (no changes yet): `js/config-form.js:940-945` (current `cfgParseHours` definition, left in place until Task 5)

**Interfaces:**
- Consumes: nothing
- Produces: `cfgParseHours(str: string): number`, exported from `js/lib/cfg-parse.js` and bridged to `window.cfgParseHours`

- [ ] **Step 1: Create `js/lib/cfg-parse.js` with a verbatim copy of `cfgParseHours`**

The implementation below is copied unchanged from `js/config-form.js:940-945` (only `function` → `export function`, plus the bridge line). The original in `config-form.js` is **not** touched yet — both copies coexist until Task 5, so nothing in the running app changes in this task.

```js
// js/lib/cfg-parse.js
// Pure helpers extracted from js/config-form.js. Loaded as a native ES module
// (<script type="module">) and bridged onto `window` so existing classic-script
// callers keep working unchanged. See CLAUDE.md "Script loading order" for the
// deferred-execution rule this bridge depends on.

export function cfgParseHours(str) {
  // Hours are always formatted with "." as decimal (via cfgFmtHours / toFixed).
  // Never run through cfgParseMoney — de-DE locale strips "." as thousands sep → "22.25" → 2225.
  const s = String(str).trim().replace(/[^\d.]/g, '');
  return parseFloat(s) || 0;
}

window.cfgParseHours = cfgParseHours;
```

- [ ] **Step 2: Write characterization tests for `cfgParseHours`**

Create `js/lib/cfg-parse.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { cfgParseHours } from './cfg-parse.js';

describe('cfgParseHours', () => {
  it('REG-13: does not inflate "22.25" via de-DE thousands-separator stripping', () => {
    expect(cfgParseHours('22.25')).toBe(22.25);
  });

  it('parses a plain integer string', () => {
    expect(cfgParseHours('10')).toBe(10);
  });

  it('parses a decimal string', () => {
    expect(cfgParseHours('7.5')).toBe(7.5);
  });

  it('strips non-numeric characters (e.g. currency symbols) before parsing', () => {
    expect(cfgParseHours('€10.5')).toBe(10.5);
  });

  it('returns 0 for an empty string', () => {
    expect(cfgParseHours('')).toBe(0);
  });

  it('returns 0 for a non-numeric string', () => {
    expect(cfgParseHours('abc')).toBe(0);
  });

  it('returns 0 for null-ish input coerced to string', () => {
    expect(cfgParseHours(null)).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: 7 tests passed in `js/lib/cfg-parse.test.js`.

- [ ] **Step 4: Commit**

```bash
git add js/lib/cfg-parse.js js/lib/cfg-parse.test.js
git commit -m "test: characterize cfgParseHours and extract it into js/lib/cfg-parse.js"
```

---

### Task 4: Extract and characterize `cfgFmtHours` and `roundToQuarterHour`

**Files:**
- Modify: `js/lib/cfg-parse.js`
- Modify: `js/lib/cfg-parse.test.js`
- Read (no changes yet): `js/config-form.js:848` (reforecast rounding), `js/config-form.js:932-938` (current `cfgFmtHours` definition)

**Interfaces:**
- Consumes: nothing new
- Produces: `roundToQuarterHour(n: number): number` and `cfgFmtHours(n: number): string`, both exported from `js/lib/cfg-parse.js` and bridged onto `window`

`config-form.js:848` today reads `newPlanning[ym] = Math.round(newPlanning[ym] * 4) / 4;` — a bare rounding of a numeric value, no formatting, no `n > 0` guard. `cfgFmtHours` (lines 932-938) does guard + round + format-as-string. These are different operations that share only the `Math.round(n * 4) / 4` sub-expression — `roundToQuarterHour` extracts exactly that sub-expression, nothing more. Both call sites are tested independently below before either is touched, so the pre-refactor behavior of each is locked in first.

- [ ] **Step 1: Add `roundToQuarterHour` and `cfgFmtHours` to `js/lib/cfg-parse.js`**

Append to `js/lib/cfg-parse.js` (verbatim logic from `js/config-form.js:932-938`, factored to share the rounding sub-expression):

```js
export function roundToQuarterHour(n) {
  return Math.round(n * 4) / 4;
}

export function cfgFmtHours(n) {
  if (!(n > 0)) return '';
  // Snap to nearest quarter-hour (XLS actuals are always .00/.25/.50/.75)
  const r = roundToQuarterHour(n);
  // Always use "." as decimal — cfgParseHours must match this convention
  return r % 1 === 0 ? String(r) : r.toFixed(2);
}

window.roundToQuarterHour = roundToQuarterHour;
window.cfgFmtHours = cfgFmtHours;
```

- [ ] **Step 2: Write characterization tests for `roundToQuarterHour` covering both original call sites' behavior**

Append to `js/lib/cfg-parse.test.js`:

```js
import { roundToQuarterHour, cfgFmtHours } from './cfg-parse.js';

describe('roundToQuarterHour', () => {
  it('REG-14: rounds a fractional carry-over value to the nearest quarter-hour (reforecast site, config-form.js:848)', () => {
    expect(roundToQuarterHour(10.125)).toBe(10.25);
  });

  it('rounds down when closer to the lower quarter-hour', () => {
    expect(roundToQuarterHour(10.05)).toBe(10);
  });

  it('leaves an exact quarter-hour value unchanged', () => {
    expect(roundToQuarterHour(7.5)).toBe(7.5);
  });

  it('returns a plain number (no formatting) — matches the reforecast site which writes the result straight into newPlanning[ym]', () => {
    const result = roundToQuarterHour(10.125);
    expect(typeof result).toBe('number');
    expect(result).toBe(10.25);
  });
});

describe('cfgFmtHours', () => {
  it('rounds to the nearest quarter-hour before formatting', () => {
    expect(cfgFmtHours(10.125)).toBe('10.25');
  });

  it('formats a whole number without decimals', () => {
    expect(cfgFmtHours(10)).toBe('10');
  });

  it('formats a fractional value with two decimals', () => {
    expect(cfgFmtHours(7.5)).toBe('7.50');
  });

  it('returns an empty string for zero (the n > 0 guard, absent from the reforecast site)', () => {
    expect(cfgFmtHours(0)).toBe('');
  });

  it('returns an empty string for a negative value', () => {
    expect(cfgFmtHours(-5)).toBe('');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: 16 tests passed total in `js/lib/cfg-parse.test.js` (7 from Task 3 + 9 new).

- [ ] **Step 4: Commit**

```bash
git add js/lib/cfg-parse.js js/lib/cfg-parse.test.js
git commit -m "test: characterize cfgFmtHours and extract shared roundToQuarterHour helper"
```

---

### Task 5: Wire the module into the running app and remove the originals from `config-form.js`

**Files:**
- Modify: `js/config-form.js:848` (use `roundToQuarterHour` instead of the inline expression)
- Modify: `js/config-form.js:932-945` (delete the three original function definitions)
- Modify: `project-config.html:225` (add module script tag before the `config-form.js` tag)
- Modify: `portfolio.html:437` (same)
- Modify: `planning.html:218` (same)

**Interfaces:**
- Consumes: `cfgParseHours`, `cfgFmtHours`, `roundToQuarterHour` from `js/lib/cfg-parse.js` (Tasks 3-4), now bridged onto `window`
- Produces: `config-form.js` calls to `cfgParseHours`/`cfgFmtHours` (unchanged call sites, e.g. `config-form.js:972,978,979,988`) now resolve to the bridged globals instead of local declarations

- [ ] **Step 1: Add the module script tag to `project-config.html`**

In `project-config.html`, change line 225 from:

```html
<script src="js/config-form.js?v=12"></script>
```

to:

```html
<script type="module" src="js/lib/cfg-parse.js"></script>
<script src="js/config-form.js?v=12"></script>
```

- [ ] **Step 2: Add the module script tag to `portfolio.html`**

In `portfolio.html`, change line 437 from:

```html
<script src="js/config-form.js?v=12"></script>
```

to:

```html
<script type="module" src="js/lib/cfg-parse.js"></script>
<script src="js/config-form.js?v=12"></script>
```

- [ ] **Step 3: Add the module script tag to `planning.html`**

In `planning.html`, change line 218 from:

```html
<script src="js/config-form.js?v=11"></script>
```

to:

```html
<script type="module" src="js/lib/cfg-parse.js"></script>
<script src="js/config-form.js?v=11"></script>
```

- [ ] **Step 4: Replace the inline rounding expression at `config-form.js:848` with the extracted helper**

In `js/config-form.js`, change:

```js
  Object.keys(newPlanning).forEach(ym => {
    if (!pastYMs.has(ym)) newPlanning[ym] = Math.round(newPlanning[ym] * 4) / 4;
  });
```

to:

```js
  Object.keys(newPlanning).forEach(ym => {
    if (!pastYMs.has(ym)) newPlanning[ym] = roundToQuarterHour(newPlanning[ym]);
  });
```

- [ ] **Step 5: Delete the original function definitions from `config-form.js`**

Remove lines 932-945 entirely (the original `cfgFmtHours` and `cfgParseHours` definitions):

```js
function cfgFmtHours(n) {
  if (!(n > 0)) return '';
  // Snap to nearest quarter-hour (XLS actuals are always .00/.25/.50/.75)
  const r = Math.round(n * 4) / 4;
  // Always use "." as decimal — cfgParseHours must match this convention
  return r % 1 === 0 ? String(r) : r.toFixed(2);
}

function cfgParseHours(str) {
  // Hours are always formatted with "." as decimal (via cfgFmtHours / toFixed).
  // Never run through cfgParseMoney — de-DE locale strips "." as thousands sep → "22.25" → 2225.
  const s = String(str).trim().replace(/[^\d.]/g, '');
  return parseFloat(s) || 0;
}
```

Every remaining call site in `config-form.js` (e.g. lines 440, 954, 972, 978, 979, 988) keeps calling `cfgParseHours(...)`/`cfgFmtHours(...)` unchanged — those calls are all inside event handler closures or functions invoked after `DOMContentLoaded`, never at top-level parse time, so they safely resolve to the bridged `window.cfgParseHours`/`window.cfgFmtHours` set by `js/lib/cfg-parse.js` (a deferred module script that always finishes executing before `DOMContentLoaded` fires).

- [ ] **Step 6: Run the automated tests**

Run: `npm test`
Expected: 16 tests passed — unchanged from Task 4, confirming the extraction didn't alter behavior.

- [ ] **Step 7: Manual verification in the browser — fractional hours (REG-13)**

1. Start the app: `docker compose up`
2. Open `http://localhost/project-config.html?projectId=<any existing project id>`
3. In the Planning section, enter `22.25` into a future-month hours cell and click away (blur) to trigger formatting
4. Expected: the cell displays `22.25` (not `2225`)
5. Click Save, then reload the page and reopen the same project config
6. Expected: the cell still shows `22.25`

- [ ] **Step 8: Manual verification in the browser — reforecast quarter-hour rounding (REG-14)**

1. On a project with fractional carry-over hours (past-month actuals not landing on a clean quarter-hour), trigger the Reforecast action in `project-config.html`
2. Expected: generated future-month planning values are snapped to the nearest 0.25h increment (e.g. a carry-over of 10.125 becomes 10.25)
3. Open the browser DevTools console and confirm no errors were thrown during the Reforecast action (this would surface a `roundToQuarterHour is not defined` error if the bridge script tag were missing or misordered)

- [ ] **Step 9: Commit**

```bash
git add js/config-form.js project-config.html portfolio.html planning.html
git commit -m "refactor: wire js/lib/cfg-parse.js module into config-form.js callers"
```

---

### Task 6: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (Development section, `no bundler/no tests` wording; File structure table; new "Script loading order" subsection)

**Interfaces:**
- Consumes: nothing
- Produces: documentation other engineers/agents read before touching `js/lib/` or the toolchain

- [ ] **Step 1: Update the "No package manager..." sentence**

In `CLAUDE.md`, under the `## Development` section, find:

```
No package manager, no bundler, no tests, no linter on the frontend.
```

Replace with:

```
No bundler, no build step for the **runtime** — nginx serves `js/`/`css/` files exactly as they are on disk, and this must stay true.

A dev-only test toolchain exists for the frontend: root `package.json` + vitest + jsdom, isolated from the runtime (see `js/lib/` below). It is never bundled, never served — `node_modules/`, `package.json`, `package-lock.json`, `vitest.config.js`, and any `*.test.js`/`*.spec.js` file are explicitly denied in `nginx.conf`. Run tests with `npm test` (single run) or `npm run test:watch`.

Still no linter on the frontend.
```

- [ ] **Step 2: Add a `js/lib/` entry to the File structure table**

In the `### File structure` code block, after the `js/api-sync.js` line, add:

```
js/lib/                  — pure functions extracted for unit testing (vitest + jsdom), each an ES module
                            (`export function ...`) with a `window.<name> = <name>` bridge for existing classic-script
                            callers; see "Script loading order" below. `cfg-parse.js` — `cfgParseHours`,
                            `cfgFmtHours`, `roundToQuarterHour` (moved from config-form.js)
```

- [ ] **Step 3: Add a "Script loading order" subsection**

After the `### Pipeline stage: single source of truth` subsection in `CLAUDE.md`, add:

```markdown
### Script loading order (`js/lib/*` modules)

Files under `js/lib/` are native ES modules (`export function ...`), loaded via `<script type="module" src="js/lib/...">`, with a `window.<name> = <name>` bridge line per export so existing classic-script callers keep working unchanged.

Module scripts are always deferred: they execute after HTML parsing completes and before `DOMContentLoaded` fires, regardless of their position in the document. Classic non-deferred scripts (`core.js`, `config-form.js`, etc.) execute immediately at parse time, in document order.

**Rule:** a bridged `window.*` global from `js/lib/` may only be read from inside an event handler or a function invoked after `DOMContentLoaded` — never at the top level of a classic script's parse-time execution, since the bridging module may not have run yet at that point. Every current `js/lib/` consumer (e.g. `cfgParseHours`/`cfgFmtHours` calls in `config-form.js`) satisfies this today.

If a future `js/lib/` module needs another `js/lib/` module's function, use a native ES `import` between them (resolved independently of `<script>` tag order in the HTML), not the `window` bridge.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document dev-only test toolchain and js/lib/ script loading order"
```

---

## Out of scope (future cycles, each with its own spec)

- Budget calc (`cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals` in `js/costgrid.js`) — REG-07
- Rate fallback chain (ratecard override → `role.rateOverrides[currency]` → EUR × factor) in `js/costgrid.js` — REG-11
- `linkedProjects` stale-`projectId` resolution — requires deduplicating the same inline match logic across `js/pipeline-board.js` lines 64, 73, 358, 429, 675 before it can be extracted as a standalone function
