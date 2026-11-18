# Contratto di salvataggio, ciclo 3: scritture di progetti e programmi — design spec

**Date:** 2026-11-18
**Brief started:** 2026-11-17 17:32
**Brief:** `docs/superpowers/briefs/2026-11-17-save-c3-project-program-writes-brief.md`
**Audit:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md` (SY-03, SY-04, SY-08, SY-10, SY-19 per la condivisione dei programmi)
**Scenario:** 3 (audit-fix)
**Classe di rischio:** high-risk (permessi di progetto; regole del currency lock; file condivisi `js/api-sync.js`/`js/costgrid.js`; operazioni che creano progetti)
**Security surface:** yes — il fallback `POST /api/projects` raggiungibile da un salvataggio fallito (SY-04); la condivisione dei programmi

Un progetto si salva tutto o niente, con la versione da cui il client è partito. Un salvataggio fallito non ricrea mai il progetto. Generate e Add tasks diventano operazioni del server, ciascuna in una transazione con il proprio link. La condivisione di un programma è atomica e non abbassa mai un permesso.

## 1. Fatti verificati

- `cgDoGenerateProject` crea il progetto con `_pushProjectToApiDetailed`: il `PATCH` fallisce con 404, poi il fallback fa il `POST` (`js/api-sync.js:280-294`). Togliere il fallback richiede una creazione esplicita per Generate.
- `projects.version` esiste già (migrazione 037). `GET /api/projects` non la restituisce, e `_apiProjectToLocal` (`js/api-sync.js:214`) la scarta.
- Phasing, ptc, planning e groups sono colonne di `projects`. I task stanno in `project_tasks`. Il link sta in `cg_version_projects`, con le colonne `task_ids` e `task_names_direct`.
- `POST …/linked-projects` (`api/src/routes/cost-grids.js:636`) sostituisce le liste per intero. Lato client lo chiamano solo Generate e Add tasks; `test-api.js` lo usa in PR-03 e nei test delle regole di struttura.
- `test-api.js` usa `PATCH /api/projects/:id` e `POST /api/projects` molte volte (`grep -c` sul file). `DELETE /programs/:id` serve al cleanup dei test.
- `PATCH /programs/:id`, `_deleteProjectFromApi` e `_pushProjectToApi` non hanno chiamanti di produzione.
- `POST /programs/:id/share` fa `ON CONFLICT … DO UPDATE SET permission = $3`. Se l'utente scelto è owner di un progetto del programma, la sua riga `owner` viene sovrascritta.
- project-config ha già un `savedSnapshot` del progetto caricato. `pipelineLocked` rende lo stage non modificabile quando il progetto ha un `costGridRef`.
- Oltre al salvataggio del progetto e a `programs.create`, project-config scrive:
  - i tag (`projects.tags.replace`): ciclo 4;
  - le actuals (`timesheets.upload`/`timesheets.delete`): ciclo 5;
  - `clients.create`: ciclo 6.

## 2. Server

### 2.1 Entità registrate — `api/src/services/saved-entities.js`

- **`project`**: la fotografia diventa la forma di un elemento di `GET /api/projects`: riga del progetto (con `version`), `tasks` da `project_tasks` in `sort_order`, e `links`, cioè le righe di `cg_version_projects` del progetto (`versionId`, `taskIds`, `taskNames`).
- **`program`** (nuova): tabella `programs`, messaggio di conflitto "This program was changed by someone else since you opened it.", 404 "Program not found". La fotografia è `{ id, name, version, shares }`, dove `shares` contiene le righe `resource_shares` dei progetti del programma (`projectId`, `userId`, `permission`).

### 2.2 Save del progetto — `PUT /api/projects/:id`

Body: `{ version, header?, tasks?, phasing?, ptc?, planning?, groups? }`.

- `header` contiene solo i campi cambiati, presi tra `name, code, programId, clientId, startDate, endDate, currency, pipeline, status, description, cgVersionId`. Un campo fuori da questo elenco riceve `400`.
- Ogni sezione c'è solo se è cambiata. `tasks` sostituisce l'elenco dei task.
- Un body senza `header` né sezioni riceve `400 Nothing to update`.
- Prima della transazione:
  - `:id` non UUID → `400`;
  - progetto inesistente → `404 Project not found`;
  - nessun permesso di modifica → `403`.

Tutto gira in **un** `versionedWrite(pool, { type: 'project', id, expectedVersion: version, action: 'update' })`. Dentro `write(client)`:

1. Se `header.cgVersionId` c'è ed è diverso da quello registrato, `lockVersion(client, target)`.
2. Le regole di oggi, con gli stessi codici e messaggi, valutate sullo **stato finale** del salvataggio. Il periodo è quello nuovo se `header` lo cambia, altrimenti quello registrato; i task sono quelli del body se ci sono, altrimenti quelli registrati.
   - `projectCurrencyChangeError`, `projectLinkChangeError`, `linkCurrencyError` (`PROJECT_RULE`). Un `currency`/`cgVersionId` identico al registrato è accettato.
   - `periodChangeError`, `taskDatesError` (`DATE_RULE`).
   - `taskListError`, sold hours, `amountError` sui rate dei task nella valuta finale (`MONEY_RULE`).
   - `phasingError`, `ptcRowsError` (`MONEY_RULE`) e `monthKeysError` di phasing, ptc e planning contro il periodo finale (`DATE_RULE`).
3. Le scritture: `UPDATE projects` sui campi di `header` e sulle colonne di sezione; `DELETE`+`INSERT` di `project_tasks` se c'è `tasks`.

Un errore di una regola annulla tutto: né testata, né sezioni, né riga in `change_log`. Dopo il commit restano gli effetti di oggi: `enqueueProjectCode` quando cambiano nome, codice, descrizione o le descrizioni dei task; `copyVersionTagsToProject` e coda del profilo al primo link.

La risposta è la fotografia di `project`.

### 2.3 Generate — `POST /api/cost-grids/:id/versions/:vId/projects`

Body: `{ name, code, programId, clientId, startDate, endDate, description, tasks, ptc, taskIds, taskNames }`.

- Prima della transazione: permesso di modifica sulla grid (`403`); `versionScope` (`404` per una versione fuori dalla grid).
- Una transazione con `lockVersion(client, vId)`:
  1. `projectCreateError` e `linkCurrencyError` (`PROJECT_RULE`). La valuta e lo stage del progetto si leggono **dalla versione**, non dal body.
  2. `periodError`, `taskDatesError`, sold hours, `amountError`, `ptcRowsError` e `monthKeysError` (gli stessi codici di §2.2).
  3. Dentro `versionedWrite(client, { type: 'project', action: 'create' })`: `INSERT projects` (id generato dal server, proprietario chi chiama), la share `owner`, `project_tasks`, ptc, la riga di `cg_version_projects` con `taskIds`/`taskNames`, e la copia dei tag della versione.
- Dopo il commit: la coda del profilo per il codice.
- Risposta `201` con la fotografia di `project`. Un rifiuto annulla tutto: nessun progetto, nessun link.

### 2.4 Add tasks — `POST /api/cost-grids/:id/versions/:vId/projects/:projectId/tasks`

Body: `{ tasks, taskIds, taskNames }`.

- Prima della transazione: permesso di modifica sulla grid **e** sul progetto (`403`); progetto inesistente → `404`.
- Una transazione con `lockVersion(client, vId)`, dentro `versionedWrite(client, { type: 'project', id: projectId, unchecked: true, action: 'update' })`:
  1. `linkCurrencyError` quando la riga di link non esiste ancora.
  2. Le regole dei task nuovi contro il periodo **registrato**, sotto il lock della riga: `taskListError`, sold hours, `amountError` nella valuta del progetto, e `taskDatesError` sull'elenco esistente più i nuovi.
  3. `INSERT` dei task nuovi con `sort_order` dopo l'ultimo; upsert della riga di link con l'**unione** di `task_ids` e `task_names_direct`.
- Risposta: la fotografia di `project`. Nessun campo del progetto oltre ai task e al link viene scritto.

### 2.5 Link versione↔progetto

- `POST …/linked-projects` resta, per l'API e per i test. Fa l'upsert con l'**unione** delle liste invece di sostituirle, e gira dentro `versionedWrite(project, unchecked)` sotto il lock di versione.
- `DELETE …/linked-projects/:projectId` (rifiutato per chi non è sysadmin) gira dentro `versionedWrite(project, unchecked)`.

### 2.6 Programmi — `api/src/routes/config.js`

- `POST /programs`: `versionedWrite create` di `program`. Comportamento e risposte invariati.
- `POST /programs/:id/share`: i controlli di oggi restano prima della transazione. Poi, in **una** `versionedWrite(pool, { type: 'program', id, unchecked: true, action: 'update' })`, l'upsert per ogni progetto con un permesso che **non scende mai** (rango `owner` > `editor` > `viewer`): `DO UPDATE SET permission = CASE WHEN rank(EXCLUDED) > rank(attuale) THEN EXCLUDED ELSE attuale END`. La risposta aggiunge `{ granted, raised, kept }`: righe nuove, righe alzate, righe lasciate a un permesso uguale o più alto. Email e notifica partono dopo il commit, come oggi.
- `PATCH /programs/:id` e `DELETE /programs/:id`: dentro `versionedWrite(program, unchecked)`, senza cambiare comportamento.

### 2.7 Altre scritture su `projects`

- `POST /api/projects`: dentro `versionedWrite create` di `project`, senza cambiare comportamento.
- `DELETE /api/projects/:id`: dentro `versionedWrite(project, unchecked, delete)`, senza cambiare comportamento.

### 2.8 Route tolte

`PATCH /api/projects/:id`, `PUT /api/projects/:id/tasks`, `PATCH /api/projects/:id/phasing`, `/ptc`, `/planning` e `/groups` vengono cancellate. I test di `test-api.js` che le usano passano a `PUT /api/projects/:id` con un helper che legge la versione. PR-01..PR-14 mantengono i loro codici e messaggi attesi.

### 2.9 Letture

`GET /api/projects` restituisce `version` e i `links` del progetto. `_apiProjectToLocal` porta `version` in memoria.

## 3. Client

### 3.1 `js/lib/project-draft.js` (nuovo, modulo puro)

Funzioni pure, esportate come ES module con il ponte su `window`:

- `projectSavable(project)` → `{ header, tasks, phasing, ptc, planning, groups }`. Normalizza come oggi: `clientId` non UUID → `null`, `costGridRef.versionId` → `cgVersionId`, ruoli vuoti dei gruppi tolti.
- `projectChanges(base, draft)` → il body di §2.2 senza `version`: `header` con i soli campi cambiati, e ogni sezione solo se cambiata.
- `projectIsDirty(base, draft)`.

### 3.2 `js/api-sync.js`

- `_saveProject(base, draft)` → `apiSave('PUT', '/projects/:id', { version: draft.version, ...projectChanges(base, draft) })`, e restituisce l'esito.
- `_generateProject(cgId, vId, body)` e `_addTasksToProject(cgId, vId, projectId, body)` → `apiSave('POST', …)` sulle route di §2.3 e §2.4.
- Vengono cancellati `_pushProjectToApiDetailed`, `_pushProjectToApi`, `skipEmpty`, il fallback `POST` e `_deleteProjectFromApi`. L'intestazione del file e il commento di `persistConfig` in `js/core.js` non li nominano più.

### 3.3 project-config

- La base è il progetto come caricato (o adottato dopo l'ultimo salvataggio riuscito).
- `onSave` mantiene i controlli lato pagina di oggi, poi chiama `_saveProject`:
  - **ok:** `config.projects` adotta la risposta; la pagina va al portfolio come oggi;
  - **conflict** e **unknown:** il messaggio nell'area d'errore, con un'azione **Reload** che chiede "Discard your unsaved changes and reload this project?";
  - **rule** ed **error** (compreso `404 Project not found`): il messaggio. Il progetto non viene mai ricreato.
- Lo stage si manda solo se l'utente l'ha cambiato, quindi project-config non sovrascrive più lo stage propagato dalla cost grid.
- La creazione di un programma passa da `apiSave('POST', '/programs', …)`.
- `summarizePushResult` (`js/lib/project-push-result.js`) e `withPeriod` vengono cancellati, insieme ai loro test.

### 3.4 costgrid — Generate e Add tasks

- **Generate** chiama `_generateProject`. Solo con l'esito ok:
  - il progetto della risposta entra in `config.projects`;
  - il link entra in `_cgDraft.linkedProjects` e in `_cgStore`;
  - compaiono il messaggio di successo e la domanda "Open configuration?".

  Altrimenti compare il motivo e la memoria resta com'era. Il progetto non entra più in `config.projects` prima della risposta.
- **Add tasks** chiama `_addTasksToProject` con i soli task nuovi. Con l'esito ok, `config.projects` adotta la risposta e il link in memoria prende `taskIds`/`taskNames` dalla risposta. Altrimenti compare il motivo e né il progetto né il link in memoria cambiano.
- Il controllo dei task fuori periodo lato pagina (`cgOutOfPeriodNotice`) resta un avviso preventivo sui task nuovi: il server decide.
- La creazione di un programma dal modale di Generate passa da `apiSave('POST', '/programs', …)`.

### 3.5 Condivisione di un programma — `js/shares.js`

La condivisione passa da `apiSave('POST', '/programs/:id/share', …)`. Con l'esito ok, il messaggio riporta i conteggi, per esempio "Shared 3 projects; 2 kept their higher access."; altrimenti il motivo.

### 3.6 Metodi `Api.*`

Vengono cancellati da `js/api.js`: `projects.create`, `projects.update`, `projects.delete`, `projects.saveTasks`, `projects.phasing`, `projects.ptc`, `projects.planning`, `projects.groups`, `costGrids.versions.linkedProjects.add`, `programs.create`, `programs.share`.

## 4. Guard — `scripts/save-contract-guard.test.js`

- **Lato server:** escono da `SERVER_EXEMPT` e vanno in `RETIRED` `api/src/routes/projects.js: projects` e `api/src/routes/config.js: programs`. `REGISTERED_TABLES` aggiunge `project_tasks` e `cg_version_projects`.
- **Lato client:**
  - escono da `CLIENT_EXEMPT` e vanno in `RETIRED` le voci `js/api-sync.js: projects.*`, `js/costgrid.js: costGrids.versions.linkedProjects.add` e `js/pages/costgrid.js: programs.create`;
  - `js/pages/project-config.js` e `js/shares.js` passano da voce per file a voci per scrittura, con le sole scritture che restano a cicli successivi.

## 5. Cache-busting

Si incrementa ogni `?v=N` di `js/api-sync.js`, `js/api.js`, `js/costgrid.js`, `js/core.js`, `js/shares.js`, `js/pages/costgrid.js`, `js/pages/project-config.js` e del nuovo `js/lib/project-draft.js`, in tutte le pagine che li caricano. Per `js/lib/project-push-result.js` si toglie il tag `<script>`.

## 6. Documentazione

- `docs/js/api-sync.md`: `_saveProject`, `_generateProject`, `_addTasksToProject`; nessun fallback.
- `docs/pages/project-config.md`: il Save con versione, conflitto e Reload.
- `docs/pages/costgrid.md`: Generate e Add tasks.
- `docs/js/lib.md`: `project-draft.js` aggiunto, `project-push-result.js` tolto.
- `docs/api/services.md`: le entità `project` (fotografia allargata) e `program`.
- `docs/api/config.md`: creazione e condivisione dei programmi.
- La documentazione delle route di progetti e cost grid indicata da CLAUDE.md, e `handbook/restricted/ARCHITECTURE.md` se nomina le route tolte.
- `handbook/public/manual.md`: il Save di project-config e la condivisione di un programma.
- `handbook/restricted/TEST_CASES.md`: i casi nuovi.
- CLAUDE.md:
  - la tabella "Key sync functions" senza `_pushProjectToApi`, il fallback POST e `skipEmpty`;
  - "Data strategy" e "Save contract";
  - "Project currency lock": le route che chiamano le regole.

## 7. Verifica

- **vitest:**
  - `js/lib/project-draft.test.js`: campi cambiati; sezioni cambiate e invariate; `pipeline` assente se invariato; normalizzazione di `clientId`;
  - un test di flusso su `js/api-sync.js` con `apiFetch` simulato: un 404 al Save non produce alcun `POST`; un 500 mostra il suo messaggio; Generate e Add tasks non toccano la memoria su un esito diverso da ok.
- **node:test:** le regole pure eventualmente estratte (rango dei permessi).
- **`test-api.js`:**
  - Save di un progetto cancellato → `404`, e il progetto non c'è nel DB;
  - due Save dalla stessa versione → il secondo riceve `409 STALE`, e i dati del primo restano;
  - un Save con il phasing rifiutato e i task cambiati non lascia scritti né i task né la testata;
  - un Save che stringe il periodo e manda il phasing nel periodo nuovo passa;
  - Add tasks dopo un Save di project-config non riporta indietro nome, stato, periodo né sezioni, e il link contiene l'unione dei task;
  - Generate con una regola violata non lascia né progetto né link;
  - `POST …/linked-projects` unisce le liste invece di sostituirle;
  - la condivisione di un programma a un owner o a un editor esistente come viewer non lo abbassa, e restituisce i conteggi;
  - ogni Save, Generate, Add tasks, creazione e condivisione di programma lascia una riga in `change_log`; un salvataggio rifiutato non ne lascia;
  - PR-01..PR-14, portati sulla nuova route, restano verdi.
- **A mano su branch stack:** Add tasks da una costgrid aperta prima di un Save in project-config, su due schede; il Reload su conflitto in project-config; il messaggio dei conteggi della condivisione.

## Criteri di accettazione

1. **Niente ricreazione** — salvare un progetto cancellato nel frattempo dà "Project not found" e il progetto non riappare nel DB (`test-api.js`; vitest: nessun `POST` dopo un 404).
2. **Errore vero** — un 500 al Save mostra quel messaggio, non un errore di chiave duplicata (vitest).
3. **Conflitto** — due Save dello stesso progetto dalla stessa versione: il secondo riceve `409 STALE` e i dati del primo restano (`test-api.js`). A mano: project-config mostra il motivo con Reload.
4. **Tutto o niente** — un Save con una sezione rifiutata non lascia scritta nessun'altra parte (`test-api.js`).
5. **Add tasks** — dopo una modifica in project-config, Add tasks da una costgrid aperta prima non riporta nome, stato, periodo né sezioni ai valori vecchi (`test-api.js`; a mano su due schede).
6. **Link** — un fallimento di Generate o di Add tasks viene mostrato e la memoria non segna i task come assegnati; dopo il reload i task sono coerenti con il server (vitest; `test-api.js` per Generate atomico e per l'unione del link).
7. **Condivisione di un programma** — condividere come viewer a un editor o a un owner esistente non lo abbassa; la condivisione è atomica e la risposta riporta i conteggi (`test-api.js`; a mano il messaggio).
8. **Superficie di sicurezza** — nessun percorso client crea un progetto a partire da un salvataggio fallito: `Api.projects.create` non esiste più e il guard lo pinna; Generate richiede il permesso di modifica sulla grid (`test-api.js`).
9. **Registro** — ogni salvataggio riuscito di progetto o programma lascia una riga in `change_log`, e uno rifiutato no (`test-api.js`).
10. **Stage** — un Save di project-config che non cambia lo stage non lo manda (vitest su `project-draft.js`).
11. **Guard** — le voci di §4 sono ritirate e `scripts/save-contract-guard.test.js` passa.
12. **Suite** — `npm test`, i test backend e `scripts/run-tests.sh` passano, PR-01..PR-14 compresi.
13. **Documentazione** — i documenti di §6 sono aggiornati; nella tabella "Key sync functions" di CLAUDE.md non compaiono più `_pushProjectToApi`, il fallback POST né `skipEmpty`; `scripts/claude-md-guard.test.js` e `scripts/doc-paths-guard.test.js` passano.
14. **Backlog** — le voci aperte di `docs/BACKLOG.md` su `js/api-sync.js`, `project-config` e `routes/projects.js` sono rilette (tra queste B-168, B-171, B-237 e B-242), compresi i residui di design D6/D7 del 2026-10-01; quelle superate si chiudono al Gate 5 con il controllo eseguito.

## Scope escluso

- Tag del progetto: ciclo 4.
- Condivisioni singole di progetti e cost grid: ciclo 7.
- Eliminazione e scollegamento dei progetti; `PROJECT_REMOVAL_ENABLED` resta `false`.
- Upload delle actuals da project-config: ciclo 5.
- Validazione del contenuto di `groups`.
- `api/src/routes/reset.js`.

## Finding nuovi (da proporre come Brief futuri, non in questo ciclo)

- `POST /api/projects` con `cgVersionId` non controlla l'accesso alla grid di quella versione: chi conosce un id di versione può creare un progetto collegato a quella versione e riceverne i tag. Il ciclo chiude solo il percorso di Generate (§2.3); la route resta com'è.

## Decisioni aperte

1. **Un endpoint unico e transazionale per il Save del progetto (`PUT /api/projects/:id`), con le vecchie route di testata e di sezione cancellate.** Alternativa scartata: sezioni separate, ognuna con la propria versione, e un esito che dica cosa è stato salvato. Perché: è l'unico modo di avere tutto o niente (SY-10), e il ciclo 2 ha fatto lo stesso sulle cost grid.
2. **Generate passa a una route dedicata sotto la versione, che crea progetto, task, ptc e link in una transazione; `POST /api/projects` resta per i test e il sysadmin, dentro `versionedWrite`.** Alternativa scartata: estendere `POST /api/projects` con sezioni e link. Perché: il link richiede il permesso di modifica sulla grid, e così creazione e link non possono più separarsi.
3. **Add tasks è un append senza la versione del client (`unchecked`).** Alternativa scartata: append con la versione del progetto e 409, come suggerisce il Brief. Perché: la copia del progetto in costgrid è vecchia per costruzione e darebbe 409 quasi sempre; l'append, sotto il lock della riga, non sovrascrive nulla.
4. **Il link aggiunge solo, per unione; nessuna operazione di rimozione puntuale.** Alternativa scartata: liste intere con versione, oppure aggiunta e rimozione puntuali. Perché: nessuna interfaccia toglie singoli task da un link.
5. **La condivisione di un programma non abbassa mai un permesso, e la risposta conta concessi, alzati e mantenuti, mostrati nel modale.** Alternativa scartata: applicare il permesso scelto solo ai progetti non ancora condivisi. Perché: alza chi ha meno e non declassa mai un owner o un editor.
6. **Le route `PATCH /:id`, `PUT /:id/tasks` e le quattro `PATCH` di sezione vengono cancellate, e i loro test vengono portati sulla nuova route.** Alternativa scartata: tenerle dentro `versionedWrite`. Perché: un solo percorso di scrittura per il progetto, e i metodi `Api.*` rimasti senza chiamanti si cancellano.
