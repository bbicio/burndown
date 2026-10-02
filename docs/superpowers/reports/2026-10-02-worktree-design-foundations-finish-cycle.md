# Finish-cycle report — worktree-design-foundations

**Date:** 2026-10-02
**Branch:** worktree-design-foundations → main (merge `38f8b6e`, pushed)

## What was done

Cycle A of the UI redesign (foundations), from the Claude Design handoff `docs/superpowers/design/2026-10-02-foundations-handoff.md`. Frontend only: no `api/` change, no migration, `pdash-api` not restarted.

- `5487e7c` docs: design foundations (Cycle A) handoff, brief and spec
- `8d88e01` feat: design foundations tokens (status, chart, focus, typography, AA stage text) — `css/tokens.css`, `js/lib/tokens.test.js`
- `56eb6cf` feat: unify project status badge colours on `--status-*` tokens — `js/core.js`
- `ee00b64` feat: burndown chart colours come from chart tokens — `portfolio.html` (`chartColor()`)
- `6f117ab` feat: token-driven buttons, spinner and Bootstrap overrides in `style.css`
- `0c1f854` feat: `admin-crud.css` and public pages use foundation tokens
- `a623a20` chore: bump `?v` for `tokens.css` (8), `style.css` (15), `admin-crud.css` (2), `core.js` (10)
- `25ceaa8` chore: exact-match literal pass, align spec with the build, add literals inventory
- `4e52bf5` docs: design foundations (Cycle A) implementation plan

Tests: `npm test` 374/374 (new: `js/lib/tokens.test.js` — token presence, no token removed, WCAG AA contrast of stage/status/semantic pairs; `js/lib/foundations-guard.test.js` — badges, chart colours, `style.css`/`admin-crud.css`/public pages, exact-match literals, one `?v=N` per asset).

## Gates

- Gate 1: passed (frontend only, Docker backend suite skipped: no `api/` in the diff).
- Gate 2: isolated stack spun up on request; the user verified in the browser and answered "verificato"; stack torn down only after that answer.
- Gate 3: `/code-review` medium, round 1, no findings. The reviewer did not read the new test files, the docs or the small page-level `?v` edits and ran no tests (the author ran the suite).
- Gate 4: DB backup taken (`backups/pdash-backup-2026-10-02-145830.dump`), merge `--no-ff`: **add/add conflict** on `docs/superpowers/specs/2026-10-02-design-foundations-design.md` (the spec had been committed on `main` first and then amended on the branch); resolved with the branch version after explicit confirmation, then pushed. Worktree and local branch removed.

## Rulings made during execution

- The plan's cache-busting test counted prose mentions of `js/core.js` as unversioned references; restricted to `src`/`href` attributes.
- The plan had no task for the spec's exact-match literal replacement in `style.css` (`#fff`) and the public pages' `<style>` blocks; added with a guard test first.
- Spec amended to match the build: button focus ring stays Bootstrap's (`--focus-ring` is 12 % alpha, used for form-control focus only), `--z-tooltip` defined but not applied (Bootstrap's tooltip is 1080; 800 would put tooltips under modals), modal variables on `.modal`, `.btn-danger` already exists in Bootstrap.
- Handoff corrections found by checking the code: `--brand-mid`/`--brand-dark` are used (`costgrid.html`); `tokens.css` is versioned (CLAUDE.md said exempt); the handoff's contrast figures were wrong (Canceled actually fails AA) and its proposed `--status-*` values failed AA; `#d01f6a` was also in `admin-crud.css` and three public pages.

## Code review follow-ups

None.

## Roadmap notes

- **Cycle B (navigation):** the global `.dropdown-menu` override (radius 8px, `--shadow-md`) also changes the navbar's Admin/account menus; `rgba(255,255,255,…)` navbar alphas and the `#fdf0f5`/`#f9e8f0`/`#f8f9ff` tints in `style.css` were left for it.
- White text on `--brand-magenta` buttons is 3.97:1, below AA for normal text — brand decision pending, deliberately unchanged.
- ~800 hardcoded literals in other pages and JS template strings → page-by-page cycles; inventory in `docs/superpowers/reports/2026-10-02-design-foundations-literals-inventory.md`.
- `.btn-ghost` and `.btn-icon` are defined but unused; the style tile promised by the handoff was never delivered.
- Process: a Claude Design handoff worked as the Brief's input but its claims about the code were partly wrong — now written into `PROCESS.md`.
- Tooling: `ExitWorktree remove` refuses a worktree re-entered via `EnterWorktree({path})` (which the merge step forces); `git worktree remove --force` after `ExitWorktree keep` worked. Inside a worktree-isolated session the shell tool refuses compound commands.
- Docs-sync detail: a unit test for `statusBadge` behaviour in jsdom was not added (core.js is a classic script; the guard reads its source instead).

## Sync-docs outcome

- `CLAUDE.md`: corrected the cache-busting rule (`tokens.css` is versioned, `?v=8`, guarded by `foundations-guard.test.js`), `core.js?v=10`, new "Design foundations" paragraph under "Design tokens", `tokens.css` entry in the file structure.
- `ARCHITECTURE.md`: `tokens.css` and `style.css` entries in the directory structure (short, pointing to CLAUDE.md).
- `docs/js/core.md`: status badges now on `--status-*` tokens.
- `docs/pages/portfolio.md`: new section on the burndown chart colours (`chartColor()`).
- `docs/superpowers/PROCESS.md`: gate answered **yes** (condition 2/3: a recurring input to the Brief phase — a Claude Design handoff — for the whole redesign series); new "handoff di design" note.
- `TEST_CASES.md` / `test-cases.html` / `test-api.js`: not changed — no new API endpoint or user flow; the coverage is automated vitest guards, not manual cases.
- `PRD.md`: evaluated, not necessary (visual restyle with no change to what a user can do or see functionally; the operational-manual skill reference is therefore untouched).

## Memory outcome

- New `project_ui_redesign_cycles.md` (state of the redesign series, agreed order, handoff process, open items) + its `MEMORY.md` line.
- `project_team_ux_backlog.md`: the cancelled navigation-audit paragraph now points to the new Claude Design route.
- `feedback_worktree_removal.md` (+ `MEMORY.md` line): added the `ExitWorktree remove` refusal case and the fallback that worked, plus the compound-command refusal.
- Unverified: none.
