# Pipeline year — anno sul Draft e anno ricordato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-04-pipeline-year-persistence-design.md`
**Branch:** `pipeline-year-persistence`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/core.js`, `?v=` su ogni pagina che lo carica), route API (`api/src/routes/cost-grids.js`, `reporting.js`)

**Goal:** una proposal creata o clonata mentre `pipeline.html` mostra l'anno Y resta nell'anno Y dopo la pubblicazione, e l'anno scelto sopravvive alla navigazione.

**Architecture:** l'anno viaggia sul Draft (`cost_grid_versions.pipeline_year`), scritto alla creazione e mantenuto da Publish. Logica pura in `api/src/lib/pipeline-year.js` (validazione) e `js/lib/pipeline-year.js` (precedenza URL / salvato / corrente); le route e `pipeline.html` la usano. Nessuna migration.

**Tech Stack:** Express + `pg`, Vue 3 da CDN, `node:test`, vitest + jsdom, `test-api.js` (suite d'integrazione).

**Tasks independent?** No: il Task 2 consuma la lib del Task 1, il Task 4 consuma quella del Task 3 e la route del Task 2.

## Global Constraints

- Copy in inglese. Nessun `confirm(`/`alert(`, nessun hex, nessun `Intl.NumberFormat` su importi.
- Cache-busting: ogni file versionato modificato → bump di **tutti** i suoi `?v=N` nel repo (`grep -rn "<file>?v=" --include=*.html --include=*.js . | grep -v node_modules`). Questo ciclo bumpa `js/core.js` (15 → 16) e `js/costgrid.js` (57 → 58); `js/lib/pipeline-year.js` è nuovo e parte da `?v=1`.
- Nuova chiave `localStorage`: va nel `keep` Set di `js/core.js` o viene cancellata alla navigazione successiva.
- Durante i task solo i test toccati; la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack: la suite d'integrazione gira con `scripts/run-tests.sh` (stack isolato).
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM).
- Worktree: path assoluto `C:\Users\Fabrizio.Fortini\Progetti\burndown\.claude\worktrees\pipeline-year-persistence`; copiare `.env` dal checkout principale prima di `run-tests.sh`.

## Review Focus

1. **Un lettore di `pipeline_year` che conta un Draft** — `reporting.js` `/phasing` è l'unico trovato senza filtro; ricontrollare con `grep -rn "pipeline_year" api/src` che nessun altro lo legga senza escludere i Draft (Task 2).
2. **`COALESCE` nel publish** — un Draft con anno non viene sovrascritto con l'anno corrente; un Draft senza anno sì (Task 2, `test-api.js`).
3. **`duplicate` da una versione non Draft** — il nuovo Draft resta a `NULL`, `ND-03` invariato (Task 2).
4. **`localStorage` che lancia o è vuoto** — `pipeline.html` si apre sull'anno corrente senza errori (Task 3).
5. **Anno salvato non più disponibile** (anno disattivato, utente non admin) — ignorato, mai un 403 al primo caricamento (Task 3 + Task 4).

---

### Task 1: Validazione dell'anno lato server — `api/src/lib/pipeline-year.js`

**Files:**
- Create: `api/src/lib/pipeline-year.js`
- Create: `api/src/lib/pipeline-year.test.js`

**Interfaces:**
- Produces: `parsePipelineYear(value)` → `{ year: null }` se `value` è `undefined`/`null`; `{ year: n }` se è un intero 2000–2100 (numero o stringa di sole cifre); `{ error: 'pipelineYear must be an integer between 2000 and 2100' }` altrimenti. `pipelineYearAvailabilityError(row)` → `null` se `row` esiste e `row.active === true`; altrimenti `'Pipeline year not found'` o `'Pipeline year is inactive'`.

- [ ] **Step 1: Test (falliscono)** in `pipeline-year.test.js` con `node:test`: `undefined`/`null` → `{ year: null }`; `2027` e `'2027'` → `{ year: 2027 }`; `'2027.5'`, `'abc'`, `1999`, `2101`, `true`, `NaN`, `''` → `error`; `pipelineYearAvailabilityError(undefined)` → "not found"; `{ active: false }` → "inactive"; `{ active: true }` → `null`.
- [ ] **Step 2: Lancia** — dalla cartella `api/`: `node --test src/lib/pipeline-year.test.js`. Atteso: FAIL (modulo mancante).
- [ ] **Step 3: Implementa** il modulo (CommonJS, `module.exports`), puro, senza dipendenze.
- [ ] **Step 4: Rilancia** lo stesso comando. Atteso: PASS.
- [ ] **Step 5: Commit** — `git add api/src/lib/pipeline-year.js api/src/lib/pipeline-year.test.js && git commit -m "feat(api): pipeline year validation helpers"`

---

### Task 2: Route — anno sul Draft, duplicate, publish, report

**Files:**
- Modify: `api/src/routes/cost-grids.js` (POST `/:id/versions`, POST `/:id/versions/:vId/duplicate`, POST `/:id/versions/:vId/publish`)
- Modify: `api/src/routes/reporting.js` (GET `/phasing`)
- Test: `test-api.js` (nuovo blocco `PYP-*` accanto al blocco `ND-*`)

**Interfaces:**
- Consumes: `parsePipelineYear`, `pipelineYearAvailabilityError` (Task 1).
- Produces: `POST /api/cost-grids/:id/versions` accetta `pipelineYear`; il Draft risponde con `pipeline_year`. Publish conserva l'anno del Draft.

- [ ] **Step 1: Test d'integrazione (falliscono)** in `test-api.js`, blocco `PYP`, con un anno di test attivo creato via `POST /api/pipeline-years` (riusare il pattern di `TEST_YEAR`/`later('DELETE', …)` e una costante nuova `TEST_YEAR_C`) e uno inattivo:
  - `PYP-01` — `POST …/versions` con `pipelineYear` valido → 201 e `pipeline_year` uguale; senza `pipelineYear` → `pipeline_year` null.
  - `PYP-02` — `pipelineYear` `'abc'`, un anno inesistente, un anno inattivo → 400 e nessuna versione creata (conteggio versioni invariato).
  - `PYP-03` — Draft con anno Y poi `publish` → `pipeline === 'SIP'` e `pipeline_year === Y`, diverso dall'anno corrente.
  - `PYP-04` — Draft senza anno poi `publish` → `pipeline_year` = anno corrente.
  - `PYP-05` — `duplicate` di un Draft con anno Y → nuova versione con `pipeline_year === Y`; `duplicate` di un Draft senza anno → `null`; `ND-03` resta verde.
  - `PYP-06` — `GET /api/reporting/phasing?year=Y` non include un Draft con `pipeline_year = Y` (setup: una versione Draft con task e ruolo, anno Y, utente admin).
- [ ] **Step 2: Lancia** — `scripts/run-tests.sh` (stack isolato, dal worktree). Atteso: FAIL sui `PYP-*`, nessuna regressione altrove.
- [ ] **Step 3: Implementa**
  - `POST /:id/versions`: leggere `pipelineYear` dal body; `parsePipelineYear`; se `year !== null`, `SELECT active FROM pipeline_years WHERE year = $1` e `pipelineYearAvailabilityError`; errore → `400 { error }` **prima** di qualunque INSERT. Aggiungere `pipeline_year` all'INSERT.
  - `duplicate`: aggiungere `pipeline_year` all'INSERT con `s.pipeline === 'Draft' ? s.pipeline_year : null`; aggiornare il commento sopra l'INSERT.
  - `publish`: `SELECT pipeline, pipeline_year`; l'UPDATE usa `COALESCE(pipeline_year, $1)`.
  - `reporting.js` `/phasing`: aggiungere `AND cgv.pipeline <> 'Draft'` alla `WHERE`.
- [ ] **Step 4: Rilancia** `scripts/run-tests.sh`. Atteso: PASS completo.
- [ ] **Step 5: Controllo dei lettori** — `grep -rn "pipeline_year" api/src --include=*.js`: ogni lettore o filtra i Draft o legge una versione già collegata a un progetto; annotare l'esito nel messaggio di commit.
- [ ] **Step 6: Commit** — `git add api/src/routes/cost-grids.js api/src/routes/reporting.js test-api.js && git commit -m "fix(api): keep the pipeline year chosen at creation through publish"`

---

### Task 3: Anno ricordato — `js/lib/pipeline-year.js` e `core.js`

**Files:**
- Create: `js/lib/pipeline-year.js`
- Create: `js/lib/pipeline-year.test.js`
- Modify: `js/core.js:4` (`keep` Set)
- Modify: ogni `?v=` di `js/core.js` (15 → 16)

**Interfaces:**
- Produces: `PIPELINE_YEAR_KEY = 'PDash_pipelineYear'`; `readStoredPipelineYear()` → intero o `null` (mai lancia); `storePipelineYear(year)` (mai lancia); `resolvePipelineYear({ urlYear, storedYear, availableYears, currentYear })` → intero. Precedenza: `urlYear` se disponibile, poi `storedYear` se disponibile, poi `currentYear` se disponibile, poi il primo di `availableYears`, poi `currentYear`. Ponti `window.<name>`.

- [ ] **Step 1: Test (falliscono)** in `pipeline-year.test.js` (vitest + jsdom): le cinque posizioni della precedenza; `urlYear` non disponibile cade sul salvato; salvato non disponibile cade sull'anno corrente; `availableYears` vuoto → `currentYear`; `readStoredPipelineYear` con `localStorage.getItem` che lancia → `null`; valore non numerico → `null`; `storePipelineYear` con `setItem` che lancia non lancia; round-trip store/read. Più un caso che legge `js/core.js` come testo e verifica che il `keep` Set contenga `'PDash_pipelineYear'`.
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/pipeline-year.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementa** il modulo ES con il ponte `window` (convenzione di `js/lib/`) e aggiungi la chiave al `keep` Set di `core.js`.
- [ ] **Step 4: Bump** `core.js?v=15` → `?v=16` in ogni riferimento.
- [ ] **Step 5: Rilancia** — `npx vitest run js/lib/pipeline-year.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js`. Atteso: PASS.
- [ ] **Step 6: Commit** — `git add js/lib/pipeline-year.js js/lib/pipeline-year.test.js js/core.js '*.html' && git commit -m "feat(pipeline): remember the selected pipeline year in localStorage"`

---

### Task 4: `pipeline.html` e `js/costgrid.js` usano l'anno

**Files:**
- Modify: `js/costgrid.js` (`cgCreateNewGrid`, `cgCloneGrid`)
- Modify: `pipeline.html` (`created()`, `selectYear()`, `createNewProposal()`, `cloneProposal()`, tag `<script>` del nuovo modulo)
- Test: `js/lib/pipeline-proposal-busy.test.js`, `js/lib/pipeline-year.test.js`
- Modify: ogni `?v=` di `js/costgrid.js` (57 → 58)

**Interfaces:**
- Consumes: `resolvePipelineYear`, `readStoredPipelineYear`, `storePipelineYear` (Task 3); `pipelineYear` su `POST …/versions` (Task 2).
- Produces: `cgCreateNewGrid(year)` e `cgCloneGrid(srcCgId, srcVerId, year)` passano `pipelineYear: year` a `Api.costGrids.versions.create` quando `year` è un intero; `createNewProposal()`/`cloneProposal()` passano `this.selectedYear`.

- [ ] **Step 1: Test (falliscono)**
  - `pipeline-proposal-busy.test.js`: `createNewProposal` chiama `cgCreateNewGrid` con `selectedYear`; `cloneProposal` chiama `cgCloneGrid(cgId, verId, selectedYear)` (estendere `cases` e lo stub con l'argomento).
  - `pipeline-year.test.js`: leggere `pipeline.html` come testo e verificare che `created()` risolva l'anno con `resolvePipelineYear`, che `selectYear` chiami `storePipelineYear`, e che il tag `<script type="module" src="js/lib/pipeline-year.js?v=1">` sia presente prima dello script della pagina.
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/pipeline-proposal-busy.test.js js/lib/pipeline-year.test.js`. Atteso: FAIL sui nuovi casi.
- [ ] **Step 3: Implementa**
  - `js/costgrid.js`: i due punti che chiamano `Api.costGrids.versions.create` aggiungono `pipelineYear: year` al body solo se `Number.isInteger(year)`.
  - `pipeline.html` `created()`: sostituire la risoluzione di `reqYear` con `resolvePipelineYear({ urlYear: <?year= o null>, storedYear: readStoredPipelineYear(), availableYears: pipelineYears.map(py => py.year), currentYear: new Date().getFullYear() })`, mantenendo il `replaceState` di `?year=`.
  - `selectYear(year)`: dopo aver aggiornato lo stato, `storePipelineYear(year)`. Leggere il metodo attuale prima di modificarlo.
  - `createNewProposal()` / `cloneProposal()`: passare `this.selectedYear`.
- [ ] **Step 4: Bump** `js/costgrid.js?v=57` → `?v=58` in ogni riferimento.
- [ ] **Step 5: Rilancia** — `npx vitest run js/lib/pipeline-proposal-busy.test.js js/lib/pipeline-year.test.js js/lib/pipeline-guard.test.js js/lib/foundations-guard.test.js`. Atteso: PASS.
- [ ] **Step 6: Commit** — `git add pipeline.html js/costgrid.js js/lib/pipeline-proposal-busy.test.js js/lib/pipeline-year.test.js '*.html' && git commit -m "fix(pipeline): create and clone proposals in the year being viewed"`

---

### Task 5: Documentazione e caso manuale

**Files:**
- Modify: `docs/pages/pipeline.md` (nuova sezione datata 2026-11-04; correggere la riga di "Filter bar" "Filters reset on every page load … apply only to the currently selected pipeline year" solo se risulta falsa)
- Modify: `docs/api/lib.md` (voce `pipeline-year.js`), `docs/js/lib.md` (voce `pipeline-year.js`)
- Modify: `CLAUDE.md` (elenco chiavi `localStorage` nella sezione "Data strategy": aggiungere `PDash_pipelineYear`)
- Modify: `TEST_CASES.md` (caso manuale: anno 2027, New Proposal, Publish, navigazione, ritorno)

- [ ] **Step 1: Scrivi** le voci; nessun numero in prosa, nessuna giustificazione di regola (regole di `CLAUDE.md` "Writing documentation").
- [ ] **Step 2: Verifica** — `npx vitest run js/lib/test-cases-parse.test.js scripts/doc-paths-guard.test.js scripts/claude-md-guard.test.js`. Atteso: PASS.
- [ ] **Step 3: Commit** — `git add docs CLAUDE.md TEST_CASES.md && git commit -m "docs(pipeline): pipeline year on the Draft and remembered year"`. Lo stack del branch resta su per il Gate 2.

---

## Decisioni aperte

1. **Esecuzione nativa inline, non subagent-driven.** Alternativa scartata: subagent-driven. Perché: §6.1 richiede task indipendenti, e ogni task consuma il precedente.
2. **Validazione in un modulo puro `api/src/lib/pipeline-year.js`, la lookup in `pipeline_years` nella route.** Alternativa scartata: tutto nella route. Perché: la parte pura si testa con `node:test` senza DB.
3. **La precedenza dell'anno è una funzione pura che riceve gli anni disponibili.** Alternativa scartata: logica inline in `created()`. Perché: `pipeline.html` non è testabile per unità e la precedenza è la parte che può regredire.
4. **`PYP-06` verifica `/api/reporting/phasing` con un Draft reale.** Alternativa scartata: un test sul testo SQL. Perché: la regressione da evitare è il conteggio, non la presenza di una clausola.
5. **I `?v=` di `core.js` e `costgrid.js` si bumpano nei task che li modificano, non in un task finale.** Alternativa scartata: un solo bump alla fine. Perché: `foundations-guard` e `nav-shell-guard` restano verdi a ogni commit.
