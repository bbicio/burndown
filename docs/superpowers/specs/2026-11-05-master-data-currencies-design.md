# Master Data — Currencies (phase 2, page 4 of 4) — design spec

**Date:** 2026-11-05
**Brief started:** unknown
**Brief:** `docs/superpowers/design/MD-Currencies/2026-11-04-brief-master-data-currencies-claude-code.md`
**Scenario:** 2 (evoluzione)

Fase 2 del redesign Master Data, quarta pagina: il contenuto della sezione "Currencies" dentro la shell della fase 1.
La tabella con input del tasso sempre aperti diventa una lista da leggere (tasso come valore, modificato al clic);
la form card "Activate a currency" diventa una riga inline con un picker ricercabile; il modal Bootstrap della
storia diventa un pannello laterale con un piccolo grafico. Il brief è normativo dove differisce dalle note delle
tavole; le regole attuali dell'app vincono sulle tavole (brief §2). Nessuna modifica API, shell o regole di tasso.

## 1. Obiettivo

- Lista delle valute attive (10.6a): cella Currency, riga base EUR, tasso + delta, inverso, ultimo aggiornamento
  + utente, History, nota informativa.
- Modifica del tasso inline con la conferma attuale dell'app (brief §5, §7.5).
- Riga di attivazione inline con picker ricercabile e anteprima dell'inverso (10.6b).
- Storia del tasso in un drawer laterale con grafico di andamento (10.6c).
- Tablet e smartphone come 10.6d; niente modal Bootstrap, niente emoji, niente `confirm()`/`alert()`.

## 2. Fatti verificati nel codice (a `418ff59`)

- `master-currencies.html`: app Vue; form card `crf` (rate iniziale `'1'`); `crEdit` con un input sempre aperto
  per riga; `#crRateConfirmModal` e `#crHistoryModal` guidati da `bootstrap.Modal`; watcher `globalError` con
  scroll-to-top.
- `GET /api/currencies` (`api/src/routes/currencies.js`): `code, symbol, name, locale, active, current_rate,
  last_updated`, ordine `code = 'EUR' DESC, active DESC, name`; nessun `updated_by`. `current_rate` è un NUMERIC
  che `pg` restituisce come stringa.
- `GET /:code/history`: `id, rate, created_at, updated_by` (`first_name || ' ' || last_name`, può essere `null`),
  `ORDER BY created_at DESC LIMIT 100`.
- `POST /:code/activate` e `PATCH /:code/rate`: stringhe d'errore "rate must be a positive number", "EUR is always
  active", "EUR rate is fixed at 1:1", "Currency not found", "Currency already active", "Currency is not active";
  entrambe inseriscono una riga in `currency_rates`.
- Le 20 valute seminate (`012_currencies.sql`) hanno tassi reali sotto 1000 (JPY, HUF, INR i più alti).
- I dialoghi di conferma delle pagine sorelle (`master-clients.html` `#confirmModal`, `master-roles.html`
  `#roleDeleteModal`) sono modal Bootstrap; i drawer sono CSS locale (`.cg-drawer`, `.mdp-drawer`, `.mdr-drawer`).
- `nav.js` inietta modal Bootstrap propri: il JS di Bootstrap resta caricato.
- `cg-select searchable` (`js/cg-controls.js`) filtra su `label`/`sub`, placeholder fisso "Search…", opzione su
  due righe.
- `formatDayText(iso)` (`js/lib/dates.js`) → "Oct 3, 2026".
- Guard: `js/lib/master-data-guard.test.js`, voce `master-currencies.html` con `api: ['currencies']`,
  `must: ['id="crHistoryModal"', 'id="crRateConfirmModal"', 'this.crEdit']`.
- Il brief cita `MDCurrenciesResponsive.dc.html` e `docs/captures/currencies/`: non esistono; tablet e phone sono
  solo in `10.6d-tablet-smartphone.jpg`, le catture stanno nella cartella design.

## 3. Mappa tavola → sezione

