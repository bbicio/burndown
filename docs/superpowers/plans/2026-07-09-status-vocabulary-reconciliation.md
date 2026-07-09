# Status Vocabulary Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three defects in the project Status dropdown's pipeline-stage rules (missing "Started At Risk" for Committed, "Complete"/"Completed" value mismatch, dead map keys) by extracting the rule into a tested pure function.

**Architecture:** New `js/lib/status-rules.js` ES module exports `getStatusRule(pipeline)`, a pure function returning `{ options, disabled }` for a given pipeline stage. `js/core.js`'s `cfgApplyPipelineRules` becomes a thin DOM wrapper around it. The module is wired into every page that actually exercises the Status dropdown.

**Tech Stack:** Vanilla JS, ES modules for `js/lib/`, vitest for unit tests (no bundler, no build step — see `CLAUDE.md`).

## Global Constraints

- No bundler/build step: `js/lib/status-rules.js` must be a native ES module (`export function ...`) with a `window.<name> = <name>` bridge line, loaded via `<script type="module">`, per the existing `js/lib/cfg-parse.js`/`js/lib/planning-calc.js` convention.
- A bridged `window.*` global from `js/lib/` may only be read from inside an event handler or a function invoked after `DOMContentLoaded` — never at a classic script's parse-time top level (`CLAUDE.md`, "Script loading order"). `cfgApplyPipelineRules` is only ever called from event handlers, so this is already satisfied — do not change that.
- All user-facing text must be in English.
- No legacy data migration: confirmed with the user that no project currently has `status: 'Complete'` saved.
- Out of scope: any change to F4 (Generate Project lock), and `js/main.js` (found unreferenced by any HTML page during this plan's file-structure check — dead code, not to be touched or fixed here; noted only so it isn't mistaken for a live integration point).

---

## File Structure

- Create: `js/lib/status-rules.js` — pure function, the single source of truth for pipeline→allowed-status rules.
- Create: `js/lib/status-rules.test.js` — vitest unit tests for `getStatusRule`.
- Modify: `js/core.js:391-421` (`cfgApplyPipelineRules`) — replace the inline `allowed`/`allOpts` map with a call to `getStatusRule`.
- Modify: `project-config.html` (near line 225) — add `<script type="module" src="js/lib/status-rules.js?v=1"></script>`.
- Modify: `portfolio.html` (near line 437) — same script tag addition. `portfolio.html` has its own `#cfgPipeline`/`#cfgStatus` elements (a quick-edit project config form) and loads `js/core.js` + `js/config-form.js`, exactly like `project-config.html` — confirmed via grep before writing this plan, since the design spec only mentioned `js/main.js:137` as the second call site, which turned out to be dead code (see Global Constraints).
- `planning.html` is not modified: it loads `js/core.js` but not `js/config-form.js`, and has no `#cfgPipeline`/`#cfgStatus` elements — `cfgApplyPipelineRules` is not reachable there.

---

### Task 1: Create the `status-rules` module and its tests

**Files:**
- Create: `js/lib/status-rules.js`
- Test: `js/lib/status-rules.test.js`

**Interfaces:**
- Produces: `getStatusRule(pipeline: string) => { options: string[] | null, disabled: boolean }`. `options: null` means "leave the dropdown's current options/value untouched" (the `Canceled` case). Any pipeline value not in the rule table (including `''` or an unrecognized string) falls back to the full 5-option list with `disabled: false`.

- [ ] **Step 1: Write the failing tests**

Create `js/lib/status-rules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { getStatusRule } from './status-rules.js';

describe('getStatusRule', () => {
  it('returns empty, disabled options for SIP', () => {
    expect(getStatusRule('SIP')).toEqual({ options: [], disabled: true });
  });

  it('returns null options (keep current), disabled for Canceled', () => {
    expect(getStatusRule('Canceled')).toEqual({ options: null, disabled: true });
  });

  it('includes Started At Risk and Completed (not Complete) for Committed', () => {
    const rule = getStatusRule('Committed');
    expect(rule.disabled).toBe(false);
    expect(rule.options).toContain('Started At Risk');
    expect(rule.options).toContain('Completed');
    expect(rule.options).not.toContain('Complete');
  });

  it('Expected and Anticipated return the same status set', () => {
    expect(getStatusRule('Expected').options).toEqual(getStatusRule('Anticipated').options);
  });

  it('falls back to the full status list for an empty or unrecognized pipeline', () => {
    const full = ['Not started yet', 'Started At Risk', 'Started', 'Put on hold', 'Completed'];
    expect(getStatusRule('').options).toEqual(full);
    expect(getStatusRule('').disabled).toBe(false);
    expect(getStatusRule('not-a-real-pipeline').options).toEqual(full);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- status-rules`
