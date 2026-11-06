import { describe, it, expect } from 'vitest';
import {
  isAnonymized, displayName, initials, rowKind, primaryAction, menuGroups,
  statusCounts, filterUsers, sortUsers, nextSort, filterSummary, isValidEmail,
} from './user-admin-rules.js';

// What admin.html offered before this cycle, transcribed from its template.
function currentActions(u, me) {
  const out = new Set();
  const canModify = me.role === 'sysadmin' || u.role !== 'sysadmin';
  if (u.role !== 'sysadmin') out.add(u.role === 'admin' ? 'make-user' : 'make-admin');
  if (me.role === 'sysadmin' && u.role !== 'user') out.add(u.role === 'sysadmin' ? 'revoke-sysadmin' : 'grant-sysadmin');
  if (u.status === 'pending') out.add('resend');
  if (canModify) {
    out.add(u.status !== 'disabled' ? 'disable' : 'enable');
    if (u.status === 'disabled' && !u.email.startsWith('anon_')) out.add('anonymize');
  }
  return out;
}

const ME_ID = 'me-id';
const mk = (id, first, last, role, status, extra = {}) => ({
  id, first_name: first, last_name: last, email: `${id}@x.com`, role, status,
  created_at: '2026-01-01T00:00:00Z', invited_by_name: null, ...extra,
});
const enabledIds = (u, me) => new Set(
  menuGroups(u, me).flatMap(g => g.items).filter(i => i.enabled).map(i => i.id));
const item = (u, me, id) => menuGroups(u, me).flatMap(g => g.items).find(i => i.id === id);

describe('characterization', () => {
  it('enables exactly the actions the old page offered on normal rows', () => {
    for (const viewer of ['admin', 'sysadmin']) {
      for (const role of ['user', 'admin', 'sysadmin']) {
        for (const status of ['active', 'pending', 'disabled']) {
          const me = { id: ME_ID, role: viewer };
          const u = mk('u1', 'A', 'B', role, status);
          if (rowKind(u, me) !== 'normal') continue;
          expect(enabledIds(u, me), `${viewer} → ${role}/${status}`).toEqual(currentActions(u, me));
        }
      }
    }
  });

  it('drops the old actions on anonymized and locked rows', () => {
    const me = { id: ME_ID, role: 'sysadmin' };
    const anon = mk('u2', '[Deleted]', 'User', 'user', 'disabled', { email: 'anon_x@deleted.local' });
    expect(rowKind(anon, me)).toBe('anonymized');
    expect(menuGroups(anon, me)).toEqual([]);
    expect(primaryAction(anon, me)).toBeNull();
    const admin = { id: ME_ID, role: 'admin' };
    const sys = mk('u3', 'S', 'S', 'sysadmin', 'active');
    expect(rowKind(sys, admin)).toBe('locked');
    expect(menuGroups(sys, admin)).toEqual([]);
    expect(primaryAction(sys, admin)).toBeNull();
    expect(rowKind(mk(ME_ID, 'M', 'E', 'admin', 'active'), admin)).toBe('self');
  });

  it('gives self precedence over anonymized and anonymized over locked', () => {
    const admin = { id: ME_ID, role: 'admin' };
    expect(rowKind(mk(ME_ID, 'M', 'E', 'sysadmin', 'active'), admin)).toBe('self');
    expect(rowKind(mk('z', 'x', 'y', 'sysadmin', 'disabled', { email: 'anon_z@deleted.local' }), admin)).toBe('anonymized');
  });
});

