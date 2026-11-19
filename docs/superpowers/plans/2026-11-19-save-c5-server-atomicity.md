# Contratto di salvataggio, ciclo 5: atomicità delle route fuori dalle entità critiche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni scrittura composta delle route di timesheet, POT, valute, T&C, notifiche e alias riesce tutta o niente; un publish concorrente dei T&C e un alias già risolto vengono rifiutati in modo esplicito.

**Architecture:** ogni route avvolge le sue istruzioni in `withTransaction(pool, fn)` (`api/src/db/transaction.js`, esistente). I passi best-effort (rescan, enqueue, push, email) passano dopo il COMMIT. La prova è in `test-api.js`: trigger temporanei creati con `sql()` fanno fallire la seconda istruzione, e il test verifica che il DB sia rimasto allo stato precedente.

**Tech Stack:** Node 24, Express, `pg`, PostgreSQL 16; `test-api.js` su `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-11-19-save-c5-server-atomicity-design.md`
**Branch:** `save-c5-server-atomicity`
**Risk class:** high-risk — money e valute (POT, tassi di cambio); operazioni distruttive (cancellazione e sostituzione delle actuals)

**Task indipendenti:** no. Il Task 1 scrive tutti i test e l'helper dei trigger in `test-api.js`; i Task 2-5 rendono verdi i loro casi e toccano tutti la stessa funzione di test e `handbook/restricted/TEST_CASES.md`.

## Global Constraints

- **Helper di transazione:** solo `withTransaction(pool, async client => …)` da `../db/transaction`; nessun nuovo helper, nessun `versionedWrite`.
- **Best-effort dopo il COMMIT:** `refreshUnmatched`, `enqueueProjectsQuiet`, `enqueueAllQuiet`, `rescanAll`, `pushToUser`, `sendAdminNotificationEmail` non stanno mai dentro la callback di `withTransaction`.
- **Contratti invariati:** corpi e status di successo, e tutti gli errori esistenti (`MONEY_RULE`, incoerenze xlsx, `FILE_FORMAT`, limite di dimensione, 400/403/404/409 attuali), restano identici.
- **Esiti nuovi (testi esatti, inglese):**
  - T&C: `409 { error: 'Another version was published at the same time. Reload to see it.', code: 'STALE', version: <intero, MAX(version) letto dopo il rollback> }`.
  - Alias: `409 { error: '"<display_name richiesto, trim>" was already resolved by someone else. Reload the list.', code: 'ALREADY_RESOLVED', alias: { id, alias_normalized, display_name, resource_id } }`.
- **Lock dei timesheet:** `SELECT pg_advisory_xact_lock(hashtext('timesheets:' || $1))` per codice, codici in ordine con `[...codes].sort()`, prima di qualunque `DELETE`.
- **Ogni task aggiorna i documenti della sua riga `**Docs:**` nello stesso commit.**
- **Prima di ogni `scripts/run-tests.sh`** (circa 6 minuti): `node --check` dei file JS toccati e `npm test` dentro `api/`, concatenati con `&&`. Nel log si cerca `Unexpected error`. Il worktree ha bisogno del `.env` copiato dal checkout principale e di `npm ci` in `api/`.
- **Case id:** prefisso `AX-`, unici (`scripts/test-api-ids-guard.test.js`).

## Review Focus

1. **Due upload concorrenti dello stesso codice:** ci si aspetta una sola riga in `timesheets` per quel codice, non due. Lo pinna AX-02 (Task 1, verde al Task 2).
2. **Broadcast che fallisce a metà:** nessun destinatario deve ricevere la notifica, né via push né nel DB. AX-10 fa fallire la seconda riga, non la prima, così il loop di oggi è rosso.
3. **Due Assign simultanei dello stesso nome nuovo:** il secondo INSERT prende `23505`, e l'esito va calcolato sulla riga vincente (200 o 409), mai un 500. Non c'è un test deterministico: lo copre il ramo `23505` del Task 5, che il reviewer verifica a lettura.
4. **Publish dei T&C senza `publishNewVersion`:** deve continuare a salvare il solo draft, senza toccare `terms_versions`. AX-08b (Task 1, verde al Task 4).
5. **Upload rifiutato dalle validazioni:** nessun lock né transazione aperti, e la risposta è identica a oggi. I casi XF-* e i test di incoerenza esistenti restano verdi (Task 2).

