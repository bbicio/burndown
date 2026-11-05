# Timesheets — Actuals e Profile processing (redesign) — design spec

**Date:** 2026-11-05
**Brief started:** unknown
**Brief:** `docs/superpowers/design/timesheets/redesign/2026-11-05-brief-timesheets-claude-code.md`
**Scenario:** 2 (evoluzione)

Redesign del contenuto di `timesheets.html` (Actuals) e `profile-jobs.html` (Profile processing), direzione B delle
tavole, con le due pagine collegate da una sub-nav in stile Master Data al posto del bottone "Profile processing →".
Il brief è normativo; il brief sorgente `docs/superpowers/design/timesheets/2026-11-05-brief-timesheets-profile-jobs.md`
lo è per regole e dati; le regole attuali dell'app vincono sulle tavole (brief §2). Nessuna modifica API.

## 1. Obiettivo

- Header condiviso "Timesheets" e sub-nav TIMESHEETS (Actuals / Profile processing) con badge della coda.
- Actuals: lista raggruppata per client, View + Download sulla riga, Delete actuals nel menu "⋯" via `showConfirm()`,
  modal View restilizzato, stati vuoti, copy "Load Actuals".
- Profile processing: alert, status strip, drawer Settings, tabella a colonne fuse con banda d'errore, Run history
  come seconda vista della card.
- Tablet e smartphone come 11.3. Niente emoji, niente dialoghi nativi, niente hex nelle due pagine.

## 2. Fatti verificati nel codice (a `d38f49b`)

- Il drawer "condiviso" del Master Data non esiste: `master-roles.html` ha `.mdr-drawer`, `master-pipelines.html`
  `.mdp-drawer`, entrambi locali alla pagina.
- `js/lib/md-subnav.js` ha le sezioni cablate (`MD_SECTIONS`), `aria-label="Master Data section"` cablato sul
  `<select>` e nessun badge; è caricato da `master-clients/pipelines/roles/currencies.html` a `?v=4`.
- `js/lib/icons.js` (`?v=6`, 18 pagine) non ha `folder`, `sliders`, `sparkle`, `warning`; ha `eye`, `download`,
  `more`, `trash`, `search`, `info`, `refresh`, `chevronDown`, `close`, `check`, `reset`.
- `GET /api/profile-jobs` non restituisce un timestamp per `last_error` (`api/src/routes/profile-jobs.js`): la banda
  d'errore mostra solo "Last run failed" e il testo (brief §7.9).
- `timesheets.html` non contiene `#confirmModal` e `js/nav.js` non lo inietta: va aggiunto come in `profile-jobs.html`.
- `timesheets.html` usa `confirm()` nativo in `deleteCode()` ed emoji in bottoni e stato vuoto; il suo `<style>`
  contiene hex.
- In `profile-jobs.html` lo stato aperto della banda d'errore è già indicizzato per codice (`expanded[code]`), le righe
  sono sostituite a ogni refresh; `busyAction`, `refreshSeq`, `keepForm` implementano le regole del brief §11.
- `sortJobProjects(list, 'lastProcessed')` mette già i mai processati in fondo; `describeNextRun` restituisce la data
  completa, `'Paused'` o la frase del prossimo tick.
- Il progetto non ha harness Vue a runtime: `package.json` ha solo `vitest` e `jsdom`.
- Le JPG delle tavole stanno in `docs/superpowers/design/timesheets/redesign/`, non in `docs/captures/timesheets/` come
  dice il brief §1; gli stati 11.1e, 11.2g, 11.2h esistono solo nei `.dc.html`.
- Il ciclo `master-data-currencies` è in un worktree non mergiato e modifica `master-currencies.html`: il worktree di
  questo ciclo si crea dopo il suo merge (PROCESS.md §1, nota handoff).

## 3. Mappa tavola → sezione

