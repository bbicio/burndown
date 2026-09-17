const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDate, resolveColumnMap, trimRowKeys, findRoleTaskInconsistencies } = require('./timesheets');

test('formatDate: native Date instance is unaffected by this change', () => {
  const d = new Date(Date.UTC(2026, 2, 15)); // March 15, 2026
  assert.equal(formatDate(d), '2026-03-15');
});

test('formatDate: already-ISO string is unaffected by this change', () => {
  assert.equal(formatDate('2026-03-15'), '2026-03-15');
});

test('formatDate: null input returns null', () => {
  assert.equal(formatDate(null), null);
});

test('formatDate: empty string input returns null', () => {
  assert.equal(formatDate(''), null);
});

test('formatDate: whitespace-only string input returns null', () => {
  assert.equal(formatDate('   '), null);
});

test('formatDate: unrecognized garbage string throws instead of silently passing through', () => {
  assert.throws(() => formatDate('N/A'), /not a recognized date format/i);
});

test('formatDate: text cell with day > 12 resolves unambiguously as DD/MM', () => {
  assert.equal(formatDate('25/03/2026'), '2026-03-25');
});

test('formatDate: text cell with month position > 12 resolves unambiguously as MM/DD', () => {
  assert.equal(formatDate('03/25/2026'), '2026-03-25');
});

test('formatDate: text cell genuinely ambiguous (both components <= 12) resolves via the MM/DD default', () => {
  // Previously (DD/MM default) this returned '2026-04-03'; the source is known to export
  // MM/DD/YYYY, so the correct reading is month=03, day=04.
  assert.equal(formatDate('03/04/2026'), '2026-03-04');
});

test('formatDate: calendar-invalid text-cell date throws instead of silently passing through', () => {
  assert.throws(() => formatDate('31/04/2026'), /valid calendar date/i);
});

test('resolveColumnMap: unambiguous headers each resolve to their own distinct column (no regression)', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Owner Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colDate, 'Date');
  assert.equal(map.colRole, 'Role');
  assert.equal(map.colOwner, 'Owner Name');
  assert.equal(map.colHours, 'Hours');
  assert.equal(map.colTask, 'Task');
  assert.equal(map.colProjId, 'Project ID');
});

test('resolveColumnMap: "Resource Name" is claimed by role, not duplicated onto owner', () => {
  const map = resolveColumnMap(['Date', 'Resource Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colRole, 'Resource Name');
  assert.notEqual(map.colOwner, 'Resource Name');
  assert.equal(map.colOwner, undefined);
});

test('resolveColumnMap: two owners sharing a role resolve to distinct row values, not collapsed onto role', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Owner Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colRole, 'Role');
  assert.equal(map.colOwner, 'Owner Name');

  const rows = [
    { Date: '2026-03-01', Role: 'Backend Developer', 'Owner Name': 'Alice', Hours: 7, Task: 'Build API', 'Project ID': 'P1' },
    { Date: '2026-03-01', Role: 'Backend Developer', 'Owner Name': 'Bob',   Hours: 3, Task: 'Build API', 'Project ID': 'P1' },
  ];
  assert.equal(rows[0][map.colOwner], 'Alice');
  assert.equal(rows[1][map.colOwner], 'Bob');
  assert.notEqual(rows[0][map.colOwner], rows[0][map.colRole]);
  assert.notEqual(rows[1][map.colOwner], rows[1][map.colRole]);
});

test('resolveColumnMap: "Project Name" resolves to colProjName, not colOwner (no separate Owner column)', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Project Name', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colProjName, 'Project Name');
  assert.notEqual(map.colOwner, 'Project Name');
});

test('resolveColumnMap: "Project Name" still resolves correctly even when it appears before the real Owner column', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Project Name', 'Owner', 'Hours', 'Task', 'Project ID']);
  assert.equal(map.colProjName, 'Project Name');
  assert.equal(map.colOwner, 'Owner');
});

test('resolveColumnMap: "Task Name" alone resolves to colTask, not colOwner', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Task Name', 'Hours', 'Project ID']);
  assert.equal(map.colTask, 'Task Name');
  assert.notEqual(map.colOwner, 'Task Name');
});

test('resolveColumnMap: Italian "Nome Progetto" + "Nome Risorsa" both resolve to their correct fields', () => {
  const map = resolveColumnMap(['Data', 'Ruolo', 'Nome Progetto', 'Nome Risorsa', 'Ore', 'Attività', 'Codice']);
  assert.equal(map.colProjName, 'Nome Progetto');
  assert.equal(map.colOwner, 'Nome Risorsa');
});

test('resolveColumnMap: "Data" (exact match) wins over "Data Chiusura" (partial match) for colDate', () => {
  const map = resolveColumnMap(['Data Chiusura', 'Data', 'Ruolo', 'Ore', 'Codice']);
  assert.equal(map.colDate, 'Data');
  assert.notEqual(map.colDate, 'Data Chiusura');
});

test('resolveColumnMap: "Surname" is not misassigned to colOwner via a bare substring match on "name"', () => {
  const map = resolveColumnMap(['Date', 'Role', 'Surname', 'Hours', 'Task', 'Project ID']);
  assert.notEqual(map.colOwner, 'Surname');
});

