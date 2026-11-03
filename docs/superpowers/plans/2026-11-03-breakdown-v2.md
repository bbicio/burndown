# Project reporting — Breakdown v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-03-breakdown-v2-design.md`
**Branch:** `breakdown-v2`
**Risk class:** high-risk — file condiviso caricato da più pagine: `css/portfolio.css` è caricato anche da `program.html` (PROCESS.md §6.1b); tocca anche moduli `js/lib/`; nessuna migrazione, auth, money o operazione distruttiva

**Goal:** Nella card Breakdown di `portfolio.html?projectId=` un solo blocco Entries condiviso dalle tre viste, con
filtro Role/Resource, ordinamento per colonna, By role espandibile, By area a due livelli, menu che si chiudono fuori
ed Esc, layout tablet e smartphone delle tavole 7.4e–7.4j.

**Architecture:** La logica del blocco (mesi, filtro, sort, opzioni) è pura in `js/lib/report-entries.js`; le
colonne delle task dentro un'area sono una funzione pura nuova in `js/lib/project-report-calc.js`. Il markup del
blocco è il componente Vue `pr-entries` con template `<template id="pr-entries-tpl">` in `portfolio.html`, montato
dalle tre viste. Lo stato vive in `entriesState` (sostituisce `taskDetailState`). Le bottom sheet smartphone sono
offcanvas Bootstrap a livello pagina, legate al blocco attivo.

**Tech Stack:** Vue 3 da CDN (build con compilatore runtime, nessun build step), Bootstrap 5.3 (offcanvas), SheetJS
(`XLSX`), vitest + jsdom, `<ph-icon>`, `<cg-date-picker>`.

**Worktree:** `C:\Users\Fabrizio.Fortini\Progetti\burndown\.claude\worktrees\breakdown-v2`, creato come dice
PROCESS.md §6.1b, poi `.env` copiato dal checkout principale e `npm ci`. Tutti i comandi partono da lì.

**Tavole:** `docs/superpowers/design/project-reporting/7.4e.jpg` … `7.4j.jpg`.

**Indipendenza dei task:** i Task 1 e 2 sono indipendenti fra loro (due moduli puri diversi). I Task 3-7 **non** sono
indipendenti: modificano tutti `portfolio.html` e `css/portfolio.css`, in sequenza, e consumano i Task 1-2.

## Global Constraints

- Nessun build; nginx serve i file così come sono. Template in-DOM: niente `<` nei mustache e nei binding.
- Solo `var(--token)`: nessun hex in `css/portfolio.css` né in `portfolio.html` (guard esistenti).
- Nessuna emoji; icone solo da `js/lib/icons.js` via `<ph-icon>` (SVG `stroke="currentColor"`). Se serve un'icona
  che `icons.js` non ha (`filter`, `arrow-down`, `arrow-up`), si aggiunge lì e si bumpa `icons.js?v=4` → `?v=5` in
  **ogni** pagina che lo carica (grep prima).
- Nessun calcolo di Sold, Spent, Remaining, % o Total cambia: `breakdownRows`, `roleColumns`, `areaColumns`,
  `areaTotalColumn`, `buildSummaryCols` restano identiche.
- Versioni: `css/portfolio.css?v=8` → `?v=9` in `portfolio.html` **e** `program.html`, e la stringa `?v=8` nel test
  "every portfolio.css reference is ?v=8" di `js/lib/portfolio-guard.test.js` nello stesso commit;
  `js/lib/project-report-calc.js?v=3` → `?v=4`; nuovo `js/lib/report-entries.js?v=1`, caricato con
  `<script type="module">` subito dopo `project-report-calc.js`. Un bump per file per ciclo: il primo task che tocca il
  file lo fa, i successivi no.
- Soglie: smartphone `(max-width: 767.98px)` sia in `matchMedia` sia in CSS; tablet `(max-width: 1279.98px)`
  (la stessa del Remaining nascosto).
- Testi utente in inglese, copy esatto del Brief §9: "Entries · N", "Entries · N of M", "N entries" /
  "1 entry", "Role: All", "Resource: All", "Role: …", "N selected", "All", "Clear", "Apply", "Reset",
  "Filter by role", "Filter by resource", "Roles with entries in <period>", "Resources with entries in <period>",
  "N months without matching entries hidden" / "1 month without matching entries hidden", "Sort: …",
  "Sort entries", "Applies inside each month", "Ascending", "Descending", "By area", "N tasks", "N roles",
  "Spent … of …", "Remaining …", "Date", "Role (resource)", "Resource", "Hours", "Amount", "Note", "Export XLS",
  "No entries in the selected period.", "No entries match the selected filters.".
