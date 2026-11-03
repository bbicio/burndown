# Master Data — shared shell (phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-03-master-data-shell-design.md`
**Branch:** `master-data-shell`
**Risk class:** high-risk — file condiviso caricato da più pagine: `css/style.css` è caricato da tutte le pagine con `initNav` (PROCESS.md §6.1b); tocca anche un modulo `js/lib/` nuovo; nessuna migrazione, auth, money, API o operazione distruttiva

**Goal:** Le cinque pagine `master-*.html` ricevono lo stesso `.ph` "Master Data", una sotto-navigazione raggruppata
generata da `js/lib/md-subnav.js` (colonna su desktop, tab su tablet, selettore su phone) e il contenuto dentro una
card con il nome della sezione come prima riga; il contenuto non cambia.

**Architecture:** `js/lib/md-subnav.js` (modulo ES + bridge `window.*`) definisce le sezioni, genera l'HTML della
sub-nav con una funzione pura e la monta nelle `<nav class="md-subnav" data-md-active>` statiche. Il `.ph` e la
`<nav>` sono markup statico fuori dalla root Vue; la card (`.md-card`) è la prima cosa dentro la root Vue. Gli stili
`.md-*` stanno in `css/style.css`, come oggi; i tre layout sono la stessa lista restyled per breakpoint più un
selettore phone con `<select>` nativo trasparente.

**Tech Stack:** HTML statico + Vue 3 da CDN (nessun build step), Bootstrap 5.3, vitest + jsdom, `js/lib/icons.js`
(`iconSvg`, `PhIcon`), `scripts/shoot.mjs`.

**Tasks independent?** No: Task 3 consuma il modulo del Task 1 e le classi del Task 2; Task 4 verifica il risultato dei tre.

## Global Constraints

- Titolo `.ph-title`: `Master Data`. Sottotitolo `.ph-sub`: `Clients, pipelines, roles, rates and currencies used across the app.` Nessuna `.ph-side`.
- Sezioni (ordine, etichette, href, id): COMMERCIAL → `clients` "Clients & groups" `/master-clients.html`, `pipelines` "Pipelines & POTs" `/master-pipelines.html`; FINANCIAL → `roles` "Roles & rates" `/master-roles.html`, `currencies` "Currencies" `/master-currencies.html`.
- `data-md-active`: clients → `clients`, client-groups → `clients`, pipelines → `pipelines`, roles → `roles`, currencies → `currencies`.
- Titolo card / terzo livello del breadcrumb: `Clients`, `Client Groups`, `Pipelines & POTs`, `Roles & rates`, `Currencies`.
- Nessun hex nuovo: solo token (`--border-light`, `--surface-subtle`, `--text-muted`, `--text-secondary`, `--brand-navy`, `--brand-magenta`, `--card-*`, `--space-*`, `--radius-*`, `--focus-ring`).
- Breakpoint: `@media (min-width: 1024px)`, `@media (min-width: 768px) and (max-width: 1023.98px)`, `@media (max-width: 767.98px)`.
- Contenuto invariato: nessuna modifica a tabelle, form, modali, `.section-title`, tab, testi, chiamate API, metodi Vue.
- Ogni `?v=` di `css/style.css` bumpato allo stesso N in tutte le pagine; `js/lib/md-subnav.js?v=1`.
- Mai modificare HTML con `Get-Content`/`Set-Content` (BOM): solo Edit tool o `sed`.
- Testo utente in inglese.

## Review Focus

1. **Etichette con `&`** ("Clients & groups", "Pipelines & POTs", "Roles & rates") — devono uscire come `&amp;` nell'HTML generato e leggersi come `&` a schermo e nel picker; test in Task 1.
2. **`master-client-groups.html`** — la sub-nav marca "Clients & groups" e il selettore phone mostra quella sezione come selezionata; test in Task 1 (id) e Task 3 (guard sul `data-md-active`).
3. **Scelta della sezione già attiva nel picker phone** — il `change` non scatta, nessuna navigazione inutile; scegliere un'altra sezione naviga a quel `href`; test in Task 1.
4. **Utente non admin** — l'access-denied resta dentro la card, con icona SVG e nessun `🔒`; guard in Task 3.
5. **Sticky su desktop** — la sub-nav non si allunga a tutta l'altezza (`align-self:flex-start`), altrimenti lo sticky non funziona; guard CSS in Task 2.

