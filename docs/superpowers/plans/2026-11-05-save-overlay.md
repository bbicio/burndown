# Save overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-05-save-overlay-design.md`
**Branch:** `save-overlay`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/api.js`, `js/nav.js`, `css/style.css`, `css/tokens.css` da tutte le pagine autenticate)

**Goal:** un velo bloccante "Saving changes…" (tavola 1a) che compare quando una scrittura via `apiFetch` dura più di 400 ms, escluse le scritture dichiarate `background`.

**Architecture:** `js/nav.js` definisce `window.PdOverlay` (`show`/`hide`, markup creato una volta in fondo a `<body>`, `inert` sui fratelli, scroll lock). `js/api.js` conta le scritture non-background in corso e chiama `PdOverlay.show()` dopo 400 ms e `hide()` quando il conto torna a zero. `background: true` viaggia da `cgAutoSave` → `_cgUpsertVersionToApi` → tre wrapper `Api.costGrids` → `apiFetch`, e dalle due `PATCH` di `js/notifications.js`.

**Tech Stack:** script classici senza build, Bootstrap 5, vitest + jsdom, `scripts/shoot.mjs`.

**Tasks independent?** No: il Task 3 consuma l'opzione `background` del Task 2, il Task 4 versiona i file dei Task 1–3.

## Global Constraints

- Copy esatta: titolo `Saving changes…`, messaggio `Please don't close this page.` (carattere `…`, non tre punti).
- Ritardo `400` ms; `--z-blocking: 1090`; dissolvenza 150 ms su `opacity`; barra 3 px, segmento 35 %, 1.2 s `ease-in-out`; spinner 28 px, bordo 3 px, 0.8 s; pannello 340 px (max `calc(100vw - 32px)`), padding `24px 24px 22px`, gap 10 px; ≤ 767 px: ancorato in basso a 16 px, `calc(100% - 32px)`, padding `24px 18px 16px`, messaggio 13 px.
- Token nuovi solo in `css/tokens.css`: `--z-blocking: 1090`, `--overlay-scrim: rgba(11, 24, 64, .55)`, `--overlay-spinner-track: #FBD3E3`, `--overlay-progress-track: rgba(240, 40, 122, .25)`, `--shadow-overlay: 0 20px 60px rgba(0,0,0,.25)`. Nessun hex altrove.
- `#app-shell`/`#app-main` senza `overflow`/`transform`/`filter`/`contain`/`will-change`/`position`: lo scroll lock va su `body`.
- Firme esistenti invariate per chi non passa i nuovi argomenti opzionali.
- Cache-busting: ogni file versionato modificato sale di uno e ogni suo `?v=` nel repo sale allo stesso valore.
- Durante i task solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack; verifiche contro `scripts/test-branch.sh`.
- Le pagine HTML si modificano con l'Edit tool o `sed`, mai con `Get-Content`/`Set-Content` (BOM).

## Review Focus

1. **Corpo di risposta non JSON** (proxy che risponde con HTML): `JSON.parse` lancia dopo il `fetch`; l'overlay deve chiudersi comunque — il `finally` copre tutto il corpo di `apiFetch`, non solo il `fetch`. Test nel Task 2.
2. **Ordine hide/errore**: l'overlay deve essere già chiuso quando il `catch` del chiamante apre il suo messaggio d'errore (modale `showInfo`), altrimenti il velo copre l'errore. Test nel Task 2.
3. **Ri-armo del timer**: scrittura breve che si chiude, poi una nuova entro 400 ms → l'overlay appare 400 ms dopo l'inizio della seconda, non prima. Test nel Task 2.
4. **Stato del `body` lasciato da altri**: Bootstrap mette `modal-open` e stili inline su `body`, e un elemento può avere già `inert`; `hide()` toglie solo ciò che ha messo. Test nel Task 1.
5. **Upload con `FormData`** (`timesheets` e `project-config`): è un `POST` e deve contare. Test nel Task 2.

---

### Task 1: componente `PdOverlay` (token, CSS, `js/nav.js`)

