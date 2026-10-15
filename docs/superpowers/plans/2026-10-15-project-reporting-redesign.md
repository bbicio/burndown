# Project Reporting v2 (7.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridisegnare la vista `dashboard` di `portfolio.html` in tre blocchi KPI → Progress → Breakdown secondo le tavole 7.4, senza cambiare i calcoli.

**Architecture:** La logica nuova (giudizio di ritmo, righe di Breakdown, sottotitoli, entries per mese, indice Today) vive in un modulo puro `js/lib/project-report-calc.js` testato con vitest; il plugin Chart.js del marcatore Today passa da `program.html` a `js/lib/chart-today.js`, condiviso. `portfolio.html` riscrive il template della vista e aggiunge computed di sola presentazione; stili `.pr-*` in `css/portfolio.css`.

**Tech Stack:** Vue 3 da CDN senza build, Bootstrap 5, Chart.js, SheetJS (`XLSX`), vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-15-project-reporting-redesign-design.md`
**Branch:** `project-reporting-v2`
**Risk class:** high-risk — file condivisi caricati da più pagine (`css/portfolio.css` e il nuovo `js/lib/chart-today.js` su `portfolio.html` e `program.html`; `program.html` stessa modificata).

**Indipendenza dei task:** i task **non** sono indipendenti: i Task 3-6 modificano lo stesso blocco di `portfolio.html` in sequenza e consumano le funzioni dei Task 1-2.

## Global Constraints

- Nessun endpoint nuovo, nessun SQL, nessuna migrazione; `js/lib/portfolio-calc.js` e `js/lib/program-calc.js` non cambiano.
- Solo `var(--token)`: nessun hex nuovo (in `css/portfolio.css` e nel template), nessuna emoji nel template della vista `dashboard`.
- Importi solo con `formatMoney(amount, dashCurrency, currencies)`; ore con `fmtH`; nessun `Intl.NumberFormat` fuori da `money.js` (`money-guard`).
- `css/portfolio.css` passa a `?v=3` su **entrambe** `portfolio.html` e `program.html` (aggiornare l'asserzione `every portfolio.css reference is ?v=2` di `js/lib/portfolio-guard.test.js`).
- Nuovi script come `<script type="module" src="js/lib/<file>.js?v=1">`; `program-calc.js?v=1` aggiunto a `portfolio.html` dopo `portfolio-calc.js?v=5`.
- `#app-shell`/`#app-main` e `v-cloak` invariati; nessun `alert`/`confirm` nativo.
- Copy in inglese, esattamente quello del brief §12 (es. "Over sold", "Hours on track", "No actuals loaded yet.", "No entries in the selected period.", "No functional areas configured").
- Soglie barra: `spentBarState()` (navy < 85, ambra 85–100, rosso > 100). Giudizio di ritmo: ±10 punti di `vsTime`.
- Durante i task si lanciano solo i file di test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Editare l'HTML solo con Edit/Write, mai con `Get-Content`/`Set-Content` (BOM).

## Review Focus

1. **Riga con `soldHours = 0` e ore consumate** (ruolo o task non venduto ma registrato): ci si aspetta "Over sold", barra rossa, % "—", non una barra vuota senza segnale. → test in Task 1 (`breakdownRows`).
2. **Ruolo presente nelle registrazioni ma non configurato nel task**: l'importo della entry è "—" e il totale del mese somma solo gli importi noti, senza `NaN`. → test in Task 1 (`entriesByMonth`).
3. **Periodo senza registrazioni**: Spent 0 su ogni riga e sul Total, Remaining e % invariati. → test in Task 1 (`breakdownRows` con `hasFilter` e `inPeriod` 0).
4. **Progetto senza date o con oggi fuori dall'intervallo**: nessun marcatore Today, tile Time elapsed "—" senza giudizio, nessuna eccezione. → test in Task 1 (`todayIndex`, `paceJudgment(null)`) e controllo in Task 4.
5. **Progetto senza actuals**: la card Progress mostra "No actuals loaded yet." (e "Load Actuals" se permesso) invece di un canvas vuoto. → asserzione guard in Task 4, stato catturato in Task 7.

