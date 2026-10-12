# `PROCESS.md` self-description restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make `PROCESS.md` describe itself correctly — §1's `/finish-cycle` row matches the command's real gates, and §6 has one followable numbering scheme — moving sentences rather than rewriting them.

**Architecture:** four editing tasks on three prose files (`docs/superpowers/PROCESS.md`, `CLAUDE.md`, `.claude/commands/finish-cycle.md`), each followed by a mechanical fidelity check. The check is a throwaway Node script in the scratchpad that compares the **normalised non-empty line multiset** of `PROCESS.md` before and after, so that renumbering and heading promotion do not register as differences and any silent rewording does. Task 1 builds and validates that script against a known-good and a known-bad input before any editing starts; Tasks 2-4 each edit and re-run it; Task 5 does the cross-cutting citation sweep and assembles the itemised exception list the report must carry.

**Tech Stack:** Markdown prose; Node 24 (host) for the throwaway script; `npm test` (vitest) for the committed guards.

**Spec:** `docs/superpowers/specs/2026-10-12-process-md-self-description-design.md`

## Global Constraints

- **Nothing is reworded.** A sentence either survives normalisation-identical or it appears in the itemised exception list with one line of rationale. No rule "said better", no dated passage compressed, no lesson from current experience added.
- **No code file is touched and no test is committed.** The fidelity script lives in the scratchpad and never enters the repo.
- **No `## N` section number beyond 6 changes**, and no existing section number changes meaning (`sync-docs` SKILL.md:55).
- **`## 4b. Guardie meccaniche` is not moved and not renumbered.** The collision with `### 6.4b` is closed by the citation rule of spec §3.2.
- All user-facing app text stays English; `PROCESS.md` itself is and stays Italian.
- The cycle's classification is whatever `node scripts/classify-cycle.mjs` says at Gate 2 — no task asserts it.

## Review Focus

Five things the per-task checks do not exercise, most likely first:

1. **Citation forms without `§`.** The sweep greps `§6`, but `PROCESS.md:167` says "**punto 4b**" with no `§` and no `6`, and the audit cites "PROCESS.md 6.6.5" the same way. Task 5 step 2 greps `punto 4[bc]`, `PROCESS(\.md)? [0-9]`, `sezione 6` as well, and `PROCESS.md:167` is in Task 4's edit list because of it.
2. **A raw `|` in the new §1 cell** would silently split the table into extra columns. Task 3 step 3 checks the cell for `|` outside its two delimiters.
3. **`<br>` is a form this file uses nowhere else.** Nothing in `npm test` renders Markdown. Task 3 step 4 is a human read of the rendered table — the only check that can catch a cell that parses but reads badly.
4. **`CLAUDE.md`'s guard pins.** `scripts/claude-md-guard.test.js` pins the File structure block at exactly 13,156 LF bytes and the whole file at ≤ 64,000 B. `CLAUDE.md:58` is in "Testing & tooling", outside the fenced block, and the edit shortens the file — so both pins should hold, but Task 4 step 4 runs `npm test` rather than assuming it.
5. **Archival documents must stay stale.** `docs/superpowers/{audits,briefs,plans,reports,specs}/` records what was true when written, and `claude-md-guard` excludes them from its pointer check for exactly that reason. The sweep will list dozens of hits there; Task 5 step 3 states explicitly that none of them is edited.

---

### Task 1: the fidelity script, validated before it is trusted

**Files:**
- Create: `<scratchpad>/fidelity.mjs` (throwaway, never committed)
- Create: `<scratchpad>/PROCESS.before.md` (baseline copy)

**Interfaces:**
- Produces: `node <scratchpad>/fidelity.mjs <before> <after>` → prints `-- only in BEFORE (n)` and `-- only in AFTER (n)` with one normalised line each. Tasks 2-4 each call it with the baseline as `<before>` and the working `docs/superpowers/PROCESS.md` as `<after>`.

- [ ] **Step 1: take the baseline**

`$SCRATCH` below is this session's scratchpad directory (the one named in the environment preamble); every path under it is throwaway and must stay outside the repo.

```bash
cp docs/superpowers/PROCESS.md "$SCRATCH/PROCESS.before.md"
```

- [ ] **Step 2: write the script**

Normalisation order matters: strip the leading `#`s first, then the `**`, then the leading numbering token — otherwise `**4. Titolo**` keeps its `**` and the number regex misses. The three points whose body sits on the title line (`6.4`, `6.4b`, `6.4c`) are re-joined in the AFTER pass with `". "`, which is exactly the 1:1 map the spec promises; the list is hardcoded, not inferred.

