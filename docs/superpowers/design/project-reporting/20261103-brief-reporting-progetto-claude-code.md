# Brief for Claude Code — Project Reporting, Breakdown card v2 (board 7.4c)

Evolution of the **Breakdown** card described in `docs/brief-reporting-progetto-claude-code.md` §6. All constraints of that brief (§0) still apply: no build step, `var(--token)` only, `?v=N` bumped on every touched file, no emoji, SVG icons with `stroke="currentColor"`. **No calculation changes**: Sold, Spent, Remaining and Total consumption still come from `summaryByTask/Role/Group` and `summaryTotals`. Only the interaction and presentation of the Entries change.

Boards (page 7, section "Breakdown v2"; export as jpg with the same name):

| Board | Content |
|---|---|
| 7.4e | By task · Role filter active, all months with results open, sorted by Hours ↓ — **main reference** |
| 7.4f | By role · row expanded, Resource menu open |
| 7.4g | By functional area · area → task open → Entries |
| 7.4h | Tablet 1024 · By role with Resource filter, Note below the row |
| 7.4i | Smartphone · By task, filter in bottom sheet |
| 7.4j | Smartphone · By area, Entries as cards, Sort chip |

Data, resources and entries in the boards are sample values.

---

## 1. Period filter — closing

Today the menu only closes when the "Period" button is clicked again. It must also close:
- on a click outside the menu (listener on `document`, ignoring clicks inside the menu and on the button; removed on close);
- on **Esc** (focus returns to the button).

A click inside the menu (months, From/To) does not close it, except choosing "Whole project" or a month, which applies and closes as today. The same behaviour applies to the Role/Resource filter menu (§3.2).

## 2. Shared structure: Entries block

All three views use **the same Entries block** (one component or shared template, not three copies):

```
Entries · N                     [Role: All ▾]   Export XLS
  ▸ October 2026     12 entries   38.5h   € 3,080
  ▾ September 2026   21 entries   64.0h   € 5,120
      Date ↓ | Role (resource) | Hours | Amount | Note
      …
```

- Grouped **by month** (label, N entries, hours, amount), most recent first.
- **One month open at a time**, the most recent by default, **when no filter is active**.
- Entries respect the **Period** (primary filter): entries outside it are not shown; N and the monthly totals refer to the period. Period with no entries → "No entries in the selected period."
- Row columns: Date · Role (resource) · Hours · Amount · Note (see per-view exceptions in §4).

## 3. Filter and sorting

### 3.1 Sorting
- Click on the column header (Date, Role (resource) / Resource, Hours, Amount). On a new column the first click sorts ascending, the next one reverses. SVG arrow only on the active column, which turns navy; `aria-sort` on the header. Ties are broken by date descending.
- Default: **Date descending**.
- Sorting applies **within each month**: months always stay in descending chronological order. Note is not sortable.
- Each Entries block (a task, a role, a task inside an area) has its own sort, applied to all its months.

### 3.2 Filter
- Chip in the Entries block header: **"Role: All ▾"** in By task and By functional area, **"Resource: All ▾"** in By role (there the role is fixed, but several people can share it).
- Multi-select menu (checkboxes) titled "Filter by role" / "Filter by resource", with "All" at the top. Options: **only roles/resources with entries in the selected Period**, for that block, sorted by hours descending; hours in the period next to each option. Footer note: "Roles with entries in <period>".
- Active chip: highlighted border and background like the Period button, label "Role: PM, Analyst" (more than 2 options: "Role: 3 selected"), "Clear" link.
- **With an active filter**: **all months** with at least one matching entry open, months without results are hidden and the block footer shows "N months without matching entries hidden". The label becomes "Entries · N of M" and monthly totals are the filtered ones. Months can still be collapsed individually. If nothing matches: "No entries match the selected filters." + "Clear".
- Removing the filter returns to a single open month (the most recent).
- If the Period changes, options no longer present are removed from the filter; if none remain, the filter resets to "All".
- The filter does **not** change the main table rows (Sold/Spent/Remaining): it only affects the Entries.

### 3.3 Persistence
- Filter, sort, open month and expanded state persist **per block** when a row is collapsed and reopened, and when switching view (By task ↔ By role ↔ By functional area) on the same page.
- They reset when changing project (`showDashboard(id)`, including from the sibling switcher) and on page reload.
- State kept in a keyed object (e.g. `entriesState['task:<id>']`, `['role:<role>|<task>']`, `['area:<area>|<task>']`), extending or replacing `taskDetailState`.

### 3.4 Export XLS
- Exports **all entries of the block**, ignoring the Role/Resource filter and sorting. Regarding the Period: same behaviour as today's per-task export (check in the code and keep it).

