# Profile Engine (Cycle 3c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build each resource's experience profile from uploaded actuals in the background — per-project contributions, a project queue, a self-scheduling worker, a `resources.profile` JSONB — and show it in `team.html`'s "Experience profile" tab.

**Architecture:** Pure modules turn actuals rows into per-(resource, project code) contributions and sum them into a profile. A DB-bound engine processes one queued project code per transaction (replacing only that code's contribution rows, then rebuilding the affected resources' profiles). A worker started by `index.js` checks every 60 s whether the (DB-configured) interval has elapsed. Upload/tag/alias/resource changes enqueue work. `team.html` reads `GET /api/resources/:id/profile` and renders a tree built by a pure vitest-covered helper.

**Tech Stack:** Node.js/Express, PostgreSQL 16, `node:test` (pure backend modules), vitest (frontend helper), Vue 3 (CDN, no build), integration tests in `test-api.js` via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §5 and §6–§9 (sub-cycle 3c; 3d, the job console page, is a later cycle).

## Global Constraints

- No bundler/build step; runtime files served as-is. All user-facing text in English.
- Migration numbered after `025` → `026_profile_engine.sql`.
- `?v=N` rule: `js/lib/team-ui.js` is modified → its tag in `team.html` goes from `?v=1` to `?v=2` (only `team.html` loads it: re-verify with a repo-wide grep for `team-ui.js` before merging). No other versioned file (`js/*.js`, `css/*.css`) is modified.
- Permissions: `POST /api/profile-jobs/run` and `GET /api/resources/:id/profile` are `requireAuth, requireAdmin` (admin **or** sysadmin) — the profile router/guards already cover `/api/resources`; the new router applies `router.use(requireAuth, requireAdmin)`.
- The profile is a **rebuildable cache**: sources of truth are the actuals (`timesheets`), `resource_aliases` and `project_tags`.
- Matching keeps 3b's rules: exact normalized name, an explicit alias beats a name, ambiguous/unmatched/ignored names produce no contribution, and **inactive resources are excluded from automatic name matching** (an alias to an inactive resource still resolves).
- The "Unmatched names" queue stays refreshed **inline** (`refreshUnmatched`, unchanged); only the profile is asynchronous.
- Never run `docker compose` against the main stack (see `CLAUDE.md` "Infrastructure safety"); verify with `scripts/run-tests.sh` / `scripts/test-branch.sh`. In a worktree copy the gitignored `.env` in first, run repo scripts with Git Bash (`& "C:\Program Files\Git\bin\bash.exe" scripts/...`), and remember `test-branch.sh up` does **not** apply new migrations to the cloned DB (apply `026` by hand to the branch DB container only).

