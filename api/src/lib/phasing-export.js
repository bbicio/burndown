// Per-month phasing of the phasing export. task_roles.days stores HOURS (despite the name), so a
// month's hours are the stored amount spread over the months of the task, with no day-to-hour factor.

function distribute(yr, days, taskStart, taskEnd, verStart, verEnd) {
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

function phasingByVersion(rows, yr) {
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
    const dist = distribute(yr, r.days, r.task_start, r.task_end, r.ver_start, r.ver_end);
    const rate = parseFloat(r.hourly_rate) || 0;
    // Amounts are in EUR, converted like /api/reporting/phasing: local amount / the version's currency_rate
    const fx = parseFloat(r.currency_rate) || 1.0;
    for (const [mo, d] of Object.entries(dist)) {
      if (!v.months[mo]) v.months[mo] = { hours: 0, amount: 0 };
      const hrs = d;
      v.months[mo].hours  += hrs;
      v.months[mo].amount += (hrs * rate) / fx;
    }
  }
  return versionMap;
}

module.exports = { phasingByVersion };
