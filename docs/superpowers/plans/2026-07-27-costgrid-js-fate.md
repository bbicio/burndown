# Document `js/costgrid.js`'s Architectural Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the decision that `js/costgrid.js` is a permanent, intentional shared Vanilla business-logic library — not migration debt awaiting a future rewrite — with no code change.

**Architecture:** Doc-only cycle. Two files gain one clause each, stating the decision and naming the 2 current consumers.

**Tech Stack:** Markdown documentation only. No code, no tests.

## Global Constraints

- No code change of any kind — this cycle produces documentation edits only (design spec, Documentation changes section).
- Do not remove or alter any other content in either file's `js/costgrid.js` entry — additive only.

---

### Task 1: Add the architectural-status clause to `CLAUDE.md` and `ARCHITECTURE.md`

**Files:**
- Modify: `CLAUDE.md:174` (the `js/costgrid.js` file-structure entry)
- Modify: `ARCHITECTURE.md:676` (the `costgrid.js` file-tree entry)

**Interfaces:** None — this is the only task in this plan.

- [ ] **Step 1: Edit `CLAUDE.md`**

Find this substring within the `js/costgrid.js` entry (line 174):

```
(no longer loaded by `planning.html`, whose Vue migration confirmed it made no genuine calls into this file beyond two now-removed page-local no-op overrides)
```

Insert the following sentence immediately after it (before the next opening `` (`renderCgEditor()`... `` clause that already follows):

```
 — decided 2026-07: this file is a permanent shared Vanilla service layer (not migration debt awaiting a future rewrite), with exactly 2 consumers today (`pipeline.html`, `costgrid.html`); see `docs/superpowers/specs/2026-07-27-costgrid-js-fate-design.md` for the rationale
```

- [ ] **Step 2: Edit `ARCHITECTURE.md`**

Find this substring within the `costgrid.js` entry (line 676):

```
and by `costgrid.html`'s own Vue rewrite via the bridge pattern (see `costgrid.html` entry below);
```

Insert the following sentence immediately after it (before the next `non-EUR role rate fallback chain` clause that already follows):

```
 Decided 2026-07: this file is a permanent shared Vanilla service layer, not migration debt — see `docs/superpowers/specs/2026-07-27-costgrid-js-fate-design.md`.
```

- [ ] **Step 3: Verify both edits landed cleanly**

Run:

```bash
grep -c "permanent shared Vanilla" CLAUDE.md ARCHITECTURE.md
```

Expected: `CLAUDE.md:1` and `ARCHITECTURE.md:1` (exactly one occurrence added to each file).

- [ ] **Step 4: Run the test suite as a sanity check**

```bash
npm test
```

Expected: same pass count as before this task (136 tests, since this task changes no code — this run confirms nothing was accidentally broken by the markdown edits, e.g. no stray edit landed in a `.js` file by mistake).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md ARCHITECTURE.md
git commit -m "docs: document js/costgrid.js as a permanent shared Vanilla service layer"
```
