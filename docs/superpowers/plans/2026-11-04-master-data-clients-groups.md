# Master Data — Clients & groups (phase 2, page 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-04-master-data-clients-groups-design.md`
**Branch:** `master-data-clients-groups`
**Risk class:** high-risk — money (gli input della rate card, `readMoneyInput`/`formatMoney`), file condivisi caricati da più pagine (`css/style.css`, `js/lib/icons.js`), cambio di comportamento di una route API (`DELETE /api/client-groups/:id`)

**Goal:** `master-clients.html` diventa "Clients & groups": viste List / By group con gestione inline dei gruppi, rate card come sotto-vista con URL proprio, layout tablet/phone; `master-client-groups.html` diventa un redirect; il delete di un gruppo con POT è rifiutato.

**Architecture:** La logica pura (filtro, sezioni, famiglia, fonte della tariffa, payload di salvataggio, spostamento, stato URL) va in `js/lib/master-clients.js`, testata con vitest; `cellSource` importa `resolveRoleRate` da `costgrid-calc.js`. La pagina resta una sola app Vue che legge e scrive lo stato nell'URL. Il backend cambia in `api/src/routes/client-groups.js` (409 + campo `pots`).

**Tech Stack:** HTML statico + Vue 3 da CDN, Bootstrap 5.3, Express + PostgreSQL, vitest + jsdom, `test-api.js` via `scripts/run-tests.sh`, `scripts/shoot.mjs`.

**Tasks independent?** No: i Task 4–6 modificano tutti `master-clients.html` e consumano il modulo del Task 2, le classi e le icone del Task 3 e il campo `pots` del Task 1.

## Global Constraints

- Copy in inglese, sentence case, testi esatti come nella spec (§5–§9). Errori di validazione invariati: `Name is required.`, `A client named "X" already exists.`, `Enter a valid amount in <CUR>, e.g. <esempio>.`
- Nessuna emoji, nessun `confirm(`/`alert(` nativo: conferme con `showConfirm(message, onConfirm, onCancel, title)` (`js/core.js:287`).
- Nessun hex nuovo nei CSS/JS toccati: solo token di `css/tokens.css` (il più vicino al valore della tavola).
- Icone solo SVG `.pd-icon` / `<ph-icon>` da `js/lib/icons.js`.
- Money: solo `js/lib/money.js` (`readMoneyInput` con `{ stored }`, `formatMoneyInput` con `{ keepZero: true }`, `formatMoney`, `moneyFormatExample`); mai `parseFloat` né `Intl.NumberFormat` su un importo.
- Cache-busting: ogni file versionato modificato → bump di **tutti** i suoi `?v=N` nel repo (`grep -rn "<file>?v=" --include=*.html --include=*.js .`).
- URL: `?view=group` = vista By group (assente = List); `?client=<id>` = rate card.
- Breakpoint: tablet 768–1023px, phone < 768px; target touch ≥ 44px su phone, controlli 40px su tablet.
- Durante i task si lanciano solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack: verifiche contro `scripts/test-branch.sh` / `scripts/run-tests.sh`.

## Review Focus

1. **`?client=<id>` di un client cancellato o inesistente** — la pagina torna alla lista con "Client not found." invece di una rate card vuota; test `readUrlState`/caso in Task 5.
2. **Due spostamenti rapidi dello stesso client** (selettore cambiato di nuovo prima che il primo finisca) — il selettore di quella riga è disabilitato mentre lo spostamento è in corso, così lo stato finale coincide col server; guard in Task 4.
3. **Rename del gruppo con lo stesso nome a meno delle maiuscole** — accettato se è lo stesso gruppo, rifiutato se è un altro; test `groupNameError` in Task 2.
4. **POT creato in un'altra scheda dopo il caricamento** — il delete arriva al server, il 409 compare in `globalError` e i gruppi si ricaricano (il cestino diventa disabilitato); test API in Task 1 + guard in Task 4.
5. **Uscita dalla rate card col back del browser con modifiche non salvate** — conferma; se annullata l'URL torna a `?client=<id>` e le modifiche restano; guard in Task 5.

