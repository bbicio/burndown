# Spec — criteri di accettazione al Gate 2, Spec e Piano congelati

**Brief started:** unknown
**Brief:** la conversazione del 2026-10-23, riassunta nella sezione 1 (Scenario 2, evoluzione del processo).
Design concordato in chat il 2026-10-23 (una fermata, §6b).

## 1. Brief

Dopo la misura del 2026-10-23 (`node scripts/cycle-times.mjs` e le sezioni Gate 3 dei report dal
2026-10-09) l'utente ha cancellato M6, il controllo di coerenza alla `/speckit.analyze` e story/epic, e ha
tenuto due punti, con il vincolo di non aggiungere step al processo:

- **Punto 3 — criteri di accettazione usati, non solo scritti.** `PROCESS.md` §1 li elenca già fra i
  contenuti della Spec, ma la sezione manca nella maggior parte delle Spec recenti e i cicli con il solo
  Piano non ne hanno affatto. Nessun gate li legge.
- **Punto 4 — fermare la cascata del Gate 3.** Una parte dei finding dei round successivi al primo nasce
  dalle correzioni del round precedente; in M1 e M4 una parte di queste correzioni riallineava la Spec o
  il Piano del ciclo (`01b7997`, `ae63d1e`, `11170ae`), che così rientravano nel diff rivisto. L'utente ha
  escluso di mandare ogni finding in `docs/BACKLOG.md`.

## 2. Comportamento atteso

### 2.1 Dove stanno i criteri

- Ogni Spec porta una sezione `## Criteri di accettazione`. Un Piano senza una riga `**Spec:**` che
  nomini un file esistente la porta lui.
- Ogni voce ha la forma `N. **<etichetta breve>** — <esito verificabile>`. L'etichetta è ciò che il Gate 2
  mostra come opzione da spuntare.
- `scripts/decision-ledger-guard.test.js` pretende la sezione, con almeno una voce in quella forma, nelle
  Spec e nei Piani senza Spec datati dal 2026-10-24. Non giudica il contenuto (§6b, «Il confine dei
  guard»). Non esiste una sentinella `Nessuno.`.

### 2.2 Gate 2 — la lista a spunta

- **Voci:** i criteri del documento identificato dallo step di identificazione del Gate 2 (Spec se il
  Piano ne nomina una, altrimenti il Piano), più i casi di `TEST_CASES.md` aggiunti o modificati in
  `git diff main...HEAD`, ciascuno con ID e titolo.
- **Forma:** `AskUserQuestion` con `multiSelect`, quattro voci per domanda, fino a quattro domande per
  chiamata, chiamate successive per il resto. L'utente spunta le voci con esito positivo. Senza lo
  strumento: lista numerata in chat, l'utente risponde con i numeri.
- **Voci non spuntate:** una domanda di disposizione, per voce o con una regola: *correggere ora* oppure
  *non verificabile qui*. *Correggere ora* equivale all'attuale «no» dello step 6: ci si ferma, l'ambiente
  resta attivo. *Non verificabile qui* va nel report con il motivo; in `docs/BACKLOG.md` solo se nasconde
  un difetto.
- **La domanda sul browser** resta testuale e invariata, dopo la lista, e si pone solo quando nessuna voce è
  *correggere ora*. Il teardown resta legato a quella domanda: il preambolo del Gate 2 non cambia.
- **Ciclo no-code:** la lista (solo criteri) accompagna la conferma della classificazione allo step 6.
- **Nessun documento identificato:** il gate lo dice in una riga, elenca i soli casi di `TEST_CASES.md` se
  ce ne sono, e altrimenti procede come oggi.
- **Report:** nuova riga d'intestazione `**Acceptance:**` — voci elencate, esito positivo, non
  verificabili con il motivo; oppure perché non c'era una lista.

### 2.3 Spec e Piano congelati

- `PROCESS.md` §1, righe Spec e Piano: dall'inizio dell'esecuzione il documento non si modifica più; ogni
  scostamento si scrive nelle Roadmap notes del report del ciclo.
