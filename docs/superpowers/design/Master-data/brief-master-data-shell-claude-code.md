# Brief — Master Data: shared layout ("shell")

**Goal of this cycle:** align all five Master Data pages to one shared layout. At the end of the cycle every page has the same page head, the same sub-navigation and the same content frame, on desktop, tablet and smartphone.

Pages in the cycle (all of them, in one cycle): `master-clients.html`, `master-client-groups.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html`.

This is phase 1 of the Master Data redesign (page 10).

**Each page's content (tables, forms, rate card, modals, empty states) is out of scope. It will get its own brief per page later (phase 2).** In this cycle do not redesign or restyle that content: keep the existing tables, forms and behaviour working as they are, and only move them into the shared frame. Where the boards show content that differs from today's pages, ignore it.

## 1. References

- **Desktop reference:** board **10.2a — "Clients · elenco"** (`MDClients.dc.html`, default list state). Only the shell matters here: breadcrumb, page head, sub-nav, card header/toolbar. Ignore the table content. The shell is identical in `MDPipelines`, `MDRoles` and `MDCurrencies`.
- **Tablet / smartphone reference:** board **10.2e — "Tablet e smartphone"** (`MDClientsResponsive.dc.html`): the 1024×768 frame for the tab row, the 390×844 "Clients" frame for the section selector.
- `MasterDataSettingsHub.dc.html` (10.1) is the **original concept only**. Its labels (Italian), collapsed sidebar and item list are outdated. Do not implement from it.
- Pages in scope: `master-clients.html`, `master-client-groups.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html`.

## 1b. Precedence

The boards are mockups: anything drawn in them that already exists in the app as a shared component is **illustrative only**. In case of any discrepancy, the app's current implementation wins:

- main navigation (sidebar expanded/collapsed, tablet icon rail, phone top navbar), user block, notifications;
- breadcrumb bar;
- shared page head `.ph*` (sizes, spacing, wrapping, responsive rules);
- design tokens in `css/tokens.css` (colors, spacing, radii, type scale) and the existing breakpoints;
- shared buttons, inputs and icons (`.pd-icon`).

If a board value differs from a token, use the closest token instead of the board value. The boards are normative only for what is specific to Master Data: the sub-navigation (§4), the content card frame (§5) and their responsive behaviour (§6). If even these conflict with an existing shared pattern, follow the shared pattern and note the deviation in the PR.

## 2. Current state in the repo

- Each page has hand-written `<div class="md-layout"><nav class="md-subnav">…</nav><div class="md-content">…</div></div>`. The sub-nav has 5 flat links and no groups.
- Each page has its own `.page-header` with `<h1>` = section name (Clients, Currencies…) at 2.5rem, plus page-local Bootstrap styles.
- `js/lib/page-head-guard.test.js` lists all 5 pages in `EXCLUDED` ("out of this cycle, Spec section 10"). The shared page head (`.ph*`) is not applied yet.
- `css/style.css` → `.md-subnav` is a row of links below 1024px and a 200px sticky column from 1024px up.

## 3. Target layout (desktop ≥ 1024px)

From top to bottom, right of the main sidebar (unchanged):

1. **Breadcrumb bar** (existing nav breadcrumb): `Home / Master Data / <Section>`. The section is a link back to the section's list when the user is in a sub-view (e.g. `… / Clients & groups / Bayer AG · Rate card`).
2. **Page head**, using the shared `.ph` component:
   - `.ph-title`: **"Master Data"** (same on every page; the section name moves into the content card, see 5).
   - `.ph-sub`: "Clients, programs, roles and rates used across the app." Replace "programs" now that Programs is no longer in Master Data: **"Clients, pipelines, roles, rates and currencies used across the app."**
   - No page-level actions (`.ph-side` empty). Actions live in the content card toolbar.
3. **Body**: `display:flex; gap:20px; padding:16px 24px 24px`. Two columns:
   - **Sub-navigation** (left, 196px, see 4).
   - **Content card** (right, `flex:1; min-width:0`, see 5).

Background of the page: `#F3F4F6`.

## 4. Sub-navigation

**Structure:** grouped. The order and labels are final:

| Group | Item | Page |
|---|---|---|
| COMMERCIAL | Clients & groups | `master-clients.html` |
| COMMERCIAL | Pipelines & POTs | `master-pipelines.html` |
| FINANCIAL | Roles & rates | `master-roles.html` |
| FINANCIAL | Currencies | `master-currencies.html` |

Client Groups is not a separate entry: it is merged into "Clients & groups" (see 7).

**Desktop style:**
- Container: white, `1px solid #DDE1E8`, radius 12px, padding `6px 6px 10px`, `align-self:flex-start`. Sticky at the top while the content scrolls.
- Group label: 10px, 700, uppercase, letter-spacing .06em, `#9AA0AC`, padding `12px 10px 4px`.
- Item: height 34px, padding `0 10px`, radius 8px, 12.5px. The label sits on the left; an optional count sits on the right (11px, `#9AA0AC`).
  - Rest: weight 500, `#374151`, transparent background. Hover: `#F3F4F6`.
  - Active: weight 700, `#0B1840`, background `#F3F4F6`, `box-shadow: inset 3px 0 0 #F0287A` (same marker as the active item in the main sidebar). Set `aria-current="page"`.
