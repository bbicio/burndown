const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveOwnerStatuses } = require('./resources');

const resources = [
  { id: 'r1', first_name: 'Jane', last_name: 'Doe', status: 'active' },
  { id: 'r2', first_name: 'John', last_name: 'Smith', status: 'inactive' },
  { id: 'r3', first_name: 'Jane', last_name: 'Doe', status: 'inactive' }, // ambiguous namesake, see below
];
const aliases = [];

test('resolveOwnerStatuses: exact match to an active resource resolves active', () => {
  const result = resolveOwnerStatuses(['Jane Doe'], [resources[0]], aliases);
  assert.equal(result['Jane Doe'], 'active');
});

test('resolveOwnerStatuses: exact unambiguous match to an inactive resource resolves inactive', () => {
  const result = resolveOwnerStatuses(['John Smith'], [resources[1]], aliases);
  assert.equal(result['John Smith'], 'inactive');
});

test('resolveOwnerStatuses: no match resolves active (fail-open, per agreed rule)', () => {
  const result = resolveOwnerStatuses(['Nobody Here'], resources, aliases);
  assert.equal(result['Nobody Here'], 'active');
});

test('resolveOwnerStatuses: ambiguous match (active + inactive namesakes) resolves active, not inactive', () => {
  // matchOwner prefers active candidates first; with one active + one inactive sharing the
  // normalized name "jane doe", the active one wins unambiguously — not actually ambiguous.
  // A genuinely ambiguous case is two *active* namesakes:
  const twoActive = [
    { id: 'a1', first_name: 'Jane', last_name: 'Doe', status: 'active' },
    { id: 'a2', first_name: 'Jane', last_name: 'Doe', status: 'active' },
  ];
  const result = resolveOwnerStatuses(['Jane Doe'], twoActive, aliases);
  assert.equal(result['Jane Doe'], 'active');
});

test('resolveOwnerStatuses: an alias explicitly marked ignore resolves active, not inactive', () => {
  const ignoredAlias = [{ alias_normalized: 'ghost name', resource_id: null }];
  const result = resolveOwnerStatuses(['Ghost Name'], resources, ignoredAlias);
  assert.equal(result['Ghost Name'], 'active');
});

test('resolveOwnerStatuses: an alias pointing at an inactive resource resolves inactive', () => {
  const aliasToInactive = [{ alias_normalized: 'jsmith', resource_id: 'r2' }];
  const result = resolveOwnerStatuses(['jsmith'], [resources[1]], aliasToInactive);
  assert.equal(result.jsmith, 'inactive');
});

test('resolveOwnerStatuses: only active-then-inactive fallback matters when the active candidate exists — active resource with the same name as an inactive one resolves active', () => {
  const activeAndInactiveSameName = [
    { id: 'x1', first_name: 'Sam', last_name: 'Lee', status: 'active' },
    { id: 'x2', first_name: 'Sam', last_name: 'Lee', status: 'inactive' },
  ];
  const result = resolveOwnerStatuses(['Sam Lee'], activeAndInactiveSameName, aliases);
  assert.equal(result['Sam Lee'], 'active');
});

test('resolveOwnerStatuses: handles an empty names array', () => {
  assert.deepEqual(resolveOwnerStatuses([], resources, aliases), {});
});
