// ── API ADAPTER ───────────────────────────────────────────────────────────────
// Single entry point for all backend calls.
// • Always sends credentials (httpOnly JWT cookie)
// • 401 → redirect to /login.html
// • Returns parsed JSON; throws Error with server message on failure

const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(API_BASE + path, {
    ...options,
    credentials: 'same-origin',
    headers: isFormData ? undefined : { 'Content-Type': 'application/json', ...options.headers },
  });
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
    me:     ()     => apiFetch('/auth/me'),
    logout: ()     => apiFetch('/auth/logout', { method: 'POST' }),
  },

  clients: {
    list:   ()              => apiFetch('/clients'),
    create: (name)          => apiFetch('/clients',     { method: 'POST',   body: JSON.stringify({ name }) }),
    update: (id, name)      => apiFetch(`/clients/${id}`, { method: 'PATCH',  body: JSON.stringify({ name }) }),
    delete: (id)            => apiFetch(`/clients/${id}`, { method: 'DELETE' }),
  },

  programs: {
    list:   ()              => apiFetch('/programs'),
    create: (id, name)      => apiFetch('/programs',      { method: 'POST',   body: JSON.stringify({ id, name }) }),
    update: (id, name)      => apiFetch(`/programs/${id}`, { method: 'PATCH',  body: JSON.stringify({ name }) }),
    delete: (id)            => apiFetch(`/programs/${id}`, { method: 'DELETE' }),
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
    phasing: (id, phasing)  => apiFetch(`/projects/${id}/phasing`, { method: 'PATCH', body: JSON.stringify({ phasing }) }),
    ptc:     (id, ptc)      => apiFetch(`/projects/${id}/ptc`,     { method: 'PATCH', body: JSON.stringify({ ptc }) }),
  },

  costGrids: {
    list:    ()             => apiFetch('/cost-grids'),
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
      structure:  (cgId, vId)         => apiFetch(`/cost-grids/${cgId}/versions/${vId}/structure`),
      saveStructure: (cgId, vId, d)   => apiFetch(`/cost-grids/${cgId}/versions/${vId}/structure`, { method: 'PUT', body: JSON.stringify(d) }),
      linkedProjects: {
        list:   (cgId, vId)           => apiFetch(`/cost-grids/${cgId}/versions/${vId}/linked-projects`),
        add:    (cgId, vId, d)        => apiFetch(`/cost-grids/${cgId}/versions/${vId}/linked-projects`, { method: 'POST', body: JSON.stringify(d) }),
        remove: (cgId, vId, projId)   => apiFetch(`/cost-grids/${cgId}/versions/${vId}/linked-projects/${projId}`, { method: 'DELETE' }),
      },
    },
  },

  timesheets: {
    list:   ()              => apiFetch('/timesheets'),
    get:    (code)          => apiFetch(`/timesheets/${encodeURIComponent(code)}`),
    upload: (file)          => {
      const fd = new FormData();
      fd.append('file', file);
      return apiFetch('/timesheets/upload', { method: 'POST', body: fd });
    },
    delete: (code)          => apiFetch(`/timesheets/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  },

  reporting: {
    pipeline:  ()           => apiFetch('/reporting/pipeline'),
    portfolio: ()           => apiFetch('/reporting/portfolio'),
    project:   (id)         => apiFetch(`/reporting/projects/${id}`),
    planning:  ()           => apiFetch('/reporting/planning'),
  },
};
