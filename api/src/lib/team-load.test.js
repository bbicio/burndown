const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./team-load');
const { isoDate, getCalendarWeeks } = require('./planning-calendar');
const { buildMatchContext } = require('./match-resource');

const d = s => isoDate(s);
const ymd = x => x.toISOString().slice(0, 10);

test('roleWindow: from = max(asOf, earliest start), to = latest end', () => {
  const w = L.roleWindow([{ startDate: '20990105', endDate: '20990228' }, { startDate: '20990201', endDate: '20990329' }],
    { startDate: '209901', endDate: '209903' }, d('2099-01-10'));
  assert.equal(ymd(w.from), '2099-01-10');
  assert.equal(ymd(w.to), '2099-03-29');
});

test('roleWindow: a future project starts at its first task', () => {
  const w = L.roleWindow([{ startDate: '20990301', endDate: '20990329' }], {}, d('2099-01-10'));
  assert.equal(ymd(w.from), '2099-03-01');
});

test('roleWindow: tasks without dates fall back to the project dates (YYYYMM: first/last day)', () => {
  const w = L.roleWindow([{ startDate: '', endDate: '' }], { startDate: '209902', endDate: '209903' }, d('2099-01-10'));
  assert.equal(ymd(w.from), '2099-02-01');
  assert.equal(ymd(w.to), '2099-03-31');
});

test('roleWindow: no dates anywhere, or already over → null', () => {
  assert.equal(L.roleWindow([{}], {}, d('2099-01-10')), null);
  assert.equal(L.roleWindow([{ startDate: '20980101', endDate: '20980201' }], {}, d('2099-01-10')), null);
});

test('capWindow limits the window to 104 weeks', () => {
  const w = L.capWindow({ from: d('2099-01-01'), to: d('2199-01-01') });
  assert.ok((w.to - w.from) / 86400000 <= 104 * 7 + 6);
  assert.equal(ymd(L.capWindow({ from: d('2099-01-01'), to: d('2099-02-01') }).to), '2099-02-01');
});

test('loadWindow: starts 4 Mondays before the current week, ends at the union end (or asOf)', () => {
  const asOf = d('2099-01-10');                        // Saturday; its Monday is 2099-01-05
  assert.equal(ymd(L.loadWindow({ from: d('2099-01-10'), to: d('2099-03-29') }, asOf).from), '2098-12-08');
  assert.equal(ymd(L.loadWindow({ from: d('2099-01-10'), to: d('2099-03-29') }, asOf).to), '2099-03-29');
  assert.equal(ymd(L.loadWindow(null, asOf).to), '2099-01-10');
});

test('loadByResource: owner names map to resources (aliases, sums of several names); unmatched and placeholder are skipped', () => {
  const ctx = buildMatchContext(
    [{ id: 'r1', first_name: 'Ann', last_name: 'Lee', status: 'active' }],
    [{ alias_normalized: 'a lee', resource_id: 'r1' }]);          // normalizeName('A. Lee') === 'a lee'
  const ownerMap = {
    'Ann Lee': { weekTotals: { '2099-01-12': { hours: 10, isPast: false } } },                 // exact name
    'A. Lee':  { weekTotals: { '2099-01-12': { hours: 5, isPast: false }, '2099-01-19': { hours: 7, isPast: false } } },   // alias
    'Nobody':  { weekTotals: { '2099-01-12': { hours: 99, isPast: false } } },
    '—':  { weekTotals: { '2099-01-12': { hours: 50, isPast: false } } },                      // placeholder
  };
  const out = L.loadByResource(ownerMap, ctx);
  assert.deepEqual([...out.keys()], ['r1']);
  assert.equal(out.get('r1').weeks['2099-01-12'].hours, 15);
  assert.equal(out.get('r1').weeks['2099-01-19'].hours, 7);
});

test('currentLoad: mean of the four completed weeks before the current one; missing weeks count as 0', () => {
  const load = { weeks: { '2098-12-29': { hours: 40, isPast: true }, '2099-01-04': { hours: 0, isPast: true } } };
  // asOf Saturday 2099-01-10: current week starts 2099-01-05; the four before start 12-29, 12-22, 12-15, 12-08
  // (the key for the week before the current one is 2099-01-05 minus 7 days = 2098-12-29)
  assert.equal(L.currentLoad(load, d('2099-01-10')), 10);
  assert.equal(L.currentLoad(undefined, d('2099-01-10')), 0);
});

test('availabilityForWindow: mean and min of max(0, 32 - load) over future weeks only', () => {
  const asOf = d('2099-01-10');
  const weeks = getCalendarWeeks(d('2099-01-10'), d('2099-01-31'), asOf);   // Mondays 01-05 (current), 01-12, 01-19, 01-26
  const load = { weeks: { '2099-01-12': { hours: 20, isPast: false }, '2099-01-19': { hours: 50, isPast: false } } };
  const a = L.availabilityForWindow(load, weeks);
  assert.equal(a.weeks, 4);
  assert.equal(a.freeMin, 0);
  assert.equal(a.freeAvg, (32 + 12 + 0 + 32) / 4);
  assert.equal(L.availabilityForWindow(undefined, weeks).freeAvg, 32);
});

test('availabilityForWindow: no future week (past window) → null, never NaN', () => {
  const asOf = d('2099-01-10');
  assert.equal(L.availabilityForWindow({ weeks: {} }, getCalendarWeeks(d('2098-01-01'), d('2098-02-01'), asOf)), null);
  assert.equal(L.availabilityForWindow({ weeks: {} }, []), null);
});

test('loadWindow: a union ending before asOf still reaches asOf (current load stays computable)', () => {
  const asOf = d('2099-01-10');
  assert.equal(ymd(L.loadWindow({ from: null, to: d('2099-01-02') }, asOf).to), '2099-01-10');
});

test('unionWindow: latest end over every role window, null when none has a window', () => {
  const roles = [{ code: 'A', window: { from: d('2099-01-10'), to: d('2099-02-01') } }, { code: 'B', window: { from: d('2099-01-10'), to: d('2099-04-01') } }, { code: 'C', window: null }];
  assert.equal(ymd(L.unionWindow(roles).to), '2099-04-01');
  assert.equal(L.unionWindow([{ window: null }]), null);
  assert.equal(L.unionWindow([]), null);
});
