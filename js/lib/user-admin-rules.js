// Pure rules and list transforms behind admin.html (User Admin).

const ROLE_ORDER = { user: 0, admin: 1, sysadmin: 2 };
const STATUS_ORDER = { active: 0, pending: 1, disabled: 2 };

export function isAnonymized(user) {
  return String(user.email || '').startsWith('anon_');
}

function rawName(user) {
  return `${user.first_name || ''} ${user.last_name || ''}`.trim();
}

export function displayName(user) {
  if (isAnonymized(user)) return 'Anonymized user';
  return rawName(user) || '—';
}

export function initials(user) {
  if (isAnonymized(user)) return '—';
  const s = [user.first_name, user.last_name]
    .map(n => String(n || '').trim().charAt(0).toUpperCase())
    .join('');
  return s || '?';
}

// Precedence: self, anonymized, locked, normal.
export function rowKind(user, me) {
  if (user.id === me.id) return 'self';
  if (isAnonymized(user)) return 'anonymized';
  if (user.role === 'sysadmin' && me.role !== 'sysadmin') return 'locked';
  return 'normal';
}

export function primaryAction(user, me) {
  if (rowKind(user, me) !== 'normal') return null;
  if (user.status === 'pending') return 'resend';
  if (user.status === 'disabled') return 'enable';
  return null;
}

function item(id, label, desc, icon, o = {}) {
  const enabled = o.enabled !== false;
  return {
    id, label, desc, icon, enabled,
    reason: enabled ? null : o.reason,
    tag: o.tag || null,
    danger: !!o.danger,
  };
}

export function menuGroups(user, me) {
  if (rowKind(user, me) !== 'normal') return [];
  const viewerIsSys = me.role === 'sysadmin';

  const role = [];
  if (user.role === 'user') {
    role.push(item('make-admin', 'Make admin', 'Can invite and manage users', 'user-plus'));
  } else if (user.role === 'admin') {
    role.push(item('make-user', 'Make user', 'Removes admin rights', 'user-minus'));
  } else {
    role.push(item('make-user', 'Make user', 'Removes admin rights', 'user-minus', {
      enabled: false, reason: 'Revoke sysadmin first: roles change one step at a time.',
    }));
  }
  if (user.role === 'sysadmin') {
    role.push(item('revoke-sysadmin', 'Revoke sysadmin', 'Back to admin', 'shield', { tag: 'SENSITIVE' }));
  } else if (!viewerIsSys) {
    role.push(item('grant-sysadmin', 'Grant sysadmin', 'Full control, including other sysadmins', 'shield', {
      tag: 'SENSITIVE', enabled: false, reason: 'Only a sysadmin can grant this role.',
    }));
  } else if (user.role === 'user') {
    role.push(item('grant-sysadmin', 'Grant sysadmin', 'Full control, including other sysadmins', 'shield', {
      tag: 'SENSITIVE', enabled: false, reason: 'Make admin first: roles change one step at a time.',
    }));
  } else {
    role.push(item('grant-sysadmin', 'Grant sysadmin', 'Full control, including other sysadmins', 'shield', { tag: 'SENSITIVE' }));
  }

  const access = [];
  if (user.status === 'pending') {
    access.push(item('resend', 'Resend invite', 'New activation link, valid 48 hours', 'mail'));
  }
  if (user.status === 'disabled') {
    access.push(item('enable', 'Enable', 'Restores sign-in', 'power'));
  } else {
    access.push(item('disable', 'Disable…', 'Blocks sign-in. You can re-enable later.', 'power'));
  }

  const data = [item('anonymize', 'Anonymize…', 'Removes name and email for good', 'trash', {
    tag: 'IRREVERSIBLE', danger: true,
    enabled: user.status === 'disabled', reason: 'Disable the account first.',
  })];

  return [
    { group: 'role', label: 'Role', items: role },
    { group: 'access', label: 'Access', items: access },
    { group: 'data', label: 'Data', items: data },
  ];
}

function matchesSearch(user, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  return rawName(user).toLowerCase().includes(q) || String(user.email || '').toLowerCase().includes(q);
}

function matchesRole(user, role) {
  return !role || role === 'all' || user.role === role;
}

export function statusCounts(users, { role, search } = {}) {
  const c = { all: 0, active: 0, pending: 0, disabled: 0 };
  for (const u of users) {
    if (!matchesRole(u, role) || !matchesSearch(u, search)) continue;
    c.all++;
    if (c[u.status] !== undefined) c[u.status]++;
  }
  return c;
}

export function filterUsers(users, { status, role, search } = {}) {
  return users.filter(u =>
    (!status || status === 'all' || u.status === status) &&
    matchesRole(u, role) &&
    matchesSearch(u, search));
}

function sortValue(user, key) {
  if (key === 'name') return rawName(user).toLowerCase();
  if (key === 'role') return ROLE_ORDER[user.role] ?? 99;
  if (key === 'status') return STATUS_ORDER[user.status] ?? 99;
  if (key === 'joined') return new Date(user.created_at).getTime() || 0;
  return 0;
}

export function sortUsers(users, { key, dir } = {}) {
  const indexed = users.map((u, i) => ({ u, i }));
  if (!key || !dir) return indexed.map(x => x.u);
  const sign = dir === 'desc' ? -1 : 1;
  indexed.sort((a, b) => {
    const va = sortValue(a.u, key);
    const vb = sortValue(b.u, key);
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return cmp * sign || a.i - b.i;
  });
  return indexed.map(x => x.u);
}

export function nextSort(sort, key) {
  if (sort.key !== key) return { key, dir: 'asc' };
  if (sort.dir === 'asc') return { key, dir: 'desc' };
  return { key: null, dir: null };
}

export function filterSummary({ status, role, search } = {}) {
  const noun = { user: 'users', admin: 'admins', sysadmin: 'sysadmins' }[role] || 'users';
  const hasStatus = status && status !== 'all';
  const hasRole = role && role !== 'all';
  let s = 'Showing ' + (hasStatus ? `${status} ` : (hasRole ? '' : 'all ')) + noun;
  const q = String(search || '').trim();
  if (q) s += ` · "${q}"`;
  return s;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

Object.assign(window, { UserAdminRules: {
  isAnonymized, displayName, initials, rowKind, primaryAction, menuGroups,
  statusCounts, filterUsers, sortUsers, nextSort, filterSummary, isValidEmail,
} });
