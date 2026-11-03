# Resource Planning v2 — design spec, ciclo 2 di 2 (smartphone)

**Date:** 2026-11-03
**Brief started:** 2026-11-03 09:16
**Brief:** `docs/superpowers/briefs/2026-11-03-planning-redesign-mobile-brief.md`
**Scenario:** 2 (evoluzione)

Layout smartphone (sotto i 768px) di `planning.html`, in sola consultazione, sopra la pagina del ciclo 1 (merge
`3d7d838`). Stessa app Vue, stesso modello server, stessi filtri. Sopra i 768px nulla cambia.

## 1. Obiettivo

Sostituire il layout tablet con scroll orizzontale, provvisorio sotto i 768px, con:
- card per riga padre;
- uno stepper "un periodo per volta";
- i filtri in un bottom sheet;
- il Team assistant a schermo intero, con una card per persona.

Handoff di design §5 (seconda metà) e §6 (ultimo punto); tavole 9.9a e 9.9b, parte destra.

## 2. Fatti verificati nel codice (a `ea15da9`)

- `isTablet` è impostato da `matchMedia('(max-width: 1024px)')` in `mounted()` (`planning.html:1166-1168`).
  `css/planning.css` ha un solo blocco `@media (max-width: 1024px)`; la soglia telefono del sito è
  `@media (max-width: 767.98px)` in `css/style.css`.
- I teleport verso `#plFiltersBody` sono attivi quando `isTablet` è vero: ricerca, chip, popover Projects e Team, switch e
  Load XLS (`planning.html:95-172`). L'intestazione del pannello è sempre montata (`:89-94`).
- `#plFiltersPanel` è un offcanvas Bootstrap `offcanvas-end` statico, fuori dalla root Vue (`planning.html:347-349`).
- I filtri si applicano subito: il watcher `modelRequest` chiama `loadModel()` (`planning.html:1113`).
- `displayRows` = `visibleRows(rows, openIds[view], searchFilter)` (`planning.html:770-773`). Le righe portano `depth`,
  `parentId`, `kind`, `cells[i] = { h, past, current, pulse, load }` (`js/lib/planning-rows.js`).
- Non esiste un conteggio delle foglie per padre; `activeRows.total.count` è globale.
- `activeFilterCount` è un computed in pagina (`planning.html:781-783`) e non conta Weekly né la finestra.
- Il Team assistant è un drawer `width: min(940px, 100vw)` con backdrop (`css/planning.css:254-269`); i risultati sono
  tabelle a 12 colonne (`planning.html:313-336`) costruite da `rowView(row)` (`js/lib/team-assistant-ui.js:14-30`).
- `js/lib/content-surface-guard.test.js:296` pinna la stringa `css/planning.css?v=1`; `:331` pinna gli import di
  `planning-rows.js` alle versioni caricate dalla pagina.

## 3. Mappa tavola → sezione

| Tavola | Contenuto | Sezione |
|---|---|---|
| 9.9a, destra | head, segmented, stepper, card By role, card espansa con figli | §4, §5, §6 |
| 9.9b, destra | bottom sheet Filtri | §7 |
| 9.9a/9.9b, sinistra | tablet 1024 | ciclo 1, invariato |
| 9.8a, 9.8c, 9.8d | desktop By owner (carichi high/over, TBD) | ciclo 1; qui solo come riferimento per §6 (colori di carico, pill "Needs owner") |
| 9.8b, 9.8e | desktop By project (tre livelli) | ciclo 1; qui solo come riferimento per §6 (figli di livello 2) |

Il Team assistant su smartphone non è disegnato: §8 è specificazione.

Nella tavola 9.9a il segmented mostra "By project" attivo, ma le card sono righe di By role: fa fede il contenuto.

## 4. Interruttore

- Nuovo dato `isPhone`, impostato in `mounted()` da `matchMedia('(max-width: 767.98px)')` con un listener `change`,
  accanto a `isTablet`.
- A 390px `isTablet` resta vero, quindi i teleport del ciclo 1 restano attivi senza modifiche.
- In `css/planning.css`, un nuovo blocco `@media (max-width: 767.98px)` dopo quello dei 1024px; il commento
  "provisional until cycle 2" del blocco tablet si toglie.

## 5. Head, toolbar e stepper (`isPhone`)

