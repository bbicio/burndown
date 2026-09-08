# Finish-cycle report — worktree-timesheets-actuals-relabel

**Date:** 2026-09-08
**Branch:** worktree-timesheets-actuals-relabel → main

## What was done

2 implementation commits (plus the cycle's own brief/design/plan docs commits):

- `fa8c2d9` docs: relabel timesheets.html actuals buttons to match portfolio.html/project-config.html wording
- `c04b6bd` docs: update TS-03/TS-17 manual test steps for the renamed Delete actuals/Download actuals buttons

Renamed `timesheets.html`'s actuals-management button labels to align with wording already used on `portfolio.html`/`project-config.html`: `⬇ XLSX` → `⬇ Download actuals`, `🗑 Delete all` → `🗑 Delete actuals`, plus the matching hint-text sentence. Pure text change — `downloadXlsx(r)`/`deleteCode(r)` bindings and their implementations are untouched. `👁 View` was already correctly worded and stays as-is; "Load Actuals" was already absent from this page (upload happens via a separate "Load XLS" entry point in Project Reporting) and stays absent, per the brief's own confirmation.

The task-scoped code review caught one real gap the plan hadn't accounted for: `TEST_CASES.md`/`test-cases.html`'s own TS-03/TS-17 manual-verification steps still quoted the old button text ("Click 🗑 Delete all", "Click ⬇ XLSX"), which would have sent a tester looking for buttons that no longer exist. Fixed in the same cycle, in a follow-up commit.

## Code review follow-ups

None open — round 1 found the TS-03/TS-17 doc-sync gap (fixed immediately), round 2 came back clean (`[]`).

## Roadmap notes

None new. The native `confirm()` dialog text inside `deleteCode()` ("Delete ALL timesheet data for project...", `timesheets.html:315`) still says "all" rather than "actuals" — deliberately out of scope per the brief's own "Explicitly excluded scope" section (this dialog text wasn't part of the requested rename, and the native `confirm()` itself is a separate, already-logged convention violation from a much earlier cycle, unrelated to this one).

## Sync-docs outcome

- **CLAUDE.md** — updated: the `timesheets.html` file-tree entry now reflects the current button labels (`⬇ Download actuals`, `🗑 Delete actuals`) instead of the retired `⬇ XLSX`/implicit "Delete all" wording, and notes the `confirm()` text was deliberately left unchanged.
- **PRD.md** — updated: §8.4 (Timesheet Management Page)'s "Export"/"Delete all" bullet headings renamed to "Download actuals"/"Delete actuals" to match the actual UI — this is user-facing product documentation and the labels genuinely changed, so this was in scope per the PRD trigger rule (unlike the two prior mini-cycles this session, which were internal-only fixes).
- **TEST_CASES.md** / **test-cases.html** — already updated as part of this branch's own commits (see What was done above); nothing further needed at this gate.
- **test-api.js** — not touched: no API/auth change.
- **ARCHITECTURE.md** — not touched: no schema/API/architectural-pattern change; the one "Delete all" hit found there belongs to an unrelated admin-reset-scopes endpoint, not this feature.
- **docs/superpowers/PROCESS.md** — not touched: gate evaluated as none of the 3 conditions apply.
