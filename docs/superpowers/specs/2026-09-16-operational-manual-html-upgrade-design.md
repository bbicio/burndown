# Design: `operational-manual` skill — HTML output with per-item detail toggles and screenshots

**Date:** 2026-09-16
**Status:** Approved for planning

## 1. Problem

The `operational-manual` skill (`.claude/skills/operational-manual/SKILL.md`) currently produces a single, concise Markdown file (`docs/OPERATIONAL_MANUAL.md`) — one level of detail, no visuals. A hand-built HTML rendition was produced once, outside the skill, as a one-off Artifact; it is not reproducible by re-running the skill, and it has no way to show more detail than the concise pass without becoming unreadably long.

The user wants a single generated document that:
- Defaults to concise, scannable descriptions (what exists today).
- Lets a reader expand any individual point to see a fuller description, independently of every other point.
- Includes a screenshot per major flow, embedded in that same document.
- Is produced in one skill run, so the concise text, the detailed text, and the images can never drift out of sync with each other.

## 2. Goals

- Update `SKILL.md` so a single invocation of the skill produces one self-contained HTML file (`docs/OPERATIONAL_MANUAL.html`) with the above properties.
- Keep the skill's existing PDash-specific defaults (source = `PRD.md` only; organize by flow/page, not by role; English output) — this change extends the skill's *output format and depth*, not its sourcing philosophy.
- Keep the visual design system already established for this project's manual (sidebar nav with scroll-spy, PDash color tokens, permission pills, stage-color legend) — this is an enhancement to that page, not a redesign.

## 3. Non-goals (explicitly excluded)

