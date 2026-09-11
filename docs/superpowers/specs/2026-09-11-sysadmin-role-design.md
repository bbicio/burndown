# Design — Ruolo sysadmin, DB Reset e Terms & Conditions esclusivi

## Overview

Introduce un terzo livello di ruolo, `sysadmin`, sopra `admin`. Un sysadmin fa tutto quello che fa un admin (nessun gate admin-only esistente si restringe), più due privilegi esclusivi che oggi sono aperti a tutti gli admin: l'accesso a `_db-reset.html` (cancellazione dati bulk/singola proposal) e la modifica/pubblicazione dei Terms & Conditions (finora una card dentro `admin.html`, spostata in una nuova pagina dedicata `_terms-editor.html`). Un nuovo blocco nel menu di navigazione, visibile solo ai sysadmin, dà accesso a entrambe le pagine.

Nessuna pagina/route esistente cambia except dove elencato sotto — il gate admin generico (`requireAdmin`, i controlli `role === 'admin'` sparsi nel frontend) viene esteso per riconoscere anche `sysadmin`, non sostituito.

## 1. Modello ruoli (DB)

Migrazione `api/src/db/migrations/018_sysadmin_role.sql`:

```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'sysadmin'));
```

Nessun default o backfill: nessun utente esistente diventa sysadmin automaticamente — va assegnato manualmente da `admin.html` dopo il deploy (vedi §3).

## 2. Permessi backend

`api/src/middleware/auth.js`:
- `requireAdmin` estesa: `role === 'admin' || role === 'sysadmin'` (sostituisce il controllo singolo `role !== 'admin'`). Tutti i ~15 file di route che già usano `requireAdmin` (users, config, pots, currencies, pipeline-years, client-groups, exports, app-settings `GET`/altre azioni non-terms) ereditano l'estensione senza modifiche proprie.
- Nuova `requireSysAdmin`: `role === 'sysadmin'` esclusivo (nessun fallback ad admin).

`api/src/routes/reset.js:8`: `router.use(requireAuth, requireAdmin)` → `router.use(requireAuth, requireSysAdmin)`.

`api/src/routes/app-settings.js:30`: `router.put('/terms', requireAdmin, ...)` → `router.put('/terms', requireSysAdmin, ...)`. `GET /terms` (riga 13, `requireAuth`) resta invariata — serve a `terms.html` per ogni utente che deve accettare i termini, a prescindere dal ruolo.

`api/src/routes/users.js` — `PATCH /:id` (righe 76-103):
- `allowed.role` diventa `['admin', 'user', 'sysadmin']`.
- Nuovo vincolo, applicato **prima** dell'update: se `role === 'sysadmin'` è richiesto, o se la riga target ha attualmente `role === 'sysadmin'` ed è richiesto un `role` diverso, l'attore (`req.user`) deve avere `role === 'sysadmin'` — altrimenti `403`. Qualsiasi altra transizione (`user`↔`admin`) resta aperta a qualunque admin/sysadmin, come oggi.
- Promozione a sysadmin ammessa solo a due passaggi: la riga target deve avere `role === 'admin'` al momento della richiesta (non si può passare direttamente da `user` a `sysadmin` in una chiamata) — controllo lato server in aggiunta al vincolo UI (§3), per difesa in profondità.
- Il blocco auto-modifica esistente (riga 80-82, `req.params.id === req.user.id → 400`) copre già il caso "un sysadmin non può toccare il proprio ruolo".

## 3. UI gestione utenti (`admin.html`)

