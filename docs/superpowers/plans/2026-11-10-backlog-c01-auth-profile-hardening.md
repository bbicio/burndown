# Backlog, ciclo 1: hardening di autenticazione e profilo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-10-backlog-c01-auth-profile-hardening-design.md`
**Branch:** `backlog-c01-auth-profile-hardening`
**Risk class:** high-risk — autenticazione e permessi (`api/src/middleware/auth.js`, `routes/auth.js`, `routes/users.js`)

**Goal:** sessione revocata su disable/anonymize/cambio password, API non pubblicata sull'host, rettifica limitata e onesta, scritture atomiche di anonymize e notifiche, 409 pulito sull'email duplicata.

**Architecture:** regole pure in `api/src/lib/session.js`; transazione in `api/src/db/transaction.js`; scritture in `api/src/services/users.js`; route in `routes/auth.js` e `routes/users.js`. Nessuna migrazione, nessuna route nuova, nessun file frontend (vedi Task 4, B-404).

**Tech Stack:** Node/Express, PostgreSQL 16, `node:test`, vitest, `test-api.js` via `scripts/run-tests.sh`.

**Indipendenza dei task:** i task **non** sono indipendenti: tutti toccano `test-api.js` o `routes/auth.js`, e Task 6 chiude la suite che Task 1 apre.

## Global Constraints

