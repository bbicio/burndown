# Resource Matching & Aliases (Cycle 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link the free-text owner names in uploaded actuals to `resources`, and give admins a queue ("Unmatched names") to resolve the names that cannot be matched automatically.

**Architecture:** A pure module (`api/src/lib/match-resource.js`) normalizes names (order-insensitive token set) and resolves them against aliases and active resources. A DB service (`api/src/services/resource-matching.js`) recomputes the `profile_unmatched` queue table for a set of project codes; the timesheet upload calls it for the uploaded codes, and admin actions (create/rename/deactivate/delete a resource, add/remove an alias, "Rescan") trigger a full rescan. `team.html` gets an "Unmatched names" panel. No scheduler yet — that is 3c.

**Tech Stack:** Node.js/Express, PostgreSQL 16, `node:test` for the pure module, Vue 3 (CDN, no build), integration tests in `test-api.js` via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §4 (sub-cycle 3b). Task 2 amends §4/§5 where reading the code showed the spec was wrong (see "Spec corrections").

## Global Constraints

- No bundler/build step; runtime files served as-is. All user-facing text in English.
- Migration numbered after `023` → `024_resource_aliases_unmatched.sql`.
- `?v=N` rule: this plan modifies **no** `js/*.js`, `js/lib/*.js` or `css/*.css` file — `team.html` calls the API with direct `fetch()` (its established style; `js/api.js` has no resources wrapper) — so **no `?v=N` bump is needed**. Re-verify with `git diff --name-only main -- js css` before merging.
- Permissions: the new `resources.js` routes inherit the router-level `requireAuth, requireAdmin` (admin **or** sysadmin). The upload path calls the service directly, with no auth involvement.
- The match is exact on the normalized name only — **no fuzzy matching**. An ambiguous name (more than one active resource with the same normalized name) is never auto-matched.
- Refresh failures must never fail a timesheet upload (best-effort, logged).
- Never run `docker compose` against the main stack (see `CLAUDE.md` "Infrastructure safety"); verify with `scripts/run-tests.sh` / `scripts/test-branch.sh`. In a worktree, copy the gitignored `.env` in first; run repo scripts with Git Bash (`& "C:\Program Files\Git\bin\bash.exe" scripts/...`), not the WSL `bash` PowerShell resolves to.

## Spec corrections (decided while planning, applied in Task 2)

1. **`profile_unmatched` is keyed by `project_code`, not `project_id`.** `timesheets` is keyed by `project_code` (`001_initial.sql:163`), and `projects.code` has no uniqueness constraint, so a project id cannot be resolved reliably from an upload.
2. **No `js/api.js` wrapper.** `team.html` uses direct `fetch()` for `/api/resources`; the new panel follows that style. Nothing versioned changes.
3. **Rescan strategy.** Upload → refresh only the uploaded codes. Any admin change (resource create/rename/status/delete, alias add/remove) and the "Rescan" button → **full** rescan of every timesheet code (a few dozen projects; simple and always consistent). The spec's "re-run only the projects containing that name" is dropped.
4. **`GET /api/resources/aliases` is added** (the panel needs it to let an admin undo an assignment); the DB-bound logic lives in `api/src/services/resource-matching.js`.

## Review Focus

- **Order/case/accent/punctuation variants auto-match.** "ROSSI,  mario", "Mario Rossi", "José Álvarez"/"jose alvarez" must resolve to the same resource. Pinned by unit tests in Task 1 and MA-05 in Task 3.
- **Ambiguous names are never auto-matched.** Two active resources with the same normalized name → the name stays in the queue with both as candidates. Pinned by a Task 1 unit test.
- **Inactive resources.** An inactive resource is excluded from auto-matching, but an explicit alias to it still resolves (so a leaver's history isn't lost). Pinned by Task 1 unit tests and MA-09 in Task 3.
- **Empty owner cells never enter the queue.** A row with a blank/missing `owner` is not a person to assign. Pinned by a Task 1 unit test and an empty-owner row in the MA integration upload.
- **Adding the same alias twice must not 500.** The second `POST /aliases` for the same normalized name updates the row. Pinned by MA-03.
- **Deleting a resource returns its names to the queue** (aliases cascade-delete, then the full rescan re-queues them). Pinned by MA-10.

---

### Task 1: Pure matching module

**Files:**
- Create: `api/src/lib/match-resource.js`
- Test: `api/src/lib/match-resource.test.js`

**Interfaces:**
- Produces (all pure, CommonJS, exported from `match-resource.js`):
  - `normalizeName(input: any): string` — lowercase, accents stripped, non-letter/digit runs → single space, tokens **sorted** and joined by a space; `''` if nothing remains.
  - `buildMatchContext(resources, aliases): { aliasByKey: Map<string, string|null>, activeByKey: Map<string, string[]> }` — `resources: [{ id, first_name, last_name, status }]`, `aliases: [{ alias_normalized, resource_id }]` (`resource_id` null = ignored name). `activeByKey` only indexes `status === 'active'` resources, keyed by `normalizeName(first_name + ' ' + last_name)`.
  - `matchOwner(name, ctx): { kind: 'empty' } | { kind: 'ignored' } | { kind: 'alias'|'matched', resourceId: string } | { kind: 'ambiguous'|'unmatched', candidates: string[] }`.
  - `aggregateUnmatched(rowsByCode, ctx): Array<{ projectCode, nameNormalized, displayName, hours, candidateResourceIds }>` — `rowsByCode: { [projectCode]: [{ owner, hours }] }`; sums `hours` per (code, normalized name) for names whose `kind` is `unmatched` or `ambiguous`; `displayName` is the first owner string seen; sorted by `projectCode` then `nameNormalized`; non-numeric `hours` count as 0.

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, buildMatchContext, matchOwner, aggregateUnmatched } = require('./match-resource');

