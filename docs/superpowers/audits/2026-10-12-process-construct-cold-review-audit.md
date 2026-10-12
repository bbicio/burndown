# Audit: the process construct left by Tier 0 → cycle 6 (cold review)

**Date:** 2026-10-12
**Auditor:** domain-audit skill (Opus 5)
**Handoff:** `docs/handoff-cold-review.md`

## Scope

Negotiated with the user before any file was read:

- **Files under audit:** the six process artifacts, 1,310 lines, read as one construct —
  `.claude/commands/finish-cycle.md` (199), `docs/superpowers/PROCESS.md` (206),
  `.claude/skills/sync-docs/SKILL.md` (96), `scripts/classify-cycle.mjs` + `.test.js` (121+254),
  `scripts/architecture-guard.test.js` (232), `scripts/claude-md-guard.test.js` (202).
- **Explicitly out of bounds** (the user's decisions, not my assumptions): the restructured documents
  themselves (`CLAUDE.md`, `ARCHITECTURE.md`, `PRD.md`+`docs/prd/`, `TEST_CASES.md`) and their mutual
  consistency — read here only where a process artifact points at them; the product (pages, API,
  schema); cycle durations (handoff question 5), excluded because the user judged one complete data
  set too thin for a defensible conclusion.
- **The 10 known tensions listed in the handoff** are taken as given, per the user's decision — they
  were *not* re-verified one by one. Where a finding below lands near one, it is a distinct defect and
  says so.
- **Finding definition:** a place where the construct, read end to end, contradicts itself, leaves a
  gap none of its parts covers, or states a limit narrower than the one it actually has.
- **Ground truth:** the actual behaviour of the commands and tests, never the prose describing them.
  Every claim about a test's behaviour below was produced by running it, or by executing the same
  computation against the real files.

## Method

Read all six files in full. Ran `npx vitest run scripts/` (3 files, 99 tests, green at `26041b1`) and
confirmed `vitest.config.js`'s `include` reaches them (`scripts/**/*.test.js`). Re-executed the
guards' own matching logic against `ARCHITECTURE.md` §5 (lines 173-610) and `CLAUDE.md` in throwaway
Node scripts, to measure what they really accept rather than what their headers say. Used
`git log -S` to date the three Gate 4 steps, and `git show` to read the pinned values before and
after the last `/sync-docs` commit. Checked every `docs/` path cited by `ARCHITECTURE.md` for
existence. No file in the repository was modified.

---

## Findings

### F1 — Gate 5 pushes to `main` with no test gate, and it is the step that edits the pinned numbers

**Type:** process gap (guard bypass) · **Severity:** High

**Location:** `.claude/commands/finish-cycle.md:141-189` (Gate 5), `:16` (the only `npm test`);
`scripts/claude-md-guard.test.js:108-119`; commit `3edd128`.

**Evidence.** `npm test` appears exactly once in the whole command, at Gate 1 (`:16`). Gate 5's five
steps are: invoke `/sync-docs` (`:143`), write the report (`:144`), show the diff (`:182`), ask
(`:183`), then `git add` / `git commit` / `git push origin main` (`:185`). No verification of any kind
runs between `/sync-docs`'s edits and the push.

What `/sync-docs` edits at that point is exactly what two of the three guards pin. The last cycle
demonstrates it: `3edd128` ("docs: sync docs + finish-cycle report for worktree-claudemd-split-phase3"),
the post-merge Gate 5 commit, changed `CLAUDE.md` **and** `scripts/claude-md-guard.test.js` in the same
untested commit:

```
-  it('keeps the File structure block at exactly 12,538 LF bytes', () => {
+  it('keeps the File structure block at exactly 12,758 LF bytes', () => {
```

**Root cause.** The guards were wired into `npm test`, which the process runs at Gate 1 — *before* the
merge. The content they pin is written at Gate 5 — *after* it. Cycle 5 and cycle 6 each added their
guard looking at their own diff; no cycle looked at both ends of the sequence. The exact pin (a
deliberate choice, `claude-md-guard.test.js:20-26`) widens the exposure rather than narrowing it: an
ordinary `/sync-docs` run that adds one index line *must* edit the test to stay green, and nothing
checks that it did.

**Consequence.** `main` can be pushed red, and nothing notices until the next cycle's Gate 1 — on a
different branch, with a different author-moment. In `3edd128` it did not happen only because the
agent remembered. An `npm test` between Gate 5 steps 2 and 3 would close it; so would moving the pins
out of the artifact `/sync-docs` edits. Neither is applied here (Step 4 of this skill).

---

### F2 — `architecture-guard` inverts the documentation order the process prescribes, and nothing says so

**Type:** contradiction between artifacts · **Severity:** High (latent — never yet exercised)

**Location:** `scripts/architecture-guard.test.js:151-158`, `:188-215`;
`.claude/commands/finish-cycle.md:16` (Gate 1, blocking) vs `:143` (Gate 5);
`.claude/skills/sync-docs/SKILL.md` §1.

**Evidence.** The guard asserts `expect(undocumented).toEqual([])` over every route handler declared
in the code (`:151`), and the same for every table a migration creates (`:188`) and every column an
`ALTER TABLE` adds (`:203`). So a branch that adds an endpoint or a migration makes `npm test` fail
until `ARCHITECTURE.md` §5/§6 documents it. Gate 1 is blocking: "If it fails: stop immediately … 
Require a fix and a re-run of `/finish-cycle` from the top" (`:16`).

The step that updates `ARCHITECTURE.md` is `/sync-docs` §1, and `/finish-cycle` invokes it at Gate 5,
post-merge (`:143`). The two sit in the wrong order relative to each other.

The guard has **never been exercised on such a cycle**: `git diff --name-only 660ae1e..HEAD -- api/`
is empty — every commit since the guard landed is documentation, or the guard itself.

**Root cause, and why it stayed invisible.** `sync-docs` §2 (CLAUDE.md) *does* carry an explicit
paragraph about its guard, added by cycle 6 ("now fails `npm test` instead of depending on whoever runs
`/sync-docs` noticing"). §1 (ARCHITECTURE.md) has no equivalent sentence — cycle 5 did not add one.
`PROCESS.md` names `classify-cycle` (`:26`, `:143-146`) and names neither `architecture-guard` nor
`claude-md-guard` anywhere. `finish-cycle.md` mentions no guard at all (`grep -c guard` = 0). So the
only instruction a future backend cycle would read says `ARCHITECTURE.md` is a Gate 5 concern, while
Gate 1 will refuse to pass without it.

**Consequence.** The first cycle after this programme that adds a route, a table or a column hits a
red, blocking Gate 1 with nothing anywhere explaining why, when to fix it, or that the fix belongs on
the branch rather than at Gate 5. The failure itself is correct — the guard is doing its job; the
defect is that the process never tells anyone it will happen.

---

### F3 — `<reviewed-sha>` carries two incompatible definitions; a second run in one session always re-reviews

**Type:** internal contradiction · **Severity:** Medium (fail-safe direction)

**Location:** `.claude/commands/finish-cycle.md:36`, `:37`, `:67`, `:70`.

**Evidence.** Gate 2 step 0 defines it as an *end point*: "Note the HEAD it covers as `<reviewed-sha>`"
(`:37`). The very next sentence redefines it as a *start point*: "If an earlier review in this session
already left a `<reviewed-sha>`, keep the **earlier** of the two: a scoped range must start at the
oldest point not yet reviewed" (`:37`). Gate 3 then reads it in the first sense: "if HEAD has moved
past the `<reviewed-sha>` that run covered … run step 0b's scoped review of `<reviewed-sha>..HEAD`"
(`:67`).

A path entirely inside the documented flow: Gate 2 launches a whole-branch review at HEAD=A and
records `<reviewed-sha>`=A; the user answers "no" at step 6, which keeps the findings and stops
(`:62`); a fix lands as commit B; `/finish-cycle` is re-run in the same session. The second Gate 2
step 0 takes the 0b bullet (`:36`) and launches a scoped review of A..B — correct. `<reviewed-sha>`
stays A, by the "keep the earlier" rule. Gate 3's collection paragraph (`:67`) then finds HEAD(B) past
`<reviewed-sha>`(A) and launches *the same* A..HEAD scoped review a second time. The condition at
`:67` is effectively `HEAD != <reviewed-sha>`, which on this path is true by construction; its stated
intent ("because a commit landed during Gate 2") is narrower than what it tests.

**Root cause.** Cycle 1 deliberately kept the parallel-review change minimal — three sentences grafted
onto a gate written as a synchronous checklist (`PROCESS.md:141`, "Niente macchina a stati"). That was
the right call after the 4-round/33-finding first attempt. But the one variable the graft introduced
was given a second meaning by the single sentence that handles re-runs, and its two readers sit in
different gates.

**Consequence.** Wasted review, not missed review: the duplicated range is always a subset of
something already covered, so nothing reaches Gate 4 unreviewed. It is nonetheless precisely the
double review that §6.4 and step 0b exist to prevent — the process violating its own economy rule,
silently, on every re-run. (Adjacent to, but distinct from, the known Gate 2 classification-paragraph
tension.)

---

### F4 — Read together, the three guards' limit lists leave `ARCHITECTURE.md`'s own pointers covered by nobody

**Type:** coverage hole across guards (handoff question 3) · **Severity:** Medium (hole, not a live defect)

**Location:** `scripts/claude-md-guard.test.js:35-39`, `:180`; `scripts/architecture-guard.test.js:19-31`;
`.claude/skills/sync-docs/SKILL.md` §1.

**Evidence.** `claude-md-guard` states the limit itself: "Scope is docs/ and .claude/ only. Pointers in
TEST_CASES.md, ARCHITECTURE.md, js/** comments and *.html are NOT checked (all were verified clean by
hand at 2026-10-10, but nothing keeps them that way)" (`:35-39`), and its walk confirms it (`:180`:
`[...liveMarkdown('docs'), ...liveMarkdown('.claude')]`). `architecture-guard` checks §5, §6 and the
`routes/` tree entry only; its own limits list names the `Auth` column, the prose/Description cells and
column types — nothing about citations.

`ARCHITECTURE.md` carries 31 distinct `docs/**.md` citations and one `CLAUDE.md` section pointer by
name (`ARCHITECTURE.md:937`, `CLAUDE.md's "Infrastructure safety" section`). **All of them resolve
today** — checked file by file. This is a hole, not a live defect.

The same asymmetry runs one level deeper. `sync-docs` §1 declares the `docs/` routing rule for
`ARCHITECTURE.md`'s directory tree "mandatory, not a preference" and extends it to every non-page entry
— and nothing measures it, while the identical rule for `CLAUDE.md`'s File structure block is pinned to
the byte and to the entry count (`claude-md-guard.test.js:108-135`). `ARCHITECTURE.md` is 76,800 B
against `CLAUDE.md`'s 64,000 B ceiling, with no ceiling of its own.

**Root cause.** Three guards, three cycles, three author-moments: each declared its limits honestly in
its own header, and the union was never computed. The 2026-09-17 audit's core observation —
"`CLAUDE.md` aggiornato quasi ad ogni ciclo, `ARCHITECTURE.md` no" (`PROCESS.md:69`) — is reproduced
exactly inside the guards built to answer it.

---

### F5 — `architecture-guard`'s "mentions" checks are a bare word match over all of §5, a limit its header does not name

**Type:** guard weaker than stated · **Severity:** Medium

**Location:** `scripts/architecture-guard.test.js:188-215` (both `it(…)` blocks), header `:19-31`.

**Evidence.** Both checks are `new RegExp(`\b${name}\b`).test(s5)`, where `s5` is the whole of §5 —
20,036 characters, lines 173-610 of `ARCHITECTURE.md`. A column satisfies the check if its *name*
appears anywhere in that text: under any table, in a comment, or in prose. The header's "deliberately
not checked" list names three things (the `Auth` column, prose/Descriptions, column *types*). This is a
fourth, and it is a false negative inside the one thing the header says *is* covered ("Presence is
checked; type is not").

Measured rather than hypothesised: `locale` occurs exactly once in §5, at line 261, inside the
`currencies` block. A future `ALTER TABLE projects ADD COLUMN locale` would therefore pass the guard
with §5 never mentioning it. That is the class of the 2026-09-17 audit's finding #9 (`projects.code`
missing) — one of the seven findings this guard was built for (header `:6-14`).

I checked whether any column passes vacuously **today**: of the four whose name appears in §5 outside
their own `CREATE TABLE` block, all four are in fact documented — `clients.group_id` as a comment at
`ARCHITECTURE.md:518`, `resources.role_id` in the block at `:282`, `resources.profile` and
`resources.profile_computed_at` as comments at `:343-344`. **No live divergence.**

**Root cause.** §5 is hand-written SQL-ish prose with no parseable table boundaries, so a table-scoped
check would need the parser the cycle explicitly declined to write (header `:11-14`: "a generator would
have to rewrite §5's 104 hand-written semantic comments"). The choice is defensible; leaving it out of
the limits list is not, because that list is what a future reader uses to decide whether the guard
covers their case.

---

### F6 — `claude-md-guard` accepts all 65 bold spans of `CLAUDE.md` as pointer targets, not its 25 headings

**Type:** guard weaker than stated · **Severity:** Low-Medium

**Location:** `scripts/claude-md-guard.test.js:174-177`, header `:28-36`.

**Evidence.** `targets` is the union of `/^#{2,4} (.+)$/gm` and `/\*\*([^*]{3,120})\*\*/g`. Measured on
the current file: 25 headings, 65 bold spans. The header explains the bold branch as covering one case
— `"Infrastructure safety …", which several files cite by name and which must never become a
heading-only check` — but the implementation admits every bold span, including `"Snapshot before
touching it."`, `"Treat it as a risky, confirm-first action."` and `"This is the ordinary branch only"`.
A pointer naming any of those resolves while naming no section. Combined with the `startsWith` prefix
match the header *does* name (`:35-36`), the check proves rather less than "the named section exists".

**Root cause.** The one genuine case (a bold block that is not a heading) was generalised to the whole
bold class instead of being enumerated. Low severity because the failure direction is permissive: it
cannot turn `main` red falsely, it can only fail to catch a dangling pointer.

---

### F7 — `PROCESS.md` §1 omits three of Gate 4's steps, including the two written after real incidents

**Type:** description vs behaviour drift (handoff question 2) · **Severity:** Medium

**Location:** `docs/superpowers/PROCESS.md:26`; `.claude/commands/finish-cycle.md:97` (DB backup),
`:116` (apply new migrations), `:124` (backend restart).

**Evidence.** §1's `/finish-cycle` row describes the tail of the sequence as "… → merge `--no-ff` con
riepilogo pre-merge esplicito e pulizia worktree → `/sync-docs` + report persistito". Gate 4 actually
runs, in order: pre-merge summary → merge → **`scripts/backup-db.sh`** (`:97`, automatic) → **apply new
migrations** (`:116`) → **backend restart** (`:124`, a human gate that can leave merged backend code
not live) → worktree cleanup → branch deletion. `grep -c "backup-db\|pdash-api\|migrazion"` over
`PROCESS.md` returns five hits, none in §1 and none about Gate 4.

**Root cause — and it is not this programme.** The three steps were added by `bf95d9f` ("feat: automate
DB backup as part of finish-cycle Gate 4"), `bc561d0` (the migration-apply step) and `41bab43`
("docs: add backend restart gate to /finish-cycle after merge"); none of those commits touches
`PROCESS.md`, and none appears in its history. §7 condition 3 covers them exactly ("Rientra qui anche la
modifica dei gate di `/finish-cycle`") and was not applied at the time.

**Why it matters now rather than then.** The programme's own cycles *did* honour §7 — cycles 1, 2, 4 and
6 all updated `PROCESS.md`. The result is an asymmetric document: §1 now describes the newest branch
(the no-code gate, 2026-10-09) in a clause of its own, while three older Gate 4 steps — two of them
written because of real incidents (`020` sitting unapplied; `pdash-api` serving pre-merge code) — are
still absent. A reader using §1 as the map of the process under-reads Gate 4 by half.

---

### F8 — `PROCESS.md` §6 uses two numbering schemes at once, and both are cited

**Type:** pointer integrity · **Severity:** Low

**Location:** `docs/superpowers/PROCESS.md:112` (`## 6.`), `:116` (point 1), `:134` (point 4), `:153`
(point 5), `:159` (`## 6.6`); citations at `.claude/commands/finish-cycle.md:12`, `:35`, `:36`, `:69`
and `PROCESS.md:117`.

**Evidence.** Inside `## 6.` the subdivisions are bold points `1, 2, 3, 4, 4b, 4c, 5`, and they are
cited as `§6.1` (`PROCESS.md:117`, "→ **nativa** per §6.1") and `§6.4` (`finish-cycle.md:35`, `:36`,
`:69`). But `## 6.6` (`:159`) is a **top-level heading**, a sibling of `## 6.`, with its own points 1-5
— cited elsewhere as "PROCESS.md 6.6.5" (commit `eb36f2a`). `finish-cycle.md:12` cites both schemes in
one breath: "PROCESS.md §6/§6.6".

So `§6.4` means "point 4 inside §6" while `§6.6` means "the section after §6", and `§6.5` would be
unresolvable — point 5 of §6 (`:153`), or a sibling that does not exist. Every citation that exists
today does resolve; the defect is that the scheme cannot be followed by a cold reader, and nothing
checks these pointers (per F4, the pointer guard only looks for `CLAUDE.md` targets).

**Root cause.** §6.6 was added as a heading by a later cycle (`eb36f2a`, 2026-10-07) alongside a §6 that
had already grown bold-numbered points, and the two conventions were never reconciled — the same hazard
`sync-docs` §5b warns about in prose for the manual's sections ("quei numeri si sono già spostati una
volta: leggere gli heading del file, non un numero in prosa").

---

## Ruled out — checked, no divergence

- **The classifier's rule vs its three prose descriptions.** `RUNTIME_LOADED_ROOT_MD = ['TEST_CASES.md']`
  (`classify-cycle.mjs:46`) matches `finish-cycle.md:31`, `PROCESS.md:146` and `sync-docs/SKILL.md` §3;
  all three correctly refuse to restate the list and point at the constant. Fail-closed is real, not
  merely claimed: `classifyNameStatus` returns `ordinary` on a truncated stream (`:67-72`) and on an
  empty diff (`:77-80`), and the CLI writes nothing to stdout on a throw (`:117-121`) — pinned by three
  tests, including a no-repository integration case.
- **The no-code branch's teardown rule.** The one-way-door preamble (`finish-cycle.md:27`), step 6's
  no-code bullet (`:60`) and `PROCESS.md:149` agree: `status` is read-only, and a running stack is
  reported, never removed, on that path. (The known `:27`-vs-`:49` rebuild tension is a different
  sentence, taken as given per scope.)
- **"No" to the classification question.** `finish-cycle.md:59` and `PROCESS.md:149` both say it means
  "the classification is wrong", degrade to the ordinary path, and do not stop the cycle; the deadlock
  argument (pre-flight check 2 refuses a dirty tree) holds.
- **Gate 4's out-of-scope check not firing on the no-code path** is stated on both sides
  (`finish-cycle.md:32`, `:61`, and the check itself at `:93`; `PROCESS.md:149`) and lands in a report
  section that exists (`:169`, "Roadmap notes").
- **The three guards are actually reached by the process.** `vitest.config.js`'s `include` is
  `['js/**/*.test.js', 'scripts/**/*.test.js']`; `npx vitest run scripts/` → 3 files, 99 tests, green.
  Gate 1's `npm test` therefore runs all three.
- **Every `docs/` path cited by `ARCHITECTURE.md` exists** (31 distinct paths, checked individually), as
  does its one `CLAUDE.md` section pointer. F4 is about nothing *keeping* that true.
- **No column or table currently passes `architecture-guard` vacuously** — see F5's second half; all
  four candidates are genuinely documented.
- **Gate 3's three entry paths and the 3-round cap** are mutually exclusive and jointly exhaustive as
  written (collected-from-Gate-2 / step 0 total skip / step 0b scoped), and the dead-run clause (`:67`,
  "A run that cannot be read is never a clean review") closes the one path that could have concluded
  "clean" from silence. The only defect found in that machinery is F3.

---

## Out of scope / roadmap notes

- **A fourth exact-pin guard exists outside the audited six**, carrying F1's exposure identically:
  `js/lib/test-cases-parse.test.js` asserts exact case and section counts, and `sync-docs` §3 instructs
  the Gate 5 run to adjust those numbers — again after the last test gate. Not audited here; named so a
  fix cycle for F1 can decide whether to cover it in the same move.
- **`ARCHITECTURE.md` has no size ceiling** (76,800 B) although `sync-docs` §1 applies the same routing
  rule to it. Raised inside F4, but acting on it means touching a document this scope excluded.
- **The 10 known tensions** were taken as given by the user's decision and were **not** re-verified. Two
  sit next to findings above — the Gate 2 classification-paragraph tension (F3's neighbourhood) and the
  `ARCHITECTURE.md` parallel migrations list (F4's) — and those findings are distinct defects, not
  restatements of them.
- **Cycle durations** (handoff question 5) were excluded by the same decision; the question remains
  open, and the evidence for it is still one complete set (cycle 6).
- **Handoff question 4** (is `sync-docs` §2's routing rule still applicable cold?) is answered here only
  from the process side: the rule's *enforcement* is coherent and measured, and the 13 over-length
  entries are honestly pinned as debt (`claude-md-guard.test.js:48-55`). Whether the rule reads clearly
  against the document it governs needs `CLAUDE.md` in scope, which this audit did not have.

---

## Addendum (same day) — scoping probe on the document set, and what it changes in F4

Run after the findings above, at the user's request, to decide whether a **second** audit covering the
restructured documents was worth opening. Read-only, mechanical, no claims about content: cited file
paths resolve, `PRD.md`'s Index vs `docs/prd/` in both directions, `§N` citations vs headings that
exist, quoted section pointers, internal `#anchor` links — over `CLAUDE.md`, `ARCHITECTURE.md`,
`PRD.md`, the 9 `docs/prd/` files and `operational-manual`'s SKILL. **Conclusion: a second audit is
not justified.** Three results, one of which changes a fix above.

**1. The structural machinery is clean.** `PRD.md`'s Index and `docs/prd/` match exactly in both
directions (9 files, 9 named, no orphan either way). Zero dangling internal anchors across all 13
files. `§12`/`§14` appear only in the sentences explaining that they are deliberately unused. The two
`§N` citations that do not resolve — `§11.3` (`docs/prd/planning.md:56`) and `§16.9a` — are **already
self-declared** as pre-split debt in `PRD.md:11`; the probe found exactly what the document admits to,
nothing hidden.

**2. One live cluster: four present-tense statements about two files deleted on 2026-07-27**
(`2d4446f`, −8,221 lines). `ARCHITECTURE.md:1025` ("The mechanism still exists in `js/config-form.js`
(unchanged)"), `docs/prd/project-config.md:40` ("A raw-JSON editor toggle exists in the underlying
shared `js/config-form.js`") and `:72` ("`js/config-form.js` still contains the underlying
`cfgSaveReforecastSnapshot`/`cfgRollbackReforecast` functions"), plus `docs/pages/portfolio.md:9`
(`js/dashboard.js` "is now fully orphaned dead code", when it is gone, not orphaned). Every other
mention of both files in the repository is historical and correct ("the former…", "No longer loads…").
Root cause: `2d4446f` did touch `ARCHITECTURE.md` (−2) and `CLAUDE.md` (−1) and simply missed these.
This is docs-vs-code, i.e. the standing cadence audit's territory (`PROCESS.md` §2) — recorded here
because it was found, not because this audit claims that ground.

**3. F4's fix changes shape.** The pointer form `claude-md-guard` checks — a section name in quotes
after the document name — has **0 occurrences** for `ARCHITECTURE.md` and `PRD.md`: extending that
check to them would guard nothing that exists today. What is genuinely unguarded is **cited file
paths**: 199 distinct across the 13 files, by no test at all, and that is precisely where result 2 was
hiding. So F4's remedy is "every cited path resolves", not "every cited section name resolves" —
cheaper, and it would have caught the cluster three months ago. F1, F2 and F4 therefore touch the same
two guard files and share one root cause (enforcement written per-cycle, never over the set), and
belong in one fix cycle rather than three.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
