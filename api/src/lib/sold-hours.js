const SOLD_HOURS_FRACTIONS = [0, 0.25, 0.5, 0.75];

function isValidSoldHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return false;
  const frac = n - Math.trunc(n);
  return SOLD_HOURS_FRACTIONS.some(f => Math.abs(frac - f) < 1e-9);
}

module.exports = { isValidSoldHours, SOLD_HOURS_FRACTIONS };
