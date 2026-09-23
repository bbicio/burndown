# js/ai.js

AI sidebar chat + project analysis.

This file holds the full implementation narrative for `js/ai.js` — function-by-function detail, cycle-by-cycle fixes, first-attempt bugs. `CLAUDE.md`'s File structure entry keeps only a one-line pointer; when working on this file, read this file, not that line, for the detail. See `/sync-docs`'s routing rule for where future changes to this file should be written.

## showInfo adoption (2026-07)

`aiPlanSend()`'s and `openAiAnalysis()`'s no-API-key dialogs (English and Italian) both use `showInfo()` (`js/core.js`) rather than `showConfirm()` — neither is a yes/no choice, so the single-button variant matches the actual affordance.

## Double-submit guard (2026-08)

`aiPlanSend()` guards against a fast repeat click (`if (sendBtn.disabled) return;` as its first statement) — previously the button was only disabled after the no-API-key/empty-message checks, so a double-click before those checks completed could re-enter the function; every early-return path now re-enables the button before returning, not just the success/error `finally`.

## Null-safety fixes (2026-08, 3-cycle series)

`buildPlanningContext()` (feeds the `planning.html` AI sidebar) matches timesheet records to task/role via the shared `matchesTaskRole()`/`computeResidual()` (`js/lib/planning-calc.js`, window-bridged) rather than raw `===` comparisons — brings it in line with the resource-planning grouping views' already-fixed matching logic (case-insensitive, null-safe). `buildResourceAllocationSummary()` (a second, independent AI-context builder with its own divergent matching logic) was deleted in the same fix — confirmed to have zero callers anywhere in the codebase.

`buildProjectSummary()` (used by `openAiAnalysis()` on `portfolio.html`)'s TASK BREAKDOWN task-only match is now null-safe too (`(r.task || '').toLowerCase() === (task.name || '').toLowerCase()`) — no `js/lib/planning-calc.js` dependency needed since it's a task-only match (no role dimension), same inline idiom as `buildPlanningContext()`'s equivalent fix.

During manual verification of this fix, a separate, wider-blast-radius null-safety bug was found in `js/core.js`'s `findRate(row, cfg)` that threw on the same class of missing-field input and actually fired *before* `buildProjectSummary()`'s own match would — deliberately left unfixed in this cycle and applied in a dedicated follow-up cycle, see `docs/js/core.md`.
