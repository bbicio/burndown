'use strict';
// Validation of the flat `params` object shared by POST /rank, POST /chat and the LLM tools
// (spec 2026-09-29-planning-team-assistant §8), plus exact-name resolution for excludeResources.
const { isoDate, dateKey } = require('./planning-calendar');
const { normalizeName } = require('./match-resource');

const MAX_LIST = 20, MAX_EXCLUDED = 50, MAX_STR = 200;
const MAX_WINDOW_WEEKS = 104;
const KEYS = ['roles', 'excludeResources', 'requireTags', 'preferTags', 'minFreeHoursPerWeek', 'topN', 'window', 'includeAlternatives'];

const okStr = s => typeof s === 'string' && s.trim() !== '' && s.length <= MAX_STR;
function strList(v, max) {
  return Array.isArray(v) && v.length <= max && v.every(okStr) ? v.map(s => s.trim()) : null;
}
function tagList(v) {
  if (!Array.isArray(v) || v.length > MAX_LIST) return null;
  const out = [];
  for (const t of v) {
    if (!t || typeof t !== 'object' || !okStr(t.list) || !okStr(t.value)) return null;
    out.push({ list: t.list.trim(), value: t.value.trim() });
  }
  return out;
}

function parseParams(input) {
  const src = input == null ? {} : input;
  if (typeof src !== 'object' || Array.isArray(src)) return { ok: false, errors: { params: 'must be an object' } };
  const errors = {};
  const value = { topN: 3, includeAlternatives: true };
  const has = k => src[k] !== undefined && src[k] !== null;

  for (const k of Object.keys(src)) if (!KEYS.includes(k)) errors[k] = 'unknown parameter';

  if (has('roles')) {
    const v = strList(src.roles, MAX_LIST);
    if (v) value.roles = v; else errors.roles = `must be an array of at most ${MAX_LIST} role codes`;
  }
  if (has('excludeResources')) {
    const v = strList(src.excludeResources, MAX_EXCLUDED);
    if (v) value.excludeResources = v; else errors.excludeResources = `must be an array of at most ${MAX_EXCLUDED} names`;
  }
  for (const k of ['requireTags', 'preferTags']) {
    if (!has(k)) continue;
    const v = tagList(src[k]);
    if (v) value[k] = v; else errors[k] = `must be an array of at most ${MAX_LIST} { list, value } objects`;
  }
  if (has('minFreeHoursPerWeek')) {
    const n = src.minFreeHoursPerWeek;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 80) value.minFreeHoursPerWeek = n;
    else errors.minFreeHoursPerWeek = 'must be a number between 0 and 80';
  }
  if (has('topN')) {
    const n = src.topN;
    if (Number.isInteger(n) && n >= 1 && n <= 10) value.topN = n; else errors.topN = 'must be an integer between 1 and 10';
  }
  if (has('includeAlternatives')) {
    if (typeof src.includeAlternatives === 'boolean') value.includeAlternatives = src.includeAlternatives;
    else errors.includeAlternatives = 'must be a boolean';
  }
  if (has('window')) {
    const w = src.window;
    const isValidDateStr = str => typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
    const fromStr = isValidDateStr(w?.from) ? w.from : null;
    const toStr = isValidDateStr(w?.to) ? w.to : null;
    if (!fromStr || !toStr) errors.window = 'must be { from, to } with YYYY-MM-DD dates';
    else {
      const from = isoDate(fromStr);
      const to = isoDate(toStr);
      if (!from || !to) errors.window = 'invalid date (e.g. Feb 31)';
      else if (from > to) errors.window = 'from must not be after to';
      else if ((to - from) / 86400000 > MAX_WINDOW_WEEKS * 7) errors.window = `window is too long (max ${MAX_WINDOW_WEEKS} weeks)`;
      else value.window = { from: dateKey(from), to: dateKey(to) };
    }
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

// names: strings typed by the admin/LLM; resources: [{ id, first_name, last_name }].
// Exact full-name match (token-set, case/accent-insensitive). Unknown or ambiguous names are errors,
// never silently ignored.
function resolveExcluded(names, resources) {
  const byKey = new Map();
  for (const r of resources || []) {
    const key = normalizeName(`${r.first_name ?? ''} ${r.last_name ?? ''}`);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r.id);
  }
  const ids = new Set();
  const errors = [];
  for (const name of names || []) {
    const found = byKey.get(normalizeName(name)) || [];
    if (found.length === 1) ids.add(found[0]);
    else if (found.length === 0) errors.push(`No resource named "${name}"`);
    else errors.push(`"${name}" matches more than one resource`);
  }
  return { ids, errors };
}

module.exports = { MAX_WINDOW_WEEKS, parseParams, resolveExcluded };
