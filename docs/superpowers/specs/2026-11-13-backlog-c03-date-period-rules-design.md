# Backlog ciclo 3 — regole su date e periodi, server e client — design spec

**Date:** 2026-11-13
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-10-backlog-c03-date-period-rules-brief.md`
**Scenario:** 3 (audit → fix)

Le regole di periodo sono applicate in modo diverso fra la `PATCH` di versione e progetto e la `PUT` della structure e dei task: una controlla il restringimento, l'altra tutti i task; una tollera i dati già invalidi, l'altra no. Lato client le funzioni sono copiate fra `costgrid.html` e `project-config.html`. La spec introduce un solo punto per unire e controllare i periodi e lo usa da tutte le route elencate nel Brief. Voci del Brief: B-124, B-132, B-135, B-140, B-141, B-147, B-149, B-151, B-154, B-155, B-156, B-160, B-162, B-167, B-169, B-170, B-224. Il triage era a livello di grep: ogni voce è stata riletta sul codice il 2026-11-13 e risulta ancora presente (B-147 solo in parte, da confermare in esecuzione).

## Comportamento attuale

- `PATCH /api/cost-grids/:id/versions/:vId` controlla il restringimento con `periodShrinkError`, che tollera i task già fuori periodo, sotto il lock di versione, solo se il periodo cambia.
- La structure `PUT` e `PUT /api/projects/:id/tasks` controllano ogni task contro il nuovo periodo e rifiutano anche un task invalido o fuori periodo già salvato (B-132, B-169); copiano la fusione del periodo e il normalizzatore `col` (B-167) e riscrivono il periodo a ogni salvataggio (B-170). La structure `PUT` ripassa i task una seconda volta per PTC e rate override e ripete l'espressione dell'etichetta (B-224) e guarda solo `task_ids` per i task linkati (B-124).
- `PATCH /api/projects/:id` non ha lock né transazione attorno al controllo del periodo (B-151), lo esegue anche a periodo invariato (B-162) e legge due volte la stessa riga (B-135).
- `PATCH /api/projects/:id/phasing`, `/ptc` e `/planning` non guardano il periodo (B-149); `/planning` non ha nemmeno la transazione delle altre due.
- Client: `outOfPeriodMessage`, `periodTaskDates` e `taskDateBounds` sono copiati nelle due pagine, `isTaskOutOfPeriod` richiama `taskPeriodError` a ogni render, `parseDayText` rifiuta forme non ambigue, `cgFmtMonth` restituisce `''` per una data non reale e `cgOutOfPeriodNotice` non distingue il periodo invertito (B-154, B-155, B-156, B-140, B-141, B-160).

## Comportamento atteso

1. **Helper del server** in `api/src/lib/dates.js`, puri e senza I/O:
   - `mergePeriod(body, stored)` e `periodColumn(v)` danno il periodo risultante (un lato assente tiene il salvato, `''` lo svuota) e la sua forma per la colonna; `periodChanged(body, stored)` dice se il periodo cambia davvero.
   - `taskDatesError({ tasks, storedTasks, storedPeriod, nextPeriod, parent })` è l'unica regola sui task: un task identico a uno salvato (stesso nome e stesse date) è *invariato*; se era già fuori dal periodo salvato o invalido è tollerato, se era dentro e il nuovo periodo lo spinge fuori è rifiutato. Un task nuovo o modificato è controllato per intero (periodo, poi ordine delle date). `periodShrinkError` è il caso "tutti i task invariati" e viene rimosso.
   - `monthKeysError(keys, storedPeriod, storedKeys, { what })` rifiuta le chiavi `YYYYMM` fuori dal periodo salvato; una chiave già salvata è tollerata.
2. **Route.** Tutte rispondono `400 { error, code: 'DATE_RULE' }`.
   - `PATCH` di versione: stessi helper, stesso lock.
   - Structure `PUT` e `PUT /tasks`: leggono i task salvati sotto lock e usano `mergePeriod` e `taskDatesError`; l'`UPDATE` del periodo avviene solo se `periodChanged`; un solo passaggio sui task per importi ed etichetta.
   - `PATCH` di progetto: un'unica `SELECT … FOR UPDATE` dentro una transazione che comprende il controllo e l'`UPDATE`, solo quando il periodo cambia.
   - `PATCH` phasing, ptc e planning: `monthKeysError` sotto `FOR UPDATE` (planning prende la transazione); per il PTC si guarda `month` di ogni riga.
   - Structure `PUT`: `missingLinkedTasks` considera anche i nomi in `task_names_direct` (B-124).
3. **Client.**
   - `js/lib/dates.js` ospita `outOfPeriodMessage({ list, start, end, noun })` e un `taskDateBounds` che accetta la data gemella grezza e la converte da sé; le due pagine tengono solo i computed che leggono i propri dati.
   - `isTaskOutOfPeriod` legge la lista `outOfPeriod` già calcolata.
   - `parseDayText` accetta `Dec 1,2025`, `Sept 30, 2025`, `Dec 1st, 2025`, `1 Dec, 2025`.
   - `cgFmtMonth` non lascia un intervallo a una sola estremità.
   - `cgOutOfPeriodNotice` distingue il periodo invertito e non dice di spostare task che non si spostano dall'editor.
   - `dates-guard.test.js` asserisce `pages` non vuoto e pinna `project-config.html`.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`. La verifica avviene su uno stack isolato (`scripts/run-tests.sh`, `scripts/test-branch.sh`).
