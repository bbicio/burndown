# Economy of approvals (M7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cycle's ratification gates with a decision ledger, de-duplicate Gate 5/Gate 6, and automate the three Gate 4 steps that ask about reversible or unwanted states.

**Architecture:** Five tasks, four of them prose edits to documents this repo owns and one a new guard test. The rule itself lives in a new `PROCESS.md` §6b and is enforced where it can be — a vitest guard over `docs/superpowers/specs/` and `docs/superpowers/plans/`. The plugin skills (`superpowers:brainstorming`, `superpowers:writing-plans`) are not edited; they are overridden from `CLAUDE.md`, which has precedence, the same way the closing-a-branch override already works.

**Tech Stack:** Markdown; vitest (`vitest.config.js:6` already includes `scripts/**/*.test.js`); Node ≥ 20.12 on the host.

**Spec:** `docs/superpowers/specs/2026-10-12-approval-economy-design.md`

**Task independence:** **The tasks are NOT independent** — Tasks 3 and 4 both modify `.claude/commands/finish-cycle.md`, and Task 5's byte budget depends on nothing else but must be measured last. Per `PROCESS.md` §6.1 the precondition for subagent-driven execution is therefore not met: **execute natively**, in order 1 → 2 → 3 → 4 → 5.

## Global Constraints

- `docs/superpowers/PROCESS.md` is written in **Italian**; `CLAUDE.md` and `.claude/commands/finish-cycle.md` in **English**. Match the file you are editing.
- Cite `PROCESS.md` sections in full form — `§4b`, `§6b`, `§6.4b`, `§6.6.5` — never a bare `4b` (`PROCESS.md:7`).
- `CLAUDE.md` must stay **≤ 64,000 LF bytes** (`scripts/claude-md-guard.test.js:96`). Measure with `Buffer.byteLength(text.replace(/\r\n/g,'\n'))`, **never `wc -c`** — that returns CRLF bytes and is the mistake the spec itself made. Current: 62,391 LF.
- Do **not** touch `CLAUDE.md`'s `### File structure` block: it is pinned at exactly 13,156 LF bytes.
- In Task 5, **deletion only — never rewrite a sentence to shorten it** (spec §8.1 rule 1).
- Every task ends with `npm test` green before its commit.
- The ledger section heading is exactly `## Decisioni aperte`, and the empty-case body is exactly `Nessuna.`

## Execution setup and closeout notes

- A fresh worktree has no `node_modules` and no `.env` (gitignored): run `npm ci` once and copy `.env` from the main checkout before the first `npm test`.
- **At Gate 2, `node scripts/classify-cycle.mjs` will return `ordinary`** because Task 1 adds a `.js` file — correctly, since its rule is the path list and never a judgment about content — while nothing in this diff is served by nginx. This is the symmetric case `PROCESS.md` §6.4c describes: handle it as a **§3 derogation**, decided explicitly with the user at that gate and recorded in the report, with no stack and no browser verification. Do not widen the classifier.
- No `api/` path is touched, so Gate 4's migration, backup and restart steps do not fire in this cycle — including the ones Task 3 edits.

## Review Focus

Five conditions the spec implies that no task's deliverable exercises on its own. Each has its test added to Task 1.

1. **22 files named `*-brief.md` live inside `docs/superpowers/specs/`** (e.g. `2026-07-29-vue-fouc-vcloak-brief.md`). They are briefs, not specs, and must be skipped — otherwise the first brief ever written into that directory after the cutoff fails the guard for having no ledger.
2. **A file in those directories whose name has no leading `YYYY-MM-DD-`** must be ignored, not crash the date parse.
3. **`### Decisioni aperte` (wrong heading level) must not satisfy the guard**, or a nested subsection silently passes for the real section.
4. **`Perché:` carries an accent.** An entry written `Perche:` must fail, and that must be pinned rather than left to whichever regex the implementer happens to write.
5. **Line endings.** The guard must normalise CRLF before parsing, as `scripts/claude-md-guard.test.js` does; otherwise it behaves differently on two checkouts of the same commit.

---

### Task 1: The decision-ledger guard