---

### Task 1: helper dei trigger e test AX in `test-api.js`

**Files:**
- Modify: `test-api.js` (nuovi `withTrigger`, `testServerAtomicity`; chiamata in `main()` dopo `await testNotificationUrl();`)
- Modify: `handbook/restricted/TEST_CASES.md` (nuova sezione `## 33. Server write atomicity (2026-11-19)` prima di `## 17. Regression — Cross-feature`)

**Docs:** `handbook/restricted/TEST_CASES.md` (righe AX-01..AX-15, colonna esito `✓` come le sezioni vicine)

**Interfaces:**
- Produces: `async function withTrigger(table, { events, when = null, level = 'ROW', body = "RAISE EXCEPTION 'AX injected failure';", ret = 'NEW' }, fn)`. Crea `CREATE OR REPLACE FUNCTION ax_trg_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN <body> RETURN <ret>; END $$` e `CREATE TRIGGER ax_trg BEFORE <events> ON <table> FOR EACH <level> [WHEN (<when>)] EXECUTE FUNCTION ax_trg_fn()`. Poi esegue `await fn()` e, in `finally`, `DROP TRIGGER IF EXISTS ax_trg ON <table>; DROP FUNCTION IF EXISTS ax_trg_fn()`. Se `sql()` risponde `null` (SQL diretto non disponibile), salta `fn` e ritorna `false`; altrimenti ritorna `true`. Un trigger di riga su `DELETE` passa `ret: 'OLD'`.
- Produces: `async function testServerAtomicity()`, con `section('Server write atomicity')`. Le pulizie usano `later(...)`.

- [ ] **Step 1: scrivi `withTrigger` e i casi**, uno per riga. Ogni caso con trigger è dentro `withTrigger`; il marker è unico per run (`const ts = Date.now()`).

