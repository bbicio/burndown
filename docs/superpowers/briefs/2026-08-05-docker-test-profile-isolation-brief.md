# Brief — Isolate the Docker Compose integration-test profile from the main stack

**Data:** 2026-08-05
**Scenario:** 2 — Evoluzione di una feature esistente
**Origine:** Roadmap notes di `docs/superpowers/reports/2026-08-05-worktree-timesheet-parsing-and-worktree-cleanup-finish-cycle.md` — item 8 della re-triage del backlog

## Current behavior

- `docker-compose.yml:7`: servizio `db` ha `container_name: pdash-db` fisso; porta host fissa `docker-compose.yml:14-15` (`"5432:5432"`)
- `docker-compose.yml:24`: servizio `api` ha `container_name: pdash-api` fisso; porta host fissa `docker-compose.yml:35-36` (`"3000:3000"`)
- `docker-compose.yml:53-73`: servizio `test` (profilo `test`) dipende da `api: condition: service_healthy` (`docker-compose.yml:55-57`) e comunica con `api`/`db` solo via rete interna Compose (`API_URL: http://api:3000`, riga 60) — non usa le porte host esposte
- Nessun `container_name` proprio per `test`; nessun project name (`-p`) o file di override nel comando documentato (`# Usage: docker compose --profile test run --rm test`, riga 51) — usa il project name di default (basato sulla cartella corrente)
- Il volume `pgdata` (dichiarato a fine file) non ha un nome esplicito indipendente dal project — Compose lo prefissa automaticamente col project name

**Conseguenza 1 (verificata direttamente, 2026-08-05):** se il main stack è già in esecuzione, il comando fallisce con conflitto di `container_name`, indipendentemente dalla directory da cui viene lanciato (i `container_name` fissi bypassano l'isolamento per project-name di Compose).

**Conseguenza 2 (dedotta dal comportamento documentato di Docker Compose — non verificata empiricamente per non rischiare i dati reali dell'utente):** se il main stack è fermo (`docker compose down`, che rimuove i container ma **non** il volume nominato `pgdata` per design) e il comando test viene lanciato dalla stessa directory/project-name del main stack, Compose crea nuovi container ma li monta sul volume `pgdata` **esistente** — nessun isolamento dei dati. `create-admin.js` e `test-api.js` girerebbero contro il DB reale.

## Expected behavior

Il gate di test deve girare **sempre** in un ambiente completamente isolato dal main stack — container name distinti, nessuna porta host condivisa, project name distinto (quindi volume dati distinto ed effimero) — indipendentemente da: se il main stack è in esecuzione o meno, e da quale directory/branch viene lanciato. Il DB di test parte vuoto ad ogni esecuzione; container e volume di test vengono rimossi automaticamente al termine del run (successo o fallimento).

## Constraints

- Non deve alterare il comportamento del main stack (`docker compose up` invariato) — deve continuare a pubblicare su `pdash-db`/`pdash-api`, porte 5432/3000, esattamente come oggi.
- Deve restare eseguibile in un ambiente CI-pulito (nessuno stack preesistente), senza richiedere che l'utente fermi manualmente il main stack.
- Il comando può cambiare rispetto a oggi (confermato dall'utente); se cambia, `.claude/commands/finish-cycle.md` (Gate 1) va aggiornato di conseguenza, insieme a qualunque altra menzione nel progetto.
- Il pattern di isolamento dovrebbe essere coerente con quanto già stabilito in `scripts/test-branch.sh` per lo stesso tipo di problema, non reinventato da zero.
- Il volume dati del profilo test deve essere ripulito ad ogni run (confermato dall'utente) — non deve persistere tra esecuzioni.
- Nessuna nuova dipendenza esterna.

## Acceptance criteria

- Il comando del gate di test ha successo anche quando il main stack è già in esecuzione — nessun conflitto di nome container o porta.
- Il volume Postgres usato dal profilo test non è mai lo stesso del main stack (verificabile via `docker volume ls`).
- Dopo un run (successo o fallimento), container e volume di test creati vengono rimossi automaticamente — nessuna risorsa Docker orfana.
- Il main stack avviato normalmente continua a pubblicare su `pdash-db`/`pdash-api`/5432/3000 esattamente come prima — nessuna regressione.
- Il comando aggiornato (se cambiato) è documentato ovunque il progetto lo referenzia.

## Explicitly excluded scope

- `scripts/test-branch.sh` e il suo meccanismo di isolamento per branch restano intoccati — use case distinto (stack persistente per testare un branch vs. test runner effimero).
- Gli altri item del backlog di hardening di `scripts/test-branch.sh` (file `/tmp` world-readable, migrazioni non idempotenti, password admin hardcoded) restano un ciclo separato.
- Nessuna modifica alla logica interna di `test-api.js`/`create-admin.js` — solo all'ambiente/isolamento in cui girano.

## Domande aperte per `/brainstorming`

- Approccio tecnico: file di override statico committato (`docker-compose.test.yml`) vs. script wrapper che genera l'override dinamicamente e orchestra il ciclo di vita — alternative reali da esplorare in brainstorming.
- Come garantire "volume pulito ad ogni run": project name fisso + `down -v` esplicito prima/dopo, oppure project name/volume dinamico (es. basato su PID) — trade-off tra semplicità e garanzia di isolamento anche in caso di interruzione a metà run.

Brief ready. Next step: /brainstorming.
