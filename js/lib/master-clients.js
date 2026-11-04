// js/lib/master-clients.js
// Pure helpers of master-clients.html ("Clients & groups"): list filter, group sections, rate card
// sources and save payload, client moves between groups, URL state. Loaded as an ES module
// (<script type="module" src="js/lib/master-clients.js?v=N">) and bridged onto `window`.
import { resolveRoleRate } from './costgrid-calc.js?v=16';
import { readMoneyInput } from './money.js?v=6';

const byName = (a, b) => String(a.name).localeCompare(String(b.name));

// `clients`: { id, name, groupId }; `groupsById`: Map<id, { name }>. Matches the client's or its group's name.
export function filterClients(clients, groupsById, query) {
  const q = String(query ?? '').trim().toLowerCase();
  const hit = c => !q
    || String(c.name).toLowerCase().includes(q)
    || String(groupsById?.get(c.groupId)?.name ?? '').toLowerCase().includes(q);
  return (clients || []).filter(hit).sort(byName);
}

// Groups by name (empty ones too), then { group: null } only when some client has no group.
export function groupSections(clients, groups) {
  const sorted = [...(groups || [])].sort(byName);
  const sections = sorted.map(g => ({ group: g, clients: (clients || []).filter(c => c.groupId === g.id).sort(byName) }));
  const ids = new Set(sorted.map(g => g.id));
  const loose = (clients || []).filter(c => !c.groupId || !ids.has(c.groupId)).sort(byName);
  if (loose.length) sections.push({ group: null, clients: loose });
  return sections;
}

// Entries that carry a value of their own: a EUR rate or at least one non-null override.
export function customRateCount(ratecard) {
  return (ratecard?.entries || []).filter(e => {
    const eur = e.hourlyRate ?? e.hourly_rate;
    const ov = e.rateOverrides ?? e.rate_overrides ?? {};
    return eur != null || Object.values(ov).some(v => v != null);
  }).length;
}

export function roleFamily(code) {
  const s = String(code ?? '');
  const i = s.indexOf(' - ');
  const fam = i === -1 ? '' : s.slice(0, i).trim();
  return fam || 'Other';
}

export function sortFamilies(names) {
  return [...names].sort((a, b) => (a === 'Other') - (b === 'Other') || a.localeCompare(b));
}

// Where a rate card cell's effective value comes from. `row` = { roleId, defaults, texts, stored }.
export function cellSource({ row, code, currencies }) {
  const customOf = c => {
    const v = readMoneyInput(row.texts?.[c], c, currencies, { stored: row.stored?.[c] });
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  };
  const own = customOf(code);
  if (own !== null) return { value: own, kind: 'custom' };

  const agencyEur = row.defaults?.EUR;
  const customEur = customOf('EUR');
  const roleId = String(row.roleId);
  const rateOf = (currency, currencyRate) => resolveRoleRate({
    roleId,
    globalRate: agencyEur,
    currency,
    currencyRate,
    ratecardMap: customEur !== null ? { [roleId]: customEur } : {},
    ratecardOverrides: {},
    roleOverrides: Object.fromEntries(Object.entries(row.defaults || {}).filter(([c]) => c !== 'EUR')),
  }).effectiveRate;

  if (code === 'EUR') {
    return agencyEur > 0 ? { value: rateOf('EUR', 1), kind: 'agency' } : { value: null, kind: 'missing' };
  }
  const agencyCur = row.defaults?.[code];
  const rate = currencies?.find(c => c.code === code)?.current_rate;
  if (agencyCur != null) return { value: rateOf(code, Number(rate)), kind: 'agency-currency' };
  if (customEur !== null || agencyEur > 0) return { value: rateOf(code, Number(rate)), kind: 'converted' };
  return { value: null, kind: 'missing' };
}

// The body of the rate card save (moved unchanged from the modal): { entries } or { error: { code } }
// for the first invalid amount. A role with every field blank has no entry: the replacement drops it.
export function buildRatecardEntries(rows, currencies) {
  const entries = [];
  for (const row of rows) {
    let hourlyRate = null;
    const rateOverrides = { ...row.hidden };
    for (const code of Object.keys(row.texts)) {
      const v = readMoneyInput(row.texts[code], code, currencies, { stored: row.stored[code] });
      if (Number.isNaN(v)) return { error: { code } };
      if (v === null) continue;
      if (code === 'EUR') hourlyRate = v; else rateOverrides[code] = v;
    }
    if (hourlyRate === null && !Object.keys(rateOverrides).length) continue;
    entries.push({ roleId: row.roleId, hourlyRate, rateOverrides });
  }
  return { entries };
}

// api = { assignClient(groupId, clientId), removeClient(groupId, clientId) }. A client is in one group:
// remove from the old, assign to the new; a failed assign puts the client back where it was.
export async function moveClient({ clientId, fromGroupId, toGroupId }, api) {
  if (fromGroupId === toGroupId) return;
  if (fromGroupId) await api.removeClient(fromGroupId, clientId);
  if (!toGroupId) return;
  try {
    await api.assignClient(toGroupId, clientId);
  } catch (err) {
    if (fromGroupId) { try { await api.assignClient(fromGroupId, clientId); } catch { /* original error wins */ } }
    throw err;
  }
}

export function groupNameError(name, groups, selfId) {
  const n = String(name ?? '').trim();
  if (!n) return 'Name is required.';
  const clash = (groups || []).find(g => g.id !== selfId && String(g.name).trim().toLowerCase() === n.toLowerCase());
  return clash ? `A group named "${clash.name}" already exists.` : null;
}

export function readUrlState(search) {
  const p = new URLSearchParams(search || '');
  const clientId = p.get('client') || null;
  return { view: p.get('view') === 'group' ? 'group' : 'list', clientId };
}

export function urlFor({ view, clientId }) {
  const parts = [];
  if (view === 'group') parts.push('view=group');
  if (clientId) parts.push(`client=${encodeURIComponent(clientId)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// Does any of the row's cells carry a value of its own? `saved` reads the texts the card was opened (or
// last saved) with, so a row being edited keeps its place under the "Only customized" filter.
export function rowIsCustom({ row, codes, currencies, saved = false }) {
  const r = saved && row.initial ? { ...row, texts: row.initial } : row;
  return codes.some(code => cellSource({ row: r, code, currencies }).kind === 'custom');
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    filterClients, groupSections, customRateCount, roleFamily, sortFamilies, cellSource,
    buildRatecardEntries, moveClient, groupNameError, readUrlState, urlFor, rowIsCustom,
  });
}
