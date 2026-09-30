const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParams, resolveExcluded } = require('./team-params');

test('parseParams: empty/undefined/null give the defaults', () => {
  for (const input of [undefined, null, {}]) {
    const r = parseParams(input);
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { topN: 3, includeAlternatives: true });
  }
});

test('parseParams: valid full object is normalised (trimmed) and null counts as absent', () => {
  const r = parseParams({
    roles: [' DEV '], excludeResources: ['Mario Rossi'], requireTags: [{ list: 'Market', value: ' Italy ' }],
    preferTags: null, minFreeHoursPerWeek: 10, topN: 5, window: { from: '2026-10-01', to: '2026-12-31' },
    includeAlternatives: false,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.roles, ['DEV']);
  assert.deepEqual(r.value.requireTags, [{ list: 'Market', value: 'Italy' }]);
  assert.equal(r.value.preferTags, undefined);
  assert.equal(r.value.topN, 5);
  assert.equal(r.value.includeAlternatives, false);
});

test('parseParams: per-field errors', () => {
  const r = parseParams({
    bogus: 1, roles: 'DEV', topN: 11, minFreeHoursPerWeek: -1, includeAlternatives: 'yes',
    requireTags: [{ list: 'Market' }], window: { from: '2026-12-31', to: '2026-01-01' },
  });
  assert.equal(r.ok, false);
  for (const f of ['bogus', 'roles', 'topN', 'minFreeHoursPerWeek', 'includeAlternatives', 'requireTags', 'window']) {
    assert.ok(r.errors[f], `error for ${f}`);
  }
});

test('parseParams: non-object params and a window longer than 104 weeks are rejected', () => {
  assert.equal(parseParams([]).ok, false);
  assert.equal(parseParams('x').ok, false);
  assert.ok(parseParams({ window: { from: '2026-01-01', to: '2030-01-01' } }).errors.window);
  assert.ok(parseParams({ topN: 2.5 }).errors.topN);
});

const R = [
  { id: 'r1', first_name: 'Mario', last_name: 'Rossi' },
  { id: 'r2', first_name: 'Anna', last_name: 'Verdi' },
  { id: 'r3', first_name: 'Anna', last_name: 'Verdi' },
];

test('resolveExcluded: exact name (any order/case/accents) resolves; unknown and ambiguous are errors', () => {
  const r = resolveExcluded(['rossi MARIO', 'Nobody Here', 'Anna Verdi'], R);
  assert.deepEqual([...r.ids], ['r1']);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Nobody Here/);
  assert.match(r.errors[1], /Anna Verdi.*more than one/);
});

test('resolveExcluded: no names → nothing excluded, no errors', () => {
  assert.deepEqual(resolveExcluded(undefined, R), { ids: new Set(), errors: [] });
});
