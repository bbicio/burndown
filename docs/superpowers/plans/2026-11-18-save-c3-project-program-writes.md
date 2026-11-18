# Contratto di salvataggio, ciclo 3: scritture di progetti e programmi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un progetto si salva tutto o niente, con la sua versione, e un salvataggio fallito non lo ricrea mai. Generate e Add tasks diventano operazioni transazionali del server, ciascuna insieme al proprio link. La condivisione di un programma è atomica e non abbassa mai un permesso.

**Architecture:** Lato server, un nuovo servizio `api/src/services/project-save.js` valida e scrive testata e sezioni dentro un `versionedWrite`. Lo usano `PUT /api/projects/:id` e le due route nuove di `cost-grids.js` (Generate, Add tasks). Le route vecchie di testata e di sezione vengono tolte.

Lato client, il modulo puro `js/lib/project-draft.js` calcola cosa è cambiato. `js/api-sync.js` espone tre funzioni `apiSave`, che sostituiscono `_pushProjectToApiDetailed` e il suo fallback POST.

**Tech Stack:** Node 24, Express, `pg`, `node:test`; Vue 3 da CDN, vitest 4 + jsdom; PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-11-18-save-c3-project-program-writes-design.md`
**Branch:** `save-c3-project-program-writes`
**Risk class:** high-risk — autenticazione o permessi (permessi di progetto, condivisione dei programmi); money (rate, phasing, ptc); file condivisi caricati da più pagine (`js/api-sync.js`, `js/api.js`, `js/costgrid.js`, `js/core.js`, `js/shares.js`)

**Task indipendenti:** no.

- I Task 2-4 consumano le entità e il rango del Task 1.
- Il Task 3 consuma `applyTasks`/`applyCreate` del Task 2.
- Il Task 6 consuma le route dei Task 2-4 e il modulo del Task 5.
- Il Task 7 consuma le funzioni del Task 6 e chiude il guard lato client.

## Global Constraints

- **Save del progetto:** `PUT /api/projects/:id`, body `{ version, header?, tasks?, phasing?, ptc?, planning?, groups? }`.
- **Campi di `header` ammessi:** `name, code, programId, clientId, startDate, endDate, currency, pipeline, status, description, cgVersionId`. Un altro campo riceve `400 { error: 'Unknown field: <name>' }`. Un body senza `header` né sezioni riceve `400 { error: 'Nothing to update' }`. Un `clientId`/`cgVersionId` non UUID e non vuoto riceve `400 { error: '<key> must be a valid UUID' }` (come oggi).
- **Ordine delle risposte prima della transazione:** `:id` non UUID → 400 `Invalid project id`; riga assente → `404 { error: 'Project not found' }`; nessun permesso di modifica → `403 { error: 'Access denied' }`.
- **Conflitto:** `409 { error: 'This project was changed by someone else since you opened it.', code: 'STALE', version }`. Per un programma il messaggio è `This program was changed by someone else since you opened it.`
- **Generate:** `POST /api/cost-grids/:id/versions/:vId/projects`, body `{ name, code, programId, clientId, startDate, endDate, description, tasks, ptc, taskIds, taskNames }` → `201` con la fotografia del progetto.
- **Add tasks:** `POST /api/cost-grids/:id/versions/:vId/projects/:projectId/tasks`, body `{ tasks, taskIds, taskNames }` → `200` con la fotografia del progetto.
- **Fotografia di `project`:** la forma di un elemento di `GET /api/projects`, più `version`, `tasks` e `links: [{ versionId, taskIds, taskNames }]`.
- **Codici delle regole invariati:** `PROJECT_RULE`, `DATE_RULE`, `MONEY_RULE`, con gli stessi messaggi di oggi.
- **Ordine dei lock:** `lockVersion(client, vId)` prima della riga di `projects`, ovunque. Attenzione: `versionedWrite` prende la riga per prima, quindi nelle route che prendono il lock di versione si chiama `lockVersion` **prima** di `versionedWrite(client, …)`, dentro la stessa transazione (`withTransaction`).
- **Rango dei permessi:** `owner` > `editor` > `viewer`. La condivisione di un programma risponde `{ ok, shared, granted, raised, kept, emailSent }`.
- **Testi utente, alla lettera:**
  - Reload di project-config: `Discard your unsaved changes and reload this project?`;
  - messaggio della condivisione: `Shared <n> project(s)` seguito da `; <k> kept their higher access.` quando `kept > 0`.
- **Testi utente in inglese.** Nessun colore fisso.
- **Cache-busting:** ogni file versionato modificato aggiorna ogni suo `?v=N` in tutte le pagine che lo caricano (grep sul path). `js/lib/project-draft.js` nasce `?v=1`. `js/lib/save.js` va aggiunto alle pagine che non lo caricano ancora, con il `?v=` in uso.
- **Infrastruttura:**
  - nessun `docker compose` sul main stack;
  - nessuna migrazione;
  - `test-api.js` gira con `scripts/run-tests.sh`.
- **Ogni task aggiorna i documenti della sua riga `**Docs:**` nello stesso commit.**

## Review Focus

1. **Periodo stretto e phasing spostato nello stesso Save.** Chi restringe il periodo e sposta il phasing nei mesi nuovi si aspetta un solo Save riuscito. Oggi il phasing è validato sul periodo vecchio (SY-10). Lo pinna il Task 2, `PS-06`.
2. **Save da project-config aperto prima che la cost grid cambiasse lo stage.** La propagazione dello stage fa salire la versione del progetto, quindi il Save riceve 409 e non riporta indietro lo stage. Lo pinna il Task 2, `PS-08`.
3. **Add tasks su un progetto collegato solo tramite `projects.cg_version_id`, senza riga di link.** La riga si crea, con il controllo di valuta. Lo pinna il Task 3, `AT-04`.
4. **Condivisione di un programma a chi è owner di uno dei progetti.** Resta owner. Lo pinna il Task 4, `PG-03`.
5. **Generate con esito `unknown` (timeout).** La memoria non riceve il progetto e il messaggio dice di ricaricare, senza un secondo Generate automatico. Lo pinna il Task 7, test `an unknown Generate outcome adds nothing to memory`.

---

### Task 1: entità `project` allargata, entità `program`, rango dei permessi

**Files:**
- Modify: `api/src/services/saved-entities.js` (`projectSnapshot`; nuove `programSnapshot` ed entità `program`)
- Create: `api/src/lib/share-rank.js`
- Test: `api/src/lib/share-rank.test.js`

**Docs:** `docs/api/services.md` (fotografia di `project` con `tasks` e `links`; entità `program`), `docs/api/lib.md` (`share-rank.js`)

**Interfaces:**
- Produces:
  - `entities.project.snapshot(client, id)` → `{ ...colonne di GET /api/projects, version, tasks: [ …colonne di GET /:id/tasks ], links: [{ versionId, taskIds, taskNames }] }`, oppure null;
  - `entities.program` = `{ table: 'programs', staleMessage, notFoundMessage: 'Program not found', snapshot }`. `snapshot(client, id)` → `{ id, name, version, shares: [{ projectId, userId, permission }] }`, dove `shares` copre i progetti con `program_id = id`;
  - `PERMISSION_RANK = { viewer: 1, editor: 2, owner: 3 }` e `higherPermission(current, next) → string` (il più alto dei due; `current` null → `next`), esportati da `share-rank.js`; `RANK_SQL(col)`, un `CASE` SQL con gli stessi ranghi, perché la route non duplichi la scala.

- [ ] **Step 1: Write the failing tests** in `share-rank.test.js`:
  - `higherPermission keeps owner over viewer` → `higherPermission('owner','viewer') === 'owner'`;
  - `higherPermission raises viewer to editor` → `'editor'`;
  - `higherPermission with no current returns next` → `higherPermission(null,'viewer') === 'viewer'`;
  - `RANK_SQL names the three ranks` → la stringa contiene `'owner' THEN 3`, `'editor' THEN 2` e `'viewer' THEN 1`.
- [ ] **Step 2:** `cd api && node --test src/lib/share-rank.test.js` → FAIL (modulo assente).
- [ ] **Step 3: Implement** `share-rank.js` e le due fotografie. Per `projectSnapshot` riusa la lista di colonne di `GET /api/projects` (`projects.js:100-135`). Estraila in una costante condivisa `PROJECT_COLUMNS` in `saved-entities.js`, importata dalla route nel Task 2.
- [ ] **Step 4:** `cd api && node --test src/lib/share-rank.test.js src/services/versioned-write.test.js` → PASS.
- [ ] **Step 5: Commit** — `feat(save): project snapshot with tasks and links, program entity, share rank`

### Task 2: `PUT /api/projects/:id`, route vecchie tolte, `POST`/`DELETE` dentro `versionedWrite`

**Files:**
- Create: `api/src/services/project-save.js`
- Modify: `api/src/routes/projects.js`:
  - nuova `PUT /:id`;
  - tolte `PATCH /:id` :208, `PUT /:id/tasks` :418, `PATCH /:id/{phasing,ptc,planning,groups}` :529-651;
  - `POST /` :157 e `DELETE /:id` :373 dentro `versionedWrite`;
  - `GET /` e `GET /:id` con `version` e `links`.
- Test: `test-api.js` (helper `saveProjectLegacy`; nuova `testProjectSave()` con `PS-01..PS-10`)

**Docs:** nessun file `docs/api/` per `projects.js` (CLAUDE.md): il commento in testa a `PUT /:id`, `handbook/restricted/ARCHITECTURE.md` (route tolte, se §5/§6 le nominano: lo verifica `scripts/architecture-guard.test.js`), CLAUDE.md "Project currency lock" (le regole sono chiamate da `PUT /api/projects/:id` e non più da `PATCH`), `handbook/restricted/TEST_CASES.md` (casi `PS-*`, se il file elenca i casi di `test-api.js`)

**Interfaces:**
- Consumes: Task 1; `ruleError` da `api/src/services/cost-grid-save.js`; `lockVersion` da `api/src/lib/version-lock.js`.
- Produces, in `project-save.js`:
  - `PROJECT_HEADER_FIELDS` (l'elenco dei Global Constraints);
  - `projectSaveBodyError(body) → string|null` (campo sconosciuto, nulla da aggiornare, UUID);
  - `applyProjectSave(client, id, body, { role }) → { enqueue: boolean, seedFromVersionId: string|null, codes: string[] }`. Applica §2.2 della Spec sullo stato finale e lancia `ruleError` per ogni regola. `codes` sono i codici di progetto da mettere in coda dopo il commit;
  - `applyTasks(client, projectId, tasks, { currency, period, append }) → { descriptionsChanged }`. Valida (`taskListError`, sold hours, `amountError`, `taskDatesError` contro `period` sull'elenco finale) e scrive; con `append: true` inserisce dopo l'ultimo `sort_order` senza cancellare;
  - `applySections(client, projectId, { phasing, ptc, planning, groups }, { currency, period, stored })` → valida e scrive le sezioni presenti.

- [ ] **Step 1: Write the failing test-api cases** in `testProjectSave()`, su un progetto creato da sysadmin come i `PR-*`:
  - `PS-01` — `PUT` con `{ version, header: { name: 'x' } }` → 200, `version` +1, una riga `project`/`update` in `change_log` con `snapshot.tasks` e `snapshot.links`;
  - `PS-02` — progetto cancellato (`DELETE` da sysadmin) poi `PUT` → 404 `Project not found`; `GET /api/projects` non lo contiene;
  - `PS-03` — due `PUT` dalla stessa versione → il secondo `409 STALE`, e il nome del primo resta;
  - `PS-04` — `{ header: { name: 'y' }, tasks: [valido], phasing: { '<mese fuori periodo>': 1 } }` → 400 `DATE_RULE`; nome, task e phasing invariati, nessuna riga nuova nel registro;
  - `PS-05` — `header.linkedProjects` → 400 `Unknown field: linkedProjects`; body `{ version }` → 400 `Nothing to update`;
  - `PS-06` — nello stesso `PUT`, periodo ristretto e phasing nei soli mesi nuovi → 200;
  - `PS-07` — utente senza permesso su un progetto esistente → 403;
  - `PS-08` — progetto collegato a una versione: un Save della cost grid che cambia lo stage, poi `PUT` dalla versione letta prima → 409, e `projects.pipeline` resta lo stage nuovo;
  - `PS-09` — `GET /api/projects` restituisce `version` intero e `links`;
  - `PS-10` — `POST /api/projects` e `DELETE /api/projects/:id` lasciano `create` e `delete` in `change_log`.

  Aggiungi a `versionOf` il ramo `/api/projects/:id`, che legge la versione da `GET /api/projects/:id`. Aggiungi `saveProjectLegacy(method, path, body, cookie)`, che traduce le chiamate alle route tolte su `PUT /api/projects/:id`:
  - `PATCH /api/projects/:id` → `header`;
  - `PUT …/tasks` (array, oppure `{ tasks, period }`) → `tasks` più `header.startDate/endDate`;
  - `PATCH …/{phasing,ptc,planning,groups}` → la sezione.

  Sostituisci con `saveProjectLegacy` ogni chiamata del file alle route tolte (`grep -nE "'PATCH', \`/api/projects/|/api/projects/[^\`]*/(tasks|phasing|ptc|planning|groups)\`" test-api.js`, escludendo i `GET`).
- [ ] **Step 2:** `cd api && npm test && cd .. && node --check test-api.js && scripts/run-tests.sh` → FAIL su `PS-*`.
- [ ] **Step 3: Implement.** Sposta in `project-save.js` la logica delle route tolte. Le regole lanciano `ruleError` invece di fare `ROLLBACK`/`return`, e girano una volta sola sul periodo unito e sull'elenco finale dei task. La route è: UUID → riga esiste (404) → `canEdit` (403) → `projectSaveBodyError` (400) → `withTransaction`:
  1. `lockVersion` se `header.cgVersionId` cambia;
  2. `versionedWrite(client, { type: 'project', id, expectedVersion: body.version, userId, action: 'update', write: c => applyProjectSave(c, id, body, { role }) })`.

  Le risposte d'errore passano da `respondSaveError` o, per `ruleError`, da `400 { error, code }`. Dopo il commit: `enqueueProjectsQuiet(codes)` e `copyVersionTagsToProject` se `seedFromVersionId`. La risposta è la fotografia.
- [ ] **Step 4:** `cd api && npm test && cd .. && node --check test-api.js && scripts/run-tests.sh` → PASS: `PS-*`, `PR-01..PR-14` e il resto della suite tramite `saveProjectLegacy`.
- [ ] **Step 5: Commit** — `feat(projects): one transactional versioned Save route; old header and section routes removed`

### Task 3: Generate e Add tasks lato server, link per unione

**Files:**
- Modify: `api/src/routes/cost-grids.js`:
  - nuove `POST /:id/versions/:vId/projects` e `POST /:id/versions/:vId/projects/:projectId/tasks`;
  - `POST …/linked-projects` :636 per unione e dentro `versionedWrite`;
  - `DELETE …/linked-projects/:projectId` :666 dentro `versionedWrite`.
- Modify: `api/src/services/project-save.js` (`applyCreate`)
- Test: `test-api.js` (`testGenerateAndAddTasks()` con `GP-01..05`, `AT-01..05`, `LK-01..02`)

**Docs:** `docs/pages/costgrid.md` (Generate e Add tasks: una richiesta ciascuno), CLAUDE.md "Project currency lock" (la lista delle route di `cost-grids.js` comprende le due nuove)

**Interfaces:**
- Consumes: Task 1, `applyTasks` del Task 2, `projectCreateError`/`linkCurrencyError` di `api/src/lib/project-rules.js`.
- Produces:
  - `applyCreate(client, { body, version, userId, role }) → { id }`: la creazione di §2.3 della Spec dentro `versionedWrite(…, action: 'create', write)`. Prende valuta e stage da `version`;
  - `upsertLink(client, versionId, projectId, taskIds, taskNames)`: unione, con l'ordine conservato e senza duplicati;
  - le risposte delle due route come nei Global Constraints.

- [ ] **Step 1: Write the failing test-api cases:**
  - `GP-01` — Generate valido da admin → 201; il progetto ha la valuta della versione, i task, il ptc, la riga di link con `taskIds`, i tag della versione e una riga `project`/`create`;
  - `GP-02` — Generate con un task fuori periodo → 400 `DATE_RULE`; nessun progetto con quel nome e nessuna riga di link;
  - `GP-03` — Generate da un utente senza permesso sulla grid → 403;
  - `GP-04` — Generate con `currency: 'CHF'` nel body su una versione EUR → il progetto è EUR;
  - `GP-05` — Generate con una tariffa con troppi decimali → 400 `MONEY_RULE`, nessun progetto;
  - `AT-01` — Add tasks dopo un `PUT` che cambia nome e stato → nome e stato restano quelli del `PUT`, i task sono vecchi più nuovi, il link contiene l'unione;
  - `AT-02` — Add tasks con un task fuori dal periodo **registrato** → `DATE_RULE`, nessun task e nessun id aggiunto al link;
  - `AT-03` — Add tasks senza permesso sul progetto → 403;
  - `AT-04` — progetto con `cg_version_id` ma senza riga in `cg_version_projects` → la riga si crea;
  - `AT-05` — una riga `project`/`update` per Add tasks, e la `version` del progetto +1;
  - `LK-01` — `POST …/linked-projects` due volte con `[A]` e poi `[B]` → `task_ids` è `[A, B]`;
  - `LK-02` — `PR-03` e i test delle regole di struttura restano verdi con l'unione.
- [ ] **Step 2:** `cd api && npm test && cd .. && node --check test-api.js && scripts/run-tests.sh` → FAIL su `GP-*`, `AT-*`, `LK-01`.
- [ ] **Step 3: Implement.** Entrambe le route: `canEdit` sulla grid (e, per Add tasks, sul progetto con lo stesso controllo di `projects.js`, esportato da lì come `canEditProject`) → `withTransaction`: `lockVersion(client, vId)` → `versionedWrite`. Generate usa `create`; Add tasks usa `unchecked`, `update`, con `applyTasks({ append: true })` più `upsertLink`. Dopo il commit, la coda del profilo. Il `POST` del link usa `upsertLink` dentro `versionedWrite(project, unchecked)`.
- [ ] **Step 4:** `cd api && npm test && cd .. && node --check test-api.js && scripts/run-tests.sh` → PASS.
- [ ] **Step 5: Commit** — `feat(cost-grids): atomic Generate and Add tasks routes; version-project link merges task lists`

### Task 4: programmi, guard lato server

**Files:**
- Modify: `api/src/routes/config.js` (`POST /programs` :77, `PATCH /programs/:id` :99, `POST /programs/:id/share` :129, `DELETE /programs/:id` :209)
- Modify: `scripts/save-contract-guard.test.js`:
  - `SERVER_EXEMPT` senza `api/src/routes/projects.js: projects` e `api/src/routes/config.js: programs`, che vanno in `RETIRED`;
  - `REGISTERED_TABLES` + `project_tasks`, `cg_version_projects`;
  - `SAVE_STEPS` + `api/src/services/project-save.js: ['applyProjectSave', 'applyTasks', 'applySections', 'applyCreate', 'upsertLink']`.
- Test: `test-api.js` (`PG-01..05` in `testPrograms()`)

**Docs:** `docs/api/config.md` (programmi: creazione registrata, condivisione atomica che non abbassa, nuovi campi della risposta)

**Interfaces:**
- Consumes: Task 1 (`entities.program`, `RANK_SQL`).
- Produces: la risposta della condivisione `{ ok, shared, granted, raised, kept, emailSent }`.

- [ ] **Step 1: Write the failing test-api cases:**
  - `PG-01` — `POST /programs` → 201 e una riga `program`/`create`;
  - `PG-02` — condivisione a un utente già editor di un progetto del programma, come viewer → resta editor; `kept` vale 1;
  - `PG-03` — condivisione a chi è owner di un progetto del programma → la riga resta `owner`;
  - `PG-04` — condivisione come editor a chi è viewer → diventa editor; `raised` vale 1; per un utente nuovo `granted` è uguale al numero di progetti;
  - `PG-05` — una riga `program`/`update` per ogni condivisione, con `snapshot.shares`.

  Il guard: `npx vitest run scripts/save-contract-guard.test.js` deve passare con le liste nuove.
- [ ] **Step 2:** `scripts/run-tests.sh` → FAIL su `PG-*`.
- [ ] **Step 3: Implement.** Create: `versionedWrite(pool, { type: 'program', action: 'create' })`. Share: i controlli di oggi, poi un solo `versionedWrite(pool, { type: 'program', id, unchecked: true, action: 'update' })`. Dentro, un upsert per progetto con `DO UPDATE SET permission = CASE WHEN <RANK_SQL(EXCLUDED.permission)> > <RANK_SQL(resource_shares.permission)> THEN EXCLUDED.permission ELSE resource_shares.permission END` e `RETURNING (xmax = 0) AS inserted, permission`, confrontato con il valore chiesto per contare `granted`/`raised`/`kept`. Email e notifica dopo il commit. Patch e delete: `unchecked`.
- [ ] **Step 4:** `scripts/run-tests.sh && npx vitest run scripts/save-contract-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `feat(programs): registered create and atomic share that never lowers a permission`

