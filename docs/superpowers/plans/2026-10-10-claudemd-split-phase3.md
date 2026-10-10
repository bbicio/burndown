# CLAUDE.md split phase 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 35,892 B of page- and file-specific narrative out of `CLAUDE.md` into the `docs/` destinations the routing rule already prescribes, and add a guard test that fails when the file regrows or a pointer dangles.

**Architecture:** Five verbatim text moves (seven sections to three existing `docs/` files, two sections to two new ones), each proved byte-identical against a pre-move snapshot; a compact `Invariants` block left inline for the two rules no test pins; every live inbound pointer re-pointed; then one new characterization guard, `scripts/claude-md-guard.test.js`, pinning the final measured state.

**Tech Stack:** Markdown; vitest 4 (`npm test`, host Node ≥ 20.12 — Node 24 on this host); Python 3 for byte-exact extraction and proofs (throwaway, not committed).

**Spec:** `docs/superpowers/specs/2026-10-10-claudemd-split-phase3-design.md` (committed `f60ee36`)

## Global Constraints

- **Move verbatim. Never paraphrase, re-wrap, re-order or copy-edit moved text.** Spec §4. If a section looks like it deserves a rewrite, that is a separate proposal.
- **Extraction keys on heading text, never on line numbers.** Line numbers shift as each task lands.
- **All edited files are CRLF, UTF-8, no BOM.** Never use PowerShell `Get-Content`/`Set-Content` on a repo file. Verify with `file` (names a BOM explicitly) and `git diff --numstat` (a whole-file rewrite is the symptom of an encoding change).
- **Nothing under `docs/superpowers/` is modified** except this plan's own spec/plan/report files. Specs, plans, reports and audits are an immutable record of what was true when written. Spec §7.
- **`Infrastructure safety` in `CLAUDE.md` is not touched, not moved, not merged into move 6.** Spec §5.
- **Pre-move snapshot for all proofs:** `$SNAP = <scratchpad>/CLAUDE.premove.md`, md5 `d77d5baaf0e4e6e28ca9f262ab98a34e`, identical to `CLAUDE.md` at `f60ee36`. Proofs compare working-tree bytes to working-tree bytes: `git show f60ee36:CLAUDE.md` returns the **LF-normalised** blob and is 1 byte short per line, so it is not a valid proof source.
- **Extraction helper:** `<scratchpad>/secttool.py` (`list` / `get <file> "<heading prefix>"`), byte-oriented, already written and validated.
- Expected end state: `CLAUDE.md` between 55,000 and 62,000 B. It is 91,694 B now.

## Review Focus

Failure modes this cycle can produce that no prose task's own output would reveal. Each has a check assigned to the task that owns it.

1. **A section deleted from `CLAUDE.md` but never inserted at its destination** — the most costly outcome (silent loss of a rule) and invisible to a per-destination byte comparison, which only proves what *is* there. Pinned by the partition proof in every move task (Step "prove"), and globally in Task 6.
2. **A section both moved and left behind**, so two documents claim the same current state and drift apart — the exact defect the `?v=N` duplication caused twice in production. Same partition proof: every byte of the pre-move file must be accounted for exactly once.
3. **A proof that cannot fail** — a comparison of a section against itself, or of two empty strings, reported as success. Cycle 4's reviewer demanded this guard when offered the same proof. Every proof step asserts a deliberate mismatch is detected before asserting the match.
4. **A pointer re-pointed to a heading whose exact text differs** ("Version tab switching" vs "Version tab switching (editor)"). Pinned by Task 6's pointer assertions, which resolve each citation against the real heading set, plus the internal-anchor assertion (`CLAUDE.md:459`'s `#send-notification-modal` is the only one today).
5. **Encoding corruption introduced by the editing tool** — a BOM prepended, or CRLF flipped to LF, either of which rewrites the whole file in the diff and has happened before on 15 pages at once. Pinned by the `file` + `git diff --numstat` step in every task.

---

### Task 1: Move 4 — the four pipeline sections

