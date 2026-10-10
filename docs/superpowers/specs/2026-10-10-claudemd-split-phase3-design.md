# CLAUDE.md context-size split — phase 3 (cycle 6)

Date: 2026-10-10. Scenario 2 (evolution of existing behaviour — the routing rule and the document it
governs). Brief: `docs/handoff-ciclo6.md`. Predecessor: phases 1+2, merge `8b24f9c`, report
`docs/superpowers/reports/2026-10-08-worktree-worktree-claudemd-split-finish-cycle.md`. Last cycle of
the process-optimization programme.

## 1. Problem

`CLAUDE.md` is the only project document loaded **in full at every session start**, so its size is a
fixed cost **per session**, not per cycle. Measured 2026-10-10: **91,694 B**, 548 lines.

Phases 1+2 brought it from 115,196 B to 88,827 B by applying the routing rule in
`.claude/skills/sync-docs/SKILL.md` §2 — per-page and per-file narrative belongs in `docs/`, not in
`CLAUDE.md`. Two days later the file is **back up 2,867 B** (88,827 → 91,694) and the `File structure`
block has gone from ~11,300 to 12,563 B, because cycles 3, 4 and 5 each added entries.

Two problems therefore, not one:

1. **Residual narrative.** 35,892 B of `CLAUDE.md` is page- or file-specific detail that §2 already
   says belongs elsewhere (moves 4, 5, 6 below).
2. **No brake.** Nothing fails when the file grows. The only thing holding §2 is a human applying it
   during `/sync-docs`, and that has now visibly slipped twice — including an 8-line entry added by
   the cycle-5 session itself, shrunk in `39f2d8d` only because it was noticed by hand.

## 2. Goals

- Move the 35,892 B out of `CLAUDE.md` into the destinations §2 already prescribes.
- Lose **no fact and weaken no rule** in the process.
- Leave a mechanical brake so phase 3 is not eroded the way phases 1+2 were.

**Expected result: ~58-59 KB (~15k tokens), not the ~52 KB quoted in project memory.** That older
figure was computed from an 88.8 KB base and smaller moves; it is not achievable and is not the
target. The honest arithmetic: 91,694 − 35,892 = 55,802, plus the inline residue in §6 (~2.5-3 KB).

## 3. Non-goals (explicitly excluded scope)

- **Shrinking the 13 over-length entries** of the `File structure` block (§8 decision). They are
  pinned, not fixed.
- Rewriting, re-ordering or copy-editing any moved text (§4).
- `docs/css/stylesheets.md`'s `?v=N` claims; `ARCHITECTURE.md`'s `Auth` column and column types; the
  client-side `CostGrid`/`Project` shapes; `docs/prd/pipeline.md` §4.9; the `:27`-vs-`:49` teardown
  contradiction in `finish-cycle.md`; the Gate 2 classification-paragraph prose reduction; the three
  low findings deferred by cycle 3. All listed as adjacent-not-in-scope by the brief and all stay so.
