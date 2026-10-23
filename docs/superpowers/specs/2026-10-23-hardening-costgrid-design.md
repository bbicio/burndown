# Spec — hardening: Send Notification, permessi e integrità della struttura del cost grid

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-23-hardening-costgrid-brief.md` (Scenario 2, evoluzione).
Design concordato in chat il 2026-10-23 (una fermata, §6b).

## 1. Scope

Chiude 15 righe di `docs/BACKLOG.md`: B-051, B-029, B-043, B-044…B-048, B-086…B-092. Il comportamento attuale, con le citazioni, è nel Brief.

Fatti misurati durante il brainstorming (letture sul DB principale, 2026-10-23):
- tutte le righe di `cg_version_projects` hanno `task_ids` non vuoto;
- 5 `task_ids` non corrispondono a nessun task della propria versione (orfani).

## 2. Comportamento atteso

### A. Sicurezza e integrità

**B-051 — `js/nav.js`, lista destinatari di Send Notification.**
- Ogni `<option>` utente si costruisce con `document.createElement('option')`, assegnando `.value = u.id` e `.textContent` = nome completo, oppure email se il nome manca.
- Le option fisse ("Loading…", "All users (broadcast)", "Failed to load users") non contengono dati utente e restano come sono.

**B-029 — `costgrid.html`, controlli strutturali vietati al viewer.**
- Ogni `v-if` di controllo strutturale che oggi controlla `!isLocked` controlla invece `!isReadOnly` (`isReadOnly` = `isLocked || myPermission === 'viewer'`). Le altre condizioni presenti, come `!selectionMode`, restano.
  - Sono: Add roles (barra e intestazione), Add phase, menu ⋮ di colonna, + Task, elimina fase, elimina task, riga di aggiunta task, controlli della barra di selezione / Add to project.
- I metodi chiamati da quei controlli escono subito, senza modificare il draft, quando `isReadOnly` è vero:
  - `addPhase`, `addTask`, `deletePhase`, `deleteTask`, `addRoleColumn`, `openRoleMenu`, `onRemoveColumnClick`;
  - i metodi del menu ⋮ (`changeRole`, `duplicateRole`, `resetRoleRate`);
  - `toggleSelectAllFree`, `toggleFreeInPhase`;
  - i metodi che confermano Add to project.

**B-043 — regola di integrità sulla struttura, lato server.**
- Nuovo modulo puro `api/src/lib/structure-rules.js`, che esporta `missingLinkedTasks({ linkedTaskIds, currentTasks, payloadTaskIds })`:
  - `currentTasks` sono i task oggi nel DB per la versione (`{ id, title }`);
  - restituisce i task di `currentTasks` il cui id è in `linkedTaskIds` e non è in `payloadTaskIds`;
  - gli id collegati che non esistono in `currentTasks` (orfani) sono ignorati.
- `PUT /api/cost-grids/:id/versions/:vId/structure`, dentro la transazione esistente e prima del `DELETE FROM phases`:
  1. prende il lock di versione con `lockVersion` di `api/src/lib/version-lock.js`;
  2. legge i `task_ids` di tutte le righe `cg_version_projects` della versione e i task correnti;
  3. chiama `missingLinkedTasks`;
  4. se la lista non è vuota: `ROLLBACK` e `400 { error, code: 'STRUCTURE_RULE' }`, con `error` in inglese che nomina i task mancanti.
- Rinominare, riordinare o spostare tra fasi un task collegato, e aggiungere task o fasi, restano accettati.
- La regola vale per qualsiasi ruolo, sysadmin incluso.

**B-043 — lato client.** `deleteTask` controlla `isTaskAssigned(task)` e, se il task è assegnato, mostra `showInfo("Can't delete: this task is linked to a project.")` senza modificare il draft, come fa già `deletePhase`. Il rifiuto del server non viene mostrato all'utente (scope escluso, §4).

**B-047 — una sola definizione di "task assegnato".**
- In `js/lib/costgrid-calc.js` nasce `cgIsTaskAssigned(task, linkedProjects)`: assegnato se `task.taskId` è in un `taskIds`, oppure se il nome trimmato e in minuscolo è in un `taskNames`. Va esposto su `window` come gli altri export.
- `cgFreeTasksOf` diventa: task con nome non vuoto e `!cgIsTaskAssigned`. Il comportamento resta invariato.
- `isTaskAssigned` e `hasFreeTasks` in `costgrid.html`, e l'uso in `js/costgrid.js` (oggi `:1171`), chiamano `cgIsTaskAssigned` o `cgFreeTasksOf` con `_cgDraft.linkedProjects`.
- `cgGetAssignedTaskIds` / `cgGetAssignedTaskNames` vengono rimossi se non resta nessun chiamante.

### B. Editor costgrid

- **B-044:**
  - `openVersion()` azzera `openRoleMenuCode`, `removeColumnConfirm` e `_cgRoleMenuBtnEl`;
  - `_cgRoleMenuReposition` riposiziona solo se `_cgRoleMenuBtnEl?.isConnected`, altrimenti chiude il menu.
- **B-045:**
  - l'handler `hidden.bs.modal` di `#shareModal` chiama anche `loadShareSummary()`;
  - lo stesso fa `reassignOwner` dopo il successo.
