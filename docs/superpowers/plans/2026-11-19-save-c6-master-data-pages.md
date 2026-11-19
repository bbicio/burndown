# Contratto di salvataggio, ciclo 6: pagine dei master data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni scrittura di master-clients, master-pipelines, master-currencies, team, attribute-lists, `js/clients.js` e del modal cliente di project-config passa da `apiSave`. Un salvataggio riuscito con la ricarica fallita lo dice. Le pagine adottano la risposta del server. Il server rifiuta i nomi duplicati di clienti e gruppi, e la cancellazione di un anno che ha dei POT.

**Architecture:** lato server, una migrazione (indici unici su `lower(name)`), il `23505` tradotto in `409 NAME_TAKEN`, e `DELETE /pipeline-years/:id` in `withTransaction`. Lato client, un helper `saveAndReload` in `js/lib/save.js`; ogni pagina scrive con `apiSave`/`saveAndReload`, e i metodi `Api.*` di scrittura rimasti senza chiamante vengono cancellati. Due funzioni pure nuove, testate con vitest: `clientGroupWrites` (adattatore per `moveClient`) e `changedResourceFields` (il `PATCH` dei soli campi cambiati).

**Tech Stack:** Node 24, Express, `pg`, PostgreSQL 16; Vue 3 da CDN, nessun build; vitest + jsdom; `test-api.js` su `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-11-19-save-c6-master-data-pages-design.md`
**Branch:** `save-c6-master-data-pages`
**Risk class:** high-risk — migrazione DB; money e valute (POT, tassi); file condivisi caricati da più pagine (`js/api.js`, `js/lib/save.js`, `js/clients.js`)

**Task indipendenti:** no. I Task 3-7 dipendono dall'helper del Task 2 e dai codici del Task 1. Condividono anche `js/api.js`, `scripts/save-contract-guard.test.js` e `docs/pages/config.md`, quindi vanno eseguiti in ordine.

## Global Constraints

- **Esiti del server (testi esatti, inglese):**
  - `409 { error: 'A client named "<nome trim>" already exists.', code: 'NAME_TAKEN' }`
  - `409 { error: 'A group named "<nome trim>" already exists.', code: 'NAME_TAKEN' }`
  - `409 { error: 'Pipeline <anno> cannot be deleted because it has proposals. Deactivate it instead.', code: 'YEAR_IN_USE' }` (il messaggio di oggi, più il `code`)
  - `409 { error: 'Pipeline <anno> cannot be deleted because it has POT targets. Deactivate it instead.', code: 'YEAR_HAS_POTS' }`
- **Testo condiviso:** `SAVED_NOT_RELOADED = "Saved, but the list couldn't be reloaded. Reload the page to see the latest."` (in `js/lib/save.js`). Con un esito `unknown` si mostra sempre `res.message` (`UNKNOWN_MESSAGE`), mai "Network error.".
- **Path di `apiSave`:** senza il prefisso `/api` (`apiFetch` lo aggiunge). Corpi con numeri, mai stringhe, per gli importi.
- **`moveClient`:** il suo contratto (funzioni che lanciano) e rollback più `reloadGroups()` nel `finally` di `moveTo` restano identici.
- **Banner esistenti di attribute-lists** ("The list was reloaded / couldn't be reloaded", "…, but the topics couldn't be reloaded."): restano identici.
- **Cache-busting:**
  - `js/api.js` passa a `?v=21` in **tutte** le pagine, solo nel Task 3 (i Task 4-5 modificano di nuovo `api.js` senza un altro bump);
  - `js/lib/save.js` passa a `?v=3` nel Task 2;
  - ogni altro file versionato toccato sale di uno in ogni `?v=` che lo cita (`grep -rn '<file>?v=' --include=*.html .`).
