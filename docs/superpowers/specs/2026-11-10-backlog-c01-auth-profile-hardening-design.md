# Backlog, ciclo 1: hardening di autenticazione e profilo — design spec

**Date:** 2026-11-10
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-10-backlog-c01-auth-profile-hardening-brief.md`
**Scenario:** 3 (audit → fix), con un punto di design (B-414, B-415)

Le route di auth, utenti e profilo ricevono i limiti e le scritture atomiche che mancano, e una sessione
aperta muore quando l'account viene disattivato, anonimizzato o cambia password.

## 1. Fatti verificati nel codice (a `62b387c`)

Tutte le voci sono ancora aperte; il comando di riverifica di ciascuna sta nella sua riga di `docs/BACKLOG.md`.

- `requireAuth` (`api/src/middleware/auth.js`) verifica solo la firma del JWT; `requireSysAdmin` fa una
  `SELECT role` propria; `liveRole()` è usata dalle route per i controlli sul ruolo corrente.
- Il JWT è firmato in `POST /login` e `POST /two-step/verify` con `{ id, email, role }` (`api/src/routes/auth.js`).
- `password_changed_at` è scritta da `activate`, `reset-password`, `change-password` e messa a `NULL`
  dall'anonimizzazione; il guard del due-step la confronta come `floor(extract(epoch FROM password_changed_at) * 1000)`
  (`api/src/services/two-step.js`).
- `revokeTwoStepState(userId, { db })` accetta un client: può stare in una transazione.
- La porta `3000:3000` di `docker-compose.yml` non ha utenti sull'host: `test-api.js` usa `http://api:3000`
  sulla rete Compose, l'healthcheck gira nel container, `scripts/test-branch.sh` la sovrascrive.
- `test-api.js` PW-01 cambia la password e poi riusa lo stesso cookie.
- `profile.html` mostra `Request sent to the admins.` a ogni risposta riuscita della richiesta di rettifica.

## 2. B-414 — la sessione segue lo stato dell'account

**Token.** Il payload firmato diventa `{ id, email, role, pwd }`, dove `pwd` è `password_changed_at` in
millisecondi interi (`Date.getTime()` del valore letto da `pg`), oppure `null` quando la colonna è `NULL`.
Lo firmano `login`, `two-step/verify` e `change-password` (vedi sotto).

**`requireAuth`.** Dopo la verifica della firma esegue una sola query per chiave primaria:

```sql
SELECT status, role,
       floor(extract(epoch FROM password_changed_at) * 1000)::bigint AS pwd
FROM users WHERE id = $1
```

e risponde `401 { error: 'Session expired' }` quando: la riga manca; `status <> 'active'`; il token non ha il
claim `pwd`; `pwd` del token è diverso da quello della riga (`null` uguale solo a `null`). Altrimenti
`req.user.role` prende il ruolo letto dal DB e la richiesta prosegue. Un errore della query passa a `next(err)`.

Ne seguono:
- disattivazione (`PATCH /api/users/:id` con `status: 'disabled'`, `DELETE /api/users/:id`) e anonimizzazione
  (`status = 'disabled'`) chiudono ogni sessione aperta dell'utente alla richiesta successiva;
- `change-password`, `reset-password`, `activate` chiudono le sessioni emesse prima del cambio;
- un token emesso prima del deploy (senza `pwd`) è rifiutato: ogni utente rifà il login una volta;
- un admin declassato perde i diritti alla richiesta successiva.

**`requireAdmin`** resta costruito su `requireAuth` e legge il ruolo ora aggiornato. **`requireSysAdmin`**
perde la propria query e controlla `req.user.role` dopo `requireAuth`. `liveRole()` resta invariata e resta
usata dalle route che la chiamano.

**`change-password`** scrive la password con `RETURNING password_changed_at` e riemette `pdash_token` con il
nuovo `pwd`: la sessione che ha cambiato la password resta aperta, le altre no.

**SSE.** Lo stream `/api/notifications/stream` passa da `requireAuth` all'apertura; una connessione già aperta
non viene chiusa da questo ciclo.

## 3. B-415 — l'API non è pubblicata sull'host

