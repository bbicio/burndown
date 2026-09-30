# UI defects that mislead or lose data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per CLAUDE.md, the terminal step of execution is `/finish-cycle`, never `superpowers:finishing-a-development-branch`.

**Goal:** Remove four UI behaviours that mislead or lose data: no leave-page warning on `project-config.html`, a false Program-delete message plus no reachable Program rename/delete, and two Team-assistant defects.

**Architecture:** Three small, independent tasks. Decision logic goes in pure functions in existing `js/lib/*.js` modules (vitest-tested, bridged to `window.*`); pages call them. No backend, DB or migration change.

**Tech Stack:** Vue 3 (CDN, no build), vitest + jsdom (`npm test`), native ES modules with `window.*` bridges.

**Spec:** `docs/superpowers/specs/2026-09-30-ui-defects-data-loss-design.md`

## Global Constraints

- All user-facing text in English.
- No bundler, no build step; files served as on disk.
- Cache-busting: every changed versioned file gets `?v=N` bumped in **every** page that references it (grep the whole repo first). `js/lib/config-form-calc.js` 1→2 (only `project-config.html`), `js/lib/team-assistant-ui.js` 2→3 (only `planning.html`).
- Do NOT touch `js/settings.js` or anything in Settings (excluded permanently from this and other cycles).
- Do NOT replace native `alert()`/`confirm()` or fix inline hex colours (deferred point 2). The Program delete stays a native `confirm()`.
- Never run `docker compose` against the main stack (`pdash-*`, project `burndown`); use `scripts/test-branch.sh` for manual checks.
- Work in a worktree branch created via `superpowers:using-git-worktrees` (copy `.env` from the main checkout; never commit it).

## Review Focus

- Save success on `project-config.html` must not trigger the leave prompt (redirect follows Save).
- A failed Save leaves the page dirty (prompt still fires).
- An existing project opened and left untouched must NOT prompt (normalisations in `resolveProject` happen before the snapshot).
- Viewer (`my_permission === 'viewer'`) never prompts.
- Team assistant: options list becomes empty/unchanged while nothing is selected → no reset, no error.
- Enter with `keyCode 229` / `isComposing` must not send; Shift+Enter must not send either.

---

### Task 1: Team assistant — selection reset and IME-safe Enter

**Files:**
- Modify: `js/lib/team-assistant-ui.js` (add two functions after `chatPayload`, near line 60-70)
- Test: `js/lib/team-assistant-ui.test.js`
- Modify: `planning.html:153` (Enter handler), `planning.html:1296-1302` (`watch:`), `planning.html:251` (`?v=2` → `?v=3`)

**Interfaces:**
- Produces: `selectionStillValid(selectedId: string, options: {id:string}[]): boolean`; `shouldSendOnEnter(e: {key?:string, shiftKey?:boolean, isComposing?:boolean, keyCode?:number}): boolean`; both bridged as `window.selectionStillValid` / `window.shouldSendOnEnter`.

- [ ] **Step 1: Write the failing tests**

In `js/lib/team-assistant-ui.test.js` change the import on line 2 to also import `selectionStillValid, shouldSendOnEnter`, then append at the end of the file:

```js
describe('selectionStillValid', () => {
  const opts = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  it('accepts an empty selection', () => {
    expect(selectionStillValid('', opts)).toBe(true);
    expect(selectionStillValid('', [])).toBe(true);
  });
  it('accepts a selection still in the options', () => {
    expect(selectionStillValid('b', opts)).toBe(true);
  });
  it('rejects a selection missing from the options', () => {
    expect(selectionStillValid('c', opts)).toBe(false);
    expect(selectionStillValid('a', [])).toBe(false);
    expect(selectionStillValid('a', null)).toBe(false);
  });
});

describe('shouldSendOnEnter', () => {
  it('sends on plain Enter', () => {
    expect(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 })).toBe(true);
  });
  it('does not send on Shift+Enter', () => {
    expect(shouldSendOnEnter({ key: 'Enter', shiftKey: true, isComposing: false, keyCode: 13 })).toBe(false);
  });
  it('does not send while an IME composition is active', () => {
    expect(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: true, keyCode: 13 })).toBe(false);
  });
  it('does not send on the IME-confirming Enter reported as keyCode 229', () => {
    expect(shouldSendOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 })).toBe(false);
  });
  it('does not send for other keys or a missing event', () => {
    expect(shouldSendOnEnter({ key: 'a', shiftKey: false, isComposing: false, keyCode: 65 })).toBe(false);
    expect(shouldSendOnEnter(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run js/lib/team-assistant-ui.test.js`
