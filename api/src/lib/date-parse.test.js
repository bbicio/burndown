const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFlexibleDate } = require('./date-parse');

test('a > 12, b <= 12: resolves as DD/MM without applying the ambiguous-case default', () => {
  assert.equal(parseFlexibleDate(25, 3, 2026), '2026-03-25');
});

test('b > 12, a <= 12: resolves as MM/DD without applying the ambiguous-case default', () => {
  assert.equal(parseFlexibleDate(3, 25, 2026), '2026-03-25');
});

test('both a and b <= 12: resolves via the MM/DD default (a=month, b=day)', () => {
  assert.equal(parseFlexibleDate(3, 4, 2026), '2026-03-04');
});

test('both a and b > 12: no valid interpretation exists, throws', () => {
  assert.throws(() => parseFlexibleDate(13, 14, 2026), /valid month/i);
});

test('resolvable day/month pair that is calendar-invalid (April has no 31st day) throws', () => {
  // a=31 (>12, so unambiguously the day), b=4 (<=12, the month) -> day 31, month 4 -> invalid
  assert.throws(() => parseFlexibleDate(31, 4, 2026), /valid calendar date/i);
});

test('February 30th (invalid in any year) throws, not silently rolled over to March', () => {
  // a=30 (>12, unambiguously the day), b=2 (the month) -> Feb 30 -> invalid
  assert.throws(() => parseFlexibleDate(30, 2, 2026), /valid calendar date/i);
});

test('leap year: February 29 is valid in 2024', () => {
  assert.equal(parseFlexibleDate(29, 2, 2024), '2024-02-29');
});

test('leap year: February 29 is invalid in 2026 (not a leap year)', () => {
  assert.throws(() => parseFlexibleDate(29, 2, 2026), /valid calendar date/i);
});

test('year 2000 is a leap year (divisible by 400)', () => {
  assert.equal(parseFlexibleDate(29, 2, 2000), '2000-02-29');
});

test('year 1900 is not a leap year (divisible by 100 but not 400)', () => {
  assert.throws(() => parseFlexibleDate(29, 2, 1900), /valid calendar date/i);
});
