# Two-step, ciclo 1: la pagina My profile — design spec

**Date:** 2026-11-09
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-09-two-step-c1-profile-page-brief.md`
**Boards:** `docs/superpowers/design/two-factor/redesign/15a-details.png`, `15b-password.png`, `15k-privacy.png`, `15ap-1-profile-tablet.png`, `15ap-2-profile-smartphone.png`
**Scenario:** 2 (evoluzione di una feature esistente)

I modal My Profile e Change password diventano la pagina `profile.html`. I dati anagrafici (nome, cognome, email)
passano in gestione all'admin: l'utente li vede in sola lettura e li modifica un admin da User Admin. Il ciclo
prepara la pagina che il ciclo 2 (`docs/superpowers/briefs/2026-11-09-two-step-c2-email-code-brief.md`) riempie con
le sezioni di sicurezza. Dove la tavola contraddice il sito vale il sito (brief UI §0).

## 1. Fatti e perimetro

### 1.1 Fatti verificati nel codice (a `81c97b6`)

- `PATCH /api/auth/profile` (`api/src/routes/auth.js`) aggiorna `firstName`, `lastName`, `email` dell'utente
  loggato. Il suo unico chiamante è il modal `#navProfileModal` di `js/nav.js` (via `Api.auth.updateProfile`,
  `js/api.js`).
- `PATCH /api/users/:id` (`api/src/routes/users.js`) accetta solo `role` e `status`, con le guardie "non su sé
  stessi" e `sysAdminTargetError` sul ruolo live dell'attore.
- `GET /api/auth/me` restituisce `id, email, first_name, last_name, role, status, terms_version` e
  `current_terms_version`. `users` ha anche `created_at` e `terms_accepted_at`, non una data di cambio password.
- `POST /api/auth/change-password`, `reset-password` e `activate` scrivono `password_hash` e nient'altro.
- Nessun endpoint espone al client delle variabili d'ambiente. Le variabili arrivano al container `api` dal blocco
  `environment:` di `docker-compose.yml`, documentate in `.env.example`.
- `ARCHITECTURE.md` §4.6 descrive il flusso di rettifica self-service del modal come "Profile Rectification (GDPR
  Art. 16)".
- `admin.html` ha già un drawer "Invite user" con First name, Last name, Email e un menu ⋯ per riga a gruppi
  (`.ua-menu-group`).

### 1.2 Elementi delle tavole omessi o cambiati

- **Details (15a)**: tutto in sola lettura, non solo l'email (decisione utente). Niente footer Save/Discard.
- **Nota del Password (15b)** "Updating your password signs you out of other sessions and removes trusted devices."
  omessa: oggi sarebbe falsa.
- **Your data in PDash (15k)**: riga "Sign-in activity" omessa fino al ciclo 2.
- **Download my data (15k, 15l)** omessa (⚠).
- **Gruppi SECURITY e PREFERENCES** della sotto-navigazione assenti finché vuoti.
- **Smartphone (15ap-2)**: selettore di sezione delle pagine Master Data al posto del bottom sheet (vince il sito).

## 2. Server e dati

- **Migration `033_profile_admin_managed.sql`**:
  - `ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ NULL`, nessun backfill;
  - tabella `rectification_requests` (`id`, `user_id` → `users` `ON DELETE CASCADE`, `message TEXT NOT NULL`,
    `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`): il registro delle richieste di rettifica.
- **`change-password`, `reset-password`, `activate`** scrivono `password_changed_at = NOW()` nello stesso `UPDATE`
  dell'hash.
- **`GET /api/auth/me`** restituisce in più `created_at`, `terms_accepted_at`, `password_changed_at`.
- **`PATCH /api/auth/profile` eliminata**, con `Api.auth.updateProfile`. Una richiesta a quel path risponde `404`.
- **`PATCH /api/users/:id`** accetta anche `firstName`, `lastName`, `email`:
  - nome e cognome: stringhe non vuote dopo `trim`;
  - email: `trim` + minuscolo, stessa regex usata oggi da `/profile`, `409 { error: 'Email already in use' }` se
    appartiene a un altro utente;
  - stesse guardie di `role`/`status`: nessuno modifica sé stesso, un admin non modifica un sysadmin;
  - un utente anonimizzato non si modifica: `400`;
  - un campo invalido rifiuta l'intera richiesta, senza scrivere nulla.
- **`POST /api/auth/rectification-request`** (`requireAuth`), body `{ message }`:
  - `message` obbligatorio dopo `trim`, al massimo 2000 caratteri, altrimenti `400` senza scrivere nulla;
  - scrive una riga in `rectification_requests`;
  - per ogni utente `active` con ruolo `admin` o `sysadmin`, escluso il richiedente: `createNotification`
    (`Profile change requested by {name}`, il messaggio come body, `url` verso `/admin.html`) ed email con
    `sendAdminNotificationEmail`; un invio email fallito non fa fallire la richiesta, la riga di registro resta;
  - risposta `201 { ok: true }`.
