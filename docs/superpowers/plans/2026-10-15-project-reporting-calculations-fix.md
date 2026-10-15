# Project reporting — correzione dei calcoli (B-071…B-077) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere i calcoli del reporting di progetto e del Program Dashboard: Today, tile Budget, Total della Breakdown, tooltip, export XLS, token CSS e clipping della pillola.

**Architecture:** Prima si pinna il comportamento attuale con characterization test, estraendo senza modifiche in `js/lib/project-report-calc.js` la logica By role/By area che oggi vive nei computed di `portfolio.html`. Poi si cambiano i moduli puri (`portfolio-calc.js`, `project-report-calc.js`, `program-calc.js`, `chart-today.js`) con TDD. Infine si collegano le due pagine e si fanno i bump di `?v=` in un solo task.

**Tech Stack:** Vue 3 da CDN senza build, Chart.js 4.4.0, SheetJS 0.18.5 (`XLSX`), vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-15-project-reporting-calculations-fix-design.md`
**Branch:** `project-reporting-calc-fix`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/lib/portfolio-calc.js`, `js/lib/program-calc.js`, `js/lib/chart-today.js`, `css/portfolio.css` su `portfolio.html` e `program.html`) e numeri monetari visibili all'utente.

**Indipendenza dei task:** i task **non** sono indipendenti. I Task 2-5 consumano le estrazioni del Task 1; i Task 6-7 consumano i Task 2-5 e modificano lo stesso `portfolio.html`; il Task 8 tocca le stesse righe `<script>`.

## Global Constraints

- Nessun endpoint, nessun SQL, nessuna migrazione, nessun file sotto `api/`.
- Senza il parametro `today`, l'output di `computeBurndownPoints()` resta identico a oggi, salvo l'assenza di `planningData` e la presenza di `todayIndex`/`todayValue` a `null`.
- `computeKpis()`: si aggiunge solo `feesLeft`; `budgetTotal`/`budgetLeft` restano invariati.
- I `?v=` cambiano **solo nel Task 8**, tutti insieme: `portfolio-calc.js` 6→7 (entrambe le pagine e i due import ES), `program-calc.js` 2→3 (entrambe le pagine), `project-report-calc.js` 1→2 (`portfolio.html`), `chart-today.js` 1→2 (entrambe le pagine), `portfolio.css` 3→4 (entrambe le pagine).
- Copy in inglese, esattamente: `+ <amount> PTC`, `Planned`, `Planned hours (resource plan)`, `Ungrouped`, `Some roles belong to more than one area: their hours count in each area and once in the Total.`
- Solo `var(--token)`, nessun hex; importi con `formatMoney(amount, dashCurrency, currencies)`, ore con `fmtH`.
- Editare l'HTML solo con Edit/Write, mai con `Get-Content`/`Set-Content` (BOM).
- Durante i task si lanciano solo i file di test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- PRD e `docs/pages/*.md`/`docs/js/lib.md` li aggiorna `/sync-docs` al Gate 5, non questo Piano.

## Review Focus

