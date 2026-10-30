// Server-side validation of rates and amounts (currency cycle 1, see
// docs/superpowers/specs/2026-10-29-currency-c1-server-rate-validation-design.md). Pure functions: each
// returns an error message, or null when the value is allowed. Only a JS number is a valid amount;
// extra decimals are refused, never rounded. Cycle 3 adds ratecardEntryError: a client rate card entry may
// carry a null EUR rate (= agency default) but must express a rate or a currency override.
const { currencyDigits } = require('./money-format');

const MONEY_RULE_CODE = 'MONEY_RULE';

function amountError(value, currencyCode, label) {
  const digits = currencyDigits('en', currencyCode);
  const ok = typeof value === 'number' && Number.isFinite(value) && value >= 0
    && Number(value.toFixed(digits)) === value;
  return ok ? null : `${label} must be a number ≥ 0 with at most ${digits} decimal(s) for ${currencyCode}.`;
}

function overridesError(overrides, label) {
  if (overrides === undefined || overrides === null) return null;
  if (Array.isArray(overrides) || typeof overrides !== 'object') return `${label} must be an object.`;
  for (const [key, v] of Object.entries(overrides)) {
    const err = amountError(v, key, `${label} (${key})`);
    if (err) return err;
  }
  return null;
}

function ratecardEntryError(entry, label) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `${label} must be an object.`;
  const { hourlyRate, rateOverrides } = entry;
  if (hourlyRate !== null && hourlyRate !== undefined) {
    const err = amountError(hourlyRate, 'EUR', `${label}: hourly rate`);
    if (err) return err;
  }
  const err = overridesError(rateOverrides, `${label}: rate overrides`);
  if (err) return err;
  const hasRate = hourlyRate !== null && hourlyRate !== undefined;
  // The EUR rate lives in hourlyRate: an EUR key in rateOverrides is never read, so it does not count.
  const hasOverride = rateOverrides && typeof rateOverrides === 'object'
    && Object.keys(rateOverrides).some(k => k !== 'EUR');
  if (!hasRate && !hasOverride) return `${label} has neither a rate nor a currency override.`;
  return null;
}

module.exports = { MONEY_RULE_CODE, amountError, overridesError, ratecardEntryError };
