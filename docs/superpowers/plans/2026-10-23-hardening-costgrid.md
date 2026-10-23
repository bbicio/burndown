# Hardening costgrid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** chiudere B-051, B-029, B-043, B-044…B-048, B-086…B-092 come descritto nella Spec.

**Architecture:** una regola pura lato server (`api/src/lib/structure-rules.js`) chiamata dal `PUT …/structure` sotto il lock di versione; un predicato condiviso lato client (`cgIsTaskAssigned`); il gating del viewer sostituisce `!isLocked` con `!isReadOnly`; le correzioni del flusso create/clone stanno in `js/costgrid.js` e `pipeline.html`.

**Tech Stack:** Vue 3 da CDN, script classici e moduli `js/lib/`, Express + PostgreSQL, vitest + jsdom, `node:test`, `test-api.js`.

**Spec:** `docs/superpowers/specs/2026-10-23-hardening-costgrid-design.md`
**Branch:** `hardening-costgrid`
**Risk class:** high-risk — permessi (B-029, B-043) e file condivisi caricati da più pagine (`js/nav.js`, `js/api-sync.js`).

**Esecuzione:** nativa per §6.1. **I task non sono indipendenti:** i Task 3, 4 e 6 toccano `costgrid.html`, e i Task 3, 7 e 8 toccano `js/costgrid.js`. Worktree `.claude/worktrees/hardening-costgrid` per §6.1b, con `.env` copiato e `npm ci`.

## Global Constraints

- Il testo visibile all'utente è in inglese.
- Codice del rifiuto lato server: `STRUCTURE_RULE`. Risposta `400 { error, code: 'STRUCTURE_RULE' }`.
- Durante i task si lanciano solo i test toccati (`npx vitest run <file>`; backend `docker exec pdash-api node --test src/<file>` oppure `node --test` da `api/` per i `lib/` puri). `test-api.js` gira su stack isolato: `scripts/run-tests.sh`. Mai sul main stack.
- Nessuna migration. Nessun comando Docker lifecycle sul main stack.
- Versioni di partenza: `js/nav.js?v=18` (19 riferimenti), `js/costgrid.js?v=45` (2), `js/api-sync.js?v=23` (6), `js/lib/costgrid-calc.js?v=7` (2). Si aggiornano tutti insieme nel Task 10.
- Il Task 1 deve passare su `main` **prima** di qualunque modifica al codice (caratterizzazione, Scenario 2).

## Review Focus

1. **Versione con un task orfano in `task_ids`** (ce ne sono 5 nel DB principale): il salvataggio deve continuare a riuscire. Lo copre SR-06 nel Task 2.
2. **Task collegato senza nome** (`taskName` vuoto): `cgIsTaskAssigned` lo deve vedere assegnato per id, mentre `cgFreeTasksOf` lo esclude come oggi. Test nel Task 3.
3. **Viewer che apre la barra di selezione o il menu ⋮ da tastiera**, chiamando il metodo e non il pulsante: il draft non deve cambiare. Il test dei metodi nel Task 4 li copre tutti.
4. **Un `DELETE` di compensazione che fallisce a sua volta:** l'utente vede comunque l'errore originale e la funzione restituisce `false`. Test nel Task 7.
5. **Due salvataggi concorrenti sulla stessa versione** con un collegamento in mezzo: il lock serializza. Non è testabile in modo deterministico; il reviewer controlla che `lockVersion` venga preso prima della `SELECT` dei collegamenti, sullo stesso `client` della transazione.

---

### Task 0: Estrattore di sorgente condiviso per i test (B-089, parte test)

**Files:**
- Create: `scripts/lib/extract-source.mjs`
- Modify: `js/lib/api-sync-upsert.test.js`, `js/lib/costgrid-clone.test.js`, `js/lib/costgrid-create.test.js`, `js/lib/costgrid-currency-change.test.js`, `js/lib/costgrid-new-version.test.js`, `js/lib/header-badge.test.js`, `js/lib/pipeline-proposal-busy.test.js`
- Test: `scripts/lib/extract-source.test.js` (nuovo)

**Interfaces:**
- Produces: `export function extractBlock(src: string, head: string): string`. Restituisce il testo da `head` (prima occorrenza) fino alla `}` che chiude il primo `{` dopo la prima `)` che segue `head`. Se `head` manca lancia `Error(\`${head} not found\`)`. Lo usano tutti i test dei task successivi.

