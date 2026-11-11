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

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Shapes a bulk-replace handler iterates, checked before any write; null when well-formed.
// body: { phases?: [{ tasks?: [{ roles?: [obj], hours?: obj }] }], roles?: [obj] }
function structureBodyError(body) {
  if (!isObj(body)) return 'Body must be an object';
  const { phases, roles } = body;
  if (roles !== undefined) {
    if (!Array.isArray(roles)) return 'roles must be an array';
    if (!roles.every(isObj)) return 'Every entry of roles must be an object';
  }
  if (phases === undefined) return null;
  if (!Array.isArray(phases)) return 'phases must be an array';
  for (const ph of phases) {
    if (!isObj(ph)) return 'Every phase must be an object';
    if (ph.tasks === undefined || ph.tasks === null) continue;
    if (!Array.isArray(ph.tasks)) return 'tasks of a phase must be an array';
    for (const tk of ph.tasks) {
      if (!isObj(tk)) return 'Every task must be an object';
      if (tk.roles !== undefined && tk.roles !== null) {
        if (!Array.isArray(tk.roles)) return 'roles of a task must be an array';
        if (!tk.roles.every(isObj)) return 'Every role of a task must be an object';
      }
      if (tk.hours !== undefined && tk.hours !== null && !isObj(tk.hours)) return 'hours of a task must be an object';
    }
  }
  return null;
}

// Project task list: every task an object, resources (when present) an array of objects.
function taskListError(tasks) {
  if (!Array.isArray(tasks)) return 'Body must be an array of tasks or { tasks: [...], period }';
  for (const t of tasks) {
    if (!isObj(t)) return 'Every task must be an object';
    if (t.resources !== undefined && t.resources !== null) {
      if (!Array.isArray(t.resources)) return `Task "${t.name || ''}" has resources that are not an array.`;
      if (!t.resources.every(isObj)) return `Task "${t.name || ''}" has an empty resource entry.`;
    }
  }
  return null;
}

module.exports = { isUuid, decimalRangeError, SPECIAL_POT_LABELS, specialLabelError, structureBodyError, taskListError };
