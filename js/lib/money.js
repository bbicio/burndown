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

export function formatMoney(amount, code, currencies, { rounded = false, symbol = true } = {}) {
  const info = currencyInfo(code, currencies);
  const digits = rounded ? 0 : info.digits;
  const n = parseFloat(amount);
  // useGrouping 'always': some locales (it, es, pl, pt) skip the separator for 4-digit numbers by default;
  // amounts are always written with it (€ 1.234,50), in the separator of each currency's locale.
  const nf = numberFormat(info.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: 'always' });
  const text = nf.format(Number.isFinite(n) ? n : 0);
  return symbol ? `${info.symbol} ${text}` : text;
}

// Text shown in a money <input> while it has focus: same number format the parser reads.
// keepZero: a stored 0 opens as "0" instead of blank (for fields where 0 is a real value).
export function formatMoneyInput(amount, code, currencies, { keepZero = false } = {}) {
  const n = parseFloat(amount);
  if (!(n > 0) && !(keepZero && n === 0)) return '';
  const info = currencyInfo(code, currencies);
  return numberFormat(info.locale, {
    useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: info.digits,
  }).format(n);
}

function secondaryGroupSize(locale) {
  const ints = numberFormat(locale, { useGrouping: 'always' }).formatToParts(1234567).filter(p => p.type === 'integer');
  return ints.length >= 2 ? ints[ints.length - 2].value.length : 3;
}

function separators(locale) {
  // 12345.6 has five integer digits, so locales that skip grouping for 4-digit numbers still group it.
  const parts = numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).formatToParts(12345.6);
  return {
    group: parts.find(p => p.type === 'group')?.value || '',
    decimal: parts.find(p => p.type === 'decimal')?.value || '.',
    // size of the groups after the first one: 2 for hi-IN (1,23,456), 3 elsewhere.
    secondary: secondaryGroupSize(locale),
  };
}

const escRe = ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tells the three outcomes apart: null = blank, NaN = not a valid amount in the
// locale convention of `code`, otherwise the amount. The symbol or ISO code is accepted only at either end.
// `stored`: the amount the field was opened with; an unchanged read (equal to it once rounded to the
// currency digits) returns it untouched, so decimals beyond the currency's are not lost.
export function readMoneyInput(text, code, currencies, { stored } = {}) {
  if (String(text ?? '').trim() === '') return null;
  const info = currencyInfo(code, currencies);
  const { group, decimal, secondary } = separators(info.locale);
  let s = String(text)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0))
    .trim();
  const tags = [escRe(info.symbol)];
  if (/^[A-Za-z]+$/.test(info.code)) tags.push(escRe(info.code));
  const lead = new RegExp(`^(?:${tags.join('|')})\\s*`, 'i');
  const trail = new RegExp(`\\s*(?:${tags.join('|')})$`, 'i');
  s = s.replace(lead, '');
  s = s.replace(trail, '').trim();
  const G = /^\s$/u.test(group) ? '[ \\u00a0\\u202f]' : /^['’]$/.test(group) ? "['’]" : escRe(group);
  const D = escRe(decimal);
  const intPart = group
    ? `(?:\\d+|\\d{1,${secondary}}(?:${G}\\d{${secondary}})*${G}\\d{3})`
    : '\\d+';
  const frac = info.digits > 0 ? `(?:${D}\\d{0,${info.digits}})?` : '';
  if (!new RegExp(`^${intPart}${frac}$`).test(s)) return NaN;
  const plain = (group ? s.replace(new RegExp(G, 'g'), '') : s).replace(new RegExp(D), '.');
  const amount = Number(plain);
  if (stored != null && stored !== '' && Number.isFinite(Number(stored))) {
    // Round with the same Intl engine that wrote the field text (toFixed disagrees on half-way values).
    const shown = Number(numberFormat('en-US', {
      useGrouping: false, minimumFractionDigits: info.digits, maximumFractionDigits: info.digits,
    }).format(Number(stored)));
    if (amount === shown) return Number(stored);
  }
  return amount;
}

// The number format of a currency, as a hint next to an input: 1234.5 without the symbol.
export function moneyFormatExample(code, currencies) {
  const info = currencyInfo(code, currencies);
  return formatMoney(1234.5, code, currencies).slice(info.symbol.length + 1);
}

if (typeof window !== 'undefined') {
  window.currencyInfo = currencyInfo;
  window.formatMoney = formatMoney;
  window.formatMoneyInput = formatMoneyInput;
  window.readMoneyInput = readMoneyInput;
  window.moneyFormatExample = moneyFormatExample;
}
