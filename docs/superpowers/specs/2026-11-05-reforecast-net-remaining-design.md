# Reforecast — actuals veri nel passato, residuo netto di progetto nel futuro — design spec

**Date:** 2026-11-05
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-04-reforecast-net-remaining-brief.md`
**Scenario:** 2 (evoluzione)

Il Reforecast di `project-config.html` deve scrivere nei mesi passati gli actuals veri e nei mesi da quello corrente in poi il residuo netto di progetto, così che il phasing torni con i KPI del portfolio. Nessuna API, nessuna migrazione.

## 1. Fatti verificati nel codice (a `864229a`)

- `reforecastDistribution(tasks, months, actualsRows, currentYm, digits)` (`js/lib/config-form-calc.js:86-201`) è chiamata solo da `runReforecast` (`project-config.html:1446-1489`), con i task fatturabili e tutte le righe di actuals del codice progetto.
- Riduce gli actuals passati di un task in sforamento fino al venduto (`hrsScale`/`spendScale`, `:135-136`) e calcola il residuo per task, `max(0, venduto − consumato)` (`:137-138`). Lo sforamento di un task non riduce quello degli altri.
- Ignora le righe datate nel mese corrente o dopo (`:87-88`, `:133-134`) e valuta 0 una riga il cui ruolo manca dal task (`:106`).
- Un task le cui date finiscono prima del mese corrente perde il proprio residuo: `taskFuture` è vuoto (`:130`, `:173`).
- Il portfolio (`computeKpis`, `js/lib/portfolio-calc.js:9-31`) conta tutte le righe dei task fatturabili, a qualunque data, e con un ruolo mancante usa la tariffa della prima risorsa del task (`findRate`, `js/core.js:173-181`).
- Il modulo è caricato con `js/lib/config-form-calc.js?v=6` (`project-config.html:516`, unico riferimento).
- Il test `caps past actuals at sold hours/budget when actuals exceed sold` e il test `distError` (`js/lib/config-form-calc.test.js`) pinnano due comportamenti che questo ciclo rimuove.

## 2. Algoritmo

Ore ed euro si calcolano in parallelo, ciascuno con la propria chiave. "Mesi aperti" = mesi di `months` con `ym >= currentYm`.

1. **Valorizzazione.** Una riga di un task fatturabile (task e ruolo normalizzati come oggi) vale `ore × tariffa`. La tariffa è quella della risorsa con lo stesso ruolo; se il ruolo manca, quella della prima risorsa del task; se il task non ha risorse, 0. Le righe di un task non fatturabile o sconosciuto sono scartate.
2. **Consumato.** Per ogni task è la somma di tutte le sue righe, a qualunque data, anche fuori da `months`. Il consumato di progetto è la somma sui task.
3. **Actuals nei mesi.** Ogni riga datata in un mese di `months` va in quel mese, in `newPhasing` e `newPlanning`, senza riduzioni, qualunque sia il mese. Una riga fuori da `months` conta nel consumato ma non viene scritta.
4. **Residuo netto.** `max(0, venduto totale − consumato totale)`, separatamente per ore ed euro.
5. **Destinatari.** Un task riceve una quota se ha almeno un mese aperto dentro le proprie date: `taskStartYM <= ym <= taskEndYM`, con le date del task o i limiti di `months`, come oggi. Margine del task = `max(0, venduto_t − consumato_t)`. Quota = `residuo netto × margine_t / Σ margini dei destinatari`.
   - Se la somma dei margini dei destinatari è 0 ma il residuo netto è > 0, il residuo si divide in parti uguali sui mesi aperti del progetto.
   - Lo stesso vale quando nessun task ha mesi aperti.
   - Un task in sforamento ha margine 0 e non riceve nulla.
   - Una quota può superare il margine del task quando un task finito ha lasciato margine (decisione 3).
6. **Distribuzione della quota.** Si distribuisce sui mesi aperti del task:
   - con una distribuzione mensile valida (somma entro 0,5 di 100, come oggi) e somma delle percentuali dei mesi aperti > 0, in proporzione a quelle percentuali;
   - altrimenti in parti uguali.
7. **Arrotondamento.** Ogni mese di `newPhasing` viene arrotondato a `digits`, come oggi. Le ore dei mesi aperti, actuals compresi, passano per `distributeHoursExact`, come oggi.
8. **Valori restituiti.** Gli stessi campi di oggi: `newPhasing`, `newPlanning`, `distError`, `remainingBudget`, `remainingHours`, `distributedRemainingHours`, `pastMonths`, `futureMonths`.
   - `distError` è sempre `null`, perché il ramo d'errore scompare.
   - `remainingBudget` / `remainingHours` diventano il residuo netto, ≥ 0.
   - Si aggiungono `consumedBudget`, `consumedHours`, `soldBudget`, `soldHours`, `overBudget` (consumato € > venduto €) e `overHours`.
   - `pastMonths` / `futureMonths` restano `ym < currentYm` / `ym >= currentYm`.

## 3. Messaggio di conferma (`runReforecast`)

```
Phasing and planning grids will be fully overwritten:

