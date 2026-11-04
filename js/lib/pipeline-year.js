// js/lib/pipeline-year.js
// The pipeline year the board shows, remembered across pages (2026-11-04).
// Loaded as a native ES module and bridged onto `window` for pipeline.html (read the bridges only inside
// functions that run after DOMContentLoaded). The key is listed in js/core.js's cleanLegacyStorage() `keep` Set.

export const PIPELINE_YEAR_KEY = 'PDash_pipelineYear';

// URL year, then the remembered one, then the current year, then the first available year; a year that is
// not in `availableYears` (a non-admin only receives active years) is skipped, never requested.
export function resolvePipelineYear({ urlYear, storedYear, availableYears, currentYear }) {
  const available = availableYears || [];
  for (const y of [urlYear, storedYear, currentYear]) {
    if (Number.isInteger(y) && available.includes(y)) return y;
  }
  return available.length ? available[0] : currentYear;
}

export function readStoredPipelineYear() {
  try {
    const raw = localStorage.getItem(PIPELINE_YEAR_KEY);
    return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  } catch (e) {
    return null;
  }
}

export function storePipelineYear(year) {
  try { localStorage.setItem(PIPELINE_YEAR_KEY, String(year)); } catch (e) { /* storage unavailable */ }
}

if (typeof window !== 'undefined') {
  window.PIPELINE_YEAR_KEY = PIPELINE_YEAR_KEY;
  window.resolvePipelineYear = resolvePipelineYear;
  window.readStoredPipelineYear = readStoredPipelineYear;
  window.storePipelineYear = storePipelineYear;
}
