# Backlog ciclo 3 — regole su date e periodi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un solo punto per unire e controllare i periodi, usato da tutte le route elencate nel Brief, e un client senza copie delle funzioni di periodo.

**Architecture:** Helper puri in `api/src/lib/dates.js` (`mergePeriod`, `periodChanged`, `periodColumn`, `taskDatesError`, `monthKeysError`) sostituiscono `periodShrinkError` e le copie nelle route; `structure-rules.js` considera anche i task linkati per nome; sul client `js/lib/dates.js` ospita il testo del banner e i limiti dei picker, le pagine tengono solo i computed che leggono i propri dati.

**Tech Stack:** Node/Express, PostgreSQL, `node:test` (backend), vitest + jsdom (frontend), `test-api.js` sullo stack isolato di `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-11-13-backlog-c03-date-period-rules-design.md`
**Branch:** `backlog-c03-date-rules`
**Risk class:** high-risk — `js/lib/dates.js` e `js/costgrid.js` sono file condivisi caricati da più pagine (§6.1b), e il ciclo modifica nove route.

**Task independence:** i task 1-8 sono in ordine e non indipendenti: i task 3-4 consumano le firme del task 1, i task 7-8 quelle del task 6, e i task 3-4 toccano gli stessi due file di route. Esecuzione **nativa** per §6.1 (task fortemente sequenziali che condividono file); subagent-driven non è soddisfatto perché il Piano non afferma l'indipendenza.

## Global Constraints

