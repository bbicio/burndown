# master-pipelines.html — form nel drawer laterale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-05-master-pipelines-form-drawer-design.md`
**Branch:** `master-pipelines-form-drawer`
**Risk class:** high-risk — money o valute (il campo importo del POT e il suo flusso `readMoneyInput` si spostano nel drawer); nel dubbio la classe più alta (§6.1b)

**Goal:** Nuovo anno, nuovo POT ed Edit target si aprono nel drawer laterale di `master-pipelines.html` invece che come righe della tabella o bottom sheet.

**Architecture:** Il drawer dei dettagli del POT diventa l'unico pannello laterale, con quattro viste scelte dal computed `drawerView`; la decisione di chiusura è la funzione pura `mdpDrawerDismiss` in `js/lib/master-pipelines.js`. `savePot()`/`createPipelineYear()` e i binding degli input non cambiano.

**Tech Stack:** Vue 3 da CDN (nessun build), ES module puro + vitest.

**Tasks independent?** No: il Task 2 consuma la funzione del Task 1, il Task 3 lavora sul markup prodotto dal Task 2.

## Global Constraints

- Nessuna API, migrazione o cambio di URL (`parseMdpUrl`/`buildMdpUrl` invariati).
- `savePot()`, `createPipelineYear()`, `onPotAmountFocus/Blur`, gli stati `pyf`/`potf` e i binding pinnati da `js/lib/master-pipelines-pot-input-guard.test.js` restano invariati.
- Testi, hint, messaggi di errore e `:disabled` dei form identici a oggi (Spec §4.1).
- Solo token CSS, nessun esadecimale (`master-data-guard.test.js`); testi utente in inglese.
- Cache-busting: `js/lib/master-pipelines.js?v=1` → `?v=2` in `master-pipelines.html:943`, unico riferimento (`grep -rn "master-pipelines.js?v=" --include=*.html .`).
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM).
- Durante i task solo i file di test toccati: `npx vitest run js/lib/master-pipelines.test.js js/lib/master-data-guard.test.js js/lib/master-pipelines-pot-input-guard.test.js`; la suite completa gira in `/finish-cycle`.
- Boards: `docs/superpowers/design/MD-Pipeline-Pots/` (mappa nella Spec §5).

## Review Focus

1. **Matita di un POT mentre i dettagli di un altro sono aperti** — non può succedere da tavolo (lo scrim copre la tabella), ma `openPotForm(pot)` con `drawerPot` di un altro POT mostrerebbe il form a 560px sopra dettagli sbagliati: `openPotForm` dal pulsante della riga chiama prima `closeDrawer()` se `drawerPot` esiste e non è quel POT; guard nel Task 2 (`row pencil closes another POT's details`).
2. **Esc mentre un `cg-select` è aperto nel form New POT** — Esc chiude il drawer insieme al menu; accettato come per master-clients, nessun test (da verificare a mano nel Task 3).
3. **Doppio Enter sull'importo durante un salvataggio** — il bottone è disabilitato da `potf.loading`, `@keydown.enter` no: comportamento di oggi, invariato e fuori scope (Spec esclusione c); nessun test.
4. **Back del browser con Edit target aperto dai dettagli** — `applyState()` chiude `potf` e torna allo stato dell'URL precedente; coperto dal guard "applyState closes pyf" più il già esistente `this.potf.show = false` (Task 2).
5. **Errore server nel salvataggio dai dettagli** — `potf.error` resta visibile nella vista form, il drawer non torna ai dettagli; coperto dal criterio 3 (verifica manuale, Task 3).

---

### Task 1: `mdpDrawerDismiss` e caratterizzazione dei form

**Files:**
- Modify: `js/lib/master-pipelines.js` (nuovo export + bridge `window`)
- Test: `js/lib/master-pipelines.test.js`, `js/lib/master-data-guard.test.js`

**Interfaces:**
- Produces: `mdpDrawerDismiss({ pyfShow, potfShow, hasDetails, loading, closeAll }) → 'none' | 'close-form' | 'back-to-details' | 'close-drawer'`, anche come `window.mdpDrawerDismiss`.

