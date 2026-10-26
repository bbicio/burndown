# Brief — date, ciclo C4: salvataggi e messaggi dopo la regola del periodo

**Tipo:** evoluzione (Scenario 2), confermato dall'utente il 2026-10-26.
**Brief started:** 2026-10-26 17:40
**Origine:** handoff `docs/superpowers/briefs/2026-10-26-dates-c4-handoff.md`; righe B-150, B-159, B-128, B-131, B-157, B-158, B-161, B-130, B-136, B-138 di `docs/BACKLOG.md`. Non nasce dall'audit `docs/superpowers/audits/2026-10-24-dates-form-validation-audit.md`.
**Dipende da:** C1 (`50790e2`), C2 (`26a395b`), C3 (`e2b0bd9`).

## Problema

C3 ha reso bloccante la regola del periodo. Il server controlla il periodo nuovo contro i task **salvati** e i task nuovi contro il periodo **salvato**, mentre il client manda periodo e task in due richieste separate: l'ordine delle scritture decide se un salvataggio legittimo passa. Attorno a questo, i messaggi all'utente sono incompleti o inesatti.

## Comportamento attuale

Verificato sul codice il 2026-10-26; i `Verified how` delle righe di BACKLOG rieseguiti e tornati uguali.

- **Server — `PATCH` della versione:** `periodShrinkError` contro i task salvati, sotto `withVersionLock` (`api/src/routes/cost-grids.js` line 484). **`PUT …/structure`:** `taskPeriodError` contro il periodo salvato, dopo `lockVersion` nella transazione (`api/src/routes/cost-grids.js` line 723, line 727).
- **Server — `PATCH` del progetto:** `periodShrinkError` contro i `project_tasks` salvati, senza lock (`api/src/routes/projects.js` line 230). **`PUT /api/projects/:id/tasks`:** `taskPeriodError` contro il periodo salvato, non transazionale (`api/src/routes/projects.js` line 434).
- **Regola pura:** `periodShrinkError` salta i task già fuori dal periodo salvato e rifiuta solo quelli che il periodo nuovo farebbe uscire (`api/src/lib/dates.js` line 140).
- **Scritture della versione** (`_cgUpsertVersionToApi`, `js/api-sync.js` line 157): nome → `PATCH` versione → struttura (solo se `phases` non è vuoto) → un solo ritentativo della `PATCH` se era stata rifiutata con `DATE_RULE` **e** la struttura è stata salvata (`js/api-sync.js` line 227). Copre "task verso l'interno + restringimento", non lo **spostamento** del periodo con un task portato nella parte nuova (B-150).
- **Flush strict** (`+ New version` `js/costgrid.js` line 817, Clone `js/costgrid.js` line 958): con `strict`, il primo rifiuto della `PATCH` lancia (`js/api-sync.js` line 203) prima della struttura e del ritentativo (B-159).
- **Avvisi di rifiuto:** `_cgRuleNotified` è un solo `Set` per id di versione, condiviso da `STRUCTURE_RULE` e `DATE_RULE`, mai svuotato (`js/api-sync.js` line 156, line 167, line 168): dopo il primo avviso, ogni altro rifiuto della stessa versione nella stessa pagina non mostra nulla (B-128, B-131).
- **Scritture del progetto** (`_pushProjectToApiDetailed`, `js/api-sync.js` line 283): prima la `PATCH` (`js/api-sync.js` line 298), poi tasks, phasing, PTC, planning, gruppi (`js/api-sync.js` line 326). Un rifiuto `DATE_RULE`/`PROJECT_RULE` della `PATCH` ritorna subito con il solo `part: 'project'`: in `project-config.html` un Save che sposta un task dentro e restringe il periodo è rifiutato e i task non partono (B-150). Il messaggio di `summarizePushResult` dice solo che i dettagli del progetto non sono stati salvati, non che le sezioni non sono state tentate (`js/lib/project-push-result.js` line 16, B-138).
- **Testo del banner:** `costgrid.html` (line 1068) e `project-config.html` (line 478) dicono "Changes to this version/project are not saved until …", ma è rifiutata solo la scrittura di struttura/task; intestazione, stage, phasing e gruppi si salvano (B-161). Il testo è quello della Spec di C3 §2.5.
- **Stato provvisorio inizio > fine:** `taskDateBounds` non restringe più il picker con una data gemella fuori periodo (`js/lib/dates.js` line 119), quindi spostare solo l'inizio di un task tutto fuori lascia inizio > fine e l'autosave mostra l'errore d'ordine di C1 (B-157). In `project-config.html` ogni cambio di data chiama `rebuildTaskDist` (line 147, line 149), che con un intervallo vuoto sostituisce `monthlyDistribution` con `{}`; tornare alla data di prima non la recupera (B-158).
- **Generate / Add tasks:** con periodo della versione invertito e nessun task selezionato datato, `cgGenerationRefusal` (`js/costgrid.js` line 1279) non rifiuta; il `POST` del progetto è rifiutato con `DATE_RULE`, l'utente vede il messaggio generico e restano un progetto locale e una voce `linkedProjects` in bozza (B-130). Un rifiuto `DATE_RULE` del `PUT` dei task non dovuto al periodo è inghiottito da `_pushProjectToApi` (`js/costgrid.js` line 1131), e `linkedProjects` registra i task come assegnati (B-136).
- **Dati sullo stack principale:** le due query di sola lettura dell'handoff danno ancora `12 44` e `9 28` (rieseguite il 2026-10-26).

