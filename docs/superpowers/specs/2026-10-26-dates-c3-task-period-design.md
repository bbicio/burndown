# Spec — date, ciclo C3: i task dentro i mesi della proposta o del progetto

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-24-dates-c3-task-period-brief.md` (Scenario 2, evoluzione, item 11).
**Handoff:** `docs/superpowers/briefs/2026-10-26-dates-c3-handoff.md` (stato dopo C2, lezioni di C1/C2).
**Audit:** `docs/superpowers/audits/2026-10-24-dates-form-validation-audit.md`, finding D-04, D-07, D-08, D-11 e la parte "task" di D-12.
**Assorbe:** la frase di B-133 per `DATE_RULE`.
Design concordato in chat il 2026-10-26 (una fermata, §6b).

## 1. Scope

Un task (di proposta o di progetto) sta dentro i mesi del suo genitore. La regola è una sola, nei due gemelli date. Il server la impone su ogni salvataggio dei task, e la UI la rispecchia nei picker. Un task che è già fuori periodo blocca il salvataggio finché non viene corretto (decisione 1 del Brief, scelta dall'utente). La UI deve quindi mostrare sempre il motivo e permettere sempre di correggere.

Il comportamento attuale, con le citazioni, è nel Brief. Fatti emersi nel brainstorming:
- L'autosave di costgrid rimanda la struttura intera a ogni salvataggio (`_cgUpsertVersionToApi`, `js/api-sync.js`). I task di proposta mantengono l'id quando vengono reinseriti; quelli di progetto vengono cancellati e reinseriti tutti.
- "Generate project" dà al progetto il periodo della versione (`js/costgrid.js`, `projStart`/`projEnd`). "Add tasks to project" copia le date in un progetto che ha un periodo suo.
- Le versioni bloccate in UI (`cgGetVersionLockState`: superate da un'altra versione che ha generato un progetto, oppure Committed con tutti i task migrati) sono di sola lettura (`isReadOnly`) e non vengono mai salvate.
- La `PATCH` della versione prende il lock di versione (`withVersionLock`) solo quando cambia la valuta.
- Il 2026-10-26 Docker non era attivo durante il brainstorming. L'ultima misura delle query dell'handoff è `12 44` / `9 28`, dello stesso giorno.

## 2. Comportamento atteso

### 2.1 Regola condivisa (`js/lib/dates.js` e `api/src/lib/dates.js`)

`taskPeriodError(start, end, periodStart, periodEnd, { label, parent })` restituisce `null` oppure un messaggio in inglese. Le date dei task sono giorni (`YYYYMMDD` o ISO), il periodo è in mesi `YYYYMM`.
- Una data del task vuota non viene controllata. Un task senza date passa sempre.
- Un lato del periodo vuoto non pone limiti da quel lato.
- Il limite inferiore è `monthFirstDay(periodStart)`, quello superiore `monthLastDay(periodEnd)`.
- Con un periodo non valido o invertito, un task datato viene rifiutato con un messaggio che chiede di correggere prima il periodo del genitore (`parent`: `version` o `project`).
- Altrimenti il messaggio nomina il task, la data che esce, il lato e il periodo, con date ISO come i messaggi di C1. Esempio: `Task "Kick-off" starts on 2026-03-03, before the version period (2026-04 – 2026-12).`

La funzione sta in tutti e due i gemelli ed entra nella lista `CASES` del test "twins agree" di `js/lib/dates-guard.test.js`.

Per i picker, solo nel browser e in `js/lib/dates.js`:
- `taskDateBounds(periodStart, periodEnd, twin, side)` dà `{ min, max }` in ISO, come intersezione del limite della data gemella e di quello del periodo.
- `periodBounds(tasks, side, twin)` dà i limiti dei picker del periodo (§2.4).

### 2.2 Server: scrittura dei task

- `PUT /api/cost-grids/:id/versions/:vId/structure` legge il periodo salvato della versione. Dopo il controllo d'ordine di C1, se anche un solo task è fuori periodo rifiuta l'intera richiesta con `400 { error, code: 'DATE_RULE' }`, prima della transazione.
- `PUT /api/projects/:id/tasks` fa lo stesso con il periodo salvato del progetto.
- Nessuna tolleranza per i task già salvati fuori periodo: un salvataggio che li contiene viene rifiutato anche se non li modifica.
- Il codice `DATE_RULE` è quello che `js/api-sync.js` già non ritenta come `POST`.

### 2.3 Server: cambio del periodo

La `PATCH` della versione e quella del progetto, quando il periodo cambia rispetto a quello salvato (stessa nozione di `periodChangeError`), rifiutano con `DATE_RULE` solo se un task datato che stava dentro il periodo salvato esce dal nuovo.
- Un periodo rimandato identico non viene mai rifiutato.
- Allargare il periodo passa sempre, anche se qualche task resta fuori.
- Con un periodo salvato non valido o invertito nessun task è "dentro", quindi ogni periodo nuovo valido passa. Esempio: la versione `ce702b4c-…`, `202609` → `202607`.
- Nella versione, lettura dei task, controllo e scrittura girano sotto il lock di versione, che è lo stesso che prende `PUT …/structure`. Nel progetto il controllo legge i `project_tasks` salvati.

### 2.4 UI: picker

In costgrid (task `aria-label="Task start date"`/`"Task end date"`, periodo `onPeriodChange`) e in project-config (stessi aria-label, periodo mese del progetto):
- **Task:** `:min`/`:max` vengono da `taskDateBounds`. Click e digitazione fuori dal periodo sono rifiutati con i testi già prodotti da `parseDateInput` (`Must be on or after …` / `Must be on or before …`).
- **Periodo:** lo Start non può superare il mese della prima data di inizio tra i task, l'End non può stare prima del mese dell'ultima data di fine. Questo si somma all'ordine Start ≤ End già presente. Su una proposta con un task già fuori, il picker permette solo di allargare il periodo verso quel task.
- Solo binding calcolati: nessun listener e nessun watcher in più per task (B-144).

### 2.5 UI: dati fuori periodo visibili

- Ogni task fuori periodo mostra sotto le sue date `Outside the proposal period` (costgrid) oppure `Outside the project period` (project-config).
- costgrid: un banner in cima all'editor, visibile solo se c'è almeno un task fuori periodo e la versione non è di sola lettura:
  `N tasks are outside the proposal period (Apr 2026 – Dec 2026). Changes to this version are not saved until they are moved inside it or the period is widened.`
  Con un periodo invertito il banner chiede invece di correggere il periodo.
- project-config: lo stesso avviso vicino al pulsante Save, con "project period".
- `notifyRefusal` (`js/api-sync.js`): per un rifiuto `DATE_RULE` la seconda frase diventa `Your changes to this version are not being saved until this is fixed.`; la frase "reload the page to see its current structure" resta solo per `STRUCTURE_RULE`.

### 2.6 Copia dei task in un progetto

"Add tasks to project" (`cgDoAddTasksToProject`) e "Generate project" (`cgDoGenerateProject`) controllano sul client, prima di qualsiasi scrittura, i task scelti contro il periodo del progetto di destinazione. Per "Generate" è il periodo che verrebbe creato. Se un task è fuori, mostrano con `showInfo` l'elenco dei task e il periodo, e non scrivono nulla: niente progetto locale, nessuna voce in `linkedProjects`, nessuna chiamata API.

### 2.7 Distribuzioni

- `phasingByMonth` (`costgrid.html`) calcola anche ore e importo che cadono fuori dai mesi del periodo. Se sono maggiori di zero, sotto la Monthly Phasing compare `X h · €Y fall outside the proposal period and are not phased.` (importo con `formatMoney` nella valuta della versione). Totale del periodo più parte fuori = totale delle ore e degli importi dei task.
- `deriveDistribution` (`js/lib/config-form-calc.js`) restituisce anche `outsideBudget` e `outsideHours`, la parte dei task che cade fuori dai mesi del progetto. Se sono maggiori di zero, la conferma di `derivePhasing` in `project-config.html` aggiunge una riga che le dichiara.

### 2.8 Test e verifica

- `test-api.js`: rifiuto dei due `PUT` con un task fuori periodo; un task senza date accettato; restringimento rifiutato, allargamento accettato, periodo identico accettato; periodo invertito correggibile. I casi di progetto girano come sysadmin.
- Vitest: `taskPeriodError` nei `CASES` dei gemelli; `taskDateBounds` e `periodBounds`; la parte fuori periodo di `deriveDistribution`; guard di pagina per i binding `:min`/`:max` dei picker dei task nelle due pagine.
- Per ogni file versionato toccato, il Piano elenca anche i guard che ne pinnano il `?v=` (`grep -rln "<file>?v=" js/lib scripts`) e li mette tra i test del task.
- Verifica visiva con `scripts/shoot.mjs` contro il branch stack (`--base http://localhost:8081 --settle 3000`), PNG riletti. costgrid con un task fuori periodo: banner, avviso sul task e riga della Monthly Phasing. project-config con un task fuori periodo: avviso sul task e vicino a Save.