| Id | Preparazione | Iniezione | Asserzioni |
|---|---|---|---|
| AX-01 | due progetti `AXA${ts}`, `AXB${ts}` creati come in `testXlsxUploadGate` (sysadmin + `saveProjectLegacy` task `Analysis`/`Consultant`); upload di un file con una riga per codice, 4 ore | `timesheets` `INSERT`, `when: "NEW.project_code = 'AXB${ts}'"`; nuovo upload degli stessi codici con 9 ore | status 500; `sql('SELECT project_code, data FROM timesheets WHERE project_code = ANY($1)')` → una riga per codice, entrambe con `hours` 4 |
| AX-02 | progetto `AXC${ts}` | `timesheets` `INSERT`, `when` sul codice, `body: "PERFORM pg_sleep(1);"`; due upload in parallelo (`Promise.all`) | entrambi 201; `count(*)` delle righe di `timesheets` per il codice = 1 |
| AX-03 | progetto `AXD${ts}`, upload con owner `Axd Nobody${ts}` (entra in `profile_unmatched`) | `profile_unmatched` `DELETE`, `when: "OLD.project_code = 'AXD${ts}'"`, `ret: 'OLD'`; `DELETE /api/timesheets/AXD${ts}` | 500; la riga di `timesheets` c'è ancora |
| AX-04 | `POST /api/pots { specialLabel: 'New Biz', year: 2092, amount: 100 }` | `pot_history` `INSERT`, `when: "NEW.note = 'AX-04 ${ts}'"`; `PATCH` con `amount: 200, note: 'AX-04 ${ts}'` | 500; `pots.amount` = 100; nessuna riga di storico con quella nota |
| AX-05 | — | `pot_history` `INSERT`, `when: "NEW.new_value = 987654.32"`; `POST /api/pots { specialLabel: 'New Biz', year: 2093, amount: 987654.32 }` | 500; nessun POT `New Biz` 2093 |
| AX-06 | `USD` attiva (`ensureTestCurrencies`); si legge `current_rate` | `currency_rates` `INSERT`, `when: "NEW.rate = 7.654321"`; `PATCH /api/currencies/USD/rate { rate: 7.654321 }` | 500; `current_rate` invariato |
| AX-07 | `code` = `SELECT code FROM currencies WHERE active = false AND code NOT IN ('NOK','EUR') ORDER BY code LIMIT 1` | `currency_rates` `INSERT`, `when: "NEW.rate = 6.543210"`; `POST /api/currencies/<code>/activate { rate: 6.54321 }` | 500; la valuta è ancora `active = false` |
| AX-08 | `max` = `SELECT MAX(version)`; `content` = il `content` di `GET /api/app-settings/terms` | `app_settings` `INSERT OR UPDATE`, `when: "NEW.key = 'terms_version'"`; `PUT /terms { content, publishNewVersion: true }` (sysadmin) | 500; `MAX(version)` = `max` |
| AX-08b | — | nessuna; `PUT /terms { content, publishNewVersion: false }` | 200, `newVersion === null`; `MAX(version)` = `max` |
| AX-09 | come AX-08 | `terms_versions` `INSERT`, `body: "PERFORM pg_sleep(1);"`; due `PUT` in parallelo con `publishNewVersion: true` | status ordinati `[200, 409]`; il 409 ha `code === 'STALE'` e `Number.isInteger(version)`; `MAX(version)` = `max + 1` |
| AX-10 | titolo `AX-10 ${ts}`; almeno 2 utenti attivi (admin e sysadmin) | `notifications` `INSERT`, `when: "NEW.title = 'AX-10 ${ts}'"`, `body: "IF (SELECT count(*) FROM notifications WHERE title = NEW.title) >= 1 THEN RAISE EXCEPTION 'AX injected failure'; END IF;"`; broadcast admin `POST /api/notifications { title, channels: ['push'] }` | 500; `count(*)` delle notifiche con quel titolo = 0 |
| AX-11 | due risorse `resA`, `resB` (come in `testResourceMatching`); `POST /aliases { name: 'Axe Name${ts}', resourceId: resA }` → 201 | nessuna; `POST` dello stesso nome con `resourceId: resB` | 409, `code === 'ALREADY_RESOLVED'`, `alias.resource_id === resA`; `GET /aliases` mostra ancora `resA` |
| AX-12 | come AX-11 | nessuna; `POST { name, ignore: true }` | 409 `ALREADY_RESOLVED`; alias invariato |
| AX-13 | come AX-11 | nessuna; `POST { name, resourceId: resA }` | 200 |
| AX-14 | — | `profile_unmatched` `INSERT OR DELETE`, `level: 'STATEMENT'`, nessun `when`; `POST /aliases { name: 'Axf Name${ts}', resourceId: resA }` | 201; l'alias è in `GET /aliases` |
| AX-15 | — | stesso trigger di AX-14; `PATCH /api/resources/<resA> { status: 'inactive' }`, poi di nuovo `active` fuori dal trigger | 200 |

- [ ] **Step 2: aggiungi le righe AX-01..AX-15 a `TEST_CASES.md`**, con le colonne della sezione 20.

- [ ] **Step 3: esegui la suite**
Run: `node --check test-api.js && (cd api && npm test) && scripts/run-tests.sh`
Expected: falliscono AX-01, AX-02, AX-03, AX-04, AX-05, AX-06, AX-07, AX-08, AX-09, AX-10, AX-11, AX-12. Passano AX-08b, AX-13, AX-14, AX-15 (pin del comportamento attuale). Nessun `Unexpected error`, nessun altro caso rosso.

- [ ] **Step 4: commit**
```bash
git add test-api.js handbook/restricted/TEST_CASES.md
git commit -m "test(api): AX atomicity cases with injected trigger failures"
```

### Task 2: timesheet upload e delete

**Files:**
- Modify: `api/src/routes/timesheets.js` (il ciclo `DELETE`/`INSERT` di `POST /upload`; `DELETE /:projectCode`)

**Docs:** `docs/api/timesheets.md` (upload: una transazione per tutto il file, lock advisory per codice, `refreshUnmatched`/enqueue dopo il COMMIT; delete: transazione su `timesheets` e `profile_unmatched`)

**Interfaces:**
- Consumes: `withTransaction` da `../db/transaction`, `pool` da `../db/client`.

