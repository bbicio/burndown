# Contratto di salvataggio, ciclo 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre il contratto di salvataggio e provarlo su ruoli e ratecard. Il contratto prevede la versione su ogni entità registrata, il conflitto `409 STALE`, la fotografia in `change_log` nella stessa transazione, l'esito unico lato client e un guard che lo rende obbligatorio.

**Architecture:** Sul server, `api/src/services/versioned-write.js` esegue in una transazione lock, confronto di versione, `write`, incremento della versione e riga di registro. Gli snapshot di ciascun tipo stanno in `api/src/services/saved-entities.js`. Le route di ruoli e ratecard in `config.js` passano tutte di lì.

Sul client, `js/lib/save.js` espone `apiSave()` sopra `apiFetch`. `apiSave` non lancia mai e restituisce uno di cinque esiti. `master-roles` e la ratecard di `master-clients` lo adottano.

Il guard `scripts/save-contract-guard.test.js` pinna i due lati. Ha tre liste: le eccezioni lato client, le eccezioni lato server e `RETIRED`.

**Tech Stack:** Node 24, Express, `pg`, `node:test`; Vue 3 da CDN, vitest 4 + jsdom; PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-11-17-save-c1-foundations-design.md`
**Branch:** `save-c1-foundations`
**Risk class:** high-risk — migrazione DB (`037`), money (tariffe di ruoli e ratecard), file condiviso caricato da più pagine (`js/api.js`)

**Task indipendenti:** no.

- Il Task 2 consuma l'helper del Task 1.
- I Task 4 e 5 consumano le route del Task 2 e `apiSave` del Task 3.
- Il Task 6 pinna lo stato lasciato dai Task 2-5.
- Il Task 7 documenta lo stato finale.

## Global Constraints

- **Codice di conflitto:** `409 { error, code: 'STALE', version }`. `RATECARD_STALE` non compare più da nessuna parte del repo.
- **Versione mancante:** un body senza `version` intero, compreso un array nudo e `version: '3'`, riceve `409 STALE`.
- **Messaggi STALE per tipo, alla lettera:**
  - `This role was changed by someone else since you opened it.`
  - `This rate card was changed by someone else since you opened it.`
- **Messaggi del client, alla lettera:**
  - conflitto su un ruolo: `This role was changed by someone else since you opened it. Reload to see the current values — your edits will be discarded.`
  - esito `unknown`: `The server's answer was lost — the change may have been saved. Reload to check.`
  - ruolo che non esiste più dopo Reload: `This role no longer exists.`
- **Etichetta del pulsante:** `Reload`.
- **Le route migrate restano `requireAdmin`.** `amountError`/`overridesError`/`ratecardEntryError` girano prima di ogni scrittura, come oggi.
- **Utente del registro:** `user_id` viene da `req.user.id`, mai dal body.
- **Righe del registro:**
  - le azioni sono `create`, `update`, `update-entries`, `delete` e `role-deleted`;
  - `entity_type` vale `role` o `ratecard`;
  - una creazione registra la versione 0;
  - un'eliminazione registra la versione salvata + 1, con la fotografia di prima della cancellazione.
- **Testi utente in inglese.**
- **Cache-busting:**
  - `js/lib/save.js` nasce `?v=1`;
  - `js/api.js` passa a `?v=16` in ogni riferimento;
  - `js/pages/master-roles.js` e `js/pages/master-clients.js` passano a `?v=2`;
  - ogni altro file versionato che viene modificato aggiorna ogni suo riferimento.
- **Infrastruttura:**
  - nessun `docker compose` sul main stack durante i task;
  - la migrazione si prova su `scripts/run-tests.sh`, e a mano su `scripts/test-branch.sh` per il Gate 2;
  - l'applicazione al main stack la fa `/finish-cycle` Gate 4, dopo `scripts/backup-db.sh`.

## Review Focus

1. **Codice duplicato di un ruolo.** `409 'Role code already exists'` non porta `code: 'STALE'`, quindi `apiSave` lo restituisce come `error` e non come `conflict`. La pagina non deve offrire Reload. Lo pinnano il Task 2 (test-api `SC-06`) e il Task 3 (caso vitest `409 senza STALE → error`).
2. **Eliminazione di un ruolo mentre si salvano le voci di una ratecard che lo contiene.** Le due transazioni devono prendere i lock nello stesso ordine, prima la ratecard e poi il ruolo, altrimenti si bloccano a vicenda e una delle due fallisce con un errore 500 per deadlock. Lo pinna il Task 2 (passo 3, ordine dei lock; test-api `SC-11`, le due richieste in parallelo).
3. **Pagina vecchia in cache che manda il body di prima.** Un `PATCH /roles/:id` senza `version` riceve 409 `STALE`, non 400 né 200. Lo pinna il Task 2 (`SC-03`).
4. **Utente cancellato dopo aver lasciato righe nel registro.** La FK `change_log.user_id` è `ON DELETE SET NULL`, quindi la cancellazione dell'utente non viene rifiutata. Lo pinna il Task 2 (`SC-12`, lettura di `pg_constraint`).
5. **Risposta 2xx non JSON.** Per esempio la pagina HTML di un proxy. `apiSave` dà `unknown`, non `ok` con `data` nullo. Lo pinna il Task 3.

