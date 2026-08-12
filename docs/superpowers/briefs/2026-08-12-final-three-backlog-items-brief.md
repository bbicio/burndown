# Brief — close out the last 3 backlog items

**Data:** 2026-08-12
**Scenario:** 2 — Evoluzione di funzionalità esistenti
**Origine:** I tre item minori rimasti aperti dal report `docs/superpowers/reports/2026-08-07-worktree-minor-backlog-cleanup-finish-cycle.md` (sezione "Code review follow-ups"/"Roadmap notes"), richiesti esplicitamente dall'utente per chiudere ogni segnalazione residua.

## Current behavior

**1. `schema_exists()` in `scripts/test-branch.sh`: la seconda query `psql` non controlla il proprio exit status.** `scripts/test-branch.sh:106-126`:
```bash
schema_exists() {
  local users_exist last_migration_exists rc
  users_exist=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT to_regclass('public.users') IS NOT NULL;")
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "Warning: could not query schema state (psql exit $rc) — treating as absent." >&2
    return 1
  fi
  [ "$users_exist" != "t" ] && return 1

  last_migration_exists=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT column_name FROM information_schema.columns WHERE table_name='cg_version_projects' AND column_name='task_names_direct';")
  if [ -z "$last_migration_exists" ]; then
    echo "Schema appears partially migrated (interrupted run?). Run:" >&2
    echo "  scripts/test-branch.sh down && scripts/test-branch.sh up" >&2
    echo "to rebuild from a clean database." >&2
    exit 1
  fi
  return 0
}
```
La prima query (righe 108-114) cattura `rc=$?` esplicitamente e distingue un fallimento `psql` genuino da uno schema assente. La seconda query (righe 117-118) non ha lo stesso controllo: se `psql` fallisce qui per un problema transitorio, `$last_migration_exists` risulta vuoto — identico al caso "colonna non trovata" — e lo script conclude erroneamente "Schema appears partially migrated" invece di "could not query schema state".

**2. `_roleEditId`/`_programEditId` sono variabili di modulo morte.** `js/roles.js:6` e `js/programs.js:6`: dichiarate ma senza più alcun lettore/scrittore nel repo (confermato via grep — l'unica occorrenza di ciascun nome è la propria dichiarazione), da quando le funzioni modali che le usavano sono state rimosse nel ciclo precedente.

**3. `resolveColumnMap()` usa un'assegnazione greedy, non un'ottimizzazione bipartita globale.** `api/src/routes/timesheets.js:235-271`: dopo aver calcolato e ordinato tutti i match (header, campo) per punteggio di specificità (righe 253-258), l'assegnazione finale (righe 260-268) itera in ordine e assegna ogni match al primo header/campo entrambi ancora liberi — un algoritmo greedy, non una vera ottimizzazione (es. Hungarian algorithm) che massimizzi il punteggio totale su tutte le assegnazioni. Nessun trigger reale è mai stato dimostrato in due cicli precedenti di investigazione (Ciclo `timesheet-column-mapping-specificity`, 2026-08-05, e `minor-backlog-cleanup`, 2026-08-07) — costruire uno scenario dove il greedy produce un risultato genuinamente peggiore del bipartito ottimale richiede più campi con candidati sovrapposti in modo specifico, e la tabella `FIELD_CANDIDATES` attuale (righe 198-207) non ha sovrapposizioni di parole tra campi diversi.

## Expected behavior

1. Un fallimento transitorio della seconda query `psql` in `schema_exists()` deve produrre lo stesso warning esplicito della prima ("could not query schema state"), non essere confuso con "schema parzialmente migrato".
2. `_roleEditId`/`_programEditId` non devono più esistere come variabili morte in `js/roles.js`/`js/programs.js`.
3. Da decidere in `/brainstorming` — vedi Domande aperte.

## Constraints

- Nessuna nuova dipendenza esterna.
- Nessuna regressione sul comportamento attuale in ogni caso già funzionante.
- Il contratto esterno di `schema_exists()` (chiamata solo da `up()` come `if schema_exists; then`) non cambia — solo il messaggio distintivo su un fallimento della seconda query.
- La rimozione delle variabili morte (item 2) non deve toccare nient'altro nei due file.

## Acceptance criteria

- Un fallimento simulato della seconda query `psql` in `schema_exists()` produce il warning "could not query schema state", non il messaggio "partially migrated".
- `_roleEditId`/`_programEditId` non compaiono più in `js/roles.js`/`js/programs.js`; `npm test` continua a passare (136/136).
- Item 3: da definire in `/brainstorming` in base alla decisione presa.

## Explicitly excluded scope

- Qualunque altro item del backlog storico non elencato sopra (tutti confermati chiusi).
- Cambiamenti al contratto esterno di `up`/`down`/`status` in `test-branch.sh`.

## Domande aperte per `/brainstorming`

- **Item 3 richiede una decisione di scope prima di tutto**: vale la pena implementare una vera ottimizzazione bipartita (es. Hungarian algorithm) per un problema senza alcun trigger reale dimostrato in due cicli di investigazione, o è più sensato investigare a fondo se esiste un caso concreto costruibile con la tabella `FIELD_CANDIDATES` attuale — e se non esiste, chiudere l'item come "investigato, nessun fix necessario, limitazione accettata e documentata" invece di scrivere codice per un problema non dimostrabile?
- Meccanismo esatto per il fix della seconda query `psql` (item 1): identico pattern della prima (cattura `rc`, warning, `return 1`), o un refactor che condivida la logica tra le due query.

Brief ready. Next step: /brainstorming.