- [ ] **Step 1: Test di caratterizzazione** in `master-data-guard.test.js`, nuovo `it('pins the form texts and rules that move into the drawer', …)` nel `describe('Pipelines & POTs responsive styles')`, con `expect(html).toContain(x)` per ognuna di queste stringhe:
  `"Enter a valid year (2000–2100)."`, `` "`Pipeline ${year} already exists.`" ``, `"Reason for change is required when updating a POT."`, `"Select a target."`, `"Created hidden: show it when POTs are ready."`, `"All clients of the group count towards one target."`, `':disabled="potf.loading || !potf.targetId || !String(potf.amountText).trim()"'`, `':disabled="potf.loading || !potf.note || !potf.note.trim() || !String(potf.amountText).trim()"'`.
- [ ] **Step 2: Eseguirlo** — `npx vitest run js/lib/master-data-guard.test.js` → PASS sul codice di oggi (è una caratterizzazione: se fallisce, correggere la stringa del test, non la pagina).
- [ ] **Step 3: Test unit** in `master-pipelines.test.js`, `describe('mdpDrawerDismiss')`, un `it` per riga:

  | input | atteso |
  |---|---|
  | `{ potfShow: true, hasDetails: true, loading: true }` | `'none'` |
  | `{ pyfShow: true, loading: true, closeAll: true }` | `'none'` |
  | `{ potfShow: true, hasDetails: true, closeAll: true }` | `'close-drawer'` |
  | `{ hasDetails: true }` | `'close-drawer'` |
  | `{ potfShow: true, hasDetails: true }` | `'back-to-details'` |
  | `{ potfShow: true }` | `'close-form'` |
  | `{ pyfShow: true }` | `'close-form'` |
  | `{ pyfShow: true, closeAll: true }` | `'close-drawer'` |
  | `{}` | `'none'` |
- [ ] **Step 4: Eseguirlo** — `npx vitest run js/lib/master-pipelines.test.js` → FAIL (`mdpDrawerDismiss` non esportata).
- [ ] **Step 5: Implementare** `export function mdpDrawerDismiss({ pyfShow = false, potfShow = false, hasDetails = false, loading = false, closeAll = false } = {})` in `js/lib/master-pipelines.js`, con l'ordine delle regole della Spec §3, e aggiungerla al `Object.assign(window, …)`.
- [ ] **Step 6: Eseguire** `npx vitest run js/lib/master-pipelines.test.js js/lib/master-data-guard.test.js` → PASS.
- [ ] **Step 7: Commit** — `git add js/lib/master-pipelines.js js/lib/master-pipelines.test.js js/lib/master-data-guard.test.js && git commit -m "test(master-pipelines): mdpDrawerDismiss + characterization of the moving forms"`

### Task 2: Form nel drawer, righe inline e bottom sheet rimossi

**Boards:** `docs/superpowers/design/MD-Pipeline-Pots/10.4b-new-year-inline.jpg`, `10.4d-new-pot-inline.jpg`, `10.4e-edit-target.jpg`, `10.4f-pot-detail-drawer.jpg`, `10.4g-tablet-smartphone.jpg` — aprirle e confrontare il markup: stessi controlli, testi e ordine dei campi, ma impilati in un drawer (scostamento voluto, Spec §5); il drawer dei dettagli di 10.4f resta identico.

**Files:**
- Modify: `master-pipelines.html` (CSS `:50-51`, `:223-240`, `:268`, `:283`; markup `:350-379`, `:549-651`, `:784-905`; JS `data`, `computed`, `mounted` `:1102-1106`, `openPyForm`, `openPotForm`, `applyState`, `editFromDrawer`; script tag `:943`)
- Test: `js/lib/master-data-guard.test.js`

**Interfaces:**
- Consumes: `window.mdpDrawerDismiss` (Task 1).
- Produces: computed `drawerView` (`'year' | 'newPot' | 'editPot' | 'details' | null`), metodo `dismissDrawer(closeAll)`, `ref="potfAmount"` sull'importo, classi `.mdp-drawer.is-form`, `.mdp-dr-foot-actions`.

