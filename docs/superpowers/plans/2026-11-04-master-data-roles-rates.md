# Master Data — Roles & rates (phase 2, page 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-04-master-data-roles-rates-design.md`
**Branch:** `master-data-roles-rates`
**Risk class:** high-risk — money o valute (input delle tariffe con `readMoneyInput`, colonne per valuta, fallback `resolveRoleRate`)

**Goal:** `master-roles.html` diventa la pagina "Roles & rates" delle tavole 10.7a–e: lista per team con una colonna per valuta attiva, pannello laterale create/edit, dialogo di delete con l'errore del server dentro, layout tablet/phone.

**Architecture:** La logica pura (team, filtro, gruppi, colonne, fallback, split/join del codice) va nel nuovo `js/lib/master-roles.js`, testata con vitest. La pagina resta una sola app Vue con CSS locale `.mdr-*`; il pannello copia il pattern `.mdp-drawer` di `master-pipelines.html`; il dialogo è un modal Bootstrap guidato da Vue sul precedente `#crRateConfirmModal`. Nessuna API, nessun file condiviso modificato.

**Tech Stack:** HTML statico + Vue 3 da CDN, Bootstrap 5.3, vitest + jsdom, `scripts/shoot.mjs`.

**Tasks independent?** No: i Task 2–5 modificano tutti `master-roles.html` uno sopra l'altro e consumano il modulo del Task 1.

## Global Constraints

- Copy in inglese, sentence case, testi esatti della spec §5–§8. Errori invariati e nello stesso ordine in `saveRole`: `Label is required.`, `Code is required.`, `Default rate is required.`, `Enter a valid amount in ${c}, e.g. ${moneyFormatExample(c, currencies)}.`, `Code "${code}" is already used by role "${dup.label}".`
- Il guard `js/lib/master-roles-rate-input-guard.test.js` **non si modifica** e deve passare dopo ogni task: restano `v-model="rf.rateText"`, `v-model="rf.overrideTexts[cu.code]"`, `@focus="onMoneyFocus(`, `@blur="onMoneyBlur(`, `keepZero: true`, `formatMoney(r.rate, 'EUR', currencies)`, i `stored:` in `onMoneyFocus`/`onMoneyBlur`/`saveRole`, `async saveRole()` seguito da `async deleteRole`; niente `€/h`, `type="number"`, `toLocaleString(`, `rf.rateOverrides`.
- Nessuna emoji, nessun `confirm(`/`alert(`; nessun hex nella pagina: solo token di `css/tokens.css` (ambra = `--color-warning`, `--color-warning-bg`, `--color-warning-text`; scrim = `--overlay-scrim` con opacity `.5`).
- Icone solo `<ph-icon>` di `js/lib/icons.js` (esistono già `search`, `chevron-down`, `chevron-right`, `close`, `trash`, `lock`).
- Money solo via `js/lib/money.js`; mai `parseFloat`/`Intl.NumberFormat` nella pagina.
- Il `team` non si invia mai all'API: `Api.roles.create/update` con `{ label, code, hourlyRate, rateOverrides }`.
- `js/lib/master-roles.js` caricato come `<script type="module" src="js/lib/master-roles.js?v=1">` prima dello script dell'app; importa `resolveRoleRate` da `./costgrid-calc.js?v=16`.
- Breakpoint: tablet 768–1023.98px, phone < 768px; controlli 40px su tablet, ≥ 44px su phone.
- Durante i task solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack: verifiche contro `scripts/test-branch.sh`.
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM).

## Review Focus

1. **Codice con più separatori (`"HWGDEV - SR - LEAD"`) o spazi attorno** — `splitCode` dà team `HWGDEV`, role `SR - LEAD`, e `joinCode` restituisce lo stesso codice; test nel Task 1.
2. **Valuta attiva con `current_rate` null o 0** — `fallbackRate` restituisce `null` (nessun "≈" falso pari al valore in euro), il tooltip dice "No rate"; test nel Task 1.
3. **Team digitato in minuscolo uguale a uno esistente (`hwgdev` + `DEVELOPER`)** — il controllo duplicati confronta il codice composto case-insensitive e blocca `HWGDEV - DEVELOPER` già esistente; guard nel Task 3.
4. **Doppio click su "Delete role"** — una sola richiesta: `confirmDelete` esce subito se `del.loading`; guard nel Task 4.
5. **Esc con il dialogo di delete aperto sopra il pannello** — chiude solo il dialogo; l'handler Esc del pannello esce se `document.querySelector('.modal.show')`; guard nel Task 3.

