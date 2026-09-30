const test = require('node:test');
const assert = require('node:assert/strict');
const {
  matchesTaskRole, computeResidual, distributeFutureResidual,
  redistributeExcludingInactive, hasValidPhasing, phasedSeries,
} = require('./planning-distribution');
const { isoDate, getCalendarWeeks } = require('./planning-calendar');

test('matchesTaskRole: case-insensitive; blank task name matches on role alone; missing fields do not throw', () => {
  assert.equal(matchesTaskRole({ role: 'developer', task: 'build api' }, 'Build API', 'Developer'), true);
  assert.equal(matchesTaskRole({ role: 'Developer', task: 'x' }, undefined, 'Developer'), true);
  assert.equal(matchesTaskRole({ role: 'Developer', task: undefined }, 'Build API', 'Developer'), false);
  assert.equal(matchesTaskRole({ role: undefined, task: 'Build API' }, 'Build API', 'Developer'), false);
  assert.equal(matchesTaskRole({ role: '', task: 'a' }, 'a', undefined), true); // undefined role == ''
});

test('computeResidual floors at zero', () => {
  assert.equal(computeResidual(100, 40), 60);
  assert.equal(computeResidual(20, 30), 0);
});

test('distributeFutureResidual: pulse from the canonical week count, first week of the month carries the hours', () => {
  const weeksByMonth = [{ monthKey: 'a', weekKeys: ['w1', 'w2', 'w3'] }];
  assert.deepEqual(distributeFutureResidual(5, 10, weeksByMonth, true), [{ key: 'w1', hours: 1.5, isPulse: true }]);
  assert.deepEqual(distributeFutureResidual(20, 10, [{ monthKey: 'a', weekKeys: ['w1', 'w2'] }], true).map(e => e.isPulse), [false, false]);
  assert.deepEqual(distributeFutureResidual(1, 10, [{ monthKey: 'a', weekKeys: ['w1', 'w2'] }], false),
    [{ key: 'w1', hours: 0.1, isPulse: false }, { key: 'w2', hours: 0.1, isPulse: false }]);
});

test('distributeFutureResidual: no future weeks at all falls back to the visible weeks; nothing to spread gives 0', () => {
  assert.deepEqual(distributeFutureResidual(6, 0, [{ monthKey: 'a', weekKeys: ['w1', 'w2', 'w3'] }], false).map(e => e.hours), [2, 2, 2]);
  assert.deepEqual(distributeFutureResidual(6, 0, [], false), []);
});

test('redistributeExcludingInactive: inactive share goes to the active owners in their ratio', () => {
  const r = redistributeExcludingInactive({ A: 6, B: 3, C: 1 }, { C: 'inactive' });
  assert.deepEqual(r, { props: { A: 6 / 9, B: 3 / 9 }, allInactive: false });
});

test('redistributeExcludingInactive: everyone inactive, no owners, or ~0 hours -> allInactive', () => {
  assert.deepEqual(redistributeExcludingInactive({ A: 5 }, { A: 'inactive' }), { props: {}, allInactive: true });
  assert.deepEqual(redistributeExcludingInactive({}, {}), { props: {}, allInactive: true });
  assert.equal(redistributeExcludingInactive({ A: 0.005 }, {}).allInactive, true);
  assert.equal(redistributeExcludingInactive({ A: 5 }, {}).allInactive, false); // unknown name = active
});

test('hasValidPhasing: sum must be 100 within 0.5', () => {
  assert.equal(hasValidPhasing({ '202610': 40, '202611': 60 }), true);
  assert.equal(hasValidPhasing({ '202610': 40, '202611': 59.6 }), true);
  assert.equal(hasValidPhasing({ '202610': 40, '202611': 50 }), false);
  assert.equal(hasValidPhasing(null), false);
  assert.equal(hasValidPhasing({ '202610': 'x' }), false);
});

const { taskFutureWeeks } = require('./planning-distribution');

test('phasedSeries (phase 2): hours per cell do not depend on the visible window', () => {
  const today = isoDate('2026-09-15');
  const pDist = { '202610': 40, '202611': 30, '202612': 30 };
  const tStart = isoDate('2026-09-01'), tEnd = isoDate('2026-12-31');
  const all = taskFutureWeeks(tStart, tEnd, pDist, today);
  const window = (from, to) => all.filter(w => w.weekStart >= isoDate(from) && w.weekStart <= isoDate(to));
  const full = phasedSeries({ residualH: 100, pDist, visibleFutureWeeks: window('2026-09-14', '2026-12-28'), allFutureWeeks: all, fallbackWeekCount: () => all.length });
  const narrow = phasedSeries({ residualH: 100, pDist, visibleFutureWeeks: window('2026-10-01', '2026-11-30'), allFutureWeeks: all, fallbackWeekCount: () => all.length });
  const byKey = s => Object.fromEntries(s.map(e => [e.key, e.hours]));
  for (const [k, h] of Object.entries(byKey(narrow))) assert.ok(Math.abs(h - byKey(full)[k]) < 1e-9, `${k}: narrow ${h} vs full ${byKey(full)[k]}`);
  // October carries 40 of the 100 hours in both.
  const octH = s => s.filter(e => e.key.startsWith('2026-09-28') || e.key.startsWith('2026-10')).reduce((t, e) => t + e.hours, 0);
  assert.ok(octH(full) > 0);
});

test('taskFutureWeeks: only future weeks overlapping the task, capped at the last distribution month; empty distribution -> []', () => {
  const today = isoDate('2026-09-15');
  const weeks = taskFutureWeeks(isoDate('2026-09-01'), isoDate('9999-12-31'), { '202610': 100 }, today);
  assert.ok(weeks.length > 0 && weeks.length < 10, `undated task must be capped by the distribution, got ${weeks.length}`);
  assert.equal(weeks.every(w => !w.isPast), true);
  assert.deepEqual(taskFutureWeeks(isoDate('2026-09-01'), isoDate('2026-12-31'), {}, today), []);
});

test('phasedSeries (phase 2): no percentage in any future month falls back to an even split of the visible weeks', () => {
  const today = isoDate('2026-09-15');
  const wk = getCalendarWeeks(isoDate('2026-09-15'), isoDate('2026-09-30'), today).filter(w => !w.isPast);
  const out = phasedSeries({ residualH: 30, pDist: { '202612': 100 }, visibleFutureWeeks: wk, allFutureWeeks: [], fallbackWeekCount: () => 3 });
  assert.deepEqual(out.map(e => e.hours), wk.map(() => 10));
});

test('taskFutureWeeks: a pathological far-future distribution key on an undated task stays bounded and fast', () => {
  const t0 = Date.now();
  const weeks = taskFutureWeeks(new Date(0), new Date(Date.UTC(9999, 11, 31)), { '999912': 100 }, isoDate('2026-09-15'));
  assert.ok(Date.now() - t0 < 1000, 'must not enumerate hundreds of thousands of weeks');
  assert.ok(weeks.length > 0 && weeks.length < 1200, `got ${weeks.length} weeks`);
});