| Tavola | Sezione |
|---|---|
| 10.6a `10.6a-currencies-list.jpg` / `MDCurrencies.dc.html` default | §5, §6 |
| 10.6b `10.6b-activate-currency.jpg` / `adding=true` | §7 |
| 10.6c `10.6c-rate-history-usd.jpg` / `history=true` | §8 |
| 10.6d `10.6d-tablet-smartphone.jpg` | §9 |

Elementi delle tavole non costruiti: colonna "Used in" (brief §7.2), menu "⋯" con Deactivate (brief §7.1),
conteggio nel sub-nav (brief §7.7).

## 4. Architettura

- **`js/lib/master-currencies.js`** (nuovo, ES module, `?v=1`, bridge `window.<name>` per export). Funzioni pure:
  - `formatRate(rate)` — numero in `en`, minimo 4 decimali, fino a 6 solo se non nulli (`1.3` → `1.3000`,
    `0.857143` → `0.857143`); usa `toLocaleString`, ammesso per i tassi (CLAUDE.md, Money).
  - `inverseRate(rate)` — `1 / rate` formattato a 4 decimali, `''` per un tasso non valido.
  - `parseRateText(text)` — trim; un solo separatore decimale, `,` o `.`; testo con entrambi, più di un
    separatore o caratteri non numerici → `NaN`; vuoto → `null`.
  - `isValidRate(n)` — finito e > 0.
  - `rateDelta(rows)` — dalle due righe più recenti: `{ pct, dir: 'up'|'down' }`, `null` con meno di due righe o
    con variazione assoluta < 0,01%.
  - `historyEntries(rows)` — righe (più recente prima) arricchite con `delta` (numero vs la riga più vecchia
    successiva, `null` per l'ultima), `noChange` (rate uguali), `activated` (solo l'ultima e solo se
    `rows.length < 100`), `newest` (la prima).
  - `pickableCurrencies(currencies, query)` — `!active && code !== 'EUR'`, ordine ricevuto, filtro
    case-insensitive su code, name, symbol.
  - `formatRateDate(ts)` — data locale → `formatDayText` ("Oct 3, 2026"); `formatRateDateTime(ts)` — più
    `", HH:MM"` in ora locale 24h.
  - `sparklinePoints(rows, w, h)` — stringa `points` per la polyline in ordine cronologico; un punto → linea
    piatta.
