# Backlog quick wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** chiudere le righe B-016/017/018/019/020/066/067/070/097/114 di `docs/BACKLOG.md` e misurare B-106.

**Spec:** nessuna — il backlog è l'elenco; handoff `docs/superpowers/briefs/2026-10-19-backlog-quickwins-handoff.md`.
**Branch:** `backlog-quickwins`
**Risk class:** low-risk — documenti, due test e l'HTML di due pagine; nessuna categoria high-risk, nessuna route, nessun `js/lib/` di produzione. Sale a `high-risk` (file condiviso `css/style.css`, più pagine) solo se B-106 viene corretto: in quel caso la classe va rideclarata prima del commit.

**Indipendenza dei task:** i task sono indipendenti (file diversi); esecuzione nativa per §6.1 (ciclo piccolo, nessuna migrazione né API), un commit per voce.

## Task

- [ ] **T1 B-017** `TEST_CASES.md`: ST-03 "14 pages" e AD-11 "Config → Clients" (ora Master Data). Nessuna riga di tabella aggiunta o tolta.
- [ ] **T2 B-018** `docs/prd/pipeline.md` §4.9: l'editor non è un overlay.
- [ ] **T3 B-019** `docs/prd/planning.md` §11.3 inesistente (il rimando punta a una nota che non c'è: togliere la clausola); `docs/prd/administration.md` `§16.9a` → `§16.10`.
- [ ] **T4 B-020** `.claude/commands/finish-cycle.md` riga 171: `PRD.md-conditional` → `docs/prd/`.
- [ ] **T5 B-066/B-067** Piano M1: Step 4 atteso con la riga di eccezione; ledger senza il rimando alla spec e senza conteggi.
- [ ] **T6 B-114** `content-surface-guard.test.js`: la regola deve stare dentro il blocco `@media (max-width: 767.98px)`.
- [ ] **T7 B-097** `page-head-guard.test.js`: niente emoji nei titoli calcolati (`planningTitle`).
- [ ] **T8 B-016** intestazioni "Portfolio" / "Planning" (testi di `js/nav.js`).
- [ ] **T9 B-070** `kpiLeftColor()` → `var(--kpi-orange)`; aggiornare B-113.
- [ ] **T10 B-106** misurare a 375px con `scripts/shoot.mjs`; correggere solo se confermato e in una o due regole, altrimenti registrare la misura.
- [ ] **T11** chiudere le righe di `docs/BACKLOG.md` con il comando di verifica.

## Decisioni aperte

1. **B-019: il rimando a §11.3 si toglie, non si corregge.** Alternativa scartata: puntare a un'altra sezione. Perché: nessuna sezione contiene la «nota di correzione» citata, quindi qualunque numero asserirebbe una cosa che non c'è.
2. **B-019: `§16.9a` diventa `§16.10`.** Alternativa scartata: togliere il rimando. Perché: §16.10 è la Profile Processing Console, il target esatto della frase.
3. **Esecuzione nativa, task in serie.** Alternativa scartata: subagent-driven. Perché: §6.1 «ciclo piccolo», nessuna migrazione né API.
