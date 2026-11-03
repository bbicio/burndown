# Brief — Planning redesign, ciclo 2 (smartphone)

**Brief started:** 2026-11-03 09:16
**Tipo:** evoluzione (Scenario 2), confermato dall'utente il 2026-11-03.
**Origine:** handoff `docs/superpowers/briefs/2026-11-02-planning-redesign-mobile-handoff.md`; handoff di design `docs/superpowers/design/planning/2026-11-02-redesign-planning.md` §5 (seconda metà, "Smartphone <768") e §6 (ultimo punto); tavole `9.9a.jpg` e `9.9b.jpg`, parte destra (390×844).

## Problema

Sotto i 768px `planning.html` mostra il layout tablet del ciclo 1 con scroll orizzontale, una soluzione provvisoria per dichiarazione della Spec del ciclo 1 (§1 e §6). Su smartphone la pagina va consultata, non modificata, con un layout a card.

## Comportamento attuale

Letto a `8454956`:
- **Un solo interruttore di layout:** `isTablet`, impostato da `window.matchMedia('(max-width: 1024px)')` in `mounted()` (`planning.html:1166-1168`); in CSS un solo blocco `@media (max-width: 1024px)` (`css/planning.css:239`), con commento "below 768px provisional until cycle 2" (`css/planning.css:238`). Nessuna regola di `css/planning.css` per i 767.98px; la soglia telefono esiste in `css/style.css:115`.
- **Head:** Team assistant (solo admin), Load XLS, Export XLS (`planning.html:44-48`). A ≤1024px i testi dei bottoni spariscono e Load XLS è nascosto (`css/planning.css:240-242`); `.ph-sub` sparisce sotto i 768px (`css/style.css`, blocco `767.98px`).
- **Toolbar riga 1:** segmented della vista (By role / By project / By owner) e dell'intervallo (Monthly / Weekly), selettore periodo con frecce `shiftPeriod(±1)` che spostano la **finestra** (`planning.html:890`), menu periodo con preset 3/6/12, Whole range, From/To come `<cg-date-picker mode="month" inline-popover>` e, a ≤1024px, Today dentro il menu (`planning.html:60-85`).
- **Filtri a ≤1024px:** bottone "Filters {n}" (`planning.html:101-103`) che apre l'offcanvas Bootstrap `#plFiltersPanel` (`offcanvas-end`, `planning.html:347-349`, `width: min(380px, 100vw)` in `css/planning.css:223`). Il contenuto arriva con `<teleport to="#plFiltersBody">`: intestazione sempre montata (`:89-94`), ricerca (`:95-100`), chip Pipeline, popover Projects e Team, switch Monthly pulse e Rounded, Load XLS (`:107-172`). `activeFilterCount` conta pipeline, projects, team, pulse spento, rounded spento, ricerca non vuota (`:781-783`).
- **Applicazione dei filtri:** immediata. Ogni cambio cambia `modelRequest`, il cui watcher chiama `loadModel()` → `POST /api/planning/model` (`planning.html:1113`, `:907-935`).
- **Griglia:** tabella `pl-grid` su `displayRows` = `visibleRows(rows, openIds[view], searchFilter)` (`planning.html:770-773`); righe padre cliccabili con `toggleRow`; legenda con "How estimates work" ed Expand/Collapse all (`:175-197`); riga TOTAL con `activeRows.total.count` assignments (`:250-257`).
- **Righe:** `buildRoleRows`/`buildProjectRows`/`buildOwnerRows` (`js/lib/planning-rows.js:175`, `:212`, `:265`) danno righe piatte con `id, parentId, depth, kind, label, sub, sold, actuals, toPlan, cells`; `cells[i]` porta `h, past, current, pulse, load`. Nessun conteggio di foglie per riga padre: esiste solo il conteggio totale.
- **Profondità:** By role ha due livelli (ruolo → coppie progetto/task); By project e By owner ne hanno tre (`kind` `project`/task/role e persona/progetto/task, più la riga `tbd` "Needs owner").
- **Team assistant:** `#teamAssistantPanel`, drawer fisso `width: min(940px, 100vw)` con `.pl-ta-backdrop` (`css/planning.css:254-269`), focus trap via `focusTrapTarget` e focus di ritorno (`planning.html:1096`, watcher `taOpen`). I risultati sono tabelle a 12 colonne (`planning.html:313-336`) con i campi di `rowView(row)` (`js/lib/team-assistant-ui.js:14-30`). Il select del progetto è nativo (`planning.html:284`).

## Comportamento atteso

Sotto i 768px (soglia `767.98px`, quella di `css/style.css`), sola consultazione:
- **Head:** titolo + bottone "Filters {n}".
- **Vista:** segmented By role / By project / By owner a tutta larghezza.
- **Stepper periodo:** "‹ Oct 2026 ›" con sotto-etichetta "Current month · planned" per il periodo corrente o futuro e "Actuals" per i passati. Mostra un periodo per volta, scelto dentro la finestra già impostata; le frecce non spostano la finestra e si fermano ai suoi estremi.
- **Card per riga padre:** titolo, "{n} assignments · Sold {h}", valore grande del periodo scelto, "{h} to plan", mini-barra con un segmento per periodo della finestra (passato grigio, corrente magenta, futuro navy, vuoto come trattino). Il tap apre o chiude la card e mostra i figli come righe di lista (etichetta, seconda riga, valore del periodo scelto). Apertura e chiusura usano `openIds[view]`, non uno stato parallelo.
- **Filtri come bottom sheet** (`9.9b.jpg`): titolo "Filters" + "Close", chip Pipeline, Projects, Team, Monthly pulse, Rounded, intervallo di periodo, "Show results" primario. Righe e target ≥ 44px.
- **Assenti su smartphone:** Load XLS, Expand all, qualunque modifica.
- **Team assistant:** foglio a schermo intero con barra in alto (titolo + Close); una card per persona al posto delle tabelle (nome, score, numeri chiave, rationale).
- Sopra i 768px il comportamento del ciclo 1 resta invariato.

