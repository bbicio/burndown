# admin.html

User management — invite, role, disable, anonymize (admin **or sysadmin**).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Base state

T&C editor removed (2026-09, moved to `_terms-editor.html`, sysadmin-exclusive). Role model is now 3-tier (`user` < `admin` < `sysadmin`, `018_sysadmin_role.sql`) — sysadmin inherits every admin capability plus two exclusives carved out of the plain admin tier: `_db-reset.html` and Terms & Conditions editing. Base role toggle ("Make admin"/"Make user") hidden entirely on `role==='sysadmin'` rows for every viewer; a separate "⬆ Grant sysadmin"/"⬇ Revoke sysadmin" toggle (`toggleSysAdmin()`) is visible only to a sysadmin viewer, only on admin/sysadmin rows (never on `user` rows — promotion is two-step, `user→admin` by any admin then `admin→sysadmin` by a sysadmin only, enforced server-side by `api/src/lib/role-transition.js`'s `roleChangeError()`). Disable/Enable and Anonymize buttons gained a `canModifyUser(u)` guard (`me.role==='sysadmin' || u.role!=='sysadmin'`) mirroring the backend's `sysAdminTargetError()` — a plain admin cannot disable/anonymize a sysadmin account. Self-exclusion (`v-if="u.id !== me.id"`) unchanged, covers all of the above automatically.

## Resend invite (2026-09)

A "✉️ Resend invite" button (`v-if="u.status === 'pending'"`) calls `resendInvite(user)` — a page-local `async` method, same shape as `setStatus()`/`anonymizeUser()` (raw `fetch()`, not `Api.*`, matching this page's own established convention of never routing through `js/api.js`), hitting the new `POST /api/auth/:id/resend-invite` (`auth.js`). A new `globalSuccess` reactive field (paired alert div, mirroring the pre-existing `globalError` one) shows "Invite resent to {email}"; every one of the page's 5 action methods (`toggleRole`, `toggleSysAdmin`, `setStatus`, `anonymizeUser`, `resendInvite`) now clears both `globalError` and `globalSuccess` at its own start, so a stale success banner from one action can't linger through a later, unrelated one.

## Header unification (2026-10-16)

Spec `docs/superpowers/specs/2026-10-16-header-unification-design.md`, report `docs/superpowers/reports/2026-10-16-header-unification-finish-cycle.md`. The former `.page-header` is now the shared page head (`.ph-*`, [docs/css/stylesheets.md](../css/stylesheets.md) → `css/style.css`), placed outside the `.page` wrapper so the breadcrumb and the band read as one block; `.page` keeps its own 2rem top margin. The user count is in `.ph-sub` ("N users").

## User Admin redesign (2026-11-06)

Spec `docs/superpowers/specs/2026-11-06-user-admin-redesign-design.md`, plan `docs/superpowers/plans/2026-11-06-user-admin-redesign.md`, boards `docs/superpowers/design/admin/redesign/12a…12r`. API and role rules unchanged.

### Current state

- The rules and list transforms live in `js/lib/user-admin-rules.js` ([docs/js/lib.md](../js/lib.md)); the page only renders them. A row is `self`, `anonymized`, `locked` or `normal`; only `normal` rows have a menu.
- Toolbar: status segments with counts that follow the role and the search, a native role select, a search field. Name, Role, Status and Joined sort in three states (ascending, descending, API order).
- One visible text button per row (`Resend invite` / `Enable`); everything else is in the ⋯ menu, grouped Role / Access / Data, with the reason shown in place of the description on unavailable items. The popover opens upwards when the tallest menu does not fit below the button (`openMenu`); on a phone the same groups open as a bottom sheet.
- Disable and Anonymize go through Bootstrap modals (`#disableModal`, `#anonymizeModal`); Anonymize needs its checkbox. The invite form is a right-hand offcanvas (`#inviteDrawer`) with the error and sent states inside it.
- Results and failures use one `banner`; each row has its own busy state (`u._loading`, `u._sending`).
- Layouts: full table, compact columns, card list; the breakpoints are pinned by `js/lib/admin-page-guard.test.js` ("has the tablet and phone layouts"). The phone head keeps title, short subtitle and `Invite` on one row.

### Accepted deviations

- Dates keep the page's own `fmtDate`, so the browser prints `Sept`, not the boards' `Sep`: the spec keeps `fmtDate`.
- No link-expiry line on pending rows: `GET /api/users` has no `invite_expires` and the API is out of scope (spec decision 2).
- The Disable modal states that an already open session stays valid, not the boards' "signed out" copy: `requireAuth` does not check the status (spec decision 3).
- Programmatic focus on the first menu item and on Cancel shows a focus ring the boards do not draw.
- The page overrides the shared phone page head (`.ph` stacked, subtitle hidden) to match board 12r.
- The full table still fits below its breakpoint when measured with the seed data (spec decision 11); the breakpoint is kept as the spec states.

### Not covered by screenshots

Loading (12o) and access denied (12q) were captured by forcing the Vue state, not through the real request path.
