'use strict';
// The fixed smoke dataset: constants, date helpers and the totals the seed script checks.
// Pure (no I/O); used by seed-smoke.js and tested by seed-smoke-data.test.js.

const GROUP = 'Northern Alliance';
const CLIENTS = [
  { name: 'Aurora Pharma', group: GROUP },
  { name: 'Borealis Foods', group: GROUP },
  { name: 'Cobalt Retail', group: null },
];

// code is "TEAM - ROLE"; rate is the EUR hourly rate; usdRate the explicit rate of the USD offer.
const ROLES = [
  { code: 'NOVA - DEV', label: 'Nova Developer', team: 'NOVA', rate: 90, usdRate: 99 },
  { code: 'NOVA - QA', label: 'Nova Tester', team: 'NOVA', rate: 70, usdRate: 77 },
  { code: 'ORBIT - PM', label: 'Orbit Project Lead', team: 'ORBIT', rate: 120, usdRate: 132 },
  { code: 'ORBIT - DES', label: 'Orbit Designer', team: 'ORBIT', rate: 85, usdRate: 93.5 },
];

const TEAM = [
  { first: 'Lena', last: 'Vask', role: 'NOVA - DEV', active: true },
  { first: 'Marco', last: 'Tell', role: 'NOVA - DEV', active: true },
  { first: 'Iris', last: 'Doon', role: 'NOVA - QA', active: true },
  { first: 'Teo', last: 'Brandt', role: 'ORBIT - PM', active: true },
  { first: 'Yara', last: 'Quill', role: 'ORBIT - DES', active: true },
  { first: 'Otto', last: 'Ferro', role: 'ORBIT - DES', active: false },
].map((p) => ({ ...p, email: `${p.first}.${p.last}@smoke.test`.toLowerCase() }));
const UNMATCHED_OWNER = 'Zed Unlisted';

const USD_RATE = 1.1;
const PROGRAM = { id: 'HELIOS', name: 'Programme Helios' };
const POT = { client: 'Aurora Pharma', amount: 500000 };
const TAGS = { list: 'Market', items: ['Northland', 'Southland'] };

// Same layout in every offer; hours are multiplied per offer. Task periods are 4 slices in this order.
const LAYOUT = [
  { phase: 'Discovery', task: 'Kick-off', roles: [{ role: 'NOVA - DEV', hours: 40 }, { role: 'ORBIT - PM', hours: 16 }] },
  { phase: 'Discovery', task: 'Analysis', roles: [{ role: 'NOVA - DEV', hours: 80 }, { role: 'NOVA - QA', hours: 24 }] },
  { phase: 'Delivery', task: 'Build', roles: [{ role: 'NOVA - DEV', hours: 200 }, { role: 'ORBIT - DES', hours: 60 }] },
  { phase: 'Delivery', task: 'Acceptance', roles: [{ role: 'NOVA - QA', hours: 60 }, { role: 'ORBIT - PM', hours: 24 }] },
];

const OFFERS = [
  { name: 'Project Lighthouse', client: 'Aurora Pharma', stage: 'SIP', currency: 'EUR', factor: 1, startOffset: 10, endOffset: 200, projectCode: null, program: false, tag: null },
  { name: 'Project Meridian', client: 'Borealis Foods', stage: 'Expected', currency: 'EUR', factor: 1, startOffset: -10, endOffset: 190, projectCode: null, program: false, tag: null },
  { name: 'Project Nimbus', client: 'Cobalt Retail', stage: 'Anticipated', currency: 'USD', factor: 1.5, startOffset: -30, endOffset: 170, projectCode: 'SMK-NIM', program: false, tag: 'Southland' },
  { name: 'Project Orchid', client: 'Aurora Pharma', stage: 'Committed', currency: 'EUR', factor: 2, startOffset: -90, endOffset: 120, projectCode: 'SMK-ORC', program: true, tag: 'Northland' },
  { name: 'Project Quasar', client: 'Borealis Foods', stage: 'Committed', currency: 'EUR', factor: 1.25, startOffset: -60, endOffset: 150, projectCode: 'SMK-QSR', program: true, tag: 'Northland' },
];

