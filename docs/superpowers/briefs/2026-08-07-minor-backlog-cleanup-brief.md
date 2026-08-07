# Brief — bundled minor backlog cleanup (7 items)

**Data:** 2026-08-07
**Scenario:** 2 — Evoluzione di funzionalità esistenti
**Origine:** Sette item minori accumulati su più cicli, nessuno con impatto utente reale, raggruppati in un unico ciclo di pulizia su richiesta esplicita dell'utente dopo una survey del backlog (nessun item è stato valutato critico — vedi discussione in chat: tutti sono robustezza/hygiene su strumenti interni o codice morto, non su funzionalità user-facing).

## Current behavior

**1. `schema_exists()` in `scripts/test-branch.sh` controlla solo `public.users`, non tutte le migrazioni.** `scripts/test-branch.sh:105-110`:
```bash
schema_exists() {
  local result
  result=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT to_regclass('public.users') IS NOT NULL;")
  [ "$result" = "t" ]
}
```
Se un `up` precedente viene interrotto dopo che la migrazione `001_initial.sql` (che crea `public.users`) è stata applicata ma prima che tutte le successive (`002`...`017`) lo siano, un `up` successivo vede `schema_exists()` vero e salta **l'intero** ciclo di migrazioni (`:153-160`), lasciando uno schema parzialmente migrato senza alcun avviso.

**2. `schema_exists()` non controlla l'exit status di `psql`.** Stesso blocco (`:107-108`): se la chiamata `psql` fallisce per un problema transitorio di connessione, `$result` risulta vuoto/diverso da `"t"`, la funzione ritorna 1 ("schema assente") e le migrazioni vengono ri-applicate — direzione fail-safe, ma non è un controllo esplicito dell'exit status.

**3. `status()` in `scripts/test-branch.sh`: la stringa di fallback `"missing"` è raggiungibile solo per un container davvero inesistente.** `scripts/test-branch.sh:122-133`: `db_health`/`api_health` diventano `"missing"` solo se `docker inspect` fallisce del tutto (container mai creato); un container esistente ma privo di healthcheck restituirebbe una stringa vuota per `.State.Health.Status`, non `"missing"` — la variabile prende comunque la strada "down" corretta, ma il nome `"missing"` è semanticamente fuorviante per quel caso.

**4. `load_env()` in entrambi gli script: `line`/`key`/`val` non sono dichiarate `local`.** `scripts/test-branch.sh:24-41` e `scripts/run-tests.sh:20-37` (copie identiche per design, non consolidate): solo `env_file` è `local` (riga 25/21); `line`, `key`, `val` restano variabili globali della shell dello script, sovrascrivendo silenziosamente qualunque variabile con lo stesso nome nello scope chiamante.

**5. Il dump di clonazione dati in `scripts/test-branch.sh` può non essere ripulito su fallimento a metà.** `scripts/test-branch.sh:142-148`:
```bash
DUMP_FILE=$(mktemp)
docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP_FILE"
docker exec -i "$DB_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < "$DUMP_FILE"
rm -f "$DUMP_FILE"
```
Sotto `set -euo pipefail`, se `pg_dump` o `pg_restore` fallisce, lo script esce prima di raggiungere `rm -f "$DUMP_FILE"`, lasciando il file temporaneo (permessi `600` già corretti dal Ciclo 3, ma non cancellato) su disco.