**Files:**
- Modify: `CLAUDE.md` (remove 4 sections; add the `h-100` invariant line)
- Modify: `docs/pages/pipeline.md` (new `## Current state` section; re-point `:7`, `:19`, `:51`)
- Test: none (prose); proof steps below

**Interfaces:**
- Consumes: `$SNAP`, `secttool.py` (Global Constraints).
- Produces: the `## Current state` pattern that Tasks 2 and 3 repeat — `## Current state` immediately after the file preamble, moved sections as `###` sub-sections under their **present names**, dated cycle log following unchanged.

- [ ] **Step 1: Record the pre-move measurements**

Run: `python secttool.py list CLAUDE.md`
Expect: `Detail panel` 3,042 B · `Filter bar` 2,964 B · `Column header totals` 1,136 B · `Pipeline board layout` 2,417 B. Total 9,559 B. Note `wc -c CLAUDE.md` = 91,694.

- [ ] **Step 2: Insert the four sections into `docs/pages/pipeline.md`**

Add `## Current state` after the preamble (ends at the line beginning "Cross-cutting board-layout…"), then the four sections **in `CLAUDE.md`'s own order** — Pipeline board layout, Filter bar, Detail panel, Column header totals — each demoted from `###` to `###` (unchanged; they sit under a `##`). Bytes come from `secttool.py get`, never retyped.

- [ ] **Step 3: Remove the four sections from `CLAUDE.md`**

