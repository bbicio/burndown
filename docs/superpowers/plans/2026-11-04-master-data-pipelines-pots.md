# Master Data — Pipelines & POTs (phase 2, page 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-04-master-data-pipelines-pots-design.md`
**Branch:** `master-data-pipelines-pots`
**Risk class:** high-risk — money (opzione nuova di `formatMoney` in `js/lib/money.js`, input dei POT con `readMoneyInput`, conversione EUR / valuta originale), file condivisi caricati da più pagine (`css/style.css`, `js/api.js`, `js/lib/money.js`)

**Goal:** `master-pipelines.html` diventa la pagina "Pipelines & POTs" delle tavole 10.4–10.5: lista pipeline → POT targets → phasing con un URL per livello, edit inline, drawer del dettaglio POT, layout tablet/phone.

**Architecture:** La logica pura (stato URL, conteggi, gap, fuori-POT, filtro e totali della phasing, target disponibili) va in `js/lib/master-pipelines.js`, testata con vitest e con characterization sul comportamento attuale. La pagina resta una sola app Vue; le tabelle di phasing diventano template; il modale diventa un drawer Vue. Nessuna API server cambia; cambiano due helper client condivisi (`formatMoney` `{ symbol }`, `Api.pipelineYears.create(year, active)`) e la shell guadagna `md-layout--wide`.

**Tech Stack:** HTML statico + Vue 3 da CDN, Bootstrap 5.3, `js/cg-controls.js` (`<cg-select>`), vitest + jsdom, `scripts/shoot.mjs`.

**Tasks independent?** No: i Task 3–7 modificano tutti `master-pipelines.html` e consumano il modulo del Task 2 e gli helper del Task 1.

## Global Constraints

- Copy in inglese, sentence case, testi esatti della spec (§5–§9). Errori invariati: `Enter a valid year (2000–2100).`, `Pipeline ${year} already exists.`, `Enter a valid amount in EUR, e.g. ` + `moneyFormatExample(...)` + `.`, `Reason for change is required when updating a POT.`, `Select a target.`
- Nessuna emoji, nessun `confirm(`/`alert(`: conferme con `showConfirm(message, onConfirm, onCancel, title)` (`js/core.js`).
- Nessun hex nella pagina: token di `css/tokens.css`; stage solo con `var(--pipeline-<stage>-bg|color)` (stage in minuscolo).
- Icone solo `<ph-icon>` / `.pd-icon` di `js/lib/icons.js` (quelle servite esistono già).
- Money: solo `js/lib/money.js`; mai `parseFloat`/`Intl.NumberFormat` su un importo nella pagina; EUR = importo locale / (`currencyRate || 1`).
- Cache-busting: ogni file versionato modificato → bump di **tutti** i suoi `?v=N` nel repo, `.html` e import `.js` (`grep -rn "<file>?v=" --include=*.html --include=*.js . | grep -v node_modules`).
- URL: `?year=Y` POT targets, `?year=Y&pot=<id>` drawer, `?year=Y&phasing=proposal|project` phasing; assente = lista.
- Breakpoint: tablet 768–1023px, phone < 768px; touch ≥ 44px su phone, controlli 40px su tablet.
- Durante i task solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack: verifiche contro `scripts/test-branch.sh`.
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM).

## Review Focus

1. **Deep link `?year=2026&pot=<id>` di un POT cancellato o di un altro anno** — la pagina apre i POT targets senza drawer e senza errore; caso in `master-pipelines.test.js` (`resolvePot`) nel Task 2 + guard nel Task 5.
2. **Doppio click sullo switch Visible** — lo switch è disabilitato mentre il PATCH è in corso, lo stato finale coincide col server; guard nel Task 3.
3. **Riga di phasing con `currencyRate` 0 o `null`** — trattata come 1, mai `Infinity`/`NaN` nei totali; test `phasingTotals` nel Task 2.
4. **Riga con `currency` assente o con spazi (`'GBP '`)** — in "Original currency" finisce nel totale della sua valuta normalizzata (`trim`, assente = `EUR`), mai in un totale a sé; test `phasingTotals` nel Task 2.
5. **POT creato in un'altra scheda dopo il caricamento** — il target compare ancora nella select, il `POST` riceve 409 e l'errore del server appare sotto la riga senza chiuderla; guard nel Task 4.