- **B-046:** `cgCreateNewVersionDirect` usa come etichetta di default il primo `v<N>`, con N ≥ `versions.length + 1`, che non coincide con nessuna etichetta esistente del grid.
- **B-048:**
  - tre helper sulla lista di task:
    - stato `none|some|all`;
    - toggle;
    - etichetta. Riceve i testi per fase e per intero draft, che restano quelli di oggi.
  - `phaseFreeState`/`toggleFreeInPhase`/`phaseFreeLabel` e `selectAllFreeState`/`toggleSelectAllFree`/`selectAllFreeLabel` restano come wrapper di una riga. Nome e firma non cambiano.

### C. Create e clone

- **B-086:**
  - in `cgCreateNewGrid` e `cgCloneGrid`, se un passo successivo a `Api.costGrids.create` fallisce, si chiama `Api.costGrids.delete(cgId)` dentro un `try/catch`, poi si mostra l'errore e si restituisce `false`;
  - il fallimento del `DELETE` viene ignorato (`console.warn`);
  - in `cgCloneGrid` anche `saveStructure` sta dentro questo percorso;
  - in `cgCreateNewGrid` il `.catch(() => {})` sul `saveStructure` iniziale resta: la struttura vuota è opzionale.
- **B-087:** quando `cgCloneGrid` mostra "⚠️ Clone incomplete", aspetta l'evento `hidden.bs.modal` di `#confirmModal` prima di `showCostGridEditorView`. È un promise locale in `js/costgrid.js`; `showInfo` non cambia.
- **B-088:**
  - in `_cgUpsertVersionToApi`, in modalità non strict, un `PATCH` del nome fallito viene registrato e il salvataggio prosegue con metadati e struttura;
  - in modalità strict lancia come oggi;
  - `_cgUpsertVersionToApi` restituisce `true` se tutte le scritture sono riuscite, `false` altrimenti, e `cgAutoSave` propaga l'esito;
  - `cgScheduleAutoSave` mostra il toast solo quando l'esito è `true`.
- **B-089:**
  - in `pipeline.html`, `createNewProposal`/`cloneProposal` non eseguono più `refreshTick++` sul successo (vedi B-090);
  - una sola funzione di estrazione del sorgente in `scripts/lib/extract-source.mjs` sostituisce le copie locali in `js/lib/api-sync-upsert.test.js`, `costgrid-clone.test.js`, `costgrid-create.test.js`, `costgrid-currency-change.test.js`, `costgrid-new-version.test.js`, `header-badge.test.js`, `pipeline-proposal-busy.test.js`;
  - nel `POST /:id/versions`, `liveRole` e `gridHasPublishedVersion` vengono eseguiti con `Promise.all`.
- **B-090:** dopo un successo, `pipeline.html` avvia un timer di fallback. Se allo scadere la pagina è ancora attiva, rilascia `proposalBusy` ed esegue `refreshTick++`. La durata la fissa il Piano, nell'ordine dei secondi.
- **B-091:**
  - le guardie in-flight di `cgCreateNewGrid` / `cgCloneGrid` restituiscono `null`;
  - `pipeline.html` rilascia `proposalBusy` solo su `ok === false`;
  - con `null` lascia lo stato alla chiamata in corso.
- **B-092:** `DELETE /api/cost-grids/:id` usa `gridHasPublishedVersion` al posto della query in linea. La risposta non cambia.

### Test

- **Prima** delle modifiche, caratterizzazione in `test-api.js` di `PUT …/structure` su una versione con un task collegato. Questi test passano oggi e devono passare anche dopo:
  - salvataggio con il task rinominato → 200;
  - salvataggio con il task riordinato → 200;
  - salvataggio con il task spostato in un'altra fase → 200.
- Poi, per ogni fix, un test che fallisce prima e passa dopo:
  - `node:test` per `structure-rules.js`;
  - vitest per `cgIsTaskAssigned`, per l'etichetta di B-046, per le guardie e l'esito di create/clone/upsert, e per la costruzione delle option di B-051;
  - `test-api.js` per `STRUCTURE_RULE` (task collegato omesso → 400, DB invariato; orfano ignorato → 200).
- Per B-029 la verifica visiva è uno shot con `scripts/shoot.mjs` da utente viewer, oppure un test vitest sul template.

### Deploy

- Aggiornare `?v=N` in tutte le pagine che caricano i file versionati toccati: `js/nav.js`, `js/costgrid.js`, `js/api-sync.js`, `js/lib/costgrid-calc.js`.
- Restart di `api` solo tramite `/finish-cycle` Gate 4 step 7.
- Nessuna migration.

## 3. File toccati

