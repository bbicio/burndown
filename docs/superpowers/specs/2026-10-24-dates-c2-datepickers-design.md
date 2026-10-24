# Spec — date, ciclo C2: un solo datepicker e formato non ambiguo nei form

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-24-dates-c2-datepickers-brief.md` (Scenario 2, evoluzione).
**Audit:** `docs/superpowers/audits/2026-10-24-dates-form-validation-audit.md`, finding D-09, D-10, D-13.
**Assorbe:** B-129, la parte di B-134 su `project-config.html` (`month2ym`/`ym2month`/`ymdToIt`/`itToYmd`), B-137.
Design concordato in chat il 2026-10-24 (una fermata, §6b).

## 1. Scope

Ogni campo data editabile dei form usa `CgDatePicker` (`js/cg-controls.js`). Il testo mostrato e digitato è in un formato inglese con il mese in lettere, prodotto e letto solo da `js/lib/dates.js`. Il comportamento attuale, con le citazioni, è nel Brief e nell'audit.

Fatti emersi nel brainstorming:
- Fuori dal modulo date, i formattatori e parser di testo hanno quattro consumatori: `js/cg-controls.js` (130, 170, 176), il ramo "evento nativo" di `onTaskDateChange` in `costgrid.html` (1694) e `itToYmd` in `project-config.html` (942).
- `js/lib/dates.js` è caricato da `costgrid.html`, `pipeline.html` e `project-config.html`, tutti con `?v=2`.
- Il Custom range del portfolio vive dentro un dropdown Bootstrap con `data-bs-auto-close="outside"` (`portfolio.html:538`). Il popover del picker, teleportato in `<body>`, conta come "fuori".
- La data dei task in costgrid è larga 84px (`css/costgrid.css:862`), troppo poco per `Dec 31, 2026`.
- Il mese dei PTC in project-config è una `<select>` dei mesi del progetto (`project-config.html:265`).

## 2. Comportamento atteso

### 2.1 Modulo date (`js/lib/dates.js`)

Formattatori, con un array fisso di nomi inglesi (niente `Intl` né `toLocale*`, così l'output non dipende dal browser):
- `formatDayText('2025-12-01')` → `Dec 1, 2025`. Il giorno non ha zero iniziale. L'input è ISO; un input vuoto o malformato dà `''`.
- `formatMonthText('202512')` → `Dec 2025`. Un input non valido dà `''`.

Parser, che ignorano maiuscole/minuscole e gli spazi ai bordi, collassano gli spazi multipli e restituiscono `null` su testo illeggibile o su una data che non esiste:
- `parseDayText` accetta `Dec 1, 2025`, `Dec 1 2025`, `1 Dec 2025`, i nomi interi (`December 1, 2025`, `1 December 2025`) e l'ISO `2025-12-01`. Restituisce l'ISO.
- `parseMonthText` accetta `Dec 2025`, `December 2025` e l'ISO `2025-12`. Restituisce `YYYYMM`.
- Una forma tutta numerica diversa dall'ISO (`03/04/2026`, `3.4.2026`, `03-04-2026`, `04/2026`) è sempre `null`.

`parseDateInput` mantiene la sua firma. I messaggi diventano:
- `Enter a date like Dec 1, 2025.`
- `Enter a month like Dec 2025.`
- `Must be on or after <min formattato>.` / `Must be on or before <max formattato>.`, con il nuovo formato.

Il server twin non cambia: non esporta queste funzioni.

### 2.2 Componente `CgDatePicker` (`js/cg-controls.js`)

- Il campo perde `inputmode="numeric"`. `maxlength` diventa 20 sia in giorno sia in mese.
- Il placeholder di default è `Dec 1, 2025` in modalità giorno e `Dec 2025` in modalità mese.
- Il commento di `openFromButton` che cita "dd/mm/yyyy" va aggiornato.
- Nuovo prop booleano `inlinePopover` (default `false`): rende il popover con `<Teleport to="body" :disabled="inlinePopover">`, cioè dentro l'albero del componente. Con il prop attivo, il clic nel popover non chiude un dropdown Bootstrap contenitore. Il posizionamento deve restare corretto quando il popover non è teleportato. Se `cgPopStyle` usa coordinate di viewport con `position: fixed`, il risultato va verificato dentro il `.dropdown-menu`, che non ha `transform`.
- B-137: il watcher di `modelValue` azzera anche `error`.
- Tastiera, `aria-label` e i limiti `min`/`max` restano come oggi.

### 2.3 Stili

- Le regole della famiglia dei controlli (`.cg-ctl*`, `.cg-pop*`, `.cg-day-*`, `.cg-month-*`) passano da `css/costgrid.css` a un nuovo `css/controls.css`, invariate.
- In `costgrid.css` restano solo gli override contestuali di costgrid, come `.cg-task-date .cg-ctl`.
- `css/controls.css` è caricato da `costgrid.html`, `project-config.html` e `portfolio.html`, dopo `style.css` e prima del foglio della pagina. Parte da `?v=1`.
- La larghezza di `.cg-task-date .cg-ctl` cresce fino a contenere `Dec 31, 2026` senza troncare. Il valore si misura con `scripts/shoot.mjs` (§6.6.5) e si verifica che la tabella dei task non vada fuori layout a 1440 e a 1024.

### 2.4 `project-config.html`

- **Start/End mese:** `<cg-date-picker mode="month">` legati direttamente a `project.startDate`/`project.endDate` (`YYYYMM`). `:max` di Start = End, `:min` di End = Start, `:disabled="isViewer"`, `aria-label` "Start month"/"End month". Si rimuovono le computed `startMonthInput`/`endMonthInput` e le funzioni `month2ym`/`ym2month`. `onDateChange`, che è vuoto, si rimuove insieme ai suoi due `@change`.
- **Periodo del task:** due `<cg-date-picker mode="day">` sul valore `toIso(task.startDate)`/`toIso(task.endDate)`. Sull'aggiornamento: `task.startDate = $event ? toYmd($event) : ''`, poi `rebuildTaskDist(ti)`. `:max` di Start = `toIso(task.endDate)`, `:min` di End = `toIso(task.startDate)`, `:disabled="isViewer"`, `aria-label` "Task start date"/"Task end date". Si rimuovono `ymdToIt`/`itToYmd` e il placeholder `gg/mm/aaaa`. Il testo "(optional — defaults to project dates)" resta.
- Il vincolo "task dentro il periodo del progetto" non si aggiunge (C3).
- La pagina carica `css/controls.css`, `js/lib/cg-controls-calc.js` e `js/cg-controls.js` (nell'ordine di `costgrid.html`) e registra il componente: `app.component('cg-date-picker', window.CgDatePicker)`.
- Il layout della sezione resta quello attuale: il resto del redesign di project-config è un altro ciclo.

### 2.5 `portfolio.html`

- I due `<input type="date">` del Custom range diventano `<cg-date-picker mode="day" inline-popover>` su `filterStart`/`filterEnd`, che sono ISO come prima. Sull'aggiornamento si azzera `filterMonth`, come fa oggi `@change`. `:max` di From = `filterEnd`, `:min` di To = `filterStart`. Gli `aria-label` "From"/"To" restano.
- La logica del filtro (`portfolio.html:1061-1067`) non cambia.
- La pagina carica `js/lib/dates.js`, `js/lib/cg-controls-calc.js`, `js/cg-controls.js` e `css/controls.css`, e registra il componente.
- Lo stile della riga `.pr-period-custom-row` si adatta quanto basta perché i due picker stiano nel menu: è un ritocco, non un redesign.

### 2.6 `costgrid.html` e `js/costgrid.js`

- I picker esistenti adottano il formato nuovo senza modifiche al markup.
- Il ramo "evento nativo" di `onTaskDateChange` (1693-1695) resta: con il formato nuovo continua a funzionare, perché passa da `parseDayText`.
- `cgFmtMonth` (`js/costgrid.js:54`) restituisce `formatDayText` del suo input normalizzato a ISO, quindi la banda delle fasi mostra `May 11, 2026 – Dec 31, 2026`. Il commento sull'`en-GB` va aggiornato.
- `pbFmtMonth` e le etichette di colonna (`monthLabel`) non cambiano.

### 2.7 Guard e test

- `js/lib/dates.test.js`: per i quattro formattatori/parser, le forme accettate, la riscrittura canonica (`december 1 2025` → `Dec 1, 2025` dopo un giro parse+format), i rifiuti (`03/04/2026`, `3.4.2026`, `04/2026`, `Feb 30, 2026`, `Foo 2025`), i messaggi di `parseDateInput`.
- `js/lib/dates-guard.test.js` si estende:
  - nessun `.html` della root contiene `type="date"` o `type="month"`;
  - nessun `placeholder` di un `.html` o di `js/cg-controls.js` contiene un pattern numerico data (`dd/mm`, `mm/dd`, `gg/mm`, `aaaa`, `yyyy`);
  - `portfolio.html` e `project-config.html` caricano `js/lib/dates.js`, `js/cg-controls.js` e `css/controls.css`;
  - tutti i riferimenti a `dates.js`, `cg-controls-calc.js`, `cg-controls.js` e `controls.css` concordano sul `?v=N`.
- I test statici del picker (`js/lib/cg-controls-ui.test.js`) si aggiornano: placeholder, assenza di `inputmode="numeric"`, `Teleport` con `:disabled`, reset di `error` nel watcher.
- `js/lib/costgrid-guard.test.js` si aggiorna se pinna regole spostate in `controls.css`.
- `?v=N`: si aggiornano ovunque i riferimenti a ogni file versionato toccato (`dates.js`, `cg-controls.js`, `costgrid.css`, `costgrid.js` e gli altri file modificati), cercandoli con grep in tutto il repo.

### 2.8 Verifica visiva

`scripts/shoot.mjs` contro lo stack del branch (`--base http://localhost:8081`, `--settle 3000`):
- costgrid: header con Start/End e una riga di task con le date, a 1440 e a 1024;
- project-config: Project info e un task espanso, a 1440 e a 390;
- portfolio: vista di reporting di un progetto con il menu Period aperto e il calendario di From aperto, a 1440.

