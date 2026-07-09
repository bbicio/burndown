# Proposal→Project: Status Options & Generate-Project Lock Audit

**Date:** 2026-07-09
**Scope:** verification-only. Two user-reported divergences, followed downstream rather than stopped at the two files first suspected: (1) the project Status dropdown's available options per pipeline stage (`project-config.html`, actually driven by `js/core.js`) and (2) the "Generate Project" button's visibility logic in the cost grid editor (`costgrid.html` / `js/costgrid.js`), including the task↔project mapping it depends on. Finding criterion: both a code behavior contradicting expectations *and* a behavior that matches the code exactly but was never explicitly decided anywhere count as valid findings — confirmed explicitly with the user. Ground truth: checked `PRD.md` and `CLAUDE.md` first; where neither documents the rule, stated explicitly rather than assumed. No exclusions. No code was modified.

## Method

Grepped `project-config.html` for the Status `<select>` and traced who actually populates its options at runtime (`cfgApplyPipelineRules`, `js/core.js:391-421`, called from `js/config-form.js:105` on every form load and `js/main.js:137` on every pipeline change). Cross-checked the allowed-status map against `statusBadge`/`statusBadgeLarge` (`js/core.js:330-349`) and every other `p.status`/`config.projects[].status` consumer found via grep, and against `PRD.md`'s and `CLAUDE.md`'s documented pipeline-stage vocabulary. For the Generate Project button, traced `js/costgrid.js:376-387`'s visibility condition back to `cgGetVersionLockState` (`js/costgrid.js:105-130`) and `cgGetAssignedTaskIds`/`cgGetAssignedTaskNames` (`js/costgrid.js:2810-2824`), and checked `PRD.md` for a documented lock rule (found at `PRD.md:155-156`).

## Findings

