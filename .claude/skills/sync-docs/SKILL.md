# /sync-docs — Sync all project documentation

Review all recent code changes in this session (and git diff if needed) and update the following files so they accurately reflect the current state of the codebase. Do NOT invent features that don't exist — only document what is actually implemented.

## Files to update

### 1. ARCHITECTURE.md
- Update any section that describes modules, API endpoints, DB schema, or architectural patterns that changed.
- If a new JS module was added or its responsibilities changed, update the file tree and its description.
- If a new API endpoint was added or its auth changed (requireAuth vs requireAdmin), update the API Reference table.
- If a new DB migration was applied, add it to the migrations list.
- If a new frontend behaviour was introduced (e.g. new modal, new state variable, new data flow), add or update the relevant section.
- For a `.html` page's own entry in the `### Directory structure` file tree (a subsection of §7 Docker Compose — there is no top-level section by that name): keep it short (architectural facts only — what it folds in, what it loads). Per-page narrative detail follows the same `docs/pages/<page-name>.md` routing rule as CLAUDE.md (see below) — do not let narrative accumulate back into this file's per-page entries either. If that page already has a `docs/pages/` file, its entry here should point to it rather than restate the detail.
- The same routing rule (mandatory, not a preference) applies to every non-page entry of that same tree too — `js/*.js`, `js/lib/*.js`, `api/src/routes/*.js`, `api/src/lib/*.js`, `scripts/*.sh` — not just `.html` pages. See CLAUDE.md's own routing rule below (section 2) for the full detail: the destination folders (`docs/js/`, `docs/api/`, `docs/scripts/`), the threshold for what counts as narrative worth moving, and the reuse-before-duplicate principle (check whether a `docs/` file for that exact source file already exists — from a CLAUDE.md cycle or an earlier ARCHITECTURE.md cycle — before creating a second one; if it exists and already says the same thing, just point to it; if ARCHITECTURE.md holds genuinely additional detail, merge it into the existing file before truncating, never fork a duplicate). This section previously described the routing rule only for `.html` pages, which let JS/API/script narrative accumulate unchecked in that tree even after the equivalent CLAUDE.md narrative had already been moved out — closed 2026-09.

### 2. CLAUDE.md
- Update the file structure table (`js/`, `api/src/routes/`, etc.) if any file was added, removed, or its purpose changed — except for the per-page `.html` entries covered by the routing rule below.
- Update any architectural notes (routing, data strategy, settings modal, notifications, etc.) that are now outdated.

**Routing rule — per-page implementation detail (mandatory, not a preference):** for any `.html` page listed in the Pages table, the narrative implementation detail — what changed, which methods/components were touched, first-attempt bugs found during the cycle, references to specs/plans/reports — MUST be written to `docs/pages/<page-name>.md` (e.g. `docs/pages/portfolio.md` for `portfolio.html`), never inline in `CLAUDE.md`. If `docs/pages/<page-name>.md` does not yet exist for a page you are updating, create it (use an existing one, e.g. `docs/pages/portfolio.md`, as the template for structure and tone) rather than falling back to writing the detail into `CLAUDE.md`.
- In `CLAUDE.md`'s Pages table, touch **only** the "Purpose" column, and only if the page's actual purpose/scope changed (not for every implementation cycle) — do not append narrative there. If the table row does not yet link to a `docs/pages/` file and one now exists or was just created, add the link.
- **The File Structure block no longer lists pages at all** (2026-10-08, CLAUDE.md split cycle). The Pages table is the single page index — route, one-line purpose, link to `docs/pages/<page-name>.md` — and the block carries one collective `HTML pages` line pointing at it. Do **not** re-add a per-page entry to the block: having both was the duplication the split removed.
- **The File Structure block is an index, not documentation.** Every entry is at most one or two lines: what the file is, plus a pointer to its `docs/` file. An entry that grows past that is a regression to be fixed in the same `/sync-docs` run, by moving the text to the `docs/` file and shrinking the entry back — not by leaving it and noting it. The block was 38 KB of accumulated narrative before the 2026-10-08 split; it is ~11 KB now, and the whole point is that it stays that way.
- The same rule extends to shared, non-page files: a JS file's narrative goes to `docs/js/<name>.md` (e.g. `docs/js/costgrid.md` for `js/costgrid.js`, `docs/js/lib.md` for the whole `js/lib/` module set), an `api/src/routes/*.js` or `api/src/lib/*.js` file's narrative goes to `docs/api/<name>.md` (e.g. `docs/api/timesheets.md` for `api/src/routes/timesheets.js`, `docs/api/lib.md` for `api/src/lib/`), and a `scripts/*.sh` or `scripts/*.mjs` file's narrative goes to `docs/scripts/<name>.md`. Stylesheets share one file, `docs/css/stylesheets.md`. Several destinations group more than one source file, and a change to any of them belongs in the existing file rather than a new one: `docs/js/shared-libs.md` (the shared classic scripts — `api.js`, `shares.js`, `share-list-component.js`, `clients.js`, `roles.js`, `programs.js`, `ratecards.js`, `upload.js`, `tags.js`, `portfolio.js`), `docs/js/cg-controls.md` (`js/cg-controls.js` + `js/lib/cg-controls-calc.js`), `docs/api/services.md` (`api/src/services/` index, `email.js`, `jwt.js`), `docs/api/users.md` (`routes/users.js`, `create-admin.js`, `promote-sysadmin.js`). Not every such file needs one — only split out a file whose `CLAUDE.md` entry has accumulated real cycle-by-cycle narrative (dated fixes, first-attempt bugs, function-level history), not a file whose entry is already a short, stable architectural fact. When in doubt, a short single-paragraph entry with at most one or two dated notes stays inline; a multi-fix, multi-date narrative moves out. DB migrations and genuinely cross-cutting conventions (e.g. "Cache-busting", "Script loading order", "Pipeline stage: single source of truth") still belong in `CLAUDE.md`/`ARCHITECTURE.md` as before — they describe a pattern spanning many files, not one file's own history, so they don't have a single natural `docs/` home to move to.