I PNG si rileggono e si confrontano con `config_form_part1.jpg` (Start/End "Dec 2025", periodo del task "Dec 1, 2025"). Gli scostamenti si presentano uno per uno (§6.6.5).

## 3. Mappa tavole → spec

| Tavola | Cosa mostra di date | Sezione |
|---|---|---|
| `docs/superpowers/design/config-project/config_form_part1.jpg` | Start/End mese "Dec 2025" con icona calendario; periodo del task "Dec 1, 2025 – Dec 31, 2026"; etichette "Dec 25 – Dec 26" in sola lettura | §2.1, §2.4. Icona a destra, non a sinistra: ledger 4. Le etichette della tabella task sono del redesign |
| `docs/superpowers/design/config-project/config_form_tablet_smartphone.jpg` | Su smartphone, il periodo del task come campo unico "Dec 1, 2025 – Dec 31, 2026" | Fuori scope: ledger 4 |
| `docs/superpowers/design/config-project/config_form_part2.jpg` | Nessun campo data; il mese dei PTC non compare | Ledger 5 |
| `docs/superpowers/design/config-project/config_form_phasing_hours.jpg` | Solo etichette di colonna in sola lettura | Nessuna modifica |

**Controlli nativi lasciati (§6.6.1):** solo la `<select>` del mese dei PTC in `project-config.html:265` (ledger 5).