---

### Task 1: Characterization test e modulo `project-report-calc.js`

**Boards:** nessuna (logica pura).

**Files:**
- Modify: `js/lib/portfolio-calc.test.js` (describe `summaryTotals`)
- Create: `js/lib/project-report-calc.js`
- Create: `js/lib/project-report-calc.test.js`

**Interfaces:**
- Consumes: `spentPercent`, `spentBarState`, `normalizeGroupEntries`, `entryMatchesRow` da `./portfolio-calc.js?v=5` (import ES con lo stesso `?v=` del tag script).
- Produces (tutte esportate e con `window.<nome> = <nome>`):
  - `paceJudgment(vsTime: number|null, threshold = 10) → 'on-track'|'ahead'|'behind'|null`
  - `breakdownRows(cols, hasFilter) → { rows: Row[], total: Row }`, `Row = { label, soldHours, soldAmount, spentHours, spentAmount, remainingHours, remainingAmount, pct, barState, overSold }`; `cols` sono gli oggetti di `buildSummaryCols()`/`summaryByGroup` (`{ label, soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur }`).
  - `taskSubtitle(task, groups) → string`
  - `roleSubtitle(roleLower, taskLower, rows) → string` (`rows` = registrazioni del progetto)
  - `groupSubtitle(group, tasks) → string`
  - `entriesByMonth(rows, rateFor) → [{ ym: 'YYYY-MM', count, hours, amount, rows }]`
  - `hoursByMonth(rows) → { 'YYYY-MM': number }`
  - `monthState(ym: 'YYYYMM'|'YYYY-MM', today: Date) → 'past'|'current'|'future'`
  - `todayIndex(points: Date[], today: Date) → number|null`

- [ ] **Step 1: Characterization test.** In `portfolio-calc.test.js`, nel describe `summaryTotals`, aggiungere `it('totResidual does not depend on the period filter')`: con le stesse `cols`, `summaryTotals(cols, true).totResidual === summaryTotals(cols, false).totResidual` e idem `totResidualEur`; e `it('pins the pre-redesign Spent under a filter: consumed minus in-period')`: `summaryTotals(cols, true).totSpent === totConsumed − totInPeriod`.
- [ ] **Step 2:** `npx vitest run js/lib/portfolio-calc.test.js` → PASS (pinna il comportamento attuale).
- [ ] **Step 3: Test del modulo nuovo**, in `project-report-calc.test.js`:
  - `paceJudgment`: `null→null`, `10→'on-track'`, `−10→'on-track'`, `10.5→'ahead'`, `−11→'behind'`, `paceJudgment(4, 3)→'ahead'`.
  - `breakdownRows`: col `{soldHours:20, soldEur:3200, totalConsumed:22, totalConsumedEur:3520, inPeriod:5, inPeriodEur:800}` → senza filtro `spentHours 22`, `remainingHours −2`, `remainingAmount −320`, `pct 110`, `overSold true`, `barState 'danger'`; con filtro `spentHours 5`, `spentAmount 800`, `remainingHours −2`, `pct 110` (Review Focus 3: con `inPeriod 0` → `spentHours 0`, resto invariato); col con `soldHours 0, totalConsumed 5` → `pct null`, `overSold true`, `barState 'danger'` (Review Focus 1); col `{soldHours 40, totalConsumed 38.75}` → `pct 97`, `barState 'warning'`, `overSold false`; `total` somma le col con le stesse regole (`total.pct` da `spentPercent(Σconsumed, Σsold)`).
  - `taskSubtitle`: task con 3 risorse e due gruppi (uno con entry `{role, task}` che lo copre, uno jolly `{role, task:''}` su un suo ruolo) → `"3 roles · <A> · <B>"`; nessun gruppo → `"3 roles"`; 1 risorsa → `"1 role"`.
  - `roleSubtitle('director', 'project management', rows)` con due owner distinti → `"Ann, Bob · Project Management"` (nome del task con le maiuscole della prima riga che lo contiene); nessuna riga → nome del task passato.
  - `groupSubtitle`: gruppo con entry `{role:'Dev', task:'FE'}` e jolly `{role:'QA', task:''}` su tasks `[FE(Dev), Content(QA), QA(QA)]` → `"FE, Content, QA"` nell'ordine dei task.
  - `entriesByMonth`: righe di set e ago 2026 → `[sep, aug]`; dentro il mese righe per data crescente; `rateFor` che ritorna `null` per una riga → `amount` del mese somma solo le altre e la riga ha `amount null` (Review Focus 2).
  - `hoursByMonth`: somma per `YYYY-MM`.
  - `monthState('202609', new Date(2026,8,22))→'current'`, `'202608'→'past'`, `'2026-10'→'future'`.
  - `todayIndex([1 gen, 1 feb, 1 mar], 15 feb)→1`; `today` prima del primo punto → `null`; `today` oltre l'ultimo punto di più di un intervallo (ultimo punto + passo) → `null`; `[]` → `null` (Review Focus 4).