## Comportamento atteso

1. **Un solo Save (o autosave) che cambia insieme periodo e date dei task passa** quando lo stato finale rispetta la regola, in tutte le combinazioni: restringere, allargare, spostare il periodo; in costgrid con e senza struttura caricata; autosave normale e flush strict (`+ New version`, Clone); in `project-config.html` con il Save.
2. **Lo stato finale è l'unico giudicato**: un Save il cui stato finale viola la regola è rifiutato, con il messaggio del periodo.
3. **Ogni rifiuto che l'utente non ha ancora visto mostra il suo avviso**: un secondo rifiuto della stessa versione dopo un ricaricamento della struttura, o con un codice diverso dal primo, non resta muto (B-128, B-131).
4. **Il banner e l'avviso dicono cosa non viene salvato** (struttura/task) e non affermano che il resto non si salva (B-161). Il testo esatto lo fissa la Spec.
5. **Dopo un rifiuto della `PATCH` di progetto, il messaggio dice quali sezioni non sono state tentate** (B-138).
6. **Uno stato provvisorio inizio > fine** non fa perdere la distribuzione mensile del task in `project-config.html` (B-158) e non lascia l'utente con un messaggio che non corrisponde alla causa (B-157).
7. **Generate da una versione con periodo invertito** è rifiutato prima di ogni scrittura, con il motivo, senza lasciare né progetto locale né voce `linkedProjects` (B-130).
8. **Un rifiuto `DATE_RULE` del `PUT` dei task** in "Add tasks to project" e Generate è mostrato all'utente e non registra i task come assegnati (B-136).

## Vincoli