- Testo per l'utente in inglese. Messaggi fissati dalla Spec: `Session expired`, `There is no other admin to send this request to.` (`code: 'NO_RECIPIENT'`), `Email already in use` (`field: 'email'`).
- Claim JWT: `{ id, email, role, pwd }`, `pwd` = `password_changed_at` in ms interi oppure `null`.
- Limite della rettifica: `createLimiter({ windowMs: 60 * 60 * 1000, max: 5 })`, chiave `req.user.id`.
- Docker sullo stack principale: mai `docker compose down/up/restart`, mai `-v`. I test d'integrazione girano solo con `bash scripts/run-tests.sh`.
- Copiare `.env` dal checkout principale nel worktree ed eseguire `npm ci` (root) e `npm ci` in `api/` una volta, prima del Task 1.
- Durante i task si lanciano solo i test toccati (`cd api && node --test src/<file>`, `npx vitest run <file>`); `scripts/run-tests.sh` solo dove il Piano lo dice (Task 1 rosso, Task 6 verde).
- Un difetto nuovo trovato strada facendo va in `docs/BACKLOG.md`, non si corregge qui.
- Codice con `\` scritto solo con Edit/Write, mai via `node -e`/shell.

## Review Focus

1. **`pwd` della riga arriva da `pg` come stringa** (`bigint`): il confronto con il claim numerico deve convertirla, altrimenti ogni sessione muore (Task 2, test `sessionError` con `pwd: '1731000000123'`).
2. **Millisecondi del claim vs `floor(epoch*1000)` in SQL:** un disallineamento di 1 ms butta fuori tutti al primo click; SE-03 (il cookie riemesso risponde 200 su `/me`) e ogni login di `test-api.js` lo esercitano (Task 2).
3. **Utente con `password_changed_at` NULL** (seed, `create-admin.js` senza cambio): claim `null` contro riga `null` deve passare (Task 2, test `sessionError`).
4. **Le notifiche della rettifica senza destinatari dopo il limite:** l'ordine è validazione → limite → transazione; un 409 non rimborsa lo slot (Task 4, RR-07).
5. **`credential-revocation-guard.test.js` dopo lo spostamento dell'`UPDATE users` dell'anonymize** in `services/users.js`: quel file deve chiamare `revokeTwoStepState` (Task 3, il guard resta verde).

---

### Task 1: i controlli di `test-api.js`, osservati rossi

**Files:**
- Modify: `test-api.js` (nuova `testSessionRevocation()` chiamata accanto a `testTwoStepRevocation()`; nuovi casi in `testProfile()` e `testUsers()`)

**Interfaces:**
- Consumes: `makeTsUser(tag)`, `loginWithCode(email, password)`, `api()`, `sql()`, `extractCookie()`, `TS_PASS`, `sysadminCookie`.
- Produces: le etichette SE-01..SE-06, RR-06, RR-07, AD-ED-10 usate dai Task 2-4 e 6.

- [ ] **Step 1: scrivere i casi**

`testSessionRevocation()` (ogni utente da `makeTsUser`, sessione da `loginWithCode`; `me = c => api('GET', '/api/auth/me', null, c)`):
- `SE-01` `DELETE /api/users/:id` (sysadmin) → `me(session).status === 401`.
- `SE-01b` `PATCH /api/users/:id { status: 'disabled' }` (sysadmin) → `me(session).status === 401`.
- `SE-02` `POST /api/users/:id/anonymize` (sysadmin) → `me(session).status === 401`.
- `SE-03` due sessioni A e B dello stesso utente; `change-password` da A → `me(B).status === 401` e `me(extractCookie(cp.headers)).status === 200`.
- `SE-04` utente creato con `role = 'admin'` (UPDATE via `sql`), sessione, `PATCH { role: 'user' }` (sysadmin) → `GET /api/users` con la vecchia sessione `=== 403`.
- `SE-05` token HS256 firmato a mano con `crypto.createHmac('sha256', process.env.JWT_SECRET)` su `{ id, email, role, iat, exp }` **senza** `pwd` → `me === 401`; `SE-06` lo stesso token **con** il `pwd` corretto (letto con `sql('SELECT floor(extract(epoch FROM password_changed_at)*1000)::bigint AS pwd …')`, `Number()` o `null`) → `me === 200` (prova che la firma a mano è valida).

In `testProfile()`:
- `RR-06` utente nuovo: cinque richieste valide → `201`, la sesta → `429`, `data.code === 'RATE_LIMITED'`, `data.retryIn > 0`.
- `RR-07` utente nuovo con `role = 'admin'`; via `sql` si mettono `status = 'disabled'` tutti gli altri admin/sysadmin attivi (ids salvati), richiesta → `409`, `data.code === 'NO_RECIPIENT'`, zero righe in `rectification_requests` per quell'utente; in `finally` si rimette `status = 'active'` sugli ids salvati.

In `testUsers()`:
- `AD-ED-10` dieci giri: due utenti da `makeTsUser`, `Promise.all` di due `PATCH { email: <stessa email nuova> }` (sysadmin) → in ogni giro nessun `500`, uno `200` e uno `409` con `field === 'email'`.

- [ ] **Step 2: eseguire la suite e registrare i rossi**

Run: `bash scripts/run-tests.sh`
Expected: rossi SE-01, SE-01b, SE-02, SE-03 (la parte B), SE-04, SE-05, RR-06, RR-07; AD-ED-10 rosso o verde secondo la gara (Spec §7: se verde, annotarlo nel ledger SDD per le Roadmap notes). Tutti gli altri casi verdi. Salvare l'elenco esatto dei rossi nel messaggio di commit.

- [ ] **Step 3: commit**

```bash
git add test-api.js
git commit -m "test(api): session revocation, rectification limits, duplicate email race (red)"
```

---

### Task 2: B-414 — sessione legata allo stato dell'account

**Files:**
- Create: `api/src/lib/session.js`, `api/src/lib/session.test.js`
- Modify: `api/src/middleware/auth.js`, `api/src/routes/auth.js` (`login`, `two-step/verify`, `change-password`), `api/src/routes/users.js` (commento di `liveRole`), `test-api.js` (PW-01)

**Interfaces:**
- Produces: `sessionClaims(user) → { id, email, role, pwd }` (`user.password_changed_at`: `Date | null`); `sessionError(claims, row) → string | null` (`row`: `{ status, role, pwd }` o `undefined`, `pwd` stringa o `null`).

- [ ] **Step 1: test di `session.js`**

- `sessionClaims({ id: 'u', email: 'e', role: 'user', password_changed_at: new Date(1731000000123) })` → `{ id: 'u', email: 'e', role: 'user', pwd: 1731000000123 }`; con `password_changed_at: null` → `pwd: null`.
- `sessionError({ pwd: 1731000000123 }, { status: 'active', role: 'user', pwd: '1731000000123' })` → `null`.
- `sessionError({ pwd: null }, { status: 'active', pwd: null })` → `null`.
- `'Session expired'` per: riga `undefined`; `status: 'disabled'`; claim senza `pwd`; `pwd` diverso; claim `null` con riga `'1731000000123'`; claim numerico con riga `null`.

- [ ] **Step 2: rosso** — `cd api && node --test src/lib/session.test.js` → FAIL (modulo mancante).

- [ ] **Step 3: implementare** `session.js`; poi `requireAuth`: firma verificata → la query della Spec §2 → `sessionError` → `401 { error: 'Session expired' }` oppure `req.user.role = row.role` e `next()`; errore di query → `next(err)`. `requireSysAdmin` = `requireAuth` + `req.user.role === 'sysadmin'`, senza query propria; commenti di `auth.js` e di `liveRole` in `users.js` riscritti per dire che il ruolo viene dal DB a ogni richiesta. `login` e `two-step/verify` firmano `sessionClaims(user)`. `change-password` aggiunge `RETURNING password_changed_at` e chiama `setAuthCookie(res, sessionClaims({ ...req.user, password_changed_at }))`.

- [ ] **Step 4: PW-01** — `adminCookie` prende il cookie di `w1`, poi quello di `w2` (`extractCookie(...)`), così i casi successivi usano la sessione valida.

- [ ] **Step 5: verde** — `cd api && node --test src/lib/session.test.js src/lib/credential-revocation-guard.test.js` → PASS.

- [ ] **Step 6: commit** — `git commit -m "fix(auth): end open sessions on disable, anonymize and password change (B-414)"`

---

### Task 3: B-403 e B-406 — anonymize atomica, email duplicata

**Files:**
- Create: `api/src/db/transaction.js`, `api/src/db/transaction.test.js`, `api/src/services/users.js`, `api/src/services/users.test.js`
- Modify: `api/src/routes/users.js`

**Interfaces:**
- Produces: `withTransaction(pool, fn) → Promise<fn result>` (`BEGIN`, `fn(client)`, `COMMIT`; `ROLLBACK` e rilancio su errore; `release()` sempre); `anonymizeUser(db, id) → { id, status }` (DELETE `rectification_requests`, `UPDATE users` della route attuale, `revokeTwoStepState(id, { db })`, in quest'ordine).

- [ ] **Step 1: test** con `db`/`pool` finti che registrano le query:
  - `withTransaction`: percorso riuscito → `['BEGIN', …, 'COMMIT']`, `release` chiamato; `fn` che lancia → `['BEGIN', 'ROLLBACK']`, errore rilanciato, `release` chiamato.
  - `anonymizeUser`: ordine `DELETE FROM rectification_requests` → `UPDATE users` → `DELETE FROM login_challenges` → `DELETE FROM trusted_devices`; con `UPDATE` che lancia → rigetta e nessuna `DELETE FROM login_challenges` registrata.
- [ ] **Step 2: rosso** — `cd api && node --test src/db/transaction.test.js src/services/users.test.js` → FAIL.
- [ ] **Step 3: implementare**; la route anonymize chiama `withTransaction(pool, c => anonymizeUser(c, req.params.id))` (`pool` da `../db/client`). In `PATCH /:id` l'`UPDATE` in `try/catch`: `err.code === '23505' && err.constraint === 'users_email_key'` → `409 { error: 'Email already in use', field: 'email' }`, altrimenti rilancio.
- [ ] **Step 4: verde** — stesso comando + `src/lib/credential-revocation-guard.test.js` → PASS.
- [ ] **Step 5: commit** — `git commit -m "fix(users): atomic anonymize, 409 on a concurrent duplicate email (B-403, B-406)"`

---

### Task 4: B-401, B-404, B-410 — richiesta di rettifica

**Files:**
- Modify: `api/src/services/users.js`, `api/src/services/users.test.js`, `api/src/routes/auth.js`

**Interfaces:**
- Consumes: `withTransaction` (Task 3), `rateLimited`, `createLimiter`.
- Produces: `notifyAdmins(db, requestId, title, body, requesterId) → rows` (campi della notifica + `email`, `first_name`), un solo statement:

```sql
WITH a AS (SELECT id, email, first_name FROM users
           WHERE status = 'active' AND role IN ('admin','sysadmin') AND id <> $4),
     n AS (INSERT INTO notifications (user_id, type, title, body, url, url_label, rectification_request_id)
           SELECT a.id, 'info', $2, $3, '/admin.html', 'Open User Admin', $1 FROM a
           RETURNING id, user_id, type, title, body, url, url_label, read_at, created_at)
