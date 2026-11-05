import { describe, it, expect } from 'vitest';
import { deriveDistribution, reforecastDistribution, isProjectDirty, keepDistribution, spreadEvenly, splitState, phasingBalance } from './config-form-calc.js';

describe('isProjectDirty', () => {
  const p = { id: 'x', name: 'A', tasks: [{ name: 't', resources: [] }], phasing: { '202601': 10 } };
  it('is false when the project equals the snapshot', () => {
    expect(isProjectDirty(JSON.stringify(p), JSON.parse(JSON.stringify(p)))).toBe(false);
  });
  it('is true after any change, including nested ones', () => {
    const q = JSON.parse(JSON.stringify(p));
    q.phasing['202601'] = 11;
    expect(isProjectDirty(JSON.stringify(p), q)).toBe(true);
    const r = JSON.parse(JSON.stringify(p));
    r.tasks.push({ name: 'u', resources: [] });
    expect(isProjectDirty(JSON.stringify(p), r)).toBe(true);
  });
  it('is false when there is no snapshot or no project', () => {
    expect(isProjectDirty(null, p)).toBe(false);
    expect(isProjectDirty(JSON.stringify(p), null)).toBe(false);
  });
});

describe('deriveDistribution', () => {
  it('distributes a single-month task fully into that month', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260131',
      resources: [{ soldHours: 10, hourlyRate: 100 }],
    }];
    const result = deriveDistribution(tasks, ['202601'], '202601', '202601');
    expect(result.newPhasing['202601']).toBe(1000);
    expect(result.newPlanning['202601']).toBe(10);
    expect(result.totalBudget).toBe(1000);
    expect(result.totalHours).toBe(10);
  });

  it('splits a task spanning two equal-length months roughly in half by day-overlap', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260228',
      resources: [{ soldHours: 28, hourlyRate: 100 }],
    }];
    const result = deriveDistribution(tasks, ['202601', '202602'], '202601', '202602');
    // Jan has 31 days, Feb has 28 — task spans exactly Jan 1 to Feb 28 (59 days total)
    expect(result.newPlanning['202601'] + result.newPlanning['202602']).toBeCloseTo(28, 5);
    expect(result.newPlanning['202601']).toBeGreaterThan(result.newPlanning['202602']);
  });

  it('uses monthlyDistribution percentages when they sum to ~100', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260228',
      monthlyDistribution: { '202601': 30, '202602': 70 },
      resources: [{ soldHours: 100, hourlyRate: 10 }],
    }];
    const result = deriveDistribution(tasks, ['202601', '202602'], '202601', '202602');
    expect(result.newPhasing['202601']).toBe(300);
    expect(result.newPhasing['202602']).toBe(700);
  });

  it('declares the part of a task outside the months as outsideBudget/outsideHours', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260315', endDate: '20260414',
      resources: [{ soldHours: 31, hourlyRate: 100 }],
    }];
    const result = deriveDistribution(tasks, ['202604'], '202604', '202604');
    expect(result.totalBudget + result.outsideBudget).toBeCloseTo(3100, 2);
    expect(result.outsideHours).toBeCloseTo(17, 5);
  });

  it('declares nothing outside when the task fits, or has a valid monthlyDistribution', () => {
    const fits = [{ startDate: '20260401', endDate: '20260430', resources: [{ soldHours: 10, hourlyRate: 10 }] }];
    expect(deriveDistribution(fits, ['202604'], '202604', '202604').outsideHours).toBe(0);
    const dist = [{ startDate: '20260315', endDate: '20260414', monthlyDistribution: { '202604': 100 }, resources: [{ soldHours: 10, hourlyRate: 10 }] }];
    expect(deriveDistribution(dist, ['202604'], '202604', '202604').outsideBudget).toBe(0);
  });

  it('rounds every month to digits', () => {
    const tasks = [{
      startDate: '20260115', endDate: '20260320',
      resources: [{ soldHours: 7, hourlyRate: 143.37 }],
    }];
    const months = ['202601', '202602', '202603'];
    const two = deriveDistribution(tasks, months, '202601', '202603', 2).newPhasing;
    Object.values(two).forEach(v => expect(v).toBe(Math.round(v * 100) / 100));
    const zero = deriveDistribution(tasks, months, '202601', '202603', 0).newPhasing;
    expect(Object.keys(zero).length).toBe(3);
    Object.values(zero).forEach(v => expect(Number.isInteger(v)).toBe(true));
    expect(Object.values(two).some(v => !Number.isInteger(v))).toBe(true);
  });

  it('excludes non-billable tasks', () => {
    const tasks = [{
      name: 'Dev', billable: false,
      startDate: '20260101', endDate: '20260131',
      resources: [{ soldHours: 10, hourlyRate: 100 }],
    }];
    // Caller is responsible for filtering billable:true tasks before calling —
    // this function assumes the caller already filtered, per cfgDerivePhasing's
    // existing `.filter(t => t.billable !== false)` at the call site.
    const result = deriveDistribution(tasks.filter(t => t.billable !== false), ['202601'], '202601', '202601');
    expect(result.newPhasing).toEqual({});
  });
});

