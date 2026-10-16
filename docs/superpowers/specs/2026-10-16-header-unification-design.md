# Spec — header di pagina unificato (ciclo 1 di 2)

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-16-header-unification-brief.md` (Scenario 2), commit `0405c9d`.
**Tavole:** `docs/superpowers/design/header/` — `header_pipeline_model.jpg` è il modello, le altre quattro
(`*_to_be_updated.jpg`) lo stato attuale. Design concordato in chat il 2026-10-16 (una fermata, §6b).

## 1. Stato attuale

Vedi il Brief, sezione "Current behavior" — non ripetuto qui. Due fatti in più, accertati in `/brainstorming`:

- `js/nav.js` `updateBreadcrumbs` (righe 331-348) inserisce `#breadcrumb-bar` come primo figlio di
  `#app-main`, fuori da ogni root Vue, dopo la risposta di `GET /api/auth/me`.
- `project-config.html` ha due coppie di pulsanti "← Back to Portfolio" / "← Project Dashboard" (righe 36-37
  nell'header, 320-321 in fondo al form).

## 2. Componente `.ph` (page head) in `css/style.css`

Una famiglia di classi condivise, con i valori di `.pb-header`/`.pb-title`/`.pb-subtitle`/`.pb-toolbar`/
`.pb-btn-new` (`css/pipeline.css`) come fonte. Solo token di `css/tokens.css`.

| Classe | Ruolo | Valori |
|---|---|---|
| `.ph` | banda header | flex, `justify-content: space-between`, `align-items: center`, `gap: var(--space-4)`, `flex-wrap: wrap`; `padding: var(--space-3) var(--space-6)`; `background: var(--surface-white)`; `border-bottom: 1px solid var(--border-light)` |
| `.ph-main` | colonna sinistra | `min-width: 0` |
| `.ph-back` | link indietro | inline-flex con icona `chevronLeft` 12px, `--text-sm`, `--text-muted`, nessuna sottolineatura (sottolineato in hover), `margin-bottom: var(--space-1)` |
| `.ph-eyebrow` | etichetta sopra il titolo | `--text-2xs`, `--weight-semibold`, uppercase, `letter-spacing: .06em`, `--text-muted` |
| `.ph-title-row` | titolo + badge | inline-flex, `align-items: center`, `gap: var(--space-2)`, `flex-wrap: wrap` |
| `.ph-title` | titolo | `font-size: 26px`, `--weight-bold`, `line-height: 1.2`, `--brand-navy`, `margin: 0` |
| `.ph-badge` | pill chiara | vedi §5 |
| `.ph-sub` | sottotitolo/meta | `--text-sm`, `--text-muted` |
| `.ph-side` | colonna destra | flex, `align-items: center`, `gap: var(--space-5)` |
| `.ph-actions` | gruppo pulsanti | flex, `gap: var(--space-2)`, `flex-wrap: wrap` |
| `.ph-btn-primary` | CTA | i valori di `.pb-btn-new`, hover/active compresi, più `:disabled` (opacità ridotta, `cursor: not-allowed`) |
| `.ph-btn` | secondario | inline-flex, `gap: var(--space-1)`, altezza 32px, `padding: 0 var(--space-3)`, `--surface-white`, bordo `--border-light`, `--radius-md`, `--text-sm`, `--text-primary`; icona 14px |
| `.ph-toolbar` | banda toolbar | i valori di `.pb-toolbar` |
| `.ph-toolbar-spacer` | spaziatore | `flex: 1 1 auto` |
| `.ph-lbl-wide` / `.ph-lbl-narrow` | etichette accorciate | stesso comportamento di `.pb-lbl-wide`/`.pb-lbl-narrow` |

Il titolo di un dropdown (anno della pipeline, cambio progetto) resta un `<button>` che contiene `.ph-title`; il
bottone perde gli stili tipografici propri e conserva solo il reset del bottone e il chevron.

**Larghezza piena.** La banda occupa tutta la larghezza di `#app-main`. Dove la root della pagina sta in un
contenitore con padding orizzontale (`.app-container`, `padding: 0 var(--space-6)`), il markup `.ph`/`.ph-toolbar`
si porta fuori dal contenitore quando la struttura lo permette, altrimenti si compensa con
`margin: 0 calc(-1 * var(--space-6))`: la scelta è del Piano, pagina per pagina.

**Regole rimosse** (sostituite da `.ph-*`): `.pb-header`, `.pb-title`, `.pb-subtitle`, `.pb-header-right`,
`.pb-btn-new`, `.pb-toolbar`, `.pb-toolbar-spacer`, `.pb-lbl-*` (`css/pipeline.css`); `.pf-header*`, `.pf-toolbar`,
`.pr-head`, `.pr-head-row`, `.pr-back`, `.pr-title` (la sola tipografia), `.pr-actions`, `.pr-action`,
`.pg-topline*`, `.pg-header-row`, `.pg-header-actions`, `.pg-label`, `.pg-title` (`css/portfolio.css`);
`.cg-back-link`, `.cg-header`, `.cg-header-name`, `.cg-header-subtitle`, `.cg-stage-pill` (`css/costgrid.css`);
`.page-header`, `.page-header h1` (`css/admin-crud.css`); `.page-title-bar`, `.page-toolbar*` (`css/style.css`, usate solo da `planning.html` e `project-config.html`). Una regola
ancora usata altrove nella pagina resta, ristretta a quell'uso. Le regole di layout che non riguardano l'header
(es. `.pr-switch-menu`, `.pb-year-menu`, `.cg-version-seg*`, `.pb-open*`) restano.

## 3. Breadcrumb

Solo CSS, nessun cambio al DOM né a `updateBreadcrumbs`:

- `.breadcrumb-bar` perde `border-bottom` e prende `padding: 6px var(--space-6)`; lo sfondo resta `--surface-white`.
- Breadcrumb e `.ph` che lo segue si leggono come un blocco unico: il testo del breadcrumb è allineato a sinistra
  con `.ph-title`.
- Sotto i 1024px il breadcrumb resta nascosto, `--breadcrumb-h` invariato: `js/lib/nav-layout-guard.test.js` e
  il calcolo dell'altezza della board pipeline (`css/style.css` riga 473) non cambiano.

## 4. Icone: `js/lib/icons.js`

- Nuovo modulo ES con `export const ICON_PATHS` e `export function iconSvg(name, size = 16, cls = '')` che
  ritorna `<svg class="pd-icon ${cls}" width height viewBox="0 0 16 16" fill="none" aria-hidden="true"
  focusable="false">…</svg>`, o `''` per un nome sconosciuto. Bridge `window.iconSvg` e `window.ICON_PATHS`.
- Contenuto: tutti i path di `NAV_ICON_PATHS` (`js/nav.js`) e di `PF_ICON_PATHS` (`portfolio.html`), più quelli
  che servono ai secondari dell'header e che oggi mancano: `save`, `clone`, `download` (export), `share`,
  `configure`, `upload`, `calendar`, `plus`, `chevronDown`, `search`. Tratto unico: viewBox 16, `currentColor`,
  `stroke-width` fra 1.2 e 1.6 come le icone esistenti. Un nome presente in entrambe le fonti con disegni
  diversi tiene quello della sidebar.
- `js/nav.js`: `NAV_ICON_PATHS` viene eliminato e `navIcon(name, size)` usa `window.ICON_PATHS`; markup e classi
  emessi (`nav-icon nav-icon-${size}`) restano identici, così `nav-model.test.js` non cambia.
- Componente Vue `<ph-icon name size>`: definito una volta in `js/lib/icons.js` come oggetto
  `PhIcon` (bridge `window.PhIcon`), registrato dalle pagine che lo usano con `app.component('ph-icon', window.PhIcon)`.
  `portfolio.html` sostituisce `pf-icon` con `ph-icon` e perde `PF_ICON_PATHS`. Il cost grid sostituisce gli SVG
  inline dell'header con `ph-icon`.
- Ordine: ogni pagina carica `js/lib/icons.js` come `<script type="module">` **prima** di `js/nav.js`, così la
  coda deferred lo esegue prima (CLAUDE.md "Script loading order").

## 5. Badge in pill chiara

- `.ph-badge`: `display: inline-block`, `--text-xs`, `--weight-semibold`, `letter-spacing: .03em`, uppercase,
  `padding: 2px var(--space-2)`, `--radius-full`, colori da variabili.
- **Stage:** `--pipeline-{stage}-bg` / `--pipeline-{stage}-color`, già in `tokens.css`.
- **Status:** nuovi token `--status-{not-started,started,at-risk,on-hold,completed}-soft-bg` e `-soft-text` in
  `tokens.css`, testo ≥ 4.5:1 sul proprio sfondo, aggiunti alle coppie di `js/lib/tokens.test.js`.
- `js/core.js`: nuova funzione `headerBadge(kind, value)` (`kind` = `'stage'` | `'status'`) che ritorna
  `<span class="ph-badge" style="background:var(…);color:var(…)">…</span>` con il testo passato da `esc()`;
  valore sconosciuto → `''`. `pipelineBadge`/`statusBadge`/`statusBadgeLarge` restano invariati per il resto
  dell'app. `costgrid.html` perde `CG_HEADER_STAGE_STYLE` e la riga relativa della sezione "Pipeline stage" di
  CLAUDE.md va aggiornata da `/sync-docs` (il nuovo punto di lettura dei token è `headerBadge`).

## 6. Pagina per pagina

| Pagina | `.ph-back` | `.ph-eyebrow` | Badge | `.ph-side` | `.ph-toolbar` |
|---|---|---|---|---|---|
| `pipeline.html` | — | — | — | OPEN PIPELINE (`.pb-open*`, invariato) + `.ph-btn-primary` "+ New Proposal" | sì, contenuto attuale |
| `portfolio.html` overview | — | — | — | `.ph-btn-primary` "+ New Project" (disabilitato come oggi, con il suo `title`) | sì: ricerca, filtri, Sort, Card/List |
| `portfolio.html` project dashboard | "Project Portfolio" | riga Program attuale (label, nome, N projects, "Program Dashboard →") quando il progetto ha un programma | stage + status | `.ph-btn` Configure, Load Actuals, Planning, Share, con le icone attuali | — |
| `program.html` | "Project Portfolio" | "Program dashboard" | stage | `.ph-btn` Export (`download`), Share (`share`) | — |
| `costgrid.html` | "Pipeline", con "Saving…" e `goBack` invariati | — | stage | — | — |
| `project-config.html` | uno solo: "Project Dashboard" (`goProjectDashboard`) su un progetto esistente, "Portfolio" su uno nuovo | — | — | azioni attuali dell'header | — |
| `planning.html` | — | — | — | — | sì: il contenuto di `.page-toolbar` (righe 40-117), che sostituisce |
| `team`, `admin`, `attribute-lists`, `timesheets`, `profile-jobs` | — | — | — | CTA attuali (`.ph-btn-primary` / `.ph-btn`) | ricerca e filtri attuali, dove ci sono |
| `settings`, `_terms-editor` | — | — | — | azioni attuali | — |
| `_db-reset` | — | — | — | — | — |

- **Cost grid:** la banda contiene due righe: la prima con back, titolo, badge e sottotitolo; la seconda con
  selettore versioni (`.cg-version-seg*` invariato), azioni secondarie `.ph-btn` (Save `save`, Clone `clone`,
  Export XLS `download`, Share `share`), divisore e CTA `.ph-btn-primary` (Publish to SIP → / Generate project) o
  la nota "All tasks are in projects". La card `.cg-header` sparisce. Il banner "version locked" resta sotto la banda.
- **Titoli:** niente emoji (via "📁" da project-config, "📄" da `_terms-editor`, "⚠️" da `_db-reset`); i contatori
  passano in `.ph-sub` ("12 users", "8 resources", "5 lists").
- **`_db-reset`:** titolo "Database Reset" standard; sotto la banda un `.alert.alert-danger` con l'avvertimento
  già presente nella pagina.
- **Pulsanti "← Back" in fondo al form di project-config** (righe 320-321): restano, non sono header.
- **Master Data (`master-*.html`, 5 pagine):** fuori da questo ciclo, header invariato (vedi §10). Caricano comunque `js/lib/icons.js` prima di `js/nav.js` (§4), perché la sidebar ne dipende, e ricevono i bump `?v=`.
- **Viste multiple nello stesso file** (portfolio overview / project dashboard, schede di `team.html`): una `.ph`
  per vista, dentro il `v-if` della vista; le schede di team stanno sotto la banda.

## 7. Sotto i 1024px

- `.ph` va a capo: `.ph-side` scende sotto `.ph-main`, allineata a sinistra.
- `.ph-lbl-wide`/`.ph-lbl-narrow` riprendono le media query di `.pb-lbl-*`; le pagine che oggi le usano
  (pipeline) le mantengono, le altre non sono obbligate.
- Nessuna pagina ha scroll orizzontale causato da `.ph` o `.ph-toolbar` a 768px.

## 8. Test e verifica

- **Nuovo guard `js/lib/page-head-guard.test.js`**, su ogni pagina che chiama `initNav` tranne le cinque `master-*.html` (l'elenco lo ricava il guard cercando `initNav(` nei file `.html` della radice). Fallisce se:
  - una pagina non contiene almeno una `class="ph"` (o `class="ph …"`);
  - il testo di un `.ph-title` contiene un carattere emoji (Extended_Pictographic);
  - `css/pipeline.css`, `css/portfolio.css`, `css/costgrid.css`, `css/admin-crud.css` o `css/style.css` contengono
    ancora uno di questi selettori: `.pb-header`, `.pb-title`, `.pf-header`, `.pf-header-title`, `.pr-head`, `.pr-back`, `.pg-topline`, `.pg-header-row`, `.pg-title`, `.pg-label`, `.cg-header`, `.cg-header-name`, `.cg-back-link`, `.page-header`, `.page-title-bar`, `.page-toolbar` (le altre regole della lista di §2 possono restare, ristrette agli usi fuori dall'header — es. `.pr-action` alla riga 451 di `portfolio.html`);
  - `js/lib/icons.js` non è caricato prima di `js/nav.js`.
- `js/lib/icons.test.js`: `iconSvg` per un nome noto, per un nome sconosciuto, per la classe extra; ogni icona usata
  da `nav.js` esiste in `ICON_PATHS`.
- `headerBadge` testato in un test di `js/lib/` o accanto a quelli di `core.js` esistenti (il Piano sceglie dove,
  seguendo il precedente).
- `js/lib/tokens.test.js`: le nuove coppie `-soft-bg`/`-soft-text`.
- `?v=N`: aggiornati su tutte le pagine per ogni file versionato toccato (`style.css`, `tokens.css`, `core.js`,
  `nav.js`, `pipeline.css`, `portfolio.css`, `costgrid.css`, `admin-crud.css`); `icons.js` nasce con `?v=1`.
- `npm test` passa.
- **Verifica visiva** (§6.6): `scripts/shoot.mjs` contro lo stack di `scripts/test-branch.sh` (`--base
  http://localhost:8081`, `--settle 3000`), larghezze 1440, 1024 e 768, su pipeline, portfolio overview, project
  dashboard, program, cost grid, team e `_db-reset`. I PNG vengono riletti e confrontati con
  `header_pipeline_model.jpg`; gli scostamenti si presentano uno per uno.

## 9. Mappa tavole → sezioni

| Tavola | Sezioni |
|---|---|
| `header_pipeline_model.jpg` | §2 (valori), §3, §6 riga pipeline |
| `header_costgrid_to_be_updated.jpg` | §6 cost grid (card rimossa, due righe, banner sotto) |
| `header_portfolio_to_be_updated.jpg` | §6 portfolio overview (CTA magenta, toolbar in banda) |
| `header_program_dashboard_to_be_updated.jpg` | §5, §6 program (eyebrow, badge chiaro, secondari con icona) |
| `header_project_dashboard_to_be_updated.jpg` | §4, §5, §6 project dashboard (icone, due badge chiari) |
| `header_master_data_tobe updated.jpg` | nessuna: è l'input del futuro ciclo Master Data (§10) |

## 10. Fuori scope

Dal Brief: pagine pre-login e `terms.html`; cambi funzionali; header dei modali; contenuto sotto l'header (ciclo 2);
`index.html`, `config.html`, `test-cases.html`. In più: le cinque pagine `master-*.html`, che avranno un restyling dedicato (tavola `docs/superpowers/design/header/header_master_data_tobe updated.jpg`: titolo "Master Data" di pagina con sottotitolo, il sotto-menu laterale incorporato nella pagina come card, un secondo titolo per la sezione con la sua CTA) — decisione utente 2026-10-16, da non anticipare qui; la sidebar cambia solo la provenienza delle icone, non il
loro disegno né il layout.

## Decisioni aperte

1. **Classi CSS condivise, markup scritto a mano in ogni pagina.** Alternativa scartata: banda generata da `nav.js`
   o componente Vue `<page-head>` condiviso. Perché: titolo, badge e azioni sono legati ai dati Vue di ogni pagina,
   e le pagine admin hanno un header banale che non giustifica la registrazione di un componente in ogni app.
2. **Breadcrumb dentro la banda solo visivamente (CSS), non nel DOM.** Alternativa scartata: breadcrumb in uno slot
   del template Vue. Perché: la mount di Vue e i `v-if` di vista ricreano l'elemento e cancellano il breadcrumb iniettato.
3. **Sotto i 1024px il breadcrumb resta nascosto.** Alternativa scartata: mostrarlo nella banda anche su tablet.
   Perché: cambierebbe `nav-layout-guard` e l'altezza della board pipeline senza che il Brief lo chieda.
4. **Libreria icone in `js/lib/icons.js`, usata anche da `nav.js`.** Alternativa scartata: esporre `navIcon` di
   `nav.js` alle pagine. Perché: un modulo puro è testabile con vitest e rispetta la convenzione di `js/lib/`.
5. **Nuovi token chiari `--status-*-soft-*` per i badge di status.** Alternativa scartata: lo sfondo pieno attuale
   attenuato con opacità. Perché: il contrasto di una coppia con opacità non si calcola in `tokens.test.js`.
6. **project-config: un solo `.ph-back` ("Project Dashboard" o "Portfolio").** Alternativa scartata: due link indietro.
   Perché: il Brief chiede un link indietro unico e uguale ovunque.
7. **Un solo ciclo per tutte le pagine che chiamano `initNav`.** Alternativa scartata: due sotto-cicli (pagine fotografate, poi admin). Perché:
   le pagine admin cambiano poco e il guard le copre insieme alle altre. Master Data esclusa, vedi 8.
8. **Master Data fuori dal ciclo, header invariato.** Alternativa scartata: banda `.ph` dentro `.md-content`, a destra
   del sotto-menu. Perché: il restyling di Master Data (tavola `header_master_data_tobe updated.jpg`) cambia struttura —
   sotto-menu incorporato nella pagina e secondo titolo — e l'utente non vuole anticipare un modello che quel ciclo
   rifarebbe (decisione 2026-10-16, al passaggio Piano → Esecuzione).
