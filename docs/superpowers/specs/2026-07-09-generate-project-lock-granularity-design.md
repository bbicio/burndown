# Generate Project Lock Granularity — Design Spec

**Source:** `docs/superpowers/audits/2026-07-09-proposal-project-status-lock-audit.md`, Finding F4. Brief: `docs/superpowers/specs/2026-07-09-generate-project-lock-granularity-brief.md`.

## Problem

`cgGetVersionLockState` (`js/costgrid.js:105-130`) locks a proposal version (hides "Generate Project", disables the whole editor via `cgApplyEditorLock`) the moment **any single** linked project reaches pipeline `Committed`:

```js
const hasCommitted = (thisVer?.linkedProjects || []).some(lp => {
  const proj = (config.projects || []).find(p => p.id === lp.projectId);
  return proj?.pipeline === 'Committed';
});
```

This reads the pipeline of the **generated project** (`proj.pipeline`), not the proposal itself, and ignores whether other tasks in the same version are still unmapped. Reported consequence: a version with 3 tasks, 1 already mapped to a project that reached Committed, becomes fully read-only — blocking generation of a second project for the 2 remaining tasks.

## Resolved design decision

Established in `/brainstorming` (this session):

- **"Committed" is a proposal-level concept, not a project-level one.** The correct trigger is the proposal version's own `pipeline` field (`v.pipeline`, visible on the pipeline board), not any individual generated project's `pipeline`. This is consistent with `getProjectPipeline()` (`js/core.js:315-328`), the codebase's own documented "source of truth" resolver, which already treats the cost grid version's pipeline as authoritative over a linked project's own field whenever a `costGridRef` exists. The current code bypasses that resolver — it reads `proj?.pipeline` directly.
- **The task-level lock is binary, not granular per row.** It fires only once **every** task in the version has been migrated to a project **and** the proposal is Committed — by construction, there is no partial state to represent (if the condition is true, every task is already migrated, so a whole-editor lock is correct and no per-row distinction is needed).
- **New-version creation lock is unrelated and already correct.** `js/costgrid.js:390-391` (`newVerBtn.style.display = isDraft ? '' : 'none'`) already blocks creating new versions once a proposal leaves `Draft` — verified during brainstorming, not part of this fix.
- **The `other-version-active` reason is unrelated and already correct.** It stays a whole-version lock (a sibling Draft version was superseded once a different version generated a project) — untouched.

Operational flow this satisfies (confirmed step-by-step with the user): multiple sibling versions can exist and be freely edited only while `Draft`; once promoted past `Draft`, new-version creation is blocked (existing behavior); "Generate Project" stays visible and the editor stays fully editable for as long as any task remains unmapped, regardless of the proposal's own Committed status; the whole-editor lock fires only once every task is mapped **and** the proposal is Committed.

## Design

### New module: `js/lib/costgrid-calc.js`

Following the existing `js/lib/status-rules.js`/`js/lib/planning-calc.js` convention (native ES module, `window.*` bridge):

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

`versionHasFreeTasks` is a version-object-parametrized equivalent of the task-assignment check already inlined in `renderCostGridEditorView` (`js/costgrid.js:381-384`, using `cgGetAssignedTaskIds`/`cgGetAssignedTaskNames`, which read the `_cgDraft` global). It cannot reuse those functions directly: `cgGetVersionLockState` is also called for versions that are not the currently-open `_cgDraft` — notably from the pipeline board's card list (`js/costgrid.js:228`, looping over every visible proposal's versions to render each card's 🔒 badge), where no `_cgDraft` exists for most of those versions. The existing `renderCostGridEditorView` computation (lines 381-384) is left untouched — it already works correctly for the active draft and is out of scope for this fix.

### Integration: `js/costgrid.js:105-130` (`cgGetVersionLockState`)

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

Only the `hasCommitted` block changes (condition and message text). No other line in `cgGetVersionLockState` changes.

### Why nothing else needs to change

