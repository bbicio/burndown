// ── API SYNC LAYER ────────────────────────────────────────────────────────────
// Strategy: in-memory variables are the UI cache; API is the source of truth.
//
//   • On page load  → call cgSyncFromApi() / loadConfigFromApi() /
//                     refreshTimesheetDataFromApi() to seed in-memory state
//                     from the server before rendering.
//   • On user action → the cost grid editor and project-config save with Save, on
//                     the save contract (_cgSaveVersion, _saveProject below,
//                     js/lib/save.js); Generate and Add tasks are one request each
//                     (_generateProject, _addTasksToProject). Memory adopts the
//                     server's answer, and only on success.

// ── COST GRIDS ────────────────────────────────────────────────────────────────

// Currency is stored as ISO code ('EUR', 'USD') both in DB and in memory.
// These shims are kept so any lingering callers don't break.
function _cgCurrencyFromDb(raw) { return (raw || 'EUR').trim(); }
function _cgCurrencyToDb(code)  { return (code || 'EUR').trim(); }

// Normalise a server version object into the frontend in-memory shape.
// Server uses { id, label, ... }; frontend uses { versionId, versionLabel, ... }.
function _cgApiVersionToLocal(v) {
  return {
    versionId:      v.id           || v.versionId,
    versionLabel:   v.label        || v.versionLabel || 'v1',
    pipeline:       v.pipeline     || '',
    pipelineYear:   v.pipeline_year || v.pipelineYear || null,
    startDate:      v.startDate    || v.start_date   || '',
    endDate:        v.endDate      || v.end_date     || '',
    currency:       _cgCurrencyFromDb(v.currency),
    currencyRate:   parseFloat(v.currency_rate) || 1.0,
    note:           v.note        || '',
    createdAt:      v.createdAt   || v.created_at   || new Date().toISOString(),
    status:         v.locked ? 'committed' : (v.status || 'draft'),
    projectName:    v.projectName  || v.project_name  || '',
    ratecardId:     v.ratecardId   || v.ratecard_id   || null,
    clientId:       v.clientId     || v.client_id     || null,
    version:        Number.isInteger(v.version) ? v.version : undefined,
    linkedProjects: (v.linkedProjects || []).map(lp => ({
      projectId:   lp.projectId   || lp.project_id   || '',
      projectName: lp.projectName || lp.project_name || '',
      taskIds:     lp.taskIds     || lp.task_ids      || [],
      taskNames:   lp.taskNames   || lp.task_names    || [],
    })),
    // phases and roles come from the /structure endpoint, not the list endpoint
    roles:  v.roles  || [],
    phases: v.phases || [],
  };
}

// Seed all cost grids (version metadata only, no phase/task structure) from API.
// Pass a year to filter to proposals with pipeline_year = year (Drafts always included).
// Call this at page load before renderPipelineBoard().
async function cgSyncFromApi(year) {
  try {
    const grids = await Api.costGrids.list(year || null);
    cgSaveIndex(grids.map(g => g.id));
    for (const g of grids) {
      cgSave({
        id:           g.id,
        name:         g.name,
        ownerName:    g.owner_name || '',
        ownerId:      g.owner_id   || '',
        myPermission: g.my_permission || 'owner',
        versions:     (g.versions || []).map(_cgApiVersionToLocal),
      });
    }
  } catch (e) {
    console.warn('[sync] cgSyncFromApi:', e.message);
  }
}

// Fetch active currencies from API and cache in window.__currencies.
// Call this once per page load before any money formatting.
async function loadCurrenciesFromApi() {
  try {
    window.__currencies = await Api.currencies.active();
  } catch (e) {
    console.warn('[sync] loadCurrenciesFromApi:', e.message);
    if (!window.__currencies) window.__currencies = [{ code: 'EUR', symbol: '€', locale: 'it-IT', current_rate: 1.0 }];
  }
}

