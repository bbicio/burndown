const express = require('express');
const { query } = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin required' });
  next();
}

// GET /api/currencies/active
// Returns active currencies — used by all pages to populate dropdowns and format money.
router.get('/active', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT code, symbol, name, locale, current_rate
       FROM currencies WHERE active = true ORDER BY code = 'EUR' DESC, name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/currencies
// Returns all currencies (active + inactive) with last_updated from rate history.
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.code, c.symbol, c.name, c.locale, c.active, c.current_rate,
              (SELECT cr.created_at FROM currency_rates cr
               WHERE cr.currency_code = c.code
               ORDER BY cr.created_at DESC LIMIT 1) AS last_updated
       FROM currencies c
       ORDER BY c.code = 'EUR' DESC, c.active DESC, c.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/currencies/:code/activate
// Admin: activate a currency with an initial exchange rate.
// Body: { rate: number }
router.post('/:code/activate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { code } = req.params;
    const rate = parseFloat(req.body.rate);
    if (!isFinite(rate) || rate <= 0) return res.status(400).json({ error: 'rate must be a positive number' });
    if (code === 'EUR') return res.status(400).json({ error: 'EUR is always active' });

    const { rows } = await query('SELECT active FROM currencies WHERE code = $1', [code]);
    if (!rows.length) return res.status(404).json({ error: 'Currency not found' });
    if (rows[0].active) return res.status(409).json({ error: 'Currency already active' });

    await query(
      `UPDATE currencies SET active = true, current_rate = $1, updated_at = NOW() WHERE code = $2`,
      [rate, code]
    );
    await query(
      `INSERT INTO currency_rates (currency_code, rate, created_by) VALUES ($1, $2, $3)`,
      [code, rate, req.user.id]
    );

    const { rows: updated } = await query(
      `SELECT code, symbol, name, locale, active, current_rate FROM currencies WHERE code = $1`, [code]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

// PATCH /api/currencies/:code/rate
// Admin: update the exchange rate for an active non-EUR currency.
// Body: { rate: number }
router.patch('/:code/rate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { code } = req.params;
    const rate = parseFloat(req.body.rate);
    if (!isFinite(rate) || rate <= 0) return res.status(400).json({ error: 'rate must be a positive number' });
    if (code === 'EUR') return res.status(400).json({ error: 'EUR rate is fixed at 1:1' });

    const { rows } = await query('SELECT active FROM currencies WHERE code = $1', [code]);
    if (!rows.length) return res.status(404).json({ error: 'Currency not found' });
    if (!rows[0].active) return res.status(400).json({ error: 'Currency is not active' });

    await query(
      `UPDATE currencies SET current_rate = $1, updated_at = NOW() WHERE code = $2`,
      [rate, code]
    );
    await query(
      `INSERT INTO currency_rates (currency_code, rate, created_by) VALUES ($1, $2, $3)`,
      [code, rate, req.user.id]
    );

    res.json({ code, rate });
  } catch (err) { next(err); }
});

// GET /api/currencies/:code/history
// Admin: chronological rate history for a currency.
router.get('/:code/history', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT cr.id, cr.rate, cr.created_at,
              u.first_name || ' ' || u.last_name AS updated_by
       FROM currency_rates cr
       LEFT JOIN users u ON u.id = cr.created_by
       WHERE cr.currency_code = $1
       ORDER BY cr.created_at DESC
       LIMIT 100`,
      [req.params.code]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
