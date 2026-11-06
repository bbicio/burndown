# User Admin redesign — `admin.html` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-06-user-admin-redesign-design.md`
**Branch:** `user-admin-redesign`
**Risk class:** high-risk — autenticazione o permessi: il Piano codifica in `js/lib/user-admin-rules.js` quali azioni di ruolo e accesso la pagina offre a ciascun viewer

**Goal:** `admin.html` diventa la pagina delle tavole 12a–12r: toolbar con contatori, ricerca e ordinamento, un solo bottone per riga più menu ⋯ con motivi, spinner per riga, drawer di invito, modal Disable/Anonymize, stati e responsive; API e regole invariate.

**Architecture:** Le regole e le trasformazioni della lista vanno nel modulo puro `js/lib/user-admin-rules.js` (ES module + bridge `window.UserAdminRules`), testato contro un oracolo che trascrive il template attuale. `admin.html` resta una pagina Vue 3 da CDN: menu ⋯ e bottom sheet sono markup Vue locale, il drawer è un Bootstrap offcanvas, le conferme due modal Bootstrap. CSS nella `<style>` della pagina, solo token.

**Tech Stack:** HTML statico + Vue 3 da CDN, Bootstrap 5.3 (CSS + JS), vitest + jsdom, `scripts/shoot.mjs`.

**Tasks independent?** No: i Task 2–5 modificano `admin.html` uno sopra l'altro e consumano il modulo del Task 1.

## Global Constraints

- Copy in inglese, testi esatti della spec §3; carattere `…` (mai `...`).
- Nessun `confirm(`/`alert(` in `admin.html`; nessuna emoji (⬆ ⬇ ✉️ 🗑 🔒 spariscono).
- Nessun hex in `admin.html` (né `<style>` né attributi `style`); nessun token nuovo in `css/tokens.css`.
- Icone: `<ph-icon>` / `ICON_PATHS` di `js/lib/icons.js` per `user, lock, info, more, plus, search, check, close, trash, warning`; le icone mancanti (`shield`, `power`, `mail`, `user-plus`, `user-minus`) come SVG inline nella pagina, 16×16, `stroke="currentColor"`, `stroke-width="1.4"`. `js/lib/icons.js` **non** si modifica.
- `js/lib/user-admin-rules.js` si carica con `?v=1`; nessun altro file versionato cambia. Se un task si trova costretto a toccare `css/style.css`, `js/core.js` o `js/lib/icons.js`, si ferma e lo segnala.
- Le chiamate API restano quelle di oggi (`fetch` diretto, stessi URL, metodi, body); nessuna route toccata.
- Breakpoint: tabella completa ≥ 1280px, colonne compatte 768–1279.98px, card < 768px; controlli 40px sotto i 1280px, ≥ 44px sotto i 768px.
- `#app-shell`/`#app-main` senza `overflow`/`transform`/`filter`/`contain`/`will-change`/`position`; `v-cloak` sul root.
- Durante i task solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack: verifiche contro `scripts/test-branch.sh`.
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM).

## Review Focus

