# Resource Planning v2 — ciclo 2 (smartphone) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-03-planning-redesign-mobile-design.md`
**Branch:** `planning-redesign-mobile`
**Risk class:** standard — tocca un modulo `js/lib/` (`planning-rows.js`), caricato solo da `planning.html`; nessuna categoria `high-risk` (nessuna migrazione, auth, money, file condiviso da più pagine, operazione distruttiva)

**Goal:** Sotto i 768px `planning.html` diventa una pagina di consultazione: card per riga padre, stepper di periodo,
filtri in un bottom sheet, Team assistant a schermo intero. Sopra i 768px non cambia niente.

**Architecture:** Helper puri nuovi in `js/lib/planning-rows.js` (conteggio foglie, mini-barra, stepper, badge filtri).
`planning.html` aggiunge `isPhone` e, con `isPhone`, rende `.pl-cards` invece di `.pl-grid` sugli stessi `displayRows`.
Il pannello `#plFiltersPanel` viene riposizionato in basso con il solo CSS. Tutto lo stile nuovo sta nel blocco
`@media (max-width: 767.98px)` di `css/planning.css`.

**Tech Stack:** Vue 3 da CDN (nessun build), Bootstrap 5.3 (offcanvas, dropdown), vitest + jsdom, `<cg-date-picker>`,
`<ph-icon>`.

**Worktree:** `C:\Users\Fabrizio.Fortini\Progetti\burndown\.claude\worktrees\planning-redesign-mobile`, creato come
dice PROCESS.md §6.1b, poi `.env` copiato dal checkout principale e `npm ci`. Tutti i comandi partono da lì.

**Tavole:** `docs/superpowers/design/planning/9.9a.jpg` e `9.9b.jpg`, parte destra (390×844). Riferimento per i colori
di carico e "Needs owner": `9.8c.jpg`; per i tre livelli di By project: `9.8b.jpg`.

**Indipendenza dei task:** i task **non** sono indipendenti. I Task 2-5 modificano tutti `planning.html` e
`css/planning.css`, in sequenza, e ognuno consuma gli helper del Task 1.

## Global Constraints

- Nessun build; nginx serve i file così come sono.
- Solo `var(--token)`: nessun hex in `css/planning.css` né in `planning.html` (`content-surface-guard.test.js`).
- Template in-DOM: niente `<` nei mustache e nelle espressioni di binding.
- Nessuna emoji o glifo-icona nella pagina; icone solo da `js/lib/icons.js` via `<ph-icon>`.
- Versioni: `css/planning.css?v=1` → `?v=2` e `js/lib/planning-rows.js?v=1` → `?v=2` in `planning.html`; la stringa
  `css/planning.css?v=1` in `js/lib/content-surface-guard.test.js:296` diventa `?v=2` nello stesso commit. Gli import di
  `planning-rows.js` restano `./planning-calc.js?v=5` e `./dates.js?v=4`.
- Soglia smartphone: esattamente `(max-width: 767.98px)`, sia in `matchMedia` sia in CSS.
- Sopra i 768px il markup visibile e il comportamento sono quelli del ciclo 1.
- Testi utente in inglese, copy esatto della Spec: "Filters", "Close", "Show results", "{n} assignment"/"{n}
  assignments", "Sold {h}", "{h} to plan", "TOTAL · {n} ASSIGNMENTS", "Current month · planned", "Current week ·
  planned", "Actuals", "Planned", "Previous period", "Next period".
- Target interattivi ≥ 44px sotto i 768px.
- `modelRequest`, `loadModel`, i filtri, `openIds`/`search`/`suppressed`, `exportCurrentView` e la logica del Team
  assistant restano invariati nel comportamento.
- Durante i task si lanciano solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- File modificati solo con il tool Edit o con uno script scritto su file; mai `Get-Content`/`Set-Content`, mai
  `node -e`, mai `sed` con testo quotato.
- Validazione rapida del template: `@vue/compiler-dom` in una cartella temporanea fuori dal repo, su `#planningApp`
  parsato da jsdom (come nel ciclo 1).

## Review Focus

