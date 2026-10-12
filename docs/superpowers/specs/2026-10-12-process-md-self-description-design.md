# Aligning `PROCESS.md` with itself — a sentence-preserving restructure (cycle 2 of the cold-review fixes)

Date: 2026-10-12. Scenario 3 (audit → fix). Brief:
`docs/superpowers/briefs/2026-10-12-process-md-self-description-brief.md` (as corrected by `63be54a`).
Source audit: `docs/superpowers/audits/2026-10-12-process-construct-cold-review-audit.md`, findings
**F7** and **F8**. Second of the fix cycles derived from that audit; it is also **CR2**, the first item
of the merged process backlog agreed 2026-10-12.

## 1. Problem

**F7 — §1's `/finish-cycle` row omits three Gate 4 steps, two of which exist because of real
incidents.** The row (line 26) describes the tail of the sequence as "… → merge `--no-ff` con riepilogo
pre-merge esplicito e pulizia worktree → `/sync-docs` + report persistito". Transcribed from
`.claude/commands/finish-cycle.md` (203 lines), Gate 4 actually runs:

| step | what | line |
|---|---|---|
| 1-2 | pre-merge summary + "Proceed with merge? [yes/no]" | `:91`, `:96` |
| **3** | **`scripts/backup-db.sh`** — automatic, no confirmation, explicitly *"before any merge state changes"* | `:98` |
| 4 | CWD safety check (if the checkout is a linked worktree, `cd` to the main repo root) | `:99` |
| **5** | `git checkout main` / `git merge --no-ff` / `git push` | `:110` |
| **6** | **apply new migrations**, only if the diff touches `api/src/db/migrations/` | `:117` |
| **7** | **backend restart**, only if the diff touches `api/` — a human gate whose "no" leaves backend code merged but not live | `:125` |
| 8-9 | worktree cleanup, branch deletion | `:130`, `:138` |

The backup is **step 3, before the merge** — after the user's yes, before any state changes. Steps 3, 6
and 7 do not appear in §1 at all. Steps 4 and 9 also do not, and should not: 4 is an implementation
detail, 9 is one line.

Two further facts, both created by cycle 1 (`b96b0a0`, 2026-10-12), are likewise absent: Gate 5 now runs
a **blocking `npm test`** before showing its diff (`:183`), and the document has a new section **§4b**
on the documentation guards.

Origin of the gap: the three Gate 4 steps arrive from `bf95d9f`, `bc561d0` and `41bab43`, none of which
touches `PROCESS.md`; condition 3 of §7 already covered them and was not applied. The result is an
asymmetric document — §1 describes the most recent branch (no-code cycle, 2026-10-09) in a clause of its
own while three older steps are missing.

**F8 — §6 uses two numbering schemes at once, and both are cited.** Inside `## 6.` the subdivisions are
bold points `1, 2, 3, 4, 4b, 4c, 5`, cited as `§6.1` and `§6.4`. But `## 6.6` is a **top-level heading**,
a sibling of `## 6.`, with its own points 1-5, cited as "PROCESS.md 6.6.5" (`eb36f2a`) and as "§6.3/§6.6"
(`CLAUDE.md`). `finish-cycle.md:12` cites both schemes in one sentence: "PROCESS.md §6/§6.6". So `§6.4`
means "point 4 inside §6" while `§6.6` means "the section after §6", and `§6.5` would be unresolvable.
Every existing citation resolves today; the defect is that the scheme is not followable by a cold reader.

**A third citation form is in circulation**, not two: `§6 4c` / "§6 point 4c" — space instead of dot — in
four measured places: `PROCESS.md:116`, `PROCESS.md:170`, `finish-cycle.md:30`, `CLAUDE.md:58`.

## 2. Measurement that shaped the design

All measured on `main` at `63be54a`, 2026-10-12.

- **The recommended scheme keeps every live citation resolving.** With §6's bold points promoted to
  `### 6.1 … 6.5` (including `6.4b`/`6.4c`) and `## 6.6` demoted to `### 6.6`, these all still resolve
  untouched: `§6.3` (`CLAUDE.md:207`, `docs/scripts/shoot.md:32`, `docs/pages/portfolio.md:112`), `§6.4`
  (`finish-cycle.md` `:36`, `:37`, `:70`; `docs/handoff-ciclo4.md:82`, `handoff-ciclo5.md:159`,
  `handoff-ciclo6.md:149`), `§6.6` (`finish-cycle.md:12`, `CLAUDE.md:207`, `docs/pages/costgrid.md:220`,
  `docs/scripts/shoot.md:32`), `§6.1` (`PROCESS.md:136`), `§6.6.5`. Only the four `§6 4c` forms have to
  change, and they change by construction.
