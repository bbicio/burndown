# By Owner: Group by Task Instead of Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Resource Planning's By Owner view (`js/planning.js`, `renderPortfolioPlanningByOwnerContent`) from a three-level **Owner → Project → Role** hierarchy to **Owner → Project → Task**, aggregating hours across every role assigned to a task into one row per task.

**Architecture:** Collapse the existing per-`(task, role)` inner loop into a single per-task aggregation step inside the same `projects.forEach → task.forEach` structure, reusing `matchesTaskRole`/`computeResidual`/`distributeFutureResidual` from `js/lib/planning-calc.js` unchanged. Rename the third pivot level from `pm.roles[res.role]` to `pm.tasks[task.name]` and update every consumer of that level (row render, CSV export, in-app help text, table column header) in the same pass, since they all read from the same pivot object and must change together to stay internally consistent.

**Tech Stack:** Vanilla JS, no bundler (`js/planning.js` served as-is by nginx). `renderPortfolioPlanningByOwnerContent` is a DOM-driven rendering function with no existing automated test coverage — verification is manual, in-browser, per the approved design spec.

## Global Constraints

- Scope is limited to `renderPortfolioPlanningByOwnerContent` in `js/planning.js` (currently lines 1298–1536). `renderPortfolioPlanningByProjectContent` (By Project view) and the By Role view are separate functions with independent loops — do not touch them.
- No change to `matchesTaskRole`, `computeResidual`, or `distributeFutureResidual` signatures or behavior (`js/lib/planning-calc.js`) — they are consumed differently by this loop, but their code is unchanged.
- A task with multiple sold roles aggregates all roles' hours into one task row: `soldH = resources.reduce((s, res) => s + (res.soldHours || 0), 0)`, and `taskRecs` is the union of `matchesTaskRole(r, task.name, res.role)` across every resource that passes the active team filter — this preserves today's team-filter semantics (narrows which roles count) rather than widening them to "any role, any task match."
- No new task-only matcher (e.g. a hypothetical `matchesTask(record, taskName)` ignoring role) — rejected in the design spec as unsafe (would count hours logged under a role never actually sold on that task).
- The CSV/Excel export (`exportRows`) must stay structurally consistent with the new on-screen grouping: header becomes `['Owner', 'Project', 'Task', ...]`, and the third-level export row's `level` tag stays `'role'` (not renamed to `'task'`) — see Task 1, Step 3 for why.
- No DB or API change. No change to `timesheetData` collection/parsing.

---

## File Structure

- Modify: `js/planning.js` — `renderPortfolioPlanningByOwnerContent` only (pivot-building loop, row render, CSV export header/rows, in-app help text, table column header label).

---

### Task 1: Collapse the per-role pivot into per-task, update render/export/help text

**Files:**
- Modify: `js/planning.js:1298-1536` (`renderPortfolioPlanningByOwnerContent`)

