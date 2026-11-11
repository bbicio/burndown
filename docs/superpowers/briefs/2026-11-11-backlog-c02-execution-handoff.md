# Handoff — backlog, ciclo 2: avvio dell'esecuzione

**Stato al 2026-11-11:** brainstorming chiuso, Spec e Piano committati su `main`, esecuzione non iniziata.

- **Spec:** `docs/superpowers/specs/2026-11-11-backlog-c02-server-validation-integrity-design.md` (`f78cbc6`)
- **Piano:** `docs/superpowers/plans/2026-11-11-backlog-c02-server-validation-integrity.md` (`6df8b9f`)
- **Brief:** `docs/superpowers/briefs/2026-11-10-backlog-c02-server-validation-integrity-brief.md`

## Decisioni già prese (non riaprire)

- Le 10 voci del ledger della Spec e le 2 del Piano, confermate dall'utente.
- **Modalità:** subagent-driven (`superpowers:subagent-driven-development`), PROCESS.md §6.1. Implementatori `model: sonnet`; coordinatore, revisione finale del branch e `/finish-cycle` su Opus.
- **Classe di rischio:** `high-risk` (migrazione `035`, money/valute, `js/api.js` condiviso): ogni `/code-review` a effort high, niente skip completo del Gate 3.
- I task girano uno alla volta, nell'ordine del Piano: tutti scrivono in `test-api.js`.

## Avvio

Dal checkout principale, su `main` aggiornato (PROCESS.md §6.1b):

```bash
git worktree add .claude/worktrees/backlog-c02-server-validation -b backlog-c02-server-validation
git -C .claude/worktrees/backlog-c02-server-validation branch --show-current
cp .env .claude/worktrees/backlog-c02-server-validation/.env
(cd .claude/worktrees/backlog-c02-server-validation && npm ci && cd api && npm ci)
```

Se il secondo comando non stampa `backlog-c02-server-validation`, fermarsi. Mai `EnterWorktree`; mai committare `.env`. Ogni dispatch riporta il path assoluto del worktree e la lista dei file del task (§6.1).

## Vincoli da ripetere in ogni dispatch

- Mai `docker compose` sullo stack principale; la migrazione `035` e il restart di `pdash-api` li fa solo `/finish-cycle` Gate 4.
- `master-clients.html` e `master-pipelines.html`: solo con il tool Edit (fini riga miste, rischio BOM).
- Codice con backslash (regex): scritto con Write/Edit, mai via shell.
- Durante i task solo i test toccati; `scripts/run-tests.sh` una volta, al Task 9.
- Finding nuovi: riga in `docs/BACKLOG.md`, mai corretti nel ciclo.

## Da sapere prima dei task

- `test-api.js`: le funzioni `testX()` sono chiamate da `main()`; `ok(cond, label)`, `section(name)`, `api(method, path, body, cookie)`, `later(...)` per la pulizia. I check nuovi vanno in `testServerValidation()` (ID `SV-NN`), chiamata dopo `testRatecards()`.
- Il container `test` (`docker-compose.yml`) è `node:24-alpine` con solo `pg` e `bcryptjs`: niente `xlsx`.
- Task 6: verificare se `scripts/run-tests.sh` applica tutte le migrazioni da sé (il Piano chiede di controllare, non di presumere).
- Nessun guard pinna i `?v=` di `js/api.js` (oggi `14` in tutte le pagine): il Task 6 li porta a `15` e verifica con il grep del Piano.

## Chiusura

A esecuzione finita: `/finish-cycle` su Opus, mai `superpowers:finishing-a-development-branch` né merge/push a mano.