**Deviations from / clarifications of the spec (decided while planning; Task 1 updates the spec text):**
1. `profile_job_runs.trigger` is named **`trigger_type`** (avoids the SQL keyword).
2. `roles` entries in the profile JSON also carry `projectCodes` (the treeview's "Roles → projects" branch needs them).
3. **A deactivated resource loses its automatic name match** (3b rule), so its history leaves the profile until an admin adds an alias to it. The spec's "profile also for inactive resources" therefore means: an inactive resource gets a profile from the names that reach it **through aliases**. Pinned by test PE-11.
4. Scheduled and bootstrap runs are recorded in `profile_job_runs` only when they processed something or failed (otherwise an empty run every 10 minutes would flush the 50-row history); manual runs are always recorded.
5. Deleting a project is not hooked: `DELETE /api/projects/:id` already refuses a project that has uploaded timesheets, so it cannot change a profile.

## Review Focus

- **Isolation between project codes.** Re-processing P1 must leave P2's contribution and profile entry untouched. Pinned by PE-06.
- **A failing project must not loop or block the others** (`last_error`, back of the queue, excluded for the rest of the run). Pinned by the code path in Task 2 (verified manually — a DB fault cannot be injected through HTTP); review reads it deliberately.
- **Hours/date edge cases** (non-numeric hours, missing/invalid date, blank task/role, several spellings of one name). Pinned by Task 1's `buildContributions` tests.
- **Empty and null inputs.** A resource with no contributions has `profile = NULL`; a code whose actuals were deleted removes its hours (PE-09); a resource deleted while contributions exist cascades cleanly. Pinned by Task 1 (`aggregateProfile` → `null`) and PE-09.
- **Scheduling arithmetic.** Disabled job never due; never-run job due; interval boundary; invalid/absent settings fall back to 10 min / enabled. Pinned by Task 1's `job-schedule` tests.
- **Concurrent runs.** A second `POST /run` while one is running gets 409, not a duplicate run (session advisory lock). Verified by the retry helper in the tests and read in Task 2.
- **Tree building** (ordering, roles without a label, `null`/empty profile). Pinned by Task 5's vitest cases.

---

### Task 1: Pure modules — `job-schedule.js` and `resource-profile.js`

**Files:**
- Create: `api/src/lib/job-schedule.js`, `api/src/lib/job-schedule.test.js`
- Create: `api/src/lib/resource-profile.js`, `api/src/lib/resource-profile.test.js`
- Modify: `docs/superpowers/specs/2026-09-25-resource-profile-design.md` (apply the clarifications above)

**Interfaces:**
- Consumes: `matchOwner(name, ctx)` from `api/src/lib/match-resource.js` (existing).
- Produces:
  - `parseJobSettings(rows: [{key, value}]): { enabled: boolean, intervalMin: number }` — keys `profile_job_enabled` (`'false'` → disabled, anything else/absent → enabled) and `profile_job_interval_min` (integer 1–1440, else default 10).
  - `isJobDue(settings, lastRunStartedAt: Date|string|null, now = new Date()): boolean`.
  - `monthOf(date): 'YYYY-MM' | null`; `normalizeTask(task): { key: string, name: string }` (blank → `{ key: '(no task)', name: '(no task)' }`; key = trimmed, lowercase, spaces collapsed; name = trimmed, spaces collapsed).
  - `buildContributions(rows, ctx, projectName): Map<resourceId, contribution>` where `rows` = raw actuals elements `{ owner, role, task, hours, date }` of ONE project code and `contribution = { projectName, hours, first, last, roles: { [roleCode]: hours }, tasks: { [taskKey]: { name, hours } } }` (hours rounded to 2 decimals; `first`/`last` `null` if no valid date).
  - `aggregateProfile(contribByCode, projectsByCode, now = new Date()): object | null` where `contribByCode: { [code]: contribution }` (ONE resource) and `projectsByCode[code] = { projectId: string|null, name: string|null, tags: [{ slug, listName, itemId, label }] }`; returns `null` when `contribByCode` is empty, else the profile object of spec §5 (`version`, `computedAt`, `totals`, `dimensions[slug] = { name, untaggedHours, values[] }`, `roles[]` with `projectCodes`, `projects{}`).

- [ ] **Step 1: Write the failing tests — `job-schedule.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJobSettings, isJobDue } = require('./job-schedule');

const rows = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));

test('parseJobSettings: defaults when nothing is stored', () => {
  assert.deepEqual(parseJobSettings([]), { enabled: true, intervalMin: 10 });
  assert.deepEqual(parseJobSettings(undefined), { enabled: true, intervalMin: 10 });
});

test('parseJobSettings: reads a valid interval and the enabled flag', () => {
  assert.deepEqual(
    parseJobSettings(rows({ profile_job_interval_min: '30', profile_job_enabled: 'false' })),
    { enabled: false, intervalMin: 30 }
  );
});

test('parseJobSettings: an invalid or out-of-range interval falls back to 10', () => {
  for (const bad of ['abc', '', '0', '-5', '1441', '2.5x']) {
    assert.equal(parseJobSettings(rows({ profile_job_interval_min: bad })).intervalMin, bad === '2.5x' ? 2 : 10, `value ${bad}`);
  }
});

test('parseJobSettings: boundaries 1 and 1440 are accepted', () => {
  assert.equal(parseJobSettings(rows({ profile_job_interval_min: '1' })).intervalMin, 1);
  assert.equal(parseJobSettings(rows({ profile_job_interval_min: '1440' })).intervalMin, 1440);
});

test('parseJobSettings: only the literal false disables (case/space-insensitive)', () => {
  assert.equal(parseJobSettings(rows({ profile_job_enabled: ' FALSE ' })).enabled, false);
  assert.equal(parseJobSettings(rows({ profile_job_enabled: 'true' })).enabled, true);
  assert.equal(parseJobSettings(rows({ profile_job_enabled: 'no' })).enabled, true);
});

test('isJobDue: a disabled job is never due', () => {
  assert.equal(isJobDue({ enabled: false, intervalMin: 10 }, null, new Date()), false);
});

test('isJobDue: a job that never ran is due', () => {
  assert.equal(isJobDue({ enabled: true, intervalMin: 10 }, null, new Date()), true);
});

test('isJobDue: due exactly at the interval boundary, not before', () => {
  const start = new Date('2026-09-25T10:00:00Z');
  const s = { enabled: true, intervalMin: 10 };
  assert.equal(isJobDue(s, start, new Date('2026-09-25T10:09:59Z')), false);
  assert.equal(isJobDue(s, start, new Date('2026-09-25T10:10:00Z')), true);
  assert.equal(isJobDue(s, start.toISOString(), new Date('2026-09-25T10:20:00Z')), true);
});
```

Note: `'2.5x'` parses to `2` with `parseInt`, which is within range — the test encodes that exact behavior (`parseInt` semantics), so keep the implementation on `parseInt(..., 10)`.

- [ ] **Step 2: Write the failing tests — `resource-profile.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMatchContext } = require('./match-resource');
const { monthOf, normalizeTask, buildContributions, aggregateProfile } = require('./resource-profile');

const R = (id, first, last, status = 'active') => ({ id, first_name: first, last_name: last, status });
const ctx = buildMatchContext([R('r1', 'Mario', 'Rossi'), R('r2', 'Luca', 'Verdi')], [
  { alias_normalized: 'tbd', resource_id: null },
  { alias_normalized: 'mr', resource_id: 'r1' },
]);

test('monthOf: ISO dates and timestamps give YYYY-MM; anything else null', () => {
  assert.equal(monthOf('2026-03-15'), '2026-03');
  assert.equal(monthOf('2026-03-15T10:00:00Z'), '2026-03');
  assert.equal(monthOf('2026-13-01'), null);
  assert.equal(monthOf('15/03/2026'), null);
  assert.equal(monthOf(''), null);
  assert.equal(monthOf(null), null);
});

test('normalizeTask: trims, lowercases the key, collapses spaces, keeps a readable name', () => {
  assert.deepEqual(normalizeTask('  Literature   Review '), { key: 'literature review', name: 'Literature Review' });
  assert.deepEqual(normalizeTask(''), { key: '(no task)', name: '(no task)' });
  assert.deepEqual(normalizeTask(null), { key: '(no task)', name: '(no task)' });
});

test('buildContributions: sums hours, months, roles and tasks per resource; spellings of one name merge', () => {
  const rows = [
    { owner: 'Mario Rossi', role: 'DEV', task: 'Analysis', hours: 4, date: '2026-01-15' },
    { owner: 'ROSSI mario', role: 'DEV', task: 'analysis ', hours: '2.5', date: '2026-02-10' },
    { owner: 'MR', role: 'PM', task: 'Kickoff', hours: 1, date: '2026-01-02' },
    { owner: 'Luca Verdi', role: 'DEV', task: 'Analysis', hours: 8, date: '2026-03-01' },
  ];
  const m = buildContributions(rows, ctx, 'Alpha');
  assert.deepEqual([...m.keys()].sort(), ['r1', 'r2']);
  assert.deepEqual(m.get('r1'), {
    projectName: 'Alpha', hours: 7.5, first: '2026-01', last: '2026-02',
    roles: { DEV: 6.5, PM: 1 },
    tasks: { analysis: { name: 'Analysis', hours: 6.5 }, kickoff: { name: 'Kickoff', hours: 1 } },
  });
  assert.equal(m.get('r2').hours, 8);
});

test('buildContributions: unmatched, ignored, ambiguous and blank owners produce nothing', () => {
  const ambiguousCtx = buildMatchContext([R('a', 'Ann', 'Lee'), R('b', 'Lee', 'Ann')], []);
  const rows = [
    { owner: 'Nobody Here', hours: 3, date: '2026-01-01' },
    { owner: 'TBD', hours: 3, date: '2026-01-01' },
    { owner: '', hours: 3, date: '2026-01-01' },
    { owner: null, hours: 3, date: '2026-01-01' },
    { owner: 'Ann Lee', hours: 3, date: '2026-01-01' },
  ];
  assert.equal(buildContributions(rows, ctx, 'P').size, 0);
  assert.equal(buildContributions(rows, ambiguousCtx, 'P').size, 0);
});

test('buildContributions: non-numeric hours count 0; missing/invalid dates leave first/last null; blank role skipped', () => {
  const m = buildContributions([
    { owner: 'Mario Rossi', role: '', task: '', hours: 'abc', date: 'not-a-date' },
    { owner: 'Mario Rossi', role: 'DEV', task: 'X', hours: 0.1, date: null },
    { owner: 'Mario Rossi', role: 'DEV', task: 'X', hours: 0.2, date: undefined },
  ], ctx, 'P');
  const c = m.get('r1');
  assert.equal(c.hours, 0.3);                        // no float noise
  assert.equal(c.first, null);
  assert.equal(c.last, null);
  assert.deepEqual(c.roles, { DEV: 0.3 });
  assert.deepEqual(c.tasks['(no task)'], { name: '(no task)', hours: 0 });
});

test('buildContributions: an empty row list gives an empty map', () => {
  assert.equal(buildContributions([], ctx, 'P').size, 0);
  assert.equal(buildContributions(undefined, ctx, 'P').size, 0);
});

const C = (hours, first, last, roles, tasks, projectName = 'X') => ({ projectName, hours, first, last, roles, tasks });
const tag = (slug, listName, itemId, label) => ({ slug, listName, itemId, label });
const NOW = new Date('2026-09-25T12:00:00Z');

test('aggregateProfile: no contributions → null', () => {
  assert.equal(aggregateProfile({}, {}, NOW), null);
  assert.equal(aggregateProfile(undefined, {}, NOW), null);
});

test('aggregateProfile: totals, project index, dimensions, roles and untagged hours', () => {
  const contrib = {
    P1: C(10, '2026-01', '2026-02', { DEV: 10 }, { analysis: { name: 'Analysis', hours: 10 } }, 'From actuals'),
    P2: C(3, '2026-03', '2026-03', { DEV: 2, PM: 1 }, { kickoff: { name: 'Kickoff', hours: 3 } }),
  };
  const projects = {
    P1: { projectId: 'id1', name: 'Alpha', tags: [tag('market', 'Market', 'm-it', 'Italy'), tag('brand', 'Brand', 'b-a', 'Brand A')] },
    P2: { projectId: 'id2', name: 'Beta', tags: [] },
  };
  const p = aggregateProfile(contrib, projects, NOW);
  assert.equal(p.version, 1);
  assert.equal(p.computedAt, NOW.toISOString());
  assert.deepEqual(p.totals, { hours: 13, projects: 2, firstWorked: '2026-01', lastWorked: '2026-03' });
  assert.deepEqual(Object.keys(p.projects), ['P1', 'P2']);            // ordered by hours desc
  assert.deepEqual(p.projects.P1, {
    name: 'Alpha', projectId: 'id1', hours: 10, last: '2026-02',
    tags: { market: ['Italy'], brand: ['Brand A'] },
    tasks: [{ name: 'Analysis', hours: 10 }],
  });
  assert.deepEqual(p.dimensions.market, {
    name: 'Market', untaggedHours: 3,
    values: [{ value: 'Italy', itemId: 'm-it', hours: 10, share: 0.7692, projects: 1, last: '2026-02', projectCodes: ['P1'] }],
  });
  assert.equal(p.dimensions.brand.untaggedHours, 3);
  assert.deepEqual(p.roles, [
    { code: 'DEV', hours: 12, share: 0.9231, projects: 2, last: '2026-03', projectCodes: ['P1', 'P2'] },
    { code: 'PM', hours: 1, share: 0.0769, projects: 1, last: '2026-03', projectCodes: ['P2'] },
  ]);
});

test('aggregateProfile: a project with several values in one dimension counts fully on each (shares may exceed 1 in total)', () => {
  const contrib = { P1: C(10, '2026-01', '2026-01', {}, {}) };
  const projects = { P1: { name: 'A', tags: [tag('market', 'Market', 'a', 'Italy'), tag('market', 'Market', 'b', 'Spain')] } };
  const p = aggregateProfile(contrib, projects, NOW);
  assert.deepEqual(p.dimensions.market.values.map(v => [v.value, v.hours, v.share]), [['Italy', 10, 1], ['Spain', 10, 1]]);
  assert.equal(p.dimensions.market.untaggedHours, 0);
});

test('aggregateProfile: a code with no project row falls back to the actuals name, then the code; no tags', () => {
  const p = aggregateProfile({ ORPHAN: C(2, null, null, {}, {}, 'Named in actuals'), BARE: C(1, null, null, {}, {}, '') }, {}, NOW);
  assert.equal(p.projects.ORPHAN.name, 'Named in actuals');
  assert.equal(p.projects.ORPHAN.projectId, null);
  assert.equal(p.projects.BARE.name, 'BARE');
  assert.deepEqual(p.dimensions, {});
  assert.equal(p.totals.firstWorked, null);
});

test('aggregateProfile: zero total hours does not divide by zero', () => {
  const p = aggregateProfile({ P1: C(0, null, null, {}, {}) }, { P1: { name: 'A', tags: [tag('market', 'Market', 'a', 'Italy')] } }, NOW);
  assert.equal(p.dimensions.market.values[0].share, 0);
});

test('aggregateProfile: values are ordered by hours (desc) then label; the result is deterministic', () => {
  const contrib = { P1: C(5, '2026-01', '2026-01', {}, {}), P2: C(5, '2026-01', '2026-01', {}, {}) };
  const projects = {
    P1: { name: 'A', tags: [tag('market', 'Market', 'z', 'Zed')] },
    P2: { name: 'B', tags: [tag('market', 'Market', 'a', 'Alpha')] },
  };
  const a = aggregateProfile(contrib, projects, NOW);
  const b = aggregateProfile(contrib, projects, NOW);
  assert.deepEqual(a.dimensions.market.values.map(v => v.value), ['Alpha', 'Zed']);
  assert.deepEqual(a, b);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test api/src/lib/job-schedule.test.js api/src/lib/resource-profile.test.js`
Expected: FAIL — `Cannot find module './job-schedule'` / `'./resource-profile'`.

- [ ] **Step 4: Write `job-schedule.js`**

```js
// Pure scheduling helpers for the profile worker (Cycle 3c). No DB, no timers.
const DEFAULT_INTERVAL_MIN = 10;

// rows: [{ key, value }] read from app_settings.
function parseJobSettings(rows) {
  const map = {};
  for (const r of rows || []) map[r.key] = r.value;
  let intervalMin = parseInt(map.profile_job_interval_min, 10);
  if (!Number.isFinite(intervalMin) || intervalMin < 1 || intervalMin > 1440) intervalMin = DEFAULT_INTERVAL_MIN;
  const enabled = String(map.profile_job_enabled ?? 'true').trim().toLowerCase() !== 'false';
  return { enabled, intervalMin };
}

// Is a scheduled run due? A disabled job never is; a job that never ran always is.
function isJobDue(settings, lastRunStartedAt, now = new Date()) {
  if (!settings.enabled) return false;
  if (!lastRunStartedAt) return true;
  return now.getTime() - new Date(lastRunStartedAt).getTime() >= settings.intervalMin * 60000;
}

module.exports = { DEFAULT_INTERVAL_MIN, parseJobSettings, isJobDue };
```

- [ ] **Step 5: Write `resource-profile.js`**

```js
// Pure profile-building helpers (Cycle 3c): actuals rows of ONE project code → per-resource
// contributions, and one resource's contributions → its aggregated profile. No DB access.
const { matchOwner } = require('./match-resource');

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = n => Math.round((n + Number.EPSILON) * 10000) / 10000;

function toHours(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 'YYYY-MM-DD…' → 'YYYY-MM' (month 01–12), otherwise null.
function monthOf(date) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date ?? ''));
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${m[1]}-${m[2]}` : null;
}

