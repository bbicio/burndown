# Brief — Ciclo di processo: test e revisioni più veloci, stessa copertura

**Tipo:** evoluzione (Scenario 2) di processo e tooling di test.
**Brief started:** 2026-11-18 00:01
**Origine:** analisi delle prestazioni di `save-c1-foundations`, fatta in chat il 2026-11-17 (report `docs/superpowers/reports/2026-11-17-save-c1-foundations-finish-cycle.md`). Il ciclo è durato circa 2 ore e circa 35 minuti sono andati in esecuzioni di test, alcune ripetute su codice invariato. In più, una revisione dell'intero branch è stata fatta due volte.
**Forma scelta dall'utente:** un solo ciclo per i quattro punti. Il ciclo stesso deve essere veloce: spec breve, piano con pochi task, esecuzione nativa.
**Classe di rischio (proposta):** `standard`. Il ciclo tocca file di processo (`docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`) e `vitest.config.js`. Non tocca nessuna categoria `high-risk` (PROCESS.md §6.1b). La classe si dichiara nel Piano.

## Problema

Quattro costi misurati su `save-c1-foundations` non aggiungono copertura:

1. `npm test` impiega circa 460 s. Quasi tutto il tempo va nella preparazione dell'ambiente di test, non nei test.
2. Il Gate 1 rilancia `scripts/run-tests.sh` anche quando `api/` e `test-api.js` non sono cambiati dall'ultimo run verde della stessa sessione.
3. Il Gate 3 rifà una revisione completa del branch che la revisione finale del piano aveva appena fatto. Succede perché la revisione finale non gira come `/code-review`, e il Gate 3 non può riusarla.
4. Dopo il fix pass della revisione finale, l'esecutore lancia la suite completa. Il Gate 1 la rilancia pochi minuti dopo sullo stesso albero.

## Comportamento attuale

- **`npm test` e ambiente di test.**
  - `vitest.config.js:5` imposta `environment: 'jsdom'` per tutti i file. `include` copre `js/**/*.test.js` e `scripts/**/*.test.js`.
  - Nessun file sceglie l'ambiente `node`. Solo tre file dichiarano `// @vitest-environment jsdom` alla riga 1: `js/lib/nav-send-notif-options.test.js`, `js/lib/shares-modal.test.js` e `js/lib/terms-html.test.js`.
  - Misura del Gate 1 di `save-c1-foundations` (2026-11-17): 137 file, 3438 test, `Duration 458.54s`, `environment 939.79s`, `tests 580.00s`.
  - La memoria di progetto registrava circa 95-105 s il 2026-11-10. La causa del salto non è accertata.
- **`run-tests.sh` al Gate 1.**
  - `.claude/commands/finish-cycle.md:35-37`: il Gate 1 lancia `scripts/run-tests.sh` ogni volta che `git diff --stat main...HEAD` tocca `api/` o `test-api.js`. Non controlla se nella sessione esiste già un run verde allo stesso stato di `api/`.
  - Al Gate 3 un controllo del genere esiste già: il "Backend re-run" di `finish-cycle.md:144` confronta `<gate1-green-HEAD>..HEAD`.
  - In `save-c1-foundations` il run verde del Task 2 era a `778a052`. Né `api/` né `test-api.js` sono cambiati fino a `6406434`, quindi il run del Gate 1 ha ritestato lo stesso codice (circa 5 minuti).
- **Revisione finale del piano e Gate 3.**
  - `finish-cycle.md:119`: in `high-risk` lo skip completo del Gate 3 non si applica mai.
  - `finish-cycle.md:120`: in `high-risk` anche il percorso ristretto 0b vale solo se la revisione che definisce `<reviewed-sha>` è stata un `/code-review` a effort high.
  - PROCESS.md:136 assegna la revisione finale dell'intero branch a Opus. Lo skill del plugin `superpowers:executing-plans` la fa girare con il template `code-reviewer.md`, non come `/code-review`.
  - In `save-c1-foundations` il Gate 3 ha quindi rifatto un `/code-review` high sull'intero branch. Ha trovato 4 Important che la prima revisione non aveva visto.
- **Suite completa a fine esecuzione.**
  - PROCESS.md:166-167: durante i task si lanciano solo i test toccati, e "nel coordinatore non si fa una passata di fine esecuzione".
  - Lo skill del plugin `superpowers:executing-plans` chiede invece di eseguire "the whole suite" dopo il fix pass della revisione finale. Nessun override in `CLAUDE.md` lo neutralizza. Gli override esistenti, `CLAUDE.md:7-11`, riguardano chiusura del branch, approvazioni e worktree.
  - In `save-c1-foundations` `npm test` è girato due volte a distanza di circa 10 minuti, la seconda con un solo commit di docs in più (circa 7,5 minuti).

