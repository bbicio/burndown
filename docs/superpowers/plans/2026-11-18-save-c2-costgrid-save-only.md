# Contratto di salvataggio, ciclo 2: editor cost grid con solo Save — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'editor delle cost grid salva solo con Save, con il contratto del ciclo 1: una richiesta transazionale con versione, la fotografia nel registro, l'esito sempre visibile, l'avviso sulle modifiche non salvate e lo stage propagato ai progetti sul server.

**Architecture:** Sul server la route nuova `PUT /api/cost-grids/:id/versions/:vId` compone, dentro un `versionedWrite`, tre funzioni di un nuovo servizio `api/src/services/cost-grid-save.js`: testata, struttura e propagazione dello stage. Le altre scritture di `cost-grids.js` sulle due tabelle di testata passano per `versionedWrite` senza cambiare comportamento: le create come `create`, il resto con la nuova opzione `unchecked`.

Sul client, un modulo puro `js/lib/cg-draft.js` decide cosa è cambiato rispetto alla base. `_cgSaveVersion` in `js/api-sync.js` manda il Save con `apiSave`. L'editor mostra lo stato, avvisa prima di uscire e chiede "Save first?" prima delle quattro azioni.

**Tech Stack:** Node 24, Express, `pg`, `node:test`; Vue 3 da CDN, vitest 4 + jsdom; PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-11-18-save-c2-costgrid-save-only-design.md`
**Branch:** `save-c2-costgrid-save-only`
**Risk class:** high-risk — money (valuta e tasso della versione), file condivisi caricati da più pagine (`js/costgrid.js`, `js/api-sync.js`, `js/api.js` su `pipeline.html` e `costgrid.html`)

**Task indipendenti:** no.

- Il Task 2 consuma `unchecked` e le entità del Task 1.
- Il Task 3 consuma lo stesso helper e la propagazione del Task 2.
- Il Task 5 consuma la route del Task 2 e il modulo del Task 4.
- Il Task 6 consuma lo stato di Save del Task 5.
- Il Task 7 pinna lo stato lasciato dai Task 2-6.

## Global Constraints

- **Route del Save:** `PUT /api/cost-grids/:id/versions/:vId`, body `{ version, header?, structure? }`.
- **Campi di `header` ammessi:** `label, pipeline, startDate, endDate, currency, note, ratecardId, clientId, projectName`. Un altro campo riceve `400 { error: 'Unknown field: <name>' }`. Un body senza `header` né `structure` riceve `400 { error: 'Nothing to update' }`.
- **`structure`:** `{ phases, roles }`, nella forma che oggi accetta `PUT …/structure`. Il periodo non viaggia più nella struttura: sta in `header.startDate`/`header.endDate`.
- **Conflitto:** `409 { error: 'This version was changed by someone else since you opened it.', code: 'STALE', version }`. Un body senza `version` intero riceve `409 STALE`, come nel ciclo 1.
- **Codici delle regole invariati:** `DATE_RULE`, `CURRENCY_RULE`, `PROJECT_RULE`, `STRUCTURE_RULE`, `MONEY_RULE`, `VERSION_RULE`, con gli stessi messaggi di oggi.
- **Ordine dei lock**, ovunque in `cost-grids.js`: prima la riga di `cost_grid_versions` (presa da `versionedWrite`), poi `lockVersion(client, vId)`, poi le righe di `projects`.
- **Entità registrate:** `cost_grid`, `cost_grid_version`, `project`. Le azioni nel registro sono `create`, `update` e `delete`. `user_id` viene da `req.user.id`.
- **Testi utente, alla lettera:**
  - indicatore: `All changes saved`, `Unsaved changes`, `Saving…`, `Not saved: <reason>`;
  - bottone `Reload`, con la conferma `Discard your unsaved changes and reload this version?`;
  - uscita: `You have unsaved changes. Leave without saving?`, con i bottoni `Leave` / `Stay`;
  - azioni: `You have unsaved changes. Save them first?`, con i bottoni `Save and continue` / `Cancel`.
- **Interruttore:** `const CG_AUTOSAVE_ENABLED = false;` in `js/costgrid.js`. È l'unico punto da cambiare per riaccendere l'autosave.
- **Testi utente in inglese.** Nessun colore fisso: solo token di `css/tokens.css`.
- **Cache-busting:** ogni file versionato modificato aggiorna ogni suo `?v=N` in tutte le pagine che lo caricano. `js/lib/cg-draft.js` nasce `?v=1`. `js/lib/save.js` si aggiunge a `costgrid.html` e `pipeline.html` con il `?v=` già in uso nelle altre pagine.
- **Infrastruttura:**
  - nessun `docker compose` sul main stack durante i task;
  - nessuna migrazione: `version` e `change_log` esistono dal ciclo 1 (`037`);
  - `test-api.js` gira con `scripts/run-tests.sh`.
- **Ogni task aggiorna i documenti della sua riga `**Docs:**` nello stesso commit.**

## Review Focus

1. **Modifiche fatte mentre il Save è in corso.** Chi modifica una cella durante `Saving…` si aspetta che quella modifica resti "Unsaved changes" dopo la risposta. La base va ricatturata dallo stato *inviato*, non da quello presente alla risposta. Lo pinna il Task 5, test `edits made during a save stay unsaved`.
2. **Cambio di valuta e struttura nello stesso Save.** Tariffe e PTC vanno controllati (`MONEY_RULE`) nella valuta *nuova*, non in quella registrata. Lo pinna il Task 2, test-api `CS-07`.
3. **Save della sola testata con struttura non caricata o non cambiata.** I task registrati restano intatti, e il cambio di periodo viene controllato contro di loro. Lo pinna il Task 2, `CS-08`.
4. **Tasso del server diverso dall'anteprima dopo un cambio di valuta.** `cgAdoptServerRate` risincronizza i ruoli, la bozza torna "Unsaved changes" e un secondo Save manda le tariffe nuove. Lo pinna il Task 5, test `a server rate different from the preview re-syncs roles and leaves the draft unsaved`.
5. **Save con cambio di stage in parallelo a un `PATCH` del progetto collegato.** Nessun deadlock e nessun 500. Lo pinna il Task 2, `CS-10`, con le due richieste in parallelo.

---

### Task 1: `versionedWrite` con `unchecked`, tre entità registrate

**Files:**
- Modify: `api/src/services/versioned-write.js`
- Modify: `api/src/services/saved-entities.js`
- Test: `api/src/services/versioned-write.test.js`

**Docs:** `docs/api/services.md` (opzione `unchecked`, entità `cost_grid`, `cost_grid_version`, `project`)

**Interfaces:**
- Produces:
  - `versionedWrite(db, { type, id, expectedVersion, userId, action, write, unchecked })`. Con `unchecked: true`, `expectedVersion` è ignorata. Con `action: 'create'` e `unchecked: true` lancia `Error('unchecked applies to update and delete only')`.
  - `entities.cost_grid_version.snapshot(client, vId)` → `{ id, cost_grid_id, label, pipeline, pipeline_year, start_date, end_date, currency, currency_rate, note, locked, ratecard_id, client_id, project_name, version, structure: { phases } }`, dove `phases` ha la forma di `GET …/structure`. Restituisce null se la versione non esiste.
  - `entities.cost_grid.snapshot` → `{ id, name, owner_id, version }`.
  - `entities.project.snapshot` → la riga di `projects` (`SELECT * … WHERE id = $1`).
  - `structureOf(client, vId)`, esportata da `saved-entities.js`: la lettura che `GET …/structure` userà nel Task 2.

- [ ] **Step 1: Write the failing tests** in `versioned-write.test.js`, con il client finto già usato dal file:
  - `unchecked update bumps the version and logs without comparing` — riga a versione 4, `expectedVersion: undefined, unchecked: true` → `version` 5, una riga nel registro con versione 5;
  - `unchecked delete logs the stored version + 1`;
  - `unchecked create is refused` → rejects con `'unchecked applies to update and delete only'`;
  - `without unchecked a missing version is still STALE` → `StaleError`.
- [ ] **Step 2:** `cd api && node --test src/services/versioned-write.test.js` → FAIL sui quattro test nuovi.
- [ ] **Step 3: Implement** in `run()`: con `unchecked`, salta il confronto e prosegue come oggi; il resto non cambia. Aggiungi le tre entità in `saved-entities.js` con `structureOf`, che riprende le query di `GET …/structure` (`cost-grids.js:651-688`), compreso `toInputDate`.
- [ ] **Step 4:** `cd api && node --test src/services/versioned-write.test.js` → PASS.
- [ ] **Step 5: Commit** — `feat(save): versionedWrite unchecked option and cost grid/version/project entities`

### Task 2: la route del Save, le route vecchie tolte, `test-api.js`

**Files:**
- Create: `api/src/services/cost-grid-save.js`
- Modify: `api/src/routes/cost-grids.js` (tolte `PATCH /:id` :322, `PATCH /:id/versions/:vId` :436, `PUT …/structure` :692; nuova route; `GET /` :130, `GET /:id/versions` :375 e `GET …/structure` :651 con `version`)
- Modify: `api/src/scripts/seed-smoke.js:126` (passa alla route nuova)
- Test: `test-api.js` (nuova `testCostGridSave()`; shim `patchVersion`/`putStructure` per i circa 32 chiamanti esistenti)

**Docs:** `handbook/restricted/ARCHITECTURE.md` (route di cost grid, se §5/§6 le nominano: lo verifica `scripts/architecture-guard.test.js`), `CLAUDE.md` "Pipeline stage" (lo stage arriva a `projects.pipeline` lato server con il Save della versione e con publish; la frase "safe because of the propagation" si toglie), `handbook/restricted/TEST_CASES.md` (casi `CS-*` se il file elenca i casi di `test-api.js`)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `applyHeader(client, vId, header, { role }) → { fields }`. Valida e scrive la testata e decide `currency_rate`. Lancia `ruleError(message, code)`: un `Error` con `status = 400` e `code`.
  - `applyStructure(client, vId, structure, { currency, period }) → void`. Fa le validazioni e le scritture di oggi; `currency` e `period` sono quelli *dopo* `applyHeader`.
  - `propagateStage(client, vId, pipeline, userId) → string[]` (gli id dei progetti aggiornati).
  - `HEADER_FIELDS`.
  - La route risponde con `entities.cost_grid_version.snapshot`.

- [ ] **Step 1: Write the failing test-api cases** in `testCostGridSave()`, su una grid e una versione create dal test come oggi:
  - `CS-01` — Save di `{ header: { note: 'x' } }` con la versione corretta → 200, `version` +1, una riga `cost_grid_version`/`update` in `change_log` con `snapshot.structure.phases`;
  - `CS-02` — due Save dalla stessa versione, il primo con `pipeline: 'Expected'` → il secondo riceve `409 STALE`, e la versione resta `Expected`;
  - `CS-03` — body senza `version` → 409 `STALE`;
  - `CS-04` — `header.linkedProjects` → 400 `Unknown field: linkedProjects`; `header.status` → 400; body vuoto → 400 `Nothing to update`; nessuna riga nel registro;
  - `CS-05` — un progetto collegato (setup da sysadmin, come `PR-*`), Save con `pipeline: 'Committed'` → `projects.pipeline` è `Committed`, la `version` del progetto +1, una riga `project`/`update`;
  - `CS-06` — una regola rifiutata (task fuori periodo → `DATE_RULE`) → 400 con `code`; versione, struttura, progetti e registro invariati;
  - `CS-07` — nello stesso Save `currency: 'CHF'` e una tariffa con più decimali di quanti CHF ne ammetta → `MONEY_RULE`; con una tariffa valida → 200, `currency_rate` è il tasso attivo di CHF;
  - `CS-08` — Save con solo `header.endDate` che esclude un task registrato → `DATE_RULE`; con una data compatibile → 200, task registrati invariati;
  - `CS-09` — `GET /api/cost-grids`, `GET …/versions` e `GET …/structure` riportano `version` intero;
  - `CS-10` — Save con cambio di stage e `PATCH /api/projects/:id` del progetto collegato lanciati con `Promise.all` → nessuna risposta 500.

  Aggiungi a `versionOf` il ramo `/api/cost-grids/:id/versions/:vId`. Gli shim `patchVersion(cgId, vId, body, cookie)` e `putStructure(cgId, vId, body, cookie)` traducono i corpi vecchi: `period` diventa `header.startDate/endDate`, e `linkedProjects`/`status` vengono tolti. Leggono la versione e restituiscono `{ status, data }`. Sostituiscono ogni chiamata a `PATCH …/versions/:vId` e `PUT …/structure`.
- [ ] **Step 2:** `scripts/run-tests.sh` → FAIL su `CS-01..10`.
- [ ] **Step 3: Implement.** In `cost-grid-save.js` sposta la logica dalle due route vecchie, con questi tre cambiamenti:
  - `applyStructure` controlla `MONEY_RULE` nella valuta passata;
  - le regole lanciano `ruleError` invece di fare `ROLLBACK` e `return res…`;
  - `periodChangeError`/`taskDatesError` girano una volta sola, sul periodo unito e sui task del body (o su quelli registrati se manca `structure`).

  La route fa `canEdit` → `versionedWrite(pool, { type: 'cost_grid_version', … write })`. `write` esegue in ordine `locked`, `lockVersion`, `applyHeader`, `applyStructure`, `propagateStage`. Gli errori si rispondono con `respondSaveError` oppure, per `ruleError`, con `400 { error, code }`. `notifyAdminsPipelineChange` parte dopo il commit.
- [ ] **Step 4:** `scripts/run-tests.sh` → PASS: `CS-*` e tutta la suite esistente tramite gli shim.
- [ ] **Step 5: Commit** — `feat(cost-grids): one transactional versioned Save route; stage propagated to linked projects`

### Task 3: il ciclo di vita dentro `versionedWrite`, guard lato server

**Files:**
- Modify: `api/src/routes/cost-grids.js` (`POST /` :240, `DELETE /:id` :339, `POST /:id/versions` :396, `DELETE …/:vId` :535, `duplicate` :557, `publish` :625, `reassign-owner` :1075, `refresh-rate` :1167)
- Modify: `scripts/save-contract-guard.test.js` (`SERVER_EXEMPT` senza le due voci di `cost-grids.js`, che vanno in `RETIRED`; `REGISTERED_TABLES` + `phases`, `tasks`, `task_roles`)
- Test: `test-api.js` (`CS-11..13`)

**Docs:** `docs/api/services.md` (quali route usano `unchecked`)

**Interfaces:**
- Consumes: Task 1, `propagateStage` del Task 2.

- [ ] **Step 1: Write the failing cases:**
  - `CS-11` — publish di una Draft → `version` +1 e una riga `cost_grid_version`/`update`; un Save dalla versione di prima riceve 409;
  - `CS-12` — `POST /api/cost-grids`, `POST …/versions` e `duplicate` lasciano ciascuno una riga `create`/0; `DELETE` di versione e di grid lasciano ciascuno una riga `delete`;
  - `CS-13` — refresh-rate e reassign-owner fanno salire la versione rispettiva, senza mandare `version` e senza 409.

  Più le regole di oggi, invariate: delete di una non-Draft → 400, publish di una non-Draft → 400.
- [ ] **Step 2:** `scripts/run-tests.sh` → FAIL su `CS-11..13`. `npx vitest run scripts/save-contract-guard.test.js` → FAIL, perché le voci ritirate hanno ancora violazioni.
- [ ] **Step 3: Implement.** Ogni route mette la propria scrittura dentro `versionedWrite`: le create con `action: 'create'`, il resto con `unchecked: true`. Le transazioni esistenti diventano quella di `versionedWrite`, i controlli restano prima o dentro `write`, e l'ordine dei lock segue i Global Constraints. Publish chiama `propagateStage`.
- [ ] **Step 4:** `scripts/run-tests.sh` e `npx vitest run scripts/save-contract-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `feat(cost-grids): lifecycle writes logged through versionedWrite; guard retires cost-grids.js`