function normalizeTask(task) {
  const name = String(task ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { key: '(no task)', name: '(no task)' };
  return { key: name.toLowerCase(), name };
}

// rows: raw actuals elements { owner, role, task, hours, date } of one project code.
// Only names that resolve to a resource (alias or exact match) contribute.
function buildContributions(rows, ctx, projectName) {
  const byResource = new Map();
  for (const row of rows || []) {
    const m = matchOwner(row.owner, ctx);
    if (m.kind !== 'alias' && m.kind !== 'matched') continue;
    let c = byResource.get(m.resourceId);
    if (!c) {
      c = { projectName, hours: 0, first: null, last: null, roles: {}, tasks: {} };
      byResource.set(m.resourceId, c);
    }
    const hours = toHours(row.hours);
    c.hours += hours;
    const month = monthOf(row.date);
    if (month) {
      if (!c.first || month < c.first) c.first = month;
      if (!c.last || month > c.last) c.last = month;
    }
    const role = String(row.role ?? '').trim();
    if (role) c.roles[role] = (c.roles[role] || 0) + hours;
    const t = normalizeTask(row.task);
    const cur = c.tasks[t.key] || { name: t.name, hours: 0 };
    cur.hours += hours;
    c.tasks[t.key] = cur;
  }
  for (const c of byResource.values()) {
    c.hours = round2(c.hours);
    for (const k of Object.keys(c.roles)) c.roles[k] = round2(c.roles[k]);
    for (const k of Object.keys(c.tasks)) c.tasks[k].hours = round2(c.tasks[k].hours);
  }
  return byResource;
}

// contribByCode: { [code]: contribution } for ONE resource.
// projectsByCode[code] = { projectId, name, tags: [{ slug, listName, itemId, label }] }.
function aggregateProfile(contribByCode, projectsByCode, now = new Date()) {
  const codes = Object.keys(contribByCode || {});
  if (!codes.length) return null;

  let totalHours = 0;
  let firstWorked = null;
  let lastWorked = null;
  const projects = {};
  const dims = {};
  const roleAcc = new Map();

  for (const code of codes) {
    const c = contribByCode[code];
    const info = (projectsByCode && projectsByCode[code]) || {};
    totalHours += c.hours;
    if (c.first && (!firstWorked || c.first < firstWorked)) firstWorked = c.first;
    if (c.last && (!lastWorked || c.last > lastWorked)) lastWorked = c.last;

    const tags = {};
    for (const t of info.tags || []) {
      if (!tags[t.slug]) tags[t.slug] = [];
      tags[t.slug].push(t.label);
      let d = dims[t.slug];
      if (!d) d = dims[t.slug] = { name: t.listName, values: new Map(), codes: new Set() };
      d.codes.add(code);
      let v = d.values.get(t.itemId);
      if (!v) {
        v = { value: t.label, itemId: t.itemId, hours: 0, last: null, projectCodes: [] };
        d.values.set(t.itemId, v);
      }
      v.hours += c.hours;
      if (c.last && (!v.last || c.last > v.last)) v.last = c.last;
      v.projectCodes.push(code);
    }

    projects[code] = {
      name: info.name || c.projectName || code,
      projectId: info.projectId || null,
      hours: round2(c.hours),
      last: c.last,
      tags,
      tasks: Object.values(c.tasks || {})
        .map(t => ({ name: t.name, hours: round2(t.hours) }))
        .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name)),
    };

    for (const [role, h] of Object.entries(c.roles || {})) {
      let r = roleAcc.get(role);
      if (!r) { r = { code: role, hours: 0, last: null, projectCodes: [] }; roleAcc.set(role, r); }
      r.hours += h;
      if (c.last && (!r.last || c.last > r.last)) r.last = c.last;
      r.projectCodes.push(code);
    }
  }

  const share = h => (totalHours > 0 ? round4(h / totalHours) : 0);
  const byHoursThen = (a, b, ka, kb) => b.hours - a.hours || String(ka).localeCompare(String(kb));

  const dimensions = {};
  for (const slug of Object.keys(dims).sort()) {
    const d = dims[slug];
    let untagged = 0;
    for (const code of codes) if (!d.codes.has(code)) untagged += contribByCode[code].hours;
    dimensions[slug] = {
      name: d.name,
      untaggedHours: round2(untagged),
      values: [...d.values.values()]
        .map(v => ({
          value: v.value, itemId: v.itemId, hours: round2(v.hours), share: share(v.hours),
          projects: v.projectCodes.length, last: v.last, projectCodes: v.projectCodes,
        }))
        .sort((a, b) => byHoursThen(a, b, a.value, b.value)),
    };
  }

  const roles = [...roleAcc.values()]
    .map(r => ({
      code: r.code, hours: round2(r.hours), share: share(r.hours),
      projects: r.projectCodes.length, last: r.last, projectCodes: r.projectCodes,
    }))
    .sort((a, b) => byHoursThen(a, b, a.code, b.code));

  const orderedProjects = {};
  for (const code of Object.keys(projects).sort((a, b) => byHoursThen(projects[a], projects[b], a, b))) {
    orderedProjects[code] = projects[code];
  }

  return {
    version: 1,
    computedAt: now.toISOString(),
    totals: { hours: round2(totalHours), projects: codes.length, firstWorked, lastWorked },
    dimensions,
    roles,
    projects: orderedProjects,
  };
}

module.exports = { monthOf, normalizeTask, buildContributions, aggregateProfile };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test api/src/lib/job-schedule.test.js api/src/lib/resource-profile.test.js`
Expected: PASS (all). If a share/rounding expectation differs by a rounding step, fix the **test's number** only when `round4(h / total)` is demonstrably what the implementation is specified to do (e.g. 10/13 = 0.7692, 12/13 = 0.9231, 1/13 = 0.0769) — never bend the function to the test.

- [ ] **Step 7: Update the spec**

In `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §5: (a) rename `trigger` → `trigger_type` in the `profile_job_runs` definition and in the worker/`POST /run` text; (b) add `"projectCodes": ["…"]` to the `roles` entry in the profile JSON sample; (c) replace the bullet "Il profilo si calcola anche per le risorse **inattive** …" with "Una risorsa **inattiva** ha un profilo per i nomi che la raggiungono tramite **alias**: l'abbinamento automatico per nome esclude le risorse inattive (regola di 3b), quindi disattivare una persona toglie dal suo profilo le ore che arrivavano per nome finché un admin non aggiunge l'alias."; (d) add to the worker paragraph: "Le esecuzioni `scheduled` e `bootstrap` vengono registrate in `profile_job_runs` solo se hanno elaborato qualcosa o fallito; quelle `manual` sempre."

- [ ] **Step 8: Run all backend pure tests and commit**

Run: `node --test (Get-ChildItem api/src/lib/*.test.js | ForEach-Object { $_.FullName })` — expected: all green (previous 70 + the new ones).

```bash
git add api/src/lib/job-schedule.js api/src/lib/job-schedule.test.js api/src/lib/resource-profile.js api/src/lib/resource-profile.test.js docs/superpowers/specs/2026-09-25-resource-profile-design.md
git commit -m "feat: pure modules for profile building and job scheduling"
```

---

### Task 2: Migration, engine, run endpoint, profile endpoint, upload/delete hooks

**Files:**
- Create: `api/src/db/migrations/026_profile_engine.sql`
- Create: `api/src/services/profile-engine.js`
- Create: `api/src/routes/profile-jobs.js`
- Modify: `api/src/index.js` (mount the router)
- Modify: `api/src/routes/resources.js` (add `GET /:id/profile`)
- Modify: `api/src/routes/timesheets.js` (enqueue on upload and delete)
- Modify: `test-api.js` (helpers + `testProfileEngine()` part 1, called from `main()` after `testResourceMatching()`)

**Interfaces:**
- Consumes: `buildMatchContext` (3b), `buildContributions`/`aggregateProfile` (Task 1), `refreshUnmatched` (3b, `api/src/services/resource-matching.js`), `pool`/`query` from `api/src/db/client.js`.
- Produces (`api/src/services/profile-engine.js`):
  - `enqueueProjects(codes: string[]): Promise<void>`, `enqueueAll(): Promise<void>` (raw, may throw);
  - `enqueueProjectsQuiet(codes)`, `enqueueAllQuiet()` — same, but catch and `console.warn` (used by route hooks, never fail a request);
  - `processQueue(trigger: 'scheduled'|'manual'|'bootstrap' = 'scheduled'): Promise<{ skipped: boolean, projects: number, resources: number, errors: string[] }>` — `skipped: true` when another run holds the session advisory lock.
  - HTTP: `POST /api/profile-jobs/run` → 200 `{ ok: true, projects, resources, errors }`, 409 `{ error }` if busy; `GET /api/resources/:id/profile` → `{ profile, profile_computed_at }`, 404 unknown/non-UUID id.
