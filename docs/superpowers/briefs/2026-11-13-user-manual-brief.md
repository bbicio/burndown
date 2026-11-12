# Brief — Handbook: il manuale utente in `handbook/public/manual.md`

**Tipo:** evoluzione di una funzionalità esistente (Scenario 2), confermato dall'utente il 2026-11-13.
**Origine:** richiesta in chat del 2026-11-13 («vorrei lanciare il ciclo per completare il manuale utente»). È il «ciclo 2» annunciato dal brief del viewer (`docs/superpowers/briefs/2026-11-11-handbook-viewer-brief.md`, scope escluso) e dal brief dei diagrammi (`docs/superpowers/briefs/2026-11-12-handbook-diagrams-brief.md`, riga «Manuale utente: nessun contenuto in `handbook/public/`»).
**Scelte dell'utente (2026-11-13):** migrare **e** aggiornare il contenuto; ritirare `docs/OPERATIONAL_MANUAL.html`; solo testo, niente screenshot; B-459, B-460 e B-461 fuori dal ciclo.

## Comportamento attuale

- **Il manuale nel viewer è un segnaposto.** `handbook/public/manual.md` contiene `# User manual` e «The user manual will be moved here.» (`cat handbook/public/manual.md`). `handbook/manifest.json` lo elenca come `{ "id": "manual", "audience": "public", "renderer": "markdown", "file": "public/manual.md" }`, visibile a ogni utente autenticato.
- **Il viewer rende Markdown con `marked`.** `help.html` line 282: `this.html = marked.parse(text)`; i blocchi `mermaid` diventano diagrammi (`help.html` line 67, rendering `markdown`).
- **Il manuale vero è un HTML a parte.** `docs/OPERATIONAL_MANUAL.html`, autonomo, 1,3 MB, 16 immagini incorporate in base64 (`grep -o "<img" docs/OPERATIONAL_MANUAL.html | wc -l` → 16), non linkato dall'app. Ultima rigenerazione: `2fb1ea1`, 2026-11-05 (`git log -3 -- docs/OPERATIONAL_MANUAL.html`).
- **Capitoli dell'HTML** (`grep -o "<h[23]…"`): Getting Started, Navigation, Pipeline (con le sue sottosezioni), Resource Planning, Project Reporting, Configuration, Timesheet Upload, Settings, Notifications, AI Sidebar, Authentication, User Administration, GDPR & Data Rights, Sharing & Permissions, Changelog.
- **Capitoli probabilmente superati:** «Settings» (B-361: ancora presente, raggiunto da una voce di menu che non esiste più; `settings.html` non esiste) e «AI Sidebar» (nessuna occorrenza in `PRD.md` né in `docs/prd/`). Da verificare, non assumere.
- **Pagine senza una intestazione dedicata** nell'HTML, ma presenti nella tabella Pages di `CLAUDE.md`: Team, Attribute lists, My profile (two-step, trusted devices), Privacy Notice, le pagine Master Data per funzione, il viewer Help, la Program Dashboard. Da verificare se qualcuna è trattata dentro un altro capitolo.
- **Chi produce e mantiene l'HTML.** La skill `.claude/skills/operational-manual/SKILL.md` scrive `docs/OPERATIONAL_MANUAL.html` (lines 23 e 60) e porta un riferimento di contenuto «as of 2026-10-09» (line 66); `/sync-docs` §5b lo aggiorna quando cambia il PRD (`.claude/skills/sync-docs/SKILL.md` line 83) e §5c prevede il passo «manuale» su `handbook/public/manual.md` «active from handbook cycle 2».
- **Riferimenti vivi all'HTML fuori da `docs/superpowers/`:** `scripts/classify-cycle.mjs` line 23, `scripts/classify-cycle.test.js` lines 124-128 (una sua modifica è «ordinary», mai «no-code»), `scripts/doc-paths-guard.test.js` lines 56-58, `docs/BACKLOG.md` (B-361), `docs/handoff-ciclo4.md` line 55.

## Comportamento atteso

1. `handbook/public/manual.md` contiene il manuale d'uso completo, in inglese, in Markdown, e `help.html?doc=manual` lo mostra a ogni utente autenticato.
2. Il contenuto parte da `docs/OPERATIONAL_MANUAL.html` e viene allineato allo stato attuale dell'app: capitoli per le pagine e le funzioni aggiunte o cambiate dopo il 2026-11-05; capitoli per funzioni che non esistono più rimossi o corretti (a partire da «Settings» e «AI Sidebar», dopo verifica).
3. Solo testo: il manuale non contiene immagini.
4. `docs/OPERATIONAL_MANUAL.html` esce dal repo. I riferimenti vivi che lo citano sono aggiornati. La skill `operational-manual` e i passi 5b/5c di `/sync-docs` descrivono il flusso sul Markdown, senza screenshot.
5. Nessuna funzione descritta che non sia live (la regola della skill «covering only features that are actually live»).

