# Tracked backlog for cycle follow-ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/finish-cycle`'s report from a register of accepted follow-ups into a tracked backlog, so an open item stops depending on someone remembering it.

**Architecture:** One new markdown file, `docs/BACKLOG.md`, holding one table row per open item with the command that verified its state. One new step in Gate 5 of `/finish-cycle` writes rows on every closeout. No new guard and no `CLAUDE.md` index line — both excluded on measurement, see the spec.

**Tech Stack:** Markdown only. The existing `scripts/doc-paths-guard.test.js` provides the one mechanical check (every repo-rooted path cited in a live `docs/` file must resolve), reached for free by placing the file at `docs/BACKLOG.md`.

**Spec:** `docs/superpowers/specs/2026-10-13-backlog-follow-up-design.md`

## Global Constraints

- The file lives at `docs/BACKLOG.md` exactly — not under `docs/superpowers/`, which `scripts/lib/live-docs.mjs` lists in `SKIP_DIRS`.
- No change to `CLAUDE.md`. Its ceiling headroom is 415 B and the File structure block is pinned exactly at 13,399 B.
- No new `scripts/*-guard.test.js`.
- No pinned number in any existing test may be altered. `npm test` must end green at 1016 tests.
- Paths in the table are written as a bare backticked path with the line number **outside** it — `` `api/src/routes/cost-grids.js` line 58 `` — because the guard's matcher requires a closing backtick immediately after the extension.
- Every row's `Verified how` cell names a command or observation **and** a date. A row without it is not triaged.
- Triage covers the 21 October reports with a non-empty follow-ups section. Earlier reports are declared untriaged in the file header, not silently omitted.
- All user-facing text in English (`CLAUDE.md`, Language constraint). The file is developer documentation, but the rule is project-wide for written artefacts.

## Review Focus

Five failure modes the spec implies that no task's checks exercise. Each gets a line in `docs/BACKLOG.md`'s own header, in Task 1, since there is no code to test them against:

1. **A row written as `` `path.js:58` ``** — the guard's matcher silently does not match it, so the path is never validated and the row looks checked when it is not.
2. **A row citing a root-level file** (`costgrid.html`, `index.html`) — `ROOTED` requires a top-level directory as the first segment, so these are never validated however they are written.
3. **A row marked `closed` from reading a report** rather than re-checking the code — nothing mechanical can distinguish it from a verified close, and it is the exact defect the `Verified how` column exists to expose.
4. **A reused or duplicated `B-NNN` id** — nothing checks uniqueness; two rows sharing an id make "which item did we close" unanswerable.
5. **A closeout with zero accepted follow-ups** — the new Gate 5 step must have a defined no-op, or an executor will either invent a row or silently skip the step and leave no trace that it ran.

---

### Task 1: Create `docs/BACKLOG.md` with its header and the rows this cycle can verify first-hand

**Files:**
- Create: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the table's column order and the `B-NNN` id format, both of which Task 2 appends to and Task 3's Gate 5 step writes into. Columns, in order: `ID | Origin | What | Where | State | Verified how`.

- [ ] **Step 1: Write the file header**

It states, in this order: what the file is for; that a row's `State` is only as good as its `Verified how` cell; the five Review Focus items above as written rules (the `path:line` form, root-level files, closing from a report, id reuse, the zero-follow-up no-op); and that **reports before 2026-10-01 are not triaged**.

- [ ] **Step 2: Add the three follow-ups from the cycle just closed**

From `docs/superpowers/reports/2026-10-13-m3-m2-process-dedup-finish-cycle.md`, its "Code review follow-ups" section: the services row of the sync-docs routing table; the precedence rule not breaking a two-non-pattern-row tie; and `claude-md-guard`'s 120-character bold cap against one-directional `startsWith`. State `open`, verified by this cycle's own review.

- [ ] **Step 3: Add the six items of `2026-10-07-…-proposal-create-clone-direct`, each with a verdict**

Three were verified while writing the spec — dead Vue data at `costgrid.html` line 832 (`open`), `hasPublishedVersion` duplicated in `` `api/src/routes/cost-grids.js` `` (`open`), the `CLAUDE.md` Clone description (`closed`). **The other three carry no verdict yet**: verify each against the working tree now and record the command used. Do not copy a state from the report.

- [ ] **Step 4: Verify every cited path resolves**

Run: `npx vitest run scripts/doc-paths-guard.test.js`
Expected: PASS. A failure names the unresolvable path — fix the path, never the allowlist.

- [ ] **Step 5: Confirm the guard actually sees the new file**

Run: `npx vitest run scripts/doc-paths-guard.test.js --reporter=verbose`
Expected: `docs/BACKLOG.md` appears in the per-file test list. If it does not, the file is in the wrong directory and the first Global Constraint is unmet — a green run proves nothing about a file the walk never reached.

- [ ] **Step 6: Commit**

```bash
git add docs/BACKLOG.md
git commit -m "docs: open the cycle follow-up backlog, with the rows this cycle verified"
```

---

### Task 2: Triage the remaining October reports into rows

**Files:**
- Modify: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: Task 1's column order and id format; the next free `B-NNN`.
- Produces: the complete October triage, which Task 3's header sentence refers to.

- [ ] **Step 1: List the reports still to triage**

