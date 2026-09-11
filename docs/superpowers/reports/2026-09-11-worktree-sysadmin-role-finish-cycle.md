# Finish-cycle report — worktree-sysadmin-role

**Date:** 2026-09-11
**Branch:** worktree-sysadmin-role → main

## What was done

9 commits (subagent-driven-development execution, `docs/superpowers/plans/2026-09-11-sysadmin-role.md`):

- `fe094d3` feat: add sysadmin as a third users.role value
- `09990cc` feat: add roleChangeError() — pure validation for sysadmin role transitions
- `546db16` feat: wire sysadmin permissions into the backend
- `26dfa65` feat: admin.html - sysadmin grant/revoke toggle, drop Terms & Conditions card
- `7809d9b` feat: add _terms-editor.html — sysadmin-only Terms & Conditions console
- `dfbc5fe` feat: sysadmin navbar menu (DB Reset + Terms & Conditions), extend remaining admin gates
- `649f354` fix: sysadmin-role code review findings 1-4 (from the plan's own final whole-branch review)
- `815c90b` fix: cover admin/reset/* sysadmin-exclusivity in the integration test suite (Gate 1 fix)
- `8ab0f98` fix: code-review round 1 findings — stale-JWT sysadmin mutation, demotion asymmetry (Gate 3 fix)

Introduces a third user role, `sysadmin`, above `admin`. A sysadmin inherits every existing admin capability, plus two privileges carved out of the plain admin tier: access to `_db-reset.html` and Terms & Conditions editing (moved to a new page, `_terms-editor.html`). Both are reachable only from a new sysadmin-only navbar menu block. Promotion/demotion between admin and sysadmin is a deliberate two-step process (`user→admin→sysadmin` and the reverse), enforced server-side (`api/src/lib/role-transition.js`) and independently of the JWT-cached role where it matters most (`requireSysAdmin`, and `users.js`'s protection against a plain admin modifying a sysadmin account).

## Code review follow-ups

- Round 2 (`/code-review` after Gate 3's round-1 fixes): `api/src/routes/users.js:109` — the target-user role fetch and the actor's live-role fetch (`liveRole()`) are two independent, sequential DB round-trips instead of one combined query or a parallel `Promise.all`. Accepted as follow-up (latency, not correctness).
- Round 2: `api/src/routes/users.js:115` — the "fetch target, fetch actor's live role, check `sysAdminTargetError`" sequence is duplicated near-verbatim across `PATCH /:id`, `POST /:id/anonymize`, and `DELETE /:id`. Accepted as follow-up (maintainability — a future change to this guard must be made in three places).

## Roadmap notes

- **Backend permission sweep as a plan step**: the plan's own spec swept every frontend `role === 'admin'` literal thoroughly (§4 table) but only swept the backend as far as the shared `requireAdmin` middleware — it never grepped for the many independent `req.user.role === 'admin'` literals elsewhere in `api/src/routes/`. The final whole-branch review caught this live (a real sysadmin account saw 0 projects/grids/timesheets and 403s on reporting/broadcast) and it was fixed in the same cycle (`api/src/lib/is-admin.js` + a 7-file sweep), but a `grep -rn "role === 'admin'\|role !== 'admin'" api/src/` at spec-writing time would have caught it before any code was written. Worth keeping in mind for the next role/permission-shaped change.
- **`scripts/run-tests.sh` needs a `.env` file that doesn't exist by default in a fresh worktree** — the main checkout has one, the worktree doesn't inherit it (gitignored, not copied by `EnterWorktree`). This blocked the first `run-tests.sh` attempt during this cycle (silent `pdash-db-test` health-check timeout, not an obvious error) until `.env` was manually copied over. `scripts/test-branch.sh`/`run-tests.sh` could detect this case and either copy it automatically from the repo root or fail with a clearer message naming the missing file.
- **The `pdash-api` container must be restarted from the main checkout directory, not from a worktree**, even though the worktree has its own (identical) `docker-compose.yml` — `docker compose restart api` silently no-ops (finds no matching container under that directory's own compose-project namespace) when run from a linked worktree. Cost this cycle: one wasted restart attempt, caught by checking `StartedAt` before assuming success. Worth a note in `CLAUDE.md` or `scripts/` if this comes up again.
- An rtk-hook wrapping git commands via the Bash tool intermittently refused otherwise-valid `git` invocations inside the worktree session with a confusing "cannot verify this is git" message (even for commands as plain as `git status`), while the same commands worked fine via the PowerShell tool. Worked around by using PowerShell for all git operations for the rest of the cycle. Environment/tooling quirk, not a code issue — flagging in case it recurs.
- Integration test suite (`test-api.js`) now bootstraps a dedicated second test account (`TEST_SYSADMIN_EMAIL`) via a new `api/src/promote-sysadmin.js` CLI script, run by `docker-compose.yml`'s `test` service alongside the existing `create-admin.js` call. This is genuinely new test infrastructure (not anticipated by the plan) needed because `/api/admin/reset/*` became sysadmin-exclusive mid-branch — worth knowing about for anyone extending `test-api.js` further.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: §3.1/3.2 (3-tier role model, permission matrix), `users` table schema comment, API reference tables for `reset.js`/`app-settings.js`/`users.js`, DB migrations list (`018_sysadmin_role.sql`), backend/frontend file-tree entries (`middleware/auth.js`, `promote-sysadmin.js`, `_terms-editor.html`, `_db-reset.html`).
- **CLAUDE.md** — updated: Pages table (`admin.html`, `_db-reset.html`, new `_terms-editor.html` row), file-structure block for `admin.html`/`_db-reset.html`/`_terms-editor.html`/`js/nav.js`/`js/settings.js`/`js/shares.js`/`api/src/lib/`(`is-admin.js`, `role-transition.js`)/`api/src/routes/{reset,app-settings,users}.js`/`api/src/middleware/auth.js`/`promote-sysadmin.js`, DB migrations table.
- **TEST_CASES.md** + **test-cases.html** — updated in lockstep: removed 2 now-false T&C-in-admin.html cases (AD-19/20; AD-18 repurposed to document the removal), added a new "Sysadmin role" group (AD-21…AD-34, 14 cases, 3 marked automated), rewrote the DB Reset section for sysadmin-exclusivity (added DR-06b/DR-10b/DR-14b 403 checks, marked DR-10/11/14/15 automated to match the Gate 1 test-suite fix), added a new "Terms & Conditions Editor" section (TE-01…TE-06). `test-cases.html`'s embedded script validated with `node -e "new Function(...)"` after editing.
- **test-api.js** — already updated during Gate 1 (dedicated sysadmin test login, `DR-10b`/`DR-14b` 403 assertions); no further sync-docs action needed.
- **PRD.md** — **updated** (evaluated: user-visible change — new role, two pages narrowed to sysadmin-exclusive, new permission matrix, new UI toggle). §1 overview role count, §16 rewritten (3-tier table, new §16.3 grant/revoke + protection wording, new §16.5/§16.6 for the two relocated/narrowed pages), broadcast-notification wording (§9/§10), share-picker exclusion wording (§18.2).
- **PROCESS.md gate** — none of the three conditions applied (no process skill touched; no *recurring* process exception introduced — the worktree/`.env`/docker-restart quirks above are environment notes, not process changes; no change to the 7-phase skeleton or scenario guardrails) → `PROCESS.md` left untouched.
