# Attribute Lists redesign — `attribute-lists.html` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-09-attribute-lists-redesign-design.md`
**Branch:** `attribute-lists-redesign`
**Risk class:** high-risk — file condivisi caricati da più pagine: `.pd-combo*` in `css/style.css` (tutte le pagine), `badge-st-*` tolto da `css/admin-crud.css` (cinque pagine), `combo-select` estratto da `team.html`

**Goal:** `attribute-lists.html` diventa la pagina delle tavole 14*: sub-nav liste/topic al posto delle tab, lista nel contenuto con segmented, ricerca, menu ⋯ e Undo, coda dei topic con contatore di sessione, form in drawer, merge con `combo-select` e conferma; API invariate.

**Architecture:** Logica pura in due moduli ES nuovi (`js/lib/slugify.js`, gemello di `api/src/lib/slugify.js`; `js/lib/attribute-lists-ui.js`), testati con vitest. `combo-select` esce da `team.html` in `js/combo-select.js` (classic, `window.ComboSelect`) con CSS `.pd-combo*` in `css/style.css`; Team lo adotta senza cambiare comportamento. La pagina resta Vue 3 da CDN: drawer = Bootstrap offcanvas `.pd-drawer`, conferma = modal `.pd-confirm-modal`, sub-nav = markup `.md-subnav` scritto da Vue; le regole solo di questa pagina vanno nel nuovo `css/attribute-lists.css`.

**Tech Stack:** HTML statico + Vue 3 da CDN, Bootstrap 5.3, vitest + jsdom, `scripts/shoot.mjs`.

**Tasks independent?** No: i Task 3–8 modificano `attribute-lists.html` e `css/attribute-lists.css` uno sopra l'altro e consumano i Task 1–2.

## Global Constraints

