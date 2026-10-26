# Handoff — date, ciclo C3: i task dentro il periodo (dopo C2)

C1 e C2 sono chiusi e mergiati:
- **C1** (regola condivisa, validazione server): merge `50790e2`, report `docs/superpowers/reports/2026-10-24-dates-c1-shared-rule-finish-cycle.md`.
- **C2** (un solo datepicker, formato `Dec 1, 2025`): merge `26a395b`, report `docs/superpowers/reports/2026-10-26-dates-c2-datepickers-finish-cycle.md`.

C3 parte dal Brief già committato, `docs/superpowers/briefs/2026-10-24-dates-c3-task-period-brief.md` (Scenario 2, item 11, audit D-04/D-07/D-08/D-11/D-12). Il prossimo passo è `/brainstorming` su quel Brief. `/feature-brief` non va rifatto. Questo handoff aggiunge solo quello che il Brief non poteva sapere: lo stato dopo C2 e le lezioni dei due cicli.

## Cosa C1 e C2 lasciano a disposizione

- **Browser, `js/lib/dates.js`**: `monthFirstDay(ym)`, `monthLastDay(ym)`, `isWithin(value, min, max)`, `isOrdered`, `periodError`, `toIso`/`toYmd`, `parseDateInput`. Il confronto tra un mese `YYYYMM` e un giorno passa da `monthFirstDay`/`monthLastDay`.
- **Server, `api/src/lib/dates.js`**: `monthFirstDay`, `monthLastDay`, `periodError`, `periodChangeError`, `DATE_RULE`. Non esporta `isWithin`, ed è voluto: `js/lib/dates-guard.test.js` controlla che il server non esporti le funzioni solo-browser. Se C3 aggiunge una funzione condivisa ("task dentro il periodo"), deve stare nei due gemelli e va aggiunta alla lista `CASES` del test "twins agree" in `js/lib/dates-guard.test.js`.
- **Picker dei task**: tutti sono `<cg-date-picker mode="day">` con `:min`/`:max` limitati solo dalla data gemella. La regola di C3 si innesta stringendo quei limiti.
  - costgrid: `grep -n 'aria-label="Task start date"\|aria-label="Task end date"' costgrid.html`, valori ISO in `task.taskStartDate`/`taskEndDate`.
  - project-config: stesso grep su `project-config.html`. Valori `YYYYMMDD` passati come `toIso(x) || ''`; uno svuotato va salvato come `''`.
  - `parseDateInput` mostra già sotto il campo `Must be on or after <min>.` / `… before <max>.`. Per un limite che viene dal periodo, i testi non vanno inventati da capo.
- **Periodo della versione e del progetto**: picker mese, `YYYYMM`. In costgrid i cambi passano da `onPeriodChange` (`grep -n onPeriodChange costgrid.html`).
- **Distribuzioni** (D-08/D-11): `phasingByMonth` in `costgrid.html`, `deriveDistribution` in `js/lib/config-form-calc.js` (chiamata da `project-config.html`), `phasingSum` in `project-config.html`. Si trovano con grep, i numeri di riga del Brief sono cambiati dopo C2.

## Dati esistenti: rimisurarli, non citarli

Il Brief dice 12 task di cost grid su 44 e 9 task di progetto su 28 fuori periodo. Il 2026-10-26, prima di questo handoff, le due query qui sotto hanno dato ancora `12 44` e `9 28` sullo stack principale. Sono di sola lettura e vanno rieseguite all'inizio del brainstorming e alla verifica del criterio 4:

```bash
docker exec pdash-db psql -U pdash -d pdash -At -F' ' -c "select count(*) filter (where (nullif(t.start_date,'') is not null and left(replace(t.start_date,'-',''),6) < v.start_date) or (nullif(t.end_date,'') is not null and left(replace(t.end_date,'-',''),6) > v.end_date)), count(*) from tasks t join phases ph on ph.id=t.phase_id join cost_grid_versions v on v.id=ph.version_id;"
docker exec pdash-db psql -U pdash -d pdash -At -F' ' -c "select count(*) filter (where (nullif(trim(t.start_date),'') is not null and left(t.start_date,6) < p.start_date) or (nullif(trim(t.end_date),'') is not null and left(t.end_date,6) > p.end_date)), count(*) from project_tasks t join projects p on p.id=t.project_id;"
```