describe('menuGroups', () => {
  const sysMe = { id: ME_ID, role: 'sysadmin' };
  const admMe = { id: ME_ID, role: 'admin' };

  it('uses the exact reasons for unavailable items', () => {
    expect(item(mk('a', 'A', 'B', 'sysadmin', 'active'), sysMe, 'make-user').reason)
      .toBe('Revoke sysadmin first: roles change one step at a time.');
    expect(item(mk('a', 'A', 'B', 'user', 'active'), sysMe, 'grant-sysadmin').reason)
      .toBe('Make admin first: roles change one step at a time.');
    expect(item(mk('a', 'A', 'B', 'user', 'active'), admMe, 'grant-sysadmin').reason)
      .toBe('Only a sysadmin can grant this role.');
    expect(item(mk('a', 'A', 'B', 'admin', 'active'), admMe, 'grant-sysadmin').reason)
      .toBe('Only a sysadmin can grant this role.');
    expect(item(mk('a', 'A', 'B', 'user', 'active'), sysMe, 'anonymize').reason)
      .toBe('Disable the account first.');
  });

  it('has no reason on enabled items and always a desc', () => {
    for (const g of menuGroups(mk('a', 'A', 'B', 'admin', 'pending'), sysMe)) {
      for (const i of g.items) {
        expect(i.desc).toBeTruthy();
        if (i.enabled) expect(i.reason).toBeNull();
        else expect(i.reason).toBeTruthy();
      }
    }
  });

  it('orders groups role, access, data with the documented items and tags', () => {
    const gs = menuGroups(mk('a', 'A', 'B', 'user', 'pending'), sysMe);
    expect(gs.map(g => g.group)).toEqual(['role', 'access', 'data']);
    expect(gs.map(g => g.label)).toEqual(['Role', 'Access', 'Data']);
    expect(gs[0].items.map(i => i.id)).toEqual(['make-admin', 'grant-sysadmin']);
    expect(gs[0].items[1].tag).toBe('SENSITIVE');
    expect(gs[1].items.map(i => i.id)).toEqual(['resend', 'disable']);
    expect(gs[2].items.map(i => i.id)).toEqual(['anonymize']);
    expect(gs[2].items[0]).toMatchObject({ tag: 'IRREVERSIBLE', danger: true });
    const all = gs.flatMap(g => g.items);
    expect(all.filter(i => i.danger)).toHaveLength(1);
    expect(menuGroups(mk('a', 'A', 'B', 'sysadmin', 'disabled'), sysMe)[0].items.map(i => i.id))
      .toEqual(['make-user', 'revoke-sysadmin']);
    expect(menuGroups(mk('a', 'A', 'B', 'admin', 'disabled'), sysMe)[1].items.map(i => i.id)).toEqual(['enable']);
  });

  it('picks the primary action from the status', () => {
    expect(primaryAction(mk('a', 'A', 'B', 'user', 'pending'), sysMe)).toBe('resend');
    expect(primaryAction(mk('a', 'A', 'B', 'user', 'disabled'), sysMe)).toBe('enable');
    expect(primaryAction(mk('a', 'A', 'B', 'user', 'active'), sysMe)).toBeNull();
  });
});

describe('names', () => {
  it('never returns undefined for missing names', () => {
    const u = { first_name: null, last_name: null, email: 'a@x.com' };
    expect(initials(u)).toBe('?');
    expect(displayName(u)).toBe('—');
    expect(initials({ first_name: 'marco', last_name: 'rossi', email: 'm@x' })).toBe('MR');
    expect(initials({ first_name: 'Marco', last_name: null, email: 'm@x' })).toBe('M');
  });
  it('treats anonymized rows specially', () => {
    const a = { first_name: '[Deleted]', last_name: 'User', email: 'anon_1@deleted.local' };
    expect(isAnonymized(a)).toBe(true);
    expect(displayName(a)).toBe('Anonymized user');
    expect(initials(a)).toBe('—');
  });
});

const USERS = [
  mk('1', 'Marco', 'Rossi', 'sysadmin', 'active', { created_at: '2026-01-05T00:00:00Z' }),
  mk('2', 'Giulia', 'Bianchi', 'admin', 'active', { created_at: '2026-02-05T00:00:00Z' }),
  mk('3', 'Marta', 'Ricci', 'user', 'active', { created_at: '2026-03-05T00:00:00Z' }),
  mk('4', 'Luca', 'Verdi', 'user', 'pending', { created_at: '2026-04-05T00:00:00Z' }),
  mk('5', 'Anna', 'Neri', 'user', 'pending', { created_at: '2026-05-05T00:00:00Z' }),
  mk('6', 'Paolo', 'Gialli', 'admin', 'disabled', { created_at: '2026-06-05T00:00:00Z' }),
  mk('7', 'Sara', 'Blu', 'user', 'disabled', { created_at: '2026-07-05T00:00:00Z' }),
  mk('8', null, null, 'user', 'active', { created_at: '2026-08-05T00:00:00Z', email: 'old@x.com' }),
  mk('9', '[Deleted]', 'User', 'user', 'disabled', { created_at: '2026-09-05T00:00:00Z', email: 'anon_9@deleted.local' }),
];