- Etichetta mese: `monthLabelLong(ym)` esistente (già "Sep 2026"); date con `fmtDate`, ore con `fmtH`, importi con
  `formatMoney(v, dashCurrency, currencies)`.
- Durante i task si lanciano solo i file di test toccati (`npx vitest run <file>`), PROCESS.md §6.2.

## Review Focus

1. **Cambio di Period con un filtro attivo che non ha più opzioni** → il filtro torna a "All" e il blocco torna a un
   solo mese aperto, non resta vuoto con "No entries match". Test in Task 1 (`pruneFilter`) e Task 4 (watcher).
2. **Entry senza owner in By role (filtro Resource)** → compare come opzione "—" (valore `''`) filtrabile, non sparisce
   né rompe il conteggio N of M. Test in Task 1.
3. **Amount `null` (ruolo senza tariffa) nell'ordinamento per Amount** → le righe `null` vanno in fondo in entrambe le
   direzioni, a parità per data decrescente. Test in Task 1.
4. **Task che compare in due aree sovrapposte** → in ciascuna area la task mostra solo le entry e le ore dei ruoli che
   quell'area rivendica; la somma delle task di un'area è uguale alla riga d'area. Test in Task 2.
5. **Clic dentro un `<cg-date-picker>` inline del Custom range** → non chiude il menu Period (il popover del picker sta
   dentro il menu nel DOM). Verifica in Task 3 con un test jsdom sul metodo di dismiss.

---

### Task 1: Logica pura del blocco Entries

**Files:**
- Create: `js/lib/report-entries.js`
- Test: `js/lib/report-entries.test.js`

**Interfaces:**
- Produces (ES module, ognuna con bridge `window.<nome>`):
  - `defaultSort()` → `{ key: 'date', dir: 'desc' }`
  - `nextSort(sort, key)` → `{ key, dir }`; `key` ∈ `'date'|'who'|'hours'|'amount'`
  - `filterOptions(entries, kind)` → `[{ value: string, hours: number }]`, ore decrescenti, parità per `value`
  - `pruneFilter(filter, options)` → `string[]`
  - `entriesBlock(entries, state, rateFor)` → `{ total, shown, months: [{ ym, count, hours, amount, rows, open }], hiddenMonths }`
    con `state = { filter: string[], filterKind: 'role'|'resource', sort, openMonth: string|null, closedMonths: string[] }`;
    `ym` nel formato `'YYYY-MM'` di `entriesByMonth`; ogni riga di `rows` è l'entry con `amount` aggiunto.
  - `filterChipLabel(filter, kind)` → `'Role: All'` | `'Role: PM, Analyst'` | `'Role: 3 selected'` (stesso schema con `Resource`)
  - `entryValue(entry, kind)` → `entry.role` per `'role'`, `entry.owner || ''` per `'resource'`

- [ ] **Step 1: Write the failing tests** in `js/lib/report-entries.test.js` (fixture: entry `{ date: new Date(...), role, owner, hours, notes }`, `rateFor = r => r.role === 'NoRate' ? null : 100`):
  - `nextSort`: da default, `'hours'` → `{hours, asc}`; ancora `'hours'` → `{hours, desc}`; `'date'` da `{hours, desc}` → `{date, asc}`.
  - `filterOptions(entries, 'role')`: ruoli unici con ore sommate, ordinati per ore decrescenti; con `'resource'` un'entry senza owner produce `{ value: '', hours }` (Review Focus 2).
  - `pruneFilter(['PM', 'Gone'], [{value:'PM'}])` → `['PM']`; `pruneFilter(['Gone'], [{value:'PM'}])` → `[]` (Review Focus 1).
  - `entriesBlock` senza filtro, `openMonth: null`: mesi dal più recente, solo il primo `open`; con `openMonth: '2026-08'` presente, solo quello; con `openMonth: ''`, nessuno; `total === shown`.
  - `entriesBlock` con `filter: ['PM']`: mesi senza PM esclusi, `hiddenMonths` = quanti; tutti i mesi restanti `open` tranne quelli in `closedMonths`; `count/hours/amount` del mese sulle sole righe filtrate; `total` = tutte, `shown` = filtrate.
  - Ordinamento `{hours, desc}` dentro ogni mese, parità per data decrescente; i mesi restano in ordine cronologico decrescente.
  - Ordinamento `{amount, asc}` e `{amount, desc}`: le righe con `amount === null` in fondo in entrambi i casi (Review Focus 3).
  - Ordinamento `{who, asc}` con `filterKind: 'role'` per `role (owner)`, con `'resource'` per `owner`; confronto `localeCompare` case-insensitive.
  - `filterChipLabel([], 'role')` → `'Role: All'`; `(['PM','Analyst'],'role')` → `'Role: PM, Analyst'`; tre valori → `'Role: 3 selected'`; `(['Marco'],'resource')` → `'Resource: Marco'`; `([''],'resource')` → `'Resource: —'`.
