# Resource Planning v2 (tavole 9.8–9.9) — design spec, ciclo 1 di 2

**Date:** 2026-11-02
**Brief started:** unknown
**Brief:** `docs/superpowers/design/planning/2026-11-02-redesign-planning.md`
**Scenario:** 2 (evoluzione)

Restyling di `planning.html` dentro la sua struttura attuale: stessa app Vue 3 (CDN, nessun build), stesso
modello server (`POST /api/planning/model`, `modelRequest`, `loadModel`, `adaptRoleModel`/`adaptProjectModel`/
`adaptOwnerModel`), stessi filtri, viste, intervallo, toggle, import/export XLS e Team assistant.

Precedenza: il sito prevale sulle tavole per componenti, token, navigazione e regole di business (handoff §0); le
tavole prevalgono sul brief per l'aspetto; i numeri delle tavole sono dati d'esempio. Il toggle **Compact**, presente
in tutte le tavole desktop, **non si implementa** (rimosso il 2026-10-29, pinnato da `content-surface-guard.test.js`).

**Questo è il ciclo 1 di 2.** Il ciclo 2 copre lo smartphone < 768px (card, stepper di periodo, bottom sheet dei
filtri: handoff §5 seconda metà, parte destra di 9.9a/9.9b). In questo ciclo, sotto 768px la pagina mostra il layout
tablet con scroll orizzontale.

## 1. Obiettivo

Portare la pagina al linguaggio delle pagine già ridisegnate: page head con azioni, toolbar a due righe con chip di
stage e popover, selettore di periodo, ricerca, legenda con popover esplicativo, griglia a classi con colonne e
intestazione sticky, tre livelli veri in By project, "Unassigned (TBD)" in testa a By owner, carichi sulle persone, un
layout tablet a 1024px con pannello Filtri e un drawer del Team assistant — senza cambiare API, calcoli, formati XLS
né la logica del Team assistant.

## 2. Fatti verificati nel codice

Verificati il 2026-11-02 su `main` (`d93b45c`); numeri di riga di `planning.html` salvo diversa indicazione.

- **Nomi:** tutti i nomi Vue citati dall'handoff esistono, salvo che `getPpAxis` (`js/core.js:61`),
  `getCalendarWeeks` (`js/lib/planning-calc.js:12`) e `selectionStillValid` (`js/lib/team-assistant-ui.js:65`) sono
  globali, e `inactiveBadgeSuffix` (291) e `roleChildMap` (409) sono locali. Il filtro Team esiste già: `teamFilters`
  (Set), `allTeams` (331), `isTeamChecked`/`onTeamFilterToggle`/`selectAllTeams`/`resetTeamFilters`, inviato in
  `modelRequest` (351).
- **Rendering:** ogni vista è un computed (`byRoleView` 402, `byProjectView` 604, `byOwnerView` 855) che costruisce
  una stringa HTML con `style=""` inline e hex (`#e9ebec`, `#4dabf7`, `#c8e6ff`, …), iniettata con
  `v-html="activeViewHtml"` (129). Emoji e glifi: ▶ ▼ (toggle), ◀+ −▷ ◁− +▶ (finestra, 104-108), ✕ (reset, 71/89), 🤖
  (panel, 136), 🏢 📋 👤 (etichette), ⊞ ⊟ (Expand/Collapse).
- **Espandi/comprimi** vive solo nel DOM: `initTooltipsAndToggles()` (1256) ricostruisce a ogni render una Map dai
  `style.display` delle righe, quindi lo stato si azzera quando `v-html` sostituisce il markup. By role parte chiuso,
  By project e By owner aperti. In By project solo la riga progetto è comprimibile: task, ruolo e owner sono figli
  piatti dello stesso gruppo (718, 749, 770).
- **Livelli:** By project = Project → Task → Role → Owner; By owner = Owner → Project → Task; By role = Role →
  (project · task). Il placeholder owner è la chiave `'—'` (`api/src/lib/planning-model.js:11`), reso "TBD".
- **Carichi:** soglie inline `h > 30` → `--color-danger-bg`, `h > 24` → `--color-warning-bg` sulle righe ruolo padre
  di By role (479) e sulle righe ruolo di By project (710), celle future non-pulse. `h` è la somma del periodo: in
  Monthly le soglie settimanali si confrontano con un totale mensile. By owner non ha colori di carico.
