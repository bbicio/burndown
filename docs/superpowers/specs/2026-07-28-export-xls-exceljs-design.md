# Fix Export XLS `ExcelJS is not defined` Bug — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-28-export-xls-exceljs-brief.md`. Second of the two-Brief split for the cold-review's Cycle D ("Export XLS" item) — the first (phasing-panel rounding) is already merged, unrelated root cause.

## Problem

No page in the repo loads the `ExcelJS` library, yet two independent export functions (`cgExportXls()` in `js/costgrid.js`, reachable from `costgrid.html`; `buildStyledExcelExport()` in `planning.html`) are written entirely against its API. `planning.html`'s export throws an uncaught `ReferenceError`; `costgrid.html`'s has a defensive guard that shows a native `alert()` instead of crashing, but is equally non-functional.

## Architecture

No architectural change — add one CDN `<script>` tag to each of the two affected pages. No code logic changes to either export function; both already assume `ExcelJS` will be present.

## Components

### `costgrid.html`

Add, immediately after the existing `xlsx@0.18.5` CDN tag (matching the codebase's established third-party-library loading convention):

```html
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
```

### `planning.html`

Same addition, in the same relative position (immediately after its own `xlsx@0.18.5` tag).

**Version/path verified** (during `/brainstorming`, via a live CDN directory listing fetch): `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js` exists and is jsDelivr's minified, browser-ready UMD bundle for ExcelJS 4.4.0 — the version pinned in this design.

No changes to `cgExportXls()` (`js/costgrid.js:1251-1259+`) or `buildStyledExcelExport()` (`planning.html:1290-1330+`) — both already call the real `ExcelJS.Workbook()`/styling API correctly; they will simply start working once the library loads. `cgExportXls()`'s existing `if (typeof ExcelJS === 'undefined') { alert(...); return; }` guard stays as-is, now unreachable in normal use but harmless as a defensive fallback.

## Data flow

No change. Both export functions already read from their respective pages' existing in-memory data (`_cgDraft`/`cgLoad()` for `cgExportXls`; `exportRows`/`periodMeta` computed props for `buildStyledExcelExport`) — only the missing library dependency is being added.

## Error handling

No new error handling introduced. `cgExportXls()`'s existing guard remains; `buildStyledExcelExport()` gains no new guard (per the Brief, this fix's scope is limited to making the library available, not adding new error-handling flow).

## Backward compatibility

`pipeline.html` is unmodified — confirmed via repo-wide grep that no reachable code path there calls either export function, so it doesn't need the new script tag. No existing functionality on either modified page changes; only a previously-broken feature (Export XLS) starts working.

## Testing

Manual: on `costgrid.html`, click "Export XLS" in the editor toolbar; on `planning.html`, click each of the 3 export buttons (Resource Planning, By Project, By Owner). Confirm each downloads a `.xlsx` file with no console error, and open the downloaded files to confirm the expected cell styling (colors, borders, fonts) is actually present — not just that the download completes without erroring. `npm test` run as a sanity check; no existing test covers either export function, so no pass-count change is expected.

## Explicitly out of scope

(Carried forward verbatim from the Brief.)

- Removing the unused `xlsx@0.18.5` CDN tag from either page — separate finding, unrelated root cause.
- Any change to `cgExportXls()`'s or `buildStyledExcelExport()`'s internal logic.
- Adding ExcelJS to `pipeline.html` or any other page.
- Every other item from the cold-review's backlog (the FOUC/`v-cloak` finding, the two Cycle B2 follow-ups).