- **Rimozione di simboli (CLAUDE.md):** il task che cancella un metodo `Api.*` elenca in **Files** ogni test che lo usa, trovato con `grep -rln '<nome>' js/lib scripts api/src test-api.js`.
- **Docs:** ogni task aggiorna i documenti della sua riga `**Docs:**` nello stesso commit.
- **Prima di `scripts/run-tests.sh`** (circa 6 minuti): `node --check` dei file JS toccati, poi `npm test` dentro `api/`, concatenati con `&&`. Nel log si cerca `Unexpected error`. Il worktree ha bisogno del `.env` copiato dal checkout principale, di `npm ci` nella root e di `npm ci` in `api/`.
- **Case id:** `MDR-01..MDR-08`, unici (`scripts/test-api-ids-guard.test.js`).

## Review Focus

1. **Fixture di `test-api.js` con nomi fissi** (`'__test_cg_client__'`, `'__test_group__'`, `'__test_pot_group__'`, …): con il nuovo indice, un secondo run su uno stack che conserva i dati (`test-branch.sh`) riceverebbe 409. Ci si aspetta che i test restino verdi a ogni run. Il Task 1 aggiunge un suffisso `${Date.now()}` a ogni nome fisso di cliente e di gruppo.
2. **Rinomina di un cliente nel proprio nome con maiuscole diverse** (`Acme` → `ACME`): deve riuscire, non ricevere 409. Lo pinna `MDR-03` (Task 1).
3. **Spostamento tra gruppi con un esito `unknown` sull'assign:** il rollback deve partire comunque e la ricarica deve mostrare lo stato vero. Un test di `clientGroupWrites` (Task 3) pinna che `unknown` lancia come `error`.
4. **Modifica di una risorsa senza cambiamenti:** ci si aspetta che si chiuda senza richiesta, non con il 400 "No fields to update". Il test di `changedResourceFields` (Task 6) pinna che risponde `{}`.
5. **Rate salvato, poi `GET /currencies` fallito:** la riga mostra il tasso nuovo (preso da `res.data.rate`) e il banner `SAVED_NOT_RELOADED`, non "Failed to load". Il test di pagina del Task 5 pinna l'adozione prima della ricarica e la ricarica silenziosa.

---

### Task 1: server — nomi unici di clienti e gruppi, anno con POT

**Files:**
- Create: `api/src/db/migrations/038_unique_client_group_names.sql`
- Modify: `api/src/routes/config.js` (`POST /clients`, `PATCH /clients/:id`)
- Modify: `api/src/routes/client-groups.js` (`POST /`, `PATCH /:id`)
- Modify: `api/src/routes/pipeline-years.js` (`DELETE /:id`)
- Modify: `test-api.js` (nuova `testMasterDataRules()`, chiamata in `main()` subito dopo `await testClientGroups();`; nomi fissi di clienti e gruppi con suffisso `${Date.now()}`)
- Modify: `handbook/restricted/TEST_CASES.md` (nuova sezione `## 34. Master data rules (2026-11-19)` subito dopo la sezione 33)
- Modify: `js/lib/master-data-guard.test.js` se il suo blocco `DELETE /api/client-groups/:id` o uno vicino legge queste route (adeguare solo i testi letterali cambiati)