---

### Task 1: migrazione, registro dei tipi e `versionedWrite`

**Files:**
- Create: `api/src/db/migrations/037_save_contract.sql`
- Create: `api/src/services/saved-entities.js`
- Create: `api/src/services/versioned-write.js`
- Test: `api/src/services/versioned-write.test.js`

**Interfaces:**
- Produces:
  - `versionedWrite(poolOrClient, { type, id, expectedVersion, userId, action, write })` → `Promise<{ entity, version }>`.
  - `class StaleError extends Error { version }` e `class NotFoundError extends Error`.
  - `respondSaveError(res, err)` → `true` quando ha risposto: `StaleError` → `409 { error: entities[type].staleMessage, code: 'STALE', version }`, `NotFoundError` → `404 { error: entities[type].notFoundMessage }`. Altrimenti `false`.
  - `saved-entities.js` esporta `entities = { role: {...}, ratecard: {...} }`, ciascuno con `table`, `staleMessage`, `notFoundMessage` e `snapshot(client, id)`. Esporta anche `ratecardSnapshot(client, id)`, che il Task 2 usa per `GET /ratecards/:id`.
  - `poolOrClient` si distingue così: un oggetto con `connect` e senza `release` è un pool; un client ha `release`.

- [ ] **Step 1: Scrivi la migrazione**

Il testo è esattamente quello della Spec §2. Aggiungi un commento d'intestazione di due righe, nello stile di `035_ratecard_version.sql`.

- [ ] **Step 2: Scrivi i test che falliscono, in `versioned-write.test.js`**

Il client finto registra ogni `query(text, params)` e risponde in base all'SQL:

- `SELECT version … FOR UPDATE` → `{ rows: [{ version: stored }] }`, oppure `[]` per l'id inesistente;
- `UPDATE … SET version = version + 1 … RETURNING version` → `{ rows: [{ version: stored + 1 }] }`;
- `INSERT INTO change_log` → `{ rows: [] }`, oppure lancia quando `failLog` è vero.

Il pool finto ha `connect()`, che restituisce il client. Il client finto ha anche `release()`. Il tipo di test è `{ table: 'roles', snapshot: async () => ({ id: 'r1', label: 'A' }) }`, iniettato con `entities.role = …` o con un parametro di test; scegli la forma più semplice.

Ogni test è un caso di `node:test`:

- `'matching version: writes, bumps, logs, returns'`:
  - `write` viene chiamata una volta;
  - le query contengono `BEGIN`, poi l'`UPDATE … version = version + 1`, poi un `INSERT INTO change_log` con params `['role', 'r1', stored + 1, 'update', 'u1', <snapshot JSON>]`, poi `COMMIT`;
  - il risultato è `{ entity: { id: 'r1', label: 'A' }, version: stored + 1 }`.
- `'stale version: StaleError, no write, no log'`, con `expectedVersion = stored - 1`:
  - viene rigettato con `StaleError`, il cui `version === stored`;
  - `write` non viene chiamata;
  - nessun `INSERT INTO change_log`;
  - `ROLLBACK` presente, `COMMIT` assente.
- `'missing or non-integer version is stale'`: `expectedVersion` uguale a `undefined`, a `'3'` o a `1.5` dà sempre `StaleError`.
- `'log failure rolls the write back'`, con `failLog = true`: rigetta con l'errore del log, `ROLLBACK` presente, `COMMIT` assente.
- `'unknown id: NotFoundError'`.
- `'create logs version 0; created:false logs nothing'`:
  - con `write` che restituisce `'new-id'`: riga di registro con `version` 0 e azione `create`;
  - con `write` che restituisce `{ id: 'x', created: false }`: nessun `INSERT INTO change_log`, e il risultato porta lo snapshot.
- `'delete snapshots before write and logs stored + 1'`: lo snapshot viene chiamato prima di `write`; nessun `UPDATE … version`; il registro riceve la versione `stored + 1`.
- `'a caller client gets no BEGIN/COMMIT'`: passando un client, nessuna query `BEGIN`, `COMMIT` o `ROLLBACK`.
- `'respondSaveError maps Stale to 409 STALE and NotFound to 404'`, con un `res` finto.

- [ ] **Step 3: Esegui e verifica che falliscano**

Run: `cd api && node --test src/services/versioned-write.test.js`
Expected: FAIL (`Cannot find module './versioned-write'`)

- [ ] **Step 4: Implementa `saved-entities.js` e `versioned-write.js`**