---

### Task 1: Backend — delete di un gruppo con POT rifiutato, `pots` in `GET /client-groups`

**Files:**
- Modify: `api/src/routes/client-groups.js:8-24` (GET), `:54-64` (DELETE)
- Modify: `test-api.js` (dentro la sezione client-groups, vicino a `:343`)
- Modify: `docs/api/` — nessun file per client-groups; aggiorna `ARCHITECTURE.md` §5 solo se `scripts/architecture-guard.test.js` diventa rosso

**Interfaces:**
- Produces: `GET /api/client-groups` → ogni gruppo ha `pots: [{ id, year }]`, anno decrescente, `[]` se nessuno. `DELETE /api/client-groups/:id` → `409 { error: 'Group has a POT: remove the POT first.', code: 'GROUP_HAS_POT' }` se esiste una riga `pots` con quel `client_group_id`.

- [ ] **Step 1: Scrivi i casi API (falliscono)** in `test-api.js`, nella funzione che contiene la sezione client-groups:
  - `CG-POT-01` crea `__test_cg_pot_group__` + un POT (`POST /api/pots { clientGroupId, year, amount: 1000 }`, `later` di entrambi); `DELETE /api/client-groups/:id` → status 409 e `data.code === 'GROUP_HAS_POT'`; `GET /api/client-groups` contiene ancora il gruppo.
  - `CG-POT-02` lo stesso `GET` porta `pots` con un elemento `{ id: <potId>, year }`.
  - `CG-POT-03` un gruppo senza POT ha `pots` = `[]` e si cancella con 200.
- [ ] **Step 2: Lancia i test** — `bash scripts/run-tests.sh` (dal worktree, con `.env` copiato). Atteso: `CG-POT-01` e `CG-POT-02` FAIL.
- [ ] **Step 3: Implementa** — nel `GET` aggrega i POT con una subquery correlata (`COALESCE((SELECT json_agg(json_build_object('id', p.id, 'year', p.year) ORDER BY p.year DESC) FROM pots p WHERE p.client_group_id = cg.id), '[]')`), così il `GROUP BY` resta invariato; nel `DELETE` prima della cancellazione un `SELECT 1 FROM pots WHERE client_group_id = $1 LIMIT 1` → 409 con il corpo sopra. Aggiorna il commento del `DELETE`.
- [ ] **Step 4: Rilancia** — `bash scripts/run-tests.sh`. Atteso: tutti i `CG-POT-*` PASS, nessuna regressione (in particolare il POT-12, la cui pulizia cancella il POT prima del gruppo perché `runCleanup` va in ordine inverso).
- [ ] **Step 5: Commit** — `git add api/src/routes/client-groups.js test-api.js && git commit -m "feat(client-groups): refuse deleting a group with a POT; list its POT years"`

---

### Task 2: Modulo puro `js/lib/master-clients.js`

**Files:**
- Create: `js/lib/master-clients.js`
- Test: `js/lib/master-clients.test.js`