### Task 5: `js/lib/project-draft.js`

**Files:**
- Create: `js/lib/project-draft.js`
- Test: `js/lib/project-draft.test.js`

**Docs:** `docs/js/lib.md` (`project-draft.js`)

**Interfaces:**
- Produces, ES module con ponte su `window`:
  - `projectSavable(project) → { header, tasks, phasing, ptc, planning, groups }`. `header` contiene i campi dei Global Constraints; `costGridRef.versionId` → `cgVersionId`; `clientId` non UUID → `null`; le entry dei gruppi con `role` vuoto vengono tolte;
  - `projectChanges(base, draft) → { header?, tasks?, phasing?, ptc?, planning?, groups? }`, con le sole parti cambiate (confronto con `JSON.stringify` per sezione, campo per campo per `header`);
  - `projectIsDirty(base, draft) → boolean`.

- [ ] **Step 1: Write the failing tests:**
  - `unchanged project has no changes` → `projectChanges(p, clone(p))` è `{}`;
  - `a changed name sends only header.name` → `{ header: { name: 'B' } }`;
  - `pipeline is absent when unchanged`, anche se `status` cambia;
  - `a changed phasing sends phasing only`;
  - `__unassigned__ clientId becomes null`;
  - `costGridRef becomes cgVersionId and is not sent when unchanged`;
  - `blank group entries are dropped before comparing`.
