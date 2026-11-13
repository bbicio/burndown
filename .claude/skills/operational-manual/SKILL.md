---
name: operational-manual
description: >
  Generate or refresh the English-language user manual of an app — organized by
  flow or page, covering only features that are actually live. Produces one
  Markdown file with a concise description per point and an optional collapsible
  "Details" block per point carrying deeper explanation and, where relevant, a
  controls reference table. Trigger when the user asks for a user guide, manual,
  how-to documentation, or onboarding material for people who will USE the app
  (not develop it). Works from the project's own planning/reference documents
  and the code; asks rather than guessing when neither says enough.
---

# operational-manual

Turns the project's reference material into a manual for the people who use the finished application. A translation into operational register, not a new source of truth.

## Produces

`handbook/public/manual.md`, in English, rendered by `help.html`. The format rules are the ones the viewer needs:

- The title is `# User manual`; each chapter is a `## ` heading, in menu order: `## Getting started`, `## Pipeline and offers`, `## Resource planning`, `## Project reporting`, `## Project configuration`, `## Timesheet upload`, `## Master data (admin)`, `## Team and attribute lists (admin)`, `## User administration (admin)`, `## Account, privacy and sharing`. A chapter for a new page goes where its menu entry sits.
- A heading of something only administrators can use carries "(admin)", and its first sentence names the role.
- Every point has a short, always-visible description. A point with real depth behind it also gets a `<details>` block in exactly this shape, blank lines included, so the Markdown inside it renders:

  ```
  <details>
  <summary>Details</summary>

  Markdown text, lists and tables.

  </details>
  ```

- A controls table (Control, What it does, Who sees it) is used where several named controls belong to one flow.
- No images, no `<img>`, and no links to a heading (`](#`): the renderer generates no heading ids. Refer to another chapter by its name.
- A `|` inside a table cell is escaped, and a table is separated from the text above by an empty line.

## Content rules

- **Only what is live and true today.** When the PRD and an older text disagree, the PRD area file wins; where the PRD is unclear, the page (`<page>.html`, `docs/pages/<page>.md`) decides. Nothing is written that none of them supports. Never reintroduce a feature that was removed (the old personal-key AI sidebar and AI Analysis, the settings modal, backup, restore and export screens).
- **Source:** `PRD.md` and the area files under `docs/prd/`, read in full, then the code. Every button, menu entry, column or field named in bold or in quotes is searched in the page that has it, and in the `js/` files it loads, before it is kept: a label that appears in none of them is fixed to the page's own wording or removed. Text that a page shows in capitals is quoted in capitals.
- **Operational language.** Only what a user can do and how: no component names, no architecture, no internal ids, no endpoints.
- **Structure by flow and page, not by role.** Permissions are two independent axes (account role and per-resource owner/editor/viewer); note the difference inline ("viewers do not see this button").
- Hidden pages with no menu entry are described in the chapter of the page that reaches them, and are not named by file.

## Steps

1. Read `PRD.md` and every `docs/prd/` file; read the current `handbook/public/manual.md`.
2. For each chapter whose area changed, read the area file and the page, list what is wrong, missing or gone in the chapter, and rewrite it.
3. Check the labels as above, then render the file (`help.html` on a branch stack, or any Markdown renderer) and look at it: tables are tables and every `<details>` opens.
4. Run `npx vitest run scripts/handbook-guard.test.js scripts/doc-paths-guard.test.js`.

## Guards

- Never describe a feature that is not confirmed live. If unsure, ask.
- English only, matching the project's language constraint.
- Never edit the manual by regenerating it from an older copy: change the chapters whose area changed and leave the others as they are.
- No dependency on another skill or command.

## When to regenerate

On the user's request, and by `/sync-docs` §5c when a cycle changed behaviour visible to the user.
