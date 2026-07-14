# Brief — Migrare terms.html a Vue 3

**Scenario:** 2 — Evoluzione di una feature esistente.
**Fonte:** Livello 1 della roadmap, `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md`.

## Comportamento attuale

`terms.html` (142 righe) è una pagina Vanilla JS standalone, self-contained — nessun `<script src="js/*.js">` esterno oltre CSS condiviso (`css/tokens.css`), nessuna chiamata a `initNav()` (per design: pagina di sola accettazione T&C, mostrata prima che l'utente entri nell'app, per `ARCHITECTURE.md:704`).

- **Parametro URL**: legge `next` da query string, default `/pipeline.html` (`terms.html:87-88`).
- **Caricamento iniziale** (IIFE async, `:95-109`): `GET /api/app-settings/terms` con `credentials: 'include'`. Su risposta `401`, redirect a `/login.html` (`:98`). Su successo, popola `#versionLabel` con `'v' + d.version` (`:100`), `#effectiveDate` con la data formattata `en-GB` se `d.updatedAt` esiste, altrimenti stringa vuota (`:101-104`), e `#termsBody` con `d.content` via `innerHTML` (`:105`). Su qualunque altro errore, mostra un messaggio di fallback in `#termsBody` (`:106-108`).
- **Checkbox "I have read..."** (`#chkRead`, `:75-76`): il bottone Accept (`#btnAccept`) parte disabilitato (`:112-113`); l'evento `change` sulla checkbox abilita/disabilita il bottone e nasconde il messaggio d'errore (`:115-119`).
- **Click su Accept** (`:121-139`): disabilita il bottone, cambia testo in "Saving…" (`:122-123`), `POST /api/auth/accept-terms` con `credentials: 'include'` (`:125-128`). Su `401`, redirect a `/login.html` (`:129`). Su risposta non-ok, lancia errore. Su successo, redirect a `next` (`:131`). Su qualunque errore (fetch fallita o risposta non-ok), riabilita il bottone, ripristina il testo originale, mostra `#errMsg` (`:132-138`).

## Comportamento atteso

**Porting 1:1** — confermato con l'utente: stessa UI, stesse chiamate API, stesso flusso; cambia solo l'implementazione, da Vanilla JS a Vue 3. Nessuna modifica funzionale o visiva.

Segue il pattern già stabilito dalle pagine Vue esistenti (`login.html`, `activate.html`, `reset-password.html`): `<div id="app">` come template, `Vue.createApp({ data(), methods(), mounted() }).mount('#app')` in un unico `<script>` nella pagina stessa — nessun nuovo file `js/*.js` creato per questa pagina, coerente con `login.html` che non carica un file JS proprio separato (verificato: `login.html:101-103`, `Vue.createApp({...})` inline dopo il caricamento di `vue.global.prod.js` da CDN).

## Vincoli

- **Vue 3 via CDN, nessun build step** — vincolo di progetto confermato nel Brief della roadmap (`2026-07-14-vue-migration-roadmap-brief.md`), coerente con le pagine Vue già esistenti.
- Nessuna nuova dipendenza `js/*.js` per questa pagina — la logica resta interamente dentro `terms.html`, come per `login.html`.
- Nessuna chiamata a `initNav()` — la pagina resta standalone, come oggi.
- Stessi due endpoint API, stessi payload/credenziali (`GET /api/app-settings/terms`, `POST /api/auth/accept-terms`, entrambi con `credentials: 'include'`).
- Il redirect su `401` (in entrambe le chiamate) verso `/login.html` e il redirect su successo verso il parametro `next` (default `/pipeline.html`) devono restare identici.
- **Limite di verifica ambientale**: nginx (`pdash-nginx`) serve sempre il checkout `main`, mai un worktree — questa pagina non sarà visibile via browser prima del merge (vedi nota nel report del ciclo precedente, `docs/superpowers/reports/2026-07-14-vue-migration-roadmap-tier1-prep-finish-cycle.md`, sezione Roadmap notes). La verifica manuale andrà pianificata per dopo il merge, non prima.

## Criteri di accettazione

- [ ] `terms.html` usa Vue 3 (CDN, `Vue.createApp(...).mount('#app')`), stesso pattern di `login.html`.
- [ ] Al caricamento, badge versione ed effective date si popolano identicamente a oggi (via `GET /api/app-settings/terms`).
- [ ] Il contenuto T&C viene renderizzato identicamente (stesso rendering HTML fornito dal server).
- [ ] Un `401` sulla fetch iniziale reindirizza a `/login.html`, come oggi.
- [ ] Il bottone Accept resta disabilitato finché la checkbox non è spuntata; il comportamento di abilitazione/disabilitazione è identico.
- [ ] Click su Accept: il bottone mostra "Saving…", esegue `POST /api/auth/accept-terms`, reindirizza a `next` (default `/pipeline.html`) al successo.
- [ ] In caso di fallimento (non-401, risposta non-ok o errore di rete): il bottone si riabilita, il testo torna quello originale, viene mostrato il messaggio d'errore — identico a oggi.
- [ ] Un `401` sul click Accept reindirizza anch'esso a `/login.html`.
- [ ] Nessuna `initNav()`/navbar iniettata — la pagina resta standalone.
- [ ] Aspetto visivo (header, card, confirm bar, stili) invariato.

## Scope escluso esplicitamente

*(confermato con l'utente)*

- Modifiche alle API `/api/app-settings/terms` e `/api/auth/accept-terms` — stessi endpoint, stesso payload.
- Redesign visivo/UX oltre al cambio di framework — stesso CSS, stesso layout.
- Fix del rendering `innerHTML` del contenuto T&C (`terms.html:105`, nessuna sanitizzazione) — comportamento preesistente, non toccato in questo porting 1:1; segnalato come possibile finding futuro per un audit dedicato, non risolto qui.
- Aggiunta di `initNav()`/navbar — la pagina resta standalone, comportamento architetturale intenzionale.
- Migrazione di qualunque altra pagina del Livello 1/Livello 2 della roadmap — solo `terms.html` in questo ciclo.

## Domande aperte per `/brainstorming`

- Il pattern Vue di `login.html` usa `data()`/`methods()` senza `mounted()` esplicito (il fetch iniziale è un IIFE fuori da `createApp`, non nel lifecycle Vue) — per `terms.html`, conviene mantenere lo stesso schema (IIFE esterno) o spostare il fetch iniziale dentro `mounted()` per maggiore idiomaticità Vue? Impatto minimo sul comportamento, ma è una decisione di stile da fissare esplicitamente per coerenza con le migrazioni successive del Livello 1/2.
- Come gestire concretamente la verifica manuale post-merge (vincolo ambientale sopra) — va aggiunto un passo esplicito nel piano che ricorda di verificare dopo il Gate 4 di `/finish-cycle`, invece che nel Gate 2 standard?

Brief ready. Next step: /brainstorming.