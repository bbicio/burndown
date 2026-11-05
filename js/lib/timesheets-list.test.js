import { describe, it, expect } from 'vitest';
import {
  filterTimesheetRows, hasActiveFilters, nextSortState, groupTimesheetRows, NO_CLIENT_LABEL, filterOptions,
} from './timesheets-list.js';

const row = (project_code, client_name, project_name, total_rows = 1, pipeline_year = 2026) =>
  ({ project_code, client_name, project_name, uploads: 1, total_rows, pipeline_year });

const ROWS = [
  row('MITA.000001201', 'Bayer AG', 'BERMITS Maintenance 2026', 337),
  row('MITA.000001823.001', 'Menarini Ricerche', 'MEN 26 AURORA Overall', 24),
  row('MITA.000001823.003', 'Menarini Ricerche', 'MEN 26 AURORA Development', 1284, 2025),
  row('ORPHAN.1', null, null, 7, null),
  row('MITA.000002033.001', 'SIFI Group', 'SIFI Spanish', 13),
  row('MITA.000002033.002', 'alfa Pharma', 'SIFI Italian', 5),
  row('MITA.000001586.001', 'Next Health Advisors', 'NH-26 Rankings', 28),
];

const labels = gs => gs.map(g => g.label);
const codes = g => g.rows.map(r => r.project_code);

describe('groupTimesheetRows', () => {
  it('orders groups alphabetically, case-insensitively, with No client last', () => {
    const gs = groupTimesheetRows(ROWS);
    expect(labels(gs)).toEqual(['alfa Pharma', 'Bayer AG', 'Menarini Ricerche', 'Next Health Advisors', 'SIFI Group', NO_CLIENT_LABEL]);
    expect(NO_CLIENT_LABEL).toBe('No client');
    expect(gs.at(-1).key).toBe('');
  });

  it('sums rows and counts codes per group', () => {
    const men = groupTimesheetRows(ROWS).find(g => g.label === 'Menarini Ricerche');
    expect(men.codes).toBe(2);
    expect(men.totalRows).toBe(1308);
  });

  it('keeps the input order inside a group without a sort', () => {
    const rows = [row('B.2', 'X', 'b'), row('A.1', 'X', 'a')];
    expect(codes(groupTimesheetRows(rows)[0])).toEqual(['B.2', 'A.1']);
  });

  it('reverses the groups on a descending client sort, No client still last', () => {
    const gs = groupTimesheetRows(ROWS, { sortBy: 'client_name', sortDir: 'desc' });
    expect(labels(gs)).toEqual(['SIFI Group', 'Next Health Advisors', 'Menarini Ricerche', 'Bayer AG', 'alfa Pharma', NO_CLIENT_LABEL]);
  });

  it('sorts rows inside each group by project or code without moving the groups', () => {
    const asc = groupTimesheetRows(ROWS, { sortBy: 'project_name', sortDir: 'asc' });
    const desc = groupTimesheetRows(ROWS, { sortBy: 'project_name', sortDir: 'desc' });
    expect(labels(asc)).toEqual(labels(groupTimesheetRows(ROWS)));
    expect(labels(desc)).toEqual(labels(groupTimesheetRows(ROWS)));
    const men = gs => codes(gs.find(g => g.label === 'Menarini Ricerche'));
    expect(men(asc)).toEqual(['MITA.000001823.003', 'MITA.000001823.001']);
    expect(men(desc)).toEqual(['MITA.000001823.001', 'MITA.000001823.003']);
    const byCode = groupTimesheetRows([row('A.10', 'X', 'p'), row('A.9', 'X', 'q')], { sortBy: 'project_code', sortDir: 'asc' });
    expect(codes(byCode[0])).toEqual(['A.10', 'A.9']);
  });

  it('puts a missing project name last in both directions', () => {
    const rows = [row('N.1', 'X', null), row('A.1', 'X', 'alpha'), row('Z.1', 'X', 'zulu')];
    expect(codes(groupTimesheetRows(rows, { sortBy: 'project_name', sortDir: 'asc' })[0])).toEqual(['A.1', 'Z.1', 'N.1']);
    expect(codes(groupTimesheetRows(rows, { sortBy: 'project_name', sortDir: 'desc' })[0])).toEqual(['Z.1', 'A.1', 'N.1']);
  });

  it('drops a group the filters emptied and counts only the filtered codes', () => {
    const gs = groupTimesheetRows(filterTimesheetRows(ROWS, { year: 2026 }));
    expect(labels(gs)).not.toContain(NO_CLIENT_LABEL);
    const men = gs.find(g => g.label === 'Menarini Ricerche');
    expect(men.codes).toBe(1);
    expect(men.totalRows).toBe(24);
  });

  it('returns no groups for no rows', () => {
    expect(groupTimesheetRows([])).toEqual([]);
  });
});

