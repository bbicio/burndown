# Link di condivisione con il default di `APP_URL` e `userId` validati (B-499, B-500) — design spec

**Date:** 2026-11-16
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-16-backlog-b499-b500-brief.md`
**Scenario:** 3 (audit-fix), righe B-499 e B-500 di `docs/BACKLOG.md`

I link dell'email e della notifica di condivisione usano lo stesso `APP_URL` (e lo stesso default) del resto delle email; un `userId` non UUID nelle route di condivisione e di invio notifica risponde 400 prima di qualunque query.

## 1. Fatti verificati

- `api/src/routes/cost-grids.js:1023` e `:1035` costruiscono `${process.env.APP_URL}/pipeline.html` senza default; `:1141` e `:1149` usano `APP_URL` importato da `services/email` (`:10`), che vale `process.env.APP_URL || 'http://localhost'` (`api/src/services/email.js:21`).
- `docker-compose.yml:39` imposta `APP_URL: ${APP_URL:-http://localhost}`, quindi gli stack di sviluppo, di branch e di `run-tests.sh` hanno sempre la variabile: il caso "assente" si prova solo con un test unitario.
- `userId` arriva a PostgreSQL senza `isUuid` in `POST /api/cost-grids/:id/shares` (`cost-grids.js:989-997`), `POST /api/projects/:id/shares` (`projects.js:675-681`), `POST /api/notifications` (`notifications.js:139-152`, solo se presente), `DELETE /api/cost-grids/:id/shares/:userId` (`cost-grids.js:1043-1063`) e `DELETE /api/projects/:id/shares/:userId` (`projects.js:727`).
- La forma esistente per un campo non UUID è `400 { error: '<campo> must be a valid UUID' }` (`api/src/routes/pots.js:98`); `isUuid` è in `api/src/lib/input-rules.js`.
- SEC-20/SEC-21 di `test-api.js:807-813` ottengono il 500 generico proprio dallo share con `userId: 'not-a-uuid'`.
- Un admin passa `canEdit`/`canAccess` di `cost-grids.js` senza query (`:89-90`), quindi `GET /api/cost-grids/not-a-uuid/shares` con l'admin arriva alla `SELECT … WHERE rs.resource_id = $1` con un testo non UUID.

## 2. Link (B-499)

`services/email.js` esporta `appLink(path)` → `` `${APP_URL}${path}` ``. In `cost-grids.js` i quattro punti di §1 usano `appLink('/pipeline.html')`; nessun punto del file legge più `process.env.APP_URL`.

## 3. Validazione (B-500)

Nelle cinque route di §1 un `userId` (corpo o path) per cui `isUuid` è falso risponde `400 { error: 'userId must be a valid UUID' }`. Il controllo sta dopo quello di permesso (`canEdit`) e prima di ogni query che usa `userId`; in `POST /api/notifications` vale solo quando `userId` è presente (assente resta il broadcast). Un UUID valido conserva la risposta di oggi.

## 4. Test

- `node:test` di `appLink`: con `APP_URL` cancellata prima del `require`, `appLink('/pipeline.html') === 'http://localhost/pipeline.html'` (stile di `api/src/services/email-notification-link.test.js`).
- `test-api.js`: un 400 per ciascuna delle cinque route con `userId: 'not-a-uuid'`; per lo share di cost grid, un UUID valido inesistente → 404 come oggi.
- SEC-20/SEC-21 passano a `GET /api/cost-grids/not-a-uuid/shares` con l'admin (500 generico, nessun testo di PostgreSQL), con un commento che il trigger dipende dal `:id` non validato.

## 5. BACKLOG

B-499 e B-500 `closed` con il comando di verifica; una riga nuova per gli `:id` non UUID delle route di condivisione (500), con la nota che SEC-20 ne dipende.

## 6. Stack principale

Al Gate 4, `docker compose restart api` (deroga di `CLAUDE.md`). Niente rebuild, niente migrazioni.

## Criteri di accettazione

1. **Link** — il test di `appLink` è verde; `grep -n "process.env.APP_URL" api/src/routes/cost-grids.js` → nessun risultato.
2. **400** — le cinque route rispondono `400 { error: 'userId must be a valid UUID' }` a un `userId` non UUID; lo share di cost grid con un UUID valido inesistente risponde 404 (`test-api.js`).
3. **500 generico ancora coperto** — SEC-20/SEC-21 verdi sul nuovo trigger.
4. **BACKLOG** — B-499 e B-500 chiusi con il comando di verifica; la riga degli `:id` aggiunta.
5. **Test** — `npm test` e `scripts/run-tests.sh` verdi.
6. **Security review** — `/security-review` sul branch prima di `/finish-cycle`, senza finding nuovi, o con quelli trovati proposti come Brief a sé.

## Decisioni aperte

1. **Tutte e cinque le route, non solo le due della riga B-500.** Alternativa scartata: solo `POST /api/cost-grids/:id/shares` e `POST /api/notifications`. Perché: le altre tre sono lo stesso difetto nello stesso tipo di route; scelta dell'utente.
2. **Il `:userId` di path delle due `DELETE` risponde 400 come il corpo.** Alternativa scartata: 404 come alcuni `:id` di path (`cost-grids.js:364`). Perché: stesso campo, stesso messaggio; scelta dell'utente.
3. **SEC-20 passa a un altro percorso non validato (`:id` di `GET /api/cost-grids/:id/shares`).** Alternative scartate: solo test unitari di `errorHandler`; una route di prova attiva con una variabile d'ambiente. Perché: resta una verifica end-to-end dell'handler montato senza codice di prova in produzione; scelta dell'utente.
4. **Gli `:id` non UUID restano fuori, con una riga di BACKLOG.** Alternativa scartata: validarli nelle route di condivisione in questo ciclo. Perché: la validazione generale degli `:id` è un ciclo a sé; scelta dell'utente.
5. **`appLink(path)` in `services/email.js`, usato anche dai due punti che già leggevano `APP_URL`.** Alternativa scartata: sostituire solo `process.env.APP_URL` con `APP_URL` nei due punti rotti. Perché: un solo punto costruisce il link ed è quello che il test prova.