```js
import { readFileSync } from 'node:fs';
const SPLIT = ['6.4', '6.4b', '6.4c'];   // the only heading-plus-body re-joins
const norm = s => s
  .replace(/^#+\s*/, '')
  .replace(/\*\*/g, '')
  .replace(/^[0-9]+(\.[0-9]+)*[a-z]?\.?\s+/, '')
  .replace(/\s+/g, ' ')
  .replace(/\.$/, '')
  .trim();
function lines(file) {
  const raw = readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i].match(/^#{3,4}\s+(6\.[0-9a-z.]*)\s/);
    if (m && SPLIT.includes(m[1])) {
      let j = i + 1;
      while (j < raw.length && raw[j].trim() === '') j++;
      out.push(norm(raw[i]) + '. ' + norm(raw[j]));
      i = j;
      continue;
    }
    const n = norm(raw[i]);
    if (n !== '') out.push(n);
  }
  return out;
}
const count = a => a.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
const [b, a] = process.argv.slice(2).map(f => count(lines(f)));
const diff = (x, y) => [...x].flatMap(([l, n]) => Array(Math.max(0, n - (y.get(l) || 0))).fill(l));
for (const [label, d] of [['BEFORE', diff(b, a)], ['AFTER', diff(a, b)]]) {
  console.log(`-- only in ${label} (${d.length}):`);
  d.forEach(l => console.log('   ' + l.slice(0, 160)));
}
```

- [ ] **Step 3: positive control — the script says "nothing changed" on an unchanged file**

Run: `node "$SCRATCH/fidelity.mjs" "$SCRATCH/PROCESS.before.md" docs/superpowers/PROCESS.md`
Expected: `only in BEFORE (0)` and `only in AFTER (0)`. If either is non-zero, the normalisation is wrong — fix it before editing anything.

- [ ] **Step 4: negative control — the script catches a reworded sentence**

Copy the baseline, change one word in any body sentence, run the script against it.
Expected: exactly one line in each list. A script that cannot fail proves nothing, which is the whole reason this step exists.

- [ ] **Step 5: no commit**

Nothing from this task enters the repo. Record in the cycle notes that both controls passed.

---

### Task 2: §6's numbering scheme

**Files:**
- Modify: `docs/superpowers/PROCESS.md` — the heading map of spec §3.1 (`:135`, `:142`, `:147`, `:153`, `:155`, `:162`, `:172`, `:178`, `:182`, `:187`, `:192`, `:196`, `:203`) and the `---` at `:176`

**Interfaces:**
- Consumes: Task 1's script.
- Produces: the headings `### 6.1`…`### 6.5` (with `6.4b`, `6.4c`), `### 6.6`, and `#### 6.6.1`…`#### 6.6.5`, which Tasks 3-5 cite.

- [ ] **Step 1: apply the 1:1 heading map exactly as spec §3.1 tabulates it**

Thirteen lines. The title text is copied character for character; only the leading `**N.` / `## ` marker and the trailing full stop change. For `6.4`, `6.4b` and `6.4c` the body moves to its own line below the heading, with a blank line between.

- [ ] **Step 2: remove the `---` at `:176`**

It separated §6 from `## 6.6`; with §6.6 inside §6 it would close the section one subsection early. The `---` before `## 7.` stays.

- [ ] **Step 3: run the fidelity check**

Run: `node "$SCRATCH/fidelity.mjs" "$SCRATCH/PROCESS.before.md" docs/superpowers/PROCESS.md`
Expected: `only in BEFORE (1)` — the `---` — and `only in AFTER (0)`. Any other line in either list is a rewording introduced by this task: revert it to the baseline's wording rather than arguing for the new one.

- [ ] **Step 4: check every `§6.x` citation now resolves to a heading**

Run: `grep -nE "^#{2,4} 6" docs/superpowers/PROCESS.md`
Expected: `## 6.`, `### 6.1`, `### 6.2`, `### 6.3`, `### 6.4`, `### 6.4b`, `### 6.4c`, `### 6.5`, `### 6.6`, `#### 6.6.1`…`#### 6.6.5` — and nothing else beginning `## 6.6`.

- [ ] **Step 5: commit**

```bash
git add docs/superpowers/PROCESS.md
git commit -m "docs: one numbering scheme for PROCESS.md section 6 (F8)"
```

---

### Task 3: §1's `/finish-cycle` row

**Files:**
- Modify: `docs/superpowers/PROCESS.md:26`

**Interfaces:**
- Consumes: Task 2's `§6.4` / `§6.4b` headings, which the new cell cites.

- [ ] **Step 1: replace the row with the verbatim cell from spec §3.3**

The replacement text is fixed by the spec — copy it, do not re-compose it. It is one line: the bullets are `<br>`-separated, not real newlines.

- [ ] **Step 2: run the fidelity check**

Run: `node "$SCRATCH/fidelity.mjs" "$SCRATCH/PROCESS.before.md" docs/superpowers/PROCESS.md`
Expected: `only in BEFORE (2)` — the `---` and the old row — and `only in AFTER (1)` — the new row. Nothing else: this task must not touch the three `Nota —` blocks or any other row of the table.

- [ ] **Step 3: check the cell cannot break the table**

Run: `sed -n '26p' docs/superpowers/PROCESS.md | grep -o "|" | wc -l`
Expected: `3` — the row's opening, middle and closing delimiters. Any higher count means the cell body contains a raw `|`, which would silently add columns.

- [ ] **Step 4: read the rendered table once**

