# Finish-cycle report — worktree-project-config-actuals-block

**Date:** 2026-09-07
**Branch:** worktree-project-config-actuals-block → main

## What was done

9 commits:

- `fca88d9` docs: add brief + design for project-config.html Actuals block rework
- `958cfd5` docs: add implementation plan for project-config.html Actuals block rework
- `1637391` feat: rename Load Actuals, move Delete actuals into Actuals block with real server delete
- `76b5456` fix: avoid re-fetching actuals after delete to sidestep a visibleCodes() 403 on admin
- `5317a60` feat: add actuals View modal to project-config.html
- `7af188b` feat: replace actuals CSV export with XLSX download in project-config.html
- `202b2ed` feat: redirect Save to the saved project's detail view instead of the portfolio list
- `a2a1365` docs: correct now-disproven project.id claim in design/brief for new-project creation
- `ad896b2` fix: resolve final review findings — reforecastVisible reset, ExcelJS guard, Delete-actuals gate, delete confirmation

**Feature summary:** `project-config.html`'s Actuals section was brought in line with `timesheets.html`'s already-shipped View/Fee-Spent/XLSX pattern (a prior cycle) and `portfolio.html`'s "Load Actuals" wording: `⬆ Upload XLS` renamed `📂 Load Actuals`; a new `👁 View` modal lists imported rows with Fee/Spent; `⬇ Export CSV` replaced by `⬇ Download actuals` (ExcelJS `.xlsx`); `🗑 Clear XLS data` (previously a local-cache-only no-op, in a different form section) removed and replaced by `🗑 Delete actuals` in the Actuals section — now a real `DELETE /api/timesheets/:projectCode`. Saving the form now redirects to the saved project's own detail view instead of the bare portfolio list.

Two pre-existing backend/data-flow bugs were discovered during implementation and live verification, not introduced by this branch, and deliberately not fixed here (see Roadmap notes) — both are also now noted as correction blockquotes directly in this cycle's own brief/design docs.

## Code review follow-ups

- **Final review (accepted, not fixed):** `buildActualsFilename()`'s sanitize helper duplicates `timesheets.html`'s `sanitizeForFilename()` verbatim instead of sharing it — pure style/DRY, no functional risk.
- **Final review (accepted, not fixed):** the View modal's `fmtMoney(row.fee || 0, project.currency)` calls pass a second argument that this page's own local, single-argument `fmtMoney(amount)` silently ignores (it reads `this.project.currency` internally) — harmless today, but reads as if currency were being explicitly overridden. Same finding was raised once already during Task 2's own review.
- **Final review (accepted, not fixed):** the 8-column shape (Date/Owner/Role/Task/Hours/Notes/Fee/Spent) and the `Spent = fee * hours` calculation are hand-typed twice — once in the View modal's DOM table, once in the XLSX-export builder — with no shared constant. Different rendering targets (DOM cells vs. `ws.addRow(...)`), currently in sync.

## Roadmap notes

1. **CRITICAL — new-project creation via `project-config.html` never persists to the server.** `BLANK_PROJECT()` (`project-config.html:373`) initializes a brand-new project's `id` to `''` (never a generated UUID), and `_pushProjectToApi()`'s own guard (`if (!project?.id) return;`, `js/api-sync.js:241`) silently no-ops before ever calling `Api.projects.create()`. Clicking Save on a new project currently does nothing server-side — no error is shown, the user is simply redirected without the project having been created. This predates this branch entirely (this cycle's own design doc originally, incorrectly, assumed `project.id` was already populated for new projects — corrected in-place in the brief/design after discovery, see commit `a2a1365`). Needs a dedicated cycle: likely fix is generating a real id (`crypto.randomUUID()`) in `resolveProject()`'s new-project branch before any save path can run.
2. `api/src/routes/timesheets.js`'s `visibleCodes()` (admin branch) sources the list of project codes an admin can see from `SELECT DISTINCT project_code FROM timesheets` — i.e. codes that currently HAVE at least one row — rather than from `projects.code`. Once a project code's last row is deleted, `GET /api/timesheets/:projectCode` 403s for admins immediately afterward. This cycle worked around it in `project-config.html`'s `onDeleteActuals()` (sets the "no actuals" UI state directly instead of re-fetching via `loadActuals()`) rather than fixing the source. Predates this branch (also affects `timesheets.html`'s own delete flow, worked around identically there in an earlier cycle).
3. `api/src/routes/timesheets.js:212`'s `DELETE /:projectCode` non-admin authorization check compares the route parameter against `projects.name` instead of `projects.code` — a pre-existing bug (predates this branch), but this branch newly *exposes* it: `Delete actuals` on `project-config.html` is reachable by non-admin owners/editors (unlike `timesheets.html`, which is admin-only), so a non-admin owner of a project whose `name` differs from its `code` (the normal case) would get a 403 attempting to delete their own project's actuals. Not verified live in this cycle (all live verification used an admin account); flagged for the same dedicated backend cycle as item 2.

## Sync-docs outcome

- **CLAUDE.md** — updated: the `project-config.html` file-tree entry now describes the reworked Actuals section (button renames, View modal pattern, XLSX export, real delete + its `reforecastVisible`/state-reset side effects, the discovered `visibleCodes()` 403 workaround) and the Save-redirect change, explicitly flagging the new-project-creation bug as unresolved.
- **PRD.md** — updated: §7.1 (Project Configuration) gained a new "Actuals section" subsection documenting the 4 buttons and their current behavior — this page's Actuals UI had no PRD coverage at all before this cycle.
- **TEST_CASES.md** / **test-cases.html** — updated in lockstep: added PC-14 through PC-18 (View popup, XLSX download, real delete + Reforecast-visibility reset + DB verification, Delete-actuals hidden on new-project flow, Save redirect to project detail).
- **test-api.js** — not touched: no new API endpoints, no auth-rule change (`DELETE /api/timesheets/:projectCode` already existed and is unchanged).
- **ARCHITECTURE.md** — not touched: no schema/API-reference/architectural-pattern change (frontend-only rework of an existing page, reusing existing endpoints).
- **docs/superpowers/PROCESS.md** — not touched: gate evaluated as none of the 3 conditions apply (no process-skill change, no recurring process exception introduced, no change to the 7-phase skeleton or scenario guardrails).
