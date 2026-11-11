// Server-side validation of rates and amounts (currency cycle 1, see
// docs/superpowers/specs/2026-10-29-currency-c1-server-rate-validation-design.md). Pure functions: each
// returns an error message, or null when the value is allowed. Only a JS number is a valid amount;
// extra decimals are refused, never rounded. Cycle 3 adds ratecardEntryError: a client rate card entry may
// carry a null EUR rate (= agency default) but must express a rate or a currency override.
const { currencyDigits } = require('./money-format');

// Cycle f2: amountError takes the column bound of the field it guards ({ max }, required); ptcRowsError and
// phasingError check the shape of a PTC array and a phasing object.
const MONEY_RULE_CODE = 'MONEY_RULE';
const MAX_DECIMAL_10_2 = 99999999.99;
const MAX_NUMERIC_14_2 = 999999999999.99;

function amountError(value, currencyCode, label, { max } = {}) {
  if (typeof max !== 'number' || !Number.isFinite(max)) throw new Error('amountError: max is required');
  const digits = currencyDigits('en', currencyCode);
  const ok = typeof value === 'number' && Number.isFinite(value) && value >= 0
    && Number(value.toFixed(digits)) === value;
  if (!ok) return `${label} must be a number ≥ 0 with at most ${digits} decimal(s) for ${currencyCode}.`;
  if (value > max) return `${label} must not exceed ${max} ${currencyCode}.`;
  return null;
}

function ptcRowsError(rows, currencyCode) {
  if (!Array.isArray(rows)) return 'PTC must be an array.';
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) return `PTC row ${i + 1} must be an object.`;
    const err = amountError(row.amount, currencyCode, `PTC row ${i + 1}`, { max: MAX_NUMERIC_14_2 });
    if (err) return err;
  }
  return null;
}

function phasingError(phasing, currencyCode) {
  if (!phasing || typeof phasing !== 'object' || Array.isArray(phasing)) return 'Phasing must be an object.';
  for (const [key, v] of Object.entries(phasing)) {
    const err = amountError(v, currencyCode, `Phasing ${key}`, { max: MAX_NUMERIC_14_2 });
    if (err) return err;
  }
  return null;
}

function overridesError(overrides, label) {
  if (overrides === undefined || overrides === null) return null;
  if (Array.isArray(overrides) || typeof overrides !== 'object') return `${label} must be an object.`;
  for (const [key, v] of Object.entries(overrides)) {
    const err = amountError(v, key, `${label} (${key})`, { max: MAX_DECIMAL_10_2 });
    if (err) return err;
  }
  return null;
}

function ratecardEntryError(entry, label) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `${label} must be an object.`;
  const { hourlyRate, rateOverrides } = entry;
  if (hourlyRate !== null && hourlyRate !== undefined) {
    const err = amountError(hourlyRate, 'EUR', `${label}: hourly rate`, { max: MAX_DECIMAL_10_2 });
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

module.exports = {
  MONEY_RULE_CODE, MAX_DECIMAL_10_2, MAX_NUMERIC_14_2,
  amountError, overridesError, ratecardEntryError, ptcRowsError, phasingError,
};
