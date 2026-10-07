# Spec — Portfolio overview, Ciclo 1: le viste Card e List

Data: 2026-10-08 · Scenario 2 (evoluzione di una feature esistente) · Pagina: `portfolio.html`, sola vista `overview`.

Brief: scritto dall'utente e incollato in chat il 2026-10-08 (non prodotto da Claude Design).
Tavole: `docs/superpowers/design/Portfolio/`.

---

## 1. Obiettivo

Sostituire la vista `overview` di `portfolio.html` — oggi una griglia Bootstrap `col-md-6` di
`section-card` con bordi viola, emoji e un filtro a `<select>` — con due layout alternativi
disegnati nelle tavole: una griglia Card uniforme a 3 colonne con pannello figli a tutta
larghezza, e una vista List ad albero. Stessa app Vue, stessi dati, stesse API.

La vista `dashboard` (dettaglio progetto, `view === 'dashboard'`) **non si tocca**.

## 2. Perimetro

**Dentro:** header e toolbar, le due viste, `css/portfolio.css` nuovo, i computed e le
funzioni pure che le alimentano, il filtro Stage nuovo, la conversione del filtro Client a
multi-selezione, la correzione di `cardData()`, la rimozione delle emoji dalla vista
overview, la persistenza del layout.

**Fuori, rinviato al Ciclo 2:** la modale Share di programma (§5 del brief) e i due endpoint
`GET`/`DELETE /programs/:id/shares`. In questo ciclo il pulsante `Share` del programma resta
agganciato alla `openShareModal('program', prog.id, prog.name)` esistente, che funziona ed è
soltanto vecchia d'aspetto.

**Fuori, punto fermo:** `+ New project` resta disabilitato (`DIRECT_PROJECT_CREATION_ENABLED`
è `false`); il `Dashboard` del programma e il link `Program Dashboard →` restano inattivi
perché la pagina non esiste.

## 3. Mappa tavola → sezione

Ogni tavola della cartella ha una sezione di questa spec che la implementa. Nessuna tavola
resta senza destinazione.

| Tavola | Sezioni |
|---|---|
| `6.3-portfolio-card-list.jpg` | §7 (vista Card), §9 (header e toolbar), §10 (stati) |
| `6.3-portfolio-project-list.jpg` | §8 (vista List), §9 (header e toolbar) |
| `6.3-portfolio-share-modale.jpg` | **Nessuna — Ciclo 2.** Non va implementata ora. |

Il brief chiama le tavole 6.4a / 6.4b / 6.5e; i file sul disco hanno i nomi della tabella
sopra. Le tavole 6.5a–d (popover a soglie) e 6.3c (griglia a peso variabile) non esistono
nella cartella e, da brief, non vanno implementate: lo Share è sempre una modale, mai un
popover, anche se la tavola Card lo disegna come popover.

## 4. Decisioni prese in brainstorming

| # | Decisione | Nota |
|---|---|---|
| D1 | Programmi e progetti **mescolati** in un unico ordinamento | Cambia il comportamento attuale, che mette sempre i programmi prima |
| D2 | Filtro **Stage** aggiunto in toolbar | Non esiste oggi |
| D3 | I progetti **senza date vengono renderizzati** con i valori a «—» | Oggi `cardData()` torna `null` e il `v-if` li nasconde del tutto |
| D4 | Filtro **Client convertito a multi-selezione** | Estensione rispetto al brief, che diceva «comportamento attuale» |
| D5 | **Persistenza** del layout Card/List in `localStorage` | Richiede il bump di `core.js` su tutte le 18 pagine |
| D6 | `N at risk` reso in **navy scuro**, come la tavola | Il brief §4 lo voleva rosso: vince la tavola |
| D7 | Pillola stadio del programma: **resta il primo figlio** (`domPipeline`) | Nessun aggregato nuovo |
| D8 | Nessun `Configure` nella vista List | Come la tavola |
| D9 | Breakpoint sulla **larghezza reale del contenitore**, non del viewport | Vedi §13 |

## 5. Modello dati

Sull'istanza Vue di `portfolio.html`:

| Proprietà | Prima | Dopo |
|---|---|---|
| `portfolioLayout` | — | `'card'` o `'list'`, iniziale da `localStorage`, default `'card'` |
| `portfolioStageFilter` | — | `[]`, array di stadi |
| `portfolioClientFilter` | `''` (stringa, scelta singola) | `[]` (array, multi-selezione) |
| `expandedPrograms` | `new Set()` | **rimossa** |
| `expandedProgramId` | — | `null`, un solo programma aperto nella vista Card |
| `listExpandedPrograms` | — | `new Set()`, stato separato per la List |
| `gridColumns` | — | `3`, aggiornata da un `ResizeObserver` (§13) |

`portfolioClientFilter` cambia tipo: vanno aggiornati `sortedFilteredProjects`,
`portfolioFiltersActive` e `clearPortfolioFilters`.

## 6. Computed e funzioni pure

### 6.1 `sortedFilteredProjects` (modificato)

Due cambi soltanto:
- il filtro cliente diventa `!this.portfolioClientFilter.length || this.portfolioClientFilter.includes(p.clientId)`;
- si aggiunge il filtro stadio: `!this.portfolioStageFilter.length || this.portfolioStageFilter.includes(getProjectPipeline(p.id) || p.pipeline)`.

Il filtro di ricerca e quello di stato restano **identici**, compreso il `p.status || 'Not started yet'`.

### 6.2 `portfolioRows` (nuovo)

Unisce `visibleProgramGroups` e `ungroupedProjects` — che restano invariati come sorgenti — in
una sola lista ordinata, consumata **da entrambe le viste**, così l'ordine non può divergere
fra Card e List.

Forma delle righe:

    { kind: 'program', id, name, clientName, children, stats, duration, pipeline, atRisk }
    { kind: 'project', id, name, clientName, cfg, card }

- `clientName` di un programma = `domClientName` (cliente del primo figlio, come oggi);
  di un progetto = `getClientName(cfg.clientId)`, stringa vuota se `__unassigned__`.
- `stats` / `duration` da `programStatsMap[prog.id]`; `card` da `cardDataMap[cfg.id]`.
- `atRisk` da `programAtRisk(children)`.

### 6.3 Funzioni pure in `js/lib/portfolio-calc.js`

Tutte testate in `js/lib/portfolio-calc.test.js`, che esiste già.

**`buildPortfolioRows(rows, sortMode)`** — con `sortMode === 'client'` ordina per `clientName`
(`localeCompare`), poi mette i **programmi prima dei progetti** a parità di cliente, poi
ordina per `name`. Con `sortMode === 'name'` ordina per `name` soltanto. La regola del cliente
si legge nella tavola List su Bayer AG, dove il programma *Field Force Enable…* precede
*BERMITS Maintena…* e *TEST PROPOSAL* pur venendo dopo in alfabeto.

**`spentPercent(spent, sold)`** — `null` se `sold` è assente, nullo o ≤ 0; altrimenti
`Math.round(spent / sold * 100)`.

**`spentBarState(pct)`** — `'none'` se `pct` è `null`; `'danger'` se `> 100`; `'warning'` se
`>= 85`; altrimenti `'normal'`. Le tavole lo confermano: Chiesi a 92% ha la barra ambra,
Recordati a 84% la ha navy.

**`programAtRisk(children)`** — numero di figli con `status === 'Started At Risk'` (grafia
esatta di `statusFilterOptions`).

### 6.4 `cardData()` (corretto — D3)

Non ritorna più `null`. Aggiunge `hasDuration` (`months.length > 0`) e, quando è falso,
lascia i totali a `0` senza inventare valori. `hasData` e `hasPhasing` mantengono il
significato attuale.

Il template non usa più `v-if="cardDataMap[cfg.id]"` — quei guard spariscono — e gatea i
singoli valori:

| Valore | Condizione per mostrarlo, altrimenti «—» |
|---|---|
| Duration | `hasDuration` |
| Sold | `hasDuration && hasPhasing` |
| Spent | `hasDuration && hasData` |
| Variance | `hasDuration && hasData && hasPhasing` |

Il badge `No actuals available` resta (`!hasData`), reso come pillola neutra.

### 6.5 Conteggi di testata

`N programs · N projects`: i programmi sono le righe `kind === 'program'` di `portfolioRows`;
i progetti sono tutti i progetti visibili, **figli compresi**. Entrambi seguono i filtri.

## 7. Vista Card — tavola `6.3-portfolio-card-list.jpg`

