# Brief — Team redesign (`team.html`)

**Goal:** restyle the Team page. It covers the resource register, name reconciliation (Unmatched names) and the experience profile. The aims:
- one actions menu per row, with a clear risk hierarchy (Deactivate vs Delete);
- Unmatched names as a queue you work through;
- a real visual language for the experience profile;
- New resource in a drawer instead of a modal.

**Scope: visual and interaction layer only.** The APIs (`GET/POST /api/resources`, `PATCH/DELETE /api/resources/:id`, `GET /api/resources/:id/profile`, `GET /api/resources/unmatched`, `POST /api/resources/unmatched/rescan`, `GET/POST /api/resources/aliases`, `DELETE /api/resources/aliases/:id`, `GET /api/roles`, `GET /api/users/active-list`) and the name matching rules **don't change**.

## 0. The site wins over the design

The boards are a visual reference, not a spec. **The site's rules and stylistic choices take precedence over the boards.**

- **Visual consistency with the pages already redesigned comes first.** Dropdowns and selects, drawers (width, header, footer, scrim, close behaviour), modals, banners, segmented controls, badges, tooltips, buttons and the empty, loading and error states must use the components and classes the site already has (Master Data, Roles & rates, Timesheets, User Admin, Pipeline). If a board shows a slightly different variant (spacing, radius, shadow, header colour, chevron, font size), **use the site's version**, not the board's.
  - The searchable "Assign to" select uses the existing `combo-select` component, restyled only where needed to match the other dropdowns. Don't write a new one.
  - The New resource / Edit drawer is the same drawer used by Invite user (User Admin) and by Master Data editing.
  - The resource panel follows the Pipeline side panel (boards `Pipeline/4.10…4.13`).
- **When a board and the site disagree on data, rules, permissions, API responses or flows, the site is right.** Keep the behaviour and apply only the look.
- **If a board (or part of one) needs new development, ignore it.** New development means a new endpoint, a new field in an API response, a change to the matching logic, or persistence that doesn't exist yet. Build only what can be done with the current APIs and data, and list what you left out in the PR. Elements that are likely in this category are marked **⚠ only if available** below.
- Sample names, numbers and dates in the boards are placeholders.

## 1. References

The captures are in `docs/captures/team/` (PNG, 1×), and each file name starts with the board id. The sources are `TeamAdmin.dc.html` and `TeamAdminResponsive.dc.html`. The notes are in `Section - Team.dc.html`. **Only the 13 boards below are the final direction.** The other boards in the Section are explorations: ignore them, in particular the page tabs Team / Unmatched names.

| Board | File | State |
|---|---|---|
| 13ab | `13ab-team-callout.png` | Resource list, with the Unmatched callout above the table |
| 13c | `13c-row-menu.png` | Row ⋯ menu open |
| 13g | `13g-delete-confirm.png` | Delete confirmation (modal) |
| 13af | `13af-new-resource-drawer.png` | New resource drawer, empty |
| 13ag | `13ag-new-resource-error.png` | New resource, Role error |
| 13ah | `13ah-new-resource-created.png` | New resource, created |
| 13f | `13f-edit-resource.png` | Edit resource, drawer opened over the resource panel (the Role and Linked user selects look empty only because of the export; they are prefilled) |
| 13i | `13i-unmatched-assign.png` | Unmatched names drawer: queue, ambiguous name, Assign to open |
| 13k | `13k-unmatched-assigned.png` | Queue after an Assign: success feedback and counter |
| 13m | `13m-existing-aliases.png` | Unmatched names drawer, Existing aliases view |
| 13n | `13n-panel-details.png` | Resource panel, Details with Aliases open |
| 13o | `13o-experience-profile.png` | Resource panel, full Experience profile |
| 13aa | `13aa-1-tablet.png`, `13aa-2-smartphone.png` | Tablet 1024×768 and smartphone 390×844 |

The states that have no capture of their own (loading, empty, errors, profile states) are described in §9.

## 2. Constraints

