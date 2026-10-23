# Brief — hardening: Send Notification, permessi e integrità della struttura del cost grid

**Tipo:** evoluzione di comportamento esistente (Scenario 2), confermato dall'utente il 2026-10-23.
**Origine:** righe `open` di `docs/BACKLOG.md`. Nucleo: B-051, B-029, B-043. Per decisione dell'utente entrano anche i follow-up costgrid B-044…B-048 e B-086…B-092.
**Ordine dei cicli concordato:** hardening (questo) → ciclo C date e form (`domain-audit` prima) → redesign di `project-config.html`.

## Comportamento attuale

Letto il 2026-10-23 su `main` (`1afd6ba`).

### B-051: nomi utente non escapati nella lista destinatari di Send Notification
- `js/nav.js:629` costruisce le `<option>` interpolando `u.id` e `first_name`/`last_name` (o `email`) in una template string e le assegna a `targetSel.innerHTML` (`:630`), senza `esc()`.
- I nomi li sceglie qualsiasi utente autenticato (`PATCH /api/auth/profile`, come dice la riga del backlog).
- Il sink è un `<select>`. La riga B-051 spiega perché l'effetto possibile è corrompere la lista dei destinati (un nome che chiude la propria `<option>` e ne aggiunge una ingannevole), e non eseguire script.

### B-029: un viewer può fare modifiche strutturali in costgrid
- `costgrid.html:872`: `isReadOnly()` = `isLocked || cg.myPermission === 'viewer'`. Disabilita gli input (`:disabled="isReadOnly"`).
- I controlli strutturali però dipendono solo da `v-if="!isLocked"` (a volte insieme a `!selectionMode`), quindi restano visibili al viewer:
  - `:293` Add roles
  - `:297` Add phase
  - `:349` menu ⋮ della colonna ruolo
  - `:354` + Add roles
  - `:364` + Task
  - `:366` elimina fase
  - `:386` elimina task
  - `:439` riga di aggiunta task
  - `:483` e `:496-498` barra di selezione e Add to project
- Solo due `v-if` (`:47`, `:56`) e i tag (`:233-246`, `toggleTag` `:1469`) controllano anche `myPermission !== 'viewer'`.
- Lato server `PUT …/structure` rifiuta il viewer: `canEdit` (`api/src/routes/cost-grids.js:84-92`) ammette admin, owner e share `owner`/`editor`, altrimenti risponde 403 (`:641-643`). Però `cgAutoSave` (`js/costgrid.js:694`) intercetta il rifiuto con `console.warn`. Il viewer quindi vede la modifica applicata fino al reload.

### B-043: la regola "fase o task assegnato non eliminabile" vale solo nel client
- Client:
  - `isTaskAssigned` (`costgrid.html:1639-1643`) controlla id oppure nome (case-insensitive) contro i task assegnati.
  - `deletePhase` (`:1657-1666`) si ferma se la fase contiene un task assegnato.
  - `deleteTask` (`:1667-1672`) **non controlla nulla**: lo protegge solo il `v-if` del pulsante (`:386`).
- Server, `PUT /:id/versions/:vId/structure` (`api/src/routes/cost-grids.js:640` e seguenti):
  - controlla permesso, lock e ore vendute;
  - poi esegue `DELETE FROM phases WHERE version_id = $1` e reinserisce tutto quello che arriva nel body, riusando `taskId` quando c'è.
  - Non confronta il payload con `cg_version_projects.task_ids` / `task_names_direct` (scritti a `:785-788`).
  - Un draft vecchio che non contiene un task collegato a un progetto lo cancella senza errore, e `task_ids` resta orfano.

### Follow-up costgrid inclusi per decisione dell'utente
Per ciascuno vale la descrizione nella sua riga di `docs/BACKLOG.md`. Molte righe sono `unverified`: vanno rilette nel brainstorming prima di decidere.
- **B-044**: `openRoleMenuCode`/`removeColumnConfirm` non vengono azzerati in `openVersion()`. L'handler di riposizionamento del Teleport tiene in cache un riferimento DOM.
- **B-045**: il riepilogo del Sharing card chiuso non si aggiorna quando si chiude `#shareModal`.
- **B-046**: l'etichetta di default `v${versions.length + 1}` può duplicarsi.
- **B-047**: `hasFreeTasks` (`costgrid.html:884`) e `isTaskAssigned` reimplementano `cgFreeTasksOf` (`js/lib/costgrid-calc.js:2-12`).
- **B-048**: `phaseFreeState`/`toggleFreeInPhase`/`phaseFreeLabel` duplicano i `selectAllFree*`.
- **B-086**: una create o clone che fallisce dopo la creazione del grid lascia una proposta orfana vuota.
- **B-087**: l'avviso "Clone incomplete" viene sostituito subito dalla navigazione.
- **B-088**: se fallisce il `PATCH` del nome, l'autosave esce prima di salvare versione e struttura, ma mostra lo stesso il toast di salvataggio.
- **B-089**: tre minori: re-render durante l'unload, estrattore di metodi copiato in 6 test, `liveRole`/`gridHasPublishedVersion` eseguiti in serie.
- **B-090**: New/Clone restano disabilitati se l'utente annulla la navigazione.
- **B-091**: le guardie in-flight restituiscono `false` come un fallimento.
- **B-092**: `DELETE /:id` riscrive in linea la query "versione non-Draft" invece di chiamare `gridHasPublishedVersion`.