---

### Task 1: Helper condivisi — `formatMoney` `{ symbol }` e `Api.pipelineYears.create(year, active)`

**Files:**
- Modify: `js/lib/money.js:33-41`
- Modify: `js/api.js:175`
- Test: `js/lib/money.test.js`
- Modify: ogni `?v=` di `js/lib/money.js` (5 → 6) e di `js/api.js` (8 → 9) nel repo

**Interfaces:**
- Produces: `formatMoney(amount, code, currencies, { rounded = false, symbol = true } = {})` — con `symbol: false` restituisce solo `nf.format(...)` (stesso locale, cifre e raggruppamento). `Api.pipelineYears.create(year, active)` — se `active !== undefined` il body è `{ year, active }`, altrimenti `{ year }`.

- [ ] **Step 1: Test (falliscono)** in `money.test.js`, `describe('formatMoney symbol option')`:
  - `formatMoney(1234.5, 'EUR', C, { symbol: false })` → `'1.234,50'`; `{ rounded: true, symbol: false }` → `'1.235'`.
  - GBP (locale della fixture del file) `{ rounded: true, symbol: false }` → stesso numero di `formatMoney(..., { rounded: true })` senza il prefisso `symbol + ' '`.
  - default invariato: `formatMoney(1234.5, 'EUR', C)` → `'€ 1.234,50'`.
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/money.test.js`. Atteso: FAIL sui nuovi casi.
- [ ] **Step 3: Implementa** le due firme sopra.
- [ ] **Step 4: Bump** `money.js?v=5` → `?v=6` e `api.js?v=8` → `?v=9` in ogni riferimento (`.html` e import `.js`, es. `js/lib/master-clients.js:6`).
- [ ] **Step 5: Rilancia** — `npx vitest run js/lib/money.test.js js/lib/money-guard.test.js js/lib/foundations-guard.test.js js/lib/dates-guard.test.js`. Atteso: PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(money): formatMoney symbol option; pipelineYears.create takes active"`

---

### Task 2: Modulo puro `js/lib/master-pipelines.js` + characterization

**Files:**
- Create: `js/lib/master-pipelines.js` (ES module, `window.<name> = <name>` per ogni export)
- Test: `js/lib/master-pipelines.test.js`

**Interfaces:**
- Produces (tutte pure, nessun accesso a `window` salvo il bridge):
  - `parseMdpUrl(search: string) → { year: number|null, pot: string|null, phasing: 'proposal'|'project'|null }` — `year` intero 2000–2100 o `null`; `pot` solo con `year`; `phasing` solo con `year` e solo i due valori; `pot` e `phasing` insieme → vince `phasing`, `pot` `null`.
  - `buildMdpUrl({ year, pot, phasing }) → string` — `''` per la lista, altrimenti `'?year=Y'` + `&pot=` o `&phasing=`.
  - `resolvePot(pots, id) → pot|null`.
  - `potCountByYear(pots) → { [year]: number }`.
  - `achievement(achieved, target) → number|null` — `Math.round(achieved / target * 100)`, `null` se `target` ≤ 0 o non finito.
  - `gapToTarget(target, ca) → { gap: number, over: number }`.
  - `outsidePotCommitted(summary, pots) → number|null` — `summary` = righe `{ pipeline, count, total }`; Committed − Σ `committed_total`; `null` se ≤ 0.
  - `potClientIds(pot, groups) → Set<string>`.
  - `availableTargets({ type: 'client'|'group', pots, clients, groups }) → [{ value, label, disabled? }]` — client: `__unassigned__` "Unassigned / To be Identified", `__newbiz__` "New Biz", divisore `{ value: '__sep__', label: '──────────', disabled: true }`, client per nome; group: gruppi per nome; escluso ogni target con un POT in `pots` (per `client_id`, `client_group_id`, o `special_label` corrispondente).
  - `ACTIVE_STAGES = ['SIP', 'Expected', 'Anticipated', 'Committed']`.
  - `rowMonthAmount(row, month) → number` — `row.months[month]` numero o `.amount`, mancante = 0.
  - `rowCurrency(row) → string` — `(row.currency || 'EUR').trim() || 'EUR'`.
  - `filterPhasingRows(rows, { stages = [], clientId = '', potClients = null }) → rows`.
  - `phasingTotals(rows, months, mode: 'eur'|'original') → [{ currency, count, months: { [m]: number }, total }]` — `'eur'`: un elemento `currency: 'EUR'`, importi / (`currencyRate || 1`); `'original'`: un elemento per `rowCurrency`, EUR prima poi per codice.
  - `stageCounts(rows) → { SIP, Expected, Anticipated, Committed }` sulle righe di `ACTIVE_STAGES`.