- [ ] **Step 2:** `npx vitest run js/lib/project-draft.test.js` → FAIL.
- [ ] **Step 3: Implement** le tre funzioni.
- [ ] **Step 4:** `npx vitest run js/lib/project-draft.test.js` → PASS.
- [ ] **Step 5: Commit** — `feat(project-config): pure project draft diff`

### Task 6: `js/api-sync.js` e il Save di project-config

**Files:**
- Modify: `js/api-sync.js`:
  - `_apiProjectToLocal` porta `version` e `links`;
  - nuove `_saveProject`, `_generateProject`, `_addTasksToProject`;
  - tolte `_pushProjectToApiDetailed`, `_pushProjectToApi`, `_deleteProjectFromApi`;
  - intestazione del file aggiornata.
- Modify: `js/pages/project-config.js` (`onSave` :595, `saveProgramModal` :677, nuova azione Reload)
- Modify: `project-config.html` (Reload nell'area d'errore; tag di `project-draft.js` e `save.js`)
- Modify: `js/core.js:122` (commento di `persistConfig`)
- Modify: `js/lib/project-push-result.js` (via `summarizePushResult`)
- Test: `js/api-sync.test.js`, `js/lib/api-sync-push-project.test.js` (riscritto come `js/lib/api-sync-project-save.test.js`), `js/lib/project-push-result.test.js`