### Task 4: `js/lib/cg-draft.js`

**Files:**
- Create: `js/lib/cg-draft.js`
- Test: `js/lib/cg-draft.test.js`

**Docs:** `docs/js/lib.md` (nuova voce `cg-draft.js`)

**Interfaces:**
- Produces (ES module, ogni export con il ponte su `window`):
  - `cgSavableState(draft) → { header, structure }`. `header` porta i campi di `HEADER_FIELDS` (Global Constraints), `versionLabel`→`label` compreso; `clientId: '__unassigned__'` diventa `null`; le stringhe `undefined` diventano `''`. `structure` è `{ phases, roles }` con i soli campi che la route legge.
  - `cgChangedHeader(base, draft) → object`
  - `cgStructureChanged(base, draft) → boolean`
  - `cgIsDirty(base, draft) → boolean`

  `base` è il valore restituito da `cgSavableState`.

- [ ] **Step 1: Write the failing tests:**
  - `reports only the header fields that changed`;
  - `never reports linkedProjects or status` (la bozza li cambia → `{}`);
  - `maps versionLabel to label`;
  - `normalises the unassigned client to null` (base `null`, bozza `'__unassigned__'` → non cambiato);
  - `a changed hour marks the structure changed, a changed note does not`;
  - `isDirty is false right after cgSavableState of the same draft`.
