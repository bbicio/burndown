# Brief — follow-up del ciclo create/clone delle proposte (B-001, B-003, B-004, B-005, B-006)

**Brief started:** 2026-10-16 (avvio di `/feature-brief`)
**Classificazione (dichiarata dall'utente, 2026-10-16):** Scenario 2 (evoluzione).
Fonte: `docs/BACKLOG.md`, righe B-001…B-006, aperte dal ciclo `2026-10-07-…-proposal-create-clone-direct`
(report `docs/superpowers/reports/2026-10-07-worktree-proposal-create-clone-direct-finish-cycle.md`).
**B-002 non è nel ciclo:** già `closed` il 2026-10-13.
**Scope deciso dall'utente (2026-10-16)** seguendo le raccomandazioni proposte: dentro anche i duplicati
orfani (stessa causa di B-004) e il test del payload del clone; fuori solo il sentinel `__unassigned__`.

## Current behavior

### B-001 — dati Vue morti

- `costgrid.html` riga 832: `cloneGridName: '', cloneError: '', cloneSourceName: ''` nel `data()`.
  `grep -n` sui tre nomi in `costgrid.html` trova solo quella riga: nessun template né metodo li legge.

### B-003 — doppio click nella finestra prima della navigazione

- `pipeline.html` righe 1001-1020: `createNewProposal` e `cloneProposal` mettono `proposalBusy = true`,
  `await` `cgCreateNewGrid()` / `cgCloneGrid()`, e lo rimettono a `false` nel `finally`.
- Entrambe le funzioni navigano verso `/costgrid.html` da dentro (override `window.showCostGridEditorView`,
  `pipeline.html` righe 524-529, `window.location.href = …`; chiamato da `js/costgrid.js` riga 892 per
  la creazione, riga 1013 per il clone). La navigazione non scarica la pagina in modo sincrono: il
  `finally` riabilita i pulsanti prima dell'unload.
- Lo stesso vale un livello sotto: i flag di modulo `_cgCreateInFlight` (`js/costgrid.js` riga 894) e
  `_cgCloneInFlight` (riga 1025) si azzerano nel `finally` delle due funzioni.
- `cgCreateNewGrid` e `cgCloneGrid` ritornano `undefined` sia in caso di successo sia dopo un errore
  (gestito con `showInfo` + `return`): il chiamante non sa distinguere i due esiti.
- `costgrid.html` riga 1815-1823 (`cloneProposal`) usa lo stesso schema, ma lì `showCostGridEditorView`
  ridisegna sul posto senza navigare (`js/costgrid.js` righe 1013-1021, `history.replaceState`): il reset
  nel `finally` è corretto.

### B-004 — messaggio sbagliato su errore transitorio (e duplicati orfani)

- `_cgUpsertVersionToApi` (`js/api-sync.js` righe 152-205) fa PATCH della griglia e poi della versione;
  su **qualsiasi** errore della PATCH ripiega su una POST di creazione con l'`id` del client
  (righe 160-164 per la griglia, 183-187 per la versione). In modalità strict l'errore lanciato è quello
  della POST, non quello della PATCH.
- La POST non è un upsert: `POST /api/cost-grids` (`api/src/routes/cost-grids.js` riga 226) e
  `POST /:id/versions` (riga 380, destructuring a riga 385) ignorano l'`id` ricevuto. Quindi:
  - con una versione pubblicata nella griglia, la POST di versione è rifiutata con
    `MESSAGES.versionCreation` («A published proposal cannot get a new version.»,
    `api/src/lib/project-rules.js` riga 18): è il messaggio che sostituisce la causa reale (B-004);
  - senza versioni pubblicate, la POST crea una **versione Draft orfana** nella griglia; il ripiego della
    griglia crea una **griglia orfana** con lo stesso nome (nuovo finding, incluso per decisione utente).
- Chiamanti strict che mostrano l'errore all'utente: il flush del clone (`js/costgrid.js` righe 919-927)
  e il flush di «+ New version» (righe 789-794). I salvataggi non strict (autosave temporizzato) solo
  loggano, ma creano gli stessi orfani.
- Una griglia inesistente non dà 404 a un non-admin: `canEdit` (righe 84-93) fallisce prima e la PATCH
  risponde 403 (righe 310-312, 424-426). La PATCH dà 404 solo se la riga non esiste e `canEdit` passa
  (riga 319 per la griglia).
- `apiFetch` (`js/api.js` righe 34-41) attacca all'errore `err.data` ma non lo status HTTP.

### B-005 — `hasPublishedVersion` duplicato

- `api/src/routes/cost-grids.js` righe 387-396 (`POST /:id/versions`) e 512-521 (`.../duplicate`):
  stessa query `SELECT 1 FROM cost_grid_versions WHERE cost_grid_id = $1 AND pipeline <> 'Draft' LIMIT 1`
  e stessa chiamata a `rules.versionCreationError`, copiate.

### B-006 — nessun test sull'ordine del clone

- `js/lib/costgrid-clone.test.js`: due test, entrambi sul ramo del permesso del flush (owner → flush,
  viewer → niente flush). Nessuno verifica che il flush (`cgAutoSave(true)`) avvenga **prima** di
  `cgLoadStructureFromApi(srcCgId, srcVerId)`, né il payload passato a `Api.costGrids.versions.create`
  (incluso `clientId` da `cgApiClientId`).

## Expected behavior

- **B-001:** i tre campi non esistono più nel `data()` di `costgrid.html`.
- **B-003:** su `pipeline.html`, dopo una creazione o un clone riusciti, i pulsanti New Proposal/Clone
  restano disabilitati fino all'unload della pagina; dopo un errore tornano cliccabili. Il clone di
  `costgrid.html` non cambia comportamento.
- **B-004:** un errore della PATCH di griglia o versione che non significa «la risorsa non esiste ancora»
  viene riportato con il suo messaggio, e non provoca alcuna POST: nessuna griglia o versione orfana,
  nessun messaggio della regola di versione al posto della causa reale.
- **B-005:** la verifica «la griglia ha una versione pubblicata» vive in un solo punto, usato dalle due
  route; comportamento delle route invariato (stessi status, stesso `code: 'VERSION_RULE'`).
- **B-006:** un test fallisce se il flush viene spostato dopo il caricamento della struttura sorgente, e
  un test fissa il payload di `versions.create` del clone (`clientId` compreso).

## Constraints

- Scenario 2: prima di modificare, test di caratterizzazione sul comportamento attuale di
  `_cgUpsertVersionToApi` e dei due metodi di `pipeline.html` (PROCESS.md §2).
- `js/costgrid.js`, `js/api-sync.js`, `js/api.js` sono versionati: ogni modifica bumpa **tutti** i `?v=N`
  che li referenziano (CLAUDE.md «Cache-busting»).
- `js/costgrid.js` è uno script classico: i test estraggono le funzioni dal sorgente
  (schema di `js/lib/costgrid-clone.test.js`).
- Backend: test `node:test` sotto `api/src/**`; se il diff tocca `api/`, Gate 1 esegue
  `scripts/run-tests.sh` e Gate 4 riavvia `pdash-api`.
- Nessun comando Docker sul main stack fuori da quanto consentito in CLAUDE.md «Infrastructure safety».
- Testi visibili all'utente in inglese.

## Acceptance criteria

1. `grep -n "cloneGridName\|cloneError\|cloneSourceName" costgrid.html` → nessun risultato.
2. Un test dimostra che, su `pipeline.html`, `proposalBusy` resta `true` dopo un `cgCloneGrid`/
   `cgCreateNewGrid` riuscito e torna `false` dopo uno fallito.
3. Un test dimostra che una PATCH di versione fallita con un errore diverso da «non trovata» rilancia
   quell'errore in strict e **non** chiama `versions.create`; idem per la griglia e `costGrids.create`.
4. Un test dimostra che il percorso «non trovata», se mantenuto, continua a funzionare come oggi.
5. `grep -c "pipeline <> 'Draft' LIMIT 1" api/src/routes/cost-grids.js` → 1 (o 0 se la query si sposta
   fuori dal file), e i test esistenti sulla regola di versione passano invariati.
6. Un test su `cgCloneGrid` fallisce se `cgAutoSave` è chiamato dopo `cgLoadStructureFromApi`; un test
   fissa gli argomenti di `versions.create` del clone.
7. `npm test`, i test `node:test` di `api/` e `scripts/run-tests.sh` verdi.
8. Righe B-001, B-003…B-006 di `docs/BACKLOG.md` portate a `closed` con il comando eseguito nel
   `Verified how`.

## Explicitly excluded scope

- Consolidare la pulizia del sentinel `'__unassigned__'` (tre copie: salvataggio progetti in
  `js/api-sync.js`, `cgApiClientId` in `js/lib/costgrid-calc.js`, metadata di versione in
  `_cgUpsertVersionToApi`) — resta una nota preesistente del report del 2026-10-07.
- Il `proposalBusy` del clone in `costgrid.html`: già corretto, nessuna modifica (non un'esclusione, un
  «niente da fare» verificato sopra).

## Open questions for `/brainstorming`

1. **B-004 — togliere o restringere il ripiego?** Gli id sono già assegnati dal server in entrambi i
   flussi di creazione (`js/costgrid.js` righe 854-858, 949-962), e la POST ignora comunque l'`id`:
   esiste ancora un caso in cui il ripiego serve? Se no, la soluzione più semplice è eliminarlo; se sì,
   come riconoscere «non trovata», visto che un non-admin riceve 403 e non 404 per una griglia assente,
   e che `apiFetch` non espone lo status (aggiungere `err.status`?).
2. **B-003 — come segnalare l'esito?** Le due funzioni ritornano `true`/`false`, oppure i pulsanti
   restano disabilitati comunque e si riabilitano solo nel ramo d'errore? Vale anche per i flag di modulo
   `_cgCreateInFlight`/`_cgCloneInFlight`, che su `costgrid.html` devono invece tornare `false` (il clone
   lì non naviga).
3. **B-005 — dove vive l'helper?** Funzione locale in `cost-grids.js` (come `canEdit`) o in
   `api/src/lib/` con test `node:test`?
4. **B-003 — come testare i metodi Vue di `pipeline.html`?** Estrazione dal sorgente come per
   `costgrid.js`, o spostare la logica dell'esito in una funzione testabile?

Brief ready. Next step: /brainstorming.
