# Handoff — date, ciclo C4: salvataggi e messaggi dopo la regola del periodo (dopo C3)

C1, C2 e C3 sono chiusi e mergiati:
- **C1** (regola condivisa, validazione server): merge `50790e2`, report `docs/superpowers/reports/2026-10-24-dates-c1-shared-rule-finish-cycle.md`.
- **C2** (un solo datepicker, formato `Dec 1, 2025`): merge `26a395b`, report `docs/superpowers/reports/2026-10-26-dates-c2-datepickers-finish-cycle.md`.
- **C3** (i task dentro il periodo): merge `e2b0bd9`, report `docs/superpowers/reports/2026-10-26-dates-c3-task-period-finish-cycle.md`.

C4 **non ha ancora un Brief**: non nasce dall'audit `docs/superpowers/audits/2026-10-24-dates-form-validation-audit.md`, ma dai follow-up di C1-C3 in `docs/BACKLOG.md`. È un'evoluzione (Scenario 2): il prossimo passo è `/feature-brief` su questo handoff, poi `/brainstorming`. Il controllo data in sé (listener, larghezze, formati digitati) è un ciclo diverso, C5, e non va mischiato qui.

## Il problema in una frase

C3 ha reso la regola del periodo bloccante, e da quel momento l'**ordine delle scritture** del client decide se un salvataggio legittimo passa: il server controlla il periodo nuovo contro i task **salvati** e i task nuovi contro il periodo **salvato**, mentre il client manda le due cose in due richieste separate.

## Righe di `docs/BACKLOG.md` candidate per C4

