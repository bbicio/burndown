# Brief — scripts/test-branch.sh + scripts/run-tests.sh hardening (Cycle 3)

**Data:** 2026-08-07
**Scenario:** 2 — Evoluzione di feature esistente
**Origine:** Backlog di hardening di `scripts/test-branch.sh`/`scripts/run-tests.sh`, accumulato su più cicli — Ciclo 3 di 3 (raggruppamento per rischio confermato dall'utente nel Ciclo 1: correttezza → hygiene → cosmetici). Due dei sei item candidati originali (`docs/superpowers/reports/2026-08-06-worktree-test-scripts-correctness-hardening-finish-cycle.md`/`docs/superpowers/reports/2026-08-07-worktree-run-tests-hardening-cycle2-finish-cycle.md`) sono stati verificati già risolti come effetto collaterale dei Cicli 1-2 (la riscrittura di `status()` nel Ciclo 1 ha eliminato sia la doppia chiamata `docker ps` che la dipendenza dall'esistenza del file di override) e confermati chiusi con l'utente — non fanno parte di questo ciclo. Questo ciclo copre i 4 item genuinamente ancora aperti, più due emersi dalla review finale del Ciclo 2.

## Current behavior

**1. Dump `pg_dump` in `/tmp` leggibile da altri utenti, mai cancellato.** `scripts/test-branch.sh:144-145`:
```bash
docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > /tmp/pdash_branch_snapshot.dump
docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < /tmp/pdash_branch_snapshot.dump
```
Il file viene creato con un path fisso e permessi di default del sistema (tipicamente leggibili da altri utenti locali su molti sistemi POSIX), e contiene un dump completo del database applicativo — inclusi hash di password utente e dati client potenzialmente sensibili. Non viene mai esplicitamente cancellato dopo l'uso: resta in `/tmp` indefinitamente dopo la fine dello script.

**2. Porte fisse in `test-branch.sh`, non configurabili.** `scripts/test-branch.sh:62-65`:
```bash
FRONTEND_PORT=8081
API_PORT=3001
DB_PORT=5433
ADMINER_PORT=8082
```
Nessun modo di sovrascrivere questi valori senza modificare il file sorgente — se una di queste porte è già occupata da un altro servizio locale dell'utente, `scripts/test-branch.sh up` fallisce senza alcuna via di configurazione.

**3. Nessun guard di concorrenza in `run-tests.sh`.** Il pre-cleanup aggiunto nel Ciclo 2 (`scripts/run-tests.sh:74-75`, `$COMPOSE down -v --remove-orphans`) opera sul progetto Compose fisso `pdash_test` (`:34`). Se due invocazioni di `scripts/run-tests.sh` sono in esecuzione contemporaneamente sulla stessa macchina, la seconda distrugge silenziosamente lo stack della prima a metà esecuzione — prima del Ciclo 2 questo scenario falliva rumorosamente con un conflitto di nome container; ora fallisce in modo confuso a metà test. Nessun meccanismo di lock esiste oggi.

**4. Comando di cleanup duplicato letteralmente.** `scripts/run-tests.sh:67` (dentro `cleanup()`, il target del trap `EXIT`) e `:75` (la chiamata di pre-pulizia introdotta nel Ciclo 2) contengono entrambi la stringa identica `$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true`, senza alcuna funzione condivisa.

## Expected behavior

