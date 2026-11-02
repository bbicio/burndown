# Handoff — Planning redesign, ciclo 2 (smartphone)

**Scritto:** 2026-11-02, a chiusura del ciclo 1 (`planning-redesign`).
**Per:** la sessione che apre il ciclo 2. Si parte dalla fase Brief (`feature-brief`, Scenario 2, evoluzione); questo handoff ne è l'input, non un sostituto (PROCESS.md, nota sugli handoff di design).

## Dove siamo

| Artefatto | Path | Commit |
|---|---|---|
| Handoff di design (input di entrambi i cicli) | `docs/superpowers/design/planning/2026-11-02-redesign-planning.md` + tavole `9.8a`…`9.9b.jpg` | `1e8cbdb` |
| Spec ciclo 1 | `docs/superpowers/specs/2026-11-02-planning-redesign-design.md` | `1e8cbdb` |
| Piano ciclo 1 | `docs/superpowers/plans/2026-11-02-planning-redesign.md` | `2f8c817` |
| Merge ciclo 1 | — | `3d7d838` |
| Report ciclo 1 | `docs/superpowers/reports/2026-11-02-planning-redesign-finish-cycle.md` | `816b681` |
| Stato della pagina | `docs/pages/planning.md`, sezione "Planning redesign, cycle 1 (2026-11-02)" | `816b681` |

Il ciclo 1 ha fatto desktop e tablet, fino a 1024px compreso. Sotto i 768px oggi la pagina mostra il layout tablet con scroll orizzontale: è provvisorio per dichiarazione della Spec del ciclo 1 (§1 e §6), e il ciclo 2 lo sostituisce.

## Prima di aprire il ciclo 2

1. **Pulizia del ciclo 1, ancora da fare.** Lo stack di branch `planning-redesign` (porta 8081) è acceso e monta il worktree. Prima, dalla cartella del worktree (lo script ricava lo stack dal branch corrente): `scripts/test-branch.sh down`. Poi, dal checkout principale:
   ```bash
   git worktree remove .claude/worktrees/planning-redesign
   git worktree prune
   git branch -d planning-redesign
   ```
   `git branch -d` deve riuscire senza `-D`: il branch è interamente su `main`.
2. **Aprire la sessione dal checkout principale, non da un worktree.** Nel ciclo 1 la sessione era isolata nel worktree. Per questo Brief, Spec e Piano sono stati committati sul branch, con la deroga §3, e la Gate 5 è passata per un fast-forward. Da `main`, Brief, Spec e Piano si committano lì prima del worktree, come vuole PROCESS.md §6.1b/§6.5.
3. Worktree del ciclo 2, dopo il Piano: `git worktree add .claude/worktrees/planning-redesign-mobile -b planning-redesign-mobile`, poi `npm ci`; copiare `.env` dal checkout principale (serve a `scripts/test-branch.sh` e alle credenziali di `scripts/shoot.mjs`).

## Cosa copre il ciclo 2

Dal handoff di design, **§5 seconda metà** ("Smartphone <768") e **l'ultimo punto di §6** (Team assistant su smartphone); tavole **9.9a** e **9.9b**, parte destra (390×844):
- titolo + "Filters {n}"; segmented della vista a tutta larghezza; stepper "‹ Oct 2026 ›" con sotto-etichetta ("Current month · planned" / "Actuals"), un periodo per volta dentro la finestra;
- una card per riga padre: titolo, "{n} assignments · Sold {h}", valore grande del periodo scelto + "{h} to plan", mini-barra dei periodi della finestra (passato grigio, corrente magenta, futuro navy, vuoto trattino); tap = figli come righe di lista (etichetta, seconda riga, valore);
- Filtri come bottom sheet: chip Pipeline, Projects, Team, Monthly pulse, Rounded, intervallo di periodo, "Show results" primario, "Close"; righe e target ≥ 44px;
- niente Load XLS, niente Expand all, nessuna modifica; Export come icona nel head "se il pattern del sito lo consente";
- Team assistant: foglio a schermo intero con barra in alto (titolo + Close); le tabelle dei risultati diventano una card per persona (nome, score, numeri chiave, rationale).

## Fatti verificati nel codice (a `816b681`)