- [ ] **Step 4:** `npx vitest run js/lib/project-report-calc.test.js` → FAIL (modulo assente).
- [ ] **Step 5: Implementare** `js/lib/project-report-calc.js` con le firme sopra. `breakdownRows`: `spent = hasFilter ? inPeriod : totalConsumed`, `remaining = sold − totalConsumed`, `pct = spentPercent(totalConsumed, soldHours)`, `overSold = totalConsumed > soldHours`, `barState = overSold ? 'danger' : spentBarState(pct)`. `todayIndex`: ultimo indice con `points[i] <= today`, `null` se nessuno o se `today` è oltre `points[last] + (points[last] − points[last−1])` (con un solo punto, oltre 31 giorni).
- [ ] **Step 6:** `npx vitest run js/lib/project-report-calc.test.js js/lib/portfolio-calc.test.js` → PASS.
- [ ] **Step 7: Commit** — `feat: project-report-calc module + summaryTotals characterization tests`.

### Task 2: Helper condiviso `chart-today.js`, adottato da `program.html`

**Boards:** nessuna (nessun cambio visibile su `program.html`).

**Files:**
- Create: `js/lib/chart-today.js`, `js/lib/chart-today.test.js`
- Modify: `program.html` (`renderBurndownChart`, plugin `pgTodayLabel`; tag script)

**Interfaces:**
- Produces: `todayLabelPlugin({ id: string, index: number|null, text: string, bg: string, fg: string }) → { id, afterDraw(chart) }`, con `window.todayLabelPlugin`.

- [ ] **Step 1: Test:** `index: null` → `afterDraw` non chiama nessun metodo del contesto; con un chart finto (`getDatasetMeta(0).data[2] = {x:100, y:50}`, `ctx` con `save/restore/fillText/measureText/beginPath/fill/rect` spiati, senza `roundRect`) → `fillText(text, 100, …)` chiamato una volta e `rect` usato come fallback; indice senza punto → nessuna chiamata.
- [ ] **Step 2:** `npx vitest run js/lib/chart-today.test.js` → FAIL.
- [ ] **Step 3: Implementare** spostando il corpo di `afterDraw` di `program.html` (font `600 11px sans-serif`, `padX 7`, `boxH 20`, raggio 4, offset `y − 12`) con testo e colori da parametri.
- [ ] **Step 4:** in `program.html` aggiungere `<script type="module" src="js/lib/chart-today.js?v=1">` prima dello script dell'app e sostituire l'oggetto `todayLabelPlugin` inline con `window.todayLabelPlugin({ id: 'pgTodayLabel', index: todayIndex, text: \`${fmtH(todayRemaining)} left · ${labels[todayIndex]}\`, bg: this.chartColor('--brand-navy','navy'), fg: this.chartColor('--surface-white','white') })` (testo calcolato solo se `todayIndex !== null`).
- [ ] **Step 5:** `npx vitest run js/lib/chart-today.test.js js/lib/program-guard.test.js` → PASS.
- [ ] **Step 6: Commit** — `refactor: extract the Today chart label into js/lib/chart-today.js`.

### Task 3: Testata, switch fratelli e KPI

