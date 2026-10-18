# Spec — header di pagina unificato, ciclo 2 di 2: contenuto sotto l'header

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-18-header-unification-content-brief.md` (Scenario 2).
**Tavole:** `docs/superpowers/design/header/`. Design concordato in chat il 2026-10-18 (una fermata, §6b).

## 0. Mappa tavola → sezione

| Tavola | Cosa dà a questo ciclo | Sezione |
|---|---|---|
| `header_pipeline_model.jpg` | banda e contenuto allineati a 24px | §4 (B-100) |
| `header_program_dashboard_to_be_updated.jpg` | tile bianche, bordo chiaro, raggio 12, nessuna ombra | §2, §3 |
| `header_project_dashboard_to_be_updated.jpg` | tile e card `Progress` con lo stesso aspetto | §2, §3 |
| `header_costgrid_to_be_updated.jpg` | banner locked giallo con bordo, separato dalla banda | §3 (banner), §4 |
| `header_portfolio_to_be_updated.jpg` | card del portfolio overview (bordo chiaro) | §3 |
| `header_master_data_tobe updated.jpg` | conferma lo stile card bordo-senza-ombra; la pagina è esclusa | §2 |

## 1. Stato attuale

Vedi il Brief, "Current behavior". Fatti in più, accertati in `/brainstorming` con `scripts/shoot.mjs` su `main`
(1440px, `--settle 3000`):

- Il banner locked del cost grid è già a 16px dalla banda: lo scostamento accettato al Gate 2 del ciclo 1 non si
  riproduce più.
- `body` ha tre sfondi: `--surface-subtle` (`css/style.css` riga 6) sulle pagine Vue, `--surface-light` in
  `css/admin-crud.css` riga 4 (admin, team, attribute-lists, profile-jobs, settings) e `#f8f9fa` inline in
  `timesheets.html` riga 12 e `_db-reset.html` riga 12; `settings.html` riga 13 usa `var(--bs-white)`.
  `timesheets.html`, `_db-reset.html`, `settings.html` e `_terms-editor.html` ridefiniscono anche `font-family`.
- In planning `body.pp-fullwidth` (`css/style.css` riga 461) cambia solo il padding (24 → 12px), perché
  `.app-container` ha già `max-width: 100%`: è l'unico effetto del toggle Full width/Compact.
- Le master-* non caricano `admin-crud.css` e definiscono `.alert-sm` inline (riga 53 di ciascuna).
  `project-config.html` non usa `.section-card`, `.card` né `.alert-sm`; `.cfg-section` è usata solo lì.
- `js/costgrid.js` riga 193 genera `section-card` anche a runtime.
- `portfolio.html` riga 104: la card del summary fissato è una `.section-card` con bordo `2px var(--indigo-500)`
  e testata `var(--indigo-50)` inline.

## 2. Token di componente (`css/tokens.css`)

Nuovi token, ciascuno definito con token esistenti:

```css
--card-bg: var(--surface-white);
--card-border: 1px solid var(--border-light);
--card-radius: var(--radius-lg);
--card-shadow: none;
--card-pad: var(--space-4);
--card-head-pad: var(--space-3) var(--space-4);
--card-danger-border: 1px solid var(--color-danger);

--tile-pad: var(--space-3) var(--space-4);
--tile-label-size: var(--text-2xs);
--tile-value-size: 1.375rem;

--banner-radius: var(--radius-sm);
--banner-pad: var(--space-2) var(--space-3);
--banner-font-size: var(--text-sm);

--content-gap: var(--space-4);
```

`--tile-value-size` è l'unico valore nuovo, e lo fissa questa riga. `--color-danger` esiste già (`css/tokens.css` riga 68).

## 3. Componenti

Le classi tengono il nome; ogni proprietà elencata legge il token.

- **Card**:
  - `.section-card` e `.section-header` (`css/style.css` righe 300-311): `background`, `border`, `border-radius`,
    `box-shadow`, padding della testata. Raggiunge planning, costgrid (`.cg-section-card`, `.cg-grid-card`) e la
    card generata da `js/costgrid.js`.
  - `.cg-grid-card-header` (`css/costgrid.css` righe 327-335): `padding: 13px 18px` → `--card-head-pad`.
  - `.pg-card`, `.pr-card`, `.pr-card-head`, `.pf-card` (`css/portfolio.css`). `.pf-card` passa da
    `--border-medium` a `--border-light`.
  - `.card` di `css/admin-crud.css` riga 6. Le copie inline di `timesheets.html` riga 18 e `_terms-editor.html`
    riga 14 non si toccano: vanno in un ciclo a parte (§7, voce 9).
  - `.danger-card` (`_db-reset.html` righe 21-30): una card con `--card-danger-border`. `h5` e `p` prendono
    `--color-danger-text` e `--text-muted` al posto di `#dc3545`/`#6c757d`.
  - Il summary fissato di `portfolio.html` riga 104 tiene il suo bordo indigo inline (§7, voce 10).
