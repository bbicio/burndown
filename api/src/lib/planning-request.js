'use strict';
const { isoDate } = require('./planning-calendar');

const VIEWS = ['role', 'project', 'owner'];
const MAX_IDS = 2000, MAX_TEAMS = 500, MAX_WINDOW_DAYS = 20 * 366;

function stringList(v, max, maxLen) {
  if (!Array.isArray(v) || v.length > max) return null;
  if (!v.every(x => typeof x === 'string' && x.length <= maxLen)) return null;
  return v;
}

// Pure validation of POST /api/planning/model bodies (no Express dependency, unit-testable).
function parsePlanningRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: { body: 'must be an object' } };
  const errors = {};

  if (!VIEWS.includes(body.view)) errors.view = `must be one of ${VIEWS.join(', ')}`;

  const ids = stringList(body.projectIds, MAX_IDS, 64);
  if (!ids) errors.projectIds = `must be an array of at most ${MAX_IDS} strings`;

  const teamsIn = body.teams === undefined ? [] : body.teams;
  const teams = stringList(teamsIn, MAX_TEAMS, 200);
  if (!teams) errors.teams = `must be an array of at most ${MAX_TEAMS} strings`;

  const from = isoDate(body.from), to = isoDate(body.to), asOf = isoDate(body.asOf);
  if (!from) errors.from = 'must be a YYYY-MM-DD date';
  if (!to) errors.to = 'must be a YYYY-MM-DD date';
  if (!asOf) errors.asOf = 'must be a YYYY-MM-DD date';
  if (from && to) {
    if (from > to) errors.to = 'must not be before from';
    else if ((to - from) / 86400000 > MAX_WINDOW_DAYS) errors.to = 'window is too long (max 20 years)';
  }
  if (typeof body.pulse !== 'boolean') errors.pulse = 'must be a boolean';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { view: body.view, projectIds: [...new Set(ids)], teams, from, to, asOf, pulse: body.pulse } };
}

module.exports = { parsePlanningRequest };
