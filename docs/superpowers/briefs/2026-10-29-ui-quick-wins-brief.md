# Brief — UI quick wins (ciclo A)

**Tipo:** evoluzione (Scenario 2), confermato dall'utente il 2026-10-29.
**Brief started:** 2026-10-29 00:40
**Origine:** finding del test manuale del 2026-10-01 (memoria di progetto `project_manual_test_findings_money_cleanup.md`), raggruppamento "Cycle A — UI quick wins": item 7, 9, 10.

## Item 7 — tolto dal ciclo

Lo scambio delle card KPI "Budget Consumed" / "Hours Left" in `portfolio.html` non è più applicabile: il ciclo Project reporting v2 (2026-10-15) ha sostituito le sei card con tre tile `Hours`, `Budget`, `Time elapsed` (`portfolio.html` righe 379-413), dove ore e budget rimanenti sono il piè di tile "… left". L'utente ha scelto di chiuderlo come superato.

## Comportamento attuale

Verificato sui file il 2026-10-29.

**Item 9 — toggle di larghezza di `planning.html`:**
- Bottone `Compact` / `Full width` nella toolbar destra (`planning.html` riga 125): `class="ph-btn"`, `title="Toggle full browser width"`, `@click="toggleFullWidth"`, icona `:name="fullWidth ? 'minimize' : 'maximize'"`.
- Stato `fullWidth: true` (`planning.html` riga 302); metodo `toggleFullWidth()` (righe 1144-1146) che inverte `fullWidth` e fa `document.body.classList.toggle('pp-fullwidth', …)`.
- La pagina parte già in full width: `<body class="pp-fullwidth">` (riga 13), regola `body.pp-fullwidth .app-container` in `css/style.css` riga 465 (`--app-pad: 12px`, `max-width: 100%`).
- Test che pinnano il bottone: `js/lib/content-surface-guard.test.js` riga 246 (`buttons.length` = 4) e riga 260 (l'icona del toggle). `js/lib/page-head-guard.test.js` righe 188-189 pinnano la regola `body.pp-fullwidth`, non il bottone.
- `TEST_CASES.md` riga 408 (PL-29) cita "Compact/Full width" fra i bottoni della toolbar.

**Item 10 — scrollbar delle colonne della pipeline:**
- Il contenitore che scorre è `.pb-col-body`, dichiarato due volte: `css/pipeline.css` riga 168 (`flex: 1; min-height: 0; overflow-y: auto; padding: …`) e `css/style.css` righe 509-513 (stesse prime tre proprietà).
- `css/pipeline.css` è caricato solo da `pipeline.html` (`?v=4`, riga 12).
- Sotto 768px le colonne non scorrono da sole: `.pb-col-body` ha `overflow: visible` (`css/pipeline.css` riga 289) e scorre `.pb-board`.
- Nessuna scrollbar personalizzata nelle pagine dell'app; l'unica nel repo è in `test-cases.html` (righe 186-189, pagina dev-only, con hex letterali).

## Comportamento atteso

1. **Item 9:** `planning.html` non ha più il bottone `Compact` / `Full width`; la pagina resta sempre in full width. Spariscono il bottone, lo stato `fullWidth` e `toggleFullWidth()`. Gli altri tre bottoni della toolbar restano invariati.
2. **Item 10:** le colonne del board della pipeline (`.pb-col-body`, ≥ 768px) mostrano una scrollbar verticale molto sottile al posto di quella standard del browser, in Firefox (`scrollbar-width` / `scrollbar-color`) e in Chrome/Edge (`::-webkit-scrollbar`).

## Vincoli

- Colori della scrollbar solo da `var(--…)` di `css/tokens.css`, nessun hex (CLAUDE.md "Design tokens").
- Ogni file versionato toccato porta il bump di tutti i suoi `?v=N` (CLAUDE.md "Cache-busting").
- Il totals bar `#pbTotalsBar` e i footer delle colonne restano allineati.
- Il layout sotto 768px non cambia.
- I test che pinnano il bottone si aggiornano al nuovo stato (tre bottoni), non si cancellano.
- Le modifiche all'HTML con l'Edit tool, mai via `Set-Content` (BOM).

## Criteri di accettazione

1. **Toggle assente** — `planning.html` non contiene `toggleFullWidth` né `fullWidth`, la toolbar destra ha tre bottoni, `<body class="pp-fullwidth">` resta.
2. **Planning sempre full width** — aperta la pagina, il contenuto occupa tutta la larghezza con il gutter di 12px, come oggi al primo caricamento.
3. **Scrollbar sottile** — su `pipeline.html` a ≥ 768px una colonna con più card dell'altezza disponibile mostra una scrollbar visibilmente più sottile di quella di default, in Chrome/Edge e in Firefox.
4. **Token, non hex** — le nuove regole CSS non contengono colori letterali.
5. **Nessuna regressione mobile** — sotto 768px la pipeline si comporta come prima (una colonna, scorre il board).
6. **Test verdi** — `npm test` verde, con `content-surface-guard` aggiornato a tre bottoni.

## Scope escluso (confermato dall'utente)

- Item 7 (KPI di portfolio), superato dal redesign.
- La classe `body.pp-fullwidth` e la sua regola in `css/style.css` restano come sono.
- Le icone `maximize` / `minimize` restano in `js/lib/icons.js` anche senza consumer.
- Gli altri scroll di `pipeline.html` (pannello di dettaglio, dropdown, lista filtri del sheet) mantengono la scrollbar di default.
- I tre bottoni "Expand all" di `planning.html`.

## Domande aperte per `/brainstorming`

1. Dove vive la regola della scrollbar: solo in `css/pipeline.css` (un solo `?v=` da aggiornare), oppure si coglie l'occasione di togliere la dichiarazione duplicata di `.pb-col-body` da `css/style.css` (che comporterebbe il bump di `style.css` su tutte le pagine)?
2. Spessore e colori della scrollbar (thumb, track, hover): quali token.
3. PL-29 in `TEST_CASES.md`: aggiornarlo togliendo "Compact/Full width" dall'elenco.
