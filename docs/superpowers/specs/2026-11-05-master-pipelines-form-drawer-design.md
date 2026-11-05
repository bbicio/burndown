# master-pipelines.html — new year / new POT / edit target in the side drawer — design spec

**Date:** 2026-11-05
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-05-master-pipelines-form-drawer-brief.md`
**Scenario:** 2 (evoluzione)

I tre form inline di `master-pipelines.html` (nuovo anno, nuovo POT, edit target) e il bottom sheet di Edit target su telefono si spostano nel drawer laterale che oggi mostra solo i dettagli del POT. Nessuna API, nessuna migrazione, nessun cambio di URL.

## 1. Fatti verificati nel codice (a `103b204`)

- Nuovo anno: `<tr v-if="pyf.show" class="mdp-new">` in testa alla lista (`master-pipelines.html:363-379`), aperto da `openPyForm()` (`:1249-1255`), che preseleziona l'anno successivo e mette il focus su `$refs.pyfInput`. La tabella è resa anche senza anni se il form è aperto (`:350`).
- Nuovo POT: `<tr v-if="potf.show && !potf.id" class="mdp-new">` in testa alla tabella POT (`:562-589`); la tabella è resa anche senza POT se il form è aperto (`:549`).
- Edit target: `<tr v-if="potf.show && potf.id === pot.id" class="mdp-new">` sotto la riga (`:628-651`), aperto dalla matita (`:617`, che ha `is-on` mentre è aperto).
- Dai dettagli: "Edit target" in testa chiama `editFromDrawer()` (`:1497-1500`), che chiude il drawer con `go({ year })` e apre la riga inline; su telefono la barra in fondo (`:882`) apre il bottom sheet `.mdp-sheet` (`:885-905`, CSS `:232-240`).
- Esc (`:1102-1106`) agisce solo con `drawerPot` aperto e cede a un `.modal.show`. Prima chiude l'edit, poi il drawer.
- `applyState()` (`:1458`) chiude `potf`, non `pyf`.
- `savePot()` (`:1350-1389`) e `createPipelineYear()` (`:1257-1271`) chiudono il proprio form con `show = false` dopo un salvataggio riuscito; `invalidatePotDetails()` (`:1140-1144`) ricarica in loco un drawer aperto.
- Su telefono il ✕ e "Edit target" in testa sono nascosti (`:283`); restano il "← Pipeline Y" (`.mdp-dr-back`) e la barra in fondo.
- CSS da rimuovere con i form: `.mdp-new td`, `.mdp-new-line` (`:50-51`), `.mdp-new .btn` nella lista di `:268`, il blocco `.mdp-sheet*`.
- `js/lib/master-pipelines.js` è caricato con `?v=1` (`:943`, unico riferimento).
- Riferimento: il drawer New client / New group di `master-clients.html:610-650` (440px, footer Cancel + primario, errori dentro, focus sul primo campo, nessun focus trap), pinnato da `js/lib/master-data-guard.test.js` ("opens the new-client and new-group forms in the side drawer").

## 2. Un solo drawer, quattro viste

Il wrapper diventa `v-if="drawerView"`, dove il nuovo computed `drawerView` vale:

| `drawerView` | Condizione (in quest'ordine) | Header |
|---|---|---|
| `'year'` | `pyf.show` | "New pipeline year", ✕ |
| `'newPot'` | `potf.show && !potf.id` | eyebrow "Pipeline Y", "New POT", ✕ |
| `'editPot'` | `potf.show && potf.id` | eyebrow "POT · Pipeline Y", "Edit target", sottotitolo nome del POT, ✕ |
| `'details'` | `drawerPot` | come oggi |
| `null` | altrimenti | — |

- Le viste form hanno corpo a campi impilati (`.mdp-field`), con gli stessi input, binding, hint e testi di oggi, gli errori (`pyf.error`/`potf.error`) in fondo al corpo, e un footer `.mdp-dr-foot-actions` con Cancel e il primario (Create / Create / Update target, stessi `:disabled` e spinner di oggi).
- In vista form: `.mdp-dr-edit-top`, `.mdp-dr-more`, `.mdp-dr-back` e `.mdp-dr-bar` non sono resi; il ✕ resta visibile a ogni larghezza.
- Larghezza: `.mdp-drawer.is-form` = `min(440px, 100vw)` quando la vista è form **e** `drawerPot` è nullo; altrimenti i 560px di oggi. Sotto 768px resta a tutto schermo; i bottoni del footer sono alti almeno 44px.
- `aria-label` dell'`<aside>`: il titolo della vista.
- La matita della riga perde il proprio `is-on`, perché non c'è più una riga aperta da segnalare.
- Spariscono le tre `<tr class="mdp-new">`, il bottom sheet e il loro CSS; le tabelle tornano a `v-if="sortedYears.length"` e `v-if="pots.length"`.

## 3. Comportamento

- **Dettagli → form:** `editFromDrawer(pot)` diventa `openPotForm(pot)` senza `go()`; anche la barra del telefono la usa. L'URL resta `?year=Y&pot=<id>`.
- **Chiusura:** la nuova funzione pura `mdpDrawerDismiss({ pyfShow, potfShow, hasDetails, loading, closeAll })`, in `js/lib/master-pipelines.js` con bridge `window.`, restituisce:
  - `'none'` se `loading` è vero;
  - `'close-drawer'` se `closeAll` è vero (✕) oppure se nessun form è aperto e ci sono i dettagli;
  - `'back-to-details'` se è aperto `potf` e ci sono i dettagli;
  - `'close-form'` se è aperto un form senza dettagli;
  - `'none'` se non c'è nulla di aperto.
- Il metodo `dismissDrawer(closeAll)` la chiama e applica l'esito: `close-form`/`back-to-details` → `pyf.show = false; potf.show = false`; `close-drawer` → lo stesso più `closeDrawer()` se `drawerPot` è aperto. Lo usano scrim, Cancel (`false`), ✕ (`true`) ed Esc (`false`).
- **Esc:** l'handler di `mounted()` agisce quando `drawerView` non è nullo (non più solo con `drawerPot`), continua a cedere a un `.modal.show` e chiama `dismissDrawer(false)`.
- **Salvataggio:** `savePot()` e `createPipelineYear()` non cambiano. Dopo un update dai dettagli si torna ai dettagli aggiornati; dopo una creazione il drawer si chiude.
- **Navigazione:** `applyState()` chiude anche `pyf` (`this.pyf.show = false` accanto a `this.potf.show = false`).
- **Focus:** `openPyForm()` mantiene il focus e la selezione su `pyfInput`; `openPotForm()` mette il focus sul campo importo (nuovo `ref="potfAmount"`) in `$nextTick`. Nessun focus trap, nessun ritorno del focus al bottone che ha aperto il drawer.

## 4. Test

1. **Caratterizzazione, prima di toccare il markup:** un test in `js/lib/master-data-guard.test.js` che pinna, sul codice di oggi, i testi e le regole dei form che si spostano: i messaggi di `createPipelineYear` (`Enter a valid year (2000–2100).`, `Pipeline ${year} already exists.`) e di `savePot` (`Reason for change is required when updating a POT.`, `Select a target.`), l'hint `Created hidden: show it when POTs are ready.`, l'hint `All clients of the group count towards one target.`, il `:disabled` di Create POT (`potf.loading || !potf.targetId || !String(potf.amountText).trim()`) e di Update target (`potf.loading || !potf.note || !potf.note.trim() || !String(potf.amountText).trim()`). Verde prima e dopo.
2. **Unit:** `mdpDrawerDismiss` in `js/lib/master-pipelines.test.js`, una riga per ogni esito della §3.
3. **Guard strutturale** in `js/lib/master-data-guard.test.js`: nessun `mdp-new` e nessun `mdp-sheet` nella pagina; `ref="pyfInput"`, `@click="createPipelineYear"` e `@click="savePot"` compaiono una sola volta, dentro il drawer; nessun `pyf.show`/`potf.show` dentro `<table class="mdp-table`; `editFromDrawer` non chiama `go(`; `applyState` chiude `pyf`.
4. I guard esistenti (`master-pipelines-pot-input-guard.test.js`, il blocco responsive di `master-data-guard.test.js`) restano verdi; la regola dei 44px sul telefono aggiunge il footer del drawer.
5. `TEST_CASES.md` MD-15 descrive il nuovo flusso.

