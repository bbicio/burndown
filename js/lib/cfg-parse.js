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

window.cfgParseHours = cfgParseHours;
