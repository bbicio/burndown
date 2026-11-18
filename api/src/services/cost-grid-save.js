// The cost grid editor's Save (PUT /api/cost-grids/:id/versions/:vId), split in the three steps its route
// runs inside one versionedWrite: the header, the structure, and the stage propagated to the linked
// projects. Every step takes the transaction's client; a refused rule throws ruleError, which rolls the
// whole Save back.
const rules = require('../lib/project-rules');
const { taskTitle, missingLinkedTasks, STRUCTURE_RULE_CODE } = require('../lib/structure-rules');
const { DATE_RULE, periodChangeError, taskDatesError, mergePeriod, periodColumn, toYmd } = require('../lib/dates');
const { versionRate, CURRENCY_RULE_CODE } = require('../lib/version-rate');
const { amountError, MONEY_RULE_CODE, MAX_DECIMAL_10_2 } = require('../lib/money-rules');
const { isValidSoldHours } = require('../lib/sold-hours');
const { structureBodyError } = require('../lib/input-rules');
const { versionedWrite } = require('./versioned-write');

const PIPELINE_STAGES = ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'];
const HEADER_FIELDS = ['label', 'pipeline', 'startDate', 'endDate', 'currency', 'note', 'ratecardId', 'clientId', 'projectName'];

// A refusal answered with `status` (400 by default) and { error, code }.
function ruleError(message, code, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.isRule = true;
  return err;
}

const taskLabel = tk => tk?.taskName || tk?.title || '';

// Checks and writes the header; decides currency_rate. Returns what the next steps need: the stored row,
// the currency and the period after this header.
async function applyHeader(client, vId, header, { role }) {
  const h = header || {};
  const stored = (await client.query(
    'SELECT pipeline, currency, start_date, end_date FROM cost_grid_versions WHERE id = $1', [vId]
  )).rows[0];
  const storedPeriod = { start: stored.start_date, end: stored.end_date };
  const bodyPeriod = {};
  if (h.startDate !== undefined) bodyPeriod.start = h.startDate;
  if (h.endDate !== undefined) bodyPeriod.end = h.endDate;
  const periodErr = periodChangeError(bodyPeriod, storedPeriod, { kind: 'month', label: 'version' });
  if (periodErr) throw ruleError(periodErr, DATE_RULE);
  const period = mergePeriod(bodyPeriod, storedPeriod);
  // The stage: one of the five, never back to Draft, and a Draft gets its stage only from publish (which also
  // sets the pipeline year and removes the other Drafts). The stage reaches the linked projects, so it is checked.
  if (h.pipeline !== undefined && h.pipeline !== stored.pipeline) {
    if (stored.pipeline === 'Draft') throw ruleError('A Draft gets its stage from Publish to SIP.');
    if (!PIPELINE_STAGES.includes(h.pipeline)) throw ruleError(`Invalid pipeline stage: ${h.pipeline}`);
  }

  const fields = [];
  const params = [];
  const set = (col, v) => { params.push(v); fields.push(`${col} = $${params.length}`); };
  if (h.label !== undefined)       set('label', typeof h.label === 'string' ? h.label.trim() : h.label);
  if (h.pipeline !== undefined)    set('pipeline', h.pipeline);
  if (h.startDate !== undefined)   set('start_date', periodColumn(h.startDate));
  if (h.endDate !== undefined)     set('end_date', periodColumn(h.endDate));
  if (h.note !== undefined)        set('note', h.note);
  if (h.ratecardId !== undefined)  set('ratecard_id', h.ratecardId || null);
  if (h.clientId !== undefined)    set('client_id', h.clientId || null);
  if (h.projectName !== undefined) set('project_name', h.projectName || '');

  let currency = stored.currency;
  if (h.currency !== undefined) {
    const hasProjects = (await client.query(
      `SELECT (EXISTS (SELECT 1 FROM cg_version_projects WHERE cost_grid_version_id = $1)
            OR EXISTS (SELECT 1 FROM projects WHERE cg_version_id = $1)) AS has`, [vId]
    )).rows[0].has;
    const err = rules.versionCurrencyChangeError({ role, currentCurrency: stored.currency, newCurrency: h.currency, hasProjects });
    if (err) throw ruleError(err, rules.RULE_CODE);
    // The rate follows the currency and is decided here only: EUR is 1, a new currency takes its active
    // rate, the same non-EUR currency keeps its rate even if since deactivated.
    currency = h.currency || 'EUR';
    set('currency', currency);
    if (currency === 'EUR') {
      set('currency_rate', 1);
    } else if (currency !== stored.currency) {
      const row = (await client.query('SELECT active, current_rate FROM currencies WHERE code = $1', [currency])).rows[0] || null;
      const rate = versionRate(currency, row);
      if (rate.error) throw ruleError(rate.error, CURRENCY_RULE_CODE);
      set('currency_rate', rate.rate);
    }
  }

  if (fields.length) {
    await client.query(`UPDATE cost_grid_versions SET ${fields.join(', ')} WHERE id = $${params.length + 1}`, [...params, vId]);
  }
  return { fields, stored, storedPeriod, period, currency };
}

