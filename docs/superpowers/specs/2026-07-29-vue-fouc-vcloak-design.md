# Fix Repo-Wide FOUC via `v-cloak` — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-29-vue-fouc-vcloak-brief.md`. A new finding discovered live during the `pipeline-version-management` cycle, explicitly scoped by the user to be fixed repo-wide with a centralized solution.

## Problem

No page in the repo uses Vue's `v-cloak` directive (confirmed via repo-wide grep), so the browser briefly paints raw, uncompiled template markup — all `v-if`/`v-else-if`/`v-else` branches simultaneously, literal `{{ }}` expressions — before each page's runtime-compiled Vue instance mounts and takes over. Confirmed across all 13 Vue-mounted pages in the repo.

## Architecture

No architectural change to any page's Vue instance, data flow, or component structure — purely a CSS rule (added once, centrally) plus one HTML attribute per page's existing root mount element. This is Vue's own standard, documented anti-FOUC pattern, applied for the first time in this codebase.

## Components

### `css/tokens.css` — one new rule

```css
[v-cloak] { display: none; }
```

Added once. Every one of the 13 Vue pages already loads `css/tokens.css` (confirmed via grep — the one file common to all of them, though some also load `css/style.css` additionally), so this single rule covers every page without duplication.

### 13 pages — one attribute each, on the existing root mount element

| Page | Root element | Change |
|---|---|---|
| `_db-reset.html` | `#app` | add `v-cloak` |
| `activate.html` | `#app` | add `v-cloak` |
| `admin.html` | `#app` | add `v-cloak` |
| `config.html` | `#app` | add `v-cloak` |
| `costgrid.html` | `#costGridEditorSection` | add `v-cloak` |
| `login.html` | `#app` | add `v-cloak` |
| `pipeline.html` | `#pipelineBoardSection` | add `v-cloak` |
| `planning.html` | `#planningApp` | add `v-cloak` |
| `portfolio.html` | `#app` | add `v-cloak` |
| `project-config.html` | `#app` | add `v-cloak` |
| `reset-password.html` | `#app` | add `v-cloak` |
| `terms.html` | `#app` | add `v-cloak` |
| `timesheets.html` | `#app` | add `v-cloak` |

No other markup changes. `#nav-container` (injected separately by `nav.js`, a plain Vanilla script) is confirmed to be a **sibling** element to each page's Vue root, never nested inside it (verified on `costgrid.html`'s structure) — so cloaking the Vue root does not hide the navbar, which continues to appear immediately via its existing non-Vue injection path, unaffected by this change.

### Cache-bust version bump

All 13 pages' `css/tokens.css?v=N` reference moves to `?v=7`. Verified via grep: 12 pages are currently at `?v=5`; `_db-reset.html` alone is already at `?v=6` (from an earlier, unrelated cycle). `?v=7` is higher than both, bringing all 13 pages to the same, currently-unused version number.

## Data flow

No change. `v-cloak` is a purely presentational directive that Vue itself adds/removes automatically during its own mount lifecycle — no application code reads or writes it.

## Error handling

None needed — this is a display-timing fix, not a logic change. If Vue's script fails to load entirely (a pre-existing, unrelated failure mode already true today), the cloaked root stays hidden rather than showing broken raw markup — arguably a minor improvement over today's behavior in that failure case, though not the primary goal of this fix.

## Backward compatibility

No page's data loading, computed properties, or rendering logic changes. The only observable difference is the elimination of the pre-mount raw-markup flash; the existing `v-if="loading"` spinner (present on most pages) still appears the instant Vue mounts, exactly as today — this fix only affects the moment *before* Vue mounts, not anything after.

## Testing

Manual: reload a representative sample of pages with browser devtools network throttling enabled (to widen the window where a flash would be visible) — at minimum `admin.html` (simple `#app` pattern) and the three custom-root-ID pages (`costgrid.html`, `pipeline.html`, `planning.html`). Confirm no raw/uncompiled markup flash occurs before the page's normal loading state appears. Specifically re-verify the originally-reported case: publish a Draft version on `costgrid.html` (triggering `cgPublishDraft()`'s `window.location.reload()`) and confirm the flash no longer occurs. `npm test` run as a sanity check; no existing test covers markup/CSS rendering, so no pass-count change is expected.

## Explicitly out of scope

(Carried forward verbatim from the Brief.)

- Any other FOUC-adjacent concern (web-font loading flash, image lazy-loading).
- Any change to loading sequencing, `created()` hooks, or data-fetch timing on any page.
- Every other item from the cold-review's backlog and the two Cycle B2 follow-ups.
- The pre-vue-migration-roadmap backlog items surfaced during this session's broader review (sold-hours validation, `js/ai.js` divergence, `_resolveCgIdForVersion` dead code, XLS column-mapping ambiguity, stale tooltip wording, `/finish-cycle` Gate 2 blind spot).
