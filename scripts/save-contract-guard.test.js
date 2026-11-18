// Guard: the save contract (CLAUDE.md "Save contract") is the only way to write.
//   * Server: every INSERT INTO / UPDATE / DELETE FROM on a registered table in api/src/routes and
//     api/src/services sits inside the arguments of a versionedWrite( call.
//   * Client: no file under js/ writes with fetch(, apiFetch( or a write method of Api.*; it writes
//     with apiSave. js/api.js and js/lib/save.js are the two layers that do the writing.
//   * Save steps (SAVE_STEPS): a write in the body of a listed function counts as inside, and every call
//     of that function must sit inside a versionedWrite( call.
//   * Lists: SERVER_EXEMPT ('file: table') and CLIENT_EXEMPT (files) hold what is not migrated yet;
//     an entry with no violation left fails (the lists only shrink), and RETIRED holds what left them
//     and may never come back. A write method of Api.* with no caller in js/ fails too.
//
// WHAT IS DELIBERATELY NOT CHECKED -- named limits, not gaps:
//   * It is lexical: SQL built by concatenation, or written in lower case, is not seen; neither is a
//     table name in quotes or with a schema.
//   * A fetch( / apiFetch( whose method sits in a variable is not seen.
//   * api/src/scripts (CLI and seed scripts) is out of scope.
//   * The tokenizer's own limits are in scripts/lib/save-contract-scan.mjs.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serverWrites, apiWriteMethods, clientWrites, callSpans, functionBodies, apiUses, reachedMethods } from './lib/save-contract-scan.mjs';

const ROOT = join(__dirname, '..');

const REGISTERED_TABLES = ['roles', 'ratecards', 'ratecard_entries', 'programs', 'projects', 'cost_grids', 'cost_grid_versions',
  'phases', 'tasks', 'task_roles'];

// Save steps: functions whose writes count as inside versionedWrite(, because every call of them, in any
// server file, must sit inside the arguments of a versionedWrite( call.
const SAVE_STEPS = { 'api/src/services/cost-grid-save.js': ['applyHeader', 'applyStructure'] };

const SERVER_EXEMPT = new Set([
  'api/src/routes/config.js: programs',
  'api/src/routes/projects.js: projects',
  'api/src/routes/reset.js: cost_grids',
  'api/src/routes/reset.js: programs',
  'api/src/routes/reset.js: projects',
  'api/src/routes/reset.js: ratecards',
]);

const CLIENT_EXEMPT = new Set([
  'js/api-sync.js',
  'js/clients.js',
  'js/costgrid.js',
  'js/nav.js',
  'js/notifications.js',
  'js/pages/_db-reset.js',
  'js/pages/_terms-editor.js',
  'js/pages/activate.js',
  'js/pages/admin.js',
  'js/pages/costgrid.js',
  'js/pages/login.js',
  'js/pages/master-clients.js',
  'js/pages/master-currencies.js',
  'js/pages/master-pipelines.js',
  'js/pages/pipeline.js',
  'js/pages/planning.js',
  'js/pages/profile.js',
  'js/pages/project-config.js',
  'js/pages/reset-password.js',
  'js/pages/team.js',
  'js/pages/terms.js',
  'js/pages/timesheets.js',
  'js/share-list-component.js',
  'js/shares.js',
  'js/upload.js',
]);

const RETIRED = [
  'js/pages/master-roles.js',
  'api/src/routes/config.js: roles',
  'api/src/routes/config.js: ratecards',
  'api/src/routes/config.js: ratecard_entries',
  'api/src/routes/cost-grids.js: cost_grid_versions',
  'api/src/routes/cost-grids.js: cost_grids',
];

const CLIENT_LAYERS = new Set(['js/api.js', 'js/lib/save.js']);
const SERVER_EXCLUDED = new Set(['api/src/services/versioned-write.js']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js') && !name.endsWith('.test.js')) out.push(full);
  }
  return out;
}
const rel = f => relative(ROOT, f).split('\\').join('/');
const sourcesOf = dirs => Object.fromEntries(dirs.flatMap(d => walk(join(ROOT, d))).map(f => [rel(f), readFileSync(f, 'utf8')]));