---

### Task 1: Modulo puro `js/lib/master-roles.js`

**Files:**
- Create: `js/lib/master-roles.js`
- Test: `js/lib/master-roles.test.js`

**Interfaces:**
- Produces (export + `window.<name>` bridge per ciascuno):
  - `extractTeam(code: string) => string` — identica a `master-roles.html:379-383`.
  - `isMissingRate(rate) => boolean` — `rate == null || Number(rate) === 0`.
  - `rateColumns(currencies: Array<{code, active, symbol, current_rate}>) => Array<currency>` — l'entry EUR della lista (o `{ code: 'EUR' }` se assente), poi le non-EUR con `active` nell'ordine ricevuto.
  - `filterRoles(roles: Array<{label, code, rate}>, { query = '', missingOnly = false } = {}) => roles`.
  - `groupRoles(roles) => Array<{ team: string, roles: Array, missing: number }>` — team con `localeCompare`, ruoli per label con `localeCompare`; `missing` = ruoli con `isMissingRate(rate)`.
  - `fallbackRate(role: {id, rate}, currency: {code, current_rate}) => number|null` — `null` se `isMissingRate(role.rate)` o `!(Number(currency.current_rate) > 0)`; altrimenti `resolveRoleRate({ roleId: role.id, globalRate: Number(role.rate), currency: currency.code, currencyRate: Number(currency.current_rate) }).effectiveRate`.
  - `splitCode(code: string) => { team: string, role: string }` — con `" - "`: `{ team: extractTeam(code), role: code.slice(code.indexOf(' - ') + 3).trim() }`; senza: `{ team: '', role: String(code ?? '').trim() }`.
  - `joinCode(team: string, role: string) => string` — trim di entrambi; `team ? team + ' - ' + role : role`.
  - `teamOptions(roles) => string[]` — `extractTeam` dei codici che contengono `" - "`, distinti, ordinati con `localeCompare`.

- [ ] **Step 1: Scrivi i test** in `js/lib/master-roles.test.js` (import da `./master-roles.js`):
  - `extractTeam`: `'PM - Project Manager'` → `'PM'`; `'DEV_LEAD'` → `'DEV'`; `''` → `'—'`; `null` → `'—'`.
  - `isMissingRate`: `null`, `undefined`, `0`, `'0'` → `true`; `150` → `false`.
  - `rateColumns([{code:'USD',active:true},{code:'EUR',active:true},{code:'GBP',active:false},{code:'CHF',active:true}])` → codici `['EUR','USD','CHF']`; `rateColumns([])` → `[{code:'EUR'}]`.
  - `filterRoles`: query `'manager'` trova per label, `'hwgdev'` per code (case-insensitive), `'  '` restituisce tutti; `missingOnly` tiene i ruoli con rate `0` e `null`, esclude `150`.
  - `groupRoles`: input non ordinato con team `B`, `A`, `A` → team `['A','B']`, ruoli di `A` per label; `missing` conta 0 e null.
  - `fallbackRate`: `({id:1,rate:105},{code:'GBP',current_rate:0.8})` → `84`; `({id:1,rate:100},{code:'JPY',current_rate:161.234})` → `16123` (zero decimali); `({id:1,rate:0},{code:'GBP',current_rate:0.8})` → `null`; `({id:1,rate:100},{code:'GBP',current_rate:null})` → `null`; `current_rate: 0` → `null`.
  - `splitCode`/`joinCode`: `'HWGACCSVS - MARKETING COORDINATOR'` → `{team:'HWGACCSVS', role:'MARKETING COORDINATOR'}` e ritorno identico; `'HWGDEV - SR - LEAD'` → `{team:'HWGDEV', role:'SR - LEAD'}` e ritorno identico; `'LEGACYCODE'` → `{team:'', role:'LEGACYCODE'}` e `joinCode('', 'LEGACYCODE')` → `'LEGACYCODE'`; `joinCode(' hwgdev ', ' dev ')` → `'hwgdev - dev'`.
  - `teamOptions`: `['B - x','A - y','A - z','LEGACY']` → `['A','B']`.
