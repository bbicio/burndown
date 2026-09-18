# Finish-cycle report — worktree-notification-email-symmetry

**Date:** 2026-09-18
**Branch:** worktree-notification-email-symmetry → main

## What was done

2 commits:
- `3ec81a8` feat: close email/notification asymmetries found in the notification audit — new `createNotification()` helper (`api/src/routes/notifications.js`), migrated the 2 pre-existing share-grant call sites to it, added in-app notification to 3 previously email-only flows (cost-grid share grant, cost-grid ownership reassignment, all 3 export endpoints), and added both email (new `sendShareRevokedEmail`) and in-app notification to project-share revocation, which previously sent nothing on either channel. Deliberately unchanged: `sendInvite`, `sendPasswordReset`, `sendAdminNotificationEmail` (Send Notification keeps its own channel choice), cost-grid share revocation, and the pipeline-stage-change admin broadcast — all explicit scope decisions from the brainstorming design, not gaps.
- `9c41cc0` perf: address a Minor code-review finding — parallelized 3 independent lookup queries in the project-share revoke handler via `Promise.all`.

Grounded in a manual inventory audit (this same session, conversational, not a formal `domain-audit` run) of every email/notification trigger in the codebase, which surfaced these exact asymmetries and was confirmed against the user before scoping.

## Code review follow-ups

Round 1: 0 Critical/Important, 1 Minor (sequential rather than parallel queries) — fixed in `9c41cc0`.
Round 2: confirmed fixed by direct inspection (the review subagent hit a session rate limit mid-run; the fix was small enough — a 5-line, purely mechanical `Promise.all` wrap — to verify directly: diff scope confirmed minimal, variable shapes preserved, query independence confirmed, `node --check` and the full backend suite already green on this exact commit).

None remain as follow-ups.

## Roadmap notes

- Cost-grid share revocation (`DELETE /api/cost-grids/:id/shares/:userId`) still sends neither an email nor an in-app notification — an explicit, documented scope exclusion for this cycle (the user's request specifically covered "progetto e programma", not cost-grid). A candidate for a future cycle if symmetry there is later desired.

## Sync-docs outcome

- **PRD.md**: updated (§10.4 Notification Types table, §18.1/§18.2 Sharing & Permissions) — verified accurate, describes all 4 new/changed triggers and the explicit cost-grid-revoke exclusion.
- **CLAUDE.md**: updated (`notifications.js`, `exports.js`, `services/email.js` entries) — verified accurate.
- **ARCHITECTURE.md**: updated — the 4 affected API Reference rows (`/api/exports/*` ×3, `/api/cost-grids/:id/shares`, `/api/cost-grids/:id/reassign-owner`, `/api/projects/:id/shares`) now note the email+notification behavior and what changed.
- **TEST_CASES.md / test-cases.html**: updated (SH-18, SH-19, NT-23; SH-04 and SH-16 corrected) — verified accurate and in sync between the two.
- **test-api.js**: not evaluated as needing a change — no new API endpoint, no auth-rule change.
- **PROCESS.md gate**: none of the three conditions applied (no process-skill change, no recurring exception, no skeleton/guardrail change) — a pure bounded backend cycle. PROCESS.md left untouched.