test('trimRowKeys: trims every key, leaves values untouched', () => {
  const row = { ' Date ': '2026-06-15', 'Role: Name    ': 'HWGDEV - DEVELOPER', 'Hours': 8 };
  const trimmed = trimRowKeys(row);
  assert.deepEqual(trimmed, { 'Date': '2026-06-15', 'Role: Name': 'HWGDEV - DEVELOPER', 'Hours': 8 });
});

test('trimRowKeys: a row with no whitespace in any key is unchanged', () => {
  const row = { Date: '2026-06-15', Role: 'Developer', Hours: 8 };
  assert.deepEqual(trimRowKeys(row), row);
});

test('trimRowKeys + resolveColumnMap: real header list resolves every field correctly, not empty', () => {
  // Exact real source headers (docs/superpowers/specs/2026-07-13-timesheet-owner-role-mapping-fix-design.md):
  // every header except Date and WF Project Name has trailing whitespace.
  const rawRow = {
    'Date': '2026-06-15',
    'Job ': 'HWGDEV',
    'Role: Name    ': 'HWGDEV - DEVELOPER',
    'Hour Type    ': 'Billable',
    'Owner: Name    ': 'Mario Rossi',
    'Hours    ': 8,
    'Task/Issue    ': 'Build API',
    'Notes    ': '',
    'D365 Project ID    ': 'HITA.000001823.001',
    'WF Project Name': 'Some Project',
  };

  const row = trimRowKeys(rawRow);
  const sampleKeys = Object.keys(row);
  const map = resolveColumnMap(sampleKeys);

  // Same field-extraction logic as POST /upload (api/src/routes/timesheets.js:121-130)
  const role        = map.colRole     ? String(row[map.colRole] ?? '').trim() : null;
  const owner       = map.colOwner    ? String(row[map.colOwner] ?? '').trim() : null;
  const hours       = map.colHours    ? (parseFloat(row[map.colHours]) || 0) : 0;
  const task        = map.colTask     ? String(row[map.colTask] ?? '').trim() : null;
  const projectCode = map.colProjId   ? String(row[map.colProjId] ?? '').trim() : '';

  assert.equal(role, 'HWGDEV - DEVELOPER');
  assert.equal(owner, 'Mario Rossi');
  assert.notEqual(role, owner); // the original symptom: these used to collapse to the same value
  assert.equal(hours, 8);
  assert.equal(task, 'Build API');
  assert.equal(projectCode, 'HITA.000001823.001'); // empty would silently drop the whole row
});

test('resolveColumnMap: candidate matches a later occurrence when the first occurrence is not a word boundary', () => {
  // "hours" first appears inside "afterhours" (no left word boundary — preceded by "r"),
  // then again as its own word " Hours" (clean boundaries on both sides). The pre-fix
  // matchSpecificity() only checked the FIRST occurrence and would return null here,
  // missing the match entirely; the fix scans every occurrence via a while loop.
  const map = resolveColumnMap(['Date', 'Role', 'afterhours Hours', 'Task', 'Project ID']);
  assert.strictEqual(map.colHours, 'afterhours Hours');
});

test('resolveColumnMap: two columns with identical header text both resolve, not collapsed onto one', () => {
  const map = resolveColumnMap(['Date', 'Notes', 'Hours', 'Task', 'Project ID', 'Notes']);
  // Both "Notes" columns exist in the input. This does NOT actually exercise the
  // usedHeaders index-vs-string fix: no two fields in today's FIELD_CANDIDATES table share
  // an overlapping candidate word, so a genuine cross-field collision on identical header
  // text isn't constructible from the current real candidate list without inventing an
  // artificial one. This test instead documents a narrower, still-useful invariant: duplicate
  // header text doesn't throw and doesn't corrupt the matching field's result (colNotes still
  // resolves to a "Notes" header). The usedHeaders fix's actual blast-radius benefit would
  // only manifest if a future candidate list ever introduces overlapping words across fields.
  assert.strictEqual(map.colNotes, 'Notes');
});

// ── findRoleTaskInconsistencies ─────────────────────────────────────────────
// Pre-save validation: every uploaded row's (task, role) must match a task and
// one of its configured resources, case-insensitively — same matching rule
// resolveFee() already uses for task names, but stricter on role (no
// fallback-to-first-resource: an unmatched role is always flagged, never
// silently accepted).

const TASKS_FIXTURE = [
  { name: 'Platform rollout', resources: [{ role: 'Senior Consultant' }, { role: 'Project Director' }] },
  { name: 'Training & handover', resources: [{ role: 'Senior Consultant' }] },
  { name: 'Discovery workshop', resources: [] },
];

test('findRoleTaskInconsistencies: task + role both configured returns no inconsistencies', () => {
  const entries = [{ projectCode: 'P1', task: 'Platform rollout', role: 'Senior Consultant' }];
  assert.deepEqual(findRoleTaskInconsistencies(entries, { P1: TASKS_FIXTURE }), []);
});

