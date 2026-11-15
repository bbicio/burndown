# Handoff — sicurezza, ciclo 1: link delle notifiche validato (S-01)

Serie di sei cicli nata dalla security review del 2026-11-15. Questo handoff riporta chi apre la sessione al punto in cui si è fermata la precedente. Tutto ciò che segue è stato deciso dall'utente o verificato nel codice in quella sessione.

## Dove siamo

- **Audit chiuso:** `docs/superpowers/audits/2026-11-15-security-review-audit.md` (S-01..S-10, più «Ruled out» e «Out of scope»). Solo lettura del codice, nessun exploit eseguito, nessun fix applicato.
- **Raggruppamento confermato dall'utente, ordine accettato:** 1 notifiche (S-01), 2 `xlsx` (S-02), 3 token invito/reset (S-03+S-04), 4 dipendenze e CDN (S-09), 5 header/CSP (S-06), 6 hardening (S-08+S-05+S-10). Un Brief per ciclo in `docs/superpowers/briefs/2026-11-15-security-c<N>-*-brief.md`.
- **Questo ciclo ha già il Brief:** `docs/superpowers/briefs/2026-11-15-security-c1-notification-url-brief.md`. Non serve `/feature-brief`. **Prossimo passo: `/brainstorming` su quel Brief** (PROCESS.md §6b: il design concordato in chat non si ratifica due volte; si presentano solo le decisioni che potrebbero andare diversamente).

## Cosa dice il Brief, in breve

Chi è autenticato può mandare a un altro utente (admin compreso) una notifica con `url` arbitrario. Il server la salva senza controllo (`api/src/routes/notifications.js:139`, `:168`, `:179`); il client la segue con `window.location.href` (`js/notifications.js:80`, `:156`) e la mette in un `href` (`:167`); la mail la usa se inizia con `http` (`api/src/services/email.js:149`). Con `javascript:` il click esegue script nell'origine dell'app. Non riprodotto in un browser: è una lettura del codice.

## Fatti verificati che il Brief usa e che non vanno riscoperti

- I mittenti interni usano **due forme**: percorso relativo (`url: '/admin.html'`, `api/src/routes/auth.js:195`) e URL assoluto sull'origine dell'app (`${process.env.APP_URL}/pipeline.html`, `api/src/routes/cost-grids.js:1035`, `:1149`). La regola deve accettare entrambe, e rifiutare il resto.
- La modale «Send Notification» ha un campo `<input type="url">` con placeholder `/pipeline.html` (`js/nav.js:456`): invita a un percorso relativo, ma `javascript:` è un valore valido per `type="url"`, quindi il browser non lo ferma.
- `esc()` (`js/core.js:201`) sostituisce `& < > "` e non tocca lo schema dell'URL.
- Le righe già in `notifications.url` non sono mai state validate: il client deve neutralizzarle al render.

## Decisioni già prese dall'utente (non riaprirle)

- Ordine dei cicli e raggruppamento: confermati.
- Il compose del repo **non** è quello di produzione (Azure ha il proprio): non cambia questo ciclo.
- Le regole di sicurezza da aggiungere al processo (gate in `finish-cycle`, `npm audit`, ecc.) si fanno **dopo i fix**, in un ciclo a parte.
- Commit e push dei Brief e del report direttamente su `main`.

## Decisioni di design che questo ciclo deve ancora prendere (per `/brainstorming`)

1. **Forma esatta della regola**: percorso relativo (`^/`, mai `//` né `\`, nessun carattere di controllo) più URL assoluto con origine uguale a `APP_URL`. Come si confronta l'origine (parsing con `new URL`, non prefisso di stringa). Cosa succede con `APP_URL` assente.
2. **Dove vive la regola**: gemello `js/lib/<modulo>.js` ↔ `api/src/lib/<modulo>.js` (come `dates.js`, `money.js`), con test sul gemello e, se proporzionato, un guard che vieta `window.location.href = <dato>` fuori dal modulo.
3. **Righe già salvate**: neutralizzarle solo al render (minimo) o anche bonificare i dati. Il Brief non lo assume.
4. **Risposta del server** a un `url` non valido: `400` con messaggio in inglese, senza creare nessuna notifica (nemmeno in broadcast).

## Come eseguire il ciclo (regole del progetto che qui contano)

- Worktree di esecuzione come da `docs/superpowers/PROCESS.md` §6.1b, **non** con `EnterWorktree`. Un worktree nuovo non ha il `.env` gitignored: copiarlo dal checkout principale prima di `run-tests.sh` / `test-branch.sh`, senza committarlo.
- Chiusura con `/finish-cycle` (non con `superpowers:finishing-a-development-branch`). Prima di `/finish-cycle`, lanciare **`/security-review` sul branch**: è l'uso per cui quel comando è fatto (analizza il diff pendente) ed è la verifica che S-01 sia davvero chiuso e che il fix non ne introduca altri.
- Test: `npm test` (frontend) e la suite backend; casi nuovi in `test-api.js` e unit test sul modulo. I `?v=N` di ogni file versionato modificato vanno aggiornati in tutti i riferimenti (`CLAUDE.md`, «Cache-busting»).
- Nessuna operazione Docker sullo stack principale senza le tre condizioni di «Infrastructure safety»; il ciclo non ne richiede (nessuna migration). Il riavvio di `pdash-api` post-merge è coperto dalla deroga di `/finish-cycle` Gate 4.
- Ogni nuovo finding emerso durante il ciclo si isola e si propone come Brief a sé (guardia dello Scenario 3); non entra nel fix.

## Stato del repo a fine sessione

- Branch `main`, working tree: i sette file del report e dei Brief sono stati committati e pushati subito prima di questo handoff.
- Nessun branch o worktree aperto per la serie.

## Cosa non è stato fatto

- Nessuna riga di codice dell'app modificata.
- Non verificato in un browser che `javascript:` assegnato a `location.href` venga eseguito; è il primo criterio di accettazione del Brief da dimostrare con un test (jsdom) e con una prova manuale.
- Non valutati nell'audit (elencati nel suo «Out of scope»): prompt injection verso l'LLM, SRI, privilegi Postgres, topologia di produzione.
