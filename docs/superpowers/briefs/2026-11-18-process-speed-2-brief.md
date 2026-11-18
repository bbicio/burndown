# Brief — Ciclo di processo 2: passi in parallelo, documentazione nei task, report generato, test di site-export mirati

**Tipo:** evoluzione (Scenario 2) di processo e tooling.
**Brief started:** 2026-11-18 10:27
**Origine:** analisi in chat del 2026-11-18, dopo `process-speed` (`e7c0e2b`, report `docs/superpowers/reports/2026-11-18-process-speed-finish-cycle.md`).
**Classe di rischio (proposta):** `standard`. Tocca file di processo (`.claude/`, `docs/superpowers/PROCESS.md`, `scripts/`) e la config dei test; nessuna categoria `high-risk` (PROCESS.md §6.1b). La classe si dichiara nel Piano.

## Problema

In un ciclo, i passi di contorno al lavoro (test, revisioni, chiusura) pesano più del lavoro stesso. Le cause affrontate qui sono quattro:

- **Passi in sequenza.** Molti passi indipendenti girano uno dopo l'altro.
- **Documentazione dopo il merge.** I documenti rivolti al prodotto si scrivono a merge fatto, fuori dalla revisione.
- **Report scritto a mano.** Anche le sue parti meccaniche.
- **Test lenti sempre attivi.** I test più lenti della suite provano uno strumento di sviluppo e girano a ogni esecuzione.

## Comportamento attuale

- **Passi in sequenza.**
  - Il Gate 1 (`.claude/commands/finish-cycle.md:14`) gira `npm test` ed eventualmente `scripts/run-tests.sh`.
  - Solo dopo apre il Gate 2. Lì parte la revisione in background (step 0, riga 62; PROCESS.md §6.4b, righe 179-181) e si prepara lo stack di branch (`scripts/test-branch.sh up`, step 1, righe 76-82).
  - La revisione finale del piano (PROCESS.md §6.4) parte invece a fine esecuzione, prima di `/finish-cycle`, e i test del Gate 1 non partono finché non è chiusa.
  - Docs e report si fanno al Gate 5 (riga 206), dopo il merge.
- **Documentazione a fine ciclo.**
  - `/sync-docs` (`.claude/skills/sync-docs`, invocato da `finish-cycle.md:210` sul `main` post-merge) aggiorna `ARCHITECTURE.md`, `CLAUDE.md`, `TEST_CASES.md`, PRD e manuale rileggendo il diff.
  - Solo `ARCHITECTURE.md` §5/§6 è obbligato sul branch da `scripts/architecture-guard.test.js` (PROCESS.md:109).
  - Il resto si aggiorna sul branch solo se il Piano lo prevede. Nei due cicli del 2026-11-17/18 lo prevedeva (task di documentazione), e al Gate 5 `/sync-docs` ha toccato 3 file in `save-c1-foundations` e nessuno in `process-speed`.
- **Report.**
  - `finish-cycle.md:211` e seguenti danno il modello del report, compilato a mano: tempi dei gate, commit, contatori, outcome.
  - `scripts/cycle-times.mjs` ricava già da git la cronologia dei cicli chiusi (righe 1-9), ma si lancia a mano e non scrive file.
- **Test di site-export.**
  - `vitest.config.js:6` include `scripts/**/*.test.js`, quindi `npm test` esegue sempre gli 8 file di `scripts/site-export/`: 60 casi che creano repository git usa-e-getta, circa 80-118 s per file con la suite in parallelo (report `process-speed`).
  - `scripts/site-export-guard.test.js`, il guard su cosa diventa pubblico, è veloce e separato.
  - Anche il Gate 5 su verdetto `docs-only` lancia `npx vitest run scripts/ js/lib/test-cases-parse.test.js` (`finish-cycle.md:279`), che comprende quei file.

## Comportamento atteso

1. **Passi indipendenti in parallelo.**
   - La revisione finale del piano parte in background appena l'ultimo task è committato, mentre girano i test del Gate 1.
   - Lo stack di branch per il Gate 2 si prepara mentre girano i test.
   - Le parti di chiusura che non dipendono dalla risposta del Gate 2 si preparano mentre l'utente verifica.
2. **Documentazione nei task.**
   - Ogni task aggiorna, nello stesso commit, i documenti che descrivono ciò che cambia: `CLAUDE.md`, `docs/`, `handbook/restricted/ARCHITECTURE.md`, PRD (`PRD.md`, `docs/prd/`), `handbook/public/manual.md`, `handbook/restricted/TEST_CASES.md`.
   - Il Piano elenca quei documenti tra i file del task.
   - Al Gate 5 `/sync-docs` controlla che il branch li abbia già aggiornati e scrive solo ciò che manca e la memoria.
3. **Report generato.**
   - Uno script compila le parti meccaniche del report: tempi dei gate, commit del branch, contatori, riga dei test del Gate 5.
   - Le parti di giudizio restano scritte a mano: Roadmap notes, follow-up, rulings.
