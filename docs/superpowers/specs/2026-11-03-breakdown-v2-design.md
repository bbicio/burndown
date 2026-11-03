# Project reporting — Breakdown v2 — design spec

**Date:** 2026-11-03
**Brief started:** unknown
**Brief:** `docs/superpowers/design/project-reporting/20261103-brief-reporting-progetto-claude-code.md`
**Scenario:** 2 (evoluzione)

Evoluzione della card **Breakdown** della vista per singolo progetto di `portfolio.html` (`?projectId=`), sopra il
redesign 7.4 (spec `docs/superpowers/specs/2026-10-15-project-reporting-redesign-design.md` §6). Cambiano solo
interazione e presentazione delle Entries; nessun calcolo di Sold, Spent, Remaining o Total cambia.

## 1. Obiettivo

- Un solo blocco Entries condiviso dalle tre viste, con filtro Role/Resource e ordinamento per colonna.
- By role espandibile; By functional area a due livelli (area → task → Entries).
- Menu Period e filtro che si chiudono su clic esterno ed Esc.
- Layout tablet (Note sotto la riga) e smartphone (card, bottom sheet per filtro, ordinamento e Period).

## 2. Fatti verificati nel codice (a `5a60137`)

- Markup della card: `portfolio.html:525-662`; computed 1084-1226; metodi 1291-1382.
- `summaryTotals` non esiste più: il Total viene da `breakdownRows(cols, hasFilter, totalCol?).total`
  (`js/lib/project-report-calc.js:56`). By area passa `areaTotalColumn` (sovrapposizioni contate una volta).
- Righe: `summaryByTask` (`buildSummaryCols`), `summaryByRole` (`roleColumns`, una colonna per coppia
  `role|task`, più coppie non configurate con `soldHours: null`, B-073), `summaryByGroup` (`areaColumns`).
- Solo By task si espande (`taskName` è null altrove, `portfolio.html:1147`). Stato
  `taskDetailState[taskName] = { expanded, openMonth }` (:739), azzerato in `showDashboard()` (:1541).
- Entries: `entriesByMonth(periodData, rateFor)` (`project-report-calc.js:100`), mesi dal più recente, righe per data
  crescente, nessun ordinamento; `openMonth` default `null` (tutti chiusi).
- `exportTaskEntriesXls(entry)` (:1344) esporta `entry.periodData`: **rispetta il Period**.
- Menu Period: dropdown Bootstrap `data-bs-auto-close="outside"` (:539-559); `pickPeriod` lo chiude via
  `bootstrap.Dropdown.getOrCreateInstance(btn).hide()`.
- Sotto 1280px Remaining è nascosto (`css/portfolio.css:621`, guard test); sotto 768px griglia a 4 tracce, nessuna
  card, nessuna bottom sheet, nessun flag `isPhone`.
- Righe espandibili e mesi: `role="button"` + `@keydown.enter.space.prevent` (esattamente 3, pinnati da
  `js/lib/portfolio-guard.test.js`).
- Versioni: `css/portfolio.css?v=8` (anche in `program.html`, pinnato dal guard), `js/lib/project-report-calc.js?v=3`.

## 3. Mappa tavola → sezione

| Tavola | Contenuto | Sezioni |
|---|---|---|
| 7.4e | By task, filtro Role attivo, tutti i mesi con risultati aperti, ordinato per Hours ↓ | §4, §5, §6, §9 |
| 7.4f | By role, riga espansa, menu Resource aperto | §5, §6, §7.2, §8 |
| 7.4g | By functional area: area → task aperta → Entries | §7.3 |
| 7.4h | Tablet 1024, By role con filtro Resource, Note sotto la riga | §10.1 |
| 7.4i | Smartphone, By task, filtro in bottom sheet | §10.2 |
| 7.4j | Smartphone, By area, Entries a card, chip Sort, Export a icona | §10.2 |

Scostamento dichiarato: la 7.4h mostra Remaining a 1024px; resta nascosto sotto 1280px (Decisione 7).

## 4. Logica pura — `js/lib/report-entries.js` (nuovo)

ES module con bridge `window.*`, testato con vitest (TDD). Nessuna dipendenza dal DOM.

