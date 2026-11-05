# Save overlay — layer bloccante "Saving changes…" durante le scritture lente — design spec

**Date:** 2026-11-05
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-05-save-overlay-brief.md`
**Scenario:** 1 (nuova feature)

Un velo a tutta pagina, stato **Saving** della tavola `docs/superpowers/design/Overlay/1a-saving.jpg`, che compare
quando una scrittura inviata con `apiFetch` è ancora in corso dopo 400 ms e blocca click e Tab finché l'ultima
scrittura non si chiude. Il design brief `docs/superpowers/design/Overlay/2026-11-04-brief-submit-overlay-claude-code.md`
vale solo dove non richiede callback o codice complesso (regola dell'utente); lo scope escluso è quello confermato nel
Brief. Nessuna modifica API.

## 1. Fatti verificati nel codice (a `e9df0cf`)

- `apiFetch` (`js/api.js:9`) non tiene traccia delle richieste in corso; ha solo un timeout di 30 s (`AbortController`).
- Il blocco del doppio click è per pagina, con flag Vue (`saving`, `loading`, `busy`, …) che disabilitano il pulsante.
- `js/api-sync.js` non scrive in background di suo: `_pushProjectToApiDetailed` (`:297`) è chiamato da
  `project-config.html:1168` (Save) e da `js/costgrid.js:1178`, `:1404` (Generate project).
- Unico salvataggio automatico: `cgAutoSave` (`js/costgrid.js:723`) → `_cgUpsertVersionToApi` (`js/api-sync.js:167`),
  che chiama `Api.costGrids.update`, `Api.costGrids.versions.update`, `Api.costGrids.versions.saveStructure`
  (`js/api.js:126`, `:131`). Chiamato dal timer di `cgScheduleAutoSave` (`js/costgrid.js:747`), dopo modifiche ai campi
  (`costgrid.html:1445`, `:1449`, `:1533`, `:1886`, `:1960`; `js/costgrid.js:1435`, `:1472`), da `cgSaveVersion` (`:760`),
  da `cgPublishDraft` e, con `strict = true`, prima di clona/nuova versione (`:856`, `:1000`).
- `js/notifications.js:129`, `:150` chiamano `apiFetch` con `PATCH` per "segna come letta".
- I test vitest caricano già gli script classici (es. `js/lib/api-sync-upsert.test.js`): `api.js` e `nav.js` si testano
  direttamente.

## 2. Componente — `js/nav.js`, `css/style.css`, `css/tokens.css`

- `initNav` inietta una sola volta, in fondo a `<body>` (fuori da ogni root Vue e da `#app-shell`), `#pd-save-overlay`:
  barra di avanzamento, pannello con spinner, titolo e messaggio. Nascosto di default.
- `window.PdOverlay.show({ title, message } = {})` / `window.PdOverlay.hide()`. Default: "Saving changes…" /
  "Please don't close this page." `show` su overlay già visibile aggiorna solo i testi.
- `show`: ricorda `document.activeElement`; mette `inert` su ogni figlio diretto di `<body>` tranne l'overlay **che non
  lo aveva già**, e ricorda quali; aggiunge a `body` una classe che blocca lo scroll (`overflow: hidden` su `body`, mai su
  `#app-shell`/`#app-main`).
- `hide`: toglie `inert` solo dagli elementi che aveva marcato, toglie la classe, rimette il focus sull'elemento
  ricordato se è ancora nel documento.
- Pannello: `role="status"`, `aria-live="polite"`.
- Stile secondo il design brief §4–§6 e §8, solo stato Saving:
  - layer `position: fixed; inset: 0`, `z-index: var(--z-blocking)`, cattura tutti i pointer event, velo navy al 55 %;
  - dissolvenza 150 ms solo su `opacity`;
  - barra 3 px in alto, traccia magenta 25 %, segmento magenta 35 % che scorre in 1,2 s `ease-in-out`;
  - pannello centrato, 340 px (max `calc(100vw - 32px)`), `--surface-white`, `--radius-lg`, padding 24/24/22, colonna
    centrata con gap 10 px;
  - spinner `.spinner-border` 28 px, bordo 3 px, traccia `--overlay-spinner-track`, segmento `--brand-magenta`, 0,8 s;
  - titolo 15 px / 700 / `--brand-navy`; messaggio 12,5 px, interlinea 1,5, `--text-muted`, `text-wrap: pretty`;
  - ≤ 767 px: pannello ancorato in basso con margine 16 px, larghezza `calc(100% - 32px)`, padding 24/18/16, messaggio
    13 px.
  - `prefers-reduced-motion: reduce`: niente dissolvenza, barra nascosta, spinner fermo.
