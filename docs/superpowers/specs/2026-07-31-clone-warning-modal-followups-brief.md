# Brief — Clone Warning Modal Follow-Ups (401 Race + `showConfirm()` Affordance)

**Scenario:** Audit → fix (Scenario 3 per `docs/superpowers/PROCESS.md` §2). Source: `docs/superpowers/reports/2026-07-27-worktree-costgrid-silent-failures-finish-cycle.md`, Gate 3 — two findings explicitly accepted as follow-up in that cycle rather than fixed, both because a clean fix conflicted with that cycle's own scope constraints. Both re-verified against current `js/costgrid.js`/`js/api.js`/`js/core.js` while drafting this Brief — still present, unchanged.

Grouped into one cycle per user decision: both findings live in the same code path (`cgCloneGrid()`'s destination-side structure-load warning, `js/costgrid.js:970-975`), share a common root cause (limits of the existing `showConfirm()` modal, which was designed as a two-button confirm/cancel dialog, not a single-button informational one, and has no concept of "this specific error type needs different handling"), and are small enough that treating them separately would be two near-identical small cycles.

## Item 1 — Session-expiry (401) race shows a confusing "Clone incomplete" dialog instead of a clean redirect

**Current behavior, re-verified:**

`cgCloneGrid()`'s destination-side structure load (`js/costgrid.js:970-975`):
```js
const structureLoaded = await cgLoadStructureFromApi(cgId, verId);
if (!structureLoaded) {
  showConfirm(
    'The new proposal was created, but its structure may not have loaded correctly. Please reload the page to verify.',
    null, null, '⚠️ Clone incomplete'
  );
}
```

`cgLoadStructureFromApi()` (`js/api-sync.js`) catches any failure internally (including from `apiFetch`) and returns `false` — it does not distinguish *why* the fetch failed.

`apiFetch()` (`js/api.js:27-29`), on a `401` response:
```js
if (res.status === 401) {
  window.location.href = '/login.html';
  throw new Error('Unauthorized');
}
```

It **begins** a page navigation (`window.location.href = ...`) and **then** throws synchronously. Since `window.location.href` assignment doesn't halt script execution, the thrown error propagates up through `cgLoadStructureFromApi()`'s catch (returning `false`) into `cgCloneGrid()`'s `if (!structureLoaded)` branch, which calls `showConfirm(...)` — all of this happens in the same synchronous-ish tick, before the browser actually completes the navigation to `/login.html`. The result: a user whose session expires at exactly the wrong moment sees a confusing "⚠️ Clone incomplete... reload to verify" dialog flash for a moment before the browser redirects them to the login page.

**Expected behavior:** on a session-expiry (401) during the destination-side structure load, the user should NOT see the "Clone incomplete" dialog — only the redirect to `/login.html` should be visible, matching the behavior every other 401 case in the app already has (a clean bounce to login, no other UI in between).

## Item 2 — `showConfirm()`'s OK/Cancel affordance is misleading on a purely informational dialog

**Current behavior, re-verified:** `showConfirm(message, onConfirm, onCancel, title)` (`js/core.js`) always renders the shared `#confirmModal` markup, which has two buttons — `#confirmModalCancel` ("Cancel") and `#confirmModalOk` ("Confirm") (`costgrid.html:427-428`). When called with `onConfirm=null, onCancel=null` (the pattern used for the Clone-incomplete warning, and identically for `js/ai.js`'s pre-existing "API Key required" dialog), neither button actually does anything different — both simply close the dialog. The two-button affordance implies a real choice exists (e.g., "Confirm" implies committing to some action) when there isn't one; a user might expect clicking "Cancel" to undo something (e.g., revert the clone), which it does not.

**Expected behavior:** this Brief does not mandate a specific UI redesign (see Constraints) — the acceptance criterion is a *decision*, reached via `/brainstorming`, on how to present a purely-informational message without the misleading two-button affordance, applied consistently to both of `showConfirm()`'s current no-op-callback call sites (the Clone-incomplete warning in `js/costgrid.js`, and the "API Key required" dialog in `js/ai.js`).

## Constraints

- **Item 1 constraint, carried forward from the original finding:** do not make `cgLoadStructureFromApi()` (or `apiFetch()`) throw differently for different error types in a way that could break their other call sites — `cgLoadStructureFromApi()` has 4 call sites total (`js/costgrid.js:903` and `:965`, `costgrid.html:853`, `pipeline.html:582`), and `apiFetch()` is the single shared HTTP layer for the entire app. Any fix must be scoped to `cgCloneGrid()`'s own reaction to a failed load, not to the shared functions' error-propagation contract.
- **Item 2 constraint, carried forward:** whatever presentation is chosen must not require inventing a heavyweight new modal system — this project's established convention (`js/core.js`'s `showConfirm()`, used identically across `js/costgrid.js`/`js/ai.js`/every Vue-migrated page) should be extended or adapted, not replaced. A single new lightweight variant (e.g., an `onConfirm`-only "info" mode, or a title/body convention that suppresses the Cancel button when no `onCancel` is meaningfully different from `onConfirm`) is in scope; a wholesale new component library is not.
- Do not touch any other native `alert()` calls remaining in `js/costgrid.js` (e.g. `cgConfirmDeleteGrid`'s/`cgConfirmDeleteVersion`'s own delete-failure `alert()`s) — out of scope, unrelated to these two specific findings.
- Do not attempt to fix the underlying reason `cgLoadStructureFromApi()` can fail in the first place (network issues, backend errors) — both items are about the *presentation* of an already-occurring failure, not preventing the failure.

## Acceptance criteria

- [ ] Reproducing a session-expiry (401) during Clone's destination-side structure load shows only the redirect to `/login.html` — no "Clone incomplete" dialog appears first.
- [ ] Every other (non-401) structure-load failure during Clone still shows the "⚠️ Clone incomplete" warning exactly as before — this fix must not suppress genuine warnings, only the 401-specific race.
- [ ] A decision is reached (via `/brainstorming`) on how purely-informational `showConfirm()` calls (no meaningful `onConfirm`/`onCancel` distinction) should present differently from a real confirm/cancel choice, and applied to both current call sites (`js/costgrid.js`'s Clone-incomplete warning, `js/ai.js`'s API-key-required dialog).
- [ ] `npm test` passes with no regressions.
- [ ] Manual smoke check: the normal (non-401, non-informational-dialog-affected) Clone flow, Delete flow, and AI-key-missing flow all still work exactly as before.

## Explicitly excluded scope

- Every other item from the broader backlog surfaced this session (sold-hours validation, `js/ai.js` matching-logic divergence, `_resolveCgIdForVersion()` dead code, XLS column-mapping ambiguity, the "To be planned" tooltip wording, the `/finish-cycle` Gate 2 blind spot, the unused `xlsx@0.18.5` CDN library) — unrelated, separate future work.
- The FOUC/`v-cloak` Efficiency follow-up (blank-screen window length) — separate, already-tracked, unrelated root cause.
- Any change to `cgLoadStructureFromApi()`'s or `apiFetch()`'s shared error-handling contract beyond what's needed for `cgCloneGrid()`'s own reaction (see Constraints).

## Required reminder (new-findings guard)

Any new finding discovered during this cycle's `/brainstorming` or execution — another `showConfirm()` call site with the same affordance issue not already identified, another race condition noticed while investigating the 401 case, or anything else — must be isolated and proposed as its own future Brief, never folded into this cycle's fix.

---

Brief ready. Next step: /brainstorming.
