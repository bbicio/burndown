# Brief — Settings → Privacy Notice

**Date:** 2026-11-06
**Scenario:** 2 (evoluzione di una feature esistente) — confermato dall'utente

## Comportamento attuale

- Menu account: voce `⚙ Settings` (`js/nav.js:102`, id `nav-settings-btn`, icona `config`); click → `/settings.html` (`js/nav.js:611-614`).
- `settings.html`: solo navigazione, breadcrumb `Home › Settings` (`settings.html:51-54`) e `.ph` con titolo "Settings" (`settings.html:22-26`); `<title>PDash — Settings</title>` (`settings.html:7`); `initNav('settings', …)`; aperta a ogni utente autenticato; nessun contenuto.
- `GET /api/app-settings/terms` (`requireAuth`) restituisce l'ultima versione pubblicata da `terms_versions`: `{ version, content, updatedAt: published_at, updatedBy }` (`api/src/routes/app-settings.js:25-42`). Il contenuto è HTML scritto dal sysadmin.
- `terms.html` rende lo stesso contenuto con `v-html` (`terms.html:69`), badge versione + "Effective from: <data en-GB>" (`terms.html:66-67`, `109-112`), più la barra di accettazione con checkbox e pulsante (`terms.html:75-86`).
- Riferimenti a `settings`: `js/lib/nav-model.test.js:83-84,96`, `js/lib/nav-shell-guard.test.js:44`, `js/lib/page-head-guard.test.js:26`; `TEST_CASES.md` N-03, ST-01, ST-02, N-12; `docs/pages/settings.md`, `docs/prd/notifications.md:7,11`, `docs/js/nav.md:47-49`, `ARCHITECTURE.md:998`, tabella Pages di `CLAUDE.md`, `.claude/skills/operational-manual/SKILL.md`.

## Comportamento atteso

- Voce di menu **"Privacy Notice"** → nuova pagina **`/privacy-notice.html`**.
- Titolo `.ph`, `<title>` e breadcrumb: "Privacy Notice".
- Corpo: il contenuto dell'ultima versione pubblicata dei T&C, sola lettura, nessun checkbox/pulsante/controllo.
- In calce al testo: numero di versione e data di pubblicazione.
- `/settings.html` diventa un redirect a `/privacy-notice.html`.
- Aperta a ogni utente autenticato; non loggato → login.

## Vincoli

- Nessun nuovo endpoint: si riusa `GET /api/app-settings/terms`.
- Regole di pagina del progetto: page shell, `.ph`, `v-cloak`, `icons.js` prima di `nav.js`, `?v=N` allineati, testo in inglese, nessun hex fisso.
- Data formattata tramite `js/lib/dates.js`.
- Si mostra solo la versione pubblicata, mai la bozza.

## Criteri di accettazione

1. Menu account mostra "Privacy Notice", non più "Settings".
2. Il click apre `/privacy-notice.html`.
3. Titolo `.ph`, `<title>` e breadcrumb (`Home › Privacy Notice`) riportano "Privacy Notice".
4. Il corpo mostra lo stesso HTML di `content` di `GET /api/app-settings/terms`.
5. Nessun checkbox, pulsante o input nella pagina oltre alla navigazione.
6. In calce: versione (`version`) e data di pubblicazione (`updatedAt`).
7. Dopo la pubblicazione di una nuova versione, un reload mostra il nuovo testo, la nuova versione e la nuova data.
8. Errore di caricamento → messaggio in inglese, non pagina vuota.
9. `/settings.html` reindirizza a `/privacy-notice.html`.
10. Non loggato → `/privacy-notice.html` reindirizza al login.
11. `npm test` verde con i guard aggiornati.

## Scope escluso (confermato)

- Nessuna pagina Settings separata; `settings.html` resta solo un redirect.
- Nessuno storico versioni per l'utente.
- Nessuna stampa/download PDF.
- Nessuna modifica a `terms.html`, al gate T&C o a `_terms-editor.html`.

## Domande aperte per /brainstorming

- Id `nav-settings-btn` e nome della tab di `initNav`.
- Icona della voce di menu.
- Stile tipografico del contenuto.
- "Published by" sì/no.
- Formato della data.