- **Monthly pulse:** "~" + ore, corsivo, violet; nessun "<1h" (può uscire "~0h"); i valori non-pulse < 1h con Rounded
  mostrano due decimali in grigio (485, 712, 910).
- **Finestra iniziale:** mese corrente → +3 mesi (`initWindowIfNeeded`, 1117-1121) poi `clampWindow`. Asse da
  `getPpAxis()`. Le settimane di Weekly partono dal lunedì ≤ `windowStart` e corrono fino a `windowEnd`
  (`getCalendarWeeks`); `workingDaysInWeek` (`js/lib/planning-calc.js:46`) esiste.
- **Export XLS** legge gli `exportRows`/`periodMeta` restituiti dai tre computed di vista (1180-1191), non il DOM;
  i colori ARGB di `buildStyledExcelExport` sono suoi.
- **Team assistant:** `#teamAssistantPanel`, pannello fisso a destra, `width: min(940px, 100vw)`, senza backdrop,
  header navy con "🤖" e `btn-close-white`; CSS in `css/style.css:467-486`; renderizzato solo se `isAdminUser`.
- **Page head:** `.ph` con titolo `planningTitle` e `.ph-sub` fisso; le tre azioni (Team assistant, Load XLS, Export
  XLS) sono in `.ph-toolbar.pl-toolbar > .pl-toolbar-right` (122-126). `content-surface-guard.test.js:238-271` pinna
  esattamente quei 3 `.ph-btn` in `.pl-toolbar-right`.
- **CSS:** la pagina carica Bootstrap, `tokens.css?v=12`, `style.css?v=28`; nessun `<style>` inline,
  `css/planning.css` non esiste; le regole della pagina stanno in `style.css` (`.gantt-table` 350-358, `.pp-tooltip`
  373-382, `#ppResourceTable`/`pp-fullwidth` 462-465, `.ta-*` 467-486, `.pl-toolbar*` 491-493) e nessun'altra pagina
  le usa. `controls.css` e `js/cg-controls.js` non sono caricati.
- **Riusabili:** `<cg-date-picker>` (`js/cg-controls.js`) ha `mode="month"`, `min`/`max`, valore `YYYYMM`;
  `pipelineBadge`/`statusBadge`/`headerBadge` (`js/core.js`) restituiscono HTML; filtri a popover Bootstrap
  `.dropdown` + `data-bs-auto-close="outside"` in `portfolio.html:47-82`; ricerca `.pf-search` in
  `portfolio.html:42-46`; nessun helper condiviso per le iniziali.
- **Breakpoint:** 1024px (sidebar ↔ navbar, `style.css:23/27`, `js/nav.js`) e 767.98px (`style.css:115`).

## 3. Architettura: righe pure + template Vue

### 3.1 `js/lib/planning-rows.js` (nuovo, ES module + bridge `window.*`)

Funzioni pure, testate con vitest, senza DOM:

- `buildRoleRows(adapted, periods, opts)`, `buildProjectRows(adapted, periods, opts)`,
  `buildOwnerRows(adapted, periods, opts)` → `{ rows, total }`.
- Ogni riga: `{ id, parentId, depth, kind, label, sub, stage, status, owners, inactive, sold, actuals, toPlan,
  cells }` dove `kind` ∈ `role | project | task | roleLeaf | person | tbd | pair` e `cells[i] = { h, past, current,
  pulse, load }` con `load` ∈ `null | 'high' | 'over'`. `owners` = `[{ name, initials, inactive }]`.
- `total = { count, sold, actuals, toPlan, cells }` — `count` = numero di assegnazioni (righe foglia).
- `formatCell(h, { pulse, round })` → testo della cella (§5.5).
- `loadLevel(h, workingWeeks)` → `null | 'high' | 'over'` (§5.5).
- `initials(name)` → due lettere maiuscole.
- `filterRows(rows, query)` → `{ visibleIds, forcedOpenIds }`: una riga resta se la sua etichetta (o `sub`) contiene
  la query, case-insensitive; i suoi antenati restano visibili e sono forzati aperti; i discendenti di una riga che
  corrisponde restano visibili. Query vuota → tutto visibile, niente forzato.
- `visibleRows(rows, openIds, filter)` → la lista piatta da renderizzare (una riga si vede se tutti i suoi antenati
  sono aperti o forzati aperti, e se il filtro la tiene).

