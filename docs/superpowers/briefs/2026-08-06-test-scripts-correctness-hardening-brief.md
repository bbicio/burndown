# Brief — test-branch.sh/run-tests.sh correctness hardening (Cycle 1)

**Data:** 2026-08-06
**Scenario:** 2 — Evoluzione di feature esistente
**Origine:** Backlog di hardening di `scripts/test-branch.sh`/`scripts/run-tests.sh`, accumulato su più cicli (prima menzione: `docs/superpowers/reports/2026-08-03-worktree-dead-code-cleanup-and-tooltip-wording-finish-cycle.md`), re-triage 2026-08-06 — Ciclo 1 di 3 (raggruppamento per rischio confermato dall'utente: correttezza → hygiene → cosmetici)

## Current behavior

**1. `load_env()` — nessun guard su righe senza `=`, nessun trim degli spazi.** Identica in entrambi gli script (`scripts/test-branch.sh:24-37`, `scripts/run-tests.sh:8-21`):

```bash
load_env() {
  local env_file=".env"
  [ -f "$env_file" ] || return 0
  while IFS='=' read -r key val; do
    key="${key%$'\r'}"
    [[ -z "$key" || "$key" == \#* ]] && continue
    val="${val%$'\r'}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$env_file"
}
```

Se una riga di `.env` non contiene `=`, `read -r key val` mette l'intera riga in `key` e lascia `val` vuoto. Il controllo `[[ -z "$key" || "$key" == \#* ]]` non intercetta questo caso (key non vuota, non è un commento) — la riga prosegue fino a `export "$key=$val"`, esportando una variabile spazzatura il cui nome è l'intera riga originale. Non c'è inoltre alcun trim degli spazi iniziali/finali attorno a chiave o valore (solo `\r` e virgolette vengono rimossi) — una riga come `" KEY = value"` esporterebbe una variabile chiamata `" KEY "` (con spazi), non `KEY`.

**2. Migrazioni non idempotenti in `test-branch.sh up()`.** Nel ramo "fresh database" (`scripts/test-branch.sh:136-141`, eseguito quando il main stack non è in esecuzione):

```bash
echo "main stack not running — applying migrations to a fresh database..."
for f in api/src/db/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$f"
done
```

Applica **tutte** le migrazioni incondizionatamente, senza verificare se lo schema esiste già. Se `up` viene rilanciato una seconda volta senza un `down` di mezzo (es. l'utente dimentica lo stato, o un `up` precedente fallisce a metà lasciando il container attivo), questo blocco fallisce con errori "already exists" per ogni oggetto già creato dalla prima esecuzione.

**3. `status()` verifica solo l'esistenza dei container, non la loro salute.** (`scripts/test-branch.sh:111-120`):

```bash
status() {
  if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" && \
     docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
    echo "up"
    exit 0
  else
    echo "down"
    exit 1
  fi
}
```

Usa `docker ps` (container in esecuzione), non `docker inspect ... Health.Status` come fa invece `wait_healthy()` (`:88-99`, già presente nello stesso file). Un container in stato di crash-loop o ancora in fase di avvio viene segnalato come "up" anche se non è realmente pronto a servire richieste. `/finish-cycle`'s Gate 2 si basa su `scripts/test-branch.sh status` per decidere se riusare un ambiente di test esistente (`.claude/commands/finish-cycle.md`) — un falso "up" potrebbe far riusare un ambiente non funzionante senza che l'utente se ne accorga.

## Expected behavior

1. Una riga di `.env` priva di `=` deve essere ignorata silenziosamente (nessuna variabile esportata), non trattata come una coppia chiave/valore degenere. Spazi iniziali/finali attorno a chiave e valore devono essere rimossi prima dell'export.
2. Rilanciare `scripts/test-branch.sh up` una seconda volta senza un `down` di mezzo non deve fallire con errori "already exists" — il meccanismo esatto (skip condizionale delle migrazioni, verifica dello schema, o altro) è una decisione di design per `/brainstorming`.
3. `status()` deve riflettere lo stato di salute effettivo dei container (via Docker healthcheck), non solo la loro esistenza — "up" solo se entrambi i container sono sia in esecuzione sia healthy.

## Constraints

- Nessuna nuova dipendenza esterna.
- `load_env()` è duplicata identica in due file — il fix va applicato a entrambi in modo che restino identici (o consolidato in un'unica implementazione condivisa — decisione di design per `/brainstorming`, dato che questo progetto non ha oggi un meccanismo di "shell library" condivisa tra script).
- Non deve alterare il comportamento con un `.env` ben formato (nessuna regressione sulle righe valide già gestite correttamente oggi).
- `status()`'s contratto esterno (`exit 0` + stdout `"up"`, oppure `exit 1` + stdout `"down"`) usato da `/finish-cycle`'s Gate 2 non deve cambiare — solo il criterio interno con cui decide quale dei due restituire.
- Il fix delle migrazioni non idempotenti non deve introdurre uno strumento di migration-tracking complesso (es. una tabella di stato dedicata) a meno che non sia l'approccio scelto esplicitamente in `/brainstorming` — soluzioni più semplici (es. verificare l'esistenza di una tabella nota prima di applicare) vanno preferite se sufficienti.

## Acceptance criteria

- Una riga `.env` senza `=` (es. una riga di testo libero lasciata per errore) non produce alcuna variabile d'ambiente esportata, e non causa errori/crash dello script.
- Una riga `.env` con spazi attorno a chiave/valore (es. `" KEY = value "`) esporta `KEY=value`, non una variabile con spazi nel nome.
- `scripts/test-branch.sh up` eseguito due volte di seguito senza `down` intermedio non fallisce con errori "already exists" sulle migrazioni.
- `scripts/test-branch.sh status` restituisce `"down"` (exit 1) se un container esiste ma non è healthy, non solo se non esiste affatto.
- Nessuna regressione sul comportamento attuale con un `.env` valido e un ciclo `up`→`down` singolo (il caso d'uso principale, già funzionante).

## Explicitly excluded scope

- Tutti gli altri sotto-item del backlog di hardening (dump `/tmp` world-readable, porte/password hardcoded, doppia chiamata `docker ps`, controllo esistenza override-file, pre-pulizia container orfani in `run-tests.sh`, guard sulla directory di invocazione, `--build` incondizionato) — pianificati per i Cicli 2 e 3, confermati separatamente dall'utente.
- Il "vestigial clause" nel Gate 2 di `finish-cycle.md` citato in report precedenti — non più identificabile nel testo attuale del file (probabilmente già risolto incidentalmente dal fix del blind spot del 2026-08-05); da verificare separatamente, non parte di questo ciclo.
- Qualunque modifica al comportamento di `run-tests.sh` oltre alla correzione condivisa di `load_env()` — i suoi item propri (pre-pulizia, cwd guard, `--build`) sono nel Ciclo 2.

## Domande aperte per `/brainstorming`

- Meccanismo esatto per rendere le migrazioni idempotenti: skip condizionale basato su una tabella/marker esistente, oppure un'altra strategia.
- Se consolidare `load_env()` in un'unica implementazione condivisa (es. un file sorgente comune) o mantenere la duplicazione identica nei due script, correggendola in entrambi i punti.

Brief ready. Next step: /brainstorming.
