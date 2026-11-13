'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./seed-smoke-data');

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const iso = (d) => d.toISOString().slice(0, 10);
const TODAYS = [utc(2026, 12, 31), utc(2027, 1, 1), utc(2026, 3, 15)];
const PROJECTS = ['SMK-NIM', 'SMK-ORC', 'SMK-QSR'];

test('expected: counts and budgets of the fixed dataset', () => {
  const e = D.expected(utc(2026, 3, 15));
  assert.deepEqual(
    { clients: e.clients, roles: e.roles, resources: e.resources, offers: e.offers, projects: e.projects, programs: e.programs, pots: e.pots },
    { clients: 3, roles: 4, resources: 6, offers: 5, projects: 3, programs: 1, pots: 1 },
  );
  const orchid = 2 * (40 * 90 + 16 * 120 + 80 * 90 + 24 * 70 + 200 * 90 + 60 * 85 + 60 * 70 + 24 * 120);
  assert.equal(e.offerBudget['Project Orchid'], orchid);
  assert.equal(e.offerBudget['Project Lighthouse'], 44580);
  assert.equal(e.offerBudget['Project Quasar'], 55725);
  assert.equal(e.offerBudget['Project Nimbus'], 73557); // USD rates 99 / 77 / 132 / 93.5, hours x 1.5
});

test('expected: actuals rows per project follow the 3-day step from the day after the project start', () => {
  assert.deepEqual(D.expected(utc(2026, 3, 15)).actualsRows, { 'SMK-NIM': 10, 'SMK-ORC': 30, 'SMK-QSR': 20 });
});

test('offsetDate crosses a year end in UTC', () => {
  assert.equal(iso(D.offsetDate(utc(2026, 12, 31), 1)), '2027-01-01');
  assert.equal(iso(D.offsetDate(utc(2027, 3, 1), -1)), '2027-02-28');
});

test('taskPeriods: four consecutive slices that cover exactly the offer period, hours multiplied', () => {
  for (const today of TODAYS) {
    for (const offer of D.OFFERS) {
      const p = D.offerPeriod(offer, today);
      const slices = D.taskPeriods(offer, today);
      assert.equal(slices.length, 4);
      assert.equal(iso(slices[0].start), iso(p.start));
      assert.equal(iso(slices[3].end), iso(p.end));
      for (let i = 0; i < 3; i++) assert.equal(iso(D.offsetDate(slices[i].end, 1)), iso(slices[i + 1].start));
      for (const s of slices) assert.ok(s.start <= s.end);
    }
  }
  const quasar = D.OFFERS.find((o) => o.name === 'Project Quasar');
  const kickoff = D.taskPeriods(quasar, utc(2026, 3, 15))[0];
  assert.equal(kickoff.task, 'Kick-off');
  assert.deepEqual(kickoff.roles, [{ role: 'NOVA - DEV', hours: 50 }, { role: 'ORBIT - PM', hours: 20 }]);
});

test('buildActualsCsv: every row names a task and role of its project, inside that task\'s period', () => {
  for (const today of TODAYS) {
    for (const code of PROJECTS) {
      const offer = D.OFFERS.find((o) => o.projectCode === code);
      const slices = D.taskPeriods(offer, today);
      const [header, ...rows] = D.buildActualsCsv(code, today).split('\n');
      assert.equal(header, 'projectId,date,task,role,owner,hours');
      assert.equal(rows.length, D.expected(today).actualsRows[code]);
      for (const line of rows) {
        const [projectId, date, task, role, owner, hours] = line.split(',');
        assert.equal(projectId, code);
        assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
        const t = slices.find((s) => s.task === task && iso(s.start) <= date && date <= iso(s.end));
        assert.ok(t, `${code} ${date} ${task} is outside its task period`);
        assert.ok(t.roles.some((r) => r.role === role), `${code} ${task} has no role ${role}`);
        assert.ok(owner.length > 0);
        assert.ok(Number(hours) > 0);
      }
    }
  }
});

test('buildActualsCsv: owners cycle over the team then the unmatched name; the unmatched one appears', () => {
  const rows = D.buildActualsCsv('SMK-ORC', utc(2026, 3, 15)).split('\n').slice(1).map((l) => l.split(',')[4]);
  assert.deepEqual(rows.slice(0, 7), ['Lena Vask', 'Marco Tell', 'Iris Doon', 'Teo Brandt', 'Yara Quill', 'Otto Ferro', 'Zed Unlisted']);
});

test('checkTarget: only a local URL with an explicit port other than 80', () => {
  assert.deepEqual(D.checkTarget('http://localhost:8190'), { ok: true });
  assert.deepEqual(D.checkTarget('http://127.0.0.1:8190'), { ok: true });
  for (const bad of ['http://localhost', 'http://localhost:80', 'http://example.com:8190', 'not a url']) {
    const r = D.checkTarget(bad);
    assert.equal(r.ok, false, bad);
    assert.ok(r.error.length > 0);
  }
});

test('isEmptyDatabase: an offer or a client means not empty', () => {
  assert.equal(D.isEmptyDatabase({ offers: 0, clients: 0 }), true);
  assert.equal(D.isEmptyDatabase({ offers: 1, clients: 0 }), false);
  assert.equal(D.isEmptyDatabase({ offers: 0, clients: 2 }), false);
});
