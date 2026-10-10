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

`scripts/backup-db.sh` is the backup entry point — a timestamped `pg_dump -Fc` snapshot into `backups/` (gitignored), keeping the 3 most recent. `/finish-cycle`'s Gate 4 runs it automatically after merge is confirmed, so every merge to `main` leaves a fresh snapshot behind. Run it by hand before any risky operation on the main stack — see **Infrastructure safety** above, which is the rule that obliges it.

Restoring a dump, and recreating a stack from scratch by applying every migration in order (the one piped `psql` session, `-v ON_ERROR_STOP=1`, and the `\echo applying …` marker — three things that must stay as they are): [docs/ops/database.md](docs/ops/database.md).

### Testing & tooling

(These are standing rules — keep them here. The heading exists because they sat under "Database backup & full recreation" by position only, which is how the 2026-10-10 split briefly moved them into `docs/ops/database.md`.)

To test a feature branch in isolation before merging (separate containers/ports, doesn't touch the `main` stack):

```bash
scripts/test-branch.sh up      # build + start, clone data from main if running
scripts/test-branch.sh down    # tear down
scripts/test-branch.sh status  # "up" (exit 0) or "down" (exit 1) — both containers must be Docker-healthy
                                # for "up" (2026-08: previously just checked they existed via `docker ps`)
```

`/finish-cycle`'s Gate 2 calls `status` automatically to detect a branch environment still running from an earlier `/finish-cycle` attempt on the same branch, and asks to reuse or rebuild it instead of the plain "spin up now?" question. **This is the ordinary branch only** (2026-10-09): on a **no-code cycle** — as classified by `node scripts/classify-cycle.mjs`, whose rule is pinned by `scripts/classify-cycle.test.js` and explained in `PROCESS.md` §6 point 4c — Gate 2 skips its steps 1-5, so it never offers a stack at all; it runs `status` read-only after the user confirms the classification and *reports* a stack left running by an earlier attempt rather than reusing, rebuilding or tearing it down.

No bundler, no build step for the **runtime** — nginx serves `js/`/`css/` files exactly as they are on disk, and this must stay true.

A dev-only test toolchain exists for the frontend: root `package.json` + vitest + jsdom, isolated from the runtime (see `js/lib/` below). It is never bundled, never served — `node_modules/`, `package.json`, `package-lock.json`, `vitest.config.js`, and any `*.test.js`/`*.spec.js` file are explicitly denied in `nginx.conf`. Run tests with `npm test` (single run) or `npm run test:watch`. Vitest 4 needs Node ≥ 20.12 (it crashes at startup with `does not provide an export named 'styleText'` on older versions): if the host Node is older, run the suite in a throwaway container instead — no change to `package.json` or the scripts, the host `node_modules` is untouched (the anonymous volume keeps the Linux dependencies off it), and the main Docker stack is not involved:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/app" -v /app/node_modules -w /app node:22 sh -c 'npm ci --no-audit --no-fund >/dev/null 2>&1 && npm test'
```

The backend has its own, separate unit-test toolchain: Node's built-in `node:test` runner (zero new dependency), scoped to `api/src/**/*.test.js` via `api/package.json`'s `"test"` script (`node --test src/**/*.test.js`, run from inside `api/`). This is deliberately kept independent from the frontend's `vitest` config — `vitest.config.js`'s `include` is `['js/**/*.test.js', 'scripts/**/*.test.js']` (the second pattern since `scripts/classify-cycle.test.js`), so it never picks up `api/` files, and the backend runner never touches `js/`. A new test under `scripts/` therefore needs no config change. Files that `require()` Express/DB modules (e.g. `api/src/routes/timesheets.test.js`, which imports `./timesheets`) need `api`'s `node_modules` present — run via `docker exec pdash-api node --test src/...` (the container already has them and volume-mounts `api/src` live) if the host has no `api/node_modules` installed. Pure `api/src/lib/*.test.js` files have no such dependency and run anywhere.

Still no linter on the frontend or backend.

---

## Architecture

Multi-page app backed by a Node.js/Express REST API and PostgreSQL. Every page is Vue 3 (loaded via CDN, no build step) except the 9-line `index.html` redirect — the Vue migration (tracked page-by-page below) completed 2026-08-05 when `planning.html`, the last holdout, moved over. A handful of shared library files (`js/costgrid.js`, `js/clients.js`, `js/roles.js`, `js/programs.js`, `js/ratecards.js`, `js/upload.js`, `js/shares.js`, `js/notifications.js`, `js/nav.js`, `js/core.js`, `js/api.js`, `js/api-sync.js`) remain classic (non-Vue) scripts loaded as globals by the Vue pages — for which pages load which, see [docs/js/shared-libs.md](docs/js/shared-libs.md) and the per-file `docs/js/` files pointed at from the File structure block below.

### Pages

**Documentation routing convention:** the "Purpose" column below is a one-line summary only. Per-page implementation detail — cycle-by-cycle narrative, methods touched, first-attempt bugs, report references — lives in `docs/pages/<page-name>.md` (one file per page, created as each page's narrative is split out of this file; not every page has one yet). When working on a page that has a `docs/pages/` file, read that file, not this table, for implementation detail; when documenting a change to a page that has one, write the narrative there, not here. See `/sync-docs`'s routing rule for the imperative version of this instruction.

**This table is the page index.** Since the 2026-10-08 split, the File structure block below no longer carries a per-page entry — the two listed every page twice. A change to a page updates this row (only when its purpose actually changed) and its `docs/pages/` file, never the block.

| File | Route | Purpose |
|---|---|---|
| `index.html` | `/` | Redirect → `/pipeline.html` |
| `pipeline.html` | `/pipeline.html` | Pipeline board + cost grid editor access, Vue 3 (CDN, no build step, same pattern as `portfolio.html`/`project-config.html`). Full narrative: [docs/pages/pipeline.md](docs/pages/pipeline.md) |
| `portfolio.html` | `/portfolio.html` | Project reporting dashboard (portfolio overview + per-project KPI/burndown), Vue 3 (CDN, no build step, same pattern as `admin.html`/`project-config.html`); the `overview` view's Card and List layouts were redesigned 2026-10-08 (cycle 1: the views) — stylesheet `css/portfolio.css`, shared with `program.html` since the Program Dashboard cycle. Full narrative: [docs/pages/portfolio.md](docs/pages/portfolio.md) |
| `program.html` | `/program.html?programId=` | Program Dashboard (2026-10-08) — a programme-level overview (4 KPIs, aggregated burndown, List/Timeline view of member projects), Vue 3 (CDN, no build step, same pattern as `portfolio.html`); no menu entry, reached from `portfolio.html`'s `Dashboard`/`Program Dashboard →` entries and the project reporting view's program row; shares `css/portfolio.css` with `portfolio.html`. Full narrative: [docs/pages/program.md](docs/pages/program.md) |
| `planning.html` | `/planning.html` | Resource planning view, Vue 3 (CDN, no build step, same pattern as `pipeline.html`/`costgrid.html`); since 2026-09-29 the three views render from the server's planning model (`POST /api/planning/model`). Full narrative: [docs/pages/planning.md](docs/pages/planning.md) |
| `costgrid.html` | `/costgrid.html?cgId=&verId=` | Cost grid editor (full-page), Vue 3 (CDN, no build step, same pattern as `pipeline.html`/`portfolio.html`); redesigned 2026-10-07 (cycle A: desktop + tablet) around one header card, three collapsible cards (Offer details/Tags/Sharing) with per-proposal persistence, a sticky-first-column grid with a role ⋮ menu, and a single-CTA task-selection flow — own stylesheet `css/costgrid.css`. Full narrative: [docs/pages/costgrid.md](docs/pages/costgrid.md) |
| `timesheets.html` | `/timesheets.html` | XLS timesheet upload management. Full narrative: [docs/pages/timesheets.md](docs/pages/timesheets.md) |
| `master-clients.html`, `master-client-groups.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html` | `/master-*.html` | **Master Data** (2026-10-05, split of the former `config.html`): one page per functionality — Clients, Client Groups, Pipelines & POT targets, Roles & rates, Currencies — linked by a lateral sub-menu (`.md-subnav`); admin **or sysadmin** only; the Programs management is no longer in Config. `/config.html` is only a redirect to `/master-clients.html`. Full narrative: [docs/pages/config.md](docs/pages/config.md) |
| `project-config.html` | `/project-config.html?projectId=` | Full-page project config form (tasks, phasing, planning, groups); viewer mode: sticky read-only banner + all inputs disabled + action buttons hidden. Full narrative: [docs/pages/project-config.md](docs/pages/project-config.md) |
| `admin.html` | `/admin.html` | User management — invite, role, disable, anonymize (admin **or sysadmin**); role toggle admin↔user open to any admin/sysadmin, grant/revoke sysadmin restricted to sysadmin viewers only. Full narrative: [docs/pages/admin.md](docs/pages/admin.md) |
| `terms.html` | `/terms.html?next=` | Public (auth required) — T&C acceptance page shown on first login or after version bump. Full narrative: [docs/pages/terms.md](docs/pages/terms.md) |
| `login.html` | `/login.html` | Public — login form |
| `activate.html` | `/activate.html?token=` | Public — account activation |
| `reset-password.html` | `/reset-password.html?token=` | Public — password reset |
| `_db-reset.html` | `/_db-reset.html` | **Sysadmin-exclusive** hidden page for bulk DB data deletion by scope, Vue 3 (CDN, no build step, same pattern as `admin.html`), linked from the sysadmin-only navbar menu (`initNav('dbreset', ...)`); also has "Delete single proposal" widget (UUID input, cascade delete) and "Change proposal owner" widget (UUID + active-user dropdown). Full narrative: [docs/pages/db-reset.md](docs/pages/db-reset.md) |
| `_terms-editor.html` | `/_terms-editor.html` | **Sysadmin-exclusive** hidden page — Terms & Conditions editor, Vue 3 (CDN, no build step, same pattern as `_db-reset.html`), linked from the sysadmin-only navbar menu (`initNav('termseditor', ...)`); moved here from `admin.html`'s former T&C card, which is now removed. Full narrative: [docs/pages/terms-editor.md](docs/pages/terms-editor.md) |
| `settings.html` | `/settings.html` | Settings page (2026-09-30): opened from the account dropdown's "⚙ Settings"; currently blank apart from the navigation, breadcrumb and the title, open to any authenticated user. Replaced the former Settings modal. Full narrative: [docs/pages/settings.md](docs/pages/settings.md) |
| `team.html` | `/team.html` | Resource registry CRUD (name/email/role by id/job description, optional link to a PDash user) plus, since 2026-09 (Cycle 3b), an "Unmatched names" queue (its own page tab) that links the free-text owner names found in uploaded actuals to resources (aliases), and (Team UX, 2026-09-25) a sortable table, a resource detail side panel and a searchable assign control, and (Cycle 3c, 2026-09-25) an "Experience profile" tab showing the per-person hours tree; admin **or sysadmin**, linked from the ⚙ Admin dropdown. Full narrative: [docs/pages/team.md](docs/pages/team.md) |
| `attribute-lists.html` | `/attribute-lists.html` | Generic, agnostic tag/taxonomy admin console — create lists and their items (Market/Brand/Therapeutic Area/Service Type seeded, more addable without code changes), admin **or sysadmin**, linked from the ⚙ Admin dropdown. As of Cycle 2 (2026-09), its lists/items are consumed by `costgrid.html`/`project-config.html`'s "🏷 Tags" sections via the shared `js/tags.js` helper. |
| `profile-jobs.html` | `/profile-jobs.html` | **Hidden page, no menu entry** — profile-engine job console (queue/status list, force recalculation, worker schedule, run history), reached only via a "Profile processing →" button on `timesheets.html`; admin **or** sysadmin. Full narrative: [docs/pages/profile-jobs.md](docs/pages/profile-jobs.md) |

### File structure

```
HTML pages               — the Pages table above is the page index: route, one-line purpose, and a docs/pages/
                            link where that page has a narrative file (not all do). Do not restate per-page
                            detail here. The table does not claim to be exhaustive of every .html file at the
                            repo root — test-cases.html, for one, is not in it. That page (a dev-only manual
                            test checklist, no navigation, results in localStorage) has held no case data
                            since 2026-10-09: it fetches TEST_CASES.md and parses it with
                            js/lib/test-cases-parse.js. Hence TEST_CASES.md counts as code for
                            scripts/classify-cycle.mjs, and /sync-docs no longer mirrors edits into the HTML.
css/                     — seven stylesheets: tokens.css (design tokens, also `[v-cloak]`), style.css (components
                            + navigation), admin-crud.css, auth.css, pipeline.css, costgrid.css, portfolio.css. Detail:
                            [docs/css/stylesheets.md](docs/css/stylesheets.md). App-wide rules stay in "Design
                            tokens" and "Cache-busting" below.
js/api.js                — Api.* namespace + apiFetch wrapper (401 → login redirect; parsed error body attached
                            as `err.data`). Detail: [docs/js/shared-libs.md](docs/js/shared-libs.md).
js/api-sync.js           — in-memory ↔ API sync layer (cgSyncFromApi, loadConfigFromApi, _pushProjectToApi, etc.). Full narrative: [docs/js/api-sync.md](docs/js/api-sync.md).
js/core.js               — state, in-memory helpers (loadConfig/persistConfig are no-ops), shared badges, esc(), fmtH(), showConfirm()/showInfo() modal idioms, findRate(), formatUploadInconsistencies(). Full narrative: [docs/js/core.md](docs/js/core.md).
js/nav.js                — navigation injection, initNav(): one `<aside class="pd-nav">` (sidebar ≥ 1024px, icon
                            navbar below), the shared modals, the T&C gate, initNotifications(), window.__navUser.
                            Full narrative: [docs/js/nav.md](docs/js/nav.md); the rules that must hold are in
                            "Invariants" and "Page shell" below.
js/notifications.js      — bell icon + SSE notification panel; initNotifications(user) called by nav.js; also drives browser/desktop notifications. Full narrative: [docs/js/notifications.md](docs/js/notifications.md).
js/costgrid.js           — shared cost-grid business-logic library, a permanent shared Vanilla service layer (not
                            migration debt) with 2 consumers: `pipeline.html` and `costgrid.html`. Full narrative:
                            [docs/js/costgrid.md](docs/js/costgrid.md).
js/cg-controls.js        — the editor's three custom Vue controls (date picker, select, people picker), loaded only
                            by `costgrid.html`; pure helpers in js/lib/cg-controls-calc.js. Detail:
                            [docs/js/cg-controls.md](docs/js/cg-controls.md).
js/*.js (the rest)       — the other shared classic scripts loaded as globals by the Vue pages: shares.js,
                            share-list-component.js, clients.js, roles.js, programs.js, ratecards.js,
                            upload.js, tags.js, portfolio.js. Detail:
                            [docs/js/shared-libs.md](docs/js/shared-libs.md).
js/lib/                  — pure functions extracted for unit testing (vitest + jsdom), each an ES module
                            (`export function ...`) with a `window.<name> = <name>` bridge for classic-script
                            callers. The module-by-module index and history: [docs/js/lib.md](docs/js/lib.md).
                            Two of them have their own cross-cutting sections below: money.js ("Money formatting
                            and parsing") and project-rules.js ("Project currency lock"). One, test-cases-parse.js
                            (2026-10-09), is the exception to the "bridge" rule — its only consumer,
                            test-cases.html, imports it as a module, so it has no `window.` bridge.
api/src/routes/          — Express routes (auth, users, config, cost-grids, projects, timesheets,
                            reporting, exports, notifications, pipeline-years, client-groups, pots, reset,
                            app-settings, currencies, attribute-lists, resources, planning, planning-assistant).
                            Several have a docs/api/<name>.md with the route-by-route detail — the entries below
                            link theirs. The rest (auth, client-groups, cost-grids, pots, projects, reporting,
                            pipeline-years) have no docs/api file: read the route itself — pipeline-years is
                            the one whose entry below points at a docs/pages file instead.
api/src/routes/config.js — clients / client groups / programs / roles / ratecards CRUD (backs the Master Data pages). Full narrative: [docs/api/config.md](docs/api/config.md).
api/src/routes/currencies.js — currencies admin surface (backs `master-currencies.html`). Detail: [docs/api/currencies.md](docs/api/currencies.md).
api/src/routes/attribute-lists.js — generic tag/taxonomy CRUD; reads are requireAuth, writes requireAdmin, no DELETE by design. Detail: [docs/api/attribute-lists.md](docs/api/attribute-lists.md).
api/src/routes/pipeline-years.js — `GET /api/pipeline-years` returns `id, year, active, created_at` plus, since 2026-10-06, `offers` per year: the visible proposals (same visibility as `GET /api/cost-grids`) whose display version is not Draft and not Canceled; feeds the year menu "N offers". Non-admins only see active years (what happens when one selects an inactive year anyway: [docs/pages/pipeline.md](docs/pages/pipeline.md)).
api/src/routes/users.js  — PATCH /:id (role/status), POST /:id/anonymize, DELETE /:id. Detail: [docs/api/users.md](docs/api/users.md).
api/src/routes/exports.js — POST /api/exports/{portfolio|cost-grids|ratecards} + GET /api/exports/phasing. Detail: [docs/api/exports.md](docs/api/exports.md).
api/src/routes/timesheets.js     — GET / (summary), POST /upload (XLS ingest + role/task validation gate), DELETE /:projectCode. Full narrative: [docs/api/timesheets.md](docs/api/timesheets.md).
api/src/routes/notifications.js  — SSE stream, CRUD, push; exports { router, pushToUser, createNotification }. Full narrative: [docs/api/notifications.md](docs/api/notifications.md).
api/src/routes/app-settings.js   — App-wide settings routes, incl. Terms & Conditions storage/version history (GET/PUT /terms, /terms/draft, /terms/versions). Full narrative: [docs/api/app-settings.md](docs/api/app-settings.md).
api/src/routes/reset.js          — GET /api/admin/reset/scopes + POST /api/admin/reset/:scope (**sysadmin-exclusive** bulk delete); also cost-grid single-proposal delete + owner reassignment. Full narrative: [docs/api/reset.md](docs/api/reset.md).
api/src/routes/resources.js — resource registry CRUD (backs `team.html`), the actuals-owner-name matching queue, and `GET /:id/profile`; all `requireAuth, requireAdmin`. Full narrative: [docs/api/resources.md](docs/api/resources.md).
api/src/routes/profile-jobs.js — the profile queue console API (`requireAuth, requireAdmin`). See [docs/api/profile-engine.md](docs/api/profile-engine.md).
api/src/routes/topics.js — `/api/topics`, `requireAuth, requireAdmin`: the shared, admin-curated competence vocabulary extracted from project/task descriptions. Full narrative: [docs/api/topics.md](docs/api/topics.md).
api/src/routes/planning.js       — `POST /api/planning/model`, `requireAuth`: the server-side calculation behind `planning.html`'s three views. Full narrative: [docs/api/planning-model.md](docs/api/planning-model.md).
api/src/routes/planning-assistant.js — `POST /api/planning-assistant/rank` and `/chat`, `requireAuth, requireAdmin`: the Team assistant's three team tables. Full narrative: [docs/api/planning-assistant.md](docs/api/planning-assistant.md).
api/src/lib/              — pure functions extracted for unit testing (node:test, run via `npm test`/`node --test`
                            from `api/`), mirroring the frontend's `js/lib/` convention. The module-by-module index
                            and history: [docs/api/lib.md](docs/api/lib.md). project-rules.js + version-lock.js have
                            their own section below ("Project currency lock").
api/src/services/        — email (nodemailer) and jwt, plus resource-matching, profile-engine/worker, llm,
                            planning-assistant, planning-data and topic-extraction. Index and detail:
                            [docs/api/services.md](docs/api/services.md).
api/src/middleware/auth.js — `requireAuth` (JWT cookie → `req.user`), `requireAdmin` (`role === 'admin' ||
                            role === 'sysadmin'`, JWT-cached — trusts the token's role claim for up to its 8h
                            lifetime), `requireSysAdmin` (`role === 'sysadmin'` exclusive; unlike `requireAdmin`,
                            re-reads the role from the DB on every call — gates `reset.js` and `PUT
                            /api/app-settings/terms`, where an up-to-8h-stale revocation window on genuinely
                            irreversible bulk-deletion routes was judged unacceptable, 2026-09). `liveRole(userId)`
                            (2026-10-01): the role read from the DB, used by the project rules (see "Project
                            currency lock" below) so a demoted sysadmin loses the exception at once.
api/src/index.js         — app bootstrap and route mounting; also holds the planning-cache write-invalidation middleware (2026-09-29): any successful non-GET request under `/api/projects`, `/api/timesheets`, `/api/resources`, `/api/admin/reset`, `/api/cost-grids` calls `invalidatePlanningData()`. **A new write path that changes planning inputs outside those prefixes must be added to `PLANNING_WRITE_PREFIXES`** (the 30 s TTL is only the safety net).
api/src/create-admin.js  — CLI bootstrap script (admin user create/reset); always sets role='admin' by design. See [docs/api/users.md](docs/api/users.md).
api/src/promote-sysadmin.js — CLI script to promote an existing user to `role='sysadmin'` — the separate step needed after `create-admin.js`. See [docs/api/users.md](docs/api/users.md).
api/src/db/migrations/   — numbered SQL migration files
scripts/test-branch.sh   — isolated Docker Compose stack for testing the current feature branch before merge; up/down/status subcommands. Full narrative: [docs/scripts/test-branch.md](docs/scripts/test-branch.md).
scripts/run-tests.sh     — ephemeral, fully isolated Docker Compose stack for the integration-test profile (no host ports, disposable volume, auto-teardown via trap). Full narrative: [docs/scripts/run-tests.md](docs/scripts/run-tests.md).
scripts/backup-db.sh     — pg_dump -Fc snapshot of the main stack's pdash-db into backups/ (gitignored), timestamped to the second, keeps only the 3 most recent dumps; non-blocking (warns + exits 0 if pdash-db isn't running). Run standalone, or automatically by /finish-cycle Gate 4 right after merge — see "Database backup & full recreation" above.
scripts/classify-cycle.mjs — classifies a branch for `/finish-cycle`'s Gate 2 (`no-code` vs `ordinary`,
                            plus the paths judged); the rule is pinned by its own `.test.js`, not by prose.
scripts/architecture-guard.test.js — (2026-10-10) fails when `ARCHITECTURE.md` §5/§6 drift from the code
                            (routes, tables, added columns). What it deliberately does not check, and why,
                            is in the file's own header — read it there, not from a paraphrase.
scripts/shoot.mjs        — renders pages of the running app with headless Chrome, one PNG per width, for comparing a
                            redesign against its design boards. **Reading the PNGs back is part of visual
                            verification — "the page can't be rendered here" is not a valid reason to skip it.**
                            Invocation, `--eval`, credentials and the worktree/`--base` trap:
                            [docs/scripts/shoot.md](docs/scripts/shoot.md). See docs/superpowers/PROCESS.md §6.3/§6.6.
```

### `v-cloak` (all Vue pages, 2026-07)

Every one of the 19 Vue-mounted pages (all pages except the `index.html` and `config.html` redirect stubs) has `v-cloak` on its actual Vue root mount element, paired with the `[v-cloak] { display: none; }` rule in `css/tokens.css`. This hides the raw, uncompiled template markup that would otherwise briefly flash on load/reload before Vue finishes mounting (each page is a runtime-compiled `Vue.createApp({...}).mount(...)` with no build step, so the template is the literal HTML already in the file). Vue removes the `v-cloak` attribute automatically once mounting completes — no application code manages it. **Any new Vue page must add `v-cloak` to its root mount element** to get this protection; it is not automatic. If a root element ever needs an inline `display` style (as `pipeline.html`'s did — extracted into `.pb-board-root` in `css/style.css` for exactly this reason), prefer a CSS class over an inline `style` attribute, since an inline style would otherwise need `!important` on the `[v-cloak]` rule to be overridden (a global, blunt fix for what is really a single-page conflict).

### Routing

Navigation is URL-based — clicking a nav tab changes `window.location.href`. Each page is a self-contained HTML file that initialises its own data on `DOMContentLoaded`.

Each page calls `initNav(activeTab)` from `nav.js` which:
1. Injects the shared navigation (one `<aside class="pd-nav">`: a left sidebar at ≥ 1024px, a two-row icon navbar below; no footer — see [docs/js/nav.md](docs/js/nav.md) → "Current state")
2. Injects the change-password modal, send-notification modal, and "My Profile" modal HTML (centralised — do NOT duplicate in page HTML)
3. Calls `GET /api/auth/me` — redirects to `/login.html` on 401; redirects to `/terms.html` if `user.terms_version < user.current_terms_version`
4. Stores the user object in `window.__navUser`
5. Wires all navbar events (account dropdown, settings link to `/settings.html`, change password, notifications)
6. Calls `initNotifications(user)` from `notifications.js`
7. Returns the user object

All authenticated pages must load `core.js`, `api.js`, `nav.js`, and `notifications.js` (`api-sync.js` too, if the page actually calls one of its exports — e.g. cost-grid/project/timesheet sync pages; most admin CRUD pages don't and may omit it). **Corrected 2026-09** — this previously prescribed one fixed linear order (`core.js, api.js, api-sync.js, nav.js, notifications.js, settings.js`); no page, including `pipeline.html`, ever actually followed it (`pipeline.html`'s real order is `api.js, core.js, settings.js, notifications.js, ..., api-sync.js, ..., nav.js` — nav.js last, not third). Per the "Script loading order" section above, deferred/module scripts share one execution queue ordered by document position — the only real constraint is that a file defining a global must appear before a file that reads it (e.g. `core.js`'s `esc()`/`showConfirm()` before any script calling them, `nav.js` before `initNotifications()`'s caller). There is no other project-wide ordering requirement to enforce.

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

### Page shell (2026-10-02, Navigation Cycle B1)

Every authenticated page (the 18 that call `initNav`: pipeline, portfolio, planning, costgrid, project-config, team, the five `master-*` pages (Master Data), timesheets, admin, attribute-lists, profile-jobs, settings, `_db-reset`, `_terms-editor`) wraps navigation and content as `<div id="app-shell"><div id="nav-container"></div><div id="app-main">…existing Vue root(s)…</div></div>`, with all `<script>` tags after the shell. It is hand-written in each page, **outside** every Vue mount point (roots and `v-cloak` unchanged). `css/style.css` defines `:root { --sidebar-w: 0px; }` and `#app-main { margin-left: var(--sidebar-w); }` — since Cycle B2 a media query sets `--sidebar-w` (240px open, 68px rail, 0 below 1024px), see [docs/js/nav.md](docs/js/nav.md) → "Current state". `#app-shell`/`#app-main` must never get `overflow`, `transform`, `filter`, `contain`, `will-change` or `position` (it would break the descendants' `fixed`/`sticky` panels); `js/lib/nav-shell-guard.test.js` pins this, the structure of all 18 pages and the `?v=` agreement of `style.css`/`core.js`/`nav.js`/`notifications.js`. **A new authenticated page must use this wrapper.** Each page's `<head>` carries the same inline, inert snippet that reads `localStorage['PDash_sidebarCollapsed']` (`'1'` = collapsed) and sets `data-sidebar="collapsed"` on `<html>` before first paint; the key is in `core.js`'s `keep` Set. Detail: [docs/js/nav.md](docs/js/nav.md), spec `docs/superpowers/specs/2026-10-02-navigation-b1-page-shell-design.md`.

### Data strategy (in-memory cache)

In-memory module-level variables are the UI cache; the API is the source of truth. **localStorage is not used for server data** — it holds only `PDash_summary` (portfolio summary selection), `PDash_browserNotifDisabled` (2026-09, the browser-notification opt-out — see `js/notifications.js`'s entry), `PDash_sidebarCollapsed` (2026-10-02, the sidebar open/collapsed state, see "Page shell"), `PDash_cgCompactHeader` (the cost-grid editor's compact header) and `PDash_portfolioLayout` (2026-10-08, the portfolio overview's Card/List choice, see [docs/pages/portfolio.md](docs/pages/portfolio.md)), all genuinely client-side. `js/core.js`'s `cleanLegacyStorage()` IIFE wipes any other `PDash*` key on every page load (navigation here is full-page, not SPA, so this runs constantly) — **any new localStorage key must be added to its `keep` Set or it will be silently deleted on the very next navigation**, a real bug caught by code review in the browser-notification cycle (the opt-out flag was originally missing from this list, making "Disable" revert itself on the next page load). `PDash_settings` (the old personal AI keys) is deliberately no longer in the set, so stale browsers have it wiped on their first load (Cycle B, 2026-09-30).

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
| `_pushProjectToApi(project)` | Write-through: pushes project (all sub-resources) to API; returns `false` only if the core upsert failed |
| `_pushProjectToApiDetailed(project)` | Same push, returns `{ ok, failed: [{part, error}] }` and never throws; used by `project-config.html`'s `onSave` so a failed save is not reported as success. Empty sections are pushed too (2026-09-30); `{ skipEmpty: true }` (opt-in, used only by `js/costgrid.js`'s two callers) skips empty sections so a stale in-memory copy cannot wipe them; `_pushProjectToApi(project, opts)` forwards it |

**Cost grid store** (`_cgStore` Map in `costgrid.js`): replaces `PDash_cg_*` localStorage keys. `cgLoad/cgSave/cgGetIndex` operate on this Map. Deep-clones on read and write to avoid accidental in-place mutation.

**Rate consistency**: `PUT /api/cost-grids/:id/versions/:vId/structure` always snapshots all role rates as `rate_override` in `task_roles`, regardless of whether the role is custom or ratecard-priced. This ensures the `/budgets` SQL (`COALESCE(tr.rate_override, r.hourly_rate, 0)`) always uses the correct rate. When `cgLoadStructureFromApi` reads structure back, it refreshes `ver.roles` from DB only when all roles have `rate_override` set (meaning the version was saved with the current fix); otherwise it preserves client-side ratecard rates already in memory.

### Pipeline stage: single source of truth

Pipeline stage is stored on `costGridVersion.pipeline`. These locations must stay in sync:

- `css/tokens.css` — `--pipeline-{stage}-bg` / `--pipeline-{stage}-color` for all 5 stages
- `js/core.js` `pipelineBadge()` — uses `var(--pipeline-*-color)`
- `js/costgrid.js` switch block — uses `var(--pipeline-*-color)`
- `pipeline.html`'s inline `PB_STAGE_STYLE` const — uses `var(--pipeline-*-bg/color)`
- `costgrid.html`'s inline `CG_HEADER_STAGE_STYLE` const (2026-10-07, costgrid redesign cycle A) — same `var(--pipeline-*-bg/color)` pattern as `pipeline.html`'s `PB_STAGE_STYLE`, for the header's own light-pill stage badge (the header pill needs the light look the design boards show, unlike `js/core.js`'s `pipelineBadge()`, which stays the solid secondary-badge style used for Linked projects cards elsewhere on the same page)

Valid stages: `SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`.

Kept in sync on `config.projects[].pipeline` (a separate field from `costGridVersion.pipeline`) by `cgPropagatePipelineToProjects()` (`js/costgrid.js`), which runs on every change of the cost grid editor's Pipeline `<select>` and updates every project in `linkedProjects` — the only path that ever changes a version's pipeline stage. `getProjectPipeline(projectId)` (`js/core.js`) resolves the authoritative value for a given project: the linked cost grid version's `pipeline` if `costGridRef` is set, else `config.projects[].pipeline` directly. `planning.html`'s Resource Planning view (this logic lived in `js/planning.js` before that file was deleted during the page's Vue migration — see [docs/pages/planning.md](docs/pages/planning.md)) deliberately reads `config.projects[].pipeline` directly rather than via `getProjectPipeline()` — by design, since resource planning applies once a task is converted into a project, not before — this is safe because of the propagation above, not despite it (verified: `docs/superpowers/audits/2026-07-09-project-pipeline-direct-reads-audit.md`).

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

No bundler means no content-hashed filenames — every `<script src="...">`/`<link href="...">` tag that references a project-owned `js/*.js`, `js/lib/*.js`, or `css/*.css` file carries its own `?v=N` query string (e.g. `js/nav.js?v=17`, `css/style.css?v=21`, `js/lib/pipeline-calc.js?v=2`). The full URL — path *and* query string — is the browser's cache key, so **editing a versioned file's content without bumping every `?v=N` reference to it is a live production bug**, not a cosmetic omission: any browser that already cached the old URL keeps serving the pre-edit file indefinitely, even though the file on disk (and on the server) is current.

This has caused two real production incidents: `css/style.css` and `js/nav.js` were modified in the `nav-admin-dropdown` cycle (2026-09) without either's `?v=N` ever being bumped, left silently stale across all 10 authenticated pages that load them; and `js/lib/pipeline-calc.js` gained two new exports (`pbPriceBucketKey`/`pbCardMatchesFilters`) in the `pipeline-filters` cycle without `pipeline.html`'s own `?v=1` reference being bumped, causing a `ReferenceError: pbCardMatchesFilters is not defined` in production once real users' browsers had the old response cached. Both were fixed together in the `fix-pipeline-calc-cachebust` cycle (2026-09).

**Rule for every future change to a versioned file:** grep the whole repo for every `?v=N` reference to that exact file path before merging, and bump every one of them to the same new `N` — a file loaded on 10 pages needs its version bumped in all 10, not just the page you were actively testing. CDN-hosted libraries (Bootstrap, Chart.js, ExcelJS, etc.) are exempt — their URLs are already pinned to an exact library version. **`css/tokens.css` is NOT exempt** (corrected 2026-10-02: it is versioned, `?v=9` on all 18 pages that link it, and the design-foundations cycle changed its values for the whole app); `js/lib/foundations-guard.test.js` fails if the references to `tokens.css`, `style.css`, `admin-crud.css`, `auth.css` or `core.js` disagree on `?v=N`. **The `.html` pages themselves are not versioned**, so a browser may keep serving a cached page (with its old `<script ?v=N>` tags) after a deploy until its heuristic cache expires, and a developer testing an edited page needs a hard reload (found 2026-10-01); this is pre-existing and consistent (old page + old script versions), not a mismatch hazard.

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
- `showCostGridEditorView(cgId, verId, opts)` redirects to `costgrid.html?cgId=...&verId=...` on `pipeline.html` (a page-local override, plain redirect); `opts.focusName` appends `&focus=name` to the URL (2026-10-07, see [docs/pages/costgrid.md](docs/pages/costgrid.md) → "New Proposal / Clone"). On `costgrid.html` itself, `js/costgrid.js`'s own `showCostGridEditorView` is instead a thin bridge delegating into the page's mounted Vue instance (`_cgVueApp.openVersion(cgId, versionId)`) — no longer a single-page-app DOM-render function.
- On `costgrid.html` cold load: call `cgSyncFromApi()` before reading URL params to avoid empty `_cgStore`

### Invariants

One-line rules whose explanation moved to a `docs/` file in phase 3 of the context-size split (2026-10-10). A rule is restated here only when **no guard test pins it**; where a test does, the test is named instead.

- **Pipeline board columns row.** **Critical**: do NOT add `h-100` to the columns row. Bootstrap's `.h-100` applies `height:100%!important`, which would override the flex sizing and can hide the column below `overflow:hidden`. Full height math and board structure: [docs/pages/pipeline.md](docs/pages/pipeline.md) — "Current state".
- **Navigation.** Never render a second navigation. The element IDs it must emit are consumed by `notifications.js` and the nav wiring, and are pinned as a set by `js/lib/nav-model.test.js` ("keeps every existing element id") — read the list there, it is not restated here. Sidebar/navbar widths, the 1024px switch, breadcrumb height and the stacking order are pinned by `js/lib/nav-layout-guard.test.js`. Full description: [docs/js/nav.md](docs/js/nav.md) — "Current state".

### Settings page

The "⚙ Settings" entry in the account dropdown (visible on all pages) navigates to `/settings.html` (2026-09-30; it was a modal injected by `nav.js` before). The page is blank apart from the standard navigation/breadcrumb and the title "Settings", open to any authenticated user. The modal's content (CSV exports, Full Backup, Restore from Backup), `js/settings.js` and the personal AI-key tab were all removed; the `/api/exports/*` routes stay, without UI. See [docs/pages/settings.md](docs/pages/settings.md).

### Send Notification modal

`#sendNotifModal` is injected by `nav.js` (moderate size, `max-width:520px`), separate from the Settings page. Opened via "Send Notification" in the account dropdown — visible to **all** authenticated users.

- Recipient `<select id="sendNotifTarget">` is populated from `GET /api/users/active-list` (any authenticated user; excludes self). An "All users (broadcast)" option is prepended only when `window.__navUser.role === 'admin'`.
- Channel checkboxes: Push notification (default checked) and/or Email — at least one required.
- Submits `POST /api/notifications` with `{ userId?, title, body?, url?, urlLabel?, channels }`. Server enforces that broadcast (omitted `userId`) requires `role === 'admin'`; individual targeting is open to any authenticated user.

### Notifications

`js/notifications.js` is loaded on all authenticated pages. `initNotifications(user)` is called by `nav.js` after navbar injection.

- Bell icon `#nav-notif-btn` (bottom block of the sidebar; top bar on small screens, never inside the account menu) shows the unread count badge, and with unread items turns white with a red icon/border (`has-unread`, toggled by `updateBadge`)
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

### Money formatting and parsing (2026-10)

One implementation, `js/lib/money.js` (server twin `api/src/lib/money-format.js`): every amount is formatted and parsed with the **locale of its currency** (`currencies.locale`, loaded into `window.__currencies` by `loadCurrenciesFromApi()` before a page's first render — the `master-*.html` pages that need it and `timesheets.html` load it directly because they do not load `api-sync.js`), never with a hardcoded `en`/`it-IT`/`de-DE` rule. Rules to keep:
- **Never use `Intl.NumberFormat` (or `toLocaleString`) on an amount outside the module** — `js/lib/money-guard.test.js` fails on any `Intl.NumberFormat` outside `money.js`/`money-format.js`, and on a page that loads `core.js` and uses a money function without loading `money.js` (`toLocaleString` is still fine for hours, counts, dates and exchange rates).
- **Format an amount in a list/loop by passing the row's own currency code**; there is no implicit default currency any more (the former `fmtMoney`/`currentCfg` fallback was removed), so a missing code is a bug, not a silent EUR.
- **Money `<input>`s**: show `formatMoneyInput(v, code, currencies)` on focus (the format `parseMoney` reads back), `parseMoney(text, code, currencies)` on blur, then reformat with `formatMoney`; parsing is strict per locale (no guessing the other convention). `type="number"` rate inputs and hours inputs are not part of this.
- **The project's currency in memory is an ISO code** (`EUR`, `USD`, `CHF`…); symbols are derived only for display (`currencyInfo(code, currencies).symbol`). Decimals follow the currency (JPY none), the thousands separator is always shown (`useGrouping: 'always'`).
- Known open items (a planned follow-up cycle, "project currency change control"): a project's `currency` is independent of its proposal's, project-config has no exchange-rate handling, and program-level totals in `portfolio.html` sum amounts of different currencies without conversion. The one-line wrappers (`fmtMoney`, `cgFmtCurrency`, `pbFmtMoney`, the `config.html` copies) and the `currentCfg` global were removed (2026-10, money wrapper cleanup): call sites call `formatMoney(amount, code, currencies)` from `js/lib/money.js` directly, with the currency explicit (Vue pages expose `formatMoney` and `currencies` on the instance; `portfolio.html` uses a `dashCurrency` computed, its pinned summary uses EUR). Current cache versions: `js/lib/money.js?v=2`, `js/core.js?v=13`, `js/costgrid.js?v=39`, `js/lib/pipeline-calc.js?v=5`, `js/portfolio.js?v=2` (`planning.html`).

Full detail: [docs/js/lib.md](docs/js/lib.md) (`money.js`), [docs/api/lib.md](docs/api/lib.md) (`money-format.js`), spec `docs/superpowers/specs/2026-10-01-money-centralization-design.md`.

### Project currency lock (2026-10)

A project generated from a proposal keeps the proposal's currency and neither side can change it afterwards; creating a project without a proposal, deleting a project and unlinking it from a proposal are inhibited. Everything is enforced on the **API** for everyone except a sysadmin (live DB role via `liveRole`), with `400 { error, code: 'PROJECT_RULE' }`, and mirrored in the UI. Rules to keep:
- **Server rules live in `api/src/lib/project-rules.js`** (pure, `node:test`) and are called from `routes/projects.js` (`POST`: a project needs a proposal; `PATCH`: a currency change, clearing/re-pointing `cgVersionId`, a new link needs the same currency; `DELETE`) and `routes/cost-grids.js` (version `PATCH` currency while it has projects, version/proposal `DELETE` with projects, linked-projects `POST` currency check and `DELETE`). "Version has projects" = a `cg_version_projects` row **or** a `projects.cg_version_id`. A re-sent identical `currency`/`cgVersionId` is accepted (the frontend re-sends the whole project on every save).
- **Single switch-back points:** `DIRECT_PROJECT_CREATION_ENABLED` and `PROJECT_REMOVAL_ENABLED` in `project-rules.js` (server, both `false`) and `DIRECT_PROJECT_CREATION_ENABLED` in `js/lib/project-rules.js` (browser, keep in sync by hand). Re-enabling direct creation also needs the conversion/rate cycle (project-config's Currency menu is already editable on a brand-new project).
- **Currency change vs linking is serialised per version** by `api/src/lib/version-lock.js` (`pg_advisory_xact_lock`): the version currency check+write and all three link paths run under it (the project `PATCH` takes it before its project row lock).
- **`js/api-sync.js` must not retry a refused `PATCH` as a `POST`:** a `PROJECT_RULE` refusal is final (any other failure of the update still means "project not there yet").
- UI: costgrid's Currency menu locks as soon as the version has a linked project (reads `this.cg` for Vue reactivity, see `docs/pages/costgrid.md`); project-config's menu is read-only except on a brand-new project; `portfolio.html`'s `＋ New project` is disabled and `project-config.html` without `projectId` redirects to the portfolio with a notice. No UI exists to delete or unlink a project.
- Tests: `api/src/lib/project-rules.test.js`, `js/lib/project-rules*.test.js`, `test-api.js` `PR-01..PR-14` (project setup/cleanup there runs as the **sysadmin**; `api/src/scripts/seed-planning-golden.js` also needs a sysadmin account).

Full detail: [docs/api/lib.md](docs/api/lib.md) (`project-rules.js`, `version-lock.js`), [docs/js/lib.md](docs/js/lib.md) (`project-rules.js`), spec `docs/superpowers/specs/2026-10-01-project-currency-lock-design.md`.

### Design tokens

`css/tokens.css` is the single source of truth. Never use hardcoded hex values in JS or CSS — reference `var(--token-name)`.

Typography scale (all shifted up from Bootstrap defaults):
- `--text-2xs: 0.70rem` → `--text-2xl: 1.25rem`

Palette: steel blue (`--indigo-*`), slate blue (`--violet-*`), sand (`--sand-*`).

Brand: `--brand-navy: #0B1840`, `--brand-magenta: #F0287A` (`--brand-magenta-hover`/`-active` for button states).

**Design foundations (2026-10-02, Cycle A of the redesign):** added to `tokens.css` — project-status colours `--status-{not-started,started,at-risk,on-hold,completed}-bg` + one shared `--status-text` (read by `statusBadge()`/`statusBadgeLarge()` in `js/core.js`); chart colours `--chart-actual`/`--chart-committed`/`--chart-phasing` (read through `chartColor()` in `portfolio.html`, since Chart.js cannot resolve `var()`); `--color-{success,danger,info}-text`, `--color-danger-hover`/`-active`, `--focus-ring` (form-control focus only; buttons keep Bootstrap's ring), `--font-family-base`, `--weight-*`, `--leading-*`, `--z-tooltip` (defined, deliberately not applied: Bootstrap's tooltip is at 1080). Changed values: `--text-muted` `#6b7280`, `--border-light` `#e5e7eb`, and the stage text colours of SIP/Expected/Anticipated/Canceled darkened to pass WCAG AA (backgrounds unchanged). **Rule: every colour pair that is text on a background in `tokens.css` must stay ≥ 4.5:1 — `js/lib/tokens.test.js` computes it.** `style.css` gained token-driven `.btn-danger`, `.btn-ghost`, `.btn-icon`, a magenta `.spinner-border`, and `--bs-*` overrides for `.alert-*`, `.dropdown-menu` and `.modal` (the modal variables must stay on `.modal`, not `.modal-content`). Known accepted gap: white text on `--brand-magenta` buttons is 3.97:1 (brand decision, not changed). Hardcoded literals left in the edited files are listed in `docs/superpowers/reports/2026-10-02-design-foundations-literals-inventory.md`; the other pages' literals belong to the page-by-page cycles. Handoff from Claude Design: `docs/superpowers/design/2026-10-02-foundations-handoff.md`.

### DB migrations

One numbered SQL file per migration in `api/src/db/migrations/`, applied by hand — nothing in the running app applies them. What each file does: [docs/db/migrations.md](docs/db/migrations.md).

Three things stay here because they are acted on, not read:

- `023_backfill_project_tags.sql` — **Apply once** — a second run would also refill projects whose tags were deliberately cleared afterwards.
- `027_project_descriptions.sql` — **The backfill is apply-once** (fills only empty fields, but must not be re-run casually).
- **Note:** `scripts/test-branch.sh up` restores the main dump and skips migrations when the schema already exists, so a branch stack does not get a new migration until it is applied by hand. (stated for `024`, and the same caveat applies to `026` and `027`)

Run migrations with:
```powershell
docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/004_add_notifications.sql
```

### Language constraint

All user-facing text, alerts, labels, and instructions **must be in English**.