- **Head:** titolo (`.ph-sub` è già nascosto da `css/style.css`), poi le icon-button Team assistant (solo admin) ed
  Export XLS, poi "Filters {n}". Il bottone Filters della toolbar si nasconde sotto i 768px; quello del head esiste solo
  con `isPhone`. Ogni target è ≥ 44px. Load XLS resta nascosto (regola del ciclo 1).
- **Toolbar:** il segmented della vista è a tutta larghezza, con i tre bottoni di uguale larghezza. Non si vedono il
  segmented Monthly/Weekly, il selettore della finestra (frecce, etichetta, menu) e Today: il loro equivalente sta nel
  sheet (§7).
- **Stepper:** "‹ {periodo} ›" a tutta larghezza, con la sotto-etichetta sotto.
  - Etichetta: in Monthly "Oct 2026" (mese abbreviato e anno a quattro cifre, come la tavola); in Weekly
    `{dateTitle} · W{isoWeek}`, per esempio "19 Oct – 25 Oct · W43".
  - Sotto-etichetta: "Current month · planned" (o "Current week · planned" in Weekly) sul periodo corrente, "Actuals" sui
    passati, "Planned" sui futuri.
  - Le frecce hanno `aria-label` "Previous period"/"Next period" e sono disabilitate agli estremi della finestra.
- **Stato `phonePeriodIdx`:** un indice dentro `activeRows.periods`.
  - Si inizializza con `defaultPeriodIdx(periods)`: l'indice del periodo corrente, altrimenti 0.
  - Si reimposta allo stesso modo quando cambiano `windowStart`, `windowEnd` o `interval`; resta fermo al cambio di vista.
  - Se è fuori dai limiti dei periodi caricati, si riporta al limite.
  - Le frecce cambiano solo l'indice: `windowStart`, `windowEnd` e `modelRequest` restano invariati.
- Gli stati `loading`, `loadError`, `placeholder` ed `empty` restano quelli del ciclo 1, nello stesso punto della pagina.
- La legenda non c'è sopra le card: va nel sheet (§7).

## 6. Card

Con `isPhone` il blocco `.pl-grid-wrap` non si rende e al suo posto si rende `.pl-cards`, sugli stessi `displayRows`.

- **Riga `depth === 0`, una card:**
  - prima riga: avatar come nel ciclo 1 (`tbd`, `person`), titolo, pill "Needs owner" per `kind === 'tbd'`, pill
    `inactive`, stage pill;
  - seconda riga: "{n} assignment(s) · Sold {fmtNum(sold)}", con `n` da `leafCounts(rows)` e il singolare per 1;
  - a destra: il valore grande `cellText(cells[phonePeriodIdx])`, "—" se vuoto, e sotto "{fmtNum(toPlan)} to plan";
  - sotto: la mini-barra (§6.1).
  - Il tap sulla card, o sul suo chevron, chiama `toggleRow(r.id)` se la riga ha figli. Il chevron ha `aria-expanded` e
    `aria-label` come nel ciclo 1.
- **Riga `depth > 0`, una riga di lista** dentro la card del suo padre di profondità 0, rientrata di `depth - 1`
  livelli:
  - etichetta, seconda riga (owner o `sub`, come nella colonna label del ciclo 1, senza la riga "Sold · Actuals" del
    tablet) e valore `cellText(cells[phonePeriodIdx])`, "—" se vuoto;
  - se ha figli, ha un chevron e il tap chiama `toggleRow`, così si aprono anche i livelli 2 di By project e By owner.
  - Ogni riga è ≥ 44px.
- **Classi del valore:** quelle di `cellClass(c)` sulla cella scelta (passato, corrente, pulse, high, over), con gli
  stessi token del ciclo 1. In By owner il valore grande prende quindi lo sfondo high/over.
- **Ricerca:** con una ricerca attiva, `displayRows` resta la fonte di verità, comprese le righe forzate aperte e
  `suppressed`. Il messaggio "No rows match “…”" diventa una card vuota.
- **Card TOTAL** in coda: "TOTAL · {n} ASSIGNMENTS", il valore del periodo scelto da `activeRows.total.cells`,
  "{h} to plan" e la mini-barra.
- Expand all e Collapse all non ci sono.

### 6.1 Mini-barra

