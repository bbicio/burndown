# Closing the guards' enforcement over the set (cycle 1 of the cold-review fixes)

Date: 2026-10-12. Scenario 3 (audit → fix). Brief:
`docs/superpowers/briefs/2026-10-12-guards-enforcement-set-brief.md`. Source audit:
`docs/superpowers/audits/2026-10-12-process-construct-cold-review-audit.md`, findings **F1**, **F2**,
**F4** plus addendum §2. First of four fix cycles derived from that audit.

## 1. Problem

The audit's own root-cause statement (addendum §3): the enforcement was written **one cycle at a
time, never computed over the set of guards**. The three findings in this cycle are three faces of
that, and they touch the same two guard files plus `.claude/commands/finish-cycle.md`.

**F1 — Gate 5 pushes to `main` with no test gate, and it is the step that edits the pinned numbers.**
`npm test` appears exactly once in `finish-cycle.md`, at Gate 1 (`:16`). Gate 5's five steps are
`/sync-docs` (`:143`) → write the report (`:144`) → show the diff (`:182`) → ask (`:183`) →
`git add`/`commit`/`push origin main` (`:185`). Nothing verifies anything between `/sync-docs`'s edits
and the push — and what `/sync-docs` edits at that point is exactly what the guards pin. The previous
cycle demonstrates it: `3edd128`, the post-merge Gate 5 commit, changed `CLAUDE.md` **and**
`scripts/claude-md-guard.test.js` (pin 12,538 → 12,758 B) in one untested commit.

**F2 — `architecture-guard` inverts the documentation order the process prescribes.**
The guard asserts `expect(undocumented).toEqual([])` for every route handler (`:151`), every table
created by a migration (`:188`) and every column added by an `ALTER TABLE` (`:203`). A branch that
adds an endpoint or a migration therefore **fails `npm test`** until `ARCHITECTURE.md` §5/§6 documents
it, and Gate 1 is blocking (`:16`). But the step that updates `ARCHITECTURE.md` is `/sync-docs` §1,
invoked at **Gate 5, post-merge**. `sync-docs` §2 has an explicit paragraph about its own guard
(`SKILL.md:24`); §1 has no equivalent sentence, `PROCESS.md` names neither guard, and
`finish-cycle.md` names no guard at all (`grep -c guard` = 0). The guard has never been exercised on
such a branch — `git diff --name-only 660ae1e..HEAD -- api/` is empty.

**F4 — the file paths the documents cite are covered by no guard.** `claude-md-guard` declares its own
limit (`:35-39`) and walks `docs/` + `.claude/` looking only for pointers at *named `CLAUDE.md`
sections*; `architecture-guard` checks no citations at all. The audit's addendum measured that the
quoted-section-name form has **0 occurrences** for `ARCHITECTURE.md` and `PRD.md`, so widening *that*
check would guard nothing that exists. What is genuinely unguarded is **cited file paths**, and that
is where the addendum's live defect cluster was hiding.

**Addendum §2 — four present-tense statements about two files deleted on 2026-07-27** (`2d4446f`):
`ARCHITECTURE.md:1025`, `docs/prd/project-config.md:40` and `:72` (`js/config-form.js`), and
`docs/pages/portfolio.md:9` (`js/dashboard.js` described as "now fully orphaned dead code", when it is
deleted, not orphaned). These are **cited paths that do not exist**, so correcting them is a technical
prerequisite of F4's check, not an adjacent finding.

## 2. Measurement that shaped the design

Run read-only during `/brainstorming`, over the walk the Brief proposes — `docs/` + `.claude/` minus
`docs/superpowers` and `.claude/worktrees`, plus `CLAUDE.md`, `ARCHITECTURE.md`, `PRD.md`,
`TEST_CASES.md` — counting only paths whose first segment is a real repo directory:

**70 files, 261 distinct rooted cited paths, 10 of which do not resolve.** Two are the addendum §2
cluster. The other eight are **correct historical prose** ("the former…", "deleted in Cycle B together
with…") about files whose deletion was verified by `git log --diff-filter=D`, plus one output path and
one proposal that was rejected:

| Path | Why it does not resolve |
|---|---|
| `js/config-form.js` | deleted `2d4446f` (2026-07-27) — addendum §2 cluster |
| `js/dashboard.js` | deleted `2d4446f` (2026-07-27) — addendum §2 cluster |
| `js/main.js` | deleted `2d4446f` (2026-07-27) |
| `js/ai.js` | deleted `70082a5` (Cycle B, personal-API-key removal) |
| `docs/js/ai.md` | deleted with `js/ai.js` in the same cycle |
| `js/pipeline-board.js` | deleted `5a5cef5` (Vue migration) |
| `js/planning.js` | deleted `aed9679` (folded into `planning.html`) |
| `js/settings.js` | deleted `d79b6aa` (Settings page cycle) |
| `docs/OPERATIONAL_MANUAL.md` | an **output** path in `operational-manual`'s SKILL, not a citation |
| `scripts/gen-architecture.mjs` | cited only in `docs/handoff-ciclo5.md:32`, inside the quoted cycle-5 proposal that was **rejected**; never existed |

**Consequence for the design.** A naive "every cited path resolves" check is red on the current repo
*even after* the addendum §2 corrections, because eight of the ten are deliberate prose. The check
therefore carries an explicit allowlist, and its honest value is stated below rather than overclaimed.

Also measured: the markdown-link citation form (`](path)`) contributes 55 rooted paths and **0**
missing, so including it is free coverage.

## 3. Expected behaviour

### 3.1 F1 — a blocking `npm test` at Gate 5

`.claude/commands/finish-cycle.md`, Gate 5 gains a new **step 3** between the report being written
(step 2) and the diff being shown. Today's steps 3, 4, 5 become 4, 5, 6.

The new step runs `npm test` with the **same semantics as Gate 1 step 1**, stated explicitly so it
cannot be read as advisory: on failure, stop, show the failing output verbatim, no `git add`, no
`git commit`, no `git push`. One deliberate difference from Gate 1, stated in the step: the merge has
already happened, so the fix belongs on `main` and the gate is re-entered from its step 1 — this is
**not** a "re-run `/finish-cycle` from the top" case.

The step also records the free consequence the Brief asks to declare: the fourth exact pin outside the
six audited files, `js/lib/test-cases-parse.test.js`'s case and section counts — which `/sync-docs` §3
adjusts at exactly this point — falls inside this run, because `vitest.config.js`'s `include` is
`['js/**/*.test.js', 'scripts/**/*.test.js']`. No additional action.

One cross-reference inside the gate is corrected: step 1 says the memory update "is NOT part of the
`git diff` shown in step 3" → step 4. No file outside Gate 5 cites Gate 5's step numbers (verified by
grep over `.claude/` and `PROCESS.md`).

### 3.2 F2 — two sentences of prose, no gate reordering

- **`.claude/skills/sync-docs/SKILL.md` §1** gains the bullet that mirrors the one §2 already has at
  `SKILL.md:24`: `scripts/architecture-guard.test.js` fails `npm test` on a route handler, a
  migration-created table, or an `ALTER TABLE`-added column that §5/§6 does not document — so §5/§6
  are updated **on the branch**, not here at Gate 5, because a branch that adds an endpoint or a
  migration cannot reach Gate 1 green otherwise.
- **`.claude/commands/finish-cycle.md` Gate 1**, under step 1: what a red from that guard means (an
  undocumented route, table or column — not a code defect) and that the fix is an `ARCHITECTURE.md`
  §5/§6 edit **on the branch**, never deferred to Gate 5.

Nothing else in either file changes. No gate is reordered and `/sync-docs`'s scope is untouched.

### 3.3 F4 — the cited-path guard

Two new files. No new runner, no new script, no hook, no second traversal.

**`scripts/lib/live-docs.mjs`** — the walk, extracted from `claude-md-guard.test.js` unchanged:
`liveMarkdown(dir)` plus the `SKIP_DIRS` set (`docs/superpowers`, `.claude/worktrees`) with both of
its existing reasons carried over as comments. `claude-md-guard.test.js` is changed only to import it
instead of defining it, so the scope has exactly one definition. `vitest.config.js` needs no change:
its `include` matches `*.test.js`, and a plain `.mjs` module is an import, not a suite.

**`scripts/doc-paths-guard.test.js`** — asserts that every **repo-rooted** file path cited by a live
document exists on disk, unless it is allowlisted.

- **Document set:** `liveMarkdown('docs')` + `liveMarkdown('.claude')` + `CLAUDE.md`,
  `ARCHITECTURE.md`, `PRD.md`, `TEST_CASES.md`. `docs/handoff-*.md` stay **in** scope: they are inside
  the walk the Brief named, and excluding them would only have removed one allowlist entry.