| Tavola | Sezione |
|---|---|
| 11.1a | §4, §5 |
| 11.1c | §6 |
| 11.1d | §5 (menu ⋯) |
| 11.1e / 11.1f | §5 (stati) |
| 11.2a | §7, §8 |
| 11.2b | §7 (drawer) |
| 11.2c | §8 (banda d'errore) |
| 11.2d | §7 (alert) |
| 11.2e | §9 |
| 11.2g / 11.2h | §8 (stati) |
| 11.3 | §10 |
| 11.1b / 11.2f (opzioni A) | fuori scope |

Sorgente delle misure: i `.dc.html` (`Timesheets.dc.html`, `ProfileProcessing.dc.html`, `TimesheetsResponsive.dc.html`);
le JPG servono a vedere gli stati.

## 4. Architettura e shell

**Sub-nav generalizzata.** `js/lib/md-subnav.js` passa da un elenco unico a un registro di insiemi:
- `SUBNAV_SETS = { masterData: { label: 'Master Data', sections: MD_SECTIONS }, timesheets: { label: 'Timesheets', sections: [{ group: 'TIMESHEETS', items: [actuals → /timesheets.html, profileJobs → /profile-jobs.html] }] } }`.
- Il `<nav class="md-subnav">` sceglie l'insieme con `data-subnav-set` (assente = `masterData`, così le quattro pagine
  Master Data non cambiano markup); l'`aria-label` del `<select>` diventa "<label> section".
- `setSubnavBadge(id, count, title)`: inserisce/aggiorna nella voce `id` (lista e riga del selettore phone) una
  pillola gialla (`.md-subnav-badge`, token warning) con `count` e `title`; con `count` ≤ 0 o non numerico la rimuove.
  Sul selettore phone il testo è "N queued".
- `MD_SECTIONS`, `mdSubnavHtml`, `mountMdSubnav` restano esportati con la stessa firma (`mdSubnavHtml(activeId, setId?)`).
- Nessun conteggio su "Actuals" (decisione Master Data fase 1).

**Shell delle due pagine.** `.ph` + `<div class="md-layout"><nav class="md-subnav" data-subnav-set="timesheets"
data-md-active="…"></nav><div class="md-content">…root Vue…</div></div>` statici, fuori dal root Vue (com'è nel Master
Data). `.ph`: titolo "Timesheets", sottotitolo "Uploaded actuals and the experience profiles built from them.", nessun
bottone. Breadcrumb e voce attiva della sidebar invariati.

**Badge.** `timesheets.html` lo imposta una volta dopo il load (`loadProfileQueueCount`, errore ignorato = nascosto);
`profile-jobs.html` a ogni `refresh()` riuscito con `queuedCount`; su refresh fallito lo nasconde.

**Logica pura nuova/estesa.**
- `js/lib/timesheets-list.js` (nuovo, bridge `window.*`): `filterTimesheetRows(rows, filters)`,
  `groupTimesheetRows(rows, { sortBy, sortDir })` → `[{ client, label, rows, codes, totalRows }]`,
  `nextSortState(sortBy, sortDir, field)` (3 stati), `hasActiveFilters(filters)`.
- `js/lib/profile-jobs-ui.js`: aggiunge `describeNextRunShort(schedule, project)` ("Next HH:mm" / "Next paused" /
  "Next within 60 s" / `''` per i non in coda), `settingsState(form, saved)` → `{ dirty, valid, canSave }`.

**Icone.** `js/lib/icons.js` aggiunge `folder`, `sliders`, `sparkle`, `warning`, nello stesso stile 16×16 stroke
`currentColor`; ogni riferimento `?v=` a `icons.js` sale allo stesso nuovo valore. Lo stesso per `md-subnav.js` e
`style.css` (regola cache-busting di `CLAUDE.md`).

## 5. Actuals — `timesheets.html` (11.1a, 11.1d–f)

