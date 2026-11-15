# Token di invito/reset hashati e `forgot-password` limitato (S-03, S-04) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nel DB restano solo le impronte sha256 dei token di invito e di reset, `forgot-password` è limitato e non ruota un reset appena emesso, e nessun input non stringa su `forgot-password`, `activate`, `reset-password` produce un 500.

**Architecture:** La migrazione `036` sostituisce `invite_token`/`reset_token` con `invite_token_hash`/`reset_token_hash` (copiando l'impronta dei token pendenti); `auth.js` scrive e cerca `T.hashToken(tok)`; un modulo puro `api/src/lib/auth-tokens.js` porta `isStr`, la normalizzazione dell'indirizzo e il calcolo dell'età del reset; due `createLimiter` (IP, indirizzo) aprono `forgot-password`.

**Tech Stack:** Node/Express, PostgreSQL 16 (`sha256` nativo), `node:test` (backend), vitest (guard sulla documentazione), `test-api.js` + Mailpit (integrazione).

**Spec:** `docs/superpowers/specs/2026-11-15-security-c3-auth-tokens-design.md`
**Branch:** `security-c3-auth-tokens`
**Risk class:** high-risk — migrazione DB e autenticazione (§6.1b)

**Indipendenza dei task:** i task non sono indipendenti (il 3 usa il modulo del 1 e le colonne del 2, il 4 usa le route del 3): esecuzione nativa (§6.1). Il worktree si crea come da §6.1b (`git worktree add .claude/worktrees/security-c3-auth-tokens -b security-c3-auth-tokens`), poi si copia `.env` dal checkout principale e si esegue `npm ci` in radice e in `api/`.

## Global Constraints

- Impronta: `T.hashToken(token)` di `api/src/lib/two-step.js` (sha256 hex, 64 caratteri); in SQL `encode(sha256(convert_to(<token>, 'UTF8')), 'hex')`. Nessun token in chiaro nel DB dopo il ciclo.
- Colonne nuove: `users.invite_token_hash` e `users.reset_token_hash`, `VARCHAR(64)`. `invite_expires` e `reset_expires` non cambiano. Le colonne `invite_token` e `reset_token` spariscono.
- `forgot-password`, ordine fisso: (1) `email` non stringa o vuota → 200; (2) slot IP (`req.ip`) 20 per ora; (3) slot indirizzo (`trim().toLowerCase()`) 5 per ora, preso **prima** della query sul DB; (4) oltre una soglia → 200 senza mail né cambio di token; (5) reset emesso da meno di 2 minuti (`reset_expires` meno 2 h) → 200 senza mail né cambio di token; (6) altrimenti nuovo token, scrittura dell'impronta, mail. Ogni uscita risponde `200 { ok: true }`, mai 429.
- Input non stringa: `400` su `activate` e `reset-password` (`token`, `password`, `passwordConfirm`); `200 { ok: true }` su `forgot-password`.
- Testo rivolto all'utente in inglese. Nessuna operazione `docker compose` sullo stack principale. La migrazione si applica sullo stack principale solo al Gate 4 di `/finish-cycle`, dopo `scripts/backup-db.sh` e con la conferma esplicita dell'utente, mai con `-v`.
- `?v=N`: nessun `js/*.js`, `js/lib/*.js` o `css/*.css` versionato viene toccato da questo piano.
- `scripts/test-branch.sh up` non applica le nuove migrazioni da sé: la `036` si applica a mano anche sullo stack di branch.

## Review Focus

1. Un token con caratteri o lunghezza anomali (2000 caratteri) in `GET /invite/:token` e `GET /reset-password/:token` risponde `410`, mai 500 (Task 4).
2. `forgot-password` con l'indirizzo in maiuscolo e con spazi (`"  USER@X.COM "`) trova l'utente e la mail parte all'indirizzo normalizzato; la chiave del limiter e la ricerca concordano (Task 4).
3. «Resend invite» scrive la nuova impronta: il vecchio link risponde `410` e il nuovo funziona (Task 4).
4. Rieseguire la migrazione non hasha due volte e non risuscita un token scaduto (Task 2).
5. Il limite per IP (20/ora) non è esercitato end to end: richiederebbe 21 richieste e consumerebbe il budget della suite. Lo coprono `rate-limit.test.js` e la revisione; il budget della suite è dichiarato nel Task 4.

---

### Task 1: Modulo puro `auth-tokens`

**Files:**
- Create: `api/src/lib/auth-tokens.js`
- Test: `api/src/lib/auth-tokens.test.js`

**Interfaces:**
- Produces:
  - `RESET_TTL_MS: number` (2 h), `RESET_COOLDOWN_MS: number` (2 min)
  - `isStr(v: unknown): boolean` — `typeof v === 'string'`
  - `emailKey(v: string): string` — `v.trim().toLowerCase()`
  - `resetIssuedRecently(resetExpires: Date | string | null, now?: number): boolean` — `false` se `resetExpires` è null; altrimenti `now - (new Date(resetExpires).getTime() - RESET_TTL_MS) < RESET_COOLDOWN_MS`

- [ ] **Step 1: Write the failing tests** in `auth-tokens.test.js` (`node:test`, come `rate-limit.test.js`):
  - `isStr`: `true` per `''` e `'a'`; `false` per `{}`, `[]`, `1`, `null`, `undefined`, `{length: 99}`.
  - `emailKey('  USER@X.COM ')` → `'user@x.com'`.
  - `resetIssuedRecently(null, NOW)` → `false`.
  - Con `NOW` fissato e `expires = new Date(NOW + RESET_TTL_MS - 60000)` (emesso 1 minuto fa) → `true`; con `expires = new Date(NOW + RESET_TTL_MS - RESET_COOLDOWN_MS)` (emesso esattamente 2 minuti fa) → `false`; con `expires = new Date(NOW + 1000)` (emesso quasi 2 h fa) → `false`; accetta anche una stringa ISO.
- [ ] **Step 2: Run to verify it fails**

Run: `cd api && node --test src/lib/auth-tokens.test.js`
Expected: FAIL (`Cannot find module './auth-tokens'`)

- [ ] **Step 3: Implement** `api/src/lib/auth-tokens.js` con le firme sopra, `module.exports = { RESET_TTL_MS, RESET_COOLDOWN_MS, isStr, emailKey, resetIssuedRecently }`, in stile CommonJS come `rate-limit.js`.
- [ ] **Step 4: Run to verify it passes**

Run: `cd api && node --test src/lib/auth-tokens.test.js`
Expected: PASS, tutti i test verdi
- [ ] **Step 5: Commit**

```bash
git add api/src/lib/auth-tokens.js api/src/lib/auth-tokens.test.js
git commit -m "feat(api): pure helpers for auth token input and reset cooldown (S-03, S-04)"
```

---

### Task 2: Migrazione `036` e `ARCHITECTURE.md`

**Files:**
- Create: `api/src/db/migrations/036_token_hashes.sql`
- Modify: `handbook/restricted/ARCHITECTURE.md:130`, `:194`, `:304`, `:306`
- Test: `scripts/architecture-guard.test.js` (esistente, non si modifica)

**Interfaces:**
- Produces: colonne `users.invite_token_hash VARCHAR(64)` e `users.reset_token_hash VARCHAR(64)`; `invite_token` e `reset_token` rimosse.

- [ ] **Step 1: Write `036_token_hashes.sql`** nello stile di `034_two_step_email.sql` (commento di testa, `BEGIN;`…`COMMIT;`, rieseguibile). Il comportamento, per ciascuna delle due coppie (invito, reset):
  - `ALTER TABLE users ADD COLUMN IF NOT EXISTS <x>_token_hash VARCHAR(64);` fuori da ogni condizione.
  - In un blocco `DO $$ … $$`: se `information_schema.columns` mostra ancora `users.<x>_token`, allora `UPDATE users SET <x>_token_hash = encode(sha256(convert_to(<x>_token, 'UTF8')), 'hex') WHERE <x>_token IS NOT NULL;` seguito da `ALTER TABLE users DROP COLUMN <x>_token;`. Se la colonna non c'è più, il blocco non fa nulla.
  - Un token già scaduto resta scaduto (le colonne `*_expires` non si toccano).
- [ ] **Step 2: Verify on a throwaway Postgres** (mai lo stack principale; il container ha nome proprio e si rimuove alla fine):

```bash
docker run --rm -d --name pdash-mig036 -e POSTGRES_PASSWORD=x postgres:16
# attendere che risponda: docker exec pdash-mig036 pg_isready -U postgres
docker exec pdash-mig036 psql -U postgres -c "CREATE TABLE users (id serial PRIMARY KEY, invite_token varchar(255), invite_expires timestamptz, reset_token varchar(255), reset_expires timestamptz); INSERT INTO users (invite_token, invite_expires, reset_token, reset_expires) VALUES ('tok-a', now() + interval '1 hour', 'tok-b', now() - interval '1 hour'), (NULL, NULL, NULL, NULL);"
MSYS_NO_PATHCONV=1 docker exec -i pdash-mig036 psql -U postgres -v ON_ERROR_STOP=1 < api/src/db/migrations/036_token_hashes.sql
docker exec pdash-mig036 psql -U postgres -c "SELECT id, invite_token_hash, reset_token_hash, reset_expires < now() AS reset_expired FROM users ORDER BY id;"
MSYS_NO_PATHCONV=1 docker exec -i pdash-mig036 psql -U postgres -v ON_ERROR_STOP=1 < api/src/db/migrations/036_token_hashes.sql
docker exec pdash-mig036 psql -U postgres -c "SELECT id, invite_token_hash, reset_token_hash FROM users ORDER BY id;" -c "\d users"
node -e "const h=t=>require('crypto').createHash('sha256').update(t).digest('hex');console.log(h('tok-a'));console.log(h('tok-b'))"
docker stop pdash-mig036
```

Expected: dopo la prima esecuzione la riga 1 ha `invite_token_hash` e `reset_token_hash` uguali ai due hash stampati da `node`, `reset_expired = t`, la riga 2 ha i campi NULL; la seconda esecuzione termina senza errori e le impronte sono identiche; `\d users` non mostra più `invite_token` né `reset_token`.
- [ ] **Step 3: Update `ARCHITECTURE.md`**: i due diagrammi (`:130`, `:194`) parlano di `invite_token_hash` / `reset_token_hash` (l'impronta del token, non il token); la tabella a `:304`/`:306` ha le colonne `invite_token_hash VARCHAR(64)` e `reset_token_hash VARCHAR(64)` con il commento `-- migration 036`.
- [ ] **Step 4: Run the guard**

Run: `npx vitest run scripts/architecture-guard.test.js`
Expected: PASS. Se fallisce per una colonna o un nome citato, correggere `ARCHITECTURE.md` (il codice è la verità) finché passa.
- [ ] **Step 5: Commit**

```bash
git add api/src/db/migrations/036_token_hashes.sql handbook/restricted/ARCHITECTURE.md
git commit -m "feat(db): 036 store invite and reset token hashes, not tokens (S-03)"
```

---

### Task 3: Route e servizi usano le impronte

**Files:**
- Modify: `api/src/routes/auth.js:106-116` (costanti), `:408-413`, `:441-445`, `:460-463`, `:478-488`, `:525-527`, `:542-552`
- Modify: `api/src/routes/users.js:143-144`
- Modify: `api/src/services/users.js:15-17`
- Modify: `api/src/create-admin.js:71`
- Modify: `test-api.js:487`, `:2261-2277`

**Interfaces:**
- Consumes: `T.hashToken(token: string): string` (`api/src/lib/two-step.js`, già importato come `T` in `auth.js`); `RESET_TTL_MS`, `isStr` da `api/src/lib/auth-tokens.js` (Task 1); colonne del Task 2.
- Produces: tutte le scritture e le ricerche usano `invite_token_hash`/`reset_token_hash` con `T.hashToken(...)`; nessun token in chiaro nel DB. `activate` e `reset-password` rispondono `400` a `token`, `password` o `passwordConfirm` non stringa (`{ error: 'token and password required' }`).

- [ ] **Step 1: Adapt the tests first** (devono fallire contro il codice vecchio, ma il loro esito si osserva al Task 4):
  - `TS-21` (`test-api.js:487`): scrive `reset_token_hash = <sha256 del token di prova>` (calcolato in `test-api.js` con `crypto.createHash('sha256')`) e chiama `reset-password` con il token in chiaro.
  - `AD-ED-12` (`:2261-2269`): inserisce la riga pendente con `invite_token_hash` e legge `invite_token_hash`/`invite_expires`; le asserzioni restano `=== null`.
  - `AD-ED-14` (`:2273-2277`): scrive e legge `reset_token_hash`.
  - Nessuna asserzione rimossa; i messaggi restano uguali.
- [ ] **Step 2: Rename and hash in `auth.js`**:
  - `token2h()` usa `RESET_TTL_MS`.
  - Invito (`POST /invite`, `POST /:id/resend-invite`): `invite_token_hash` riceve `T.hashToken(tok)`; la mail riceve `tok`.
  - `GET /invite/:token`, `POST /activate`, `GET /reset-password/:token`, `POST /reset-password`: cercano per `T.hashToken(...)` sulla colonna `*_token_hash`; `activate` e `reset-password` azzerano `invite_token_hash`/`reset_token_hash` al successo.
  - `activate` e `reset-password`: prima di tutto, se `token`, `password` o `passwordConfirm` non sono stringhe (`isStr`) → `400 { error: 'token and password required' }`; poi la logica esistente.
- [ ] **Step 3: Rename the columns elsewhere**: `users.js:143-144` (`reset_token_hash = NULL`, `invite_token_hash = NULL`), `services/users.js:15-17`, `create-admin.js:71`. Il commento di `users.js:140-141` resta valido.
- [ ] **Step 4: Verify the syntax and the unit tests**

Run: `node --check api/src/routes/auth.js && node --check api/src/routes/users.js && node --check api/src/services/users.js && node --check api/src/create-admin.js && node --check test-api.js && cd api && node --test src/lib/auth-tokens.test.js src/lib/two-step.test.js`
Expected: nessun errore di sintassi; test verdi. L'esito dei controlli di `test-api.js` si osserva al Task 4 (un solo `run-tests.sh`, §6.2).
- [ ] **Step 5: Commit**

```bash
git add api/src/routes/auth.js api/src/routes/users.js api/src/services/users.js api/src/create-admin.js test-api.js
git commit -m "fix(auth): store invite and reset token hashes, refuse non-string input (S-03)"
```

---

### Task 4: `forgot-password` limitato e nuovi controlli di integrazione

**Files:**
- Modify: `api/src/routes/auth.js:23-30` (limiter), `:494-520` (handler)
- Modify: `test-api.js` (nuova `testAuthTokens()` dopo `testMailFailures()`, chiamata accanto a `:5356`)

**Interfaces:**
- Consumes: `isStr`, `emailKey`, `resetIssuedRecently` (Task 1); `createLimiter` già importato in `auth.js`; `T.hashToken`.
- Produces: `forgotIpLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 })` e `forgotEmailLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 5 })` in `auth.js`, accanto agli altri; l'handler di `POST /forgot-password` segue l'ordine delle Global Constraints e cerca l'utente per `emailKey(email)`; la mail va all'indirizzo normalizzato.

- [ ] **Step 1: Write the failing integration checks** in `testAuthTokens()` (`section('Auth tokens (S-03, S-04)')`; se `MAILPIT_URL` manca, `fail(...)` come `testMailFailures`). Helper locali: `mailTo(address)` (cerca in Mailpit con `GET /api/v1/search?query=to:<address>`, poi `GET /api/v1/message/<ID>`, restituisce i messaggi), `tokenOf(message)` (estrae `token=([0-9a-f]{64})` dal testo), `sha(t)` (sha256 hex). All'inizio `DELETE /api/v1/messages`. Indirizzi `__test_at_<tag>_${Date.now()}@pdash.local`, utenti rimossi con `later('DELETE', ...)`.
  - **AT-01** invito: `POST /api/auth/invite` come `adminCookie` → 201; il token della mail non compare nella colonna `invite_token_hash` e `invite_token_hash === sha(token)`; `GET /api/auth/invite/<token>` → 200. «Resend invite» (`POST /api/auth/:id/resend-invite`): il vecchio token → `GET` 410, il nuovo → 200 e `invite_token_hash === sha(nuovo)` (Review Focus 3). `POST /api/auth/activate` con il nuovo → 200, `status = 'active'`, `invite_token_hash IS NULL`.
  - **AT-02** reset: sull'utente attivato da AT-01, `POST /api/auth/forgot-password` con l'indirizzo scritto `"  " + ADDRESS.toUpperCase() + " "` → 200 `{ ok: true }` (Review Focus 2); la mail arriva all'indirizzo minuscolo; `reset_token_hash === sha(token)`; `GET /api/auth/reset-password/<token>` → 200; seconda richiesta subito dopo → 200, ancora una sola mail, `reset_token_hash` invariato (cooldown); `POST /api/auth/reset-password` → 200, `reset_token_hash IS NULL`.
  - **AT-03** raffica: su un secondo utente attivo (stesso procedimento di AT-01) 11 richieste consecutive di `forgot-password` → tutte `200` con corpo `{ ok: true }` identico a quello di AT-02; esattamente una mail, `reset_token_hash` uguale a quello della prima risposta. Su un indirizzo inesistente, 3 richieste → stessa risposta `200 { ok: true }`, nessuna mail. **Budget del limite per IP:** `MAIL-08` 1 + AT-02 2 + AT-03 11 + 3 = 17 richieste con slot IP, sotto 20; chi aggiunge altre chiamate a `forgot-password` nella suite aggiorna questo conto.
  - **AT-04** input non stringa e anomalo: `forgot-password` con `{"email": {}}`, `{"email": []}`, `{"email": 123}` → `200 { ok: true }`; `activate` con `{"token": {}, "password": "Abcdefg1!", "passwordConfirm": "Abcdefg1!"}` e `{"token": [], ...}` → `400`; `activate` e `reset-password` con `{"token": "x", "password": {"length": 99}, "passwordConfirm": {"length": 99}}` → `400`; `GET /api/auth/invite/` e `GET /api/auth/reset-password/` seguiti da `'x'.repeat(2000)` → `410` (Review Focus 1). Mai 500.
- [ ] **Step 2: Run the new checks to verify they fail** contro l'handler vecchio — saltato: il run completo è al Step 4 (§6.2).
- [ ] **Step 3: Implement the handler** di `POST /forgot-password` con l'ordine delle Global Constraints; `emailKey` è la chiave del limiter e il valore della query; le due richieste di `hit` precedono la query sul DB; il fallimento della mail resta silenzioso come oggi; ogni ramo risponde `res.json({ ok: true })`. Il SELECT include `reset_expires`; il ramo del cooldown usa `resetIssuedRecently(rows[0].reset_expires)`.
- [ ] **Step 4: Run the integration suite once**

Run: `scripts/run-tests.sh`
Expected: tutti i controlli verdi, inclusi `AT-01`…`AT-04`, `TS-21`, `TS-28`, `AD-ED-10`, `AD-ED-12`, `AD-ED-14`, `MAIL-05`…`MAIL-08`; i backend unit test del runner verdi.
- [ ] **Step 5: Commit**

```bash
git add api/src/routes/auth.js test-api.js
git commit -m "fix(auth): limit forgot-password and keep the pending reset link (S-04)"
```

---

### Task 5: `/security-review` sul branch

**Files:** nessuna modifica prevista.

- [ ] **Step 1: Run `/security-review`** sul branch `security-c3-auth-tokens`, con i test del Task 4 verdi. Controlla che S-03 e S-04 non si ripresentino e che il ciclo non ne introduca di nuovi.
- [ ] **Step 2: Disposizione.** Un finding nuovo si propone come Brief a sé (guardia dello Scenario 3), salvo diversa decisione dell'utente; un difetto del codice di questo ciclo si corregge nel branch con il test mirato e si riesegue la review. `/finish-cycle` non esegue questo passo da sé.
- [ ] **Step 3: Note per `/sync-docs`** (le scrive la procedura, non questo piano): riga `036` in `docs/db/migrations.md` (rieseguibile, token pendenti migrati); `docs/api/users.md` (colonne `*_token_hash` al posto di `reset_token`/`invite_token`); `docs/api/lib.md` (`auth-tokens.js`).

---

## Decisioni aperte

1. **Il limite per IP non ha un controllo end to end.** Alternativa scartata: un test che invia 21 richieste per colpire il tetto IP. Perché: consumerebbe il budget di 20 slot IP dell'intera suite e renderebbe fragili gli altri controlli che chiamano `forgot-password`; il tetto è coperto da `rate-limit.test.js` e dalla revisione dell'handler.
2. **La ricerca dell'utente usa `emailKey` (trim e minuscolo), non solo il minuscolo di oggi.** Alternativa scartata: normalizzare solo la chiave del limiter e lasciare la query com'è. Perché: chiave e ricerca devono concordare, altrimenti `"  USER@X.COM "` consumerebbe lo slot di un indirizzo che poi non trova.
