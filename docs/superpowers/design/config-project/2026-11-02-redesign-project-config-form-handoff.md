# Brief for Claude Code — Project configuration (page 8, `project-config.html`)

Reference images:

| Image | Content |
|---|---|
| `config_form_part1.jpg` | Desktop, top half: page head, left section index (with Totals box), Client & program, Project info, Actuals, Tasks & resources (task table, one task expanded) |
| `config_form_part2.jpg` | Desktop, bottom half: Monthly phasing (Budget), Pass-through costs, Functional groups, Tags |
| `config_form_phasing_hours.jpg` | Monthly phasing card with the **Hours** segment selected |
| `config_form_tablet_smartphone.jpg` | Tablet 1024×768 (icon sidebar) and smartphone 390×844 (top navbar, section list in a bottom sheet) |

---

## 0. Nature of the work and precedence rules

This is a **restyling of `project-config.html` inside its current structure**: same Vue 3 app (CDN, no build), same `this.project` object, same methods, same API calls. Read `docs/pages/project-config.md` before starting.

**The live site wins over the images.** The images were drawn before several site-wide foundations were finalised and diverge from the code in places. Wherever an image conflicts with what the site already does, **follow the site**, not the image. This applies in particular to:

- **Tokens:** colours, spacing, radii, shadows, type sizes come from `css/tokens.css` (`var(--token)` only, no hex). The hex values in the images are approximations.
- **Page head:** use the shared `.ph` component (`.ph-back`, `.ph-title-row`, `.ph-title`, `.ph-badge`, `.ph-sub`, `.ph-side`, `.ph-actions`, `.ph-btn`, `.ph-btn-primary`) exactly as on `portfolio.html`/`costgrid.html`. The image's header (back link, eyebrow, 26px title, stage/status badges, meta line, Project Dashboard button) is the intended *content*; the *component* is `.ph`.
- **Navigation:** the sidebar and its tablet/smartphone variants are `js/nav.js` (`initNav`). Do not reproduce the sidebar/navbar drawn in the images.
- **Buttons, inputs, selects, toggles, date pickers, modals:** use the site's existing classes and controls (`.ph-btn`, Bootstrap buttons as styled by `style.css`, `<cg-date-picker>`, `css/controls.css`, the page's Bootstrap modals). Do not re-create button or field styles from the image.
- **Business rules:** permissions (`isViewer`), `currencyLocked`, `pipelineLocked`, `statusRule`, date rules (`taskDateBounds`, `periodStartBounds`/`periodEndBounds`, `outOfPeriod`), money input/validation (`readMoneyInput`, `phasingInvalid`, `ptcInvalid`, `rateInvalid`), save flow (`_pushProjectToApiDetailed`, `summarizePushResult`), leave-page prompt (`savedSnapshot`, `isProjectDirty`). Values in the images are sample data.
- **Money and dates:** formatting only via `formatMoney(amount, project.currency, currencies)`; months in English (`Dec 25`, `Jan 26`). The images' `€` and Italian separators are illustrative.

Repo constraints (`CLAUDE.md`): no build step; no hardcoded hex; `?v=N` bump on every versioned file touched; `#app-shell`/`#app-main` without `overflow`/`position`/`transform`; `v-cloak` stays; workflow `docs/superpowers/PROCESS.md`, close with `/finish-cycle`.

**CSS:** new `css/project-config.css?v=1`, loaded only by this page, after `style.css` and `controls.css`, tokens only (same approach as `pipeline.css`/`costgrid.css`). Inline `style=""` with colours goes to classes. No emoji anywhere (📂 👁 ⬇ 🗑 💾 ⚠️ ℹ️ ⟳ ↻ ＋): inline SVG `stroke="currentColor"` 14/16px or text only.

## 1. Save and Discard — ignore the sticky save bar in the images

The images show a sticky bottom bar (status dot "Unsaved changes / All changes saved", totals, Discard, Save changes); the tablet/smartphone image shows the same bar. **Ignore that bar entirely.**

