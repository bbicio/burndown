# By Owner: Group by Task Instead of Role — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-13-by-owner-task-grouping-brief.md`.

## Problem

Resource Planning's By Owner view (`js/planning.js`, `renderPortfolioPlanningByOwnerContent`) structures data as **Owner → Project → Role** (`:1298-1401`, pivot; `:1476-1487`, render; `:1505-1510`, in-app help text; `:1434`, CSV export header). Role is redundant at this level — the owner is already identified by name — and the view gives no visibility into which specific task a person is actually working on. That breakdown already exists, correctly, in the By Project view (Project → Task → Role → Owner, `renderPortfolioPlanningByProjectContent`).

## Resolved design decision

Established in `/brainstorming` (this session): show only the tasks an owner has actually worked on, per the actuals — role is dropped from this view's hierarchy entirely (it's already available elsewhere, in By Project). The new hierarchy is **Owner → Project → Task**, where each task row aggregates hours across every role assigned to that task (sold hours summed, actuals summed), attributed to the owner regardless of which role they logged time under.

## Design

### Aggregation: one iteration per task, not per (task, role)

Current code (`js/planning.js:1301-1397`) loops `proj.tasks` → `task.resources` (one role at a time), computing `soldH`/`consumedH`/`roleTbp` per role and pivoting into `pm.roles[res.role]`. The fix collapses the inner role loop into a single per-task aggregation step, reusing `matchesTaskRole` from `js/lib/planning-calc.js` exactly as it already exists — no new shared function needed:

```js
(proj.tasks || []).forEach(task => {
  if (task.completed) return;
  const resources = (task.resources || []).filter(res => rolePassesTeamFilter(res.role));
  if (!resources.length) return;

  const soldH = resources.reduce((s, res) => s + (res.soldHours || 0), 0);
  const taskRecs = projData.filter(r => resources.some(res => matchesTaskRole(r, task.name, res.role)));
  // ... consumedH, computeResidual, ownerTotals, future-week distribution all proceed
  // exactly as today, just computed once per task instead of once per (task, role).
});
```

**Why this over a new task-only matcher** (alternative considered and rejected in `/brainstorming`): a hypothetical `matchesTask(record, taskName)` that ignores role entirely would count any timesheet row matching the task name under *any* role string, including a typo'd or genuinely unrelated role never sold on that task. Filtering `task.resources` by the team filter first, then unioning `matchesTaskRole` per resource, only counts hours logged under a role the task actually has as a sold resource *and* that passes the active team filter — preserving today's team-filter semantics (narrows which roles' contributions count) instead of silently widening them.

### Pivot and render

`pm.roles[res.role]` (`:1380-1382`) becomes `pm.tasks[task.name]`, populated once per task. The row-render block (`:1476-1487`) iterates `pm.tasks` instead of `pm.roles`, displaying `esc(task.name)` instead of `esc(role)`; the CSV export row (`:1485-1486`) pushes the task name in the same column position the role name occupied.

### Documentation strings

- In-app help text (`:1505-1510`): `"Owner → Project → Role"` → `"Owner → Project → Task"`.
- CSV export header (`:1434`): `['Owner', 'Project', 'Role', ...]` → `['Owner', 'Project', 'Task', ...]`.

### Scope boundary (confirmed in `/brainstorming`)

This change is entirely internal to `renderPortfolioPlanningByOwnerContent`. By Project (`renderPortfolioPlanningByProjectContent`) and By Role are separate rendering functions with independent loops — not touched. The shared pure functions (`matchesTaskRole`, `computeResidual`, `distributeFutureResidual`) are consumed differently by By Owner's loop but their signatures and behavior are unchanged, so every other caller is unaffected by construction, not just by intention.

## Testing

`renderPortfolioPlanningByOwnerContent` is a DOM-driven rendering function with no existing automated test coverage (consistent with the other `planning.js` view functions — never extracted to `js/lib/`). The aggregation logic reuses already-tested pure functions (`matchesTaskRole`, `computeResidual`, `distributeFutureResidual`); no new unit coverage is needed for those.

**Manual verification** (browser, after implementation):
1. An owner with logged hours on 2+ tasks in the same project → the view shows one row per task (not per role), with correct hours.
2. A task with multiple sold roles (e.g. Developer + QA) → that task's sold/actuals hours sum both roles into one row.
3. The Team filter applied to only one of a multi-role task's roles → only that role's hours contribute to the task's total (not the whole task, not zero).
4. Cross-check totals against the By Project view for the same project/task — same source data, different aggregation, totals must reconcile.

## Backward compatibility

No change to `matchesTaskRole`/`computeResidual`/`distributeFutureResidual`'s signatures or behavior. No change to By Project or By Role views. No DB or API change — this is a pure frontend aggregation/display change within one rendering function.

## Explicitly out of scope

- By Project view (`renderPortfolioPlanningByProjectContent`) — already correct, not touched.
- The owner/role data-mapping fix (F1/F2, already merged, commit `6f48a12`) — unrelated cycle.
- Any redesign of Resource Planning's UI beyond the By Owner view's third grouping level.
