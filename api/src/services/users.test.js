const test = require('node:test');
const assert = require('node:assert/strict');
const { anonymizeUser, notifyAdmins } = require('./users');

// A db that records the first words of each statement, and throws on the one that starts with `failOn`.
function fakeDb({ failOn, rows = [{ id: 'u1', status: 'disabled' }] } = {}) {
  const log = [];
  return {
    log,
    query: async text => {
      const head = text.trim().split(/\s+/).slice(0, 3).join(' ');
      log.push(head);
      if (failOn && head.startsWith(failOn)) throw new Error(`${failOn} failed`);
      return { rows };
    },
  };
}

test('anonymizeUser deletes the requests, anonymizes the row, then revokes the two-step state', async () => {
  const db = fakeDb();
  const out = await anonymizeUser(db, 'u1');
  assert.deepEqual(out, { id: 'u1', status: 'disabled' });
  assert.deepEqual(db.log, [
    'DELETE FROM rectification_requests',
    'UPDATE users SET',
    'DELETE FROM login_challenges',
    'DELETE FROM trusted_devices',
  ]);
});

test('anonymizeUser stops at a failed UPDATE: no two-step state is revoked', async () => {
  const db = fakeDb({ failOn: 'UPDATE users' });
  await assert.rejects(anonymizeUser(db, 'u1'), /UPDATE users failed/);
  assert.ok(!db.log.includes('DELETE FROM login_challenges'));
});

test('notifyAdmins creates every notification in one INSERT and returns its rows', async () => {
  const calls = [];
  const rows = [{ id: 'n1', user_id: 'a1', email: 'a@x', first_name: 'A' }];
  const db = { query: async (text, params) => { calls.push({ text, params }); return { rows }; } };
  const out = await notifyAdmins(db, 'r1', 'Title', 'Body', 'u1');
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /INSERT INTO notifications/);
  assert.deepEqual(calls[0].params, ['r1', 'Title', 'Body', 'u1']);
  assert.deepEqual(out, rows);
});
