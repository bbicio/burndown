# Economy of approvals — replacing ratification gates with a decision ledger (M7)

Date: 2026-10-12. **No Brief file.** M7's agreed content lived only in project memory
(`project_merged_process_backlog.md`, item 2); the user opened the cycle straight with
`/brainstorming`, so this spec is the first artefact. The scope was then widened in that
conversation beyond the backlog's two items — see §2.

M7 is item 2 of the merged process backlog agreed 2026-10-12, moved to that position by the user
because it makes every later cycle cheaper. Its immediate predecessor, CR2 (`a31a2f9`), is its best
argument: a prose-only cycle touching 3 files paid Brief → Spec → Plan → 5 tasks → 3 review rounds →
5 approval gates.

## 1. Problem

A development cycle in this project stops for a human answer at twenty distinct points, several of
which repeat within one cycle. They are not of one kind, and treating them as one kind is why the list
grew: every past cycle that added a safeguard added a question, because a question is what a safeguard
looks like from inside a checklist.

The inventory, taken from `.claude/skills/feature-brief/SKILL.md`,
`.claude/skills/audit-to-brief/SKILL.md`, the plugin skills `superpowers:brainstorming` and
`superpowers:writing-plans`, `docs/superpowers/PROCESS.md` §6.1, `.claude/commands/finish-cycle.md`
and `.claude/skills/sync-docs/SKILL.md`:

| # | Where | Question | N per cycle |
|---|---|---|---|
| 1 | `feature-brief` | scenario 1/2/3 classification, never inferred | 1 |
| 2 | `feature-brief` | confirm the proposed **excluded scope** | 1 |
| 3 | `feature-brief` | clarifications on expected behaviour / constraints | 0-N |
| 3b | `audit-to-brief` | confirm the findings → cycles grouping | 1 (scenario 3 only) |
| 4 | `/brainstorming` | clarifying questions, **one per message** | 1-N |
| 5 | `/brainstorming` | choice among 2-3 approaches | 1 |
| 6 | `/brainstorming` | design approval **section by section** | 1 per section |
| 7 | `/brainstorming` | review of the **written spec** | 1 |
| 8 | `writing-plans` | review of the **Plan** + execution-method choice | 1 |
| 9 | `PROCESS.md` §6.1 | mode + model declaration, "confermi?" | 1 |
| — | execution | *none*: subagent-driven forbids check-ins, 4 exceptions only | 0 |
| 10 | Gate 2 step 1 | spin up / reuse / rebuild the stack | 1 (ordinary only) |
| 11 | Gate 2 step 6 | "verified in the browser?" / "is this a no-code cycle?" | 1 |
| 12 | Gate 3 step 3 | "fix now, follow-up, or a mix?" | 1 per round, max 3 |
| 13 | Gate 3 cap | at round 3: (a) continue / (b) accept all / (c) stop | 0-1 |
| 14 | Gate 4 step 2 | "Proceed with merge?" | 1 |
| 15 | Gate 4 step 7 | "restart `pdash-api`?" | 0-1 |
| 16 | Gate 4 step 9 | "delete the local branch?" | 1 |
| 17 | `/sync-docs` §5 | "is this change user-visible?" (when in doubt) | 0-N |
| 18 | Gate 5 step 5 | "commit and push the doc/report changes?" | 1 |
| — | Gate 6 | *no question*: it is output, and it repeats Gate 5 | 0 |

CR2 paid: 1, 2, 4×n, 5, 6×n, 7, 8, 9, 11, 12×3, 18 — plus Gate 6 restating Gate 5.

### 1.1 Four natures, which must not be treated alike

- **A — gates on an irreversible action** (14, 15, 18; 16 is reversible — the branch survives in the
  `--no-ff` merge commit). A "no" has material consequences.
- **B — informational gates: the human knows something the process cannot derive** (1, 2, 3, 3b, 4,
  11, 17). The answer is an *input*, not an assent. Removing one does not save work; it makes the
  process guess. C1 — a single round-trip for the two classification questions — was already cut by
  the user for this reason.