**Boards:** `docs/superpowers/design/reporting-project/74a-reporting-project-pm-burndown_breakdown_bytask.jpg` (testata, KPI), `docs/superpowers/design/reporting-project/74d-reporting-project-switch_progetto_filtro_period.jpg` (riga programma, switch aperto). Aprirle e confrontare il markup prima di chiudere il task.

**Files:**
- Modify: `portfolio.html` (testata della vista `dashboard`, righe KPI; computed `dashboardSiblings`; nuovi computed; tag script; `portfolio.css?v=3`)
- Modify: `program.html` (`portfolio.css?v=3`)
- Modify: `css/portfolio.css` (`.pr-head*`, `.pr-switch*`, `.pr-kpi*`)
- Modify: `js/lib/portfolio-guard.test.js`

**Interfaces:**
- Consumes: `projectMetrics`, `programTotals` (`program-calc.js`), `paceJudgment` (Task 1), `getPipelineBudget` (`api-sync.js`).
- Produces (computed in `portfolio.html`, usati dai Task 4-6): `reportToday` (Date fissata al caricamento della vista), `reportDeps` (`{ findRate, billableTasks, billableData, pipelineBudget: getPipelineBudget, today: reportToday }`), `dashboardMetrics` (`projectMetrics` del progetto corrente), `dashboardTags` (array di `{ item_id, label }`).

- [ ] **Step 1: Guard (fallisce):** in `portfolio-guard.test.js` aggiungere un describe `project reporting view` che estrae il template da `<template v-else>` alla sua chiusura e verifica: nessuna emoji, nessun hex; contiene `Project Portfolio`, `Projects in program`, `Hours on track`, `Hours ahead of time`, `Hours behind time`, `No budget`, `Time elapsed`; contiene `goConfigure`, `triggerLoadActuals`, `goPlanningForProject`, `openShareModal('project'` e `my_permission !== 'viewer'` due volte; non contiene `← Portfolio`. Riscrivere il test `the sibling-project switcher dropdown has a Program Dashboard entry at the bottom` sul nuovo markup (cerca `pr-switch` invece di `dashboardSiblings.length`/`</ul>`, stesse due asserzioni). Aggiornare `?v=2` → `?v=3`. `npx vitest run js/lib/portfolio-guard.test.js` → FAIL.
- [ ] **Step 2: Script:** in `portfolio.html` aggiungere dopo `portfolio-calc.js?v=5` i tag module di `program-calc.js?v=1`, `project-report-calc.js?v=1`, `chart-today.js?v=1`; `portfolio.css?v=3` su entrambe le pagine.
- [ ] **Step 3: Dati:** `dashboardSiblings` include il corrente (`current: true`), ordinato per `code` poi `name` (`localeCompare`), ogni voce con `metrics = projectMetrics(cfg, timesheetData.filter(r => r.projectId === cfg.id), reportDeps)`; `dashboardProgramTotals = programTotals(siblings.map(s => s.metrics))`. `showDashboard(pid)` carica i tag con `Api.projects.tags.list(pid)` in `dashboardTags`, errore → `[]` senza avviso; azzerati a ogni cambio progetto.
- [ ] **Step 4: Markup testata** (spec §6 "Testata"): link `‹ Project Portfolio`; riga programma; titolo 26px/700 navy che, con `programId`, è il bottone del dropdown `.pr-switch` (Bootstrap `data-bs-toggle="dropdown"`, chevron SVG) con intestazione, righe (✓ sul corrente, codice monospace, `statusBadgeLarge`, `.pf-spent-bar.pf-spent-thin` + %), piede `N projects · Xh sold · Y% consumed` e `Program Dashboard →` (`goProgramDashboard`); pillole stage/status (`dashboardMetaHtml`); riga metadati cliente · codice · `monthLabel` start–end · tag `.pf-badge-neutral`; quattro bottoni 32px con icone SVG inline `stroke="currentColor"`, gating invariato. Rimuovere `dashboardProgramRow` dal template (il computed resta se usato altrove, altrimenti si toglie).
- [ ] **Step 5: KPI** (spec §6 "KPI"): tre tile `.pr-kpi` dentro `.pg-kpis` con griglia a 3 colonne (classe modificatrice `.pr-kpis`), barra `.pf-spent-bar` con `spentBarState`; Hours e Budget come da tabella della spec, "incl. X PTC" se `kpis.totalPtc > 0`; Time elapsed da `dashboardMetrics.timePct`, barra grigia, "As of <reportToday>" (`toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})`) e testo di `paceJudgment(dashboardMetrics.vsTime)`; "—"/"No budget" senza budget; "—" senza date. Rimuovere `kpiBudgetEurSub`/`kpiBudgetLeftSub`/`kpiAsOfStr` se non più usati.
- [ ] **Step 6: CSS** `.pr-*` per testata, switch (larghezza ~480px, righe con hover `--surface-light`) e tile; sotto 1024px le azioni vanno sotto il titolo; sotto 768px `.pr-kpis` a una colonna.
- [ ] **Step 7:** `npx vitest run js/lib/portfolio-guard.test.js js/lib/program-guard.test.js js/lib/foundations-guard.test.js js/lib/money-guard.test.js` → PASS.
- [ ] **Step 8:** aprire le due tavole e confrontare testata, switch e KPI col markup; annotare nel messaggio di commit gli scostamenti voluti.
- [ ] **Step 9: Commit** — `feat: project reporting header, sibling switch and KPI tiles (7.4)`.

