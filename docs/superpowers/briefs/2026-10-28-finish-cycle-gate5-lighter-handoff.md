# Handoff — `/finish-cycle` Gate 5 più leggero, esecuzione nativa

**Scritto:** 2026-10-28, al termine della sessione che ha prodotto Brief, Spec e Piano.
**Per:** la sessione che esegue il Piano in modalità nativa e chiude con `/finish-cycle`.

## Dove siamo

| Artefatto | Path | Commit |
|---|---|---|
| Brief | `docs/superpowers/briefs/2026-10-28-finish-cycle-gate5-lighter-brief.md` | `d343b8d` |
| Spec | `docs/superpowers/specs/2026-10-28-finish-cycle-gate5-lighter-design.md` | `e219d57` |
| Piano | `docs/superpowers/plans/2026-10-28-finish-cycle-gate5-lighter.md` | `5b6c7ff` |
| Questo handoff | `docs/superpowers/briefs/2026-10-28-finish-cycle-gate5-lighter-handoff.md` | commit `docs(handoff)` successivo a `5b6c7ff` |

- **Push:** tutti e quattro i commit sono su `main` **locale e non pushati**. Li pusha il `git push origin main` del Gate 4.
- **Decisioni già prese:** la modalità (**nativa**, §6.1) e la classe di rischio (**`standard`**, §6.1b), entrambe dichiarate dall'utente in chat. Non si richiedono.
- **Spec e Piano sono congelati** (PROCESS.md §1): ogni scostamento va nelle Roadmap notes del report.

## Passi

1. **Worktree** (PROCESS.md §6.1b), dal checkout principale, su `main`:
   ```bash
   git worktree add .claude/worktrees/finish-cycle-gate5-lighter -b finish-cycle-gate5-lighter
   git -C .claude/worktrees/finish-cycle-gate5-lighter branch --show-current
   ```
   Il secondo comando deve stampare `finish-cycle-gate5-lighter`, altrimenti ci si ferma. Mai `EnterWorktree`. Nel worktree si lancia `npm ci` una volta. Il `.env` non serve: il diff non tocca `api/`, quindi non girano né `scripts/run-tests.sh` né lo stack Docker.
2. **Modello** (§6.1): l'utente passa a Sonnet con `/model sonnet`.
3. **Esecuzione:** `superpowers:executing-plans` sul Piano, task 1 → 5 in ordine.
   - Durante i task si lanciano solo i file di test toccati (§6.2); la suite completa gira solo al Task 5 Step 2.
   - I file si modificano con il tool Edit o con uno script scritto su file, mai con `node -e`. In questa sessione due modifiche via shell sono fallite (un `|` dentro una cella, un testo riformulato su disco).
4. **Chiusura:** l'utente torna su Opus con `/model opus`, poi lancia `/finish-cycle` dal worktree. Non usare `superpowers:finishing-a-development-branch` (override in `CLAUDE.md`).

## Fatti che servono durante l'esecuzione

- **Task 1:** `.superpowers_up.log` è oggi un file non tracciato nella root del checkout principale. È l'output di `scripts/test-branch.sh up`, rediretto a mano il 2026-10-24. Il Task 1 lo aggiunge a `.gitignore`. Non va cancellato.
- **Task 2:** per il ciclo `dates-c4-saves-period` il merge `8e9b76d` ha ora d'autore 13:52:27 e il commit del report `8b588d0` ha 14:07:19, quindi `merge→docs` deve risultare `15`. La riga di `buildRow` passa da 12 a 14 celle.
- **Task 5:** in `scripts/claude-md-guard.test.js` il byte count del blocco File structure di `CLAUDE.md` è fissato esattamente a `12_914`, alla line 144. Il numero nuovo si legge dal valore "received" del test. Il conteggio delle voci troppo lunghe (`12`) non deve cambiare.
- **Base empirica del predicato:** rimisurata al momento del Piano, sui 30 commit `docs: sync docs` dal 2026-10-09. Gli unici path non `.md` sono `js/lib/test-cases-parse.test.js` (11) e `scripts/claude-md-guard.test.js` (3). Il comando è nella Spec, §6.
- **Brief started** è `unknown`: l'ora non è stata registrata. `scripts/cycle-times.mjs` darà `unknown` per brief→spec di questo ciclo.

## Attenzione a `/finish-cycle` di questo stesso ciclo

Questo ciclo cambia il comando che lo chiude, e non è stato verificato quale versione di `.claude/commands/finish-cycle.md` carica una `/finish-cycle` lanciata dal worktree.
- **Prima di decidere:** leggere il testo caricato (si vede dalle domande del Gate 4) e dirlo all'utente.
- **Se il Gate 4 porta la seconda domanda:** il Gate 5 gira su `main` dopo il merge, dove `scripts/gate5-scope.mjs` esiste. Questo ciclo è allora la prima prova reale della pre-autorizzazione, e va annotato nel report.
- **Se il Gate 4 porta solo "Proceed with merge?":** il Gate 5 chiede come prima.
- **Classificazione:** al Gate 2 il ciclo è `ordinary` (il diff contiene `scripts/*.mjs` e `.gitignore`). La revisione è a effort **medium** (classe `standard`). Non serve lo stack del branch: il Gate 2 lo propone e si può rispondere no, perché non c'è niente da vedere nel browser.
- **Condizione 3 del gate PROCESS.md di `/sync-docs`:** scatta, perché il ciclo cambia un gate di `/finish-cycle` e un output di `/sync-docs`. `PROCESS.md` però è già aggiornato dal Task 5, quindi `/sync-docs` verifica e non riscrive.

## Fuori da questo ciclo

- I follow-up B-163..B-172 di `docs/BACKLOG.md`.
- Il costo del Gate 3 in `high-risk`, escluso dall'utente: 82 minuti nel ciclo `dates-c4-saves-period`.
- L'ordine imposto dai picker di date, osservato al Gate 2 di `dates-c4-saves-period`: un candidato per un ciclo UX.
