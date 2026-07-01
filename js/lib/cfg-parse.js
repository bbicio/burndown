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

window.cfgParseHours = cfgParseHours;
window.roundToQuarterHour = roundToQuarterHour;
window.cfgFmtHours = cfgFmtHours;
