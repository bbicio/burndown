# Brief — Sicurezza nel processo di sviluppo

**Tipo:** evoluzione del processo (Scenario 2), confermato dall'utente il 2026-11-16.
**Origine:** la serie di fix nata da `docs/superpowers/audits/2026-11-15-security-review-audit.md` (S-01..S-10). Finita la serie, la sicurezza deve diventare un controllo ordinario di ogni ciclo, non un'iniziativa a sé.
**Ordine:** dopo i cicli di sicurezza già aperti (`2026-11-16-security-c7-terms-sanitize-brief.md`, `2026-11-16-security-c8-csp-script-src-brief.md`), per decisione dell'utente.
**Vincolo guida dell'utente:** non appesantire il processo più del necessario.

## Problema

Al termine di un ciclo nessun passo verifica che il codice nuovo o modificato resista sul piano della sicurezza. Nella serie security la `/security-review` è stata lanciata a mano. Un ciclo ordinario che aggiunge una route, un input o un rendering di dati utente arriva al merge con la sola `/code-review`, che cerca difetti di correttezza.

## Comportamento attuale

- **Nessun passo di sicurezza nel processo.** `docs/superpowers/PROCESS.md` cita `security-review` solo per distinguerla da `domain-audit` (`:62`, `:121`). `.claude/commands/finish-cycle.md` non cita mai `/security-review` né `npm audit`. Verifica: `grep -rn "security-review\|npm audit" .claude/ docs/superpowers/PROCESS.md`.
- **La `/security-review` gira solo se qualcuno la lancia.** Nei cicli 1-6 è stata lanciata a mano prima di `/finish-cycle`. Fonte: i report `docs/superpowers/reports/2026-11-1[56]-security-c*-finish-cycle.md`, per esempio il c6 a `:26`. Nel ciclo 1 ha trovato un difetto che il Brief non conteneva: il `?next=` non validato di `terms.html`.
- **La classe di rischio copre solo una parte della superficie.** `high-risk` include "autenticazione o permessi" (`PROCESS.md` §6.1b) e porta `/code-review` a effort high. Non riconosce come rischio di sicurezza i nuovi input o le route, il rendering di dati utente, le dipendenze, `nginx.conf` o `api/Dockerfile`.
- **`/finish-cycle` ha già lo slot dove inserire il passo.** `/code-review` parte in background all'apertura del Gate 2 (§6.4b) e il Gate 3 ne tratta i finding: tre opzioni nel round 1, la regola applicata ai round successivi, il tetto di 3 round (`finish-cycle.md`, Gate 3 step 3).
- **La classificazione meccanica di un diff ha già un modello.** `scripts/classify-cycle.mjs` decide in base ai path ed è pinnato da `scripts/classify-cycle.test.js`. Allo stesso modo lavora `scripts/gate5-scope.mjs`.
- **Controlli di sicurezza automatici già presenti:** `scripts/cdn-integrity-guard.test.js`, `scripts/security-headers-guard.test.js`, `js/lib/notification-url-guard.test.js` e i controlli `SEC-*` in `test-api.js`. `/sync-docs` chiede di aggiornare il loop SEC-01 quando cambia l'auth di un endpoint (`.claude/skills/sync-docs/SKILL.md:55`).
- **Lezione dei cicli 4 e 5:** i guard che leggono JS, HTML o markdown con le regex hanno prodotto finding di revisione a ogni round, senza convergere (report c4 e c5, Gate 3).

## Comportamento atteso

1. **Revisione di sicurezza a fine ciclo, solo quando serve.** `/finish-cycle` esegue `/security-review` sul diff del branch quando il diff tocca una superficie di sicurezza. La decisione la prende un comando sui path, non un giudizio. Non si esegue quando il diff non tocca nessuna superficie di sicurezza.
2. **Niente tempo aggiunto sul percorso critico.** La revisione di sicurezza parte in background con `/code-review`, all'apertura del Gate 2, con gli stessi vincoli di §6.4b.
3. **I suoi finding passano dal Gate 3 come quelli della code review:** stesso round, stesse opzioni, stesse regole sui follow-up e sui round successivi.
4. **Security by design a monte, leggero.** Brief e Spec rispondono a una domanda sola: il ciclo aggiunge o cambia input, route, permessi, rendering di dati utente o dipendenze? La forma esatta (una domanda o una riga) la decide `/brainstorming`.
5. **Dipendenze controllate meccanicamente.** `npm audit` gira quando il diff cambia un `package.json` o un lockfile. Fase ed esito bloccante si decidono in `/brainstorming`.
6. Il report del ciclo dichiara se la revisione di sicurezza è girata, perché, e con quanti finding.