Every consumer of `lockState`/`isLocked` (Generate Project button visibility `js/costgrid.js:387`, the lock banner `js/costgrid.js:395-399`, `cgApplyEditorLock` `js/costgrid.js:890`, the pipeline-board card badge `js/costgrid.js:229`, the version-tab badge `js/costgrid.js:344-351`) already reacts correctly to `lockState.locked`/`.message` — they were never the source of the bug. The bug was entirely in *when* `locked` became `true` for the `committed` reason. Fixing that condition alone fixes every downstream consumer simultaneously:

- The Generate Project button's existing condition (`isLocked || isDraft || !hasFreeTasks`) is now correct without modification: the `committed` reason of `isLocked` can only become `true` when `!hasFreeTasks` is already `true` (by construction of `isVersionCommittedLocked`), so it can never cause the button to hide while tasks remain unmapped — which was the reported bug.
- `cgApplyEditorLock`'s whole-body disable is correct to keep as whole-body: it only fires once every task is already migrated, so there is no partially-editable state to preserve.

## Error handling

`isVersionCommittedLocked`/`versionHasFreeTasks` are pure functions with no I/O. `isVersionCommittedLocked` short-circuits via `ver?.pipeline` (optional chaining), so an unexpected `undefined`/`null` version (e.g. `thisVer` not found because `versionId` doesn't match any version) returns `false` — same as today's behavior (`thisVer?.linkedProjects || []` also degrades gracefully).

## Testing

New `js/lib/costgrid-calc.test.js` (vitest, no DOM needed — pure functions):

- `versionHasFreeTasks` returns `true` when a task has no matching entry in any `linkedProjects[].taskIds`/`taskNames`.
- `versionHasFreeTasks` returns `false` when every task is covered (matching across **multiple** `linkedProjects` entries — the "one task each → multiple projects" case).
- `versionHasFreeTasks` returns `false` when multiple tasks map to the **same** `linkedProjects` entry (the "many tasks → one project" case).
- `isVersionCommittedLocked` returns `false` when `pipeline !== 'Committed'`, regardless of task-mapping state.
- `isVersionCommittedLocked` returns `false` when `pipeline === 'Committed'` but at least one task is unmapped — the exact case that reproduces the original bug's failure mode (this is the characterization test for F4).
- `isVersionCommittedLocked` returns `true` only when both `pipeline === 'Committed'` and every task is mapped.

**Not automated** (DOM-render call sites, same precedent as prior cycles): the `cgGetVersionLockState` integration itself, and its consumers (button visibility, banner, `cgApplyEditorLock`, badges). Verified via manual code-trace (this design's "Why nothing else needs to change" section) confirming every consumer's existing logic is already correct once fed the corrected `lockState`.

## Documentation

`PRD.md:155-156` documents the old rule ("A version is locked when: (a) a Committed linked project exists..."). Per the Brief's constraint, this is updated via `/sync-docs` as part of `/finish-cycle`, not authored directly in this plan.

## Explicitly out of scope

- F1, F2, F3 — separate cycle, already merged (`docs/superpowers/specs/2026-07-09-status-vocabulary-reconciliation-design.md`).
- The broader question of whether other direct `.pipeline` reads on project objects (found via a quick grep during brainstorming: `js/costgrid.js:156`, `js/pipeline-board.js:64`, `js/planning.js:450,469`, among ~38 total hits) should instead use `getProjectPipeline()`. Explicitly deferred to a dedicated `/domain-audit` after this cycle, per the user's decision during brainstorming — not investigated further here beyond the initial grep count.
- Any change to `renderCostGridEditorView`'s existing `hasFreeTasks` computation (`js/costgrid.js:381-384`) — left untouched; only a new, separately-parametrized equivalent is added for `cgGetVersionLockState`'s use.
- Any change to the `other-version-active` lock reason or the `isDraft`-gated new-version-creation block — both verified correct during brainstorming, not touched.
- Retroactive migration of versions already locked under the old rule — no such migration is needed or requested.
