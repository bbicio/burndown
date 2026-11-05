// js/lib/master-currencies.js
// Pure helpers of master-currencies.html ("Currencies"): rate format, inverse and parsing, history delta,
// history entries, activation picker, rate dates and the trend chart points. Loaded as an ES module
// (<script type="module" src="js/lib/master-currencies.js?v=N">) and bridged onto `window`.
import { formatDayText } from './dates.js?v=4';

const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));

// The rate columns are DECIMAL(10,6): below 0.000001 a rate is stored as 0, from 10000 it overflows.
export const RATE_MIN = 0.000001;
export const RATE_MAX = 9999.999999;

export function isValidRate(n) {
  return typeof n === 'number' && isFinite(n) && n >= RATE_MIN && n <= RATE_MAX;
}

// null for a valid rate, else the message shown under the input.
export function rateError(n) {
  if (!(typeof n === 'number' && n > 0)) return 'Rate must be a positive number';
  if (!isValidRate(n)) return 'Rate must be between 0.000001 and 9999.999999';
  return null;
}

// Equal once stored at 6 decimals.
export function sameRate(a, b) {
  return Math.round(Number(a) * 1e6) === Math.round(Number(b) * 1e6);
}

// A Confirm that lands this soon after the dialog opened is the repeat of the Enter that opened it.
export const CONFIRM_DELAY_MS = 400;
export function confirmReady(openedAt, now) {
  return now - openedAt >= CONFIRM_DELAY_MS;
}

// The sheet to show after the width crosses the phone breakpoint: an open inline row becomes its sheet on
// phone; on wider screens the sheet closes and the same state shows inline.
export function sheetOnResize(isPhone, { sheet, actShow, editCode }) {
  if (!isPhone) return null;
  if (sheet) return sheet;
  if (actShow) return 'activate';
  if (editCode) return 'edit';
  return null;
}

// 4 to 6 decimals, never grouped. Rates are NUMERIC strings from pg ("1.300000").
export function formatRate(rate) {
  const n = num(rate);
  if (!isFinite(n)) return '';
  return n.toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 6, useGrouping: false });
}

export function inverseRate(rate) {
  const n = num(rate);
  if (!isValidRate(n)) return '';
  return (1 / n).toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: false });
}

// null = blank, NaN = invalid; a single "," or "." separator.
export function parseRateText(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (!/^\d+([.,]\d*)?$/.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

export function editText(rate) {
  return formatRate(rate);
}

export function rateDelta(rows) {
  if (!rows || rows.length < 2) return null;
  const r0 = num(rows[0].rate), r1 = num(rows[1].rate);
  if (!isFinite(r0) || !isFinite(r1) || r1 === 0) return null;
  const pct = (r0 - r1) / r1 * 100;
  if (Math.abs(pct) < 0.01) return null;
  return { pct, dir: pct > 0 ? 'up' : 'down' };
}

export function formatDelta(d) {
  return (d.dir === 'up' ? '▲ ' : '▼ ') + Math.abs(d.pct).toFixed(1) + '%';
}

// rows are newest first.
export function historyEntries(rows) {
  const list = rows || [];
  const last = list.length - 1;
  return list.map((r, i) => {
    const rate = num(r.rate);
    const delta = i < last ? rate - num(list[i + 1].rate) : null;
    return {
      id: r.id,
      rate,
      createdAt: r.created_at,
      updatedBy: r.updated_by,
      delta,
      noChange: delta === 0,
      activated: i === last && list.length < 100,
      newest: i === 0,
    };
  });
}

export function formatHistoryDelta(delta) {
  return (delta < 0 ? '−' : '+') + Math.abs(delta).toFixed(4);
}

export function pickableCurrencies(currencies, query = '') {
  const q = String(query ?? '').trim().toLowerCase();
  return (currencies || []).filter(c => !c.active && c.code !== 'EUR'
    && (!q || [c.code, c.name, c.symbol].some(v => String(v ?? '').toLowerCase().includes(q))));
}

const pad = n => String(n).padStart(2, '0');

export function formatRateDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return formatDayText(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`) || '—';
}

export function formatRateDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${formatRateDate(ts)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// rows newest first; the polyline runs oldest to newest.
export function sparklinePoints(rows, w, h) {
  const vals = (rows || []).map(r => num(r.rate)).filter(isFinite).reverse();
  if (!vals.length) return '';
  const min = Math.min(...vals), max = Math.max(...vals);
  if (vals.length === 1 || min === max) return `0,${h / 2} ${w},${h / 2}`;
  const pad4 = 4, span = h - 2 * pad4;
  return vals.map((v, i) => {
    const x = +(i * w / (vals.length - 1)).toFixed(2);
    const y = +(pad4 + (1 - (v - min) / (max - min)) * span).toFixed(2);
    return `${x},${y}`;
  }).join(' ');
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    rateError, sameRate, confirmReady, sheetOnResize,
    formatRate, inverseRate, parseRateText, isValidRate, editText, rateDelta, formatDelta, historyEntries,
    formatHistoryDelta, pickableCurrencies, formatRateDate, formatRateDateTime, sparklinePoints,
  });
}