- **Le righe esistono già:** `js/lib/planning-rows.js` (`buildRoleRows`/`buildProjectRows`/`buildOwnerRows`) restituisce righe piatte `{ id, parentId, depth, kind, label, sub, …, sold, actuals, toPlan, cells }`, con `cells[i] = { h, past, current, pulse, load }` per ogni periodo della finestra. Card, valore grande e mini-barra si possono derivare da queste righe senza toccare il modello. `formatCell` dà il testo ("<1h", "~3h").
- **Manca il conteggio per riga:** "{n} assignments" per card non esiste oggi. Le righe non portano il numero di foglie per padre, solo `total.count` globale. Serve un helper puro nuovo (con test), non un cambio di API.
- **Interruttore del layout:** `isTablet` in `planning.html` segue `matchMedia('(max-width: 1024px)')`, con la stessa soglia in `css/planning.css` (`@media (max-width: 1024px)`). Per lo smartphone servirà un secondo stato a `767.98px`, la soglia telefono di `css/style.css` (dove `.ph-sub` sparisce e `--app-pad` diventa `--space-4`).
- **Pannello Filtri:** è l'offcanvas Bootstrap `#plFiltersPanel` (`offcanvas-end`), un guscio statico fuori dalla root Vue. Il contenuto (ricerca, chip, popover, switch, Load XLS) ci arriva con `<teleport to="#plFiltersBody">`; il teleport dell'intestazione è sempre montato (correzione Gate 3, round 1). La variante bottom sheet può riusare lo stesso target: va deciso nel Brief.
- **Periodo:** `defaultWindow`, `presetWindow`, `shiftWindow` e `weeklyWindowLabel` sono puri e testati (`js/lib/planning-rows.js`). Lo stepper "un periodo per volta" è uno stato nuovo, l'indice del periodo scelto dentro `activeRows.periods`, che non sposta la finestra. Il menu periodo usa `<cg-date-picker mode="month" inline-popover>`.
- **Ricerca ed espansione:** `openIds`, `search`, `suppressed`, uno per vista, con `toggleRowState`/`effectiveFilter`. Su questa interazione la Gate 3 del ciclo 1 ha fatto tre round. Le card che si aprono al tap devono riusare `openIds` e non uno stato parallelo.
- **Team assistant:** `#teamAssistantPanel`, drawer `width: min(940px, 100vw)` con `.pl-ta-backdrop` (`--overlay-scrim` a 0.5), focus trap (`focusTrapTarget`) e focus di ritorno. Sotto i 768px è già largo quanto lo schermo, ma non ha né la barra a schermo intero né le card per persona; `rowView(row)` (`js/lib/team-assistant-ui.js`) dà i campi già formattati.
- **Verifica visiva:** `scripts/shoot.mjs --widths 390` emula un device mobile sotto i 768px (`mobile: width < 768`). Gli stati interattivi si raggiungono con `--eval-file`. Per leggere valori dalla pagina: `document.querySelector('#planningApp')._vnode.component.proxy`, poi un overlay `<pre>` nello screenshot (`__vue_app__._instance` non è esposto nella build di produzione).

## Decisioni da prendere nel Brief / in `/brainstorming`

1. **Ricerca su smartphone:** l'handoff non la nomina. Va nel bottom sheet, sopra le card, o non c'è?
2. **Livelli nelle card:** By project ha tre livelli (Project → Task → Role) e By owner tre (persona → progetto → task). Il tap apre solo il livello 1 come righe di lista, oppure anche i livelli successivi? Le tavole mostrano solo By role (ruolo → coppie).
3. **"Show results":** oggi i filtri si applicano subito e ogni cambio rifà la richiesta del modello. Sul bottom sheet si applicano alla chiusura (stato bozza) o restano immediati, con "Show results" che chiude soltanto?
4. **"Intervallo di periodo" nel sheet:** preset 3/6/12 + Whole range + From/To come nel menu desktop, o solo i preset?
5. **Export su smartphone:** icona nel head (come su tablet) o assente? L'handoff lo condiziona al "pattern del sito".
6. **Unassigned (TBD) e carichi nelle card di By owner:** come rendere "Needs owner" e i colori high/over del periodo scelto e della mini-barra.
7. **Backlog collegato:** includere o no B-245 (owner nelle righe figlie di By role, serve l'API) e B-246 ("Clear" = "Select all")? Nessuno dei due è richiesto dalle tavole del ciclo 2.

## Promemoria dal ciclo 1

- I file si modificano con il tool Edit o con uno script scritto su file; mai `node -e`, mai `sed` con testo quotato. Mai `Get-Content`/`Set-Content` sugli HTML (BOM).
- Il template di `planning.html` è in-DOM: niente `<` nei mustache. La validazione rapida del template si è fatta con `@vue/compiler-dom` installato in una cartella temporanea, fuori dal repo, su `#planningApp` parsato da jsdom.
- Ogni `?v=N` toccato va portato allo stesso N in tutto il repo; `css/planning.css` e `js/lib/planning-rows.js` sono a `?v=1` su `main` e vanno bumpati al primo cambio. `js/lib/planning-rows.js` importa `./planning-calc.js?v=5` e `./dates.js?v=4`: un bump di quei file va riportato anche lì, come pinna `js/lib/content-surface-guard.test.js`.
- `scripts/claude-md-guard.test.js` fissa i byte del blocco File structure di `CLAUDE.md`, `js/lib/test-cases-parse.test.js` il numero dei casi: il ciclo che li cambia aggiorna il numero nello stesso commit.
- Lo stack di branch si smonta solo alla risposta "yes" della Gate 2. Uno stack riacceso dopo per verifiche resta acceso e va dichiarato, come è successo nel ciclo 1.
