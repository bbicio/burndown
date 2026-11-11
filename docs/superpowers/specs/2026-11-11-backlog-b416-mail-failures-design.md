# Backlog, B-416 + B-432: email fallite e posta dei test — design spec

**Date:** 2026-11-11
**Brief started:** 2026-11-11 10:47
**Brief:** `docs/superpowers/briefs/2026-11-11-backlog-b416-mail-failures-brief.md`
**Scenario:** 2 (evoluzione), dai finding B-416 e B-432

Gli stack di prova smettono di mandare posta vera, e una mail che non parte non trasforma più in 500 un'azione già registrata.

## 1. Fatti verificati nel codice (a `85b6693`)

- `api/src/services/email.js` crea un solo `transporter` nodemailer da `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`.
- `docker-compose.yml` passa all'API le variabili SMTP del `.env`. Gli override scritti da `scripts/run-tests.sh` e `scripts/test-branch.sh` non le cambiano, quindi entrambi gli stack usano il Gmail dell'app vera. Lo stack di branch contiene dati clonati dalla produzione.
- Attendono la mail dopo una scrittura e rispondono 500 se SMTP rifiuta: `POST /api/cost-grids/:id/shares`, `POST /api/projects/:id/shares`, `POST /api/programs/:id/share` (`api/src/routes/config.js`), `POST /api/auth/invite` (utente `pending` già creato), `POST /api/auth/:id/resend-invite` (token già cambiato), `POST /api/auth/forgot-password` (500 nonostante il commento "Always return 200").
- `POST /api/exports/{portfolio|cost-grids|ratecards}` attendono `sendExportEmail` senza scritture prima e rispondono 500.
- `POST /api/auth/two-step/resend` risponde già `502 { error: 'The email could not be sent', code: 'SEND_FAILED' }` quando la mail non parte.
- `js/shares.js` mostra "Shared with X." a ogni risposta riuscita; `admin.html` mostra "Invite sent to X" a ogni invito riuscito e `d.error` quando "Resend invite" fallisce.

## 2. La posta degli stack di prova va a Mailpit

- Un servizio `mailpit` (immagine `axllent/mailpit`, versione fissata) è definito **solo** nei file di override che `scripts/run-tests.sh` e `scripts/test-branch.sh` scrivono. `docker-compose.yml` non cambia, quindi lo stack principale non può raggiungerlo.
- Negli stessi override l'API riceve `SMTP_HOST: mailpit` e `SMTP_PORT: 1025`; Mailpit accetta qualunque credenziale (`MP_SMTP_AUTH_ACCEPT_ANY`, `MP_SMTP_AUTH_ALLOW_INSECURE`).
- In `run-tests.sh` Mailpit non pubblica porte, ha il chaos abilitato (`MP_ENABLE_CHAOS`), e il container `test` riceve `MAILPIT_URL: http://mailpit:8025`.
- In `test-branch.sh` l'interfaccia web di Mailpit è pubblicata su una porta fissa, **8083** di default (`TEST_BRANCH_MAIL_PORT` per cambiarla): al Gate 2 i codici di accesso e le mail di invito si leggono lì.

## 3. Risposte quando la mail non parte

Regola: se la mail è un effetto collaterale di un'azione già registrata, l'azione resta e la risposta è un successo con `emailSent: false`; se la mail è l'azione stessa, la risposta è `502 SEND_FAILED`; `forgot-password` risponde sempre 200. In ogni caso l'errore SMTP è loggato (`console.warn`) e non diventa un 500.

| Route | Risposta con la mail rifiutata |
|---|---|
| `POST /api/cost-grids/:id/shares` | `201 { ok: true, emailSent: false }`; la notifica in-app è creata comunque |
| `POST /api/projects/:id/shares` | `201 { ok: true, emailSent: false }`; la notifica in-app è creata comunque |
| `POST /api/programs/:id/share` | `201 { ok: true, shared, emailSent: false }`; le notifiche in-app sono create comunque |
| `POST /api/auth/invite` | `201 { id, emailSent: false }` |
| `POST /api/auth/:id/resend-invite` | `502 { error: 'The email could not be sent', code: 'SEND_FAILED' }` |
| `POST /api/exports/{portfolio,cost-grids,ratecards}` | `502 { error: 'The email could not be sent', code: 'SEND_FAILED' }`, senza la notifica "Your export is ready" |
| `POST /api/auth/forgot-password` | `200 { ok: true }` |

Con la mail partita le risposte riuscite portano `emailSent: true` (condivisioni e invito) e restano per il resto quelle di oggi.

## 4. Il frontend dice che la mail non è partita

- `js/shares.js`: con `emailSent === false` il messaggio diventa `Shared with X, but the email could not be sent.` (programmi: `Shared program with X (N projects), but the email could not be sent.`). Tutti i riferimenti `?v=N` a `js/shares.js` salgono insieme.
- `admin.html`: con `emailSent === false` il riquadro dell'invito dice `Invite created for X, but the email could not be sent — use Resend invite.` "Resend invite" mostra già `d.error` e non cambia.

## 5. Test