### Task 4: Card Progress

**Boards:** `docs/superpowers/design/reporting-project/74a-reporting-project-pm-burndown_breakdown_bytask.jpg` (Burndown), `docs/superpowers/design/reporting-project/74a-reporting-project-pm-monthly_breakdown_bytask.jpg` (Monthly summary). Aprirle e confrontare.

**Files:**
- Modify: `portfolio.html` (card burndown, Monthly Summary, PTC → una card; `renderBurndownChart`; `monthlySummary` riceve `ym`; nuovo `progressView`)
- Modify: `css/portfolio.css` (`.pr-card`, `.pr-seg`, `.pr-toolbar`, `.pr-monthly*`)
- Modify: `js/lib/portfolio-guard.test.js`

**Interfaces:**
- Consumes: `todayLabelPlugin` (Task 2), `todayIndex`, `monthState` (Task 1), `reportToday` (Task 3).
- Produces: `progressView` (`'burndown'|'monthly'|'ptc'`, default `'burndown'`, azzerato in `showDashboard`); metodo `exportTableXls(tableEl, filename)` riusato dal Task 6.

- [ ] **Step 1: Guard (fallisce):** il template contiene `Progress`, `Burndown`, `Monthly summary`, `Pass-through`, `Remaining hours (actual)`, `Remaining hours planned`, `No actuals loaded yet.`, `current`; non contiene `Estimated Hours` né `<ExportButtons`; `renderBurndownChart` usa `todayLabelPlugin(` e `chartColor('--chart-actual'` / `chartColor('--chart-phasing'`. → FAIL.
- [ ] **Step 2: Card** `.pr-card` con testata "Progress" e segmentato (terza voce solo con `ptcReport`). Senza `dashboardData.length`: al posto del contenuto "No actuals loaded yet." più bottone "Load Actuals" con gating `my_permission !== 'viewer'` (Review Focus 5).
- [ ] **Step 3: Burndown:** toolbar a destra (segmentato intervallo; chip-dropdown "Task: All tasks ▾" sulle opzioni di `billableTaskNames`; bottone icona Export PNG → `exportChartPng`); legenda HTML con `.pg-legend-*` ("Remaining hours (actual)", "Remaining hours planned (phasing)" o "(linear)" se `!hasPhasingEur`, "Today · <data>" solo con indice non nullo); `renderBurndownChart` con due dataset (`burnValues`, `idealValues`; via `planningData`), `legend: { display: false }`, `pointRadius` 0 salvo il punto Today (5), plugin `todayLabelPlugin({ id:'prTodayLabel', index, text: \`${fmtH(burnValues[index])} left\`, … })` con `index = todayIndex(series.points, reportToday)`; tooltip invariato (la sua riga "Estimated" legge `planningData` dalla serie calcolata, non da un dataset, quindi resta). Il grafico va ri-renderizzato quando si torna su `progressView === 'burndown'` (`$nextTick`).
- [ ] **Step 4: Monthly summary:** colonne Month · Est. hours · Consumed · Variance · Est. budget · Spent · Variance (+ PTC se `hasPtc`); `monthState(m.ym, reportToday)`: `current` con pillola navy "current" e fondo `--surface-light`, `future` testo `--text-faint` e "—" su Consumed/Spent/Variance; riga Total `--surface-medium`; varianze negative `--color-danger`; label mese `short` ("Sep 2026"); icona Export XLS → `exportTableXls(this.$refs.monthlyTable, 'monthly_summary')` (stesso `XLSX.utils.table_to_book` di oggi).
- [ ] **Step 5: Pass-through:** la tabella PTC esistente dentro la card, stessi dati, stile `.pr-*`.
- [ ] **Step 6:** `npx vitest run js/lib/portfolio-guard.test.js` → PASS.
- [ ] **Step 7:** confronto con le due tavole (toolbar, legenda, pillola Today, mese corrente/futuri, Total).
- [ ] **Step 8: Commit** — `feat: project reporting Progress card (burndown, monthly summary, pass-through)`.