**Files:**
- Create: `scripts/decision-ledger-guard.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks consume. The file exports nothing; `checkLedger(markdown)` is module-internal and returns `{ ok: true }` or `{ ok: false, reason }` where `reason` is one of the literals `'missing-section'`, `'empty-section'`, `'malformed-entry'`.

**Scope rule the file implements:** a file is in scope when it is directly under `docs/superpowers/specs/` or `docs/superpowers/plans/`, ends in `.md`, does **not** end in `-brief.md`, has a filename starting `YYYY-MM-DD-` with that date `>= '2026-10-12'`, and is not one of the four exempt names.

**Exempt list (closed — a later addition means the guard is being worked around):**
`specs/2026-10-12-guards-enforcement-set-design.md`, `specs/2026-10-12-process-md-self-description-design.md`, `plans/2026-10-12-guards-enforcement-set.md`, `plans/2026-10-12-process-md-self-description.md`.

- [ ] **Step 1: Write the failing tests**

A `describe('checkLedger')` block over inline fixture strings, and a `describe('live specs and plans')` block over the real directories. Test names and the assertion each makes:

```js
// checkLedger
'accepts the Nessuna. sentinel'                        -> { ok: true }
'accepts a list where every entry has all three fields'-> { ok: true }
'rejects a file with no ## Decisioni aperte section'   -> reason 'missing-section'
'does not accept ### Decisioni aperte as the section'  -> reason 'missing-section'   // Review Focus 3
'rejects a section whose body is blank'                -> reason 'empty-section'
'rejects an entry missing Alternativa scartata:'       -> reason 'malformed-entry'
'rejects an entry missing Perché:'                     -> reason 'malformed-entry'
'rejects Perche: written without the accent'           -> reason 'malformed-entry'   // Review Focus 4
'rejects when only the second of two entries is complete' -> reason 'malformed-entry'
'stops the section at the next ## heading'             -> { ok: true } for a fixture whose
                                                           next ## section contains the words
                                                           "Alternativa scartata" in prose
'parses a CRLF fixture identically to its LF twin'     -> both { ok: true }          // Review Focus 5

// scope
'skips *-brief.md under specs/'                        -> inScope(...) === false      // Review Focus 1
'skips a filename with no leading date'                -> inScope('README.md') === false // Review Focus 2
'skips the four exempt files'                          -> inScope(each) === false
'includes this cycle’s own spec and plan'              -> inScope(both) === true

// live sweep
'every in-scope spec and plan carries a valid ledger'  -> collect failures across both
                                                          directories, assert the list is empty,
                                                          naming file and reason in the message
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/decision-ledger-guard.test.js`
Expected: FAIL — `checkLedger is not defined`.

- [ ] **Step 3: Implement `checkLedger(markdown)` and `inScope(relPath)` in the same file**

Follow the shape of `scripts/architecture-guard.test.js`: a self-contained test file, helpers at the top, no new runtime script — the rule only matters at test time.

Parsing: normalise `\r\n` → `\n`; find a line matching `/^## Decisioni aperte\s*$/m`; the body is everything up to the next `/^## /m` or EOF. Split the body into entries on `/^\d+\.\s/m`. An entry is complete when it contains both `Alternativa scartata:` and `Perché:`.

- [ ] **Step 4: Write the file's header comment**

Same convention as `scripts/claude-md-guard.test.js` and `scripts/doc-paths-guard.test.js`: WHY THIS FILE EXISTS, then **WHAT IS DELIBERATELY NOT CHECKED**. That second part must state, in the file itself and not only in the spec, that the guard cannot see whether a ledger is **complete** — two impeccable entries where there were five decisions pass every test — and that checking quality here would be the process judging itself, which `PROCESS.md` §6.4c forbids elsewhere. It must also say the exempt list is closed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run scripts/decision-ledger-guard.test.js`
Expected: PASS, including the live sweep over this cycle's own spec and plan.

- [ ] **Step 6: Commit**

```bash
git add scripts/decision-ledger-guard.test.js
git commit -m "test: guard that every new spec and plan carries a decision ledger"
```

---

### Task 2: `PROCESS.md` §6b, and §6.1 folded into the plan handoff

**Files:**
- Modify: `docs/superpowers/PROCESS.md` — insert a new `## 6b.` section after §6's last subsection (`#### 6.6.5`, ending at `:222`) and before `## 7.`; rewrite the first bullet of `### 6.1` (`:138`).

**Interfaces:**
- Consumes: nothing.
- Produces: the section number `§6b`, cited by Tasks 3, 4 and 5.

- [ ] **Step 1: Write `## 6b. Economia delle approvazioni (2026-10-12)`**

In Italian. Four parts, from spec §4:

(a) the A/B/C/D taxonomy of spec §1.1, one line each, so a future cycle classifies a stop instead of inventing one;
(b) the ratification rule — a class-C gate presents the decisions that could have gone another way instead of asking for approval, and **with N=0 says so and proceeds without waiting**;
(c) the operational definition of such a decision, including the three exclusions (mechanical consequences of a decision already in the ledger; project conventions; anything already settled at a class-B stop);
(d) the guard boundary: *un guard può pretendere che l'artefatto porti l'informazione; non può mai giudicare se l'informazione è corretta*, with the pointer to §6.4c, which draws the same line for `classify-cycle.mjs`.

