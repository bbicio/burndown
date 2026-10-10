# Handoff — cold review del programma di ottimizzazione processi (Tier 0 → ciclo 6)

Il programma è **chiuso**: Tier 0 più sei cicli, tutti mergiati e pushati, l'ultimo il 2026-10-10
(`639f57a`, poi `3edd128` per i doc). `main` è pulito, nessun worktree aperto, `npm test` verde a
46 file / 972 test.

**Questa non è un'altra iterazione del programma. È l'unica cosa che il programma non ha mai avuto:
un occhio fresco sull'impianto risultante.** Ogni ciclo è stato revisionato sul proprio diff. Nessuno
ha mai letto *insieme* i pezzi che ne sono usciti.

---

## Perché esiste, detto senza abbellimenti

Tre fatti, tutti verificabili nei report citati sotto:

1. **In sei cicli sono stati modificati i meccanismi che governano i cicli stessi**: il Gate 2 e il
   Gate 3 di `/finish-cycle`, il classificatore, due skill (`sync-docs`, `operational-manual`) e
   `PROCESS.md`. Chi ha scritto quelle modifiche è la stessa entità che poi le ha eseguite, ciclo dopo
   ciclo, senza che nessuno guardasse il risultato complessivo.
2. **Il ciclo 5 è andato in produzione senza alcuna code review** (forma Tier 0, deroga §3 annotata).
   Il ciclo 4 ne ha avuta una che ha trovato 13 finding, **6 dei quali affermazioni false scritte
   dall'esecutore stesso**. Il ciclo 6 ne ha avuti 15 su due round, **di cui un Critical che tutte e
   tre le prove formali del ciclo avevano superato**.
3. **Il tasso di auto-inganno è misurato, non supposto.** Tre cicli su sei hanno prodotto affermazioni
   false scritte dall'esecutore: ciclo 4 (6 claim), ciclo classificatore (3 messaggi di commit), ciclo
   6 (un "nessun test copre questo" e due cifre di byte). Vedi `feedback_doc_split_prose_claims` in
   memoria, che ora elenca **tre superfici distinte** dello stesso difetto.

Un revisore fresco è l'unico controllo che non è mai stato applicato a questo impianto.

---

## Dove sono le cose

- Checkout principale: `C:\Users\Fabrizio.Fortini\Progetti\burndown`, branch `main` a `3edd128`.
- **Memoria** (fuori dal repo, non nei diff):
  `~/.claude/projects/C--Users-Fabrizio-Fortini-Progetti-burndown/memory/`, indice `MEMORY.md`.
  Leggere per primo `project_process_optimization_plan.md`: è il registro ciclo per ciclo, con le
  decisioni blindate e il perché di ogni forma scelta.
- **Report dei cicli**, in ordine:

| | Ciclo | Merge | Report |
|---|---|---|---|
| Tier 0.1 | timing nel report di `/finish-cycle` | `5b21bd6` (diretto) | — |
| Tier 0.2 | puntatore `sync-docs` §1 corretto | `1bb1796` (diretto) | — |
| 1 | Gate 3 lanciato in parallelo al Gate 2 | `3524c65` | `2026-10-09-worktree-gate3-parallel-…` |
| 2 | ramo no-code del Gate 2 | `689992a` | `2026-10-09-worktree-no-code-gate2-…` |
| — | `classify-cycle.mjs` (non numerato) | `821daf3` | `2026-10-09-worktree-classify-cycle-…` |
| 3 | `TEST_CASES.md` reso sorgente di `test-cases.html` | `ba4ffc3` | `2026-10-09-worktree-test-cases-from-markdown-…` |
| 4 | split di `PRD.md` in `docs/prd/` | `02bec81` | `2026-10-10-worktree-prd-slim-split-…` |
| 5 | `architecture-guard.test.js` | `660ae1e`/`3bc4428`/`43762c7` (diretti) | — (analisi in `docs/handoff-ciclo5.md`) |
| 6 | split `CLAUDE.md` fase 3 + `claude-md-guard.test.js` | `639f57a` | `2026-10-10-worktree-claudemd-split-phase3-…` |

  I due cicli senza report (Tier 0 e 5) sono **proprio quelli senza code review**: forma Tier 0,
  commit diretti su `main`. Non è una coincidenza da ignorare in una cold review.

---

## L'impianto da revisionare

**Artefatti di processo, 1.310 righe in tutto** — questo è l'oggetto della review, non i diff:

| File | Righe | Cosa governa |
|---|---|---|
| `.claude/commands/finish-cycle.md` | 199 | i 6 gate; modificato da Tier 0.1, ciclo 1, ciclo 2, ciclo 6 |
| `docs/superpowers/PROCESS.md` | 206 | le 7 fasi, §6 esecuzione proporzionata; modificato dai cicli 1, 2, 4, 6 |
| `.claude/skills/sync-docs/SKILL.md` | 96 | cosa si aggiorna a fine ciclo; modificato da Tier 0.2, cicli 3, 4, 6 |
| `scripts/classify-cycle.mjs` + `.test.js` | 121 + 254 | la regola no-code, in codice invece che in prosa |
| `scripts/architecture-guard.test.js` | 232 | `ARCHITECTURE.md` §5/§6 vs codice |
| `scripts/claude-md-guard.test.js` | 202 | dimensione di `CLAUDE.md` + integrità dei puntatori |

**Documenti, misurati tutti in byte LF** (la differenza CRLF/LF vale ~1 byte per riga e ha già
prodotto due cifre sbagliate in questo programma — non confrontare `git show | wc -c` con
`wc -c` sul working tree):

| | prima (`5b21bd6~1`) | ora (`HEAD`) | |
|---|---|---|---|
| `CLAUDE.md` | 89.327 | **61.999** | −31%; è l'unico caricato per intero ad ogni sessione |
| `ARCHITECTURE.md` | 87.261 | 76.800 | −12% |
| `PRD.md` | 113.975 | **6.469** | il contenuto è in `docs/prd/`, 9 file |
| `TEST_CASES.md` | 204.202 | 205.435 | invariato per dimensione, ma **ora è codice** |

Più `docs/db/` e `docs/ops/` (nuove, un file ciascuna), `docs/prd/` (9 file), e i `docs/pages/`,
`docs/js/`, `docs/api/` cresciuti dai cicli 4 e 6.

---

## Cosa dovrebbe effettivamente cercare la review

Non "i diff sono corretti" — quello è già stato chiesto, ciclo per ciclo. Le domande che nessuno ha
mai posto sull'insieme:

1. **I sei gate di `/finish-cycle` reggono ancora come procedura unica?** Il Gate 2 ha due rami
   (ordinario / no-code), il Gate 3 ha tre percorsi di ingresso (review raccolta dal Gate 2, skip
   totale, review scoped) e un cap a 3 round con tre opzioni di uscita. Nessuno ha mai letto il
   comando dall'inizio alla fine *dopo* tutte e quattro le modifiche. **Il primo tentativo del ciclo 1
   è fallito esattamente così** — quattro round, 33 finding, nessuna convergenza, perché l'asincronia
   era stata infilata in una checklist sincrona. La versione tenuta è minima proprio per questo: la
   domanda è se il minimo sia ancora coerente dopo altre tre modifiche sopra.
2. **`PROCESS.md` descrive ancora il processo che `/finish-cycle` esegue davvero?** Sono due documenti
   separati, aggiornati da cicli diversi, e `PROCESS.md` §7 limita quando può essere toccato. Il
   ciclo 5 ha esplicitamente giudicato il proprio gate §7 "non scattato" su una lettura stretta,
   annotando la tensione residua invece di risolverla.
3. **Le tre guardie (`classify-cycle`, `architecture-guard`, `claude-md-guard`) si contraddicono o si
   sovrappongono?** Sono state scritte da tre cicli diversi con tre autori-momento diversi. Ciascuna
   dichiara i propri limiti nel proprio header; **nessuno ha mai confrontato i tre elenchi di limiti**
   per vedere se insieme lasciano un buco che nessuna copre.
4. **La regola di routing di `sync-docs` §2 è ancora applicabile da chi la legge a freddo?** È stata
   modificata quattro volte. Il ciclo 6 ha scoperto che il blocco `File structure` era già fuori regola
   su 13 voci su 40 — pinnate come debito, non corrette.
5. **Il programma ha reso il processo più veloce, o solo più sorvegliato?** I campi di durata esistono
   dal Tier 0.1 e il ciclo 6 è il primo con un set completo (~45 minuti, di cui 26 di Gate 3). Il
   guadagno dichiarato del ciclo 1 (10-20 min/ciclo) **non è mai stato misurato**. Un revisore con tre
   report datati in mano può dire qualcosa che nessun ciclo singolo poteva.

---

## Tensioni note, già identificate e deliberatamente NON risolte

Non sono scoperte da rifare: sono il punto di partenza. Se la review le conferma, va bene; se trova
che una è peggiore di come è registrata, quello è il risultato.

- **`finish-cycle.md` `:27` vs `:49`** — il preambolo sul teardown dice che `down` può girare solo dove
  lo dice lo step 6, ma il percorso `rebuild` dello step 1 lo esegue comunque. Preesistente al
  programma, lasciato per scelta dell'utente nel ciclo 2 per non mezzo-sistemarlo da un bullet a valle.
- **Il paragrafo di classificazione del Gate 2** era ~1.200 parole per una regola a tre clausole; il
  ciclo del classificatore l'ha portato a 148 parole spostando la regola in codice. Il revisore di
  quel ciclo raccomandò di non toccarlo in un round 3 ma di farne un ciclo a sé: **non è mai stato
  fatto**, ed è da rivalutare se oggi serva ancora.
