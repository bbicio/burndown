# Brief — Ciclo 2: comportamento di Gate 2 al rilancio di `/finish-cycle` con stack di branch già attivo

**Data:** 2026-07-18
**Scenario:** 2 — Evoluzione di una feature esistente (non Scenario 3 / audit-fix)
**Origine:** `docs/superpowers/audits/2026-07-18-test-branch-script-process-integration-audit.md`, Finding 3

**Perché questo Brief è in forma diversa dal Ciclo 1:** Finding 3 non è una divergenza rispetto a un comportamento già definito da correggere — è un caso non specificato. Nessuno dei due file offline (`PROCESS.md`, `finish-cycle.md`) dice cosa deve succedere quando Gate 2 propone di nuovo "Spin up an isolated test environment now?" mentre lo stack di un giro precedente è rimasto attivo. Non c'è un "fix" meccanico applicabile: serve decidere il comportamento voluto tra alternative, quindi questo Brief passa da `/brainstorming` per esplorarle, non da un'istruzione di fix diretta.

## Problema

Nella proposta di `finish-cycle.md`, Gate 2 step 1 introduce: "Spin up an isolated test environment for this branch now? [yes/no]" con tracking di `<branch-env-active>`, e step 5 lascia lo stack attivo se la verifica manuale risponde "no" ("leave it running so the user can keep testing").

Il flusso previsto per una verifica fallita (Gate 1, riga 16, invariata nella proposta) è: "Require a fix and a re-run of `/finish-cycle` from the top." Un secondo giro di `/finish-cycle` ripartirebbe da Gate 2 step 1 e riproporrebbe la stessa domanda, mentre lo stack del giro precedente è ancora su (per design, lasciato attivo apposta).

Non è specificato cosa deve fare l'utente/il flusso in questo caso: rispondere di nuovo "yes" è idempotente lato Docker Compose (non rompe nulla), ma non è chiaro se debba:
- riusare lo stack esistente senza fare nulla,
- ri-clonare i dati da main (che nel frattempo potrebbero essere cambiati),
- oppure se la domanda stessa dovrebbe sparire/adattarsi quando `<branch-env-active>` è già vero.

## Comportamento attuale / atteso

- **Attuale (proposta offline):** nessuna distinzione tra "primo giro" e "giro successivo con stack già attivo" — la domanda di Gate 2 step 1 è identica in entrambi i casi, e la sua interpretazione ("yes" = cosa succede esattamente se già attivo?) non è definita.
- **Atteso:** da decidere in `/brainstorming`, tra alternative come (non esaustivo, punto di partenza per la discussione):
  1. Lo script/gate rileva autonomamente se lo stack è già attivo (es. query allo stato dei container del progetto Compose branch-specifico) e adatta la domanda di conseguenza (es. "Stack already running — reuse it, or rebuild with fresh data from main? [reuse/rebuild]").
  2. La domanda resta identica ad oggi, ma il testo chiarisce esplicitamente cosa fa "yes" quando lo stack è già attivo (riuso vs rebuild).
  3. Ogni "yes" forza sempre un teardown + re-clonazione dati puliti, eliminando l'ambiguità ma perdendo eventuali stati di test intermedi lasciati a mano dall'utente nello stack precedente.

## Vincoli

- Qualunque soluzione scelta deve restare coerente con lo stile del resto di `finish-cycle.md`: ogni gate di giudizio si ferma sempre per conferma esplicita, nessuna euristica automatica silenziosa che decide al posto dell'utente.
- Non deve introdurre un nuovo file di stato persistente tra esecuzioni di `/finish-cycle` — `<branch-env-active>` è già una variabile di sessione, non va promossa a stato su disco senza motivo esplicito.
- La soluzione deve rimanere compatibile con `test-branch.sh` così com'è proposto nel Ciclo 1 (assumendo il fix di quel ciclo già applicato) — non richiedere modifiche allo script che non siano già coperte da quel Brief, a meno che la decisione presa qui lo richieda esplicitamente (in tal caso, va segnalato come dipendenza tra i due cicli, non risolto di straforo qui).

## Criteri di accettazione

- Il testo di Gate 2 in `finish-cycle.md` specifica esplicitamente cosa succede in un rilancio di `/finish-cycle` con `<branch-env-active>` già vero da un giro precedente, senza lasciare la domanda ambigua.
- Il comportamento scelto non rompe l'idempotenza attuale di `test-branch.sh up` (nessuna doppia esecuzione distruttiva non voluta).
- `PROCESS.md` riga 26 resta coerente con la nuova formulazione di Gate 2 (nessuna descrizione disallineata tra i due file).

## Scope escluso esplicitamente

- Il fix di `test-branch.sh` per la lettura di `.env` (Ciclo 1) — Brief separato, non va toccato qui salvo dipendenza esplicita segnalata sopra.
- Qualsiasi altra modifica al flusso di Gate 1, 3, 4, 5, 6 di `finish-cycle.md` non collegata a questo caso specifico.
- La discrepanza preesistente in `CLAUDE.md` su hot-reload/nodemon, fuori scope nell'audit originale.

## Promemoria — finding nuovi durante l'esecuzione

Qualunque nuovo finding emerso durante `/brainstorming` o l'esecuzione di questo ciclo va isolato e proposto come Brief futuro a sé stante — mai risolto di straforo dentro questo ciclo (guardia Scenario 3/2, PROCESS.md §2).