Rileggerle prima del Brief e rieseguire il loro `Verified how`: le descrizioni sono quelle del 2026-10-26.
- **B-150** (la principale): in `project-config.html` un solo Save che sposta un task dentro e restringe il periodo viene rifiutato e i task non partono; in costgrid lo stesso succede quando il periodo viene **spostato** (un lato allargato, l'altro ristretto) insieme a un task. Il ritentativo aggiunto in C3 copre solo "task verso l'interno + restringimento".
- **B-159**: il flush strict di `+ New version` e Clone lancia al primo rifiuto `DATE_RULE` della `PATCH`, prima del salvataggio della struttura e del ritentativo.
- **B-128** e **B-131**: `_cgRuleNotified` non si azzera mai ed è uno solo per `STRUCTURE_RULE` e `DATE_RULE`, quindi il secondo rifiuto sulla stessa versione non mostra nulla. Con C3 succede più spesso.
- **B-157** e **B-158**: uno stato provvisorio con inizio dopo la fine. In costgrid l'autosave mostra l'errore d'ordine di C1 invece di quello del periodo; in project-config `rebuildTaskDist` azzera la distribuzione mensile del task.
- **B-161**: banner e avviso dicono "Changes … are not saved", ma viene rifiutata solo la scrittura dei task; intestazione, stage, phasing e gruppi si salvano. Il testo è quello della Spec di C3 (§2.5), quindi cambiarlo è una decisione del Brief, non una correzione.
- **B-130** e **B-136**, nella forma ridotta da C3: Generate da una versione con periodo invertito e nessun task datato; un rifiuto `DATE_RULE` del `PUT` dei task per un motivo diverso dal periodo, ancora ignorato da `_pushProjectToApi`.
- Vicine, da decidere se entrano: **B-138** (dopo un rifiuto della `PATCH` di progetto il messaggio non dice che task, phasing, PTC, planning e gruppi non sono stati tentati) e **B-132** (una data di task salvata invalida o invertita blocca ogni salvataggio).

Fuori da C4: B-149 (chiavi mese di phasing, PTC e planning: altro modello dati), B-151 (corsa tra `PATCH` e `PUT /tasks` del progetto), B-152, B-154..B-156, B-160, B-162, e tutto il controllo data (C5).

## Dove sta il codice oggi

Si trova con grep: i numeri di riga cambiano.
- **Scritture della versione**: `_cgUpsertVersionToApi` in `js/api-sync.js` — nome della griglia, `PATCH` della versione, struttura (solo se caricata), un ritentativo della `PATCH` dopo un rifiuto `DATE_RULE` seguito da una struttura salvata. Le chiamano `cgAutoSave(strict)` e `cgScheduleAutoSave()` in `js/costgrid.js`.
- **Scritture del progetto**: `_pushProjectToApiDetailed` in `js/api-sync.js` — prima la `PATCH` del progetto, poi le sezioni (`tasks`, phasing, PTC, planning, gruppi); se la `PATCH` fallisce, le sezioni non vengono tentate. Il riassunto per l'utente è `summarizePushResult` in `js/lib/project-push-result.js`.
- **Server**: `periodShrinkError` nella `PATCH` di versione (`api/src/routes/cost-grids.js`, sotto `withVersionLock`) e di progetto (`api/src/routes/projects.js`, senza lock); `taskPeriodError` in `PUT …/structure` (dentro la transazione, dopo `lockVersion`) e in `PUT /api/projects/:id/tasks` (non transazionale).
- **Regole pure**: `taskPeriodError`/`periodShrinkError` in `api/src/lib/dates.js`, gemelli e helper dei picker in `js/lib/dates.js`. `docs/api/lib.md` e `docs/js/lib.md` li descrivono.

## La domanda di design che il Brief deve porre

Non va decisa qui. Le strade viste durante C3:
1. **Ordine delle scritture deciso dal client**: restringere → prima i task poi il periodo; allargare → prima il periodo; spostare → allargare all'unione, salvare i task, poi restringere. Nessun cambio al server, ma tre richieste per un solo Save e uno stato intermedio salvato.
2. **Una sola scrittura atomica**: periodo e task nella stessa richiesta, controllati insieme nella stessa transazione. Pulito per il server, ma tocca la forma dell'API e l'idea di autosave a sezioni.
3. **Server tollerante sul cambio di periodo**: la `PATCH` accetta il restringimento se il body porta anche i task nuovi. È una variante di 2.

La scelta decide anche B-159 (il flush strict) e quanto di B-138 entra.

## Dati esistenti: rimisurarli, non citarli

Dopo il merge di C3 le due query qui sotto davano ancora `12 44` e `9 28` sullo stack principale. Sono di sola lettura:

```bash
docker exec pdash-db psql -U pdash -d pdash -At -F' ' -c "select count(*) filter (where (nullif(t.start_date,'') is not null and left(replace(t.start_date,'-',''),6) < v.start_date) or (nullif(t.end_date,'') is not null and left(replace(t.end_date,'-',''),6) > v.end_date)), count(*) from tasks t join phases ph on ph.id=t.phase_id join cost_grid_versions v on v.id=ph.version_id;"
docker exec pdash-db psql -U pdash -d pdash -At -F' ' -c "select count(*) filter (where (nullif(trim(t.start_date),'') is not null and left(t.start_date,6) < p.start_date) or (nullif(trim(t.end_date),'') is not null and left(t.end_date,6) > p.end_date)), count(*) from project_tasks t join projects p on p.id=t.project_id;"
```

Sul branch stack, per le prove: la proposta `ddf602ac-97d5-4180-8903-5b1334b59f14` / versione `fdf9b203-1ea7-4088-ac80-556bca2e09e2` e i progetti `f6541ba7-…`, `79a30504-…`, `c8efdf5e-…` hanno periodo Sep–Dec 2026 e task Jan–Mar 2026. Il branch stack clona il main, ma ogni prova ne cambia i dati: annotare quali record sono stati toccati.

## Lezioni di C3 da portare nel Piano

1. **Il grep dei guard nel Piano di C3 non trovava nulla.** I guard scrivono il path come regex escapata (`costgrid\.js\?v=`), quindi `grep -rln "costgrid.js?v=" js/lib scripts` non li vede. Nel Piano, per ogni file versionato, cercare il nome senza `?v=` (`grep -rln "costgrid" js/lib/*guard*.test.js`) e leggere i match.
2. **Il Gate 1 è stato rosso per un guard che i task non avevano lanciato**: `js/lib/costgrid-viewer-guard.test.js` vieta `!isLocked` in un `v-if`. Ogni task che tocca `costgrid.html` lancia tutti i `js/lib/costgrid*guard*.test.js`, e ogni task su `project-config.html` i suoi.
3. **Un difetto d'interazione l'ha trovato solo l'utente al Gate 2** (il picker dell'inizio tutto disabilitato quando il task stava fuori dal periodo). `scripts/shoot.mjs --eval-file` sa scrivere nei campi e premere Enter: la verifica di ogni task che cambia un comportamento di salvataggio o di picker la usa contro il branch stack, già nel task.
4. **Il Gate 3 ha avuto tre round, quasi tutti sullo stesso meccanismo**: l'ordine delle scritture in `js/api-sync.js`. È il cuore di C4: il Piano deve elencare, per ogni combinazione (restringere, allargare, spostare; con e senza struttura caricata; autosave normale e strict), cosa parte, in che ordine e cosa vede l'utente, e i test devono coprirle una per una.
5. **Le funzioni nuove di `js/lib/` usate da una pagina vogliono il bridge `window.`**: in C3 il Task 1 li aveva dimenticati e la review del task non se n'è accorta.
6. **Gli id dei test vanno controllati prima**: i `TP-01..06` previsti dal Piano di C3 collidevano con quelli dei Topics. `grep -n "<prefisso>-0" test-api.js TEST_CASES.md` prima di sceglierli.
7. **Una review in background può morire** (in C3 su un limite d'uso): vale "non revisionata" e va rilanciata.
8. **Classe di rischio**: proposta `high-risk` (file condivisi caricati da più pagine, regole server sulle scritture), da confermare nel Piano. Ciclo con `api/` se la strada scelta tocca il server: Gate 1 lancia `scripts/run-tests.sh`, al merge serve il riavvio di `api`.

## Guardia sui finding nuovi

Un difetto nuovo trovato durante il Brief, il brainstorming o l'esecuzione non si corregge in C4: va in `docs/BACKLOG.md` o in un Brief a sé.
