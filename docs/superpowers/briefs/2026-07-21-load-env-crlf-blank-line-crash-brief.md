# Brief — Fix `load_env()` crash on CRLF blank lines

**Data:** 2026-07-21
**Scenario:** 2 — Evoluzione di una feature esistente
**Origine:** Roadmap notes di `docs/superpowers/reports/2026-07-20-worktree-test-branch-port-merge-fix-finish-cycle.md`

## Current behavior

`load_env()` (`scripts/test-branch.sh:24-36`) legge `.env` riga per riga con `IFS='=' read -r key val`. Per ogni riga:
- `scripts/test-branch.sh:28`: salta righe vuote (`-z "$key"`) o commenti (`"$key" == \#*`).
- `scripts/test-branch.sh:29`: strippa un `\r` finale da `$val`.
- `scripts/test-branch.sh:32`: `if [ -z "${!key+x}" ]` — espansione indiretta che richiede `$key` sia un identificatore valido.

Su una riga vuota con terminatore CRLF, non c'è alcun `=`, quindi l'intera riga (il solo carattere `\r`) finisce in `$key` (non in `$val`). `$key` vale `\r` — non è vuoto (`-z` fallisce) né inizia per `#`, quindi non viene saltato. Arriva a `${!key+x}` (riga 32), dove bash termina con `invalid variable name`, perché `\r` non è un identificatore valido.

Confermato reale: il vero `.env` di questa macchina ha terminatori CRLF e 4 righe vuote come separatori tra sezioni (verificato con `read -r key val; printf '%q'`, che mostra `val=$'pdash\r'` ecc.). Le righe di commento sono salve per puro caso (iniziano comunque per `#` nonostante il `\r` finale). Il crash blocca `scripts/test-branch.sh up`/`down`/`status` — qualunque sottocomando — ogni volta che `.env` è presente nella working directory dello script, perché `load_env()` viene chiamata incondizionatamente prima del dispatch (`scripts/test-branch.sh:38`).

## Expected behavior

`load_env()` deve gestire correttamente un `.env` con terminatori CRLF, comprese le righe vuote: nessun crash, comportamento identico a un `.env` con terminatori LF.

## Constraints

- Stesso principio già usato per `$val` (riga 29): niente `source`/`eval`, solo parsing manuale.
- Nessuna nuova dipendenza.
- Nessuna modifica al resto dello script (`write_override()`, `wait_healthy()`, `open_browser()`, `status()`, `up()`, `down()`).

## Acceptance criteria

- Un `.env` con terminatori CRLF e righe vuote (come quello reale di questa macchina) non causa più crash in nessun sottocomando (`up`/`down`/`status`).
- Il comportamento esistente resta invariato per: valori con caratteri speciali (es. `$$`), precedenza delle variabili di shell già esportate, fallback quando `.env` è assente.

## Explicitly excluded scope

- Gli altri follow-up già accumulati e tracciati separatamente (mancanza di guard `eq<0` per righe senza `=`, mancanza di trim, `status()` che controlla solo esistenza non salute, ecc.) — non toccati qui salvo che la stessa riga di codice li renda inevitabili.

Brief ready. Next step: /brainstorming.