| Voce | Test |
|---|---|
| (b) | `test-api.js` MAIL-01: dopo un export, `GET $MAILPIT_URL/api/v1/messages` contiene una mail all'indirizzo dell'utente. TS-26 e PY-13 verdi. |
| (a) | `test-api.js` MAIL-02..MAIL-08: con il chaos di Mailpit acceso (rifiuto del destinatario), una condivisione di cost grid, una di progetto, una di programma, un invito, un nuovo invito, un export e un `forgot-password` danno le risposte della tabella del §3. Il chaos si spegne nel `finally`. Rossi prima del fix (500), verdi dopo. |
| frontend | Nessun test automatico: il messaggio di `js/shares.js` e il riquadro di `admin.html` si verificano a mano sullo stack di branch, con il chaos acceso dall'API di Mailpit. |

Se la versione fissata di Mailpit non avesse il chaos, (a) si prova con `node:test` sui gestori, col modulo `services/email` finto, come nel ciclo `backlog-auth-followups`.

Si aggiornano `docs/scripts/run-tests.md`, `docs/scripts/test-branch.md` (Mailpit, la porta 8083), `ARCHITECTURE.md` §5 (le risposte del §3) e `TEST_CASES.md`.

## Criteri di accettazione

1. **Nessuna posta vera dai test** — `scripts/run-tests.sh` manda la posta a Mailpit (`test-api.js` MAIL-01) e TS-26 e PY-13 sono verdi.
2. **Condivisioni registrate** — con la mail rifiutata le tre condivisioni rispondono 201 con `emailSent: false` e la condivisione esiste (`test-api.js` MAIL-02..MAIL-04).
3. **Invito registrato** — con la mail rifiutata l'invito risponde 201 con `emailSent: false` e l'utente `pending` esiste (`test-api.js` MAIL-05).
4. **Mail come azione** — con la mail rifiutata "Resend invite" e l'export rispondono `502 SEND_FAILED` (`test-api.js` MAIL-06, MAIL-07).
5. **Forgot password muto** — con la mail rifiutata `forgot-password` risponde 200 (`test-api.js` MAIL-08).
6. **Messaggi nel frontend** — sullo stack di branch, con il chaos di Mailpit acceso, il modale di condivisione e il drawer dell'invito in `admin.html` dicono che la mail non è partita.
7. **Mailpit sullo stack di branch** — `scripts/test-branch.sh up` mostra la posta dello stack su `http://localhost:8083`, e lo stack principale non ha un servizio `mailpit`.
8. **Suite verdi** — `npm test`, i test `node:test` di `api/` e `test-api.js` passano al 100%, senza rossi accettati a mano.

## Scope escluso esplicitamente

- B-417 (stream SSE aperti dopo la revoca) e il ciclo 2 (validazione di input delle altre route).
- La scelta del fornitore SMTP dell'app vera e la sua quota.
- Il codice di accesso del login (`sendLoginCode`), già senza 500.
- Le mail che non sono attese oggi (`sendOwnerReassignedEmail`, `sendShareRevokedEmail`, `sendAdminNotificationEmail`): già fire-and-forget.
- Una coda d'invio con ritentativi.

## Decisioni aperte

1. **Mailpit negli override, per `run-tests.sh` e `test-branch.sh`.** Alternativa scartata: uno stub SMTP nel container `test`, oppure un trasporto senza rete in `email.js`. Perché: è l'unica che isola anche lo stack di branch, con dati clonati, e lascia leggere le mail al Gate 2, senza un ramo di sola prova nel codice dell'app.
2. **Mailpit definito solo negli override, non in `docker-compose.yml`.** Alternativa scartata: un servizio con `profiles: ["test"]` nel file base. Perché: lo stack principale non deve poter avere un servizio `mailpit` neanche per errore.
3. **Successo con `emailSent: false` quando la mail segue una scrittura; `502 SEND_FAILED` quando la mail è l'azione.** Alternativa scartata: 502 anche dopo una scrittura riuscita, oppure una coda d'invio. Perché: un errore su un'azione riuscita induce un retry dannoso (l'invito risponde 409), e la coda è un sottosistema sproporzionato.
4. **`forgot-password` sempre 200.** Alternativa scartata: 502 come gli altri. Perché: la risposta non deve rivelare se l'indirizzo esiste, come dice già il suo commento.
5. **(a) provato end-to-end col chaos di Mailpit.** Alternativa scartata: `node:test` sui gestori con il modulo email finto. Perché: copre le sette route con il loro SQL vero e senza fake per ogni query; `node:test` resta il ripiego se il chaos manca.
6. **Porta 8083 per l'interfaccia di Mailpit sullo stack di branch.** Alternativa scartata: nessuna porta, mail lette solo con `docker exec`. Perché: il vantaggio per il Gate 2 è leggere i codici in una pagina.
7. **Classe di rischio standard.** Alternativa scartata: high-risk. Perché: le route toccate cambiano la risposta all'errore di posta, non l'autenticazione o i permessi; `invite` e `forgot-password` stanno in `routes/auth.js`, ma la loro logica di accesso non cambia.
