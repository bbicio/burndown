# Master Data — shared shell (phase 1) — design spec

**Date:** 2026-11-03
**Brief started:** unknown
**Brief:** `docs/superpowers/design/Master-data/brief-master-data-shell-claude-code.md`
**Scenario:** 2 (evoluzione)

Fase 1 del redesign Master Data (pagina 10): le cinque pagine `master-clients.html`, `master-client-groups.html`,
`master-pipelines.html`, `master-roles.html`, `master-currencies.html` ricevono lo stesso page head, la stessa
sotto-navigazione e la stessa cornice di contenuto, su desktop, tablet e smartphone. Il contenuto di ogni pagina
(tabelle, form, tab, modali, empty state, testi, chiamate API) non cambia.

## 1. Obiettivo

- Page head condiviso `.ph`, titolo "Master Data", stesso sottotitolo su tutte e cinque.
- Sotto-navigazione raggruppata (2 gruppi, 4 voci) generata da una sola definizione.
- Contenuto dentro una card, con il nome della sezione come prima riga.
- Tablet: riga di tab; smartphone: selettore di sezione.

## 2. Fatti verificati nel codice (a `7c540e3`)

- Ogni pagina ha a mano `<div class="md-layout"><nav class="md-subnav">` con 5 link piatti, poi
  `<div class="md-content"><div id="app" v-cloak>` (es. `master-roles.html:65-75`).
- Ogni pagina ha nel proprio `<style>` `body { background: #f8f9fa; … }`, `.page { margin: 2rem auto; }` e le regole
  `.page-header` / `.page-header h1` (2.5rem) (`master-roles.html:12-16`).
- Dentro la root Vue: spinner di loading, blocco "Admin access required." con `🔒` (riga 85), poi
  `<div class="page app-container" v-else>` con un `.page-header` che contiene **solo** `<h1>` e una descrizione
  muted (righe 94-99). **Nessuna pagina ha controlli accanto all'`<h1>`.**
- `initNav('config', { breadcrumbs: [{ label: 'Home', href: '/pipeline.html' }, { label: 'Master Data' }] })`.
- `css/style.css:129-156`: `.md-layout`/`.md-subnav`/`.md-content`; riga sotto 1024px, colonna sticky di 200px
  da 1024px in su, `.md-content` con `border-left`.
- `css/style.css:44-125`: componente `.ph` (fascia bianca, `border-bottom`, titolo 26px, 20px e sottotitolo
  nascosto sotto 768px).
- `css/tokens.css`: `--card-bg`, `--card-border`, `--card-radius`, `--card-pad`, `--card-head-pad`.
- `js/lib/icons.js` esporta `iconSvg(name, size, cls)` e `PhIcon`, e ha l'icona `lock`; le pagine lo caricano già
  (`master-clients.html:236`).
- Il bottom sheet del Reporting (`.pr-sheet`) è definito in `css/portfolio.css:765-786`, locale a quella pagina.
- `js/lib/page-head-guard.test.js`: le 5 pagine sono in `EXCLUDED`; `.page-header` è vietato per 6 pagine admin.
- `js/lib/master-data-guard.test.js`: verifica i 5 link scritti a mano, il wrapper e il breadcrumb a 2 livelli.

## 3. Mappa tavola → sezione

| Tavola | Contenuto | Sezione |
|---|---|---|
| `10.2a.jpg` (desktop) | breadcrumb, page head, sub-nav raggruppata, header della card | §4, §5, §6 |
| `10.2e.jpg` — frame tablet 1024×768 | riga di tab sotto il titolo | §7 |
| `10.2e.jpg` — frame phone 390 "Clients" | selettore di sezione | §7 |
| `10.2e.jpg` — frame phone 390 "Rate card"; in tutte le tavole: tabelle, toolbar, segmented, search, bottoni | contenuto delle pagine | fuori scope (§11) |

## 4. Shell della pagina

In ogni pagina, dentro `#app-main`, fuori dalla root Vue:

```html
<div class="ph">
  <div class="ph-main">
    <div class="ph-title-row"><h1 class="ph-title">Master Data</h1></div>
    <div class="ph-sub">Clients, pipelines, roles, rates and currencies used across the app.</div>
  </div>
</div>
<div class="md-layout">
  <nav class="md-subnav" data-md-active="<id>" aria-label="Master Data"></nav>
  <div class="md-content">
    <div id="app" v-cloak> … §6 … </div>
  </div>
</div>
```

- Nessuna `.ph-side`. Il `.ph` è statico (visibile prima del mount di Vue).
- Breadcrumb: `[{ label: 'Home', href: '/pipeline.html' }, { label: 'Master Data', href: '/master-clients.html' },
  { label: '<Sezione>' }]`, dove `<Sezione>` è il titolo della card (§6). Nessun quarto livello: la rate card è un modale.
