# js/ai.js — Task/Role Matching & Null-Safety Consistency Audit

**Date:** 2026-07-08
**Scope:** verification-only. `js/ai.js` and its downstream data boundaries — `config.projects` (task/resource shape) and `timesheetData` (uploaded actuals) — followed as far as needed to establish root cause, not stopped at the file boundary. Finding criterion: behavioral divergence from equivalent patterns elsewhere in the codebase, primarily the canonical task/role-matching functions in `js/lib/planning-calc.js` (the corrected version that emerged from the Resource Planning audit's Ciclo 2–3 fixes) and from `js/planning.js`'s own use of them. Security-adjacent findings included only where they emerged incidentally, not as a primary objective. Generic style/duplication (including the deliberate three-provider fetch duplication in `aiPlanSend`/`callAi`, confirmed not to diverge between providers — see Ruled out) is explicitly excluded from this audit's scope per negotiated agreement. No code was modified.

## Method

Read `js/ai.js` in full (574 lines) and `js/lib/planning-calc.js` in full. Grepped `js/planning.js` for `matchesTaskRole`/`computeResidual` call sites (lines 605, 609, 617, 1027, 1029, 1310, 1330) to confirm the canonical pattern is used consistently there. Traced `js/ai.js`'s data consumption back to its source: `config.projects[].tasks[].resources[]` (project/cost-grid config) and `timesheetData[]` (uploaded actuals), and read `api/src/routes/timesheets.js`'s column-mapping logic (lines 100-126, 201-204) to confirm which fields can be `null` in stored timesheet rows.

## Findings

### F1 — `js/ai.js` never uses the canonical `matchesTaskRole`, and its own task/role matching is case-sensitive where the canonical version is case-insensitive
- **Type:** INCONSISTENT
- **Severity:** Important
- **Location:** `js/ai.js:18` (`const tRecs = projData.filter(r => r.task === t.name);`), `js/ai.js:22` (`const rRecs = tRecs.filter(r => r.role === res.role);`), `js/ai.js:55` (`const rRecs = projData.filter(r => r.role === res.role && (!task.name || r.task === task.name));`)
- **Evidence:**
  ```js
  // js/lib/planning-calc.js:1-5 — the canonical, shared implementation
  export function matchesTaskRole(record, taskName, role) {
    const roleMatches = (record.role || '').toLowerCase() === (role || '').toLowerCase();
    const taskMatches = !taskName || (record.task || '').toLowerCase() === taskName.toLowerCase();
    return roleMatches && taskMatches;
  }
  ```
  ```js
  // js/ai.js:16-22 (buildPlanningContext) — independent, exact-match reimplementation
  tasks.forEach(t => {
    const tSold  = (t.resources || []).reduce((s, r) => s + (r.soldHours || 0), 0);
    const tRecs  = projData.filter(r => r.task === t.name);          // exact, case-sensitive
    ...
    (t.resources || []).forEach(res => {
      const rRecs = tRecs.filter(r => r.role === res.role);          // exact, case-sensitive
  ```
  `js/planning.js:605,617,1027,1310` all call `matchesTaskRole(r, task.name, res.role)` for the equivalent by-role/by-project/by-owner computations.
- **Description / root cause:** `matchesTaskRole` was extracted to `js/lib/planning-calc.js` specifically because the Resource Planning audit found role/task matching had drifted across `js/planning.js`'s three views (case-sensitivity was one of the original defects). `js/ai.js` was never updated to consume this shared function — it predates or was never touched by that consolidation, and independently reimplements the same match with a weaker, case-sensitive comparison. Effect: if a timesheet row's `task`/`role` text differs in case from the project config's `task.name`/`res.role` (e.g. an owner typed "design" in the XLS while the task is configured as "Design"), `js/planning.js`'s views correctly match it, but the AI planning assistant's context (`buildPlanningContext`, feeding the chat sidebar) silently excludes that data from `consumed`/`tbp` calculations — the assistant gives numerically wrong answers with no error or indication anything was dropped.

### F2 — Unguarded `.toLowerCase()` on `r.task`/`r.role` crashes when a timesheet row has an unmapped task or role column
- **Type:** MISSING (null-safety)
- **Severity:** Important
- **Location:** `js/ai.js:254` (`buildProjectSummary`), `js/ai.js:454-455` and `js/ai.js:473-474` (`buildResourceAllocationSummary`)
- **Evidence:**
  ```js
  // js/ai.js:254
  const td  = data.filter(r => r.task.toLowerCase() === task.name.toLowerCase());
  ```
  ```js
  // js/ai.js:453-456
  const consumed = data
    .filter(r => r.task.toLowerCase() === task.name.toLowerCase()
              && r.role.toLowerCase() === res.role.toLowerCase())
    .reduce((s, r) => s + r.hours, 0);
  ```
  ```js
  // api/src/routes/timesheets.js:123-126 — confirms task/role CAN be null in stored data
  role:        colRole     ? String(row[colRole] ?? '').trim() : null,
  owner:       colOwner    ? String(row[colOwner] ?? '').trim(): null,
  ...
  task:        colTask     ? String(row[colTask] ?? '').trim() : null,
  ```
  The canonical `matchesTaskRole` (`js/lib/planning-calc.js:2-3`) guards both fields: `(record.role || '')`, `(record.task || '')` before calling `.toLowerCase()`.
- **Description / root cause:** `resolveColumnMap` (`api/src/routes/timesheets.js:201-204`) only matches a `task`/`role` column if the uploaded XLS has a recognizable header; if not found, `colTask`/`colRole` is falsy and the row is stored with `task: null` / `role: null`. `buildProjectSummary` and `buildResourceAllocationSummary` call `.toLowerCase()` directly on `r.task`/`r.role` with no `|| ''` fallback, so any project with at least one timesheet row missing a mapped task or role column throws `TypeError: Cannot read properties of null (reading 'toLowerCase')` inside the AI Analysis / Resource Allocation Analysis flow — the whole modal fails, not just that row. This is the exact "null-safety" bug class the Resource Planning audit found three times in `js/planning.js` (now fixed there via `matchesTaskRole`'s guards), reproduced independently in `js/ai.js` because it doesn't call the shared function.
- Contrast: `buildPlanningContext` (`js/ai.js:18,22`) does *not* call `.toLowerCase()` at all (see F1) and so happens not to crash on the same null data — it just silently mismatches instead. The two functions fail differently on the same underlying data gap, which is itself part of the inconsistency.

### F3 — `t.resources` is defensively guarded in `buildPlanningContext` but not in `buildProjectSummary`, within the same file
- **Type:** INCONSISTENT (null-safety)
- **Severity:** Minor
- **Location:** `js/ai.js:12-13` (`(t.resources || [])`, guarded) vs. `js/ai.js:225-226` (`t.resources.reduce(...)`, unguarded)
- **Evidence:**
  ```js
  // js/ai.js:12-13 (buildPlanningContext)
  const tasks = proj.tasks || [];
  ...tasks.reduce((s, t) => s + (t.resources || []).reduce((ss, r) => ss + (r.soldHours || 0), 0), 0);
  ```
  ```js
  // js/ai.js:225-226 (buildProjectSummary)
  const soldH   = cfg.tasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0);
  ```
- **Description / root cause:** Both functions read the same conceptual field (`project.tasks[].resources[]`) from the same data source (`config.projects`), but `buildPlanningContext` defends against a missing `resources` array while `buildProjectSummary` assumes it is always present and populated (also assuming every resource has `hourlyRate`, unlike `buildPlanningContext`'s `(r.soldHours || 0)`). If a task is ever saved with `resources` absent (e.g. a partially-configured task, or a data shape predating a schema field), `buildProjectSummary`/`openAiAnalysis` throws; `buildPlanningContext`/the chat sidebar does not. No evidence was found that the API currently allows saving a task without `resources`, so this is a latent inconsistency rather than a confirmed reproducible crash — flagged because it's the same defensive-guarding gap as F2, on adjacent code in the same file.

### F4 — "No AI key configured" guard differs between the chat sidebar and the two analysis-modal entry points
- **Type:** INCONSISTENT
- **Severity:** Medium
- **Location:** `js/ai.js:93-103` (`aiPlanSend`) vs. `js/ai.js:378-379` / `js/ai.js:515-516` (`openAiAnalysis` / `openPlanningAiAnalysis`, both via `hasAiKey()`)
- **Evidence:**
  ```js
  // js/ai.js:93-103 (aiPlanSend) — checks the currently-selected provider's own key
  const provider = appSettings.aiProvider || 'anthropic';
  const keys     = { anthropic: appSettings.anthropicApiKey, openai: appSettings.openaiApiKey, gemini: appSettings.geminiApiKey };
  const apiKey   = (keys[provider] || '').trim();
  if (!apiKey) { showConfirm(...); return; }
  ```
  ```js
  // js/ai.js:378-379 (openAiAnalysis)
  if (!hasAiKey()) { showConfirm(...); return; }
  ```
  `hasAiKey()` is defined in `js/core.js` as `!!(appSettings.anthropicApiKey || appSettings.openaiApiKey || appSettings.geminiApiKey)` — true if *any* provider has a key, regardless of which provider is currently selected.
- **Description / root cause:** the two features were built independently and never unified on one guard. If a user has saved only an OpenAI key but `appSettings.aiProvider` is `'anthropic'`, `aiPlanSend`'s chat correctly blocks with a friendly "no key for Anthropic" message; `openAiAnalysis`/`openPlanningAiAnalysis` instead pass the `hasAiKey()` check, proceed to call `callAi()` (`js/ai.js:330-336`) with an empty `apiKey` for the selected provider, and the failure surfaces as a raw HTTP/provider error in the modal instead of the same friendly guard. Same underlying condition, two different user-facing outcomes depending on which of the three AI entry points is used.

### F5 — Overlap detection can conflate two different, unfilled role slots into one "resource," producing a false-positive overlap warning — an independent defect, not merely inherited from F2/F3
- **Type:** INCORRECT (false-positive output)
- **Severity:** Medium
- **Location:** `js/ai.js:471-476` (owner-key construction, `ownerMap` build), `js/ai.js:498-509` (overlap-pair detection loop) — both inside `buildResourceAllocationSummary`
- **Evidence:**
  ```js
  // js/ai.js:471-476
  const owners = [...new Set(
    data.filter(r => r.task.toLowerCase() === task.name.toLowerCase()
                  && r.role.toLowerCase() === res.role.toLowerCase())
        .map(r => r.owner).filter(Boolean)
  )];
  const keys = owners.length ? owners : [res.role]; // fallback to role if no XLS data
  ```
  ```js
  // js/ai.js:498-509
  for (let i = 0; i < asgns.length; i++) {
    for (let j = i + 1; j < asgns.length; j++) {
      const a = asgns[i], b = asgns[j];
      if (a.start > b.end || b.start > a.end) continue;
      ...
      lines.push(`  ⚠ OVERLAP [${a.task}] + [${b.task}]: ${oWks} weeks, combined ≈${combo}h/wk on this project`);
    }
  }
  ```
- **Description / does it inherit F2/F3, or is it distinct?** **Both, at different layers — but the false-positive itself is an independent bug, not a downstream symptom of F2 or F3.**
  - **Shared location, not shared cause:** line 472-473's `.toLowerCase()` calls are the same unguarded call already cited in F2 (F2's second location). If `r.task`/`r.role` is `null` here, this throws before `buildResourceAllocationSummary` reaches the overlap loop at all — that crash path is F2's, not a new defect; no separate fix is needed for it beyond F2's.
  - **The independent defect** is the `owners.length ? owners : [res.role]` fallback on line 476, and it requires none of F2's or F3's conditions to trigger. It fires whenever a task/role combination simply has **no timesheet rows yet** for a task — a normal, legitimate state for any not-yet-staffed or not-yet-started task, with fully well-formed, non-null data. In that case the code uses the **role name itself** (`res.role`, e.g. `"Backend Developer"`) as the `ownerMap` key, as if it were a person's name. If a second, different task in the same project also requires the same role and also has no timesheet rows yet, its assignment lands under the *same* fallback key. The pair then enters the `asgns` array for that "resource" and is evaluated by the date-overlap loop (line 498-509) exactly as if both assignments belonged to one real person — producing `⚠ OVERLAP [Task A] + [Task B]: ... combined ≈Xh/wk on this project` for two open, unstaffed role slots that may end up filled by two entirely different people, or one, or neither.
  - **Why this matters independently:** even a complete fix of F2 (null-guard `.toLowerCase()`) and F1 (case-insensitive matching everywhere) would not remove this defect — it is triggered by the *absence* of matching timesheet data, not by a matching failure on present data. The root cause is the design choice to substitute a role name for an unknown owner identity and then feed that substitute into person-level overlap math, not a data-quality or matching-consistency gap.
- **Fix sketch (not applied, per Step 4):** either exclude fallback (`[res.role]`) entries from the overlap-pair loop entirely (skip `asgns` bucket keys that are role-fallback rather than real owners — e.g. track provenance with a flag when pushing), or label such buckets distinctly in the output (e.g. `"Unassigned — Backend Developer"` per task, never merged across tasks) so two different open slots are never compared as one person's schedule.

## Ruled out (checked, no divergence found)

- **Three-provider (Anthropic/OpenAI/Gemini) fetch duplication in `aiPlanSend` and `callAi`:** explicitly out of scope per negotiated agreement (deliberate design, not a defect) — checked anyway for *inter-provider* inconsistency and found none: all three branches within `aiPlanSend` use the same `max_tokens`/fallback-message convention as each other, and all three within `callAi` do likewise (`js/ai.js:117-165`, `:337-375`). No provider handles a case the other two don't.
- **`owner` field null-safety:** `r.owner?.trim() || '—'` (`js/ai.js:26,36,58`) correctly uses optional chaining and a fallback — consistent, no crash risk, unlike `task`/`role` (F2).
- **Date handling in `buildResourceAllocationSummary`/`buildPlanningContext`:** both correctly reuse the shared `parseTaskDate()` from `js/core.js` (`js/ai.js:52,442-443,467-468`) rather than reimplementing date parsing — no divergence from the codebase's date-handling convention.

## Out of scope / roadmap notes

- **Italian user-facing strings** (`js/ai.js:101,130,144,162,164,180-183,375,381-382,518-519`) violate `CLAUDE.md`'s English-only rule and are the only such occurrence in `js/*.js`. Not counted as a finding here — this is a UI-copy/style matter, which the negotiated scope for this audit explicitly assigned to the separately-queued repo-hygiene audit, not this one. Flagged here only so it isn't lost.
- **Assistant chat messages rendered into `innerHTML` without escaping** (`js/ai.js:189-190`), while the sibling user-message branch three lines above (`js/ai.js:187`) escapes via `esc()`, and every other dynamic-content-into-`innerHTML` site found in the codebase (`js/pipeline-board.js:153,281,284,289,292,300,382,385-387`) escapes. This surfaced incidentally while reading the file for F1/F2, not as a target of this audit. It is security-adjacent (the assistant text originates from a third-party LLM response that can echo back untrusted upstream data assembled in `buildPlanningContext`) rather than a matching/null-safety issue, so it's noted here rather than folded into the main findings — a proper security-review pass would be the right place to size and prioritize it.

---

## Synthesis

F1 and F2 share the same root cause: `js/ai.js` was written independently of the `js/lib/planning-calc.js` extraction and never migrated to use `matchesTaskRole`/`computeResidual`, so it reimplements the same task/role matching four separate times (`buildPlanningContext` ×2 call sites, `buildProjectSummary`, `buildResourceAllocationSummary`), each with different case-sensitivity and null-safety behavior instead of one behavior inherited from the shared, already-fixed function. F3 is a milder instance of the same missing-defensive-guard pattern on adjacent data. F4 is a separate, unrelated inconsistency (guard logic, not matching logic) between the file's three independently-built entry points into AI functionality.

F5 sits in the same code region as F2 (same unguarded `.toLowerCase()` call, same crash risk, no separate fix needed there beyond F2's) but is not caused by F2 or F3 — it fires on well-formed, non-null data whenever a task/role slot is legitimately unstaffed, and the defect is a design choice (substituting a role name for an unknown owner identity in person-level overlap math), not a matching or null-safety gap. A fix for F1–F3 alone would leave F5 unaffected.
