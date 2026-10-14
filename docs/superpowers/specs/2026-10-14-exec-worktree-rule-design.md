# Worktree di esecuzione con il nome dichiarato nel Piano

**Date:** 2026-10-14
**Brief started:** 2026-10-14 17:30
**Brief:** `docs/superpowers/briefs/2026-10-14-exec-worktree-rule-brief.md`
**Scenario:** 2 (evoluzione)

## 1. Perimetro

Dal Brief: la regola di creazione del worktree di esecuzione entra nel repo, con un passo di verifica, e
prevale su `superpowers:using-git-worktrees` in ogni sessione. Esclusi dal Brief: modifiche al plugin
`superpowers`, un guard sul nome del branch, il Gate 2 tollerante al prefisso `worktree-`, il passo 8 del
Gate 4.

File toccati: `docs/superpowers/PROCESS.md`, `CLAUDE.md`. Nessun test nuovo.

## 2. `PROCESS.md` §6.1b — sede unica della regola

La frase «L'esecuzione crea il branch con esattamente il nome dichiarato.», in coda al punto sull'header
del Piano, si cancella. Al suo posto, un punto nuovo subito dopo:

- dal checkout principale, su `main` locale, con Spec e Piano già committati:
  `git worktree add .claude/worktrees/<nome> -b <nome>`, dove `<nome>` è il `**Branch:**` del Piano;
- subito dopo, `git -C .claude/worktrees/<nome> branch --show-current` deve stampare `<nome>`; se
  l'add fallisce o il controllo non stampa `<nome>`, ci si ferma prima di qualunque modifica
  (cambiata al Gate 3 round 1);
- mai `EnterWorktree`; la sessione entra nel worktree con `cd` (cambiata al Gate 3 round 1);
- in subagent-driven il worktree lo crea il coordinatore.

## 3. `PROCESS.md` §6.1 — dispatch

Il punto «Contesto dei file nei dispatch» aggiunge il path assoluto del worktree a ciò che il prompt di
un implementer e di un reviewer riceve.

## 4. `CLAUDE.md` — override

Una riga «Process override — execution worktree» dopo quella sulle approvazioni: il worktree di
esecuzione si crea come dice `PROCESS.md` §6.1b, non con lo strumento nativo che
`superpowers:using-git-worktrees` preferisce (`EnterWorktree`). Non ripete il comando. Il margine si
rimisura con `tr -d '\r' < CLAUDE.md | wc -c` contro il tetto di `scripts/claude-md-guard.test.js`.

## 5. Memoria

Il passo memoria di `/sync-docs` al Gate 5 rimuove `feedback_worktree_branch_name.md` e la sua riga in
`MEMORY.md`.

## 6. Classe del ciclo

`standard`: tocca file di processo, nessuna categoria `high-risk`.

## 7. Verifica

- `npm test` verde, compresi i guard di §4b.
- Questo ciclo crea il proprio worktree con la regola nuova; al Gate 2 il passo di identificazione trova
  il Piano per `**Branch:**`.

## Decisioni aperte

1. **La sessione entra nel worktree con `cd`, non con `EnterWorktree(path=…)` (cambiata al Gate 3 round 1).** Alternative scartate: entrarci con `path=`; lavorare sul path restando nel checkout principale. Perché: una sessione `EnterWorktree` rifiuta i comandi composti e richiede `ExitWorktree keep` prima del merge; restando nel checkout principale il pre-flight di `/finish-cycle` legge `main` e si ferma.
2. **Sede unica in §6.1b.** Alternativa scartata: §6.2, dove c'è già `npm ci`. Perché: §6.1b contiene già la regola sul nome, e il come la completa.
3. **Se l'add fallisce o la verifica non coincide, ci si ferma (cambiata al Gate 3 round 1).** Alternativa scartata: rinominare con `git branch -m`. Perché: un nome con prefisso `worktree-` viene da `EnterWorktree`, con base `origin/main`, che la rinomina non corregge; e se l'add fallisce su una cartella residua senza `.git`, `git -C` risale al checkout principale e la rinomina toccherebbe `main`.
4. **Base `main` locale, esplicita nella regola.** Alternativa scartata: tacerla. Perché: Spec e Piano si pushano solo al merge, quindi un worktree basato su `origin/main` non li conterrebbe.
5. **Override in `CLAUDE.md` di una riga, con rimando.** Alternativa scartata: ripetere il comando in `CLAUDE.md`. Perché: una regola sta in un solo file, e `CLAUDE.md` deve solo garantire che la regola sia in contesto a ogni sessione.
