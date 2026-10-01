// Server-side twin of js/lib/money.js's formatMoney (no build step, so the browser module cannot be
// required here). Same output for the same inputs; keep the two test tables in sync.
const FALLBACK_LOCALE = 'it-IT';

function numberFormat(locale, options) {
  try { return new Intl.NumberFormat(locale, options); }
  catch { return new Intl.NumberFormat(FALLBACK_LOCALE, options); }
}

function currencyDigits(locale, code) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
  } catch { return 2; }
}

function formatMoney(amount, { code, symbol, locale } = {}, { rounded = false } = {}) {
  const c = code || 'EUR';
  const loc = locale || FALLBACK_LOCALE;
  const sym = symbol || (c === 'EUR' ? '€' : c);
  const digits = rounded ? 0 : currencyDigits(loc, c);
  const n = parseFloat(amount);
  // 'always': amounts keep the thousands separator even for 4-digit numbers (same as js/lib/money.js).
  const nf = numberFormat(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: 'always' });
  return `${sym} ${nf.format(Number.isFinite(n) ? n : 0)}`;
}

module.exports = { formatMoney };
