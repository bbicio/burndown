# Ramo "ciclo senza codice" nel Gate 2 di `/finish-cycle` — design spec (2026-10-09)

Cycle 2 del programma di ottimizzazione processi. Implementa la Decisione 1 blindata con
l'utente il **2026-10-08** e mai realizzata (`grep -i "no-code"` / `"senza codice"` su
`.claude/commands/finish-cycle.md` e `docs/superpowers/PROCESS.md`: zero occorrenze prima di
questo ciclo). La *fast lane* che occupava lo stesso slot del programma è stata **rifiutata
dall'utente il 2026-10-09** e non fa parte di questo lavoro: §3 di `PROCESS.md` ("Eccezioni
concordate") resta l'unica deroga per un ciclo micro.

Scenario **2** (evoluzione di una feature esistente), classificazione confermata dall'utente.
Modalità del ciclo: **branch + worktree + merge `--no-ff`**, scelta dall'utente al posto del
commit diretto — il valore non è l'isolamento ma il Gate 3, dato che qui si modifica un gate di
sicurezza.

---

## 1. Problema

Il Gate 2 di `/finish-cycle` è unico e incondizionato: chiede sempre
`"Have you manually verified this in the browser? [yes/no]"` (`finish-cycle.md:49`), e un "no"
*ferma il ciclo* (`:50`).

Su un ciclo il cui diff non contiene alcun file che l'app in esecuzione carica o esegue, quella
domanda **non ha una risposta onesta**: "yes" è falso, "no" blocca. Il programma di
ottimizzazione processi contiene 4 cicli di questo tipo su 6, cioè 4 occasioni di rispondere
"yes" per formalità — allo stesso gate che esiste per due incidenti reali del **2026-09-15**
(`worktree-costgrid-owner-reassign` e `worktree-planning-role-task-breakdown`, entrambi
teardown dell'ambiente prima che l'utente avesse risposto).

**La ragione di questo ciclo è l'integrità del gate, non il tempo.** I 2-5 minuti di spin-up
Docker risparmiati non la giustificherebbero da soli.

## 2. Comportamento attuale (letto nel codice)

| Elemento | Dove | Comportamento |
|---|---|---|
| Preambolo porta a senso unico | `finish-cycle.md:27` | `test-branch.sh down` solo al punto dello step 6, dopo il "yes" dell'utente |
| Step 0 | `:29`-`:34` | Lancio di `/code-review` in background all'apertura del gate |
| Step 1 | `:35`-`:41` | `test-branch.sh status`, domanda spin-up oppure reuse/rebuild |
| Step 2-4 | `:42`-`:44` | Archeologia git dei file spec/piano (incluso il walk del prefisso contiguo prima del `merge-base`) |
| Step 5 | `:45`-`:48` | Esito dei candidati trovati |
| Step 6 | `:49`-`:51` | Domanda del browser; "no" → stop; "yes" → teardown, unico punto consentito, poi Gate 3 |

Nessuna condizione sul contenuto del diff. Il **Gate 1 invece è già condizionato** (`:18`-`:20`:
suite Docker backend solo se un path inizia con `api/`), e lo stesso criterio governa migration
apply e restart del backend (`:112`, `:116`) — quindi su un ciclo senza codice tutto il resto
della catena **si auto-salta già oggi**, verificato. Il Gate 2 è l'unico punto che non lo fa.

## 3. Comportamento atteso

### 3.1 Criterio di classificazione (meccanico)

`git diff --name-only main...HEAD`. È un **ciclo senza codice** se **ogni** path restituito
corrisponde a `.claude/`, `docs/` o un `*.md` di root (nessun `/` nel path), **salvo** le
eccezioni nominate. Un solo path fuori → ciclo ordinario, gate invariato, nessuna discussione
della classificazione.

Il test è la **lista dei path**, mai un giudizio su "di cosa parla il ciclo".

**Lista vuota → ciclo ordinario.** Un "ogni path corrisponde" su zero path sarebbe vero per
vacuità, quindi va escluso esplicitamente: se il diff non restituisce alcun path, il ciclo è
ordinario. In pratica non accade (il pre-flight step 3 ferma il comando quando non ci sono
commit), ma un commit vuoto è possibile e la vacuità non deve classificare da sé.

Il nome è **"ciclo senza codice" / no-code cycle**, non "process-only": `PRD.md` e `docs/prd/`
sono documentazione di prodotto, che "process-only" classificherebbe male.

### 3.2 Eccezioni nominate — la decisione di design di questo ciclo

**Oggi la lista è vuota.** Un root `*.md` che l'app in esecuzione carica a runtime conta come
**codice** ai fini di questo criterio, perché cambiarlo cambia ciò che una pagina rende.

Motivo per cui la lista esiste già adesso, vuota, invece di essere introdotta quando servirà:

- `nginx.conf:81` (`location /`) **serve già** i `.md` di root — nessuna delle `deny` alle righe
  67-72 li copre.