- [ ] **Step 1: Guard strutturale** in `master-data-guard.test.js`, `it('opens the new-year, new-POT and edit-target forms in the side drawer, not inside the tables', …)`:
  - `expect(html).not.toContain('mdp-new')`; `expect(html).not.toContain('mdp-sheet')`;
  - per `ref="pyfInput"`, `@click="createPipelineYear"`, `@click="savePot"`, `ref="potfAmount"`: una sola occorrenza in `html`, e contenuta nello slice da `'<div v-if="drawerView" class="mdp-drawer-wrap">'` a `'</div><!-- /drawer -->'`;
  - ogni `<table class="mdp-table` … `</table>` non contiene `pyf.show` né `potf.show`;
  - lo slice `async editFromDrawer(pot)` … `fmtDate(` non contiene `this.go(`;
  - lo slice `async applyState(` … `} else if (!this.loadOk)` contiene `this.pyf.show = false`;
  - `html` contiene `window.mdpDrawerDismiss(` e `js/lib/master-pipelines.js?v=2`, non `master-pipelines.js?v=1`;
  - Review Focus 1: lo slice `openPotForm(pot) {` … `// Focus shows` contiene `this.closeDrawer()`.
  - nel test esistente "phone: touch targets are 44px…" aggiungere `'.mdp-dr-foot-actions .btn'` alla lista dei selettori.
