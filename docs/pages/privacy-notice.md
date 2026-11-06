# privacy-notice.html

Privacy Notice page, 2026-11-06 (spec `docs/superpowers/specs/2026-11-06-privacy-notice-design.md`, plan `docs/superpowers/plans/2026-11-06-privacy-notice.md`). It replaced `settings.html`, which was a blank page and was deleted without a redirect. Vue 3 (CDN, no build): `initNav('privacy', { breadcrumbs: Home › Privacy Notice })`, `v-cloak` root, `.ph` head, open to any authenticated user. Loads `api.js`, `core.js`, `notifications.js`, `icons.js`, `js/lib/dates.js`, `nav.js`; no `api-sync.js`.

- **Content.** `apiFetch('/app-settings/terms')` (`apiFetch` prepends `/api` itself) (latest published version, never the draft); `content` is rendered with `v-html`, as on `terms.html`. States: spinner, load error (`Unable to load the privacy notice. Please refresh or contact your administrator.`), empty (`No privacy notice has been published yet.`).
- **Footer line.** `Version N · Published Mon D, YYYY`; the day is the UTC day of `updatedAt` (`formatDayText(updatedAt.slice(0, 10))`); without a valid date only `Version N`.
- **Read-only.** No button, input or form; pinned by `js/lib/privacy-notice-guard.test.js`, which also pins that `settings.html` is gone.
- **Style.** A page-local `<style>` block (`.pn-*`), tokens only, so no shared stylesheet version changes.
- **Menu.** `#nav-privacy-btn` in `js/nav.js`, see [docs/js/nav.md](../js/nav.md).

## History of the former Settings page

Settings page, added 2026-09-30 (spec `docs/superpowers/specs/2026-09-30-settings-page-design.md`, plan `docs/superpowers/plans/2026-09-30-settings-page.md`). Vue 3 (CDN, no build), same pattern as `_terms-editor.html`: `initNav('settings', { breadcrumbs: Home › Settings })`, `v-cloak` root, spinner until `ready`. Content: the standard navbar/footer/breadcrumb and a `.page-header` with the `h1` "Settings" (styled by `css/admin-crud.css`, so its size matches the other admin pages; the body is forced to white). Open to any authenticated user. Loads `api.js`, `core.js`, `notifications.js`, `nav.js?v=11`; no `api-sync.js`.

It replaced the Settings modal. Removed in the same cycle: the modal itself, CSV exports (Cost Grids, Project Portfolio, Roles in Rate Cards), Full Backup (.json), Restore from Backup (which never worked: key-name mismatch plus no-op save functions), and `js/settings.js` with its 13 `<script>` tags. The server routes `/api/exports/*` are unchanged and have no UI. Nothing else lives on the page yet; future settings go here.

## Header unification (2026-10-16)

Spec `docs/superpowers/specs/2026-10-16-header-unification-design.md`, report `docs/superpowers/reports/2026-10-16-header-unification-finish-cycle.md`. The former `.page-header` is now the shared page head (`.ph-*`, [docs/css/stylesheets.md](../css/stylesheets.md) → `css/style.css`), placed outside the `.page` wrapper so the breadcrumb and the band read as one block; `.page` keeps its own 2rem top margin.