1. **Nome o cognome vuoti / `null`** (utenti vecchi, anonimizzati `[Deleted] User`) — iniziali `?` mai `undefined`, ricerca e ordinamento per nome non esplodono; test nel Task 1.
2. **Ricerca con spazi e maiuscole** (`"  MARCO "`) — trim + case-insensitive, stringa vuota = nessun filtro; test nel Task 1.
3. **Azione che fa uscire la riga dal filtro corrente** (Disable con filtro Active) — il menu si chiude prima della richiesta, la riga sparisce dopo il successo, contatori aggiornati, nessun errore Vue; guard nel Task 3.
4. **Due azioni contemporanee su righe diverse** — ogni riga ha il suo `_loading`; l'altra riga resta cliccabile; il banner è quello dell'ultima risposta; guard nel Task 3.
5. **Menu ⋯ sulle ultime righe** — si apre verso l'alto quando sotto non c'è spazio (misura del viewport all'apertura), mai tagliato dalla card; verificato nello scatto 12f/12g del Task 6.

---

### Setup (prima del Task 1)

Dal checkout principale, su `main`, con Spec e Piano committati (PROCESS.md §6.1b):

```bash
git worktree add .claude/worktrees/user-admin-redesign -b user-admin-redesign
git -C .claude/worktrees/user-admin-redesign branch --show-current   # deve stampare user-admin-redesign
cp .env .claude/worktrees/user-admin-redesign/.env
cd .claude/worktrees/user-admin-redesign && npm ci --no-audit --no-fund
```

Se uno dei primi due comandi fallisce o stampa altro, ci si ferma.

---

### Task 1: Modulo delle regole — `js/lib/user-admin-rules.js`

**Boards:** `docs/superpowers/design/admin/redesign/12d-menu-pending-sysadmin.png`, `12e-menu-pending-admin.png`, `12f-menu-disabled.png`, `12g-menu-sysadmin.png`, `12p-empty.png`

**Files:**
- Create: `js/lib/user-admin-rules.js`
- Test: `js/lib/user-admin-rules.test.js`
- Modify: `docs/js/lib.md` (voce del modulo)

**Interfaces:**
- Produces (export nominati, più `window.UserAdminRules = { …tutti }`):
  - `isAnonymized(user) → boolean` — `String(user.email || '').startsWith('anon_')`
  - `displayName(user) → string` — `'Anonymized user'` se anonimizzato, altrimenti `first_name + ' ' + last_name` trim, `'—'` se vuoto
  - `initials(user) → string` — prime lettere di nome e cognome maiuscole, `'?'` se nessuna; `'—'` se anonimizzato
  - `rowKind(user, me) → 'self'|'anonymized'|'locked'|'normal'` — precedenza self, anonymized, locked (`user.role === 'sysadmin' && me.role !== 'sysadmin'`), normal
  - `primaryAction(user, me) → 'resend'|'enable'|null` — solo `normal`: `pending` → `resend`, `disabled` → `enable`
  - `menuGroups(user, me) → Array<{ group: 'role'|'access'|'data', label: 'Role'|'Access'|'Data', items: Item[] }>` — `[]` se non `normal`. `Item = { id, label, desc, enabled: boolean, reason: string|null, tag: 'SENSITIVE'|'IRREVERSIBLE'|null, danger: boolean, icon }`, `id` ∈ `make-admin, make-user, grant-sysadmin, revoke-sysadmin, resend, disable, enable, anonymize`; `desc` sempre valorizzata (il template mostra `reason` al posto di `desc` quando `!enabled`)
  - `statusCounts(users, { role, search }) → { all, active, pending, disabled }`
  - `filterUsers(users, { status, role, search }) → user[]` — `status`/`role` `'all'` = nessun filtro
  - `sortUsers(users, { key, dir }) → user[]` — nuovo array, stabile; `dir === null` → ordine di input
  - `nextSort(sort, key) → { key, dir }` — stessa colonna: `asc → desc → null` (con `key: null`); colonna diversa: `asc`
  - `filterSummary({ status, role, search }) → string` — es. `Showing pending users · "marco"`; `Showing all users` senza filtri; ruolo come `admins` / `sysadmins` / `users`

- [ ] **Step 1: Scrivere i test (falliscono)**

Characterization — l'oracolo trascrive alla lettera il template attuale di `admin.html` (righe con `u.id !== me.id`):

```js
// What admin.html offered before this cycle, transcribed from its template.
function currentActions(u, me) {
  const out = new Set();
  const canModify = me.role === 'sysadmin' || u.role !== 'sysadmin';
  if (u.role !== 'sysadmin') out.add(u.role === 'admin' ? 'make-user' : 'make-admin');
  if (me.role === 'sysadmin' && u.role !== 'user') out.add(u.role === 'sysadmin' ? 'revoke-sysadmin' : 'grant-sysadmin');
  if (u.status === 'pending') out.add('resend');
  if (canModify) {
    out.add(u.status !== 'disabled' ? 'disable' : 'enable');
    if (u.status === 'disabled' && !u.email.startsWith('anon_')) out.add('anonymize');
  }
  return out;
}
```

`it('enables exactly the actions the old page offered on normal rows')`: prodotto cartesiano viewer `{admin, sysadmin}` × ruolo `{user, admin, sysadmin}` × stato `{active, pending, disabled}`, email normale, id diverso da `me.id`; per ogni riga con `rowKind === 'normal'` l'insieme degli `id` con `enabled: true` di `menuGroups` è uguale a `currentActions`.

`it('drops the old actions on anonymized and locked rows')`: anonimizzato (`email: 'anon_x@deleted.local'`, `status: 'disabled'`) → `rowKind 'anonymized'`, `menuGroups []`, `primaryAction null` (la pagina vecchia offriva ruolo ed Enable: cambio voluto, spec §3.3); sysadmin visto da admin → `'locked'`, `[]`, `null`; `me.id === u.id` → `'self'`.

Motivi esatti (`reason` delle voci disabilitate):
- `make-user` su sysadmin (viewer sysadmin): `Revoke sysadmin first: roles change one step at a time.`
- `grant-sysadmin` su user, viewer sysadmin: `Make admin first: roles change one step at a time.`
- `grant-sysadmin` su user o admin, viewer admin: `Only a sysadmin can grant this role.`
- `anonymize` su non `disabled`: `Disable the account first.`

Struttura: gruppi sempre in ordine `role, access, data`; `role` contiene `make-admin` (user) o `make-user` (admin, sysadmin) seguito da `grant-sysadmin` (user, admin) o `revoke-sysadmin` (sysadmin), con `tag: 'SENSITIVE'`; `access` contiene `resend` solo su pending, poi `disable` o `enable`; `data` contiene solo `anonymize` con `tag: 'IRREVERSIBLE'`, `danger: true`, unico `danger` del risultato. Descrizioni: i testi di spec §2.

Liste: utenti fissi (9 righe come la tavola 12a) e
- `statusCounts` con `{ role: 'user', search: '' }` conta solo gli user; con `search: '  RICCI '` conta solo Marta Ricci (Review Focus 2);
- `filterUsers` per stato, ruolo, ricerca su nome ed email;
- `sortUsers` `name asc`, `role desc` (sysadmin prima), `status asc` (active < pending < disabled), `joined asc` (per `created_at`), stabilità a parità, `dir null` = input; righe con `first_name: null` non lanciano (Review Focus 1);
- `nextSort({key:null,dir:null},'name')` → `{name, asc}`, poi `{name, desc}`, poi `{key:null, dir:null}`; da `{name, desc}` a `'role'` → `{role, asc}`;
- `initials({first_name:null,last_name:null})` → `'?'`; `displayName` di anonimizzato → `'Anonymized user'`;
- `filterSummary({status:'pending',role:'all',search:'marco'})` → `Showing pending users · "marco"`.

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run js/lib/user-admin-rules.test.js`
Expected: FAIL (modulo inesistente)

- [ ] **Step 3: Implementare il modulo** con le firme dell'Interfaces block; icone delle voci: `make-admin` `user-plus`, `make-user` `user-minus`, `grant-sysadmin`/`revoke-sysadmin` `shield`, `resend` `mail`, `disable`/`enable` `power`, `anonymize` `trash` (nomi, il rendering è del Task 3).

- [ ] **Step 4: Eseguire e verificare che passino**

Run: `npx vitest run js/lib/user-admin-rules.test.js`
Expected: PASS

- [ ] **Step 5: Voce in `docs/js/lib.md`** (scopo, consumer `admin.html`, il test di characterization), poi commit

```bash
git add js/lib/user-admin-rules.js js/lib/user-admin-rules.test.js docs/js/lib.md
git commit -m "feat(admin): user-admin-rules module with characterization tests"
```

---

### Task 2: Pagina desktop — testata, toolbar, tabella, banner, stati

**Boards:** `12a-sysadmin-view.png`, `12b-admin-view.png`, `12m-banner-success.png`, `12n-banner-error.png`, `12o-loading.png`, `12p-empty.png`, `12q-access-denied.png`

**Files:**
- Modify: `admin.html`
- Create: `js/lib/admin-page-guard.test.js`

**Interfaces:**
- Consumes: `window.UserAdminRules` (Task 1), `window.PhIcon` (`app.component('ph-icon', window.PhIcon)`).
- Produces (stato Vue usato dai Task 3–5): `filter: { status, role, search }`, `sort: { key, dir }`, `banner: { kind: 'success'|'error', title, text } | null`, `loading: boolean`, `accessDenied`, computed `visibleUsers`, `counts`; metodi `setBanner(kind, title, text)`, `clearBanner()`, `clearFilters()`, `toggleSort(key)`; i metodi di azione esistenti (`toggleRole`, `toggleSysAdmin`, `setStatus`, `resendInvite`, `anonymizeUser`) restano con lo stesso nome e la stessa richiesta, ma scrivono in `banner` al posto di `globalError`/`globalSuccess`.

- [ ] **Step 1: Guard (fallisce)** — `js/lib/admin-page-guard.test.js` su `admin.html` letto da disco:
  - nessun `confirm(` / `alert(`; nessuna di `⬆ ⬇ ✉️ 🗑 🔒`;
  - nessun hex `#[0-9a-fA-F]{3,8}\b` dentro `<style>…</style>` né in attributi `style="…"`;
  - carica `js/lib/user-admin-rules.js?v=1` come `type="module"` prima dello script Vue;
  - contiene `aria-sort`, `role="alert"`, `role="status"`, `Search name or email…`, `Loading users…`, `Admin access required`, `Clear filters`;
  - nessuna classe `badge-role-` / `badge-st-`.
- [ ] **Step 2:** `npx vitest run js/lib/admin-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** spec §3.1, §3.2, §3.3 (colonne, badge con la tabella di token, righe self/locked/anonymized con `title` + `visually-hidden`, footer con i due testi per viewer), §3.6 (banner e testi; `Couldn't load users.` al caricamento), §3.9. Le celle azioni delle righe `normal` per ora mostrano solo il bottone di `primaryAction` (il menu arriva nel Task 3). Il loading mostra testata e toolbar senza contatori (`loading` true durante `loadUsers`); l'accesso negato non rende `.ph` né toolbar. `fmtDate` invariato. Testi di `.ph-sub`: `{n} users · {p} pending invites`, `1 user`, `Loading…`.
- [ ] **Step 4:** `npx vitest run js/lib/admin-page-guard.test.js js/lib/page-head-guard.test.js js/lib/nav-shell-guard.test.js js/lib/content-surface-guard.test.js` → PASS.
- [ ] **Step 5: Confronto con le tavole** — aprire 12a, 12b, 12m–12q e confrontare il markup scritto (struttura, testi, ordine delle colonne); annotare gli scostamenti nel messaggio di commit.
- [ ] **Step 6: Commit** `feat(admin): toolbar, table, badges, banners and page states`.

---

### Task 3: Menu ⋯, riga in corso, modal Disable e Anonymize

**Boards:** `12c-row-busy.png`, `12d-menu-pending-sysadmin.png`, `12e-menu-pending-admin.png`, `12f-menu-disabled.png`, `12g-menu-sysadmin.png`, `12k-confirm-disable.png`, `12l-confirm-anonymize.png`

**Files:**
- Modify: `admin.html`
- Modify: `js/lib/admin-page-guard.test.js`

**Interfaces:**
- Consumes: `menuGroups`, `primaryAction` (Task 1); `banner`, metodi di azione (Task 2).
- Produces: `menu: { userId, up: boolean } | null`, metodi `openMenu(user, ev)`, `closeMenu(returnFocus)`, `runItem(user, id)`, `askDisable(user)`, `askAnonymize(user)`; refs dei modal `#disableModal`, `#anonymizeModal`; `confirmTarget` (utente del modal aperto), `anonAck` (checkbox).

- [ ] **Step 1: Guard (fallisce)** — aggiungere: `aria-haspopup="menu"`, `role="menu"`, `role="menuitem"`, `aria-disabled`, `id="disableModal"`, `id="anonymizeModal"`, `I understand this can't be undone.`, `Disable user`, `Anonymize user`, `aria-live="polite"`, `Updating…`, `Sending…`; e che `runItem` chiami `closeMenu` prima di qualunque `fetch` (regex sull'ordine nel corpo del metodo — Review Focus 3).
- [ ] **Step 2:** `npx vitest run js/lib/admin-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** spec §3.4, §3.5, §3.8:
  - popover 268px dentro la cella azioni, `position: absolute` rispetto a un wrapper `position: relative` della cella (mai su `#app-shell`/`#app-main`); nessun antenato fino alla card ha `overflow` diverso da `visible` (niente `.table-responsive`), altrimenti il menu viene tagliato; `up` deciso in `openMenu` confrontando `ev.currentTarget.getBoundingClientRect().bottom + 360` con `window.innerHeight` (Review Focus 5); un solo menu aperto; `mousedown` fuori ed Esc chiudono, Esc rende il focus al bottone; frecce su/giù fra i `menuitem` abilitati e non;
  - `runItem`: `make-admin`/`make-user` → `toggleRole`, `grant-sysadmin`/`revoke-sysadmin` → `toggleSysAdmin`, `resend` → `resendInvite`, `enable` → `setStatus(u,'active')`, `disable` → `askDisable`, `anonymize` → `askAnonymize`; voci `!enabled` non fanno nulla;
  - riga in corso: classe con opacità 0.7 quando `u._loading`, cella azioni con spinner + `Updating…` / `Sending…` (resend: un `u._sending` impostato da `resendInvite`); le altre righe invariate (Review Focus 4);
  - modal Bootstrap `#disableModal` e `#anonymizeModal` con i testi esatti di spec §3.8; Anonymize: `anonAck` azzerato a ogni apertura, bottone `disabled` finché `!anonAck`, focus iniziale su Cancel (`shown.bs.modal`); la conferma chiude il modal e chiama `setStatus(u,'disabled')` / `anonymizeUser(u)`. `confirmAnonymize` e il `confirm()` spariscono.
  - errori delle azioni: `setBanner('error', \`Couldn't update ${displayName(u)}.\`, serverMessage)`; catch di rete → testo `The server didn't respond. Check your connection and try again.`; resend riuscito → `setBanner('success', 'Invite resent.', \`A new activation link was sent to ${u.email}. It's valid for 48 hours.\`)`.
- [ ] **Step 4:** `npx vitest run js/lib/admin-page-guard.test.js` → PASS.
- [ ] **Step 5: Confronto con le tavole** 12c–12g, 12k, 12l (gruppi, ordine delle voci, tag, colori del rosso solo su Anonymize, testi dei modal).
- [ ] **Step 6: Commit** `feat(admin): row actions menu, busy rows and in-app confirmations`.

---

### Task 4: Drawer di invito

**Boards:** `12h-invite-drawer-empty.png`, `12i-invite-drawer-error.png`, `12j-invite-drawer-sent.png`

**Files:**
- Modify: `admin.html`
- Modify: `js/lib/admin-page-guard.test.js`

**Interfaces:**
- Consumes: `loadUsers()` (Task 2).
- Produces: `invite: { firstName, lastName, email, role, loading, error, errorField: 'email'|null, sentTo: string|null, sentName: string|null }`, computed `inviteValid`, metodi `openInvite()`, `resetInvite()`, `inviteAnother()`, `submitInvite()` (stessa richiesta di oggi).

- [ ] **Step 1: Guard (fallisce)** — `offcanvas offcanvas-end`, `id="inviteDrawer"`, nessun `id="inviteModal"`, `Works on pipeline, portfolio and planning`, `Also manages users and master data`, `Sysadmin can't be assigned with an invite. Promote an admin once they're active.`, `Invite another`, `valid for 48 hours`.
- [ ] **Step 2:** `npx vitest run js/lib/admin-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** spec §3.7: `--bs-offcanvas-width: 480px`; radio card come `<label>` con `<input type="radio">` dentro (tastiera nativa); `inviteValid` = nome e cognome non vuoti dopo trim ed email che soddisfa `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; bottone `:disabled="invite.loading || !inviteValid"` con l'aspetto spento della tavola 12h; risposta 409 → `errorField = 'email'`; successo → `sentTo = email`, `sentName = firstName + ' ' + lastName`, `loadUsers()`; `hidden.bs.offcanvas` → `resetInvite()`; `shown.bs.offcanvas` → focus su First name. Il modal `#inviteModal` sparisce.
- [ ] **Step 4:** `npx vitest run js/lib/admin-page-guard.test.js` → PASS.
- [ ] **Step 5: Confronto con le tavole** 12h–12j.
- [ ] **Step 6: Commit** `feat(admin): invite drawer`.

---

### Task 5: Responsive — tablet, smartphone, bottom sheet

**Boards:** `12r-tablet-smartphone.png` (più 12a per il confronto delle colonne)

**Files:**
- Modify: `admin.html`
- Modify: `js/lib/admin-page-guard.test.js`

**Interfaces:**
- Consumes: `menuGroups`, `menu`/`runItem` (Task 3), `openInvite` (Task 4).
- Produces: `isPhone` (da `matchMedia('(max-width: 767.98px)')`, aggiornato su `change`) — con `isPhone` `openMenu` apre il bottom sheet invece del popover.

- [ ] **Step 1: Guard (fallisce)** — `@media (max-width: 1279.98px)`, `@media (max-width: 767.98px)`, una classe `ua-sheet` con `role="menu"`, e `--bs-offcanvas-width: 100vw` nella media query phone.
- [ ] **Step 2:** `npx vitest run js/lib/admin-page-guard.test.js` → FAIL.
- [ ] **Step 3: Implementare** spec §3.10: sotto 1280px colonne Invited by e Joined nascoste, terza riga `Joined {date} · by {name}` sotto l'email (solo `· by` se c'è l'invitante), controlli 40px; sotto 768px lista a card (stesso `v-for`, markup alternativo), ricerca a tutta larghezza 44px, pill scorrevoli con contatori, select ruolo sotto le pill, `+ Invite` 44px, sottotitolo `{n} users · {p} pending`; bottom sheet con intestazione `displayName` + `{role} · {status}`, voci ≥ 48px, `Cancel`, scrim `--overlay-scrim`, Esc chiude; drawer a tutto schermo con campi in colonna e radio card impilate; modal a tutta larghezza con inset 16px e bottoni 44px.
- [ ] **Step 4:** `npx vitest run js/lib/admin-page-guard.test.js` → PASS.
- [ ] **Step 5: Confronto con la tavola** 12r.
- [ ] **Step 6: Commit** `feat(admin): tablet and smartphone layouts`.

---

### Task 6: Verifica visiva e documentazione

**Boards:** tutte, `12a`–`12r`

**Files:**
- Modify: `docs/pages/admin.md`
- Create (non committati): `shots/admin/*.png`, snippet `--eval-file` nello scratchpad

Eseguito dalla sessione principale (ha `scripts/shoot.mjs`, PROCESS.md §6.6.3).

- [ ] **Step 1: Stack di branch** — `scripts/test-branch.sh up` dal worktree; `scripts/test-branch.sh status` → `up`.
- [ ] **Step 2: Scatti** con `MSYS_NO_PATHCONV=1 node scripts/shoot.mjs --base http://localhost:8081 --url /admin.html --settle 3000 …`:
  - 1400: stato popolato (`--full`, 12a); vista admin forzando `me.role = 'admin'` via `--eval` sull'istanza Vue (12b); menu aperto su un pending, su un disabled e sull'ultima riga (12d–12g, Review Focus 5); riga in corso forzando `_loading` (12c); drawer vuoto, con errore forzato, inviato (12h–12j); modal Disable e Anonymize (12k, 12l); banner successo ed errore forzati (12m, 12n); filtro senza risultati (12p).
  - 1024: stato popolato (12r tablet). 390: lista, bottom sheet aperto, drawer (12r smartphone).
  - Loading (12o) e accesso negato (12q) solo se raggiungibili con `--eval`; altrimenti restano alla verifica del Gate 2, dichiarandolo.
- [ ] **Step 3: Rileggere ogni PNG con `Read`** e confrontarlo con la sua tavola; presentare l'elenco degli scostamenti uno per uno con proposta fix-ora / accetta-e-registra (§6.6.5) e attendere la decisione; misurare con uno snippet, non a occhio, la larghezza a cui la tabella completa smette di entrare (decisione 11 della spec).
- [ ] **Step 4: Applicare i fix decisi**, rilanciando `npx vitest run js/lib/admin-page-guard.test.js js/lib/user-admin-rules.test.js`.
- [ ] **Step 5: `docs/pages/admin.md`** — sezione del ciclo (data, spec, piano), stato attuale della pagina, scostamenti accettati **con motivo**, elementi omessi (scadenza dell'invito, testo Disable corretto).
- [ ] **Step 6: Commit** `docs(admin): redesign narrative and accepted deviations` (gli scatti non si committano).

## Criteri di accettazione

Quelli della spec (`## Criteri di accettazione`, voci 1–10); questo Piano non ne aggiunge.

## Decisioni aperte

1. **Icone mancanti inline nella pagina, `js/lib/icons.js` intatto.** Alternativa scartata: aggiungerle alla libreria. Perché: toccarla vuol dire alzare 18 riferimenti `?v=` per cinque icone usate da una sola pagina.
2. **Oracolo di characterization trascritto dal template attuale.** Alternativa scartata: tabella di attese scritta a mano. Perché: il template è la sola fonte del comportamento attuale, e la trascrizione si confronta riga per riga con il diff.
3. **Vista admin e stati transitori negli scatti forzati via `--eval` sull'istanza Vue.** Alternativa scartata: un secondo account admin nello stack di branch. Perché: non servono credenziali in più e il markup reso è lo stesso.
4. **Menu ⋯ posizionato `absolute` nella cella, apertura verso l'alto decisa con 360px di margine.** Alternativa scartata: popover `fixed` appeso al `body`. Perché: resta dentro il flusso di Vue e del focus, e 360px copre il menu più alto delle tavole (12g).
