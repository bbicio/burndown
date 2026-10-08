# Program Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pagina nuova `program.html?programId=` che riassume un programma — 4 KPI, burndown aggregato, lista progetti in vista List o Timeline — e attiva i punti di ingresso oggi disabilitati nel Portfolio.

**Architecture:** Pagina Vue 3 (CDN, nessun build step) sullo stesso modello di `portfolio.html`: carica in memoria progetti, actuals e budget via le funzioni di `js/api-sync.js` e calcola tutto nel browser. Nessun endpoint nuovo, nessun SQL, nessuna migrazione. Tutta la matematica sta in un modulo puro nuovo, `js/lib/program-calc.js`, coperto da vitest; la pagina è solo markup e binding. Il foglio `css/portfolio.css` diventa condiviso fra le due pagine.

**Tech Stack:** Vue 3 global build, Bootstrap 5.3.2, Chart.js 4.4.0, vitest + jsdom per i test, nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-10-08-program-dashboard-design.md`

**Tavole (obbligatorie in ogni dispatch, spec §14):**
- `docs/superpowers/design/reporting-dashboard/7.5a-dashboard-reporting-list.jpg` — riferimento principale
- `docs/superpowers/design/reporting-dashboard/7.5b-dashboard-reporting-timeline.jpg` — vista Timeline
- `docs/superpowers/design/reporting-dashboard/7.4d-dashboard-reporting-dentro-un-programma.jpg` — soli punti di ingresso

## Global Constraints

Valgono per ogni task; copiati dalla spec e dal `CLAUDE.md`.

- **Nessun build step.** nginx serve i file come sono: niente bundler, niente transpile.
- **Solo `var(--token)`.** Nessun valore esadecimale nuovo in CSS, HTML o JS. `js/lib/program-guard.test.js` lo verifica.
- **Nessuna emoji** in `program.html`, nei suoi testi, nei titoli di modale o nelle icone: icone SVG inline con `currentColor` e `aria-hidden`.
- **Testi in inglese**, copy esatto della spec §11 del brief (`Budget`, `Hours`, `Time elapsed`, `Needs attention`, `Program burndown`, `Sold`, `Spent`, `Remaining`, `Consumption`, `vs time`, `Total`, `Reporting →`, `← Portfolio`, `Showing N of M projects`, `Mixed currencies`, `No budget`, `No actuals`, `No projects in this program are visible to you.`).
- **Formattazione denaro solo via `formatMoney(amount, code, currencies)`** di `js/lib/money.js`; ore via `fmtH()` di `core.js`. **Nessun `Intl.NumberFormat`** fuori da `money.js` (guard esistente `money-guard.test.js`).
- **Page shell:** `<div id="app-shell"><div id="nav-container"></div><div id="app-main">…</div></div>`, head snippet `PDash_sidebarCollapsed` identico alle altre pagine, `v-cloak` sul root Vue, tutti gli `<script>` dopo lo shell. `#app-shell`/`#app-main` non prendono mai `overflow`, `transform`, `filter`, `contain`, `will-change`, `position`.
- **Script:** classici con `defer`, moduli con `type="module"`; un override di un global di `js/*.js` solo via `<script type="module">` con `window.nome = …`.
- **Cache-busting:** ogni file versionato modificato va ribumpato in **tutte** le pagine che lo linkano (`css/portfolio.css` è linkato da `portfolio.html` e, da questo ciclo, da `program.html`).
- **Soglie (spec D10):** barra navy < 85%, ambra ≥ 85% e ≤ 100%, rossa > 100%; `vs time` rosso oltre +10 pt, verde sotto −10 pt, neutro in mezzo; `Needs attention` = status `Started At Risk` **oppure** consumo ≥ 85% **oppure** (consumo% − tempo%) > 10.
- **Perimetro (spec D14):** test nuovi e code review **solo** sui file di questo ciclo. `npm test` gira tutto (è veloce, i guard sono trasversali) ma nessuno estende l'analisi al resto della codebase: la review completa del portale è un ciclo a sé a fine restyling Portfolio.
- **Tavole:** ogni task porta la riga `Boards:`; implementer e reviewer devono aprire quelle immagini e scrivere nel report il confronto tavola-vs-markup. Un report senza quel confronto non chiude il task.
- **Test:** `npm test` dalla root (host Node ≥ 20.12; se il Node locale è più vecchio usare il container `node:22` documentato in `CLAUDE.md`). Singolo file: `npx vitest run js/lib/<file>.test.js`.

## Review Focus

Classi di input che la spec implica e che nessun task esercitava di suo; ognuna ha il test aggiunto al task che possiede il codice.

