# Audit — Integrazione `scripts/test-branch.sh` nel processo `/finish-cycle`

**Data:** 2026-07-18
**Scope negoziato:** confronto tra le versioni attuali (repo, ground truth) e le versioni proposte offline (`C:\Users\fafortini\Desktop\`) di `docs/superpowers/PROCESS.md` e `.claude/commands/finish-cycle.md`, più il nuovo script `test-branch.sh` (non ancora nel repo). Obiettivo: valutare se/come integrare nel processo standard uno step che, prima del push, apre via Docker un'istanza isolata del sito legata al branch estratto. Criterio finding: qualsiasi divergenza di contenuto tra versione proposta e attuale, più eventuali problemi tecnici nello script stesso rispetto allo stato reale del repo (docker-compose.yml, create-admin.js, .env). Ground truth: i file di repo; le versioni sul Desktop sono una proposta da valutare, non un dato acquisito. Fuori scope: qualunque altra modifica al processo non collegata a questo step.

## Metodo

Letti in coppia i tre file (repo vs Desktop) e diffati a vista; letto lo script `test-branch.sh` per intero; verificati i suoi assunti contro `docker-compose.yml`, `api/src/create-admin.js` e `.env` effettivi del repo.

---

## Findings

### 1. Lo script non legge `.env` — rischio di credenziali disallineate se `POSTGRES_USER`/`POSTGRES_DB` vengono personalizzati

**Tipo:** Bug latente (non ancora attivo con la config attuale)
**Severità:** Media
**Location:** `test-branch.sh:33-34` (`DB_USER="${POSTGRES_USER:-pdash}"`, `DB_NAME="${POSTGRES_DB:-pdash}"`)

**Evidenza:** lo script espande `${POSTGRES_USER:-pdash}` come variabile di shell bash, non come variabile letta da `.env`. `docker-compose.yml:8-9` interpola `${POSTGRES_USER:-pdash}` tramite il caricamento automatico di `.env` fatto da `docker compose` stesso (funzionalità nativa di Compose, non di bash) — quindi il container reale prende sempre il valore corretto da `.env`. Lo script bash invece vede `POSTGRES_USER` solo se è *esportata* nell'ambiente della shell che lancia lo script, cosa che oggi non accade (confermato: `.env` contiene `POSTGRES_USER=pdash` / `POSTGRES_DB=pdash`, quindi il default hardcoded nello script coincide per puro caso).

Per contrasto, `api/src/create-admin.js:18-31` risolve lo stesso problema esplicitamente: parsa `.env` a mano riga per riga proprio perché non può assumere che le variabili siano nell'ambiente.

**Scenario di rottura concreto:** se in futuro `.env` viene modificato per usare un `POSTGRES_USER` diverso da `pdash` (es. per un ambiente multi-tenant o per rotazione credenziali), `test-branch.sh up` chiamerebbe `pg_dump -U pdash` / `pg_restore -U pdash` / `psql -U pdash` contro un container il cui utente reale è un altro — fallimento di autenticazione al primo `up`, con messaggio d'errore Postgres poco intuitivo per chi non conosce questo disallineamento.

**Nota:** non blocca l'adozione oggi (i default coincidono), ma è un problema che si attiverebbe silenziosamente al primo cambio di `.env`, quindi va risolto prima o contestualmente all'introduzione dello script — non lasciato come "problema futuro".

---

### 2. Introduzione coerente nel resto del processo — nessuna divergenza logica tra le tre proposte

**Tipo:** Verifica positiva (non un problema, riportato per completezza della citazione)
**Location:** `PROCESS.md` riga 26 (proposta) vs riga 26 (repo); `finish-cycle.md` Gate 2 (proposta) vs Gate 2 (repo)

**Evidenza:** la riga di `PROCESS.md` proposta aggiunge, dentro la descrizione di `/finish-cycle`, l'inciso `"manual verification (isolated Docker environment for the branch, generated automatically via scripts/test-branch.sh, with data cloned from main via pg_dump/pg_restore if the main stack is running; ...)"` — coerente parola per parola con quanto implementato in Gate 2 step 1 della proposta di `finish-cycle.md` (`scripts/test-branch.sh up`, clonazione dati via `pg_dump`/`pg_restore`, fallback a DB vuoto migrato con utente admin di test). Nessuna delle due proposte introduce comportamento non coperto dall'altra.

La modifica a Gate 2 (righe 26-37 della proposta) preserva intatta la struttura esistente (righe 24-34 del repo: ricerca spec/plan, conferma esplicita "hai verificato nel browser?", stop se no) e la precede con un nuovo step 1 opzionale ("Spin up an isolated test environment... [yes/no]"), tracciando lo stato con `<branch-env-active>` e facendo il teardown solo dopo la conferma positiva di verifica manuale — nessuna condizione di gate esistente viene rimossa o indebolita.

---

### 3. Nessun collegamento esplicito tra `<branch-env-active>` e un "no" a Gate 2 step 5 in caso di riavvio del ciclo dopo un fix

**Tipo:** Gap procedurale minore
**Severità:** Bassa
**Location:** `finish-cycle.md` (proposta) Gate 2 step 1 e step 5, righe 26-37

**Evidenza:** step 5 dice: se la risposta è "no", "Do not tear down the branch environment if `<branch-env-active>` is true — leave it running so the user can keep testing." Corretto per il caso "sto ancora testando". Ma se l'utente risponde "no" perché ha trovato un bug e il flusso normale prevede "Require a fix and a re-run of `/finish-cycle` from the top" (come da Gate 1, riga 16, mantenuto identico nella proposta) — un secondo giro di `/finish-cycle` da capo rieseguirebbe Gate 2 step 1 e chiederebbe di nuovo "Spin up an isolated test environment now?" mentre lo stack del giro precedente è ancora attivo (lasciato apposta up). Se l'utente risponde "yes" una seconda volta, `test-branch.sh up` verrebbe rieseguito sullo stesso `PROJECT`/`OVERRIDE_FILE` — `write_override()` sovrascrive il file esistente (idempotente) e `docker compose up -d --build` su container già esistenti è a sua volta idempotente (ricrea solo se necessario), quindi non è un errore bloccante, ma nessuno dei due file propone di verificare "è già attivo?" prima di richiedere di nuovo il flag, né di ri-clonare i dati da main (che nel frattempo potrebbero essere cambiati, o no).

**Impatto pratico:** comportamento non distruttivo (idempotenza di Compose), ma la domanda "Spin up ... now?" al secondo giro è ambigua per l'utente, che non sa se rispondere "no" (perché è già up) lascerebbe lo stack precedente intatto correttamente, oppure se dovrebbe rispondere "yes" per far ripartire una clonazione dati fresca dopo il fix. Nessuna delle due proposte lo chiarisce.

---

## Ruled out

- **Collisione porte/nomi container tra stack main e stack branch:** verificato che `test-branch.sh` assegna porte distinte (8081/3001/5433/8082 vs 80/3000/5432/8080 di `docker-compose.yml`) e `container_name` distinti per tutti e 4 i servizi con nome fisso in `docker-compose.yml` (`pdash-db`, `pdash-api`, `pdash-nginx`, `pdash-adminer`) — nessuna collisione, i due stack possono coesistere.
- **Uso di sintassi bash nei comandi di `finish-cycle.md`:** lo script viene invocato come `scripts/test-branch.sh up` senza prefisso `bash` — coerente con lo stile già esistente nel resto del documento (ogni altro Gate usa già sintassi bash pura, es. `git merge-base main HEAD`), non è una divergenza introdotta da questa proposta.
- **Ordine di build immagine per il test suite Gate 1 vs stack di branch Gate 2:** nessuna sovrapposizione temporale — Gate 2 (che avvia lo stack di branch) parte solo dopo che Gate 1 (test suite sul default project) è già concluso.
- **Compatibilità versione Postgres per `pg_dump`/`pg_restore` tra i due container:** entrambi usano la stessa immagine `postgres:16-alpine` (non overridata da `test-branch.sh`), nessun mismatch di versione.
- **Firma di `create-admin.js` nel fallback DB vuoto:** `docker exec "$API_CONTAINER" node /app/src/create-admin.js test-branch@pdash.local TestBranch123! Test Branch` rispetta la firma reale `<email> <password> [firstName] [lastName]` (create-admin.js:5, 42).
- **Riferimento a "hot reload" API in `CLAUDE.md`:** notata una formulazione preesistente ("picked up by nodemon") che sembra in tensione con la descrizione di `finish-cycle.md` ("`pdash-api` runs as a plain `node src/index.js` process... with no hot-reload") — ma è una discrepanza già presente in repo, non toccata da nessuna delle proposte offline. Non è un finding di questo audit (fuori scope, vedi sezione sotto).

---

## Out of scope / roadmap notes

- **Discrepanza preesistente in `CLAUDE.md`** (riga 20): dichiara che i cambi ai file Node.js dell'API sono "picked up by nodemon without a rebuild", mentre `finish-cycle.md` (sia versione repo che proposta, riga 82/85) afferma esplicitamente che `pdash-api` gira come processo `node` semplice, senza hot-reload, e richiede un riavvio esplicito post-merge (Gate 4 step 5). Le due affermazioni si contraddicono. Non toccata da questo audit perché non fa parte dei tre file offline forniti — segnalata solo perché notata durante la lettura. Se confermata come bug documentale, andrebbe corretta in un ciclo Scenario 2 separato (probabile causa: `CLAUDE.md` non aggiornato quando `nodemon` è stato rimosso da `api/Dockerfile`, da verificare).
- **Riga da aggiungere a `CLAUDE.md` sotto "Development"**: menzionata verbalmente dall'utente ("Per testare un branch specifico senza toccare main: scripts/test-branch.sh up / down") ma non presente in nessuno dei tre file offline forniti — non è quindi materiale di questo confronto/audit, va trattata come parte del brief di implementazione, non come una divergenza da segnalare.
- **Pulizia di `docker-compose.branch.yml` in caso di `up` fallito a metà**: lo script rigenera il file a ogni `up()` (idempotente) ma non lo rimuove se `up` fallisce prima di arrivare a `down()`. Comportamento non distruttivo, solo un file residuo nella working tree — annotato come nota di robustezza, non un finding bloccante per l'adozione.

---

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