- [ ] **Step 1: Characterization (fallisce: modulo assente).** Fixture `PROPOSAL` con 5 righe su `months = ['2026-01','2026-02']`: EUR Committed client `c1` `{ '2026-01': { amount: 100 } }`; GBP Anticipated `c2` `currencyRate: 0.8` `{ '2026-01': { amount: 80 }, '2026-02': { amount: 40 } }`; SIP `c1` senza mesi; Draft `c1` 999; Canceled `c2` 999. Fixture `PROJECT` con la stessa forma ma mesi numerici. Asserzioni, ricavate dall'algoritmo attuale di `phasingTableHtml`/`projectPhasingTableHtml`:
  - `filterPhasingRows(PROPOSAL, {})` → 3 righe (Draft e Canceled fuori); `{ stages: ['Committed'] }` → 1; `{ clientId: 'c2' }` → solo la GBP.
  - `phasingTotals(filtered, months, 'eur')[0].months` → `{ '2026-01': 200, '2026-02': 50 }`, `total` 250 (100 + 80/0.8 + 40/0.8); stesso risultato su `PROJECT`.
- [ ] **Step 2: Test del resto** (falliscono): `parseMdpUrl` (`''`, `'?year=2026'`, `'?year=2026&pot=abc'`, `'?year=2026&phasing=project'`, `'?year=abc'` → tutto `null`, `'?year=2026&phasing=x'` → `phasing null`, `'?pot=abc'` → `pot null`), round-trip con `buildMdpUrl`; `resolvePot` con id assente → `null`; `potCountByYear`; `achievement(50, 0)` → `null`, `achievement(306670, 510000)` → 60; `gapToTarget(510000, 298170)` → `{ gap: 211830, over: 0 }`, `gapToTarget(60000, 60020)` → `{ gap: 0, over: 20 }`; `outsidePotCommitted` → 8500 su summary Committed 90040 e POT 60020 + 21520, `null` quando Σ POT ≥ Committed; `potClientIds` client / gruppo (client del gruppo) / General (vuoto); `availableTargets` (speciali + divisore + ordine, esclusione per client, gruppo e `special_label`); `filterPhasingRows` con `potClients` di un gruppo; **Review Focus 3**: `currencyRate: 0` e `null` → divisore 1; **Review Focus 4**: righe `'GBP '` e `currency: null` in `'original'` → due elementi `EUR` e `GBP`, mai una somma fra valute; `stageCounts`.
- [ ] **Step 3: Lancia** — `npx vitest run js/lib/master-pipelines.test.js`. Atteso: FAIL (modulo assente).
- [ ] **Step 4: Implementa** le firme dell'Interfaces block.
- [ ] **Step 5: Rilancia** — stesso comando. Atteso: PASS.
- [ ] **Step 6: Commit** — `git add js/lib/master-pipelines.js js/lib/master-pipelines.test.js && git commit -m "feat(master-pipelines): pure module for URL state, POT summary and phasing totals"`

---

### Task 3: Livelli con URL, wide mode e lista pipeline

Boards: `docs/superpowers/design/MD-Pipeline-Pots/10.4a-pipelines-list.jpg`, `10.4b-new-year-inline.jpg`. Prima di chiudere apri le due tavole e confronta testata, colonne, switch, barra achievement, menu "⋯", riga nuovo anno e nota (lo switch resta `.md-switch` navy, spec §3).

