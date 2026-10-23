# Criteri di accettazione al Gate 2, Spec e Piano congelati — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** i criteri di accettazione diventano una sezione pretesa dal guard e una lista a spunta del Gate 2; Spec e Piano non si modificano dopo l'inizio dell'esecuzione; il Gate 3 non lavora i finding su Spec/Piano né la prosa preesistente innocua.

**Spec:** `docs/superpowers/specs/2026-10-23-acceptance-criteria-frozen-spec-design.md`
**Branch:** `acceptance-criteria-frozen-spec`
**Risk class:** standard — file di processo (`docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`), nessuna categoria high-risk di §6.1b.

**Esecuzione:** nativa per §6.1 (tre file, task sequenziali: T3 usa il formato fissato in T1 e T2), worktree `.claude/worktrees/acceptance-criteria-frozen-spec` per §6.1b. I task non sono indipendenti.

## Global Constraints

- Intestazione esatta: `## Criteri di accettazione`. Voce: `N. **<etichetta breve>** — <esito verificabile>` (trattino lungo `—`). Nessuna sentinella.
- Cutoff del guard: `2026-10-24`. Documenti datati prima: non si toccano.
- Testo della domanda `"Have you manually verified this in the browser? [yes/no]"` e preambolo del teardown del Gate 2: identici a `main`.
- Lingua: `PROCESS.md` in italiano, `finish-cycle.md` e il guard in inglese, come oggi.
- Regole di scrittura di `CLAUDE.md` → "Writing documentation" (niente giustificazioni, niente conteggi in prosa).

## Review Focus

1. Un Piano con `**Spec:** nessuna — …` (la forma reale dei Piani senza Spec) deve richiedere la sezione; uno con un path tra backtick che esiste no. Test in T1.
2. Un `## Criteri di accettazione` dentro un blocco di codice o un commento HTML non conta (stessa trappola già pinnata per il ledger). Test in T1.
3. La Spec di questo ciclo è il primo documento reale nel formato: il guard deve accettarla. Test in T1.
4. Una lista con più di quattro voci, o più di sedici: `finish-cycle.md` deve dire come si spezza. Verifica in T3.
5. Ciclo no-code in cui l'utente risponde "no" alla classificazione: la lista non va richiesta una seconda volta. Verifica in T3.

---

### Task 1: quarta regola del guard

**Files:**
- Modify: `scripts/decision-ledger-guard.test.js`

**Interfaces:**
- Produces: `liveLines(markdown) -> string[]` (righe con fence e commenti HTML svuotati, logica oggi dentro `checkLedger`); `checkCriteria(markdown) -> {ok:true} | {ok:false, reason:'missing-section'|'empty-section'|'malformed-entry'}`; `criteriaInScope(relPath, markdown, exists) -> boolean`, con `exists(relPath) -> boolean`; costante `CRITERIA_CUTOFF = '2026-10-24'`.

- [ ] **Step 1: test che falliscono**, in un `describe('checkCriteria')` e un `describe('criteriaInScope')`:
  - accetta `## Criteri di accettazione\n\n1. **A** — esito.\n2. **B** — altro.\n`;
  - `missing-section` senza intestazione, con `### Criteri di accettazione`, con l'intestazione solo dentro un fence ```` ``` ```` o `~~~`, con l'intestazione solo in un commento HTML;
  - `empty-section` con corpo vuoto prima del `## ` successivo;
  - `malformed-entry` per `Nessuno.`, per una voce senza etichetta in grassetto, per una voce con `-` al posto di `—`, per un elenco puntato `- `;
  - la sezione si ferma al `## ` successivo;
  - CRLF dà lo stesso esito di LF;
  - `criteriaInScope`: Spec datata `CRITERIA_CUTOFF` → true; Spec del giorno prima → false; `*-brief.md` → false; Piano datato `CRITERIA_CUTOFF` con `**Spec:** nessuna — x` → true; con ``**Spec:** `docs/superpowers/specs/a-design.md` `` ed `exists` che risponde true → false; stesso path con `exists` false → true; Piano senza riga `**Spec:**` → true;
  - la Spec `docs/superpowers/specs/2026-10-23-acceptance-criteria-frozen-spec-design.md` letta dal disco → `checkCriteria` ok.
- [ ] **Step 2:** `npx vitest run scripts/decision-ledger-guard.test.js` → FAIL (`checkCriteria is not defined`).
- [ ] **Step 3:** estrarre `liveLines` da `checkLedger` senza cambiarne il comportamento; scrivere `checkCriteria` e `criteriaInScope` su `liveLines`; aggiungere `describe('live specs and plans: acceptance criteria')` sullo schema dei tre test live esistenti, con un messaggio che nomina `PROCESS.md` §6b; aggiungere all'intestazione del file un paragrafo `FOURTH RULE (2026-10-23)` con cosa controlla e cosa non controlla (il contenuto, la verificabilità delle voci).
- [ ] **Step 4:** `npx vitest run scripts/decision-ledger-guard.test.js` → PASS, test del ledger esistenti compresi.
- [ ] **Step 5: commit** `test: guard requires acceptance criteria in specs and spec-less plans`.

### Task 2: `PROCESS.md`

**Files:**
- Modify: `docs/superpowers/PROCESS.md` — §1 (tabella), §6b (dopo «Header della Spec»)