- **Save** and **Discard** follow the **standard placement used by every other page of the site** (verify the current convention in the repo — today the page head `.ph-actions`, as on `costgrid.html` — and apply the same one here). Save is the single `.ph-btn-primary`; Discard is a secondary `.ph-btn` next to it.
- Save keeps `onSave()` unchanged (guard `saving`, error surfacing, redirect to `/portfolio.html?projectId=…`). Label without emoji: "Save" / "Saving…".
- Discard is new: it restores the form to `savedSnapshot` (re-parse + re-run the same normalisations as load), clears `phasingInvalid`/`ptcInvalid`/`rateInvalid`, behind `showConfirm()` when dirty; disabled when not dirty. Hidden for viewers, like Save.
- The bottom row "← Back to Portfolio / ← Project Dashboard" is removed: the page head's `.ph-back` already covers it (decision §10).
- The `outOfPeriod` warning stays, placed under the page head (it was "above Save").

## 2. Page structure (`config_form_part1.jpg`, `config_form_part2.jpg`)

One page, one form, no tabs. Two columns on desktop:

- **Left: section index**, sticky. One entry per section, in page order: Client & program, Project info, Actuals, Tasks & resources, Monthly phasing, Pass-through costs (optional), Functional groups (optional), Tags (optional). Click = scroll to the section (`window.scrollTo`, never `scrollIntoView`); the active entry follows scroll (IntersectionObserver).
  - Amber dot on an entry when the section has something to fix: tasks without a valid monthly split, out-of-period tasks, invalid money/rate fields, phasing not balanced. Computed from existing state; tooltip with the reason.
  - **Totals** box under the index: budget (`grandTotalBudget`), hours (`grandTotalHours`), task count.
- **Right: section cards**, the existing `cfg-section` blocks restyled as cards (radius/border/shadow from tokens), without the "0.–8." numbering. Optional sections carry "· optional" next to the title.

Tags is hidden for a new project (`v-if="!isNewProject"`, unchanged).

## 3. Sections

**Client & program** (one card, two selects side by side)
- Same `v-model`s (`project.clientId` with `__unassigned__`, `project.programId`).
- "+ New client" / "+ New program" become text links next to the field label (`openClientModal`/`openProgramModal`, same modals, restyled). No magenta button.
- Empty program option text: "No program · standalone project".

**Project info** (3-column grid)
- Fields unchanged: D365 Project ID, Project name (`onNameInput`), Start/End month (`<cg-date-picker>` with current bounds), Currency, Pipeline stage, Status, Description.
- Currency: disabled by `currencyLocked` → locked look (grey background + lock icon) with `currencyHint` shortened to one line, full text in the tooltip.
- Pipeline stage: locked look **only when `pipelineLocked`** (current rule), reason "Managed from the linked proposal". Status follows `statusRule` unchanged.

**Actuals**
- Load actuals = main action (secondary button with navy border), View = secondary, Download and Delete = icon buttons with tooltip; Delete turns red only on hover. Visibility conditions unchanged (`project.code && !isViewer`, `actuals.exportRows`, `actuals.deleting`).
- `actuals.info`, `guardMsg`, `status` keep their places under the buttons.

**Tasks & resources** (`config_form_part1.jpg`)
- From one always-open card per task to a **table, one row per task**: name, Period, Roles (count), Hours, Total, split status; Total row at the bottom (`grandTotalHours`, `grandTotalBudget`). Clicking a row expands it in place; **one task open at a time** (new UI state, not persisted).
- Pills on the closed row for excluded (`!task.billable`) and completed tasks.
- Expanded task: name, description, Period pickers (same bounds and `rebuildTaskDist`), "Include in report" and "Completed" switches, Monthly % distribution grid, resources table (same inputs: role, sold hours, hourly rate with `onResRateBlur`, subtotal), "+ Add resource", "Remove task" at the bottom (`confirmRemoveTask`).
- **One warning at the top** instead of the repeated per-task badge: "{n} of {m} tasks have no monthly split" + "Spread all evenly". Per task: "Spread evenly" and "Clear".
  - Spread evenly = equal % over the task's months, summing to 100 (last month takes the rounding). New pure helper in `js/lib/config-form-calc.js` + vitest; respects `readonly` rules (single month, completed, viewer).
