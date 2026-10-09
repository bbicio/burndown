# PRD.md slim + split, ARCHITECTURE.md tree enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 91 lines of duplicated developer-facing material from `PRD.md`, split the remainder into nine page-aligned `docs/prd/` files, enforce `/sync-docs` §1's routing rule on `ARCHITECTURE.md`'s 148-line directory tree, and update `/sync-docs` §5/§5b plus `operational-manual`'s inlined reference in the same cycle.

**Architecture:** Pure documentation restructuring. Every content move is byte-for-byte and is *proved* so by a diff against the pre-move file extracted from git, not asserted. Section boundaries are found by heading match (`## 4.` … `## 5.`), never by hardcoded line numbers, because Tasks 1–2 shift every line number below them.

**Tech Stack:** Markdown. Bash for the verification harness (`git show`, `awk`, `diff`, `grep`). `node scripts/classify-cycle.mjs` for the gate classification. `npm test` at Gate 1.

**Spec:** `docs/superpowers/specs/2026-10-09-prd-slim-split-design.md`

## Global Constraints

- **No-code cycle.** Every path in the diff must be a `.md` under `docs/`, a `.md` under `.claude/`, or a root `*.md`. **One path outside flips the cycle to ordinary** and makes browser verification mandatory. Verified by `node scripts/classify-cycle.mjs` printing `no-code` as its first stdout line.
- **The verification harness is never committed.** All scratch files (`prd-base.md`, extracted ranges, diffs) live in the session scratchpad directory. A `.sh`/`.mjs` helper committed under `scripts/` would itself flip the classification.
- **Do NOT regenerate `docs/OPERATIONAL_MANUAL.html`.** It is `.html` under `docs/` and does not qualify. Regeneration stays on-request.
- **Verbatim is the contract.** The *complete* list of permitted content edits in the PRD half of this cycle: the three §3 corrections (Task 2), the `(see §12.1)` removal (Task 1), the `PRD.md` index table (Task 3), and the two-line header of each area file (Task 3). Anything else encountered — awkward prose, a dated parenthetical, a claim that looks wrong — is **recorded in the cycle report, not rewritten**.
- **No PowerShell `Get-Content`/`Set-Content`** on any repo file: it prepends a BOM. Use the `Edit`/`Write` tools.
- **Section numbering is preserved, gaps included.** §12 and §14 leave gaps. Never renumber.
- **Target:** `PRD.md` 968 → ~59 lines + index; `ARCHITECTURE.md` tree fence 148 → ≤ 80 content lines.

## Review Focus

1. **A cross-file `§N` reference that cannot be resolved.** The PRD has 60+ intra-document `§N` citations and the split makes many of them cross-file (`§4`→`§7.7`/`§7.1`, `§16`→`§4.9`/`§7.5`/`§18.1`, `§17`→`§16.4`, `§18`→`§16.6`). A reader given "see §7.7" must be able to find which file holds it. Pinned by Task 3 Step 6: the index is a §-number → file lookup, and **every distinct `§N` cited anywhere in `PRD.md` or `docs/prd/` must resolve to a section the index accounts for.**
2. **A byte-identity check that passes vacuously.** An extraction whose heading pattern misses (a typo in `## 4\.`, a heading that moved) yields an *empty* file, and `diff` of two empty files passes. Pinned by Task 3 Step 4: every extraction asserts a **non-zero, expected line count** before the diff is trusted.
3. **Narrative truncated out of the ARCHITECTURE tree that exists in no `docs/` file.** `/sync-docs` §1's routing rule says move-then-truncate and reuse-before-duplicate; truncating first loses the only copy. Pinned by Tasks 4–6 Step 2: for each entry, confirm the destination `docs/` file contains the fact *before* shortening the entry.
4. **A BOM or a stray file in the worktree.** A BOM shows as a whole-file rewrite in `numstat`; a stray `.orig`/`.bak`/helper script flips the classification. Pinned by Task 9 Steps 2–3.
5. **A `?v=N` claim re-introduced, or a real one deleted from its owner.** The tree's three wrong claims are removed, but `CLAUDE.md`'s Cache-busting section and `js/lib/foundations-guard.test.js` must remain the owners and must still pass. Pinned by Task 9 Step 1 (`npm test`) and Task 4 Step 4 (`grep -c '?v=' ` on the tree returns 0).