Expected: FAIL — `selectionStillValid` / `shouldSendOnEnter` are not exported.

- [ ] **Step 3: Implement**

In `js/lib/team-assistant-ui.js`, after the `chatPayload` function and before the `window.*` bridge lines, add:

```js
export function selectionStillValid(selectedId, options) {
  if (!selectedId) return true;
  return (options || []).some(o => o.id === selectedId);
}

export function shouldSendOnEnter(e) {
  return !!e && e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229;
}
```

and add to the bridge block (after `window.chatPayload = chatPayload;`):

```js
window.selectionStillValid = selectionStillValid;
window.shouldSendOnEnter = shouldSendOnEnter;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run js/lib/team-assistant-ui.test.js`
Expected: PASS.

- [ ] **Step 5: Wire `planning.html`**

Line 153: replace
`@keydown.enter="e => { if (!e.shiftKey) { e.preventDefault(); taSend(); } }"`
with
`@keydown.enter="e => { if (shouldSendOnEnter(e)) { e.preventDefault(); taSend(); } }"`

`shouldSendOnEnter` is not in Vue's template scope, so add a method next to `renderChatText` (line ~1025):

```js
      shouldSendOnEnter(e) { return window.shouldSendOnEnter(e); },
```

In `watch:` (line ~1296, next to `teamFilters`), add:

```js
      // The assistant's project select follows the page filters; if a filter removes the selected
      // project, reset to "no project" (same effect as changing project) instead of leaving chat/tables
      // for a project that is no longer selectable.
      taProjectOptions() {
        if (!window.selectionStillValid(this.taProjectId, this.taProjectOptions)) {
          this.taProjectId = '';
          this.taNewChat();
        }
      },
```

Line 251: `js/lib/team-assistant-ui.js?v=2` → `?v=3`. Then run `grep -rn "team-assistant-ui" --include=*.html .` and confirm no other reference exists.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add js/lib/team-assistant-ui.js js/lib/team-assistant-ui.test.js planning.html
git commit -m "fix: team assistant resets selection when filtered out, ignores IME Enter

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: project-config — leave-page warning for unsaved changes

**Files:**
- Modify: `js/lib/config-form-calc.js` (add function + bridge, bridge lines at ~178-179)
- Test: `js/lib/config-form-calc.test.js` (import on line 2)
- Modify: `project-config.html` (data ~line 429, `created()` line 484, end of init line 508, `onSave` line ~841, `methods`, script tag line 404)

**Interfaces:**
- Produces: `isProjectDirty(savedJson: string|null, project: object|null): boolean`, bridged as `window.isProjectDirty`.

- [ ] **Step 1: Write the failing tests**

In `js/lib/config-form-calc.test.js` change line 2 to also import `isProjectDirty`, then append:

```js
describe('isProjectDirty', () => {
  const p = { id: 'x', name: 'A', tasks: [{ name: 't', resources: [] }], phasing: { '202601': 10 } };
  it('is false when the project equals the snapshot', () => {
    expect(isProjectDirty(JSON.stringify(p), JSON.parse(JSON.stringify(p)))).toBe(false);
  });
  it('is true after any change, including nested ones', () => {
    const q = JSON.parse(JSON.stringify(p));
    q.phasing['202601'] = 11;
    expect(isProjectDirty(JSON.stringify(p), q)).toBe(true);
    const r = JSON.parse(JSON.stringify(p));
    r.tasks.push({ name: 'u', resources: [] });
    expect(isProjectDirty(JSON.stringify(p), r)).toBe(true);
  });
  it('is false when there is no snapshot or no project', () => {
    expect(isProjectDirty(null, p)).toBe(false);
    expect(isProjectDirty(JSON.stringify(p), null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run js/lib/config-form-calc.test.js`
Expected: FAIL — `isProjectDirty` not exported.

- [ ] **Step 3: Implement**

In `js/lib/config-form-calc.js` add (before the bridge lines):

```js
export function isProjectDirty(savedJson, project) {
  if (savedJson == null || project == null) return false;
  return JSON.stringify(project) !== savedJson;
}
```