- **Tile**: `.pg-tile` (`css/portfolio.css` righe 255-264) legge `--tile-pad`, `--tile-label-size` e
  `--tile-value-size`. `.pr-kpis .pg-tile` e `.pr-kpis .pg-tile-value` perdono padding e `font-size` (righe 486-487);
  restano `display: flex`, `flex-wrap`, `align-items`, `white-space` del valore.
- **Banner**:
  - `.cg-banner` (`css/costgrid.css` righe 110-119): raggio, padding e `font-size` dai token, `margin-bottom` da
    `--content-gap`.
  - `.alert-sm` si definisce una volta sola in `css/style.css`, con i token banner. Spariscono le copie di
    `css/admin-crud.css` riga 25, `timesheets.html` riga 32 e `_terms-editor.html` riga 15. Le master-* tengono la
    loro.
  - Gli alert nel flusso del contenuto delle pagine in scope passano a `alert-sm`: `costgrid.html` riga 25 e
    `planning.html` riga 34 (oggi `m-4`), `_db-reset.html` righe 51 e 53. Restano come sono gli alert dentro i modali
    (`costgrid.html` righe 608, 633, 723), nel pannello Team assistant (`planning.html` riga 165) e quelli generati
    dentro le viste di planning (righe 407-1176): sono contenuto interno, fuori scope.
  - Le regole globali di `.alert` di Bootstrap non cambiano.
- **Sfondo e font**: spariscono gli override di `body` in `css/admin-crud.css` riga 4, `timesheets.html` riga 12,
  `_db-reset.html` riga 12, `settings.html` riga 13 e `_terms-editor.html` riga 12. Vale `css/style.css` righe 5-12.
- **`.kpi-card`** (`css/style.css` righe 275-281) si cancella.

## 4. Spaziature

- `.page` (`css/admin-crud.css` riga 5; inline in `timesheets.html` riga 15, `settings.html` riga 14,
  `_db-reset.html` riga 13, `_terms-editor.html` riga 13) → `margin: var(--content-gap) auto`. Le copie inline
  spariscono dove la pagina carica `admin-crud.css`; le altre leggono il token.
- `.app-container .ph` e `.app-container .ph-toolbar` (`css/style.css` righe 106-108) → `margin-bottom:
  var(--content-gap)`.
- **B-100**: dentro `.app-container`, `.ph` e `.ph-toolbar` hanno `padding-left`/`padding-right: var(--app-pad)`.
  Spariscono `.app-container { --app-pad: 12px; }` di `portfolio.html` riga 15 e `program.html` riga 15.
  `body.pp-fullwidth` resta a 12px e la banda lo segue. Fuori da `.app-container` (pipeline, pagine admin) la banda
  resta a `--space-6`, che è anche il `--app-pad` di default.

## 5. Follow-up del ciclo 1

- **B-096**: le regole `.ph`, `.ph-title`, `.ph-sub`, `.ph-side`, `.ph-btn-primary`, `.ph-toolbar` di
  `css/pipeline.css` righe 250-262 passano nel blocco `@media (max-width: 767.98px)` di `css/style.css`. Le `.pb-*`
  restano in `pipeline.css`.
- **B-101**: `.ph-btn-primary` prende `display: inline-flex; align-items: center; height: 32px; padding: 0
  var(--space-4)`. Il `min-height: 44px` phone resta.
- **B-099**: `costgrid.html` riga 34 e `portfolio.html` riga 356 → `<span v-if="headerBadge(…)" v-html="headerBadge(…)">`.
- **Toolbar di planning** (`planning.html` righe 123-126) (il bottone 📋 Copy, riga 228, sta nel modale JSON viewer: fuori scope come i modali):
  - classe `ph-btn` e `<ph-icon>` al posto dell'emoji; planning registra `.component('ph-icon', window.PhIcon)`;
  - icone: Team assistant `team`, Load XLS `upload`, Export XLS `download`, Full width `maximize`, Compact
    `minimize`. `maximize` e `minimize` entrano in `ICON_PATHS` (`js/lib/icons.js`), nello stile
    di tratto delle icone esistenti;
  - le frecce `◀+ −▷ ◁− +▶` restano.

## 6. Test e verifica

- Nuovo `js/lib/content-surface-guard.test.js`:
  - le regole di `.section-card`, `.section-header`, `.pg-card`, `.pr-card`, `.pf-card`, `.pg-tile`, `.cg-banner`,
    `.alert-sm`, `.card` (solo `admin-crud.css`), `.danger-card`, `.page` non contengono hex, `rgb(a)` né
    misure in px/rem letterali per bordo, raggio, ombra, padding e margine, e leggono i token di §2;
  - `.alert-sm` è definita una volta sola fra `css/*.css` e le pagine in scope;
  - nessuna pagina in scope ridefinisce `background` o `font-family` di `body`;
  - `portfolio.html` e `program.html` non ridefiniscono `--app-pad`;
  - nessun bottone della `.ph-toolbar` di `planning.html` contiene emoji (stessa regex di `page-head-guard.test.js`);
  - `.kpi-card` non esiste più.
