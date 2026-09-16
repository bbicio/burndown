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

Not every concise point needs a `<details>` expansion — only ones where `PRD.md` actually contains more than what the concise pass kept. This list was built by re-reading the entirety of `PRD.md` section-by-section against the first-generation manual's text — it is intentionally much longer than the first pass at this spec, because that first pass under-sampled how much detail `PRD.md` actually carries. It is still not a closed list: the executor re-derives it the same way (a full side-by-side re-read), and adds anything found here that's missing, rather than treating this as a ceiling.

**§2 Getting started**
- **Login and password recovery — anti-enumeration behavior.** `PRD.md` §15 itself is already fairly thin here (the concise pass already carries most of its content nearly verbatim), so this isn't a "restore compressed detail" case like the others below — it's one genuine security-relevant behavior worth calling out in its own right: both login failures and password-reset requests respond identically whether or not the email matches a real account, specifically so no one can use either form to discover which emails are registered. Worth a short `<details>` even though there's little extra prose to add, since it's a real applicative flow the user explicitly asked to keep in scope.

**§4 Pipeline**
- **Offer cards** — the exact visibility rule for the Delete button (Draft-stage cards only, and only with edit permission), not just "editing/deleting needs edit access."
- **Mixed-currency column totals** — a column holding offers in more than one currency shows one subtotal per currency (in that currency's own figures) plus a combined EUR-equivalent total, rather than one blended number; a single-currency column just shows a plain total. (Source: `PRD.md` §4.2, updated 2026-09 alongside this spec after verifying the actual behavior in code — this detail was missing from `PRD.md` entirely until now.)
- **Version-level actions** — beyond the locking conditions already covered under "Offer editor," a version itself carries Duplicate, Delete, and JSON export/import actions, and multiple versions of the same offer are switched between via tabs above the detail panel/editor.
- **Saving in the offer editor** — every field edit (phase/task names, descriptions, PTC, header fields, role rates) autosaves in the background with a brief confirmation toast, with no explicit save required; a `💾 Save` button is also available for an immediate save, separate from the autosave. (Source: `PRD.md` §4.9, added alongside this spec after verifying in `costgrid.html` — not previously documented beyond the Back button's own auto-save mention.)
- **Filtering** — the Value filter's bucket ranges spelled out (€0–20K / €20K–50K / €50K–100K / €100K–200K / €200K+) and what "Include PTC" changes; the explicit OR-within-one-filter / AND-across-filters rule; that filters reset on every page reload; that the Draft column is exempt from all filtering.
- **Detail panel** — the full header action list and that deleting a proposal's only remaining version deletes the whole proposal, not just that version; every left-column field (rate card name if set, JSON export button); that a linked project's "Project Dashboard" button only appears once timesheet data exists for it; the full right-column phase/task/role/grand-total breakdown structure.
- **Board toolbar** — that switching pipeline year changes the URL (`?year=YYYY`) and that "+ New Proposal" is hidden for non-admins on inactive years.
- **Offer editor** — the full field split between grid-level and version-level settings; the role rate fallback chain (client rate card override → role's per-currency agency default → EUR rate × currency exchange factor); the exact cost formula (task = Σ days×rate per role + PTC; phase = Σ tasks; total = Σ phases); the two distinct locking conditions (Committed + fully migrated, OR a sibling version already has a linked project).
- **Generating a project from an offer (task migration + Program auto-link)** — this session's own most heavily-iterated feature, worth its own expansion rather than a passing mention: selecting only some of an offer's tasks (any stage but Draft) triggers a "Create program" step if the offer has no program yet, with a choice between creating a new one or linking to an already-existing one; canceling that step aborts the whole generation, nothing is created; once a program is established this way, every later generation from the same offer — partial or the remaining full set — links to it automatically with no further prompt; any editor of the offer can do this, not just admins; if the underlying save fails to reach the server, the app shows an explicit sync-failure warning rather than a false success message.

**§5 Resource Planning**
- The full Sold / From actuals / To be planned / Residual formulas, including the By Owner task-level floor behavior (an over-consumed role's shortfall can be offset by another role's remaining budget on the same task) and the monthly-pulse aggregation rule (bundled into the month's first week, proportional to calendar weeks in that month).
- That the Gantt view is task-level, not phase-level, and its bar-fill math (completion %) is a *different*, simpler calculation than the portfolio table's residual math — the two can look inconsistent by design, not by bug.

**§6 Project Reporting**
- **The two KPI tables are not interchangeable** — the portfolio summary's "Budget Estimated" reads the manually-maintained `phasing` grid, while the drill-down's "Total Budget" is computed live from task sold-hours × rate; the two can disagree if `phasing` hasn't been kept in sync (e.g. after editing sold hours without re-running Derive/Reforecast). This nuance was dropped entirely from the concise pass and is worth restoring prominently.
- The full Portfolio KPI formula table (Estimated/Spent/Variance) and the full per-project drill-down KPI formula table (6 rows: Total Sold Hours, Total Budget, Hours/Budget Consumed, Hours/Budget Left).
- **Monthly Summary Table** — the exact Hours/Budget formulas per column, and that variance highlighting is one-sided (negative shown in bold red; no corresponding green for positive variance — a real, deliberate asymmetry).
- **Summary by role** — the concrete example already in `PRD.md` (a role billed at two different hourly rates on two different tasks, e.g. "Account Director" at 168/h on one task and 130/h on another).
- **Summary by functional area** — the `{role, task}` membership model (a role can be claimed on one specific task while excluded on another, vs. the legacy "any task" wildcard).

**§7 Project Configuration**
- The full Project fields table and Task fields table (exact field list, types, and matching rules against the timesheet columns).
- **Derive vs. Reforecast** — beyond the existing comparison table, the specific rounding/drift-carry behavior (hours round to the nearest quarter-hour with the sum guaranteed to match exactly; currency rounds per month independently), the blocking-error case's exact message shape, and — importantly — **that there is no snapshot/rollback and no unsaved-changes warning**: a successful Derive/Reforecast only updates on-screen values until Save is clicked, and navigating away first loses it silently with no `beforeunload` prompt.
- **Actuals section** — the exact filename pattern for downloaded actuals, and that the "View" popup's Fee/Spent columns come from the rate snapshotted at import time, not a live lookup.

**§8 Timesheet Upload**
- The exact expected-columns table (Date, Job Role: Name, Owner: Name, Hours, Task/Issue, D365 Project ID, WF Project Name, Notes) with each column's format and matching rule.
- The date-disambiguation logic in plain terms (unambiguous when one number is >12; falls back to MM/DD only when genuinely ambiguous; a genuinely invalid date rejects the *entire* upload, naming the offending row).
- The fee-snapshot behavior (rate resolved and locked in at import time; a later rate change doesn't retroactively affect already-imported rows).

**§9 Settings**
- The full Exports table (what each of the three export types contains, and who can run it — Roles in Rate Cards is admin-only).
- **That "Restore from Backup" does not actually work** — `PRD.md` states this plainly (a real, currently-true limitation, not a hypothetical); worth surfacing in the detailed view rather than silently omitting a button that looks functional but isn't.

**§13 Administration**
- **Clients** — the rate-card modal's two-column structure (Agency default vs. Client custom override) and multi-currency support.
- **Pipelines & POTs** — the View A / View B layout, the 5 stage-summary-card contents, the "+ New POT" form's two virtual scopes ("Unassigned / To be Identified" and "New Biz") alongside client/client-group targeting, and the View Details modal's 4 KPI cards + History + Proposals list.
- **User administration** — the two-step sysadmin promotion/demotion rule spelled out (`user → admin` then `admin → sysadmin`; never a direct jump in either direction) rather than just "admins can grant sysadmin."
- **Terms & Conditions** — that every published version is retained permanently and viewable, not just the current one.

Any other point where a side-by-side re-read shows the concise manual dropped something `PRD.md` states should be added the same way — this list is the result of doing that once, not a substitute for doing it again at generation time.

### 4.5 Changelog

The generated HTML gains a persistent **Changelog** section (own entry in the sidebar nav, placed near the top of the document alongside the masthead's provenance stamp — the stamp says "what this version is," the changelog says "what changed to get here"). Unlike the masthead's single latest-generation stamp, the changelog is **append-only across regenerations**: each time the skill produces a new `docs/OPERATIONAL_MANUAL.html`, it adds one new dated entry to the top of the list (newest first) and keeps every prior entry — it never overwrites or trims history.

Each entry is `**YYYY-MM-DD** — <one-paragraph human-readable summary>`, written by the executor at generation time from actual knowledge of what changed since the previous entry (the same judgment used to write a commit message — not a mechanical text diff of the HTML, which would be noisy given the whole file is regenerated fresh each run). A regeneration triggered by a `PRD.md` update names which sections/flows changed; a regeneration triggered by a skill/format upgrade (like this one) names the format change itself.

**Bootstrapping:** this upgrade is the first entry — e.g. *"2026-09-16 — Upgraded from plain concise Markdown to this HTML format: per-item "▸ Details" expansions, one screenshot per main flow (synthetic data only), and controls/button reference tables. Supersedes `docs/OPERATIONAL_MANUAL.md`, which is no longer maintained."* Every regeneration after this one reads the existing file's Changelog section first (before regenerating), preserves it verbatim, and prepends the new entry — the skill must never regenerate this section's history from scratch.

### 4.6 SKILL.md changes

The "Produces" section changes from describing a single Markdown file to describing the HTML file with its toggle/screenshot properties. The "Steps" section gains:
- An explicit step for the isolated-environment/synthetic-data screenshot pass (§4.2), placed after the text-generation steps (so the executor knows the full detailed-text content before deciding which points get a screenshot).
- A step describing how to decide which points get a `<details>` expansion (§4.4's "re-read against PRD.md" approach, not a fixed list baked into the skill file — PRD.md's own content will keep changing across regenerations, so the skill should describe the *process* of finding what's expandable, not hardcode today's list).
- The existing "PDash-specific defaults" section is updated in place (source = PRD.md, structure by flow) rather than replaced — those decisions are unaffected by this change.
- A step for the Changelog (§4.5): before regenerating, read the existing `docs/OPERATIONAL_MANUAL.html`'s Changelog section (if the file already exists) and carry every entry forward verbatim, then prepend one new entry describing this run's changes.

The "Guards" section gains two entries: **never embed data from a real environment in a screenshot** — screenshots come only from the isolated, synthetic-data environment described in §4.2, never the main stack; and **never regenerate the Changelog's history** — only ever prepend to it, reading the previous file first.

## 5. Testing / verification approach

This is a documentation-generation skill, not application code — there is no unit-test suite to extend. Verification is manual, at the point the skill is actually run to produce a new `docs/OPERATIONAL_MANUAL.html`:
- Open the generated file in a browser; confirm every `<details>` opens/closes independently and doesn't move other content.
- Confirm every embedded image actually renders (a malformed base64 string would show a broken-image icon — visually obvious).
- Spot-check that the detailed text for 2–3 points is genuinely traceable to `PRD.md` content, not invented.
- Confirm no real client/project names or figures appear in any screenshot (the single most important check, given the explicit constraint).

## 6. Open items carried into implementation (not blocking this spec)

- The exact wording of each `<details>` summary label (a fixed "▸ Details" everywhere, vs. a more specific label per point) is an executor-time styling decision, not a design decision — default to a fixed "▸ Details" / "▾ Hide details" pair for consistency unless a specific point clearly benefits from a more descriptive label.
- Whether the synthetic demo data set (§4.2 step 2) is created via direct SQL (fast, but bypasses the app's own validation) or by driving the actual UI (slower, but exercises the real create-flows and guarantees the data is exactly what the app would produce) is left to the executor; either is acceptable as long as the result is visually representative and contains zero real data.
