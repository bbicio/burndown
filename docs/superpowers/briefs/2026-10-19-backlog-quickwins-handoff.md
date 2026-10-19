# Handoff — backlog: ciclo di correzioni rapide (documentazione, test, una pagina)

Selezione del 2026-10-19 dalle righe aperte di `docs/BACKLOG.md`. È **un solo ciclo** che raccoglie i tre gruppi proposti: 1 documentazione, 2 solo test, 3 piccole correzioni su `portfolio.html` e `planning.html`. Nessun file in `api/`, nessun file condiviso con `?v=`.

## Perimetro

**Documentazione**
- **B-017** — `TEST_CASES.md` dice ancora "moved to Config → Clients" e "14 pages".
- **B-018** — `docs/prd/pipeline.md` §4.9 chiama ancora l'editor un overlay.
- **B-019** — citazioni PRD appese: `§11.3` in `docs/prd/planning.md`, `§16.9a` in `docs/prd/administration.md`. La riga non dice quale sia la sezione giusta: leggere le due sezioni e decidere se correggere o togliere.
- **B-020** — `.claude/commands/finish-cycle.md` descrive ancora il PRD come file singolo condizionale.
- **B-066, B-067** — `docs/superpowers/plans/2026-10-14-m1-measurement-prose-rules.md`: Task 4 Step 4 si aspetta un `diff` vuoto; il ledger cita una spec che non c'è più e porta due conteggi contro la regola "niente numeri".

**Solo test**
- **B-114** — la guard "a phone narrows --app-pad" in `js/lib/content-surface-guard.test.js` taglia dal primo `@media (max-width: 767.98px)` a fine file: deve verificare che la regola stia dentro quel blocco.
- **B-097** — `js/lib/page-head-guard.test.js` controlla le emoji solo nei `.ph-title` statici; `planningTitle` in `planning.html` è calcolato e può riprenderle con la suite verde.

**Pagine**
- **B-016** — le intestazioni dicono "Project Portfolio" (`portfolio.html` righe 29 e 319, quest'ultima è il link "indietro") e "Resource Planning" (`planning.html`, `planningTitle` e il commento riga 29), mentre menu, titolo e breadcrumb dicono "Portfolio" e "Planning". Leggere la voce di menu in `js/nav.js` per il testo esatto prima di scegliere.
- **B-070** — `kpiLeftColor()` in `portfolio.html` (riga 1534) restituisce `'#fd7e14'`. Il token `--kpi-orange` ha lo stesso valore: usare `var(--kpi-orange)`. Attenzione: B-113 segna quei token come senza consumatori, quindi questa correzione ne rende uno vivo; aggiornare B-113 di conseguenza.
- **B-106** — la toolbar di `planning.html` sborda a 375px. **Non verificato:** misurarlo prima (`scripts/shoot.mjs`, vedi `docs/scripts/shoot.md`) e correggere solo se confermato. Le regole stanno in `css/style.css` righe 491-493 (`.pl-toolbar*`), che è un file versionato: la correzione richiede il bump `?v=` su tutte le pagine che lo caricano e l'aggiornamento di `js/lib/nav-shell-guard.test.js`. Se la correzione non si risolve con una o due regole, **uscire dal perimetro** e lasciare la riga aperta con la misura.

**Fuori perimetro:** B-115 (commento in `css/style.css`) — andrebbe nello stesso bump di B-106; includerlo solo se B-106 viene corretto, altrimenti un bump per un commento non vale.

## Prima di toccare qualcosa

Le verifiche nel backlog hanno date tra 2026-10-13 e 2026-10-19. Rieseguire il comando di ogni riga e chiudere come "già a posto" quelle che non reggono più.

## Come eseguirlo

- **Modalità: nativa** — voci indipendenti e piccole, nessun sottoagente.
- **Classe di rischio: standard** se B-106 tocca `css/style.css` (file condiviso: sarebbe `high-risk` per §6.1b di `docs/superpowers/PROCESS.md`, leggere la regola); `low-risk` se il ciclo resta su documenti, test e HTML di una pagina. Dichiarare la classe nel Piano e rileggere §6.1b invece di fidarsi di questo rigo.
- **Modello:** Sonnet per le correzioni, Opus per `/finish-cycle`.
- **Branch e worktree:** `git worktree add .claude/worktrees/backlog-quickwins -b backlog-quickwins` dal checkout principale, su `main`. Copiare `.env` dal checkout principale; lo stack di branch serve per la verifica visiva.
- **Brief e Spec:** non servono, il backlog è già l'elenco con le verifiche. Un Piano di una pagina con la riga `**Risk class:**` basta se `scripts/decision-ledger-guard.test.js` lo richiede.
- **Un commit per voce**, con l'id nel messaggio, così il Gate 3 può scegliere per voce.

## Cose da sapere per `/finish-cycle`

- `TEST_CASES.md` conta come **codice** per `scripts/classify-cycle.mjs`, e qui ci sono comunque HTML e test: il ciclo è `ordinary`. Il Gate 2 chiede la verifica nel browser — controllare le intestazioni di `portfolio.html` e `planning.html`, il colore del "left" dei KPI e, se corretto, la toolbar a 375px.
- Dopo una modifica a `TEST_CASES.md`, `js/lib/test-cases-parse.test.js` pinna i conteggi esatti di casi e sezioni. Correggere un testo senza aggiungere o togliere righe di tabella non li cambia; se li cambia, aggiornare i due numeri nello stesso commit, mai ridurre l'asserzione a una soglia.
- B-020 modifica un comando di `/finish-cycle`: al Gate 5 `/sync-docs` decide, leggendo il diff, se rientra nella condizione 3 del gate di `PROCESS.md`. Una correzione di sola dicitura sul PRD non è un cambio di gate.
- Il pre-check delle affermazioni (Gate 1 step 0) si applica a ogni `*.md` toccato: rieseguire il grep di ogni frase che le correzioni asseriscono.
- Chiudere le righe con il comando che le ha verificate nella colonna `Verified how`, non con la frase del report. Nessun file in `api/`: niente backup, migrazioni né restart.
- Titoli e testi dell'interfaccia restano in inglese.

## Dopo

Restano aperti i follow-up di `docs/BACKLOG.md` non elencati sopra; il prossimo candidato sono le righe `B-105`, `B-107` e `B-109` (scostamenti dalle tavole del ciclo precedente), che chiedono prima una misura a schermo.
