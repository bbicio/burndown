# Errori 500 generici e cookie `Secure` per default (S-08, S-07) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un errore inatteso dell'API risponde con un messaggio generico (il dettaglio resta nel log) e i cookie di autenticazione sono `Secure` salvo `NODE_ENV=development`.

**Architecture:** Un modulo puro `api/src/lib/error-response.js` decide status e corpo della risposta d'errore e l'handler globale di `api/src/index.js` lo usa. Una funzione `cookieSecure()` in `api/src/services/jwt.js` sostituisce i tre confronti con `'production'`.

**Tech Stack:** Node.js/Express, `node:test`, `test-api.js` via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-11-16-security-c6-hardening-design.md`
**Branch:** `security-c6-hardening`
**Risk class:** high-risk — autenticazione (flag `Secure` dei cookie di sessione, challenge e device)

**Indipendenza dei task:** i task 1 e 2 sono indipendenti tra loro; il task 3 dipende da 1 (verifica il 500 generico); il task 4 viene dopo tutti.

## Global Constraints

- Messaggio generico esatto: `Internal server error`.
- Un 4xx conserva `err.message`; `code` compare solo se `err.code` è una stringa.
- `MulterError` (`err.name === 'MulterError'`) → status 400, `{ error: err.message, code: err.code }`.
- `cookieSecure()` è `process.env.NODE_ENV !== 'development'`, letta a ogni chiamata (non a load time).
- `console.error(err)` nell'handler resta.
- Testo per l'utente in inglese.
- Stack principale: solo `docker compose restart api` al Gate 4 (deroga di `CLAUDE.md`); nessun task tocca lo stack principale.

## Review Focus

1. Un errore con `status` 4xx ma `message` vuoto o assente → il corpo ha comunque `error` stringa (`'Internal server error'` non va usato per un 4xx: si usa `'Request error'`). Test in Task 1.
2. `err.status` stringa (`'400'`) o `NaN` → trattato come non intero → 500 generico. Test in Task 1.
3. `err` non oggetto (`throw 'x'`, `next(null)` non arriva all'handler ma `throw undefined` sì) → 500 generico senza eccezioni nell'handler. Test in Task 1.
4. JSON malformato nel corpo della richiesta (body-parser, 400) → messaggio non generico, status 400. Test in Task 3.
5. `NODE_ENV` con maiuscole o spazi (`'Development'`) → `Secure` vale `true` (fallisce in sicurezza). Test in Task 2.

---

### Task 1: `errorResponse` e handler globale

**Files:**
- Create: `api/src/lib/error-response.js`
- Create: `api/src/lib/error-response.test.js`
- Modify: `api/src/index.js:89-93`

**Interfaces:**
- Produces: `errorResponse(err: unknown) -> { status: number, body: { error: string, code?: string } }`, `module.exports = { errorResponse }`.

- [ ] **Step 1: Cercare chi dipende dal testo di un 500.** Run: `grep -rn "Internal server error\|status === 500\|\.status >= 500" js *.html test-api.js`. Expected: nessuna pagina né test confronta il testo di un 500; se ne trova uno, fermarsi e riportarlo.

- [ ] **Step 2: Scrivere il test che fallisce** in `api/src/lib/error-response.test.js` (`node:test` + `node:assert/strict`, stile di `api/src/lib/auth-tokens.test.js`):
  - `keeps a 4xx message`: `errorResponse(Object.assign(new Error('Bad thing'), { status: 400 }))` → `{ status: 400, body: { error: 'Bad thing' } }`.
  - `keeps a string code on a 4xx`: `{ status: 409, code: 'X_RULE' }` → `body.code === 'X_RULE'`; con `code: 23505` (numero) → `body` senza `code`.
  - `4xx without message`: `Object.assign(new Error(''), { status: 404 })` → `{ status: 404, body: { error: 'Request error' } }`.
  - `multer error`: `new (require('multer').MulterError)('LIMIT_FILE_SIZE')` → `status 400`, `body.error === 'File too large'`, `body.code === 'LIMIT_FILE_SIZE'`.
  - `hides a 500 message`: `new Error('invalid input syntax for type uuid: "x"')` → `{ status: 500, body: { error: 'Internal server error' } }`; `JSON.stringify(body)` non contiene `uuid`.
  - `hides an explicit 5xx`: `{ status: 502, message: 'upstream' }` → 500 generico.
  - `non-integer status`: `status: '400'`, `status: NaN`, `status: 399`, `status: 600` → 500 generico.
  - `non-object error`: `errorResponse('x')`, `errorResponse(undefined)`, `errorResponse(null)` → 500 generico, senza throw.

- [ ] **Step 3: Verificare che fallisca.** Run: `cd api && node --test src/lib/error-response.test.js`. Expected: FAIL, `Cannot find module './error-response'`.

- [ ] **Step 4: Implementare `errorResponse(err)`** in `api/src/lib/error-response.js`: intestazione di una riga come gli altri moduli di `api/src/lib/`; 4xx = `Number.isInteger(err.status) && err.status >= 400 && err.status <= 499`; il controllo Multer viene prima del controllo 4xx.

- [ ] **Step 5: Verificare che passi.** Run: `cd api && node --test src/lib/error-response.test.js`. Expected: PASS.

- [ ] **Step 6: Usarlo nell'handler** di `api/src/index.js`: `console.error(err)` resta; poi `const { status, body } = errorResponse(err); res.status(status).json(body);`. Run: `cd api && node -e "require('./src/lib/error-response')"` → nessun output.

- [ ] **Step 7: Commit**

```bash
git add api/src/lib/error-response.js api/src/lib/error-response.test.js api/src/index.js
git commit -m "fix(api): generic message for unexpected errors, multer errors are 400 (S-08)"
```

### Task 2: `cookieSecure()`

**Files:**
- Modify: `api/src/services/jwt.js:14-29`
- Modify: `api/src/routes/auth.js:7`, `:44`, `:54`
- Create: `api/src/services/jwt.test.js`

**Interfaces:**
- Produces: `cookieSecure() -> boolean`, aggiunta a `module.exports` di `api/src/services/jwt.js`.

- [ ] **Step 1: Scrivere il test che fallisce** in `api/src/services/jwt.test.js`: per ogni caso salva e ripristina `process.env.NODE_ENV` (`delete` quando era assente).
  - `development` → `false`.
  - `production`, `test`, `Development`, ` development` (spazio iniziale), assente → `true`.
  - `setAuthCookie` usa il valore: con un `res` finto `{ cookie(name, value, opts) { this.opts = opts; } }` e `process.env.JWT_SECRET = 'x'` impostato prima del `require`, `NODE_ENV=production` → `res.opts.secure === true`; `development` → `false`.

- [ ] **Step 2: Verificare che fallisca.** Run: `cd api && node --test src/services/jwt.test.js`. Expected: FAIL, `cookieSecure is not a function`.

- [ ] **Step 3: Implementare `cookieSecure()`** in `jwt.js` e usarla in `setAuthCookie`; in `auth.js` importarla nella riga `require('../services/jwt')` esistente e usarla in `setChallengeCookie` e `setDeviceCookie`.

- [ ] **Step 4: Verificare.** Run: `cd api && node --test src/services/jwt.test.js` → PASS; `grep -rn "NODE_ENV === 'production'" api/src` → nessun risultato.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/jwt.js api/src/services/jwt.test.js api/src/routes/auth.js
git commit -m "fix(auth): cookies are Secure unless NODE_ENV=development (S-07)"
```