Expected: FAIL — `Cannot find module './status-rules.js'` (or equivalent import error), since the module doesn't exist yet.

- [ ] **Step 3: Write the module**

Create `js/lib/status-rules.js`:

```js
export function getStatusRule(pipeline) {
  const allOpts = ['Not started yet', 'Started At Risk', 'Started', 'Put on hold', 'Completed'];
  const rules = {
    'SIP':         { options: [],   disabled: true },
    'Expected':    { options: ['Not started yet', 'Started At Risk', 'Put on hold', 'Completed'], disabled: false },
    'Anticipated': { options: ['Not started yet', 'Started At Risk', 'Put on hold', 'Completed'], disabled: false },
    'Committed':   { options: ['Started', 'Started At Risk', 'Put on hold', 'Completed'],          disabled: false },
    'Canceled':    { options: null,  disabled: true },
  };
  return rules[pipeline] || { options: allOpts, disabled: false };
}

window.getStatusRule = getStatusRule;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- status-rules`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add js/lib/status-rules.js js/lib/status-rules.test.js
git commit -m "feat(lib): add getStatusRule, the pipeline-to-allowed-status rule"
```

---

### Task 2: Wire the module into the two pages that use it

**Files:**
- Modify: `project-config.html` (near line 225)
- Modify: `portfolio.html` (near line 437)

**Interfaces:**
- Consumes: nothing new (this task only adds a `<script>` tag; the module's `window.getStatusRule` bridge from Task 1 is what makes it available).

- [ ] **Step 1: Add the script tag to `project-config.html`**

Find this line (around line 225):

```html
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
```

Add immediately after it:

```html
<script type="module" src="js/lib/status-rules.js?v=1"></script>
```

- [ ] **Step 2: Add the same script tag to `portfolio.html`**

Find this line (around line 437):

```html
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
```

Add immediately after it:

```html
<script type="module" src="js/lib/status-rules.js?v=1"></script>
```

- [ ] **Step 3: Verify both pages load without console errors**

Start the app (`docker compose up`, if not already running) and open `http://localhost/project-config.html?projectId=<any existing project id>` and `http://localhost/portfolio.html` in a browser. Open the browser DevTools console on each page.
Expected: no `Uncaught ReferenceError` or `404` for `status-rules.js` on either page. (At this point `cfgApplyPipelineRules` in `js/core.js` doesn't call `getStatusRule` yet — Task 3 wires that — so this step only confirms the script loads cleanly, not that behavior changed.)

- [ ] **Step 4: Commit**

```bash
git add project-config.html portfolio.html
git commit -m "feat: load status-rules.js on pages with the project Status dropdown"
```

---

### Task 3: Replace `cfgApplyPipelineRules`'s inline rule with `getStatusRule`

**Files:**
- Modify: `js/core.js:391-421`

**Interfaces:**
- Consumes: `getStatusRule(pipeline)` from Task 1 (available as `window.getStatusRule`, since Task 2 already loads the module on every page where this function is called).

- [ ] **Step 1: Replace the function body**

In `js/core.js`, replace the entire existing `cfgApplyPipelineRules` function (currently lines 391-421):

```js
function cfgApplyPipelineRules(pipeline, currentStatus) {
  const sel = document.getElementById('cfgStatus');
  const allOpts = ['Not started yet', 'Started At Risk', 'Started', 'Put on hold', 'Complete'];
  const allowed = {
    'SIP':              [],
    'Expected':         ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
    'Anticipated':      ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
    'Committed':        ['Started', 'Put on hold', 'Complete'],
    'Started':          ['Started', 'Started At Risk', 'Put on hold', 'Complete'],
    'Started at risk':  ['Started', 'Started At Risk', 'Put on hold', 'Complete'],
    'On Hold':          ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
    'Canceled':         null, // keep value, disable
  };

  const opts = pipeline ? allowed[pipeline] : allOpts;

  if (pipeline === 'SIP') {
    sel.innerHTML = '<option value="">— Select —</option>';
    sel.disabled = true;
    sel.value = '';
  } else if (pipeline === 'Canceled') {
    sel.disabled = true;
    // keep current options and value
  } else {
    const list = opts || allOpts;
    sel.innerHTML = '<option value="">— Select —</option>' +
      list.map(o => `<option value="${o}">${o}</option>`).join('');
    sel.disabled = false;
    sel.value = list.includes(currentStatus) ? currentStatus : '';
  }
}
```

with:

```js
function cfgApplyPipelineRules(pipeline, currentStatus) {
  const sel = document.getElementById('cfgStatus');
  const { options, disabled } = getStatusRule(pipeline);

  if (options === null) {          // Canceled: leave existing options/value untouched, just disable
    sel.disabled = true;
    return;
  }
  sel.innerHTML = '<option value="">— Select —</option>' +
    options.map(o => `<option value="${o}">${o}</option>`).join('');
  sel.disabled = disabled;         // true only for SIP (options = [])
  sel.value = options.includes(currentStatus) ? currentStatus : '';
}
```

- [ ] **Step 2: Manually verify in the browser (no automated test — DOM-driven call site, same precedent as prior cycles)**

With the app running, open `project-config.html` for a project whose pipeline is `Committed` (use an existing one, or set a project's pipeline to `Committed` via the Pipeline dropdown in the same form first).

1. Open the Status dropdown. Expected: options are `Not started yet`... wait — for `Committed` the options are `Started`, `Started At Risk`, `Put on hold`, `Completed` (no `Not started yet`, matching the original `Committed` list plus the F1 fix). Confirm `Started At Risk` is present — this was missing before this change.
2. Select `Completed` and save the project (use the form's existing Save action).
3. Reload `project-config.html` for the same project. Expected: the Status dropdown shows `Completed` selected (not reset to blank) — confirms the saved value round-trips correctly.
4. Navigate to the Portfolio page (`portfolio.html`) or wherever project status badges are shown for this project (e.g. the project card / detail panel using `statusBadge`/`statusBadgeLarge`). Expected: the badge for this project renders in the navy "Completed" color (`var(--brand-navy)`), not the grey default/fallback color.
5. Navigate to the Planning page (`planning.html`), open the project filter. Expected: this now-`Completed` project does **not** appear in the eligible-projects list (per `js/planning.js:471`'s filter).
6. Repeat step 1-2 on `portfolio.html`'s quick-edit project config form (the one with `#cfgPipeline`/`#cfgStatus`) for a `Committed` project, to confirm the same fix applies there too.

- [ ] **Step 3: Commit**

```bash
git add js/core.js
git commit -m "fix: use getStatusRule for project Status dropdown rules

Fixes Committed's missing Started At Risk option, the Complete/
Completed value mismatch (wrong badge color, never excluded from
Resource Planning), and removes dead pipeline-map keys.

Audit: docs/superpowers/audits/2026-07-09-proposal-project-status-lock-audit.md (F1, F2, F3)"
```

---

## Self-Review Notes

- **Spec coverage:** all three design-spec elements (module extraction, `cfgApplyPipelineRules` rewrite, testing plan) map to Task 1 (module+tests), Task 3 (integration). Task 2 (script wiring) was not explicit in the design spec's code samples but is required for the integration to work at all in the browser — added here after discovering `js/main.js` (the spec's assumed second call site) is dead code and `portfolio.html` is the real second page needing the module.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code or a concrete, numbered manual-verification sequence (no "verify it works" without saying how).
- **Type consistency:** `getStatusRule`'s return shape (`{ options, disabled }`) and the `options === null` sentinel are used identically in Task 1's tests and Task 3's integration code.
