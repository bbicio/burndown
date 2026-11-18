// ── API SYNC LAYER ────────────────────────────────────────────────────────────
// Strategy: in-memory variables are the UI cache; API is the source of truth.
//
//   • On page load  → call cgSyncFromApi() / loadConfigFromApi() /
//                     refreshTimesheetDataFromApi() to seed in-memory state
//                     from the server before rendering.
//   • On user action → the cost grid editor saves with Save, on the save contract
//                     (_cgSaveVersion below, js/lib/save.js); the project writes
//                     below still update in-memory state first and call the API
//                     in the background, logging their errors.

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

// Upsert a single project and its sub-resources to the API. Never throws: resolves to
// { ok, failed } where `failed` lists every step that did not reach the server as
// { part, error } (part: 'project' | 'tasks' | 'phasing' | 'ptc' | 'planning' | 'groups').
// If the core metadata upsert fails the sub-resources are not attempted. Callers that must not
// report success on a partial save (project-config.html's onSave) use this one; the others use
// _pushProjectToApi() below.
async function _pushProjectToApiDetailed(project, { skipEmpty = false } = {}) {
  if (!project?.id) return { ok: false, failed: [{ part: 'project', error: 'Missing project id' }] };
  const { tasks, phasing, planning, ptc, groups, costGridRef, ...meta } = project;

  // Carry the cost-grid version link into the API payload
  if (costGridRef?.versionId) meta.cgVersionId = costGridRef.versionId;

  // Sanitize clientId: the frontend uses sentinel values like '__unassigned__'
  // which are not valid UUIDs and would cause a PostgreSQL type error.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (meta.clientId && !uuidRe.test(meta.clientId)) meta.clientId = null;

  // The project period travels with the tasks (one transaction on the server, PUT /tasks) whenever the
  // tasks are sent, so the header PATCH must not carry it; without tasks to send the PATCH carries it.
  // A fallback POST creates the project and always carries the full period.
  // skipEmpty: costgrid.js callers re-send a whole, possibly stale, in-memory project and never edit these
  // sections, so for them "empty" means "not touched" and must not overwrite the server's data (2026-09-30).
  const nonEmpty = v => Array.isArray(v) ? v.length > 0 : v != null && typeof v === 'object' && Object.keys(v).length > 0;
  const present  = v => Array.isArray(v) || (v != null && typeof v === 'object');
  const wanted   = v => skipEmpty ? nonEmpty(v) : present(v);
  const sendTasks = wanted(tasks);
  const patchMeta = { ...meta };
  if (sendTasks) { delete patchMeta.startDate; delete patchMeta.endDate; }

  // Upsert core metadata
  try {
    await Api.projects.update(project.id, patchMeta);
  } catch (updateErr) {
    // A refusal by the project rules (currency lock, link rules) is final: retrying it as a create would only
    // end in a duplicate-key error that hides the message. Any other failure is treated as "project not there yet".
    if (updateErr?.data?.code === 'PROJECT_RULE' || updateErr?.data?.code === 'DATE_RULE') {
      console.warn('[sync] project update refused:', updateErr.message);
      return { ok: false, failed: [{ part: 'project', error: updateErr.message, code: updateErr.data.code, reason: updateErr.data.error }] };
    }
    try { await Api.projects.create({ ...meta, id: project.id }); }
    catch (e) {
      console.warn('[sync] project upsert failed:', e.message);
      return { ok: false, failed: [{ part: 'project', error: e.message, code: e.data?.code, reason: e.data?.error }] };
    }
  }

  // Sub-resources: tasks, phasing, PTC, monthly hour planning, functional role groups.
  // A section is pushed whenever the project object carries it, even when empty: an empty array/object
  // is how the user clears a section, and skipping it left the old data on the server. Only a section
  // that is absent (undefined/null) is left alone. config.projects items always carry all five
  // (_apiProjectToLocal normalises them), so this never wipes a section the page did not load.
  // Exception: with { skipEmpty: true } (js/costgrid.js) empty sections are not pushed.
  const failed = [];
  const steps = [
    ['tasks',    tasks,    () => Api.projects.saveTasks(project.id, { tasks, period: { startDate: meta.startDate || '', endDate: meta.endDate || '' } })],
    ['phasing',  phasing,  () => Api.projects.phasing(project.id, phasing)],
    ['ptc',      ptc,      () => Api.projects.ptc(project.id, ptc)],
    ['planning', planning, () => Api.projects.planning(project.id, planning)],
    ['groups',   groups,   () => Api.projects.groups(project.id, groups)],
  ];
  for (const [part, value, run] of steps) {
    if (!wanted(value)) continue;
    try { await run(); }
    catch (e) {
      console.warn(`[sync] ${part} save failed:`, e.message);
      failed.push({ part, ...(part === 'tasks' ? { withPeriod: true } : {}), error: e.message, code: e.data?.code, reason: e.data?.error });
    }
  }
  return { ok: failed.length === 0, failed };
}

// Upsert a single project and its sub-resources to the API (fire-and-forget).
// Returns true once the project's core metadata is confirmed to exist server-side, false if that
// upsert itself failed (never throws) — sub-resource failures stay best-effort and don't affect
// this return value (see _pushProjectToApiDetailed() for the full outcome). Callers that need to
// know whether the project is genuinely safe to link to / navigate to (e.g. cgDoGenerateProject)
// should check it.
async function _pushProjectToApi(project, opts) {
  const { failed } = await _pushProjectToApiDetailed(project, opts);
  return !failed.some(f => f.part === 'project');
}

// Delete a project from the API (fire-and-forget).
async function _deleteProjectFromApi(projectId) {
  try { await Api.projects.delete(projectId); }
  catch (e) { console.warn('[sync] project delete failed:', e.message); }
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