- `entriesBlock(entries, state, rateFor)` → `{ total, shown, months, hiddenMonths }`:
  - `entries`: le entry del blocco già ristrette al Period;
  - `state`: `{ filter: string[], filterKind: 'role'|'resource', sort: { key, dir }, openMonth: string|null, closedMonths: string[] }` (`filter` vuoto = "All");
  - `months`: dal più recente, ognuno `{ ym, count, hours, amount, rows, open }`, totali calcolati sulle righe
    filtrate; `rows` ordinate secondo `sort` dentro il mese, parità rotte per data decrescente;
  - senza filtro: un solo mese aperto, `openMonth` se presente fra i mesi, altrimenti il più recente; `openMonth`
    uguale a `''` significa "tutti chiusi a mano";
  - con filtro: mesi senza righe corrispondenti esclusi e contati in `hiddenMonths`; aperti tutti i mesi restanti
    salvo quelli in `closedMonths`;
  - `total` = M (entry nel Period), `shown` = N (entry che passano il filtro).
- `filterOptions(entries, kind)` → `[{ value, hours }]`: ruoli (`kind: 'role'`, valore = `role`) o risorse
  (`kind: 'resource'`, valore = `owner`) presenti nelle entry, ore decrescenti.
- `pruneFilter(filter, options)` → filtro senza i valori assenti da `options`; `[]` ("All") se non ne resta nessuno.
- `nextSort(sort, key)` → nuova colonna: `asc`; stessa colonna: direzione invertita. Default `{ key: 'date', dir: 'desc' }`.
- Chiavi di ordinamento: `date`, `who` (Role (resource) o Resource), `hours`, `amount`. Note non è ordinabile.

## 5. Blocco Entries condiviso

Componente Vue `pr-entries`, registrato sull'app di `portfolio.html`, template in `<template id="pr-entries-tpl">`
dentro `portfolio.html` (fuori dal mount root), così i guard test ne leggono il copy.

- Props: `entries` (già nel Period), `filter-kind` (`role`|`resource`), `state` (oggetto di `entriesState`),
  `export-name`, `period-label`, `rate-for`.
- Header: "Entries · N" (con filtro "Entries · N of M"), chip filtro, "Clear" se attivo, "Export XLS".
- Mese: chevron, etichetta breve "Sep 2026", "N entries", ore, importo.
- Righe: Date · Role (resource) · Hours · Amount · Note; con `filter-kind="resource"` la colonna si chiama
  "Resource" e mostra solo l'owner.
- Intestazione ripetuta per ogni mese aperto (come nelle tavole); un clic su una qualsiasi ordina l'intero blocco.
- Footer con filtro e mesi nascosti: "N months without matching entries hidden" (singolare "1 month …").
- Stati vuoti: "No entries in the selected period."; "No entries match the selected filters." + "Clear".

## 6. Filtro, ordinamento, persistenza

- Ordinamento: freccia SVG solo sulla colonna attiva, che diventa navy; `aria-sort` sul `th`.
- Filtro multi-selezione: menu "Filter by role" / "Filter by resource", "All" in cima, opzioni di `filterOptions`
  con le ore, nota "Roles with entries in <period>" / "Resources with entries in <period>".
- Chip attivo: bordo e sfondo come il Period attivo; etichetta "Role: PM, Analyst", con più di 2 valori
  "Role: 3 selected".
- Applicare un filtro apre tutti i mesi con risultati; rimuoverlo torna a un solo mese aperto, il più recente.
  Con filtro i mesi si chiudono singolarmente.
- Al cambio di Period: `pruneFilter` su ogni stato con filtro.
- Il filtro non tocca le righe principali.
- Stato: `entriesState` sostituisce `taskDetailState`, con chiavi `task:<name>`, `role:<role>|<task>`,
  `area:<i>|<task>`; ogni valore `{ expanded, openMonth, closedMonths, filter, sort }`; rimuovere il filtro
  svuota `closedMonths` e riporta `openMonth` a `null`. Persiste fra collapse/expand e cambio
  vista; `showDashboard()` lo azzera (`this.entriesState = {}`), il reload pure.

## 7. Le tre viste

### 7.1 By task
Come oggi (ruoli indentati, poi Entries), con il blocco di §5 e filtro Role. Le task escluse dal report si espandono
sullo stesso blocco.