- **C — ratification gates: the human is asked to bless an artefact they must first read** (5, 6, 7,
  8, 9). **This is M7's target.** "Do you approve?" on a 300-line document transfers to the reader the
  job of finding what might be wrong. Worse, 8 and 9 ask the same thing (execution method) at the same
  instant, and 6+7 ratify the same content twice — once as a chat design, once as its transcription
  into `docs/superpowers/specs/`.
- **D — disposition gates: what to do with findings** (12, 13). Not ratifications — each finding is a
  real decision. But 12 repeats verbatim on every round.

And, separately, **Gate 5 / Gate 6 duplication**: not a stop at all, but the same content emitted
twice (`.claude/commands/finish-cycle.md:196-203` restates the report written at `:142-195`).

### 1.2 The Gate 4 automations the user asked for

Raised by the user during brainstorming, outside the backlog's text:

- **15 (restart).** The question's "no" branch (`:128`) leaves backend code merged but not live and
  prints a warning about it. Nobody wants that state; asking for it is asking whether to create a
  known hazard.
- **16 (branch deletion, `:138`).** Reversible, as above.
- **Backup (`:98`).** `scripts/backup-db.sh` runs on *every* merge. The user's position: tie it to the
  database actually being touched.

## 2. Scope

**In scope:** class C in full (5, 6, 7, 8, 9) · the Gate 5 / Gate 6 duplication · class D partially
(12 only) · Gate 4 steps 3, 7 and 9 · the `CLAUDE.md` amendment those require.

**Out of scope, explicitly:** Gate 2 in its entirety · Gate 4 step 2 (the merge question) · all of
class B · the 3-round cap (13) · **M6**, the light path for prose-only cycles: this cycle does not
decide whether such cycles deserve one. A time-based database backup (see §6.3) is a separate backlog
item, not part of this cycle.

## 3. Where each change lives

`superpowers:brainstorming` and `superpowers:writing-plans` are plugin files
(`~/.claude/plugins/cache/superpowers-marketplace/superpowers/6.4.2/skills/`). Editing them would be
lost at the next plugin upgrade, and `brainstorming`'s `<HARD-GATE>` explicitly requires written-spec
approval before `writing-plans` may be invoked — so the override must come from somewhere with higher
precedence. This project already has that pattern: `CLAUDE.md`'s "Process override — closing a
development branch" overrides `superpowers:finishing-a-development-branch`.

So: **the rule in `PROCESS.md` §6b, a short pointer in `CLAUDE.md`.** Everything else is in files this
repo owns.

## 4. `PROCESS.md` §6b — Economia delle approvazioni (new section)

A first-level section with a letter suffix, exactly like the existing `§4b`. **It renumbers nothing** —
CR2 has just fixed this file's citation scheme, and renumbering breaks references in forms a grep
cannot see. Consequence accepted: `§7` stops being the file's last section while remaining its
concluding one.

Written in Italian, like the rest of `PROCESS.md`. It carries four things:

**a) The taxonomy of §1.1** (A/B/C/D), so that a future cycle adding a stop classifies it instead of
inventing it.

**b) The ratification rule.** A class-C gate does not ask "do you approve?". It presents the decisions
that could have gone another way and asks whether any should change. **With N=0 it says so and
proceeds without waiting.**

**c) The operational definition of "a decision that could have gone another way"** — without which N
inflates or empties at will. A choice that is **not** imposed by the Brief, by an upstream artefact or
by a written project rule, **and** that an informed reader could reasonably want different. Not
decisions: the mechanical consequences of a choice already in the ledger; project conventions;
anything already settled at a class-B stop.

**d) The guard boundary.** *A guard may require the artefact to carry the information; it may never
judge whether the information is correct.* This is the same line `PROCESS.md` §6.4c already draws for
`classify-cycle.mjs` ("the test is the path list, never a judgment about what the cycle is about").

The ledger lives as a mandatory final section, **`## Decisioni aperte`**, in every Spec and Plan.

### 4.1 Ledger entry format

Fixed and minimal, because §7's guard reads it:

```markdown
## Decisioni aperte

1. **<the choice made>.** Alternativa scartata: <what was not done>. Perché: <one sentence>.
2. ...
```

The sole alternative body, when there are none:

```markdown
## Decisioni aperte

Nessuna.
```

`Nessuna.` is a legitimate outcome, not an escape hatch — a cycle whose every choice was forced by its
Brief genuinely has none.

## 5. The five class-C gates after the change

### 5.1 `/brainstorming`: from N+2 stops to 1

- The design is presented **once, whole**, closed by the ledger. Section-by-section approval is gone.
- The choice among the 2-3 approaches (stop 5) becomes the ledger's first entry rather than a stop of
  its own.
- **A content is ratified once; transcribing it into a file is not new content.** After the single
  stop, the spec is written, committed, its path stated — and the cycle proceeds to `/writing-plans`
  with no second stop.
- **The one mechanical exception:** if writing the spec produces a decision that was not in the chat
  ledger, that is N>0 and the gate reopens with those entries only. This is a count, not a judgment.

### 5.2 `/writing-plans` + `PROCESS.md` §6.1: from 2 stops to 1

Today `writing-plans`' "Execution Handoff" asks "Does the plan capture what you want, and which
approach should we use?", and §6.1 (`PROCESS.md:138`) separately requires declaring mode and model and
waiting for confirmation. One message replaces both: the Plan's path, its N open decisions, the mode
**with the §6.1 rule that justifies it quoted**, and the model (`PROCESS.md:142`).

§6.1 is rewritten to say its declaration is made *inside* that handoff, not as a turn of its own.
**Its substance is unchanged** — the mode is declared and never deduced, and a bare user request
("subagent-driven") is still compared against the rule before being followed.

## 6. Gate changes in `.claude/commands/finish-cycle.md`

### 6.1 Gate 3 step 3 (`:76`) — the disposition rule

Round 1 asks as it does today. From round 2 on: if the user's round-1 answer stated a **rule** ("all
follow-up except correctness"), later rounds apply it and report the application ("round 2: 3
findings, 1 fixed under your rule, 2 to follow-up"), stopping only on a finding the rule does not
cover. **If round 1 was decided case by case without a rule being stated, none is invented.** The
3-round cap (`:80-86`) is untouched.

### 6.2 Gate 4 step 7 (`:125`) — restart becomes automatic

No question. When Gate 1 step 2 determined the diff touches `api/`, run `docker compose restart api`,
poll health, report the new `StartedAt` — all as today. The "no" branch and its warning are deleted,
and so is Gate 6's conditional sentence about a declined restart (`:201`).

### 6.3 Gate 4 step 3 (`:98`) — backup becomes conditional

It runs when **the stack is about to be touched**: the diff adds a file under
`api/src/db/migrations/` (step 6 will apply it) **or** the diff touches `api/` (step 7 will restart).
Otherwise it does not run and says so in one line.

This keeps `CLAUDE.md`'s Infrastructure-safety rule 2 ("snapshot before touching it", `CLAUDE.md:11`)
satisfied — in fact it aligns the backup with exactly the moments that rule names, instead of with
merge frequency.

**Why dropping the per-merge cadence is not a loss.** The three real sources of logical data loss are
each already covered: an agent-run Docker operation by rule 2 itself; a bad migration by the
conditional backup, which fires precisely there; a restart likewise. What remains is a destructive
command run by hand outside any cycle — and against that, "a dump per merge" is tied to the wrong
variable: protection depends on elapsed time, not on merge count. Six merges in a day produce six
useless dumps; two weeks without a merge produce none. If time-based protection is wanted it is its
own small thing (a periodic backup), recorded as a backlog item, not preserved here by accident.

**Stated in passing, unchanged by this cycle:** `backups/` is local, gitignored and holds 3 dumps. It
is not, and never was, a disaster-recovery strategy.

### 6.4 Gate 4 step 9 (`:138`) — branch deletion becomes automatic

