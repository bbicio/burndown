# Handoff — B-175 + B-176, poi l'audit dei form con dentro l'item 5

**Scritto:** 2026-10-29, dopo il merge del ciclo B (`ba82f99`, report `docs/superpowers/reports/2026-10-29-cycle-b-pot-currency-finish-cycle.md`).
**Per:** la sessione che apre il prossimo lavoro.

Ordine concordato con l'utente il 2026-10-29:
1. **Ciclo 1:** B-175 + B-176, i valori dei POT e il tasso delle versioni. Si apre con `/feature-brief`.
2. **Poi:** `/domain-audit` sulla validazione dei campi dei form, item 3 della memoria `project_manual_test_findings_money_cleanup.md`. Nel perimetro entra anche l'item 5, cioè gli input delle tariffe orarie formattati secondo la valuta. I cicli di fix nascono dopo l'audit, con `audit-to-brief`.

Nessuno dei due ha ancora un Brief o uno scope concordato. La classificazione dello scenario la dà l'utente alla prima domanda dello skill, non questo file.

---

## Ciclo 1 — B-175 e B-176

Prima del Brief rieseguire il `Verified how` delle due righe in `docs/BACKLOG.md`.

### B-175 — una proposta conta una volta sola

**Il difetto.** Tutte le route di `api/src/routes/pots.js` sommano ogni versione non Draft di una proposta. Lo si vede con `grep -n "pipeline != 'Draft'" api/src/routes/pots.js`, più il filtro `IN (…)` di `/pipeline-summary` e `/year-totals`. Esempio: una proposta con v1 rimasta Expected e v2 Committed entra sia in `expected_total` sia in `committed_total`, e il modal POT Details la elenca due volte. Il difetto c'era già prima del ciclo B; il ciclo B l'ha esteso ai nuovi totali E/S.

**Route coinvolte, tutte in `pots.js`:**
- `/pipeline-summary`: anche i conteggi, perché usa `COUNT(DISTINCT cgv.id)`, cioè le versioni e non le proposte;
- `/year-totals`;
- `/summary`: alimenta il tab POT di `pipeline.html`;
- `GET /`;
- `/:id/details`.

**Le due regole "versione di riferimento" che esistono già, e che non coincidono:**
- `pbGetDisplayVersion` in `pipeline.html`: tra le versioni non Draft vince quella con progetti collegati (`linkedProjects`), poi la più recente per `createdAt`.
- Il CTE `disp` di `api/src/routes/pipeline-years.js`: `DISTINCT ON (cg.id)`, che ordina per "esiste una riga `cg_version_projects`" e poi per `v.created_at DESC`. Guarda solo `cg_version_projects` e non `projects.cg_version_id`. Invece la regola "version has projects" di CLAUDE.md, sezione "Project currency lock", considera **entrambi**. L'anno lo prende da *qualunque* versione non Draft della proposta, non da quella di riferimento.

**Domande per il Brief:**
1. Quale regola adottare? Un helper SQL condiviso, sul modello di `api/src/lib/pot-fee-sql.js`, chiuderebbe la divergenza alla radice. Va deciso se debba seguire esattamente `pbGetDisplayVersion`.
2. L'anno di una proposta è quello della sua versione di riferimento? Oggi `pipeline-years.js` dice "qualunque".
3. Il tab POT di `pipeline.html` (`pbPotView` in `js/lib/pipeline-calc.js`) deve cambiare insieme a `/summary`?
4. Canceled: se la versione di riferimento è Canceled, la proposta sparisce dai totali (oggi già fuori) e anche dalla lista del modal? Si aggancia a B-174.
5. L'allineamento di `pipeline-years.js` (`projects.cg_version_id`) entra in questo ciclo o va in BACKLOG?