- **Citation forms:** backticked and markdown-link (`](path)`).
- **Rooted:** first segment in `docs | js | css | api | scripts | backups | .claude`. This deliberately
  skips the shorthand forms the documents also use — `routes/projects.js`, `middleware/auth.js`,
  `services/llm.js`, `lib/assistant-chat.js`, `sync-docs/SKILL.md` — which are abbreviations of real
  files, not resolvable paths. Checking them would require guessing a base directory, which is a
  content judgment.
- **Extensions:** `md | html | js | mjs | css | sql | sh | json | png`.
- **Allowlist:** a `GONE` map of the 10 paths in §2, each with its deletion commit or its reason, as a
  literal in the test file. Same idiom as the 13 pinned over-length `CLAUDE.md` entries: the debt is
  held visible and measured rather than hidden.
- **A sanity assertion** that the walk still reaches a non-trivial set (files and rooted paths above a
  floor), so a broken walk cannot pass by finding nothing — the same protection
  `claude-md-guard.test.js` gives itself at `:182`.

**Existence only, never content** — per the Brief's constraint. The file's header states the limits
in the established `WHAT IS DELIBERATELY NOT CHECKED` form, including the one that matters:

> An allowlisted path is no longer checked, so this guard's value is **at the moment of deletion**.
> `2d4446f` would have turned it red and forced the author either to re-point the mentions or to
> allowlist them — which is what would have surfaced the four present-tense statements in 2026-07. It
> cannot re-detect a tense error on a file that is already allowlisted, and it cannot judge whether a
> path that resolves is the *right* path.

The two new `CLAUDE.md` File-structure entries these files need — and the raise of the exact 12,758 B
pin they force — are **not** written on the branch. They are `/sync-docs` §2's work at Gate 5, and the
new step from §3.1 is what verifies them. The cycle closes its own loop on itself.

### 3.4 Addendum §2 — four corrections

| Location | Change |
|---|---|
| `ARCHITECTURE.md:1025` | "The mechanism still exists in `js/config-form.js` (unchanged)" → past tense, the file was deleted in `2d4446f` (2026-07-27) |
| `docs/prd/project-config.md:40` | "A raw-JSON editor toggle exists in the underlying shared `js/config-form.js`" → existed, in the since-deleted file; the stale trailing claim that `js/config-form.js` "remains loaded by `planning.html`" goes too |
| `docs/prd/project-config.md:72` | "`js/config-form.js` still contains the underlying `cfgSaveReforecastSnapshot`/`cfgRollbackReforecast` functions" → contained, until its deletion |
| `docs/pages/portfolio.md:9` | "`js/dashboard.js` … is now fully orphaned dead code" → was orphaned, and has since been deleted (`2d4446f`) |

Each is a tense or reference correction to a statement about a deleted file. No other claim in those
paragraphs is touched, and no sentence is reworded for style. Every *other* mention of both files in
the repository is already historical and correct — verified during `/brainstorming`, and the reason
the design uses an allowlist rather than a mass rewrite.

**Correction to the Brief's rationale, which the allowlist design invalidates.** The Brief calls these
four a *technical prerequisite*, on the reasoning that "without correcting them the F4 guard is born
red". With the allowlist chosen in §3.3 that is **no longer true**: `js/config-form.js` and
`js/dashboard.js` are allowlisted — they must be, because correct historical mentions of them remain
elsewhere — so the check is green with or without these corrections. They stay in this cycle for two
reasons that do hold:

1. They are the live defect the audit's addendum found, and the Brief makes them an acceptance
   criterion.
2. The allowlist entry for each of those two files carries the reason *"only historical mentions
   remain"*. Until these four are corrected, that reason is **false**, and a guard whose own
   justification is untrue is worse than no guard. The corrections are what make the allowlist honest
   — a weaker link than the Brief claimed, but a real one.

### 3.5 `PROCESS.md` (§7 condition 3)

This cycle modifies `/finish-cycle`'s gates, so §7 condition 3 applies. A new short section **§4b —
Guardie meccaniche: i guard in `npm test`**, placed beside the existing §4 ("Guardia infrastrutturale")
because both are guards, and mirroring §6's own `4b`/`4c` idiom. It states: the three guards and what
each one turns red; that an `architecture-guard` red is fixed on the **branch**, not at Gate 5; and
that Gate 5 now runs `npm test` before showing its diff.

**§1 and §6 are not touched** — they belong to cycle 2 (findings F7 and F8). Cycle 2 will re-home §4b
under whatever numbering it settles on, which is why its placement here is deliberately low-stakes.