- Il **Cycle 3** dello stesso programma prevede `test-cases.html` derivato da `TEST_CASES.md`
  via `fetch('/TEST_CASES.md')` a runtime, con un parser pinnato da un test in `js/lib/`.
- Da quel merge in poi `TEST_CASES.md` è un file che l'app carica: la proprietà la cui assenza
  *definisce* il ciclo senza codice cade, e un ciclo che tocca solo `TEST_CASES.md` verrebbe
  classificato senza codice pur cambiando il rendering di una pagina.

**Chi aggiorna la lista:** il ciclo che rende l'app capace di caricare quel file, nello stesso
ciclo in cui introduce il `fetch`. Il testo del gate dice *perché* la lista esiste, così che un
ciclo futuro riconosca il caso invece di dedurlo.

La stessa regola copre un file eseguibile o di configurazione **tracciato** sotto `.claude/`.
Oggi non esistono: git traccia 6 file sotto `.claude/`, **tutti `.md`**
(`commands/finish-cycle.md` e le 5 `skills/*/SKILL.md`), e `settings.local.json` è gitignorato
(`.gitignore:14`). L'hook RTK vive nel `~/.claude` globale, fuori dal repo, quindi non può
comparire in un diff di questo progetto.

### 3.3 Cosa fa il Gate 2 sul ramo senza codice

| Passo | Ramo ordinario | Ramo senza codice |
|---|---|---|
| Preambolo teardown (`:27`) | invariato | invariato (nessuno stack creato → niente su cui agire) |
| Step 0 — lancio review | esegue | **esegue** |
| Step 1 — stack Docker | esegue | salta, e non lo menziona |
| Step 2-5 — archeologia spec/piano | esegue | salta |
| Step 6 — domanda | domanda del browser | **conferma della classificazione** |
| Gate 3 | raggiunto | **raggiunto** |

**Lo step 0 non si salta.** Un diff di sola prosa è esattamente dove la revisione rende: il
ciclo di split documentale citato in memoria (`feedback_doc_split_prose_claims`) ha prodotto
**10 finding su 16** su prosa.

**Lo stack non viene mai creato**, quindi `<branch-env-active>` resta falso e il preambolo del
teardown resta vero per costruzione, senza modifiche al suo testo.

### 3.4 Forma del ramo

- `git diff --stat main...HEAD` **più** l'elenco completo dei path. È la classificazione che va
  verificata, non il contenuto: lo `--stat` da solo non mostra tutti i path quando sono molti.
- Domanda esplicita, formulazione: *"Every path in this diff is in `.claude/`, `docs/` or a root
  `*.md`, so there is nothing to verify in a browser — confirm this is a no-code cycle?
  [yes/no]"*
- Un "no", o qualunque cosa diversa da un sì chiaro: **stop and wait, do not proceed**, identico
  a `:50`. Nessun ambiente da lasciare attivo.
- Su "yes": Gate 3, dove la review lanciata allo step 0 va raccolta e i finding trattati.
- Il ramo **registra nel report del Gate 5**, sezione "What was done", di aver preso la via
  senza codice e di non aver posto la domanda del browser. Questa istruzione sta **dentro** il
  Gate 2: non introduce un campo nuovo nel template del Gate 5, e `0m (skipped)` resta riservato
  ai gate che si auto-saltano — cosa che questo gate non fa, dato che una domanda la pone.

## 4. Architettura della modifica

### 4.1 Perché un paragrafo non numerato

Il passo di classificazione entra come **paragrafo nominato e non numerato**, subito dopo il
preambolo del teardown (`:27`) e prima dello step 0.

