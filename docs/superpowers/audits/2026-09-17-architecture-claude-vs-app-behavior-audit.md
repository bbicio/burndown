# Audit: ARCHITECTURE.md / CLAUDE.md vs actual app behaviour

**Date:** 2026-09-17
**Auditor:** domain-audit skill, 6 parallel scoped passes

## Scope

Confirmed with the user before any code was read:

- **Files under audit:** `ARCHITECTURE.md` and `CLAUDE.md` (project instructions/architecture reference), checked against the live codebase.
- **Breadth:** whole codebase — frontend pages, shared JS libs (`js/*.js`, `js/lib/*`), backend (`api/src/routes/`, `api/src/lib/`, `api/src/middleware/`, `api/src/services/`), DB schema/migrations, infra scripts (`scripts/*.sh`, `docker-compose.yml`, `api/Dockerfile`), and cross-cutting architectural patterns documented in CLAUDE.md's back half plus ARCHITECTURE.md's own overview sections.
- **Finding definition:** both directions — a doc claim that no longer matches the code (stale), and a real, shipped pattern/module/endpoint/table that neither doc mentions (gap).
- **Ground truth:** the live code is authoritative; no exclusions (worktree-local doc variants and in-flight branches were not carved out).

This mirrors the scope and method of the 2026-09-16 `PRD.md`-vs-app audit, applied here to the two architecture/implementation-detail docs instead.

## Method

Six independently-scoped fork subagents, each following this skill's evidence standard (file:line citation for every claim, root-cause before classifying, never fixing, isolating out-of-scope discoveries):

