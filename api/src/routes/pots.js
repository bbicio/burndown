const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { potVersionsCte } = require('../lib/pot-fee-sql');
const { amountError, MONEY_RULE_CODE } = require('../lib/money-rules');

const router = express.Router();

// Every route reads proposals through `pot_v`: one reference version per proposal, with its fee
// computed once. Stage, year, client and value of a proposal are those of its reference version.

const zeroTotals = () => ({ pot_total: 0, committed_total: 0, anticipated_total: 0, expected_total: 0, sip_total: 0 });

// GET /api/pots/pipeline-summary?year=YYYY
// Per-stage count of proposals + total budget value for the whole pipeline year (all users).
// Must be declared before /:id routes.
router.get('/pipeline-summary', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year is required' });
    const yr = parseInt(year);

    const { rows } = await query(
      `WITH ${potVersionsCte()}
       SELECT
         cgv.pipeline,
         COUNT(*)::int AS count,
         COALESCE(SUM(cgv.fee_eur), 0) AS total
       FROM pot_v cgv
       WHERE cgv.pipeline_year = $1
         AND cgv.pipeline IN ('SIP','Expected','Anticipated','Committed','Canceled')
       GROUP BY cgv.pipeline`,
      [yr]
    );

    const stages = ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled'];
    const byStage = Object.fromEntries(rows.map(r => [r.pipeline, r]));
    res.json(stages.map(s => ({
      pipeline: s,
      count:    byStage[s]?.count || 0,
      total:    parseFloat(byStage[s]?.total || 0),
    })));
  } catch (err) { next(err); }
});