describe('reforecastDistribution', () => {
  it('replaces past months with exact actuals and splits remaining budget across future months', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260331',
      resources: [{ role: 'Developer', soldHours: 30, hourlyRate: 100 }],
    }];
    const actualsRows = [
      { task: 'Dev', role: 'Developer', date: '2026-01-15', hours: 10 },
    ];
    const result = reforecastDistribution(tasks, ['202601', '202602', '202603'], actualsRows, '202602');
    // January (past): exact actuals — 10h × €100 = €1000
    expect(result.newPlanning['202601']).toBe(10);
    expect(result.newPhasing['202601']).toBe(1000);
    // Remaining 20h / €2000 split across Feb+Mar (2 future months, even split, no monthlyDistribution)
    expect(result.newPlanning['202602'] + result.newPlanning['202603']).toBeCloseTo(20, 5);
  });

  it('characterization: no overrun, no distribution, no current-month rows', () => {
    const tasks = [
      { name: 'Dev', billable: true, startDate: '20260101', endDate: '20260430',
        resources: [{ role: 'Developer', soldHours: 40, hourlyRate: 100 }] },
      { name: 'QA', billable: true, startDate: '20260201', endDate: '20260430',
        resources: [{ role: 'Tester', soldHours: 20, hourlyRate: 50 }] },
    ];
    const actualsRows = [
      { task: 'Dev', role: 'Developer', date: '2026-01-10', hours: 10 },
      { task: 'Dev', role: 'Developer', date: '2026-02-10', hours: 5 },
      { task: 'QA', role: 'Tester', date: '2026-02-12', hours: 4 },
    ];
    const r = reforecastDistribution(tasks, ['202601', '202602', '202603', '202604'], actualsRows, '202603');
    expect(r.newPhasing).toEqual({ '202601': 1000, '202602': 700, '202603': 1650, '202604': 1650 });
    expect(r.newPlanning).toEqual({ '202601': 10, '202602': 9, '202603': 20.5, '202604': 20.5 });
  });

  it('rounds past months too, to digits', () => {
    const tasks = [{
      name: 'Dev', billable: true,
      startDate: '20260101', endDate: '20260331',
      resources: [{ role: 'Developer', soldHours: 30, hourlyRate: 100 / 3 }],
    }];
    const actualsRows = [{ task: 'Dev', role: 'Developer', date: '2026-01-15', hours: 10 }];
    const months = ['202601', '202602', '202603'];
    const two = reforecastDistribution(tasks, months, actualsRows, '202602', 2).newPhasing;
    expect(Object.keys(two)).toContain('202601');
    Object.values(two).forEach(v => expect(v).toBe(Math.round(v * 100) / 100));
    const zero = reforecastDistribution(tasks, months, actualsRows, '202602', 0).newPhasing;
    Object.values(zero).forEach(v => expect(Number.isInteger(v)).toBe(true));
  });

  const row = (task, role, ym, hours) => ({ task, role, date: `${ym.slice(0, 4)}-${ym.slice(4, 6)}-15`, hours });
  const dev = (soldHours, startDate, endDate, extra = {}) => ({
    name: 'Dev', billable: true, startDate, endDate,
    resources: [{ role: 'Developer', soldHours, hourlyRate: extra.rate ?? 100 }], ...extra.task,
  });

  it('writes true actuals for an overrun task', () => {
    const tasks = [dev(5, '20260101', '20260131')];
    const result = reforecastDistribution(tasks, ['202601'], [row('Dev', 'Developer', '202601', 20)], '202602');
    expect(result.newPlanning['202601']).toBe(20);
    expect(result.newPhasing['202601']).toBe(2000);
    expect(result.overBudget).toBe(true);
    expect(result.remainingBudget).toBe(0);
  });

  it('distributes the share by the open-month percentages', () => {
    const tasks = [dev(100, '20260101', '20260331', { rate: 10, task: { monthlyDistribution: { '202601': 20, '202602': 30, '202603': 50 } } })];
    const result = reforecastDistribution(tasks, ['202601', '202602', '202603'], [row('Dev', 'Developer', '202601', 10)], '202602');
    expect(result.distError).toBeNull();
    expect(result.newPhasing).toEqual({ '202601': 100, '202602': 337.5, '202603': 562.5 });
    expect(result.newPlanning['202602'] + result.newPlanning['202603']).toBeCloseTo(90, 5);
  });

  it("nets an overrun against another task's margin", () => {
    const tasks = [
      dev(10, '20260101', '20260331'),
      { name: 'QA', billable: true, startDate: '20260101', endDate: '20260331', resources: [{ role: 'Tester', soldHours: 20, hourlyRate: 50 }] },
    ];
    const rows = [row('Dev', 'Developer', '202601', 15), row('QA', 'Tester', '202602', 4)];
    const result = reforecastDistribution(tasks, ['202601', '202602', '202603'], rows, '202603');
    expect(result.newPhasing).toEqual({ '202601': 1500, '202602': 200, '202603': 300 });
    expect(result.newPlanning['202603']).toBe(11);
    expect(result.remainingBudget).toBe(300);
    expect(result.remainingHours).toBe(11);
  });

  it("splits the net remaining in proportion to each task's margin", () => {
    const t = (name, soldHours, endDate) => ({ name, billable: true, startDate: '20260101', endDate, resources: [{ role: 'Developer', soldHours, hourlyRate: 100 }] });
    const tasks = [t('A', 40, '20260228'), t('B', 20, '20260331'), t('C', 10, '20260131')];
    const rows = [row('A', 'Developer', '202601', 10), row('B', 'Developer', '202601', 10), row('C', 'Developer', '202601', 20)];
    const result = reforecastDistribution(tasks, ['202601', '202602', '202603'], rows, '202602');
    expect(result.newPhasing['202602']).toBe(2625);
    expect(result.newPhasing['202603']).toBe(375);
    expect(result.newPlanning['202602']).toBe(26.25);
    expect(result.newPlanning['202603']).toBe(3.75);
  });

  it('project overrun leaves open months empty', () => {
    const tasks = [dev(10, '20260101', '20260228')];
    const result = reforecastDistribution(tasks, ['202601', '202602'], [row('Dev', 'Developer', '202601', 15)], '202602');
    expect(result.newPhasing).toEqual({ '202601': 1500 });
    expect(result.overBudget).toBe(true);
    expect(result.overHours).toBe(true);
    expect(result.consumedBudget).toBe(1500);
    expect(result.soldBudget).toBe(1000);
    expect(result.remainingBudget).toBe(0);
  });

  it('counts current-month actuals in their month', () => {
    const tasks = [dev(20, '20260101', '20260228')];
    const result = reforecastDistribution(tasks, ['202601', '202602'], [row('Dev', 'Developer', '202602', 5)], '202602');
    expect(result.newPhasing).toEqual({ '202602': 2000 });
    expect(result.newPlanning).toEqual({ '202602': 20 });
    expect(result.remainingHours).toBe(15);
  });

  it('nets a negative correction row inside its month', () => {
    const tasks = [dev(10, '20260101', '20260228')];
    const rows = [row('Dev', 'Developer', '202601', 5), row('Dev', 'Developer', '202601', -2)];
    const result = reforecastDistribution(tasks, ['202601', '202602'], rows, '202602');
    expect(result.newPlanning).toEqual({ '202601': 3, '202602': 7 });
    expect(result.newPhasing).toEqual({ '202601': 300, '202602': 700 });
  });

  it('reports the distributed net remaining hours without open-month actuals', () => {
    const tasks = [dev(20, '20260101', '20260228')];
    const open = reforecastDistribution(tasks, ['202601', '202602'], [row('Dev', 'Developer', '202602', 5)], '202602');
    expect(open.distributedRemainingHours).toBe(15);
    const over = reforecastDistribution(tasks, ['202601', '202602'],
      [row('Dev', 'Developer', '202601', 24), row('Dev', 'Developer', '202602', 3)], '202602');
    expect(over.distributedRemainingHours).toBe(0);
    expect(over.overHours).toBe(true);
  });

  it("values a missing role at the task's first resource rate", () => {
    const tasks = [{ name: 'Dev', billable: true, startDate: '20260101', endDate: '20260228',
      resources: [{ role: 'Developer', soldHours: 10, hourlyRate: 100 }, { role: 'Senior', soldHours: 5, hourlyRate: 150 }] }];
    const result = reforecastDistribution(tasks, ['202601', '202602'], [row('Dev', 'Intern', '202601', 2)], '202602');
    expect(result.newPhasing['202601']).toBe(200);
    expect(result.consumedBudget).toBe(200);
  });

  it("moves an ended task's margin to the open tasks", () => {
    const t = (name, endDate) => ({ name, billable: true, startDate: '20260101', endDate, resources: [{ role: 'Developer', soldHours: 10, hourlyRate: 100 }] });
    const result = reforecastDistribution([t('A', '20260131'), t('B', '20260228')], ['202601', '202602'], [row('A', 'Developer', '202601', 4)], '202602');
    expect(result.newPhasing['202602']).toBe(1600);
    expect(result.newPlanning['202602']).toBe(16);
  });

  it('spreads the net remaining over open project months when no task can receive it', () => {
    const tasks = [{ name: 'A', billable: true, startDate: '20260101', endDate: '20260131', resources: [{ role: 'Developer', soldHours: 10, hourlyRate: 100 }] }];
    const result = reforecastDistribution(tasks, ['202601', '202602'], [row('A', 'Developer', '202601', 4)], '202602');
    expect(result.newPhasing['202602']).toBe(600);
    expect(result.newPlanning['202602']).toBe(6);
  });

  it('counts rows outside the months without writing them', () => {
    const tasks = [dev(10, '20260101', '20260228')];
    const rows = [{ task: 'Dev', role: 'Developer', date: '2025-12-10', hours: 3 }];
    const result = reforecastDistribution(tasks, ['202601', '202602'], rows, '202601');
    expect(result.newPhasing).not.toHaveProperty('202512');
    expect(result.consumedHours).toBe(3);
    expect(result.newPlanning['202601'] + result.newPlanning['202602']).toBeCloseTo(7, 5);
  });

  it('zero-resource task yields no NaN', () => {
    const tasks = [dev(20, '20260101', '20260228'), { name: 'Empty', billable: true, startDate: '20260101', endDate: '20260228', resources: [] }];
    const rows = [row('Dev', 'Developer', '202602', 5), row('Empty', 'x', '202602', 1)];
    const result = reforecastDistribution(tasks, ['202601', '202602'], rows, '202602');
    [...Object.values(result.newPhasing), ...Object.values(result.newPlanning)].forEach(v => expect(Number.isFinite(v)).toBe(true));
    expect(result.newPhasing).toEqual({ '202602': 2000 });
    expect(result.newPlanning).toEqual({ '202602': 20 });
    expect(result.remainingHours).toBe(14);
  });

  it('distribution with zero open-month percentages splits evenly', () => {
    const tasks = [dev(100, '20260101', '20260331', { rate: 10, task: { monthlyDistribution: { '202601': 100, '202602': 0, '202603': 0 } } })];
    const result = reforecastDistribution(tasks, ['202601', '202602', '202603'], [], '202602');
    expect(result.newPhasing).toEqual({ '202602': 500, '202603': 500 });
  });

  it('ignores rows without a date', () => {
    const tasks = [dev(20, '20260101', '20260228')];
    const rows = [row('Dev', 'Developer', '202602', 5)];
    const without = reforecastDistribution(tasks, ['202601', '202602'], rows, '202602');
    const withUndated = reforecastDistribution(tasks, ['202601', '202602'], [...rows, { task: 'Dev', role: 'Developer', hours: 50 }], '202602');
    expect(withUndated).toEqual(without);
  });

  it('BERMITS Maintenance 2026: past = actuals, open = net remaining', () => {
    const months = ['202512', '202601', '202602', '202603', '202604', '202605', '202606', '202607', '202608', '202609', '202610', '202611', '202612'];
    const t = (name, resources) => ({ name, billable: true, startDate: '20251201', endDate: '20261231', monthlyDistribution: {},
      resources: resources.map(([role, soldHours, hourlyRate]) => ({ role, soldHours, hourlyRate })) });
    const tasks = [
      t('Overall Coordination', [['HWGACCSVS - DIRECTOR', 20, 168]]),
      t('Project Management', [['HWGINTERN - ACCSVS', 40, 130], ['HWGACCSVS - DIRECTOR', 75, 130], ['HWGACCSVS - MARKETING COORDINATOR', 5, 130]]),
      t('Content Management', [['HWGDEV - DEVELOPER', 10, 115], ['CPROD - HWGCREAT - CONTENT SPECIALIST', 282, 115]]),
      t('FE / BE Development', [['HWGDEV - DEVELOPER', 32, 100]]),
      t('Quality Assurance', [['HWGINTERN - ACCSVS', 7.5, 105], ['HWGACCSVS - DIRECTOR', 24.5, 105]]),
      t('Artwork for QR Code', [['CPROD - HWGCRSVS - STUDIO DIRECTOR', 8, 115]]),
    ];
    const BERMITS_ROWS = [["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202512",0.5],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202602",1.25],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202604",0.75],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202606",1.5],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202607",1],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202608",2],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202609",1],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202512",5],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202601",10.5],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202602",8.75],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202603",20.25],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202604",26.75],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202605",33],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202606",24],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202607",14.5],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202608",21.75],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202609",7.5],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202610",21],["Content Management","HWGDEV - DEVELOPER","202607",9],["FE / BE Development","HWGDEV - DEVELOPER","202512",2],["FE / BE Development","HWGDEV - DEVELOPER","202602",13],["FE / BE Development","HWGDEV - DEVELOPER","202603",9],["FE / BE Development","HWGDEV - DEVELOPER","202604",8.5],["FE / BE Development","HWGDEV - DEVELOPER","202605",7],["FE / BE Development","HWGDEV - DEVELOPER","202606",4],["FE / BE Development","HWGDEV - DEVELOPER","202607",9],["FE / BE Development","HWGDEV - DEVELOPER","202608",5],["FE / BE Development","HWGDEV - DEVELOPER","202609",2.5],["FE / BE Development","HWGDEV - DEVELOPER","202610",6],["Overall coordination","HWGACCSVS - DIRECTOR","202512",0.5],["Overall coordination","HWGACCSVS - DIRECTOR","202601",1.5],["Overall coordination","HWGACCSVS - DIRECTOR","202602",1],["Overall coordination","HWGACCSVS - DIRECTOR","202603",1.5],["Overall coordination","HWGACCSVS - DIRECTOR","202604",4],["Overall coordination","HWGACCSVS - DIRECTOR","202605",4],["Overall coordination","HWGACCSVS - DIRECTOR","202606",4],["Overall coordination","HWGACCSVS - DIRECTOR","202607",2],["Overall coordination","HWGACCSVS - DIRECTOR","202608",0.5],["Overall coordination","HWGACCSVS - DIRECTOR","202609",3],["Overall coordination","HWGACCSVS - DIRECTOR","202610",0.5],["Project Management","HWGACCSVS - DIRECTOR","202604",6],["Project Management","HWGACCSVS - DIRECTOR","202605",13.5],["Project Management","HWGACCSVS - DIRECTOR","202606",4.5],["Project Management","HWGACCSVS - DIRECTOR","202607",7.5],["Project Management","HWGACCSVS - DIRECTOR","202608",6.5],["Project Management","HWGACCSVS - DIRECTOR","202609",9.5],["Project Management","HWGACCSVS - DIRECTOR","202610",7],["Project Management","HWGACCSVS - MARKETING COORDINATOR","202607",2.5],["Project Management","HWGACCSVS - MARKETING COORDINATOR","202608",2],["Project Management","HWGINTERN - ACCSVS","202512",2.25],["Project Management","HWGINTERN - ACCSVS","202601",6.5],["Project Management","HWGINTERN - ACCSVS","202602",15],["Project Management","HWGINTERN - ACCSVS","202603",13],["Quality Assurance","HWGACCSVS - DIRECTOR","202606",13.5],["Quality Assurance","HWGACCSVS - DIRECTOR","202609",1],["Quality Assurance","HWGACCSVS - DIRECTOR","202610",0.5],["Quality Assurance","HWGINTERN - ACCSVS","202512",0.25],["Quality Assurance","HWGINTERN - ACCSVS","202601",3.75],["Quality Assurance","HWGINTERN - ACCSVS","202602",0.5],["Quality Assurance","HWGINTERN - ACCSVS","202603",3]];
    const rows = BERMITS_ROWS.map(([task, role, ym, hours]) => row(task, role, ym, hours));
    const result = reforecastDistribution(tasks, months, rows, '202611', 2);
    const sum = (obj, pred) => Object.entries(obj).filter(([ym]) => pred(ym)).reduce((s, [, v]) => s + v, 0);
    expect(sum(result.newPhasing, ym => ym < '202611')).toBeCloseTo(49340, 2);
    expect(sum(result.newPlanning, ym => ym < '202611')).toBe(416.75);
    expect(result.newPhasing['202611'] + result.newPhasing['202612']).toBeCloseTo(10680, 2);
    expect(result.newPlanning['202611'] + result.newPlanning['202612']).toBe(87.25);
    expect(result.remainingBudget).toBeCloseTo(10680, 2);
    expect(result.overBudget).toBe(false);
  });
});

