// ── Pure aggregation/formatting logic extracted from js/pipeline-board.js ──
// cgComputeGrandTotals/getPipelineBudget are injected (not imported) so this module has
// zero DOM/global dependencies and can be unit-tested in isolation — same pattern as
// js/lib/portfolio-calc.js's computeKpis(data, cfg, billableData, billableTasks, findRate).

// Price-bracket boundaries for the pipeline board's filter bar. Lower bound inclusive,
// upper bound exclusive — a value exactly at a boundary falls into the higher bucket.
const PB_PRICE_BUCKETS = [
  { key: '0-20k',    max: 20000 },
  { key: '20-50k',   max: 50000 },
  { key: '50-100k',  max: 100000 },
  { key: '100-200k', max: 200000 },
  { key: '200k+',    max: Infinity },
];

export function pbPriceBucketKey(amountEur) {
  const n = isFinite(amountEur) ? amountEur : 0;
  return PB_PRICE_BUCKETS.find(b => n < b.max).key;
}

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

// Pipeline board filter bar: AND across filter categories, OR within a category's own
// selected values (an empty array/string for any given filter means "no restriction").
// getClientName is injected (like cgComputeGrandTotals/getPipelineBudget) to keep this
// module DOM/global-free — it resolves v.clientId to a display name for the free-text search.
export function pbCardMatchesFilters(card, filters, cgComputeGrandTotals, getPipelineBudget, getClientName) {
  const {
    search = '', ownerIds = [], clientIds = [], currencies = [], priceBuckets = [], includePtc = false,
  } = filters || {};
  const { cg, v } = card;

  if (ownerIds.length && !ownerIds.includes(cg.ownerId)) return false;
  if (clientIds.length && !clientIds.includes(v.clientId)) return false;
  if (currencies.length && !currencies.includes(v.currency || 'EUR')) return false;

  if (priceBuckets.length) {
    const budget = pbGetVersionBudget(v, cgComputeGrandTotals, getPipelineBudget);
    const rate = budget.currencyRate || v.currencyRate || 1.0;
    const fee = isFinite(budget.fee) ? budget.fee : 0;
    const ptc = includePtc && isFinite(budget.ptc) ? budget.ptc : 0;
    const eurTotal = (fee + ptc) / rate;
    if (!priceBuckets.includes(pbPriceBucketKey(eurTotal))) return false;
  }

  const q = (search || '').trim().toLowerCase();
  if (q) {
    const name = (v.projectName || cg.name || '').toLowerCase();
    const clientName = (typeof getClientName === 'function' ? (getClientName(v.clientId) || '') : '').toLowerCase();
    if (!name.includes(q) && !clientName.includes(q)) return false;
  }

  return true;
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
window.pbPriceBucketKey = pbPriceBucketKey;
window.pbCardMatchesFilters = pbCardMatchesFilters;
window.pbFmtMoney = pbFmtMoney;
window.pbFmtDate = pbFmtDate;
window.pbFmtTaskDate = pbFmtTaskDate;
window.pbComputePotPercentages = pbComputePotPercentages;
