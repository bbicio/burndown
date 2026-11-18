# Contratto di salvataggio, ciclo 2: editor cost grid con solo Save — design spec

**Date:** 2026-11-18
**Brief started:** 2026-11-17 17:32
**Brief:** `docs/superpowers/briefs/2026-11-17-save-c2-costgrid-save-only-brief.md`
**Audit:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md` (SY-02, SY-05, SY-06, SY-07, SY-09, SY-14)
**Scenario:** 2 (evoluzione su base audit)
**Classe di rischio:** high-risk (file condivisi `js/costgrid.js`/`js/api-sync.js` caricati da `pipeline.html` e `costgrid.html`; money: valuta e tasso della versione)
**Security surface:** no

L'editor delle cost grid smette di salvare in background. Si salva solo con **Save**, con il contratto del ciclo 1:

- il Save manda la versione di partenza e solo ciò che è cambiato;
- il server lo scrive in una transazione e registra la fotografia;
- il client adotta la risposta;
- su conflitto offre Reload.

L'editor sa quando la bozza non è salvata e lo dice prima di uscire. Il cambio di stage arriva a `projects.pipeline` sul server.

## 1. Fatti verificati

- Il Save esiste già (`cgSaveVersion`, `js/costgrid.js:767`), ma passa da `cgAutoSave` → `_cgUpsertVersionToApi` (`js/api-sync.js:168`). Quel percorso fa tre scritture separate:
  - `PATCH /api/cost-grids/:id`, con il nome della grid. L'editor non modifica mai quel nome: lo rimanda e basta.
  - `PATCH /api/cost-grids/:id/versions/:vId`, con tutta la testata, `linkedProjects` e `status` compresi (il server ignora questi ultimi due).
  - `PUT …/structure`, con fasi, task, ruoli e periodo.
- `cgScheduleAutoSave` (debounce di 2 s) è chiamato da circa 30 handler di `js/pages/costgrid.js` e da tre `@change` in `costgrid.html`. `cgAutoSave` è chiamato direttamente da `onPipelineChange`, `onCurrencyChange` (due punti), `switchVersion`, `goBack`, `openLinkedProject`, `cgDoGenerateProject`, `cgDeleteLinkedProject`, Publish, New version e Clone.
- `_cgUpsertVersionToApi` ha un solo altro chiamante, `cgImportAll` (`js/costgrid.js:1712`), che nessun file usa.
- `PUT …/structure` è già transazionale. Il `PATCH` della versione prende il lock di versione (`withVersionLock`) solo per il cambio di valuta o di periodo.
- Su `phases`, `tasks` e `task_roles` scrive solo `api/src/routes/cost-grids.js`.
- `projects.pipeline` è letto da `reporting.js`, `exports.js`, `projects.js`, `planning-data.js` e `planning-assistant.js`.
- Le eccezioni del guard (`scripts/save-contract-guard.test.js`) sono per file lato client e per coppia `(file, tabella)` lato server. `clientWrites` restituisce già il nome del metodo `Api.*` di ogni scrittura.
- Nessuno dei tre file client può uscire per intero dalle eccezioni in questo ciclo, perché restano:
  - in `js/costgrid.js`: Generate e link (ciclo 3), più il ciclo di vita, escluso dal Brief;
  - in `js/pages/costgrid.js`: tag (ciclo 4), `programs.create` e reassign-owner;
  - in `js/api-sync.js`: le scritture dei progetti (ciclo 3).

## 2. Server

### 2.1 Entità registrate — `api/src/services/saved-entities.js`

- **`cost_grid_version`**: tabella `cost_grid_versions`, messaggio di conflitto "This version was changed by someone else since you opened it.", 404 "Version not found". La fotografia è la riga di testata (le colonne di `GET …/versions`, con `version`) più la struttura nella stessa forma di `GET …/structure`.
- **`cost_grid`**: tabella `cost_grids`, la riga della grid con `version`.
- **`project`**: tabella `projects`, la riga del progetto con `version`. Il ciclo 3 allargherà la fotografia alle sezioni.

### 2.2 `versionedWrite` — opzione `unchecked`

`versionedWrite(db, { …, unchecked: true })` serve a una scrittura iniziata dal server, non da una bozza del client. Fa tutto ciò che fa per un update o una delete:

- prende il lock della riga;
- fa salire `version`;
- scrive la riga in `change_log`.

Non confronta `expectedVersion`, e la passa nel log come versione letta sotto lock. Senza `unchecked`, il comportamento del ciclo 1 resta identico. È ammessa solo per `update` e `delete`.

### 2.3 La route del Save — `PUT /api/cost-grids/:id/versions/:vId`

Body: `{ version, header?, structure? }`.

- `header` contiene solo i campi della testata cambiati, presi tra `label, pipeline, startDate, endDate, currency, note, ratecardId, clientId, projectName`. Un campo fuori da questo elenco (`linkedProjects`, `status`, …) riceve `400`.
- `structure` è `{ phases, roles }` e c'è solo se la struttura è cambiata.
- Un body senza `header` né `structure` riceve `400 Nothing to update`.

Tutto gira in **un** `versionedWrite(pool, { type: 'cost_grid_version', id: vId, expectedVersion: version, action: 'update' })`. Dentro `write(client)`:

1. `canEdit` è controllato prima della transazione, come oggi. Una versione `locked` riceve `400 Version is locked`.
2. `lockVersion(client, vId)`: lo stesso lock advisory che oggi serializza valuta e link.
3. Le regole di oggi, con gli stessi codici e messaggi:
   - `periodChangeError` e `taskDatesError`/`taskPeriodError` sul periodo e sui task insieme (`DATE_RULE`);
   - `versionCurrencyChangeError` e il tasso deciso dal server (`PROJECT_RULE`, `CURRENCY_RULE`);
   - `structureBodyError`, le ore vendute, `STRUCTURE_RULE` e `MONEY_RULE` sulla struttura.

   Il periodo controllato contro i task è quello nuovo se `header` lo cambia, altrimenti quello registrato. I task controllati sono quelli di `structure` se presente, altrimenti quelli registrati.
4. `UPDATE cost_grid_versions` sui campi di `header`, più `currency_rate` quando cambia la valuta.
5. La scrittura della struttura, come fa oggi `PUT …/structure`.
6. **Propagazione dello stage.** Se `header.pipeline` è diverso dallo stage registrato, ogni progetto collegato riceve `UPDATE projects SET pipeline` dentro `versionedWrite(client, { type: 'project', id, unchecked: true, action: 'update' })`. Sono collegati i progetti con una riga in `cg_version_projects` o con `projects.cg_version_id = vId`; un progetto che ha già quello stage resta com'è. La notifica agli admin (`notifyAdminsPipelineChange`) parte dopo il commit, come oggi.

La risposta è la fotografia di `cost_grid_version`, cioè testata con la nuova `version` più struttura. Un errore di una regola annulla tutto (rollback): né testata, né struttura, né progetti, né riga in `change_log`.

### 2.4 Le altre scritture su `cost_grids` e `cost_grid_versions`

Passano per `versionedWrite` senza cambiare comportamento, cioè senza versione dal client e senza nuovi 409:

| Route | Azione |
|---|---|
| `POST /api/cost-grids` | `create` di `cost_grid` |
| `DELETE /api/cost-grids/:id` | `delete` di `cost_grid`, `unchecked` |
| `PATCH /api/cost-grids/:id/reassign-owner` | `update` di `cost_grid`, `unchecked` |
| `POST /:id/versions` | `create` di `cost_grid_version` |
| `DELETE /:id/versions/:vId` | `delete` di `cost_grid_version`, `unchecked` |
| `POST /:id/versions/:vId/duplicate` | `create` di `cost_grid_version`, con la struttura copiata dentro la `write` |
| `POST /:id/versions/:vId/publish` | `update` di `cost_grid_version`, `unchecked`, più la propagazione dello stage di §2.3 punto 6 |
| `POST /:id/versions/:vId/refresh-rate` | `update` di `cost_grid_version`, `unchecked` |

Siccome publish e refresh-rate fanno salire la versione, un editor rimasto aperto riceve `409 STALE` al Save successivo, e così deve essere. Le regole di oggi (solo Draft, versione bloccata, ecc.) restano dentro la `write`, con gli stessi codici e messaggi.

### 2.5 Route tolte

`PATCH /api/cost-grids/:id`, `PATCH /api/cost-grids/:id/versions/:vId` e `PUT /api/cost-grids/:id/versions/:vId/structure` vengono cancellate. I loro chiamanti passano alla route di §2.3 oppure non esistono più.

### 2.6 Letture

`GET /api/cost-grids` (le versioni annidate), `GET …/versions` e `GET …/structure` restituiscono `version` della versione. `_cgApiVersionToLocal` la porta in memoria come `version`.

## 3. Client

### 3.1 `js/lib/cg-draft.js` (nuovo, modulo puro)

Funzioni pure, esportate come ES module con il ponte su `window`:

- `cgSavableState(draft)` → `{ header, structure }`. `header` contiene i campi di §2.3, normalizzati (`clientId` `'__unassigned__'` → `null`, stringhe vuote → `''`). `structure` è `{ phases, roles }` con i soli campi che il server salva.
- `cgChangedHeader(base, draft)` → l'oggetto dei soli campi cambiati. Non contiene mai `linkedProjects` né `status`.
- `cgStructureChanged(base, draft)` → booleano.
- `cgIsDirty(base, draft)` → `Object.keys(cgChangedHeader(…)).length > 0 || cgStructureChanged(…)`.

La **base** è `cgSavableState` della bozza appena aperta (`openVersion`), ricatturata dopo ogni Save riuscito sulla bozza che adotta la risposta del server.

### 3.2 Niente autosave

- `js/costgrid.js` ha un interruttore unico, `CG_AUTOSAVE_ENABLED = false`.
- `cgScheduleAutoSave` resta ed è sempre chiamato dagli handler. A interruttore spento non avvia il timer: aggiorna solo l'indicatore (§3.4). A interruttore acceso fa ciò che fa oggi.
- `cgAutoSave` resta e chiama il Save di §3.3, così riaccendere l'autosave richiede solo il flag.
- Le chiamate dirette a `cgAutoSave` elencate in §1 vengono tolte tutte. Stage e valuta diventano normali modifiche della testata. `cgDoGenerateProject` e `cgDeleteLinkedProject` non salvano più la bozza: i campi `linkedProjects` e `status` che mandavano non erano persistiti.

### 3.3 Save — `_cgSaveVersion(cgId, verId)` in `js/api-sync.js`

Sostituisce `_cgUpsertVersionToApi`, che viene cancellato insieme a `cgImportAll` (morto).

1. Calcola `header = cgChangedHeader(base, draft)` e `structure`, quest'ultima solo se `cgStructureChanged`. Se nessuno dei due è cambiato, non c'è scrittura.
2. `apiSave('PUT', '/cost-grids/:id/versions/:vId', { version: draft.version, header, structure })`.
3. Esito:
   - **ok:** la bozza adotta la risposta, cioè testata, `version`, struttura con gli id del server e `currency_rate`. Se c'era un cambio di valuta in sospeso (`_cgCurrencyChangePending`), `cgAdoptServerRate` risincronizza i ruoli al tasso del server, come oggi. Lo stage nuovo si propaga in `config.projects` in memoria (`cgPropagatePipelineToProjects`, chiamato solo qui). `_cgStore` viene aggiornato e la base ricatturata.
   - **conflict / unknown:** la bozza resta a video, invariata. Lo stato diventa "Not saved: <message>" con Reload.
   - **rule / error:** la bozza resta a video. Lo stato diventa "Not saved: <message>".

   Il flag del cambio di valuta resta finché un Save non riesce.
4. Restituisce l'esito al chiamante: il bottone Save, il "Save first?" di §3.6 e `cgAutoSave`.

`cgSaveVersion` ignora un secondo clic mentre il Save è in corso, come oggi.

### 3.4 Indicatore dello stato

In `costgrid.html`, dentro `.ph-actions` e prima del bottone Save, un elemento `role="status"` con testo e stile da `css/costgrid.css` (token, niente colori fissi):

| Stato | Testo |
|---|---|
| base == bozza, ultimo Save riuscito o appena aperto | `All changes saved` |
| bozza diversa dalla base | `Unsaved changes` |
| Save in corso | `Saving…` |
| ultimo Save non riuscito | `Not saved: <reason>`, più **Reload** per conflict/unknown |

Lo stato resta finché è vero: nessun toast, nessun timer. Il bottone Save è disabilitato quando la bozza non è modificata e non c'è un Save fallito da ripetere. Reload chiede "Discard your unsaved changes and reload this version?" e, se confermato, riapre la versione dal server (`openVersion`). Il toast `#cgAutoSaveToast` resta nell'HTML di `costgrid.html` e `pipeline.html`, perché serve all'autosave quando l'interruttore è acceso.