## 3. File toccati

`js/lib/dates.js`, `api/src/lib/dates.js`, `js/lib/dates-guard.test.js`, `js/lib/dates.test.js`, `api/src/routes/cost-grids.js`, `api/src/routes/projects.js`, `test-api.js`, `costgrid.html`, `project-config.html`, `js/costgrid.js`, `js/api-sync.js`, `js/lib/config-form-calc.js` e i suoi test, `TEST_CASES.md`, più i `?v=N` di ogni file versionato toccato.

## 4. Scope escluso

- Chiavi mese fuori periodo nelle `PATCH` phasing, planning e PTC, e le chiavi rimaste in `phasingSum` dopo un restringimento: B-149.
- Una correzione dei dati esistenti: nessuna migrazione.
- Le versioni bloccate in UI restano di sola lettura, compresi i loro task fuori periodo.
- B-130, B-134, B-136, B-138, B-141 e B-144, e la seconda metà di B-133 (il salvataggio della struttura saltato dopo un rifiuto della `PATCH`).
- Il modulo date e i controlli di formato e ordine (C1), il controllo dei form e il formato digitato (C2), il codice morto di costgrid, il `PUT /tasks` non transazionale.

## Criteri di accettazione

1. **Rifiuto dei task fuori periodo** — `test-api.js`: `PUT …/structure` e `PUT /api/projects/:id/tasks` con un task fuori dal periodo del genitore rispondono `400` con `code: 'DATE_RULE'` e non scrivono nulla; con un task senza date rispondono `200`.
2. **Cambio del periodo** — `test-api.js`: una `PATCH` che restringe il periodo lasciando fuori un task che stava dentro risponde `400 DATE_RULE`; una che lo allarga, o che lo rimanda identico, risponde `200`; un periodo invertito salvato si corregge con una `PATCH` valida.
3. **Gemelli** — il test "twins agree" di `js/lib/dates-guard.test.js` copre `taskPeriodError` e passa.
4. **Picker** — un test vitest prova che i limiti di `taskDateBounds` stanno dentro il periodo e dentro la data gemella, e un guard prova che i picker dei task di costgrid e project-config li usano. A mano: in costgrid, con il periodo `Apr 2026 – Dec 2026`, nel calendario del task i giorni di marzo 2026 sono disabilitati e digitare `Mar 3, 2026` mostra `Must be on or after Apr 1, 2026.`
5. **Distribuzione** — un test vitest prova che con un task a metà fuori dal periodo `deriveDistribution` dà periodo più `outsideBudget` uguale al budget del task. A mano: in costgrid la riga `… fall outside the proposal period …` compare sotto la Monthly Phasing.
6. **Avvisi** — a mano: in costgrid, aprendo una proposta con un task fuori periodo, compaiono il banner e l'avviso sul task; un autosave rifiutato mostra la frase `DATE_RULE` di §2.5 e non "reload the page".
7. **Copia nel progetto** — a mano: "Add tasks to project" verso un progetto il cui periodo non contiene il task mostra l'elenco e non cambia né il progetto né `linkedProjects`.
8. **Dati esistenti** — dopo il merge, le due query dell'handoff rieseguite sullo stack principale danno un conteggio fuori periodo non superiore a `12` e `9`.
9. **Verifica visiva** — i PNG di §2.8 sono stati riletti e gli scostamenti presentati uno per uno.
10. **Suite** — `npm test` e `scripts/run-tests.sh` passano.