I dati di partenza sono gli stessi che i computed di vista usano oggi (`adaptRoleModel` & c. più i periodi): le
funzioni spostano in `js/lib/` la logica di raggruppamento oggi scritta dentro le stringhe HTML, senza cambiare
nessun numero.

### 3.2 In `planning.html`

- I tre computed di vista restano e continuano a restituire `exportRows`/`periodMeta` per l'export, **invariati**.
  Smettono di produrre HTML e restituiscono anche `{ rows, total, periods }` da `planning-rows.js`.
- Nuovi dati: `openIds` (un Set reattivo per vista), `search` (una stringa per vista), `periodMenuOpen`,
  `legendOpen`, `filtersPanelOpen`.
- Default di `openIds` al primo render di una vista: By role tutto chiuso; By project progetti aperti, task chiusi;
  By owner persone e progetti aperti. Lo stato sopravvive a re-fetch, cambio filtri e cambio intervallo, e si
  conserva per vista.
- La griglia è un `<table>` nel template (`v-for` su `visibleRows`); spariscono `activeViewHtml`, il `v-html` della
  griglia e la parte toggle di `initTooltipsAndToggles()`. I tooltip delle celle diventano `title` nativi.
- `modelPlaceholderHtml()` resta (stati loading/errore, §8), restyled con classi.

## 4. File

| File | Cosa cambia |
|---|---|
| `planning.html` | head, toolbar, popover, selettore periodo, ricerca, legenda, griglia a template, pannello Filtri tablet, drawer Team assistant |
| `js/lib/planning-rows.js` + `.test.js` | nuovi (§3.1) |
| `css/planning.css` | nuovo, `?v=1`, solo token; riceve le regole della pagina oggi in `style.css` (`.gantt-table`, `.pp-tooltip`, `#ppResourceTable`, `.pp-fullwidth`, `.ta-*`, `.pl-toolbar*`) più le nuove `.pl-*` |
| `css/style.css` | rimozione di quelle regole; bump `?v=` su **ogni** pagina che lo carica |
| `css/controls.css`, `js/cg-controls.js` | caricati da `planning.html` con lo stesso `?v=` delle altre pagine |
| `js/lib/icons.js` | icone mancanti fra chevron, search, info, filter, close, calendar |
| `js/lib/content-surface-guard.test.js` | pin dei pulsanti spostato da `.pl-toolbar-right` a `.ph-actions` |
| docs (§11) | |

## 5. Layout — mappa tavola → sezione

| Tavola | Sezione |
|---|---|
| 9.8a | §5.1 head, §5.2 toolbar, §5.4 legenda e griglia, §5.8 By owner (cornice) |
| 9.8b | §5.7 By project |
| 9.8c | §5.8 By owner, §5.5 carichi |
| 9.8d | §5.2 popover Projects, §5.3 etichetta Weekly, §5.4 header Weekly |
| 9.8e | §5.4 popover "How estimates work" |
| 9.9a, 9.9b (tablet) | §5.6 By role, §6 tablet |
| 9.9a, 9.9b (smartphone) | **ciclo 2** |

### 5.1 Page head (9.8a)

- `.ph-title` = `planningTitle` (non "Resource Planning").
- `.ph-sub` = "Hours by role, project or owner · {n} of {m} projects · {h}h to plan": `m` = `eligibleProjects`
  dopo il filtro Pipeline, `n` = progetti selezionati fra questi (`filteredProjects`), `h` = `total.toPlan` della
  vista attiva formattato come le celle. Mentre il modello è pending o in errore la parte `· {h}h to plan` si omette.
- `.ph-actions`: Team assistant (solo `isAdminUser`, icona team), Load XLS (upload), Export XLS (download), `.ph-btn`
  con `<ph-icon>`, stessi handler. Export disabilitato con `modelPending || modelError`.

### 5.2 Toolbar card (9.8a, 9.8d)

**Riga 1:** segmented By role / By project / By owner (`view`); segmented Monthly / Weekly (`interval`); selettore di
periodo (§5.3); a destra campo di ricerca con icona, placeholder per vista: "Search role…", "Search project or
task…", "Search person…".

**Riga 2:** etichetta "Pipeline" + un chip per stage (`allPipelines`): attivo = pallino + testo nei colori
`--pipeline-{stage}-bg/color`, inattivo = contorno neutro; clic = `togglePipelineFilter`. Separatore. Pulsanti
"Projects: All ({m})" / "Projects: {n}" e "Team: All" / "Team: {n}". A destra gli switch "Monthly pulse" e "Rounded"
(stile switch del sito). Nessun Compact. Spariscono i pulsanti "✕ Projects" / "✕ Team".

