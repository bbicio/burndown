# Brief — header di pagina unificato, ciclo 2 di 2: contenuto sotto l'header

**Brief started:** 2026-10-18 (avvio di `/feature-brief`)
**Classificazione (dichiarata dall'utente, 2026-10-18):** Scenario 2 (evoluzione).
**Ciclo precedente:** ciclo 1 mergiato il 2026-10-16 (`eb0c6e9`, docs `c25275d`). Brief
`docs/superpowers/briefs/2026-10-16-header-unification-brief.md` (rimanda al ciclo 2 nell'"Explicitly excluded
scope"), spec `docs/superpowers/specs/2026-10-16-header-unification-design.md`, report
`docs/superpowers/reports/2026-10-16-header-unification-finish-cycle.md`.
**Riferimento visivo:** `docs/superpowers/design/header/header_pipeline_model.jpg` (modello). Le
`*_to_be_updated.jpg` mostrano lo stato precedente al ciclo 1. Non esistono tavole del contenuto sotto l'header.
**Obiettivo dichiarato dall'utente:** KPI tile, card di sezione, banner/alert e spaziature fra banda e contenuto
uniformati con token comuni, **senza ridisegno**.

## Current behavior

### KPI tile

- `.pg-tile` (`css/portfolio.css` righe 255-275): bianco, bordo `--border-light`, `--radius-lg`, padding
  `--space-3`, etichetta `--text-2xs` uppercase, valore `--text-xl` bold navy. Griglia `.pg-kpis` a 4 colonne
  (riga 254). Usata da `program.html` (riga 55).
- Il project dashboard di `portfolio.html` (riga 381) usa `.pg-kpis.pr-kpis` e sovrascrive padding
  (`--space-3 --space-4`) e dimensione del valore (`1.375rem`, letterale) in `css/portfolio.css` righe 485-487.
- La card del portfolio overview `.pf-card` (`css/portfolio.css` righe 53-57) contiene le metriche
  `.pf-card-metrics` (riga 86). Ha il bordo `--border-medium`, non `--border-light` come `.pg-tile`.
- `.kpi-card` (`css/style.css` righe 275-281): `grep -l kpi-card *.html js/*.js` non trova nessun uso.

### Card di sezione: una famiglia per pagina

| Classe | Dove è definita | Bordo / ombra | Raggio | Padding | Usata da |
|---|---|---|---|---|---|
| `.section-card` + `.section-header` | `css/style.css` righe 300-311 | nessun bordo, `--shadow-sm` | `--radius-lg` | header `13px 18px` (letterali) | `planning.html` riga 129, `costgrid.html` (`.cg-section-card`, `.cg-grid-card`) |
| `.pg-card` | `css/portfolio.css` righe 281-287 | `--border-light`, nessuna ombra | `--radius-lg` | `--space-4` | `program.html` |
| `.pr-card` | `css/portfolio.css` righe 498-507 | `--border-light`, nessuna ombra | `--radius-lg` | testata `--space-3 --space-4` | `portfolio.html` (project dashboard) |
| `.pf-card` | `css/portfolio.css` righe 53-57 | `--border-medium` | `--radius-lg` | `--space-4` | `portfolio.html` (overview) |
| `.cfg-section` | `css/style.css` righe 338-339 | sfondo `--surface-light`, niente bordo | `--radius-md` | `16px 18px` (letterali) | `project-config.html` |
| `.card` (Bootstrap ridefinita) | `css/admin-crud.css` righe 6-7 | `--border-light`, `--shadow-sm` | `10px` (letterale) | `.card-body` a 0 | `admin`, `team`, `attribute-lists`, `profile-jobs`, `settings` (le pagine che caricano `admin-crud.css`) |
| `.card` (copia inline) | `timesheets.html` righe 18-19, `_terms-editor.html` riga 14 | `#e5e7eb`, `rgba(...)` (hex letterali) | `10px` | — | `timesheets.html`, `_terms-editor.html` |
| `.danger-card` | `_db-reset.html` righe 21-30 | `2px solid #dc3545` (hex) | `12px` | `1.5rem` | `_db-reset.html` |

### Banner e alert

- `.cg-banner` (`css/costgrid.css` righe 110-140): locked (warning) e draft, `--radius-sm`, padding `8px 14px`,
  `margin-bottom: 16px` (letterali); markup `costgrid.html` righe 79-85.
- Alert Bootstrap: i colori `--bs-alert-*` per success/danger/warning/info sono ridefiniti in `css/style.css`
  righe 439-442. `.alert-sm` è definito tre volte: `css/admin-crud.css` riga 25, `timesheets.html` riga 32,
  `_terms-editor.html` riga 15.
- Il banner viewer di `project-config.html` (riga 42) è un `.alert-info` con stile inline
  (`position:sticky;top:0;z-index:100;font-size:.85rem`) e `rounded-0`.
- Le pagine scelgono margini e padding degli alert con utility Bootstrap diverse (`m-4`, `mb-3`, `py-2 small`,
  `py-1 px-2 small mb-2`).

### Spaziatura fra banda e contenuto

- Pagine Vue dentro `.app-container`: `margin-bottom: var(--space-4)` (16px) sotto l'ultima banda
  (`css/style.css` righe 104-108).
- Pagine admin: la banda sta fuori da `.page.app-container` (es. `admin.html` righe 32-42), e `.page` ha
  `margin: 2rem auto` (`css/admin-crud.css` riga 5, `timesheets.html` riga 15) o `3rem auto` (`settings.html`
  riga 14, `_db-reset.html` riga 13, `_terms-editor.html` riga 13).
- Scostamento accettato al Gate 2 del ciclo 1: il banner "version locked" del cost grid tocca la banda. Dal CSS
  la regola di riga 106 dovrebbe dargli 16px; va verificato con uno screenshot prima di trattarlo come difetto.

### Follow-up del ciclo 1 inclusi

- **B-100**: la banda `.ph` ha `padding: var(--space-3) var(--space-6)` (`css/style.css` riga 46), cioè 24px
  di lato. Il contenuto usa `--app-pad`, che vale 12px su `portfolio.html` riga 15, `program.html` riga 15 e
  `body.pp-fullwidth` (`css/style.css` riga 461, planning). I bordi sinistri del titolo e del contenuto quindi
  non sono allineati.
- **B-096**: il layout phone di `.ph` (colonna, titolo 20px, `.ph-sub` nascosto, CTA alta 44px) sta in
  `css/pipeline.css` righe 250-258, senza scope. Lo ottiene solo pipeline.
- **B-101**: `.ph-btn-primary` (`css/style.css` righe 76-80) non ha un'altezza fissa e il suo padding è
  `--space-2`; `.ph-btn` (righe 84-89) è alto 32px. Le due altezze non sono mai state misurate insieme.
- **B-099**: ogni `headerBadge` è reso in un `<span v-html>` proprio (`costgrid.html` riga 34,
  `portfolio.html` riga 356). Lo span resta anche quando il badge è `''` e aggiunge un gap in `.ph-title-row`.

### Emoji nella toolbar di planning

- `planning.html` righe 123-126: `🤖 Team assistant`, `📂 Load XLS`, `⊡ Compact` / `⛶ Full width`,
  `⬇ Export XLS`, in `btn btn-outline-secondary btn-sm` Bootstrap, non in `.ph-btn`. Riga 228: `📋 Copy`.
- Le icone condivise stanno in `js/lib/icons.js` (`ICON_PATHS`), già caricato da ogni pagina autenticata
  (`js/lib/page-head-guard.test.js`).

## Expected behavior

- KPI tile, card di sezione e banner/alert delle pagine in scope condividono gli stessi valori di bordo, raggio,
  ombra, sfondo, padding e tipografia dell'etichetta/titolo, presi da token comuni. Lo stesso tipo di elemento
  ha lo stesso aspetto su ogni pagina.
- Nessun ridisegno: layout, griglie, contenuto e gerarchia delle card restano come sono. Cambiano solo i valori
  che oggi divergono da pagina a pagina.
- Stessa distanza fra l'ultima banda e il contenuto su tutte le pagine, admin comprese.
- Il bordo sinistro del testo della banda è allineato con quello del contenuto (B-100).
- Il layout phone di `.ph` vale per tutte le pagine (B-096).
- CTA primaria e secondari dell'header hanno la stessa altezza (B-101).
- Un badge vuoto non lascia gap nella riga del titolo (B-099).
- I bottoni della toolbar di planning usano icone di `js/lib/icons.js` al posto delle emoji, con lo stesso
  comportamento.
- I letterali (hex, px, rem) delle regole toccate diventano token.
- Sfondo della pagina e font uguali su tutte le pagine in scope (aggiunto in /brainstorming, 2026-10-18).

## Constraints

- Rischio probabile **high-risk**: tocca file condivisi caricati da più pagine (`css/style.css`, `css/tokens.css`,
  probabilmente `css/admin-crud.css` e `css/portfolio.css`).
- Nessun cambio funzionale.
- Cache-busting: a ogni file versionato che cambia si aggiornano tutti i suoi `?v=N`
  (`js/lib/foundations-guard.test.js`, `js/lib/nav-shell-guard.test.js`).
- Ogni coppia testo/sfondo in `tokens.css` resta ≥ 4.5:1 (`js/lib/tokens.test.js`).
- `#app-shell`/`#app-main` senza `overflow`/`transform`/`filter`/`contain`/`will-change`/`position`
  (`js/lib/nav-shell-guard.test.js`).
- `css/auth.css` (pre-login) non si tocca, neanche per eliminare la sua copia delle regole degli alert.
- Testo visibile all'utente in inglese.
- Modifiche agli HTML con lo strumento Edit, non con `Get-Content`/`Set-Content` di PowerShell (aggiunge il BOM).
- La verifica visiva rilegge i PNG di `scripts/shoot.mjs` per ogni pagina toccata, desktop e phone
  (PROCESS.md §6.3/§6.6). Non avendo tavole per il contenuto, il riferimento è il modello pipeline più lo stato
  prima del ciclo.

## Acceptance criteria

1. Ogni KPI tile delle pagine in scope usa gli stessi token per bordo, raggio, padding, etichetta e valore.
   Nessuna pagina sovrascrive questi valori con un letterale.
2. Ogni card di sezione delle pagine in scope usa gli stessi token per bordo, ombra, raggio e padding della
   testata. (Le copie inline di `.card` in `timesheets.html` e `_terms-editor.html` sono escluse, vedi sotto.)
3. `.alert-sm` è definito una volta sola. Banner e alert sotto l'header (incluso `.cg-banner` e il banner viewer di
   `project-config.html`) usano token per raggio, padding e margine, e nessuno stile inline.
4. Nelle regole toccate da questo ciclo non restano hex né `rgba` letterali (lo controlla un test o un grep
   documentato nella spec).
5. La distanza fra l'ultima banda e il contenuto è identica su tutte le pagine in scope, misurata sugli
   screenshot di `scripts/shoot.mjs`.
6. Su portfolio, program e planning (anche in full width) il bordo sinistro del titolo della banda e quello del
   contenuto coincidono (B-100).
7. Sotto i 768px ogni pagina con `.ph` ha il layout phone oggi limitato a pipeline, e quelle regole non stanno più
   in `css/pipeline.css` (B-096).
8. `.ph-btn-primary` e `.ph-btn` hanno la stessa altezza renderizzata (B-101).
9. Con un badge vuoto, `.ph-title-row` non contiene un elemento vuoto (B-099).
10. Nessun bottone della toolbar di planning contiene emoji. Le icone vengono da `js/lib/icons.js` e le azioni
    fanno quello che facevano prima.
11. Il banner "version locked" del cost grid ha la stessa distanza dalla banda degli altri contenuti.
12. Sotto i 1024px nessuna pagina in scope ha uno scroll orizzontale.
13. Nessun cambio funzionale.
14. `npm test` passa, compresi i guard aggiornati o nuovi.

## Explicitly excluded scope (confermato dall'utente)

- Le 5 pagine `master-*.html`: il restyling di Master Data è un ciclo a parte (tavola
  `header_master_data_tobe updated.jpg`).
- Pagine pre-login e `terms.html` (login, activate, reset-password, terms), e quindi `css/auth.css`.
- Tabelle, controlli di form e modali.
- Grafici (colori, layout) e contenuto interno delle card (griglia del cost grid, tabelle di planning): si
  uniforma solo il contenitore.
- Gli altri follow-up del ciclo 1 (B-093, B-094, B-095, B-097, B-098, B-102, B-103, B-104) restano nel backlog.
- `project-config.html`: avrà un ciclo di redesign dedicato con tavole nuove (deciso in /brainstorming, 2026-10-18).
- Le card kanban `.pb-card` e il pannello dettaglio della board pipeline (deciso in /brainstorming, 2026-10-18).
- Le card di `timesheets.html` e `_terms-editor.html` (copie inline di `.card`): ciclo a parte per uniformarle
  (deciso alla riapertura del gate della spec, 2026-10-18).
- Qualsiasi ridisegno o cambio funzionale.

## Open questions per /brainstorming

- Forma: nuovi token in `tokens.css` (`--card-*`, `--tile-*`, `--banner-*`) adottati dalle classi di ogni
  pagina, classi condivise in `style.css` sul modello di `.ph-*`, o entrambe (l'utente ha lasciato la scelta a
  /brainstorming).
- Quando due famiglie divergono (es. `.section-card` con ombra e senza bordo, `.pg-card` con bordo e senza ombra;
  `.pf-card` con `--border-medium`), quale valore vince? Il modello pipeline non mostra card di sezione.
- Le card kanban `.pb-card` della board pipeline e il pannello dettaglio: l'utente non le ha escluse. Rientrano
  come card da uniformare o sono un elemento a parte?
- `.cfg-section` di project-config (sfondo grigio, senza bordo) è una card di sezione da allineare alle altre o
  un raggruppamento di form?
- `.danger-card` di `_db-reset.html`: la si allinea alle card comuni tenendo il bordo rosso come variante, o
  basta tokenizzarla?
- B-100: si allinea portando la banda a `--app-pad`, portando `--app-pad` a 24px, o rendendo la banda dipendente
  da `--app-pad`?
- Admin: si porta la banda dentro `.page.app-container` o si cambia il margine di `.page`? Il valore di `3rem` di
  settings/_db-reset/_terms-editor segue la stessa regola?
- Toolbar di planning: i bottoni diventano `.ph-btn` o restano Bootstrap con l'icona al posto dell'emoji? Mancano
  icone in `ICON_PATHS` (robot/assistant, folder, expand/compress, download, copy)? Le frecce di testo
  `◀+ −▷ ◁− +▶` entrano nel ciclo?
- `.kpi-card` di `style.css` non ha usi: si cancella in questo ciclo?
- Scostamento "banner locked tocca la banda": il CSS dice 16px. Va confermato con uno screenshot prima di
  progettare un fix.