**6. Codice morto: UI di editing modale in `js/programs.js`/`js/roles.js` mai raggiunta da nessuna pagina.** Verificato con grep su tutto il repo (HTML + JS): `showProgramsModal`, `renderProgramsTable`, `openProgramEditModal`, `saveProgramFromModal`, `showProgramError`, `deleteProgram`, `cfgRefreshProgramDropdown` (`js/programs.js:29-135`) e `showRolesView`, `hideRolesView`, `renderRolesTable`, `extractTeam`, `openRoleModal`, `saveRoleFromModal`, `showRoleError`, `deleteRole`, `exportRoles`, `importRoles` (`js/roles.js:31-215`) non sono mai chiamate da nessun file `.html`/`.js` del repo, eccetto tra loro stesse (es. `cfgRefreshProgramDropdown` è chiamata solo da `saveProgramFromModal`/`deleteProgram`, anch'esse morte). Le funzioni **live** negli stessi due file (`loadProgramsFromApi`, `savePrograms`, `getPrograms` in `programs.js`; `loadRolesFromApi`, `saveRoles`, `getRoles` in `roles.js`) restano genuinamente usate — confermato via `Promise.all([...loadProgramsFromApi()...loadRolesFromApi()...])` in `costgrid.html:1227`, `pipeline.html:703`, `planning.html:1439`, `project-config.html:415/674` — e non vanno toccate.

**7. `resolveColumnMap()` in `api/src/routes/timesheets.js`: tre gap minori, nessuno con un trigger reale dimostrato.** `api/src/routes/timesheets.js:221-269`:
- `matchSpecificity()` (`:221-231`) usa `h.indexOf(c)`, che trova solo la **prima** occorrenza della stringa candidata nell'header — se un candidato compare più volte in un header con la prima occorrenza non a confine di parola ma una successiva sì, il match valido viene perso.
- L'assegnazione finale (`:258-266`) è greedy (ordina tutti i match per punteggio e assegna il primo disponibile), non una vera ottimizzazione bipartita globale — in casi patologici con più campi che competono per gli stessi header potrebbe non produrre l'assegnazione complessivamente migliore.
- `usedHeaders` (`:259`) è un `Set` di **stringhe** header, non di indici di colonna — due colonne con testo header identico (es. due colonne entrambe letteralmente chiamate "Notes") vengono trattate come la stessa "risorsa" ai fini del controllo di duplicazione, potendo causare l'assegnazione mancata o errata della seconda colonna anche se occupa una posizione distinta nel file.

## Expected behavior

1. Un secondo `up` interrotto a metà migrazione non deve lasciare uno schema parzialmente migrato senza segnalazione — il meccanismo esatto (verifica dell'ultima migrazione applicata, o altro) è una decisione di design per `/brainstorming`.
2. Un fallimento della chiamata `psql` in `schema_exists()` deve essere distinguibile da uno schema genuinamente assente (es. tramite controllo esplicito dell'exit status), pur mantenendo la stessa direzione fail-safe attuale.
3. Il nome/valore di fallback in `status()` deve riflettere accuratamente la condizione che rappresenta (container inesistente vs. container esistente senza healthcheck), senza cambiare il contratto esterno di `status()`.
4. `line`/`key`/`val` in `load_env()` devono essere dichiarate `local` in entrambi gli script, mantenendo le due copie identiche.
5. Il dump temporaneo di `test-branch.sh` deve essere rimosso anche se `pg_dump`/`pg_restore` fallisce a metà.
6. Le funzioni morte elencate al punto 6 devono essere rimosse da `js/programs.js`/`js/roles.js`, lasciando intatte le funzioni live nello stesso file.
7. I tre gap di `resolveColumnMap()` devono essere corretti senza alterare il comportamento su header ben formati e non duplicati (il caso già coperto dai test esistenti).

## Constraints

- Nessuna nuova dipendenza esterna.
- Nessuna regressione sul comportamento attuale in ogni caso d'uso già funzionante (esecuzione singola/completa di entrambi gli script; upload timesheet con header ben formati; pagine che caricano `js/programs.js`/`js/roles.js` per le loro funzioni live).
- Il contratto esterno di `test-branch.sh` (`up`/`down`/`status`, exit code) e di `resolveColumnMap()` (firma, forma del valore di ritorno) non deve cambiare.
- La rimozione del codice morto (item 6) non deve toccare né i markup HTML statici associati (`#programsModal`, `#programEditModal`, `#rolesModal`, `#roleModal` e simili) né le funzioni live nello stesso file — verificare con lo stesso metodo di grep usato in questo brief prima di rimuovere qualunque markup, dato che una rimozione di markup non richiesta esplicitamente sarebbe fuori scope.
- Il fix di `resolveColumnMap()` (item 7) deve mantenere il comportamento attuale su tutti i casi già coperti da test esistenti (se presenti in `api/src/routes/timesheets.test.js` o simili) — verificare prima di modificare.

## Acceptance criteria

- Simulare un'interruzione a metà del ciclo di migrazioni di `test-branch.sh` (es. eseguire manualmente solo `001_initial.sql`, poi lanciare `up`): un secondo `up` deve rilevare lo stato incompleto invece di saltare silenziosamente tutte le migrazioni rimanenti.
- Con una connessione `psql` che fallisce artificialmente (es. container DB fermato a metà chiamata), `schema_exists()` non deve confondere l'errore con "schema assente" in modo indistinguibile da un vero schema assente nei log/output.
- `status()` distingue nell'output/log interno (non nel contratto esterno `up`/`down`) tra "container inesistente" e "container esistente senza healthcheck".
- Una `.env` con una riga che assegna una variabile con lo stesso nome di `line`/`key`/`val` non viene sovrascritta silenziosamente dopo l'esecuzione di `load_env()`.
- Simulare un fallimento di `pg_dump`/`pg_restore` durante `test-branch.sh up`: il file temporaneo creato da `mktemp` non rimane sul disco dopo che lo script termina con errore.
- Le funzioni elencate al punto 6 non esistono più in `js/programs.js`/`js/roles.js`; le pagine che caricano questi file continuano a funzionare senza errori console (verificabile in browser: le stesse pagine di prima, stesso comportamento delle funzioni live).
- Un file di upload timesheet con due colonne dall'header testualmente identico viene mappato correttamente (entrambe le colonne considerate distinte); i test esistenti su `resolveColumnMap()` continuano a passare.

## Explicitly excluded scope

- Qualunque altro item del backlog storico non elencato sopra (già tutti confermati chiusi in cicli precedenti — vedi la survey completa fatta in chat).
- Rimozione o modifica del markup HTML associato al codice morto rimosso (item 6) — solo le funzioni JS.
- Introduzione di un meccanismo di migration-tracking complesso (tabella dedicata) per l'item 1 — soluzioni più semplici vanno preferite se sufficienti, stessa constraint già stabilita nel Ciclo 1 dell'hardening di `test-branch.sh`.
- Riscrittura completa dell'algoritmo di `resolveColumnMap()` — solo i tre gap puntuali elencati, mantenendo l'approccio a punteggio di specificità già in uso.

## Domande aperte per `/brainstorming`

- Meccanismo esatto per item 1 (rilevare una migrazione parziale): controllare l'esistenza dell'ultima tabella/oggetto noto creato dall'ultima migrazione nella lista, oppure un'altra strategia più semplice.
- Meccanismo esatto per item 2 (distinguere fallimento `psql` da schema assente): controllo esplicito dell'exit status di `psql` prima di interpretare l'output.
- Se raggruppare i 7 item in un'unica implementazione o strutturarli come sotto-task distinti nello stesso ciclo (dato che toccano 4 file completamente indipendenti: `scripts/test-branch.sh`, `scripts/run-tests.sh`, `js/programs.js`+`js/roles.js`, `api/src/routes/timesheets.js`).

Brief ready. Next step: /brainstorming.