1. **La finestra si accorcia sotto l'indice scelto** (preset 3 months con lo stepper sul 6° periodo, o il modello che
   arriva con meno periodi): lo stepper torna al corrente o al primo, mai un indice oltre la fine né celle `undefined`.
   Test `clampPeriodIdx` in Task 1, watcher in Task 2.
2. **Ricerca attiva:** "{n} assignments" resta il conteggio sulle righe non filtrate (`activeRows.rows`) e non cambia
   mentre si scrive. Test `leafCounts` in Task 1 (calcolato sulle righe intere), uso in Task 3.
3. **Riga con tutte le ore a zero, o finestra Weekly lunga (Whole range):** la mini-barra non divide per zero e non
   esce dalla card. Test `miniBar` tutto-zero in Task 1; scatto Weekly + Whole range a 390px in Task 6.
4. **Popover Projects/Team aperti dentro il bottom sheet:** il menu resta dentro il sheet e scorre con lui, senza
   uscire dallo schermo. Regola CSS in Task 4, scatto in Task 6.
5. **Rotazione o resize attraverso i 768px con il sheet o il Team assistant aperti:** nessuno stato rotto. Il pannello
   resta aperto e si riposiziona, e `isPhone` segue il `change`. Caso manuale in `TEST_CASES.md` (Task 6).

---

### Task 1: Helper puri e characterization

**Boards:** `9.9a.jpg` (card: conteggio, mini-barra, stepper)

**Files:**
- Modify: `js/lib/planning-rows.js` (aggiunte in coda; nessuna funzione esistente cambia)
- Modify: `planning.html` (computed `activeFilterCount`, `:781-783`, e `<script src="js/lib/planning-rows.js?v=1">`, `:389`)
- Test: `js/lib/planning-rows.test.js`

**Interfaces:**
- Produces (esportati e con il bridge `window.<name>` come gli altri export del modulo):
  - `countActiveFilters({ pipelineFilters: Set, projectFilters: Set, teamFilters: Set, monthlyPulse: boolean, roundHours: boolean, search: string }) → number`
  - `leafCounts(rows) → Map<string, number>`: per ogni riga con figli, il numero di righe discendenti senza figli; le foglie non compaiono nella mappa.
  - `miniBar(cells) → Array<{ kind: 'empty'|'past'|'current'|'future'|'high'|'over', ratio: number }>`
  - `defaultPeriodIdx(periods) → number`: indice del primo `isCurrent`, altrimenti 0 (anche con `periods` vuoto).
  - `clampPeriodIdx(idx, periods) → number`: `idx` dentro `[0, periods.length - 1]`; 0 con `periods` vuoto.
  - `stepperState(periods, idx, interval) → { label: string, sub: string, canPrev: boolean, canNext: boolean }`

- [ ] **Step 1: Characterization, prima di toccare il computed.** In `planning-rows.test.js`, `describe('countActiveFilters (formula of planning.html activeFilterCount, 2026-11-03)')`:
  - tutto di default (Set vuoti, `monthlyPulse: true`, `roundHours: true`, `search: ''`) → `0`;
  - ogni condizione da sola vale 1: pipeline non vuoto, projects non vuoto, team non vuoto, `monthlyPulse: false`, `roundHours: false`, `search: 'x'`;
  - `search: '   '` → `0` (trim);
  - tutte insieme → `6`.
  
  Poi una describe su righe a tre livelli (`a` → `a1` → `a1x`, più `b`): con `filterRows(rows, 'a1x')` e
  `openIds` vuoto, `visibleRows(rows, open, effectiveFilter(f, new Set()))` dà `['a', 'a1', 'a1x']`; dopo
  `toggleRowState('a1', { open, suppressed, forced: f.forcedOpenIds })` dà `['a', 'a1']`. Aggiungerla solo se i test
  esistenti (`planning-rows.test.js:10-34`) non coprono già il terzo livello.

- [ ] **Step 2: Run** `npx vitest run js/lib/planning-rows.test.js` → FAIL su `countActiveFilters is not a function`; la describe a tre livelli passa già (pinna il comportamento attuale).

