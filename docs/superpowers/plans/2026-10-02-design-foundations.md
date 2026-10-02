# Design Foundations (Cycle A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the app's visual foundations — tokens, status/stage colours, base component styling — so Cycle B (navigation) and the page cycles can build on them. Appearance only.

**Architecture:** All values live in `css/tokens.css`; `css/style.css` / `css/admin-crud.css` consume them through the existing `--bs-*` override pattern; `js/core.js` and `portfolio.html` read the new status/chart tokens. Behaviour is pinned by vitest tests that read the source files (token presence, WCAG contrast, no leftover literals, one `?v=N` per asset), the same style as `js/lib/money-guard.test.js`.

**Tech Stack:** Plain CSS custom properties, Bootstrap 5.3.2 (CDN), Vue 3 (CDN), Chart.js, vitest + jsdom (`npm test`). No build step.

**Spec:** `docs/superpowers/specs/2026-10-02-design-foundations-design.md` (brief: `docs/superpowers/briefs/2026-10-02-design-foundations-brief.md`).

## Global Constraints

- No build step, no preprocessor; runtime files are served as they are on disk.
- Every colour/size added in this cycle is a token in `css/tokens.css`; no new hardcoded hex values in components.
- No token is removed or renamed (previous names are pinned in `js/lib/tokens.test.js`).
- Pipeline stages (`SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`) and project statuses (`Not started yet`, `Started`, `Started At Risk`, `Put on hold`, `Completed`) do not change; only colours.
- No HTML structure change, no logic change, no API/DB change. UI text stays English.
- Invariants that must not change: `.nav-main-tab { height:44px }` (style.css:68), `.pb-board-root { height: calc(100vh - 206px) }` (style.css:312), `.app-footer { height:100px }`, `.gantt-label-col` fixed width + sticky, `#teamAssistantPanel { right:-960px }`.
- Cache-busting: after the edits, `css/tokens.css` `?v=7`→`8` (20 pages), `css/style.css` `?v=14`→`15` (14 pages), `css/admin-crud.css` `?v=1`→`2` (5 pages), `js/core.js` `?v=9`→`10` (14 pages). Every reference to one file carries the same number.
- Work only inside the worktree `C:\Users\fafortini\Progetti\burndown\.claude\worktrees\design-foundations` (branch `worktree-design-foundations`). Commit message trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No Docker command against the main stack is needed anywhere in this plan.
- Test command (from the worktree root): `npm test`. If `node_modules` is missing in the worktree, run `npm ci` first.

## Review Focus

1. **Pages that load only `tokens.css`** (`login`, `activate`, `reset-password`, `terms`): every `var(--…)` they now use must exist in `tokens.css` — pinned by Task 1's token-presence test and Task 5's guard.
2. **Unknown or null project status** in the two badge functions must still render (fallback = not-started colours) — Task 2 test.
3. **Chart token missing/empty** (stale cached `tokens.css`): `chartColor()` returns the supplied fallback instead of `''`, so no invisible line — Task 3 test.
4. **Override order**: `css/style.css` must load after Bootstrap's CSS on every page that links it, otherwise the `--bs-*` overrides lose — Task 4 test.
5. **Modal variables live on `.modal`, not `.modal-content`** (Bootstrap 5.3 derives `--bs-modal-inner-border-radius` there); a header/footer radius mismatch is the failure mode — Task 4 test.

---

## File Structure

- `css/tokens.css` — modified: changed values, new tokens (Task 1).
- `js/lib/tokens.test.js` — new: token presence, no-removal, WCAG contrast (Task 1).
- `js/lib/foundations-guard.test.js` — new, grown across Tasks 2–6: source-reading guards (badges, chart, literals, overrides, versions).
- `js/core.js` — modified: colours of `statusBadge()` / `statusBadgeLarge()` only (Task 2).
- `portfolio.html` — modified: `chartColor()` method + three chart colours (Task 3).
- `css/style.css` — modified: body font, buttons, new button kinds, spinner, alert/dropdown/modal overrides, stale comment (Task 4).
- `css/admin-crud.css`, `login.html`, `activate.html`, `reset-password.html` — modified: tokens instead of literals (Task 5).
- 20 `*.html` pages — modified: `?v=N` bumps only (Task 6).
- `docs/superpowers/specs/2026-10-02-design-foundations-design.md` — amended (Task 7); `docs/superpowers/reports/2026-10-02-design-foundations-literals-inventory.md` — new (Task 7).

---

### Task 1: Tokens and the token test

**Files:**
- Modify: `css/tokens.css`
- Create: `js/lib/tokens.test.js`