**Interfaces:**
- Consumes (unchanged): `matchesTaskRole(record, taskName, role)`, `computeResidual(soldH, consumedH)`, `distributeFutureResidual(residualH, totalFutureWeeks, weeksByMonth, pulseEnabled)` — all from `js/lib/planning-calc.js`, already loaded as `window.*` bridges before `planning.js` runs (see `CLAUDE.md`'s Script loading order section).
- Produces: no new exported interface — this is a self-contained rewrite of one rendering function's internals. `om.projects[projId].tasks[taskName]` replaces `om.projects[projId].roles[role]` as the third pivot level, consumed only within this same function.

- [ ] **Step 1: Record current behavior as a manual baseline**

Before changing code, open `planning.html` in the browser (`docker compose up`, then `http://localhost/planning.html`), switch to the By Owner view, and note for one owner with a multi-role task: the current role-grouped rows and their Sold/Actuals/To-be-planned values. This baseline is what Step 5's cross-check (By Project totals) and the design spec's manual verification steps will compare against — no code changes yet.

- [ ] **Step 2: Rewrite the pivot-building loop (lines 1301-1400)**

Find this block in `js/planning.js` (starts at line 1301):

```js
  projects.forEach(proj => {
    const projData = timesheetData.filter(r => r.projectId === proj.id);
    (proj.tasks || []).forEach(task => {
      if (task.completed) return;
      const tStart = task.startDate ? parseTaskDate(task.startDate, false) : null;
      const tEnd   = task.endDate   ? parseTaskDate(task.endDate,   true)  : null;
      (task.resources || []).forEach(res => {
        if (!rolePassesTeamFilter(res.role)) return;
        const soldH    = res.soldHours || 0;
        const roleRecs = projData.filter(r => matchesTaskRole(r, task.name, res.role));

        // Past week data + owner totals
        const roleWeekData = {};
        const ownerTotals  = {};
        let totalOwnerH    = 0;

        weeks.forEach(w => {
          if (!w.isPast) return;
          const key  = w.weekStart.toISOString();
          const recs = roleRecs.filter(r => { const d = new Date(r.date); d.setHours(0,0,0,0); return d >= w.weekStart && d <= w.weekEnd; });
          if (!recs.length) return;
          const byOwner = {};
          recs.forEach(r => { const o = r.owner?.trim() || '—'; byOwner[o] = (byOwner[o] || 0) + r.hours; });
          roleWeekData[key] = { total: recs.reduce((s, r) => s + r.hours, 0), byOwner, isPulse: false, isPast: true };
        });
        roleRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; });
        Object.values(ownerTotals).forEach(h => { totalOwnerH += h; });

        const consumedH = totalOwnerH;
        const roleTbp   = computeResidual(soldH, consumedH);
        if (soldH < 0.01 && consumedH < 0.01) return;

        const ownerNames = Object.entries(ownerTotals).filter(([, h]) => h > 0.01).sort((a, b) => b[1] - a[1]).map(([o]) => o);
        const hasOwners  = ownerNames.length > 0;

        // Future week distribution
        if (roleTbp > 0.01) {
          const _owNow = new Date(); const _owTd = new Date(_owNow.getFullYear(), _owNow.getMonth(), _owNow.getDate());
          const futureWeeks = weeks.filter(w => !w.isPast);
          const taskWeeks   = tStart && tEnd ? futureWeeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd) : futureWeeks;
          // Compute canonical count from task date range (stable regardless of view range)
          const totalTaskFw = (tStart && tEnd) ? countFutureTaskWeeks(tStart, tEnd, _owTd) : taskWeeks.length;
          const distribute  = (byOwner, hours) => {
            if (totalOwnerH > 0.01) ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
            else byOwner['—'] = (byOwner['—'] || 0) + hours;
          };

          const monthMap = {};
          taskWeeks.forEach(w => {
            if (!monthMap[w.monthKey]) monthMap[w.monthKey] = [];
            monthMap[w.monthKey].push(w.weekStart.toISOString());
          });
          const weeksByMonth = Object.entries(monthMap).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

          distributeFutureResidual(roleTbp, totalTaskFw, weeksByMonth, portfolioMonthlyPulse).forEach(entry => {
            if (!roleWeekData[entry.key]) roleWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
            roleWeekData[entry.key].total += entry.hours;
            if (entry.isPulse) roleWeekData[entry.key].isPulse = true;
            distribute(roleWeekData[entry.key].byOwner, entry.hours);
          });
        }

        // Pivot into ownerMap
        const displayOwners = hasOwners ? ownerNames : ['—'];
        displayOwners.forEach(ownerName => {
          const isPlaceholder = ownerName === '—';
          const ownerProp    = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
          const ownerSold    = soldH * ownerProp;
          const ownerActuals = ownerTotals[ownerName] || 0;
          const ownerTbpH    = roleTbp * ownerProp;

          if (!ownerMap[ownerName]) ownerMap[ownerName] = { sold: 0, actuals: 0, tbp: 0, weekTotals: {}, projects: {} };
          const om = ownerMap[ownerName];
          om.sold += ownerSold; om.actuals += ownerActuals; om.tbp += ownerTbpH;

          if (!om.projects[proj.id]) om.projects[proj.id] = { name: proj.name || proj.id, sold: 0, actuals: 0, tbp: 0, weekTotals: {}, roles: {} };
          const pm = om.projects[proj.id];
          pm.sold += ownerSold; pm.actuals += ownerActuals; pm.tbp += ownerTbpH;

          if (!pm.roles[res.role]) pm.roles[res.role] = { sold: 0, actuals: 0, tbp: 0, weekData: {} };
          const rm = pm.roles[res.role];
          rm.sold += ownerSold; rm.actuals += ownerActuals; rm.tbp += ownerTbpH;

          weeks.forEach(w => {
            const key = w.weekStart.toISOString();
            const d   = roleWeekData[key];
            if (!d) return;
            const oh = d.byOwner[ownerName] || 0;
            if (oh < 0.001) return;
            if (!rm.weekData[key]) rm.weekData[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
            rm.weekData[key].hours += oh;
            if (!pm.weekTotals[key]) pm.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
            pm.weekTotals[key].hours += oh;
            if (!om.weekTotals[key]) om.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
            om.weekTotals[key].hours += oh;
          });
        });
      });
    });
  });
```

Replace it with (the inner `task.resources.forEach(res => ...)` loop is collapsed into a single per-task block; every `res.role`/`roleRecs`/`roleWeekData`/`roleTbp`/`pm.roles` reference becomes `resources`/`taskRecs`/`taskWeekData`/`taskTbp`/`pm.tasks`):

```js
  projects.forEach(proj => {
    const projData = timesheetData.filter(r => r.projectId === proj.id);
    (proj.tasks || []).forEach(task => {
      if (task.completed) return;
      const tStart = task.startDate ? parseTaskDate(task.startDate, false) : null;
      const tEnd   = task.endDate   ? parseTaskDate(task.endDate,   true)  : null;

      const resources = (task.resources || []).filter(res => rolePassesTeamFilter(res.role));
      if (!resources.length) return;
      const soldH    = resources.reduce((s, res) => s + (res.soldHours || 0), 0);
      const taskRecs = projData.filter(r => resources.some(res => matchesTaskRole(r, task.name, res.role)));

      // Past week data + owner totals
      const taskWeekData = {};
      const ownerTotals  = {};
      let totalOwnerH    = 0;

      weeks.forEach(w => {
        if (!w.isPast) return;
        const key  = w.weekStart.toISOString();
        const recs = taskRecs.filter(r => { const d = new Date(r.date); d.setHours(0,0,0,0); return d >= w.weekStart && d <= w.weekEnd; });
        if (!recs.length) return;
        const byOwner = {};
        recs.forEach(r => { const o = r.owner?.trim() || '—'; byOwner[o] = (byOwner[o] || 0) + r.hours; });
        taskWeekData[key] = { total: recs.reduce((s, r) => s + r.hours, 0), byOwner, isPulse: false, isPast: true };
      });
      taskRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownerTotals[o] = (ownerTotals[o] || 0) + r.hours; });
      Object.values(ownerTotals).forEach(h => { totalOwnerH += h; });

      const consumedH = totalOwnerH;
      const taskTbp   = computeResidual(soldH, consumedH);
      if (soldH < 0.01 && consumedH < 0.01) return;

      const ownerNames = Object.entries(ownerTotals).filter(([, h]) => h > 0.01).sort((a, b) => b[1] - a[1]).map(([o]) => o);
      const hasOwners  = ownerNames.length > 0;

      // Future week distribution
      if (taskTbp > 0.01) {
        const _owNow = new Date(); const _owTd = new Date(_owNow.getFullYear(), _owNow.getMonth(), _owNow.getDate());
        const futureWeeks = weeks.filter(w => !w.isPast);
        const taskWeeks   = tStart && tEnd ? futureWeeks.filter(w => w.weekEnd >= tStart && w.weekStart <= tEnd) : futureWeeks;
        // Compute canonical count from task date range (stable regardless of view range)
        const totalTaskFw = (tStart && tEnd) ? countFutureTaskWeeks(tStart, tEnd, _owTd) : taskWeeks.length;
        const distribute  = (byOwner, hours) => {
          if (totalOwnerH > 0.01) ownerNames.forEach(o => { byOwner[o] = (byOwner[o] || 0) + hours * (ownerTotals[o] / totalOwnerH); });
          else byOwner['—'] = (byOwner['—'] || 0) + hours;
        };

        const monthMap = {};
        taskWeeks.forEach(w => {
          if (!monthMap[w.monthKey]) monthMap[w.monthKey] = [];
          monthMap[w.monthKey].push(w.weekStart.toISOString());
        });
        const weeksByMonth = Object.entries(monthMap).map(([monthKey, weekKeys]) => ({ monthKey, weekKeys }));

        distributeFutureResidual(taskTbp, totalTaskFw, weeksByMonth, portfolioMonthlyPulse).forEach(entry => {
          if (!taskWeekData[entry.key]) taskWeekData[entry.key] = { total: 0, byOwner: {}, isPulse: entry.isPulse, isPast: false };
          taskWeekData[entry.key].total += entry.hours;
          if (entry.isPulse) taskWeekData[entry.key].isPulse = true;
          distribute(taskWeekData[entry.key].byOwner, entry.hours);
        });
      }

      // Pivot into ownerMap
      const displayOwners = hasOwners ? ownerNames : ['—'];
      displayOwners.forEach(ownerName => {
        const isPlaceholder = ownerName === '—';
        const ownerProp    = totalOwnerH > 0.01 ? (ownerTotals[ownerName] || 0) / totalOwnerH : (isPlaceholder ? 1 : 0);
        const ownerSold    = soldH * ownerProp;
        const ownerActuals = ownerTotals[ownerName] || 0;
        const ownerTbpH    = taskTbp * ownerProp;

        if (!ownerMap[ownerName]) ownerMap[ownerName] = { sold: 0, actuals: 0, tbp: 0, weekTotals: {}, projects: {} };
        const om = ownerMap[ownerName];
        om.sold += ownerSold; om.actuals += ownerActuals; om.tbp += ownerTbpH;

        if (!om.projects[proj.id]) om.projects[proj.id] = { name: proj.name || proj.id, sold: 0, actuals: 0, tbp: 0, weekTotals: {}, tasks: {} };
        const pm = om.projects[proj.id];
        pm.sold += ownerSold; pm.actuals += ownerActuals; pm.tbp += ownerTbpH;

        if (!pm.tasks[task.name]) pm.tasks[task.name] = { sold: 0, actuals: 0, tbp: 0, weekData: {} };
        const tm = pm.tasks[task.name];
        tm.sold += ownerSold; tm.actuals += ownerActuals; tm.tbp += ownerTbpH;

        weeks.forEach(w => {
          const key = w.weekStart.toISOString();
          const d   = taskWeekData[key];
          if (!d) return;
          const oh = d.byOwner[ownerName] || 0;
          if (oh < 0.001) return;
          if (!tm.weekData[key]) tm.weekData[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          tm.weekData[key].hours += oh;
          if (!pm.weekTotals[key]) pm.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          pm.weekTotals[key].hours += oh;
          if (!om.weekTotals[key]) om.weekTotals[key] = { hours: 0, isPulse: d.isPulse, isPast: d.isPast };
          om.weekTotals[key].hours += oh;
        });
      });
    });
  });
```

Note the leading comment above `const ownerMap = {}` (line 1298) also says `roles: { role → ... } }` — update it to read `tasks: { taskName → ... } }` for accuracy:

```js
  // Build ownerMap: owner → { sold, actuals, tbp, weekTotals, projects: { projId → { name, sold, actuals, tbp, weekTotals, tasks: { taskName → { sold, actuals, tbp, weekData } } } } }
```

- [ ] **Step 3: Update the CSV export header and third-level export row**

Find (line 1434):

```js
  exportRows.push({ v: ['Owner', 'Project', 'Role', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' });
```

Replace with:

```js
  exportRows.push({ v: ['Owner', 'Project', 'Task', 'Sold', 'From actuals', 'To be planned', ...periodLabels], level: 'header' });
```

Find the third-level row-push inside the render loop (originally around line 1476-1487, `Object.entries(pm.roles)...`):

```js
      Object.entries(pm.roles).sort((a, b) => a[0].localeCompare(b[0])).forEach(([role, rm]) => {
        tbodyHtml += `
          <tr data-parent-group="${oid}" style="background:#fafafa">
            <td style="${SB}left:0;background:#fafafa;font-size:var(--text-sm);padding:4px 8px 4px 38px;font-weight:600;border:1px solid var(--border-light);white-space:nowrap;color:#444">${esc(role)}</td>
            <td style="${SB}left:200px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:var(--text-muted)">${fmtPH(rm.sold)}</td>
            <td style="${SB}left:265px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:#555">${fmtPH(rm.actuals)}</td>
            <td style="${SB}left:345px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);color:#555">${fmtPH(rm.tbp)}</td>
            ${makePeriodCells(rm.weekData, null, true)}
          </tr>`;
        exportRows.push({ v: ['', '', role, rnd(rm.sold), rnd(rm.actuals), rnd(rm.tbp),
          ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (rm.weekData[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });
      });
```

Replace with (iterates `pm.tasks` instead of `pm.roles`, displays the task name; the export row's `level` stays `'role'` — see the note below the code):

```js
      Object.entries(pm.tasks).sort((a, b) => a[0].localeCompare(b[0])).forEach(([taskName, tm]) => {
        tbodyHtml += `
          <tr data-parent-group="${oid}" style="background:#fafafa">
            <td style="${SB}left:0;background:#fafafa;font-size:var(--text-sm);padding:4px 8px 4px 38px;font-weight:600;border:1px solid var(--border-light);white-space:nowrap;color:#444">${esc(taskName)}</td>
            <td style="${SB}left:200px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:var(--text-muted)">${fmtPH(tm.sold)}</td>
            <td style="${SB}left:265px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:2px solid var(--text-disabled);color:#555">${fmtPH(tm.actuals)}</td>
            <td style="${SB}left:345px;background:var(--sand-50);text-align:center;font-size:var(--text-xs);padding:2px 6px;border:1px solid var(--border-light);border-right:3px solid var(--text-muted);color:#555">${fmtPH(tm.tbp)}</td>
            ${makePeriodCells(tm.weekData, null, true)}
          </tr>`;
        exportRows.push({ v: ['', '', taskName, rnd(tm.sold), rnd(tm.actuals), rnd(tm.tbp),
          ...periods.map(p => { const keys = isMonthly ? p.weekKeys : [p.weekStart.toISOString()]; const h = keys.reduce((s, k) => s + (tm.weekData[k]?.hours || 0), 0); return h > 0.01 ? rnd(h) : ''; })], level: 'role' });
      });
```

**Why `level` stays `'role'` here, not renamed to `'task'`:** `buildStyledExcelExport` (`js/planning.js:867-887`) uses `level` purely as an Excel-styling key — `lvlFill[level]` (`:872-879`) picks a row fill color, and `isBold = ['header', 'project', 'task', 'total'].includes(level)` (`:888`) picks font weight. `'task'` is styled **bold with a light-blue fill** (`lvlFill.task`), the same weight already used one level up for this view's own project row (`:1474`, which already (pre-existing, out of this plan's scope) pushes `level: 'task'` for the *project* row — a naming quirk documented in the design spec, not introduced by this change). Relabeling the new leaf-level task row to `level: 'task'` would make it bold and blue-filled — visually indistinguishable in the Excel export from the project row directly above it, and heavier than appropriate for a leaf row. Keeping `level: 'role'` (not bold, plain white fill, `lvlFill.role`) preserves the correct leaf-level visual weight, matching what the old role row looked like. This is a deliberate export-styling decision, not an oversight — the on-screen table (which this plan does change, Step 4) and the CSV header (already `'Task'` per this step) are what convey the semantic column meaning to the user; `level` is purely a rendering hint internal to `buildStyledExcelExport`.

