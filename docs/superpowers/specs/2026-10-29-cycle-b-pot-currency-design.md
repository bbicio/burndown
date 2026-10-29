# Spec — POT in Master Data: valuta originale, Expected/SIP, tasso a zero (ciclo B)

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-29-cycle-b-pot-currency-brief.md` (Scenario 2, evoluzione).
Design concordato in chat il 2026-10-29 (una fermata, §6b).

## 1. Scope

- Item 8: importo in valuta originale nel modal POT Details di `master-pipelines.html`.
- Item 6, residuo in Master Data: Expected e SIP, solo informativi, nel modal, nella tabella POT e nella riga anno.
- Tasso a zero: le route di `api/src/routes/pots.js` dividono per `COALESCE(NULLIF(currency_rate, 0), 1)`.
- Colori del modal POT Details da hex letterali a token.

Regola vincolante: solo Committed e Anticipated entrano in totali, percentuali e gap; il valore EUR è sempre visibile ed è l'unico sommato.

## 2. API

### 2.1 Helper SQL condiviso — `api/src/lib/pot-fee-sql.js` (nuovo)

CommonJS, puro, senza dipendenze. Esporta:
- `feeEurSql(alias)` → stringa SQL: `COALESCE((SELECT SUM(<giorni × tariffa>) / COALESCE(NULLIF(<alias>.currency_rate, 0), 1) FROM phases … WHERE <ph>.version_id = <alias>.id), 0)`. La tariffa è quella di oggi: `COALESCE(tr.rate_override, <ratecard_entries della versione>, ro.hourly_rate, 0)`.
- `feeOriginalSql(alias)` → la stessa fee, senza divisione per il tasso.

Gli alias interni (fasi, task, task_roles, roles) sono propri dell'helper e non collidono con quelli delle query che lo includono. `alias` è sempre un letterale scritto nel codice, mai un input.

Tutte e cinque le route che oggi calcolano una fee usano l'helper: `/pipeline-summary`, `/year-totals`, `/summary`, `GET /`, `/:id/details`. Dopo il ciclo `pots.js` non contiene più `currency_rate` fuori dall'helper. I risultati di `/summary` e `/pipeline-summary` non cambiano, salvo che una versione con tasso 0 non fa più fallire la route.

### 2.2 `GET /:id/details`

- Ogni proposta aggiunge `currency` (`cgv.currency`) e `value_original` (`feeOriginalSql('cgv')`, numero). `value` resta l'EUR (`feeEurSql('cgv')`).
- La risposta aggiunge `expected_total` e `sip_total`: somme JS dei `value` delle righe Expected e SIP, come gli attuali `committed_total`/`anticipated_total`.
- I campi esistenti restano invariati.

### 2.3 `GET /`

Le due subquery correlate diventano una sola `LEFT JOIN LATERAL` per POT, con `SUM(CASE WHEN pipeline = '<stadio>' THEN <feeEurSql> ELSE 0 END)` per Committed, Anticipated, Expected e SIP sulle versioni nel perimetro del POT (stesso `scopeFilter`, stesso `pipeline_year = p.year`). La risposta aggiunge `expected_total` e `sip_total`. `achieved_total` resta `committed_total + anticipated_total`.

### 2.4 `GET /year-totals`

Il filtro passa a `pipeline IN ('Committed', 'Anticipated', 'Expected', 'SIP')`; il JS accumula anche `expected_total` e `sip_total` per anno, a 0 negli anni che hanno solo un POT. `achieved_total` resta C+A.

## 3. Frontend — `master-pipelines.html`

### 3.1 Modal POT Details (`openPotDetails`)

- **Cella Value di una proposta:** se `p.currency` esiste ed è diverso da `'EUR'`, mostra `formatMoney(p.value_original, p.currency, window.__currencies)` e sotto, piccolo e attenuato, `(formatMoney(p.value, 'EUR', window.__currencies))`. È la stessa forma della tabella phasing. Altrimenti mostra un solo importo, `formatMoney(p.value, 'EUR', …)`. Il codice valuta è passato a `formatMoney` così com'è e non entra nel markup come testo libero.
- **Expected/SIP:** sotto la riga delle quattro card una riga informativa attenuata `Not in total · Expected <EUR> · SIP <EUR>`. Total (C+A) e le percentuali sul target non cambiano.
- **Colori:** il markup scritto in `#potDetailsModalBody` non contiene hex letterali. Mappa:
  - Committed → `var(--pipeline-committed-color)`; Anticipated → `var(--pipeline-anticipated-color)`;
  - `#1a1a2e` → `var(--text-primary)`; `#6b7280` → `var(--text-muted)`;
  - badge tipo (`#e8edff`/`#1a1a6e`) → `var(--indigo-50)`/`var(--brand-navy)`;
  - badge di stadio delle proposte → `var(--pipeline-<stadio minuscolo>-bg)` / `var(--pipeline-<stadio minuscolo>-color)`, con l'operazione fatta solo nel modal. `stageBg()`/`stageColor()` restano invariati per le tabelle phasing.
