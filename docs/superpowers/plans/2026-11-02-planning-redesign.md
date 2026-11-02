# Resource Planning v2 — ciclo 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-02-planning-redesign-design.md`
**Branch:** `planning-redesign`
**Risk class:** high-risk — tocca file condivisi caricati da più pagine (`css/style.css`, `js/lib/icons.js`)

**Goal:** Ridisegnare `planning.html` (desktop e tablet) secondo le tavole 9.8a–e e la parte tablet di 9.9a/9.9b,
senza cambiare API, calcoli, export né logica del Team assistant.

**Architecture:** Una nuova libreria pura `js/lib/planning-rows.js` trasforma i modelli adattati in righe piatte
(id stabile, parentId, depth, celle classificate). `planning.html` le rende con un `<table>` nel template Vue,
con stato di espansione e ricerca reattivi. Tutto lo stile della pagina passa in `css/planning.css`.

**Tech Stack:** Vue 3 da CDN (nessun build), Bootstrap 5.3 (dropdown, offcanvas), vitest + jsdom,
`<cg-date-picker>` di `js/cg-controls.js`, `<ph-icon>` di `js/lib/icons.js`.

**Worktree:** `C:\Users\Fabrizio.Fortini\Progetti\burndown\.claude\worktrees\planning-redesign` (già creato, `.env`
copiato, `npm ci` eseguito). Tutti i comandi partono da lì.

**Tavole:** `docs/superpowers/design/planning/` — `9.8a.jpg` … `9.9b.jpg`.

## Global Constraints

- Nessun build; nginx serve i file così come sono.
- Solo `var(--token)` da `css/tokens.css`: nessun hex in `css/planning.css`, in `planning.html` né nel markup generato.
- Nessuna emoji o glifo-icona (▶ ▼ ◀ ▷ ◁ ✕ 🤖 🏢 📋 👤 ⊞ ⊟) nella pagina: SVG `stroke="currentColor"` 14/16px via `<ph-icon>` / `iconSvg`.
- Ogni file versionato toccato: bump di **ogni** suo `?v=N` nel repo, allo stesso N (`grep -rn "<file>?v=" --include=*.html .`).
- `#app-shell`/`#app-main` senza `overflow`/`transform`/`filter`/`contain`/`will-change`/`position`; `v-cloak` resta.
- Testi utente in inglese, copy esatto della Spec (§5, handoff §7).
- Nessun toggle Compact; `body.pp-fullwidth` resta.
- `exportRows`/`periodMeta` dei tre computed di vista e `buildStyledExcelExport` invariati.
- `modelRequest`, `loadModel`, `modelSeq`, filtri, `roundHours`, `monthlyPulse`, `isAdminUser` invariati nel comportamento.
- Durante i task si lanciano solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai modificare file con `Get-Content`/`Set-Content` di PowerShell (BOM): Edit tool o sed.

## Review Focus

1. **Ricerca su un figlio sotto un padre chiuso** — il padre si apre per la ricerca, e svuotando la ricerca torna chiuso (la ricerca non scrive in `openIds`). Test in Task 1.
2. **Re-fetch dopo un cambio filtro** — le righe aperte restano aperte: gli id sono derivati da chiavi (ruolo, project id, nome task, owner), mai da indici. Test in Task 2.
3. **‹ / › con la finestra al limite dell'asse o asse più corto della finestra** — la finestra si clampa senza restringersi e senza invertirsi. Test in Task 5.
4. **Weekly a cavallo d'anno** — numero di settimana ISO corretto (W53 / W1) e label con anno su entrambe le date. Test in Task 1 e Task 5.
5. **Nomi con caratteri HTML** (`<`, `&`, `"`) in progetti, task e owner — appaiono come testo; nessun `v-html` riceve testo non passato da `esc()`. Test in Task 3 (nessun `v-html` sulle etichette nel template della griglia).

---

### Task 1: Helper puri di `planning-rows.js`

**Boards:** `9.8a.jpg`, `9.8d.jpg` (testo delle celle, header Weekly)

**Files:**
- Create: `js/lib/planning-rows.js`
- Test: `js/lib/planning-rows.test.js`