- [ ] **Step 2:** `npx vitest run js/lib/cg-draft.test.js` → FAIL.
- [ ] **Step 3: Implement** `js/lib/cg-draft.js`, confrontando le due strutture con `JSON.stringify` di `cgSavableState`.
- [ ] **Step 4:** `npx vitest run js/lib/cg-draft.test.js` → PASS.
- [ ] **Step 5: Commit** — `feat(costgrid): pure draft diff module`

### Task 5: il Save del client, autosave spento, chiamate implicite tolte

**Files:**
- Modify: `js/api-sync.js` (`_cgSaveVersion` sostituisce `_cgUpsertVersionToApi`; `_cgApiVersionToLocal` porta `version`; intestazione)
- Modify: `js/costgrid.js` (`CG_AUTOSAVE_ENABLED`; `cgScheduleAutoSave`; `cgAutoSave` → `_cgSaveVersion`; `cgSaveVersion`; tolti `cgImportAll` e le chiamate dirette a `cgAutoSave` in `cgDoGenerateProject` :1442 e `cgDeleteLinkedProject` :1479; New version :862 e Clone :1006 non salvano più da soli; struttura iniziale di new grid :941 e di Clone :1053 tramite la route nuova con `apiSave`)
- Modify: `js/pages/costgrid.js` (`onPipelineChange` :744, `onCurrencyChange` :1098/:1172, `switchVersion` :660, `goBack` :664, `openLinkedProject` :793 senza `cgAutoSave`; `openVersion` cattura la base)
- Modify: `js/api.js` (tolti `costGrids.update`, `versions.update`, `versions.saveStructure`)
- Modify: `costgrid.html`, `pipeline.html` (tag `js/lib/save.js` e `js/lib/cg-draft.js`; cache-busting)
- Test: `js/lib/api-sync-save.test.js` (sostituisce `api-sync-upsert.test.js`); aggiornati `costgrid-autosave-toast`, `costgrid-new-version`, `costgrid-clone`, `costgrid-create`, `cg-create-year`, `costgrid-currency-change`, `costgrid-copy-period`, `costgrid-rate-sync`, `save-overlay-trigger` dove chiamano ciò che è stato tolto

