# Test hygiene — flaky classify-cycle, B-117, B-116 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** togliere i timeout intermittenti di `scripts/classify-cycle.test.js`, chiudere B-117 (guard delle emoji nei titoli calcolati) e B-116 (versioni vecchie citate come attuali).

**Spec:** nessuna — il backlog è l'elenco; il test instabile viene dalle Roadmap notes di `docs/superpowers/reports/2026-10-23-backlog-b110-b112-finish-cycle.md`.
**Branch:** `test-hygiene`
**Risk class:** standard — file di processo (`scripts/`), nessuna categoria high-risk.

**Esecuzione:** nativa per §6.1 (ciclo piccolo, nessuna migrazione né API), un commit per voce, worktree `.claude/worktrees/test-hygiene` per §6.1b.

## Misure fatte prima del Piano

- **classify-cycle.** I sei casi `end to end` hanno un budget di 30 s ciascuno. Da soli: da 0,5 a 3,9 s per caso; il file intero una volta 64 s. Dentro `npx vitest run` completo, due esecuzioni: da 1,5 a 18,3 s per caso. Al Gate 5 del ciclo `backlog-b110-b112` la suite è andata in timeout due volte di fila (2 casi, poi 1) e verde alla terza, senza modifiche. Ogni caso lancia da 6 a 9 processi `git` più un `node`; un `git status` a vuoto costa ~340 ms su questo host, e la configurazione globale di git non ha nulla di lento. È latenza di avvio dei processi sotto carico, non un blocco.
- **B-117.** Interpolazioni nei `.ph-title` delle pagine controllate: `planningTitle` e `dashboardTitle` sono metodi (controllati oggi); `selectedYear` (`pipeline.html`), `cg?.name || 'Cost Grid'` (`costgrid.html`), `program.name` (`program.html`), `currentList.name` (`attribute-lists.html`), `dashboardProgram.name` (`portfolio.html`) e `isNewProject ? 'New Project' : project.name` (`project-config.html`) non lo sono: il controllo legge solo un `{{ name }}` nudo e, se non trova il metodo, passa.
- **B-116.** `docs/js/nav.md` riga 23, dentro "## Current state", elenca "`nav.js?v=17`, `style.css?v=21`, … `tokens.css?v=9`, `core.js?v=13`" come versioni correnti; i valori veri sono pinnati da `js/lib/nav-shell-guard.test.js` e `js/lib/foundations-guard.test.js`. `docs/pages/config.md` riga 24 sta nella sezione storica datata "Split into five pages (2026-10-05)".

## Task

- [ ] **T1 classify-cycle** `scripts/classify-cycle.test.js`: i sei `30000` diventano una costante `E2E_TIMEOUT = 120000`, con una riga di commento che dice cosa misura (avvio di processi `git` sotto il carico della suite). Verifica: il file da solo verde; due `npx vitest run` completi verdi.
- [ ] **T2 B-117** `js/lib/page-head-guard.test.js`, test "has no emoji in a computed .ph-title": per ogni `{{ … }}` dentro un `.ph-title`, (a) nessuna emoji nelle stringhe letterali dell'espressione; (b) ogni identificatore di primo livello (non preceduto da `.` o `?.`, non una parola chiave JS) è un metodo, e il suo corpo non ha emoji, oppure sta in una costante `DATA_TITLE_ROOTS` (`selectedYear`, `cg`, `program`, `currentList`, `dashboardProgram`, `project`, `isNewProject`); altrimenti il test fallisce come "sorgente di titolo sconosciuta". Casi nuovi in "guard helpers": un'espressione con un letterale emoji fallisce, un percorso con il punto usa la sua radice, una radice sconosciuta fallisce. Verifica: `npx vitest run js/lib/page-head-guard.test.js`, più una prova a mano che rimetta un'emoji in `'Cost Grid'` e veda il rosso.
- [ ] **T3 B-116** `docs/js/nav.md` riga 23: l'elenco delle versioni diventa un rimando ai due guard che le pinnano. `docs/pages/config.md` non si tocca.
- [ ] **T4** `docs/BACKLOG.md`: chiudere B-116 e B-117 con il comando di verifica; aggiungere e chiudere B-122 per il test instabile (niente `|` nudi nelle celle). Poi `npx vitest run scripts/ js/lib/page-head-guard.test.js`.

## Decisioni aperte

1. **Timeout: budget per caso a 120 s, non meno processi né esecuzione in serie.** Alternativa scartata: costruire i repository di prova una volta sola, o far girare questo file da solo con un `pool`/`fileParallelism` dedicato in `vitest.config.js`. Perché: i casi hanno storie git diverse e il costo è l'avvio dei processi, che resta; la configurazione di vitest vale per tutta la suite e la rallenta. 120 s è circa 6× il massimo misurato sotto carico, e un blocco vero si vede comunque.
2. **B-117: le radici-dato sono un elenco chiuso nel test, non ignorate.** Alternativa scartata: saltare ogni identificatore che non è un metodo. Perché: è esattamente il buco di B-117; con l'elenco chiuso un titolo nuovo da una sorgente non dichiarata fa fallire il test e costringe a decidere. Il contenuto di quei dati (nomi da API) non è controllabile staticamente, e il test lo dice.
3. **B-116: rimando ai guard, non versioni aggiornate.** Alternativa scartata: scrivere i numeri di oggi. Perché: invecchierebbero al prossimo bump, ed è la regola di `CLAUDE.md` "No numbers or counts in prose: cite the command or test that measures them".
4. **Il test instabile entra nel backlog come B-122, aperto e chiuso nel ciclo.** Alternativa scartata: nessuna riga. Perché: stesso precedente di B-118 nel ciclo `header-board-deviations`, così la chiusura ha il suo comando di verifica.
5. **Esecuzione nativa, task in serie.** Alternativa scartata: subagent-driven. Perché: §6.1 «ciclo piccolo».
