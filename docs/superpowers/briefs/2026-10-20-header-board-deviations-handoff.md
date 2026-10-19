# Handoff — backlog: scostamenti dalle tavole del ciclo header (B-105, B-107, B-109, B-111)

Selezione del 2026-10-20 dalle righe aperte di `docs/BACKLOG.md`, indicate come prossimo candidato dal report `docs/superpowers/reports/2026-10-20-backlog-quickwins-finish-cycle.md`. Tre scostamenti segnalati al Gate 2 o al Gate 3 del ciclo `header-unification-content`, più B-111, che sta sulla stessa regola di B-105. Nessun file in `api/`.

## Perimetro

- **B-105** — il CTA primario di `pipeline.html` (`.ph-btn-primary`, `css/style.css` riga 76, `height: 32px`) è più basso di quello delle tavole. **Non verificato:** misurare il bottone nella tavola `docs/superpowers/design/header/header_pipeline_model.jpg` e nel rendering (`scripts/shoot.mjs`) prima di decidere. `.ph-btn-primary` è usato da più pagine: `grep -rn "ph-btn-primary" --include=*.html .` per l'elenco. Un'altezza diversa vale per tutte, quindi va confrontata anche con le altre tavole `header_*` della stessa cartella.
- **B-111** — stessa regola: `.ph-btn-primary` ha altezza fissa e niente `white-space: nowrap`, quindi un'etichetta che va a capo ("Publish to SIP →" in `costgrid.html`, con `.ph-side` stretta) esce dal box. Correggerla insieme a B-105, perché toccano la stessa dichiarazione.
- **B-107** — le card di `_db-reset.html` sarebbero attaccate l'una all'altra. **Non verificato:** `#resetCards` ha ancora `gap: 1rem` nel CSS inline della pagina. Prima di toccare qualcosa, misurare con `shoot.mjs` (la pagina è sysadmin: servono le credenziali di un sysadmin in `.env`, vedi `docs/scripts/shoot.md`) e capire se il gap non si applica o se lo scostamento è un altro (bordo, sfondo). Se la misura non lo conferma, chiudere la riga come "non riprodotto" con la misura.
- **B-109** — `--card-danger-border` è `1px solid var(--color-danger)`, mentre prima del ciclo `.danger-card` aveva `2px solid #dc3545` (`git show 6834c18^1:_db-reset.html`). Il reviewer lo aveva preso per un bordo troppo leggero sulle card distruttive. La decisione (tornare a 2px o tenere 1px) è dell'utente: presentarla nel Piano come decisione aperta, con le due card affiancate a schermo. `js/lib/content-surface-guard.test.js` riga 36 pinna il valore: va aggiornato nello stesso commit se cambia.

**Fuori perimetro:**
- B-110 (valori lunghi nei tile del programma), B-112 (toolbar di planning mista), B-113 (token `--kpi-*` senza consumatori), B-116 (`?v=` vecchi citati nei documenti), B-117 (copertura della guard sui titoli calcolati): restano aperte.
- Il valore esadecimale inline `border-color:#0d6efd` in `_db-reset.html` (la card "Change proposal owner") viola la regola dei token. Se il ciclo apre comunque quella pagina per B-107, si può includere. In quel caso aggiungere una riga di backlog e chiuderla nello stesso ciclo.

## Prima di toccare qualcosa

Le righe B-105 e B-107 sono state riportate dall'utente guardando gli screenshot, e nessuno le ha misurate. Il primo passo è la misura, non la correzione: stack di branch su (`scripts/test-branch.sh up`), poi `MSYS_NO_PATHCONV=1 node scripts/shoot.mjs --base http://localhost:8081 ...` alle larghezze delle tavole, e **rileggere i PNG** confrontandoli con le tavole. Una riga che non si riproduce si chiude con la misura nella colonna `Verified how`.

## Come eseguirlo

- **Modalità: nativa.** Le voci sono poche e piccole, B-105 e B-111 toccano la stessa regola: nessun sottoagente.
- **Classe di rischio:** quasi certamente `high-risk`, perché B-105/B-111 toccano `css/style.css` e B-109 tocca `css/tokens.css`, file condivisi caricati da più pagine. Rileggere §6.1b di `docs/superpowers/PROCESS.md` e dichiararla nel Piano, invece di fidarsi di questo rigo. Se dopo la misura resta solo B-107 (CSS inline di una pagina), la classe scende.
- **Cache-busting:** ogni file versionato toccato richiede il bump `?v=` su tutte le pagine che lo caricano (`grep -oh "css/style.css?v=[0-9]*" *.html | sort | uniq -c`, idem per `tokens.css`). `js/lib/nav-shell-guard.test.js` pinna `style.css`, `js/lib/foundations-guard.test.js` pinna `tokens.css`.
- **Modello:** Sonnet per le correzioni, Opus per `/finish-cycle`.
- **Branch e worktree:** `git worktree add .claude/worktrees/header-board-deviations -b header-board-deviations` dal checkout principale, su `main`, con il Piano già committato. Copiare `.env` dal checkout principale.
- **Piano:** di una pagina, con `**Branch:**`, `**Risk class:**` e il ledger `## Decisioni aperte`, che `scripts/decision-ledger-guard.test.js` richiede. Ci va B-109 (1px o 2px) come decisione aperta, con le alternative.
- **Tavole in ogni verifica:** confrontare il rendering con la tavola, non a memoria. Un confronto non fatto vuol dire voce non chiusa.
- **Un commit per voce**, con l'id nel messaggio.

## Cose da sapere per `/finish-cycle`

- Il ciclo è `ordinary`: c'è CSS. Il Gate 2 chiede la verifica nel browser: CTA su pipeline e costgrid (anche a una larghezza dove "Publish to SIP →" andrebbe a capo), card di `_db-reset.html`, bordo delle card distruttive.
- **Celle `Verified how` del backlog:** nell'ultimo ciclo hanno prodotto quasi tutti i finding dei round 2 e 3. Niente `|` nudi dentro una cella (rompono la tabella) e niente alternanza `\|` nei grep (la tabella resa la toglie): usare `grep -e … -e …`. Rieseguire il comando prima di scriverne l'output.
- Nessun file in `api/`: niente backup, migrazioni né restart.
- Testi dell'interfaccia in inglese.

## Dopo

Restano B-110, B-112, B-113, B-116 e B-117. B-110 e B-112 sono anche loro scostamenti visivi del ciclo header e potrebbero formare il ciclo successivo. B-113 e B-116 sono pulizie piccole.