describe('filterTimesheetRows', () => {
  it('applies no filter by default and year 0 means all years', () => {
    expect(filterTimesheetRows(ROWS, {})).toHaveLength(ROWS.length);
    expect(filterTimesheetRows(ROWS, { year: 0 })).toHaveLength(ROWS.length);
  });
  it('filters by pipeline year, client, project and code', () => {
    expect(filterTimesheetRows(ROWS, { year: 2025 }).map(r => r.project_code)).toEqual(['MITA.000001823.003']);
    expect(filterTimesheetRows(ROWS, { clients: ['Bayer AG'] }).map(r => r.project_code)).toEqual(['MITA.000001201']);
    expect(filterTimesheetRows(ROWS, { projects: ['SIFI Italian'] }).map(r => r.project_code)).toEqual(['MITA.000002033.002']);
    expect(filterTimesheetRows(ROWS, { code: 'mita.000001201' }).map(r => r.project_code)).toEqual(['MITA.000001201']);
    expect(filterTimesheetRows(ROWS, { code: '2033' })).toHaveLength(2);
    expect(filterTimesheetRows(ROWS, { clients: ['Bayer AG'], code: '1823' })).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false with every filter empty and year 0', () => {
    expect(hasActiveFilters({ year: 0, clients: [], projects: [], code: '' })).toBe(false);
  });
  it.each([
    [{ year: 2026, clients: [], projects: [], code: '' }],
    [{ year: 0, clients: ['X'], projects: [], code: '' }],
    [{ year: 0, clients: [], projects: ['P'], code: '' }],
    [{ year: 0, clients: [], projects: [], code: 'a' }],
  ])('is true for %j', f => { expect(hasActiveFilters(f)).toBe(true); });
});

describe('nextSortState', () => {
  it('cycles asc → desc → none, and restarts asc on another field', () => {
    let s = { sortBy: null, sortDir: 'asc' };
    s = nextSortState(s, 'client_name'); expect(s).toEqual({ sortBy: 'client_name', sortDir: 'asc' });
    s = nextSortState(s, 'client_name'); expect(s).toEqual({ sortBy: 'client_name', sortDir: 'desc' });
    s = nextSortState(s, 'client_name'); expect(s).toEqual({ sortBy: null, sortDir: 'asc' });
    expect(nextSortState({ sortBy: 'client_name', sortDir: 'desc' }, 'project_code')).toEqual({ sortBy: 'project_code', sortDir: 'asc' });
  });
});

describe('filterOptions', () => {
  it('lists distinct non-empty values in the same case-insensitive order as the groups', () => {
    expect(filterOptions(ROWS, 'client_name')).toEqual(['alfa Pharma', 'Bayer AG', 'Menarini Ricerche', 'Next Health Advisors', 'SIFI Group']);
    expect(filterOptions([row('A', null, 'b'), row('B', 'X', 'B'), row('C', 'X', 'a')], 'project_name')).toEqual(['a', 'b', 'B']);
  });
});
