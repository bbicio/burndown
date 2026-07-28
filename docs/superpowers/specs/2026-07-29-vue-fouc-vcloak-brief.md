# Brief — Fix Repo-Wide FOUC via `v-cloak`

**Scenario:** Audit → fix (Scenario 3 per `docs/superpowers/PROCESS.md` §2). Source: a new finding discovered live during the `pipeline-version-management` cycle's Gate 2 manual verification (not part of the original `vue-migration-roadmap-cold-review` backlog, but explicitly requested by the user to be tracked and eventually fixed, scoped repo-wide with a centralized solution).

## Problem

No page in the repo uses Vue's `v-cloak` directive. Confirmed via repo-wide grep (`grep -l "v-cloak" *.html` → zero matches). Every page's Vue instance is a runtime-compiled `Vue.createApp({...}).mount(...)` (CDN, no build step) — the template is the raw DOM markup already present in the HTML file, containing `v-if`/`v-else-if`/`v-else`/`v-for`/`{{ }}` directives that only Vue's JS understands. Until Vue's script loads, parses, and mounts, the browser paints the raw, uncompiled markup exactly as written — briefly showing all conditional branches simultaneously (since `v-if` etc. are inert HTML attributes to the browser) and/or literal `{{ expression }}` text, before Vue takes over and hides/renders correctly.

This was previously rarely noticed, since normal SPA-style navigation between pages was the dominant usage pattern (each page's own Vue instance stays mounted; no repeated reloads). It became more likely to surface after the `pipeline-version-management` cycle added `window.location.reload()` to the Publish flow (`js/costgrid.js`'s `cgPublishDraft()`), which now triggers a full page reload — and the user confirmed noticing the flash during that cycle's own manual verification.

**Confirmed affected: all 13 Vue-mounted pages in the repo** (verified via `grep -n "\.mount(" *.html`), each with its own root mount element:

| Page | Root element |
|---|---|
| `_db-reset.html` | `#app` |
| `activate.html` | `#app` |
| `admin.html` | `#app` |
| `config.html` | `#app` |
| `costgrid.html` | `#costGridEditorSection` |
| `login.html` | `#app` |
| `pipeline.html` | `#pipelineBoardSection` |
| `planning.html` | `#planningApp` |
| `portfolio.html` | `#app` |
| `project-config.html` | `#app` |
| `reset-password.html` | `#app` |
| `terms.html` | `#app` |
| `timesheets.html` | `#app` |

`index.html` (the 9-line redirect) is not Vue and is excluded, matching its exclusion from the entire migration roadmap.

**Centralization point confirmed:** all 13 pages load `css/tokens.css` (verified via grep — some additionally load `css/style.css`, but `tokens.css` is the one file common to every single Vue page). This is the natural place for the one shared CSS rule Vue's own documented `v-cloak` pattern requires (`[v-cloak] { display: none; }`), rather than duplicating that rule into 13 separate `<style>` blocks.

## Expected behavior

- `css/tokens.css` gains one new rule: `[v-cloak] { display: none; }`.
- Each of the 13 pages' Vue root mount element (per the table above) gains the `v-cloak` attribute.
- Until Vue mounts, the entire root element (and everything inside it, including the raw uncompiled template) stays hidden via `display: none`. The instant Vue finishes mounting, it removes the `v-cloak` attribute from the root element (Vue's own built-in behavior — no extra code needed), making the correctly-compiled content visible immediately.
- No visible behavior change to a normal (non-flashing) page load beyond eliminating the brief flash — the loading spinner (`v-if="loading"`, already present on most pages) still appears once Vue mounts, exactly as it does today; only the pre-mount raw-markup flash is eliminated.

## Constraints

- Match this project's existing cache-busting convention: `css/tokens.css` is referenced with a `?v=N` query string on every page. Verified via grep: 12 of the 13 pages are currently at `?v=5`; `_db-reset.html` alone is already at `?v=6` (bumped independently in an earlier, unrelated cycle). Since this Brief changes `tokens.css`'s content, every page's reference needs to move to a version number higher than any currently in use — bump the 12 pages at `?v=5` to `?v=7`, and bump `_db-reset.html` from `?v=6` to `?v=7` as well, so all 13 pages end up on the same new version number and none serves a stale cached copy missing the new rule.
- Do not add a build step, a bundler, or any tooling — this remains a plain CSS rule and a plain HTML attribute, consistent with the whole app's "no build step" architecture.
- Do not touch any other CSS in `tokens.css` — purely additive, one new rule.
- Do not change any page's Vue logic, data, computed properties, or template structure beyond adding the single `v-cloak` attribute to its root mount element.
- `index.html` is out of scope (not a Vue page).

## Acceptance criteria

- [ ] `css/tokens.css` contains `[v-cloak] { display: none; }`.
- [ ] All 13 Vue pages' root mount elements have the `v-cloak` attribute, matching the table above exactly.
- [ ] All 13 pages' `css/tokens.css` references share the same new version number (`?v=7`) — the 12 pages previously at `?v=5` and `_db-reset.html` previously at `?v=6` are all consistent afterward.
- [ ] `npm test` passes with no regressions.
- [ ] Manual verification: reload each of a representative sample of pages (at minimum: one page with a single-root-`#app` pattern, e.g. `admin.html`; and the three pages with custom root IDs — `costgrid.html`, `pipeline.html`, `planning.html`) with browser devtools network throttling enabled (to widen the window where the flash would be visible) and confirm no raw/uncompiled markup flash occurs before the page's normal loading state appears.
- [ ] Confirm the previously-reported flash on `costgrid.html` after a Publish-triggered reload no longer occurs.

## Explicitly excluded scope

- Any other FOUC-adjacent concern (e.g. web-font loading flash, image lazy-loading) — this Brief is scoped strictly to the Vue-template-compilation flash.
- Any change to how/when any page's Vue instance loads its data (`created()` hooks, API calls, etc.) — this Brief only hides pre-mount raw markup, it does not change loading sequencing or add new loading states.
- Every other item from the cold-review's backlog (already-closed Cycles B1/B2/C/D) and the two Cycle B2 follow-ups (session-expiry race, `showConfirm()` affordance mismatch) — unrelated, separate items.
- The pre-vue-migration-roadmap backlog items surfaced during this session's own broader review (sold-hours validation, `js/ai.js` divergence, `_resolveCgIdForVersion` dead code, XLS column-mapping ambiguity, stale tooltip wording, `/finish-cycle` Gate 2 blind spot) — untouched, separate future work.

## Required reminder (new-findings guard)

Any new finding discovered during this cycle's `/brainstorming` or execution — a page whose root mount element is harder to identify than expected, a page where `v-cloak` interacts badly with existing CSS, or anything else — must be isolated and proposed as its own future Brief, never folded into this cycle's fix.

---

Brief ready. Next step: /brainstorming.
