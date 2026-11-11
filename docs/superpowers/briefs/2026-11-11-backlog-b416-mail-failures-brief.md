# Brief — backlog, B-416: email fallite e posta dei test

**Tipo:** forma Scenario 2 (evoluzione), con punti di design aperti per `/brainstorming`. Raggruppamento confermato dall'utente il 2026-11-11 (ciclo C della proposta di `audit-to-brief`).
**Perché non è un audit-fix meccanico:** B-416 non ha una sola correzione giusta. Cosa rispondere quando la mail fallisce dopo una scrittura, e come isolare la posta dei test, sono scelte di design.
**Origine:** `docs/BACKLOG.md` B-416, trovato al Task 6 di `backlog-c01-auth-profile-hardening` e confermato in tutti i run di `scripts/run-tests.sh` del 2026-11-11; più B-432, gli altri punti con la stessa causa, inclusi in questo ciclo per decisione dell'utente del 2026-11-11.
**Sequenza concordata:** questo ciclo, poi il ciclo 2 di `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`, poi B-417.

## Problema

1. **(b) La suite d'integrazione manda posta vera.** `scripts/run-tests.sh` (e `scripts/test-branch.sh`) avviano l'API con l'SMTP del `.env`, cioè lo stesso account Gmail dell'app vera. Ogni run spedisce decine di mail reali a indirizzi `@pdash.local`. Esaurita la quota giornaliera (`550 5.4.5 Daily user sending limit exceeded`) succedono due cose: TS-26 e PY-13 falliscono senza colpa del codice, e **l'app vera non manda più i codici di accesso**, come è successo il 2026-11-11 mattina.
2. **(a) Una mail fallita dopo una scrittura risponde 500.** `POST /api/cost-grids/:id/shares` registra la condivisione e poi attende `sendShareNotification`: se SMTP rifiuta, risponde 500 anche se la condivisione c'è. `POST /api/exports/{portfolio|cost-grids|ratecards}` attendono `sendExportEmail` e rispondono 500. Stessa forma (B-432): `POST /api/auth/invite` (l'utente `pending` è già creato, e un nuovo tentativo risponde 409 "Email already registered"), `POST /api/auth/:id/resend-invite` (il token è già cambiato), `POST /api/auth/forgot-password` (risponde 500 nonostante il commento "Always return 200"), e la condivisione di progetto in `api/src/routes/config.js` e `api/src/routes/projects.js`.

## Comportamento attuale

- `api/src/services/email.js` crea un solo `transporter` nodemailer da `SMTP_HOST/PORT/USER/PASS`, senza un modo di sostituirlo per i test.
- `docker-compose.yml` passa all'API le variabili SMTP del `.env`; l'override scritto da `scripts/run-tests.sh` non le cambia. Per l'LLM lo stesso override punta già l'API a uno stub dentro il container `test` (`ANTHROPIC_BASE_URL: http://test:4010`).
- La condivisione da cost grid scrive `resource_shares`, poi attende la mail, poi crea la notifica: un rifiuto SMTP salta la notifica e risponde 500.
- Gli export costruiscono il CSV, attendono la mail, poi creano la notifica "Your export is ready": un rifiuto SMTP risponde 500, e nulla è stato scritto.
- `test-api.js` TS-26 e PY-13 verificano export e condivisione passando per l'SMTP vero.

## Comportamento atteso

- **(b)** Nessun run di `scripts/run-tests.sh` manda posta fuori dalla macchina, e il risultato della suite non dipende da Gmail. I test che passano per una mail (export, condivisione, codici) restano verdi a ogni run.
- **(a)** Una condivisione, un invito o un reset registrati non rispondono 500 per colpa della mail. Un export la cui mail non parte risponde un errore che dice che la mail non è partita, non un 500 generico. `forgot-password` risponde 200 anche quando la mail non parte.

**Punti di design per `/brainstorming`:**
- **(b), dove va la posta dei test:** A) un servizio SMTP finto nello stack di test (per esempio Mailpit, con un'API HTTP da cui i test possono leggere le mail ricevute); B) uno stub SMTP minimale dentro il container `test`, sul modello dello stub LLM; C) un trasporto senza rete in `email.js` (per esempio `jsonTransport` di nodemailer) attivato da una variabile d'ambiente. Va deciso anche se `scripts/test-branch.sh` (verifica manuale al Gate 2) usa la stessa soluzione, sapendo che lì l'utente può avere bisogno di leggere il codice di accesso.
- **(a), la risposta dopo una mail fallita:** A) la scrittura resta, la risposta è 2xx con un'indicazione che la mail non è partita (e l'errore è loggato); B) un 502 esplicito, mantenendo la scrittura e rendendo il retry innocuo; C) una coda d'invio con ritentativi (outbox). Per gli export, dove la mail è il prodotto stesso, la scelta può essere diversa da quella per la condivisione.

## Vincoli

- `.env` resta la configurazione dell'app vera; la soluzione di (b) non deve chiedere di cambiarlo, né rischiare che lo stack principale mandi posta al servizio finto.
- Docker sullo stack principale: mai `docker compose down/up/restart`, mai `-v`, salvo la deroga del Gate 4 step 7 di `/finish-cycle`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; si cerca per pattern.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un run di `scripts/run-tests.sh` non apre connessioni verso l'SMTP del `.env` (verifica scelta in brainstorming), e TS-26 e PY-13 sono verdi.
2. Un test fallisce prima del fix e passa dopo per ciascuna risposta di (a) con la mail rifiutata: condivisione (cost grid e progetto), export, invito, nuovo invito, reset della password.
3. `npm test`, i test `node:test` di `api/` e `test-api.js` passano al 100%, senza rossi accettati a mano.

## Scope escluso esplicitamente

- B-417 (stream SSE aperti dopo la revoca) e il ciclo 2 (validazione di input delle altre route).
- La scelta del fornitore SMTP dell'app vera e la sua quota.
- Il codice di accesso del login (`sendLoginCode`), che già gestisce l'errore di invio senza 500.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
