# Brief — User Admin redesign (`admin.html`)

**Goal:** restyle the User Admin page so it's clearer and safer to use: a lighter actions column, a visible hierarchy of risk, explained missing actions, search/sort/filter counts, per-row feedback, a drawer for inviting users and in-app confirmations instead of `confirm()`.

**Scope: visual and interaction layer only.** The APIs (`GET /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/anonymize`, `POST /api/auth/invite`, `POST /api/auth/:id/resend-invite`) and the role rules **don't change**.

## 0. The site wins over the design

The boards are a visual reference, not a spec of behaviour. When a board and the current site disagree on **data, rules, permissions, API responses or flows**, the site is right. Keep the site's behaviour and apply only the look.

- Don't add API calls, fields or endpoints to support something a board shows. If data isn't available (e.g. the invite expiry), leave that element out and list it in the PR.
- The role rules in §3 describe what the site already does. If the code differs, the code wins: adapt the menu to it, don't change the rule.
- Sample names, dates and counts in the boards are placeholders.
- If something in this brief can't be built without new site logic, skip it and note it in the PR.

## 1. References

The captures are in `docs/superpowers/design/admin/redesign/` (PNG, 1×). Each file name starts with the board id. Source: `UserAdmin.dc.html` and `UserAdminResponsive.dc.html`. The notes are in `Section - User Admin.dc.html`.

| Board | State |
|---|---|
| 12a | Full table, sysadmin view: self, sysadmin, admin, pending (valid and expired), user, disabled, anonymized |
| 12b | Same table, admin view: sysadmin rows locked |
| 12c | A row while an action is running |
| 12d | ⋯ menu on a pending admin, sysadmin view |
| 12e | ⋯ menu on a pending admin, admin view (Grant sysadmin unavailable) |
| 12f | ⋯ menu on a disabled user (Anonymize available) |
| 12g | ⋯ menu on a sysadmin (Revoke sysadmin) |
| 12h / 12i / 12j | Invite drawer: empty / error / sent |
| 12k | Disable confirmation (modal) |
| 12l | Anonymize confirmation (modal) |
| 12m / 12n | Success banner / error banner |
| 12o / 12p / 12q | Loading / no results / access denied |
| 12r | Tablet 1024×768, smartphone 390×844 (list, actions sheet, invite) |

## 2. Constraints

- Vue 3 from CDN and Bootstrap 5.3 from CDN stay. No build step.
- Shell unchanged: sidebar + `#app-main` + the shared `.ph` header with breadcrumb `Home › User Admin`.
- **No hex literals in the page.** Use `var(--token)` from `css/tokens.css`. Remove the local badge colours from the page `<style>`. The hex values below show the intent: map each one to the nearest existing token. Add a token only if none fits, and say why in the PR.
- All UI copy in English. Use the ellipsis character `…`.
- Icons: inline SVG, `stroke="currentColor"`, 14/16 px. No emoji (remove ⬆ ⬇ ✉️ 🗑 from the current labels).
- No native `alert()` / `confirm()`.

## 3. Role rules (as the site applies them today)

- `user` < `admin` < `sysadmin`. Roles change **one step at a time**, in both directions.
- An admin can invite, toggle `user ↔ admin`, and disable, enable or anonymize users and admins. An admin can't touch sysadmins.
- Only a sysadmin can grant or revoke sysadmin.
- The signed-in user's row has no actions.
- Anonymize is available only for `disabled` users that aren't anonymized yet. Rows whose email starts with `anon_` are anonymized.

## 4. Page header and toolbar

- `.ph` header: title **Users**. Subtitle `{n} users · {p} pending invites` (drop the second part if `p = 0`). Primary button **Invite user** (magenta `--brand-magenta`, plus icon) opens the drawer (§8).
- The table sits in a white card (radius 12, 1 px `--border-light`), with this toolbar on top, left to right:
  1. **Status segmented control**: All / Active / Pending / Disabled, each followed by its count. The active segment is white with a light shadow and a magenta count. Counts follow the role filter and the search.
  2. **Role select**: `Role: All / User / Admin / Sysadmin`. Client-side filter.
  3. **Search** (240 px, right-aligned): `Search name or email…`. Client-side, case-insensitive, matches name or email.
- Same toolbar language as Master Data › Roles & rates.

## 5. Table

Columns: **Name** (name on top, email below in muted 11.5 px) · **Role** · **Status** · **Invited by** · **Joined** (`06 Nov 2026`) · actions (right-aligned).

- **Sorting**: Name, Role, Status and Joined headers can be clicked. The cycle is ascending → descending → API order. Show a faint ↕ when a column isn't sorted, and ↑/↓ in navy when it is. Role order is user < admin < sysadmin; status order is active < pending < disabled. Client-side.
- Row height ≥ 58 px. Avatar is a 30 px circle with initials.
- Footer: `Showing {n} of {total}` on the left. A rule hint on the right with a shield icon: sysadmin view `Roles change one step at a time: user → admin → sysadmin.`, admin view `Sysadmin accounts can only be changed by a sysadmin.`

