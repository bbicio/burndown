# Date C3 — i task dentro il periodo: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un task di proposta o di progetto non può essere salvato fuori dai mesi del suo genitore. Il server lo rifiuta, la UI non lo lascia scegliere, e ogni dato fuori periodo già esistente è visibile.

**Architecture:**
- La regola è una funzione nei due gemelli date (`taskPeriodError`). Il browser ha in più gli helper per i limiti dei picker e l'elenco dei task fuori periodo.
- Il server la applica nei due `PUT` dei task e nelle due `PATCH` del periodo, in quest'ultimo caso in forma monotona.
- costgrid e project-config la rispecchiano nei `:min`/`:max`, in un avviso per task e in un banner. Le distribuzioni dichiarano la parte fuori periodo.

**Tech Stack:** Express + PostgreSQL (`node:test`, `test-api.js`), Vue 3 da CDN, moduli `js/lib/`, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-26-dates-c3-task-period-design.md`
**Branch:** `dates-c3-task-period`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/lib/dates.js`, `js/api-sync.js`, `js/costgrid.js`) e regole server sulle scritture dei task.

**Esecuzione:**
- **Fondazione:** Task 1 (modulo date), per primo.
- **Task indipendenti:** i Task 2 (server), 3 (costgrid), 4 (copia nel progetto e notifica) e 5 (project-config) dipendono solo dalle interfacce del Task 1 e vanno in qualunque ordine, uno per volta. I Task 3 e 4 toccano entrambi `costgrid.html` e `pipeline.html`, ma solo su righe `?v=` diverse; ogni altro file appartiene a un solo task.
- **Chiusura:** Task 6 (`TEST_CASES.md`, verifica visiva) per ultimo.
- **Worktree:** `.claude/worktrees/dates-c3-task-period` per §6.1b, con `.env` copiato dal checkout principale e `npm ci`.

## Global Constraints

- Il testo visibile all'utente è in inglese.
- Storage e API invariati: periodo di versione e progetto `YYYYMM`; task di proposta ISO `YYYY-MM-DD` in memoria e `YYYYMMDD` nel DB; task di progetto `YYYYMMDD`.
- Codice di rifiuto: `400 { error, code: 'DATE_RULE' }`. Nessun codice nuovo.
- Limiti del periodo: `monthFirstDay(periodStart)` e `monthLastDay(periodEnd)`. Un lato vuoto non pone limiti; una data del task vuota non viene controllata.
- Testi esatti (Spec §2.5, §2.7):
  - avviso per task: `Outside the proposal period` (costgrid), `Outside the project period` (project-config);
  - banner: `N tasks are outside the proposal period (Apr 2026 – Dec 2026). Changes to this version are not saved until they are moved inside it or the period is widened.` Al singolare `1 task is`; i mesi con `formatMonthText`; in project-config `project period` e `Changes to this project …`;
  - notifica `DATE_RULE`: `Your changes to this version are not being saved until this is fixed.`;
  - phasing: `X h · €Y fall outside the proposal period and are not phased.` (ore con `phasingFmtHours`, importo con `phasingFmtAmount`).
- Ogni file versionato modificato ha i suoi riferimenti `?v=N` aggiornati in **tutto** il repo nello stesso task. Valori di arrivo: `js/lib/dates.js?v=4`, `js/costgrid.js?v=50`, `js/api-sync.js?v=27`, `js/lib/costgrid-calc.js?v=9`, `js/lib/config-form-calc.js?v=3`. Per ognuno, `grep -rln "<file>?v=" js/lib scripts` elenca i guard che lo pinnano: vanno aggiornati e lanciati nello stesso task.
- Modifiche agli HTML solo con l'Edit tool: mai `Get-Content`/`Set-Content`, che aggiungono un BOM.
- Nessun listener e nessun watcher in più per task (B-144): solo binding e computed.
- Durante i task si lanciano solo i test toccati (`npx vitest run <file>`; backend `node --test src/lib/dates.test.js` da `api/`). La suite completa e `scripts/run-tests.sh` girano in `/finish-cycle`.
- Un difetto nuovo trovato durante l'esecuzione non si corregge qui: va in `docs/BACKLOG.md`.

