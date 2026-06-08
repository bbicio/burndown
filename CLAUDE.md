# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build step. Open `index.html` directly in a browser or serve with any static file server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

No package manager, no bundler, no tests, no linter.

## Architecture

Vanilla JS SPA. Single HTML file (`index.html`) with section show/hide routing. No framework.

### File structure

```
index.html          — all markup; sections toggled with d-none/d-block
css/tokens.css      — design tokens (single source of truth for colors, spacing, type scale)
css/style.css       — component styles referencing tokens
js/core.js          — state, localStorage, shared helpers (pipelineBadge, statusBadge, etc.)
js/main.js          — app init, nav routing, top-level event wiring
js/pipeline-board.js — kanban board (PB_STAGE_STYLE, renderPipelineBoard, pbOpenDetailPanel)
js/costgrid.js      — cost grid editor (phases/tasks/roles table, save/load/version logic)
js/portfolio.js     — portfolio dashboard + resource planning view
js/config-form.js   — project/program/client/role config UI
js/roles.js         — roles management modal
js/xls.js           — Excel timesheet upload + parsing
js/settings.js      — settings modal, JSON import/export, sync
js/ai.js            — AI sidebar chat
```

### Routing

`main.js` wires `[data-navtab]` buttons → `updateNavState(tab)`. Each view has a dedicated `show*View()` function (e.g. `showPipelineBoardView()`, `showPortfolioView()`). Sections not in the active view's list get `d-none`.

Default view on load: **Pipeline Board** (`showPipelineBoardView()`).

Section IDs: `pipelineBoardSection`, `costGridEditorSection`, `portfolioSection`, `portfolioPlanningSection`, `reportingSection`, `appSubnav`.

### Data model (localStorage)

All keys prefixed `PDash_`. Loaded once into `window.AppState` on startup via `core.js loadState()`.

| Key | Shape |
|-----|-------|
| `PDash_config` | `{ projects[], programs[], clients[], roles[], monthlyCapacity{}, globalHourlyRate }` |
| `PDash_costGrids` | `CostGrid[]` — each has `{ id, name, versions[] }` |
| `PDash_timesheets` | uploaded XLS data |
| `PDash_settings` | sync/display preferences |

**CostGrid version shape** (key fields):
```js
{
  versionId, label, pipeline,   // pipeline = "SIP"|"Expected"|"Anticipated"|"Committed"|"Canceled"
  phases: [{ id, title, tasks: [{ id, title, roles: [{ roleId, days, months }] }] }],
  linkedProjects: [{ projectId, projectName }]
}
```

**Project shape** (key fields):
```js
{
  id, name, programId, clientId,
  costGridRef: { cgId, versionId }   // links project → cost grid version
}
```

### Pipeline stage: single source of truth

Pipeline stage is stored on `costGridVersion.pipeline`. Three locations must stay in sync — all use the CSS tokens from `tokens.css`:

- `css/tokens.css` — `--pipeline-{stage}-bg` / `--pipeline-{stage}-color` for all 5 stages
- `js/core.js` `pipelineBadge()` — uses `var(--pipeline-*-color)`
- `js/costgrid.js` switch block — uses `var(--pipeline-*-color)`
- `js/pipeline-board.js` `PB_STAGE_STYLE` — uses `var(--pipeline-*-bg/color)`

Valid stages: `SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`.

Helper: `getProjectPipeline(projectId)` — reads from `costGridRef` version first, falls back to `config.projects[].pipeline`.

### Linked project resolution

`linkedProjects[].projectId` may contain stale auto-generated IDs if the project was renamed. Correct resolution order in `pbOpenDetailPanel()`:

1. Direct `config.projects.find(p => p.id === lp.projectId)`
2. If null: filter projects by `costGridRef.cgId + versionId` → match by name within that subset
3. Single-project unambiguous fallback

Never use `lp.projectId` raw as the display ID — always resolve to `proj.id`.

### Cost grid editor ↔ pipeline board integration

- Editor back button → `showPipelineBoardView()` (not a separate list view — there is no cost grid list)
- After delete (grid or version): `renderPipelineBoard()`
- After JSON import: `renderPipelineBoard()`
- `showCostGridEditorView()` calls `updateNavState('pipelineboard')` to keep Pipeline tab highlighted

### Pipeline board layout (height math)

Navbar: Row 1 brand (44px) + Row 2 tabs (44px) + `appSubnav` (46px) = **134px total**.

`#pipelineBoardSection { height: calc(100vh - 134px) }` — must be kept in sync if navbar height changes.

`#pbColumnsContainer { height: calc(100% - 61px) }` — the 61px is the pipeline section's own header bar.

**Critical**: do NOT add `h-100` class to `#pbColumnsContainer`. Bootstrap's `.h-100` applies `height:100%!important`, which overrides the `calc()` value and hides the sticky totals footer below `overflow:hidden`.

### Detail panel

`#pbDetailPanel` width: 860px. Two-column layout inside `#pbDetailContent` (a `d-flex flex-grow-1`):
- Left column (50%): offer metadata + linked projects, `overflow-y:auto`, `border-right`
- Right column (flex:1): task/phase breakdown, `overflow-y:auto`

### Design tokens

`css/tokens.css` is the single source of truth. Never use hardcoded hex values in JS or CSS — reference `var(--token-name)`.

Typography scale (all shifted up from Bootstrap defaults):
- `--text-2xs: 0.70rem` → `--text-2xl: 1.25rem`

Palette: steel blue (`--indigo-*`), slate blue (`--violet-*`), sand (`--sand-*`).

Brand: `--brand-navy: #0B1840`, `--brand-magenta: #F0287A`.

### Language constraint

All user-facing text, alerts, labels, and instructions **must be in English**.