Si toglie `ports: - "3000:3000"` dal servizio `api` di `docker-compose.yml`. `app.set('trust proxy', 1)` resta:
l'unico ingresso è nginx, che imposta `X-Forwarded-For`. `scripts/test-branch.sh` mantiene il proprio
override `${API_PORT}:3000` per lo stack di branch.

Lo stack principale prende la modifica solo ricreando il container (`docker compose up -d api`): non rientra
nella deroga del Gate 4 step 7 e resta un passo manuale dell'utente dopo il merge, da riportare nel report.

## 4. Richiesta di rettifica — `POST /api/auth/rectification-request`

- **B-401.** Un `createLimiter({ windowMs: 60 * 60 * 1000, max: 5 })` con chiave `req.user.id`. Lo slot si prende
  dopo la validazione del messaggio, prima della prima `await`; oltre il limite `rateLimited(res, retryInMs)`
  (`429 { code: 'RATE_LIMITED', retryIn }`).
- **B-404.** Prima dell'INSERT la route legge gli admin/sysadmin attivi diversi dal richiedente. Se sono zero
  risponde `409 { error: 'There is no other admin to send this request to.', code: 'NO_RECIPIENT' }` e non
  registra nulla. `profile.html` mostra quel messaggio come errore nel drawer invece del banner di successo.
- **B-410.** Le notifiche nascono con un solo `INSERT INTO notifications (…) SELECT … FROM users WHERE …
  RETURNING …` dentro `notifyAdmins(db, requestId, title, body, requesterId)` in `api/src/services/users.js`,
  chiamata nella stessa transazione dell'INSERT della richiesta; poi, per ogni riga restituita, il push SSE
  e l'email partono senza attesa. Un fallimento dell'INSERT delle notifiche annulla anche la richiesta
  (risposta 500, nessuna richiesta orfana); un fallimento di una email resta loggato e non cambia la risposta.

## 5. Utenti — `api/src/routes/users.js`

- **B-403.** `POST /:id/anonymize` esegue `DELETE FROM rectification_requests`, l'`UPDATE users` e
  `revokeTwoStepState(id, { db: client })` in una sola transazione su un client del pool (`BEGIN`/`COMMIT`,
  `ROLLBACK` su errore). Per poterlo testare senza DB le tre scritture vivono in una funzione
  `anonymizeUser(db, id)` in `api/src/services/users.js`, che la route chiama col client della transazione.
- **B-406.** In `PATCH /:id` l'`UPDATE` che riceve `err.code === '23505'` sul vincolo dell'email risponde
  `409 { error: 'Email already in use', field: 'email' }`, la stessa risposta del controllo `SELECT` che resta.

## 6. B-407

Il blocco di commento di `GET /api/app-settings/terms` torna immediatamente sopra `router.get('/terms', …)`
in `api/src/routes/app-settings.js`; il commento di `/privacy-contact` resta sopra la sua route.

## 7. Test

Ogni test sotto si osserva rosso prima del fix e verde dopo.

| Voce | Test |
|---|---|
| B-414 | `test-api.js`: cookie di un utente → 401 dopo il suo disable, dopo l'anonymize, dopo `change-password` da un'altra sessione; la sessione che ha cambiato la password → 200 su `/api/auth/me`; un admin declassato → 403 su una route `requireAdmin` col vecchio cookie; un token firmato senza `pwd` → 401. PW-01 usa il cookie riemesso. |
| B-415 | `scripts/compose-api-port.test.js` (vitest): fallisce se il servizio `api` di `docker-compose.yml` ha `ports`. |
| B-401 | `test-api.js`: la sesta richiesta valida nella stessa ora → 429 `RATE_LIMITED` con `retryIn`. |
| B-404 | `test-api.js`: con il richiedente unico admin/sysadmin attivo → 409 `NO_RECIPIENT` e nessuna riga in `rectification_requests`. |
| B-410 | `api/src/routes/auth.js` non contiene più il ciclo di INSERT per admin: `node:test` su una funzione `notifyAdmins(db, …)` con un `db` finto che conta un solo `INSERT INTO notifications`. |
| B-403 | `node:test` su `anonymizeUser` con un `db` finto che fallisce sull'`UPDATE`: la funzione propaga l'errore e la route esegue `ROLLBACK`; un secondo caso verifica `BEGIN … COMMIT` sul percorso riuscito. |
| B-406 | `test-api.js`: due `PATCH` concorrenti che assegnano la stessa email nuova a due utenti diversi, ripetuti più volte → nessuna risposta 500, per ogni coppia una 200 e una 409. |