**Files:**
- Modify: `master-pipelines.html` (script: `js/lib/master-pipelines.js?v=1` module, `js/cg-controls.js?v=5` defer e `css/controls.css?v=1`, registrazione `app.component('cg-select', window.CgSelect)`; stato di livello; vista A)
- Modify: `css/style.css` (`.md-layout--wide`), bump `style.css?v=32` → `?v=33` ovunque
- Test: `js/lib/master-data-guard.test.js`, `js/lib/master-pipelines-pot-details.test.js`

**Interfaces:**
- Consumes: Task 1 `Api.pipelineYears.create(year, false)`; Task 2 `parseMdpUrl`, `buildMdpUrl`, `potCountByYear`, `achievement`.
- Produces: in `data` `level: 'list'|'pots'|'phasing'`, `year: number|null`, `potId: string|null`, `phasingMode: 'proposal'|'project'`, `allPots: []`; metodi `go(state, { replace = false } = {})` (scrive l'URL con push/replace e chiama `applyState`), `applyState({ year, pot, phasing })` (carica i dati del livello, aggiorna breadcrumb con `window.updateBreadcrumbs`, attiva `md-layout--wide` su `document.querySelector('.md-layout')` solo in phasing); `onPopState` su `window.popstate`. `activePipeline` resta un computed derivato da `year` (lo leggono `savePot`/`loadPots`).

- [ ] **Step 1: Guard (falliscono)**:
  - `master-data-guard`: `css/style.css` contiene `.md-layout--wide .md-subnav { display: none` e una regola `.md-layout--wide .md-content`; il `must` di `master-pipelines.html` diventa `['window.__cfgApp', 'parseMdpUrl(', 'popstate', 'this.yearTotals    = yearTotals;']`.
  - `master-pipelines-pot-details.test.js`: rimuovi "shows E and S in the year row"; aggiungi "creates a pipeline hidden" (`createPipelineYear` contiene `Api.pipelineYears.create(year, false)`), "disables delete when the year has offers" (`:disabled="py.offers > 0` e il testo `Hide it instead.`), "toggles with the switch disabled while saving" (`class="md-switch"` e `:disabled="py._toggling"`), "has no native dialogs" (nessun `confirm(` né `alert(` nella pagina).
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-data-guard.test.js js/lib/master-pipelines-pot-details.test.js`. Atteso: FAIL sui nuovi casi.
- [ ] **Step 3: Implementa** il routing (stato da `parseMdpUrl(location.search)` dopo `loadAll`, anno sconosciuto → `globalError` "Pipeline <anno> not found." e `go({}, { replace: true })`), `.md-layout--wide`, e la vista A della spec §5: tabella, switch, `GET /pots` senza anno per `potCountByYear`, menu "⋯" locale (Esc / click fuori lo chiudono), delete con `showConfirm`, riga nuovo anno con hint e validazione, nota, vuoto. Rimuovi `openPhasingView`/`openProjectPhasingView`/`backToPipelines`/`selectPipeline` come entrate: le sostituiscono `go(...)`.
- [ ] **Step 4: Rilancia** — stesso comando + `npx vitest run js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js js/lib/page-head-guard.test.js`. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(master-pipelines): URL levels, wide mode and the redesigned pipeline list"`

---

### Task 4: POT targets — riepilogo, tabella, nuovo POT, edit target

Boards: `docs/superpowers/design/MD-Pipeline-Pots/10.4c-pot-targets.jpg`, `10.4d-new-pot-inline.jpg`, `10.4e-edit-target.jpg`. Prima di chiudere confronta testata, card riepilogo (barra con tacca Target, gap), tessere stage, colonne e barra della tabella, riga nuovo POT, editor sotto la riga e nota fuori-POT. Hint "Clients already in a group POT are not listed" e "· N proposals" **non** si riproducono (spec §3).

**Files:**
- Modify: `master-pipelines.html` (vista B)
- Test: `js/lib/master-pipelines-pot-details.test.js`, `js/lib/master-pipelines-pot-input-guard.test.js` (invariato)

**Interfaces:**
- Consumes: Task 2 `gapToTarget`, `achievement`, `outsidePotCommitted`, `availableTargets`; Task 3 `go`, `year`.
- Produces: `potf` con gli stessi campi di oggi (`show, id, targetType, targetId, year, amountText, stored, note, targetLabel, error, loading`) — `id` nullo = riga nuovo POT, altrimenti editor sotto la riga con quell'id; metodo `openPotForm(pot)` invariato nel nome; `invalidatePotDetails(id)` che svuota la cache del drawer (Task 5).

- [ ] **Step 1: Test (falliscono)** in `master-pipelines-pot-details.test.js`: sostituisci "has Expected and SIP columns after Anticipated" e "renders the Expected and SIP totals" con "folds E and SIP into the achievement bar" (nessun `<th`…`>Expected</th>`/`>SIP</th>` nella tabella POT; la riga blu contiene `in SIP / Expected` e somma `expected_total` + `sip_total`); "keeps achievement on achieved_total" (`achievement(+pot.achieved_total`); "Update target needs a reason" (`:disabled` del bottone Update target contiene `!potf.note` o `potf.note.trim()`); "keeps the server error under the row" (in `savePot` il ramo `catch` scrive `potf.error` e non chiude `potf.show`); "outside-POT note hidden when null" (`v-if="outsideCommitted != null"` o equivalente su `outsidePotCommitted(`).
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-pipelines-pot-details.test.js js/lib/master-pipelines-pot-input-guard.test.js`. Atteso: FAIL sui nuovi casi, input guard ancora verde.
- [ ] **Step 3: Implementa** spec §6: testata con bottoni phasing (`go({ year, phasing: 'proposal' })`), card riepilogo, tessere stage, tabella POT con pillole e sotto-riga dei client del gruppo, delete con `showConfirm`, nota fuori-POT, riga nuovo POT (`.md-seg` + `<cg-select :options="availableTargets(...)">` + input `potf.amountText` con gli stessi attributi di oggi), editor sotto la riga (stesso input, motivo, "Current € …", Update target). Mantieni gli attributi pinnati dall'input guard sull'input (`type="text" inputmode="decimal" v-model="potf.amountText" @focus="onPotAmountFocus" @blur="onPotAmountBlur" @keydown.enter="savePot"`) in **entrambe** le righe; label del simbolo via `currencyInfo('EUR', activeCurrencies).symbol`. Rimuovi `stageColor`/`stageBg`.
- [ ] **Step 4: Rilancia** — stesso comando. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(master-pipelines): POT summary, POT table, inline new POT and edit target"`

---

### Task 5: Drawer dettaglio POT

Boards: `docs/superpowers/design/MD-Pipeline-Pots/10.4f-pot-detail-drawer.jpg`. Prima di chiudere confronta testa, progresso, tessere, elenco proposte (attenuate SIP/Expected) e timeline della storia.

**Files:**
- Modify: `master-pipelines.html` (rimuovi `#potDetailsModal` e il corpo `innerHTML` di `openPotDetails`; drawer Vue + stili nel `<style>`)
- Test: `js/lib/master-pipelines-pot-details.test.js`

**Interfaces:**
- Consumes: Task 3 `go({ year, pot })`, `potId`; Task 4 `openPotForm(pot)`, `invalidatePotDetails(id)`; Task 2 `resolvePot`, `gapToTarget`, `achievement`.
- Produces: in `data` `potDetails: { [id]: { loading, error, data } }`; computed `drawerPot` (`resolvePot(pots, potId)`); `closeDrawer()` = `go({ year })`.

- [ ] **Step 1: Test (falliscono)**: la sezione "POT details" del file legge ora il template del drawer (`class="mdp-drawer"`) e non più `openPotDetails`'s `innerHTML`; restano le asserzioni su valuta originale solo per non EUR (`value_original` dentro un `v-if` su `currency !== 'EUR'`), nessun hex, token stage (`var(--pipeline-`), link `/costgrid.html?cgId=`; nuovi: nessun `id="potDetailsModal"`, nessun `innerHTML` nella pagina, Esc chiude (`keydown` con `Escape` → `closeDrawer`), scrim con `@click="closeDrawer"`, testo `Only Committed and Anticipated count towards the target.`; **Review Focus 1**: un `potId` senza `drawerPot` non rende il drawer (`v-if` su `drawerPot`).
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-pipelines-pot-details.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementa** spec §7; caricamento con `Api.pots.details(id, year)` la prima volta che il drawer si apre per quell'id, skeleton e errore nel drawer; "Edit target" chiude il drawer e chiama `openPotForm`; nomi e date con `fmtDate`.
- [ ] **Step 4: Rilancia** — stesso comando. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(master-pipelines): POT details as a Vue drawer"`

---

### Task 6: Phasing (proposal / project)

Boards: `docs/superpowers/design/MD-Pipeline-Pots/10.5a-project-phasing.jpg`, `10.5b-proposal-phasing.jpg`. Prima di chiudere confronta testata con segmented, toolbar, testate dei mesi (corrente e passati), riga di totale, sotto-righe con pillola valuta e piede. Righe "No project yet", "· N projects" e la frase sull'export **non** si riproducono (spec §3).

**Files:**
- Modify: `master-pipelines.html` (viste C e D unite; rimuovi `phasingTableHtml`, `projectPhasingTableHtml`, `v-html`)
- Test: `js/lib/master-pipelines-pot-details.test.js` (sezione phasing)

**Interfaces:**
- Consumes: Task 1 `formatMoney(..., { rounded: true, symbol: false })`; Task 2 `filterPhasingRows`, `phasingTotals`, `stageCounts`, `potClientIds`, `rowMonthAmount`, `rowCurrency`; Task 3 `go`, `phasingMode`, `md-layout--wide`.
- Produces: in `data` `phasing: { proposal: null, project: null }` (dati per modalità, caricati una volta), `phFilter: { stages: [], clientId: '', potId: '' }`, `phAmounts: 'eur'|'original'`.

- [ ] **Step 1: Test (falliscono)**: nessun `v-html` nella pagina; Export XLS solo con `phasingMode === 'proposal'` e href `/api/exports/phasing?year=`; link `/portfolio.html?projectId=` in modalità project; `phasingTotals(` chiamato con `phAmounts`; `symbol: false` nelle celle; testi `No phasing yet`, `No rows match the current filters.`, `Past months`; il POT select esclude i General (`special_label`).
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-pipelines-pot-details.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementa** spec §8: contenitore, segmented di modalità con `go(..., { replace: true })`, toolbar (chip con `stageCounts`, `<cg-select>` Client e POT, Clear, segmented Amounts), tabella template con nome sticky, testata sticky, mese corrente da `new Date()` (formato `YYYY-MM`), mesi passati, totali da `phasingTotals`, celle arrotondate senza simbolo con tooltip `formatMoney` pieno, righe senza importi, vuoti e piede.
- [ ] **Step 4: Rilancia** — `npx vitest run js/lib/master-pipelines-pot-details.test.js js/lib/money-guard.test.js`. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(master-pipelines): proposal and project phasing with filters and currency modes"`

---

### Task 7: Responsive — tablet e smartphone

Boards: `docs/superpowers/design/MD-Pipeline-Pots/10.4g-tablet-smartphone.jpg` (tablet POT targets 1024×768, phone lista 390×844, phone dettaglio POT 390×844). Prima di chiudere confronta ogni frame col proprio shoot.

**Files:**
- Modify: `master-pipelines.html` (`<style>` con media query; markup phone: card pipeline, card POT, dettaglio a schermo intero con barra in fondo e bottom sheet; menu "Phasing ▾" su tablet)
- Test: `js/lib/master-data-guard.test.js`

**Interfaces:**
- Consumes: Task 3–6 markup e stato; `potf` per il bottom sheet.
- Produces: nessuna nuova interfaccia.

- [ ] **Step 1: Guard (falliscono)** — lo `<style>` di `master-pipelines.html` ha `@media (max-width: 1023.98px)` con controlli a 40px e la colonna POTs nascosta, e `@media (max-width: 767.98px)` con `min-height: 44px` su "+ Add year", "⋯", piede delle card e righe delle proposte; la colonna nome della phasing ha `position: sticky`.
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-data-guard.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementa** spec §9; il markup phone si alterna al desktop via media query, una sola fonte di dati.
- [ ] **Step 4: Rilancia** — stesso comando. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(master-pipelines): tablet and phone layouts"`

---

### Task 8: Verifica visiva, documentazione, caso manuale

Boards: tutte le tavole di `docs/superpowers/design/MD-Pipeline-Pots/` (mappa nella spec §3).

**Files:**
- Modify: `docs/pages/config.md` (sezione "Pipelines & POTs (2026-11-04, Master Data phase 2)": livelli e URL, drawer, phasing, regole invariate, deviazioni accettate con il motivo, la discrepanza ore dell'export `days * 8` vs `days` di brief §7.5)
- Modify: `TEST_CASES.md` (caso `MD-15`: livelli e back/forward, nuovo anno Hidden, delete pipeline, nuovo POT, edit target, drawer, phasing EUR / original)
- Modify: `master-pipelines.html` solo per i fix-ora decisi

- [ ] **Step 1: Stack del branch** — `scripts/test-branch.sh up` (worktree con `.env` copiato), poi `scripts/test-branch.sh status` → `up`.
- [ ] **Step 2: Shoot** (spec §12) con `--base http://localhost:8081 --settle 3000`, credenziali `SHOOT_EMAIL`/`SHOOT_PASSWORD`: a 1440 lista (`--full`), nuovo anno, `?year=<anno con POT>`, nuovo POT, edit target, `&pot=<id>`, `&phasing=proposal`, `&phasing=project`; a 1024 POT targets; a 390 lista e `&pot=<id>`. Gli stati interattivi con `--eval`.
- [ ] **Step 3: Rileggi ogni PNG con `Read`** e confrontalo con la sua tavola; presenta all'utente gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra e **aspetta la decisione**.
- [ ] **Step 4: Applica** i fix-ora (test mirato se esiste), scrivi gli "accetta" con il motivo in `docs/pages/config.md`, aggiungi `MD-15` a `TEST_CASES.md`.
- [ ] **Step 5: Verifica** — `npx vitest run js/lib/test-cases-parse.test.js scripts/doc-paths-guard.test.js scripts/claude-md-guard.test.js js/lib/master-data-guard.test.js js/lib/master-pipelines-pot-details.test.js`. Atteso: PASS.
- [ ] **Step 6: Commit** — `git add docs/pages/config.md TEST_CASES.md master-pipelines.html && git commit -m "docs(master-pipelines): Pipelines & POTs notes, accepted deviations and manual test case"`. Lo stack del branch resta su per il Gate 2.

---

## Decisioni aperte

1. **Esecuzione nativa, non subagent-driven.** Alternativa scartata: subagent-driven. Perché: §6.1 richiede task indipendenti, e i Task 3–7 riscrivono lo stesso `master-pipelines.html` uno sopra l'altro.
2. **Lo stato di livello vive in `level`/`year`/`potId`/`phasingMode` e `activePipeline` diventa un computed.** Alternativa scartata: conservare le tre variabili oggetto di oggi. Perché: un solo punto (`applyState`) legge l'URL, e `savePot`/`loadPots` continuano a leggere `activePipeline`.
3. **Il conteggio delle righe nelle chip stage si calcola sulle righe dell'anno prima dei filtri.** Alternativa scartata: conteggio dopo i filtri client/POT. Perché: le chip sono il filtro; contare dopo il filtro farebbe sparire i numeri mentre si seleziona.
4. **I dati di phasing si caricano una volta per modalità e restano in memoria finché si resta sull'anno.** Alternativa scartata: ricaricare a ogni switch. Perché: lo switch conserva i filtri e non deve far lampeggiare la tabella.
5. **La characterization pinna i numeri dell'algoritmo attuale su fixture scritte a mano, non eseguendo le computed vecchie.** Alternativa scartata: estrarre le computed e confrontarle a runtime. Perché: le computed producono HTML e spariscono nel Task 6.
