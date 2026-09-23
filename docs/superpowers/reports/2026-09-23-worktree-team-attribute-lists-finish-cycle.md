# Finish-cycle report — worktree-team-attribute-lists

**Date:** 2026-09-23
**Branch:** worktree-team-attribute-lists → main

## What was done

11 commits, merged `--no-ff`:

- `3ee7e9e` docs: add implementation plan for Team + Attribute Lists
- `eca6f12` feat: add resources and attribute_lists schema
- `fc8752d` feat: add slugify pure function for attribute list slugs
- `688fd0b` feat: add attribute-lists API routes
- `4ff1571` feat: add resources API routes
- `468e956` feat: add Team and Attribute Lists links to admin nav menu
- `e4f7d72` feat: add Team resource registry page
- `a995c29` feat: add Attribute Lists taxonomy admin page
- `08b9b05` fix: validate required resource fields on PATCH, tidy slugify regex
- `0f2608c` fix: address code-review findings from finish-cycle Gate 3
- `e3bb2db` fix: address round-2 code-review findings (Team job-title UX, admin.html CSS dedup)

First of four planned cycles for a resource-allocation initiative (see `docs/superpowers/specs/2026-09-23-team-attribute-lists-design.md`): a standalone `resources` table + `team.html` CRUD page, and a generic `attribute_lists`/`attribute_list_items` tag-taxonomy system + `attribute-lists.html`. Both pages are admin/sysadmin-only, linked from the shared "⚙ Admin" navbar dropdown. New DB migration `020`, two new Express route files, a `slugify` pure-function utility (7 tests), and a new shared `css/admin-crud.css` (extracted from duplicated inline styles across `team.html`/`attribute-lists.html`/`admin.html`).

Implemented via Subagent-Driven Development (8 tasks, each with its own implementer + task review), followed by this `/finish-cycle` run's own 3 rounds of `/code-review` (rounds 1–2 fixed in place, round 3 accepted as follow-up below).

## Code review follow-ups

- **Round 3** — `team.html`/`attribute-lists.html`'s `loadResources`/`loadRoles`/`loadUsers`/`loadLists`/`openList` don't check `res.ok` before assigning the response body as an array, so a non-2xx JSON error body could reach a `.filter()`/`.length` call and throw. Not a regression introduced by this branch — it's the identical pattern `admin.html` already uses (`admin.html:290-293`), replicated faithfully rather than fixed independently in the two new pages.
- **Round 3** — no server-side uniqueness constraint on `(list_id, label)` in `attribute_list_items`: a double-submit or two concurrent admins can create two items with the same label in one list. Low-impact (data-quality, not security) and explicitly test-cased as a known gap (`TEST_CASES.md` AL-08).
- **Round 3** — `team.html`/`attribute-lists.html`'s `<script>` load order doesn't match `CLAUDE.md`'s documented order (`core.js, api.js, api-sync.js, nav.js, notifications.js, settings.js`) and omits `api-sync.js` entirely. Again, this replicates `admin.html`'s own existing (already non-compliant) order rather than introducing a new deviation — fixing it here without also fixing `admin.html` would create inconsistency between the three pages instead of removing it.

None of the three are Critical or Important; all three are pre-existing patterns from `admin.html` this cycle deliberately mirrored (per the spec's "same pattern as admin.html" design intent) rather than new defects, with the exception of the item-label uniqueness gap, which is a genuine but low-severity omission.

## Roadmap notes

- The three follow-ups above, if ever addressed, should be fixed **once, across all three pages** (`admin.html`, `team.html`, `attribute-lists.html`) rather than patched independently — see the discussion above for why fixing only the new pages would make things worse, not better.
- The spec's Cycle 2 (tagging proposals/projects with `attribute_lists` values) has no code yet — `attribute-lists.html` is not consumed anywhere else in the app. Cycle 3 (resource profile enrichment from actuals) and Cycle 4 (AI suggestion engine + planning chatbot) are further out.
- `resources` has no matching key to actuals data yet — actuals identify a person by free-text name (confirmed during brainstorming via `api/src/routes/timesheets.js`'s `colOwner` column mapping), not by any `resources.id`. Cycle 3 will need a name-matching strategy.
- Process observation, not a defect: a fresh git worktree does not carry the gitignored `.env` file, which `scripts/test-branch.sh` needs (DB/JWT/SMTP secrets) — this had to be copied in manually from the main checkout before the isolated branch stack would start. Worth a one-line callout in `scripts/test-branch.md` or `using-git-worktrees` guidance for the next cycle that hits this.

## Sync-docs outcome

- **CLAUDE.md** — updated: added `team.html`/`attribute-lists.html` to the Pages table and File structure block, `css/admin-crud.css`, `api/src/routes/{resources,attribute-lists}.js`, `api/src/lib/slugify.js`, migration `020` row, bumped the v-cloak page count from 13 to 15.
- **ARCHITECTURE.md** — updated: `resources`/`attribute_lists`/`attribute_list_items` added to §5.2 Database Schema, a new API Reference subsection, migration `020` added to §8, Directory-structure entries for the two new pages plus `admin-crud.css`, and a new permission-matrix row.
- **docs/api/lib.md** — updated: new `slugify.js` narrative section.
- **docs/js/nav.md** — updated: the "⚙ Admin" trigger's page list now includes Team/Attribute Lists.
- **TEST_CASES.md** / **test-cases.html** — updated: new "Team + Attribute Lists" section (TM-01…TM-11, AL-01…AL-08, 19 cases), automated ones marked ✓ to match actual `test-api.js` coverage.
- **test-api.js** — updated: new `testResourcesAndAttributeLists()` (16 assertions: auth gates, empty/null validation, slug-length validation, CRUD happy paths, the known label-duplication gap). Verified live via `scripts/run-tests.sh` — 140/140 passing.
- **PRD.md** — evaluated and **updated**: both pages are genuinely new, user-visible admin functionality, so this was not ambiguous. Added §16.7 (Team) and §16.8 (Attribute Lists), plus a permission-matrix row in §16.2.
- **`.claude/skills/operational-manual/SKILL.md`** — updated (triggered by the PRD.md change): mirrored the same two new sections into its detail-content reference.
- **PROCESS.md gate** — **none of the three conditions applied**: no process-skill was introduced or modified, no recurring exception to the standard process was introduced (the worktree `.env`-copy step noted above is a one-off environment quirk, not a process change), and the common 7-phase skeleton / scenario guardrails were not touched. `PROCESS.md` left untouched.