**Interfaces:**
- Produces (used by every later task): the token names `--brand-magenta-hover`, `--brand-magenta-active`, `--color-success-text`, `--color-danger-text`, `--color-info-text`, `--color-danger-hover`, `--color-danger-active`, `--focus-ring`, `--font-family-base`, `--weight-regular|medium|semibold|bold`, `--leading-tight|base|relaxed`, `--z-tooltip`, `--status-not-started-bg`, `--status-started-bg`, `--status-at-risk-bg`, `--status-on-hold-bg`, `--status-completed-bg`, `--status-text`, `--chart-actual`, `--chart-committed`, `--chart-phasing`.

- [ ] **Step 1: Write the failing test**

Create `js/lib/tokens.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'css/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = {};
for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();

// Resolve `var(--x)` chains to a final value.
function value(name) {
  let v = tokens[name];
  for (let i = 0; i < 5 && v && v.startsWith('var('); i++) v = tokens[v.match(/var\(--([a-z0-9-]+)\)/)[1]];
  return v;
}
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Names that existed before this cycle: none may disappear.
const PREVIOUS = `brand-navy brand-mid brand-dark brand-magenta brand-gold text-primary text-secondary text-body
text-muted text-faint text-disabled text-placeholder text-inverse surface-white surface-light surface-subtle
surface-medium border-light border-medium border-dark indigo-50 indigo-100 indigo-200 indigo-300 indigo-400
indigo-500 indigo-600 indigo-border violet-50 violet-100 violet-200 violet-400 violet-500 violet-600 violet-border
sand-50 sand-100 sand-200 sand-300 sand-400 sand-border color-success color-success-bg color-danger color-danger-bg
color-warning color-warning-bg color-warning-text color-info color-info-bg portfolio-totals-bg
portfolio-indigo-totals-bg portfolio-violet-tint-bg kpi-blue kpi-green kpi-orange kpi-purple kpi-teal kpi-red
pipeline-sip-bg pipeline-sip-color pipeline-expected-bg pipeline-expected-color pipeline-anticipated-bg
pipeline-anticipated-color pipeline-committed-bg pipeline-committed-color pipeline-canceled-bg
pipeline-canceled-color text-2xs text-xs text-sm text-base text-md text-lg text-xl text-2xl radius-xs radius-sm
radius-md radius-lg radius-xl radius-full shadow-xs shadow-sm shadow-md shadow-lg shadow-xl space-1 space-2 space-3
space-4 space-5 space-6 duration-fast duration-base ease-out ease-in-out z-dropdown z-sticky z-fixed z-modal
z-notification`.split(/\s+/);

const NEW = `brand-magenta-hover brand-magenta-active color-success-text color-danger-text color-info-text
color-danger-hover color-danger-active focus-ring font-family-base weight-regular weight-medium weight-semibold
weight-bold leading-tight leading-base leading-relaxed z-tooltip status-not-started-bg status-started-bg
status-at-risk-bg status-on-hold-bg status-completed-bg status-text chart-actual chart-committed chart-phasing`.split(/\s+/);

describe('tokens.css', () => {
  it('keeps every previously defined token', () => {
    expect(PREVIOUS.filter(n => !(n in tokens))).toEqual([]);
  });

  it('defines every new token', () => {
    expect(NEW.filter(n => !(n in tokens))).toEqual([]);
  });

  it('has the consolidated neutral values', () => {
    expect(tokens['text-muted']).toBe('#6b7280');
    expect(tokens['border-light']).toBe('#e5e7eb');
  });

  it('every var() reference resolves to a defined token', () => {
    const missing = [];
    for (const [name, v] of Object.entries(tokens)) {
      const m = v.match(/var\(--([a-z0-9-]+)\)/);
      if (m && !(m[1] in tokens)) missing.push(`${name} -> ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('pipeline stage text meets WCAG AA (4.5:1) on its background', () => {
    const low = ['sip', 'expected', 'anticipated', 'committed', 'canceled']
      .map(s => [s, ratio(value(`pipeline-${s}-color`), value(`pipeline-${s}-bg`))])
      .filter(([, r]) => r < 4.5);
    expect(low).toEqual([]);
  });

  it('project status badges meet WCAG AA with the shared status text colour', () => {
    const low = ['not-started', 'started', 'at-risk', 'on-hold', 'completed']
      .map(s => [s, ratio(value('status-text'), value(`status-${s}-bg`))])
      .filter(([, r]) => r < 4.5);
    expect(low).toEqual([]);
  });

  it('semantic text-on-tint pairs and danger hover/active meet WCAG AA', () => {
    const pairs = [
      ['success', value('color-success-text'), value('color-success-bg')],
      ['danger', value('color-danger-text'), value('color-danger-bg')],
      ['info', value('color-info-text'), value('color-info-bg')],
      ['warning', value('color-warning-text'), value('color-warning-bg')],
      ['danger-hover', '#ffffff', value('color-danger-hover')],
      ['danger-active', '#ffffff', value('color-danger-active')],
    ];
    expect(pairs.filter(([, a, b]) => ratio(a, b) < 4.5).map(p => p[0])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run js/lib/tokens.test.js`
Expected: FAIL — "defines every new token" lists the missing names; the contrast tests fail for SIP/Expected/Anticipated/Canceled; `text-muted`/`border-light` assertions fail.

- [ ] **Step 3: Edit `css/tokens.css`**

Change values (names unchanged):
- line 19: `--text-muted:     #6b7280;`
- line 32: `--border-light:   #e5e7eb;`
- line 89: `--pipeline-sip-color:           #1a56c4;`
- line 91: `--pipeline-expected-color:      #8a5d00;`
- line 93: `--pipeline-anticipated-color:   #a34700;`
- line 97: `--pipeline-canceled-color:      #6b6b6b;`

Add, directly after `--brand-gold: #C88A00;` (line 13):

```css
  --brand-magenta-hover:  #d01f6a;
  --brand-magenta-active: #b81860;
```

Add, directly after `--color-info-bg:      #cff4fc;` (line 72):

```css
  --color-success-text: #0f5132;
  --color-danger-text:  #842029;
  --color-info-text:    #055160;
  --color-danger-hover:  #bb2d3b;
  --color-danger-active: #a52834;
  --focus-ring:         rgba(240, 40, 122, 0.12);
```

Add a new block directly after the pipeline stage block (after `--pipeline-canceled-color`):

```css

  /* ── Project status colours (badges; white text on every background, all ≥ 4.5:1) ── */
  --status-not-started-bg: #6b7280;
  --status-started-bg:     var(--color-success);
  --status-at-risk-bg:     var(--color-danger);
  --status-on-hold-bg:     #b45309;
  --status-completed-bg:   var(--brand-navy);
  --status-text:           #ffffff;

  /* ── Chart colours (read by Chart.js through getComputedStyle, see portfolio.html chartColor()) ── */
  --chart-actual:    var(--kpi-blue);
  --chart-committed: var(--pipeline-committed-color);
  --chart-phasing:   #FF6F00;
```

Add, directly after the typography scale block (after `--text-2xl`):

```css

  /* ── Font family, weights, line heights ── */
  --font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;
  --leading-tight:   1.3;
  --leading-base:    1.5;
  --leading-relaxed: 1.6;
```

Add after `--z-notification: 700;`:

```css
  --z-tooltip:      800;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run js/lib/tokens.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```powershell
git add css/tokens.css js/lib/tokens.test.js
git commit -m "feat: design foundations tokens (status, chart, focus, typography, AA stage text)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Status badges in `js/core.js`

**Files:**
- Modify: `js/core.js:265-285`
- Create: `js/lib/foundations-guard.test.js`

**Interfaces:**
- Consumes: `--status-*-bg`, `--status-text` (Task 1).
- Produces: `js/lib/foundations-guard.test.js` with its helpers `read(path)` and `rel`, extended by Tasks 3–6.

- [ ] **Step 1: Write the failing test**

Create `js/lib/foundations-guard.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = f => readFileSync(join(ROOT, f), 'utf8');
const pages = readdirSync(ROOT).filter(f => /^[^/]+\.html$/.test(f));

// Text of a top-level function, from "function name(" to the first "\n}" line.
function fnText(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return '';
  return src.slice(start, src.indexOf('\n}', start) + 2);
}

describe('status badges (js/core.js)', () => {
  const core = read('js/core.js');
  for (const name of ['statusBadge', 'statusBadgeLarge']) {
    const body = fnText(core, name);
    it(`${name} exists and uses no hex colour`, () => {
      expect(body).not.toBe('');
      expect(body.match(/#[0-9a-fA-F]{3,6}\b/g) || []).toEqual([]);
    });
    it(`${name} maps all five statuses to --status-* tokens`, () => {
      for (const s of ['not-started', 'started', 'at-risk', 'on-hold', 'completed']) {
        expect(body).toContain(`var(--status-${s}-bg)`);
      }
      expect(body).toContain('var(--status-text)');
    });
    it(`${name} falls back to the not-started colours for an unknown status`, () => {
      expect(body).toMatch(/\|\|\s*'background:var\(--status-not-started-bg\);color:var\(--status-text\)'/);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run js/lib/foundations-guard.test.js`
Expected: FAIL — hex colours present, `--status-*` tokens missing.

- [ ] **Step 3: Edit `js/core.js`**

Replace the `style` object of `statusBadge()` (lines 267-269) with:

```js
  const style = { 'Not started yet':'background:var(--status-not-started-bg);color:var(--status-text)', 'Started':'background:var(--status-started-bg);color:var(--status-text)',
    'Started At Risk':'background:var(--status-at-risk-bg);color:var(--status-text)', 'Put on hold':'background:var(--status-on-hold-bg);color:var(--status-text)',
    'Completed':'background:var(--status-completed-bg);color:var(--status-text)' }[s] || 'background:var(--status-not-started-bg);color:var(--status-text)';
```

Replace the object in `statusBadgeLarge()` (lines 276-282) with:

```js
  const style = {
    'Not started yet': 'background:var(--status-not-started-bg);color:var(--status-text)',
    'Started':         'background:var(--status-started-bg);color:var(--status-text)',
    'Started At Risk': 'background:var(--status-at-risk-bg);color:var(--status-text)',
    'Put on hold':     'background:var(--status-on-hold-bg);color:var(--status-text)',
    'Completed':       'background:var(--status-completed-bg);color:var(--status-text)',
  }[s] || 'background:var(--status-not-started-bg);color:var(--status-text)';
```

Do not touch anything else in either function (`font-size`, `padding`, `esc(s)`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run js/lib/foundations-guard.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```powershell
git add js/core.js js/lib/foundations-guard.test.js
git commit -m "feat: unify project status badge colours on --status-* tokens

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Burndown chart colours

**Files:**
- Modify: `portfolio.html` (methods near `renderBurndownChart`, lines 1135-1164)
- Modify: `js/lib/foundations-guard.test.js` (append a `describe` block)

**Interfaces:**
- Consumes: `--chart-actual`, `--chart-committed`, `--chart-phasing`, `--text-disabled` (Task 1 / existing).
- Produces: Vue method `chartColor(name, fallback)` on `portfolio.html`'s instance — used only by this page.

- [ ] **Step 1: Write the failing test**

Append to `js/lib/foundations-guard.test.js`:

```js
describe('burndown chart colours (portfolio.html)', () => {
  const html = read('portfolio.html');
  it('contains no hardcoded line colours', () => {
    for (const lit of ["'#0d6efd'", "'#FF6F00'", "'#2E7D32'", "'var(--text-disabled)'"]) {
      expect(html).not.toContain(lit);
    }
  });
  it('reads the chart tokens through chartColor()', () => {
    for (const t of ['--chart-actual', '--chart-phasing', '--chart-committed', '--text-disabled']) {
      expect(html).toContain(`chartColor('${t}'`);
    }
  });
  it('chartColor falls back when the token is empty', () => {
    expect(html).toMatch(/chartColor\(name, fallback\)\s*\{[\s\S]*?getComputedStyle\(document\.documentElement\)[\s\S]*?\|\|\s*fallback/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run js/lib/foundations-guard.test.js`
Expected: FAIL in the three new tests.

- [ ] **Step 3: Edit `portfolio.html`**

Insert this method immediately before `renderBurndownChart() {` (line 1135):

```js
      // Chart.js cannot resolve var(); read the token's computed value instead.
      chartColor(name, fallback) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
      },
```

In the dataset code, change:
- line 1146: `borderColor: '#0d6efd',` → `borderColor: this.chartColor('--chart-actual', 'gray'),` (keep `backgroundColor: 'rgba(13,110,253,0.07)'` unchanged).
- line 1153: `borderColor: hasPhasingEur ? '#FF6F00' : 'var(--text-disabled)',` → `borderColor: hasPhasingEur ? this.chartColor('--chart-phasing', 'gray') : this.chartColor('--text-disabled', 'gray'),`
- line 1161: `borderColor: '#2E7D32',` → `borderColor: this.chartColor('--chart-committed', 'gray'),`

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run js/lib/foundations-guard.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```powershell
git add portfolio.html js/lib/foundations-guard.test.js
git commit -m "feat: burndown chart colours come from chart tokens

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `css/style.css` — buttons, spinner, Bootstrap overrides, body font

**Files:**
- Modify: `css/style.css` (lines 5-8, 77-82 comment, 185-216; append override block after line 216)
- Modify: `js/lib/foundations-guard.test.js` (append)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: classes `.btn-ghost`, `.btn-icon` (new, used on top of `.btn`), restyled `.btn-danger`, `.alert-*`, `.dropdown-menu`, `.modal`, `.spinner-border` — consumed by later page cycles.

Note on the spec: the spec says `.pp-tooltip` z-index → `--z-tooltip` and button focus via `--focus-ring`. Both are adjusted here (see Task 7's spec amendment): `.pp-tooltip` has no z-index today and Bootstrap's tooltip sits at 1080, so setting 800 would put tooltips *under* modals (1055) — the token is defined and left unapplied; Bootstrap buttons already show a visible focus ring through `--bs-btn-focus-shadow-rgb`, and the 12 %-alpha `--focus-ring` is reserved for form-control focus (Task 5).

- [ ] **Step 1: Write the failing test**

Append to `js/lib/foundations-guard.test.js`:

```js
describe('css/style.css', () => {
  const css = read('css/style.css');
  it('body uses the shared font stack', () => {
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-family-base\)/);
    expect(css).not.toContain("'Segoe UI', system-ui");
  });
  it('has no leftover magenta hover/active literals', () => {
    expect(css).not.toMatch(/#d01f6a|#b81860/i);
  });
  it('defines the new and restyled components', () => {
    for (const sel of ['.btn-danger', '.btn-ghost', '.btn-icon', '.spinner-border', '.alert-success', '.alert-danger',
      '.alert-warning', '.alert-info', '.dropdown-menu', '.modal {']) {
      expect(css).toContain(sel);
    }
  });
  it('modal variables are set on .modal (Bootstrap derives the inner radius there), not .modal-content', () => {
    expect(css).toMatch(/\.modal\s*\{[^}]*--bs-modal-border-radius/);
    expect(css).not.toMatch(/\.modal-content\s*\{[^}]*--bs-modal-/);
  });
  it('spinners inside buttons keep the button colour', () => {
    expect(css).toMatch(/\.btn \.spinner-border[^{]*\{[^}]*color:\s*inherit/);
  });
  it('keeps the layout invariants', () => {
    expect(css).toMatch(/height:\s*44px/);
    expect(css).toContain('calc(100vh - 206px)');
    expect(css).toContain('right: -960px');
  });
  it('is loaded after Bootstrap on every page that links it', () => {
    const bad = pages.filter(f => {
      const t = read(f);
      const s = t.indexOf('css/style.css');
      const b = t.indexOf('bootstrap.min.css');
      return s >= 0 && !(b >= 0 && b < s);
    });
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run js/lib/foundations-guard.test.js`
Expected: FAIL — font stack, literals, missing selectors.

- [ ] **Step 3: Edit `css/style.css`**

3a. Line 7: `font-family: var(--font-family-base);` (replaces `'Segoe UI', system-ui, sans-serif`). Leave line 182 (`'SFMono-Regular', monospace`) alone.

3b. Lines 77-82: the comment mentions `#pbColumnsContainer`, which no longer exists. Read those lines and replace that sentence with: `(the navbar height math that pipeline.html's .pb-board-root calc relies on)`. Do not change any value.

3c. Replace the whole `.btn-primary { … }` and `.btn-outline-primary { … }` blocks (lines 197-216) with:

```css
/* ── Primary button → brand magenta ─────────────────────────────────────── */
.btn-primary {
  --bs-btn-bg:                 var(--brand-magenta);
  --bs-btn-border-color:       var(--brand-magenta);
  --bs-btn-hover-bg:           var(--brand-magenta-hover);
  --bs-btn-hover-border-color: var(--brand-magenta-hover);
  --bs-btn-active-bg:          var(--brand-magenta-active);
  --bs-btn-active-border-color:var(--brand-magenta-active);
  --bs-btn-focus-shadow-rgb:   240, 40, 122;
}
.btn-outline-primary {
  --bs-btn-color:              var(--brand-magenta);
  --bs-btn-border-color:       var(--brand-magenta);
  --bs-btn-hover-bg:           var(--brand-magenta);
  --bs-btn-hover-border-color: var(--brand-magenta);
  --bs-btn-hover-color:        var(--text-inverse);
  --bs-btn-active-bg:          var(--brand-magenta-hover);
  --bs-btn-active-border-color:var(--brand-magenta-hover);
  --bs-btn-focus-shadow-rgb:   240, 40, 122;
}

/* ── Danger button ── */
.btn-danger {
  --bs-btn-bg:                 var(--color-danger);
  --bs-btn-border-color:       var(--color-danger);
  --bs-btn-hover-bg:           var(--color-danger-hover);
  --bs-btn-hover-border-color: var(--color-danger-hover);
  --bs-btn-active-bg:          var(--color-danger-active);
  --bs-btn-active-border-color:var(--color-danger-active);
  --bs-btn-focus-shadow-rgb:   220, 53, 69;
}

/* ── Ghost / icon-only buttons (use on top of .btn; icon-only needs an aria-label) ── */
.btn-ghost {
  --bs-btn-color:              var(--text-secondary);
  --bs-btn-bg:                 transparent;
  --bs-btn-border-color:       transparent;
  --bs-btn-hover-color:        var(--text-primary);
  --bs-btn-hover-bg:           var(--surface-subtle);
  --bs-btn-hover-border-color: transparent;
  --bs-btn-active-color:       var(--text-primary);
  --bs-btn-active-bg:          var(--surface-medium);
  --bs-btn-active-border-color:transparent;
  --bs-btn-disabled-color:     var(--text-disabled);
  --bs-btn-disabled-bg:        transparent;
  --bs-btn-disabled-border-color: transparent;
  --bs-btn-focus-shadow-rgb:   240, 40, 122;
}
.btn-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; padding: 0;
}

/* ── Spinner → brand magenta (inside a button it keeps the button's colour) ── */
.spinner-border, .spinner-grow { color: var(--brand-magenta); }
.btn .spinner-border, .btn .spinner-grow { color: inherit; }

/* ── Bootstrap component overrides through tokens ── */
.alert-success { --bs-alert-color: var(--color-success-text); --bs-alert-bg: var(--color-success-bg); --bs-alert-link-color: var(--color-success-text); }
.alert-danger  { --bs-alert-color: var(--color-danger-text);  --bs-alert-bg: var(--color-danger-bg);  --bs-alert-link-color: var(--color-danger-text); }
.alert-warning { --bs-alert-color: var(--color-warning-text); --bs-alert-bg: var(--color-warning-bg); --bs-alert-link-color: var(--color-warning-text); }
.alert-info    { --bs-alert-color: var(--color-info-text);    --bs-alert-bg: var(--color-info-bg);    --bs-alert-link-color: var(--color-info-text); }
.dropdown-menu {
  --bs-dropdown-border-color:  var(--border-light);
  --bs-dropdown-border-radius: var(--radius-md);
  --bs-dropdown-box-shadow:    var(--shadow-md);
}
/* Set on .modal, not .modal-content: Bootstrap derives --bs-modal-inner-border-radius from these on .modal. */
.modal {
  --bs-modal-border-color:  var(--border-light);
  --bs-modal-border-radius: var(--radius-md);
  --bs-modal-box-shadow:    var(--shadow-lg);
}
```

3d. Leave `.pp-tooltip` (lines 185-195) unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run js/lib/foundations-guard.test.js`
Expected: PASS. If "is loaded after Bootstrap" fails, a page links `style.css` before Bootstrap — stop and report; do not reorder links.

- [ ] **Step 5: Commit**

```powershell
git add css/style.css js/lib/foundations-guard.test.js
git commit -m "feat: token-driven buttons, spinner and Bootstrap overrides in style.css

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `css/admin-crud.css` and the three public pages

**Files:**
- Modify: `css/admin-crud.css:4-26`
- Modify: `login.html:31-33`, `activate.html:31-33`, `reset-password.html:31-33` (their inline `<style>`)
- Modify: `js/lib/foundations-guard.test.js` (append)

**Interfaces:**
- Consumes: `--font-family-base`, `--surface-light`, `--border-light`, `--shadow-sm`, `--text-muted`, `--brand-magenta-hover`, `--focus-ring`, `--text-inverse` (Task 1 / existing).

- [ ] **Step 1: Write the failing test**

Append to `js/lib/foundations-guard.test.js`:

```js
describe('admin-crud.css and the public pages', () => {
  const admin = read('css/admin-crud.css');
  it('admin-crud.css uses tokens for font, card, muted text and primary hover', () => {
    expect(admin).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-family-base\)/);
    expect(admin).toMatch(/\.card\s*\{[^}]*border:\s*1px solid var\(--border-light\)[^}]*box-shadow:\s*var\(--shadow-sm\)/);
    expect(admin).toMatch(/\.table thead th\s*\{[^}]*color:\s*var\(--text-muted\)/);
    expect(admin).toContain('background: var(--brand-magenta-hover)');
    expect(admin).toContain('box-shadow: 0 0 0 3px var(--focus-ring)');
    expect(admin).not.toMatch(/#d01f6a|rgba\(240,\s*40,\s*122/i);
  });
  for (const f of ['login.html', 'activate.html', 'reset-password.html']) {
    it(`${f} uses the hover and focus tokens`, () => {
      const t = read(f);
      expect(t).not.toMatch(/#d01f6a|rgba\(240,\s*40,\s*122/i);
      expect(t).toContain('var(--brand-magenta-hover)');
      expect(t).toContain('var(--focus-ring)');
    });
  }
  it('every var() used by the public pages is defined in tokens.css', () => {
    const tokens = read('css/tokens.css');
    const missing = [];
    for (const f of ['login.html', 'activate.html', 'reset-password.html', 'terms.html']) {
      for (const m of read(f).matchAll(/var\(--([a-z0-9-]+)\)/g)) {
        if (!new RegExp(`--${m[1]}\\s*:`).test(tokens)) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run js/lib/foundations-guard.test.js`
Expected: FAIL in the four new groups.

- [ ] **Step 3: Edit the files**

`css/admin-crud.css` — change only these lines (values exactly):
- line 4: `body { background: var(--surface-light); font-family: var(--font-family-base); }`
- line 8: `.card { border: 1px solid var(--border-light); border-radius: 10px; box-shadow: var(--shadow-sm); }`
- line 11-13 (`.table thead th`): `border-bottom: 1px solid var(--border-light);` and `color: var(--text-muted);` (keep `background: #f9fafb;` and every other property as is — no exact token exists for `#f9fafb`).
- line 19: `.btn-primary { background: var(--brand-magenta); border: none; color: var(--text-inverse); font-weight: 600; font-size: 0.875rem; }`
- line 20: `.btn-primary:hover:not(:disabled) { background: var(--brand-magenta-hover); color: var(--text-inverse); }`
- line 21: `.btn-primary:disabled { opacity: 0.65; color: var(--text-inverse); }`
- line 24: `.form-control, .form-select { font-size: 0.875rem; border-color: var(--border-light); }`
- line 25: `.form-control:focus, .form-select:focus { border-color: var(--brand-magenta); box-shadow: 0 0 0 3px var(--focus-ring); }`

Every other literal (`#f3f4f6`, `#fafafa`, `#dcfce7`, `#166534`, `#374151`, `#9ca3af`, `#f9fafb`) has no exact token and stays (it goes to the Task 7 inventory). Do not touch `.badge-st-*` colours (out of scope).

`login.html`, `activate.html`, `reset-password.html` — in each file's `<style>` block (lines 31 and 33; open the file and confirm the lines first):
- `.form-control:focus { border-color: var(--brand-magenta); box-shadow: 0 0 0 3px var(--focus-ring); }`
- `.btn-primary:hover:not(:disabled) { background: var(--brand-magenta-hover); color: var(--text-inverse); }`

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run js/lib/foundations-guard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add css/admin-crud.css login.html activate.html reset-password.html js/lib/foundations-guard.test.js
git commit -m "feat: admin-crud.css and public pages use foundation tokens

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cache-busting `?v=N`

**Files:**
- Modify: the 20 `*.html` pages that reference `css/tokens.css`, plus those referencing `css/style.css`, `css/admin-crud.css`, `js/core.js`.
- Modify: `js/lib/foundations-guard.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `js/lib/foundations-guard.test.js`:

```js
describe('cache-busting', () => {
  const MIN = { 'css/tokens.css': 8, 'css/style.css': 15, 'css/admin-crud.css': 2, 'js/core.js': 10 };
  for (const [file, min] of Object.entries(MIN)) {
    it(`every reference to ${file} carries one shared ?v=N, at least ${min}`, () => {
      const versions = new Set();
      const unversioned = [];
      for (const f of pages) {
        const t = read(f);
        for (const m of t.matchAll(new RegExp(file.replace('.', '\\.') + '(\\?v=(\\d+))?', 'g'))) {
          if (m[2]) versions.add(Number(m[2])); else if (f !== 'test-cases.html') unversioned.push(f);
        }
      }
      expect(unversioned).toEqual([]);
      expect([...versions].length).toBe(1);
      expect([...versions][0]).toBeGreaterThanOrEqual(min);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run js/lib/foundations-guard.test.js`
Expected: FAIL — versions are still 7 / 14 / 1 / 9.

- [ ] **Step 3: Bump the versions**

Run from the worktree root (PowerShell; a function replacement avoids `$1`+digit ambiguity):

```powershell
node -e "const fs=require('fs');const rules=[[/(css\/tokens\.css\?v=)7\b/g,'8'],[/(css\/style\.css\?v=)14\b/g,'15'],[/(css\/admin-crud\.css\?v=)1\b/g,'2'],[/(js\/core\.js\?v=)9\b/g,'10']];for(const f of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){let t=fs.readFileSync(f,'utf8');let n=t;for(const [re,v] of rules)n=n.replace(re,(m,p)=>p+v);if(n!==t){fs.writeFileSync(f,n);console.log(f)}}"
```

Expected output: the page names that changed (20 pages for tokens; the same files also get the others). Then confirm with the grep: `Grep` pattern `(css/tokens\.css|css/style\.css|css/admin-crud\.css|js/core\.js)\?v=\d+` over `*.html` — only `v=8`, `v=15`, `v=2`, `v=10` remain.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all vitest files PASS (existing ones included).

- [ ] **Step 5: Commit**

```powershell
git add -- *.html js/lib/foundations-guard.test.js
git commit -m "chore: bump ?v for tokens.css, style.css, admin-crud.css, core.js

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Spec amendment and remaining-literals inventory

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-design-foundations-design.md`
- Create: `docs/superpowers/reports/2026-10-02-design-foundations-literals-inventory.md`

- [ ] **Step 1: Amend the spec to match what was built**

Make these edits in the spec:
- §5, the `.btn-primary` bullet: replace "`:focus-visible` gets `box-shadow: 0 0 0 3px var(--focus-ring)`" with "buttons keep Bootstrap's visible focus ring through `--bs-btn-focus-shadow-rgb` (magenta for primary/outline/ghost, red for danger); `--focus-ring` (12 % alpha) is used for form-control focus in `admin-crud.css` and the three public pages".
- §5, the new-components bullet: replace "**New** `.btn-danger` (bg `--color-danger`, hover/active tokens above, same focus ring)" with "`.btn-danger` (exists in Bootstrap; re-pointed at `--color-danger` / `-hover` / `-active`)".
- §5, the `.pp-tooltip` bullet: replace it with "`--z-tooltip` is defined but not applied: `.pp-tooltip` has no z-index and Bootstrap's tooltip is at 1080; applying 800 would place tooltips under modals (1055)."
- §5, the `.modal-content` mention: write "`.modal` (Bootstrap derives the inner radius from variables on `.modal`)".
- §10: add a bullet "The handoff's `.btn-danger` claim: the class exists in Bootstrap; only its token wiring was missing."
- Acceptance-relevant text in §9: nothing else changes.

- [ ] **Step 2: Produce the inventory**

Run in the worktree root:

```powershell
node -e "const fs=require('fs');const files=['css/style.css','css/admin-crud.css','css/tokens.css','js/core.js','portfolio.html','login.html','activate.html','reset-password.html'];const re=/#[0-9a-fA-F]{3,8}\b|rgba?\([0-9 ,.%]+\)/g;for(const f of files){const t=fs.readFileSync(f,'utf8');const c={};for(const m of t.match(re)||[])c[m.toLowerCase()]=(c[m.toLowerCase()]||0)+1;console.log('## '+f);for(const [k,v] of Object.entries(c).sort((a,b)=>b[1]-a[1]))console.log(k+' x'+v)}"
```

Create `docs/superpowers/reports/2026-10-02-design-foundations-literals-inventory.md` with a short intro ("Literals left in the in-scope files after Cycle A; none has an exact token; deferred to the page cycles unless noted"), then, per file, the output of the command as a table (value, count, proposed token or "defer — page-specific"). `css/tokens.css` itself is expected to list the token definitions; mark it "definitions, not offenders". Also note the ~800 literals in other pages (`config.html`, `planning.html`, `costgrid.html`, `pipeline.html`, JS template literals) as "not scanned here — owned by the page cycles".

- [ ] **Step 3: Final verification**

Run: `npm test`
Expected: all PASS.

Then scan the diff for scope creep:

```powershell
git diff --stat origin/main...HEAD
```

Expected: only the files listed in this plan's File Structure, plus docs. No `api/`, no `nginx.conf`, no HTML structure change.

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/specs/2026-10-02-design-foundations-design.md docs/superpowers/reports/2026-10-02-design-foundations-literals-inventory.md
git commit -m "docs: align foundations spec with the build, add literals inventory

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (not part of this plan's execution)

Manual visual check and closing are done by `/finish-cycle` (Gate 2 starts the isolated branch stack with `scripts/test-branch.sh up`): compare the screens listed in spec §9 against `main`, with only the differences in spec §9 expected. `/finish-cycle`'s `sync-docs` step then updates CLAUDE.md (new tokens, `tokens.css` is versioned, the four new `?v` numbers, the stale `#pbColumnsContainer` comment) and the routed page docs.
