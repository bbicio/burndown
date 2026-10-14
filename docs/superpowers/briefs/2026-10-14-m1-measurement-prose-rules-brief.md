# Brief — M1: misurazione dei cicli + regole di scrittura della prosa

**Classificazione (dichiarata dall'utente, 2026-10-14):** Scenario 1 (nuova feature) per lo script di
misurazione; Scenario 2 (evoluzione) per l'header della Spec, il report del Gate 5 e `CLAUDE.md`.
Fonte: voce M1 del backlog di processo unificato (memoria di progetto), che riprende **B4** di
`docs/superpowers/audits/2026-10-10-process-cost-audit.md` e la tabella di misure di
`docs/superpowers/audits/2026-10-12-process-improvement-notes.md` §6.

## Current behavior (parte Scenario 2)

- **Report del Gate 5.** L'header porta `Execution started`, `Merged at`, `Gate durations` e
  `Claims pre-check` (`.claude/commands/finish-cycle.md` righe 167-170); i timestamp sono raccolti in
  sessione dal pre-flight step 6 (riga 12), con `unknown` per un valore non catturato. Nessun campo
  conta dispatch di subagent, round di review o ripetizioni dei test.
- **Fase prima del closeout.** Nessun timestamp: l'audit del 2026-10-10 (riga 106) rileva che Brief,
  brainstorming, Spec, Piano ed esecuzione non sono misurati. Gli header di Spec e Piano portano solo
  la data (es. `docs/superpowers/specs/2026-10-13-backlog-follow-up-design.md`, riga 3).
- **Fonti già in git.** Commit della Spec, commit del Piano, primo e ultimo commit di
  implementazione, commit di merge: tutti recuperabili come author date. **Il Brief no:** non tutti i
  cicli ne committano uno (la spec citata sopra dice «No brief»).
- **Regole di scrittura.** Esistono solo i controlli *dopo* la scrittura: Gate 1 step 0 e il suo
  rilancio a ogni round del Gate 3 (`.claude/commands/finish-cycle.md` righe 16-21 e 93,
  `docs/superpowers/PROCESS.md` §6.4d), più i guard di §4b. Nessuna regola su *come* si scrive.
- **`CLAUDE.md`.** Margine sotto il tetto di `scripts/claude-md-guard.test.js` (riga 116): meno di
  quanto servono le nuove righe. Il blocco `### File structure` è fissato a un numero esatto di byte
  (stesso file, test successivo), quindi una riga d'indice nuova richiede di alzare quel numero.
  Comando per rimisurare: `tr -d '\r' < CLAUDE.md | wc -c`.

## Expected behavior

1. **Script di misurazione retroattiva (Scenario 1).** Uno script sotto `scripts/`, lanciato a mano,
   nessun gate lo esegue e non scrive file. Stampa una riga per ciclo chiuso, con i tempi ricavati
   dalle author date git: Spec committata, Piano committato, inizio e fine esecuzione, merge, e gli
   intervalli fra questi. Un valore non ricavabile è stampato come `unknown`, mai stimato.
2. **Inizio del Brief/brainstorming.** Chi scrive la Spec annota in una riga del suo header l'ora di
   inizio del Brief/brainstorming. Lo script la legge quando c'è; per i cicli passati è `unknown`.
3. **Tre contatori nel report del Gate 5:** dispatch di subagent, round di review, ripetizioni dei
   test. Registrati per i cicli da M1 in poi.
4. **Regole di scrittura in `CLAUDE.md`, solo lì, in 3-4 righe:**
   - la regola si scrive senza la sua motivazione;
   - niente numeri o conteggi: si cita il comando o il test che li misura;
   - una regola vive in un solo file, gli altri la linkano;
   - quando la review trova una frase falsa, valutare di toglierla prima di riformularla.
   Nessun rimando da `PROCESS.md`, `/finish-cycle` o `/sync-docs`.
5. **Spazio in `CLAUDE.md`.** Lo stesso ciclo libera il margine necessario spostando un blocco di
   narrativa in `docs/` **verbatim**, senza riscrivere né accorciare la prosa esistente.

## Constraints

- Il tetto di `scripts/claude-md-guard.test.js` non si alza; il pin del blocco `File structure` si
  alza solo se lo script entra nell'indice, come decisione visibile.
- Spostamento verbatim: verificare cosa sta fra l'intestazione della sezione spostata e la successiva
  prima di fidarsi di una prova byte per byte (lezione della fase 3 dello split di `CLAUDE.md`).
- Il ciclo applica a se stesso le quattro regole di scrittura che introduce.
- Un valore non misurato resta `unknown` (stessa regola dei `Gate durations`).
- Testo per l'utente in inglese; script senza dipendenze nuove.

## Acceptance criteria

1. Lo script esiste sotto `scripts/`, gira con un solo comando documentato e stampa una riga per ogni
   ciclo con report in `docs/superpowers/reports/`, con `unknown` dove git non dà il dato.
2. Il formato dell'header della Spec ha la riga di inizio Brief/brainstorming, e lo script la legge.
3. Il template del report in `.claude/commands/finish-cycle.md` porta i tre contatori, con la regola
   `unknown` per un valore non registrato.
4. `CLAUDE.md` contiene le quattro regole in un solo punto; `grep` delle quattro regole in
   `PROCESS.md`, `.claude/commands/` e `.claude/skills/` non trova copie.
5. `npm test` è verde, incluso `scripts/claude-md-guard.test.js`, senza alzare il tetto.
6. Il blocco spostato in `docs/` è byte-identico all'originale, e il puntatore in `CLAUDE.md` risolve
   (`scripts/claude-md-guard.test.js`, `scripts/doc-paths-guard.test.js`).

## Explicitly excluded scope (confermato dall'utente)

- Rimodellare il tetto di `CLAUDE.md` (budget separati indice/narrativa): resta voce di backlog.
- Ricostruire i tre contatori per i cicli passati: lo script misura solo i tempi da git.
- Consumo del piano Pro e interruzioni per quota.
- Un guard test per le quattro regole di scrittura.
- Implicito nel backlog: M4, M6, backup del DB a intervalli di tempo.

## Open questions per `/brainstorming`

1. Come lo script associa ogni ciclo alla sua Spec, al suo Piano e ai suoi commit di esecuzione
   (dal report? dal merge commit? dal nome del branch?), e cosa fa con i cicli senza Spec o Piano.
2. Definizione esatta dei tre contatori — in particolare «ripetizioni dei test»: quali esecuzioni
   contano — e come vale `0` per un ciclo eseguito inline (nessun dispatch).
3. Dove stanno i contatori nel report: nuova riga d'header accanto a `Gate durations`, o dentro
   «Gate outcomes».
4. Quale blocco di narrativa spostare da `CLAUDE.md` e in quale file `docs/`.
5. Dove si colloca la sezione con le regole di scrittura in `CLAUDE.md`.
6. Se lo script entra nell'indice `File structure` di `CLAUDE.md` (pin da alzare) o no.
7. Se lo script ha un proprio `*.test.js` sotto `scripts/`.
