const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.APP_URL;
const { appLink } = require('./email');

test('appLink with APP_URL unset uses http://localhost', () => {
  assert.equal(appLink('/pipeline.html'), 'http://localhost/pipeline.html');
});
