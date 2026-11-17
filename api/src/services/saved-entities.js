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

const entities = {
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

module.exports = { entities, ratecardSnapshot };
