# Profile Jobs Console (Cycle 3d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a page (`profile-jobs.html`, reached only from Timesheets) to see which project codes are queued for profile processing and when they will run, force a recalculation (all, one code, or a full rebuild), take a code out of the queue, tune the worker schedule, and read the recent run history.

**Architecture:** Pure scheduling helpers (`nextRunInfo`, `shouldRecordRun`, settings validation, row status) join `api/src/lib/job-schedule.js`. The engine gains a single-code run (`processQueue(trigger, { only })`), a repeated-error throttle on run history, and two small queue helpers; the worker exposes its in-memory last-run time and its settings reader. `api/src/routes/profile-jobs.js` grows the console API (one aggregated list query, settings PUT, rebuild, per-code process/remove, runs). A new Vue 3 CDN page renders it with pure helpers from `js/lib/profile-jobs-ui.js`; `timesheets.html` gets a "Profile processing →" button with a queue badge.

**Tech Stack:** Node.js/Express, PostgreSQL 16, `node:test` (pure backend modules), vitest + jsdom (frontend helper), Vue 3 (CDN, no build), integration tests in `test-api.js` via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-09-26-profile-jobs-console-design.md` (context: `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §5b; engine doc `docs/api/profile-engine.md`).

## Global Constraints

Copied verbatim from spec §7 (the spec is in Italian; an English gloss follows each line):