### 3.5 Uscita con modifiche non salvate

- **Indietro**, **cambio di versione** e **link al progetto**: se `cgIsDirty`, `showConfirm("You have unsaved changes. Leave without saving?")` con Leave / Stay. Leave procede senza salvare. Se la bozza non è modificata, nessuna domanda. `goBack` perde l'attesa fissa di 500 ms.
- **Sidebar, chiusura e ricarica della scheda**: un `beforeunload` registrato da `js/pages/costgrid.js` chiede la conferma nativa del browser solo se `cgIsDirty`.
- Nessun salvataggio implicito, in nessuno di questi casi.

### 3.6 Azioni che oggi salvano prima di partire

**Generate project**, **Publish**, **New version** e **Clone** (quest'ultimo solo se clona la versione aperta) controllano `cgIsDirty`:

- con la bozza pulita procedono come oggi;
- con la bozza modificata chiedono "You have unsaved changes. Save them first?" con *Save and continue* / *Cancel*. *Save and continue* esegue §3.3: se riesce l'azione parte, altrimenti si annulla e l'indicatore mostra il motivo.

Publish e Generate non partono mai da una bozza non salvata. Publish, se riesce, ricarica la pagina come oggi.

### 3.7 Nuova grid e Clone

- `cgCreateNewGrid` crea la grid e la versione come oggi. La struttura iniziale passa per la route di §2.3 con `version` 0 della versione appena creata. Se fallisce, `cgDiscardNewGrid` scarta la grid e l'errore viene mostrato, come per gli altri passi (SY-14).
- `cgCloneGrid` fa lo stesso per la struttura copiata.

### 3.8 Metodi `Api.*`

`Api.costGrids.update`, `Api.costGrids.versions.update` e `Api.costGrids.versions.saveStructure` vengono cancellati da `js/api.js`. Le scritture nuove passano da `apiSave`.

## 4. Guard — `scripts/save-contract-guard.test.js`

- **Lato server:** escono da `SERVER_EXEMPT` e vanno in `RETIRED` `api/src/routes/cost-grids.js: cost_grids` e `api/src/routes/cost-grids.js: cost_grid_versions`. `REGISTERED_TABLES` aggiunge `phases`, `tasks` e `task_roles`: su queste tabelle scrive solo `cost-grids.js`, e ogni sua scrittura sta ormai dentro `versionedWrite`.
- **Lato client:** `CLIENT_EXEMPT` accetta, accanto alle voci per file, voci per scrittura nella forma `file: nome`, dove il nome è quello restituito da `clientWrites` (es. `js/costgrid.js: costGrids.versions.publish`). Per `js/costgrid.js`, `js/pages/costgrid.js` e `js/api-sync.js` la voce per file si sostituisce con una voce per ogni scrittura che resta. Una voce per scrittura senza violazione fallisce, come quelle per file.
- **`RETIRED`** riceve `js/api-sync.js: costGrids.update`, `js/api-sync.js: costGrids.versions.update`, `js/api-sync.js: costGrids.versions.saveStructure`, `js/costgrid.js: costGrids.versions.saveStructure`.
- I test del guard dimostrano il fallimento su una scrittura fuori da una lista per scrittura e su una voce per scrittura senza violazione.

## 5. Cache-busting

Si incrementa ogni `?v=N` di `js/costgrid.js`, `js/api-sync.js`, `js/api.js`, `js/pages/costgrid.js`, `css/costgrid.css` e del nuovo `js/lib/cg-draft.js`, in tutte le pagine che li caricano (`costgrid.html`, `pipeline.html` e le altre restituite da grep).

## 6. Documentazione

- `docs/pages/costgrid.md`: Save, indicatore, uscita con modifiche, "Save first?".
- `docs/js/costgrid.md`: autosave dietro `CG_AUTOSAVE_ENABLED`, `cgAutoSave` → §3.3, `cgImportAll` tolto.
- `docs/js/api-sync.md`: `_cgSaveVersion`.
- `docs/js/lib.md`: `cg-draft.js`.
- `docs/api/services.md`: le entità nuove e `unchecked`.
- `handbook/restricted/ARCHITECTURE.md` se le sue sezioni nominano le route tolte.
- `handbook/public/manual.md`: il Save dell'editor.
- `handbook/restricted/TEST_CASES.md`: i casi del Save.
- Intestazione di `js/api-sync.js`: non dice più che tutto è fire-and-forget.
- CLAUDE.md:
  - "Pipeline stage": lo stage arriva a `projects.pipeline` sul server con il Save della versione, e non è più "safe because of the propagation" in memoria;
  - "Data strategy" e "Save contract": l'editor delle cost grid salva secondo il contratto;
  - la riga di `api/src/routes/...` nel blocco File structure, se nomina le route tolte.

## 7. Verifica

- **vitest:**
  - `js/lib/cg-draft.test.js`: campi cambiati, struttura cambiata, `linkedProjects`/`status` mai inclusi, normalizzazione di `clientId`;
  - un test di flusso su `js/costgrid.js`/`js/api-sync.js` con `apiFetch` simulato: una modifica seguita da un'attesa di 3 s (timer finti) non produce scritture; Save produce un solo `PUT` sul path di §2.3 senza `linkedProjects`/`status`; con 500 e con timeout compare "Not saved" e la bozza resta; le conferme di uscita con bozza modificata e con bozza pulita.
- **node:test:** `versionedWrite` con `unchecked` (sale la versione, scrive il log, nessun 409) e il rifiuto di `unchecked` su `create`.
- **`test-api.js`:**
  - due Save dalla stessa versione: il secondo riceve `409 STALE` e lo stage del primo resta;
  - un cambio di stage salvato porta `projects.pipeline` dei progetti collegati al nuovo stage e fa salire la loro `version`;
  - ogni Save riuscito lascia una riga `cost_grid_version` in `change_log` con testata e struttura; un Save rifiutato non ne lascia;
  - un body con `linkedProjects` riceve `400`;
  - il cambio di valuta applica il tasso del server;
  - publish fa salire la versione.
- **A mano su branch stack:** i criteri marcati "a mano". Screenshot dell'editor con `scripts/shoot.mjs`, uno per stato dell'indicatore, riletti.

## Criteri di accettazione

1. **Niente autosave** — modificare un'ora e aspettare non genera alcuna richiesta di scrittura, mentre Save ne genera una sola (test vitest di §7; a mano su branch stack, dalla scheda Network).
2. **Conflitto** — due editor sulla stessa versione: B salva dopo A e riceve il conflitto, e lo stage scelto da A resta sul server (`test-api.js`). A mano: B vede "Not saved: …" con Reload e la sua bozza resta a video.
3. **Errore visibile** — un 500 o un timeout al Save mostrano "Not saved" con il motivo, e la bozza resta a video (test vitest).
4. **Uscita** — con modifiche non salvate, Indietro, cambio di versione, link al progetto e chiusura della scheda chiedono conferma; senza modifiche no (vitest per i primi tre; a mano per la chiusura della scheda e la sidebar).
5. **Azioni protette** — Generate, Publish, New version e Clone della versione aperta, con modifiche non salvate, chiedono "Save first?". Un Save fallito annulla l'azione (a mano).
6. **Stage nei progetti** — dopo un cambio di stage salvato, `projects.pipeline` dei progetti collegati è uguale al nuovo stage (`test-api.js`).
7. **Payload** — la richiesta di Save non contiene mai `linkedProjects` né `status`, e il server rifiuta un body che li contiene (vitest e `test-api.js`).
8. **Registro** — ogni Save riuscito lascia una riga in `change_log` con la fotografia di testata e struttura (`test-api.js`).
9. **Valuta** — il cambio di valuta mantiene il comportamento attuale del tasso: i test esistenti restano verdi, più il caso nuovo di §7 (tasso adottato dalla risposta del Save).
10. **Nuova grid** — un fallimento del salvataggio della struttura iniziale viene mostrato e la grid scartata (vitest).
11. **Indicatore** — gli stati di §3.4 compaiono nel page head dell'editor (screenshot `shoot.mjs` letti).
12. **Guard** — le voci di §4 sono ritirate, `CLIENT_EXEMPT` è granulare per i tre file e `scripts/save-contract-guard.test.js` passa.
13. **Suite** — `npm test`, i test backend e `scripts/run-tests.sh` passano.
14. **Documentazione** — i documenti di §6 sono aggiornati, compreso CLAUDE.md "Pipeline stage", "Data strategy" e "Save contract", e l'intestazione di `js/api-sync.js`. `scripts/claude-md-guard.test.js` e `scripts/doc-paths-guard.test.js` passano.
15. **Backlog** — le voci aperte di `docs/BACKLOG.md` su `js/costgrid.js`, `js/pages/costgrid.js` e `js/api-sync.js` sono rilette, e quelle superate si chiudono al Gate 5 con il controllo eseguito.

## Scope escluso

- Generate project (le sue scritture), "Add tasks to project" e il link versione↔progetto: ciclo 3.
- Tag della versione: ciclo 4.
- Il comportamento del ciclo di vita della grid (delete, duplicate, refresh-rate, reassign, publish). Qui passa solo dentro `versionedWrite` senza cambiare comportamento (§2.4).
- La rimozione di `_cgStore` e del codice dell'autosave.

## Finding nuovi (da proporre come Brief futuri, non in questo ciclo)

- Il `PATCH` di `project-config.html` rimanda `pipeline` preso da `config.projects`, e può riportare indietro uno stage che il server ha propagato. Riguarda il ciclo 3.

## Decisioni aperte

1. **Tutte le scritture di `cost-grids.js` su `cost_grids` e `cost_grid_versions` passano per `versionedWrite`; quelle del ciclo di vita con `unchecked`, senza nuovi 409.** Alternativa scartata: migrare solo il Save e lasciare le eccezioni. Perché: il criterio di accettazione del Brief chiede di ritirarle, e il ciclo di vita che il Brief esclude non cambia comportamento.
2. **Opzione `unchecked: true` in `versionedWrite` per le scritture iniziate dal server.** Alternativa scartata: far mandare la versione a delete, publish e refresh-rate dalla board. Perché: cambierebbe il ciclo di vita, che il Brief esclude.
3. **Generate, Publish, New version e Clone della versione aperta, con bozza modificata, chiedono "Save first?". Stage e valuta sono modifiche della testata salvate con Save.** Alternativa scartata: bloccare l'azione senza offrire il salvataggio. Perché: un unico idioma per le quattro azioni, e resta un salvataggio esplicito.
4. **Lo stage si propaga lato server nella stessa transazione, con `project` come entità registrata.** Alternativa scartata: leggere lo stage dalla versione con un join ed eliminare la copia. Perché: i lettori di `projects.pipeline` sono cinque, mentre la propagazione tocca un solo punto.
5. **L'indicatore di stato sta in `.ph-actions` accanto a Save, come testo persistente con Reload contestuale.** Alternativa scartata: un toast. Perché: il Brief vuole uno stato persistente.
6. **Su conflitto la bozza resta a video e si offre solo Reload, con conferma.** Alternativa scartata: rivedere o fondere la bozza locale. Perché: richiederebbe una UI di diff fuori proporzione, e nel frattempo Export XLS resta disponibile.
7. **Testata e struttura vanno in una sola richiesta transazionale.** Alternativa scartata: due richieste con versione. Perché: nessun salvataggio a metà, e una sola riga di registro per Save.
8. **La struttura si invia solo se è cambiata rispetto alla base.** Alternativa scartata: inviarla sempre. Perché: si risparmia la riscrittura completa di fasi e task.
9. **`CLIENT_EXEMPT` diventa granulare per i tre file del ciclo.** Alternativa scartata: tenere le voci per file. Perché: altrimenti il guard non fissa la migrazione di questo ciclo.
10. **Vengono cancellate `PATCH /:id`, `PATCH …/versions/:vId` e `PUT …/structure`.** Alternativa scartata: tenerle senza chiamanti. Perché: il contratto vuole un'unica strada di scrittura.
11. **`phases`, `tasks` e `task_roles` entrano in `REGISTERED_TABLES`.** Alternativa scartata: lasciarle fuori dal guard. Perché: le scrive solo `cost-grids.js`, ormai sempre dentro `versionedWrite`, e il ciclo 1 aveva rimandato questa scelta proprio al ciclo 2.
