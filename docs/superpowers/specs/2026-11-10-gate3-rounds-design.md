# Spec — Gate 3: round successivi ristretti, niente round per una correzione di testo, una regola per i round

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-10-gate3-rounds-brief.md` (Scenario 2, evoluzione).
Design concordato in chat il 2026-11-10 (una fermata, §6b).

## 1. Scope

Tre regole nel Gate 3 di `.claude/commands/finish-cycle.md`, step 3:
- dal round 2 il `/code-review` è ristretto alle correzioni del round precedente e conosce i finding già decisi;
- un round si chiude senza un nuovo `/code-review` quando le sue correzioni sono solo testo e rispondono solo a finding Minor;
- la domanda del round 1 offre tre regole valide per i round successivi.

Fuori scope (confermato nel Brief): il salto del Gate 3 legato a uno SHA registrato; il tetto dei 3 round e le opzioni (a)/(b)/(c); classe di rischio ed effort; le revisioni in background morte o senza risultato.

## 2. Round ristretti

- **`<round-base>`** = l'HEAD che il round appena chiuso ha rivisto (per il round 1: l'HEAD coperto dalla run raccolta dal Gate 2, o dallo step 1, più gli eventuali commit rivisti dalla revisione scoped aggiunta su quella stessa run).
- **Il round successivo** è un `/code-review` a `<review-effort>` su `<round-base>..HEAD`. Il testo "run `/code-review` again on the same scope" sparisce.
- **Il prompt del revisore** porta la lista di tutti i finding dei round precedenti con la loro decisione (corretto, follow-up, nessuna azione), e l'istruzione di non riproporli.
- **Cosa giudica:** il revisore può leggere file fuori dall'intervallo; segnala solo difetti causati dai commit dell'intervallo, anche quando il difetto sta fuori (es. un chiamante rotto).
- **Tetto:** un round ristretto conta come un round.

## 3. Quando non parte un nuovo round

- Dopo le correzioni, i controlli meccanici sui `.md` e i test che coprono ciò che il round ha cambiato (Gate 3 step 3, invariati).
- Poi il round si chiude **senza** un nuovo `/code-review` se valgono entrambe:
  - (a) ogni finding corretto in questo round è classificato Minor dal revisore;
  - (b) `node scripts/classify-cycle.mjs <round-base>..HEAD` stampa `no-code` come prima riga.
- Ogni altro esito fa partire il round successivo: un finding Critical o Important corretto, un verdetto diverso da `no-code`, un errore, un output vuoto.
- Chiuso così, il gate passa al Gate 4 con i follow-up raccolti. Il report lo dice nella riga "Gate 3" di "Gate outcomes".
- Il ramo del round 3 con correzioni (le opzioni (a)/(b)/(c)) si applica solo quando un nuovo round sarebbe partito.

## 4. La domanda del round 1

- Opzioni, in quest'ordine:
  1. "Critical/Important now, Minor as follow-up" — regola (raccomandata);
  2. "Fix everything now" — regola;
  3. "Everything as follow-up" — regola;
  4. "Decide finding by finding" — nessuna regola.
- Una delle prime tre si applica dal round 2 senza richiedere, e il round riporta come l'ha applicata. Con la quarta, i round successivi chiedono di nuovo, come oggi.
- Una regola scritta a parole dall'utente vale come oggi.
- Le regole di destinazione (Spec e Piano congelati, prosa preesistente) si applicano prima della domanda, come oggi.

## 5. Documentazione

- `docs/superpowers/PROCESS.md`: nessuna modifica; §6b rinvia già al comando per la regola di disposizione.

## Criteri di accettazione

1. **Round ristretti** — `grep -n "on the same scope" .claude/commands/finish-cycle.md` non trova nulla; il Gate 3 definisce `<round-base>` e il round successivo su `<round-base>..HEAD`, con la lista dei finding già decisi nel prompt.
2. **Nessun round per testo + Minor** — il Gate 3 nomina `node scripts/classify-cycle.mjs <round-base>..HEAD` e le due condizioni (a) e (b).
3. **Comando dell'intervallo** — su un intervallo di soli `.md` sotto `docs/`, `node scripts/classify-cycle.mjs <a>..<b>` stampa `no-code`; su un intervallo che tocca `TEST_CASES.md` o un `.js` stampa `ordinary`.
4. **Regole al round 1** — la domanda del round 1 elenca le quattro opzioni di §4.
5. **Suite** — `npm test` verde.

## Decisioni aperte

1. **"Solo testo" = verdetto `no-code` di `scripts/classify-cycle.mjs` sull'intervallo.** Alternativa scartata: una lista di estensioni nel comando. Perché: la regola esiste già, è fissata da un test e conta `TEST_CASES.md` come codice.
2. **Vale la gravità del revisore.** Alternativa scartata: una gravità rivalutata da chi corregge. Perché: è un dato registrato, indipendente da chi vuole chiudere il gate.
3. **Il round ristretto giudica i difetti causati dall'intervallo, anche fuori da esso.** Alternativa scartata: solo le righe dell'intervallo. Perché: una correzione che rompe un chiamante va trovata.
4. **Un round ristretto conta per il tetto.** Alternativa scartata: non contarlo. Perché: il tetto è fuori scope.
5. **Tre regole fisse più "finding per finding".** Alternativa scartata: regole libere. Perché: un'opzione fissa non si presta a interpretazioni nei round successivi.
6. **Nessuna modifica a PROCESS.md.** Alternativa scartata: ripetere le regole nel §6b. Perché: §6b rinvia già al comando.
