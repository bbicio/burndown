# Clients vs Programs — CRUD Consistency Audit

**Date:** 2026-07-09
**Scope:** verification-only. `js/clients.js` full file, compared against `js/programs.js` as ground truth for shared patterns — but ground truth verified in each case, not assumed correct by default. Perimeter extended downstream to every consumer of `clientId`/`programId`: `js/portfolio.js`, `js/pipeline-board.js`, `js/config-form.js`, `js/costgrid.js`, `js/ratecards.js`, plus the server side (`api/src/routes/config.js`, `api/src/routes/reset.js`) and the DB schema (`api/src/db/migrations/001_initial.sql`). Finding criterion: behavioral divergence between the two twin CRUD modules, starting from two candidates already surfaced informally (missing delete-warning on clients, `getClients`/`getPrograms` return-shape asymmetry) but open to a third if the deeper trace surfaced one. No known accepted-design exclusions were named; checked git history instead of assuming intentionality. No code was modified.

## Method

Read `js/clients.js` and `js/programs.js` in full. Read the server-side delete routes (`api/src/routes/config.js:45-57,162-174`) to establish what actually happens on deletion, rather than trusting the frontend warning text. Read the DB schema's FK definitions for `projects.client_id`/`projects.program_id` (`001_initial.sql:52,116-117`) to check what the *database* is configured to do on a parent delete. Checked `api/src/routes/reset.js` for any other deletion path that might bypass the per-record guard. Traced downstream consumers of `clientId`/`programId` (`js/portfolio.js:365-403`, `js/pipeline-board.js:260,356-362,672-684`) to see how a project with no client/program is actually rendered. Used `git blame`/`git log -S` on the relevant lines to establish whether the divergences were a deliberate, dated decision or an unreconciled original gap.

## Findings

### F1 — `deleteProgram`'s pre-delete warning describes a consequence that cannot actually occur
- **Type:** INCORRECT (misleading UI text)
- **Severity:** Important
- **Location:** `js/programs.js:109-110` vs `api/src/routes/config.js:162-174`
- **Evidence:**
  ```js
  // js/programs.js:109-110
  const childCount = (config.projects || []).filter(p => p.programId === id).length;
  const warn = childCount > 0 ? `\n\n⚠️ ${childCount} linked project${childCount===1?'':'s'} will lose the program reference.` : '';
  ```
  ```js
  // api/src/routes/config.js:162-174 — the actual DELETE /programs/:id handler
  router.delete('/programs/:id', requireAdmin, async (req, res, next) => {
    const linked = await query('SELECT COUNT(*) FROM projects WHERE program_id = $1', [req.params.id]);
    if (parseInt(linked.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete program with linked projects' });
    }
    await query('DELETE FROM programs WHERE id = $1', [req.params.id]);
    ...
  ```
- **Description / root cause:** the warning tells the user that confirming the delete will cause linked projects to "lose the program reference" — implying the deletion proceeds and the projects' `programId` becomes orphaned/cleared. That is not what happens: the server unconditionally rejects the delete with HTTP 400 whenever `childCount > 0`, before any row is touched. No project ever loses its reference through this path; the user instead sees a second, generic failure alert (`js/programs.js:120`, `'Delete failed: ' + err.message`) *after* already clicking "confirm" on a warning that was never accurate.
  Root cause, established via `git blame`: the frontend warning (`js/programs.js:106-124`) was written in commit `c81be3a` (2026-06-08), matching the DB schema's `ON DELETE SET NULL` on `projects.program_id` (`001_initial.sql:116`) — at that point, "will lose the reference" was the correct, intended behavior. The server-side hard-block guard was added the *next day*, commit `68d25f5` (2026-06-09, `api/src/routes/config.js:162-169`), overriding that intended cascade with an application-level rejection — and the frontend warning text was never revisited to match.

### F2 — `deleteClient` has no pre-delete indicator at all, unlike `deleteProgram`'s (even inaccurate) one
- **Type:** INCONSISTENT (UX)
- **Severity:** Medium
- **Location:** `js/clients.js:109-125` vs `js/programs.js:106-124`
- **Evidence:**
  ```js
  // js/clients.js:109-113 — no childCount computation, no warning
  function deleteClient(id) {
    const client = _clients.find(c => c.id === id);
    if (!client) return;
    showConfirm(`Delete client "${client.name}"?`, async () => { ... }, null, '🗑 Delete client');
  ```
  The equivalent server-side guard exists for clients too (`api/src/routes/config.js:45-57`, same `Cannot delete client with linked projects` 400 response), so both entities are equally protected from actual data loss — the divergence is purely about when the user finds out.
- **Description / root cause:** with `deleteProgram`, a user with linked projects sees *some* signal before confirming (even though F1 shows its wording is wrong); with `deleteClient`, there is none — the user clicks delete, confirms a plain "Delete client X?" dialog, and only then hits the same server-side block, surfaced as a raw `alert('Delete failed: ...')` (`js/clients.js:121`). Checked via `git blame`/`git log -S "linked project"` (only one hit, `js/programs.js`, commit `c81be3a`) whether this was a deliberate, documented choice to treat clients differently — it was not: both files share an identical commit history (`c81be3a` → `a98dfbf` → `519a8b0` → `98bfd01`), and `deleteClient` never received an equivalent check in any of them. This is an unreconciled original gap, not an accepted design decision.
- **Correct fix direction (not applied, per Step 4):** rather than porting F1's inaccurate wording to `clients.js`, a corrected version of the warning should reflect what actually happens today — that the delete will be *blocked*, not that references will be lost — in both files.