// Fetch and merge the full phase/role structure for a single version.
// Call this on costgrid.html before opening the editor.
async function cgLoadStructureFromApi(cgId, versionId) {
  try {
    const struct = await Api.costGrids.versions.structure(cgId, versionId);
    const cg = cgLoad(cgId);
    if (!cg) { console.warn('[sync] cgLoadStructureFromApi: cost grid not found in local store', cgId); return false; }
    const ver = cg.versions.find(v => v.versionId === versionId);
    if (!ver) { console.warn('[sync] cgLoadStructureFromApi: version not found', cgId, versionId); return false; }

    if (Array.isArray(struct.phases)) {
      const rolesMap = new Map(); // code → { label, rate, isCustom, hasOverride }

      ver.phases = struct.phases.map(ph => ({
        phaseId:   ph.id       || ph.phaseId,
        phaseName: ph.title    || ph.phaseName || '',
        tasks: (ph.tasks || []).map(tk => {
          const hours = {};
          (tk.roles || []).forEach(tr => {
            const code = tr.code || tr.roleCode;
            if (code) {
              hours[code] = (hours[code] || 0) + (parseFloat(tr.days) || 0);
              const label    = tr.label || tr.roleLabel || code;
              const override = tr.rate_override ?? tr.rateOverride;
              const rate     = parseFloat(override ?? tr.hourly_rate ?? 0);
              const isCustom = (tr.rate_is_custom ?? tr.rateIsCustom) === true;
              if (!rolesMap.has(code)) rolesMap.set(code, { label, rate, isCustom, hasOverride: override != null });
            }
          });
          return {
            taskId:          tk.id          || tk.taskId,
            taskName:        tk.title       || tk.taskName       || '',
            taskDescription: tk.description || tk.taskDescription || '',
            taskStartDate:   tk.start_date  || tk.taskStartDate  || '',
            taskEndDate:     tk.end_date    || tk.taskEndDate    || '',
            ptc:             parseFloat(tk.ptc) || 0,
            hours,
          };
        }),
      }));

      // Rebuild role columns from task_roles when every role carries its saved rate
      // (rate_override), so changes saved in another session are picked up; otherwise only
      // when no roles are in memory. Custom comes from rate_is_custom, never from rate_override.
      if (rolesMap.size) {
        const allHaveOverride = [...rolesMap.values()].every(r => r.hasOverride);
        if (allHaveOverride || !ver.roles?.length) {
          // rateUnsaved: the role has no saved rate (rate_override NULL), so the editor prices it on open.
          ver.roles = [...rolesMap.entries()].map(([code, { label, rate, isCustom, hasOverride }]) => ({
            roleCode:     code,
            roleLabel:    label,
            rate,
            rateIsCustom: isCustom || false,
            ...(hasOverride ? {} : { rateUnsaved: true }),
          }));
        }
      }
    }

    if (Number.isInteger(struct.version)) ver.version = struct.version;
    cgSave(cg);
    return true;
  } catch (e) {
    console.warn('[sync] cgLoadStructureFromApi:', e.message);
    return false;
  }
}