Then the two gate rules of spec §5.1 and §5.2, as bullets under the same section: the design is presented once whole and the spec is **not** re-ratified after it (with the mechanical N>0 exception for a decision that first appears while writing), and the plan handoff carries the §6.1 declaration instead of it being a turn of its own.

Close with the `## Decisioni aperte` format of spec §4.1, including the `Nessuna.` sentinel, and name `scripts/decision-ledger-guard.test.js` as what enforces it.

- [ ] **Step 2: Rewrite `### 6.1`'s first bullet (`:138`)**

Keep its substance verbatim where it still holds — the mode is declared and never deduced from a word of the user's; a bare user request is binding but is compared against the rule first; the Cost Grid A anecdote stays. Change only **where** the declaration happens: inside `writing-plans`' handoff message together with the Plan's path and its open decisions, not as a separate turn. Do not touch the model bullet (`:142`).

- [ ] **Step 3: Verify nothing was renumbered**

Run: `grep -n '^#\{2,4\} ' docs/superpowers/PROCESS.md`
Expected: the existing headings are unchanged and `## 6b.` sits between `#### 6.6.5` and `## 7.`.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS. `scripts/doc-paths-guard.test.js` is the one that can go red here, if a path cited in the new text does not exist.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/PROCESS.md
git commit -m "docs: PROCESS.md 6b — economy of approvals, and 6.1 folded into the plan handoff"
```

---

### Task 3: `/finish-cycle` Gate 3 disposition rule and the three Gate 4 automations

**Files:**
- Modify: `.claude/commands/finish-cycle.md` — Gate 3 step 3 (`:76`), Gate 4 step 3 (`:98`), step 7 (`:125-129`), step 9 (`:138-140`)

**Interfaces:**
- Consumes: `§6b` from Task 2.
- Produces: the edited Gate 4, which Task 4 refers to when removing Gate 6's restart sentence.

- [ ] **Step 1: Gate 3 step 3 — the disposition rule**

Round 1 asks as it does today. Add: from round 2 on, if the round-1 answer stated a **rule** ("all follow-up except correctness"), later rounds apply it, report the application, and stop only on a finding the rule does not cover. State explicitly that **if round 1 was decided case by case, no rule is inferred** — the same "never inferred" principle §6.4c and `feature-brief` rest on. Leave the 3-round cap (`:80-86`) untouched.

- [ ] **Step 2: Gate 4 step 3 — conditional backup**

It runs when the diff adds a file under `api/src/db/migrations/` (step 6 will apply it) **or** touches `api/` (step 7 will restart) — i.e. when the stack is about to be touched. Otherwise it does not run and says so in one line. Write the reason next to it: this is what `CLAUDE.md`'s Infrastructure-safety rule 2 actually asks for, and merge frequency was the wrong variable (spec §6.3).

- [ ] **Step 3: Gate 4 step 7 — automatic restart**

Delete the question and the `no` branch with its warning. Keep the mechanism exactly as it is: restart when Gate 1 step 2 found `api/` touched, poll `docker inspect pdash-api --format '{{.State.Health.Status}}'` until `healthy`, report `StartedAt`. Keep the existing explanation of why it is needed. Add one line naming the `CLAUDE.md` derogation that permits it (Task 5 writes the other end).

- [ ] **Step 4: Gate 4 step 9 — automatic branch deletion**

`git branch -d <branch>` runs without asking. If it refuses, report the refusal and do not force it.

- [ ] **Step 5: Verify no other gate was touched**

Run: `git diff --stat .claude/commands/finish-cycle.md` and read the hunks.
Expected: only the four regions above. Gate 2 and Gate 4 step 2 must be byte-identical.

- [ ] **Step 6: Run the suite and commit**

Run: `npm test` → PASS.

```bash
git add .claude/commands/finish-cycle.md
git commit -m "docs: finish-cycle — disposition rule at Gate 3, three Gate 4 automations"
```

---

### Task 4: Gate 5 / Gate 6 stop duplicating

**Files:**
- Modify: `.claude/commands/finish-cycle.md` — Gate 6 (`:196-203`)

**Interfaces:**
- Consumes: Task 3's edited Gate 4 (the declined-restart case no longer exists).

- [ ] **Step 1: Rewrite Gate 6**

The file written at Gate 5 is the register — it is the only persistent artefact and the only trace the project memory has at all. Gate 6 keeps: the report's path; **one** outcome line; the items needing a human action after the cycle (accepted follow-ups, Roadmap notes). Gate 6 loses: the per-gate enumeration (`:201`) and the project-memory line (`:200`), both of which are in the file; and the conditional clause about a declined `pdash-api` restart, which Task 3 made unreachable.

- [ ] **Step 2: Leave the final line exactly as it is**

The mandatory closing line (`:203`) and the instruction never to act on it are unchanged, character for character.

Run: `grep -n 'Cycle closed and pushed' .claude/commands/finish-cycle.md`
Expected: the same single line as before the edit.

- [ ] **Step 3: Run the suite and commit**

Run: `npm test` → PASS.

```bash
git add .claude/commands/finish-cycle.md
git commit -m "docs: Gate 6 stops restating Gate 5's report"
```

---

### Task 5: `CLAUDE.md` — two deletions, three edits, measured in LF

**Files:**
- Modify: `CLAUDE.md` — Infrastructure safety rule 3 (`:12`), the backup paragraph (`:41`), the process-override block near the top, and the money bullet (`:376`)

**Interfaces:**
- Consumes: `§6b` from Task 2; Task 3's Gate 4 restart automation, which rule 3's derogation authorises.

- [ ] **Step 1: Measure the starting size**

Run: `node -e "console.log(Buffer.byteLength(require('fs').readFileSync('CLAUDE.md','utf8').replace(/\r\n/g,'\n')))"`
Expected: `62391`. If it differs, stop and reconcile before editing — the budget below assumes it.

- [ ] **Step 2: The two deletions, from `:376` only**

Delete the sentence `Current cache versions: ... (``planning.html``).` — 161 B, and two of its five values are already false (`js/costgrid.js` is at `?v=43`, stated 39; `js/lib/pipeline-calc.js` at `?v=6`, stated 5). Delete the clause `The one-line wrappers (...) and the `currentCfg` global were removed (2026-10, money wrapper cleanup): ` — 167 B, which documents what no longer exists.

**Keep** the "Known open items" clause and the live rule about calling `formatMoney` directly; re-join the remaining text without rewriting any surviving sentence.

- [ ] **Step 3: Amend Infrastructure safety rule 3 (`:12`)**

Add one named derogation: `/finish-cycle` Gate 4's post-merge `docker compose restart api` runs without confirmation — **never `down`, never `-v`, no other command, no other moment.** Write the reason beside it: the 2026-08-05 incident was a `down -v` with volume loss, and the alternative state (backend code merged but not live) is itself a hazard. Rule 2 stays as it is; Task 3's conditional backup is what keeps it satisfied.

- [ ] **Step 4: Rewrite the backup sentence at `:41`**

"`/finish-cycle`'s Gate 4 runs it automatically after merge is confirmed, so every merge to `main` leaves a fresh snapshot behind" is false once Task 3 lands. Replace it with: Gate 4 runs it when the stack is about to be touched — before applying a migration or restarting `pdash-api` — so a merge that touches neither leaves no snapshot.

- [ ] **Step 5: Add the "Process override — approvals" pointer**

Next to the existing "Process override — closing a development branch" block. Two or three lines: `PROCESS.md` §6b takes precedence over `superpowers:brainstorming`'s `<HARD-GATE>` (no separate ratification of the written spec) and over `superpowers:writing-plans`' Execution Handoff (the §6.1 declaration travels inside it).

- [ ] **Step 6: Measure again**

Run the same command as step 1.
Expected: **≤ 64,000**, and in the neighbourhood of 62,700. If it exceeds 64,000, the answer is a shorter *new* sentence or another verified deletion — never raising the pin, never rewriting a surviving sentence to shorten it.

- [ ] **Step 7: Run the suite**

Run: `npm test`
Expected: PASS. `scripts/claude-md-guard.test.js` is the likely red: the total-size ceiling, and the exact `### File structure` pin if step 2's edit strayed into that block (it must not).

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — approvals override, Gate 4 derogation, drop two stale money claims"
```

---

## Decisioni aperte

1. **Native execution, not subagent-driven.** Alternativa scartata: a fresh implementer per task. Perché: Tasks 3 and 4 edit the same file in sequence, so `PROCESS.md` §6.1's independence precondition is not met, and five prose edits of this size do not repay the fixed dispatch cost.
2. **The guard is a self-contained test file, with no runtime script beside it.** Alternativa scartata: the `classify-cycle.mjs` + `classify-cycle.test.js` pair. Perché: that rule is read by `/finish-cycle` at run time and so needs a command; this one is only ever evaluated by the test suite, and `architecture-guard.test.js` is the precedent for that shape.
3. **The live sweep fails as one assertion listing every offender, not one test per file.** Alternativa scartata: generating a test per in-scope file. Perché: the offender list is the useful output, and a per-file generator would make the suite's test count drift with the number of specs — which is exactly the kind of silent drift `claude-md-guard.test.js` exists to stop.
4. **`## 6b.` is written as one section rather than split across §6 and §7.** Alternativa scartata: putting the taxonomy in §6 and the gate rules next to each gate's own mention. Perché: the taxonomy is only useful where the rule it serves is stated, and scattering it is how the duplication this cycle removes came about in the first place.