const R = (id, first, last, status = 'active') => ({ id, first_name: first, last_name: last, status });

test('normalizeName: order-insensitive, case-insensitive', () => {
  assert.equal(normalizeName('Mario Rossi'), normalizeName('ROSSI mario'));
  assert.equal(normalizeName('Mario Rossi'), 'mario rossi');
});

test('normalizeName: strips accents, punctuation and extra spaces', () => {
  assert.equal(normalizeName('  José   Álvarez '), 'alvarez jose');
  assert.equal(normalizeName('Rossi, Mario.'), 'mario rossi');
});

test('normalizeName: compound names keep all tokens', () => {
  assert.equal(normalizeName('Maria Rosa Bianchi'), 'bianchi maria rosa');
});

test('normalizeName: empty-ish input gives an empty string', () => {
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName(undefined), '');
  assert.equal(normalizeName('   '), '');
  assert.equal(normalizeName('.,-'), '');
});

test('matchOwner: inverted name matches an active resource', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi')], []);
  assert.deepEqual(matchOwner('ROSSI mario', ctx), { kind: 'matched', resourceId: 'r1' });
});

test('matchOwner: empty owner is kind empty', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi')], []);
  assert.deepEqual(matchOwner('', ctx), { kind: 'empty' });
  assert.deepEqual(matchOwner(null, ctx), { kind: 'empty' });
});

test('matchOwner: unknown name is unmatched with no candidates', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi')], []);
  assert.deepEqual(matchOwner('Luca Verdi', ctx), { kind: 'unmatched', candidates: [] });
});

test('matchOwner: two active resources with the same normalized name are ambiguous, never matched', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi'), R('r2', 'Rossi', 'Mario')], []);
  assert.deepEqual(matchOwner('Mario Rossi', ctx), { kind: 'ambiguous', candidates: ['r1', 'r2'] });
});

test('matchOwner: inactive resource is excluded from automatic matching', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi', 'inactive')], []);
  assert.deepEqual(matchOwner('Mario Rossi', ctx), { kind: 'unmatched', candidates: [] });
});

test('matchOwner: an inactive resource plus an active namesake is not ambiguous', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi', 'inactive'), R('r2', 'Mario', 'Rossi')], []);
  assert.deepEqual(matchOwner('Mario Rossi', ctx), { kind: 'matched', resourceId: 'r2' });
});

test('matchOwner: an explicit alias beats the name match', () => {
  const ctx = buildMatchContext(
    [R('r1', 'Mario', 'Rossi'), R('r2', 'Luca', 'Verdi')],
    [{ alias_normalized: 'mario rossi', resource_id: 'r2' }]
  );
  assert.deepEqual(matchOwner('Mario Rossi', ctx), { kind: 'alias', resourceId: 'r2' });
});

test('matchOwner: an alias to an inactive resource still resolves', () => {
  const ctx = buildMatchContext(
    [R('r1', 'Old', 'Timer', 'inactive')],
    [{ alias_normalized: 'mt', resource_id: 'r1' }]
  );
  assert.deepEqual(matchOwner('MT', ctx), { kind: 'alias', resourceId: 'r1' });
});

test('matchOwner: an alias with a null resource means ignored', () => {
  const ctx = buildMatchContext([], [{ alias_normalized: 'tbd', resource_id: null }]);
  assert.deepEqual(matchOwner('TBD', ctx), { kind: 'ignored' });
});

test('aggregateUnmatched: sums hours per project+name, skips matched/ignored/empty owners', () => {
  const ctx = buildMatchContext(
    [R('r1', 'Mario', 'Rossi')],
    [{ alias_normalized: 'tbd', resource_id: null }]
  );
  const out = aggregateUnmatched({
    P1: [
      { owner: 'Luca Verdi', hours: 4 },
      { owner: 'verdi luca', hours: '2.5' },
      { owner: 'Mario Rossi', hours: 8 },
      { owner: 'TBD', hours: 3 },
      { owner: '', hours: 9 },
      { owner: null, hours: 9 },
    ],
    P2: [{ owner: 'Luca Verdi', hours: 1 }],
  }, ctx);
  assert.deepEqual(out, [
    { projectCode: 'P1', nameNormalized: 'luca verdi', displayName: 'Luca Verdi', hours: 6.5, candidateResourceIds: [] },
    { projectCode: 'P2', nameNormalized: 'luca verdi', displayName: 'Luca Verdi', hours: 1, candidateResourceIds: [] },
  ]);
});