---

## Prerequisite: worktree

Create the isolated worktree before Task 1 (`superpowers:using-git-worktrees`). Then, in it:

- Copy `.env` from the main checkout (gitignored; `shoot.mjs`/`test-branch.sh` need it — see memory `feedback_worktree_env_file`). Not needed for this cycle's verification, but `npm ci` is.
- Run `npm ci` once (a fresh worktree has no `node_modules`; host Node is 24, so `npm test` runs natively in ~48 s).
- Confirm the spec commit `bf7e003` is present: `git log --oneline -1 -- docs/superpowers/specs/2026-10-09-prd-slim-split-design.md`.

Set `S` to this session's scratchpad directory once and reuse it in every task (`mkdir -p "$S"` first). It must be the scratchpad, not the repo — a scratch file inside the worktree flips the classification (Review Focus 4).

---

## Task 1: Delete §12 Data Model and §14 Design System

**Files:**
- Modify: `PRD.md` (§12 at lines 651–725, §14 at lines 740–755, and the `(see §12.1)` reference in §13's Persistence row at line 731)

**Interfaces:**
- Consumes: nothing.
- Produces: a `PRD.md` of 877 lines with no §12 and no §14, which Task 2 edits and Task 3 splits.

- [ ] **Step 1: Capture the baseline**

```bash
git show HEAD:PRD.md > "$S/prd-00-base.md"
wc -l < "$S/prd-00-base.md"   # expect 968
```

- [ ] **Step 2: Delete §12**

Remove from the `## 12. Data Model` heading through the `---` separator that closes it, i.e. everything before `## 13. Non-Functional Requirements`. Use `Edit`.

- [ ] **Step 3: Delete §14**

Remove from `## 14. Design System` through its closing `---`, i.e. everything before `## 15. Authentication`.

- [ ] **Step 4: Remove the dangling `(see §12.1)`**

In §13's Persistence row, delete only the parenthetical `(see §12.1)`. The surrounding clause already states the fact it pointed at ("localStorage holds only client-side settings, not server data") — do not reword anything around it.

- [ ] **Step 5: Verify the deletion is exactly 91 lines and nothing else changed**

```bash
wc -l < PRD.md                                    # expect 877
grep -c '^## 12\.\|^## 14\.' PRD.md               # expect 0
grep -n '§12\|§14' PRD.md                         # expect no output
git diff --numstat PRD.md                         # expect 1 insertion, 92 deletions
```
The one insertion is §13's Persistence row, rewritten without its parenthetical. Any other insertion means prose was touched: revert and redo.

- [ ] **Step 6: Commit**

```bash
git add PRD.md
git commit -m "docs: remove PRD §12 Data Model and §14 Design System"
```

---

## Task 2: Correct §3's three stale claims

**Files:**
- Modify: `PRD.md` §3 (lines 25–46) and the `(§3.3/§18)` citation at line 85

**Interfaces:**
- Consumes: Task 1's `PRD.md`.
- Produces: a §3 free of false claims, which Task 3 keeps in the root file.

Each correction below was verified against code during brainstorming. Make exactly these three; change no other word of §3.

- [ ] **Step 1: Remove the `appSubnav` sentence**

Delete the whole sentence "A secondary sub-navigation row (`appSubnav`) appears within the Reporting view for additional configuration panels." The element exists in **no** `.html` file; the sole occurrence is a defensive lookup in `js/core.js:148` whose guard never passes. The claim is false, not dated.

- [ ] **Step 2: Remove the "editor overlay" clause**

In §3's opening sentence, delete only ", plus a full-screen editor overlay". `costgrid.html` has been a full page with its own route since the 2026-07 Vue migration. **Keep** "The application has three primary views accessible from the main navigation" — that half is correct.

- [ ] **Step 3: Retarget the dangling `§3.3`**

At line 85 (§4.3a Filtering), change `(§3.3/§18)` to `(§18)`. §3 has no subsections; §18 Sharing & Permissions is where offer visibility is actually defined.

- [ ] **Step 4: Verify**

```bash
grep -c 'appSubnav' PRD.md          # expect 0
grep -c 'editor overlay' PRD.md     # expect 0
grep -c '§3\.3' PRD.md              # expect 0
grep -c 'three primary views' PRD.md # expect 1 — the kept clause
wc -l < PRD.md                       # expect 876 (877 minus the standalone sentence and its blank line)
git diff --numstat PRD.md
```
The numstat must show **exactly two modified lines** (the §3 opening sentence and the `:85` citation, each 1 insertion + 1 deletion) plus **two pure deletions** (the `appSubnav` sentence and its blank line). More insertions than that means prose was reworded: revert and redo.

- [ ] **Step 5: Commit**

```bash
git add PRD.md
git commit -m "docs: correct three stale claims in PRD §3"
```

---

## Task 3: Split PRD.md into nine area files plus a §-number index

**Files:**
- Create: `docs/prd/pipeline.md`, `planning.md`, `reporting.md`, `project-config.md`, `master-data.md`, `timesheets.md`, `notifications.md`, `administration.md`, `access.md`
- Modify: `PRD.md` (retain the title block, §1, §2, §3, §13; add the index)

**Interfaces:**
- Consumes: Task 2's `PRD.md`.
- Produces: the nine area files and the index; every later task treats these paths as fixed.

**Extraction is by heading boundary, never by line number** — Tasks 1–2 shifted every line below §3.

| Area file | Extract from → to (exclusive) | Expected lines |
|---|---|---|
| `pipeline.md` | `## 4.` → `## 5.` | 140 |
| `planning.md` | `## 5.` → `## 6.` | 55 |
| `reporting.md` | `## 6.` → `## 7.` | 121 |
| `project-config.md` | `### 7.1` → `### 7.2` | 77 |
| `master-data.md` | `## 7.` → `### 7.1`, **then** `### 7.2` → `## 8.` | 4 + 88 |
| `timesheets.md` | `## 8.` → `## 9.` | 46 |
| `notifications.md` | `## 9.` → `## 13.` (§12 is gone, so this spans §9–§11) | 73 |
| `administration.md` | `## 16.` → `## 17.` | 137 |
| `access.md` | `## 15.` → `## 16.`, **then** `## 17.` → EOF | 30 + 46 |

- [ ] **Step 1: Capture the post-Task-2 baseline**

```bash
git show HEAD:PRD.md > "$S/prd-02-base.md"
wc -l < "$S/prd-02-base.md"   # expect 876
```

- [ ] **Step 2: Extract each range to the scratchpad**

For each row, e.g.:
```bash
awk '/^## 4\./{f=1} /^## 5\./{f=0} f' "$S/prd-02-base.md" > "$S/exp-pipeline.md"
```
For the two-range files, concatenate the ranges in the table's order.

- [ ] **Step 3: Write the nine files**

Each file is its two-line header, a blank line, then the extracted body pasted unchanged:

```markdown
# <Area>

Part of [PRD.md](../../PRD.md) — carries PRD <sections>.
```

Nothing else is added. Do not reflow, re-wrap, retitle, or renumber the body.

- [ ] **Step 4: Prove every move is byte-identical — and that the check is not vacuous**

```bash
for a in pipeline planning reporting project-config master-data \
         timesheets notifications administration access; do
  tail -n +4 "docs/prd/$a.md" | tr -d '\r' > "$S/act-$a.md"
  e=$(wc -l < "$S/exp-$a.md"); c=$(wc -l < "$S/act-$a.md")
  if [ "$e" -lt 20 ]; then echo "VACUOUS: exp-$a is $e lines — extraction missed"; continue; fi
  if diff -q "$S/exp-$a.md" "$S/act-$a.md" >/dev/null; then echo "OK  $a  $c lines"
  else echo "DIFF $a"; diff "$S/exp-$a.md" "$S/act-$a.md" | head -20; fi
done
```
Expected: nine `OK` lines, counts matching the table (±1 for a trailing blank), no `VACUOUS`, no `DIFF`. **A `VACUOUS` line means the heading pattern missed — fix the pattern, never the expectation.**

- [ ] **Step 5: Reduce `PRD.md` to §1, §2, §3, §13**

Delete the extracted ranges from `PRD.md`, keeping the title block (lines 1–7), §1, §2, §3 and §13 in their current order and wording.

- [ ] **Step 6: Add the index — a §-number → file lookup (Review Focus 1)**

Insert after the title block, before §1: a table with one row per area file giving the file link **and the PRD section numbers it carries**, so any in-text "see §7.7" resolves in one hop. Include the root file's own sections (§1, §2, §3, §13) as a row.

- [ ] **Step 7: Verify no `§N` citation is unresolvable**

```bash
grep -ho '§[0-9][0-9.a-z]*' PRD.md docs/prd/*.md | tr -d '§' | cut -d. -f1 \
  | sort -un | tr '\n' ' '
```
Every top-level number printed must appear in the index (§12 and §14 must **not** appear — Task 1 removed them). Any number with no index row is an unresolvable reference: add the row or fix the citation.

- [ ] **Step 8: Verify the whole split lost nothing**

```bash
wc -l PRD.md docs/prd/*.md | tail -1   # total ≈ 876 + 9 files × 3 header lines + index
grep -c '^## ' PRD.md                   # expect 4 — §1, §2, §3, §13
```

- [ ] **Step 9: Commit**

```bash
git add PRD.md docs/prd/
git commit -m "docs: split PRD.md into nine page-aligned area files under docs/prd/"
```

---

## Tasks 4–6: ARCHITECTURE.md directory tree

All three tasks share one procedure and one invariant, applied to a different slice of the 55 entries. The fence is at `ARCHITECTURE.md:935–1084` (148 content lines, 93 of them wrapped narrative).

**The invariant (Review Focus 3):** for each entry, *first* confirm the fact lives in its destination `docs/` file — creating or merging into that file if not, per `/sync-docs` §1's reuse-before-duplicate rule — and *only then* shorten the tree entry. Never truncate first.

**The target shape per entry:** one fact — what the file is, what it loads or folds in — plus its `docs/` pointer where one exists. A long sentence may wrap, but **a wrap may never carry a second fact**; that is how the 93 continuation lines accumulated. Remove every dated cycle narrative and every `?v=N` claim.

### Task 4: `api/` and `css/` entries

**Files:**
- Modify: `ARCHITECTURE.md` (the `api/` and `css/` portions of the tree)
- Modify as needed: `docs/api/lib.md`, `docs/api/services.md`, `docs/css/stylesheets.md`

- [ ] **Step 1: Inventory**

List each `api/`+`css/` entry with its current line count and its destination `docs/` file. Named violators here: `api/src/services/` (10 lines), `css/tokens.css`, `css/style.css`, `css/pipeline.css`, `css/portfolio.css`, `css/auth.css`.

- [ ] **Step 2: Move before truncating**

For each entry, read the destination file and confirm it already carries the narrative. Where it does not, add it there first (merge into the existing file; never fork a duplicate).

- [ ] **Step 3: Shorten the entries**

- [ ] **Step 4: Verify**

```bash
sed -n '936,1083p' ARCHITECTURE.md | grep -c '?v='    # expect 0 for the css/ entries
grep -n '?v=' ARCHITECTURE.md                          # only outside the tree, if anywhere
```
The three claims being removed are wrong as of 2026-10-09 — the tree says `style.css ?v=20` (pages say 21), `nav.js ?v=16` (pages say 17), `tokens.css ?v=8` *and* `?v=9` in one entry (pages say 9). Versions stay owned by `CLAUDE.md`'s Cache-busting section and `foundations-guard.test.js`.

- [ ] **Step 5: Commit**

```bash
git add ARCHITECTURE.md docs/
git commit -m "docs: enforce /sync-docs §1 on ARCHITECTURE.md's api/ and css/ tree entries"
```

### Task 5: `js/` entries

**Files:**
- Modify: `ARCHITECTURE.md` (the `js/` portion)
- Modify as needed: `docs/js/lib.md`, `docs/js/nav.md`, `docs/js/costgrid.md`, `docs/js/shared-libs.md`, `docs/pages/costgrid.md`

- [ ] **Step 1–3:** same procedure as Task 4. The largest offender is `js/lib/` (~30 lines, one entry listing every module); `nav.js`, `cg-controls.js`, `costgrid.js`, `portfolio.js`, `tags.js`, `ratecards.js`, `roles.js` also carry narrative.
- [ ] **Step 4: Verify** no `?v=` remains in the `js/` slice and each shortened entry's fact is present in its `docs/` file.
- [ ] **Step 5: Commit** — `docs: enforce /sync-docs §1 on ARCHITECTURE.md's js/ tree entries`

### Task 6: root pages, `scripts/`, and config entries

**Files:**
- Modify: `ARCHITECTURE.md` (root `.html`, `scripts/`, `nginx.conf`, `package.json`, `.gitattributes` entries)
- Modify as needed: `docs/pages/*.md`, `docs/scripts/*.md`

- [ ] **Step 1–3:** same procedure. Named violators: `portfolio.html`, `program.html`, `planning.html`, `costgrid.html`, `master-*.html`, `test-cases.html`, `scripts/backup-db.sh`, `scripts/classify-cycle.mjs`, `scripts/run-tests.sh`.

  **Verify the two Cycle 3 entries against the rule rather than assuming they comply** — `test-cases.html` and `scripts/classify-cycle.mjs` were written the same evening as the brief. `test-cases.html`'s current entry is four lines of dated narrative and does **not** comply; it has no `docs/pages/` file, so one is created (or the fact is routed to `docs/js/lib.md`, which already documents `test-cases-parse.js`).

- [ ] **Step 4: Verify the whole tree now meets the target**

```bash
sed -n '936,1083p' ARCHITECTURE.md | grep -c '?v='      # expect 0
awk 'NR>=936 && NR<=1083' ARCHITECTURE.md | wc -l        # recount the fence after edits
```
Re-locate the fence (`grep -n '^```' ARCHITECTURE.md`) since the edits moved it. **Expect ≤ 80 content lines, from 148.**

- [ ] **Step 5: Commit** — `docs: enforce /sync-docs §1 on ARCHITECTURE.md's page and script tree entries`

---

## Task 7: `/sync-docs` §5 inversion and §5b widening

**Files:**
- Modify: `.claude/skills/sync-docs/SKILL.md` §5 (line 38) and §5b (line 44)

**Interfaces:**
- Consumes: the `docs/prd/` paths fixed by Task 3.
- Produces: the trigger Task 8's skill text refers to.

- [ ] **Step 1: Add the positive clause ahead of §5's existing rules**

A change that adds or removes a page in `CLAUDE.md`'s Pages table, or adds or removes a control a user can see or click, **is** user-visible — update the matching `docs/prd/` file; do not ask.

- [ ] **Step 2: Keep the "ask when in doubt" rule as the residual**

Do **not** delete it. It was written after the 2026-09-16 audit's 14 gaps; making the clear cases automatic does not make the unclear ones clear.

- [ ] **Step 3: Teach §5 the new layout**

State that the PRD is now `PRD.md` + `docs/prd/`, and add the routing line naming which area file takes which change (Task 3's table is the mapping).

- [ ] **Step 4: Widen §5b's trigger**

From "only if PRD.md was updated in this cycle" to `PRD.md` **or** any `docs/prd/` file, and require it to name which area file's change it is reacting to.

- [ ] **Step 5: Verify**

```bash
grep -c 'docs/prd' .claude/skills/sync-docs/SKILL.md   # expect ≥ 3 (§5 clause, routing, §5b)
grep -c 'ask the user explicitly' .claude/skills/sync-docs/SKILL.md  # expect 1 — residual kept
grep -n '^### ' .claude/skills/sync-docs/SKILL.md      # heading numbers unchanged: 5, 5b, 6, 7
```

- [ ] **Step 6: Commit** — `docs: invert /sync-docs §5's PRD trigger and widen §5b to docs/prd/`

---

## Task 8: `operational-manual` inlined reference

**Files:**
- Modify: `.claude/skills/operational-manual/SKILL.md` lines 37, 56, and the "PDash detail-content reference (as of 2026-09-16)" heading at line 66

**Interfaces:**
- Consumes: Task 3's `docs/prd/` paths; Task 7's §5b wording.

This is the brief's non-negotiable item: if the PRD moves and this reference does not, it goes stale exactly as `PRD.md` did before 2026-09-16.

- [ ] **Step 1: Widen the source-of-truth rule (line 56)**

"Source of truth: `PRD.md` only" becomes `PRD.md` **plus** `docs/prd/`. **Leave the ban on reading `ARCHITECTURE.md`/`CLAUDE.md` untouched** — §3 surviving Task 2 is precisely what keeps that ban payable.

- [ ] **Step 2: Add `docs/prd/` to the source-location list (line 37)**

- [ ] **Step 3: Re-date the reference heading**

`(as of 2026-09-16)` → `(as of 2026-10-09)`, since the reference was re-verified against the moved PRD.

- [ ] **Step 4: Leave every `§N` content key unchanged**

Verified during brainstorming: the reference's headings (`§4 Pipeline`, `§5 Resource Planning`, `§16 Administration`, …) and in-text citations (`PRD §15.1/§15.3`, `PRD §6.1a`) are **PRD** numbers, and decision 3 preserved those numbers. This step is a no-op by design — confirm, do not edit.

- [ ] **Step 5: Verify**

```bash
grep -c 'docs/prd' .claude/skills/operational-manual/SKILL.md     # expect ≥ 2
grep -c 'Do not read `ARCHITECTURE.md`' .claude/skills/operational-manual/SKILL.md  # expect 1
grep -c 'as of 2026-09-16' .claude/skills/operational-manual/SKILL.md               # expect 0
grep -o 'PRD §[0-9.a-z]*' .claude/skills/operational-manual/SKILL.md | sort -u      # unchanged
```

- [ ] **Step 6: Commit** — `docs: point operational-manual's inlined reference at docs/prd/`

---

## Task 9: Gate readiness

**Files:** none modified — this task only verifies.

- [ ] **Step 1: Full suite**

```bash
npm test
```
Expected: PASS. Nothing here should touch it — `money-guard.test.js` is the only filesystem-walking test and its `SKIP_DIRS` excludes `docs` and `.claude`. A failure means a *real* coupling was found: stop and report it, do not work around it.

- [ ] **Step 2: Classification (Global Constraint, Review Focus 4)**

```bash
node scripts/classify-cycle.mjs
git diff --name-status --find-renames main...HEAD
```
Expected: first stdout line `no-code`. If it prints `ordinary`, find the offending path in the diff and remove it — **do not** rationalise it.

- [ ] **Step 3: No BOM, no stray files**

```bash
for f in PRD.md ARCHITECTURE.md docs/prd/*.md \
         .claude/skills/sync-docs/SKILL.md .claude/skills/operational-manual/SKILL.md; do
  printf "%s " "$f"; head -c 3 "$f" | od -An -tx1
done
git status --porcelain            # expect empty
git diff --numstat main...HEAD    # no file should show every line rewritten
```
Any file starting `ef bb bf` has a BOM — rewrite it with `Write`. A whole-file rewrite in `numstat` on a file that should have had a few lines changed is the same symptom.

- [ ] **Step 4: Acceptance criteria sweep**

Walk the spec's 11 criteria and record the measured result for each — the line counts, the nine `OK` diffs, the `?v=` zero, the classifier token. These numbers go in the cycle report; a criterion that cannot be measured is reported unmet, never "done".

- [ ] **Step 5: Invoke `/finish-cycle`**

Expect Gate 2's **no-code branch** — the first time it has ever been walked (Cycles 1–2 could not; the command loads its text from the main checkout, and Cycle 3 was `ordinary`). Per PROCESS.md §6 4c, annotate in the report:
- Gate 2 shows the diff and asks to **confirm the classification**; no Docker stack, no spec/plan archaeology, no browser question.
- It **tears down nothing** — `scripts/test-branch.sh status` read-only, reporting any stack left by an earlier attempt.
- **Gate 4's out-of-scope check does not fire**, because steps 2–5 identify no plan file. This must be stated in the report.
- Gate 3 is **not** skipped; step 0's background `/code-review` applies on both branches.
- A "no" to the classification question degrades to the ordinary branch rather than stopping the cycle.

---

## Out of scope — found, isolated, not fixed

Recorded in the spec §6 and repeated here so no task picks them up: the `operational-manual` SKILL.md contradiction at lines 158 vs 161 (Settings "blank" vs "only holds the Data Manager"); §7's intro claiming all its screens are admin-only, which is imprecise for §7.1; the two Cycle 2 follow-ups (`:27`-vs-`:49` teardown, Gate 2 prose reduction); the three Cycle 3 deferred low findings.
