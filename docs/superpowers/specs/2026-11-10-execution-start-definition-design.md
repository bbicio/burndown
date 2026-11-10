# Spec — Una sola definizione di "inizio dell'esecuzione"

**Brief started:** unknown
**Brief:** nessun Brief; passo 2 del piano di miglioramento del processo del 2026-11-10 (Scenario 2, evoluzione).
Design concordato in chat il 2026-11-10 (una fermata, §6b).

## 1. Scope

`/finish-cycle` e `scripts/cycle-times.mjs` usano due significati per "inizio dell'esecuzione":
- il campo `Execution started` del report è l'ora in cui parte `/finish-cycle` (pre-flight, passo 6), cioè l'inizio del closeout;
- `cycle-times.mjs` (`execFirst`) usa l'author time del primo commit che non è solo Spec, Piano o Brief.

I contatori del report dicono "from the start of plan execution" senza definirlo.

Questo ciclo:
- rinomina il campo del report in `Closeout started`, con il segnaposto `<closeout-started-at>`;
- definisce **Execution start** una volta sola, nel passo 6 del pre-flight, come `execFirst` di `scripts/cycle-times.mjs`;
- fa riferire a quella definizione le due frasi dei contatori;
- ripete la definizione nell'intestazione di `scripts/cycle-times.mjs`;
- fissa l'accordo con un test in `scripts/cycle-times.test.js`.

Fuori scope: i report già scritti (storia congelata, nessuno script li legge); la frase "frozen from the start of execution" del Gate 1 step 0 e di PROCESS.md §1, che indica il passaggio Piano → Esecuzione e non un'ora; il calcolo di `execFirst`; le durate dei gate.

## 2. Il comando

In `.claude/commands/finish-cycle.md`:
- Pre-flight passo 6: `<started-at>` diventa `<closeout-started-at>`. Una frase nuova dice che è l'inizio di questo comando e non l'inizio dell'esecuzione.
- Nello stesso passo, una riga in grassetto `**Execution start**` la definisce: l'author time del primo commit del branch che non tocca solo file di Spec, Piano o Brief, quello che `scripts/cycle-times.mjs` stampa come `execFirst`. Non si registra durante il comando: si legge da git.
- La frase dei contatori nel passo 6 e quella del template del report ("Cycle counters, from the start of plan execution to Gate 5") rinviano a **Execution start**.
- Template del report: `**Execution started:** <started-at>  (pre-flight step 6)` diventa `**Closeout started:** <closeout-started-at>  (pre-flight step 6)`.

## 3. Lo script

`scripts/cycle-times.mjs`: la sola modifica è il commento d'intestazione, che dichiara la stessa definizione (`execFirst` = primo commit non di solo planning). Il codice non cambia.

## 4. Il test

In `scripts/cycle-times.test.js`, un `describe` nuovo legge `.claude/commands/finish-cycle.md` e `scripts/cycle-times.mjs` come testo:
- `finish-cycle.md` non contiene `Execution started`;
- il template contiene `**Closeout started:** <closeout-started-at>` e non `<started-at>`;
- `finish-cycle.md` contiene una sola riga con `**Execution start**`, e quella riga nomina `execFirst` e `scripts/cycle-times.mjs`;
- `finish-cycle.md` non contiene `start of plan execution`;
- l'intestazione di `scripts/cycle-times.mjs` nomina `execFirst` e `Execution start`.

Il test non legge `docs/superpowers/reports/`. Verifica che i due documenti portino la definizione, non che sia giusta.

## 5. Documentazione

- `docs/superpowers/PROCESS.md` e `CLAUDE.md`: nessuna modifica.
- Il test non si chiama `*-guard.test.js`, quindi non entra nella lista di §4b né nel pin del blocco File structure di `CLAUDE.md`.

## Criteri di accettazione

1. **Etichetta** — `grep -n "Execution started" .claude/commands/finish-cycle.md` non trova nulla; il template porta `**Closeout started:** <closeout-started-at>`.
2. **Definizione unica** — il passo 6 porta una riga `**Execution start**` che nomina `execFirst` e `scripts/cycle-times.mjs`; `grep -n "start of plan execution" .claude/commands/finish-cycle.md` non trova nulla.
3. **Script** — l'intestazione di `scripts/cycle-times.mjs` nomina `execFirst` e `Execution start`; `git diff main...HEAD -- scripts/cycle-times.mjs` mostra solo righe di commento.
4. **Test** — `npx vitest run scripts/cycle-times.test.js` è verde, e diventa rosso se si reintroduce `Execution started` nel template.
5. **Storia intatta** — `git diff main...HEAD --stat -- docs/superpowers/reports` è vuoto.
6. **Suite** — `npm test` verde.

## Decisioni aperte

1. **Si rinomina il campo, non si cambia ciò che registra.** Alternativa scartata: far registrare a `/finish-cycle` il primo commit via git al posto dell'ora di avvio. Perché: duplicherebbe la logica di `cycle-times.mjs` e perderebbe il tempo di closeout, che il campo misura bene.
2. **L'inizio dell'esecuzione è il primo commit non di planning, come lo calcola `cycle-times.mjs`.** Alternativa scartata: l'ora di apertura del worktree. Perché: non è un dato di git, quindi non verificabile dopo il fatto.
3. **I report già scritti non si toccano.** Alternativa scartata: riscrivere l'etichetta nei report storici. Perché: nessuno script li legge e il report è il registro di quel ciclo.
4. **Le frasi "frozen from the start of execution" restano.** Alternativa scartata: allinearle alla nuova definizione. Perché: indicano il passaggio Piano → Esecuzione di §1, non un'ora, e sono fuori dal problema.
5. **Le asserzioni stanno in `scripts/cycle-times.test.js`, non in un guard nuovo.** Alternativa scartata: `scripts/execution-start-guard.test.js`. Perché: un `*-guard.test.js` entra nella lista di §4b e nel pin di `CLAUDE.md`, due modifiche fuori scope per cinque asserzioni.
6. **Il ciclo è ordinario, non `no-code`.** Alternativa scartata: trattarlo come solo testo. Perché: tocca un `.mjs` e un `.js`, che `scripts/classify-cycle.mjs` conta come codice.