- Tutto il testo visibile all'utente è in inglese; i rifiuti sono `400 { error, code: 'DATE_RULE' }`.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare **tutti** i `?v=N` che lo citano (grep su tutto il repo); `js/lib/foundations-guard.test.js` e `js/lib/dates-guard.test.js` fanno da rete.
- Edit con Edit/Write, mai PowerShell `Set-Content` (BOM sull'HTML); niente backslash passati da `node -e`.
- Un periodo invalido già salvato è tollerato finché le sue date non cambiano; un task nuovo o modificato è sempre controllato.
- Il periodo del progetto e della versione è `YYYYMM`, la colonna è `CHAR(6)`: ogni confronto passa da `trim`.
- Durante i task si lanciano solo i file di test toccati (§6.2): `cd api && node --test src/lib/<file>` e `npx vitest run <file>`; `scripts/run-tests.sh` una sola volta, al passo verde del task 5.
- Nessun `docker compose` sullo stack principale; il `restart api` è del Gate 4 di `/finish-cycle`.
- Commit con il trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Re-invio invariato.** La `PATCH` di progetto che manda un periodo identico a quello salvato (il frontend lo fa a ogni salvataggio) risponde 200 senza rileggere i task: test `DR-05` in `test-api.js`.
2. **Task rinominato fuori periodo.** Un task con nome diverso e date uguali è "modificato", quindi controllato per intero: caso `edited task` nei test di `taskDatesError` e `DR-02`.
3. **Mese vuoto e progetto senza periodo.** Una riga PTC con `month: ''` (il form la crea così quando il progetto non ha mesi) e un progetto senza periodo non hanno limiti: casi `blank month` e `no period` di `monthKeysError`, e `DR-07`.
4. **Chiave già salvata fuori periodo.** Un PATCH che rimanda un mese già presente è accettato; uno nuovo fuori periodo no: caso `stored key` di `monthKeysError` e `DR-06`.
5. **Task linkato per solo nome.** Un task presente solo in `task_names_direct` non può sparire dalla structure `PUT` e un rename con lo stesso id non lo fa sparire: casi di `missingLinkedTasks` e `DR-08`.

---

### Task 1: Helper di periodo del server

**Files:**
- Modify: `api/src/lib/dates.js` (sostituisce `periodShrinkError`, riga ~138; aggiorna `module.exports`)
- Test: `api/src/lib/dates.test.js` (le prove di `periodShrinkError`, riga ~65, passano a `taskDatesError` con `storedTasks = tasks`)

**Interfaces:**
- Produces: `mergePeriod(body: {start?,end?}, stored: {start,end}) -> {start: string, end: string}` (lato assente = salvato, `''` = svuotato, valori trimmati); `periodChanged(body, stored) -> boolean` (true se un lato presente nel body, trimmato, differisce dal salvato); `periodColumn(v) -> string|null` (`null` per vuoto/blank, altrimenti trimmato); `taskDatesError({ tasks, storedTasks, storedPeriod, nextPeriod, parent }) -> string|null` con task `{ name, start, end }`; `monthKeysError(keys: {key: string, label: string}[], storedPeriod: {start,end}, storedKeys: string[]) -> string|null`.
- Consumes: `normalize`, `periodError`, `taskPeriodError`, `isMonth`, `toYmd` già in `dates.js`.

- [ ] **Step 1: Scrivi i test (falliscono)** in `api/src/lib/dates.test.js`. Nomi e asserzioni:
  - `mergePeriod keeps the stored side when absent and clears on ''`: `({start:'202609'},{start:'202601 ',end:'202612'})` → `{start:'202609',end:'202612'}`; `({end:''},{start:'202601',end:'202612'})` → `{start:'202601',end:''}`.
  - `periodChanged ignores a re-sent identical period and blank padding`: `({start:'202601',end:'202612'},{start:'202601 ',end:'202612'})` → `false`; `({end:'202611'},…)` → `true`; body vuoto → `false`.
  - `periodColumn`: `'  '`, `null`, `undefined` → `null`; `' 202601'` → `'202601'`.
  - `taskDatesError`: **valid** task dentro il periodo → `null`; **inverted** (nuovo task con fine prima dell'inizio, dentro il periodo) → messaggio che contiene `before its start date`; **edited task** (nome cambiato, stesse date, fuori dal periodo salvato) → messaggio che contiene `outside`/`before the version period`; **existing invalid tolerated** (task invariato già fuori dal periodo salvato, stesso periodo) → `null`; **shrink** (task invariato dentro il salvato, fuori dal nuovo) → messaggio del task (come i test di `periodShrinkError` di oggi); **same shrink from PATCH and PUT** (`storedTasks` uguale a `tasks`, e `storedTasks` più lungo con lo stesso task) → stessa stringa; **duplicate names** (due task con nome e date uguali, uno solo salvato) → il secondo è "nuovo" e controllato.
  - `monthKeysError`: **outside** `[{key:'202601',label:'PTC row 1'}]` con periodo `202609-202612` → stringa che contiene `PTC row 1` e `2026-09`; **stored key** stessa chiave presente in `storedKeys` → `null`; **blank month** `key:''` → `null`; **no period** (`{start:'',end:''}`) → `null`; **half-open** periodo `{start:'202609',end:''}` rifiuta `202601`, accetta `202701`; **stored period invalid** (`{start:'abc',end:''}`) → `null`.
- [ ] **Step 2: Verifica il fallimento.** Run: `cd api && node --test src/lib/dates.test.js` — Expected: FAIL (`mergePeriod is not a function`).
- [ ] **Step 3: Implementa** le cinque funzioni in `api/src/lib/dates.js`, esportale e **rimuovi** `periodShrinkError`. `taskDatesError`: un task è *invariato* se esiste un task salvato non ancora usato con la stessa chiave `nome normalizzato (trim, spazi collassati) | toYmd(start) ?? normalize(start) | idem end` (confronto a multiinsieme: ogni salvato si consuma una volta). Invariato: se `taskPeriodError` contro `storedPeriod` non è `null` (già fuori o periodo salvato invalido) → si salta; altrimenti si controlla contro `nextPeriod`. Non invariato: prima `taskPeriodError` contro `nextPeriod`, poi `periodError(start, end, {kind:'day', label:`task "${name}"`})`. Restituisce il primo errore. `monthKeysError`: salta chiavi vuote, chiavi già in `storedKeys` e il caso in cui un lato del periodo salvato non sia un mese valido; per ogni altra chiave fuori da `[start, end]` (lato vuoto = aperto) restituisce `` `${label} month ${YYYY-MM} is outside the project period (${start} – ${end}).` `` con `…` per il lato vuoto.
- [ ] **Step 4: Verifica il verde.** Run: `cd api && node --test src/lib/dates.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(dates): one period merge and one task-date rule for the server`.

### Task 2: Task linkati per solo nome (B-124)

**Files:**
- Modify: `api/src/lib/structure-rules.js`
- Test: `api/src/lib/structure-rules.test.js`

**Interfaces:**
- Produces: `missingLinkedTasks({ linkedTaskIds, linkedTaskNames = [], currentTasks, payloadTaskIds, payloadTaskNames = [] })` — un task corrente è *linkato* se il suo id è in `linkedTaskIds` **o** il suo titolo (trim, minuscolo) è in `linkedTaskNames`; è *tenuto* se il suo id è in `payloadTaskIds` **o** il suo titolo è in `payloadTaskNames`. I nuovi parametri sono opzionali: i chiamanti di oggi restano validi.

- [ ] **Step 1: Test (falliscono)** in `structure-rules.test.js`: `name-only link, task dropped → missing`; `name-only link, same id kept under a new title → not missing`; `name-only link, task re-created with a new id but the same title → not missing`; `case and spaces in the name are ignored`; i test esistenti restano invariati.
- [ ] **Step 2:** Run `cd api && node --test src/lib/structure-rules.test.js` — Expected: FAIL.
- [ ] **Step 3: Implementa** la firma sopra in `structure-rules.js`.
- [ ] **Step 4:** stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** — `fix(structure): a task linked by name only cannot be dropped (B-124)`.

### Task 3: Route di `cost-grids.js` (versione e structure)

**Files:**
- Modify: `api/src/routes/cost-grids.js` (`PATCH /:id/versions/:vId`, riga ~436; `PUT /:id/versions/:vId/structure`, riga ~690)

**Interfaces:**
- Consumes: gli helper del task 1 e `missingLinkedTasks` del task 2.

- [ ] **Step 1: `PATCH` versione.** Importa `taskDatesError`, `periodChanged`, `mergePeriod`; calcola `periodChanged` con l'helper al posto dell'espressione locale `trimmed`. Nel ramo `if (periodChanged)` sostituisci `periodShrinkError(...)` con `taskDatesError({ tasks, storedTasks: tasks, storedPeriod, nextPeriod: mergePeriod({start: startDate, end: endDate}, stored), parent: 'version' })`, con `tasks` mappati `{ name: t.title, start: t.start_date, end: t.end_date }` come oggi. Il lock resta com'è.
- [ ] **Step 2: Structure `PUT` — periodo.** Dentro la transazione, dopo aver letto `stored`, leggi anche i task salvati (`SELECT t.title, t.start_date, t.end_date FROM tasks t JOIN phases p ON p.id = t.phase_id WHERE p.version_id = $1`, mappati a `{name,start,end}`). Sostituisci il blocco `hasPeriod` / i due cicli `taskPeriodError` + `periodError` con una chiamata a `taskDatesError` e `next = mergePeriod(...)`; i task del body sono `{ name: tk.taskName || tk.title, start: tk.taskStartDate || tk.start_date, end: tk.taskEndDate || tk.end_date }`. Se `hasPeriod`, mantieni il controllo `periodChangeError` per la forma del periodo.
- [ ] **Step 3: Structure `PUT` — scrittura.** L'`UPDATE` del periodo gira solo se `hasPeriod && periodChanged(periodBody-as-{start,end}, stored)`, con `periodColumn` al posto di `col` (B-170, B-167).
- [ ] **Step 4: B-224 e B-124.** Estrai un helper locale `taskLabel(tk)` (`tk.taskName || tk.title || ''`) e usalo nelle quattro occorrenze; leggi `currency` una volta sola. Il ciclo delle ore vendute resta prima del lock: non ha bisogno del DB, e per questo le due passate restano (vedi decisione 9). Nella `SELECT` dei link aggiungi `task_names_direct` e passa a `missingLinkedTasks` `linkedTaskNames: linkedRows.rows.flatMap(r => r.task_names_direct || [])` e `payloadTaskNames: <titoli del body>`.
- [ ] **Step 5: Verifica.** Run: `cd api && node --test src/lib/dates.test.js src/lib/structure-rules.test.js` — Expected: PASS; rileggi i due handler: nessun riferimento a `periodShrinkError` (`grep -rn "periodShrinkError" api/src` → nessun risultato, test inclusi).
- [ ] **Step 6: Commit** — `refactor(cost-grids): version and structure routes use the shared period rule (B-132, B-124, B-167, B-169, B-170, B-224)`.

### Task 4: Route di `projects.js` (progetto, task, phasing, ptc, planning)

**Files:**
- Modify: `api/src/routes/projects.js` (`PATCH /:id` ~208; `PUT /:id/tasks` ~407; `PATCH /:id/phasing` ~528, `/ptc` ~561, `/planning` ~594)

**Interfaces:**
- Consumes: gli helper del task 1.

- [ ] **Step 1: `PATCH /:id`.** Una sola lettura non bloccata `SELECT start_date, end_date, currency, cg_version_id FROM projects WHERE id = $1` all'inizio (sostituisce le due letture di B-135) alimenta `periodChanged`, le regole di valuta/link (`needsRules`) e la decisione `needsTx = periodChanged || req.body.cgVersionId !== undefined`. Il ramo che oggi vale solo per `cgVersionId` diventa `if (needsTx)`: ordine dei lock invariato (versione di destinazione se c'è, poi `SELECT start_date, end_date FROM projects WHERE id = $1 FOR UPDATE`); se il periodo cambia, dopo il lock rilegge il periodo salvato, esegue `periodChangeError` e `taskDatesError` (task da `project_tasks`, `storedTasks: tasks`, `parent: 'project'`) e, **sulla stessa `client`**, l'`UPDATE`; un errore di date fa `ROLLBACK` e risponde `DATE_RULE`. Senza cambio di periodo non c'è né rilettura dei task né controllo (B-162). Il ramo senza transazione resta per le `PATCH` che non toccano né il periodo né il link.
- [ ] **Step 2: `PUT /:id/tasks`.** Leggi i task salvati sotto il `FOR UPDATE` già presente; sostituisci `hasPeriod`/i due cicli con `mergePeriod` + `taskDatesError`; `UPDATE` del periodo solo se `periodChanged`, con `periodColumn`.
- [ ] **Step 3: phasing, ptc, planning.** Ciascuna legge nella `SELECT … FOR UPDATE` anche `start_date, end_date` e il campo che scrive (`phasing`/`ptc`/`planning`). Dopo il controllo di importi esistente (`phasingError`/`ptcRowsError`) chiama `monthKeysError`: per phasing e planning le chiavi dell'oggetto con etichetta `Phasing <key>`/`Planning <key>`, per il PTC il campo `month` di ogni riga con etichetta `PTC row <n>`, `storedKeys` dalle chiavi già salvate; l'errore fa `ROLLBACK` e risponde `400 { error, code: DATE_RULE }`. `/planning` prende la stessa forma transazionale di `/phasing` (404 se il progetto non esiste).
- [ ] **Step 4: Verifica.** Rileggi i quattro handler: nessuna `periodChangeError`/`taskDatesError`/`UPDATE` del periodo fuori dalla transazione dopo `FOR UPDATE`; `grep -n "SELECT start_date, end_date FROM projects" api/src/routes/projects.js` mostra una lettura bloccata nel `PATCH` e una sola non bloccata di inizio handler.
- [ ] **Step 5: Commit** — `fix(projects): period checks under the project row lock and month keys inside the period (B-149, B-151, B-135, B-162, B-167)`.

### Task 5: Controlli in `test-api.js`

**Files:**
- Modify: `test-api.js` (nuova `async function testDateRulesC3()` dopo `testTaskPeriod`, registrata accanto alla chiamata a `testTaskPeriod()`, riga ~5103)

**Interfaces:**
- Consumes: i comportamenti dei task 3-4; setup identico a `testTaskPeriod` (anno pipeline, proposta, versione con periodo `202604`-`202612`, progetto generato con lo stesso periodo). Prefisso `DR-`: verifica con `grep -n "DR-0" test-api.js` che non esista già.

- [ ] **Step 1: Scrivi i controlli**, ognuno con la forma `ok(cond, 'DR-NN <descrizione> (got ${status})')`:
  - `DR-01` stessa riduzione di periodo (task invariato dentro il salvato, fuori dal nuovo) rifiutata sia da `PATCH` versione sia dalla structure `PUT` con `period` nel body, **stesso testo** di errore (B-169).
  - `DR-02` task con nome diverso e date fuori periodo → `DATE_RULE` sulla structure `PUT` e su `PUT /tasks` (Review Focus 2).
  - `DR-03` structure `PUT` che rimanda gli stessi task e lo stesso periodo → 200 e `start_date`/`end_date` della versione invariati (B-170).
  - `DR-04` `PUT /tasks` con tutti i task dentro il periodo → 200.
  - `DR-05` `PATCH` progetto che rimanda lo stesso `startDate`/`endDate` → 200 e dopo un `PUT /tasks` con un task a metà periodo (Review Focus 1).
  - `DR-06` phasing, ptc e planning con una chiave/`month` fuori periodo → `DATE_RULE`; con una chiave dentro → 200; rimandando una chiave già salvata → 200 (Review Focus 4: si salva prima una chiave dentro il periodo, poi la si rimanda insieme a una nuova).
  - `DR-07` progetto senza periodo: phasing, ptc con `month: ''` e planning accettati (Review Focus 3); `PATCH` planning su un id inesistente → 404.
  - `DR-08` proposta con un progetto collegato **solo per nome** (`POST …/linked-projects` con `taskNames`, senza `taskIds`): la structure `PUT` senza quel task → `400` con `code: 'STRUCTURE_RULE'`; con lo stesso id rinominato → 200 (Review Focus 5).
  - Nota nel commento: il caso "task già salvato fuori periodo o invalido" non è raggiungibile dall'API (ogni route lo rifiuta), quindi è provato dai test di `taskDatesError` del task 1.
- [ ] **Step 2: Esegui una volta.** Run: `scripts/run-tests.sh` — Expected: i controlli `DR-01..DR-08` passano e nessun controllo esistente cambia esito (`TD-01..TD-06`, `PS-*`, `DT-*` inclusi).
- [ ] **Step 3: Commit** — `test(api): date-rule checks for the shared period rule`.

### Task 6: Libreria di date del client

**Files:**
- Modify: `js/lib/dates.js` (`taskDateBounds` ~119, `outOfPeriodTasks` ~143, `parseDayText` ~173, bridge `window.*` in fondo)
- Test: `js/lib/dates.test.js`

**Interfaces:**
- Produces: `outOfPeriodMessage({ list, start, end, noun }) -> string` (`noun` = `'proposal'` | `'project'`; `''` se `list` è vuota; l'errore del primo elemento se il periodo è invalido o invertito; altrimenti `N task(s) is/are outside the <noun> period (<Mon YYYY> – <Mon YYYY>). Tasks and the period are not saved until the tasks are moved inside it or the period is widened; other changes are saved.` — il testo di oggi); `taskDateBounds(periodStart, periodEnd, twin, side)` ora converte `twin` con `toIso` da sé (accetta `YYYYMMDD` o `YYYY-MM-DD`); `outOfPeriodTasks(tasks, start, end, parent)` accetta task `{ name, start, end, ref? }` e restituisce `{ name, error, ref }`.
- Tutte e tre sono esportate come le altre e collegate a `window.*`.

- [ ] **Step 1: Test (falliscono)** in `dates.test.js`: `outOfPeriodMessage` (lista vuota → `''`; periodo invertito → l'errore del primo elemento; singolare/plurale; `noun` nel testo; mese leggibile `Apr 2026`); `taskDateBounds` con `twin: '20260415'` dà gli stessi limiti di `'2026-04-15'`; `outOfPeriodTasks` riporta `ref`; `parseDayText` accetta `Dec 1,2025`, `Sept 30, 2025`, `Dec 1st, 2025`, `1 Dec, 2025`, `Dec 01, 2025` e rifiuta `2025-00`, `Dec 32, 2025`, `Sept 31, 2025`.
- [ ] **Step 2:** Run `npx vitest run js/lib/dates.test.js` — Expected: FAIL.
- [ ] **Step 3: Implementa.** `parseDayText`: estendi i due `match` esistenti — virgola e spazi opzionali, suffisso ordinale `st|nd|rd|th` opzionale, virgola opzionale dopo il mese nella forma `D Mon, YYYY`; `monthNumber` accetta anche `Sept`; precalcola i nomi minuscoli dei mesi una volta (`MONTHS_LOWER`) invece che a ogni chiamata.
- [ ] **Step 4:** stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(dates): shared out-of-period banner, raw-twin picker bounds, wider day parsing (B-154, B-156, B-140)`. I `?v=N` di `js/lib/dates.js` si aggiornano nel task 8, con le pagine.

### Task 7: Testi di periodo in `js/costgrid.js`

**Files:**
- Modify: `js/costgrid.js` (`cgFmtMonth` ~52, `cgOutOfPeriodNotice` ~81)
- Test: `js/lib/costgrid-period-text.test.js` (nuovo, carica le due funzioni come `js/lib/costgrid-generate-preflight.test.js`)

**Interfaces:**
- Produces: `cgFmtMonth(isoDate) -> string` — per una data non reale restituisce il valore originale (trim) invece di `''`; `cgOutOfPeriodNotice(tasks, periodStart, periodEnd) -> string` — se il periodo è invalido o invertito restituisce `The project period (<range>) is not valid: fix it before adding tasks.` (stessa forma del messaggio di `taskPeriodError`), altrimenti il testo di oggi.

- [ ] **Step 1: Test (falliscono):** `cgFmtMonth('2026-02-30')` non è `''`; `cgFmtMonth('')` resta `''`; `cgOutOfPeriodNotice` con `periodStart '202612'`, `periodEnd '202601'` dice che il periodo non è valido e non contiene `Move them inside it`; con un periodo valido e un task fuori il testo è quello attuale.
- [ ] **Step 2:** Run `npx vitest run js/lib/costgrid-period-text.test.js js/lib/costgrid-generate-preflight.test.js js/lib/costgrid-copy-period.test.js` — Expected: i nuovi falliscono, gli altri passano.
- [ ] **Step 3: Implementa** le due funzioni come sopra.
- [ ] **Step 4:** stesso comando — Expected: tutti PASS.
- [ ] **Step 5: Commit** — `fix(costgrid): period texts tolerate invalid dates and an inverted period (B-141, B-160)`.

### Task 8: Pagine, guardie e riferimenti `?v=N`

**Files:**
- Modify: `costgrid.html` (`outOfPeriod` ~1055, `outOfPeriodMessage` ~1063, `periodTaskDates`/bounds ~1076-1080, `taskDateBounds` ~1853, `isTaskOutOfPeriod` ~1857), `project-config.html` (`outOfPeriod` ~652, `outOfPeriodMessage` ~661, `periodTaskDates`/bounds ~673-677, `taskDateBounds` ~1278, `isTaskOutOfPeriod` ~1282), tutti gli `.html` che citano `js/lib/dates.js?v=` e `js/costgrid.js?v=`
- Test: `js/lib/dates-guard.test.js`

**Interfaces:**
- Consumes: `window.outOfPeriodMessage`, `window.taskDateBounds` (twin grezzo), `window.outOfPeriodTasks` con `ref` (task 6).

- [ ] **Step 1: Test (falliscono)** in `dates-guard.test.js`, due blocchi: (a) `no page redefines the shared out-of-period functions` — nelle pagine radice nessun `outOfPeriodMessage()` come metodo/computed e nessun `window.toIso(twin)`; (b) B-147: `pages` non è vuota (`expect(pages.length).toBeGreaterThan(0)`) e `project-config.html` contiene direttamente `js/cg-controls.js` e `css/controls.css`.
- [ ] **Step 2:** Run `npx vitest run js/lib/dates-guard.test.js` — Expected: FAIL sul blocco (a).
- [ ] **Step 3: Pagine.** In entrambe: `outOfPeriod` mappa i task con `ref: t` e passa a `window.outOfPeriodTasks`; `outOfPeriodMessage` diventa `window.outOfPeriodMessage({ list: this.outOfPeriod, start, end, noun })`; `isTaskOutOfPeriod(task)` legge un computed `outOfPeriodRefs` (`new Set(this.outOfPeriod.map(o => o.ref))`) invece di richiamare `taskPeriodError`; `taskDateBounds(task, side)` passa il twin grezzo a `window.taskDateBounds`. `periodTaskDates` e `periodStartBounds`/`periodEndBounds` restano nelle pagine perché leggono strutture diverse.
- [ ] **Step 4: Versioni.** Per ogni file toccato (`js/lib/dates.js`, `js/costgrid.js`) esegui `grep -rn "<path>?v=" --include=*.html --include=*.js .` e porta **tutti** i riferimenti allo stesso nuovo `N`; aggiorna anche le stringhe pinnate in `js/lib/dates-guard.test.js` (`js/lib/dates.js?v=4`, riga ~151).
- [ ] **Step 5: Verifica.** Run: `npx vitest run js/lib/dates-guard.test.js js/lib/dates.test.js js/lib/costgrid-period-text.test.js js/lib/costgrid-task-period-guard.test.js js/lib/project-config-task-period-guard.test.js js/lib/foundations-guard.test.js` — Expected: PASS; `grep -rn "window.toIso(twin)" *.html` → nessun risultato.
- [ ] **Step 6: Commit** — `refactor(pages): costgrid and project-config use the shared period functions (B-154, B-155, B-156, B-147)`.

## Decisioni aperte

1. **Le decisioni 1-8 della Spec valgono come scritte.** Alternativa scartata: ridiscuterle nel Piano. Perché: sono già nel ledger della Spec e questo Piano le attua.
2. **Il task "invariato" si riconosce per nome normalizzato, `toYmd` di inizio e fine, con consumo a multiinsieme.** Alternativa scartata: confronto per sola posizione nella lista. Perché: un riordino dei task non deve trasformare task invariati in modificati.
3. **`periodShrinkError` viene rimosso e non lasciato come alias.** Alternativa scartata: mantenerlo come wrapper di `taskDatesError`. Perché: un solo nome per la regola, come chiede il Brief.
4. **La `PATCH` di progetto usa una lettura non bloccata iniziale e una rilettura bloccata nella transazione.** Alternativa scartata: aprire sempre la transazione. Perché: le `PATCH` che non toccano periodo né link (nome, stato, pipeline) restano senza lock e senza transazione.
5. **`monthKeysError` riceve etichette dal chiamante e le chiavi già salvate.** Alternativa scartata: leggere i dati salvati dentro l'helper. Perché: l'helper resta puro e testabile senza DB.
6. **Il caso "task già salvato fuori periodo o invalido" è provato solo dai test unitari.** Alternativa scartata: seminare il dato con SQL in `test-api.js`. Perché: `test-api.js` non ha accesso al DB e ogni route lo rifiuta, quindi non c'è modo di crearlo dall'API.
7. **`outOfPeriodTasks` porta un `ref` opaco e le pagine confrontano per identità.** Alternativa scartata: confronto per nome. Perché: due task con lo stesso nome non devono segnalarsi a vicenda.
8. **Le funzioni `periodTaskDates`/`periodStartBounds`/`periodEndBounds` restano nelle due pagine.** Alternativa scartata: spostarle in `dates.js`. Perché: leggono strutture dati diverse (`draft.phases` contro `project.tasks`); la parte condivisa, `periodBounds`, è già in libreria.
9. **B-224 si chiude a metà: etichetta e `currency` una volta sola, ma le due passate sui task della structure `PUT` restano.** Alternativa scartata: fondere il ciclo delle ore vendute con quello degli importi dentro la transazione. Perché: il primo non richiede il DB e il suo 400 arriva prima dei rate di ruolo; fonderli cambierebbe quale errore vede chi ne ha più d'uno. La Spec diceva "un solo passaggio sui task": questa è una deviazione dichiarata, e la riga di B-224 in `docs/BACKLOG.md` si chiude con questa motivazione.
