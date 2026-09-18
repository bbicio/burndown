# Finish-cycle report — worktree-browser-notifications

**Date:** 2026-09-18
**Branch:** worktree-browser-notifications → main

## What was done

5 commits:
- `adb4815` feat: add best-effort browser/desktop notification popups — `js/lib/notif-browser.js` (`shouldShowBrowserNotification`, vitest-covered), `js/notifications.js`'s `wireBrowserNotifBanner()`/`maybeShowBrowserNotification()` hooked into the existing SSE stream, `js/nav.js`'s static banner markup. No server-side change — a purely client-side echo of the existing "push" channel.
- `30e4a32` fix: reflect actual permission/opt-out state on the notif-browser toggle — found via the user's own manual testing that the "Enable" button never updated once permission was actually granted. Added `getBrowserNotifBannerState()` and a `localStorage` opt-out flag so the row persistently shows Enable/Disable based on real state, re-synced every time the panel opens.
- `42a7ea0` docs: corrected PRD.md/CLAUDE.md/TEST_CASES.md/test-cases.html, which still described the round-1 "ask once" behavior after round 2 changed it to a persistent toggle.
- `b05ea0a` fix: a Critical code-review finding — `js/core.js`'s `cleanLegacyStorage()` wipes any `PDash_*` localStorage key not in its `keep` Set on every page load (full-page navigation, not SPA), silently reverting the new opt-out flag the instant the user navigated anywhere. Fixed by adding the key to `keep`; corrected CLAUDE.md's localStorage-keys list (was stale at 2 keys) and added test coverage for cross-navigation persistence.
- `715df28` chore: removed two stray `diff1.txt`/`diff2.txt` files accidentally picked up by a `git add -A` (leftover from the code-review subagent's own shell commands).

## Code review follow-ups

Round 1: 1 Critical (opt-out flag wiped on navigation) — fixed in `b05ea0a`.
Round 2: 0 findings, the fix independently re-verified line-by-line, cache-bust completeness and working-tree cleanliness both re-checked and confirmed clean.

None remain as follow-ups.

## Roadmap notes

None surfaced. (A true Web Push / Service Worker implementation — working even with no tab open — was explicitly scoped out in favor of this lighter, SSE-tied approach; not a roadmap item unless the user asks for it later.)

## Sync-docs outcome

- **PRD.md**: updated (§10.5, across the feature commits themselves) — verified accurate, describes the final persistent-toggle behavior, no further change needed.
- **CLAUDE.md**: updated (`js/notifications.js`, `js/lib/` entries, and the localStorage-keys list under "Data strategy") — verified accurate and current.
- **TEST_CASES.md / test-cases.html**: updated (NT-15 through NT-22) — verified accurate and in sync between the two.
- **ARCHITECTURE.md**: not touched — no new API endpoint, no DB change; this feature is 100% client-side and the existing SSE/notifications API reference remains accurate as-is.
- **test-api.js**: not evaluated as needing a change — no new endpoint, no auth-rule change.
- **PROCESS.md gate**: none of the three conditions applied (no process-skill change, no recurring exception, no skeleton/guardrail change) — a pure bounded feature cycle. PROCESS.md left untouched.