- Each item is a real `<a href>` (full page navigation, as today).

**Single source:** stop hand-writing the sub-nav in 5 files. Render it from one definition (e.g. `js/md-subnav.js`, or a function next to `initNav`) that receives the active item id. `master-data-guard.test.js` should check the generated output instead of the HTML string.

## 5. Content area (structure only)

**Scope rule for this phase: touch only the structure, aligning it to the Master Data shell of board 10.2a. Do not restyle anything inside the content.**

What changes:
- The page content sits in the right column, inside a white container: `1px solid #DDE1E8`, radius 12px, `align-self:flex-start`.
- Today's per-page `<h1>` (Clients, Currencies…) is removed from the page head; the section name appears as the first element of the content container, 15px, 700, `#0B1840`.
- Existing controls (add buttons, tabs, filters, search) keep their current markup and style; only their position moves to the top row of the container, next to the section title.

What does NOT change in this phase:
- tables, columns, rows, forms, modals, inline editing, empty states, validation messages;
- button, input and tab styles inside the content (e.g. Bootstrap `btn-primary`, `.cfg-tabs`);
- behaviour, API calls, copy.

The card header/toolbar details visible in the boards (segmented controls, 190px search, navy primary button, table header style, inline add rows) are defined in each page's phase-2 brief, not here.

**Loading / access states** stay in the content area, below the page head. The lock emoji in "Admin access required." is replaced with a 16px stroke SVG (no emoji, see CLAUDE.md).

## 6. Responsive

The main sidebar follows the existing rules (icons at 1024, top navbar on phone). Only the Master Data parts change:

**Tablet (768–1023px)** — reference: `MDClientsResponsive`, 1024×768.
- Page head: title "Master Data" 22px, padding `14px 20px 0`; subtitle hidden.
- Sub-nav becomes a **horizontal row of tabs** under the title: scrollable, no visible scrollbar, padding `10px 20px`, bottom border `#DDE1E8`. Tab: 36px high, padding `0 12px`, radius 8px, 12.5px. Active tab: white, `1px #DDE1E8`, `inset 0 -3px 0 #F0287A`, 700 `#0B1840`. No group labels.
- Content container goes full width below the tabs, padding 20px horizontally. Its content is unchanged.

**Smartphone (< 768px)** — reference: `MDClientsResponsive`, 390×844.
- Title "Master Data" 20px, padding `12px 16px 0`.
- Sub-nav becomes a **section selector**: one 48px row (white, `1px #DDE1E8`, radius 10px) showing the group label (10px uppercase `#9AA0AC`), the current section (14px 700 navy) and a chevron. Tapping it opens the list of the 4 sections, grouped as in desktop (use the same bottom sheet as the Reporting filters if available, otherwise a native `<select>` is acceptable).
- Content container goes full width below the selector, padding 16px horizontally. Its content is unchanged (phone layouts of tables and toolbars belong to each page's brief).
- Selector and sub-nav hit targets ≥ 44px.

Breakpoints are the existing ones: 1024 and 768 (`.ph` rules in `style.css`).

## 7. Client Groups

The design merges Client Groups into "Clients & groups". In phase 1:
- The sub-nav shows the 4 items in §4.
- `master-client-groups.html` stays reachable by URL. When it is open, "Clients & groups" is the active sub-nav item. The page itself is removed or redirected in the Clients brief (phase 2).

## 8. Tests to update

- `page-head-guard.test.js`: remove the 5 pages from `EXCLUDED` (or move them to `PENDING` and empty it at the end of this phase). `.page-header` becomes forbidden on Master Data pages too.
- `master-data-guard.test.js`: update it for the grouped sub-nav (4 items, 2 groups, labels and hrefs as in §4, `aria-current` on the active item), the "Master Data" title and the breadcrumb.
- `nav-model.test.js`: no change. The main nav entry "Master Data" still points to `/master-clients.html`.

## 9. Out of scope (phase 2, one brief per page)

- Clients & groups (list / by group, archive, rate card), Pipelines & POTs, Roles & rates, Currencies: tables, columns, forms, modals, empty states, validation messages.
- Final removal of `master-client-groups.html`.

## 9b. Definition of done (per page, all five)

- Page head = shared `.ph`, title "Master Data", same subtitle on every page.
- Sub-nav rendered from the single shared definition, correct active item.
- Content inside the shared container, section name as its first row.
- Tablet: tab row; smartphone: section selector.
- Content, behaviour and API calls unchanged (existing tests for page content still pass).
- Page removed from `EXCLUDED` in `page-head-guard.test.js`.

The cycle is complete when all five pages meet these points.

## 10. Open decisions

1. **Counts in the sub-nav** (e.g. "Clients & groups 5", "Roles & rates 58"). They need data the other pages do not load. Default proposal: **no counts in phase 1**; add them later if a cheap endpoint exists.
2. **Phone section selector**: shared bottom sheet vs native `<select>`. Default: bottom sheet if the Reporting one already exists as a reusable component, otherwise `<select>`.
3. **Subtitle copy**: confirm "Clients, pipelines, roles, rates and currencies used across the app."
