// Guard: the save contract (CLAUDE.md "Save contract") is the only way to write.
//   * Server: every INSERT INTO / UPDATE / DELETE FROM on a registered table in api/src/routes and
//     api/src/services sits inside the arguments of a versionedWrite( call.
//   * Client: no file under js/ writes with fetch(, apiFetch( or a write method of Api.*; it writes
//     with apiSave. js/api.js and js/lib/save.js are the two layers that do the writing.
//   * Save steps (SAVE_STEPS): a write in the body of a listed function counts as inside, and every call
//     of that function must sit inside a versionedWrite( call, or in the body of another step of its file.
//   * Lists: SERVER_EXEMPT ('file: table') and CLIENT_EXEMPT (files, or 'file: write' entries naming each
//     write that stays, its Api.* path) hold what is not migrated yet;
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
  'phases', 'tasks', 'task_roles', 'project_tasks', 'cg_version_projects'];

// Save steps: functions whose writes count as inside versionedWrite(, because every call of them, in any
// server file, must sit inside the arguments of a versionedWrite( call.
const SAVE_STEPS = {
  'api/src/services/cost-grid-save.js': ['applyHeader', 'applyStructure'],
  'api/src/services/project-save.js': ['applyProjectSave', 'applyTasks', 'applySections', 'applyCreate', 'upsertLink'],
};

const SERVER_EXEMPT = new Set([
  'api/src/routes/reset.js: cost_grids',
  'api/src/routes/reset.js: programs',
  'api/src/routes/reset.js: projects',
  'api/src/routes/reset.js: ratecards',
]);

const CLIENT_EXEMPT = new Set([
  // Save contract cycles 2 and 3 moved the cost grid editor's Save and the project and program writes to apiSave;
  // these writes stay (cycle 5: actuals; cycle 7: single shares; the lifecycle
  // of a proposal is out of scope).
  'js/costgrid.js: costGrids.create',
  'js/costgrid.js: costGrids.delete',
  'js/costgrid.js: costGrids.versions.create',
  'js/costgrid.js: costGrids.versions.delete',
  'js/costgrid.js: costGrids.versions.duplicate',
  'js/costgrid.js: costGrids.versions.publish',
  'js/pages/_db-reset.js',
  'js/pages/activate.js',
  'js/pages/admin.js',
  'js/pages/costgrid.js: costGrids.reassignOwner',
  'js/pages/login.js',
  'js/pages/pipeline.js',
  'js/pages/planning.js',
  'js/pages/project-config.js: timesheets.delete',
  'js/pages/project-config.js: timesheets.upload',
  'js/pages/reset-password.js',
  'js/pages/timesheets.js',
  'js/upload.js',
]);

