# Spec — UI quick wins (ciclo A)

**Brief started:** 2026-10-29 00:40
**Brief:** `docs/superpowers/briefs/2026-10-29-ui-quick-wins-brief.md` (Scenario 2, evoluzione).
Design concordato in chat il 2026-10-29 (una fermata, §6b).

## 1. Scope

Due modifiche indipendenti:
- `planning.html` perde il toggle `Compact` / `Full width` e resta sempre in full width;
- le colonne del board di `pipeline.html` hanno una scrollbar verticale sottile.

L'item 7 del Brief (KPI di portfolio) è fuori: superato dal redesign Project reporting v2.

## 2. Planning — rimozione del toggle

`planning.html`:
- rimosso il bottone `toggleFullWidth` dalla toolbar destra (`.pl-toolbar-right`), che resta con `Team assistant`, `Load XLS`, `Export XLS`;
- rimossi la proprietà `fullWidth` di `data()` e il metodo `toggleFullWidth()`;
- `<body class="pp-fullwidth">` resta; la regola `body.pp-fullwidth .app-container` in `css/style.css` non cambia.

La pagina non è versionata: nessun bump `?v=`.

`js/lib/content-surface-guard.test.js`, blocco della toolbar di planning:
- il conteggio dei bottoni passa da 4 a 3;
- l'asserzione sull'icona del toggle è sostituita da: la pagina non contiene `toggleFullWidth` né `fullWidth`.

`TEST_CASES.md`, PL-29: l'elenco dei bottoni diventa Team assistant, Load XLS, Export XLS.

## 3. Pipeline — scrollbar sottile

`css/pipeline.css`, solo `.pb-col-body`:

- motori WebKit/Blink (Chrome, Edge, Safari):
  - `.pb-col-body::-webkit-scrollbar` — larghezza 6px;
  - `.pb-col-body::-webkit-scrollbar-track` — sfondo trasparente;
  - `.pb-col-body::-webkit-scrollbar-thumb` — `var(--border-medium)`, `border-radius: var(--radius-full)`;
  - `.pb-col-body::-webkit-scrollbar-thumb:hover` — `var(--text-muted)`;
- Firefox, dentro `@supports not selector(::-webkit-scrollbar)`:
  - `scrollbar-width: thin`;
  - `scrollbar-color: var(--border-medium) transparent`.

Le proprietà standard stanno dentro `@supports` perché Chrome 121+ ignora `::-webkit-scrollbar` su un elemento che dichiara `scrollbar-width` o `scrollbar-color`.

Sotto 768px `.pb-col-body` è `overflow: visible` e le regole non hanno effetto; nessuna regola dentro il media query cambia.

`pipeline.html`: `css/pipeline.css?v=4` → `?v=5`.

`js/lib/pipeline-guard.test.js`:
- il pin `?v=4` passa a `?v=5`;
- nuova asserzione: `pipeline.css` contiene una regola `.pb-col-body::-webkit-scrollbar` e `scrollbar-width: thin`.

Il controllo esistente sugli hex letterali in `pipeline.css` copre il vincolo dei token.

`TEST_CASES.md`: nuovo caso `P-` per la scrollbar sottile.

## 4. File toccati

- `planning.html`
- `pipeline.html`
- `css/pipeline.css`
- `js/lib/content-surface-guard.test.js`
- `js/lib/pipeline-guard.test.js`
- `TEST_CASES.md`
- `docs/BACKLOG.md` (riga per la dichiarazione duplicata di `.pb-col-body`, decisione 1)

## 5. Scope escluso

- La classe `body.pp-fullwidth` e la sua regola in `css/style.css`.
- Le icone `maximize` / `minimize` in `js/lib/icons.js`.
- Gli altri scroll di `pipeline.html` (pannello di dettaglio, dropdown, lista filtri del sheet).
- I tre bottoni "Expand all" di `planning.html`.
- La dichiarazione duplicata di `.pb-col-body` in `css/style.css`.

## Criteri di accettazione

1. **Toggle assente** — `planning.html` non contiene `toggleFullWidth` né `fullWidth`, la toolbar destra ha tre bottoni, `<body class="pp-fullwidth">` resta.
2. **Planning sempre full width** — aperta `planning.html`, il contenuto occupa tutta la larghezza con il gutter di 12px.
3. **Scrollbar sottile** — su `pipeline.html` a ≥ 768px una colonna con più card dell'altezza disponibile mostra una scrollbar sottile, in Chrome/Edge e in Firefox.
4. **Token, non hex** — le nuove regole di `css/pipeline.css` non contengono colori letterali (`js/lib/pipeline-guard.test.js`).
5. **Nessuna regressione mobile** — sotto 768px la pipeline mostra una colonna per volta e scorre il board, come prima.
6. **Test verdi** — `npm test` verde.

## Decisioni aperte

1. **La regola della scrollbar va solo in `css/pipeline.css`; il duplicato di `.pb-col-body` in `css/style.css` resta e va in `docs/BACKLOG.md`.** Alternativa scartata: rimuoverlo ora. Perché: toccare `style.css` impone il bump `?v=` su tutte le pagine per una pulizia estranea al ciclo.
2. **Firefox riceve le proprietà standard dentro `@supports not selector(::-webkit-scrollbar)`.** Alternativa scartata: proprietà standard e pseudo-elementi WebKit affiancati. Perché: in Chrome 121+ le proprietà standard annullano `::-webkit-scrollbar` e la scrollbar resterebbe più larga di 6px.
3. **6px, thumb `--border-medium`, hover `--text-muted`, track trasparente.** Alternativa scartata: 4px o un track colorato. Perché: 6px resta afferrabile col mouse senza appesantire un board già denso.
4. **Nessun test automatico nuovo sul full width di planning.** Alternativa scartata: un test che pinni `pp-fullwidth` sul `body`. Perché: la regola CSS è già pinnata da `js/lib/page-head-guard.test.js` e la classe è nel markup statico.
