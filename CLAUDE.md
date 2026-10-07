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

Run this in **Bash** (the loop is bash syntax, not PowerShell):

```bash
for f in api/src/db/migrations/*.sql; do
  printf '%s\n' "\\echo applying $(basename "$f")"   # %s: printf would read \e as ESC
  cat "$f"
  printf '\n'
done | docker exec -i pdash-db psql -U pdash -d pdash -v ON_ERROR_STOP=1
docker exec pdash-api node /app/src/create-admin.js <email> <password> [firstName] [lastName]
```

This is the same pattern `scripts/test-branch.sh` and `scripts/run-tests.sh` use internally for their own isolated stacks — nothing in the running app (`api/Dockerfile`, `api/src/index.js`, `create-admin.js`) applies migrations automatically, so a genuinely empty `pdash-db` stays schema-less until this is run by hand.

**Three things that must stay this way, in all three copies** (2026-10-07; the per-file `docker exec` loop this replaced is still quoted in older specs/plans under `docs/superpowers/` as a historical record — do not copy it from there):
1. **One piped `psql` session, not one `docker exec` per file.** A `docker exec` costs ~1.2 s on this machine (measured), so 30 files cost ~37 s per stack creation instead of ~1 s.
2. **`-v ON_ERROR_STOP=1`.** Without it a failing migration is ignored and the run continues, leaving an incomplete schema with no error — the actual bug this fixed, worse than the lost time.
3. **The `\echo applying …` marker and the trailing `printf '\n'`.** `psql` reports line numbers against the concatenated stream, so without the marker a failure never names the migration that broke; the trailing newline stops a file lacking one from fusing into the next. The marker must use `printf '%s\n'` — written as a format string, `printf '\\echo …'` makes printf emit `<ESC>cho applying …`, which `psql` ignores, silently losing every marker.