### F3 — Three-way inconsistency between the DB schema's cascade, the per-record delete route, and the bulk-reset route
- **Type:** INCONSISTENT (architectural)
- **Severity:** Important
- **Location:** `api/src/db/migrations/001_initial.sql:52,116-117` (schema) vs `api/src/routes/config.js:45-57,162-174` (per-record delete) vs `api/src/routes/reset.js:27,37` (bulk reset)
- **Evidence:**
  ```sql
  -- 001_initial.sql:116-117
  program_id    VARCHAR(100) REFERENCES programs(id) ON DELETE SET NULL,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  ```
  ```js
  // api/src/routes/reset.js:27,37 — bulk reset, no linked-project check at all
  DELETE FROM programs;
  ...
  DELETE FROM clients;
  ```
- **Description / root cause:** the schema is configured so deleting a client/program safely nulls out any referencing project's `client_id`/`program_id` — and this is exactly what happens through the admin bulk-reset flow (`reset.js`), which issues a raw `DELETE` with no guard and relies entirely on the FK cascade. But the per-record delete routes used by the Clients/Programs admin modals (`config.js:45-57,162-174`, F1/F2's subject) add an application-level count check that blocks the same operation entirely, so the schema's `SET NULL` cascade is live and exercised on one deletion path in the app and dead code on the other. Two different ways to delete the same kind of row in the same application currently have materially different safety behavior for linked projects — full block via the admin modal, silent-safe-null via bulk reset — with no documented reason for the difference.

### F4 — `getClients()`/`getPrograms()` return-shape asymmetry (re-verified: downstream-harmless, but still an undocumented contract divergence)
- **Type:** INCONSISTENT (module API contract)
- **Severity:** Minor (downgraded from initial framing after verification)
- **Location:** `js/clients.js:23-25` vs `js/programs.js:23-25`; downstream at `js/portfolio.js:380-386`, `js/clients.js:27-31`
- **Evidence:**
  ```js
  // js/clients.js:23-25
  function getClients() { return [UNASSIGNED_CLIENT, ..._clients]; }
  ```
  ```js
  // js/programs.js:23-25
  function getPrograms() { return _programs; }
  ```
  Downstream, `js/portfolio.js:380-386` handles a project with no (or a nonexistent) program via an explicit `ungrouped` array built at render time: `if (cfg.programId && programs.find(p => p.id === cfg.programId)) { ...grouped... } else { ungrouped.push(cfg); }`. `js/clients.js:27-31`'s `getClientName()` handles the equivalent "no client" case via the `UNASSIGNED_CLIENT` sentinel baked into `getClients()`'s return value itself.
- **Description / root cause:** this was flagged for deeper verification rather than being taken at face value as a bug. Confirmed: both representations produce correct, equivalent end-user behavior — no project is ever dropped from a view or mislabeled because of this difference, since `portfolio.js` independently re-implements the "no assignment" case for programs rather than relying on `getPrograms()` to provide it. The two functions simply model the same concept ("this project has no X") through different mechanisms — a real object in the returned list (clients) vs. a caller-side partition (programs) — with no current behavioral consequence. Kept as a Minor finding because it is still an inconsistent, undocumented contract between two functions with identical names/roles in twin modules: a future caller of `getPrograms()` that doesn't independently implement the `ungrouped` pattern (as `portfolio.js` does today) would not get the same "no program" handling for free that a caller of `getClients()` does.

## Ruled out (checked, no divergence found)

- **Orphaned-but-truthy `clientId`/`programId` in `config.projects`:** hypothesized as a risk given F3's bulk-reset path, but ruled out — Postgres enforces the FK constraint at all times; `ON DELETE SET NULL` means a deleted parent's children get their FK column set to `NULL` atomically, not left pointing at a now-missing row. A "stale but non-null" reference is structurally impossible under the current schema, regardless of which deletion path is used.
- **`js/portfolio.js`'s ungrouped-project display for a program-less project:** produces a correct result (project appears in the page, just outside any program group) — verified via the code path in F4's evidence, not just assumed.
- **`saveClientFromModal`/`saveProgramFromModal` duplicate-checks** (name-based for clients, ID-based for programs): traced to a real structural difference — programs have a user-entered `id` field that clients don't (`js/programs.js:73,78,80` vs. server-generated client IDs, `js/clients.js:97-98`) — checking the field the user actually controls for uniqueness is correct in both cases, not a divergence.
- **`js/costgrid.js`, `js/ratecards.js`, `js/config-form.js` consumption of `clientId`** (found in initial grep sweep): all read `clientId` for display/lookup purposes only (rate overrides, dropdowns), none write or delete it independently of the paths already covered by F1-F3.

## Out of scope / roadmap notes

- **`requireAdmin`-only delete/create for both clients and programs** (`api/src/routes/config.js:18,32,45,68,83,162`): noted while reading the routes, consistent between the two entities, not a divergence — left unexamined as a permissions-design question, not this audit's concern.
- **The bulk-reset flow's own UX** (whether admins are warned before `DELETE FROM programs`/`DELETE FROM clients` fires) — `api/src/routes/reset.js` was read only far enough to confirm the lack of a per-record guard for F3; its own confirmation/warning flow (likely in `_db-reset.html`) was not audited.

---

## Synthesis

F1 and F3 share one root cause, dated precisely via git history: the frontend warning (2026-06-08) was written to match the schema's original `ON DELETE SET NULL` design, and the server-side hard-block guard (2026-06-09) silently superseded that design one day later without the frontend text — or the schema's now-partially-dead cascade — being reconciled. F2 is a smaller instance of the same unreconciled-original-gap pattern (confirmed via identical commit history for both files, not a deliberate omission). F4 was re-verified rather than taken at face value, per the explicit instruction not to assume the more cautious-looking module is automatically the correct reference — it turned out to be a harmless but real contract asymmetry, downgraded accordingly.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
