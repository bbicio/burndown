'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

const fmt = n => n.toFixed(6).replace(/\.?0+$/, '');

function decimalRangeError(n, { min, max, label }) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    return `${label} must be between ${fmt(min)} and ${fmt(max)}`;
  }
  return null;
}

const SPECIAL_POT_LABELS = Object.freeze(['Unassigned / To be Identified', 'New Biz']);

function specialLabelError(v) {
  if (typeof v === 'string' && SPECIAL_POT_LABELS.includes(v)) return null;
  return `specialLabel must be one of: ${SPECIAL_POT_LABELS.join(', ')}`;
}

module.exports = { isUuid, decimalRangeError, SPECIAL_POT_LABELS, specialLabelError };
