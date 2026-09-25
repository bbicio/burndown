# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For the development workflow (new feature / evolution / audit-fix), see [docs/superpowers/PROCESS.md](docs/superpowers/PROCESS.md).

**Process override — closing a development branch:** in this project, `/finish-cycle` (`.claude/commands/finish-cycle.md`) is the terminal step of every execution phase, whether run inline, via `superpowers:executing-plans`, or via `superpowers:subagent-driven-development`. Never invoke `superpowers:finishing-a-development-branch` at the end of a plan's execution — `/finish-cycle` already performs its own test gate, code review, `--no-ff` merge, push, and worktree cleanup (Gate 4). Do not merge or push a feature branch by any other means (manual `git merge`/`git push`, or the generic finishing skill) before `/finish-cycle` has run.

**Infrastructure safety — Docker commands against the main stack (`pdash-db`/`pdash-api`/`pdash-nginx`/`pdash-adminer`, project `burndown`):** never delegate a plan task or subagent dispatch that runs `docker compose` (`up`/`down`/`restart`/etc.) directly against the main stack without all three of the following. Origin: on 2026-08-05, a delegated implementer subagent verifying `scripts/run-tests.sh` (isolated test-profile work, see `docs/superpowers/reports/2026-08-05-worktree-docker-test-profile-container-names-finish-cycle.md`) wiped the real `burndown_pgdata` volume — almost certainly by running `docker compose down -v` against the main project instead of the isolated `pdash_test` one, most likely copying the `-v` habit from the isolated script's own cleanup logic. Recovery only worked because an unrelated, incidental `pg_dump` snapshot happened to exist from an earlier cycle — not because of any designed safety net.
1. **No `-v`/`--volumes` against the main stack, ever, ideally not even flagged as "not needed."** Any dispatch prompt that instructs an agent to run `docker compose down`/`up`/`restart` against the main project must explicitly forbid `-v`/`--volumes` in that same instruction, and must tell the agent to stop and escalate rather than trying a more aggressive command if the plain command doesn't behave as expected.
2. **Snapshot before touching it.** Before any agent-run Docker-lifecycle operation on the main stack as part of a verification or test step, take an explicit `pg_dump` backup first (see "Database backup & full recreation" below) — do not rely on an incidental leftover dump from an unrelated prior cycle.
3. **Treat it as a risky, confirm-first action.** `docker compose down`/`up`/`restart` against the main stack, even without `-v`, requires the same explicit human confirmation as other hard-to-reverse actions (per the top-level Executing Actions guidance) — it is not "safe because reversible in theory." Prefer, wherever the plan allows, verifying against an isolated stack (`scripts/test-branch.sh`, `scripts/run-tests.sh`) instead of touching the main stack at all.

## Development

The app runs via Docker Compose. Start everything with:

```bash
docker compose up
# then open http://localhost
```

The nginx container serves static files; the api container runs Node.js/Express on port 3000; the db container runs PostgreSQL 16.

Hot reload for the API: `./api/src` is volume-mounted into the container, so Node.js file changes are picked up by nodemon without a rebuild.

To bootstrap the first admin user (or reset a password):

```powershell
docker exec pdash-api node /app/src/create-admin.js <email> <password> [firstName] [lastName]
```

To run database migrations:

```powershell
docker exec pdash-db psql -U pdash -d pdash -f /path/to/migration.sql
```

### Database backup & full recreation

There was previously no documented procedure for this — added 2026-08-05 after an incident (see "Infrastructure safety" above) where the main stack's data volume was accidentally wiped and recovery depended entirely on an unrelated, incidental leftover backup file.

**Backup (preferred — automated, run before any risky operation on the main stack):**

```bash
scripts/backup-db.sh
```

Writes a timestamped `pg_dump -Fc` snapshot to `backups/` (gitignored — real data, including PII, must never reach git), keeping only the 3 most recent dumps and pruning older ones automatically. Non-blocking by design: if `pdash-db` isn't running, it warns and exits 0 rather than failing whatever called it. `/finish-cycle`'s Gate 4 (2026-09) runs this automatically, with no confirmation prompt, right after merge is confirmed and before any merge state changes — so every merge to `main` leaves a fresh data snapshot behind, not just a structural one recoverable from `api/src/db/migrations/`.

**Backup (manual fallback — equivalent to what the script above does):**

```powershell
docker exec pdash-db pg_dump -U pdash -Fc pdash > pdash-backup-<date>.dump
```

**Restore from a backup** (into a running, empty or to-be-overwritten `pdash-db`):

```powershell
docker cp pdash-backup-<date>.dump pdash-db:/tmp/restore.dump
docker exec pdash-db pg_restore -U pdash -d pdash --clean --if-exists --no-owner /tmp/restore.dump
docker exec pdash-db rm /tmp/restore.dump
```

**Full recreation from scratch** (empty volume, no backup — e.g. first-ever setup, or genuine data loss with no dump available): apply every migration file in `api/src/db/migrations/` in filename order, then bootstrap the first admin user:

```powershell
for f in api/src/db/migrations/*.sql; do docker exec -i pdash-db psql -U pdash -d pdash < "$f"; done
docker exec pdash-api node /app/src/create-admin.js <email> <password> [firstName] [lastName]
```

This is the same migration-loop pattern `scripts/test-branch.sh` and `scripts/run-tests.sh` already use internally for their own isolated stacks — nothing in the running app (`api/Dockerfile`, `api/src/index.js`, `create-admin.js`) applies migrations automatically, so a genuinely empty `pdash-db` stays schema-less until this loop is run by hand.

