// ── API ADAPTER ───────────────────────────────────────────────────────────────
// Single entry point for all backend calls.
// • Always sends credentials (httpOnly JWT cookie)
// • 401 → redirect to /login.html
// • Returns parsed JSON; throws Error with server message on failure

const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      ...options,
      signal: controller.signal,
      credentials: 'same-origin',
      headers: isFormData ? undefined : { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
  clearTimeout(timer);
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

// ── API NAMESPACES ────────────────────────────────────────────────────────────

const Api = {

  auth: {
    me:             ()    => apiFetch('/auth/me'),
    logout:         ()    => apiFetch('/auth/logout', { method: 'POST' }),
    changePassword: (d)   => apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify(d) }),
  },

  users: {
    search:     (email) => apiFetch(`/users/search?email=${encodeURIComponent(email)}`),
    activeList: ()      => apiFetch('/users/active-list'),
  },

  clients: {
    list:   ()              => apiFetch('/clients'),
    create: (name)          => apiFetch('/clients',     { method: 'POST',   body: JSON.stringify({ name }) }),
    update: (id, name)      => apiFetch(`/clients/${id}`, { method: 'PATCH',  body: JSON.stringify({ name }) }),
    delete: (id)            => apiFetch(`/clients/${id}`, { method: 'DELETE' }),
  },

  clientGroups: {
    list:           ()                    => apiFetch('/client-groups'),
    create:         (name)                => apiFetch('/client-groups', { method: 'POST', body: JSON.stringify({ name }) }),
    rename:         (id, name)            => apiFetch(`/client-groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    delete:         (id)                  => apiFetch(`/client-groups/${id}`, { method: 'DELETE' }),
    assignClient:   (groupId, clientId)   => apiFetch(`/client-groups/${groupId}/clients/${clientId}`, { method: 'PUT' }),
    removeClient:   (groupId, clientId)   => apiFetch(`/client-groups/${groupId}/clients/${clientId}`, { method: 'DELETE' }),
  },

  programs: {
    list:   ()              => apiFetch('/programs'),
    create: (id, name)      => apiFetch('/programs',      { method: 'POST',   body: JSON.stringify({ id, name }) }),
    update: (id, name)      => apiFetch(`/programs/${id}`, { method: 'PATCH',  body: JSON.stringify({ name }) }),
    delete: (id)            => apiFetch(`/programs/${id}`, { method: 'DELETE' }),
    share:  (id, userId, permission) => apiFetch(`/programs/${id}/share`, { method: 'POST', body: JSON.stringify({ userId, permission }) }),
  },

  roles: {
    list:   ()              => apiFetch('/roles'),
    create: (d)             => apiFetch('/roles',         { method: 'POST',   body: JSON.stringify(d) }),
    update: (id, d)         => apiFetch(`/roles/${id}`,   { method: 'PATCH',  body: JSON.stringify(d) }),
    delete: (id)            => apiFetch(`/roles/${id}`,   { method: 'DELETE' }),
  },

  projects: {
    list:    ()             => apiFetch('/projects'),
    get:     (id)           => apiFetch(`/projects/${id}`),
    create:  (d)            => apiFetch('/projects',      { method: 'POST',   body: JSON.stringify(d) }),
    update:  (id, d)        => apiFetch(`/projects/${id}`, { method: 'PATCH',  body: JSON.stringify(d) }),
    delete:  (id)           => apiFetch(`/projects/${id}`, { method: 'DELETE' }),
    tasks:   (id)           => apiFetch(`/projects/${id}/tasks`),
    saveTasks: (id, tasks)  => apiFetch(`/projects/${id}/tasks`, { method: 'PUT', body: JSON.stringify(tasks) }),
    phasing:  (id, phasing)  => apiFetch(`/projects/${id}/phasing`,  { method: 'PATCH', body: JSON.stringify({ phasing }) }),
    ptc:      (id, ptc)      => apiFetch(`/projects/${id}/ptc`,      { method: 'PATCH', body: JSON.stringify({ ptc }) }),
    planning: (id, planning) => apiFetch(`/projects/${id}/planning`, { method: 'PATCH', body: JSON.stringify({ planning }) }),
    groups:   (id, groups)   => apiFetch(`/projects/${id}/groups`,   { method: 'PATCH', body: JSON.stringify({ groups }) }),
    shares: {
      list:   (id)                    => apiFetch(`/projects/${id}/shares`),
      add:    (id, userId, permission) => apiFetch(`/projects/${id}/shares`,           { method: 'POST',   body: JSON.stringify({ userId, permission }) }),
      remove: (id, userId)            => apiFetch(`/projects/${id}/shares/${userId}`,  { method: 'DELETE' }),
    },
  },

  costGrids: {
    list:    (year)         => apiFetch('/cost-grids' + (year ? `?year=${encodeURIComponent(year)}` : '')),
    budgets: ()             => apiFetch('/cost-grids/budgets'),
    get:     (id)           => apiFetch(`/cost-grids/${id}`),
    create:  (d)            => apiFetch('/cost-grids',    { method: 'POST',   body: JSON.stringify(d) }),
    update:  (id, d)        => apiFetch(`/cost-grids/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    delete:  (id)           => apiFetch(`/cost-grids/${id}`, { method: 'DELETE' }),
    versions: {
      list:       (cgId)              => apiFetch(`/cost-grids/${cgId}/versions`),
      create:     (cgId, d)           => apiFetch(`/cost-grids/${cgId}/versions`, { method: 'POST', body: JSON.stringify(d) }),
      update:     (cgId, vId, d)      => apiFetch(`/cost-grids/${cgId}/versions/${vId}`, { method: 'PATCH', body: JSON.stringify(d) }),
      delete:     (cgId, vId)         => apiFetch(`/cost-grids/${cgId}/versions/${vId}`, { method: 'DELETE' }),
      duplicate:  (cgId, vId)         => apiFetch(`/cost-grids/${cgId}/versions/${vId}/duplicate`, { method: 'POST' }),
      publish:    (cgId, vId)         => apiFetch(`/cost-grids/${cgId}/versions/${vId}/publish`,   { method: 'POST' }),
      structure:  (cgId, vId)         => apiFetch(`/cost-grids/${cgId}/versions/${vId}/structure`),
      saveStructure: (cgId, vId, d)   => apiFetch(`/cost-grids/${cgId}/versions/${vId}/structure`, { method: 'PUT', body: JSON.stringify(d) }),
      linkedProjects: {
        list:   (cgId, vId)           => apiFetch(`/cost-grids/${cgId}/versions/${vId}/linked-projects`),
        add:    (cgId, vId, d)        => apiFetch(`/cost-grids/${cgId}/versions/${vId}/linked-projects`, { method: 'POST', body: JSON.stringify(d) }),
        remove: (cgId, vId, projId)   => apiFetch(`/cost-grids/${cgId}/versions/${vId}/linked-projects/${projId}`, { method: 'DELETE' }),
      },
    },
    shares: {
      list:   (id)                    => apiFetch(`/cost-grids/${id}/shares`),
      add:    (id, userId, permission) => apiFetch(`/cost-grids/${id}/shares`,          { method: 'POST',   body: JSON.stringify({ userId, permission }) }),
      remove: (id, userId)            => apiFetch(`/cost-grids/${id}/shares/${userId}`, { method: 'DELETE' }),
    },
  },

  timesheets: {
    list:    ()              => apiFetch('/timesheets'),
    allData: ()              => apiFetch('/timesheets/all-data'),
    get:     (code)          => apiFetch(`/timesheets/${encodeURIComponent(code)}`),
    upload: (file, projectCode) => {
      const fd = new FormData();
      fd.append('file', file);
      const qs = projectCode ? '?projectCode=' + encodeURIComponent(projectCode) : '';
      return apiFetch('/timesheets/upload' + qs, { method: 'POST', body: fd });
    },
    delete: (code)          => apiFetch(`/timesheets/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  },

  ratecards: {
    list:         ()               => apiFetch('/ratecards'),
    get:          (id)             => apiFetch(`/ratecards/${id}`),
    create:       (name, clientId) => apiFetch('/ratecards', { method: 'POST', body: JSON.stringify({ name, clientId: clientId || null }) }),
    clone:        (clientId, name) => apiFetch('/ratecards/clone', { method: 'POST', body: JSON.stringify({ clientId, name }) }),
    rename:       (id, name)       => apiFetch(`/ratecards/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    updateEntries: (id, entries)   => apiFetch(`/ratecards/${id}/entries`, { method: 'PATCH', body: JSON.stringify(entries) }),
    delete:       (id)             => apiFetch(`/ratecards/${id}`, { method: 'DELETE' }),
  },

  pipelineYears: {
    list:   ()            => apiFetch('/pipeline-years'),
    create: (year)        => apiFetch('/pipeline-years', { method: 'POST', body: JSON.stringify({ year }) }),
    toggle: (id, active)  => apiFetch(`/pipeline-years/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
    delete: (id)          => apiFetch(`/pipeline-years/${id}`, { method: 'DELETE' }),
  },

  pots: {
    list:    (year)         => apiFetch('/pots' + (year ? `?year=${encodeURIComponent(year)}` : '')),
    create:  (d)            => apiFetch('/pots', { method: 'POST', body: JSON.stringify(d) }),
    update:  (id, amount, note) => apiFetch(`/pots/${id}`, { method: 'PATCH', body: JSON.stringify({ amount, note }) }),
    delete:  (id)           => apiFetch(`/pots/${id}`, { method: 'DELETE' }),
    history:         (id)         => apiFetch(`/pots/${id}/history`),
    summary:         (params)     => apiFetch('/pots/summary?' + new URLSearchParams(params)),
    pipelineSummary: (year)       => apiFetch(`/pots/pipeline-summary?year=${encodeURIComponent(year)}`),
    details:         (id, year)   => apiFetch(`/pots/${id}/details?year=${encodeURIComponent(year)}`),
    yearTotals:      ()           => apiFetch('/pots/year-totals'),
  },

  reporting: {
    pipeline:  ()           => apiFetch('/reporting/pipeline'),
    portfolio: ()           => apiFetch('/reporting/portfolio'),
    project:   (id)         => apiFetch(`/reporting/projects/${id}`),
    planning:  ()           => apiFetch('/reporting/planning'),
    phasing:   (year)       => apiFetch(`/reporting/phasing?year=${encodeURIComponent(year)}`),
  },
};