1. **Oggi dopo la fine dell'asse** (progetto chiuso): nessun taglio, nessun marcatore, `todayValue` = residuo finale, nessuna eccezione. → test nel Task 2.
2. **Progetto non ancora iniziato** (oggi prima dell'asse): sulla pagina progetto la linea actual è vuota senza errori; sul Program Dashboard il progetto contribuisce l'intero residuo nel mese di oggi. → test nei Task 2 e 4.
3. **Ruolo configurato con `soldHours: 0` e ore consumate**: resta "Over sold" (Review Focus 1 del ciclo 7.4). Solo `soldHours: null` (coppia non configurata) dà "—". → test nel Task 3.
4. **Nessuna sovrapposizione e nessuna ora fuori dai gruppi**: niente riga "Ungrouped" e niente nota. → test nel Task 3.
5. **Progetto con sole PTC e zero fee**: tile Budget "No budget" con la nota `+ X PTC` visibile. → asserzione guard nel Task 6.

---

### Task 1: Characterization test ed estrazione di By role / By area

**Files:**
- Modify: `js/lib/project-report-calc.js`, `portfolio.html` (computed `summaryByRole`, `summaryByGroup`)
- Test: `js/lib/project-report-calc.test.js`, `js/lib/portfolio-calc.test.js`, `js/lib/program-calc.test.js`

**Interfaces:**
- Produces: `roleColumns(data, cfg, filterRange, deps)` → `[{ label, role, task, soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur }]`; `areaColumns(data, cfg, filterRange, deps)` → `[{ label, soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur }]`; `deps = { billableData, billableTasks, findRate }`. Entrambe in `js/lib/project-report-calc.js`, con bridge `window.roleColumns`/`window.areaColumns`.

- [ ] **Step 1: Characterization di `computeBurndownPoints`** — in `portfolio-calc.test.js`, `describe('computeBurndownPoints — characterization (pre-fix)')`. Fixture: progetto `202601`–`202604`, un task fatturabile `Dev` (Developer, 100h, 50/h), phasing `{202601: 1000, 202602: 2000}`, planning `{202601: 20}`, righe il 15/01 (10h) e il 15/03 (5h). Asserisci gli array completi di `burnValues`, `idealValues`, `tooltipBudgetConsumed`, `tooltipPhasingEur` e `hasPhasingEur` per gli intervalli `monthly` e `quarterly`, con i valori prodotti dal codice attuale (eseguilo e copiali).
- [ ] **Step 2: Characterization di `programBurndown`** — in `program-calc.test.js`: con `deps.today` nel mese 2 di un range di 3 mesi, `todayRemaining === actual[todayIndex]` e `actual[2] === actual[1]` quando non ci sono righe dopo il mese 2 (la linea piatta di oggi).
- [ ] **Step 3: Test di `roleColumns`/`areaColumns`** — in `project-report-calc.test.js`, sulla fixture **F** (riusata nei Task 3-4, da definire una volta in testa al file):
  - task `Dev` (Developer 100h a 50/h, Tester 20h a 40/h) e `QA` (Tester 30h a 40/h), tutti fatturabili;
  - gruppi `Build` (`{role: 'Developer', task: ''}`, `{role: 'Tester', task: 'Dev'}`) e `Quality` (`{role: 'Tester', task: ''}`);
  - righe: Developer/Dev 10h, Tester/Dev 4h, Tester/QA 6h, **Designer/Dev 3h** (coppia non configurata).
  
  Asserisci il comportamento di oggi: `roleColumns` ha 3 colonne e non contiene Designer; `areaColumns` dà a `Build` 14h e a `Quality` 10h, con Tester/Dev contato in entrambi.
- [ ] **Step 4: Run, verifica che fallisca** — `npx vitest run js/lib/project-report-calc.test.js`. Expected: FAIL (`roleColumns is not a function`).
- [ ] **Step 5: Estrai** il corpo dei computed `summaryByRole` e `summaryByGroup` di `portfolio.html` nelle due funzioni, **senza cambiare la logica**. `roleColumns` importa `buildSummaryCols` da `./portfolio-calc.js?v=6`. I computed diventano `return cfg ? roleColumns(this.dashboardData, cfg, this.filterRange, { billableData, billableTasks, findRate }) : null` e l'analogo `areaColumns` (con il guard esistente `!cfg.groups?.length → null`). I commenti esplicativi dei computed (caso Bayer) migrano sulle funzioni.
- [ ] **Step 6: Run, verifica che passi** — `npx vitest run js/lib/project-report-calc.test.js js/lib/portfolio-calc.test.js js/lib/program-calc.test.js js/lib/portfolio-guard.test.js`. Expected: PASS.
- [ ] **Step 7: Commit** — `test: characterization of burndown, program burndown and breakdown columns; extract roleColumns/areaColumns`.

### Task 2: `portfolio-calc.js` — Today, `remainingAsOf`, `feesLeft`, niente `planningData`

**Files:**
- Modify: `js/lib/portfolio-calc.js`, `js/lib/project-report-calc.js` (re-export)
- Test: `js/lib/portfolio-calc.test.js`, `js/lib/project-report-calc.test.js`

**Interfaces:**
- Consumes: fixture del Task 1, Step 1.
- Produces:
  - `todayIndex(points, today, bounds)`, spostata qui senza modifiche; `project-report-calc.js` fa `export { todayIndex } from './portfolio-calc.js?v=6'` e mantiene `window.todayIndex`.
  - `remainingAsOf(data, cfg, taskFilter, date, billableData, billableTasks)` → `number`: stesso filtro e stesso budget di `computeBurndownPoints`. Con budget: `max(0, budget − Σhours delle righe con date ≤ date)`; senza: `Σhours`.
  - `computeBurndownPoints(..., findRate, today = null)` → in più `todayIndex: number|null` e `todayValue: number|null`; senza `planningData`.
  - `computeKpis()` → in più `feesLeft = feesOnly − consumedEur` (`null` senza cfg).

- [ ] **Step 1: Test che falliscono** (`portfolio-calc.test.js`, fixture del Task 1):
  - `today = 2026-02-20`, monthly: `todayIndex === 1`, `todayValue === 90`, `burnValues` = `[100, 90, null, null]`, `tooltipBudgetConsumed[1] === 500`, `[2]`/`[3]` `null`.
  - `today = 2026-06-10` (dopo l'asse): `burnValues` uguale alla characterization, `todayIndex === null`, `todayValue === 85` (Review Focus 1).
  - `today = 2025-12-01` (prima dell'asse): tutti `null`, `todayIndex === null`, `todayValue === 100` (Review Focus 2).
  - Progetto senza date con `today`: output identico a quello senza `today`, `todayIndex`/`todayValue` `null`.
  - `taskFilter: 'QA'` su un progetto senza righe QA: `todayValue` = budget del task.
  - `'planningData' in result === false`.
  - `computeKpis` sul fixture esistente con PTC: `feesLeft === 800`.
  - `remainingAsOf`: senza cfg restituisce le ore cumulate.
  
  Aggiorna lo Step 1 del Task 1 togliendo l'asserzione su `planningData`, se c'era. Sposta i test di `todayIndex` da `project-report-calc.test.js` a `portfolio-calc.test.js` e lascia in `project-report-calc.test.js` un solo test che verifica il re-export.
- [ ] **Step 2: Run, verifica che fallisca** — `npx vitest run js/lib/portfolio-calc.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementa.** Il taglio si applica solo con `today` **e** `cfg?.startDate && cfg?.endDate`: `idx = todayIndex(points, today, { start: axisStart, end: axisEnd })`. Con `idx !== null`, `burnValues[idx] = todayValue` e `tooltipBudgetConsumed[idx]` = consumato € delle righe filtrate con `date ≤ today`, mentre gli indici successivi diventano `null`. Con `today < axisStart`, tutti `null`. `todayValue = remainingAsOf(...)` per un progetto con date e `today`, altrimenti `null`. Rimuovi il blocco `planningData`. Aggiorna il commento di testa del modulo, se cita `planningData`.
- [ ] **Step 4: Verifica che `planningData` non abbia altri consumatori** — `grep -rn planningData --include=*.js --include=*.html . | grep -v node_modules`. Expected: solo `portfolio.html` (lo sistema il Task 6).
- [ ] **Step 5: Run, verifica che passi** — `npx vitest run js/lib/portfolio-calc.test.js js/lib/project-report-calc.test.js js/lib/program-calc.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** — `fix: burndown values as of today, remainingAsOf, feesLeft (B-071, B-072, B-074)`.

### Task 3: Breakdown — righe non configurate, Ungrouped, Total unico

**Files:**
- Modify: `js/lib/project-report-calc.js`
- Test: `js/lib/project-report-calc.test.js`

**Interfaces:**
- Consumes: fixture **F** del Task 1; `buildSummaryCols` da `portfolio-calc.js`.
- Produces:
  - `toRow`/`breakdownRows`: con `soldHours === null` la riga ha `soldKnown: false`, `overSold: false`, `pct: null`, `barState: 'none'`, `remainingHours: null`, `remainingAmount: null`.
  - `breakdownRows(cols, hasFilter, totalCol = null)`: con `totalCol` il Total è calcolato da quella colonna, non dalla somma.
  - `roleColumns`: aggiunge le colonne non configurate, con `soldHours: null`, `soldEur: null`.
  - `areaColumns`: aggiunge `{ label: 'Ungrouped', ungrouped: true, … }` solo se non vuota.
  - `areaTotalColumn(data, cfg, filterRange, deps)` → una colonna su tutti i dati e le risorse fatturabili.
  - `areaOverlap(data, cfg, deps)` → `boolean`, vero se una risorsa fatturabile o una riga fatturabile è reclamata da ≥ 2 gruppi.

- [ ] **Step 1: Test che falliscono:**
  - **Fixture F:** `roleColumns` ha 4 colonne, l'ultima Designer/Dev con 3h, `soldHours === null` e `totalConsumedEur === 150` (prezzo `findRate`: primo ruolo del task, 50/h). La riga `breakdownRows` corrispondente ha `soldKnown false`, `overSold false`, `pct null`.
  - **Ordine:** con una coppia non configurata su `QA` e una su `Dev`, quella su `Dev` viene prima (ordine di `billableTasks`); due ruoli sullo stesso task sono in ordine alfabetico case-insensitive.
  - **Ungrouped:** `areaColumns(F)` ha `Ungrouped` con Designer/Dev 3h. Sold di Ungrouped = 0 in F, perché ogni risorsa configurata è in un gruppo: verificalo e asseriscilo.
  - **Overlap:** `areaOverlap(F) === true`; su una variante senza `Quality` → `false`.
  - **Review Focus 4:** una variante in cui ogni risorsa e riga è in esattamente un gruppo non ha `Ungrouped` e dà `areaOverlap === false`.
  - **Review Focus 3:** una colonna configurata con `soldHours: 0` e 2h consumate dà `overSold: true` e `barState: 'danger'`.
  - **Accettazione, tre Total uguali senza filtro:** By task (`buildSummaryCols` su `billableTasks`, come `summaryByTask`), By role e By area (`breakdownRows(areaColumns, false, areaTotalColumn)`). Il Total ha gli stessi `soldHours`, `soldAmount`, `spentHours`, `spentAmount`, `remainingHours` e `remainingAmount` nelle tre viste: 23h spese e 150h vendute.
  - **Accettazione con filtro:** `filterRange` che include solo la riga Tester/QA. I tre `total.spentHours` valgono 6.
- [ ] **Step 2: Run, verifica che fallisca** — `npx vitest run js/lib/project-report-calc.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementa** le firme sopra.
- [ ] **Step 4: Run, verifica che passi** — stesso comando. Expected: PASS.
- [ ] **Step 5: Commit** — `fix: breakdown totals agree across task, role and area views (B-073)`.

### Task 4: `programBurndown` tagliato a oggi

**Files:**
- Modify: `js/lib/program-calc.js`
- Test: `js/lib/program-calc.test.js`

**Interfaces:**
- Consumes: `remainingAsOf` (Task 2), importato da `./portfolio-calc.js?v=6`.
- Produces: `programBurndown(range, projects, deps)` con la stessa forma di ritorno. Indice `i` del mese di oggi:
  - `actual[i] = Σ remainingAsOf(rows, cfg, '', deps.today, …)` sui progetti aggregati;
  - `actual[j > i] = null`;
  - `todayRemaining = actual[i]`;
  - oggi prima del range: tutto `null`; oggi dopo il range: `actual` invariato.

- [ ] **Step 1: Test che falliscono:**
  - Riscrivi la characterization del Task 1, Step 2: il mese di oggi vale ora `Σ remainingAsOf` e i mesi successivi `null`.
  - Due progetti, uno con 30h in una data del mese di `deps.today` anteriore a `deps.today`: `todayRemaining` vale le ore vendute totali − 30 (prima valeva l'intero budget).
  - Un progetto che inizia dopo oggi contribuisce l'intero budget al mese di oggi (Review Focus 2).
  - Range interamente passato: `actual` identico a prima, `todayIndex === null`.
  - I test esistenti "holds a project…" devono restare verdi. Se un test usa un `deps.today` che ora taglia i mesi testati, spostalo dopo il range invece di cambiare l'asserzione.
- [ ] **Step 2: Run, verifica che fallisca** — `npx vitest run js/lib/program-calc.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementa.** Conserva `cfg`/`rows` in ogni elemento di `perProject`. Il calcolo per mese resta quello di oggi; il taglio si applica dopo.
- [ ] **Step 4: Run, verifica che passi** — stesso comando. Expected: PASS.
- [ ] **Step 5: Commit** — `fix: program burndown stops at today with today's remaining (B-071)`.

### Task 5: Pillola Today dentro il canvas

**Files:**
- Modify: `js/lib/chart-today.js`
- Test: `js/lib/chart-today.test.js`

**Interfaces:**
- Produces: `todayLabelPlugin({ id, index, text, bg, fg })` con la stessa firma. Il riquadro va sopra il punto (`top = point.y − 12 − 20`) se `top ≥ 0`, altrimenti sotto (`top = point.y + 12`). La sua x sinistra è clampata in `[0, chart.width − boxW]`.

- [ ] **Step 1: Test che falliscono** (stesso contesto finto del file, con `chart.width`):
  - punto con `y = 10` → il `rect`/`roundRect` parte a `y = 22`;
  - punto con `y = 100` → parte a `68` (invariato);
  - punto con `x = 5`, `width = 400` → `x` sinistra `0`;
  - punto con `x = 398` → `x` sinistra `400 − boxW`.
- [ ] **Step 2: Run, verifica che fallisca** — `npx vitest run js/lib/chart-today.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementa.** Il testo resta centrato nel riquadro.
- [ ] **Step 4: Run, verifica che passi** — stesso comando. Expected: PASS.
- [ ] **Step 5: Commit** — `fix: Today pill stays inside the chart canvas (B-077)`.

### Task 6: Pagine — tile Budget, burndown e tooltip

**Files:**
- Modify: `portfolio.html` (tile Budget ~395-403, `burndownSeries`, `burndownTodayIndex`, `renderBurndownChart`), `program.html` (`renderBurndownChart`)
- Test: `js/lib/portfolio-guard.test.js`, `js/lib/program-guard.test.js`

**Interfaces:**
- Consumes: `computeBurndownPoints(..., today)` → `todayIndex`/`todayValue` (Task 2); `kpis.feesOnly`/`kpis.feesLeft`/`kpis.totalPtc` (Task 2); `programBurndown` (Task 4).

- [ ] **Step 1: Asserzioni guard che falliscono:**
  - **`portfolio-guard`:**
    - il tile Budget usa `kpis.feesOnly` nel `v-if`, `of {{ formatMoney(kpis.feesOnly`, `kpis.feesLeft` e `spentPercent(this.kpis.consumedEur, this.kpis.feesOnly)`;
    - la nota `+ {{ formatMoney(kpis.totalPtc` sta **fuori** da `<template v-if="kpis.feesOnly">`, visibile anche nel ramo "No budget" (Review Focus 5);
    - nessun `incl. ` nella regione KPI;
    - nessun `planningData` in `portfolio.html`;
    - `computeBurndownPoints(` riceve `this.reportToday`;
    - il testo della pillola usa `todayValue`;
    - il tooltip contiene `Planned:` e non `Estimated:`.
    
    Sostituisci l'asserzione `todayIndex(s.points, this.reportToday, …)` con una su `s.todayIndex`, mantenendo il guard "no project dates → null".
  - **`program-guard`:** il filtro del tooltip seleziona il dataset 1 quando `actual[item.dataIndex] == null`, e c'è la stringa `Planned:`.
- [ ] **Step 2: Run, verifica che fallisca** — `npx vitest run js/lib/portfolio-guard.test.js js/lib/program-guard.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementa `portfolio.html`:**
  - **Tile Budget:** `v-if="kpis.feesOnly"`; valore `consumedEur` "of `feesOnly`"; `kpiBudgetPct = spentPercent(consumedEur, feesOnly)`; "left" con `kpiLeftColor(kpis.feesLeft, kpis.feesOnly)`. La nota `pr-kpi-note` con `+ <totalPtc> PTC` va dopo il `v-else`, quindi è visibile in entrambi i rami.
  - **Burndown:** `burndownSeries` passa `this.reportToday`; `burndownTodayIndex` restituisce `s.todayIndex` dietro il guard delle date; la pillola usa `series.todayValue`.
  - **Tooltip:**
    - `filter: item => item.datasetIndex === (burnValues[item.dataIndex] == null ? 1 : 0)`;
    - su un punto con `burnValues[i] == null`: solo `Planned: <idealValues[i]>`, più `── Budget ──` / `Planned: <tooltipPhasingEur[i]>` se `hasPhasingEur`;
    - altrimenti `Consumed`/`Remaining`, `Planned: idealValues[i]` se `idealValues`, e nel blocco Budget `Planned` al posto di `Estimated` solo se `hasPhasingEur`.
- [ ] **Step 4: Implementa `program.html`:** filtro del tooltip come sopra su `actual`; `label` = `${fmtH(context.raw)} left` per il dataset 0, `Planned: ${fmtH(context.raw)} left` per il dataset 1. Pillola e `afterLabel` leggono `todayRemaining` come oggi.
- [ ] **Step 5: Run, verifica che passi** — `npx vitest run js/lib/portfolio-guard.test.js js/lib/program-guard.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** — `fix: Budget tile on fees, burndown Today and tooltip aligned on both pages (B-071, B-072, B-074)`.

### Task 7: Pagine — Breakdown, Monthly summary, CSS

**Files:**
- Modify: `portfolio.html` (`breakdownBase`, markup sotto la tabella Breakdown, intestazione Monthly ~468, bottone Export ~444, `exportTableXls`), `css/portfolio.css` (righe 298 e 627, nuova `.pr-bd-note`)
- Test: `js/lib/portfolio-guard.test.js`

**Interfaces:**
- Consumes: `breakdownRows(cols, hasFilter, totalCol)`, `areaTotalColumn`, `areaOverlap` (Task 3).
- Produces: metodo `exportMonthlyXls()`; computed `breakdownAreaOverlap`.

- [ ] **Step 1: Asserzioni guard che falliscono:**
  - `breakdownBase` ramo `area` chiama `areaTotalColumn(`; la riga `Ungrouped` ha sottotitolo `Not in any functional area`;
  - la nota con il testo esatto dei Global Constraints è sotto `v-if="breakdownView === 'area' && breakdownAreaOverlap"`;
  - l'intestazione `Planned hours (resource plan)` porta un `title`; nessun `Est. hours`;
  - il bottone Export del Monthly chiama `exportMonthlyXls()`; nessun `table_to_book` in `portfolio.html`;
  - nessun `--weight-normal` in `css/portfolio.css`.
- [ ] **Step 2: Run, verifica che fallisca** — `npx vitest run js/lib/portfolio-guard.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementa:**
  - **`breakdownBase` area:** `breakdownRows(cols, hasFilter, areaTotalColumn(...))`; sottotitolo `groupSubtitle(cfg.groups[i], tasks)` per i gruppi, `Not in any functional area` per la colonna `ungrouped`; `key` `'g:ungrouped'` per quest'ultima.
  - **Breakdown by role:** nessun cambio di wiring; le colonne non configurate arrivano già da `roleColumns`, e il loro sottotitolo è `roleSubtitle(...)` come le altre.
  - **`breakdownAreaOverlap`:** `areaOverlap(this.dashboardData, cfg, deps)`.
  - **Nota:** paragrafo `.pr-bd-note` (`font-size: var(--text-xs)`, `color: var(--text-muted)`, padding come le righe).
  - **`exportMonthlyXls()`:** `aoa_to_sheet` sul modello di `exportBreakdownXls`, da `monthlySummary`:
    - intestazioni `Month`, `Planned hours (resource plan)`, `Consumed h`, `Hours variance`, `Est. budget (<code>)`, `Spent (<code>)`, `Budget variance (<code>)`, più `PTC (<code>)` se `hasPtc`;
    - ore arrotondate a 2 decimali, importi a `currencyInfo(dashCurrency, currencies).digits`;
    - celle `''` per Consumed, Variance, Spent e Variance dei mesi `future`;
    - riga `Total` in fondo; file `monthly_summary.xlsx`.
  - Rimuovi `exportTableXls` se non resta alcun chiamante (`grep -n exportTableXls portfolio.html`).
  - **CSS:** `--weight-normal` → `--weight-regular` sulle due righe.
- [ ] **Step 4: Run, verifica che passi** — `npx vitest run js/lib/portfolio-guard.test.js js/lib/money-guard.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** — `fix: area breakdown total once with Ungrouped row, monthly XLS from data, weight token (B-073, B-075, B-076)`.

### Task 8: Cache-busting

**Files:**
- Modify: `portfolio.html`, `program.html` (tag `<script>`/`<link>`), `js/lib/program-calc.js`, `js/lib/project-report-calc.js` (import), `js/lib/portfolio-guard.test.js` (asserzione `?v=3` → `?v=4`)

- [ ] **Step 1: Bump** secondo i Global Constraints, e aggiorna i commenti `?v=6 matches …` dei due moduli.
- [ ] **Step 2: Verifica che non resti un riferimento vecchio** — `grep -rn "portfolio-calc.js?v=6\|program-calc.js?v=2\|project-report-calc.js?v=1\|chart-today.js?v=1\|portfolio.css?v=3" --include=*.html --include=*.js . | grep -v node_modules`. Expected: nessun output.
- [ ] **Step 3: Run** — `npx vitest run js/lib/portfolio-guard.test.js js/lib/program-guard.test.js js/lib/foundations-guard.test.js`. Expected: PASS.
- [ ] **Step 4: Commit** — `chore: cache-bust reporting modules and portfolio.css`.

### Task 9: Verifica visiva

**Files:** nessuno in produzione; PNG in `shots/` (non committati).

- [ ] **Step 1:** dal worktree, `scripts/test-branch.sh status`. Se è `up` ma di un ciclo precedente, chiedi all'utente se ricostruirlo prima di `scripts/test-branch.sh up`. Poi applica a mano le migrazioni mancanti, se ce ne sono (nessuna attesa).
- [ ] **Step 2:** `node scripts/shoot.mjs --base http://localhost:8081` sulle viste seguenti, a 1440 e 1024 (`docs/scripts/shoot.md` per credenziali ed `--eval-file`):
  - `portfolio.html?projectId=<un progetto con date in corso, PTC e gruppi>`: tile Budget, burndown, Breakdown By role e By area;
  - lo stesso con un `--eval-file` che imposta `scales.y.max` del grafico al `todayValue` e chiama `chart.update()`, così il punto Today sta in cima all'asse (B-077);
  - `program.html?programId=<il suo programma>`: burndown con la pillola.
- [ ] **Step 3: Rileggi i PNG** e annota per ciascuno:
  - la pillola: dentro il canvas, sopra o sotto il punto, e se coincide con il "left" del tile Hours;
  - la linea che si ferma a oggi;
  - "+ X PTC";
  - la nota di sovrapposizione e la riga Ungrouped.
  
  Correggi un difetto piccolo nella sessione principale (PROCESS.md §6.3).

## Decisioni aperte

1. **Sottotitolo della riga Ungrouped: `Not in any functional area`.** Alternativa scartata: sottotitolo vuoto. Perché: le altre righe hanno tutte una seconda riga, e il nome da solo non dice da dove vengono quelle ore.
2. **`breakdownRows` con un terzo parametro `totalCol` opzionale.** Alternativa scartata: un `breakdownRowsArea` separato. Perché: la regola del Total resta in un solo posto, e By task/By role non cambiano chiamata.
3. **Il tooltip su un punto futuro sceglie il dataset 1 nel `filter`.** Alternativa scartata: dipendere dal fatto che Chart.js salti o meno i punti `null` in modalità `index`. Perché: il comportamento resta lo stesso in entrambi i casi.
4. **I bump di `?v=` tutti nel Task 8.** Alternativa scartata: bump nel task che modifica ciascun file. Perché: un import a `?v=7` con il tag ancora a `?v=6` caricherebbe il modulo due volte nei commit intermedi.
5. **Verifica visiva di B-077 forzando `scales.y.max` con `--eval-file`.** Alternativa scartata: cercare nei dati reali un progetto con il punto in cima all'asse. Perché: dipende dai dati del clone ed è non riproducibile.