test('aggregateUnmatched: ambiguous names carry their candidates; bad hours count as 0', () => {
  const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi'), R('r2', 'Rossi', 'Mario')], []);
  const out = aggregateUnmatched({ P1: [{ owner: 'Mario Rossi', hours: 'abc' }] }, ctx);
  assert.deepEqual(out, [
    { projectCode: 'P1', nameNormalized: 'mario rossi', displayName: 'Mario Rossi', hours: 0, candidateResourceIds: ['r1', 'r2'] },
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from the repo root): `node --test api/src/lib/match-resource.test.js`
Expected: FAIL — `Cannot find module './match-resource'`.

- [ ] **Step 3: Write the implementation**

```js
// Pure name-matching helpers for linking free-text actuals owners to `resources`
// (Cycle 3b). No DB access — api/src/services/resource-matching.js feeds it rows.

// Lowercase, strip accents, drop everything that isn't a letter/digit, and compare as a
// SORTED token set so "Rossi Mario" and "mario rossi" are the same name. '' if nothing is left.
function normalizeName(input) {
  if (input == null) return '';
  const tokens = String(input)
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
  return tokens.sort().join(' ');
}

// resources: [{ id, first_name, last_name, status }]; aliases: [{ alias_normalized, resource_id }]
// (resource_id null = "ignore this name"). Only ACTIVE resources take part in automatic matching.
function buildMatchContext(resources, aliases) {
  const aliasByKey = new Map();
  for (const a of aliases || []) aliasByKey.set(a.alias_normalized, a.resource_id ?? null);
  const activeByKey = new Map();
  for (const r of resources || []) {
    if (r.status !== 'active') continue;
    const key = normalizeName(`${r.first_name} ${r.last_name}`);
    if (!key) continue;
    if (!activeByKey.has(key)) activeByKey.set(key, []);
    activeByKey.get(key).push(r.id);
  }
  return { aliasByKey, activeByKey };
}

function matchOwner(name, ctx) {
  const key = normalizeName(name);
  if (!key) return { kind: 'empty' };
  if (ctx.aliasByKey.has(key)) {
    const resourceId = ctx.aliasByKey.get(key);
    return resourceId ? { kind: 'alias', resourceId } : { kind: 'ignored' };
  }
  const candidates = ctx.activeByKey.get(key) || [];
  if (candidates.length === 1) return { kind: 'matched', resourceId: candidates[0] };
  if (candidates.length > 1) return { kind: 'ambiguous', candidates: [...candidates] };
  return { kind: 'unmatched', candidates: [] };
}

// rowsByCode: { [projectCode]: [{ owner, hours }] } → the names that need an admin's attention.
function aggregateUnmatched(rowsByCode, ctx) {
  const acc = new Map();
  for (const code of Object.keys(rowsByCode)) {
    for (const row of rowsByCode[code] || []) {
      const m = matchOwner(row.owner, ctx);
      if (m.kind !== 'unmatched' && m.kind !== 'ambiguous') continue;
      const nameNormalized = normalizeName(row.owner);
      const key = `${code}\u0000${nameNormalized}`;
      const hours = Number(row.hours);
      let entry = acc.get(key);
      if (!entry) {
        entry = {
          projectCode: code, nameNormalized, displayName: String(row.owner).trim(),
          hours: 0, candidateResourceIds: m.candidates,
        };
        acc.set(key, entry);
      }
      entry.hours += Number.isFinite(hours) ? hours : 0;
    }
  }
  return [...acc.values()].sort((a, b) =>
    a.projectCode < b.projectCode ? -1 : a.projectCode > b.projectCode ? 1
      : a.nameNormalized < b.nameNormalized ? -1 : a.nameNormalized > b.nameNormalized ? 1 : 0);
}

module.exports = { normalizeName, buildMatchContext, matchOwner, aggregateUnmatched };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test api/src/lib/match-resource.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/match-resource.js api/src/lib/match-resource.test.js
git commit -m "feat: pure name-matching module for resource aliases"
```

---

### Task 2: Migration, refresh service, upload hook

**Files:**
- Create: `api/src/db/migrations/024_resource_aliases_unmatched.sql`
- Create: `api/src/services/resource-matching.js`
- Modify: `api/src/routes/timesheets.js` (top-of-file requires; `POST /upload` after the insert loop, ~line 211; `DELETE /:projectCode`, ~line 236)
- Modify: `docs/superpowers/specs/2026-09-25-resource-profile-design.md` (§4 and §5, see "Spec corrections")

**Interfaces:**
- Consumes: `buildMatchContext`, `aggregateUnmatched` (Task 1); tables `resources`, `timesheets`.
- Produces:
  - table `resource_aliases (id UUID PK, alias_normalized TEXT UNIQUE NOT NULL, resource_id UUID NULL → resources(id) ON DELETE CASCADE, created_by UUID NULL → users(id) ON DELETE SET NULL, created_at)`; `resource_id NULL` = ignored name.
  - table `profile_unmatched (project_code VARCHAR(100), name_normalized TEXT, display_name TEXT, hours NUMERIC NOT NULL DEFAULT 0, candidate_resource_ids JSONB NOT NULL DEFAULT '[]', PRIMARY KEY (project_code, name_normalized))`.
  - `refreshUnmatched(codes: string[] | null = null): Promise<number>` — recomputes `profile_unmatched` for those project codes, or for **all** codes (and clears every stale row) when `null`; serialized by a transaction-level advisory lock; resolves to the number of queued (project, name) rows.

This task has no automated test of its own — the service is DB-bound and the suite has no DB access outside HTTP; it is exercised end-to-end by the Task 3 integration tests (upload → queue, alias → refresh). Do not add an untestable mock.

- [ ] **Step 1: Write the migration**

```sql
-- Cycle 3b: link free-text owner names in uploaded actuals to resources.
CREATE TABLE IF NOT EXISTS resource_aliases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_normalized TEXT NOT NULL UNIQUE,
  resource_id      UUID REFERENCES resources(id) ON DELETE CASCADE,  -- NULL = ignored name (not a person)
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner names that could not be matched (or matched ambiguously), per project code.
-- Keyed by project_code, not project id: timesheets are keyed by project_code and
-- projects.code is not unique. Rebuilt by api/src/services/resource-matching.js.
CREATE TABLE IF NOT EXISTS profile_unmatched (
  project_code          VARCHAR(100) NOT NULL,
  name_normalized       TEXT NOT NULL,
  display_name          TEXT NOT NULL,
  hours                 NUMERIC NOT NULL DEFAULT 0,
  candidate_resource_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (project_code, name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_profile_unmatched_name ON profile_unmatched(name_normalized);
```

- [ ] **Step 2: Write the service**

```js
// DB-bound half of Cycle 3b's name matching: recompute the `profile_unmatched` queue from the
// uploaded actuals. The matching rules themselves live in ../lib/match-resource.js (pure).
const { pool } = require('../db/client');
const { buildMatchContext, aggregateUnmatched } = require('../lib/match-resource');

// codes: project codes to refresh, or null to refresh every code (also clears stale rows).
// Read + write share one transaction and one advisory lock, so two overlapping refreshes
// cannot interleave (the loser waits, then recomputes from current data).
async function refreshUnmatched(codes = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('profile_unmatched'))");

    const [resources, aliases] = await Promise.all([
      client.query('SELECT id, first_name, last_name, status FROM resources'),
      client.query('SELECT alias_normalized, resource_id FROM resource_aliases'),
    ]);
    const ctx = buildMatchContext(resources.rows, aliases.rows);

    const ts = codes
      ? await client.query('SELECT project_code, data FROM timesheets WHERE project_code = ANY($1::text[])', [codes])
      : await client.query('SELECT project_code, data FROM timesheets');
    const rowsByCode = {};
    for (const r of ts.rows) {
      if (!rowsByCode[r.project_code]) rowsByCode[r.project_code] = [];
      if (Array.isArray(r.data)) rowsByCode[r.project_code].push(...r.data);
    }
    const unmatched = aggregateUnmatched(rowsByCode, ctx);

    if (codes) await client.query('DELETE FROM profile_unmatched WHERE project_code = ANY($1::text[])', [codes]);
    else await client.query('DELETE FROM profile_unmatched');

    if (unmatched.length) {
      await client.query(
        `INSERT INTO profile_unmatched (project_code, name_normalized, display_name, hours, candidate_resource_ids)
         SELECT t.a, t.b, t.c, t.d, t.e::jsonb
         FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::text[]) AS t(a, b, c, d, e)`,
        [
          unmatched.map(u => u.projectCode),
          unmatched.map(u => u.nameNormalized),
          unmatched.map(u => u.displayName),
          unmatched.map(u => u.hours),
          unmatched.map(u => JSON.stringify(u.candidateResourceIds)),
        ]
      );
    }
    await client.query('COMMIT');
    return unmatched.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { refreshUnmatched };
```

- [ ] **Step 3: Hook the upload and the delete in `timesheets.js`**

Add next to the other requires at the top of `api/src/routes/timesheets.js`:

```js
const { refreshUnmatched } = require('../services/resource-matching');
```

In `POST /upload`, after the `for (const code of codes) { await query('DELETE FROM timesheets ...'); await query('INSERT ...'); }` loop and before `res.status(201).json(...)`, add:

```js
    // Best-effort: a matching-queue failure must never fail (or roll back) an upload that already succeeded.
    try { await refreshUnmatched(codes); }
    catch (err) { console.warn('[timesheets] refreshUnmatched:', err.message); }
```

In `DELETE /:projectCode`, right after the `DELETE FROM timesheets` query and before `res.json({ ok: true, deleted: rowCount })`, add:

```js
    await query('DELETE FROM profile_unmatched WHERE project_code = $1', [req.params.projectCode]);
```

- [ ] **Step 4: Amend the spec (§4 and §5)**

In `docs/superpowers/specs/2026-09-25-resource-profile-design.md`:
- §4 "Tabelle": change `profile_unmatched (project_id, …` to `profile_unmatched (project_code, …` and add the reason (timesheets are keyed by `project_code`; `projects.code` is not unique).
- §4 "Sequenza in 3b" and "UI": replace "riesegue il match dei progetti che contengono quel nome" with "ogni modifica admin (risorsa creata/rinominata/disattivata/eliminata, alias aggiunto/rimosso) e il pulsante 'Rescan' eseguono un rescan completo; l'upload riesegue solo i codici caricati"; remove `js/api.js` from the touched list in §2's 3b row (`team.html` usa `fetch()` diretto).
- §4 API list: add `GET /api/resources/aliases`.
- §5: change `profile_unmatched … riscritta per progetto dal worker` to keyed by `project_code`.

- [ ] **Step 5: Verify the migration applies and the app still starts**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh` (PowerShell) — expected: migration loop prints no `ERROR` for `024_resource_aliases_unmatched.sql`, and the whole existing suite is still green (upload is not exercised yet; this proves the new `require`s and SQL are valid).

- [ ] **Step 6: Commit**

```bash
git add api/src/db/migrations/024_resource_aliases_unmatched.sql api/src/services/resource-matching.js api/src/routes/timesheets.js docs/superpowers/specs/2026-09-25-resource-profile-design.md
git commit -m "feat: profile_unmatched queue, refresh service and upload hook"
```

---

### Task 3: Admin API and integration tests

**Files:**
- Modify: `api/src/routes/resources.js`
- Modify: `test-api.js` (new helper `uploadCsv`, new `testResourceMatching()`, call from `main()` right after `testResourcesAndAttributeLists()`)

**Interfaces:**
- Consumes: `refreshUnmatched(codes|null)` (Task 2), `normalizeName` (Task 1), tables `resource_aliases`, `profile_unmatched`.
- Produces (all `requireAuth, requireAdmin` via the router-level guard):
  - `GET /api/resources/unmatched` → `[{ name_normalized, display_name, hours: number, projects: number, candidate_resource_ids: string[] }]` ordered by hours desc.
  - `GET /api/resources/aliases` → `[{ id, alias_normalized, resource_id|null, first_name|null, last_name|null, created_at }]`.
  - `POST /api/resources/aliases` body `{ name, resourceId }` **or** `{ name, ignore: true }` → 201 `{ id, alias_normalized, resource_id }`; 400 on missing name, punctuation-only name, both/neither of `resourceId`/`ignore`, non-UUID or unknown `resourceId`. Upserts on the normalized name.
  - `DELETE /api/resources/aliases/:id` → 200 `{ ok: true }`; 404 if absent.
  - `POST /api/resources/unmatched/rescan` → 200 `{ ok: true, unmatched: number }`.
  - Side effect: `POST /`, `PATCH /:id` (when `firstName`/`lastName`/`status` is in the body) and `DELETE /:id` trigger a best-effort full rescan.

- [ ] **Step 1: Write the failing integration tests**

In `test-api.js`, add this helper next to `api()`:

```js
// Multipart CSV upload (the suite's api() helper only speaks JSON). xlsx parses CSV buffers too.
async function uploadCsv(path, csvText, cookie) {
  const form = new FormData();
  form.append('file', new Blob([csvText], { type: 'text/csv' }), 'ts.csv');
  try {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { Cookie: cookie }, body: form });
    let data; try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } catch (e) {
    fail(`FETCH ERROR POST ${path}: ${e.message}`);
    return { status: 0, data: null };
  }
}
```

Add the test function before the `// ── Main` block:

```js
// ── Resource Matching (2026-09, Cycle 3b) ───────────────────────────────────────

async function testResourceMatching() {
  section('Resource Matching');

  ok((await api('GET', '/api/resources/unmatched')).status === 401, 'MA-01 GET /api/resources/unmatched without auth → 401');
  ok((await api('GET', '/api/resources/aliases')).status === 401, 'MA-01 GET /api/resources/aliases without auth → 401');

  const ts = Date.now();
  const last = `Zzmatch${ts}`;                 // unique so a fresh DB has no namesake
  const unknownName = `Luca Sconosciuto${ts}`;
  const unknownKey  = `luca sconosciuto${ts}`.split(' ').sort().join(' ');
  const code = `TMATCH${ts}`;

  // Setup: a resource, and a project with a matching task/role so the upload passes validation
  const rRes = await api('POST', '/api/resources',
    { firstName: 'Mario', lastName: last, email: `mario.${ts}@test.local`, jobTitle: 'Consultant' }, adminCookie);
  const resId = rRes.data?.id;
  if (resId) later('DELETE', `/api/resources/${resId}`);
  ok(!!resId, 'MA-setup resource created');

  const rProj = await api('POST', '/api/projects', { name: `__test_match_proj_${ts}__`, code }, adminCookie);
  const projId = rProj.data?.id;
  if (projId) later('DELETE', `/api/projects/${projId}`);
  if (projId) {
    await api('PUT', `/api/projects/${projId}/tasks`,
      [{ name: 'Analysis', resources: [{ role: 'Consultant', soldHours: 8 }] }], adminCookie);
  }
  later('DELETE', `/api/timesheets/${code}`);

  // MA-02: input validation on POST /aliases
  ok((await api('POST', '/api/resources/aliases', { name: 'X Y' }, adminCookie)).status === 400,
    'MA-02 alias with neither resourceId nor ignore → 400');
  ok((await api('POST', '/api/resources/aliases', { name: 'X Y', resourceId: resId, ignore: true }, adminCookie)).status === 400,
    'MA-02 alias with both resourceId and ignore → 400');
  ok((await api('POST', '/api/resources/aliases', { name: '  ', ignore: true }, adminCookie)).status === 400,
    'MA-02 alias with an empty name → 400');
  ok((await api('POST', '/api/resources/aliases', { name: '.,-', ignore: true }, adminCookie)).status === 400,
    'MA-02 alias with a punctuation-only name → 400');
  ok((await api('POST', '/api/resources/aliases', { name: 'X Y', resourceId: 'not-a-uuid' }, adminCookie)).status === 400,
    'MA-02 alias with a non-UUID resourceId → 400');
  ok((await api('POST', '/api/resources/aliases', { name: 'X Y', resourceId: '00000000-0000-0000-0000-000000000000' }, adminCookie)).status === 400,
    'MA-02 alias with an unknown resourceId → 400');

  if (!projId || !resId) { ok(false, 'MA-04… skipped — project or resource setup failed'); return; }

  // Upload: an inverted-order match for Mario, an unknown person, and a blank-owner row
  const csv = [
    'projectId,date,task,role,owner,hours',
    `${code},2026-01-15,Analysis,Consultant,${last.toUpperCase()}  Mario,4`,
    `${code},2026-01-16,Analysis,Consultant,${unknownName},6`,
    `${code},2026-01-17,Analysis,Consultant,,2`,
  ].join('\n');
  const rUp = await uploadCsv('/api/timesheets/upload', csv, adminCookie);
  ok(rUp.status === 201, `MA-04 CSV timesheet upload → 201 (got ${rUp.status}${rUp.data?.error ? ': ' + rUp.data.error : ''})`);

  const listUnmatched = async () => (await api('GET', '/api/resources/unmatched', null, adminCookie)).data || [];
  let un = await listUnmatched();
  const marioKey = `${last} Mario`.toLowerCase().split(' ').sort().join(' ');
  ok(!un.some(u => u.name_normalized === marioKey),
    'MA-05 inverted-order, differently-cased owner auto-matches the resource (not queued)');
  const unknownRow = un.find(u => u.name_normalized === unknownKey);
  ok(!!unknownRow && Number(unknownRow.hours) === 6 && unknownRow.projects === 1,
    'MA-05 unknown owner is queued with its hours and project count');
  ok(!un.some(u => u.name_normalized === ''), 'MA-05 blank owner never enters the queue');

  // MA-06: assign → leaves the queue, listed as an alias
  const rAlias = await api('POST', '/api/resources/aliases', { name: unknownName, resourceId: resId }, adminCookie);
  const aliasId = rAlias.data?.id;
  ok(rAlias.status === 201 && !!aliasId, 'MA-06 POST alias → 201');
  un = await listUnmatched();
  ok(!un.some(u => u.name_normalized === unknownKey), 'MA-06 assigned name leaves the queue');
  const rAliases = await api('GET', '/api/resources/aliases', null, adminCookie);
  ok((rAliases.data || []).some(a => a.id === aliasId && a.resource_id === resId),
    'MA-06 GET aliases lists the new alias with its resource');

  // MA-03: the same alias twice upserts, no 500
  const rAlias2 = await api('POST', '/api/resources/aliases', { name: unknownName.toUpperCase(), resourceId: resId }, adminCookie);
  ok(rAlias2.status === 201, 'MA-03 adding the same alias again (different case) → 201, not 500');
  const dupes = ((await api('GET', '/api/resources/aliases', null, adminCookie)).data || [])
    .filter(a => a.alias_normalized === unknownKey);
  ok(dupes.length === 1, 'MA-03 still exactly one alias row for that normalized name');

  // MA-07: removing the alias returns the name to the queue
  ok((await api('DELETE', `/api/resources/aliases/${dupes[0]?.id}`, null, adminCookie)).status === 200,
    'MA-07 DELETE alias → 200');
  un = await listUnmatched();
  ok(un.some(u => u.name_normalized === unknownKey), 'MA-07 removed alias returns the name to the queue');
  ok((await api('DELETE', `/api/resources/aliases/${dupes[0]?.id}`, null, adminCookie)).status === 404,
    'MA-07 DELETE alias that no longer exists → 404');

  // MA-08: ignore a name
  const rIgn = await api('POST', '/api/resources/aliases', { name: unknownName, ignore: true }, adminCookie);
  const ignId = rIgn.data?.id;
  if (ignId) later('DELETE', `/api/resources/aliases/${ignId}`);
  un = await listUnmatched();
  ok(rIgn.status === 201 && !un.some(u => u.name_normalized === unknownKey),
    'MA-08 ignored name leaves the queue');
  if (ignId) await api('DELETE', `/api/resources/aliases/${ignId}`, null, adminCookie);

  // MA-09: an inactive resource is not auto-matched; reactivating re-matches
  await api('PATCH', `/api/resources/${resId}`, { status: 'inactive' }, adminCookie);
  un = await listUnmatched();
  ok(un.some(u => u.name_normalized === marioKey), 'MA-09 deactivated resource: its name goes back to the queue');
  await api('PATCH', `/api/resources/${resId}`, { status: 'active' }, adminCookie);
  un = await listUnmatched();
  ok(!un.some(u => u.name_normalized === marioKey), 'MA-09 reactivated resource: its name matches again');

  // MA-10: deleting the resource re-queues its names; rescan endpoint works
  ok((await api('DELETE', `/api/resources/${resId}`, null, adminCookie)).status === 200, 'MA-10 DELETE resource → 200');
  un = await listUnmatched();
  ok(un.some(u => u.name_normalized === marioKey), 'MA-10 deleting the resource returns its name to the queue');
  const rScan = await api('POST', '/api/resources/unmatched/rescan', null, adminCookie);
  ok(rScan.status === 200 && rScan.data?.ok === true, 'MA-10 POST /unmatched/rescan → 200');
}
```

