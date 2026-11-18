// The project's Save (PUT /api/projects/:id) and the two cost grid operations that write a project
// (Generate, Add tasks), split in the steps their routes run inside one versionedWrite. Every step takes the
// transaction's client; a refused rule throws ruleError, which rolls the whole write back.
const rules = require('../lib/project-rules');
const { isUuid, taskListError } = require('../lib/input-rules');
const { isValidSoldHours } = require('../lib/sold-hours');
const { DATE_RULE, periodError, periodChangeError, periodChanged, taskDatesError, mergePeriod, periodColumn, monthKeysError, toYmd } = require('../lib/dates');
const { amountError, ptcRowsError, phasingError, MONEY_RULE_CODE, MAX_DECIMAL_10_2 } = require('../lib/money-rules');
const { descriptionsSignature } = require('../lib/topic-extract');
const { ruleError } = require('./cost-grid-save');
const { respondSaveError } = require('./versioned-write');
const { isAdminRole } = require('../lib/is-admin');

const PROJECT_HEADER_FIELDS = ['name', 'code', 'programId', 'clientId', 'startDate', 'endDate',
  'currency', 'pipeline', 'status', 'description', 'cgVersionId'];
const PROJECT_SECTIONS = ['tasks', 'phasing', 'ptc', 'planning', 'groups'];
const HEADER_COLUMN = {
  name: 'name', code: 'code', programId: 'program_id', clientId: 'client_id', startDate: 'start_date',
  endDate: 'end_date', currency: 'currency', pipeline: 'pipeline', status: 'status',
  description: 'description', cgVersionId: 'cg_version_id',
};

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const cleanName = n => (n || '').replace(/\s+/g, ' ').trim();

// Answers a save-contract refusal (409 STALE, 404) or a ruleError (its status, { error, code? }); true when it did.
function respondWriteError(res, err) {
  if (respondSaveError(res, err)) return true;
  if (!err.isRule) return false;
  res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
  return true;
}

// A program the caller may attach a project to: the same rule as PATCH /programs/:id — an admin, a program with no
// projects yet, or owner/editor on one of its projects. Otherwise a 403 ruleError, so a project of one's own cannot
// be used to reach a program's share (POST /programs/:id/share). Null when allowed.
async function programAccessError(client, programId, { userId, role }) {
  if (!programId || isAdminRole(role)) return null;
  const projects = (await client.query('SELECT id FROM projects WHERE program_id = $1', [programId])).rows;
  if (!projects.length) return null;
  const access = await client.query(
    `SELECT 1 FROM projects p
     LEFT JOIN resource_shares rs ON rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
     WHERE p.id = ANY($2::uuid[]) AND (p.owner_id = $1 OR (rs.user_id IS NOT NULL AND rs.permission IN ('owner','editor')))
     LIMIT 1`,
    [userId, projects.map(p => p.id)]
  );
  return access.rows.length ? null : ruleError('Access denied', undefined, 403);
}

// The shape of a Save body, checked before the transaction: null, or the 400 message.
function projectSaveBodyError(body) {
  if (!isObj(body)) return 'Nothing to update';
  for (const k of Object.keys(body)) {
    if (k !== 'version' && k !== 'header' && !PROJECT_SECTIONS.includes(k)) return `Unknown field: ${k}`;
  }
  const { header } = body;
  if (header !== undefined && !isObj(header)) return 'header must be an object';
  for (const k of Object.keys(header || {})) {
    if (!PROJECT_HEADER_FIELDS.includes(k)) return `Unknown field: ${k}`;
  }
  for (const key of ['cgVersionId', 'clientId']) {
    const v = header?.[key];
    if (v && (typeof v !== 'string' || !isUuid(v))) return `${key} must be a valid UUID`;
  }
  const hasHeader = Object.keys(header || {}).length > 0;
  if (!hasHeader && !PROJECT_SECTIONS.some(s => body[s] !== undefined)) return 'Nothing to update';
  return null;
}

