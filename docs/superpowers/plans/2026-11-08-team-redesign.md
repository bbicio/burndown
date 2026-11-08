# Team redesign — `team.html` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-08-team-redesign-design.md`
**Branch:** `team-redesign`
**Risk class:** high-risk — file condivisi caricati da più pagine: classi nuove in `css/style.css` (tutte le pagine) e token in `css/admin-crud.css` (cinque pagine)

**Goal:** `team.html` diventa la pagina delle tavole 13*: lista senza tab con callout Unmatched, toolbar a filtri, menu ⋯, modal Delete, drawer New/Edit, drawer Unmatched names con coda e alias, pannello risorsa con profilo ridisegnato, tablet e fallback phone; API invariate.

**Architecture:** La logica pura nuova va in `js/lib/team-ui.js` (ES module + bridge `window.*`), testata con vitest. I componenti riusabili (drawer, menu di riga, banner, confirm, pill di stato, stati) diventano classi `pd-` in `css/style.css`; ciò che esiste solo su Team va nel nuovo `css/team.css`. `team.html` resta Vue 3 da CDN: drawer = Bootstrap offcanvas, Delete = modal Bootstrap, `combo-select` resta il componente locale.

**Tech Stack:** HTML statico + Vue 3 da CDN, Bootstrap 5.3, vitest + jsdom, `scripts/shoot.mjs`.

**Tasks independent?** No: i Task 3–8 modificano `team.html` e `css/team.css` uno sopra l'altro e consumano i Task 1–2.

## Global Constraints