- La transazione su un pool passa da `withTransaction` (`api/src/db/transaction.js`).
- Il nome della tabella viene solo da `entities[type].table`, mai dall'input.
- Lo snapshot si serializza con `JSON.stringify` e il parametro si scrive come `$6::jsonb`.
- `ratecardSnapshot` è la query di `GET /ratecards/:id` (`config.js`), spostata così com'è con `client.query` al posto di `query`. Restituisce `null` se non c'è la riga.
- Lo snapshot di `role` è `SELECT id, label, code, team, hourly_rate, rate_overrides, version FROM roles WHERE id = $1`.

- [ ] **Step 5: Esegui e verifica che passino**

Run: `cd api && node --test src/services/versioned-write.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/src/db/migrations/037_save_contract.sql api/src/services/saved-entities.js api/src/services/versioned-write.js api/src/services/versioned-write.test.js
git commit -m "feat(api): versioned write helper, entity registry and change_log migration"
```

---

### Task 2: route di ruoli e ratecard sull'helper, `test-api.js`

**Files:**
- Modify: `api/src/routes/config.js`, sezioni `ROLES` e `RATECARDS`
- Modify: `test-api.js`: `runCleanup`, `makeTestRole`, i PATCH e DELETE di ruoli e ratecard elencati qui sotto, una sezione nuova `testSaveContract`

**Interfaces:**
- Consumes: Task 1, cioè `versionedWrite`, `respondSaveError`, `ratecardSnapshot` ed `entities`.
- Produces, per i Task 4 e 5:
  - `GET /api/roles`: ogni riga ha `version`.
  - `POST /api/roles` → 201 con lo snapshot del ruolo.
  - `PATCH /api/roles/:id`, con `{ …campi, version }` → 200 con lo snapshot. La semantica parziale di oggi resta: un campo assente non cambia. Il pilota manda comunque l'entità intera.
  - `DELETE /api/roles/:id`, con `{ version }` → `{ ok: true }`.
  - `POST /api/ratecards` → 201 con lo snapshot della card, oppure 200 con la card esistente.
  - `PATCH /api/ratecards/:id`, con `{ name, version }` → snapshot.
  - `PATCH /api/ratecards/:id/entries`, con `{ version, entries }` → 200 con lo snapshot completo della card (`id, name, client_id, version, entries[]`).
  - `DELETE /api/ratecards/:id`, con `{ version }` → `{ ok: true }`.

- [ ] **Step 1: Prepara `test-api.js`**

- **Cleanup.** In `runCleanup`, per un `DELETE` su `/api/roles/<id>` o `/api/ratecards/<id>`, leggi prima la versione e mandala nel body: per i ruoli da `GET /api/roles`, cercando la riga per id; per le ratecard da `GET /api/ratecards/<id>`. Implementalo con un helper `versionOf(path)`, che restituisce `null` se la riga non c'è più; in quel caso il `DELETE` parte comunque e il 404 resta accettato.
- **Chiamate esistenti.** Le chiamate a `PATCH`/`DELETE /api/roles/:id` e `PATCH /api/ratecards/:id/entries` che oggi non mandano versione (righe intorno a 1090, 1104, 1360, 1922-1923, 2721, 2727, 2732) passano da un helper `withVersion(path, body)`. L'helper aggiunge `version: await versionOf(path)` al body, e il test resta quello che era.
- **SV-33, SV-35 e SV-49.** I codici attesi diventano `STALE`. SV-49 si aspetta `409` con `code: 'STALE'` sia per `version: '3'` sia per il body senza versione. SV-34 si aspetta `s34.data?.version === 1` e `Array.isArray(s34.data?.entries)`.
- **Sezione nuova.** Aggiungi la sezione `testSaveContract`, chiamata accanto alle altre sezioni di config, con queste verifiche:
  - `SC-01`: `GET /api/roles` → ogni riga ha `version` intero; `GET /api/ratecards/:id` ha `version`.
  - `SC-02`: due `PATCH` dello stesso ruolo nuovo con `version: 0` (label `A`, poi `B`). Il primo dà 200 con `version` 1; il secondo `409`, `code: 'STALE'`, `version` 1; `GET` mostra ancora la label `A`.
  - `SC-03`: `PATCH` senza `version` → `409 STALE`, ruolo invariato.
  - `SC-04`: `sql()` su `change_log` per quel ruolo. Le righe sono `create`/0 e `update`/1, una sola riga `update`; `snapshot.label === 'A'`, `snapshot.version === 1`; `user_id` uguale all'id dell'admin di test, letto da `GET /api/auth/me`.
  - `SC-05`: un `PATCH` con `hourlyRate: -1` → `400 MONEY_RULE`, nessuna riga nuova nel registro.
  - `SC-06`: `PATCH` con il `code` di un altro ruolo → `409`, `data.code !== 'STALE'`.
  - `SC-07`: `PATCH /ratecards/:id/entries` riuscito → la risposta ha `entries` e `version`; il registro ha una riga `update-entries` il cui `snapshot.entries` coincide con la risposta.
  - `SC-08`: `PATCH /ratecards/:id` con `{ name, version }` → 200, riga `update`.
  - `SC-09`: `DELETE` di un ruolo senza `version` → `409 STALE`; con la versione giusta → 200, riga `delete` con la versione salvata + 1 e lo snapshot di prima.
  - `SC-10`: un ruolo con una voce in una ratecard viene eliminato. La versione della card aumenta di 1, il registro ha una riga `role-deleted`, e `snapshot.entries` non contiene il ruolo.
  - `SC-11`: prima un ruolo `X` con una voce in una card. Poi, in parallelo con `Promise.all`, `DELETE /roles/X` e `PATCH /ratecards/:id/entries` con la versione corrente, con voci che contengono `X`. Nessuna delle due risposte è 500. La card finale non contiene `X`, oppure il PATCH ha ricevuto `409 STALE`.
  - `SC-12`: `sql("SELECT confdeltype FROM pg_constraint WHERE conrelid = 'change_log'::regclass AND contype = 'f'")` → `'n'`.
  - `SC-13`: un utente non admin, con lo stesso fixture usato dai test di sicurezza intorno alla riga 799, riceve 403 su `POST`/`PATCH`/`DELETE /api/roles…` e su `POST`/`PATCH`/`DELETE /api/ratecards…`.
  - `SC-14`: un `PATCH` di ruolo con `userId` estraneo nel body → la riga di registro ha comunque l'id dell'admin.

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `scripts/run-tests.sh`, dal worktree e con `.env` copiato.
Expected: FAIL su `SC-*`, su `SV-33/35/49` aggiornati e sulle chiamate con versione.

