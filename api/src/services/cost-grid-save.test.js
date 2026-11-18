const test = require('node:test');
const assert = require('node:assert/strict');
const { applyHeader } = require('./cost-grid-save');

// A transaction client answering applyHeader's read of the stored header and recording every statement.
function fakeClient(stored) {
  const log = [];
  return {
    log,
    query: async (text, params) => {
      log.push({ text, params });
      if (/SELECT pipeline, currency, start_date, end_date FROM cost_grid_versions/.test(text)) return { rows: [stored] };
      return { rows: [] };
    },
  };
}
const published = { pipeline: 'SIP', currency: 'EUR', start_date: '202601', end_date: '202612' };
const draft = { ...published, pipeline: 'Draft' };
const wrote = c => c.log.some(l => /^UPDATE cost_grid_versions/.test(l.text));

test('a published version moves between the five stages', async () => {
  for (const stage of ['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled']) {
    const c = fakeClient(published);
    await applyHeader(c, 'v1', { pipeline: stage }, { role: 'admin' });
    assert.ok(wrote(c), stage);
  }
});

test('an unknown stage is refused and nothing is written', async () => {
  for (const stage of ['Won', '', null, 3]) {
    const c = fakeClient(published);
    await assert.rejects(applyHeader(c, 'v1', { pipeline: stage }, { role: 'admin' }),
      err => err.isRule && err.status === 400 && /stage/i.test(err.message));
    assert.ok(!wrote(c));
  }
});

test('a published version never goes back to Draft', async () => {
  const c = fakeClient(published);
  await assert.rejects(applyHeader(c, 'v1', { pipeline: 'Draft' }, { role: 'admin' }), err => err.isRule && err.status === 400);
  assert.ok(!wrote(c));
});

test('a Draft gets its stage only from Publish to SIP', async () => {
  const c = fakeClient(draft);
  await assert.rejects(applyHeader(c, 'v1', { pipeline: 'SIP' }, { role: 'admin' }),
    err => err.isRule && err.status === 400 && err.message === 'A Draft gets its stage from Publish to SIP.');
  assert.ok(!wrote(c));
});