- [ ] **Step 2: Eseguirlo** — `npx vitest run js/lib/master-data-guard.test.js` → FAIL.
- [ ] **Step 3: Markup e CSS** secondo la Spec §2:
  - wrapper `v-if="drawerView"`, `<aside class="mdp-drawer" :class="{ 'is-form': drawerView !== 'details' && !drawerPot }" :aria-label="…titolo della vista…">`;
  - header per vista (tabella Spec §2); `.mdp-dr-back`, `.mdp-dr-edit-top`, `.mdp-dr-more` e `.mdp-dr-bar` solo con `drawerView === 'details'`; il ✕ chiama `dismissDrawer(true)` e in vista form ha una classe che lo tiene visibile su telefono (la regola `:283` nasconde solo `.mdp-dr-close` dei dettagli);
  - corpi form: gli input di oggi (stessi attributi e binding; `@keydown.esc` rimosso, ora lo gestisce l'handler globale) dentro `.mdp-field`. L'importo è **un solo `<input ref="potfAmount">`** dentro il wrapper `.mdp-amount` con il simbolo, condiviso da New POT ed Edit target: label "Target" o "New target (€)" e placeholder secondo `potf.id`. Toggle client/group e `cg-select` solo in New POT; Reason for change e "Current €…" solo in Edit target;
  - footer `.mdp-dr-foot-actions` (come `.cg-dr-foot` di `master-clients.html:86`): Cancel → `dismissDrawer(false)`, primario Create / Create / Update target con i `:disabled` di oggi;
  - scrim → `dismissDrawer(false)`;
  - CSS: `.mdp-drawer.is-form { width: min(440px, 100vw); }`, footer, rimozione `.mdp-new*`, `.mdp-sheet*`, `.mdp-new .btn`; sotto 768px `.mdp-dr-foot-actions .btn { min-height: 44px; }`;
  - tabelle tornano a `v-if="sortedYears.length"` / `v-if="pots.length"`; tolte le tre `<tr class="mdp-new">`, il bottom sheet e l'`is-on` della matita;
  - script tag `js/lib/master-pipelines.js?v=2`.
- [ ] **Step 4: JS:**
  - computed `drawerView()` con l'ordine della Spec §2;
  - `dismissDrawer(closeAll)`: chiama `window.mdpDrawerDismiss({ pyfShow: this.pyf.show, potfShow: this.potf.show, hasDetails: !!this.drawerPot, loading: this.pyf.loading || this.potf.loading, closeAll })` e applica l'esito (Spec §3);
  - Esc in `mounted()`: `if (e.key !== 'Escape' || !this.drawerView) return;` poi il controllo `.modal.show` di oggi, poi `this.dismissDrawer(false)`;
  - `openPotForm(pot)`: se `pot && this.drawerPot && this.drawerPot.id !== pot.id`, `this.closeDrawer()` prima di aprire; focus su `$refs.potfAmount` in `$nextTick`;
  - `editFromDrawer(pot)`: solo `this.openPotForm(pot)`; la barra del telefono chiama `editFromDrawer(drawerPot)`;
  - `applyState()`: `this.pyf.show = false;` accanto a `this.potf.show = false;`.
- [ ] **Step 5: Eseguire** `npx vitest run js/lib/master-data-guard.test.js js/lib/master-pipelines-pot-input-guard.test.js js/lib/master-pipelines.test.js` → PASS (compreso il test di caratterizzazione del Task 1).
- [ ] **Step 6: Confronto con le tavole** — aprire le tavole elencate in **Boards** e annotare nel commit body ogni scostamento oltre all'impilamento voluto.
- [ ] **Step 7: Commit** — `git add master-pipelines.html js/lib/master-data-guard.test.js && git commit -m "feat(master-pipelines): new year, new POT and edit target open in the side drawer"`

### Task 3: Verifica visiva, caso di test manuale, docs della pagina

**Boards:** come il Task 2.

**Files:**
- Modify: `TEST_CASES.md` (riga MD-15), `docs/pages/config.md` (sezione "Pipelines & POTs")

- [ ] **Step 1: Scatti** — da worktree: `scripts/test-branch.sh up`, poi `node scripts/shoot.mjs --base http://localhost:8081 --url "/master-pipelines.html" --out shots/mdp-year --widths 1440,390 --settle 3000 --eval "<click + Add year>"`, e lo stesso per `?year=2026` con `+ New POT`, con la matita della prima riga, e per `?year=2026&pot=<id>` con "Edit target" (opzioni `--eval`: `docs/scripts/shoot.md`). Rileggere ogni PNG con `Read` e confrontarlo con le tavole; presentare all'utente gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra (PROCESS.md §6.6.5).
- [ ] **Step 2: `TEST_CASES.md` MD-15** — sostituire nella colonna dei passi "press Add year, type 2028 and Create" con "press Add year: the side drawer opens with the next year selected; type 2028 and Create", e "on 390px open a POT and use Edit target" con "on 390px open a POT and use Edit target: the form replaces the details in the full-screen drawer, Cancel returns to the details"; nell'esito sostituire "Edit target opens a bottom sheet that saves on the same rules" con "Edit target shows the form in the same drawer and saves on the same rules"; aggiungere ai passi "with the New pipeline year drawer open press Back" e all'esito "Back closes the drawer".
- [ ] **Step 3: `docs/pages/config.md`** — nella sezione "Pipelines & POTs", sostituire "inline new year / new POT / edit target" con "new year / new POT / edit target in the same side drawer as the POT detail (2026-11-05)", e aggiungere un punto: le viste del drawer (`drawerView`), `mdpDrawerDismiss`, 440/560px, Edit target dai dettagli senza cambio di URL, nessun bottom sheet, e che le tavole 10.4b/d/e sono superate da questa scelta.
- [ ] **Step 4: Guard documentali** — `npx vitest run scripts/ js/lib/test-cases-parse.test.js` → PASS.
- [ ] **Step 5: Commit** — `git add TEST_CASES.md docs/pages/config.md && git commit -m "docs(master-pipelines): MD-15 and page notes for the form drawer"`

## Decisioni aperte

1. **Esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: tre task sequenziali su due file di produzione (`master-pipelines.html`, `js/lib/master-pipelines.js`), nessuna migrazione né API (§6.1, ciclo piccolo).
2. **Risk class `high-risk`.** Alternativa scartata: `standard`. Perché: il campo importo money del POT si sposta, anche se binding e regole restano; nel dubbio la classe più alta (§6.1b).
3. **Un solo `<input>` importo condiviso da New POT ed Edit target**, con label e placeholder che dipendono da `potf.id`. Alternativa scartata: due input, uno per vista. Perché: i binding money pinnati da `master-pipelines-pot-input-guard.test.js` restano in una sola copia invece di tre di oggi.
4. **La matita di un POT chiude i dettagli di un altro POT prima di aprire il form.** Alternativa scartata: lasciare il form sopra i dettagli sbagliati. Perché: il form si disegnerebbe a 560px con l'eyebrow di un altro POT.
5. **Esc dentro un `cg-select` aperto chiude anche il drawer**, come in master-clients. Alternativa scartata: intercettare Esc nel `cg-select`. Perché: `js/cg-controls.js` è condiviso da quattro pagine, fuori scope.