// The five rules over { path: source } maps; each answers the entries at fault.
function checkContract({ server, client, apiJs, serverExempt, clientExempt, retired, steps = SAVE_STEPS }) {
  const writeMethods = apiWriteMethods(apiJs);
  const serverOutside = new Set();
  const stepNames = Object.values(steps).flat();
  for (const [file, src] of Object.entries(server)) {
    if (SERVER_EXCLUDED.has(file)) continue;
    const bodies = (steps[file] || []).flatMap(name => functionBodies(src, name));
    for (const w of serverWrites(src, REGISTERED_TABLES)) {
      if (!w.inside && !bodies.some(([a, b]) => w.index > a && w.index < b)) serverOutside.add(`${file}: ${w.table}`);
    }
    const spans = callSpans(src, 'versionedWrite');
    for (const name of stepNames) {
      for (const [a] of callSpans(src, name)) {
        if (/\bfunction\s*$/.test(src.slice(Math.max(0, a - 20), a))) continue;
        if (!spans.some(([x, y]) => a > x && a < y)) serverOutside.add(`${file}: ${name}() outside versionedWrite(`);
      }
    }
  }
  const clientWriting = new Set();
  const called = new Set();
  for (const [file, src] of Object.entries(client)) {
    for (const use of apiUses(src)) reachedMethods(use, writeMethods).forEach(m => called.add(m));
    if (CLIENT_LAYERS.has(file)) continue;
    if (clientWrites(src, writeMethods).length) clientWriting.add(file);
  }
  return {
    serverViolations: [...serverOutside].filter(k => !serverExempt.has(k)).sort(),
    clientViolations: [...clientWriting].filter(f => !clientExempt.has(f)).sort(),
    retiredBack: retired.filter(r => serverExempt.has(r) || clientExempt.has(r)),
    staleExempt: [...[...serverExempt].filter(k => !serverOutside.has(k)), ...[...clientExempt].filter(f => !clientWriting.has(f))],
    orphanMethods: [...writeMethods].filter(m => !called.has(m)).sort(),
  };
}

