# Brief — Save overlay: a blocking "Saving changes…" layer while a write request is slow

**Scenario:** 1 — new feature (confirmed by the user, 2026-11-05).

**Design input:** `docs/superpowers/design/Overlay/2026-11-04-brief-submit-overlay-claude-code.md` (the design brief) and boards `1a-saving.jpg` … `1f-mobile-couldnt-save.jpg` in the same folder. **User rule:** the design brief and boards apply only where they require no callbacks or other complex code; where they do, that part is out of scope (see "Explicitly excluded scope").

Notes on the design brief: it cites `SubmitOverlay.dc.html` and `docs/captures/submit-overlay/`, neither of which is in the repo — the JPGs in `docs/superpowers/design/Overlay/` and the values written in the design brief are the reference.

## Expected behavior

- When a write request (`POST`/`PUT`/`PATCH`/`DELETE`) sent through `apiFetch` (`js/api.js:9`) is still pending after a short delay, a full-page overlay appears in the **Saving** state of board 1a: navy scrim, 3px indeterminate magenta progress bar at the top edge, centred white panel with a magenta spinner, title "Saving changes…", message "Please don't close this page."
- A write that settles before the delay shows nothing.
- The overlay stays visible while at least one such write is pending, and disappears when the last one settles — on success, on error, on the 30s `apiFetch` timeout, and on the 401 redirect.
- While visible, nothing behind it can be clicked or reached with Tab: sidebar/navbar, page content, open Bootstrap modals and drawers. Body scroll is locked.
- Writes marked as background do not trigger it: the cost grid editor's debounced autosave (`cgAutoSave` → `_cgUpsertVersionToApi`, `js/costgrid.js:723`), the background project pushes of `js/api-sync.js`, and the notification "mark read" calls (`js/notifications.js:129`, `:150`). An explicit Save that goes through `api-sync.js` (`project-config.html`'s `onSave` → `_pushProjectToApiDetailed`) does trigger it.
- Errors are shown exactly as today, by each page; the overlay only disappears.
- Tablet (board 1e): same as desktop, the overlay covers the icon sidebar. Smartphone ≤ 767px: the panel is anchored to the bottom of the viewport with a 16px inset, like board 1f's layout, in the Saving state.
- Reduced motion: no fade, no progress bar, static spinner.

## Pages that get it

Automatically, through `apiFetch`: `master-clients.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html`, `project-config.html`, `costgrid.html`, `pipeline.html`, `timesheets.html`, and the shared modals of `js/nav.js` (change password, My Profile, Send Notification).

## Constraints

- One overlay element, injected once by `js/nav.js` outside every Vue root and outside `#app-shell`'s children; component API as in the design brief §9, reduced to `PdOverlay.show()` / `PdOverlay.hide()` (Saving state only, optional title/message).
- `#app-shell`/`#app-main` must not get `overflow`, `transform`, `filter`, `contain`, `will-change` or `position` (`js/lib/nav-shell-guard.test.js`); the scroll lock goes on `body`.
- Values from the design brief that have no token are added to `css/tokens.css` once (z-index of the layer, spinner track `#FBD3E3`, scrim, panel shadow); no hex literals in pages or `style.css`; text-on-background pairs stay ≥ 4.5:1 (`js/lib/tokens.test.js`).
- Existing per-page guards (`saving`, `loading`, `busy`, … flags) and in-button spinners stay as they are.
- Cache-busting: every `?v=N` reference to `js/api.js`, `js/nav.js`, `css/style.css`, `css/tokens.css` (and any other edited versioned file) is bumped together; the guard tests that pin their agreement stay green.
- No API/server change. English UI text, ellipsis character `…`.

## Acceptance criteria

1. With the network throttled (DevTools "Slow 3G" or equivalent), Save on each page listed under "Pages that get it" shows the overlay of board 1a; it disappears when the save completes.
2. With a fast response, the same Save shows no overlay (no flash).
3. While the overlay is visible, clicking a sidebar link, a page button or a button of an open modal does nothing, and Tab does not move focus to any element behind the overlay.
4. A failing save (e.g. a `MONEY_RULE` 400 or the server stopped) hides the overlay and shows the page's existing error, unchanged.
5. Typing in the cost grid editor with a throttled network never shows the overlay (autosave is background); clicking a notification never shows it.
6. `project-config.html`'s Save with a throttled network shows the overlay.
7. At 1024×768 the overlay covers the icon sidebar (board 1e); at 390×844 the panel is bottom-anchored with a 16px inset (board 1f layout).
8. With `prefers-reduced-motion: reduce`: no fade, no progress bar, static spinner.
9. A vitest test pins: show after the delay, no show before it, hide when the pending count returns to zero including on rejection, background writes excluded, GET never counted.
10. No hex literal added outside `css/tokens.css`; `npm test` green; `TEST_CASES.md` gains a manual case for the overlay.
11. `docs/BACKLOG.md` gains an entry: the pages that bypass `apiFetch` with a direct `fetch` (`admin.html`, `team.html`, `attribute-lists.html`, `profile-jobs.html`, `terms.html`, `js/tags.js`) move to `apiFetch` in their redesign cycle, and get the overlay there.

## Explicitly excluded scope (confirmed by the user, 2026-11-05)

- a. **Optional states of the design brief** — *Still saving* (1b, needs a second timer), *Changes saved* (1c, needs a success hold/auto-hide timer and a per-page entity name), *Couldn't save* (1d, needs retry handling for "Try again" and would duplicate each page's error UI). Excluded under the user rule; boards 1b/1c/1d and the error layout of 1f are not implemented.
- b. **`aria-busy="true"` on the submitted form** (design brief §4): `apiFetch` does not know which form sent the request, so it needs per-page code.
- c. **Pages that use a direct `fetch`** (`admin.html`, `team.html`, `attribute-lists.html`, `profile-jobs.html`, `terms.html`, `js/tags.js`): deferred to their redesign (criterion 11).
- d. **`_db-reset.html`, `_terms-editor.html`**: not considered.
- e. **Public pages without `nav.js`** (`login.html`, `activate.html`, `reset-password.html`): they keep their in-button spinner.
- f. **`planning.html`'s `POST /api/planning/model` and Team assistant calls**: reads sent as `POST` through a direct `fetch`, with their own loading UI.
- g. Changing or removing the existing per-page guards and in-button spinners.

## Open questions for /brainstorming

- Trigger model: automatic in `apiFetch` with a background opt-out (recommended in chat), or an explicit opt-in per Save as in the design brief §9 — the opt-out risks an unmarked background write blocking the editor, the opt-in touches every save handler.
- How a background write is marked: an option on `apiFetch` (`{ background: true }`) threaded through the `Api.*` wrappers that need it, or a scoped flag around the call.
- The delay before the overlay appears (≈300–400ms suggested) — the only timer the cycle adds, and it lives in the trigger, not in the component.
- z-index of the layer: the design brief asks for 1080 as a new token, which ties with Bootstrap's tooltip (1080) — keep 1080 or go above it.
- Making the page behind inert: `inert` on `#app-shell` does not cover the Bootstrap modals appended to `<body>`; which elements get `inert`.
- Whether a modal's own submit (e.g. project-config's new client modal) should show the overlay above the modal or not.