1. Frontend pages and routing (`*.html`, CLAUDE.md's Pages table / File structure / Routing / v-cloak sections)
2. Shared classic-script JS libs and `js/lib/` ES modules
3. Backend routes, lib, middleware, services (`api/src/`)
4. DB schema and migrations (`api/src/db/migrations/*.sql`)
5. Infra scripts and Docker setup (`docker-compose.yml`, `api/Dockerfile`, `scripts/*.sh`)
6. Cross-cutting architectural patterns (CLAUDE.md's back-half sections) plus ARCHITECTURE.md's own overview content

Two of the six (infra scripts, cross-cutting patterns) hit a session rate limit mid-run and were relaunched fresh; both completed on retry.

## Findings

### 1. [Critical] ARCHITECTURE.md's DB schema section (§5) is missing the entire multi-currency schema
- **Location:** `ARCHITECTURE.md:264,319` (`cost_grid_versions.currency`/`projects.currency` shown as bare `CHAR(3) DEFAULT 'EUR'`) vs `api/src/db/migrations/012_currencies.sql:49-61`
- **Evidence:** the migration replaces the plain `CHAR(3)` column with `currency VARCHAR(10) NOT NULL DEFAULT 'EUR' REFERENCES currencies(code)` on both tables, adds `cost_grid_versions.currency_rate DECIMAL(10,6)`, and introduces two new tables — `currencies` (20-row seed, EUR always active/locked at 1:1) and `currency_rates` (history log) — neither of which appears anywhere in ARCHITECTURE.md §5.
- **Root cause:** the migration was never given a docs pass. Multi-currency is a heavily-used, actively-developed feature elsewhere in the codebase (per CLAUDE.md's own extensive pipeline/rate-chain prose and the 2026-09-16 PRD.md audit, which documented the live Currencies admin tab) — yet its actual DB shape is invisible in the architecture reference.

### 2. [High] Four migration files are absent from both CLAUDE.md's migrations table and ARCHITECTURE.md's §8 list
- **Location:** `api/src/db/migrations/012_currencies.sql`, `012_project_code.sql`, `012_project_task_date_char8.sql`, `016_version_project_task_ids.sql` vs `CLAUDE.md:861-881` and `ARCHITECTURE.md:934-951`
- **Evidence:** both docs list only 16 rows, jumping `011_pot_history_note.sql` → `013_role_rate_overrides.sql` and `017_task_names_direct.sql` → `018_sysadmin_role.sql`. The filesystem has 20 migration files. Both docs share the identical gap — neither drifted from the other; both are equally stale against the filesystem.
- **Root cause:** three files share the number `012` (a naming collision — three different cycles independently picked the same next-number), and `016` was likely added the same way. `/sync-docs`'s migration-table step was evidently skipped for whichever cycles introduced these, probably because the change was folded into a larger cycle whose docs pass focused on the feature (e.g. currencies, project code, task-date widening), not the incidental migration file.

### 3. [Major] ARCHITECTURE.md has no `currencies.js` route file at all — 5 live endpoints undocumented
- **Location:** `api/src/routes/currencies.js` (whole file), mounted at `api/src/index.js:55` — vs `ARCHITECTURE.md`'s §6 API Reference and CLAUDE.md's `api/src/routes/` one-line summary (which also omits it)
- **Evidence:** `GET /api/currencies/active` (requireAuth), `GET /api/currencies` (requireAdmin), `POST /api/currencies/:code/activate` (requireAdmin), `PATCH /api/currencies/:code/rate` (requireAdmin), `GET /api/currencies/:code/history` (requireAdmin) — all live, all unmentioned in either doc.
- **Root cause:** same pattern as Finding 1 — the Currencies admin-tab feature was confirmed live and added to `PRD.md` in the 2026-09-16 audit, but the backend-facing architecture docs were never updated in the same pass.

### 4. [Major] ARCHITECTURE.md's embedded `docker-compose.yml` snippet is a stale, incomplete snapshot
- **Location:** `ARCHITECTURE.md:627-675` vs `docker-compose.yml:1-99`
- **Evidence:** the real file has `container_name` on every service, healthchecks on `db`/`api`, a full `test` service/profile (the integration-test runner), and an `adminer` service. The doc's snippet has none of these — no `container_name`, no healthchecks, no `test` profile, no `adminer`.
- **Root cause:** the snippet was pasted once (doc dated 2026-06-25) and never re-synced. All four missing pieces are load-bearing: `pdash-adminer` is explicitly named in CLAUDE.md's own infra-safety guardrail as part of the main stack, and the healthchecks back `wait_healthy()` in both `test-branch.sh` and `run-tests.sh`.

### 5. [Major] `scripts/backup-db.sh` is entirely absent from ARCHITECTURE.md
- **Location:** ARCHITECTURE.md's scripts/ subsection (`:833-906`, documents only `test-branch.sh`/`run-tests.sh`) vs `scripts/backup-db.sh` (74 lines, live)
- **Evidence:** the script is the preferred backup path per CLAUDE.md, and runs automatically (no confirmation) from `/finish-cycle` Gate 4 after every merge. ARCHITECTURE.md has no backup/restore/recreation section at all.
- **Root cause:** added 2026-09 after the `burndown_pgdata` wipe incident; the fix flowed into CLAUDE.md (which carries binding operational instructions) but never into ARCHITECTURE.md.

### 6. [Medium] ARCHITECTURE.md's page-by-page descriptions (§7) are visibly behind CLAUDE.md's for the same pages
- **Location:** `ARCHITECTURE.md:748-825`
- **Evidence:** `portfolio.html`'s paragraph (`:754`) has no mention of the search/Status-filter row or the `⚙️ Configure` button on list cards (both live, `portfolio.html:43,61,65,147,180,226`). `costgrid.html`'s paragraph (`:779-808`) has zero mention of the Sharing card, `<share-list>`, owner reassignment, or the Generate-Project/program-auto-link modals — despite owner-reassign being documented elsewhere in the *same file* (§3.3/§6, lines 80 and 519), an internal self-contradiction. `pipeline.html`'s paragraph (`:749-753`) has no mention of the 2026-09 filter bar.
- **Root cause:** §7's directory-tree paragraphs were written as a one-time snapshot (2026-06-25) and never received the same per-cycle update discipline CLAUDE.md's file-structure table got, even though other sections of the *same* ARCHITECTURE.md file were updated for some of these same features.

### 7. [Medium] `js/roles.js` documented as "roles management modal" — the modal code was deleted 2026-08
- **Location:** `ARCHITECTURE.md:742` vs `js/roles.js:1-27`
- **Evidence:** the file now contains only `loadRolesFromApi()`, `saveRoles()` (no-op), `getRoles()` — no modal code. CLAUDE.md's own entry for this file already documents the 2026-08 dead-code deletion correctly; ARCHITECTURE.md's §7 tree was never updated to match.

### 8. [Medium] `js/costgrid.js`'s 2026-09 Generate Project / program auto-link flow is undocumented in ARCHITECTURE.md
- **Location:** `ARCHITECTURE.md:701-708` vs `js/costgrid.js` (`_cgPendingGeneration` line 16, `cgConfirmAndGenerate()` line 1112, `cgSubmitProjectName()` line 1127, `cgResumePendingGeneration()` line 1171, `cgAbortPendingGeneration()` line 1182)
- **Evidence:** none of this appears in ARCHITECTURE.md's directory-tree description of the file, which stops at the R1–R5 task-assignment/dead-code-cleanup content already documented.
- **Root cause:** feature added after ARCHITECTURE.md's §7 entry was last touched; `/sync-docs` updated CLAUDE.md (which documents it fully) but not ARCHITECTURE.md in the same cycle.

### 9. [Medium] ARCHITECTURE.md §5.4 `projects` table is missing the `code` column
- **Location:** `ARCHITECTURE.md:312-329` vs `api/src/db/migrations/012_project_code.sql:2`
- **Evidence:** migration adds `projects.code VARCHAR(100)` (the D365 Project ID field, referenced throughout CLAUDE.md's own prose); not listed among `projects`'s columns in §5.4.

### 10. [Medium] ARCHITECTURE.md §5.4 states `project_tasks.start_date`/`end_date` are `CHAR(6)` — actually `CHAR(8)`
- **Location:** `ARCHITECTURE.md:317-318` (`CHAR(6), -- YYYYMM`) vs `api/src/db/migrations/012_project_task_date_char8.sql:3-5`
- **Evidence:** the migration widens both columns to `CHAR(8)` (YYYYMMDD), backfilling existing 6-char values to `YYYYMM01`. This is an active wrong claim, not just a gap.

### 11. [Medium] ARCHITECTURE.md has no counterpart to CLAUDE.md's Docker main-stack safety guardrail
- **Location:** CLAUDE.md's top-of-file "Infrastructure safety" section (no `-v` on main stack, snapshot-first, confirm-first) has no equivalent anywhere in ARCHITECTURE.md
- **Evidence:** the rule exists because of a cited real incident (2026-08-05, `burndown_pgdata` wipe) and is enforced in practice by `/finish-cycle` Gate 4's automatic `backup-db.sh` call. ARCHITECTURE.md, despite being the architecture/ops reference, is silent on it.
- **Root cause:** added directly to CLAUDE.md as a binding instruction; never backfilled into ARCHITECTURE.md as informational/architectural content.

### 12. [Low-Medium] ARCHITECTURE.md §5.3 `cg_version_projects` is missing the `task_ids` column
- **Location:** `ARCHITECTURE.md:300-306` (lists only `task_names_direct`, migration 017) vs `api/src/db/migrations/016_version_project_task_ids.sql:6`
- **Evidence:** migration 016 (one number before the already-documented 017) adds `task_ids JSONB NOT NULL DEFAULT '[]'::jsonb`; actively used (`cgGetAssignedTaskIds()`, `js/costgrid.js`).

### 13. [Low-Medium] Stale internal file reference in CLAUDE.md's "Pipeline stage: single source of truth" section
- **Location:** CLAUDE.md's pipeline-stage section, the line citing `js/planning.js`'s Resource Planning view reading `config.projects[].pipeline` directly
- **Evidence:** `js/planning.js` no longer exists — deleted during `planning.html`'s Vue migration, per CLAUDE.md's own `planning.html` and `js/lib/` entries. The underlying behavior is still accurate (`planning.html:276,281,917,1181` read `p.pipeline` directly, unchanged); only the file citation is stale — the logic moved inline into `planning.html`'s Vue app.
- **Root cause:** this cross-reference predates the Vue migration and was never updated when the code moved, even though sibling sections of the same document were kept current — an internal self-contradiction within CLAUDE.md itself, not just staleness vs. code.

### 14. [Minor] `api/src/routes/reporting.js`'s `GET /phasing` and `GET /project-phasing` undocumented
- **Location:** `reporting.js:196,324` vs ARCHITECTURE.md §6's "Timesheet + Reporting" table (lists only `/portfolio`, `/projects/:id`, `/planning`, `/pipeline`)

### 15. [Minor] `api/src/routes/exports.js`'s `GET /phasing` undocumented
- **Location:** `exports.js:224` (requireAdmin) vs ARCHITECTURE.md §6's "Exports" table (lists only the 3 `POST` routes)

### 16. [Minor] Two `api/src/lib/` files undocumented in both docs
- **Location:** `api/src/lib/sold-hours.js` (exports `isValidSoldHours`/`SOLD_HOURS_FRACTIONS`, consumed by `cost-grids.js`/`projects.js` for quarter-hour validation), `api/src/lib/email-template.js` (exports `renderEmailHtml`, the shared HTML wrapper for every system email)

### 17. [Minor] `findExistingProgramForProposal()` undocumented
- **Location:** `js/lib/costgrid-calc.js:124` — part of the Generate Project/program auto-link flow (Finding 8), not listed among this file's documented exports in ARCHITECTURE.md

### 18. [Minor] `_pushProjectToApi()`'s return-value contract undocumented in ARCHITECTURE.md
- **Location:** `js/api-sync.js:244-245` — 2026-09 change (`true`/`false` based on whether the core upsert persisted, consumed by `cgDoGenerateProject()`); ARCHITECTURE.md's entry for this function only describes its currency-symbol mapping

### 19. [Minor] `js/nav.js`'s sysadmin menu block and dropdown-submenu restructuring undocumented
- **Location:** `js/nav.js:39,50,53` (`sysAdminHtml`, `.nav-role-menu-trigger.dropdown-toggle`) vs ARCHITECTURE.md's terse `nav.js` entry (only mentions settings/change-pwd/profile modals + `initNotifications()`)

### 20. [Low] `js/portfolio.js` described as "portfolio dashboard" — mostly dead code now
- **Location:** ARCHITECTURE.md's `js/portfolio.js` entry — only 2 of its exports (`fmtProjectTitle`, `getMonthRangeFromCfg`) remain reachable (consumed by `planning.html`); the rest is dead since `portfolio.html`'s Vue rewrite folded that logic in directly. Not a false claim, but misleading as to current relevance.

### 21. [Low] `test-branch.sh`'s `schema_exists()` description missing its third, newest check
- **Location:** `ARCHITECTURE.md:850-852` ("added by the last migration file") vs `scripts/test-branch.sh:134-149`
- **Evidence:** the real function also checks `to_regclass('public.terms_versions')` (migration 019, 2026-09) — a third, later-added check. The phrase "added by the last migration file" is now factually wrong (019, not 017, is last). CLAUDE.md's identical prose already describes this third check accurately.

### 22. [Trivial] "9-line redirect" claim is off by one
- **Location:** `ARCHITECTURE.md:13` and CLAUDE.md's intro line vs `index.html` (actually 10 lines)

## Ruled out (checked, no divergence)

- CLAUDE.md's Pages table (redirect mechanism, sysadmin-exclusive gating on `_db-reset.html`/`_terms-editor.html`) — accurate.
- CLAUDE.md's "v-cloak" claim (every Vue-mounted page's root carries `v-cloak`) — spot-checked, present as described.
- ARCHITECTURE.md §3.3/§6's Sharing and owner-reassignment claims — accurate and current (unlike §7's page paragraphs).
- `requireAuth`/`requireAdmin`/`requireSysAdmin` (`api/src/middleware/auth.js`) — matches both docs exactly.
- `reset.js`'s 7 scopes and cascade SQL — matches ARCHITECTURE.md's Admin/Bulk Reset section.
- `config.js`'s Programs auth relaxation (2026-09) — ARCHITECTURE.md's Configuration table is already current on this.
- POT endpoints (`pots.js`) — spot-checked, present as documented.
- CLAUDE.md's Data strategy table — all 5 named sync functions confirmed present and accurate.
- ARCHITECTURE.md §1 Overview / §2 Stack — accurate.
- ARCHITECTURE.md §9 Security Notes — consistent with verified auth-route behavior.
- `scripts/run-tests.sh` — ARCHITECTURE.md's description matches (structure-level spot check).
- `scripts/backup-db.sh`'s own internal logic — accurate against CLAUDE.md's description (the finding is CLAUDE.md having it and ARCHITECTURE.md lacking it entirely, not an inaccuracy).
- `api/src/create-admin.js` — matches ARCHITECTURE.md's description exactly.
- `001_initial.sql`'s `task_roles.days DECIMAL(6,2)` — matches ARCHITECTURE.md's schema at the column-name/type level (the semantic hours-vs-days correction was already closed in the separate `PRD.md` audit and is app-behavior, not schema, documentation).
- All migrations 001–011, 013–015, 017–019 in the existing 16-row table — descriptions match their actual file contents.

## Out of scope / roadmap notes

- `019_terms_versions.sql` **is** listed in ARCHITECTURE.md §8's migration table, but has **no corresponding table definition** in ARCHITECTURE.md §5's schema section — an internal inconsistency between the same file's own two migration-related sections, not a doc-vs-code divergence. Worth folding into whichever fix cycle addresses Finding 1/2's schema-section gaps.
- Several forks independently observed that ARCHITECTURE.md's per-page/per-file prose (§7) reads noticeably older/more terse than CLAUDE.md's equivalent entries across the board — this pattern shows up in nearly every finding above (7, 8, 19, 20) and suggests `/sync-docs`'s CLAUDE.md step has consistently been kept current while its ARCHITECTURE.md step has not, over many cycles, not just isolated misses. Worth a process-level look (parallel to the `PRD.md` gate softened in `sync-docs/SKILL.md` §6 on 2026-09-16) rather than treating each instance as independent.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.