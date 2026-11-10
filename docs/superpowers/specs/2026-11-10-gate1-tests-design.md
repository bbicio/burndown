# Spec — Gate 1: rientro dopo un rosso e copertura backend

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-10-gate1-tests-brief.md` (Scenario 2, evoluzione).
Design concordato in chat il 2026-11-10 (una fermata, §6b).

## 1. Scope

Tre cambi:
- un rosso del Gate 1 si corregge e rientra dallo step 0 ristretto alla correzione, poi dallo step 1, invece di rilanciare `/finish-cycle` da capo;
- `scripts/run-tests.sh` esegue anche i test unitari del backend (`node --test` su `api/src`) sul codice del branch;
- B-411 e B-412 si chiudono.

Fuori scope (confermato nel Brief): code review dei Gate 2 e 3; il pre-check dello step 0 e la decisione §6.4d; le regole di §6.2 sui test durante i task; i costi fissi di `scripts/run-tests.sh`; un `npm test` più veloce.

## 2. Rientro dopo un rosso — `.claude/commands/finish-cycle.md`, Gate 1

- **Step 1 e step 3, su un rosso:** stop, output verbatim (come oggi). Poi: correzione sul branch, committata; si rientra nel Gate 1 dallo step 0, ristretto a `git diff <HEAD del rosso>..HEAD -- '*.md'`, e si prosegue con lo step 1 e i successivi. Il testo "Require a fix and a re-run of `/finish-cycle` from the top" sparisce dalle due righe.
- **Dopo un rosso allo step 3 lo step 1 si rilancia anch'esso.**
- **Il bullet di `scripts/architecture-guard.test.js`** dello step 1 dice che la correzione sta sul branch, prima del rientro (non più "before `/finish-cycle` runs again").
- **Gate 5 step 3**, il bullet "Unlike Gate 1": il confronto diventa "come al Gate 1 si corregge e si rientra, ma su `main`, dallo step 3 del Gate 5", senza citare più "from the top".
- **Report:** nessun campo nuovo. La riga "Gate 1" di "Gate outcomes" dice quante volte il gate è stato rosso e la causa; ogni `npm test` completo conta nel contatore `full test-suite runs`, come oggi.

## 3. Test unitari backend — `scripts/run-tests.sh`

- Dopo `wait_healthy "$API_CONTAINER"` e prima di `$COMPOSE --profile test run …`, una riga che stampa cosa sta per girare e poi `docker exec "$API_CONTAINER" node --test 'src/**/*.test.js'`. Il glob è tra apici: lo espande Node 24, a ogni profondità.
- Il container `pdash-api-test` monta `./api/src` del checkout da cui parte lo script (`docker-compose.yml`, servizio `api`), quindi il codice del branch, con le dipendenze di `api/`.
- Un rosso fa uscire lo script con codice non zero (`set -e`), prima del servizio `test`; `cleanup` via `trap` resta.
- Invariati: lock, pre-cleanup, nessuna porta sull'host, migrazioni in una sola sessione `psql` con `-v ON_ERROR_STOP=1` e il marker `\echo applying …`, l'hash dell'immagine.
- Nessun comando nuovo contro lo stack principale.

## 4. B-411 e B-412

- **B-411** — `.claude/commands/finish-cycle.md`, commento del template sotto `**Gate 5 tests:**`: verdetto e comando sono quelli del run verde; se un run precedente ha avuto un verdetto diverso, la riga aggiunge `(first: <verdict> → <command>)`.
- **B-412** — `docs/superpowers/PROCESS.md` §6.2 perde la frase "Dentro `/finish-cycle`, `/sync-docs` non lancia test."; `.claude/skills/sync-docs/SKILL.md` sezione 3: "Run standalone, run …" diventa "When run outside `/finish-cycle`, run …".
- `docs/BACKLOG.md`: B-411 e B-412 `closed 2026-11-10` con il comando che lo verifica.

## 5. Documentazione

- `docs/scripts/run-tests.md`: una sezione per i test unitari backend nello script.
- `CLAUDE.md`: la voce `scripts/run-tests.sh` del blocco File structure nomina i test unitari, entro due righe; pin di `scripts/claude-md-guard.test.js` nello stesso commit.
- `ARCHITECTURE.md`: la riga di `run-tests.sh` nell'albero degli script, idem.

## Criteri di accettazione

1. **Rientro** — `grep -n "from the top" .claude/commands/finish-cycle.md` non trova più nulla nel Gate 1 né nel Gate 5; il Gate 1 descrive il rientro dallo step 0 ristretto a `git diff <HEAD del rosso>..HEAD -- '*.md'` e poi dallo step 1, anche dopo un rosso allo step 3.
2. **Backend in `run-tests.sh`** — `bash scripts/run-tests.sh` dal worktree esce 0 e il suo output mostra il riepilogo `node --test` (`ℹ pass …`, `ℹ fail 0`) prima di quello di `test-api.js`.
3. **Rosso backend** — con un'asserzione resa falsa a mano in un `api/src/lib/*.test.js` del worktree, `bash scripts/run-tests.sh` esce non zero prima che parta `test-api.js`; l'asserzione si ripristina subito.
4. **B-411** — il commento del template nomina il caso `(first: <verdict> → <command>)`.
5. **B-412** — `grep -n "non lancia test" docs/superpowers/PROCESS.md` non trova nulla; `grep -n "When run outside" .claude/skills/sync-docs/SKILL.md` trova la sezione 3.
6. **Backlog** — B-411 e B-412 `closed` in `docs/BACKLOG.md`, con comando e data.
7. **Documentazione** — `docs/scripts/run-tests.md`, `CLAUDE.md` e `ARCHITECTURE.md` nominano i test unitari backend di `run-tests.sh`.
8. **Suite** — `npm test` verde.

## Decisioni aperte

1. **Rientro dallo step 0 ristretto alla correzione, poi dallo step 1.** Alternativa scartata: rientrare solo dallo step fallito, o tenere "da capo". Perché: la prima salta `npm test` dopo una correzione allo step 3 che può toccare il frontend; la seconda rifà lo step 0 su un branch che non è cambiato.
2. **Nessuna prevenzione dei rossi da pin prima del Gate 1.** Alternativa scartata: un comando mirato sui guard a fine esecuzione. Perché: servirebbe comunque la suite, che §6.2 vieta lì, e il rientro più economico riduce un rosso a un `npm test` e pochi turni.
3. **I test backend girano in `pdash-api-test`.** Alternativa scartata: il servizio `test`. Perché: il container `api` ha già le dipendenze e il codice del branch.
4. **Prima di `test-api.js`.** Alternativa scartata: dopo. Perché: durano secondi e un rosso evita l'attesa dell'integrazione.
5. **Nessun campo nuovo nel report per i rossi del Gate 1.** Alternativa scartata: una riga dedicata. Perché: "Gate outcomes" e il contatore delle suite bastano.
6. **B-412: la regola resta nella skill.** Alternativa scartata: tenerla in PROCESS.md. Perché: è la skill a eseguire l'azione.
7. **`high-risk`.** Alternativa scartata: `standard`. Perché: §6.1b nomina gli script Docker.