### Task 3: controlli di integrazione in `test-api.js`

**Files:**
- Modify: `test-api.js` (in coda a `testSecurity()`, riga ~807)

**Interfaces:**
- Consumes: `errorResponse` (Task 1), il cui effetto si osserva via HTTP; helper esistenti `api(method, path, body, cookie)`, `ok(cond, label)`, `adminCookie`, `BASE`.

- [ ] **Step 1: Aggiungere i controlli** dopo il ciclo SEC-10, con un commento di una riga come gli altri:
  - `SEC-20`: `api('POST', '/api/cost-grids/00000000-0000-0000-0000-000000000000/shares', { userId: 'not-a-uuid', permission: 'viewer' }, adminCookie)` → `status === 500` e `data.error === 'Internal server error'`; `SEC-21`: `!/uuid|syntax/i.test(JSON.stringify(data))`. (Per un admin `canEdit` non interroga il DB, quindi l'errore arriva dalla query sugli utenti.)
  - `SEC-22`: `fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })` → `status === 400` e `error` diverso da `'Internal server error'`.

- [ ] **Step 2: Lanciare la suite una volta** (eccezione di §6.2: il prodotto del task è un controllo di `test-api.js`). Prima copiare `.env` dal checkout principale se manca. Run: `bash scripts/run-tests.sh`. Expected: unit test backend verdi, SEC-20/21/22 `✓`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add test-api.js
git commit -m "test(api): generic 500 on a database error, 400 kept for malformed JSON (S-08)"
```

### Task 4: BACKLOG e security review

**Files:**
- Modify: `docs/BACKLOG.md` (due righe dopo B-498)

- [ ] **Step 1: Aggiungere B-499 e B-500** nel formato delle righe esistenti (origine `security-c6-hardening` spec §6, stato `open`, colonna di verifica con comando ed esito datati 2026-11-16):
  - B-499: `api/src/routes/cost-grids.js` costruisce il link dell'email e della notifica di condivisione con `process.env.APP_URL` senza default; con la variabile assente il link è `undefined/pipeline.html`. Usare l'`APP_URL` di `services/email.js`. Verifica: `grep -n "process.env.APP_URL}/pipeline" api/src/routes/cost-grids.js` → due righe.
  - B-500: `userId` non validato in `POST /api/cost-grids/:id/shares` e `POST /api/notifications` → 500 invece di 400. Verifica: SEC-20 di `test-api.js`.

- [ ] **Step 2: Commit**

```bash
git add docs/BACKLOG.md
git commit -m "docs(backlog): B-499 APP_URL default in share links, B-500 userId validation"
```

- [ ] **Step 3: `/security-review` sul branch** (lo esegue la sessione, non un subagent, e `/finish-cycle` non lo fa da sé). Expected: nessun finding nuovo; un finding nuovo si riporta all'utente come proposta di Brief a sé, salvo sua diversa decisione, senza correggerlo nel ciclo.

## Criteri di accettazione

Quelli della Spec (`docs/superpowers/specs/2026-11-16-security-c6-hardening-design.md`, `## Criteri di accettazione`); il criterio 1 «il log contiene l'errore originale» si verifica a mano al Gate 2 con `docker logs` dello stack di branch dopo SEC-20.

## Decisioni aperte

1. **`'Request error'` come messaggio di un 4xx senza `message`.** Alternativa scartata: usare `'Internal server error'` anche lì. Perché: un 4xx non è un errore interno e il testo sarebbe falso.
2. **Il test di Multer è unitario (un `MulterError` vero), non un upload di 20 MB in `test-api.js`.** Alternativa scartata: caricare un file oltre il limite. Perché: stesso codice coperto, senza appesantire la suite.
3. **SEC-20 usa un cost grid inesistente con l'admin.** Alternativa scartata: creare un cost grid di prova. Perché: per un admin `canEdit` non legge il DB e l'errore nasce prima della lettura del cost grid, quindi non serve setup né cleanup.
