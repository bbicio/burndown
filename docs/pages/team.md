# team.html

Resource registry, Vue 3 (CDN, no build step, same pattern as `admin.html`), admin **or** sysadmin, linked from the ⚙ Admin dropdown. Calls the API with direct `fetch()` (no `js/api.js` wrapper for `/api/resources` — this page's established style). Backend detail: `docs/api/resources.md`.

## Resource registry (Cycle 1, 2026-09-23)

Table + create/edit modal (first/last name, email, job title, job description, optional linked PDash user), deactivate/reactivate, hard delete. **Role by id (2026-09-25, migration `025`):** the original job-title select (filled with `roles.label`, plus an "Other…" free-text option) was replaced by a **Role** select whose value is `role.id` and whose options read `label (code)`; no "Other…" (a missing role is created first in Config → Roles). `form.roleId` replaces `jobTitleSelect`/`jobTitleOther`; `openEdit` preselects `r.role_id`; `submitForm` requires a role ("Role is required") and sends `roleId`. The table's "Role" column shows the label with the code beside it, and the search also matches role label/code. Why: the role strings in uploaded actuals are `roles.code`, never `roles.label` (details in `docs/api/resources.md`). Original design: `docs/superpowers/specs/2026-09-23-team-attribute-lists-design.md`; this change: `docs/superpowers/specs/2026-09-25-team-role-by-id-design.md`.

## Unmatched names panel (Cycle 3b, 2026-09-25)

A card below the resources table: owner names found in uploaded actuals that could not be linked to a resource, so an admin can assign or ignore them. Spec `docs/superpowers/specs/2026-09-25-resource-profile-design.md` §4, plan `docs/superpowers/plans/2026-09-25-resource-matching-aliases.md`, report `docs/superpowers/reports/2026-09-25-worktree-resource-matching-aliases-finish-cycle.md`.

- Table columns: name as written (with an "ambiguous" badge when several active namesakes exist), hours, projects, an "Assign to" select, and **Assign** / **Ignore** buttons. **Rescan** recomputes the queue from all uploaded actuals (needed once, for actuals uploaded before the feature).
- `assignOptions(u)` orders the select: ambiguous candidates first, then other active resources, then **inactive** ones marked "(inactive)" — a leaver's historical actuals can only belong to an inactive resource, and the API accepts an alias to one (found after the first manual verification, fixed in the same cycle). The "Select a resource…" placeholder option is selectable (it was `disabled` until 2026-09-25, which made a chosen resource impossible to clear — found during the role-by-ID cycle's manual verification); **Assign** stays disabled without a choice.
- "Existing aliases" (`<details>`): the name as the admin typed it (`display_name`; the normalized key is not shown), the resource it resolves to or "ignored", and **Remove** (the name returns to the queue).
- The panel reloads after every resource create/edit/status toggle/delete (`loadUnmatched()`), since the backend rescans on each of those.
- Per-row `_loading` guards, same idiom as the resources table; errors in `unmatchedError`, separate from the page's `globalError`.

**Known limits (recorded in project memory `project_team_ux_backlog.md`):** no search/sort/paging on the queue and a plain `<select>` for 150 resources; no resource detail view (where the future profile from sub-cycle 3c has to live); the whole page is one flat table + one panel. A "team UX" cycle is planned before 3c.
