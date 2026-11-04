// Pure helpers for the pipeline year a Draft carries from creation. No DB or Express dependency;
// the route looks the year up in pipeline_years and hands the row to pipelineYearAvailabilityError.
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function parsePipelineYear(value) {
  if (value === undefined || value === null) return { year: null };
  const ok = (typeof value === 'number' && Number.isInteger(value))
    || (typeof value === 'string' && /^\d+$/.test(value));
  const year = ok ? Number(value) : NaN;
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return { error: `pipelineYear must be an integer between ${MIN_YEAR} and ${MAX_YEAR}` };
  }
  return { year };
}

function pipelineYearAvailabilityError(row) {
  if (!row) return 'Pipeline year not found';
  if (!row.active) return 'Pipeline year is inactive';
  return null;
}

module.exports = { parsePipelineYear, pipelineYearAvailabilityError };
