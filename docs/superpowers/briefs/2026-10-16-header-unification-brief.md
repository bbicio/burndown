# Brief — header di pagina unificato (ciclo 1 di 2)

**Brief started:** 2026-10-16 (avvio di `/feature-brief`)
**Classificazione (dichiarata dall'utente, 2026-10-16):** Scenario 2 (evoluzione).
**Riferimento visivo:** `docs/superpowers/design/header/header_pipeline_model.jpg`. Le altre quattro immagini
della stessa cartella (`*_to_be_updated.jpg`) mostrano lo stato attuale di cost grid, portfolio, program
dashboard e project dashboard.
**Suddivisione decisa dall'utente:** ciclo 1 (questo) = breadcrumb + banda header + banda toolbar + stile
delle icone della sidebar, su tutte le pagine autenticate. Ciclo 2 = contenuto sotto l'header (KPI tile,
card di sezione, banner), uniformato con token comuni senza ridisegno: va nel backlog con un brief suo.

## Current behavior

### Breadcrumb

- Lo genera `js/nav.js` (righe 318-351, `updateBreadcrumbs`) come barra separata `#breadcrumb-bar`,
  identica su tutte le pagine.
- `css/style.css` righe 31-36: sfondo bianco, bordo inferiore, `padding: 6px 24px`, `--text-xs`.
  Altezza fissa `--breadcrumb-h: 32px` (riga 19); sotto i 1024px la barra è nascosta e l'altezza azzerata
  (righe 28-29). Entrambi i comportamenti sono fissati da `js/lib/nav-layout-guard.test.js` (righe 43-48).
- L'altezza della board pipeline si calcola sottraendo `--breadcrumb-h` (`css/style.css` riga 473).
- Il padding sinistro del breadcrumb (24px) non coincide con quello degli header delle pagine, che varia
  da pagina a pagina (tabella sotto).

### Banda header: una variante per pagina

| Pagina | Markup | Background / spaziatura | Titolo |
|---|---|---|---|
| `pipeline.html` (modello) | `.pb-header` (riga 23) | banda bianca a tutta larghezza + bordo inferiore, `padding: space-3 space-6` (`css/pipeline.css:6-11`) | 26px bold navy (`pipeline.css:17-20`) |
| `portfolio.html` overview | `.pf-header` (riga 30) | nessuno sfondo, solo `margin-bottom` (`css/portfolio.css:4-7`) | 1.625rem (`portfolio.css:8-11`) |
| `portfolio.html` project dashboard | `.pr-head` (riga 320) | nessuno sfondo, `padding-top: space-4` (`portfolio.css:454`) | 1.625rem (`portfolio.css:474-477`) |
| `program.html` | `.pg-topline` + `.pg-header-row` (righe 34-50) | nessuno sfondo (`portfolio.css:272-285`) | 1.625rem |
| `costgrid.html` | `.cg-header` (riga 34) | card bianca con ombra e raggio, `padding: 16px 20px` (`css/costgrid.css:16-22`) | `--text-2xl` (`costgrid.css:30-35`) |
| team, admin, master-*, timesheets, attribute-lists, profile-jobs, settings | `.page-header` + `<h1>` | nessuno sfondo (`css/admin-crud.css:6-7`) | 2.5rem |
| planning, project-config | `.page-title-bar` + `<h4>` | `padding: 20px 0 10px` (`css/style.css:407-409`) | 2.5rem |
| `_db-reset.html` | `<h1>` inline (riga 45) | — | rosso `#dc3545`, 2.5rem, emoji ⚠️ |
| `_terms-editor.html` | `<h5>` (riga 36) | — | emoji 📄 |

Altri elementi che cambiano da pagina a pagina:
- **Link indietro:** testo muted "‹ Project Portfolio" (`.pr-back`, `portfolio.css:455-459`; `.pg-topline-link`,
  `portfolio.css:273`) oppure pulsante bianco "< Pipeline" (`.cg-back-link`, `costgrid.html:29-32`),
  che salva prima di uscire (`goBack`, etichetta "Saving…").
- **Etichetta sopra il titolo:** "PROGRAM DASHBOARD" (`.pg-label`, `portfolio.css:279-282`) e la riga
  "PROGRAM · nome · N projects · Program Dashboard →" (`.pr-program-row`, `portfolio.css:462-468`).
- **Badge:** pill piena accanto al titolo (`pipelineBadge`/`statusBadgeLarge` in program e project dashboard)
  oppure pill chiara a destra (`.cg-stage-pill` con `CG_HEADER_STAGE_STYLE`, `costgrid.html:40`).