Le query non contano i task senza date, che ricadono sul periodo: è la decisione 3 del Brief. Contano invece un task con una sola data fuori. La versione `ce702b4c-…` ha già un periodo invertito (`202609` → `202607`, tabella "Existing data" dell'audit): per lei "dentro il periodo" non ha un significato. Il brainstorming deve dire cosa succede.

## Righe di `docs/BACKLOG.md` vicine a C3

Leggerle prima del brainstorming e decidere se entrano nel ciclo, rieseguendo il loro `Verified how`:
- **B-141**: `cgFmtMonth` restituisce `''` per una data salvata che non esiste, e la banda delle fasi mostra un intervallo con un lato solo. Tocca la stessa banda del phasing.
- **B-134** (parte rimasta): `isYm`/`isIso`/`daysInMonth` in `js/lib/cg-controls-calc.js` e i due `toYYYYMM` in `js/costgrid.js`. Se C3 tocca la distribuzione di costgrid, sono sulla strada.
- **B-138**: quando un `PATCH` di progetto viene rifiutato, il messaggio di salvataggio non dice che task e phasing non sono stati tentati. Una nuova regola server sui task del progetto lo rende più probabile.
- **B-130**: "Generate project" da una versione con periodo invertito mostra il messaggio generico di salvataggio fallito. È la decisione 4 del Brief (task copiati in un progetto).
- **B-144**: due picker per task in project-config, ciascuno con i suoi listener globali. Non è da risolvere qui, ma se C3 aggiunge listener o watcher per task, li moltiplica.

## Lezioni di C1/C2 da portare nel Piano

1. **I `?v=N` sono pinnati anche in guard di altre pagine.** In C2 il Gate 1 è diventato rosso perché `js/lib/proposal-modals-guard.test.js` pinnava ancora `costgrid.js?v=48`. I task lanciano solo i test toccati e quel guard non era tra questi. Nel Piano, per ogni file versionato toccato, va elencato anche `grep -rln "<file>?v=\|<file>Version" js/lib scripts`, e quei test vanno messi tra quelli del task.
2. **Le scritture server hanno già due codici di rifiuto**: `DATE_RULE` (C1) e `STRUCTURE_RULE` (task collegati). Se la regola nuova ne usa uno, `js/api-sync.js` non deve ritentare quel rifiuto come `POST` (CLAUDE.md "Dates"). Vincoli del Brief: un salvataggio legittimo di una proposta che contiene già un task fuori periodo non va bloccato, salvo scelta esplicita della decisione 1.
3. **Ciclo con `api/`**: Gate 1 lancia `scripts/run-tests.sh` e i criteri 1 e 4 passano da `test-api.js`. I casi di test di progetto in `test-api.js` girano come sysadmin (regola del currency lock). Al merge serve il riavvio di `api` (deroga del Gate 4 step 7).
4. **Se la decisione 1 sceglie di correggere i dati**:
   - prima la prova sullo stack del branch (`scripts/test-branch.sh up` clona i dati del main e quindi riproduce i 12+9 task);
   - poi, sul main, backup (`scripts/backup-db.sh`) e conferma dell'utente, con le regole di Infrastructure safety in CLAUDE.md.
   - Una migrazione di correzione è apply-once, come la 023 e la 027: va scritto nel Piano e in `docs/db/migrations.md`. Il branch stack non riceve la migrazione da solo (CLAUDE.md "DB migrations").
5. **Verifica visiva**: `scripts/shoot.mjs` contro lo stack del branch (`--base http://localhost:8081 --settle 3000`), con i PNG riletti. Per costgrid, la banda delle fasi e la Monthly Phasing con un task fuori periodo. Per project-config, la distribuzione mensile. Le etichette mensili di project-config sono ancora in italiano (B-146): non è C3, ma sarà nei PNG.
6. **Classe di rischio**: proposta `high-risk` (regole server su scritture, possibili dati da correggere, modulo date condiviso), da confermare nel Piano. In C2 l'esecuzione subagent-driven con implementatori Sonnet ha funzionato. Le correzioni nate al Gate 3 hanno richiesto tre round, tutti sullo stesso meccanismo: un segnale che un'interazione complessa va provata nel browser già nel task, non solo nei test statici.

## Guardia sui finding nuovi

Come nel Brief: un difetto nuovo trovato durante il brainstorming o l'esecuzione non si corregge in C3. Va in `docs/BACKLOG.md` o in un Brief a sé.