**Docs:** `docs/js/api-sync.md` (`_cgSaveVersion`), `docs/js/costgrid.md` (interruttore, `cgAutoSave`, `cgImportAll` tolto), `docs/js/shared-libs.md` (metodi `Api.costGrids` tolti, se li elenca)

**Interfaces:**
- Consumes: la route del Task 2, `cg-draft.js` del Task 4, `apiSave`.
- Produces:
  - `_cgSaveVersion(cgId, verId) → Promise<{ kind: 'ok'|'none'|'conflict'|'unknown'|'rule'|'error', message? }>`. `none` vuol dire che non c'era niente da salvare.
  - `cgSaveState` (in `js/costgrid.js`): `{ status: 'saved'|'dirty'|'saving'|'failed', message, reloadable }`, letto dal Task 6.
  - `cgRefreshSaveState()`
  - `cgCaptureBase()`
  - `cgIsDraftDirty() → boolean`

- [ ] **Step 1: Write the failing tests** in `api-sync-save.test.js`, con `window.apiFetch` finto:
  - `an edit followed by 3 s of fake timers sends no write` (`cgScheduleAutoSave()` + `vi.advanceTimersByTime(3000)` → nessuna chiamata);
  - `Save sends one PUT to the Save route with version, the changed header only and no linkedProjects/status`;
  - `an unchanged structure is not sent`;
  - `ok adopts the server header, version and rate and recaptures the base` (`cgIsDraftDirty()` false);
  - `edits made during a save stay unsaved` (modifica tra la chiamata e la risoluzione → `dirty`);
  - `a server rate different from the preview re-syncs roles and leaves the draft unsaved`;
  - `500 and timeout give failed with the unknown message; the draft is unchanged`;
  - `409 STALE gives failed, reloadable`;
  - `a rule refusal gives failed with its message, not reloadable`;
  - `new grid: a failed initial structure save discards the grid and shows the error`.

  Aggiorna i test esistenti elencati sopra: i nomi che si riferiscono al flush implicito o a `_cgUpsertVersionToApi` vanno riscritti sul comportamento nuovo, non cancellati senza sostituto.