- [ ] **Step 3: Migra le route di `config.js`**

- `GET /roles` aggiunge `version`. `GET /ratecards/:id` usa `ratecardSnapshot`. `GET /ratecards` ha già `version`.
- Ogni route di scrittura chiama `versionedWrite(pool, { type, id: req.params.id, expectedVersion: req.body?.version, userId: req.user.id, action, write })`. Il `catch` chiama `if (respondSaveError(res, err)) return;` prima delle traduzioni che esistono già: `23505` → `'Role code already exists'`, `23503` → i messaggi di oggi, poi `next(err)`.
- I controlli con 400 dentro `write`, quelli di `task_roles`/`resources` e di "used in cost grids", lanciano un errore con `status = 400`. Il `catch` lo traduce in `res.status(400).json({ error })`.
- Il body ad array nudo di `/entries` non ha `version`, quindi diventa `STALE` da solo, e il ramo dedicato si toglie. La costante locale `STALE` e il controllo `Number.isInteger(req.body.version)` con il suo 400 spariscono.
- **`POST /ratecards`:** il lock sul cliente e la ricerca della card esistente stanno dentro `write`. Se la card esiste, `write` restituisce `{ id, created: false }` e la route risponde 200; altrimenti risponde 201.
- **`DELETE /roles/:id`, con l'ordine dei lock della Review Focus 2:**
  1. dentro `withTransaction(pool, async client => …)`, prima di tutto `SELECT id, version FROM ratecards WHERE id IN (SELECT ratecard_id FROM ratecard_entries WHERE role_id = $1) ORDER BY id FOR UPDATE`;
  2. poi `versionedWrite(client, { type: 'role', action: 'delete', … })`;
  3. poi, per ogni card letta, `versionedWrite(client, { type: 'ratecard', id, expectedVersion: <versione letta>, action: 'role-deleted', write: async () => {} })`, perché il `CASCADE` ha già tolto le voci.

- [ ] **Step 4: Esegui e verifica che passino**