Griglia CSS a `var(--pf-cols)` colonne, gap 16px.

**Card progetto.** Etichetta `PROJECT` minuscola, maiuscola, spaziata, muted, in alto a
sinistra; pillola stadio in alto a destra. Sotto: nome cliente (piccolo, muted), titolo del
progetto (grassetto navy, massimo 2 righe con ellissi), codice in monospace muted. Poi una
griglia 2×2 — Duration e Sold sulla prima riga, Spent e Variance sulla seconda — ciascuna
con etichetta minuscola muted sopra e valore in grassetto sotto. Poi un divisore, la barra
4px e la riga `N% spent` oppure `No budget`. Footer separato da un bordo: pillola stato a
sinistra, `Configure` (outline, solo se `cfg.my_permission !== 'viewer'`) e `Dashboard`
(navy pieno, chiama `showDashboard(cfg.id)`) a destra.

**Card programma.** Stessa struttura. Etichetta `PROGRAM · N PROJECTS`. Effetto "impilato"
con due pseudo-elementi sfalsati dietro la card. Numeri da `programStatsMap`, currency
`stats.currency` (cioè `commonCurrency`, che ripiega su EUR quando i figli divergono).
Footer: `Share` (outline, apre la modale esistente), `Show N projects` / `Hide projects`,
`Dashboard` **disabilitato** con tooltip `Program Dashboard — coming soon` e nessun handler.
Il programma aperto si distingue: bordo marcato e `Hide projects` in navy pieno, come in
tavola.

**Pannello figli.** A larghezza piena (`grid-column: 1 / -1`), inserito **dopo la riga intera**
che contiene il programma, non subito dopo la sua card (§13). Intestazione: titolo del
programma, `Program · N projects` muted, e a destra `Program Dashboard →` (disabilitato) e
`Close`. Contenuto: griglia a 4 colonne di mini-card su fondo chiaro, ciascuna con nome,
codice monospace, pillola stato, `€ Xk / € Yk`, barra sottile e, in fondo, `Configure`
(stesso gating) e `Dashboard →`.

**Uno alla volta:** aprire un programma chiude il precedente (`expandedProgramId`).

## 8. Vista List — tavola `6.3-portfolio-project-list.jpg`

Tabella a griglia CSS (non `<table>`), intestazione a fondo grigio con etichette maiuscole
spaziate: `PROGRAM / PROJECT`, `STAGE`, `STATUS`, `DURATION`, `SOLD`, `SPENT`, `VARIANCE`,
più una colonna azioni senza intestazione. Una colonna chevron stretta all'estrema sinistra.

