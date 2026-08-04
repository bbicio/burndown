# Finish-cycle report — worktree-double-submit-remaining-candidates

**Date:** 2026-08-04
**Branch:** worktree-double-submit-remaining-candidates → main

## What was done

1 commit:

- `346642d` fix: guard `cgCreateNewGrid()` and `cgCloneGrid()` against rapid repeat clicks

Cycle 4 of the double-submit roadmap: investigated the three remaining not-yet-confirmed candidates from earlier cycles' Roadmap notes.

**Two real gaps found and fixed** — `#btnCgCreateGrid` (pipeline.html's "+ New Proposal" flow) and `#btnCgClone` (Clone, wired identically on both `pipeline.html` and `costgrid.html`) had plain `addEventListener` click handlers calling `cgCreateNewGrid()`/`cgCloneGrid()` (`js/costgrid.js`) directly, with zero disabling. Both create a real cost grid + version via the API on every invocation, so a fast double-click created a duplicate proposal/clone. Neither routes through `showConfirm()`, so Cycle 3's general fix didn't cover them. Fixed with the same guard-and-disable idiom used throughout this roadmap: disable the trigger button synchronously (after only the purely-synchronous validation), wrap the async body in `try/finally` so it re-enables on every exit path. Since both functions are shared globals used identically by both pages, the fix protects both automatically.

**Two candidates investigated and confirmed NOT to have a real gap**, left untouched:
- `portfolio.html`'s Load Actuals trigger opens a native OS file-picker (`fileInput.click()`) — inherently blocking, can't be "double-clicked" through. The only overlap scenario is a user deliberately starting a second, different upload while the first is still in flight — legitimate concurrent behavior, not a duplicate-submission bug.
- `costgrid.html`'s Generate Project flow (`cgConfirmAndGenerate()`/`cgDoGenerateProject()`) uses a native, page-blocking `prompt()` for the project name, and the actual state-mutating logic after it runs fully synchronously in one tick (the API push is fire-and-forget, never awaited) — no window for a second click to re-enter. `_cgEnsureAddToProjectModal()`'s Confirm button hides the modal as its first synchronous statement, before any `await`, so a second click has nothing visible left to land on.

Verified interactively against a real running stack: 3 overlapping calls to each of `cgCreateNewGrid()` and `cgCloneGrid()` (fired without awaiting the first) resulted in exactly one new cost grid each (confirmed via `cgGetIndex().length` before/after), not three; the trigger button was confirmed disabled mid-flight (`btn.disabled === true` synchronously) and correctly re-enabled after.

## Code review follow-ups

None. The diff is a faithful refactor (re-indentation for the `try/finally` wrap) plus the guard addition — no changes to existing logic, confirmed by comparing the diff structurally against the pre-change function bodies.

## Roadmap notes

This closes Cycle 4 of the 5-cycle roadmap:
1. ~~Legacy JS standalone functions~~ — done.
2. ~~`costgrid.html`'s `saveVersion`/`publishDraft`~~ — done.
3. ~~The shared `showConfirm()` modal~~ — done.
4. ~~Remaining candidates (Load Actuals, New Proposal/Clone, Generate Project)~~ — **done, this cycle** (2 real fixes, 2 confirmed non-issues).
5. Closing `domain-audit` pass — the only remaining step. With this cycle's investigation, the known candidate list is now exhausted; Cycle 5's job is to confirm nothing was missed by a systematic sweep, not to investigate specific named candidates.

No new findings surfaced this cycle beyond the two confirmed-safe mechanisms documented above (native `prompt()`/file-picker blocking, and synchronous-before-first-`await` modal hiding) — worth remembering as *general* safe patterns for any future button/action audit in this codebase, not just for this roadmap.

## Sync-docs outcome

- **CLAUDE.md** — updated: `js/costgrid.js`'s entry now documents both new guards (`cgCreateNewGrid()`, `cgCloneGrid()`) and explicitly records why the two investigated-but-not-fixed flows (Generate Project, Add to Project) don't need one — future readers won't need to re-derive this.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: two new cases added, `CG-56` ("+ New Proposal" repeat-click) and `CG-57` (Clone repeat-click).
- **ARCHITECTURE.md** — not touched. No DB/API/Docker-topology change.
- **test-api.js** — not touched. No API endpoints changed.
- **PRD.md** — evaluated, left untouched. Makes existing create/clone actions safer against a user-error pattern; doesn't add, remove, or change any user-facing feature or flow the PRD describes.
- **docs/superpowers/PROCESS.md** — evaluated via the gate, left untouched. The lightweight process deviation (investigation + inline design + explicit user confirmation, no formal Brief/Spec/Plan) was consistent with the prior three cycles of this same roadmap; none of the three trigger conditions applied.
