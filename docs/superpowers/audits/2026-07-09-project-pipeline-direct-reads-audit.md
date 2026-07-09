# Project `.pipeline` Direct-Read Consistency Audit

**Date:** 2026-07-09
**Scope:** verification-only. Four specific call sites flagged during the F4 brainstorming session (`docs/superpowers/specs/2026-07-09-generate-project-lock-granularity-design.md`, "Explicitly out of scope") as reading a project's `.pipeline` field directly instead of via `getProjectPipeline()` — the codebase's documented "source of truth" resolver (`js/core.js:315-328`): `js/costgrid.js:156`, `js/pipeline-board.js:64`, `js/planning.js:450`, `js/planning.js:469`. Finding criterion: a **real, concrete divergence** between the direct read and what `getProjectPipeline()` would return, evaluated against the actual mechanisms that keep the two in sync — not "doesn't use the helper function" by itself. For `js/planning.js`, evaluated against an explicit design intent confirmed by the user: Resource Planning deliberately reads a project's own pipeline field, because resource planning only applies once a task has been converted into a project. Any additional divergence-prone site found while verifying these four was to be flagged, isolated, not silently folded in. No exclusions. No code was modified.

## Method

Read all four flagged locations in full context (not just the single matching line). Traced how `config.projects[].pipeline` is written and kept in sync: found and read `cgPropagatePipelineToProjects()` (`js/costgrid.js:1458-1470`) and its sole call site (`js/costgrid.js:1304-1311`, the cost grid editor's Pipeline `<select>` `change` handler) — established during the same conversation, prior to this audit, via direct code reading and confirmed with the user. Confirmed via grep (`dragstart|dragover|drop|draggable` in `js/pipeline-board.js` → no matches) that no drag-and-drop stage-change path exists, so the `change` handler is the only way a cost grid version's pipeline is ever changed. Checked project creation (`cgDoGenerateProject`, `js/costgrid.js:2471`: `pipeline: _cgDraft.pipeline || 'SIP'`) to confirm a newly generated project is seeded with the version's current pipeline at creation time, not a stale default.

## Findings

None. All four flagged sites are correct as written; see Ruled out below for the evidence and reasoning per site.

## Ruled out (checked, no divergence found)

### `js/costgrid.js:140-167` (`cgLiveVersionBadge`) and `js/pipeline-board.js:60-68` (`pbGetStage`) — explicitly-labeled legacy fallbacks, already correctly prioritized

- **Evidence — `cgLiveVersionBadge`:**
  ```js
  // js/costgrid.js:140-152
  function cgLiveVersionBadge(v) {
    // Pipeline is now owned by the version itself.
    if (v.pipeline) {
      const s = cgPipelineStyle(v.pipeline);
      return { label: v.pipeline, bg: s.bg, color: s.color, icon: s.icon };
    }
    const lps = v.linkedProjects || [];
    if (!lps.length) return { label: 'Draft', bg: '#6c757d', color: '#fff', icon: ' ✏️' };
    // Legacy fallback: read from linked project.
    ...
    const pipeline = (config.projects || []).find(p => p.id === lp.projectId)?.pipeline;
  ```
- **Evidence — `pbGetStage`:**
  ```js
  // js/pipeline-board.js:60-68
  function pbGetStage(v) {
    if (v.pipeline) return v.pipeline;
    // Legacy fallback for versions saved before the pipeline field existed.
    for (const lp of (v.linkedProjects || [])) {
      const p = (config.projects || []).find(proj => proj.id === lp.projectId)?.pipeline;
      if (p) return p;
    }
    return 'SIP';
  }
  ```
- **Reasoning:** both functions check `v.pipeline` (the version's own field — the exact same source `getProjectPipeline()` treats as authoritative) **first**, and only fall through to reading a linked project's `.pipeline` when `v.pipeline` is falsy. Both explicitly comment this as a fallback for data that predates the `pipeline` field's existence on cost grid versions, not a routine code path. Since every version created going forward always has `pipeline` set (`newVer.pipeline = 'Draft'` at creation, confirmed during the F4 cycle's own investigation, `js/costgrid.js:2150`) and the field is actively maintained by `cgPropagatePipelineToProjects` thereafter, the fallback branch in both functions is unreachable for any version created after the `pipeline` field was introduced — it exists purely for legacy pre-migration data. This is the opposite of the F4 bug pattern (which read a linked project's field **unconditionally**, ignoring the version's own field entirely) — here the version's own field is already correctly prioritized.

### `js/planning.js:448-474` (pipeline filter chips + eligible-projects filter) — intentional design, correctly kept in sync

- **Evidence:**
  ```js
  // js/planning.js:449-451
  const allPipelines = [...new Set(
    (config.projects || []).map(p => p.pipeline || '').filter(p => p && p !== 'Canceled')
  )].sort();
  ```
  ```js
  // js/planning.js:468-474
  const eligibleProjects = (config.projects || []).filter(p => {
    const pipe = p.pipeline || '';
    if (pipe === 'Canceled') return false;
    if (p.status === 'Completed') return false;
    if (portfolioPlanningFilters.size > 0 && !portfolioPlanningFilters.has(pipe)) return false;
    return true;
  });
  ```
- **Reasoning:** confirmed with the user this is deliberate — Resource Planning operates on projects, not proposals, and a project's own `pipeline` field is the intended read for this view regardless of whether the project originated from a cost grid. This is not a "should use `getProjectPipeline()` instead" situation the way F4 was.
  The remaining question was whether `proj.pipeline` can actually go **stale** relative to its source cost grid version's pipeline, which would make this view show outdated data even though reading the project's own field is the right design. Traced this precisely: `cgPropagatePipelineToProjects()` (`js/costgrid.js:1458-1470`) iterates **every** entry in `_cgDraft.linkedProjects` (not just one), so a version that has generated multiple projects from different tasks gets all of them updated in the same pass. It fires on every change of the Pipeline `<select>` in the cost grid editor (`js/costgrid.js:1304-1311`), and that `<select>`'s `change` event is the **only** way a version's pipeline is ever changed — confirmed no drag-and-drop or other stage-mutation path exists in `js/pipeline-board.js`. A newly generated project is seeded with the version's current pipeline at creation (`js/costgrid.js:2471`), not a stale default. A manually-created project (no `costGridRef`) has no version to defer to — its own `pipeline` field is correctly the only source, matching `getProjectPipeline()`'s own fallback behavior in that case. Under these confirmed mechanics, `proj.pipeline` cannot diverge from what `getProjectPipeline()` would compute, for any project reachable through the UI.

## Out of scope / roadmap notes

None — verification stayed within the four flagged sites and the specific propagation/creation mechanisms needed to evaluate them; no additional divergence-prone `.pipeline` read was found during this pass.

---

## Synthesis

All four sites flagged from the earlier quick grep turned out, on full-context reading, not to reproduce F4's bug pattern. The two "legacy fallback" sites (`cgLiveVersionBadge`, `pbGetStage`) already correctly prioritize the version's own pipeline and only degrade to reading a linked project's field for data that predates the field's existence — explicitly commented as such. The two Resource Planning sites read a project's own field by deliberate design, and that field is kept correctly in sync by `cgPropagatePipelineToProjects`, which was independently traced and confirmed (together with the user, prior to this audit) to run on every pipeline change and cover every linked project. No fix is warranted for any of the four.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
