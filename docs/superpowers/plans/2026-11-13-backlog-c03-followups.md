# Backlog ciclo 3, follow-up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere B-476 … B-486 senza riaprire la gara di B-151: regole di `monthKeysError` complete, nomi dei task allineati al DB, `PATCH` di progetto che non scrive né blocca per un periodo invariato, testo di periodo del client senza regex e somme del form che contano solo i mesi del progetto.

**Architecture:** Correzioni sugli helper già esistenti (`api/src/lib/dates.js`, `api/src/lib/structure-rules.js`, `js/lib/dates.js`, `js/lib/config-form-calc.js`), poi sulle due route che li usano e sui due consumatori del client; il `PATCH` di progetto prende un test di route con client DB finto.

**Tech Stack:** Node/Express, PostgreSQL, `node:test` (backend), vitest + jsdom (frontend), `test-api.js` sullo stack isolato di `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-11-13-backlog-c03-followups-design.md`
**Branch:** `backlog-c03-followups`
**Risk class:** high-risk — `js/lib/dates.js` e `js/costgrid.js` sono file condivisi caricati da più pagine (§6.1b) e il ciclo tocca due route.

**Task independence:** i task 1-4 sono backend e in ordine (il 3 usa `taskTitle` del 2; il 4 non dipende dagli altri ma tocca `projects.js` da solo); i task 5-6 sono client e dipendono solo dal 5 per i `?v=`. I task toccano file diversi a coppie ma condividono le stesse due route e gli stessi test guard: esecuzione **nativa** per §6.1, subagent-driven non è soddisfatto perché il Piano non afferma l'indipendenza.

## Global Constraints