- **`GET /api/app-settings/privacy-contact`** (`requireAuth`): `{ name, email }` da `PRIVACY_CONTACT_NAME` e
  `PRIVACY_CONTACT_EMAIL`; `{ name: null, email: null }` se l'email è vuota. Le due variabili entrano in
  `.env.example` e nel blocco `environment:` del servizio `api` di `docker-compose.yml`, vuote di default.
- **`ARCHITECTURE.md`**: §4.6 riscritta (rettifica tramite admin), §5.1 con la colonna e la tabella nuove, §6 Auth/Users/App
  Settings aggiornate (`scripts/architecture-guard.test.js`).

## 3. `profile.html`

- Pagina Vue nuova con root `v-cloak`, wrapper `#app-shell`, `.ph`, `js/lib/icons.js` prima di `nav.js`, stylesheet
  `css/profile.css`. Breadcrumb `Home › My profile`. Riga nuova nella tabella Pages di `CLAUDE.md` e
  `docs/pages/profile.md`.
- **Header (15a)**: avatar navy 48 px con le iniziali, titolo **My profile**, sottotitolo
  `{First} {Last} · {role} · member since {date}`. Date da `js/lib/dates.js`.
- **Sotto-navigazione**: `<nav aria-label="My profile sections">`, stili `.md-subnav`, `aria-current="page"` sulla
  voce attiva. Costruita da un array di gruppi: **ACCOUNT** (Details, Password), **PRIVACY** (Privacy & data). Un
  gruppo senza voci non si rende.
- **Hash**: `#details`, `#password`, `#privacy`. Hash assente o sconosciuto → Details. Cambiare sezione aggiorna
  l'hash; `hashchange` cambia sezione, quindi indietro/avanti funzionano.
- **Details**: First name, Last name, Email (con lucchetto), Role (chip), Member since, tutti in sola lettura. Footer
  della card: a sinistra `Your details are managed by an admin.`, a destra il pulsante outline **Request a change**.
- **Drawer "Request a change"**: `.pd-drawer` da 480 px, eyebrow `MY PROFILE`, titolo **Request a change**, testo
  `Tell the admins what is wrong or out of date. They will update your details.`, textarea obbligatoria (2000
  caratteri), footer Cancel + **Send request** (disabilitato a textarea vuota, spinner durante l'invio). Errori del
  server nel drawer. Dopo l'invio il drawer si chiude e compare il banner `Request sent to the admins.` Esc e × chiudono
  il drawer; focus intrappolato e restituito al pulsante.
- **Password (15b)**:
  - sottotitolo `Last changed on {date}.` solo se `password_changed_at` non è `NULL`;
  - Current password, New password (placeholder `At least 8 characters`), Confirm new password; se le due nuove
    differiscono, campo rosso e `Passwords don't match.`;
  - barra a 4 segmenti calcolata da una funzione pura nuova in `js/lib/` con test; è un suggerimento, la regola resta
    il minimo di 8 del server;
  - **Update password** (`Api.auth.changePassword`) disabilitato finché i tre campi non sono compilati e coerenti,
    spinner durante la richiesta; l'errore "password attuale errata" sotto Current password, gli altri in un
    `.pd-banner` della card; dopo il successo i campi si svuotano, `Password updated.` e il sottotitolo si aggiorna.
- **Privacy & data (15k)**:
  - **Your data in PDash**: Profile (`Name, email, role`), Your work (`Proposals, cost grids and shares you
    created`), Agreements (`Terms & Conditions accepted on {date} · View` e **Privacy notice**, entrambi verso
    `/privacy-notice.html`; senza data, solo i link);
  - **Questions about your data?**: solo se `/privacy-contact` restituisce un'email; testo del brief UI §11 con nome
    ed email, pulsante outline **Write an email** (`mailto:`).
- **Stati**: caricamento e errore di `/privacy-contact` non bloccano la pagina (la card resta nascosta).

## 4. User Admin: Edit details

- Nuova voce **Edit details…** nel menu ⋯ della riga, nel gruppo delle azioni sull'account, con le stesse regole di
  visibilità di Disable: non su sé stessi, non da admin su un sysadmin, non su utenti anonimizzati.
- Apre un `.pd-drawer` da 480 px sul modello del drawer Invite user: First name, Last name, Email precompilati, Save
  disabilitato finché nulla cambia o un campo è vuoto, errori del server nel drawer (409 sotto Email), Cancel.
- Dopo il salvataggio: drawer chiuso, riga aggiornata, banner `Details updated for {name}.`
- `docs/pages/admin.md` aggiornato.

## 5. Navigazione

- **My Profile** → `/profile.html`, **Change password** → `/profile.html#password` (link, non più modal).
- Rimossi `#navProfileModal`, `#navChangePwdModal` e i loro handler da `js/nav.js`; `js/lib/nav-behavior.test.js`
  aggiornato.
- `initNav('profile')` marca attivo il pulsante account (`.pd-account-btn`): sfondo chiaro e barra magenta inset da
  3 px come le altre voci attive, nel sidebar e nel rail.
- Ogni `js/*.js`/`css/*.css` toccato ha il suo `?v=N` aggiornato in tutte le pagine (`nav-shell-guard`,
  `foundations-guard`).

## 6. Responsive e accessibilità

- **Tablet 1024×768 (15ap-1)**: la sotto-navigazione diventa una riga di chip sotto l'header, come in Master Data.
- **Smartphone 390×844 (15ap-2)**: un selettore di sezione al posto della sotto-navigazione, con lo stesso
  componente usato dalle pagine Master Data sotto i 1024 px; target ≥ 44 px.
- Focus visibile, errori in `role="alert"`, banner di successo in `role="status"`.

## Criteri di accettazione

1. **Pagina** — `/profile.html` si apre con Details; `#password` e `#privacy` aprono le loro sezioni; un hash
   sconosciuto apre Details; indietro/avanti cambiano sezione.
2. **Menu account** — My Profile e Change password aprono la pagina e la sezione giusta; i due modal non esistono più
   nel DOM; su `profile.html` il pulsante account è marcato attivo.
3. **Details in sola lettura** — nome, cognome, email, ruolo e member since sono visibili e nessuno è modificabile.
4. **Self-service chiuso** — `PATCH /api/auth/profile` risponde 404 e l'utente resta invariato (`test-api.js`).
5. **Richiesta di rettifica** — dal drawer di Details l'utente invia un messaggio; compare `Request sent to the
   admins.`; ogni admin/sysadmin attivo riceve la notifica; la riga è in `rectification_requests`; un messaggio vuoto
   o oltre 2000 caratteri risponde 400 senza scrivere nulla (`test-api.js`).
6. **Edit details** — un admin modifica nome, cognome ed email di un utente; email duplicata → 409 con errore nel
   drawer; la voce non compare su sé stessi, su un sysadmin visto da admin, su un utente anonimizzato; le stesse
   richieste via API rispondono 403/400 e il DB resta invariato (`test-api.js`).
7. **Password** — cambio riuscito con password attuale corretta; password attuale errata → errore sotto il campo;
   conferma diversa → `Passwords don't match.` e pulsante disabilitato; dopo il cambio compare
   `Last changed on {oggi}.`
8. **password_changed_at** — valorizzata dopo change-password, reset-password e activate (`test-api.js`).
9. **Contatto privacy** — con `PRIVACY_CONTACT_EMAIL` impostata la card compare con nome ed email e `mailto:`
   corretto; vuota, la card non c'è (`test-api.js` per l'endpoint).
