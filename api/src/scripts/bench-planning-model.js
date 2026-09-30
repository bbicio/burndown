'use strict';
const zlib = require('zlib');
const { getCalendarWeeks, isoDate } = require('../lib/planning-calendar');
const { groupActualsByProject, buildProjection } = require('../lib/planning-model');

const P = 200, TASKS = 5, ROLES = ['T1 - DEV', 'T2 - QA'], OWNERS = 150, ROWS = 1500;
const today = isoDate('2026-09-15');
const projects = Array.from({ length: P }, (_, p) => ({
  id: `p${p}`, code: `C${p}`, name: `Project ${p}`, startDate: '202606', endDate: '202703',
  tasks: Array.from({ length: TASKS }, (_, t) => ({
    name: `T${t}`, startDate: '20260701', endDate: '20270228', completed: false,
    monthlyDistribution: t % 2 ? { '202610': 50, '202611': 50 } : null,
    resources: ROLES.map(r => ({ role: r, soldHours: 100 + t * 10 })),
  })),
}));
const sheets = projects.map((p, pi) => ({
  project_code: p.code,
  data: Array.from({ length: ROWS }, (_, i) => ({
    date: new Date(Date.UTC(2026, 5, 1 + ((i * 7 + pi) % 105))).toISOString().slice(0, 10),
    role: ROLES[i % 2], task: `T${i % TASKS}`, owner: `Person ${(pi * 7 + i) % OWNERS}`, hours: (i % 7) + 1,
  })),
}));
let t = Date.now();
const actuals = groupActualsByProject(projects, sheets);
console.log(`group+normalise ${sheets.length * ROWS} rows: ${Date.now() - t} ms`);

const weeks = getCalendarWeeks(isoDate('2026-07-01'), isoDate('2026-12-31'), today);
const ownerStatus = {};
for (const view of ['role', 'project', 'owner']) {
  t = Date.now();
  const out = buildProjection(view, { projects, actuals, weeks, today, pulse: true, teams: new Set(), ownerStatus });
  const ms = Date.now() - t;
  const json = JSON.stringify(out);
  console.log(`${view.padEnd(8)} compute ${String(ms).padStart(6)} ms | json ${(json.length / 1e6).toFixed(2)} MB | gzip ${(zlib.gzipSync(json).length / 1e6).toFixed(2)} MB`);
}