and after `window.reforecastDistribution = reforecastDistribution;` add `window.isProjectDirty = isProjectDirty;`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run js/lib/config-form-calc.test.js`
Expected: PASS.

- [ ] **Step 5: Wire `project-config.html`**

1. Script tag line 404: `js/lib/config-form-calc.js?v=1` → `?v=2` (grep the repo first: only this page loads it).
2. Data (near `isNewProject: false,` line 431): add `savedSnapshot: null,`.
3. Start of `async created()` (line 484), before `initNav`, register the listener once:

```js
      window.addEventListener('beforeunload', e => {
        if (this.isViewer) return;
        if (window.isProjectDirty(this.savedSnapshot, this.project)) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
```

4. Just before `this.ready = true;` (line 508), take the snapshot after all loading and normalisation:

```js
      if (this.project && !this.notFound) this.savedSnapshot = JSON.stringify(this.project);
```

5. In `onSave`, immediately before `window.location.href = '/portfolio.html?projectId=' + this.project.id;` (line ~841) add:

```js
          this.savedSnapshot = JSON.stringify(this.project);
```

It must sit after `_pushProjectToApi` and before the redirect, so a save that throws before this line stays dirty.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Manual check on the isolated stack**

Run `scripts/test-branch.sh up`, open an existing project in `project-config.html`:
1. Do nothing, click "← Back to Portfolio" → no prompt.
2. Click "⟳ Derive from task dates", confirm, then reload → browser leave-page prompt.
3. Edit a field, click 💾 Save → lands on portfolio with no prompt.
4. Open a project as a viewer → edit is disabled, no prompt on leave.
Tear down only after the user's own confirmation in `/finish-cycle` Gate 2.

- [ ] **Step 8: Commit**

```bash
git add js/lib/config-form-calc.js js/lib/config-form-calc.test.js project-config.html
git commit -m "feat: warn before leaving project-config with unsaved changes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Programs tab and honest delete message

**Files:**
- Modify: `config.html:107-110` (stale comment → tab button), `config.html:1564` (confirm text)

**Interfaces:** none (no shared code).

- [ ] **Step 1: Show the tab**

Replace the comment block at lines 107-110 with the tab button (same pattern as the neighbouring tabs):

```html
      <button class="cfg-tab-btn" :class="{ active: activeTab === 'programs' }" @click="activeTab = 'programs'">
        🗂 Programs <span class="fw-normal text-muted">({{ programs.length }})</span>
      </button>
```

- [ ] **Step 2: Fix the delete confirm text**

In `deleteProgram` (line 1564) replace the message with:

```js
      if (!confirm(`Delete program "${prog.name}"?\n\nThis cannot be undone. A program that still has projects linked cannot be deleted — the request will be refused.`)) return;
```

Leave the rest of the method unchanged (the catch already puts the server message into `globalError`).

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: all green (no test covers this HTML; it is checked manually).

- [ ] **Step 4: Manual check on the isolated stack**

As admin in `config.html`: Programs tab visible with count; ✏️ Edit renames a program; Delete on a program with linked projects shows the new text, then the "Cannot delete program with linked projects" error, and the program stays listed; Delete on an empty program removes it. `config.html` has no other `?v=` change here (page HTML only).

- [ ] **Step 5: Commit**

```bash
git add config.html
git commit -m "fix: show Programs tab again and correct the delete confirmation text

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Team assistant manual check and closeout

- [ ] **Step 1:** On the isolated stack in `planning.html` as admin: open the Team assistant, select a project, run "Calculate team", then change a page filter so the project disappears → select returns to "Select a project…", chat and tables clear. Filter change that keeps the project → nothing changes. Enter during IME composition (or dispatch `new KeyboardEvent('keydown', {key:'Enter', isComposing:true})` in the console on the textarea) does not send; Shift+Enter inserts a newline; plain Enter sends.
- [ ] **Step 2:** Final repo-wide `?v=` check: `grep -rn "config-form-calc\|team-assistant-ui" --include=*.html .` shows `?v=2` and `?v=3`.
- [ ] **Step 3:** Run `/finish-cycle` (test gate, code review, `--no-ff` merge, push, worktree cleanup). Do not merge or push any other way.

---

## Self-review

- Spec coverage: D1/D2/AC1/AC2 → Task 2; D3/D4/AC3/AC4 → Task 3; D5/D6/AC5/AC6 → Tasks 1 and 4; AC7 → each task's test steps; AC8 → Tasks 1, 2 and 4 step 2.
- Type consistency: `isProjectDirty`, `selectionStillValid`, `shouldSendOnEnter` names match across modules, bridges and pages.
- No placeholders; the only non-code steps are manual browser checks, which the spec lists.