Delete exactly the extracted byte ranges. Leave in their place one `### Invariants` section carrying the single unpinned imperative, verbatim from the source: **"do NOT add `h-100` to the columns row"** plus its one-line reason (Bootstrap's `.h-100` is `height:100%!important`, overrides the flex sizing, can hide the column under `overflow:hidden`), and a pointer to `docs/pages/pipeline.md`'s `Current state`.

- [ ] **Step 4: Re-point the three inbound pointers in `docs/pages/pipeline.md`**

`:7` names "Pipeline board layout", "Detail panel", **"Column totals footer"** and "Filter bar" as living in `CLAUDE.md`; `:19` names "Filter bar"; `:51` names "Detail panel". Re-point all three at this file's own `Current state`. **"Column totals footer" is already dead** — renamed to "Column header totals" by the 2026-10-06 redesign — so correct it rather than carrying it over.

- [ ] **Step 5: Prove the move, with the vacuous-comparison guard**

For each of the four sections: assert `secttool.py get $SNAP "<name>"` is byte-identical to the corresponding block now in `docs/pages/pipeline.md`; **first** assert that comparing section *i* against section *j≠i* reports a mismatch, so the comparison is known capable of failing. Then the partition check: every byte of `$SNAP` is either still in `CLAUDE.md` or in a destination, exactly once — no gap, no duplication.
Expected: 4 matches, 1 deliberate mismatch detected, partition exact.

- [ ] **Step 6: Verify encoding and diff shape**

Run: `file CLAUDE.md docs/pages/pipeline.md` and `git diff --numstat`
Expected: both "UTF-8 text, with CRLF line terminators", no BOM; numstat shows bounded line counts, **not** a whole-file rewrite.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/pages/pipeline.md
git commit -m "docs: move the four pipeline sections to docs/pages/pipeline.md"
```

---

### Task 2: Move 4 — the two cost-grid sections

**Files:**
- Modify: `CLAUDE.md` (remove 2 sections)
- Modify: `docs/pages/costgrid.md` (new `## Current state`; re-point `:70`)
- Modify: `docs/js/costgrid.md` (re-point its "New Proposal / Clone" reference)

**Interfaces:**
- Consumes: Task 1's `## Current state` pattern.

- [ ] **Step 1: Record pre-move measurements**

Expect `New Proposal / Clone` 3,755 B, `Version tab switching` 2,276 B. Total 6,031 B.

- [ ] **Step 2: Insert both sections under a new `## Current state` in `docs/pages/costgrid.md`**

After the preamble, before `## Base state`. Order as in `CLAUDE.md`: Version tab switching, then New Proposal / Clone.

- [ ] **Step 3: Remove both sections from `CLAUDE.md`**

No invariant line is left behind: neither section carries an unpinned imperative. The `:where(.cg-grid) :where(th, td)` specificity rule the brief attributed to this move **is not in `CLAUDE.md`** — it is already in `docs/pages/costgrid.md:144` and `css/costgrid.css:418`. Do not add it.

- [ ] **Step 4: Re-point the two inbound pointers**

`docs/pages/costgrid.md:70` says "see this file's 'Version tab switching (editor)' entry in `CLAUDE.md`" — now an in-file reference. `docs/js/costgrid.md`'s "New Proposal / Clone" reference points at `docs/pages/costgrid.md`'s `Current state`. Also re-point `CLAUDE.md`'s own internal reference at `:370` (`showCostGridEditorView`, which cites "New Proposal / Clone" below it).

- [ ] **Step 5: Prove the move, with the vacuous-comparison guard**

As Task 1 Step 5, over both sections plus the running partition check.

- [ ] **Step 6: Verify encoding and diff shape** — as Task 1 Step 6.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/pages/costgrid.md docs/js/costgrid.md
git commit -m "docs: move the two cost-grid editor sections to docs/pages/costgrid.md"
```

---

### Task 3: Move 4 — the navigation section

**Files:**
- Modify: `CLAUDE.md` (remove 1 section; add the nav invariants)
- Modify: `docs/js/nav.md` (new `## Current state`; re-point its own references)

**Interfaces:**
- Consumes: Task 1's `## Current state` pattern.

- [ ] **Step 1: Record pre-move measurements**

Expect `Navigation: sidebar and icon navbar (2026-10-02, Navigation Cycle B2)` 5,029 B.

- [ ] **Step 2: Insert it under a new `## Current state` in `docs/js/nav.md`**

- [ ] **Step 3: Remove it from `CLAUDE.md`, leaving the unpinned invariants inline**

Append to the `### Invariants` section created in Task 1:
- **Never render a second navigation**, and the element-id contract: the ids consumed by `js/notifications.js` and the nav wiring (`#nav-notif-btn`, `#nav-account-btn`, `#nav-profile-btn`, `#nav-settings-btn`, `#nav-send-notif-btn`, `#nav-change-pwd-btn`, `#nav-logout-btn`, `#nav-notif-badge`, …), copied verbatim from the source section. **No guard test asserts this set** — verified: `nav-layout-guard.test.js` asserts CSS facts only, and the ids appear in `nav-model`/`nav-tooltip`/`notifications-ui` individually, never as a contract. So the list stays, it is not replaced by a test citation.
- Heights, z-index and the page-shell structural ban **cite** `js/lib/nav-layout-guard.test.js` and `js/lib/nav-shell-guard.test.js` instead of restating them.

- [ ] **Step 4: Re-point the inbound pointers**

`CLAUDE.md:165` (the `js/nav.js` File-structure entry) and `:249` (Routing step 1) both name "Navigation: sidebar and icon navbar" as a section below; `docs/js/nav.md` cites both it and "Pipeline board layout". Note `CLAUDE.md`'s `Page shell` section stays and keeps its own name — only the pointer target changes.

- [ ] **Step 5: Prove the move, with the vacuous-comparison guard** — as Task 1 Step 5.

- [ ] **Step 6: Verify encoding and diff shape** — as Task 1 Step 6.

- [ ] **Step 7: Run the nav guard tests, which read `CLAUDE.md`'s neighbours**

Run: `npx vitest run js/lib/nav-layout-guard.test.js js/lib/nav-shell-guard.test.js`
Expected: PASS (they assert CSS/HTML, so this confirms the move touched neither).

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md docs/js/nav.md
git commit -m "docs: move the Nav B2 sidebar section to docs/js/nav.md"
```

---

### Task 4: Move 5 — the DB migrations table

**Files:**
- Create: `docs/db/migrations.md`
- Modify: `CLAUDE.md` (table out; run command and the three rules that bite stay)
- Modify: `docs/api/currencies.md:19`, `ARCHITECTURE.md` (re-point)
- Modify: `.claude/skills/sync-docs/SKILL.md` §2 (the rule this move reverses)

**Interfaces:**
- Produces: `docs/db/` (new directory, single file, no `_README.md` — matches `docs/css/`, which is also a single-file directory).

- [ ] **Step 1: Record pre-move measurements** — expect `DB migrations` 8,333 B, 40 lines.

- [ ] **Step 2: Create `docs/db/migrations.md` with the table, verbatim**

A short hand-written preamble (what the file is, that migrations are applied by hand, a pointer back to `CLAUDE.md` for the run command), then the 28-row table moved byte-for-byte.

- [ ] **Step 3: Reduce the `CLAUDE.md` section to the parts that are acted on**

Keep, verbatim: the `docker exec -i pdash-db psql …` run command; the **two apply-once backfills** (`023_backfill_project_tags.sql`, `027_project_descriptions.sql`) with their warnings — a second run of either is destructive; and the note that `scripts/test-branch.sh up` **skips migrations** on an existing schema, so a branch stack lacks a new migration until it is applied by hand. Add the pointer to `docs/db/migrations.md`.

- [ ] **Step 4: Update the routing rule in `.claude/skills/sync-docs/SKILL.md` §2**

§2's last paragraph currently reads that "DB migrations and genuinely cross-cutting conventions … still belong in `CLAUDE.md`/`ARCHITECTURE.md` as before". Narrow it: migrations now live in `docs/db/migrations.md`; the cross-cutting conventions clause is unchanged. Read the file's **headings** to locate §2 — the numbers in this project's prose have shifted twice.

- [ ] **Step 5: Re-point `docs/api/currencies.md:19` and `ARCHITECTURE.md`**

Both say "see `CLAUDE.md` → 'DB migrations'".

- [ ] **Step 6: Prove the move, with the vacuous-comparison guard**

The moved table must be byte-identical to the table in `$SNAP`'s section (the section minus the retained command/rules, which stay). State the retained bytes explicitly so the partition check still balances.

- [ ] **Step 7: Verify encoding, diff shape, and the architecture guard**

Run: `file docs/db/migrations.md ARCHITECTURE.md`, `git diff --numstat`, then
`npx vitest run scripts/architecture-guard.test.js`
Expected: PASS — it asserts every migration-created table and added column is named in `ARCHITECTURE.md` §5, which this task must not disturb.

- [ ] **Step 8: Commit**

```bash
git add docs/db/migrations.md CLAUDE.md docs/api/currencies.md ARCHITECTURE.md .claude/skills/sync-docs/SKILL.md
git commit -m "docs: move the DB migrations table to docs/db/migrations.md"
```

---

### Task 5: Move 6 — the backup and full-recreation procedure

**Files:**
- Create: `docs/ops/database.md`
- Modify: `CLAUDE.md` (procedure out, pointer in; `Infrastructure safety` untouched)
- Modify: `.claude/commands/finish-cycle.md` (re-point), `.claude/skills/sync-docs/SKILL.md` §2

- [ ] **Step 1: Record pre-move measurements** — expect `Database backup & full recreation` 6,940 B, 71 lines.

- [ ] **Step 2: Create `docs/ops/database.md` with the procedure, verbatim**

Includes, moved **with** the procedure because they are properties of the command rather than free-standing rules: one piped `psql` session not one `docker exec` per file; `-v ON_ERROR_STOP=1`; the `\echo applying …` marker in its `printf '%s\n'` form plus the trailing newline. Splitting these from the command would leave both halves unusable.

- [ ] **Step 3: Replace the `CLAUDE.md` section with a pointer**

One or two lines: `scripts/backup-db.sh` is the backup entry point, `/finish-cycle` Gate 4 runs it automatically, full procedure in `docs/ops/database.md`.

- [ ] **Step 4: Confirm `Infrastructure safety` is byte-identical to `$SNAP`**

Not a judgement call — assert it. It is the one section this cycle must not touch.

- [ ] **Step 5: Re-point `.claude/commands/finish-cycle.md` and update `sync-docs` §2**

- [ ] **Step 6: Prove the move, with the vacuous-comparison guard** — as Task 4 Step 6.

- [ ] **Step 7: Verify encoding and diff shape** — as Task 1 Step 6.

- [ ] **Step 8: Commit**

```bash
git add docs/ops/database.md CLAUDE.md .claude/commands/finish-cycle.md .claude/skills/sync-docs/SKILL.md
git commit -m "docs: move the DB backup and recreation procedure to docs/ops/database.md"
```

---

### Task 6: The guard — `scripts/claude-md-guard.test.js`

Written last, deliberately: it pins the **final** measured state, and its pointer assertions would fail mid-move while sections are in flight. Same order as cycle 5, where the §6 fixes (`660ae1e`) preceded the guard (`3bc4428`).

**Files:**
- Create: `scripts/claude-md-guard.test.js` (picked up by `vitest.config.js`'s existing `scripts/**/*.test.js` — no config change)

**Interfaces:**
- Consumes: the final `CLAUDE.md`, the `File structure` fenced block, and the live `docs/` tree.

- [ ] **Step 1: Measure the final state** — `wc -c CLAUDE.md`, the block's byte count, and the count of block entries longer than 2 lines (13 before this cycle; re-measure, since Task 4 and Task 5 edit entries).

- [ ] **Step 2: Write the guard with the measured values, and a header naming its limits**

Assertions:
- `CLAUDE.md` ≤ **64,000 B** (ceiling, ~5 KB headroom over the expected ~59 KB).
- the `File structure` block's byte count — **exact**.
- the number of block entries over 2 lines — **exact**.
- every `docs/…` path cited in `CLAUDE.md` exists on disk.
- every `#anchor` link in `CLAUDE.md` resolves to one of its own headings.
- every "see `CLAUDE.md`'s «X»" in a **live** `docs/` file (i.e. excluding `docs/superpowers/`) names a heading that exists.

Exact pins, not floors: cycle 3's first version used a 797-case floor and let nine cases vanish with the suite green.

Header must name the limits, per `architecture-guard.test.js`'s convention: `docs/superpowers/` excluded by design; the pointer check proves a heading *exists*, never that the pointer is *apt*; the size check cannot judge whether an entry's content belongs in the block.

- [ ] **Step 3: Watch it fail, once per assertion group**

Inject, run, revert, one at a time: (a) pad `CLAUDE.md` past 64,000 B; (b) add a 14th over-length block entry; (c) point a live `docs/` file at a `CLAUDE.md` heading that does not exist.
Expected: a named failure each time, identifying the file and the defect. A guard never seen failing is not verified.

- [ ] **Step 4: Name the guard in `.claude/skills/sync-docs/SKILL.md` §2**

One clause: the size and pointer limits are enforced by `scripts/claude-md-guard.test.js`, so a `/sync-docs` run that grows an entry past the rule now fails `npm test` instead of relying on the author noticing. This is spec acceptance criterion 6 and the only thing that connects the rule to its enforcement.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 46 files pass (45 baseline + this one), 0 failures.

- [ ] **Step 6: Commit**

```bash
git add scripts/claude-md-guard.test.js .claude/skills/sync-docs/SKILL.md
git commit -m "test: guard CLAUDE.md against regrowth and dangling pointers"
```

---

### Task 7: Final accounting against the spec's acceptance criteria

- [ ] **Step 1: Global partition proof**

Every byte of `$SNAP` is accounted for exactly once across the final `CLAUDE.md` and the five destinations, or is in the explicitly-listed retained/rewritten residue. Report the three numbers: moved, retained, hand-written.

- [ ] **Step 2: Check each of the spec's six acceptance criteria and report pass/fail with the measured number**

Criterion 1's band is 55,000–62,000 B. Criterion 4 includes `git diff --name-only main...HEAD` showing **nothing** under `docs/superpowers/` except this cycle's own spec, plan and report.

- [ ] **Step 3: Report any criterion not met as not met**

An unmet criterion is restated, not quietly reworded — the cycle-2 precedent. No commit; this task's output is the input to `/finish-cycle`'s report.