- [ ] **Step 1: upload.** Il ciclo `for (const code of codes)` con `DELETE` e `INSERT` va dentro un solo `withTransaction`: prima i lock di tutti i codici in ordine (Global Constraints), poi `DELETE` e `INSERT` con `client.query`. Tutto ciò che viene prima (validazioni, `resolveFee`) e dopo (`refreshUnmatched`, `enqueueProjectsQuiet`, risposta) resta dov'è.
- [ ] **Step 2: delete.** Lock del codice, `DELETE FROM timesheets … RETURNING`/`rowCount`, `DELETE FROM profile_unmatched`, dentro `withTransaction`; `enqueueProjectsQuiet` e la risposta `{ ok: true, deleted }` dopo.
- [ ] **Step 3: verifica**
Run: `node --check api/src/routes/timesheets.js && (cd api && npm test) && scripts/run-tests.sh`
Expected: AX-01, AX-02, AX-03 verdi; XF-*, i casi di incoerenza e gli altri test di timesheet verdi; nessun `Unexpected error`.
- [ ] **Step 4: commit** `fix(timesheets): upload and delete in one transaction, per-code lock` con `api/src/routes/timesheets.js` e `docs/api/timesheets.md`.

### Task 3: POT e valute

**Files:**
- Modify: `api/src/routes/pots.js` (`POST /`, `PATCH /:id`)
- Modify: `api/src/routes/currencies.js` (`POST /:code/activate`, `PATCH /:code/rate`)

**Docs:** `docs/api/currencies.md` (activate e rate: lettura sotto `FOR UPDATE`, update e `currency_rates` in una transazione). `pots.js` non ha un file in `docs/api/`: il commento sopra `PATCH /:id` dice che storico e importo stanno nella stessa transazione, con il valore vecchio letto sotto lock.

**Interfaces:**
- Consumes: `withTransaction`, `pool`.

- [ ] **Step 1: `PATCH /api/pots/:id`.** Validazioni come oggi. In transazione: `SELECT amount FROM pots WHERE id = $1 FOR UPDATE`. Se manca, la callback ritorna `null` e la route risponde `404 'POT not found'`. Poi `UPDATE … RETURNING *` e `INSERT pot_history` con `old_value` dal lock.
- [ ] **Step 2: `POST /api/pots`.** `INSERT pots` e `INSERT pot_history` nella stessa transazione. Il `catch` del `23505` → 409 resta.
- [ ] **Step 3: valute.** `activate` e `rate`: `SELECT active FROM currencies WHERE code = $1 FOR UPDATE`, poi gli stessi 404/400/409 di oggi (ritornati dalla callback come esito, la risposta si scrive fuori), `UPDATE` e `INSERT currency_rates`. La rilettura finale di `activate` resta dopo, fuori dalla transazione.
- [ ] **Step 4: verifica**
Run: `node --check api/src/routes/pots.js && node --check api/src/routes/currencies.js && (cd api && npm test) && scripts/run-tests.sh`
Expected: AX-04..AX-07 verdi; POT-*, CUR-setup, MR-* e gli altri casi di POT e valute verdi.
- [ ] **Step 5: commit** `fix(pots,currencies): amount and history in one transaction` con i due file di route e `docs/api/currencies.md`.

### Task 4: publish dei T&C e broadcast delle notifiche

**Files:**
- Modify: `api/src/routes/app-settings.js` (`PUT /terms`)
- Modify: `api/src/routes/notifications.js` (`POST /`)

**Docs:** `docs/api/app-settings.md` (publish in transazione; `23505` su `terms_versions` → `409 STALE` con `version`), `docs/api/notifications.md` (un solo `INSERT … SELECT … FROM unnest($1::uuid[])`; push ed email dopo, sulle righe restituite)

**Interfaces:**
- Consumes: `withTransaction`, `pool`.