- **CTA primaria:** magenta `.pb-btn-new` (`pipeline.css:60-66`) contro `btn btn-primary` blu nel portfolio
  (riga 36) e nel cost grid (riga 75).
- **Pulsanti secondari:** bianchi 32px con icona (`.pr-action`, `portfolio.css:527-530`), `btn-outline-secondary`
  senza icona (`program.html:47-48`), `.cg-btn-secondary` 34px senza icona (`costgrid.css:889+`).
- **Titoli con emoji o contatori:** "📁 {project}" (project-config), "Users (N)", "Team (N)",
  "Attribute Lists (N)" con contatore inline e stile inline `font-size:1rem`.

### Banda toolbar

- Pipeline: banda bianca separata `.pb-toolbar` (`pipeline.css:69-73`).
- Portfolio overview: `.pf-toolbar` sullo sfondo grigio della pagina, solo `margin-bottom` (`portfolio.css:15-18`).
- Le altre pagine con filtri (planning, liste admin) li tengono in markup proprio.

### Icone

- Sidebar: icone a linea 16×16 con `stroke=currentColor`, generate da `navIcon()` in `js/nav.js` (righe 29-53).
- Pulsanti dell'header: componente Vue locale `pf-icon` in `portfolio.html` (riga 729, viewBox 16×16),
  SVG inline nel cost grid, emoji nei titoli.

## Expected behavior

1. **Una banda unica per tutte le pagine autenticate** (le pagine che chiamano `initNav`), con lo stile
   della pipeline: sfondo bianco a tutta larghezza, bordo inferiore, stessi padding, stessa dimensione e
   peso del titolo e del sottotitolo.
2. **Breadcrumb dentro la banda:** diventa la prima riga della banda header, non più una barra a sé. Breadcrumb
   e banda formano un blocco unico: stesso bianco, bordi e allineamento orizzontale del testo.
3. **Struttura della banda,** con slot opzionali, uguale ovunque:
   - link indietro: testo muted "‹ Destinazione" sopra il titolo (stile `.pr-back`);
   - eyebrow: una riga piccola, uppercase e muted sopra il titolo, solo per le pagine che ne hanno bisogno;
   - titolo, con i badge di stato subito dopo, inline, in pill chiara (stile `.cg-stage-pill`);
   - sottotitolo/meta muted;
   - lato destro: azioni ed eventuali valori specifici della pagina (es. "OPEN PIPELINE").
4. **Pulsanti:** la CTA primaria è magenta come `.pb-btn-new`; i secondari sono bianchi, tutti della stessa
   altezza, con icona + etichetta.
5. **Icone:** i pulsanti dell'header e la sidebar usano lo stesso set e lo stesso tratto.
6. **Titoli:** niente emoji; i contatori passano nel sottotitolo (es. "12 users"), come "5 programs · 15 projects"
   nel portfolio.
7. **Banda toolbar:** dove una pagina ha ricerca e filtri, questi stanno in una seconda banda bianca sotto
   l'header, come `.pb-toolbar`.
8. **Cost grid:** perde la card e usa la banda. Selettore versioni e azioni restano nella banda; il banner
   "version locked" resta sotto la banda.
9. **`_db-reset.html`:** header standard; l'avvertimento di pericolo diventa un alert rosso sotto la banda.
10. **Sotto i 1024px:** stesso pattern della pipeline ovunque (le azioni vanno a capo, le etichette lunghe si
    accorciano come "+ New Proposal" → "+ New").

## Constraints

- Nessun bundler e nessuno step di build: CSS e JS vengono serviti così come sono.
- Solo token di `css/tokens.css`, niente hex nuovi (CLAUDE.md "Design tokens"); il contrasto testo/sfondo
  resta ≥ 4.5:1 (`js/lib/tokens.test.js`).
- Struttura della page shell invariata (`#app-shell`/`#nav-container`/`#app-main`), niente `overflow`,
  `transform`, `position`… su quei contenitori (`js/lib/nav-shell-guard.test.js`); `v-cloak` sulle root.
- Gli ID emessi da `nav.js` restano tutti (`js/lib/nav-model.test.js`).
- Cache-busting: a ogni file versionato che cambia si aggiornano tutti i suoi `?v=N`
  (`js/lib/foundations-guard.test.js`, `js/lib/nav-shell-guard.test.js`).