**Popover Projects (9.8d):** dropdown Bootstrap `data-bs-auto-close="outside"`; campo "Search project or client…"
(filtra la lista, locale al popover); una riga per `eligibleProjects`: checkbox, nome, cliente sotto, pill di stage a
destra; lista con scroll proprio; footer "{x} of {m} selected" + "Select all" (`selectAllProjects`) + "Clear"
(`resetProjectFilters`). Logica invariata (`isProjectChecked`, `onProjectFilterToggle`).

**Popover Team:** stesso schema senza riga cliente e senza pill; "Select all" (`selectAllTeams`), "Clear"
(`resetTeamFilters`).

### 5.3 Selettore di periodo (non disegnato)

`‹ [label ▾] ›` + pulsante testo "Today".

- **‹ / ›** spostano `windowStart` e `windowEnd` di un mese mantenendo la larghezza, anche in Weekly; disabilitati
  con `atLeftLimit` / `atRightLimit`; se lo spostamento supererebbe un limite, si applica `clampWindow` senza
  restringere. `title`: "Previous month" / "Next month".
- **Label:** Monthly = `windowLabel`; Weekly = inizio della prima e dell'ultima settimana di `weeks`
  ("Sep 28 – Nov 8, 2026": anno una volta sola se uguale, altrimenti su entrambe le date), formattato con
  `js/lib/dates.js`.
- **Menu** (popover sotto la label): preset "3 months", "6 months", "12 months" (inizio = mese corrente − 1, fine =
  inizio + N − 1 mesi, poi `clampWindow`) e "Whole range" (`getPpAxis()` start → end); due `<cg-date-picker
  mode="month">` "From" e "To" con `min`/`max` dall'asse e "To" ≥ "From"; si applica al cambio; si chiude su clic
  esterno o Esc, restituendo il focus alla label. `expandLeft`/`shrinkLeft`/`expandRight`/`shrinkRight` si rimuovono
  se restano senza chiamanti.
- **Today:** ripristina la finestra di `initWindowIfNeeded` (mese corrente → +3) estraendo quel calcolo in un metodo
  riusato da entrambi; disabilitato quando la finestra coincide già.
- Finestra non persistita; finestra invertita/mancante = stato vuoto attuale.

### 5.4 Legenda e griglia (tutte le 9.8)

**Legenda** (sostituisce il paragrafo "Estimation logic" sempre aperto): chip d'esempio "Actuals (past)", "Current
month" / "Current week", "Monthly pulse", "High load", "Over-allocated" (gli ultimi due solo in By owner), poi
"How estimates work" con icona info; a destra "Expand all" / "Collapse all" come link testuali (agiscono su
`openIds` della vista: tutte le righe con figli aperte / tutte chiuse).

**Popover "How estimates work" (9.8e):** titolo "Estimation logic · {By role|By project|By owner}", corpo = il testo
esplicativo attuale della vista, spezzato in paragrafi brevi; chiusura su clic esterno o Esc.

**Griglia:**
- Colonne: etichetta (~340px), Sold, Actuals, To plan (grassetto), poi una colonna per periodo. Etichetta e tre
  numeri sticky a sinistra; header sticky in alto; riga Total sticky in basso; scroll orizzontale solo sui periodi
  (contenitore della griglia con `overflow: auto` e altezza limitata al viewport, mai su `#app-shell`/`#app-main`).
- Header periodi: Monthly "SEP 2026" con sotto "actuals" (passati) o "current" (corrente: testo e bordo inferiore
  `--indigo-*`); Weekly "OCT 12" con sotto "W42" (numero ISO di settimana).
- Celle: passati su grigio chiaro; corrente con tinta molto leggera (nessuna colonna blu piena); pulse lavanda
  corsivo; carichi §5.5. Celle vuote vuote; "—" per Actuals zero nelle colonne numeriche.
- Righe padre grigio chiaro + grassetto + chevron SVG (› chiuso, ⌄ aperto); figlie bianche, indentate per `depth`;
  seconda riga dell'etichetta muted e piccola, troncata con ellissi.
- Riga Total: "TOTAL · {count} ASSIGNMENTS".

### 5.5 Testo delle celle e carichi