- Tutto il testo visibile all'utente è in inglese.
- Il client e il server non condividono un catalogo di messaggi: condividono solo `taskPeriodError`.

## Dati

Il 2026-11-13 l'utente ha eliminato dal DB principale i quattro progetti di prova che avevano una riga PTC fuori periodo (backup `backups/pdash-backup-2026-11-13-150258.dump`); dopo la pulizia nessun progetto ha chiavi di phasing, planning o PTC fuori dal proprio periodo.

## Scope escluso

La validazione generica di input (ciclo 2); il motore di reforecast (ciclo 4); le chiavi mese rimaste dopo un restringimento del periodo e il loro peso in `phasingSum` (riga di `docs/BACKLOG.md`); la data legacy non ISO che il client mostra vuota e non sa cancellare (riga di `docs/BACKLOG.md`).

## Criteri di accettazione

1. **Helper del server** — test `node:test` di `mergePeriod`, `periodChanged`, `taskDatesError` e `monthKeysError` con periodo valido, invertito, invalido esistente, restringimento, task invariato e task modificato.
2. **B-132, B-169** — `test-api.js`: un task invalido o fuori periodo già salvato non blocca il salvataggio della structure e di `PUT /tasks`; un task modificato fuori periodo risponde `DATE_RULE`; lo stesso restringimento dà lo stesso esito dalla `PATCH` e dalla `PUT`.
3. **B-149** — `test-api.js`: phasing, ptc e planning con una chiave fuori periodo rispondono `DATE_RULE`; una chiave già salvata fuori periodo è accettata.
4. **B-151, B-162, B-135** — la `PATCH` di progetto fa il controllo e l'`UPDATE` sotto un solo `FOR UPDATE`, con una sola lettura della riga e senza controllo a periodo invariato (test della route; la gara è provata dall'ordine dei lock, non da un test temporizzato).
5. **B-124, B-170, B-224** — un task linkato per solo nome non può sparire dalla structure `PUT`; un salvataggio a periodo invariato non riscrive la riga della versione; i test della structure `PUT` restano verdi.
6. **Client** — test vitest di `outOfPeriodMessage`, di `taskDateBounds` con data gemella grezza, di `parseDayText` sulle quattro forme, di `cgFmtMonth` e di `cgOutOfPeriodNotice` con periodo invertito; nessuna copia delle funzioni condivise rimasta nelle due pagine.
7. **Suite** — `npm test` e i test di `api/` passano, i riferimenti `?v=N` sono allineati.

## Decisioni aperte

1. **Un solo `taskDatesError` per `PATCH` e `PUT`, con "task invariato" riconosciuto per nome e date.** Alternativa scartata: riconoscerlo per id. Perché: i task di progetto non hanno id nel body.
2. **Un task invariato già fuori o invalido è tollerato, uno modificato no.** Alternativa scartata: tollerare solo finché il periodo non cambia. Perché: è la regola del Brief e un salvataggio non si blocca per una riga vecchia.
3. **B-151: transazione con `FOR UPDATE` sulla riga progetto attorno a controllo e `UPDATE`.** Alternativa scartata: un lock advisory. Perché: `PUT /tasks` usa già `FOR UPDATE` sulla stessa riga.
4. **B-149: le chiavi mese già salvate e fuori periodo restano tollerate.** Alternativa scartata: rifiutare ogni scrittura finché non sono pulite. Perché: segue "un periodo invalido esistente è tollerato finché non cambia".
5. **B-124 resta nel ciclo, con il match per titolo sui nomi diretti.** Alternativa scartata: un Brief a sé. Perché: il Brief lo elenca e la correzione sta in `structure-rules.js`, già sul percorso della structure `PUT`.
6. **Il client non condivide i testi dei messaggi con il server, solo `taskPeriodError`.** Alternativa scartata: un catalogo unico. Perché: i testi sono diversi per natura (banner contro rifiuto) e il catalogo sarebbe codice nuovo senza difetto da chiudere.
7. **Fuori ciclo, a righe di backlog: le chiavi rimaste dopo un restringimento e la data legacy non ISO non cancellabile dal client.** Alternativa scartata: correggerle qui. Perché: la seconda richiede un cambio di UI e il DB principale non ha righe di quel tipo.
8. **Dati sporchi di B-149 eliminati prima del ciclo, per scelta dell'utente.** Alternativa scartata: lasciarli e documentarli nel report. Perché: erano progetti di prova senza ore, stato profilo né contributi collegati.
