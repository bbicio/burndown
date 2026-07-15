# `_db-reset.html` Vue 3 Migration — Brief

**Scenario:** 2 (evolution of an existing page).

**Source:** Tier 1, page 2 of `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`. Follows the same migration pattern validated by `terms.html` (`docs/superpowers/specs/2026-07-14-terms-vue-migration-design.md`, `docs/superpowers/plans/2026-07-14-terms-vue-migration.md`).

---

## Current behavior

Read in full from `_db-reset.html` (366 lines, no build step, self-contained inline `<script>`):

- **No navbar / no `initNav()`** — standalone page, unlike most other pages (`_db-reset.html:1-33`).
- **Auth check (IIFE, `_db-reset.html:162-180`):** `GET /api/auth/me` on load. 401 → redirect to `/login.html`. Non-admin → replaces `#resetCards`'s innerHTML with an access-denied alert, stops. Admin → reveals the two admin-only cards (single-proposal delete, change-owner) and calls `loadActiveUsersIntoOwnerSelect()`. Network/parse error → shows a `#authBanner` warning, `"Could not verify permissions."`.
- **7 scope-delete cards** (`data-scope` attr: `proposals`, `projects`, `clients`, `ratecards`, `actuals`, `pipelines`, `notifications`), each a static card with a label, description, and danger button (`_db-reset.html:44-86`).
- **Shared confirm modal** (`_db-reset.html:120-142`, Bootstrap): any scope button click sets `_pendingScope`, populates `#confirmText` from `SCOPE_LABELS`, resets the `DELETE`-confirmation input, opens the modal. The modal's confirm button (`#confirmOk`) stays disabled until the input's trimmed value is exactly `DELETE` (`_db-reset.html:183-197`).
- **Two separate `click` listeners are both registered on `#confirmOk`:**
  - Listener 1 (`_db-reset.html:200-241`): guarded by `_pendingScope` — no-ops (early return) if unset. On confirm: `POST /api/admin/reset/:scope`, hides modal, alerts on error, else gives 3-second inline button feedback (`✓ Done`, green, disabled, auto-reverts).
  - Listener 2 (`_db-reset.html:267-303`): guarded by `_pendingCgId` — no-ops if unset. On confirm: `POST /api/admin/reset/cost-grid/:cgId`, hides modal, writes a persistent (non-reverting) success/error message into `#cgDeleteMsg`.
  - Both listeners fire on every `#confirmOk` click; only the one whose pending-state guard matches does real work. A dead variable `_origConfirmHandler` is assigned (`_db-reset.html:266`) but never read.
- **Modal `hidden.bs.modal` handler** (`_db-reset.html:243-248`): resets `_pendingScope`, `_pendingCgId`, the input, and re-disables `#confirmOk`.
- **Delete single proposal card** (`_db-reset.html:90-99`): UUID input + button. Click sets `_pendingCgId`, populates `#confirmText`, opens the same shared modal.
- **Change proposal owner card** (`_db-reset.html:101-113`): UUID input + `<select>` (populated from `GET /api/users/active-list`, formatted `firstName lastName (email)`, HTML-escaped via a local `esc()` helper) + button. Click validates both fields are filled (inline error if not), else `PATCH /api/admin/reset/cost-grid/:cgId/owner` with `{ ownerId }`, writes a persistent success/error message into `#cgOwnerMsg`. Does **not** use the confirm modal.
- **`#cgDeleteSection`/`#cgDeleteCard`/`#cgOwnerCard` are `display:none` until the admin check passes** (`_db-reset.html:88,90,101`, revealed at `172-174`).
- Confirmed via `<script src>` tags: no dependency on `js/roles.js`/`js/clients.js`/`js/programs.js`/`js/ratecards.js` — isolated per the roadmap's Tier 1 classification.

---

## Expected behavior

