# Design — `.env` sourcing sicuro in `test-branch.sh`

**Data:** 2026-07-18
**Brief:** `docs/superpowers/briefs/2026-07-18-test-branch-env-sourcing-brief.md`
**Scenario:** 3 — Audit → fix (Finding 1, `docs/superpowers/audits/2026-07-18-test-branch-script-process-integration-audit.md`)

## Problema

`test-branch.sh` (proposta offline, non ancora nel repo) risolve `DB_USER`/`DB_NAME` da variabili di shell già esportate (`${POSTGRES_USER:-pdash}`, `${POSTGRES_DB:-pdash}`), non da `.env`. `docker compose` invece auto-carica `.env` internamente, quindi il container reale usa sempre il valore corretto anche se non esportato — un disallineamento che oggi è invisibile solo perché `.env` del repo usa gli stessi valori di default (`pdash`/`pdash`).

`api/src/create-admin.js:18-31` risolve lo stesso problema con un parser manuale di `.env` (niente `source`/`eval`), perché anche i valori reali di `.env` contengono caratteri speciali di shell — es. `POSTGRES_PASSWORD=P4$$word123__` (verificato nel `.env` reale del repo). Un `source .env` in bash espanderebbe `$$` al PID del processo, corrompendo silenziosamente qualunque valore letto in quel modo.

## Comportamento atteso

`test-branch.sh` legge `.env` con lo stesso principio di `create-admin.js`, tradotto in bash: parsing manuale riga-per-riga, mai `source`/`eval`, variabili già esportate nella shell chiamante hanno sempre precedenza su `.env`.

## Design

Nuova funzione `load_env()`, invocata subito dopo `set -euo pipefail` (prima di risolvere `DB_USER`/`DB_NAME`):

```bash
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  while IFS='=' read -r key val; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$env_file"
}

load_env
```

- **Percorso**: `.env` viene letto dalla working directory corrente, non risolto relativamente alla posizione dello script. Coerente con l'assunzione già esistente in tutto `test-branch.sh` (scrive `docker-compose.branch.yml` con path relativo, esegue `docker compose` con path relativi) — lo script è pensato per girare dalla root del repo, la stessa directory da cui `docker compose` stesso auto-carica `.env`. Nessun cambiamento a questa assunzione.
- **Parsing**: `read -r` con `IFS='='` — con soli 2 nomi di variabile (`key`, `val`), `read` assegna il primo campo a `key` e **tutto il resto della riga** (incluse eventuali `=` successive) a `val`, gestendo correttamente valori che contengono `=`. Nessuna espansione di shell avviene sul contenuto di `val`: è testo letterale letto da file, non codice eseguito. Righe vuote o che iniziano con `#` vengono saltate. Le quote (singole o doppie) che racchiudono l'intero valore vengono rimosse se presenti, replicando `create-admin.js:28` (`.replace(/^["']|["']$/g, '')`).
- **Precedenza**: `[ -z "${!key+x}" ]` verifica se `$key` è già settata nell'ambiente (indirect expansion — `${!key+x}` si espande a `x` se la variabile `$key` esiste, anche vuota; a stringa vuota se non esiste). Se già settata, non viene sovrascritta — stesso comportamento di `create-admin.js:29` (`if (!(key in process.env)) process.env[key] = val;`).
- **`.env` assente**: `load_env` ritorna subito (`return 0`) senza errore — `DB_USER`/`DB_NAME` restano sui default hardcoded `pdash`/`pdash`, comportamento invariato rispetto a oggi.
- **Nessuna nuova dipendenza**: bash puro, nessun pacchetto esterno (`dotenv` escluso esplicitamente, coerente col vincolo del Brief).

## Testing

Verifica manuale (lo script non ha una suite di test dedicata, coerente con l'assenza di test automatici per script shell nel resto del repo):
1. `.env` con `POSTGRES_USER`/`POSTGRES_DB` diversi dai default → `test-branch.sh up` usa i valori di `.env` in `pg_dump`/`pg_restore`/`psql`.
2. `.env` assente → comportamento invariato, fallback a `pdash`/`pdash`.
3. `POSTGRES_USER` già esportata nella shell chiamante con un valore diverso da quello in `.env` → la shell vince, `.env` non la sovrascrive.
4. Un valore con caratteri speciali di shell (es. il vero `POSTGRES_PASSWORD` con `$$`) attraversa il parsing senza essere espanso — verificabile con `echo` del valore letto, anche se lo script non usa direttamente `POSTGRES_PASSWORD` oggi.

## Scope escluso

- Nessuna modifica a `create-admin.js` (resta il riferimento, non va toccato).
- Nessuna modifica a `PROCESS.md` o `finish-cycle.md` in questo ciclo.
- Il Ciclo 2 (ambiguità Gate 2 su rilancio con stack già attivo) resta un Brief separato, non toccato qui.
