# Backlog ciclo 3, follow-up — chiusura di B-476 … B-486 — design spec

**Date:** 2026-11-13
**Brief started:** unknown
**Brief:** concordato in chat (skill `feature-brief`, 2026-11-13), non salvato su file; le righe sono in `docs/BACKLOG.md`, il report del ciclo che le ha aperte è `docs/superpowers/reports/2026-11-13-backlog-c03-date-rules-finish-cycle.md`
**Scenario:** 2 (evoluzione)

Il ciclo 3 ha unificato le regole di periodo e ha lasciato undici righe aperte: due decisioni che il Piano aveva mandato fuori ciclo (B-476, B-477) e nove Minor delle due review (B-478 … B-486). La spec le chiude tutte nello stesso ciclo, perché stanno sul codice appena toccato: `monthKeysError`, il confronto dei task invariati, il `PATCH` di progetto e i testi di periodo del client.

## Comportamento attuale

- `monthKeysError` (`api/src/lib/dates.js` linea 203) non impone limiti se un lato del periodo non è un mese, ma tratta come limite valido un periodo con inizio dopo la fine; confronta le chiavi come stringhe senza controllarne il formato (B-478, B-480).
- La structure `PUT` costruisce i nomi del confronto "task invariato" da `taskLabel(tk)` (nome grezzo, anche vuoto), mentre l'`INSERT` salva `(tk.taskName || tk.title || '').trim() || 'New Task'` (`api/src/routes/cost-grids.js` linee 808 e 855); la stessa `PUT` legge i task della versione due volte nella transazione (linee 806 e 825) (B-479, B-482).
- Il `PATCH` di progetto (`api/src/routes/projects.js` linee 221-316) legge la riga senza lock, valida la forma del periodo, e per un body che porta `startDate` o `endDate` apre sempre una transazione con `FOR UPDATE` e valida di nuovo; il frontend rimanda le date a ogni salvataggio, quindi ogni salvataggio prende il lock (B-483, B-484). Nessun test nomina `periodPresent` (B-486).
- `missingLinkedTasks` (`api/src/lib/structure-rules.js` linea 22) tiene un task linkato per id solo con il suo id; nessun test copre un task linkato per id e per nome insieme (B-485).
- `cgOutOfPeriodNotice` (`js/costgrid.js` linee 86-89) riconosce il periodo invalido con una regex sul testo di `taskPeriodError` (B-481).
- Dopo che il periodo di un progetto è ristretto, le chiavi mese di phasing, PTC e planning fuori dal nuovo periodo restano salvate; `phasingSum` e `planningSum` (`project-config.html` linee 718-719) le sommano e `phasingBalance` (linee 640-641) confronta quella somma con il budget distribuito, quindi il form può segnalare uno squilibrio per mesi che la griglia non mostra (B-476).
- Il DB principale non ha task con date non ISO (SELECT in sola lettura del 2026-11-13: `tasks` 0, `project_tasks` 0) e ogni route le rifiuta dal ciclo `dates-c1` (B-477).

## Comportamento atteso

