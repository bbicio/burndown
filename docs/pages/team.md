# team.html

Resource registry, Vue 3 (CDN, no build step, same pattern as `admin.html`), admin **or** sysadmin, linked from the ⚙ Admin dropdown. Calls the API with direct `fetch()` (no `js/api.js` wrapper for `/api/resources` — this page's established style). Backend detail: `docs/api/resources.md`.

## Resource registry (Cycle 1, 2026-09-23)

Table + create/edit modal (first/last name, email, job title, job description, optional linked PDash user), deactivate/reactivate, hard delete. The job-title select is filled with `roles.label` plus an "Other…" free-text option — **known defect, planned separate cycle:** the role strings in uploaded actuals are `roles.code`, so the plan is `resources.role_id → roles.id`, NOT NULL, option `label (code)`, no "Other…". See the design notes in `docs/superpowers/specs/2026-09-23-team-attribute-lists-design.md`.

## Unmatched names panel (Cycle 3b, 2026-09-25)

A card below the resources table: owner names found in uploaded actuals that could not be linked to a resource, so an admin can assign or ignore them. Spec `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §4, plan `docs/superpowers/plans/2026-09-25-resource-matching-aliases.md`, report `docs/superpowers/reports/2026-09-25-worktree-resource-matching-aliases-finish-cycle.md`.

- Table columns: name as written (with an "ambiguous" badge when several active namesakes exist), hours, projects, an "Assign to" select, and **Assign** / **Ignore** buttons. **Rescan** recomputes the queue from all uploaded actuals (needed once, for actuals uploaded before the feature).
- `assignOptions(u)` orders the select: ambiguous candidates first, then other active resources, then **inactive** ones marked "(inactive)" — a leaver's historical actuals can only belong to an inactive resource, and the API accepts an alias to one (found after the first manual verification, fixed in the same cycle).
- "Existing aliases" (`<details>`): the name as the admin typed it (`display_name`; the normalized key is not shown), the resource it resolves to or "ignored", and **Remove** (the name returns to the queue).
- The panel reloads after every resource create/edit/status toggle/delete (`loadUnmatched()`), since the backend rescans on each of those.
- Per-row `_loading` guards, same idiom as the resources table; errors in `unmatchedError`, separate from the page's `globalError`.

**Known limits (recorded in project memory `project_team_ux_backlog.md`):** no search/sort/paging on the queue and a plain `<select>` for 150 resources; no resource detail view (where the future profile from sub-cycle 3c has to live); the whole page is one flat table + one panel. A "team UX" cycle is planned before 3c.
