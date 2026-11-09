# attribute-lists.html

Generic tag/taxonomy admin console (admin or sysadmin). Its lists and items feed the "🏷 Tags" sections of `costgrid.html` and `project-config.html` through `js/tags.js`. Routes: [docs/api/attribute-lists.md](../api/attribute-lists.md).

## Header unification (2026-10-16)

Spec `docs/superpowers/specs/2026-10-16-header-unification-design.md`, report `docs/superpowers/reports/2026-10-16-header-unification-finish-cycle.md`. Each tab has its own `.ph` (the shared page head (`.ph-*`, [docs/css/stylesheets.md](../css/stylesheets.md) → `css/style.css`)), with the list count in `.ph-sub` and "+ New list" as `.ph-btn-primary`. The back link of a list's detail view uses the `chevron-left` icon instead of the "←" character. The page loads `js/lib/icons.js` and registers `<ph-icon>`.

## Redesign (2026-11-09)

Spec `docs/superpowers/specs/2026-11-09-attribute-lists-redesign-design.md`, plan `docs/superpowers/plans/2026-11-09-attribute-lists-redesign.md`, boards `docs/superpowers/design/attribute-lists/redesign/14*.png`. API unchanged; every call goes through the page's `request(method, url, body)` helper (`{ ok, status, data }`, never throws; error text is the server's `error`, else `Network error. Please try again.`).

### Current state

- **Structure.** One `.ph` (title, subtitle, contextual primary `New list` / `New topic`; a 44px `+` on a phone). Below it `.md-layout` with a Vue-rendered `<nav class="md-subnav" aria-label="Attribute lists and topics">` (Master Data markup with `button.md-subnav-item`, not `js/lib/md-subnav.js`): group *Attribute lists* (one entry per list, `active_item_count`) and group *Topics* (Proposed with a magenta badge when > 0, Approved, Rejected). Selection = `{ kind: 'list', id } | { kind: 'topics', status } | { kind: 'none' }`, opens on the first list, not persisted. `select()` clears searches, resets the item filter to Active, clears the card banner and closes any row menu. Tablet: the shared chip row, with the short group labels `LISTS` / `TOPICS`; phone: `.md-subnav-select` over a native `<select>` with two `<optgroup>`s.
- **A list.** `.al-card` with eyebrow, name, slug chip, a Team link and **Rename**; toolbar `.md-seg` radiogroup Active / Inactive / All (counts from `itemCounts` over the search), `Search values…`, **New item**; table Label · Status · ⋯. Row menu: Edit label, Deactivate (`INSTEAD OF DELETE`) / Activate. While the PATCH runs the pill is `Updating…` and ⋯ is disabled. Success banner with **Undo** (the opposite PATCH on the `listId`/`itemId` captured at the action, so a later selection never redirects it); `active_item_count` follows every change. Empty filter: `.pd-state` with `emptyItemsLine` and **Show all items**.
- **Topics.** One card per status with `Search topics…`. Proposed: strip with `{n} to review` and a `sessionProgress` bar (`reviewedThisSession`, client-only: Approve, Reject or a merge of a proposed topic). Proposed = **Approve** + ⋯, Approved = ⋯, Rejected = **Restore**. Menu: Rename, Reject (`REVERSIBLE`), divider, Merge into… (`IRREVERSIBLE`). An action reloads the topics whatever the outcome; an error shows `Couldn't {verb} "{name}". The list was reloaded. Server: …`. Approved with 0 descriptions: amber count and a line linking `profile-jobs.html`. Empty states per status, and **Clear search** / **Review proposed ({n})**.
- **Drawers.** `#listDrawer`, `#itemDrawer`, `#topicDrawer`, `#mergeDrawer` (Bootstrap offcanvas `.pd-drawer`); each focuses its field when shown (the merge drawer its title, so the combo list does not open by itself) and gives focus back to its opener. Errors stay in the drawer (server text). New list shows the slug `slugify` will produce (`—` when empty). Successes close the drawer and show a banner in the card.
- **Merge.** Target picked with the shared `combo-select` (`mergeTargetOptions`: approved, then proposed for a proposed source). **Merge…** (`btn-danger`) opens `#mergeConfirmModal` (`.pd-confirm-modal`) above the drawer: checkbox-gated **Merge topics**, **Reject instead**, **Back**. A refused merge stays in the confirmation and is not counted as reviewed; the success banner reads the target's `usage_count` after the reload.
- **States.** Loading (sub-nav hidden), access denied (lock, **Go to app**), load error (`.pd-banner--error` + **Try again**; the no-lists state is suppressed while it shows), no lists (**Create the first list**).
- **Stylesheet.** `css/attribute-lists.css` (`al-` rules), loaded after `admin-crud.css`. Guard: `js/lib/attribute-lists-page-guard.test.js`.

### Left out (spec §1.2)

Client-side merge totals, client pre-validation of topic names, the boards' error wording (the server's is shown), the phone bottom sheets (`.md-subnav-select` and the popover menu instead), the "{n} left to review" sentence, the empty table with headers of 14c.

### Accepted deviations from the boards

- The ⋯ trigger is the shared bordered `.pd-row-menu-trigger`, and the sub-nav keeps the shared width.
- At 1024px the sidebar and the column sub-nav stay (the chip row is the 768–1023px layout); at that width the list toolbar wraps **New item** onto a second line.
- The chosen merge target has no `(proposed)` suffix: `combo-select` shows the bare name.
- On a phone item rows show the label and ⋯ only; topic rows move "Used in" under the name.
- After **Back** from the merge confirmation the drawer's focus trap is not re-armed.

