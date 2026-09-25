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
