# Backlog, mini-ciclo: follow-up di autenticazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-11-backlog-auth-followups-design.md`
**Branch:** `backlog-auth-followups`
**Risk class:** high-risk — autenticazione e permessi (`api/src/middleware/auth.js`, `api/src/routes/auth.js`, `api/src/routes/users.js`)

**Goal:** chiudere B-419, B-423, B-425, B-420, B-421, B-424 senza cambiare contratti API.

**Architecture:** correzioni locali nei file del ciclo 1; due nuovi file `node:test` (`api/src/middleware/auth.test.js`, `api/src/routes/auth.test.js`) con il DB finto; un caso nuovo in `test-api.js` (SE-07). Nessuna migrazione, nessuna route nuova, nessun file frontend.

**Tech Stack:** Node/Express, `node:test`, vitest, `test-api.js` via `scripts/run-tests.sh`.

**Indipendenza dei task:** Task 2 e Task 4 toccano entrambi `api/src/routes/auth.js` in route diverse; Task 1 apre SE-07, Task 3 lo chiude.

## Global Constraints

- Testo per l'utente in inglese; nessun messaggio nuovo.
- Docker sullo stack principale: mai `docker compose down/up/restart`, mai `-v`. I test d'integrazione girano solo con `bash scripts/run-tests.sh`.
- Worktree come dice `PROCESS.md` §6.1b (`git worktree add .claude/worktrees/backlog-auth-followups -b backlog-auth-followups`, poi verificare il branch); copiare `.env` dal checkout principale; `npm ci` nella root e in `api/` una volta, prima del Task 1.
- Durante i task si lanciano solo i test toccati (`cd api && node --test src/<file>`, `npx vitest run <file>`); `scripts/run-tests.sh` solo al Task 1 (rosso). Il verde d'integrazione è quello del Gate 1 di `/finish-cycle`.
- `scripts/run-tests.sh` manda posta vera: con la quota Gmail esaurita TS-26 e PY-13 falliscono senza colpa del codice (B-416).
- Un difetto nuovo trovato strada facendo va in `docs/BACKLOG.md`, non si corregge qui.
- Codice con `\` scritto solo con Edit/Write, mai via `node -e`/shell.

## Review Focus

1. **`.catch(next)` dopo `.then(ok)`:** `next` non deve poter essere chiamato due volte per la stessa richiesta (un errore di un handler a valle è già gestito da Express dentro `next()`) (Task 2).
2. **Il rimborso dello slot** usa la `window` del proprio `hit`, e non scatta né sul 201 né sul 409 `NO_RECIPIENT` (Task 4, secondo caso del test).
3. **Il token riemesso** prende `id` e `role` dalla richiesta, `email` e `password_changed_at` dalla riga: nessun altro claim (`iat`, `exp`) deve passare da `req.user` a `sessionClaims` (Task 3).
4. **`liveRole` importata** in `users.js` è la stessa funzione delle regole di progetto: `credential-revocation-guard.test.js` e i casi sysadmin di `test-api.js` restano verdi (Task 5).

---

### Task 1: SE-07, osservato rosso

**Files:**
- Modify: `test-api.js` (`testSessionRevocation()`)

**Interfaces:**
- Consumes: `makeTsUser`, `loginWithCode`, `api`, `extractCookie`, `TS_PASS`, `sysadminCookie`.
- Produces: l'etichetta SE-07 chiusa dal Task 3.

- [ ] **Step 1: scrivere il caso.** In fondo a `testSessionRevocation()`: utente da `makeTsUser('seg')`, sessione da `loginWithCode`; `PATCH /api/users/:id { email: <nuova> }` (sysadmin); `POST /api/auth/change-password` con la sessione aperta (`TS_PASS` → `TS_PASS + 'x'`); il payload del cookie riemesso (`extractCookie(cp.headers)`, parte centrale del JWT, `Buffer.from(…, 'base64url')`) → `ok(cp.status === 200 && payload.email === nuova, 'SE-07 …')`.
- [ ] **Step 2: eseguire la suite.** Run: `bash scripts/run-tests.sh`. Expected: rosso solo SE-07 (payload con l'email vecchia); tutti gli altri verdi, salvo TS-26/PY-13 se la quota Gmail è esaurita (log dell'API con `550 5.4.5`). Annotare l'elenco esatto dei rossi nel messaggio di commit.
- [ ] **Step 3: commit** — `git commit -m "test(api): SE-07 reissued token carries the current email (red)"`

### Task 2: B-419 — `requireAuth` instrada ogni errore

**Files:**
- Create: `api/src/middleware/auth.test.js`
- Modify: `api/src/middleware/auth.js`

- [ ] **Step 1: test.** Prima di ogni `require`: `process.env.JWT_SECRET = 'test-secret'`; `const client = require('../db/client'); client.query = async () => ({ rows: [{ status: 'disabled', role: 'user', pwd: null }] });`. Poi `require('./auth')` e `require('../services/jwt').signToken({ id: 'u', email: 'e', role: 'user', pwd: null })`. Chiamare `requireAuth({ cookies: { pdash_token: token } }, res, next)` con `res.status()` che restituisce `res` e `res.json()` che lancia `new Error('boom')`; attendere (`await new Promise(r => setImmediate(r))`) → `next` chiamato una volta con quell'errore.
- [ ] **Step 2: rosso** — `cd api && node --test src/middleware/auth.test.js` → FAIL (`next` non chiamato).
- [ ] **Step 3: implementare** — `}, next);` diventa `}).catch(next);` (la funzione di successo resta come ora).
- [ ] **Step 4: verde** — stesso comando → PASS.
- [ ] **Step 5: commit** — `git commit -m "fix(auth): requireAuth routes an error of its success branch to next (B-419)"`

### Task 3: B-425 — email della riga nel token riemesso

**Files:**
- Modify: `api/src/routes/auth.js` (`change-password`)

- [ ] **Step 1: implementare** — `RETURNING password_changed_at, email`; `setAuthCookie(res, sessionClaims({ id: req.user.id, role: req.user.role, email: changed.email, password_changed_at: changed.password_changed_at }))`.
- [ ] **Step 2: verifica locale** — `cd api && node -e "require('./src/routes/auth')"` → nessun errore; `node --test src/lib/session.test.js` → PASS. SE-07 si osserva verde al Gate 1.
- [ ] **Step 3: commit** — `git commit -m "fix(auth): the token reissued by change-password carries the current email (B-425)"`

### Task 4: B-420 — lo slot della rettifica torna su un errore

**Files:**
- Create: `api/src/routes/auth.test.js`
- Modify: `api/src/routes/auth.js` (`rectification-request`)

- [ ] **Step 1: test.** Prima del `require('./auth')`: `JWT_SECRET` impostato; `client.query` finto che risponde `{ rows: [{ first_name: 'A', last_name: 'B' }] }`; `client.pool = { connect: async () => fakeClient }`, dove `fakeClient.query` registra il testo, risponde vuoto a `BEGIN`/`ROLLBACK`/`COMMIT`, e su `INSERT INTO rectification_requests` lancia (modalità `fail`) oppure restituisce `{ rows: [{ id: 'r1' }] }` (modalità `none`); su `INSERT INTO notifications` (via `notifyAdmins`) restituisce `{ rows: [] }`; `release()` vuoto. Gestore: `router.stack.find(l => l.route && l.route.path === '/rectification-request').route.stack.at(-1).handle`. `res` finto con `status(code)` che registra e `json()`; `next` che registra l'errore.
  - Caso `fail`, utente `u1`, sei chiamate con `{ message: 'x' }` → sei volte `next(err)`, mai `status(429)`.
  - Caso `none`, utente `u2`, sei chiamate → cinque `status(409)` e poi `status(429)`.
- [ ] **Step 2: rosso** — `cd api && node --test src/routes/auth.test.js` → FAIL sul caso `fail` (la sesta chiamata risponde 429); il caso `none` è verde.
- [ ] **Step 3: implementare** — `slot` dichiarato prima del `try`; nel ramo 404 e nel `catch` esterno, prima di rispondere/`next(err)`: `if (slot && slot.allowed) rectificationLimiter.refund(req.user.id, Date.now(), slot.window);`. Il commento sopra `hit` dice che 201 e 409 tengono lo slot e che un 404 o un 500 lo restituiscono.
- [ ] **Step 4: verde** — stesso comando → PASS; `node --test src/services/users.test.js src/lib/rate-limit.test.js` → PASS.
- [ ] **Step 5: commit** — `git commit -m "fix(auth): a failed rectification request gives its rate-limit slot back (B-420)"`

### Task 5: B-423 — una sola `liveRole`

**Files:**
- Modify: `api/src/routes/users.js`

- [ ] **Step 1: implementare** — cancellare la funzione privata `liveRole` e il suo commento; `const { requireAuth, requireAdmin, liveRole } = require('../middleware/auth');`.
- [ ] **Step 2: verifica** — `grep -rn "async function liveRole" api/src` → una riga (`api/src/middleware/auth.js`); `cd api && node -e "require('./src/routes/users')" && node --test src/lib/credential-revocation-guard.test.js` → PASS. I controlli di ruolo si osservano verdi al Gate 1.
- [ ] **Step 3: commit** — `git commit -m "refactor(users): use the one liveRole of the auth middleware (B-423)"`

### Task 6: B-421 e B-424

**Files:**
- Modify: `scripts/compose-api-port.test.js`, `test-api.js`

- [ ] **Step 1: test (B-421).** Un secondo `it`: `serviceBlock('services:\n  api:  \n    build: ./api\n    ports:\n      - "3000:3000"\n  db:\n    image: x\n', 'api')` → non `null` e `toMatch(/^\s+ports:/m)`.
- [ ] **Step 2: rosso** — `npx vitest run scripts/compose-api-port.test.js` → FAIL sul nuovo caso (`null`).
- [ ] **Step 3: implementare** — `` new RegExp(String.raw`^  ${name}:\s*$`) ``, con l'Edit tool.
- [ ] **Step 4: verde** — stesso comando → PASS (2 test).
- [ ] **Step 5: B-424** — in `test-api.js` riscrivere le quattro righe di commento sopra `getPlainUser` che descrivono il declassamento dell'admin (il commento sotto resta) e correggere `const pj =await` in `const pj = await`. `node --check test-api.js` → nessun errore.
- [ ] **Step 6: commit** — `git commit -m "test: compose port pattern keeps its backslash; stale test-api comment (B-421, B-424)"`

Dopo l'ultimo task: `npm test` e `cd api && npm test` → verdi.

## Decisioni aperte

1. **Nessun `run-tests.sh` verde dentro il Piano: il verde d'integrazione è quello del Gate 1.** Alternativa scartata: un run alla fine dell'ultimo task, come nel ciclo 1. Perché: il Gate 1 lo esegue comunque sullo stesso HEAD e §6.2 limita i run; il rosso di SE-07 al Task 1 resta osservato.
2. **B-425 senza un test proprio oltre a SE-07.** Alternativa scartata: anche un `node:test` sul gestore di `change-password`. Perché: SE-07 copre il caso per intero e un secondo test duplicherebbe la stessa asserzione.
3. **Il gestore della rettifica preso da `router.stack` nel test.** Alternativa scartata: estrarlo in una funzione esportata. Perché: lascia `routes/auth.js` com'è e il test legge il gestore reale; il costo è dipendere dalla forma interna di Express 4, che il progetto non cambia in questo ciclo.

## Execution Handoff

- **Modalità e modello (§6.1):** esecuzione nativa (`superpowers:executing-plans`): sei task piccoli e sequenziali su tre file di produzione. Prima di eseguire si passa a mano a `/model sonnet`; revisione finale e `/finish-cycle` su Opus.
- **Classe di rischio (§6.1b):** high-risk — tocca `requireAuth` e i controlli sul ruolo; `/code-review` dei Gate 2-3 a effort high.