## Comportamento atteso

1. `npm test` gira più veloce. I test che non usano il DOM girano senza jsdom; quelli che lo usano continuano a girare con jsdom. La causa del salto da circa 100 s a circa 460 s viene misurata e, se è un difetto, corretta.
2. Il Gate 1 salta `scripts/run-tests.sh` quando nella sessione esiste un run verde e `git diff <sha-del-run-verde>..HEAD -- api/ test-api.js` è vuoto. Il salto si dichiara nel report.
3. La revisione finale del piano gira come `/code-review` all'effort della classe di rischio. Il Gate 3 la riusa: con lo skip se le condizioni valgono, altrimenti con il percorso ristretto 0b, anche in `high-risk`.
4. Il fix pass dell'esecutore lancia solo i test dei file toccati. La suite completa resta al Gate 1.

## Vincoli

- I plugin `superpowers` non si modificano. Le deroghe ai loro skill passano da righe "Process override" in `CLAUDE.md` e da PROCESS.md, come per gli override esistenti.
- `CLAUDE.md` resta sotto il tetto di `scripts/claude-md-guard.test.js`. Le regole stanno in un file solo; gli altri rimandano lì.
- Una modifica a un gate di `/finish-cycle` passa da una spec (PROCESS.md §6.4b).
- Nessun test viene rimosso o indebolito. Cambia solo come e quando i test girano.
- Nessun bundler né build step per il runtime; la toolchain di test resta dev-only.
- **Security surface:** no.

## Criteri di accettazione

1. **Suite più veloce, stessa copertura:** `npm test` ha lo stesso numero di file e di test di prima del ciclo, tutti verdi. La durata è misurata prima e dopo nelle stesse condizioni (stessa macchina, Docker spento), ed entrambi i valori stanno nel report. Il criterio passa se il dopo è più veloce. Non c'è un obiettivo fisso.
2. **Ambiente giusto per ogni test:** un controllo automatico fallisce se un test che usa il DOM gira senza jsdom.
3. **Skip di `run-tests.sh` al Gate 1:** `finish-cycle.md` descrive la condizione dello skip e il report la registra. Un run rosso o assente non vale mai come verde.
4. **Revisione finale riusabile:** PROCESS.md e `finish-cycle.md` dicono che la revisione finale del piano gira come `/code-review` all'effort della classe e che il Gate 3 la riusa. Una riga "Process override" in `CLAUDE.md` copre `superpowers:executing-plans` e `superpowers:subagent-driven-development`.
5. **Niente suite completa nel fix pass:** una riga "Process override" in `CLAUDE.md` rimanda a PROCESS.md §6.2.
6. **Guard verdi:** `npm test` passa, compresi `claude-md-guard`, `doc-paths-guard` e `decision-ledger-guard`.

## Scope escluso

Nessuno. L'utente ha scelto di non escludere nessuno dei quattro candidati proposti, che restano quindi aperti per `/brainstorming`:

- le regole `high-risk` del Gate 3 (divieto di skip, tetto dei round, regola text-only);
- meno test o meno copertura;
- la velocità dello stack Docker e di `run-tests.sh`;
- Gate 5 (`gate5-scope.mjs`) e il trigger di `/security-review`.

## Domande aperte per `/brainstorming`

1. Come assegnare l'ambiente: glob per directory, annotazione per file o `projects` di vitest. Come si accorge il controllo del criterio 2 che un test usa il DOM?
2. Qual è la causa del salto da circa 100 a circa 460 s: jsdom per file, pool o concorrenza di vitest, carico della macchina (Docker acceso)? Va misurata prima di scegliere il rimedio.
3. Dove vive lo "SHA del run verde" del Gate 1: solo nella sessione, come `<gate1-green-HEAD>`, o in un file? E vale anche un run lanciato durante l'esecuzione del piano?
4. Per riusare la revisione in `high-risk` basta che sia un `/code-review` high, come 0b già chiede? Oppure va toccata anche la regola dello skip completo?
5. Con il passaggio manuale di modello in nativa (`/model`, PROCESS.md:136), la revisione finale come `/code-review` gira nella sessione o in un subagent Opus?
6. Il primo candidato escluso (le regole `high-risk`) entra davvero, o basta il punto 3?

Brief ready. Next step: /brainstorming.