- `miniBar(cells)` (puro) restituisce un segmento per periodo, `{ kind, ratio }`.
  - `kind`: `empty` se `h` è nullo o zero; altrimenti `over` o `high` se `load` lo dice; altrimenti `past`, `current`
    o `future`.
  - `ratio` = `h / max(h)` della riga, da 0 a 1.
- Resa:
  - colori: `past` grigio (`--text-muted`), `current` magenta (`--brand-magenta`), `future` navy (`--brand-navy`),
    `high`/`over` i token di carico del ciclo 1, `empty` un trattino orizzontale;
  - altezza di un segmento non vuoto: `max(25%, ratio)` dell'altezza della barra;
  - il segmento del periodo scelto ha un contorno.
- La mini-barra è decorativa (`aria-hidden="true"`): il valore del periodo scelto è nel testo.

## 7. Bottom sheet Filtri

- Resta lo stesso `#plFiltersPanel`. Sotto i 767.98px il CSS lo riposiziona: `top: auto; left: 0; right: 0; width:
  100%; height: auto; max-height: 90dvh`, angoli superiori arrotondati, `transform: translateY(100%)` da chiuso. Gli
  stati `.showing`/`.show` di Bootstrap restano quelli. Bootstrap e il JS non cambiano.
- **Intestazione:** "Filters" + "Close" testuale. Sopra i 768px resta l'icona × del ciclo 1.
- **Contenuto, nell'ordine:**
  1. la ricerca, già teleportata dal ciclo 1;
  2. il blocco solo phone `<teleport to="#plFiltersBody" v-if="isPhone">`:
     - segmented Monthly/Weekly;
     - periodo: preset 3/6/12 months, Whole range, From e To come `<cg-date-picker mode="month" inline-popover>` con gli
       stessi `min`/`max` del menu periodo, Today; chiamano gli stessi `applyPreset`/`applyWholeRange`/`setFrom`/
       `setTo`/`goToday`;
  3. chip Pipeline, Projects, Team, Monthly pulse, Rounded, già teleportati dal ciclo 1. I popover Projects e Team si
     aprono dentro il sheet e scorrono al suo interno;
  4. il blocco solo phone con la legenda dei colori e "How estimates work", che apre il suo testo in linea;
  5. "Show results", bottone primario a tutta larghezza con `data-bs-dismiss="offcanvas"`.
- **Load XLS** nel sheet si nasconde con `isPhone`.
- **Applicazione:** immediata come oggi; "Show results" e "Close" chiudono soltanto.
- **Badge:** "Filters {n}" usa `activeFilterCount` con la formula attuale. Weekly e una finestra diversa da quella di
  default non contano.
- Ogni riga e ogni target è ≥ 44px; il contenuto scorre dentro il sheet.

## 8. Team assistant (smartphone, non disegnato)

- Sotto i 767.98px: `#teamAssistantPanel` a `width: 100vw; height: 100dvh`, senza bordo sinistro; il backdrop non si
  vede. Da chiuso esce dallo schermo come oggi. L'apertura da `taOpen` non cambia.
- **Barra in alto:** il titolo e, con `isPhone`, un bottone "Close" testuale al posto dell'icona ×. Stessa azione
  (`taOpen = false`), stesso focus di ritorno.
- **Risultati:** con `isPhone`, al posto di `.ta-table-wrap` c'è una card per riga, costruita da `rowView(row)`:
  - riga 1: nome e "Score {score}";
  - riga 2: "{role} · {roleHours} h on role";
  - numeri chiave: "Free {free} h/wk", "Load {load}", "{onProject} h on project";
  - tag come pill, come nel ciclo 1;
  - `flags`, se presenti, e `rationale`.
  Similar projects, Similar tasks e Topics non sono nella card.
- Setup, chat, composer, starter, select nativo del progetto, `taError`, focus trap ed Esc restano invariati.

## 9. Helper puri (`js/lib/planning-rows.js`) e characterization

- **Helper nuovi, con test in `js/lib/planning-rows.test.js`:**
  - `leafCounts(rows)` → `Map` da id a numero di foglie discendenti (righe senza figli). Una foglia vale 0 per sé.
  - `miniBar(cells)` → §6.1.
  - `defaultPeriodIdx(periods)` → §5.
  - `stepperState(periods, idx, interval)` → `{ label, sub, canPrev, canNext }`, con i testi di §5. Legge
    `isPast`/`isCurrent`, il mese del periodo in Monthly e `dateTitle`/`weekStart` in Weekly (`isoWeek` è già nel
    modulo). `periodMain`/`periodSub` della pagina restano invariati.
  - `activeFilterCount(state)` → l'estrazione pura del computed attuale; il computed diventa un wrapper.