## Vincoli

- **Il vincolo dell'utente:** nessuna fermata umana nuova e nessun passo che giri su ogni ciclo a prescindere dal diff.
- **Regole nel codice, non in prosa.** La lista delle superfici sta in uno script con il suo test, come per `classify-cycle.mjs`. `PROCESS.md` rimanda allo script. La lista non si ripete nei documenti.
- **Niente nuovi guard che leggano codice con le regex** (lezione dei cicli 4 e 5). Un guard nuovo è ammesso solo se il controllo sta in un modulo testabile.
- **Una regola vive in un solo file** (`CLAUDE.md`, "Writing documentation"). `finish-cycle.md` porta il comportamento, `PROCESS.md` il principio e il rimando.
- Gli override di `CLAUDE.md` restano invariati: `/finish-cycle` resta il terminale del ciclo, valgono le regole sulle approvazioni di §6b e la sicurezza Docker.
- Il ciclo stesso è un ciclo di processo (`docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`), quindi è almeno `standard` per §6.1b.

## Criteri di accettazione

1. Esiste un comando che, dato il diff di un branch, dice se richiede la revisione di sicurezza. Un test pinna la regola, con almeno un caso positivo e uno negativo per ogni superficie.
2. `finish-cycle.md` lancia `/security-review` in background all'apertura del Gate 2 solo quando quel comando lo richiede, e il Gate 3 ne raccoglie i finding insieme a quelli di `/code-review`.
3. Una run di sicurezza morta, scaduta o senza esito leggibile vale "non revisionata" e il Gate 3 la rilancia, come per `/code-review`.
4. Su un diff che non tocca nessuna superficie di sicurezza, `/finish-cycle` non lancia `/security-review` e il report lo dice.
5. `feature-brief` (e la Spec, attraverso il suo template o `/brainstorming`) porta la domanda di security by design del punto 4 del comportamento atteso.
6. `npm audit` gira alle condizioni del punto 5 del comportamento atteso, nella fase e con l'esito decisi dalla Spec.
7. `PROCESS.md` descrive il principio e rimanda a script e comando senza ripetere la regola. `npm test` è verde, guard documentali inclusi.

## Scope escluso (confermato dall'utente il 2026-11-16)

- Audit di sicurezza periodici sull'intera codebase (una cadenza fissa come l'audit del 2026-11-15).
- Regole per la produzione: Azure, `PDash_To_Prod`, deploy. Il compose del repo non è quello di produzione.
- Chiusura dei finding aperti: B-489..B-502 e i cicli c7 e c8 già aperti restano cicli a sé.

**Non escluso:** nuovi guard automatici su pattern insicuri sono ammessi dallo scope, entro il vincolo sulle regex. Se servano lo decide `/brainstorming`.

## Domande aperte per `/brainstorming`

1. **Quali superfici fanno scattare la revisione:** tutto `api/`, o solo route, middleware e servizi? Le pagine `.html` e `js/` che mostrano dati, `nginx.conf`, `api/Dockerfile`, `docker-compose.yml`, i `package.json`? Sono incluse le modifiche ai soli test?
2. **Legame con la classe di rischio:** la revisione di sicurezza dipende anche da `<risk-class>`, o solo dai path? Va aggiunta una categoria di sicurezza a `high-risk` in §6.1b?
3. **Una run o due:** `/security-review` resta una run separata da `/code-review`, oppure si estende il prompt di `/code-review`? Che effetto ha sul tetto dei 3 round e sui round scoped successivi: si rilancia anche la sicurezza sui fix?
4. **Skip:** come si combina con lo skip di §6.4 (revisione finale di subagent-driven già fatta) e con il ramo no-code di §6.4c?
5. **`npm audit`:** al Gate 1 o al Gate 3? Bloccante a quale severità? Con `--omit=dev` o no? Su `api/` e sulla root?
6. **Security by design:** domanda in `feature-brief`, sezione della Spec, o entrambe? Cosa fa `/brainstorming` quando la risposta è "sì": alza la classe di rischio o aggiunge criteri di accettazione?
7. **`/security-review` su un branch:** il comando built-in lavora sulle "pending changes" del branch corrente. Va verificato che copra `main...HEAD` in un worktree, e come gli si passa lo scope di un round successivo.
