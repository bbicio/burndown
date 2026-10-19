# Header board deviations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** chiudere B-105, B-107, B-109, B-111 di `docs/BACKLOG.md`, più l'esadecimale inline di `_db-reset.html` (nuova riga B-118, aperta e chiusa nel ciclo).

**Spec:** nessuna — il backlog è l'elenco; handoff `docs/superpowers/briefs/2026-10-20-header-board-deviations-handoff.md`.
**Branch:** `header-board-deviations`
**Risk class:** high-risk — file condivisi caricati da più pagine: `css/style.css` (B-105/B-111) e `css/tokens.css` (B-109, 2px).

**Indipendenza dei task:** T1 e T2 toccano la stessa dichiarazione, gli altri file diversi; esecuzione nativa per §6.1 (ciclo piccolo, nessuna migrazione né API), un commit per voce.

## Misure fatte prima del Piano (stack principale = `main`, `scripts/shoot.mjs`, `--settle 3000`)

- **B-105 — confermato.** `pipeline.html` a 1440: `.ph-btn-primary` 32px, filtri della toolbar 32.8px, ricerca 34.8px. Nella tavola `docs/superpowers/design/header/header_pipeline_model.jpg` il CTA è ~1.12× i filtri; in `docs/superpowers/design/header/header_portfolio_to_be_updated.jpg` ~1.24×. Prendendo la scala della tavola dai filtri (~1.5), il CTA disegnato vale ~36-37px CSS. I bottoni secondari (`.ph-btn`, Save/Clone in `docs/superpowers/design/header/header_costgrid_to_be_updated.jpg`) valgono ~33px: restano a 32.
- **B-111 — non riprodotto.** `costgrid.html` in Draft ("Publish to SIP →") a 375, 420, 500, 768, 1024, 1100, 1200, 1300, 1440: testo alto 19px dentro il box, nessun overflow (a 375 il box è 44px per l'override mobile di `css/style.css` riga 124). Il difetto resta latente: nessun `white-space: nowrap`.
- **B-107 — riprodotto altrove.** Il `gap` di `#resetCards` si applica (16px fra le righe). Sono le due card sotto l'`<hr>` ("Delete single proposal", "Change proposal owner") a toccarsi: bordo inferiore della prima = bordo superiore della seconda (778px), gap 0. Sono fratelli fuori da `#resetCards`, senza margine.
- **B-109.** `--card-danger-border` ha un solo consumatore, `_db-reset.html`; prima del ciclo header era `2px solid #dc3545`. Confronto a schermo: rendering attuale (1px) e lo stesso con `--card-danger-border: 2px solid var(--color-danger)` iniettato.

## Task

- [ ] **T1 B-105** `css/style.css` `.ph-btn-primary`: `height: 32px` → `36px`. Boards: `header_pipeline_model.jpg`, `header_portfolio_to_be_updated.jpg` (cartella `docs/superpowers/design/header/`). Bump `css/style.css?v=25` → `26` su tutte le pagine che lo caricano. Verifica: `shoot.mjs` su `pipeline.html` e `portfolio.html` a 1440 contro le tavole.
- [ ] **T2 B-111** stessa regola: aggiungere `white-space: nowrap`. Verifica: misura su `costgrid.html` Draft a 375 e 1024 (nessun overflow, etichetta su una riga).
- [ ] **T3 B-107** `_db-reset.html`: le due card sotto l'`<hr>` dentro un contenitore `display: grid; gap: 1rem` (lo stesso gap di `#resetCards`). Verifica: misura del gap fra le due card = 16px.
- [ ] **T4 B-118** `_db-reset.html`: via `border-color:#0d6efd` e `color:#0d6efd` dalla card "Change proposal owner"; la card prende `border: var(--card-border)` e il titolo `color: var(--brand-navy)`. Riga B-118 aggiunta e chiusa.
- [ ] **T5 B-109** 2px (decisione 5, scelta dall'utente): `css/tokens.css` riga 173 e `js/lib/content-surface-guard.test.js` riga 36 nello stesso commit, bump `css/tokens.css?v=11` → `12` su tutte le pagine.
- [ ] **T6** `npx vitest run js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js js/lib/content-surface-guard.test.js`, poi chiudere le righe di `docs/BACKLOG.md` con il comando di verifica (niente `|` nudi nelle celle).

## Decisioni aperte

1. **B-105: il CTA primario passa a 36px, i secondari restano a 32.** Alternativa scartata: 40px, o alzare anche `.ph-btn`. Perché: 36 è la misura ricavata dalle due tavole con un CTA, e la tavola costgrid disegna i secondari a ~33.
2. **B-111: `white-space: nowrap` anche se il difetto non si riproduce.** Alternativa scartata: chiudere la riga come "non riprodotto". Perché: costa una proprietà nella regola che T1 tocca comunque, e un'etichetta futura più lunga lo renderebbe reale.
3. **B-107: un contenitore a griglia con gap, non un margine sulla card.** Alternativa scartata: `.danger-card + .danger-card { margin-top }`. Perché: ripete il meccanismo già usato da `#resetCards` nella stessa pagina.
4. **B-118: la card "Change proposal owner" diventa una card neutra.** Alternativa scartata: tenerla blu con un token (`--indigo-600`). Perché: non è un'azione distruttiva e nessun token del progetto corrisponde al blu Bootstrap; il bottone è già nel colore primario.
5. **B-109: bordo delle card distruttive a 2px.** Alternativa scartata: tenere 1px. Perché: le azioni sono irreversibili e il token ha un solo consumatore; scelta dall'utente il 2026-10-20 al passaggio di consegne del Piano.
6. **Esecuzione nativa, task in serie.** Alternativa scartata: subagent-driven. Perché: §6.1 «ciclo piccolo», nessuna migrazione né API, T1/T2 sulla stessa regola.