- Token nuovi in `css/tokens.css`: `--z-blocking: 1090`, `--overlay-scrim` (`rgba(11, 24, 64, .55)`),
  `--overlay-spinner-track` (`#FBD3E3`), `--overlay-progress-track` (`rgba(240, 40, 122, .25)`), `--shadow-overlay`
  (`0 20px 60px rgba(0,0,0,.25)`). Nessun hex fuori da `tokens.css`.

## 3. Quando compare — `js/api.js`

- Una scrittura è una richiesta con `method` `POST`/`PUT`/`PATCH`/`DELETE` e senza `options.background === true`.
  `background` non viene inoltrato a `fetch`.
- `apiFetch` incrementa un contatore all'inizio della scrittura e lo decrementa in un `finally` che copre successo,
  errore HTTP, errore di rete, timeout e 401.
- Contatore 0 → 1: parte un timer di 400 ms; allo scadere, se il contatore è > 0, `window.PdOverlay?.show()`.
- Contatore → 0: annulla il timer se ancora pendente e chiama `window.PdOverlay?.hide()`.
- Senza `window.PdOverlay` (pagine senza `nav.js`) non succede nulla.

## 4. Scritture in background

- `js/notifications.js`: le due `PATCH` passano `{ background: true }`.
- `Api.costGrids.update`, `Api.costGrids.versions.update`, `Api.costGrids.versions.saveStructure` accettano un ultimo
  argomento opzionale `opts` e ne inoltrano `background` ad `apiFetch`. Firma attuale invariata per chi non lo passa.
- `_cgUpsertVersionToApi(cgId, versionId, opts)` inoltra `opts.background` alle tre chiamate.
- `cgAutoSave(strict, { background } = {})`: `background` vale `true` per default, salvo `strict === true` (default
  `false`). Lo passano esplicitamente `false`: `cgSaveVersion` e `cgPublishDraft`. Tutte le altre chiamate restano
  invariate, quindi in background.

## 5. Test

- `js/lib/save-overlay-trigger.test.js` (carica `js/api.js`, `fetch` finto, timer finti, `PdOverlay` finto): nessun
  `show` prima di 400 ms; `show` dopo; due scritture sovrapposte → un solo `show`, `hide` solo alla chiusura della
  seconda; `hide` anche quando la scrittura fallisce o va in timeout; GET e `background: true` non contano; risposta
  in meno di 400 ms → né `show` né lampeggio; `background` non arriva a `fetch`.
- `js/lib/save-overlay-component.test.js` (jsdom, carica `js/nav.js`): `show` mette `inert`
  sui figli di `body` tranne l'overlay; un `inert` già presente resta dopo `hide`; il focus torna all'elemento di
  partenza.
- Un test su `cgAutoSave`: chiamata di default → `background: true` sulle chiamate API; `cgSaveVersion` e `strict` →
  nessun `background`.
- `TEST_CASES.md`: un caso manuale con rete rallentata.
- I guard esistenti (`nav-shell-guard`, `foundations-guard`, `tokens.test.js`, `nav-model.test.js`) restano verdi.

## 6. Cache-busting

- Bump coerente di ogni `?v=N` di `js/api.js`, `js/nav.js`, `js/notifications.js`, `js/costgrid.js`, `js/api-sync.js`,
  `css/style.css`, `css/tokens.css`.

## 7. Verifica visiva

