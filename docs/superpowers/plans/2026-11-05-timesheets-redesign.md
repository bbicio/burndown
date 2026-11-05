# Timesheets — Actuals e Profile processing (redesign) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-05-timesheets-redesign-design.md`
**Branch:** `timesheets-redesign`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/lib/md-subnav.js` da 4 pagine Master Data, `js/lib/icons.js` da 18 pagine, `css/style.css` da tutte)

**Goal:** `timesheets.html` e `profile-jobs.html` diventano le due voci "Actuals" e "Profile processing" della sezione Timesheets delle tavole 11.1–11.3: header condiviso, sub-nav con badge della coda, lista raggruppata per client, strip + drawer + tabella a colonne fuse + Run history, layout tablet/phone; nessuna emoji, nessun dialogo nativo, nessun hex.

**Architecture:** La sub-nav Master Data (`js/lib/md-subnav.js`) diventa un registro di insiemi di sezioni con un setter di badge; le due pagine montano l'insieme `timesheets` in uno shell statico fuori dal root Vue. La logica pura della lista Actuals va nel nuovo `js/lib/timesheets-list.js`; quella di Profile processing estende `js/lib/profile-jobs-ui.js`. Drawer e bottom sheet sono overlay Vue locali alla pagina (pattern `.mdp-drawer`). Nessuna API toccata.

**Tech Stack:** HTML statico + Vue 3 da CDN, Bootstrap 5.3 (CSS + dropdown JS), vitest + jsdom, `scripts/shoot.mjs`.

**Tasks independent?** No: i Task 5–8 modificano le stesse due pagine uno sopra l'altro e consumano i moduli dei Task 1–4.

**Prerequisito di sequenza:** il worktree si crea (PROCESS.md §6.1b) solo dopo il merge di `master-data-currencies` su `main`; i valori `?v=` di partenza si leggono su quel `main`, non da questo piano.

## Global Constraints

- Copy in inglese, sentence case, testi esatti della spec §4–§10. Invariati: "Enter a whole number of minutes between 1 and 1440.", il testo di conferma del Delete (`Delete ALL timesheet data for project "CODE"?\n\nThis removes N upload(s) (M rows). This cannot be undone.`), i testi di conferma di Rebuild all e Remove from queue, i messaggi 409/timeout/rete, il testo guida di Profile processing.
- Nessuna emoji (👁 ⬇ 🗑 📂 ⚠ ↺ ▴ ▾ ▲ ▼ inclusi: gli indicatori di sort diventano chevron SVG), nessun `confirm(`/`alert(` nelle due pagine.
- Nessun hex nei `<style>` delle due pagine: solo token di `css/tokens.css`.
- Icone solo via `iconSvg()`/`<ph-icon>` da `js/lib/icons.js`.
- Primary = `.btn-primary` magenta (Recalculate now, Save schedule).
- Breakpoint: desktop ≥ 1024px, tablet 768–1023.98px, phone < 768px; controlli 40px su tablet, ≥ 44px su phone.
- Cache-busting: ogni file versionato modificato sale di uno, e ogni suo riferimento `?v=` nel repo sale allo stesso valore (grep del path prima del commit).
- `#app-shell`/`#app-main` senza `overflow`/`transform`/`filter`/`contain`/`will-change`/`position` (`nav-shell-guard`).
- Durante i task solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack: verifiche contro `scripts/test-branch.sh`.
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM).

## Review Focus

1. **Codice senza progetto (`client_name`/`project_name` null)** — finisce nel gruppo "No client" in fondo, il progetto si mostra "—", il sort per Project non lo fa saltare in testa; test nel Task 3.
2. **Doppio click su Delete actuals / Download / Process** — una sola richiesta: `deleteCode` esce se `row._loading`, `downloadXlsx` se `row._downloading`, le azioni di Profile processing restano dietro `busyAction`; guard nel Task 5 e nel Task 6.
3. **Refresh da 15 s con il drawer aperto e modificato, o con la banda d'errore aperta** — toggle/intervallo non sovrascritti (`keepForm`), banda ancora aperta per lo stesso codice; guard nel Task 6.
4. **`queuedCount` assente, stringa o negativo** — badge nascosto per non-numeri e ≤ 0, `"3"` mostra 3; test nel Task 1.
5. **Filtri che svuotano un gruppo** — il gruppo sparisce, la meta conta solo i codici filtrati; test nel Task 3.

---

### Task 1: Sub-nav generalizzata con badge

**Files:**
- Modify: `js/lib/md-subnav.js`, `js/lib/md-subnav.test.js`, `css/style.css` (blocco "Master Data sub-navigation"), `master-clients.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html` (solo `?v=` di `md-subnav.js` e `style.css`), ogni altro `.html` con `css/style.css?v=` (solo `?v=`)

**Interfaces:**
- Produces: `SUBNAV_SETS` (`{ masterData: { label: 'Master Data', sections: MD_SECTIONS }, timesheets: { label: 'Timesheets', sections: [{ group: 'TIMESHEETS', items: [{ id: 'actuals', label: 'Actuals', href: '/timesheets.html' }, { id: 'profileJobs', label: 'Profile processing', href: '/profile-jobs.html' }] }] } }`); `mdSubnavHtml(activeId: string, setId = 'masterData'): string`; `mountMdSubnav(root = document)` (legge `data-subnav-set`, assente = `masterData`); `setSubnavBadge(id: string, count: unknown, title = ''): void`; tutti bridged su `window`.

- [ ] **Step 1: Test** in `md-subnav.test.js`: `SUBNAV_SETS.timesheets` con il gruppo e le due voci sopra; `mdSubnavHtml('profileJobs', 'timesheets')` marca attiva solo `/profile-jobs.html`, gruppo `TIMESHEETS`, `select` con `aria-label="Timesheets section"`; `mdSubnavHtml('roles')` invariato e con `aria-label="Master Data section"`; `mountMdSubnav` su `<nav class="md-subnav" data-subnav-set="timesheets" data-md-active="actuals">` rende l'insieme timesheets; `setSubnavBadge('profileJobs', 3, '3 project codes waiting for profile processing')` mette un `.md-subnav-badge` con testo `3` e quel `title` nella voce della lista e un `.md-subnav-select-badge` con testo `3 queued` nella riga del selettore, qualunque sia la voce attiva (brief §12: "TIMESHEETS · Actuals ▾" con "3 queued"); `setSubnavBadge('profileJobs', '3')` → 3; `0`, `-1`, `undefined`, `'x'` → nessun badge (rimuove quello esistente).
- [ ] **Step 2: Run** `npx vitest run js/lib/md-subnav.test.js` → FAIL sui nuovi casi.
- [ ] **Step 3: Implementa** in `md-subnav.js`. Il badge è uno `<span>` aggiunto dentro la `<a>` (la voce resta `justify-content: space-between`, già così da desktop). CSS in `style.css`: `.md-subnav-badge` (pill, `--color-warning-bg`/`--color-warning-text`, 10px bold, `border-radius: var(--radius-full)`, padding `0 6px`, height 18px) e `.md-subnav-select-badge` (stessa pillola, `margin-left: auto` prima del chevron, la chevron perde il suo `margin-left:auto` quando il badge c'è: `.md-subnav-select-badge + .md-subnav-select-chevron { margin-left: var(--space-2); }`).
- [ ] **Step 4: Run** `npx vitest run js/lib/md-subnav.test.js js/lib/master-data-guard.test.js` → PASS.
- [ ] **Step 5: Bump** `md-subnav.js` e `style.css` di uno in tutti i riferimenti (grep `md-subnav.js?v=`, `css/style.css?v=`); `npx vitest run js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js` → PASS.
- [ ] **Step 6: Commit** `feat(subnav): section sets and queue badge for the shared sub-nav`.

### Task 2: Icone nuove

**Files:**
- Modify: `js/lib/icons.js`, `js/lib/icons.test.js`, ogni `.html` con `js/lib/icons.js?v=` e ogni import `./icons.js?v=` in `js/lib/` (solo `?v=`)

**Interfaces:**
- Produces: icone `folder`, `sliders`, `sparkle`, `warning` (16×16, `stroke="currentColor"`, `stroke-width` come le altre, `fill="none"`).

- [ ] **Step 1: Test** in `icons.test.js`: `iconSvg(name)` per i quattro nomi restituisce un `<svg class="pd-icon"` con almeno un `<path`/`<rect`/`<circle` e nessun hex.
- [ ] **Step 2: Run** `npx vitest run js/lib/icons.test.js` → FAIL.
- [ ] **Step 3: Implementa** i quattro path (forme: cartella con linguetta; tre linee orizzontali con tre cursori; stella a quattro punte; triangolo con punto esclamativo).
- [ ] **Step 4: Bump** `icons.js` di uno in ogni riferimento (`.html` e import fra moduli `js/lib/`); `npx vitest run js/lib/icons.test.js js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(icons): folder, sliders, sparkle and warning icons`.

### Task 3: Modulo puro `js/lib/timesheets-list.js`

**Files:**
- Create: `js/lib/timesheets-list.js`, `js/lib/timesheets-list.test.js`

**Interfaces:**
- Produces (export + bridge `window.*`):
  - `filterTimesheetRows(rows, { year = 0, clients = [], projects = [], code = '' }): Row[]` — regole attuali di `filteredRows` (anno 0 = tutti; code case-insensitive `includes`).
  - `hasActiveFilters({ year, clients, projects, code }): boolean`.
  - `nextSortState({ sortBy, sortDir }, field): { sortBy: string|null, sortDir: 'asc'|'desc' }` — nuovo campo → asc; asc → desc; desc → `{ sortBy: null, sortDir: 'asc' }`.
  - `groupTimesheetRows(rows, { sortBy = null, sortDir = 'asc' }): Group[]` con `Group = { key: string, label: string, rows: Row[], codes: number, totalRows: number }`; `key` = `client_name` o `''` per i senza client, `label` = `client_name` o `'No client'`.
  - `NO_CLIENT_LABEL = 'No client'`.

- [ ] **Step 1: Test**, con righe `{ project_code, client_name, project_name, uploads, total_rows, pipeline_year }`:
  - gruppi in ordine alfabetico case-insensitive (`localeCompare` con `sensitivity: 'base'`), "No client" sempre ultimo, anche con `sortBy: 'client_name', sortDir: 'desc'` (che inverte gli altri gruppi);
  - `totalRows` = somma di `total_rows` del gruppo, `codes` = numero di righe;
  - senza sort le righe di un gruppo restano nell'ordine d'ingresso;
  - `sortBy: 'project_name'` / `'project_code'` ordina dentro i gruppi asc/desc senza cambiare l'ordine dei gruppi; `project_name` null va in fondo in entrambe le direzioni;
  - un gruppo che resta senza righe dopo `filterTimesheetRows` non compare;
  - `nextSortState` sui tre passaggi; `hasActiveFilters` vero per ciascun filtro e falso con tutti vuoti e `year: 0`;
  - `filterTimesheetRows` con anno, client, progetto, codice (`'mita'` trova `MITA.000001201`).
- [ ] **Step 2: Run** `npx vitest run js/lib/timesheets-list.test.js` → FAIL.
- [ ] **Step 3: Implementa** il modulo (nessuna dipendenza).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(timesheets): pure list grouping, filters and sort`.

### Task 4: Estensioni di `js/lib/profile-jobs-ui.js`

**Files:**
- Modify: `js/lib/profile-jobs-ui.js`, `js/lib/profile-jobs-ui.test.js`, `profile-jobs.html` (solo `?v=`)

**Interfaces:**
- Produces: `describeNextRunShort(schedule, project): string` — `''` se `!project.queued_at`; `'Next paused'` se `state === 'paused'`; `'Next HH:MM'` (ora locale) se `state === 'scheduled'` con `nextRunAt` valido; altrimenti `'Next within 60 s'`. `formatTimeShort(value): string` — `'HH:MM'` locale o `''`. `settingsState(form, saved): { dirty: boolean, valid: boolean, canSave: boolean }` — `valid` = `Number.isInteger(form.intervalMin)` e 1 ≤ x ≤ 1440; `dirty` = `enabled` o `intervalMin` diversi da `saved`; `canSave = dirty && valid`.

- [ ] **Step 1: Test** dei tre export con i valori sopra (incluso `intervalMin` `0`, `1441`, `1.5`, `''`, `NaN` → `valid: false`; stesso valore → `dirty: false`).
- [ ] **Step 2: Run** `npx vitest run js/lib/profile-jobs-ui.test.js` → FAIL.
- [ ] **Step 3: Implementa** riusando `toTime`; `describeNextRun` invariato.
- [ ] **Step 4: Run** → PASS; bump `profile-jobs-ui.js?v=` in `profile-jobs.html`.
- [ ] **Step 5: Commit** `feat(profile-jobs): short next-run text and settings state helpers`.

### Task 5: Actuals — shell, lista raggruppata, menu, modal View (desktop)

Boards: `docs/superpowers/design/timesheets/redesign/11.1a-actuals-grouped.jpg`, `11.1c-view-modal.jpg`, `11.1d-row-menu-delete.jpg`, `11.1f-no-match.jpg`, `Timesheets.dc.html` (`variant=B`, stati `view`, `menu`, `empty`, `nomatch`). Prima di chiudere apri le tavole e confronta: `.ph` e sub-nav, riga filtri, nota info, header colonne, header di gruppo con chevron e meta, chip del codice, Rows in grassetto, View / Download / "⋯", menu con riga muted, modal (chip, "N rows", header sticky, righe 34px), stati vuoti. Il "9" su Actuals **non** si riproduce (spec §4).

**Files:**
- Modify: `timesheets.html`
- Create: `js/lib/timesheets-pages-guard.test.js`
- Modify: `js/lib/page-head-guard.test.js`, `js/lib/page-names.test.js` se le loro voci per `timesheets.html` cambiano

**Interfaces:**
- Consumes: Task 1 (`data-subnav-set`, `setSubnavBadge`), Task 2 (icone), Task 3 (tutto il modulo).

- [ ] **Step 1: Guard (fallisce)** `timesheets-pages-guard.test.js`, sezione `timesheets.html`: contiene `<nav class="md-subnav" data-subnav-set="timesheets" data-md-active="actuals"`, fuori da `<div id="app"`; `.ph-title` "Timesheets" e il sottotitolo esatto; nessun `ph-btn`; nessun `confirm(`/`alert(`; nessuna emoji (regex `\p{Extended_Pictographic}` più `↺▴▾▲▼`); nessun `#[0-9a-fA-F]{3,8}\b` dentro `<style>`; contiene `Load Actuals` e non `Load XLS`; contiene `id="confirmModal"` e `showConfirm(`; carica `js/lib/timesheets-list.js?v=` e `js/lib/md-subnav.js?v=` prima dello script dell'app.
- [ ] **Step 2: Run** `npx vitest run js/lib/timesheets-pages-guard.test.js` → FAIL.
- [ ] **Step 3: Shell.** `.ph` statico + `.md-layout` > `nav.md-subnav` + `.md-content` > `#app` (spec §4). Badge: `loadProfileQueueCount()` chiama `setSubnavBadge('profileJobs', data.queuedCount, n + ' project code(s) waiting for profile processing')`; in errore `setSubnavBadge('profileJobs', 0)`.
- [ ] **Step 4: Card Actuals** (spec §5). Stato Vue: `filters` = `{ year, clients, projects, code }`, `sort` = `{ sortBy, sortDir }`, `collapsed` = `{}` per chiave di gruppo; computed `groups` = `groupTimesheetRows(filterTimesheetRows(rows, filters), sort)`. Indicatore di sort = `chevronDown` ruotato (asc su) o niente. `deleteCode(row)` → `showConfirm(<testo attuale>, async () => { … })` con guard `row._loading`, spinner sul "⋯". `downloadXlsx(row)` con guard e `row._downloading`, spinner al posto dell'icona, `finally` lo resetta. Menu "⋯" = dropdown Bootstrap (`data-bs-toggle="dropdown"`, Esc e click esterno nativi). Aggiungi il markup `#confirmModal` di `profile-jobs.html` (titolo e bottone OK senza emoji: `showConfirm(msg, ok, null, 'Delete actuals')`). Stati vuoti con `iconSvg('folder')` / `iconSvg('search')` e il link Reset filters.
- [ ] **Step 5: Modal View** (spec §6): stesso markup di modal Vue, scrim con token, Esc via listener `keydown` aggiunto all'apertura e rimosso alla chiusura, `modal-fullscreen-md-down`, header sticky.
- [ ] **Step 6: CSS** locale `.ts-*` solo token; rimuovi le regole con hex.
- [ ] **Step 7: Run** `npx vitest run js/lib/timesheets-pages-guard.test.js js/lib/page-head-guard.test.js js/lib/page-names.test.js js/lib/nav-shell-guard.test.js js/lib/money-guard.test.js` → PASS (aggiorna le voci dei guard esistenti che cambiano, ed elencale nel messaggio di commit).
- [ ] **Step 8: Confronto con le tavole** dello stesso task, su `scripts/test-branch.sh up` a 1440px (`scripts/shoot.mjs --base http://localhost:8081 --settle 3000`), PNG riletti.
- [ ] **Step 9: Commit** `feat(timesheets): Actuals grouped list, row menu and restyled view modal`.

### Task 6: Profile processing — shell, alert, strip, drawer, tabella, Run history (desktop)

Boards: `11.2a-profile-processing.jpg`, `11.2b-settings-drawer.jpg`, `11.2c-error-expanded.jpg`, `11.2d-alerts.jpg`, `11.2e-run-history.jpg`, `ProfileProcessing.dc.html` (`variant=B`, stati `settings`, `errorOpen`, `alerts`, `history`, `empty`, `nomatch`). Confronta: sub-nav con badge giallo, alert con icone, strip (punto, Next run + last, sparkle, tre bottoni), drawer 440px (eyebrow, titolo, due sezioni con switch, helper, nota, footer), toolbar (switch segmentato con conteggi, ricerca 220px, select, contatore con punto verde), colonne fuse, pillole, "Next HH:mm" ambra, link rosso Remove from queue, banda d'errore, tabella Run history. Recalculate now magenta, non navy (spec §11).

**Files:**
- Modify: `profile-jobs.html`, `js/lib/timesheets-pages-guard.test.js`

**Interfaces:**
- Consumes: Task 1, Task 2, Task 4 (`describeNextRunShort`, `formatTimeShort`, `settingsState`).

- [ ] **Step 1: Guard (fallisce)**, sezione `profile-jobs.html`: sub-nav `data-md-active="profileJobs"` fuori da `#app`; `.ph-title` "Timesheets" e lo stesso sottotitolo; nessun `<details`; nessun `confirm(`/`alert(`/emoji/hex in `<style>`; contiene `showConfirm(` per Rebuild e Remove; contiene `Run history` e `Project codes` dentro un `md-seg`; contiene `settingsState(`; il `refresh()` chiama `setSubnavBadge(`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Shell e badge** (spec §4): `refresh()` riuscito → `setSubnavBadge('profileJobs', queuedCount, …)`; fallito → `setSubnavBadge('profileJobs', 0)`.
- [ ] **Step 4: Alert e strip** (spec §7). `settingsDirty`/`intervalValid` passano da `settingsState(form, settings)`; `busyAction`, `refreshSeq`, `keepForm` invariati.
- [ ] **Step 5: Drawer** (spec §7): `drawerOpen`; `closeDrawer()` riporta `form` a `settings` (copia) e chiude; Esc, scrim, ✕, Close; focus trap come `master-roles.html` (`.mdr-drawer` keydown); controlli `:disabled="!!busyAction"`; Save → alert verde "Saved — applies on the next tick (within 60 s)." e il drawer resta aperto.
- [ ] **Step 6: Tabella e Run history** (spec §8–§9): `view = 'codes' | 'history'` (default `'codes'`, non persistito); sort `code` sulla colonna fusa, `status`, `lastProcessed`; seconda riga `describeNextRunShort(schedule, p)`; banda `expanded[p.project_code]`, `colspan` = numero di colonne; link "Clear search and status".
- [ ] **Step 7: Run** `npx vitest run js/lib/timesheets-pages-guard.test.js js/lib/profile-jobs-ui.test.js js/lib/page-head-guard.test.js js/lib/nav-shell-guard.test.js` → PASS.
- [ ] **Step 8: Confronto con le tavole** a 1440px: stati popolato, drawer aperto, banda aperta, Run history; PNG riletti.
- [ ] **Step 9: Commit** `feat(profile-jobs): status strip, settings drawer, merged table and run history view`.

### Task 7: Responsive — tablet e smartphone (11.3)

Boards: `11.3-tablet-smartphone.jpg`, `TimesheetsResponsive.dc.html` (misure da qui: la JPG è ridotta). Confronta: tab della sub-nav su tablet, selettore "TIMESHEETS · Actuals ▾" con "N queued" su phone, colonne ridotte su tablet, card per codice con footer di azioni, etichette di gruppo sticky, bottone "Filters (n)" con bottom sheet, strip in card, switch a tutta larghezza.

**Files:**
- Modify: `timesheets.html`, `profile-jobs.html`, `js/lib/timesheets-pages-guard.test.js`

**Interfaces:**
- Consumes: Task 5, Task 6.

- [ ] **Step 1: Guard (fallisce)**: entrambe le pagine hanno `@media (max-width: 767.98px)` e `@media (min-width: 768px) and (max-width: 1023.98px)` nel `<style>`; `timesheets.html` contiene `Filters (` e un bottom sheet `.ts-sheet` con `role="dialog"`; nel blocco phone i bottoni d'azione hanno `min-height: 44px`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Tablet** di entrambe le pagine (spec §10): Uploads nascosta e "Client · code" sotto il progetto; strip su due righe; colonne ridotte di Profile processing con "⋯" (dropdown Bootstrap) per Remove from queue, disabilitato per i codici non in coda; drawer `width: min(440px, 100%)`.
- [ ] **Step 4: Phone** (spec §10): card per codice (markup separato `v-if` su un `matchMedia('(max-width: 767.98px)')` reattivo, oppure due blocchi mostrati/nascosti da CSS: scegli i due blocchi CSS, come `master-pipelines.html` con `.mdp-cards`); bottom sheet dei filtri locale (scrim, Esc, Done); Settings a schermo intero; View già full-screen dal Task 5.
- [ ] **Step 5: Run** `npx vitest run js/lib/timesheets-pages-guard.test.js` → PASS.
- [ ] **Step 6: Confronto con le tavole** a 1024 e 390 per entrambe le pagine; PNG riletti.
- [ ] **Step 7: Commit** `feat(timesheets): tablet and smartphone layouts for Actuals and Profile processing`.

### Task 8: Verifica visiva completa, documentazione, casi manuali

Boards: tutte le tavole di `docs/superpowers/design/timesheets/redesign/` (mappa nella spec §3).

**Files:**
- Modify: `docs/pages/timesheets.md`, `docs/pages/profile-jobs.md`, `docs/js/lib.md` (voci `timesheets-list.js`, `md-subnav.js`, `profile-jobs-ui.js`), `TEST_CASES.md` (§13 Timesheets e §23 Profile Jobs Console: casi manuali dei comportamenti interattivi della spec §12), `CLAUDE.md` (riga Pages di `profile-jobs.html`: "reached only via a "Profile processing →" button" diventa la sub-nav)

- [ ] **Step 1: Shoot** degli stati della spec §13 a 1440, 1024, 390 sul branch stack; rileggi ogni PNG e annota nel commit gli scostamenti residui rispetto alle tavole.
- [ ] **Step 2: Correggi** i piccoli difetti visivi trovati (PROCESS.md §6.3) con il test mirato.
- [ ] **Step 3: Documentazione** come da Files; i casi manuali di `TEST_CASES.md` nel formato della tabella esistente, ID successivi all'ultimo della sezione.
- [ ] **Step 4: Run** `npx vitest run scripts/ js/lib/test-cases-parse.test.js js/lib/timesheets-pages-guard.test.js` → PASS.
- [ ] **Step 5: Commit** `docs(timesheets): redesign narrative, lib index and manual test cases`.

## Decisioni aperte

1. **Esecuzione nativa, non subagent-driven.** Alternativa scartata: subagent-driven. Perché: §6.1 richiede task indipendenti, e i Task 5–8 riscrivono le stesse due pagine uno sopra l'altro.
2. **Card phone come blocchi separati mostrati/nascosti da CSS.** Alternativa scartata: un `matchMedia` reattivo in Vue. Perché: è lo schema di `master-pipelines.html` e non richiede listener di resize.