- [ ] **Step 1:** scrivere `scripts/lib/extract-source.test.js` con questi test:
  - `extractBlock('x; async function f(a) { if (a) { return 1; } } y', 'async function f(')` === `'async function f(a) { if (a) { return 1; } }'`;
  - un metodo `'  m() { return {a:1}; }\n  n() {}'` con head `'m() {'` restituisce `'m() { return {a:1}; }'`;
  - un head assente lancia `/not found/`.
- [ ] **Step 2:** `npx vitest run scripts/lib/extract-source.test.js`. Atteso: FAIL (modulo assente).
- [ ] **Step 3:** implementare `extractBlock` in `scripts/lib/extract-source.mjs`. È la scansione delle graffe già presente nei test copiati, senza variazioni.
- [ ] **Step 4:** nei sette test sostituire la funzione locale con `import { extractBlock } from '../../scripts/lib/extract-source.mjs'`, passando i loro head attuali:
  - `` `async function ${name}(` ``;
  - `` `${name}() {` ``;
  - `` `async ${name}(` ``;
  - `header-badge`: `` `function ${name}(` ``.
- [ ] **Step 5:** `npx vitest run scripts/lib/extract-source.test.js` più i sette file. Atteso: tutti PASS, stesso numero di test di prima. Verifica: `grep -lE "^function extract" js/lib/*.test.js` non stampa nulla.
- [ ] **Step 6:** commit `test: one shared source extractor for the classic-script tests (B-089)`.

### Task 1: Caratterizzazione di `PUT …/structure` con un task collegato

**Files:**
- Modify: `test-api.js` (nuova `testStructureRule()`, chiamata accanto a `testProjectCurrencyLock()` alla riga ~2858)

**Interfaces:**
- Produces: `testStructureRule()` e il suo setup, estesi nel Task 2.

- [ ] **Step 1:** setup copiato dal modello di `testProjectCurrencyLock()`: anno `TEST_YEAR_C`, proposta `__test_sr_cg__` con `v1`, cleanup con `later()` nello stesso ordine.
  1. `PUT …/structure` con 2 fasi (`P1` con i task `T1`, `T2`; `P2` vuota) e nessun ruolo;
  2. `GET …/structure` per leggere gli id dei task;
  3. progetto creato con `cgVersionId` (come PR-03);
  4. `POST …/linked-projects` con `taskIds: [idT1]`, `taskNames: ['T1']`.
- [ ] **Step 2:** asserzioni con `ok()`, partendo ogni volta dalla struttura del setup:
  - `SR-01 rename of a linked task → 200`: payload con `T1` rinominato `T1b`, stesso `taskId`;
  - `SR-02 reorder → 200`: `T2` prima di `T1`;
  - `SR-03 move to another phase → 200`: `T1` spostato in `P2`.
- [ ] **Step 3:** `scripts/run-tests.sh` su `main` del worktree, prima di qualunque modifica. Atteso: SR-01..03 PASS.
- [ ] **Step 4:** commit `test: characterize PUT structure saves with a linked task`.

### Task 2: Regola STRUCTURE_RULE lato server (B-043)

**Files:**
- Create: `api/src/lib/structure-rules.js`, `api/src/lib/structure-rules.test.js`
- Modify: `api/src/routes/cost-grids.js:640-750` (handler `PUT /:id/versions/:vId/structure`), import di `lockVersion` alla riga 5
- Test: `test-api.js` (`testStructureRule`)

**Interfaces:**
- Produces:
  - `missingLinkedTasks({ linkedTaskIds: string[], currentTasks: {id: string, title: string}[], payloadTaskIds: string[] }) => {id, title}[]`;
  - `STRUCTURE_RULE_CODE = 'STRUCTURE_RULE'`.
- Il confronto degli id ignora le maiuscole (`String(id).toLowerCase()`), come `lockKey`.

- [ ] **Step 1:** test `node:test`:
  - nessun collegamento → `[]`;
  - collegato e presente → `[]`;
  - collegato e assente → `[{id, title}]`;
  - collegato orfano (non in `currentTasks`) → `[]`;
  - id con maiuscole diverse → considerato presente.