1. **Rewrite as a Vue 3 app** (CDN, `Vue.createApp({...}).mount(...)`, no build step, no SFCs) — same pattern as `terms.html`. No new `js/*.js` file; logic stays inline in `_db-reset.html`.
2. **1:1 functional port of every reset/owner-change/auth-check behavior above** — same API calls, same request payloads, same success/error/redirect outcomes on every branch. This explicitly includes preserving the two-separate-listeners-both-fire-with-early-return quirk and the unused `_origConfirmHandler` variable as-is — not cleanup targets for this cycle.
3. **Add `initNav()`/navbar** — this page currently has none; add the standard navbar + footer injection used by other authenticated pages (`js/core.js`, `js/api.js`, `js/api-sync.js`, `js/nav.js`, `js/notifications.js`, `js/settings.js`, then `initNav(...)`, per `CLAUDE.md`'s "All authenticated pages must load..." convention). This is the one deliberate behavior *addition* in this cycle, layered on top of the otherwise-1:1 port.
   - Open question for `/brainstorming`: does adding `initNav()` change or duplicate the existing inline `GET /api/auth/me` admin-gate check? `initNav()` itself calls `GET /api/auth/me` and redirects on 401, but does not enforce admin-only — the page's own role check must still run separately.
   - Open question: what `activeTab` value (if any) should be passed to `initNav()`, given `_db-reset.html` is a hidden page not represented in the navbar's tab set?

---

## Constraints

- Vue 3 via CDN only — no build step, no bundler (per the roadmap Brief).
- No change to any of the 5 API endpoints used (`/api/auth/me`, `/api/admin/reset/:scope`, `/api/admin/reset/cost-grid/:cgId`, `/api/admin/reset/cost-grid/:cgId/owner`, `/api/users/active-list`) — same requests, same payloads, same credentials mode.
- Page stays admin-only and hidden (not linked from nav) — adding `initNav()` must not add a visible nav-tab entry for this page.
- `pdash-nginx` serves the main checkout's working directory only — new behavior is not visible in a browser until after merge, same constraint `terms.html`'s plan documented. Manual verification is a post-merge step.

---

## Acceptance criteria

- [ ] `_db-reset.html` is rewritten as a Vue 3 app (`Vue.createApp(...).mount(...)`), no build step, no new `js/*.js` file.
- [ ] All 7 scope-delete buttons behave identically to today: same `SCOPE_LABELS` text in the confirm modal, same `DELETE`-to-confirm gating, same `POST /api/admin/reset/:scope` call, same 3-second auto-reverting button feedback on success, same `alert()` on error.
- [ ] Single-proposal delete (UUID input) behaves identically: same modal text, same `POST /api/admin/reset/cost-grid/:cgId` call, same persistent (non-reverting) success/error message.
- [ ] Change-owner flow behaves identically: same validation (both fields required), same `PATCH .../owner` call and payload, same persistent success/error message, same `<select>` population/escaping behavior from `GET /api/users/active-list`.
- [ ] Auth gate behaves identically: 401 → `/login.html`; non-admin → access-denied alert replacing the cards; admin → cards revealed + owner-select populated; fetch failure → `#authBanner` warning.
- [ ] The two-separate-`confirmOk`-listeners quirk and the unused `_origConfirmHandler` variable are preserved as-is (or, if `/brainstorming` decides otherwise, that decision is made explicitly, not incidentally).
- [ ] `initNav()`/navbar is added and renders correctly on this page without introducing a visible nav-tab entry, without breaking the existing standalone admin-gate check, and without colliding with `initNav()`'s own `GET /api/auth/me` call.
- [ ] Manual browser verification (post-merge, matching `terms.html`'s Task 2 pattern) confirms all of the above.

---

## Explicitly excluded scope

- Fixing the duplicate-`confirmOk`-listener quirk or removing `_origConfirmHandler` — preserved as-is per Expected behavior #2.
- Any change to the 5 backend API endpoints this page calls.
- Migrating any other Tier 1/Tier 2 page.
- Any build-step introduction (Vite/SFC).
- Un-hiding this page from navigation (it stays a hidden, unlinked admin URL).

---

## Open questions for `/brainstorming`

1. How does adding `initNav()` interact with the existing inline admin-only gate — run both checks, or refactor the inline check to reuse something `initNav()` already exposes (e.g. the returned user object's `role`)?
2. What (if anything) should `initNav()`'s `activeTab` argument be for a hidden, unlinked page?
3. Should the navbar's account dropdown / notifications / settings modals actually be wired up here, or does `initNav()` unconditionally inject them regardless of page purpose (i.e., is there any choice to make, or is this fully mechanical)?

Brief ready. Next step: /brainstorming.