**Interfaces:**
- Produces:
  - `formatCell(h: number, { pulse: boolean, round: boolean }) → string`
  - `workingWeeks(period, interval: 'monthly'|'weekly') → number` — Monthly: giorni lun-ven del mese di `period.key` (`YYYY-MM` o la chiave che `buildMonthPeriods` produce, leggerla in `js/core.js`) / 5; Weekly: lun-ven fra `weekStart` e `weekEnd` / 5.
  - `loadLevel(h: number, weeks: number) → null|'high'|'over'`
  - `initials(name: string) → string`
  - `isoWeek(date: Date) → number`
  - `filterRows(rows, query: string) → { visibleIds: Set|null, forcedOpenIds: Set }` (`visibleIds` null = tutto visibile)
  - `visibleRows(rows, openIds: Set, filter) → row[]`
  - Ogni export con bridge `window.<name> = <name>`.

- [ ] **Step 1: Test che falliscono** in `planning-rows.test.js`:
  - `formatCell`: `(0.3,{pulse:true,round:true})` → `'<1h'`; `(3.4,{pulse:true,round:true})` → `'~3h'`; `(0.45,{pulse:false,round:true})` → `'<1h'`; `(0.45,{pulse:false,round:false})` → `'0.45h'`; `(12.6,{pulse:false,round:true})` → `'13h'`; `(0,{…})` → `''`; `(0.004,{…})` → `''`.
  - `loadLevel`: `(24,1)` → `'high'`; `(23.9,1)` → `null`; `(30,1)` → `'over'`; `(96,4)` → `'high'`; `(110,4.4)` → `'high'`; `(140,4.4)` → `'over'`.
  - `workingWeeks`: ottobre 2026 Monthly → `22/5`; una settimana lun-ven piena → `1`.
  - `initials`: `'Michal Wadowski'` → `'MW'`; `'chiara'` → `'CH'`; `'  Anna  Maria Rossi '` → `'AR'`.
  - `isoWeek`: `2026-10-12` → `42`; `2026-12-31` → `53`; `2027-01-04` → `1`.
  - `filterRows`: albero `a > a1 > a11`, `b > b1`; query `'a11'` → visibili `a, a1, a11`, forzati aperti `a, a1`; query `'A1'` (case) → visibili `a, a1, a11` (discendenti di una riga che corrisponde); query `''` → `visibleIds` null, forzati vuoto; corrispondenza su `sub`.
  - `visibleRows`: con `openIds` vuoto e nessun filtro → solo le radici; con `a` aperto → `a, a1, b`; con filtro `'a11'` e `openIds` vuoto → `a, a1, a11` e `openIds` resta vuoto (Review Focus 1).
- [ ] **Step 2:** `npx vitest run js/lib/planning-rows.test.js` → FAIL (modulo mancante).
- [ ] **Step 3:** Implementare le funzioni. Righe con `{ id, parentId }`; antenati via mappa id → riga.
- [ ] **Step 4:** stesso comando → PASS.
- [ ] **Step 5:** Commit `feat(planning): pure row helpers (cell text, load level, search filter)`.

### Task 2: Builder delle righe per le tre viste

**Boards:** `9.8b.jpg`, `9.8c.jpg`, `9.8e.jpg`, `9.9a.jpg` (parte tablet)

**Files:**
- Modify: `js/lib/planning-rows.js`, `js/lib/planning-rows.test.js`

**Interfaces:**
- Consumes: Task 1; le forme di `adaptRoleModel`/`adaptProjectModel`/`adaptOwnerModel` (`js/lib/planning-model-ui.js`); `computeResidual`, `sumChildBreakdownHours` (`js/lib/planning-calc.js`, import ES).
- Produces:
  - `buildRoleRows(adapted, periods, opts)`, `buildProjectRows(adapted, periods, opts)`, `buildOwnerRows(adapted, periods, opts)` → `{ rows, total }`.
  - `opts = { interval, round, ownerStatus }` (`ownerStatus` = la stessa mappa di `this.ownerStatusMap`).
  - riga = `{ id, parentId, depth, kind, label, sub, stage, status, client, start, end, owners, inactive, sold, actuals, toPlan, cells }`; `kind` ∈ `role|pair|project|task|roleLeaf|person|tbd`; `cells[i] = { h, past, current, pulse, load }`; `owners = [{ name, initials, inactive }]`.
  - `total = { count, sold, actuals, toPlan, cells }` (`cells[i]` solo `{ h, past, current }`).
  - Id stabili: `role:<role>`, `role:<role>|<project>::<task>`, `p:<projectId>`, `p:<projectId>|t:<task>`, `p:<projectId>|t:<task>|r:<role>`, `o:<owner>`, `o:<owner>|p:<projectId>`, `o:<owner>|p:<projectId>|t:<task>`.

