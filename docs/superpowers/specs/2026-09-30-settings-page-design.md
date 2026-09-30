# Settings becomes a page, and its old features go — design

Date: 2026-09-30. Scenario 2 (evolution of existing features). Input: user brief of 2026-09-30 plus the answers below.

## Problem

The "⚙ Settings" entry in the account dropdown opens a modal (`#settingsModal`, injected by `js/nav.js:294-332`) whose only content is the Data Manager: three CSV exports emailed to the user, "Full Backup (.json)" and "Restore from Backup". The user decided these features are no longer needed "as they are". Restore never worked (key-name mismatch + no-op save functions, `js/settings.js:78-107`), the Full Backup exists only to feed it, and the exports are not wanted any more. Settings itself must stay, but as a page.

## Decisions (from the user, 2026-09-30)

| # | Decision |
|---|---|
| D1 | Clicking "⚙ Settings" navigates to a new page `settings.html` instead of opening a modal. |
| D2 | `settings.html` content area is blank white with only the title "Settings". Standard navbar, footer and breadcrumb (Home › Settings) stay, like every other page. |
| D3 | Any authenticated user can open it (same audience as the old modal). |
| D4 | The CSV exports (Cost Grids, Project Portfolio, Roles in Rate Cards) are removed from the UI. |
| D5 | Full Backup (.json) is removed. |
| D6 | Restore from Backup is removed. |
| D7 | The server routes `/api/exports/*` are kept untouched, without any UI (user changed his mind during the session). `GET /api/exports/phasing` and its button in `config.html` are unaffected. |

## Design

### settings.html (new)
- Same Vue 3 (CDN) page pattern as `_terms-editor.html`: `<div id="nav-container">`, root `<div id="app" v-cloak>`, scripts `api.js?v=7`, `core.js?v=7`, `lib/notif-browser.js?v=2` (module), `notifications.js?v=2`, `nav.js?v=N` (N = new version, see below). No `settings.js`, no `api-sync.js`.
- `created()`: `const user = await initNav('settings', { breadcrumbs: [{ label: 'Home', href: '/pipeline.html' }, { label: 'Settings' }] }); if (!user) return; this.ready = true;`.
- Body: `<div v-if="ready" class="page app-container"><h4 class="fw-bold">Settings</h4></div>` with a spinner while not ready, white background (no card). `<title>PDash — Settings</title>`; tokens.css/style.css links copied from `_terms-editor.html` with their current `?v=` values. No inline hex colours.
- No menu entry besides the existing account-dropdown item (`initNav('settings')` marks no tab active; `initNav` must accept an unknown tab name — verified in the plan by reading `nav.js`).

### nav.js
- `#nav-settings-btn` click handler: `window.location.href = '/settings.html'` (inside the `stgAlreadyWired` block, replacing the `openSettingsModal` call). Keep the button as is.
- Remove the `#settingsModal` markup injection (`nav.js:293-332`) and the export/backup/restore event wiring (`nav.js:468-491`). The `stgAlreadyWired` marker is kept only if other wiring in the block still needs it; otherwise the block shrinks to the settings-button handler.
- Bump `nav.js` `?v=` in every page that loads it (repo-wide grep).

### js/settings.js
- Delete the file (all four functions die with the features). Remove `<script defer src="js/settings.js?v=1">` from all 13 pages that load it: `costgrid`, `config`, `team`, `_terms-editor`, `project-config`, `_db-reset`, `profile-jobs`, `timesheets`, `portfolio`, `attribute-lists`, `planning`, `pipeline`, `admin`. No remaining reference to `openSettingsModal`, `stgExport`, `downloadFullBackup`, `restoreFromBackup`, `.stg-admin-only`, `.stg-export-email` or `#stgExportStatus` anywhere.
- Note: `pipeline.html`'s real script order differs from the others; each page just loses one tag.

### Backend
- Unchanged. `api/src/routes/exports.js` and `sendExportEmail` stay (D7); no test in `test-api.js` changes.

## Acceptance criteria

- AC1: "⚙ Settings" in the account dropdown, on any authenticated page, navigates to `/settings.html`; no modal opens.
- AC2: `settings.html` shows the standard navbar/footer/breadcrumb and a blank white content area whose only content is the title "Settings"; a logged-out visit redirects to login (via `initNav`).
- AC3: no Data Exports, Backup or Restore UI exists anywhere; `grep` finds no reference to the removed functions/ids in `*.html` or `js/`.
- AC4: `js/settings.js` is gone and none of the 13 pages requests it (no 404 in the console on any page).
- AC5: `/api/exports/*` behaves exactly as before (routes untouched).
- AC6: all pages load without JS errors after the change (spot-check at least pipeline, config, planning, project-config, admin).
- AC7: `npm test` green; `nav.js` version bumped in every page that loads it.

## Test plan

- Automated: `npm test` (no new pure logic; none of the removed code had tests — confirm with a repo grep for `settings` in `js/lib/*.test.js` in the plan).
- Manual in an isolated stack (`scripts/test-branch.sh`): open the account dropdown on 3+ pages and click Settings; logged-out access to `/settings.html`; browser console clean on the 13 pages (no 404 for `settings.js`).

## Documentation to update in the same cycle

`PRD.md` (Settings section, Data Manager, exports, backup/restore — 4 mentions), `CLAUDE.md` (6 mentions: file structure, `settings.js`, Settings modal section, `cleanLegacyStorage` note, pages table: add `settings.html`), `ARCHITECTURE.md` (3), `TEST_CASES.md` + `test-cases.html` (N-03, NT-23, section 14 "Exports", PA-M6; mark exports UI cases obsolete), `docs/js/nav.md`, `docs/pages/timesheets.md`, `docs/api/app-settings.md` only where it mentions the Settings modal, `.claude/skills/operational-manual/SKILL.md` (2 mentions, incl. the Restore defect line), plus a new `docs/pages/settings.md`. Project memory updated at `/sync-docs`.

## Excluded scope

- Any content in `settings.html` beyond the title (future cycles).
- `/api/exports/*` routes, `sendExportEmail`, the "Your export is ready" notification code, `GET /api/exports/phasing` and `config.html`'s phasing button.
- Replacing other native `alert()`/`confirm` or hex colours (deferred point 2), navigation rework, page redesigns.
- `project-config.html` `onSave` error swallowing, and all other deferred items.

## Risks

- A page that keeps a stale `settings.js` tag gets a 404 (harmless but noisy): mitigated by the repo-wide grep in AC3/AC4.
- Users with the old modal cached: `nav.js` version bump forces the new file.
- `initNav('settings')` with an unknown active tab: to be verified by reading `nav.js` in the plan; if it breaks, pass a known tab or null.