1. **`monthKeysError`:** un periodo salvato con inizio dopo la fine non impone limiti, come un periodo invalido. Una chiave che non è un mese e non è già salvata è rifiutata con `<label> month "<chiave>" is not a valid month (expected YYYYMM).`, `code: 'DATE_RULE'`. Ordine dei controlli: chiave vuota, chiave già salvata, formato, intervallo.
2. **`taskTitle(tk)`** in `api/src/lib/structure-rules.js`: `(tk?.taskName || tk?.title || '').trim() || 'New Task'`. L'`INSERT` dei task, i nomi dei task passati a `taskDatesError` e `payloadTaskNames` usano tutti questa funzione. `taskLabel` resta per i messaggi d'errore.
3. **Structure `PUT`:** una sola `SELECT t.id, t.title, t.start_date, t.end_date` per versione, da cui derivano `storedTasks` e `currentTasks`. Il `PATCH` di versione ha una sola query, in una transazione diversa: non cambia.
4. **`PATCH` di progetto:** la lettura non bloccata decide se il periodo cambia (`periodChanged`). Se non cambia, `start_date` e `end_date` non entrano nell'`UPDATE` e non si prende il lock; un body che resta senza campi da scrivere per questo motivo risponde 200 con `{ id, name }` dalla lettura (404 se la riga non c'è), non "Nothing to update". Se il periodo cambia, o c'è `cgVersionId`, si apre la transazione come oggi e `periodChangeError` gira una sola volta, sotto lock, prima di `taskDatesError`; il controllo anticipato sulla lettura non bloccata sparisce. Un periodo malformato è quindi rifiutato dopo l'apertura della transazione, con lo stesso `400 DATE_RULE`.
5. **`outOfPeriodTasks`** (`js/lib/dates.js`): ogni elemento porta `periodInvalid`, vero quando il periodo non è un mese valido o è invertito. `cgOutOfPeriodNotice` e `outOfPeriodMessage` leggono quel campo; la regex sul testo e il calcolo di validità duplicato in `outOfPeriodMessage` spariscono. Il testo di `taskPeriodError` resta com'è.
6. **`phasingSum` e `planningSum`** di `project-config.html` contano solo i mesi del progetto (`projectMonths`); le chiavi salvate fuori restano e il server continua a tollerarle.
7. **Test:** casi su `missingLinkedTasks` per un task linkato sia per id sia per nome (vince la regola dell'id); un test di route con un client DB finto che controlla le due forme del `PATCH` di progetto (periodo cambiato: `FOR UPDATE` prima dell'`UPDATE`; periodo invariato: nessuna transazione e nessun `start_date` nell'`UPDATE`).
8. **Righe del backlog:** B-477 si chiude "unreachable" con la SELECT; le altre con il comando di verifica eseguito il giorno della chiusura.

## Criteri di accettazione

1. **B-478** — test `node:test` di `monthKeysError` con periodo `202609`–`202607` e una chiave nuova → `null`.
2. **B-480** — test: la chiave `2026-07` e la chiave `zzz` (periodo con un lato vuoto) → errore `is not a valid month`; una chiave già salvata non valida resta tollerata.
3. **B-479** — test unitario di `taskTitle`: `''`, `'  '`, `undefined` → `New Task`, `' A '` → `A`; `grep -n "taskTitle" api/src/routes/cost-grids.js` mostra l'`INSERT`, i nomi di `taskDatesError` e `payloadTaskNames`.
4. **B-482** — `grep -c "FROM tasks t JOIN phases p" api/src/routes/cost-grids.js` scende di uno (da 3 a 2) e `DR-01..DR-08` restano verdi.
5. **B-483, B-484, B-486** — il test di route con client DB finto passa: periodo cambiato → `FOR UPDATE` prima dell'`UPDATE` e una sola chiamata a `periodChangeError` (`grep -c "periodChangeError" api/src/routes/projects.js` → 1 nel `PATCH`); periodo invariato → nessun `BEGIN` e nessun `start_date` nell'`UPDATE`; il test fallisce togliendo il ramo con lock.
6. **B-485** — test di `missingLinkedTasks`: id link più name link sullo stesso task, il task è mancante se il suo id non è nel payload anche se il titolo c'è.
7. **B-481** — test di `outOfPeriodTasks` (`periodInvalid` vero con periodo invertito, falso con periodo valido) e di `cgOutOfPeriodNotice` che non dipende più dal testo (stub con un testo diverso dà lo stesso risultato).
8. **B-476** — test vitest: con `project.phasing` che ha una chiave fuori da `projectMonths`, `phasingSum` non la conta; idem `planningSum`.
9. **B-477** — la riga è chiusa con il comando `docker exec pdash-db psql … SELECT count(*) …` → 0 e `grep -rn "DATE_RULE" api/src/routes/cost-grids.js` come prova che le route rifiutano.
10. **Suite** — `npm test` e `scripts/run-tests.sh` verdi, eseguiti in sequenza; ogni `?v=N` di `js/lib/dates.js` e `js/costgrid.js` è allineato e i guard che li fissano sono aggiornati.

## Escluso

- Le due passate sui task della structure `PUT` di B-224 (restano per scelta del ciclo 3) e la parte di B-160 che chiede un controllo in browser.
- Qualunque pulizia di dati sui database reali e qualunque migrazione.
- Un'interfaccia per ripulire le chiavi mese rimaste fuori dal periodo.
- La normalizzazione in lettura di una data non ISO (`toInputDate`): non c'è alcun caso reale.

## Decisioni aperte

1. **B-483 si risolve togliendo il periodo dall'`UPDATE` quando la lettura non bloccata lo mostra invariato, senza lock.** Alternativa scartata: lock su ogni salvataggio con un periodo, com'è oggi. Perché: ogni salvataggio costerebbe una transazione e un lock di riga, e un salvataggio che non scrive il periodo non può sovrascrivere quello di un altro, quindi la gara di B-151 resta chiusa.
2. **B-476 si risolve nel form, contando solo i mesi del progetto nelle somme.** Alternativa scartata: potare le chiavi fuori periodo al restringimento. Perché: cancellerebbe importi salvati e chiederebbe un passo di interfaccia; il danno visibile è solo la somma.
3. **B-477 si chiude come irraggiungibile, senza codice.** Alternativa scartata: normalizzare `toInputDate` in lettura. Perché: il DB principale non ha righe di quel tipo e ogni route rifiuta di scriverle.
4. **L'errore di formato di una chiave mese è `DATE_RULE`.** Alternativa scartata: un `400` semplice senza codice. Perché: il client e `js/api-sync.js` trattano `DATE_RULE` come rifiuto finale e non lo riprovano.
5. **Un periodo salvato invertito non impone limiti alle chiavi mese.** Alternativa scartata: un messaggio che chiede di correggere prima il periodo, come `taskPeriodError`. Perché: la regola del progetto è che un dato invalido già salvato è tollerato finché non cambia, e un messaggio su una chiave che l'utente non sta toccando sarebbe un blocco in più.
6. **`taskTitle` vive in `structure-rules.js` e non in `dates.js`.** Alternativa scartata: metterlo nel modulo delle date. Perché: è la regola dei nomi dei task della structure, non una regola di data.
7. **Di B-482 si fonde solo la structure `PUT`.** Alternativa scartata: unire anche il `PATCH` di versione. Perché: è un'altra transazione con una sola query; non c'è nulla da condividere.
8. **`periodInvalid` è un campo di ogni elemento di `outOfPeriodTasks`.** Alternativa scartata: una funzione `periodIsValid` separata esposta su `window`. Perché: gli stub dei test esistenti di `costgrid.js` non hanno `window.isMonth` né altre funzioni nuove, e usano già la vera `outOfPeriodTasks`.
9. **B-486 si prova con un test di route con un client DB finto, non con un test temporizzato.** Alternativa scartata: un caso concorrente in `test-api.js`. Perché: il Spec del ciclo 3 escludeva un test temporizzato e il client finto prova l'ordine delle istruzioni in modo deterministico.
10. **Un body fatto solo di date invariate risponde 200 con `{ id, name }` dalla lettura.** Alternativa scartata: una `UPDATE … SET id = id` senza effetto. Perché: tiene la risposta uguale a oggi senza scrivere la riga.