- [ ] **Step 1:** §1, riga **Spec**: i criteri di accettazione rimandano alla sezione di §6b. Riga **Piano**: porta la sezione dei criteri quando non c'è una Spec. Riga **Esecuzione**: da qui Spec e Piano sono congelati, ogni scostamento va nelle Roadmap notes del report. Riga `/finish-cycle`: nel bullet del Gate 2, la lista a spunta di criteri e casi di `TEST_CASES.md` del diff prima della domanda sul browser; nel bullet del Gate 3, i finding su Spec/Piano e sulla prosa preesistente innocua non si lavorano. Il dettaglio sta nel comando.
- [ ] **Step 2:** §6b, nuovo paragrafo **Criteri di accettazione (dal 2026-10-24)**: dove stanno (Spec; Piano senza Spec), formato della voce in un blocco `markdown` come per il ledger, nessuna sentinella, chi lo pretende (`scripts/decision-ledger-guard.test.js`) e chi lo legge (Gate 2).
- [ ] **Step 3:** `npx vitest run scripts/` → PASS (`claude-md-guard` e `doc-paths-guard` leggono i rimandi).
- [ ] **Step 4: commit** `docs: PROCESS.md — acceptance criteria section, Spec and Plan frozen at execution`.

### Task 3: `finish-cycle.md`

**Files:**
- Modify: `.claude/commands/finish-cycle.md` — Gate 1 step 0, Gate 2 (nuovo blocco prima dello step 6, step 6), Gate 3 step 3, Gate 5 step 2 (modello del report)

- [ ] **Step 1: Gate 1 step 0 e Gate 3 step 3** — un bullet ciascuno: le correzioni non modificano alcun file in `docs/superpowers/specs/` o `docs/superpowers/plans/`; un difetto lì va nelle Roadmap notes.
- [ ] **Step 2: Gate 2, blocco «Acceptance checklist»** prima dello step 6, valido su entrambi i percorsi:
  - voci = la sezione `## Criteri di accettazione` del documento dello step di identificazione (la Spec se il Piano ne nomina una, altrimenti il Piano) + i casi di `TEST_CASES.md` aggiunti o modificati in `git diff main...HEAD -- TEST_CASES.md`, come `<ID> — <titolo>`;
  - `AskUserQuestion`, `multiSelect: true`, quattro voci per domanda, fino a quattro domande per chiamata, chiamate successive per il resto; senza lo strumento, lista numerata in chat e risposta con i numeri;
  - voci non spuntate → una domanda: *fix now* o *not verifiable here*, per voce o con una regola; *fix now* = il ramo «no» dello step 6; *not verifiable here* → report, con il motivo;
  - nessun documento identificato, o nessuna sezione → una riga, poi i soli casi di `TEST_CASES.md` se ce ne sono;
  - una lista già risposta in questa sessione non si richiede.
- [ ] **Step 3: Gate 2 step 6** — percorso ordinario: la domanda sul browser, testo invariato, si pone dopo il blocco e solo se nessuna voce è *fix now*. Ramo no-code: il blocco (solo criteri) prima della domanda di classificazione.
- [ ] **Step 4: Gate 3 step 3** — prima di «Round 1 asks», disposizione per bersaglio senza chiedere: finding su un file in `docs/superpowers/specs/` o `plans/` → nessuna azione, salvo un difetto del codice che rivela; finding su prosa fuori dal diff → riga in `docs/BACKLOG.md` solo se è una regola falsa che qualcuno potrebbe seguire, altrimenti nessuna azione; il gate dichiara l'applicazione nel round; i conteggi vanno nella riga Gate 3 di «Gate outcomes».
- [ ] **Step 5: Gate 5 step 2** — riga `**Acceptance:** <voci elencate · esito positivo · non verificabili con il motivo, oppure perché non c'era una lista>` dopo `**Claims pre-check:**`, e una riga nel commento che la definisce.
- [ ] **Step 6: verifica**
  - `git diff -U0 main -- .claude/commands/finish-cycle.md | grep -c '^-.*Have you manually verified'` → `0`;
  - `git diff -U0 main -- .claude/commands/finish-cycle.md | grep -c '^-\*\*Teardown is never'` → `0`;
  - `grep -c 'Acceptance checklist' .claude/commands/finish-cycle.md` ≥ 3 (blocco, step 6 ordinario, ramo no-code);
  - `npx vitest run scripts/` → PASS.
- [ ] **Step 7: commit** `docs: finish-cycle — acceptance checklist at Gate 2, frozen Spec/Plan, disposition by target`.

## Decisioni aperte

1. **`liveLines` estratta da `checkLedger`.** Alternativa scartata: copiare la logica di fence e commenti nella nuova regola. Perché: due copie della stessa trappola divergono; i test del ledger pinnano già il comportamento estratto.
2. **Al closeout nessun file in `specs/` o `plans/` si modifica.** Alternativa scartata: vietare solo la Spec e il Piano del ciclo. Perché: al Gate 1 il Piano non è ancora identificato, e la regola sul percorso è meccanica.
3. **Classe `standard`, non `high-risk`.** Alternativa scartata: `high-risk`, come detto nel design in chat. Perché: §6.1b mette i file di processo in `standard` e nessuna categoria high-risk si applica.
4. **Il blocco della lista vive prima dello step 6 e serve i due percorsi.** Alternativa scartata: due copie, una per percorso. Perché: una regola in un posto solo.
