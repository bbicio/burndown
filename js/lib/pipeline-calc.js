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

// ── View-model functions for the redesigned board ──
// deps = { cgComputeGrandTotals, getPipelineBudget, getClientName, formatMoney, currencies }.
// Rate fallback everywhere: a non-finite or <= 0 rate is treated as 1 (never Infinity/NaN).
function pbSafeRate(r) {
  return typeof r === 'number' && isFinite(r) && r > 0 ? r : 1;
}

function pbCardFigures(v, deps) {
  const b = pbGetVersionBudget(v, deps.cgComputeGrandTotals, deps.getPipelineBudget);
  return {
    cur: v.currency || 'EUR',
    rate: pbSafeRate(b.currencyRate),
    fee: isFinite(b.fee) ? b.fee : 0,
    ptc: isFinite(b.ptc) ? b.ptc : 0,
  };
}

export function pbCardAmount(card, mode, deps) {
  const { cur, rate, fee, ptc } = pbCardFigures(card.v, deps);
  const money = (n, code) => deps.formatMoney(n, code, deps.currencies);
  const eur = mode === 'eur';
  const ptcText = ptc > 0 ? '+ ' + money(eur ? ptc / rate : ptc, eur ? 'EUR' : cur) + ' PTC' : null;
  if (!(fee > 0)) return { noBudget: true, main: null, approx: null, from: null, ptc: ptcText };
  if (eur) {
    return {
      noBudget: false,
      main: money(fee / rate, 'EUR'),
      approx: null,
      from: cur !== 'EUR' ? 'from ' + money(fee, cur) : null,
      ptc: ptcText,
    };
  }
  return {
    noBudget: false,
    main: money(fee, cur),
    approx: cur !== 'EUR' ? '≈ ' + money(fee / rate, 'EUR') : null,
    from: null,
    ptc: ptcText,
  };
}

function pbAggregate(cards, deps) {
  const byCurrency = {};
  let totalEur = 0, totalEurPtc = 0, anyForeign = false;
  cards.forEach(({ v }) => {
    const { cur, rate, fee, ptc } = pbCardFigures(v, deps);
    if (!byCurrency[cur]) byCurrency[cur] = 0;
    byCurrency[cur] += fee;
    totalEur += fee / rate;
    totalEurPtc += ptc / rate;
    if (cur !== 'EUR') anyForeign = true;
  });
  return { byCurrency, totalEur, totalEurPtc, anyForeign };
}

export function pbColumnHeader(cards, mode, deps) {
  const count = cards.length;
  if (!count) return { count: 0, total: null, approx: false, ptc: null, pills: [] };
  const money = (n, code) => deps.formatMoney(n, code, deps.currencies);
  const { byCurrency, totalEur, totalEurPtc, anyForeign } = pbAggregate(cards, deps);
  const pills = mode === 'original' && anyForeign
    ? Object.keys(byCurrency)
        .sort((a, b) => (a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b)))
        .map(code => ({ code, text: money(byCurrency[code], code) }))
    : [];
  return {
    count,
    total: money(totalEur, 'EUR'),
    approx: anyForeign,
    ptc: totalEurPtc > 0 ? '+ ' + money(totalEurPtc, 'EUR') + ' PTC' : null,
    pills,
  };
}

export function pbOpenPipelineTotal(columns, deps) {
  const open = ['SIP', 'Expected', 'Anticipated'];
  const cards = [];
  columns.forEach(c => { if (open.includes(c.stage)) cards.push(...c.cards); });
  const { totalEur, anyForeign } = pbAggregate(cards, deps);
  return { text: deps.formatMoney(totalEur, 'EUR', deps.currencies), approx: anyForeign };
}

export function pbHighlight(text, query) {
  const str = text == null ? '' : String(text);
  const q = (query || '').trim().toLowerCase();
  if (!q) return [{ text: str, hit: false }];
  const lower = str.toLowerCase();
  // lower-casing can change length for exotic characters: fall back to no highlight then
  if (lower.length !== str.length) return [{ text: str, hit: false }];
  const out = [];
  let i = 0;
  while (i < str.length) {
    const at = lower.indexOf(q, i);
    if (at === -1) { out.push({ text: str.slice(i), hit: false }); break; }
    if (at > i) out.push({ text: str.slice(i, at), hit: false });
    out.push({ text: str.slice(at, at + q.length), hit: true });
    i = at + q.length;
  }
  return out.length ? out : [{ text: str, hit: false }];
}

export function pbSearchSuggestions(cards, query, deps) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return { empty: true, clients: [], proposals: [], more: 0 };
  const clientNameOf = (v) => (typeof deps.getClientName === 'function' ? (deps.getClientName(v.clientId) || '') : '');
  const matches = (c) => {
    const name = (c.v.projectName || c.cg.name || '').toLowerCase();
    return name.includes(q) || clientNameOf(c.v).toLowerCase().includes(q);
  };

  const byClient = new Map();
  cards.forEach(c => {
    if (c.stage === 'Draft' || !c.v.clientId) return;
    const name = clientNameOf(c.v);
    if (!name || name === 'Unassigned') return;
    const e = byClient.get(c.v.clientId) || { id: c.v.clientId, name, count: 0 };
    e.count += 1;
    byClient.set(c.v.clientId, e);
  });
  const clients = [...byClient.values()]
    .filter(e => e.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(e => ({ ...e, segments: pbHighlight(e.name, query) }));

  const matched = cards.filter(matches);
  const proposals = matched.slice(0, 4).map(c => {
    const title = c.v.projectName || c.cg.name || '—';
    return {
      cgId: c.cg.id,
      verId: c.v.versionId,
      title,
      segments: pbHighlight(title, query),
      amount: pbCardAmount(c, 'original', deps).main,
      stage: c.stage,
      clientName: clientNameOf(c.v) || '—',
    };
  });
  return { empty: false, clients, proposals, more: Math.max(0, matched.length - 4) };
}

window.pbCardAmount = pbCardAmount;
window.pbColumnHeader = pbColumnHeader;
window.pbOpenPipelineTotal = pbOpenPipelineTotal;
window.pbHighlight = pbHighlight;
window.pbSearchSuggestions = pbSearchSuggestions;
window.pbGetVersionBudget = pbGetVersionBudget;
window.pbComputeColumnTotals = pbComputeColumnTotals;
window.pbPriceBucketKey = pbPriceBucketKey;
window.pbCardMatchesFilters = pbCardMatchesFilters;
window.pbFmtDate = pbFmtDate;
window.pbFmtTaskDate = pbFmtTaskDate;
window.pbComputePotPercentages = pbComputePotPercentages;