- `formatCell`: pulse con h < 0,5 → "<1h"; pulse → "~" + ore; non-pulse con Rounded e 0 < h < 1 → "<1h"; Rounded
  → ore intere; Rounded spento → decimali come oggi; h = 0 o assente → cella vuota.
- `loadLevel(h, workingWeeks)`: tasso = h / `workingWeeks`; ≥ 30 → `'over'`, ≥ 24 → `'high'`. Weekly:
  `workingWeeks` = giorni lavorativi della settimana / 5. Monthly: giorni lavorativi (lun-ven) del mese / 5. Solo
  periodi correnti o futuri, solo celle non-pulse, **solo righe `person` di By owner**. Le righe ruolo di By role e
  By project perdono i colori di carico.

### 5.6 By role (9.9a/9.9b tablet)

- Padre = ruolo ("HWGACCSVS · Director"); su desktop i numeri sono nelle colonne, su tablet la seconda riga è
  "Sold {h} · Actuals {h}". Chiuso di default.
- Figli = coppie (progetto, task): nome progetto + pill di stage (desktop), seconda riga "task · owner" ("No owner
  yet" senza owner).
- Nessun colore di carico.

### 5.7 By project (9.8b, 9.8e)

- Tre livelli **comprimibili** Project → Task → Role. Progetto: nome, pill stage, pill status, seconda riga
  "client · start – end". Task: nome, seconda riga "{n} roles". Ruolo: avatar con iniziali dell'owner + "role",
  seconda riga = nome owner; più owner = avatar impilati e nomi separati da virgola; nessun owner = avatar "?" e
  "No owner yet". Il livello Owner sparisce; le ore del ruolo sono la somma dei suoi owner (già oggi).
- Owner inattivo: pill "inactive" accanto al nome (al posto di `inactiveBadgeSuffix`).

### 5.8 By owner (9.8c, 9.8d)

- "Unassigned (TBD)" (chiave `'—'`) sempre primo: avatar "?" ambra, pill "Needs owner", seconda riga "No owner
  found in actuals, or every owner is inactive". Le altre persone in ordine alfabetico.
- Persona: avatar con iniziali, nome, seconda riga "{n} projects · {ruoli}". Figli: progetto (pill stage e status,
  cliente) → task (seconda riga "team · role").
- Colori di carico sulle celle persona (§5.5).

## 6. Tablet (sotto 1024px; fino a 768px è il layout finale, sotto è provvisorio fino al ciclo 2)

- Page head: titolo, sottotitolo; Team assistant ed Export come `.ph-btn` solo icona (con `aria-label`); Load XLS
  passa nel pannello Filtri.
- Toolbar su una riga: segmented vista e intervallo, selettore periodo (frecce + label; "Today" entra nel menu),
  pulsante "Filters {n}". La ricerca passa nel pannello Filtri.
- Pannello Filtri: offcanvas Bootstrap a destra (`offcanvas-end`), con ricerca, chip Pipeline, Projects, Team,
  Monthly pulse, Rounded, Load XLS. Badge `{n}` = numero di filtri attivi diversi dal default (pipeline, progetti
  selezionati, team selezionati, pulse spento, Rounded spento, ricerca non vuota).
- Griglia: sticky solo etichetta e To plan; Sold e Actuals nella seconda riga dell'etichetta. Legenda ridotta a
  "How estimates work" + Expand/Collapse.

## 7. Team assistant (non disegnato)

- Drawer a destra, altezza piena, `width: min(940px, 100vw)`, entra da destra sopra la pagina con l'ombra del sito
  e un backdrop chiaro; la pagina resta montata. Chiusura: icona ×, Esc, clic sul backdrop. All'apertura il focus va
  nel pannello (select progetto); alla chiusura torna al pulsante Team assistant.
- Header bianco con bordo inferiore, titolo "Team assistant" con icona team, nessuna emoji, × a destra.
- Setup: select "Select a project…" (`taProjectOptions`), "Calculate team" primario, "New chat" secondario; testo
  vuoto invariato; starter come chip sotto la select solo a chat vuota (clic riempie l'input).
- Chat: bolle utente a destra (navy), assistente a sinistra (superficie neutra), max-height come oggi con scroll
  proprio, auto-scroll all'ultimo messaggio; busy = bolla con indicatore + controlli disabilitati.
- Composer: textarea (placeholder invariato) + "Send" primario; Enter invia, Shift+Enter a capo
  (`shouldSendOnEnter`); "…" diventa spinner dentro il pulsante.
- Risultati: sezioni "Best team", "Alternative team", "Available team", un sotto-blocco per ruolo, tabelle con lo
  stile tabellare del sito e le colonne attuali (Tags come pill); scroll orizzontale nella sezione; "Nobody." /
  `section.note` muted; `taError` come alert warning del sito.
- Tutta la logica (`taProjectId`, `taRank`, `taSend`, `taNewChat`, `taStarters`, `shouldSendOnEnter`,
  `selectionStillValid`, `renderChatText`, `tableTitle`, `rowView`, `taError`) invariata.

## 8. Stati

- Modello pending: griglia sostituita dal placeholder di caricamento nella stessa card; errore: placeholder di
  errore con lo stesso messaggio di oggi. Comportamento invariato (stale guard `modelSeq`).
- Nessun progetto selezionato / finestra invalida: stato vuoto attuale, restyled.
- Ricerca senza risultati: riga unica "No rows match “{query}”." nella griglia; Total invariato.

## 9. CSS, icone, cache-busting

- `css/planning.css?v=1`, caricato dopo `style.css`/`controls.css`; solo `var(--token)`, nessun hex; prefisso `.pl-`.
  Nessuna emoji né `style=""` di colore nel markup generato.
- Ogni file versionato toccato riceve il bump di **ogni** suo `?v=` nel repo.
- Le colonne sticky usano `position: sticky` dentro il contenitore della griglia; nessuna proprietà vietata su
  `#app-shell`/`#app-main`.

## 10. Test

- `js/lib/planning-rows.test.js`: righe e livelli per le tre viste su modelli adattati d'esempio; TBD primo in By
  owner; tre livelli e owner multipli in By project; `formatCell` (pulse < 0,5, pulse, < 1 con/senza Rounded, zero);
  `loadLevel` (soglie esatte 24/30, Monthly normalizzato sulle settimane lavorative, passati e pulse esclusi);
  `filterRows` (antenati visibili e forzati aperti, discendenti visibili, case-insensitive, query vuota);
  `visibleRows`; totali uguali a quelli degli `exportRows` degli stessi dati.
- Guard aggiornati e verdi: `content-surface-guard.test.js` (pulsanti in `.ph-actions`, nessuna emoji nella pagina),
  `page-head-guard`, `nav-shell-guard`, `foundations-guard` (`?v=`).
- Restano verdi `planning-calc`, `planning-model-ui`, `team-assistant-ui`.
- `TEST_CASES.md`: casi per frecce/menu/Today e limiti, ricerca per vista, popover Projects/Team, Expand/Collapse,
  legenda, carichi By owner, Team assistant apri/chiudi/Esc/focus, pannello Filtri tablet.
- Verifica visiva con `scripts/shoot.mjs` contro lo stack di `scripts/test-branch.sh` (`--base
  http://localhost:8081`, `--settle 3000`) a 1440 e 1024: le tre viste in Monthly, By owner in Weekly con popover
  Projects aperto, popover "How estimates work", menu periodo aperto, drawer Team assistant aperto, pannello Filtri a
  1024. I PNG si rileggono e si confrontano con le tavole; gli scostamenti si presentano uno per uno (PROCESS.md
  §6.6.5).

## 11. Documentazione

- `docs/pages/planning.md`: toolbar, selettore periodo, ricerca, legenda/popover, righe pure e classi, tablet,
  drawer, carichi solo su By owner, tre livelli By project, "<1h".
- `CLAUDE.md` (riga di `planning.html` nella tabella Pages: stylesheet `css/planning.css`; blocco `css/` della File
  structure), `docs/css/stylesheets.md` (`planning.css`, regole tolte da `style.css`), `docs/js/lib.md`
  (`planning-rows.js`).

## 12. Fuori scope

- Smartphone < 768px (ciclo 2).
- API del modello di planning, calcoli, cache, regole di distribuzione, formati e colori dell'XLS (import ed export).
- Backend e prompt del Team assistant.
- Modifica dei dati di planning (la pagina resta di sola lettura).
- Persistenza di finestra, ricerca o stato di espansione.

## Criteri di accettazione

1. **Nessun residuo visivo vecchio** — `planning.html` e il markup che genera non contengono emoji né colori hex;
   `css/planning.css` non contiene hex (test).
2. **Righe pure** — `planning-rows.test.js` verde, con totali uguali a quelli degli `exportRows` per le tre viste.
3. **Export invariato** — l'XLS esportato dalle tre viste ha stesse righe, valori e colori di prima.
4. **Page head** — titolo `planningTitle`, sottotitolo con n di m progetti e ore da pianificare, tre azioni in
   `.ph-actions` (Team assistant solo admin), Export disabilitato con modello pending/in errore.
5. **Toolbar** — chip di stage, popover Projects con ricerca/Select all/Clear e conteggio, popover Team, switch
   pulse/Rounded, nessun Compact, nessun pulsante "✕".
6. **Selettore periodo** — ‹ › spostano di un mese e si disabilitano ai limiti dell'asse; preset, From/To e Whole
   range funzionano; Today torna a mese corrente +3 ed è disabilitato quando la finestra coincide; label Weekly con
   le date delle settimane.
7. **Ricerca** — filtra le righe della vista attiva tenendo visibili e aperti i padri; non cambia Total, richiesta né
   export.
8. **Espansione** — By project ha tre livelli comprimibili; Expand all / Collapse all funzionano nelle tre viste;
   lo stato sopravvive a un cambio filtro.
9. **By owner** — "Unassigned (TBD)" in testa con "Needs owner"; colori high/over sulle celle persona secondo
   §5.5; nessun colore di carico nelle altre viste.
10. **Griglia** — header, colonne a sinistra e Total restano visibili scorrendo; corrente e passati distinti; pulse
    "~Nh" / "<1h".
11. **Legenda** — "How estimates work" apre il testo della vista attiva e si chiude con Esc o clic esterno.
12. **Tablet 1024** — toolbar su una riga con "Filters {n}", pannello Filtri con Load XLS, sticky solo etichetta e To
    plan.
13. **Team assistant** — drawer con backdrop, chiusura con ×/Esc/backdrop, focus restituito, nessuna emoji; calcolo
    team e chat funzionano come prima.
14. **Test e guard** — `npm test` verde.
15. **Confronto con le tavole** — screenshot a 1440 e 1024 confrontati con 9.8a–e e con la parte tablet di
    9.9a/9.9b, scostamenti decisi uno per uno.

## Decisioni aperte

1. **Righe pure in `js/lib/planning-rows.js` + template Vue.** Alternativa scartata: ripulire le stringhe `v-html`
   tenendo lo stato di espansione nel DOM, o un componente per vista. Perché: ricerca, tre livelli e card mobile
   (ciclo 2) richiedono stato reattivo e una sola forma di riga.
2. **Due cicli, smartphone nel secondo.** Alternativa scartata: un solo ciclo per tutto l'handoff. Perché: la
   riscrittura dei tre renderer è già un ciclo grande; le card mobile riusano le righe del ciclo 1.
3. **Carichi solo sulle persone di By owner, normalizzati per settimana lavorativa.** Alternativa scartata:
   mantenere i colori attuali sulle righe ruolo con la somma del periodo. Perché: il carico è di una persona, e in
   Monthly il confronto attuale con soglie settimanali è sbagliato.
4. **By project a tre livelli, owner come avatar sul ruolo.** Alternativa scartata: mantenere il livello Owner.
   Perché: tavole 9.8b/9.8e; il dettaglio per owner resta in By owner.
5. **"<1h" per pulse < 0,5h e per valori non-pulse < 1h con Rounded.** Alternativa scartata: "~0h" e "0.45h" di
   oggi. Perché: tavole e handoff §4; con Rounded spento i decimali restano.
6. **Ricerca solo client-side.** Alternativa scartata: inviarla nel `modelRequest`. Perché: handoff §10.1, non
   cambia totali, richiesta né export.
7. **Preset 3/6/12 mesi dal mese scorso + Whole range; Today = finestra iniziale.** Alternativa scartata: preset
   dal mese corrente. Perché: handoff §10.3, l'ultimo mese di actuals resta visibile.
8. **Load XLS su tablet dentro il pannello Filtri.** Alternativa scartata: icona nel head. Perché: handoff §10.4.
9. **Team assistant in overlay con backdrop.** Alternativa scartata: pannello che spinge la griglia. Perché:
   handoff §10.5.
10. **Handoff, tavole, Spec e Piano committati sul branch `planning-redesign`.** Alternativa scartata: commit su
    `main` prima del worktree (PROCESS.md §6.1b/§6.5). Perché: questa sessione non può scrivere nel checkout di
    `main`; deroga §3 da annotare nel report del ciclo.