describe('save-contract scanner', () => {
  const T = REGISTERED_TABLES;
  it('an UPDATE outside versionedWrite( is outside', () => {
    expect(serverWrites("await query('UPDATE roles SET x = 1 WHERE id = $1', [id]);", T)).toEqual([{ table: 'roles', index: 13, inside: false }]);
  });
  it('the same SQL inside versionedWrite(...), on several lines and in a template, is inside', () => {
    const src = [
      'await versionedWrite(pool, {',
      "  type: 'role',",
      '  write: async c => {',
      '    await c.query(`UPDATE roles SET ${fields.join(", ")} WHERE id = $1`, [id]);',
      "    await c.query('DELETE FROM ratecard_entries WHERE role_id = $1', [id]);",
      '  },',
      '});',
    ].join('\n');
    const w = serverWrites(src, T);
    expect(w.map(x => [x.table, x.inside])).toEqual([['roles', true], ['ratecard_entries', true]]);
  });
  it('DELETE FROM ratecard_entries is not ratecards, and an unregistered table is ignored', () => {
    expect(serverWrites("q('DELETE FROM ratecard_entries WHERE x')", T).map(x => x.table)).toEqual(['ratecard_entries']);
    expect(serverWrites("q('UPDATE users SET a = 1')", T)).toEqual([]);
  });
  it('ON CONFLICT ... DO UPDATE SET is not a write of a table', () => {
    expect(serverWrites("q(`INSERT INTO clients (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = EXCLUDED.a`)", T)).toEqual([]);
  });
  it('SQL in a comment is not a write', () => {
    expect(serverWrites('// UPDATE roles SET x = 1\n/* DELETE FROM roles */', T)).toEqual([]);
  });
  it('a write fetch( counts, a read fetch( does not', () => {
    expect(clientWrites("fetch('/api/x', { method: 'POST' });", new Set()).map(w => w.kind)).toEqual(['fetch']);
    expect(clientWrites("fetch('/handbook/a.md').then(r => r.text());", new Set())).toEqual([]);
  });
  it('a write apiFetch( counts, a read one does not, and apiFetch is not read as fetch', () => {
    expect(clientWrites("apiFetch('/x', { method: 'DELETE' });", new Set()).map(w => w.kind)).toEqual(['apiFetch']);
    expect(clientWrites("apiFetch('/x');", new Set())).toEqual([]);
  });
  it('reads the write methods of an api.js and finds their calls', () => {
    const api = [
      'const Api = {',
      '  r: {',
      "    list:   ()  => apiFetch('/r'),",
      "    create: (d) => apiFetch('/r', { method: 'POST', body: JSON.stringify(d) }),",
      '  },',
      '};',
    ].join('\n');
    const methods = apiWriteMethods(api);
    expect([...methods]).toEqual(['r.create']);
    expect(clientWrites('Api.r.create({ a: 1 });', methods).map(w => w.name)).toEqual(['r.create']);
    expect(clientWrites('Api.r.list();', methods)).toEqual([]);
  });
  it('reads nested namespaces, and a namespace handed over whole reaches its write methods', () => {
    const api = [
      'const Api = {',
      '  g: {',
      "    list:   ()  => apiFetch('/g'),",
      "    remove: (id) => apiFetch(`/g/${id}`, { method: 'DELETE' }),",
      '    shares: {',
      "      add: (id) => apiFetch(`/g/${id}/s`, { method: 'POST' }),",
      '    },',
      '  },',
      '};',
    ].join('\n');
    const methods = apiWriteMethods(api);
    expect([...methods].sort()).toEqual(['g.remove', 'g.shares.add']);
    expect(clientWrites('Api.g.shares.add(1);', methods).map(w => w.name)).toEqual(['g.shares.add']);
    const passed = apiUses('moveClient({ id }, Api.g);')[0];
    expect(passed).toMatchObject({ path: 'g', call: false });
    expect(reachedMethods(passed, methods).sort()).toEqual(['g.remove', 'g.shares.add']);
    expect(clientWrites('moveClient({ id }, Api.g);', methods).map(w => w.name)).toEqual(['g']);
  });
  it('functionBodies spans a declaration\'s body, nested and quoted braces included, and skips calls', () => {
    const src = "applyX(a);\nasync function applyX(c) {\n  if (c) { q('}'); }\n}\nconst z = 1;";
    const bodies = functionBodies(src, 'applyX');
    expect(bodies).toEqual([[src.indexOf('{'), src.lastIndexOf('}')]]);
  });
  it('a parenthesis inside a string or a comment does not close the call', () => {
    const src = "versionedWrite(pool, { note: ')', /* ) */ write: c => c.query('UPDATE roles SET a = 1') });";
    expect(callSpans(src, 'versionedWrite')).toEqual([[0, src.length - 1]]);
    expect(serverWrites(src, T)[0].inside).toBe(true);
  });
});