- Copy in inglese, testi esatti della spec §5–§9; carattere `…` (mai `...`). Nessun testo cita un numero di minuti; nessun link o bottone Undo.
- Nessun hex in `team.html`, `css/team.css` e nelle classi `pd-` nuove di `css/style.css`; nessun attributo `style` con colori. Token nuovi solo se nessuno esistente va bene, con `js/lib/tokens.test.js` verde (≥ 4.5:1).
- Nessuna emoji, nessun `confirm(`/`alert(`/`showConfirm(` in `team.html`.
- Icone: `<ph-icon>` / `ICON_PATHS` di `js/lib/icons.js` dove esistono (`team, search, more, plus, pencil, trash, close, check, warning, info, refresh, chevron-right, chevron-down, arrow-right, lock, filter, user`); le mancanti (`link`, `unlink`, `power`) come SVG inline 16×16, `stroke="currentColor"`, `stroke-width="1.4"`. `js/lib/icons.js` non si modifica.
- Versioni: `css/style.css` `?v=35` → `?v=36` su **tutte** le pagine che lo caricano; `css/admin-crud.css` `?v=4` → `?v=5` sulle sue cinque pagine; `js/lib/team-ui.js` `?v=6` → `?v=7`; `css/team.css` nuovo con `?v=1`.
- API invariate: stessi URL, metodi e body di oggi (`fetch` diretto della pagina); nessuna route toccata.
- Breakpoint: completo ≥ 1280px, tablet 768–1279.98px, fallback < 768px; target ≥ 40px sotto 1280px, ≥ 44px sotto 768px.
- Layer: pagina < pannello risorsa < drawer (offcanvas) e modal. Esc chiude solo il layer più alto.
- `#app-shell`/`#app-main` senza `overflow`/`transform`/`filter`/`contain`/`will-change`/`position`; `v-cloak` sul root.
- Durante i task solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack: verifiche contro `scripts/test-branch.sh`.
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM). Codice con `\` scritto con Edit/Write, non via `node -e`.

## Review Focus

1. **Risorsa senza alias, o alias non caricati** (errore di `GET /aliases`) — menu `Removes the resource and 0 aliases.`, modal con `No aliases` nel box di destra, nessun errore Vue; test `deleteSummary` nel Task 1.
2. **Assign/Ignore che svuota la pagina corrente o l'intera coda** — `paginate` riporta la pagina nel range; con coda vuota il callout sparisce ma il drawer resta aperto sull'empty state verde; il contatore resta `r of r`; guard nel Task 6.
3. **Layer impilati ed Esc** — pannello + Edit, pannello + Unmatched, pannello + modal Delete: Esc chiude solo il layer in cima; il listener Esc capture-phase del pannello ignora `.offcanvas.show` e `.modal.show`; guard nel Task 5.
4. **`candidate_resource_ids` con un id non più presente in `resources`** (risorsa cancellata prima del rescan) — il chip si salta, nessun `undefined undefined`; test in Task 1.
5. **Deactivate con filtro Active e pannello aperto sulla stessa risorsa** — la riga esce dalla tabella, il pannello resta aperto con pill `inactive` e card Management su Activate, contatori aggiornati; guard nel Task 4.

---

### Setup (prima del Task 1)

Dal checkout principale, su `main`, con Spec e Piano committati (PROCESS.md §6.1b):

```bash
git worktree add .claude/worktrees/team-redesign -b team-redesign
git -C .claude/worktrees/team-redesign branch --show-current   # deve stampare team-redesign
cp .env .claude/worktrees/team-redesign/.env
cd .claude/worktrees/team-redesign && npm ci --no-audit --no-fund
```

Se uno dei primi due comandi fallisce o stampa altro, ci si ferma.

---

### Task 1: Logica pura — `js/lib/team-ui.js`

**Boards:** `13ab-team-callout.png`, `13g-delete-confirm.png`, `13i-unmatched-assign.png`, `13k-unmatched-assigned.png`, `13m-existing-aliases.png`, `13o-experience-profile.png` (tutte in `docs/superpowers/design/team/redesign/`)

**Files:**
- Modify: `js/lib/team-ui.js` (funzioni nuove + bridge `window.*`; import `formatMonthText` da `./dates.js?v=4`)
- Test: `js/lib/team-ui.test.js`

**Interfaces:**
- Produces (tutte esportate e bridgiate su `window` con lo stesso nome):
  - `resourceCounts(resources) → { total, active, inactive }`
  - `filterResources(resources, { status = 'active', roleId = '', linked = 'any', text = '' }) → resources[]` — `status` `'active'|'inactive'|'all'`; `linked` `'any'|'linked'|'unlinked'` su `user_id`; `text`: trim + lowercase + `includes` su `` `${first_name} ${last_name} ${email} ${role_label} ${role_code}` `` (identico al `filteredResources` attuale, `team.html:459`).
  - `sessionProgress(resolved, queueLength) → { resolved, total, pct }` — `total = resolved + queueLength`, `pct` intero 0–100 (0 se `total` è 0).
  - `hoursBarPct(hours, maxHours) → number` — 0–100, arrotondato, 0 se `maxHours <= 0`.
  - `isRecentMonth(ym, today = new Date(), months = 3) → boolean` — `ym` `'YYYY-MM'`; vero se cade nel mese corrente di `today` o nei `months - 1` precedenti; falso per `null`/formato errato/mese futuro.
  - `profileMonthText(ym) → string` — `'2025-12'` → `'Dec 2025'`; `'—'` se assente o non valido.
  - `aliasRows(aliases, resources, { text = '', resolves = 'any' }) → [{ ...alias, resource: { id, name, role_code, status } | null }]` — `resolves` `'any'|'resource'|'ignored'` (ignored = `resource_id` null); `text` con `fold` su `display_name` e nome risorsa.
  - `candidateChips(unmatchedRow, resources) → [{ id, name, role_code }]` — nell'ordine di `candidate_resource_ids`, id assenti da `resources` saltati.
  - `topTopicIds(directTopics, n = 2) → id[]` — per `hours` discendenti, a parità per nome.
  - `deleteSummary(resource, aliases) → { count, names }` — alias con `resource_id === resource.id`, `names` = i `display_name` ordinati.
- Consumes: `fold` (già nel modulo), `formatMonthText` di `js/lib/dates.js`.

- [ ] **Step 1: Scrivere i test che falliscono** in `js/lib/team-ui.test.js`, un `describe` per funzione. Asserzioni minime:
  - `resourceCounts([{status:'active'},{status:'inactive'},{status:'active'}])` → `{ total: 3, active: 2, inactive: 1 }`.
  - `filterResources`: default `status:'active'` esclude gli inattivi; `'all'` li tiene; `roleId:'r2'` tiene solo `role_id === 'r2'`; `linked:'linked'` solo `user_id` non null, `'unlinked'` solo null; `text:'  ANNA '` trova `Anna Bianchi`; `text:'pm'` trova per `role_code`; characterization: `text:'esposito'` **non** trova `Espòsito` (nessun folding, come oggi).
  - `sessionProgress(3, 14)` → `{ resolved: 3, total: 17, pct: 18 }`; `sessionProgress(0, 0)` → `{ resolved: 0, total: 0, pct: 0 }`.
  - `hoursBarPct(64, 193)` → `33`; `hoursBarPct(5, 0)` → `0`.
  - `isRecentMonth('2026-11', new Date('2026-11-08'))`, `'2026-09'` → true; `'2026-08'` → false; `'2026-12'` → false; `null`, `'2026-13'` → false.
  - `profileMonthText('2025-12')` → `'Dec 2025'`; `profileMonthText(null)` → `'—'`.
  - `aliasRows`: alias con `resource_id` di una risorsa inattiva → `resource.status === 'inactive'` e `role_code` valorizzato; `resolves:'ignored'` tiene solo `resource_id` null; `text:'amato'` trova per nome risorsa anche se l'alias è `A. Rossi`.
  - `candidateChips({candidate_resource_ids:['x','gone','y']}, [x, y])` → due chip in ordine `x, y` (Review Focus 4).
  - `topTopicIds([{id:1,name:'B',hours:12},{id:2,name:'A',hours:92},{id:3,name:'C',hours:45}])` → `[2, 3]`.
  - `deleteSummary(r, [])` → `{ count: 0, names: [] }`; con tre alias di `r` e uno di un'altra risorsa → `count: 3` e nomi ordinati (Review Focus 1).
- [ ] **Step 2: Lanciare e vederli fallire** — `npx vitest run js/lib/team-ui.test.js` → FAIL (export mancanti).
- [ ] **Step 3: Implementare le funzioni** in `js/lib/team-ui.js` con le firme sopra; `import { formatMonthText } from './dates.js?v=4';` in testa; `profileMonthText` passa `ym.replace('-', '')`. Bridge `window.<nome> = <nome>` per ciascuna, come le esistenti.
- [ ] **Step 4: Lanciare e vederli passare** — `npx vitest run js/lib/team-ui.test.js` → PASS (anche i test esistenti).
- [ ] **Step 5: Commit** — `git add js/lib/team-ui.js js/lib/team-ui.test.js && git commit -m "feat(team): pure helpers for the redesign"`

---

### Task 2: Classi condivise `pd-`, token di `admin-crud.css`, guard della pagina

**Boards:** `13c-row-menu.png`, `13g-delete-confirm.png`, `13af-new-resource-drawer.png`, `13k-unmatched-assigned.png`, `13ab-team-callout.png`

**Files:**
- Modify: `css/style.css` (blocco nuovo in fondo, commentato `/* ── Shared components (pd-) ── */`)
- Modify: `css/admin-crud.css` (hex → token)
- Modify: ogni `*.html` con `css/style.css?v=35` (→ 36) e con `css/admin-crud.css?v=4` (→ 5)
- Create: `css/team.css` (vuoto salvo un commento d'intestazione; caricato da `team.html` con `?v=1` dopo `admin-crud.css`)
- Modify: `team.html` (solo il `<link>` di `team.css` e i `?v=`)
- Create: `js/lib/team-page-guard.test.js`

**Interfaces:**
- Produces le classi (valori presi dalle `ua-` omonime di `admin.html:12-302`, solo token):
  - `.pd-drawer` (+ `-head`, `-eyebrow`, `-title`, `-sub`, `-close`, `-body`, `-foot`, `-hint`), `--bs-offcanvas-width: 480px`; `.pd-drawer--wide` 980px; `@media (max-width: 767.98px)` → `100vw`.
  - `.pd-row-menu-wrap`, `.pd-row-menu-trigger` (32px, 40px sotto 1280, 44px sotto 768), `.pd-row-menu` (`--up`), `.pd-row-menu-item` (titolo + `-hint`), `.pd-row-menu-item--danger`, `.pd-row-menu-divider`; `.pd-tag`, `.pd-tag--navy`, `.pd-tag--danger`.
  - `.pd-banner` (`--success`, `--error`, `-body`, `-close`).
  - `.pd-confirm` (`-head`, `-icon`, `-icon--danger`, `-title`, `-text`, `-boxes`, `-box`, `-box-title`, `-box-title--danger`, `-box-title--ok`, `-note`, `-ack`, `-foot`).
  - `.pd-status-pill` (`--active`, `--inactive`, `--busy`) con `::before` pallino.
  - `.pd-state` (`-icon`, `-title`, `-text`, `--dashed`).
- Produces `js/lib/team-page-guard.test.js` che i task successivi estendono.

- [ ] **Step 1: Scrivere il guard che fallisce** — `js/lib/team-page-guard.test.js` (legge i file con `fs`, come `nav-shell-guard.test.js`):
  - `css/team.css` esiste e `team.html` lo carica con `?v=`.
  - Il blocco `pd-` di `css/style.css` (dal commento d'intestazione alla fine) non contiene `#[0-9a-fA-F]{3,8}\b`.
  - `css/team.css` e `team.html` non contengono `#[0-9a-fA-F]{3,8}\b` fuori da `href="#`/id selector (regex: colore esadecimale preceduto da `:` o spazio e seguito da `;`, `,`, `)` o spazio).
  - `css/admin-crud.css` non contiene hex.
  - `team.html` non contiene `confirm(`, `alert(`, `showConfirm(`, `nav-tabs`, `Undo`, `minutes`.
