# Brief for Claude Code — Resource Planning (page 9, `planning.html`)

Reference images (already in the Claude Code folder, same names as the boards):

| Image | Board | Content |
|---|---|---|
| `9.8a.jpg` | 9.8a | Desktop, full page: page head, two-row toolbar, legend, grid. Board title says "By role · Director and Developer expanded" but the capture shows the **By owner** grid: use it for the page frame (head, toolbar, legend, sticky columns, Total row); for By role use 9.9a/9.9b (tablet) and §4.1 |
| `9.8b.jpg` | 9.8b | By project, BERMITS expanded on tasks and roles |
| `9.8c.jpg` | 9.8c | By owner, "Unassigned (TBD)" first, load colours on people |
| `9.8d.jpg` | 9.8d | Weekly interval, Projects selector open |
| `9.8e.jpg` | 9.8e | By project, "How estimates work" popover open |
| `9.9a.jpg` | 9.9a | Tablet 1024×768 (icon sidebar) By role + smartphone 390×844 (top navbar) cards |
| `9.9b.jpg` | 9.9b | Same, smartphone with the Filters bottom sheet open |

Not designed in the boards, specified here: the **period selector** (§3) and the **Team assistant panel** (§6).

---

## 0. Nature of the work and precedence rules

Restyling of `planning.html` inside its current structure: same Vue 3 app (CDN, no build), same data (`POST /api/planning/model`, `modelRequest`, `loadModel`, `adapt*Model`), same filters, views, interval, toggles, XLS import/export, Team assistant. Read `docs/pages/planning.md` and `docs/api/planning-model.md` first.

**The live site always wins over the images.** The boards were drawn before several site-wide foundations were finalised. Wherever an image differs from what the site already does, **follow the site**. In particular:

- **Tokens:** colours, spacing, radii, shadows, type sizes from `css/tokens.css` (`var(--token)` only, no hex). Image hex values are approximations. Stage colours (Committed / Anticipated / SIP) = the same tokens already used by Pipeline and Portfolio.
- **Page head:** shared `.ph` component (`.ph-title`, `.ph-sub`, `.ph-actions`, `.ph-btn`, `.ph-toolbar`) as today. Title stays `planningTitle` ("Planning — All Projects" / "Planning — <project>"), not "Resource Planning" as drawn. The image's subtitle content ("8 of 8 projects · 2011h to plan") is the intended *content* of `.ph-sub`.
- **Navigation, breadcrumb, user menu:** `js/nav.js` (`initNav`). Do not reproduce the sidebar/navbar/breadcrumb of the images.
- **Buttons, segmented controls, inputs, switches, dropdowns, popovers:** the site's existing classes (`.ph-btn`, `css/controls.css`, Bootstrap as styled by `style.css`, `<ph-icon>` from `js/lib/icons.js`). Do not re-create control styles from the image.
- **Business rules and numbers:** model contract, inactive-owner redistribution, TBD placeholder, Rounded toggle, Monthly pulse, window limits (`getPpAxis()`), `isAdminUser`. Image values are sample data.
- **Compact toggle:** visible in all images, **removed from the site** (2026-10-29). Do not implement it; the page stays always full width (`body.pp-fullwidth`).

Repo constraints (`CLAUDE.md`): no build step; no hardcoded hex; `?v=N` bump on every versioned file touched; `#app-shell`/`#app-main` without `overflow`/`position`/`transform`; `v-cloak` stays; workflow `docs/superpowers/PROCESS.md`, close with `/finish-cycle`.

**CSS:** new `css/planning.css?v=1`, loaded only by this page after `style.css`/`controls.css`, tokens only. The view HTML built in JS (`byRoleView`/`byProjectView`/`byOwnerView`, rendered with `v-html`) moves from inline `style=""` to classes (`.pl-grid`, `.pl-row--parent`, `.pl-cell--actuals`, …). No emoji anywhere (▶ ▼ ◀+ −▷ ◁− +▶ ✕ 🤖): SVG `stroke="currentColor"` 14/16px or text.

## 1. Page head (`9.8a.jpg`)

- Title + `.ph-sub`: "Hours by role, project or owner · {n} of {m} projects · {h}h to plan" (n/m from the active filters, h = Total "To plan" of the active view; recomputed with the model).
- `.ph-actions`: Team assistant (admin/sysadmin only, `isAdminUser`), Load XLS, Export XLS, all `.ph-btn` with icons, same handlers (`taOpen`, `$refs.fileInput.click()`, `exportCurrentView`). Export stays disabled while `modelPending` or `modelError`.

