# PRD.md vs. Actual Application Behavior Audit

**Date:** 2026-09-16
**Scope:** verification-only. Ground truth: `PRD.md` as it stood at the start of this audit (after extensive same-day edits made while brainstorming the `operational-manual` skill's HTML upgrade — see `docs/superpowers/specs/2026-09-16-operational-manual-html-upgrade-design.md`). Compared systematically against every user-facing page/route in the app: `pipeline.html`, `costgrid.html`, `planning.html`, `portfolio.html`, `project-config.html`, `timesheets.html`, `config.html`, `admin.html`, `login.html`/`activate.html`/`reset-password.html`/`terms.html`, `_terms-editor.html`, `_db-reset.html`, and their backing routes/services. A finding is: real user-facing behavior `PRD.md` doesn't mention at all, a `PRD.md` claim that is no longer (or was never) true, or a `PRD.md` claim that contradicts another part of `PRD.md`. Out of scope: internal implementation details with no user-facing surface (DB schema, variable names, file structure) — these are deliberately excluded from `PRD.md` by design, not a gap. No code was modified.

## Method

Six parallel passes, each covering a disjoint slice of `PRD.md` against its backing code, every claim requiring a `file:line` citation actually read in this session (not recalled from earlier context): (1) Settings/Notifications/AI Sidebar, (2) Authentication/GDPR, (3) User Administration, (4) Terms & Conditions editor/DB Reset, (5) Sharing & Permissions, (6) a re-verification pass over sections already patched earlier the same day (Pipeline, Cost Grid Editor, Resource Planning, Project Reporting, Project Configuration, Timesheet Upload) plus a full first pass on Client Groups and Programs, which had received almost no attention until this audit.

## Findings

### 1. [Critical] §11.3 "Resource Allocation Analysis" documents a feature that does not exist in the code
**Location:** `PRD.md` §11.3 vs. `js/ai.js` (all 6 top-level functions enumerated: `buildPlanningContext`, `aiPlanSend`, `renderAiPlanMessages`, `buildProjectSummary`, `callAi`, `openAiAnalysis`)
**Evidence:** No function detects overlapping task allocations, no ">28h/week" threshold check, no severity-ranked issue list exists anywhere in `js/ai.js` or any `*.html`. `openAiAnalysis()` (`js/ai.js:382-431`) is fully accounted for by §11.2 alone.
**Description:** The one real overallocation-related thing in the app is unrelated: a static, non-AI color legend on the Resource Planning table (`planning.html:621`, "Red = load > 30h/week") — different mechanism (static rule vs. AI analysis) and a different number (30h vs. PRD's stated 28h). Root cause unclear — either documented ahead of an implementation that was never finished, or built and later removed with no trace (no orphaned function, no dead code found). This is the inverse of every other finding below: not an omission, but the manual's primary hazard — describing a capability to end users that they cannot actually use.

### 2. [Important] AI provider calls bypass PDash's backend entirely — undocumented
**Location:** `PRD.md` §11 vs. `js/ai.js:334-380` (`callAi`)
**Evidence:** `fetch('https://api.anthropic.com/v1/messages', { headers: { 'x-api-key': apiKey, ... } })` and equivalent direct calls to OpenAI/Gemini — issued client-side, straight from the browser, using the user's own locally-stored key.
**Description:** The full project summary sent as the AI prompt (`buildProjectSummary`, includes financial figures) goes directly to the third-party provider, never through PDash's own servers. A genuine data-flow fact with privacy implications, absent from `PRD.md` entirely.

### 3. [Important] Password minimum length (8 characters) is enforced but never stated
**Location:** `PRD.md` §15 vs. `api/src/routes/auth.js:148,206,229`; UI: `activate.html:78,133`, `reset-password.html:72,126`
**Evidence:** `if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });`, enforced identically on activate, reset-password, and change-password; UI shows `placeholder="Min. 8 characters"`.

### 4. [Important] Session length (8 hours) lives only in a technical table, not in the Authentication section a user would check
**Location:** `PRD.md` §13 (non-functional table) vs. `api/src/services/jwt.js:4,20`
**Evidence:** `const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';`, cookie `maxAge: 8 * 60 * 60 * 1000`.
**Description:** §15 (Authentication) never states how long a session lasts before automatic sign-out; the fact exists only as a technical implementation detail elsewhere in the document.

### 5. [Important] §16.2's permission table contradicts §4.9's own, correctly-updated text from earlier today
**Location:** `PRD.md:772` (`| Manage programs | ✅ | ✅ | read-only |`) vs. `api/src/routes/config.js:72,94` (`POST`/`PATCH /programs`, both `requireAuth`)
**Evidence:** Programs can be created and renamed by any authenticated user, not just admins — a change made earlier in this same session and correctly reflected in §4.9's "Program auto-link" text and §7.6's rate-chain cross-reference, but never propagated to this cross-cutting summary table.
**Description:** Direct evidence that a cross-referencing summary table is exactly the kind of content that silently drifts even within a single, disciplined editing session — a single feature's auth change was correctly described in three places and missed in a fourth. `DELETE /programs/:id` remains `requireAdmin` (`config.js:165`, unchanged), so the correct row is `✅ | ✅ | create/rename ✅, delete ❌`.

### 6. [Important] §16.6 "reset by scope" compresses 7 distinct, individually-scoped destructive operations into one clause
**Location:** `PRD.md:799` vs. `_db-reset.html:131-139` / `api/src/routes/reset.js:10-69` (`SCOPES`)
**Evidence:** 7 keys (`proposals`, `projects`, `clients`, `ratecards`, `actuals`, `pipelines`, `notifications`), each with its own specific carve-out — e.g. agency-wide ratecards are spared by the `ratecards` scope, proposals already in SIP/Committed are spared by the `pipelines` scope.
**Description:** A reader has no way to know what any one scope actually deletes, or what it deliberately protects, before clicking it.

### 7. [Important] Program sharing ("🔗 Share Program") is entirely undocumented in §18
**Location:** `PRD.md` §18.2 vs. `js/shares.js:196-199,274-279,339-362`; live at `portfolio.html:116`; backend `api/src/routes/config.js:124-143`
**Evidence:** `openShareModal('program', ...)` on every program group's header row; sharing a program grants the chosen permission on **every project currently in it**, in one action; requires the sharer to be admin or already own/edit at least one project in the program.
**Description:** §18.2 as written only describes sharing a cost grid or a single project — a third, cascading resource type is missing entirely, including its ownership precondition.

### 8. [Important] §7.5 Programs — the ID becomes permanently uneditable after creation
**Location:** `PRD.md` §7.5 vs. `config.html:776-780`
**Evidence:** `<input ... :disabled="!!pf.id">` under the label "ID (fixed after creation)".
**Description:** A user who mistypes a program ID has no fix path from this screen — a real, consequential constraint absent from §7.5's two-sentence description. (Directly relevant to the deferred "let a user edit programs they created" cycle discussed earlier today — that cycle will need to account for this constraint.)

### 9. [Important] §7.5 Programs — deleting a program with linked projects is blocked outright, but the UI's own confirmation text says otherwise
**Location:** `PRD.md` §7.5 (silent on this) vs. `config.html:1515` (confirm text: *"Projects in this program will lose the program reference"*) vs. `api/src/routes/config.js:211-213` (`if (linked.count > 0) return res.status(400)...`)
**Evidence:** The backend unconditionally refuses to delete a program with any linked project; the confirm dialog's own wording implies deletion always succeeds and merely unlinks projects.
**Description:** Two things worth separating: `PRD.md` doesn't document the real (blocking) behavior, and the app's own confirm-dialog copy is misleading regardless of what `PRD.md` says — the second is a small product bug surfaced by writing this finding, not a documentation gap on its own. Not fixed here per audit rules (Step 4).

### 10. [Minor] "Type DELETE to confirm" safety mechanism on `_db-reset.html` is undocumented
**Location:** `PRD.md:799` vs. `_db-reset.html:107-108,112`
**Evidence:** Every destructive action (all 7 scopes, plus single-proposal delete) requires typing the literal word "DELETE" into a field, not just a click-through modal.

### 11. [Minor] "👁 Preview" button on the Terms & Conditions editor is undocumented
**Location:** `PRD.md` §16.5 vs. `_terms-editor.html:41`
**Evidence:** Opens `/terms.html` (the live acceptance page) in a new tab, rendering the current **draft** as a real user would see it, before publishing.

### 12. [Minor] Share is hidden entirely for Draft-stage proposals — never stated, only implied
**Location:** `PRD.md` §18.2 vs. `pipeline.html:150,177`, `costgrid.html:37` (all three Share entry points gated `v-if="... !== 'Draft'"`)
**Description:** Follows naturally from Draft being private to its creator (§4.2), but a reader of §18.2 alone has no way to know why Share is missing from a Draft proposal's toolbar.

### 13. [Minor] §7.3 Client Groups — deleting a group un-groups its clients, doesn't delete them
**Location:** `PRD.md` §7.3 (says only "CRUD: create, rename, delete") vs. `config.html:1426`
**Evidence:** Confirm text: *"Clients will become ungrouped."* Unlike finding 9, this one is internally consistent (no contradiction found) — just under-stated.

### 14. [Minor] Restore-from-Backup's non-functional verdict is correct but incompletely explained
**Location:** `PRD.md` §9.2 vs. `js/settings.js:99-119,127-160`
**Evidence:** `PRD.md` cites two key-name mismatches (`s.config`/`s.costgrids` vs. what's actually written). The other keys it reads (`roles`/`programs`/`clients`) *do* match the backup file's own keys, but still wouldn't persist anything — their save functions are documented no-ops in this now fully API-backed app, and every page reloads state fresh from the API on load.

## Ruled out (checked, `PRD.md` accurate)

- §9.1 API & Integrations tab (3 providers, `localStorage` key) — matches `js/settings.js:12-19`.
- §9.2 Exports table and admin-only gating on Roles in Rate Cards — matches `js/nav.js:333-337`.
- §10.1-10.3 Notification bell/SSE/panel behavior — matches `js/notifications.js` in full.
- §11.1/§11.2/§11.4 (Planning Assistant, Project Analysis, provider URLs) — all confirmed accurate.
- Login generic error / no enumeration, disabled-account refusal, invite (48h) and reset (2h) token lifetimes, forgot-password always-success — all confirmed in `api/src/routes/auth.js`.
- T&C gate checkbox behavior (`terms.html:77,82-83`) and Profile Rectification validation (`auth.js:42-68`) — confirmed.
- §16.1 user list/status filter, §16.2 sysadmin-exclusive rows, "no account starts as sysadmin," §16.3 two-step promotion + self-modification block + sysadmin-only-modifiable-by-sysadmin (frontend and backend, including the live-re-read actor role), §16.4 Anonymize preconditions — all confirmed against `admin.html` and `api/src/routes/users.js`.
- §16.5's draft/publish/version-history mechanics, both pages' sysadmin-exclusive gating, the "Change proposal owner" and "Delete single proposal" widgets — confirmed.
- §18.2's non-admin-user search scope, no free-text invites, editable permission on an existing share, §18.3's owner-row-can't-be-removed rule, §18.4's viewer-enforcement table (spot-checked) — all confirmed.
- Client Groups' "at most one group per client" rule — confirmed enforced UI-side.
- A re-verification spot-check of `pipeline.html`, `costgrid.html`, `planning.html`, `portfolio.html`, `project-config.html`, `timesheets.html` against sections already patched earlier today found no further stragglers within the time available for that slice.

## Out of scope / roadmap notes

- `js/sync.js` (303 lines, a full "GitHub Gist remote sync" subsystem) is not `<script>`-loaded by any `.html` file — fully orphaned dead code predating the current API-backed architecture. Not a `PRD.md` gap (nothing user-reachable to document); a dead-code cleanup candidate.
- `js/settings.js:18,64` references a DOM element (`#stgGithubPat`) that doesn't exist in the actual injected modal markup — silently a no-op, tied to the same orphaned `sync.js` subsystem above.
- Italian-language user-facing strings in `js/ai.js:404-406` ("Nessuna API key AI configurata", "Provider non supportato") violate CLAUDE.md's English-only constraint. Not a `PRD.md` divergence, but a real bug worth a dedicated fix cycle.
- Client Groups and Programs deletion (`config.html:1426,1515`) both use a native browser `confirm()` rather than this app's own styled modal idiom used almost everywhere else, including elsewhere in the same file. A UI-consistency finding, not a documentation gap.
- `js/share-list-component.js`'s own usages were not independently re-verified in this pass (covered by existing §18.3 text, and the fork's time went to the program-sharing gap instead) — worth a quick confirmation if a further audit pass happens.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
