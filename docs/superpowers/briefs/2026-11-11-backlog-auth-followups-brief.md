# Brief — backlog, mini-ciclo: follow-up di autenticazione

**Tipo:** audit-fix (Scenario 3). Raggruppamento confermato dall'utente il 2026-11-11.
**Origine:** `docs/BACKLOG.md`, voci B-419, B-423, B-425, B-420, B-421, B-424: follow-up Minor del Gate 3 round 1 di `docs/superpowers/reports/2026-11-11-backlog-c01-auth-profile-hardening-finish-cycle.md`.
**Sequenza concordata:** questo ciclo, poi B-417, poi B-416, poi il ciclo 2 di `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Il ciclo 1 ha spostato su `requireAuth` la lettura di stato, ruolo e `password_changed_at` dal DB, e ha aggiunto il limite e la transazione della richiesta di rettifica. Restano sei residui piccoli negli stessi file (`api/src/middleware/auth.js`, `api/src/routes/auth.js`, `api/src/routes/users.js`) e in due file di test del ciclo.

## Comportamento attuale

- B-419: `requireAuth` usa `.then(ok, next)`. Un'eccezione dentro `ok` diventa una rejection non gestita e la richiesta resta senza risposta.
- B-423: `routes/users.js` ha una `liveRole` privata, duplicato di quella in `middleware/auth.js`. Entrambe rileggono il ruolo che `requireAuth` ha già messo in `req.user.role` nella stessa richiesta.
- B-425: il token riemesso da `change-password` copia `email` dai claim vecchi (`...req.user`), non dalla riga. Dopo un cambio di email da parte di un admin, il nuovo token porta ancora l'indirizzo vecchio. Oggi nessuno legge `req.user.email`.
- B-420: lo slot del limite della rettifica si prende prima del lavoro sul DB e non torna mai indietro. Dopo cinque 500 (o 404) l'utente riceve 429 per fino a un'ora senza che nulla sia registrato.
- B-421: in `scripts/compose-api-port.test.js` il `\s` dentro il template literal diventa una `s` semplice, quindi il pattern è `^  api:s*$`. Uno spazio dopo `api:` fa fallire il test senza motivo.
- B-424: in `test-api.js` il commento sopra `getPlainUser` dice ancora che la suite declassa l'admin di test e che requireAdmin si fida del ruolo nel JWT; POT-20 contiene il refuso `const pj =await`.

## Comportamento atteso

- B-419: ogni errore del ramo di successo di `requireAuth` arriva a `next(err)`, e la richiesta riceve sempre una risposta.
- B-423: per il ruolo corrente dell'attore c'è una sola fonte. Il `/brainstorming` decide fra usare `req.user.role`, già letto dal DB da `requireAuth`, e importare l'unica `liveRole`. Il criterio è che un sysadmin declassato perda il diritto alla richiesta successiva, come oggi.
- B-425: il token riemesso porta l'email della riga del DB.
- B-420: un 500 o un 404 restituisce lo slot; il 409 `NO_RECIPIENT` e il 201 lo tengono, come oggi.
- B-421: il pattern riconosce `  api:` con o senza spazi finali, e solo quello.
- B-424: il commento dice come la suite ottiene oggi l'utente semplice, e il refuso è corretto.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga possono essere slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice. Una voce già risolta si chiude con il comando eseguito in `Verified how`, senza codice.
- Codice con `\` scritto solo con Edit/Write, mai via shell (B-421 è proprio questo caso).
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- `scripts/run-tests.sh` manda posta vera tramite il Gmail di `.env`: una quota esaurita fa fallire TS-26 e PY-13 senza colpa del codice (B-416).
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un test per B-419, B-425 e B-420 fallisce prima del fix e passa dopo.
2. Per B-423 i controlli di ruolo esistenti di `test-api.js` (AD-ED-06, AD-ED-11, SE-04 e i casi sysadmin) restano verdi.
3. Per B-421 il test riconosce un blocco `  api:` con spazi finali (caso fissato in un test) e fallisce ancora se il servizio `api` pubblica `ports`.
4. `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- B-417 (stream SSE aperti dopo la revoca) e B-416 (share/export con SMTP che rifiuta): hanno i loro cicli.
- B-418 e B-422, chiusi come accettati il 2026-11-11.
- Ogni altra modifica a `requireAuth`, alla query per richiesta o al formato del token.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