Run: `scripts/run-tests.sh`
Expected: PASS, comprese tutte le `SC-*` e le `SV-*` aggiornate. È l'unico run di `run-tests.sh` nei task (PROCESS.md §6.2).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/config.js test-api.js
git commit -m "feat(api): roles and rate cards write through versionedWrite, STALE replaces RATECARD_STALE"
```

---

### Task 3: `apiFetch` riconosce gli esiti, `js/lib/save.js`

**Files:**
- Modify: `js/api.js`, solo il corpo di `apiFetch`
- Create: `js/lib/save.js`
- Test: `js/lib/save.test.js`
- Modify: ogni `.html` che carica `js/api.js?v=15` → `?v=16`. Trovali con `grep -rln "js/api.js?v=" --include=*.html .`

**Interfaces:**
- Produces:
  - `apiFetch` lancia errori con le proprietà `status` (numero, per ogni risposta HTTP), `data` (JSON o `null`), `nonJson` (`true` quando il corpo non è JSON), `timeout` (`true`) e `network` (`true`).
  - Un 2xx non JSON lancia un errore con `nonJson: true`; non restituisce più `null`.
  - Su un 2xx con corpo vuoto `apiFetch` restituisce `null` come oggi, e `apiSave` lo tratta come `ok`.
  - `apiSave(method, path, body)` → `Promise<{ kind: 'ok'|'conflict'|'rule'|'error'|'unknown', data?, code?, message?, status?, version? }>`, esportato con il ponte `window.apiSave = apiSave`.

- [ ] **Step 1: Scrivi i test che falliscono, in `js/lib/save.test.js`**

Carica `js/api.js` con `new Function`, come in `js/lib/save-overlay-trigger.test.js`, con un `fetch` finto. Esponi `apiFetch` su un `window` finto e importa `apiSave` da `./save.js`. Ogni caso controlla `kind` e i campi:

- 200 `{"id":1}` → `{ kind: 'ok', data: { id: 1 } }`;
- 200 con corpo vuoto → `{ kind: 'ok', data: null }`;
- 409 `{"error":"E","code":"STALE","version":4}` → `{ kind: 'conflict', message: 'E', version: 4 }`;
- 409 `{"error":"Role code already exists"}` → `kind: 'error'`, `status: 409`;
- 400 `{"error":"M","code":"MONEY_RULE"}` → `{ kind: 'rule', code: 'MONEY_RULE', message: 'M' }`;
- 404 `{"error":"Role not found"}` → `{ kind: 'error', status: 404, message: 'Role not found' }`;
- 413 `<html>` → `{ kind: 'error', status: 413, message: 'HTTP 413' }`;
- 401 → `kind: 'error'`, e `window.location.href === '/login.html'`;
- 502 `<html>` → `kind: 'unknown'`, con il messaggio dei Global Constraints;
- 200 `<html>` → `kind: 'unknown'`;
- timeout, cioè `fetch` che rigetta con un `AbortError` → `kind: 'unknown'`;
- `TypeError('Failed to fetch')` → `kind: 'unknown'`;
- `'never rejects'`: per ogni caso sopra, la promise di `apiSave` si risolve.

Altri due test controllano che `apiFetch` mandi il body come JSON e il metodo, e che una `GET` non sia toccata: con 200 JSON restituisce i dati come oggi.

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run js/lib/save.test.js`
Expected: FAIL (`save.js` non esiste)

- [ ] **Step 3: Implementa**

- **`apiFetch`:**
  - `JSON.parse` dentro un `try`;
  - imposta le proprietà dell'interfaccia sugli errori;
  - l'errore di timeout resta `Error('Request timed out')` con `timeout = true`;
  - un errore di `fetch` che non sia un abort riceve `network = true` e viene rilanciato.
- **`apiSave`:** chiama `window.apiFetch(path, { method, body: body == null ? undefined : JSON.stringify(body) })` e mappa l'errore secondo la tabella della Spec §5.2.
- **Ordine dei test di mappatura:**
  1. `timeout`, `network`, oppure `nonJson` con `status >= 500` o con `status < 400` → `unknown`;
  2. `status === 409 && data?.code === 'STALE'` → `conflict`;
  3. `/_RULE$/.test(data?.code)` → `rule`;
  4. tutto il resto → `error`, con `message` uguale a `err.message`.

  Un 401 arriva qui come `Error('Unauthorized')` senza `status`, e va in `error`.
- Intestazione del file nello stile di `js/lib/master-clients.js`. Aggiorna `?v=16` su tutte le pagine.

- [ ] **Step 4: Esegui e verifica che passino**

Run: `npx vitest run js/lib/save.test.js js/lib/save-overlay-trigger.test.js`
Expected: PASS, compreso il test dell'overlay invariato.

- [ ] **Step 5: Commit**

```bash
git add js/api.js js/lib/save.js js/lib/save.test.js *.html
git commit -m "feat(js): apiSave with one outcome per write; apiFetch tags non-JSON, timeout and network errors"
```

---

### Task 4: pilota `master-roles`

**Files:**
- Modify: `js/pages/master-roles.js`: `loadAll`, il metodo di salvataggio (`:255-300`), `confirmDelete`
- Modify: `master-roles.html`: carica `js/lib/save.js?v=1` come `type="module"` prima di `js/pages/master-roles.js`, che passa a `?v=2`. Il markup del pulsante Reload va nel pannello e nella modale di eliminazione, sotto il messaggio d'errore, con le classi di bottone già usate nella pagina.

**Interfaces:**
- Consumes: le route di ruolo del Task 2 e `window.apiSave` del Task 3.

- [ ] **Step 1: Mappa il ruolo dalla risposta del server**

Estrai la mappatura di `loadAll` in un metodo `fromApi(r)`, che restituisce `{ id, label, code, rate, rateOverrides, version }`. `loadAll` lo usa per la lista, e il salvataggio per la riga restituita dal server.

- [ ] **Step 2: Salvataggio con `apiSave`**