- Copy in inglese, testi esatti del brief §3–§9 salvo le riduzioni della spec §1.2; carattere `…` (mai `...`). Errori dei form e delle azioni: il campo `error` della risposta del server, fallback `Network error. Please try again.`
- Nessun hex in `attribute-lists.html`, `css/attribute-lists.css`, `js/combo-select.js` e nel blocco `.pd-combo*`; nessun attributo `style` con colori. Token nuovi solo se nessuno esistente va bene, con `js/lib/tokens.test.js` verde (≥ 4.5:1).
- Nessuna emoji, nessun `confirm(`/`alert(`/`showConfirm(` nella pagina.
- Icone: `<ph-icon>` con i nomi di `ICON_PATHS` (`js/lib/icons.js`) dove esistono; le mancanti (merge, rotate-ccw, power, ban/slash) come SVG inline 16×16, `stroke="currentColor"`, `stroke-width="1.4"`. `js/lib/icons.js` non si modifica.
- Versioni: `css/style.css` `?v=36` → `?v=37` su **tutte** le pagine; `css/admin-crud.css` `?v=5` → `?v=6` sulle sue cinque pagine; `css/team.css` `?v=2` → `?v=3`; nuovi con `?v=1`: `css/attribute-lists.css`, `js/combo-select.js`, `js/lib/slugify.js`, `js/lib/attribute-lists-ui.js`. `attribute-lists.html` carica anche `js/lib/team-ui.js?v=8` (invariato) per `filterComboOptions` e `sessionProgress`.
- API invariate: stessi URL, metodi e body di oggi; nessuna route toccata. Tutte le chiamate della pagina passano da un helper unico `request(method, url, body) → { ok, status, data }` (generalizza `topicsRequest`).
- Breakpoint come la sub-nav Master Data: colonna ≥ 1024px, riga di chip 768–1023.98px, `.md-subnav-select` < 768px; target ≥ 40px sotto 1024px, ≥ 44px sotto 768px.
- Layer: pagina < drawer (offcanvas) < conferma (modal). Esc chiude solo il layer in cima; il menu ⋯ e la lista del `combo-select` chiudono prima del drawer.
- `#app-shell`/`#app-main` senza `overflow`/`transform`/`filter`/`contain`/`will-change`/`position`; `v-cloak` sul root.
- Durante i task solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack: verifiche contro `scripts/test-branch.sh`.
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM). Codice con `\` scritto con Edit/Write, non via `node -e`.

## Review Focus

1. **Undo dopo un cambio di contesto** — Deactivate su Market, poi selezione di Brand prima di Undo: il banner sparisce al cambio di selezione; un Undo partito usa l'`itemId`/`listId` catturati al Deactivate, non la lista corrente; regola nel Task 4 Step 3 (`cardBanner.undo` porta `listId`/`itemId`, `select` azzera il banner), verifica manuale al Gate 2.
2. **Riga che esce dal filtro a metà azione** — con filtro Active e ricerca `ita`, Deactivate di `Italy`: la riga esce dalla tabella, i conteggi del segmented e `active_item_count` della sub-nav calano di 1, il banner resta; test `itemCounts` nel Task 1.
3. **Merge che fallisce** — 409 del server durante `Merge topics`: la conferma resta aperta con l'errore, il drawer resta aperto, il contatore di sessione **non** avanza, nessun banner verde; guard nel Task 7.
4. **Nome vuoto o solo simboli in New list** — anteprima `—`; con `!!!` il server risponde 400 `name must contain at least one letter or number` e l'errore appare nel drawer; test di parità `slugify('!!!') === ''` nel Task 1.
5. **Esc con tre livelli** — lista del `combo-select` aperta nel drawer Merge, poi conferma sopra il drawer: ogni Esc chiude solo il livello più alto (lista → drawer; conferma → drawer resta); guard nel Task 7.

---

### Task 1: Logica pura — `js/lib/slugify.js`, `js/lib/attribute-lists-ui.js`

**Boards:** `14a-list-selected.png`, `14d-new-list.png`, `14g-list-filter-all.png`, `14m-no-items-for-filter.png`, `14n-topics-queue.png`, `14p-after-approve.png`, `14w-merge-search.png` (tutte in `docs/superpowers/design/attribute-lists/redesign/`)

**Files:**
- Create: `js/lib/slugify.js`, `js/lib/slugify.test.js`
- Create: `js/lib/attribute-lists-ui.js`, `js/lib/attribute-lists-ui.test.js`

**Interfaces:**
- Produces (esportate e bridgiate su `window` con lo stesso nome):
  - `slugify(name) → string` — stesso algoritmo di `api/src/lib/slugify.js` (copiarlo, commento che rimanda al gemello).
  - `itemCounts(items, text = '') → { active, inactive, all }` — sugli item che passano la ricerca.
  - `filterItems(items, { status = 'active', text = '' }) → items[]` — `status` `'active'|'inactive'|'all'`; `text` trim, case- e accent-insensitive, `includes` su `label`; ordine di input.
  - `topicCounts(topics) → { proposed, approved, rejected }`.
  - `filterTopics(topics, { status, text = '' }) → topics[]` — proposed per `usage_count` desc poi nome (`localeCompare`, sensitivity base); approved/rejected per nome.
  - `descriptionsText(n) → string` — `1` → `'1 description'`, altrimenti `'{n} descriptions'`.
  - `mergeTargetOptions(topics, source) → options[]` — per `combo-select`: `{ group: 'Approved' }` + `{ id, label: name, hint: descriptionsText(usage_count) }` per ogni approvato, poi `{ group: 'Proposed' }` + i proposti (solo se `source.status === 'proposed'`); esclusi `source` e i rejected; nome in ordine alfabetico in ogni gruppo.
  - `emptyItemsLine(status, text) → string` — con `text`: `No {status} values contain "{text}".`; senza: `There are no {status} values in this list.`; con `status === 'all'` la parola `{status}` sparisce (`No values contain "x".`).
- Consumes: niente (ES module autonomo).

- [ ] **Step 1: Scrivere i test che falliscono.**
  - `slugify.test.js`: importa `slugify` da `./slugify.js` e quello del server con `createRequire(import.meta.url)('../../api/src/lib/slugify.js')`; `it.each` su `['Market', 'Therapeutic Area', '  Service  Type ', 'Città & Regione', 'Ünïcödé', '!!!', '', 'a'.repeat(120), 'R&D / Ops']` → le due uscite uguali; più `slugify('Therapeutic Area') === 'therapeutic-area'` e `slugify('!!!') === ''` (Review Focus 4).
  - `attribute-lists-ui.test.js`, un `describe` per funzione:
    - `itemCounts([a(active,'Italy'), b(active,'Spain'), c(inactive,'France')], 'ita')` → `{ active: 1, inactive: 0, all: 1 }`; senza testo → `{ 2, 1, 3 }` (Review Focus 2).
    - `filterItems` default tiene solo gli attivi; `'all'` tutti; `text: ' FRAN '` trova `France`; `text: 'citta'` trova `Città`.
    - `filterTopics` proposed `[{n:'B',u:1},{n:'A',u:1},{n:'C',u:4}]` → `C, A, B`; approved per nome.
    - `descriptionsText(1)`, `(0)`, `(5)` → `'1 description'`, `'0 descriptions'`, `'5 descriptions'`.
    - `mergeTargetOptions`: sorgente approvata → nessun gruppo `Proposed`, nessuna sorgente, nessun rejected; sorgente proposta → gruppi `Approved` poi `Proposed`; hint `'4 descriptions'`.
    - `emptyItemsLine('inactive','spain')` → `No inactive values contain "spain".`; `('active','')` → `There are no active values in this list.`
- [ ] **Step 2: Vederli fallire** — `npx vitest run js/lib/slugify.test.js js/lib/attribute-lists-ui.test.js` → FAIL (moduli mancanti).
- [ ] **Step 3: Implementare** i due moduli con le firme sopra e i bridge `window.<nome>`.
- [ ] **Step 4: Vederli passare** — stesso comando → PASS.
- [ ] **Step 5: Commit** — `git add js/lib/slugify.* js/lib/attribute-lists-ui.* && git commit -m "feat(attribute-lists): pure helpers and client slugify twin"`

---

### Task 2: `combo-select` condiviso, adottato da Team

**Boards:** `14w-merge-search.png`; per Team, invariata: `docs/superpowers/design/team/redesign/13i-unmatched-assign.png`

**Files:**
- Create: `js/combo-select.js`
- Modify: `css/style.css` (blocco `.pd-combo*` dentro "Shared components (pd-)"), `css/team.css` (via `.tm-combo*`, responsive con `.pd-combo-input`)
- Modify: `team.html` (via il componente inline `team.html:1471-1583`, carica `js/combo-select.js?v=1`, `app.component('combo-select', window.ComboSelect)`)
- Modify: ogni `*.html` con `css/style.css?v=36` (→ 37); `team.html` `css/team.css?v=2` → `?v=3`
- Test: `js/lib/team-page-guard.test.js`, nuovo `js/lib/combo-select-guard.test.js`

**Interfaces:**
- Produces: `window.ComboSelect` — l'oggetto componente identico a quello di `team.html` (props `options`, `modelValue`, `placeholder`, `disabled`, `ariaLabel`; emit `update:modelValue`; gruppi `{ group }`; voce `— none —`; Esc ferma la propagazione), con le classi `tm-combo*` rinominate `pd-combo*`. Dipende a runtime da `window.filterComboOptions` e dal componente `ph-icon` registrati dalla pagina.

- [ ] **Step 1: Guard che falliscono.** `combo-select-guard.test.js`: `js/combo-select.js` esiste, definisce `window.ComboSelect`, non contiene `tm-combo` né hex; `css/style.css` contiene `.pd-combo-menu`; `css/team.css` non contiene `tm-combo`. In `team-page-guard.test.js`: `team.html` non contiene `app.component('combo-select', {`, contiene `js/combo-select.js?v=` e `window.ComboSelect`.
- [ ] **Step 2: Vederli fallire** — `npx vitest run js/lib/combo-select-guard.test.js js/lib/team-page-guard.test.js` → FAIL.
- [ ] **Step 3: Estrarre** il componente (spostamento, non riscrittura), spostare il CSS rinominando le classi, adattare `team.html`, bump dei `?v=`.
- [ ] **Step 4: Guard verdi** — `npx vitest run js/lib/combo-select-guard.test.js js/lib/team-page-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js js/lib/team-ui.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "refactor(team): extract combo-select to a shared component"` (con `git add js/combo-select.js js/lib/combo-select-guard.test.js`).

---

### Task 3: Scheletro della pagina — testata, sub-nav, stati, pulizia

**Boards:** `14a-list-selected.png`, `14c-no-lists.png`, `14aa-load-error.png`, `14ab-loading.png`, `14ac-access-denied.png`

**Files:**
- Modify: `attribute-lists.html` (template, `data`, `computed`, `methods`; via lo `<style>` inline, `nav-tabs`, i tre `.ph`, `.ph-back`, `pageTab`, `openTopicsTab`)
- Create: `css/attribute-lists.css` (caricato dopo `admin-crud.css`, `?v=1`)
- Modify: `css/admin-crud.css` (via `badge-st-*`), bump `?v=6` sulle cinque pagine
- Create: `js/lib/attribute-lists-page-guard.test.js`

**Interfaces:**
- Consumes: Task 1 (`topicCounts`).
- Produces nello stato Vue: `selection` = `{ kind: 'list', id } | { kind: 'topics', status: 'proposed'|'approved'|'rejected' } | { kind: 'none' }`; `select(sel)` (azzera ricerca e banner della card, segmented ad `active`); computed `currentList`, `isTopics`, `primaryLabel` (`New list` | `New topic`); `loadError` (bool) con `retryLoad()`; `request(method, url, body)`; metodi `loadLists()`, `loadTopics()`. Apertura: prima lista, altrimenti `{ kind: 'none' }`.

- [ ] **Step 1: Guard che fallisce** in `attribute-lists-page-guard.test.js` (modello `team-page-guard.test.js`): la pagina non contiene `nav-tabs`, `<details`, `ph-back`, `badge-st-`, `slug-code`, `alert(`, `confirm(`, `showConfirm(`, hex, `🔒`; contiene `class="md-layout"`, `class="md-subnav"`, `aria-label="Attribute lists and topics"`, `aria-current`, `md-subnav-select`, `pd-state`, `Loading attribute lists…`, `Admin access required`, `Try again`, `css/attribute-lists.css?v=`; `css/attribute-lists.css` senza hex; `css/admin-crud.css` senza `badge-st-`. I controlli che i Task 4–7 soddisfano (`pd-drawer`, `pd-confirm`, `combo-select`, assenza di `class="modal fade"` diversi da `#mergeConfirmModal`, assenza di `<select` fuori da `md-subnav-select`) si scrivono ora come `it.todo`.
- [ ] **Step 2: Vederlo fallire** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** secondo spec §3 e §9: un `.ph` (titolo, sottotitolo, primario contestuale con icona plus, `+` 44px sotto 768px); `.md-layout` con sub-nav Vue — voci `button.md-subnav-item`, conteggi in uno `span` muted page-local, Proposed > 0 con `.md-subnav-badge`; `.md-subnav-select` con `<select>` a due `<optgroup>` che chiama `select`; contenuto vuoto per ora con una card segnaposto per lista/topic (riempita dai Task 4–6); stati `.pd-state`: caricamento (sub-nav nascosta), accesso negato (icona lock, testi, **Go to app** navy), nessuna lista (icona tag, **Create the first list** outline, nota); errore di caricamento = `.pd-banner--error` globale `role="alert"` con **Try again** → `retryLoad()`. I quattro modal Bootstrap restano finché i Task 5–7 li sostituiscono.
- [ ] **Step 4: Guard verdi** — `npx vitest run js/lib/attribute-lists-page-guard.test.js js/lib/page-head-guard.test.js js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js js/lib/admin-page-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(attribute-lists): page head, sub-navigation and page states"` (con `git add css/attribute-lists.css js/lib/attribute-lists-page-guard.test.js`).

---

### Task 4: Contenuto di una lista — segmented, ricerca, tabella, menu ⋯, Undo

**Boards:** `14a-list-selected.png`, `14g-list-filter-all.png`, `14h-item-menu.png`, `14i-deactivated-undo.png`, `14m-no-items-for-filter.png`

**Files:**
- Modify: `attribute-lists.html`, `css/attribute-lists.css`
- Test: `js/lib/attribute-lists-page-guard.test.js`

**Interfaces:**
- Consumes: `itemCounts`, `filterItems`, `emptyItemsLine` (Task 1); `selection`, `request` (Task 3).
- Produces: `itemStatus` (`'active'`), `itemText`; `cardBanner` = `{ kind: 'success'|'error', text, undo?: { listId, itemId, status } } | null` con `setCardBanner()`/`clearCardBanner()` (azzerato da `select`); `setItemStatus(item, status, { undo })`; stato del menu `menuFor` (id) + `menuUp`, `openMenu(id, ev)`, `closeMenu()`, `onMenuKey(ev)` riusabili dal Task 6.

- [ ] **Step 1: Estendere il guard** — la pagina contiene `ATTRIBUTE LIST`, `set at creation, never changes`, `href="team.html"`, `class="md-seg"` con `role="radiogroup"`, `Search values…`, `pd-row-menu`, `aria-haspopup="menu"`, `INSTEAD OF DELETE`, `pd-status-pill--busy`, `Updating…`, `Undo`, `Items can't be deleted`, `Show all items`; non contiene `Show inactive`.
- [ ] **Step 2: Vederlo fallire** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** secondo spec §4: card `.md-card` con testata (eyebrow, nome, chip slug monospace con token, testo, link Team, **Rename** outline che per ora apre il modal esistente); toolbar (`.md-seg` Active/Inactive/All con `itemCounts`, ricerca, **New item** magenta); tabella Label · Status · ⋯; menu `.pd-row-menu` con apertura `--up` come `team.html` (`openMenu`: `rect.bottom + 240 > innerHeight`), frecce, Esc che restituisce il focus al trigger; in corso pill `--busy` + menu disabilitato; esito `.pd-banner--success` `role="status"` con **Undo** e chiusura, testi del brief §4; Undo = `setItemStatus` con lo stato catturato, al successo chiude il banner; errore = `.pd-banner--error` con il messaggio del server; `active_item_count` della lista nella sub-nav ±1; nota con icona info; vuoto filtrato `.pd-state` con `emptyItemsLine` e **Show all items**.
- [ ] **Step 4: Guard verde** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(attribute-lists): list content with status filter, search, row menu and undo"`

---

### Task 5: Drawer di liste e item

**Boards:** `14d-new-list.png`, `14e-new-list-error.png`, `14f-rename-list.png`, `14j-new-item.png`, `14l-edit-item-duplicate.png`

**Files:**
- Modify: `attribute-lists.html` (via `#listModal` e `#itemModal`), `css/attribute-lists.css`
- Test: `js/lib/attribute-lists-page-guard.test.js`

**Interfaces:**
- Consumes: `slugify` (Task 1); `select`, `request`, `setCardBanner` (Task 3–4).
- Produces: `#listDrawer` e `#itemDrawer` (offcanvas `.pd-drawer`); `listForm` `{ mode: 'new'|'rename', id, name, error, saving }`, `itemForm` `{ mode: 'new'|'edit', id, label, error, saving }`; `openListDrawer(mode)`, `openItemDrawer(mode, item?)`; computed `slugPreview` (`slugify(name)` o `—`).

- [ ] **Step 1: Estendere il guard** — contiene `id="listDrawer"`, `id="itemDrawer"`, `pd-drawer`, `Create list`, `Add item`, `Generated from the name when you create the list`, `Stays the same after renaming.`, `regardless of upper or lower case`; non contiene `id="listModal"` né `id="itemModal"`.
- [ ] **Step 2: Vederlo fallire** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** secondo spec §6 e la tabella del brief §6: head (eyebrow, titolo, sub, ×), body con errore rosso in cima (`role="alert"`) + campo `is-invalid`, riga slug (anteprima in New, sola lettura in Rename), hint di unicità con il nome della lista; foot Cancel outline + primario magenta con spinner bianco; Enter nel campo invia; focus sul campo a `shown.bs.offcanvas`, ritorno al trigger alla chiusura. Successo: chiude, ricarica come oggi (`loadLists`/item della lista), banner verde nella card (`Created "{name}".`, `Renamed to "{name}".`, `Added "{label}".`, `Saved "{label}".`); Create list seleziona la nuova lista; New item aggiorna `active_item_count`.
- [ ] **Step 4: Guard verde** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(attribute-lists): list and item forms in drawers"`

---

### Task 6: Topic — coda, tabelle, menu ⋯, banner, drawer New/Rename topic

**Boards:** `14n-topics-queue.png`, `14o-topic-row-menu.png`, `14p-after-approve.png`, `14q-approved-used-in-0.png`, `14r-rejected.png`, `14s-queue-empty.png`, `14t-no-approved.png`, `14u-new-topic.png`, `14v-rename-topic-error.png`, `14z-topic-action-error.png`

**Files:**
- Modify: `attribute-lists.html` (via `#topicModal` e il vecchio blocco topic), `css/attribute-lists.css`
- Test: `js/lib/attribute-lists-page-guard.test.js`

**Interfaces:**
- Consumes: `filterTopics`, `topicCounts`, `descriptionsText` (Task 1); `sessionProgress` (`js/lib/team-ui.js`); menu e `cardBanner` (Task 4); pattern drawer (Task 5).
- Produces: `topicText`; `reviewedThisSession` (numero, client-only); `topicAction(topic, action)` con `action` `'approve'|'reject'|'restore'` — al successo `loadTopics()` + banner + `reviewedThisSession++` se il topic era `proposed`; all'errore `loadTopics()` poi `.pd-banner--error` `Couldn't {verb} "{name}". The list was reloaded. Server: {message}`; `#topicDrawer` con `topicForm` `{ mode: 'new'|'rename', id, status, name, error, saving }`; `markReviewed()` usato dal Task 7.

- [ ] **Step 1: Estendere il guard** — contiene `Proposed topics`, `Search topics…`, `to review`, `reviewed this session`, `None reviewed yet this session`, `role="progressbar"`, `REVERSIBLE`, `IRREVERSIBLE`, `pd-row-menu-item--danger`, `Approving…`, `View rejected`, `Not linked to any description yet`, `href="profile-jobs.html"`, `No topics to review.`, `No approved topics yet.`, `No rejected topics.`, `Clear search`, `It starts empty`, `Naming rules`, `id="topicDrawer"`; non contiene `id="topicModal"`.
- [ ] **Step 2: Vederlo fallire** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** secondo spec §5 e §6: card per stato con toolbar; strip solo su Proposed (`{n}` = proposti attuali, barra da `sessionProgress(reviewedThisSession, proposti)`, testo di destra); tabella Name · Used in · azioni; Approve navy + ⋯ / ⋯ / Restore outline; menu con Rename, Reject (`.pd-tag--navy`), divisore, Merge into… `--danger` (`.pd-tag--danger`; per ora apre il modal merge esistente); azione in corso: spinner + `Approving…`/`Rejecting…`/`Restoring…` `aria-live="polite"`; banner del brief §5 (Reject con link **View rejected** → `select({kind:'topics',status:'rejected'})`); Used in 0 su approvati: conteggio in testo amber con token ≥ 4.5:1 e riga con link; note per stato; vuoti `.pd-state` (Proposed icona check `--ok`; Approved con **Review proposed ({n})**; Rejected; ricerca senza risultati con **Clear search**). Drawer topic: New (box `It starts empty`, link `Open Profile processing →`, successo → `select` Approved + banner `Created "{name}". It's approved and in the agent's vocabulary.`) e Rename (eyebrow `TOPIC · {STATUS}`, box `Naming rules`, banner `Renamed to "{name}".`).
- [ ] **Step 4: Guard verde** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(attribute-lists): topic queue, states, row menu and topic drawers"`

---

### Task 7: Merge — drawer con `combo-select` e conferma

**Boards:** `14w-merge-search.png`, `14y-merge-confirm.png`

**Files:**
- Modify: `attribute-lists.html` (via `#mergeModal` e il `<select>` nativo; carica `js/combo-select.js?v=1` e `js/lib/team-ui.js?v=8`; `app.component('combo-select', window.ComboSelect)`), `css/attribute-lists.css`
- Test: `js/lib/attribute-lists-page-guard.test.js`

**Interfaces:**
- Consumes: `window.ComboSelect` (Task 2), `mergeTargetOptions`, `descriptionsText` (Task 1), `topicAction`, `markReviewed`, `cardBanner` (Task 6).
- Produces: `#mergeDrawer`, `#mergeConfirmModal`; `mergeForm` `{ source, targetId, ack, error, saving }`; `openMerge(topic)`, `openMergeConfirm()`, `backToMergeDrawer()`, `rejectInstead()`, `submitMerge()`.

- [ ] **Step 1: Estendere il guard** — contiene `id="mergeDrawer"`, `<combo-select`, `Choose the topic to keep…`, `TOPIC TO MERGE`, `What happens`, `Can't be undone.`, `btn-danger`, `id="mergeConfirmModal"`, `pd-confirm`, `Just want it gone?`, `Reject instead`, `I understand this can't be undone.`, `Merge topics`, `Back`; non contiene `id="mergeModal"`, `<option`, né (fuori da `md-subnav-select`) `<select`; riattivare gli `it.todo` del Task 3. Aggiungere: il blocco Esc della conferma non chiude il drawer (`data-bs-keyboard` / handler documentato in commento) (Review Focus 5).
- [ ] **Step 2: Vederlo fallire** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** secondo spec §7: drawer 480px (card sorgente con pill `proposed` amber / `approved` green via `.pd-status-pill`; `combo-select` con `mergeTargetOptions`; help sotto il campo; box **What happens** con `descriptionsText(source.usage_count)` e nessun totale; foot Cancel + **Merge…** `btn-danger` disabilitato senza target). Conferma `.pd-confirm-modal` sopra il drawer (z-index sopra l'offcanvas, Esc chiude solo la conferma): titolo `Merge "{source}" into "{target}"?` + tag `IRREVERSIBLE`, box **Disappears** (`Proposed · removed from the queue` / `Approved · removed from profiles`) e **Moves to {target}** (`{n} description(s) move over`), nota con **Reject instead** (chiude conferma e drawer, `topicAction(source,'reject')`), checkbox che abilita **Merge topics** con spinner, **Back** = `backToMergeDrawer()`. Successo: chiude tutto, `loadTopics()`, `markReviewed()` se la sorgente era proposta, banner `Merged "{source}" into "{target}". "{target}" is now used in {descriptionsText(n)}.` con `n` letto dal target ricaricato. Errore: dentro la conferma, nessun `markReviewed()` (Review Focus 3).
- [ ] **Step 4: Guard verde** — `npx vitest run js/lib/attribute-lists-page-guard.test.js js/lib/combo-select-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(attribute-lists): merge drawer with combo-select and irreversible confirm"`

---

### Task 8: Responsive — tablet e smartphone

**Boards:** `14ad-1-tablet.png`, `14ad-2-smartphone.png`

**Files:**
- Modify: `css/attribute-lists.css`, `attribute-lists.html` (solo classi/markup necessari)
- Test: `js/lib/attribute-lists-page-guard.test.js`

**Interfaces:**
- Consumes: tutto il markup dei Task 3–7.

- [ ] **Step 1: Estendere il guard** — `css/attribute-lists.css` contiene `@media (max-width: 1023.98px)` e `@media (max-width: 767.98px)`; il secondo porta i target a `44px` (segmented, ricerca, bottoni, trigger ⋯).
- [ ] **Step 2: Vederlo fallire** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** secondo spec §10: tablet = chip di `.md-subnav` esistenti con le etichette `LISTS`/`TOPICS` (mostrate dalla regola page-local), colonne più strette, target ≥ 40px; smartphone = primario `+` 44px, `.md-subnav-select`, segmented a tutta larghezza, slug e nota sotto la lista, righe topic come card (nome, `Used in …`, Approve 44px, ⋯), menu ⋯ a popover, drawer a tutto schermo (regola esistente di `.pd-drawer`), conferma con le regole esistenti di `.pd-confirm`.
- [ ] **Step 4: Guard verde** — `npx vitest run js/lib/attribute-lists-page-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(attribute-lists): tablet and smartphone layout"`

---

### Task 9: Verifica visiva e documentazione

**Boards:** tutte le `14*.png` di `docs/superpowers/design/attribute-lists/redesign/`

**Files:**
- Modify: `docs/pages/attribute-lists.md` (sezione `## Redesign (2026-11-09)`: struttura, componenti, funzioni A–F, omissioni di spec §1.2, scostamenti accettati con motivo)
- Modify: `docs/pages/team.md` (`combo-select` ora condiviso), `docs/css/stylesheets.md` (`.pd-combo*`, `css/attribute-lists.css`, `badge-st-*` rimosso), `docs/js/shared-libs.md` (`js/combo-select.js`), `docs/js/lib.md` (`slugify.js`, `attribute-lists-ui.js`), `CLAUDE.md` (riga `js/*.js (the rest)`: aggiungere `combo-select.js`; riga Pages di `attribute-lists.html` se lo scopo cambia)
- Modify: `TEST_CASES.md` (TP-09 e AL-* al nuovo layout)

- [ ] **Step 1: Stack del branch** — copiare `.env` dal checkout principale se manca; `scripts/test-branch.sh up` (mai il main stack).
- [ ] **Step 2: Catture** — `node scripts/shoot.mjs --base http://localhost:8081 --url /attribute-lists.html --out shots/al --widths 1440,1024,390 --settle 3000` più uno scatto con `--eval` per ogni stato interattivo non sovrapponibile (menu item 14h, banner Undo 14i, coda dopo Approve 14p, drawer New list 14d, drawer Merge con lista aperta 14w, conferma 14y); credenziali da `.env` come in `docs/scripts/shoot.md`.
- [ ] **Step 3: Confronto** — rileggere ogni PNG con `Read` accanto alla sua tavola; elencare gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra e **fermarsi per la decisione dell'utente** (§6.6.5). Gli accettati vanno in `docs/pages/attribute-lists.md` con il motivo.
- [ ] **Step 4: Documentazione** — i file sopra; poi `npx vitest run scripts/` → PASS (guard documentali).
- [ ] **Step 5: Commit** — `git commit -am "docs(attribute-lists): redesign notes, test cases, shared combo-select"`

## Decisioni aperte

1. **Esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: i Task 3–8 modificano gli stessi due file in sequenza, quindi non sono indipendenti (§6.1).
2. **`filterComboOptions` e `sessionProgress` restano in `js/lib/team-ui.js`, che la pagina carica.** Alternativa scartata: spostarli in un modulo comune. Perché: nessun cambiamento a Team oltre all'estrazione del componente.
3. **Testi dei banner di successo dei form non fissati dal brief** (`Created "{name}".`, `Renamed to "{name}".`, `Added "{label}".`, `Saved "{label}".`, banner di New topic). Alternativa scartata: nessun banner. Perché: brief §6 chiede un banner verde di conferma senza darne il testo.
4. **I quattro modal restano fino ai Task 5–7, che li sostituiscono uno per uno.** Alternativa scartata: toglierli tutti nel Task 3. Perché: ogni commit lascia una pagina funzionante.