- [ ] **Step 3: Implementare `countActiveFilters`** con la stessa formula del computed attuale. Sostituire il corpo del computed `activeFilterCount` con una chiamata a `window.countActiveFilters({...})` sui campi della pagina (`search: this.search[this.view]`). Portare a `?v=2` il tag `<script type="module" src="js/lib/planning-rows.js?v=1">`.

- [ ] **Step 4: Test dei nuovi helper**, sempre in `planning-rows.test.js`:
  - `leafCounts`: per By role (ruolo → coppie) il conteggio è uguale ai figli diretti; per righe a tre livelli `a` → (`a1` → `a1x`, `a1y`), (`a2`) dà `a: 3`, `a1: 2`; una foglia non compare. Su `buildRoleRows`/`buildProjectRows`/`buildOwnerRows` degli stessi modelli d'esempio già usati nel file, la somma dei conteggi delle righe `depth === 0` è uguale a `total.count`.
  - `miniBar`: celle `[{h:0}, {h:null}]` → due `{ kind: 'empty', ratio: 0 }`; celle `[{h:5,past:true}, {h:10,current:true}, {h:20}]` → `kind` `past`/`current`/`future`, `ratio` `0.25`/`0.5`/`1`; `{ h: 30, load: 'high' }` → `high`, `{ h: 40, load: 'over', current: true }` → `over` (il carico prevale su corrente/futuro); tutte a zero → nessun `NaN`.
  - `defaultPeriodIdx`: `[]` → 0; nessun corrente → 0; corrente al 3° → 2.
  - `clampPeriodIdx`: `(5, tre periodi)` → 2; `(-1, …)` → 0; `(0, [])` → 0.
  - `stepperState` Monthly: periodo `{ label: 'Oct 2026', isCurrent: true }` → `label 'Oct 2026'`, `sub 'Current month · planned'`; passato → `'Actuals'`; futuro → `'Planned'`; `canPrev` falso a idx 0, `canNext` falso all'ultimo.
  - `stepperState` Weekly: `{ dateTitle: '19 Oct – 25 Oct', weekStart: new Date(2026, 9, 19), isCurrent: true }` → `label '19 Oct – 25 Oct · W43'`, `sub 'Current week · planned'`.
  - `stepperState([], 0, 'monthly')` → `{ label: '', sub: '', canPrev: false, canNext: false }`.