Run:
```bash
for f in docs/superpowers/reports/2026-10-*.md; do \
  sed -n '/## Code review follow-ups/,/^## /p' "$f" | grep -qE '^\s*([-*]|[0-9]+\.) ' && echo "$f"; done
```
Expected: 23 paths. (The first version of this command matched `[-*]` only and returned 21, silently excluding two reports whose follow-ups are numbered `1.`-`8.` and `1.`-`3.` — 10 accepted, unfixed items. Corrected after the whole-branch review caught it.) Two are already done (Task 1 handled this cycle's own and the `proposal-create-clone-direct` one), leaving 19.

- [ ] **Step 2: Separate the sections that record only fixes**

For each remaining report, read the follow-ups section. A section whose bullets all record findings **fixed or rejected within that cycle** has nothing open — the `claudemd-split` report is the worked example, 17 findings across four rounds, 16 fixed and one rejected. Record such reports in the file header's triaged list with "nothing open", and do not create rows for them.

- [ ] **Step 3: For every surviving item, verify against the working tree and write a row**

The verdict comes from the repository, never from the report's own wording. Each row's `Verified how` cell carries the command run and today's date. An item whose state cannot be established by a command gets `State: open` and a `Verified how` of "unverified — needs reading `<path>`", which is an honest state, not a placeholder.

- [ ] **Step 4: Run the documentation guards**

Run: `npx vitest run scripts/`
Expected: PASS, with no pinned number changed.

- [ ] **Step 5: Commit**

```bash
git add docs/BACKLOG.md
git commit -m "docs: triage the October reports into the backlog"
```

---

### Task 3: Make Gate 5 populate the backlog on every closeout

**Files:**
- Modify: `.claude/commands/finish-cycle.md` (Gate 5, a new step `2b.` between steps 2 and 3)
- Modify: `docs/superpowers/PROCESS.md` (§1's `/finish-cycle` row, the Gate 5 bullet)

**Interfaces:**
- Consumes: Task 1's column order and id format — the step tells an executor what a row must contain by pointing at `docs/BACKLOG.md`'s own header, not by restating it.
- Produces: nothing later tasks use.

- [ ] **Step 1: Add Gate 5 step `2b.`**

Numbered `2b.`, not inserted as a new `3.` — the file already uses `0b.` at Gate 3, and renumbering would break three live references to "Gate 5 step 3" (`.claude/commands/finish-cycle.md` lines 16 and 93, `docs/superpowers/PROCESS.md` line 148). Placing it before step 3 means the blocking `npm test` validates the new rows' paths in the same run.

Content: for each follow-up this cycle accepted, append a row; for each existing row this cycle closed, set `closed <date>` with the command that verified it. Not a judgement gate, does not ask — it records what Gate 3 already decided. **On a cycle with no accepted follow-ups and nothing closed, say so in one line and change no file** — that is the defined no-op, so a skipped step and a quiet step are distinguishable.

- [ ] **Step 2: Check the three references still resolve**

Run: `grep -rn "Gate 5 step 3" --include=*.md .claude/ docs/superpowers/PROCESS.md`
Expected: 3 hits, all still pointing at the blocking `npm test` step.

- [ ] **Step 3: Update `PROCESS.md` §1's Gate 5 bullet**

Add the new step to the bullet's existing arrow sequence, between the report and the blocking `npm test`. One clause, matching the bullet's established style. This is the §7 gate's condition 3 — a change to a `/finish-cycle` gate — so the cycle's report must name that condition.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS at 1016 tests, no pin altered.

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/finish-cycle.md docs/superpowers/PROCESS.md
git commit -m "process: Gate 5 populates the follow-up backlog"
```

## Decisioni aperte

1. **The new Gate 5 step is numbered `2b.`, not inserted as a new `3.`** Alternativa scartata: inserting it as step 3 and renumbering 3-6 to 4-7. Perché: three live references to "Gate 5 step 3" would break, in forms a grep for the new numbers cannot find; the file already uses `0b.` at Gate 3, so the lettered form is its own convention, not an invention. This decision was taken while writing the plan and was not in the spec's ledger.
2. **The step runs before the blocking `npm test`, not after.** Alternativa scartata: placing it after, closer to the diff. Perché: `doc-paths-guard` then validates the new rows' paths inside the same blocking run, so a bad reference stops the push instead of reaching `main`.
3. **The zero-follow-up case is a declared no-op that writes nothing.** Alternativa scartata: writing a "nothing this cycle" line into the backlog. Perché: a tracker that accumulates one empty line per cycle stops being readable, which is the failure the memory backlog already shows.
4. **Triage records "nothing open" reports in the file header, not as rows.** Alternativa scartata: a `closed`-state row per such report. Perché: those findings were never open after their own cycle; rows for them would be contemporaneous noise against the handful of items that matter.
5. **The plan updates `PROCESS.md` §1, which the spec does not mention.** Alternativa scartata: leaving
   §1's Gate 5 bullet describing a sequence the gate no longer runs. Perché: the spec specified the
   command change and stopped there, but `/sync-docs`'s own gate condition 3 makes a `/finish-cycle`
   gate change material for `PROCESS.md` — so omitting it would fail the gate this very cycle restored.
   Surfaced here rather than taken silently.
6. **An item whose state cannot be established gets `open` with an explicit "unverified" note.** Alternativa scartata: leaving it out of the file until someone can check it. Perché: silent omission is how the 37 untracked reports happened; an honest unknown is trackable, an absence is not.
