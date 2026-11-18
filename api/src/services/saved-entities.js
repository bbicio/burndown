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

// The columns of one element of GET /api/projects, read over `projects p` joined by PROJECT_FROM; the
// per-viewer my_permission is added by the route. `links` are the project's cg_version_projects rows.
const PROJECT_COLUMNS = `p.id, p.code, p.name, p.program_id, p.client_id, p.pipeline, p.status,
              p.start_date, p.end_date, p.currency, p.cg_version_id, cgv.cost_grid_id AS cg_id, p.created_at,
              p.owner_id, p.phasing, p.ptc, p.planning, p.groups,
              p.description, p.version,
              u.first_name || ' ' || u.last_name AS owner_name,
              c.name AS client_name,
              pr.name AS program_name,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'name',                 pt.name,
                   'billable',             pt.billable,
                   'completed',            pt.completed,
                   'startDate',            pt.start_date,
                   'endDate',              pt.end_date,
                   'monthlyDistribution',  pt.monthly_distribution,
                   'resources',            pt.resources,
                   'description',          pt.description
                 ) ORDER BY pt.sort_order)
                 FROM project_tasks pt WHERE pt.project_id = p.id),
                '[]'::json
              ) AS tasks,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'versionId', cvp.cost_grid_version_id,
                   'cgId',      lv.cost_grid_id,
                   'taskIds',   cvp.task_ids,
                   'taskNames', cvp.task_names_direct
                 ) ORDER BY cvp.cost_grid_version_id)
                 FROM cg_version_projects cvp
                 JOIN cost_grid_versions lv ON lv.id = cvp.cost_grid_version_id
                 WHERE cvp.project_id = p.id),
                '[]'::json
              ) AS links`;
const PROJECT_FROM = `FROM projects p
       JOIN users u ON u.id = p.owner_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN programs pr ON pr.id = p.program_id
       LEFT JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id`;

// One element of GET /api/projects (without my_permission). Null when the project does not exist.
async function projectSnapshot(client, id) {
  const { rows } = await client.query(`SELECT ${PROJECT_COLUMNS} ${PROJECT_FROM} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

// The program and the shares of the projects in it. Null when the program does not exist.
async function programSnapshot(client, id) {
  const { rows } = await client.query('SELECT id, name, version FROM programs WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const shares = await client.query(
    `SELECT rs.resource_id AS "projectId", rs.user_id AS "userId", rs.permission
     FROM resource_shares rs JOIN projects p ON p.id = rs.resource_id
     WHERE rs.resource_type = 'project' AND p.program_id = $1
     ORDER BY rs.resource_id, rs.user_id`, [id]
  );
  return { ...rows[0], shares: shares.rows };
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
  program: {
    table: 'programs',
    staleMessage: 'This program was changed by someone else since you opened it.',
    notFoundMessage: 'Program not found',
    snapshot: programSnapshot,
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

module.exports = { entities, ratecardSnapshot, structureOf, PROJECT_COLUMNS, PROJECT_FROM };