- [ ] **Step 2: Esegui** `npx vitest run js/lib/master-roles.test.js` — atteso FAIL (modulo assente).
- [ ] **Step 3: Implementa** `js/lib/master-roles.js` con l'intestazione nello stile di `js/lib/master-clients.js` e le firme sopra.
- [ ] **Step 4: Esegui** `npx vitest run js/lib/master-roles.test.js` — atteso PASS.
- [ ] **Step 5: Commit** — `git add js/lib/master-roles.js js/lib/master-roles.test.js && git commit -m "feat(master-roles): pure helpers for grouping, rate columns, fallback and code split"`

### Task 2: Lista per team (10.7a)

Boards: `docs/superpowers/design/MD-Roles-Rates/10.7a-roles-list.jpg`, `MDRoles.dc.html` (stato default). Prima di chiudere apri la tavola e confronta testata della card, ricerca, switch ambra, colonne, righe gruppo con chevron e pill, righe ruolo (label + codice monospace), "No rate" e riga ambra, "—", azioni Edit/cestino e nota a piè. La colonna "Used in" **non** si riproduce (spec §3).

**Files:**
- Modify: `master-roles.html`
- Modify: `js/lib/master-data-guard.test.js` (riga `PAGES` di Roles e nuovo blocco `describe('master-roles.html (Roles & rates)')`)

**Interfaces:**
- Consumes: Task 1 via `window.*` (`extractTeam`, `isMissingRate`, `rateColumns`, `filterRoles`, `groupRoles`, `fallbackRate`).
- Produces: data `query: ''`, `missingOnly: false`, `closedTeams: new Set()` (sostituito per reattività, mai mutato in place), `loadError: null`; computed `columns` (= `rateColumns(currencies)`), `missingCount`, `visibleGroups` (= `groupRoles(filterRoles(roles, {query, missingOnly}))`), `groupedRoles` (resta, alias di `visibleGroups`, per il `must` del guard); methods `isGroupOpen(team)`, `toggleGroup(team)`, `rateCell(r, cu) => { text, missing, title }`. `openRoleForm(r)` resta il punto d'ingresso di Edit; `deleteRole(r)` resta il punto d'ingresso del cestino (riscritto nel Task 4).

- [ ] **Step 1: Estendi il guard** — nuovo blocco per `master-roles.html`: `not.toContain('confirm(')`, `not.toContain('alert(')`, nessuna di `'✏️','🗑','⚠️'`, `not.toContain('form-card')`, `not.toContain('globalError(msg)')`, `toContain('js/lib/master-roles.js?v=1')`, `toContain('Missing rates')`, `toContain('No roles match the current search.')`, nessun hex nel blocco `<style>` (`/#[0-9a-fA-F]{3,8}\b/`).
- [ ] **Step 2: Esegui** `npx vitest run js/lib/master-data-guard.test.js` — atteso FAIL sui nuovi casi.
- [ ] **Step 3: Implementa** la lista (spec §5): carica il modulo; sostituisci `<style>` con CSS `.mdr-*` a soli token; testata della card con titolo "Roles &amp; rates · {{ roles.length }}", descrizione, ricerca (`ph-icon search`), `.md-switch.mdr-switch-warn` (track `--color-warning` quando checked) "Missing rates · {{ missingCount }}", `.btn-primary` "+ Add role"; tabella in un contenitore `overflow-x: auto` con colonna Role sticky; header `{{ currencyInfo(cu.code, currencies).symbol }}/h`; riga gruppo `<tr>` cliccabile con `ph-icon chevron-down` ruotato da chiuso, pill "{{ g.missing }} without € rate"; gruppi forzati aperti se `query.trim()` o `missingOnly`; celle EUR con la stringa letterale `formatMoney(r.rate, 'EUR', currencies)` (guard), "No rate" con `title="No € rate: this role can't be priced"`, riga `.is-missing`; celle non-EUR da `rateCell` (`title`+`aria-label` "≈ {formatMoney(fallback)} from € × rate" o "No rate"); azioni link "Edit" e `ph-icon trash` 30×30 con `aria-label="Delete role"`; nota a piè e i due vuoti. In `loadAll` l'errore va in `loadError` mostrato nella card; rimuovi il `watch` su `globalError` e `globalError` se non resta usato. Rimuovi `extractTeam` dai methods e usa `window.extractTeam` via un wrapper come `formatMoney`.
- [ ] **Step 4: Esegui** `npx vitest run js/lib/master-data-guard.test.js js/lib/master-roles-rate-input-guard.test.js` — atteso PASS.
- [ ] **Step 5: Commit** — `git add master-roles.html js/lib/master-data-guard.test.js && git commit -m "feat(master-roles): list grouped by team with one rate column per active currency"`

