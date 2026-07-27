# Harden Two Silent-Failure Paths in `js/costgrid.js` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two silent-failure paths in `js/costgrid.js` (a Clone flow that can silently leave a proposal with an empty structure, and two bridge functions that silently no-op) with an explicit signal — a user-facing warning for the first, a console warning for the second — with zero behavior change to any currently-working path.

**Architecture:** Two independent, additive fixes in existing functions. No new files, no new abstractions. Fix #13 adds a boolean return value to `cgLoadStructureFromApi()` (currently always implicitly `undefined`) and has its one relevant caller, `cgCloneGrid()`, react to a `false` result by showing the existing shared `showConfirm()` dialog non-blockingly. Fix #14 adds a `console.warn` to the previously-silent `else` branch of two bridge functions.

**Tech Stack:** Vanilla JS (classic scripts, no build step), the existing `showConfirm()` utility (`js/core.js:352`).

## Global Constraints

- No behavior change to any currently-working path — both fixes are purely additive (design spec, Backward compatibility).
- Do not make `cgLoadStructureFromApi()` throw instead of catching internally — its existing `try/catch` and `console.warn` on failure stay exactly as they are; only a `return` statement is added to each branch (Brief, Constraints).
- The 3 call sites of `cgLoadStructureFromApi()` other than `cgCloneGrid()` (`costgrid.html:853`, `pipeline.html:582`, `js/costgrid.js:901`) are not touched — they already discard the return value and continue to do so validly (design spec, Components §Fix #13).
- No new UI pattern — reuse the existing `showConfirm(message, onConfirm, onCancel, title)` signature (`js/core.js:352`), called the same non-blocking way as the existing `js/ai.js:517-520` precedent (`onConfirm`/`onCancel` both `null`, no `await` on the call).
- `js/costgrid.js` is shared, unmodified-elsewhere code loaded by both `pipeline.html` and `costgrid.html` — both pages' cost-grid-editor entry points must keep working after this change.

---

### Task 1: `cgLoadStructureFromApi()` return value + `cgCloneGrid()` non-blocking warning

**Files:**
- Modify: `js/api-sync.js:84-145` (`cgLoadStructureFromApi`)
- Modify: `js/costgrid.js:884-978` (`cgCloneGrid`)

**Interfaces:**
- Produces: `cgLoadStructureFromApi(cgId, versionId)` now resolves to `true` on success, `false` if its internal `catch` fired (previously always resolved to `undefined`). Task 2 does not depend on this.

- [ ] **Step 1: Add the two `return` statements to `cgLoadStructureFromApi()`**

Current end of the function (`js/api-sync.js:138-145`):

```js
      }
    }

    cgSave(cg);
  } catch (e) {
    console.warn('[sync] cgLoadStructureFromApi:', e.message);
  }
}
```

Change to:

```js
      }
    }

    cgSave(cg);
    return true;
  } catch (e) {
    console.warn('[sync] cgLoadStructureFromApi:', e.message);
    return false;
  }
}
```

- [ ] **Step 2: Update `cgCloneGrid()` to capture and react to the return value**

Current code at `js/costgrid.js:962-966`:

```js
    cgSave(cg);
    await cgLoadStructureFromApi(cgId, verId);

    bootstrap.Modal.getInstance(document.getElementById('cgCloneModal'))?.hide();
    showCostGridEditorView(cgId, verId);
```

Change to:

```js
    cgSave(cg);
    const structureLoaded = await cgLoadStructureFromApi(cgId, verId);
    if (!structureLoaded) {
      showConfirm(
        'The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.',
        null, null, '⚠️ Clone incomplete'
      );
    }

    bootstrap.Modal.getInstance(document.getElementById('cgCloneModal'))?.hide();
    showCostGridEditorView(cgId, verId);
```

Everything after this point in `cgCloneGrid()` (the URL-update logic, the outer `catch(e)` block) is unchanged — the modal still hides and the editor still opens unconditionally in both the success and failure case, matching the existing "self-heals on reload" behavior.

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task's changes (neither `cgLoadStructureFromApi` nor `cgCloneGrid` has existing automated test coverage — both are DOM/API-integration-heavy classic-script functions, not `js/lib/` pure functions — so no test should fail or newly appear).

- [ ] **Step 4: Manual verification of the failure path**

With the app running (`docker compose up`), open `costgrid.html` in a browser and open devtools. Use the Network tab's request-blocking feature (or the offline toggle, timed to catch the structure-fetch request) to force the `GET /api/cost-grids/:id/versions/:verId/structure` request that `cgLoadStructureFromApi` makes during a Clone to fail. Trigger Clone (⧉ Clone button in the editor toolbar → enter a name → Clone). Expected: the `⚠️ Clone incomplete` dialog from Step 2 appears, and the editor still opens on the new (temporarily empty) clone afterward. Reload the page and confirm the clone's structure now loads correctly (the pre-existing self-heal behavior, unchanged).

Then repeat Clone once more without blocking the network request, to confirm the success path shows no dialog and behaves exactly as before this task.

- [ ] **Step 5: Commit**

```bash
git add js/api-sync.js js/costgrid.js
git commit -m "fix(costgrid): surface a non-blocking warning when Clone's structure fetch fails silently"
```

---

### Task 2: Diagnostic warnings for the `_cgVueApp`-not-ready bridge paths

**Files:**
- Modify: `js/costgrid.js:174-178` (`showCostGridEditorView`)
- Modify: `js/costgrid.js:310-312` (`renderCgVersionTabs`)

**Interfaces:**
- Consumes: nothing from Task 1 — fully independent.
- Produces: nothing consumed by any other task.

- [ ] **Step 1: Add the `else console.warn` branch to `showCostGridEditorView()`**

Current code at `js/costgrid.js:174-178`:

```js
async function showCostGridEditorView(cgId, versionId) {
  if (_cgVueApp) { await _cgVueApp.openVersion(cgId, versionId); return; }
  // No mounted Vue app (e.g. this global was called before mount, or from a page that
  // never sets _cgVueApp) — nothing to do; every real caller on costgrid.html runs after mount.
}
```

Change to:

```js
async function showCostGridEditorView(cgId, versionId) {
  if (_cgVueApp) { await _cgVueApp.openVersion(cgId, versionId); return; }
  // No mounted Vue app (e.g. this global was called before mount, or from a page that
  // never sets _cgVueApp) — nothing to do; every real caller on costgrid.html runs after mount.
  console.warn('[costgrid] showCostGridEditorView called before _cgVueApp is ready', cgId, versionId);
}
```

- [ ] **Step 2: Add the same warning to `renderCgVersionTabs()`**

Current code at `js/costgrid.js:310-312`:

```js
function renderCgVersionTabs(cg) {
  if (_cgVueApp) _cgVueApp.cg = cg ? JSON.parse(JSON.stringify(cg)) : null;
}
```

Change to:

```js
function renderCgVersionTabs(cg) {
  if (_cgVueApp) { _cgVueApp.cg = cg ? JSON.parse(JSON.stringify(cg)) : null; return; }
  console.warn('[costgrid] renderCgVersionTabs called before _cgVueApp is ready', cg);
}
```

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task's changes (no existing test covers either function).

- [ ] **Step 4: Manual verification**

With the app running, open `costgrid.html`, open devtools console, and reload the page. Immediately (before the page finishes loading — this is a timing-sensitive manual check, a few attempts may be needed) run in the console:

```js
showCostGridEditorView('test-cg-id', 'test-ver-id')
```

Expected: if `_cgVueApp` has not yet been set at that moment, the console shows `[costgrid] showCostGridEditorView called before _cgVueApp is ready test-cg-id test-ver-id`. If the app already mounted by the time you run this, `_cgVueApp` will be set and no warning fires — in that case, this confirms the code takes the normal, unchanged path (call `_cgVueApp.openVersion(...)`), not the removed silent no-op.

After the page has fully loaded, load `costgrid.html`/`pipeline.html` normally and confirm both pages' cost-grid editor entry points still work exactly as before (open a proposal, switch versions) — the version-tabs UI is driven by `renderCgVersionTabs()`, so this also confirms Step 2 introduced no regression in the normal case.

- [ ] **Step 5: Commit**

```bash
git add js/costgrid.js
git commit -m "fix(costgrid): warn when showCostGridEditorView/renderCgVersionTabs run before _cgVueApp is ready"
```