## 4. File toccati

`js/lib/dates.js`, `js/lib/dates.test.js`, `js/lib/dates-guard.test.js`, `js/cg-controls.js`, `js/lib/cg-controls-ui.test.js`, `js/costgrid.js`, `css/controls.css` (nuovo), `css/costgrid.css`, `costgrid.html`, `project-config.html`, `portfolio.html`, `pipeline.html` (solo `?v=`), più eventuali altri file che referenziano un file versionato toccato. Documentazione al Gate 5: CLAUDE.md "Dates" e il blocco `css/` (il numero di fogli), `docs/css/stylesheets.md`, `docs/js/cg-controls.md`, `docs/js/lib.md`, `docs/pages/{costgrid,project-config,portfolio}.md`, `docs/BACKLOG.md` (B-129, B-134, B-137).

## 5. Scope escluso

- La validazione lato server e il modulo date del server (C1).
- Il vincolo "task dentro il periodo del progetto o della proposta" (C3).
- Il redesign di project-config: layout, sezioni, il campo periodo unico su smartphone, l'icona a sinistra.
- Gli helper di B-134 fuori da project-config (`cg-controls-calc.js`, `toYYYYMM` in `js/costgrid.js`, `api/src/lib/dates.js`).
- Le etichette in sola lettura diverse da `cgFmtMonth`.
- Gli item 3 e 5 del backlog dei test manuali.
- Ogni difetto nuovo trovato durante il ciclo va in `docs/BACKLOG.md` o in un Brief a sé.

