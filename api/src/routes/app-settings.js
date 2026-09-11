const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireSysAdmin } = require('../middleware/auth');

const router = express.Router();

async function getSetting(key) {
  const { rows } = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

// Formats a joined user's first_name/last_name into a display name, or null
// if neither is present (e.g. the row exists but the LEFT JOIN found no
// user — an unset published_by/updated_by, or a since-deleted user). Both
// fields are guarded with `|| ''` so a partially-missing name never renders
// as the literal string "undefined" or "null".
function formatFullName(row) {
  if (!row) return null;
  return `${row.first_name || ''} ${row.last_name || ''}`.trim() || null;
}

// GET /api/app-settings/terms — any authenticated user (needed by terms.html)
// Returns the latest PUBLISHED version from terms_versions (not the draft in
// app_settings — see GET /terms/draft for that). Response shape unchanged.
router.get('/terms', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT tv.version, tv.content, tv.published_at, u.first_name, u.last_name
       FROM terms_versions tv
       LEFT JOIN users u ON u.id = tv.published_by
       ORDER BY tv.version DESC
       LIMIT 1`
    );
    const row = rows[0];
    res.json({
      version:   row?.version || 1,
      content:   row?.content || '',
      updatedAt: row?.published_at || null,
      updatedBy: formatFullName(row),
    });
  } catch (err) { next(err); }
});

// GET /api/app-settings/terms/draft — sysadmin only; the in-progress draft
// (app_settings.terms_content), never shown to terms.html. Same shape/query
// as the old GET /terms handler above -- this route is that handler's logic,
// relocated verbatim.
router.get('/terms/draft', requireSysAdmin, async (req, res, next) => {
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
      updatedBy: formatFullName(metaRow.rows[0]),
    });
  } catch (err) { next(err); }
});

// GET /api/app-settings/terms/versions — sysadmin only; list of published
// versions (no content -- a list row doesn't need the full text).
router.get('/terms/versions', requireSysAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT tv.version, tv.published_at, u.first_name, u.last_name
       FROM terms_versions tv
       LEFT JOIN users u ON u.id = tv.published_by
       ORDER BY tv.version DESC`
    );
    res.json(rows.map(r => ({
      version:     r.version,
      publishedAt: r.published_at,
      publishedBy: formatFullName(r),
    })));
  } catch (err) { next(err); }
});

// GET /api/app-settings/terms/versions/:version — sysadmin only; full text
// of one past published version, read-only. :version is the integer version
// number (not the row's UUID) -- matches how the frontend already thinks
// about versions.
router.get('/terms/versions/:version', requireSysAdmin, async (req, res, next) => {
  try {
    const versionNum = parseInt(req.params.version, 10);
    if (!Number.isInteger(versionNum)) return res.status(400).json({ error: 'Invalid version' });
    const { rows } = await query(
      `SELECT tv.version, tv.content, tv.published_at, u.first_name, u.last_name
       FROM terms_versions tv
       LEFT JOIN users u ON u.id = tv.published_by
       WHERE tv.version = $1`,
      [versionNum]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });
    const row = rows[0];
    res.json({
      version:     row.version,
      content:     row.content,
      publishedAt: row.published_at,
      publishedBy: formatFullName(row),
    });
  } catch (err) { next(err); }
});

// PUT /api/app-settings/terms — sysadmin only. publishNewVersion=false saves
// only the draft (app_settings.terms_content/terms_version, unaffected by
// terms.html's GET /terms). publishNewVersion=true additionally inserts an
// immutable row into terms_versions -- the new source of truth for "what's
// the latest published version" -- and syncs the draft to match, so the next
// edit starts from what was just published.
router.put('/terms', requireSysAdmin, async (req, res, next) => {
  try {
    const { content, publishNewVersion } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'content is required' });

    let newVersion = null;
    if (publishNewVersion) {
      const cur = await query('SELECT COALESCE(MAX(version), 0) AS max_version FROM terms_versions');
      newVersion = cur.rows[0].max_version + 1;
      await query(
        'INSERT INTO terms_versions (version, content, published_at, published_by) VALUES ($1, $2, NOW(), $3)',
        [newVersion, content, req.user.id]
      );
    }

    await query(
      "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('terms_content', $1, NOW(), $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW(), updated_by = $2",
      [content, req.user.id]
    );
    if (publishNewVersion) {
      await query(
        "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('terms_version', $1, NOW(), $2) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW(), updated_by = $2",
        [String(newVersion), req.user.id]
      );
    }

    res.json({ ok: true, newVersion });
  } catch (err) { next(err); }
});

module.exports = router;