SELECT n.*, a.email, a.first_name FROM n JOIN a ON a.id = n.user_id
```

- [ ] **Step 1: test** — `notifyAdmins` con `db` finto: una sola chiamata a `db.query`, testo che contiene `INSERT INTO notifications`, parametri `[requestId, title, body, requesterId]`, restituisce le righe del finto.
- [ ] **Step 2: rosso** — `cd api && node --test src/services/users.test.js` → FAIL sul nuovo caso.
- [ ] **Step 3: implementare** la route: validazione → `rectificationLimiter.hit(req.user.id)` (non permesso → `rateLimited`) → `me` → `withTransaction`: INSERT della richiesta, `notifyAdmins`; zero righe → lancia un errore con `code = 'NO_RECIPIENT'` (rollback) → la route risponde `409` col testo della Spec. Dopo il commit, per ogni riga `pushToUser` (senza email/first_name nel payload) e `sendAdminNotificationEmail(...).catch(log)`. Il commento "a failed delivery to one admin is logged" si riscrive sul nuovo comportamento. `profile.html` non cambia: il `catch` di `sendRequest` mostra già `e.data.error` nel drawer.
- [ ] **Step 4: verde** — `cd api && node --test src/services/users.test.js` → PASS.
- [ ] **Step 5: commit** — `git commit -m "fix(auth): rectification request limit, no-recipient 409, one notifications insert (B-401, B-404, B-410)"`

---

### Task 5: B-415 — porta dell'API non pubblicata

**Files:**
- Modify: `docker-compose.yml` (servizio `api`: via `ports`)
- Create: `scripts/compose-api-port.test.js`

- [ ] **Step 1: test** — legge `docker-compose.yml`, isola il blocco dalla riga `/^  api:\s*$/` alla riga successiva che inizia con due spazi e un carattere non spazio; `expect(block).not.toMatch(/^\s+ports:/m)`.
- [ ] **Step 2: rosso** — `npx vitest run scripts/compose-api-port.test.js` → FAIL.
- [ ] **Step 3: togliere `ports: - "3000:3000"`**; `scripts/test-branch.sh` non cambia (il suo `!override` aggiunge la porta di branch).
- [ ] **Step 4: verde** — stesso comando → PASS; `bash scripts/test-branch.sh` non serve: `run-tests.sh` del Task 6 usa la rete interna.
- [ ] **Step 5: commit** — `git commit -m "fix(compose): do not publish the API port on the host (B-415)"`

---

### Task 6: B-407, documenti, suite verde

**Files:**
- Modify: `api/src/routes/app-settings.js`, `ARCHITECTURE.md` (blocco Compose; paragrafo dei middleware), `CLAUDE.md` (voce `api/src/middleware/auth.js`), `docs/ops/production-checklist.md` (voci B-414, B-415)

- [ ] **Step 1: B-407** — il blocco `// GET /api/app-settings/terms …` (tre righe) spostato immediatamente sopra `router.get('/terms', requireAuth, …)`.
- [ ] **Step 2: documenti** — `requireAuth` rilegge stato, ruolo e `password_changed_at` dal DB a ogni richiesta; `requireAdmin` non è più "JWT-cached"; `requireSysAdmin` non ha query propria; la porta 3000 non è pubblicata. Nella checklist le due voci diventano verificate dal codice, con il test che le pinna. `CLAUDE.md` resta sotto il tetto di `scripts/claude-md-guard.test.js`.
- [ ] **Step 3: guard** — `npx vitest run scripts/claude-md-guard.test.js scripts/architecture-guard.test.js scripts/doc-paths-guard.test.js` → PASS.
- [ ] **Step 4: suite d'integrazione** — `bash scripts/run-tests.sh` → tutti verdi, compresi i rossi del Task 1 e i test `node:test` di `api/`.
- [ ] **Step 5: commit** — `git commit -m "docs: session revocation and closed API port; terms comment back above its route (B-407)"`