- Si rimuovono dal `<style>` locale `body { background … }`, `.page` e `.page-header*`; lo sfondo è quello di
  `css/style.css`. `font-family` del `body` locale si rimuove (la dà `style.css`).

## 5. Sotto-navigazione — `js/lib/md-subnav.js` (nuovo)

Modulo ES con bridge `window.*` (convenzione `js/lib/`), caricato con `<script type="module" src="js/lib/md-subnav.js?v=1">`.

- `MD_SECTIONS`: `[{ group: 'COMMERCIAL', items: [{ id: 'clients', label: 'Clients & groups', href: '/master-clients.html' },
  { id: 'pipelines', label: 'Pipelines & POTs', href: '/master-pipelines.html' }] },
  { group: 'FINANCIAL', items: [{ id: 'roles', label: 'Roles & rates', href: '/master-roles.html' },
  { id: 'currencies', label: 'Currencies', href: '/master-currencies.html' }] }]`.
- `mdSubnavHtml(activeId)` (pura) restituisce:
  - la lista: per gruppo un `<div class="md-subnav-group">` con etichetta, poi un `<a class="md-subnav-item" href>`
    per voce; la voce attiva ha `class="… active"` e `aria-current="page"`;
  - il selettore phone: `<div class="md-subnav-select">` con gruppo e sezione correnti, chevron (`iconSvg`), e un
    `<select aria-label="Master Data section">` trasparente sovrapposto, con un `<optgroup>` per gruppo e l'opzione
    attiva `selected`.
  - Un `activeId` sconosciuto non marca nulla come attivo.
- `mountMdSubnav(root = document)`: per ogni `nav.md-subnav[data-md-active]` imposta `innerHTML` e collega il
  `change` del select a `location.href = value`. Il modulo lo esegue al caricamento.
- `data-md-active` per pagina: clients → `clients`, client-groups → `clients` (brief §7), pipelines → `pipelines`,
  roles → `roles`, currencies → `currencies`.
- Niente conteggi.

## 6. Card del contenuto

La root Vue contiene:

```html
<section class="md-card">
  <div class="md-card-head">
    <h2 class="md-card-title"><Sezione></h2>
    <p class="md-card-desc"><descrizione attuale></p>
  </div>
  <div class="md-card-body"> loading | access denied | contenuto attuale </div>
</section>
```

- `<Sezione>`: Clients, Client Groups, Pipelines &amp; POTs, Roles &amp; rates, Currencies (il nome attuale dell'`<h1>`).
- `<descrizione attuale>`: il testo muted che oggi sta sotto l'`<h1>`, invariato.
- Il `.page-header` sparisce; il wrapper `<div class="page app-container" v-else>` resta (perde solo il margine
  di `.page`), con tutto il suo contenuto invariato — `globalError`, `.section-title` con i loro bottoni, tab, tabelle.
- Nessun controllo si sposta nell'header della card (§2: non ce n'è accanto all'`<h1>`; i controlli di sezione
  restano nel corpo, decisione 10).
- Access denied: `🔒` sostituito da `iconSvg('lock', 16)` (stroke SVG); testo e bottone invariati. Poiché il blocco
  è un template Vue, l'icona passa da `<ph-icon name="lock">` registrando `PhIcon` sull'app, oppure da
  `v-html` di `iconSvg` — sceglie il Piano in base a ciò che la pagina registra già.
- Stili in `css/style.css`: `.md-card { background: var(--card-bg); border: var(--card-border); border-radius:
  var(--card-radius); align-self: flex-start; min-width: 0; }`, `.md-card-head { padding: var(--card-head-pad); }`,
  `.md-card-title { font-size: 15px; font-weight: var(--weight-bold); color: var(--brand-navy); margin: 0; }`,
  `.md-card-desc` muted `--text-sm`, `.md-card-body { padding: 0 var(--card-pad) var(--card-pad); }`.

## 7. Layout e responsive

Breakpoint esistenti: 1024 e 768. Valori della tavola portati al token più vicino (decisione 5).

**Desktop ≥ 1024px.**
- `.md-layout`: `display:flex; gap: var(--space-5); padding: var(--space-4) var(--space-6) var(--space-6)`.
- `.md-subnav`: `flex: 0 0 196px`, `--card-bg`, `--card-border`, `--radius-lg`, padding `6px 6px 10px`,
  `position: sticky; top: var(--space-4); align-self: flex-start`.
- `.md-subnav-group`: 10px, 700, uppercase, `letter-spacing:.06em`, `--text-muted`, padding `12px 10px 4px`.
- `.md-subnav-item`: `display:flex; align-items:center; justify-content:space-between; height:34px;
  padding:0 10px; border-radius: var(--radius-md); font-size:12.5px; font-weight:500; color: var(--text-secondary)`;
  hover `background: var(--surface-subtle)`; `.active`: 700, `--brand-navy`, `--surface-subtle`,
  `box-shadow: inset 3px 0 0 var(--brand-magenta)`.