## 4. Verification

- `npm test` natively (host Node ≥ 20.12; this host runs Node 24, ~48 s for the full suite). During
  the work, only the touched files: `npx vitest run scripts/`.
- **The guard's red path must be demonstrated, not assumed.** Green on an unchanged repo proves
  nothing — a check that matches no path is also green. Per §3.4's correction, the four addendum
  statements cannot serve as that demonstration either, since both their files are allowlisted. So
  the failing case is written **first** (TDD): a temporary citation of a rooted path that does not
  exist and is not allowlisted must fail the guard with that path named in the message, and an
  allowlisted path must not. Only then is the real assertion run against the repo. The sanity floor
  from §3.3 guards the opposite direction, a walk that silently reaches nothing.
- **The four corrections in §3.4** are verified by grep: the present-tense phrases ("still exists in",
  "still contains", "exists in the underlying shared", "is now fully orphaned") no longer appear at
  those four locations, and no other mention of either file changed.
- The prose changes (§3.1, §3.2, §3.5) have no test. They are verified by reading them back against
  the files they describe — step numbers, the `SKILL.md:24` wording they mirror, and the guard names.
- Expect `node scripts/classify-cycle.mjs` to report **`ordinary`** at Gate 2, because the diff
  contains `.js`/`.mjs` files. That is correct and must not be "fixed": per `PROCESS.md` §6's last
  bullet, a documentation cycle that adds a guard test is the known symmetric case, handled as an
  explicit §3 derogation (no stack, no browser verification, noted in the report) — never by widening
  the classifier's rule.

## 5. Acceptance criteria

- [ ] Gate 5 runs `npm test` before showing the diff, blocking with Gate 1's semantics.
- [ ] Gate 5's internal step references are consistent after the renumbering.
- [ ] `sync-docs` SKILL.md §1 names `architecture-guard.test.js` and says §5/§6 are updated on the branch.
- [ ] `finish-cycle.md` Gate 1 explains a guard red and where the fix belongs.
- [ ] `scripts/doc-paths-guard.test.js` exists, fails when a cited rooted path does not resolve and is
      not allowlisted (**demonstrated** on a deliberately introduced citation, §4), and passes on the
      current repo.
- [ ] `scripts/lib/live-docs.mjs` is the single definition of the walk; `claude-md-guard.test.js`
      imports it and still passes unchanged otherwise.
- [ ] The four addendum §2 statements no longer assert that `js/config-form.js` / `js/dashboard.js` exist.
- [ ] `PROCESS.md` §4b names the guards (§7 condition 3 satisfied).
- [ ] `npm test` green.

## 6. Explicitly excluded scope

- **The exact pins are not moved out of the files `/sync-docs` edits.** That alternative was weighed
  and rejected in favour of §3.1's gate.
- **No guard matcher's precision is touched** (F5, F6) — cycle 3.
- **`PROCESS.md` §1 and §6's numbering are not touched** (F7, F8) — cycle 2.
- **`<reviewed-sha>` is not touched** (F3) — cycle 4.
- **No size ceiling for `ARCHITECTURE.md`** — raised inside F4, but it would touch a document the
  audit excluded.
- **No second audit of the documents** — the addendum concluded it is not justified.
- **The eight non-cluster unresolved paths are not re-pointed in prose.** They are correct historical
  statements; the allowlist records them. Re-pointing them would be a separate Brief.
- **No linter, runner, script or hook is introduced**; the guards stay inside `npm test`.

## 7. New findings during this cycle

Per `PROCESS.md` §2 Scenario 3, any defect found during `/brainstorming` or execution is isolated and
proposed as a future Brief, never folded into this fix.

- **None beyond the measurement in §2**, which is recorded in the code itself as the `GONE` allowlist
  rather than left as an open question.
- One **claim in the Brief is wrong** and is corrected here rather than carried: addendum §2's four
  statements are not a technical prerequisite of the F4 check once the check carries an allowlist. See
  §3.4. This is a defect of the Brief's reasoning, not a new defect in the construct, so it is fixed
  in place rather than deferred — the scope of the work is unchanged either way.
- Raised and decided *outside* this cycle's scope: whether cycle 2 should widen from "F7 + F8 as two
  patches" to a sentence-preserving restructure of `PROCESS.md` under one numbering scheme. Discussed
  during this `/brainstorming` at the user's initiative; it changes **cycle 2's** Brief, not this
  cycle. Nothing here depends on the outcome.
