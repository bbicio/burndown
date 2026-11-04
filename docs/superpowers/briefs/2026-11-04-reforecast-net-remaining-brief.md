# Brief — Reforecast: actuals veri nel passato, residuo netto di progetto nel futuro

**Tipo:** Scenario 2 — evoluzione di una funzione esistente (classificazione confermata dall'utente il 2026-11-04).
**Origine:** verifica in chat sul progetto *BERMITS Maintenance 2026* (`ce54e0a8-5776-44cf-9ca1-4bd4e595bd92`): il phasing dopo Reforecast non torna con il portfolio. Approccio A scelto dall'utente.

## Problema

Sul progetto di riferimento:

| | Ore | € |
|---|---|---|
| Venduto (task fatturabili) | 504 | 60.020 |
| Actuals (portfolio, `computeKpis`) | 416,75 | 49.340 |
| Mesi passati nel phasing dopo Reforecast | 380,25 | 45.520 |
| Residuo nel portfolio | 87,25 | 10.680 |
| Residuo nel phasing (nov + dic) | 123,75 | 14.500 |

La differenza (36,5 h / 3.820 €) è la somma degli sforamenti di due task: *FE / BE Development* (66 h su 32 venduti) e *Overall coordination* (22,5 h su 20).

## Comportamento attuale

`reforecastDistribution` (`js/lib/config-form-calc.js:86-201`), chiamata da `runReforecast` (`project-config.html:1446-1489`) con i soli task fatturabili e tutte le righe di actuals del codice progetto:
- **Valorizzazione:** ogni riga vale `hours × hourlyRate` della risorsa con lo stesso task e ruolo (normalizzati); con un ruolo assente la tariffa è 0 (`:92-111`). Le righe con un task che non è tra quelli fatturabili sono scartate (`:99`).
- **Passato/futuro:** passato = mesi `< currentYm`, futuro = mesi `>= currentYm` (`:87-88`). Gli actuals datati nel mese corrente o dopo non entrano né nel passato né nel residuo.
- **Riduzione degli sforamenti:** se gli actuals passati di un task superano il venduto, i mesi passati del task vengono scalati fino al venduto (`hrsScale`/`spendScale`, `:135-136`, usati a `:143-144` e `:168-169`). Il test `caps past actuals at sold hours/budget when actuals exceed sold` (`js/lib/config-form-calc.test.js`) pinna questo comportamento.
- **Residuo per task:** task senza distribuzione mensile valida → `max(0, venduto − consumato)` del task, diviso in parti uguali sui suoi mesi futuri (`:137-138`, `:173-176`). Task con distribuzione valida → percentuali pianificate sui mesi futuri, con lo scarto dei mesi passati riportato sul primo mese futuro (`:140-165`); oltre 100,5 % restituisce `distError` (`:154-157`). Lo sforamento di un task non riduce il residuo degli altri.
- **Totali del messaggio di conferma:** `remainingBudget`/`remainingHours` = totale venduto − actuals passati **non scalati** (`:185-188`), quindi il messaggio mostra già il residuo netto (10.680 €), mentre la griglia scrive 14.500 €.
- **Ore:** i mesi futuri passano per `distributeHoursExact` (`:190-198`).
- **Portfolio (riferimento):** `computeKpis` (`js/lib/portfolio-calc.js:9-31`) conta tutte le righe fatturabili, a qualunque data, e con un ruolo assente usa la tariffa della prima risorsa del task (`findRate`, `js/core.js:173-181`).

## Comportamento atteso

- I mesi passati del phasing e del planning riportano gli actuals **veri**, senza riduzione, anche per i task in sforamento.
- Il totale da distribuire nei mesi futuri, sia per le ore sia per l'importo, è il **residuo netto di progetto**: totale venduto − totale consumato, con minimo 0.
- Il residuo netto si distribuisce solo sui task che hanno ancora margine (`venduto − consumato > 0`), in proporzione al margine di ciascuno; dentro ogni task segue le regole di ripartizione mensile attuali.
- Sul progetto di riferimento, dopo Reforecast, i mesi passati valgono 49.340 € / 416,75 h e il futuro 10.680 € / 87,25 h.
- Se il progetto ha sforato nel complesso, il futuro vale 0 e il totale del phasing supera il venduto. Il messaggio di conferma lo dice.
- I totali del messaggio di conferma coincidono con quanto viene scritto nella griglia.
- Gli actuals datati nel mese corrente vengono contati come consumato: riducono il residuo netto e compaiono nel mese corrente, che riceve anche la sua quota di residuo.
- Con un ruolo assente dal task, la riga vale la tariffa della prima risorsa del task, come `findRate` nel portfolio. Il consumato del Reforecast coincide così con `consumedEur` di `computeKpis`.

## Vincoli

- Resta tutto lato client, nel modulo puro `js/lib/config-form-calc.js`. Nessuna API, nessuna migrazione.
- I mesi restano arrotondati ai decimali della valuta; le ore passano ancora per `distributeHoursExact`.
- Il modulo è versionato: ogni riferimento `?v=N` a `js/lib/config-form-calc.js` va aggiornato (Cache-busting, `CLAUDE.md`).
- Il test che pinna la riduzione degli sforamenti va sostituito, non solo rimosso. Servono characterization test sul comportamento che resta invariato (task senza sforamenti, distribuzione mensile, arrotondamento).
- Testi utente in inglese.

## Criteri di accettazione

1. Con un task in sforamento, i mesi passati di `newPhasing`/`newPlanning` contengono gli actuals veri di quel task (test unit).
2. Con un task in sforamento e uno con margine, la somma dei mesi futuri è `max(0, venduto totale − consumato totale)`, per € e per ore (test unit).
3. Il residuo va solo ai task con margine, in proporzione al margine (test unit con due task con margine diverso).
4. Con il progetto in sforamento complessivo, i mesi futuri sono vuoti o a 0 e non c'è errore (test unit).
5. Senza sforamenti il risultato è identico a quello di oggi (characterization test scritto prima della modifica).
6. Il messaggio di conferma mostra gli stessi totali scritti nella griglia e segnala lo sforamento complessivo.
7. Su *BERMITS Maintenance 2026*, Reforecast porta i mesi passati a 49.340 € / 416,75 h e novembre + dicembre a 10.680 € / 87,25 h (verifica manuale, senza salvare se non voluto).
8. Ogni `?v=N` di `js/lib/config-form-calc.js` è aggiornato allo stesso valore.
9. Una riga datata nel mese corrente compare nel mese corrente e riduce il residuo netto (test unit).
10. Una riga con un ruolo assente dal task vale la tariffa della prima risorsa del task (test unit).

## Scope escluso

Confermato dall'utente il 2026-11-04.
- **Derive phasing** (`deriveDistribution`): invariato.
- **Pass-through cost (PTC):** non entrano nel Reforecast; il phasing resta solo fee.
- **Elenco dei task in sforamento nel messaggio di conferma:** il messaggio segnala solo lo sforamento complessivo.

Proposti in scrittura, **non ancora confermati**:
- Righe di actuals con un task non fatturabile o sconosciuto: restano scartate, come nel portfolio (`billableData`).
- Actuals datati dopo il mese corrente (il portfolio li conta): trattamento da decidere in `/brainstorming`.

## Domande aperte per `/brainstorming`

- **Task con distribuzione mensile valida:** come si applica la quota di residuo netto? (Riscalare le percentuali future del task alla sua quota, mantenere o eliminare il riporto sul primo mese futuro e il `distError`.)
- **Proporzione per ore e per €:** due chiavi separate (margine in ore per le ore, margine in € per l'importo) o una sola?
- **Peso dei task in sforamento in un singolo mese futuro:** un task in sforamento non riceve nulla in futuro anche se le sue date coprono quei mesi. Va bene?