### Task 3: Pannello create/edit (10.7b, 10.7c)

Boards: `docs/superpowers/design/MD-Roles-Rates/10.7b-new-role-panel.jpg`, `10.7c-edit-role-panel.jpg`, `MDRoles.dc.html` (`panel=new`, `panel=edit`). Prima di chiudere confronta testa (eyebrow + titolo + ✕), Label, Team + Role code affiancati con hint, riga Full code, griglia tariffe con prefisso/suffisso e hint per stato, riga "Changing a rate…", footer. Il blocco usage ("Used in 5 cost grids…") **non** si riproduce (spec §3).

**Files:**
- Modify: `master-roles.html`
- Create: `js/lib/master-roles-page-guard.test.js`

**Interfaces:**
- Consumes: Task 1 `splitCode`, `joinCode`, `teamOptions`, `rateColumns`; Task 2 `columns`, `closedTeams`.
- Produces: `rf` con in più `team: ''`, `roleCode: ''` (al posto di `code`), `teamOpen: false`; computed `fullCode` (= `joinCode(rf.team, rf.roleCode).toUpperCase()`), `teamMatches`; methods `closePanel()`, `onPanelKeydown(e)`. `rf.show` resta il flag di apertura.

- [ ] **Step 1: Scrivi** `js/lib/master-roles-page-guard.test.js` (legge `master-roles.html` come il guard delle tariffe):
  - `openRoleForm` contiene `Object.entries(role?.rateOverrides || {})` (ogni override salvato, anche di valute inattive, finisce in `overrideTexts`);
  - il corpo di `saveRole` contiene `Object.entries(this.rf.overrideTexts)` e `joinCode(` e **non** contiene `team:` nel payload di `Api.roles.create`/`update`;
  - il controllo duplicati confronta `r.code.toLowerCase() === code.toLowerCase()` dove `code` viene da `joinCode`;
  - il pannello ha `role="dialog"` e `aria-modal="true"`; l'handler Esc contiene `.modal.show`;
  - il primario ha `:disabled` che include `rf.loading` e il controllo su label e `roleCode`.
- [ ] **Step 2: Esegui** `npx vitest run js/lib/master-roles-page-guard.test.js` — atteso FAIL.
- [ ] **Step 3: Implementa** il pannello (spec §6): wrapper `.mdr-drawer-wrap` con `.mdr-scrim` (clic → `closePanel`) e `<aside class="mdr-drawer" role="dialog" aria-modal="true">` 480px; Esc via listener su `document` aggiunto in `mounted` e rimosso in `beforeUnmount`; head, Label (`ref="rfLabel"`), combobox Team (input + `<ul role="listbox">` di `teamMatches`, su focus apre, frecce/Enter scelgono, Esc chiude la lista senza chiudere il pannello, clic su opzione con `@mousedown.prevent`), Role code monospace, riga Full code con `{{ fullCode }}`, griglia tariffe su `columns` (EUR con `v-model="rf.rateText"`, le altre `v-for="cu in columns.filter(c => c.code !== 'EUR')"` con `v-model="rf.overrideTexts[cu.code]"` e il placeholder attuale preceduto da "≈ "), hint per stato come spec §6, riga "Changing a rate doesn't change existing cost grids." solo in edit, footer con "Delete role" (solo edit, chiama `deleteRole` del ruolo e `closePanel`), Cancel, primario "Create role"/"Save changes" con spinner. `openRoleForm` imposta `team`/`roleCode` da `splitCode(role.code)`. In `saveRole` sostituisci solo `const code = this.rf.code.trim();` con `const code = window.joinCode(this.rf.team, this.rf.roleCode);` (resto invariato); al successo `closedTeams` perde `extractTeam(code)`. Errori `rf.error` in cima al body del pannello.
- [ ] **Step 4: Esegui** `npx vitest run js/lib/master-roles-page-guard.test.js js/lib/master-roles-rate-input-guard.test.js js/lib/master-data-guard.test.js` — atteso PASS.
- [ ] **Step 5: Commit** — `git add master-roles.html js/lib/master-roles-page-guard.test.js && git commit -m "feat(master-roles): side panel for create and edit with team, role code and per-currency rates"`