Il test di B-406 dipende dalla gara: se nel run prima del fix non compare nessun 500, il piano lo annota nelle
Roadmap notes del report invece di dichiararlo osservato rosso.

B-407 è un commento e non ha test.

Si aggiornano `ARCHITECTURE.md` (blocco Compose; descrizione di `requireAuth`/`requireAdmin`/`requireSysAdmin`),
la voce `api/src/middleware/auth.js` di `CLAUDE.md` (niente più "JWT-cached") e `docs/ops/production-checklist.md`
(le voci B-414 e B-415).

## Criteri di accettazione

1. **Sessione revocata** — un cookie aperto riceve 401 alla richiesta successiva dopo disable, anonymize e cambio password da un'altra sessione; la sessione che ha cambiato la password resta valida (`test-api.js`).
2. **Ruolo corrente** — un admin declassato col vecchio cookie riceve 403 su una route admin (`test-api.js`).
3. **Porta 3000 chiusa** — `docker-compose.yml` non pubblica porte per `api` (`scripts/compose-api-port.test.js`).
4. **Rettifica limitata** — la sesta richiesta in un'ora riceve 429 `RATE_LIMITED` (`test-api.js`).
5. **Nessun destinatario** — il richiedente senza altri admin attivi riceve 409 `NO_RECIPIENT`, nessuna richiesta registrata, e `profile.html` mostra l'errore nel drawer.
6. **Notifiche in un INSERT** — il test `node:test` di `notifyAdmins` passa.
7. **Anonymize atomica** — i test `node:test` di `anonymizeUser` passano.
8. **Email duplicata** — PATCH concorrenti sulla stessa email non producono 500 (`test-api.js`).
9. **Commento Terms** — il commento di `GET /terms` sta sopra `router.get('/terms'`.
10. **Suite verdi** — `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- La validazione di input delle altre route (ciclo 2).
- Il due-fattori già consegnato.
- La revoca della sessione quando un admin cambia l'email di un utente.
- Un "log out everywhere" esplicito.
- La chiusura di una connessione SSE già aperta.

## Decisioni aperte

1. **B-414 con il claim `pwd` confrontato con `password_changed_at`, senza migrazione.** Alternativa scartata: B (colonna `session_version`) e C (accettare il residuo). Perché: B costa la stessa lettura dal DB e in più una colonna.
2. **Un token senza `pwd` è rifiutato.** Alternativa scartata: tollerarlo fino alla scadenza. Perché: tollerarlo lascia per otto ore la finestra che il ciclo chiude.
3. **`requireAuth` aggiorna `req.user.role` dal DB.** Alternativa scartata: leggere solo stato e `pwd`. Perché: è la stessa query e il ruolo in cache è lo stesso residuo di B-414.
4. **B-415 togliendo la porta pubblicata.** Alternativa scartata: non fidarsi di `X-Forwarded-For`. Perché: la porta non ha utenti e nginx resta l'unico ingresso.
5. **B-404 con 409 `NO_RECIPIENT`, senza registrare la richiesta.** Alternativa scartata: 201 con `recipients: 0`. Perché: una richiesta che nessuno può leggere non va archiviata.
6. **B-401 a 5 richieste all'ora per utente.** Alternativa scartata: riusare il limite dei codici (10 all'ora). Perché: una rettifica è un evento raro e ciascuna notifica ogni admin.
7. **Le scritture di B-403 e B-410 estratte in `anonymizeUser` e `notifyAdmins` per testarle con `node:test`.** Alternativa scartata: provarle solo via `test-api.js`. Perché: atomicità e numero di INSERT non si osservano dall'HTTP, quindi un test HTTP non diventerebbe rosso prima del fix.
8. **Richiesta e notifiche di B-410 nella stessa transazione.** Alternativa scartata: richiesta registrata anche se le notifiche falliscono. Perché: con un solo INSERT il fallimento è totale, e una richiesta senza notifiche nessun admin la vede.