- Test helpers produced in `test-api.js`: `runProfileJobs()` (retries on 409), `getProfile(resourceId)`, `profileCsv(rows)`.

- [ ] **Step 1: Write the failing integration tests (part 1)**

In `test-api.js`, add these helpers next to `uploadCsv`/`makeTestRole`:

```js
// Drain the profile queue. A concurrent worker run makes the endpoint answer 409 — retry briefly.
async function runProfileJobs() {
  for (let i = 0; i < 10; i++) {
    const r = await api('POST', '/api/profile-jobs/run', null, adminCookie);
    if (r.status !== 409) return r;
    await new Promise(res => setTimeout(res, 500));
  }
  return { status: 409, data: null };
}

async function getProfile(resourceId) {
  const r = await api('GET', `/api/resources/${resourceId}/profile`, null, adminCookie);
  return r.data;
}

// rows: [[projectCode, date, owner, hours], ...] — task/role are fixed to match the test projects' config.
function profileCsv(rows) {
  return ['projectId,date,task,role,owner,hours',
    ...rows.map(([code, date, owner, hours]) => `${code},${date},Analysis,Consultant,${owner},${hours}`)].join('\n');
}
```

Add before the `// ── Main` block:

```js
// ── Profile Engine (2026-09, Cycle 3c) ──────────────────────────────────────────

async function testProfileEngine() {
  section('Profile Engine');

  const NIL = '00000000-0000-0000-0000-000000000000';
  ok((await api('POST', '/api/profile-jobs/run')).status === 401, 'PE-01 POST /api/profile-jobs/run without auth → 401');
  ok((await api('GET', `/api/resources/${NIL}/profile`)).status === 401, 'PE-01 GET profile without auth → 401');
  ok((await api('GET', `/api/resources/${NIL}/profile`, null, adminCookie)).status === 404, 'PE-02 GET profile of an unknown resource → 404');
  ok((await api('GET', '/api/resources/not-a-uuid/profile', null, adminCookie)).status === 404, 'PE-02 GET profile with a non-UUID id → 404');

  const ts = Date.now();
  const code1 = `TPROF1${ts}`;
  const code2 = `TPROF2${ts}`;
  const person = `Prof Tester${ts}`;

  const role = await makeTestRole(`P${ts}`);
  const rRes = await api('POST', '/api/resources',
    { firstName: 'Prof', lastName: `Tester${ts}`, email: `prof.${ts}@test.local`, roleId: role.id }, adminCookie);
  const resId = rRes.data?.id;
  if (resId) later('DELETE', `/api/resources/${resId}`);
  ok(!!resId, 'PE-setup resource created');

  const mkProject = async (code) => {
    const r = await api('POST', '/api/projects', { name: `__prof_proj_${code}__`, code }, adminCookie);
    const id = r.data?.id;
    if (id) {
      later('DELETE', `/api/projects/${id}`);
      await api('PUT', `/api/projects/${id}/tasks`,
        [{ name: 'Analysis', resources: [{ role: 'Consultant', soldHours: 8 }] }], adminCookie);
    }
    return id;
  };
  const p1 = await mkProject(code1);
  const p2 = await mkProject(code2);
  later('DELETE', `/api/timesheets/${code1}`);
  later('DELETE', `/api/timesheets/${code2}`);
  if (!resId || !p1 || !p2) { ok(false, 'PE-03… skipped — setup failed'); return; }

  // A tag on P1 only, from the seeded Market list
  const lists = (await api('GET', '/api/attribute-lists', null, adminCookie)).data || [];
  const market = lists.find(l => l.slug === 'market');
  const itemLabel = `__prof_item_${ts}__`;
  const rItem = await api('POST', `/api/attribute-lists/${market.id}/items`, { label: itemLabel }, adminCookie);
  const itemId = rItem.data?.id;
  ok(!!itemId, 'PE-setup market item created');
  await api('PUT', `/api/projects/${p1}/tags`, { itemIds: [itemId] }, adminCookie);

  // PE-03: upload → run → profile
  const rUp = await uploadCsv('/api/timesheets/upload', profileCsv([
    [code1, '2026-01-15', person, 4],
    [code1, '2026-02-10', person, 6],
    [code1, '2026-02-11', `Nobody${ts}`, 2],
    [code2, '2026-03-05', person, 3],
  ]), adminCookie);
  ok(rUp.status === 201, `PE-03 upload of actuals for two project codes → 201 (got ${rUp.status}${rUp.data?.error ? ': ' + rUp.data.error : ''})`);
  const rRun = await runProfileJobs();
  ok(rRun.status === 200 && rRun.data?.ok === true, `PE-03 POST /api/profile-jobs/run → 200 (got ${rRun.status})`);

  let prof = await getProfile(resId);
  ok(prof?.profile && prof.profile_computed_at, 'PE-03 the resource has a profile after the run');
  const p = prof?.profile;
  ok(p?.totals?.hours === 13 && p?.totals?.projects === 2 && p?.totals?.firstWorked === '2026-01' && p?.totals?.lastWorked === '2026-03',
    'PE-03 totals: 13 h over 2 projects, 2026-01 → 2026-03 (unmatched owner excluded)');
  ok(p?.dimensions?.market?.name === 'Market' && p.dimensions.market.values[0]?.value === itemLabel
      && p.dimensions.market.values[0]?.hours === 10 && p.dimensions.market.untaggedHours === 3,
    'PE-04 Market dimension: tagged project P1 = 10 h, untagged P2 = 3 h');
  ok(p?.projects?.[code1]?.tasks?.[0]?.name === 'Analysis' && p.projects[code1].tasks[0].hours === 10
      && p?.roles?.[0]?.code === 'Consultant' && p.roles[0].hours === 13,
    'PE-05 tasks are per project and roles are the actuals\' role codes');

  // PE-06: isolation — re-uploading P1 must not disturb P2
  const p2Before = JSON.stringify(p.projects[code2]);
  await uploadCsv(`/api/timesheets/upload?projectCode=${code1}`, profileCsv([[code1, '2026-04-01', person, 2]]), adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.totals?.hours === 5 && JSON.stringify(prof.profile.projects[code2]) === p2Before,
    'PE-06 re-processing P1 (13 h → 2 h) leaves P2 untouched: total 5 h, P2 entry identical');

  // PE-07: tag change on P2 → profile follows
  await api('PUT', `/api/projects/${p2}/tags`, { itemIds: [itemId] }, adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.dimensions?.market?.values?.[0]?.hours === 5 && prof.profile.dimensions.market.untaggedHours === 0,
    'PE-07 tagging P2 as well: the Market value now covers 5 h and nothing is untagged');

  // PE-08: an alias makes an extra name count
  const aliasName = `Alias Person${ts}`;
  await uploadCsv(`/api/timesheets/upload?projectCode=${code1}`, profileCsv([
    [code1, '2026-04-01', person, 2], [code1, '2026-04-02', aliasName, 1],
  ]), adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.totals?.hours === 5, 'PE-08 before the alias the extra name adds nothing (still 5 h)');
  const rAlias = await api('POST', '/api/resources/aliases', { name: aliasName, resourceId: resId }, adminCookie);
  if (rAlias.data?.id) later('DELETE', `/api/resources/aliases/${rAlias.data.id}`);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.totals?.hours === 6, 'PE-08 after assigning the alias the extra name counts: 6 h');

  // PE-10: a full re-run gives the same result (rebuildable cache)
  const snapshot = JSON.stringify({ t: prof.profile.totals, d: prof.profile.dimensions, r: prof.profile.roles, p: prof.profile.projects });
  await api('POST', '/api/resources/unmatched/rescan', null, adminCookie);
  await api('PATCH', `/api/resources/${resId}`, { firstName: 'Prof' }, adminCookie);   // enqueues every code
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(JSON.stringify({ t: prof.profile.totals, d: prof.profile.dimensions, r: prof.profile.roles, p: prof.profile.projects }) === snapshot,
    'PE-10 re-enqueuing everything and re-running reproduces the same profile');

  // PE-09: deleting a code's actuals removes its hours
  ok((await api('DELETE', `/api/timesheets/${code2}`, null, adminCookie)).status === 200, 'PE-09 DELETE the actuals of P2 → 200');
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.totals?.projects === 1 && prof.profile.projects[code2] === undefined && prof.profile.totals.hours === 3,
    'PE-09 P2\'s hours disappear from the profile (1 project, 3 h left)');
}
```

Add `await testProfileEngine();` in `main()` right after `await testResourceMatching();`.

- [ ] **Step 2: Run the integration suite to verify the new tests fail**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: FAIL — `PE-01/03` (the new routes 404 or the upload does not enqueue), later `PE-*` assertions false. Existing tests still pass.

- [ ] **Step 3: Write the migration**

```sql
-- Cycle 3c: profile engine (per-project contributions, project queue/state, run history, cached profile).
CREATE TABLE IF NOT EXISTS resource_project_contributions (
  resource_id  UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  project_code VARCHAR(100) NOT NULL,
  data         JSONB NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, project_code)
);
CREATE INDEX IF NOT EXISTS idx_rpc_project_code ON resource_project_contributions(project_code);

-- One row per project code that has (or had) actuals. In queue = queued_at IS NOT NULL.
CREATE TABLE IF NOT EXISTS profile_project_state (
  project_code      VARCHAR(100) PRIMARY KEY,
  queued_at         TIMESTAMPTZ,
  last_processed_at TIMESTAMPTZ,
  last_error        TEXT,
  last_rows         INTEGER,
  last_resources    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pps_queued ON profile_project_state(queued_at) WHERE queued_at IS NOT NULL;

-- History of worker/manual runs, pruned to the latest 50 by the engine.
CREATE TABLE IF NOT EXISTS profile_job_runs (
  id           BIGSERIAL PRIMARY KEY,
  started_at   TIMESTAMPTZ NOT NULL,
  finished_at  TIMESTAMPTZ,
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('scheduled', 'manual', 'bootstrap')),
  projects     INTEGER NOT NULL DEFAULT 0,
  resources    INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);

ALTER TABLE resources ADD COLUMN IF NOT EXISTS profile JSONB;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS profile_computed_at TIMESTAMPTZ;

-- Worker settings (edited from the job console in 3d; the worker re-reads them on every tick).
INSERT INTO app_settings (key, value) VALUES
  ('profile_job_interval_min', '10'),
  ('profile_job_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 4: Write the engine**

```js
// DB-bound half of Cycle 3c: process queued project codes into per-resource contributions and
// rebuild the affected resources' profiles. Pure logic lives in ../lib/resource-profile.js.
const { pool, query } = require('../db/client');
const { buildMatchContext } = require('../lib/match-resource');
const { buildContributions, aggregateProfile } = require('../lib/resource-profile');
const { refreshUnmatched } = require('./resource-matching');