- **`master-currencies.html`** — l'unica pagina toccata. CSS locale con prefisso `.mdc-`, solo token, nessun hex.
  Carica `js/lib/dates.js` e `js/lib/master-currencies.js` prima dello script dell'app. Stato: `edit = { code,
  text, error }`, `confirm = { code, oldRate, newRate, rate, error, saving }`, `act = { show, code, text, error,
  saving, pickerOpen, query }`, `hist = { code, rows, loading, error }`, `histByCode` (cache per caricamento
  pagina), `sheet` (phone).

## 5. Lista (10.6a)

- Header della card: titolo "Currencies", descrizione "Active currencies can be used in proposals and rate cards.
  EUR is the base currency."; a destra `.btn-primary` "+ Activate currency" (magenta, deviazione accettata),
  nascosto con la riga di attivazione aperta o senza valute attivabili.
- Nota informativa sotto l'header (box grigio, `ph-icon` info): "A new rate applies to proposal versions created
  from now on. Existing versions keep the rate saved when they were created."
- Colonne (intestazione 10px uppercase): Currency | Rate · 1 EUR = | Inverse | Last updated | azioni. Solo valute
  attive, ordine dell'API. Righe min 58px.
- Currency: box 34×34 con `symbol` (corpo ridotto se > 2 caratteri), `code` in grassetto, `name` muted. EUR: box
  con tinta success e pill navy "Base".
- Rate: EUR "Fixed · 1.0000" muted, non cliccabile. Altre: `formatRate`, simbolo muted, matita, delta "▲ 8.3%" /
  "▼ 7.0%" muted (da `rateDelta`).
- Inverse: "1 GBP = € 1.2500" (`inverseRate`, simbolo EUR da `currencyInfo`); EUR "—".
- Last updated: `formatRateDate(last_updated)`, sotto `updated_by` della riga più recente in 11px muted; EUR "—".
- Azioni (non-EUR): link "History".
- Delta e utente: dopo il caricamento della lista, `Api.currencies.history(code)` in parallelo per ogni attiva
  non-EUR, in `histByCode`; in caricamento o in errore la riga si mostra senza.
- Vuoto (fallback): "No active currencies.". Errore di caricamento: alert dentro la card, nessuno scroll; il
  watcher `globalError` si rimuove.

## 6. Modifica del tasso (10.6a, inline)

- Clic sul valore o sulla matita → input 110px (focus ring magenta, suffisso simbolo) con `String(current_rate)`
  normalizzato (fino a 6 decimali, senza zeri finali oltre il quarto), Save e Cancel. Una riga alla volta: aprirne
  un'altra annulla la prima. Esc = Cancel, Enter = Save; focus e testo selezionato.
- Save: `parseRateText` + `isValidRate`, altrimenti "Rate must be a positive number" sotto l'input. Poi il dialogo
  di conferma (§6.1).
- Successo: chiude dialogo e modifica, ricarica la lista, ricarica la history di quella valuta. Nessun banner.
- Spariscono gli input sempre aperti, i Save per riga, i due modal Bootstrap e ogni `bootstrap.Modal`.

### 6.1 Dialogo di conferma

- Overlay Vue locale (`.mdc-dialog`, scrim, `role="alertdialog"`, `aria-modal`), senza Bootstrap. Titolo "Update
  exchange rate?"; corpo "You're about to change 1 EUR = <old> → <new> <symbol> for <CODE>." con `formatRate`, poi
  "This update does not affect any proposal or project already in the system — it only applies to new ones
  created from now on (or to an existing cost grid version if a "refresh rate" is explicitly run on it)."
- Cancel / Confirm (spinner durante il salvataggio, entrambi disabilitati). Esc e scrim = Cancel, non durante il
  salvataggio. Focus su Confirm all'apertura.
- Confirm chiama `Api.currencies.updateRate(code, rate)` una volta; errore del server in `confirm.error` dentro il
  dialogo, Confirm riabilitato.
- Phone: reso come bottom sheet a tutta larghezza.

## 7. Attivazione (10.6b)

- "+ Activate currency" inserisce una riga grigia in cima al `tbody` e apre il picker.
- Picker: combobox locale. Trigger (focus ring magenta) con placeholder "Select currency…", selezionato
  "<CODE> — <name>"; popover 320px con ricerca "Search code or name…" e opzioni `pickableCurrencies` (code bold,
  name, symbol muted). Frecce, Enter, Esc; clic fuori chiude.
- Rate nella colonna del tasso: placeholder "e.g. 1.6500", suffisso simbolo della valuta scelta, valore iniziale
  vuoto, `parseRateText`.
- Inverse: "1 <CODE> = € <inverseRate>" live, "—" finché non valido.
- Hint muted nella colonna Last updated: "Starts the rate history."
- Cancel e `.btn-primary` "Activate" disabilitato finché valuta e tasso non sono validi; spinner durante il
  salvataggio. `Api.currencies.activate(code, rate)`; errori del server sotto la riga, riga aperta.
- Successo: chiude la riga, ricarica la lista e le history.

## 8. Storia del tasso (10.6c)

- Drawer locale `.mdc-drawer` 560px (`min(560px, 100%)`), scrim navy; chiude su scrim, ✕, Esc. Aperto da
  "History"; usa `histByCode` se presente e ricarica comunque.
- Head: eyebrow "Rate history", titolo "<name> (<CODE>)", sotto "Every change is logged with date, time and user."
- Tasso corrente: "1 EUR = **<formatRate>** <symbol> · current".
- Grafico: SVG con polyline (`sparklinePoints`) in un box grigio, prima e ultima data sotto (`formatRateDate`).
  Niente assi, niente tooltip.
- "Changes · N": per `historyEntries`, pallino (magenta per la più recente, grigio altrove),
  `formatRateDateTime`, `updated_by` o "—" con " · activated" dove previsto, delta "+0.1000"/"−0.1000" (4
  decimali) o "no change" ambra (`--color-warning-text`), tasso `formatRate` a destra.
- Caricamento: spinner. Errore: "Couldn't load the rate history." con Retry. Vuoto: "No rate history yet."

## 9. Responsive (10.6d)

- **Tablet (768–1023px):** colonne Currency | Rate (box stile input 40px, tap per modificare come §6, inverso sotto
  in 11px) | Last updated | History; niente colonna Inverse, niente delta. Controlli 40px. Riga di attivazione:
  picker e tasso su due righe se serve. Drawer `min(560px, 100%)`.
- **Smartphone (< 768px):** "+ Activate currency" a tutta larghezza 44px; nota in testo pieno. Una card per valuta:
  box simbolo, code + name, tasso 15px bold con inverso sotto a destra; card non-EUR chiuse da due azioni 44px
  **Edit rate** · **History**.
  - Edit rate → bottom sheet "Edit rate · <CODE>", Cancel; label "1 EUR =", input 48px con suffisso; helper
    "1 <CODE> = € <inverse> · applies to new proposal versions"; primario "Save rate" 46px; Save → dialogo §6.1
    come secondo sheet.
  - "+ Activate currency" → bottom sheet con il picker come lista a tutta altezza con ricerca, tasso e Activate,
    stesse regole di §7.
  - History → drawer a schermo intero con head sticky.

## 10. Componenti, token, icone, cache-busting

- Shell invariata. `.md-card`, `.btn-primary`, `ph-icon` dal set esistente (info, pencil, chevron, close, search);
  nessuna emoji, nessun hex nella pagina. "▲ ▼ —" come glifi di testo.
- Nuovo file `js/lib/master-currencies.js?v=1`; `js/lib/dates.js` caricato con il `?v=` già in uso nel repo.
  Nessun file condiviso versionato cambia.

## 11. Test

- Nuovo `js/lib/master-currencies.test.js`: `formatRate` 4–6 decimali; `inverseRate` 4 decimali; `parseRateText`
  con `,` e `.`, entrambi → `NaN`, vuoto → `null`; `isValidRate`; `rateDelta` con due righe, una riga, < 0,01%;
  `historyEntries` "no change", `activated` solo sotto 100 righe, `newest`; `pickableCurrencies` solo inattive
  non-EUR e ricerca su code/name/symbol; `sparklinePoints` un punto → linea piatta.
- Nuovo guard statico `js/lib/master-currencies-page-guard.test.js`: nessun `bootstrap.Modal`, `confirm(`,
  `alert(`, emoji o `form-card`; `updateRate(` chiamato solo dentro il metodo del Confirm; il catch di quel metodo
  scrive `confirm.error` e non `globalError`; Activate con `:disabled` legato alla validità.
- `master-data-guard.test.js`: la voce `master-currencies.html` passa ai nuovi marker (dialogo, drawer, stato di
  modifica inline); `api: ['currencies']` invariato.

## 12. Verifica visiva

`scripts/shoot.mjs` contro lo stack di branch (`scripts/test-branch.sh up`, `--base http://localhost:8081`,
`--settle 3000`) alle larghezze 1400, 1024, 390: lista (10.6a), riga di attivazione con picker aperto (10.6b),
drawer della history (10.6c), dialogo di conferma, tablet e phone con bottom sheet (10.6d). I PNG si rileggono e si
confrontano con le tavole; gli scostamenti si presentano uno per uno (PROCESS.md §6.6.5).

## 13. Fuori scope

- Shell (fase 1), Clients & groups, Pipelines & POTs, Roles & rates.
- Endpoint di disattivazione e conteggi d'uso (brief §7.1, §7.2); valute fuori dall'elenco seminato; snapshot e
  refresh dei tassi nelle versioni.
- Stato URL (brief §9, opzionale).

## Criteri di accettazione

1. **Lista** — solo valute attive, EUR prima con pill "Base", "Fixed · 1.0000" non cliccabile; tasso a 4–6 decimali, inverso a 4, delta nascosto con una riga o sotto 0,01% (`master-currencies.test.js`; Gate 2).
2. **Modifica inline** — clic sul valore apre input + Save/Cancel, una riga alla volta, Esc/Enter; "," accettata (`master-currencies.test.js`; Gate 2).
3. **Conferma** — ogni cambio di tasso passa dal dialogo e chiama `updateRate` una volta; un errore del server resta nel dialogo con Confirm riprovabile (`master-currencies-page-guard.test.js`; Gate 2).
4. **Attivazione** — riga inline con picker che elenca solo inattive non-EUR e filtra su code/name/symbol; Activate disabilitato finché valuta e tasso > 0 non sono validi; inverso live (`master-currencies.test.js`, `master-currencies-page-guard.test.js`; Gate 2).
5. **History** — drawer con tasso corrente, grafico, cambi con delta a 4 decimali, "no change" ambra e "activated" solo sotto 100 righe; chiude su scrim, ✕, Esc (`master-currencies.test.js`; Gate 2).
6. **Niente Bootstrap modal** — nessun `bootstrap.Modal`, `confirm()`, `alert()`, emoji o hex nella pagina; guard Master Data aggiornato e verde (`master-currencies-page-guard.test.js`, `master-data-guard.test.js`).
7. **Responsive** — tablet 1024 e phone 390 come 10.6d, bottom sheet Edit rate con conferma, target ≥ 44px su phone (verifica visiva §12; Gate 2).

## Decisioni aperte

1. **Helper puri in un nuovo `js/lib/master-currencies.js`.** Alternativa scartata: tutto nella pagina con test sul markup. Perché: il brief chiede test sul comportamento ed è il pattern delle pagine sorelle.
2. **Dialogo di conferma come overlay Vue locale, senza Bootstrap.** Alternativa scartata: modal Bootstrap come in Roles. Perché: il brief chiede zero `bootstrap.Modal` nella pagina.
3. **Picker come combobox locale.** Alternativa scartata: `cg-select searchable`. Perché: fedele alla 10.6b (placeholder, tre colonne, ricerca sul simbolo) senza toccare `js/cg-controls.js`, condiviso.
4. **Drawer con CSS locale `.mdc-`.** Alternativa scartata: estrarre un drawer condiviso. Perché: ciclo limitato a una pagina, come la decisione di Roles.
5. **Date con `formatDayText` ("Oct 3, 2026"), history con ", HH:MM" in ora locale.** Alternativa scartata: `en-GB` "03 Oct 2026". Perché: è il formato della tavola ed esiste un helper dell'app.
6. **Tasso con un solo separatore decimale, "," o "."; entrambi → invalido.** Alternativa scartata: interpretare le migliaia. Perché: nessuna valuta seminata supera 1000 e "1,000" sarebbe ambiguo.
7. **Il dialogo di conferma mostra vecchio → nuovo con `formatRate`.** Alternativa scartata: 6 decimali fissi come oggi. Perché: un solo formato di tasso nella pagina.
8. **Tablet senza delta.** Alternativa scartata: tenerlo se c'è spazio. Perché: la 10.6d non lo mostra.
9. **Nota informativa in testo pieno anche su tablet e phone.** Alternativa scartata: una riga richiusa su phone. Perché: il brief la vuole su tablet e la riga richiusa è facoltativa.
10. **Nessuno stato URL (`?history=`).** Alternativa scartata: costruirlo. Perché: opzionale e assente dalle tavole, come in Roles.
11. **Screenshot automatici con `scripts/shoot.mjs` nel Piano (1400/1024/390).** Alternativa scartata: solo il Gate 2. Perché: redesign con tavole, come i cicli Master Data precedenti.
12. **Brief e tavole committati insieme alla Spec.** Alternativa scartata: un commit separato prima. Perché: entrambi precedono il worktree (PROCESS.md §6.5).