**Dati reali.** Oggi sul main stack nessuna proposta ha più di una versione non Draft:
`docker exec pdash-db psql -U pdash -d pdash -At -c "SELECT count(*), count(DISTINCT cost_grid_id) FROM cost_grid_versions WHERE pipeline <> 'Draft'"`
(i due numeri coincidevano il 2026-10-29). Il difetto quindi va provato con dati di test (`test-api.js`), non con quelli clonati.

### B-176 — il tasso di una versione

**Il percorso descritto nella riga.** `PATCH /api/cost-grids/:id/versions/:vId` scrive `currency_rate` solo se il body lo contiene (`api/src/routes/cost-grids.js` line 450). `refresh-rate` per EUR risponde `1.0` senza salvarlo (stesso file, line 1102). Un `PATCH` che porta la valuta a `'EUR'` senza `currencyRate` lascia quindi il vecchio tasso, e `feeEurSql` divide per quello.

**Cosa ho visto leggendo il codice il 2026-10-29, e che il Brief deve verificare su un branch stack.** Dalla UI quel percorso è improbabile, ma ce n'è un altro più probabile:
- L'autosave del cost grid manda `currencyRate` a **ogni** salvataggio: `currencyRate: parseFloat((window.__currencies || []).find(cu => cu.code === (meta.currency || 'EUR'))?.current_rate) || 1.0` in `js/api-sync.js` (`_cgUpsertVersionToApi`). Lo stesso schema è in `costgrid.html`, cercare `current_rate) || 1.0`.
- `window.__currencies` contiene solo le valute **attive** (`loadCurrenciesFromApi` → `Api.currencies.active()`).
- Conseguenze probabili, non provate:
  - (a) Il tasso salvato non è una fotografia: a ogni salvataggio diventa il tasso corrente della valuta. Il bottone `refresh-rate` esiste però proprio per aggiornarlo esplicitamente.
  - (b) Una versione in una valuta poi **disattivata** viene salvata con tasso `1.0`, e da quel momento il suo valore EUR è sbagliato in silenzio, nei POT e altrove.

**Domande per il Brief:**
1. Il tasso di una versione è una fotografia (fissato alla creazione e da `refresh-rate`) o segue il tasso corrente? Lo decide l'utente. La risposta cambia l'autosave.
2. Una versione EUR ha sempre tasso 1? Si può fissarlo sul server, nella `PATCH` e nella creazione, invece di correggerlo in `feeEurSql`, che è la proposta della review.
3. Cosa fare delle versioni esistenti con un tasso incoerente? Oggi non ce ne sono, ma va rieseguito prima del Brief:
   `docker exec pdash-db psql -U pdash -d pdash -At -c "SELECT count(*) FROM cost_grid_versions WHERE (currency = 'EUR' AND currency_rate <> 1) OR currency_rate = 0"`
4. Chi altro legge `currency_rate`? `grep -rn "currency_rate" api/src/routes/ js/` prima di decidere. Il blocco valuta del "Project currency lock" vieta di cambiare la valuta dopo il collegamento a un progetto, ma non il tasso.

### Vincoli del ciclo 1

- **Classe di rischio:** probabilmente `high-risk` (money o valute, PROCESS.md §6.1b).
- Tocca `api/`: Gate 1 lancia `scripts/run-tests.sh`, e al merge `pdash-api` viene riavviato.
- I test POT già presenti sono POT-01..POT-17 in `test-api.js`. Prima di scegliere i nuovi id: `grep -n "POT-1\|POT-2" test-api.js TEST_CASES.md`.
- I totali restano in EUR; solo Committed e Anticipated contano; Expected e SIP sono informativi (regole del ciclo B).
- Righe vicine in `docs/BACKLOG.md`: B-174 (Canceled nel modal), B-177 (valute inattive nel formato), B-182 (fee calcolata due volte, `FILTER`). Il Brief decide se qualcuna entra.

---

## Poi — `/domain-audit` sulla validazione dei form, con l'item 5

### Perché un audit e non un Brief