- Modifica: `apiSave('PATCH', '/roles/' + id, { label, code, hourlyRate, rateOverrides, version })`. Creazione: `apiSave('POST', '/roles', { label, code, hourlyRate, rateOverrides })`.
- Su `ok` la riga in memoria si sostituisce con `fromApi(res.data)`, oppure si aggiunge. Il resto del ramo di successo resta com'è: gruppo aperto, chiusura del pannello.
- Su `conflict` o `unknown`, `form.error` riceve il messaggio dei Global Constraints e `form.reloadable = true`.
- Su `rule` o `error`, `form.error = res.message`.
- Il `try/catch` intorno alla chiamata sparisce, perché `apiSave` non lancia. `finally` → `form.loading = false` resta.

- [ ] **Step 3: Eliminazione con `apiSave`**

- La chiamata è `apiSave('DELETE', '/roles/' + role.id, { version: role.version })`.
- `del.blocked` si calcola dallo stesso test di oggi, cioè `/^Cannot delete role /` applicato a `res.message`, solo quando `kind === 'error'` e `status === 400`.
- `conflict` e `unknown` impostano `del.reloadable = true`.

- [ ] **Step 4: Reload**

Implementa `reloadRole()`:

1. esegue `await this.loadAll()`;
2. se il ruolo dell'editor esiste ancora, riapre il pannello con i suoi valori, usando lo stesso metodo che apre l'edit;
3. altrimenti chiude il pannello con `This role no longer exists.`

La modale di eliminazione, su Reload, esegue `loadAll` e chiude la modale.

- [ ] **Step 5: Verifica**

Run: `npx vitest run js/lib/master-roles-page-guard.test.js js/lib/master-roles-rate-input-guard.test.js js/lib/master-roles.test.js js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js scripts/security-headers-guard.test.js`
Expected: PASS

Nessun test di pagina nuovo: la verifica del pilota è il criterio 8, a mano al Gate 2.

- [ ] **Step 6: Commit**

```bash
git add js/pages/master-roles.js master-roles.html
git commit -m "feat(master-roles): save and delete through apiSave, Reload on conflict, server row adopted"
```

---

### Task 5: pilota ratecard in `master-clients`, metodi `Api.*` orfani rimossi

**Files:**
- Modify: `js/pages/master-clients.js`: `openClientRatecard`, `saveClientRatecard`
- Modify: `master-clients.html`: carica `js/lib/save.js?v=1`, `js/pages/master-clients.js?v=2`, e mette il pulsante Reload nella modale della ratecard
- Modify: `js/api.js`: rimuove `Api.roles.create/update/delete` e `Api.ratecards.create/rename/updateEntries/delete`. `js/api.js` resta `?v=16`, perché il Task 3 l'ha già aggiornato in questo branch.

**Interfaces:**
- Consumes: le route ratecard del Task 2 e `window.apiSave`.

- [ ] **Step 1: Righe della card in una funzione sola**

Estrai da `openClientRatecard` la costruzione di `state.rows` in un metodo `ratecardRows(rc, roles)`, che restituisce le righe. Contiene il codice di `entryOf`, `extra`, `defaults`, `texts`, `stored`, `hidden` e `initial`, spostato così com'è. `openClientRatecard` salva `state.roles = roles` e chiama `ratecardRows`.

- [ ] **Step 2: Creazione e salvataggio con `apiSave`**

- **Creazione della card mancante:** `apiSave('POST', '/ratecards', { name: client.name, clientId: client.id })`. Su un esito diverso da `ok`, `state.loadError = res.message`.
- **Salvataggio:** `apiSave('PATCH', '/ratecards/' + state.id + '/entries', { version: state.version, entries })`.
  - Su `ok`: `state.version = res.data.version` e `state.rows = this.ratecardRows(res.data, state.roles)`. Il messaggio di successo e `refreshRatecards()` restano come oggi. Il blocco che ricostruisce `stored` dagli input sparisce.
  - Su `conflict` o `unknown`: il messaggio, `msgKind = 'error'` e `state.reloadable = true`. Reload richiama `openClientRatecard(client)`, quindi il cliente aperto va tenuto in `state.client`.
  - Su `rule` o `error`: `res.message`.

- [ ] **Step 3: Rimuovi i metodi orfani da `js/api.js`**

Run: `grep -rnE "Api\.(roles\.(create|update|delete)|ratecards\.(create|rename|updateEntries|delete))\b" js --include=*.js`
Expected: nessuna riga, prima di cancellare i sette metodi.

- [ ] **Step 4: Verifica**

Run: `npx vitest run js/lib/master-clients.test.js js/lib/master-clients-ratecard-guard.test.js js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js js/lib/money-guard.test.js scripts/security-headers-guard.test.js`
Expected: PASS. Un page guard che pinna la vecchia chiamata `Api.ratecards.*` o la ricostruzione di `stored` si aggiorna al codice nuovo, senza perdere ciò che proteggeva (alla lettera nel messaggio di commit).

