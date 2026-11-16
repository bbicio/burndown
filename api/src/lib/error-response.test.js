const test = require('node:test');
const assert = require('node:assert/strict');
const { MulterError } = require('multer');
const { errorResponse } = require('./error-response');

const GENERIC = { status: 500, body: { error: 'Internal server error' } };
const withStatus = (message, extra) => Object.assign(new Error(message), extra);

test('keeps a 4xx message', () => {
  assert.deepEqual(errorResponse(withStatus('Bad thing', { status: 400 })), { status: 400, body: { error: 'Bad thing' } });
});

test('keeps a string code on a 4xx, drops a non-string one', () => {
  assert.equal(errorResponse(withStatus('Conflict', { status: 409, code: 'X_RULE' })).body.code, 'X_RULE');
  assert.deepEqual(errorResponse(withStatus('Conflict', { status: 409, code: 23505 })).body, { error: 'Conflict' });
});

test('4xx without message', () => {
  assert.deepEqual(errorResponse(withStatus('', { status: 404 })), { status: 404, body: { error: 'Request error' } });
});

test('multer error', () => {
  const r = errorResponse(new MulterError('LIMIT_FILE_SIZE'));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'File too large');
  assert.equal(r.body.code, 'LIMIT_FILE_SIZE');
});

test('hides a 500 message', () => {
  const r = errorResponse(new Error('invalid input syntax for type uuid: "x"'));
  assert.deepEqual(r, GENERIC);
  assert.doesNotMatch(JSON.stringify(r.body), /uuid/);
});

test('hides an explicit 5xx', () => {
  assert.deepEqual(errorResponse({ status: 502, message: 'upstream' }), GENERIC);
});

test('non-integer or out-of-range status', () => {
  for (const status of ['400', NaN, 399, 600]) assert.deepEqual(errorResponse(withStatus('x', { status })), GENERIC);
});

test('non-object error', () => {
  for (const err of ['x', undefined, null]) assert.deepEqual(errorResponse(err), GENERIC);
});