**Docs:** `docs/js/api-sync.md`, `docs/pages/project-config.md`, `docs/js/core.md` se nomina `_pushProjectToApi`, CLAUDE.md "Key sync functions" (righe `_saveProject`, `_generateProject`, `_addTasksToProject`, senza `_pushProjectToApi*`, fallback e `skipEmpty`) e "Data strategy", `handbook/public/manual.md` (Save di project-config: conflitto e Reload)

**Interfaces:**
- Consumes: Task 2-3 (route), Task 5 (`projectChanges`), `apiSave`.
- Produces:
  - `_saveProject(base, draft) → Promise<outcome>` (l'esito di `apiSave`). Con `ok`, `outcome.project = _apiProjectToLocal(outcome.data)`;
  - `_generateProject(cgId, vId, body) → Promise<outcome>`, con `outcome.project` su `ok`;
  - `_addTasksToProject(cgId, vId, projectId, body) → Promise<outcome>`, con `outcome.project` su `ok`.

- [ ] **Step 1: Write the failing tests** (vitest, `apiFetch` simulato come in `js/lib/api-sync-save.test.js`):
  - `a 404 on save never issues a POST` → un solo `PUT`, esito `error` con `Project not found`;
  - `a 500 shows its own message` → esito `unknown`, nessun `POST`;
  - `save sends version and only the changed parts`;
  - `ok adopts the server snapshot` → `outcome.project.version` è quella della risposta;
  - project-config: `conflict shows the message and a Reload action`; `ok replaces the project in config.projects and navigates`.
- [ ] **Step 2:** `npx vitest run js/api-sync.test.js js/lib/api-sync-project-save.test.js js/lib/project-push-result.test.js` → FAIL.
- [ ] **Step 3: Implement.** La base di project-config è `projectSavable` del progetto caricato. Esiste già `savedSnapshot`: la base si ricava da lì. `onSave` mantiene i controlli lato pagina, poi chiama `_saveProject` e tratta gli esiti come §3.3 della Spec. Reload chiede la conferma dei Global Constraints e ricarica la pagina. `saveProgramModal` usa `apiSave('POST', '/programs', { id, name })`.
- [ ] **Step 4:** stesso comando → PASS.
- [ ] **Step 5: Commit** — `feat(project-config): versioned all-or-nothing Save; no POST fallback`

### Task 7: costgrid Generate/Add tasks, condivisione del programma, `Api.*`, guard lato client

**Files:**
- Modify: `js/costgrid.js` (`cgDoAddTasksToProject` :1166, `cgDoGenerateProject` ~:1370-1470)
- Modify: `js/pages/costgrid.js` (`saveCreateProgramModal` :446)
- Modify: `js/shares.js` (condivisione del programma :276)
- Modify: `js/api.js` (via i metodi del §3.6 della Spec)
- Delete: `js/lib/project-push-result.js` e `js/lib/project-push-result.test.js`, se `summarizeGenerateResult` resta senza chiamanti; togli i loro tag da `costgrid.html`, `pipeline.html`, `project-config.html`, e l'import da `js/lib/costgrid-copy-period.test.js`
- Modify: `scripts/save-contract-guard.test.js` (`CLIENT_EXEMPT` per scrittura per `js/pages/project-config.js` e `js/shares.js`; voci ritirate in `RETIRED`)
- Modify: ogni pagina che carica i file versionati toccati (cache-busting)
- Test: `js/lib/costgrid-add-tasks.test.js`, `js/lib/costgrid-copy-period.test.js`, nuovo `js/lib/costgrid-generate.test.js`, `js/lib/shares-program.test.js`

**Docs:** `docs/pages/costgrid.md`, `docs/js/costgrid.md`, `docs/js/shared-libs.md` (`shares.js`: i conteggi della condivisione), `docs/js/lib.md` (via `project-push-result.js`), `handbook/public/manual.md` (condivisione di un programma), `handbook/restricted/TEST_CASES.md`

**Interfaces:**
- Consumes: Task 6.

- [ ] **Step 1: Write the failing tests:**
  - `Generate adds the project to memory only on ok` → con l'esito `rule`, `config.projects` e `_cgDraft.linkedProjects` invariati e `showInfo` con il messaggio;
  - `an unknown Generate outcome adds nothing to memory` → `showInfo` con `UNKNOWN_MESSAGE`, una sola richiesta;
  - `Add tasks sends only the new tasks` → il body contiene solo i task nuovi più `taskIds`/`taskNames`, e nessun `name`/`status`;
  - `Add tasks failure leaves the link in memory unchanged`;
  - `program share message counts kept` → `Shared 3 projects; 2 kept their higher access.`;
  - guard: `npx vitest run scripts/save-contract-guard.test.js` passa senza le voci per file di `project-config.js` e `shares.js`.
- [ ] **Step 2:** `npx vitest run js/lib/costgrid-add-tasks.test.js js/lib/costgrid-generate.test.js js/lib/shares-program.test.js scripts/save-contract-guard.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - **Generate:** costruisce il body dei Global Constraints senza `id`, `currency` e `pipeline`, e chiama `_generateProject`. Solo su `ok`: push in `config.projects`, link in `_cgDraft`/`_cgStore` dalla risposta, poi il successo e "Open configuration?".
  - **Add tasks:** solo i task nuovi; su `ok`, `config.projects` adotta il progetto e il link in memoria prende i `links` della risposta.
  - **Programmi:** creazione con `apiSave` in `js/pages/costgrid.js`; in `shares.js`, condivisione con `apiSave` e il messaggio dei Global Constraints.
  - **Pulizia:** cancella i metodi `Api.*` del §3.6, poi esegui i bump di cache-busting con grep su ogni path toccato.
- [ ] **Step 4:** stesso comando, poi `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(costgrid): Generate and Add tasks wait for one server answer; program share reports kept access`

---

## Self-review

- **Copertura della Spec:**
  - §2.1 → Task 1;
  - §2.2, 2.7, 2.8, 2.9 → Task 2;
  - §2.3-2.5 → Task 3;
  - §2.6 e §4 lato server → Task 4;
  - §3.1 → Task 5;
  - §3.2, 3.3 → Task 6;
  - §3.4-3.6, §4 lato client e §5 → Task 7;
  - §6 → righe `Docs:`.
- **Criteri di accettazione:**
  - 1 → PS-02 e il test vitest del Task 6;
  - 2 → Task 6;
  - 3 → PS-03;
  - 4 → PS-04;
  - 5 → AT-01 più la verifica a mano;
  - 6 → Task 7 e GP-02;
  - 7 → PG-02..04;
  - 8 → GP-03 e il guard;
  - 9 → PS-01, GP-01, AT-05, PG-01, PG-05;
  - 10 → Task 5;
  - 11 → Task 4 e Task 7;
  - 12 → Gate 1;
  - 13 → `Docs:`;
  - 14 → Gate 5.

## Decisioni aperte

1. **`project-save.js` è un servizio nuovo, condiviso da `projects.js` e `cost-grids.js`, con le sue funzioni dichiarate in `SAVE_STEPS` del guard.** Alternativa scartata: duplicare le validazioni dei task nelle route di Generate e Add tasks. Perché: le regole dei task restano scritte una volta sola, come `cost-grid-save.js` nel ciclo 2.
2. **I test esistenti di `test-api.js` passano dallo shim `saveProjectLegacy` invece di essere riscritti uno per uno.** Alternativa scartata: riscrivere ogni chiamata nella forma nuova. Perché: le asserzioni di oggi restano intatte, e il ciclo 2 ha fatto lo stesso con `patchVersion`/`putStructure`.
3. **`js/lib/project-push-result.js` viene cancellato quando Generate non ha più esiti parziali.** Alternativa scartata: tenerlo per `summarizeGenerateResult`. Perché: con Generate atomico non esiste più un "creato ma con sezioni perse" da riassumere.