La logica dei numeri è quella oggi dentro `byRoleView` (`planning.html:402-603`), `byProjectView` (604-854) e `byOwnerView` (855-1025): portarla, non reinventarla. Le ore di cella, `toPlan` e i totali devono coincidere con ciò che quei computed mettono in `exportRows`.

- [ ] **Step 1: Test che falliscono**, con fixture costruite nella forma dei modelli adattati (due periodi passato/futuro, un pulse):
  - By role: una riga `role` per ruolo (ordine alfabetico), figli `pair` ordinati per `sold + actual` decrescente, `sub` = `"<task> · <owner>"` o `"<task> · No owner yet"`; nessuna cella con `load` ≠ null.
  - By project: tre livelli `project` → `task` → `roleLeaf`; `task.sub` = `"2 roles"`/`"1 role"`; un ruolo con due owner → una sola `roleLeaf` con `owners.length === 2` e ore = somma; owner `'—'` → `owners = []`; owner inattivo → `inactive: true` sull'owner; nessuna cella con `load`.
  - By owner: il gruppo `'—'` è la prima riga, `kind: 'tbd'`, `label: 'Unassigned (TBD)'`; persone in ordine alfabetico; `person.sub` = `"<n> projects · <ruoli>"`; una cella persona futura non-pulse con `h = 30 * workingWeeks` → `load: 'over'`; la stessa cella passata o pulse → `load: null`; righe `project`/`task` sotto la persona senza `load`.
  - Totali: `total.count` = numero di righe foglia; `total.sold/actuals/toPlan` e `total.cells[i].h` uguali alla somma delle foglie.
  - Id stabili: rieseguire il builder su una copia del modello con un progetto in meno → gli id delle righe rimaste sono identici (Review Focus 2).
- [ ] **Step 2:** `npx vitest run js/lib/planning-rows.test.js` → FAIL.
- [ ] **Step 3:** Implementare i tre builder.
- [ ] **Step 4:** stesso comando → PASS.
- [ ] **Step 5:** Commit `feat(planning): row builders for role/project/owner views`.

### Task 3: `planning.css`, caricamenti, griglia a template

**Boards:** `9.8a.jpg`, `9.8b.jpg`, `9.8c.jpg`, `9.8e.jpg` — aprirle e confrontare il markup prima di chiudere il task.

**Files:**
- Create: `css/planning.css`
- Modify: `css/style.css` (rimuovere `.gantt-table` 350-358, `.pp-tooltip` 373-382, `#ppResourceTable`/`.pp-fullwidth` 462-465, `.ta-*` 467-486, `.pl-toolbar*` 491-493 e spostarli in `planning.css`), tutti gli `*.html` che caricano `css/style.css?v=28` (bump a `?v=29`), `planning.html`, `js/lib/icons.js` (+ bump di ogni `?v=` di `icons.js`), `js/lib/content-surface-guard.test.js`
- Test: `js/lib/content-surface-guard.test.js`

**Interfaces:**
- Consumes: Task 2 (`buildRoleRows` & c., `visibleRows`, `filterRows`, `formatCell`).
- Produces: in `planning.html` i dati `openIds: { byrole: Set, byproject: Set, byowner: Set }`, `search: { byrole: '', byproject: '', byowner: '' }`, `legendOpen: false`; computed `activeRows` → `{ rows, total, periods }` della vista attiva; `displayRows` (righe visibili); metodi `toggleRow(id)`, `expandAll()`, `collapseAll()`. Classi `.pl-grid`, `.pl-grid-wrap`, `.pl-row--parent`, `.pl-row--child`, `.pl-cell--past`, `.pl-cell--current`, `.pl-cell--pulse`, `.pl-cell--high`, `.pl-cell--over`, `.pl-total`, `.pl-avatar`, `.pl-avatar--tbd`, `.pl-legend`, `.pl-popover`.