### Task 5: Card Breakdown — viste, righe, Total, Period

**Boards:** `docs/superpowers/design/reporting-project/74a-reporting-project-pm-burndown_breakdown_bytask.jpg` (By task), `docs/superpowers/design/reporting-project/74a-reporting-project-pm-breakdown_byrole.jpg` (By role), `docs/superpowers/design/reporting-project/74a-reporting-project-pm-monthly_breakdown_byfunctionalarea.jpg` (By functional area), `docs/superpowers/design/reporting-project/74d-reporting-project-switch_progetto_filtro_period.jpg` (menu Period). Aprirle e confrontare.

**Files:**
- Modify: `portfolio.html` (rimozione delle card Period filter, Summary by task/role/functional area; nuova card Breakdown; nuovi computed)
- Modify: `css/portfolio.css` (`.pr-bd*`, `.pr-period*`)
- Modify: `js/lib/portfolio-guard.test.js`

**Interfaces:**
- Consumes: `breakdownRows`, `taskSubtitle`, `roleSubtitle`, `groupSubtitle`, `hoursByMonth` (Task 1); `summaryByTask`, `summaryByRole`, `summaryByGroup`, `filterRange`, `filterHasFilter`, `filterMonthOptions`, `resetDateFilter` (esistenti).
- Produces: `breakdownView` (`'task'|'role'|'area'`, default `'task'`, azzerato in `showDashboard`); computed `breakdown` → `{ rows: [{ ...Row, key, subtitle, taskName? }], total: Row }` per la vista corrente; `periodLabel` ("Whole project" o `filterRangeLabel`); `breakdownRow` (frammento di template o markup ripetuto per le colonne Sold/Spent/Remaining/Total consumption), riusato dal Task 6 per i ruoli rientrati.

