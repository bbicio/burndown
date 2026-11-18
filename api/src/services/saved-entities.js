// The entity types the save contract knows: the table that carries `version`, the English messages
// of a refusal, and snapshot(client, id) — the object written to change_log and returned to the
// client after a save. One entry per type; the table name never comes from the request.

// Same shape as GET /api/ratecards/:id. Null when the card does not exist.
async function ratecardSnapshot(client, id) {
  const { rows } = await client.query(`
    SELECT r.id, r.name, r.client_id, r.version,
           COALESCE(
             json_agg(
               json_build_object('roleId', re.role_id, 'label', ro.label, 'hourlyRate', re.hourly_rate,
                                 'rateOverrides', COALESCE(re.rate_overrides, '{}'))
               ORDER BY ro.label
             ) FILTER (WHERE re.id IS NOT NULL), '[]'
           ) AS entries
    FROM ratecards r
    LEFT JOIN ratecard_entries re ON re.ratecard_id = r.id
    LEFT JOIN roles ro ON ro.id = re.role_id
    WHERE r.id = $1
    GROUP BY r.id, r.name, r.client_id, r.version
  `, [id]);
  return rows[0] || null;
}

// Same columns as GET /api/roles.
async function roleSnapshot(client, id) {
  const { rows } = await client.query(
    'SELECT id, label, code, team, hourly_rate, rate_overrides, version FROM roles WHERE id = $1', [id]
  );
  return rows[0] || null;
}

// The phases of a version, same shape as GET /api/cost-grids/:id/versions/:vId/structure.
async function structureOf(client, vId) {
  const toInputDate = d => d && d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : (d || '');
  const phases = await client.query('SELECT * FROM phases WHERE version_id = $1 ORDER BY sort_order', [vId]);
  const result = [];
  for (const ph of phases.rows) {
    const tasks = await client.query('SELECT * FROM tasks WHERE phase_id = $1 ORDER BY sort_order', [ph.id]);
    const tasksWithRoles = [];
    for (const tk of tasks.rows) {
      const roles = await client.query(
        `SELECT tr.id, tr.role_id, ro.label, ro.code, ro.hourly_rate, tr.days, tr.rate_override, tr.months, tr.rate_is_custom
         FROM task_roles tr JOIN roles ro ON ro.id = tr.role_id WHERE tr.task_id = $1`,
        [tk.id]
      );
      tasksWithRoles.push({
        id:          tk.id,
        title:       tk.title,
        description: tk.description || '',
        start_date:  toInputDate(tk.start_date),
        end_date:    toInputDate(tk.end_date),
        ptc:         parseFloat(tk.ptc) || 0,
        sort_order:  tk.sort_order,
        roles:       roles.rows,
      });
    }
    result.push({ ...ph, tasks: tasksWithRoles });
  }
  return result;
}

// The header columns of GET /api/cost-grids/:id/versions, plus the structure. Null when missing.
async function costGridVersionSnapshot(client, vId) {
  const { rows } = await client.query(
    `SELECT id, cost_grid_id, label, pipeline, pipeline_year, start_date, end_date, currency, currency_rate,
            note, locked, ratecard_id, client_id, project_name, version
     FROM cost_grid_versions WHERE id = $1`, [vId]
  );
  if (!rows[0]) return null;
  return { ...rows[0], structure: { phases: await structureOf(client, vId) } };
}

async function costGridSnapshot(client, id) {
  const { rows } = await client.query('SELECT id, name, owner_id, version FROM cost_grids WHERE id = $1', [id]);
  return rows[0] || null;
}

// The project row; cycle 3 widens it to the project's sections.
async function projectSnapshot(client, id) {
  const { rows } = await client.query('SELECT * FROM projects WHERE id = $1', [id]);
  return rows[0] || null;
}

const entities = {
  cost_grid: {
    table: 'cost_grids',
    staleMessage: 'This proposal was changed by someone else since you opened it.',
    notFoundMessage: 'Cost grid not found',
    snapshot: costGridSnapshot,
  },
  cost_grid_version: {
    table: 'cost_grid_versions',
    staleMessage: 'This version was changed by someone else since you opened it.',
    notFoundMessage: 'Version not found',
    snapshot: costGridVersionSnapshot,
  },
  project: {
    table: 'projects',
    staleMessage: 'This project was changed by someone else since you opened it.',
    notFoundMessage: 'Project not found',
    snapshot: projectSnapshot,
  },
  role: {
    table: 'roles',
    staleMessage: 'This role was changed by someone else since you opened it.',
    notFoundMessage: 'Role not found',
    snapshot: roleSnapshot,
  },
  ratecard: {
    table: 'ratecards',
    staleMessage: 'This rate card was changed by someone else since you opened it.',
    notFoundMessage: 'Ratecard not found',
    snapshot: ratecardSnapshot,
  },
};

module.exports = { entities, ratecardSnapshot, structureOf };