- `.md-content`: `flex:1; min-width:0`, senza `border-left`.
- `.md-subnav-select` nascosto.

**Tablet 768–1023.98px.**
- `.md-layout`: blocco; `.md-subnav` diventa fascia bianca a tutta larghezza sotto il `.ph`: `display:flex;
  overflow-x:auto; scrollbar-width:none` (+ `::-webkit-scrollbar { display:none }`), padding `10px 20px`,
  `border-bottom: 1px solid var(--border-light)`, nessun bordo/radius/sticky.
- `.md-subnav-group` nascosto (le voci restano in fila); `.md-subnav-item`: 36px, padding `0 12px`, `white-space:nowrap`;
  `.active`: `background: var(--surface-white)`, `border: 1px solid var(--border-light)`,
  `box-shadow: inset 0 -3px 0 var(--brand-magenta)`, 700 navy.
- `.md-content` con padding orizzontale 20px e spazio sopra `var(--space-4)`; card a tutta larghezza.
- Il `.ph` segue le proprie regole condivise (titolo 26px, sottotitolo visibile — decisione 4).

**Smartphone < 768px.**
- Lista (gruppi e voci) nascosta; `.md-subnav` con padding `var(--space-3) var(--space-4) 0`, nessuna fascia.
- `.md-subnav-select` visibile: `position:relative; min-height:48px; display:flex; align-items:center;
  gap: var(--space-2); padding: 0 var(--space-3); background: var(--surface-white); border: 1px solid var(--border-light);
  border-radius: 10px`; gruppo 10px uppercase `--text-muted`, sezione 14px 700 navy, chevron a destra.
- Il `<select>` copre l'intera riga (`position:absolute; inset:0; opacity:0; width:100%; height:100%`), quindi il tap
  apre il picker nativo e il bersaglio è ≥ 44px. Un focus visibile resta sulla riga (`:focus-within` → `--focus-ring`).
- `.md-content` con padding orizzontale 16px; il `.ph` segue le proprie regole (20px, sottotitolo nascosto).

## 8. Cache-busting

- `css/style.css`: bump del `?v=` in **tutte** le pagine che lo citano (lo pretende `js/lib/foundations-guard.test.js`).
- `js/lib/md-subnav.js?v=1` nuovo, nelle 5 pagine.
- `js/lib/icons.js` non cambia.

## 9. Test

- **`js/lib/md-subnav.test.js` (nuovo):** 2 gruppi e 4 voci nell'ordine e con le etichette/href del §5; una sola
  voce `aria-current="page"` per ciascun id; id sconosciuto → nessuna attiva; il select ha 2 `optgroup`, 4 opzioni con
  `value` = href e l'attiva `selected`; `mountMdSubnav` su jsdom riempie la `<nav>` e il `change` assegna `location.href`.
- **`js/lib/master-data-guard.test.js`:** sostituire i test della nav scritta a mano e del wrapper con: la `<nav
  class="md-subnav" data-md-active="<id>">` vuota con l'id atteso (client-groups → `clients`); `md-subnav.js` caricato;
  il `.ph` con titolo e sottotitolo esatti e senza `.ph-side`; il breadcrumb a 3 livelli con l'etichetta della sezione;
  `<section class="md-card">` con `md-card-title` = nome della sezione dentro `<div id="app" v-cloak>`; nessun `🔒`.
  Il test CSS diventa: `.md-subnav` sticky e `align-self:flex-start` da 1024px; regole tablet e phone presenti.
  Restano i test di accesso, API, `must` e "no Programs".
- **`js/lib/page-head-guard.test.js`:** `EXCLUDED` vuoto; conteggi di "page discovery" aggiornati; `.page-header`
  vietato anche per le 5 pagine.
- **`js/lib/nav-model.test.js`:** nessuna modifica.

## 10. Verifica visiva

Un giro di `scripts/shoot.mjs` contro lo stack del branch (`scripts/test-branch.sh up`, `--base http://localhost:8081`,
`--settle 3000`): `master-clients.html` a 1440, 1024, 768, 390 (`--full` a 1440), e le altre quattro pagine a 1440.
I PNG si rileggono e si confrontano con `10.2a.jpg` e `10.2e.jpg` limitatamente a shell, sub-nav e header della card;
gli scostamenti si presentano uno per uno (fix-ora / accetta-e-registra in `docs/pages/config.md`).

## 11. Fuori scope

- Tabelle, colonne, form, modali, inline editing, empty state, messaggi di validazione, stili di bottoni/input/tab
  dentro il contenuto, toolbar della card disegnate nelle tavole (segmented, search 190px, bottone navy), testi.