- [ ] **Step 2:** `npx vitest run js/lib/report-entries.test.js` → FAIL (modulo assente).
- [ ] **Step 3: Implement** `js/lib/report-entries.js`. Il raggruppamento per mese riusa `entriesByMonth` importato con `import { entriesByMonth } from './project-report-calc.js?v=4';`, poi filtra/ordina le `rows` di ogni mese e ricalcola `count/hours/amount` sulle righe filtrate (somma `amount ?? 0`, come `entriesByMonth`). Etichetta `who` = `role + (owner ? ' (' + owner + ')' : '')` per `'role'`.
- [ ] **Step 4:** `npx vitest run js/lib/report-entries.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(report): pure Entries block logic (months, filter, sort)`.

### Task 2: Colonne delle task dentro un'area

**Files:**
- Modify: `js/lib/project-report-calc.js` (vicino ad `areaColumns`, :180-215; bridge in fondo)
- Modify: `portfolio.html:700` (`?v=3` → `?v=4`)
- Test: `js/lib/project-report-calc.test.js`

**Interfaces:**
- Produces: `areaTaskColumns(data, cfg, filterRange, deps, groupIndex)` → `[{ task, label, soldHours, soldEur, totalConsumed, totalConsumedEur, inPeriod, inPeriodEur, roles, soldKnown }]`
  - `groupIndex`: indice in `cfg.groups`, oppure `'ungrouped'` (ciò che nessun gruppo rivendica);
  - una colonna per ogni task di `billableTasks(cfg)` in ordine, inclusa solo se l'area rivendica almeno una sua risorsa o entry;
  - `claims(x) = entryMatchesRow(groupEntries[groupIndex], x.role, x.task) && x.task.toLowerCase() === task.name.toLowerCase()`, calcolata con l'`areaColumn` privato esistente; `roles` = numero di ruoli distinti rivendicati (risorse configurate più ruoli solo loggati), per il sottotitolo "N roles";
  - `soldKnown: false` (e `soldHours/soldEur: null`) quando la colonna non ha risorse configurate, come la riga Ungrouped di `areaColumns`.
- Produces anche: `areaEntryClaims(cfg, groupIndex)` → `(role, task) => boolean`, lo stesso predicato, per filtrare le entry del blocco in Task 5.

- [ ] **Step 1: Write the failing tests** in `project-report-calc.test.js`, nuovo `describe('areaTaskColumns')`, sulla fixture già usata da "Breakdown totals agree across views (B-073)":
  - per ogni area (e per `'ungrouped'` quando `areaColumns` la emette), la somma di `soldHours`, `totalConsumed`, `inPeriod` (con e senza `filterRange`) sulle colonne delle task è uguale alla colonna d'area corrispondente di `areaColumns` (tolleranza `1e-9`);
  - fixture con una task rivendicata da due aree per ruoli diversi: in ciascuna area la colonna di quella task conta solo i ruoli dell'area (Review Focus 4);
  - un'area con gruppo legacy `roles: ['X']` (wildcard) produce una colonna per ogni task in cui X ha risorse o entry;
  - `areaEntryClaims(cfg, i)(role, task)` concorda con le colonne (una entry conta nella task-colonna sse il predicato è vero).