- **Characterization prima delle modifiche** (Scenario 2):
  - pinnare con test `visibleRows`/`toggleRowState`/`effectiveFilter` su righe a tre livelli con ricerca e
    `suppressed`, se un test esistente non lo fa già;
  - pinnare la formula di `activeFilterCount` (pipeline, projects, team, pulse spento, rounded spento, ricerca non vuota)
    sul helper estratto, prima di sostituirlo nel computed.
- `planning-rows.js` mantiene i suoi import `./planning-calc.js?v=5` e `./dates.js?v=4`.

## 10. CSS, icone, cache-busting

- Solo token, nessun hex (`content-surface-guard.test.js`, "planning.css uses tokens only").
- `css/planning.css` `?v=1` → `?v=2` e `js/lib/planning-rows.js` `?v=1` → `?v=2` in `planning.html`; la stringa
  `css/planning.css?v=1` in `js/lib/content-surface-guard.test.js:296` segue nello stesso commit.
- Icone: solo quelle già in `js/lib/icons.js`.

## 11. Test e verifica

- `npm test` verde, compresi `content-surface-guard`, `page-head-guard`, `nav-shell-guard`, `foundations-guard`,
  `dates-guard`, `tokens`, `planning-rows`, `team-assistant-ui`.
- **`TEST_CASES.md`:** casi smartphone per stepper e limiti, card ed espansione su tre livelli, ricerca dal sheet,
  sheet (Show results, Close, periodo, Weekly), By owner high/over e TBD, card TOTAL, Team assistant a schermo intero e
  card per persona, Export dal head. Il numero dei casi in `js/lib/test-cases-parse.test.js` si aggiorna nello stesso
  commit.
- **Verifica visiva:** `scripts/shoot.mjs` contro lo stack di `scripts/test-branch.sh` (`--base http://localhost:8081`,
  `--settle 3000`).
  - A 390px: le tre viste, una card espansa per vista (By project fino al livello 2), lo stepper su un periodo passato,
    il sheet aperto, il Team assistant aperto con risultati se lo stack ne ha.
  - A 768px e 1024px: una vista, per escludere regressioni.
  - I PNG si rileggono e si confrontano con 9.9a e 9.9b (PROCESS.md §6.6).

## 12. Documentazione

- `docs/pages/planning.md`: sezione del ciclo 2 (soglia, stepper, card, sheet, Team assistant).
- `docs/js/lib.md`: gli helper nuovi di `planning-rows.js`.
- `docs/css/stylesheets.md`: il blocco smartphone di `planning.css`.
- La riga di `planning.html` nella tabella Pages di `CLAUDE.md` cambia solo se cambia lo scopo della pagina; non cambia.

## 13. Fuori scope

- API e modello `POST /api/planning/model`.
- B-245 (owner nelle righe figlie di By role) e B-246 ("Clear" = "Select all").
- Gesture (swipe tra i periodi, trascinamento del sheet).
- Il select nativo del progetto nel Team assistant.
- Modifiche sopra i 768px, salvo quelle che servono a non duplicare il markup.
- Load XLS e qualunque modifica dei dati su smartphone.

## Criteri di accettazione

1. **Niente griglia a 390px** — a 390px `planning.html` non ha scroll orizzontale né `.pl-grid`; a 768px e 1024px il
   layout è quello del ciclo 1.
2. **Una card per padre** — in ognuna delle tre viste a 390px c'è una card per riga `depth === 0` di `activeRows.rows`
   (con la ricerca vuota), più la card TOTAL.
3. **Conteggio** — "{n} assignment(s)" è uguale al numero di foglie del padre; `leafCounts` ha test per le tre viste.
4. **Mini-barra** — un segmento per periodo della finestra, con `kind` e `ratio` da `miniBar`, che ha test per vuoto,
   passato, corrente, futuro, high, over.
5. **Stepper** — cambia solo il periodo mostrato: `windowStart`, `windowEnd` e `modelRequest` restano invariati; le
   frecce sono disabilitate agli estremi; parte dal periodo corrente e vi torna al cambio di finestra o intervallo.
