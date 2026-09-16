---
name: operational-manual
description: >
  Generate or refresh a single, English-language operational manual for an app's
  end users — organized by flow/role as the project calls for, covering only
  features that are actually live. Produces one self-contained HTML page with
  a concise description per point and an optional "▸ Details" expansion (native
  disclosure, independent per point) carrying deeper explanation, a controls/
  button reference table where relevant, and — when generated with screenshots
  — one embedded image per major flow. Trigger when the user asks for a user
  guide, manual, how-to documentation, or onboarding material for people who
  will USE the app (not develop it). Standalone skill — does not assume any
  particular project-documentation structure; locates or asks for source
  material rather than depending on fixed file names or schemas.
---

# operational-manual (standalone)

Turns whatever planning/reference material a project has — or what the user says directly — into a manual for the people who will actually use the finished application. A translation into operational register, not a new source of truth, and not tied to any particular development process or file-naming convention.

## Produces

A single, self-contained HTML file (`docs/OPERATIONAL_MANUAL.html`, or wherever the project's docs live — confirm the path if unclear). Every point has a concise, always-visible description; where real extra depth exists in the source material, that point also gets a `<details><summary>▸ Details</summary>...</details>` block — collapsed by default, independent of every other point (opening one never affects any other, and never moves scroll position). A `<details>` body may include a small **controls/button reference table** (Control · What it does · Who sees it) where the source material names several distinct controls for that flow, and/or one embedded screenshot with a caption when the generation run included a screenshot pass.

The page also carries:
- A **provenance stamp** near the top: generation date, source material, scope note.
- A persistent, **append-only Changelog** section: one dated entry per regeneration, summarizing what changed since the last one. Never regenerated from scratch — always read the existing file's Changelog first (if the file already exists) and preserve every prior entry verbatim, prepending only the new one.

English by default, unless the user asks for another language.

## Steps

1. **Locate source material — don't assume a fixed structure.** Look for existing docs that describe roles, permissions, and feature behaviour (common names: `PRD.md`, `ARCHITECTURE.md`, `README.md`, a wiki, existing user docs). If found, read them. If nothing suitable exists, or what exists is ambiguous, **ask the user** what to read from, or ask them to describe roles and flows directly — never infer silently from a guess at file names.
2. **Establish the organizing structure.** From the confirmed source, decide whether the manual reads best organized by role (e.g. admin/member/guest) or by flow/page — this is a real per-project decision, not a default; see the project-specific defaults below for how it was resolved here.
3. **Confirm what's actually live.** Before describing any feature, confirm with the user (or check against a real, current signal) that it's genuinely in production, not just planned or in progress. **Never document a capability that isn't live** — a manual promising something unbuilt is worse than no manual. If a source enumerates features already, extract that list and confirm it **once, cumulatively**, rather than one question per feature.
4. **Write the concise pass first, for every point, before touching any `<details>` expansion.** Plain operational language — no implementation detail (no component names, no architecture, no internal IDs), no jargon the audience wouldn't use. A user thinks "how do I add a new record," not by the internal name of the code that does it.
5. **Decide what gets a `<details>` expansion — by re-reading the source against the concise pass just written, not from a fixed checklist.** A point earns an expansion when the source material genuinely contains more than the concise sentence kept — a fuller formula, a concrete example, an edge case, a safety mechanism, a constraint a reader would want to know before acting. Where a flow is genuinely hard to trust from a formula restatement alone (a calculation chain, a multi-step mechanism with a counter-intuitive rule buried in it), write the expansion as a real walkthrough — structure, then the mechanism step by step, with the one or two genuinely counter-intuitive rules called out explicitly — not a denser repetition of the concise sentence. Where several distinct named controls exist for one flow, add the controls-table pattern from "Produces" above instead of, or alongside, prose.
6. **Screenshot pass (only when the generation run is scoped to include it — confirm with the user first if unclear).** For each major flow worth illustrating (roughly one per significant page/view — a starting checklist, not a fixed contract; drop a flow that can't be captured rather than blocking the whole run):
   - Bring up an **isolated environment with synthetic-only data** — never the project's real/production data. If the project's own tooling clones real data by default when spinning up an isolated environment, explicitly avoid or bypass that path (start from an empty/freshly-migrated database instead) and seed a small, obviously-fictional data set sufficient to populate the flows being captured.
   - Capture one screenshot per flow, embedding each as a `data:image/...;base64,...` image directly in the HTML — never as a separate linked file — so the page stays one portable document. Give each a one-line caption.
   - If a specific capture can't be completed after one reasonable retry, ship that point without an image (optionally an HTML comment noting the gap) rather than blocking the rest of the generation.
   - Tear the isolated environment down when done, per the project's own infrastructure-safety conventions.
7. **Update the Changelog.** If regenerating an existing file, read its Changelog section first and carry every entry forward unchanged; prepend one new entry — one paragraph, plain language, written from actual knowledge of what changed since the last entry (the same judgment as a commit message, not a mechanical diff of the regenerated HTML, which would be noisy since the whole file is rebuilt fresh each run).
8. **Stamp the generation date and source** in the provenance block at the top — what was read, what was confirmed conversationally — so a future reader can judge how current the page is.

## PDash-specific defaults

These answer, for this repo specifically, the questions the generic steps above would otherwise ask each time:

- **Source of truth: `PRD.md` only.** It is already organized by feature/page in user-facing language and is kept in sync with what's actually merged to `main` (updated at every `/finish-cycle` Gate 5, only for shipped behavior — never for roadmap or in-progress work; and periodically reconciled by a `domain-audit` pass against the live codebase, most recently `docs/superpowers/audits/2026-09-16-prd-vs-app-behavior-audit.md`). Do not read `ARCHITECTURE.md` or `CLAUDE.md` as source material — both are implementation-detail documents (file paths, Vue internals, SQL) and pulling from them risks violating the "no implementation detail" guard below.
- **"Confirm what's live" (step 3) is a light pass here, not a full audit.** Since `PRD.md` is already scoped to merged behavior by construction, treat it as live by default; still ask one cumulative confirmation question before finalizing, as a safety net.
- **Structure: by flow/page, not by role.** PDash's permission model is two independent axes — a global role (`user`/`admin`/`sysadmin`) and a per-resource permission (`owner`/`editor`/`viewer`, which can differ project-by-project for the same user). A strict one-section-per-role structure would duplicate every flow 3-4 times. Mirror `PRD.md`'s own organization (by page/feature) and note permission differences inline within each flow (e.g. "viewers cannot see this button").
- **Language: English**, matching CLAUDE.md's project-wide constraint that all user-facing text must be in English — the manual describes an English-UI product, regardless of what language the request to generate it arrives in.
- **Output path:** `docs/OPERATIONAL_MANUAL.html`. (A prior plain-Markdown generation at `docs/OPERATIONAL_MANUAL.md` was superseded and removed 2026-09 — this skill produces only the HTML file now.)
- **Screenshot environment:** `scripts/test-branch.sh`, started with a fresh/empty database (bypass its default clone-from-main behavior) and seeded with obviously-fictional demo entities (a demo client, offer, project with tasks/roles/actuals, a program, a POT) — never the main stack, never real client/project data. Tear down with `scripts/test-branch.sh down` when the screenshot pass is complete, per this project's own Docker-safety convention (see `CLAUDE.md`'s "Infrastructure safety" section).
- **Detail-content candidates already identified as of 2026-09-16** (a starting point for step 5 above, not a ceiling — re-derive by re-reading `PRD.md` against the current concise draft each time this skill runs, since `PRD.md` keeps changing): see `docs/superpowers/specs/2026-09-16-operational-manual-html-upgrade-design.md` §4.4 for the full, worked list across every section of the manual, including several genuine walkthroughs (Resource Planning's formula chain, the task-cost-to-Sold-figure bridge, Generate Project's three scenarios, Timesheet Upload's replace-not-append behavior, Pipeline/POT concepts) and a note on one fictional feature (an AI "Resource Allocation Analysis") that must **never** appear in the manual under any name — confirmed via a 2026-09-16 `domain-audit` to not exist in the codebase, and removed from `PRD.md` itself.
- **Screenshot checklist (starting point, ~10-14 captures):** Pipeline board, offer detail panel, cost grid/offer editor (a role column with a custom-rate badge visible, compact mode off so the move/change/dup/remove controls show), the selection-mode toolbar with the Create Program modal open, the proposal's inline "Shared with" list, Resource Planning (By Role expanded, and optionally a second capture of By Owner — this table's structure genuinely differs enough between views to warrant more than one), Project Reporting's project list (a program group with children visible, filters in use), a single-project detail page (burndown chart populated with both reference lines), the project configuration form (a multi-month task with its % distribution grid and validation badge, plus the PTC section), timesheet upload/actuals, the Currencies admin tab, and the Pipelines & POTs "View Details" modal. Trim or extend this list at generation time based on what's actually feasible to capture in the isolated environment.

## Guards

- **Never describe a feature that isn't confirmed live.** If unsure, ask — don't include it "just in case." This includes never reintroducing a feature previously removed from the source material as fictional (see the AI Resource Allocation Analysis note above) — if in doubt whether something still exists, re-verify against the current codebase, don't trust an old draft or memory of an earlier pass.
- **English by default; confirm if the project uses a different target language** for user-facing material — this skill doesn't assume any project-specific language convention exists (though PDash's own convention, above, is settled).
- **No implementation detail.** Only what a user can do and how, from their perspective.
- **Never embed data from a real environment in a screenshot.** Screenshots come only from an isolated environment seeded with synthetic data, never the main stack, never real client/project/financial data.
- **Never regenerate the Changelog's history.** Only ever prepend to it, after reading the previous file's existing entries in full.
- **No dependency on any other skill, command, or specific file schema.** This is a standalone version — it works from whatever documentation or direct answers the project actually has, never from an assumed structure.
- **On-demand only.** Never runs automatically; regenerate deliberately when enough has changed to be worth it.

## When to regenerate

Whenever enough live changes have accumulated since the last generation to make the manual meaningfully stale. The Changelog and provenance stamp are what tell you whether it's due — check the latest Changelog entry's date against how much has changed in `PRD.md` since.