// GET /api/pots/year-totals
// Returns { year: { pot_total, committed_total, anticipated_total, expected_total, sip_total, achieved_total } }.
// achieved_total = committed + anticipated (kept for backward compat); Expected/SIP are informative.
// Must be declared before /:id routes.
router.get('/year-totals', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows: potRows } = await query(
      `SELECT year, COALESCE(SUM(amount), 0) AS pot_total FROM pots GROUP BY year`
    );

    const { rows: valRows } = await query(
      `WITH ${potVersionsCte()}
       SELECT cgv.pipeline_year AS year, cgv.pipeline, cgv.fee_eur AS fee
       FROM pot_v cgv
       WHERE cgv.pipeline IN ('Committed', 'Anticipated', 'Expected', 'SIP')
         AND cgv.pipeline_year IS NOT NULL`
    );

    const result = {};
    for (const r of potRows) {
      result[r.year] = { ...zeroTotals(), pot_total: parseFloat(r.pot_total) };
    }
    for (const r of valRows) {
      if (!result[r.year]) result[r.year] = zeroTotals();
      const fee = parseFloat(r.fee) || 0;
      if (r.pipeline === 'Committed')   result[r.year].committed_total   += fee;
      if (r.pipeline === 'Anticipated') result[r.year].anticipated_total += fee;
      if (r.pipeline === 'Expected')    result[r.year].expected_total    += fee;
      if (r.pipeline === 'SIP')         result[r.year].sip_total         += fee;
    }
    for (const v of Object.values(result)) {
      v.achieved_total = v.committed_total + v.anticipated_total;
    }
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/pots/summary?year=YYYY&(clientId=...|clientGroupId=...)
// Returns the POT target + all non-Draft proposals for that target/year.
// Must be declared before /:id routes to avoid Express routing conflicts.
router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const { year, clientId, clientGroupId } = req.query;
    if (!year || (!clientId && !clientGroupId)) {
      return res.status(400).json({ error: 'year and clientId or clientGroupId are required' });
    }
    const yr = parseInt(year);

    // Resolve the POT target
    let potQ, potParams;
    if (clientGroupId) {
      potQ = 'SELECT * FROM pots WHERE client_group_id = $1 AND year = $2';
      potParams = [clientGroupId, yr];
    } else {
      potQ = 'SELECT * FROM pots WHERE client_id = $1 AND year = $2';
      potParams = [clientId, yr];
    }
    const potResult = await query(potQ, potParams);
    const pot = potResult.rows[0] || null;

    // Find all proposals for this target + year (match via the reference version's client_id)
    let proposalsQ, proposalsParams;
    if (clientGroupId) {
      proposalsQ = `
        WITH ${potVersionsCte()}
        SELECT
          cgv.id AS version_id, cgv.label, cgv.pipeline, cgv.pipeline_year,
          cg.id AS cg_id, cg.name AS proposal_name,
          u.first_name || ' ' || u.last_name AS owner_name,
          cli.name AS client_name,
          cgv.fee_eur AS value
        FROM pot_v cgv
        JOIN cost_grids cg ON cg.id = cgv.cost_grid_id
        JOIN users u ON u.id = cg.owner_id
        LEFT JOIN clients cli ON cli.id = cgv.client_id
        WHERE cgv.client_id IN (SELECT id FROM clients WHERE group_id = $1)
          AND cgv.pipeline_year = $2
          AND cgv.pipeline != 'Draft'
        ORDER BY cgv.pipeline, cg.name`;
      proposalsParams = [clientGroupId, yr];
    } else {
      proposalsQ = `
        WITH ${potVersionsCte()}
        SELECT
          cgv.id AS version_id, cgv.label, cgv.pipeline, cgv.pipeline_year,
          cg.id AS cg_id, cg.name AS proposal_name,
          u.first_name || ' ' || u.last_name AS owner_name,
          cli.name AS client_name,
          cgv.fee_eur AS value
        FROM pot_v cgv
        JOIN cost_grids cg ON cg.id = cgv.cost_grid_id
        JOIN users u ON u.id = cg.owner_id
        LEFT JOIN clients cli ON cli.id = cgv.client_id
        WHERE cgv.client_id = $1
          AND cgv.pipeline_year = $2
          AND cgv.pipeline != 'Draft'
        ORDER BY cgv.pipeline, cg.name`;
      proposalsParams = [clientId, yr];
    }
    const proposalsResult = await query(proposalsQ, proposalsParams);

    // Compute fee totals server-side across ALL proposals (not just those visible to caller)
    const totalsSelect = `
        WITH ${potVersionsCte()}
        SELECT
          COALESCE(SUM(cgv2.fee_eur) FILTER (WHERE cgv2.pipeline = 'Committed'),   0) AS committed_total,
          COALESCE(SUM(cgv2.fee_eur) FILTER (WHERE cgv2.pipeline = 'Anticipated'), 0) AS anticipated_total,
          COALESCE(SUM(cgv2.fee_eur) FILTER (WHERE cgv2.pipeline = 'Expected'),    0) AS expected_total,
          COALESCE(SUM(cgv2.fee_eur) FILTER (WHERE cgv2.pipeline = 'SIP'),         0) AS sip_total
        FROM pot_v cgv2`;

    let totalsQ, totalsParams;
    if (clientGroupId) {
      totalsQ = `${totalsSelect}
        WHERE cgv2.client_id IN (SELECT id FROM clients WHERE group_id = $1)
          AND cgv2.pipeline_year = $2
          AND cgv2.pipeline != 'Draft'`;
      totalsParams = [clientGroupId, yr];
    } else {
      totalsQ = `${totalsSelect}
        WHERE cgv2.client_id = $1
          AND cgv2.pipeline_year = $2
          AND cgv2.pipeline != 'Draft'`;
      totalsParams = [clientId, yr];
    }
    const totalsResult = await query(totalsQ, totalsParams);
    const committed_total   = parseFloat(totalsResult.rows[0]?.committed_total   || 0);
    const anticipated_total = parseFloat(totalsResult.rows[0]?.anticipated_total || 0);

    const expected_total = parseFloat(totalsResult.rows[0]?.expected_total || 0);
    const sip_total      = parseFloat(totalsResult.rows[0]?.sip_total      || 0);
    const proposals = proposalsResult.rows.map(r => ({ ...r, value: parseFloat(r.value || 0) }));

    res.json({ pot, proposals, committed_total, anticipated_total, expected_total, sip_total });
  } catch (err) { next(err); }
});