- [ ] **Step 1: Test che falliscono** in `content-surface-guard.test.js` (sezione "planning"):
  - `planning.html` carica `css/controls.css`, `js/cg-controls.js` e `css/planning.css?v=1` dopo `css/style.css`;
  - `css/planning.css` non contiene `#[0-9a-fA-F]{3,8}\b` fuori dai commenti;
  - `planning.html` non contiene nessuno dei glifi ▶ ▼ ◀ ▷ ◁ ✕ 🤖 🏢 📋 👤 ⊞ ⊟ né hex `#[0-9a-fA-F]{6}` fuori da `buildStyledExcelExport`;
  - nessun `v-html` nel `<table class="pl-grid">` salvo sulle pill di stage/status (Review Focus 5);
  - `planning.html` non contiene `activeViewHtml`.
- [ ] **Step 2:** `npx vitest run js/lib/content-surface-guard.test.js` → FAIL.
- [ ] **Step 3:** Creare `planning.css`, spostare le regole, aggiornare i link e i bump; aggiungere a `icons.js` le icone mancanti fra `chevron-right`, `chevron-down`, `chevron-left`, `search`, `info`, `filter`, `close`, `upload`, `download`.
- [ ] **Step 4:** Nei tre computed di vista: togliere la costruzione dell'HTML e restituire `{ exportRows, periodMeta, rows, total, periods }` (`exportRows`/`periodMeta` invariati). Sostituire il `v-html="activeViewHtml"` con un `<table class="pl-grid">` nel template: header (Monthly "SEP 2026" + "actuals"/"current"; Weekly "OCT 12" + "W"+`isoWeek`), righe da `displayRows` con chevron, avatar (`initials`), pill di stage/status (`pipelineBadge`/`statusBadge` via `v-html`), pill "inactive", "Needs owner", celle con le classi e `formatCell`, `title` nativo; riga Total "TOTAL · {count} ASSIGNMENTS". Sticky: etichetta, Sold, Actuals, To plan, header e Total. Default di `openIds` alla prima costruzione di una vista (Spec §3.2). Togliere la parte toggle di `initTooltipsAndToggles()` (o il metodo intero, se resta vuoto).
- [ ] **Step 5:** Legenda (Spec §5.4) con chip, "How estimates work" (popover con il testo esistente della vista, chiusura su clic esterno ed Esc), Expand all / Collapse all. Placeholder di caricamento/errore restyled nella stessa card. Riga "No rows match “{query}”." quando la ricerca non trova nulla.
- [ ] **Step 6:** `npx vitest run js/lib/content-surface-guard.test.js js/lib/page-head-guard.test.js js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js js/lib/planning-rows.test.js` → PASS.
- [ ] **Step 7:** Commit `feat(planning): grid rendered from pure rows; planning.css`.

### Task 4: Page head e toolbar

**Boards:** `9.8a.jpg`, `9.8d.jpg`

**Files:**
- Modify: `planning.html`, `css/planning.css`, `js/lib/content-surface-guard.test.js`

**Interfaces:**
- Consumes: Task 3 (`search`, `activeRows.total`).
- Produces: computed `planningSubtitle`; i pulsanti di azione in `.ph-actions`.

- [ ] **Step 1: Test che falliscono** in `content-surface-guard.test.js`: il blocco "planning toolbar" ora pretende esattamente 3 `.ph-btn` dentro `.ph-actions` (Team assistant con `v-if="isAdminUser"`, Load XLS, Export XLS con `:disabled` che cita `modelPending` e `modelError`) e nessun `.pl-toolbar-right`; nessun pulsante con testo "✕".
- [ ] **Step 2:** `npx vitest run js/lib/content-surface-guard.test.js` → FAIL.
- [ ] **Step 3:** Head (Spec §5.1) con `planningSubtitle`; riga 1 (segmented vista e intervallo, posto per il selettore di periodo, ricerca con placeholder per vista legata a `search[view]`); riga 2 (chip Pipeline, popover Projects con ricerca locale, cliente, pill di stage, footer "{x} of {m} selected" + Select all + Clear; popover Team; switch Monthly pulse e Rounded). Rimuovere i pulsanti di reset "✕".
- [ ] **Step 4:** `npx vitest run js/lib/content-surface-guard.test.js js/lib/page-head-guard.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(planning): page head actions and two-row toolbar`.

