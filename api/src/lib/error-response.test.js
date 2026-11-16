const test = require('node:test');
const assert = require('node:assert/strict');
const { MulterError } = require('multer');
const { errorResponse, errorHandler, isClientStatus, uploadError, storedErrorText } = require('./error-response');

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

test('statusCode is read when status is absent', () => {
  assert.deepEqual(errorResponse(withStatus('Too big', { statusCode: 413 })), { status: 413, body: { error: 'Too big' } });
  assert.deepEqual(errorResponse(withStatus('x', { statusCode: 503 })), GENERIC);
});

test('a malformed JSON body answers 400 without echoing the body', () => {
  const err = withStatus('Unexpected token b in JSON at position 1: "{bad"', { status: 400, type: 'entity.parse.failed' });
  assert.deepEqual(errorResponse(err), { status: 400, body: { error: 'Malformed JSON body' } });
});

test('isClientStatus accepts only integer 4xx', () => {
  for (const s of [400, 404, 499]) assert.equal(isClientStatus(s), true);
  for (const s of [399, 500, 502, '400', NaN, undefined, null]) assert.equal(isClientStatus(s), false);
});

test('uploadError makes a status-less parser error a 400 and keeps a MulterError or a status', () => {
  assert.equal(uploadError(new Error('Unexpected end of form')).status, 400);
  assert.deepEqual(errorResponse(uploadError(new Error('Unexpected end of form'))), { status: 400, body: { error: 'Unexpected end of form' } });
  assert.equal(uploadError(new MulterError('LIMIT_FILE_SIZE')).status, undefined);
  assert.equal(uploadError(withStatus('x', { status: 413 })).status, 413);
});

test('storedErrorText hides a PostgreSQL error and keeps any other message', () => {
  const pgErr = Object.assign(new Error('relation "x" does not exist'), { severity: 'ERROR', code: '42P01' });
  assert.equal(storedErrorText(pgErr), 'Database error');
  assert.equal(storedErrorText(new Error('LLM request timed out')), 'LLM request timed out');
  assert.equal(storedErrorText('plain'), 'plain');
  assert.equal(storedErrorText(undefined), 'Unknown error');
});

function fakeRes(headersSent = false) {
  return { headersSent, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } };
}

test('errorHandler answers with errorResponse and logs the error', (t) => {
  const logged = [];
  t.mock.method(console, 'error', (e) => logged.push(e));
  const res = fakeRes();
  const err = new Error('secret detail');
  errorHandler(err, {}, res, () => assert.fail('next must not be called'));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(logged[0], err);
});

test('errorHandler hands the error to next once headers are sent', (t) => {
  t.mock.method(console, 'error', () => {});
  const res = fakeRes(true);
  const err = new Error('late');
  let passed;
  errorHandler(err, {}, res, (e) => { passed = e; });
  assert.equal(passed, err);
  assert.equal(res.statusCode, undefined);
});
