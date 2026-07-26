# Brief — Dead code cleanup (post Vue-migration-roadmap)

**Scenario:** Audit → fix (Scenario 3 per `docs/superpowers/PROCESS.md` §2). Source: `docs/superpowers/reports/2026-07-27-vue-migration-roadmap-cold-review.md`, "Cycle A — Dead-file cleanup" recommendation, items 7, 8, 9, 11 — plus one new finding (`app.js`, item 17 below) discovered while drafting this Brief and explicitly confirmed in-scope by the user rather than silently folded in.

This Brief does not re-derive whether these findings are real — that verification was already done, independently, in the cold-review report and re-confirmed with fresh `grep` checks immediately before writing this Brief (see citations below). This Brief only defines the fix.

## Problem

Five confirmed-unreachable code artifacts remain in the repo, all residue from completed Vue migrations (or, in `app.js`'s case, pre-dating the codebase's original modularization into per-page `.js` files):

- **Finding #7 (cold review)** — `js/dashboard.js` (per-project KPI/burndown rendering, ~49KB). Orphaned since the `portfolio.html` Vue migration cycle (2026-07-19), which folded its logic into that page's Vue instance and stopped loading the file. `grep -rn "dashboard\.js" --include="*.html" --include="*.js" .` returns zero `<script src>` references anywhere — the only hits are historical citation comments in `js/lib/portfolio-calc.js`/`.test.js` explaining where the extracted math came from.
- **Finding #8 (cold review)** — `js/config-form.js` (project config form + rollback/snapshot logic, ~63KB). Was still loaded by `planning.html` as of the `portfolio.html` cycle's report (flagged there as an "open question" whether it was live or vestigial); the `planning.html` Vue migration cycle just closed (2026-07-27) investigated it, confirmed it dead there too (no reachable `#configModal`), and dropped the `<script>` tag. `grep -rn "config-form\.js" --include="*.html" --include="*.js" .` now returns zero `<script src>` references — remaining hits are historical citation comments in `js/lib/cfg-parse.js`/`.test.js` and one comment in `project-config.html`.
- **Finding #9 (cold review)** — `js/main.js` (~467 lines, 20.7KB). No `<script src="js/main.js">` reference in any `.html` file, and (re-verified for this Brief) zero references of any kind anywhere in the repo, not even historical comments.
- **New finding, discovered while drafting this Brief, user-confirmed in-scope** — `app.js` (repo root, **5264 lines, 259KB**). Confirmed via `git log --oneline -- app.js` to be untouched since the single `initial: add PDash project files` commit — the original pre-modularization monolith (defines module-level state like `timesheetData`, `config`, `burndownChartInst`, `planningViewMode`, etc., since superseded by the per-page split into `js/core.js`, `js/planning.js`, `js/portfolio.js`, etc.). Zero references in any `.html` file, `nginx.conf`, `docker-compose.yml`, or `package.json`.
- **Finding #11 (cold review)** — `openPlanningAiAnalysis()`, a single function inside `js/ai.js:515` (a file that otherwise **is** live and loaded by every authenticated page). `grep -rn "openPlanningAiAnalysis" --include="*.html" --include="*.js" .` finds exactly two definitions — `app.js:4859` (inside the file being deleted above) and `js/ai.js:515` — and zero call sites anywhere.

None of these five are referenced by nginx's static-file serving config, Docker Compose, or any build/test tooling — deleting them has no runtime effect on any page.

## Expected behavior

- `js/dashboard.js`, `js/config-form.js`, `js/main.js`, and `app.js` (repo root) are deleted from the repo.
- `openPlanningAiAnalysis()` (`js/ai.js:515-...`) is removed from `js/ai.js`; the rest of that file (which is genuinely loaded and used) is untouched.
- No page's behavior changes — every one of these five artifacts is confirmed to have zero live callers/loaders today.
- Documentation (`CLAUDE.md`, `ARCHITECTURE.md`) no longer lists these as files present in the repo; any stale cross-reference to them (e.g. `js/core.js`'s or other files' comments that still mention `js/config-form.js`/`js/dashboard.js`/`js/main.js`/`app.js` by name) is updated to reflect their removal.

## Constraints