## 5. Tavole

| Tavola | Esito |
|---|---|
| `10.4a-pipelines-list.jpg`, `10.4c-pot-targets.jpg` | invariate, senza righe inline |
| `10.4b-new-year-inline.jpg` | superata dalla vista `'year'` |
| `10.4d-new-pot-inline.jpg` | superata dalla vista `'newPot'` (stessi controlli, impilati) |
| `10.4e-edit-target.jpg` | superata dalla vista `'editPot'` (stessi campi, impilati) |
| `10.4f-pot-detail-drawer.jpg` | invariata; "Edit target" passa alla vista form |
| `10.4g-tablet-smartphone.jpg` | il bottom sheet è sostituito dalla vista form a tutto schermo |
| `10.5a-project-phasing.jpg`, `10.5b-proposal-phasing.jpg` | non toccate |

Lo scostamento da 10.4b/d/e si registra in `docs/pages/config.md`; le tavole non si aggiornano (Brief, esclusione f).

## 6. Fuori scope

Le esclusioni a–f del Brief: edit form degli anni, Delete nel drawer, cambi a campi/validazioni/testi, URL per il form, componente drawer condiviso, aggiornamento delle tavole.

## Criteri di accettazione

1. **Nuovo anno** — `+ Add year` apre il drawer "New pipeline year" con l'anno successivo selezionato; Create con un anno valido lo crea Hidden e chiude il drawer; un anno duplicato o fuori intervallo mostra l'errore nel drawer, che resta aperto (verifica manuale).
2. **Nuovo POT** — `+ New POT` apre la vista New POT; Create con target e importo aggiunge il POT e chiude il drawer; il target non è più offerto (verifica manuale).
3. **Edit dalla riga** — la matita apre la vista Edit target a 440px; senza motivo il salvataggio è rifiutato con "Reason for change is required when updating a POT." e il drawer resta aperto; con il motivo l'importo si aggiorna e il drawer si chiude (verifica manuale).
4. **Edit dai dettagli** — "Edit target" (testa o barra del telefono) mostra il form nello stesso drawer a 560px; Cancel ed Esc tornano ai dettagli; Update torna ai dettagli con importo e storico aggiornati; l'URL resta `?year=Y&pot=<id>` (verifica manuale).
5. **Chiusura** — ✕, Cancel, scrim ed Esc chiudono i form aperti da soli; ✕ chiude anche i dettagli; durante un salvataggio nessuno dei quattro chiude (unit test `mdpDrawerDismiss` + verifica manuale).
6. **Niente form inline** — nessun `mdp-new` né `mdp-sheet` nella pagina; ogni form esiste una sola volta, dentro il drawer (guard).
7. **Comportamento invariato** — il test di caratterizzazione scritto prima della modifica resta verde.
8. **Navigazione** — Back/Forward con il drawer "New pipeline year" aperto lo chiudono (verifica manuale).
9. **Telefono** — a 390px il drawer dei form è a tutto schermo, con ✕ visibile e bottoni del footer alti almeno 44px (guard + verifica manuale).
10. **Cache-busting** — `js/lib/master-pipelines.js?v=2` in `master-pipelines.html`, unico riferimento.

