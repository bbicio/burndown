# Finish-cycle report — worktree-prelogin-restyling

**Date:** 2026-10-06
**Branch:** worktree-prelogin-restyling → main (merge `0ddddf8`, `--no-ff`; main had not diverged)

Brief `docs/superpowers/design/2026-10-06-prelogin-brief.md` (boards in `docs/superpowers/design/PreLogin/`), spec `docs/superpowers/specs/2026-10-06-prelogin-restyling-design.md`, plan `docs/superpowers/plans/2026-10-06-prelogin-restyling.md` — all committed on `main` before the branch (`b718192`, `ab6ee29`). Frontend only: no `api/` change, no migration, `pdash-api` not restarted. DB backup before merge: `backups/pdash-backup-2026-10-06-130042.dump` (116K).

## What was done

6 commits:
- `f214e88` feat(auth): shared css/auth.css for the public auth pages
- `827e924` feat(auth): restyle login.html (Sign In, Forgot) on css/auth.css (also `--bs-btn-*` variables on `.btn-primary`)
- `c8fcca2` feat(auth): restyle reset-password.html, strength meter coloured by position
- `13f766f` feat(auth): restyle activate.html; logo identity guard; document css/auth.css
- `b7001b2` fix(auth): let #app span the page so the auth card reaches its max-width
- `d77f199` fix(auth): final-review fixes — strength label height, focus text colour, loading spacing, CLAUDE.md wording

Execution: subagent-driven, implementers on Sonnet (user decision), per-task reviews on Sonnet, final whole-branch review on Opus ("with fixes" → one fix wave → scoped re-review: all addressed). Two implementer runs were stopped by the user and relaunched on request. Tests: 602 → 647 frontend tests, all green.

Rulings taken during execution (from the SDD ledger):
1. `.strength-0` has no CSS rule and is not required by the class-list test (spec §3 defines no style for level 0).
2. `--bs-btn-*` variables set on `.btn-primary`, because Bootstrap's `.btn:first-child:active` (0,3,0) and disabled variables would otherwise turn the pressed/disabled button blue.
3. `#app { width: 100% }` — the visual check found the Vue root (body flex item) shrinking the card to ~260px instead of 400px.
4. Final-review fixes: `.strength-label` `line-height: 1.5; min-height: 1.5em` (the confirm field no longer jumps), navy input text on focus, 10px between spinner and loading text, CLAUDE.md `tokens.css` wording.
5. Keyboard focus ring on the magenta button left Bootstrap blue — **user decision** at the end of execution (a magenta ring would need a 4th non-token colour literal).
6. Parked: no danger focus ring on the invalid confirm field (plan sanctioned `box-shadow: none`).

Verification: visual check without Docker (throwaway static server in the session scratchpad mocking `/api/auth/reset-password/:t` and `/api/auth/invite/:t`, plus headless Chrome) at 1440/1024 and a real 390px iframe (headless Chrome's minimum window is 500px); Gate 2 manual verification by the user on the isolated branch stack (`scripts/test-branch.sh`, torn down after the user's "yes").

## Code review follow-ups

None. (`/code-review` medium, round 1: no findings; it repeated the pre-existing note below on the `.link-muted` anchors.)

## Roadmap notes

- **Keyboard access (pre-existing):** "Forgot password?" and "← Back to sign in" on `login.html` are `<a>` without `href`, so they cannot be reached with Tab and the new `.link-muted:focus-visible` style never fires. Follow-up candidate (`href="#"` + `@click.prevent`, or `<button>`).
- **Contrast from the boards (accepted):** placeholder and "PROJECT DASHBOARD" in `--border-dark` on white ≈ 2.5:1 (the placeholder was ≈ 4.6:1 with Bootstrap's default); copyright `rgba(255,255,255,.45)` on navy ≈ 4.4:1.
- **Focus ring colour:** the magenta button's keyboard focus ring is Bootstrap blue on these three pages (magenta elsewhere via `style.css`'s `--bs-btn-focus-shadow-rgb`) — user decision to keep it.
- **"Request a new link"** (reset-password invalid state) still goes to `/login.html`, not straight to the Forgot view — out of scope by spec.
- **Flaky test timeouts (pre-existing):** file-scanning tests (`page-names`, `foundations-guard`) occasionally exceed vitest's 5 s default under Docker I/O load; they pass alone and on rerun.
- **Deferred minors (left as is, triaged by the final review):** position-colour tests prove presence not cascade order (confirmed visually); `login.html` content not re-indented inside `.auth-stack`; `switchToForgot` test finds its line by text; `checkStrength()` unchanged-check covers two lines; user-chip test regex stops at the first `</div>`.
- **Pending process change (agreed with the user in this cycle):** add to `docs/superpowers/PROCESS.md` the model choice per execution mode — subagent-driven = Sonnet implementers (coordinator and final review on Opus), native = the user switches the session model by hand. To be done right after this report as its own `docs:` commit.

## Sync-docs outcome

- `ARCHITECTURE.md`: new `css/auth.css` entry under `admin-crud.css`; the `login.html / activate.html / reset-password.html` entry now states what they load, the Forgot pre-fill, the shared strength meter and the guard file.
- `CLAUDE.md`: already updated on the branch (`css/auth.css` File structure line, Cache-busting mention, `tokens.css` line wording); nothing further.
- `TEST_CASES.md` / `test-cases.html`: new manual cases A-14 (public pages look at 1440/1024/390), A-15 (Forgot pre-fill, never overwrites), A-16 (strength meter by position, no jump), A-17 (link states with icons, mismatch).
- `test-api.js`: not changed (no API change).
- `PRD.md`: **updated** (user-visible): §15.1 strength indicator is guidance only + the shared look of the public pages; §15.3 Forgot view on the sign-in page with the email pre-filled.
- `.claude/skills/operational-manual/SKILL.md` (6b): §2 reference gained the recovery view / pre-fill / strength-indicator point.
- `docs/superpowers/PROCESS.md` gate: none of the three conditions was triggered by the cycle's own work (no process skill changed, no recurring exception used, skeleton unchanged); the model-choice rule decided during the cycle is applied separately, as agreed, with the user's confirmation of the wording.
- No `docs/pages/` file exists for these pages; none created (narrative lives in this report and the spec).

## Memory outcome

- `project_ui_redesign_cycles.md`: added "Pre-login pages restyling — MERGED 2026-10-06" paragraph (merge `0ddddf8`, docs paths, decisions, accepted/open items, visual-check technique); `MEMORY.md` line updated (before: "…MERGED 2026-10-05 (`106560c`, Programs UI gone from Config; user announced a radical UI update coming);" → after: "…MERGED 2026-10-05 (`106560c`, Programs UI gone from Config); pre-login restyling (login/reset/activate on `css/auth.css`) MERGED 2026-10-06 (`0ddddf8`);").
- `project_process_model_choice_pending.md`: unchanged — still pending until the PROCESS.md edit is made.
- Checked, no change: `feedback_powershell_bom_html_edits.md` (BOM rule respected), `frontend-tests-node-docker.md`, `feedback_worktree_removal.md` (plain `git worktree remove` after `ExitWorktree keep` worked again).