**Badges** (22 px pill, 11.5 px semibold; text contrast ≥ 4.5:1):

| Badge | Background | Text | Note |
|---|---|---|---|
| user | `#EEF0F4` | `#374151` | neutral |
| admin | `#E3E8F6` | `#1E2F6B` | light navy |
| sysadmin | `--brand-navy` | white | with a 10 px shield icon |
| active | `#E7F5EC` | `#146C3A` | 6 px dot `#1F9D55` |
| pending | `#FFF1DC` | `#8A4B08` | dot `#D98A1C` |
| disabled | `#F0F1F4` | `#4B5563` | dot `#9AA0AC` |
| anonymized | transparent, 1 px **dashed** `#9AA0AC` | `#4B5563` | next to the status badge |

**Special rows**

- **Self**: 3 px magenta inset bar on the left, background `#FBFCFE`, navy avatar, a `YOU` chip next to the name. Actions cell: info icon + `Your account`, with tooltip `You can't change your own role or access. Ask another admin.`
- **Sysadmin row seen by an admin**: no menu. Lock icon + `Sysadmin only`, with tooltip `Only a sysadmin can change a sysadmin account.`
- **Anonymized**: name shown as *Anonymized user* in italic and muted, dashed avatar with "—". Actions cell: info icon + `No actions`, with tooltip `Personal data was removed. The account can't be restored.`
- **Pending**: under the badge, the link status in 11 px semibold: `Link expires in {h} h` (amber) or `Link expired {n} days ago` (red `#B42318`). **Only if the API already returns the invite date/expiry.** Otherwise show the badge alone.

Use the app tooltip (`#pd-tooltip` / the existing helper) where it exists. Otherwise use `title`.

## 6. Row actions

- **One visible button per row, only where there's a natural next step**: `Resend invite` on pending rows, `Enable` on disabled (not anonymized) rows. It's a 30 px outline button: white, 1 px border, navy text, navy border on hover.
- Every other action is in a **⋯ menu** (30 px square button). The menu is a 268 px popover with radius 10 and shadow `0 12px 32px rgba(11,24,64,.16)`, right-aligned under the button. It opens upwards on the last rows. A click outside or Esc closes it.
- Menu groups, top to bottom, with uppercase 10 px labels and dividers:
  1. **Role**: `Make admin` / `Make user`. Then `Grant sysadmin` / `Revoke sysadmin` with a navy `SENSITIVE` tag.
  2. **Access**: `Resend invite` (pending only), `Disable…` or `Enable`.
  3. **Data**: `Anonymize…`, the only red item (`#B42318`), with a red `IRREVERSIBLE` tag.
- Each item has an icon, a label and a one-line description in 11 px muted text, e.g. `Blocks sign-in. You can re-enable later.`
- **Unavailable items stay visible**, greyed out (`#9AA0AC`, `cursor: not-allowed`), with the reason in place of the description:
  - Make user on a sysadmin: `Revoke sysadmin first: roles change one step at a time.`
  - Grant sysadmin on a user (sysadmin view): `Make admin first: roles change one step at a time.`
  - Grant sysadmin on an admin (admin view): `Only a sysadmin can grant this role.`
  - Anonymize on an account that isn't disabled: `Disable the account first.`
- Items are computed from the rules the site already enforces (§0, §3). Don't add an item the site doesn't support.

## 7. Feedback

- **Row in progress** (12c): while a request for a row is running, replace its actions with a 14 px magenta spinner + `Updating…` (`Sending…` for resend). The row is at 70% opacity. Other rows stay usable.
- **Banner** (12m / 12n): above the card, full width, radius 10. Success: background `#F3FAF5`, border `#CDE9D6`, text `#146C3A`, check icon. Error: background `#FDEFF0`, border `#F5C7CB`, text `#B42318`, alert icon. It has a bold title followed by text, and a close button. As today, each new action clears the previous banner.
  - e.g. `Invite resent.` `A new activation link was sent to {email}. It's valid for 48 hours.`
  - e.g. `Couldn't update {name}.` followed by the server message, or `The server didn't respond. Check your connection and try again.`
- Keep the site's existing success and error messages where they exist. These are the defaults.

## 8. Invite drawer (12h–12j)

**Change from the current page:** the "Invite user" modal becomes a **right-side drawer**, like the Master Data editing panel. The drawer contains **only the invite form**: no user details, no other actions.

- 480 px wide, full height, white, shadow `-12px 0 32px rgba(11,24,64,.18)`, scrim `rgba(11,24,64,.28)`. A click on the scrim or Esc closes it. Use Bootstrap `offcanvas-end` if it fits.
- Header: eyebrow `USER ADMIN`, title **Invite user** (19 px bold), sub `They'll get an email with an activation link, valid for 48 hours.`, close ×.
- Body, scrollable: First name and Last name side by side, then Email. **Role** is two radio cards:
  - **User**: `Works on pipeline, portfolio and planning`
  - **Admin**: `Also manages users and master data`
  - The selected card has a navy border and a `#F7F8FC` background. Help text below: `Sysadmin can't be assigned with an invite. Promote an admin once they're active.`