### 3. TEST_CASES.md
- For every new feature or bug fix, add one or more test cases in the appropriate section.
- For changed behaviour, update the existing test case description and expected result.
- For removed features, remove or mark the test case as obsolete.
- Mark automated cases with ✓ in the Auto column if they are covered by test-api.js; write `✓ (vitest)` when the coverage is a frontend unit test instead, which the page renders as its own badge.
- **This file is code** (2026-10-09): `test-cases.html` fetches and parses it at load, so there is no longer a second copy to mirror — the former section 4 of this skill is gone. Two consequences. A malformed table (an unescaped `|` in a cell, a row whose cell count does not match its header, a duplicate case id) now degrades a page, and `js/lib/test-cases-parse.test.js` fails on it: run `npm test` after editing this file. And a cycle that touches only `TEST_CASES.md` classifies as `ordinary`, not `no-code` — `scripts/classify-cycle.mjs` lists it in `RUNTIME_LOADED_ROOT_MD`.

### 4. test-api.js (only if new API endpoints were added or auth rules changed)
- Add test functions for new endpoints following the existing pattern (section header, ok() assertions, cleanup via later()).
- If an endpoint's auth changed (e.g. requireAdmin → requireAuth), update the SEC-01 loop or add a new security assertion.
- Call new test functions from main() in a logical order.

### 5. PRD.md (only if user-visible behaviour changed)
- Trigger only when the change alters what a user can do, see, or experience: a new page/view, a new feature, a changed user flow, a changed permission/role behaviour, or a UI element added/removed that affects how the product is used.
- Do NOT trigger for internal refactors, extracted modules, added tests, dev tooling, or changes to files/functions that produce byte-identical user-facing behaviour — even if extensive.
- If the change is a bugfix, update PRD.md only if the PRD's description of the feature was itself inaccurate (i.e. the bug meant the PRD never matched reality); do not update it for fixes that restore documented behaviour.
- **When in doubt whether a change is "user-visible," ask the user explicitly, one targeted question, rather than silently leaving PRD.md untouched.** (2026-09 revision — the previous "flagging beats guessing" rule let genuine gaps accumulate silently over many cycles; a 2026-09-16 `domain-audit` of `PRD.md` against the live app found 14 such gaps, several of them entire undocumented features. Silent omission is no longer acceptable for anything that touches a real, new user-facing screen, tab, button, or modal — ask instead of skip. A change that's genuinely internal after the user confirms it is still fine to leave undocumented; the fix is asking, not defaulting either way.)

### 5b. `.claude/skills/operational-manual/SKILL.md`'s inlined detail-content reference (only if PRD.md was updated in this cycle)
If PRD.md was touched above, check whether any of the changed sections fall within the manual's own scope (this skill's "PDash detail-content reference" section mirrors `PRD.md` section-by-section) and update that reference to match — same content, same level of care as when it was first built. This keeps the skill's own reference from silently going stale the same way `PRD.md` itself did before 2026-09-16, even though the manual (`docs/OPERATIONAL_MANUAL.html`) itself stays regenerated only on explicit request, not on every cycle.

