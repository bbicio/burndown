# Handoff — fix dei finding della cold review (2026-10-12)

La cold review dell'impianto di processo è **chiusa**: report in
`docs/superpowers/audits/2026-10-12-process-construct-cold-review-audit.md`, 8 finding più un
addendum. Nessun fix è stato applicato (disciplina `domain-audit`). `main` è pulito.

**Prossimo passo: `audit-to-brief`** su quel report — è lo Scenario 3 di `PROCESS.md` §2, e la skill
chiede comunque di confermare il raggruppamento con l'utente prima di scrivere i Brief.

## Il raggruppamento già concordato con l'utente

- **Ciclo 1 — F1 + F2 + F4.** Stessa causa radice (l'enforcement è stato scritto ciclo per ciclo, mai
  sull'insieme) e stessi due file (`scripts/claude-md-guard.test.js`, `.claude/skills/sync-docs/SKILL.md`,
  più `scripts/architecture-guard.test.js`). F1 = il Gate 5 pusha senza test gate ed è il passo che
  modifica i numeri pinnati. F2 = `architecture-guard` pretende al Gate 1 ciò che `/sync-docs` scrive
  al Gate 5, e nessun documento lo dice. F4 = **nella forma misurata dall'addendum**: il fix è "ogni
  path citato esiste" (199 citazioni non guardate da nessuno), **non** "ogni nome di sezione risolve"
  (0 occorrenze di quella forma su `ARCHITECTURE.md`/`PRD.md` — guarderebbe il nulla).
- **Gli altri** (F3 `<reviewed-sha>` con due definizioni, F5/F6 limiti dei guard più stretti di quelli
  reali, F7 §1 di `PROCESS.md` che omette tre step del Gate 4, F8 doppia numerazione di §6) sono
  indipendenti: `audit-to-brief` decide se stanno in un secondo ciclo o si distribuiscono.
- **Cluster documentale dell'addendum** (`js/config-form.js`/`js/dashboard.js` descritti al presente in
  4 punti, cancellati il 2026-07-27): o dentro il ciclo documentale, o lasciato alla cadenza
  `ARCHITECTURE.md`/`CLAUDE.md`-vs-codice di `PROCESS.md` §2. Decisione aperta.

## Due cose da non rifare

- **Un secondo audit sui documenti ristrutturati non serve** — misurato, non supposto: indice
  `PRD.md`↔`docs/prd/` esatto nelle due direzioni, zero ancore penzolanti, `§11.3`/`§16.9a` già
  dichiarati come debito in `PRD.md:11`. Vedi l'addendum del report.
- **Le 10 tensioni note** di `docs/handoff-cold-review.md` restano date per buone: non sono state
  riverificate (decisione dell'utente) e non vanno riaperte come scoperte.

## Trappola

F1 e F2 modificano `/finish-cycle` e `sync-docs`: **`/finish-cycle` carica il proprio testo dal
checkout principale, non dal worktree**, quindi una modifica al comando si esercita solo nel ciclo
*successivo*. Vale anche per il ciclo che la introduce.
