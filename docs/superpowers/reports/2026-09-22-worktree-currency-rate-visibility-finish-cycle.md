# Finish-cycle report — worktree-currency-rate-visibility

**Date:** 2026-09-22
**Branch:** worktree-currency-rate-visibility → main

## What was done

2 commits:
- `7de3927` feat: confirm modal for currency rate updates + proposal rate display — `config.html`'s Currencies tab now shows a confirmation modal ("Update exchange rate?", old→new rate) before saving a new exchange rate for an active currency, explaining the change does not retroactively affect existing proposals/projects (verified in code: `cost_grid_versions.currency_rate` is a frozen per-version snapshot, never a live join to `currencies.current_rate`). `costgrid.html`'s offer editor now shows the proposal's own frozen exchange rate ("1 EUR = X") next to the Currency selector whenever the proposal's currency isn't EUR. Bundled with this: a real bug found and fixed during manual verification — `draft.currencyRate` was never updated client-side when the currency dropdown was changed inside the editor, so the newly-added rate display showed a stale value until a full page reload; both `onCurrencyChange()` code paths now update it to the live rate at change time.
- `060be82` fix: address code review findings on currency-rate-visibility cycle — added a reentrancy guard to `updateCurrencyRate()` (fast-double-click protection, matching this codebase's established idiom); the confirm modal no longer closes immediately on Confirm (shows a spinner, disables both buttons while the save is in flight, closes only on success, keeps the error visible inline on failure); the offer editor's rate display now uses the same fixed 6-decimal formatting as the confirm modal, instead of an unformatted raw float.

Grounded in a bounded (brainstorming skill, bounded path — no written spec doc) cycle, approved by the user after two rounds of correction: the first design draft had UI copy in Italian, fixed to English per `CLAUDE.md`'s project-wide language constraint; the user also asked, in the same request, to add the proposal-side rate display and to verify it didn't already exist before designing it.

## Code review follow-ups

Round 1 (dispatched subagent, medium effort): 0 Critical, 1 Important (missing reentrancy guard on `updateCurrencyRate()`), 2 Minor (modal-closes-before-save-resolves UX; unformatted rate display) — user chose to fix all three now rather than defer any. All three fixed in `060be82`, re-verified manually in the browser (spinner/disabled state, error-stays-open path not separately triggered but code-reviewed, 6-decimal formatting confirmed live).

None remain as follow-ups.

## Roadmap notes

- The confirm modal's own copy says an existing proposal's rate can be updated "if a 'refresh rate' is explicitly run on it" — this refers to a real, pre-existing backend endpoint (`POST /api/cost-grids/:id/versions/:vId/refresh-rate`, `cost-grids.js`), but there is currently **no UI entry point for it anywhere** (confirmed via grep — no caller in `costgrid.html`/`js/costgrid.js`). The modal copy was explicitly approved by the user with this exact wording and is already merged, so left as-is rather than unilaterally changed post-merge; `PRD.md`'s own new §7.7 paragraph was deliberately phrased to avoid claiming this as a reachable user action (an existing offer's rate only changes if the offer itself is re-saved with that currency selected again). A future cycle could either wire up a "Refresh rate" button somewhere reachable, or soften/remove the modal's own reference to it.
- During Gate 2 manual verification, the user separately asked whether GBP could be activated (reported not finding it in a dropdown) — investigated via a direct read-only DB query on the main stack and a live browser check; GBP was present and activatable in the "Activate a currency" dropdown all along (pre-existing, unrelated behavior, not a gap from this cycle). Resolved as user oversight, no code change needed.

## Sync-docs outcome

- **PRD.md**: updated — §7.7 Currencies gained a paragraph on the new rate-update confirmation dialog and its non-retroactivity guarantee (deliberately phrased to not claim the unreachable "refresh rate" backend action as a UI feature, see Roadmap notes); §4.9's Currency field bullet gained a note on the new frozen-rate display. Evaluated as user-visible (new dialog + new always-visible-when-relevant UI element) — updated, not skipped.
- **CLAUDE.md**: updated — `config.html`'s file-structure entry gained the rate-confirmation-modal note (guard, spinner/disable, close-only-on-success behavior); `costgrid.html`'s entry gained the rate-display note plus the staleness bug fix and its root cause.
- **`.claude/skills/operational-manual/SKILL.md`**: updated (§6b applied, since PRD.md was touched) — §4 Pipeline's "Offer editor" detail-content bullet gained the rate-display point with a cross-reference to §13/§16; the §13/§16 Administration Currencies bullet gained the rate-update-confirmation point with a cross-reference back to §4. This is the exact class of gap that was caught (twice) and fixed earlier in this session for prior cycles — applied proactively this time, not after being asked.
- **TEST_CASES.md / test-cases.html**: updated in both files, verified in sync — 2 new cost-grid-editor cases (CG-69/CG-70, rate display + live-update-on-change) and 4 new Configuration cases (CN-03 through CN-06: modal appears, Cancel doesn't save, Confirm saves, double-click guard). None automated (`Auto` blank) — this is pure Vue-template/method UI behavior with no `js/lib/` pure-function extraction, matching this session's established pattern for similarly-shaped small UI cycles; verified manually in an isolated `scripts/test-branch.sh` environment instead. `test-cases.html`'s inline script re-parsed cleanly after the edit (checked via `new Function()` on each extracted `<script>` block).
- **test-api.js**: not evaluated as needing a change — no new API endpoint, no auth-rule change (this cycle touched only `config.html`/`costgrid.html`, no `api/` files).
- **ARCHITECTURE.md**: evaluated, left untouched — the Currencies API reference table (`GET/POST/PATCH /api/currencies/*`) is unchanged; no endpoint or auth behavior changed in this cycle, only client-side UI wrapped around the existing `PATCH /:code/rate` call.
- **PROCESS.md gate**: none of the three conditions applied (no process-skill change, no recurring exception introduced, no skeleton/guardrail change) — a pure bounded frontend cycle, executed and closed exactly per the existing process. `PROCESS.md` left untouched.