- [ ] **Step 2:** `node --test src/lib/structure-rules.test.js` da `api/`. Atteso: FAIL.
- [ ] **Step 3:** implementare il modulo (CommonJS, come gli altri `api/src/lib`).
- [ ] **Step 4:** `node --test …`. Atteso: PASS.
- [ ] **Step 5:** nell'handler, dopo `BEGIN` e prima di `DELETE FROM phases`:
  1. `await lockVersion(client, req.params.vId)`;
  2. leggere `task_ids` da `cg_version_projects` della versione e i task correnti (`tasks` JOIN `phases` su `version_id`) con `client`;
  3. `payloadTaskIds` = i `taskId || id` non vuoti di tutte le fasi del body;
  4. se `missingLinkedTasks` non è vuoto: `ROLLBACK` e `res.status(400).json({ error, code: STRUCTURE_RULE_CODE })` con `error` = `Cannot save: tasks linked to a project would be removed: "<t1>", "<t2>"`.
- [ ] **Step 6:** in `testStructureRule` aggiungere:
  - `SR-04`: payload senza `T1` → 400 con `code === 'STRUCTURE_RULE'`;
  - `SR-05`: subito dopo, `GET …/structure` contiene ancora `T1` e `T2`;
  - `SR-06`: si scrive nel collegamento un id inesistente (`POST linked-projects` con `taskIds: [idT1, '00000000-0000-4000-8000-000000000000']`), poi un salvataggio con `T1` → 200.
- [ ] **Step 7:** `scripts/run-tests.sh`. Atteso: SR-01..06 PASS.
- [ ] **Step 8:** commit `feat(api): refuse a structure save that drops a linked task (B-043)`.

### Task 3: Un solo predicato "task assegnato" e `deleteTask` protetto (B-047, B-043 client)

**Files:**
- Modify: `js/lib/costgrid-calc.js:1-16`, `costgrid.html:884-890` (`hasFreeTasks`), `:1639-1643` (`isTaskAssigned`), `:1667-1672` (`deleteTask`), `js/costgrid.js:1171`, `:1626-1640`
- Test: `js/lib/costgrid-calc.test.js` (esistente o nuovo, seguendo la convenzione del file), `js/lib/costgrid-delete-task.test.js` (nuovo)

**Interfaces:**
- Produces: `export function cgIsTaskAssigned(task, linkedProjects): boolean` più il bridge `window.cgIsTaskAssigned`.

- [ ] **Step 1:** test vitest:
  - assegnato per id;
  - assegnato per nome (trim, minuscole);
  - task senza nome ma con id collegato → `true`;
  - libero → `false`;
  - `cgFreeTasksOf` invariato sugli stessi casi, con il task senza nome escluso.
  - Per `deleteTask` (estratto con `extractBlock(html, 'deleteTask(phase, task) {')`, `this` stub con `isTaskAssigned` → `true`, `showInfo`/`showConfirm` spy): `showConfirm` mai chiamato, `showInfo` chiamato con `"Can't delete: this task is linked to a project."`, `phase.tasks` invariato.
- [ ] **Step 2:** run. Atteso: FAIL.
- [ ] **Step 3:** implementare:
  - `cgIsTaskAssigned`, poi `cgFreeTasksOf` = `t.taskName?.trim() && !cgIsTaskAssigned(t, linkedProjects)`;
  - `isTaskAssigned(task)` → `window.cgIsTaskAssigned(task, this.draft?.linkedProjects)`;
  - `hasFreeTasks` → `window.cgFreeTasksOf(...).length > 0`;
  - `js/costgrid.js:1171` sullo stesso predicato con `_cgDraft.linkedProjects`;
  - rimuovere `cgGetAssignedTaskIds`/`cgGetAssignedTaskNames` se `grep -rn "cgGetAssignedTask" js/ *.html` non trova altri chiamanti;
  - guardia in `deleteTask`.
- [ ] **Step 4:** run. Atteso: PASS. Verifica: `grep -n "assignedNames\|assignedIds" costgrid.html` → nessuna riga.
- [ ] **Step 5:** commit `refactor: one task-assigned predicate; deleteTask refuses an assigned task (B-047, B-043)`.

### Task 4: Il viewer non vede e non esegue i controlli strutturali (B-029)

**Files:**
- Modify: `costgrid.html`, ogni `v-if` con `!isLocked` (righe 47, 56, 293, 297, 349, 354, 364, 366, 386, 439, 483, 496-498 su `main`) e i metodi elencati sotto
- Test: `js/lib/costgrid-viewer-guard.test.js` (nuovo)