// GET /api/pots[?year=YYYY]
// Includes committed_total, anticipated_total, achieved_total (C+A) and the informative
// expected_total, sip_total per POT row.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { year } = req.query;
    const params = [];
    let whereClause = '';
    if (year) {
      params.push(parseInt(year));
      whereClause = 'WHERE p.year = $1';
    }

    const scopeFilter = `(
      (p.client_id IS NOT NULL AND cgv2.client_id = p.client_id)
      OR
      (p.client_group_id IS NOT NULL AND cgv2.client_id IN (
        SELECT id FROM clients WHERE group_id = p.client_group_id
      ))
    )`;

    const { rows } = await query(
      `WITH ${potVersionsCte()}
       SELECT p.id, p.year, p.amount, p.created_at, p.special_label,
              p.client_group_id, cg.name AS client_group_name,
              p.client_id, c.name AS client_name,
              COALESCE(t.committed_total, 0)   AS committed_total,
              COALESCE(t.anticipated_total, 0) AS anticipated_total,
              COALESCE(t.expected_total, 0)    AS expected_total,
              COALESCE(t.sip_total, 0)         AS sip_total
       FROM pots p
       LEFT JOIN client_groups cg ON cg.id = p.client_group_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT
           SUM(cgv2.fee_eur) FILTER (WHERE cgv2.pipeline = 'Committed')   AS committed_total,
           SUM(cgv2.fee_eur) FILTER (WHERE cgv2.pipeline = 'Anticipated') AS anticipated_total,
           SUM(cgv2.fee_eur) FILTER (WHERE cgv2.pipeline = 'Expected')    AS expected_total,
           SUM(cgv2.fee_eur) FILTER (WHERE cgv2.pipeline = 'SIP')         AS sip_total
         FROM pot_v cgv2
         WHERE cgv2.pipeline IN ('Committed', 'Anticipated', 'Expected', 'SIP')
           AND cgv2.pipeline_year = p.year AND ${scopeFilter}
       ) t ON true
       ${whereClause}
       ORDER BY p.year DESC, COALESCE(p.special_label, cg.name, c.name)`,
      params
    );
    res.json(rows.map(r => ({
      ...r,
      committed_total:   parseFloat(r.committed_total)   || 0,
      anticipated_total: parseFloat(r.anticipated_total) || 0,
      expected_total:    parseFloat(r.expected_total)    || 0,
      sip_total:         parseFloat(r.sip_total)         || 0,
      achieved_total:    (parseFloat(r.committed_total) || 0) + (parseFloat(r.anticipated_total) || 0),
    })));
  } catch (err) { next(err); }
});

