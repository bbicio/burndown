# Brief — Fix "Export XLS" `ExcelJS is not defined` Bug

**Scenario:** Audit → fix (Scenario 3 per `docs/superpowers/PROCESS.md` §2). Source: `docs/superpowers/reports/2026-07-27-vue-migration-roadmap-cold-review.md`, "Cycle D" (Export XLS item). Second of the two-Brief split confirmed for Cycle D — the first (phasing-panel rounding) is already merged, unrelated root cause.

## Problem

No page in the repo loads the `ExcelJS` library, yet two independent export functions are written entirely against its API (rich cell styling via `fill`/`argb`, `font`, `border` — not achievable with the CDN library that actually *is* loaded, `xlsx@0.18.5`/SheetJS, whose free build has no write-side cell-styling support). Confirmed via `git blame`/investigation during this Brief's drafting predecessor (the `pipeline-version-management` cycle) that this predates the Vue migration roadmap — not a regression it introduced.

- **`planning.html`**: `buildStyledExcelExport({ exportRows, periodMeta, nameCount, sheetName, filename })` (`planning.html:1290-1330+`) calls `new ExcelJS.Workbook()` (line 1292) directly, with no existence guard — throws `ReferenceError: ExcelJS is not defined` immediately when any of its 3 callers (Resource Planning / By Project / By Owner export buttons, lines 1279/1282/1285) is invoked.
- **`js/costgrid.js`**: `cgExportXls()` (lines 1251-1259+), reachable only from `costgrid.html`'s toolbar (`costgrid.html:953`, `exportXls() { cgExportXls(); }` — confirmed via repo-wide grep that `pipeline.html` never wires this up, so it's unreachable there), has a guard (`if (typeof ExcelJS === 'undefined') { alert('ExcelJS is not available.'); return; }`, line 1256) that prevents the crash but still leaves the export completely non-functional — a native `alert()` telling the user the feature doesn't work, not a working export.

Both functions were clearly written assuming `ExcelJS` would be loaded via CDN, matching this project's existing pattern for other third-party libraries (Bootstrap, the currently-unused `xlsx`, Vue — all loaded via `<script src="https://cdn.jsdelivr.net/...">` tags). No such tag for ExcelJS was ever added to any page.

## Current behavior

- On `planning.html`: clicking any of the 3 "Export XLS" buttons (Resource Planning, By Project, By Owner grouping views) throws an uncaught `ReferenceError`, visible only in the browser console — no user-facing feedback at all.
- On `costgrid.html`: clicking "Export XLS" in the editor toolbar shows a native browser `alert('ExcelJS is not available.')` — functional but not a working export, and uses a native `alert()` (a pattern this project's Vue-migration convention otherwise avoids in favor of `showConfirm()`).

## Expected behavior

- Add the ExcelJS library via CDN `<script>` tag to both `costgrid.html` and `planning.html` (the two pages whose reachable code paths need it), matching this project's existing CDN-script convention — inserted alongside the existing `xlsx@0.18.5` tag, same pattern (`https://cdn.jsdelivr.net/npm/exceljs@<version>/dist/exceljs.min.js`).
- Once loaded, both `cgExportXls()` and `buildStyledExcelExport()` should work end-to-end — producing a downloaded, correctly-styled `.xlsx` file — with no code change needed to either function's own logic (their existing `ExcelJS.Workbook()`/styling calls should simply start working once the library is present).
- `cgExportXls()`'s now-unreachable `if (typeof ExcelJS === 'undefined')` guard and its `alert(...)` can remain as a defensive fallback (harmless once the library is reliably loaded) — this Brief does not require removing it, only making the library actually available so the guard's `alert` branch is never hit in normal use.

## Constraints

- Only add the CDN `<script>` tag — do not modify `cgExportXls()`'s or `buildStyledExcelExport()`'s own logic; both were already written correctly against the real `ExcelJS` API and should work unmodified once the library loads.
- Do not add the `ExcelJS` script tag to `pipeline.html` — confirmed via repo-wide grep that no reachable code path on that page calls either export function, so it doesn't need the dependency.
- Do not remove or touch the existing, separately-confirmed-unused `xlsx@0.18.5` CDN tag on either page — that is a distinct finding (dead weight, unrelated to this bug) explicitly out of scope for this Brief; removing a loaded library requires its own careful verification pass, not bundled into an "add a library" fix.
- Match the exact CDN pattern already used for other libraries on these pages (`https://cdn.jsdelivr.net/npm/<package>@<version>/dist/<file>`) — pick a current, stable ExcelJS release (verify the exact jsdelivr path/filename works before finalizing the plan, since ExcelJS's package structure/UMD bundle naming should be confirmed, not assumed).
- No native `alert()`/`confirm()` introduced or expanded — this Brief doesn't touch error-handling flow, only the missing dependency.

## Acceptance criteria

- [ ] Clicking "Export XLS" in `costgrid.html`'s editor toolbar downloads a correctly-formatted, styled `.xlsx` file — no `alert()`, no error.
- [ ] Clicking each of the 3 export buttons on `planning.html` (Resource Planning, By Project, By Owner) downloads a correctly-formatted, styled `.xlsx` file — no `ReferenceError`, no console error.
- [ ] `pipeline.html` is unmodified (no new script tag added there).
- [ ] `npm test` passes with no regressions.
- [ ] Manual smoke check: open the downloaded `.xlsx` files from both pages in a spreadsheet application (or inspect via a quick script) and confirm the expected styling (colors, borders, fonts) is actually present — not just that the file downloads without erroring.

## Explicitly excluded scope

- Removing the unused `xlsx@0.18.5` CDN tag from either page — a separate, distinct finding (confirmed dead weight, unrelated root cause), candidate for its own future cleanup cycle if ever prioritized.
- Any change to `cgExportXls()`'s or `buildStyledExcelExport()`'s internal logic beyond what's needed to make the library available.
- Adding ExcelJS to `pipeline.html` or any other page — confirmed not needed.
- Every other item from the cold-review's backlog (the FOUC/`v-cloak` finding, the two Cycle B2 follow-ups) — separate Briefs.

## Required reminder (new-findings guard)

Any new finding discovered during this cycle's `/brainstorming` or execution — an issue with the chosen ExcelJS CDN version, an unrelated bug noticed in either export function while verifying the fix, or anything else — must be isolated and proposed as its own future Brief, never folded into this cycle's fix.

---

Brief ready. Next step: /brainstorming.
