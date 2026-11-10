// Guard: every file under api/src that writes a credential or the state of an account (the password
// hash, the email, the status) in an `UPDATE users` must also call revokeTwoStepState(), so a
// challenge or a trusted device never outlives the credential it was granted under.
//
// Limit: the granularity is the file, not the statement. A file that calls revokeTwoStepState() for
// one of its UPDATEs passes even if another UPDATE in it forgets to — review each new UPDATE users by
// hand. The statement text is read up to the next WHERE, so a dynamic `SET ${fields}` (routes/users.js
// PATCH) is only seen through the other UPDATEs of its file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..');
const CREDENTIAL_COLUMNS = /password_hash|email|status/i;

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'migrations' || entry.name === 'node_modules') continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

// A file "writes credentials" when some `UPDATE users` reaches a credential column before its WHERE.
function writesCredentials(text) {
  const re = /UPDATE\s+users\b([\s\S]*?)(?:\bWHERE\b|$)/gi;
  let m;
  while ((m = re.exec(text))) {
    if (CREDENTIAL_COLUMNS.test(m[1])) return true;
  }
  return false;
}

const files = sourceFiles(SRC).map(f => ({ rel: path.relative(SRC, f).split(path.sep).join('/'), text: fs.readFileSync(f, 'utf8') }));
const writers = files.filter(f => writesCredentials(f.text));

test('the guard finds the known credential writers (a broken regex must not pass empty)', () => {
  const names = writers.map(f => f.rel);
  for (const known of ['routes/auth.js', 'routes/users.js', 'create-admin.js']) {
    assert.ok(names.includes(known), `${known} not detected as a credential writer (found: ${names.join(', ')})`);
  }
});

test('every file that writes credentials revokes the two-step state', () => {
  const missing = writers.filter(f => !f.text.includes('revokeTwoStepState(')).map(f => f.rel);
  assert.deepEqual(missing, [], `these files write users.password_hash/email/status without calling revokeTwoStepState(): ${missing.join(', ')}`);
});
