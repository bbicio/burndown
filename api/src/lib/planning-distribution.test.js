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

// Phase-1 behaviour: percentages are re-normalised over the months of the VISIBLE future weeks.
test('phasedSeries (phase 1): 40/30/30 over three visible months, and 57/43 when only two are visible', () => {
  const today = isoDate('2026-09-15');
  const all = getCalendarWeeks(isoDate('2026-10-01'), isoDate('2026-12-31'), today);
  const pDist = { '202610': 40, '202611': 30, '202612': 30 };
  const monthOf = w => w.weekStart.getUTCMonth();               // 9 = Oct, 10 = Nov, 11 = Dec
  const oct = all.filter(w => monthOf(w) === 9), nov = all.filter(w => monthOf(w) === 10), dec = all.filter(w => monthOf(w) === 11);
  const total = (series, weeks) => series.filter(e => weeks.some(w => w.key === e.key)).reduce((s, e) => s + e.hours, 0);

  const full = phasedSeries({ residualH: 100, pDist, futureWeeks: all, fallbackWeekCount: () => 13 });
  assert.ok(Math.abs(total(full, oct) - 40) < 1e-9, `october should carry 40, got ${total(full, oct)}`);
  assert.ok(Math.abs(total(full, nov) - 30) < 1e-9);
  assert.ok(Math.abs(total(full, dec) - 30) < 1e-9);

  // Only October and November visible: the 100 h are re-normalised over 70% -> 57.14 / 42.86 (phase-1 anomaly).
  const partial = phasedSeries({ residualH: 100, pDist, futureWeeks: [...oct, ...nov], fallbackWeekCount: () => 13 });
  assert.ok(Math.abs(total(partial, oct) - 100 * 40 / 70) < 1e-9, `october share should be 57.14, got ${total(partial, oct)}`);
  assert.ok(Math.abs(total(partial, nov) - 100 * 30 / 70) < 1e-9);
});

test('phasedSeries: no percentage in the visible months falls back to an even split', () => {
  const today = isoDate('2026-09-15');
  const wk = getCalendarWeeks(isoDate('2026-09-15'), isoDate('2026-09-30'), today).filter(w => !w.isPast);
  const out = phasedSeries({ residualH: 30, pDist: { '202612': 100 }, futureWeeks: wk, fallbackWeekCount: () => 3 });
  assert.deepEqual(out.map(e => e.hours), wk.map(() => 10));
});