- Vue 3 and Bootstrap 5.3 from CDN stay. No build step.
- Shell unchanged: `pd-nav` sidebar, `#app-main`, and the shared `.ph` header with breadcrumb `Home › Team`.
- **No hex literals in the page.** Use `var(--token)` from `css/tokens.css`. The hex values below show the intent: map each one to the nearest existing token. Add a token only if none fits, and say why in the PR. Every text/background pair must be ≥ 4.5:1. Remove the local hex pills from `css/admin-crud.css`, including the inactive one, which is 2.3:1 today.
- All UI copy in English. Use the ellipsis character `…`.
- Icons: inline SVG, `stroke="currentColor"`, 14/16 px. No emoji.
- No `alert()` / `confirm()`.
- Layering: page < resource panel < New/Edit drawer and modals.

## 3. Page structure (13ab)

- **The page tabs Team / Unmatched names are removed** (that pattern isn't used anywhere else in the app). The page shows only the resource register. Unmatched names opens in a drawer (§6).
- `.ph` header: title **Team**. Subtitle `{n} resources · {a} active · {i} inactive`, which fixes the current count that includes hidden inactive resources. Primary button **New resource** (magenta, plus icon).
- **Unmatched callout**: a strip above the table card, shown **only when there are unmatched names**. Amber tone (background `#FFF8EC`, border `#F2D3A6`, secondary text `#8A4B08`), with an unlink icon. It contains:
  - Title: `{n} names in uploaded actuals aren't matched to a resource`.
  - Text: `{h} h not attributed · {k} ambiguous. Their hours don't count in any experience profile until you match them.` Drop the ambiguous part if `k = 0`.
  - On the right, a text link **Existing aliases** (opens the drawer on the aliases view) and the navy button **Review names →** (opens the drawer on the queue).
  - The hours total is the sum of the queue `hours`, calculated on the client.
  - When the queue is empty, the callout disappears.

## 4. Toolbar and table

The toolbar sits in a white card, left to right:

1. **Status segmented control**: Active / Inactive / All, each with its count. It replaces the "Show inactive" checkbox, and Active is selected when the page opens. Same component as the User Admin status filter.
2. **Role select**: `Role: All roles / …` (labels from `GET /api/roles`). Client-side filter.
3. **PDash user select**: `Any / Linked / Not linked`. Client-side filter on the existing `user_id` field.
4. **Search**, right-aligned: `Search name, email or role…`. Same behaviour as today.

Changing the search, a filter or the sort resets to page 1, as today.

**Columns:** Name (30 px initials avatar; the email goes under the name, muted) · Role (label, with the code below in small semibold muted text) · Linked PDash user (link icon + name, or `—`) · Status (`active` / `inactive` pill with a dot) · ⋯.

- Sortable columns: Name, Role, Status. Use the site's sort arrows, with `aria-sort`. The page opens sorted by Name ascending.
- Pagination at 25 rows, as today: `1–25 of N`, `‹ Previous`, `Page X of Y`, `Next ›`.
- **A row click opens the resource panel.** The open row is highlighted (very light pink background `#FFF5F9` + a 3 px magenta inset bar on the left).
- Rows and headers are reachable with the keyboard (tabindex), with a visible focus state (2 px magenta outline). Enter on a row opens the panel.
- Pills: active `#E7F5EC` / `#146C3A` with dot `#1F9D55`; inactive `#F0F1F4` / `#4B5563` with dot `#9AA0AC`. Inactive rows show the name in `#4B5563`.

## 5. Row actions (13c) and Delete (13g)

- The three buttons on each row are replaced by **a single ⋯ menu** (the same popover as User Admin; it opens upwards on the last rows, and Esc or a click outside closes it):
  1. **Edit**: `Name, role, job description, linked user`. Opens the drawer (§7).
  2. **Deactivate**, with a light navy `LEFT THE COMPANY` tag: `Hides them from lists. Hours and aliases stay. Reversible.` On an inactive resource it becomes **Activate** (`Back in the active list`). No confirmation, as today.
  3. Divider, then **Delete…** in red with a red `IRREVERSIBLE` tag: `Removes the resource and {n} aliases.`
- **Row in progress**: while Deactivate/Activate runs, the status pill is replaced by a spinner + `Updating…`, and the row is at 70% opacity.
- **Delete modal (13g)**: a centred modal (the same component as the User Admin confirmations).
  - Title `Delete {name}?` with an `IRREVERSIBLE` tag. Text: `This can't be undone. The resource and its aliases are removed, and their names go back to Unmatched names.`
  - Two boxes: **Deleted** (`Resource record`, `{n} aliases`) and **Back to Unmatched names** (the alias names).
  - If the resource is active, a box with `Has this person left? Deactivate instead: their hours stay attributed and you can reactivate later.` and a **Deactivate** link.
  - The checkbox `I understand this can't be undone.` enables the red **Delete resource** button.
  - ⚠ only if available: the list of names that go back to the queue comes from the aliases already loaded on the client. If they aren't available in that context, show only the count.

## 6. Unmatched names drawer (13i, 13k, 13m)

- A right-side drawer, **980 px** (full width on tablet, a full-screen page on smartphone). Header: eyebrow `TEAM`, title **Unmatched names**, sub `Match names from uploaded actuals to resources, so their hours count in experience profiles.`, close ×. Scrim, Esc and × close it. Use the same drawer component as the rest of the site; only the width changes.
- Inside the drawer, a **Queue {n} / Existing aliases {n}** segmented control (same component as the status filter). On the right: **search** (`Search name…`, which ignores case and accents, as today) and **Rescan** (outline, with a spinner and `Rescanning…` while it runs).

**Queue**

- Summary strip: `{n}` **names to match**, `{h} h` **not attributed to anyone**, and a green progress bar `{r} of {t} resolved this session`, plus `{k} ambiguous`. The session counter is client-side only and resets on reload.
- Help text on the right: `Names found in uploaded actuals that couldn't be matched to a resource. Assign each one, or ignore names that aren't people.`
- Columns: Name in actuals · Hours · Projects · Assign to · actions. The page opens sorted by Hours descending; Name, Hours and Projects are sortable.
  - **Hierarchy**: names with ≥ 40 h are bold. Under the hours there's a thin navy bar, sized relative to the largest value in the queue.
  - **Ambiguous**: an amber `AMBIGUOUS` badge next to the name (`#FFF1DC` / `#8A4B08`), with the line `{n} active resources share this name. Pick the right one.` Under the select, **candidate chips** (name + role code) that pick that candidate with one click. The candidates are the ones the API already returns.
  - **Projects**: a `{n} projects ▾` button. It expands a **sub-row at full width** under the row (project name, code, hours), so the cell no longer stretches the row. ⚠ only if available: show the hours per project only if the API returns them; otherwise show name and code only.
  - **Assign to**: the existing `combo-select`. Groups: `— none —`, **Same name · candidates**, **Active resources**, **Inactive** (marked `(inactive)`). Keyboard navigation, as today. It should look like the other dropdowns on the site.
  - **Assign** (navy, disabled until something is chosen) and **Ignore** (outline, tooltip `Not a person (e.g. TBD). Stored as an ignored alias.`).
- **Feedback (13k)**: while a request runs, the row shows a spinner + `Assigning…` / `Ignoring…`. Then the row leaves the queue and a green section banner appears: `"{name}" assigned to {resource} ({code}). Removed from the queue. Their profile updates in the next background run (about 10 minutes).` (for Ignore: `"{name}" ignored. Stored as an ignored alias…`). The banner has an **Undo** link, which deletes the alias that was just created with `DELETE /api/resources/aliases/:id`. Errors use the red section banner, separate from the global one.
- Empty states: `No unmatched names.` (green check, `Every name in uploaded actuals resolves to a resource or is ignored. New uploads may add names here.`) and `No unmatched names match the search.`

**Existing aliases (13m)**

- Its own view instead of the accordion at the bottom of the queue. It has a search (`Search alias or resource…`) and a **Resolves to** select: `Anything / A resource / Ignored`. Client-side.
- Columns: Name in actuals · Resolves to (an arrow + `Resource · CODE`, plus an `inactive` chip if the resource is inactive; or a dashed `ignored` chip) · Hours · **Remove** (outline). Note at the bottom: `Removing an alias sends the name back to the queue…`
- ⚠ only if available: the **Hours** column only if the aliases API returns them. Otherwise drop the column.

## 7. New resource / Edit resource drawer (13af, 13ag, 13ah, 13f)

**Change from the current page:** the modal becomes a **480 px right-side drawer**, the same as Invite user in User Admin.

- Header: eyebrow `TEAM` (or `RESOURCE` for Edit), title **New resource** / **Edit resource**, sub:
  - New: `A person who works on projects. They don't need a PDash account.`
  - Edit: `Changes apply to this resource only. Hours already attributed don't move.`
- Body, scrollable:
  - First name / Last name side by side, then Email.
  - **Role \*** (`Select a role…`, options shown as `label (code)`), with the help text `Missing a role? Add it first in Master Data → Roles & rates.` as a link.
  - Job description (textarea).
  - **Linked PDash user (optional)** (`— None —`, then active users shown as `Name Surname (email)`), with the help text `Only if this person signs in to PDash. Most resources don't need an account.`
- Selects in the site's standard style.
- Footer: `Cancel` and **Create resource** / **Save changes** (magenta, with a white spinner and `Creating…` / `Saving…` while it runs).
- **Error (13ag)**: red box at the top of the body with the message (`Role is required…` or the server message), and the related field in red with `Role is required.` underneath.
- **Created (13ah)**: the drawer stays open with a green confirmation: `{name} was created`, `{Role (code)}. Their experience profile appears after the next background run, once actuals match their name.` and an **Open resource** link (opens the resource panel). The footer becomes `Create another` (empty form, keeps the last role) and **Close**.
- **Edit (13f)** from the ⋯ menu or from the panel: same drawer, prefilled. Over the panel it sits on a higher layer. After saving, the drawer closes and a `Changes saved.` banner appears.

## 8. Resource panel (13n, 13o)

- Right-side drawer, **860 px**, the same component as the Pipeline panel. Navy header with avatar, name, status pill, `Role · CODE` and ×. Tabs **Details** / **Experience profile** use the site's tab component (magenta underline). It closes with ×, Esc or a click outside, as today. **Edit** is on the tab row, on the right.

**Details (13n)**

- Definition list in a two-column card: Name, Email, Role (+ `Code …`), Linked user (name + email, or `Not linked` + `This person doesn't sign in to PDash.`), Status, Job description (multi-line, or `—`).
- **Aliases ({n})**, collapsible: `Names from uploaded actuals that resolve to this resource.`, one row per alias with **Remove**. Empty state: `No aliases for this resource.`
- **Management card** with two rows, which makes the risk hierarchy explicit:
  - **Deactivate** (navy outline): `The right choice when someone leaves. Hidden from lists; hours and aliases stay attributed. You can reactivate any time.` It becomes **Activate** on inactive resources.
  - **Delete resource** (red title, red outline button **Delete…**): `Removes the resource and its {n} aliases. Their names go back to Unmatched names. Can't be undone.` Opens the modal from §5.

**Experience profile (13o)**

- **Totals**: one card with 4 cells (HOURS, PROJECTS, FIRST MONTH, LAST MONTH), 20 px bold values. Months are shown as `Dec 2025`.
- Below: refresh icon + `Last calculated {date, time}. Rebuilt in the background from uploaded actuals, every 10 minutes. Recent assignments appear after the next run.` and on the right the link **Profile processing →** (`profile-jobs.html`).
- **Topics**:
  - **Direct experience** (`tasks with logged hours`): solid chips `Label · {n} project(s) · {h} h`, sorted by hours. The two strongest are light navy (`#E3E8F6` / border `#C9D2EC`), the rest are white. A tooltip lists the projects.
  - **Project context** (`from descriptions of projects they worked on`): dashed chips `Label · {n} project(s)`.
  - Legacy group "Topics (provenance not available — recalculate profiles)": same dashed chips, shown only when present. Empty state: `No topics yet.`
- **One card per dimension** (Market, Brand, Therapeutic Area, Service Type, plus any lists added by admins). Header: name + `{n} values`, with `{h} h on projects without a value` on the right.
  - Value row: chevron · value · **share bar** (navy on a light grey track, 8 px) · hours · % · `{n} projects` · last month. Rows are sorted by hours, and the last month is green semibold if it falls within the last 3 months.
  - Expanded → **project** rows (indented, light grey background): chevron · name + code · hours · last month.
  - Expanded → **task** rows (further indented, thin grey line on the left): name · hours.
  - Rounding as today: hours to 2 decimals, shares as whole percentages.
- **Roles**: the same card, with column `ROLE`. It expands to projects only.
- Use buttons with `aria-expanded` (not native `<details>`), keyboard accessible.

## 9. States without their own board

- **Profile**: `Loading profile…` (centred spinner). **Not calculated yet** (`The profile is built in the background from uploaded actuals. New resources get one after the next run (about 10 minutes).`). **No actuals matched to this person yet** (`Their name may appear in actuals in a different form…` + the button **Open Unmatched names ({n})**, which opens the drawer). **Error**: red banner `Couldn't load the profile.` + **Try again**. All of these sit in a dashed-border card, centred.
- **No resources match the current filter.**: search icon, a line describing the active filters, outline button **Clear filters**.
- **Page loading**: spinner + `Loading team…` in the card. Subtitle `Loading…`. Callout hidden.
- **Access denied**: as in User Admin: lock icon, **Admin access required**, `The team register is available to admins and sysadmins. Ask an admin if you need access.`, **Go to app**.
- **Global banners** above the card: green for success (e.g. `{name} was deactivated. Their hours and aliases stay attributed. Find them under Inactive.` with **Undo**), red for errors (as today). A new action clears the previous banner.

## 10. Responsive (13aa)

- **Tablet 1024×768 (icon sidebar):**
  - Compact callout above the table.
  - Columns: Name (email below, plus `Linked to a PDash user` as a third line when linked) · Role · Status · ⋯.
  - Role and PDash user move into a **Filters** button. Targets ≥ 40 px.
  - The resource panel is 720 px. The Unmatched drawer covers the content area: Projects moves under the name, Ignore becomes an icon with a tooltip.
- **Smartphone 390×844 (top navbar):**
  - Header `Team` + a 44 px magenta `+` button. Compact callout (`{n} unmatched names · {h} h not attributed · Review ›`).
  - Full-width search + filters button. Status filters become pills with counts.
  - Each resource is a card: name + pill, `Role · CODE`, email, and ⋯ (44 px). Tapping the card opens the resource as a **full-screen page** with a back arrow.
  - In the profile: totals in a 2×2 grid, the bar goes under each value, projects open with a tap.
  - **Unmatched names** is a full-screen page with a back arrow and an `Aliases` link. Each name is a card (name, hours, projects, ambiguous badge, select, Assign).
  - The Assign to select becomes a **bottom sheet**: search, candidates on top, then active resources, with **Ignore name** and **Assign** (48 px) at the bottom.
  - The New/Edit drawer becomes full screen. The modals use the full width with a 16 px inset. Every target is ≥ 44 px.

## 11. Accessibility

- ⋯ button: `aria-haspopup="menu"`, `aria-expanded`; the menu uses `role="menu"`. Esc closes it and returns focus to the button.
- Drawers and modals: focus trap, focus on the first field (New/Edit) or on the title (panel). Return focus on close. Esc closes the topmost layer only.
- Sortable headers are buttons with `aria-sort`. Rows are focusable, and Enter opens the panel.
- Banners: `role="status"` for success, `role="alert"` for errors. Row spinners use `aria-live="polite"`.

## 12. Acceptance

- No page tabs. The Unmatched callout is shown only when there are names; the queue and the aliases live in the drawer.
- One ⋯ menu per row: Deactivate is marked as the right choice for someone who has left, and Delete is red and separate. The Delete modal needs the checkbox and suggests Deactivate.
- The counter appears only once (the callout and the drawer's segmented control). The subtitle separates active and inactive resources.
- New/Edit resource opens in a 480 px drawer, with error and created states inside the drawer.
- The profile has totals, two topic groups with chips, dimensions with share bars, and value → project → task with chevrons. All profile states are handled.
- Dropdowns, drawers, modals, banners and badges are the site's existing components. No new variants.
- No hex literals in the page; any new tokens are justified in the PR.
- Every element left out because it needs new development (⚠) is listed in the PR.