describe('lists', () => {
  it('counts by status following role and search', () => {
    expect(statusCounts(USERS, { role: 'all', search: '' })).toEqual({ all: 9, active: 4, pending: 2, disabled: 3 });
    expect(statusCounts(USERS, { role: 'user', search: '' })).toEqual({ all: 6, active: 2, pending: 2, disabled: 2 });
    expect(statusCounts(USERS, { role: 'all', search: '  RICCI ' })).toEqual({ all: 1, active: 1, pending: 0, disabled: 0 });
  });

  it('filters by status, role and search over name and email', () => {
    expect(filterUsers(USERS, { status: 'pending', role: 'all', search: '' }).map(u => u.id)).toEqual(['4', '5']);
    expect(filterUsers(USERS, { status: 'all', role: 'admin', search: '' }).map(u => u.id)).toEqual(['2', '6']);
    expect(filterUsers(USERS, { status: 'all', role: 'all', search: '  MARCO ' }).map(u => u.id)).toEqual(['1']);
    expect(filterUsers(USERS, { status: 'all', role: 'all', search: 'old@x' }).map(u => u.id)).toEqual(['8']);
    expect(filterUsers(USERS, { status: 'all', role: 'all', search: '   ' })).toHaveLength(9);
  });

  it('sorts by name, role, status and joined without throwing on null names', () => {
    const ids = (key, dir) => sortUsers(USERS, { key, dir }).map(u => u.id);
    expect(() => ids('name', 'asc')).not.toThrow();
    expect(ids('name', 'asc').indexOf('5')).toBeLessThan(ids('name', 'asc').indexOf('2'));
    expect(ids('name', 'asc').indexOf('2')).toBeLessThan(ids('name', 'asc').indexOf('4'));
    expect(ids('role', 'desc')[0]).toBe('1');
    expect(ids('status', 'asc').slice(0, 4)).toEqual(['1', '2', '3', '8']);
    expect(ids('joined', 'asc')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(ids('joined', 'desc')[0]).toBe('9');
  });

  it('is stable on ties and keeps input order when dir is null', () => {
    expect(sortUsers(USERS, { key: 'role', dir: 'asc' }).filter(u => u.role === 'user').map(u => u.id))
      .toEqual(['3', '4', '5', '7', '8', '9']);
    expect(sortUsers(USERS, { key: null, dir: null }).map(u => u.id)).toEqual(USERS.map(u => u.id));
    expect(sortUsers(USERS, { key: 'name', dir: 'asc' })).not.toBe(USERS);
  });

  it('cycles the sort asc → desc → none', () => {
    let s = nextSort({ key: null, dir: null }, 'name');
    expect(s).toEqual({ key: 'name', dir: 'asc' });
    s = nextSort(s, 'name');
    expect(s).toEqual({ key: 'name', dir: 'desc' });
    s = nextSort(s, 'name');
    expect(s).toEqual({ key: null, dir: null });
    expect(nextSort({ key: 'name', dir: 'desc' }, 'role')).toEqual({ key: 'role', dir: 'asc' });
  });

  it('describes the active filters', () => {
    expect(filterSummary({ status: 'pending', role: 'all', search: 'marco' })).toBe('Showing pending users · "marco"');
    expect(filterSummary({ status: 'all', role: 'all', search: '' })).toBe('Showing all users');
    expect(filterSummary({ status: 'active', role: 'admin', search: '' })).toBe('Showing active admins');
    expect(filterSummary({ status: 'all', role: 'sysadmin', search: ' x ' })).toBe('Showing sysadmins · "x"');
  });
});

describe('isValidEmail', () => {
  it('accepts addresses containing the letter s', () => {
    expect(isValidEmail('marco.rossi@eversana.com')).toBe(true);
    expect(isValidEmail('  sara@sales.it ')).toBe(true);
  });
  it('refuses whitespace, a missing @ or a missing dot', () => {
    for (const e of ['', '   ', 'a b@c.com', 'ab.com', 'a@bcom', 'a@b@c.com']) expect(isValidEmail(e)).toBe(false);
  });
});
