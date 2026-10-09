# Handoff — ciclo 5 (`ARCHITECTURE.md` §5/§6)

> **ESEGUITO il 2026-10-10, in forma Tier 0 — questo documento è il record dell'analisi, non un
> piano aperto.** L'utente ha scelto la **Decisione 1, opzione «test di guardia»**: nessun
> generatore, nessun riconciliatore, nessuna riscrittura di §5/§6. Il risultato è
> `scripts/architecture-guard.test.js` (7 asserzioni) più la correzione di 9 difetti reali di §6 che
> il test ha fatto emergere. Commit diretti su `main`, nessun branch, nessun `/finish-cycle` — quindi
> **nessun Gate 3**: deroga §3 concordata in conversazione e annotata nei commit.
> Le Decisioni 2, 3 e 5 sono decadute (esistevano solo per il generatore). Le 670 righe di §5/§6
> **restano**: la scelta è stata impedire la deriva, non ridurre il file. Vedi il fondo del documento
> per cosa resta aperto.

Il ciclo 4 (`PRD.md` slim + split) è chiuso: merge `02bec81`, docs+report `75953e7`,
report `docs/superpowers/reports/2026-10-10-worktree-prd-slim-split-finish-cycle.md`.
`main` è pulito e pushato. Nessun worktree aperto.

## Dove sono le cose

- Checkout principale: `C:\Users\Fabrizio.Fortini\Progetti\burndown`, branch `main` a `75953e7`.
- Memoria: riga "Process optimization plan" di `MEMORY.md` → `project_process_optimization_plan.md`,
  bullet **Cycle 5**. Il bullet **Cycle 4**, appena riscritto, contiene nove sotto-bullet di esiti
  misurati che vale la pena leggere prima: tre riguardano direttamente questo ciclo (vedi sotto).
- Audit di riferimento: `docs/superpowers/audits/2026-09-17-architecture-claude-vs-app-behavior-audit.md`
  (22 finding).
- Precedente da studiare: il ciclo `classify-cycle` (merge `821daf3`, report
  `docs/superpowers/reports/2026-10-09-worktree-classify-cycle-finish-cycle.md`). È lo stesso problema
  di fondo — *smettere di scrivere logica come prosa e poi revisionare la prosa* — e la sua soluzione
  è un'alternativa concreta a quella che il programma prescrive qui. Vedi "Decisione 1".

## Cosa dice il programma

> **Cycle 5 — `ARCHITECTURE.md` §5/§6 generated** da `scripts/gen-architecture.mjs` (schema dalle
> migrazioni, tabella endpoint da `router.*` + middleware di auth). Quelle due sezioni sono 670 di
> 1145 righe (58%) e sono una copia tenuta a mano di ciò che il codice già dichiara — la maggior
> parte dei 22 finding dell'audit del 2026-09-17. NON è un no-code cycle (aggiunge uno script
> eseguibile) — deliberato: la whitelist sbaglia per eccesso di prudenza. **NON fondere
> `ARCHITECTURE.md` in `CLAUDE.md`.**

## Due premesse del programma NON hanno superato la verifica (misurato 2026-10-10)

### 1. «La maggior parte dei 22 finding» è falso: sono 7, forse 8

Contati sugli heading dell'audit, uno per uno:

- **§5 Database Schema — 4 finding:** #1 (Critical, manca tutto lo schema multi-valuta), #9 (manca
  `projects.code`), #10 (`project_tasks.start_date` dato `CHAR(6)`, è `CHAR(8)`), #12 (manca
  `cg_version_projects.task_ids`).
- **§6 API Reference — 3 finding:** #3 (Major, `currencies.js` assente, 5 endpoint non documentati),
  #14 (`reporting.js`'s `GET /phasing` e `/project-phasing`), #15 (`exports.js`'s `GET /phasing`).
- **Adiacente — 1:** #2 (quattro migrazioni assenti sia dalla tabella di `CLAUDE.md` sia da §8).

