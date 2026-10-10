# Handoff — ciclo 6 (`CLAUDE.md`, fase 3)

Il ciclo 5 è chiuso: tre commit diretti su `main` in forma Tier 0 (`660ae1e` nove fix di §6,
`3bc4428` `scripts/architecture-guard.test.js`, `43762c7` il record dell'analisi), più `39f2d8d`.
`main` è pulito e pushato. Nessun worktree aperto. **È l'ultimo ciclo del programma.**

## Dove sono le cose

- Checkout principale: `C:\Users\Fabrizio.Fortini\Progetti\burndown`, branch `main` a `39f2d8d`.
- Memoria: `MEMORY.md` → `project_claudemd_doc_split.md`. **Leggi quel file per primo**: contiene lo
  scope della fase 3 già concordato con l'utente, i tre "move" e la mitigazione obbligatoria del
  move 4. Due delle sue voci "aperte" sono però scadute — vedi sotto.
- Report delle fasi 1+2: `docs/superpowers/reports/2026-10-08-worktree-worktree-claudemd-split-finish-cycle.md`
  (merge `8b24f9c`).
- Regola di routing che governa tutto: §2 di `.claude/skills/sync-docs/SKILL.md`. **Leggi gli heading
  del file, non un numero citato in prosa** — quei numeri si sono già spostati due volte.

## Perché questo ciclo è diverso dagli altri cinque

`CLAUDE.md` è **l'unico documento caricato per intero all'avvio di ogni sessione**: la sua dimensione
è un costo in token **per sessione**, non per ciclo. Verificato direttamente: in questa sessione
`CLAUDE.md` è arrivato nel prompt di sistema, mentre `ARCHITECTURE.md` e `PRD.md` ho dovuto leggerli
con uno strumento. È la ragione per cui questo ciclo vale più del 5 e va fatto anche se il programma
è "finito".

## I numeri, rimisurati il 2026-10-10 (quelli in memoria sono invecchiati)

| | Memoria (2026-10-08) | Misurato oggi |
|---|---|---|
| `CLAUDE.md` | 88.827 B dopo le fasi 1+2 | **91.694 B** (~23k token), 548 righe |
| blocco `File structure` | ~11.300 B | **12.587 B**, 97 righe |
| move 4 (somma delle 7 sezioni) | ~17 KB | **20.535 B** |
| move 5 (`DB migrations`) | ~7,3 KB | **8.292 B**, 40 righe |
| move 6 (`Database backup & full recreation`) | ~5,5 KB | **6.868 B**, 71 righe |
| obiettivo dichiarato | ~52 KB | **non più raggiungibile: ~56-59 KB** |

**Il fatto che conta più di tutti: `CLAUDE.md` è ricresciuto di ~2,9 KB in due giorni** (88.827 →
91.694), per effetto dei cicli 3, 4 e 5 che hanno aggiunto voci. Il blocco `File structure` è risalito
da ~11,3 a 12,6 KB. **Lo split non è un lavoro una volta sola: è una pulizia che va mantenuta**, e
l'unica cosa che la mantiene è la regola di §2 applicata ad ogni `/sync-docs`. Una delle voci di
ieri — la mia, su `architecture-guard.test.js` — era di 8 righe contro una regola che dice "una o
due", ed è stata rimpicciolita in `39f2d8d` prima di scrivere questo handoff. Aspettarsi di trovarne
altre.

Somma dei tre move: **35.695 B**. 91.694 − 35.695 = **56.000 B circa**, più il residuo che resta
inline per forza (invarianti, il comando delle migrazioni, le tre regole che mordono): realisticamente
**~58-59 KB, ~15k token**. L'obiettivo "~52 KB" della memoria nasceva da una base di 88,8 KB e da
move più piccoli: **non va ripetuto come se valesse ancora.**

## Lo scope, già concordato con l'utente (non reinventarlo)

- **Move 4 — 20.535 B, nessun cambio di regola.** Narrativa specifica di una pagina che siede in
  sezioni cross-cutting di `CLAUDE.md`, da spostare dove la regola già dice:
  `docs/pages/pipeline.md` ← `Detail panel` (3.030 B), `Filter bar` (2.951 B), `Column header totals`
  (1.131 B), `Pipeline board layout` (2.406 B); `docs/pages/costgrid.md` ← `New Proposal / Clone`
  (3.736 B), `Version tab switching` (2.267 B); `docs/js/nav.md` ← `Navigation: sidebar and icon
  navbar` (5.014 B).
- **Move 5 — 8.292 B, RICHIEDE CONFERMA.** La tabella `DB migrations` → `docs/db/migrations.md`,
  lasciando inline solo il comando e le tre regole che mordono (i backfill apply-once 023 e 027, e il
  fatto che `test-branch.sh` non applica le migrazioni). **La regola attuale dice esplicitamente che
  le migrazioni restano in `CLAUDE.md`**: questo move la cambia, quindi va confermato per sé.
- **Move 6 — 6.868 B, RICHIEDE CONFERMA.** `Database backup & full recreation` → `docs/ops/database.md`.
  **Il blocco `Infrastructure safety` resta inline**: è una regola di sicurezza nata da un incidente
  reale (2026-08-05, volume dati azzerato) e deve stare sempre in contesto. Non spostarlo, non
  "accorparlo" al move 6.

## La mitigazione obbligatoria del move 4 — il punto in cui questo ciclo può fare danno

Diverse di quelle sezioni contengono **invarianti imperativi**, non spiegazioni:

- `Pipeline board layout`: **«do NOT add `h-100` to the columns row»** — Bootstrap `.h-100` usa
  `!important` e romperebbe il layout flex nascondendo la colonna.
- `Version tab switching` / costgrid: la regola di specificità `:where(.cg-grid) :where(th, td)`.
- `Navigation B2`: la lista dei 14 id DOM consumati da `notifications.js`, il vincolo "mai due
  navigazioni", le altezze da rimisurare.

**Regola per il move 4:** l'imperativo di una riga resta inline, in una sezione `Invariants` compatta;
si sposta **solo la spiegazione**. Diversi di questi sono inoltre pinnati da test di guardia
(`nav-layout-guard`, `costgrid-guard`, `foundations-guard`, e da ieri `architecture-guard`) — che sono
una rete più affidabile della prosa. **Dove esiste un test, cita il test invece di ripetere la
regola.** Dove non esiste, la riga imperativa non si sposta.

## Due voci "aperte" della memoria sono SCADUTE — non rilavorarle

La memoria `project_claudemd_doc_split.md` elenca due open item che i cicli successivi hanno chiuso:

1. **«`ARCHITECTURE.md`'s own `Directory structure` section is 18,8 KB … natural next candidate after
   phase 3»** — **falso oggi**: il ciclo 4 l'ha portata a **7.684 B / 74 righe** applicando la stessa
   regola di routing, e il ciclo 5 ha aggiunto un test che impedisce alla riga `routes/` di
   divergere. Non c'è più un candidato da 18,8 KB.
2. **«`test-cases.html` … is documented nowhere in `CLAUDE.md`»** — **falso oggi**: il ciclo 3 lo
   documenta nella riga collettiva `HTML pages` del blocco (4 occorrenze in `CLAUDE.md`), incluso il
   fatto che `TEST_CASES.md` conta come codice.

Correggere quelle due righe in memoria fa parte di questo ciclo (è lavoro di `/sync-docs` §7).

## Da decidere con l'utente PRIMA di iniziare

1. **Branch + worktree + `--no-ff`, oppure commit diretti su `main`?** Da chiedere ogni volta
   (decisione blindata 2026-10-08). Input onesto per questa scelta: il ciclo 4, uno spostamento di
   prosa su 15 file, ha prodotto **13 finding, 6 dei quali affermazioni false create dalla
   compressione stessa**, e il Gate 3 li ha intercettati tutti. Il ciclo 5, in forma Tier 0, **non ha
   avuto alcuna code review**. Questo ciclo è della stessa specie del 4, non del 5: molti file, prosa
   spostata, invarianti imperativi in mezzo. **Il branch è fortemente indicato.**
2. **Move 5: si sposta la tabella delle migrazioni?** Cambia una regola scritta. Se sì, cosa resta
   inline esattamente (il comando, i due backfill apply-once, la nota su `test-branch.sh`).
3. **Move 6: si sposta la procedura di backup/ricreazione?** Con `Infrastructure safety` che resta.
4. **Si fanno tutti e tre, o solo il move 4?** Il move 4 è il 58% del guadagno e **non richiede
   conferme** perché non cambia nessuna regola. È un ciclo legittimo da solo.
5. **Si aggiunge una guardia contro la ricrescita?** Non è nello scope concordato, ma è il dato nuovo
   di oggi: il file è ricresciuto di 2,9 KB in due giorni. Un test che fallisce quando `CLAUDE.md`
   supera N byte, o quando una voce del blocco supera 2 righe, è lo stesso schema del ciclo 5 e
   costerebbe poche righe. **Senza qualcosa del genere, la fase 3 verrà erosa come lo sono state le
   fasi 1+2.** Da valutare esplicitamente, non da assumere.

## Classificazione prevista

Se il ciclo tocca solo `CLAUDE.md` e file `.md` sotto `docs/`, `node scripts/classify-cycle.mjs` dirà
**`no-code`** e il Gate 2 prenderà il ramo senza codice (mostra il diff, chiede di confermare la
classificazione, non chiede la verifica browser, non smonta nulla, e **il controllo out-of-scope del
Gate 4 non scatta** — va annotato nel report). Quel ramo è stato percorso per la prima volta dal ciclo
4 e ha funzionato: non è più non verificato.

**Se invece si aggiunge la guardia della decisione 5**, il ciclo diventa `ordinary` (un `.test.js` non
è un `.md`) e il Gate 2 chiederà la verifica browser su un diff che non contiene nulla che il browser
possa mostrare. Il ciclo 5 ha avuto la stessa tensione. Deciderlo in anticipo: deroga §3 annotata, o
niente guardia in questo ciclo.

## Trappole note

- **`CLAUDE.md` è CRLF.** `core.autocrlf=true` e l'indice è già LF, quindi git normalizza: il rischio
  reale è il **BOM**, non i line ending. Mai `Get-Content`/`Set-Content` di PowerShell su file del
  repo; verificare con `file` (nomina il BOM esplicitamente) e `git diff --numstat` (una riscrittura
  totale del file è il sintomo). Vedi `feedback_powershell_bom_html_edits`, valida sul BOM.
- **Spostare verbatim, non riscrivere.** È la lezione misurata del ciclo 4: la metà *generata* (nove
  file, 817 righe, mai ridigitate) ha prodotto **zero** finding; la metà *compressa a mano* (53 voci)
  ne ha prodotti **sei**, tutti affermazioni più ordinate del vero. Qui non c'è nulla da generare,
  quindi la difesa è l'altra: **tagliare e incollare, e non parafrasare mai una regola mentre la si
  sposta.** Se una sezione sembra meritare una riscrittura, quella è una decisione a parte da
  proporre, non da infilare nello spostamento.
- **I `docs/pages/` di destinazione esistono già e sono grossi** (`costgrid.md` 45 KB, `portfolio.md`
  26 KB, `pipeline.md` 8 KB, `docs/js/nav.md` 15 KB). Si innesta nella struttura esistente: niente
  file nuovi dove uno già c'è, e `reuse-before-duplicate` di §2 vale anche qui.
- **`docs/db/` e `docs/ops/` NON esistono ancora** (lo conferma un `ls docs/`): i move 5 e 6 li
  creerebbero. Se i due move non si fanno, non crearli vuoti.
- **`/finish-cycle` carica il testo del comando dal checkout principale, non dal worktree:** una
  modifica al comando si esercita nel ciclo successivo.
- **Il Gate 3 non si salta su un diff di sola prosa**, e le round successive vanno **scoped** ai soli
  commit di fix (§6.4 di `PROCESS.md`).

## Aperti, adiacenti, NON in scope salvo decisione contraria

Dal ciclo 5:
- La colonna `Auth` di §6 e i *tipi* delle colonne di §5 non sono coperti dalla guardia (7 file su 21
  usano `router.use`; per i tipi serve uno schema vivo). Resta scoperta la classe del finding #10
  dell'audit (`CHAR(6)` vs `CHAR(8)`).
- `docs/css/stylesheets.md` porta ancora claim `?v=N`, già derivati una volta in entrambe le
  direzioni. Candidata allo stesso trattamento ricevuto dall'albero.

Dal ciclo 4:
- Le shape degli oggetti lato client (`CostGrid`/`Project`) non sono documentate da nessuna parte: §12.2/§12.3
  del PRD sono state cancellate come "duplicati" ma erano **stale** (`days` dove il codice usa ore,
  `title` dove usa `phaseName`/`taskName`). Richiede una lettura di `js/api-sync.js`.
- `docs/prd/pipeline.md` §4.9 dice ancora "Cost Grid Editor (overlay)", in contraddizione con §3.
- Fatti orfani non ri-alloggiati: `login.html` Sign In + Forgot con pre-fill, `strengthClass`
  condiviso, le note di `auth.css`, i nomi dei token Nav-B2.
- `.claude/commands/finish-cycle.md:143` dice ancora "PRD.md-conditional".

Dai cicli 2 e 3:
- Contraddizione `:27`-vs-`:49` sul teardown in `finish-cycle.md`.
- Riduzione di prosa del paragrafo di classificazione del Gate 2.
- I tre low rinviati dal ciclo 3.

## Dopo questo ciclo il programma è chiuso

Il ciclo 6 è l'ultimo dei sei. Resta una cosa che non è un ciclo e che nessuno dei sei ha avuto: una
**cold review** d'insieme. In sei cicli sono stati modificati il Gate 2, il Gate 3, il
classificatore, due skill e `PROCESS.md`; il ciclo 4 ha prodotto sei affermazioni false scritte
dall'esecutore stesso, e il ciclo 5 è andato in produzione **senza alcuna code review**. Un occhio
fresco sull'impianto risultante — non sui diff singoli, già revisionati — è l'unico controllo che
manca. Da valutare dopo il ciclo 6, non dentro.