## Decisioni aperte

1. **Un solo drawer con quattro viste, scelte da `drawerView`.** Alternativa scartata: un drawer per i form separato da quello dei dettagli. Perché: Edit target esisterebbe in due copie.
2. **440px per i form aperti da soli, 560px quando il form nasce dai dettagli.** Alternativa scartata: 560px ovunque. Perché: un form con un solo campo in 560px è vuoto, e il pannello dei dettagli non deve cambiare larghezza.
3. **La logica di chiusura è la funzione pura `mdpDrawerDismiss`.** Alternativa scartata: rami inline nell'handler di Esc. Perché: si testa con un unit test.
4. **✕ chiude tutto il drawer, Cancel torna ai dettagli.** Alternativa scartata: ✕ che torna ai dettagli. Perché: due bottoni con lo stesso effetto.
5. **Durante il salvataggio ✕, Cancel, scrim ed Esc non chiudono.** Alternativa scartata: lasciarli attivi come oggi. Perché: l'esito del salvataggio arriverebbe su un pannello chiuso.
6. **`applyState()` chiude anche `pyf`.** Alternativa scartata: lasciarlo aperto. Perché: resterebbe visibile dopo un cambio di livello.
7. **Focus sul primo campo utile, senza trap né ritorno al trigger.** Alternativa scartata: gestione completa del focus. Perché: master-clients, il riferimento, non la ha.
8. **In vista form il ✕ è visibile anche su telefono e "← Pipeline Y"/barra in fondo non sono resi.** Alternativa scartata: riusare "← Pipeline Y" come Cancel. Perché: il form ha già Cancel nel footer e il ✕ è l'unico controllo coerente fra le viste.