## 4. The three views

### 4.1 By task
- Unchanged from §6.1 of the previous brief (expandable task, indented roles, then Entries), plus Role filter and sorting (§3).

### 4.2 By role
- Each row (`role|task`) becomes **expandable** with a chevron, in place (replaces the rule "By role / By functional area: rows not expandable").
- Inside: only the **Entries** block, with the entries of that role on that task.
- **Resource** filter instead of Role (§3.2).
- Row column: "Role (resource)" becomes **"Resource"** (the role is already in the row).
- Row subtitle: "<resources, …> · <task>".

### 4.3 By functional area
- Each area becomes **expandable**. Inside, the area's **tasks** indented, with the same columns (Sold, Spent, Remaining, Total consumption) and the same "Over sold" signal.
- Area subtitle: "N tasks · <task, …>"; task subtitle: "N roles".
- Each task is expandable and shows **the Entries block directly** (no indented roles, to limit nesting; the per-role split is available in By task).
- **One task open at a time** per area: opening another closes the previous one (its state is kept, §3.3).
- Role filter as in By task.
- Task-to-area and entry-to-task membership: same logic as today (`normalizeGroupEntries` / `entryMatchesRow`), no new rules.

### 4.4 Indentation and hierarchy
- Levels: main row → sub-row (role or task) → Entries → month → entry row. Constant indentation (proposed 24px per level), chevrons aligned in a column, no decorative vertical lines.
- Sub-rows use the role sub-row style already defined for By task.

## 5. Accessibility
- Expandable rows and months: `button` with `aria-expanded` and `aria-controls`.
- Period and Role/Resource menus: keyboard support (arrows, Space toggles the checkbox, Esc closes), focus returned to the chip.
- Sortable headers: `button` inside `th`, `aria-sort`.

## 6. Responsive
- **Tablet 1024×768**: same structure; in entry rows the Note moves to a second line below Date/Role.
- **Smartphone 390×844**:
  - main rows as cards: name + Over sold, subtitle, bar + %, "Spent X of Y" · "Remaining Z"; segmented control in 3 columns labelled "By task", "By role", "By area";
  - entry rows as cards (date + hours on top, role/resource and amount below, note at the bottom if present); the month header shows only N entries and hours;
  - Export XLS as a 36px icon;
  - sorting becomes a "Sort: Date ↓" chip next to the filter, opening a "Sort entries" bottom sheet (field as radio + Ascending/Descending, "Reset" / "Apply"), since there are no headers;
  - Role/Resource filter in a **bottom sheet** with checkboxes, "Clear" and "Apply", like the Period;
  - minimum target 44px (sheet rows 48px, 36px chips with extended hit area);
  - By functional area: reduced indentation (12px per level).

## 7. States
- No entries in the period: "No entries in the selected period."
- No entries matching the filter: "No entries match the selected filters." + "Clear".
- No functional areas configured: unchanged (option disabled with tooltip).
- Area task without entries: expandable row, empty Entries with the period message.

## 8. Decisions to confirm
1. **Multi-select** filter (proposed) or single-select.
2. Export and Period: confirm the per-block export respects the Period as today.
3. Persistence: reset on project change (proposed) or kept for the whole session.

## 9. Copy
"Entries · N", "Entries · N of M", "N entries", "Role: All", "Resource: All", "Role: …", "N selected", "All", "Clear", "Apply", "Reset", "Filter by role", "Filter by resource", "Roles with entries in …", "Resources with entries in …", "N months without matching entries hidden", "Sort: …", "Sort entries", "Applies inside each month", "Ascending", "Descending", "By area", "N tasks", "Spent … of …", "Remaining …", "Date", "Role (resource)", "Resource", "Hours", "Amount", "Note", "Export XLS", "No entries in the selected period.", "No entries match the selected filters."

## 10. Checklist
- [ ] Period and filter menus close on outside click and Esc.
- [ ] Single Entries block shared by the three views.
- [ ] Header sorting, per month, default Date ↓.
- [ ] Role filter (By task, By functional area) / Resource filter (By role), options limited to the Period.
- [ ] Active filter: all months with results open, empty ones hidden; without filter one month at a time.
- [ ] Per-block persistence across collapse/expand and view switch; reset on project change.
- [ ] By role expandable; By functional area with two levels, one task open at a time.
- [ ] Export XLS of all entries of the block.
- [ ] Sold/Spent/Remaining unchanged (tests with and without Period, with active filter).
- [ ] Check at 1440, 1024, 390 with BERMITS Maintenance 2026 (several resources on the same role, functional areas).
- [ ] `docs/pages/portfolio.md` updated with a Breakdown v2 section.