**Interfaces:**
- Consumes: `resolveRoleRate` (`import { resolveRoleRate } from './costgrid-calc.js?v=<versione corrente>'`); `readMoneyInput`, `moneyFormatExample` da `./money.js?v=<versione corrente>` (stessa versione dei tag `<script>` della pagina).
- Produces (tutte esportate e messe su `window.<nome>`):
  - `filterClients(clients, groupsById, query) → Client[]` — `clients: {id,name,groupId}`, `groupsById: Map<id,{name}>`; query trim, case-insensitive, match sul nome del client o del suo gruppo; query vuota → tutti; ordine per nome (`localeCompare`).
  - `groupSections(clients, groups) → [{ group: {id,name,pots}|null, clients: Client[] }]` — gruppi per nome (anche vuoti), poi `{ group: null }` solo se ci sono client senza gruppo.
  - `customRateCount(ratecard) → number` — entry con `hourlyRate != null` o almeno un valore non nullo in `rateOverrides`; `undefined` → 0.
  - `roleFamily(code) → string` — testo prima del primo `' - '`, trim; senza `' - '` → `'Other'`. `sortFamilies(names) → string[]` alfabetico con `'Other'` ultimo.
  - `cellSource({ row, code, currencies }) → { value: number|null, kind: 'custom'|'agency'|'agency-currency'|'converted'|'missing' }` — `row` = `{ roleId, defaults, texts, stored, hidden }` della rate card; il valore custom della cella è `readMoneyInput(row.texts[code], code, currencies, { stored: row.stored[code] })` (un NaN conta come assente). Custom → `custom`. Altrimenti: `resolveRoleRate({ roleId, globalRate: row.defaults.EUR, currency: code, currencyRate: <current_rate della valuta>, ratecardMap: {roleId: <custom EUR della riga, se c'è>}, ratecardOverrides: {}, roleOverrides: <defaults non EUR> })`; EUR senza agency € → `missing`; non EUR: `defaults[code] != null` → `agency-currency`, altrimenti, se c'è un € (custom o agency) → `converted`, sennò `missing`. EUR con agency € → `agency`.
  - `buildRatecardEntries(rows, currencies) → { entries } | { error: { code } }` — il corpo del ciclo di `saveClientRatecard` di oggi (`master-clients.html`) **spostato senza modifiche**: `hidden` in partenza, primo NaN → `{ error: { code } }`, righe senza valori escluse, `{ roleId, hourlyRate, rateOverrides }`.
  - `moveClient({ clientId, fromGroupId, toGroupId }, api) → Promise<void>` — `api = { assignClient(groupId, clientId), removeClient(groupId, clientId) }`; `from === to` → niente chiamate; remove se `fromGroupId`, poi assign se `toGroupId`; se l'assign fallisce dopo un remove riuscito → `assignClient(fromGroupId, clientId)` (errore del rollback ignorato) e rilancia l'errore originale; se fallisce il remove → rilancia senza assign.
  - `groupNameError(name, groups, selfId) → string|null` — `'Name is required.'` se vuoto dopo trim; `A group named "<nome esistente>" already exists.` se un altro gruppo (id ≠ `selfId`) ha lo stesso nome case-insensitive; altrimenti `null`.
  - `readUrlState(search) → { view: 'list'|'group', clientId: string|null }` e `urlFor({ view, clientId }) → string` (`'?client=<id>'` se clientId, altrimenti `'?view=group'` o `''`).