10. **Robustezza password** — la funzione pura ha test per vuoto, < 8, 8 solo lettere, lunga con numeri e maiuscole.
11. **Responsive** — a 1024 px chip orizzontali, a 390 px selettore di sezione, nessun overflow orizzontale
    (`scripts/shoot.mjs`).
12. **Suite** — `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- Two-step verification, Trusted devices, rate limiting del login (ciclo 2).
- Sessions, Notifications, Download my data (⚠, backlog).
- Authenticator app, recovery code, reset 2FA da admin (ciclo futuro).
- Avvisi email per il cambio dei dati da parte di un admin (ciclo 2, con gli altri avvisi di sicurezza).

## Decisioni aperte

1. **Nome, cognome ed email modificabili solo da un admin.** Alternativa scartata: solo l'email bloccata, come nel
   brief UI. Perché: decisione dell'utente in chat.
2. **Rettifica GDPR con una richiesta registrata dall'app, in un drawer.** Alternativa scartata: la sola nota "Ask an
   admin", o il contatto privacy reso obbligatorio. Perché: è sempre disponibile, non dipende da una variabile
   d'ambiente e lascia traccia (artt. 5.2, 12.2 GDPR); confermata dall'utente, da far validare al DPO.
3. **Registro in una tabella dedicata `rectification_requests`.** Alternativa scartata: le sole righe di
   `notifications`. Perché: la notifica è la consegna, il registro deve sopravvivere a essa.
4. **`PATCH /api/auth/profile` eliminata.** Alternativa scartata: tenerla per rispondere 400. Perché: il suo unico
   chiamante sparisce.
5. **Azione admin "Edit details…" in un drawer.** Alternativa scartata: cambio solo da DB/CLI. Perché: decisione
   dell'utente in chat.
6. **Contatto privacy da `GET /api/app-settings/privacy-contact`.** Alternativa scartata: campo in `/me`. Perché:
   dato di tutta l'app, serve a una sola pagina.
7. **Colonna `password_changed_at`, senza backfill.** Alternativa scartata: omettere "Last changed on". Perché: serve
   anche al ciclo 2.
8. **Nota sulle sessioni del Password e riga "Sign-in activity" omesse.** Alternativa scartata: mostrarle come nelle
   tavole. Perché: oggi sarebbero false.
9. **Gruppi vuoti della sotto-navigazione non resi.** Alternativa scartata: mostrarli disabilitati. Perché: voci senza
   destinazione.