Dopo il merge, passo manuale dell'utente (non del Piano, non della deroga del Gate 4): `docker compose up -d api` sullo stack principale per togliere la porta pubblicata.

## Decisioni aperte

1. **I controlli di `test-api.js` si scrivono tutti nel Task 1 e si osservano rossi con un solo `run-tests.sh`, poi verdi con un solo run al Task 6.** Alternativa scartata: un `run-tests.sh` rosso e uno verde per ogni task. Perché: §6.2 limita i run per task, e il criterio 1 del brief vuole comunque il rosso osservato.
2. **`withTransaction(pool, fn)` in `api/src/db/transaction.js`** come unico punto di `BEGIN/COMMIT/ROLLBACK` dei due fix. Alternativa scartata: `BEGIN` inline nelle route, come fanno `projects.js` e `cost-grids.js`. Perché: rende testabile con `node:test` il `ROLLBACK` che la Spec §7 chiede di provare.
3. **Il 409 di B-404 nasce dentro la transazione** (zero righe da `notifyAdmins` → rollback). Alternativa scartata: un `SELECT count` prima della transazione. Perché: un solo statement decide destinatari e notifiche, senza una seconda lettura che può divergere.
4. **Il 409 `NO_RECIPIENT` non rimborsa lo slot del limite.** Alternativa scartata: rimborsarlo. Perché: ripetere la richiesta non cambia l'esito, e il limite resta un solo `hit` senza rimborsi.
5. **B-406 riconosciuto da `err.constraint === 'users_email_key'`** (`001_initial.sql`). Alternativa scartata: ogni `23505` dell'UPDATE. Perché: l'UPDATE di `users` ha un solo vincolo unico oggi, ma un vincolo futuro non deve diventare "Email already in use".
6. **Nessuna modifica a `profile.html`.** Alternativa scartata: un testo dedicato per `NO_RECIPIENT`. Perché: il drawer mostra già `e.data.error`, e la Spec fissa quel testo.