### F1 — "Started At Risk" is excluded from the allowed Status options for `Committed`, asymmetric with `Expected`/`Anticipated`, with no documented reason
- **Type:** MISSING (likely authoring gap, not a decided rule)
- **Severity:** Important
- **Location:** `js/core.js:391-403` (`cfgApplyPipelineRules`'s `allowed` map)
- **Evidence:**
  ```js
  // js/core.js:394-402
  const allowed = {
    'SIP':              [],
    'Expected':         ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
    'Anticipated':      ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
    'Committed':        ['Started', 'Put on hold', 'Complete'],
    'Started':          ['Started', 'Started At Risk', 'Put on hold', 'Complete'],
    'Started at risk':  ['Started', 'Started At Risk', 'Put on hold', 'Complete'],
    'On Hold':          ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
    'Canceled':         null, // keep value, disable
  };
  ```
  This function entirely regenerates the `<select>`'s options (`js/core.js:415-419`) every time it runs, so the static markup at `project-config.html:65` (which does list all five statuses, including `Started At Risk`, for every pipeline) is overwritten and irrelevant in practice.
- **Description / root cause:** `Expected` and `Anticipated` both allow `Started At Risk`; `Committed` — the one stage where a project is actually underway with real delivery risk — does not, so a project that has started and is genuinely at risk while `Committed` has no matching status to select. `PRD.md` does not document the relationship between pipeline stage and allowed project status at all (only a generic "Status | select | Project status" row, `PRD.md:281`) — there is no written decision to check this against, confirming the user's own suspicion that this may never have been decided rather than being an active bug. The asymmetry is best explained by F3 below: the map that defines this rule appears to have been authored by conflating status-list values with pipeline-stage keys, which is consistent with one stage's list being wrong relative to its neighbors.

### F2 — The dynamically-written "Complete" status value doesn't match "Completed", which every other consumer expects
- **Type:** INCONSISTENT (value mismatch)
- **Severity:** Important
- **Location:** `js/core.js:393-402` (writes `'Complete'`) vs `js/core.js:330-349` (`statusBadge`/`statusBadgeLarge`, key on `'Completed'`) vs `js/planning.js:471` (filters on `'Completed'`) vs `project-config.html:65` (static markup option value `'Completed'`)
- **Evidence:**
  ```js
  // js/core.js:393 — every option list cfgApplyPipelineRules can produce ends in 'Complete'
  const allOpts = ['Not started yet', 'Started At Risk', 'Started', 'Put on hold', 'Complete'];
  ```
  ```js
  // js/core.js:330-334 (statusBadge) — keys on 'Completed', falls through to the default/grey style for 'Complete'
  const style = { ..., 'Completed':'background:var(--brand-navy);color:#fff' }[s] || 'background:var(--text-disabled);color:#fff';
  ```
  ```js
  // js/planning.js:471 — Resource Planning's eligible-projects filter
  if (p.status === 'Completed') return false;
  ```
  ```html
  <!-- project-config.html:65 — static markup, before JS overwrites it -->
  <option value="Completed">Completed</option>
  ```
- **Description / root cause:** `cfgApplyPipelineRules` is called on every config-form load and every pipeline change (`js/config-form.js:105`, `js/main.js:137`), so in practice a project's status can only ever be *saved* as `'Complete'` through this UI — the static `'Completed'` option value only exists momentarily before JavaScript replaces it. Consequence: any project marked complete through the normal UI flow (a) never gets the navy "Completed" badge color — it silently falls back to the same grey style as "Not started yet" — and (b) is never excluded from the Resource Planning view's eligible-projects list (`js/planning.js:471`), since that filter checks for a string value the dropdown never actually produces. This reads as the same "written by two different authors/times, never reconciled" pattern found in the 2026-07-09 clients/programs audit: the static HTML (matching `statusBadge`'s expectation) and the dynamic rule engine (using the shorter form) diverged and nothing has cross-checked them since.

### F3 — The `allowed` map's keys include values that are not valid pipeline stages
- **Type:** INCONSISTENT (dead/invalid map entries)
- **Severity:** Minor
- **Location:** `js/core.js:394-401` vs `CLAUDE.md:231` ("Valid stages: `SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`.")
- **Evidence:** the `allowed` map (quoted in F1) has entries keyed `'Started'`, `'Started at risk'`, and `'On Hold'` — none of these is a valid pipeline stage. `cfgApplyPipelineRules`'s `pipeline` parameter is always one of the five stages in `CLAUDE.md:231` (confirmed by its two call sites, `js/config-form.js:105` passing `effectivePipeline`, and `js/main.js:137` passing `cfgPipeline`'s select value, which only ever contains the five valid stages), so these three map entries can never be looked up — dead code.
- **Description / root cause:** these three keys are suspiciously close to *status* values (`'Started At Risk'` the status vs. `'Started at risk'` the dead map key, differing only in capitalization) rather than pipeline stages — the strongest available evidence for how F1 happened: whoever wrote this map appears to have partly confused the two vocabularies (pipeline stages vs. project statuses) while authoring it, which would also explain why `Committed`'s list doesn't follow the same pattern as its neighbors `Expected`/`Anticipated`.

### F4 — "Generate Project" is hidden the moment any one linked project reaches Committed, even if other tasks in the same version are still unmapped — matches documented behavior, but the documentation doesn't address this workflow
- **Type:** SPEC GAP (code matches `PRD.md`, but `PRD.md` doesn't address the reported scenario)
- **Severity:** Important
- **Location:** `js/costgrid.js:376-387` (button visibility) → `js/costgrid.js:105-130` (`cgGetVersionLockState`) vs `PRD.md:155-156`
- **Evidence:**
  ```js
  // js/costgrid.js:381-387
  const assignedIds   = cgGetAssignedTaskIds();
  const assignedNames = cgGetAssignedTaskNames();
  const _isTaskAssigned = t => assignedIds.has(t.taskId) || assignedNames.has(t.taskName?.trim().toLowerCase());
  const hasFreeTasks = (v.phases || []).flatMap(ph => ph.tasks).some(t => t.taskName?.trim() && !_isTaskAssigned(t));

  const genBtn = document.getElementById('btnCgGenerateProject');
  if (genBtn) genBtn.style.display = (isLocked || isDraft || !hasFreeTasks) ? 'none' : '';
  ```
  ```js
  // js/costgrid.js:118-127 — cgGetVersionLockState
  const hasCommitted = (thisVer?.linkedProjects || []).some(lp => {
    const proj = (config.projects || []).find(p => p.id === lp.projectId);
    return proj?.pipeline === 'Committed';
  });
  if (hasCommitted) return { locked: true, reason: 'committed', message: 'This version is locked — the linked project has been committed.' };
  ```
  ```
  PRD.md:155-156
  - A version is **locked** when: (a) a Committed linked project exists, or (b) another version in the same grid has a linked project
  - Locked versions display a 🔒 badge and are read-only
  ```
- **Description / root cause:** the button's visibility is `isLocked || isDraft || !hasFreeTasks` — `isLocked` is checked with OR, so it hides the button unconditionally once true, regardless of `hasFreeTasks`. `cgGetVersionLockState` sets `locked: true` the moment **any single** linked project's pipeline is `Committed` (`some(...)`, not tied to which tasks that project covers) — this exactly reproduces the reported behavior: a version with 3 tasks, one already mapped to a project that reached Committed, becomes fully read-only, hiding Generate Project for the 2 still-unmapped tasks. This is not a code bug relative to `PRD.md` — the code does precisely what `PRD.md:155-156` describes ("locked... read-only"). The gap is in the specification itself: `PRD.md` documents *that* a version locks on Committed, but never addresses what should happen to a version's still-unmapped tasks when that lock fires before every task has been assigned to a project — the exact one-version/multiple-projects workflow the user describes as legitimate ("posso avere un task, un progetto ma possono anche avere più task, stesso progetto"). Confirmed this is the correct characterization (bug vs. missing spec) by checking `PRD.md` explicitly rather than assuming the documented rule was meant to cover this case.

## Ruled out (checked, no divergence found)

- **Task↔project assignment tracking** (`cgGetAssignedTaskIds`/`cgGetAssignedTaskNames`, `js/costgrid.js:2810-2824`, and `hasFreeTasks`'s aggregation across `_cgDraft.linkedProjects`, `js/costgrid.js:381-384`): correctly unions assignments across *all* linked projects of a version, so both "many tasks → one project" and "one task each → multiple projects" are tracked correctly. The break in F4 is isolated to the `isLocked` short-circuit, not to how task assignment itself is computed.
- **`SIP` and `Canceled` pipeline stages' Status handling** (`js/core.js:407-413`): `SIP` disables the dropdown entirely (no status applicable pre-deal) and `Canceled` disables it while preserving the existing value — both intentional and consistent with those stages having no meaningful "in-progress" status, not a divergence.

## Out of scope / roadmap notes

None — both divergences and the two incidental findings that emerged while tracing them (F2, F3) stayed within the downstream boundary of the two reported issues (project status options and Generate Project visibility); nothing unrelated surfaced during this audit.

---

## Synthesis

F1, F2, and F3 all trace back to the same `allowed`/`allOpts` construct in `cfgApplyPipelineRules` (`js/core.js:391-403`) being internally inconsistent and never cross-checked against its own consumers (`statusBadge`, `planning.js`'s filter) or against the documented pipeline vocabulary (`CLAUDE.md`) — a single area of code with three distinct, independently-evidenced defects. F4 is unrelated in mechanism (a locking rule, not a status-vocabulary mismatch) but shares the same character: code that does exactly what was written, where what was written was never checked against the full range of legitimate real-world usage (a version producing more than one project over time).

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