describe('keepDistribution', () => {
  const d = { 202601: 40, 202602: 60 };
  it('keeps the distribution when the month list is empty (inverted range)', () => {
    expect(keepDistribution(d, [], true)).toEqual({ 202601: 40, 202602: 60 });
  });
  it('resets the distribution when the month list is empty because a date was cleared', () => {
    expect(keepDistribution(d, [])).toEqual({});
  });
  it('sets a single month to 100', () => {
    expect(keepDistribution(d, ['202602'])).toEqual({ 202602: 100 });
  });
  it('keeps only the months present in the range', () => {
    expect(keepDistribution(d, ['202601', '202602', '202603'])).toEqual({ 202601: 40, 202602: 60 });
  });
  it('returns an empty object for no distribution', () => {
    expect(keepDistribution(undefined, ['202601', '202602'])).toEqual({});
  });
});

describe('spreadEvenly', () => {
  it('gives every month two decimals and the last one the remainder', () => {
    expect(spreadEvenly([])).toEqual({});
    expect(spreadEvenly(['202601'])).toEqual({ '202601': 100 });
    expect(spreadEvenly(['202601', '202602', '202603'])).toEqual({ '202601': 33.33, '202602': 33.33, '202603': 33.34 });
    const m13 = Array.from({ length: 13 }, (_, i) => 'm' + i);
    const d13 = spreadEvenly(m13);
    expect(Object.values(d13).slice(0, 12).every(v => v === 7.69)).toBe(true);
    expect(d13[m13[12]]).toBe(7.72);
  });
  it('sums to 100 within 0.005 for 1 to 24 months', () => {
    for (let n = 1; n <= 24; n++) {
      const ms = Array.from({ length: n }, (_, i) => 'm' + i);
      const s = Object.values(spreadEvenly(ms)).reduce((a, b) => a + b, 0);
      expect(Math.abs(s - 100)).toBeLessThan(0.005);
    }
  });
});