### 6. docs/superpowers/PROCESS.md (only if the cycle changed the development *process* itself, not the product)

**PROCESS.md gate** — answer this as an explicit yes/no before deciding whether to touch the file. Does the cycle just closed satisfy **at least one** of:
1. It introduced or modified one of the process skills (`feature-brief`, the audit skill, `audit-to-brief`).
2. It introduced an exception to the standard process expected to be **recurring** (not a one-off already documented in that single cycle's own report).
3. It modified the common 7-phase skeleton, or the scenario-specific guardrails for one of the three scenarios (new feature / evolution / audit-fix).

- If **none** of the three is true → do not touch `PROCESS.md`; proceed normally with the other `/sync-docs` outputs.
- If **at least one** is true → update the relevant section of `PROCESS.md`, and note in the cycle's own report which of the three conditions triggered the update.

A cycle that merely *executes* the process as documented — the large majority of cycles — is not material for this file; it stays in that cycle's own report, not here.

### 7. Project memory (always evaluated, every run — added 2026-09-29)

The auto-memory directory named in the session's system prompt (`~/.claude/projects/<project>/memory/`, with its `MEMORY.md` index) lives **outside the repo**: it never appears in `git diff`, is never committed, and no other step of this command or of `/finish-cycle` touches it. Left alone, its `project`-type files describe the state of the world at the moment they were written and go stale as cycles close — on 2026-09-29 the backlog file still listed "Team UX polish" as NEXT after that cycle and two more had already been merged. This step exists to close that gap. It is applied **automatically, with no confirmation prompt** (the memory is working state, not a shipped artifact, and every change is grounded in facts already verified by the merge) — but never silently: every change is reported, see below.

1. **Find candidates.** Read `MEMORY.md`, then open every `project`-type file whose name, description or body mentions this cycle's branch, topic, migrations, pages/files touched, or a backlog/next-cycle list that the cycle affects. Skip `user`, `feedback` and `reference` files unless the cycle directly contradicts them (a rule that turned out wrong, a URL that changed).
2. **Update only what the cycle verifiably changed**, using facts available from the merge itself — commit/merge hashes, the report path, migration numbers, the diff, decisions taken in the conversation:
   - cycle status (in progress → merged, with date, merge hash and `docs/superpowers/reports/` path); rewrite stale "not merged yet / next step is /finish-cycle" wording rather than appending contradicting lines;
   - backlog / priority lists: mark finished items done and restate the real NEXT order — including a decision the user took during this cycle;
   - deploy prerequisites and known limitations: mark closed what this cycle closed; carry over what is still open;
   - delete or merge a memory that is now fully superseded (and drop its `MEMORY.md` line); fix a `MEMORY.md` line whose hook no longer matches its file.
3. **Never invent.** If the merge does not establish a fact (was an item done? is a limitation fixed?), leave the memory as it is and list it in the summary as "unverified — needs the user". Do not record things already derivable from the repo (code structure, git history, this file's own docs), and do not create a new memory just to narrate the cycle — the finish-cycle report is that record. A genuinely new non-obvious decision or constraint that surfaced in the cycle may become a new memory, following the memory format in the session's system prompt.
4. **Report every change** in the final summary (see Process, step 4), since there is no diff for it: per file touched, the path and the one or two lines changed, as *before → after*. If nothing needed changing, say "Memory: evaluated, no change" and name the files that were checked.

## Process

1. Read the current state of each file before editing.
2. Cross-reference against the actual code (js/, api/src/routes/, costgrid.html, config.html, etc.) to verify what changed.
3. Make targeted edits — do not rewrite sections that are still accurate.
4. Report a brief summary at the end: which files were updated and what changed in each. Always explicitly state whether PRD.md was evaluated and the outcome — updated / not necessary (internal-only change) / ambiguous (needs human verification) — even when PRD.md itself was left untouched. Always explicitly state the PROCESS.md gate's answer (which of the three conditions applied, or none) — even when PROCESS.md itself was left untouched. Always include a "Memory" line (section 7): each memory file changed with its before → after, plus any item left as "unverified", or "evaluated, no change" naming the files checked.