Motivo vincolante: i numeri degli step del Gate 2 sono citati da **quattro punti** —
`:27` (→ step 6 e step 1), `:44` (→ step 6), `:50` (→ step 0) e `:55` (Gate 3 → "Gate 2
step 0"). Rinumerare per fare spazio a uno "step 0 nuovo" romperebbe tutti e quattro, più la
riga di `PROCESS.md` §1 che descrive la sequenza.

### 4.2 Le tre modifiche a `finish-cycle.md` (solo Gate 2)

1. **Nuovo paragrafo** dopo `:27`: criterio, eccezioni nominate con il loro perché, natura
   meccanica del test, e cosa accade sul ramo senza codice (step 0 sì, step 1-5 no, step 6
   ramificato, nessuno stack).
2. **Una riga** prima dello step 1: *"Steps 1-5 apply only when `<no-code-cycle>` is false; on a
   no-code cycle go straight to step 6."* Una riga sola, non una precondizione ripetuta cinque
   volte.
3. **Nuovo sotto-punto dello step 6**: il ramo senza codice come da §3.4.

**Step 0 e il preambolo `:27` restano invariati al carattere.**

### 4.3 `PROCESS.md` — §7 condizione 3 triggerata

La modifica di un gate di `/finish-cycle` rientra esplicitamente in §7 condizione 3, quindi
`PROCESS.md` va aggiornato **nello stesso ciclo**:

- **§1**, riga `/finish-cycle` della tabella: la verifica manuale acquisisce il ramo senza
  codice, criterio in una frase.
- **§6, nuovo punto `4c`**, subito dopo 4b: criterio, perché il nome è quello, perché il Gate 3
  non si salta, e la ragione d'essere (integrità del gate, non tempo). Collocato a `4c` e non a
  `6` perché 4 e 4b sono già i punti sui gate di verifica e revisione, e un "punto 6" dentro
  "§6" si legge male.

### 4.4 Line endings — trappola già incontrata

`.claude/commands/finish-cycle.md` e `docs/superpowers/PROCESS.md` sono entrambi **CRLF**, senza
BOM; i file sotto `docs/superpowers/specs/` sono **LF**. `.gitattributes` impone `eol=lf` solo
per `*.sh`. Le modifiche vanno applicate preservando CRLF e **senza introdurre un BOM** — è la
stessa classe di problema di `feedback_powershell_bom_html_edits` e il motivo per cui Tier 0 ha
usato un round trip Python. Verifica obbligatoria dopo l'edit: `git diff --numstat` (nessuna
riga toccata oltre a quelle previste) più un controllo dei primi byte.

## 5. Criteri di accettazione

1. Su un branch il cui diff è confinato a `.claude/`/`docs/`/root `*.md`, il Gate 2 **non**
   esegue `test-branch.sh status` e **non** pone la domanda del browser.
2. Su un branch con **almeno un** path fuori dalla whitelist, il Gate 2 si comporta esattamente
   come oggi: nessuna modifica testuale agli step 1-6 sul ramo ordinario.
3. Il ramo senza codice mostra `--stat` + elenco dei path e pone una domanda di conferma della
   classificazione che richiede una risposta esplicita.
4. Una risposta diversa da un sì chiaro ferma il ciclo, come `:50`.
5. Il Gate 3 è raggiunto in entrambi i rami, e lo step 0 è eseguito in entrambi.
6. `PROCESS.md` §1 e §6 descrivono il ramo e il criterio.
7. `grep -i "no-code"` restituisce risultati in **entrambi** i file. `PROCESS.md` è in italiano,
   quindi deve portare **entrambi** i nomi — "ciclo senza codice" e "no-code cycle" — altrimenti
   il criterio non è soddisfacibile e un `grep` futuro del termine inglese non troverebbe la
   regola.
8. I quattro riferimenti incrociati agli step del Gate 2 (`:27`, `:44`, `:50`, `:55`) sono
   ancora corretti dopo la modifica.
9. `finish-cycle.md` e `PROCESS.md` restano CRLF e senza BOM.

## 6. Verifica — e il suo limite, dichiarato

Non esiste alcun test automatico sulla prosa di `.claude/commands/` e **questo ciclo non ne
introduce uno**: sarebbe un sottosistema nuovo, fuori scope. La verifica è la lettura dei 9
criteri sopra più il `grep` del criterio 7. `npm test` al Gate 1 resta invariato e non è
influenzato (nessun test legge documentazione: `js/lib/money-guard.test.js` è l'unico che
cammina il filesystem e i suoi `SKIP_DIRS` escludono `docs` e `.claude`).

**Limite da scrivere nel report, non da aggirare:** questo ciclo **non può esercitare la propria
modifica**. `/finish-cycle` carica il testo del comando dal checkout principale, non dal
worktree (lezione del Cycle 1, dove lo stesso effetto ha fatto girare il flusso *pre-edit*). Il
ramo senza codice sarà percorso per la prima volta dal **ciclo successivo**, e il report di
questo ciclo deve dirlo invece di dichiararlo verificato.

Nota: questo ciclo è esso stesso un ciclo senza codice per la definizione che introduce (diff
confinato a `.claude/` + `docs/`), ma al suo Gate 2 verrà percorso il ramo ordinario, per il
motivo appena detto.

## 7. Scope escluso — confermato dall'utente (7 punti)

1. La **fast lane**: niente `*-fast.md`, niente collasso Brief+Spec+Piano. Rifiutata.
2. Qualunque modifica a **pre-flight, Gate 1, Gate 3, Gate 4, Gate 5**.
3. Il **preambolo della porta a senso unico** (`:27`) e la sua formulazione.
4. La formulazione della domanda del browser **sul ramo con codice**.
5. Rendere il **Gate 3 saltabile** su un ciclo senza codice.
6. **Estendere** la whitelist oltre i tre path (es. `scripts/`, `*.sql`): il Cycle 5 aggiunge
   uno script ed è deliberatamente classificato NON senza codice. *(Nota: §3.2 non viola questo
   punto — le eccezioni nominate* restringono *la whitelist, non la estendono.)*
7. **Automatizzare** la classificazione in uno script o in un hook.