**Docs:** `docs/api/config.md` (unicità dei nomi, `NAME_TAKEN`; cancellazione dell'anno con `YEAR_IN_USE`/`YEAR_HAS_POTS` e la finestra con un `POST /pots` concorrente, Spec §2.3); `docs/db/migrations.md` (la `038`: rinomina i duplicati come la `021`, poi crea gli indici; si può rieseguire); `handbook/restricted/TEST_CASES.md`

**Interfaces:**
- Produces: i quattro esiti dei Global Constraints; le risposte riuscite non cambiano.

- [ ] **Step 1: scrivi i test.** `testMasterDataRules()`, con `section('Master data rules')` e le pulizie con `later(...)`, `const ts = Date.now()`:

| Id | Azione | Asserzioni |
|---|---|---|
| MDR-01 | crea il cliente `Mdr Acme ${ts}`, poi `POST /api/clients { name: 'MDR ACME ${ts}' }` | 409, `data.code === 'NAME_TAKEN'`, `data.error === 'A client named "MDR ACME ${ts}" already exists.'` |
| MDR-02 | crea `Mdr Beta ${ts}`; `PATCH` di Beta con `name: 'mdr acme ${ts}'` | 409 `NAME_TAKEN`; `GET /api/clients` mostra Beta con il nome invariato |
| MDR-03 | `PATCH` di Acme con `name: 'MDR ACME ${ts}'` | 200, `data.name === 'MDR ACME ${ts}'` |
| MDR-04 | crea il gruppo `Mdr Group ${ts}`, poi `POST /api/client-groups { name: 'mdr group ${ts}' }` | 409 `NAME_TAKEN`, `error === 'A group named "mdr group ${ts}" already exists.'` |
| MDR-05 | crea il gruppo `Mdr Other ${ts}`; `PATCH` con `name: 'MDR GROUP ${ts}'` | 409 `NAME_TAKEN` |
| MDR-06 | crea l'anno `2094` (`active: false`) e `POST /api/pots { specialLabel: 'New Biz', year: 2094, amount: 100 }`; `DELETE` dell'anno | 409 `YEAR_HAS_POTS`, `error` uguale al testo esatto; l'anno è ancora in `GET /api/pipeline-years`. Pulizia: prima il POT, poi l'anno |
| MDR-07 | un anno usato da una versione (la stessa preparazione di `testPipelineYears`, o una versione di test esistente con il suo `pipeline_year`) | 409 `YEAR_IN_USE` |
| MDR-08 | `POST /api/clients { name: '  Mdr Trim ${ts}  ' }` e `PATCH` con `'  Mdr Trim2 ${ts}  '` | `data.name` trimmato in entrambe le risposte |

  Nelle fixture esistenti, ogni nome fisso passato a `POST /api/clients` o a `POST /api/client-groups` (`grep -n "'/api/clients', { name: '\|'/api/client-groups', { name: '\|CLIENT_NAME = '" test-api.js`) riceve il suffisso `${Date.now()}`, con un template literal; il resto dei test non cambia.

  In `TEST_CASES.md`, una riga per caso nel formato delle sezioni vicine, esito `✓`.

- [ ] **Step 2: verifica che falliscano.** Prima `node --check test-api.js`. Poi lancia la suite (`scripts/run-tests.sh`): MDR-01..MDR-07 sono rossi (MDR-01 è 409 ma senza `code`); MDR-03 e MDR-08 sono già verdi.

- [ ] **Step 3: migrazione `038_unique_client_group_names.sql`.**
  - Per `clients`, poi per `client_groups`: la stessa CTE con `ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at, id)` e lo stesso suffisso ` (duplicate n)`, troncato a 255, di `021_attribute_list_items_unique_label.sql`.
  - Poi `CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_name_lower ON clients (lower(name));` e `uq_client_groups_name_lower ON client_groups (lower(name));`.
  - Un commento in testa dice cosa fa e che si può rieseguire.

- [ ] **Step 4: route dei nomi.**
  - In `POST /clients` togli la `SELECT … lower(name)`.
  - Nei quattro handler, nel `catch`: `if (err.code === '23505') return res.status(409).json({ error: …, code: 'NAME_TAKEN' })`, con il nome trimmato nel testo.

- [ ] **Step 5: `DELETE /pipeline-years/:id`** in `withTransaction(pool, async client => …)` (`../db/transaction`), nell'ordine della Spec §2.3:
  1. `SELECT year … FOR UPDATE`;
  2. versioni → `YEAR_IN_USE`;
  3. `SELECT 1 FROM pots WHERE year = $1 LIMIT 1` → `YEAR_HAS_POTS`;
  4. `DELETE`.

  La callback restituisce `{ status, body }`, come `deleteGroup` in `client-groups.js`.

- [ ] **Step 6: verifica.** `node --check` dei tre file di route, `cd api && npm test`, poi `scripts/run-tests.sh`: tutti i casi MDR verdi, nessun `Unexpected error`, nessun altro caso rosso. `npx vitest run scripts/test-api-ids-guard.test.js scripts/doc-paths-guard.test.js`: verde.

- [ ] **Step 7: commit.** `feat(api): unique client and group names, refuse deleting a pipeline year with POTs`

---

### Task 2: `saveAndReload` e `SAVED_NOT_RELOADED` in `js/lib/save.js`

**Files:**
- Modify: `js/lib/save.js`
- Test: `js/lib/save.test.js`
- Modify: `?v=2` → `?v=3` di `js/lib/save.js` in `costgrid.html`, `master-clients.html`, `master-roles.html`, `pipeline.html`, `portfolio.html`, `program.html`, `project-config.html`

**Docs:** `docs/js/lib.md` (voce `save.js`: `saveAndReload`, `SAVED_NOT_RELOADED`)

**Interfaces:**
- Produces: `export async function saveAndReload(method, path, body, reload, opts) → { ...apiSaveOutcome, reloaded: boolean }`. Ricarica solo dopo `ok` o `unknown`; `reload` è riuscita se non lancia e risolve un valore `!== false`. Con gli altri esiti `reloaded` è `false`.
- Produces: `export const SAVED_NOT_RELOADED`. Entrambi su `window`.

- [ ] **Step 1: test** in `save.test.js`, `describe('saveAndReload')`, con `load()` e le risposte finte del file:
  - `200 JSON` + `reload` che risolve `true` → `{ kind: 'ok', data, reloaded: true }`, `reload` chiamata una volta;
  - `200` + `reload` che lancia → `{ kind: 'ok', reloaded: false }`;
  - `200` + `reload` che risolve `false` → `reloaded: false`;
  - `502 HTML` → `{ kind: 'unknown', reloaded: true }`, `reload` chiamata;
  - `409 STALE`, `400 MONEY_RULE`, `404 JSON` → `reload` mai chiamata, `reloaded: false`, `kind` come `apiSave`;
  - `SAVED_NOT_RELOADED` uguale al testo dei Global Constraints.
- [ ] **Step 2:** `npx vitest run js/lib/save.test.js` → FAIL (`saveAndReload` is not a function).
- [ ] **Step 3: implementa** in `save.js`, aggiorna il commento di testa e il bridge `window`.
- [ ] **Step 4:** `npx vitest run js/lib/save.test.js js/lib/save-overlay-trigger.test.js` → PASS. Bump dei sette `?v=`; `grep -rn 'save.js?v=' --include=*.html .` → solo `?v=3`.
- [ ] **Step 5: commit.** `feat(save): saveAndReload tells a failed write from a failed reload`

---

### Task 3: clienti e gruppi — master-clients, `js/clients.js`, modal di project-config

**Files:**
- Modify: `js/lib/master-clients.js` (nuova `clientGroupWrites`); Test: `js/lib/master-clients.test.js`
- Modify: `js/pages/master-clients.js`, `js/clients.js`, `js/pages/project-config.js` (`saveClientModal`)
- Modify: `js/api.js`: cancella `Api.clients.{create,update,delete}` e `Api.clientGroups.{create,rename,delete,assignClient,removeClient}`
- Modify: `scripts/save-contract-guard.test.js`: `js/clients.js`, `js/pages/master-clients.js` e `js/pages/project-config.js: clients.create` passano da `CLIENT_EXEMPT` a `RETIRED`; il commento di `CLIENT_EXEMPT` non cita più "cycle 6: clients"
- Test che leggono i simboli toccati (da `grep -rln 'clients.create\|clientGroups.assignClient\|Api.clientGroups\|saveClientFromModal\|deleteClient' js/lib scripts api/src test-api.js`): `js/lib/master-data-guard.test.js`, `js/lib/costgrid-guard.test.js`, `js/lib/save-overlay-trigger.test.js`, più ogni altro file che il grep elenca
- Modify: cache-busting:
  - `js/api.js` → `?v=21` in ogni pagina;
  - `js/clients.js` → `?v=1` in `costgrid.html`, `pipeline.html`, `planning.html`, `portfolio.html`, `program.html` e `project-config.html`;
  - `js/lib/master-clients.js` +1;
  - `js/pages/master-clients.js` 2→3;
  - `js/pages/project-config.js` 3→4.

**Docs:** `docs/pages/config.md` (Clients & groups: esiti delle scritture, `NAME_TAKEN` nel form, `SAVED_NOT_RELOADED`); `docs/pages/costgrid.md` e `docs/pages/project-config.md` (il modal clienti scrive con `apiSave`), solo se descrivono quel modal

**Interfaces:**
- Consumes: `apiSave`, `saveAndReload`, `SAVED_NOT_RELOADED` (Task 2); `NAME_TAKEN` (Task 1).
- Produces: `export function clientGroupWrites(save) → { assignClient(groupId, clientId), removeClient(groupId, clientId) }`, su `window`. Ognuna chiama `save('PUT' | 'DELETE', '/client-groups/' + groupId + '/clients/' + clientId)` e, con un esito diverso da `ok`, lancia `new Error(res.message)`.

- [ ] **Step 1: test** in `master-clients.test.js`, `describe('clientGroupWrites')`, con un `save` finto:
  - un esito `ok` risolve e chiama `save` con `('PUT', '/client-groups/g1/clients/c1')`;
  - `{ kind: 'error', message: 'X' }` lancia `X`;
  - `{ kind: 'unknown', message: 'U' }` lancia `U`;
  - `removeClient` usa `'DELETE'`;
  - `moveClient({ clientId: 'c1', fromGroupId: 'g0', toGroupId: 'g1' }, clientGroupWrites(save))` con l'assign verso g1 `error` riprova l'assign verso g0 e lancia l'errore originale.
- [ ] **Step 2:** `npx vitest run js/lib/master-clients.test.js` → FAIL.
- [ ] **Step 3: implementa `clientGroupWrites`.**
- [ ] **Step 4: migra le pagine** come nella Spec §3.3 e §3.4:
  - `loadAll`/`reloadGroups` → `true`/`false`, e `reloadGroups` non imposta più `globalError`;
  - creazione e rinomina adottano `res.data.name`;
  - gruppi con `saveAndReload(…, () => this.reloadGroups())`, che con `ok` e `reloaded === false` impostano `globalError = window.SAVED_NOT_RELOADED`;
  - `moveTo` passa `window.clientGroupWrites(window.apiSave)`;
  - `js/clients.js`: `alert(` → `showInfo(`;
  - `saveClientModal` di project-config → `apiSave('POST', '/clients', { name })`.

  Poi cancella i metodi di `api.js`.
- [ ] **Step 5: verifica.** `npx vitest run scripts/save-contract-guard.test.js js/lib` → PASS: nessun `orphanMethods`, nessun `staleExempt`; i test di pagina sono aggiornati ai nuovi letterali, senza togliere ciò che pinnano. Poi:
  - `grep -n "Api.clients\.\(create\|update\|delete\)\|Api.clientGroups\.\(create\|rename\|delete\|assign\|remove\)" js -r` → nessun risultato;
  - `grep -rn "clients.js\"\|clients.js'" --include=*.html .` → nessun riferimento senza `?v=`.
- [ ] **Step 6: commit.** `feat(master-clients): client and group writes on the save contract`

---

### Task 4: master-pipelines

**Files:**
- Modify: `js/pages/master-pipelines.js`, `master-pipelines.html` (aggiungi `<script type="module" src="js/lib/save.js?v=3"></script>` prima di `js/pages/master-pipelines.js`, e `js/pages/master-pipelines.js` 1→2)
- Modify: `js/api.js`: cancella `Api.pipelineYears.{create,toggle,delete}` e `Api.pots.{create,update,delete}`, senza bump
- Modify: `scripts/save-contract-guard.test.js`: `js/pages/master-pipelines.js` → `RETIRED`
- Test da aggiornare (`grep -rln 'pipelineYears.create\|Api.pots.create\|savePot\|deletePipelineYear' js/lib scripts`): `js/lib/master-pipelines-pot-details.test.js` (`'creates a pipeline hidden'` passa a pinnare `apiSave('POST', '/pipeline-years', { year, active: false })`; `'keeps the server error under the row and the row open'` pinna il ramo del rifiuto che imposta `this.potf.error = res.message` senza chiudere il form), `js/lib/master-data-guard.test.js`, più ogni altro file elencato

**Docs:** `docs/pages/config.md` (Pipelines & POTs: `YEAR_HAS_POTS`/`YEAR_IN_USE` mostrati in `globalError`; creazione di un POT con la ricarica fallita → form chiuso e `SAVED_NOT_RELOADED`)

**Interfaces:**
- Consumes: `apiSave`, `saveAndReload`, `SAVED_NOT_RELOADED` (Task 2); `YEAR_HAS_POTS`, `YEAR_IN_USE` (Task 1).
- Produces: `loadPots() → Promise<boolean>`.

- [ ] **Step 1: test** in `master-pipelines-pot-details.test.js`, `describe('savePot on the save contract')`, sul sorgente del metodo come fanno i test vicini:
  - la creazione usa `saveAndReload('POST', '/pots', body, () => this.loadPots())`;
  - il ramo `res.kind === 'ok'` chiude il form (`this.potf.show = false`) prima di controllare `reloaded`, e imposta `globalError = window.SAVED_NOT_RELOADED` se `!res.reloaded`;
  - il ramo `unknown` chiude il form e mostra `res.message`;
  - nessun `Api.pots.` di scrittura nel file.
- [ ] **Step 2:** `npx vitest run js/lib/master-pipelines-pot-details.test.js` → FAIL.
- [ ] **Step 3: migra** come nella Spec §3.5.
  - Anni:
    - creazione: push di `res.data`;
    - attivazione: `py.active = res.data.active`;
    - cancellazione: rimuove l'anno solo con `ok`;
    - un rifiuto va in `globalError = res.message`;
    - `unknown` → `res.message` più `loadAll()`.
  - Modifica di un POT: `p.amount = res.data.amount`.
  - Cancellazione di un POT: con `ok`.
  - `deleteBlock` resta. Poi cancella i metodi di `api.js`.
- [ ] **Step 4: verifica.** `npx vitest run js/lib scripts/save-contract-guard.test.js` → PASS; `grep -rn "Api.pots\.\(create\|update\|delete\)\|Api.pipelineYears\.\(create\|toggle\|delete\)" js` → nessun risultato.
- [ ] **Step 5: commit.** `feat(master-pipelines): year and POT writes on the save contract`

---

### Task 5: master-currencies

**Files:**
- Modify: `js/pages/master-currencies.js`, `master-currencies.html` (`save.js?v=3` prima dello script di pagina, e `js/pages/master-currencies.js` 1→2)
- Modify: `js/api.js`: cancella `Api.currencies.{activate,updateRate}`, senza bump
- Modify: `scripts/save-contract-guard.test.js`: `js/pages/master-currencies.js` → `RETIRED`
- Test: `js/lib/master-currencies-page-guard.test.js` (`'disables Activate until currency and rate are valid…'` passa a `saveAndReload('POST', '/currencies/' …`; il rifiuto va ancora in `this.act.error`, mai in `globalError`), più ogni altro file elencato da `grep -rln 'currencies.activate\|updateRate' js/lib scripts`

**Docs:** `docs/pages/config.md` (Currencies: tasso adottato dalla risposta, `SAVED_NOT_RELOADED` invece di "Failed to load")

**Interfaces:**
- Consumes: `saveAndReload`, `SAVED_NOT_RELOADED` (Task 2).
- Produces: `loadAll({ quiet } = {}) → Promise<boolean>`; con `quiet: true` non imposta `globalError`.

- [ ] **Step 1: test** in `master-currencies-page-guard.test.js`, `describe('rate save on the save contract')`, sul sorgente di `confirmRate`:
  - contiene `saveAndReload('PATCH'` e `this.loadAll({ quiet: true })`;
  - `current_rate = res.data.rate` compare prima del controllo di `res.reloaded`;
  - `SAVED_NOT_RELOADED` va in `globalError`;
  - un rifiuto va in `this.confirm.error = res.message`.

  Lo stesso schema per `activateCurrency`, con l'adozione di `res.data` e `this.act.error`.
- [ ] **Step 2:** `npx vitest run js/lib/master-currencies-page-guard.test.js` → FAIL.
- [ ] **Step 3: migra** come nella Spec §3.6, poi cancella i metodi di `api.js`.
- [ ] **Step 4: verifica.** `npx vitest run js/lib scripts/save-contract-guard.test.js` → PASS.
- [ ] **Step 5: commit.** `feat(master-currencies): rate writes on the save contract`

---

### Task 6: team

**Files:**
- Modify: `js/lib/team-ui.js` (nuova `changedResourceFields`); Test: `js/lib/team-ui.test.js`
- Modify: `js/pages/team.js`
- Modify: `team.html`:
  - `save.js?v=3` prima di `js/pages/team.js`;
  - `js/pages/team.js` 1→2;
  - `js/lib/team-ui.js` +1, anche in `attribute-lists.html` e in ogni altra pagina che lo carica.
- Modify: `scripts/save-contract-guard.test.js`: `js/pages/team.js` → `RETIRED`
- Create: `js/lib/master-data-save-guard.test.js` (il blocco di team)
- Test: `js/lib/team-page-guard.test.js`, adeguato dove pinna `fetch(` o `res.json()`

**Docs:** `docs/pages/team.md` (letture e scritture da `apiFetch`/`apiSave`; `PATCH` dei soli campi cambiati e "No changes."; alias: 200/201 stesso banner, 409 `ALREADY_RESOLVED` → messaggio più ricarica della coda); `docs/api/resources.md` (come il client tratta `ALREADY_RESOLVED`)

**Interfaces:**
- Consumes: `apiSave`, `SAVED_NOT_RELOADED` (Task 2).
- Produces: `export function changedResourceFields(initial, form) → object`. Restituisce solo le chiavi fra `firstName`, `lastName`, `email`, `roleId`, `jobDescription` e `userId` il cui valore è diverso, con `null`, `undefined` e `''` considerati uguali; `{}` se nessuna è cambiata. Su `window`.

- [ ] **Step 1: test.**
  - In `team-ui.test.js`, `describe('changedResourceFields')`:
    - nessuna differenza → `{}`;
    - solo `email` cambiata → `{ email: 'new@x' }`;
    - `jobDescription` da `null` a `''` → `{}`;
    - `userId` da `'u1'` a `null` → `{ userId: null }`;
    - campi diversi dai sei, per esempio `status` ed `errors`, ignorati.
  - In `master-data-save-guard.test.js`, `describe('team.js')` sul sorgente:
    - nessun `fetch(` e nessun `res.json()`;
    - le scritture di `postAlias`, `removeAlias`, `rescan`, `submitForm`, `toggleStatus` e `deleteResource` usano `apiSave(`;
    - `submitForm` usa `changedResourceFields(`;
    - nessuna stringa `'Network error.'`.
- [ ] **Step 2:** `npx vitest run js/lib/team-ui.test.js js/lib/master-data-save-guard.test.js` → FAIL.
- [ ] **Step 3: implementa `changedResourceFields`, poi migra `team.js`** come nella Spec §3.7.
  - `openEdit` salva `form.initial`.
  - In modifica, `submitForm` invia `changedResourceFields(form.initial, form)`. Con `{}` chiude il drawer e imposta `setBanner('success', 'No changes.')`, senza richiesta.
  - Con `ok` la risorsa in lista prende `res.data`, poi parte `loadResources()`. Se la ricarica fallisce, il banner d'errore è `SAVED_NOT_RELOADED`.
  - `postAlias` con `res.kind === 'error' && res.status === 409`: `setUnmatchedError(res.message)`, poi `loadUnmatched()`.
  - Letture: `apiFetch(path)` senza `/api`, dentro `try/catch`, con `e.message` come testo.
- [ ] **Step 4: verifica.** `npx vitest run js/lib scripts/save-contract-guard.test.js` → PASS; `grep -n "fetch(" js/pages/team.js` → solo `apiFetch(`.
- [ ] **Step 5: commit.** `feat(team): reads and writes through apiFetch and apiSave`

---

### Task 7: attribute-lists

**Files:**
- Modify: `js/pages/attribute-lists.js`, `attribute-lists.html` (`save.js?v=3` prima dello script di pagina, e `js/pages/attribute-lists.js` 1→2)
- Modify: `js/lib/master-data-save-guard.test.js` (blocco di attribute-lists)
- Test: `js/lib/attribute-lists-page-guard.test.js`, adeguato dove pinna `request(`, `errorText(` o `r.ok`

**Docs:** `docs/pages/attribute-lists.md` (`request()` sostituito da `apiSave` per le scritture e da `read()` su `apiFetch` per le letture; i banner di ricarica restano)

**Interfaces:**
- Consumes: `apiSave` (Task 2).
- Produces: il metodo di pagina `read(path) → Promise<{ ok: boolean, data, message }>`, che non lancia mai.

- [ ] **Step 1: test.** In `master-data-save-guard.test.js`, `describe('attribute-lists.js')`:
  - nessun `fetch(`, nessun `request(` e nessun `errorText(`;
  - ogni `POST` e `PATCH` verso `/attribute-lists` o `/topics` passa da `apiSave(`;
  - i testi `"couldn't be reloaded"` e `'The list was reloaded. Server: '` ci sono ancora.
- [ ] **Step 2:** `npx vitest run js/lib/master-data-save-guard.test.js` → FAIL.
- [ ] **Step 3: migra** come nella Spec §3.8, chiamante per chiamante:
  - `r.ok` → `res.kind === 'ok'`;
  - `r.data` → `res.data`;
  - `errorText(r)` → `res.message`;
  - le letture passano da `this.read(path)`.
- [ ] **Step 4: verifica.**
  - `npm test` → PASS, guard compresi.
  - `cd api && npm test` → PASS.
  - `scripts/run-tests.sh` → verde (il backend è cambiato nel Task 1), nessun `Unexpected error`.
  - `npx vitest run scripts/doc-paths-guard.test.js scripts/claude-md-guard.test.js scripts/decision-ledger-guard.test.js` → PASS.
- [ ] **Step 5: commit.** `feat(attribute-lists): writes through apiSave, reads through apiFetch`

## Criteri di accettazione

Quelli della Spec (`docs/superpowers/specs/2026-11-19-save-c6-master-data-pages-design.md`, `## Criteri di accettazione`), da 1 a 11. Li coprono:
- **Task 1:** criteri 3, 4 e 6 (`MDR-08`);
- **Task 2:** criterio 1 (vitest);
- **Task 3-7:** criterio 8;
- **Task 7, Step 4:** criteri 9 e 10.

I criteri 1, 2 e 5-7 si verificano a mano sullo stack di branch, al Gate 2; il criterio 11 al Gate 5.

## Decisioni aperte

1. **Le fixture di `test-api.js` con nomi fissi ricevono un suffisso `${Date.now()}`.** Alternativa scartata: pulirle prima di ogni run. Perché: il suffisso le rende indipendenti dai dati rimasti su uno stack di branch, che conserva il DB.
2. **`clientGroupWrites` e `changedResourceFields` sono funzioni pure in `js/lib/`.** Alternativa scartata: logica dentro i metodi di pagina, provata solo da test sul sorgente. Perché: la Review Focus 3 e 4 si possono testare con input veri.
3. **Esecuzione subagent-driven in sequenza.** Alternativa scartata: nativa. Perché: sette task, una migrazione, più di cinque file di produzione (§6.1 "ciclo grande"); i task non sono indipendenti, quindi i dispatch vanno uno alla volta.
