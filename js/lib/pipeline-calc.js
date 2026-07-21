// ── Pure aggregation/formatting logic extracted from js/pipeline-board.js ──
// cgComputeGrandTotals/getPipelineBudget are injected (not imported) so this module has
// zero DOM/global dependencies and can be unit-tested in isolation — same pattern as
// js/lib/portfolio-calc.js's computeKpis(data, cfg, billableData, billableTasks, findRate).

export function pbGetVersionBudget(v, cgComputeGrandTotals, getPipelineBudget) {
  const currencyRate = v.currencyRate || 1.0;
  if ((v.phases || []).length) {
    const g = cgComputeGrandTotals(v);
    return { ...g, currencyRate };
  }
  if (typeof getPipelineBudget === 'function') {
    const api = getPipelineBudget(v.versionId);
    if (api) return { fee: api.fee, ptc: api.ptc || 0, hrs: 0, currencyRate: api.currencyRate || currencyRate, _fromApi: true };
  }
  return { fee: 0, ptc: 0, hrs: 0, currencyRate };
}

export function pbComputeColumnTotals(cards, cgComputeGrandTotals, getPipelineBudget) {
  const byCurrency = {};
  let totalEur = 0, totalEurPtc = 0;
  cards.forEach(({ v }) => {
    const grand = pbGetVersionBudget(v, cgComputeGrandTotals, getPipelineBudget);
    const cur   = v.currency || 'EUR';
    const rate  = grand.currencyRate || v.currencyRate || 1.0;
    const fee   = isFinite(grand.fee) ? grand.fee : 0;
    const ptc   = isFinite(grand.ptc) ? grand.ptc : 0;
    if (!byCurrency[cur]) byCurrency[cur] = { fee: 0, ptc: 0, rate };
    byCurrency[cur].fee += fee;
    byCurrency[cur].ptc += ptc;
    totalEur    += fee / rate;
    totalEurPtc += ptc / rate;
  });
  return { byCurrency, totalEur, totalEurPtc };
}

export function pbFmtMoney(n, code, currencies) {
  const parsed = parseFloat(n);
  const opts   = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const cur    = (currencies || []).find(c => c.code === code)
    || { symbol: code === 'EUR' ? '€' : (code || '€'), locale: 'it-IT' };
  if (!isFinite(parsed)) return `${cur.symbol} 0,00`;
  return `${cur.symbol} ${new Intl.NumberFormat(cur.locale, opts).format(parsed)}`;
}

export function pbFmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  catch (e) { return iso; }
}

export function pbFmtTaskDate(d) {
  if (!d) return null;
  if (d.length === 10 && d[4] === '-') return d.slice(0, 4) + '/' + d.slice(5, 7); // YYYY-MM-DD
  if (d.length >= 6) return d.slice(0, 4) + '/' + d.slice(4, 6);                    // YYYYMM / YYYYMMDD
  return null;
}

export function pbComputePotPercentages(totalBudget, committedTotal, potAmount) {
  const pct  = potAmount > 0 ? Math.min(100, Math.round(totalBudget    / potAmount * 100)) : 0;
  const pctC = potAmount > 0 ? Math.min(100, Math.round(committedTotal / potAmount * 100)) : 0;
  const pctA = Math.min(pct - pctC, 100 - pctC);
  return { pct, pctC, pctA };
}

window.pbGetVersionBudget = pbGetVersionBudget;
window.pbComputeColumnTotals = pbComputeColumnTotals;
window.pbFmtMoney = pbFmtMoney;
window.pbFmtDate = pbFmtDate;
window.pbFmtTaskDate = pbFmtTaskDate;
window.pbComputePotPercentages = pbComputePotPercentages;