- **Pagine escluse**: il guard verifica che l'inline `<style>` delle master-* e di `project-config.html` non cambi
  (confronto con un'impronta registrata nel test) e che `.cfg-section` resti in `css/style.css` invariata.
- Aggiornati: `js/lib/page-head-guard.test.js` (B-096: le regole phone in `style.css`, non in `pipeline.css`; B-101),
  `js/lib/icons.test.js` (le tre icone nuove), `js/lib/tokens.test.js` se una coppia testo/sfondo nuova entra nei
  token.
- Cache-busting: ogni file versionato toccato aggiorna tutti i suoi `?v=N` (`tokens.css`, `style.css`,
  `admin-crud.css`, `portfolio.css`, `costgrid.css`, `pipeline.css`, `js/lib/icons.js`).
- `npm test` passa.
- Verifica visiva: `scripts/shoot.mjs` a 1440 e 375 su portfolio (overview e project dashboard), program, planning,
  costgrid, admin, team, attribute-lists, timesheets, profile-jobs, settings, _db-reset, _terms-editor; più pipeline
  e project-config a 375 per B-096. Gli scatti si rileggono e si confrontano con le tavole program e project
  dashboard e con gli scatti di `main`. Da un worktree: `scripts/test-branch.sh up`, `--base
  http://localhost:8081`, `MSYS_NO_PATHCONV=1` per gli URL senza query string.

## 7. Fuori scope

Come il Brief: master-*, project-config, pre-login e `terms.html`, card kanban e pannello dettaglio della pipeline,
tabelle, form, modali, grafici e contenuto interno delle card, gli altri follow-up del ciclo 1, ridisegni e cambi
funzionali. In più, deciso alla riapertura del gate: le copie inline di `.card` in `timesheets.html` e
`_terms-editor.html` (ciclo a parte per uniformare le card di quelle pagine; il Gate 5 aggiunge la voce a
`docs/BACKLOG.md`).

## Decisioni aperte

1. **Token di componente letti dalle classi per pagina, con deduplica solo delle copie.** Alternativa scartata:
   classi condivise nuove (`.pd-card`, `.pd-tile`) in tutto il markup. Perché: lo stesso risultato visivo tocca meno
   markup su pagine che il ciclo non ridisegna.
2. **Card con bordo e senza ombra.** Alternativa scartata: ombra senza bordo (`.section-card`). Perché: è ciò che
   mostrano le tavole program, project dashboard e Master Data.
3. **Valore della tile a 1.375rem (project dashboard).** Alternativa scartata: `--text-xl` (program). Perché: il
   project dashboard è il redesign più recente.
4. **`.danger-card` con bordo a 1px.** Alternativa scartata: 2px. Perché: è l'unica card a 2px; il colore basta.
5. **B-100: contenuto a 24px e banda che segue `--app-pad`.** Alternativa scartata: banda a 12px ovunque. Perché:
   24px è il valore della tavola modello; planning in full width resta a 12px perché il toggle non ha altro effetto.
6. **Le regole globali di `.alert` di Bootstrap non cambiano.** Alternativa scartata: tokenizzarle. Perché:
   raggiungerebbero project-config e master-*.
7. **Icone di planning: `team` più due nuove (`maximize`, `minimize`); le frecce di testo restano.**
   Alternativa scartata: sostituire anche le frecce. Perché: non sono emoji.
8. **Il layout phone di B-096 vale anche per l'header di project-config.** Alternativa scartata: escluderla con un
   selettore. Perché: l'esclusione riguarda il contenuto, e l'header è condiviso dal ciclo 1.
9. **Le copie inline di `.card` in `timesheets.html` e `_terms-editor.html` escono dal ciclo e restano come sono.**
   Alternativa scartata: farle caricare `admin-crud.css` e cancellarle, oppure tenerle ma con i token. Perché: deciso
   dall'utente alla riapertura del gate; le card di quelle pagine avranno un ciclo dedicato. Il criterio 2 del Brief
   vale per le altre pagine.
10. **Il summary fissato di `portfolio.html` tiene il bordo indigo a 2px e la testata colorata inline.**
    Alternativa scartata: portarlo alla card standard. Perché: è un evidenziatore voluto, non una divergenza.
    (Nata scrivendo la spec.)
11. **Il testo dei banner a `--text-sm` (14px).** Alternativa scartata: tenere 13.3px per `.alert-sm` e 15px per
    `.cg-banner`. Perché: un banner deve avere un solo corpo; 14px è il token più vicino a entrambi. (Nata scrivendo
    la spec.)