- **No file under `.claude/` cites `§4b`.** Its only citations are cycle 1's own spec, plan and report,
  plus `docs/superpowers/audits/2026-10-12-process-improvement-notes.md`. This made a third option
  available for the `## 4b.` ↔ `### 6.4b` collision — moving the section — which the Brief did not list.
- **Three of §6's seven bold points carry their body on the same line as the title** (points 4, 4b, 4c at
  `:153`, `:155`, `:162`); the other four are title-only lines. §6.6's five inner points are all
  title-only. This changes the shape of the fidelity proof (§3.5), because promoting an inline-body point
  splits one line into two.
- **The `---` at `:176`** separates §6 from §6.6. Demoting §6.6 to `###` makes that separator wrong: it
  would visually close §6 one subsection early.
- **§1's `/finish-cycle` cell is 1437 characters**, against 448 for the next longest cell in the same
  table (`Esecuzione`, `:25`). Point 1 of the Brief adds five facts to it.
- **`§6.x` false positives exist in the repo-wide grep:** `PRD.md:58`, `docs/prd/reporting.md`,
  `docs/prd/project-config.md` and `.claude/skills/operational-manual/SKILL.md:122` cite sections of the
  **PRD**, not of `PROCESS.md`. The execution-time sweep must exclude them rather than "fix" them.

## 3. Expected behaviour

### 3.1 §6's new skeleton — a 1:1 map, nothing else

| today | after |
|---|---|
| `**1. Modalità e modello…**` (`:135`) | `### 6.1 Modalità e modello…` |
| `**2. Test.**` (`:142`) | `### 6.2 Test` |
| `**3. Una sola verifica visiva per ciclo.**` (`:147`) | `### 6.3 Una sola verifica visiva per ciclo` |
| `**4. Niente revisioni doppie sullo stesso diff.**` + inline body (`:153`) | `### 6.4 Niente revisioni doppie sullo stesso diff` + body on its own line |
| `**4b. Il Gate 3 parte in parallelo al Gate 2 (2026-10-08).**` + inline body (`:155`) | `### 6.4b Il Gate 3 parte in parallelo al Gate 2 (2026-10-08)` + body on its own line |
| `**4c. Il Gate 2 ha un ramo per i cicli senza codice — no-code cycle (2026-10-09).**` + inline body (`:162`) | `### 6.4c Il Gate 2 ha un ramo per i cicli senza codice — no-code cycle (2026-10-09)` + body on its own line |
| `**5. Brief e processo fuori dal ciclo.**` (`:172`) | `### 6.5 Brief e processo fuori dal ciclo` |
| `## 6.6 Cicli con tavole di design (2026-10-07)` (`:178`) | `### 6.6 Cicli con tavole di design (2026-10-07)` |
| `**1. In /brainstorming si leggono TUTTE le tavole…**` (`:182`) | `#### 6.6.1 In /brainstorming si leggono TUTTE le tavole…` |
| `**2. Ogni task del Piano porta le sue tavole.**` (`:187`) | `#### 6.6.2 Ogni task del Piano porta le sue tavole` |
| `**3. Un passo di verifica va assegnato a chi può eseguirlo.**` (`:192`) | `#### 6.6.3 Un passo di verifica va assegnato a chi può eseguirlo` |
| `**4. Strumento: scripts/shoot.mjs.**` (`:196`) | `#### 6.6.4 Strumento: scripts/shoot.mjs` |
| `**5. Economia dei giri di cattura (2026-10-07, ciclo Cost Grid fidelity).**` (`:203`) | `#### 6.6.5 Economia dei giri di cattura (2026-10-07, ciclo Cost Grid fidelity)` |

The trailing full stop of a promoted title is dropped (a heading does not take one); the inline backticks
of `/brainstorming` and `scripts/shoot.mjs` are kept as they are. §6.6's inner points are promoted to
`####` **so that `§6.6.5` resolves to a heading instead of to a position in a count** — that is the whole
point of F8, and stopping at `###` would leave the deepest cited level unaddressed.

The `---` at `:176` is **removed**. The `---` at `:216`, which separates §6.6 from §7, stays: it now
separates §6 from §7.

### 3.2 The `## 4b.` ↔ `### 6.4b` collision — decided

**Decision (user, 2026-10-12): a full-form citation rule.** `## 4b. Guardie meccaniche` stays where it
is, next to §4, where its own first sentence places it ("Accanto alla guardia infrastrutturale di §4").
One sentence is added to the introductory block at the top of the file: a reference to a section of this
document is always written in full — `§4b` for the top-level section, `§6.4b` for the point inside §6 —
and never as a bare "4b".

