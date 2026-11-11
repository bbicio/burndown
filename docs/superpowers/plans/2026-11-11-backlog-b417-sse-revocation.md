# Backlog B-417: stream SSE chiusi alla revoca della sessione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-11-backlog-b417-sse-revocation-design.md`
**Branch:** `backlog-b417-sse-revocation`
**Risk class:** high-risk — autenticazione (la regola di sessione di `requireAuth` e la sua applicazione agli stream già aperti)

**Goal:** uno stream di notifiche aperto si chiude entro un heartbeat quando la sessione che l'ha aperto non è più valida.

**Architecture:** la query di sessione di `requireAuth` diventa `sessionRowError(claims)` in `api/src/middleware/auth.js`; il tick dell'heartbeat di `GET /api/notifications/stream` la chiama e chiude lo stream su errore di sessione. Nessuna migrazione, nessuna route nuova, nessun file frontend.

**Tech Stack:** Node/Express, `node:test` (`api/`), `test-api.js` via `scripts/run-tests.sh`.

**Indipendenza dei task:** sequenziali. Il Task 2 consuma `sessionRowError` del Task 1; il Task 3 prova il comportamento del Task 2 sullo stack.

## Global Constraints

- Worktree come dice `PROCESS.md` §6.1b: `git worktree add .claude/worktrees/backlog-b417-sse-revocation -b backlog-b417-sse-revocation`, poi `git -C .claude/worktrees/backlog-b417-sse-revocation branch --show-current` deve stampare il nome; copiare `.env` dal checkout principale; `npm ci` nella root e in `api/` una volta, prima del Task 1.
- Intervallo dell'heartbeat: 25000 ms, invariato (Spec, decisione 3).
- Messaggi di sessione invariati: `sessionError` resta l'unica fonte (`'Session expired'`).
- Docker sullo stack principale: mai `docker compose down/up/restart`, mai `-v`. I test d'integrazione girano solo con `bash scripts/run-tests.sh`.
- `js/notifications.js`, `pushToUser`, `createNotification` non cambiano.
- Un difetto nuovo trovato strada facendo va in `docs/BACKLOG.md`, non si corregge qui.
- Codice con `\` scritto solo con Edit/Write, mai via `node -e`/shell.

## Review Focus

1. **Doppia pulizia:** la chiusura per sessione scaduta chiama `res.end()`, che fa scattare `req.on('close')`; la pulizia gira due volte e non deve lanciare né lasciare il timer attivo (Task 2, test "close after end").
2. **Altre connessioni dello stesso utente:** chiudere uno stream non deve togliere dal registro gli altri stream dello stesso utente ancora validi, cioè la sessione con il cookie riemesso (Task 2, test "only this connection").
3. **Query lenta:** un controllo che dura più di 25 s non deve accumulare query (Task 2, test "pending").
4. **Risultato dopo la chiusura:** un controllo che termina dopo il `close` del client non scrive e non chiama `end()` (Task 2, test "result after close").
5. **Nessun cambio a `requireAuth`:** stessa risposta 401, stesso `req.user`, errore del DB a `next` (Task 1, `auth.test.js` esistente + SE-01..SE-07).

---

### Task 1: `sessionRowError` in `api/src/middleware/auth.js`

**Files:**
- Modify: `api/src/middleware/auth.js` (`requireAuth`, nuova funzione esportata)
- Test: `api/src/middleware/auth.test.js`

**Interfaces:**
- Produces: `sessionRowError(claims) → Promise<{ error: string|null, row: object|undefined }>` — esegue la query di oggi (`status`, `role`, `pwd` in millisecondi, `WHERE id = claims.id`) e restituisce `{ error: sessionError(claims, rows[0]), row: rows[0] }`; un errore del DB rigetta la promessa. Esportata accanto a `requireAuth`.

- [ ] **Step 1: Write the failing test** in `auth.test.js`:
  - `sessionRowError resolves the session error of the row`: `answer` restituisce `{ status: 'disabled', role: 'user', pwd: null }` → `{ error: 'Session expired' }`; poi `{ status: 'active', role: 'admin', pwd: null }` con claims `{ id: 'u', pwd: null }` → `error === null` e `row.role === 'admin'`.
  - `sessionRowError rejects when the query fails`: `answer` lancia `down` → `assert.rejects(..., down)`.
- [ ] **Step 2:** `cd api && node --test src/middleware/auth.test.js` → FAIL (`sessionRowError is not a function`).
- [ ] **Step 3:** implementa `sessionRowError` e fai usare a `requireAuth` `sessionRowError(claims).then(({ error, row }) => …)` al posto della query inline; la catena resta `.then(ok).catch(next)`. Il commento sopra `requireAuth` resta; una riga sopra `sessionRowError` dice che la usano `requireAuth` e lo stream delle notifiche.
- [ ] **Step 4:** `cd api && node --test src/middleware/auth.test.js` → PASS (anche i tre test esistenti). `grep -n "sessionError(" api/src/middleware/auth.js` → una sola riga, dentro `sessionRowError`.
- [ ] **Step 5: Commit** `refactor(auth): one session lookup, sessionRowError, shared by requireAuth`.

### Task 2: ricontrollo all'heartbeat in `GET /api/notifications/stream`

**Files:**
- Modify: `api/src/routes/notifications.js` (handler di `/stream`)
- Create: `api/src/routes/notifications.test.js`

**Interfaces:**
- Consumes: `sessionRowError(claims)` dal Task 1, importata da `../middleware/auth`.

- [ ] **Step 1: Write the failing tests** in `notifications.test.js`, con lo stesso schema di `auth.test.js`: `JWT_SECRET` impostato e `client.query = (...a) => answer(...a)` prima del `require('./notifications')`; l'handler è l'ultimo elemento di `router.stack.find(l => l.route?.path === '/stream').route.stack`; `req` è un `EventEmitter` con `user = { id: 'u', email: 'e', role: 'user', pwd: null }`; `res` ha `setHeader`, `flushHeaders`, `write` (accumula in un array), `end` (conta le chiamate ed emette `close` su `req`, come il socket reale); `mock.timers.enable({ apis: ['setInterval'] })`, `mock.timers.tick(25000)`, poi `await` di un `setImmediate` per lasciare risolvere la query. La presenza nel registro si legge con `pushToUser('u', { x: 1 })`: scrive su `res` solo se la connessione è registrata.
  - `a disabled row ends the stream`: riga `disabled` → `end` chiamato una volta, nessun `': heartbeat\n\n'` scritto, `pushToUser` non scrive più.
  - `a changed password ends the stream`: riga `active` con `pwd: '1700000000000'` e claim `pwd: null` → `end` chiamato.
  - `an active row keeps the stream`: riga `active`, `pwd: null` → `': heartbeat\n\n'` scritto, `end` non chiamato, `pushToUser` scrive.
  - `a failed check keeps the stream`: `answer` lancia → heartbeat scritto, `end` non chiamato (silenziare `console.warn` con `mock.method`).
  - `pending`: `answer` restituisce una promessa mai risolta; due `tick(25000)` → una sola chiamata a `answer`.
  - `result after close`: `answer` restituisce una promessa risolta a mano; `tick`, poi `req.emit('close')`, poi risolvi con una riga `disabled` → nessun `write` dopo il `close`, `end` non chiamato.
  - `close after end`: dopo il caso disabled, un altro `tick(25000)` → nessuna nuova chiamata ad `answer`, nessuna eccezione.
  - `only this connection`: due stream dello stesso utente; il primo tick risponde `disabled` per il primo e `active` per il secondo (`answer` in sequenza) → il primo chiude, `pushToUser` scrive ancora sul secondo.
- [ ] **Step 2:** `cd api && node --test src/routes/notifications.test.js` → FAIL nei casi di chiusura (`end` mai chiamato) e in `pending`.
- [ ] **Step 3:** nell'handler, una funzione locale `drop()` idempotente (ferma il timer, toglie `res` dal Set, cancella la chiave se vuota) usata sia da `req.on('close')` sia dalla chiusura; un flag `closed` impostato da `drop`; un flag `checking`. Il tick segue la Spec §2.2 punti 1-6, con `console.warn('[sse] session check failed:', err.message)` sull'errore. Commento di una riga sopra il tick: la sessione si ricontrolla a ogni heartbeat, la revoca chiude lo stream entro un intervallo.
- [ ] **Step 4:** `cd api && npm test` → PASS, tutti i file `node:test` di `api/`.
- [ ] **Step 5: Commit** `fix(notifications): an open SSE stream ends when its session is revoked (B-417)`.

### Task 3: `test-api.js` SSE-01..SSE-03

**Files:**
- Modify: `test-api.js` (nuova `testSseRevocation()` dopo `testSessionRevocation()`, chiamata in `main()` subito dopo `await testSessionRevocation();`)

**Interfaces:**
- Consumes: `makeTsUser`, `loginWithCode`, `TS_PASS`, `extractCookie`, `api`, `sysadminCookie`, `http`, `BASE` già in `test-api.js`.

- [ ] **Step 1:** scrivi un helper `openStream(cookie)` con `http.get(\`${BASE}/api/notifications/stream\`, { headers: { Cookie: cookie } })` che restituisce `{ status: Promise<number>, ended: Promise<void>, heartbeat: Promise<void>, close() }` (`ended` su `'end'` della risposta, `heartbeat` al primo chunk che contiene `': heartbeat'`, `close` distrugge la richiesta). E `within(p, ms)` → `true` se `p` si risolve entro `ms`.
- [ ] **Step 2:** `testSseRevocation()` (sezione `'SSE revocation'`):
  1. tre utenti con `makeTsUser('ssa'|'ssb'|'ssd')`, sessioni con `loginWithCode(email, TS_PASS)`; per `ssd` due sessioni (`d1`, `d2`);
  2. apri gli stream di `a`, `b`, `d2`;
  3. `DELETE /api/users/<a.id>` come sysadmin; `POST /api/auth/change-password` con la sessione `d1`;
  4. apri uno stream con il cookie riemesso del cambio password (`extractCookie(cp.headers)`);
  5. aspetta insieme, ciascuno con `within(…, 40000)`: `a.ended`, `d2.ended`, `b.heartbeat`;
  6. asserzioni:
     - `SSE-01 a disabled user's open stream ends within a heartbeat`;
     - `SSE-02 an active user's stream stays open and gets a heartbeat` (heartbeat arrivato e `b.ended` non risolto);
     - `SSE-03 change-password ends the other session's stream`;
     - `SSE-03 a stream opened with the reissued cookie → 200`;
  7. chiudi gli stream rimasti aperti con `close()`.
- [ ] **Step 3:** rosso senza il fix: nel worktree `git checkout HEAD~1 -- api/src/routes/notifications.js` (HEAD è il commit del Task 2), `bash scripts/run-tests.sh` → SSE-01 e SSE-03 "ends the other session's stream" FAIL, SSE-02 PASS; poi `git checkout HEAD -- api/src/routes/notifications.js` e `git status` mostra solo `test-api.js` modificato.
- [ ] **Step 4:** `bash scripts/run-tests.sh` → SSE-01..SSE-03 PASS, nessun altro caso rosso.
- [ ] **Step 5: Commit** `test(api): SSE-01..SSE-03, open streams end on session revocation`.

## Decisioni aperte

1. **Task 3 aspetta il primo heartbeat reale con un tetto di 40 s per stream, in parallelo.** Alternativa scartata: un `setTimeout` fisso di 26 s. Perché: si chiude appena i tre eventi arrivano e il tetto copre il ritardo del primo tick rispetto all'apertura.
2. **La presenza nel registro si prova con `pushToUser` nel test unitario.** Alternativa scartata: esportare `sseClients`. Perché: il test non allarga l'interfaccia del modulo.