const RETIRED = [
  'js/nav.js',
  'js/notifications.js',
  'js/pages/terms.js',
  'js/pages/profile.js',
  'js/pages/_terms-editor.js',
  'js/pages/master-roles.js',
  'js/clients.js',
  'js/pages/master-clients.js',
  'js/pages/master-pipelines.js',
  'js/pages/master-currencies.js',
  'js/pages/team.js',
  'js/pages/project-config.js: clients.create',
  'api/src/routes/config.js: roles',
  'api/src/routes/config.js: ratecards',
  'api/src/routes/config.js: ratecard_entries',
  'api/src/routes/cost-grids.js: cost_grid_versions',
  'api/src/routes/cost-grids.js: cost_grids',
  'js/api-sync.js: costGrids.update',
  'js/api-sync.js: costGrids.versions.update',
  'js/api-sync.js: costGrids.versions.saveStructure',
  'js/costgrid.js: costGrids.versions.saveStructure',
  'api/src/routes/projects.js: projects',
  'api/src/routes/config.js: programs',
  'js/api-sync.js: projects.create',
  'js/api-sync.js: projects.delete',
  'js/api-sync.js: projects.groups',
  'js/api-sync.js: projects.phasing',
  'js/api-sync.js: projects.planning',
  'js/api-sync.js: projects.ptc',
  'js/api-sync.js: projects.saveTasks',
  'js/api-sync.js: projects.update',
  'js/costgrid.js: costGrids.versions.linkedProjects.add',
  'js/pages/costgrid.js: programs.create',
  'js/pages/project-config.js: programs.create',
  'js/shares.js: costGrids.shares',
  'js/shares.js: projects.shares',
  'js/share-list-component.js',
  'js/shares.js: programs.share',
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
        // A call from the body of another step of this file is inside: that step is itself only called inside.
        const inSpan = ([x, y]) => a > x && a < y;
        if (!spans.some(inSpan) && !bodies.some(inSpan)) serverOutside.add(`${file}: ${name}() outside versionedWrite(`);
      }
    }
  }
  // file → the names of its writes: the Api.* path, or 'fetch POST' / 'apiFetch PUT' for a raw call.
  const clientWriting = new Map();
  const called = new Set();
  for (const [file, src] of Object.entries(client)) {
    for (const use of apiUses(src)) reachedMethods(use, writeMethods).forEach(m => called.add(m));
    if (CLIENT_LAYERS.has(file)) continue;
    const names = clientWrites(src, writeMethods).map(w => (w.kind === 'api' ? w.name : `${w.kind} ${w.name}`));
    if (names.length) clientWriting.set(file, new Set(names));
  }
  // A file is exempt whole ('file') or write by write ('file: name'); with per-write entries, each write
  // that has none is a violation of its own.
  const perWrite = f => [...clientExempt].some(e => e.startsWith(`${f}: `));
  const clientViolations = [];
  for (const [f, names] of clientWriting) {
    if (clientExempt.has(f)) continue;
    if (!perWrite(f)) { clientViolations.push(f); continue; }
    for (const n of names) if (!clientExempt.has(`${f}: ${n}`)) clientViolations.push(`${f}: ${n}`);
  }
  const clientStale = [...clientExempt].filter(e => {
    const i = e.indexOf(': ');
    if (i < 0) return !clientWriting.has(e);
    return !clientWriting.get(e.slice(0, i))?.has(e.slice(i + 2));
  });
  return {
    serverViolations: [...serverOutside].filter(k => !serverExempt.has(k)).sort(),
    clientViolations: clientViolations.sort(),
    retiredBack: retired.filter(r => serverExempt.has(r) || clientExempt.has(r)),
    staleExempt: [...[...serverExempt].filter(k => !serverOutside.has(k)), ...clientStale],
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
  it('a step called from the body of another step of the same file counts as inside', () => {
    const steps = { 'api/src/services/s.js': ['applyX', 'applyY'] };
    const src = "async function applyY(client) {\n  await client.query('UPDATE roles SET a = 1');\n}\n"
      + "async function applyX(client) {\n  await applyY(client);\n}\n";
    const r = checkContract({ ...base, steps, server: {
      'api/src/services/s.js': src,
      'api/src/routes/x.js': "versionedWrite(pool, { write: async c => { await applyX(c); } });",
    } });
    expect(r.serverViolations).toEqual([]);
    const loose = checkContract({ ...base, steps, server: {
      'api/src/services/s.js': src + "function other(client) { applyY(client); }\n",
      'api/src/routes/x.js': "versionedWrite(pool, { write: async c => { await applyX(c); } });",
    } });
    expect(loose.serverViolations).toEqual(['api/src/services/s.js: applyY() outside versionedWrite(']);
  });
  describe('per-write exemptions', () => {
    const apiJs2 = "const Api = {\n  g: {\n    publish: (id) => apiFetch('/g', { method: 'POST' }),\n    remove:  (id) => apiFetch('/g', { method: 'DELETE' }),\n  },\n};\n";
    const src = 'Api.g.publish(1); Api.g.remove(2);';
    const per = extra => ({
      server: {}, apiJs: apiJs2, retired: [], serverExempt: new Set(),
      client: { 'js/api.js': apiJs2, 'js/costgrid.js': src },
      clientExempt: new Set(['js/costgrid.js: g.publish', ...extra]),
    });
    it('a write outside a per-write exemption fails', () => {
      expect(checkContract(per([])).clientViolations).toEqual(['js/costgrid.js: g.remove']);
      expect(checkContract(per(['js/costgrid.js: g.remove'])).clientViolations).toEqual([]);
    });
    it('a per-write exemption with no violation left fails', () => {
      const r = checkContract(per(['js/costgrid.js: g.remove', 'js/costgrid.js: g.gone']));
      expect(r.staleExempt).toEqual(['js/costgrid.js: g.gone']);
    });
    it('a RETIRED per-write entry put back fails', () => {
      const r = checkContract({ ...per(['js/costgrid.js: g.remove']), retired: ['js/costgrid.js: g.publish'] });
      expect(r.retiredBack).toEqual(['js/costgrid.js: g.publish']);
    });
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