- [ ] **Step 1: Guard (fallisce):** il template contiene `Breakdown`, `By task`, `By role`, `By functional area`, `No functional areas configured`, `Remaining (total)`, `Total consumption`, `Over sold`, `Whole project`, `Custom range`, `Reset`; non contiene `In period`, `Summary by task`, `Period filter`. → FAIL.
- [ ] **Step 2: Computed `breakdown`:** By task → `breakdownRows(summaryByTask, filterHasFilter)` con `subtitle = taskSubtitle(task, cfg.groups || [])` e `taskName`; By role → `breakdownRows(summaryByRole, …)`, label = ruolo (parte prima di ` — ` nel label attuale, oppure aggiungere `role`/`task` alle voci della mappa di `summaryByRole`), `subtitle = roleSubtitle(roleLower, taskLower, dashboardData)`; By functional area → `breakdownRows(summaryByGroup, …)`, `subtitle = groupSubtitle(group, billableTasks(cfg))`.
- [ ] **Step 3: Markup:** testata (titolo, segmentato con `By functional area` `disabled` + `title="No functional areas configured"` se `!cfg.groups?.length`, icona Export XLS, pulsante Period); tabella con colonne nome · Sold · Spent (intestazione `Spent · {{ periodLabel }}` con filtro) · Remaining (total) · Total consumption; celle ore in evidenza + importo `.eur-sub`; barra `.pf-spent-bar` 5px + %; riga `overSold` con classe `.pr-bd-over` (pillola "Over sold", fondo `color-mix(in srgb, var(--color-danger-bg) 40%, var(--surface-white))`, residuo `--color-danger`); riga Total. Nessuno scroll orizzontale a 1024: sotto 1024px la colonna Remaining è nascosta.
- [ ] **Step 4: Period:** dropdown `.pr-period` con "Whole project" + intervallo (`monthLabel` start–end), mesi di `filterMonthOptions` in ordine inverso ciascuno con `fmtH(hoursByMonth(billableData(dashboardData, cfg))[ym] || 0)`, sezione "Custom range" con due `<input type="date">` legati a `filterStart`/`filterEnd` (stesso azzeramento incrociato di oggi); bottone evidenziato (bordo `--brand-navy`, fondo `--surface-light`) con filtro attivo e link "Reset".
- [ ] **Step 5: Export XLS** della vista corrente: `exportBreakdownXls()` con `XLSX.utils.aoa_to_sheet` (intestazioni: Name, Detail, Sold h, Sold amount, Spent h, Spent amount, Remaining h, Remaining amount, Consumption %; righe + Total), nome file `breakdown_<task|role|area>`.
- [ ] **Step 6:** rimuovere le card Period filter e Summary by task/role/functional area.
- [ ] **Step 7:** `npx vitest run js/lib/portfolio-guard.test.js` → PASS.
- [ ] **Step 8:** confronto con le quattro tavole.
- [ ] **Step 9: Commit** — `feat: project reporting Breakdown card with period filter (7.4)`.

### Task 6: Espansione task, Entries per mese, Excluded from report

**Boards:** `docs/superpowers/design/reporting-project/74a-reporting-project-pm-burndown_breakdown_bytask.jpg` (Project Management espanso, Entries). Aprirla e confrontare.

**Files:**
- Modify: `portfolio.html` (`taskDetailData` riceve `role`/`owners`/`rate`; rimozione della sezione Task detail, di `taskDetailRows` e di `ExportButtons` se non più usati; rimozione del "← Portfolio" in fondo)
- Modify: `css/portfolio.css` (`.pr-sub*`, `.pr-entries*`, `.pr-excluded*`)
- Modify: `js/lib/portfolio-guard.test.js`

**Interfaces:**
- Consumes: `breakdown`, `breakdownRow` (Task 5); `entriesByMonth` (Task 1); `exportTableXls` (Task 4); `taskDetailData`, `taskState` (esistenti).
- Produces: stato per task `taskState(name) = { expanded: false, openMonth: null }` (rimpiazza `groupMode`).

- [ ] **Step 1: Guard (fallisce):** il template contiene `Entries ·`, `Export XLS`, `entries`, `No entries in the selected period.`, `Excluded from report`, `Role (resource)`, `Amount`, `Note`; non contiene `By owner`, `Chronological entries`, `Expand details`. → FAIL.
- [ ] **Step 2: Espansione** (solo By task): chevron SVG sulla riga, toggle di `taskState(taskName).expanded`; sotto la riga, i ruoli di `taskDetailData` del task (nome ruolo; sottotitolo `owners · formatMoney(rate)/h`; stesse colonne, con Spent = `consumedPeriod`, Remaining/% da `soldHours`/`remaining`, `overSold` se `remaining < 0`).
- [ ] **Step 3: Entries:** riga "Entries · N" (N = `periodData.length`) con link "Export XLS" (tabella delle entries del task nel periodo, file `task_<nome>_entries`); mesi da `entriesByMonth(entry.periodData, r => rate del ruolo nel task o null)`, **tutti chiusi**; click su un mese → `openMonth = ym` o `null` se era quello aperto (uno solo per task); intestazione mese: label, "N entries", ore, importo; righe Date · Role (resource) · Hours · Amount ("—" se `null`) · Note. Senza righe nel periodo: "No entries in the selected period."
- [ ] **Step 4: Excluded from report** (By task, solo se `cfg.tasks.some(t => t.billable === false)`): sezione attenuata sotto il Total con una riga per task non fatturabile (nome, ore consumate nel periodo), espandibile con le stesse Entries; nessun valore nei totali.
- [ ] **Step 5:** rimuovere la vecchia sezione Task detail, `groupMode`, `taskDetailRows` e il componente `ExportButtons` se non hanno altri usi (`grep` prima di togliere); rimuovere il "← Portfolio" in fondo pagina.
- [ ] **Step 6:** `npx vitest run js/lib/portfolio-guard.test.js` → PASS.
- [ ] **Step 7:** confronto con la tavola principale (ruoli rientrati, Entries, mese aperto via click).
- [ ] **Step 8: Commit** — `feat: task expansion with monthly entries in the project Breakdown (7.4)`.