- Nessun token nuovo in `css/tokens.css`.
- Il markup statico del modal (righe 483-500 circa) e il resto della pagina mantengono i loro hex.

### 3.2 Tabella POT

Due colonne `Expected` e `SIP` dopo `Anticipated`, valori `formatMoney(+pot.expected_total || 0, 'EUR', activeCurrencies)` e simili, con classe `text-muted`. Total (C+A) invariato.

### 3.3 Riga anno

La sotto-riga diventa `C: … · A: … · E: … · S: …`. `E` e `S` hanno `text-muted`, i valori vengono da `yearTotals[py.year].expected_total`/`sip_total` (`|| 0`). Percentuale e importo C+A invariati.

## 4. Test

- **`api/src/lib/pot-fee-sql.test.js`** (node:test, nuovo): `feeEurSql` contiene `NULLIF(<alias>.currency_rate, 0)`; `feeOriginalSql` non contiene `currency_rate`; leggendo `api/src/routes/pots.js` come testo, `currency_rate` non compare.
- **`test-api.js`**, nuovi casi da POT-13 (verificare i liberi con `grep -n "POT-1" test-api.js TEST_CASES.md`):
  - `/:id/details` con una proposta EUR e una CHF a tasso ≠ 1 nel perimetro del POT: ogni riga ha `currency` e `value_original` numerico; per EUR `value_original === value`; per CHF `value_original / rate ≈ value`.
  - `committed_total`/`anticipated_total` di `/:id/details` = somma dei `value` EUR delle righe C/A.
  - `/:id/details`, `GET /`, `/year-totals`: `expected_total`/`sip_total` numerici e pari alla somma attesa; `achieved_total` = C+A.
- **vitest** (nuovo `js/lib/master-pipelines-pot-details.test.js`): legge `master-pipelines.html` come testo e verifica che il corpo di `openPotDetails` non contenga hex letterali, contenga `value_original` e la riga `Not in total`, e che la tabella POT abbia le intestazioni Expected/SIP.
- **Manuale, sul branch stack:** `UPDATE cost_grid_versions SET currency_rate = 0 WHERE id = '<versione nel perimetro di un POT>'` via psql; `GET /api/pots/:id/details`, `GET /api/pots`, `GET /api/pots/year-totals`, `GET /api/pots/pipeline-summary` rispondono 200.
- `TEST_CASES.md`: righe nuove per i casi POT-13+ e il controllo manuale.

## 5. Documentazione

- `docs/pages/config.md`: il modal POT Details e la tabella POT (valuta originale, Expected/SIP informativi).
- `docs/api/lib.md`: `pot-fee-sql.js`.
- `docs/BACKLOG.md`: le proposte Canceled restano nella lista del modal (escluse dal Brief).

## 6. File toccati

`api/src/lib/pot-fee-sql.js` (nuovo), `api/src/lib/pot-fee-sql.test.js` (nuovo), `api/src/routes/pots.js`, `master-pipelines.html`, `js/lib/master-pipelines-pot-details.test.js` (nuovo), `test-api.js`, `TEST_CASES.md`, `docs/pages/config.md`, `docs/api/lib.md`, `docs/BACKLOG.md`. Nessun file `js/`/`css/` versionato con `?v=` cambia contenuto.

## 7. Scope escluso

Dal Brief: valuta originale nel tab POT di `pipeline.html`; item 6 in `pipeline.html`; proposte Canceled nel modal (in BACKLOG); hex della tabella POT, della riga anno e del resto della pagina; PTC nel valore; B-013, B-031, B-039, B-041, B-042.