- A global sintetico/dettagliato switch. Rejected in favor of per-item toggles (user's explicit correction of the original Brief).
- Screenshot coverage of every permission variant (viewer vs. editor vs. admin) for every screen. One screenshot per main flow, in a plausible default permission state.
- Reading the live application's HTML/JS source to source button names with pixel-level accuracy. Button/control inventories in the detailed view are sourced from `PRD.md`'s own button mentions (which already name most controls with their icon and label verbatim) — not from inspecting `costgrid.html`/`portfolio.html`/etc. source.
- Automated or triggered regeneration. Stays on-demand only, per the skill's existing guard.
- Any change to PDash's own application code (`js/`, `api/`, any `*.html` page). This work touches only the skill definition and its generated output.
- Keeping `docs/OPERATIONAL_MANUAL.md` (the Markdown output) up to date going forward — it is left as a historical artifact of the first generation, not deleted, not further maintained by this skill.

## 4. Design

### 4.1 Per-item detail toggle

Every point in the manual that has a documented "detailed" expansion (not necessarily every single sentence — see §4.4) is wrapped as:

```html
<details class="detail-toggle">
  <summary>▸ Details</summary>
  <div class="detail-body">
    <!-- fuller description, optionally a controls table (§4.3), optionally a screenshot (§4.2) -->
  </div>
</details>
```

This uses the browser's native `<details>`/`<summary>` disclosure widget:
- No custom JavaScript needed for open/close state — the browser owns it.
- Keyboard-accessible and screen-reader-friendly by default (native semantics), which a hand-rolled `<button>` + `display:none` toggle would have to reimplement.
- Independent per element by construction — opening one `<details>` cannot affect any other, and native disclosure toggling does not move page scroll position (unlike, say, an accordion that reflows siblings).

Styling (added to the existing `<style>` block already established for this document): `summary` gets the mono utility face and magenta accent already used for section numbers, a custom disclosure marker (▸ / ▾ via `::marker` or a `list-style: none` + manual arrow character swapped on `[open]`), and `.detail-body` gets a left border + slightly indented, sunken background consistent with the existing `.note` component's visual language — so an expanded detail reads as "the same family of thing" as the existing callout boxes, not a new visual idiom.

### 4.2 Screenshots

**Environment.** A dedicated pass using `scripts/test-branch.sh`, but **not** its default "clone data from main" behavior — that would pull real client/project names into the isolated environment, and from there into a screenshot embedded in a committed file. Instead:

1. Bring the isolated stack up with an empty/freshly-migrated database (this is the script's own documented fallback path when it can't clone from a running main stack — reachable deliberately here, not accidentally, by e.g. stopping the main stack's `pdash-db` first, or by seeding fresh data immediately after `up` and never reading the cloned set).
2. Seed a small, clearly-fictional data set sufficient to populate every flow being screenshotted: one demo client ("Acme Fictional Co." or similar, obviously not a real company), one demo cost grid/offer moving through at least two pipeline stages, one demo project generated from it with tasks/roles/actuals, one demo timesheet upload, one demo program, one demo POT target. This is the *only* data in the isolated DB — nothing cloned, so no screenshot can ever show a real name or figure.
3. Capture one screenshot per flow from the checklist in §4.2.1, each via the existing Chrome browser-automation tools, following this session's own established workaround for its recurring rendering glitch (fresh tab via `tabs_create_mcp` before capturing, rather than reusing a tab that has already glitched).
4. Tear the isolated environment down afterward (`scripts/test-branch.sh down`), per this project's own Docker-safety convention — no different from any other cycle's use of that environment.

**Embedding.** Each captured screenshot is base64-encoded and embedded as a `data:image/png;base64,...` `src` directly in the HTML — not saved as a separate file the HTML links to. This keeps the single-file-portability property the user asked for (§"Approach B" decision) and matches how the rest of this document is already self-contained (fonts via CDN link, everything else inline).

**Placement.** A screenshot lives inside the relevant point's `.detail-body`, with a one-line caption underneath (`<figure>`/`<figcaption>`), not in the concise/collapsed view — consistent with "detail" meaning "more than the scannable default," images included.

**Graceful degradation.** If a specific flow's screenshot can't be captured after one retry-with-fresh-tab (the environment's browser automation is known to glitch intermittently this session), that flow's `.detail-body` ships without an image and with an HTML comment `<!-- screenshot pending: <flow name> -->` marking the gap — the whole document generation is never blocked by one failed capture.

#### 4.2.1 Screenshot checklist (one per main flow, ~10–14 total)

Derived from the manual's own section list (§4–§13 of the current content):

1. Pipeline board (the six-column kanban view)
2. Offer detail panel (opened from a board card)
3. Cost grid / offer editor (phases-tasks-roles table)
4. Resource Planning table (By Project or By Role view)
5. Project Reporting — project list (cards, with the search/Status filter row visible)
6. Project Reporting — single-project detail page
7. Project configuration form (`project-config.html`)
8. Timesheet upload / actuals view
9. Settings modal (API & Integrations or Data Manager tab)
10. Notification panel
11. Share modal / inline share list
12. Admin — Clients or Programs configuration screen
13. Admin — User administration list
14. (Optional, if time allows) AI sidebar chat

This list is a starting checklist for the executor, not a rigid contract — per §4.2's graceful-degradation rule, a flow can be dropped if it can't be captured, and the executor may combine or reorder captures where one screenshot naturally illustrates two adjacent points.

### 4.3 Controls/button inventory table

Where a flow's detailed view would benefit from a compact reference (offer editor, project configuration form, admin screens — anywhere `PRD.md` names several buttons for one flow), the detail body includes a small table:

| Control | What it does | Who sees it |
|---|---|---|
| *(icon + label, verbatim from PRD.md, e.g. "⚙️ Configure")* | *(one-line description, from PRD.md)* | *(e.g. "Hidden for viewers")* |

Populated entirely from `PRD.md`'s own text — it already names most buttons with their exact icon and label (e.g. "📂 Load Actuals", "🗑 Delete actuals", "⚙️ Configure", "🔗 Share"). Not every flow needs this table — only where `PRD.md` itself enumerates several named controls for that flow; a flow described only in prose stays prose.

### 4.4 What "detailed" means, concretely

Not every concise point needs a `<details>` expansion — only ones where `PRD.md` actually contains more than what the concise pass kept. Concretely, expanding the first-generation manual against `PRD.md` again, the following gain real detail (non-exhaustive — the executor re-derives this by re-reading `PRD.md` section-by-section against the current concise text, not by only following this list):

- **Resource Planning formulas** (§5 of the manual) — the concise pass compressed `PRD.md`'s own Sold/From actuals/To be planned/Residual formulas heavily; the detailed view restores the fuller explanation, including the By Owner task-level floor behavior and the monthly-pulse aggregation rule.
- **Summary by role** (part of Project Reporting) — restore the concrete example already in `PRD.md` (a role billed at two different hourly rates on two different tasks).
- **Derive vs. Reforecast** (Project Configuration) — the concise pass already has a comparison table; the detailed view adds the specific rounding/drift-carry behavior and the blocking-error case text from `PRD.md`.
- **Admin configuration screens** (Clients, Pipelines & POTs, Roles) — restore the fuller field-by-field detail `PRD.md` gives for the POT detail modal and the rate-card modal, trimmed to one line each in the concise pass.
- Any other point where a side-by-side re-read shows the concise manual dropped something `PRD.md` states — the executor's job during this pass is exactly that re-read, not a fixed checklist.

### 4.5 SKILL.md changes

The "Produces" section changes from describing a single Markdown file to describing the HTML file with its toggle/screenshot properties. The "Steps" section gains:
- An explicit step for the isolated-environment/synthetic-data screenshot pass (§4.2), placed after the text-generation steps (so the executor knows the full detailed-text content before deciding which points get a screenshot).
- A step describing how to decide which points get a `<details>` expansion (§4.4's "re-read against PRD.md" approach, not a fixed list baked into the skill file — PRD.md's own content will keep changing across regenerations, so the skill should describe the *process* of finding what's expandable, not hardcode today's list).
- The existing "PDash-specific defaults" section is updated in place (source = PRD.md, structure by flow) rather than replaced — those decisions are unaffected by this change.

The "Guards" section gains one entry: **never embed data from a real environment in a screenshot** — screenshots come only from the isolated, synthetic-data environment described in §4.2, never the main stack.

## 5. Testing / verification approach

This is a documentation-generation skill, not application code — there is no unit-test suite to extend. Verification is manual, at the point the skill is actually run to produce a new `docs/OPERATIONAL_MANUAL.html`:
- Open the generated file in a browser; confirm every `<details>` opens/closes independently and doesn't move other content.
- Confirm every embedded image actually renders (a malformed base64 string would show a broken-image icon — visually obvious).
- Spot-check that the detailed text for 2–3 points is genuinely traceable to `PRD.md` content, not invented.
- Confirm no real client/project names or figures appear in any screenshot (the single most important check, given the explicit constraint).

## 6. Open items carried into implementation (not blocking this spec)

- The exact wording of each `<details>` summary label (a fixed "▸ Details" everywhere, vs. a more specific label per point) is an executor-time styling decision, not a design decision — default to a fixed "▸ Details" / "▾ Hide details" pair for consistency unless a specific point clearly benefits from a more descriptive label.
- Whether the synthetic demo data set (§4.2 step 2) is created via direct SQL (fast, but bypasses the app's own validation) or by driving the actual UI (slower, but exercises the real create-flows and guarantees the data is exactly what the app would produce) is left to the executor; either is acceptable as long as the result is visually representative and contains zero real data.
