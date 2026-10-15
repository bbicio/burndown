# Reporting calc follow-ups (B-080, B-081) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere visibili nel tile Hours le ore datate dopo oggi (B-080) e limitare al task filtrato il budget € del tooltip del burndown (B-081).

**Architecture:** Due modifiche pure in `js/lib/portfolio-calc.js` con TDD, precedute da characterization test; poi `portfolio.html` legge il nuovo campo e mostra la nota, con i bump di `?v=` in un solo task.

**Tech Stack:** Vue 3 da CDN senza build, Chart.js, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-15-reporting-calc-followups-design.md`
**Branch:** `reporting-calc-followups`
**Risk class:** high-risk — file condiviso caricato da più pagine (`js/lib/portfolio-calc.js` su `portfolio.html` e `program.html`) e importi monetari visibili (Remaining € del tooltip).

**Indipendenza dei task:** i task **non** sono indipendenti: il Task 2 e il Task 3 aggiornano i test del Task 1, il Task 4 consuma `futureHours` del Task 2.

## Global Constraints

- Nessun file sotto `api/`, nessuna migrazione, nessun endpoint.
- `computeKpis` senza `today`: output identico a oggi più `futureHours: null`. Nessun altro campo cambia.
- `computeBurndownPoints` senza filtro task: output identico a oggi.
- Copy esatta della nota: `incl. <fmtH(futureHours)> dated after today`, classe `.pr-kpi-note`.
- "Dopo oggi" = `r.date > today` (complemento esatto di `r.date <= date` in `remainingAsOf`).
- I `?v=` cambiano solo nel Task 4: `portfolio-calc.js` 7→8 (`portfolio.html`, `program.html`, import e commenti in `js/lib/program-calc.js` e `js/lib/project-report-calc.js`), `program-calc.js` 3→4 (`portfolio.html`, `program.html`), `project-report-calc.js` 2→3 (`portfolio.html`).
- HTML editato solo con Edit/Write, mai con `Get-Content`/`Set-Content` (BOM).
- Durante i task si lancia solo `npx vitest run js/lib/portfolio-calc.test.js` (§6.2); la suite completa è del Gate 1.

## Review Focus

1. Una riga datata oggi (mezzanotte) con `today` = oggi alle 15:00 non è futura — test nel Task 2.
2. Progetto sforato: la pillola è clampata a 0, quindi l'invariante è `todayValue === Math.max(0, hoursLeft + futureHours)`, non l'uguaglianza secca — test nel Task 2.
3. Filtro task con maiuscole diverse dal nome configurato (`'dev'` vs `'Dev'`) trova comunque il budget € del task — test nel Task 3.
4. Una riga futura su un task non fatturabile non entra in `futureHours` — test nel Task 2.
5. Nota nascosta con `futureHours` 0 o `null` (anche nello stub di `kpis` prima che il dashboard sia pronto) — verifica visiva del Task 4.

## Fixture comune (in `js/lib/portfolio-calc.test.js`, nuovo `describe` in fondo)

```js
const fuCfg = {
  startDate: '202601', endDate: '202606',
  tasks: [
    { name: 'Dev', billable: true,  resources: [{ role: 'Developer', soldHours: 100, hourlyRate: 50 }] },
    { name: 'QA',  billable: true,  resources: [{ role: 'Tester',    soldHours: 40,  hourlyRate: 30 }] },
    { name: 'Ops', billable: false, resources: [{ role: 'Admin',     soldHours: 10,  hourlyRate: 20 }] },
  ],
};
const fuData = [
  { task: 'Dev', role: 'Developer', hours: 10, date: new Date(2026, 0, 15) },
  { task: 'Dev', role: 'Developer', hours: 5,  date: new Date(2026, 2, 15) },
  { task: 'Dev', role: 'Developer', hours: 3,  date: new Date(2026, 4, 10) },
  { task: 'Ops', role: 'Admin',     hours: 4,  date: new Date(2026, 4, 10) },
];
const fuToday = new Date(2026, 1, 20);
```

Riusa i fake `billableData`/`billableTasks`/`findRate` già in testa al file.

---

### Task 1: Characterization test

**Files:**
- Test: `js/lib/portfolio-calc.test.js` (nuovo `describe('reporting follow-ups — characterization (pre-fix)')` in fondo, con la fixture comune)

- [ ] **Step 1: Scrivere i test**
  - `it('the Hours tile counts entries dated after today, the pill does not')`: `computeKpis(fuData, fuCfg, …).consumedHours === 18`; `computeBurndownPoints(fuData, fuCfg, '', 'monthly', …, fuToday).todayValue === 130` (140 − 10).
  - `it('with a task filter totalBudgetEur sums every task (B-081, pre-fix)')`: con `taskFilter: 'Dev'`, `totalBudgetEur === 6400` (5000 + 1200 + 200); senza filtro `=== 6200`.
- [ ] **Step 2: Eseguire** `npx vitest run js/lib/portfolio-calc.test.js` — atteso PASS (pinnano l'attuale).
- [ ] **Step 3: Commit** `test: characterize future-dated hours and filtered € budget (B-080, B-081)`

### Task 2: `futureHours` in `computeKpis` (B-080)

**Files:**
- Modify: `js/lib/portfolio-calc.js` (`computeKpis`, righe 7-27)
- Test: `js/lib/portfolio-calc.test.js`

**Interfaces:**
- Produces: `computeKpis(data, cfg, billableData, billableTasks, findRate, today = null)` → oggetto attuale + `futureHours: number | null`.

- [ ] **Step 1: Test che falliscono** — `describe('computeKpis — futureHours (B-080)')`:
  - senza `today`: `futureHours === null`, e gli altri campi uguali a una chiamata senza il parametro.
  - con `fuToday`: `futureHours === 8` (5 + 3; la riga Ops non conta — Review Focus 4); `hoursLeft === 122`.
  - senza `cfg` (`null`): `futureHours === 12` (tutte le righe dopo oggi).
  - nessuna riga futura (`today = new Date(2026, 5, 30)`): `futureHours === 0`.
  - Review Focus 1: riga `{ task:'Dev', hours: 2, date: new Date(2026,1,20) }` con `today = new Date(2026,1,20,15,0)` → `futureHours === 0`.
  - Invariante (Review Focus 2): con `fuToday`, `computeBurndownPoints(fuData, fuCfg, '', 'monthly', …, fuToday).todayValue === Math.max(0, k.hoursLeft + k.futureHours)` (= 130); e su un cfg con Dev `soldHours: 5` e QA rimosso: `todayValue === 0` e la stessa espressione vale 0.
- [ ] **Step 2: Eseguire** — atteso FAIL su `futureHours` (`undefined`).
- [ ] **Step 3: Implementare** — `futureHours = today ? bData.filter(r => r.date > today).reduce(...) : null`, calcolato prima del ramo `!cfg` e aggiunto a entrambi i `return`.
- [ ] **Step 4: Eseguire** — atteso PASS, Task 1 incluso.
- [ ] **Step 5: Commit** `feat: computeKpis reports hours dated after today (B-080)`

### Task 3: `totalBudgetEur` del task filtrato (B-081)

**Files:**
- Modify: `js/lib/portfolio-calc.js` (`computeBurndownPoints`, righe 126-130)
- Test: `js/lib/portfolio-calc.test.js`

- [ ] **Step 1: Test che falliscono** — `describe('computeBurndownPoints — filtered € budget (B-081)')`:
  - `taskFilter: 'Dev'` → `totalBudgetEur === 5000`; `'dev'` → `5000` (Review Focus 3); `'Nope'` → `0`; nessun filtro → `6200`.
  - Aggiornare il test del Task 1 sul filtro: atteso `5000` (togliere "pre-fix" dal nome di quell'`it`).
- [ ] **Step 2: Eseguire** — atteso FAIL (6400 ≠ 5000).
- [ ] **Step 3: Implementare** — con filtro, stesso `find` lower-case di `burndownBudget`, somma `soldHours * hourlyRate` delle sue risorse, `?? 0`. Estrarre il `find` in un helper locale `filteredTask(cfg, taskFilter)` usato da entrambi.
- [ ] **Step 4: Eseguire** — atteso PASS su tutto il file.
- [ ] **Step 5: Commit** `fix: filtered burndown tooltip uses the task's own € budget (B-081)`

