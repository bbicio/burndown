const test = require('node:test');
const assert = require('node:assert/strict');
const { programAccessError } = require('./project-save');

// A transaction client answering the reads of programAccessError: the program's projects and the caller's access.
function fakeClient({ projects = [], access = false }) {
  return {
    query: async text => {
      if (/SELECT id FROM projects WHERE program_id/.test(text)) return { rows: projects.map(id => ({ id })) };
      if (/permission IN \('owner','editor'\)/.test(text)) return { rows: access ? [{}] : [] };
      return { rows: [] };
    },
  };
}

test('no program is never refused', async () => {
  assert.equal(await programAccessError(fakeClient({}), null, { userId: 'u', role: 'user' }), null);
});

test('an admin may attach any program', async () => {
  assert.equal(await programAccessError(fakeClient({ projects: ['p'] }), 'PRG', { userId: 'u', role: 'admin' }), null);
});

test('a program without projects is open, as PATCH /programs/:id', async () => {
  assert.equal(await programAccessError(fakeClient({ projects: [] }), 'PRG', { userId: 'u', role: 'user' }), null);
});

test('a program whose projects the caller cannot edit is refused with 403', async () => {
  const err = await programAccessError(fakeClient({ projects: ['p'], access: false }), 'PRG', { userId: 'u', role: 'user' });
  assert.equal(err?.status, 403);
  assert.equal(err?.message, 'Access denied');
});

test('owner or editor on one project of the program may attach it', async () => {
  assert.equal(await programAccessError(fakeClient({ projects: ['p'], access: true }), 'PRG', { userId: 'u', role: 'user' }), null);
});
