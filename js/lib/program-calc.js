// Pure program-level metrics for program.html, built on top of the per-project
// definitions already used by the project reporting view (computeKpis) and the
// Portfolio (spentPercent/spentBarState from portfolio-calc.js). See
// docs/superpowers/specs/2026-10-08-program-dashboard-design.md §6.

import { spentPercent } from './portfolio-calc.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ymToDate(ym) {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(4, 6), 10);
  return new Date(y, m - 1, 1);
}
function ymEndDate(ym) {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(4, 6), 10);
  return new Date(y, m, 0);
}
function dateToYm(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtMonthLabel(ym) {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(4, 6), 10);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

// Currency code shared by every project, or null if they diverge (D4) — unlike
// portfolio-calc.js's commonCurrency(), which masks a mismatch by defaulting to EUR.
export function programCurrency(cfgs) {
  if (!cfgs || !cfgs.length) return null;
  const codes = new Set(cfgs.map(c => c.currency || 'EUR'));
  return codes.size === 1 ? [...codes][0] : null;
}

// First start to last end across the dated projects (YYYYMM), plus the inclusive
// list of months on that axis. null if no project carries both dates.
export function programRange(cfgs) {
  const dated = (cfgs || []).filter(c => c.startDate && c.endDate);
  if (!dated.length) return null;
  const startYm = dated.reduce((min, c) => c.startDate < min ? c.startDate : min, dated[0].startDate);
  const endYm = dated.reduce((max, c) => c.endDate > max ? c.endDate : max, dated[0].endDate);
  const startDate = ymToDate(startYm);
  const endDate = ymEndDate(endYm);
  const months = [];
  let cur = new Date(startDate);
  while (dateToYm(cur) <= endYm) {
    months.push(dateToYm(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return { startYm, endYm, startDate, endDate, months };
}

// Per-project row metrics, same definitions as the project reporting's computeKpis
// (D3): budget from billable tasks, falling back to the pipeline budget fee.
export function projectMetrics(cfg, rows, deps) {
  const { findRate, billableTasks, billableData, pipelineBudget, today } = deps;
  const bTasks = billableTasks(cfg);
  const soldHours = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours, 0), 0);
  let soldMoney = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0);
  if (soldMoney === 0 && cfg.costGridRef && cfg.costGridRef.versionId) {
    const budget = pipelineBudget(cfg.costGridRef.versionId);
    if (budget) soldMoney = budget.fee;
  }

  const bData = billableData(rows, cfg);
  const spentHours = bData.reduce((s, r) => s + r.hours, 0);
  const spentMoney = bData.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);

  const remainingHours = soldHours - spentHours;
  const remainingMoney = soldMoney - spentMoney;

  const hasBudget = soldHours > 0;
  const hasActuals = rows.length > 0;

  const consumptionPct = hasBudget ? spentPercent(spentHours, soldHours) : null;

  let timePct = null;
  let started = false;
  if (cfg.startDate && cfg.endDate) {
    const start = ymToDate(cfg.startDate);
    const end = ymEndDate(cfg.endDate);
    started = today >= start;
    if (today <= start) timePct = 0;
    else if (today >= end) timePct = 100;
    else timePct = Math.round(((today - start) / (end - start)) * 100);
  }

  const vsTime = (consumptionPct !== null && timePct !== null) ? consumptionPct - timePct : null;

  return { soldHours, soldMoney, spentHours, spentMoney, remainingHours, remainingMoney, consumptionPct, timePct, vsTime, hasBudget, hasActuals, started };
}

// Program-wide sums. consumptionPct = Σspent / Σsold, never the mean of the rows'
// own percentages (D8/brief §4) — projects without a budget are excluded from that
// ratio's denominator but still contribute their spend.
export function programTotals(metrics) {
  const soldHours = metrics.reduce((s, m) => s + m.soldHours, 0);
  const soldMoney = metrics.reduce((s, m) => s + m.soldMoney, 0);
  const spentHours = metrics.reduce((s, m) => s + m.spentHours, 0);
  const spentMoney = metrics.reduce((s, m) => s + m.spentMoney, 0);
  const remainingHours = soldHours - spentHours;
  const remainingMoney = soldMoney - spentMoney;
  const consumptionPct = spentPercent(spentHours, soldHours);
  const vsTime = null; // computed by the caller against timeElapsed(), not a per-row average here
  return { soldHours, soldMoney, spentHours, spentMoney, remainingHours, remainingMoney, consumptionPct, vsTime };
}

// Share of the program's date range elapsed, plus how many of its projects have
// started. null pct without a range (Review Focus 3).
export function timeElapsed(range, metrics, today) {
  const startedCount = (metrics || []).filter(m => m.started).length;
  const totalCount = (metrics || []).length;
  if (!range) return { pct: null, startedCount, totalCount };
  let pct;
  if (today <= range.startDate) pct = 0;
  else if (today >= range.endDate) pct = 100;
  else pct = Math.round(((today - range.startDate) / (range.endDate - range.startDate)) * 100);
  return { pct, startedCount, totalCount };
}

// Needs-attention rule (D10): Started At Risk, or consumption >= 85%, or
// (consumption - time) > 10 points. entries = [{ id, name, status, metrics, endYm }].
export function needsAttention(entries, thresholds = { consumption: 85, vsTime: 10 }) {
  const ids = [];
  const reasons = {};
  (entries || []).forEach(e => {
    const { consumptionPct, vsTime } = e.metrics;
    const atRisk = e.status === 'Started At Risk';
    const overConsumption = consumptionPct !== null && consumptionPct >= thresholds.consumption;
    const overPace = vsTime !== null && vsTime > thresholds.vsTime;
    if (atRisk || overConsumption || overPace) {
      ids.push(e.id);
      const parts = [];
      if (atRisk) parts.push('At risk');
      else if (overConsumption) parts.push('High consumption');
      else parts.push('Ahead of pace');
      const pctText = consumptionPct !== null ? `${consumptionPct}% spent` : 'no budget';
      const endText = e.endYm ? `, ends ${fmtMonthLabel(e.endYm)}` : '';
      reasons[e.id] = `${parts[0]} · ${pctText}${endText}`;
    }
  });
  return { ids, reasons };
}

// Default row order (D8/L9): flagged projects first, then by start date. Does not
// mutate the input array.
export function sortProjectRows(rows, attentionIds) {
  const flagged = new Set(attentionIds || []);
  return [...(rows || [])].sort((a, b) => {
    const aFlag = flagged.has(a.id) ? 0 : 1;
    const bFlag = flagged.has(b.id) ? 0 : 1;
    if (aFlag !== bFlag) return aFlag - bFlag;
    return (a.cfg.startDate || '').localeCompare(b.cfg.startDate || '');
  });
}

window.programCurrency = programCurrency;
window.programRange = programRange;
window.projectMetrics = projectMetrics;
window.programTotals = programTotals;
window.timeElapsed = timeElapsed;
window.needsAttention = needsAttention;
window.sortProjectRows = sortProjectRows;