`git branch -d <branch>` runs without asking. If it refuses (the branch is not merged — which after
step 5 would itself be a signal), report the refusal and do not force it. Worktree cleanup (step 8,
`:130`) was already automatic and is unchanged; the user's remark about it confirms the current
behaviour rather than requesting a change.

### 6.5 Gate 5 / Gate 6 — one register

The **file** is the register: it is the only persistent artefact, and for the project memory it is the
only trace that exists at all (`:193`). Gate 6 (`:196-203`) stops restating it:

- **Removed:** the per-gate enumeration (`:201`) and the project-memory line (`:200`) — both are in
  the file.
- **Kept:** the report's path; **one** outcome line; and the items that need a human action *after*
  the cycle (accepted follow-ups and Roadmap notes).
- **Unchanged, literal:** the mandatory final line (`:203`) and its surrounding instruction never to
  act on it.

## 7. Guard — `scripts/decision-ledger-guard.test.js`

Picked up automatically by `vitest.config.js:6` (`scripts/**/*.test.js`), so no config change, and run
by Gate 1 and by Gate 5 step 3.

It fails when a file under `docs/superpowers/specs/` or `docs/superpowers/plans/` **whose filename
date is ≥ 2026-10-12**:

1. has no `## Decisioni aperte` section, **or**
2. has one whose body is neither the literal sentinel `Nessuna.` nor a list in which **every** entry
   carries all three fields of §4.1 (the choice, `Alternativa scartata:`, `Perché:`).

The cutoff is the date in the filename, so there is no retroactivity to manage — with one wrinkle this
cycle creates for itself. Four files already carry today's date and predate the rule:
`specs/2026-10-12-guards-enforcement-set-design.md`,
`specs/2026-10-12-process-md-self-description-design.md`,
`plans/2026-10-12-guards-enforcement-set.md`, `plans/2026-10-12-process-md-self-description.md`. They
go in a **closed, named exemption list** in the test, with a comment saying it is closed: a date-only
cutoff would either fail on them or, if pushed to 2026-10-13, exempt this cycle's own spec and plan —
which are the two files the guard most needs to cover. The list can never legitimately grow; any
future addition to it means the guard is being worked around.

**What it deliberately does not check, to be written in the file's own header** (the convention
`scripts/architecture-guard.test.js` and `scripts/claude-md-guard.test.js` already follow): whether the
ledger is *complete*. A ledger with two impeccable entries when there were five decisions passes every
test. Nothing mechanical can see that; the only safeguards are that the ledger is committed and that
the Plan re-reads the spec. Checking quality here would be the process judging itself, which §6.4c
forbids elsewhere.

## 8. `CLAUDE.md` — three edits under a hard byte ceiling

`CLAUDE.md` is **62,813 B** against a **64,000 B** ceiling pinned at
`scripts/claude-md-guard.test.js:96`, whose own comment says the ceiling must not be raised to fit new
content. **~1,187 B is the entire budget for all three edits**, and one of them replaces existing text.
If the three do not fit, the answer is tightening the prose being edited — never raising the pin.

1. **Infrastructure safety, rule 3 (`CLAUDE.md:12`)** — a named derogation for the Gate 4 post-merge
   restart of `pdash-api` only: never `down`, never `-v`, never another command, never another moment.
   The reason is written next to it, because the rule exists because of the 2026-08-05 incident — and
   that incident was a `down -v` with volume loss, not a restart. The alternative state (backend code
   merged but not live) is itself a hazard.
2. **"Database backup & full recreation" (`CLAUDE.md:41`)** — "every merge to `main` leaves a fresh
   snapshot behind" becomes false the moment §6.3 lands and must be rewritten regardless.
3. **A "Process override — approvals" pointer**, next to the existing closing-a-branch override,
   naming `PROCESS.md` §6b as taking precedence over `superpowers:brainstorming`'s `<HARD-GATE>` and
   `superpowers:writing-plans`' Execution Handoff. Two or three lines at most.

## 9. Tests and verification

- `scripts/decision-ledger-guard.test.js`, new (§7), with its own unit cases: missing section, the
  `Nessuna.` sentinel, a well-formed list, an entry missing one of the three fields, a pre-cutoff file
  ignored. The convention to follow is `scripts/classify-cycle.test.js` — the rule lives in the test,
  not in prose.