## 2. Toolbar card (`9.8a.jpg`, two rows)

**Row 1:** view segmented control (By role / By project / By owner → `view`), interval segmented control (Monthly / Weekly → `interval`), **period selector** (§3), search field on the right.
**Row 2:** "Pipeline" label + one chip per stage (`allPipelines`, `togglePipelineFilter`, `isPipelineActive`): coloured dot + label in stage colours when active, neutral outline when inactive (replaces the filled magenta buttons). Then Projects and Team dropdowns showing the current state ("Projects: All (8)", "Team: All" or the count). Right side: Monthly pulse and Rounded switches (`monthlyPulse`, `roundHours`). No Compact.

- The separate "✕ Projects" / "✕ Team" reset buttons go: reset is the "Clear" action inside each dropdown.
- **Search** (new, client-side only): filters the rendered rows by label text, placeholder per view ("Search role…", "Search project or task…", "Search person…"). A matching child keeps its parents visible and expanded; non-matching rows hidden. Does not change `modelRequest`, totals or export (to confirm, §10).

**Projects selector (`9.8d.jpg`):** popover anchored to the button, replacing the plain checkbox list: search "Search project or client…", one row per `eligibleProjects` item with checkbox, name, client underneath, stage pill on the right; footer "{x} of {m} selected" + "Select all" (`selectAllProjects`) / "Clear" (`resetProjectFilters`). Same `projectFilters` logic (`isProjectChecked`, `onProjectFilterToggle`). Team dropdown: same popover pattern, without the client line.

## 3. Period selector (not designed — specification)

Replaces the second row's four buttons `◀+ −▷ ◁− +▶`. Drawn as `‹  Sep 2026 – Feb 2027 ▾  ›` followed by a "Today" text button. It drives the same `windowStart`/`windowEnd` the page already has; `modelRequest` reacts as today.

- **‹ / ›** shift the whole window one month back/forward keeping its width (`windowStart` and `windowEnd` both move by one month). In Weekly the step is also one month (the window stays month-aligned, as today). Disabled at the axis limits (`atLeftLimit` / `atRightLimit`); if a shift would cross a limit, clamp (`clampWindow`) instead of shrinking. Tooltips: "Previous month" / "Next month".
- **Label:** Monthly = `windowLabel` ("Sep 2026 – Feb 2027"); Weekly = first and last week start covered by the window ("Sep 28 – Nov 8, 2026"), from `getCalendarWeeks`.
- **Label click → menu (popover)** with:
  - Presets: "3 months", "6 months", "12 months" (start = current month − 1, so the last month of actuals stays visible, as in the images) and "Whole range" (`getPpAxis()` axisStart → axisEnd).
  - "From" and "To" month pickers (site month picker, `<cg-date-picker>` in month mode) bounded by the axis; "To" ≥ "From" (minimum width one month, same rule as `atMinWidth`). Apply on change; the menu stays open until outside click or Esc.
  - This menu covers what `expandLeft` / `shrinkLeft` / `expandRight` / `shrinkRight` did; those methods can stay as internals.
- **Today:** restores the default window of the initial load (current month → +3 months, same code as the init block), disabled when the window already equals it.
- Window state is not persisted (unchanged); an inverted/missing window keeps the current empty state ("no fetch").
- Keyboard: arrows and Today are buttons; the menu is focus-trapped and closes on Esc returning focus to the label.

## 4. Legend and grid (all 9.8 boards)

**Legend row** above the grid (replaces the always-open "Estimation logic" paragraph): one sample chip per encoding — "Actuals (past)", "Current month" ("Current week" in Weekly), "Monthly pulse", "High load", "Over-allocated" — then "How estimates work" (info icon). On the right: "Expand all" / "Collapse all" as text links (present in all three views, same handlers wired in `initTooltipsAndToggles()`).

**"How estimates work" popover (`9.8e.jpg`):** anchored under the link, title "Estimation logic · {view}", body = the existing explanation text of the active view (same content as today, split in short paragraphs). Closes on outside click / Esc.

**Grid, common to the three views:**
- Columns: label (~340px), Sold, Actuals, To plan (bold), then one column per period. Label + the three number columns are sticky left; header and Total row stay visible during vertical scroll; horizontal scroll on the periods only.
- Period header: "SEP 2026" + sub-label "actuals" for past periods, "current" for the current one (blue text + blue underline); Weekly: "OCT 12" + "W42".
- Cells: past periods on a light grey background; the current period has only a very light tint (no full blue column); Monthly pulse cells in lavender italic with "~3h", and "<1h" instead of "~0h" below half an hour; High load and Over-allocated cells amber/red (By owner only, §4.3). Empty cells blank, "—" for zero Actuals in the number columns.
- Parent rows light grey + bold, chevron (SVG) instead of ▶/▼; child rows white, indented. Second line of each label in muted small text.
- Total row: "TOTAL · {n} ASSIGNMENTS".
- Loading / error placeholders (`modelPlaceholderHtml()`) restyled in the same card; behaviour unchanged.