- [ ] **Step 2:** `npx vitest run js/lib/api-sync-save.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - **`_cgSaveVersion`:** prima di `apiSave` cattura `sent = cgSavableState(draft)`. Su `ok` adotta dal server testata, `version` e `currency_rate`; la struttura della bozza resta la sua (vedi Decisione aperta 1). Se c'era un cambio di valuta in sospeso chiama `cgAdoptServerRate`. Propaga lo stage in memoria con `cgPropagatePipelineToProjects` e imposta la base a `sent`, con testata, versione e tasso adottati.
  - **`cgScheduleAutoSave`:** con l'interruttore spento chiama solo `cgRefreshSaveState()`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(costgrid): Save-only editor on the save contract; autosave behind CG_AUTOSAVE_ENABLED`

### Task 6: indicatore, Reload, conferme di uscita e "Save first?"

**Files:**
- Modify: `costgrid.html` (indicatore `role="status"` in `.ph-actions` prima di `#btnCgSave`; Save disabilitato con `saveState.status === 'saved'`)
- Modify: `js/pages/costgrid.js` (`saveState` reattivo; `reloadVersion()`; `goBack`, `switchVersion` e `openLinkedProject` con la conferma di uscita, `goBack` senza i 500 ms; `beforeunload`)
- Modify: `js/costgrid.js` (`cgConfirmSaveFirst(action)` usato da `cgGenerateProject`, `cgPublishDraft`, `cgCreateNewVersionDirect` e `cgCloneGrid` quando la sorgente è la versione aperta)
- Modify: `css/costgrid.css` (stile dell'indicatore, solo token)
- Test: `js/lib/costgrid-save-state.test.js` (nuovo)

**Docs:** `docs/pages/costgrid.md` (Save, indicatore, uscita, "Save first?"), `handbook/public/manual.md` (sezione dell'editor: si salva con Save), `handbook/restricted/TEST_CASES.md` (casi manuali del Save)

**Interfaces:**
- Consumes: `cgSaveState`, `cgIsDraftDirty`, `_cgSaveVersion` e `cgCaptureBase` del Task 5.
- Produces: `cgConfirmSaveFirst(proceed: () => void) → void`. Con la bozza pulita chiama `proceed`; altrimenti mostra il dialogo dei Global Constraints, e su *Save and continue* esegue il Save e chiama `proceed` solo se l'esito è `ok`.

- [ ] **Step 1: Write the failing tests** (estrazione dei metodi con `extractBlock`, come in `costgrid-currency-change.test.js`):
  - `goBack, switchVersion and openLinkedProject ask before leaving a dirty draft and do not ask on a clean one`;
  - `Leave proceeds without any write`;
  - `beforeunload prevents only when dirty`;
  - `Generate, Publish, New version and Clone of the open version ask "Save first?" when dirty`;
  - `a failed Save and continue does not run the action`;
  - `the status element shows each of the four texts`;
  - `Reload asks before discarding and reopens the version`.
- [ ] **Step 2:** `npx vitest run js/lib/costgrid-save-state.test.js` → FAIL.
- [ ] **Step 3: Implement** usando `showConfirm` per tutte le conferme, nessun `confirm()` nativo.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Visual check.** Su `scripts/test-branch.sh up`, `node scripts/shoot.mjs` dell'editor nei quattro stati, via `--eval` (invocazione in `docs/scripts/shoot.md`). Rileggi i PNG.
- [ ] **Step 6: Commit** — `feat(costgrid): save status, Reload, unsaved-changes prompts and Save first`

### Task 7: guard lato client granulare, CLAUDE.md

**Files:**
- Modify: `scripts/save-contract-guard.test.js`
- Modify: `CLAUDE.md` ("Data strategy", "Save contract")

**Docs:** `CLAUDE.md` (sopra); l'intestazione del guard (le voci per scrittura)

**Interfaces:**
- Consumes: i nomi restituiti da `clientWrites` (`use.path`, es. `costGrids.versions.publish`).

- [ ] **Step 1: Write the failing guard tests:**
  - `a write outside a per-write exemption fails` (sorgente finta `js/costgrid.js` con una scrittura non elencata);
  - `a per-write exemption with no violation left fails`;
  - `a RETIRED per-write entry put back fails`.
- [ ] **Step 2:** `npx vitest run scripts/save-contract-guard.test.js` → FAIL.
- [ ] **Step 3: Implement.**
  - **Formato delle voci:** `CLIENT_EXEMPT` accetta `'<file>: <name>'`. Per `js/costgrid.js`, `js/pages/costgrid.js` e `js/api-sync.js` la voce per file si sostituisce con una voce per ogni scrittura che resta, trovate eseguendo il guard.
  - **`RETIRED`** riceve `js/api-sync.js: costGrids.update`, `js/api-sync.js: costGrids.versions.update`, `js/api-sync.js: costGrids.versions.saveStructure` e `js/costgrid.js: costGrids.versions.saveStructure`.
  - **CLAUDE.md:** "Save contract" dice che l'editor delle cost grid salva solo con Save secondo il contratto; "Data strategy" non lo elenca più fra i fire-and-forget.
- [ ] **Step 4:** `npm test`, `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `test(guard): per-write client exemptions for the cost grid files; CLAUDE.md save contract`

## Decisioni aperte

1. **Su un Save riuscito la bozza tiene la propria struttura, e adotta dal server solo testata, versione e tasso.** Alternativa scartata: ricostruire la struttura dalla fotografia, come dice la Spec §3.3. Perché: il server salva gli stessi id di task che il client manda (`crypto.randomUUID`), e una colonna di ruolo senza ore non esiste in `task_roles`, quindi ricostruirla dalla fotografia la farebbe sparire dall'editor e lascerebbe la bozza sempre "modificata".
2. **Il periodo della versione viaggia in `header`, non più dentro `structure`.** Alternativa scartata: mantenere `structure.period`. Perché: nella route unica testata e struttura sono controllate insieme, e un solo posto per il periodo evita due valori in conflitto.
3. **I circa 32 chiamanti esistenti di `test-api.js` passano per due shim che traducono i corpi vecchi.** Alternativa scartata: riscrivere ogni chiamata. Perché: il diff resta leggibile e le asserzioni esistenti non cambiano.
4. **Task sequenziali, esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: §6.1 richiede task indipendenti per subagent-driven, e qui ogni task consuma il precedente.