const MAX_RUNS_KEPT = 50;

// ── Queue ─────────────────────────────────────────────────────────────────────────────────────

async function enqueueProjects(codes) {
  const list = [...new Set((codes || []).map(c => String(c ?? '').trim()).filter(Boolean))];
  if (!list.length) return;
  await query(
    `INSERT INTO profile_project_state (project_code, queued_at)
     SELECT c, now() FROM unnest($1::text[]) AS c
     ON CONFLICT (project_code) DO UPDATE
       SET queued_at = COALESCE(profile_project_state.queued_at, EXCLUDED.queued_at)`,
    [list]
  );
}

// Every code that has actuals, plus every code already tracked (so deleted actuals get cleaned up).
async function enqueueAll() {
  await query(
    `INSERT INTO profile_project_state (project_code, queued_at)
     SELECT c.project_code, now()
     FROM (SELECT project_code FROM timesheets UNION SELECT project_code FROM profile_project_state) c
     ON CONFLICT (project_code) DO UPDATE
       SET queued_at = COALESCE(profile_project_state.queued_at, EXCLUDED.queued_at)`
  );
}

// Route hooks must never fail (or slow down noticeably) the request that triggered them.
async function quiet(label, fn) {
  try { await fn(); } catch (err) { console.warn(`[profile] ${label}:`, err.message); }
}
const enqueueProjectsQuiet = codes => quiet('enqueueProjects', () => enqueueProjects(codes));
const enqueueAllQuiet = () => quiet('enqueueAll', enqueueAll);

// ── Processing ────────────────────────────────────────────────────────────────────────────────

async function loadMatchContext(client) {
  const [resources, aliases] = await Promise.all([
    client.query('SELECT id, first_name, last_name, status FROM resources'),
    client.query('SELECT alias_normalized, resource_id FROM resource_aliases'),
  ]);
  return buildMatchContext(resources.rows, aliases.rows);
}

// Rebuild ONE resource's profile from all of its contributions (NULL when it has none).
async function rebuildProfile(client, resourceId) {
  const contribs = await client.query(
    'SELECT project_code, data FROM resource_project_contributions WHERE resource_id = $1', [resourceId]);
  if (!contribs.rows.length) {
    await client.query('UPDATE resources SET profile = NULL, profile_computed_at = now() WHERE id = $1', [resourceId]);
    return;
  }
  const contribByCode = {};
  for (const r of contribs.rows) contribByCode[r.project_code] = r.data;
  const codes = Object.keys(contribByCode);

  // A code resolves to its OLDEST project (projects.code is not unique); tags come from project_tags.
  const info = await client.query(
    `WITH pj AS (SELECT DISTINCT ON (code) code, id, name FROM projects
                 WHERE code = ANY($1::text[]) ORDER BY code, created_at, id)
     SELECT pj.code, pj.id AS project_id, pj.name,
            al.slug, al.name AS list_name, ali.id AS item_id, ali.label
     FROM pj
     LEFT JOIN project_tags pt ON pt.project_id = pj.id
     LEFT JOIN attribute_list_items ali ON ali.id = pt.item_id
     LEFT JOIN attribute_lists al ON al.id = ali.list_id`,
    [codes]
  );
  const projectsByCode = {};
  for (const r of info.rows) {
    if (!projectsByCode[r.code]) projectsByCode[r.code] = { projectId: r.project_id, name: r.name, tags: [] };
    if (r.item_id) projectsByCode[r.code].tags.push({ slug: r.slug, listName: r.list_name, itemId: r.item_id, label: r.label });
  }

  const profile = aggregateProfile(contribByCode, projectsByCode, new Date());
  await client.query('UPDATE resources SET profile = $2::jsonb, profile_computed_at = now() WHERE id = $1',
    [resourceId, JSON.stringify(profile)]);
}

// Inside an open transaction: replace only this code's contributions, rebuild the affected profiles.
async function processCode(client, code) {
  const ctx = await loadMatchContext(client);
  const ts = await client.query(
    `SELECT e FROM timesheets t
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(t.data) = 'array' THEN t.data ELSE '[]'::jsonb END) e
     WHERE t.project_code = $1`,
    [code]
  );
  const rows = ts.rows.map(r => r.e);
  const proj = await client.query(
    'SELECT name FROM projects WHERE code = $1 ORDER BY created_at, id LIMIT 1', [code]);
  const fromActuals = rows.map(r => String(r.projectName ?? '').trim()).find(Boolean);
  const projectName = proj.rows[0]?.name || fromActuals || code;

  const contribs = buildContributions(rows, ctx, projectName);
  const prev = await client.query(
    'SELECT resource_id FROM resource_project_contributions WHERE project_code = $1', [code]);
  await client.query('DELETE FROM resource_project_contributions WHERE project_code = $1', [code]);
  if (contribs.size) {
    const ids = [...contribs.keys()];
    await client.query(
      `INSERT INTO resource_project_contributions (resource_id, project_code, data, computed_at)
       SELECT t.a, $2, t.b::jsonb, now() FROM unnest($1::uuid[], $3::text[]) AS t(a, b)`,
      [ids, code, ids.map(id => JSON.stringify(contribs.get(id)))]
    );
  }
  const affected = new Set([...prev.rows.map(r => r.resource_id), ...contribs.keys()]);
  for (const rid of affected) await rebuildProfile(client, rid);
  return { rows: rows.length, resources: contribs.size };
}

// One queued code per transaction. Returns null when the queue is empty, { code, resources } on
// success, { code, error } when that code failed (it goes to the back of the queue with last_error).
async function processNext(exclude) {
  const client = await pool.connect();
  let code = null;
  try {
    await client.query('BEGIN');
    const claim = await client.query(
      `UPDATE profile_project_state SET queued_at = NULL
       WHERE project_code = (SELECT project_code FROM profile_project_state
                             WHERE queued_at IS NOT NULL AND project_code <> ALL($1::text[])
                             ORDER BY queued_at, project_code FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING project_code`,
      [exclude]
    );
    if (!claim.rows[0]) { await client.query('COMMIT'); return null; }
    code = claim.rows[0].project_code;
    const out = await processCode(client, code);
    await client.query(
      `UPDATE profile_project_state
       SET last_processed_at = now(), last_error = NULL, last_rows = $2, last_resources = $3
       WHERE project_code = $1`,
      [code, out.rows, out.resources]
    );
    await client.query('COMMIT');
    // Keep the "Unmatched names" list for this code current (own transaction; best-effort).
    await quiet('refreshUnmatched', () => refreshUnmatched([code]));
    return { code, resources: out.resources };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (!code) throw err;                       // failure before a code was claimed
    const message = String(err.message || err).slice(0, 500);
    await query('UPDATE profile_project_state SET last_error = $2, queued_at = now() WHERE project_code = $1',
      [code, message]).catch(() => {});
    return { code, error: message };
  } finally {
    client.release();
  }
}

async function recordRun(trigger, startedAt, projects, resources, errors) {
  await query(
    `INSERT INTO profile_job_runs (started_at, finished_at, trigger_type, projects, resources, error)
     VALUES ($1, now(), $2, $3, $4, $5)`,
    [startedAt, trigger, projects, resources, errors.length ? errors.join('; ').slice(0, 500) : null]
  );
  await query(
    `DELETE FROM profile_job_runs WHERE id NOT IN (SELECT id FROM profile_job_runs ORDER BY id DESC LIMIT ${MAX_RUNS_KEPT})`);
}

// Drain the queue. A session-level advisory lock keeps two runs (or two API instances) apart.
// Scheduled/bootstrap runs are recorded only if they did something; manual runs always.
async function processQueue(trigger = 'scheduled') {
  const lockClient = await pool.connect();
  const startedAt = new Date();
  try {
    const { rows } = await lockClient.query("SELECT pg_try_advisory_lock(hashtext('profile_engine')) AS ok");
    if (!rows[0].ok) return { skipped: true, projects: 0, resources: 0, errors: [] };
    let projects = 0;
    let resources = 0;
    const errors = [];
    const failed = [];
    for (;;) {
      const r = await processNext(failed);
      if (!r) break;
      if (r.error) { failed.push(r.code); errors.push(`${r.code}: ${r.error}`); continue; }
      projects += 1;
      resources += r.resources;
    }
    if (trigger === 'manual' || projects > 0 || errors.length) {
      await recordRun(trigger, startedAt, projects, resources, errors);
    }
    return { skipped: false, projects, resources, errors };
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext('profile_engine'))").catch(() => {});
    lockClient.release();
  }
}