// The editor's Save of the open version (save contract cycle 2): one PUT /api/cost-grids/:id/versions/:vId with
// the version it started from, the header fields that differ from the base and, only when it changed, the
// structure. On ok the draft adopts the server's version, rate and pipeline year, and every header field it has
// not edited since the Save was sent; the base becomes what was sent, so an edit made during the Save stays
// unsaved. On any other outcome the draft stays as it is and the save state says why.
// Resolves to { kind: 'ok'|'none'|'conflict'|'unknown'|'rule'|'error', message? }; 'none' = nothing to save.
async function _cgSaveVersion(cgId, versionId) {
  const HEADER_LOCAL = {
    label: 'versionLabel', pipeline: 'pipeline', startDate: 'startDate', endDate: 'endDate', currency: 'currency',
    note: 'note', ratecardId: 'ratecardId', clientId: 'clientId', projectName: 'projectName',
  };
  if (_cgActiveCgId !== cgId || _cgActiveVersionId !== versionId || !_cgDraft || !_cgBase) return { kind: 'none' };
  const draft = _cgDraft;
  const sent = window.cgSavableState(draft);
  const header = window.cgChangedHeader(_cgBase, draft);
  const structureChanged = window.cgStructureChanged(_cgBase, draft);
  if (!Object.keys(header).length && !structureChanged) { cgRefreshSaveState(); return { kind: 'none' }; }

  const body = { version: draft.version };
  if (Object.keys(header).length) body.header = header;
  if (structureChanged) body.structure = sent.structure;
  _cgSaving = true;
  cgSetSaveState({ status: 'saving' });
  const res = await window.apiSave('PUT', `/cost-grids/${cgId}/versions/${versionId}`, body);
  _cgSaving = false;
  // Another version may have been opened while the Save was in flight: its base, state and flag stay its own.
  const stillOpen = _cgDraft === draft;
  if (res.kind !== 'ok') {
    if (stillOpen) cgSetSaveState({ status: 'failed', message: res.message, reloadable: res.kind === 'conflict' || res.kind === 'unknown' });
    return { kind: res.kind, message: res.message };
  }

  const server = _cgApiVersionToLocal(res.data);
  const serverHeader = window.cgSavableState(server).header;
  const now = window.cgSavableState(draft).header;
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  for (const [k, local] of Object.entries(HEADER_LOCAL)) {
    if (same(now[k], sent.header[k]) && !same(serverHeader[k], sent.header[k])) draft[local] = server[local];
  }
  draft.version = server.version;
  draft.pipelineYear = server.pipelineYear;
  const cg = cgLoad(cgId);
  if (cg) {
    const idx = cg.versions.findIndex(v => v.versionId === versionId);
    if (idx >= 0) cg.versions[idx] = draft;
    cgSave(cg);
  }
  if (!stillOpen) return { kind: 'ok' };

  _cgBase = { header: serverHeader, structure: sent.structure };
  const afterCurrencyChange = _cgCurrencyChangePending.delete(versionId);
  const serverRate = parseFloat(res.data?.currency_rate);
  if (Number.isFinite(serverRate) && serverRate !== (parseFloat(draft.currencyRate) || 1)) {
    cgAdoptServerRate(cgId, versionId, serverRate, afterCurrencyChange, server.currency, sent.structure.roles);
  }
  if (header.pipeline !== undefined) cgPropagatePipelineToProjects();
  cgRefreshSaveState();
  return { kind: 'ok' };
}

// ── PROJECTS / CONFIG ─────────────────────────────────────────────────────────

// Normalise a server project into the frontend config.projects shape.
function _apiProjectToLocal(p) {
  const versionId = p.cg_version_id || null;
  const cgId      = p.cg_id || null;
  return {
    id:         p.id,
    code:       p.code         || '',
    name:       p.name         || '',
    programId:  p.programId    || p.program_id  || '',
    clientId:   p.clientId     || p.client_id   || '',
    startDate:  p.startDate    || p.start_date  || '',
    endDate:    p.endDate      || p.end_date    || '',
    currency:   p.currency || 'EUR',
    pipeline:   p.pipeline     || '',
    status:     p.status       || '',
    description: p.description  || '',
    tasks:      Array.isArray(p.tasks) ? p.tasks : [],
    phasing:    p.phasing      || {},
    planning:   p.planning     || {},
    ptc:        p.ptc          || [],
    groups:     p.groups       || [],
    costGridRef:  versionId ? { cgId, versionId } : null,
    my_permission: p.my_permission || 'owner',
    version:    p.version,
    links:      Array.isArray(p.links) ? p.links : [],
  };
}

// Load all projects from the API into the in-memory config.
async function loadConfigFromApi() {
  try {
    const projects = await Api.projects.list();
    config.projects = projects.map(_apiProjectToLocal);
  } catch (e) {
    console.warn('[sync] loadConfigFromApi:', e.message);
  }
}