- Nessun bundler né build step; testi in inglese; token del design system, niente hex hardcoded; `v-cloak` sulla radice. *(No bundler/build step; all user-facing text in English; design-system tokens only, no hardcoded hex; `v-cloak` on the root.)*
- Nessun `alert()`/`confirm()` nativo: idioma `showConfirm()`/`showInfo()` di `js/core.js`. *(No native `alert()`/`confirm()`: use `showConfirm()`/`showInfo()` from `js/core.js`.)*
- Ogni file con `?v=N` toccato va bumpato in tutte le pagine che lo caricano (qui solo il nuovo `profile-jobs-ui.js`, `?v=1`). *(Every touched `?v=N` file is bumped on every page that loads it — here only the new `profile-jobs-ui.js`, `?v=1`.)*
- Permessi: ogni rotta `requireAdmin` (admin o sysadmin), anche lato server; parametri SQL sempre parametrizzati; `:code` validato. *(Every route `requireAdmin` (admin or sysadmin) server-side; SQL always parameterized; `:code` validated.)*
- Le azioni passano dal motore (`enqueueProjects`/`enqueueAll`/`processQueue`): lock advisory, `FOR UPDATE SKIP LOCKED`, un codice per transazione. Nessun accesso alle tabelle che aggiri il motore, salvo la lettura dell'elenco. *(Actions go through the engine: advisory lock, `FOR UPDATE SKIP LOCKED`, one code per transaction. No table access that bypasses the engine, except reading the list.)*
- L'intervallo sul DB reale è **1 minuto per prove** (deciso dall'utente, che lo riporterà a 10 dalla console); né spec né test devono dipendere da questo valore, e i test di integrazione ripristinano le impostazioni che modificano. *(The real DB's interval is 1 minute for testing, set by the user who will put it back to 10 from the console; nothing may depend on that value; integration tests restore any setting they change.)*
- Nessun `docker compose` sul main stack; verifica sullo stack isolato (`scripts/test-branch.sh`), che per questo ciclo non richiede migrazioni a mano. *(No `docker compose` on the main stack; verify on the isolated stack, which needs no manual migration this cycle.)*

Operational (project-wide, from `CLAUDE.md`): work in a worktree; copy the gitignored `.env` into it first; run repo scripts with Git Bash (`& "C:\Program Files\Git\bin\bash.exe" scripts/...`); commands below are PowerShell-safe. No migration this cycle (`026` already holds every table and setting used).

**Clarifications of the spec decided while planning** (reported back to the spec author; no spec edit needed):
1. **A fourth row status, `unprocessed` ("Not processed").** Spec §4 derives Error / Queued / Updated, but a code that was never processed and is not queued (actuals uploaded before 3c when the bootstrap did not run, or removed from the queue before its first run) fits none. Such rows show "Not processed"; the status filter keeps the spec's options (All / Queued / Error / Updated), so they appear under All. Precedence: `last_error` → error; else `queued_at` → queued; else `last_processed_at` → updated; else unprocessed. An errored code that was re-queued shows "Error" with a "(queued)" hint.
2. **403 test user.** `test-api.js` has no non-admin account (SEC-10 notes "non-admin → 403 requires a second user (manual)") and invites need an emailed token. `PJ-02` obtains a plain-user session by having the sysadmin demote the test admin to `user`, logging in, and immediately restoring `admin`; `requireAdmin` trusts the JWT role claim, so the suite's existing `adminCookie` keeps working. The stack is disposable (`run-tests.sh` uses a throw-away volume).
3. **Double-click guard.** Rows are replaced on every 15-second refresh, so a per-row `_loading` flag would be lost mid-action. The page uses one page-level `busyAction` guard: every action returns early while it is set and every action button is `:disabled="!!busyAction"` — the spec's "each button guarded, disabled while an action is in progress".
4. **409 text.** The page always shows the spec's sentence "A profile job is already running — try again in a moment." and, for Rebuild all / Process, appends that the codes stay queued (the routes return the same text). `POST /run` keeps its existing message unchanged.
5. **List field names** (spec §9 left them to the plan): each `projects[]` row is `{ project_code, project_name, row_count, resource_count, queued_at, last_processed_at, last_error, status }`; runs rows are `{ id, started_at, finished_at, trigger_type, projects, resources, error }` (`id` is a BIGSERIAL, so it arrives as a string). The Timesheets badge is **hidden** when the queue is empty.
6. `resources` in a run result is the number of (resource, code) contributions rebuilt, not distinct people; the page words it as "resource contributions".

## Review Focus

1. **Project codes with dots, spaces or other URL-significant characters in `:code`** (real codes look like `HITA.000001586.001`): the page must `encodeURIComponent` them and the API must process/remove exactly that code. Pinned by `PJ-09` (Task 3) and `encodeURIComponent` in every per-row call (Task 5).
2. **A code present only in `profile_project_state`** (actuals deleted, project deleted): it must be listed with its code as name and 0 rows, and remain processable/removable. Pinned by `PJ-10` (Task 3).
3. **Settings sent with the wrong JSON types** — `"10"`, `"true"`, `1`, `10.5`, `null`, missing fields, 0, 1441 — must be 400 and leave the stored values alone; 1 and 1440 must be accepted. Pinned by `jobSettingsError` tests (Task 1) and `PJ-04`/`PJ-05` (Task 3).
4. **Two actions at once / an action while the worker is mid-run**: each must answer 200 or 409 with the "already running … queued" text — never 500, never a duplicate run. Pinned by `PJ-13` (Task 3, tolerant of timing) and by the `busyAction` guard (Task 5).
5. **Next-run arithmetic at the edges**: last run in the future (clock skew), exactly at the interval boundary, intervals 1 and 1440, an invalid timestamp, and agreement with the worker's own `isJobDue`. Pinned by `nextRunInfo` tests (Task 1).

---

### Task 1: Pure helpers in `job-schedule.js`

**Files:**
- Modify: `api/src/lib/job-schedule.js` (whole file shown below — existing functions unchanged)
- Test: `api/src/lib/job-schedule.test.js` (extend)

**Interfaces:**
- Consumes: existing `parseJobSettings(rows) → { enabled: boolean, intervalMin: number }` and `isJobDue(settings, lastRunStartedAt, now)`.
- Produces (all pure, CommonJS exports of `api/src/lib/job-schedule.js`):
  - `composeRunError(errors: string[]|undefined): string|null` — `errors.join('; ').slice(0, 500)`, `null` when empty. The single composition used by `recordRun` and the throttle.
  - `shouldRecordRun({ trigger: 'scheduled'|'manual'|'bootstrap', projects: number, errors: string[], lastRunError: string|null|undefined }): boolean` — manual → true; projects > 0 → true; no errors → false; otherwise `composeRunError(errors) !== (lastRunError ?? null)`.
  - `nextRunInfo(settings: {enabled, intervalMin}, lastRunStartedAt: Date|string|null, now = new Date()): { state: 'paused'|'due'|'scheduled', nextRunAt: Date|null }` — disabled → paused; null/invalid last run or `last + interval <= now` → due; else scheduled at `last + interval`.
  - `jobSettingsError(body): string|null` — null when `body` is a plain object with `enabled` a boolean and `intervalMin` an integer 1–1440 (JSON number type only).
  - `deriveProjectStatus({ queued_at, last_processed_at, last_error }): 'error'|'queued'|'updated'|'unprocessed'`.

- [ ] **Step 1: Write the failing tests**

In `api/src/lib/job-schedule.test.js` replace the require line

```js
const { parseJobSettings, isJobDue } = require('./job-schedule');
```

with

```js
const {
  parseJobSettings, isJobDue, composeRunError, shouldRecordRun, nextRunInfo, jobSettingsError, deriveProjectStatus,
} = require('./job-schedule');
```

and append at the end of the file:

```js
// ── Cycle 3d: run-history throttle ─────────────────────────────────────────────

test('composeRunError: joins with "; ", caps at 500 characters, null when there is no error', () => {
  assert.equal(composeRunError([]), null);
  assert.equal(composeRunError(undefined), null);
  assert.equal(composeRunError(['P1: boom', 'P2: bang']), 'P1: boom; P2: bang');
  assert.equal(composeRunError(['x'.repeat(600)]).length, 500);
});

test('shouldRecordRun: manual runs are always recorded', () => {
  assert.equal(shouldRecordRun({ trigger: 'manual', projects: 0, errors: [], lastRunError: null }), true);
  assert.equal(shouldRecordRun({ trigger: 'manual', projects: 0, errors: ['P1: boom'], lastRunError: 'P1: boom' }), true);
});

test('shouldRecordRun: a scheduled or bootstrap run that processed something is recorded', () => {
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 2, errors: [], lastRunError: null }), true);
  assert.equal(shouldRecordRun({ trigger: 'bootstrap', projects: 1, errors: ['P1: boom'], lastRunError: 'P1: boom' }), true);
});

test('shouldRecordRun: an idle scheduled/bootstrap run (no work, no error) is not recorded', () => {
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: [], lastRunError: null }), false);
  assert.equal(shouldRecordRun({ trigger: 'bootstrap', projects: 0, errors: [], lastRunError: 'old' }), false);
});

test('shouldRecordRun: the same error as the last recorded run is skipped (throttle)', () => {
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom'], lastRunError: 'P1: boom' }), false);
  assert.equal(shouldRecordRun({ trigger: 'bootstrap', projects: 0, errors: ['P1: boom'], lastRunError: 'P1: boom' }), false);
});

test('shouldRecordRun: a different error, or no previous run, is recorded', () => {
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom'], lastRunError: 'P1: other' }), true);
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom'], lastRunError: null }), true);
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom'], lastRunError: undefined }), true);
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: ['P1: boom', 'P2: bang'], lastRunError: 'P1: boom' }), true);
});

test('shouldRecordRun: compares the composed string (joined and capped), not the raw errors', () => {
  const long = ['P1: ' + 'x'.repeat(600)];
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: long, lastRunError: composeRunError(long) }), false);
  assert.equal(shouldRecordRun({ trigger: 'scheduled', projects: 0, errors: long, lastRunError: long[0] }), true);
});

// ── Cycle 3d: next run estimate ────────────────────────────────────────────────

const S = (enabled, intervalMin) => ({ enabled, intervalMin });
const NOW = new Date('2026-09-26T10:00:00Z');
const at = iso => new Date(iso);

test('nextRunInfo: a disabled job is paused, whatever the last run', () => {
  assert.deepEqual(nextRunInfo(S(false, 10), null, NOW), { state: 'paused', nextRunAt: null });
  assert.deepEqual(nextRunInfo(S(false, 10), at('2026-09-26T09:59:00Z'), NOW), { state: 'paused', nextRunAt: null });
});

test('nextRunInfo: never ran (null, undefined, invalid timestamp) → due', () => {
  assert.deepEqual(nextRunInfo(S(true, 10), null, NOW), { state: 'due', nextRunAt: null });
  assert.deepEqual(nextRunInfo(S(true, 10), undefined, NOW), { state: 'due', nextRunAt: null });
  assert.deepEqual(nextRunInfo(S(true, 10), 'not-a-date', NOW), { state: 'due', nextRunAt: null });
});

test('nextRunInfo: overdue, and exactly at the boundary, → due', () => {
  assert.deepEqual(nextRunInfo(S(true, 10), at('2026-09-26T09:00:00Z'), NOW), { state: 'due', nextRunAt: null });
  assert.deepEqual(nextRunInfo(S(true, 10), at('2026-09-26T09:50:00Z'), NOW), { state: 'due', nextRunAt: null });
});

test('nextRunInfo: not yet due → scheduled at last run + interval (ISO strings accepted)', () => {
  const r = nextRunInfo(S(true, 10), '2026-09-26T09:55:00.000Z', NOW);
  assert.equal(r.state, 'scheduled');
  assert.equal(r.nextRunAt.toISOString(), '2026-09-26T10:05:00.000Z');
});

test('nextRunInfo: interval boundaries 1 and 1440, and a non-standard interval', () => {
  assert.equal(nextRunInfo(S(true, 1), at('2026-09-26T09:59:30Z'), NOW).nextRunAt.toISOString(), '2026-09-26T10:00:30.000Z');
  assert.equal(nextRunInfo(S(true, 1), at('2026-09-26T09:59:00Z'), NOW).state, 'due');
  assert.equal(nextRunInfo(S(true, 1440), at('2026-09-25T10:00:01Z'), NOW).nextRunAt.toISOString(), '2026-09-26T10:00:01.000Z');
  assert.equal(nextRunInfo(S(true, 1440), at('2026-09-25T10:00:00Z'), NOW).state, 'due');
  assert.equal(nextRunInfo(S(true, 7), at('2026-09-26T09:58:00Z'), NOW).nextRunAt.toISOString(), '2026-09-26T10:05:00.000Z');
});

test('nextRunInfo: a last run in the future (clock skew) stays scheduled at last + interval', () => {
  const r = nextRunInfo(S(true, 10), at('2026-09-26T10:05:00Z'), NOW);
  assert.equal(r.state, 'scheduled');
  assert.equal(r.nextRunAt.toISOString(), '2026-09-26T10:15:00.000Z');
});

test('nextRunInfo agrees with isJobDue (due ⇔ isJobDue) across the boundary', () => {
  const s = S(true, 10);
  for (const offsetSec of [-60, 0, 1, 599, 600, 601, 3600]) {
    const last = new Date(NOW.getTime() - offsetSec * 1000);
    assert.equal(nextRunInfo(s, last, NOW).state === 'due', isJobDue(s, last, NOW), `offset ${offsetSec}s`);
  }
});

// ── Cycle 3d: settings validation and row status ───────────────────────────────

test('jobSettingsError: accepts booleans and integers 1..1440', () => {
  assert.equal(jobSettingsError({ enabled: true, intervalMin: 10 }), null);
  assert.equal(jobSettingsError({ enabled: false, intervalMin: 1 }), null);
  assert.equal(jobSettingsError({ enabled: true, intervalMin: 1440 }), null);
});

test('jobSettingsError: rejects every other type or value', () => {
  const bad = [
    undefined, null, 'x', [], [true, 10],
    {}, { enabled: true }, { intervalMin: 10 },
    { enabled: 'true', intervalMin: 10 }, { enabled: 'false', intervalMin: 10 }, { enabled: 1, intervalMin: 10 },
    { enabled: null, intervalMin: 10 },
    { enabled: true, intervalMin: '10' }, { enabled: true, intervalMin: 10.5 }, { enabled: true, intervalMin: 0 },
    { enabled: true, intervalMin: 1441 }, { enabled: true, intervalMin: -1 }, { enabled: true, intervalMin: null },
    { enabled: true, intervalMin: true },
  ];
  for (const body of bad) assert.equal(typeof jobSettingsError(body), 'string', `body ${JSON.stringify(body)}`);
});

test('deriveProjectStatus: error beats queued beats updated; never processed and not queued → unprocessed', () => {
  assert.equal(deriveProjectStatus({ queued_at: 'x', last_processed_at: 'y', last_error: 'boom' }), 'error');
  assert.equal(deriveProjectStatus({ queued_at: null, last_processed_at: null, last_error: 'boom' }), 'error');
  assert.equal(deriveProjectStatus({ queued_at: 'x', last_processed_at: 'y', last_error: null }), 'queued');
  assert.equal(deriveProjectStatus({ queued_at: 'x', last_processed_at: null, last_error: null }), 'queued');
  assert.equal(deriveProjectStatus({ queued_at: null, last_processed_at: 'y', last_error: null }), 'updated');
  assert.equal(deriveProjectStatus({ queued_at: null, last_processed_at: null, last_error: null }), 'unprocessed');
  assert.equal(deriveProjectStatus({}), 'unprocessed');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test api/src/lib/job-schedule.test.js`
Expected: FAIL — `composeRunError is not a function` (and the other new names); the 8 existing tests still pass.

- [ ] **Step 3: Write the implementation (replace the whole file)**

`api/src/lib/job-schedule.js`:

```js
// Pure scheduling helpers for the profile worker (Cycle 3c) and its console (Cycle 3d).
// No DB, no timers.
const DEFAULT_INTERVAL_MIN = 10;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 1440;
const MAX_ERROR_LENGTH = 500;

// rows: [{ key, value }] read from app_settings.
function parseJobSettings(rows) {
  const map = {};
  for (const r of rows || []) map[r.key] = r.value;
  let intervalMin = parseInt(map.profile_job_interval_min, 10);
  if (!Number.isFinite(intervalMin) || intervalMin < MIN_INTERVAL || intervalMin > MAX_INTERVAL) intervalMin = DEFAULT_INTERVAL_MIN;
  const enabled = String(map.profile_job_enabled ?? 'true').trim().toLowerCase() !== 'false';
  return { enabled, intervalMin };
}

// Is a scheduled run due? A disabled job never is; a job that never ran always is.
function isJobDue(settings, lastRunStartedAt, now = new Date()) {
  if (!settings.enabled) return false;
  if (!lastRunStartedAt) return true;
  return now.getTime() - new Date(lastRunStartedAt).getTime() >= settings.intervalMin * 60000;
}

// The error text stored in profile_job_runs.error (null when the run had no error).
function composeRunError(errors) {
  return errors && errors.length ? errors.join('; ').slice(0, MAX_ERROR_LENGTH) : null;
}

// Should this run get a profile_job_runs row? Manual runs always; scheduled/bootstrap runs only
// when they processed something, or failed with an error DIFFERENT from the last recorded run
// (a permanently failing code would otherwise flush the 50-row history, one row per interval).
function shouldRecordRun({ trigger, projects, errors, lastRunError }) {
  if (trigger === 'manual') return true;
  if (projects > 0) return true;
  const composed = composeRunError(errors);
  if (!composed) return false;
  return composed !== (lastRunError ?? null);
}

// When will the worker next start a scheduled run? Same rule as isJobDue: due once
// now >= last + interval. lastRunStartedAt is the worker's in-memory value (null after a restart).
function nextRunInfo(settings, lastRunStartedAt, now = new Date()) {
  if (!settings || !settings.enabled) return { state: 'paused', nextRunAt: null };
  const last = lastRunStartedAt ? new Date(lastRunStartedAt) : null;
  if (!last || Number.isNaN(last.getTime())) return { state: 'due', nextRunAt: null };
  const next = new Date(last.getTime() + settings.intervalMin * 60000);
  if (next.getTime() <= now.getTime()) return { state: 'due', nextRunAt: null };
  return { state: 'scheduled', nextRunAt: next };
}

// Validates the PUT /api/profile-jobs/settings body. Strict JSON types: no numeric strings,
// no "true"/"false" strings, no floats. Returns an error message or null.
function jobSettingsError(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Body must be an object with enabled and intervalMin';
  }
  if (typeof body.enabled !== 'boolean') return 'enabled must be true or false';
  const n = body.intervalMin;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < MIN_INTERVAL || n > MAX_INTERVAL) {
    return `intervalMin must be a whole number of minutes between ${MIN_INTERVAL} and ${MAX_INTERVAL}`;
  }
  return null;
}

// Row status for the console list.
function deriveProjectStatus(row) {
  if (row.last_error) return 'error';
  if (row.queued_at) return 'queued';
  if (row.last_processed_at) return 'updated';
  return 'unprocessed';
}

module.exports = {
  DEFAULT_INTERVAL_MIN, parseJobSettings, isJobDue,
  composeRunError, shouldRecordRun, nextRunInfo, jobSettingsError, deriveProjectStatus,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test api/src/lib/job-schedule.test.js`
Expected: PASS (8 existing + 15 new).

Then all backend pure tests: `node --test (Get-ChildItem api/src/lib/*.test.js | ForEach-Object { $_.FullName })` — expected: all green.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/job-schedule.js api/src/lib/job-schedule.test.js
git commit -m "feat: pure helpers for the profile job console (next run, run throttle, settings validation)"
```

---

### Task 2: Engine and worker — single-code runs, run throttle, queue helpers, worker getters

**Files:**
- Modify: `api/src/services/profile-engine.js`
- Modify: `api/src/services/profile-worker.js`

**Interfaces:**
- Consumes (Task 1): `composeRunError(errors)`, `shouldRecordRun({ trigger, projects, errors, lastRunError })`.
- Produces:
  - `processQueue(trigger = 'scheduled', opts = {}): Promise<{ skipped, projects, resources, errors }>` — `opts.only` (string) restricts the claim to that one code (same advisory lock, one transaction per code, a failed code is excluded for the rest of the run); a run with `only` is always recorded as `manual`. Scheduled/bootstrap runs are recorded per `shouldRecordRun`, comparing with `SELECT error FROM profile_job_runs ORDER BY id DESC LIMIT 1`.
  - `dequeueProject(code: string): Promise<boolean>` — `queued_at = NULL` for that code; `false` when the code is not tracked in `profile_project_state`. Does not touch contributions or profiles.
  - `isKnownProjectCode(code: string): Promise<boolean>` — true when the code has actuals in `timesheets` or a row in `profile_project_state`.
  - `profile-worker.js`: `getLastRunStartedAt(): Date|null` (the worker's in-memory last scheduled/bootstrap start; manual runs never move it) and `readSettings(): Promise<{ enabled, intervalMin }>` (existing function, now exported).

**How this task is verified:** no new test file — the pure throttle is pinned by Task 1, and the new engine paths (`only`, `dequeueProject`, `isKnownProjectCode`) are exercised end-to-end through the routes by Task 3's `PJ-06`…`PJ-13`. This task ends green when the Task 1 unit tests and the **whole existing integration suite** (`PE-01`…`PE-14`) still pass. The engine-level throttle (two identical failing scheduled runs → one row) is not reproducible through HTTP (a DB fault cannot be injected); the reviewer reads the code path deliberately.

- [ ] **Step 1: Import the pure helpers (`profile-engine.js`)**

Replace

```js
const { buildContributions, aggregateProfile } = require('../lib/resource-profile');
```

with

```js
const { buildContributions, aggregateProfile } = require('../lib/resource-profile');
const { composeRunError, shouldRecordRun } = require('../lib/job-schedule');
```

- [ ] **Step 2: Add the queue helpers**

Replace

```js
const enqueueAllQuiet = () => quiet('enqueueAll', enqueueAll);
```

with

```js
const enqueueAllQuiet = () => quiet('enqueueAll', enqueueAll);

// Take one code out of the queue without touching its contributions or anyone's profile.
// Waits for a row lock if that code is being processed right now. false = code not tracked.
async function dequeueProject(code) {
  const { rowCount } = await query(
    'UPDATE profile_project_state SET queued_at = NULL WHERE project_code = $1', [code]);
  return rowCount > 0;
}

// Is this a code the engine knows about (actuals uploaded, or already tracked)?
async function isKnownProjectCode(code) {
  const { rows } = await query(
    `SELECT EXISTS (SELECT 1 FROM timesheets WHERE project_code = $1)
         OR EXISTS (SELECT 1 FROM profile_project_state WHERE project_code = $1) AS known`,
    [code]
  );
  return rows[0].known === true;
}
```

- [ ] **Step 3: Restrict the claim when a single code is requested**

Replace

```js
async function processNext(exclude) {
```

with

```js
async function processNext(exclude, only = null) {
```

and replace

```js
    const claim = await client.query(
      `UPDATE profile_project_state SET queued_at = NULL
       WHERE project_code = (SELECT project_code FROM profile_project_state
                             WHERE queued_at IS NOT NULL AND project_code <> ALL($1::text[])
                             ORDER BY queued_at, project_code FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING project_code`,
      [exclude]
    );
```

with

```js
    const claim = await client.query(
      `UPDATE profile_project_state SET queued_at = NULL
       WHERE project_code = (SELECT project_code FROM profile_project_state
                             WHERE queued_at IS NOT NULL AND project_code <> ALL($1::text[])
                               AND ($2::text IS NULL OR project_code = $2)
                             ORDER BY queued_at, project_code FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING project_code`,
      [exclude, only]
    );
```

- [ ] **Step 4: Compose the stored error with the shared helper**

In `recordRun`, replace

```js
    [startedAt, trigger, projects, resources, errors.length ? errors.join('; ').slice(0, 500) : null]
```

with

```js
    [startedAt, trigger, projects, resources, composeRunError(errors)]
```

- [ ] **Step 5: `processQueue(trigger, opts)` with `only` and the throttle**

Replace

```js
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
```

with

```js
// Drain the queue. A session-level advisory lock keeps two runs (or two API instances) apart.
// opts.only = one project code: only that code is claimed (the console's "Process"); such a run is
// always a recorded manual run. Recording rules: see shouldRecordRun (lib/job-schedule.js).
async function processQueue(trigger = 'scheduled', opts = {}) {
  const only = opts.only ? String(opts.only).trim() : null;
  const kind = only ? 'manual' : trigger;
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
      const r = await processNext(failed, only);
      if (!r) break;
      if (r.error) { failed.push(r.code); errors.push(`${r.code}: ${r.error}`); continue; }
      projects += 1;
      resources += r.resources;
    }
    let lastRunError = null;
    if (errors.length && projects === 0 && kind !== 'manual') {
      const last = await query('SELECT error FROM profile_job_runs ORDER BY id DESC LIMIT 1');
      lastRunError = last.rows[0] ? last.rows[0].error : null;
    }
    if (shouldRecordRun({ trigger: kind, projects, errors, lastRunError })) {
      await recordRun(kind, startedAt, projects, resources, errors);
    }
```

(the `if (projects > 0) { ... profile_computed_at ... }` block, the `return`, and the `finally` that follow stay exactly as they are).

- [ ] **Step 6: Export the new engine functions**

Replace

```js
module.exports = {
  enqueueProjects, enqueueAll, enqueueProjectsQuiet, enqueueAllQuiet, processQueue,
};
```

with

```js
module.exports = {
  enqueueProjects, enqueueAll, enqueueProjectsQuiet, enqueueAllQuiet, processQueue,
  dequeueProject, isKnownProjectCode,
};
```

- [ ] **Step 7: Worker getters (`profile-worker.js`)**

Replace

```js
module.exports = { start };
```

with

```js
// For the job console (same process as the API): the last scheduled/bootstrap start, in memory
// only — null after a restart. Manual runs never set it, so they do not move the next run.
function getLastRunStartedAt() {
  return lastRunStartedAt;
}

module.exports = { start, readSettings, getLastRunStartedAt };
```

- [ ] **Step 8: Run the suites**

Run: `node --test (Get-ChildItem api/src/lib/*.test.js | ForEach-Object { $_.FullName })` — expected: all green.
Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh` — expected: the whole existing suite green (`PE-01`…`PE-14`, `PE-11b` included). If a `PE-*` test fails, the change to `processQueue`'s default path is wrong — with no `opts`, `only` is `null`, the `$2::text IS NULL` branch keeps the old claim, and a manual run is still always recorded.

- [ ] **Step 9: Commit**

```bash
git add api/src/services/profile-engine.js api/src/services/profile-worker.js
git commit -m "feat: single-code profile runs, repeated-error throttle, queue helpers and worker getters"
```

---

### Task 3: Console API routes + integration tests `PJ-*`

**Files:**
- Modify: `api/src/routes/profile-jobs.js` (whole file shown below; `POST /run` unchanged)
- Modify: `test-api.js` (helpers + `testProfileJobsConsole()` before the `// ── Main` block; call in `main()`)

**Interfaces:**
- Consumes: Task 1 `nextRunInfo`, `jobSettingsError`, `deriveProjectStatus`; Task 2 `processQueue(trigger, { only })`, `enqueueAll()`, `enqueueProjects(codes)`, `dequeueProject(code)`, `isKnownProjectCode(code)`, `readSettings()`, `getLastRunStartedAt()`; `query` from `api/src/db/client.js`; `req.user.id` (JWT payload `{ id, email, role }`).
- Produces (HTTP, all `requireAuth, requireAdmin` via the existing `router.use`):
  - `GET /api/profile-jobs` → `{ settings: { enabled, intervalMin }, schedule: { state: 'paused'|'due'|'scheduled', lastRunAt: ISO|null, nextRunAt: ISO|null }, queuedCount: number, projects: [{ project_code, project_name, row_count, resource_count, queued_at, last_processed_at, last_error, status: 'error'|'queued'|'updated'|'unprocessed' }] }` (ordered by code).
  - `PUT /api/profile-jobs/settings` body `{ enabled: boolean, intervalMin: integer 1–1440 }` → 200 `{ enabled, intervalMin }` (read back from `app_settings`), 400 `{ error }` otherwise.
  - `POST /api/profile-jobs/rebuild` → 200 `{ ok: true, projects, resources, errors }`; 409 `{ error }` (codes stay queued).
  - `POST /api/profile-jobs/projects/:code/process` → 200 same shape; 400 invalid code; 404 unknown code; 409 busy (code stays queued).
  - `DELETE /api/profile-jobs/projects/:code/queue` → 200 `{ ok: true }`; 400 invalid code; 404 not tracked.
  - `GET /api/profile-jobs/runs` → `[{ id, started_at, finished_at, trigger_type, projects, resources, error }]`, ≤ 50, newest first.
  - Test helpers in `test-api.js`: `getPlainUserCookie()`, `getConsole()`, `postRetry(path)`.

- [ ] **Step 1: Write the failing integration tests**

In `test-api.js`, insert the following block immediately **before** the line `// ── Main ──────────────────────────────────────────────────────────────────────`:

```js
// ── Profile Jobs Console (2026-09, Cycle 3d) ────────────────────────────────────

// A plain-user session for the 403 checks. The suite has no non-admin account and invites need an
// emailed token, so the sysadmin demotes the test admin to 'user', we log in (JWT role = user) and
// the admin is promoted back at once. requireAdmin trusts the JWT role claim, so the existing
// adminCookie keeps working throughout; the run-tests.sh stack is disposable.
async function getPlainUserCookie() {
  const me = await api('GET', '/api/auth/me', null, adminCookie);
  const adminId = me.data?.id;
  if (!adminId || !sysadminCookie) return '';
  let cookie = '';
  try {
    const down = await api('PATCH', `/api/users/${adminId}`, { role: 'user' }, sysadminCookie);
    if (down.status !== 200) return '';
    const login = await api('POST', '/api/auth/login', { email: EMAIL, password: PASS });
    cookie = login.status === 200 && login.data?.role === 'user' ? extractCookie(login.headers) : '';
  } finally {
    const back = await api('PATCH', `/api/users/${adminId}`, { role: 'admin' }, sysadminCookie);
    ok(back.status === 200 && back.data?.role === 'admin', 'PJ-setup the test admin is restored to role admin');
  }
  return cookie;
}

// GET the console state, with the project rows indexed by code.
async function getConsole() {
  const r = await api('GET', '/api/profile-jobs', null, adminCookie);
  const byCode = {};
  for (const p of r.data?.projects || []) byCode[p.project_code] = p;
  return { status: r.status, data: r.data, byCode };
}

// POST with the same 409 retry as runProfileJobs (a worker run may briefly hold the lock).
async function postRetry(path) {
  for (let i = 0; i < 10; i++) {
    const r = await api('POST', path, null, adminCookie);
    if (r.status !== 409) return r;
    await new Promise(res => setTimeout(res, 500));
  }
  return { status: 409, data: null };
}

async function testProfileJobsConsole() {
  section('Profile Jobs Console');

  const routes = [
    ['GET', '/api/profile-jobs', null],
    ['PUT', '/api/profile-jobs/settings', { enabled: true, intervalMin: 10 }],
    ['POST', '/api/profile-jobs/rebuild', null],
    ['POST', '/api/profile-jobs/projects/NOPE/process', null],
    ['DELETE', '/api/profile-jobs/projects/NOPE/queue', null],
    ['GET', '/api/profile-jobs/runs', null],
  ];
  for (const [m, p, b] of routes) {
    ok((await api(m, p, b)).status === 401, `PJ-01 ${m} ${p} without auth → 401`);
  }
  const userCookie = await getPlainUserCookie();
  ok(!!userCookie, 'PJ-02 setup: a plain-user session was obtained');
  if (userCookie) {
    for (const [m, p, b] of routes) {
      ok((await api(m, p, b, userCookie)).status === 403, `PJ-02 ${m} ${p} as a plain user → 403`);
    }
  }

  // PJ-03: shape of the console state
  const g = await getConsole();
  const d = g.data;
  ok(g.status === 200 && typeof d?.settings?.enabled === 'boolean' && Number.isInteger(d?.settings?.intervalMin)
      && ['paused', 'due', 'scheduled'].includes(d?.schedule?.state)
      && 'lastRunAt' in (d?.schedule || {}) && 'nextRunAt' in (d?.schedule || {})
      && Number.isInteger(d?.queuedCount) && Array.isArray(d?.projects),
    'PJ-03 GET /api/profile-jobs → settings, schedule { state, lastRunAt, nextRunAt }, queuedCount, projects');
  ok(d?.queuedCount === (d?.projects || []).filter(p => p.queued_at).length,
    'PJ-03 queuedCount equals the number of rows with queued_at');
  const sample = (d?.projects || [])[0];
  ok(!sample || ['project_code', 'project_name', 'row_count', 'resource_count', 'queued_at', 'last_processed_at', 'last_error', 'status']
      .every(k => k in sample),
    'PJ-03 each project row carries code, name, row/resource counts, queue state, last error and status');

  const original = d?.settings
    ? { enabled: d.settings.enabled, intervalMin: d.settings.intervalMin }
    : { enabled: true, intervalMin: 10 };

  try {
    // PJ-04: strict validation (Review Focus 3)
    const bad = [
      [{ enabled: 'true', intervalMin: 10 }, 'enabled as the string "true"'],
      [{ enabled: 1, intervalMin: 10 }, 'enabled as a number'],
      [{ enabled: true, intervalMin: '10' }, 'intervalMin as a numeric string'],
      [{ enabled: true, intervalMin: 10.5 }, 'a non-integer intervalMin'],
      [{ enabled: true, intervalMin: 0 }, 'intervalMin 0'],
      [{ enabled: true, intervalMin: 1441 }, 'intervalMin 1441'],
      [{ enabled: true, intervalMin: null }, 'intervalMin null'],
      [{ enabled: true }, 'intervalMin missing'],
      [{ intervalMin: 10 }, 'enabled missing'],
      [{}, 'an empty body'],
    ];
    for (const [body, label] of bad) {
      ok((await api('PUT', '/api/profile-jobs/settings', body, adminCookie)).status === 400, `PJ-04 PUT settings with ${label} → 400`);
    }
    ok(JSON.stringify((await getConsole()).data?.settings) === JSON.stringify(original),
      'PJ-04 rejected PUTs leave the stored settings unchanged');

    // PJ-05: canonical writes at both bounds; switching off pauses the schedule. The worker stays OFF
    // for the rest of this section so no scheduled run can race the assertions below.
    let w = await api('PUT', '/api/profile-jobs/settings', { enabled: true, intervalMin: 1440 }, adminCookie);
    ok(w.status === 200 && w.data?.enabled === true && w.data?.intervalMin === 1440,
      'PJ-05 PUT { enabled: true, intervalMin: 1440 } → 200 and echoes the saved settings (upper bound)');
    w = await api('PUT', '/api/profile-jobs/settings', { enabled: false, intervalMin: 1 }, adminCookie);
    ok(w.status === 200 && w.data?.enabled === false && w.data?.intervalMin === 1,
      'PJ-05 PUT { enabled: false, intervalMin: 1 } → 200 (lower bound)');
    const g2 = await getConsole();
    ok(g2.data?.settings?.enabled === false && g2.data?.settings?.intervalMin === 1 && g2.data?.schedule?.state === 'paused'
        && g2.data?.schedule?.nextRunAt === null,
      'PJ-05 GET reads the values back (enabled stored as "false") and the schedule is paused');
    await runProfileJobs();   // wait out a scheduled run that may have started before the switch-off

    // PJ-06 / PJ-07 / PJ-13 need two queued codes with actuals
    const f = await profileFixture();
    ok(f.ok, 'PJ-setup resource, two projects and a Market value created');
    if (f.ok) {
      const { code1, code2, person, resId } = f;
      await runProfileJobs();   // creating the projects queued their codes: drain them first
      const up = await uploadCsv('/api/timesheets/upload', profileCsv([
        [code1, '2026-01-15', person, 4],
        [code2, '2026-02-10', person, 3],
      ]), adminCookie);
      ok(up.status === 201, `PJ-06 upload actuals for two codes → 201 (got ${up.status})`);
      let c = await getConsole();
      ok(!!c.byCode[code1]?.queued_at && !!c.byCode[code2]?.queued_at, 'PJ-06 both uploaded codes are queued');

      const pr = await postRetry(`/api/profile-jobs/projects/${encodeURIComponent(code1)}/process`);
      ok(pr.status === 200 && pr.data?.ok === true && pr.data?.projects === 1 && pr.data?.errors?.length === 0,
        `PJ-06 POST .../projects/:code/process → 200, exactly one project processed (got ${pr.status}, ${pr.data?.projects})`);
      c = await getConsole();
      ok(c.byCode[code1]?.queued_at === null && !!c.byCode[code1]?.last_processed_at && c.byCode[code1]?.status === 'updated',
        'PJ-06 the processed code left the queue and is "updated"');
      ok(!!c.byCode[code2]?.queued_at && c.byCode[code2]?.status === 'queued', 'PJ-06 the other code is still queued');
      ok(c.byCode[code1]?.row_count === 1 && c.byCode[code1]?.resource_count === 1,
        'PJ-06 list counts for the processed code: 1 actuals row, 1 matched resource');
      const runs1 = await api('GET', '/api/profile-jobs/runs', null, adminCookie);
      ok(runs1.data?.[0]?.trigger_type === 'manual' && runs1.data[0].projects === 1,
        'PJ-06 the single-code run is recorded as manual with 1 project');

      // PJ-07: removing from the queue leaves the computed profile alone
      const before = await getProfile(resId);
      const rm = await api('DELETE', `/api/profile-jobs/projects/${encodeURIComponent(code2)}/queue`, null, adminCookie);
      ok(rm.status === 200 && rm.data?.ok === true, 'PJ-07 DELETE .../projects/:code/queue → 200');
      c = await getConsole();
      ok(c.byCode[code2]?.queued_at === null, 'PJ-07 the code is no longer queued');
      const after = await getProfile(resId);
      ok(JSON.stringify(after) === JSON.stringify(before) && after?.profile?.totals?.hours === 4,
        'PJ-07 the profile is untouched (still 4 h, from the processed code only)');

      // PJ-13: concurrent actions never fail with 500 (Review Focus 4; timing-tolerant)
      await uploadCsv(`/api/timesheets/upload?projectCode=${code1}`, profileCsv([[code1, '2026-03-01', person, 2]]), adminCookie);
      const [ra, rb] = await Promise.all([
        api('POST', '/api/profile-jobs/rebuild', null, adminCookie),
        api('POST', `/api/profile-jobs/projects/${encodeURIComponent(code1)}/process`, null, adminCookie),
      ]);
      const okOr409 = r => r.status === 200
        || (r.status === 409 && /already running/.test(r.data?.error || '') && /queued/.test(r.data?.error || ''));
      ok(okOr409(ra) && okOr409(rb),
        `PJ-13 concurrent rebuild + process → each 200, or 409 saying the job is running and the codes stay queued (got ${ra.status}/${rb.status})`);
      await runProfileJobs();   // whatever the race left queued
    }

    // PJ-08: code validation and unknown codes
    const unknown = `NOPE${Date.now()}`;
    ok((await api('POST', `/api/profile-jobs/projects/${unknown}/process`, null, adminCookie)).status === 404,
      'PJ-08 process an unknown code → 404');
    ok((await api('DELETE', `/api/profile-jobs/projects/${unknown}/queue`, null, adminCookie)).status === 404,
      'PJ-08 remove an unknown code from the queue → 404');
    ok((await getConsole()).byCode[unknown] === undefined, 'PJ-08 an unknown code is not added to the list');
    ok((await api('POST', '/api/profile-jobs/projects/%20%20/process', null, adminCookie)).status === 400,
      'PJ-08 a blank code → 400');
    ok((await api('DELETE', `/api/profile-jobs/projects/${'X'.repeat(101)}/queue`, null, adminCookie)).status === 400,
      'PJ-08 a code longer than 100 characters → 400');

    // PJ-09 / PJ-10: a code with dots and a space, then the same code once only profile_project_state knows it
    const oddTs = Date.now();
    const odd = `PJ.${oddTs} X.001`;
    const oddName = `__pj_odd_${oddTs}__`;
    const rp = await api('POST', '/api/projects', { name: oddName, code: odd }, adminCookie);   // creation queues the code
    const oddId = rp.data?.id;
    if (oddId) later('DELETE', `/api/projects/${oddId}`);
    ok(!!oddId, 'PJ-09 setup: a project whose code has dots and a space');
    if (oddId) {
      const pr = await postRetry(`/api/profile-jobs/projects/${encodeURIComponent(odd)}/process`);
      ok(pr.status === 200 && pr.data?.projects === 1, `PJ-09 process a URL-encoded code with dots and a space → 200, 1 project (got ${pr.status})`);
      let c = await getConsole();
      const row = c.byCode[odd];
      ok(row?.project_name === oddName && row?.row_count === 0 && row?.resource_count === 0 && row?.status === 'updated',
        'PJ-09 listed under its exact code, with the project name, 0 rows, status "updated"');

      ok((await api('DELETE', `/api/projects/${oddId}`, null, adminCookie)).status === 200,
        'PJ-10 setup: delete the project (no actuals) — the delete hook re-queues its code');
      c = await getConsole();
      const orphan = c.byCode[odd];
      ok(!!orphan && orphan.project_name === odd && orphan.row_count === 0 && !!orphan.queued_at,
        'PJ-10 a code known only to profile_project_state is listed with its code as name, 0 rows, queued');
      ok((await api('DELETE', `/api/profile-jobs/projects/${encodeURIComponent(odd)}/queue`, null, adminCookie)).status === 200,
        'PJ-10 the orphan code can be removed from the queue → 200');
      ok((await postRetry(`/api/profile-jobs/projects/${encodeURIComponent(odd)}/process`)).status === 200,
        'PJ-10 the orphan code can still be processed → 200');
    }

    // PJ-11: rebuild queues everything and drains it in one recorded manual run
    const runsBefore = await api('GET', '/api/profile-jobs/runs', null, adminCookie);
    const topBefore = Number(runsBefore.data?.[0]?.id ?? 0);
    const rbAll = await postRetry('/api/profile-jobs/rebuild');
    ok(rbAll.status === 200 && rbAll.data?.ok === true && rbAll.data.projects > 0 && rbAll.data.errors?.length === 0,
      `PJ-11 POST /rebuild → 200, projects processed, no errors (got ${rbAll.status})`);
    ok((await getConsole()).data?.queuedCount === 0, 'PJ-11 after a rebuild the queue is empty');
    const runsAfter = await api('GET', '/api/profile-jobs/runs', null, adminCookie);
    ok(Number(runsAfter.data?.[0]?.id) > topBefore && runsAfter.data[0].trigger_type === 'manual'
        && runsAfter.data[0].projects === rbAll.data?.projects,
      'PJ-11 the rebuild is recorded as a manual run with the same project count');

    // PJ-12: history is capped at 50, newest first (manual runs are always recorded)
    for (let i = 0; i < 51; i++) await runProfileJobs();
    const rr = (await api('GET', '/api/profile-jobs/runs', null, adminCookie)).data || [];
    ok(rr.length === 50 && rr.every((r, i) => i === 0 || Number(rr[i - 1].id) > Number(r.id)),
      `PJ-12 GET /runs → exactly 50 rows after 51 more runs, newest first (got ${rr.length})`);
    ok(['id', 'started_at', 'finished_at', 'trigger_type', 'projects', 'resources', 'error'].every(k => rr[0] && k in rr[0]),
      'PJ-12 run rows carry id, started_at, finished_at, trigger_type, projects, resources, error');
  } finally {
    const back = await api('PUT', '/api/profile-jobs/settings', original, adminCookie);
    ok(back.status === 200 && back.data?.enabled === original.enabled && back.data?.intervalMin === original.intervalMin,
      'PJ-cleanup the original worker settings are restored');
  }
}
```

In `main()`, replace

```js
    await testProfileEngineHooks();
```

with

```js
    await testProfileEngineHooks();
    await testProfileJobsConsole();
```

- [ ] **Step 2: Run the integration suite to verify the new tests fail**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: `PJ-01`/`PJ-02` pass already (the router-level `requireAuth, requireAdmin` answers 401/403 even for paths with no handler); `PJ-03` onwards FAIL (the routes answer 404 `Not found`). Every pre-existing test still passes.

- [ ] **Step 3: Write the routes (replace the whole file)**

`api/src/routes/profile-jobs.js`:

```js
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { query } = require('../db/client');
const {
  processQueue, enqueueAll, enqueueProjects, dequeueProject, isKnownProjectCode,
} = require('../services/profile-engine');
const { readSettings, getLastRunStartedAt } = require('../services/profile-worker');
const { nextRunInfo, jobSettingsError, deriveProjectStatus } = require('../lib/job-schedule');

const router = express.Router();

router.use(requireAuth, requireAdmin);

const BUSY = 'A profile job is already running — try again in a moment.';
const MAX_CODE_LENGTH = 100;
const MAX_RUNS = 50;

// One row per project code with actuals or tracked by the engine, in ONE query. This read is the
// only table access in this file that does not go through the engine (spec §7).
// Name: the code's OLDEST project (projects.code is not unique), else the code itself.
// row_count: actuals elements, guarded like the engine (non-array data counts 0).
const PROJECTS_SQL = `
  WITH codes AS (
    SELECT project_code FROM timesheets
    UNION
    SELECT project_code FROM profile_project_state
  ),
  ts AS (
    SELECT project_code,
           SUM(CASE WHEN jsonb_typeof(data) = 'array' THEN jsonb_array_length(data) ELSE 0 END)::int AS row_count
    FROM timesheets
    GROUP BY project_code
  ),
  pj AS (
    SELECT DISTINCT ON (code) code, name
    FROM projects
    WHERE code IS NOT NULL
    ORDER BY code, created_at, id
  ),
  rc AS (
    SELECT project_code, COUNT(DISTINCT resource_id)::int AS resource_count
    FROM resource_project_contributions
    GROUP BY project_code
  )
  SELECT c.project_code,
         COALESCE(pj.name, c.project_code) AS project_name,
         COALESCE(ts.row_count, 0)         AS row_count,
         COALESCE(rc.resource_count, 0)    AS resource_count,
         s.queued_at, s.last_processed_at, s.last_error
  FROM codes c
  LEFT JOIN ts ON ts.project_code = c.project_code
  LEFT JOIN pj ON pj.code = c.project_code
  LEFT JOIN rc ON rc.project_code = c.project_code
  LEFT JOIN profile_project_state s ON s.project_code = c.project_code
  ORDER BY c.project_code`;

// :code (already URL-decoded by Express) → trimmed code, or null when blank or too long.
function codeParam(req) {
  const code = String(req.params.code ?? '').trim();
  return code && code.length <= MAX_CODE_LENGTH ? code : null;
}

const runResult = r => ({ ok: true, projects: r.projects, resources: r.resources, errors: r.errors });

// GET /api/profile-jobs — settings, next-run estimate, queue size and the per-code list
router.get('/', async (req, res, next) => {
  try {
    const [settings, list] = await Promise.all([readSettings(), query(PROJECTS_SQL)]);
    const lastRunAt = getLastRunStartedAt();
    const info = nextRunInfo(settings, lastRunAt, new Date());
    const projects = list.rows.map(r => ({ ...r, status: deriveProjectStatus(r) }));
    res.json({
      settings,
      schedule: {
        state: info.state,
        lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
        nextRunAt: info.nextRunAt ? info.nextRunAt.toISOString() : null,
      },
      queuedCount: projects.filter(p => p.queued_at).length,
      projects,
    });
  } catch (err) { next(err); }
});

// PUT /api/profile-jobs/settings — { enabled: boolean, intervalMin: 1..1440 }, strict JSON types.
// The worker re-reads app_settings on every 60 s tick, so no restart is needed.
router.put('/settings', async (req, res, next) => {
  try {
    const error = jobSettingsError(req.body);
    if (error) return res.status(400).json({ error });
    const { enabled, intervalMin } = req.body;
    await query(
      `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES
         ('profile_job_enabled', $1, NOW(), $3),
         ('profile_job_interval_min', $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [enabled ? 'true' : 'false', String(intervalMin), req.user.id]
    );
    res.json(await readSettings());
  } catch (err) { next(err); }
});

// POST /api/profile-jobs/run — drain the profile queue now (also used by the tests).
// 409 when another run holds the lock.
router.post('/run', async (req, res, next) => {
  try {
    const r = await processQueue('manual');
    if (r.skipped) return res.status(409).json({ error: 'A profile job is already running' });
    res.json({ ok: true, projects: r.projects, resources: r.resources, errors: r.errors });
  } catch (err) { next(err); }
});

// POST /api/profile-jobs/rebuild — queue every code, then drain. On 409 the codes stay queued.
router.post('/rebuild', async (req, res, next) => {
  try {
    await enqueueAll();
    const r = await processQueue('manual');
    if (r.skipped) {
      return res.status(409).json({
        error: `${BUSY} All project codes have been queued and will be processed by the running job or the next one.`,
      });
    }
    res.json(runResult(r));
  } catch (err) { next(err); }
});

// POST /api/profile-jobs/projects/:code/process — queue and process only this code.
router.post('/projects/:code/process', async (req, res, next) => {
  try {
    const code = codeParam(req);
    if (!code) return res.status(400).json({ error: 'Invalid project code' });
    if (!await isKnownProjectCode(code)) return res.status(404).json({ error: 'Project code not found' });
    await enqueueProjects([code]);
    const r = await processQueue('manual', { only: code });
    if (r.skipped) {
      return res.status(409).json({
        error: `${BUSY} This project code has been queued and will be processed by the running job or the next one.`,
      });
    }
    res.json(runResult(r));
  } catch (err) { next(err); }
});

// DELETE /api/profile-jobs/projects/:code/queue — take the code out of the queue; the profile
// already computed does not change until the code is processed again.
router.delete('/projects/:code/queue', async (req, res, next) => {
  try {
    const code = codeParam(req);
    if (!code) return res.status(400).json({ error: 'Invalid project code' });
    if (!await dequeueProject(code)) return res.status(404).json({ error: 'Project code not tracked' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/profile-jobs/runs — the latest runs, newest first
router.get('/runs', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, started_at, finished_at, trigger_type, projects, resources, error
       FROM profile_job_runs ORDER BY id DESC LIMIT $1`,
      [MAX_RUNS]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 4: Run the integration suite to verify it passes**

Run: `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh`
Expected: every `PJ-*` passes (including `PJ-setup` and `PJ-cleanup`) and the whole suite is green. If `PJ-06`'s "exactly one project processed" fails with `projects === 0`, a scheduled run processed the code between upload and process — check that `PJ-05` really switched the worker off and that `runProfileJobs()` ran after it. If `PJ-12` returns fewer than 50 rows, the prune or the `LIMIT` is wrong: the 51 manual runs of the loop alone are always recorded, so the table holds more than 50 before pruning.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/profile-jobs.js test-api.js
git commit -m "feat: profile job console API (state, settings, rebuild, per-code process/remove, runs)"
```

---

### Task 4: Frontend pure helpers `js/lib/profile-jobs-ui.js`

**Files:**
- Create: `js/lib/profile-jobs-ui.js`
- Test: `js/lib/profile-jobs-ui.test.js`

**Interfaces:**
- Consumes: the row shape of `GET /api/profile-jobs` (Task 3): `{ project_code, project_name, status, queued_at, last_processed_at, last_error, ... }` and `schedule: { state, lastRunAt, nextRunAt }`.
- Produces (ES module exports, each also bridged as `window.<name>`):
  - `filterJobProjects(list, { search = '', status = 'all' } = {}): Row[]` — every whitespace-separated token of `search` must appear in `"<code> <name>"` (case/accent-insensitive); `status !== 'all'` keeps rows with `row.status === status`. Returns a new array.
  - `sortJobProjects(list, key = 'code', dir = 'asc'): Row[]` — keys `'code'` (numeric-aware), `'status'` (error, queued, unprocessed, updated), `'lastProcessed'` (never-processed rows last in both directions); ties by code asc then input order; unknown key → code. New array, input untouched.
  - `jobStatusLabel(status): string` — `Error` / `Queued` / `Updated` / `Not processed`, unknown → the value as text.
  - `jobStatusClass(status): string` — `'job-st job-st-<status>'`, unknown → `'job-st job-st-unprocessed'`.
  - `describeNextRun(schedule, project?): string` — with a project that is not queued → `'—'`; `paused` → `'Paused'`; `scheduled` with a valid `nextRunAt` → `formatDateTime(nextRunAt)`; otherwise `'On the next tick (within 60 s)'`.
  - `formatDateTime(value): string` — local `YYYY-MM-DD HH:MM`, `'—'` for empty/invalid.
  - `formatDuration(startedAt, finishedAt): string` — `'< 1 s'`, `'12 s'`, `'3 min 5 s'`, `'1 h 2 min'`; `'—'` when either is missing/invalid or finish < start.

- [ ] **Step 1: Write the failing tests**

`js/lib/profile-jobs-ui.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  filterJobProjects, sortJobProjects, jobStatusLabel, jobStatusClass,
  describeNextRun, formatDateTime, formatDuration,
} from './profile-jobs-ui.js';

const P = (code, name, status, extra = {}) => ({
  project_code: code, project_name: name, status, row_count: 0, resource_count: 0,
  queued_at: status === 'queued' ? '2026-09-26T09:00:00.000Z' : null,
  last_processed_at: null, last_error: status === 'error' ? 'boom' : null, ...extra,
});

const list = [
  P('HITA.000001586.001', 'Città Alpha', 'queued'),
  P('HITA.000001586.002', 'Beta study', 'error'),
  P('ZED.1', 'Zed', 'updated', { last_processed_at: '2026-09-26T08:00:00.000Z' }),
  P('ABC.9', 'ABC.9', 'unprocessed'),
  P('ABC.10', 'Gamma', 'updated', { last_processed_at: '2026-09-25T08:00:00.000Z' }),
];
const codes = rows => rows.map(p => p.project_code);

describe('filterJobProjects', () => {
  it('returns every row for a blank search and status all, as a new array', () => {
    const out = filterJobProjects(list, { search: '  ', status: 'all' });
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
  });

  it('matches code and name, case- and accent-insensitive, every token required', () => {
    expect(codes(filterJobProjects(list, { search: 'CITTA' }))).toEqual(['HITA.000001586.001']);
    expect(filterJobProjects(list, { search: '1586' })).toHaveLength(2);
    expect(codes(filterJobProjects(list, { search: 'hita beta' }))).toEqual(['HITA.000001586.002']);
    expect(codes(filterJobProjects(list, { search: '000001586.001' }))).toEqual(['HITA.000001586.001']);
    expect(filterJobProjects(list, { search: 'nothing' })).toEqual([]);
  });

  it('filters by derived status', () => {
    expect(codes(filterJobProjects(list, { status: 'queued' }))).toEqual(['HITA.000001586.001']);
    expect(codes(filterJobProjects(list, { status: 'error' }))).toEqual(['HITA.000001586.002']);
    expect(codes(filterJobProjects(list, { status: 'updated' }))).toEqual(['ZED.1', 'ABC.10']);
  });

  it('combines search and status; tolerates a missing list or options', () => {
    expect(filterJobProjects(list, { search: 'hita', status: 'error' })).toHaveLength(1);
    expect(filterJobProjects(undefined)).toEqual([]);
    expect(filterJobProjects(list)).toHaveLength(5);
  });
});

describe('sortJobProjects', () => {
  it('sorts by code, numeric-aware, in both directions', () => {
    expect(codes(sortJobProjects(list, 'code', 'asc')))
      .toEqual(['ABC.9', 'ABC.10', 'HITA.000001586.001', 'HITA.000001586.002', 'ZED.1']);
    expect(codes(sortJobProjects(list, 'code', 'desc')))
      .toEqual(['ZED.1', 'HITA.000001586.002', 'HITA.000001586.001', 'ABC.10', 'ABC.9']);
  });

  it('sorts by status (error, queued, not processed, updated); ties by code ascending', () => {
    expect(codes(sortJobProjects(list, 'status', 'asc')))
      .toEqual(['HITA.000001586.002', 'HITA.000001586.001', 'ABC.9', 'ABC.10', 'ZED.1']);
    expect(codes(sortJobProjects(list, 'status', 'desc')))
      .toEqual(['ABC.10', 'ZED.1', 'ABC.9', 'HITA.000001586.001', 'HITA.000001586.002']);
  });

  it('sorts by last processed; never-processed rows stay last in both directions', () => {
    expect(codes(sortJobProjects(list, 'lastProcessed', 'asc')))
      .toEqual(['ABC.10', 'ZED.1', 'ABC.9', 'HITA.000001586.001', 'HITA.000001586.002']);
    expect(codes(sortJobProjects(list, 'lastProcessed', 'desc')))
      .toEqual(['ZED.1', 'ABC.10', 'ABC.9', 'HITA.000001586.001', 'HITA.000001586.002']);
  });

  it('does not mutate the input; an unknown key falls back to code', () => {
    const copy = list.slice();
    sortJobProjects(list, 'status', 'desc');
    expect(list).toEqual(copy);
    expect(codes(sortJobProjects(list, 'bogus'))[0]).toBe('ABC.9');
    expect(sortJobProjects(undefined)).toEqual([]);
  });
});

describe('jobStatusLabel / jobStatusClass', () => {
  it('labels the four statuses', () => {
    expect(['error', 'queued', 'updated', 'unprocessed'].map(jobStatusLabel))
      .toEqual(['Error', 'Queued', 'Updated', 'Not processed']);
  });

  it('gives a badge class per status and a neutral one for anything unknown', () => {
    expect(jobStatusClass('error')).toBe('job-st job-st-error');
    expect(jobStatusClass('queued')).toBe('job-st job-st-queued');
    expect(jobStatusClass('weird')).toBe('job-st job-st-unprocessed');
    expect(jobStatusLabel('weird')).toBe('weird');
    expect(jobStatusLabel(null)).toBe('');
  });
});

describe('formatDateTime', () => {
  it('formats a timestamp as local YYYY-MM-DD HH:MM', () => {
    const local = new Date(2026, 8, 26, 14, 5, 59);
    expect(formatDateTime(local.toISOString())).toBe('2026-09-26 14:05');
    expect(formatDateTime(local)).toBe('2026-09-26 14:05');
  });

  it('returns — for empty or invalid values', () => {
    for (const v of [null, undefined, '', 'nope']) expect(formatDateTime(v)).toBe('—');
  });
});

describe('describeNextRun', () => {
  const sched = (state, nextRunAt = null) => ({ state, lastRunAt: null, nextRunAt });
  const at = new Date(2026, 8, 26, 15, 30).toISOString();

  it('describes the global schedule', () => {
    expect(describeNextRun(sched('paused'))).toBe('Paused');
    expect(describeNextRun(sched('due'))).toBe('On the next tick (within 60 s)');
    expect(describeNextRun(sched('scheduled', at))).toBe('2026-09-26 15:30');
  });

  it('a row that is not queued has no next processing', () => {
    expect(describeNextRun(sched('scheduled', at), { queued_at: null })).toBe('—');
  });

  it('a queued row follows the job schedule', () => {
    const q = { queued_at: '2026-09-26T09:00:00.000Z' };
    expect(describeNextRun(sched('paused'), q)).toBe('Paused');
    expect(describeNextRun(sched('due'), q)).toBe('On the next tick (within 60 s)');
    expect(describeNextRun(sched('scheduled', at), q)).toBe('2026-09-26 15:30');
  });

  it('a scheduled state without a valid date, or no schedule at all, falls back to the next tick', () => {
    expect(describeNextRun(sched('scheduled', null))).toBe('On the next tick (within 60 s)');
    expect(describeNextRun(sched('scheduled', 'nope'))).toBe('On the next tick (within 60 s)');
    expect(describeNextRun(undefined)).toBe('On the next tick (within 60 s)');
  });
});

describe('formatDuration', () => {
  const t0 = '2026-09-26T10:00:00.000Z';
  const plus = ms => new Date(Date.parse(t0) + ms).toISOString();

  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(t0, plus(0))).toBe('< 1 s');
    expect(formatDuration(t0, plus(400))).toBe('< 1 s');
    expect(formatDuration(t0, plus(12_300))).toBe('12 s');
    expect(formatDuration(t0, plus(185_000))).toBe('3 min 5 s');
    expect(formatDuration(t0, plus(3_720_000))).toBe('1 h 2 min');
  });

  it('returns — when a timestamp is missing or invalid, or the end is before the start', () => {
    expect(formatDuration(t0, null)).toBe('—');
    expect(formatDuration(null, t0)).toBe('—');
    expect(formatDuration('nope', t0)).toBe('—');
    expect(formatDuration(t0, plus(-1000))).toBe('—');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run js/lib/profile-jobs-ui.test.js`
Expected: FAIL — `Failed to load url ./profile-jobs-ui.js` (module does not exist).

- [ ] **Step 3: Implement the module**

`js/lib/profile-jobs-ui.js`:

```js
// Pure helpers for profile-jobs.html (Cycle 3d, 2026-09). No DOM, no Vue: unit-tested with vitest
// and bridged to window.* for the page's inline module script.

const STATUS_LABELS = { error: 'Error', queued: 'Queued', updated: 'Updated', unprocessed: 'Not processed' };
const STATUS_RANK = { error: 0, queued: 1, unprocessed: 2, updated: 3 };
const NEXT_TICK = 'On the next tick (within 60 s)';

function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim();
}

// Case/accent-insensitive, numeric-aware ("ABC.9" before "ABC.10").
function cmp(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base', numeric: true });
}

// Date | ISO string → epoch ms, or null when empty/invalid.
function toTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

const byCode = (a, b) => cmp(a.project_code, b.project_code);
const byStatus = (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);

export function filterJobProjects(list, { search = '', status = 'all' } = {}) {
  const tokens = fold(search).split(/\s+/).filter(Boolean);
  return (list || []).filter(p => {
    if (status && status !== 'all' && p.status !== status) return false;
    if (!tokens.length) return true;
    const hay = fold(`${p.project_code} ${p.project_name}`);
    return tokens.every(t => hay.includes(t));
  });
}

// Returns a NEW array. Ties fall back to code ascending, then to the input order, whatever `dir`.
export function sortJobProjects(list, key = 'code', dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return (list || [])
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      const a = x.item;
      const b = y.item;
      if (key === 'lastProcessed') {
        const ta = toTime(a.last_processed_at);
        const tb = toTime(b.last_processed_at);
        if (ta === null && tb !== null) return 1;           // never processed: always last
        if (tb === null && ta !== null) return -1;
        if (ta !== null && tb !== null && ta !== tb) return (ta - tb) * sign;
      } else {
        const primary = key === 'status' ? byStatus : byCode;
        const d = primary(a, b) * sign;
        if (d) return d;
      }
      return byCode(a, b) || x.index - y.index;
    })
    .map(entry => entry.item);
}

export function jobStatusLabel(status) {
  return STATUS_LABELS[status] || String(status ?? '');
}

export function jobStatusClass(status) {
  return `job-st job-st-${STATUS_LABELS[status] ? status : 'unprocessed'}`;
}

// Local time, 'YYYY-MM-DD HH:MM'.
export function formatDateTime(value) {
  const t = toTime(value);
  if (t === null) return '—';
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// schedule: GET /api/profile-jobs → schedule. With a project row, a row that is not queued has
// no next processing ('—'); a queued row follows the job schedule.
export function describeNextRun(schedule, project) {
  if (project && !project.queued_at) return '—';
  const s = schedule || {};
  if (s.state === 'paused') return 'Paused';
  if (s.state === 'scheduled' && toTime(s.nextRunAt) !== null) return formatDateTime(s.nextRunAt);
  return NEXT_TICK;
}

export function formatDuration(startedAt, finishedAt) {
  const a = toTime(startedAt);
  const b = toTime(finishedAt);
  if (a === null || b === null || b < a) return '—';
  const ms = b - a;
  if (ms < 1000) return '< 1 s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

window.filterJobProjects = filterJobProjects;
window.sortJobProjects = sortJobProjects;
window.jobStatusLabel = jobStatusLabel;
window.jobStatusClass = jobStatusClass;
window.describeNextRun = describeNextRun;
window.formatDateTime = formatDateTime;
window.formatDuration = formatDuration;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run js/lib/profile-jobs-ui.test.js` — expected: PASS. Then `npm test` — expected: every frontend test green.

- [ ] **Step 5: Commit**

```bash
git add js/lib/profile-jobs-ui.js js/lib/profile-jobs-ui.test.js
git commit -m "feat: pure helpers for the profile job console page"
```

---

### Task 5: `profile-jobs.html` and the Timesheets entry point

**Files:**
- Create: `profile-jobs.html`
- Modify: `timesheets.html` (header button with badge, one data field, one call, one method)

**Interfaces:**
- Consumes: Task 3 HTTP API; Task 4 `window.filterJobProjects`, `window.sortJobProjects`, `window.jobStatusLabel`, `window.jobStatusClass`, `window.describeNextRun`, `window.formatDateTime`, `window.formatDuration`; `initNav(tab, { breadcrumbs })` from `js/nav.js`; `showConfirm(message, onConfirm, onCancel, title)` from `js/core.js` (needs a `#confirmModal` with `#confirmModalTitle`, `#confirmModalMessage`, `#confirmModalCancel`, `#confirmModalOk` in the page).
- Produces: the page; no JS API for other tasks.

No automated UI test exists in this project (no browser in the toolchain): this task is verified by a syntax check of the inline scripts, a template/method consistency re-read, the frontend suite, and Task 6's manual checklist.

- [ ] **Step 1: Check the current shared script/style versions**

Run: `Select-String -Path team.html -Pattern '\?v=' | ForEach-Object { $_.Line.Trim() }`
Expected (at planning time): `tokens.css?v=7`, `style.css?v=13`, `admin-crud.css?v=1`, `team-ui.js?v=2`, `api.js?v=7`, `core.js?v=5`, `notif-browser.js?v=2`, `notifications.js?v=2`, `nav.js?v=9`. If any shared file's version differs now, use the **current** value in Step 2 (never an older one).

- [ ] **Step 2: Create `profile-jobs.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDash — Profile processing</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="css/tokens.css?v=7">
  <link rel="stylesheet" href="css/style.css?v=13">
  <link rel="stylesheet" href="css/admin-crud.css?v=1">
  <style>
    .sortable-th { cursor: pointer; user-select: none; white-space: nowrap; }
    .sortable-th:hover { text-decoration: underline; }
    .job-st { font-size: var(--text-2xs); padding: .2rem .55rem; border-radius: var(--radius-full); font-weight: 600; white-space: nowrap; }
    .job-st-error       { background: var(--color-danger-bg);  color: var(--color-danger); cursor: pointer; }
    .job-st-queued      { background: var(--color-warning-bg); color: var(--color-warning-text); }
    .job-st-updated     { background: var(--color-success-bg); color: var(--color-success); }
    .job-st-unprocessed { background: var(--surface-medium);   color: var(--text-muted); }
    .jobs-scroll { max-height: 60vh; overflow-y: auto; }
    .jobs-scroll thead th { position: sticky; top: 0; z-index: 1; }
    .error-detail td { background: var(--color-danger-bg); color: var(--color-danger); font-size: var(--text-xs); white-space: pre-wrap; }
    .hint { font-size: var(--text-xs); color: var(--text-muted); }
  </style>
</head>
<body>

<div id="nav-container"></div>

<div id="app" v-cloak>

  <div class="page app-container" v-if="ready">

    <a href="/timesheets.html" class="small text-decoration-none d-inline-block mb-2">← Timesheets</a>

    <div class="page-header">
      <h1>Profile processing
        <span class="text-muted fw-normal" style="font-size:1rem">({{ queuedCount }} queued)</span>
      </h1>
    </div>

    <!-- Global alert: network failures / non-JSON responses (kept separate from action errors) -->
    <div v-if="loadError" class="alert alert-danger alert-sm mb-3">{{ loadError }}</div>
    <div v-if="actionError" class="alert alert-warning alert-sm mb-3 d-flex justify-content-between align-items-start">
      <span>{{ actionError }}</span>
      <button type="button" class="btn-close ms-2" aria-label="Dismiss" @click="actionError = null"></button>
    </div>
    <div v-if="actionInfo" class="alert alert-success alert-sm mb-3 d-flex justify-content-between align-items-start">
      <span>{{ actionInfo }}</span>
      <button type="button" class="btn-close ms-2" aria-label="Dismiss" @click="actionInfo = null"></button>
    </div>

    <p class="hint mb-3">
      Resource experience profiles are rebuilt in the background from uploaded actuals, one project code at a time.
      Uploads and changes to tags, aliases and resources put project codes in the queue; the worker processes the
      queue on the schedule below.
    </p>

    <!-- ── SETTINGS + GLOBAL ACTIONS ─────────────────────────── -->
    <div class="card mb-3">
      <div class="p-3">
        <div class="d-flex flex-wrap align-items-end gap-4">
          <div class="form-check form-switch mb-1">
            <input class="form-check-input" type="checkbox" role="switch" id="jobEnabled"
                   v-model="form.enabled" :disabled="!!busyAction">
            <label class="form-check-label" for="jobEnabled">Scheduled processing {{ form.enabled ? 'on' : 'off' }}</label>
          </div>
          <div>
            <label class="form-label" for="jobInterval">Interval (minutes)</label>
            <input id="jobInterval" type="number" min="1" max="1440" step="1"
                   class="form-control form-control-sm" style="width:120px"
                   :class="{ 'is-invalid': !intervalValid }"
                   v-model.number="form.intervalMin" :disabled="!!busyAction">
          </div>
          <button class="btn btn-primary btn-sm" :disabled="!settingsDirty || !intervalValid || !!busyAction" @click="saveSettings">
            <span v-if="busyAction === 'save'" class="spinner-border spinner-border-sm me-1"></span>Save
          </button>
          <div class="ms-auto d-flex gap-2">
            <button class="btn btn-outline-secondary btn-sm" :disabled="!!busyAction" @click="recalculateNow">
              <span v-if="busyAction === 'run'" class="spinner-border spinner-border-sm me-1"></span>Recalculate now
            </button>
            <button class="btn btn-outline-danger btn-sm" :disabled="!!busyAction" @click="confirmRebuild">
              <span v-if="busyAction === 'rebuild'" class="spinner-border spinner-border-sm me-1"></span>Rebuild all
            </button>
          </div>
        </div>
        <div v-if="!intervalValid" class="text-danger small mt-1">Enter a whole number of minutes between 1 and 1440.</div>
        <div class="small mt-2">
          <strong>Next scheduled run:</strong> {{ nextRunText }}
          <span v-if="schedule.lastRunAt" class="text-muted"> · last scheduled run {{ formatDateTime(schedule.lastRunAt) }}</span>
        </div>
        <div class="hint mt-1">
          <strong>Recalculate now</strong> processes the queue immediately; <strong>Rebuild all</strong> queues every project code first.
          The estimate restarts after an API restart, has the 60-second granularity of the worker tick, and manual runs do not move it.
        </div>
      </div>
    </div>

    <!-- ── PROJECT CODES ───────────────────────────────────────── -->
    <div class="d-flex flex-wrap gap-2 mb-2 align-items-center">
      <input v-model="search" type="text" class="form-control form-control-sm" style="max-width:280px"
             placeholder="Search code or project…">
      <select v-model="statusFilter" class="form-select form-select-sm" style="width:auto">
        <option value="all">All statuses</option>
        <option value="queued">Queued</option>
        <option value="error">Error</option>
        <option value="updated">Updated</option>
      </select>
      <span class="hint ms-auto">{{ visibleProjects.length }} of {{ projects.length }} project codes · refreshes every 15 s</span>
    </div>

    <div class="card mb-3">
      <div class="card-body jobs-scroll">
        <table class="table table-hover" v-if="visibleProjects.length">
          <thead>
            <tr>
              <th>Project</th>
              <th class="sortable-th" @click="sortBy('code')">Code {{ sortIndicator('code') }}</th>
              <th class="text-end">Actuals rows</th>
              <th class="text-end">Matched resources</th>
              <th class="sortable-th" @click="sortBy('status')">Status {{ sortIndicator('status') }}</th>
              <th class="sortable-th" @click="sortBy('lastProcessed')">Last processed {{ sortIndicator('lastProcessed') }}</th>
              <th>Next processing</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="p in visibleProjects" :key="p.project_code">
              <tr>
                <td>{{ p.project_name }}</td>
                <td><code>{{ p.project_code }}</code></td>
                <td class="text-end">{{ Number(p.row_count).toLocaleString('en-US') }}</td>
                <td class="text-end">{{ p.resource_count }}</td>
                <td style="white-space:nowrap">
                  <span :class="jobStatusClass(p.status)" :title="p.last_error || ''"
                        @click="p.last_error && toggleExpanded(p.project_code)">{{ jobStatusLabel(p.status) }}<span v-if="p.last_error"> {{ expanded[p.project_code] ? '▴' : '▾' }}</span></span>
                  <span v-if="p.status === 'error' && p.queued_at" class="text-muted small ms-1">(queued)</span>
                </td>
                <td class="text-muted" style="white-space:nowrap">{{ formatDateTime(p.last_processed_at) }}</td>
                <td class="text-muted" style="white-space:nowrap">{{ describeNextRun(schedule, p) }}</td>
                <td class="text-end" style="white-space:nowrap">
                  <button class="btn btn-outline-secondary btn-action me-1" :disabled="!!busyAction" @click="processProject(p)">
                    <span v-if="busyAction === 'process:' + p.project_code" class="spinner-border spinner-border-sm"></span>
                    <span v-else>Process</span>
                  </button>
                  <button v-if="p.queued_at" class="btn btn-outline-danger btn-action" :disabled="!!busyAction" @click="confirmRemove(p)">
                    <span v-if="busyAction === 'remove:' + p.project_code" class="spinner-border spinner-border-sm"></span>
                    <span v-else>Remove from queue</span>
                  </button>
                </td>
              </tr>
              <tr v-if="p.last_error && expanded[p.project_code]" class="error-detail">
                <td colspan="8">{{ p.last_error }}</td>
              </tr>
            </template>
          </tbody>
        </table>
        <div class="empty" v-else>{{ projects.length ? 'No project codes match the current filters.' : 'No actuals uploaded yet.' }}</div>
      </div>
    </div>

    <!-- ── RUN HISTORY ─────────────────────────────────────────── -->
    <details class="mb-4">
      <summary class="fw-semibold" style="cursor:pointer">Run history <span class="text-muted fw-normal small">(last {{ runs.length }})</span></summary>
      <div class="card mt-2">
        <div class="card-body jobs-scroll">
          <table class="table table-sm" v-if="runs.length">
            <thead>
              <tr>
                <th>When</th><th>Type</th><th class="text-end">Projects</th><th class="text-end">Resource contributions</th>
                <th>Duration</th><th>Error</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in runs" :key="r.id">
                <td style="white-space:nowrap">{{ formatDateTime(r.started_at) }}</td>
                <td>{{ r.trigger_type }}</td>
                <td class="text-end">{{ r.projects }}</td>
                <td class="text-end">{{ r.resources }}</td>
                <td style="white-space:nowrap">{{ formatDuration(r.started_at, r.finished_at) }}</td>
                <td class="small" :class="r.error ? 'text-danger' : 'text-muted'" style="max-width:420px;white-space:pre-wrap">{{ r.error || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div class="empty" v-else>No runs recorded yet.</div>
        </div>
      </div>
    </details>

  </div>

  <div v-else class="d-flex align-items-center justify-content-center" style="height:60vh">
    <div class="spinner-border text-secondary"></div>
  </div>

  <!-- Confirm (used by showConfirm() in js/core.js) -->
  <div class="modal fade" id="confirmModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-dialog-centered" style="max-width:460px">
      <div class="modal-content shadow-lg">
        <div class="modal-header border-0 pb-1">
          <h6 class="modal-title fw-bold" id="confirmModalTitle">⚠️ Confirm</h6>
        </div>
        <div class="modal-body pt-1">
          <p id="confirmModalMessage" class="mb-0" style="white-space:pre-line;font-size:.92rem"></p>
        </div>
        <div class="modal-footer border-0 pt-2">
          <button class="btn btn-secondary" id="confirmModalCancel" data-bs-dismiss="modal">Cancel</button>
          <button class="btn btn-danger" id="confirmModalOk">Confirm</button>
        </div>
      </div>
    </div>
  </div>

</div><!-- #app -->

<script defer src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script type="module" src="js/lib/profile-jobs-ui.js?v=1"></script>
<script defer src="js/api.js?v=7"></script>
<script defer src="js/core.js?v=5"></script>
<script defer src="js/settings.js"></script>
<script type="module" src="js/lib/notif-browser.js?v=2"></script>
<script defer src="js/notifications.js?v=2"></script>
<script defer src="js/nav.js?v=9"></script>
<script type="module">
  // Module-level (not reactive): timers and the refresh sequence number.
  let refreshTimer = null;
  let onVisibility = null;
  let refreshSeq = 0;

  const REFRESH_MS = 15000;
  const BUSY_TEXT = 'A profile job is already running — try again in a moment.';
  const NETWORK_TEXT = 'Could not reach the server, or it returned an unexpected response. The page retries every 15 seconds.';

  Vue.createApp({
    data() {
      return {
        ready: false,
        loadError: null,        // network / non-JSON failures (global alert)
        actionError: null,      // failures of an action (validation, 404, 409)
        actionInfo: null,       // confirmation of a completed action
        settings: { enabled: true, intervalMin: 10 },   // as stored on the server
        form: { enabled: true, intervalMin: 10 },       // the settings widget
        schedule: { state: 'due', lastRunAt: null, nextRunAt: null },
        queuedCount: 0,
        projects: [],
        runs: [],
        search: '',
        statusFilter: 'all',
        sortKey: 'code',
        sortDir: 'asc',
        expanded: {},           // project_code → true when its error row is open
        busyAction: null,       // anti double-click guard: the action in progress, or null
      };
    },

    computed: {
      visibleProjects() {
        const filtered = window.filterJobProjects(this.projects, { search: this.search, status: this.statusFilter });
        return window.sortJobProjects(filtered, this.sortKey, this.sortDir);
      },
      intervalValid() {
        const v = this.form.intervalMin;
        return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1440;
      },
      settingsDirty() {
        return this.form.enabled !== this.settings.enabled || this.form.intervalMin !== this.settings.intervalMin;
      },
      nextRunText() {
        return window.describeNextRun(this.schedule, null);
      },
    },

    async created() {
      const user = await initNav('timesheets', { breadcrumbs: [
        { label: 'Home', href: '/pipeline.html' },
        { label: 'Timesheets', href: '/timesheets.html' },
        { label: 'Profile processing' },
      ]});
      if (!user) return;
      if (!['admin', 'sysadmin'].includes(user.role)) { window.location.href = '/pipeline.html'; return; }
      await this.refresh();
      this.ready = true;
      this.startAutoRefresh();
    },

    beforeUnmount() {
      this.stopAutoRefresh();
    },

    methods: {
      jobStatusLabel(s) { return window.jobStatusLabel(s); },
      jobStatusClass(s) { return window.jobStatusClass(s); },
      describeNextRun(schedule, p) { return window.describeNextRun(schedule, p); },
      formatDateTime(v) { return window.formatDateTime(v); },
      formatDuration(a, b) { return window.formatDuration(a, b); },

      // fetch wrapper: { ok, status, data, network }. network = true when the request failed or the
      // response was not JSON (e.g. a proxy error page).
      async request(method, url, body) {
        const hasBody = body !== undefined && body !== null;
        let res;
        try {
          res = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
            body: hasBody ? JSON.stringify(body) : undefined,
          });
        } catch {
          return { ok: false, status: 0, data: null, network: true };
        }
        let data;
        try { data = await res.json(); } catch { return { ok: false, status: res.status, data: null, network: true }; }
        return { ok: res.ok, status: res.status, data, network: false };
      },

      async refresh() {
        const seq = ++refreshSeq;
        const [state, runs] = await Promise.all([
          this.request('GET', '/api/profile-jobs'),
          this.request('GET', '/api/profile-jobs/runs'),
        ]);
        if (seq !== refreshSeq) return;            // a newer refresh superseded this one
        if (state.network || runs.network) { this.loadError = NETWORK_TEXT; return; }
        if (!state.ok || !runs.ok) {
          this.loadError = (state.data && state.data.error) || (runs.data && runs.data.error)
            || 'Failed to load the profile processing state.';
          return;
        }
        this.loadError = null;
        const keepForm = this.settingsDirty;        // never overwrite unsaved edits
        this.settings = { ...state.data.settings };
        if (!keepForm) this.form = { ...state.data.settings };
        this.schedule = state.data.schedule;
        this.queuedCount = state.data.queuedCount;
        this.projects = state.data.projects;
        this.runs = runs.data;
      },

      startAutoRefresh() {
        this.stopAutoRefresh();
        const tick = () => {
          if (document.visibilityState === 'visible' && !this.busyAction) this.refresh();
        };
        refreshTimer = setInterval(tick, REFRESH_MS);   // skipped while the tab is in the background
        onVisibility = tick;                            // catch up as soon as the tab is visible again
        document.addEventListener('visibilitychange', onVisibility);
      },
      stopAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
        refreshTimer = null;
        onVisibility = null;
      },

      // Runs one action: guard, request, error routing, then always a refresh.
      async runAction(name, method, url, body, { onSuccess, busyNote } = {}) {
        if (this.busyAction) return;
        this.busyAction = name;
        this.actionError = null;
        this.actionInfo = null;
        try {
          const r = await this.request(method, url, body);
          if (r.network) { this.loadError = NETWORK_TEXT; return; }
          if (r.status === 409) { this.actionError = busyNote ? `${BUSY_TEXT} ${busyNote}` : BUSY_TEXT; return; }
          if (!r.ok) { this.actionError = (r.data && r.data.error) || 'The action failed.'; return; }
          if (onSuccess) onSuccess(r.data);
        } finally {
          this.busyAction = null;
          await this.refresh();
        }
      },

      runSummary(prefix, d) {
        const n = d.projects || 0;
        const r = d.resources || 0;
        const e = (d.errors || []).length;
        return `${prefix}: ${n} project code${n === 1 ? '' : 's'} processed, ${r} resource contribution${r === 1 ? '' : 's'} rebuilt`
          + (e ? `, ${e} failed (see the Error rows).` : '.');
      },

      saveSettings() {
        if (!this.settingsDirty || !this.intervalValid) return;
        return this.runAction('save', 'PUT', '/api/profile-jobs/settings',
          { enabled: this.form.enabled, intervalMin: this.form.intervalMin },
          {
            onSuccess: (data) => {
              this.settings = { enabled: data.enabled, intervalMin: data.intervalMin };
              this.form = { ...this.settings };
              this.actionInfo = 'Saved — applies on the next tick (within 60 s).';
            },
          });
      },

      recalculateNow() {
        return this.runAction('run', 'POST', '/api/profile-jobs/run', null, {
          onSuccess: (d) => { this.actionInfo = this.runSummary('Recalculation finished', d); },
        });
      },

      confirmRebuild() {
        if (this.busyAction) return;
        showConfirm(
          'Rebuild every profile?\n\nAll project codes are queued and processed again now. On a large database this can take a while.',
          () => this.rebuildAll(), null, '⚠️ Rebuild all');
      },
      rebuildAll() {
        return this.runAction('rebuild', 'POST', '/api/profile-jobs/rebuild', null, {
          busyNote: 'All project codes have been queued and will be processed by the running job or the next one.',
          onSuccess: (d) => { this.actionInfo = this.runSummary('Rebuild finished', d); },
        });
      },

      processProject(p) {
        const code = p.project_code;
        return this.runAction('process:' + code, 'POST',
          `/api/profile-jobs/projects/${encodeURIComponent(code)}/process`, null, {
            busyNote: 'This project code has been queued and will be processed by the running job or the next one.',
            onSuccess: (d) => { this.actionInfo = this.runSummary(`${code} processed`, d); },
          });
      },

      confirmRemove(p) {
        if (this.busyAction) return;
        const code = p.project_code;
        showConfirm(
          `Remove "${code}" from the queue?\n\nThe profile already calculated does not change until this project code is processed again (by a new upload, a change that queues it, Process or Rebuild all).`,
          () => this.removeFromQueue(code), null, '⚠️ Remove from queue');
      },
      removeFromQueue(code) {
        return this.runAction('remove:' + code, 'DELETE',
          `/api/profile-jobs/projects/${encodeURIComponent(code)}/queue`, null, {
            onSuccess: () => { this.actionInfo = `${code} removed from the queue.`; },
          });
      },

      toggleExpanded(code) {
        this.expanded = { ...this.expanded, [code]: !this.expanded[code] };
      },
      sortBy(key) {
        if (this.sortKey === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        else { this.sortKey = key; this.sortDir = 'asc'; }
      },
      sortIndicator(key) {
        return this.sortKey === key ? (this.sortDir === 'asc' ? '▲' : '▼') : '';
      },
    },
  }).mount('#app');
</script>
</body>
</html>
```

- [ ] **Step 3: Timesheets — the button with the badge**

In `timesheets.html` replace

```html
    <div class="page-header">
      <h1>Timesheets
        <span class="text-muted fw-normal" style="font-size:1rem" v-if="rows.length">({{ rows.length }} project{{ rows.length !== 1 ? 's' : '' }})</span>
      </h1>
    </div>
```

with

```html
    <div class="page-header">
      <h1>Timesheets
        <span class="text-muted fw-normal" style="font-size:1rem" v-if="rows.length">({{ rows.length }} project{{ rows.length !== 1 ? 's' : '' }})</span>
      </h1>
      <a href="/profile-jobs.html" class="btn btn-outline-secondary btn-sm">
        Profile processing →
        <span v-if="profileQueued > 0" class="badge bg-warning text-dark ms-1"
              :title="profileQueued + ' project code' + (profileQueued === 1 ? '' : 's') + ' waiting for profile processing'">{{ profileQueued }}</span>
      </a>
    </div>
```

Replace

```js
        sortBy: null,
        sortDir: 'asc',
      };
```

with

```js
        sortBy: null,
        sortDir: 'asc',
        profileQueued: 0,      // badge on "Profile processing →" (hidden when 0)
      };
```

Replace

```js
      this.ready = true;
    },
```

with

```js
      this.ready = true;
      this.loadProfileQueueCount();   // badge only: not awaited, never blocks the page
    },
```

Replace

```js
    methods: {
      fmtMoney,
```

with

```js
    methods: {
      fmtMoney,
      // One GET /api/profile-jobs for the badge; any failure is ignored (the badge just stays hidden).
      async loadProfileQueueCount() {
        try {
          const res = await fetch('/api/profile-jobs', { credentials: 'same-origin' });
          if (!res.ok) return;
          const data = await res.json();
          this.profileQueued = Number(data.queuedCount) || 0;
        } catch { /* optional badge: ignore */ }
      },
```

- [ ] **Step 4: Syntax-check both inline module scripts**

Run (PowerShell):

```powershell
foreach ($page in 'profile-jobs.html', 'timesheets.html') {
  $html = Get-Content $page -Raw
  $m = [regex]::Matches($html, '(?s)<script type="module">(.*?)</script>')
  $out = Join-Path $env:TEMP "inline-$page.mjs"
  $m[$m.Count - 1].Groups[1].Value | Set-Content -Encoding utf8 $out
  node --check $out; if ($?) { "$page inline script: syntax OK" }
}
```

Expected: `profile-jobs.html inline script: syntax OK` and `timesheets.html inline script: syntax OK`.

- [ ] **Step 5: Template/method consistency re-read (no browser available)**

Re-read `profile-jobs.html` top to bottom and tick each identifier used in the template against its definition:
- data: `ready`, `loadError`, `actionError`, `actionInfo`, `form.enabled`, `form.intervalMin`, `schedule` (`.lastRunAt`), `queuedCount`, `projects`, `runs`, `search`, `statusFilter`, `expanded`, `busyAction`;
- computed: `visibleProjects`, `intervalValid`, `settingsDirty`, `nextRunText`;
- methods: `saveSettings`, `recalculateNow`, `confirmRebuild`, `processProject`, `confirmRemove`, `toggleExpanded`, `sortBy`, `sortIndicator`, `jobStatusClass`, `jobStatusLabel`, `describeNextRun`, `formatDateTime`, `formatDuration`;
- methods used only from script: `request`, `refresh`, `startAutoRefresh`, `stopAutoRefresh`, `runAction`, `runSummary`, `rebuildAll`, `removeFromQueue`;
- row fields used: `project_code`, `project_name`, `row_count`, `resource_count`, `status`, `queued_at`, `last_processed_at`, `last_error` (Task 3 list) and `id`, `started_at`, `finished_at`, `trigger_type`, `projects`, `resources`, `error` (Task 3 runs);
- busy names match between `runAction(...)` calls and the spinners: `'save'`, `'run'`, `'rebuild'`, `'process:' + code`, `'remove:' + code`;
- `<template v-for>` carries the `:key`; `colspan="8"` equals the 8 header cells; `id="confirmModal"` plus the four inner ids exist once; `v-cloak` is on `#app`; the page has no `alert(`/`confirm(` call (`Select-String -Path profile-jobs.html -Pattern 'alert\(|confirm\(' ` must only find `showConfirm(`) and no hex colour in its `<style>` (`Select-String -Path profile-jobs.html -Pattern '#[0-9a-fA-F]{3,6}\b'` must return nothing).

Fix any mismatch before continuing.

- [ ] **Step 6: Versioned files and frontend suite**

Run: `git grep -n "profile-jobs-ui.js"` — expected: only `profile-jobs.html` (`?v=1`) plus the test file's import.
Run: `git diff --name-only main -- js css` — expected: only `js/lib/profile-jobs-ui.js` and `js/lib/profile-jobs-ui.test.js` (no shared `js/*.js` or `css/*.css` changed → no `?v` bump elsewhere).
Run: `npm test` — expected: green.

- [ ] **Step 7: Commit**

```bash
git add profile-jobs.html timesheets.html
git commit -m "feat: profile processing console page and its Timesheets entry point"
```

---

### Task 6: Verification and hand-off

**Files:** none modified (any fix goes back to the owning task and its commit).

- [ ] **Step 1: Suites**

Run, from the worktree root:
- `npm test` — frontend (vitest), expected green;
- `node --test (Get-ChildItem api/src/lib/*.test.js | ForEach-Object { $_.FullName })` — backend pure modules, expected green;
- `& "C:\Program Files\Git\bin\bash.exe" scripts/run-tests.sh` — integration, expected `Results: N/N passed — all passed` with every `PE-*` and `PJ-*` present.

- [ ] **Step 2: Isolated branch stack (no migration this cycle)**

Run `& "C:\Program Files\Git\bin\bash.exe" scripts/test-branch.sh up` (with `.env` copied into the worktree). The branch DB is a clone of the real one, so its worker interval is whatever the real DB holds (currently 1 minute, set by the user): changing settings **on the branch stack** during the checklist is fine, it is disposable. Never touch the main stack's settings, containers or volumes.

- [ ] **Step 3: Manual checklist (branch stack, logged in as an admin)**

1. **Timesheets** shows a "Profile processing →" button; the badge shows the queue size when codes are queued and is hidden when the queue is empty (upload a small XLS in Project Reporting → badge appears after reloading Timesheets).
2. The button opens `profile-jobs.html`; the Timesheets nav tab stays highlighted; "← Timesheets" goes back; the page has no raw `{{ }}` flash on load.
3. **Settings widget**: Save is disabled until something changes; 0, 1441, 2.5 and an empty field show the red hint and keep Save disabled; saving shows "Saved — applies on the next tick (within 60 s)"; switching off shows "Paused" as next run and, within ~2 minutes, no new `scheduled` rows appear in the history; switching back on resumes — all without restarting the API.
4. **Recalculate now** runs without a confirm and shows the summary; **Rebuild all** asks for confirmation first; both refresh the list and the history.
5. **Process** on one row processes only that code (another queued row stays "Queued"); **Remove from queue** appears only on queued rows, asks for confirmation mentioning that the calculated profile does not change, and the row stops being queued.
6. **Filters**: search by part of a code (`.001`) and by project name; status filter Queued / Error / Updated; sort by Code, Status, Last processed (never-processed rows stay last).
7. **Orphan code**: delete the actuals of a project in Timesheets → the code stays listed (0 rows) and can be processed; after processing, its matched resources drop to 0.
8. **Error row**: if any row is in Error, its badge tooltip shows the message and a click expands the full message (if none occurs naturally, skip and note it).
9. **History** `<details>` opens and lists when/type/projects/contributions/duration/error, newest first, at most 50.
10. **Auto-refresh**: leave the page open while the worker runs — the list updates within 15 s; switch to another tab for a minute and back — it refreshes immediately on return.
11. **409**: click Rebuild all and, while it runs, click Process in a second browser tab on the same page — the second shows "A profile job is already running — try again in a moment. …queued…" (timing-dependent; retry once if the first finished too quickly).
12. **Network error**: stop only the **branch** API container briefly (`docker stop <branch api container printed by test-branch.sh up>`, then `docker start` it) — the page shows the global red alert and clears it on the next successful refresh. Never do this on the main stack.
13. **Permissions**: log in on the branch stack as a non-admin user (one from the cloned data, or demote a test account in `admin.html` on the branch stack only): `profile-jobs.html` redirects to `/pipeline.html`, and `GET /api/profile-jobs` in the browser devtools returns 403.

- [ ] **Step 4: Hand off to `/finish-cycle`**

- Teardown of the branch stack only after the user's own "yes" in `/finish-cycle` Gate 2 (never on my own initiative).
- No migration to apply at merge. **`pdash-api` must be restarted after the merge** (new routes; the user does it via Docker — no agent-run `docker compose` on the main stack).
- The real DB's worker interval is intentionally left at **1 minute** by the user, who will set it back to 10 from the new console; neither the merge nor any script touches it.
- `/sync-docs` must cover: `docs/api/profile-engine.md` (console API section, `processQueue(trigger, { only })`, `dequeueProject`/`isKnownProjectCode`, worker getters, the repeated-error throttle — and remove the "Known limits" lines about no console UI and the history being flushed by a failing code), `docs/api/lib.md` (`job-schedule.js` new exports), `docs/js/lib.md` (new `profile-jobs-ui.js`), new `docs/pages/profile-jobs.md`, `docs/pages/timesheets.md` (button + badge), `CLAUDE.md` (Pages table row and file-structure entry for `profile-jobs.html` and `js/lib/profile-jobs-ui.js`; `profile-jobs.js` route description), `ARCHITECTURE.md` (endpoints, page), `TEST_CASES.md` + `test-cases.html` (`PJ-01`…`PJ-13`, `PJ-setup`/`PJ-cleanup`, and this manual checklist), `PRD.md` (new visible admin page), and the operational-manual skill's reference (new page reachable from Timesheets).

---

## Self-review (planning time)

**Spec coverage**

| Spec | Requirement | Task |
|---|---|---|
| §1 | See queue + timing, force recalculation, tune schedule, history | T3 API, T5 page |
| §2 | Separate page, no menu entry, entry only from Timesheets with badge, `initNav('timesheets')`, "← Timesheets", admin/sysadmin + redirect, no `nav.js` change | T5 (page + Timesheets edits), T3 (`requireAdmin`) |
| §3.1 | Toggle + interval 1–1440, Save only when dirty, client + server validation, "Saved — applies…", next-run text + restart note | T5 widget, T1 `jobSettingsError`, T3 PUT |
| §3.2 | Recalculate now (no confirm), Rebuild all (`showConfirm`) | T5 |
| §3.3 | Search, status filter, sort, internal scroll, 8 columns, empty state, error badge + tooltip + expandable row, Process / Remove (queued only, confirm text) | T4 helpers, T5 |
| §3.4 | Collapsible history with when/type/projects/resources/duration/error | T3 `/runs`, T4 `formatDuration`, T5 |
| §3 common | Initial GET, 15 s refresh only when visible, refresh after actions, anti double-click, 409 text, global network/non-JSON alert, no native dialogs | T5 (`refresh`, `startAutoRefresh`, `runAction`, `busyAction`) |
| §4 | All six routes, strict PUT with `updated_by`, rebuild/process 409 keep codes queued, 404s, `:code` validation, one aggregated list query, derived status, per-row next processing | T3, T1 `deriveProjectStatus`, T4 `describeNextRun` |
| §5.1 | `processQueue(trigger, { only })`, same lock/transaction/failure handling, always manual + recorded | T2 |
| §5.2 | `shouldRecordRun` throttle with the `recordRun` composition | T1 (`composeRunError`, `shouldRecordRun`), T2 |
| §5.3 | `nextRunInfo`, worker last-run getter, manual runs don't move it | T1, T2 |
| §5.4 | Limits stated on the page | T5 hint text |
| §5 | No migration, no change to resource-profile/matching/resources routes | respected (files list) |
| §6 | Files and docs list | T1–T5 files, T6 docs |
| §7 | Global constraints | header; T5 steps 5–6 check `v-cloak`, native dialogs, hex, `?v` |
| §8 | node:test cases, vitest cases, `PJ-*` integration incl. restore, manual items | T1, T4, T3, T6 |
| §9 | Column names; badge hidden when 0 | Clarification 5 |

**Placeholder scan:** no TBD/TODO; every code step carries complete code; every command has an expected result.

**Signature consistency:** `processQueue(trigger, { only })`, `dequeueProject(code)`, `isKnownProjectCode(code)`, `readSettings()`, `getLastRunStartedAt()` (T2) are what T3 imports; `nextRunInfo`/`jobSettingsError`/`deriveProjectStatus`/`composeRunError`/`shouldRecordRun` (T1) match their T2/T3 uses; row fields `project_code, project_name, row_count, resource_count, queued_at, last_processed_at, last_error, status` are produced by T3's SQL + `deriveProjectStatus` and consumed by T4's helpers, T5's template and the `PJ-*` tests; status values `error|queued|updated|unprocessed` are identical in T1, T4 and T5's CSS classes.

**Review Focus pins:** (1) `PJ-09` + `encodeURIComponent` in T5; (2) `PJ-10`; (3) T1 `jobSettingsError` + `PJ-04`/`PJ-05`; (4) `PJ-13` + `busyAction`; (5) T1 `nextRunInfo` tests (future last run, boundaries 1/1440, invalid timestamp, agreement with `isJobDue`).