---

### Task 1: Modulo `js/lib/md-subnav.js`

**Files:**
- Create: `js/lib/md-subnav.js`
- Test: `js/lib/md-subnav.test.js`

**Interfaces:**
- Consumes: `iconSvg(name, size, cls)` da `./icons.js` (import ES, icona `chevronDown`).
- Produces: `export const MD_SECTIONS` (array `{ group, items: [{ id, label, href }] }`), `export function mdSubnavHtml(activeId: string): string`, `export function mountMdSubnav(root = document): void`; bridge `window.MD_SECTIONS`, `window.mdSubnavHtml`, `window.mountMdSubnav`. Al caricamento (se `document` esiste) chiama `mountMdSubnav()`.
- Classi prodotte (le usa il Task 2): `.md-subnav-list`, `.md-subnav-group`, `.md-subnav-item` (+ `.active`), `.md-subnav-select`, `.md-subnav-select-group`, `.md-subnav-select-label`, `.md-subnav-select-chevron`, `.md-subnav-select-input`.

- [ ] **Step 1: Write the failing tests** in `js/lib/md-subnav.test.js` (vitest, ambiente jsdom come gli altri `js/lib/*.test.js` che toccano il DOM):
  - `MD_SECTIONS` è esattamente l'elenco dei Global Constraints (gruppi, id, label, href, ordine).
  - `mdSubnavHtml('roles')`, parsato in un `<div>`: 2 `.md-subnav-group` con testo `COMMERCIAL`, `FINANCIAL`; 4 `a.md-subnav-item` con `href` nell'ordine; un solo `[aria-current="page"]`, che è `/master-roles.html` e ha `.active`.
  - per ciascuno dei 4 id: esattamente una voce attiva, quella giusta.
  - `mdSubnavHtml('nope')`: nessun `[aria-current]`, nessun `.active`, nessuna `option[selected]`.
  - escaping: la stringa contiene `Clients &amp; groups` e non `Clients & groups`; dopo il parse `textContent` della prima voce è `Clients & groups`.
  - selettore: `.md-subnav-select-group` = `COMMERCIAL` e `.md-subnav-select-label` = `Clients & groups` per `clients`; `select.md-subnav-select-input` con `aria-label="Master Data section"`, 2 `optgroup` con `label` `COMMERCIAL`/`FINANCIAL`, 4 `option` con `value` = href, l'attiva `selected`.
  - `mountMdSubnav(doc)`: su `<nav class="md-subnav" data-md-active="pipelines"></nav>` la riempie con lo stesso HTML di `mdSubnavHtml('pipelines')`; una `<nav class="md-subnav">` senza attributo non viene toccata.
  - navigazione: dopo il mount, impostare `select.value = '/master-currencies.html'` e fare `dispatchEvent(new Event('change'))` assegna `location.href` (stub di `window.location` via `vi.stubGlobal` o `Object.defineProperty`) a `/master-currencies.html`.

- [ ] **Step 2: Run** `npx vitest run js/lib/md-subnav.test.js` — Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implement `js/lib/md-subnav.js`.** Una funzione locale di escaping HTML (`&`, `<`, `>`, `"`) per label e href; la lista dentro `<div class="md-subnav-list">`; il selettore dopo la lista; chevron `iconSvg('chevronDown', 16, 'md-subnav-select-chevron')`. Il `change` handler legge `event.target.value` e assegna `location.href`. Intestazione breve come gli altri moduli `js/lib/`.

