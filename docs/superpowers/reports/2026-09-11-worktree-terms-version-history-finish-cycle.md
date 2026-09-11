# Finish-cycle report — worktree-terms-version-history

**Date:** 2026-09-11
**Branch:** worktree-terms-version-history → main

## What was done

6 commits (subagent-driven-development execution, `docs/superpowers/plans/2026-09-11-terms-version-history.md`):

- `5ab5e59` feat: add terms_versions table for immutable T&C version history
- `98748c0` feat: GET /api/app-settings/terms reads from terms_versions; add draft/versions read endpoints
- `2465601` feat: PUT /api/app-settings/terms inserts an immutable row on publish
- `f744a87` feat: _terms-editor.html loads the draft separately, browses version history
- `c3594a4` fix: close terms-history final-review findings (acceptance gate, view modal, migration, schema check) — from the plan's own final whole-branch review
- `e6c12e3` fix: code-review findings - null-safe name formatting, deduplicated — from Gate 3

Adds permanent version history for Terms & Conditions text, replacing the previous single-row storage that silently destroyed the previous version's text on every publish (even though `users.terms_version` claimed to record which version each user had accepted, there was no way to reconstruct what that version had actually said). A new, immutable, append-only `terms_versions` table now retains every published version; the existing `app_settings.terms_content`/`terms_version` mechanism is repurposed as pure draft storage, kept fully separate from what `terms.html`'s acceptance gate serves. `_terms-editor.html` gained a "Version History" list with a read-only view of any past version.

## Code review follow-ups

- Round 1 + round 2 (`/code-review`, same finding both times, confirmed with the user both times): `api/src/routes/app-settings.js`'s `PUT /terms` publish path (`SELECT MAX(version)` then `INSERT`, followed by separate `app_settings` writes) has no transaction or lock around it. Two concurrent publishes could collide on the `version` UNIQUE constraint (second request gets a raw 500, its content silently dropped), or a mid-sequence failure could leave `terms_versions` and the draft/gate out of sync. Accepted as follow-up — this is the exact risk class the design spec explicitly descopes (`docs/superpowers/specs/2026-09-11-terms-version-history-design.md`'s Explicitly Excluded Scope), since the old single-row storage had an identical read-then-increment race. Not fixed in this cycle.

## Roadmap notes

- **Acceptance-gate/published-state consistency was a real, newly-introduced gap, caught by the final whole-branch review's live end-to-end verification** (not by any of the four task-level reviews): the design spec stated `app_settings` would never be read by "any acceptance-gate logic" after this change, but `auth.js`'s `getCurrentTermsVersion()` (feeding both `GET /api/auth/me` and `POST /accept-terms`) still read the old table. Fixed in the same cycle (`c3594a4`) — both consumers now agree with `GET /terms` via a single shared helper. Worth remembering for future "split one table into two roles" changes: grep the *entire* codebase for every reader of the old table, not just the routes the plan's own file list named.
- **`scripts/test-branch.sh`'s `schema_exists()` sentinel drifts silently** — it names one specific migration file's own table/column as its "fully migrated" marker, and nothing enforces that later migrations update it. This cycle found it two migrations stale (018 didn't update it, 019 fixed it). No systemic fix applied (out of scope), but future migrations should treat "did I update `schema_exists()`" as a standing checklist item, not something a review has to catch by accident.
- **A useful debugging pattern surfaced twice across the two most recent SDD cycles on this project**: `pdash-api`'s bind mount is fixed to the main checkout, not whatever worktree a session happens to be in — `docker compose restart api` run from inside a worktree directory silently restarts nothing (wrong Docker Compose project namespace) rather than erroring. Both `/finish-cycle` runs this session performed the restart correctly by explicitly `cd`-ing to the main checkout root first, per this project's own documented Gate 4 step 3 CWD safety check — but it's easy to get this wrong if that step is ever skipped.

## Sync-docs outcome

- **ARCHITECTURE.md** — updated: new "App Settings — Terms & Conditions (version history)" subsection with a full 5-endpoint table replacing the old 2-row one, `019_terms_versions.sql` added to the migrations list, `_terms-editor.html`'s file-tree entry cross-referenced to the new section.
- **CLAUDE.md** — updated: `api/src/routes/app-settings.js`'s file-structure entry rewritten for the new draft/published split and all 4 new/changed routes; `_terms-editor.html`'s Pages-table row and file-structure entry both updated (draft-loading, Version History card, `:value`-not-mustache detail); migrations table gained `019_terms_versions.sql`; `scripts/test-branch.sh`'s `schema_exists()` note updated to mention the new `terms_versions` check.
- **TEST_CASES.md** + **test-cases.html** — updated in lockstep: fixed TE-05's stale endpoint reference (`GET /terms` → `GET /terms/draft`), added a new "17a.1 Version history" group with 7 cases (TE-07…TE-13) covering draft-doesn't-leak-to-published, publish-creates-immutable-row, publish-doesn't-alter-earlier-versions, the history list/view UI, the now-visible view-error path, and sysadmin-only authorization on the three new read routes. `test-cases.html`'s embedded script re-validated with `node -e "new Function(...)"` after editing.
- **PRD.md** — **updated** (evaluated: user-visible change — draft/publish are now genuinely separate states, and a new "Version History" browsing feature exists where none did before). §16.5 rewritten to describe the draft/publish separation accurately and to add the version-history capability.
- **PROCESS.md gate** — none of the three conditions applied (no process skill touched; no recurring process exception introduced; no change to the 7-phase skeleton or scenario guardrails) → `PROCESS.md` left untouched.
