// js/lib/cfg-parse.js
// Pure helpers extracted from js/config-form.js. Loaded as a native ES module
// (<script type="module">) and bridged onto `window` so existing classic-script
// callers keep working unchanged. See CLAUDE.md "Script loading order" for the
// deferred-execution rule this bridge depends on.

export function cfgParseHours(str) {
  // Hours are always formatted with "." as decimal (via cfgFmtHours / toFixed).
  // Never run through cfgParseMoney — de-DE locale strips "." as thousands sep → "22.25" → 2225.
  const s = String(str).trim().replace(/[^\d.]/g, '');
  return parseFloat(s) || 0;
}

export function roundToQuarterHour(n) {
  return Math.round(n * 4) / 4;
}

export function cfgFmtHours(n) {
  if (!(n > 0)) return '';
  // Snap to nearest quarter-hour (XLS actuals are always .00/.25/.50/.75)
  const r = roundToQuarterHour(n);
  // Always use "." as decimal — cfgParseHours must match this convention
  return r % 1 === 0 ? String(r) : r.toFixed(2);
}

export function distributeHoursExact(total, rawValues, grid = 0.25) {
  const keys = Object.keys(rawValues);

  keys.forEach(key => {
    if (rawValues[key] < 0) {
      throw new Error(`distributeHoursExact: negative rawValues entry for "${key}" (${rawValues[key]})`);
    }
  });

  const rawSum = keys.reduce((s, key) => s + rawValues[key], 0);
  if (Math.abs(rawSum - total) > 0.05) {
    throw new Error(
      `distributeHoursExact: sum of rawValues (${rawSum}) diverges from total (${total}) by more than 0.05`
    );
  }

  const roundedTotal = Math.round(total / grid) * grid;

  const entries = keys.map(key => {
    const raw = rawValues[key];
    const floorValue = Math.floor(raw / grid) * grid;
    const remainder = raw - floorValue;
    return { key, floorValue, remainder };
  });

  const floorSum = entries.reduce((s, e) => s + e.floorValue, 0);
  const stepsNeeded = Math.round((roundedTotal - floorSum) / grid);

  entries.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const result = {};
  entries.forEach((e, i) => {
    result[e.key] = i < stepsNeeded ? Math.round((e.floorValue + grid) * 1e10) / 1e10 : e.floorValue;
  });
  return result;
}

export const SOLD_HOURS_FRACTIONS = [0, 0.25, 0.5, 0.75];

export function isValidSoldHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return false;
  const frac = n - Math.trunc(n);
  return SOLD_HOURS_FRACTIONS.some(f => Math.abs(frac - f) < 1e-9);
}

window.cfgParseHours = cfgParseHours;
window.roundToQuarterHour = roundToQuarterHour;
window.cfgFmtHours = cfgFmtHours;
window.distributeHoursExact = distributeHoursExact;
window.SOLD_HOURS_FRACTIONS = SOLD_HOURS_FRACTIONS;
window.isValidSoldHours = isValidSoldHours;
