# Backlog B-417: stream SSE chiusi alla revoca della sessione — design spec

**Date:** 2026-11-11
**Brief started:** 2026-11-11 18:16
**Brief:** nessuno — il ciclo parte da `/brainstorming` sulla riga B-417 di `docs/BACKLOG.md`
**Scenario:** 3 (follow-up di review: `backlog-c01-auth-profile-hardening` Gate 3 round 1 #1, report `docs/superpowers/reports/2026-11-11-backlog-c01-auth-profile-hardening-finish-cycle.md`)

Uno stream di notifiche già aperto non viene chiuso quando la sessione è revocata: un utente disabilitato, anonimizzato o con la password cambiata continua a ricevere notifiche finché il browser non cade. Ciclo solo backend, senza migrazioni.

## 1. Fatti verificati nel codice (a `a657a1f`)

- `GET /api/notifications/stream` (`api/src/routes/notifications.js`) passa da `requireAuth` solo all'apertura; poi registra `res` in `sseClients` (userId → Set) e ogni 25 s scrive `': heartbeat\n\n'`, senza leggere il DB. Su `req.on('close')` ferma il timer e toglie la connessione.
- `requireAuth` (`api/src/middleware/auth.js`) legge `status`, `role` e `password_changed_at` in millisecondi dalla riga dell'utente e la passa a `sessionError` (`api/src/lib/session.js`); `req.user` è `{ ...claims, role }`, quindi porta `pwd`.
- Le revoche: `api/src/routes/auth.js` (accept-invite, reset-password, change-password), `api/src/routes/users.js` (`PATCH /:id` con `status: 'disabled'`, `DELETE /:id`), `api/src/services/users.js` (`anonymizeUser`) e `api/src/create-admin.js`, che gira in un processo separato dal server.
- `js/notifications.js` apre `new EventSource('/api/notifications/stream', { withCredentials: true })` con un `onerror` vuoto: alla chiusura del server il browser si riconnette da sé; una risposta 401 ferma `EventSource` per sempre, una 200 con il cookie riemesso (change-password) riprende lo stream.

## 2. Comportamento atteso

### 2.1 Una sola lettura della sessione

`api/src/middleware/auth.js` espone `sessionRowError(claims)`: esegue la query che oggi sta dentro `requireAuth` e restituisce `{ error, row }`, con `error` il risultato di `sessionError(claims, row)`. `requireAuth` la usa al posto della query inline; il suo comportamento non cambia (401 con lo stesso messaggio, `req.user.role` dalla riga, errore del DB a `next`).

### 2.2 Ricontrollo a ogni heartbeat

Nel tick dei 25 s lo stream:

1. se un controllo precedente è ancora in corso, non ne avvia un altro e non scrive nulla;
2. chiama `sessionRowError(req.user)`;
3. se la connessione si è chiusa nel frattempo, ignora il risultato;
4. con `error` non nullo, ferma il timer, toglie `res` da `sseClients` (cancellando la chiave se il Set resta vuoto) e chiude con `res.end()`;
5. altrimenti scrive l'heartbeat come oggi;
6. se la query fallisce, lascia lo stream aperto, scrive l'heartbeat e logga l'errore con `console.warn`.

La pulizia del punto 4 e quella di `req.on('close')` passano per la stessa funzione, idempotente.

Il browser, alla chiusura, si riconnette: `requireAuth` risponde 401 e `EventSource` si ferma. La sessione che ha cambiato la password si riconnette con il cookie riemesso e riceve 200.

La revoca chiude lo stream entro un intervallo di heartbeat (25 s). `pushToUser` e `createNotification` non cambiano.

## 3. Test

| Voce | Test |
|---|---|
| Ricontrollo | `api/src/routes/notifications.test.js` (`node:test`, nuovo): l'handler di `/stream` preso da `router.stack`, `req`/`res` finti (EventEmitter), `query` di `db/client` sostituita prima del `require`, timer finti di `node:test`. Riga `disabled` → `res.end()` chiamato e `res` non più nel registro; `pwd` diverso dal claim → idem; riga `active` con lo stesso `pwd` → heartbeat scritto, `end` non chiamato; query che rifiuta → heartbeat scritto, `end` non chiamato; un controllo ancora pendente al tick successivo → una sola query; `close` → nessuna query ai tick successivi. Rosso prima del fix nei casi di chiusura. |
| `requireAuth` invariato | `api/src/middleware/auth.test.js` resta verde; i casi `test-api.js` SE-01..SE-07 restano verdi. |
| Integrazione | `test-api.js` SSE-01..SSE-03, aperti insieme e verificati dopo un'unica attesa di al massimo 40 s: SSE-01 lo stream di un utente disabilitato da un admin termina; SSE-02 lo stream di un utente attivo è ancora aperto e ha ricevuto un heartbeat; SSE-03 dopo un change-password lo stream dell'altra sessione termina, e uno stream aperto con il cookie riemesso risponde 200. |

## Criteri di accettazione

1. **Stream chiuso alla disabilitazione** — lo stream aperto di un utente disabilitato termina entro un heartbeat (`test-api.js` SSE-01, `api/src/routes/notifications.test.js`).
2. **Stream chiuso al cambio password** — lo stream di un'altra sessione termina dopo change-password, quello aperto con il cookie riemesso risponde 200 (`test-api.js` SSE-03).
3. **Stream attivo intatto** — lo stream di un utente attivo resta aperto e riceve l'heartbeat (`test-api.js` SSE-02).
4. **Guasto del DB** — una query di controllo che fallisce non chiude lo stream (`api/src/routes/notifications.test.js`).
5. **Una sola regola di sessione** — `grep -n "sessionError(" api/src/middleware/auth.js` trova una sola chiamata, dentro `sessionRowError`.
6. **Suite verdi** — `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- Il logout: il JWT non ha stato lato server e lo stream aperto prima del logout resta aperto come ogni altra richiesta firmata con quel token.
- Il declassamento di ruolo e il cambio email da parte di un admin: non chiudono la sessione.
- B-426 e B-427 (i wrapper di `requireAuth`), B-418 e B-422 (chiusi come accettati).
- Ogni modifica a `js/notifications.js`, a `pushToUser` o all'intervallo dell'heartbeat.

## Decisioni aperte

1. **Ricontrollo della sessione a ogni heartbeat.** Alternativa scartata: chiusura attiva con una `closeUserStreams(userId)` chiamata nei punti di revoca, o un ibrido dei due. Perché: un solo punto copre ogni revoca, anche `create-admin.js` in un altro processo e le revoche future, e riusa `sessionError`; il prezzo è una latenza di 25 s.
2. **Su un errore del DB lo stream resta aperto.** Alternativa scartata: chiuderlo. Perché: la riconnessione prenderebbe 500 e `EventSource` smetterebbe per sempre fino al reload, e lo stream porta solo le notifiche dell'utente stesso.
3. **Intervallo fisso a 25 s anche nei test d'integrazione.** Alternativa scartata: una variabile d'ambiente per accorciarlo in `scripts/run-tests.sh`. Perché: un'attesa unica nella suite costa meno di una configurazione che esiste solo per i test.