- [ ] **Step 2: Lanciarlo e vederlo fallire** — `npx vitest run js/lib/team-page-guard.test.js` → FAIL.
- [ ] **Step 3: Aggiungere il blocco `pd-` a `css/style.css`, tokenizzare `css/admin-crud.css`** (header tabella `--surface-subtle` o il token grigio più vicino, bordi `--border-light`, `.form-label` `--text-secondary`, `.empty` `--text-muted`; `badge-st-active` → `--status-completed-bg`/`--color-success-text` o i token success; `badge-st-inactive` → sfondo grigio token + `--text-secondary`, ≥ 4.5:1), creare `css/team.css`, bump di tutti i `?v=`. Il guard sui `?v=` di `foundations-guard` resta verde. I test che falliscono per `team.html` (`confirm(`, `nav-tabs`, `Undo`/`minutes` se presenti) si marcano `it.todo` → li riattiva il Task che li rimuove (`showConfirm` e `nav-tabs`: Task 3 e Task 4).
- [ ] **Step 4: Lanciare i guard** — `npx vitest run js/lib/team-page-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js js/lib/tokens.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(css): shared pd- components; tokenise admin-crud.css"` (con `git add css/team.css js/lib/team-page-guard.test.js`).

---

### Task 3: Lista — testata, callout, toolbar, tabella, banner, stati

