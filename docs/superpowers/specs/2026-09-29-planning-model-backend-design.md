# Planning model nel backend (Cycle A) — design

Data: 2026-09-29. Stato: bozza per revisione. Precede il Cycle B, l'assistente di allocazione (`docs/superpowers/specs/2026-09-29-planning-team-assistant-design.md`), la cui §6 ("Curva di carico") verrà sostituita da una chiamata al servizio di questo ciclo.

## 1. Obiettivo

Oggi il calcolo delle ore di Planning (vendute, consumate, da pianificare, ripartizione futura per settimana e per owner) esiste **solo nel browser**, dentro tre `computed` di `planning.html` (`byRoleView`, `byProjectView`, `byOwnerView`, circa 300 righe ciascuna, con il calcolo mescolato alla costruzione dell'HTML). L'assistente del Cycle B ha bisogno dello stesso calcolo nel backend, e una seconda copia della regola divergerebbe in silenzio.

Questo ciclo sposta il calcolo nel backend, in un unico servizio (`GET /api/planning/model`), che diventa l'**unica fonte di verità**. Le viste di Planning e l'export XLS smettono di calcolare e mostrano il modello. In una seconda fase, isolata, si corregge un'anomalia della finestra (§10).

## 2. Decisioni concordate

- **Parità totale in Fase 1** (opzione A): nessun numero visibile cambia, comprese le incoerenze tra le viste, replicate nel codice in modo esplicito.
- **Un solo endpoint con celle fini** (approccio 1): ore per progetto, task, ruolo, owner e settimana; solo celle non nulle; le viste aggregano nel browser.
- **Calcolo a richiesta con cache in-process** azzerata dagli eventi (nessuna tabella nuova, nessun dato pre-distribuito: le settimane future dipendono da "oggi").
- **Correzione della finestra in Fase 2**, come modifica isolata, con diff dichiarato e approvato (§10).
- Il calcolo copre sempre l'**intero periodo**; `from`/`to` filtrano solo l'output.

## 3. Fuori scope

L'assistente (Cycle B); qualsiasi altro cambio di comportamento di Planning oltre alla correzione della finestra; l'unificazione delle regole tra le viste (distribuzione mensile solo nella vista per ruolo, fallback sulle date del progetto, scarto dei task fuori finestra): restano come oggi, esplicite nel codice, da decidere a parte; l'upload XLS ("Load XLS") e il resto di `js/upload.js`; tabelle materializzate del carico (eventuale ottimizzazione futura).

## 4. Come funziona oggi (dalla lettura del codice)

Le tre viste **non condividono lo stesso calcolo**:

| | Per ruolo | Per progetto | Per owner |
|---|---|---|---|
| Ore future per settimana | distribuzione mensile del task (`monthlyDistribution`) se somma 100% ±0,5, altrimenti uniforme | uniforme | uniforme |
| Date del task | fallback sulle date del progetto | idem | nessun fallback (tutte le settimane future) |
| Task fuori dalla finestra visibile | scartato | scartato | non scartato |
| Ripartizione tra owner | no | sì (owner attivi, proporzione actuals) | sì (idem, soglia owner > 0,01 h) |
| Filtro team | sì | sì | sì |

Altre dipendenze da riprodurre:

- **Finestra:** nel ramo con distribuzione mensile le percentuali sono normalizzate sui soli mesi visibili (`planning.html`, blocco `usePDist`). Nel ramo uniforme le ore/settimana usano `countFutureTaskWeeks` sull'intero task, indipendenti dalla finestra. La Fase 1 replica entrambi; la Fase 2 corregge il primo.
- **"Oggi":** mezzanotte locale del browser (`asOf`).
- **Settimana e fuso:** i giorni sono interpretati con `new Date(r.date)` e confrontati con mezzanotte locale (lunedì-domenica). Il modello usa date di calendario (`YYYY-MM-DD`) e settimane identificate dal lunedì (`YYYY-MM-DD`); eventuali differenze di bordo (righe di domenica, cambio ora legale) vanno individuate e classificate dalla cattura di parità (§9), non decise a tavolino.
- **Owner e actuals:** gli actuals di un `project_code` vengono attribuiti a **ogni** progetto con quel codice (`GET /api/timesheets/all-data` fa un `LEFT JOIN projects ON code`); le righe senza owner usano `'—'`. Il profile engine usa invece il progetto più vecchio: sono due regole diverse e restano tali.
- **Owner inattivi:** lo stato viene da `POST /api/resources/match-owners` (attivo/inattivo/non abbinato = attivo). Il modello lo calcola direttamente con `match-resource` (nessun dato personale nella risposta).
- **Modalità "pulse":** con `pulse=true` e ore/settimana < 1, il ramo uniforme concentra le ore del mese sulla prima settimana futura; la distribuzione mensile la ignora. Cambia in quale settimana cadono le ore, quindi è un parametro del servizio.
- `js/ai.js` usa ancora `matchesTaskRole` e `computeResidual` di `js/lib/planning-calc.js`: quelle due funzioni **non** si eliminano in questo ciclo (spariscono con `js/ai.js` nel Cycle B).

## 5. Servizio (`api/src/lib/planning-model.js`, funzione pura)

`buildPlanningModel({ projects, actuals, ownerStatus, asOf, pulse })` → modello. Nessun accesso al DB, nessuna dipendenza dal fuso del server. Copre l'intero periodo dei task; le tre regole di §4 sono funzioni distinte e nominate (`uniformSeries`, `phasedSeries`, `splitAmongActiveOwners`), così la differenza tra le viste è visibile nel codice e non nascosta in un ramo.

Per ogni progetto → task non completato → ruolo del task (`resources[]`): ore vendute, ore consumate (`matchesTaskRole`: ruolo e task case-insensitive), residuo (`max(0, vendute − consumate)`), date effettive (con indicazione se ereditate dal progetto), totali per owner, quota futura per owner (rinormalizzata sui soli attivi, oppure tutto su `'—'` se nessuno è attivo o non ci sono owner), e le serie settimanali:
- `actual[owner]` per settimana passata;
- `planned[owner]` per settimana futura, regola uniforme + ripartizione + `pulse`;
- `plannedPhased` (totale di task+ruolo, senza owner) per la sola vista per ruolo.

Il servizio dati `api/src/services/planning-data.js` carica progetti (con le stesse regole di visibilità di `GET /api/projects`: admin/sysadmin tutti, altri owner o condivisi), task, actuals per `project_code` e risorse/alias, in poche query, e chiama il servizio puro. Il filtro di visibilità si applica **dopo** il calcolo sul modello (la cache è unica, non per utente).

## 6. Endpoint

`GET /api/planning/model?from=YYYY-MM-DD&to=YYYY-MM-DD&asOf=YYYY-MM-DD&pulse=0|1` — `requireAuth`. `asOf` e `pulse` obbligatori (il client passa la propria data locale, così i numeri coincidono con quelli che vedeva); `from`/`to` opzionali (default: tutto). Risposta (indicativa, il formato esatto si fissa nel piano):

```json
{
  "asOf": "2026-09-29", "pulse": false,
  "weeks": ["2026-09-28", "2026-10-05"],
  "ownerStatus": { "Mario Rossi": "active", "Anna Bianchi": "inactive" },
  "projects": [{
    "id": "…", "tasks": [{
      "name": "…", "start": "2026-09-01", "end": "2026-12-31", "datesInherited": false,
      "roles": [{
        "role": "…", "sold": 120, "consumed": 40, "residual": 80,
        "owners": { "Mario Rossi": { "actuals": 40, "futureShare": 1 } },
        "cells": { "2026-10-05": { "actual": {}, "planned": { "Mario Rossi": 6.4 }, "plannedPhased": 8, "isPulse": false } }
      }]
    }]
  }]
}
```

Errori: 400 per parametri mancanti/malformati (messaggio per campo). Nessun dato di profilo delle risorse: solo nomi già visibili oggi in Planning e stato attivo/inattivo.

## 7. Cache

Cache in-process del modello **completo** (tutti i progetti, tutto il periodo) per chiave `asOf`+`pulse`, con scadenza di 30 s, come `getResourcesAndAliasesCached`. Richieste concorrenti a cache fredda condividono un'unica promessa. Viene azzerata dagli stessi punti che oggi accodano il profile engine: upload e cancellazione di timesheet (`timesheets.js`), modifiche a progetto e task (`projects.js`: POST, PATCH, DELETE, PUT `/tasks`, PATCH `/planning`; i tag non influiscono sul modello), modifiche a risorse e alias (`rescanAll` in `resources.js`). Funzione di invalidazione unica (`invalidatePlanningModel()`), chiamata da un solo punto per ogni gruppo di route, best-effort (non fa fallire la richiesta, come le varianti `Quiet`).

## 8. Migrazione di `planning.html`

- Caricamento: `loadConfigFromApi()` resta (filtri, titoli, elenco progetti); si rimuovono `refreshTimesheetDataFromApi()` da questa pagina e la chiamata a `POST /api/resources/match-owners` (il modello porta `ownerStatus`). L'endpoint `match-owners` non si elimina in questo ciclo: si verifica con grep che non abbia altri consumatori e si annota come candidato alla rimozione.
- Le tre `computed` mantengono filtri (progetti, pipeline, team), aggregazione per intervallo (settimane/mesi), arrotondamento, HTML ed `exportRows`; perdono il calcolo delle ore. `sumChildBreakdownHours`, `buildMonthPeriods` e le altre funzioni di presentazione restano.
- Le chiavi settimana passano da `weekStart.toISOString()` a `YYYY-MM-DD` del lunedì (mappa client → chiave del modello in un solo punto).
- Nuova chiamata al modello quando cambiano `asOf`, finestra o `pulse`; il resto (filtri, intervallo, arrotondamento) non rifà la richiesta.
- Dopo il confronto di parità si eliminano da `js/lib/planning-calc.js` le funzioni di calcolo non più usate da nessuno (`distributeFutureResidual`, `redistributeExcludingInactive`, `countFutureTaskWeeks`, ecc.: elenco definitivo con grep nel piano) e i relativi test vitest, che passano in `node:test` sul servizio. `matchesTaskRole` e `computeResidual` restano (usate da `js/ai.js`).

## 9. Fasi e prova di parità

**Fase 0 — misura e cattura.**
1. Payload: dati sintetici grandi (200 progetti, 150 persone, ~300.000 righe) → dimensione della risposta non compressa e compressa e tempo di calcolo. Se supera circa 10 MB non compressi, si rivede la granularità prima di procedere (ad es. `owner` opzionale, o celle raggruppate per mese oltre un orizzonte).
2. Cattura "golden": con il codice attuale, per ciascuna vista, `exportRows` e `periodMeta` (già prodotti da ogni vista) su un insieme fisso di combinazioni: intervallo settimanale/mensile, filtri team, filtri progetto/pipeline, finestre diverse (piena e ristretta), pulse on/off, arrotondamento on/off. Eseguita nel browser (Claude in Chrome) su un dataset di test dedicato (progetti con e senza distribuzione mensile, con task senza date, con owner inattivi e senza owner, con actuals di domenica). I JSON vengono salvati in `docs/superpowers/reports/` (o in una directory di lavoro se contengono dati reali: da valutare, dati reali non si committano).

**Fase 1 — spostamento, parità totale.** Servizio, endpoint, cache, migrazione delle viste, confronto con la cattura golden: **zero differenze**. Ogni differenza è un difetto della migrazione, a meno che ricada nelle "differenze di bordo" di §4 (fuso/domenica), che vengono elencate una a una all'utente per decisione. Solo dopo la parità piena si elimina il calcolo del browser.

**Fase 2 — correzione della finestra (§10).** Cattura ripetuta; il diff rispetto alla Fase 1 deve contenere solo le celle attese.

## 10. Fase 2 — correzione della finestra

**Problema:** nel ramo con distribuzione mensile la vista per ruolo normalizza le percentuali sui soli mesi visibili nella finestra. Un task con 100 h residue e distribuzione ottobre 40% / novembre 30% / dicembre 30% mostra 40/30/30 con la finestra piena, ma 57/43 se la finestra copre solo ottobre-novembre: le ore di dicembre vengono riversate nei mesi visibili.

**Correzione:** le ore di un task non dipendono più dalla finestra. La distribuzione mensile si applica sull'**intero periodo futuro del task** (`futureDistTotal` calcolato su tutti i mesi futuri del task, non solo su quelli visibili); la finestra decide solo quali celle si mostrano. Se tutti i mesi futuri hanno 0%, resta il ripiego uniforme già esistente. Poiché il servizio calcola già sull'intero periodo e `from`/`to` filtrano solo l'output, la correzione è una sola modifica in `phasedSeries`.

**Impatto atteso:** nella finestra iniziale (che copre normalmente l'intero asse) nessun cambio; cambio solo restringendo la finestra, sulle celle dei task con distribuzione mensile valida. Il confronto golden della Fase 2 lo verifica e lo documenta con un esempio prima/dopo. In seguito all'approvazione, `docs/pages/planning.md` descrive il nuovo comportamento.

## 11. Test

- `node:test` puri su `planning-model.js`: le tre regole (uniforme, distribuzione mensile, ripartizione tra owner attivi con TBD e soglia 0,01), fallback date, task completati, `asOf` (settimane passate/future/corrente), `pulse`, righe senza owner, ruolo/task case-insensitive, più progetti con lo stesso `code`; casi dedicati alla Fase 2 (finestra piena vs ristretta danno le stesse ore per le stesse celle).
- Servizio dati e route: `/model` con validazione dei parametri, visibilità per utente (admin, owner, condiviso, nessun accesso), invalidazione della cache dagli eventi (upload/cancellazione, PUT task, modifica risorsa), promessa condivisa; integrazione in stack isolato (`scripts/run-tests.sh`), casi in `test-api.js`.
- Vitest: gli helper client di presentazione toccati (mappa chiavi settimana) e la rimozione dei test delle funzioni di calcolo eliminate.
- Confronto golden Fase 1 e Fase 2 come da §9, eseguito manualmente nel browser al Gate 2 di `/finish-cycle`.

## 12. Documentazione, deploy

Nuovo `docs/api/planning-model.md`; aggiornati `docs/pages/planning.md` (nuovo flusso e correzione), `docs/js/lib.md` e `docs/api/lib.md`, `docs/api/timesheets.md` e `docs/api/projects.md` (invalidazione cache), `CLAUDE.md` (file structure, route, lib), `TEST_CASES.md`. Nessuna migrazione, nessuna nuova variabile d'ambiente. Bump di tutti i `?v=N` dei file toccati (`planning.html` non è versionato; `js/lib/planning-calc.js` sì).

## 13. Rischi e limiti accettati

- **Regressioni sui numeri di Planning:** rischio principale; mitigato dalla cattura golden su un dataset costruito per esercitare i casi limite, e dalla separazione tra Fase 1 e Fase 2.
- **Differenze di bordo (fuso, righe di domenica, ora legale):** dipendono dal fuso del browser e non sono tutte prevedibili leggendo il codice; emergono dal confronto e si decidono caso per caso.
- **Payload:** misurato in Fase 0 prima di committare la forma della risposta.
- **Cache e concorrenza:** scadenza breve e invalidazione best-effort; un evento non intercettato produce al massimo dati vecchi per 30 s.
- **Le incoerenze tra le viste restano** (fuori scope): saranno esplicite nel codice ma non risolte.