## Vincoli

- Nessuna build: `css/planning.css` e i moduli `js/lib/` sono serviti così come sono. Ogni `?v=N` toccato va portato allo stesso N in tutto il repo. `css/planning.css` e `js/lib/planning-rows.js` sono a `?v=1`; `js/lib/planning-rows.js` importa `./planning-calc.js?v=5` e `./dates.js?v=4` (`js/lib/content-surface-guard.test.js`).
- Il modello e l'API restano invariati: card, valore grande e mini-barra derivano da `cells`. Il conteggio "{n} assignments" per padre è un helper puro nuovo in `js/lib/`, con test.
- Il template di `planning.html` è in-DOM: niente `<` nei mustache.
- Scenario 2: prima di toccare codice, characterization test del comportamento attuale che il ciclo tocca (`openIds`/`toggleRowState`/`effectiveFilter`, applicazione dei filtri, `activeFilterCount`).
- Guard da rispettare: `js/lib/nav-shell-guard.test.js`, `js/lib/page-head-guard.test.js`, `js/lib/dates-guard.test.js`, `js/lib/tokens.test.js` (contrasto ≥ 4.5:1 per ogni nuova coppia testo/sfondo in `tokens.css`).
- Nessun hex nel CSS: solo `var(--token)`.
- Modifiche ai file con il tool Edit o con uno script scritto su file; mai `Get-Content`/`Set-Content` sugli HTML.
- Verifica visiva con `scripts/shoot.mjs --widths 390` contro lo stack di branch, PNG riletti e confrontati con 9.9a/9.9b (PROCESS.md §6.6).

## Criteri di accettazione

1. A 390px `planning.html` non ha scroll orizzontale né tabella `pl-grid`; a 768px e a 1024px resta il layout del ciclo 1.
2. Per ognuna delle tre viste, a 390px c'è una card per riga padre di `activeRows.rows`, con titolo, "{n} assignments · Sold {h}", valore del periodo scelto e "{h} to plan".
3. "{n} assignments" di ogni card è uguale al numero di foglie sotto quel padre; l'helper ha un test che lo pinna per le tre viste.
4. La mini-barra ha un segmento per periodo della finestra, con le classi passato/corrente/futuro/vuoto ricavate da `cells[i]`.
5. Lo stepper cambia solo il periodo mostrato: `windowStart`/`windowEnd` e `modelRequest` restano invariati, e a ogni estremo della finestra la freccia corrispondente è disabilitata.
6. La sotto-etichetta dello stepper è "Current month · planned" sul periodo corrente o futuro e "Actuals" su un periodo passato.
7. Il tap su una card aggiorna `openIds[view]` e mostra i figli come righe di lista con il valore del periodo scelto.
8. Il pannello Filtri a 390px è un bottom sheet con Pipeline, Projects, Team, Monthly pulse, Rounded, intervallo di periodo, "Show results" e "Close"; ogni target misura almeno 44px.
9. A 390px non sono visibili né raggiungibili Load XLS, Expand all, Collapse all.
10. Il Team assistant a 390px occupa lo schermo intero con barra titolo + Close; i risultati sono una card per persona con nome, score, numeri chiave e rationale; Esc, Close e focus di ritorno funzionano come sul desktop.
11. `npm test` verde, compresi i guard citati nei Vincoli.

## Scope escluso (confermato dall'utente il 2026-11-03)

- Qualunque cambio al modello `POST /api/planning/model` e all'API.
- **B-245** (owner nelle righe figlie di By role, serve l'API).
- **B-246** ("Clear" = "Select all" nei popover Projects/Team).
- Modifiche sopra i 768px, salvo quelle che servono a non duplicare il markup.
- Load XLS su smartphone.
- Gesture (swipe tra periodi, trascinamento per chiudere il sheet).
- Il select nativo del progetto nel Team assistant.

## Domande aperte per `/brainstorming`

1. **Ricerca:** l'handoff non la nomina e le tavole non la mostrano. Va nel sheet, sopra le card, o non c'è?
2. **Livelli nelle card:** in By project e By owner (tre livelli) il tap apre solo il livello 1 o anche i successivi? Le tavole mostrano solo By role.
3. **"Show results":** filtri in bozza applicati alla chiusura, o immediati come oggi, con "Show results" che chiude soltanto?
4. **Intervallo di periodo nel sheet:** preset 3/6/12 + Whole range + From/To, o solo i preset? La tavola 9.9b non lo mostra.
5. **Monthly / Weekly:** l'handoff non nomina il segmented dell'intervallo su smartphone e la tavola non lo mostra. Va tolto, messo nel sheet, o tenuto sotto la vista?
6. **Head:** la tavola non mostra né Team assistant né Export. Dove si apre il Team assistant su smartphone? Export come icona nel head o assente?
7. **By owner:** come si rendono "Needs owner" (TBD) e i livelli di carico high/over nel valore grande e nella mini-barra?
8. **Tavola 9.9a:** il segmented mostra "By project" attivo ma le card sono righe di By role. Fa fede la vista per contenuto?
9. **Riga TOTAL:** la tavola non la mostra. C'è un totale su smartphone?
10. **Legenda e "How estimates work":** su smartphone restano, si spostano nel sheet o spariscono?
11. **Implementazione del sheet:** riusare `#plFiltersPanel` cambiando il placement Bootstrap (`offcanvas-bottom`) sotto i 768px, o un secondo guscio?