- Gate di accesso pagina (riga 286): `user.role !== 'admin'` → `!['admin','sysadmin'].includes(user.role)`.
- Nuovo `.badge-role-sysadmin` in CSS (stesso pattern di `.badge-role-admin`/`.badge-role-user`).
- Toggle ruolo base esistente ("Make admin"/"Make user", righe 111-116): reso condizionale — `v-if="u.role !== 'sysadmin'"` — non compare più su righe sysadmin, per nessun viewer. Comportamento invariato (`user`↔`admin`) per le altre righe.
- Nuovo toggle, visibile solo quando `me.role === 'sysadmin'` **e** la riga ha `role` `admin` o `sysadmin`:
  - riga `admin` → bottone "⬆ Grant sysadmin" (POST del nuovo `role: 'sysadmin'`)
  - riga `sysadmin` → bottone "⬇ Revoke sysadmin" (POST di `role: 'admin'`)
- Entrambi i toggle restano dentro il blocco `v-if="u.id !== me.id"` già esistente (riga 110) — l'esclusione sulla propria riga è quindi automatica, nessuna logica nuova.
- **Rimossa** l'intera card "Terms & Conditions" (righe 164-189) e il relativo stato/metodi Vue (`terms: {...}`, `loadTerms()`, `saveTerms()`, `fmtDate` se non usata altrove nella pagina) — spostata in `_terms-editor.html` (§5), non duplicata.

## 4. Altri gate admin estesi a sysadmin

Stesso one-liner (`role === 'admin'` → include anche `sysadmin`) in:

| File | Riga | Uso |
|---|---|---|
| `config.html` | 1246 | Gate accesso pagina Config |
| `timesheets.html` | 266 | Gate accesso pagina Actuals Repository |
| `pipeline.html` | 523 | `isAdmin` — usato da `rateStale` per mostrare il warning "tasso di cambio non aggiornato" |
| `js/settings.js` | 22 | `isAdmin` — mostra sezioni admin-only del modale Settings |
| `js/nav.js` | 35 | Gate per i tab Config/Actuals Repository/User Admin |
| `js/nav.js` | 566 | Mostra l'opzione "All users (broadcast)" nel modale Send Notification |
| `js/shares.js` | 356 | Esclusione dalla lista utenti selezionabili nel modale Share (oggi esclude solo `role==='admin'`) |

Inoltre, 4 file di route hanno una **copia locale** di `requireAdmin` invece di importare quella condivisa da `middleware/auth.js` — estendere solo il middleware condiviso non li tocca: `api/src/routes/client-groups.js:7-10`, `currencies.js:7-10`, `pipeline-years.js:7-10`, `pots.js:7-10` (tutte identiche: `function requireAdmin(req,res,next){ if (req.user.role!=='admin') return res.status(403).json({error:'Admin required'}); next(); }`). Vanno rimosse e sostituite con l'import di quella condivisa (già estesa al §2), eliminando la duplicazione invece di ripeterla quattro volte.

## 5. Nuovo blocco menu sysadmin (`js/nav.js`)

Dopo il blocco `adminHtml` esistente (righe 35-40, ora esteso a sysadmin), un secondo blocco condizionale su `user.role === 'sysadmin'`, separato da un ulteriore divider verticale (stesso stile di quello tra i tab base e i tab admin):

```js
const sysAdminHtml = user.role === 'sysadmin'
  ? `<span style="border-left:1px solid rgba(255,255,255,.15);margin:8px 6px;align-self:stretch"></span>` +
    `<a class="nav-main-tab nav-admin-tab${activeTab === 'dbreset'      ? ' active' : ''}" href="/_db-reset.html">🗄 DB Reset</a>` +
    `<a class="nav-main-tab nav-admin-tab${activeTab === 'termseditor'  ? ' active' : ''}" href="/_terms-editor.html">📄 Terms &amp; Conditions</a>`
  : '';
```

concatenato dopo `adminHtml` nel markup della navbar.

## 6. Pagina `_terms-editor.html` (nuova)

Pagina nascosta, stesso pattern strutturale di `_db-reset.html` (Vue 3 via CDN, no build step, `<div id="app" v-cloak>`, `v-if="ready || accessDenied"`, alert "Access denied" altrimenti):