- [ ] **Step 1:** test vitest:
  - `costgrid.html` non corrisponde a `/v-if="[^"]*!isLocked/`, e i `v-if` di `:47`/`:56` non contengono più `myPermission !== 'viewer'` (assorbito da `!isReadOnly`);
  - per ciascuno di `addPhase`, `addTask`, `deletePhase`, `deleteTask`, `addRoleColumn`, `openRoleMenu`, `onRemoveColumnClick`, `changeRole`, `duplicateRole`, `resetRoleRate`, `toggleSelectAllFree`, `toggleFreeInPhase` e dei metodi di conferma di Add to project (nomi letti dai `@click` di `:497-498`): estratti con `extractBlock`, eseguiti con `this` = `{ isReadOnly: true, draft }` più gli stub che servono. Il draft resta deep-equal a prima, e nessuno stub di salvataggio o modale viene chiamato.
- [ ] **Step 2:** run. Atteso: FAIL.
- [ ] **Step 3:** sostituire le condizioni con `!isReadOnly`, tenendo le altre (`!selectionMode`, `!isTaskAssigned(task)`, `addToProjectMode === …`). Aggiungere `if (this.isReadOnly) return;` in testa a ogni metodo elencato.
- [ ] **Step 4:** run. Atteso: PASS.
- [ ] **Step 5:** commit `fix(costgrid): hide and guard structural controls for viewers (B-029)`.

### Task 5: Option dei destinatari costruite via DOM (B-051)

**Files:**
- Modify: `js/nav.js:626-633`
- Test: `js/lib/nav-send-notif-options.test.js` (nuovo, `// @vitest-environment jsdom`)