// The project writes, on the save contract (js/lib/save.js): each answers apiSave's outcome and never throws;
// with `ok`, outcome.project is the server's project in the config.projects shape. A failed write never
// creates the project.

// project-config's Save: PUT /api/projects/:id with the version the draft started from and only the parts
// that differ from `base` (projectSavable of the project as loaded, js/lib/project-draft.js).
async function _saveProject(base, draft) {
  const outcome = await window.apiSave('PUT', `/projects/${encodeURIComponent(draft.id)}`,
    { version: draft.version, ...window.projectChanges(base, draft) });
  if (outcome.kind === 'ok') outcome.project = _apiProjectToLocal(outcome.data);
  return outcome;
}

// Generate project: one request creates the project, its tasks, PTC and link (201 with the project).
async function _generateProject(cgId, versionId, body) {
  const outcome = await window.apiSave('POST', `/cost-grids/${cgId}/versions/${versionId}/projects`, body);
  if (outcome.kind === 'ok') outcome.project = _apiProjectToLocal(outcome.data);
  return outcome;
}

// Add tasks: appends the new tasks only and adds their ids/names to the link.
async function _addTasksToProject(cgId, versionId, projectId, body) {
  const outcome = await window.apiSave('POST',
    `/cost-grids/${cgId}/versions/${versionId}/projects/${encodeURIComponent(projectId)}/tasks`, body);
  if (outcome.kind === 'ok') outcome.project = _apiProjectToLocal(outcome.data);
  return outcome;
}

// ── REPORTING / BUDGET CACHE ─────────────────────────────────────────────────
// Fetches pre-computed budget (fee from cost-grid structure) and actual_hours for
// every project from the reporting endpoint. Indexed by cg_version_id so that
// pipeline-board and portfolio views can show accurate figures without loading
// the full phase/task/role structure for every version.

let _pbBudgets = {}; // versionId → { fee, hours, currency }

async function loadPipelineBudgetsFromApi() {
  try {
    const budgets = await Api.costGrids.budgets();
    _pbBudgets = {};
    for (const [versionId, b] of Object.entries(budgets)) {
      _pbBudgets[versionId] = {
        fee:          parseFloat(b.fee) || 0,
        ptc:          parseFloat(b.ptc) || 0,
        currency:     b.currency || 'EUR',
        currencyRate: parseFloat(b.currencyRate) || 1.0,
      };
    }
  } catch (e) {
    console.warn('[sync] loadPipelineBudgetsFromApi:', e.message);
  }
}

// Returns { fee, hours, currency } for the given cost-grid version ID, or null.
function getPipelineBudget(versionId) {
  return _pbBudgets[versionId] || null;
}

// ── TIMESHEETS ────────────────────────────────────────────────────────────────

// Load all timesheet data from the API into the in-memory timesheetData array.
async function refreshTimesheetDataFromApi() {
  try {
    const sheets = await Api.timesheets.allData();
    timesheetData = [];
    for (const sheet of sheets) {
      // Use the project UUID (from DB join) as the key; fall back to D365 code
      // for orphaned timesheets not matched to any project.
      const pid = sheet.project_id || sheet.project_code;
      const rows = (sheet.data || [])
        .map(r => ({
          date:        r.date ? new Date(r.date) : null,
          role:        r.role        || '',
          owner:       r.owner       || '',
          hours:       parseFloat(r.hours) || 0,
          task:        r.task        || '',
          notes:       r.notes       || '',
          projectId:   pid,
          projectName: r.projectName || r.project_name || '',
        }))
        .filter(r => r.date && r.hours > 0);
      if (!rows.length) continue;
      saveProjectData(pid, rows);
      timesheetData.push(...rows);
    }
  } catch (e) {
    console.warn('[sync] refreshTimesheetDataFromApi:', e.message);
  }
}
