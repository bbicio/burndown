# User Admin redesign — `admin.html` — design spec

**Date:** 2026-11-06
**Brief started:** unknown
**Brief:** `docs/superpowers/design/admin/redesign/brief-user-admin-claude-code.md`
**Boards:** `docs/superpowers/design/admin/redesign/12a…12r-*.png`
**Scenario:** 2 (evoluzione di una feature esistente)

Redesign visivo e di interazione della pagina User Admin. API e regole sui ruoli invariate. Il brief è il riferimento
per misure, testi e colori; questa spec registra cosa si costruisce, cosa si scosta dalle tavole e perché. Dove spec e
brief tacciono, vale la tavola; dove la tavola contraddice il sito, vale il sito (brief §0).

## 1. Fatti verificati nel codice (a `4df978f`)

- `GET /api/users` (`api/src/routes/users.js:55`) restituisce `id, email, first_name, last_name, role, status,
  created_at, invited_by_name`, ordinati `created_at DESC`. **Non** restituisce `invite_expires`.
- `PATCH /api/users/:id` (`users.js:97`): rifiuta il proprio account, un bersaglio sysadmin se l'attore (ruolo live) non
  è sysadmin, e i salti di ruolo tramite `roleChangeError()` (`api/src/lib/role-transition.js`): sysadmin solo da
  sysadmin, sysadmin solo da admin, sysadmin → solo admin.
- `POST /api/users/:id/anonymize` (`users.js:142`): email `anon_<id>@deleted.local`, nome `[Deleted] User`, azzera
  password/token/T&C, `status = 'disabled'`. Il server **non** richiede che il bersaglio sia già `disabled`.
- `POST /api/auth/invite` (`auth.js:108`): ruolo solo `user`/`admin`; email duplicata → `409 { error: 'Email already
  registered' }`; token di 48 h (`token48h()`, `auth.js:16`). `POST /api/auth/:id/resend-invite` (`auth.js:130`):
  nuovo token di 48 h, solo `pending`.
- `requireAuth` (`api/src/middleware/auth.js:4`) verifica solo il JWT: **disabilitare un utente non chiude una sessione
  già aperta** (fino alla scadenza del token, 8 h). Il login (`auth.js:93-94`) rifiuta `disabled` e `pending`.
- `GET /api/users/search` e `/active-list` (`users.js:29,44`) filtrano `status = 'active'`: un utente disabilitato non
  è più selezionabile come destinatario di share e notifiche.
- `admin.html` oggi: badge con hex locali nel `<style>`, filtri senza contatori, fino a 5 bottoni testuali per riga,
  modal Bootstrap per l'invito, `confirm()` nativo per Anonymize (`admin.html:403`), `fetch()` diretto (non `Api.*`).
- `#pd-tooltip` (`js/nav.js:175`) è il tooltip della sola sidebar a icone, non riusabile dalla pagina.

## 2. Logica pura — `js/lib/user-admin-rules.js` (nuovo)

ES module con bridge `window.*` (convenzione di `js/lib/`), nessuna dipendenza dal DOM. Funzioni:

- `rowKind(user, me)` → `'self' | 'locked' | 'anonymized' | 'normal'`. `locked` = bersaglio sysadmin e viewer non
  sysadmin. Anonimizzato = email che inizia con `anon_`. Ordine di precedenza: self, anonymized, locked, normal.
- `primaryAction(user, me)` → `'resend' | 'enable' | null`: `resend` sui pending, `enable` sui disabled non
  anonimizzati, solo su righe `normal`.