4. **Test di site-export mirati.**
   - Gli 8 file di `scripts/site-export/` girano solo quando il ciclo tocca `scripts/site-export*`, `scripts/lib/site-export*` o `scripts/site-export.rules`.
   - `scripts/site-export-guard.test.js` gira sempre.

## Vincoli

- **Plugin.** I plugin `superpowers` non si modificano. Le deroghe passano da righe "Process override" in `CLAUDE.md` e da PROCESS.md.
- **Spec obbligatoria.** Ogni modifica a un gate di `/finish-cycle` passa da una spec (PROCESS.md §6.4b). Restano i tre vincoli di §6.4b: i finding non si mostrano prima della risposta del Gate 2, il "no" ferma il ciclo, una run illeggibile vale "non revisionata".
- **Teardown.** Lo stack di branch si smonta solo dopo il "yes" dell'utente (preambolo del Gate 2).
- **Infrastruttura.** Nessun `docker compose` sul main stack. Due run di `scripts/run-tests.sh` o due suite complete non girano mai in parallelo (PROCESS.md §6.2).
- **Tetto di `CLAUDE.md`.** `CLAUDE.md` resta sotto il tetto di `scripts/claude-md-guard.test.js`, e una regola vive in un file solo.
- **Copertura.** Il punto 4 non riduce la protezione su cosa diventa pubblico: quella resta in `scripts/site-export-guard.test.js`.
- **Security surface:** no.

## Criteri di accettazione

1. **Revisione in parallelo ai test:** `PROCESS.md` e `finish-cycle.md` dicono che la revisione finale parte in background al commit dell'ultimo task e che i test del Gate 1 non la aspettano. Il Gate 3 la raccoglie come oggi.
2. **Stack preparato durante i test:** `finish-cycle.md` descrive quando lo stack di branch si prepara in parallelo al Gate 1 e cosa succede se il Gate 1 diventa rosso, senza violare la regola sul teardown.
3. **Documentazione nei task:** una riga "Process override" in `CLAUDE.md`, o PROCESS.md, impone che ogni task del Piano aggiorni i documenti del proprio comportamento. `/sync-docs` al Gate 5 controlla e riporta "already on branch" per ciascuno.
4. **Report generato:** uno script, esteso da `scripts/cycle-times.mjs` o nuovo in `scripts/`, stampa le righe meccaniche del report per il ciclo corrente, con un test `.test.js`. `finish-cycle.md` Gate 5 lo usa.
5. **Test di site-export mirati:** `npm test` non esegue `scripts/site-export/` salvo quando il diff del ciclo tocca i path del punto 4. Un comando li esegue a parte. Un test o guard dimostra che `scripts/site-export-guard.test.js` gira sempre.
6. **Durata misurata:** `npm test` prima e dopo, con lo stato di Docker identico nelle due misure, ed entrambi i valori nel report.
7. **Guard verdi:** `npm test` passa, compresi `claude-md-guard`, `doc-paths-guard`, `decision-ledger-guard` e `site-export-guard`.

## Scope escluso

Confermato dall'utente:

- **Niente esenzione dalla ri-revisione** per i fix della revisione finale coperti da test (proposta 5).
- **Niente fast lane** per i cicli `low-risk` (proposta 6).
- **Revisione invariata:** nessuna modifica all'effort di `/code-review` per classe di rischio, al tetto dei tre round o alla regola text-only.
- **Velocità dello stack Docker:** nessuna modifica a `scripts/run-tests.sh`.
- **Memoria:** lo step di memoria di `/sync-docs` resta al Gate 5 com'è.
- **Gate 2:** il formato della checklist di accettazione e la domanda sul browser non cambiano.

## Domande aperte per `/brainstorming`

1. Il punto 1 cambia l'ordine dei gate o solo il loro tempo? La revisione finale parte prima di `/finish-cycle`, quindi cosa resta del Gate 2 step 0? Lo stack si prepara durante il Gate 1: si smonta se il Gate 1 è rosso, o resta per il rientro?
2. "Preparare la chiusura durante il Gate 2": cosa si può davvero anticipare prima del merge (bozza del report, righe di BACKLOG) senza scrivere su `main`?
3. Il punto 2 si impone con una riga d'override per `superpowers:writing-plans` o con un guard sui Piani (un piano che tocca codice senza elencare documenti fallisce)? Come capisce un controllo quali documenti un cambio "descrive"?
4. A cosa si riduce `/sync-docs` al Gate 5: un controllo che legge il diff e conferma, o resta com'è e trova solo meno lavoro?
5. Il report generato: estendere `scripts/cycle-times.mjs` (oggi legge solo cicli chiusi) o scrivere uno script nuovo? Da dove prende i tempi dei gate, che oggi esistono solo nella sessione?
6. Punto 4, meccanismo: `exclude` in `vitest.config.js` più un comando dedicato, o `projects` di vitest? Chi decide se il diff tocca i path: il Gate 1 di `finish-cycle.md`, `scripts/gate5-scope.mjs`, o uno script nuovo? E il Gate 5 con verdetto `docs-only` smette di lanciarli?

Brief ready. Next step: /brainstorming.
