# Brief — backlog, ciclo 1: hardening di autenticazione e profilo

**Tipo:** audit-fix (Scenario 3) con un punto di design (B-414). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-401, B-403, B-404, B-406, B-410, B-414, B-415, B-407, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Le route di auth, utenti e profilo portano limiti mancanti, scritture non atomiche e una sessione che sopravvive alla disattivazione dell'account. Hanno in comune `api/src/routes/auth.js`, `api/src/routes/users.js` e `api/src/middleware/auth.js`.

## Comportamento attuale

- B-401: la richiesta di rettifica non ha throttle. B-404: risponde 201 anche con zero admin. B-410: INSERT sequenziali per admin.
- B-403: DELETE poi UPDATE come due query senza transazione. B-406: controllo duplicato con SELECT poi UPDATE, senza gestire il 23505.
- B-414: il JWT resta valido fino a otto ore dopo disattivazione, anonimizzazione o cambio password. B-415: la porta 3000 è pubblicata mentre `trust proxy` è attivo, quindi un header `X-Forwarded-For` falsificato è accettato.
- B-407: un commento sulle Terms sta sopra la route sbagliata.

## Comportamento atteso

- Le scritture di B-403 sono atomiche, quella di B-406 gestisce la violazione di unicità con un errore pulito, B-404 non finge un invio riuscito.
- B-401 ha un limite come gli altri flussi di auth.
- B-414 e B-415 sono risolti con la soluzione scelta in brainstorming.

**Punto di design (B-414, B-415).** Il `/brainstorming` sceglie con l'utente fra: A) `requireAuth` rilegge stato e versione di sessione dal DB; B) una versione di sessione nel token invalidata dalle azioni sensibili; C) accettare il residuo documentandolo. Per B-415: non pubblicare la porta 3000 sull'host, oppure non fidarsi dell'header. B-414 va deciso per primo: cambia il costo di ogni richiesta autenticata.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un test per ogni voce non di design fallisce prima del fix e passa dopo.
2. `test-api.js` copre la scelta fatta per B-414.
3. `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- La validazione di input delle altre route (ciclo 2).
- Il due-fattori già consegnato.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