- [ ] **Step 5: Run** → FAIL sui nomi mancanti. **Implementare** i cinque helper (in Monthly l'etichetta è `p.label`, che vale già "Oct 2026"; in Weekly è `${p.dateTitle} · W${isoWeek(p.weekStart)}`). **Run** → PASS.

- [ ] **Step 6: Commit** `feat(planning): pure helpers for the smartphone layout`.

---

### Task 2: Interruttore, head, toolbar e stepper

**Boards:** `9.9a.jpg`, parte destra (head, segmented a tutta larghezza, stepper "Sep 2026 / Actuals"); `9.9b.jpg`, parte destra (stepper "Oct 2026 / Current month · planned")

**Files:**
- Modify: `planning.html` (data, `mounted()` `:1166-1168`, head `:43-49`, toolbar `:51-104`, `<link href="css/planning.css?v=1">` `:13`)
- Modify: `css/planning.css` (nuovo blocco `@media (max-width: 767.98px)` dopo quello dei 1024px; tolto il commento "provisional until cycle 2" a `:238`)
- Modify: `js/lib/content-surface-guard.test.js:296` (`?v=1` → `?v=2`)

**Interfaces:**
- Consumes: `defaultPeriodIdx`, `clampPeriodIdx`, `stepperState` (Task 1).
- Produces: dato `isPhone: boolean`; dato `phonePeriodIdx: number`; computed `stepper` = `stepperState(activeRows.periods, phonePeriodIdx, interval)`; metodo `stepPeriod(delta: -1|1)`.

- [ ] **Step 1:** In `mounted()`, accanto a `isTablet`: `matchMedia('(max-width: 767.98px)')` → `isPhone`, con il listener `change`. Aggiungere `isPhone: false, phonePeriodIdx: 0` a `data()`.
- [ ] **Step 2:** Dato `phoneIdxReset: true`. Un watcher su `windowStart`, `windowEnd` e `interval` lo rimette a `true`. Il watcher esistente `activeRows(v)`, quando `v.state === 'ready'`, fa una di due cose:
  - con `phoneIdxReset` vero: `phonePeriodIdx = defaultPeriodIdx(v.periods)` e `phoneIdxReset = false`;
  - altrimenti: `phonePeriodIdx = clampPeriodIdx(phonePeriodIdx, v.periods)`.
  
  Il cambio di vista non tocca il flag.
- [ ] **Step 3:** Head: con `isPhone`, un bottone "Filters" (`data-bs-toggle="offcanvas" data-bs-target="#plFiltersPanel"`, badge `activeFilterCount` come quello della toolbar) dopo Export XLS in `.ph-actions`. Il bottone Filters della toolbar prende `v-if="isTablet && !isPhone"`.
- [ ] **Step 4:** Toolbar con `isPhone`: il segmented Interval, `.pl-period` e il Today desktop si nascondono (`v-if`/`v-show` sul markup esistente, senza duplicarlo). Il segmented della vista diventa a tutta larghezza in CSS. Sotto la toolbar, solo con `isPhone`, lo stepper `.pl-stepper`: bottone `aria-label="Previous period"` (`chevron-left`, `:disabled="!stepper.canPrev"`), `stepper.label` in `.pl-stepper-label` e `stepper.sub` in `.pl-stepper-sub`, bottone `aria-label="Next period"`. `stepPeriod(delta)` cambia solo `phonePeriodIdx`, passando da `clampPeriodIdx`.
- [ ] **Step 5:** CSS nel blocco smartphone: `.ph-actions .ph-btn` 44×44; `.pl-seg` della vista `width: 100%` con bottoni `flex: 1`, altezza ≥ 44px; `.pl-stepper` card a tutta larghezza, frecce 44×44, etichetta in `--weight-bold`, sotto-etichetta `--text-sm` `--text-muted` (corrente in `--indigo-*`, come nella tavola: scegliere il token del testo `current` già usato da `.pl-cell--current`). La legenda `.pl-legend` si nasconde. Portare `css/planning.css` a `?v=2` in `planning.html` e nel guard.
- [ ] **Step 6:** Validare il template con `@vue/compiler-dom`, poi `npx vitest run js/lib/content-surface-guard.test.js js/lib/page-head-guard.test.js js/lib/nav-shell-guard.test.js` → PASS.
- [ ] **Step 7:** Confronto con le tavole: aprire 9.9a e 9.9b e confrontare il markup di head, segmented e stepper. La verifica a schermo è nel Task 6.
- [ ] **Step 8: Commit** `feat(planning): smartphone switch, head and period stepper`.

---

### Task 3: Card per riga padre

**Boards:** `9.9a.jpg`, parte destra (card chiusa, card espansa con figli, "—" per i vuoti); `9.8c.jpg` (pill "Needs owner", colori high/over); `9.8b.jpg` (livello 2 di By project)

**Files:**
- Modify: `planning.html` (dentro `.section-card.pl-card`, `:199-262`; computed nuovi)
- Modify: `css/planning.css` (blocco smartphone)

**Interfaces:**
- Consumes: `leafCounts`, `miniBar` (Task 1); `phonePeriodIdx` (Task 2); i metodi esistenti `hasChildren`, `isOpen`, `toggleRow`, `cellText`, `cellClass`, `stagePill`, `fmtNum`.
- Produces: computed `leafCountMap` = `leafCounts(activeRows.rows)`; computed `phoneGroups`: `displayRows` raggruppati per padre di profondità 0, `[{ parent: row, children: row[] }]`, nell'ordine di `displayRows`.

- [ ] **Step 1:** `.pl-grid-wrap` prende `v-if="!isPhone"` dentro il ramo `v-else` esistente; accanto, `v-else`, `.pl-cards`. Gli stati `placeholder`/`empty` restano dove sono.
- [ ] **Step 2:** Una `.pl-mcard` per gruppo, con il markup di Spec §6:
  - testata `.pl-mcard-head`, `role="button"`, `tabindex="0"`, `@click` e `@keydown.enter`/`.space` → `toggleRow(parent.id)` solo se `hasChildren(parent)`, con `aria-expanded`;
  - avatar e pill riusando i frammenti della colonna label;
  - "{n} assignment(s) · Sold {fmtNum(sold)}" con `n = leafCountMap.get(parent.id) ?? 0` e il singolare per 1;
  - il valore `.pl-mcard-value` con `cellText(parent.cells[phonePeriodIdx])` e le classi `cellClass(...)`, "—" se il testo è vuoto;
  - "{fmtNum(toPlan)} to plan";
  - la mini-barra `.pl-mbar` (`aria-hidden="true"`): uno `<span class="pl-mbar-seg pl-mbar-seg--{kind}">` per segmento, `--pl-ratio: max(.25, ratio)` inline come custom property (nessun colore inline) e `.is-selected` sull'indice scelto.
- [ ] **Step 3:** Figli: dentro la card, una `.pl-mrow` per ogni riga di `children`, con `--pl-depth: depth - 1` per il rientro, chevron se `hasChildren` (stesso `@click.stop="toggleRow"`), etichetta, seconda riga (owner o `sub`, come nella colonna label senza `.pl-sub--tablet`) e valore del periodo scelto. Righe ≥ 44px.
- [ ] **Step 4:** Con ricerca attiva e nessun risultato, una `.pl-mcard` vuota con "No rows match “{{ search[view] }}”." In coda, la card TOTAL: "TOTAL · {{ activeRows.total.count }} ASSIGNMENTS", valore e mini-barra da `activeRows.total.cells`, "{h} to plan" da `total.toPlan`.
- [ ] **Step 5:** CSS: card `--surface-white`, bordo `--border-light`, raggio e ombra dei token già usati da `.section-card`; card aperta con bordo `--brand-navy` (9.9a); valore grande `--text-2xl` bold, valori figli allineati a destra. Segmenti: `past` `--text-muted`, `current` `--brand-magenta`, `future` `--brand-navy`, `high`/`over` gli stessi token di sfondo/testo di `.pl-cell--high`/`--over`, `empty` trattino alto 2px; `flex: 1 1 0; min-width: 2px; max-width: 16px; height: calc(var(--pl-ratio) * 20px)`. Titoli con `min-width: 0` e `overflow-wrap: anywhere`, così una card non allarga la pagina.
- [ ] **Step 6:** Validare il template; `npx vitest run js/lib/content-surface-guard.test.js` → PASS.
- [ ] **Step 7:** Confronto del markup con 9.9a (card chiusa e card espansa), 9.8c (TBD, high/over) e 9.8b (livelli).
- [ ] **Step 8: Commit** `feat(planning): smartphone cards with mini bar and total`.

---

### Task 4: Bottom sheet Filtri

**Boards:** `9.9b.jpg`, parte destra

**Files:**
- Modify: `planning.html` (teleport `:89-172`, offcanvas `:347-349`)
- Modify: `css/planning.css` (blocco smartphone)

**Interfaces:**
- Consumes: `isPhone` (Task 2); i metodi esistenti `applyPreset`, `applyWholeRange`, `setFrom`, `setTo`, `goToday`, `fromYm`, `toYm`, `axisMinYm`, `axisMaxYm`, `isDefaultWindow`, `estimatesText`, `viewName`.
- Produces: nessuna interfaccia nuova.

- [ ] **Step 1:** Intestazione teleportata (`:89-94`): con `isPhone`, al posto dell'icona ×, un bottone testuale "Close" con `data-bs-dismiss="offcanvas"` e `aria-label="Close filters"`.
- [ ] **Step 2:** Subito dopo il teleport della ricerca (`:95-100`), un `<teleport to="#plFiltersBody" v-if="isPhone">` con:
  - un segmented Monthly/Weekly che riusa le stesse classi e `aria-pressed` di quello della toolbar, con etichetta di sezione "Interval";
  - una sezione "Period": preset 3/6/12 months, Whole range, From e To come `<cg-date-picker mode="month" inline-popover>` con gli stessi `min`/`max`/handler del menu periodo, Today con `:disabled="isDefaultWindow"`.
  
  Visto l'ordine dei teleport, la sezione cade fra la ricerca e i chip.
- [ ] **Step 3:** Dopo il teleport dei filtri (`:107-172`), un secondo `<teleport to="#plFiltersBody" v-if="isPhone">` con la legenda dei colori del ciclo 1 (stessi chip `.pl-chip--*`, high/over solo in By owner), il testo "Estimation logic · {{ viewName }}" con i paragrafi di `estimatesText` in un `<details>` intitolato "How estimates work", e infine "Show results" (`btn btn-primary w-100`, `data-bs-dismiss="offcanvas"`). Load XLS nel sheet (`:171`) prende `v-if="isTablet && !isPhone"`.
- [ ] **Step 4:** CSS nel blocco smartphone:
  - `.offcanvas.pl-filters`: `top: auto; bottom: 0; left: 0; right: 0; width: 100%; height: auto; max-height: 90dvh; border-left: 0; border-top-left-radius` e `-right-radius` con il token di raggio grande, `transform: translateY(100%)`;
  - `.pl-filters.showing, .pl-filters.show:not(.hiding) { transform: none; }`, con una specificità che vinca su `.offcanvas-end`;
  - una maniglia decorativa `::before` in testa;
  - `.pl-filters-body` con `overflow-y: auto` e `padding-bottom` per l'area sicura;
  - chip, toggle dei popover, switch, preset e bottoni ≥ 44px;
  - i popover Projects/Team dentro il sheet `position: static !important; transform: none !important; inset: auto !important; width: 100%`, perché Popper scrive stili inline.
- [ ] **Step 5:** Validare il template; `npx vitest run js/lib/content-surface-guard.test.js js/lib/dates-guard.test.js` → PASS.
- [ ] **Step 6:** Confronto del markup con 9.9b.
- [ ] **Step 7: Commit** `feat(planning): filters bottom sheet on smartphone`.

---

### Task 5: Team assistant a schermo intero

**Boards:** nessuna (non disegnato, Spec §8); `9.9b.jpg` come riferimento per la barra "titolo + Close"

**Files:**
- Modify: `planning.html` (`#teamAssistantPanel`, `:279-341`)
- Modify: `css/planning.css` (blocco smartphone)

**Interfaces:**
- Consumes: `isPhone` (Task 2); `rowView(row)` (esistente, `js/lib/team-assistant-ui.js`).
- Produces: nessuna interfaccia nuova.

- [ ] **Step 1:** Header: con `isPhone`, al posto dell'icona ×, un bottone testuale "Close" con la stessa azione e `aria-label="Close Team assistant"`.
- [ ] **Step 2:** `.ta-table-wrap` prende `v-if="!isPhone"`; accanto, `v-else`, una `.ta-pcard` per riga di `section.rows`:
  - riga 1: `rowView(row).name` e "Score {score}";
  - riga 2: "{role} · {roleHours} h on role";
  - tre numeri chiave in `.ta-pcard-kpis`: "Free {free} h/wk", "Load {load}", "{onProject} h on project";
  - i tag come pill, come nella tabella;
  - `flags`, se presenti, in `.ta-flags`;
  - `rationale`.
  
  Niente `v-html`: sono campi di testo.
- [ ] **Step 3:** CSS: `#teamAssistantPanel` `width: 100vw; height: 100dvh; border-left: 0`; `.pl-ta-backdrop.open` invisibile; `.ta-header` sticky in alto; `.ta-setup-row` va a capo, con select e bottoni a tutta larghezza ≥ 44px; card con i token delle card del Task 3. `right: -960px` da chiuso resta (`foundations-guard.test.js:79`).
- [ ] **Step 4:** Validare il template; `npx vitest run js/lib/foundations-guard.test.js js/lib/team-assistant-ui.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(planning): full-screen Team assistant with person cards on smartphone`.

---

### Task 6: Casi di test e verifica visiva

**Boards:** `9.9a.jpg`, `9.9b.jpg` (confronto dei PNG); `9.8c.jpg` per By owner

**Files:**
- Modify: `TEST_CASES.md` (sezione "## 7. Resource Planning", righe nuove da `PL-45` in poi)
- Modify: `js/lib/test-cases-parse.test.js:160` (`910` → `910 + numero delle righe aggiunte`)

**Interfaces:**
- Consumes: tutto quanto sopra.

- [ ] **Step 1:** Righe `PL-45`… con le colonne `| ID | Scenario | Steps | Expected | Auto |`:
  - stepper e limiti;
  - stepper Weekly;
  - card ed espansione su tre livelli (By project, By owner);
  - conteggio stabile con ricerca;
  - ricerca dal sheet;
  - sheet: Show results, Close, preset, From/To, Weekly;
  - popover Projects nel sheet;
  - By owner: TBD e high/over;
  - card TOTAL;
  - assenza di Load XLS ed Expand/Collapse all;
  - Export dal head;
  - Team assistant a schermo intero (Close, Esc, focus di ritorno, card per persona);
  - resize attraverso i 768px con sheet o Team assistant aperti (Review Focus 5);
  - nessuna regressione a 768 e 1024.
  
  Aggiornare il conteggio in `test-cases-parse.test.js` nello stesso commit, poi `npx vitest run js/lib/test-cases-parse.test.js` → PASS.
- [ ] **Step 2:** Verifica visiva, eseguita dal coordinatore (PROCESS.md §6.6.3). `scripts/test-branch.sh up` dal worktree, poi `node scripts/shoot.mjs --base http://localhost:8081 --settle 3000 --url /planning.html --widths 390`. Gli stati si raggiungono con `--eval-file` scritti nella cartella scratch: la proxy è `document.querySelector('#planningApp')._vnode.component.proxy` (Brief/handoff), e si attende `.pl-mcard`. Scatti a 390:
  - By role, chiuso;
  - By role, una card aperta;
  - By project aperto fino al livello 2;
  - By owner con TBD e high/over;
  - stepper su un periodo passato;
  - Weekly + Whole range;
  - il sheet aperto, intero con `--full`, poi con il popover Projects aperto;
  - il Team assistant aperto (con risultati, se lo stack ne ha).
  
  Poi uno scatto a 768 e uno a 1024 su By role.
- [ ] **Step 3:** Rileggere ogni PNG con `Read` e confrontarlo con 9.9a/9.9b; presentare gli scostamenti uno per uno (PROCESS.md §6.6.5). Verificare con `--eval` che `document.documentElement.scrollWidth <= 390` a 390 (criterio 1) e che ogni target interattivo visibile del sheet misuri ≥ 44px (`getBoundingClientRect`, criterio 8), riportando il risultato in un overlay `<pre>`.
- [ ] **Step 4: Commit** `test(planning): smartphone test cases`. Lo stack di branch resta acceso per il Gate 2 di `/finish-cycle`.

---

## Decisioni aperte

1. **`countActiveFilters` estratto in `js/lib/planning-rows.js` e il computed ridotto a un wrapper.** Alternativa scartata: pinnare la formula con un test sul template. Perché: la Spec chiede un test di characterization sulla formula, e solo un helper puro si testa senza montare la pagina.
2. **`clampPeriodIdx` come quinto helper, oltre ai quattro della Spec.** Alternativa scartata: clamp in linea nel watcher. Perché: il Review Focus 1 chiede un test sul limite, e così il limite è pinnato.
3. **Il sheet e le card di Task 3/4 usano i `v-if="isPhone"` esistenti sul markup del ciclo 1 invece di duplicarlo, salvo segmented Interval e periodo nel sheet, che sono teleport nuovi.** Alternativa scartata: teleportare il segmented e il menu periodo esistenti. Perché: il menu periodo è un popover con `v-if="periodMenuOpen"` e focus proprio, e spostarlo avrebbe cambiato il comportamento sopra i 768px.
4. **"How estimates work" nel sheet come `<details>` nativo.** Alternativa scartata: riusare il popover `legendOpen`. Perché: il popover è posizionato per il desktop, e dentro un sheet che scorre un disclosure in linea non ha problemi di posizionamento.
5. **Le verifiche ≥ 44px e senza scroll orizzontale si fanno con `--eval` sullo stack di branch nel Task 6, non con un test jsdom.** Alternativa scartata: un guard jsdom. Perché: jsdom non calcola il layout.