describe('splitState', () => {
  const ms = ['202601', '202602'];
  it('labels an empty split', () => {
    expect(splitState({}, ms)).toMatchObject({ sum: 0, valid: false, label: 'Not split · 100% missing', tone: 'warn' });
    expect(splitState(null, ms).label).toBe('Not split · 100% missing');
  });
  it('is 100% within 0.05 and valid within 0.5', () => {
    expect(splitState({ '202601': 50, '202602': 50 }, ms)).toMatchObject({ valid: true, label: '100%', tone: 'ok' });
    expect(splitState({ '202601': 49.98, '202602': 50 }, ms)).toMatchObject({ valid: true, label: '100%', tone: 'ok' });
    expect(splitState({ '202601': 49.6, '202602': 50 }, ms)).toMatchObject({ valid: true, label: '0.4% missing', tone: 'warn' });
  });
  it('flags too much and missing', () => {
    expect(splitState({ '202601': 51, '202602': 50 }, ms)).toMatchObject({ valid: false, label: '1.0% too much', tone: 'danger' });
    expect(splitState({ '202601': 50 }, ms)).toMatchObject({ valid: false, label: '50.0% missing', tone: 'warn' });
  });
  it('counts only the months in range', () => {
    expect(splitState({ '202601': 50, '209912': 50 }, ms).sum).toBe(50);
  });
});