### 7.2 By role
- Ogni riga `role|task` è espandibile, anche se senza Sold (coppie non configurate).
- Dentro: solo il blocco Entries con le entry di quel ruolo su quella task, filtro Resource.
- Sottotitolo: "<risorse, …> · <task>".

### 7.3 By functional area
- Ogni area è espandibile; dentro le sue task, indentate, con le stesse colonne e lo stesso "Over sold".
- Valori di una task dentro un'area: somma delle colonne `roleColumns` della task che corrispondono all'area via
  `normalizeGroupEntries`/`entryMatchesRow` — nessuna regola nuova. Funzione pura in `project-report-calc.js`
  (`areaTaskColumns(group, roleCols)`), con test che le task di un'area sommano alla riga d'area.
- Sottotitoli: area "N tasks · <task, …>", task "N roles".
- Task espandibile → direttamente il blocco Entries (solo le entry che corrispondono all'area), filtro Role.
- Una sola task aperta per area: aprirne un'altra chiude la precedente, il cui stato resta.
- Area senza entry: riga espandibile, Entries con il messaggio del Period. Nessuna area configurata: invariato.

### 7.4 Gerarchia
Riga principale → sotto-riga → Entries → mese → riga entry; 24px per livello, chevron in colonna, nessuna linea
verticale. Le sotto-righe usano lo stile già definito per i ruoli in By task.

## 8. Menu Period e filtro

- Popover controllati da Vue (flag `open`), non più dropdown Bootstrap: il Period perde `data-bs-toggle`.
- Chiusura: clic fuori dal menu e dal pulsante (listener su `document` aggiunto all'apertura, rimosso alla chiusura),
  Esc (focus al pulsante). Un clic dentro non chiude, salvo "Whole project" o un mese nel Period, che applicano e
  chiudono come oggi. I date picker inline del Custom range restano dentro il menu.
- Tastiera nella lista del filtro: frecce su/giù fra le opzioni, Space alterna la checkbox, Esc chiude.

## 9. Accessibilità

- Righe espandibili e mesi: `<button>` con `aria-expanded` e `aria-controls`, al posto di `role="button"` + handler
  `keydown`; la riga intera resta cliccabile.
- Intestazioni ordinabili: `<button>` dentro `th`, `aria-sort` sul `th`.

## 10. Responsive

### 10.1 Tablet (768–1279px)
Struttura invariata; nelle righe entry la Note va su una seconda riga sotto Date/Role. Remaining resta nascosto sotto
1280px.

### 10.2 Smartphone (sotto 768px, `isPhone` via `matchMedia('(max-width: 767.98px)')`)
- Righe principali a card: nome + "Over sold", sottotitolo, barra + %, "Spent X of Y" · "Remaining Z".
- Segmented a 3 colonne: "By task", "By role", "By area". Period: pulsante con la sola etichetta del periodo.
- Entry a card: data + ore in alto, ruolo/risorsa e importo sotto, nota in fondo se presente; header del mese con
  solo N entries e ore.
- Export XLS: icona da 36px. Ordinamento: chip "Sort: Date ↓" accanto al filtro.
- Bottom sheet (`offcanvas offcanvas-bottom`, una istanza per tipo, legata al blocco attivo):
  - "Filter by role"/"Filter by resource": checkbox, "Clear" e "Apply";
  - "Sort entries": campo a radio + Ascending/Descending, nota "Applies inside each month", "Reset" e "Apply";
  - Period: Whole project, mesi, Custom range.
- Target minimi 44px (righe sheet 48px, chip da 36px con area di clic estesa). By area: 12px per livello.

## 11. Export XLS per blocco

Tutte le entry del blocco nel Period, data crescente, ignorando filtro e ordinamento (comportamento di oggi
generalizzato). Colonne: Date, Role (resource) o Resource, Hours, Amount, Note. Nomi file `task_<task>_entries.xlsx`,
`role_<role>_<task>_entries.xlsx`, `area_<area>_<task>_entries.xlsx` (caratteri non alfanumerici → `_`).
`exportBreakdownXls` non cambia.

## 12. CSS, cache-busting

- Stili in `css/portfolio.css`, solo `var(--token)`, icone SVG `stroke="currentColor"`, niente emoji.
- Bump: `css/portfolio.css` `?v=8` → `?v=9` in `portfolio.html` e `program.html` (e nel guard);
  `js/lib/project-report-calc.js` `?v=3` → `?v=4`; nuovo `js/lib/report-entries.js?v=1`.

## 13. Test e verifica

- vitest TDD su `report-entries.js` e `areaTaskColumns`.
- Characterization: i test B-073 di `project-report-calc.test.js` (totali coerenti fra viste) restano verdi senza
  modifiche.
- Guard `portfolio-guard.test.js` aggiornati: chiave di reset `entriesState`, `?v=9`, i `keydown` sostituiti da
  `<button>`, nuovo copy.
- Verifica visiva con `scripts/shoot.mjs` a 1440, 1024 e 390 su BERMITS Maintenance 2026 dallo stack di branch
  (`scripts/test-branch.sh up`, `--base http://localhost:8081`), PNG riletti e confrontati con le tavole.

## 14. Documentazione

Sezione "Breakdown v2" in `docs/pages/portfolio.md`; la regola "By role / By functional area non espandibili" va
rimossa dove compare.

## 15. Fuori scope

- Ogni calcolo di Sold, Spent, Remaining, % e Total.
- `exportBreakdownXls`, la vista overview del portfolio, `program.html` (salvo il bump di versione).
- Il selettore dei progetti fratelli e il resto della pagina su smartphone.

## Criteri di accettazione

1. **Menu** — Period e filtro si chiudono su clic esterno ed Esc; Esc riporta il focus al pulsante.
2. **Blocco unico** — le tre viste usano lo stesso componente `pr-entries`.
3. **Ordinamento** — clic su Date/Role/Hours/Amount ordina dentro ogni mese, default Date ↓, `aria-sort` presente.
4. **Filtro** — By task e By area filtrano per Role, By role per Resource; opzioni limitate al Period.
5. **Mesi** — senza filtro un solo mese aperto (il più recente di default); con filtro tutti i mesi con risultati
   aperti, i vuoti nascosti e contati nel footer.
6. **Persistenza** — filtro, sort, mese aperto ed espansione restano fra collapse/expand e cambio vista; si azzerano
   al cambio progetto.
7. **By role / By area** — By role espandibile; By area a due livelli, una task aperta per area, task che sommano
   alla riga d'area.
8. **Export** — Export XLS di un blocco contiene tutte le sue entry nel Period, indipendentemente dal filtro.
9. **Calcoli invariati** — Sold/Spent/Remaining identici a prima con e senza Period e con filtro attivo (test B-073
   verdi).
10. **Responsive** — a 1440, 1024 e 390 la card corrisponde alle tavole 7.4e–7.4j, salvo lo scostamento di §3.
11. **Doc** — `docs/pages/portfolio.md` ha la sezione "Breakdown v2".

## Decisioni aperte

1. **Modulo puro `report-entries.js` più componente `pr-entries` con template in pagina.** Alternativa scartata: un
   file `js/*-component.js` con template come stringa, o tre copie del markup. Perché: il copy resta leggibile dai
   guard test e la logica è testabile senza DOM.
2. **Filtro multi-selezione.** Alternativa scartata: single-select. Perché: proposto dal brief §8.1.
3. **L'export per blocco rispetta il Period, come oggi.** Alternativa scartata: tutte le entry del progetto. Perché:
   proposto dal brief §8.2 e coerente con il codice attuale.
4. **Stato azzerato al cambio progetto e al reload.** Alternativa scartata: stato conservato per la sessione.
   Perché: proposto dal brief §8.3.
5. **Menu come popover gestiti da Vue, non dropdown Bootstrap.** Alternativa scartata: tenere Bootstrap per il Period.
   Perché: i due menu devono comportarsi in modo identico.
6. **Period su smartphone come bottom sheet, dentro lo scope.** Alternativa scartata: dropdown con etichetta
   accorciata. Perché: il brief lo dà per esistente e la 7.4i lo presuppone.
7. **Remaining resta nascosto sotto 1280px.** Alternativa scartata: mostrarlo a 1024 come la 7.4h. Perché: con la
   sidebar aperta lo spazio non basta.
8. **Etichette dei mesi brevi ("Sep 2026").** Alternativa scartata: lunghe come oggi. Perché: così le tavole.
9. **Anche le righe senza Sold si espandono in By role e By area.** Alternativa scartata: non espandibili. Perché: le
   loro entry esistono e vanno consultabili.
