#!/usr/bin/env node
'use strict';
// Smoke seed: creates the fixed fantasy dataset of seed-smoke-data.js through the public API and checks the result.
// DEV TOOL — isolated stacks only (it refuses a non-local URL, a URL without an explicit port, and port 80).
//
//   node api/src/scripts/seed-smoke.js --url http://localhost:8190 --email <sysadmin> --password <pw> --device <hex>
//
// --device is the value printed by `node src/trust-device.js <email>` on that stack: the login then needs no email code.
// The account must be a SYSADMIN (project creation rules). PDash To Prod's Seed button runs all of this.
//
// Exit codes: 0 every check OK · 1 a call failed or a check is MISMATCH · 2 usage or refused target ·
//             3 the database already holds an offer or a client (nothing is written).
//
// Request shapes (read from the routes, 2026-11-13): POST /api/clients {name}; POST /api/client-groups {name};
// PUT /api/client-groups/:id/clients/:clientId; POST /api/roles {label, code, team, hourlyRate};
// POST /api/currencies/:code/activate {rate}; POST /api/pipeline-years {year, active}; POST /api/pots {clientId, year, amount};
// POST /api/resources {firstName, lastName, email, roleId} (+ PATCH status); POST /api/attribute-lists/:id/items {label};
// POST /api/cost-grids {name} -> POST …/versions {label, startDate YYYYMM, endDate, currency, clientId, projectName, pipelineYear}
// -> PUT …/structure {phases:[{phaseName, tasks:[{taskName, taskStartDate, taskEndDate, hours:{code:n}}]}], roles:[{roleCode, rate}]}
// -> PUT …/tags {itemIds} -> POST …/publish -> PATCH {pipeline}; POST /api/programs {id, name};
// POST /api/projects {name, code, programId, clientId, startDate, endDate, currency, pipeline, status, cgVersionId}
// -> PUT /api/projects/:id/tasks [{name, startDate, endDate, resources:[{role, soldHours, hourlyRate}]}]
// -> POST …/versions/:vId/linked-projects {projectId, taskIds, taskNames}; POST /api/timesheets/upload?projectCode= (CSV).

const D = require('./seed-smoke-data');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const url = arg('url'), email = arg('email'), password = arg('password'), device = arg('device');
if (!url || !email || !password || !device) {
  console.error('usage: seed-smoke.js --url <url> --email <email> --password <password> --device <hex>');
  process.exit(2);
}
const target = D.checkTarget(url);
if (!target.ok) { console.error(`Refusing to seed: ${target.error}`); process.exit(2); }

let cookie = `pdash_device=${device}`;
async function api(method, path, body) {
  const res = await fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null; try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}