- Le regole sul breadcrumb fissate da `js/lib/nav-layout-guard.test.js` (altezza, nascosto sotto i 1024px,
  calcolo dell'altezza della board) cambiano solo con una decisione esplicita, aggiornando il test nello stesso ciclo.
- Testo visibile all'utente in inglese.
- Modifiche agli HTML con lo strumento Edit, non con `Get-Content`/`Set-Content` di PowerShell (aggiunge il BOM).
- La verifica visiva rilegge i PNG prodotti da `scripts/shoot.mjs` e li confronta con `header_pipeline_model.jpg`
  (PROCESS.md §6.3/§6.6).

## Acceptance criteria

1. Su ogni pagina che chiama `initNav`, la banda (breadcrumb compreso) ha lo stesso sfondo, gli stessi bordi,
   gli stessi padding e la stessa dimensione/peso del titolo e del sottotitolo: lo verifica un test che
   controlla il markup/CSS di tutte quelle pagine, più gli screenshot di `scripts/shoot.mjs`.
2. Il breadcrumb è la prima riga della banda e il suo testo è allineato a sinistra con il titolo.
3. Nessuna pagina definisce più regole proprie per la dimensione del titolo dell'header
   (`.pf-header-title`, `.pr-title`, `.pg-title`, `.cg-header-name`, `.page-header h1`, `.page-title-bar h4`
   o loro sostituti).
4. Ogni link indietro presente ha lo stesso elemento e lo stesso stile (testo muted sopra il titolo); quello
   del cost grid salva ancora prima di uscire.
5. Ogni badge di stato nell'header sta subito dopo il titolo, in pill chiara.
6. Ogni CTA primaria dell'header è magenta; ogni secondario è bianco, della stessa altezza, con icona + etichetta.
7. Sidebar e pulsanti dell'header prendono le icone dallo stesso set.
8. Nessun titolo dell'header contiene emoji o contatori; i contatori compaiono nel sottotitolo.
9. Ricerca e filtri, dove ci sono, stanno in una banda bianca sotto l'header.
10. Il cost grid non ha più la card header; selettore versioni, azioni e banner locked funzionano come prima.
11. `_db-reset.html` ha l'header standard e un alert rosso sotto la banda.
12. Sotto i 1024px nessuna pagina ha uno scroll orizzontale causato dall'header; le azioni vanno a capo.
13. Nessun cambio funzionale: le azioni, i dropdown (anno della pipeline, cambio progetto) e il salvataggio
    quando si torna indietro dal cost grid fanno quello che facevano prima.
14. `npm test` passa, compresi i guard aggiornati.

## Explicitly excluded scope (confermato dall'utente)

- Pagine pre-login e `terms.html` (login, activate, reset-password, terms).
- Qualsiasi cambio funzionale: solo aspetto e struttura del markup.
- Header dei modali.
- Contenuto sotto l'header (KPI tile, card di sezione, banner): è il ciclo 2, da aprire con un brief suo.
  Se il ciclo usa un backlog, la voce va aggiunta al Gate 5.
- `index.html`, `config.html` (redirect) e `test-cases.html` (pagina dev senza navigazione).

## Open questions per /brainstorming

- Forma dell'implementazione: classi CSS condivise in `css/style.css` scritte a mano in ogni pagina, oppure
  la banda (o parte di essa) generata da `nav.js` come oggi il breadcrumb. Il breadcrumb dentro la banda
  rende la seconda strada più naturale, ma sposta markup Vue fuori dalle root.
- Destino di `--breadcrumb-h` e del calcolo dell'altezza della board pipeline una volta che il breadcrumb
  non è più una barra a sé; sotto i 1024px oggi il breadcrumb è nascosto: resta nascosto dentro la banda?
- Libreria di icone unica: estendere `navIcon()` di `nav.js` e farla usare anche ai pulsanti (incluse le
  pagine Vue, oggi con `pf-icon` locale e SVG inline), oppure un modulo nuovo condiviso. Quali icone
  mancano per i secondari (Save, Clone, Export, Share, Configure…)?
- Le pagine diverse dalle cinque fotografate non hanno tavole: bastano il modello pipeline e le regole di
  questo brief, o servono tavole per i casi più diversi (cost grid con selettore versioni, planning,
  liste admin)?
- Come trattare gli elementi di destra specifici della pagina (KPI "OPEN PIPELINE", nota "All tasks are in
  projects" del cost grid) dentro lo slot azioni.
- Pagine con più viste nello stesso file (portfolio overview / project dashboard, schede di team): una
  banda per vista o una banda che cambia contenuto.