## Review Focus

1. **Autosave con dati esistenti fuori periodo.** Un salvataggio di struttura che contiene un task già fuori viene rifiutato, e l'utente vede banner e avviso, non "reload the page". Test: TP-01 nel Task 2, test della frase nel Task 4.
2. **Periodo invertito salvato** (`ce702b4c-…`). La `PATCH` di correzione deve passare anche se i task restano fuori, e i limiti dei picker del periodo devono spingere verso i task. Test: TP-06 nel Task 2, caso `periodBounds` invertito nel Task 1.
3. **Task con una sola data, o senza date.** Una sola data si controlla da sola; nessuna data, sempre ammesso. Test: casi `taskPeriodError` nel Task 1, TP-02 nel Task 2.
4. **Task che sta tutto dopo la fine del periodo** (start > ultimo giorno). È fuori anche se `end` è vuoto: `starts on …, after the …`. Test: caso nel Task 1.
5. **Generate da una versione senza periodo.** Il periodo del progetto viene dai task (`cgGeneratedPeriod`), quindi il controllo preventivo non deve rifiutare. Test nel Task 4.

---

### Task 1: regola e helper nel modulo date

**Files:**
- Modify: `js/lib/dates.js`, `api/src/lib/dates.js`
- Test: `js/lib/dates.test.js`, `js/lib/dates-guard.test.js` (`CASES`), `api/src/lib/dates.test.js`
- Modify: `costgrid.html`, `pipeline.html`, `project-config.html`, `portfolio.html` (`dates.js?v=3` → `?v=4`)

**Interfaces:**
- Produces, nei due gemelli, `taskPeriodError(start, end, periodStart, periodEnd, { label, parent }): string|null`.
  - `start`/`end`: `''`, `null`, `YYYYMMDD` o ISO. `periodStart`/`periodEnd`: `''`, `null` o `YYYYMM`, con gli spazi rimossi (CHAR(6)).
  - Una data del task non valida restituisce `null`: il formato lo controlla `periodError`.
  - Messaggi, con le date ISO e i mesi `YYYY-MM`, e il lato vuoto mostrato come `…`:
    - periodo con un lato non valido, oppure invertito, e almeno una data del task: `The ${parent} period (${ps} – ${pe}) is not valid: fix it before setting task dates.`
    - altrimenti il primo lato che esce, controllando nell'ordine start < primo giorno, start > ultimo giorno, end > ultimo giorno, end < primo giorno: `Task "${label}" ${starts|ends} on ${iso}, ${before|after} the ${parent} period (${ps} – ${pe}).`
- Produces, solo browser (`js/lib/dates.js`, con bridge `window.`; vanno aggiunti alla lista "browser-only" del test dei gemelli):
  - `taskDateBounds(periodStart, periodEnd, twin, side): { min: string, max: string }`, ISO o `''`.
    - Con `side === 'start'`: `min` = primo giorno del periodo, `max` = il minore tra `toIso(twin)` e l'ultimo giorno.
    - Con `side === 'end'`: `min` = il maggiore tra `toIso(twin)` e il primo giorno, `max` = ultimo giorno.
  - `periodBounds(taskDates, side, twin): { min: string, max: string }`, `YYYYMM` o `''`. `taskDates` è un array di giorni (start ed end di tutti i task, vuoti ignorati).
    - Con `side === 'start'`: `max` = il minore tra `twin` e il mese del giorno più piccolo, `min` = `''`.
    - Con `side === 'end'`: `min` = il maggiore tra `twin` e il mese del giorno più grande, `max` = `''`.
    - Un `twin` vuoto o non valido non conta.
  - `outOfPeriodTasks(tasks, periodStart, periodEnd, parent): Array<{ name, error }>`, con `tasks` = `[{ name, start, end }]`: i task per cui `taskPeriodError` non è `null`.

