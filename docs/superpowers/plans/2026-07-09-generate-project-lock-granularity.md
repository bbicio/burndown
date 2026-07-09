# Generate Project Lock Granularity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `cgGetVersionLockState` so a proposal version locks only when the proposal itself is Committed AND every task has been migrated to a project — not when any single linked project reaches Committed while other tasks remain unmapped.

**Architecture:** New `js/lib/costgrid-calc.js` ES module exports two pure functions, `versionHasFreeTasks(ver)` and `isVersionCommittedLocked(ver)`. `js/costgrid.js`'s `cgGetVersionLockState` calls `isVersionCommittedLocked` instead of its old inline "any linked project is Committed" check. No other consumer of the lock state changes.

**Tech Stack:** Vanilla JS, ES modules for `js/lib/`, vitest for unit tests (no bundler, no build step — see `CLAUDE.md`).

## Global Constraints

- No bundler/build step: `js/lib/costgrid-calc.js` must be a native ES module (`export function ...`) with `window.<name> = <name>` bridge lines, loaded via `<script type="module">`, per the existing `js/lib/cfg-parse.js`/`js/lib/planning-calc.js`/`js/lib/status-rules.js` convention.
- A bridged `window.*` global from `js/lib/` may only be read from inside an event handler or a function invoked after `DOMContentLoaded` — never at a classic script's parse-time top level (`CLAUDE.md`, "Script loading order"). `cgGetVersionLockState` is only ever called from render functions triggered after page load, so this is already satisfied.
- All user-facing text must be in English.
- Out of scope: F1/F2/F3 (separate, already-merged cycle), the `other-version-active` lock reason, the `isDraft`-gated new-version-creation block, and the broader audit of other direct `.pipeline` reads across the codebase (deferred to a future `/domain-audit`) — none of these are touched by this plan.
- `PRD.md:155-156` documents the old lock rule and needs updating to match the new one — this happens via `/sync-docs` during `/finish-cycle`, not as a task in this plan.

---

## File Structure

- Create: `js/lib/costgrid-calc.js` — pure functions, the single source of truth for "is this task migrated" and "is this version committed-locked".
- Create: `js/lib/costgrid-calc.test.js` — vitest unit tests.
- Modify: `js/costgrid.js:105-130` (`cgGetVersionLockState`) — replace the `hasCommitted` block only.
- Modify 5 HTML pages to add the new module's `<script type="module">` tag: `project-config.html` (near line 225), `portfolio.html` (near line 437), `planning.html` (near line 218), `pipeline.html` (near line 181), `costgrid.html` (near line 286) — all five load `js/costgrid.js` and therefore can invoke `cgGetVersionLockState` (directly, or via the pipeline board's card-list rendering, which shows every visible proposal's lock badge regardless of which page is open).

---

### Task 1: Create the `costgrid-calc` module and its tests

**Files:**
- Create: `js/lib/costgrid-calc.js`
- Test: `js/lib/costgrid-calc.test.js`

**Interfaces:**
- Produces: `versionHasFreeTasks(ver: object) => boolean` — `ver` is a cost grid version object with `phases: [{ tasks: [{ taskId, taskName }] }]` and `linkedProjects: [{ projectId, taskIds: string[], taskNames: string[] }]`.
- Produces: `isVersionCommittedLocked(ver: object) => boolean` — `ver` additionally has a `pipeline: string` field.

- [ ] **Step 1: Write the failing tests**

Create `js/lib/costgrid-calc.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { versionHasFreeTasks, isVersionCommittedLocked } from './costgrid-calc.js';

describe('versionHasFreeTasks', () => {
  it('returns true when a task has no matching entry in any linkedProjects', () => {
    const ver = {
      phases: [{ tasks: [{ taskId: 't1', taskName: 'Design' }] }],
      linkedProjects: [],
    };
    expect(versionHasFreeTasks(ver)).toBe(true);
  });

  it('returns false when every task is covered across multiple linkedProjects entries (one task each, multiple projects)', () => {
    const ver = {
      phases: [{ tasks: [
        { taskId: 't1', taskName: 'Design' },
        { taskId: 't2', taskName: 'Build' },
      ] }],
      linkedProjects: [
        { projectId: 'p1', taskIds: ['t1'], taskNames: [] },
        { projectId: 'p2', taskIds: ['t2'], taskNames: [] },
      ],
    };
    expect(versionHasFreeTasks(ver)).toBe(false);
  });

  it('returns false when multiple tasks map to the same linkedProjects entry (many tasks, one project)', () => {
    const ver = {
      phases: [{ tasks: [
        { taskId: 't1', taskName: 'Design' },
        { taskId: 't2', taskName: 'Build' },
      ] }],
      linkedProjects: [
        { projectId: 'p1', taskIds: ['t1', 't2'], taskNames: [] },
      ],
    };
    expect(versionHasFreeTasks(ver)).toBe(false);
  });
});

describe('isVersionCommittedLocked', () => {
  it('returns false when pipeline is not Committed, regardless of task mapping', () => {
    const ver = { pipeline: 'Anticipated', phases: [], linkedProjects: [] };
    expect(isVersionCommittedLocked(ver)).toBe(false);
  });

  it('returns false when Committed but at least one task is unmapped (the original bug scenario)', () => {
    const ver = {
      pipeline: 'Committed',
      phases: [{ tasks: [
        { taskId: 't1', taskName: 'Design' },
        { taskId: 't2', taskName: 'Build' },
      ] }],
      linkedProjects: [{ projectId: 'p1', taskIds: ['t1'], taskNames: [] }],
    };
    expect(isVersionCommittedLocked(ver)).toBe(false);
  });

  it('returns true only when Committed and every task is mapped', () => {
    const ver = {
      pipeline: 'Committed',
      phases: [{ tasks: [{ taskId: 't1', taskName: 'Design' }] }],
      linkedProjects: [{ projectId: 'p1', taskIds: ['t1'], taskNames: [] }],
    };
    expect(isVersionCommittedLocked(ver)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- costgrid-calc`
