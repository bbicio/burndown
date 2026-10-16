# attribute-lists.html

Generic tag/taxonomy admin console (admin or sysadmin). Its lists and items feed the "🏷 Tags" sections of `costgrid.html` and `project-config.html` through `js/tags.js`. Routes: [docs/api/attribute-lists.md](../api/attribute-lists.md).

## Header unification (2026-10-16)

Spec `docs/superpowers/specs/2026-10-16-header-unification-design.md`, report `docs/superpowers/reports/2026-10-16-header-unification-finish-cycle.md`. Each tab has its own `.ph` (the shared page head (`.ph-*`, [docs/css/stylesheets.md](../css/stylesheets.md) → `css/style.css`)), with the list count in `.ph-sub` and "+ New list" as `.ph-btn-primary`. The back link of a list's detail view uses the `chevron-left` icon instead of the "←" character. The page loads `js/lib/icons.js` and registers `<ph-icon>`.
