# Brief — scripts/run-tests.sh hardening (Cycle 2)

**Data:** 2026-08-06
**Scenario:** 2 — Evoluzione di feature esistente
**Origine:** Backlog di hardening di `scripts/test-branch.sh`/`scripts/run-tests.sh`, accumulato su più cicli (prima menzione: `docs/superpowers/reports/2026-08-03-worktree-dead-code-cleanup-and-tooltip-wording-finish-cycle.md`) — Ciclo 2 di 3 (raggruppamento per rischio confermato dall'utente nel Ciclo 1: correttezza → hygiene → cosmetici). Questo ciclo copre esclusivamente gli item propri di `scripts/run-tests.sh` non coperti dal Ciclo 1 (che ha coperto solo il fix condiviso di `load_env()` e l'idempotenza delle migrazioni in `scripts/test-branch.sh`), per `docs/superpowers/briefs/2026-08-06-test-scripts-correctness-hardening-brief.md`'s "Explicitly excluded scope": *"Qualunque modifica al comportamento di run-tests.sh oltre alla correzione condivisa di load_env() — i suoi item propri (pre-pulizia, cwd guard, --build) sono nel Ciclo 2."*

## Current behavior

Tutti e tre gli item riguardano esclusivamente `scripts/run-tests.sh` (letto per intero in preparazione di questo brief, stato post-Ciclo-1).

**1. Nessuna pre-pulizia di container/volume/rete orfani da un'esecuzione precedente interrotta bruscamente.** `trap cleanup EXIT` (`scripts/run-tests.sh:65`) esegue `$COMPOSE down -v --remove-orphans` (`:62`) solo sui percorsi di uscita che bash può intercettare — non su un `SIGKILL` (segnale non intercettabile da nessuno shell). Se un'esecuzione precedente di `run-tests.sh` viene terminata con `SIGKILL` (o il processo host crasha) a metà esecuzione, i container `pdash-db-test`/`pdash-api-test`, la rete e il volume del progetto Compose `pdash_test` restano presenti sul sistema. Lo script non esegue alcun controllo all'avvio (prima di `write_override` e `$COMPOSE up -d --build db`, righe 67-70) per rilevare o rimuovere questo stato residuo — la garanzia dichiarata di "stack ephemeral, sempre a partire da un volume vuoto" (vedi `docs/superpowers/specs/2026-08-05-docker-test-profile-isolation-design.md`) può quindi essere silenziosamente violata da un'esecuzione successiva che riutilizza un volume non genuinamente vuoto.

**2. Nessun guard sulla directory di invocazione.** Lo script usa esclusivamente percorsi relativi: `.env` (`:9`), `docker-compose.yml` (referenziato implicitamente da `$COMPOSE`, `:31`), `api/src/db/migrations/*.sql` (`:74`). Non esiste alcun controllo esplicito che lo script sia invocato dalla root del repository. Se invocato da un'altra directory: `load_env()` fallisce silenziosamente il no-op (`:10`, nessun errore, semplicemente non trova `.env` e prosegue con variabili d'ambiente mancanti); il glob delle migrazioni (`:74`) non trova alcun file e itera sulla stringa letterale non espansa (bash senza `nullglob`), causando un errore di `docker exec`/redirect poco chiaro ("No such file or directory") invece di un messaggio esplicito sul problema reale (directory di invocazione sbagliata).

**3. `--build` viene eseguito incondizionatamente su ogni invocazione.** `scripts/run-tests.sh:70` (`$COMPOSE up -d --build db`) e `:79` (`$COMPOSE up -d --build api`) ricostruiscono sempre le immagini Docker, anche quando `Dockerfile`/dipendenze non sono cambiati, aggiungendo tempo di wall-clock ad ogni esecuzione di `/finish-cycle` Gate 1 (che documenta questo script come comando di test). Questo comportamento era stato precedentemente valutato in modo esplicito nel ciclo `docker-test-profile-isolation` (`docs/superpowers/reports/2026-08-05-worktree-docker-test-profile-container-names-finish-cycle.md`) e definito "a deliberate consistency choice per the design, not an oversight" — **confermato con l'utente per questo ciclo che va comunque reso condizionale**, quindi la valutazione precedente viene qui deliberatamente rivista.

## Expected behavior

1. Rilanciare `scripts/run-tests.sh` dopo che un'esecuzione precedente è stata terminata bruscamente (es. `SIGKILL` di un processo Docker o dello script stesso) non deve lasciare, né riutilizzare silenziosamente, container/volume/rete residui del progetto `pdash_test` — ogni esecuzione deve partire da uno stato genuinamente pulito, indipendentemente da come è terminata l'esecuzione precedente.
2. Eseguire `scripts/run-tests.sh` da una directory diversa dalla root del repository deve fallire immediatamente con un messaggio di errore esplicito e azionabile che nomina il problema reale (directory di invocazione errata), non con un errore Docker/glob poco chiaro a valle.
3. Le immagini Docker (`db`, `api`) devono essere ricostruite solo quando il loro contesto di build è effettivamente cambiato (es. `Dockerfile`, dipendenze del pacchetto) — non incondizionatamente ad ogni invocazione — riducendo il tempo di wall-clock delle esecuzioni ripetute senza introdurre il rischio di eseguire i test contro un'immagine obsoleta quando qualcosa è realmente cambiato.