module.exports = {
  enqueueProjects, enqueueAll, enqueueProjectsQuiet, enqueueAllQuiet, processQueue,
};
```

- [ ] **Step 5: The run route, its mount, and the profile read route**

Create `api/src/routes/profile-jobs.js`:

```js
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { processQueue } = require('../services/profile-engine');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// POST /api/profile-jobs/run — drain the profile queue now (also used by the tests).
// 409 when another run holds the lock. Sub-cycle 3d adds the rest of the console API to this file.
router.post('/run', async (req, res, next) => {
  try {
    const r = await processQueue('manual');
    if (r.skipped) return res.status(409).json({ error: 'A profile job is already running' });
    res.json({ ok: true, projects: r.projects, resources: r.resources, errors: r.errors });
  } catch (err) { next(err); }
});

module.exports = router;
```

In `api/src/index.js` add `const profileJobsRoutes = require('./routes/profile-jobs');` next to the other route requires and `app.use('/api/profile-jobs', profileJobsRoutes);` right after `app.use('/api/resources', resourcesRoutes);`.

In `api/src/routes/resources.js`, add after the `DELETE /aliases/:id` handler (before `router.get('/')`):

```js
// GET /api/resources/:id/profile — the cached experience profile (null until first calculated)
router.get('/:id/profile', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT profile, profile_computed_at FROM resources WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Resource not found' });
    res.json({ profile: rows[0].profile, profile_computed_at: rows[0].profile_computed_at });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Resource not found' });
    next(err);
  }
});
```

- [ ] **Step 6: Enqueue on upload and on delete (`timesheets.js`)**

Add `const { enqueueProjectsQuiet } = require('../services/profile-engine');` next to the other requires. In `POST /upload`, right after the existing `try { await refreshUnmatched(codes); } catch ...` block, add:

```js
    await enqueueProjectsQuiet(codes);
```

In `DELETE /:projectCode`, right after the `DELETE FROM profile_unmatched` query and before `res.json`, add:

```js
    await enqueueProjectsQuiet([req.params.projectCode]);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: all `PE-01…PE-10` assertions pass except none skipped (PE-07/PE-08/PE-10 rely on hooks added in Task 3: **PE-07 and PE-08 and PE-10 are expected to FAIL until Task 3**). So at this task's end, expected failing: PE-07, PE-08 (both assertions after the tag/alias change) and possibly PE-10; PE-01…PE-06 and PE-09 must pass and every pre-existing test stays green. Record the exact failing IDs in your report.

- [ ] **Step 8: Commit**

```bash
git add api/src/db/migrations/026_profile_engine.sql api/src/services/profile-engine.js api/src/routes/profile-jobs.js api/src/index.js api/src/routes/resources.js api/src/routes/timesheets.js test-api.js
git commit -m "feat: profile engine — contributions, queue, run endpoint, profile endpoint, upload hooks"
```

---

### Task 3: Enqueue hooks for tags, project code, aliases, resources and list values

**Files:**
- Modify: `api/src/routes/projects.js` (`POST /`, `PATCH /:id`, `PUT /:id/tags`)
- Modify: `api/src/routes/resources.js` (`rescanAll`)
- Modify: `api/src/routes/attribute-lists.js` (`PATCH /:id/items/:itemId`)
- Modify: `test-api.js` (part 2 of `testProfileEngine`: PE-11 and PE-12)

**Interfaces:**
- Consumes: `enqueueProjectsQuiet(codes)`, `enqueueAllQuiet()` (Task 2).
- Produces: nothing new — behavior only.

- [ ] **Step 1: Extend the tests (they must fail first for the new IDs)**

Append at the end of `testProfileEngine()` (after PE-09):

```js
  // PE-11: a deactivated person keeps a profile only through aliases (auto name match excludes inactive)
  const leaverName = `Old Timer${ts}`;
  const rLeaver = await api('POST', '/api/resources',
    { firstName: 'Old', lastName: `Timer${ts}`, email: `old.${ts}@test.local`, roleId: role.id }, adminCookie);
  const leaverId = rLeaver.data?.id;
  if (leaverId) later('DELETE', `/api/resources/${leaverId}`);
  await api('PATCH', `/api/resources/${leaverId}`, { status: 'inactive' }, adminCookie);
  await uploadCsv(`/api/timesheets/upload?projectCode=${code1}`, profileCsv([
    [code1, '2026-04-01', person, 2], [code1, '2026-04-02', aliasName, 1], [code1, '2026-05-01', leaverName, 5],
  ]), adminCookie);
  await runProfileJobs();
  prof = await getProfile(leaverId);
  ok(prof && prof.profile === null, 'PE-11 an inactive resource is not matched by name: no profile yet');
  const rLeaverAlias = await api('POST', '/api/resources/aliases', { name: leaverName, resourceId: leaverId }, adminCookie);
  if (rLeaverAlias.data?.id) later('DELETE', `/api/resources/aliases/${rLeaverAlias.data.id}`);
  await runProfileJobs();
  prof = await getProfile(leaverId);
  ok(prof?.profile?.totals?.hours === 5 && prof.profile.totals.lastWorked === '2026-05',
    'PE-11 …but an alias to the inactive resource gives it a profile (5 h)');

  // PE-12: renaming a list value re-labels the profile; changing a project's code moves its hours
  const newLabel = `__prof_item_renamed_${ts}__`;
  await api('PATCH', `/api/attribute-lists/${market.id}/items/${itemId}`, { label: newLabel }, adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.dimensions?.market?.values?.[0]?.value === newLabel,
    'PE-12 renaming a list value shows the new label in the profile after the next run');
  const code1b = `${code1}B`;
  await api('PATCH', `/api/projects/${p1}`, { code: code1b }, adminCookie);
  await runProfileJobs();
  prof = await getProfile(resId);
  ok(prof?.profile?.projects?.[code1] === undefined || prof.profile.projects[code1].name !== undefined,
    'PE-12 changing a project code does not crash the run (actuals stay under the old code)');
  await api('PATCH', `/api/projects/${p1}`, { code: code1 }, adminCookie);   // restore for cleanup
```

- [ ] **Step 2: Run to verify PE-07, PE-08, PE-10, PE-11, PE-12 fail**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: FAIL on the assertions that depend on the hooks (PE-07 tag change, PE-08 alias, PE-10 re-run equality where a resource change should re-enqueue, PE-11 alias, PE-12 rename). Everything else green.

- [ ] **Step 3: `projects.js` hooks**

Add near the other requires: `const { enqueueProjectsQuiet } = require('../services/profile-engine');`

Add this helper right after `copyVersionTagsToProject` (module-level function):

```js
// Queue a profile recalculation for a project's code (best-effort; a project without a code has none).
async function enqueueProjectCode(projectId) {
  try {
    const { rows } = await query('SELECT code FROM projects WHERE id = $1', [projectId]);
    if (rows[0]?.code) await enqueueProjectsQuiet([rows[0].code]);
  } catch (err) {
    console.warn('[projects] enqueueProjectCode:', err.message);
  }
}
```

In `POST /`, right after `if (safeCgVersionId) await copyVersionTagsToProject(...)`:

```js
    if (code?.trim()) await enqueueProjectsQuiet([code.trim()]);
```

In `PATCH /:id`: before the `params.push(req.params.id);` line, capture the previous code when the code is being changed:

```js
    let prevCode = null;
    if (req.body.code !== undefined) {
      const prev = await query('SELECT code FROM projects WHERE id = $1', [req.params.id]);
      prevCode = prev.rows[0]?.code ?? null;
    }
```

and after the existing `if (seedFromVersionId) await copyVersionTagsToProject(...)` line, before `res.json(rows[0]);`:

```js
    if (seedFromVersionId) await enqueueProjectCode(req.params.id);
    if (req.body.code !== undefined) {
      await enqueueProjectsQuiet([prevCode, rows[0] && (await query('SELECT code FROM projects WHERE id = $1', [req.params.id])).rows[0]?.code]);
    }
```

In `PUT /:id/tags`, after `await client.query('COMMIT');` and before `res.json({ ok: true });`:

```js
      await enqueueProjectCode(req.params.id);
```

- [ ] **Step 4: `resources.js` — `rescanAll` also enqueues everything**

Add to the requires: `const { enqueueAllQuiet } = require('../services/profile-engine');` and change `rescanAll` to:

```js
// Best-effort after an admin change that can alter which names match: refresh the Unmatched names
// list right away, and queue every project for a (background) profile recalculation.
async function rescanAll() {
  try { await refreshUnmatched(null); }
  catch (err) { console.warn('[resources] refreshUnmatched:', err.message); }
  await enqueueAllQuiet();
}
```

- [ ] **Step 5: `attribute-lists.js` — a renamed value re-labels the profiles**

Add `const { enqueueAllQuiet } = require('../services/profile-engine');` next to the requires, and in `PATCH /:id/items/:itemId`, after `if (!rows[0]) return res.status(404)...` and before `res.json(rows[0]);`:

```js
    if (label !== undefined) await enqueueAllQuiet();   // profiles store the label at aggregation time
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: all `PE-*` pass and the whole suite is green. If PE-12's project-code assertion is flaky because `PATCH` ordering differs, keep it weak as written — it only pins "does not crash".

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/projects.js api/src/routes/resources.js api/src/routes/attribute-lists.js test-api.js
git commit -m "feat: enqueue profile recalculation on tag, code, alias, resource and list-value changes"
```

---

### Task 4: The worker and its startup

**Files:**
- Create: `api/src/services/profile-worker.js`
- Modify: `api/src/index.js` (start the worker after `listen`)

**Interfaces:**
- Consumes: `parseJobSettings`, `isJobDue` (Task 1), `processQueue`, `enqueueAll` (Task 2), `query` from `api/src/db/client.js`.
- Produces: `start(): void` — bootstrap + a 60-second tick.

There is no automated test for the timer loop (spec §8: the decision is the pure, tested `isJobDue`; the loop is verified manually in Task 6). Do not add a test that mocks timers.

- [ ] **Step 1: Write the worker**