### Task 5: Selettore di periodo

**Boards:** `9.8a.jpg`, `9.8d.jpg` (Spec §5.3, non disegnato)

**Files:**
- Modify: `js/lib/planning-rows.js`, `js/lib/planning-rows.test.js`, `planning.html`, `css/planning.css`

**Interfaces:**
- Produces:
  - `defaultWindow(today: Date) → { start, end }` (mese corrente → +3, come `initWindowIfNeeded`);
  - `presetWindow(months: number, today: Date) → { start, end }` (inizio = mese corrente − 1);
  - `shiftWindow({ start, end }, delta: ±1, { axisStart, axisEnd }) → { start, end }` (mantiene la larghezza, clampa senza restringere; se la finestra è più larga dell'asse restituisce l'asse);
  - `weeklyWindowLabel(weeks) → string` via `formatDayText` di `js/lib/dates.js` (import ES): `"Sep 28 – Nov 8, 2026"`, anno su entrambe se diverso.
  - In `planning.html`: `periodMenuOpen`, metodi `shiftPeriod(delta)`, `applyPreset(n)`, `applyWholeRange()`, `goToday()`, computed `periodLabel`, `isDefaultWindow`.

- [ ] **Step 1: Test che falliscono**: `defaultWindow(2026-10-15)` → 1 ott 2026 – 31 gen 2027; `presetWindow(6, 2026-10-15)` → 1 set 2026 – 28 feb 2027; `shiftWindow` di +1 a un mese dal limite destro → fine = `axisEnd`, larghezza invariata; di +1 già al limite → invariata; finestra di 6 mesi su asse di 3 → l'asse (Review Focus 3); `weeklyWindowLabel` con settimane 28 set – 8 nov 2026 → `'Sep 28 – Nov 8, 2026'`, e 28 dic 2026 – 10 gen 2027 → `'Dec 28, 2026 – Jan 4, 2027'` (inizio dell'ultima settimana) (Review Focus 4).
- [ ] **Step 2:** `npx vitest run js/lib/planning-rows.test.js` → FAIL.
- [ ] **Step 3:** Implementare le funzioni; `initWindowIfNeeded` usa `defaultWindow`.
- [ ] **Step 4:** UI: `‹ [label ▾] ›` + "Today"; menu con preset "3 months"/"6 months"/"12 months"/"Whole range" e due `<cg-date-picker mode="month">` From/To con `min`/`max` dall'asse e To ≥ From, chiusura su clic esterno o Esc con focus alla label. Rimuovere `expandLeft`/`shrinkLeft`/`expandRight`/`shrinkRight` se senza chiamanti. Registrare i componenti di `cg-controls.js` sull'app come fanno le altre pagine che li usano (`costgrid.html`).
- [ ] **Step 5:** `npx vitest run js/lib/planning-rows.test.js` → PASS.
- [ ] **Step 6:** Commit `feat(planning): period selector with presets, from/to and Today`.

### Task 6: Tablet e pannello Filtri

**Boards:** `9.9a.jpg`, `9.9b.jpg` (parte tablet)

**Files:**
- Modify: `planning.html`, `css/planning.css`

**Interfaces:**
- Consumes: Task 4 (toolbar), Task 5 (selettore).
- Produces: computed `activeFilterCount`; offcanvas `#plFiltersPanel` (`offcanvas-end`).

- [ ] **Step 1:** Media query `max-width: 1023.98px` (Spec §6): head con Team assistant ed Export solo icona (`aria-label`), Load XLS nel pannello; toolbar su una riga con "Filters {n}"; "Today" nel menu di periodo; ricerca, chip, Projects, Team, switch e Load XLS nel pannello; griglia sticky solo etichetta e To plan, Sold/Actuals nella seconda riga (`.pl-sub--tablet`); legenda ridotta. `activeFilterCount` conta: pipeline diversa dal default, `projectFilters.size > 0`, `teamFilters.size > 0`, `!monthlyPulse`, `!roundHours`, ricerca non vuota.
- [ ] **Step 2:** `npx vitest run js/lib/content-surface-guard.test.js js/lib/nav-shell-guard.test.js` → PASS.
- [ ] **Step 3:** Commit `feat(planning): tablet layout and Filters panel`.

### Task 7: Drawer del Team assistant