- [ ] **Step 1: test che falliscono.**
  - In `js/lib/dates.test.js`, `describe('taskPeriodError')`, periodo `'202604'`–`'202612'`, `{ label: 'T', parent: 'version' }`:
    - `('', '', …)` → `null`;
    - `('2026-04-01', '2026-12-31', …)` → `null`;
    - `('2026-03-31', '', …)` → `'Task "T" starts on 2026-03-31, before the version period (2026-04 – 2026-12).'`;
    - `('2027-01-05', '', …)` → `… starts on 2027-01-05, after …`;
    - `('', '20270101', …)` → `… ends on 2027-01-01, after …`;
    - `('2026-05-01', '2026-05-02', '', '202604', …)` → `null`;
    - periodo `'202609'`–`'202607'` con `('2026-08-01', '', …)` → `'The version period (2026-09 – 2026-07) is not valid: fix it before setting task dates.'`;
    - lo stesso periodo con task senza date → `null`.
  - `describe('taskDateBounds')`:
    - `('202604', '202612', '2026-06-10', 'start')` → `{ min: '2026-04-01', max: '2026-06-10' }`;
    - `('202604', '202612', '', 'end')` → `{ min: '2026-04-01', max: '2026-12-31' }`;
    - `('', '', '', 'start')` → `{ min: '', max: '' }`.
  - `describe('periodBounds')`:
    - `(['2026-03-03', '20260820'], 'start', '202612')` → `{ min: '', max: '202603' }`;
    - `(['2026-03-03', '20260820'], 'end', '202602')` → `{ min: '202608', max: '' }`;
    - invertito `(['2026-07-01', '2026-08-31'], 'start', '202607')` → `max: '202607'`;
    - `([], 'end', '202604')` → `{ min: '202604', max: '' }`.
  - `outOfPeriodTasks`: con due task, uno fuori, restituisce solo quello, con `name` e `error`.
  - In `dates-guard.test.js`, tra i `CASES`, cinque chiamate `taskPeriodError` (dentro, start prima, end dopo, periodo invertito, senza date), e `taskDateBounds`/`periodBounds`/`outOfPeriodTasks` aggiunti alla lista che il server non deve esportare.
  - In `api/src/lib/dates.test.js`, un caso dentro e uno fuori.
- [ ] **Step 2:** `npx vitest run js/lib/dates.test.js js/lib/dates-guard.test.js` → FAIL (`taskPeriodError is not a function`).
- [ ] **Step 3:** implementare le funzioni nei due file come da Interfaces, usando `monthFirstDay`/`monthLastDay`/`toIso`/`isMonth` già presenti. Aggiornare il commento di testa di `api/src/lib/dates.js` sul numero delle funzioni comuni, oppure toglierne il numero.
- [ ] **Step 4:** i due comandi dello step 2 e `node --test src/lib/dates.test.js` (da `api/`) → PASS.
- [ ] **Step 5:** `dates.js?v=3` → `?v=4` nelle quattro pagine; `grep -rn "dates.js?v=3" .` → nessun risultato; lanciare anche i guard elencati da `grep -rln "dates.js?v=" js/lib scripts`.
- [ ] **Step 6:** commit `feat(dates): taskPeriodError and picker bounds in the dates module`.

### Task 2: regola sul server

**Files:**
- Modify: `api/src/routes/cost-grids.js` (`PATCH /:id/versions/:vId`, `PUT …/structure`)
- Modify: `api/src/routes/projects.js` (`PATCH /:id`, `PUT /:id/tasks`)
- Modify: `api/src/lib/dates.js`, `api/src/lib/dates.test.js` (`periodShrinkError`)
- Test: `test-api.js` (nuova `testTaskPeriod()`, chiamata subito dopo `await testDateRule()`)