- Fusione di Client Groups in Clients e rimozione di `master-client-groups.html`.
- Conteggi nella sub-nav.
- Layout phone di tabelle e toolbar.

## Criteri di accettazione

1. **Page head** — in tutte e cinque le pagine il `.ph` mostra "Master Data" e "Clients, pipelines, roles, rates and currencies used across the app.", senza azioni; nessun `.page-header` resta (`page-head-guard`, `master-data-guard`).
2. **Sub-nav da una fonte** — la sub-nav di ogni pagina è generata da `js/lib/md-subnav.js`: 2 gruppi, 4 voci, href del §5, voce attiva corretta con `aria-current="page"`, "Clients & groups" attiva su `master-client-groups.html` (`md-subnav.test.js`, `master-data-guard`).
3. **Card** — il contenuto sta in `.md-card` con il nome della sezione come prima riga e la descrizione attuale sotto (`master-data-guard`).
4. **Breadcrumb** — `Home / Master Data / <Sezione>`, con "Master Data" cliccabile verso `/master-clients.html` (`master-data-guard`; a vista al Gate 2).
5. **Desktop** — a ≥ 1024px sub-nav a card di 196px a sinistra, sticky durante lo scroll, voce attiva con marcatore magenta a sinistra; card a destra (shoot a 1440 e 1024, confronto con `10.2a.jpg`).
6. **Tablet** — fra 768 e 1023px la sub-nav è una riga di tab scorrevole senza scrollbar visibile e senza etichette di gruppo, tab attiva con sottolineatura magenta; card a tutta larghezza (shoot a 768, confronto con `10.2e.jpg`).
7. **Smartphone** — sotto 768px una riga selettore alta 48px con gruppo e sezione; il tap apre il picker con le 4 sezioni raggruppate e la scelta naviga alla pagina (shoot a 390; il tap a vista al Gate 2).
8. **Contenuto invariato** — tabelle, form, modali, rate card e salvataggi funzionano come prima su tutte e cinque le pagine (`npm test` verde; a vista al Gate 2).
9. **Access denied** — un utente non admin vede "Admin access required." con un'icona SVG, senza emoji (`master-data-guard`).

## Decisioni aperte

1. **Sub-nav come modulo puro `js/lib/md-subnav.js` che riempie una `<nav>` statica.** Alternativa scartata: una funzione in `js/nav.js` o un componente Vue. Perché: `nav.js` è caricato da tutte le pagine e la nav sta fuori dalla root Vue, mentre `js/lib/` è testabile con vitest.
2. **Un solo markup per desktop e tablet, restyled via CSS, più il selettore phone.** Alternativa scartata: tre blocchi di markup. Perché: meno da tenere allineato, stesso elenco di voci.
3. **Phone: `<select>` nativo trasparente sopra una riga disegnata come la tavola.** Alternativa scartata: un bottom sheet nuovo. Perché: quello del Reporting è locale a `css/portfolio.css`, e il brief accetta il `<select>` in quel caso.
4. **Il `.ph` condiviso vince sulla tavola** (fascia bianca, 26px su tablet, sottotitolo visibile su tablet). Alternativa scartata: titolo su sfondo grigio, 22px, sottotitolo nascosto su tablet. Perché: precedenza §1b del brief; la deviazione si annota nel PR.
5. **Colori della tavola portati ai token** (`#DDE1E8` → `--border-light`, `#F3F4F6` → `--surface-subtle`, `#9AA0AC` → `--text-muted`, `#374151` → `--text-secondary`); sfondo pagina quello di `style.css`. Alternativa scartata: i valori della tavola o un nuovo grigio di pagina. Perché: regola "no hex" e precedenza dei token del brief.
6. **Titolo della card e terzo livello del breadcrumb = nome attuale della pagina** (Clients, Client Groups, …). Alternativa scartata: "Clients & groups" su `master-clients.html`. Perché: la fusione con Client Groups è della fase 2.
7. **La descrizione muted attuale resta sotto il titolo della card.** Alternativa scartata: toglierla. Perché: i testi sono fuori scope.
8. **Niente conteggi nella sub-nav; sottotitolo come proposto dal brief.** Alternativa scartata: conteggi con dati in più. Perché: default del brief, nessun endpoint economico.
9. **Brief e tavole committati su `main` insieme alla Spec.** Alternativa scartata: lasciarli untracked. Perché: `PROCESS.md` §6.5.
10. **Nessun controllo si sposta nell'header della card; i `.section-title` con i loro bottoni restano nel corpo.** Alternativa scartata: portare nella riga del titolo il primo `.section-title` di ogni pagina. Perché: accanto all'`<h1>` oggi non c'è nessun controllo, e spostare quelli di sezione è riorganizzare il contenuto, che spetta ai brief di fase 2.