1. **Programma esistente ma con zero progetti visibili** — deve restare sulla pagina con `No projects in this program are visible to you.`, non redirigere al Portfolio come fa un `programId` invalido (Task 3).
2. **Progetto con `soldHours === 0`** (nessun budget) — nessuna divisione per zero: `consumptionPct` e `vsTime` sono `null`, la riga mostra `No budget`, il progetto è escluso dal denominatore dei totali ma contato nel numero progetti (Task 1).
3. **Programma senza nessun progetto datato** (`programRange === null`) — tile Time elapsed `—`, burndown sostituito dal messaggio, Timeline non selezionabile; nessun `NaN` nelle percentuali (Task 1, 3, 6).
4. **Valute divergenti fra i progetti** — `programCurrency` torna `null` e ogni cifra in denaro diventa `Mixed currencies`, mentre ore, consumo e vs time restano calcolati (Task 1, 4).
5. **`today` fuori dal range del programma** (programma interamente futuro o già concluso) — `timePct` resta in [0, 100], la linea `Today` non viene disegnata fuori asse e il marcatore del burndown si àncora all'estremo più vicino (Task 1, 5, 6).

---

### Task 1: Modulo di calcolo — metriche di riga, totali, soglie

**Files:**
- Create: `js/lib/program-calc.js`
- Test: `js/lib/program-calc.test.js`

**Boards:** nessuna (modulo puro) — ma i valori della 7.5a servono come riferimento di sanità: `PROGRAM TOTAL` 5025.00h sold, 2568.50h spent, 2456.50h remaining, 51%, −7 pt.

**Interfaces:**
- Consumes: `spentPercent(spent, sold)` e `spentBarState(pct)` da `js/lib/portfolio-calc.js` (import ES fra moduli `js/lib/`, non il bridge `window`).
- Produces:
  - `programCurrency(cfgs) → string | null`
  - `programRange(cfgs) → { startYm, endYm, startDate, endDate, months } | null` — `months` array di `YYYYMM` inclusivi
  - `projectMetrics(cfg, rows, deps) → { soldHours, soldMoney, spentHours, spentMoney, remainingHours, remainingMoney, consumptionPct, timePct, vsTime, hasBudget, hasActuals, started }`, con `deps = { findRate, billableTasks, billableData, pipelineBudget, today }` (`pipelineBudget(versionId) → { fee } | null`)
  - `programTotals(metrics) → { soldHours, soldMoney, spentHours, spentMoney, remainingHours, remainingMoney, consumptionPct, vsTime }`
  - `timeElapsed(range, metrics, today) → { pct, startedCount, totalCount }`
  - `needsAttention(entries, thresholds) → { ids, reasons }` con `entries = [{ id, name, status, metrics, endYm }]` e `thresholds = { consumption: 85, vsTime: 10 }`
  - `sortProjectRows(rows, attentionIds) → rows`
  - Ogni export ha la riga bridge `window.<name> = <name>;` in fondo al file, come gli altri `js/lib/`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { programCurrency, programRange, projectMetrics, programTotals, timeElapsed, needsAttention, sortProjectRows } from './program-calc.js';

const deps = {
  findRate: (r, cfg) => 100,
  billableTasks: cfg => (cfg.tasks || []).filter(t => t.billable !== false),
  billableData: (rows, cfg) => rows,
  pipelineBudget: () => null,
  today: new Date(2026, 8, 22), // Sep 22 2026, la "Today" della tavola 7.5a
};
const task = (soldHours, rate) => ({ billable: true, resources: [{ soldHours, hourlyRate: rate }] });
const cfg = (over = {}) => ({ id: 'p1', name: 'PMO', startDate: '202601', endDate: '202703', status: 'Started', currency: 'EUR', tasks: [task(10, 100)], ...over });

describe('programCurrency', () => {
  it('returns the single code', () => expect(programCurrency([cfg(), cfg()])).toBe('EUR'));
  it('returns null when codes diverge', () => expect(programCurrency([cfg(), cfg({ currency: 'CHF' })])).toBeNull());
  it('treats a missing code as EUR', () => expect(programCurrency([{ }, cfg()])).toBe('EUR'));
  it('returns null for no projects', () => expect(programCurrency([])).toBeNull());
});