**Boards:** nessuna (Spec §7); per lo stile riferirsi a `9.8a.jpg` (bottoni, superfici).

**Files:**
- Modify: `planning.html`, `css/planning.css`, `js/lib/content-surface-guard.test.js`

- [ ] **Step 1: Test che falliscono** in `content-surface-guard.test.js`: `#teamAssistantPanel` ha un backdrop fratello `.pl-ta-backdrop`, header senza `btn-close-white` e senza 🤖, pulsante di chiusura con `<ph-icon name="close">`.
- [ ] **Step 2:** `npx vitest run js/lib/content-surface-guard.test.js` → FAIL.
- [ ] **Step 3:** Restyle Spec §7: backdrop, chiusura con ×/Esc/backdrop, focus sulla select all'apertura e ritorno al pulsante alla chiusura, header bianco, chip starter, bolle, spinner nel Send, tabelle con lo stile del sito, `taError` come `alert-warning`. Nessun cambio a `taRank`/`taSend`/`taNewChat`/watcher.
- [ ] **Step 4:** `npx vitest run js/lib/content-surface-guard.test.js js/lib/team-assistant-ui.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(planning): Team assistant as drawer with backdrop`.

### Task 8: Documentazione e casi di test

**Files:**
- Modify: `docs/pages/planning.md`, `docs/css/stylesheets.md`, `docs/js/lib.md`, `CLAUDE.md` (riga `planning.html` della tabella Pages e riga `css/` della File structure), `TEST_CASES.md`

- [ ] **Step 1:** Aggiornare i documenti come Spec §11; in `TEST_CASES.md` i casi di Spec §10.
- [ ] **Step 2:** `npx vitest run scripts/ js/lib/test-cases-parse.test.js` → PASS (`claude-md-guard`, `doc-paths-guard`, parser dei casi).
- [ ] **Step 3:** Commit `docs(planning): page narrative, stylesheets, lib index, test cases`.

### Task 9: Verifica visiva contro le tavole

**Boards:** tutte, `9.8a.jpg` … `9.9b.jpg` (parte tablet).

**Esecutore:** la sessione principale (ha `scripts/shoot.mjs` e lo stack isolato), non un subagente.

- [ ] **Step 1:** `scripts/test-branch.sh up` (stack isolato, porta 8081; non tocca il main stack).
- [ ] **Step 2:** `node scripts/shoot.mjs --base http://localhost:8081 --url /planning.html --out shots/planning --widths 1440,1024 --settle 3000` con gli stati: By role, By project, By owner (Monthly, `--full` solo su By owner); By owner Weekly con popover Projects aperto; popover "How estimates work" in By project; menu periodo aperto; drawer Team assistant aperto; pannello Filtri a 1024 (`--eval` per aprire gli stati, credenziali da `.env` come da `docs/scripts/shoot.md`).
- [ ] **Step 3:** Rileggere ogni PNG con `Read` e confrontarlo con la tavola corrispondente; presentare gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra e attendere la decisione (PROCESS.md §6.6.5). I fix piccoli si fanno subito con commit `fix(planning): …`; gli "accetta" vanno in `docs/pages/planning.md` con il motivo.
- [ ] **Step 4:** Lo stack resta su per il Gate 2 di `/finish-cycle` (non smontarlo qui).

## Decisioni aperte

1. **Esportazione lasciata sui loop esistenti dei computed, non derivata dalle nuove righe.** Alternativa scartata: generare `exportRows` da `planning-rows.js`. Perché: l'XLS di By project ha ancora il livello Owner (4 colonne nome) e la Spec lo vuole invariato; un test confronta i totali.
2. **Settimana in header come numero ISO (`isoWeek`).** Alternativa scartata: il "W1…W5 del mese" di oggi. Perché: tavola 9.8d mostra W42–W45.
3. **Weekly label via `formatDayText` di `js/lib/dates.js`.** Alternativa scartata: nomi dei mesi scritti nella pagina. Perché: la Spec §5.3 lo chiede e `js/lib/dates-guard.test.js` vuole il testo delle date da quel modulo.
4. **Esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: §6.1 — i task 3-7 modificano tutti `planning.html` e `css/planning.css` in sequenza e dipendono dalle interfacce del task precedente, quindi non sono indipendenti.