**Interfaces:**
- Consumes: `taskPeriodError` (Task 1).
- Produces, solo server, in `api/src/lib/dates.js`: `periodShrinkError(tasks, stored, next, { parent }): string|null`.
  - `tasks`: `[{ name, start, end }]`. `stored` e `next`: `{ start, end }` in `YYYYMM`.
  - Restituisce il messaggio di `taskPeriodError(…, next…)` del primo task che è dentro `stored` (cioè `taskPeriodError(…, stored…) === null`, con almeno una data) ma fuori da `next`. Altrimenti `null`.
  - Va aggiunto alla lista di export del server; non è un gemello e non va in `CASES`.

- [ ] **Step 1: test che falliscono.** In `testTaskPeriod()`, con lo stesso setup di `testDateRule` (anno `TEST_YEAR_C`, proposta, versione con periodo `202604`–`202612`, progetto generato con `cgVersionId` e periodo `202604`–`202612`, tutto registrato con `later`):
  - TP-01: structure con un task `2026-03-31` → `400 DATE_RULE`, struttura salvata invariata;
  - TP-02: structure con un task senza date e uno `2026-04-01`–`2026-12-31` → `200`;
  - TP-03: project tasks con `startDate: '20270105'` → `400 DATE_RULE`, task invariati; con `startDate: '20260410'` → `200`;
  - TP-04: version PATCH `{ startDate: '202605', endDate: '202612' }` con il task del TP-02 al `2026-04-01` → `400 DATE_RULE`, periodo invariato; `{ startDate: '202603', endDate: '202612' }` → `200`; lo stesso periodo rimandato → `200`;
  - TP-05: project PATCH `{ endDate: '202605' }` con il task al `20260410` e uno al `20260801` → `400 DATE_RULE`; `{ endDate: '202701' }` → `200`;
  - TP-06: un periodo invertito non si può creare via API (C1 lo rifiuta), quindi il caso è coperto in due pezzi:
    - in `test-api.js`, una versione senza periodo con un task al `2026-07-01` (un periodo vuoto non pone limiti, quindi il task è dentro): PATCH `{ startDate: '202608', endDate: '202612' }` → `400 DATE_RULE`; PATCH `{ startDate: '202607', endDate: '202612' }` → `200`;
    - in `api/src/lib/dates.test.js`, `periodShrinkError` con `stored` invertito `{ start: '202609', end: '202607' }` e un task al `2026-08-01` → `null`.
