const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const { query } = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Visible project codes for the current user
async function visibleCodes(userId, role) {
  if (role === 'admin') {
    const { rows } = await query('SELECT DISTINCT project_code FROM timesheets ORDER BY project_code');
    return rows.map(r => r.project_code);
  }
  const { rows } = await query(
    `SELECT code FROM projects p
     WHERE code IS NOT NULL
       AND (p.owner_id = $1
        OR EXISTS(SELECT 1 FROM resource_shares rs
                  WHERE rs.resource_type='project' AND rs.resource_id=p.id AND rs.user_id=$1))`,
    [userId]
  );
  return rows.map(r => r.code);
}

// GET /api/timesheets
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const codes = await visibleCodes(req.user.id, req.user.role);
    if (!codes.length) return res.json([]);

    const { rows } = await query(
      `SELECT project_code,
              COUNT(*)::int           AS uploads,
              MAX(uploaded_at)        AS last_uploaded,
              SUM(jsonb_array_length(data)) AS total_rows
       FROM timesheets
       WHERE project_code = ANY($1::text[])
       GROUP BY project_code
       ORDER BY project_code`,
      [codes]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/timesheets/all-data — all rows merged per project code (for portfolio/planning views)
router.get('/all-data', requireAuth, async (req, res, next) => {
  try {
    const codes = await visibleCodes(req.user.id, req.user.role);
    if (!codes.length) return res.json([]);

    const { rows } = await query(
      `SELECT t.project_code, p.id AS project_id,
              json_agg(entry ORDER BY (entry->>'date')) AS data
       FROM timesheets t
       LEFT JOIN projects p ON p.code = t.project_code,
            jsonb_array_elements(t.data) AS entry
       WHERE t.project_code = ANY($1::text[])
       GROUP BY t.project_code, p.id`,
      [codes]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/timesheets/:projectCode
router.get('/:projectCode', requireAuth, async (req, res, next) => {
  try {
    const codes = await visibleCodes(req.user.id, req.user.role);
    if (!codes.includes(req.params.projectCode)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await query(
      `SELECT id, project_code, uploaded_at,
              jsonb_array_length(data) AS row_count, data
       FROM timesheets WHERE project_code = $1 ORDER BY uploaded_at DESC`,
      [req.params.projectCode]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/timesheets/upload
router.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    if (!raw.length) return res.status(400).json({ error: 'File is empty or unreadable' });

    // Detect column mapping (case-insensitive, trimmed)
    const sampleKeys = Object.keys(raw[0]).map(k => k.trim());
    const findCol = (...candidates) =>
      sampleKeys.find(k => candidates.some(c => k.toLowerCase().includes(c.toLowerCase())));

    const colDate    = findCol('date', 'data');
    const colRole    = findCol('role', 'ruolo', 'resource');
    const colOwner   = findCol('owner', 'worker', 'name', 'nome');
    const colHours   = findCol('hours', 'ore', 'qty', 'quantity');
    const colTask    = findCol('task', 'attività', 'activity');
    const colNotes   = findCol('notes', 'note', 'description');
    const colProjId  = findCol('projectid', 'project id', 'project_id', 'codice');
    const colProjName= findCol('projectname', 'project name', 'project_name', 'progetto');

    const grouped = {};
    for (const row of raw) {
      const projectCode = colProjId ? String(row[colProjId] ?? '').trim() : '';
      if (!projectCode) continue;

      const entry = {
        date:        colDate     ? formatDate(row[colDate])          : null,
        role:        colRole     ? String(row[colRole] ?? '').trim() : null,
        owner:       colOwner    ? String(row[colOwner] ?? '').trim(): null,
        hours:       colHours    ? parseFloat(row[colHours]) || 0    : 0,
        task:        colTask     ? String(row[colTask] ?? '').trim() : null,
        notes:       colNotes    ? String(row[colNotes] ?? '').trim(): null,
        projectId:   projectCode,
        projectName: colProjName ? String(row[colProjName] ?? '').trim() : null,
      };

      if (!grouped[projectCode]) grouped[projectCode] = [];
      grouped[projectCode].push(entry);
    }

    // If a specific project code is requested, filter to only that code
    const scopedCode = (req.query.projectCode || '').trim() || null;
    const codesToSave = scopedCode
      ? (grouped[scopedCode] ? { [scopedCode]: grouped[scopedCode] } : {})
      : grouped;

    const codes = Object.keys(codesToSave);
    if (!codes.length) {
      return res.status(400).json({
        error: scopedCode
          ? `No rows found for project code "${scopedCode}" in this file`
          : 'No valid rows found (projectId column missing or empty)',
      });
    }

    for (const code of codes) {
      await query('DELETE FROM timesheets WHERE project_code = $1', [code]);
      await query(
        `INSERT INTO timesheets (project_code, data, uploaded_by) VALUES ($1, $2, $3)`,
        [code, JSON.stringify(codesToSave[code]), req.user.id]
      );
    }

    res.status(201).json({
      ok: true,
      projectCodes: codes,
      totalRows: codes.reduce((s, c) => s + codesToSave[c].length, 0),
    });
  } catch (err) { next(err); }
});

// DELETE /api/timesheets/:projectCode
router.delete('/:projectCode', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      // Only allow delete if the user owns or has editor access to the project
      const { rows } = await query(
        `SELECT 1 FROM projects p
         LEFT JOIN resource_shares rs ON rs.resource_type='project' AND rs.resource_id=p.id AND rs.user_id=$1
         WHERE p.name = $2 AND (p.owner_id=$1 OR (rs.user_id IS NOT NULL AND rs.permission IN ('owner','editor')))`,
        [req.user.id, req.params.projectCode]
      );
      if (!rows.length) return res.status(403).json({ error: 'Access denied' });
    }

    const { rowCount } = await query(
      'DELETE FROM timesheets WHERE project_code = $1',
      [req.params.projectCode]
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (err) { next(err); }
});

// ── HELPERS ───────────────────────────────────────────────────────────────────

function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  // already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s;
}

module.exports = router;