// The sold hours and rates of a task list, checked before any write: throws a ruleError, or returns the tasks
// with a blank rate saved as 0.
function checkedTasks(tasks, currency) {
  const shapeErr = taskListError(tasks);
  if (shapeErr) throw ruleError(shapeErr);
  for (const t of tasks) {
    for (const r of (t?.resources || [])) {
      if (r?.soldHours != null && !isValidSoldHours(r.soldHours)) {
        throw ruleError(`Invalid sold hours "${r.soldHours}" for role "${r.role || ''}" on task "${t.name || ''}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
      }
    }
  }
  return tasks.map(t => {
    if (!Array.isArray(t.resources)) return t;
    const resources = t.resources.map(r => (r.hourlyRate === undefined || r.hourlyRate === null || r.hourlyRate === ''
      ? { ...r, hourlyRate: 0 } : r));
    for (const r of resources) {
      const err = amountError(r.hourlyRate, currency, `Hourly rate of "${r.role || ''}" on task "${t.name || ''}"`, { max: MAX_DECIMAL_10_2 });
      if (err) throw ruleError(err, MONEY_RULE_CODE);
    }
    return { ...t, resources };
  });
}

// Checks and writes a project's task list. append: false replaces the list; true adds `tasks` after the
// stored ones. The dates are checked on the final list against `period` (the stored one is `storedPeriod`).
async function applyTasks(client, projectId, tasks, { currency, period, storedPeriod, append = false }) {
  const list = checkedTasks(tasks, currency);
  const before = (await client.query(
    'SELECT name, description, start_date, end_date, sort_order FROM project_tasks WHERE project_id = $1 ORDER BY sort_order',
    [projectId]
  )).rows;
  const storedTasks = before.map(t => ({ name: t.name, start: t.start_date, end: t.end_date }));
  const incoming = list.map(t => ({ name: t?.name || '', start: t?.startDate, end: t?.endDate }));
  const taskErr = taskDatesError({
    tasks: append ? [...storedTasks, ...incoming] : incoming,
    storedTasks, storedPeriod: storedPeriod || period, nextPeriod: period, parent: 'project',
  });
  if (taskErr) throw ruleError(taskErr, DATE_RULE);

  let first = 0;
  if (append) {
    first = before.length ? Math.max(...before.map(t => t.sort_order)) + 1 : 0;
  } else {
    await client.query('DELETE FROM project_tasks WHERE project_id = $1', [projectId]);
  }
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    await client.query(
      `INSERT INTO project_tasks
       (project_id, name, billable, completed, start_date, end_date,
        monthly_distribution, resources, sort_order, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [projectId, cleanName(t.name), t.billable ?? true, t.completed ?? false,
       toYmd(t.startDate) ?? null, toYmd(t.endDate) ?? null,
       t.monthlyDistribution ? JSON.stringify(t.monthlyDistribution) : null,
       t.resources ? JSON.stringify(t.resources) : null, first + i, String(t.description ?? '')]
    );
  }
  const written = list.map(t => ({ name: cleanName(t.name), description: String(t.description ?? '') }));
  const after = append ? [...before.map(t => ({ name: t.name, description: t.description })), ...written] : written;
  return { descriptionsChanged: descriptionsSignature(before) !== descriptionsSignature(after) };
}

// Checks and writes the sections present (phasing, ptc, planning, groups). Amounts in `currency`; month keys
// against `period`, a key already stored being tolerated.
async function applySections(client, projectId, { phasing, ptc, planning, groups }, { currency, period, stored }) {
  const sets = [];
  const params = [];
  const set = (col, v) => { params.push(JSON.stringify(v)); sets.push(`${col} = $${params.length}`); };
  if (phasing !== undefined) {
    const err = phasingError(phasing, currency);
    if (err) throw ruleError(err, MONEY_RULE_CODE);
    const dateErr = monthKeysError(Object.keys(phasing).map(k => ({ key: k, label: `Phasing ${k}` })),
      period, Object.keys(stored.phasing || {}));
    if (dateErr) throw ruleError(dateErr, DATE_RULE);
    set('phasing', phasing);
  }
  if (ptc !== undefined) {
    const err = ptcRowsError(ptc, currency);
    if (err) throw ruleError(err, MONEY_RULE_CODE);
    const dateErr = monthKeysError(ptc.map((r, i) => ({ key: r.month, label: `PTC row ${i + 1}` })),
      period, (Array.isArray(stored.ptc) ? stored.ptc : []).map(r => r?.month));
    if (dateErr) throw ruleError(dateErr, DATE_RULE);
    set('ptc', ptc);
  }
  if (planning !== undefined) {
    const keys = isObj(planning) ? Object.keys(planning) : [];
    const dateErr = monthKeysError(keys.map(k => ({ key: k, label: `Planning ${k}` })),
      period, Object.keys(stored.planning || {}));
    if (dateErr) throw ruleError(dateErr, DATE_RULE);
    set('planning', planning);
  }
  if (groups !== undefined) set('groups', groups);
  if (sets.length) {
    await client.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length + 1}`, [...params, projectId]);
  }
}

// The Save of PUT /api/projects/:id inside its versionedWrite: every rule on the final state (the period after
// this header, the tasks of the body or the stored ones), then the writes. The caller holds the lock of the
// version header.cgVersionId names. Returns the profile codes to queue and the version whose tags seed the
// project (its first link), both for after the commit.
async function applyProjectSave(client, id, body, { role, userId }) {
  const h = body.header || {};
  const stored = (await client.query(
    `SELECT name, code, description, start_date, end_date, currency, cg_version_id, program_id, phasing, ptc, planning
     FROM projects WHERE id = $1`, [id]
  )).rows[0];

  if (h.programId && h.programId !== stored.program_id) {
    const err = await programAccessError(client, h.programId, { userId, role });
    if (err) throw err;
  }

  if (h.currency !== undefined) {
    const err = rules.projectCurrencyChangeError({ role, currentCurrency: stored.currency, newCurrency: h.currency });
    if (err) throw ruleError(err, rules.RULE_CODE);
  }
  const currency = (h.currency !== undefined ? h.currency : stored.currency) || stored.currency;

  let seedFromVersionId = null;
  if (h.cgVersionId !== undefined) {
    const err = rules.projectLinkChangeError({ role, currentVersionId: stored.cg_version_id, newVersionId: h.cgVersionId });
    if (err) throw ruleError(err, rules.RULE_CODE);
    const target = h.cgVersionId;
    if (target && String(target).toLowerCase() !== String(stored.cg_version_id || '').toLowerCase()) {
      const ver = (await client.query('SELECT currency FROM cost_grid_versions WHERE id = $1', [target])).rows[0];
      if (!ver) throw ruleError(rules.MESSAGES.versionNotFound, rules.RULE_CODE);
      const linkErr = rules.linkCurrencyError({ role, projectCurrency: currency, versionCurrency: ver.currency });
      if (linkErr) throw ruleError(linkErr, rules.RULE_CODE);
      if (!stored.cg_version_id) seedFromVersionId = target;
    }
  }

  const storedPeriod = { start: stored.start_date, end: stored.end_date };
  const bodyPeriod = {};
  if (h.startDate !== undefined) bodyPeriod.start = h.startDate;
  if (h.endDate !== undefined) bodyPeriod.end = h.endDate;
  const periodErr = periodChangeError(bodyPeriod, storedPeriod, { kind: 'month', label: 'project' });
  if (periodErr) throw ruleError(periodErr, DATE_RULE);
  const period = mergePeriod(bodyPeriod, storedPeriod);
  const periodMoved = periodChanged(bodyPeriod, storedPeriod);

  let descriptionsChanged = false;
  if (body.tasks !== undefined) {
    ({ descriptionsChanged } = await applyTasks(client, id, body.tasks, { currency, period, storedPeriod }));
  } else if (periodMoved) {
    const tasks = (await client.query('SELECT name, start_date, end_date FROM project_tasks WHERE project_id = $1', [id]))
      .rows.map(t => ({ name: t.name, start: t.start_date, end: t.end_date }));
    const err = taskDatesError({ tasks, storedTasks: tasks, storedPeriod, nextPeriod: period, parent: 'project' });
    if (err) throw ruleError(err, DATE_RULE);
  }
  await applySections(client, id, body, { currency, period, stored });

  const fields = [];
  const params = [];
  for (const key of PROJECT_HEADER_FIELDS) {
    if (h[key] === undefined) continue;
    if ((key === 'startDate' || key === 'endDate') && !periodMoved) continue;
    let v;
    if (key === 'description') v = String(h[key] ?? '');
    else if (key === 'startDate' || key === 'endDate') v = periodColumn(h[key]);
    else if (key === 'name' || key === 'code') v = typeof h[key] === 'string' ? (h[key].trim() || null) : (h[key] || null);
    else v = h[key] || null;
    params.push(v);
    fields.push(`${HEADER_COLUMN[key]} = $${params.length}`);
  }
  if (fields.length) {
    await client.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = $${params.length + 1}`, [...params, id]);
  }

  const now = (await client.query('SELECT name, code, description FROM projects WHERE id = $1', [id])).rows[0];
  const changed = now.name !== stored.name || now.code !== stored.code
    || String(now.description ?? '') !== String(stored.description ?? '')
    || descriptionsChanged || !!seedFromVersionId;
  const codes = changed ? [...new Set([stored.code, now.code].filter(Boolean))] : [];
  return { enqueue: codes.length > 0, seedFromVersionId, codes };
}

// Adds task ids and names to the version↔project link, creating it when missing: the union with what is stored,
// in order and without duplicates. Nothing is ever removed here.
async function upsertLink(client, versionId, projectId, taskIds, taskNames) {
  const row = (await client.query(
    'SELECT task_ids, task_names_direct FROM cg_version_projects WHERE cost_grid_version_id = $1 AND project_id = $2 FOR UPDATE',
    [versionId, projectId]
  )).rows[0];
  const union = (stored, added) => {
    const out = [];
    for (const x of [...(Array.isArray(stored) ? stored : []), ...(Array.isArray(added) ? added : [])]) {
      if (!out.includes(x)) out.push(x);
    }
    return out;
  };
  const name = (await client.query('SELECT name FROM projects WHERE id = $1', [projectId])).rows[0]?.name ?? null;
  await client.query(
    `INSERT INTO cg_version_projects (cost_grid_version_id, project_id, project_name, task_ids, task_names_direct)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (cost_grid_version_id, project_id)
     DO UPDATE SET task_ids = EXCLUDED.task_ids, task_names_direct = EXCLUDED.task_names_direct`,
    [versionId, projectId, name, JSON.stringify(union(row?.task_ids, taskIds)), JSON.stringify(union(row?.task_names_direct, taskNames))]
  );
  return { created: !row };
}

// Generate (POST /api/cost-grids/:id/versions/:vId/projects) inside versionedWrite(create): the project with the
// currency and the stage of `version` (never the body's), its owner share, tasks, ptc, the link and the version's
// tags. The caller holds the version lock. Returns { id }.
async function applyCreate(client, { body, version, userId, role }) {
  const b = isObj(body) ? body : {};
  const createErr = rules.projectCreateError({ role, versionId: version.id });
  if (createErr) throw ruleError(createErr, rules.RULE_CODE);
  const linkErr = rules.linkCurrencyError({ role, projectCurrency: version.currency, versionCurrency: version.currency });
  if (linkErr) throw ruleError(linkErr, rules.RULE_CODE);
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) throw ruleError('name is required');
  const periodErr = periodError(b.startDate, b.endDate, { kind: 'month', label: 'project' });
  if (periodErr) throw ruleError(periodErr, DATE_RULE);
  const tasks = b.tasks === undefined ? [] : b.tasks;
  const ptc = b.ptc === undefined ? [] : b.ptc;
  const clientId = typeof b.clientId === 'string' && isUuid(b.clientId) ? b.clientId : null;
  const currency = version.currency || 'EUR';
  const programErr = await programAccessError(client, b.programId, { userId, role });
  if (programErr) throw programErr;

  const id = (await client.query(
    `INSERT INTO projects (code, name, program_id, client_id, start_date, end_date, currency, pipeline, status, cg_version_id, owner_id, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10, $11) RETURNING id`,
    [typeof b.code === 'string' ? (b.code.trim() || null) : null, name, b.programId || null, clientId,
     periodColumn(b.startDate), periodColumn(b.endDate), currency, version.pipeline || null, version.id, userId,
     String(b.description ?? '')]
  )).rows[0].id;
  await client.query(
    `INSERT INTO resource_shares (resource_type, resource_id, user_id, permission, shared_by)
     VALUES ('project', $1, $2, 'owner', $2)`, [id, userId]
  );
  const period = mergePeriod({ start: b.startDate, end: b.endDate }, {});
  await applyTasks(client, id, tasks, { currency, period, storedPeriod: period });
  await applySections(client, id, { ptc }, { currency, period, stored: {} });
  await upsertLink(client, version.id, id, b.taskIds, b.taskNames);
  await client.query(
    `INSERT INTO project_tags (project_id, item_id)
     SELECT $1::uuid, cvt.item_id FROM cost_grid_version_tags cvt WHERE cvt.version_id = $2::uuid
     ON CONFLICT DO NOTHING`, [id, version.id]
  );
  return { id };
}

module.exports = {
  PROJECT_HEADER_FIELDS, projectSaveBodyError, programAccessError, applyProjectSave, applyTasks, applySections, applyCreate, upsertLink,
  respondWriteError,
};