To test a feature branch in isolation before merging (separate containers/ports, doesn't touch the `main` stack):

```bash
scripts/test-branch.sh up      # build + start, clone data from main if running
scripts/test-branch.sh down    # tear down
scripts/test-branch.sh status  # "up" (exit 0) or "down" (exit 1) — both containers must be Docker-healthy
                                # for "up" (2026-08: previously just checked they existed via `docker ps`)
```

`/finish-cycle`'s Gate 2 calls `status` automatically to detect a branch environment still running from an earlier `/finish-cycle` attempt on the same branch, and asks to reuse or rebuild it instead of the plain "spin up now?" question.

No bundler, no build step for the **runtime** — nginx serves `js/`/`css/` files exactly as they are on disk, and this must stay true.

A dev-only test toolchain exists for the frontend: root `package.json` + vitest + jsdom, isolated from the runtime (see `js/lib/` below). It is never bundled, never served — `node_modules/`, `package.json`, `package-lock.json`, `vitest.config.js`, and any `*.test.js`/`*.spec.js` file are explicitly denied in `nginx.conf`. Run tests with `npm test` (single run) or `npm run test:watch`.

The backend has its own, separate unit-test toolchain: Node's built-in `node:test` runner (zero new dependency), scoped to `api/src/**/*.test.js` via `api/package.json`'s `"test"` script (`node --test src/**/*.test.js`, run from inside `api/`). This is deliberately kept independent from the frontend's `vitest` config — `vitest.config.js`'s `include` (`js/**/*.test.js`) never picks up `api/` files, and the backend runner never touches `js/`. Files that `require()` Express/DB modules (e.g. `api/src/routes/timesheets.test.js`, which imports `./timesheets`) need `api`'s `node_modules` present — run via `docker exec pdash-api node --test src/...` (the container already has them and volume-mounts `api/src` live) if the host has no `api/node_modules` installed. Pure `api/src/lib/*.test.js` files have no such dependency and run anywhere.

Still no linter on the frontend or backend.

---

## Architecture

Multi-page app backed by a Node.js/Express REST API and PostgreSQL. Every page is Vue 3 (loaded via CDN, no build step) except the 9-line `index.html` redirect — the Vue migration (tracked page-by-page below) completed 2026-08-05 when `planning.html`, the last holdout, moved over. A handful of shared library files (`js/costgrid.js`, `js/clients.js`, `js/roles.js`, `js/programs.js`, `js/ratecards.js`, `js/ai.js`, `js/upload.js`, `js/shares.js`, `js/notifications.js`, `js/nav.js`, `js/core.js`, `js/api.js`, `js/api-sync.js`, `js/settings.js`) remain classic (non-Vue) scripts loaded as globals by the Vue pages — see the file-by-file notes below for which pages load which.

### Pages

**Documentation routing convention:** the "Purpose" column below is a one-line summary only. Per-page implementation detail — cycle-by-cycle narrative, methods touched, first-attempt bugs, report references — lives in `docs/pages/<page-name>.md` (one file per page, created as each page's narrative is split out of this file; not every page has one yet). When working on a page that has a `docs/pages/` file, read that file, not this table, for implementation detail; when documenting a change to a page that has one, write the narrative there, not here. See `/sync-docs`'s routing rule for the imperative version of this instruction.

| File | Route | Purpose |
|---|---|---|
| `index.html` | `/` | Redirect → `/pipeline.html` |
| `pipeline.html` | `/pipeline.html` | Pipeline board + cost grid editor access, Vue 3 (CDN, no build step, same pattern as `portfolio.html`/`project-config.html`). Full narrative: [docs/pages/pipeline.md](docs/pages/pipeline.md) |
| `portfolio.html` | `/portfolio.html` | Project reporting dashboard (portfolio overview + per-project KPI/burndown), Vue 3 (CDN, no build step, same pattern as `admin.html`/`project-config.html`). Full narrative: [docs/pages/portfolio.md](docs/pages/portfolio.md) |
| `planning.html` | `/planning.html` | Resource planning view, Vue 3 (CDN, no build step, same pattern as `pipeline.html`/`costgrid.html`). Full narrative: [docs/pages/planning.md](docs/pages/planning.md) |
| `costgrid.html` | `/costgrid.html?cgId=&verId=` | Cost grid editor (full-page), Vue 3 (CDN, no build step, same pattern as `pipeline.html`/`portfolio.html`). Full narrative: [docs/pages/costgrid.md](docs/pages/costgrid.md) |
| `timesheets.html` | `/timesheets.html` | XLS timesheet upload management. Full narrative: [docs/pages/timesheets.md](docs/pages/timesheets.md) |
| `config.html` | `/config.html` | Clients / client groups / programs / roles / pipelines & POT targets (admin only). Full narrative: [docs/pages/config.md](docs/pages/config.md) |
| `project-config.html` | `/project-config.html?projectId=` | Full-page project config form (tasks, phasing, planning, groups); viewer mode: sticky read-only banner + all inputs disabled + action buttons hidden. Full narrative: [docs/pages/project-config.md](docs/pages/project-config.md) |
| `admin.html` | `/admin.html` | User management — invite, role, disable, anonymize (admin **or sysadmin**); role toggle admin↔user open to any admin/sysadmin, grant/revoke sysadmin restricted to sysadmin viewers only. Full narrative: [docs/pages/admin.md](docs/pages/admin.md) |
| `terms.html` | `/terms.html?next=` | Public (auth required) — T&C acceptance page shown on first login or after version bump. Full narrative: [docs/pages/terms.md](docs/pages/terms.md) |
| `login.html` | `/login.html` | Public — login form |
| `activate.html` | `/activate.html?token=` | Public — account activation |
| `reset-password.html` | `/reset-password.html?token=` | Public — password reset |
| `_db-reset.html` | `/_db-reset.html` | **Sysadmin-exclusive** hidden page for bulk DB data deletion by scope, Vue 3 (CDN, no build step, same pattern as `admin.html`), linked from the sysadmin-only navbar menu (`initNav('dbreset', ...)`); also has "Delete single proposal" widget (UUID input, cascade delete) and "Change proposal owner" widget (UUID + active-user dropdown). Full narrative: [docs/pages/db-reset.md](docs/pages/db-reset.md) |
| `_terms-editor.html` | `/_terms-editor.html` | **Sysadmin-exclusive** hidden page — Terms & Conditions editor, Vue 3 (CDN, no build step, same pattern as `_db-reset.html`), linked from the sysadmin-only navbar menu (`initNav('termseditor', ...)`); moved here from `admin.html`'s former T&C card, which is now removed. Full narrative: [docs/pages/terms-editor.md](docs/pages/terms-editor.md) |
| `team.html` | `/team.html` | Resource registry CRUD (name/email/role by id/job description, optional link to a PDash user) plus, since 2026-09 (Cycle 3b), an "Unmatched names" queue (its own page tab) that links the free-text owner names found in uploaded actuals to resources (aliases), and (Team UX, 2026-09-25) a sortable table, a resource detail side panel and a searchable assign control, and (Cycle 3c, 2026-09-25) an "Experience profile" tab showing the per-person hours tree; admin **or sysadmin**, linked from the ⚙ Admin dropdown. Full narrative: [docs/pages/team.md](docs/pages/team.md) |
| `attribute-lists.html` | `/attribute-lists.html` | Generic, agnostic tag/taxonomy admin console — create lists and their items (Market/Brand/Therapeutic Area/Service Type seeded, more addable without code changes), admin **or sysadmin**, linked from the ⚙ Admin dropdown. As of Cycle 2 (2026-09), its lists/items are consumed by `costgrid.html`/`project-config.html`'s "🏷 Tags" sections via the shared `js/tags.js` helper. |

### File structure

```
index.html               — 9-line redirect to pipeline.html
pipeline.html            — Pipeline board + cost grid editor access, Vue 3 (CDN, no build step, same pattern as portfolio.html/project-config.html). Full narrative: [docs/pages/pipeline.md](docs/pages/pipeline.md).
portfolio.html           — Project reporting dashboard (portfolio overview + per-project dashboard), Vue 3 (CDN, no build step, same pattern as project-config.html). Full narrative: [docs/pages/portfolio.md](docs/pages/portfolio.md).
planning.html            — Resource planning view, Vue 3 (CDN, no build step, same pattern as pipeline.html/costgrid.html). Full narrative: [docs/pages/planning.md](docs/pages/planning.md).
costgrid.html            — Cost grid editor (full-page), Vue 3 (CDN, no build step, same pattern as pipeline.html/portfolio.html). Full narrative: [docs/pages/costgrid.md](docs/pages/costgrid.md).
timesheets.html          — XLS timesheet upload management (admin only). Full narrative: [docs/pages/timesheets.md](docs/pages/timesheets.md).
config.html              — Clients / client groups / programs / roles / pipelines & POT targets (admin only). Full narrative: [docs/pages/config.md](docs/pages/config.md).
project-config.html      — Full-page project config form (tasks, phasing, planning, groups), Vue 3 (CDN, no build step, same pattern as admin.html). Full narrative: [docs/pages/project-config.md](docs/pages/project-config.md).
admin.html               — User management (invite, role, disable, anonymize; admin **or sysadmin**). Full narrative: [docs/pages/admin.md](docs/pages/admin.md).
_terms-editor.html       — Sysadmin-exclusive Terms & Conditions console, Vue 3 (CDN, no build step, same pattern as `_db-reset.html`). Full narrative: [docs/pages/terms-editor.md](docs/pages/terms-editor.md).
_db-reset.html           — Sysadmin-exclusive hidden page for bulk DB data deletion by scope, Vue 3 (CDN, no build step, same pattern as `admin.html`). Full narrative: [docs/pages/db-reset.md](docs/pages/db-reset.md).
terms.html               — Standalone T&C acceptance page (no navbar/initNav), Vue 3 (CDN, no build step, same pattern as login.html). Full narrative: [docs/pages/terms.md](docs/pages/terms.md).
team.html                — Resource registry CRUD, Vue 3 (CDN, no build step, same pattern as admin.html), admin **or sysadmin**, linked from the ⚙ Admin dropdown. First of four planned resource-allocation cycles (see `docs/superpowers/specs/2026-09-23-team-attribute-lists-design.md`); gained the "Unmatched names" panel in Cycle 3b. Full narrative: [docs/pages/team.md](docs/pages/team.md).
attribute-lists.html     — Generic tag/taxonomy admin console (lists + items, no physical delete, only active/inactive), Vue 3 (CDN, no build step, same pattern as admin.html), admin **or sysadmin**, linked from the ⚙ Admin dropdown. Same cycle/spec as team.html; not yet consumed by any other page.
css/admin-crud.css       — shared layout (page-header/card/table/badge-st-active/btn-primary/form-*/empty/alert-sm) for simple admin CRUD pages, extracted 2026-09 from duplicated inline `<style>` blocks in admin.html/team.html/attribute-lists.html; a page's own extra states (e.g. admin.html's role badges, pending/disabled status) stay inline
css/tokens.css           — design tokens (single source of truth for colors/type); also carries `[v-cloak] { display: none; }` (2026-07) — kept here rather than in style.css since 4 of the 13 Vue pages (`login.html`/`terms.html`/`activate.html`/`reset-password.html`) load only tokens.css, not style.css, and moving the rule would silently disable it there; a deliberate, accepted deviation from the tokens/style split below
css/style.css            — component styles referencing tokens; `.pb-board-root` (2026-07) — extracted from `pipeline.html`'s former inline `style` attribute specifically so the `[v-cloak]` rule above can win via normal CSS cascade without needing `!important`. `.tag-pill`/`.tag-group`/`.tag-pill--inactive`/`.tags-section--readonly` (2026-09, Cycle 2) — the tag-pill/chip component shared by `costgrid.html`/`project-config.html`'s Tags sections; see `docs/pages/costgrid.md`'s "Tags" section for the component detail, the readonly-contrast decision, and a `:has()`-specificity bug found and fixed during the redesign.
js/api.js                — Api.* namespace, apiFetch wrapper (401 → redirect to login, sets `window.__pdashAuthRedirecting`); on `!res.ok` attaches the parsed response body to the thrown Error as `err.data` (2026-09) so callers can act on structured error payloads (e.g. timesheet upload's `inconsistencies`, see `docs/api/timesheets.md`). `Api.costGrids.versions.tags.{list,replace}` / `Api.projects.tags.{list,replace}` (2026-09, Cycle 2) — thin wrappers over the new tag routes, `replace` sending `{ itemIds }` for a full replace-all.
js/api-sync.js           — in-memory ↔ API sync layer (cgSyncFromApi, loadConfigFromApi, _pushProjectToApi, etc.). Full narrative: [docs/js/api-sync.md](docs/js/api-sync.md).
js/lib/                  — pure functions extracted for unit testing (vitest + jsdom), each an ES module (`export function ...`) with a `window.<name> = <name>` bridge for existing classic-script callers; modules: cfg-parse.js, planning-calc.js, status-rules.js, costgrid-calc.js, portfolio-calc.js, pipeline-calc.js, notif-browser.js, team-ui.js (2026-09, only `team.html` loads it; gained `buildProfileTree` in Cycle 3c). Full narrative: [docs/js/lib.md](docs/js/lib.md).
js/core.js               — state, in-memory helpers (loadConfig/persistConfig are no-ops), shared badges, esc(), fmtH(), fmtMoney(), showConfirm()/showInfo() modal idioms, findRate(), formatUploadInconsistencies(). Full narrative: [docs/js/core.md](docs/js/core.md).
js/nav.js                — navbar + footer injection, initNav(); injects settings, change-password, send-notification, and "My Profile" modals; T&C gate after GET /api/auth/me; calls initNotifications(); stores window.__navUser; admin/sysadmin nav rendered as Bootstrap dropdowns. Full narrative: [docs/js/nav.md](docs/js/nav.md).
js/notifications.js      — bell icon + SSE notification panel; initNotifications(user) called by nav.js; also drives browser/desktop notifications. Full narrative: [docs/js/notifications.md](docs/js/notifications.md).
js/shares.js             — share modal (cost_grid and project); loads active non-admin **or sysadmin** users from `GET /api/users/active-list` into a searchable in-memory dropdown (2026-09: exclusion widened from `role !== 'admin'` to `!['admin','sysadmin'].includes(role)`); supports adding new shares and editing permission (editor/viewer) on existing ones via the same upsert API; `_shareAllUsers` module var is the immutable source list; `_shareUserList` excludes already-shared users
js/share-list-component.js — (2026-09) `window.ShareListComponent`, a reusable Vue component (props: `resource-type`, `resource-id`, `can-manage`) showing a "👥 Shared with" list with a per-row ✕ remove button (hidden for the owner row and whenever `can-manage` is false); reads `GET /api/{cost-grids|projects}/:id/shares`, removes via `DELETE .../:id/shares/:userId` — the same endpoints `js/shares.js` already used, no new API surface; deliberately does not add the ability to create a new share (stays exclusive to `js/shares.js`'s `#shareModal`); registered via `app.component('share-list', window.ShareListComponent)` on both `pipeline.html`'s and `costgrid.html`'s Vue apps
js/costgrid.js           — shared cost-grid business-logic library: loaded unmodified by `pipeline.html` as globals, and by `costgrid.html`'s own Vue rewrite via the bridge pattern — decided 2026-07: this file is a permanent shared Vanilla service layer (not migration debt awaiting a future rewrite), with exactly 2 consumers today (`pipeline.html`, `costgrid.html`); see `docs/superpowers/specs/2026-07-27-costgrid-js-fate-design.md` for the rationale. Full narrative: [docs/js/costgrid.md](docs/js/costgrid.md).
js/portfolio.js          — no longer loaded by `portfolio.html` (its rendering logic was folded into that page's Vue rewrite); still loaded by `planning.html`, which relies on two of its exports — `getMonthRangeFromCfg(cfg)` and `fmtProjectTitle(cfg)` — consumed directly by `planning.html`'s Vue instance (formerly by `js/planning.js`, now deleted); the rest of this file's functions (`renderPortfolioSummary`, `buildProjectCard`, `buildProgramSummary`, `renderPortfolioView`, `showPortfolioView`, `showDashboardView`, the dead duplicate `showPortfolioPlanningView`) are unreachable now that no page's script list wires them up
js/roles.js              — `loadRolesFromApi`/`saveRoles`(no-op)/`getRoles` only; `loadRolesFromApi` maps `rateOverrides: r.rate_overrides || {}` on each role; role shape is `{ id, label, code, rate, rateOverrides }`. Its modal-editing UI (`showRolesView`/`hideRolesView`/`renderRolesTable`/`extractTeam`/`openRoleModal`/`saveRoleFromModal`/`showRoleError`/`deleteRole`/`exportRoles`/`importRoles`) was confirmed unreachable from any page (verified via repo-wide grep — the only same-named hits are unrelated Vue component methods on `config.html`/`costgrid.html`) and deleted 2026-08
js/upload.js             — Excel timesheet parsing; `readXLS()` (`planning.html`'s "📂 Load XLS") and `readXLSForProject()` (`portfolio.html`'s "Load Actuals") both check `e.data && e.data.inconsistencies` in their catch block (2026-09) and show `formatUploadInconsistencies(e.data.inconsistencies)` via `js/core.js`'s `showInfo()` before falling back to the pre-existing `#fileStatus` text flash — see `api/src/routes/timesheets.js`'s entry for the backend validation this surfaces
js/settings.js           — openSettingsModal() / saveSettingsModal(); reads window.__navUser; all
                            appSettings / AI_MODELS / getRoles references guarded with typeof checks;
                            `.stg-admin-only` sections gated on `['admin','sysadmin'].includes(role)` (2026-09, was admin-only)
js/ai.js                 — AI sidebar chat + project analysis; `aiPlanSend()`/`openAiAnalysis()`/`buildPlanningContext()`/`buildProjectSummary()`. Full narrative: [docs/js/ai.md](docs/js/ai.md).
js/tags.js               — (2026-09, Cycle 2) `loadActiveAttributeListsForTagging()`, a shared classic script loaded only by `costgrid.html`/`project-config.html`; talks to `/api/attribute-lists`/`/api/attribute-lists/:id/items` directly via `fetch()` (not the `Api.*` wrapper, matching `attribute-lists.html`'s own established call style for these two endpoints), fetched in parallel (`Promise.all`), filters each list to `status === 'active'` items only. Not cached — each consumer page calls it once per page load. See `docs/pages/costgrid.md`'s "Tags" section for the UI it feeds.
js/clients.js            — client CRUD helpers; `saveClientFromModal()` guards `#clientSaveBtn` (id added 2026-08, the button previously had none) against a fast repeat click — `if (saveBtn.disabled) return;` before the `await`, re-enabled in a `finally`; a double-click during the network round-trip could previously create two clients from one submission. `js/programs.js`/`js/roles.js` had the structurally identical gap in their own save functions, but those functions (along with the rest of both files' unreachable modal-editing UI) were deleted entirely in the 2026-08 dead-code cleanup — see their own entries below
js/programs.js           — `loadProgramsFromApi`/`savePrograms`(no-op)/`getPrograms` only; its modal-editing UI (`showProgramsModal`/`renderProgramsTable`/`openProgramEditModal`/`saveProgramFromModal`/`showProgramError`/`deleteProgram`/`cfgRefreshProgramDropdown`) was confirmed unreachable from any page (verified via repo-wide grep — the only same-named hit, `deleteProgram` in `config.html`, is an unrelated Vue component method) and deleted 2026-08
js/ratecards.js          — rate cards admin modal + loadRatecardsForDropdown() cache used by costgrid.js;
                            client-specific rate editing is via openClientRatecard() in config.html (Vue method);
                            `_rcRenderEntries` pre-populates non-EUR column placeholders with agency default from `_rcRoles[rid].rate_overrides[currency]`;
                            `_rcSaveEntries` collects `.rc-override-rate` inputs and sends `rateOverrides` per role
api/src/routes/          — Express routes (auth, users, config, cost-grids, projects, timesheets,
                            reporting, exports, notifications, pipeline-years, client-groups, pots, reset,
                            app-settings, currencies, attribute-lists, resources)
api/src/routes/attribute-lists.js — generic tag/taxonomy CRUD (backs `attribute-lists.html`, and as of
                            Cycle 2 read by `costgrid.html`/`project-config.html`'s Tags sections via
                            `js/tags.js`). Reads (`GET /`, `GET /:id/items`) are `requireAuth` only (2026-09,
                            was `requireAdmin` — the blanket admin-only router guard silently broke the tag
                            UI for any non-admin editor, since `js/tags.js`'s fetches all 403'd and the
                            `.catch()` swallowed it into an empty "No tag lists configured yet." with no
                            error surfaced); writes stay `requireAdmin` per-route: `POST /` and `PATCH /:id`
                            (rename only — `slug` is immutable, generated once via `slugify()` at creation
                            and never touched again), `POST /:id/items`, `PATCH /:id/items/:itemId` (label
                            and/or `active`/`inactive` status). No `DELETE` anywhere in this file — by
                            design, so a tag already applied elsewhere can never be removed out from under
                            it in a future cycle. Item label is unique per list, case-insensitively
                            (`021_attribute_list_items_unique_label.sql`) — both item routes catch the
                            resulting `23505` and return 409.
api/src/routes/resources.js — resource registry CRUD (backs `team.html`) plus, since Cycle 3b (2026-09), the
                            actuals-owner-name matching queue (`/unmatched`, `/unmatched/rescan`, `/aliases`),
                            all `requireAuth, requireAdmin`; plus `GET /:id/profile` (Cycle 3c, cached experience profile).
                            Full narrative: [docs/api/resources.md](docs/api/resources.md).
api/src/routes/profile-jobs.js — `POST /api/profile-jobs/run` (Cycle 3c, `requireAuth, requireAdmin`): drains the profile
                            queue now, 409 when busy; sub-cycle 3d extends this file. See [docs/api/profile-engine.md](docs/api/profile-engine.md).
api/src/routes/currencies.js — currencies admin surface (backs `config.html`'s Currencies tab): `GET /active`
                            (requireAuth, active currencies for dropdowns/money formatting), `GET /` (admin, all
                            currencies + last rate-update timestamp from `currency_rates`), `POST /:code/activate`
                            (admin, activates a currency with an initial rate — EUR always active, rejects
                            re-activation), `PATCH /:code/rate` (admin, updates the rate for an already-active
                            non-EUR currency — EUR's rate is fixed at 1:1), `GET /:code/history` (admin,
                            chronological rate-change log, last 100 entries). Every rate change (activate or
                            update) both updates `currencies.current_rate` and inserts a `currency_rates` row.
api/src/routes/config.js — clients / client groups / programs / roles / ratecards CRUD (backs `config.html`). Full narrative: [docs/api/config.md](docs/api/config.md).
api/src/lib/              — pure functions extracted for unit testing (node:test, run via `npm test`/`node --test` from `api/`), mirroring the frontend's `js/lib/` convention; modules: date-parse.js, sold-hours.js, email-template.js, rate-resolve.js, is-admin.js, role-transition.js, slugify.js, match-resource.js, resource-profile.js, job-schedule.js. Full narrative: [docs/api/lib.md](docs/api/lib.md).
api/src/routes/exports.js        — POST /api/exports/{portfolio|cost-grids|ratecards}. Each, after emailing the
                                    CSV to the requester, also creates a self-targeted in-app notification via
                                    `createNotification()` (2026-09) — "Your export is ready", fire-and-forget
                                    (`.catch(console.warn)`), same pattern as the other new-2026-09 notification
                                    call sites. `GET /api/exports/phasing` (XLS download, direct response, no
                                    email/notification — a different code shape entirely) is unaffected.
api/src/routes/notifications.js  — SSE stream, CRUD, push; exports { router, pushToUser, createNotification }. Full narrative: [docs/api/notifications.md](docs/api/notifications.md).
api/src/routes/reset.js          — GET /api/admin/reset/scopes + POST /api/admin/reset/:scope (**sysadmin-exclusive** bulk delete); scopes: proposals, projects, clients, ratecards, actuals, pipelines, notifications; also cost-grid single-proposal delete + owner reassignment. Full narrative: [docs/api/reset.md](docs/api/reset.md).
api/src/routes/app-settings.js   — App-wide settings routes, incl. Terms & Conditions storage/version history (GET/PUT /terms, /terms/draft, /terms/versions). Full narrative: [docs/api/app-settings.md](docs/api/app-settings.md).
api/src/routes/timesheets.js     — GET / (summary), POST /upload (XLS ingest + role/task validation gate), DELETE /:projectCode. Full narrative: [docs/api/timesheets.md](docs/api/timesheets.md).
api/src/db/migrations/   — numbered SQL migration files
api/src/services/        — email (nodemailer: sendInvite, sendPasswordReset, sendShareNotification, sendShareRevokedEmail, sendOwnerReassignedEmail, sendExportEmail, sendAdminNotificationEmail), jwt; sendShareRevokedEmail (2026-09) is the access-removed counterpart to sendShareNotification, consumed only by projects.js's DELETE /:id/shares/:userId (cost-grid share removal doesn't call it, a deliberate scope decision); email.js exports an APP_URL constant (2026-09) for building email links. `resource-matching.js` (2026-09, Cycle 3b) — `refreshUnmatched(codes|null)`, the DB half of actuals-owner-name matching (rules live in `api/src/lib/match-resource.js`); see [docs/api/resources.md](docs/api/resources.md). `profile-engine.js` / `profile-worker.js` (Cycle 3c) — the profile queue + per-code processing and the 60 s self-scheduling worker started from `api/src/index.js`; see [docs/api/profile-engine.md](docs/api/profile-engine.md).
api/src/create-admin.js  — CLI bootstrap script (admin user create/reset); always sets role='admin' by design — never
                            sysadmin, a deliberate scope boundary (see `promote-sysadmin.js` for that step)
api/src/promote-sysadmin.js — CLI script (2026-09) to promote an existing user to `role='sysadmin'` — the separate
                            step needed after `create-admin.js`, since that script always sets `role='admin'`. Same
                            `.env`/`DATABASE_URL` loading pattern as `create-admin.js`. Used by the integration test
                            suite's bootstrap (`docker-compose.yml`'s `test` service runs both, for a second,
                            dedicated `TEST_SYSADMIN_EMAIL` account) and for the first real sysadmin promotion after
                            deploy (no user starts as sysadmin — `018_sysadmin_role.sql` widens the `role` CHECK
                            constraint with no backfill, by design; someone must run this once manually, or an
                            existing sysadmin must use `admin.html`'s "⬆ Grant sysadmin" toggle for anyone after that).
api/src/middleware/auth.js — `requireAuth` (JWT cookie → `req.user`), `requireAdmin` (`role === 'admin' ||
                            role === 'sysadmin'`, JWT-cached — trusts the token's role claim for up to its 8h
                            lifetime), `requireSysAdmin` (`role === 'sysadmin'` exclusive; unlike `requireAdmin`,
                            re-reads the role from the DB on every call — gates `reset.js` and `PUT
                            /api/app-settings/terms`, where an up-to-8h-stale revocation window on genuinely
                            irreversible bulk-deletion routes was judged unacceptable, 2026-09).
api/src/routes/users.js  — PATCH /:id (role/status), POST /:id/anonymize, DELETE /:id, all gated requireAdmin plus a shared sysAdminTargetError() check (2026-09): only a sysadmin may mutate a row currently role='sysadmin', checked via a fresh DB read (liveRole()), not the JWT-cached claim. PATCH /:id's role field also runs roleChangeError() (api/src/lib/role-transition.js) for two-step promotion/demotion. Self-modification blocked unconditionally on all three routes.
scripts/test-branch.sh   — isolated Docker Compose stack for testing the current feature branch before merge (distinct container names/ports, clones data from main via pg_dump/pg_restore when available); up/down/status subcommands. Full narrative: [docs/scripts/test-branch.md](docs/scripts/test-branch.md).
scripts/run-tests.sh     — ephemeral, fully isolated Docker Compose stack for the integration-test profile (no host ports, disposable volume, auto-teardown via trap); applies migrations explicitly before starting api. Full narrative: [docs/scripts/run-tests.md](docs/scripts/run-tests.md).
scripts/backup-db.sh     — pg_dump -Fc snapshot of the main stack's pdash-db into backups/ (gitignored), timestamped to the second, keeps only the 3 most recent dumps; non-blocking (warns + exits 0 if pdash-db isn't running). Run standalone, or automatically by /finish-cycle Gate 4 right after merge — see "Database backup & full recreation" above.
```

### `v-cloak` (all Vue pages, 2026-07)

Every one of the 15 Vue-mounted pages (all pages except the 9-line `index.html` redirect) has `v-cloak` on its actual Vue root mount element, paired with the `[v-cloak] { display: none; }` rule in `css/tokens.css`. This hides the raw, uncompiled template markup that would otherwise briefly flash on load/reload before Vue finishes mounting (each page is a runtime-compiled `Vue.createApp({...}).mount(...)` with no build step, so the template is the literal HTML already in the file). Vue removes the `v-cloak` attribute automatically once mounting completes — no application code manages it. **Any new Vue page must add `v-cloak` to its root mount element** to get this protection; it is not automatic. If a root element ever needs an inline `display` style (as `pipeline.html`'s did — extracted into `.pb-board-root` in `css/style.css` for exactly this reason), prefer a CSS class over an inline `style` attribute, since an inline style would otherwise need `!important` on the `[v-cloak]` rule to be overridden (a global, blunt fix for what is really a single-page conflict).

### Routing

Navigation is URL-based — clicking a nav tab changes `window.location.href`. Each page is a self-contained HTML file that initialises its own data on `DOMContentLoaded`.

Each page calls `initNav(activeTab)` from `nav.js` which:
1. Injects the shared navbar HTML (two-row: logo/icons row + tabs row) and fixed footer
2. Injects the settings modal, change-password modal, send-notification modal, and "My Profile" modal HTML (centralised — do NOT duplicate in page HTML)
3. Calls `GET /api/auth/me` — redirects to `/login.html` on 401; redirects to `/terms.html` if `user.terms_version < user.current_terms_version`
4. Stores the user object in `window.__navUser`
5. Wires all navbar events (account dropdown, settings, change password, notifications)
6. Calls `initNotifications(user)` from `notifications.js`
7. Returns the user object

All authenticated pages must load `core.js`, `api.js`, `nav.js`, `notifications.js`, and `settings.js` (`api-sync.js` too, if the page actually calls one of its exports — e.g. cost-grid/project/timesheet sync pages; most admin CRUD pages don't and may omit it). **Corrected 2026-09** — this previously prescribed one fixed linear order (`core.js, api.js, api-sync.js, nav.js, notifications.js, settings.js`); no page, including `pipeline.html`, ever actually followed it (`pipeline.html`'s real order is `api.js, core.js, settings.js, notifications.js, ..., api-sync.js, ..., nav.js` — nav.js last, not third). Per the "Script loading order" section above, deferred/module scripts share one execution queue ordered by document position — the only real constraint is that a file defining a global must appear before a file that reads it (e.g. `core.js`'s `esc()`/`showConfirm()` before any script calling them, `nav.js` before `initNotifications()`'s caller). There is no other project-wide ordering requirement to enforce.

Typical page init pattern:
```js
document.addEventListener('DOMContentLoaded', async () => {
  loadSettings();
  const user = await initNav('pipeline');  // returns null on 401 (already redirected)
  if (!user) return;

  await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadRolesFromApi()]);
  await Promise.all([cgSyncFromApi(), loadConfigFromApi(), loadPipelineBudgetsFromApi()]);
  renderPipelineBoard();
});
```

### Data strategy (in-memory cache)

In-memory module-level variables are the UI cache; the API is the source of truth. **localStorage is not used for server data** — it holds only `PDash_settings` (AI keys), `PDash_summary` (portfolio summary selection), and `PDash_browserNotifDisabled` (2026-09, the browser-notification opt-out — see `js/notifications.js`'s entry), all genuinely client-side. `js/core.js`'s `cleanLegacyStorage()` IIFE wipes any other `PDash*` key on every page load (navigation here is full-page, not SPA, so this runs constantly) — **any new localStorage key must be added to its `keep` Set or it will be silently deleted on the very next navigation**, a real bug caught by code review in the browser-notification cycle (the opt-out flag was originally missing from this list, making "Disable" revert itself on the next page load).

- **On page load**: call `cgSyncFromApi()` / `loadConfigFromApi()` / `refreshTimesheetDataFromApi()` to populate in-memory state from the API. Each page load starts fresh — no stale cross-session data.
- **On user action**: update in-memory state immediately (instant UI), then fire an async API call in the background (fire-and-forget).
- **`loadConfig()` and `persistConfig()` are no-ops** — kept as function stubs so existing callers in HTML pages don't break, but they do nothing. `config.projects` is populated exclusively by `loadConfigFromApi()`.

Key sync functions in `api-sync.js`:

| Function | What it does |
|---|---|
| `cgSyncFromApi()` | Seeds all cost grid metadata into `_cgStore` (in-memory Map) |
| `cgLoadStructureFromApi(cgId, verId)` | Loads phase/task/role structure for one version into `_cgStore` |
| `loadConfigFromApi()` | Loads all projects from API into `config.projects` |
| `loadPipelineBudgetsFromApi()` | Loads pre-computed budget totals indexed by versionId into `_pbBudgets` |
| `refreshTimesheetDataFromApi()` | Loads timesheet rows from API into `timesheetData` + `_timesheetProjectData` |
| `_cgUpsertVersionToApi(cgId, verId)` | Write-through: pushes cost grid version to API |
| `_pushProjectToApi(project)` | Write-through: pushes project (all sub-resources) to API |

**Cost grid store** (`_cgStore` Map in `costgrid.js`): replaces `PDash_cg_*` localStorage keys. `cgLoad/cgSave/cgGetIndex` operate on this Map. Deep-clones on read and write to avoid accidental in-place mutation.

**Rate consistency**: `PUT /api/cost-grids/:id/versions/:vId/structure` always snapshots all role rates as `rate_override` in `task_roles`, regardless of whether the role is custom or ratecard-priced. This ensures the `/budgets` SQL (`COALESCE(tr.rate_override, r.hourly_rate, 0)`) always uses the correct rate. When `cgLoadStructureFromApi` reads structure back, it refreshes `ver.roles` from DB only when all roles have `rate_override` set (meaning the version was saved with the current fix); otherwise it preserves client-side ratecard rates already in memory.

### Pipeline stage: single source of truth

Pipeline stage is stored on `costGridVersion.pipeline`. These locations must stay in sync:

- `css/tokens.css` — `--pipeline-{stage}-bg` / `--pipeline-{stage}-color` for all 5 stages
- `js/core.js` `pipelineBadge()` — uses `var(--pipeline-*-color)`
- `js/costgrid.js` switch block — uses `var(--pipeline-*-color)`
- `pipeline.html`'s inline `PB_STAGE_STYLE` const — uses `var(--pipeline-*-bg/color)`

Valid stages: `SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`.

Kept in sync on `config.projects[].pipeline` (a separate field from `costGridVersion.pipeline`) by `cgPropagatePipelineToProjects()` (`js/costgrid.js`), which runs on every change of the cost grid editor's Pipeline `<select>` and updates every project in `linkedProjects` — the only path that ever changes a version's pipeline stage. `getProjectPipeline(projectId)` (`js/core.js`) resolves the authoritative value for a given project: the linked cost grid version's `pipeline` if `costGridRef` is set, else `config.projects[].pipeline` directly. `planning.html`'s Resource Planning view (this logic lived in `js/planning.js` before that file was deleted during the page's Vue migration — see `planning.html`'s own file-structure entry above) deliberately reads `config.projects[].pipeline` directly rather than via `getProjectPipeline()` — by design, since resource planning applies once a task is converted into a project, not before — this is safe because of the propagation above, not despite it (verified: `docs/superpowers/audits/2026-07-09-project-pipeline-direct-reads-audit.md`).

Do not confuse pipeline **stage** (`SIP`/`Expected`/.../`Canceled`, this section) with project **status** (`Not started yet`/`Started`/`Started At Risk`/`Put on hold`/`Completed` — a separate field, whose allowed values per pipeline stage are defined by `js/lib/status-rules.js`'s `getStatusRule()`).

Helper: `getProjectPipeline(projectId)` — reads from `costGridRef` version first, falls back to `config.projects[].pipeline`.

### Script loading order (`js/lib/*` modules, and page script `defer`)

Files under `js/lib/` are native ES modules (`export function ...`), loaded via `<script type="module" src="js/lib/...">`, with a `window.<name> = <name>` bridge line per export so existing classic-script callers keep working unchanged.

**All classic `<script src="...">` tags on every Vue page — both CDN libraries (Vue, Bootstrap, Chart.js, etc.) and this project's own `js/*.js` files — carry `defer`** (2026-08 hardening, to shorten the blank-screen window before Vue mounts; see the `v-cloak` section above for why that window exists at all). Per the HTML spec, `defer`'d classic scripts and `type="module"` scripts (without `async`) share **one ordered execution queue**, ordered by document position, all running after HTML parsing completes but before `DOMContentLoaded` fires. So `js/lib/*.js` modules and every `js/*.js`/CDN script now execute in the same relative order as before, just later (non-blocking during parse) rather than synchronously as the parser reaches each tag.

Each page's trailing `Vue.createApp({...}).mount(...)` script is `type="module"` too (module scripts join the same queue), **except** `pipeline.html`, `costgrid.html`, and `planning.html`, whose entire `Vue.createApp`/`.mount()` call already lives inside a `document.addEventListener('DOMContentLoaded', () => {...})` wrapper — since that callback only ever fires once every deferred/module script has already run, no conversion was needed there.

**Rule (updated 2026-08):** any inline `<script>` on a page that is left as a plain classic script (no `defer`, no `type="module"`) executes **immediately at parse time — before every deferred/module script on the page**, regardless of where it sits in the document relative to those tags. This is now the opposite of the old assumption that classic scripts ran "in document order" relative to each other with no gap: a lone un-deferred inline script and a `defer`'d/`module` script are no longer in the same execution queue at all. Three pages have such shims that are genuinely safe left this way (`admin.html`/`timesheets.html`/`config.html`'s inline `esc()` function — nothing else on those pages defines a colliding global `esc`). But `pipeline.html`'s `showCostGridEditorView` override and `planning.html`'s `showPortfolioView`/`showDashboardView`/`showPipelineBoardView`/`updateNavState` overrides collided with same-named globals in now-deferred `js/costgrid.js`/`js/portfolio.js`/`js/core.js` — found by the final whole-branch review of the 2026-08 defer cycle, since a classic shim executing first no longer "wins" once the file it used to override is deferred. Both were fixed by converting the shim itself to `<script type="module">` with an explicit `window.functionName = function (...) {...}` assignment (not a bare `function functionName() {...}` declaration, since module top-level declarations never become `window` properties) — this makes the shim join the deferred/module queue *after* the file it overrides, so its assignment wins. **Any future page-local override of a `js/*.js` global must use this same pattern**, not a bare classic inline `<script>`.

A bridged `window.*` global from `js/lib/` may only be read from inside an event handler or a function invoked after `DOMContentLoaded` — never at the top level of a still-classic, non-deferred inline script's parse-time execution (the `esc()` shims above satisfy this trivially, since they don't read anything).

If a future `js/lib/` module needs another `js/lib/` module's function, use a native ES `import` between them (resolved independently of `<script>` tag order in the HTML), not the `window` bridge.

### Cache-busting (`?v=N` query strings)

No bundler means no content-hashed filenames — every `<script src="...">`/`<link href="...">` tag that references a project-owned `js/*.js`, `js/lib/*.js`, or `css/*.css` file carries its own `?v=N` query string (e.g. `js/nav.js?v=6`, `css/style.css?v=11`, `js/lib/pipeline-calc.js?v=2`). The full URL — path *and* query string — is the browser's cache key, so **editing a versioned file's content without bumping every `?v=N` reference to it is a live production bug**, not a cosmetic omission: any browser that already cached the old URL keeps serving the pre-edit file indefinitely, even though the file on disk (and on the server) is current.

This has caused two real production incidents: `css/style.css` and `js/nav.js` were modified in the `nav-admin-dropdown` cycle (2026-09) without either's `?v=N` ever being bumped, left silently stale across all 10 authenticated pages that load them; and `js/lib/pipeline-calc.js` gained two new exports (`pbPriceBucketKey`/`pbCardMatchesFilters`) in the `pipeline-filters` cycle without `pipeline.html`'s own `?v=1` reference being bumped, causing a `ReferenceError: pbCardMatchesFilters is not defined` in production once real users' browsers had the old response cached. Both were fixed together in the `fix-pipeline-calc-cachebust` cycle (2026-09).

**Rule for every future change to a versioned file:** grep the whole repo for every `?v=N` reference to that exact file path before merging, and bump every one of them to the same new `N` — a file loaded on 10 pages needs its version bumped in all 10, not just the page you were actively testing. `css/tokens.css` and CDN-hosted libraries (Bootstrap, Chart.js, ExcelJS, etc.) are exempt — tokens.css changes rarely and CDN URLs are already pinned to an exact library version.

### Linked project resolution

`linkedProjects[].projectId` may contain stale auto-generated IDs if the project was renamed. Correct resolution order in `pipeline.html`'s `detailLinkedProjects` computed (Vue; ported verbatim from the former `js/pipeline-board.js`'s `pbOpenDetailPanel()`):

1. Direct `config.projects.find(p => p.id === lp.projectId)`
2. If null: filter projects by `costGridRef.cgId + versionId` → match by name within that subset
3. Single-project unambiguous fallback

Never use `lp.projectId` raw as the display ID — always resolve to `proj.id`.

### Cost grid editor ↔ pipeline board integration

- `costgrid.html` is a separate page. The back button navigates to `pipeline.html`.
- After delete (grid or version): `cgConfirmDeleteGrid`/`cgConfirmDeleteVersion` call their `onSuccess` callback if given, else fall back to a bare `renderPipelineBoard()` — a global that no longer exists on `pipeline.html` (its Vue rewrite passes a callback that bumps `refreshTick` instead); `costgrid.html` still defines its own local `renderPipelineBoard()` override, so the fallback remains safe there.
- After JSON import: `cgImportAll()` calls `renderPipelineBoard()` guarded by a `typeof` check, for the same reason.
- `showCostGridEditorView(cgId, verId)` redirects to `costgrid.html?cgId=...&verId=...` on `pipeline.html` (a page-local override, plain redirect). On `costgrid.html` itself, `js/costgrid.js`'s own `showCostGridEditorView` is instead a thin bridge delegating into the page's mounted Vue instance (`_cgVueApp.openVersion(cgId, versionId)`) — no longer a single-page-app DOM-render function.
- On `costgrid.html` cold load: call `cgSyncFromApi()` before reading URL params to avoid empty `_cgStore`

### Version tab switching (editor)

`costgrid.html`'s Vue instance handles version-tab clicks directly via `switchVersion(verId)` (a Vue method, `@click` on each tab), which calls `cgAutoSave()` then `await this.openVersion(this.cgId, verId)` — `openVersion()` itself awaits `cgLoadStructureFromApi(cgId, verId)` before assigning `_cgDraft`/`this.draft`, ensuring the structure is fetched before rendering. `js/costgrid.js`'s `renderCgVersionTabs(cg)` (called by other, unchanged global functions like `cgPublishDraft`) is now just a bridge that reassigns `_cgVueApp.cg` — it no longer owns the tab click-handling itself.

### Clone (`cgCloneGrid`)

`_pbCloneSource = { cgId, verId, name }` is declared in `costgrid.js` so it is available on both `pipeline.html` (whose Vue `openCloneModal` method sets it) and `costgrid.html` (whose own Vue `openCloneModal` method sets it identically).

Clone flow:
1. Clears `_cgAutoSaveTimer` (clearTimeout) to prevent concurrent save on the original during clone
2. Creates a new cost grid + version via API; new version label is always `'v1'` regardless of the source label
3. Copies phase/task/role structure from the source version via `cgLoadStructureFromApi` + `saveStructure` — the copied `phases` array is passed through `stripCloneTaskIds()` (`js/lib/costgrid-calc.js`) first, removing every `taskId`/`phaseId` so the backend mints fresh UUIDs instead of reusing the source version's (still-existing) ones, which previously caused `duplicate key value violates unique constraint "tasks_pkey"`
4. On `costgrid.html`: updates URL to the new `cgId`/`verId` via `history.replaceState` (prevents stale URL state loops)
5. Redirects to the new grid in the editor, re-fetching the server-assigned structure via `cgLoadStructureFromApi` (the in-memory seed used only `phases: []` since the real IDs aren't known client-side until the server assigns them)

### Pipeline board layout (height math)

Navbar: two rows (106px: 10px padding-top + 44px top row + 52px tabs row). Footer: fixed 100px.

`#pipelineBoardSection.pb-board-root { height: calc(100vh - 206px); display:flex; flex-direction:column; overflow:hidden }` (`css/style.css`) — 106px navbar + 100px footer. Must be kept in sync if navbar/footer height changes. **Corrected 2026-09** — this section previously documented a `#pbColumnsContainer { height: calc(100% - 61px) }` rule; that id and hardcoded calc no longer exist in the current markup (confirmed via code review during the pipeline-filters cycle). The columns row is instead a flex child with `flex:1; min-height:0`, sized automatically by `.pb-board-root`'s `flex-direction:column` layout — any `flex-shrink:0` sibling row added above it (the title bar, and the 2026-09 filter bar) is absorbed automatically without needing a matching pixel adjustment anywhere, unlike a hardcoded `calc()` would require.

**Critical**: do NOT add `h-100` to the columns row. Bootstrap's `.h-100` applies `height:100%!important`, which would override the flex sizing and can hide the sticky totals footer below `overflow:hidden`.

### Filter bar (2026-09)

A `flex-shrink:0` row between the title bar and the columns row, background-tinted, holding (in this fixed order): a free-text search input, then four Bootstrap dropdown-with-checkboxes — Owner, Client, Currency, Value — each `data-bs-auto-close="outside"` so multi-selecting doesn't close the menu after every click, and each trigger showing a badge with its own active-selection count. The Value dropdown also holds an "Include PTC in value" checkbox below a divider. A "✕ Clear filters" link appears only once at least one filter is active (`filtersActive` computed).

Filtering is entirely client-side over data already loaded by `cgSyncFromApi()` — no new API calls, and no change to which proposals are visible under the existing owner/shared/admin-all permission model (filters only narrow that already-scoped set). Multi-select values within one filter combine with OR; the five filter categories (search, Owner, Client, Currency, Value) combine with AND. Filters reset on every page load — no persistence in the URL or storage — and apply only to the currently selected pipeline year.

The **Draft column is never filtered** — `stagesData`'s per-card filter check (`js/nav`... see below) explicitly skips `pbCardMatchesFilters` for `stage === 'Draft'`, and the `filterableCards` computed that derives the Owner/Client/Currency option lists also excludes Draft — so a Draft-only owner/client never appears as a selectable option with zero possible matches. Since column card-count badges and footer totals already derive from each column's own (now filtered) `cards` array, they update automatically with no separate recompute step.

Filter matching logic lives in `js/lib/pipeline-calc.js` (pure, vitest-covered) — see that file's own entry below for `pbPriceBucketKey`/`pbCardMatchesFilters`. Stage/pipeline-column filtering and a board-vs-scrolling-list view toggle were both explicitly discussed and deferred to a future cycle, not implemented here.

### Detail panel

`#pbDetailPanel` width: 860px, Vue-rendered (`v-if="selectedCgId"`). Layout (top to bottom):
- While the version's phase/task structure is loading (`detailLoading`): a centered Bootstrap spinner, no header action buttons.
- If `selectedCg`/`selectedVersion` fail to resolve after loading (e.g. a stale/missing cost grid): an explicit "Could not load cost grid. Try reloading the page." message, matching the former `js/pipeline-board.js`'s equivalent error path.
- Otherwise: **Version tabs row** (shown whenever `cg.versions.length > 0` — always visible, even for a single-version proposal, since 2026-07): horizontal tab buttons with colored stage dot, rendered above the two-column body; clicking a tab calls `openDetailPanel(cgId, verId)` to reload the panel for that version.
- **Two-column body** (a `d-flex flex-grow-1`, no separate `#pbDetailContent` wrapper — direct child of `#pbDetailPanel`):
  - Left column (50%): title/client/stage badges, then an `Owner: 👤 <name>, Created at: <date>` line (2026-09 — replaces the older terse `<version label> · <date> · 👤 <owner>` line; the version label was dropped since it's already shown as a colored badge in the version-tabs row above), an `<hr>` below it, then Period/Currency/Fees/PTC/Total budget, then an optional note, then the inline share list (`<share-list>`, see "Sharing" below — moved 2026-09 from directly under the title to just above the POT block, `border-top`-separated from the totals above; when the POT block is present its own `border-top` doubles as the single separator line after the share list, so the two blocks intentionally share one grey line rather than each drawing their own), then the optional POT block, then `<hr>`, then linked projects, `overflow-y:auto`, `border-right`
  - Right column (flex:1): task/phase breakdown, `overflow-y:auto`

Header buttons (right side, shown once loaded): `🗑 Delete` · `⧉ Clone` · `🔗 Share` · `✏️ Edit` · `×` — plain `@click` Vue bindings, no element IDs.

- `🗑 Delete`: visible only when `detailStage === 'Draft'`. Calls `deleteSelectedVersion()`, which wraps `cgConfirmDeleteVersion(cgId, verId, label, onSuccess)` with an `onSuccess` that closes the panel and bumps `refreshTick`.
- `⧉ Clone` calls `openCloneModal(cgId, verId)`, which sets `_pbCloneSource = { cgId, verId, name }` for the currently viewed version and opens `#cgCloneModal`.
- Outside-click-to-close (`mousedown` outside `#pbDetailPanel`, 200ms delayed registration to avoid the opening click immediately closing it) explicitly ignores clicks inside any `.modal`/`.modal-backdrop` — Share/Clone/Confirm modals are appended outside `#pbDetailPanel` in the DOM, so without this guard, interacting with them (e.g. confirming a delete) would close the panel mid-action.

### Column totals footer

Each pipeline column footer shows:
- **Main value** (bold): professional fees only (`fee` from `pbComputeColumnTotals`)
- **Secondary line** (muted, small): PTC total only, shown only when `ptc > 0`
- Currency symbol is included in the value string via `pbFmtMoney(n, cur)` — do NOT add a standalone currency `<span>` next to it

### Settings modal

The settings modal HTML is injected by `nav.js` (not duplicated in page HTML). It has two tabs:

- **API & Integrations** — AI provider keys (Anthropic / OpenAI / Gemini) stored in `localStorage`
- **Data Manager** — CSV exports (cost grids, portfolio, rate cards), full backup download, admin-only restore

`openSettingsModal()` in `settings.js` reads `window.__navUser` set by `nav.js`. All references to `appSettings`, `AI_MODELS`, `getRoles`, `persistSettings`, `updateAiButtonVisibility` are wrapped in `typeof` guards because those globals are not available on every page.

The "⚙ Settings" entry point is in the account dropdown (top-right navbar), visible on all pages.

### Send Notification modal

`#sendNotifModal` is injected by `nav.js` (moderate size, `max-width:520px`), separate from the Settings modal. Opened via "📣 Send Notification" in the account dropdown — visible to **all** authenticated users.

- Recipient `<select id="sendNotifTarget">` is populated from `GET /api/users/active-list` (any authenticated user; excludes self). An "All users (broadcast)" option is prepended only when `window.__navUser.role === 'admin'`.
- Channel checkboxes: Push notification (default checked) and/or Email — at least one required.
- Submits `POST /api/notifications` with `{ userId?, title, body?, url?, urlLabel?, channels }`. Server enforces that broadcast (omitted `userId`) requires `role === 'admin'`; individual targeting is open to any authenticated user.

### Notifications

`js/notifications.js` is loaded on all authenticated pages. `initNotifications(user)` is called by `nav.js` after navbar injection.

- Bell icon `#nav-notif-btn` in the top navbar row shows the unread count badge
- Panel opens as a Bootstrap dropdown listing last 50 notifications
- Real-time delivery via **SSE**: `new EventSource('/api/notifications/stream', {withCredentials:true})`
- `GET /api/notifications/unread-count` → badge on load
- `PATCH /api/notifications/read-all` → "Mark all read" button
- `PATCH /api/notifications/:id/read` → click on item
- Notifications may carry a `url` deep-link (e.g. `/costgrid.html?cgId=...`) rendered as a clickable link
- Any user can send a notification to another specific user (push and/or email) via the account dropdown's "📣 Send Notification" entry; broadcasting to all users is admin-only. See [Send Notification modal](#send-notification-modal).

`notifications.js` defines a standalone `_esc` fallback at the top in case `core.js` is not loaded on the page.

### Sharing

`js/shares.js` provides a generic share modal. Call `openShareModal(type, id, name)` where `type` is `'cost_grid'` or `'project'`. The modal handles user search by email, permission selection, and removal. Sharing triggers an email notification from the API.

**Inline share list (2026-09)**: `js/share-list-component.js` (`window.ShareListComponent`) is a reusable Vue component showing a read-only-at-a-glance "👥 Shared with" list (name/email, permission badge, ✕ remove button hidden for the owner row and whenever `can-manage` is `false`) via `GET /api/cost-grids/:id/shares` and `DELETE /api/cost-grids/:id/shares/:userId` — the same endpoints `js/shares.js` already used, no new API surface. It is registered as `app.component('share-list', window.ShareListComponent)` on both `pipeline.html`'s and `costgrid.html`'s Vue apps (props: `resource-type`, `resource-id`, `can-manage`) and does **not** add the ability to add a new share — that stays exclusive to `#shareModal`. Both pages listen for `#shareModal`'s `hidden.bs.modal` event at the `document` level to bump a `shareListRefreshTick` counter, forcing the `<share-list>` instance to remount (via a `:key` binding incorporating that tick) and refetch, so the inline list stays in sync after an add/remove/permission-change made through the modal.

### Design tokens

`css/tokens.css` is the single source of truth. Never use hardcoded hex values in JS or CSS — reference `var(--token-name)`.

Typography scale (all shifted up from Bootstrap defaults):
- `--text-2xs: 0.70rem` → `--text-2xl: 1.25rem`

Palette: steel blue (`--indigo-*`), slate blue (`--violet-*`), sand (`--sand-*`).

Brand: `--brand-navy: #0B1840`, `--brand-magenta: #F0287A`.

### DB migrations

| File | Description |
|---|---|
| `001_initial.sql` | Core schema (users, projects, cost grids, etc.) |
| `002_add_project_extra.sql` | `planning` and `groups` JSONB columns on `projects` |
| `003_add_task_description_dates.sql` | `description`, `start_date`, `end_date` on tasks |
| `004_add_notifications.sql` | `notifications` table |
| `005_drafts_pipeline_year_pot.sql` | `Draft` pipeline stage; `pipeline_year` on versions; `client_groups`; `pots` + `pot_history` |
| `006_pipeline_years.sql` | `pipeline_years` table (admin-managed visible years) |
| `007_version_date_varchar.sql` | `cost_grid_versions.start_date` / `end_date` → `VARCHAR(6)` (`YYYYMM`) |
| `008_version_client.sql` | `client_id UUID` added to `cost_grid_versions` |
| `009_version_project_name.sql` | `project_name VARCHAR(255)` added to `cost_grid_versions` |
| `010_pots_special_label.sql` | `special_label VARCHAR(255)` added to `pots` for virtual targets |
| `011_pot_history_note.sql` | `note VARCHAR(500)` added to `pot_history` for change justification |
| `012_currencies.sql` | New `currencies` (master, 20-code seed, EUR always active/locked 1:1) and `currency_rates` (rate-change history) tables; `cost_grid_versions.currency`/`projects.currency` converted from bare `CHAR(3)` to `VARCHAR(10) REFERENCES currencies(code)`; `cost_grid_versions.currency_rate DECIMAL(10,6)` added; `ratecard_entries.rate_overrides JSONB` added if not already present |
| `012_project_code.sql` | `projects.code VARCHAR(100)` added (D365 Project ID, separate from the internal UUID) |
| `012_project_task_date_char8.sql` | `project_tasks.start_date`/`end_date` widened `CHAR(6)` → `CHAR(8)` (YYYYMM → YYYYMMDD), existing values padded to `YYYYMM01` |
| `013_role_rate_overrides.sql` | `rate_overrides JSONB NOT NULL DEFAULT '{}'` added to `roles` for per-currency agency default rates |
| `014_terms_accepted.sql` | `terms_version INTEGER` and `terms_accepted_at TIMESTAMPTZ` added to `users` for T&C acceptance tracking |
| `015_app_settings.sql` | `app_settings` key/value table created; seeded with `terms_version` and `terms_content` |
| `016_version_project_task_ids.sql` | `task_ids JSONB NOT NULL DEFAULT '[]'::jsonb` added to `cg_version_projects`, tracking which cost-grid tasks are mapped to each linked project so Generate Project can detect free tasks across sessions |
| `017_task_names_direct.sql` | `task_names_direct JSONB NOT NULL DEFAULT '[]'::jsonb` added to `cg_version_projects`; backfills from `project_tasks` name matching |
| `018_sysadmin_role.sql` | Widens `users.role`'s CHECK constraint from `('admin','user')` to `('admin','user','sysadmin')`; no backfill — no existing row changes value, promotion is manual (`promote-sysadmin.js` or `admin.html`'s toggle) |
| `019_terms_versions.sql` | New `terms_versions` table (`id`, `version` INTEGER UNIQUE, `content`, `published_at`, `published_by`) — immutable, append-only, application code never UPDATEs/DELETEs it. Backfills one row from the then-current `app_settings.terms_content`/`terms_version` (the only text still recoverable — every earlier version had already been overwritten by the old single-row storage); the version subquery is `COALESCE(...,1)`-wrapped so a DB with `terms_content` but no `terms_version` key doesn't fail the migration |
| `020_resources_attribute_lists.sql` | New `resources` table (first/last name, email, `job_title` free text, `job_description`, optional `user_id` FK, `active`/`inactive` status) and a generic tag-taxonomy pair, `attribute_lists` (`name`, immutable `slug`) + `attribute_list_items` (`label`, `active`/`inactive` status, no physical delete) — seeds 4 empty lists (Market, Brand, Therapeutic Area, Service Type). First of four planned resource-allocation cycles; see `docs/superpowers/specs/2026-09-23-team-attribute-lists-design.md` |
| `021_attribute_list_items_unique_label.sql` | Case-insensitive unique index `(list_id, lower(label))` on `attribute_list_items` — closes the AL-08 known gap from the `020` cycle where two items with the same label (any case) could be created in one list |
| `022_version_project_tags.sql` | New `cost_grid_version_tags(version_id, item_id)` and `project_tags(project_id, item_id)` join tables (composite PK, FK to `attribute_list_items(id)` with no cascade since items are never physically deleted, plus a supporting index on `item_id`) — Cycle 2 of the resource-allocation initiative, linking `attribute_lists` tags to proposals/projects; see `docs/superpowers/specs/2026-09-23-tag-linking-design.md` |
| `023_backfill_project_tags.sql` | One-shot, idempotent backfill (Cycle 3a, 2026-09-25): copies a version's tags into `project_tags` for every project that has `cg_version_id` set and no `project_tags` rows. **Apply once** — a second run would also refill projects whose tags were deliberately cleared afterwards. Applied to the real `pdash-db` on 2026-09-25 (0 rows: no version had tags yet). See `docs/superpowers/specs/2026-09-25-resource-profile-design.md` |
| `024_resource_aliases_unmatched.sql` | Cycle 3b (2026-09-25): `resource_aliases` (`alias_normalized` UNIQUE match key, `display_name` as typed, `resource_id` NULL = ignored name, ON DELETE CASCADE, `created_by`/`updated_by`/`updated_at` audit) and `profile_unmatched` (queue of owner names that could not be matched, keyed `(project_code, name_normalized)` — by `project_code`, not project id, because `timesheets` is keyed by code and `projects.code` is not unique). Applied to the real `pdash-db` on 2026-09-25. **Note:** `scripts/test-branch.sh up` restores the main dump and skips migrations when the schema already exists, so a branch stack does not get a new migration until it is applied by hand. See `docs/superpowers/specs/2026-09-25-resource-profile-design.md` |
| `025_resource_role_id.sql` | Team role by id (2026-09-25): adds `resources.role_id UUID REFERENCES roles(id) ON DELETE RESTRICT`, backfills it from the old free-text `job_title` (by `roles.code`, case-insensitive with `ORDER BY id` for determinism, then by `roles.label`), **aborts with an explicit error if any resource matches neither**, then `SET NOT NULL` and `DROP COLUMN job_title`. Re-runnable (a no-op once `job_title` is gone). Applied to the real `pdash-db` on 2026-09-25 (0 resources). Motivation: the role strings in uploaded actuals are `roles.code`, never `roles.label`. See `docs/superpowers/specs/2026-09-25-team-role-by-id-design.md` |
| `026_profile_engine.sql` | Cycle 3c (2026-09-25): `resource_project_contributions` (per resource × project code hours), `profile_project_state` (queue + per-code state, keyed by `project_code`), `profile_job_runs` (run history, pruned to 50), `resources.profile JSONB` + `profile_computed_at`, and `app_settings` defaults `profile_job_interval_min=10` / `profile_job_enabled=true`. Idempotent. The worker's bootstrap rebuilds contributions from existing actuals on API start. Same `test-branch.sh` caveat as `024`. See [docs/api/profile-engine.md](docs/api/profile-engine.md) |

Run migrations with:
```powershell
docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/004_add_notifications.sql
```

### Language constraint

All user-facing text, alerts, labels, and instructions **must be in English**.