- **Verify-before-delete, per file, at execution time — not just at Brief time.** The grep evidence above is current as of 2026-07-27, but this cycle's implementer must re-run the same reference checks (`grep -rn "<filename>" --include="*.html" --include="*.js" .` at minimum, plus a check of `nginx.conf`/`docker-compose.yml`/`package.json`/`api/`) immediately before each deletion, since the repo may have changed between Brief-writing and execution.
- **No behavior change is acceptable.** If any check surfaces even one live reference to one of these five artifacts that wasn't accounted for here, stop and treat it as a new finding for this cycle's `/brainstorming` to resolve (see the REQUIRED reminder below) — do not delete that specific artifact and do not silently work around the discovery.
- This project's own established convention (noted in multiple prior migration-cycle reports) was to leave orphaned files in place *during* a migration cycle to keep that cycle's diff minimal and reviewable. This cycle is the deliberate, dedicated exception to that convention — its entire purpose is the deferred cleanup, not a side effect of unrelated work.
- Match this project's existing test/verification conventions: run `npm test` before and after the deletions (frontend vitest suite) to confirm no test file imports any of the five artifacts. `app.js`/`js/main.js`/`js/dashboard.js`/`js/config-form.js` are classic (non-module) scripts with no `export`, so no `js/lib/*.test.js` file can import them directly — but the check should still be run, not assumed.

## Acceptance criteria

- [ ] `js/dashboard.js` deleted; `git log`-confirmed zero remaining references anywhere in the repo (excluding this cycle's own commit history/report).
- [ ] `js/config-form.js` deleted; same confirmation.
- [ ] `js/main.js` deleted; same confirmation.
- [ ] `app.js` (repo root) deleted; same confirmation.
- [ ] `openPlanningAiAnalysis()` removed from `js/ai.js`; the file still parses/loads correctly on every page that loads it (manual smoke check: open any authenticated page, confirm no console error from `js/ai.js`).
- [ ] `npm test` passes with the same test count as before this cycle (no test was silently relying on any of these five artifacts).
- [ ] `CLAUDE.md`/`ARCHITECTURE.md` no longer list any of the four deleted files in their file-structure/file-tree sections; any other stale comment referencing them by name (in still-live files) is updated or removed.
- [ ] `/finish-cycle`'s Gate 2 manual verification: spot-check that `portfolio.html`, `project-config.html`, and `planning.html` (the three pages that used to load one of the now-deleted files) still function identically — no page depended on any of these five artifacts, but this is the cheapest possible regression check given the low but non-zero risk of a missed reference.

## Explicitly excluded scope

- **Every other item from the cold-review report's backlog** (Cycle B — `js/costgrid.js`'s eventual fate; Cycle C — pipeline/cost-grid product decisions; Cycle D — phasing-panel rounding and Export-XLS-ExcelJS bugs; the `initNav()` no-error-banner gap; the static-file bind-mount documentation gap) — none of these are touched by this cycle. This cycle is scoped exclusively to the 5 confirmed-dead-code artifacts listed above.
- **The Roles/Clients/Programs Registry modal consolidation** (`config.html`'s own Vue CRUD vs. the dead `#rolesModal`/`#roleModal`/`#programsModal` markup already removed from HTML in earlier cycles) — that markup is already gone; this cycle only removes the *script files*, and does not touch `js/roles.js`/`js/clients.js`/`js/programs.js`/`js/ratecards.js`, which remain genuinely loaded and used by 5 pages.
- **Any other function-level dead-code sweep of `js/ai.js`** beyond `openPlanningAiAnalysis()` specifically — no other function in that file was flagged as dead by the cold review or by this Brief's own verification.
- **Any behavior change, refactor, or "while we're in there" cleanup** of any file this cycle touches — this is a pure subtractive cycle.

## Required reminder (Scenario 3 guard, per `audit-to-brief`)

Any new finding discovered during this cycle's `/brainstorming` or execution — a reference to one of these five artifacts this Brief's verification missed, or an unrelated dead-code artifact noticed along the way — must be isolated and proposed as its own future Brief. It must never be folded into this cycle's fix, even if it looks small or clearly related. (This Brief itself is a case in point: the `app.js` finding was surfaced this same way, mid-drafting, and only added to scope after explicit user confirmation — not silently.)

---

Brief ready. Next step: /brainstorming.
