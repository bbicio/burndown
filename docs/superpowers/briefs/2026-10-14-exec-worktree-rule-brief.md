# Brief — creazione del worktree di esecuzione con il nome dichiarato nel Piano

**Brief started:** 2026-10-14 17:30 (ora approssimata dell'avvio di `/feature-brief`; il file è scritto alle 17:38)
**Classificazione (dichiarata dall'utente, 2026-10-14):** Scenario 2 (evoluzione).
Fonte: richiesta dell'utente dopo M4 (`7fb926d`); la regola oggi vive solo nella memoria di progetto
(`feedback_worktree_branch_name.md`), fuori dal repo.

## Current behavior

- **La regola c'è, il come no.** `docs/superpowers/PROCESS.md` §6.1b (riga 161): «L'esecuzione crea il
  branch con esattamente il nome dichiarato.» Nessun testo del repo dice con quale strumento.
- **Chi legge il nome.** `.claude/commands/finish-cycle.md`, passo di identificazione del Gate 2: match
  esatto di `` **Branch:** `<branch corrente>` `` nei Piani; se non coincide, nessun Piano identificato,
  la classe si chiede all'utente e si ricade sugli steps 2-4 `git log`.
- **Il plugin prescrive l'opposto.** `superpowers:using-git-worktrees` (`SKILL.md` righe 10, 51-57,
  164): usare lo strumento nativo (`EnterWorktree`), `git worktree add` solo senza strumento nativo,
  e bypassarlo è «the #1 mistake». La skill è il primo passo di `superpowers:executing-plans` e di
  `superpowers:subagent-driven-development`.
- **`EnterWorktree`:** crea il worktree in `.claude/worktrees/` su un branch nuovo, base di default
  `origin/<default-branch>` (descrizione dello strumento, `worktree.baseRef = fresh`). Il nome del
  branch porta il prefisso `worktree-`: lo mostrano i merge `worktree-claudemd-split-phase3`,
  `worktree-worktree-approval-economy` (`git log --merges`). Con `path=` entra in un worktree già
  esistente, creato con `git worktree add`.
- **Base del branch.** Spec e Piano si committano su `main` locale prima dell'esecuzione e si pushano al
  merge: in M4 (`d5564f9`, `2cf9ba1`) non erano su `origin` quando è partita l'esecuzione. Un worktree
  basato su `origin/main` non li conterrebbe.
- **Override di processo in `CLAUDE.md`** (righe 7 e 9): chiusura del branch (`/finish-cycle`) e
  approvazioni (§6b). Nessuno riguarda la creazione del worktree. `CLAUDE.md` si carica a ogni
  sessione; `PROCESS.md` no.
- **Dopo la creazione.** §6.2 (riga 166): `npm ci` e copia di `.env` in un worktree nuovo.
- **M4 l'ha già fatto a mano:** `git worktree add .claude/worktrees/m4-verification-risk-class -b
  m4-verification-risk-class`; Gate 2 ha trovato il Piano; rimozione al Gate 4 con
  `git worktree remove --force` + `prune` + `branch -d` senza errori (report
  `docs/superpowers/reports/2026-10-14-m4-verification-risk-class-finish-cycle.md`).

## Expected behavior

1. La regola di creazione del worktree di esecuzione vive nel repo: `git worktree add
   .claude/worktrees/<nome> -b <nome>` da `main` locale, con `<nome>` esattamente il `**Branch:**` del
   Piano; mai `EnterWorktree` con `name`.
2. Subito dopo la creazione, un passo di verifica: `git branch --show-current` nel worktree coincide con
   il `**Branch:**` del Piano.
3. La regola prevale su `superpowers:using-git-worktrees` in ogni sessione, anche senza che
   `PROCESS.md` sia stato letto.

## Constraints

- Regole di `CLAUDE.md` `### Writing documentation`: regola senza motivazione, niente conteggi in
  prosa, una sola sede per regola, cancellare prima di riformulare.
- Margine di `CLAUDE.md`: rimisurare con `tr -d '\r' < CLAUDE.md | wc -c` contro il tetto di
  `scripts/claude-md-guard.test.js`.
- `npm test` verde; guard di §4b verdi.
- Il Piano di questo ciclo dichiara `**Branch:**` e `**Risk class:**` (§6.1b) e l'esecuzione applica
  già la regola nuova.

## Acceptance criteria

1. `PROCESS.md` contiene, in una sola sede, la regola di creazione (strumento, base `main` locale, nome
   = `**Branch:**`) e il passo di verifica.
2. Una riga «Process override» in `CLAUDE.md` rende la regola prevalente su
   `superpowers:using-git-worktrees` e rimanda alla sede in `PROCESS.md`.
3. `CLAUDE.md` resta sotto il tetto di `scripts/claude-md-guard.test.js`.
4. `npm test` verde.
5. La memoria `feedback_worktree_branch_name.md` viene rimossa (o ridotta a ciò che il repo non dice)
   dal passo memoria di `/sync-docs`, con la sua riga in `MEMORY.md`.

## Explicitly excluded scope (confermato dall'utente)

- Modifiche al plugin `superpowers` (`using-git-worktrees` incluso).
- Un guard (test) sul nome del branch.
- Rendere il Gate 2 tollerante al prefisso `worktree-`.
- Il passo 8 del Gate 4 (rimozione del worktree).

## Open questions for /brainstorming

1. Dopo `git worktree add`, la sessione entra nel worktree con `EnterWorktree(path=…)` o resta nel
   checkout principale lavorando con path assoluti (come in M4)? Pesa su: comandi composti rifiutati in
   una sessione worktree (memoria `feedback_worktree_removal.md`), uscita con `ExitWorktree keep`.
2. Sede della regola in `PROCESS.md`: §6.1b (dove c'è già «crea il branch con esattamente il nome
   dichiarato») o §6.2 (dove c'è già `npm ci` dopo la creazione)?
3. Dove si applica anche ai subagent: in subagent-driven il worktree lo crea il coordinatore; serve dirlo?
4. Cosa fare se il passo di verifica fallisce (rinomina con `git branch -m`, o stop).
