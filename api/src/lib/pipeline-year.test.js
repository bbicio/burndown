const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePipelineYear, pipelineYearAvailabilityError } = require('./pipeline-year');

const BAD = { error: 'pipelineYear must be an integer between 2000 and 2100' };

test('parsePipelineYear: absent means no year', () => {
  assert.deepEqual(parsePipelineYear(undefined), { year: null });
  assert.deepEqual(parsePipelineYear(null), { year: null });
});

test('parsePipelineYear: an integer, as a number or a digit string', () => {
  assert.deepEqual(parsePipelineYear(2027), { year: 2027 });
  assert.deepEqual(parsePipelineYear('2027'), { year: 2027 });
  assert.deepEqual(parsePipelineYear(2000), { year: 2000 });
  assert.deepEqual(parsePipelineYear(2100), { year: 2100 });
});

test('parsePipelineYear: anything else is refused', () => {
  for (const v of ['2027.5', 2027.5, 'abc', 1999, 2101, true, NaN, '', ' 2027', '+2027', {}, []]) {
    assert.deepEqual(parsePipelineYear(v), BAD, `value ${JSON.stringify(v)}`);
  }
});

test('pipelineYearAvailabilityError: missing, inactive, active', () => {
  assert.equal(pipelineYearAvailabilityError(undefined), 'Pipeline year not found');
  assert.equal(pipelineYearAvailabilityError(null), 'Pipeline year not found');
  assert.equal(pipelineYearAvailabilityError({ active: false }), 'Pipeline year is inactive');
  assert.equal(pipelineYearAvailabilityError({ active: true }), null);
});