Expected: FAIL — `Cannot find module './costgrid-calc.js'` (or equivalent import error), since the module doesn't exist yet.

- [ ] **Step 3: Write the module**

Create `js/lib/costgrid-calc.js`:

```js
export function versionHasFreeTasks(ver) {
  const assignedIds = new Set();
  const assignedNames = new Set();
  (ver.linkedProjects || []).forEach(lp => {
    (lp.taskIds || []).forEach(id => assignedIds.add(id));
    (lp.taskNames || []).forEach(n => { if (n?.trim()) assignedNames.add(n.trim().toLowerCase()); });
  });
  return (ver.phases || []).flatMap(ph => ph.tasks || []).some(t =>
    t.taskName?.trim() && !assignedIds.has(t.taskId) && !assignedNames.has(t.taskName.trim().toLowerCase())
  );
}

export function isVersionCommittedLocked(ver) {
  return ver?.pipeline === 'Committed' && !versionHasFreeTasks(ver);
}

window.versionHasFreeTasks = versionHasFreeTasks;
window.isVersionCommittedLocked = isVersionCommittedLocked;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- costgrid-calc`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add js/lib/costgrid-calc.js js/lib/costgrid-calc.test.js
git commit -m "feat(lib): add versionHasFreeTasks and isVersionCommittedLocked"
```

---

### Task 2: Wire the module into the five pages that use it

**Files:**
- Modify: `project-config.html` (near line 225)
- Modify: `portfolio.html` (near line 437)
- Modify: `planning.html` (near line 218)
- Modify: `pipeline.html` (near line 181)
- Modify: `costgrid.html` (near line 286)

**Interfaces:**
- Consumes: nothing new (this task only adds `<script>` tags; Task 1's `window.versionHasFreeTasks`/`window.isVersionCommittedLocked` bridge is what makes the module available).

- [ ] **Step 1: Add the script tag to `project-config.html`**

Find this line (around line 225):

```html
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
```

Add immediately after it:

```html
<script type="module" src="js/lib/costgrid-calc.js?v=1"></script>
```

- [ ] **Step 2: Add the same script tag to `portfolio.html`**

Find this line (around line 437):

```html
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
```

Add immediately after it:

```html
<script type="module" src="js/lib/costgrid-calc.js?v=1"></script>
```

- [ ] **Step 3: Add the same script tag to `planning.html`**

Find this line (around line 218):

```html
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
```

Add immediately after it:

```html
<script type="module" src="js/lib/costgrid-calc.js?v=1"></script>
```

- [ ] **Step 4: Add the same script tag to `pipeline.html`**

Find this line (around line 181):

```html
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
```

Add immediately after it:

```html
<script type="module" src="js/lib/costgrid-calc.js?v=1"></script>
```

- [ ] **Step 5: Add the same script tag to `costgrid.html`**

Find this line (around line 286):

```html
<script type="module" src="js/lib/cfg-parse.js?v=1"></script>
```

Add immediately after it:

```html
<script type="module" src="js/lib/costgrid-calc.js?v=1"></script>
```

- [ ] **Step 6: Verify with a static check**

Run (from the repo root):

```bash
grep -l "js/lib/costgrid-calc.js" project-config.html portfolio.html planning.html pipeline.html costgrid.html
```

Expected: all five filenames printed (one per line), confirming the tag was added to each.

- [ ] **Step 7: Commit**

```bash
git add project-config.html portfolio.html planning.html pipeline.html costgrid.html
git commit -m "feat: load costgrid-calc.js on pages that can render version lock state"
```

---

### Task 3: Replace `cgGetVersionLockState`'s committed-lock condition

**Files:**
- Modify: `js/costgrid.js:105-130`

**Interfaces:**
- Consumes: `isVersionCommittedLocked(ver)` from Task 1 (available as `window.isVersionCommittedLocked`, loaded on all five relevant pages by Task 2).

- [ ] **Step 1: Replace the function body**

In `js/costgrid.js`, replace the entire existing `cgGetVersionLockState` function (currently lines 105-130):

```js
function cgGetVersionLockState(cgId, versionId) {
  const cg = cgLoad(cgId);
  if (!cg) return { locked: false, reason: '', message: '' };

  // Any OTHER version with linked projects → this version is superseded
  const otherLinked = cg.versions.some(v =>
    v.versionId !== versionId && (v.linkedProjects || []).length > 0
  );
  if (otherLinked) return {
    locked: true, reason: 'other-version-active',
    message: 'This version is locked — another version has been used to generate a project.'
  };

  // This version has a Committed linked project → deal is done, lock it
  const thisVer = cg.versions.find(v => v.versionId === versionId);
  const hasCommitted = (thisVer?.linkedProjects || []).some(lp => {
    const proj = (config.projects || []).find(p => p.id === lp.projectId);
    return proj?.pipeline === 'Committed';
  });
  if (hasCommitted) return {
    locked: true, reason: 'committed',
    message: 'This version is locked — the linked project has been committed.'
  };

  return { locked: false, reason: '', message: '' };
}
```

with:

```js
function cgGetVersionLockState(cgId, versionId) {
  const cg = cgLoad(cgId);
  if (!cg) return { locked: false, reason: '', message: '' };

  // Any OTHER version with linked projects → this version is superseded
  const otherLinked = cg.versions.some(v =>
    v.versionId !== versionId && (v.linkedProjects || []).length > 0
  );
  if (otherLinked) return {
    locked: true, reason: 'other-version-active',
    message: 'This version is locked — another version has been used to generate a project.'
  };

  // Proposal itself is Committed and every task has been migrated to a project → deal is fully done, lock it
  const thisVer = cg.versions.find(v => v.versionId === versionId);
  if (isVersionCommittedLocked(thisVer)) return {
    locked: true, reason: 'committed',
    message: 'This version is locked — the proposal has been committed and every task has been migrated to a project.'
  };

  return { locked: false, reason: '', message: '' };
}
```

- [ ] **Step 2: Manually verify in the browser (no automated test — DOM-driven call site, same precedent as prior cycles)**

With the app running (`docker compose up` if not already running), open the cost grid editor (`costgrid.html?cgId=...&verId=...`) for a proposal version with **at least 2 tasks**, neither yet mapped to a project.

1. Use "Add to project" or "Generate Project" to map **only the first task** to a project (create a new one if needed).
2. In the editor, set the version's Pipeline dropdown (`#cgPipeline`) to `Committed`, and save/publish so `_cgDraft.pipeline` becomes `'Committed'`.
3. Reload the editor for this version. Expected: "Generate Project" is **still visible** (the second task is still unmapped), the editor fields are **still editable** — no lock banner, no 🔒 badge. This is the exact scenario that was broken before this fix.
4. Use "Generate Project" (or "Add to project") to map the **second, remaining task** to a project (the same one or a different one — either is valid).
5. Reload the editor. Expected: now that every task is mapped and the version's pipeline is `Committed`, the version **is** locked — "Generate Project" is hidden, a lock banner reading "This version is locked — the proposal has been committed and every task has been migrated to a project." is shown, and all input/textarea/select fields in the editor are disabled (`cgApplyEditorLock`).
6. Navigate to the Pipeline board (`pipeline.html`) and find this proposal's card. Expected: it shows the 🔒 badge (via `cgGetVersionLockState` called from the card-list rendering, `js/costgrid.js:228-229`).

- [ ] **Step 3: Commit**

```bash
git add js/costgrid.js
git commit -m "fix: lock proposal version only when Committed and every task is migrated

Fixes the Generate Project button (and the whole-editor lock) firing
as soon as any single linked project reached Committed, even with
other tasks still unmapped — it now checks the proposal version's own
pipeline plus full task-migration status, not an individual linked
project's pipeline.

Audit: docs/superpowers/audits/2026-07-09-proposal-project-status-lock-audit.md (F4)"
```

---

## Self-Review Notes

- **Spec coverage:** the design spec's module (Task 1), integration (Task 3), and "why nothing else needs to change" analysis are all reflected. Task 2 (script wiring across 5 pages) is not explicit code in the design spec but is required for the module to be loadable at all — derived from grepping which HTML pages load `js/costgrid.js`, since `cgGetVersionLockState` is called from multiple pages' rendering paths (editor page, pipeline board), not just one.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code or a concrete, numbered manual-verification sequence.
- **Type consistency:** `isVersionCommittedLocked(ver)`'s signature and `versionHasFreeTasks(ver)`'s signature are used identically across Task 1's tests and Task 3's integration code (`isVersionCommittedLocked(thisVer)`).
