// js/lib/master-pipelines.js
// Pure helpers of master-pipelines.html ("Pipelines & POTs"): URL state per level, POT summary maths,
// available POT targets, phasing filter and totals. Loaded as an ES module
// (<script type="module" src="js/lib/master-pipelines.js?v=N">) and bridged onto `window`.

export const ACTIVE_STAGES = ['SIP', 'Expected', 'Anticipated', 'Committed'];

const SPECIALS = [
  { value: '__unassigned__', label: 'Unassigned / To be Identified' },
  { value: '__newbiz__', label: 'New Biz' },
];
const PHASING_MODES = ['proposal', 'project'];
const byName = (a, b) => String(a.name).localeCompare(String(b.name));

// ?year=Y -> POT targets, ?year=Y&pot=<id> -> drawer, ?year=Y&phasing=proposal|project -> phasing; none -> list.
export function parseMdpUrl(search) {
  const q = new URLSearchParams(search || '');
  const y = q.get('year');
  const year = /^\d{4}$/.test(y || '') && +y >= 2000 && +y <= 2100 ? +y : null;
  if (year === null) return { year: null, pot: null, phasing: null };
  const ph = q.get('phasing');
  const phasing = PHASING_MODES.includes(ph) ? ph : null;
  const pot = phasing ? null : (q.get('pot') || null);
  return { year, pot, phasing };
}

export function buildMdpUrl({ year, pot, phasing } = {}) {
  if (!year) return '';
  if (phasing) return `?year=${year}&phasing=${phasing}`;
  if (pot) return `?year=${year}&pot=${encodeURIComponent(pot)}`;
  return `?year=${year}`;
}

export function resolvePot(pots, id) {
  if (!id) return null;
  return (pots || []).find(p => p.id === id) || null;
}

export function potCountByYear(pots) {
  const out = {};
  for (const p of pots || []) out[p.year] = (out[p.year] || 0) + 1;
  return out;
}

export function achievement(achieved, target) {
  const t = Number(target);
  if (!Number.isFinite(t) || t <= 0) return null;
  return Math.round((Number(achieved) || 0) / t * 100);
}

export function gapToTarget(target, ca) {
  const t = Number(target) || 0;
  const a = Number(ca) || 0;
  return { gap: Math.max(0, t - a), over: Math.max(0, a - t) };
}

// Committed proposals that belong to no POT: year Committed total minus what the POTs account for.
export function outsidePotCommitted(summary, pots) {
  const row = (summary || []).find(s => s.pipeline === 'Committed');
  if (!row) return null;
  const inPots = (pots || []).reduce((s, p) => s + (Number(p.committed_total) || 0), 0);
  const rest = (Number(row.total) || 0) - inPots;
  return Math.round(rest * 100) > 0 ? rest : null; // below one cent is float residue, not an amount
}

export function potClientIds(pot, groups) {
  if (pot.client_id) return new Set([pot.client_id]);
  if (pot.client_group_id) {
    const g = (groups || []).find(x => x.id === pot.client_group_id);
    return new Set((g?.clients || []).map(c => c.id));
  }
  return new Set();
}

export function availableTargets({ type, pots, clients, groups }) {
  if (type === 'group') {
    const taken = new Set((pots || []).map(p => p.client_group_id).filter(Boolean));
    return [...(groups || [])].sort(byName).filter(g => !taken.has(g.id)).map(g => ({ value: g.id, label: g.name }));
  }
  const takenClients = new Set((pots || []).map(p => p.client_id).filter(Boolean));
  const takenLabels = new Set((pots || []).map(p => p.special_label).filter(Boolean));
  return [
    ...SPECIALS.filter(s => !takenLabels.has(s.label)),
    { value: '__sep__', label: '──────────', disabled: true },
    ...[...(clients || [])].sort(byName).filter(c => !takenClients.has(c.id)).map(c => ({ value: c.id, label: c.name })),
  ];
}

export function rowMonthAmount(row, month) {
  const v = row?.months?.[month];
  const n = v !== null && typeof v === 'object' ? v.amount : v;
  return Number(n) || 0;
}

export function rowCurrency(row) {
  return String(row?.currency || 'EUR').trim() || 'EUR';
}

// Draft and Canceled are always out. stages: [] = all; clientId and potClients (Set|null) are ANDed.
export function filterPhasingRows(rows, { stages = [], clientId = '', potClients = null } = {}) {
  return (rows || []).filter(r =>
    ACTIVE_STAGES.includes(r.pipeline)
    && (!stages.length || stages.includes(r.pipeline))
    && (!clientId || r.clientId === clientId)
    && (!potClients || potClients.has(r.clientId)));
}

function emptyTotal(currency, months) {
  return { currency, count: 0, months: Object.fromEntries(months.map(m => [m, 0])), total: 0 };
}

export function phasingTotals(rows, months, mode) {
  const list = rows || [];
  if (mode === 'original') {
    const byCur = new Map();
    for (const r of list) {
      const cur = rowCurrency(r);
      if (!byCur.has(cur)) byCur.set(cur, emptyTotal(cur, months));
      const t = byCur.get(cur);
      t.count++;
      for (const m of months) { const a = rowMonthAmount(r, m); t.months[m] += a; t.total += a; }
    }
    return [...byCur.values()].sort((a, b) =>
      (a.currency === 'EUR' ? -1 : b.currency === 'EUR' ? 1 : a.currency.localeCompare(b.currency)));
  }
  const t = emptyTotal('EUR', months);
  for (const r of list) {
    const rate = Number(r.currencyRate) || 1;
    t.count++;
    for (const m of months) { const a = rowMonthAmount(r, m) / rate; t.months[m] += a; t.total += a; }
  }
  return [t];
}

export function stageCounts(rows) {
  const out = Object.fromEntries(ACTIVE_STAGES.map(s => [s, 0]));
  for (const r of rows || []) if (r.pipeline in out) out[r.pipeline]++;
  return out;
}

// What a dismiss (scrim, Cancel, Esc; closeAll = the close button) does to the side drawer.
export function mdpDrawerDismiss({ pyfShow = false, potfShow = false, hasDetails = false, loading = false, closeAll = false } = {}) {
  if (loading) return 'none';
  const formOpen = pyfShow || potfShow;
  if (!formOpen && !hasDetails) return 'none';
  if (closeAll || !formOpen) return 'close-drawer';
  return potfShow && hasDetails ? 'back-to-details' : 'close-form';
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    parseMdpUrl, buildMdpUrl, resolvePot, potCountByYear, achievement, gapToTarget, outsidePotCommitted,
    potClientIds, availableTargets, ACTIVE_STAGES, rowMonthAmount, rowCurrency, filterPhasingRows,
    phasingTotals, stageCounts, mdpDrawerDismiss,
  });
}
