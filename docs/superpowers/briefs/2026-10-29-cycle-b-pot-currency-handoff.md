# Handoff — ciclo B: pannello pipeline e POT (dopo il ciclo A)

**Scritto:** 2026-10-29, dopo il merge del ciclo A (`819ba54`, report `docs/superpowers/reports/2026-10-29-ui-quick-wins-finish-cycle.md`).
**Per:** la sessione che apre il ciclo B con `/feature-brief`.

Il ciclo B **non ha ancora un Brief**. Nasce dai finding del test manuale del 2026-10-01 (memoria di progetto `project_manual_test_findings_money_cleanup.md`, item 4, 6 e 8), raggruppati con l'utente come "pipeline detail panel e POT". È un'evoluzione (Scenario 2), ma la classificazione la dà l'utente alla prima domanda di `/feature-brief`, non questo file.

## Il punto principale: due dei tre item sono già fatti

Verificato sul codice il 2026-10-29. Il redesign del pannello di dettaglio della pipeline, ciclo 2 (merge `aea1745`, 2026-10-07), ha coperto gli item 4 e 6 dal lato pipeline. Il Brief deve partire da qui e non dalla descrizione del 2026-10-01.

| Item | Richiesta del 2026-10-01 | Stato oggi | Evidenza |
|---|---|---|---|
| 4 | "≈ €" nel pannello di dettaglio della pipeline | **fatto** | `pipeline.html`, tab Overview: `eurEquivalent(detailBudget.fee)`, `.ptc` e il totale (cercare `eurEquivalent`); metodo `eurEquivalent(n)`; commit `0ca5cb0`; caso P-73 |
| 6 | Expected e SIP nel widget POT, solo informativi | **fatto nel pannello pipeline**, non in Master Data | `pipeline.html`, tab POT: barra a segmenti e legenda Committed/Anticipated/Expected/SIP con importi, nota "Progress and gap count Committed + Anticipated only…", lista "OTHER PROPOSALS · NOT IN TOTAL"; `pbPotView` in `js/lib/pipeline-calc.js` (percentuali e gap solo su C+A); `GET /api/pots/summary` restituisce `expected_total`/`sip_total` (commit `7f3fb5e`); casi P-75, P-76 |
| 8 | Importo in valuta originale nel modal POT Details | **aperto** | vedi sotto |

Il posizionamento chiesto dall'utente per l'item 6, cioè le righe Expected/SIP "sotto il label N proposals contribute to this POT", non corrisponde più al markup: quel label non esiste più, il redesign ha messo Expected e SIP nella barra, nella legenda e nella lista "not in total". Il Brief deve chiedere all'utente se questo basta o se vuole altro.

## Cosa resta davvero

### Item 8 — valuta originale nel modal POT Details

Il modal sta oggi in `master-pipelines.html`, non più in `config.html`, che è solo un redirect (split di Master Data, `106560c`).
- **Apertura:** bottone "🔍 View Details" della tabella POT, `openPotDetails(pot)`. Il body è costruito come stringa HTML in `innerHTML` (cercare `potDetailsModalBody`).
- **Riga proposta:** colonna Value = `window.formatMoney(p.value, 'EUR', window.__currencies)`, solo EUR.
- **API:** `GET /api/pots/:id/details?year=` in `api/src/routes/pots.js` (`requireAuth, requireAdmin`). Per ogni proposta restituisce `version_id, cg_id, pipeline, created_at, proposal_name, client_name, owner_name, value`. `value` è la sola fee, senza PTC, divisa per `cgv.currency_rate` (`valueExpr`). **Mancano la valuta della versione e l'importo nella valuta originale**, quindi l'item tocca anche `api/`.
- **Regola dell'utente, vincolante:** il valore EUR resta sempre visibile ed è l'unico che entra nei totali e nel calcolo del POT. L'importo originale è solo informativo.
- **Precedente nella stessa pagina:** la tabella phasing di `master-pipelines.html` mostra già "importo locale<br>(EUR)" per le proposte non EUR (cercare `isNonEur`). Il Brief deve decidere se il modal segue la stessa forma.

### Item 6 — residuo in Master Data

