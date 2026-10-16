# Spec — follow-up del ciclo create/clone delle proposte (B-001, B-003, B-004, B-005, B-006)

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-16-proposal-clone-followups-brief.md` (Scenario 2).
Design concordato in chat il 2026-10-16 (una fermata, §6b). Incluso, per decisione utente, il nuovo
finding dei duplicati orfani (stessa causa di B-004); escluso il consolidamento del sentinel
`'__unassigned__'`.

## 1. Stato attuale

Vedi il Brief, sezione "Current behavior" — non ripetuto qui. Un fatto in più, accertato in
`/brainstorming`: l'unico chiamante di `_cgUpsertVersionToApi` che conterebbe sul ripiego POST per creare
risorse è `cgImportAll` (`js/costgrid.js` riga 1579), e `grep -rn cgImportAll` non trova alcun chiamante.

## 2. Comportamento atteso e design

### 2.1 B-004 + duplicati orfani — via il ripiego PATCH→POST

In `_cgUpsertVersionToApi` (`js/api-sync.js`):

- Griglia: `Api.costGrids.update(cgId, { name })`; se fallisce → `console.warn('[sync] grid upsert failed:', e.message)`,
  in strict `throw e` (l'errore **della PATCH**), altrimenti `return`. Nessuna chiamata a
  `Api.costGrids.create`.
- Versione: `Api.costGrids.versions.update(cgId, versionId, serverMeta)`; stesso schema, messaggio
  `[sync] version upsert failed:`. Nessuna chiamata a `Api.costGrids.versions.create`.
- Il salvataggio della struttura non cambia.
- Il commento della funzione dice che la griglia e la versione esistono già sul server (gli id sono
  sempre assegnati dal server), quindi un errore è riportato e non convertito in una creazione.

Effetti: il flush strict del clone e di «+ New version» mostrano la causa reale; nessuna griglia o
versione orfana dopo una PATCH fallita.

### 2.2 B-003 — esito restituito, pulsanti disabilitati fino all'unload

- `cgCreateNewGrid` (`js/costgrid.js`): `return false` su ogni ramo che oggi fa `return` dopo un errore o
  per click ripetuto; `return true` dopo `showCostGridEditorView(...)`; il `catch` esterno, se presente,
  restituisce `false`.
- `cgCloneGrid`: idem — `false` su click ripetuto, argomenti mancanti, flush fallito, struttura sorgente
  non caricata, sorgente non trovata, creazione fallita, eccezione nel `catch` esterno; `true` dopo
  `showCostGridEditorView(cgId, verId)` (anche quando la struttura del clone si carica male e compare
  l'avviso «Clone incomplete», perché la navigazione avviene comunque).
- I flag `_cgCreateInFlight` / `_cgCloneInFlight` restano azzerati nel `finally`, come oggi.
- `pipeline.html`, `createNewProposal` e `cloneProposal`:

  ```js
  this.proposalBusy = true;
  let ok = false;
  try {
    ok = await cgCloneGrid(cgId, verId);
    if (ok) { this.refreshTick++; this.collapsedStages = …; }
  } finally {
    if (!ok) this.proposalBusy = false;
  }
  ```

  (stessa forma per `createNewProposal`.) Dopo un successo `proposalBusy` resta `true` fino all'unload.
- `costgrid.html` `cloneProposal` invariato: lì il clone ridisegna sul posto.

### 2.3 B-005 — un solo helper

In `api/src/routes/cost-grids.js`, accanto a `canEdit`:

```js
async function gridHasPublishedVersion(cgId) {
  const { rows } = await query(
    `SELECT 1 FROM cost_grid_versions WHERE cost_grid_id = $1 AND pipeline <> 'Draft' LIMIT 1`, [cgId]);
  return rows.length > 0;
}
```

`POST /:id/versions` e `POST /:id/versions/:vId/duplicate` passano
`hasPublishedVersion: await gridHasPublishedVersion(req.params.id)` a `rules.versionCreationError`.
Status, messaggio e `code: 'VERSION_RULE'` invariati.

### 2.4 B-001 — dati Vue morti

Rimossi `cloneGridName`, `cloneError`, `cloneSourceName` da `costgrid.html` riga 832. I tre nomi
entrano in `REMOVED_IDS` di `js/lib/proposal-modals-guard.test.js`.

### 2.5 Cache-busting

`js/costgrid.js` e `js/api-sync.js` cambiano: ogni `?v=N` che li referenzia, su ogni pagina, sale allo
stesso nuovo valore; le versioni attese in `js/lib/proposal-modals-guard.test.js` (e in ogni altro guard
che le fissa) seguono.

## 3. Test

- **Upsert** — nuovo `js/lib/api-sync-upsert.test.js`, estrae `_cgUpsertVersionToApi` dal sorgente
  (schema di `js/lib/costgrid-clone.test.js`): PATCH griglia fallita → `costGrids.create` mai chiamato,
  strict rilancia l'errore della PATCH, non strict risolve; idem per la versione con
  `versions.create`; PATCH riuscite → struttura salvata come oggi.
- **Clone** — `js/lib/costgrid-clone.test.js`: `cgAutoSave` chiamato prima di `cgLoadStructureFromApi`
  (ordine registrato); argomenti di `versions.create` (`label`, `currency`, `clientId` passato da
  `cgApiClientId`, `ratecardId`, date, `note`, `projectName`); ritorno `true` sul successo, `false` su
  flush fallito e su creazione fallita.
- **Create** — ritorno `true`/`false` di `cgCreateNewGrid` (nuovo test nello stesso stile).
- **Pipeline** — un test estrae `createNewProposal`/`cloneProposal` da `pipeline.html` con lo stesso
  brace-matching e li esegue su un `this` finto: `proposalBusy` resta `true` con esito `true`, torna
  `false` con esito `false` e con eccezione.
- **Backend** — VR-01…VR-04 di `test-api.js` invariati e verdi (`scripts/run-tests.sh`).

## 4. Criteri di accettazione

Quelli del Brief, sezione "Acceptance criteria", con il criterio 4 («il percorso "non trovata", se
mantenuto») sostituito da: nessuna chiamata a `costGrids.create` o `versions.create` resta in
`_cgUpsertVersionToApi` (`grep` sul corpo della funzione).

## 5. Fuori scope

- Consolidamento del sentinel `'__unassigned__'`.
- `cgImportAll` (codice morto, già rotto): non toccato; nuova riga in `docs/BACKLOG.md` alla chiusura.
- `costgrid.html` `cloneProposal`: corretto così com'è.

## Decisioni aperte

1. **Ripiego PATCH→POST rimosso, non ristretto al 404.** Alternativa scartata: aggiungere `err.status` ad `apiFetch` e ripiegare solo su 404. Perché: un non-admin riceve 403 per una griglia assente e la POST ignora comunque l'id, quindi anche il ripiego ristretto crea orfani.
2. **`cgImportAll` lasciato com'è, tracciato in BACKLOG.** Alternativa scartata: rimuoverlo in questo ciclo. Perché: fuori dal Brief e irraggiungibile.
3. **Esito booleano, flag di modulo invariati.** Alternativa scartata: tenere bloccati i flag di modulo dopo un successo. Perché: `costgrid.html` ha bisogno che si azzerino, perché il suo clone non naviga.
4. **Helper di B-005 locale alla route, niente modulo in `api/src/lib/`.** Alternativa scartata: modulo in `lib` con test `node:test`. Perché: è una query sul DB, non una funzione pura, e i test VR già la coprono.