- [ ] **Step 2:** `npx vitest run js/lib/project-report-calc.test.js` → FAIL sui nuovi test, i test B-073 esistenti PASS.
- [ ] **Step 3: Implement** `areaTaskColumns` e `areaEntryClaims` riusando `reportRows`, `normalizeGroupEntries`, `entryMatchesRow`, `areaColumn`; aggiungere i due bridge `window.*`. Bumpare `project-report-calc.js?v=4` in `portfolio.html` (grep: nessun'altra pagina lo carica; verificarlo).
- [ ] **Step 4:** `npx vitest run js/lib/project-report-calc.test.js` → PASS tutto.
- [ ] **Step 5: Commit** `feat(report): per-task columns inside a functional area`.

### Task 3: Menu Period come popover Vue (clic fuori, Esc)

**Files:**
- Modify: `portfolio.html:539-559` (menu Period), `:1362-1366` (`pickPeriod`), `data()` :734-739, `beforeUnmount` :1271
- Modify: `css/portfolio.css:567-585` (`.pr-period-menu`, ora posizionato da noi)
- Test: `js/lib/portfolio-guard.test.js`

**Interfaces:**
- Produces (metodi della pagina, riusati dal filtro desktop in Task 4 e dalle sheet in Task 6):
  - `data.openMenu: null | 'period' | 'filter:<blockKey>'`
  - `toggleMenu(name, btnEl)`, `closeMenu(restoreFocus = true)`: aprire aggiunge un listener `mousedown` su `document` e `keydown` (Esc) su `document`; chiudere li rimuove e, con `restoreFocus`, rimette il focus sul pulsante salvato.
  - `isInsideMenu(target)` → `true` se `target` sta dentro l'elemento del menu aperto (`[data-menu="<name>"]`) o nel suo pulsante (`[data-menu-btn="<name>"]`).

**Boards:** 7.4e (pulsante Period in alto a destra, stato chiuso).

- [ ] **Step 1: Write the failing guard tests** in `portfolio-guard.test.js` (`describe('Breakdown v2 — menus')`): lo slice della card non contiene più `data-bs-toggle="dropdown"` sul Period; contiene `data-menu="period"` e `data-menu-btn="period"`; il metodo `pickPeriod` non contiene `bootstrap.Dropdown`; esiste `closeMenu(` e in `beforeUnmount` c'è la rimozione dei listener.
- [ ] **Step 2:** `npx vitest run js/lib/portfolio-guard.test.js` → FAIL sui nuovi.
- [ ] **Step 3: Implement.** Il pulsante Period chiama `toggleMenu('period', $event.currentTarget)`, `aria-expanded` legato a `openMenu === 'period'`, `aria-haspopup="true"`; il menu è `v-if="openMenu === 'period'"` posizionato in assoluto sotto il pulsante, allineato a destra (stesso aspetto di oggi: 320px). `pickPeriod` imposta il periodo e chiama `closeMenu()`. I `<cg-date-picker inline-popover>` restano dentro il menu, quindi un loro clic è "dentro" (Review Focus 5). Gli handler si salvano su `this._menuDocHandlers` e `beforeUnmount` li rimuove.
- [ ] **Step 4:** `npx vitest run js/lib/portfolio-guard.test.js` → PASS. Il Review Focus 5 si verifica a mano nel Task 7 (Decisione 2).
- [ ] **Step 5: Commit** `feat(portfolio): Period menu closes on outside click and Esc`.

### Task 4: Componente `pr-entries` e By task

**Files:**
- Modify: `portfolio.html` — markup Entries :628-657 sostituito da `<pr-entries>`; nuovo `<template id="pr-entries-tpl">` subito dopo la chiusura di `#app` (fuori dal mount root); registrazione accanto a `.component('cg-date-picker', …)` :1712; `data()` `taskDetailState` → `entriesState`; `taskState`/`toggleTask`/`toggleMonth` → `blockState`/`toggleBlock`; `exportTaskEntriesXls` → `exportEntriesXls`; `showDashboard` :1559; `<script type="module" src="js/lib/report-entries.js?v=1">` dopo :700.
- Modify: `css/portfolio.css:630-672` (entries) e la riga `?v=8` → `?v=9` in `portfolio.html:13` e `program.html:13`.
- Test: `js/lib/portfolio-guard.test.js`, `TEST_CASES.md` (R-54 aggiornata in Task 7)

**Interfaces:**
- Consumes: Task 1 (`entriesBlock`, `filterOptions`, `nextSort`, `defaultSort`, `filterChipLabel`, `entryValue` via `window`), Task 3 (`toggleMenu`, `closeMenu`, `openMenu`).
- Produces:
  - `blockState(key)` → `{ expanded: false, openMonth: null, closedMonths: [], filter: [], sort: defaultSort() }`, creato al primo accesso in `entriesState[key]`; chiavi `task:<taskName>`, `role:<role>|<task>`, `area:<groupIndex|'ungrouped'>|<task>`.
  - `toggleBlock(key)`.
  - `blockEntries(key)` → le entry del blocco nel Period (per `task:` = `taskDetailByName[name].periodData`; gli altri prefissi li aggiunge il Task 5).
  - `exportEntriesXls(rows, rateFor, kind, fileName)`: aoa `['Date', kind === 'resource' ? 'Resource' : 'Role (resource)', 'Hours', 'Amount', 'Note']`, righe per data crescente, importo numerico arrotondato a 2 decimali o `''`, `XLSX.writeFile(wb, fileName)`; By task passa `'task_' + name.replace(/[^a-zA-Z0-9]/g, '_') + '_entries.xlsx'` (nome di oggi).
  - Componente `pr-entries` — props: `entries: Array`, `rateFor: Function`, `filterKind: String`, `state: Object`, `periodLabel: String`, `currency: String`, `currencies: Array`, `isPhone: Boolean`, `blockKey: String`, `menuOpen: Boolean`; emits: `export`, `toggle-menu` (payload: pulsante), `open-sheet` (`'filter' | 'sort'`). Dentro, `computed.block = entriesBlock(entries, { ...state, filterKind }, rateFor)` e `computed.options = filterOptions(entries, filterKind)`; muta solo `state` (oggetto reattivo del genitore) per mesi, sort, filtro.
  - Watcher di pagina su `filterRange`: per ogni chiave di `entriesState` con `filter.length`, `state.filter = pruneFilter(state.filter, filterOptions(blockEntries(key), kind))`; se diventa `[]`, `closedMonths = []` e `openMonth = null`.

**Boards:** 7.4e (riferimento principale: filtro Role attivo, tutti i mesi aperti, Hours ↓, footer mesi nascosti), 7.4f (menu filtro aperto: titolo, All, ore, nota in fondo).

- [ ] **Step 1: Write the failing guard tests** in `portfolio-guard.test.js` (`describe('Breakdown v2 — Entries block')`), leggendo anche lo slice `<template id="pr-entries-tpl">` … `</template>`:
  - il template contiene il copy: `Entries ·`, ` of `, `Export XLS`, `No entries in the selected period.`, `No entries match the selected filters.`, `Clear`, `months without matching entries hidden`, `Filter by role`, `Filter by resource`, `with entries in`, `Role (resource)`, `Resource`, `Hours`, `Amount`, `Note`;
  - il template contiene `aria-sort`, almeno un `<button` dentro `<th`, `aria-expanded` e `aria-controls` sul pulsante del mese; nessuna emoji né hex;
  - lo slice della card usa `<pr-entries` e non contiene più `taskEntries(`;
  - il test "resets the period filter and the task expansion on a project switch" si aggiorna a `this.entriesState = {};`;
  - il test "makes the task, excluded and month rows keyboard-operable" diventa: zero `@keydown.enter.space.prevent=` nella vista, e le righe task/escluse hanno un `<button` con `aria-expanded` e `aria-controls`;
  - "every portfolio.css reference is ?v=8" → `?v=9`; `portfolio.html` carica `js/lib/report-entries.js?v=1`.
- [ ] **Step 2:** `npx vitest run js/lib/portfolio-guard.test.js` → FAIL sui nuovi/aggiornati.
- [ ] **Step 3: Implement il componente.** Struttura del template (desktop):
  - header: `Entries · {{ block.shown }}` o `Entries · {{ block.shown }} of {{ block.total }}` quando `state.filter.length`; chip `<button>` con icona filtro, `filterChipLabel`, chevron, classe `pr-period-active` quando attivo, `data-menu-btn="filter:<blockKey>"`; link "Clear" se attivo (svuota `filter`, `closedMonths = []`, `openMonth = null`); link "Export XLS" se `entries.length`;
  - menu filtro (`v-if="menuOpen && !isPhone"`, `data-menu="filter:<blockKey>"`): titolo "Filter by role"/"Filter by resource", riga "All" (spuntata con filtro vuoto; spuntarla svuota il filtro) e una riga checkbox per opzione con `fmtH(hours)` a destra (valore `''` mostrato come "—"), nota "Roles with entries in {{ periodLabel }}" / "Resources …"; frecce ↑/↓ spostano il focus fra le checkbox, Space le alterna (comportamento nativo), Esc lo gestisce `closeMenu`. Applicare un filtro da vuoto azzera `closedMonths`;
  - mesi: `<button class="pr-entries-month" :aria-expanded :aria-controls="blockKey + '-' + m.ym">` con chevron, `monthLabelLong(m.ym)`, "N entries"/"1 entry", ore, importo; senza filtro il clic imposta `openMonth` a `m.ym` o a `''` se era aperto; con filtro alterna `m.ym` in `closedMonths`;
  - tabella del mese aperto, `id = blockKey + '-' + m.ym`; `th` di Date, who, Hours, Amount con `<button>` che chiama `state.sort = nextSort(state.sort, key)`, freccia `<ph-icon>` solo sulla colonna attiva (classe `active`, colore `var(--brand-navy)`), `aria-sort="ascending|descending|none"` sul `th`; Note non ordinabile; colonna who = "Role (resource)" o "Resource" secondo `filterKind`, cella `e.role (e.owner)` o `e.owner || '—'`;
  - footer con filtro: "N months without matching entries hidden" (singolare con 1) quando `block.hiddenMonths`;
  - vuoti: `entries.length === 0` → "No entries in the selected period."; filtro senza risultati → "No entries match the selected filters." + "Clear".
  I metodi `fmtH`, `fmtDate`, `formatMoney`, `monthLabelLong` del componente delegano ai globali (`window.fmtH` …; `monthLabelLong` copiato dalla pagina come funzione del componente).
- [ ] **Step 4: Implement l'integrazione By task.** Righe task ed escluse: chevron e nome dentro `<button class="pr-bd-toggle" :aria-expanded :aria-controls="'blk-' + key">`, unico handler di espansione, largo quanto le prime due tracce della griglia (Decisione 3); il `@click` e il `role="button"` sulla riga si tolgono; i ruoli indentati restano; sotto, `<pr-entries :id="'blk-' + key" filter-kind="role" …>`. `showDashboard` azzera `this.entriesState = {}`. CSS: chip filtro, menu filtro (stile `.pr-period-menu`), `th` ordinabili, footer, indentazione 24px per livello come `.pr-bd-subrow`.
- [ ] **Step 5:** `npx vitest run js/lib/portfolio-guard.test.js js/lib/report-entries.test.js js/lib/project-report-calc.test.js` → PASS.
- [ ] **Step 6:** Confrontare il markup con 7.4e e 7.4f (aprire le immagini), elencare gli scostamenti nel messaggio di chiusura del task.
- [ ] **Step 7: Commit** `feat(portfolio): shared Entries block with role filter and sorting (By task)`.

### Task 5: By role espandibile e By area a due livelli

**Files:**
- Modify: `portfolio.html` — `breakdownBase` :1116-1138, `breakdownItems` :1144-1157, markup righe :574-659, `blockEntries`
- Modify: `css/portfolio.css` (sotto-righe d'area)
- Test: `js/lib/portfolio-guard.test.js`

**Interfaces:**
- Consumes: Task 2 (`areaTaskColumns`, `areaEntryClaims`), Task 4 (`blockState`, `toggleBlock`, `blockEntries`, `exportEntriesXls`, `pr-entries`).
- Produces:
  - item `kind: 'row'` con `blockKey` (`task:…` in By task, `role:<role>|<task>` in By role, `area:<i|'ungrouped'>` in By area) al posto di `taskName` come condizione di espandibilità;
  - in By area, per un'area espansa, item `kind: 'area-task'` con `blockKey: 'area:<i>|<task>'`, `row` da `breakdownRows(areaTaskColumns(...), hasFilter).rows` (passati da `withoutSold` quando `breakdownNoBudget` o `soldKnown === false`), sottotitolo `N roles` / `1 role`;
  - `blockEntries('role:R|T')` = `periodData` della task T con `role.toLowerCase() === R.toLowerCase()`; `blockEntries('area:i|T')` = `periodData` della task T filtrata con `areaEntryClaims(cfg, i)(r.role, T)`;
  - `toggleBlock` su una chiave `area:i|T` che si apre chiude le altre `area:i|*` aperte (stato conservato).

**Boards:** 7.4f (By role, riga espansa, colonna "Resource"), 7.4g (area → task aperta → Entries; sottotitoli "3 tasks · …", "3 roles").

- [ ] **Step 1: Write the failing guard tests:** in By role il componente è montato con `filter-kind="resource"`; il sottotitolo area usa `N tasks`; c'è un `kind === 'area-task'` nel template; il file di export By role è `'role_'` e By area `'area_'`.
- [ ] **Step 2:** `npx vitest run js/lib/portfolio-guard.test.js` → FAIL.
- [ ] **Step 3: Implement.** By role: ogni riga espandibile (anche `soldKnown === false`), dentro solo `<pr-entries filter-kind="resource">`; sottotitolo invariato (`roleSubtitle` dà già "risorse · task"). By area: area espandibile; sottotitolo area `<N> tasks · <task, …>` (`groupSubtitle` esistente prefissato dal conteggio delle colonne di `areaTaskColumns`; Ungrouped resta "Not in any functional area"); task indentate con le stesse colonne e "Over sold"; task espansa → `<pr-entries filter-kind="role">` direttamente, senza ruoli. Export: `'role_' + role + '_' + task + '_entries.xlsx'` e `'area_' + areaName + '_' + task + '_entries.xlsx'`, caratteri non alfanumerici → `_`. Area senza entry: espandibile, il blocco mostra il messaggio del Period.
- [ ] **Step 4:** `npx vitest run js/lib/portfolio-guard.test.js js/lib/project-report-calc.test.js` → PASS (i test B-073 non cambiano).
- [ ] **Step 5:** Confrontare con 7.4f e 7.4g, elencare gli scostamenti.
- [ ] **Step 6: Commit** `feat(portfolio): expandable By role rows and two-level By area`.

### Task 6: Tablet e smartphone

**Files:**
- Modify: `portfolio.html` — `data.isPhone` + `matchMedia('(max-width: 767.98px)')` in `mounted` (listener rimosso in `beforeUnmount`), segmented label, riga "Spent X of Y · Remaining Z" nelle righe, tre offcanvas a livello pagina dopo `#app` (accanto ai modali), template `pr-entries` (chip Sort, Export a icona, entry a card)
- Modify: `css/portfolio.css` — blocchi `@media (max-width: 1279.98px)` e `@media (max-width: 767.98px)`
- Test: `js/lib/portfolio-guard.test.js`

**Interfaces:**
- Consumes: Task 3 (Period), Task 4 (`pr-entries` emits `open-sheet`, `blockState`), Task 1 (`filterOptions`, `defaultSort`).
- Produces: `data.sheet = { kind: 'filter'|'sort'|'period'|null, blockKey, kindOfFilter, draftFilter: string[], draftSort }`; `openSheet(kind, blockKey)`, `applySheet()`, `resetSheet()` (Clear per il filtro → `[]`, Reset per il sort → `defaultSort()`); offcanvas `#prFilterSheet`, `#prSortSheet`, `#prPeriodSheet` (`offcanvas offcanvas-bottom pr-sheet`), aperti con `bootstrap.Offcanvas.getOrCreateInstance(el).show()`.

**Boards:** 7.4h (tablet 1024: Note sotto Date/Role, filtro Resource attivo), 7.4i (smartphone: righe a card, segmented "By task / By role / By area", Period "Whole project", sheet filtro), 7.4j (smartphone: By area, entry a card, chip Role e Sort, Export a icona, indentazione 12px). Riferimento per lo stile delle sheet: `css/pipeline.css:235-253` (`.pb-sheet`), senza importarlo.

- [ ] **Step 1: Write the failing guard tests:** esistono `#prFilterSheet`, `#prSortSheet`, `#prPeriodSheet` con classe `offcanvas-bottom`; copy "Sort entries", "Applies inside each month", "Ascending", "Descending", "Reset", "Apply", "By area"; `portfolio.css` contiene `max-width: 767.98px` e `max-width: 1279.98px`; la stringa `767.98px` compare in `matchMedia` in `portfolio.html`.
- [ ] **Step 2:** `npx vitest run js/lib/portfolio-guard.test.js` → FAIL.
- [ ] **Step 3: Implement tablet** (≤1279.98px): nelle tabelle Entries la Note va su una seconda riga sotto Date/who (`tr` a griglia con aree `date who hours amount` / `note note . .`; la `th` Note nascosta). Remaining resta nascosto come oggi.
- [ ] **Step 4: Implement smartphone** (≤767.98px):
  - righe principali a card: titolo + "Over sold" sulla stessa riga, sottotitolo, barra + %, riga `Spent <b>X</b> of Y` · `Remaining <b>Z</b>` (elemento `.pr-bd-phone-line` presente nel markup, nascosto sopra 768px); le colonne numeriche nascoste;
  - segmented a 3 colonne uguali: con `isPhone` l'ultimo bottone dice "By area";
  - Period: con `isPhone` il pulsante mostra solo `periodLabel` e apre `#prPeriodSheet` (stesso contenuto del menu: Whole project, mesi con ore, Custom range); scegliere un mese applica e chiude;
  - `pr-entries` con `isPhone`: chip filtro e chip `Sort: <Date|Role|Resource|Hours|Amount> ↓/↑` che emettono `open-sheet`; Export come `<button>` icona 36px con `aria-label="Export XLS"`; header mese solo "N entries" e ore; entry a card (data + ore in alto, who e importo sotto, nota in fondo se presente);
  - `#prFilterSheet`: titolo "Filter by role"/"Filter by resource", sottotitolo "… with entries in <period>", righe checkbox 48px con ore, "Clear" e "Apply"; `#prSortSheet`: titolo "Sort entries", nota "Applies inside each month", campo a radio (Date, Role (resource)/Resource, Hours, Amount), Ascending/Descending, "Reset" e "Apply"; Apply copia la bozza in `blockState(blockKey)` (filtro nuovo da vuoto → `closedMonths = []`);
  - target ≥ 44px; chip 36px con hit area estesa (`::after` con `inset: -4px 0`); By area indentazione 12px per livello.
- [ ] **Step 5:** `npx vitest run js/lib/portfolio-guard.test.js` → PASS.
- [ ] **Step 6:** Confrontare con 7.4h, 7.4i, 7.4j, elencare gli scostamenti.
- [ ] **Step 7: Commit** `feat(portfolio): Breakdown v2 tablet and smartphone layouts`.

### Task 7: Documentazione, casi di test e verifica visiva

**Files:**
- Modify: `docs/pages/portfolio.md` (nuova sezione "Breakdown v2"; rimuovere/aggiornare la regola "By role / By functional area non espandibili" e "all months closed")
- Modify: `TEST_CASES.md` (§5: R-54 aggiornata, nuove righe R-xx in coda alla sezione) e il conteggio in `js/lib/test-cases-parse.test.js` se lo pinna
- Test: `js/lib/test-cases-parse.test.js`

**Boards:** tutte, 7.4e–7.4j.

- [ ] **Step 1:** Sezione "Breakdown v2" in `docs/pages/portfolio.md`: blocco `pr-entries` e dove è montato, chiavi di `entriesState` e quando si azzera, regole di mesi/filtro/sort, export per blocco (Period sì, filtro e sort no), menu Vue al posto del dropdown Bootstrap, `areaTaskColumns`, breakpoint, scostamenti accettati in Task 7 Step 4 con il motivo (PROCESS.md §6.6.5). Una regola per frase, senza numeri contati (CLAUDE.md "Writing documentation").
- [ ] **Step 2:** `TEST_CASES.md`: R-54 riscritta (un mese aperto di default, sort, filtro); nuove righe per: chiusura menu (clic fuori, Esc, clic nel calendario del Custom range non chiude); filtro Role con tutti i mesi aperti e footer; cambio Period che svuota il filtro; By role espandibile con filtro Resource; By area due livelli con una task aperta per area; persistenza fra viste e reset al cambio progetto; export che ignora il filtro; tablet Note sotto la riga; smartphone card, sheet filtro/sort/Period. `npx vitest run js/lib/test-cases-parse.test.js` → PASS.
- [ ] **Step 3: Verifica visiva**, eseguita dal coordinatore (PROCESS.md §6.6.3). `scripts/test-branch.sh up` dal worktree, poi `node scripts/shoot.mjs --base http://localhost:8081 --settle 3000 --url "/portfolio.html?projectId=<id di BERMITS Maintenance 2026>"`, stati via `--eval-file` nella cartella scratch (proxy `document.querySelector('#app')._vnode.component.proxy`, attesa su `.pr-bd-item`):
  - 1440: By task con Project Management espanso e filtro Role = Marketing Coordinator, sort Hours ↓ (7.4e, `--full`); By role con una riga espansa e menu Resource aperto (7.4f); By area con un'area e una task aperte (7.4g);
  - 1024: By role espansa con filtro Resource (7.4h);
  - 390: By task con sheet filtro aperto (7.4i); By area con task aperta, entry a card (7.4j, `--full`); sheet Sort aperta; sheet Period aperta.
- [ ] **Step 4:** Rileggere ogni PNG con `Read`, confrontarlo con la tavola, presentare gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra (PROCESS.md §6.6.5) e attendere la decisione. Con `--eval` misurare a 390 `document.documentElement.scrollWidth <= 390` e che ogni target interattivo visibile di card e sheet misuri ≥ 44px di altezza (chip: ≥ 36px più hit area), riportando i numeri in un overlay `<pre>`.
- [ ] **Step 5: Commit** `docs(portfolio): Breakdown v2 page notes and test cases`. Lo stack di branch resta acceso per il Gate 2 di `/finish-cycle`.

---

## Decisioni aperte

1. **`areaTaskColumns` calcolata con l'`areaColumn` esistente e un predicato "area ∧ task", non sommando le colonne di
   `roleColumns`.** Alternativa scartata: la somma di `roleColumns` filtrate, come scrive la Spec §7.3. Perché: è la
   stessa somma sugli stessi dati, ma `areaColumn` rivendica anche i ruoli solo loggati senza ricostruire chiavi, e il
   test di Task 2 pinna l'uguaglianza con la riga d'area.
2. **Il Review Focus 5 (clic nel calendario del Custom range) si verifica a mano nel Task 7, non con un test jsdom.**
   Alternativa scartata: estrarre `isInsideMenu` in `js/lib/`. Perché: è un `contains` sul DOM della pagina, e un modulo
   per una riga non si giustifica.
3. **Un solo handler di espansione, sul `<button>` che copre chevron e nome, invece del clic su tutta la riga.**
   Alternativa scartata: riga intera cliccabile più `<button>` interno. Perché: due handler sullo stesso gesto sono la
   fonte classica di doppio toggle, e il pulsante largo quanto le prime due tracce copre l'area che le tavole mostrano
   cliccabile.
4. **Le tre bottom sheet sono offcanvas a livello pagina legati al blocco attivo, non una sheet per blocco.**
   Alternativa scartata: offcanvas dentro `pr-entries`. Perché: un blocco per riga espansa moltiplicherebbe gli
   offcanvas nel DOM.