- `.claude/commands/finish-cycle.md`: le correzioni del Gate 1 e del Gate 3 non toccano la Spec né il Piano
  del ciclo.

### 2.4 Gate 3 — disposizione per bersaglio

Allo step 3, prima della domanda di disposizione:

- finding sulla Spec o sul Piano del ciclo → **nessuna azione**; se rivela un difetto del codice, si tratta
  come finding sul codice;
- finding su prosa preesistente fuori dal diff → in `docs/BACKLOG.md` solo se è una regola falsa che
  qualcuno potrebbe seguire, altrimenti **nessuna azione**;
- ogni altro finding → la domanda di oggi.

Le due regole si applicano senza chiedere; il gate ne dichiara l'applicazione nel round e il report ne
porta il conteggio.

## 3. File toccati

- `docs/superpowers/PROCESS.md` — §1 (righe Spec e Piano), §6b (formato della sezione dei criteri, accanto
  al ledger).
- `.claude/commands/finish-cycle.md` — Gate 2 (lista, disposizione, ramo no-code), Gate 1 e Gate 3
  (congelamento, disposizione per bersaglio), modello del report del Gate 5 (riga `**Acceptance:**`).
- `scripts/decision-ledger-guard.test.js` — quarta regola, con i suoi casi di test.

## 4. Scope escluso

- Nessun controllo meccanico del congelamento.
- Nessuna modifica alle Spec e ai Piani datati prima del 2026-10-24.
- Nessun cambiamento al testo della domanda sul browser né al preambolo del teardown del Gate 2.
- Nessuna modifica a `/code-review` né a come si lancia.
- M6, il controllo di coerenza Spec↔Piano e story/epic: cancellati.

## Criteri di accettazione

1. **Guard: Spec senza criteri** — una Spec datata dal 2026-10-24 senza `## Criteri di accettazione` fa
   fallire `scripts/decision-ledger-guard.test.js`.
2. **Guard: Piano senza Spec** — un Piano datato dal 2026-10-24 senza `**Spec:**` valida e senza la
   sezione fa fallire il guard; con una `**Spec:**` valida passa senza la sezione.
3. **Guard: documenti vecchi** — `npm test` resta verde sui documenti attuali del repo.
4. **Gate 2 elenca le voci** — `finish-cycle.md` prescrive la lista a spunta con criteri e casi di
   `TEST_CASES.md` del diff, la disposizione delle voci non spuntate e il ramo no-code.
5. **Domanda browser invariata** — il testo della domanda sul browser e il preambolo del teardown sono
   identici a quelli su `main`.
6. **Congelamento scritto** — `PROCESS.md` §1 e il Gate 3 di `finish-cycle.md` vietano di modificare Spec
   e Piano del ciclo dopo l'inizio dell'esecuzione.
7. **Disposizione per bersaglio** — il Gate 3 step 3 applica senza chiedere le due regole della sezione
   2.4.
8. **Riga Acceptance nel report** — il modello del report del Gate 5 contiene `**Acceptance:**`.

## Decisioni aperte

1. **Regole nei file esistenti, guard esistente esteso.** Alternativa scartata: un template nuovo per Spec e Piano, o i criteri come casi di `TEST_CASES.md`. Perché: nessun file nuovo.
2. **Domanda sul browser separata, dopo la lista.** Alternativa scartata: fonderla nella chiamata della lista. Perché: il teardown dipende dal suo testo letterale.
3. **Congelamento per istruzione, senza controllo meccanico.** Alternativa scartata: un controllo che blocca se il diff tocca Spec o Piano del ciclo. Perché: nessun controllo nuovo; un mancato rispetto si vedrà nei report.
4. **Guard dai documenti del 2026-10-24.** Alternativa scartata: da oggi. Perché: due Piani di oggi senza Spec lo farebbero fallire.
5. **Nessuna sentinella per i criteri.** Alternativa scartata: ammettere `Nessuno.` come nel ledger. Perché: diventerebbe l'uscita abituale.