test('findRoleTaskInconsistencies: task match is case-insensitive, same as resolveFee', () => {
  const entries = [{ projectCode: 'P1', task: 'PLATFORM ROLLOUT', role: 'senior consultant' }];
  assert.deepEqual(findRoleTaskInconsistencies(entries, { P1: TASKS_FIXTURE }), []);
});

test('findRoleTaskInconsistencies: task not configured on the project is flagged', () => {
  const entries = [{ projectCode: 'P1', task: 'Unknown Task', role: 'Senior Consultant' }];
  const result = findRoleTaskInconsistencies(entries, { P1: TASKS_FIXTURE });
  assert.deepEqual(result, [{ projectCode: 'P1', task: 'Unknown Task', role: 'Senior Consultant' }]);
});

test('findRoleTaskInconsistencies: role not among the task\'s configured resources is flagged, never falls back to the first resource', () => {
  const entries = [{ projectCode: 'P1', task: 'Platform rollout', role: 'QA Engineer' }];
  const result = findRoleTaskInconsistencies(entries, { P1: TASKS_FIXTURE });
  assert.deepEqual(result, [{ projectCode: 'P1', task: 'Platform rollout', role: 'QA Engineer' }]);
});

test('findRoleTaskInconsistencies: blank/missing role on an otherwise-valid task is flagged', () => {
  const entries = [{ projectCode: 'P1', task: 'Platform rollout', role: '' }];
  const result = findRoleTaskInconsistencies(entries, { P1: TASKS_FIXTURE });
  assert.deepEqual(result, [{ projectCode: 'P1', task: 'Platform rollout', role: '' }]);
});

test('findRoleTaskInconsistencies: blank task name is flagged the same as any other unconfigured task', () => {
  const entries = [{ projectCode: 'P1', task: '', role: 'Senior Consultant' }];
  const result = findRoleTaskInconsistencies(entries, { P1: TASKS_FIXTURE });
  assert.deepEqual(result, [{ projectCode: 'P1', task: '', role: 'Senior Consultant' }]);
});

// Distinct from "task not configured" above: here the task genuinely exists on the
// project, it just has no resources at all configured on it yet — a real state (e.g. a
// freshly-added task row) that must be flagged the same way, not treated as if the task
// itself were missing.
test('findRoleTaskInconsistencies: a task that exists but has zero configured resources is flagged', () => {
  const entries = [{ projectCode: 'P1', task: 'Discovery workshop', role: 'Senior Consultant' }];
  const result = findRoleTaskInconsistencies(entries, { P1: TASKS_FIXTURE });
  assert.deepEqual(result, [{ projectCode: 'P1', task: 'Discovery workshop', role: 'Senior Consultant' }]);
});

// findRoleTaskInconsistencies() never reads entry.hours (the real POST /upload call site
// doesn't even forward it) — hours=0 rows are checked purely because every row is checked,
// not because of any hours-specific branch. Verified both ways: a valid row isn't flagged
// just for having hours=0, and an invalid row isn't excused by it either.
test('findRoleTaskInconsistencies: hours=0 has no bearing on the check — same result as any other row', () => {
  const entries = [
    { projectCode: 'P1', task: 'Platform rollout', role: 'Senior Consultant', hours: 0 },
    { projectCode: 'P1', task: 'Unknown Task', role: 'Senior Consultant', hours: 0 },
  ];
  const result = findRoleTaskInconsistencies(entries, { P1: TASKS_FIXTURE });
  assert.deepEqual(result, [{ projectCode: 'P1', task: 'Unknown Task', role: 'Senior Consultant' }]);
});

test('findRoleTaskInconsistencies: identical (task, role) repeated across many rows is deduplicated', () => {
  const entries = [
    { projectCode: 'P1', task: 'Unknown Task', role: 'Senior Consultant' },
    { projectCode: 'P1', task: 'Unknown Task', role: 'Senior Consultant' },
    { projectCode: 'P1', task: 'Unknown Task', role: 'Senior Consultant' },
  ];
  const result = findRoleTaskInconsistencies(entries, { P1: TASKS_FIXTURE });
  assert.equal(result.length, 1);
});

test('findRoleTaskInconsistencies: distinct project codes are checked against their own task list, and both surface', () => {
  const entries = [
    { projectCode: 'P1', task: 'Platform rollout', role: 'QA Engineer' },
    { projectCode: 'P2', task: 'Training & handover', role: 'Project Director' },
  ];
  const tasksByCode = { P1: TASKS_FIXTURE, P2: TASKS_FIXTURE };
  const result = findRoleTaskInconsistencies(entries, tasksByCode);
  assert.equal(result.length, 2);
  assert.ok(result.some(r => r.projectCode === 'P1' && r.task === 'Platform rollout'));
  assert.ok(result.some(r => r.projectCode === 'P2' && r.task === 'Training & handover'));
});

test('findRoleTaskInconsistencies: a project code with no configured tasks flags every row for that code', () => {
  const entries = [{ projectCode: 'P3', task: 'Anything', role: 'Anyone' }];
  const result = findRoleTaskInconsistencies(entries, { P3: [] });
  assert.deepEqual(result, [{ projectCode: 'P3', task: 'Anything', role: 'Anyone' }]);
});