## Comportamento atteso
- **B-051:** nella lista destinatari nome, cognome, email e id sono sempre testo, mai markup. Un nome con `<`, `>`, `"`, `&` compare letteralmente e produce esattamente un'`<option>`.
- **B-029:** un viewer non vede nessun controllo strutturale (aggiunta o eliminazione di ruoli, fasi e task, menu ⋮ di colonna, selezione e Add to project) e non può eseguirne nessuno. Questo vale anche se un metodo viene chiamato direttamente, non solo nel template. Owner, editor e admin continuano a vederli e usarli come oggi.
- **B-043:**
  - Il server rifiuta, senza scrivere nulla, un `PUT …/structure` che toglierebbe un task collegato a un progetto della versione.
  - Il client applica la stessa regola anche in `deleteTask`, non solo nel `v-if`.
  - Client e server usano una sola definizione di "task assegnato" (vedi B-047).
- **Follow-up:** ogni riga inclusa è chiusa (`State` = `closed` in `docs/BACKLOG.md`, con il `Verified how`), oppure il brainstorming la dichiara non riproducibile e la chiude con quella motivazione.

## Vincoli
- Lato server la regola di B-043 va mirata alla rimozione dei task collegati. Non deve rompere i salvataggi legittimi: rinomina, riordino, spostamento di un task collegato tra fasi, aggiunte.
- La regola "task assegnato" corrisponde per id **o** per nome (i record vecchi hanno solo `taskNames`). Se il server la applica per nome bisogna decidere cosa fare quando un task collegato viene rinominato. È una domanda per il brainstorming.
- `js/costgrid.js`, `js/nav.js`, `js/api-sync.js` e i `js/lib/*.js` toccati sono versionati con `?v=N`: ogni riferimento va aggiornato in tutte le pagine (`js/lib/nav-shell-guard.test.js` controlla `nav.js`).
- Le route modificate hanno bisogno di `docker compose restart api` sullo stack principale. Va fatto solo con la deroga del Gate 4 step 7 di `/finish-cycle`.
- Nessuna migration attesa.
- Il testo visibile all'utente è in inglese.
- Un rifiuto di regola lato server segue il formato già in uso per le regole dei progetti (`400 { error, code }`). Il codice da usare lo decide il brainstorming.

## Criteri di accettazione
1. Un test fallisce se le `<option>` di `#sendNotifTarget` vengono costruite senza escape: un utente con `first_name` = `</option><option value="x">Fake` produce una sola option, con quel testo letterale.
2. Con `myPermission === 'viewer'` su una versione non bloccata, nessuno dei controlli elencati in B-029 viene renderizzato. Lo verifica un test o uno shot con `scripts/shoot.mjs` come viewer.
3. Con `myPermission === 'viewer'` i metodi strutturali dell'editor (`addPhase`, `addTask`, `deletePhase`, `deleteTask`, `addRoleColumn` e l'eliminazione di colonna) non modificano il draft.
4. `PUT /api/cost-grids/:id/versions/:vId/structure` con un payload privo di un task presente in `cg_version_projects.task_ids` risponde 4xx e la struttura nel DB resta invariata. Lo verifica un test in `test-api.js`.
5. Lo stesso `PUT` con il task collegato rinominato, riordinato o spostato di fase viene accettato.
6. `deleteTask` chiamato su un task assegnato non lo rimuove.
7. Esiste una sola implementazione della regola "task assegnato" lato client: `isTaskAssigned`/`hasFreeTasks` chiamano `cgFreeTasksOf` o un suo helper condiviso. `grep` non trova altri confronti id+nome inline in `costgrid.html`.
8. Ogni riga B-044…B-048 e B-086…B-092 risulta `closed` in `docs/BACKLOG.md`, con un `Verified how` eseguibile.
9. `npm test` e la suite backend sono verdi. Ogni `?v=N` dei file toccati è allineato.

## Scope esplicitamente escluso (confermato dall'utente)
- **Rendere visibili all'utente i fallimenti dell'autosave** (`cgAutoSave` che intercetta con `console.warn`). B-029 si chiude impedendo l'azione in UI, non segnalando il rifiuto del server. B-088 resta in scope solo per il toast mostrato in modo errato.
- **Sweep di tutto il sito per altre interpolazioni non escapate in `innerHTML`.** Si corregge solo `js/nav.js:629`.
- **Riparazione dei dati esistenti**: versioni con `task_ids` già orfani da PUT vecchi.

## Domande aperte per `/brainstorming`
1. **Dimensione del ciclo.** Con i follow-up le righe sono 15. Il nucleo di sicurezza e integrità (B-051, B-029, B-043, B-047) e la pulizia del flusso create/clone (B-086…B-092) toccano file in parte diversi. Si valuta se dividere in due cicli o tenerne uno.
2. **B-043, criterio lato server:** confronto solo per `task_ids`, o anche per `task_names_direct`? Cosa succede a un task collegato rinominato? Rifiuto completo del PUT, oppure conservazione del task mancante?
3. **B-043, posizione della regola:** in `api/src/lib/` come funzione pura con `node:test`, seguendo il modello di `project-rules.js`?
4. **B-029:** un computed unico (`canEditStructure`) che sostituisce i `v-if` e fa da guardia nei metodi, o due condizioni separate?
5. **B-051:** `esc()` nella template string, oppure costruire le `<option>` via DOM (`textContent`/`value`)?
6. **B-086:** compensazione lato client (cancellare il grid se un passo successivo fallisce) o creazione atomica lato server?
7. **B-089:** il punto "estrattore di metodi copiato in 6 test" è refactoring dei test. Entra in questo ciclo?