6. **Sotto-etichetta** — "Current month · planned"/"Current week · planned" sul corrente, "Actuals" sui passati,
   "Planned" sui futuri (`stepperState` ha test).
7. **Espansione** — il tap su una card o su una riga figlia con figli aggiorna `openIds[view]`; By project e By owner
   si aprono fino al livello 2; ogni valore è quello del periodo scelto.
8. **Bottom sheet** — a 390px il pannello Filtri sta in basso, con ricerca, Monthly/Weekly, periodo (preset, Whole
   range, From/To, Today), Pipeline, Projects, Team, Monthly pulse, Rounded, legenda, "Show results" e "Close"; ogni
   target misura ≥ 44px; i filtri si applicano subito.
9. **Assenti** — a 390px Load XLS, Expand all e Collapse all non sono visibili né raggiungibili.
10. **Head** — a 390px il head ha titolo, Team assistant (solo admin), Export XLS e "Filters {n}"; Export scarica lo
    stesso file del desktop.
11. **By owner** — la card TBD porta "Needs owner"; il valore grande e i segmenti prendono i colori high/over.
12. **Team assistant** — a 390px occupa lo schermo intero con barra titolo + "Close"; i risultati sono una card per
    persona con i campi di §8; Esc, Close e il focus di ritorno funzionano.
13. **Characterization** — i test della formula attuale di `activeFilterCount` e di `visibleRows`/`toggleRowState`/
    `effectiveFilter` esistono e sono verdi prima e dopo il ciclo.
14. **Suite** — `npm test` verde.

## Decisioni aperte

1. **Un blocco template `v-if="isPhone"` dedicato alle card, sugli stessi `displayRows`/`openIds`.** Alternativa scartata: CSS che trasforma la tabella in card, o un componente in un file separato. Perché: il CSS non può rendere la mini-barra né il valore del periodo scelto, e il componente sposterebbe stato già condiviso dalla pagina.
2. **Il bottom sheet è lo stesso offcanvas, riposizionato via CSS.** Alternativa scartata: un secondo guscio `offcanvas-bottom`. Perché: avrebbe chiesto un secondo target per tutti i teleport del ciclo 1.
3. **`phonePeriodIdx` torna al periodo corrente al cambio di finestra o intervallo, non al cambio di vista.** Alternativa scartata: tornare al corrente anche al cambio di vista. Perché: chi cambia vista vuole confrontare lo stesso periodo.
4. **Altezza dei segmenti proporzionale al massimo della riga.** Alternativa scartata: segmenti tutti alti uguali. Perché: la tavola mostra altezze diverse.
5. **"1 assignment" al singolare.** Alternativa scartata: "1 assignments" come nella tavola. Perché: il sito prevale sulle tavole per la copy.
6. **Il badge "Filters {n}" conserva la formula attuale.** Alternativa scartata: contare anche Weekly e la finestra non di default. Perché: badge uguale su tablet e smartphone, e nessun cambio di comportamento fuori scope.
7. **Sotto-etichetta "Planned" sui periodi futuri.** Alternativa scartata: nessuna sotto-etichetta sui futuri. Perché: la tavola mostra solo corrente e passato, e senza sotto-etichetta il futuro resterebbe ambiguo.
8. **La card del Team assistant omette Similar projects, Similar tasks e Topics.** Alternativa scartata: tutti i 12 campi. Perché: l'handoff chiede "numeri chiave e rationale", e con tutti i campi la card sarebbe lunga quanto la tabella.
9. **La card TOTAL ha la mini-barra.** Alternativa scartata: solo valore e to plan. Perché: stessa forma delle altre card.
10. **Nel sheet e nel Team assistant, a 390px, "Close" testuale al posto dell'icona ×.** Alternativa scartata: tenere l'icona. Perché: la tavola 9.9b e l'handoff §6 ("title + Close") lo mostrano.
11. **Etichetta dello stepper: "Oct 2026" in Monthly, "19 Oct – 25 Oct · W43" in Weekly.** Alternativa scartata: le etichette delle colonne ("OCT 26", "OCT 19 / W43"). Perché: la tavola mostra "Oct 2026", e in Weekly un periodo da solo ha bisogno delle date estreme.