describe('phasingBalance', () => {
  it('compares within half a unit of the last decimal', () => {
    expect(phasingBalance(60020, 60020, 2)).toEqual({ balanced: true, diff: 0 });
    expect(phasingBalance(60019.996, 60020, 2).balanced).toBe(true);
    expect(phasingBalance(60019.99, 60020, 2)).toEqual({ balanced: false, diff: 0.01 });
    expect(phasingBalance(999, 1000, 0)).toEqual({ balanced: false, diff: 1 });
    expect(phasingBalance(1000.4, 1000, 0).balanced).toBe(true);
    expect(phasingBalance(1200, 1000, 2)).toEqual({ balanced: false, diff: -200 });
  });
  it('allows the per-month rounding of a derived series (half a unit per month)', () => {
    // Review finding 1: Derive rounds each month on its own, so 12 months can drift by up to 6 half-cents.
    expect(phasingBalance(17426.41, 17426.425, 2, 12).balanced).toBe(true);
    expect(phasingBalance(994.01, 1000, 0, 12).balanced).toBe(true);
    expect(phasingBalance(993, 1000, 0, 12).balanced).toBe(false);
    expect(phasingBalance(999, 1000, 0, 1).balanced).toBe(false);
    expect(phasingBalance(17426.41, 17426.425, 2).balanced).toBe(false);
  });
});
