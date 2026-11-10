# Brief — Gate 1: rientro dopo un rosso e copertura backend

**Tipo:** evoluzione di una feature esistente (Scenario 2), confermata dall'utente il 2026-11-10.
**Origine:** sequenza decisa dall'utente il 2026-11-10 dopo il ciclo `gate5-tests` (report `docs/superpowers/reports/2026-11-10-gate5-tests-finish-cycle.md`): Gate 1 + `scripts/run-tests.sh`, poi la code review.

## Problema

Il Gate 1 ripete tutto dopo un rosso, e il rosso è frequente e di solito meccanico. E i test unitari del backend non girano in nessun gate.

## Comportamento attuale

- **Step 0, pre-check meccanico** sui `*.md` del branch, tetto 10 minuti (`.claude/commands/finish-cycle.md`, Gate 1 step 0).
- **Step 1, `npm test`** (`.claude/commands/finish-cycle.md` line 26). Un rosso: "Require a fix and a re-run of `/finish-cycle` from the top" (line 27), cioè di nuovo step 0 e un secondo `npm test` completo.
- **Rossi misurati:** nelle righe "Gate 1" dei report di ottobre e novembre, circa 22 su 53 nominano un rosso o un fallimento. La causa ricorrente è un guard di `js/lib/` che fissa un `?v=N` o un conteggio che il branch ha cambiato. Comando:

  ```bash
  grep -h "^- Gate 1" docs/superpowers/reports/2026-1[01]-*.md | grep -ciE "red|failed"
  ```

- **`npm test` = vitest** su `js/**` e `scripts/**` (`vitest.config.js`). Ultimo run completo il 2026-11-10: 94 s.
- **Step 2-3, `scripts/run-tests.sh`** quando un path inizia con `api/` o la sua rilevanza per il backend è incerta (`.claude/commands/finish-cycle.md` line 30, 32). Un rosso: di nuovo "from the top" (line 33).
- **`scripts/run-tests.sh` a ogni run:** `compose_down` (line 94), stack nuovo, tutte le migrazioni (line 101), build dell'immagine solo se cambia l'hash di `api/Dockerfile` + `api/package.json` (line 112), poi il servizio `test` (line 125). Quel servizio reinstalla `pg` e `bcryptjs` con `npm install` a ogni run (`docker-compose.yml` line 82) ed esegue solo `node test-api.js` (line 86). Nessun report registra la durata del run.
- **Test unitari backend:** `api/src/**/*.test.js` (`node --test`, `api/package.json` script `test`); il 2026-11-10, in `pdash-api`, 398 test verdi in circa 6 s. `npm test` non li include e `scripts/run-tests.sh` non li esegue: nessun gate li lancia. Durante i task si lanciano con `docker exec pdash-api node --test src/<file>` (PROCESS.md §6.2), che usa il codice montato dal checkout principale, non quello del worktree.
- **PROCESS.md §6.2** vieta la passata di fine esecuzione nel coordinatore (line 165): il Gate 1 ritesta lo stesso albero.
- **Follow-up aperti:** B-411 (la riga `Gate 5 tests` del report ha un solo posto per verdetto e comando) e B-412 (`/sync-docs` sezione 3 ripete una regola di PROCESS.md §6.2) in `docs/BACKLOG.md`.

## Comportamento atteso

1. **Rientro dopo un rosso del Gate 1:** si corregge sul branch e si riparte dallo step 1, non da capo. Lo step 0 rigira solo sui `.md` toccati dalla correzione. Vale per lo step 1 e per lo step 3.
2. **Test unitari backend nel Gate 1:** quando il diff tocca `api/`, `node --test` su `api/src` gira sul codice del branch, nello stack di `scripts/run-tests.sh`, e un rosso blocca come oggi.
3. **B-411 e B-412 chiusi.**

## Vincoli

- **Infrastructure safety di `CLAUDE.md`:** `scripts/run-tests.sh` usa il progetto isolato `pdash_test`, mai lo stack principale; nessun nuovo comando contro `pdash-db`/`pdash-api`.
- **`scripts/run-tests.sh` mantiene** lock, pulizia via `trap`, nessuna porta sull'host, e l'applicazione delle migrazioni in una sola sessione `psql` con `-v ON_ERROR_STOP=1` e il marker `\echo applying …` (`docs/ops/database.md`).
- Una regola vive in un file: PROCESS.md, CLAUDE.md e `docs/scripts/run-tests.md` rinviano al comando invece di ripeterlo.
- Classe di rischio almeno `standard` (file di processo e `scripts/`); `high-risk` se si toccano script Docker (§6.1b: "script Docker o di backup").

## Criteri di accettazione

- `.claude/commands/finish-cycle.md` Gate 1: dopo un rosso dello step 1 o dello step 3 si riparte dallo step 1; lo step 0 rigira solo sui `.md` della correzione; "from the top" non compare più nel Gate 1.
- `scripts/run-tests.sh` esegue `node --test` su `api/src` dentro lo stack isolato; un test backend rotto apposta lo fa uscire con codice non zero.
- B-411 e B-412 chiusi in `docs/BACKLOG.md` con il comando che lo verifica.
- `npm test` e `scripts/run-tests.sh` verdi.

## Scope escluso (confermato dall'utente)

- Code review dei Gate 2 e 3: ciclo a parte, dopo questo.
- Il pre-check meccanico dello step 0 e la decisione dell'esperimento §6.4d.
- Le regole di §6.2 su cosa si lancia durante i task, salvo quanto serve al punto 1.
- I costi fissi di `scripts/run-tests.sh` (`npm install` a ogni run, migrazioni, misura della durata): guadagno non misurato, escluso dall'utente il 2026-11-10.
- `npm test` più veloce (jsdom solo per i file che usano il DOM): escluso dall'utente il 2026-11-10; candidato per un ciclo a parte.

## Domande aperte per `/brainstorming`

- **Prevenire i rossi da pin, oltre a rientrare meglio:** un comando mirato prima del Gate 1 (es. i guard di `js/lib/` sui file versionati toccati) contraddice §6.2 o lo affianca?
- **Dove girano i test backend:** nel container `api` usa-e-getta (`docker exec pdash-api-test`), o nel servizio `test`? Servono le dipendenze di `api/`, che il servizio `test` non ha.
- **La classe di rischio:** `run-tests.sh` è uno script Docker, quindi `high-risk` per §6.1b?