The two rejected options and why, so this is not re-litigated: **moving the section to `## 8.`** removes
the ambiguity structurally but displaces a 19-line section away from the §4 its first sentence refers to,
and strands the `§4b` citations in cycle 1's three archival documents; **dropping the letter suffixes
inside §6** (`6.1…6.7`) would silently repoint `§6.5` from "Brief e processo fuori dal ciclo" to "Gate 3
in parallelo" — a citation that still resolves but to the wrong content is worse than one that does not
resolve.

Residual risk, stated rather than hidden: this is a rule of conduct, not a mechanical guard. If someone
writes a bare "4b" the ambiguity returns. No guard is added for it (see §6).

### 3.3 §1's `/finish-cycle` row — the exact replacement text

**Decision (user, 2026-10-12): a bulleted list inside the cell**, rendered with `<br>` because a Markdown
table cell does not take a real list. The cell becomes, verbatim:

```
| **`/finish-cycle`** | Terminale di ogni esecuzione in questo progetto — sostituisce `superpowers:finishing-a-development-branch`, non la segue. Ogni gate di giudizio si ferma sempre; solo test e pre-flight sono automatici. I gate, nell'ordine reale del comando:<br>• **Gate 1 — test:** `npm test` → suite Docker backend (`scripts/run-tests.sh`) se il diff tocca `api/`.<br>• **Gate 2 — verifica manuale:** ambiente Docker isolato per il branch rilevato automaticamente via `scripts/test-branch.sh status` (riuso o rebuild se già attivo); ricerca spec/piano, sempre conferma, mai euristica; **ramo per i cicli senza codice / no-code cycle** — il gate esegue `node scripts/classify-cycle.mjs` e, **solo** se la prima riga del suo stdout è `no-code`, mostra il diff e chiede di confermare la classificazione **invece di offrire lo stack Docker, cercare spec/piano e chiedere la verifica browser**, e il Gate 3 non si salta. **`/code-review` parte in background all'apertura del gate** (§6.4b).<br>• **Gate 3 — code review:** raccoglie quella run come proprio round 1 (max 3 round; i finding si trattano qui, mai durante la verifica; saltato alle condizioni dello step 0 del gate, da leggere lì e non a memoria, §6.4).<br>• **Gate 4 — merge:** riepilogo pre-merge esplicito e "Proceed with merge?" → **`scripts/backup-db.sh` automatico, prima che il merge cambi stato** → `git merge --no-ff` + push → **applicazione delle nuove migrazioni, se il diff tocca `api/src/db/migrations/`** → **restart di `pdash-api`, se il diff tocca `api/`: è un gate umano, e un "no" lascia il codice backend mergiato ma non vivo** → pulizia worktree.<br>• **Gate 5 — `/sync-docs` e report:** `/sync-docs` → report persistito in `docs/superpowers/reports/` → **`npm test` bloccante prima di mostrare il diff** (§4b) → conferma esplicita di push. `/sync-docs` aggiorna anche la **memoria di progetto** (vedi nota sotto), senza conferma ma sempre riportata nel report.<br>• **Gate 6 — report finale in chat.** |
```

Every clause in it is either the old cell's own wording, redistributed, or one of the five added facts.
The one tightening: the old cell's bare "vedi §6" becomes `§6.4`, which is the point it actually means.
§1 is **not** otherwise restructured — the table keeps its rows, the three `Nota —` blocks below it are
untouched.

### 3.4 The citation sweep

Four sentences move from `§6 4c` / "§6 point 4c" to `§6.4c`: `PROCESS.md:116`, `PROCESS.md:170`,
`finish-cycle.md:30`, `CLAUDE.md:58`.

The list is **re-derived at execution time** with `grep -rn "§6" --include=*.md .` over the whole repo —
not copied from here, because the audit's list was incomplete and its line numbers had already shifted
once. The sweep must: exclude `node_modules/`; exclude the PRD-section false positives named in §2;
include `docs/handoff-ciclo*.md` and `docs/scripts/shoot.md`. Archival documents under
`docs/superpowers/{audits,briefs,plans,reports,specs}/` are **not** edited — they are the record of what
was true when written — except where the sweep shows a *live* pointer among them, which is a judgement
call to raise rather than resolve silently.

### 3.5 The fidelity proof

A throwaway script in the scratchpad (never committed — a committed version would be a prose test, which
the audit established does not exist) runs three mechanical checks:

1. **Normalised line multiset, unchanged.** Normalisation: strip leading `#`s, strip `**`, strip a leading
   numbering token (`\d+(\.\d+)*[a-z]?\.?`), collapse whitespace, trim. This makes
   `4. Niente revisioni doppie…` and `6.4 Niente revisioni doppie…` normalise identically, so the
   renumbering itself does not show up as a difference.
2. **Re-join check** for the three split points (4, 4b, 4c):
   `norm(new heading) + ". " + norm(new body) == norm(old line)`. String comparison, no judgement.
3. **Explicit itemised list of everything left**, each with one line of rationale, which must come out
   short: §1's row (`:26`), the four `§6 4c` citations, the new citation-rule sentence, and the removed
   `---` at `:176`. That list goes into the cycle's report.

No test can judge `PROCESS.md`'s prose. This can prove that nothing was reworded in passing — which is
exactly how the three previous cycles on this file produced 9, 10 and 5 review findings.

### 3.6 The discipline that makes this a restructure, not a rewrite

Every existing paragraph gets a destination under the new scheme and is **moved, not reworded**: a
sentence either survives identical, or it appears in the §3.5 list with its rationale. No rule "said
better", no dated passage compressed, no lesson from current experience added — that exclusion *is* the
difference between the two operations. The reasons, measured and not to be re-litigated, are in the
Brief's header.

## 4. Verification

- `npm test` green. `scripts/doc-paths-guard.test.js` and `scripts/claude-md-guard.test.js` both walk
  `docs/`, so every path cited by `PROCESS.md` must still resolve and `CLAUDE.md`'s pointers must still
  name sections that exist.
- The `grep -rn "§6"` sweep re-run after the edit: every live `§6.x` citation resolves to a heading, and
  no `§6 4c` form remains.
- The §3.5 script's three checks, with its output pasted into the cycle's report.
- Visual read of the rendered `PROCESS.md` §1 table — a `<br>`-separated cell is a form this file does
  not use anywhere else today, so it is worth looking at once rather than assuming.
- **Cycle type is decided by `node scripts/classify-cycle.mjs` at Gate 2, never by this spec.** The
  expectation is `no-code` (only `PROCESS.md`, `CLAUDE.md` and `.claude/commands/finish-cycle.md` are
  touched), but `CLAUDE.md` is inside the set the classifier judges, so the outcome is not guaranteed.

## 5. Acceptance criteria

- [ ] §1 names the DB backup, the migration apply and the backend restart in the `/finish-cycle` row, in
      Gate 4's real order, plus Gate 5's blocking `npm test` and the existence of §4b.
- [ ] Inside §6 a `§6.N` reference has exactly one possible meaning, and `§6.6` is no longer ambiguous
      between "point 6 of §6" and "the section after §6".
- [ ] `§6.6.5` resolves to a heading.
- [ ] Every `§6.x` citation **in the whole repo** resolves — verified with a re-run `grep`, not with this
      spec's list.
- [ ] The four `§6 4c` / "§6 point 4c" citations are now `§6.4c`.
- [ ] The citation rule (`§4b` vs `§6.4b`, never a bare "4b") is stated once, in the introductory block.
- [ ] No `## N` section number beyond 6 has changed, and no existing section number has changed meaning.
- [ ] The normalised non-empty line multiset of `PROCESS.md` is unchanged except for the itemised list of
      §3.5, each item with its rationale, and that list is in the cycle's report.
- [ ] `npm test` green.

## 6. Explicitly excluded scope

- **`PROCESS.md` is not rewritten from scratch.** Evaluated explicitly by the user on 2026-10-12 and
  rejected for the reasons measured in the Brief's header. Not an open question.
- §6 is not rewritten on the merits; its points are neither merged nor cut — only the form of the
  numbering changes.
- §7 and its conditions are untouched.
- §1 is not restructured beyond the one row: no rows added or removed, no `Nota —` block moved.
- **No new guard on `PROCESS.md`'s internal `§N` pointers.** The audit notes that nothing checks them;
  that stays declared debt. The same applies to the citation rule of §3.2, which is deliberately conduct
  and not a test.
- No realignment of the other process documents.
- No process content is added or changed: this describes what the gates **already do**.

## 7. New findings during this cycle

Any defect found during execution is **isolated and proposed as a future Brief**, never folded into this
fix (`PROCESS.md` §2, Scenario 3) — in particular any further §1-vs-gate divergence that surfaces while
reading `finish-cycle.md` in full.

**Already isolated by cycle 1, not to be solved here:** `finish-cycle.md`'s Gate 3 has no branch covering
a commit that contains *only* the review's fixes but has not been re-reviewed — step 0 asks for both
conditions, step 0b assumes the opposite case. It belongs to the backlog item that owns `<reviewed-sha>`
(M3).