const OWNERS = [...TEAM.map((p) => `${p.first} ${p.last}`), UNMATCHED_OWNER];
const HOURS = [2, 3.5, 4, 6, 1.5];
const DAY = 86400000;

const offsetDate = (today, days) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + days * DAY);
const ymd = (d) => d.toISOString().slice(0, 10);

const offerPeriod = (offer, today) => ({ start: offsetDate(today, offer.startOffset), end: offsetDate(today, offer.endOffset) });

function taskPeriods(offer, today) {
  const { start, end } = offerPeriod(offer, today);
  const total = Math.round((end - start) / DAY);
  const len = Math.floor(total / 4);
  return LAYOUT.map((t, i) => {
    const s = new Date(start.getTime() + i * len * DAY);
    const e = i === 3 ? end : new Date(start.getTime() + ((i + 1) * len - 1) * DAY);
    return { phase: t.phase, task: t.task, start: s, end: e, roles: t.roles.map((r) => ({ role: r.role, hours: r.hours * offer.factor })) };
  });
}

// Days from the day after the project start to yesterday, every 3 days.
function actualDates(offer, today) {
  const out = [];
  const last = offsetDate(today, -1);
  for (let d = offsetDate(offerPeriod(offer, today).start, 1); d <= last; d = new Date(d.getTime() + 3 * DAY)) out.push(d);
  return out;
}

function buildActualsCsv(projectCode, today) {
  const offer = OFFERS.find((o) => o.projectCode === projectCode);
  if (!offer) throw new Error(`unknown project code ${projectCode}`);
  const slices = taskPeriods(offer, today);
  const lines = ['projectId,date,task,role,owner,hours'];
  actualDates(offer, today).forEach((d, i) => {
    const pairs = slices.filter((s) => s.start <= d && d <= s.end).flatMap((s) => s.roles.map((r) => [s.task, r.role]));
    const [task, role] = pairs[i % pairs.length];
    lines.push([projectCode, ymd(d), task, role, OWNERS[i % OWNERS.length], HOURS[i % HOURS.length]].join(','));
  });
  return lines.join('\n');
}

function expected(today) {
  const rate = (offer, code) => { const r = ROLES.find((x) => x.code === code); return offer.currency === 'USD' ? r.usdRate : r.rate; };
  const offerBudget = {};
  for (const o of OFFERS) {
    offerBudget[o.name] = taskPeriods(o, today).reduce((sum, t) => sum + t.roles.reduce((s, r) => s + r.hours * rate(o, r.role), 0), 0);
  }
  const actualsRows = {};
  for (const o of OFFERS.filter((x) => x.projectCode)) actualsRows[o.projectCode] = actualDates(o, today).length;
  return {
    clients: CLIENTS.length, roles: ROLES.length, resources: TEAM.length, offers: OFFERS.length,
    projects: OFFERS.filter((o) => o.projectCode).length, programs: 1, pots: 1, actualsRows, offerBudget,
  };
}

function checkTarget(url) {
  let u;
  try { u = new URL(url); } catch { return { ok: false, error: `not a URL: ${url}` }; }
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) return { ok: false, error: 'the host must be localhost or 127.0.0.1' };
  if (!u.port || u.port === '80') return { ok: false, error: 'the URL needs an explicit port other than 80 (an isolated stack, never the main one)' };
  return { ok: true };
}

const isEmptyDatabase = ({ offers, clients }) => offers === 0 && clients === 0;

module.exports = {
  GROUP, CLIENTS, ROLES, TEAM, UNMATCHED_OWNER, USD_RATE, PROGRAM, POT, TAGS, LAYOUT, OFFERS,
  offsetDate, ymd, offerPeriod, taskPeriods, buildActualsCsv, expected, checkTarget, isEmptyDatabase,
};
