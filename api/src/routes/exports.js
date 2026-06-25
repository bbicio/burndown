const express = require('express');
const { query } = require('../db/client');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendExportEmail } = require('../services/email');

const router = express.Router();

// ── CSV HELPERS ───────────────────────────────────────────────────────────────

function csvCell(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(headers, rows) {
  return [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

// ── POST /api/exports/portfolio ───────────────────────────────────────────────

router.post('/portfolio', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const visibilityClause = isAdmin
      ? ''
      : `AND (p.owner_id = $1 OR EXISTS(
           SELECT 1 FROM resource_shares rs
           WHERE rs.resource_type = 'project' AND rs.resource_id = p.id AND rs.user_id = $1
         ))`;

    const { rows } = await query(
      `SELECT p.id, p.name, p.program_id, p.pipeline, p.status,
              p.start_date, p.end_date, p.currency,
              c.name AS client_name,
              pr.name AS program_name
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN programs pr ON pr.id = p.program_id
       WHERE 1=1 ${visibilityClause}
       ORDER BY p.name`,
      isAdmin ? [] : [req.user.id]
    );

    const headers = ['ID', 'Name', 'Program', 'Program ID', 'Client', 'Pipeline', 'Status', 'Start Date', 'End Date', 'Currency'];
    const csvRows = rows.map(r => [
      r.id,
      r.name,
      r.program_name || '',
      r.program_id || '',
      r.client_name || '',
      r.pipeline || '',
      r.status || '',
      r.start_date ? String(r.start_date).slice(0, 10) : '',
      r.end_date   ? String(r.end_date).slice(0, 10)   : '',
      r.currency || '',
    ]);

    const content = buildCsv(headers, csvRows);
    const filename = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`;

    await sendExportEmail({
      to: req.user.email,
      firstName: req.user.first_name,
      exports: [{ filename, content, type: 'text/csv' }],
    });

    res.json({ ok: true, email: req.user.email });
  } catch (err) { next(err); }
});

// ── POST /api/exports/cost-grids ──────────────────────────────────────────────

router.post('/cost-grids', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const visibilityClause = isAdmin
      ? ''
      : `AND (cg.owner_id = $1 OR EXISTS(
           SELECT 1 FROM resource_shares rs
           WHERE rs.resource_type = 'cost_grid' AND rs.resource_id = cg.id AND rs.user_id = $1
         ))`;

    // Fetch all tasks with role assignments for accessible grids
    const { rows } = await query(
      `SELECT
         cg.id AS cg_id, cg.name AS cg_name,
         cgv.id AS ver_id, cgv.label AS ver_label, cgv.pipeline,
         cgv.start_date, cgv.end_date, cgv.currency,
         ph.title AS phase_title,
         tk.id AS task_id, tk.title AS task_title,
         ro.code AS role_code, tr.days
       FROM cost_grids cg
       JOIN cost_grid_versions cgv ON cgv.cost_grid_id = cg.id
       JOIN phases ph ON ph.version_id = cgv.id
       JOIN tasks tk ON tk.phase_id = ph.id
       JOIN task_roles tr ON tr.task_id = tk.id
       JOIN roles ro ON ro.id = tr.role_id
       WHERE 1=1 ${visibilityClause}
       ORDER BY cg.name, cgv.label, ph.sort_order, tk.sort_order`,
      isAdmin ? [] : [req.user.id]
    );

    // Collect all unique role codes
    const roleCodes = [...new Set(rows.map(r => r.role_code))].sort();

    // Group by task
    const taskMap = new Map();
    for (const r of rows) {
      const key = `${r.ver_id}__${r.task_id}`;
      if (!taskMap.has(key)) {
        taskMap.set(key, {
          cg_name:     r.cg_name,
          ver_label:   r.ver_label,
          pipeline:    r.pipeline,
          start_date:  r.start_date,
          end_date:    r.end_date,
          currency:    r.currency,
          phase_title: r.phase_title,
          task_title:  r.task_title,
          roleDays:    {},
        });
      }
      taskMap.get(key).roleDays[r.role_code] = (taskMap.get(key).roleDays[r.role_code] || 0) + Number(r.days);
    }

    const headers = [
      'Cost Grid', 'Version', 'Pipeline', 'Start Date', 'End Date', 'Currency',
      'Phase', 'Task',
      ...roleCodes.map(c => `${c} (days)`),
    ];

    const csvRows = [...taskMap.values()].map(t => [
      t.cg_name,
      t.ver_label,
      t.pipeline || '',
      t.start_date ? String(t.start_date).slice(0, 10) : '',
      t.end_date   ? String(t.end_date).slice(0, 10)   : '',
      t.currency || '',
      t.phase_title,
      t.task_title,
      ...roleCodes.map(c => t.roleDays[c] != null ? t.roleDays[c] : ''),
    ]);

    const content = buildCsv(headers, csvRows);
    const filename = `cost_grids_${new Date().toISOString().slice(0, 10)}.csv`;

    await sendExportEmail({
      to: req.user.email,
      firstName: req.user.first_name,
      exports: [{ filename, content, type: 'text/csv' }],
    });

    res.json({ ok: true, email: req.user.email });
  } catch (err) { next(err); }
});

// ── POST /api/exports/ratecards ───────────────────────────────────────────────

router.post('/ratecards', requireAdmin, async (req, res, next) => {
  try {
    // Load all roles
    const { rows: roleRows } = await query('SELECT id, code, label FROM roles ORDER BY code');

    // Load all ratecards with client info
    const { rows: rcRows } = await query(
      `SELECT rc.id, rc.name, c.name AS client_name
       FROM ratecards rc
       LEFT JOIN clients c ON c.id = rc.client_id
       ORDER BY rc.client_id NULLS FIRST, rc.name`
    );

    // Load all ratecard entries
    const { rows: entryRows } = await query(
      'SELECT ratecard_id, role_id, hourly_rate FROM ratecard_entries'
    );

    // Build a lookup: ratecard_id → Map(role_id → rate)
    const rcEntries = new Map();
    for (const e of entryRows) {
      if (!rcEntries.has(e.ratecard_id)) rcEntries.set(e.ratecard_id, new Map());
      rcEntries.get(e.ratecard_id).set(e.role_id, e.hourly_rate);
    }

    // Separate default (client_id IS NULL) from client-specific
    const defaultRc  = rcRows.filter(r => !r.client_name);
    const clientRcs  = rcRows.filter(r => !!r.client_name);

    // Build column headers: Role Code, Role Label, Default (rate)..., Client (rcName)...
    const rcCols = [
      ...defaultRc.map(r => `Default (${r.name})`),
      ...clientRcs.map(r => `${r.client_name} (${r.name})`),
    ];
    const rcColsData = [...defaultRc, ...clientRcs];

    const headers = ['Role Code', 'Role Label', ...rcCols];

    const csvRows = roleRows.map(role => [
      role.code,
      role.label,
      ...rcColsData.map(rc => {
        const m = rcEntries.get(rc.id);
        const rate = m ? m.get(role.id) : undefined;
        return rate != null ? rate : '';
      }),
    ]);

    const content = buildCsv(headers, csvRows);
    const filename = `ratecards_${new Date().toISOString().slice(0, 10)}.csv`;

    await sendExportEmail({
      to: req.user.email,
      firstName: req.user.first_name,
      exports: [{ filename, content, type: 'text/csv' }],
    });

    res.json({ ok: true, email: req.user.email });
  } catch (err) { next(err); }
});

// ── GET /api/exports/phasing?year=YYYY ───────────────────────────────────────
// Direct XLS download of the phasing breakdown for a pipeline year (admin only).

router.get('/phasing', requireAdmin, async (req, res, next) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'year is required' });
    const yr = parseInt(year);

    const { rows } = await query(
      `SELECT
         cgv.id          AS version_id,
         cgv.cost_grid_id AS cg_id,
         cg.name         AS cg_name,
         cgv.label       AS version_label,
         cgv.pipeline,
         cgv.start_date  AS ver_start,
         cgv.end_date    AS ver_end,
         tk.start_date   AS task_start,
         tk.end_date     AS task_end,
         tr.days,
         COALESCE(
           tr.rate_override,
           (SELECT re.hourly_rate FROM ratecard_entries re
            WHERE re.ratecard_id = cgv.ratecard_id AND re.role_id = tr.role_id LIMIT 1),
           ro.hourly_rate, 0
         ) AS hourly_rate
       FROM cost_grid_versions cgv
       JOIN cost_grids cg ON cg.id = cgv.cost_grid_id
       JOIN phases ph ON ph.version_id = cgv.id
       JOIN tasks tk ON tk.phase_id = ph.id
       JOIN task_roles tr ON tr.task_id = tk.id
       JOIN roles ro ON ro.id = tr.role_id
       WHERE cgv.pipeline IN ('Committed', 'Anticipated')
         AND cgv.pipeline_year = $1`,
      [yr]
    );

    const yearMonths = [];
    for (let m = 1; m <= 12; m++) yearMonths.push(`${yr}-${String(m).padStart(2, '0')}`);

    function distribute(days, taskStart, taskEnd, verStart, verEnd) {
      let sy, sm, ey, em;
      const ts = taskStart && taskStart.length >= 6 ? taskStart : null;
      const te = taskEnd   && taskEnd.length >= 6   ? taskEnd   : null;
      if (ts && te) {
        sy = parseInt(ts.slice(0, 4)); sm = parseInt(ts.slice(4, 6));
        ey = parseInt(te.slice(0, 4)); em = parseInt(te.slice(4, 6));
      } else if (verStart && verEnd && verStart.length >= 6 && verEnd.length >= 6) {
        sy = parseInt(verStart.slice(0, 4)); sm = parseInt(verStart.slice(4, 6));
        ey = parseInt(verEnd.slice(0, 4));   em = parseInt(verEnd.slice(4, 6));
      } else {
        return {};
      }
      const all = [];
      let y = sy, m = sm;
      while (y < ey || (y === ey && m <= em)) {
        all.push(`${y}-${String(m).padStart(2, '0')}`);
        if (++m > 12) { m = 1; y++; }
      }
      if (!all.length) return {};
      const dpp = parseFloat(days) / all.length;
      const out = {};
      for (const mo of all) {
        if (mo >= `${yr}-01` && mo <= `${yr}-12`) out[mo] = (out[mo] || 0) + dpp;
      }
      return out;
    }

    const versionMap = new Map();
    for (const r of rows) {
      if (!versionMap.has(r.version_id)) {
        versionMap.set(r.version_id, {
          name: r.cg_name, versionLabel: r.version_label,
          pipeline: r.pipeline,
          startDate: r.ver_start || '', endDate: r.ver_end || '',
          months: {},
        });
      }
      const v = versionMap.get(r.version_id);
      const dist = distribute(r.days, r.task_start, r.task_end, r.ver_start, r.ver_end);
      const rate = parseFloat(r.hourly_rate) || 0;
      for (const [mo, d] of Object.entries(dist)) {
        if (!v.months[mo]) v.months[mo] = { hours: 0, amount: 0 };
        const hrs = d * 8;
        v.months[mo].hours  += hrs;
        v.months[mo].amount += hrs * rate;
      }
    }

    const totals = {};
    for (const mo of yearMonths) totals[mo] = { hours: 0, amount: 0 };
    for (const v of versionMap.values()) {
      for (const [mo, val] of Object.entries(v.months)) {
        if (totals[mo]) { totals[mo].hours += val.hours; totals[mo].amount += val.amount; }
      }
    }

    const XLSX = require('xlsx');
    const monthLabels = yearMonths.map(m => {
      const [y, mo] = m.split('-');
      return new Date(parseInt(y), parseInt(mo) - 1).toLocaleString('en', { month: 'short' }) + ' ' + y;
    });

    // Sheet 1: Amount (€)
    const amountHeader = ['Project', 'Stage', 'Start', 'End', ...monthLabels, 'TOTAL'];
    const totalAmountRow = ['TOTAL (€)', '', '', '',
      ...yearMonths.map(m => Math.round(totals[m].amount)),
      yearMonths.reduce((s, m) => s + totals[m].amount, 0),
    ];
    const amountRows = [...versionMap.values()].map(v => {
      const rowTotal = yearMonths.reduce((s, m) => s + (v.months[m]?.amount || 0), 0);
      return [
        v.name, v.pipeline,
        v.startDate ? v.startDate.slice(0, 4) + '/' + v.startDate.slice(4, 6) : '',
        v.endDate   ? v.endDate.slice(0, 4)   + '/' + v.endDate.slice(4, 6)   : '',
        ...yearMonths.map(m => Math.round(v.months[m]?.amount || 0)),
        Math.round(rowTotal),
      ];
    });

    const wsAmount = XLSX.utils.aoa_to_sheet([amountHeader, totalAmountRow, ...amountRows]);
    wsAmount['!cols'] = [{ wch: 35 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
      ...yearMonths.map(() => ({ wch: 10 })), { wch: 12 }];

    // Sheet 2: Hours
    const hoursHeader = ['Project', 'Stage', 'Start', 'End', ...monthLabels, 'TOTAL'];
    const totalHoursRow = ['TOTAL (h)', '', '', '',
      ...yearMonths.map(m => Math.round(totals[m].hours * 10) / 10),
      Math.round(yearMonths.reduce((s, m) => s + totals[m].hours, 0) * 10) / 10,
    ];
    const hoursRows = [...versionMap.values()].map(v => {
      const rowTotal = yearMonths.reduce((s, m) => s + (v.months[m]?.hours || 0), 0);
      return [
        v.name, v.pipeline,
        v.startDate ? v.startDate.slice(0, 4) + '/' + v.startDate.slice(4, 6) : '',
        v.endDate   ? v.endDate.slice(0, 4)   + '/' + v.endDate.slice(4, 6)   : '',
        ...yearMonths.map(m => Math.round((v.months[m]?.hours || 0) * 10) / 10),
        Math.round(rowTotal * 10) / 10,
      ];
    });

    const wsHours = XLSX.utils.aoa_to_sheet([hoursHeader, totalHoursRow, ...hoursRows]);
    wsHours['!cols'] = wsAmount['!cols'];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsAmount, `Phasing ${yr} (€)`);
    XLSX.utils.book_append_sheet(wb, wsHours,  `Phasing ${yr} (h)`);

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="phasing_${yr}.xlsx"`);
    res.send(buf);
  } catch (err) { next(err); }
});

module.exports = router;