In `main()`, add right after `await testResourcesAndAttributeLists();`:

```js
    await testResourceMatching();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: FAIL — the new `/unmatched`, `/aliases` routes return 404 (`MA-01` gets 404 not 401; `MA-02…` and the upload assertions fail). If `MA-04` (upload) fails with a 400, read `rUp.data.error` — it means the CSV/task/role setup needs adjusting, not the routes.

- [ ] **Step 3: Implement the routes**

In `api/src/routes/resources.js`, add near the top (after the existing requires):

```js
const { normalizeName } = require('../lib/match-resource');
const { refreshUnmatched } = require('../services/resource-matching');

// Best-effort full rescan after an admin change that can alter which names match.
async function rescanAll() {
  try { await refreshUnmatched(null); }
  catch (err) { console.warn('[resources] refreshUnmatched:', err.message); }
}
```

Add these routes **above** the existing `// POST /api/resources` handler (so the fixed paths are declared before the `/:id` ones):

```js
// GET /api/resources/unmatched — owner names from actuals that need an admin's attention
router.get('/unmatched', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT name_normalized,
              (array_agg(display_name ORDER BY hours DESC))[1] AS display_name,
              SUM(hours)::float AS hours,
              COUNT(DISTINCT project_code)::int AS projects,
              (array_agg(candidate_resource_ids))[1] AS candidate_resource_ids
       FROM profile_unmatched
       GROUP BY name_normalized
       ORDER BY SUM(hours) DESC, name_normalized`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/resources/unmatched/rescan — recompute the queue from all uploaded actuals
