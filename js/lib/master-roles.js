// js/lib/master-roles.js
// Pure helpers of master-roles.html ("Roles & rates"): team of a code, list filter and groups, rate
// columns, € fallback of a missing currency rate, Team + Role code over the single `code` field. Loaded as
// an ES module (<script type="module" src="js/lib/master-roles.js?v=N">) and bridged onto `window`.
import { resolveRoleRate } from './costgrid-calc.js?v=16';

const SEP = ' - ';

// Prefix before the first " - "; else the first token. Resource Planning filters use the same rule.
export function extractTeam(code) {
  if (!code) return '—';
  const idx = code.indexOf(SEP);
  return idx > 0 ? code.slice(0, idx).trim() : (code.split(/[\s_-]/)[0] || '—');
}

// The list shows 0 and null alike as "No rate"; 0 stays saveable.
export function isMissingRate(rate) {
  return rate == null || Number(rate) === 0;
}

export function rateColumns(currencies) {
  const list = currencies || [];
  const eur = list.find(c => c.code === 'EUR') || { code: 'EUR' };
  return [eur, ...list.filter(c => c.code !== 'EUR' && c.active)];
}

export function filterRoles(roles, { query = '', missingOnly = false } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  return (roles || []).filter(r =>
    (!q || String(r.label).toLowerCase().includes(q) || String(r.code).toLowerCase().includes(q))
    && (!missingOnly || isMissingRate(r.rate)));
}

export function groupRoles(roles) {
  const byTeam = new Map();
  for (const r of roles || []) {
    const t = extractTeam(r.code);
    if (!byTeam.has(t)) byTeam.set(t, []);
    byTeam.get(t).push(r);
  }
  return [...byTeam.keys()].sort((a, b) => a.localeCompare(b)).map(team => {
    const list = byTeam.get(team).sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return { team, roles: list, missing: list.filter(r => isMissingRate(r.rate)).length };
  });
}

// What a proposal in `currency` would use for a role with no override: € rate × current rate.
export function fallbackRate(role, currency) {
  const rate = Number(currency?.current_rate);
  if (isMissingRate(role?.rate) || !(rate > 0)) return null;
  return resolveRoleRate({ roleId: role.id, globalRate: Number(role.rate), currency: currency.code, currencyRate: rate }).effectiveRate;
}

export function splitCode(code) {
  const c = String(code ?? '');
  const idx = c.indexOf(SEP);
  if (idx > 0) return { team: extractTeam(c), role: c.slice(idx + SEP.length).trim() };
  return { team: '', role: c.trim() };
}

export function joinCode(team, role) {
  const t = String(team ?? '').trim();
  const r = String(role ?? '').trim();
  return t ? t + SEP + r : r;
}

export function teamOptions(roles) {
  const teams = new Set((roles || []).filter(r => String(r.code ?? '').includes(SEP)).map(r => extractTeam(r.code)));
  return [...teams].sort((a, b) => a.localeCompare(b));
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    extractTeam, isMissingRate, rateColumns, filterRoles, groupRoles, fallbackRate, splitCode, joinCode, teamOptions,
  });
}