- [ ] **Step 4: Update in-app help text and the table column header label**

Find (line 1507):

```js
      The table is structured as <strong>Owner → Project → Role</strong>.
```

Replace with:

```js
      The table is structured as <strong>Owner → Project → Task</strong>.
```

Find (line 1519):

```js
          <th rowspan="${rowspan}" style="${SH}left:0;min-width:200px;background:#d8dff7;font-size:var(--text-base);padding:8px 10px;border:1px solid var(--border-light);white-space:nowrap">Owner / Project / Role</th>
```

Replace with:

```js
          <th rowspan="${rowspan}" style="${SH}left:0;min-width:200px;background:#d8dff7;font-size:var(--text-base);padding:8px 10px;border:1px solid var(--border-light);white-space:nowrap">Owner / Project / Task</th>
```

- [ ] **Step 5: Manual verification in browser**

Start the app (`docker compose up`, then `http://localhost/planning.html`) and, on the By Owner view, verify all four scenarios from the design spec:

1. An owner with logged hours on 2+ tasks in the same project shows one row per task (not per role), with correct hours.
2. A task with multiple sold roles (e.g. Developer + QA) shows that task's sold/actuals hours as the sum of both roles in one row.
3. With the Team filter applied to only one of a multi-role task's roles, only that role's hours contribute to the task's total (not the whole task, not zero).
4. Cross-check totals against the By Project view for the same project/task — same source data, different aggregation, totals must reconcile (compare against the Step 1 baseline notes and the By Project view's numbers for the same owner/project/task).

Also verify: the in-app help text now reads "Owner → Project → Task", the table's first column header reads "Owner / Project / Task", and the "⧉ Export" button produces an `.xlsx` file whose header row reads `Owner, Project, Task, Sold, From actuals, To be planned, ...` with the task-level rows shown in plain (non-bold, white) styling distinct from the bold blue project rows above them.

- [ ] **Step 6: Commit**

```bash
git add js/planning.js
git commit -m "feat(planning): group By Owner view by task instead of role

Owner -> Project -> Role becomes Owner -> Project -> Task. A task with
multiple sold roles now aggregates all roles' hours into one row,
matching the actuals-driven purpose of this view (which task an owner
is working on, not their role, which is already known once the person
is identified).

Design: docs/superpowers/specs/2026-07-13-by-owner-task-grouping-design.md"
```

---

## Self-Review Notes

- **Spec coverage:** the design spec's per-task aggregation code (§ "Aggregation"), the `pm.roles` → `pm.tasks` pivot/render change (§ "Pivot and render"), and both documentation-string updates (§ "Documentation strings": help text and CSV header) are all in Task 1. The table's on-screen column header label (`:1519`, "Owner / Project / Role") was not explicitly called out in the design spec's file-line citations but is directly part of what the acceptance criteria mean by "the view shows... rows grouped by task" — included in Step 4 as a same-scope rendering fix, not a new feature. The open `exportRows.level` question is resolved and documented inline in Step 3 (keep `'role'` — leaf-level styling, avoids colliding with the pre-existing, out-of-scope `level: 'task'` mislabel on the project row).
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code and exact before/after blocks.
- **Type consistency:** `pm.tasks[task.name]` / `tm` is used identically in Step 2 (pivot construction) and Step 3 (render + export) — a plain object `{ sold, actuals, tbp, weekData }`, matching the same shape `pm.roles[res.role]` / `rm` had before. No other shape assumed anywhere in this function.