- [ ] **Step 5: Commit**

```bash
git add js/pages/master-clients.js master-clients.html js/api.js
git commit -m "feat(master-clients): rate card through apiSave, rows rebuilt from the server card; drop orphaned Api writes"
```

---

### Task 6: guard del contratto

**Files:**
- Create: `scripts/save-contract-guard.test.js`
- Create: `scripts/lib/save-contract-scan.mjs`. Contiene le funzioni pure, così i test su sorgenti sintetici non leggono il repo.

**Interfaces:**
- Consumes: lo stato lasciato dai Task 2-5.
- Produces, in `save-contract-scan.mjs`:
  - `serverWrites(source, tables)` → `[{ table, index, inside: boolean }]`. `inside` è vero quando l'istruzione sta dentro le parentesi di una chiamata `versionedWrite(`.
  - `apiWriteMethods(apiJsSource)` → `Set<'ns.name'>`.
  - `clientWrites(source, writeMethods)` → `[{ kind: 'api'|'apiFetch'|'fetch', name, index }]`.
  - `callSpans(source, callee)` → `[[start, end]]`. È lo scanner che appaia le parentesi saltando stringhe (`'`, `"` e template con `${}`) e commenti, ed è usato dalle tre funzioni sopra.

- [ ] **Step 1: Scrivi i test sintetici che falliscono**

Ogni caso è un `it` di vitest su stringhe:

- `UPDATE roles SET x = 1` fuori da `versionedWrite(` → `inside: false`;
- lo stesso SQL dentro `versionedWrite(pool, { write: async c => c.query('UPDATE roles …') })`, anche su più righe e con una template string → `inside: true`;
- `DELETE FROM ratecard_entries` non va confuso con `ratecards`;
- `ON CONFLICT … DO UPDATE SET` non conta come scrittura di una tabella;
- `fetch('/api/x', { method: 'POST' })` → una voce `fetch`; `fetch('/handbook/a.md')` → nessuna;
- `apiFetch('/x', { method: 'DELETE' })` → una voce; `apiFetch('/x')` → nessuna;
- con `apiWriteMethods` su un `api.js` sintetico che ha `create: (d) => apiFetch('/r', { method: 'POST' })` e `list: () => apiFetch('/r')`: il set è `{'r.create'}`, `Api.r.create(` è una voce e `Api.r.list(` no;
- una parentesi dentro una stringa o un commento non chiude la chiamata.

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `npx vitest run scripts/save-contract-guard.test.js`
Expected: FAIL (modulo mancante)

- [ ] **Step 3: Implementa lo scanner e le regole sul repo**

Le regole vivono in `save-contract-guard.test.js`:

- `REGISTERED_TABLES = ['roles', 'ratecards', 'ratecard_entries', 'programs', 'projects', 'cost_grids', 'cost_grid_versions']`.
- **`SERVER_EXEMPT`**: un `Set` di `'path: tabella'`. Si compila con l'output della prima esecuzione delle regole, e si aspetta di trovare:
  - `api/src/routes/config.js: programs`;
  - `api/src/routes/cost-grids.js: cost_grids` e `cost_grid_versions`;
  - `api/src/routes/projects.js: projects`;
  - `api/src/routes/reset.js`: `cost_grids`, `programs`, `projects`, `ratecards`.
- **`CLIENT_EXEMPT`**: un `Set` di path. Si compila con l'output della prima esecuzione e deve comprendere ogni file che scrive, tranne `js/pages/master-roles.js`. Comprende `js/pages/master-clients.js`.
- **`RETIRED`**: `['js/pages/master-roles.js', 'api/src/routes/config.js: roles', 'api/src/routes/config.js: ratecards', 'api/src/routes/config.js: ratecard_entries']`.

Le regole, come `it` separati:

1. nessuna scrittura server con `inside: false` fuori da `SERVER_EXEMPT`;
2. nessuna scrittura client in un file fuori da `CLIENT_EXEMPT`; file esclusi: `js/api.js`, `js/lib/save.js` e i `.test.js`;
3. nessuna voce di `RETIRED` nelle due eccezioni;
4. ogni voce di eccezione ha almeno una violazione;
5. ogni metodo di `apiWriteMethods(js/api.js)` ha almeno una chiamata `Api.<ns>.<name>(` in `js/`, test esclusi.

Ogni messaggio di fallimento elenca le voci in difetto. Aggiungi un'intestazione con i limiti, nello stile di `scripts/doc-paths-guard.test.js`:

- è lessicale, quindi un SQL costruito per concatenazione non lo vede;
- un `fetch` con il metodo in una variabile non lo vede;
- `api/src/scripts` è fuori scope.

- [ ] **Step 4: Prova che le regole sul repo falliscono quando devono**