- "⬇ XLSX" (`exportTasksXlsx`) stays in the card header as a secondary button.
- Header hint about XLS matching stays, shortened.

**Monthly phasing** (`config_form_part2.jpg` = Budget, `config_form_phasing_hours.jpg` = Hours)
- Sections 4 and 5 merge into **one card with a Budget / Hours segmented control** (new UI state; default Budget). Budget edits `project.phasing` with the current money handling; Hours edits `project.planning` with `cfgParseHours`/`cfgFmtHours`. Data and save unchanged.
- One pair of actions in the header: "Derive from task dates" (`derivePhasing`) and "Reforecast from actuals" (`runReforecast`, `v-if="reforecastVisible"`); `phasingActionError` under it.
- A small bar above each month shows the shape of the phasing: past months (actuals loaded) navy, planned months light blue, current month highlighted.
- Balance check shown as a status line: green "… of … · balanced" when `phasingSum === grandTotalBudget` (or `planningSum === grandTotalHours`), warning colour otherwise.
- No period: keep "Set Start and End month first."

**Pass-through costs**
- Dashed empty state "No pass-through costs · Total PTC {0}" + "+ Add PTC". The yellow total band goes (yellow is for warnings only); total in neutral style.
- Existing fields and logic (`onPtcBlur`, `ptcInvalid`, `confirmRemovePtc`, month select) unchanged.

**Functional groups**
- Groups as cards side by side (wrapping), each with name and role count. Each role shows "on {task}" as a small selector, "Any task" for the wildcard (`entry.task === ''`). Explanation reduced to one line.
- Same model `entries: [{role, task}]`, same `onSave` cleanup.

**Tags** — see §5.

## 4. Not designed: redesign from the existing functionality

The images **do not** design these; they must be redesigned starting from what the code does today, in the visual language of the rest of the page:

- **+ Add task** form (today `addTask` appends an empty task card): with the new table, a new task appears as a new row, opened, with the name focused. Fields and defaults = today's.
- **+ Add PTC** form (today `addPtc` appends a card with Title, Note, Amount, Month).
- **+ Add group** form (today `addGroup` appends a card with Group name and "+ Add role" rows).
- **View actuals modal** (`#actualsViewModal`: Date/Owner/Role/Task/Hours/Notes/Fee/Spent, row count): restyle the existing Bootstrap modal; same columns, same data, same `formatMoney`.

Keep every field, validation, guard and confirm these flows have today; only presentation changes.

## 5. Tags — same as the Cost Grid

- The Tags section must be **identical to the Tags section of `costgrid.html`** (collapsible card, closed summary with the assigned pills and list name, open grid of `.tag-group`/`.tag-pill`, `tag-pill--inactive`, readonly state), not the chip-with-× layout drawn in `config_form_part2.jpg`. Reuse the same markup/classes; do not fork the component.
- Logic unchanged: `loadTags`, `toggleTag`, `tagSaving`, `tagsReadOnly` (= `isViewer`). Tags still persist immediately, outside Save/Discard.
- **Ignore the "Manage lists in Attribute Lists ↗" link** in the image: not to be implemented.

## 6. Responsive (`config_form_tablet_smartphone.jpg`)

Media queries in `project-config.css`; nav breakpoints from `js/nav.js`.