- The cold review of the whole six-cycle programme (brief's closing note) — after this cycle, not in it.

## 4. The governing constraint: move verbatim, never paraphrase

Cycle 4 ran this exact job in two halves and measured the difference: the **generated/verbatim** half
(nine files, 817 lines, never retyped) produced **zero** review findings; the **hand-compressed** half
(53 rewritten entries) produced **six**, every one a claim tidier than the truth. See
`feedback_doc_split_prose_claims` in project memory.

So, binding for this cycle:

- Moved text is **extracted mechanically** (a script reads the source range and writes it into the
  destination). It is never retyped, re-wrapped or summarised.
- Byte-identity of each moved block against its source range is **proved**, and the proof carries a
  **vacuous-comparison guard** — a deliberate check that the comparison is capable of failing.
  (Cycle 4's reviewer demanded exactly this when offered the same proof.)
- Hand-written text this cycle is limited to: the `## Current state` headers, the pointer lines, the
  `Invariants` block, the two new files' preambles, and the guard test. Nothing else.
- If a moved section looks like it deserves a rewrite, that is a **separate proposal**, not something
  folded into the move.

Extraction keys on **heading text, not line numbers** — the line numbers shift as each edit lands, and
three of them have already moved twice during this programme.

## 5. The moves

### Move 4 — 20,619 B, no rule change

Page/file-specific narrative sitting in cross-cutting `CLAUDE.md` sections, going where §2 already
points it.

| Destination | Sections moved | Bytes |
|---|---|---|
| `docs/pages/pipeline.md` | `Detail panel` (3,042), `Filter bar` (2,964), `Column header totals` (1,136), `Pipeline board layout` (2,417) | 9,559 |
| `docs/pages/costgrid.md` | `New Proposal / Clone` (3,755), `Version tab switching` (2,276) | 6,031 |
| `docs/js/nav.md` | `Navigation: sidebar and icon navbar` (5,029) | 5,029 |

**Structure at the destination — a new `## Current state` section.** The three destination files are
*chronological cycle logs* (`## Base state`, `## Board redesign (2026-10-06)`, …) and they deliberately
delegate current-state description back to `CLAUDE.md`: `docs/pages/pipeline.md:51` reads "Container
modes, header, tabs, POT and closing rules are described in `CLAUDE.md`'s 'Detail panel'; here the
cycle's decisions". Move 4 inverts that contract.

So each destination gains one `## Current state` section immediately after its preamble, holding the
moved sections as `###` sub-sections **under their present names**, with the dated cycle log following
unchanged. Rationale:

- Current-state reference is not mislabelled as the history of one cycle.
- `Filter bar`, `Pipeline board layout` and `Column header totals` each span more than one cycle, so
  they cannot be assigned to a single dated entry without splitting or distorting them.
- The section names survive, so the many historical reports citing them stay readable.

Rejected: folding each section into its originating cycle entry (mislabels reference as history, breaks
the three multi-cycle sections); separate `*-reference.md` files (new files where one already exists —
against §2's reuse-before-duplicate and the brief's explicit instruction).

### Move 5 — 8,333 B, changes a written rule (confirmed 2026-10-10)

The `DB migrations` table → **`docs/db/migrations.md`** (new file, new directory).

§2 currently says: "DB migrations and genuinely cross-cutting conventions … still belong in
`CLAUDE.md`/`ARCHITECTURE.md` as before". This move reverses that clause for migrations, so §2 is
edited in the same cycle. The user confirmed this move on its own terms.

**Stays inline** in `CLAUDE.md`, because each of these is acted on rather than read:

- the `docker exec -i pdash-db psql …` run command;
- the two **apply-once** backfills — `023_backfill_project_tags.sql` and
  `027_project_descriptions.sql` — whose second run is destructive;
- the note that `scripts/test-branch.sh up` **skips migrations** on an existing schema, so a branch
  stack does not get a new migration until it is applied by hand.

### Move 6 — 6,940 B, changes the same rule (confirmed 2026-10-10)

`Database backup & full recreation` → **`docs/ops/database.md`** (new file, new directory). A pointer
line stays inline.

**`Infrastructure safety` is not touched, not moved, and not merged into move 6.** It is a safety rule
written after a real incident (2026-08-05, the main stack's data volume wiped by a delegated agent,
recovered only by an incidental leftover dump) and it must stay in context at every session start.

The three invariants of the full-recreation procedure (one piped `psql` session rather than one
`docker exec` per file; `-v ON_ERROR_STOP=1`; the `\echo applying …` marker with its `printf '%s\n'`
form and the trailing newline) move **with** the procedure — they are properties of a command that now
lives in `docs/ops/database.md`, and splitting them from it would leave both halves unusable.

## 6. What stays inline: the `Invariants` block

The brief's rule: a one-line imperative stays in `CLAUDE.md`; only the explanation moves; and **where a
guard test already pins the rule, cite the test instead of repeating it**.

Applying that rule required verifying which rules are actually pinned. **Three claims in the brief are
wrong, verified against the code:**

1. **`:where(.cg-grid) :where(th, td)` is not in `CLAUDE.md` at all.** It is already in
   `docs/pages/costgrid.md:144` and `css/costgrid.css:418`. The brief lists it as a move-4 invariant at
   risk; there is nothing to protect and nothing to do.
2. **`do NOT add h-100 to the columns row` is pinned by no test** (`grep h-100` over
   `js/lib/*.test.js` returns nothing). The brief's conclusion — keep it inline — is right, now for a
   verified reason.
3. **The 14 nav DOM ids are pinned by no guard test.** `js/lib/nav-layout-guard.test.js` asserts CSS
   facts (sidebar widths, the 1024px switch, breadcrumb height, z-index layering, the board height
   terms) and never the ids. Individual ids appear in `nav-model.test.js`, `nav-tooltip.test.js` and
   `notifications-ui.test.js`, but no test asserts the set as a contract. So "cite the test" does
   **not** apply: the id list stays inline.

Hence `CLAUDE.md` keeps a compact `### Invariants` section containing:

- **`do NOT add h-100 to the columns row`** — Bootstrap's `.h-100` is `height:100%!important` and would
  override the flex sizing, hiding the column under `overflow:hidden`. Unpinned; prose is the only net.
- **Never render a second navigation; the element ids are a consumed contract** — the 14 ids read by
  `js/notifications.js` and the nav wiring, listed. Unpinned as a set.
- Heights, z-index and the page-shell structural ban (`overflow`/`transform`/`position` on
  `#app-shell`/`#app-main`) **cite** `js/lib/nav-layout-guard.test.js` and
  `js/lib/nav-shell-guard.test.js` rather than restating them.

Each line carries a pointer to its moved explanation.

## 7. Pointer integrity

The move dangles every inbound reference naming a moved section. Policy:

**`docs/superpowers/{specs,plans,reports,audits,design}/` is an immutable record and is not rewritten.**
Those documents state what was true when written. This matches how the project already treats them
(older reports citing `PL-0x` ids were deliberately left alone; the brief says the same of the old
per-file `docker exec` loop still quoted there).

**Live documents are re-pointed.** Mapped inbound pointers:

| File | What it points at |
|---|---|
| `docs/pages/pipeline.md:7` | "Pipeline board layout", "Detail panel", **"Column totals footer"**, "Filter bar" |
| `docs/pages/pipeline.md:19` | "Filter bar" |
| `docs/pages/pipeline.md:51` | "Detail panel" |
| `docs/pages/costgrid.md:70` | "Version tab switching (editor)" |
| `docs/js/costgrid.md` | "New Proposal / Clone" |
| `docs/js/nav.md` | "Navigation: sidebar and icon navbar", "Pipeline board layout" |
| `docs/api/currencies.md:19` | "DB migrations" |
| `ARCHITECTURE.md` | "DB migrations" |
| `.claude/commands/finish-cycle.md` | "Database backup & full recreation" |
| `CLAUDE.md` `:165`, `:249`, `:370`, `:405` | its own moved sections |

**`docs/pages/pipeline.md:7` is already broken today:** it cites "Column totals footer", a section
renamed to "Column header totals" by the 2026-10-06 board redesign. Fixed in passing — it is the same
defect class the guard below exists to catch, found by hand while scoping this cycle.

## 8. The guard — `scripts/claude-md-guard.test.js`

One new file, in `scripts/` beside `architecture-guard.test.js` (already covered by
`vitest.config.js`'s `scripts/**/*.test.js`, so no config change). Two groups of assertions.

**(a) Size — against regrowth.**

- `CLAUDE.md` is at most **64,000 B**. Headroom of ~5 KB over the expected ~59 KB: roughly three cycles
  of ordinary growth, so it bites on erosion without failing the next legitimate entry.
- The `File structure` block's byte count is pinned **exactly**.
- The number of block entries longer than 2 lines is pinned **exactly at 13**.

Exact pins, not floors or ceilings, for the reason cycle 3 established: its first version used a
797-case floor and let nine cases disappear with the suite green. A 14th long entry fails; shrinking one
fails until the number is lowered on purpose. The 13 are **not** rewritten by this cycle — the debt
stays visible and measured instead of being compressed by hand, which is the activity that produced six
of cycle 4's findings.

**(b) Pointers — against dangling references.**

- Every `docs/…` path cited in `CLAUDE.md` exists on disk.
- Every "see `CLAUDE.md`'s «X»" in a **live** `docs/` file names a heading that exists in `CLAUDE.md`.

**Named limits, in the file header** (convention from `architecture-guard.test.js`):

- `docs/superpowers/` is excluded from (b) by design — immutable records, see §7.
- (b) checks that a heading *exists*, never that the pointer is apt.
- (a) does not and cannot judge whether an entry's content belongs in the block; it measures size only.

## 9. Acceptance criteria

1. `CLAUDE.md` is between 55,000 and 62,000 B, and `Infrastructure safety`, the migration run command,
   the two apply-once backfill warnings and the `test-branch.sh` note are all still in it.
2. Every moved block is byte-identical to its source range, proved, with the vacuous-comparison guard
   demonstrated.
3. `docs/db/migrations.md` and `docs/ops/database.md` exist; the three destination files of move 4 each
   have one `## Current state` section and an otherwise unchanged cycle log.
4. No live pointer names a `CLAUDE.md` section that no longer exists; nothing under `docs/superpowers/`
   is modified.
5. `npm test` passes, including the new guard, and the guard has been **watched failing** on injected
   defects covering both assertion groups — an oversized `CLAUDE.md`, a 14th long entry, and a dangling
   pointer — in the manner of `architecture-guard.test.js`, which was verified the same way.
6. `.claude/skills/sync-docs/SKILL.md` §2 reflects the new rule for migrations and the backup procedure,
   and names the guard test.

## 10. Process notes for this cycle

- **Classification is `ordinary`, not `no-code`** — `scripts/claude-md-guard.test.js` is a `.js` file,
  so `scripts/classify-cycle.mjs` will say `ordinary` and Gate 2 will take the ordinary branch and ask
  the browser-verification question on a diff containing nothing a browser can render. Decided in
  advance, per PROCESS.md §3: an annotated derogation (no browser verification; the classification is
  confirmed in conversation instead), recorded in the cycle report. Consequence of the ordinary branch,
  worth noting as a gain over cycle 4: **Gate 4's out-of-scope check does fire**.
- **Gate 3 is not skipped.** A prose-only diff is where review pays — cycle 4, the same species of
  cycle, produced 13 findings of which 6 were false claims it had written itself.
- Branch + worktree + `--no-ff` via `/finish-cycle`, decided with the user per the standing per-cycle
  rule.
- Two brief claims about project memory are **expired** and get corrected in `/sync-docs` §7:
  `ARCHITECTURE.md`'s `Directory structure` is 7,684 B (cycle 4 fixed it), not 18.8 KB "the natural next
  candidate"; and `test-cases.html` **is** documented in `CLAUDE.md`'s collective `HTML pages` line
  (cycle 3), not "nowhere".
