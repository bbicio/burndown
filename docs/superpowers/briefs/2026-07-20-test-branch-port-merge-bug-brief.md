# Brief — Fix port-merge bug in `scripts/test-branch.sh`

**Data:** 2026-07-20
**Scenario:** 2 — Evoluzione di una feature esistente
**Origine:** Roadmap notes di `docs/superpowers/reports/2026-07-20-worktree-finish-cycle-gate2-retry-finish-cycle.md`, scoperto durante l'esecuzione del Ciclo 2 (verifica di `test-branch.sh status`)

## Current behavior

`scripts/test-branch.sh` genera un file di override (`write_override()`, `scripts/test-branch.sh:62-78`) con porte diverse da quelle del file base:

- `docker-compose.yml:14-15` (db): `ports: - "5432:5432"`
- `docker-compose.yml:35-36` (api): `ports: - "3000:3000"`
- `docker-compose.yml:77-78` (adminer): `ports: - "8080:8080"`
- `docker-compose.yml:88-89` (nginx): `ports: - "80:80"`

L'override generato (`scripts/test-branch.sh:62-78`) dichiara invece `5433:5432` (db), `3001:3000` (api), `8081:80` (nginx), `8082:8080` (adminer). Lo stack di branch viene avviato con:

```
COMPOSE="docker compose -p $PROJECT -f docker-compose.yml -f $OVERRIDE_FILE"
$COMPOSE up -d --build db          # scripts/test-branch.sh:118
$COMPOSE up -d --build api nginx adminer   # scripts/test-branch.sh:126,134
```

Il commento header dello script (`scripts/test-branch.sh:8-11`) dichiara esplicitamente l'intento: "generates a docker-compose.branch.yml override with distinct container names + ports per branch" — e lo script è pensato per girare "safe to run alongside the main stack" (`scripts/test-branch.sh:9`).

**Bug verificato**: Docker Compose concatena le liste `ports` tra più file `-f` invece di sostituirle (il `container_name`, essendo uno scalare, viene invece correttamente sostituito). Verificato con `docker compose -p <project> -f docker-compose.yml -f docker-compose.branch.yml config`: il servizio `db` risolto pubblica **sia** `published: "5432"` **sia** `published: "5433"`. Di conseguenza `scripts/test-branch.sh up` fallisce sempre con "port is already allocated" quando qualcosa occupa già le porte base (5432/3000/80/8080) — cioè ogni volta che lo stack principale è attivo, lo scenario d'uso primario dichiarato dallo script stesso.

## Expected behavior

`scripts/test-branch.sh up` deve avviare lo stack di branch usando **solo** le porte specifiche del branch (5433/3001/8081/8082), senza mai tentare di pubblicare anche le porte base (5432/3000/80/8080) — anche quando lo stack principale è già attivo su quelle porte base.

## Constraints

- Il meccanismo di `container_name` per branch (già funzionante correttamente, essendo uno scalare che Compose sostituisce) non deve regredire.
- Lo stack principale (`docker compose up`, senza alcun file di override) deve continuare a pubblicare le porte base (5432/3000/80/8080) esattamente come oggi — il fix non deve alterare il comportamento di `docker-compose.yml` quando usato da solo.
- Nessuna nuova dipendenza esterna.
- `scripts/test-branch.sh down` deve continuare a smontare correttamente lo stack di branch senza lasciare risorse orfane.

## Acceptance criteria

- `docker compose -p pdash_branch_<x> -f docker-compose.yml -f docker-compose.branch.yml config` mostra il servizio `db` pubblicare **solo** la porta 5433 (non 5432); analogamente api/nginx/adminer mostrano solo le rispettive porte di branch.
- `scripts/test-branch.sh up` ha successo mentre lo stack principale (avviato con `docker compose up` invariato) è già attivo, senza conflitti di porta.
- Lo stack principale avviato normalmente (senza override) resta pubblicato su 5432/3000/80/8080 come prima del fix.
- `scripts/test-branch.sh down` smonta correttamente lo stack di branch.

## Explicitly excluded scope

- I 5 follow-up minori già accettati al Gate 3 del Ciclo 2 (`status()` che controlla solo esistenza non salute; clausola morta in Gate 2 di `finish-cycle.md`; mancanza di istruzioni di error-handling se `up`/`down`/`status` falliscono; doppia chiamata `docker ps` in `status()`; `status()` che non controlla l'esistenza del file di override) — restano tracciati separatamente, non vanno risolti in questo ciclo.
- Qualunque modifica alla prosa di Gate 2 in `.claude/commands/finish-cycle.md` — questo ciclo tocca solo il meccanismo di override delle porte (`docker-compose.yml` e/o `scripts/test-branch.sh`), non il testo del gate che li invoca.

## Domande aperte per `/brainstorming`

- Quale tecnica usare per far sì che l'override sostituisca (non concateni) le porte: la merge-key `!override` dell'estensione Compose, `!reset`, restructuring di `docker-compose.yml` per non dichiarare `ports` nel servizio base e demandarle interamente a un file overlay, o un'altra strategia — sono alternative tecniche reali con trade-off diversi, da esplorare in brainstorming, non decise qui.

Brief ready. Next step: /brainstorming.