- **This spec and this cycle's Plan are themselves the guard's first two subjects** and must pass it.
- `scripts/claude-md-guard.test.js` must stay green after §8 — this is the cycle's likeliest red.
- `scripts/doc-paths-guard.test.js` must stay green: §4, §6 and §8 cite repo paths.
- `npm test` is the whole gate; no browser verification applies (see §11).

## 10. Risks

- **The byte ceiling (§8) is the binding constraint**, not a formality. A plan task that writes the
  `CLAUDE.md` edits without first measuring them will discover this at Gate 1.
- **Removing the spec-review stop (§5.1) is the single largest change** and the one with no undo
  inside the cycle: a spec that drifts from the approved design reaches `/writing-plans` unreviewed.
  Accepted, with the §5.1 exception as the mitigation.
- **The disposition rule (§6.1) could over-apply**: a user's round-1 answer that reads like a rule but
  was meant case-by-case would silently dispose of round-2 findings. The rule's own wording —
  stated rule only, never inferred — is the mitigation, and it is the same "never inferred" principle
  §6.4c and `feature-brief` already rest on.
- **The ledger can become ceremony**: three fields filled to satisfy a guard. Unmeasurable by
  construction (§7); the honest answer is that M1's data will show whether the stops actually fell.

## 11. Cycle classification note

This cycle touches `PROCESS.md`, `.claude/commands/finish-cycle.md`, `CLAUDE.md` and adds
`scripts/decision-ledger-guard.test.js`. Because of the `.js` file, `node scripts/classify-cycle.mjs`
will return **`ordinary`** — correctly, since its rule is the path list and never a judgment about
content — while nothing in the diff is served by nginx. This is the symmetric case `PROCESS.md` §6.4c
already describes: handle it as a **§3 derogation**, decided explicitly at Gate 2 and recorded in the
report, with no stack and no browser verification. Do not "fix" it by widening the classifier.

## 12. Expected effect

Structurally, not numerically — a count would depend on how many clarifying questions and design
sections a given cycle happens to have, and inventing a figure here is the kind of prose claim this
project has been burned by. What changes for any cycle:

- stops 5, 6 (×N sections) and 7 collapse into **one**;
- stops 8 and 9 collapse into **one**;
- stops 15 and 16 disappear;
- 12 stops repeating from round 2 on, when a rule was stated;
- Gate 6 stops restating Gate 5.

Nothing in class A or class B is removed. **Not measured** — it becomes measurable with M1, the
backlog item right after this one.

## Decisioni aperte

1. **The spec is no longer ratified separately from the design (§5.1).** Alternativa scartata: keeping
   the second stop. Perché: it is the same content twice and the purest ratification in the whole
   chain; the residual risk of silent drift is mitigated by the mechanical N>0 exception.
2. **The new section is `§6b`, not `§8` (§4).** Alternativa scartata: appending `§8` after `§7`.
   Perché: `§6b` renumbers nothing, and CR2 has just stabilised this file's citation scheme.
3. **No time-based fallback on the backup (§6.3).** Alternativa scartata: taking a dump anyway when
   the newest one in `backups/` is older than N days. Perché: the per-merge cadence was tied to the
   wrong variable and the three real loss paths are already covered; a periodic backup is its own
   backlog item rather than a clause smuggled into this cycle.
4. **The guard checks each entry's shape, not the ledger's completeness (§7).** Alternativa scartata:
   checking only that the section exists. Perché: the three fields are what make an entry a decision,
   and verifying their presence is a form check, not a quality judgment — the boundary §4(d) states.
5. **A closed four-file exemption list rather than a 2026-10-13 cutoff (§7).** *Surfaced while writing
   the spec, not in the chat design — the §5.1 case.* Alternativa scartata: moving the cutoff one day
   forward. Perché: that would exempt this cycle's own spec and plan, the two files the guard most
   needs to cover, in order to spare four files that will never be edited again.