describe('programRange', () => {
  it('spans first start to last end', () => {
    const r = programRange([cfg({ startDate: '202603', endDate: '202612' }), cfg({ startDate: '202601', endDate: '202703' })]);
    expect([r.startYm, r.endYm]).toEqual(['202601', '202703']);
    expect(r.months.length).toBe(15);
  });
  it('ignores undated projects', () => {
    const r = programRange([cfg(), cfg({ startDate: null, endDate: null })]);
    expect(r.startYm).toBe('202601');
  });
  it('returns null when nothing is dated', () => expect(programRange([cfg({ startDate: null, endDate: null })])).toBeNull());
});

describe('projectMetrics', () => {
  it('sums sold hours and money from billable tasks', () => {
    const m = projectMetrics(cfg({ tasks: [task(10, 100), task(5, 200)] }), [], deps);
    expect(m.soldHours).toBe(15);
    expect(m.soldMoney).toBe(2000);
  });
  it('falls back to the pipeline budget fee when tasks carry no budget', () => {
    const m = projectMetrics(cfg({ tasks: [], costGridRef: { versionId: 'v1' } }), [], { ...deps, pipelineBudget: () => ({ fee: 900 }) });
    expect(m.soldMoney).toBe(900);
  });
  it('computes spent hours and money from the rows', () => {
    const m = projectMetrics(cfg(), [{ hours: 4 }, { hours: 1 }], deps);
    expect(m.spentHours).toBe(5);
    expect(m.spentMoney).toBe(500);
    expect(m.remainingHours).toBe(5);
  });
  it('returns null percentages and hasBudget false when nothing is sold', () => {
    const m = projectMetrics(cfg({ tasks: [] }), [{ hours: 4 }], deps);
    expect(m.hasBudget).toBe(false);
    expect(m.consumptionPct).toBeNull();
    expect(m.vsTime).toBeNull();
  });
  it('marks a project with no rows as hasActuals false', () => {
    expect(projectMetrics(cfg(), [], deps).hasActuals).toBe(false);
  });
  it('clamps timePct to [0,100] outside the project window', () => {
    expect(projectMetrics(cfg({ startDate: '202701', endDate: '202703' }), [], deps).timePct).toBe(0);
    expect(projectMetrics(cfg({ startDate: '202501', endDate: '202503' }), [], deps).timePct).toBe(100);
  });
  it('leaves timePct and vsTime null without dates', () => {
    const m = projectMetrics(cfg({ startDate: null, endDate: null }), [{ hours: 4 }], deps);
    expect(m.timePct).toBeNull();
    expect(m.vsTime).toBeNull();
  });
  it('reports started false before the start month', () => {
    expect(projectMetrics(cfg({ startDate: '202701', endDate: '202703' }), [], deps).started).toBe(false);
  });
});

describe('programTotals', () => {
  it('uses sum(spent)/sum(sold), not the mean of the percentages', () => {
    const a = projectMetrics(cfg({ tasks: [task(100, 100)] }), [{ hours: 90 }], deps);
    const b = projectMetrics(cfg({ tasks: [task(10, 100)] }), [{ hours: 1 }], deps);
    expect(programTotals([a, b]).consumptionPct).toBe(83); // 91/110, non (90+10)/2
  });
  it('excludes a project without budget from the denominator but keeps its spend', () => {
    const withBudget = projectMetrics(cfg({ tasks: [task(100, 100)] }), [{ hours: 50 }], deps);
    const noBudget = projectMetrics(cfg({ tasks: [] }), [{ hours: 10 }], deps);
    const t = programTotals([withBudget, noBudget]);
    expect(t.soldHours).toBe(100);
    expect(t.spentHours).toBe(60);
  });
});

describe('timeElapsed', () => {
  it('counts started projects and the elapsed percentage', () => {
    const range = programRange([cfg({ startDate: '202601', endDate: '202612' })]);
    const metrics = [{ started: true }, { started: false }];
    const r = timeElapsed(range, metrics, deps.today);
    expect(r.startedCount).toBe(1);
    expect(r.totalCount).toBe(2);
    expect(r.pct).toBeGreaterThan(0);
    expect(r.pct).toBeLessThanOrEqual(100);
  });
  it('is 0 before the range and 100 after it', () => {
    expect(timeElapsed(programRange([cfg({ startDate: '202701', endDate: '202703' })]), [], deps.today).pct).toBe(0);
    expect(timeElapsed(programRange([cfg({ startDate: '202501', endDate: '202503' })]), [], deps.today).pct).toBe(100);
  });
  it('returns null pct without a range', () => expect(timeElapsed(null, [], deps.today).pct).toBeNull());
});