- [ ] **Step 2:** `node --test src/lib/dates.test.js` → FAIL. La parte `test-api.js` gira solo nello stack di test: `scripts/run-tests.sh` → FAIL su TP-01..TP-05.
- [ ] **Step 3: implementare.**
  - `PUT …/structure`: dentro la transazione, dopo `lockVersion`, leggere `start_date, end_date` della versione e controllare ogni task con `taskPeriodError` (`label` = titolo come per il controllo d'ordine, `parent: 'version'`). Al primo errore: `ROLLBACK` e `400 { error, code: DATE_RULE }`.
  - `PUT /api/projects/:id/tasks`: dopo il controllo d'ordine, leggere il periodo del progetto e controllare ogni task (`parent: 'project'`).
  - `PATCH` versione: quando il periodo cambia (stessa nozione di `periodChangeError`), lettura dei task (`SELECT t.title, t.start_date, t.end_date FROM tasks t JOIN phases p ON p.id = t.phase_id WHERE p.version_id = $1`), `periodShrinkError` e `UPDATE` vanno sotto un unico `withVersionLock`, lo stesso ramo che oggi serve alla valuta.
  - `PATCH` progetto: dopo il controllo di `periodChangeError`, `periodShrinkError` sui `project_tasks` salvati.
- [ ] **Step 4:** `node --test src/lib/dates.test.js` → PASS; `scripts/run-tests.sh` → TP-01..TP-06 verdi e DT-01..DT-17 ancora verdi.
- [ ] **Step 5:** commit `feat(api): refuse task dates outside the version/project period`.

### Task 3: costgrid — picker, avvisi, phasing

**Files:**
- Modify: `costgrid.html` (picker dei task, picker del periodo, banner, avviso per task, `phasingByMonth`, riga sotto la Monthly Phasing)
- Modify: `js/lib/costgrid-calc.js` (nuova `distributeTaskHours`), `costgrid.html` e `pipeline.html` (`costgrid-calc.js?v=8` → `?v=9`)
- Test: `js/lib/costgrid-calc.test.js`, nuovo `js/lib/costgrid-task-period-guard.test.js` (binding)

**Interfaces:**
- Consumes: `taskDateBounds`, `periodBounds`, `outOfPeriodTasks`, `formatMonthText` (Task 1, globali `window.`).
- Produces: `distributeTaskHours(hours, taskStart, taskEnd, months): { byMonth: Record<'YYYY-MM', number>, outside: number }`. `months` sono i mesi `YYYY-MM` del periodo, come `phasingMonths`. È la `distribute` di oggi, che in più somma in `outside` le ore dei mesi del task fuori da `months`. Un task senza date va su tutti i `months` con `outside = 0`.

- [ ] **Step 1: test che falliscono.**
  - `costgrid-calc.test.js`:
    - `distributeTaskHours(10, '2026-03-15', '2026-04-10', ['2026-04', '2026-05'])` → `{ byMonth: { '2026-04': 5 }, outside: 5 }`;
    - senza date, 10 ore su due mesi → `{ '2026-04': 5, '2026-05': 5 }`, `outside: 0`.
  - `costgrid-task-period-guard.test.js`, guard statico su `costgrid.html`:
    - i picker con `aria-label="Task start date"` e `"Task end date"` legano `:min`/`:max` a `taskDateBounds(`;
    - i picker `Start month`/`End month` a `periodBounds(`;
    - la pagina contiene `Outside the proposal period` e `fall outside the proposal period and are not phased`.
- [ ] **Step 2:** `npx vitest run js/lib/costgrid-calc.test.js js/lib/costgrid-task-period-guard.test.js` → FAIL.
- [ ] **Step 3: implementare.**
  - `phasingByMonth` usa `distributeTaskHours` e restituisce anche `outsideHours`/`outsideAmount`. Ore × `r.rate`, come oggi.
  - Picker dei task: `:min`/`:max` da `taskDateBounds(draft.startDate, draft.endDate, <data gemella>, side)`.
  - Picker del periodo: limiti combinati con l'ordine attuale.
    - Start: `:max` = il minore tra `draft.endDate` e `periodBounds(dates, 'start', draft.endDate).max`.
    - End: `:min` = il maggiore tra `draft.startDate` e `periodBounds(dates, 'end', draft.startDate).min`.
    - `dates` sono tutte le date dei task del draft.
  - Computed `outOfPeriod` = `outOfPeriodTasks(<task del draft mappati su { name, start, end }>, draft.startDate, draft.endDate, 'version')`.
  - Banner `cg-banner cg-banner--warning` sotto quello di lock, con `v-if="outOfPeriod.length && !isReadOnly"` e il testo dei Global Constraints. Con un periodo non valido mostra invece il messaggio di `taskPeriodError` del primo task.
  - Sotto le date di ogni task fuori periodo: `Outside the proposal period`, stile `text-danger` con `font-size: var(--text-xs)`.
  - Riga sotto la tabella della Monthly Phasing con `v-if="phasingByMonth.outsideHours > 0"`.
- [ ] **Step 4:** i test dello step 2 → PASS; aggiornare `?v=` di `costgrid-calc.js` e lanciare i guard di `grep -rln "costgrid-calc.js?v=" js/lib scripts`.
- [ ] **Step 5: controllo nel browser** (lezione 6 dell'handoff), con `scripts/test-branch.sh up` e una proposta di prova:
  - periodo `Apr 2026 – Dec 2026`: nel calendario di un task marzo è disabilitato, e digitare `Mar 3, 2026` mostra `Must be on or after Apr 1, 2026.`;
  - un task salvato fuori periodo fa comparire banner, avviso e riga del phasing.
- [ ] **Step 6:** commit `feat(costgrid): task pickers and phasing bounded by the proposal period`.

### Task 4: copia nel progetto e notifica `DATE_RULE`

**Files:**
- Modify: `js/costgrid.js` (`cgDoAddTasksToProject`, `cgDoGenerateProject`), `costgrid.html` e `pipeline.html` (`costgrid.js?v=49` → `?v=50`)
- Modify: `js/api-sync.js` (`notifyRefusal` in `_cgUpsertVersionToApi`), tutte le pagine con `api-sync.js?v=26` → `?v=27`
- Test: nuovo `js/lib/costgrid-copy-period.test.js` (stesso harness di `js/lib/costgrid-generate-period.test.js`); `js/lib/api-sync-upsert.test.js`

**Interfaces:**
- Consumes: `outOfPeriodTasks` (Task 1).

- [ ] **Step 1: test che falliscono.**
  - `cgDoAddTasksToProject` verso un progetto `202604`–`202612` con un task scelto al `2026-03-03`:
    - `showInfo` chiamata con un testo che contiene il nome del task e `Apr 2026 – Dec 2026`;
    - `config.projects` e `_cgDraft.linkedProjects` invariati, nessuna chiamata `Api.*`.
  - `cgDoGenerateProject` su una versione `202604`–`202612` con un task al `2026-03-03`: stesso esito, nessun progetto aggiunto.
  - `cgDoGenerateProject` su una versione **senza periodo** (Review Focus 5): nessun `showInfo` di rifiuto, il progetto viene creato.
  - `api-sync-upsert.test.js`: un rifiuto `DATE_RULE` della struttura mostra `Your changes to this version are not being saved until this is fixed.` e non `reload the page`; un rifiuto `STRUCTURE_RULE` mostra ancora `reload the page to see its current structure`.
- [ ] **Step 2:** `npx vitest run <i due file>` → FAIL.
- [ ] **Step 3: implementare.**
  - In tutte e due le funzioni, prima di qualsiasi modifica di `config.projects` o `linkedProjects`, chiamare `outOfPeriodTasks` sui task scelti, contro il periodo di destinazione: `proj.startDate`/`proj.endDate`, oppure `cgGeneratedPeriod(...)` per Generate.
  - Se l'elenco non è vuoto, chiamare `showInfo` con `These tasks are outside the project period (Apr 2026 – Dec 2026): "A", "B". Move them inside it first.` e `return`.
  - In `notifyRefusal`, scegliere la seconda frase in base a `e.data.code`.
- [ ] **Step 4:** test → PASS; aggiornare i `?v=` e lanciare i guard di `grep -rln "costgrid.js?v=\|api-sync.js?v=" js/lib scripts`, compreso `js/lib/proposal-modals-guard.test.js` (lezione 1 dell'handoff).
- [ ] **Step 5:** commit `feat(costgrid): refuse copying out-of-period tasks into a project; DATE_RULE notice`.

### Task 5: project-config — picker, avvisi, derivazione

**Files:**
- Modify: `project-config.html` (picker task e periodo, avviso per task, avviso vicino a Save, conferma di `derivePhasing`)
- Modify: `js/lib/config-form-calc.js` (`deriveDistribution`), `project-config.html` (`config-form-calc.js?v=2` → `?v=3`)
- Test: `js/lib/config-form-calc.test.js`, nuovo `js/lib/project-config-task-period-guard.test.js` (binding)

**Interfaces:**
- Consumes: `taskDateBounds`, `periodBounds`, `outOfPeriodTasks` (Task 1).
- Produces: `deriveDistribution(...)` restituisce in più `outsideBudget: number, outsideHours: number`: budget e ore del task moltiplicati per la frazione dei suoi giorni fuori dai `months`, solo per i task senza una `monthlyDistribution` valida.

- [ ] **Step 1: test che falliscono.**
  - `config-form-calc.test.js`: un task `20260315`–`20260414` (31 giorni), 31 ore a tariffa 100, `months = ['202604']`. Atteso: `totalBudget + outsideBudget` = 3100 (±0.01), `outsideHours` = 17.
  - `project-config-task-period-guard.test.js`, guard su `project-config.html`:
    - i picker dei task legano `:min`/`:max` a `taskDateBounds(`;
    - i picker `Start month`/`End month` a `periodBounds(`;
    - la pagina contiene `Outside the project period`.
- [ ] **Step 2:** `npx vitest run js/lib/config-form-calc.test.js js/lib/project-config-task-period-guard.test.js` → FAIL.
- [ ] **Step 3: implementare.**
  - Picker come nel Task 3, con `project.startDate`/`project.endDate`.
  - I valori dei task restano `toIso(x) || ''` in ingresso e `YYYYMMDD`, oppure `''`, in uscita.
  - Avviso per task `Outside the project period`.
  - Vicino al pulsante Save, `v-if="outOfPeriod.length && !isViewer"`, il testo del banner dei Global Constraints in forma progetto.
  - In `derivePhasing`, se `result.outsideBudget > 0`, il messaggio di conferma aggiunge `Outside the project period, not distributed: <formatMoney> · <ore> h`.
- [ ] **Step 4:** test → PASS; aggiornare `?v=` di `config-form-calc.js` e lanciare i guard di `grep -rln "config-form-calc.js?v=" js/lib scripts`.
- [ ] **Step 5: controllo nel browser** sul branch stack: con un progetto `Apr 2026 – Dec 2026`, il calendario di un task disabilita marzo, e un task salvato fuori periodo mostra i due avvisi.
- [ ] **Step 6:** commit `feat(project-config): task pickers bounded by the project period, outside budget declared`.

### Task 6: casi di test e verifica visiva

**Files:**
- Modify: `TEST_CASES.md` (casi manuali dei criteri 4-7 della Spec)
- Nessun file di produzione.

- [ ] **Step 1:** aggiungere a `TEST_CASES.md` i casi manuali dei criteri 4, 5, 6 e 7 della Spec, nel formato delle sezioni vicine.
- [ ] **Step 2:** `scripts/test-branch.sh up`, poi preparare una proposta e un progetto con un task fuori periodo. Lo stack clona i dati del main, quindi bastano anche i 12+9 task esistenti.
- [ ] **Step 3:** `node scripts/shoot.mjs --base http://localhost:8081 --settle 3000` su `costgrid.html` (banner, avviso sul task, riga della Monthly Phasing) e `project-config.html` (avviso sul task e vicino a Save), a 1440 e 390 px. Rileggere i PNG e presentare gli scostamenti uno per uno.
- [ ] **Step 4:** commit `docs(test-cases): dates C3 manual cases`.

## Decisioni aperte

1. **`periodShrinkError` solo nel server, non nei gemelli.** Alternativa scartata: metterlo in tutti e due i moduli. Perché: il browser previene il restringimento con `periodBounds`, quindi una copia browser non avrebbe chiamanti.
2. **Controllo della struttura dentro la transazione, dopo `lockVersion`.** Alternativa scartata: controllarla prima della transazione, come l'ordine di C1. Perché: così una `PATCH` del periodo concorrente non può interporsi; per `PUT /tasks` del progetto la corsa resta, perché il route non è transazionale (escluso dalla Spec).
3. **`periodBounds` usa tutte le date dei task, inizi e fini.** Alternativa scartata: solo gli inizi per lo Start e solo le fini per l'End, come dice alla lettera la Spec §2.4. Perché: un task con la sola data di fine resterebbe altrimenti senza limite; con start ≤ end per task, i due criteri coincidono negli altri casi.
4. **Esecuzione subagent-driven con implementatori Sonnet.** Alternativa scartata: nativa. Perché: §6.1, ciclo grande (circa 12 file di produzione, una nuova regola API) e Task 2-5 indipendenti dopo il Task 1.