## Criteri di accettazione

1. **Nessun controllo nativo** — `js/lib/dates-guard.test.js` passa e fallisce se si reintroduce `type="date"` o `type="month"` in una pagina, o un placeholder `dd/mm/yyyy`.
2. **Formato** — i test di `js/lib/dates.test.js` passano: `Dec 1, 2025` è letto come `2025-12-01` e riscritto identico, `03/04/2026` è rifiutato.
3. **Rifiuto con messaggio** — in project-config, digitando `Foo 2025` nello Start mese compare `Enter a month like Dec 2025.` sotto il campo, e il valore non cambia.
4. **Ordine in project-config** — con lo Start mese a `Mar 2026`, nel calendario dell'End i mesi precedenti sono disabilitati e digitare `Jan 2026` mostra `Must be on or after Mar 2026.`; lo stesso vale per le date di un task.
5. **Ordine nel portfolio** — nel Custom range, con From `Mar 10, 2026`, i giorni precedenti nel calendario di To sono disabilitati; scegliere un giorno non chiude il menu Period e applica il filtro.
6. **Costgrid** — Start/End della versione mostrano `Dec 2025`, le date dei task `Dec 1, 2025` senza troncare, e la banda delle fasi mostra `May 11, 2026 – …`.
7. **Viewer** — in project-config, aperto in sola lettura, i quattro picker sono disabilitati.
8. **Verifica visiva** — i PNG di §2.8 sono stati riletti e confrontati con `config_form_part1.jpg`, con gli scostamenti presentati uno per uno.
9. **Suite** — `npm test` passa.

## Decisioni aperte

1. **Calendario a comparsa più campo digitabile, riusando `CgDatePicker`.** Alternativa scartata: solo calendario, o solo testo. Perché: le tavole mostrano l'icona calendario e il componente fa già entrambe le cose.
2. **Parser tollerante con riscrittura canonica.** Alternativa scartata: accettare solo la forma canonica. Perché: l'ISO incollato e il mese scritto per intero non sono ambigui, e rifiutarli genera solo attrito.
3. **C2 sostituisce i campi sul markup attuale di project-config.** Alternativa scartata: lasciare i campi di project-config al redesign. Perché: B-129 e il placeholder italiano sono difetti di oggi.
4. **Niente campo intervallo unico su smartphone; l'icona resta a destra come in costgrid.** Alternativa scartata: costruirli in C2. Perché: dipendono dal layout del redesign, che deciderà anche la posizione dell'icona.
5. **Il mese dei PTC resta una `<select>` nativa.** Alternativa scartata: un picker mensile. Perché: è una scelta in una lista chiusa di mesi già validi, non un'immissione di date.
6. **Stili in un nuovo `css/controls.css` caricato da tre pagine.** Alternativa scartata: `css/style.css`. Perché: è caricato da ogni pagina, con l'accordo `?v=` pinnato su tutte, per regole che ne servono tre.
7. **Delle visualizzazioni in sola lettura cambia solo `cgFmtMonth`.** Alternativa scartata: uniformare tutte le etichette. Perché: in costgrid la banda delle fasi sta accanto ai campi, e le altre etichette sono già non ambigue.
8. **B-137 assorbito.** Alternativa scartata: lasciarlo in backlog. Perché: è una riga nel watcher che il ciclo tocca comunque.