### Task 7: Verifica visiva contro le tavole

**Boards:** tutte e cinque le tavole della cartella `docs/superpowers/design/reporting-project/`.

Eseguito dalla sessione principale (ha shell e `Read` per i PNG), non da un subagent.

- [ ] **Step 1:** dal worktree `scripts/test-branch.sh up` (stack isolato, mai il main stack); copiare prima `.env` dal checkout principale se manca.
- [ ] **Step 2:** ricavare l'id di "BERMITS Maintenance 2026" e di un progetto senza actuals con uno snippet `--eval` su `/portfolio.html` (lettura di `config.projects` e `timesheetData`).
- [ ] **Step 3:** `node scripts/shoot.mjs --base http://localhost:8081 --settle 3000 --widths 1440,1024 --out shots/pr` per: (a) `?projectId=<BERMITS>` `--full`, Project Management espanso e un mese aperto via `--eval`; (b) Progress su Monthly summary; (c) Breakdown By role; (d) By functional area; (e) switch fratelli + menu Period aperti in un solo scatto; (f) progetto senza actuals.
- [ ] **Step 4:** leggere ogni PNG con `Read` e confrontarlo con la tavola corrispondente; presentare all'utente l'elenco degli scostamenti, uno per uno, con proposta fix-ora / accetta-e-registra, e attendere la decisione.
- [ ] **Step 5:** applicare i fix decisi (test mirati), registrare gli "accetta" con il motivo in `docs/pages/portfolio.md` (sezione "Project reporting redesign (7.4)"); `scripts/test-branch.sh down` solo dopo il "yes" dell'utente al Gate 2 di `/finish-cycle`.
- [ ] **Step 6: Commit** — `fix: visual fidelity pass against 7.4 boards`.

Il resto della documentazione di spec §12 lo scrive `/sync-docs` nel Gate 5 di `/finish-cycle`, che chiude il ciclo.

## Decisioni aperte

1. **Esecuzione in sei task di codice più uno di verifica, sequenziali sullo stesso file.** Alternativa scartata: un task per card con i calcoli dentro ciascuno. Perché: le funzioni pure nascono testate una volta sola (Task 1) e ogni card le consuma.
2. **I tag del progetto si leggono con `Api.projects.tags.list(pid)` all'apertura della vista e si mostrano come pillole neutre `.pf-badge-neutral`.** Alternativa scartata: colore per lista di attributi come nella tavola, o niente tag. Perché: il config in memoria non porta i tag, l'endpoint esiste già, e non c'è un token di colore per lista.
3. **`summaryByRole` riceve `role` e `task` separati sulle sue voci invece di ricavarli dal label.** Alternativa scartata: spezzare `"<ruolo> — <task>"`. Perché: un nome di ruolo o task con " — " darebbe un risultato sbagliato.
4. **`todayIndex` dà `null` quando oggi supera l'ultimo punto di più di un intervallo.** Alternativa scartata: marcatore sempre sull'ultimo punto. Perché: un progetto chiuso da mesi non deve mostrare "Today" sulla sua fine.