Una sola, con `scripts/shoot.mjs` e `--eval "PdOverlay.show()"` su `master-clients.html` a 1440, 1024 e 390 px,
confrontata con le tavole 1a, 1e e la disposizione di 1f.

## 8. Fuori scope

Quello confermato nel Brief (a–g): stati 1b/1c/1d, `aria-busy` sul form, pagine con `fetch` diretto (rimandate al loro
redesign, voce in `docs/BACKLOG.md`), `_db-reset.html`/`_terms-editor.html`, pagine pubbliche, chiamate di
`planning.html`, guardie e spinner esistenti nelle pagine.

## Criteri di accettazione

1. **Overlay su Save lento** — con la rete rallentata, Save su `master-clients`, `master-pipelines`, `master-roles`,
   `master-currencies`, `project-config`, `costgrid` (Save version), `pipeline`, `timesheets` (upload) e sulle modali
   di `nav.js` mostra lo stato Saving di 1a e scompare a salvataggio concluso.
2. **Niente lampeggio** — con risposta veloce non compare nessun overlay.
3. **Pagina bloccata** — con l'overlay visibile, click su sidebar, pulsanti di pagina e pulsanti di una modale aperta
   non hanno effetto, e Tab non porta il focus dietro l'overlay.
4. **Errori invariati** — un salvataggio rifiutato (es. `MONEY_RULE`) o a server fermo chiude l'overlay e mostra
   l'errore della pagina come oggi.
5. **Autosave libero** — scrivendo nell'editor cost grid con la rete rallentata l'overlay non compare; cliccando una
   notifica non compare.
6. **Responsive** — a 1024×768 copre la sidebar a icone (1e); a 390×844 il pannello è ancorato in basso con 16 px di
   margine.
7. **Reduced motion** — niente dissolvenza, niente barra, spinner fermo.
8. **Test** — i test di §5 esistono e `npm test` è verde.
9. **Token** — nessun hex aggiunto fuori da `css/tokens.css`.
10. **Backlog** — `docs/BACKLOG.md` porta la voce sulle pagine con `fetch` diretto (`admin.html`, `team.html`,
    `attribute-lists.html`, `profile-jobs.html`, `terms.html`, `js/tags.js`) da portare su `apiFetch` nel loro redesign.

## Decisioni aperte

1. **L'overlay scatta da solo in `apiFetch`, le scritture in background si dichiarano.** Alternativa scartata: chiamare `PdOverlay.show/hide` da ogni gestore di Save (design brief §9). Perché: le scritture in background sono due gruppi, i gestori di Save decine su 9 pagine.
2. **`background` viaggia come argomento fino ai tre wrapper di `Api.costGrids`.** Alternativa scartata: un flag globale attivo durante la chiamata. Perché: `_cgUpsertVersionToApi` fa più `await` in sequenza e un flag globale si spegnerebbe prima della seconda chiamata.
3. **Ogni `cgAutoSave` è in background salvo Save version, i flush `strict` e Publish draft.** Alternativa scartata: overlay anche sui salvataggi dopo modifiche ai campi. Perché: con rete lenta bloccherebbe l'editor a ogni modifica.
4. **Ritardo di 400 ms.** Alternativa scartata: overlay immediato o dopo 1 s. Perché: immediato lampeggia a ogni salvataggio, 1 s lascia troppo tempo senza segnale.
5. **`--z-blocking: 1090`.** Alternativa scartata: il 1080 del design brief. Perché: 1080 coincide con il tooltip di Bootstrap.
6. **`inert` su tutti i figli di `<body>` tranne l'overlay.** Alternativa scartata: `inert` sul solo `#app-shell` (design brief §4). Perché: le modali Bootstrap stanno fuori da `#app-shell`.
7. **Un salvataggio da una modale mostra l'overlay sopra la modale.** Alternativa scartata: escludere le modali. Perché: comportamento uniforme, nessun codice per riconoscerle.
8. **Il componente sta in `nav.js`.** Alternativa scartata: un file nuovo. Perché: `nav.js` inietta già le modali condivise e un file nuovo vorrebbe un `<script>` in più in ogni pagina.