Months with actuals — replaced with actual spend & hours from loaded XLS data
Current & future months (N) — net remaining distributed per task settings (…):
  Remaining budget: <remainingBudget>
  Remaining hours: <distributedRemainingHours>
```

In sforamento complessivo, la riga "Remaining budget" diventa `Remaining budget: 0 (over budget: <consumedBudget> consumed of <soldBudget> sold)`; per le ore vale lo stesso, con "over hours". Il ramo `if (result.distError)` resta, innocuo.

## 4. Test (`js/lib/config-form-calc.test.js`)

- **Characterization, scritto e verde prima della modifica:** due task senza distribuzione, nessuno sforamento, nessuna riga dal mese corrente in poi. Si fissa l'output attuale esatto di `newPhasing` e `newPlanning`, che deve restare identico dopo.
- **Sostituiti:** il test del taglio degli sforamenti (ora: actuals veri, 20 h / 2.000 €) e il test `distError` (ora: nessun errore, quota distribuita in proporzione alle percentuali).
- **Nuovi test:**
  - sforamento di un task con margine su un altro: il futuro somma al residuo netto, per € e per ore;
  - proporzione al margine fra due destinatari;
  - sforamento complessivo: futuro vuoto, `overBudget` true;
  - riga del mese corrente nel proprio mese che riduce il residuo;
  - ruolo mancante valutato alla tariffa della prima risorsa;
  - task già finito con margine: la sua quota passa agli altri;
  - riga fuori da `months` contata nel consumato ma non scritta;
  - scenario BERMITS: task, venduto, tariffe e actuals per mese ridotti a righe aggregate per task, ruolo e mese, con passato 49.340 € / 416,75 h e futuro 10.680 € / 87,25 h.

## 5. Fuori scope

Derive phasing (`deriveDistribution`), i PTC, l'elenco dei task in sforamento nel messaggio, qualunque modifica al portfolio o alle API.

## Criteri di accettazione

1. **Actuals veri** — con un task in sforamento, i mesi passati di `newPhasing`/`newPlanning` contengono gli actuals non ridotti (test unit).
2. **Residuo netto** — con un task in sforamento e uno con margine, i mesi aperti sommano a `max(0, venduto − consumato)` per € e per ore (test unit).
3. **Proporzione al margine** — due destinatari con margini diversi ricevono quote proporzionali (test unit).
4. **Sforamento complessivo** — futuro a 0, nessun errore, `overBudget` true; il messaggio lo segnala (test unit + verifica manuale).
5. **Nessuna regressione** — il characterization test scritto prima della modifica resta verde dopo.
6. **Messaggio coerente** — i totali del messaggio coincidono con la somma dei mesi aperti scritti in griglia (verifica manuale).
7. **Mese corrente** — una riga del mese corrente compare in quel mese e riduce il residuo (test unit).
8. **Ruolo mancante** — vale la tariffa della prima risorsa del task (test unit).
9. **BERMITS** — su *BERMITS Maintenance 2026* Reforecast porta i mesi passati a 49.340 € / 416,75 h e novembre + dicembre a 10.680 € / 87,25 h (test unit sullo scenario + verifica manuale, senza salvare).
10. **Cache-busting** — `js/lib/config-form-calc.js?v=7` in `project-config.html`, unico riferimento.

## Decisioni aperte

1. **Chiavi separate per ore ed euro.** Alternativa scartata: una sola chiave, il margine in ore. Perché: con tariffe diverse fra task, solo le chiavi separate fanno tornare esattamente entrambi i totali.
2. **Task con distribuzione mensile: quota in proporzione alle percentuali dei mesi aperti, senza riporto né `distError`.** Alternativa scartata: mantenere il riporto sul primo mese futuro. Perché: il riporto confrontava percentuale pianificata e consumata, un confronto senza senso coerente con il residuo netto.
3. **Il margine di un task già finito passa agli altri destinatari; senza destinatari, il residuo va in parti uguali sui mesi aperti del progetto.** Alternativa scartata: perderlo, come fa oggi un difetto. Perché: il futuro deve valere quanto il residuo del portfolio.
4. **Le righe dopo il mese corrente o fuori da `months` contano nel consumato; quelle dentro `months` vanno nel loro mese.** Alternativa scartata: ignorarle. Perché: il residuo deve coincidere con quello del portfolio.
5. **Le righe di un task non fatturabile o sconosciuto restano scartate.** Alternativa scartata: contarle. Perché: il portfolio fa lo stesso (`billableData`).
6. **La firma di `reforecastDistribution` resta quella di oggi; `distError` resta, sempre `null`.** Alternativa scartata: rimuovere il campo e il ramo in `runReforecast`. Perché: si tocca meno il chiamante; il ramo morto è innocuo.
