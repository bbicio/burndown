# Brief — Ciclo 1: `test-branch.sh` deve leggere `.env`

**Data:** 2026-07-18
**Scenario:** 3 — Audit → fix
**Origine:** `docs/superpowers/audits/2026-07-18-test-branch-script-process-integration-audit.md`, Finding 1

---

## Problema

`test-branch.sh` (proposta offline, non ancora in repo) risolve `DB_USER`/`DB_NAME` come `${POSTGRES_USER:-pdash}` / `${POSTGRES_DB:-pdash}`, cioè legge queste variabili dall'ambiente della shell che lancia lo script. Non le legge da `.env`. `docker compose` invece carica `.env` in autonomia (funzionalità nativa), quindi il container reale usa sempre il valore corretto anche se non esportato nella shell.

Oggi i due valori coincidono per puro caso (`.env` ha `POSTGRES_USER=pdash`, `POSTGRES_DB=pdash`, uguali ai default hardcoded nello script). Ma se in futuro `.env` viene personalizzato, lo script chiamerebbe `pg_dump -U pdash` / `pg_restore -U pdash` / `psql -U pdash` contro un container il cui utente reale è diverso — fallimento di autenticazione silenzioso al primo `up`.

`api/src/create-admin.js:18-31` risolve lo stesso problema esplicitamente (parsing manuale di `.env` riga per riga) — pattern già presente e collaudato nel repo per lo stesso tipo di script standalone (fuori dal contesto container, quindi senza le env var di Compose).

## Comportamento attuale / atteso

- **Attuale (proposta offline):** `DB_USER`/`DB_NAME` risolti solo da variabili di shell già esportate, con fallback hardcoded a `pdash`/`pdash`.
- **Atteso:** `test-branch.sh` deve risolvere `POSTGRES_USER`/`POSTGRES_DB` (e qualunque altra variabile di cui ha bisogno da `.env`, es. se in futuro servisse anche `POSTGRES_PASSWORD` per comandi diretti) con lo stesso meccanismo di lettura di `.env` già usato da `create-admin.js`, non solo dall'ambiente di shell.

## Vincoli

- Il fix va dentro `test-branch.sh` stesso (script bash), non nei file `.md` di processo.
- Non introdurre una dipendenza da `dotenv` o altro pacchetto npm — lo script è uno shell script standalone, non un modulo Node; va mantenuto un parsing minimale coerente con lo stile esistente dello script (niente sovraingegnerizzazione).
- Il comportamento con `.env` assente deve restare quello attuale (fallback a `pdash`/`pdash`), non deve diventare un errore bloccante.
- Non toccare la logica di `create-admin.js` — resta il riferimento, non va modificato.

## Criteri di accettazione

- Con `.env` che imposta `POSTGRES_USER`/`POSTGRES_DB` diversi dai default, `test-branch.sh up` usa i valori letti da `.env` per tutte le chiamate `pg_dump`/`pg_restore`/`psql`/interpolazione in `write_override()`.
- Con `.env` assente o senza queste chiavi, il comportamento resta invariato (fallback `pdash`/`pdash`).
- Nessuna regressione sul resto dello script (porte, nomi container, flusso `up`/`down` invariati).

## Scope escluso esplicitamente

- Il Ciclo 2 (ambiguità Gate 2 su rilancio di `/finish-cycle` con stack già attivo) — trattato come Brief separato, non va risolto qui.
- Qualsiasi modifica a `PROCESS.md` o `finish-cycle.md` non necessaria a questo fix specifico.
- La discrepanza preesistente in `CLAUDE.md` su hot-reload/nodemon, notata come fuori scope nell'audit originale — non va toccata in questo ciclo.
- L'aggiunta della riga di documentazione a `CLAUDE.md` menzionata verbalmente dall'utente ("Per testare un branch specifico...") — non è parte di questo fix, va eventualmente in un Brief a parte quando si decide di integrare lo script nel repo.

## Promemoria — finding nuovi durante l'esecuzione

Qualunque nuovo finding emerso durante `/brainstorming` o l'esecuzione di questo ciclo (es. altri punti dello script che assumono env var non lette da `.env`) va isolato e proposto come Brief futuro a sé stante — mai risolto di straforo dentro questo ciclo (guardia Scenario 3, PROCESS.md §2).