**Interfaces:**
- Produces: `function navFillRecipientOptions(selectEl, users, { broadcast: boolean, selfId })` in `js/nav.js`, chiamata dall'handler. Il test la estrae con `extractBlock(src, 'function navFillRecipientOptions(')`.

- [ ] **Step 1:** test:
  - un utente con `first_name: '</option><option value="x">Fake'` → `select.options.length === 1`, il testo è quella stringa letterale, il value è il suo id;
  - `broadcast: true` antepone `All users (broadcast)` con value `''`;
  - l'utente `selfId` viene escluso;
  - senza nome il testo è l'email.
- [ ] **Step 2:** run. Atteso: FAIL.
- [ ] **Step 3:** implementare con `replaceChildren()`, `createElement('option')`, `.value`, `.textContent`. Le option "Loading…" e "Failed to load users" restano stringhe fisse.
- [ ] **Step 4:** run. Atteso: PASS.
- [ ] **Step 5:** commit `fix(nav): build Send Notification recipients as text, not markup (B-051)`.

### Task 6: Editor — menu, riepilogo condivisione, etichetta, helper di selezione (B-044, B-045, B-046, B-048)

**Files:**
- Modify: `costgrid.html` (`openVersion` ~`:1284`, `mounted` `_cgRoleMenuReposition` `:1087`, handler `hidden.bs.modal` `:1935`, `reassignOwner` `:1134`, i sei metodi `:1719-1758`), `js/costgrid.js:791`
- Test: `js/lib/costgrid-editor-followups.test.js` (nuovo)

**Interfaces:**
- Produces:
  - `cgNextVersionLabel(versions: {versionLabel: string}[]): string` in `js/costgrid.js`;
  - in `costgrid.html` i metodi `freeStateOf(tasks)`, `toggleFreeOf(tasks)`, `freeLabelOf(tasks, labels: {none, all, some: n => string})`.

- [ ] **Step 1:** test:
  - `cgNextVersionLabel([{versionLabel:'v1'},{versionLabel:'v3'}])` → `'v4'`;
  - `[{versionLabel:'v1'},{versionLabel:'v2'}]` → `'v3'`;
  - `[{versionLabel:'v2'}]` → `'v3'` (N parte da `length + 1` = 2, occupato);
  - `openVersion` estratto contiene l'azzeramento dei tre campi: si verifica eseguendolo con stub fino al punto di assegnazione, oppure, se l'estrazione non è eseguibile, con un'asserzione sul sorgente che il reviewer accetta come limite;
  - i sei metodi danno gli stessi risultati di prima su tre casi (nessun libero, alcuni selezionati, tutti selezionati) per fase e per intero draft.
- [ ] **Step 2:** run. Atteso: FAIL.
- [ ] **Step 3:** implementare:
  - in `openVersion`: `this.openRoleMenuCode = null; this.removeColumnConfirm = null; this._cgRoleMenuBtnEl = null;`;
  - nel reposition: se `!this._cgRoleMenuBtnEl?.isConnected`, chiudere il menu (`openRoleMenuCode = null`);
  - `this.loadShareSummary()` nell'handler di `shareModal` e dopo il successo di `reassignOwner`;
  - `cgCreateNewVersionDirect` usa `cgNextVersionLabel(cg.versions)`;
  - i sei metodi diventano wrapper di una riga sui tre helper, con testi invariati.
- [ ] **Step 4:** run, più `npx vitest run js/lib/costgrid-new-version.test.js`. Atteso: PASS.
- [ ] **Step 5:** commit `fix(costgrid): reset role menu on version switch, refresh share summary, unique version label, one selection helper (B-044..B-048)`.

### Task 7: Create e clone — compensazione, avviso, guardie, rilascio (B-086, B-087, B-089, B-090, B-091)

**Files:**
- Modify: `js/costgrid.js:848-1035` (`cgCreateNewGrid`, `cgCloneGrid`), `pipeline.html:1001-1030` (`createNewProposal`, `cloneProposal`)
- Test: `js/lib/costgrid-create.test.js`, `js/lib/costgrid-clone.test.js`, `js/lib/pipeline-proposal-busy.test.js`

**Interfaces:**
- Produces:
  - `cgCreateNewGrid(): Promise<true|false|null>`;
  - `cgCloneGrid(src, ver): Promise<true|false|null>`;
  - `null` = chiamata ignorata dalla guardia in-flight.

- [ ] **Step 1:** test:
  - create con `versions.create` che rifiuta → `Api.costGrids.delete('cg-new')` chiamato una volta, risultato `false`;
  - clone con `saveStructure` che rifiuta → `delete` chiamato, `false`, `showInfo` con l'errore;
  - `delete` che rifiuta a sua volta → stesso esito, nessuna eccezione;
  - una seconda chiamata durante la prima → `null`;
  - clone con struttura non caricata: `showCostGridEditorView` non viene chiamato prima che lo stub di `#confirmModal` emetta `hidden.bs.modal`;
  - `pipeline.html`:
    - `ok === null` → `proposalBusy` resta `true`;
    - `ok === false` → `false`;
    - `ok === true` → nessun `refreshTick++` immediato; con i fake timer, dopo `PB_PROPOSAL_FALLBACK_MS` → `proposalBusy === false` e `refreshTick` incrementato.
- [ ] **Step 2:** run. Atteso: FAIL.
- [ ] **Step 3:** implementare:
  - compensazione `try { await Api.costGrids.delete(cgId); } catch (e) { console.warn(...) }` su ogni fallimento successivo alla create del grid;
  - `saveStructure` del clone dentro quel percorso;
  - guardie che restituiscono `null`;
  - attesa di `hidden.bs.modal` con `{ once: true }` su `document.getElementById('confirmModal')`;
  - in `pipeline.html` la costante `PB_PROPOSAL_FALLBACK_MS = 5000`, rilascio solo su `ok === false`, e su `true` un `setTimeout` che rilascia ed esegue `refreshTick++`.
- [ ] **Step 4:** run. Atteso: PASS.
- [ ] **Step 5:** commit `fix(pipeline): no orphan proposal on a failed create/clone, readable clone warning, busy state released (B-086, B-087, B-089, B-090, B-091)`.

### Task 8: Autosave — il nome non blocca il salvataggio, toast solo sul successo (B-088)

**Files:**
- Modify: `js/api-sync.js:153-…` (`_cgUpsertVersionToApi`), `js/costgrid.js:684-707` (`cgAutoSave`, `cgScheduleAutoSave`)
- Test: `js/lib/api-sync-upsert.test.js`, `js/lib/costgrid-autosave-toast.test.js` (nuovo)

**Interfaces:**
- Produces:
  - `_cgUpsertVersionToApi(...) : Promise<boolean>`: `true` solo se tutte le scritture sono riuscite; in strict lancia come oggi;
  - `cgAutoSave(strict): Promise<boolean>`.

- [ ] **Step 1:** test:
  - `update` del nome che rifiuta, non strict → le chiamate di metadati versione e `saveStructure` avvengono comunque, ritorno `false`;
  - strict → lancia, nessuna chiamata successiva (come oggi);
  - tutto ok → `true`;
  - `cgScheduleAutoSave` con fake timer: con `cgAutoSave` → `false` il toast non viene mostrato, con `true` sì.
- [ ] **Step 2:** run. Atteso: FAIL.
- [ ] **Step 3:** implementare:
  - un flag `allOk` in `_cgUpsertVersionToApi`, impostato a `false` a ogni `catch` non strict;
  - `cgAutoSave` restituisce `.then(r => r === true)` e `false` sui rami di uscita anticipata;
  - il timer fa `cgAutoSave().then(ok => { if (ok) show toast })`.
  - **Nessun chiamante esistente si rompe:** `grep -rn "_cgUpsertVersionToApi\|cgAutoSave(" js/ *.html` va riletto per controllare che nessuno usi il valore restituito in modo diverso.
- [ ] **Step 4:** run. Atteso: PASS.
- [ ] **Step 5:** commit `fix(costgrid): a failed name save no longer skips the version save; toast only on success (B-088)`.

### Task 9: Rifiniture API (B-089, B-092)

**Files:**
- Modify: `api/src/routes/cost-grids.js:336-342` (`DELETE /:id`), `:396-400` (`POST /:id/versions`)
- Test: `test-api.js`

- [ ] **Step 1:** in `DELETE /:id`, `if (await gridHasPublishedVersion(req.params.id))` sostituisce la query in linea. Messaggio e status invariati.
- [ ] **Step 2:** in `POST /:id/versions`, `const [role, hasPublishedVersion] = await Promise.all([liveRole(req.user.id), gridHasPublishedVersion(req.params.id)])`.
- [ ] **Step 3:** `scripts/run-tests.sh`. Atteso: verde, compresi i test esistenti sul delete di una proposta pubblicata e sulla creazione di versione. Verifica: `grep -n "pipeline != 'Draft'" api/src/routes/cost-grids.js` → nessuna riga.
- [ ] **Step 4:** commit `refactor(api): reuse gridHasPublishedVersion, parallel checks on version create (B-089, B-092)`.

### Task 10: Versioni `?v=` e backlog

**Files:**
- Modify: ogni `.html` con `js/nav.js?v=18`, `js/costgrid.js?v=45`, `js/api-sync.js?v=23`, `js/lib/costgrid-calc.js?v=7`; `docs/BACKLOG.md`

- [ ] **Step 1:** aggiornare ogni riferimento a `nav.js?v=19`, `costgrid.js?v=46`, `api-sync.js?v=24`, `costgrid-calc.js?v=8`. Le modifiche si fanno con Edit o `sed` su byte, mai con `Get-Content`/`Set-Content` (BOM).
  - Verifica: `grep -rhoE "js/(nav|costgrid|api-sync)\.js\?v=[0-9]+|js/lib/costgrid-calc\.js\?v=[0-9]+" --include=*.html . | sort | uniq -c` → una sola versione per file;
  - `npx vitest run js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js` → PASS.
- [ ] **Step 2:** in `docs/BACKLOG.md` portare a `closed` le 15 righe, ciascuna con un `Verified how` eseguibile (il test o il `grep` del task che la chiude).
- [ ] **Step 3:** commit `chore: bump versioned assets, close B-029/B-043/B-044..B-048/B-051/B-086..B-092`.

## Criteri di accettazione

Quelli della Spec, `docs/superpowers/specs/2026-10-23-hardening-costgrid-design.md` § Criteri di accettazione (1-16).

## Decisioni aperte

1. **Esecuzione nativa, non subagent-driven.** Alternativa scartata: subagent-driven, suggerito dalla dimensione del ciclo. Perché: §6.1 richiede che il Piano dichiari i task indipendenti, e qui non lo sono (stessi file in 3, 4 e 6 e in 3, 7 e 8).
2. **Il Task 0 (estrattore condiviso) viene per primo.** Alternativa scartata: in coda con B-089. Perché: i test nuovi dei Task 3-8 lo usano, e altrimenti nascerebbe un'ottava copia.
3. **Timer di fallback di B-090 a 5000 ms.** Alternativa scartata: 2000 ms. Perché: una navigazione lenta non deve sbloccare i pulsanti mentre la pagina sta ancora caricando l'editor.
4. **B-051 estratto in una funzione nominata `navFillRecipientOptions`.** Alternativa scartata: correzione in linea nell'handler. Perché: senza una funzione nominata il test non ha nulla da eseguire.