- Footer (sticky): `Cancel` (text) and **Send invite** (magenta). The button is muted until the required fields are valid, and shows a white spinner + `Sending…` while the request runs (as today).
- **Error** (12i): red box at the top of the body with the server message, and the related field in red. The form stays editable.
- **Sent** (12j): the form is replaced by a green confirmation panel: `Invite sent to {email}` plus `{name} appears in the list as pending until they activate the account. You can resend the invite from their row.` The footer becomes `Invite another` (resets the form and keeps the drawer open) and **Close**. Closing resets the form, as today. The list refreshes the way the site already refreshes it.

## 9. Confirmations (modals, 12k–12l)

Disable and Anonymize **stay centred modals** (460 px, radius 12, scrim `rgba(11,24,64,.42)`). Use a Bootstrap modal. Esc and Cancel close it.

- **Disable** (12k): grey icon circle with a power icon, title `Disable {name}?`, text `They're signed out and can't sign in until an admin enables the account again.` Two info boxes: **Stops** (`Sign-in and active sessions`, …) and **Stays as it is** (`Role ({role})`, `All data they created`). The primary button **Disable user** is navy, because the action is reversible. Show only consequences that the site really applies.
- **Anonymize** (12l): red icon circle with a trash icon, title `Anonymize {name}?`, red `IRREVERSIBLE` tag. Text: `Their name and email are replaced with anonymous values. The account stays disabled and can't be restored.` Two boxes: **Removed for good** (name, email) and **Kept** (`Proposals and projects`, `Cost grids they created`). A checkbox `I understand this can't be undone.` enables the red **Anonymize user** button (`#B42318`). This replaces the current `confirm()`.
- Enable, role changes and Resend invite run without confirmation, as today.

## 10. Page states

- **Loading** (12o): toolbar visible, with counts hidden. A 28 px magenta spinner + `Loading users…` in the card body. Subtitle `Loading…`.
- **No results** (12p): search icon, `No users match the selected filter.`, a line describing the active filters, and an outline **Clear filters** button that resets status, role and search.
- **Access denied** (12q): no page header or toolbar. A centred card with a lock icon, **Admin access required**, `User management is available to admins and sysadmins. Ask an admin if you need access.` and a navy **Go to app** button (same target as today).

## 11. Responsive (12r)

- **Tablet (1024×768, icon sidebar):** same card. The columns become Name · Role · Status · actions. Under the email, a third line in 10.5 px shows `Joined {date} · by {name}`. Toolbar on one row: segmented, role, search (flexible). Buttons and the ⋯ button are 40 px.
- **Smartphone (≤ 767 px, top navbar):**
  - Header: `Users` + a short subtitle, a magenta `+ Invite` button (44 px).
  - Search at full width (44 px). Status filters become scrollable pills with counts.
  - Each user is a card: name (+ `YOU`), email, role and status badges, pending expiry. A ⋯ button (44 px) sits top-right. `Resend invite` / `Enable` is a full-width 44 px button at the bottom of the card. Self and anonymized cards show their note instead of buttons.
  - ⋯ opens a **bottom sheet** with the same groups and rules as the desktop menu, plus `Cancel`. Items are ≥ 48 px tall.
  - The Invite drawer becomes **full screen**: header with × and fields stacked in one column (44 px). The role cards are stacked, and the footer is sticky with `Cancel` and `Send invite` (44 px).
  - The confirmation modals use the full width with a 16 px inset. Their buttons are 44 px.

## 12. Accessibility

- ⋯ button: `aria-haspopup="menu"`, `aria-expanded`. The menu uses `role="menu"` with `menuitem`s, and unavailable items get `aria-disabled="true"`, with the reason readable by screen readers. Arrow keys move through items, Esc closes the menu and returns focus to the button.
- Drawer and modals: focus trap, focus on the first field (drawer) or on Cancel (Anonymize modal). Return focus on close.
- Banners: `role="status"` for success, `role="alert"` for errors. The row spinner area uses `aria-live="polite"`.
- Sortable headers are buttons with `aria-sort`.

## 13. Acceptance

- No more than one text button per row. Everything else sits in the ⋯ menu, grouped Role / Access / Data, and Anonymize is the only red item.
- Unavailable actions show their reason. Self, locked-sysadmin and anonymized rows show a note with a tooltip.
- Status filters show counts. Role filter, search and column sort work client-side.
- Invite opens in a right drawer that contains only the form. Error and sent states are handled inside the drawer.
- Disable and Anonymize use in-app modals. Anonymize needs the checkbox. No `confirm()` is left.
- Per-row spinner while a request runs.
- No hex literals in the page. Any new tokens are justified in the PR.
- Any element left out because the site can't drive it (e.g. invite expiry) is listed in the PR.