**Gli altri ~14 riguardavano l'albero delle directory §7, lo snippet `docker-compose.yml`, la guardia
Docker, le descrizioni di codice morto** — cioè esattamente la classe di difetti che **il ciclo 4 ha
appena affrontato** portando l'albero da 148 a 66 righe e instradando la narrativa nei file `docs/`.
Quel lavoro è fatto; non va rifatto qui, e non va usato per giustificare questo ciclo.

Resta un beneficio reale (il finding #1 era Critical e #3 Major), ma è **più stretto di come il
programma lo descrive**. Vale la pena ridiscuterlo con l'utente prima di investire un ciclo intero.

### 2. I numeri di riga sono cambiati

Misurato oggi: `ARCHITECTURE.md` è **1069** righe (non 1145 — il ciclo 4 ha accorciato l'albero).
**§5 = 438 righe** (8 sottosezioni, da `## 5. Database Schema` a `## 6.`), **§6 = 232 righe**.
Totale **670 = 62%** del file. Le 670 sono ancora esatte; la percentuale no.

## Il problema centrale: nessuna delle due sezioni è generabile come il programma assume

Questo è il punto da capire **prima** di scrivere una riga di spec. Misurato, non dedotto.

### §5 non è derivabile dalle migrazioni con un parser

- 30 file di migrazione contengono **38 `CREATE TABLE`, 33 `ALTER TABLE`, 3 `DROP COLUMN`**. Lo stato
  corrente dello schema **non** è l'unione dei `CREATE`: va ricostruito applicandole in ordine. Un
  parser che legge i `CREATE` produce uno schema sbagliato in silenzio — lo stesso genere di difetto
  che il ciclo esiste per rimuovere.
- La via praticabile è **introspezionare uno schema vero**: `scripts/run-tests.sh` costruisce già uno
  stack effimero isolato applicando *tutte* le migrazioni a un DB vuoto. Interrogare
  `information_schema` lì dà lo stato corretto per costruzione. Costo: il generatore richiede Docker.
- **Ma §5 non è solo SQL.** Contiene **104 righe di commento scritte a mano dentro i blocchi SQL**
  (semantica: `terms_version INTEGER, -- migration 014: last accepted T&C version (NULL = never
  accepted)`; provenienza: `-- 018_sysadmin_role.sql`) e **362 righe di prosa fuori dai blocchi**
  (righe seminate, note di ri-destinazione: *«now repurposed as pure draft storage (migration 019);
  no longer read by the acceptance gate or by GET /api/auth/me's current_terms_version»*).
  Nessuna di queste è nel database. **Un generatore che riscrive §5 le distrugge tutte.**

### §6: tre colonne su quattro sono derivabili, la quarta no

- Derivabili: `Method`, `Endpoint`, `Auth`. Il codice dichiara **165 handler `router.*`** e usa tre
  soli middleware (`requireAuth` 130 volte, `requireAdmin` 66, `requireSysAdmin` 8).
- **Non derivabile: `Description`.** §6 ha **154 righe di tabella, 66 delle quali con una descrizione
  oltre gli 80 caratteri** — regole di business, allentamenti datati con la loro motivazione,
  riferimenti a funzioni di regola (`roleChangeError()`, `sysAdminTargetError()`), note su race
  condition. Esempio reale: *«2026-09: relaxed from admin, same reason; if the program already has ≥1
  linked project, caller must be admin or owner/editor on at least one of them»*. Non sta in nessun
  `router.*`.
- **Prova che il valore c'è comunque:** 165 handler nel codice contro ~131 righe-dato documentate. La
  divergenza esiste già adesso e un riconciliatore la trova il primo giorno — è il finding #3
  dell'audit, ripetuto.

### Conseguenza: l'artefatto giusto probabilmente non è un generatore

Un generatore sovrascrive e perde le colonne umane. Quello che il materiale chiede è un
**riconciliatore**: emette le colonne meccaniche, **preserva** quelle scritte a mano con chiave
`(method, endpoint)`, e **segnala la deriva nelle due direzioni** (endpoint nel codice assenti dal
documento, righe nel documento senza route corrispondente). È un design diverso e più difficile di
quello che il programma descrive in una riga.

## Da decidere con l'utente PRIMA di iniziare

1. **Generatore, riconciliatore, o test di guardia?** La terza opzione non è nel programma ma è la più
   in carattere con questo progetto e con il suo successo più recente: il ciclo `classify-cycle` non
   ha generato prosa, ha **spostato la regola nel codice e l'ha pinnata con un test**. L'equivalente
   qui è un `scripts/architecture-guard.test.js` che **fallisce quando §6 e le route divergono** e
   quando §5 e lo schema divergono — nessuna riscrittura, nessuna prosa perduta, il difetto emerge al
   Gate 1 invece che in un audit otto settimane dopo. Più economico e più sicuro di un generatore.
   Costo: non elimina le 670 righe, le rende solo non-derivabili-in-silenzio. Se l'obiettivo vero è
   **ridurre** il file, serve il generatore; se è **impedire la deriva**, serve il test. Sono obiettivi
   diversi e il programma li confonde.
2. **Sorgente di verità per §5:** parsing delle migrazioni (fragile, 33 `ALTER`) o introspezione dello
   schema reale via `scripts/run-tests.sh` (corretto per costruzione, richiede Docker nel ciclo).
3. **Che fine fanno i 104 commenti semantici e le 362 righe di prosa di §5**, e le 66 descrizioni
   scritte a mano di §6. Opzioni: preservarle per chiave, spostarle in una sezione a parte "note
   semantiche", o dichiarare esplicitamente che si perdono. **Non è una scelta implementativa: è la
   scelta di scope del ciclo.**
4. **Branch + worktree + `--no-ff`, oppure commit diretti su `main`?** Da chiedere ogni volta
   (decisione blindata 2026-10-08). Qui il branch è fortemente indicato comunque: il ciclo aggiunge
   codice eseguibile, quindi prende i gate completi.
5. **Includere la tabella migrazioni di `CLAUDE.md`?** È una terza copia degli stessi fatti (le
   migrazioni, §5, e quella tabella) ed è la classe del finding #2. Fuori scope salvo decisione.

## Classificazione prevista: `ordinary`, non no-code

`scripts/gen-architecture.mjs` (o `.test.js`) è un path non-`.md`, quindi
`node scripts/classify-cycle.mjs` dirà `ordinary`. Deliberato.

**Tensione nota, da mettere sul tavolo e non scoprire al Gate 2:** sul ramo ordinario il Gate 2 chiede
*«Have you manually verified this in the browser?»*. Se il diff tocca solo `ARCHITECTURE.md` e
`scripts/`, quella domanda non ha più risposta onesta di quanta ne avesse sul ciclo 4 — ma il ramo
no-code non scatta, perché la whitelist guarda i path e non l'argomento. Il ciclo `classify-cycle` ha
già vissuto questo caso e si è classificato `ordinary`. Decidere in anticipo se si risponde con una
deroga §3 annotata nel report, o se si considera la verifica soddisfatta dall'esecuzione dello script.

## Trappole note

- **`vitest.config.js` include già `scripts/**/*.test.js`** (verificato: riga 6, aggiunto dal ciclo
  `classify-cycle`). Un nuovo test sotto `scripts/` è raccolto da `npm test` senza toccare la config.
  Non è una trappola: è una trappola *evitata*, non reintrodurla cercando di "wirare" il runner.
- **`ARCHITECTURE.md` è CRLF.** `core.autocrlf=true` e l'indice è già LF, quindi git normalizza da sé:
  il rischio reale è il **BOM**, non i line ending. Mai `Get-Content`/`Set-Content` di PowerShell su
  file del repo; verificare con `file` (nomina il BOM esplicitamente) e `git diff --numstat`. Questa
  correzione è stata fatta nel ciclo 4 — la memoria `feedback_powershell_bom_html_edits` resta valida
  sul BOM, non sui line ending.
- **Un generatore che riscrive §5/§6 in blocco produrrà un `numstat` da riscrittura totale del file**,
  che è esattamente il sintomo di un BOM e farà scattare la review. Progettare per diff minimi
  (riscrivere solo le righe cambiate), altrimenti ogni run è irrevisionabile.
- **`/finish-cycle` carica il testo del comando dal checkout principale, non dal worktree:** una
  modifica al comando si esercita nel ciclo successivo, non in quello che la introduce.
- **Il Gate 3 non si salta su un diff di sola prosa**, e le round successive vanno **scoped** ai soli
  commit di fix (§6.4 di `PROCESS.md` vieta la doppia review dello stesso diff).
- **Lezione del ciclo 4, la più rilevante per questo:** la metà *generata* (nove file, 817 righe, mai
  ridigitate) ha prodotto **zero** finding; la metà *compressa a mano* (53 voci d'albero riscritte) ne
  ha prodotti **sei**, tutti affermazioni più ordinate del vero — un assoluto falso, un puntatore al
  file sbagliato, una contraddizione lasciata nella frase appena modificata. Se questo ciclo riscrive
  prosa a mano, aspettarsi la stessa resa. Generare batte ridigitare; e ciò che non si può generare,
  meglio non riscriverlo affatto. Vedi `feedback_doc_split_prose_claims`.

## Aperti, adiacenti, NON in scope salvo decisione contraria

Dal ciclo 4 (tutti nel suo report, sezione "Code review follow-ups"):
- **Le shape degli oggetti lato client non sono documentate da nessuna parte.** §12.2/§12.3 del PRD
  sono state cancellate come "duplicati" ma erano **stale** (dicevano `days` dove il codice usa *ore*,
  `title` dove usa `phaseName`/`taskName`). La cancellazione regge, la motivazione nel commit no.
  Ri-documentare `CostGrid`/`Project` richiede una lettura di `js/api-sync.js`.
- `docs/prd/pipeline.md` §4.9 dice ancora "Cost Grid Editor (overlay)" — contraddice §3, corretto nello
  stesso ciclo; non toccato per non violare il contratto verbatim.
- Fatti orfani non ri-alloggiati: `login.html` Sign In + Forgot con pre-fill, `strengthClass` condiviso,
  le note di `auth.css`, i nomi dei token Nav-B2.
- `.claude/commands/finish-cycle.md:143` dice ancora "PRD.md-conditional".
- `docs/css/stylesheets.md` porta ancora claim `?v=N`: candidata allo stesso trattamento ricevuto
  dall'albero (la deriva è già avvenuta in entrambe le direzioni).

Dai cicli 2 e 3:
- Contraddizione preesistente `:27`-vs-`:49` in `finish-cycle.md` (il preambolo sul teardown dice
  "solo allo step 6", ma il ramo `rebuild` dello step 1 lo esegue pure).
- Riduzione di prosa del paragrafo di classificazione del Gate 2 (~1.200 parole per una regola a tre
  clausole, metà già in `PROCESS.md` 4c).
- I tre low rinviati dal ciclo 3 (parser: commenti multi-riga e badge `node:test`; `formatCell` dentro
  `data-id`).

## Una cosa che non è un ciclo

I cicli 1–4 sono stati una serie sullo stesso impianto di processo: hanno modificato il Gate 2, il
Gate 3, il classificatore e due skill. Nessuno dei quattro ha avuto una **cold review** d'insieme —
non sui diff singoli, già revisionati, ma sull'impianto risultante. La riga di chiusura di
`/finish-cycle` la suggerisce proprio per questo caso. Da valutare prima o dopo il ciclo 5, non
dentro.