- Le regole pure restano in `api/src/lib/dates.js` e `js/lib/dates.js`, con la stessa definizione sui due lati; rifiuto `400 { error, code: 'DATE_RULE' }`.
- Un rifiuto `DATE_RULE` o `PROJECT_RULE` non viene mai ritentato come `POST` (CLAUDE.md, "Dates" e "Project currency lock").
- La serializzazione per versione (`api/src/lib/version-lock.js`) resta: cambio valuta e link continuano a passarci.
- Un'eventuale modifica della forma dell'API resta compatibile con gli altri chiamanti di `PATCH` versione/progetto e dei `PUT` di struttura/task (`js/costgrid.js`, `test-api.js`).
- Le funzioni nuove di `js/lib/` usate da una pagina hanno il bridge `window.`; `?v=N` aggiornato in ogni riferimento di ogni file versionato toccato, e i guard che li controllano cercati per nome di file, non per `?v=` (lezione 1 dell'handoff).
- Testo utente in inglese. Ciclo con `api/` se la strada scelta tocca il server: Gate 1 lancia `scripts/run-tests.sh`, al merge riavvio di `api` solo nella deroga del Gate 4 step 7.
- I dati esistenti fuori periodo non si correggono in questo ciclo.

## Criteri di accettazione

1. Il Piano contiene la tabella delle combinazioni dell'atteso 1 (restringere / allargare / spostare × struttura caricata o no × autosave normale / strict, più il Save di `project-config.html`): per ognuna, quali richieste partono, in che ordine, e cosa vede l'utente.
2. Un test automatico per ogni riga di quella tabella verifica che lo stato finale valido sia salvato in un solo Save e che lo stato finale invalido sia rifiutato con `DATE_RULE` (vitest per l'ordine lato client, `test-api.js` per il server se la strada lo tocca).
3. `+ New version` e Clone dopo una modifica combinata spostamento+restringimento entro il debounce creano la versione con lo stato modificato (B-159).
4. Un test vitest: dopo un avviso `DATE_RULE`, un rifiuto `STRUCTURE_RULE` della stessa versione mostra un avviso; dopo un ricaricamento della struttura, un nuovo rifiuto dello stesso codice mostra un avviso (B-128, B-131).
5. Il testo del banner di `costgrid.html` e di `project-config.html` non contiene più "Changes to this version are not saved" / "Changes to this project are not saved" e nomina la struttura/i task (B-161).
6. Un test su `summarizePushResult`: con il solo `part: 'project'` rifiutato, il messaggio nomina le sezioni non tentate (B-138).
7. Un test su `project-config.html` (o sulla funzione estratta): portare l'inizio dopo la fine e poi tornare alla data di prima restituisce la `monthlyDistribution` iniziale (B-158); un test stabilisce quale messaggio vede l'utente con inizio > fine, secondo la decisione della Spec (B-157).
8. Un test: Generate da una versione con periodo invertito e nessun task datato non chiama `POST /api/projects`, mostra il motivo e non modifica `config.projects` né `linkedProjects` (B-130).
9. Un test: un rifiuto `DATE_RULE` del `PUT` dei task in "Add tasks to project" mostra un avviso e lascia `linkedProjects` invariato (B-136).
10. Ogni task che cambia un comportamento di salvataggio o di picker è verificato anche con `scripts/shoot.mjs --eval-file` contro il branch stack, annotando i record toccati (lezione 3 dell'handoff).
11. Dopo il ciclo, le due query dell'handoff danno ancora `12 44` e `9 28` sullo stack principale (nessun dato corretto per effetto collaterale).

## Scope escluso esplicitamente

Confermato dall'utente il 2026-10-26.

- **B-132** (data di task salvata invalida o invertita che blocca ogni salvataggio).
- **B-149** (chiavi mese di phasing, PTC e planning), **B-151** (corsa tra `PATCH` e `PUT /tasks` del progetto), **B-152**, **B-154**, **B-155**, **B-156**, **B-160**, **B-162**.
- Tutto il controllo data (listener, larghezze, formati digitati): ciclo C5.
- La correzione dei task già salvati fuori periodo.

## Domande aperte per il `/brainstorming`

1. **La strada per l'atteso 1** (dall'handoff, non decisa qui): (a) ordine delle scritture deciso dal client — restringere: task poi periodo; allargare: periodo poi task; spostare: allargare all'unione, task, poi restringere — senza cambi al server ma con più richieste e uno stato intermedio salvato; (b) una sola scrittura atomica di periodo e task, controllati nella stessa transazione; (c) `PATCH` tollerante sul restringimento quando il body porta anche i task nuovi (variante di b).
2. Con la strada (a): cosa succede se una richiesta intermedia fallisce, e cosa resta salvato.
3. Con le strade (b)/(c): come convive con l'autosave a sezioni di costgrid (struttura salvata solo se caricata) e con le altre sezioni del progetto; serve un lock anche sulla `PATCH` di progetto.
4. **B-157:** impedire inizio > fine nel picker, oppure mostrare il messaggio del periodo invece di quello d'ordine.
5. **B-128/B-131:** quando un avviso già mostrato torna a essere mostrabile (ricaricamento della struttura, Save riuscito, cambio di codice, cambio del messaggio del server).
6. **B-138:** se le sezioni del progetto vanno tentate anche dopo un rifiuto della `PATCH` (cambia `_pushProjectToApiDetailed`) o solo nominate nel messaggio.
7. **Classe di rischio:** l'handoff propone `high-risk`; da confermare nel Piano.

## Guardia sui finding nuovi

Un difetto nuovo trovato durante il `/brainstorming` o l'esecuzione non si corregge in C4: va in `docs/BACKLOG.md` o in un Brief a sé (PROCESS.md, Scenario 3).