## Criteri di accettazione

1. **Valuta nella risposta** — `GET /api/pots/:id/details` restituisce per ogni proposta `currency` e `value_original`; per una proposta EUR `value_original` è uguale a `value`.
2. **Conversione coerente** — per una proposta CHF a tasso ≠ 1, `value_original / currency_rate` è uguale a `value` entro l'arrotondamento.
3. **Cella non EUR** — nel modal una proposta non EUR mostra l'importo nel formato della sua valuta e sotto `(…)` in EUR; una proposta EUR mostra un solo importo.
4. **Totali C/A in EUR** — `committed_total`/`anticipated_total` di `/:id/details` sono la somma dei `value` EUR delle righe Committed/Anticipated, anche con proposte non EUR.
5. **E/S nei dettagli** — `/:id/details` restituisce `expected_total`/`sip_total` numerici, pari alla somma dei `value` delle righe Expected/SIP.
6. **E/S nella lista POT** — `GET /api/pots` restituisce per ogni POT `expected_total`/`sip_total` numerici; `achieved_total` resta C+A.
7. **E/S per anno** — `GET /api/pots/year-totals` restituisce per anno `expected_total`/`sip_total` numerici; `achieved_total` resta C+A.
8. **Colonne tabella** — la tabella POT mostra le colonne Expected e SIP; Total (C+A) invariato.
9. **Riga anno** — la sotto-riga di ogni anno mostra E e S accanto a C e A; percentuale e importo C+A invariati.
10. **Riga nel modal** — il modal mostra `Not in total · Expected … · SIP …`; Total (C+A) e le percentuali non li includono.
11. **Tasso a zero** — con una versione a `currency_rate = 0` nel perimetro, `/:id/details`, `GET /api/pots`, `/year-totals` e `/pipeline-summary` rispondono 200.
12. **Una sola espressione** — `api/src/routes/pots.js` non contiene `currency_rate`; `pot-fee-sql.test.js` lo verifica.
13. **Modal senza hex** — il corpo di `openPotDetails` non contiene hex letterali.
14. **Suite verdi** — `npm test`, `node --test` da `api/` e `scripts/run-tests.sh` passano.

## Decisioni aperte

1. **Un helper SQL condiviso in `api/src/lib/pot-fee-sql.js` per le cinque route.** Alternativa scartata: aggiungere `NULLIF` in ciascuna delle quattro copie. Perché: una sola espressione chiude il difetto alla radice e la rende verificabile con un test.
2. **Anche `/summary` usa l'helper.** Alternativa scartata: lasciarla com'è perché il Brief la dichiara invariata. Perché: il risultato è identico e lasciarla fuori manterrebbe una sesta copia della regola.
3. **Nomi dei campi `currency` e `value_original`.** Alternativa scartata: restituire `currency_rate` e calcolare nel client. Perché: il client non rifà conversioni, e `currency` è il nome già usato dalla tabella phasing.
4. **`GET /` riscritta con una `LATERAL` e `SUM(CASE)` per stadio.** Alternativa scartata: due subquery correlate in più. Perché: una scansione per POT invece di quattro, su una route caricata a ogni apertura della pagina.
5. **Expected/SIP nel modal come riga informativa sotto le card.** Alternativa scartata: due card in più. Perché: le card mostrano "% of target", e una card Expected suggerirebbe che conta.
6. **Expected/SIP nella tabella e nella riga anno in `text-muted`.** Alternativa scartata: i colori di stadio. Perché: segnala "non conta" senza aggiungere colori a una pagina in attesa di restyling.
7. **Committed/Anticipated nel modal con i token di stadio.** Alternativa scartata: `--color-success` e un token arancio nuovo. Perché: nessun token nuovo e stessa tinta di `pipeline.html`. L'arancio Anticipated diventa più scuro.
8. **Il tasso a zero si prova con un guard unitario e un controllo manuale con psql.** Alternativa scartata: dare a `test-api.js` accesso al DB. Perché: modificherebbe l'infrastruttura di test per un solo caso.
9. **Il test del modal legge il sorgente della pagina.** Alternativa scartata: estrarre il builder in `js/lib/`. Perché: il cambio resta piccolo.