**Files:**
- Modify: `css/tokens.css` (token di Global Constraints, vicino agli altri `--z-*` e `--shadow-*`)
- Modify: `css/style.css` (blocco nuovo `.pd-save-overlay`)
- Modify: `js/nav.js` (definizione di `PdOverlay` a livello di file + chiamata in `initNav` dopo l'iniezione delle modali condivise)
- Test: `js/lib/save-overlay-component.test.js`

**Interfaces:**
- Produces: `window.PdOverlay = { show({ title, message } = {}): void, hide(): void, isVisible(): boolean }`; `navEnsureSaveOverlay(): HTMLElement` (idempotente, crea `#pd-save-overlay` in fondo a `<body>`).
- Markup: `#pd-save-overlay.pd-save-overlay` con `hidden`; figli `.pd-save-overlay__bar`, `.pd-save-overlay__panel[role=status][aria-live=polite]` con `.spinner-border`, `.pd-save-overlay__title`, `.pd-save-overlay__msg`. Classe di stato visibile: `is-visible` sull'overlay; classe di scroll lock: `pd-save-locked` su `body`.

- [ ] **Step 1: Scrivi i test** (carica `js/nav.js` come `js/lib/nav-behavior.test.js`, con `new Function(src + 'return { PdOverlay, navEnsureSaveOverlay };')`; `beforeEach` con `body` = `#app-shell` + un `<div class="modal" id="m">` + un `<button id="b">`)

```js
it('show() renders the Saving copy and makes every other body child inert', () => {
  PdOverlay.show();
  const el = document.getElementById('pd-save-overlay');
  expect(el.hidden).toBe(false);
  expect(el.querySelector('.pd-save-overlay__title').textContent).toBe('Saving changes…');
  expect(el.querySelector('.pd-save-overlay__msg').textContent).toBe("Please don't close this page.");
  expect(document.getElementById('app-shell').inert).toBe(true);
  expect(document.getElementById('m').inert).toBe(true);
  expect(el.inert).toBe(false);
  expect(document.body.classList.contains('pd-save-locked')).toBe(true);
});
it('show({ title, message }) overrides the copy; a second show() only updates it', ...);
it('hide() keeps an inert that was already there and body classes it did not add', () => {
  document.getElementById('m').inert = true; document.body.classList.add('modal-open');
  PdOverlay.show(); PdOverlay.hide();
  expect(document.getElementById('m').inert).toBe(true);
  expect(document.getElementById('app-shell').inert).toBe(false);
  expect(document.body.classList.contains('modal-open')).toBe(true);
  expect(document.body.classList.contains('pd-save-locked')).toBe(false);
  expect(document.getElementById('pd-save-overlay').hidden).toBe(true);
});
it('hide() gives focus back to the element focused before show()', () => {
  document.getElementById('b').focus(); PdOverlay.show(); PdOverlay.hide();
  expect(document.activeElement.id).toBe('b');
});
it('hide() without a previous show() is a no-op', ...);
it('navEnsureSaveOverlay() creates the element once', () => {
  navEnsureSaveOverlay(); navEnsureSaveOverlay();
  expect(document.querySelectorAll('#pd-save-overlay').length).toBe(1);
});
it('tokens.css defines the overlay tokens and style.css uses no hex in .pd-save-overlay', ...); // legge i file con readFileSync
```

- [ ] **Step 2: Esegui** `npx vitest run js/lib/save-overlay-component.test.js` → FAIL (`PdOverlay is not defined`).

- [ ] **Step 3: Implementa** `PdOverlay` e `navEnsureSaveOverlay` in `js/nav.js` (`show` chiama `navEnsureSaveOverlay`, così funziona anche prima di `initNav`); `window.PdOverlay = PdOverlay`; `initNav` chiama `navEnsureSaveOverlay()`. Token in `tokens.css`, CSS in `style.css` coi valori di Global Constraints: layer `position: fixed; inset: 0; z-index: var(--z-blocking); background: var(--overlay-scrim)`, dissolvenza via `is-visible`, `body.pd-save-locked { overflow: hidden; }`, media query `max-width: 767.98px` per il pannello in basso, `prefers-reduced-motion: reduce` → niente transizione, barra `display: none`, spinner `animation: none`.

- [ ] **Step 4: Esegui** lo stesso comando, più `npx vitest run js/lib/nav-behavior.test.js js/lib/nav-model.test.js js/lib/nav-shell-guard.test.js js/lib/tokens.test.js js/lib/foundations-guard.test.js` → PASS.

- [ ] **Step 5: Commit** `feat(nav): PdOverlay save layer component`.

### Task 2: trigger in `apiFetch` (`js/api.js`)

**Files:**
- Modify: `js/api.js:9-43` (`apiFetch`) + nuove variabili/funzioni sopra di essa
- Test: `js/lib/save-overlay-trigger.test.js`

**Interfaces:**
- Consumes: `window.PdOverlay.show()` / `hide()` (Task 1), letti a ogni chiamata con `window.PdOverlay?.`.
- Produces: `apiFetch(path, options)` accetta `options.background` (boolean, non inoltrato a `fetch`); costante `SAVE_OVERLAY_DELAY_MS = 400`; `_isOverlayWrite(options): boolean` (metodo `POST`/`PUT`/`PATCH`/`DELETE`, case-insensitive, e `background !== true`).

- [ ] **Step 1: Scrivi i test** (carica `js/api.js` con `new Function('fetch', 'window', src + 'return { apiFetch };')`, `vi.useFakeTimers()`, `window = { PdOverlay: { show: vi.fn(), hide: vi.fn() }, location: {} }`, `fetch` finto controllabile con una promise risolta a mano)

```js
it('does not show before 400 ms and shows at 400 ms while a POST is pending', ...); // show chiamato 0 volte a 399, 1 a 400
it('never shows for a write that settles in under 400 ms', ...);                  // show 0, hide 1
it('two overlapping writes → one show, hide only after the second settles', ...);
it('hides when the write rejects, times out (30 s abort) or returns 401', ...);
it('hides when the response body is not JSON', ...);                               // Review Focus 1
it('has hidden the overlay before the caller sees the rejection', async () => {   // Review Focus 2
  // nel .catch del chiamante: expect(window.PdOverlay.hide).toHaveBeenCalled()
});
it('re-arms the delay for a write that starts right after another ended', ...);  // Review Focus 3
it('counts a FormData POST', ...);                                                 // Review Focus 5
it('ignores GET and { background: true } writes', ...);
it('does not pass background to fetch', ...);                                      // fetch.mock.calls[0][1].background === undefined
it('does nothing when window.PdOverlay is missing', ...);
```

- [ ] **Step 2: Esegui** `npx vitest run js/lib/save-overlay-trigger.test.js` → FAIL.

- [ ] **Step 3: Implementa** in `js/api.js`: contatore `_pdWritesPending`, timer `_pdOverlayTimer`; all'ingresso di una scrittura `_pdWritesPending++` e, se diventa 1, `setTimeout(() => { if (_pdWritesPending > 0) window.PdOverlay?.show(); }, SAVE_OVERLAY_DELAY_MS)`; tutto il corpo esistente dentro `try { … } finally { … }` che decrementa e, a zero, `clearTimeout` + `window.PdOverlay?.hide()`. `background` tolto da `options` prima di inoltrarlo a `fetch`.

- [ ] **Step 4: Esegui** lo stesso comando → PASS.

- [ ] **Step 5: Commit** `feat(api): show the save overlay for slow writes`.

### Task 3: scritture in background

**Files:**
- Modify: `js/api.js:120` (`costGrids.update`), `:126` (`versions.update`), `:131` (`versions.saveStructure`)
- Modify: `js/api-sync.js:167-245` (`_cgUpsertVersionToApi`)
- Modify: `js/costgrid.js:723` (`cgAutoSave`), `:768` (`cgSaveVersion`), `:795` (`cgPublishDraft`)
- Modify: `js/notifications.js:129`, `:150`
- Test: `js/lib/costgrid-autosave-toast.test.js` (estendi), `js/lib/api-sync-upsert.test.js` (estendi), `js/lib/save-overlay-trigger.test.js` (estendi per i wrapper)

**Interfaces:**
- Consumes: `apiFetch(path, { …, background })` (Task 2).
- Produces:
  - `Api.costGrids.update(id, d, opts)`, `Api.costGrids.versions.update(cgId, vId, d, opts)`, `Api.costGrids.versions.saveStructure(cgId, vId, d, opts)` — `opts?.background` inoltrato ad `apiFetch`.
  - `_cgUpsertVersionToApi(cgId, versionId, opts)` — `opts.background` passato come `{ background }` alle tre chiamate.
  - `cgAutoSave(strict = false, { background = !strict } = {})` — passa `background` in `_cgUpsertVersionToApi` accanto a `strict`/`onPatched`/`onServerRate`.

- [ ] **Step 1: Scrivi i test**

```js
// costgrid-autosave-toast.test.js
it('a default cgAutoSave() upserts with background: true', ...);           // upsert.mock.calls[0][2].background === true
it('cgAutoSave(true) upserts without background', ...);                    // === false
it('cgAutoSave(false, { background: false }) upserts without background', ...);
it('cgSaveVersion and cgPublishDraft call cgAutoSave with background: false', () => {
  // lettura del sorgente: extractBlock(js, 'async function cgSaveVersion(') contiene "cgAutoSave(false, { background: false })"; idem cgPublishDraft
});
// api-sync-upsert.test.js
it('forwards opts.background to costGrids.update, versions.update and versions.saveStructure', ...);
// save-overlay-trigger.test.js
it('Api.costGrids.versions.update(..., { background: true }) does not show the overlay', ...);
it('the notifications mark-read PATCHes pass background: true', ...);     // lettura del sorgente di js/notifications.js
```

- [ ] **Step 2: Esegui** `npx vitest run js/lib/costgrid-autosave-toast.test.js js/lib/api-sync-upsert.test.js js/lib/save-overlay-trigger.test.js` → FAIL sui test nuovi.

- [ ] **Step 3: Implementa** le firme dell'Interfaces block; `cgSaveVersion` e `cgPublishDraft` chiamano `cgAutoSave(false, { background: false })`; le due `PATCH` di `js/notifications.js` aggiungono `background: true`. Nessun'altra chiamata a `cgAutoSave` cambia.

- [ ] **Step 4: Esegui** lo stesso comando più i test esistenti di `js/lib/costgrid-*.test.js` e `js/lib/api-sync-*.test.js` → PASS.

- [ ] **Step 5: Commit** `feat(costgrid): keep autosave and notification writes out of the save overlay`.

### Task 4: versioni, casi di test, backlog, verifica visiva

**Files:**
- Modify: ogni `.html` che referenzia con `?v=` `js/api.js`, `js/nav.js`, `js/notifications.js`, `js/costgrid.js`, `js/api-sync.js`, `css/style.css`, `css/tokens.css` (elenco con `grep -rn "<path>?v=" --include=*.html .`, esclusi `node_modules`, `.claude`, `docs`)
- Modify: `TEST_CASES.md` (nuova riga nella sezione della navigazione condivisa, ID successivo libero)
- Modify: `docs/BACKLOG.md` (voce `B-<prossimo>`)

- [ ] **Step 1: Bump** di ogni file versionato modificato, `N` attuale + 1, in tutti i suoi riferimenti; controlla con `grep -rhoE "js/api\.js\?v=[0-9]+" --include=*.html . | sort | uniq -c` (una sola riga per file).
- [ ] **Step 2: `TEST_CASES.md`** — caso "Save overlay on a slow write": DevTools → Network → Slow 3G; Save su `master-clients.html` → dopo ~0,4 s velo navy + barra + pannello "Saving changes…"; click su sidebar e Tab senza effetto; a salvataggio concluso il velo sparisce; scrivere in `costgrid.html` non lo mostra.
- [ ] **Step 3: `docs/BACKLOG.md`** — "Pagine con `fetch` diretto (`admin.html`, `team.html`, `attribute-lists.html`, `profile-jobs.html`, `terms.html`, `js/tags.js`): portarle su `apiFetch` nel loro ciclo di redesign, così ricevono il save overlay."
- [ ] **Step 4: Esegui** `npx vitest run js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js js/lib/money-guard.test.js js/lib/dates-guard.test.js scripts/doc-paths-guard.test.js` → PASS.
- [ ] **Step 5: Verifica visiva** su `scripts/test-branch.sh up`: `node scripts/shoot.mjs` (invocazione e credenziali in `docs/scripts/shoot.md`) su `master-clients.html` a 1440, 1024, 390 con `--eval "PdOverlay.show()"`; rileggi i PNG e confrontali con `docs/superpowers/design/Overlay/1a-saving.jpg`, `1e-tablet-saving.jpg` e il layout di `1f-mobile-couldnt-save.jpg` (pannello in basso); riporta le differenze.
- [ ] **Step 6: Commit** `chore: bump cache versions, test case and backlog entry for the save overlay`.

## Decisioni aperte

1. **`PdOverlay.show()` crea il markup se manca, e `initNav` lo crea comunque.** Alternativa scartata: crearlo solo in `initNav`. Perché: una scrittura partita prima che `initNav` finisca non trova l'elemento.
2. **`background` vale `!strict` per default in `cgAutoSave`.** Alternativa scartata: `true` sempre, con `false` passato a mano anche dai flush `strict`. Perché: i flush `strict` (prima di clona e nuova versione) sono sempre azioni esplicite, e così le loro due chiamate restano invariate.
3. **Il test di `cgSaveVersion`/`cgPublishDraft` legge il sorgente.** Alternativa scartata: eseguirle con stub. Perché: dipendono da DOM e `showConfirm`, e il comportamento da fissare è solo l'argomento passato.