Aggiungi temporaneamente `fetch('/api/x', { method: 'POST' })` a `js/pages/master-roles.js` ed esegui il guard: deve fallire la regola 2, e anche la 3 se il file venisse rimesso in `CLIENT_EXEMPT`. Annulla la modifica.

Fai lo stesso con un `UPDATE roles` fuori da `versionedWrite(` in `config.js`: deve fallire la regola 1. Annulla.

Run: `git diff --stat js/pages/master-roles.js api/src/routes/config.js`
Expected: vuoto

- [ ] **Step 5: Esegui e verifica che passino**

Run: `npx vitest run scripts/save-contract-guard.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/save-contract-guard.test.js scripts/lib/save-contract-scan.mjs
git commit -m "test: save-contract guard with exempt and retired lists"
```

---

### Task 7: documentazione

**Files:**
- Modify: `CLAUDE.md`, con la sezione `### Save contract` dopo "Dates", "Data strategy (in-memory cache)" e quattro voci della File structure
- Modify: `docs/api/config.md`, `docs/api/services.md`, `docs/js/lib.md`, `docs/db/migrations.md`, `docs/pages/config.md`

**Interfaces:**
- Consumes: i nomi dei Task 1-6.

- [ ] **Step 1: Sezione `### Save contract` in CLAUDE.md**

Usa i punti della Spec §9, nello stile di "Dates": regole senza motivazioni e senza conteggi. Rimanda a `scripts/save-contract-guard.test.js` per le eccezioni e a `docs/api/services.md` e `docs/js/lib.md` per il dettaglio.

Il paragrafo "Data strategy" cambia la riga **On user action**: il fire-and-forget vale solo per i file elencati nelle eccezioni di `scripts/save-contract-guard.test.js`, mentre un file migrato segue "Save contract".

La File structure riceve una riga ciascuno per `versioned-write.js`/`saved-entities.js` (dentro la voce `api/src/services/`, già esistente), per `js/lib/save.js` (dentro la voce `js/lib/`, già esistente) e per il guard, nella forma delle altre righe `scripts/*-guard.test.js`.

- [ ] **Step 2: I file `docs/`**

- `docs/api/config.md`: versione, body e risposte delle route del Task 2; `STALE`; l'eliminazione di un ruolo che aggiorna le card.
- `docs/api/services.md`: `versionedWrite`, `respondSaveError`, il registro dei tipi.
- `docs/js/lib.md`: `save.js`, la tabella dei cinque esiti, le proprietà nuove degli errori di `apiFetch`.
- `docs/db/migrations.md`: `037`.
- `docs/pages/config.md`: conflitto e Reload in Roles e nella ratecard.

- [ ] **Step 3: Verifica**

Run: `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js scripts/architecture-guard.test.js scripts/decision-ledger-guard.test.js`
Expected: PASS. CLAUDE.md sotto il limite di 64,000 B.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/api/config.md docs/api/services.md docs/js/lib.md docs/db/migrations.md docs/pages/config.md
git commit -m "docs: save contract section and per-file detail"
```

## Decisioni aperte

1. **Sul server `PATCH /roles/:id` resta parziale (un campo assente non cambia) e richiede solo la versione; l'entità intera è il payload del pilota, non un requisito della route.** Alternativa scartata: rifiutare un body senza tutti i campi. Perché: con la versione la semantica parziale è sicura, e i test esistenti di `test-api.js` che mandano un solo campo restano validi.
2. **L'eliminazione di un ruolo blocca prima le ratecard che lo contengono (in ordine di id) e poi il ruolo, dentro una transazione aperta dalla route.** Alternativa scartata: lasciare a `versionedWrite` il primo lock, sul ruolo. Perché: il salvataggio delle voci blocca prima la card e poi, con la FK, il ruolo. Con l'ordine opposto le due transazioni si bloccano a vicenda e una fallisce con un 500.
3. **In `test-api.js` la cleanup e le chiamate esistenti leggono la versione corrente con un helper (`versionOf`, `withVersion`), e non si mantiene una via senza versione.** Alternativa scartata: un'eccezione lato server per le chiamate senza versione. Perché: qualunque via senza versione riaprirebbe il last-writer-wins.
4. **Il guard sta in `scripts/save-contract-guard.test.js`, con le funzioni pure in `scripts/lib/save-contract-scan.mjs`.** Alternativa scartata: in `js/lib/`, come `money-guard`. Perché: guarda sia `api/` sia `js/`, e i guard trasversali del repo vivono in `scripts/` con le loro librerie in `scripts/lib/`.
5. **`SERVER_EXEMPT` e `CLIENT_EXEMPT` si compilano dall'output della prima esecuzione delle regole, e non a mano in anticipo.** Alternativa scartata: elencarli già nel Piano. Perché: la regola 4 (nessuna voce senza violazione) impedisce di metterci file in più, e la regola 2 di dimenticarne.
6. **Esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: §6.1 vuole task indipendenti per subagent-driven, e questi non lo sono (vedi "Task indipendenti").