## Decisioni aperte

1. **Regola nei due gemelli date, server autorevole e UI speculare.** Alternativa scartata: solo il server, oppure solo la UI. Perché: con il solo server l'utente scopre il rifiuto dopo l'autosave, con la sola UI l'API resta aperta; è il modello di C1.
2. **Blocco senza tolleranza dei salvataggi che contengono un task fuori periodo (scelta dell'utente).** Alternativa scartata: tollerare i task esistenti finché non cambiano. Perché: decisione 1 del Brief, resa praticabile dal banner e dai picker del periodo che si possono solo allargare.
3. **Restringimento del periodo rifiutato in modo monotono, solo se un task che era dentro esce.** Alternativa scartata: rifiutare ogni periodo che non contiene tutti i task. Perché: la versione invertita e ogni allargamento parziale resterebbero senza uscita.
4. **Le versioni bloccate in UI restano di sola lettura, e il criterio 8 chiede un conteggio non superiore a 12/9 invece di zero.** Alternativa scartata: aprirle alla correzione oppure scrivere una migrazione. Perché: l'utente ha scelto il blocco, non la correzione dei dati.
5. **Task senza date ammessi; con una sola data si controlla quella.** Alternativa scartata: obbligare entrambe le date. Perché: oggi ricadono sul periodo e non perdono nulla.
6. **"Add tasks" e "Generate" rifiutati prima, sul client, con l'elenco dei task.** Alternativa scartata: adattare le date al nuovo periodo, oppure lasciar decidere il server. Perché: niente scritture parziali e niente dati cambiati senza che l'utente lo sappia.
7. **La parte fuori periodo come riga sotto la Monthly Phasing.** Alternativa scartata: una colonna `Outside`. Perché: chiude la somma senza ridisegnare la tabella.
8. **Chiavi mese di phasing, planning e PTC fuori dal ciclo (B-149).** Alternativa scartata: includerle in C3. Perché: sono un'altra scrittura e un altro modello dati.
9. **Dentro il ciclo solo la frase di B-133 per `DATE_RULE`.** Alternativa scartata: lasciarla fuori come gli altri follow-up vicini. Perché: col blocco diventa il messaggio che l'utente vede più spesso, e oggi gli consiglia un ricaricamento che non serve.
