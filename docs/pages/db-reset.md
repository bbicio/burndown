# _db-reset.html

Sysadmin-exclusive hidden page for bulk DB data deletion by scope, Vue 3 (CDN, no build step, same pattern as `admin.html`).

This file holds the full implementation narrative for this page — cycle-by-cycle detail, methods involved, first-attempt bugs, and report references. `CLAUDE.md`'s Pages table keeps only a one-line purpose description; when working on this page, read this file, not that row, for the detail. See `/sync-docs`'s routing rule for where future changes to this page should be written.

## Base state

Now sysadmin-exclusive (was admin-only; narrowed 2026-09 as one of the two privileges carved out of the plain admin tier alongside Terms & Conditions editing), gate `role !== 'sysadmin'`, `initNav('dbreset', ...)`; unchanged otherwise (bulk-delete-by-scope grid, "Delete single proposal", "Change proposal owner" widgets — see `CLAUDE.md`'s Pages table for widget detail).

## Header unification (2026-10-16)

Spec `docs/superpowers/specs/2026-10-16-header-unification-design.md`, report `docs/superpowers/reports/2026-10-16-header-unification-finish-cycle.md`. The former `.page-header` is now the shared page head (`.ph-*`, [docs/css/stylesheets.md](../css/stylesheets.md) → `css/style.css`), placed outside the `.page` wrapper so the breadcrumb and the band read as one block; `.page` keeps its own 2rem top margin. The title is "Database Reset", without "⚠️"; the existing warning is an `.alert.alert-danger` under the band.

## Header unification, content (2026-10-19)

Spec `docs/superpowers/specs/2026-10-18-header-unification-content-design.md`. `.danger-card` reads `--card-danger-border` instead of its own literal.

## Header board deviations (2026-10-20)

Plan `docs/superpowers/plans/2026-10-20-header-board-deviations.md`. The two single-proposal cards sit in a `#singleActions` grid with the same gap as `#resetCards`. "Change proposal owner" is an `.action-card` (ordinary card border, navy title), not a `.danger-card`. `--card-danger-border` is thicker again; `js/lib/content-surface-guard.test.js` pins its value and the `.action-card` tokens.