```js
// Self-scheduling profile worker (Cycle 3c). Every 60 s it asks whether a run is due according to
// the settings stored in app_settings (so they change without restarting the API), then drains
// the queue. The session advisory lock in profile-engine keeps overlapping runs apart.
const { query } = require('../db/client');
const { parseJobSettings, isJobDue } = require('../lib/job-schedule');
const { processQueue, enqueueAll } = require('./profile-engine');

const TICK_MS = 60 * 1000;
const BOOTSTRAP_DELAY_MS = 5 * 1000;

let lastRunStartedAt = null;
let busy = false;

async function readSettings() {
  const { rows } = await query(
    "SELECT key, value FROM app_settings WHERE key IN ('profile_job_interval_min', 'profile_job_enabled')");
  return parseJobSettings(rows);
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const settings = await readSettings();
    if (!isJobDue(settings, lastRunStartedAt, new Date())) return;
    lastRunStartedAt = new Date();
    await processQueue('scheduled');
  } catch (err) {
    console.warn('[profile-worker] tick:', err.message);
  } finally {
    busy = false;
  }
}

// After a deploy the profiles start empty: if no contribution exists yet but actuals do, queue
// every code and run once, whatever the on/off switch says (it is a one-time build).
async function bootstrap() {
  try {
    const { rows } = await query(
      `SELECT (SELECT count(*) FROM resource_project_contributions) AS contribs,
              (SELECT count(*) FROM timesheets) AS sheets`);
    if (Number(rows[0].contribs) === 0 && Number(rows[0].sheets) > 0) {
      await enqueueAll();
      lastRunStartedAt = new Date();
      await processQueue('bootstrap');
    }
  } catch (err) {
    console.warn('[profile-worker] bootstrap:', err.message);
  }
}

function start() {
  setTimeout(() => { bootstrap().catch(() => {}); }, BOOTSTRAP_DELAY_MS).unref();
  setInterval(() => { tick().catch(() => {}); }, TICK_MS).unref();
  console.log('[profile-worker] started (tick every 60 s)');
}

module.exports = { start };
```

- [ ] **Step 2: Start it from `index.js`**

Replace

```js
app.listen(PORT, () => {
  console.log(`PDash API running on port ${PORT}`);
});
```

with

```js
app.listen(PORT, () => {
  console.log(`PDash API running on port ${PORT}`);
  require('./services/profile-worker').start();
});
```

