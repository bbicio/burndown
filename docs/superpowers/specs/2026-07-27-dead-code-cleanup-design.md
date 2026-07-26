# Dead Code Cleanup — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-27-dead-code-cleanup-brief.md`. Scenario 3 (Audit → fix), originating from `docs/superpowers/reports/2026-07-27-vue-migration-roadmap-cold-review.md`'s Cycle A recommendation, plus one new finding (`app.js`) surfaced and confirmed in-scope during Brief-writing.

## Problem

Five confirmed-unreachable code artifacts remain in the repo — residue from completed Vue migrations, or (for `app.js`) pre-dating the codebase's original modularization:

- `js/dashboard.js` — orphaned since the `portfolio.html` Vue migration (2026-07-19).
- `js/config-form.js` — orphaned since the `planning.html` Vue migration (2026-07-27).
- `js/main.js` — orphaned, zero references anywhere.
- `app.js` (repo root, 5264 lines) — the original pre-modularization monolith, untouched since the repo's initial commit.
- `openPlanningAiAnalysis()` (`js/ai.js:515`) — a dead function inside an otherwise-live file, zero call sites.

All five were independently re-confirmed via `grep` immediately before this Brief was written (see the Brief for exact commands/output). None are referenced by `nginx.conf`, `docker-compose.yml`, `package.json`, or any test file.

## Architecture

No architectural change — this is a purely subtractive cycle. Four whole-file deletions plus one function removal from a file that otherwise stays untouched. No new files, no new abstractions, no behavior change to any live page.

## Components (single task)

Given the mechanical nature and absence of interdependencies between the five removals, this cycle is a single task:

1. **Re-verify each of the 5 targets immediately before deleting** — re-run the same reference checks from the Brief (`grep -rn "<filename>" --include="*.html" --include="*.js" .`, plus a check of `nginx.conf`/`docker-compose.yml`/`package.json`/`api/`) against the current state of the repo, not the Brief's already-stale-by-then snapshot.
2. **Delete the 4 files**: `js/dashboard.js`, `js/config-form.js`, `js/main.js`, `app.js`.
3. **Remove `openPlanningAiAnalysis()`** from `js/ai.js` (the function body only — everything else in that file is genuinely live and stays untouched).
4. **Run `npm test`** — expect the same test count/pass rate as immediately before this cycle's changes (no test imports any of these five artifacts, since none export anything and none are `js/lib/*` modules).
5. **Update `CLAUDE.md`/`ARCHITECTURE.md`**: remove file-tree/file-structure entries for the 4 deleted files; sweep for and update any stale comment in a still-live file that references one of the five by name (the Brief already found a few purely historical citation comments in `js/lib/cfg-parse.js`/`.test.js`, `js/lib/portfolio-calc.js`/`.test.js`, and `project-config.html` — these are fine to leave as-is since they're explanatory provenance notes, not incorrect claims about current file existence, but should be spot-checked during this step).

## Data flow

None — no runtime data path touches any of these five artifacts today.

## Error handling

If the pre-deletion re-verification (step 1) finds even one unexpected live reference to one of the five targets, stop immediately: do not delete that specific artifact, do not work around the discovery, and isolate it as a new finding for a future `/brainstorming` cycle to resolve (per the Brief's Scenario 3 guard). The other four targets, if independently clean, may still proceed.

## Backward compatibility

No behavior change for any page. `portfolio.html`, `project-config.html`, and `planning.html` (the three pages that used to load one of the now-deleted files, before their own respective Vue migrations already dropped the `<script>` tags) are the cheapest spot-check: confirm they still render and function identically post-deletion, since they're the pages with the closest historical relationship to these files, even though none currently load them.

## Testing

`npm test` before and after (same pass count expected). Manual post-merge smoke check on `portfolio.html`, `project-config.html`, and `planning.html` — open each, confirm no console error, confirm core functionality (KPIs/burndown on portfolio, form load/save on project-config, resource planning table on planning) still works. No automated test coverage is expected to change, since none of the five artifacts were under test.

## Explicitly out of scope

- Every other item from the cold-review report's backlog (Cycle B — `js/costgrid.js`'s eventual fate; Cycle C — pipeline/cost-grid product decisions; Cycle D — phasing-panel rounding and Export-XLS-ExcelJS bugs; the `initNav()` no-error-banner gap; the static-file bind-mount documentation gap).
- The Roles/Clients/Programs Registry modal consolidation (`js/roles.js`/`js/clients.js`/`js/programs.js`/`js/ratecards.js` stay untouched — genuinely live).
- Any other function-level dead-code sweep of `js/ai.js` beyond `openPlanningAiAnalysis()`.
- Any behavior change, refactor, or incidental cleanup of any file this cycle touches.