Open `PROCESS.md` §1 in a Markdown preview (or GitHub after push) and read the row. Nothing in `npm test` renders Markdown, and `<br>` is a form this file uses nowhere else. Expected: six bullets, one per gate, in Gate 1→6 order, with no stray `<br>` text showing as literal.

- [ ] **Step 5: commit**

```bash
git add docs/superpowers/PROCESS.md
git commit -m "docs: section 1 describes finish-cycle's real gates (F7)"
```

---

### Task 4: the citation rule and the `§6 4c` forms inside the two live documents

**Files:**
- Modify: `docs/superpowers/PROCESS.md` — the introductory block (new sentence), `:116`, `:167`, `:170`
- Modify: `CLAUDE.md:58`
- Modify: `.claude/commands/finish-cycle.md:30`

**Interfaces:**
- Consumes: Task 2's headings.

- [ ] **Step 1: add the citation rule to the introductory block**

One sentence, in the blockquote at the top of `PROCESS.md`, saying that a reference to a section of this document is always written in full — `§4b` for the top-level section, `§6.4b` for the point inside §6 — and never as a bare "4b". This is the only sentence this cycle adds to the file.

- [ ] **Step 2: convert the citation forms**

`§6 4c` → `§6.4c` at `PROCESS.md:116` and `:170`, at `finish-cycle.md:30` ("§6 point 4c"), and at `CLAUDE.md:58` ("§6 point 4c"). Plus **`PROCESS.md:167`'s "punto 4b" → `§6.4b`** — a fifth occurrence, in a form the spec's list does not carry, found by the wider grep of Review Focus 1.

- [ ] **Step 3: run the fidelity check**

Run: `node "$SCRATCH/fidelity.mjs" "$SCRATCH/PROCESS.before.md" docs/superpowers/PROCESS.md`
Expected: `only in BEFORE (5)` — `---`, the old §1 row, `:116`, `:167`, `:170` — and `only in AFTER (5)` — the new §1 row, the new `:116`/`:167`/`:170`, and the citation-rule sentence. This is the complete exception list; if it is longer, something was reworded.

- [ ] **Step 4: run the committed guards**

Run: `npm test`
Expected: green. `scripts/claude-md-guard.test.js` pins the File structure block at exactly 13,156 LF bytes and the file at ≤ 64,000 B — `CLAUDE.md:58` sits outside the fenced block and the edit shortens the file, so both should hold. **If a pin goes red, stop and escalate** rather than editing the pin: changing a number in a test file would make this a code cycle and is outside this plan's scope.

- [ ] **Step 5: commit**

```bash
git add docs/superpowers/PROCESS.md CLAUDE.md .claude/commands/finish-cycle.md
git commit -m "docs: one citation form for PROCESS.md's sections"
```

---

### Task 5: the repo-wide sweep and the report's exception list

**Files:**
- Read-only sweep over the repo; no file is modified unless the sweep finds a live pointer the earlier tasks missed.

- [ ] **Step 1: re-derive the `§6` citation list**

Run: `grep -rn "§6" --include=*.md . | grep -v node_modules`
Expected: every hit is one of — a heading or body line in `PROCESS.md`; a `§6.N` form in `finish-cycle.md`, `CLAUDE.md`, `docs/handoff-ciclo*.md`, `docs/pages/costgrid.md`, `docs/pages/portfolio.md`, `docs/scripts/shoot.md` that resolves to a heading from Task 2 step 4; a **PRD** section reference in `PRD.md`, `docs/prd/**` or `.claude/skills/operational-manual/SKILL.md` (not this document's §6 — do not touch); or an archival hit under `docs/superpowers/`. No `§6 4c` form survives anywhere outside `docs/superpowers/`.

- [ ] **Step 2: sweep the forms that carry no `§`**

Run: `grep -rniE "punto 4[bc]|PROCESS(\.md)? [0-9]+\.[0-9]|sezione 6" --include=*.md . | grep -v node_modules`
Expected: no hit in a live document — only archival hits under `docs/superpowers/`. `PROCESS.md:167` was the one live hit and Task 4 converted it.

- [ ] **Step 3: assemble the exception list for the report**

Five items, each with one line of rationale: the removed `---` (`:176`), §1's row (`:26`), `:116`, `:167`, `:170`, plus the added citation-rule sentence — and the statement that every other normalised line of the file is byte-identical, with the script's final output pasted in. State explicitly that no document under `docs/superpowers/` was edited, and that the archival hits of steps 1-2 are left stale on purpose.

- [ ] **Step 4: final check**

Run: `npm test` and `node "$SCRATCH/fidelity.mjs" "$SCRATCH/PROCESS.before.md" docs/superpowers/PROCESS.md`
Expected: green, and the same 5/5 diff as Task 4 step 3.

- [ ] **Step 5: commit (only if step 1 or 2 forced an edit)**

```bash
git add -A
git commit -m "docs: finish the section-citation sweep"
```

Otherwise this task commits nothing; its deliverable is the exception list, which travels to `/finish-cycle` Gate 5's report.
