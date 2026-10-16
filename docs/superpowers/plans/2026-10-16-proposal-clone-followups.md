# Proposal create/clone follow-ups (B-001, B-003..B-006) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Togliere il ripiego PATCH→POST di `_cgUpsertVersionToApi` (B-004 + duplicati orfani), far restituire l'esito a `cgCreateNewGrid`/`cgCloneGrid` così che `pipeline.html` tenga i pulsanti bloccati fino all'unload (B-003), unificare `hasPublishedVersion` (B-005), togliere i dati Vue morti (B-001) e coprire ordine e payload del clone (B-006).

**Architecture:** Tre modifiche frontend in script classici (`js/api-sync.js`, `js/costgrid.js`, `pipeline.html`), ciascuna con test vitest che estraggono la funzione dal sorgente (schema di `js/lib/costgrid-clone.test.js`); una modifica backend locale alla route; bump `?v=` e BACKLOG in un task finale.

**Tech Stack:** Vue 3 da CDN senza build, Express + PostgreSQL, vitest + jsdom, `test-api.js` via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-10-16-proposal-clone-followups-design.md`
**Branch:** `proposal-clone-followups`
**Risk class:** high-risk — file condiviso caricato da più pagine (`js/api-sync.js` su sei pagine, `js/costgrid.js` su due).

**Indipendenza dei task:** i task **non** sono indipendenti: il Task 3 consuma i valori di ritorno del Task 2, il Task 5 bumpa i `?v=` dei file toccati nei Task 1-2.

## Global Constraints

- Nessuna migrazione, nessun endpoint nuovo o cambiato nel contratto (status, messaggi, `code: 'VERSION_RULE'` invariati).
- `_cgUpsertVersionToApi` non chiama più `Api.costGrids.create` né `Api.costGrids.versions.create`; i messaggi di log restano `[sync] grid upsert failed:` e `[sync] version upsert failed:`.
- In strict l'errore rilanciato è quello della PATCH.
- `cgCreateNewGrid()` / `cgCloneGrid(srcCgId, srcVerId)` → `Promise<boolean>`: `true` solo dopo `showCostGridEditorView(...)`.
- `_cgCreateInFlight` / `_cgCloneInFlight` restano azzerati nel `finally`; `costgrid.html` `cloneProposal` non cambia.
- `?v=` solo nel Task 5: `js/costgrid.js` 43→44 (`pipeline.html`, `costgrid.html`, `js/lib/proposal-modals-guard.test.js`); `js/api-sync.js` 22→23 (`pipeline.html`, `costgrid.html`, `portfolio.html`, `program.html`, `planning.html`, `project-config.html`). Prima del bump `grep -rn "api-sync.js?v=\|costgrid.js?v="` per confermare l'elenco.
- HTML editato solo con Edit/Write, mai con `Get-Content`/`Set-Content` (BOM).
- Durante i task si lanciano solo i file di test del task (§6.2); la suite completa è del Gate 1.
- Testi visibili all'utente in inglese.

## Review Focus

1. Clone dal costgrid.html aperto, con PATCH di versione che fallisce per una ragione qualsiasi → messaggio con la causa reale, nessuna versione o griglia nuova sul server — test nel Task 1 (strict) e nel Task 2 (`cgCloneGrid` restituisce `false` e mostra il messaggio della PATCH).
2. Autosave temporizzato (non strict) con PATCH fallita → nessuna POST, nessuna eccezione — test nel Task 1.
3. Doppio click su Clone in `pipeline.html` dopo un successo → `proposalBusy` resta `true` — test nel Task 3.
4. Clone fallito su `pipeline.html` → pulsanti riabilitati (`proposalBusy === false`), anche se `cgCloneGrid` lancia — test nel Task 3.
5. Clone il cui caricamento struttura finale fallisce («Clone incomplete») → naviga comunque, quindi `true` — test nel Task 2.

---

### Task 1: `_cgUpsertVersionToApi` senza ripiego POST (B-004 + orfani)

**Files:**
- Modify: `js/api-sync.js` righe 152-205 (`_cgUpsertVersionToApi`)
- Create: `js/lib/api-sync-upsert.test.js`

**Interfaces:**
- Consumes: nulla.
- Produces: `_cgUpsertVersionToApi(cgId, versionId, opts)` — firma invariata; ora rigetta con l'errore della PATCH in strict.

- [ ] **Step 1: Characterization test (passa già oggi)**

In `js/lib/api-sync-upsert.test.js`, estrai `_cgUpsertVersionToApi` da `js/api-sync.js` con lo stesso `extractFunction` di `js/lib/costgrid-clone.test.js` e stub `Api`, `cgLoad`, `window.__currencies = []`. Test:
- `'saves grid name, version meta and structure when both PATCHes succeed'`: con una versione che ha `phases: [{ phaseName: 'P', tasks: [] }]`, si aspetta `costGrids.update` chiamato con `('cg1', { name: 'Grid' })`, `versions.update` con `('cg1', 'v1', expect.objectContaining({ label: 'v1', currency: 'EUR' }))`, `saveStructure` chiamato una volta.

- [ ] **Step 2: Test che falliscono**

- `'grid PATCH failure does not create a grid and rethrows it in strict'`: `update` rigetta `new Error('boom grid')` → `await expect(fn('cg1','v1',{strict:true})).rejects.toThrow('boom grid')`; `costGrids.create` non chiamato; `versions.update` non chiamato.
- `'version PATCH failure does not create a version and rethrows it in strict'`: `versions.update` rigetta `new Error('boom version')` → rejects `'boom version'`; `versions.create` non chiamato; `saveStructure` non chiamato.
- `'non-strict failures resolve without creating anything'`: entrambi i casi sopra senza `strict` → `resolves.toBeUndefined()`, nessuna `create`.

- [ ] **Step 3: Verifica rosso**

Run: `npx vitest run js/lib/api-sync-upsert.test.js`
Expected: Step 1 PASS; i tre test dello Step 2 FAIL (`create` chiamato / messaggio diverso).

- [ ] **Step 4: Implementa**

Nei due `catch` sostituisci il `try { … create … } catch (e) { … }` con `catch (e) { console.warn('[sync] grid upsert failed:', e.message); if (strict) throw e; return; }` (idem `version upsert failed`). Aggiorna il commento sopra i due blocchi: griglia e versione esistono già sul server (id sempre assegnati dal server), un errore è riportato, mai convertito in una creazione.

- [ ] **Step 5: Verifica verde**

Run: `npx vitest run js/lib/api-sync-upsert.test.js`
Expected: 4 PASS. E `grep -n "create(" js/api-sync.js | sed -n '1,20p'` non mostra righe dentro `_cgUpsertVersionToApi`.

- [ ] **Step 6: Commit**

```bash
git add js/api-sync.js js/lib/api-sync-upsert.test.js
git commit -m "fix: no POST fallback on a failed cost-grid upsert PATCH (B-004, orphan duplicates)"
```

### Task 2: esito di `cgCreateNewGrid`/`cgCloneGrid` + ordine e payload del clone (B-003 lato libreria, B-006)

**Files:**
- Modify: `js/costgrid.js` righe 844-896 (`cgCreateNewGrid`), 907-1027 (`cgCloneGrid`)
- Modify: `js/lib/costgrid-clone.test.js`
- Create: `js/lib/costgrid-create.test.js`

**Interfaces:**
- Consumes: nulla.
- Produces: `cgCreateNewGrid(): Promise<boolean>`, `cgCloneGrid(srcCgId, srcVerId): Promise<boolean>` — `true` solo dopo `showCostGridEditorView`.

- [ ] **Step 1: Test che falliscono in `js/lib/costgrid-clone.test.js`**

Nel `build()` esistente, registra l'ordine: `const calls = []`; `cgAutoSave` e `cgLoadStructureFromApi` fanno `calls.push('flush')` / `calls.push('load:' + a[0])`. Test nuovi:
- `'flushes before loading the source structure'`: owner, `await fn('cg1','v1')` → `expect(calls.slice(0, 2)).toEqual(['flush', 'load:cg1'])`.
- `'creates the clone version with the source header'`: sorgente con `currency: 'USD'`, `clientId: '11111111-2222-3333-4444-555555555555'`, `ratecardId: 'rc1'`, `startDate: '2026-01'`, `endDate: '2026-06'`, `note: 'n'` → `api.versionsCreate` chiamato con `('newCg', { label: 'v1', currency: 'USD', clientId: '11111111-2222-3333-4444-555555555555', ratecardId: 'rc1', startDate: '2026-01', endDate: '2026-06', note: 'n', projectName: 'Source — Copy' })`.
- `'passes a null clientId for the unassigned sentinel'`: `clientId: '__unassigned__'` → payload con `clientId: null`.
- `'returns true after navigating'`: owner → `expect(await fn('cg1','v1')).toBe(true)`.
- `'returns false and shows the PATCH error when the flush fails'`: `cgAutoSave` rigetta `new Error('boom version')` → `false`, `shownInfo[0][0]` contiene `'boom version'`, `api.create` non chiamato.
- `'returns false when creating the grid fails'`: `api.create` rigetta → `false`, `opened` vuoto.
- `'returns true even when the clone structure reload fails'`: `cgLoadStructureFromApi` restituisce `true` alla prima chiamata (sorgente) e `false` alla seconda → `true`, `opened` ha una voce.

- [ ] **Step 2: Test che falliscono in `js/lib/costgrid-create.test.js`**

Stesso schema di estrazione per `cgCreateNewGrid` (stub `Api.costGrids.create/versions.create/versions.saveStructure`, `cgNewPhId`, `cgGetIndex/cgSaveIndex/cgSave`, `showInfo`, `showCostGridEditorView`, `_cgCreateInFlight: false`):
- `'returns true and opens the editor with focusName'` → `true`, `opened` = `[['newCg','newVer',{ focusName: true }]]`.
- `'returns false when the API create fails'` → `false`, `shownInfo[0][0]` inizia con `'Could not create the proposal: '`.

- [ ] **Step 3: Verifica rosso**

Run: `npx vitest run js/lib/costgrid-clone.test.js js/lib/costgrid-create.test.js`
Expected: i test di ordine e payload possono già passare (caratterizzazione); quelli sul valore di ritorno FAIL (`undefined`).

- [ ] **Step 4: Implementa**

In entrambe le funzioni: ogni `return;` diventa `return false;`; dopo `showCostGridEditorView(...)` (e, nel clone, dopo l'aggiornamento di `history`) `return true;`; il `catch` esterno di `cgCloneGrid` restituisce `false` dopo `showInfo`. Il `finally` non cambia.

- [ ] **Step 5: Verifica verde**

Run: `npx vitest run js/lib/costgrid-clone.test.js js/lib/costgrid-create.test.js js/lib/costgrid-new-version.test.js`
Expected: tutti PASS.

- [ ] **Step 6: Commit**

```bash
git add js/costgrid.js js/lib/costgrid-clone.test.js js/lib/costgrid-create.test.js
git commit -m "feat: cgCreateNewGrid/cgCloneGrid return their outcome; pin clone order and payload (B-006)"
```

### Task 3: `pipeline.html` tiene i pulsanti bloccati dopo un successo (B-003)

**Files:**
- Modify: `pipeline.html` righe 1001-1020 (`createNewProposal`, `cloneProposal`)
- Create: `js/lib/pipeline-proposal-busy.test.js`

**Interfaces:**
- Consumes: `cgCreateNewGrid(): Promise<boolean>`, `cgCloneGrid(cgId, verId): Promise<boolean>` (Task 2).
- Produces: nulla.

- [ ] **Step 1: Test che falliscono**

In `js/lib/pipeline-proposal-busy.test.js`, estrai il metodo da `pipeline.html` con un brace-matching che parte da `async cloneProposal(` (e `async createNewProposal(`), costruisci `new Function('cgCloneGrid', 'cgCreateNewGrid', 'return { ' + src + ' }')` e invocalo con `this` = `{ proposalBusy: false, refreshTick: 0, collapsedStages: ['Draft', 'SIP'] }`:
- `'cloneProposal keeps proposalBusy after a successful clone'`: stub → `true` → `proposalBusy === true`, `refreshTick === 1`, `collapsedStages` = `['SIP']`.
- `'cloneProposal releases proposalBusy after a failed clone'`: stub → `false` → `proposalBusy === false`, `refreshTick === 0`.
- `'cloneProposal releases proposalBusy when the clone throws'`: stub rigetta → `await expect(...).rejects.toThrow()`, `proposalBusy === false`.
- Gli stessi tre per `createNewProposal` con `cgCreateNewGrid`.

- [ ] **Step 2: Verifica rosso**

Run: `npx vitest run js/lib/pipeline-proposal-busy.test.js`
Expected: i due test «keeps proposalBusy» FAIL (`false`); gli altri PASS.

- [ ] **Step 3: Implementa**

Forma della Spec §2.2: `let ok = false; try { ok = await …; if (ok) { this.refreshTick++; this.collapsedStages = …; } } finally { if (!ok) this.proposalBusy = false; }`. Commento di una riga: su successo la pagina sta navigando, i pulsanti restano disabilitati fino all'unload.

- [ ] **Step 4: Verifica verde**

Run: `npx vitest run js/lib/pipeline-proposal-busy.test.js js/lib/pipeline-guard.test.js`
Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline.html js/lib/pipeline-proposal-busy.test.js
git commit -m "fix: pipeline keeps New/Clone disabled until the page unloads after success (B-003)"
```

### Task 4: un solo `gridHasPublishedVersion` (B-005)

**Files:**
- Modify: `api/src/routes/cost-grids.js` righe 84-93 (accanto a `canEdit`), 387-396, 512-521

**Interfaces:**
- Consumes: nulla.
- Produces: `async function gridHasPublishedVersion(cgId): Promise<boolean>`, locale al file.

- [ ] **Step 1: Implementa**

Helper come Spec §2.3; nelle due route `hasPublishedVersion: await gridHasPublishedVersion(req.params.id)` al posto della query inline e di `pubRows`.

- [ ] **Step 2: Verifica**

Run: `grep -c "pipeline <> 'Draft' LIMIT 1" api/src/routes/cost-grids.js` → `1`; `node --check api/src/routes/cost-grids.js` → nessun output.
Poi (copiare `.env` dal checkout principale se manca nel worktree; ambiente isolato, mai il main stack): `bash scripts/run-tests.sh` → `VR-01`…`VR-04` OK, nessun fallimento.

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/cost-grids.js
git commit -m "refactor: one gridHasPublishedVersion helper for both version-creation routes (B-005)"
```

### Task 5: dati Vue morti, `?v=`, BACKLOG (B-001 + chiusura)

**Files:**
- Modify: `costgrid.html` riga 832, riga 762-763 (`?v=`)
- Modify: `js/lib/proposal-modals-guard.test.js` righe 11-14, 29-30
- Modify: `pipeline.html` righe 515, 518; `portfolio.html` riga 706; `program.html` riga 280; `planning.html` riga 262; `project-config.html` riga 413
- Modify: `docs/BACKLOG.md` righe B-001, B-003…B-006, nuova riga B-085

**Interfaces:**
- Consumes: i file modificati nei Task 1-2.
- Produces: nulla.

- [ ] **Step 1: Test che falliscono**

In `proposal-modals-guard.test.js`: aggiungi `'cloneGridName', 'cloneError', 'cloneSourceName'` a `REMOVED_IDS`; versione attesa di `js/costgrid.js` `'44'`. Aggiungi `it('every page loads the same js/api-sync.js version', …)` che legge le sei pagine e si aspetta `'23'` per ciascuna.

- [ ] **Step 2: Verifica rosso**

Run: `npx vitest run js/lib/proposal-modals-guard.test.js` → FAIL su `costgrid.html` (i tre nomi), su `'44'` e su `'23'`.

- [ ] **Step 3: Implementa**

Rimuovi la riga 832 di `costgrid.html`; `js/costgrid.js?v=43` → `?v=44` nelle due pagine; `js/api-sync.js?v=22` → `?v=23` nelle sei.

- [ ] **Step 4: Verifica verde**

Run: `npx vitest run js/lib/proposal-modals-guard.test.js js/lib/nav-shell-guard.test.js` → PASS; `grep -rn "api-sync.js?v=22\|costgrid.js?v=43" --include=*.html .` → nessun risultato.

- [ ] **Step 5: BACKLOG**

Righe B-001, B-003, B-004, B-005, B-006 → `closed 2026-10-16`, `Verified how` con il comando o test che lo prova (B-001: il `grep` del criterio 1; B-003: `js/lib/pipeline-proposal-busy.test.js`; B-004: `js/lib/api-sync-upsert.test.js`; B-005: `grep -c` del Task 4 → 1; B-006: i test di ordine e payload in `js/lib/costgrid-clone.test.js`). Nuova riga `B-085` | ciclo `2026-10-16-…-proposal-clone-followups` | `cgImportAll` non ha chiamanti ed è rotto (la POST della griglia ignora l'id, le versioni poi puntano al vecchio) | `js/costgrid.js` riga 1579 | open | `grep -rn cgImportAll` → solo la definizione, 2026-10-16. Poi `npx vitest run scripts/doc-paths-guard.test.js` → PASS.

- [ ] **Step 6: Commit**

```bash
git add costgrid.html pipeline.html portfolio.html program.html planning.html project-config.html js/lib/proposal-modals-guard.test.js docs/BACKLOG.md
git commit -m "chore: drop dead clone data (B-001), bump costgrid.js/api-sync.js, close B-001..B-006 in backlog"
```

## Decisioni aperte

1. **Chiusura delle righe di BACKLOG nel Task 5, non lasciata al Gate 5.** Alternativa scartata: lasciarle al passo `2b` del Gate 5. Perché: quel passo scrive i follow-up nuovi, e il criterio 8 della Spec vuole il `Verified how` legato ai test che il ciclo aggiunge.
2. **Un guard sulla versione di `js/api-sync.js` in tutte le sei pagine, dentro `proposal-modals-guard.test.js`.** Alternativa scartata: nessun guard (oggi nessun test lo fissa). Perché: è il file più condiviso che il ciclo tocca, e i due incidenti di cache-busting registrati in `CLAUDE.md` erano proprio un riferimento dimenticato.