**Boards:** `13ab-team-callout.png`

**Files:**
- Modify: `team.html` (template sopra `<!-- RESOURCE DETAIL PANEL -->`, `data`, `computed`, `watch`, `methods`)
- Modify: `css/team.css`
- Test: `js/lib/team-page-guard.test.js`

**Interfaces:**
- Consumes: `resourceCounts`, `filterResources`, `sortResources`, `paginate` (Task 1); `.pd-banner`, `.pd-status-pill`, `.pd-state`, `.md-seg` (Task 2).
- Produces nello stato Vue: `statusFilter` (`'active'`), `roleFilter` (`''`), `linkedFilter` (`'any'`), `banner` (`{ kind, text } | null`) con `setBanner(kind, text)` / `clearBanner()`; computed `counts`, `unmatchedHours`, `unmatchedAmbiguous`; metodo `openUnmatched(view)` (`'queue'|'aliases'`, lo implementa il Task 6 — qui solo la firma che apre l'offcanvas `#unmatchedDrawer`). `pageTab`, `setPageTab` e `showInactive` spariscono.

- [ ] **Step 1: Estendere il guard** — `team.html` non contiene `nav-tabs` né `showInactive`; contiene `ph-sub` con `resources ·`, un `.md-seg` con tre `md-seg-btn`, i `<select>` con `aria-label="Role"` e `aria-label="PDash user"`, header ordinabili con `aria-sort`; riattivare l'`it.todo` di `nav-tabs`.
- [ ] **Step 2: Vederlo fallire** — `npx vitest run js/lib/team-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** secondo spec §5.1–§5.3, §5.6, §9: sottotitolo da `counts` (`Loading…` finché `!ready`); callout solo con `ready && unmatched.length` (ore = somma `hours`, formattate con `fmtHours`; parte ambigui solo se > 0; ambigui = righe con `candidate_resource_ids?.length > 0`, come il badge attuale (`team.html:130`)); `filteredResources` = `window.filterResources(this.resources, {status, roleId, linked, text})`; watcher di reset pagina su `filterText`, `statusFilter`, `roleFilter`, `linkedFilter`, `sortKey`, `sortDir`; righe con `tabindex="0"`, `@keydown.enter`, classe `is-open` sulla selezionata; avatar iniziali; `Loading team…`, empty `No resources match the current filter.` con **Clear filters** (riporta i quattro filtri al default), accesso negato come `admin.html:314-320`. Il banner globale sostituisce `globalError`/alert: errori → `setBanner('error', …)`. Il click sulla riga già aperta non chiude (il `mousedown` esterno ignora la riga selezionata).
- [ ] **Step 4: Guard verde** — `npx vitest run js/lib/team-page-guard.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(team): list header, callout, toolbar, table and states"`

---

### Task 4: Menu ⋯, riga in corso, modal Delete

**Boards:** `13c-row-menu.png`, `13g-delete-confirm.png`

**Files:**
- Modify: `team.html` (colonna azioni, modal `#deleteModal` al posto di `showConfirm` e del vecchio confirm, metodi `toggleStatus`, `askDelete`, `deleteResource`)
- Modify: `css/team.css` (opacità 70% della riga in corso)
- Test: `js/lib/team-page-guard.test.js`

**Interfaces:**
- Consumes: `deleteSummary` (Task 1), `.pd-row-menu*`, `.pd-tag*`, `.pd-confirm*` (Task 2), `setBanner` (Task 3).
- Produces: `menuOpenId`, `openMenu(r, ev)` (decide `--up` misurando `getBoundingClientRect()` contro `window.innerHeight`), `closeMenu(returnFocus)`; `deleteTarget`, `deleteAck`; `askDelete(r)`, `confirmDelete()`, `deactivateInstead()`; `toggleStatus(r)` (usato anche dalla card Management del Task 7).

- [ ] **Step 1: Estendere il guard** — `team.html` contiene `aria-haspopup="menu"`, `role="menu"`, `LEFT THE COMPANY`, `IRREVERSIBLE`, `I understand this can't be undone.`, `Updating…`; non contiene `showConfirm(`; riattivare il suo `it.todo`.
- [ ] **Step 2: Vederlo fallire.**
- [ ] **Step 3: Implementare** spec §5.4–§5.5: menu chiuso da Esc (focus al trigger) e `mousedown` esterno; Deactivate/Activate senza conferma, riga `_loading` → pill `--busy` + `Updating…` (`aria-live="polite"`), banner `{name} was deactivated. Their hours and aliases stay attributed. Find them under Inactive.` / `{name} was activated.`; il menu si chiude **prima** della richiesta. Delete: modal con `deleteSummary`, box Deactivate solo su attivi (`deactivateInstead()` chiude il modal ed esegue `toggleStatus`), bottone spento finché `!deleteAck`, banner `{name} was deleted.` Review Focus 5: con filtro Active il Deactivate fa uscire la riga ma il pannello resta (`selectedResource` legge `resources`, non la lista filtrata — invariato).
- [ ] **Step 4: Guard verde.**
- [ ] **Step 5: Commit** — `git commit -am "feat(team): row menu, busy row and delete confirmation"`

---

### Task 5: Drawer New / Edit resource

**Boards:** `13af-new-resource-drawer.png`, `13ag-new-resource-error.png`, `13ah-new-resource-created.png`, `13f-edit-resource.png`

**Files:**
- Modify: `team.html` (sostituisce `#resourceModal` con l'offcanvas `#resourceDrawer`; `mounted`, `openCreate`, `openEdit`, `submitForm`; listener Esc del pannello)
- Modify: `css/team.css` (griglia nome/cognome, riquadro created)
- Test: `js/lib/team-page-guard.test.js`

**Interfaces:**
- Consumes: `.pd-drawer*` (Task 2), `setBanner` (Task 3).
- Produces: `form` con `errors: { firstName, lastName, email, roleId }`, `created` (`{ id, name, roleText } | null`); `openCreate()`, `openEdit(r)`, `submitForm()`, `createAnother()`, `openCreated()`; `_resourceDrawer` (`bootstrap.Offcanvas`).

- [ ] **Step 1: Estendere il guard** — `team.html` non contiene `id="resourceModal"`; contiene `id="resourceDrawer"` con classe `pd-drawer`, `Create another`, `Open resource`, `Missing a role? Add it first in`, `master-roles.html`; il listener Esc del pannello controlla `.offcanvas.show` (Review Focus 3).
- [ ] **Step 2: Vederlo fallire.**
- [ ] **Step 3: Implementare** spec §7: validazione client dei quattro obbligatori (`First name is required.`, `Last name is required.`, `Email is required.`, `Role is required.`) + riquadro rosso con il primo messaggio o quello del server; focus sul primo campo su `shown.bs.offcanvas`; Create → stato created (footer `Create another`, che svuota il form tenendo `roleId`, e **Close**); `Open resource` chiude il drawer e chiama `openDetail`; Edit salvato → `hide()` + `setBanner('success', 'Changes saved.')`. Esc del pannello: esce se esiste `.modal.show` **o** `.offcanvas.show` (capture phase, invariata). Edit aperto dal pannello sopra il pannello: z-index del pannello (1045) < offcanvas di Bootstrap; se Bootstrap mette l'offcanvas a 1045 anche lui, il pannello scende a 1040.
- [ ] **Step 4: Guard verde.**
- [ ] **Step 5: Commit** — `git commit -am "feat(team): new/edit resource drawer"`

---

### Task 6: Drawer Unmatched names — coda ed Existing aliases

**Boards:** `13i-unmatched-assign.png`, `13k-unmatched-assigned.png`, `13m-existing-aliases.png`

**Files:**
- Modify: `team.html` (offcanvas `#unmatchedDrawer` al posto del blocco `<!-- UNMATCHED NAMES -->`; `combo-select` a gruppi; metodi `assign`, `ignore`, `removeAlias`, `rescan`)
- Modify: `css/team.css` (riepilogo, barra ore, sotto-riga progetti, chip candidati, gruppi del combo)
- Test: `js/lib/team-page-guard.test.js`

**Interfaces:**
- Consumes: `sessionProgress`, `hoursBarPct`, `candidateChips`, `aliasRows`, `sortUnmatched`, `paginate`, `fold` (Task 1); `.pd-drawer--wide`, `.pd-banner`, `.pd-state` (Task 2); `openUnmatched(view)` (firma del Task 3).
- Produces: `unmatchedView` (`'queue'|'aliases'`), `resolvedThisSession` (numero, mai azzerato se non al reload), `unmatchedBanner` (`{ kind, text } | null`, sostituisce `unmatchedError`), `expandedProjects` (Set di `name_normalized`), `aliasFilterText`, `aliasResolves`; `combo-select` accetta in `options` voci `{ id, label, hint }` e `{ group: 'Same name · candidates' }` come header non selezionabili.

- [ ] **Step 1: Estendere il guard** — `team.html` contiene `id="unmatchedDrawer"` con `pd-drawer--wide`, `resolved this session`, `Same name · candidates`, `Active resources`, `AMBIGUOUS`, `Resolves to`, `Removing an alias sends the name back to the queue`; non contiene `<details`.
- [ ] **Step 2: Vederlo fallire.**
- [ ] **Step 3: Implementare** spec §6: segmented Queue/Existing aliases; ricerca per vista; Rescan con `Rescanning…`; riepilogo con `sessionProgress(resolvedThisSession, unmatched.length)`; nomi ≥ 40 h in grassetto, barra `hoursBarPct(u.hours, maxHours)`; badge e riga ambigui; chip candidati che impostano la scelta; `{n} projects ▾` apre una `<tr>` a tutta larghezza (`Project name (CODE)`, ordinati per nome); Assign navy disabilitato senza scelta, Ignore con `title`; in corso `Assigning…`/`Ignoring…`; dopo il successo `resolvedThisSession++`, `loadUnmatched()`, banner di sezione con i testi esatti di spec §6.3. Vista alias con `aliasRows`, chip `inactive`/`ignored`, Remove, nota in fondo. Il keyboard handling del `combo-select` salta gli header di gruppo. Review Focus 2: con coda vuota il drawer resta aperto e mostra `No unmatched names.` con il check; il callout (Task 3) sparisce da sé.
- [ ] **Step 4: Guard verde.**
- [ ] **Step 5: Commit** — `git commit -am "feat(team): unmatched names drawer with queue and aliases"`

---

### Task 7: Pannello risorsa — Details, Management, Experience profile

**Boards:** `13n-panel-details.png`, `13o-experience-profile.png`

**Files:**
- Modify: `team.html` (`#resourceDetailPanel`: header, tab, Details, profilo; `loadProfile` con retry)
- Modify: `css/team.css` (pannello 860px — via gli stili inline con hex — tab, dl, card Management, totali, chip dei topic, card dimensioni, righe progetto/task)
- Test: `js/lib/team-page-guard.test.js`

**Interfaces:**
- Consumes: `profileMonthText`, `isRecentMonth`, `topTopicIds`, `buildProfileTree` (Task 1); `toggleStatus`, `askDelete` (Task 4); `openEdit` (Task 5); `openUnmatched` (Task 6); `.pd-status-pill`, `.pd-state--dashed`, `.pd-banner--error` (Task 2).
- Produces: `aliasesOpen` (boolean, `false` all'apertura), `expanded` (Set di chiavi `dim:value`, `dim:value:code`, `role:code`).

- [ ] **Step 1: Estendere il guard** — `team.html` contiene `Profile processing`, `profile-jobs.html`, `Direct experience`, `Project context`, `Try again`, `Open Unmatched names`, `aria-expanded`; `#resourceDetailPanel` non ha attributi `style` con colori.
- [ ] **Step 2: Vederlo fallire.**
- [ ] **Step 3: Implementare** spec §8: header navy, tab con sottolineatura magenta, Edit sulla riga dei tab; Details come dl + Aliases comprimibile senza ore + Management; profilo con totali (`profileMonthText`), riga Last calculated (`fmtWhen`) + link, topic (chip pieni con `· {h} h`, i due di `topTopicIds` in navy chiaro, `title` con i progetti; chip tratteggiati per context e legacy), card per dimensione e Roles con barra di quota, %, progetti, ultimo mese (`profileMonthText`, classe verde se `isRecentMonth`), espansione valore → progetto → task con bottoni `aria-expanded`; i quattro stati in `.pd-state--dashed` (testi di spec §8.2), Try again = `loadProfile()`, Open Unmatched names = `openUnmatched('queue')`. Focus sul titolo all'apertura.
- [ ] **Step 4: Guard verde** e `npx vitest run js/lib/team-ui.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(team): resource panel details and experience profile"`

---

### Task 8: Responsive — tablet e fallback phone

**Boards:** `13aa-1-tablet.png`, `13aa-2-smartphone.png` (solo per le card della lista; il resto è il ciclo H)

**Files:**
- Modify: `css/team.css` (media query `max-width: 1279.98px` e `max-width: 767.98px`)
- Modify: `team.html` (bottone **Filters** con dropdown Bootstrap per Role e PDash user, visibile sotto 1280; terza riga `Linked to a PDash user`; card della lista sotto 768)

**Interfaces:**
- Consumes: tutto quanto sopra; nessuna interfaccia nuova.

- [ ] **Step 1: Implementare** spec §10: tablet — colonna Linked nascosta e riga sotto l'email, Role/PDash user nel dropdown Filters, controlli 40px, pannello 720px, drawer Unmatched largo quanto l'area contenuto (`calc(100vw - var(--sidebar-w))`), Projects sotto il nome, Ignore icona con `title`; phone — card per risorsa, drawer e pannello `100vw`, modal con inset 16px, target ≥ 44px.
- [ ] **Step 2: Guard e test** — `npx vitest run js/lib/team-page-guard.test.js js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js` → PASS.
- [ ] **Step 3: Commit** — `git commit -am "feat(team): tablet layout and phone fallback"`

---

### Task 9: Verifica visiva e documentazione

**Boards:** tutte le 14 di `docs/superpowers/design/team/redesign/`

**Files:**
- Modify: `docs/pages/team.md`, `docs/js/lib.md`, `docs/css/stylesheets.md`, `CLAUDE.md` (riga di `team.html`: stylesheet `css/team.css`; riga di `profile-jobs.html`: raggiunta anche dal link del profilo), `docs/pages/profile-jobs.md`, `docs/BACKLOG.md`
- Test: `scripts/claude-md-guard.test.js`, `scripts/doc-paths-guard.test.js`

- [ ] **Step 1: Stack del branch** — `scripts/test-branch.sh up`; poi `scripts/test-branch.sh status` → `up`.
- [ ] **Step 2: Scatti** con `node scripts/shoot.mjs --base http://localhost:8081 --url /team.html --settle 3000` (credenziali da `.env`, `docs/scripts/shoot.md`), via `--eval` per gli stati: lista (1400, `--full`), menu ⋯ aperto su una riga in basso, modal Delete, drawer New vuoto / con errore Role / creato, Edit sopra il pannello, drawer Unmatched coda con combo aperto, dopo un Assign, vista alias, pannello Details con Aliases aperti, Experience profile; lista e profilo a 1024 e 390. Leggere **ogni** PNG con `Read` accanto alla sua tavola.
- [ ] **Step 3: Scostamenti** — elenco tavola per tavola, ciascuno con proposta fix-ora / accetta-e-registra; **ci si ferma per la decisione dell'utente** (PROCESS §6.6.5). Misurare la soglia 1280 (decisione 15 della spec) e riportare il numero.
- [ ] **Step 4: Documentazione** — `docs/pages/team.md` sezione "Redesign (2026-11-08)": struttura nuova, minori chiusi (tab, conteggio doppio, header con inattivi, focus tastiera, flicker, hex inline), esclusi (Undo, ore alias/progetto, smartphone H), scostamenti accettati con motivo; `docs/js/lib.md` funzioni nuove di `team-ui.js`; `docs/css/stylesheets.md` classi `pd-` e `css/team.css`; `docs/BACKLOG.md` quattro voci (convergenza `pd-` su admin/Master Data/Timesheets/Pipeline; Undo; ore per alias e per progetto via API; ciclo smartphone H).
- [ ] **Step 5: Guard doc** — `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js` → PASS.
- [ ] **Step 6: Commit** — `git commit -am "docs(team): redesign narrative, shared pd- classes, backlog"`

Lo stack del branch resta su per il Gate 2 di `/finish-cycle`.

## Criteri di accettazione

Quelli della Spec, §"Criteri di accettazione" (1–16).

## Decisioni aperte

1. **Esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: i Task 3–8 modificano `team.html` uno sopra l'altro, quindi non sono indipendenti (PROCESS §6.1).
2. **Un guard di pagina (`js/lib/team-page-guard.test.js`) al posto di test DOM del template.** Alternativa scartata: montare `team.html` in jsdom. Perché: nessuna pagina del repo è testata così; la logica sta in `team-ui.js`, il resto lo coprono guard testuali e gli scatti del Task 9.
3. **Ambiguo = `candidate_resource_ids.length > 0`.** Alternativa scartata: un flag dall'API. Perché: è il criterio con cui la pagina mostra già il badge oggi.