- [ ] **Step 1: `PUT /terms`.** Le tre query di oggi, nello stesso ordine, dentro `withTransaction`. `catch`: se `err.code === '23505' && err.table === 'terms_versions'`, si legge `SELECT MAX(version)` con `query` e si risponde con il 409 delle Global Constraints; altrimenti `next(err)`.
- [ ] **Step 2: `POST /api/notifications`.** Sostituisci il loop di INSERT con una sola istruzione su `targets.map(u => u.id)`, con lo stesso `RETURNING` di oggi. Poi, per ogni riga restituita, cerca il target corrispondente (per `user_id`) e lancia push ed email come oggi. Risposta `{ ok: true, created: rows.length }`.
- [ ] **Step 3: verifica**
Run: `node --check api/src/routes/app-settings.js && node --check api/src/routes/notifications.js && (cd api && npm test) && scripts/run-tests.sh`
Expected: AX-08, AX-08b, AX-09, AX-10 verdi; NU-* e i casi di notifica e T&C esistenti verdi.
- [ ] **Step 4: commit** `fix(terms,notifications): atomic publish with 409 STALE, single-statement broadcast` con i due file di route e i due documenti.

### Task 5: alias e regola del progetto

**Files:**
- Modify: `api/src/routes/resources.js` (`POST /aliases`)
- Modify: `CLAUDE.md` (sezione "Save contract")

**Docs:** `docs/api/resources.md` (punto "Aliases": 201 nuovo, 200 stessa risoluzione, `409 ALREADY_RESOLVED` con la riga attuale per una risoluzione diversa; il rescan resta best-effort dopo il COMMIT), `CLAUDE.md` (la voce sotto)

**Interfaces:**
- Consumes: `withTransaction`, `pool`.

- [ ] **Step 1: `POST /aliases`.** Validazioni come oggi. In transazione:
  - `SELECT id, alias_normalized, display_name, resource_id FROM resource_aliases WHERE alias_normalized = $1 FOR UPDATE`;
  - se manca, `INSERT … RETURNING` → esito `created`;
  - se c'è con `resource_id` uguale a quello richiesto (`null` per ignore), `UPDATE display_name, updated_by, updated_at = now()` → esito `updated`;
  - altrimenti → esito `conflict` con la riga letta, senza scrivere.

  Un `23505` sull'INSERT (Assign concorrente dello stesso nome nuovo) rilegge la riga con `query` e applica la stessa regola: stesso target → 200 senza riscrivere, diverso → 409. `rescanAll()` solo per `created` e `updated`, dopo il COMMIT. Risposte: 201, 200, oppure il 409 delle Global Constraints. I `catch` di `23503` e `22P02` restano.
- [ ] **Step 2: `CLAUDE.md`.** In "Save contract", dopo la voce `versionedWrite`, aggiungi: `- **A server write of more than one statement runs in one \`withTransaction\`** (\`api/src/db/transaction.js\`); its best-effort follow-ups (rescan, enqueue, push, email) run after the COMMIT and never fail the response.` Poi esegui `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js`. Expected: PASS.
- [ ] **Step 3: verifica**
Run: `node --check api/src/routes/resources.js && (cd api && npm test) && npm test && scripts/run-tests.sh`
Expected: tutti gli AX verdi, MA-* verdi, `npm test` verde, nessun `Unexpected error`.
- [ ] **Step 4: commit** `fix(resources): refuse re-pointing an alias resolved elsewhere (409 ALREADY_RESOLVED)` con `api/src/routes/resources.js`, `docs/api/resources.md` e `CLAUDE.md`.

## Decisioni aperte

1. **Tutti i test nel Task 1, prima del codice.** Alternativa scartata: i test di ogni route nel task che la corregge. Perché: una sola esecuzione rossa di `run-tests.sh` (circa 6 minuti) invece di una per task, e l'helper dei trigger viene scritto una volta sola.
2. **AX-02 prova il lock per codice con due upload paralleli e un `pg_sleep`.** Alternativa scartata: nessun test, con il lock verificato solo a lettura. Perché: il lock è la Decisione 2 della Spec, e senza test un reviewer non può distinguerlo da una riga morta.
3. **AX-10 fa fallire la seconda notifica inserita, non quella di un utente specifico.** Alternativa scartata: `when` su un `user_id`. Perché: l'ordine del `SELECT` degli utenti non è garantito, e se l'utente scelto fosse il primo il test passerebbe anche con il loop di oggi.
