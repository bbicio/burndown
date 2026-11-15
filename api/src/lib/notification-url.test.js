const test = require('node:test');
const assert = require('node:assert/strict');
const {
  URL_RULE, URL_RULE_MESSAGE, notificationUrl, notificationUrlError, notificationLink
} = require('./notification-url');

const ORIGIN = 'http://localhost';

const VALID = [
  '/pipeline.html',
  '/costgrid.html?cgId=1&verId=2#x',
  'http://localhost/pipeline.html',
  'http://localhost:80/x',
  'http://evil.com@localhost/x',
  '/%5Cevil',
  '/%2F%2Fevil'
];

const INVALID = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,x',
  '//example.com',
  '/\\evil',
  '\\\\host\\x',
  'https://example.com/x',
  'http://localhost.evil.com/x',
  'http://localhost@evil.com/x',
  'https://localhost/x',
  '/a\nb',
  '/a\u0000b',
  '/a b',
  '   ',
  'pipeline.html',
  '/' + 'a'.repeat(2048),
  123,
  {},
  ['/a']
];

test('URL_RULE and its message', () => {
  assert.equal(URL_RULE, 'URL_RULE');
  assert.equal(URL_RULE_MESSAGE, 'url must be an app path or an absolute URL on the app origin');
});

for (const v of VALID) {
  test(`notificationUrl accepts ${JSON.stringify(v)}`, () => {
    assert.equal(notificationUrl(v, ORIGIN), v);
  });
}

for (const v of INVALID) {
  test(`notificationUrl rejects ${JSON.stringify(v)}`, () => {
    assert.equal(notificationUrl(v, ORIGIN), null);
  });
}

test('an absent url is not an error', () => {
  for (const v of [null, undefined, '']) {
    assert.equal(notificationUrl(v, ORIGIN), null);
    assert.equal(notificationUrlError(v, 'http://localhost'), null);
  }
});

test('notificationUrlError returns the message for an invalid url, null for a valid one', () => {
  assert.equal(notificationUrlError('javascript:x', 'http://localhost'), URL_RULE_MESSAGE);
  assert.equal(notificationUrlError(123, 'http://localhost'), URL_RULE_MESSAGE);
  assert.equal(notificationUrlError('   ', 'http://localhost'), URL_RULE_MESSAGE);
  assert.equal(notificationUrlError('/pipeline.html', 'http://localhost'), null);
  assert.equal(notificationUrlError('http://localhost/pipeline.html', 'http://localhost'), null);
});

test('an absent APP_URL defaults to http://localhost', () => {
  assert.equal(notificationUrlError('http://localhost/x', undefined), null);
  assert.equal(notificationUrlError('https://example.com/x', undefined), URL_RULE_MESSAGE);
});

test('an unparsable APP_URL makes every absolute url invalid and keeps paths valid', () => {
  assert.equal(notificationUrlError('http://localhost/x', 'not a url'), URL_RULE_MESSAGE);
  assert.equal(notificationUrlError('/x', 'not a url'), null);
});

test('the app origin is the one of APP_URL, not a string prefix', () => {
  assert.equal(notificationUrlError('https://app.example.com/x', 'https://app.example.com/base'), null);
  assert.equal(notificationUrlError('https://app.example.com.evil.com/x', 'https://app.example.com'), URL_RULE_MESSAGE);
});

test('notificationLink gives the absolute link for the email, or null', () => {
  assert.equal(notificationLink('/pipeline.html', 'http://localhost'), 'http://localhost/pipeline.html');
  assert.equal(notificationLink('http://localhost/a', 'http://localhost'), 'http://localhost/a');
  assert.equal(notificationLink('javascript:x', 'http://localhost'), null);
  assert.equal(notificationLink(null, 'http://localhost'), null);
});