// POST /api/pots (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { clientGroupId, clientId, specialLabel, year, amount } = req.body;
    if (!year || amount == null) return res.status(400).json({ error: 'year and amount are required' });
    const moneyErr = amountError(amount, 'EUR', 'POT amount');
    if (moneyErr) return res.status(400).json({ error: moneyErr, code: MONEY_RULE_CODE });
    // Must have exactly one of: clientGroupId, clientId, or specialLabel
    const targets = [clientGroupId, clientId, specialLabel].filter(Boolean);
    if (targets.length !== 1) {
      return res.status(400).json({ error: 'Exactly one of clientGroupId, clientId, or specialLabel is required' });
    }
    const { rows } = await query(
      `INSERT INTO pots (client_group_id, client_id, special_label, year, amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [clientGroupId || null, clientId || null, specialLabel || null, parseInt(year), amount]
    );
    await query(
      'INSERT INTO pot_history (pot_id, old_value, new_value, changed_by) VALUES ($1, NULL, $2, $3)',
      [rows[0].id, amount, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A POT already exists for this target and year' });
    next(err);
  }
});

// GET /api/pots/:id/details?year=YYYY (admin only)
// Returns POT metadata, change history, committed+anticipated total, the informative expected/SIP
// totals, and the scoped proposals that are not Canceled (value in EUR, value_original in the
// version's currency). Proposals are matched via their reference version's client_id (not through
// generated projects).
router.get('/:id/details', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year is required' });
    const yr = parseInt(year);

    const potRes = await query(
      `SELECT p.*, cg2.name AS client_group_name, c2.name AS client_name
       FROM pots p
       LEFT JOIN client_groups cg2 ON cg2.id = p.client_group_id
       LEFT JOIN clients c2 ON c2.id = p.client_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!potRes.rows[0]) return res.status(404).json({ error: 'POT not found' });
    const pot = potRes.rows[0];

    const histRes = await query(
      `SELECT ph.id, ph.old_value, ph.new_value, ph.note, ph.changed_at,
              u.first_name || ' ' || u.last_name AS changed_by_name
       FROM pot_history ph
       LEFT JOIN users u ON u.id = ph.changed_by
       WHERE ph.pot_id = $1
       ORDER BY ph.changed_at DESC`,
      [req.params.id]
    );

    let proposals = [];
    if (pot.client_id || pot.client_group_id) {
      let proposalsQ, proposalsParams;
      if (pot.client_group_id) {
        proposalsQ = `
          WITH ${potVersionsCte()}
          SELECT
            cgv.id AS version_id, cgrd.id AS cg_id, cgv.pipeline, cgv.created_at, cgv.currency,
            cgrd.name AS proposal_name,
            cli.name AS client_name,
            u.first_name || ' ' || u.last_name AS owner_name,
            cgv.fee_eur AS value,
            cgv.fee_original AS value_original
          FROM pot_v cgv
          JOIN cost_grids cgrd ON cgrd.id = cgv.cost_grid_id
          JOIN users u ON u.id = cgrd.owner_id
          LEFT JOIN clients cli ON cli.id = cgv.client_id
          WHERE cgv.client_id IN (SELECT id FROM clients WHERE group_id = $1)
            AND cgv.pipeline_year = $2
            AND cgv.pipeline NOT IN ('Draft', 'Canceled')
          ORDER BY cgv.created_at DESC`;
        proposalsParams = [pot.client_group_id, yr];
      } else {
        proposalsQ = `
          WITH ${potVersionsCte()}
          SELECT
            cgv.id AS version_id, cgrd.id AS cg_id, cgv.pipeline, cgv.created_at, cgv.currency,
            cgrd.name AS proposal_name,
            cli.name AS client_name,
            u.first_name || ' ' || u.last_name AS owner_name,
            cgv.fee_eur AS value,
            cgv.fee_original AS value_original
          FROM pot_v cgv
          JOIN cost_grids cgrd ON cgrd.id = cgv.cost_grid_id
          JOIN users u ON u.id = cgrd.owner_id
          LEFT JOIN clients cli ON cli.id = cgv.client_id
          WHERE cgv.client_id = $1
            AND cgv.pipeline_year = $2
            AND cgv.pipeline NOT IN ('Draft', 'Canceled')
          ORDER BY cgv.created_at DESC`;
        proposalsParams = [pot.client_id, yr];
      }
      const proposalsRes = await query(proposalsQ, proposalsParams);
      proposals = proposalsRes.rows.map(r => ({
        ...r, value: parseFloat(r.value || 0), value_original: parseFloat(r.value_original || 0),
      }));
    }

    const committedTotal   = proposals.filter(r => r.pipeline === 'Committed')  .reduce((s, r) => s + r.value, 0);
    const anticipatedTotal = proposals.filter(r => r.pipeline === 'Anticipated').reduce((s, r) => s + r.value, 0);
    const expectedTotal    = proposals.filter(r => r.pipeline === 'Expected')   .reduce((s, r) => s + r.value, 0);
    const sipTotal         = proposals.filter(r => r.pipeline === 'SIP')        .reduce((s, r) => s + r.value, 0);

    res.json({
      pot, history: histRes.rows, committed_total: committedTotal, anticipated_total: anticipatedTotal,
      expected_total: expectedTotal, sip_total: sipTotal, proposals,
    });
  } catch (err) { next(err); }
});

// GET /api/pots/:id/history (admin only)
router.get('/:id/history', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ph.id, ph.old_value, ph.new_value, ph.note, ph.changed_at,
              u.first_name || ' ' || u.last_name AS changed_by_name
       FROM pot_history ph
       LEFT JOIN users u ON u.id = ph.changed_by
       WHERE ph.pot_id = $1
       ORDER BY ph.changed_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PATCH /api/pots/:id (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { amount, note } = req.body;
    if (amount == null) return res.status(400).json({ error: 'amount is required' });
    const moneyErr = amountError(amount, 'EUR', 'POT amount');
    if (moneyErr) return res.status(400).json({ error: moneyErr, code: MONEY_RULE_CODE });
    if (!note || !note.trim()) return res.status(400).json({ error: 'note is required when updating a POT' });
    const old = await query('SELECT amount FROM pots WHERE id = $1', [req.params.id]);
    if (!old.rows[0]) return res.status(404).json({ error: 'POT not found' });
    const { rows } = await query(
      'UPDATE pots SET amount = $1 WHERE id = $2 RETURNING *',
      [amount, req.params.id]
    );
    await query(
      'INSERT INTO pot_history (pot_id, old_value, new_value, note, changed_by) VALUES ($1, $2, $3, $4, $5)',
      [req.params.id, old.rows[0].amount, amount, note.trim(), req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/pots/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM pots WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'POT not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
