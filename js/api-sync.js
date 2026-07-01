// ── API SYNC LAYER ────────────────────────────────────────────────────────────
// Strategy: in-memory variables are the UI cache; API is the source of truth.
//
//   • On page load  → call cgSyncFromApi() / loadConfigFromApi() /
//                     refreshTimesheetDataFromApi() to seed in-memory state
//                     from the server before rendering.
//   • On user action → update in-memory state immediately (instant UI),
//                     then fire an async API call in background.
//
// All API calls are fire-and-forget: errors are logged but never block the UI.

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
    if (!cg) return;
    const ver = cg.versions.find(v => v.versionId === versionId);
    if (!ver) return;

    if (Array.isArray(struct.phases)) {
      const rolesMap = new Map(); // code → { label, rate }

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
              const isCustom = override != null;
              if (!rolesMap.has(code)) rolesMap.set(code, { label, rate, isCustom });
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

      // Rebuild role columns from task_roles.
      // If all roles in DB have rate_override (isCustom=true), always refresh so
      // changes saved in another session are picked up. If any role still lacks
      // rate_override (proposal saved before the fix that always snapshots rate_override),
      // only set when empty to preserve client-side ratecard rates that cgSyncRoleRatesToBaseline applies.
      if (rolesMap.size) {
        const allHaveOverride = [...rolesMap.values()].every(r => r.isCustom);
        if (allHaveOverride || !ver.roles?.length) {
          ver.roles = [...rolesMap.entries()].map(([code, { label, rate, isCustom }]) => ({
            roleCode:     code,
            roleLabel:    label,
            rate,
            rateIsCustom: isCustom || false,
          }));
        }
      }
    }

    cgSave(cg);
  } catch (e) {
    console.warn('[sync] cgLoadStructureFromApi:', e.message);
  }
}

// Upsert a cost grid + one version to the API.
// Used by cgAutoSave and version create/duplicate operations.
async function _cgUpsertVersionToApi(cgId, versionId) {
  const cg = cgLoad(cgId);
  if (!cg) return;
  const ver = cg.versions.find(v => v.versionId === versionId);
  if (!ver) return;

  // Upsert the grid itself (name)
  try {
    await Api.costGrids.update(cgId, { name: cg.name });
  } catch {
    try { await Api.costGrids.create({ id: cgId, name: cg.name }); }
    catch (e) { console.warn('[sync] grid upsert failed:', e.message); return; }
  }

  // Upsert the version metadata
  const { phases, roles, ...meta } = ver;
  const serverMeta = {
    label:          meta.versionLabel,
    pipeline:       meta.pipeline    || null,
    startDate:      meta.startDate   || null,
    endDate:        meta.endDate     || null,
    currency:       meta.currency || 'EUR',
    currencyRate:   parseFloat((window.__currencies || []).find(cu => cu.code === (meta.currency || 'EUR'))?.current_rate) || 1.0,
    note:           meta.note        || '',
    status:         meta.status      || 'draft',
    projectName:    meta.projectName || '',
    linkedProjects: meta.linkedProjects || [],
    ratecardId:     meta.ratecardId  || null,
    clientId: (meta.clientId && meta.clientId !== '__unassigned__') ? meta.clientId : null,
  };
  try {
    await Api.costGrids.versions.update(cgId, versionId, serverMeta);
  } catch {
    try { await Api.costGrids.versions.create(cgId, { id: versionId, ...serverMeta }); }
    catch (e) { console.warn('[sync] version upsert failed:', e.message); return; }
  }

  // Save phase/task/role structure only if it was explicitly loaded this session.
  // If phases is empty here, the structure was never loaded — don't wipe existing DB data.
  if (phases && phases.length > 0) {
    try {
      await Api.costGrids.versions.saveStructure(cgId, versionId, {
        phases,
        roles: roles || [],
      });
    } catch (e) {
      console.warn('[sync] structure save failed:', e.message);
    }
  }
}

// ── PROJECTS / CONFIG ─────────────────────────────────────────────────────────

// Resolve the cost-grid ID for a version using the in-memory _cgStore.
function _resolveCgIdForVersion(versionId) {
  if (!versionId) return null;
  for (const [cgId, cg] of _cgStore) {
    if ((cg.versions || []).some(v => v.versionId === versionId)) return cgId;
  }
  return null;
}

// Normalise a server project into the frontend config.projects shape.
function _apiProjectToLocal(p) {
  const versionId = p.cg_version_id || null;
  const cgId      = versionId ? _resolveCgIdForVersion(versionId) : null;
  return {
    id:         p.id,
    code:       p.code         || '',
    name:       p.name         || '',
    programId:  p.programId    || p.program_id  || '',
    clientId:   p.clientId     || p.client_id   || '',
    startDate:  p.startDate    || p.start_date  || '',
    endDate:    p.endDate      || p.end_date    || '',
    currency:   ({ EUR: '€', USD: '$', GBP: '£' }[p.currency] || p.currency || '€'),
    pipeline:   p.pipeline     || '',
    status:     p.status       || '',
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

// Upsert a single project and its sub-resources to the API (fire-and-forget).
async function _pushProjectToApi(project) {
  if (!project?.id) return;
  const { tasks, phasing, planning, ptc, groups, costGridRef, ...meta } = project;

  // Carry the cost-grid version link into the API payload
  if (costGridRef?.versionId) meta.cgVersionId = costGridRef.versionId;

  // Convert currency symbol to ISO code for the currencies FK column
  const currencySymbolMap = { '€': 'EUR', '$': 'USD', '£': 'GBP' };
  if (meta.currency) {
    const trimmed = meta.currency.trim();
    meta.currency = currencySymbolMap[trimmed] || trimmed || 'EUR';
  }

  // Sanitize clientId: the frontend uses sentinel values like '__unassigned__'
  // which are not valid UUIDs and would cause a PostgreSQL type error.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (meta.clientId && !uuidRe.test(meta.clientId)) meta.clientId = null;

  // Upsert core metadata
  try {
    await Api.projects.update(project.id, meta);
  } catch {
    try { await Api.projects.create({ ...meta, id: project.id }); }
    catch (e) { console.warn('[sync] project upsert failed:', e.message); return; }
  }

  // Tasks
  if (tasks && tasks.length) {
    try { await Api.projects.saveTasks(project.id, tasks); }
    catch (e) { console.warn('[sync] tasks save failed:', e.message); }
  }

  // Phasing
  if (phasing && Object.keys(phasing).length) {
    try { await Api.projects.phasing(project.id, phasing); }
    catch (e) { console.warn('[sync] phasing save failed:', e.message); }
  }

  // PTC
  if (ptc && ptc.length) {
    try { await Api.projects.ptc(project.id, ptc); }
    catch (e) { console.warn('[sync] ptc save failed:', e.message); }
  }

  // Monthly hour planning
  if (planning && Object.keys(planning).length) {
    try { await Api.projects.planning(project.id, planning); }
    catch (e) { console.warn('[sync] planning save failed:', e.message); }
  }

  // Functional role groups
  if (groups && groups.length) {
    try { await Api.projects.groups(project.id, groups); }
    catch (e) { console.warn('[sync] groups save failed:', e.message); }
  }
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
