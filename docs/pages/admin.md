# admin.html

User management — invite, role, disable, anonymize (admin **or sysadmin**).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Base state

T&C editor removed (2026-09, moved to `_terms-editor.html`, sysadmin-exclusive). Role model is now 3-tier (`user` < `admin` < `sysadmin`, `018_sysadmin_role.sql`) — sysadmin inherits every admin capability plus two exclusives carved out of the plain admin tier: `_db-reset.html` and Terms & Conditions editing. Base role toggle ("Make admin"/"Make user") hidden entirely on `role==='sysadmin'` rows for every viewer; a separate "⬆ Grant sysadmin"/"⬇ Revoke sysadmin" toggle (`toggleSysAdmin()`) is visible only to a sysadmin viewer, only on admin/sysadmin rows (never on `user` rows — promotion is two-step, `user→admin` by any admin then `admin→sysadmin` by a sysadmin only, enforced server-side by `api/src/lib/role-transition.js`'s `roleChangeError()`). Disable/Enable and Anonymize buttons gained a `canModifyUser(u)` guard (`me.role==='sysadmin' || u.role!=='sysadmin'`) mirroring the backend's `sysAdminTargetError()` — a plain admin cannot disable/anonymize a sysadmin account. Self-exclusion (`v-if="u.id !== me.id"`) unchanged, covers all of the above automatically.

## Resend invite (2026-09)

A "✉️ Resend invite" button (`v-if="u.status === 'pending'"`) calls `resendInvite(user)` — a page-local `async` method, same shape as `setStatus()`/`anonymizeUser()` (raw `fetch()`, not `Api.*`, matching this page's own established convention of never routing through `js/api.js`), hitting the new `POST /api/auth/:id/resend-invite` (`auth.js`). A new `globalSuccess` reactive field (paired alert div, mirroring the pre-existing `globalError` one) shows "Invite resent to {email}"; every one of the page's 5 action methods (`toggleRole`, `toggleSysAdmin`, `setStatus`, `anonymizeUser`, `resendInvite`) now clears both `globalError` and `globalSuccess` at its own start, so a stale success banner from one action can't linger through a later, unrelated one.