describe('needsAttention', () => {
  const entry = (id, status, consumptionPct, timePct) => ({ id, name: id, status, endYm: '202609', metrics: { consumptionPct, timePct, vsTime: consumptionPct !== null && timePct !== null ? consumptionPct - timePct : null } });
  it('flags Started At Risk', () => expect(needsAttention([entry('a', 'Started At Risk', 10, 10)]).ids).toEqual(['a']));
  it('flags consumption at the 85 threshold but not at 84', () => {
    expect(needsAttention([entry('a', 'Started', 85, 80)]).ids).toEqual(['a']);
    expect(needsAttention([entry('b', 'Started', 84, 80)]).ids).toEqual([]);
  });
  it('flags vs time above 10 but not at 10', () => {
    expect(needsAttention([entry('a', 'Started', 30, 19)]).ids).toEqual(['a']);
    expect(needsAttention([entry('b', 'Started', 30, 20)]).ids).toEqual([]);
  });
  it('gives a reason string naming the condition', () => {
    expect(needsAttention([entry('a', 'Started At Risk', 95, 80)]).reasons.a).toContain('95%');
  });
  it('ignores a project with null percentages', () => expect(needsAttention([entry('a', 'Not started yet', null, null)]).ids).toEqual([]));
});

describe('sortProjectRows', () => {
  it('puts flagged projects first, then orders by start date', () => {
    const rows = [
      { id: 'a', cfg: { startDate: '202601' } },
      { id: 'b', cfg: { startDate: '202603' } },
      { id: 'c', cfg: { startDate: '202602' } },
    ];
    expect(sortProjectRows(rows, ['b']).map(r => r.id)).toEqual(['b', 'a', 'c']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run js/lib/program-calc.test.js`
Expected: FAIL — `Failed to resolve import "./program-calc.js"`.

- [ ] **Step 3: Implement `js/lib/program-calc.js`**

Le firme sono nel blocco Interfaces. Note che i test non determinano:
- le date sono `YYYYMM` (`cfg.startDate`/`cfg.endDate`); costruire `new Date(y, m-1, 1)` per lo start e `new Date(y, m, 0)` per la fine del mese, come fa `computeBurndownPoints` in `portfolio-calc.js:52-57`;
- `consumptionPct` usa `spentPercent(spentHours, soldHours)` importato da `portfolio-calc.js` (intero arrotondato);
- `reasons[id]` è una frase inglese nello stile della tavola: `At risk · 95% spent, ends Sep 2026`, costruita dalle condizioni che hanno scattato, con il mese finale formattato `MMM yyyy`;
- `sortProjectRows` non muta l'array in ingresso.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run js/lib/program-calc.test.js`
Expected: PASS, tutti i casi.

- [ ] **Step 5: Commit**

```bash
git add js/lib/program-calc.js js/lib/program-calc.test.js
git commit -m "feat(program): modulo di calcolo delle metriche di programma"
```

---

### Task 2: Modulo di calcolo — burndown aggregato e barre della timeline

**Files:**
- Modify: `js/lib/program-calc.js`
- Modify: `js/lib/program-calc.test.js`

**Boards:** `7.5a` (curva e marcatore `2457h left · Sep 22`), `7.5b` (barre, linea Today, stato "Not started").

**Interfaces:**
- Consumes: le funzioni del Task 1; `computeBurndownPoints(rows, cfg, taskFilter, interval, billableData, billableTasks, findRate)` da `portfolio-calc.js` (import ES).
- Produces:
  - `programBurndown(range, projects, deps) → { labels, actual, planned, todayIndex, todayRemaining }`, dove `projects = [{ cfg, rows }]` e `deps` è quello del Task 1
  - `timelineBars(range, rows) → [{ id, name, code, status, leftPct, widthPct, fillPct, state, started, consumptionPct }]`, dove `rows = [{ id, cfg, metrics }]` e nome/codice/stato si leggono da `cfg` (stessa forma del computed `rows` del Task 4)
  - `todayPosition(range, today) → number | null` — percentuale sull'asse, `null` se oggi è fuori dal range

- [ ] **Step 1: Write the failing tests**

```js
describe('programBurndown', () => {
  const range = programRange([cfg({ startDate: '202601', endDate: '202603' })]);
  it('has one label per month of the program range', () => {
    const s = programBurndown(range, [{ cfg: cfg({ startDate: '202601', endDate: '202603' }), rows: [] }], deps);
    expect(s.labels.length).toBe(3);
  });
  it('sums the remaining hours of all projects', () => {
    const a = { cfg: cfg({ tasks: [task(100, 100)], startDate: '202601', endDate: '202603' }), rows: [] };
    const b = { cfg: cfg({ tasks: [task(50, 100)], startDate: '202601', endDate: '202603' }), rows: [] };
    expect(programBurndown(range, [a, b], deps).actual[0]).toBe(150);
  });
  it('holds a project at its full budget for months before it starts', () => {
    const early = { cfg: cfg({ tasks: [task(100, 100)], startDate: '202601', endDate: '202601' }), rows: [] };
    const late = { cfg: cfg({ tasks: [task(40, 100)], startDate: '202603', endDate: '202603' }), rows: [] };
    expect(programBurndown(range, [early, late], deps).actual[0]).toBe(140);
  });
  it('holds a finished project at its last value for months after it ends', () => {
    const done = { cfg: cfg({ tasks: [task(100, 100)], startDate: '202601', endDate: '202601' }), rows: [{ hours: 30, date: new Date(2026, 0, 15) }] };
    const s = programBurndown(range, [done], deps);
    expect(s.actual[2]).toBe(s.actual[0]);
  });
  it('returns empty series without a range', () => {
    expect(programBurndown(null, [], deps).labels).toEqual([]);
  });
});

describe('todayPosition', () => {
  it('is null when today is outside the range', () => {
    expect(todayPosition(programRange([cfg({ startDate: '202701', endDate: '202703' })]), deps.today)).toBeNull();
  });
  it('is a percentage inside the range', () => {
    const p = todayPosition(programRange([cfg({ startDate: '202601', endDate: '202612' })]), deps.today);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(100);
  });
});

describe('timelineBars', () => {
  const range = programRange([cfg({ startDate: '202601', endDate: '202612' })]);
  it('places a bar proportionally to its months', () => {
    const [bar] = timelineBars(range, [{ id: 'a', cfg: cfg({ startDate: '202604', endDate: '202606' }), metrics: { consumptionPct: 50, started: true } }]);
    expect(bar.leftPct).toBeCloseTo(25, 0);
    expect(bar.widthPct).toBeCloseTo(25, 0);
    expect(bar.fillPct).toBe(50);
  });
  it('uses the amber state at 85 and the danger state above 100', () => {
    const mk = pct => timelineBars(range, [{ id: 'a', cfg: cfg(), metrics: { consumptionPct: pct, started: true } }])[0].state;
    expect(mk(84)).toBe('normal');
    expect(mk(85)).toBe('warning');
    expect(mk(101)).toBe('danger');
  });
  it('marks a not-started project with no fill', () => {
    const [bar] = timelineBars(range, [{ id: 'a', cfg: cfg({ status: 'Not started yet' }), metrics: { consumptionPct: 0, started: false } }]);
    expect(bar.started).toBe(false);
    expect(bar.fillPct).toBe(0);
  });
  it('skips an undated project', () => {
    expect(timelineBars(range, [{ id: 'a', cfg: cfg({ startDate: null, endDate: null }), metrics: { consumptionPct: 10, started: true } }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run js/lib/program-calc.test.js`
Expected: FAIL — `programBurndown is not a function`.

- [ ] **Step 3: Implement the three functions in `js/lib/program-calc.js`**

Algoritmo di `programBurndown` (è la parte che le firme non determinano, spec §7):
per ogni progetto chiamare `computeBurndownPoints(rows, cfg, '', 'monthly', deps.billableData, deps.billableTasks, deps.findRate)`, indicizzare `burnValues` e `idealValues` per `YYYYMM` del rispettivo `points[i]`, poi per ogni mese dell'asse di programma prendere: il valore del mese se c'è, altrimenti il **primo** valore della serie se il mese precede l'inizio del progetto, altrimenti l'**ultimo**. `actual[m]` e `planned[m]` sono le somme di questi valori su tutti i progetti; `planned` è `null` se nessun progetto produce `idealValues`. `todayIndex` è l'indice del mese corrente nell'asse (`null` se fuori), `todayRemaining` il valore di `actual` a quell'indice.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run js/lib/program-calc.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/program-calc.js js/lib/program-calc.test.js
git commit -m "feat(program): burndown aggregato, barre timeline e posizione di Today"
```

---

### Task 3: Pagina, shell, testata e KPI

**Files:**
- Create: `program.html`
- Create: `js/lib/program-guard.test.js`
- Modify: `css/portfolio.css` (sezione `.pg-*` in fondo), `portfolio.html:13` (bump `?v=2`)
- Modify: `js/lib/portfolio-guard.test.js:25-41`, `js/lib/nav-shell-guard.test.js:41`, `js/lib/page-names.test.js:9-27`

**Boards:** `7.5a` righe 86-280 (riga `‹ Project Portfolio`, etichetta `PROGRAM DASHBOARD`, titolo + pillola stadio, riga meta, quattro tile).

**Interfaces:**
- Consumes: `programCurrency`, `programRange`, `projectMetrics`, `programTotals`, `timeElapsed`, `needsAttention` (Task 1).
- Produces: l'app Vue montata su `#app` con i dati `program`, `projects`, `metricsMap`, `currency`, `range`, `attention`, `loading`, `layout` (`'list' | 'timeline'`), `attentionFilter` (bool), e i metodi `goPortfolio()`, `goProjectReporting(id)`, `toggleAttentionFilter()`. I task 4-6 aggiungono sezioni dentro questa app.

- [ ] **Step 1: Write the failing guard test**

```js
// js/lib/program-guard.test.js
const html = readFileSync(join(process.cwd(), 'program.html'), 'utf8');

it('uses the page shell without layout-breaking properties', () => {
  expect(html).toContain('<div id="app-shell">');
  expect(html).toContain('<div id="nav-container"></div>');
  expect(html).toContain('<div id="app-main">');
  expect(html).not.toMatch(/#app-(shell|main)\s*\{[^}]*(overflow|position|transform|filter|contain|will-change)/);
});
it('carries the sidebar head snippet and v-cloak', () => {
  expect(html).toContain("localStorage.getItem('PDash_sidebarCollapsed')");
  expect(html).toMatch(/id="app"[^>]*v-cloak/);
});
it('activates the Portfolio menu entry and the three-level breadcrumb', () => {
  expect(html).toContain('<title>PDash — Portfolio</title>');
  expect(html).toContain("initNav('portfolio'");
  expect(html).toContain("{ label: 'Portfolio', href: '/portfolio.html' }");
});
it('has no emoji, no hex literal and no Intl.NumberFormat', () => {
  expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![^<]*<\/title>)/);
  expect(html).not.toContain('Intl.NumberFormat');
});
it('has no native alert or confirm', () => {
  expect(html).not.toMatch(/\b(alert|confirm)\s*\(/);
});
```

Aggiungere nello stesso file i casi del Review Focus 1 e 3 come asserzioni sul markup: esistono i blocchi `No projects in this program are visible to you.` e il messaggio di burndown assente (`No dated projects in this program`).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run js/lib/program-guard.test.js`
Expected: FAIL — `ENOENT: program.html`.

- [ ] **Step 3: Create `program.html`**

Partire da `portfolio.html:1-22` come modello di head e shell (stessi link `tokens.css?v=9`, `style.css?v=21`, `css/portfolio.css?v=2`, stesso head snippet), **senza** `xlsx`, senza `js/upload.js` e senza l'input file degli actuals. Script in fondo nell'ordine della spec §5. `created()`: legge `programId` dalla query, esegue i due `Promise.all` di caricamento (spec §5), risolve programma e progetti, calcola `metricsMap` e `attention`; `programId` assente/non UUID/programma inesistente → `window.location.href = '/portfolio.html?notice=program-not-found'`; programma esistente con zero progetti visibili → resta e mostra lo stato vuoto.

Markup della testata e delle 4 tile secondo la mappa L1-L9 della spec §8; classi nuove `.pg-*` in `css/portfolio.css`, solo token. La tile `Needs attention` è un `<button type="button">` che chiama `toggleAttentionFilter()`; con zero progetti critici è neutra, mostra `No projects need attention` ed è `disabled`.

- [ ] **Step 4: Update the three existing guards**

`nav-shell-guard.test.js:41` — aggiungere `'program'` a `PAGES`. `portfolio-guard.test.js:25-41` — il test "linked by portfolio.html only" diventa "by portfolio.html and program.html", e il controllo `?v=` sale a `v=2`. `page-names.test.js:9-27` — aggiungere `'program.html': 'portfolio'` e rendere l'asserzione del crumb tollerante all'`href` (cercare `{ label: 'Portfolio'` invece della stringa chiusa), senza indebolirla per le altre pagine.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, compresi i guard aggiornati e `money-guard`.

- [ ] **Step 6: Visual check against board 7.5a**

Run: `node scripts/shoot.mjs` sulla pagina a 1440 (vedi `docs/scripts/shoot.md` per invocazione e credenziali), poi **aprire il PNG e la tavola** e scrivere nel report il confronto testata + 4 tile.

- [ ] **Step 7: Commit**

```bash
git add program.html css/portfolio.css portfolio.html js/lib/program-guard.test.js js/lib/nav-shell-guard.test.js js/lib/portfolio-guard.test.js js/lib/page-names.test.js
git commit -m "feat(program): pagina, shell, testata e KPI"
```

---

### Task 4: Vista List dei progetti

**Files:**
- Modify: `program.html`, `css/portfolio.css`, `js/lib/program-guard.test.js`

**Boards:** `7.5a` righe 555-1200 (card `Projects`, segmentato, otto colonne, riga critica evidenziata, riga `PROGRAM TOTAL`).

**Interfaces:**
- Consumes: `sortProjectRows`, `programTotals`, `spentBarState` (via `window`, la pagina è uno script classico).
- Produces: il computed `rows` (una voce per progetto: `cfg`, `metrics`, `flagged`) e `totals`, consumati anche dal Task 5.

- [ ] **Step 1: Write the failing guard assertions**

Aggiungere a `js/lib/program-guard.test.js`: la tabella ha le otto intestazioni esatte `PROJECT`, `STATUS`, `SOLD`, `SPENT`, `REMAINING`, `CONSUMPTION`, `VS TIME` e la riga `PROGRAM TOTAL`; esistono i testi `No budget`, `No actuals`, `Mixed currencies` (Review Focus 4) e la nota `Task, role and entry analysis is in each project's reporting`; il segmentato ha le due voci `List` e `Timeline`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run js/lib/program-guard.test.js`
Expected: FAIL sulle nuove asserzioni.

- [ ] **Step 3: Implement the List view in `program.html`**

Colonne e formattazione secondo L11-L14 della spec §8: ore in evidenza con l'importo sotto (`formatMoney(value, currency, currencies)`, oppure `Mixed currencies` se `currency === null`), barra `Consumption` di 5px con la **tacca** posizionata a `metrics.timePct`, `vs time` con segno e colore per soglia, azione `Reporting →` che chiama `goProjectReporting(cfg.id)`. Righe critiche con la classe di evidenza. Il filtro `attentionFilter` del Task 3 riduce `rows` ai soli `flagged` e mostra un modo per toglierlo. Media query §12: sotto 1024 nascondere `Remaining` e `vs time`; sotto 768 la tabella diventa elenco di card.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Visual check against board 7.5a at 1440, 1024 and 390**

Aprire PNG e tavola, riportare il confronto colonna per colonna nel report.

- [ ] **Step 6: Commit**

```bash
git add program.html css/portfolio.css js/lib/program-guard.test.js
git commit -m "feat(program): vista List con tacca tempo, vs time e riga Total"
```

---

### Task 5: Vista Timeline

**Files:**
- Modify: `program.html`, `css/portfolio.css`, `js/lib/program-guard.test.js`

**Boards:** `7.5b` per intero (asse mesi, barre, linea Today, legenda).

**Interfaces:**
- Consumes: `timelineBars`, `todayPosition` (Task 2), `rows` (Task 4).
- Produces: niente di nuovo per i task successivi.

- [ ] **Step 1: Write the failing guard assertions**

Aggiungere a `js/lib/program-guard.test.js`: esiste la legenda con i tre testi `Project duration`, `Budget consumed (amber ≥85%, red over sold)`, `Not started`; esiste l'etichetta `Today`; la vista Timeline è nascosta sotto 1024 via media query (la regola `.pg-timeline` compare in `css/portfolio.css` dentro una media query `min-width: 1024px`).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run js/lib/program-guard.test.js`
Expected: FAIL sulle nuove asserzioni.

- [ ] **Step 3: Implement the Timeline in `program.html`**

Griglia con l'asse dei mesi di `range.months`; una riga per barra di `timelineBars(range, rows)`: nome + sottotitolo `Started · 64% consumed`, traccia durata `--surface-medium`, riempimento per `fillPct` colorato da `state`, contorno tratteggiato se `!started`. Linea verticale `Today` posizionata da `todayPosition(range, new Date())` e **omessa** se `null` (Review Focus 5). Click sulla riga = `goProjectReporting(id)`. Sotto 1024 il segmentato sparisce e resta la List.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Visual check against board 7.5b at 1440 and 1024**

- [ ] **Step 6: Commit**

```bash
git add program.html css/portfolio.css js/lib/program-guard.test.js
git commit -m "feat(program): vista Timeline con barre di consumo e linea Today"
```

---

### Task 6: Card Program burndown

**Files:**
- Modify: `program.html`, `css/portfolio.css`, `js/lib/program-guard.test.js`

**Boards:** `7.5a` righe 300-530 (titolo, sottotitolo, legenda, curva, area, marcatore).

**Interfaces:**
- Consumes: `programBurndown` (Task 2); `chartColor(name, fallback)` da copiare nel pattern di `portfolio.html:1384-1386` (Chart.js non risolve `var()`).
- Produces: niente di nuovo.

- [ ] **Step 1: Write the failing guard assertions**

Aggiungere a `js/lib/program-guard.test.js`: esistono il titolo `Program burndown`, il sottotitolo con `Sum of remaining hours across`, le due etichette di legenda `Remaining hours (actual)` e `Remaining hours planned (phasing)`, il messaggio `No dated projects in this program` (Review Focus 3) e il bottone di download PNG; i colori della serie passano da `chartColor('--chart-actual'` e `chartColor('--chart-phasing'`, mai da un esadecimale.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run js/lib/program-guard.test.js`
Expected: FAIL sulle nuove asserzioni.

- [ ] **Step 3: Implement the chart in `program.html`**

Chart.js line chart: `actual` linea piena con area, `planned` tratteggiata (`borderDash`), nessun filtro task, nessun selettore di intervallo (D9). Marcatore `Today`: punto evidenziato a `todayIndex` con etichetta `{todayRemaining}h left · {data}`; se `todayIndex === null` nessun marcatore. Il bottone di download chiama `toBase64Image()` del chart e scarica un PNG chiamato `program-burndown-<nome>.png`. Senza `range` la card mostra il messaggio al posto del canvas.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Visual check against board 7.5a**

- [ ] **Step 6: Commit**

```bash
git add program.html css/portfolio.css js/lib/program-guard.test.js
git commit -m "feat(program): card Program burndown con serie attuale e prevista"
```

---

### Task 7: Punti di ingresso, note sul codice morto e documentazione

**Files:**
- Modify: `portfolio.html:155,156,202,263` (ingressi), `:321-325` (breadcrumb), `:327` (riga programma), `:332-341` (menu fratelli)
- Modify: `api/src/routes/reporting.js:74,122` (solo commenti), `ARCHITECTURE.md:754-755`
- Create: `docs/pages/program.md`
- Modify: `docs/pages/portfolio.md`, `CLAUDE.md`, `docs/js/lib.md`
- Modify: `js/lib/portfolio-guard.test.js` (asserzione sugli ingressi)

**Boards:** `7.4d` (riga programma sopra il titolo e voce in fondo al menu dei fratelli).

**Interfaces:**
- Consumes: la pagina dei task 3-6.
- Produces: nulla di nuovo.

- [ ] **Step 1: Write the failing test**

In `js/lib/portfolio-guard.test.js`: `portfolio.html` non contiene più la stringa `Program Dashboard — coming soon`; contiene tre link `/program.html?programId=`; il blocco del reporting di progetto contiene la voce `Program Dashboard →`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run js/lib/portfolio-guard.test.js`
Expected: FAIL — la stringa "coming soon" è ancora presente.

- [ ] **Step 3: Activate the entry points in `portfolio.html`**

I tre bottoni perdono `disabled` e il `title`, e navigano a `/program.html?programId=' + encodeURIComponent(id)`; dal `pf-shown-filtered` di `:155` sparisce il solo `title`. Nella vista reporting: `dashboardProgramRow` guadagna il link `Program Dashboard →`, il menu dei fratelli la stessa voce in fondo, e la breadcrumb diventa `Portfolio / <Programma> / <Progetto>` con il programma cliccabile quando il progetto ha un `programId`.

- [ ] **Step 4: Annotate the dead endpoints (spec D13)**

Commento di due righe sopra `router.get('/portfolio'` e `router.get('/projects/:id'` in `api/src/routes/reporting.js`: nessuna pagina li chiama, il reporting è calcolato client-side da `portfolio.html`/`program.html`, cancellazione rimandata alla review finale del Portfolio. Stessa nota nella tabella di `ARCHITECTURE.md:754-755`. Nessun cambiamento di comportamento.

- [ ] **Step 5: Write the documentation**

`docs/pages/program.md` nuovo (narrativa della pagina, decisioni D1-D14, limiti noti); `docs/pages/portfolio.md` (ingressi attivati, breadcrumb, foglio condiviso); `CLAUDE.md` (riga nella tabella Pages, `js/lib/program-calc.js` nel File structure, nota sul foglio condiviso fra due pagine); `docs/js/lib.md` (voce `program-calc.js`).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Visual check of the entry points against board 7.4d**

- [ ] **Step 8: Commit**

```bash
git add portfolio.html api/src/routes/reporting.js ARCHITECTURE.md docs/pages/program.md docs/pages/portfolio.md CLAUDE.md docs/js/lib.md js/lib/portfolio-guard.test.js
git commit -m "feat(program): attiva gli ingressi dal Portfolio e documenta il ciclo"
```