Una `.md-card` a destra della sub-nav:
- **Filtri** (riga che va a capo): Client ▾ / Project ▾ (dropdown multi-select a checkbox attuali, etichetta
  "Client (2)"), campo "Filter by project code…", select anno (valore iniziale attuale, "All years"), "Reset filters"
  (icona `reset` + testo, solo con un filtro attivo; porta l'anno a "All years").
- **Nota info** (box grigio, icona `info`): testo del brief §5 con **Load Actuals**.
- **Lista raggruppata:** header 10px uppercase Client / Project | Project code | Uploads | Rows | Last uploaded |
  azioni; "Client" e "Project" sono target di sort separati, Project code ordinabile, 3 stati ▲/▼/nessuno.
  - Header di gruppo 40px grigio: chevron, client in grassetto, meta muted "N codes · M rows" (M = somma Rows dei
    codici filtrati del gruppo). Click = collassa/espande; tutti espansi all'apertura; stato non persistito.
  - Ordine gruppi alfabetico; sort Client inverte i gruppi; sort Project/Code ordina dentro i gruppi; senza sort,
    ordine del server. Codici senza client → ultimo gruppo "No client".
  - Righe indentate 40px: progetto 13px semibold (va a capo), codice monospace in chip grigio, Uploads muted a destra,
    Rows grassetto a destra con separatore migliaia, Last uploaded come oggi.
  - Azioni: **View** (outline, icona `eye` + label); **Download** (solo icona `download`, tooltip "Download actuals
    (.xlsx)"; durante la generazione lo spinner prende il posto dell'icona, il bottone è disabilitato e mantiene la
    larghezza); **"⋯"** (dropdown Bootstrap, chiusura con click esterno ed Esc) con una voce **Delete actuals** (icona
    `trash` rossa, label rossa, riga muted "Removes M rows and re-queues the code for profile processing. Cannot be
    undone.").
  - Delete → `showConfirm()` con il testo attuale (`Delete ALL timesheet data for project "CODE"?` …) e bottone di
    conferma distruttivo; durante la cancellazione spinner sul "⋯" della riga; successo = reload come oggi; errore nel
    banner rosso.
- **Stati:** loading con spinner centrato; errore nel banner rosso sopra la card; vuoto (11.1e) con icona `folder`,
  "No timesheets uploaded yet." e "Use **Load Actuals** in the Portfolio view to import a timesheet export for a
  project." (filtri e nota restano); nessun risultato (11.1f) con icona `search`, "No timesheets match the current
  filters." e link "Reset filters".
- Nessuna paginazione, nessuno scroll interno. Il `<style>` della pagina usa solo token.

## 6. View modal (11.1c)

Il modal attuale, con il nuovo stile; colonne, ordine (data crescente), dati e comportamento invariati.
- Testa: codice in chip monospace, "N rows" muted, ✕; chiusura con ✕, click sullo scrim (navy, token) ed Esc.
- Tabella: header sticky grigio 10px uppercase, righe da 34px; Date · Owner · Role (ellipsis + tooltip) · Task ·
  Hours (grassetto, destra) · Notes (una riga, ellipsis + tooltip) · Fee (destra) · Spent (grassetto, destra); Fee e
  Spent con `formatMoney` nella valuta del progetto.
- Spinner ed errore invariati. Su phone `modal-fullscreen-md-down`.

## 7. Profile processing — alert, strip, drawer (11.2a, 11.2b, 11.2d)

- **Alert** sopra il testo guida, con icona per tipo e stili token: rosso (`loadError`, non chiudibile, sparisce a un
  refresh riuscito), ambra (`actionError`, ✕), verde (`actionInfo`, ✕). Messaggi e logica attuali.
- **Testo guida** 12px muted, invariato.
- **Status strip** (card bianca, una riga che va a capo solo su schermi stretti; gruppo azioni sempre unito a destra):
  - stato worker: punto verde + "Scheduled · every N min" / punto grigio + "Scheduled processing paused";
  - **Next run** (etichetta 10px uppercase): valore di `describeNextRun(schedule)`, poi "· last HH:mm" muted quando c'è
    un'ultima run schedulata, tooltip con la data completa;
  - topic extraction (icona `sparkle`): "Topic extraction on/off", con "(no API key configured)" ambra se attiva e
    senza chiave; tooltip "When off, project descriptions are never sent to the AI service";
  - azioni nowrap: **Settings** (outline, icona `sliders`, apre il drawer), **Recalculate now** (`.btn-primary`
    magenta, nessuna conferma), **Rebuild all** (outline con testo e bordo rossi, `showConfirm()` con il testo attuale).
- **Drawer Settings** (locale, modellato su `.mdp-drawer`): 440px, scrim navy, chiusura con scrim, ✕, Close ed Esc,
  focus trap; eyebrow "Profile processing", titolo "Settings".
  - Schedule: switch `md-switch` "Scheduled processing on/off"; "Interval (minutes)" con la validazione e il messaggio
    attuali (campo rosso); helper sul riavvio della stima, granularità al minuto, run manuali.
  - Topic extraction: switch, helper del brief §8, salvataggio immediato come oggi, avviso "(no API key configured)".
  - Nota "**Recalculate now** … **Rebuild all** …".
  - Footer: Close (testo); **Save schedule** (primary) abilitato solo con `settingsState().canSave`, spinner durante il
    salvataggio, successo = alert verde "Saved — applies on the next tick (within 60 s)." e il drawer resta aperto.
  - Chiudere il drawer con modifiche non salvate le scarta in silenzio (il form torna ai valori salvati).
  - Il refresh non sovrascrive toggle/intervallo mentre sono modificati (`keepForm`); con un'azione in corso i
    controlli del drawer sono disabilitati.

## 8. Profile processing — tabella project codes (11.2a, 11.2c, 11.2g–h)

Card bianca con toolbar e tabella.
- **Toolbar:** switch di vista (§9); ricerca "Search code or project…" (220px, regole attuali); select stato (All
  statuses / Queued / Error / Updated; "Not processed" solo con All); a destra "X of Y project codes" con punto verde e
  tooltip "Refreshes every 15 s".
- **Tabella:** scroll interno max 60vh, header sticky. Colonne:
  - **Project · Code**: nome (13px semibold, va a capo), codice monospace muted sotto, e se l'estrazione topic è
    fallita "Topic extraction failed" rosso con icona `warning` (errore nel tooltip). Ordina per codice (naturale,
    default crescente).
  - **Actuals rows**, **Matched resources** (a destra; "—" per i mai processati).
  - **Status**: pillola token — Error rossa con chevron + "(queued)" muted se in coda; Queued ambra; Updated verde;
    Not processed grigia; ordinabile Error → Queued → Not processed → Updated.
  - **Last · next run**: riga 1 data/ora ultimo processing o "—"; riga 2, solo per codici in coda, "Next HH:mm" ambra
    o "Next paused" / "Next within 60 s" (`describeNextRunShort`). Ordinabile per ultimo processing, mai processati
    in fondo.
  - **Azioni** nowrap: "Remove from queue" link rosso solo per i codici in coda (`showConfirm()` con il testo
    attuale); **Process** outline sempre presente, senza conferma.
- **Banda d'errore** (11.2c): click sulla pillola Error apre sotto la riga una banda rosso chiaro con icona `warning`,
  "Last run failed" in grassetto (nessun timestamp, §2) e l'errore completo monospace; secondo click la chiude, il
  chevron ruota; lo stato è `expanded[code]` e sopravvive al refresh.
- **Stati vuoti:** 11.2g "No actuals uploaded yet."; 11.2h "No project codes match the current filters." con link
  "Clear search and status" (azzera ricerca e stato).

## 9. Run history (11.2e)

Sostituisce il `<details>`. Switch segmentato `md-seg` all'inizio della toolbar della card: **Project codes Y**
(default all'apertura) / **Run history N** (N = righe, max 50). Con Run history la toolbar mostra solo lo switch;
la card mostra la tabella When · Type (monospace, valore grezzo) · Projects · Resource contributions · Duration ·
Error (rosso o "—"), più recenti prima, scroll interno, dati e formati attuali. Vista non persistita; il refresh
aggiorna entrambe.

## 10. Responsive (11.3)

La sub-nav segue il pattern Master Data esistente (tablet: riga di tab sotto `.ph`, attiva bianca con barra magenta
in basso; phone: card selettore "TIMESHEETS · Actuals ▾" con badge "N queued").

**Tablet (768–1023px)**
- Actuals: filtri a capo con il campo codice a tutta larghezza sulla prima riga; colonne Project (con "Client · code"
  muted sotto, raggruppamento come desktop) | Rows | Last uploaded | azioni; Uploads nascosta; azioni da 40px.
- Profile processing: strip su due righe (stato / next / last / topic, poi Settings a sinistra e Recalculate now +
  Rebuild all a destra); switch, ricerca e stato nella toolbar; colonne Project · Code (con "rows · resources" e
  fallimento topic muted sotto) | Status (con "Next HH:mm" sotto per i codici in coda) | Last processed | Process +
  "⋯" (Remove from queue, disabilitato per i codici non in coda); drawer `min(440px, 100%)`.

**Smartphone (< 768px)**
- Actuals: ricerca per codice e bottone **Filters (n)** che apre un bottom sheet locale con Client, Project (gli
  stessi dropdown multi-select) e Pipeline year; una card per codice (client muted, progetto, chip codice,
  "M rows · data", footer con View · Download · "⋯" da 44px); etichette di gruppo sticky fra le card; View a schermo
  intero.
- Profile processing: strip in card (stato + icona settings 44px, "Next run … · topic extraction on", Recalculate now a
  tutta larghezza, Rebuild all); switch di vista a tutta larghezza 44px; ricerca e stato; una card per codice
  (progetto, pillola stato, "code · rows · resources", "Last … · next HH:mm", banda d'errore inline per gli Error,
  footer Process · Remove from queue solo in coda); Settings a schermo intero.
- Target di tocco ≥ 44px.

## 11. Componenti, token, copy

- Bottoni, input, `md-switch`, `md-seg`, `.md-card`, `showConfirm()`, `.pd-icon` via `iconSvg`/`<ph-icon>`, token di
  `css/tokens.css`, `formatMoney`. Primary = `.btn-primary` magenta (le tavole disegnano navy: deviazione accettata
  come nel Master Data).
- Nessun hex nelle due pagine; nessuna emoji (👁 ⬇ 🗑 📂 ⚠ ↺ ▴ ▾ sostituiti da icone o chevron SVG).
- Copy in inglese, sentence case come le tavole; testi di validazione, conferma ed errore server invariati.

## 12. Test

- **Unit (vitest):** `js/lib/timesheets-list.test.js` (raggruppamento con "No client" in fondo, meta, sort 3 stati,
  Client inverte i gruppi, Project/Code dentro i gruppi, ordine server senza sort, filtri, reset);
  `js/lib/profile-jobs-ui.test.js` esteso (`describeNextRunShort`, `settingsState`); `js/lib/md-subnav.test.js` esteso
  (insieme `timesheets`, voce attiva, default `masterData` invariato, badge mostrato/nascosto a 0 e con valore non
  numerico, testo "N queued").
- **Guard statico** `js/lib/timesheets-pages-guard.test.js` sulle due pagine: sub-nav `data-subnav-set="timesheets"`
  con la voce attiva giusta; `.ph` "Timesheets" senza `.ph-btn` "Profile processing"; niente `<details>`; niente
  `confirm(`/`alert(`; niente emoji; niente hex nei `<style>`; "Load Actuals" presente e "Load XLS" assente;
  `#confirmModal` presente; Delete/Rebuild/Remove passano da `showConfirm(`.
- Guard esistenti toccati (es. `page-head-guard`, `master-data-guard`, `nav-shell-guard`, `foundations-guard`): le
  voci che cambiano si aggiornano nello stesso branch e si elencano nel report.
- I comportamenti interattivi senza harness (Delete che chiama l'API una volta, Download disabilitato durante la
  generazione, chiusura del drawer che scarta, una sola azione alla volta, banda aperta dopo il refresh) si verificano
  al Gate 2.

## 13. Verifica visiva

`scripts/shoot.mjs` contro il branch stack (`--base http://localhost:8081`, `--settle 3000`), larghezze 1440, 1024,
390. Stati: Actuals popolata, menu "⋯" aperto, View modal, nessun risultato; Profile processing popolata, drawer
Settings, banda d'errore aperta, Run history. PNG riletti e confrontati con le tavole corrispondenti (§3).

## 14. Fuori scope

- Caricamento degli actuals (Portfolio, project-config, planning), calcolo dei profili, worker, API.
- Voce di sidebar per Profile processing.
- Filtri, totali o ricerca dentro il modal View.
- Le opzioni A (11.1b, 11.2f).
- Estrarre un drawer o un bottom sheet condiviso.

## Criteri di accettazione

1. **Sub-nav** — su entrambe le pagine `.ph` "Timesheets" con il sottotitolo fisso e nessun bottone, sub-nav
   TIMESHEETS con la voce attiva corretta; il badge della coda appare con N > 0 e sparisce a 0 o con l'API in errore.
2. **Master Data invariato** — le quattro pagine `master-*.html` mostrano la stessa sub-nav di prima a tutte le
   larghezze.
3. **Lista raggruppata** — gruppi per client in ordine alfabetico con "No client" in ultima posizione, meta
   "N codes · M rows" coerente con i filtri, collasso per gruppo, sort a 3 stati con la semantica del §5.
4. **Azioni Actuals** — View apre il modal restilizzato; Download mostra lo spinner e resta disabilitato fino al file;
   Delete actuals dal "⋯" chiede conferma con `showConfirm()` e cancella una sola volta.
5. **Stati e copy Actuals** — stato vuoto e nessun risultato come 11.1e/11.1f; la nota dice "Load Actuals".
6. **Strip e drawer** — strip con stato, next/last, topic e le tre azioni; Save schedule abilitato solo con modifiche
   valide; il toggle topic salva subito; chiudere il drawer scarta le modifiche non salvate.
7. **Tabella Profile processing** — colonne fuse; "Next" solo per i codici in coda o in errore; ordinamento per
   ultimo processing con i mai processati in fondo; la banda d'errore resta aperta dopo il refresh da 15 s.
8. **Run history** — lo switch mostra la storia e nasconde ricerca, stato e contatore.
9. **Regole invariate** — polling 15 s solo con tab visibile, una sola azione alla volta con lo spinner sul solo
   bottone cliccato, alert rosso/ambra/verde con la logica attuale.
10. **Responsive** — tablet e smartphone come 11.3, con target di tocco ≥ 44px su phone.
11. **Pulizia** — nessun `confirm()`/`alert()`, nessuna emoji, nessun hex nelle due pagine; `npm test` verde.

## Decisioni aperte

1. **Un solo ciclo per le due pagine e tutte le larghezze.** Alternativa scartata: dividere desktop/tablet e
   smartphone come nel ciclo Planning. Perché: la sub-nav è condivisa e il brief è unico.
2. **`md-subnav.js` generalizzato con insiemi di sezioni e badge.** Alternativa scartata: una sub-nav locale copiata
   nelle due pagine. Perché: il brief chiede il riuso del componente, e un solo componente evita la deriva.
3. **Drawer Settings e bottom sheet locali alla pagina.** Alternativa scartata: estrarre un `.pd-drawer` condiviso in
   `style.css`. Perché: è lo schema già usato da Roles e Pipelines, e l'estrazione allargherebbe il ciclo ad altre
   pagine.
4. **Icone nuove in `icons.js` con bump del `?v=` ovunque.** Alternativa scartata: SVG inline nelle due pagine.
   Perché: `icons.js` è l'unica fonte delle icone `.pd-icon`.
5. **Test = funzioni pure + guard statico, interazioni al Gate 2.** Alternativa scartata: Vue come devDependency e
   app montate in jsdom. Perché: il progetto non ha harness Vue, e introdurlo è un ciclo a sé.
6. **Screenshot automatici con `shoot.mjs` a 1440/1024/390.** Alternativa scartata: sola verifica manuale al Gate 2.
   Perché: è un redesign da tavole (PROCESS.md §6.3, §6.6).
7. **Download: lo spinner sostituisce l'icona a larghezza fissa.** Alternativa scartata: spinner accanto all'icona.
   Perché: le tavole non lo disegnano e il bottone è solo icona.
8. **Bottom sheet phone con gli stessi dropdown multi-select a checkbox.** Alternativa scartata: liste di checkbox
   nuove dentro il sheet. Perché: le regole dei filtri restano invariate (brief §5).
