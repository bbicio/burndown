# Brief — Attribute Lists redesign (`attribute-lists.html`)

**Goal:** bring the last ⚙ Admin console into the redesigned language. The aims:
- no page tabs: a **Master Data–style sub-navigation** gives one-click access to every list and to the topic states;
- one ⋯ menu per row, with a clear risk hierarchy (Rename / Reject reversible, Merge irreversible and confirmed);
- the proposed topics as a **queue you work through**, like Unmatched names in Team;
- explain why nothing can be deleted, and what a manually created topic does (and doesn't) do;
- every form in the shared 480 px drawer instead of Bootstrap modals.

**Scope: visual and interaction layer only.** The APIs (`GET/POST /api/attribute-lists`, `PATCH /api/attribute-lists/:id`, `GET/POST /api/attribute-lists/:id/items`, `PATCH /api/attribute-lists/:id/items/:itemId`, `GET/POST /api/topics`, `PATCH /api/topics/:id`, `POST /api/topics/:id/{approve,reject,restore,merge}`) and the rules **don't change**: immutable slug, no Delete for lists or items, case-insensitive unique labels, topic naming rules (1–4 words, ≤ 60 chars, English, not a list name or an active item label), approved topics merge only into approved ones.

## 0. The site wins over the design

The boards are a visual reference, not a spec. **The site's rules and stylistic choices take precedence over the boards.**

- **Visual consistency with the pages already redesigned comes first.** Sub-navigation, drawers (width, header, footer, scrim, close behaviour), the row menu, segmented controls, pills, banners, the confirm modal, empty/loading/denied states, buttons and inputs must use the components and classes the site already has: `.ph`, `.pd-drawer`, `.pd-row-menu`, `.pd-status-pill`, `.pd-banner`, `.pd-confirm` / `.pd-confirm-modal`, `.pd-state`, `combo-select`, the Master Data sub-navigation, the Team toolbar. If a board shows a slightly different variant (spacing, radius, shadow, font size), **use the site's version**.
- **When a board and the site disagree on data, rules, permissions, API responses or flows, the site is right.** Keep the behaviour and apply only the look.
- **If a board (or part of one) needs new development, ignore it.** New development = a new endpoint, a new field in an API response, a change to the rules, or persistence that doesn't exist yet. List what you left out in the PR. Likely candidates are marked **⚠ only if available**.
- Sample names, numbers and dates in the boards are placeholders.

## 1. References

Captures in `docs/captures/attribute-lists/` (PNG, 1×); each file name starts with the board id. Sources: `AttributeLists.dc.html` (always with `nav="subnav"`) and `AttributeListsResponsive.dc.html`. Notes in `Section - Attribute Lists.dc.html`. **Only the boards below are the final direction (option A).** The other boards are explorations: ignore them, in particular the page tabs Lists / Topics and option B (callout + Topics drawer, 14ah–14aj).

| Board | File | State |
|---|---|---|
| 14a | `14a-list-selected.png` | Page: sub-navigation, Market selected, Active filter |
| 14c | `14c-no-lists.png` | No lists yet |
| 14d | `14d-new-list.png` | New list drawer |
| 14e | `14e-new-list-error.png` | New list, name already used |
| 14f | `14f-rename-list.png` | Rename list, slug locked |
| 14g | `14g-list-filter-all.png` | List with filter All (active + inactive) |
| 14h | `14h-item-menu.png` | Item ⋯ menu |
| 14i | `14i-deactivated-undo.png` | Deactivate feedback with Undo |
| 14j | `14j-new-item.png` | New item drawer |
| 14l | `14l-edit-item-duplicate.png` | Edit item, duplicate label |
| 14m | `14m-no-items-for-filter.png` | No items match the filter |
| 14n | `14n-topics-queue.png` | Proposed topics queue |
| 14o | `14o-topic-row-menu.png` | Topic ⋯ menu |
| 14p | `14p-after-approve.png` | After Approve: counter, progress, success banner |
| 14q | `14q-approved-used-in-0.png` | Approved topics, one with "Used in 0" |
| 14r | `14r-rejected.png` | Rejected topics with Restore |
| 14s | `14s-queue-empty.png` | Queue empty |
| 14t | `14t-no-approved.png` | No approved topics |
| 14u | `14u-new-topic.png` | New topic, with the explanation of its effect |
| 14v | `14v-rename-topic-error.png` | Rename topic, invalid name |
| 14w | `14w-merge-search.png` | Merge: target picker with search |
| 14y | `14y-merge-confirm.png` | Merge: irreversible confirmation |
| 14z | `14z-topic-action-error.png` | Error after a topic action |
| 14aa | `14aa-load-error.png` | Page load error |
| 14ab | `14ab-loading.png` | Loading |
| 14ac | `14ac-access-denied.png` | Access denied |
| 14ad | `14ad-1-tablet.png`, `14ad-2-smartphone.png` | Tablet 1024×768 and smartphone 390×844 |

## 2. Constraints

- Vue 3 and Bootstrap 5.3 from CDN. No build step.
- Shell unchanged: `pd-nav` sidebar, `#app-main`, `.ph` header with breadcrumb `Home › Attribute Lists`. Only the content below the header is redesigned.
- **No hex literals in the page.** Use `var(--token)` from `css/tokens.css`; the hex values below show the intent. Add a token only if none fits, and justify it in the PR. Every text/background pair ≥ 4.5:1. Remove `.slug-code` (`#9ca3af`) and the `badge-st-*` hex pills from `css/admin-crud.css` (the inactive one fails contrast); replace the Bootstrap `text-bg-warning` badge.
- All UI copy in English. Use the ellipsis character `…`.
- Icons: inline SVG, `stroke="currentColor"`, 14/16 px. No emoji (this includes the "🏷 Tags" label referenced in other pages — out of scope here, just don't add new ones).
- No `alert()` / `confirm()`. One modal idiom: the shared confirm.
- Layering: page < form drawer < confirm modal.

## 3. Page structure (14a)

- **The Bootstrap page tabs Lists / Topics are removed.** No tabs anywhere on the page.
- `.ph` header: title **Attribute Lists**, subtitle `Values to tag proposals and projects, and topics for experience profiles`. Primary button (magenta, plus icon) is contextual: **New list** when a list is selected, **New topic** when a topic state is selected.
- Body: **sub-navigation card on the left** (≈ 212 px, the same component as Master Data) + content on the right.
  - Group **ATTRIBUTE LISTS**: one entry per list, in API order, with the number of **active** items on the right.
  - Group **TOPICS**: **Proposed**, **Approved**, **Rejected**, each with its count. The Proposed count is a magenta badge (light pink background, dark magenta text — the Team counter) when > 0, plain muted text otherwise. It replaces the yellow badge on the old tab.
  - Selected entry: light grey background + 3 px magenta inset bar on the left, bold. Entries are focusable, Enter selects.
- The page opens on the **first list** (API order). The selection is not persisted and has no deep link (as today).
- When there are no lists, the Lists group is empty and the content shows the empty state (§9).

## 4. List content (14a, 14g, 14h, 14i, 14m)

Replaces the old Lists table **and** the old list detail page (no more "‹ All lists"). It's one white card:

- **Header**: eyebrow `ATTRIBUTE LIST`, list name (19 px bold), then the slug as a small monospace chip + `Slug · set at creation, never changes`. Below: `Offered as Tags in Cost Grid and Project config, and a dimension of experience profiles in Team.` (Team is a link to `team.html`). On the right, outline button **Rename** (pencil icon) → §6.
- **Toolbar**: status segmented control **Active {n} / Inactive {n} / All {n}** (same component as Team / User Admin; Active selected on open; it replaces the "Show inactive" checkbox). Search `Search values…` (client-side, counts follow the search). Magenta **New item** on the right → §6.
- **Table**: Label · Status · ⋯. Same table style as Team. Status uses `.pd-status-pill` (`active` green with dot, `inactive` grey with dot); inactive labels in muted text.
- **Row ⋯ menu** (`.pd-row-menu`, 14h):
  1. **Edit label** — `Tags already applied show the new label.`
  2. **Deactivate**, with a light navy `INSTEAD OF DELETE` tag — `No longer offered when tagging. Existing tags and profiles keep it.` On an inactive item it becomes **Activate** — `Offered again when tagging.`
- **Row in progress**: while Deactivate/Activate runs, the pill becomes a spinner + `Updating…`; the row's menu is disabled.
- **Feedback (14i)**: green section banner inside the card, above the table: `Deactivated "{label}". It's no longer offered when tagging. Existing tags stay.` with **Undo** (calls the opposite PATCH). Activate: `Activated "{label}". It's offered again when tagging.` + Undo.
- **Footnote** (info icon): `Items can't be deleted: they may already be tagged on proposals and projects. Deactivate a value to stop offering it when tagging; existing tags and experience profiles keep it.`
- **Empty filter (14m)**: `No items match the current filter.` + a line (`No {status} values contain "{q}".` or `There are no {status} values in this list.`) + outline **Show all items** (sets All and clears the search).

## 5. Topics content (14n–14t)

One white card per state selected in the sub-navigation.

- **Toolbar**: section title (`Proposed topics` / `Approved topics` / `Rejected topics`) on the left, search `Search topics…` on the right (client-side).
- **Proposed only — queue strip** (same component as the Unmatched names summary): `{n}` **to review**, a green progress bar `{r} of {t} reviewed this session` (`None reviewed yet this session` at 0), and on the right `Suggested by the agent from project and task descriptions. Proposed topics don't appear in experience profiles until you approve them.` The session counter is client-side only and resets on reload. Approve, Reject and Merge from the queue all count as reviewed.
- **Table**: Name · Used in (`{n} description(s)`) · actions. Proposed sorted by Used in desc, then name; the others by name.
- **Actions**:
  - Proposed: navy **Approve** button (check icon) always visible + ⋯.
  - Approved: ⋯ only.
  - Rejected: outline **Restore** (counter-clockwise arrow) only. Restore makes the topic approved (as today).
- **Topic ⋯ menu (14o)** — risk hierarchy made explicit:
  1. **Rename** — `Profiles show the new name at once.`
  2. **Reject**, light navy `REVERSIBLE` tag — `Hidden from profiles and never proposed again. You can restore it.`
  3. Divider, then **Merge into…** in red, red `IRREVERSIBLE` tag — `Its descriptions move to another topic; this one disappears.` → §7.
  The menu opens upwards on the last rows; Esc / click outside close it.
- **Row in progress**: spinner + `Approving…` in place of the buttons.
- **Feedback (14p)**: the row leaves the queue, the counter drops, the progress bar grows, and a green section banner appears: `Approved "{name}". It now shows in experience profiles in Team.` **No Undo** (the API has no un-approve; Reject + Restore would end in approved, not proposed).
  - Reject: `Rejected "{name}". It's hidden and won't be proposed again.` + link **View rejected** (selects Rejected).
  - Restore: `Restored "{name}". It's approved again and shows in experience profiles.`
  - Merge: `Merged "{source}" into "{target}". {n} description(s) now use "{target}".`
  - A new action replaces the previous banner.
- **Used in 0 (14q)**: on an approved topic with 0 descriptions, the count is amber and a line appears under the name: `Not linked to any description yet. The agent uses it on new or edited descriptions; to apply it to an existing project, run Process in Profile processing.` ("Process in Profile processing" links to `profile-jobs.html`).
- **Footnote** per state:
  - Proposed: `Approve keeps the agent's name. Rename first if the wording needs fixing; merge if the same competence already exists.`
  - Approved: `Approved topics appear in experience profiles in Team. Renames, rejections and merges show there immediately, without recalculation.`
  - Rejected: `Rejected topics are hidden from profiles and the agent never proposes them again. Restore makes a topic approved.`
- **Rejected (14r)** is a first-class state, no more native `<details>` at the bottom.

## 6. Form drawers (14d, 14e, 14f, 14j, 14l, 14u, 14v)

All forms use the **480 px drawer**, the same component as New resource (Team) and Invite user (User Admin). Header: eyebrow, title, sub, ×. Footer: outline **Cancel** + magenta primary with a white spinner while saving. Errors: red box at the top of the body with the server/validation message, and the field in red. On success the drawer closes and a green banner confirms.

| Form | Eyebrow / title | Sub | Body | Primary |
|---|---|---|---|---|
| New list (14d, 14e) | `ATTRIBUTE LISTS` / **New list** | `Create a set of values to tag proposals and projects. It also becomes a dimension of experience profiles.` | Name \*; a slug row showing the slug preview (client-side, from the name) with `Generated from the name when you create the list. It never changes, even if you rename the list later.` | **Create list** → selects the new list |
| Rename list (14f) | `ATTRIBUTE LIST` / **Rename list** | `Tags already applied keep working: they refer to the slug, not the name.` | Name \*; slug row, read-only: `Stays the same after renaming.` | **Save** |
| New item (14j) | `{list name}` / **New item** | `Offered as a tag in Cost Grid and Project config as soon as you add it.` | Label \* + hint `Must be unique in {list}, regardless of upper or lower case.` | **Add item** |
| Edit item (14l) | `{list name}` / **Edit item** | `Proposals and projects already tagged with this value show the new label.` | Label \* + same hint | **Save** |
| New topic (14u) | `TOPICS` / **New topic** | `Add a competence to the vocabulary the agent uses.` | Name \* `(a competence, 1–4 words, English)`; grey info box **It starts empty**: approved at once and added to the agent's vocabulary · doesn't classify anything retroactively, Used in stays 0 until the agent picks it · the agent only rereads new or edited descriptions; to apply it to a processed project, run Process in Profile processing; link **Open Profile processing →** | **Create topic** → selects Approved |
| Rename topic (14v) | `TOPIC · {status}` / **Rename topic** | `Profiles in Team show the new name immediately.` | Name \* with the same help; info box **Naming rules** (1–4 words ≤ 60 chars English · not a list name or an active value · if it exists, merge instead) | **Save** |

- Error copy examples: `A list called "Market" already exists. Pick another name, or rename the existing list.` · `"Italy" is already in Market. Labels are unique within a list, regardless of case.` · `Use 1–4 words and up to 60 characters. This name has 6 words.` Prefer the server message when it returns one.
- ⚠ only if available: client-side pre-validation of topic names is a nicety; the server stays the authority.

## 7. Merge (14w, 14y)

- **Drawer (14w)**, 480 px, eyebrow `TOPICS`, title **Merge topic**, sub `Use this when two topics describe the same competence.`
  - Source card: `TOPIC TO MERGE`, name, `Used in {n} description(s)`, status pill (proposed amber / approved green).
  - **Merge into \***: the existing `combo-select` (replaces the native `<select>`). Placeholder `Choose the topic to keep…`. Search inside the popover, groups **Approved** / **Proposed** (`(proposed)` suffix on the chosen value), `{n} descriptions` on the right of each option, keyboard hints at the bottom. For an approved source only approved targets are listed. Help under the field: `An approved topic can only merge into another approved topic, so the approval isn't lost.` / `You can merge into an approved or a proposed topic.`
  - Once a target is chosen, a grey **What happens** box: descriptions move (with the new total) · the source disappears from vocabulary and profiles · red **Can't be undone.** `To hide a topic without losing it, reject it instead.`
  - Footer: **Cancel** + **Merge…** in red (disabled grey until a target is chosen). ⚠ deviation: red instead of magenta to anticipate the irreversible step.
- **Confirm (14y)**: the shared `.pd-confirm` modal (same as Delete in Team). Title `Merge "{source}" into "{target}"?` + red `IRREVERSIBLE` tag; `This can't be undone. Profiles in Team update immediately.`; two boxes **Disappears** (source + `Proposed · removed from the queue` / `Approved · removed from profiles`) and **Moves to {target}** (`{n} descriptions move over`, `{total} in total`); a box `Just want it gone? Reject hides it and stops new proposals. You can restore it later.` with **Reject instead**; checkbox `I understand this can't be undone.` enables the red **Merge topics** (spinner while it runs). **Back** returns to the drawer.
- The new total is computed client-side from the two `used` counts. ⚠ only if available: if the merge response returns the real count, use it in the success banner.

## 8. Errors (14z, 14aa)

- Page load error: red global banner above the content `Couldn't load attribute lists. The server didn't respond. Your data is safe.` + **Try again**.
- Topic action error (14z): as today the list is reloaded first, then a red **section** banner in the topics card shows the server message, e.g. `Couldn't approve "{name}". The list was reloaded. Server: …`.
- Form errors stay inside the drawer (§6).

## 9. States without their own board / notes

- **No lists (14c)**: content card with tag icon, `No attribute lists yet.`, `A list is a set of values, like Market or Brand, used to tag proposals and projects.`, outline **Create the first list**, plus the "Values are offered as Tags…" footnote.
- **Queue empty (14s)**: green check, `No topics to review.`, `New proposals appear here after the agent processes new or edited project and task descriptions.` The Proposed count in the sub-navigation turns plain `0`.
- **No approved (14t)**: `No approved topics yet.`, `Approve proposals from the queue, or create a topic with New topic.`, outline **Review proposed ({n})**.
- **No rejected**: `No rejected topics.`, `Rejected topics are hidden from profiles and never proposed again.`
- **Search with no results**: `No topics match "{q}".` + **Clear search**.
- **Loading (14ab)**: sub-navigation hidden, one card with the centred spinner `Loading attribute lists…` (`.pd-state`).
- **Access denied (14ac)**: as in Team/User Admin: lock, **Admin access required**, `Attribute lists and topics are managed by admins and sysadmins. Ask an admin if you need access.`, **Go to app**.

## 10. Responsive (14ad)

- **Tablet 1024×768 (icon sidebar)**: the sub-navigation becomes a **horizontal row of chips** under the header (as Master Data on tablet): `LISTS` label, one chip per list with its count, `TOPICS` label, Proposed (magenta badge) / Approved / Rejected. Selected chip: white, border, magenta bottom bar. The row scrolls horizontally if it doesn't fit. Content as desktop with narrower columns; targets 40–44 px.
- **Smartphone 390×844 (top navbar)**:
  - Header `Attribute Lists` + 44 px magenta `+` (New list / New topic).
  - The sub-navigation becomes a **section picker** (48 px field `LIST · Brand ▾` / `TOPICS · Proposed 6 ▾`, as Master Data on smartphone) that opens a **bottom sheet** with the two groups and counts.
  - List: full-width Active / Inactive / All segmented, search + **New item**, items as rows with ⋯ (44 px). The slug and the no-delete note go under the list.
  - Topics: queue progress on one line, each topic is a card with name, `Used in …`, **Approve** (44 px) and ⋯.
  - The ⋯ menu becomes a **bottom sheet** with the same items and tags (Approve on top for proposed), Merge separated in red, **Cancel** at the bottom.
  - Form drawers and Merge go **full screen**; the confirm modal is full width with a 16 px inset. Every target ≥ 44 px.

## 11. Accessibility

- Sub-navigation: a `nav` with `aria-label="Attribute lists and topics"`; the selected entry has `aria-current="page"`.
- ⋯ button: `aria-haspopup="menu"`, `aria-expanded`; menu `role="menu"`; Esc closes and returns focus.
- Drawers and the confirm modal: focus trap, focus on the first field (forms) or on the title (confirm); focus returns on close. Esc closes the topmost layer only.
- Segmented controls are radio groups. The combo-select keeps its keyboard navigation.
- Banners: `role="status"` for success, `role="alert"` for errors. Row spinners `aria-live="polite"`.

## 12. Acceptance

- No page tabs; Master Data sub-navigation with lists and topic states, counts, magenta Proposed badge.
- List detail in the content area (no page swap, no "‹ All lists"); status segmented + search; ⋯ with Edit label / Deactivate; Undo after Deactivate/Activate; the no-delete footnote.
- Topics: Proposed queue with counter, session progress, Approve visible, success banner; Approved with the Used-in-0 hint; Rejected as a first-class state with Restore.
- Merge is red, tagged Irreversible, uses `combo-select` with search, and requires the shared confirm with checkbox and "Reject instead".
- Every form in the 480 px drawer with Cancel + primary, errors inside the drawer.
- No native `<select>` (merge) or `<details>` (rejected) left; no hex literals; new tokens justified in the PR.
- Every element left out because it needs new development (⚠) is listed in the PR.