To test a feature branch in isolation before merging (separate containers/ports, doesn't touch the `main` stack):

```bash
scripts/test-branch.sh up      # build + start, clone data from main if running
scripts/test-branch.sh down    # tear down
scripts/test-branch.sh status  # "up" (exit 0) or "down" (exit 1) — both containers must be Docker-healthy
                                # for "up" (2026-08: previously just checked they existed via `docker ps`)
```

`/finish-cycle`'s Gate 2 calls `status` automatically to detect a branch environment still running from an earlier `/finish-cycle` attempt on the same branch, and asks to reuse or rebuild it instead of the plain "spin up now?" question.

No bundler, no build step for the **runtime** — nginx serves `js/`/`css/` files exactly as they are on disk, and this must stay true.

A dev-only test toolchain exists for the frontend: root `package.json` + vitest + jsdom, isolated from the runtime (see `js/lib/` below). It is never bundled, never served — `node_modules/`, `package.json`, `package-lock.json`, `vitest.config.js`, and any `*.test.js`/`*.spec.js` file are explicitly denied in `nginx.conf`. Run tests with `npm test` (single run) or `npm run test:watch`. Vitest 4 needs Node ≥ 20.12 (it crashes at startup with `does not provide an export named 'styleText'` on older versions): if the host Node is older, run the suite in a throwaway container instead — no change to `package.json` or the scripts, the host `node_modules` is untouched (the anonymous volume keeps the Linux dependencies off it), and the main Docker stack is not involved:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/app" -v /app/node_modules -w /app node:22 sh -c 'npm ci --no-audit --no-fund >/dev/null 2>&1 && npm test'
```

The backend has its own, separate unit-test toolchain: Node's built-in `node:test` runner (zero new dependency), scoped to `api/src/**/*.test.js` via `api/package.json`'s `"test"` script (`node --test src/**/*.test.js`, run from inside `api/`). This is deliberately kept independent from the frontend's `vitest` config — `vitest.config.js`'s `include` (`js/**/*.test.js`) never picks up `api/` files, and the backend runner never touches `js/`. Files that `require()` Express/DB modules (e.g. `api/src/routes/timesheets.test.js`, which imports `./timesheets`) need `api`'s `node_modules` present — run via `docker exec pdash-api node --test src/...` (the container already has them and volume-mounts `api/src` live) if the host has no `api/node_modules` installed. Pure `api/src/lib/*.test.js` files have no such dependency and run anywhere.

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
| `portfolio.html` | `/portfolio.html` | Project reporting dashboard (portfolio overview + per-project KPI/burndown), Vue 3 (CDN, no build step, same pattern as `admin.html`/`project-config.html`). Full narrative: [docs/pages/portfolio.md](docs/pages/portfolio.md) |
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
HTML pages               — every page is listed in the Pages table above: route, one-line purpose, and — for the
                            pages that have one — a link to its docs/pages/<page>.md narrative. That table is the
                            page index; do not restate per-page detail here. Pages with no docs/pages/ file yet:
                            index.html, login.html, activate.html, reset-password.html, attribute-lists.html
                            (index.html is a 9-line redirect to pipeline.html; config.html is a redirect stub to
                            /master-clients.html and is covered by docs/pages/config.md).
css/                     — six stylesheets: tokens.css (design tokens, also `[v-cloak]`), style.css (components
                            + navigation), admin-crud.css, auth.css, pipeline.css, costgrid.css. Detail:
                            [docs/css/stylesheets.md](docs/css/stylesheets.md). App-wide rules stay in "Design
                            tokens" and "Cache-busting" below.
js/api.js                — Api.* namespace + apiFetch wrapper (401 → login redirect; parsed error body attached
                            as `err.data`). Detail: [docs/js/shared-libs.md](docs/js/shared-libs.md).
js/api-sync.js           — in-memory ↔ API sync layer (cgSyncFromApi, loadConfigFromApi, _pushProjectToApi, etc.). Full narrative: [docs/js/api-sync.md](docs/js/api-sync.md).
js/core.js               — state, in-memory helpers (loadConfig/persistConfig are no-ops), shared badges, esc(), fmtH(), showConfirm()/showInfo() modal idioms, findRate(), formatUploadInconsistencies(). Full narrative: [docs/js/core.md](docs/js/core.md).
js/nav.js                — navigation injection, initNav(): one `<aside class="pd-nav">` (sidebar ≥ 1024px, icon
                            navbar below), the shared modals, the T&C gate, initNotifications(), window.__navUser.
                            Full narrative: [docs/js/nav.md](docs/js/nav.md); the rules that must hold are in
                            "Navigation: sidebar and icon navbar" and "Page shell" below.
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
                            and parsing") and project-rules.js ("Project currency lock").
api/src/routes/          — Express routes (auth, users, config, cost-grids, projects, timesheets,
                            reporting, exports, notifications, pipeline-years, client-groups, pots, reset,
                            app-settings, currencies, attribute-lists, resources, planning, planning-assistant).
                            Per-route detail: docs/api/<name>.md.
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
1. Injects the shared navigation (one `<aside class="pd-nav">`: a left sidebar at ≥ 1024px, a two-row icon navbar below; no footer — see "Navigation: sidebar and icon navbar")
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

Every authenticated page (the 18 that call `initNav`: pipeline, portfolio, planning, costgrid, project-config, team, the five `master-*` pages (Master Data), timesheets, admin, attribute-lists, profile-jobs, settings, `_db-reset`, `_terms-editor`) wraps navigation and content as `<div id="app-shell"><div id="nav-container"></div><div id="app-main">…existing Vue root(s)…</div></div>`, with all `<script>` tags after the shell. It is hand-written in each page, **outside** every Vue mount point (roots and `v-cloak` unchanged). `css/style.css` defines `:root { --sidebar-w: 0px; }` and `#app-main { margin-left: var(--sidebar-w); }` — since Cycle B2 a media query sets `--sidebar-w` (240px open, 68px rail, 0 below 1024px), see "Navigation: sidebar and icon navbar" below. `#app-shell`/`#app-main` must never get `overflow`, `transform`, `filter`, `contain`, `will-change` or `position` (it would break the descendants' `fixed`/`sticky` panels); `js/lib/nav-shell-guard.test.js` pins this, the structure of all 18 pages and the `?v=` agreement of `style.css`/`core.js`/`nav.js`/`notifications.js`. **A new authenticated page must use this wrapper.** Each page's `<head>` carries the same inline, inert snippet that reads `localStorage['PDash_sidebarCollapsed']` (`'1'` = collapsed) and sets `data-sidebar="collapsed"` on `<html>` before first paint; the key is in `core.js`'s `keep` Set. Detail: [docs/js/nav.md](docs/js/nav.md), spec `docs/superpowers/specs/2026-10-02-navigation-b1-page-shell-design.md`.

### Navigation: sidebar and icon navbar (2026-10-02, Navigation Cycle B2)

`js/nav.js` renders **one** `<aside class="pd-nav">` into `#nav-container` (direct children `.pd-nav-brand`, `.pd-nav-items`, `.pd-nav-actions`); CSS turns it into a fixed left sidebar at `min-width: 1024px` (open 240px, icon rail 68px via `html[data-sidebar="collapsed"]`, state in `localStorage['PDash_sidebarCollapsed']`) or a two-row icon-only navbar in normal flow below (56px + 52px + 3px magenta border = `--nav-top-h` 111px, breadcrumb hidden). The footer no longer exists anywhere (also removed from `login`/`activate`/`reset-password`). Rules to keep:
- **One DOM, unique IDs:** never render a second navigation; the 14 element IDs (`#nav-notif-btn`, `#nav-account-btn`, `#nav-profile-btn`, `#nav-settings-btn`, `#nav-send-notif-btn`, `#nav-change-pwd-btn`, `#nav-logout-btn`, `#nav-notif-badge`, …) are consumed by `notifications.js` and the wiring.
- **No jump on load:** `#nav-container` gets its size and navy background from CSS (fixed column / fixed-height bar), and `--sidebar-w` comes from the media query + the B1 head snippet's `data-sidebar`, never from JS.
- **Names:** menu entry = `<title>` = breadcrumb, from the `NAV_MAIN`/`NAV_GROUPS` model in `nav.js`: Pipeline, Portfolio, Planning, Master Data (the five `master-*.html` pages all use menu id `config`, title "Master Data" and breadcrumb Home > Master Data; their own name is their `<h1>` and the active sub-menu entry), Timesheets, User Admin, Team, Attribute Lists, DB Reset, Terms & Conditions (`js/lib/page-names.test.js` pins it). A new menu page must be added to the model and keep the three names equal. Page headings and exported file names are page content and keep their own wording.
- **Groups:** Admin (admin + sysadmin) and Sysadmin (sysadmin) are always-expanded sections ≥ 1024px; below, each is an icon button (`.pd-nav-group-toggle`) toggling a full-width white panel (10px side margins, one open at a time, Esc/outside tap closes — `navWireGroups`).
- **Menus:** the account menu and notification panel stay Bootstrap dropdowns; `navPopperConfig` (a `popperConfig` function evaluated on each open) places them: below the avatar/bell on small screens, right of the sidebar/rail otherwise (no flip). Unread bell = numeric badge + white background with red icon and border (`.pd-bell-btn.has-unread`).
- **Heights:** `.pb-board-root { height: calc(100vh - var(--nav-top-h) - var(--breadcrumb-h)) }` (`--nav-top-h` 0 on large screens, 111px below; `--breadcrumb-h` 32px measured, 0 below 1024px). If the navbar rows, breadcrumb padding or font change, re-measure (board bottom must equal `innerHeight`, no page scroll) and update the pins in `js/lib/nav-layout-guard.test.js`.
- **Stacking:** the sidebar/panels sit at `var(--z-fixed)` (300), below Bootstrap modals (1055); only while a menu or group panel is open (`#nav-container:has(.dropdown-menu.show, .pd-nav-group.open)` and the same on `.pd-nav`) the nav rises to 1050 so page-level fixed panels (e.g. `team.html`'s detail panel, z 1045) cannot clip the open menu.
- **Icons:** inline SVG (`navIcon(name, size)`, `currentColor`, `aria-hidden`), no emoji in navigation, dropdowns, modal titles or the notification banner; tokens `--icon-size-sm/md`.
- **Rail tooltips (2026-10-02, follow-up to B2):** in the collapsed sidebar (`navLayout() === 'rail'`, ≥ 1024px) the sidebar items (including the Admin/Sysadmin entries, which are permanent label-less rows there), the avatar (text = the user's email) and the bell ("Notifications") show a custom tooltip — one `#pd-tooltip` element in `<body>` (`position: fixed`, z-index 1051: above the raised nav, below modals), placed 10px right of the element and centred on it by `navWireTooltips`, because the scrolling `.pd-nav-items` would clip anything drawn inside it. Text comes from `data-tip`; every item also has an `aria-label` (the label span is hidden in the rail). The native `title` is removed in the rail and restored elsewhere by `navApplyTitles()` (called at init, on collapse/expand and on the 1024px query change): the open sidebar and screens < 1024px keep the native title and never show the custom tooltip. The tooltip hides on mouse out, focus out, click, Esc, dropdown open (`show.bs.dropdown`), items scroll, window resize, `navSetCollapsed` and when its anchor leaves the DOM (MutationObserver). Tests: `js/lib/nav-tooltip.test.js`, `#pd-tooltip` guards in `nav-layout-guard.test.js`.
Tests: `js/lib/nav-model.test.js`, `nav-behavior.test.js`, `nav-layout-guard.test.js`, `notifications-ui.test.js`, `page-names.test.js`, plus the updated `nav-shell*.test.js`/`foundations-guard.test.js`. Cache versions (after the rail-tooltip follow-up): `nav.js?v=17`, `style.css?v=21`, `notifications.js?v=3`, `tokens.css?v=9`, `core.js?v=11`. Detail: [docs/js/nav.md](docs/js/nav.md), spec `docs/superpowers/specs/2026-10-02-navigation-b2-sidebar-design.md`, plan `docs/superpowers/plans/2026-10-02-navigation-b2-sidebar.md`.

### Data strategy (in-memory cache)

In-memory module-level variables are the UI cache; the API is the source of truth. **localStorage is not used for server data** — it holds only `PDash_summary` (portfolio summary selection), `PDash_browserNotifDisabled` (2026-09, the browser-notification opt-out — see `js/notifications.js`'s entry), and `PDash_sidebarCollapsed` (2026-10-02, the sidebar open/collapsed state, see "Page shell"), all genuinely client-side. `js/core.js`'s `cleanLegacyStorage()` IIFE wipes any other `PDash*` key on every page load (navigation here is full-page, not SPA, so this runs constantly) — **any new localStorage key must be added to its `keep` Set or it will be silently deleted on the very next navigation**, a real bug caught by code review in the browser-notification cycle (the opt-out flag was originally missing from this list, making "Disable" revert itself on the next page load). `PDash_settings` (the old personal AI keys) is deliberately no longer in the set, so stale browsers have it wiped on their first load (Cycle B, 2026-09-30).

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
- `showCostGridEditorView(cgId, verId, opts)` redirects to `costgrid.html?cgId=...&verId=...` on `pipeline.html` (a page-local override, plain redirect); `opts.focusName` appends `&focus=name` to the URL (2026-10-07, see "New Proposal / Clone" below). On `costgrid.html` itself, `js/costgrid.js`'s own `showCostGridEditorView` is instead a thin bridge delegating into the page's mounted Vue instance (`_cgVueApp.openVersion(cgId, versionId)`) — no longer a single-page-app DOM-render function.
- On `costgrid.html` cold load: call `cgSyncFromApi()` before reading URL params to avoid empty `_cgStore`

### Version tab switching (editor)

As of the 2026-10-07 redesign cycle, the former `.page-title-bar`/`.page-toolbar`/version-tabs row is one `.cg-header` card (`costgrid.html`): row 1 is the proposal name, client/linked-project subtitle and stage pill; row 2 is the `.cg-version-seg` segmented control (a "+ New version" segment, `v-if="isDraft"`, then one segment per version, the active one navy-filled) on the left and Save/Clone/Export XLS/Share plus exactly one primary action (Publish to SIP / Generate project / "Selecting tasks…" / "All tasks are in projects") on the right.

`costgrid.html`'s Vue instance handles version-tab clicks directly via `switchVersion(verId)` (a Vue method, `@click` on each segment), which calls `cgAutoSave()` then `await this.openVersion(this.cgId, verId)` — `openVersion()` itself awaits `cgLoadStructureFromApi(cgId, verId)` before assigning `_cgDraft`/`this.draft`, ensuring the structure is fetched before rendering. `js/costgrid.js`'s `renderCgVersionTabs(cg)` (called by other, unchanged global functions like `cgPublishDraft`) is now just a bridge that reassigns `_cgVueApp.cg` — it no longer owns the tab click-handling itself.

**"+ New version" has no name-prompt modal.** `#cgNewVersionModal`/`openNewVersionModal`/`cgCreateNewVersion`'s modal path were removed. Clicking the segment calls `createNewVersionDirect` (Vue) → `js/costgrid.js`'s `cgCreateNewVersionDirect()`, which creates the version immediately with a default label (`'v' + (cg.versions.length + 1)`), flushes the editor (`cgAutoSave(true)`) before the atomic server-side copy (header/phases/tasks/roles/rates/tags) exactly as the old `cgCreateNewVersion` did, then selects the new tab via `switchVersion(serverId)`. The new segment's label is editable inline — the same click-to-edit affordance already used for `phase.phaseName`: clicking the small pencil icon next to the active segment (`startEditingVersionLabel()`) swaps the label for a text input bound to `draft.versionLabel`, committed on blur/Enter (`commitVersionLabelEdit`) or reverted on Esc (`cancelVersionLabelEdit`), both scheduling an autosave. "+ New version" stays Draft-only (`v-if="isDraft"`) — versions can still only be created/deleted while the proposal is a Draft.

### New Proposal / Clone (no modal, 2026-10-07)

`cgCreateNewGrid()` and `cgCloneGrid(srcCgId, srcVerId)` (`js/costgrid.js`) no longer go through a name-prompt modal (`#cgNewGridModal`/`#cgCloneModal`, removed from both `pipeline.html` and `costgrid.html`, along with `_pbCloneSource`) — both act at once and open the editor on the result:

- **New Proposal**: creates a Draft `v1` named `'New proposal'`, then calls `showCostGridEditorView(cgId, verId, { focusName: true })`. On `pipeline.html` that appends `&focus=name`; `costgrid.html`'s cold-load `created()` hook, after `openVersion()`, focuses and selects `#cgProjectName` (skipped if `isLocked`) via `this.$nextTick`, then strips `focus` from the URL with `history.replaceState` so a reload doesn't repeat it.
- **Clone**: entry points call `cgCloneGrid(cgId, verId)` directly (card action, panel header, and `costgrid.html`'s own Clone button) — no shared source variable needed. If the source is the version currently open in the editor, `cgAutoSave(true)` is awaited first (after clearing `_cgAutoSaveTimer`) so the clone carries the latest unsaved edits, not a stale snapshot. The new proposal is named `"{source name} — Copy"`. The client id sent to the API goes through `cgApiClientId()` (`js/lib/costgrid-calc.js`) — the frontend's "Unassigned" sentinel (`'__unassigned__'`, see `js/clients.js`) is not a valid UUID and previously caused `Clone failed: invalid input syntax for type uuid: "__unassigned__"` when the source had no client; `cgApiClientId` returns the id unchanged only when it matches the UUID shape, else `null` (same regex as `js/api-sync.js`'s existing project-save sanitization).
- A module-level in-flight flag in each function (`_cgCreateInFlight`/`_cgCloneInFlight`) replaces the old disabled-button guard against a fast repeat click; the page-level `proposalBusy` (Vue data on both pages) disables the New Proposal/Clone controls for the same window.
- Errors surface via `showInfo('Could not create/clone the proposal: ' + e.message, 'Error')` instead of inline modal text.

Clone flow otherwise unchanged:
1. Creates a new cost grid + version via API; new version label is always `'v1'` regardless of the source label
2. Copies phase/task/role structure from the source version via `cgLoadStructureFromApi` + `saveStructure` — the copied `phases` array is passed through `stripCloneTaskIds()` (`js/lib/costgrid-calc.js`) first, removing every `taskId`/`phaseId` so the backend mints fresh UUIDs instead of reusing the source version's (still-existing) ones, which previously caused `duplicate key value violates unique constraint "tasks_pkey"`
3. On `costgrid.html`: updates URL to the new `cgId`/`verId` via `history.replaceState` (prevents stale URL state loops)
4. Redirects to the new grid in the editor, re-fetching the server-assigned structure via `cgLoadStructureFromApi` (the in-memory seed used only `phases: []` since the real IDs aren't known client-side until the server assigns them)
5. Not copied, by design: the exchange-rate snapshot (the new version takes the live rate) and tags

**API version rule (2026-10-07):** `POST /api/cost-grids/:id/versions` and `POST /:id/versions/:vId/duplicate` refuse (`400 { error, code: 'VERSION_RULE' }`) to create a version on a proposal that already has a non-Draft version — closing the gap left by the UI-only enforcement (`+ New version` only on a Draft, Publish deletes the other Drafts) against a direct API call. A sysadmin (live role) is exempt. Rule: `versionCreationError({ role, hasPublishedVersion })` in `api/src/lib/project-rules.js`, same pattern as the project-currency-lock rules in that file (`VERSION_RULE_CODE`, distinct from their `RULE_CODE`/`PROJECT_RULE`).

### Pipeline board layout (height math)

Chrome (since Nav B2, 2026-10-02): no footer. At ≥ 1024px the navigation is a fixed left sidebar, so the only chrome above the board is the breadcrumb bar (`--breadcrumb-h`, 32px measured). Below 1024px the icon navbar is in flow with a fixed height (`--nav-top-h` 111px = 56 + 52 rows + 3px border) and the breadcrumb is hidden.

`#pipelineBoardSection.pb-board-root { height: calc(100vh - var(--nav-top-h) - var(--breadcrumb-h)); display:flex; flex-direction:column; overflow:hidden }` (`css/style.css`; `--nav-top-h` is 0px on large screens). Must be kept in sync if the navbar rows or the breadcrumb height change: re-measure in a browser (board bottom == `innerHeight`, page scroll 0 in the three layouts — sidebar open, rail, small navbar). Before B2 this was `calc(100vh - 206px)` (106px navbar + 100px footer). **Corrected 2026-09** — this section previously documented a `#pbColumnsContainer { height: calc(100% - 61px) }` rule; that id and hardcoded calc no longer exist in the current markup (confirmed via code review during the pipeline-filters cycle). The columns row is instead a flex child with `flex:1; min-height:0`, sized automatically by `.pb-board-root`'s `flex-direction:column` layout — any `flex-shrink:0` sibling row added above it (the title bar, and the 2026-09 filter bar) is absorbed automatically without needing a matching pixel adjustment anywhere, unlike a hardcoded `calc()` would require.

**Board redesign (2026-10-06, cycle 1 of 2):** inside `.pb-board-root` the rows are the header (`.pb-header`), the toolbar (`.pb-toolbar`), on smartphone the stage tabs and stage summary, then the `.pb-main` row (`flex:1; min-height:0; display:flex`, since cycle 2) holding the board `.pb-board` (`flex:1 1 auto; min-width:0`, columns `.pb-col`, collapsible) and, when open, the detail panel beside it or over it (see "Detail panel"). There is no footer row any more: column totals live in the column header. Page styles are in `css/pipeline.css` (linked only by `pipeline.html`, tokens only). Below 768px only the column of the selected stage tab (`mobileStage`/`activeMobileStage`) is visible, full width, ignoring the collapsed state.

**Critical**: do NOT add `h-100` to the columns row. Bootstrap's `.h-100` applies `height:100%!important`, which would override the flex sizing and can hide the column below `overflow:hidden`.

### Filter bar (2026-09)

*(Layout described in this paragraph — a background-tinted `flex-shrink:0` row — was replaced by the 2026-10-06 redesign paragraph below; the filter contents and behaviour still apply.)* A row between the title bar and the columns row holding (in this fixed order): a free-text search input, then four Bootstrap dropdown-with-checkboxes — Owner, Client, Currency, Value — each `data-bs-auto-close="outside"` so multi-selecting doesn't close the menu after every click, and each trigger showing a badge with its own active-selection count. The Value dropdown also holds an "Include PTC in value" checkbox below a divider. A neutral "Clear filters" text link appears only once at least one filter is active (`filtersActive` computed).

Filtering is entirely client-side over data already loaded by `cgSyncFromApi()` — no new API calls, and no change to which proposals are visible under the existing owner/shared/admin-all permission model (filters only narrow that already-scoped set). Multi-select values within one filter combine with OR; the five filter categories (search, Owner, Client, Currency, Value) combine with AND. Filters reset on every page load — no persistence in the URL or storage — and apply only to the currently selected pipeline year.

The **Draft column is never filtered** — `stagesData`'s per-card filter check (`js/nav`... see below) explicitly skips `pbCardMatchesFilters` for `stage === 'Draft'`, and the `filterableCards` computed that derives the Owner/Client/Currency option lists also excludes Draft — so a Draft-only owner/client never appears as a selectable option with zero possible matches. Since column card-count badges and header totals already derive from each column's own (now filtered) `cards` array, they update automatically with no separate recompute step.

**Redesign (2026-10-06):** the bar is now `.pb-toolbar` in `pipeline.html`: a search box with a suggestions menu (live filter as before; the menu is a shortcut — a client row sets `filterClientIds`, a proposal row opens the detail panel, "N more results — refine your search"; `pbSearchSuggestions`/`pbHighlight` in `pipeline-calc.js`), the four dropdowns rendered from the `filterGroups` computed (id prefix `flt-bar-`), "Clear filters" and the Amounts segmented control (`.pb-seg`). Below 768px the dropdowns and Amounts are hidden and a "Filters" button opens the bottom sheet `#pbFiltersSheet` (Bootstrap `offcanvas-bottom`): Amounts control, the same four groups in a 2×2 grid (id prefix `flt-sheet-`, same `filter*` state), "Show results". Draft stays unfiltered.

Filter matching logic lives in `js/lib/pipeline-calc.js` (pure, vitest-covered) — see [docs/js/lib.md](docs/js/lib.md) for `pbPriceBucketKey`/`pbCardMatchesFilters`. Stage/pipeline-column filtering and a board-vs-scrolling-list view toggle were both explicitly discussed and deferred to a future cycle, not implemented here.

### Detail panel

`#pbDetailPanel` (redesigned 2026-10-06, cycle 2 of 2), Vue-rendered (`v-if="selectedCgId"`), 480px wide, lives in the `.pb-main` row beside `.pb-board`. Three container modes (all in `css/pipeline.css`, tokens only): **side by side** (the board shrinks beside the panel, no scrim) at viewport >= 1280px, or >= 1108px when the sidebar is collapsed (`html[data-sidebar="collapsed"]`); **overlay** (panel over the board with `.pb-panel-scrim`) from 768px up to those thresholds; **full screen** (`position: fixed; inset: 0`, no scrim) below 768px. Content (top to bottom):
- While the structure is loading (`detailLoading`): a centred spinner. If `selectedCg`/`selectedVersion` fail to resolve: "Could not load cost grid. Try reloading the page."
- **Header** (`.pb-panel-head`): stage pill + "Linked project" pill, "Version" segmented control (clickable, `openDetailPanel(cgId, verId)`), close; client, title, `Owner <name> · Created on <date>`; actions Edit / Clone (hidden for `myPermission === 'viewer'`), Share (hidden on Draft), Delete (Draft and non-viewer only, `deleteSelectedVersion()`). Clone opens `#cgCloneModal` via `openCloneModal`.
- **Tabs** (`detailTab`, reset to `overview` whenever another card/version is opened): Overview (fee/PTC/total boxes with "≈ €" equivalent for a foreign currency, Period as "May 2026" via `pbFmtMonth`, Currency + "1 € = x" + "Refresh rate" for stale rates, note, "SHARED WITH" `<share-list>`), Tasks (phases, TASK/PERIOD/HOURS/AMOUNT), Linked projects (cards with stage and status pills, "Project Dashboard →"), POT.
- **POT tab**: `loadPotSection(v, stage)` sets `potState = { kind, targetName?, year?, view? }` with `kind` one of `loading | draft | noClient | noTarget | error | ok`; `view` is `pbPotView(summary)` (`js/lib/pipeline-calc.js`): percentage of target reached by Committed + Anticipated, a stacked bar (Committed, Anticipated, Expected, SIP striped) with a notch at the target, legend, 2x2 boxes (Committed, Anticipated, Total C+A, "GAP TO TARGET" or green "OVER TARGET"), "CONTRIBUTING PROPOSALS" and "OTHER PROPOSALS · NOT IN TOTAL" lists (rows not clickable). `GET /api/pots/summary` now also returns `expected_total`, `sip_total` and, per proposal, `client_name` and `value` (EUR fee, a number; `pbPotView` tolerates strings).
- **Closing rules:** Esc (document `keydown`, capture phase) closes the search/year menus first, then the panel, and is ignored while a Bootstrap `.modal.show` or offcanvas is open (Esc there closes only the modal). `mousedown` outside `#pbDetailPanel` closes it (200ms delayed registration) but ignores `.modal`/`.modal-backdrop` (Share/Clone/Confirm live outside the panel), `.pb-card` and the search suggestions menu (those switch the content without a close/reopen flash); a click on the scrim closes it.
- Smartphone (< 768px): title 17px, version segments and actions wrap, the tab row scrolls horizontally, touch targets >= 44px.
- Cache versions: `css/pipeline.css?v=2`, `js/lib/pipeline-calc.js?v=6`.

### Column header totals (2026-10-06; replaces the former column footer)

The totals footer was removed. Each column header (`stagesData[].header`, from `pbColumnHeader` in `js/lib/pipeline-calc.js`) shows the offer count, the **fees** total (bold; `≈` prefix when converted), a muted PTC line when `ptc > 0`, and, in "Original currency" mode, one currency pill per currency present when the column contains any non-EUR card. The "Amounts" toggle (`currencyMode`: `original` | `eur`, "Original currency" / "All in EUR", not persisted) switches cards and headers; in EUR mode cards show the converted amount plus "from {original}". A `currencyRate` of 0/null/missing counts as 1. Currency symbol is included in the value string via `formatMoney(n, cur, currencies)` — do NOT add a standalone currency `<span>`. The header "OPEN PIPELINE" total (`pbOpenPipelineTotal`) is SIP + Expected + Anticipated (Draft, Committed and Canceled excluded), follows the filters and ignores the Amounts toggle. Columns are collapsible (`collapsedStages`, `toggleStage`): empty columns start collapsed, creating/cloning a proposal expands Draft.

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
- Known open items (a planned follow-up cycle, "project currency change control"): a project's `currency` is independent of its proposal's, project-config has no exchange-rate handling, and program-level totals in `portfolio.html` sum amounts of different currencies without conversion. The one-line wrappers (`fmtMoney`, `cgFmtCurrency`, `pbFmtMoney`, the `config.html` copies) and the `currentCfg` global were removed (2026-10, money wrapper cleanup): call sites call `formatMoney(amount, code, currencies)` from `js/lib/money.js` directly, with the currency explicit (Vue pages expose `formatMoney` and `currencies` on the instance; `portfolio.html` uses a `dashCurrency` computed, its pinned summary uses EUR). Current cache versions: `js/lib/money.js?v=2`, `js/core.js?v=11`, `js/costgrid.js?v=39`, `js/lib/pipeline-calc.js?v=5`, `js/portfolio.js?v=2` (`planning.html`).

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
| `027_project_descriptions.sql` | Profile descriptions cycle (2026-09-29): `projects.description` and `project_tasks.description` (`TEXT NOT NULL DEFAULT ''`), plus a one-shot backfill from the linked proposal (version note; task descriptions by normalised name). **The backfill is apply-once** (fills only empty fields, but must not be re-run casually). Must be applied by hand to the real `pdash-db` and to any `test-branch.sh` stack (`up` skips migrations on an existing schema). See [docs/api/profile-engine.md](docs/api/profile-engine.md) |
| `028_topics.sql` | Profile descriptions cycle (2026-09-29): `topics` (shared competence vocabulary, status approved/proposed/rejected, `merged_into`, no physical delete), `description_topic_state` (text hashes/errors) and `description_topic_links`, and the `app_settings` default `topic_extraction_enabled=true`. Idempotent; same by-hand caveat as `027`. Requires `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`) in the server `.env` for extraction to run (unset = skipped silently). See [docs/api/topics.md](docs/api/topics.md) |

Run migrations with:
```powershell
docker exec -i pdash-db psql -U pdash -d pdash < api/src/db/migrations/004_add_notifications.sql
```

### Language constraint

All user-facing text, alerts, labels, and instructions **must be in English**.