`js/nav.js`, `costgrid.html`, `pipeline.html`, `js/costgrid.js`, `js/api-sync.js`, `js/lib/costgrid-calc.js`, `api/src/routes/cost-grids.js`, `api/src/lib/structure-rules.js` (nuovo), `scripts/lib/extract-source.mjs` (nuovo), i test elencati sopra, `test-api.js`, le pagine con riferimenti `?v=` ai file versionati, `docs/BACKLOG.md`.

## 4. Scope escluso

Confermato dall'utente nel Brief:
- mostrare all'utente i fallimenti dell'autosave;
- sweep di tutto il sito per altre interpolazioni non escapate in `innerHTML`;
- riparare i dati esistenti (i 5 `task_ids` orfani restano).

## Criteri di accettazione

1. **Option escapate** — un utente con `first_name` = `</option><option value="x">Fake` produce in `#sendNotifTarget` una sola option, con quel testo letterale.
2. **Viewer senza controlli** — con `myPermission === 'viewer'` su una versione non bloccata nessun controllo strutturale di §2.A/B-029 viene renderizzato.
3. **Viewer senza metodi** — con `isReadOnly` vero, i metodi elencati in §2.A/B-029 lasciano il draft invariato.
4. **STRUCTURE_RULE** — un `PUT …/structure` senza un task collegato esistente risponde 400 con `code: 'STRUCTURE_RULE'`, e la struttura nel DB resta invariata.
5. **Salvataggi legittimi** — rinomina, riordino e spostamento di fase di un task collegato rispondono 200; un `task_id` orfano non blocca il salvataggio.
6. **deleteTask protetto** — `deleteTask` su un task assegnato lascia il draft invariato.
7. **Una regola** — in `costgrid.html` e `js/costgrid.js` non resta nessun confronto id+nome in linea: `isTaskAssigned`/`hasFreeTasks` chiamano `cgIsTaskAssigned`/`cgFreeTasksOf`.
8. **Menu e riepilogo** — cambiando versione il menu ⋮ è chiuso e senza conferma pendente; chiudendo `#shareModal` il riepilogo del Sharing card si aggiorna.
9. **Etichetta unica** — creare una versione dopo averne cancellata una non produce un'etichetta duplicata.
10. **Nessun orfano da create/clone** — un create o clone che fallisce dopo la creazione del grid chiama `DELETE` sul grid.
11. **Avviso leggibile** — la navigazione al clone parte solo dopo la chiusura dell'avviso "Clone incomplete".
12. **Toast onesto** — con un `PATCH` del nome fallito, metadati e struttura vengono salvati comunque, e il toast di salvataggio non compare se una scrittura è fallita.
13. **Pulsanti rilasciati** — dopo un create o clone riuscito senza unload della pagina, New/Clone tornano attivi allo scadere del timer; una chiamata ignorata dalla guardia in-flight non li rilascia.
14. **Estrattore unico** — nessuno dei sette file di test di §2.C/B-089 definisce una propria funzione di estrazione.
15. **Backlog chiuso** — le 15 righe sono `closed` in `docs/BACKLOG.md`, ciascuna con un `Verified how` eseguibile.
16. **Suite verdi** — `npm test`, i test backend e i test di caratterizzazione passano; i `?v=N` dei file toccati sono allineati.

## Decisioni aperte

1. **Un ciclo solo per le tre aree A/B/C.** Alternativa scartata: A+B in un ciclo, C in un altro. Perché: condividono `js/costgrid.js`, `costgrid.html` e `cost-grids.js`, e due cicli pagherebbero due volte i gate e gli aggiornamenti di `?v=`.
2. **La regola server di B-043 confronta solo gli id e ignora gli orfani.** Alternativa scartata: confronto anche per nome. Perché: nessun collegamento nel DB è senza id, e il confronto per nome bloccherebbe le rinomine.
3. **Rifiuto dell'intero PUT.** Alternativa scartata: conservare in silenzio il task mancante. Perché: fonderebbe un draft vecchio con lo stato del DB senza dirlo a nessuno.
4. **Nessuna eccezione sysadmin per STRUCTURE_RULE.** Alternativa scartata: lo stesso modello di `project-rules`. Perché: è integrità dei dati, non una policy.
5. **Lock di versione anche nel PUT della struttura.** Alternativa scartata: nessun lock. Perché: il controllo e il `DELETE` devono vedere gli stessi collegamenti.
6. **B-086 con compensazione lato client.** Alternativa scartata: un endpoint di creazione atomica lato server. Perché: il `DELETE` esiste già, e un endpoint nuovo amplierebbe il ciclo.
7. **B-090 con un timer di fallback.** Alternativa scartata: `visibilitychange`/`pagehide`. Perché: annullare la navigazione non genera nessun evento affidabile.
8. **L'estrattore dei test di B-089 entra nel ciclo, in `scripts/lib/`.** Alternativa scartata: lasciarlo in backlog. Perché: il criterio 15 chiude tutte le righe, e `scripts/lib/` ospita già un helper condiviso dei test.
9. **B-051 costruito via DOM.** Alternativa scartata: `esc()` nella template string. Perché: non resta nessuna stringa HTML da tenere corretta.