- `created()`: `initNav('termseditor', { breadcrumbs: [{label:'Home',href:'/pipeline.html'},{label:'Terms & Conditions'}] })`; se `user.role !== 'sysadmin'` → `accessDenied = true`, altrimenti carica i termini e `ready = true`.
- Contenuto: esclusivamente la card "📄 Terms & Conditions" spostata **verbatim** da `admin.html` (titolo, versione corrente + data/autore ultimo aggiornamento, bottoni Preview/Save draft/Publish new version, textarea contenuto HTML) — stesso stato/metodi (`terms.*`, `loadTerms()`, `saveTerms()`), stesse chiamate `fetch('/api/app-settings/terms', ...)`.
- `_db-reset.html:170` aggiorna il proprio `initNav(null, ...)` → `initNav('dbreset', ...)` per evidenziare correttamente il proprio tab ora che esiste un secondo tab sysadmin (oggi passa `null` perché non esisteva alcun tab da evidenziare).

## Error handling

- `PATCH /api/users/:id` con `role: 'sysadmin'` da un attore non-sysadmin, o verso una riga che non è già `admin` → `403`/`400` con messaggio esplicito (stesso stile delle validazioni esistenti in quel file, es. `{ error: 'Invalid role' }` / nuovo `{ error: 'Only a sysadmin can grant or revoke sysadmin' }`).
- `requireSysAdmin` su `reset.js`/`app-settings.js PUT` restituisce `403` con lo stesso formato già usato da `requireAdmin` (`{ error: '... access required' }`).
- Accesso diretto via URL a `_db-reset.html`/`_terms-editor.html` da un admin non-sysadmin: nessun redirect, stessa UX già in uso — pagina renderizzata con il solo alert "Access denied".

## Testing

- Nessun test automatico esiste oggi per `admin.html`/`_db-reset.html`/`js/nav.js` (pagine Vue senza build step, non coperte da `js/**/*.test.js` di vitest). Verifica manuale in browser, come per i cicli precedenti su queste pagine.
- Verifica automatica applicabile solo lato backend: `api/src/routes/users.js` (vincoli su `PATCH /:id` per le transizioni verso/da `sysadmin`) è raggiungibile da `api/src/routes/*.test.js` con `node:test` se il file espone logica isolabile — da valutare in fase di piano se vale la pena estrarre il controllo di transizione in `api/src/lib/` per testarlo in isolamento (pattern già usato altrove nel repo, es. `rate-resolve.js`).
- Verifica manuale minima da eseguire dopo l'implementazione:
  1. Un admin normale non vede più la card T&C in `admin.html`, non vede i tab "DB Reset"/"Terms & Conditions" in navbar, e un accesso diretto via URL a entrambe le pagine mostra "Access denied".
  2. Un admin normale può ancora promuovere `user → admin` e retrocedere `admin → user`, ma non vede alcun controllo sysadmin, né un toggle su righe già sysadmin.
  3. Un sysadmin vede entrambi i nuovi tab, può promuovere `admin → sysadmin` e retrocedere `sysadmin → admin`, non può auto-modificarsi.
  4. Un tentativo di promuovere direttamente `user → sysadmin` (bypassando l'UI, via chiamata diretta all'API) viene rifiutato dal backend.
  5. `terms.html` (pagina di accettazione T&C) continua a funzionare per qualunque utente indipendentemente dal ruolo.

## Explicitly excluded scope

(riportato dalla discussione)

- Nessun'altra voce nel menu sysadmin oltre a DB Reset e Terms & Conditions in questo giro.
- Nessuna migrazione automatica di utenti esistenti a sysadmin — assegnazione manuale post-deploy.
- Nessun cambiamento al comportamento di `GET /api/app-settings/terms` o a `terms.html`.
- Nessuna modifica al `requireAdmin` per le route diverse da quelle elencate — sysadmin eredita automaticamente tutto ciò che è già `requireAdmin` altrove, senza toccare quei file.
