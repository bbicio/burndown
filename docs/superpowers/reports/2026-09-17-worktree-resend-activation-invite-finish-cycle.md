# Finish-cycle report — worktree-resend-activation-invite

**Date:** 2026-09-17
**Branch:** worktree-resend-activation-invite → main

## What was done

2 commits:
- `611bd78` feat: add "Resend invite" action for pending users — new `POST /api/auth/:id/resend-invite` (admin/sysadmin, fresh 48h token, `sendInvite()` reused), a "✉️ Resend invite" button on `admin.html`'s user list (pending users only), PRD.md/TEST_CASES.md/test-cases.html updated in the same commit.
- `cbfaad5` fix: address code review findings on the resend-invite feature — `globalSuccess` banner now cleared by all 5 admin actions (not just `resendInvite`), `:id` validated as a UUID before querying (clean 404 instead of an unhandled 500 on a malformed id), naming normalized (`d` instead of `data`) to match `anonymizeUser`'s existing convention.

## Code review follow-ups

Round 1: 1 Important (stuck `globalSuccess` banner) + 2 Minor (missing `:id` UUID validation, naming inconsistency) — all fixed in commit `cbfaad5`.
Round 2: 0 findings, all three fixes independently re-verified line-by-line against the diff.

None remain as follow-ups.

## Roadmap notes

None surfaced.

## Sync-docs outcome

- **ARCHITECTURE.md**: updated — added `POST /api/auth/:id/resend-invite` to the API Reference table.
- **CLAUDE.md**: updated — `admin.html`'s file-structure entry now covers the new button/method and the `globalSuccess`/`globalError` reset-on-every-action fix.
- **`.claude/skills/operational-manual/SKILL.md`** (§6b, triggered by the PRD.md change): updated — added a "Resending a lost invite" bullet under §15 Authentication in the inline detail-content reference.
- **PRD.md**: updated (in the feature commit itself, §15.2 Invite Flow) — verified accurate, no further change needed.
- **TEST_CASES.md / test-cases.html**: updated (in the feature commit itself, AD-38 through AD-42) — verified accurate and in sync between the two, no further change needed.
- **test-api.js**: not evaluated as needing a change — no new API endpoint auth pattern beyond the existing `requireAdmin`, matching the `anonymize` endpoint's own precedent of no automated coverage (explicit user decision).
- **PROCESS.md gate**: none of the three conditions applied (no process-skill change, no recurring exception, no skeleton/guardrail change) — a pure bounded feature cycle. PROCESS.md left untouched.