1. Il dump temporaneo di `pg_dump` in `test-branch.sh` deve essere creato con permessi che impediscono la lettura da altri utenti locali (equivalente a `chmod 0600`), e deve essere esplicitamente cancellato subito dopo il completamento del `pg_restore`, riuscito o fallito.
2. Le 4 porte di `test-branch.sh` (`FRONTEND_PORT`, `API_PORT`, `DB_PORT`, `ADMINER_PORT`) devono essere sovrascrivibili tramite variabili d'ambiente opzionali lette da `.env` (tramite il meccanismo `load_env()` già esistente), mantenendo i valori attuali come default se non specificate — nessuna modifica al comportamento con un `.env` che non le imposta.
3. `scripts/run-tests.sh` deve rifiutarsi di procedere (uscendo con un messaggio d'errore chiaro, senza toccare Docker) se un'altra istanza dello stesso script è già in esecuzione, invece di eseguire silenziosamente il pre-cleanup sopra uno stack Docker attivo di un'altra esecuzione.
4. Il comando di cleanup Docker (`$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true`) deve esistere in un unico punto nel codice sorgente di `run-tests.sh`, riutilizzato sia dal trap `EXIT` sia dal pre-cleanup iniziale.

## Constraints

- Nessuna nuova dipendenza esterna (in particolare: il lock di concorrenza deve usare `mkdir` — atomico su filesystem POSIX — non un tool di locking esterno).
- Nessuna regressione sul comportamento attuale con un'esecuzione singola, completa, senza interruzioni, con `.env` non modificato (nessuna porta personalizzata impostata).
- Il fix delle porte (item 2) riguarda solo `scripts/test-branch.sh` — `scripts/run-tests.sh` non espone porte host (`ports: !override []`), quindi non è interessato da questo item.
- Il guard di concorrenza (item 3) e la deduplicazione del comando di cleanup (item 4) riguardano solo `scripts/run-tests.sh`.
- La rimozione della lock directory deve avvenire nello stesso `cleanup()` già esistente (stesso trap `EXIT`), non in un meccanismo separato.
- Il contratto esterno di entrambi gli script (`exit 0`/`exit 1`, output atteso da `/finish-cycle` Gate 1 e Gate 2) non deve cambiare.

## Acceptance criteria

- Eseguire `scripts/test-branch.sh up` con il main stack attivo (percorso di clonazione dati): il file di dump temporaneo creato ha permessi che ne impediscono la lettura da altri utenti (verificabile con `ls -l` sul file, se catturabile prima della cancellazione, o tramite ispezione del comando `mktemp`/`chmod` nello script), e non esiste più nel filesystem una volta completato il `pg_restore`.
- Impostare una porta personalizzata (es. `TEST_BRANCH_FRONTEND_PORT=9091`) in `.env` e lanciare `scripts/test-branch.sh up`: il servizio nginx del branch stack risponde sulla porta personalizzata, non su `8081`.
- Non impostare alcuna porta personalizzata in `.env` e lanciare `scripts/test-branch.sh up`: il comportamento è identico a oggi (porte di default 8081/3001/5433/8082).
- Avviare `scripts/run-tests.sh` in background, poi avviare una seconda istanza mentre la prima è ancora in esecuzione: la seconda istanza esce immediatamente con un messaggio di errore chiaro (lock già acquisito), senza toccare lo stack Docker della prima istanza, che continua e completa normalmente.
- Ispezionare il codice sorgente di `run-tests.sh` dopo il fix: il comando `$COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true` compare una sola volta nel file (dentro una funzione condivisa), non due.
- Nessuna regressione sul caso d'uso principale (esecuzione singola, completa, `.env` senza porte personalizzate) per entrambi gli script.

## Explicitly excluded scope

- I due item verificati già risolti (doppia chiamata `docker ps`, dipendenza di `status()` dall'esistenza del file di override) — chiusi, non riaperti in questo ciclo.
- Qualunque modifica alla credenziale del test-admin bootstrappato (`test-branch@pdash.local` / `TestBranch123!`, `scripts/test-branch.sh:161-162`) — confermato dall'utente che resta invariata, è una credenziale nota e accettata per un database effimero locale.
- Qualunque modifica alle porte/configurazione di `scripts/run-tests.sh` — non espone porte host, non interessato dall'item 2.
- Introduzione di un tool di locking esterno o di una libreria condivisa multi-script tra `test-branch.sh`/`run-tests.sh` — resta la stessa scelta di duplicazione deliberata già stabilita nei cicli precedenti per `load_env()`; la deduplicazione richiesta qui (item 4) è solo interna a `run-tests.sh` stesso.

Brief ready. Next step: /brainstorming.
