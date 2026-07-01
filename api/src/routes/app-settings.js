const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

async function getSetting(key) {
  const { rows } = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

// GET /api/app-settings/terms — any authenticated user (needed by terms.html)
router.get('/terms', requireAuth, async (req, res, next) => {
  try {
    const [versionRow, contentRow, metaRow] = await Promise.all([
      query("SELECT value FROM app_settings WHERE key = 'terms_version'"),
      query("SELECT value FROM app_settings WHERE key = 'terms_content'"),
      query("SELECT updated_at, u.first_name, u.last_name FROM app_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.key = 'terms_content'"),
    ]);
    res.json({
      version:   parseInt(versionRow.rows[0]?.value || '1'),
      content:   contentRow.rows[0]?.value || '',
      updatedAt: metaRow.rows[0]?.updated_at || null,
      updatedBy: metaRow.rows[0] ? `${metaRow.rows[0].first_name} ${metaRow.rows[0].last_name}`.trim() : null,
    });
  } catch (err) { next(err); }
});

// PUT /api/app-settings/terms — admin only; bumps version when publishNewVersion=true
router.put('/terms', requireAdmin, async (req, res, next) => {
  try {
    const { content, publishNewVersion } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'content is required' });

    await query(
      "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('terms_content', $1, NOW(), $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW(), updated_by = $2",
      [content, req.user.id]
    );

    let newVersion = null;
    if (publishNewVersion) {
      const cur = await query("SELECT value FROM app_settings WHERE key = 'terms_version'");
      newVersion = (parseInt(cur.rows[0]?.value || '1')) + 1;
      await query(
        "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('terms_version', $1, NOW(), $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW(), updated_by = $2",
        [String(newVersion), req.user.id]
      );
    }

    res.json({ ok: true, newVersion });
  } catch (err) { next(err); }
});

module.exports = router;