### Task 4: Nota nel tile Hours + cache-busting

**Files:**
- Modify: `portfolio.html` (computed `kpis` riga ~934; tile Hours righe ~385-391; `<script>` righe ~701-703)
- Modify: `program.html` (righe ~277-278), `js/lib/program-calc.js` (righe 6, 9), `js/lib/project-report-calc.js` (righe 5, 6, 139)

**Interfaces:**
- Consumes: `kpis.futureHours` (Task 2).

- [ ] **Step 1: `kpis`** — passare `this.reportToday` come sesto argomento; aggiungere `futureHours: null` allo stub di `!this.dashboardReady`.
- [ ] **Step 2: Nota** — dentro il tile Hours, dopo `.pg-tile-foot`: `<div v-if="kpis.futureHours > 0" class="pr-kpi-note">incl. {{ fmtH(kpis.futureHours) }} dated after today</div>`.
- [ ] **Step 3: Bump `?v=`** come da Global Constraints; poi `grep -rn "portfolio-calc.js?v=\|program-calc.js?v=\|project-report-calc.js?v=" --include=*.html --include=*.js . | grep -v node_modules` — atteso solo `?v=8`, `?v=4`, `?v=3` rispettivamente.
- [ ] **Step 4: Test** — `npx vitest run js/lib/portfolio-calc.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js` — atteso PASS; controllo BOM: `head -c3 portfolio.html program.html | od -c` non mostra `357 273 277`.
- [ ] **Step 5: Verifica visiva** (§6.3, una sola, Review Focus 5): report di un progetto con almeno una riga datata dopo oggi su `scripts/test-branch.sh up` — nota visibile sotto il tile Hours; tooltip del burndown filtrato su un task con Remaining = budget € del task − consumo; un progetto senza righe future non mostra la nota. Se nessun progetto ha righe future, lo dichiara il report e la nota si verifica con `scripts/shoot.mjs --eval` impostando `futureHours` (docs/scripts/shoot.md).
- [ ] **Step 6: Commit** `feat: show future-dated hours under the Hours tile (B-080)`

## Decisioni aperte

1. **Il `find` lower-case del task filtrato diventa un helper locale condiviso da `burndownBudget` e `totalBudgetEur`.** Alternativa scartata: duplicarlo inline. Perché: la Spec chiede «lo stesso confronto di `burndownBudget`», e un helper unico lo garantisce.
2. **Verifica visiva con fallback su `shoot.mjs --eval`** se lo stack di branch non ha righe future. Alternativa scartata: inserire una riga di timesheet futura nel DB del branch. Perché: evita di scrivere dati nel DB clonato solo per una verifica.
