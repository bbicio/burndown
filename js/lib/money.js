// js/lib/money.js
// The single implementation of currency formatting and parsing. Loaded as a native ES module
// (<script type="module" src="js/lib/money.js?v=N">) and bridged onto `window` so the classic-script
// scripts and the Vue pages can call it. Pure: the currency list
// (window.__currencies shape, { code, symbol, locale, … }[]) is always passed in.

const FALLBACK_LOCALE = 'it-IT';

function numberFormat(locale, options) {
  try { return new Intl.NumberFormat(locale, options); }
  catch { return new Intl.NumberFormat(FALLBACK_LOCALE, options); }
}

// Intl throws on a code that is not a valid ISO 4217 shape (e.g. a stray '€'): default to 2 digits.
function currencyDigits(locale, code) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
  } catch { return 2; }
}

export function currencyInfo(code, currencies) {
  const c = code || 'EUR';
  const entry = (currencies || []).find(cu => cu.code === c);
  const locale = entry?.locale || FALLBACK_LOCALE;
  return {
    code: c,
    symbol: entry ? entry.symbol : (c === 'EUR' ? '€' : c),
    locale,
    digits: currencyDigits(locale, c),
  };
}

export function formatMoney(amount, code, currencies, { rounded = false } = {}) {
  const info = currencyInfo(code, currencies);
  const digits = rounded ? 0 : info.digits;
  const n = parseFloat(amount);
  // useGrouping 'always': some locales (it, es, pl, pt) skip the separator for 4-digit numbers by default;
  // amounts are always written with it (€ 1.234,50), in the separator of each currency's locale.
  const nf = numberFormat(info.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: 'always' });
  return `${info.symbol} ${nf.format(Number.isFinite(n) ? n : 0)}`;
}

// Text shown in a money <input> while it has focus: same number format the parser reads.
export function formatMoneyInput(amount, code, currencies) {
  const n = parseFloat(amount);
  if (!(n > 0)) return '';
  const info = currencyInfo(code, currencies);
  return numberFormat(info.locale, {
    useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: info.digits,
  }).format(n);
}

function separators(locale) {
  // 12345.6 has five integer digits, so locales that skip grouping for 4-digit numbers still group it.
  const parts = numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).formatToParts(12345.6);
  return {
    group: parts.find(p => p.type === 'group')?.value || '',
    decimal: parts.find(p => p.type === 'decimal')?.value || '.',
  };
}

// Strict: only the locale convention of `code` is valid. Returns 0 for empty/unparseable text.
export function parseMoney(text, code, currencies) {
  const info = currencyInfo(code, currencies);
  const { group, decimal } = separators(info.locale);
  let s = String(text ?? '');
  s = s.split(info.symbol).join('');
  if (/^[A-Za-z]+$/.test(info.code)) s = s.replace(new RegExp(info.code, 'gi'), '');
  s = s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
       .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0));
  s = s.replace(/[\s  ]/g, '');
  if (/^['’]$/.test(group)) s = s.replace(/['’]/g, '');
  else if (group) s = s.split(group).join('');
  if (decimal !== '.') s = s.split(decimal).join('.');
  if (!/^-?\d*\.?\d*$/.test(s)) return 0;
  const v = parseFloat(s);
  if (!Number.isFinite(v)) return 0;
  return Number(v.toFixed(info.digits));
}

if (typeof window !== 'undefined') {
  window.currencyInfo = currencyInfo;
  window.formatMoney = formatMoney;
  window.formatMoneyInput = formatMoneyInput;
  window.parseMoney = parseMoney;
}