## Vincoli

- **Lingua:** tutto il testo rivolto all'utente è in inglese (`CLAUDE.md`, «Language constraint»).
- **Nessun contenuto inventato:** ogni capitolo si verifica contro la pagina o la route reale; le fonti sono `PRD.md` + `docs/prd/` e il codice.
- **Il viewer e i guard restano come sono:** nessuna modifica a `help.html`, a `js/lib/handbook.js`, a `scripts/handbook-guard.test.js`, a nginx. Il manuale deve passare `scripts/handbook-guard.test.js` e `scripts/doc-paths-guard.test.js` così come sono.
- **Classificazione del ciclo:** la decide `scripts/classify-cycle.mjs`, non il giudizio. Il ritiro di un `.html` sotto `docs/` e la modifica delle skill lo rendono probabilmente «ordinary» (`classify-cycle.test.js` line 128): il Gate 2 di `/finish-cycle` vale allora la regola della deroga §3 se non c'è nulla da vedere nel browser, ma il manuale è visibile in `help.html` e andrà guardato.
- **Mermaid ammesso, ma non richiesto** (il rendering esiste già); nessuna immagine `.png`.

## Criteri di accettazione

1. **Segnaposto sostituito** — `handbook/public/manual.md` non contiene più «will be moved here» e ha un capitolo per ciascuna area utente dell'app; la mappa capitolo ↔ pagina della tabella Pages di `CLAUDE.md` è nella spec.
2. **Nessuna funzione inesistente** — non compaiono più «Settings» né «AI Sidebar» come funzioni, a meno che la verifica non provi che esistono; per ogni capitolo la spec cita la pagina o la route che lo giustifica.
3. **Pagine nuove coperte** — Team, Attribute lists, My profile, Privacy Notice, Master Data e il viewer Help hanno una sezione (o la spec dichiara perché no).
4. **Il viewer lo mostra** — `help.html?doc=manual`, aperto come utente non admin, si carica senza avvisi del viewer; `npx vitest run scripts/handbook-guard.test.js` è verde.
5. **Niente immagini** — `grep -c "\.png" handbook/public/manual.md` → 0.
6. **HTML ritirato** — `git ls-files docs/OPERATIONAL_MANUAL.html` è vuoto e `git grep -l OPERATIONAL_MANUAL -- ':!docs/superpowers'` non elenca riferimenti vivi a un file che non esiste; `scripts/doc-paths-guard.test.js` è verde.
7. **Processo allineato** — la skill `operational-manual` e `/sync-docs` §5b/5c nominano `handbook/public/manual.md` e non parlano più di screenshot né dell'HTML.
8. **Suite verde** — `npm test`.

## Scope escluso (confermato dall'utente il 2026-11-13)

- Screenshot e immagini nel manuale, e con loro B-459 (riscrittura dei percorsi delle immagini in `help.html`), B-460 e B-461 (controllo delle immagini nel guard). Restano aperti per il ciclo che aggiungerà le immagini.
- B-463 e B-464 (commenti di `scripts/classify-cycle.mjs`): non selezionati.
- Qualsiasi modifica a `help.html`, a `js/lib/handbook.js`, ai guard e a nginx.
- Nuove funzioni dell'app; documenti `restricted/` (architettura, test case, checklist).
- Traduzioni, esportazione in PDF o altri formati.

## Domande aperte per `/brainstorming`

1. **Struttura:** per pagina del menu (come `CLAUDE.md`) o per flusso e ruolo (come l'HTML attuale, per area)? Un solo `manual.md` lungo o più capitoli? Il manifest oggi ha un solo documento `manual`.
2. **`<details>` e sanificazione:** il brief del viewer (domanda 5) prevedeva che il manuale usasse `<details>` grezzo; come è stata risolta la sanificazione del Markdown e il `<details>` si vede in `help.html`? L'HTML attuale usa «▸ Details» per punto.
3. **La skill `operational-manual`:** adattarla a scrivere il Markdown senza screenshot, oppure ritirarla e lasciare solo il riferimento di contenuto? Che fine fa il «PDash detail-content reference (as of 2026-10-09)» (SKILL.md line 66), che duplica il PRD?
4. **Fonte di verità:** PRD, riferimento della skill e manuale diventano tre copie: quale è la fonte e come si evita la deriva?
5. **Il Changelog dell'HTML:** si migra, si riscrive o si lascia fuori?
6. **Perdita degli screenshot:** ritirando l'HTML le 16 immagini escono dal repo; restano nella storia (`67f5c7d`, `2fb1ea1`). Va bene come punto di partenza per il ciclo delle immagini?
7. **Verifica del contenuto:** come si prova che ogni capitolo corrisponde alla realtà (browser su stack di branch, capitolo per capitolo, o solo confronto col codice)?

Brief ready. Next step: /brainstorming.