- **Tablet ~1024 (icon sidebar):** the section index becomes a row of sticky horizontal tabs under the page head (same scroll-to behaviour, amber dots kept). Task table keeps Hours and Total, secondary columns drop. Totals box removed (totals stay in the task table).
- **Smartphone <768 (top navbar):** one section at a time. A selector under the title ("4 / 8 · Tasks & resources") opens the section list in a bottom sheet (48px rows). Fields in one column, inputs 44px. Task rows expand as on desktop.
- The bottom save bar shown on both devices is **ignored** (§1): Save/Discard follow the site's standard placement for these breakpoints.

## 7. Copy (English)

| Today | In production |
|---|---|
| "0. Program", "1. Project info" … "8. Tags" | no numbering: "Client & program", "Project info", … |
| "📂 Load Actuals" / "👁 View" / "⬇ Download actuals" / "🗑 Delete actuals" | "Load actuals" / "View" / icon + tooltip "Download actuals" / icon + tooltip "Delete actuals" |
| "— No program —" | "No program · standalone project" |
| "— any task —" | "Any task" |
| "4. Monthly Budget Phasing" + "5. Monthly Hour Planning" | "Monthly phasing" with Budget / Hours |
| "⟳ Derive from task dates" / "↻ Reforecast from actuals" | "Derive from task dates" / "Reforecast from actuals" |
| "6. Pass Through Costs (PTC)" | "Pass-through costs" |
| "Total PTC: —" | "Total PTC {amount}" |
| "💾 Save" / "💾 Saving…" | "Save" / "Saving…" |
| "⚠️ Confirm" / "ℹ️ Info" | "Confirm" / "Info" |
| `monthLabel(ym, 'it-IT')` in the distribution grid | English month labels, same as phasing |

## 8. Out of scope

- API, DB, `js/api-sync.js` save logic, Derive/Reforecast maths, money/date rules.
- The New client / New program modals beyond a light restyle.
- Re-enabling direct project creation (`DIRECT_PROJECT_CREATION_ENABLED` stays `false`).

## 9. Docs to update

- `docs/pages/project-config.md` (layout, index, one-task-open table, Spread evenly, merged phasing, Discard, Tags aligned with Cost Grid).
- `CLAUDE.md` file structure (`project-config.css`), `docs/css/stylesheets.md`.
- `TEST_CASES.md` / `test-cases.html`: index scroll + dots, task expand/collapse, Spread evenly/all/Clear, Budget/Hours switch, Discard, Tags parity with Cost Grid, viewer mode.

## 10. Decisions to confirm before implementation

| # | Point | Proposal |
|---|---|---|
| 1 | Bottom "Back to Portfolio / Project Dashboard" row | Remove; `.ph-back` covers it |
| 2 | Pipeline stage locked | Only when `pipelineLocked` (current rule) |
| 3 | "Spread evenly" | Equal split over the task's months; no "Copy from phasing" for now |
| 4 | Discard | New action restoring `savedSnapshot`, confirm when dirty |
| 5 | Monthly phasing bar colours (past/planned/current) | Past = months with actuals loaded, not just months before today |

## 11. Checklist

- [ ] `css/project-config.css?v=1`, tokens only, no new hex, no emoji.
- [ ] `.ph` page head, `initNav` navigation, site buttons/controls: site wins over the images.
- [ ] No sticky save bar; Save + Discard in the site's standard position.
- [ ] Section index with dots and Totals; tabs on tablet; bottom sheet on smartphone.
- [ ] Task table, one task open, single split warning, Spread evenly / all / Clear (+ vitest).
- [ ] One phasing card with Budget / Hours, bars, balance status.
- [ ] Add task / Add PTC / Add group / View actuals redesigned from current behaviour.
- [ ] Tags identical to `costgrid.html`; no "Manage lists in Attribute Lists" link.
- [ ] All existing guards, validations and permissions unchanged; guard tests green (`dates-guard`, `money-guard`, `project-config-*-guard`, `page-head-guard`, `foundations-guard`).
- [ ] Checked at 1440, 1024, 390 on: project with actuals, project without period, linked project (locked stage/currency), viewer.
- [ ] Docs updated (§9).