### Task 4: Dialogo di delete (10.7d)

Boards: `docs/superpowers/design/MD-Roles-Rates/10.7d-delete-confirm.jpg`, `MDRoles.dc.html` (`confirm=true`). Prima di chiudere confronta titolo, corpo, bottoni. Il box grigio con i conteggi **non** si riproduce (spec §7, ledger 8) e il corpo segue la regola del server, non il testo della tavola.

**Files:**
- Modify: `master-roles.html`
- Modify: `js/lib/master-roles-page-guard.test.js`

**Interfaces:**
- Consumes: Task 3 `closePanel()`.
- Produces: data `del: { role: null, error: null, loading: false }`; methods `async deleteRole(role)` (apre il modal; resta `async` e subito dopo `saveRole`, perché il guard delle tariffe taglia il corpo di `saveRole` su `async deleteRole`), `async confirmDelete()`.

- [ ] **Step 1: Aggiungi al guard**: `id="roleDeleteModal"` dentro `#app` (indice prima di `</div><!-- #app -->`); il corpo di `confirmDelete` inizia con un'uscita su `this.del.loading`, scrive `this.del.error` nel `catch`, non contiene `globalError` né `alert(`; il bottone Delete ha `:disabled` con `del.loading` e `del.error`; il testo "A role used in a cost grid or assigned to a team resource can't be deleted." è presente.
- [ ] **Step 2: Esegui** `npx vitest run js/lib/master-roles-page-guard.test.js` — atteso FAIL sui nuovi casi.
- [ ] **Step 3: Implementa** (spec §7): `#roleDeleteModal` `.modal fade` dentro `#app` con titolo `Delete "{{ del.role?.label }}"?`, corpo esatto della spec, alert `del.error`, Cancel (`data-bs-dismiss`) e `.btn-danger` "Delete role" con spinner; `deleteRole(role)` imposta `del = { role, error: null, loading: false }` e fa `bootstrap.Modal.getOrCreateInstance(...).show()` dopo `$nextTick`; `confirmDelete` chiama `Api.roles.delete`, al successo rimuove il ruolo e fa `hide()`, al 400 `del.error = e.message || 'Delete failed.'`. Classe `.mdr-sheet` sul `.modal-dialog` per il phone (stile nel Task 5).
- [ ] **Step 4: Esegui** `npx vitest run js/lib/master-roles-page-guard.test.js js/lib/master-data-guard.test.js js/lib/master-roles-rate-input-guard.test.js` — atteso PASS.
- [ ] **Step 5: Commit** — `git add master-roles.html js/lib/master-roles-page-guard.test.js && git commit -m "feat(master-roles): delete confirmation dialog with the server error inside"`

### Task 5: Responsive — tablet e smartphone (10.7e)

Boards: `docs/superpowers/design/MD-Roles-Rates/10.7e-tablet-smartphone.jpg`, `MDRolesResponsive.dc.html`. Prima di chiudere confronta testata, tabella e chevron del tablet; ricerca + "+ Add", segmented, intestazioni team e card del phone. Il chip "Missing rates" del phone non è sulla tavola (spec §8).

**Files:**
- Modify: `master-roles.html`
- Modify: `js/lib/master-roles-page-guard.test.js`

**Interfaces:**
- Consumes: Task 2 `columns`, `visibleGroups`, `rateCell`; Task 3 `openRoleForm`.
- Produces: data `phoneCurrency: 'EUR'`; method `phoneValue(r) => { text, missing, approx }`.

