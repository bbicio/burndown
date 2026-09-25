# api/src/routes/resources.js — and actuals-owner-name matching (Cycle 3b)

`api/src/routes/resources.js` backs `team.html`. Every route is `requireAuth, requireAdmin` (admin **or** sysadmin) via a router-level guard. Full endpoint table: `ARCHITECTURE.md` §7.

## Resource registry CRUD (Cycle 1, 2026-09-23)

`GET/POST /`, `PATCH/DELETE /:id`. Unlike `attribute-lists.js`, supports a genuine hard `DELETE` since nothing referenced a resource row at the time (aliases now cascade-delete with it, see below). `job_title` is free text, not an FK to `roles`, validated non-empty on both `POST` and `PATCH`. **Known defect, scheduled for a separate cycle:** `team.html` stores `roles.label` there, but the role strings in uploaded actuals are `roles.code` (verified against real data: 9 of 12 distinct actual roles equal a `roles.code`, 0 equal a `roles.label`); the planned fix makes it `resources.role_id → roles.id`.

## Actuals owner-name matching (Cycle 3b, 2026-09-25)

Purpose: link the free-text `owner` in uploaded actuals to a `resources` row, as the first step toward a per-resource experience profile (spec: `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §4; plan: `docs/superpowers/plans/2026-09-25-resource-matching-aliases.md`).

- **Rules** live in `api/src/lib/match-resource.js` (pure, `node:test`-covered) — see `docs/api/lib.md`. Exact match on an order-insensitive normalized name; an explicit alias beats a name match; ambiguous names (several active namesakes) are never auto-matched; inactive resources are excluded from automatic matching, but an alias may point at one; no fuzzy matching.
- **DB half:** `api/src/services/resource-matching.js` — `refreshUnmatched(codes | null)` rebuilds `profile_unmatched` for the given project codes, or for all codes (also clearing stale rows) when `null`. Owner hours are aggregated **in SQL** per (project, owner-as-written), so Node only sees distinct names; the whole read/delete/insert runs in one transaction under `pg_advisory_xact_lock(hashtext('profile_unmatched'))` so overlapping refreshes serialize.
- **Triggers:** `POST /api/timesheets/upload` refreshes only the uploaded codes, best-effort (a failure is logged and never fails the upload); `DELETE /api/timesheets/:projectCode` deletes that code's queue rows; resource create / rename / status change / delete and any alias add/remove run a best-effort **full** rescan; `POST /unmatched/rescan` runs one on demand (needed the first time, for actuals uploaded before this feature existed).
- **Aliases:** `POST /aliases` upserts on the normalized key (`xmax = 0` distinguishes insert → 201 from re-assignment → 200); `created_by` is kept, `updated_by`/`updated_at` record the re-assignment; `display_name` keeps the name as typed. `resource_id NULL` (`ignore: true`) marks a name that is not a person (e.g. "TBD"). A resource `DELETE` cascades its aliases, and the following rescan re-queues those names.
- **Why `project_code`, not project id:** `timesheets` is keyed by `project_code` and `projects.code` has no uniqueness constraint, so an id cannot be resolved reliably from an upload.
- **Sub-cycle 3c** will replace the inline full rescans with a queued background recalculation.
