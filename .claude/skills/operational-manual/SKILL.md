---
name: operational-manual
description: >
  Generate or refresh a single, English-language operational manual for an app's
  end users — organized by role, covering only features that are actually live.
  Trigger when the user asks for a user guide, manual, how-to documentation, or
  onboarding material for people who will USE the app (not develop it). Standalone
  skill — does not assume any particular project-documentation structure; locates
  or asks for source material rather than depending on fixed file names or schemas.
---

# operational-manual (standalone)

Turns whatever planning/reference material a project has — or what the user says directly — into a manual for the people who will actually use the finished application. A translation into operational register, not a new source of truth, and not tied to any particular development process or file-naming convention.

## Produces

A single file, `docs/OPERATIONAL_MANUAL.md` (or wherever the project's docs live — confirm the path if unclear), in **English** unless the user asks for another language. Stamped with a generation date and a short note on what source material it was built from, so both staleness and provenance are visible.

## Steps

1. **Locate source material — don't assume a fixed structure.** Look for existing docs that describe roles, permissions, and feature behaviour (common names: `PRD.md`, `ARCHITECTURE.md`, `README.md`, a wiki, existing user docs). If found, read them. If nothing suitable exists, or what exists is ambiguous, **ask the user** what to read from, or ask them to describe roles and flows directly — never infer silently from a guess at file names.
2. **Establish roles.** From whatever source was confirmed in step 1, identify the distinct user roles (e.g. admin, member, guest) — this is the manual's organizing structure, one section per role.
3. **Confirm what's actually live.** Before describing any feature, confirm with the user (or check against a real, current signal — a deployed environment, a changelog, an explicit "what's shipped" list) that it's genuinely in production, not just planned or in progress. **Never document a capability that isn't live** — a manual promising something unbuilt is worse than no manual. This project may have no formal status-tracking file, so this confirmation is explicit and conversational, not automated. **If a source (e.g. `PRD.md`) already enumerates the features**, extract that list and ask for confirmation **once, cumulatively** — *"Here's what PRD.md describes: [list]. Which of these are actually live today?"* — rather than one question per feature.
4. **Organize by role, then by task.** A user thinks "how do I add a new record," not by the internal name of the code that does it. Structure the manual around the flows a person in that role would actually follow.
5. **Translate register.** Plain operational language — no implementation detail (no component names, no architecture, no internal IDs), no jargon the audience wouldn't use.
6. **Stamp the generation date and source** at the top of the file — what was read, what was confirmed conversationally — so a future reader can judge how current it is.

## PDash-specific defaults

These answer, for this repo specifically, the questions the generic steps above would otherwise ask each time:

- **Source of truth: `PRD.md` only.** It is already organized by feature/page in user-facing language and is kept in sync with what's actually merged to `main` (updated at every `/finish-cycle` Gate 5, only for shipped behavior — never for roadmap or in-progress work). Do not read `ARCHITECTURE.md` or `CLAUDE.md` as source material — both are implementation-detail documents (file paths, Vue internals, SQL) and pulling from them risks violating the "no implementation detail" guard below.
- **"Confirm what's live" (step 3) is a light pass here, not a full audit.** Since `PRD.md` is already scoped to merged behavior by construction, treat it as live by default; still ask one cumulative confirmation question before finalizing, as a safety net — not a feature-by-feature interrogation.
- **Structure: by flow/page, not by role.** PDash's permission model is two independent axes — a global role (`user`/`admin`/`sysadmin`) and a per-resource permission (`owner`/`editor`/`viewer`, which can differ project-by-project for the same user). A strict one-section-per-role structure would duplicate every flow 3-4 times. Instead, mirror `PRD.md`'s own organization (by page/feature) and note permission differences inline within each flow (e.g. "viewers cannot see this button").
- **Language: English**, matching CLAUDE.md's project-wide constraint that all user-facing text must be in English — the manual describes an English-UI product, regardless of what language the request to generate it arrives in.
- **Output path:** `docs/OPERATIONAL_MANUAL.md`.

## Guards

- **Never describe a feature that isn't confirmed live.** If unsure, ask — don't include it "just in case."
- **English by default; confirm if the project uses a different target language** for user-facing material — this skill doesn't assume any project-specific language convention exists.
- **No implementation detail.** Only what a user can do and how, from their perspective.
- **No dependency on any other skill, command, or specific file schema.** This is a standalone version — it works from whatever documentation or direct answers the project actually has, never from an assumed structure.
- **On-demand only.** Never runs automatically; regenerate deliberately when enough has changed to be worth it.

## When to regenerate

Whenever enough live changes have accumulated since the last generation to make the manual meaningfully stale. The generation-date/source stamp is what tells you whether it's due.
