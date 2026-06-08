// ── FILE UPLOAD ──────────────────────────────────────────────────────────────
function readXLS(file) {
  const reader = new FileReader();
  reader.addEventListener('load', e => {
    const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });

    const newRows = rows.map(r => ({
      date:        parseDate(r['Date']),
      role:        str(r['Job Role: Name']),
      owner:       str(r['Owner: Name']),
      hours:       parseHours(r['Hours']),
      task:        str(r['Task/Issue']),
      notes:       str(r['Notes']),
      projectId:   str(r['D365 Project ID']),
      projectName: str(r['WF Project Name']),
    })).filter(r => r.date && r.hours > 0);

    // Save each project's rows to localStorage
    const byProject = {};
    newRows.forEach(r => {
      if (!r.projectId) return;
      if (!byProject[r.projectId]) byProject[r.projectId] = [];
      byProject[r.projectId].push(r);
    });
    Object.entries(byProject).forEach(([pid, prows]) => {
      saveProjectData(pid, prows);
      addToDataIndex(pid);
    });

    // Rebuild timesheetData from all cached sources
    refreshTimesheetData();

    document.getElementById('fileStatus').textContent = `✅ ${file.name} · ${newRows.length} rows`;
    populateProjectSelector();
    showPortfolioView();
  });
  reader.readAsArrayBuffer(file);
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = '20' + y;
    const dt = new Date(+y, +mo - 1, +d);
    return isNaN(dt) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt) ? null : dt;
}

function parseHours(v) { return parseFloat(String(v || '0').replace(',', '.')) || 0; }
function str(v)        { return String(v || '').trim(); }