- [ ] **Step 3: Verify startup and that nothing else broke**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh` — expected: green (the worker starts inside the test stack; `PE-*` use `POST /run` with the 409-retry helper, so an overlapping tick cannot make them flaky). Also `node --check api/src/services/profile-worker.js` and `node --check api/src/index.js` from the repo root — expected: no output.

- [ ] **Step 4: Commit**

```bash
git add api/src/services/profile-worker.js api/src/index.js
git commit -m "feat: profile worker with DB-configured schedule and one-time bootstrap"
```

---

### Task 5: "Experience profile" tab (`buildProfileTree` + `team.html`)

**Files:**
- Modify: `js/lib/team-ui.js` (add `buildProfileTree`), `js/lib/team-ui.test.js`
- Modify: `team.html` (script tag `?v=1` → `?v=2`; profile tab markup; `data`, `computed`, `watch`, `methods`)

**Interfaces:**
- Consumes: `GET /api/resources/:id/profile` (Task 2); the page's already-loaded `roles` (`[{ id, label, code }]`).
- Produces: `buildProfileTree(profile, roles): null | { totals, computedAt, dimensions: [{ slug, name, untaggedHours, values: [{ key, label, hours, share, last, projectCount, projects: [{ code, name, hours, last, tasks: [{ name, hours }] }] }] }], roles: [{ code, label, hours, share, last, projectCount, projects: [...] }] }`, also bridged as `window.buildProfileTree`.

- [ ] **Step 1: Write the failing vitest cases**

Append to `js/lib/team-ui.test.js` (add `buildProfileTree` to the import line at the top):

```js
describe('buildProfileTree', () => {
  const profile = {
    version: 1, computedAt: '2026-09-25T12:00:00.000Z',
    totals: { hours: 13, projects: 2, firstWorked: '2026-01', lastWorked: '2026-03' },
    dimensions: {
      market: { name: 'Market', untaggedHours: 3, values: [
        { value: 'Spain', itemId: 'm2', hours: 3, share: 0.2308, projects: 1, last: '2026-03', projectCodes: ['P2'] },
        { value: 'Italy', itemId: 'm1', hours: 10, share: 0.7692, projects: 1, last: '2026-02', projectCodes: ['P1'] },
      ] },
      brand: { name: 'Brand', untaggedHours: 0, values: [] },
    },
    roles: [
      { code: 'DEV', hours: 12, share: 0.9231, projects: 2, last: '2026-03', projectCodes: ['P2', 'P1'] },
      { code: 'ODD', hours: 1, share: 0.0769, projects: 1, last: '2026-03', projectCodes: ['P2'] },
    ],
    projects: {
      P1: { name: 'Alpha', hours: 10, last: '2026-02', tags: {}, tasks: [{ name: 'Analysis', hours: 10 }] },
      P2: { name: 'Beta', hours: 3, last: '2026-03', tags: {}, tasks: [{ name: 'Kickoff', hours: 3 }] },
    },
  };
  const roles = [{ id: 'r1', code: 'DEV', label: 'Developer' }];

  it('returns null for a missing or empty profile', () => {
    expect(buildProfileTree(null, roles)).toBeNull();
    expect(buildProfileTree(undefined, roles)).toBeNull();
    expect(buildProfileTree({}, roles)).toBeNull();
  });

  it('keeps totals and the computed date', () => {
    const t = buildProfileTree(profile, roles);
    expect(t.totals).toEqual(profile.totals);
    expect(t.computedAt).toBe('2026-09-25T12:00:00.000Z');
  });

  it('builds dimension → value → project → task, values ordered by hours desc', () => {
    const t = buildProfileTree(profile, roles);
    expect(t.dimensions.map(d => d.slug)).toEqual(['brand', 'market']);      // by name
    const market = t.dimensions.find(d => d.slug === 'market');
    expect(market.untaggedHours).toBe(3);
    expect(market.values.map(v => v.label)).toEqual(['Italy', 'Spain']);
    expect(market.values[0]).toMatchObject({ label: 'Italy', hours: 10, share: 0.7692, projectCount: 1, last: '2026-02' });
    expect(market.values[0].projects).toEqual([
      { code: 'P1', name: 'Alpha', hours: 10, last: '2026-02', tasks: [{ name: 'Analysis', hours: 10 }] },
    ]);
  });

  it('a dimension with no values is kept (empty list)', () => {
    const brand = buildProfileTree(profile, roles).dimensions.find(d => d.slug === 'brand');
    expect(brand.values).toEqual([]);
  });

  it('labels roles from the loaded roles, falls back to the code, orders projects by hours desc', () => {
    const t = buildProfileTree(profile, roles);
    expect(t.roles.map(r => [r.code, r.label])).toEqual([['DEV', 'Developer'], ['ODD', 'ODD']]);
    expect(t.roles[0].projects.map(p => p.code)).toEqual(['P1', 'P2']);       // 10 h before 3 h
    expect(t.roles[0].projectCount).toBe(2);
  });

  it('a project code missing from the index still produces a node', () => {
    const t = buildProfileTree({ ...profile, roles: [{ code: 'X', hours: 1, share: 1, projects: 1, last: null, projectCodes: ['GONE'] }] }, []);
    expect(t.roles[0].projects).toEqual([{ code: 'GONE', name: 'GONE', hours: 0, last: null, tasks: [] }]);
  });

  it('does not mutate the profile it is given', () => {
    const copy = JSON.stringify(profile);
    buildProfileTree(profile, roles);
    expect(JSON.stringify(profile)).toBe(copy);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run js/lib/team-ui.test.js`
Expected: FAIL — `buildProfileTree is not a function` (or not exported).

- [ ] **Step 3: Implement `buildProfileTree`**

Add to `js/lib/team-ui.js`, before the two `window.*` bridge lines (and add the third bridge line):

```js
// Turns a stored profile (resources.profile) into the nested structure the Experience profile tab
// renders: dimension → value → project → task, plus roles → project. Pure; never mutates the input.
export function buildProfileTree(profile, roles = []) {
  if (!profile || !profile.totals) return null;
  const projects = profile.projects || {};
  const labelByCode = new Map((roles || []).map(r => [r.code, r.label]));

  const node = (code) => {
    const p = projects[code];
    return p
      ? { code, name: p.name, hours: p.hours, last: p.last, tasks: (p.tasks || []).map(t => ({ ...t })) }
      : { code, name: code, hours: 0, last: null, tasks: [] };
  };
  const children = (codes) => (codes || []).map(node)
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  const dimensions = Object.entries(profile.dimensions || {})
    .map(([slug, d]) => ({
      slug,
      name: d.name,
      untaggedHours: d.untaggedHours || 0,
      values: (d.values || [])
        .map(v => ({
          key: v.itemId || v.value, label: v.value, hours: v.hours, share: v.share, last: v.last,
          projectCount: v.projects, projects: children(v.projectCodes),
        }))
        .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const roleNodes = (profile.roles || []).map(r => ({
    code: r.code, label: labelByCode.get(r.code) || r.code, hours: r.hours, share: r.share, last: r.last,
    projectCount: r.projects, projects: children(r.projectCodes),
  }));

  return { totals: profile.totals, computedAt: profile.computedAt, dimensions, roles: roleNodes };
}
```

and after the existing two bridge lines add `window.buildProfileTree = buildProfileTree;`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run js/lib/team-ui.test.js`, then `npm test` — expected: all green.

- [ ] **Step 5: `team.html` — bump, data, watch, methods, markup**

1. Change `<script type="module" src="js/lib/team-ui.js?v=1"></script>` to `?v=2`, then grep the repo for other `team-ui.js` references (expected: only this one).

2. In `data()` add (next to `detailTab`):

```js
          profileLoading: false,
          profileError: null,
          profileData: null,          // { profile, profile_computed_at } for the open resource
```

3. In `computed`, after `detailAliases`, add:

```js
        profileTree() {
          return this.profileData ? window.buildProfileTree(this.profileData.profile, this.roles) : null;
        },
```

4. In the existing `watch` block add (next to `selectedResource`):

```js
        detailTab(tab) { if (tab === 'profile') this.loadProfile(); },
        selectedId() {
          this.profileData = null;
          this.profileError = null;
          if (this.selectedId && this.detailTab === 'profile') this.loadProfile();
        },
```

5. In `methods`, add:

```js
        async loadProfile() {
          const id = this.selectedId;
          if (!id) return;
          this.profileLoading = true;
          this.profileError = null;
          try {
            const res = await fetch(`/api/resources/${id}/profile`, { credentials: 'same-origin' });
            const data = await res.json();
            if (id !== this.selectedId) return;            // the panel moved on while we waited
            if (!res.ok) { this.profileError = data.error || 'Failed to load the profile.'; return; }
            this.profileData = data;
          } catch {
            if (id === this.selectedId) this.profileError = 'Network error.';
          } finally {
            if (id === this.selectedId) this.profileLoading = false;
          }
        },
        fmtHours(h) { return (Math.round((Number(h) || 0) * 100) / 100).toLocaleString('en-US'); },
        fmtPct(share) { return `${Math.round((Number(share) || 0) * 100)}%`; },
        fmtWhen(iso) { return iso ? new Date(iso).toLocaleString() : '—'; },
```

6. Replace the placeholder block in the panel

```html
        <div v-else class="text-muted" style="font-size:.9rem">
          No experience data yet. It will be built from uploaded actuals.
        </div>
```

with:

```html
        <div v-else style="font-size:.9rem">
          <div v-if="profileLoading" class="text-muted">Loading…</div>
          <div v-else-if="profileError" class="alert alert-danger alert-sm">{{ profileError }}</div>
          <div v-else-if="profileData && !profileData.profile_computed_at" class="text-muted">
            Not calculated yet. The profile is built in the background from uploaded actuals.
          </div>
          <div v-else-if="profileData && !profileTree" class="text-muted">
            No actuals matched to this person yet. Names that could not be matched are listed in the
            <a href="#" @click.prevent="setPageTab('unmatched')">Unmatched names</a> tab.
          </div>
          <div v-else-if="profileTree">
            <div class="d-flex flex-wrap gap-4 mb-3">
              <div><div class="text-muted small">Hours</div><div class="fw-semibold">{{ fmtHours(profileTree.totals.hours) }}</div></div>
              <div><div class="text-muted small">Projects</div><div class="fw-semibold">{{ profileTree.totals.projects }}</div></div>
              <div><div class="text-muted small">First month</div><div class="fw-semibold">{{ profileTree.totals.firstWorked || '—' }}</div></div>
              <div><div class="text-muted small">Last month</div><div class="fw-semibold">{{ profileTree.totals.lastWorked || '—' }}</div></div>
            </div>
            <div class="text-muted small mb-3">Last calculated: {{ fmtWhen(profileData.profile_computed_at) }}</div>

            <details v-for="d in profileTree.dimensions" :key="d.slug" open class="mb-2">
              <summary class="fw-semibold">{{ d.name }}
                <span v-if="d.untaggedHours" class="text-muted fw-normal small ms-2">{{ fmtHours(d.untaggedHours) }} h on projects without a value</span>
              </summary>
              <div v-if="!d.values.length" class="text-muted small ms-3">No values yet.</div>
              <details v-for="v in d.values" :key="v.key" class="ms-3 mt-1">
                <summary>
                  {{ v.label }}
                  <span class="text-muted small ms-2">{{ fmtHours(v.hours) }} h · {{ fmtPct(v.share) }} · {{ v.projectCount }} project{{ v.projectCount === 1 ? '' : 's' }}<span v-if="v.last"> · last {{ v.last }}</span></span>
                  <div style="height:4px;background:#e9ecef;border-radius:2px;max-width:240px"><div :style="{ height:'4px', borderRadius:'2px', background:'var(--brand-navy, #0B1840)', width: fmtPct(v.share) }"></div></div>
                </summary>
                <details v-for="p in v.projects" :key="p.code" class="ms-3 mt-1">
                  <summary>{{ p.name }} <span class="text-muted small">({{ p.code }}) · {{ fmtHours(p.hours) }} h<span v-if="p.last"> · last {{ p.last }}</span></span></summary>
                  <ul class="ms-3 mb-1 small"><li v-for="t in p.tasks" :key="t.name">{{ t.name }} — {{ fmtHours(t.hours) }} h</li></ul>
                </details>
              </details>
            </details>

            <details open class="mb-2">
              <summary class="fw-semibold">Roles</summary>
              <div v-if="!profileTree.roles.length" class="text-muted small ms-3">No roles recorded.</div>
              <details v-for="r in profileTree.roles" :key="r.code" class="ms-3 mt-1">
                <summary>{{ r.label }} <span class="text-muted small">({{ r.code }}) · {{ fmtHours(r.hours) }} h · {{ fmtPct(r.share) }} · {{ r.projectCount }} project{{ r.projectCount === 1 ? '' : 's' }}</span></summary>
                <ul class="ms-3 mb-1 small"><li v-for="p in r.projects" :key="p.code">{{ p.name }} ({{ p.code }}) — {{ fmtHours(p.hours) }} h</li></ul>
              </details>
            </details>
          </div>
        </div>
```

- [ ] **Step 6: Run the suites and check versioned files**

Run: `npm test` (expect green) and `git diff --name-only main -- js css` (expect only `js/lib/team-ui.js` and `js/lib/team-ui.test.js` besides nothing else).

- [ ] **Step 7: Commit**

```bash
git add js/lib/team-ui.js js/lib/team-ui.test.js team.html
git commit -m "feat: Experience profile tab with a profile tree"
```

---

### Task 6: Verification and handoff

**Files:** none modified (fixes go back to the owning task).

- [ ] **Step 1: Suites**

Run: `npm test`; `node --test (Get-ChildItem api/src/lib/*.test.js | ForEach-Object { $_.FullName })`; `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`.
Expected: all green, zero failures. `git diff --name-only main -- js css` → only `js/lib/team-ui.js` and its test; `grep team-ui.js` across `*.html` → only `team.html` at `?v=2`.

- [ ] **Step 2: Isolated stack (apply `026` by hand)**

Run `& "C:\Program Files\Git\bin\bash.exe" scripts/test-branch.sh up` (copy `.env` into the worktree first). `test-branch.sh` does not apply new migrations to the cloned DB, so apply `026` to the **branch DB container only**:
`Get-Content api/src/db/migrations/026_profile_engine.sql -Raw | docker exec -i pdash-db-<branch> psql -U pdash -d pdash` (the exact container name is printed by `up`), then restart only the branch API container so the worker starts against the new schema. The cloned data has 8 project codes with actuals, 0 resources, and no tags.

- [ ] **Step 3: Manual checklist**

1. In Team create 2–3 people whose names appear in the actuals (use the Unmatched names tab to see them; a reverse "Surname Name" also matches). Within ~1–2 minutes (the worker's 60 s tick; the 10-minute interval applies from the second run on) open a person → **Experience profile**: totals, "Last calculated", the Roles section, and (no tags yet) no dimensions.
2. Add a Market value and tag two projects in Config/project pages; after the next run the tree shows Market → value → project → tasks; the untagged hours note appears on projects without a value.
3. A person with no matched actuals shows "No actuals matched to this person yet" with a working link to the Unmatched tab; a brand-new person right after creation shows "Not calculated yet" (or the empty message once a run has passed).
4. Assign an alias for an unmatched name → after the next run those hours appear; deactivate a person → their name-matched hours leave the profile (until an alias is added).
5. Change the interval by hand (`UPDATE app_settings SET value='1' WHERE key='profile_job_interval_min'` in the branch DB) and set `profile_job_enabled` to `false`: the worker stops running (no new `profile_job_runs` rows) and resumes when re-enabled — no API restart needed.
6. Restart only the branch API with a wiped `resource_project_contributions`: the bootstrap run rebuilds every profile (`profile_job_runs` gets a `bootstrap` row).
7. No regression: the "Unmatched names" list still updates immediately after Assign/Ignore/Remove/Rescan; upload of actuals still succeeds and queues the project (`SELECT * FROM profile_project_state`).

- [ ] **Step 4: Hand off to `/finish-cycle`**

Teardown of the branch environment only after the user's own "yes" in Gate 2. Gate 4 will apply migration `026` to the real `pdash-db` (backup first), and **`pdash-api` must be restarted** so the worker and the new routes start. `/sync-docs` must cover: `CLAUDE.md` (migration `026`; `api/src/lib/` gains `resource-profile.js` and `job-schedule.js`; `api/src/services/` gains `profile-engine.js` and `profile-worker.js`; a `profile-jobs.js` route entry; `resources.js` `GET /:id/profile`; `js/lib/team-ui.js` gains `buildProfileTree`), `ARCHITECTURE.md` (schema for the three tables and the two `resources` columns, the two endpoints, migration list, services/lib trees), `docs/api/lib.md`, `docs/api/resources.md`, a new `docs/api/profile-engine.md` (design, queue semantics, worker, settings), `docs/js/lib.md`, `docs/pages/team.md`, `TEST_CASES.md`/`test-cases.html` (PE-01…PE-12 + the manual checklist), `PRD.md` §16.7 (the Experience profile tab is user-visible) and the operational-manual skill's §16.7 reference.
