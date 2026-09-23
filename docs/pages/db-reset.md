# _db-reset.html

Sysadmin-exclusive hidden page for bulk DB data deletion by scope, Vue 3 (CDN, no build step, same pattern as `admin.html`).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Base state

Now sysadmin-exclusive (was admin-only; narrowed 2026-09 as one of the two privileges carved out of the plain admin tier alongside Terms & Conditions editing), gate `role !== 'sysadmin'`, `initNav('dbreset', ...)`; unchanged otherwise (bulk-delete-by-scope grid, "Delete single proposal", "Change proposal owner" widgets — see `CLAUDE.md`'s Pages table for widget detail).