- [ ] **Step 1: Scrivi i test (falliscono)** in `js/lib/master-clients.test.js`, un `describe` per funzione, con almeno:
  - `filterClients`: `'bay'` trova "Bayer AG"; `'menarini group'` trova il client del gruppo "Menarini Group"; `'  '` → tutti, ordinati.
  - `groupSections`: gruppo vuoto presente; "No group" assente quando ogni client ha un gruppo; ordine dei gruppi per nome.
  - `customRateCount`: entry con solo `rateOverrides: { GBP: 150 }` conta; entry `{ hourlyRate: null, rateOverrides: {} }` no.
  - `roleFamily`: `'HWGACCSVS - DIRECTOR'` → `'HWGACCSVS'`; `'GREENLIGHT SHARED RESOURCE'` → `'Other'`; `sortFamilies(['Other','CPROD','HWG'])` → `['CPROD','HWG','Other']`.
  - `cellSource` con currencies `[{code:'EUR',current_rate:1,...},{code:'GBP',current_rate:0.86,...}]`: EUR custom 168 → `{168,'custom'}`; EUR vuoto, agency 130 → `{130,'agency'}`; EUR senza agency → `kind 'missing'`; GBP con agency 116 → `{116,'agency-currency'}`; GBP senza agency, agency € 110 → `{94.6,'converted'}`; GBP senza agency, custom € 100 → `{86,'converted'}`; GBP senza niente → `'missing'`; testo non valido `'abc'` trattato come assente.
  - `buildRatecardEntries`: **identità col payload della modale** — fissa tre righe (una con EUR + GBP, una vuota, una con `hidden: { SEK: 50 }` e testo EUR `'0'` con `stored: 0`) e confronta con l'array atteso scritto a mano dal comportamento attuale; un testo `'1,2,3'` in GBP → `{ error: { code: 'GBP' } }`.
  - `moveClient` con un `api` finto che registra le chiamate: assign da nessun gruppo; unassign (to `null`); move A→B = `[remove A, assign B]`; assign B rifiutato → `[remove A, assign B, assign A]` e la promise rifiuta con l'errore di B; remove A rifiutato → solo `[remove A]`, rifiuta; `from === to` → nessuna chiamata.
  - `groupNameError`: `''` → `'Name is required.'`; `'menarini group'` contro "Menarini Group" con `selfId` diverso → messaggio; stesso `selfId` → `null`.
  - `readUrlState('?client=abc')` → `{ view: 'list', clientId: 'abc' }`; `readUrlState('?view=group')` → `{ view: 'group', clientId: null }`; `urlFor` inverso.
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-clients.test.js`. Atteso: FAIL (modulo assente).
- [ ] **Step 3: Implementa** `js/lib/master-clients.js` con le firme sopra e il bridge `window.<nome> = <nome>` per ognuna (come gli altri moduli di `js/lib/`).
- [ ] **Step 4: Rilancia** — atteso: PASS.
- [ ] **Step 5: Commit** — `git add js/lib/master-clients.js js/lib/master-clients.test.js && git commit -m "feat(master-clients): pure helpers for views, rate sources, save payload and group moves"`

---

### Task 3: Controlli e icone condivisi — `.md-seg`, `.md-switch`, icone nuove

Boards: `docs/superpowers/design/MD-Clients-Groups/10.2a-clients-list.png` (segmented List / By group), `10.2c-rate-card.png` (toggle "Only customized", icone reset e info), `10.3a-by-group.png` (icona edificio, matita, puntini).

**Files:**
- Modify: `css/style.css` (accanto alle regole `.md-*`)
- Modify: `js/lib/icons.js` (mappa di `iconSvg`/`PhIcon`)
- Modify: ogni riferimento `?v=` di `style.css` e `icons.js` nel repo
- Test: `js/lib/master-data-guard.test.js` (nuovi `it` sulle classi), test esistente di icons se presente

**Interfaces:**
- Produces: classi `.md-seg` (contenitore) + `.md-seg-btn` (+ `.active`), `.md-switch` (label) + `input[type=checkbox]` interno, altezza 32px desktop / 40px tablet / 44px phone; icone `building`, `pencil`, `more` (tre puntini orizzontali), `reset` (freccia circolare antioraria), oltre a quelle già presenti (`search`, `info`, `chevron-down`, `chevron-left`, `check`, `plus`, `trash`, `arrow-right`).

- [ ] **Step 1: Test (falliscono)** — in `master-data-guard.test.js`: `style.css` definisce `.md-seg`, `.md-seg-btn.active`, `.md-switch`, e nessuna delle nuove regole contiene un hex; `iconSvg('building')`, `iconSvg('pencil')`, `iconSvg('more')`, `iconSvg('reset')` restituiscono una stringa non vuota.
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-data-guard.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementa** le classi (traccia token più vicino a `#EEF0F4`, pillola attiva bianca con ombra token, testo muted / navy attivo; switch 36×20 con pallino, token per on/off) e le quattro icone 16×16 stroke `currentColor`, stile delle esistenti. Bump di `style.css` e `icons.js` in tutti i riferimenti (`grep -rn "css/style.css?v=" --include=*.html .`, `grep -rn "icons.js?v=" --include=*.html --include=*.js .`).
- [ ] **Step 4: Rilancia** — `npx vitest run js/lib/master-data-guard.test.js js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js`. Atteso: PASS (le ultime due pinnano l'accordo dei `?v=`).
- [ ] **Step 5: Commit** — `git commit -am "feat(master-data): segmented control, switch and icons for the Master Data pages"`

---

### Task 4: Viste List e By group + redirect di Client Groups

Boards: `docs/superpowers/design/MD-Clients-Groups/10.2a-clients-list.png`, `10.2a.jpg`, `10.2b-new-client-inline.png`, `10.3a-by-group.png`, `10.3b-new-group-add-client.png`. Prima di chiudere il task apri le cinque tavole e confronta il markup (toolbar, colonne, righe, testate di gruppo, popover); colonna Status, segmented Active/Archived e frase sull'archivio **non** vanno riprodotti (spec §3).

**Files:**
- Modify: `master-clients.html` (markup della card, `<style>`, app Vue: `data`, `computed`, `created`, metodi client/gruppo; rimuovi form card e link "Client groups →")
- Modify: `master-client-groups.html` (sostituito dal redirect)
- Modify: `js/lib/master-data-guard.test.js`, `js/lib/content-surface-guard.test.js`, `js/lib/nav-shell-guard.test.js`, `js/lib/page-head-guard.test.js`, `js/lib/page-names.test.js`

**Interfaces:**
- Consumes: Task 1 `pots`; Task 2 `filterClients`, `groupSections`, `customRateCount`, `moveClient`, `groupNameError`, `readUrlState`, `urlFor`; Task 3 `.md-seg`, icone.
- Produces (per i Task 5–6): in `data` — `view`, `query`, `groups` (`{id,name,pots,clients}` da `Api.clientGroups.list()`), `clients` (`{id,name,groupId}`), `ratecards` (da `Api.ratecards.list()`), `rateClientId: null`; metodo `openRateCard(client)` (stub in questo task: per ora `history.pushState` dell'URL `urlFor({clientId})`, il Task 5 lo riempie); `customCountOf(clientId)`.

- [ ] **Step 1: Aggiorna i guard (falliscono)**:
  - `master-data-guard`: `master-client-groups.html` esce da `PAGES` ed entra in un test di redirect che verifica `url=/master-clients.html?view=group` e `location.replace('/master-clients.html?view=group')`, senza `Vue.createApp`; per `master-clients.html` `api` diventa `['clientGroups','clients','currencies','ratecards','roles']`, `must` perde `id="clientRcModal"` e acquista `Api.clientGroups.list()`, `Api.ratecards.list()`, `readUrlState(`; card title `Clients & groups`, terzo livello della breadcrumb `Clients & groups`.
  - `master-data-guard`: `master-clients.html` non contiene `confirm(`, `alert(`, `💲`, `✏️`, `🗑`, `🏢`, `form-card`; il `<select>`/menu del gruppo è disabilitato durante lo spostamento (`:disabled="c._moving"` o equivalente pinnato per nome).
  - `content-surface-guard`, `nav-shell-guard`, `page-head-guard`, `page-names.test.js`: `master-client-groups.html` tolto dalle liste delle pagine con `initNav` (oppure atteso come redirect, come `config.html`).
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-data-guard.test.js js/lib/content-surface-guard.test.js js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js js/lib/page-names.test.js`. Atteso: FAIL.
- [ ] **Step 3: Redirect** — `master-client-groups.html` con la stessa struttura di `config.html`, destinazione `/master-clients.html?view=group`, link testuale "Go to Clients & groups".
- [ ] **Step 4: Pagina** — in `master-clients.html` (spec §5, §6, §8):
  - carica `<script type="module" src="js/lib/master-clients.js?v=1">`; in `created` carica in parallelo `Api.clients.list()`, `Api.clientGroups.list()`, `Api.ratecards.list()` (più le valute come oggi); `groupId` di ogni client derivato dai gruppi; `view` da `readUrlState(location.search)`; cambio vista → `history.replaceState(null, '', urlFor(...) || location.pathname)`.
  - testata della card (spec §5.1), tabella (§5.2), riga nuovo client (§5.3), nota/stati vuoti (§5.4), sezioni By group (§6.1), pillola POT e delete (§6.2), rename/nuovo gruppo con `groupNameError` (§6.3), popover "+ Add client" (§6.4); menu del gruppo sulla riga e "⋯" come dropdown Bootstrap con `popperConfig` di default; "+ New group…" ricorda il client e lo assegna dopo la create.
  - spostamento: `c._moving = true`, `groupId` ottimistico, `await moveClient(...)` con `Api.clientGroups`, in errore ripristina e `globalError`, poi ricarica i gruppi; `_moving = false` in `finally`.
  - delete client e delete gruppo con `showConfirm` e la copy della spec; un errore (anche il 409 `GROUP_HAS_POT`) in `globalError`, poi ricarica i gruppi.
  - breadcrumb in `initNav`: `Home / Master Data / Clients & groups`.
  - `<style>` della pagina: via le regole morte (`.cfg-tab*`, `.team-sep`, `.form-card*`, `.section-title`) e gli hex; righe 52px, testate gruppo 46px, rientro 46px.
- [ ] **Step 5: Rilancia** gli stessi cinque file del passo 2 + `npx vitest run js/lib/master-clients.test.js`. Atteso: PASS.
- [ ] **Step 6: Confronto con le tavole** — apri le cinque tavole e, se lo stack del branch è su, uno shoot a 1440 (`node scripts/shoot.mjs --url /master-clients.html --base http://localhost:8081 --settle 3000 --widths 1440 --out shots/md-clients-list`) e `--url '/master-clients.html?view=group'`; annota gli scostamenti per il Task 7.
- [ ] **Step 7: Commit** — `git add -A master-clients.html master-client-groups.html js/lib/*.test.js && git commit -m "feat(master-clients): Clients & groups list and by-group views; Client Groups page redirects"`

---

### Task 5: Rate card come sotto-vista (desktop)

Boards: `docs/superpowers/design/MD-Clients-Groups/10.2c-rate-card.png`, `10.2d-rate-card-how-rates-resolve.png`. Prima di chiudere apri le due tavole e confronta testa, toolbar, legenda, testate di famiglia, didascalie, save bar e il pannello "How rates resolve". Il nome esteso della famiglia ("Healthware Account Services") **non** si riproduce (spec §3).

**Files:**
- Modify: `master-clients.html` (rimuovi `#clientRcModal`; sotto-vista; `openClientRatecard`/`saveClientRatecard` riscritti attorno a `buildRatecardEntries`; `popstate`, `beforeunload`)
- Modify: `js/lib/master-clients-ratecard-guard.test.js`

**Interfaces:**
- Consumes: Task 2 `cellSource`, `buildRatecardEntries`, `roleFamily`, `sortFamilies`, `readUrlState`, `urlFor`; Task 4 `rateClientId`, `ratecards`, `openRateCard(client)`; `window.updateBreadcrumbs(items)` (`js/nav.js:331`).
- Produces: `rc` di stato con `rows[].initial` (i testi all'apertura) per dirty/Discard; `rcDirtyCount` computed; `leaveRateCard()` → `Promise<boolean>`.

- [ ] **Step 1: Guard (falliscono)** — riscrivi `master-clients-ratecard-guard.test.js` sui nuovi nomi mantenendo ogni invariante di oggi: `openClientRatecard` e `saveClientRatecard` non scrivono `this.rc.` dopo il primo `await`; `openClientRatecard` contiene `Api.roles.list()` e non `this.roles.map`; `keepZero: true` presente e nessuna regola `=== 0 ? '0'`; `onRcFocus`/`onRcBlur` passano `stored: row.stored[code]`; il timer del messaggio usa `msgSeq`. In più: `saveClientRatecard` chiama `buildRatecardEntries(` e `Api.ratecards.updateEntries(`; la pagina non contiene `clientRcModal` né `bootstrap.Modal`; contiene `window.updateBreadcrumbs(`, `addEventListener('popstate'`, `beforeunload`; nessun `this.rc.rows` costruito da una lista di ruoli caricata al load.
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-clients-ratecard-guard.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementa** (spec §7):
  - `openRateCard(client)` → `history.pushState(null,'',urlFor({clientId}))`, `rateClientId = id`, `openClientRatecard(client)`; reload / `popstate` con `?client=` sconosciuto → lista con `globalError = 'Client not found.'` e `replaceState` a `urlFor({view})`.
  - `openClientRatecard`: stesso caricamento di oggi (fresh `Api.ratecards.list()` + `Api.roles.list()`, auto-create, `hidden`); ogni riga porta anche `family = roleFamily(code)` e `initial = { ...texts }`.
  - render: famiglie con `sortFamilies`, apribili, conteggio "x of y customized" / "y roles · agency rates"; per ogni cella placeholder = `cellSource(...).value` formattato con `formatMoneyInput`, didascalia secondo `kind` (spec §7.2); reset di riga; ricerca + "Only customized"; legenda; pannello "How rates resolve" con la copy della spec §7.4 e la prima valuta extra come esempio.
  - `saveClientRatecard`: `buildRatecardEntries(state.rows, this.currencies)`; un `error` → messaggio `Enter a valid amount in ${code}, e.g. ${moneyFormatExample(code, currencies)}.` nella save bar; successo → `initial = { ...texts }` per ogni riga, ricarica `this.ratecards` (pillole della lista), messaggio con il timer `msgSeq` di oggi.
  - `leaveRateCard()`: se `rcDirtyCount > 0` → `showConfirm('You have unsaved rate changes. Leave without saving?', …)`; "← Clients" e il link "Clients & groups" della breadcrumb (intercettato col `click` su `#breadcrumb-bar a[href^="/master-clients.html"]`) passano da qui; `popstate` annullato → `history.pushState` di nuovo `urlFor({clientId})`; `beforeunload` attivo solo con modifiche.
  - breadcrumb: all'apertura `updateBreadcrumbs([Home, Master Data, {label:'Clients & groups', href:'/master-clients.html'}, {label:`${name} · Rate card`}])`, all'uscita torna a tre livelli.
- [ ] **Step 4: Rilancia** — `npx vitest run js/lib/master-clients-ratecard-guard.test.js js/lib/master-clients.test.js js/lib/master-data-guard.test.js js/lib/money-guard.test.js`. Atteso: PASS.
- [ ] **Step 5: Confronto con le tavole** — shoot a 1440 di `?client=<id di un client con rate card>` e dello stato con "How rates resolve" aperto (`--eval` che clicca il toggle), confronto con 10.2c/10.2d; scostamenti annotati per il Task 7.
- [ ] **Step 6: Commit** — `git commit -am "feat(master-clients): client rate card as a routed sub-view with rate sources and unsaved-changes guard"`

---

### Task 6: Responsive — tablet e smartphone

Boards: `docs/superpowers/design/MD-Clients-Groups/10.2e-tablet-smartphone.png` (tre frame: tablet rate card 1024×768, phone lista By group 390×844, phone rate card 390×844). Prima di chiudere confronta ogni frame col proprio shoot.

**Files:**
- Modify: `master-clients.html` (`<style>` con media query; markup phone: card dei client, menu "⋯" con Edit / Move to group / Delete, segmented di valuta della rate card)
- Test: `js/lib/master-data-guard.test.js`

**Interfaces:**
- Consumes: Task 3 `.md-seg`; Task 4 righe client e menu; Task 5 stato `rc`.
- Produces: `rcPhoneCurrency` (default `'EUR'`) in `data`.

- [ ] **Step 1: Guard (falliscono)** — in `master-data-guard`: lo `<style>` di `master-clients.html` ha `@media (max-width: 1023.98px)` con controlli a 40px e `@media (max-width: 767.98px)` con `min-height: 44px` sui target (bottoni toolbar, "⋯", "Rate card ›", input della rate card); un `@media (max-width: 899.98px)` nasconde la colonna pillola Rate card; la rate card tablet ha `position: sticky` sulle colonne Role e Client €.
- [ ] **Step 2: Lancia** — `npx vitest run js/lib/master-data-guard.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementa** spec §9: tablet (toolbar su due righe, pillola nascosta < 900px, rate card con Role + Client € sticky, valute in scroll, Agency € ultima colonna via `order`/markup duplicato nascosto, input 40px, save bar fissa in fondo al contenuto); phone (toolbar search + "+ Add", seconda riga segmented + "+ Group", client come card, By group con etichette maiuscole, rate card una valuta per volta con `rcPhoneCurrency` e la hint della spec, famiglie come card, input 96×44px, save bar sticky con "N roles customized"). Il markup phone si alterna al desktop via CSS (`d-none`/media query), una sola fonte di dati.
- [ ] **Step 4: Rilancia** — `npx vitest run js/lib/master-data-guard.test.js`. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(master-clients): tablet and phone layouts for clients, groups and the rate card"`

---

### Task 7: Verifica visiva, documentazione, caso manuale

Boards: tutte le tavole di `docs/superpowers/design/MD-Clients-Groups/` (mappa nella spec §3).

**Files:**
- Modify: `docs/pages/config.md` (nuova sezione "Clients & groups (2026-11-04, Master Data phase 2)": viste, sotto-vista, URL, regola del delete gruppo, deviazioni accettate con il motivo)
- Modify: `TEST_CASES.md` (caso `MD-14`: rate card sotto-vista, back/forward, unsaved guard, spostamento fra gruppi con rollback, delete gruppo con POT, redirect)
- Modify: `master-clients.html` solo per i fix-ora decisi

- [ ] **Step 1: Stack del branch** — `scripts/test-branch.sh up` (worktree con `.env` copiato), poi `scripts/test-branch.sh status` → `up`.
- [ ] **Step 2: Shoot** (spec §12) con `--base http://localhost:8081 --settle 3000`, credenziali da `SHOOT_EMAIL`/`SHOOT_PASSWORD`: lista e By group con popover "+ Add client" aperto a 1440; rate card e rate card con "How rates resolve" a 1440; rate card a 1024; lista By group e rate card a 390 (`--full` solo sulla lista a 1440).
- [ ] **Step 3: Rileggi ogni PNG con `Read`** e confrontalo con la sua tavola; presenta all'utente gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra e **aspetta la decisione**.
- [ ] **Step 4: Applica** i fix-ora (test mirato se esiste) e scrivi gli "accetta" con il motivo in `docs/pages/config.md`; aggiungi `MD-14` a `TEST_CASES.md`.
- [ ] **Step 5: Verifica** — `npx vitest run js/lib/test-cases-parse.test.js scripts/doc-paths-guard.test.js scripts/claude-md-guard.test.js js/lib/master-data-guard.test.js`. Atteso: PASS.
- [ ] **Step 6: Commit** — `git add -A docs/pages/config.md TEST_CASES.md master-clients.html && git commit -m "docs(master-clients): Clients & groups notes, accepted deviations and manual test case"`. Lo stack del branch resta su per il Gate 2.

---

## Decisioni aperte

1. **Esecuzione nativa, non subagent-driven.** Alternativa scartata: subagent-driven. Perché: §6.1 richiede task indipendenti, e i Task 4–6 riscrivono lo stesso `master-clients.html` uno sopra l'altro.
2. **Il test del 409 vive in `test-api.js`, non in un `node:test`.** Alternativa scartata: estrarre la regola in `api/src/lib/`. Perché: la regola è una sola query, e il suo valore sta nell'interazione con la cascata reale dei POT.
3. **`moveClient` riceve l'oggetto API per iniezione.** Alternativa scartata: chiamare `Api.clientGroups` dentro il modulo. Perché: il rollback si può testare solo con un API finto.
4. **I campi `pots` arrivano con una subquery correlata.** Alternativa scartata: un `LEFT JOIN` più `json_agg` nel `GROUP BY` esistente. Perché: il join moltiplicherebbe le righe dei client per i POT.
5. **Il markup phone della lista e della rate card è un blocco separato, alternato via CSS.** Alternativa scartata: una sola tabella ristilizzata a card. Perché: la rate card phone mostra una valuta per volta, una struttura diversa dalla tabella.
6. **La breadcrumb si aggiorna con la `window.updateBreadcrumbs` che `nav.js` espone già** (la spec è stata corretta prima del Piano). Alternativa scartata: una funzione nuova in `nav.js`. Perché: esiste già, e `nav.js` resta intatto senza bump.
