# Brief — master-pipelines.html: new year / new POT / edit target in the side drawer

**Scenario:** 2 — evolution of an existing feature (confirmed by the user, 2026-11-05).

## Current behavior

- **New pipeline year:** `+ Add year` (`master-pipelines.html:316`) → `openPyForm()` (`:1249-1255`) sets `pyf.show` and focuses `$refs.pyfInput`; the form is a `<tr class="mdp-new">` at the top of the list table (`:363-379`): one 4-digit input, hint "Created hidden…", Cancel / Create, Enter/Esc on the input. `createPipelineYear()` validates (2000–2100, not a duplicate) and shows errors in `pyf.error`. Pipeline years have no edit form: visibility is changed only through the row switch (`:385-390`).
- **New POT:** `+ New POT` (`:546`) → `openPotForm()` (`:1316-1336`, `potf.id = null`); `<tr class="mdp-new">` at the top of the POT table (`:562-589`): Individual client / Client group toggle, searchable `cg-select` of targets without a POT, EUR amount, group hint. The table is rendered even with no POTs while this form is open (`:549`).
- **Edit target:** row pencil (`:617`) → `openPotForm(pot)`; `<tr class="mdp-new">` **under the row** (`:628-651`): New target, required Reason for change, "Current €…", "Update target" disabled while the reason is empty.
- **From the POT details drawer** (`:784-882`): the head's "Edit target" → `editFromDrawer()` (`:1497-1500`) closes the drawer (`go({year})`) and opens the inline row; on phone the bottom bar → `openPotForm(drawerPot)` opens a **bottom sheet** (`:885-905`) over the drawer.
- **Esc** (`:1102-1106`) only acts while the details drawer is open: closes the edit first, then the drawer.
- **Save:** `savePot()` (`:1350-1389`) is shared by create and update and ends with `potf.show = false`.
- **Reference pattern:** `master-clients.html:610-650` — `.cg-drawer` for New client / New group, "modelled on master-pipelines.html's POT drawer", closes on ✕/Cancel/scrim/Esc, errors inside, pinned by `js/lib/master-data-guard.test.js`.
- **Boards:** `docs/superpowers/design/MD-Pipeline-Pots/10.4b-new-year-inline.jpg`, `10.4d-new-pot-inline.jpg`, `10.4e-edit-target.jpg` draw these forms inline — this change deliberately departs from them.

## Expected behavior

- `+ Add year` opens a right-hand drawer "New pipeline year" with the same field, hint, validation and errors; Create closes it; Cancel/✕/scrim/Esc close it without saving.
- `+ New POT` opens the right-hand drawer in "New POT" mode with the same fields and rules as today.
- The row pencil opens the drawer in "Edit target" mode (New target, required Reason, Current, Update target).
- **From the POT details drawer**, "Edit target" (head on desktop/tablet, bottom bar on phone) **switches the same drawer to form mode**, without closing it or changing the URL; Cancel and a successful save return to the details (details reloaded after the update). Esc in form mode → back to the details; Esc in details mode → closes the drawer (as today).
- No `<tr class="mdp-new">` is left in the two tables.
- Below 768px the drawer is full screen, like the details drawer.

## Constraints

- `savePot()`, `createPipelineYear()`, the `potf`/`pyf` state, the money rules (`readMoneyInput`/`formatMoneyInput`, `{ stored }`, `{ keepZero }`) and the input bindings pinned by `js/lib/master-pipelines-pot-input-guard.test.js` stay unchanged.
- Local CSS reuses the existing `.mdp-drawer`/`.mdp-scrim` (tokens only, no hex — `master-data-guard.test.js`).
- No server/API change; URLs (`parseMdpUrl`/`buildMdpUrl`) unchanged — the form drawer adds no URL state.
- Esc must not compete with an open modal (`confirmModal`), as in today's handler.
- English UI text.

## Acceptance criteria

1. `+ Add year` opens a drawer with the year input focused and preselected to the next year; Create with a valid year creates it Hidden and closes the drawer; a duplicate or out-of-range year shows the error inside the drawer, which stays open.
2. `+ New POT` opens the drawer in New POT mode; Create with target + amount adds the POT to the table and closes the drawer; the target is no longer offered.
3. The row pencil opens the drawer in Edit target mode; saving without a reason is refused with "Reason for change is required when updating a POT." and the drawer stays open; with a reason the amount is updated.
4. From POT details, "Edit target" shows the form in the same drawer; Cancel and Update return to the details; after Update the details and history show the new value; the URL stays `?year=Y&pot=<id>` throughout.
5. ✕, Cancel, scrim and Esc close the new-year / new-POT drawer without saving; Esc in Edit-from-details mode returns to the details.
6. No `class="mdp-new"` row remains in `master-pipelines.html`, and the phone bottom sheet (`.mdp-sheet`) is removed — pinned by a guard in `js/lib/master-data-guard.test.js`.
7. At 390px the form drawer is full screen with touch targets ≥ 44px.
8. `npm test` green; `TEST_CASES.md` MD-15 updated to the new flow.

## Explicitly excluded scope (confirmed by the user)

- a. An edit form for pipeline years (renaming, visibility in the drawer): visibility stays on the row switch.
- b. Moving Delete pipeline / Delete POT into the drawer: they stay where they are (⋯ menu, pencil row, details ⋯ menu).
- c. Changing fields, validations or texts of the forms beyond what moving them requires.
- d. Making the form drawer addressable by URL (e.g. `?year=Y&new=pot`).
- e. Extracting a drawer component shared with `master-clients.html` / `master-roles.html`.
- f. Updating the design boards (`10.4b/d/e`): the departure is recorded only in `docs/pages/config.md`.

## Open questions for /brainstorming

- Focus trap and focus returned to the trigger button on close (match master-clients, or more).
- Drawer width for the forms: the details drawer's 560px, or narrower.
- While a save is in progress (`loading`), are the scrim and Esc disabled?