- [ ] **Step 1: Aggiungi al guard**: `@media (max-width: 1023.98px)` e `@media (max-width: 767.98px)` presenti; `class="md-seg"` con `v-for` su `columns`; un toggle con `:aria-pressed="missingOnly"`.
- [ ] **Step 2: Esegui** `npx vitest run js/lib/master-roles-page-guard.test.js` — atteso FAIL sui nuovi casi.
- [ ] **Step 3: Implementa** spec §8: tablet — toggle button 40px "Missing rates · N" (`aria-pressed`) al posto dello switch, ricerca in seconda riga, colonne valuta 80px, colonna chevron 36px (`ph-icon chevron-right`), azioni nascoste, `@click` sulla riga → `openRoleForm(r)`, controlli 40px, pannello `width: min(480px, 100%)`; phone — tabella nascosta, ricerca 44px + "+ Add" 44px, `.md-seg` per `columns`, chip "Missing rates · N", heading team uppercase, card ≥ 44px con `phoneValue` (importo; "No rate" ambra e card `--color-warning-bg`; "≈ …" in `--text-muted`), pannello `100vw` con footer sticky 46px, `.mdr-sheet` del modal come bottom sheet (`margin: auto 0 0`, `max-width: 100%`).
- [ ] **Step 4: Esegui** `npx vitest run js/lib/master-roles-page-guard.test.js js/lib/master-data-guard.test.js js/lib/master-roles-rate-input-guard.test.js` — atteso PASS.
- [ ] **Step 5: Commit** — `git add master-roles.html js/lib/master-roles-page-guard.test.js && git commit -m "feat(master-roles): tablet and smartphone layouts"`

### Task 6: Verifica visiva, documentazione, caso manuale

Boards: tutte le tavole di `docs/superpowers/design/MD-Roles-Rates/` (mappa nella spec §3).

**Files:**
- Modify: `docs/pages/config.md` (nuova sezione "Roles & rates (2026-11-04, Master Data phase 2)": lista, pannello, dialogo, Team + Role code sopra `code`, elementi delle tavole non riprodotti e deviazioni accettate con il motivo; aggiorna i "Known leftovers" che citano il `confirm()` di `deleteRole` e il watcher di `globalError`)
- Modify: `TEST_CASES.md` (caso `MD-16`: gruppi e ricerca, Missing rates, tooltip "—", create con team nuovo, edit con override inattivo preservato, codice senza " - ", delete bloccato dal server con errore nel dialogo, tablet e phone)
- Modify: `master-roles.html` solo per i fix-ora decisi

- [ ] **Step 1: Stack del branch** — `scripts/test-branch.sh up` (worktree con `.env` copiato), poi `scripts/test-branch.sh status` → `up`.
- [ ] **Step 2: Shoot** (spec §11) con `--base http://localhost:8081 --settle 3000`, credenziali `SHOOT_EMAIL`/`SHOOT_PASSWORD`: a 1400 lista (`--full`), pannello nuovo, pannello edit di un ruolo con un override mancante, dialogo di delete; a 1024 lista; a 390 lista e pannello. Gli stati interattivi con `--eval`.
- [ ] **Step 3: Rileggi ogni PNG con `Read`** e confrontalo con la sua tavola; presenta all'utente gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra e **aspetta la decisione**.
- [ ] **Step 4: Applica** i fix-ora, scrivi gli "accetta" con il motivo in `docs/pages/config.md`, aggiungi `MD-16` a `TEST_CASES.md`.
- [ ] **Step 5: Verifica** — `npx vitest run js/lib/test-cases-parse.test.js scripts/doc-paths-guard.test.js scripts/claude-md-guard.test.js js/lib/master-data-guard.test.js js/lib/master-roles-page-guard.test.js js/lib/master-roles-rate-input-guard.test.js`. Atteso: PASS.
- [ ] **Step 6: Commit** — `git add docs/pages/config.md TEST_CASES.md master-roles.html && git commit -m "docs(master-roles): Roles & rates notes, accepted deviations and manual test case"`. Lo stack del branch resta su per il Gate 2.

---

## Decisioni aperte

1. **Esecuzione nativa, non subagent-driven.** Alternativa scartata: subagent-driven. Perché: §6.1 richiede task indipendenti, e i Task 2–5 riscrivono lo stesso `master-roles.html` uno sopra l'altro.
2. **`groupedRoles` resta come alias di `visibleGroups`.** Alternativa scartata: rinominare e aggiornare il `must` di `master-data-guard.test.js`. Perché: il guard esistente resta invariato e il nome descrive ancora il dato.
3. **Il controllo duplicati resta client-side sul codice composto, prima dell'uppercase del server.** Alternativa scartata: comporre già in maiuscolo prima di salvare. Perché: il confronto è case-insensitive e il payload resta quello di oggi (il server fa l'uppercase).
4. **Il guard sulla pagina è statico (stringhe nel sorgente), non un mount Vue in jsdom.** Alternativa scartata: montare l'app con le API mockate. Perché: è lo stile dei guard delle pagine sorelle e la logica testabile sta nel modulo del Task 1.