describe('save-contract rules on synthetic sources', () => {
  const apiJs = "const Api = {\n  r: {\n    create: (d) => apiFetch('/r', { method: 'POST' }),\n  },\n};\n";
  const base = {
    server: {}, client: { 'js/api.js': apiJs, 'js/pages/a.js': 'apiSave("POST", "/r", {}); Api.r.create({});' },
    apiJs, serverExempt: new Set(), clientExempt: new Set(['js/pages/a.js']), retired: [],
  };
  it('fails on a write fetch( in a file outside the list', () => {
    const r = checkContract({ ...base, client: { ...base.client, 'js/pages/b.js': "fetch('/api/x', { method: 'POST' })" } });
    expect(r.clientViolations).toEqual(['js/pages/b.js']);
  });
  it('fails on an Api write method called in a file outside the list', () => {
    const r = checkContract({ ...base, clientExempt: new Set() });
    expect(r.clientViolations).toEqual(['js/pages/a.js']);
  });
  it('fails on an UPDATE roles outside versionedWrite(, passes on one inside', () => {
    const out = checkContract({ ...base, server: { 'api/src/routes/x.js': "query('UPDATE roles SET a = 1')" } });
    expect(out.serverViolations).toEqual(['api/src/routes/x.js: roles']);
    const inside = checkContract({ ...base, server: { 'api/src/routes/x.js': "versionedWrite(pool, { write: c => c.query('UPDATE roles SET a = 1') })" } });
    expect(inside.serverViolations).toEqual([]);
  });
  it('passes on a read-only fetch(', () => {
    const r = checkContract({ ...base, client: { ...base.client, 'js/lib/h.js': "fetch('/handbook/a.md')" } });
    expect(r.clientViolations).toEqual([]);
  });
  it('fails on a RETIRED entry put back in a list', () => {
    const r = checkContract({ ...base, clientExempt: new Set(['js/pages/a.js', 'js/pages/old.js']), retired: ['js/pages/old.js'] });
    expect(r.retiredBack).toEqual(['js/pages/old.js']);
  });
  it('fails on a list entry with no violation left', () => {
    const r = checkContract({ ...base, clientExempt: new Set(['js/pages/a.js', 'js/pages/clean.js']), serverExempt: new Set(['api/src/routes/x.js: roles']) });
    expect(r.staleExempt.sort()).toEqual(['api/src/routes/x.js: roles', 'js/pages/clean.js']);
  });
  it('a save step\'s write counts as inside, and a call of a step outside versionedWrite( fails', () => {
    const steps = { 'api/src/services/s.js': ['applyX'] };
    const stepSrc = "async function applyX(client) {\n  await client.query('UPDATE roles SET a = 1');\n}\nfunction other() { query('UPDATE roles SET b = 1'); }\n";
    const inside = checkContract({ ...base, steps, server: {
      'api/src/services/s.js': stepSrc,
      'api/src/routes/x.js': "versionedWrite(pool, { write: async c => { await applyX(c); } });",
    } });
    expect(inside.serverViolations).toEqual(['api/src/services/s.js: roles']);
    const outside = checkContract({ ...base, steps, server: {
      'api/src/services/s.js': "async function applyX(client) {\n  await client.query('UPDATE roles SET a = 1');\n}\n",
      'api/src/routes/x.js': "await applyX(client);",
    } });
    expect(outside.serverViolations).toEqual(['api/src/routes/x.js: applyX() outside versionedWrite(']);
  });
  it('fails on an Api write method with no caller', () => {
    const r = checkContract({ ...base, client: { 'js/api.js': apiJs, 'js/pages/a.js': "fetch('/x', { method: 'PUT' })" } });
    expect(r.orphanMethods).toEqual(['r.create']);
  });
});

describe('save-contract rules on the repository', () => {
  const server = sourcesOf(['api/src/routes', 'api/src/services']);
  const client = sourcesOf(['js']);
  const result = checkContract({
    server, client, apiJs: client['js/api.js'],
    serverExempt: SERVER_EXEMPT, clientExempt: CLIENT_EXEMPT, retired: RETIRED,
  });
  it('1. no write of a registered table outside versionedWrite( beyond SERVER_EXEMPT', () => {
    expect(result.serverViolations, 'write through versionedWrite, or (not migrated yet) list in SERVER_EXEMPT').toEqual([]);
  });
  it('2. no client write outside apiSave beyond CLIENT_EXEMPT', () => {
    expect(result.clientViolations, 'write through apiSave, or (not migrated yet) list in CLIENT_EXEMPT').toEqual([]);
  });
  it('3. no RETIRED entry in a list', () => {
    expect(result.retiredBack).toEqual([]);
  });
  it('4. every list entry still has a violation', () => {
    expect(result.staleExempt, 'remove these entries from the list (and add them to RETIRED)').toEqual([]);
  });
  it('5. every write method of Api.* has a caller in js/', () => {
    expect(result.orphanMethods, 'delete these methods from js/api.js').toEqual([]);
  });
});
