# Brief — backlog, ciclo 3: regole su date e periodi, server e client

**Tipo:** audit-fix (Scenario 3). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-124, B-132, B-149, B-151, B-162, B-167, B-169, B-170, B-224, B-135, B-154, B-155, B-156, B-140, B-141, B-160, B-147, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Le regole di periodo sono applicate in modo diverso fra la `PATCH` di versione e progetto e la `PUT` della structure: una controlla il restringimento, l'altra tutti i task, una tollera i dati già invalidi, l'altra no. Lato client le funzioni sono duplicate fra `costgrid.html` e `project-config.html`. Radice comune: nessun helper unico in `dates.js`.

## Comportamento attuale

- Server: B-124 (`structure-rules.js` guarda solo `task_ids`), B-132 e B-169 (controllo di tutti i task senza tolleranza dell'invalido salvato), B-149 (phasing `PATCH` senza controllo di periodo), B-151 (lettura dei task senza lock), B-162, B-135, B-170, B-167, B-224.
- Client: B-154, B-155, B-156 (duplicazioni e `toIso` mancante), B-140, B-141, B-160 (messaggio per periodo invertito), B-147 (test che non asserisce `pages` non vuoto).

## Comportamento atteso

- Un solo helper per unire e controllare i periodi, usato da tutte le route elencate, con la regola "un periodo invalido esistente è tollerato finché le sue date non cambiano".
- Il client usa le stesse funzioni da `js/lib/dates.js`, senza copie nelle pagine.

Il `/brainstorming` decide se B-151 (lock) richiede una transazione, e se il client e il server condividono i messaggi.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Test `node:test` degli helper con periodo valido, invertito, invalido esistente e restringimento.
2. `test-api.js` verifica che le route di B-132, B-149 e B-169 rispondano `DATE_RULE` negli stessi casi.
3. `npm test` e i test di `api/` passano.

## Scope escluso esplicitamente

- La validazione generica di input (ciclo 2).
- Il motore di reforecast (ciclo 4).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