router.post('/unmatched/rescan', async (req, res, next) => {
  try {
    const unmatched = await refreshUnmatched(null);
    res.json({ ok: true, unmatched });
  } catch (err) { next(err); }
});

// GET /api/resources/aliases
router.get('/aliases', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.alias_normalized, a.resource_id, a.created_at, r.first_name, r.last_name
       FROM resource_aliases a
       LEFT JOIN resources r ON r.id = a.resource_id
       ORDER BY a.alias_normalized`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/resources/aliases — { name, resourceId } assigns a name to a resource;
// { name, ignore: true } marks it as not-a-person. Upserts on the normalized name.
router.post('/aliases', async (req, res, next) => {
  try {
    const { name, resourceId, ignore } = req.body;
    const key = normalizeName(name);
    if (!key) return res.status(400).json({ error: 'name is required' });
    const wantsIgnore = ignore === true;
    if (wantsIgnore === !!resourceId) {
      return res.status(400).json({ error: 'Provide either resourceId or ignore: true' });
    }
    const { rows } = await query(
      `INSERT INTO resource_aliases (alias_normalized, resource_id, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (alias_normalized) DO UPDATE SET resource_id = EXCLUDED.resource_id
       RETURNING id, alias_normalized, resource_id`,
      [key, wantsIgnore ? null : resourceId, req.user.id]
    );
    await rescanAll();
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Resource not found' });
    if (err.code === '22P02') return res.status(400).json({ error: 'resourceId must be a valid UUID' });
    next(err);
  }
});

// DELETE /api/resources/aliases/:id
router.delete('/aliases/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM resource_aliases WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Alias not found' });
    await rescanAll();
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Alias not found' });
    next(err);
  }
});
```

In the existing handlers, call `rescanAll()`:
- `POST /` — after the successful `INSERT`, before `res.status(201).json(rows[0])`: `await rescanAll();`
- `PATCH /:id` — after the `if (!rows[0]) return res.status(404)…` line, before `res.json(rows[0])`: 
  ```js
  if (firstName !== undefined || lastName !== undefined || status !== undefined) await rescanAll();
  ```
- `DELETE /:id` — after the `if (!rows[0]) return …404` line, before `res.json({ success: true })`: `await rescanAll();`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: all `MA-*` assertions pass and the full suite is green (previous 161 + the new assertions).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/resources.js test-api.js
git commit -m "feat: resource alias and unmatched-names API"
```

---

### Task 4: "Unmatched names" panel in `team.html`

**Files:**
- Modify: `team.html` (template: a new card after the resources card, before the closing `</div>` of `.page`; Vue `data`/`methods`; refresh hooks in `submitForm`, `toggleStatus`, `deleteResource`)

**Interfaces:**
- Consumes: the Task 3 endpoints above; existing `resources`, `globalError`, `showConfirm` (from `js/core.js`).
- Produces: nothing consumed elsewhere. No versioned file changes → no `?v=N` bump.

No frontend test harness covers this Vue page; it is verified manually in Task 5 (per the project's own convention for page-level Vue work).

- [ ] **Step 1: Add the panel markup**

Insert after the closing `</div>` of the resources `<div class="card">` (line ~71) and before the `</div>` that closes `<div class="page app-container">`:

```html
      <!-- ── UNMATCHED NAMES ─────────────────────────────────── -->
      <div class="card mt-4">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="mb-0">Unmatched names <span class="text-muted fw-normal" style="font-size:.9rem">({{ unmatched.length }})</span></h5>
            <button class="btn btn-outline-secondary btn-sm" :disabled="rescanning" @click="rescan">
              <span v-if="rescanning" class="spinner-border spinner-border-sm me-1"></span>Rescan
            </button>
          </div>
          <p class="text-muted small mb-3">Names found in uploaded actuals that could not be matched to a resource. Assign each to a resource, or ignore names that are not people.</p>
          <div v-if="unmatchedError" class="alert alert-danger alert-sm mb-3">{{ unmatchedError }}</div>
          <table class="table table-hover" v-if="unmatched.length">
            <thead>
              <tr><th>Name in actuals</th><th class="text-end">Hours</th><th class="text-end">Projects</th><th>Assign to</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="u in unmatched" :key="u.name_normalized">
                <td class="fw-semibold">{{ u.display_name }}
                  <span v-if="u.candidate_resource_ids.length" class="badge bg-warning text-dark ms-1">ambiguous</span>
                </td>
                <td class="text-end">{{ u.hours }}</td>
                <td class="text-end">{{ u.projects }}</td>
                <td>
                  <select class="form-select form-select-sm" style="min-width:220px" v-model="assignChoice[u.name_normalized]" :disabled="!!u._loading">
                    <option :value="undefined" disabled>Select a resource…</option>
                    <option v-for="r in assignOptions(u)" :key="r.id" :value="r.id">{{ r.first_name }} {{ r.last_name }}</option>
                  </select>
                </td>
                <td class="text-end" style="white-space:nowrap">
                  <button class="btn btn-primary btn-action me-1" :disabled="!!u._loading || !assignChoice[u.name_normalized]" @click="assign(u)">Assign</button>
                  <button class="btn btn-outline-secondary btn-action" :disabled="!!u._loading" @click="ignoreName(u)">Ignore</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="empty" v-else>No unmatched names.</div>

          <details class="mt-3" v-if="aliases.length">
            <summary class="small text-muted" style="cursor:pointer">Existing aliases ({{ aliases.length }})</summary>
            <table class="table table-sm mt-2">
              <thead><tr><th>Name</th><th>Resolves to</th><th></th></tr></thead>
              <tbody>
                <tr v-for="a in aliases" :key="a.id">
                  <td>{{ a.alias_normalized }}</td>
                  <td><span v-if="a.resource_id">{{ a.first_name }} {{ a.last_name }}</span><span v-else class="text-muted">ignored</span></td>
                  <td class="text-end">
                    <button class="btn btn-outline-danger btn-action" :disabled="!!a._loading" @click="removeAlias(a)">Remove</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>
```

- [ ] **Step 2: Add state and methods**

In `data()` add:

```js
          unmatched: [],
          aliases: [],
          assignChoice: {},
          unmatchedError: null,
          rescanning: false,
```

In `created()`, after `await this.loadUsers(); …` and before `this.ready = true;`, add (sequential, like the loaders above):

```js
        await this.loadUnmatched();
```

Add methods (next to `loadUsers`):

```js
        async loadUnmatched() {
          this.unmatchedError = null;
          try {
            const [uRes, aRes] = await Promise.all([
              fetch('/api/resources/unmatched', { credentials: 'same-origin' }),
              fetch('/api/resources/aliases', { credentials: 'same-origin' }),
            ]);
            const [u, a] = [await uRes.json(), await aRes.json()];
            if (!uRes.ok || !aRes.ok) { this.unmatchedError = (u && u.error) || (a && a.error) || 'Failed to load unmatched names.'; return; }
            this.unmatched = u;
            this.aliases = a;
          } catch {
            this.unmatchedError = 'Network error.';
          }
        },
        // Ambiguous candidates first, then the other active resources.
        assignOptions(u) {
          const active = this.resources.filter(r => r.status === 'active');
          const cand = new Set(u.candidate_resource_ids || []);
          return [...active.filter(r => cand.has(r.id)), ...active.filter(r => !cand.has(r.id))];
        },
        async postAlias(u, body) {
          u._loading = true;
          this.unmatchedError = null;
          try {
            const res = await fetch('/api/resources/aliases', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
              body: JSON.stringify({ name: u.display_name, ...body }),
            });
            const data = await res.json();
            if (!res.ok) { this.unmatchedError = data.error || 'Save failed'; return; }
            delete this.assignChoice[u.name_normalized];
            await this.loadUnmatched();
          } catch {
            this.unmatchedError = 'Network error.';
          } finally {
            u._loading = false;
          }
        },
        assign(u) {
          const resourceId = this.assignChoice[u.name_normalized];
          if (!resourceId) return;
          return this.postAlias(u, { resourceId });
        },
        ignoreName(u) { return this.postAlias(u, { ignore: true }); },
        async removeAlias(a) {
          a._loading = true;
          this.unmatchedError = null;
          try {
            const res = await fetch(`/api/resources/aliases/${a.id}`, { method: 'DELETE', credentials: 'same-origin' });
            const data = await res.json();
            if (!res.ok) { this.unmatchedError = data.error || 'Remove failed'; return; }
            await this.loadUnmatched();
          } catch {
            this.unmatchedError = 'Network error.';
          } finally {
            a._loading = false;
          }
        },
        async rescan() {
          this.rescanning = true;
          this.unmatchedError = null;
          try {
            const res = await fetch('/api/resources/unmatched/rescan', { method: 'POST', credentials: 'same-origin' });
            const data = await res.json();
            if (!res.ok) { this.unmatchedError = data.error || 'Rescan failed'; return; }
            await this.loadUnmatched();
          } catch {
            this.unmatchedError = 'Network error.';
          } finally {
            this.rescanning = false;
          }
        },
```

Because resource create/rename/deactivate/delete change what matches (the backend rescans), refresh the panel after each: in `submitForm` add `await this.loadUnmatched();` after `await this.loadResources();`; in `toggleStatus` add `await this.loadUnmatched();` after `r.status = data.status;`; in `deleteResource` add `await this.loadUnmatched();` after `await this.loadResources();`.

- [ ] **Step 3: Confirm no versioned file changed**

Run: `git diff --name-only main -- js css`
Expected: no output → no `?v=N` bump required.

- [ ] **Step 4: Commit**

```bash
git add team.html
git commit -m "feat: Unmatched names panel in team.html"
```

---

### Task 5: Verification and handoff

**Files:** none modified (fixes found here go back to the owning task).

- [ ] **Step 1: Full test suites**

Run: `npm test` (frontend, expect all green and unchanged), `node --test api/src/lib/*.test.js` (all pure backend tests, including `match-resource.test.js`), then `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`.
Expected: all green, zero failures.

- [ ] **Step 2: Isolated stack with cloned data**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/test-branch.sh up` (copy `.env` into the worktree first), then `status` → up.

- [ ] **Step 3: Manual UI check on the branch stack (`team.html`)**

1. Upload a real actuals XLS from `portfolio.html`/`planning.html` for a project whose people exist in Team; open `team.html` → "Unmatched names" lists only names that don't correspond to a resource (an inverted "Surname Name" for an existing person is **not** listed).
2. Assign a listed name to a resource → it leaves the list and appears under "Existing aliases"; upload again → still matched.
3. "Ignore" a non-person name → it leaves the list; "Remove" it from aliases → it returns.
4. Deactivate the matched resource → its name reappears; reactivate → gone.
5. "Rescan" repopulates the queue for actuals uploaded before this feature existed.

- [ ] **Step 4: Hand off to `/finish-cycle`**

Teardown of the branch environment only after the user's own "yes" in Gate 2. `/finish-cycle`'s `/sync-docs` must also cover: `CLAUDE.md` (migration `024`; `api/src/lib/` list gains `match-resource.js`; `api/src/routes/resources.js` entry gains the alias/unmatched routes; new `api/src/services/resource-matching.js`; `team.html` entry), `ARCHITECTURE.md` (schema for `resource_aliases`/`profile_unmatched`, the five new endpoints, migration list), `docs/api/lib.md`, `TEST_CASES.md`/`test-cases.html` (new MA-01…MA-10 section, mirrored), `PRD.md` (evaluate — a new admin-visible panel in Team, likely §16.7) and the operational-manual skill reference if PRD is touched.