**Riga programma.** Chevron (chiuso a destra, aperto in basso) che espande i figli al loro
posto; nome in grassetto navy troncato con ellissi; sottotitolo `Cliente · N projects`;
pillola stadio; colonna Status **testuale** — `N at risk` quando ci sono figli
`Started At Risk`, altrimenti `N projects` — resa in navy scuro, non in rosso (D6); durata,
Sold, Spent con barra sottile sotto l'importo, Variance; azioni `Share` e `Dashboard →`
(quest'ultimo disabilitato).

**Riga figlio.** Rientro 30px, fondo leggermente grigio. **Niente stadio e niente durata** —
la tavola lascia quelle due celle vuote — ma Sold, Spent, Variance e `Dashboard →` ci sono.
Nessun `Configure` da nessuna parte nella List (D8).

**Più programmi aperti insieme** (`listExpandedPrograms`), stato separato da quello della Card.

## 9. Header e toolbar

**Header.** Titolo `Project Portfolio` 26px/700 navy; sotto, `N programs · N projects` muted
(§6.5). Sparisce il sottotitolo attuale «Budget Spent vs Estimated by month — all configured
projects». A destra `+ New Project` magenta, **disabilitato come oggi**:
`:disabled="!directCreationEnabled"`, `<span>` esterno che porta il tooltip
`directCreationMessage`, più opacità ridotta e `cursor: not-allowed` perché lo stato si legga.
In tavola appare attivo: è un errore della tavola, confermato dal brief §1.1.

**Toolbar** su una riga: ricerca (300px, icona SVG, placeholder `Search project, code or
client…`); i tre dropdown `Client`, `Stage`, `Status`, tutti e tre a checkbox multi-selezione
con badge di conteggio e `data-bs-auto-close="outside"` (prefissi id `flt-client-`,
`flt-stage-`, `flt-status-`); spazio flessibile; `Sort:` con le etichette `Client A–Z` e
`Alphabetical`; segmentato `Card | List`.

`Clear filters` resta un link testuale neutro visibile solo a filtri attivi — via il `✕`
rosso attuale.

**Persistenza (D5).** `portfolioLayout` si salva in `localStorage` sotto
`PDash_portfolioLayout`. La chiave **deve** essere aggiunta al `keep` Set di `js/core.js`,
altrimenti `cleanLegacyStorage()` la cancella al caricamento successivo — è esattamente ciò
che era successo a `PDash_cgCompactHeader`.

## 10. Stati

- Nessun progetto configurato: testo invariato, compresi i due rami di `directCreationEnabled`.
- Nessuna corrispondenza: `No projects match the current filters.` invariato.
- **Filtri attivi:** i figli restano sempre visibili e il toggle è sostituito dall'etichetta
  non interattiva `Shown (filtered)`. Nella List i programmi si auto-espandono e il chevron
  si disattiva.

## 11. CSS e token

`css/portfolio.css?v=1`, linkato **solo** da `portfolio.html`, prefisso `.pf-*`, come
`pipeline.css`. `css/style.css` e `css/tokens.css` **non si toccano** e non si aggiungono
token. Nessun letterale esadecimale: si usa la mappatura del brief §6 — `--brand-navy`,
`--brand-magenta` (+ `-hover`, `--focus-ring`), `--border-light`, `--text-muted` /
`--text-faint`, `--surface-subtle` / `--surface-light`, `--pipeline-*`, `--status-*`,
`--color-warning` / `--color-danger` / `--color-success`.

Il bordo `--violet-500` dei programmi sparisce: il programma si riconosce dall'etichetta e
dalla card impilata.

Le stringhe `v-html` esistenti (`pipelineBadge`, `statusBadgeLarge`, `budgetBadgeHtml`)
restano in `js/core.js` **invariate** per questo ciclo; `portfolio.css` le riveste con regole
discendenti per ottenere il raggio 999px e il 10.5px/700 delle tavole. Se risultasse
impossibile senza toccare `core.js`, va segnalato invece di modificare `core.js` di
iniziativa: quelle funzioni sono condivise con altre pagine.

## 12. Icone

Nessuna emoji nella vista overview: via le attuali. Un componente Vue `PfIcon` con prop
`name`, sullo stesso modello di `navIcon(name, size)` in `js/nav.js`: SVG inline,
`stroke="currentColor"`, 14/16px, `aria-hidden`. Nomi necessari: `search`, `chevron-right`,
`chevron-down`, `grid`, `list`, `gear`, `arrow-right`, `close`.

## 13. Responsive e conteggio colonne

Il pannello figli deve aprirsi **sotto la riga intera**. Con CSS Grid, un elemento
`grid-column: 1 / -1` collocato subito dopo la card del programma lascerebbe dei buchi nella
riga. Serve quindi conoscere in JS il numero di colonne e spezzare le righe esplicitamente,
inserendo il pannello dopo il blocco che contiene il programma aperto.

Il conteggio viene da un **`ResizeObserver` sul contenitore della griglia**, non da media
query sul viewport: `gridColumns = 3` se la larghezza misurata è ≥ 1000px, `2` se ≥ 640px,
`1` sotto. JS scrive `--pf-cols` sul contenitore e il CSS lo consuma con
`grid-template-columns: repeat(var(--pf-cols), 1fr)`, così non esistono due soglie da tenere
allineate.

> **Nota rispetto al brainstorming.** Era stato concordato di usare le varianti
> `html[data-sidebar="collapsed"]` come nel ciclo Pipeline. Per la **griglia Card** il
> `ResizeObserver` le sostituisce ed è strettamente migliore: misura la larghezza reale,
> quindi lo stato della sidebar diventa irrilevante e sparisce la coppia di soglie 1280/1108.
> Per la **vista List**, che nasconde `Duration` e `Spent` sotto 1024px, restano le media
> query con le varianti collapsed come concordato.

La modale Share su smartphone (bottom sheet) è materia del Ciclo 2.

## 14. Cache-busting

| File | Prima | Dopo | Dove |
|---|---|---|---|
| `css/portfolio.css` | — | `?v=1` | `portfolio.html` soltanto |
| `js/lib/portfolio-calc.js` | `?v=4` | `?v=5` | `portfolio.html` soltanto (verificato: nessun'altra pagina lo carica) |
| `js/core.js` | `?v=12` | `?v=13` | **tutte le 18 pagine** che lo caricano (D5) |

Prima del merge va fatto il grep di ogni `?v=N` per ciascun file toccato e bumpata **ogni**
occorrenza allo stesso numero: `js/lib/foundations-guard.test.js` fallisce se le referenze a
`core.js` non concordano fra le pagine.

## 15. Test

- `js/lib/portfolio-calc.test.js` (esistente): casi nuovi per `buildPortfolioRows` (i due
  modi di ordinamento, programmi prima dei progetti a parità di cliente, clienti assenti),
  `spentPercent` (zero, assente, oltre il 100%), `spentBarState` (confini 85 e 100) e
  `programAtRisk`.
- `js/lib/portfolio-guard.test.js` (nuovo), ricalcato su `js/lib/pipeline-guard.test.js`:
  `portfolio.css` linkato dalla sola `portfolio.html`, nessun letterale esadecimale in
  `portfolio.css` né nel template della overview, nessuna emoji nella overview, concordanza
  del `?v=` di `portfolio.css`.
- Suite completa una sola volta a fine esecuzione e poi al Gate 1 (PROCESS §6.2): durante i
  task si lanciano solo i file toccati.

## 16. Verifica visiva

**Ogni task del Piano porta una riga `Boards:`** con i path delle tavole che deve riprodurre,
e ogni prompt di dispatch — implementatori **e revisori** — include quei path con l'istruzione
di aprirli e confrontare il proprio markup con l'immagine prima di chiudere il task,
dichiarando nel report cosa ha confrontato e cosa diverge. Un report senza quella
dichiarazione vale come task non chiuso.

Cattura con `scripts/shoot.mjs` contro lo stack di branch (`--base http://localhost:8081`,
`--settle 3000`), a 1440 / 1024 / 390, negli stati: Card con tutti i programmi chiusi, Card
con un programma aperto, List con un programma aperto, e un giro a filtri attivi. I PNG vanno
**riletti e confrontati** con le tavole: generarli senza guardarli non è una verifica.
Nessun passo di verifica va assegnato a un subagent senza browser.

## 17. Criteri di accettazione

1. Il selettore `Card | List` commuta le due viste e la scelta sopravvive a un ricaricamento.
2. In entrambe le viste l'ordine è lo stesso e segue D1; con `Sort: Client A–Z` i programmi
   precedono i progetti dello stesso cliente.
3. Un progetto senza date compare, con «—» al posto dei valori e `No budget` sotto la barra.
4. `+ New project` è visibilmente disabilitato e mostra il tooltip; non naviga.
5. Il `Dashboard` del programma e `Program Dashboard →` non navigano e mostrano
   `Program Dashboard — coming soon`; il `Dashboard` del progetto apre `showDashboard`.
6. Nella Card un solo programma per volta resta aperto, e il pannello figli occupa l'intera
   larghezza sotto la riga, a 3, 2 e 1 colonna.
7. A filtri attivi i figli sono visibili e il toggle è l'etichetta `Shown (filtered)`.
8. Nessuna emoji e nessun esadecimale nella vista overview; `style.css` e `tokens.css` non
   compaiono nel diff.
9. La suite frontend passa; `foundations-guard` e `nav-shell-guard` restano verdi.

## 18. Scostamenti dalle tavole, accettati

| Punto | Tavola | Scelta | Motivo |
|---|---|---|---|
| `+ New Project` | attivo | disabilitato | `DIRECT_PROJECT_CREATION_ENABLED` è `false` (brief §1.1) |
| `Dashboard` programma | attivo | disabilitato | la Program Dashboard non esiste (brief §1.2) |
| Share | popover nella tavola Card | modale | brief, esplicito; e in questo ciclo resta la modale attuale |
| Filtro Client | identico agli altri | multi-selezione | D4, estensione voluta |
| Soglie colonne | — | contenitore, non viewport | §13 |

Vanno riportati in `docs/pages/portfolio.md` **con il motivo**, altrimenti riemergono come
difetti al ciclo successivo.