### 4.1 By role (tablet in `9.9a.jpg`/`9.9b.jpg`)
- Parent = role ("HWGACCSVS · Director"), second line "Sold {h} · Actuals {h}" on tablet; on desktop the numbers sit in their columns. Collapsed by default (unchanged).
- Children = (project, task) pairs from `roleChildMap`: project name, second line "task · owner" ("No owner yet" when none). Stage pill next to the project name on desktop.
- No load colours on role rows.

### 4.2 By project (`9.8b.jpg`, `9.8e.jpg`)
- Three levels Project → Task → Role. Project row: name, stage pill, status pill, "client · start – end" on the second line. Task row: name + "{n} roles". Role row: avatar with the owner's initials + "role", owner name on the second line (multiple owners: stacked avatars, names comma-separated). The separate Owner level disappears.
- Inactive owners: existing "inactive" badge (`inactiveBadgeSuffix`) next to the name, restyled as a pill.

### 4.3 By owner (`9.8c.jpg`, `9.8d.jpg`)
- "Unassigned (TBD)" pinned first: amber "?" avatar, "Needs owner" pill, second line "No owner found in actuals, or every owner is inactive".
- Person row: initials avatar, name, "{n} projects · role(s)". Children: project (stage + status pills, client) → task ("team · role").
- High load / Over-allocated colours on person cells. Thresholds as drawn: ≥24h/week and ≥30h/week (monthly = same per-week rate on the period's working weeks) — **to confirm against the app** (§10).

## 5. Tablet and smartphone (`9.9a.jpg`, `9.9b.jpg`)

Media queries in `planning.css`; nav breakpoints from `js/nav.js`.

**Tablet ~1024 (icon sidebar):**
- Page head: title, subtitle, Team assistant + Export as icon button (Load XLS moves into the Filters panel).
- Toolbar on one row: view and interval segmented controls, period selector (arrows + label; Today moves into the menu), "Filters {n}" button. Filters opens a right-side panel with Pipeline chips, Projects, Team, Monthly pulse, Rounded, Load XLS; badge = number of active non-default filters.
- Grid: only label and "To plan" sticky; Sold and Actuals move to the label's second line. About 4 periods visible, the rest scroll horizontally. Legend reduced to "How estimates work" + Expand/Collapse.

**Smartphone <768 (top navbar) — read-only:**
- Title + "Filters {n}" button. View segmented control full width. Period stepper "‹ Oct 2026 ›" with sub-label "Current month · planned" / "Actuals"; one period at a time (moves inside the window; window itself set from the Filters sheet).
- One card per parent row: title, "{n} assignments · Sold {h}", large value for the selected period + "{h} to plan", mini bar of the window's periods (past grey, current magenta, future navy, empty dash). Tap a card to expand its children as list rows (label, second line, value).
- Filters = bottom sheet (`9.9b.jpg`): Pipeline chips, Projects, Team, Monthly pulse, Rounded, period range, "Show results" primary button, "Close". Rows/targets ≥44px.
- No Load XLS, no Expand all, no editing on smartphone. Export stays available as icon in the head if the site's pattern allows it.

## 6. Team assistant panel (not designed — specification)

Opened by the Team assistant button (`taOpen`), admin/sysadmin only. Keep `#teamAssistantPanel` and all its logic (`taProjectId`, `taRank`, `taSend`, `taNewChat`, `taStarters`, `shouldSendOnEnter`, `selectionStillValid` watcher, `renderChatText`, `tableTitle`, `rowView`, `taError`); restyle only.

- **Container:** right-hand drawer, full height, `width: min(940px, 100vw)` (as today), slides in from the right over the page with the site's shadow token and a light backdrop on the grid; the planning page stays mounted underneath. Close: × icon button, Esc, or backdrop click. Focus moves into the panel on open and back to the Team assistant button on close.
- **Header:** white background with bottom border (not the navy band), title "Team assistant" with the team icon, no 🤖, close icon on the right.
- **Setup block:** project select "Select a project…" (`taProjectOptions`), primary "Calculate team", secondary "New chat". Empty state text unchanged ("What do you want to do? Pick a project…"). Starter prompts as chips under the select, only while the chat is empty; clicking fills the input (unchanged).
- **Chat:** user bubbles right (navy), assistant bubbles left (neutral surface), max-height as today with its own scroll, auto-scroll to the last message. Busy state: typing indicator bubble + disabled controls.
- **Composer:** textarea (placeholder unchanged) + "Send" primary; Enter sends, Shift+Enter new line (`shouldSendOnEnter`). "…" becomes a spinner inside the button.
- **Results:** three sections "Best team", "Alternative team", "Available team", each with one sub-block per role. Tables use the site's table style: Resource, Role, Score, h on role, Tags (pills), Similar projects, Similar tasks, Topics, Free h/wk, Current load, h on project, Rationale; horizontal scroll inside the section if needed. "Nobody." / `section.note` as muted text. `taError` as the site's warning alert.
- **Tablet:** same drawer, 100% of the content width beside the icon sidebar. **Smartphone:** full-screen sheet with a top bar (title + Close); results tables become one card per person (name, score, key numbers, rationale).

## 7. Copy (English)

| Today | In production |
|---|---|
| "By Role" / "By Project" / "By Owner" | "By role" / "By project" / "By owner" |
| "Pipeline:" + filled buttons | "Pipeline" + stage chips |
| "Projects" + badge, "✕ Projects" | "Projects: All (8)" / "Projects: 3"; reset = "Clear" in the popover |
| `◀+ −▷ windowLabel ◁− +▶` | "‹ Sep 2026 – Feb 2027 ▾ ›" + "Today" |
| Always-open estimation paragraph | Legend + "How estimates work" |
| "From actuals" / "To be planned" | "Actuals" / "To plan" |
| "~0h" | "<1h" |
| "TBD" | "Unassigned (TBD)" + "Needs owner" |
| "🤖 Team assistant" | "Team assistant" |

## 8. Out of scope

- Planning model API, calculations, cache, distribution rules, XLS formats (import and export content unchanged).
- Team assistant backend and prompts.
- Editing planning data (the page stays read-only on every device).

## 9. Docs to update

- `docs/pages/planning.md` (toolbar, period selector, search, legend/popover, grid classes, responsive, Team assistant drawer).
- `CLAUDE.md` file structure (`planning.css`), `docs/css/stylesheets.md` (`.ta-*` moved or restyled).
- `TEST_CASES.md` / `test-cases.html`: period arrows/menu/Today and limits, search per view, Projects popover, Expand/Collapse, legend popover, Team assistant open/close/Esc/focus, tablet Filters panel, smartphone cards and sheet. Update `content-surface-guard.test.js` / `page-head-guard.test.js` if the pinned buttons change.

## 10. Decisions to confirm before implementation

| # | Point | Proposal |
|---|---|---|
| 1 | Search field | Client-side row filter only; does not change totals, request or export |
| 2 | Load thresholds | 24h/week high load, 30h/week over-allocated — verify against existing app values; if the app uses others, the app wins |
| 3 | Period presets | 3 / 6 / 12 months starting one month before today + Whole range; Today = current default window |
| 4 | Load XLS on tablet/smartphone | Tablet: inside Filters; smartphone: not available |
| 5 | Team assistant drawer | Overlay with backdrop (not pushing the grid) |

## 11. Checklist

- [ ] `css/planning.css?v=1`, tokens only, no hex, no emoji (including the JS-built view HTML).
- [ ] `.ph` head, `initNav`, site controls: site wins over the images; no Compact toggle.
- [ ] Two-row toolbar, stage chips, Projects/Team popovers, period selector (§3), search.
- [ ] Legend + "How estimates work"; Expand/Collapse in all views.
- [ ] Grid: sticky label/Sold/Actuals/To plan, sticky header and Total, period encodings, "<1h".
- [ ] By role / By project (3 levels, avatars) / By owner (Unassigned first, load colours).
- [ ] Tablet and smartphone as §5; smartphone read-only.
- [ ] Team assistant drawer restyled, logic unchanged.
- [ ] Model fetch, stale guard, filters, Rounded, Monthly pulse, inactive badges, XLS import/export unchanged; tests green (`planning-calc`, `planning-model-ui`, `team-assistant-ui`, `page-head-guard`, `content-surface-guard`, `foundations-guard`).
- [ ] Checked at 1440, 1024, 390: Monthly and Weekly, each view, admin and plain user, window at axis limits, empty/error model.
- [ ] Docs updated (§9).