// Checks the tasks against the period and, when `structure` is given, checks and writes it. Without a
// structure the stored tasks are checked against the new period and nothing else is written.
async function applyStructure(client, vId, structure, { currency, period, storedPeriod }) {
  const currentTasks = (await client.query(
    'SELECT t.id, t.title, t.start_date, t.end_date FROM tasks t JOIN phases p ON p.id = t.phase_id WHERE p.version_id = $1',
    [vId]
  )).rows;
  const storedTasks = currentTasks.map(t => ({ name: t.title, start: t.start_date, end: t.end_date }));

  if (structure === undefined || structure === null) {
    const err = taskDatesError({ tasks: storedTasks, storedTasks, storedPeriod, nextPeriod: period, parent: 'version' });
    if (err) throw ruleError(err, DATE_RULE);
    return;
  }

  const shapeErr = structureBodyError(structure);
  if (shapeErr) throw ruleError(shapeErr);
  const { phases = [], roles: rolesBody = [] } = structure;

  // The whole Save is refused — no automatic rounding — if any sold hours fall outside the allowed set.
  for (const ph of phases) {
    for (const tk of (ph?.tasks || [])) {
      if (tk?.hours && typeof tk.hours === 'object') {
        for (const [code, days] of Object.entries(tk.hours)) {
          if (!isValidSoldHours(days)) {
            throw ruleError(`Invalid sold hours "${days}" for role "${code}" in task "${taskLabel(tk)}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
          }
        }
      }
      for (const tr of (tk?.roles || [])) {
        if (tr?.days != null && !isValidSoldHours(tr.days)) {
          throw ruleError(`Invalid sold hours "${tr.days}" in task "${taskLabel(tk)}". Allowed values: whole numbers, or with a fraction of .25, .5, or .75.`);
        }
      }
    }
  }

  // Amounts are checked in the currency after this Save's header, not the stored one.
  for (const r of rolesBody) {
    if (r?.rate != null) {
      const err = amountError(r.rate, currency, `Rate for role "${r.roleCode || ''}"`, { max: MAX_DECIMAL_10_2 });
      if (err) throw ruleError(err, MONEY_RULE_CODE);
    }
  }
  for (const ph of phases) {
    for (const tk of (ph?.tasks || [])) {
      if (!tk) continue;
      const tkLabel = taskLabel(tk);
      if (tk.ptc != null) {
        const err = amountError(tk.ptc, currency, `PTC of task "${tkLabel}"`, { max: MAX_DECIMAL_10_2 });
        if (err) throw ruleError(err, MONEY_RULE_CODE);
      }
      if (!(tk.hours && typeof tk.hours === 'object')) {
        for (const tr of (tk.roles || [])) {
          if (tr?.rateOverride != null) {
            const err = amountError(tr.rateOverride, currency, `Rate override in task "${tkLabel}"`, { max: MAX_DECIMAL_10_2 });
            if (err) throw ruleError(err, MONEY_RULE_CODE);
          }
        }
      }
    }
  }

  const bodyTasks = phases.flatMap(ph => (ph?.tasks || []).filter(Boolean).map(tk => ({
    name: taskTitle(tk), start: tk.taskStartDate || tk.start_date, end: tk.taskEndDate || tk.end_date,
  })));
  const taskErr = taskDatesError({ tasks: bodyTasks, storedTasks, storedPeriod, nextPeriod: period, parent: 'version' });
  if (taskErr) throw ruleError(taskErr, DATE_RULE);

  const linkedRows = await client.query(
    'SELECT task_ids, task_names_direct FROM cg_version_projects WHERE cost_grid_version_id = $1', [vId]
  );
  const missing = missingLinkedTasks({
    linkedTaskIds: linkedRows.rows.flatMap(r => r.task_ids || []),
    linkedTaskNames: linkedRows.rows.flatMap(r => r.task_names_direct || []),
    currentTasks,
    payloadTaskIds: phases.flatMap(ph => (ph?.tasks || []).map(tk => tk?.taskId || tk?.id).filter(Boolean)),
    payloadTaskNames: bodyTasks.map(t => t.name),
  });
  if (missing.length) {
    throw ruleError(`Cannot save: tasks linked to a project would be removed: ${missing.map(t => `"${t.title}"`).join(', ')}`, STRUCTURE_RULE_CODE);
  }

  // Every role's rate is snapshotted, so the budget query always uses the rate the editor sees.
  const { rows: allRoles } = await client.query('SELECT id, code FROM roles');
  const roleByCode = Object.fromEntries(allRoles.map(r => [r.code, r.id]));
  const rateByCode = {};
  // Custom = the rate was written by hand; only the literal true counts.
  const customByCode = {};
  for (const r of rolesBody) {
    if (r.roleCode && r.rate != null) rateByCode[r.roleCode] = r.rate;
    if (r.roleCode) customByCode[r.roleCode] = r.rateIsCustom === true && r.rate != null;
  }

  await client.query('DELETE FROM phases WHERE version_id = $1', [vId]);
  for (let pi = 0; pi < phases.length; pi++) {
    const ph = phases[pi];
    if (!ph) continue;
    const phTitle = (ph.phaseName || ph.title || '').trim() || 'New Phase';
    const newPh = await client.query(
      'INSERT INTO phases (version_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [vId, phTitle, pi]
    );
    for (let ti = 0; ti < (ph.tasks || []).length; ti++) {
      const tk = ph.tasks[ti];
      if (!tk) continue;
      const tkTitle = taskTitle(tk);
      const tkDesc  = tk.taskDescription || tk.description || '';
      const normDate = v => toYmd(v) ?? '';
      const tkStart = normDate(tk.taskStartDate || tk.start_date  || '');
      const tkEnd   = normDate(tk.taskEndDate   || tk.end_date    || '');
      const tkId = tk.taskId || tk.id || null;
      const newTk = tkId
        ? await client.query(
            'INSERT INTO tasks (id, phase_id, title, description, start_date, end_date, ptc, sort_order) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [tkId, newPh.rows[0].id, tkTitle, tkDesc, tkStart, tkEnd, tk.ptc ?? 0, ti]
          )
        : await client.query(
            'INSERT INTO tasks (phase_id, title, description, start_date, end_date, ptc, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [newPh.rows[0].id, tkTitle, tkDesc, tkStart, tkEnd, tk.ptc ?? 0, ti]
          );
      // Accept both hours map {roleCode: days} and roles array [{roleId, days}]
      const taskRoles = [];
      if (tk.hours && typeof tk.hours === 'object') {
        for (const [code, days] of Object.entries(tk.hours)) {
          const roleId = roleByCode[code];
          if (roleId && days > 0) taskRoles.push({
            roleId, days, rateOverride: rateByCode[code] ?? null, rateIsCustom: customByCode[code] === true, months: null,
          });
        }
      } else {
        for (const tr of (tk.roles || [])) {
          const roleId = tr.roleId || roleByCode[tr.roleCode || tr.code];
          if (roleId) taskRoles.push({ roleId, days: tr.days || 0, rateOverride: tr.rateOverride ?? null, rateIsCustom: tr.rateIsCustom === true, months: tr.months || null });
        }
      }
      for (const tr of taskRoles) {
        await client.query(
          'INSERT INTO task_roles (task_id, role_id, days, rate_override, months, rate_is_custom) VALUES ($1, $2, $3, $4, $5, $6)',
          [newTk.rows[0].id, tr.roleId, tr.days, tr.rateOverride, tr.months, tr.rateIsCustom]
        );
      }
    }
  }
}

// Writes `pipeline` on every project linked to the version that does not have it yet, each one a logged
// project update. Linked = a cg_version_projects row or projects.cg_version_id. Locked in id order.
async function propagateStage(client, vId, pipeline, userId) {
  const { rows } = await client.query(
    `SELECT id FROM projects
     WHERE (cg_version_id = $1 OR id IN (SELECT project_id FROM cg_version_projects WHERE cost_grid_version_id = $1))
       AND pipeline IS DISTINCT FROM $2
     ORDER BY id`,
    [vId, pipeline]
  );
  for (const { id } of rows) {
    await versionedWrite(client, {
      type: 'project', id, unchecked: true, action: 'update', userId,
      write: c => c.query('UPDATE projects SET pipeline = $1 WHERE id = $2', [pipeline, id]),
    });
  }
  return rows.map(r => r.id);
}

module.exports = { HEADER_FIELDS, ruleError, applyHeader, applyStructure, propagateStage };