- `menuGroups(user, me)` → `[{ group: 'role'|'access'|'data', items: [{ id, label, desc, enabled, reason, tag }] }]`,
  solo per righe `normal`. Voci e regole:
  - **Role** — `Make admin` (su user) / `Make user` (su admin; su sysadmin disabilitata con
    `Revoke sysadmin first: roles change one step at a time.`). `Grant sysadmin` (su user e admin) / `Revoke sysadmin`
    (su sysadmin), tag `SENSITIVE`: su un user disabilitata con `Make admin first: roles change one step at a time.`;
    se il viewer è admin disabilitata con `Only a sysadmin can grant this role.` (questo motivo ha la precedenza
    sull'altro)
  - **Access** — `Resend invite` (solo pending); `Disable…` (non disabled) oppure `Enable` (disabled).
  - **Data** — `Anonymize…`, tag `IRREVERSIBLE`, l'unica voce rossa: disabilitata su un account non `disabled` con
    `Disable the account first.`
  - Descrizioni (11 px, muted), come nelle tavole: Make admin `Can invite and manage users`; Make user `Removes admin
    rights`; Grant sysadmin `Full control, including other sysadmins`; Revoke sysadmin `Back to admin`; Resend invite
    `New activation link, valid 48 hours`; Disable `Blocks sign-in. You can re-enable later.`; Enable `Restores
    sign-in`; Anonymize `Removes name and email for good`.
  - Il risultato coincide con ciò che il server accetta (§1): nessuna voce abilitata che il server rifiuterebbe.
- `statusCounts(users, { role, search })` → `{ all, active, pending, disabled }`: i contatori seguono ruolo e ricerca,
  non lo stato.
- `filterUsers(users, { status, role, search })`: ricerca case-insensitive su `first_name + ' ' + last_name` ed email.
- `sortUsers(users, { key, dir })`: `key` ∈ `name|role|status|joined`, `dir` ∈ `asc|desc|null` (null = ordine API).
  Ordine ruolo user < admin < sysadmin, stato active < pending < disabled. Stabile: a parità, ordine API.
- `nextSort(current, key)`: ciclo ascendente → discendente → ordine API; una colonna nuova parte da ascendente.

## 3. Pagina — struttura

Shell e `.ph` invariati (`initNav('admin', …)`, breadcrumb `Home › User Admin`). CSS nella `<style>` della pagina, solo
`var(--token)`; spariscono le classi `badge-role-*`/`badge-st-*` con hex. Icone SVG inline (`stroke="currentColor"`,
14/16 px) tramite `js/lib/icons.js` dove l'icona esiste, inline nella pagina altrimenti; niente emoji.

### 3.1 Testata (12a, 12b, 12o)
Titolo `Users`. Sottotitolo `{n} users · {p} pending invites` (seconda parte omessa con `p = 0`; `1 user` al singolare);
`Loading…` durante il caricamento. Bottone primario `.ph-btn-primary` **Invite user** con icona plus.

### 3.2 Card e toolbar (12a, 12o, 12p)
Card bianca radius `--radius-lg`, bordo `--border-light`. Toolbar: segmented `.md-seg` (All / Active / Pending /
Disabled + contatore; attivo bianco con ombra e contatore magenta; contatori nascosti durante il caricamento), select
ruolo (`Role: All / User / Admin / Sysadmin`, §6 decisione 8), ricerca 240 px allineata a destra
(`Search name or email…`, icona lente).

### 3.3 Tabella (12a, 12b)
Colonne Name (avatar 30 px con iniziali, nome, email muted 11.5 px) · Role · Status · Invited by · Joined
(`06 Nov 2026`, il `fmtDate` attuale) · azioni. Righe ≥ 58 px. Intestazioni Name/Role/Status/Joined sono `<button>` con
`aria-sort`, ↕ tenue quando non ordinate, ↑/↓ navy quando ordinate. Footer: `Showing {n} of {total}` e, a destra, icona
scudo + `Roles change one step at a time: user → admin → sysadmin.` (viewer sysadmin) o `Sysadmin accounts can only be
changed by a sysadmin.` (viewer admin).

**Badge** (pill 22 px, 11.5 px semibold), token al posto degli hex del brief:

| Badge | Sfondo | Testo | Extra |
|---|---|---|---|
| user | `--surface-subtle` | `--status-not-started-soft-text` | — |
| admin | `--status-completed-soft-bg` | `--status-completed-soft-text` | — |
| sysadmin | `--brand-navy` | `--text-inverse` | icona scudo 10 px |
| active | `--status-started-soft-bg` | `--status-started-soft-text` | pallino `--color-success` |
| pending | `--status-on-hold-soft-bg` | `--status-on-hold-soft-text` | pallino `--brand-gold` |
| disabled | `--status-not-started-soft-bg` | `--status-not-started-soft-text` | pallino `--border-dark` |
| anonymized | trasparente, bordo 1 px dashed `--border-dark` | `--text-secondary` | accanto al badge di stato |

**Righe speciali**
- **Self**: barra inset 3 px `--brand-magenta` a sinistra, sfondo `--surface-light`, avatar navy, chip `YOU`. Cella
  azioni: icona info + `Your account`, `title` `You can't change your own role or access. Ask another admin.`
- **Locked** (sysadmin visto da admin): icona lucchetto + `Sysadmin only`, `title` `Only a sysadmin can change a
  sysadmin account.`
- **Anonymized**: nome *Anonymized user* corsivo muted, avatar tratteggiato con `—`, email reale. Cella azioni: icona
  info + `No actions`, `title` `Personal data was removed. The account can't be restored.`
- **Pending**: solo il badge; la riga di scadenza del link è omessa (§6 decisione 2).
- Il motivo delle note è leggibile anche dagli screen reader (testo `visually-hidden` accanto al `title`).

### 3.4 Azioni per riga (12a, 12d–12g)
- Al più **un** bottone testuale visibile: `Resend invite` / `Enable` (`primaryAction`), outline 30 px, testo navy,
  bordo navy all'hover.
- Bottone ⋯ 30 px quadrato su ogni riga `normal`; apre un popover locale (non Bootstrap dropdown) di 268 px, radius 10,
  `--shadow-xl`, allineato a destra sotto il bottone, verso l'alto quando non c'è spazio sotto. Gruppi da
  `menuGroups` con etichette maiuscole 10 px e divisori; voci con icona, etichetta, descrizione; tag `SENSITIVE`
  (navy) e `IRREVERSIBLE` (rosso). Voci disabilitate visibili, grigie, `cursor: not-allowed`, `aria-disabled="true"`,
  motivo al posto della descrizione. Click fuori o Esc chiudono e rendono il focus al bottone; frecce su/giù fra le voci.
  Un solo menu aperto alla volta.
- Una voce invoca il metodo attuale corrispondente: `toggleRole`, `toggleSysAdmin`, `resendInvite`,
  `setStatus(u,'active')`, apertura del modal Disable o Anonymize.

### 3.5 Riga in corso (12c)
Mentre una richiesta della riga è in corso (`u._loading`): riga a opacità 0.7, cella azioni sostituita da spinner
magenta 14 px + `Updating…` (`Sending…` per il resend), in un contenitore `aria-live="polite"`. Le altre righe restano
utilizzabili.

### 3.6 Banner (12m, 12n)
Sopra la card, larghezza piena, radius 10, titolo in grassetto + testo + bottone di chiusura. Successo: sfondo
`--status-started-soft-bg`, testo `--color-success-text`, icona check, `role="status"`. Errore: sfondo
`--status-at-risk-soft-bg`, testo `--color-danger-text`, icona alert, `role="alert"`. Ogni azione cancella il banner
precedente (come oggi). Testi:
- Resend: `Invite resent.` + `A new activation link was sent to {email}. It's valid for 48 hours.`
- Errore di un'azione: `Couldn't update {name}.` + messaggio del server; senza risposta: `The server didn't respond.
  Check your connection and try again.`
- Errore di caricamento della lista: `Couldn't load users.` + messaggio del server (o lo stesso testo di rete).
- Nessun banner di successo per ruolo, enable, disable, anonymize (come oggi).

### 3.7 Drawer di invito (12h–12j)
Bootstrap `offcanvas offcanvas-end`, `--bs-offcanvas-width: 480px`, scrim `--overlay-scrim`. Click sullo scrim o Esc
chiudono; focus sul primo campo all'apertura, restituito a **Invite user** alla chiusura (focus trap di Bootstrap).
- Testata: eyebrow `USER ADMIN`, titolo **Invite user** (19 px bold), sotto `They'll get an email with an activation
  link, valid for 48 hours.`, ×.
- Corpo scorrevole: First name e Last name affiancati, Email, Role come due radio card (`User` — `Works on pipeline,
  portfolio and planning`; `Admin` — `Also manages users and master data`); card selezionata bordo navy, sfondo
  `--surface-light`. Sotto: `Sysadmin can't be assigned with an invite. Promote an admin once they're active.`
- Footer fisso: `Cancel` (testo) e **Send invite** (magenta), con aspetto spento finché i campi obbligatori non sono
  validi (§6 decisione 12); durante l'invio spinner bianco + `Sending…`.
- **Errore** (12i): box rosso in testa al corpo con il messaggio del server; con risposta 409 il campo Email è
  bordato di rosso. Form modificabile.
- **Inviato** (12j): il form è sostituito da un pannello verde (cerchio check) `Invite sent to {email}` + `{name}
  appears in the list as pending until they activate the account. You can resend the invite from their row.` Footer:
  `Invite another` (resetta, drawer aperto) e **Close** (navy). La lista si ricarica con `loadUsers()` come oggi;
  chiudere resetta il form come oggi.

### 3.8 Modal di conferma (12k, 12l)
Due modal Bootstrap centrati, 460 px, radius 12, scrim `--overlay-scrim`. Esc e Cancel chiudono.
- **Disable** (12k): cerchio grigio con icona power, `Disable {name}?`, testo `They can't sign in until an admin
  enables the account again. A session that's already open stays valid until it expires (up to 8 hours).` Box
  **Stops**: `Sign-in`, `Being picked for shares and notifications`. Box **Stays as it is**: `Role ({role})`, `All data
  they created`. Primario **Disable user** navy. Conferma → `setStatus(u, 'disabled')`.
- **Anonymize** (12l): cerchio rosso con icona cestino, `Anonymize {name}?`, tag `IRREVERSIBLE`. Testo `Their name and
  email are replaced with anonymous values. The account stays disabled and can't be restored.` Box **Removed for
  good**: nome, email dell'utente. Box **Kept**: `Proposals and projects`, `Cost grids they created`. Checkbox `I
  understand this can't be undone.` abilita **Anonymize user** (rosso, `.btn-danger` token-driven di `style.css`).
  Focus iniziale su Cancel. Conferma → `anonymizeUser(u)`. Il `confirm()` sparisce.
- Enable, cambi di ruolo e Resend invite restano senza conferma.

### 3.9 Stati della pagina (12o, 12p, 12q)
- **Caricamento**: testata e toolbar visibili (contatori nascosti), nel corpo della card spinner magenta 28 px +
  `Loading users…`.
- **Nessun risultato**: icona lente in cerchio, `No users match the selected filter.`, riga che descrive i filtri
  attivi (es. `Showing pending users · "marco"`), bottone outline **Clear filters** che azzera stato, ruolo e ricerca.
- **Accesso negato**: nessuna testata né toolbar; card centrata con lucchetto, **Admin access required**, `User
  management is available to admins and sysadmins. Ask an admin if you need access.`, bottone navy **Go to app**
  (`href="/"`, come oggi).

### 3.10 Responsive (12r)
- **< 1280 px** (tablet, sidebar a icone): colonne Name · Role · Status · azioni; sotto l'email una terza riga 10.5 px
  `Joined {date} · by {name}` (senza `· by …` se manca l'invitante). Toolbar su una riga, ricerca flessibile. Bottoni e
  ⋯ a 40 px.
- **≤ 767 px** (navbar in alto): testata `Users` + sottotitolo breve `{n} users · {p} pending`, bottone `+ Invite`
  44 px. Ricerca a tutta larghezza 44 px, filtri di stato come pill scorrevoli con contatori, select ruolo sotto.
  Ogni utente è una card (nome + `YOU`, email, badge ruolo e stato, ⋯ 44 px in alto a destra, `Resend invite` /
  `Enable` a tutta larghezza 44 px in fondo; self, locked e anonimizzate mostrano la nota al posto dei bottoni).
  ⋯ apre un **bottom sheet** con lo stesso contenuto di `menuGroups`, intestazione nome + `{role} · {status}`, voci
  ≥ 48 px, `Cancel` in fondo. Drawer di invito a tutto schermo (`--bs-offcanvas-width: 100vw`), campi in colonna 44 px,
  radio card impilate, footer fisso con `Cancel` e `Send invite` 44 px. Modal di conferma a tutta larghezza con inset
  16 px, bottoni 44 px.

## 4. Test

- **Characterization** (prima di toccare la pagina): `js/lib/user-admin-rules.test.js` fissa, per ogni combinazione
  viewer {admin, sysadmin} × bersaglio {self, user, admin, sysadmin} × stato {active, pending, disabled, anonimizzato},
  quali azioni la pagina attuale offre; le nuove funzioni devono abilitare esattamente quelle (più le voci disabilitate
  con motivo).
- Unit test di `statusCounts`, `filterUsers`, `sortUsers`, `nextSort`.
- `js/lib/admin-page-guard.test.js`: nessun `confirm(`/`alert(` e nessun hex nella pagina, nessuna emoji di azione,
  `?v=` di `user-admin-rules.js` coerente, presenza di `aria-haspopup="menu"`, `aria-sort`, `role="alert"`,
  `role="status"`.
- I guard esistenti (`nav-shell-guard`, `page-head-guard`, `foundations-guard`, `content-surface-guard`) restano verdi.
- Verifica visiva con `scripts/shoot.mjs` su stack di branch, confronto tavola per tavola (§6.6.4–6.6.5 di PROCESS.md).

## 5. Documentazione

`docs/pages/admin.md`: sezione del ciclo, scostamenti accettati con motivo. `docs/js/lib.md`: voce del nuovo modulo.
Riga della tabella Pages di `CLAUDE.md` invariata (lo scopo non cambia).

## 6. Fuori scope

Modifiche alle API (incluso `invite_expires` in `GET /api/users`), UI per `DELETE /api/users/:id`, chiusura delle
sessioni alla disabilitazione, pagine Team e Attribute Lists, passaggio della pagina ad `Api.*`.

## Criteri di accettazione

1. **Un bottone per riga** — al più un bottone testuale visibile per riga; tutto il resto è nel menu ⋯ raggruppato
   Role / Access / Data, con Anonymize unica voce rossa.
2. **Regole invariate** — le voci abilitate coincidono con le azioni della pagina attuale per ogni combinazione
   viewer × bersaglio × stato (test di characterization verde).
3. **Motivi visibili** — le voci non disponibili mostrano il motivo; self, locked e anonimizzate mostrano la nota con
   `title`.
4. **Filtri, ricerca, ordinamento** — contatori di stato che seguono ruolo e ricerca; filtro ruolo, ricerca e
   ordinamento a tre stati funzionano lato client.
5. **Drawer di invito** — l'invito si apre in un drawer a destra con il solo form; errore (con Email in rosso su 409) e
   stato inviato restano nel drawer; `Invite another` resetta senza chiudere.
6. **Conferme in-app** — Disable e Anonymize passano da modal; Anonymize richiede la checkbox; nessun `confirm()` nella
   pagina.
7. **Spinner per riga** — durante una richiesta la riga mostra spinner + `Updating…`/`Sending…` e le altre restano
   usabili.
8. **Token** — nessun hex nella pagina, nessun token nuovo.
9. **Responsive** — a 1024 px colonne compatte; a 390 px card, bottom sheet, drawer a tutto schermo, target ≥ 44 px.
10. **Fedeltà** — gli scatti di `shoot.mjs` sono confrontati con 12a–12r e gli scostamenti decisi uno per uno.

## Decisioni aperte

1. **Bootstrap offcanvas per il drawer e modal Bootstrap per le conferme, menu ⋯ locale.** Alternativa scartata:
   copiare il `.mdr-drawer` locale di Master Data. Perché: offcanvas dà focus trap, Esc e scrim senza codice nuovo.
2. **Riga di scadenza del link omessa sui pending.** Alternativa scartata: aggiungere `invite_expires` a
   `GET /api/users`. Perché: il brief §0 vieta nuovi campi API.
3. **Modal Disable con testo corretto** (`A session that's already open stays valid…`; Stops = `Sign-in`, `Being picked
   for shares and notifications`). Alternativa scartata: il testo della tavola 12k (`They're signed out`, `active
   sessions`, `Notifications by email`). Perché: `requireAuth` non controlla lo stato, la tavola descriverebbe un
   effetto che il sito non applica.
4. **Errore di invito col messaggio del server** (`Email already registered`). Alternativa scartata: il testo della
   tavola 12i. Perché: brief §0 e §7, i messaggi del sito restano.
5. **Banner del resend col testo della tavola; nessun nuovo banner di successo.** Alternativa scartata: tenere `Invite
   resent to {email}` o aggiungere banner per ogni azione. Perché: il testo della tavola è esatto (48 h), le altre
   azioni si vedono già nella riga.
6. **Enable e Resend invite sia come bottone visibile sia nel menu.** Alternativa scartata: solo bottone. Perché: le
   tavole 12d e 12f le mostrano in entrambi i posti.
7. **`title` + testo `visually-hidden` per i motivi.** Alternativa scartata: estendere `#pd-tooltip`. Perché: è legato
   al layout della sidebar.
8. **Filtro ruolo come `<select>` nativo stilizzato** (etichetta `Role` + chevron). Alternativa scartata: `<cg-select>`.
   Perché: `cg-controls.js` non è caricato su questa pagina e la lista ha quattro voci fisse.
9. **Riga anonimizzata con *Anonymized user* e l'email reale; regola "solo disabled" tenuta nell'interfaccia.**
   Alternativa scartata: nascondere l'email o togliere il vincolo. Perché: è il comportamento attuale.
10. **Nessun token nuovo; scrim `--overlay-scrim` invece di 0.28/0.42.** Alternativa scartata: token per badge ruolo e
    scrim più chiari. Perché: i token esistenti coprono ogni coppia a ≥ 4.5:1.
11. **Colonne compatte sotto i 1280 px, card sotto i 768 px.** Alternativa scartata: compattare solo a 1024 px. Perché: il
    brief §11 descrive le colonne compatte a 1024 px; la soglia si conferma misurando nella verifica visiva.
12. **Send invite spento finché nome, cognome ed email ben formata mancano; la validazione resta al server.**
    Alternativa scartata: nessun controllo lato client. Perché: lo chiede il brief §8.
13. **Logica estratta in `js/lib/user-admin-rules.js`.** Alternativa scartata: tenerla nei metodi Vue. Perché: rende
    testabili le regole del menu e la characterization dello Scenario 2.
