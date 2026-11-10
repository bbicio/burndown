# Brief — Gate 3: round successivi ristretti, niente round per una correzione di testo, una regola per i round

**Tipo:** evoluzione di una feature esistente (Scenario 2), confermata dall'utente il 2026-11-10.
**Origine:** analisi in chat del 2026-11-10 sulle righe "Gate 3" dei report di ottobre e novembre; l'utente ha scelto i punti 1, 2 e 3 e rimandato il 4.

## Problema

Il Gate 3 arriva quasi sempre al tetto dei 3 round, e i finding non calano da un round all'altro. Il round 2 e il round 3 rileggono tutto il branch: trovano cose nuove in codice già rivisto e ripropongono follow-up già decisi. Una correzione di una parola fa partire un round intero. E la domanda di disposizione si ripete a ogni round perché il round 1 si decide finding per finding.

## Comportamento attuale

- **Rientro dopo le correzioni:** "If any fix was applied and the round just completed was round 1 or round 2: run `/code-review` again on the same scope" (`.claude/commands/finish-cycle.md` line 120). Lo scope è quello del round 1: `main...HEAD` (line 110), o `<reviewed-sha>..HEAD` sul percorso 0b.
- **Qualsiasi correzione fa partire un round:** la condizione è "any fix was applied" (line 120), senza distinguere gravità né tipo di file.
- **Prima di ogni nuovo round:** i quattro controlli meccanici sui `.md` delle correzioni e i test che coprono ciò che il round ha cambiato (line 119).
- **La domanda:** "Fix now, accept as follow-up, or a mix (specify which)?"; dal round 2 si applica una regola solo se la risposta del round 1 l'ha formulata, e "If round 1 was decided finding by finding, no rule is inferred from it" (line 115). PROCESS.md §6b classifica la domanda come cancello di classe D (line 256) e rinvia al comando (line 271).
- **Tetto:** al round 3 con correzioni, le opzioni (a)/(b)/(c) (line 121-122).
- **Misura**, dalle righe "Gate 3" di 54 report dal 2026-10-01: 27 dichiarano 3 round, 8 ne dichiarano 4 o 5, 13 chiudono con l'opzione (b). Sequenze di finding che non calano: 8 → 10 → 8, 16 → 10 → 10, 10 → 10 → 9. Ripetizioni di follow-up già accettati citate in almeno tre report. Round nati solo da testo scritto come correzione al round prima: `docs-prose-cleanup`, `header-board-deviations`, `currency-c4-version-rate`, `gate1-tests`. Comando:

  ```bash
  grep -h "^- Gate 3:" docs/superpowers/reports/2026-1[01]-*.md
  ```

## Comportamento atteso

1. **Dal round 2 lo scope è ristretto ai commit di correzione del round precedente** (`<HEAD alla fine del round precedente>..HEAD`), e il revisore riceve la lista dei finding già decisi (corretti, a follow-up, nessuna azione) con l'istruzione di non riproporli.
2. **Una correzione che tocca solo testo e risolve solo finding Minor non fa partire un nuovo round.** Restano i controlli meccanici e i test dei `.md`. Un nuovo round parte se una correzione tocca codice o risolve un finding Critical o Important.
3. **La domanda del round 1 offre anche una regola per i round successivi**, fra le opzioni (es. "Critical/Important ora, Minor a follow-up"); scelta, si applica dal round 2 come oggi si applica una regola formulata a parole.

## Vincoli

- Le regole di destinazione (Spec e Piano congelati, prosa preesistente fuori dal diff) restano e si applicano prima della domanda.
- Il Gate 3 non si chiude mai rosso.
- Una regola vive in un file: PROCESS.md §6b e §6.4 rinviano al comando.
- File di processo: classe di rischio almeno `standard`.

## Criteri di accettazione

- `.claude/commands/finish-cycle.md` Gate 3: dal round 2 il `/code-review` è ristretto a `<HEAD di fine round precedente>..HEAD` e riceve la lista dei finding già decisi; "on the same scope" non compare più.
- Il Gate 3 dice quando una correzione non fa partire un nuovo round (solo testo, solo Minor) e quando lo fa partire (codice, o Critical/Important).
- La domanda del round 1 elenca una regola per i round successivi fra le opzioni.
- PROCESS.md non ripete queste regole e rinvia al comando.
- `npm test` verde.

## Scope escluso (confermato dall'utente)

- Il salto del Gate 3 legato a uno SHA registrato invece che alla sessione (punto 4): ciclo a parte.
- Il tetto dei 3 round e le opzioni (a)/(b)/(c).
- La classe di rischio, la sua mappatura sull'effort, e il fatto che in `high-risk` il Gate 3 non si salti.
- I casi di revisione in background morta o senza risultato leggibile.

## Domande aperte per `/brainstorming`

- **Cosa conta come "solo testo":** solo `*.md`, o anche commenti nel codice e messaggi di errore? Un `.md` caricato a runtime (`TEST_CASES.md`) è codice per `scripts/classify-cycle.mjs`.
- **Chi decide la gravità** su cui si basa il punto 2: quella del revisore, o quella rivalutata da chi applica le correzioni?
- **Il round ristretto vede abbastanza contesto?** Una correzione può rompere un chiamante non toccato: il revisore può leggere fuori dal range, ma giudica solo il range.
- **Quali regole offrire** al round 1, e quante, senza trasformare la domanda in un menu.
- **Il conteggio dei round** per il tetto: un round ristretto conta come un round?