- [ ] **Step 4: Run** `npx vitest run js/lib/md-subnav.test.js` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add js/lib/md-subnav.js js/lib/md-subnav.test.js && git commit -m "feat(master-data): shared grouped sub-nav module"`

### Task 2: Stili della shell in `css/style.css`

**Files:**
- Modify: `css/style.css:129-156` (blocco `/* ── Master Data sub-navigation`)
- Modify: tutte le pagine che citano `css/style.css?v=29` (bump a `?v=30`)
- Test: `js/lib/master-data-guard.test.js` (describe `Master Data sub-menu styles`)

**Interfaces:**
- Consumes: le classi del Task 1.
- Produces: `.md-layout`, `.md-subnav` (+ classi del Task 1), `.md-content`, `.md-card`, `.md-card-head`, `.md-card-title`, `.md-card-desc`, `.md-card-body` (le usa il Task 3).

Boards: `docs/superpowers/design/Master-data/10.2a.jpg` (desktop), `docs/superpowers/design/Master-data/10.2e.jpg` (frame tablet 1024×768 e phone 390 "Clients").

- [ ] **Step 1: Rewrite the failing CSS tests** nel describe `Master Data sub-menu styles (css/style.css)` (sostituisce i tre test attuali), sullo slice che parte da `/* ── Master Data sub-navigation`:
  - definisce `.md-layout`, `.md-subnav`, `.md-subnav-item.active`, `.md-content`, `.md-card`, `.md-card-title`.
  - dentro `@media (min-width: 1024px)`: `.md-subnav` con `position: sticky`, `align-self: flex-start`, nessun `align-self: stretch`, `flex: 0 0 196px`; `.md-subnav-select` con `display: none`; `.md-subnav-item.active` con `inset 3px 0 0 var(--brand-magenta)`.
  - dentro `@media (min-width: 768px) and (max-width: 1023.98px)`: `.md-subnav` con `overflow-x: auto` e `scrollbar-width: none`; `.md-subnav-group` con `display: none`; `.md-subnav-item.active` con `inset 0 -3px 0 var(--brand-magenta)`.
  - dentro `@media (max-width: 767.98px)`: `.md-subnav-list` con `display: none`; `.md-subnav-select` con `min-height: 48px`; `.md-subnav-select-input` con `opacity: 0`.
  - `.md-card` usa `var(--card-bg)`, `var(--card-border)`, `var(--card-radius)`; nessun hex (`/#[0-9a-fA-F]{3,8}\b/`) nello slice fino a `/* ── Notification panel`.

- [ ] **Step 2: Run** `npx vitest run js/lib/master-data-guard.test.js` — Expected: FAIL sui nuovi test CSS.

- [ ] **Step 3: Implement** il blocco CSS con i valori di spec §6 e §7 (commento d'intestazione aggiornato: generato da `js/lib/md-subnav.js`). Base senza media query neutra (`.md-subnav-select` nascosto, lista visibile), poi le tre media query; `.md-content` senza `border-left`. Bump `css/style.css?v=29` → `?v=30` in ogni pagina: `grep -rl "css/style.css?v=29" --include=*.html .` poi `sed -i 's/css\/style\.css?v=29/css\/style.css?v=30/'` su quei file; verificare con `grep -rn "style.css?v=" --include=*.html . | grep -v "v=30"` (vuoto, `node_modules` escluso).

- [ ] **Step 4: Run** `npx vitest run js/lib/master-data-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js` — Expected: PASS i test CSS e i due guard di `?v=`; i test di pagina di `master-data-guard` possono restare verdi (markup non ancora cambiato).

- [ ] **Step 5: Commit** — `git add css/style.css js/lib/master-data-guard.test.js *.html && git commit -m "feat(master-data): shell styles for sub-nav, tabs, phone selector and content card"`

### Task 3: Le cinque pagine nella shell

**Files:**
- Modify: `master-clients.html`, `master-client-groups.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html` (in ognuna: `<style>` righe ~12-16, shell righe ~63-99, chiusure `md-content`/`md-layout`, `<script>` dopo `icons.js`, `initNav` breadcrumbs, catena `Vue.createApp(...)`)
- Test: `js/lib/master-data-guard.test.js` (describe per pagina), `js/lib/page-head-guard.test.js`

**Interfaces:**
- Consumes: `mountMdSubnav` (Task 1, eseguito dal modulo al caricamento), classi `.md-*` (Task 2), `window.PhIcon` (`js/lib/icons.js`).

Boards: `docs/superpowers/design/Master-data/10.2a.jpg`, `docs/superpowers/design/Master-data/10.2e.jpg`.

- [ ] **Step 1: Update the failing guards.**
  - `master-data-guard.test.js`: aggiungere a ogni voce di `PAGES` `active` (vedi Global Constraints) e `section` (titolo card). Sostituire i test "same five sub-menu links" e "wraps the Vue root" con:
    - `#app-main` contiene, nell'ordine, `<div class="ph">` con `<h1 class="ph-title">Master Data</h1>` e `<div class="ph-sub">Clients, pipelines, roles, rates and currencies used across the app.</div>`, nessun `ph-side`, poi `<div class="md-layout">\s*<nav class="md-subnav" data-md-active="<active>" aria-label="Master Data"></nav>\s*<div class="md-content">\s*<div id="app" v-cloak>\s*<section class="md-card">`.
    - nessun `<a href=` dentro la `<nav class="md-subnav"`.
    - `<h2 class="md-card-title">` con testo = `section` (in HTML: `&amp;` per `&`).
    - carica `<script type="module" src="js/lib/md-subnav.js?v=1">` dopo `js/lib/icons.js`.
    - breadcrumb: contiene `{ label: 'Master Data', href: '/master-clients.html' }` e `{ label: '<section>' }`; il test "is a Master Data page" non cerca più `{ label: 'Master Data' }` a secco.
    - access denied: contiene `<ph-icon name="lock"` e `.component('ph-icon', window.PhIcon)`, non contiene `🔒`.
    - nessun `.page-header` e nessun `font-size: 2.5rem` nel file.
  - `page-head-guard.test.js`: `EXCLUDED` diventa `new Set([])` (commento aggiornato); il test "page discovery" diventa "finds the 19 pages that call initNav (19 checked)" con `EXCLUDED.size` 0; aggiungere le 5 pagine agli owner di `'.page-header'` in `FORBIDDEN`.

- [ ] **Step 2: Run** `npx vitest run js/lib/master-data-guard.test.js js/lib/page-head-guard.test.js` — Expected: FAIL sulle 5 pagine.

- [ ] **Step 3: Edit the five pages** (Edit tool), stessa trasformazione in ciascuna:
  - `<style>`: togliere la riga `body { … }`, `.page { … }`, `.page-header { … }`, `.page-header h1 { … }`; il resto invariato.
  - dopo `<div id="app-main">`: il `.ph` della spec §4; la `<nav>` scritta a mano diventa `<nav class="md-subnav" data-md-active="<active>" aria-label="Master Data"></nav>`.
  - dentro `<div id="app" v-cloak>`: `<section class="md-card">` + `<div class="md-card-head"><h2 class="md-card-title"><section></h2><p class="md-card-desc"><descrizione attuale, testo invariato></p></div>` + `<div class="md-card-body">` che avvolge loading, access denied e `<div class="page app-container" v-else>`; chiudere `</div></section>` prima di `</div>` di `#app`. Rimuovere il blocco `.page-header` (h1 + descrizione) dal wrapper `.page`.
  - access denied: `<div style="font-size:2rem">🔒</div>` → `<ph-icon name="lock" :size="16"></ph-icon>`; testo e bottone invariati.
  - `Vue.createApp({...}).mount('#app')` → `Vue.createApp({...}).component('ph-icon', window.PhIcon).mount('#app')` (`window.__cfgApp` resta l'istanza montata).
  - dopo `<script type="module" src="js/lib/icons.js?v=5"></script>`: `<script type="module" src="js/lib/md-subnav.js?v=1"></script>`.
  - `initNav('config', { breadcrumbs: [...] })`: i tre livelli dei Global Constraints.

- [ ] **Step 4: Run** `npx vitest run js/lib/master-data-guard.test.js js/lib/page-head-guard.test.js js/lib/nav-shell-guard.test.js js/lib/master-clients-ratecard-guard.test.js js/lib/master-pipelines-pot-details.test.js js/lib/master-pipelines-pot-input-guard.test.js js/lib/master-roles-rate-input-guard.test.js` — Expected: PASS. Controllo BOM: `head -c3 master-*.html | od -c | grep -c "357 273 277"` → `0`.

- [ ] **Step 5: Commit** — `git add master-*.html js/lib/master-data-guard.test.js js/lib/page-head-guard.test.js && git commit -m "feat(master-data): five pages in the shared shell (page head, generated sub-nav, content card)"`

### Task 4: Verifica visiva e documentazione

**Files:**
- Modify: `docs/pages/config.md` (sezione corrente: shell, sub-nav generata, scostamenti accettati con motivo)
- Modify: `TEST_CASES.md` (caso manuale: navigazione via sub-nav sui tre layout, selettore phone)

Boards: `docs/superpowers/design/Master-data/10.2a.jpg`, `docs/superpowers/design/Master-data/10.2e.jpg`.

- [ ] **Step 1: Branch stack.** Copiare `.env` dal checkout principale nel worktree se manca; `scripts/test-branch.sh up` — Expected: `status` → `up`.
- [ ] **Step 2: Shoot.** `node scripts/shoot.mjs --base http://localhost:8081 --settle 3000 --url /master-clients.html --out shots/md-clients --widths 1440,1024,768,390 --full` (credenziali da `.env`, vedi `docs/scripts/shoot.md`); poi per `/master-client-groups.html`, `/master-pipelines.html`, `/master-roles.html`, `/master-currencies.html` a `--widths 1440`. Expected: un PNG per larghezza.
- [ ] **Step 3: Read every PNG** e confrontarlo con `10.2a.jpg` (1440/1024) e `10.2e.jpg` (768 → frame tablet, 390 → frame phone "Clients"), limitatamente a breadcrumb, `.ph`, sub-nav/tab/selettore, header della card. Elencare gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra e **fermarsi per la decisione dell'utente**. Le deviazioni già decise dalla spec (decisioni 4, 5, 6, 10) non si ripropongono.
- [ ] **Step 4: Apply** i fix-ora decisi (CSS/markup di poche righe, con il test mirato), e scrivere in `docs/pages/config.md` la shell e gli "accetta" con il motivo; aggiungere il caso in `TEST_CASES.md` nel formato degli altri.
- [ ] **Step 5: Run** `npx vitest run js/lib/master-data-guard.test.js js/lib/test-cases-parse.test.js scripts/doc-paths-guard.test.js` — Expected: PASS. Lo stack del branch resta acceso per il Gate 2.
- [ ] **Step 6: Commit** — `git add docs/pages/config.md TEST_CASES.md css/style.css master-*.html && git commit -m "docs(master-data): shell notes, accepted deviations and manual test case"`

## Decisioni aperte

1. **Esecuzione in un solo Piano a 4 task sequenziali.** Alternativa scartata: un task per pagina. Perché: le cinque pagine subiscono la stessa trasformazione e lo stesso guard, separarle moltiplicherebbe i giri senza una revisione che possa rifiutarne una sola.
2. **L'icona di access-denied via `<ph-icon>` registrando `PhIcon` sull'app.** Alternativa scartata: `v-html` di `iconSvg`. Perché: `PhIcon` è il componente condiviso già usato da portfolio e costgrid, e nessuna delle cinque pagine registra oggi un componente in conflitto.
3. **Il bump di `css/style.css` a `?v=30` su tutte le pagine, non solo sulle cinque.** Alternativa scartata: bump solo sulle pagine Master Data. Perché: `foundations-guard` e `nav-shell-guard` pretendono lo stesso N ovunque, e il file cambia per tutti.