- **`finish-cycle.md:143`** dice ancora "PRD.md-conditional", formulazione precedente allo split del
  ciclo 4.
- **`ARCHITECTURE.md` tiene una propria lista parallela delle migrazioni**, terza copia, a cui mancano
  `027` e `028`. Il ciclo 6 ha aggiunto un puntatore e una nota "known to lag"; la deduplicazione no.
- **`api/package.json` ha `"migrate": "node src/db/migrate.js"`** che rieseguirebbe i backfill
  apply-once `023` e `027`. Non documentato da nessuna parte. *Non verificato: se qualcuno lo usi.*
- **Le shape client-side `CostGrid`/`Project` non sono documentate da nessuna parte** dopo che il ciclo
  4 ha cancellato §12.2/§12.3 del PRD (erano stale, non duplicate — `days` dove il codice usa ore).
- **`docs/prd/pipeline.md` §4.9** dice ancora "Cost Grid Editor (overlay)", in contraddizione con §3.
- **13 voci su 40 del blocco `File structure`** superano il limite di 1-2 righe della regola che le
  governa. Pinnate esattamente, non corrette: il debito è visibile e misurato per scelta.
- **La colonna `Auth` di `ARCHITECTURE.md` §6 e i tipi delle colonne di §5** non sono coperti da
  `architecture-guard` (7 file su 21 usano `router.use`; per i tipi servirebbe uno schema vivo). Resta
  scoperta la classe del finding #10 dell'audit 2026-09-17.

---

## Trappole per chi esegue la review

- **`/finish-cycle` carica il proprio testo dal checkout principale, non dal worktree.** Una modifica
  al comando si esercita solo nel ciclo *successivo*. Questo ha reso i cicli 1 e 2 incapaci di
  esercitare la propria stessa modifica — è scritto nei loro report e va tenuto presente leggendo le
  loro conclusioni.
- **Misurare sempre nella stessa unità.** `git show <sha>:file | wc -c` dà byte LF; `wc -c` sul working
  tree dà CRLF. Differenza = numero di righe. Due cifre sbagliate in questo programma nascono di qui.
- **La memoria non è nei diff.** Se la review vuole sapere perché una forma è stata scelta, la risposta
  è quasi sempre in `project_process_optimization_plan.md`, non in un commit.
- **I report sotto `docs/superpowers/` sono un registro immutabile.** Citano sezioni che nel frattempo
  si sono spostate: è corretto che sia così, non vanno "corretti".
- **Opus è a limite settimanale fino al 2026-10-14 07:00** (Europe/Rome). Due review di questo
  programma sono già state degradate a Sonnet per questo. Se la cold review deve girare su Opus, va
  pianificata dopo quella data; se gira su Sonnet, vale la pena annotarlo — nel ciclo 6 Sonnet ha
  comunque trovato il Critical.
- **Non è un ciclo di fix.** La cold review *verifica e basta*, come un `domain-audit`: nessuna
  correzione durante la review, finding fuori scope in una sezione a parte. Gli eventuali fix si
  raggruppano dopo, con `audit-to-brief`.

---

## Forma suggerita (da confermare con l'utente, non da assumere)

La skill `domain-audit` è esattamente lo strumento: scope negoziato prima di leggere, evidenza
`file:riga` per ogni claim, root-cause prima di classificare, mai un fix durante l'audit, finding fuori
scope isolati. Report in `docs/superpowers/audits/`.

**Scope proposto:** "l'impianto di processo risultante da Tier 0 + cicli 1-6 — `finish-cycle.md`,
`PROCESS.md`, `sync-docs/SKILL.md`, i tre file di guardia — letto come un insieme unico, con il
*ground truth* che è il comportamento effettivo dei comandi e dei test, non la prosa che li descrive."

Tre domande da decidere con l'utente **prima** di iniziare:

1. **Scope**: solo i 1.310 righe di artefatti di processo, oppure anche i documenti ristrutturati
   (`CLAUDE.md`, `ARCHITECTURE.md`, `PRD.md`+`docs/prd/`, `TEST_CASES.md`) e la coerenza fra loro?
2. **Le tensioni note qui sopra**: confermarle e basta, o verificarne una per una la descrizione?
3. **Modello e tempistica**: aspettare Opus (dal 14/10) o procedere su Sonnet subito?

---

## Cosa NON è in scope

Il prodotto. Nessuna pagina, nessuna API, nessuno schema: il programma non ha toccato runtime in
nessuno dei sei cicli, tranne il ciclo 3 (`test-cases.html`, pagina dev-only senza navigazione). Gli
audit di riconciliazione `PRD.md`-vs-app e `ARCHITECTURE.md`/`CLAUDE.md`-vs-codice sono **altri due
audit**, con cadenza propria in `PROCESS.md` §2 — non vanno confusi con questo, che guarda il processo,
non il prodotto.