// A call that must succeed: returns the parsed body or stops the whole run.
async function must(method, path, body) {
  const r = await api(method, path, body);
  if (r.status < 200 || r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
async function upload(csv, code) {
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'ts.csv');
  const res = await fetch(`${url}/api/timesheets/upload?projectCode=${encodeURIComponent(code)}`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  let data = null; try { data = await res.json(); } catch { /* no body */ }
  if (res.status !== 201) throw new Error(`upload ${code} -> ${res.status} ${JSON.stringify(data)}`);
}

const today = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
const year = today.getUTCFullYear();
const ym = (d) => D.ymd(d).slice(0, 7).replace('-', '');
const compact = (d) => D.ymd(d).replace(/-/g, '');
const results = [];
const check = (what, want, got) => {
  const ok = Math.abs(Number(want) - Number(got)) < 0.005;
  results.push(ok);
  console.log(ok ? `OK ${what}` : `MISMATCH ${what}: expected ${want}, got ${got}`);
};

async function main() {
  const login = await api('POST', '/api/auth/login', { email, password });
  if (login.status !== 200 || login.data?.twoStep) throw new Error(`login failed (${login.status}): ${JSON.stringify(login.data)}`);

  const [grids, clientsNow] = await Promise.all([must('GET', '/api/cost-grids'), must('GET', '/api/clients')]);
  if (!D.isEmptyDatabase({ offers: grids.length, clients: clientsNow.length })) {
    console.error('The database already holds offers or clients: nothing was written. Use a fresh stack.');
    process.exit(3);
  }

  // Reference data
  const group = await must('POST', '/api/client-groups', { name: D.GROUP });
  const clientId = {};
  for (const c of D.CLIENTS) {
    clientId[c.name] = (await must('POST', '/api/clients', { name: c.name })).id;
    if (c.group) await must('PUT', `/api/client-groups/${group.id}/clients/${clientId[c.name]}`);
  }
  const roleId = {};
  for (const r of D.ROLES) roleId[r.code] = (await must('POST', '/api/roles', { label: r.label, code: r.code, team: r.team, hourlyRate: r.rate })).id;
  await must('POST', '/api/currencies/USD/activate', { rate: D.USD_RATE });
  // The migrations may already create the current year: read first, create or activate as needed.
  const py = (await must('GET', '/api/pipeline-years')).find((y) => y.year === year);
  if (!py) await must('POST', '/api/pipeline-years', { year, active: true });
  else if (!py.active) await must('PATCH', `/api/pipeline-years/${py.id}`, { active: true });
  await must('POST', '/api/pots', { clientId: clientId[D.POT.client], year, amount: D.POT.amount });
  for (const p of D.TEAM) {
    const r = await must('POST', '/api/resources', { firstName: p.first, lastName: p.last, email: p.email, roleId: roleId[p.role] });
    if (!p.active) await must('PATCH', `/api/resources/${r.id}`, { status: 'inactive' });
  }
  const lists = await must('GET', '/api/attribute-lists');
  const listId = lists.find((l) => l.name === D.TAGS.list)?.id;
  if (!listId) throw new Error(`attribute list "${D.TAGS.list}" not found`);
  const tagId = {};
  for (const label of D.TAGS.items) tagId[label] = (await must('POST', `/api/attribute-lists/${listId}/items`, { label })).id;
  await must('POST', '/api/programs', D.PROGRAM);

  // Offers, and a project for those that have one
  const versionOf = {};
  for (const o of D.OFFERS) {
    const slices = D.taskPeriods(o, today);
    const period = D.offerPeriod(o, today);
    const grid = await must('POST', '/api/cost-grids', { name: o.name });
    const ver = await must('POST', `/api/cost-grids/${grid.id}/versions`, {
      label: 'v1', startDate: ym(period.start), endDate: ym(period.end), currency: o.currency,
      clientId: clientId[o.client], projectName: o.name, pipelineYear: year,
    });
    const base = `/api/cost-grids/${grid.id}/versions/${ver.id}`;
    const phases = [];
    for (const s of slices) {
      let ph = phases.find((p) => p.phaseName === s.phase);
      if (!ph) { ph = { phaseName: s.phase, tasks: [] }; phases.push(ph); }
      ph.tasks.push({ taskName: s.task, taskStartDate: compact(s.start), taskEndDate: compact(s.end), hours: Object.fromEntries(s.roles.map((r) => [r.role, r.hours])) });
    }
    const roles = D.ROLES.map((r) => ({ roleCode: r.code, rate: o.currency === 'USD' ? r.usdRate : r.rate }));
    await must('PUT', `${base}/structure`, { phases, roles });
    if (o.tag) await must('PUT', `${base}/tags`, { itemIds: [tagId[o.tag]] });
    await must('POST', `${base}/publish`);
    if (o.stage !== 'SIP') await must('PATCH', base, { pipeline: o.stage });
    versionOf[o.name] = ver.id;

    if (o.projectCode) {
      const proj = await must('POST', '/api/projects', {
        name: o.name, code: o.projectCode, programId: o.program ? D.PROGRAM.id : undefined, clientId: clientId[o.client],
        startDate: ym(period.start), endDate: ym(period.end), currency: o.currency, pipeline: o.stage, status: 'Started', cgVersionId: ver.id,
      });
      await must('PUT', `/api/projects/${proj.id}/tasks`, slices.map((s) => ({
        name: s.task, startDate: compact(s.start), endDate: compact(s.end),
        resources: s.roles.map((r) => ({ role: r.role, soldHours: r.hours, hourlyRate: roles.find((x) => x.roleCode === r.role).rate })),
      })));
      const structure = await must('GET', `${base}/structure`);
      const tasks = structure.phases.flatMap((p) => p.tasks);
      await must('POST', `${base}/linked-projects`, { projectId: proj.id, taskIds: tasks.map((t) => t.id), taskNames: tasks.map((t) => t.title) });
    }
  }
  for (const o of D.OFFERS.filter((x) => x.projectCode)) await upload(D.buildActualsCsv(o.projectCode, today), o.projectCode);

  // Verification against the constants
  const exp = D.expected(today);
  check('clients', exp.clients, (await must('GET', '/api/clients')).length);
  check('roles', exp.roles, (await must('GET', '/api/roles')).length);
  check('resources', exp.resources, (await must('GET', '/api/resources')).length);
  check('offers', exp.offers, (await must('GET', '/api/cost-grids')).length);
  check('projects', exp.projects, (await must('GET', '/api/projects')).length);
  check('programs', exp.programs, (await must('GET', '/api/programs')).length);
  check('pots', exp.pots, (await must('GET', `/api/pots?year=${year}`)).length);
  const budgets = await must('GET', '/api/cost-grids/budgets');
  for (const o of D.OFFERS) check(`budget of ${o.name}`, exp.offerBudget[o.name], budgets[versionOf[o.name]]?.fee);
  const sheets = await must('GET', '/api/timesheets');
  for (const [code, rows] of Object.entries(exp.actualsRows)) check(`actuals rows of ${code}`, rows, sheets.find((s) => s.project_code === code)?.total_rows);

  const bad = results.filter((r) => !r).length;
  console.log(bad === 0 ? `seeded the smoke dataset: ${results.length} checks OK` : `${bad} of ${results.length} checks MISMATCH`);
  process.exit(bad === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
