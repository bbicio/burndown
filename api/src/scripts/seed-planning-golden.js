#!/usr/bin/env node
'use strict';
// Seeds the Planning parity dataset through the public API. DEV TOOL — isolated stacks only.
//   SEED_URL=http://localhost:8081 SEED_EMAIL=... SEED_PASSWORD=... node seed-planning-golden.js [--remove]
// Everything is created with the GOLD- prefix and removed again by --remove.
const url = process.env.SEED_URL, email = process.env.SEED_EMAIL, password = process.env.SEED_PASSWORD;
if (!url || !email || !password) { console.error('Set SEED_URL, SEED_EMAIL, SEED_PASSWORD'); process.exit(2); }
const u = new URL(url);
if (!u.port || u.port === '80') { console.error('Refusing to seed: SEED_URL must be an isolated stack with an explicit non-80 port (never the main stack).'); process.exit(2); }

let cookie = '';
async function api(method, path, body) {
  const res = await fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
async function upload(csv, code) {
  const form = new FormData(); form.append('file', new Blob([csv], { type: 'text/csv' }), 'ts.csv');
  const res = await fetch(`${url}/api/timesheets/upload?projectCode=${encodeURIComponent(code)}`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const compact = d => ymd(d).replace(/-/g, '');
const ym = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}`;
const today = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
const plus = n => new Date(today.getTime() + n * 86400000);
const nextMonths = (k) => Array.from({ length: k }, (_, i) => ym(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1))));

async function main() {
  const login = await api('POST', '/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login failed (${login.status})`);

  if (process.argv.includes('--remove')) {
    const projects = (await api('GET', '/api/projects')).data || [];
    for (const p of projects.filter(p => (p.code || '').startsWith('GOLD-') || (p.name || '').startsWith('GOLD '))) {
      await api('DELETE', `/api/timesheets/${p.code}`); await api('DELETE', `/api/projects/${p.id}`);
    }
    const resources = (await api('GET', '/api/resources')).data || [];
    for (const r of resources.filter(r => (r.last_name || r.lastName || '').startsWith('Golden'))) await api('DELETE', `/api/resources/${r.id}`);
    console.log('removed GOLD data'); return;
  }

  // Resources need a role id (any existing role, or a seed role when none exists).
  const roles = (await api('GET', '/api/roles')).data || [];
  let roleRow = roles[0];
  if (!roleRow) roleRow = (await api('POST', '/api/roles', { label: 'Golden seed role', code: 'GOLDSEED' })).data;
  if (!roleRow?.id) throw new Error('no role available for the golden resources');

  // Resources: one active, one inactive. Ann Golden / Bob Golden; 'Cy Unmatched' has no resource.
  const mk = async (first, last, status) => {
    const r = await api('POST', '/api/resources', { firstName: first, lastName: last, email: `${first}.${last}@golden.local`.toLowerCase(), roleId: roleRow.id });
    if (!r.data?.id) throw new Error(`resource ${first} ${last} not created (${r.status}): ${JSON.stringify(r.data)}`);
    if (status === 'inactive') await api('PATCH', `/api/resources/${r.data.id}`, { status: 'inactive' });
  };
  await mk('Ann', 'Golden', 'active'); await mk('Bob', 'Golden', 'inactive');

  // Team roles: the prefix before ' - ' in a task role string is the team, used by the team filter.
  const months = nextMonths(6);
  const dist = Object.fromEntries(months.slice(0, 4).map((m, i) => [m, [40, 30, 20, 10][i]]));
  const mkProject = async (code, name, start, end, tasks) => {
    const r = await api('POST', '/api/projects', { name, code, startDate: ym(start), endDate: ym(end), pipeline: 'Committed', status: 'Started' });
    if (!r.data?.id) throw new Error(`project ${code} not created (${r.status})`);
    const t = await api('PUT', `/api/projects/${r.data.id}/tasks`, tasks);
    if (t.status !== 200) throw new Error(`tasks of ${code} rejected (${t.status}): ${JSON.stringify(t.data)}`);
    return r.data.id;
  };

  await mkProject('GOLD-A', 'GOLD Alpha', plus(-70), plus(150), [
    { name: 'Build',  startDate: compact(plus(-45)), endDate: compact(plus(75)), monthlyDistribution: dist,
      resources: [{ role: 'GOLDT1 - DEV', soldHours: 200 }, { role: 'GOLDT2 - QA', soldHours: 80 }] },
    { name: 'Design', resources: [{ role: 'GOLDT1 - DEV', soldHours: 40 }] },                       // no task dates -> project dates
    { name: 'Docs',   startDate: compact(plus(10)), endDate: compact(plus(60)), resources: [{ role: 'GOLDT2 - QA', soldHours: 24 }] },  // tiny h/week -> pulse
    { name: 'Legacy', completed: true, resources: [{ role: 'GOLDT1 - DEV', soldHours: 10 }] },
  ]);
  await mkProject('GOLD-B', 'GOLD Beta', plus(-20), plus(120), [
    { name: 'Build', startDate: compact(plus(-10)), endDate: compact(plus(110)), monthlyDistribution: dist,
      resources: [{ role: 'GOLDT1 - DEV', soldHours: 120 }, { role: 'GOLDT3 - PM', soldHours: 30 }] },
    { name: 'Overrun', startDate: compact(plus(-30)), endDate: compact(plus(30)), resources: [{ role: 'GOLDT1 - DEV', soldHours: 5 }] }, // over-consumed
  ]);
  await mkProject('GOLD-C', 'GOLD Gamma one', plus(-10), plus(90), [
    { name: 'Shared', startDate: compact(plus(-5)), endDate: compact(plus(80)), resources: [{ role: 'GOLDT1 - DEV', soldHours: 60 }] },
  ]);
  await mkProject('GOLD-C', 'GOLD Gamma two', plus(-10), plus(90), [                                  // same code: both see the rows
    { name: 'Shared', startDate: compact(plus(-5)), endDate: compact(plus(80)), resources: [{ role: 'GOLDT1 - DEV', soldHours: 40 }] },
  ]);

  // Actuals over the last 8 weeks, including a Sunday row, blank owner, an unmatched owner, an inactive owner, tiny hours.
  const owners = ['Ann Golden', 'Bob Golden', 'Cy Unmatched', ''];
  const rows = (code, taskRoles) => {
    const out = ['projectId,date,task,role,owner,hours'];
    for (let d = -55, i = 0; d <= -1; d += 3, i++) {
      const date = plus(d);
      const [task, role] = taskRoles[i % taskRoles.length];
      out.push(`${code},${ymd(date)},${task},${role},${owners[i % owners.length]},${(i % 5) + 1.5}`);
    }
    const sunday = plus(-7);
    while (sunday.getUTCDay() !== 0) sunday.setUTCDate(sunday.getUTCDate() - 1);
    out.push(`${code},${ymd(sunday)},${taskRoles[0][0]},${taskRoles[0][1]},Ann Golden,3`);   // Sunday row
    out.push(`${code},${ymd(plus(-4))},${taskRoles[0][0]},${taskRoles[0][1]},Ann Golden,0.2`); // tiny hours
    return out.join('\n');
  };
  let failed = false;
  for (const [code, tr] of [
    ['GOLD-A', [['Build', 'GOLDT1 - DEV'], ['Build', 'GOLDT2 - QA'], ['Design', 'GOLDT1 - DEV']]],
    ['GOLD-B', [['Build', 'GOLDT1 - DEV'], ['Overrun', 'GOLDT1 - DEV'], ['Build', 'GOLDT3 - PM']]],
    ['GOLD-C', [['Shared', 'GOLDT1 - DEV']]],
  ]) {
    const r = await upload(rows(code, tr), code);
    console.log(code, 'upload ->', r.status, r.status === 201 ? '' : JSON.stringify(r.data));
    if (r.status !== 201) failed = true;
  }
  if (failed) throw new Error('one or more uploads failed');
  console.log('seeded GOLD dataset');
}
main().catch(e => { console.error(e); process.exit(1); });
