# Backlog, mini-ciclo: follow-up di autenticazione — design spec

**Date:** 2026-11-11
**Brief started:** 2026-11-11 09:40
**Brief:** `docs/superpowers/briefs/2026-11-11-backlog-auth-followups-brief.md`
**Scenario:** 3 (audit → fix)

Sei residui del ciclo 1 (`docs/superpowers/reports/2026-11-11-backlog-c01-auth-profile-hardening-finish-cycle.md`) vengono chiusi senza cambiare contratti API: B-419, B-423, B-425, B-420, B-421, B-424.

## 1. Fatti verificati nel codice (a `d522b00`)

- `requireAuth` (`api/src/middleware/auth.js`) chiude la catena della query con `}, next);`, cioè `.then(ok, next)`.
- `liveRole` è definita due volte: in `api/src/middleware/auth.js` (esportata, usata da `routes/cost-grids.js` e `routes/projects.js`) e in `api/src/routes/users.js` (privata, usata da `PATCH /:id`, `POST /:id/anonymize`, `DELETE /:id`). Il corpo è lo stesso.
- `change-password` (`api/src/routes/auth.js`) fa `UPDATE … RETURNING password_changed_at` e firma `sessionClaims({ ...req.user, password_changed_at })`: `email` viene dai claim del token.
- `POST /api/auth/rectification-request` prende lo slot con `rectificationLimiter.hit(req.user.id)` dopo la validazione e non chiama mai `refund`. Il ramo 404 dopo la lettura di `me` non è più raggiungibile (`requireAuth` garantisce la riga), l'errore realistico è un 500 dal DB.
- `scripts/compose-api-port.test.js` costruisce `` new RegExp(`^  ${name}:\s*$`) ``: nel template literal `\s` diventa `s`.
- `test-api.js`: il commento sopra `getPlainUser` descrive ancora il declassamento dell'admin di test; POT-20 contiene `const pj =await`.

## 2. B-419 — `requireAuth` instrada ogni errore

`.then(ok, next)` diventa `.then(ok).catch(next)`. Un'eccezione dentro `ok` (per esempio `res.json` che lancia) arriva a `next(err)` e la richiesta riceve la risposta di errore di Express.

## 3. B-423 — una sola `liveRole`

`api/src/routes/users.js` cancella la propria `liveRole` e importa quella di `api/src/middleware/auth.js`. Le tre chiamate restano dove sono: il ruolo dell'attore è ancora riletto subito prima della scrittura che protegge. Nessun cambio di comportamento.

## 4. B-425 — il token riemesso porta l'email della riga

`change-password` fa `RETURNING password_changed_at, email` e firma `sessionClaims({ id: req.user.id, role: req.user.role, email: changed.email, password_changed_at: changed.password_changed_at })`.

## 5. B-420 — lo slot torna indietro su un errore

Nel gestore di `POST /api/auth/rectification-request`, se dopo aver preso lo slot la richiesta finisce nel ramo 404 o nel `catch` esterno (500), lo slot si restituisce con `rectificationLimiter.refund(req.user.id, Date.now(), slot.window)`, come nel login. Il 201 e il 409 `NO_RECIPIENT` lo tengono. Un `catch` che rimborsa solo se lo slot era stato preso (`slot && slot.allowed`).

## 6. B-421 — il pattern del servizio

Il pattern si scrive con `String.raw` (o `\\s`) con l'Edit tool. `serviceBlock` riconosce `  api:` seguito solo da spazi.

## 7. B-424 — igiene di `test-api.js`

Il commento sopra `getPlainUser` dice che l'utente semplice è un account usa e getta con ruolo `user`; il refuso diventa `const pj = await`.

## 8. Test

| Voce | Test |
|---|---|
| B-419 | `api/src/middleware/auth.test.js` (`node:test`): con `JWT_SECRET` impostato e `query` di `db/client` sostituita prima del `require`, `requireAuth` con un token valido, una riga `disabled` e `res.json` che lancia → `next` riceve l'errore. Rosso prima del fix. |
| B-420 | `api/src/routes/auth.test.js` (`node:test`): il gestore di `/rectification-request` preso da `router.stack`, chiamato con `req.user` impostato e `query`/`pool` finti. Sei richieste con l'`INSERT` che fallisce → sei 500, nessun 429 (rosso prima del fix). Sei richieste con zero admin → cinque 409 e poi un 429 (fissa il comportamento che resta). |
| B-425 | `test-api.js` SE-07: un admin cambia l'email di un utente, l'utente cambia la password con la sessione aperta, il payload del cookie riemesso ha l'email nuova. Rosso prima del fix. |
| B-423 | I controlli di ruolo esistenti di `test-api.js` (AD-ED-06, AD-ED-11, SE-04, i casi sysadmin) restano verdi. |
| B-421 | `scripts/compose-api-port.test.js`: `serviceBlock` su un YAML inline con `  api:  ` e `ports:` → blocco trovato, contiene `ports`. Rosso prima del fix. |
| B-424 | Nessun test: commento e spaziatura. |

## Criteri di accettazione

1. **Errore instradato** — `requireAuth` passa a `next` un'eccezione del ramo di successo (`api/src/middleware/auth.test.js`).
2. **Una sola liveRole** — `grep -rn "async function liveRole" api/src` trova una sola definizione, e i controlli di ruolo di `test-api.js` restano verdi.
3. **Email nel token riemesso** — dopo un cambio di email il token di `change-password` porta l'email nuova (`test-api.js` SE-07).
4. **Slot restituito** — sei errori 500 della rettifica non portano a un 429; il 409 tiene ancora lo slot (`api/src/routes/auth.test.js`).
5. **Pattern del servizio** — `scripts/compose-api-port.test.js` riconosce `  api:` con spazi finali e fallisce ancora se `api` pubblica `ports`.
6. **Igiene** — il commento sopra `getPlainUser` descrive l'utente usa e getta e il refuso `=await` non c'è più.
7. **Suite verdi** — `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- B-417 (stream SSE aperti dopo la revoca) e B-416 (share/export con SMTP che rifiuta): hanno i loro cicli.
- B-418 e B-422, chiusi come accettati il 2026-11-11.
- Le chiamate a `liveRole` di `routes/cost-grids.js` e `routes/projects.js`; ogni altra modifica a `requireAuth`, alla query per richiesta o al formato del token.

## Decisioni aperte

1. **B-423 con l'import dell'unica `liveRole`, riletta prima della scrittura.** Alternativa scartata: `req.user.role` in `users.js`, oppure togliere `liveRole` ovunque. Perché: è l'unica delle tre che non cambia comportamento in un'area high-risk, e la voce è una pulizia.
2. **B-420 rimborsa anche sul ramo 404.** Alternativa scartata: rimborsare solo nel `catch`. Perché: il 404 è un esito senza registrazione come il 500, e la regola "lo slot resta solo a chi è stato giudicato" è più semplice da leggere.
3. **B-419 e B-420 provati con `node:test` sul middleware e sul gestore preso dal router, con il DB finto.** Alternativa scartata: provarli con `test-api.js`. Perché: un'eccezione dentro `ok` e un errore del DB non si provocano dall'HTTP sullo stack di test.
4. **B-425 provato con `test-api.js`.** Alternativa scartata: un `node:test` sul gestore di `change-password`. Perché: il caso nasce dal cambio di email di un admin e dal cookie riemesso, che la suite d'integrazione esercita per intero.