In `master-pipelines.html` né la tabella dei POT (colonne Achieved/Committed/Anticipated) né il modal POT Details mostrano Expected e SIP. `GET /api/pots/:id/details` non calcola `expected_total`/`sip_total`, mentre `/summary` sì. La domanda era già aperta il 2026-10-01 ("whether the config POT tab should get the same lines too"): va posta nel Brief, non decisa qui.

### Item 6 e 8 insieme — domanda per il Brief

Anche la lista proposte del tab POT di `pipeline.html` (contributing e other) mostra solo EUR (`formatMoney(p.value, 'EUR', …)`). Il Brief deve chiedere se l'importo originale serve anche lì, oppure solo nel modal di Master Data come chiesto.

## Differenze trovate fra le due route (pre-esistenti, da non correggere di straforo)

Viste leggendo `api/src/routes/pots.js` il 2026-10-29. Non sono parte della richiesta: il Brief le presenta all'utente e, se non entrano, vanno in `docs/BACKLOG.md`.
1. **Tasso a zero:** `/summary` divide per `COALESCE(NULLIF(cgv.currency_rate, 0), 1)`, mentre `/:id/details` divide per `COALESCE(cgv.currency_rate, 1)`, senza `NULLIF`. Con un `currency_rate` a 0 la seconda probabilmente fallisce per divisione per zero. Non verificato: serve una prova su un branch stack.
2. **Canceled:** entrambe le route filtrano solo `pipeline != 'Draft'`, quindi anche le proposte Canceled entrano nella lista del modal (non nei totali). Per `/summary` c'è già B-039. Il Brief deve decidere se il modal debba mostrarle.
3. **Totali:** `/:id/details` calcola `committed_total`/`anticipated_total` sulle stesse righe che restituisce, mentre `/summary` usa una query di totali separata. Per il modal (admin) le due cose coincidono.

## Righe di `docs/BACKLOG.md` vicine

Rieseguire il loro `Verified how` prima del Brief: sono tutte `open` al 2026-10-29.
- **B-013:** totali di programma in valute miste, sommati grezzi ed etichettati EUR. Stesso tema valuta, altro perimetro.
- **B-031:** in modalità "All in EUR" la riga PTC della card non ha il sotto-testo "from CHF …".
- **B-039:** nessun test verifica che le righe Canceled restino in `/api/pots/summary`.
- **B-041:** difetti minori del pannello (`pbFmtMonth`, voci di legenda POT a zero, arrotondamento).
- **B-042:** `/api/pots/summary` risponde 500 a un `clientId` UUID malformato.

## Vincoli che il Brief e il Piano dovranno portare

- **Money:** ogni importo con `formatMoney(v, code, currencies)` e il codice della sua riga, mai `Intl.NumberFormat` (`js/lib/money-guard.test.js`); nessuna valuta implicita.
- **Valori:** solo Committed e Anticipated contano per il POT; Draft fuori; EUR sempre visibile e usato nelle somme.
- **`innerHTML`:** il modal è una stringa HTML, quindi ogni campo testuale passa da `esc()`, come quelli già presenti.
- **Hex letterali:** il modal ha colori hex inline pre-esistenti. `master-*.html` è escluso dall'unificazione degli header in attesa del restyling di Master Data. Il Brief deve dire se il ciclo li tocca, altrimenti restano.
- **API:** estendere la risposta di `/:id/details` non aggiunge route, quindi `scripts/architecture-guard.test.js` non scatta. Il ciclo tocca `api/`: Gate 1 lancia `scripts/run-tests.sh`, e al merge `pdash-api` viene riavviato.
- **Test esistenti:** `test-api.js` POT-06 copre `/:id/details` (200, 400 senza `year`, 404). Gli id POT-01..POT-12 sono presi: i nuovi partono da POT-13 (`grep -n "POT-1" test-api.js TEST_CASES.md` prima di sceglierli).
- **Documentazione:** `docs/pages/config.md` racconta le pagine Master Data; `pots.js` non ha un file `docs/api/`.
- **Classe di rischio:** probabilmente `high-risk` (money o valute, PROCESS.md §6.1b), da dichiarare nel Piano.

## Guardia sui finding nuovi

Un difetto nuovo trovato durante il Brief, il brainstorming o l'esecuzione non si corregge in questo ciclo: va in `docs/BACKLOG.md` o in un Brief a sé.