L'item 3 della memoria dice solo "rivedere la validazione dei campi in tutti i form". Le date sono già chiuse dai cicli C1..C4: audit `docs/superpowers/audits/2026-10-24-dates-form-validation-audit.md`, che alla sezione "Out of scope / roadmap notes" esclude esplicitamente gli item 3 e 5. Quanto sia grande il resto non lo sa nessuno.

Lo skill `domain-audit` concorda lo scope con l'utente **prima** di leggere il codice. Questo file propone soltanto.

### Proposta di scope

Ogni campo che un utente può modificare in un form, e ogni campo che una route accetta in scrittura, **date escluse**. Per ciascuno si controlla:
- **Obbligatorietà:** UI e server dicono la stessa cosa?
- **Tipo e intervallo:** negativi, zero, decimali dove non hanno senso, `NaN`, numeri troppo grandi.
- **Lunghezza e formato dei testi:** nome, codice, email; confronto con i `VARCHAR(n)` delle migrazioni.
- **Unicità:** codici e nomi duplicati, con il messaggio che arriva all'utente (un `23505` grezzo o un testo leggibile).
- **Server:** la route rifiuta da sola o si fida del client? Il modello è quello dei cicli date: una regola condivisa browser+server, e un rifiuto `400 { error, code }` che `js/api-sync.js` non riprova.
- **Importi** (l'item 5, sotto): formato secondo la valuta, regola di CLAUDE.md "Money formatting and parsing".

### L'item 5 dentro l'audit

**L'eccezione da rimettere in discussione.** CLAUDE.md, alla sezione "Money formatting and parsing", dice che gli input tariffa `type="number"` e gli input ore **non** sono coperti dalla regola. Formattare le tariffe significa cambiare quella regola: l'audit lo segnala, la decisione spetta all'utente.

**Input di importi e tariffe trovati il 2026-10-29** (`grep -n 'type="number"' *.html`, da rieseguire):

| Pagina | Campo | Oggi |
|---|---|---|
| `costgrid.html` | tariffa oraria per ruolo (`cg-rate-input`, `onRateChange`) | `type="number" min="0" step="1"`: niente decimali |
| `master-roles.html` | "Default rate (€/h)" e "Default rate (<simbolo>/h)" per valuta | EUR `step="1"`, le altre valute `step="0.01"` |
| `master-clients.html` | tariffe della rate card del cliente (`rc-override-rate`, `rc-client-rate`) | `step="0.01"` e `step="1"` nella stessa tabella |
| `project-config.html` | `res.hourlyRate` delle risorse | `type="number" min="0" step="1"` |
| `master-pipelines.html` | importo del POT (form nuovo/modifica) | `type="number" min="0" step="1000"`: un importo in EUR, non una tariffa |

- **Già formattati:** gli input importo di `costgrid.html` e `project-config.html` (PTC, phasing) usano `formatMoneyInput`/`parseMoney` (`grep -ln "formatMoneyInput" *.html`). L'audit li usa come riferimento.
- **Fuori dalla regola money per definizione:** i tassi di cambio di `master-currencies.html` (`step="0.000001"`) e le ore. Da confermare nello scope.
- **Domande che l'audit deve far emergere, non risolvere:**
  - quale valuta si usa per formattare ciascuna tariffa (quella della versione, della rate card, del progetto);
  - se gli step diversi (`1`/`0.01`) siano voluti;
  - se il POT, in EUR, debba seguire la regola degli importi.

### Vincoli dell'audit

- Solo verifica: niente fix durante l'audit. Alla fine si chiude con la riga di `audit-to-brief` dello skill, senza invocarlo.
- Il report va in `docs/superpowers/audits/`.
- I finding sulle date sono fuori scope: già coperti da C1..C4. Un difetto sulle date trovato per caso va in `docs/BACKLOG.md`.

## Guardia sui finding nuovi

Un difetto nuovo trovato durante il Brief, l'audit o l'esecuzione non si corregge di passaggio: va in `docs/BACKLOG.md` o in un Brief a sé.