- Tutto il testo visibile all'utente è in inglese; i rifiuti di data sono `400 { error, code: 'DATE_RULE' }`.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare **tutti** i `?v=N` che lo citano (grep su tutto il repo, import relativi `./dates.js?v=N` compresi); `js/lib/foundations-guard.test.js`, `js/lib/dates-guard.test.js` e `js/lib/proposal-modals-guard.test.js` fissano valori esatti e si aggiornano nello stesso commit.
- Edit con Edit/Write, mai PowerShell `Set-Content` (BOM sull'HTML); niente codice con backslash passato da `node -e` o da uno script di shell (nel ciclo 3 una regex ha perso un livello di escape).
- Nessuna validazione di data fuori da `api/src/lib/dates.js` e `js/lib/dates.js` (`js/lib/dates-guard.test.js`).
- Durante i task si lanciano solo i file di test toccati (§6.2): `cd api && node --test src/<file>` e `npx vitest run <file>`; `scripts/run-tests.sh` una sola volta, al passo verde del task 4; **mai in parallelo a `npm test`**.
- Nessun `docker compose` sullo stack principale; il `restart api` è del Gate 4 di `/finish-cycle`.
- Commit con il trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Nessuna migrazione. B-477 non ha un task: si chiude in `/finish-cycle` con la SELECT del 2026-11-13 (0 righe).

## Review Focus

1. **Periodo invariato col progetto inesistente.** Un `PATCH` di sole date invariate su un id che non c'è risponde 404, non 200: test `missing project` del task 4.
2. **Periodo azzerato.** Un body `startDate: ''`, `endDate: ''` per un progetto con periodo è un cambio, prende il lock e scrive `NULL` (`periodColumn`): caso `cleared period` del task 4.
3. **Chiave salvata non valida.** Una chiave non-mese già salvata e rimandata è tollerata, una nuova no: casi `stored key` e `not a month` del task 1.
4. **Riga PTC senza `month`.** Una riga senza `month` è una chiave vuota, senza limiti: caso `blank month` già presente, mantenuto dal task 1.
5. **Periodo invertito nel form.** Un progetto il cui periodo è invertito non ha `projectMonths`: `sumWithinMonths` dà `0` e non lancia: caso `no months` del task 6.

---

### Task 1: `monthKeysError` completo (B-478, B-480)

**Files:**
- Modify: `api/src/lib/dates.js` (`monthKeysError`, riga ~203)
- Test: `api/src/lib/dates.test.js`

**Interfaces:**
- Produces: `monthKeysError(keys, storedPeriod, storedKeys)` con la stessa firma; nuovo ordine dei controlli: chiave vuota → chiave già salvata → formato (`isMonth`) → intervallo; un periodo salvato con inizio dopo la fine non impone limiti.

- [ ] **Step 1: Test che falliscono** in `api/src/lib/dates.test.js`, nomi e asserzioni:
  - `monthKeysError gives an inverted stored period no limit`: `[{key:'202601',label:'P'}]` con `{start:'202609',end:'202607'}` e `[]` → `null`.
  - `monthKeysError refuses a key that is not a month`: `key:'2026-07'`, periodo `202604`–`202612` → stringa che contiene `P month "2026-07" is not a valid month (expected YYYYMM).`; `key:'zzz'` con periodo `{start:'202609',end:''}` → lo stesso tipo di errore.
  - `monthKeysError tolerates a stored key that is not a month`: `key:'zzz'` presente in `storedKeys` → `null`.
- [ ] **Step 2:** Run `cd api && node --test src/lib/dates.test.js` — Expected: i tre falliscono (`monthKeysError` rifiuta 2026-07 con "outside" o accetta `zzz`; l'invertito rifiuta), gli altri passano.
- [ ] **Step 3: Implementa** in `monthKeysError`: uscire con `null` anche se `ps !== '' && pe !== '' && ps > pe`; nel ciclo, dopo `k === '' || stored.has(k)`, `if (!isMonth(k)) return` il messaggio sopra (con `label`).
- [ ] **Step 4:** stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** — `fix(dates): monthKeysError ignores an inverted period and checks the key format (B-478, B-480)`.

### Task 2: `taskTitle` e il link per id più per nome (B-479, B-485)

**Files:**
- Modify: `api/src/lib/structure-rules.js`
- Test: `api/src/lib/structure-rules.test.js`

**Interfaces:**
- Produces: `taskTitle(tk) -> string`, esportata: `(tk?.taskName || tk?.title || '').trim() || 'New Task'`; `missingLinkedTasks` non cambia.

- [ ] **Step 1: Test** in `structure-rules.test.js`:
  - `taskTitle falls back to New Task for an empty or blank title`: `taskTitle({})`, `taskTitle({taskName:'  '})`, `taskTitle(null)` → `'New Task'`.
  - `taskTitle trims and prefers taskName over title`: `taskTitle({taskName:' A ', title:'B'})` → `'A'`; `taskTitle({title:' B'})` → `'B'`.
  - `missingLinkedTasks: a task linked by id and by name is kept only by its id`: `linkedTaskIds:[T1.id]`, `linkedTaskNames:['T1']`, `payloadTaskIds:['new-id']`, `payloadTaskNames:['T1']` → `[T1]`; con `payloadTaskIds:[T1.id]` e `payloadTaskNames:[]` → `[]`.
- [ ] **Step 2:** Run `cd api && node --test src/lib/structure-rules.test.js` — Expected: i due test su `taskTitle` falliscono (`taskTitle is not a function`); il terzo passa già (fissa il comportamento).
- [ ] **Step 3: Implementa** `taskTitle` ed esportala accanto a `missingLinkedTasks`.
- [ ] **Step 4:** stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** — `fix(structure): one task title rule for the save and the unchanged-task match (B-479, B-485)`.

### Task 3: Structure `PUT` con `taskTitle` e una sola lettura (B-479, B-482)

**Files:**
- Modify: `api/src/routes/cost-grids.js` (structure `PUT`, righe ~801-856)

**Interfaces:**
- Consumes: `taskTitle(tk)` del task 2.

- [ ] **Step 1: Titolo.** Importa `taskTitle` da `../lib/structure-rules`; `bodyTasks` usa `name: taskTitle(tk)`; l'`INSERT` dei task usa `const tkTitle = taskTitle(tk);` (stesso valore di oggi: trim con `New Task`); `payloadTaskNames` resta `bodyTasks.map(t => t.name)`. `taskLabel` resta solo per i messaggi di errore.
- [ ] **Step 2: Una sola lettura.** Sostituisci le due query sui task con una `SELECT t.id, t.title, t.start_date, t.end_date FROM tasks t JOIN phases p ON p.id = t.phase_id WHERE p.version_id = $1` eseguita dove oggi si legge `storedTasks`; `storedTasks` è `rows.map(t => ({ name: t.title, start: t.start_date, end: t.end_date }))` e `currentTasks` è `rows`.
- [ ] **Step 3: Verifica.** Run: `cd api && node -e "require('./src/routes/cost-grids.js')"` — Expected: nessun errore; `grep -c "FROM tasks t JOIN phases p" api/src/routes/cost-grids.js` — Expected: `2` (il `PATCH` di versione e la structure `PUT`); `grep -n "taskTitle" api/src/routes/cost-grids.js` — Expected: import, `bodyTasks`, `INSERT`.
- [ ] **Step 4: Commit** — `refactor(cost-grids): the structure PUT reads the version tasks once and shares the task title rule (B-479, B-482)`.

### Task 4: `PATCH` di progetto senza periodo invariato e test di route (B-483, B-484, B-486)

**Files:**
- Modify: `api/src/routes/projects.js` (`PATCH /:id`, righe ~218-345)
- Create: `api/src/routes/projects.test.js`
- Modify: `test-api.js` (aggiunge `DR-09` in fondo a `testDateRulesC3`)

**Interfaces:**
- Produces: nessuna firma nuova; il comportamento del `PATCH /api/projects/:id`: la lettura non bloccata (`SELECT id, name, start_date, end_date, currency, cg_version_id`) decide `periodMoved`; con `periodMoved` falso `start_date` e `end_date` non entrano nell'`UPDATE`, senza transazione; con `periodMoved` vero o con `cgVersionId` nel body si apre la transazione con `FOR UPDATE`, `periodChangeError` gira una sola volta sotto lock, poi `taskDatesError`, poi l'`UPDATE` con il periodo.

- [ ] **Step 1: Test di route che falliscono** in `api/src/routes/projects.test.js`. Prima di `require('./projects')` sostituisci in `require.cache` i moduli `../db/client` (`query`, `pool.connect` che restituisce un client finto con `query` registrato), `../middleware/auth` (`requireAuth` passante, `liveRole` → `'admin'`), `../services/email` e `../services/profile-engine` (funzioni vuote); se un altro modulo letto al caricamento chiede altro, aggiungilo allo stub. Il gestore si prende da `router.stack` (la route `'/:id'` con metodo `patch`, ultimo handler del suo stack) e si chiama con `req = { user:{id:'u',role:'admin'}, params:{id}, body }` e un `res` finto (`status().json()`, `json()`). Il finto DB risponde alla lettura iniziale con `{ id, name:'P', start_date:'202604 ', end_date:'202612 ', currency:'EUR', cg_version_id:null }`. Casi (nomi):
  - `a changed period takes the row lock before the UPDATE`: body `{ endDate: '202611' }` → le istruzioni del client finto sono, in ordine, `BEGIN`, una che contiene `FOR UPDATE`, l'`UPDATE` che contiene `end_date`, `COMMIT`; `res` 200.
  - `an unchanged period opens no transaction and writes no period column`: body `{ name: 'Q', startDate: '202604', endDate: '202612' }` → nessun `BEGIN`; la `query` dell'`UPDATE` contiene `name` e non contiene `start_date` né `end_date`.
  - `a body of only unchanged dates answers 200 with id and name`: body `{ startDate: '202604', endDate: '202612' }` → nessun `UPDATE`, risposta `{ id, name: 'P' }`.
  - `a missing project answers 404 for a body of dates`: la lettura iniziale senza righe, body `{ startDate: '202604' }` → 404.
  - `a cleared period is a change`: body `{ startDate: '', endDate: '' }` → `BEGIN` e `FOR UPDATE`; l'`UPDATE` riceve `null` per le due colonne.
  - `a malformed changed period is refused under the lock`: body `{ endDate: '2026-11' }` → `BEGIN`, `ROLLBACK`, risposta 400 con `code: 'DATE_RULE'`.
- [ ] **Step 2:** Run `cd api && node --test src/routes/projects.test.js` — Expected: FAIL almeno su `an unchanged period opens no transaction…` (oggi il body con `startDate` apre la transazione) e su `a body of only unchanged dates…`.
- [ ] **Step 3: Implementa** nel `PATCH`: la `SELECT` iniziale aggiunge `id, name`; elimina il blocco del `periodChangeError` anticipato (righe 225-229); nel ciclo che costruisce `fields`, salta `startDate` e `endDate` quando `periodMoved` è falso; se `fields` resta vuoto e `periodMoved` è falso e il body portava un periodo, rispondi `{ id, name }` dalla lettura se la riga c'è e 404 `Project not found` se non c'è, altrimenti il `400 Nothing to update` di oggi; sostituisci la condizione del ramo transazionale `req.body.cgVersionId !== undefined || periodPresent` con `req.body.cgVersionId !== undefined || periodMoved` e togli `periodPresent` e il suo commento, aggiornando il commento del ramo (il lock serve a decidere sulla riga bloccata quando la lettura mostra un cambio).
- [ ] **Step 4:** stesso comando — Expected: PASS; `grep -c "periodChangeError" api/src/routes/projects.js` — Expected: il `PATCH` ne ha una sola chiamata (le altre sono nel `PUT /:id/tasks` e nell'import).
- [ ] **Step 5: `DR-09` in `test-api.js`** (nuovi controlli in fondo a `testDateRulesC3`, stesso progetto `pId`, periodo `202604`–`202610` dopo `DR-06`): `ok(r.status === 200 && r.data?.id === pId, 'DR-09 PATCH re-sending the same period → 200 with the project id')`; un `PATCH` con `{ name: '__test_dr_proj_renamed__', startDate: '202604', endDate: '202610' }` risponde 200 e il nome è cambiato (`GET /api/projects`); un `PATCH /ptc` con `{ month: '2026-07', amount: 1 }` risponde `DATE_RULE` e il messaggio contiene `is not a valid month`.
- [ ] **Step 6: Esegui una volta.** Run: `scripts/run-tests.sh` — Expected: `DR-01..DR-09` passano e nessun controllo esistente cambia esito (`TD-*`, `PS-*`, `DT-*`, `DR-10..16` inclusi); non lanciare `npm test` in parallelo.
- [ ] **Step 7: Commit** — `fix(projects): an unchanged period is neither locked nor written; route test for both PATCH paths (B-483, B-484, B-486)`.

### Task 5: Testo di periodo senza regex (B-481)

**Files:**
- Modify: `js/lib/dates.js` (`taskPeriodError`, `outOfPeriodTasks`, `outOfPeriodMessage`), `js/costgrid.js` (`cgOutOfPeriodNotice`)
- Test: `js/lib/dates.test.js`, `js/lib/costgrid-period-text.test.js`

**Interfaces:**
- Produces: `outOfPeriodTasks(tasks, start, end, parent) -> { name, error, ref, periodInvalid: boolean, periodRange: string }[]`; `periodInvalid` è vero quando un lato non è un mese valido o l'inizio è dopo la fine, `periodRange` è il testo `2026-12 – 2026-01` (`…` per un lato vuoto, il valore grezzo se non è un mese) che `taskPeriodError` usa già. Due funzioni interne non esportate, `isPeriodInvalid(ps, pe)` e `periodRangeText(ps, pe)`, sono la sola definizione, usate da `taskPeriodError`, `outOfPeriodTasks` e `outOfPeriodMessage`.

- [ ] **Step 1: Test che falliscono.** In `js/lib/dates.test.js`, nel `describe('shared helpers, cycle 3')`: `outOfPeriodTasks flags an inverted or malformed period`: con `'202612'`, `'202601'` ogni elemento ha `periodInvalid: true` e `periodRange: '2026-12 – 2026-01'`; con `'abc'`, `''` → `periodRange: 'abc – …'`; con `'202604'`, `'202612'` → `periodInvalid: false`. In `js/lib/costgrid-period-text.test.js`: `cgOutOfPeriodNotice does not read the error text`: un `window.outOfPeriodTasks` finto che restituisce `[{ name:'X', error:'anything', periodInvalid:true, periodRange:'2026-12 – 2026-01' }]` → `The project period (2026-12 – 2026-01) is not valid: fix it before adding tasks.`; con `periodInvalid:false` → il testo `These tasks are outside…`.
- [ ] **Step 2:** Run `npx vitest run js/lib/dates.test.js js/lib/costgrid-period-text.test.js` — Expected: i nuovi falliscono (campi assenti, testo letto dalla regex), gli altri passano.
- [ ] **Step 3: Implementa.** In `js/lib/dates.js` estrai `isPeriodInvalid` e `periodRangeText` dal corpo di `taskPeriodError` (stesso comportamento e stessi testi), usali in `outOfPeriodTasks` per aggiungere i due campi a ogni elemento e in `outOfPeriodMessage` al posto del calcolo `valid`; in `js/costgrid.js`, `cgOutOfPeriodNotice` usa `bad[0].periodInvalid` e `bad[0].periodRange` e la regex sparisce.
- [ ] **Step 4:** stesso comando più `npx vitest run js/lib/costgrid-generate-preflight.test.js js/lib/costgrid-copy-period.test.js js/lib/dates-guard.test.js` — Expected: PASS (i test del server twin di `dates-guard` non cambiano: le due funzioni interne non sono esportate).
- [ ] **Step 5: Versioni.** `js/lib/dates.js?v=5` → `?v=6` e `js/costgrid.js?v=60` → `?v=61`: `grep -rn "dates\.js?v=\|costgrid\.js?v=" --include=*.html --include=*.js .` (esclusi `node_modules`, `docs`) e porta **ogni** riferimento al nuovo valore: nove pagine `.html` per `dates.js`, i guard `js/lib/dates-guard.test.js` e `js/lib/privacy-notice-guard.test.js`, gli import relativi `./dates.js?v=5` di `js/lib/master-currencies.js`, `planning-rows.js`, `profile-ui.js`, `team-ui.js` e, poiché questi quattro file cambiano, i loro `?v=` nelle pagine (`master-currencies.html` 2→3, `planning.html` 3→4, `profile.html` 3→4, `attribute-lists.html` e `team.html` 9→10); `costgrid.html` e `pipeline.html` per `costgrid.js`, con il pin `'60'` → `'61'` in `js/lib/proposal-modals-guard.test.js`.
- [ ] **Step 6: Verifica.** Run: `npx vitest run js/lib/dates-guard.test.js js/lib/foundations-guard.test.js js/lib/proposal-modals-guard.test.js js/lib/privacy-notice-guard.test.js js/lib/dates.test.js js/lib/costgrid-period-text.test.js` — Expected: PASS; `grep -rn "dates\.js?v=5\|costgrid\.js?v=60" --include=*.html --include=*.js .` — Expected: nessun risultato fuori da `docs/`.
- [ ] **Step 7: Commit** — `refactor(dates): outOfPeriodTasks says whether the period is invalid and how to show it; cgOutOfPeriodNotice no longer reads an error text (B-481)`.

### Task 6: Somme del form sui soli mesi del progetto (B-476)

**Files:**
- Modify: `js/lib/config-form-calc.js`, `project-config.html` (`phasingSum`, `planningSum`, riga ~718-719 e riferimento `js/lib/config-form-calc.js?v=7`)
- Test: `js/lib/config-form-calc.test.js`

**Interfaces:**
- Produces: `sumWithinMonths(values, months) -> number`, esportata e collegata a `window.sumWithinMonths`: somma `values[ym]` per ogni `ym` di `months` il cui valore è un numero finito; un oggetto mancante o `months` vuoto → `0`.

- [ ] **Step 1: Test che falliscono** in `js/lib/config-form-calc.test.js`:
  - `sumWithinMonths counts only the given months`: `({ '202604': 2, '202611': 5 }, ['202604','202605'])` → `2`.
  - `sumWithinMonths ignores non-numbers`: `({ '202604': 'x', '202605': 3 }, ['202604','202605'])` → `3`.
  - `sumWithinMonths gives 0 for no months or a missing object`: `({ '202604': 2 }, [])` → `0`; `(undefined, ['202604'])` → `0`.
- [ ] **Step 2:** Run `npx vitest run js/lib/config-form-calc.test.js` — Expected: FAIL (`sumWithinMonths is not a function`).
- [ ] **Step 3: Implementa** la funzione e il ponte `window`; in `project-config.html` `phasingSum()` e `planningSum()` diventano `window.sumWithinMonths(this.project?.phasing, this.projectMonths)` e `window.sumWithinMonths(this.project?.planning, this.projectMonths)`; porta `js/lib/config-form-calc.js?v=7` a `?v=8` in `project-config.html` (verifica con `grep -rn "config-form-calc.js?v=" .`).
- [ ] **Step 4: Verifica.** Run: `npx vitest run js/lib/config-form-calc.test.js js/lib/foundations-guard.test.js js/lib/project-config-task-period-guard.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `fix(project-config): the phasing and planning sums count only the project months (B-476)`.

## Decisioni aperte

1. **Le decisioni 1-10 della Spec valgono come scritte.** Alternativa scartata: ridiscuterle nel Piano. Perché: sono già nel registro della Spec e questo Piano le attua.
2. **`outOfPeriodMessage` usa la funzione interna `isPeriodInvalid` invece di leggere `periodInvalid` dalla lista.** Alternativa scartata: leggere il campo da `list[0]`. Perché: i suoi chiamanti passano già `start` e `end`, e i test di `outOfPeriodMessage` costruiscono liste senza il campo; la definizione resta una sola.
3. **Gli elementi di `outOfPeriodTasks` portano anche `periodRange`.** Alternativa scartata: ricostruire il testo del periodo in `cgOutOfPeriodNotice` con `formatMonthText`. Perché: il testo atteso è `2026-12 – 2026-01` come in `taskPeriodError`, e `formatMonthText` dà `Dec 2026`; ricostruirlo nel client richiederebbe validare un mese fuori dai due moduli di date.
4. **Il test di route sostituisce i moduli in `require.cache` e chiama l'ultimo handler della route.** Alternativa scartata: avviare Express con `supertest`. Perché: `supertest` non è una dipendenza di `api/` e il test deve restare un `node:test` senza rete.
5. **`DR-09` si aggiunge in fondo a `testDateRulesC3`.** Alternativa scartata: una nuova funzione di test. Perché: riusa la proposta e i due progetti già creati e lo stato di `pId` dopo `DR-06`.
6. **`sumWithinMonths` sta in `js/lib/config-form-calc.js`.** Alternativa scartata: un metodo di `project-config.html`. Perché: la pagina non è testabile da vitest e il modulo ha già `phasingBalance` che consuma quelle somme.
7. **`scripts/run-tests.sh` gira una sola volta, al task 4.** Alternativa scartata: una volta per task backend. Perché: i task 1-3 hanno test unitari che li coprono e il task 4 contiene l'unico cambio di comportamento visibile dall'API.
