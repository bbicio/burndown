const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const { query } = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { parseFlexibleDate } = require('../lib/date-parse');
const { resolveFee } = require('../lib/rate-resolve');

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
      `WITH agg AS (
         SELECT project_code,
                COUNT(*)::int AS uploads,
                MAX(uploaded_at) AS last_uploaded,
                SUM(jsonb_array_length(data)) AS total_rows
         FROM timesheets
         WHERE project_code = ANY($1::text[])
         GROUP BY project_code
       )
       SELECT agg.project_code, agg.uploads, agg.last_uploaded, agg.total_rows,
              c.name   AS client_name,
              p.name   AS project_name,
              p.currency AS currency,
              cgv.pipeline_year AS pipeline_year
       FROM agg
       LEFT JOIN LATERAL (
         SELECT * FROM projects pr
         WHERE pr.code = agg.project_code
           AND ($3 OR pr.owner_id = $2
                OR EXISTS(SELECT 1 FROM resource_shares rs
                          WHERE rs.resource_type='project' AND rs.resource_id=pr.id AND rs.user_id=$2))
         ORDER BY pr.created_at LIMIT 1
       ) p ON TRUE
       LEFT JOIN clients c              ON c.id = p.client_id
       LEFT JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id
       ORDER BY agg.project_code`,
      [codes, req.user.id, req.user.role === 'admin']
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
    const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }).map(trimRowKeys);

    if (!raw.length) return res.status(400).json({ error: 'File is empty or unreadable' });

    // Detect column mapping (case-insensitive, trimmed)
    const sampleKeys = Object.keys(raw[0]); // already trimmed by trimRowKeys above
    const {
      colDate, colRole, colOwner, colHours, colTask, colNotes, colProjId, colProjName,
    } = resolveColumnMap(sampleKeys);

    const grouped = {};
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      const projectCode = colProjId ? String(row[colProjId] ?? '').trim() : '';
      if (!projectCode) continue;

      let date;
      try {
        date = colDate ? formatDate(row[colDate]) : null;
      } catch (err) {
        // Reject the whole file — no partial writes — on any unparseable date.
        // Row numbers are 1-indexed and account for the header row (raw[0] is
        // spreadsheet row 2), matching what a user sees when opening the file.
        return res.status(400).json({
          error: `Invalid date in row ${i + 2}: ${err.message}`,
        });
      }

      const entry = {
        date,
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

    const projectTasksByCode = await loadProjectTasksByCode(codes);
    for (const code of codes) {
      const tasks = projectTasksByCode[code] || [];
      for (const entry of codesToSave[code]) {
        entry.fee = resolveFee(tasks, entry.task, entry.role);
      }
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

function trimRowKeys(row) {
  const trimmed = {};
  for (const key of Object.keys(row)) trimmed[key.trim()] = row[key];
  return trimmed;
}

// Batch-loads { name, resources } task lists for every given project code,
// keyed by project_code. One query for the whole upload, not one per row.
// projects.code has no uniqueness constraint (012_project_code.sql) — a
// LATERAL + ORDER BY created_at LIMIT 1 picks the same canonical project per
// code that GET / uses, so fee resolution never draws rates from an
// arbitrary duplicate-code project.
async function loadProjectTasksByCode(codes) {
  if (!codes.length) return {};
  const { rows } = await query(
    `SELECT agg.code,
            COALESCE(
              (SELECT json_agg(json_build_object('name', pt.name, 'resources', pt.resources) ORDER BY pt.sort_order)
               FROM project_tasks pt WHERE pt.project_id = p.id),
              '[]'::json
            ) AS tasks
     FROM unnest($1::text[]) AS agg(code)
     LEFT JOIN LATERAL (
       SELECT * FROM projects pr WHERE pr.code = agg.code
       ORDER BY pr.created_at LIMIT 1
     ) p ON TRUE`,
    [codes]
  );
  const map = {};
  for (const row of rows) map[row.code] = row.tasks || [];
  return map;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

const FIELD_CANDIDATES = {
  colDate:     ['date', 'data'],
  colRole:     ['role', 'ruolo', 'resource'],
  colOwner:    ['owner', 'worker', 'name', 'nome'],
  colHours:    ['hours', 'ore', 'qty', 'quantity'],
  colTask:     ['task', 'attività', 'activity', 'task name', 'nome attività'],
  colNotes:    ['notes', 'note', 'description'],
  colProjId:   ['projectid', 'project id', 'project_id', 'codice'],
  colProjName: ['projectname', 'project name', 'project_name', 'progetto'],
};
const FIELD_ORDER = Object.keys(FIELD_CANDIDATES);

// Unicode-aware "not a letter/digit" check -- a plain regex \b word boundary doesn't treat
// accented letters (e.g. the "à" in "attività") as word characters, which would create a
// false boundary in the middle of that word and silently break the 'attività' candidate.
function isBoundaryChar(ch) {
  return ch === undefined || !/[\p{L}\p{N}]/u.test(ch);
}

// Returns null if `candidate` doesn't appear in `header` as a whole word (or the whole
// header), otherwise a specificity score: tier 2 = header equals candidate exactly,
// tier 1 = candidate appears as a whole word inside a longer header. Within a tier,
// a longer candidate is more specific than a shorter one.
function matchSpecificity(header, candidate) {
  const h = header.toLowerCase();
  const c = candidate.toLowerCase();
  if (h === c) return { tier: 2, length: c.length };
  let idx = h.indexOf(c);
  while (idx !== -1) {
    if (isBoundaryChar(h[idx - 1]) && isBoundaryChar(h[idx + c.length])) {
      return { tier: 1, length: c.length };
    }
    idx = h.indexOf(c, idx + 1);
  }
  return null;
}

// Known, accepted limitation (documented 2026-08-12, not fixed): the assignment below is
// greedy (highest-specificity match wins first), not a globally-optimal bipartite matching.
// If two headers tie exactly on score for the same field, and one of them has no other
// viable field match while the other does, greedy can assign the field to the "flexible"
// header first, leaving the header with no alternative unmapped — even though a different
// assignment could have filled both. Reproducing this requires a specific real-world header
// naming coincidence not observed across two prior investigation cycles (see
// docs/superpowers/specs/2026-08-05-timesheet-column-mapping-specificity-design.md and
// docs/superpowers/specs/2026-08-12-final-three-backlog-items-design.md). A full optimal
// matching algorithm (e.g. Hungarian algorithm) was confirmed disproportionate for this
// undemonstrated edge case — not implemented.
function resolveColumnMap(headers) {
  const matches = [];
  headers.forEach((header, headerIdx) => {
    FIELD_ORDER.forEach((field, fieldIdx) => {
      let best = null;
      for (const candidate of FIELD_CANDIDATES[field]) {
        const score = matchSpecificity(header, candidate);
        if (score && (!best || score.tier > best.tier ||
            (score.tier === best.tier && score.length > best.length))) {
          best = score;
        }
      }
      if (best) matches.push({ header, headerIdx, field, fieldIdx, ...best });
    });
  });

  // Highest specificity first; ties broken by field-declaration order then header
  // position, matching today's behavior exactly when specificity doesn't differ.
  matches.sort((a, b) =>
    b.tier - a.tier ||
    b.length - a.length ||
    a.fieldIdx - b.fieldIdx ||
    a.headerIdx - b.headerIdx
  );

  const result = {};
  const usedHeaders = new Set();
  const usedFields = new Set();
  for (const m of matches) {
    if (usedHeaders.has(m.headerIdx) || usedFields.has(m.field)) continue;
    result[m.field] = m.header;
    usedHeaders.add(m.headerIdx);
    usedFields.add(m.field);
  }
  for (const field of FIELD_ORDER) if (!(field in result)) result[field] = undefined;
  return result;
}

function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  if (!s) return null;
  // already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return parseFlexibleDate(m[1], m[2], m[3]);
  throw new Error(`"${s}" is not a recognized date format`);
}

module.exports = router;
module.exports.formatDate = formatDate;
module.exports.resolveColumnMap = resolveColumnMap;
module.exports.trimRowKeys = trimRowKeys;