## Constraints

- Nessuna nuova dipendenza esterna.
- Non deve alterare il comportamento con un'esecuzione normale, completa e senza interruzioni (nessuna regressione sul caso d'uso principale già funzionante).
- Il contratto esterno dello script (`exit 0` se tutti i test integration passano, `exit 1` altrimenti — consumato da `/finish-cycle` Gate 1) non deve cambiare.
- La pre-pulizia (item 1) deve essere scoped esclusivamente alle risorse del progetto Compose `pdash_test` (mai toccare il main stack o lo stack isolato di `test-branch.sh`, che usano nomi di progetto/container completamente distinti) — coerente con la regola di sicurezza Docker del progetto (`CLAUDE.md`, sezione "Infrastructure safety").
- Il guard sulla directory di invocazione (item 2) riguarda solo `scripts/run-tests.sh` in questo ciclo — non `scripts/test-branch.sh`, che ha la stessa assunzione ma non è in scope qui (nessuna richiesta esplicita di estenderlo).
- Il meccanismo esatto per rendere `--build` condizionale (item 3) è una decisione di design per `/brainstorming` — questo brief richiede solo che il comportamento finale non ricostruisca inutilmente quando nulla è cambiato, senza specificare l'implementazione.

## Acceptance criteria

- Simulare un'esecuzione precedente interrotta bruscamente (es. avviare `run-tests.sh`, poi inviare `SIGKILL` al processo o ai container Docker sottostanti a metà esecuzione) seguita da una nuova esecuzione completa: la seconda esecuzione deve completarsi con successo partendo da uno stato genuinamente pulito (nessun dato residuo dal tentativo precedente), senza errori "already exists"/conflitti di nome container o rete.
- Eseguire `scripts/run-tests.sh` da una directory che non è la root del repository produce un messaggio di errore chiaro che identifica il problema (directory sbagliata) ed esce con un codice di errore diverso da zero, senza tentare alcuna operazione Docker.
- Eseguire `scripts/run-tests.sh` due volte di seguito senza modifiche al `Dockerfile`/alle dipendenze tra le due esecuzioni: la seconda esecuzione non ricostruisce le immagini `db`/`api` (verificabile via output di Docker, es. assenza di step di build o step tutti "CACHED"/skippati).
- Eseguire `scripts/run-tests.sh` dopo una modifica reale al `Dockerfile` o alle dipendenze `api/`: la nuova esecuzione ricostruisce correttamente l'immagine interessata (nessuna regressione di correttezza introdotta rendendo `--build` condizionale).
- Nessuna regressione sul comportamento attuale con un'esecuzione singola, completa, senza interruzioni (il caso d'uso principale, già funzionante).

## Explicitly excluded scope

- Tutti gli altri sotto-item del backlog di hardening (dump `/tmp` world-readable, porte/password hardcoded, doppia chiamata `docker ps`, controllo esistenza override-file) — pianificati per il Ciclo 3, confermati separatamente dall'utente.
- Qualunque modifica a `scripts/test-branch.sh` in questo ciclo — è interamente scoped a `scripts/run-tests.sh`.
- I due item minori emersi durante il Ciclo 1 (loop di migrazione interrotto a metà → skip silenzioso al retry successivo su `schema_exists()`; `schema_exists()` non controlla l'exit status di `psql`) — non fanno parte di questo ciclo, restano backlog non ancora schedulato.

## Domande aperte per `/brainstorming`

- Meccanismo esatto di pre-pulizia (item 1): un controllo esplicito all'avvio (es. `docker ps -a --filter` sul progetto `pdash_test` seguito da una rimozione forzata prima di procedere), oppure spostare la responsabilità di pulizia altrove.
- Meccanismo esatto per il guard sulla directory di invocazione (item 2): controllo dell'esistenza di un marker file noto (es. `docker-compose.yml` e/o `api/src/db/migrations/`) con un messaggio di errore esplicito, oppure un altro approccio.
- Meccanismo esatto per rendere `--build` condizionale (item 3): rimuovere `--build` del tutto affidandosi alla cache dei layer Docker (rischio: immagine potenzialmente obsoleta se il contesto di build cambia senza che l'immagine venga mai rimossa), un controllo basato su hash/timestamp di `Dockerfile`+dipendenze rispetto a un marker salvato, o altro meccanismo — bilanciando risparmio di tempo e rischio di eseguire contro un'immagine obsoleta.

Brief ready. Next step: /brainstorming.
