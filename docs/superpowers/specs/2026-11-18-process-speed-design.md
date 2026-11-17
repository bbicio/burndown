# Ciclo di processo: test e revisioni più veloci, stessa copertura — design spec

**Date:** 2026-11-18
**Brief started:** 2026-11-18 00:01
**Brief:** `docs/superpowers/briefs/2026-11-18-process-speed-brief.md`
**Scenario:** 2 (evoluzione di processo e tooling di test)
**Classe di rischio:** standard (file di processo `docs/superpowers/PROCESS.md`, `.claude/commands/finish-cycle.md`, `CLAUDE.md`, test sotto `scripts/`; nessuna categoria `high-risk`)
**Security surface:** no

Il ciclo toglie da ogni ciclo di sviluppo i costi che non aggiungono copertura:

1. il file di test che da solo tiene ferma la suite;
2. un run d'integrazione ripetuto su codice invariato;
3. una revisione dell'intero branch fatta due volte;
4. una suite completa lanciata dall'esecutore pochi minuti prima del Gate 1.

## 1. Fatti misurati (2026-11-17/18)

- **Suite completa.** `npm test` al Gate 1 di `save-c1-foundations`: 137 file, 3438 test, `Duration 458.54s`, `environment 939.79s`.
- **jsdom non è il collo di bottiglia.** `npx vitest run scripts/` (24 file) con l'ambiente di default jsdom impiega 311,6 s. Con `--environment node` impiega 298,0 s, e un file fallisce perché usa il DOM.
- **Durate per file** (reporter JSON):

  | File | Durata | Caso più lento |
  |---|---|---|
  | `scripts/site-export.test.js` | 276,5 s | 11,9 s |
  | `scripts/classify-cycle.test.js` | 32,9 s | 7,5 s |
  | `scripts/security-scope.test.js` | 17,4 s | 7,9 s |
  | tutti gli altri guard di `scripts/` | sotto 1,2 s ciascuno | — |

- **Perché un file lento pesa tanto.** Vitest esegue i file in parallelo sui worker (12 core sull'host) e i casi di un file in sequenza. Il file più lento fissa quindi il minimo della durata della suite.
- **Quando è nato il collo di bottiglia.** `scripts/site-export.test.js` è nato il 2026-11-12 (`2dfde4a`), dopo la misura di circa 100 s registrata il 2026-11-10. Ha 15 blocchi `describe`, e ogni caso crea repository git usa-e-getta.
- **`run-tests.sh` al Gate 1.** `.claude/commands/finish-cycle.md:35-37` lo lancia ogni volta che il diff tocca `api/` o `test-api.js`, anche se nella sessione esiste già un run verde allo stesso stato.
- **Revisione finale e Gate 3.** In `save-c1-foundations` la revisione finale del piano girava con il template del plugin, non come `/code-review`. Il Gate 3 ha dovuto rifare un `/code-review` high sull'intero branch: `finish-cycle.md:119-120` lo impone in `high-risk`.
- **Suite completa nel fix pass.** PROCESS.md:166-167 dice già che a fine esecuzione non si fa una passata completa. Lo skill `superpowers:executing-plans` chiede invece "the whole suite" dopo il fix pass, e nessun override in `CLAUDE.md` lo corregge.

## 2. Suite — i file di test lenti si dividono

- **Divisione di site-export.** `scripts/site-export.test.js` si divide in più file dentro `scripts/site-export/`. Il glob `scripts/**/*.test.js` di `vitest.config.js` li raccoglie senza cambiare la config.
  - Ogni file nuovo contiene uno o più dei blocchi `describe` di oggi, presi interi.
  - I blocchi si raggruppano in modo che nessun file superi circa 35-40 s.
  - Nessun caso cambia testo, asserzioni o fixture.
- **Helper condivisi.** Gli helper oggi in testa al file vanno in `scripts/lib/site-export-fixture.mjs`, e ogni file nuovo li importa da lì. Sono `git()`, la creazione del repository di prova e quella della destinazione.
- **Gli altri due file lenti.** `scripts/classify-cycle.test.js` e `scripts/security-scope.test.js` si dividono con lo stesso criterio solo se, dopo lo split di site-export, uno dei due è il file più lento della suite. Il piano lo decide misurando, non a priori.
- **Copertura invariata.** Il conteggio dei casi è lo stesso prima e dopo, sia per i file divisi sia per l'intera suite.
- **Export del sito.** `scripts/site-export.rules` esclude già `scripts/`, quindi i file nuovi sono di processo. `scripts/site-export-guard.test.js` lo verifica.
- **Ambiente di test.** L'ambiente jsdom resta quello di default; `vitest.config.js` non cambia.

## 3. Gate 1 — il run d'integrazione già verde non si ripete

- **`<backend-green-sha>`.** È l'HEAD dell'ultimo run verde di `scripts/run-tests.sh` nella sessione corrente: lanciato da un task del piano, dal Gate 1 o dal Gate 3. Un run rosso, interrotto o con output non leggibile non registra niente. Vive solo nella sessione.
- **Gate 1 step 3.** Se esiste un `<backend-green-sha>` e `git diff --name-only <backend-green-sha>..HEAD -- api/ test-api.js` non stampa niente, il run si salta. Il Gate 1 lo dichiara in una riga con lo sha. Il report scrive nella riga del Gate 1 "run-tests.sh skipped — green at `<sha>`, no `api/`/`test-api.js` change since".
- **"Backend re-run" del Gate 3** (`finish-cycle.md:144`). Confronta con `<backend-green-sha>` invece che con `<gate1-green-HEAD>`. Il resto del controllo non cambia.
- **PROCESS.md §6.2.** La frase "`scripts/run-tests.sh` gira al Gate 1" diventa "gira al Gate 1, salvo un run verde nella sessione senza modifiche successive a `api/` o `test-api.js` (`finish-cycle.md`, Gate 1)". La regola sta in `finish-cycle.md`; PROCESS.md rimanda lì.

## 4. Revisione finale del piano come `/code-review`

- **Chi la fa.** In esecuzione nativa e in subagent-driven, la revisione finale dell'intero branch la fa un agente in background su Opus. L'agente invoca `/code-review` all'effort della classe di rischio del Piano (PROCESS.md §6.1b), con lo scope `main...HEAD`. Il prompt riporta la Review Focus del Piano.
- **Riuso al Gate 3.** L'HEAD che copre è un `<reviewed-sha>` nel senso del Gate 2 step 0, e il Gate 3 la riusa con le regole 0/0b di oggi. In `high-risk` 0b vale, perché la revisione è un `/code-review` high. Il divieto di skip completo in `high-risk` resta.
- **Fix.** Si trattano come oggi: TDD, un test rosso poi verde per ciascuno. In `high-risk` il Gate 3 rivede i commit di fix con 0b.
- **PROCESS.md §6.4.** La frase sulla revisione finale ("Se la revisione finale dell'intero branch… copre `main...HEAD`") dice che quella revisione è un `/code-review` all'effort della classe, eseguito da un agente Opus.
- **PROCESS.md §6.1.** Il punto "Modello" ha una riga che rimanda a §6.4.

## 5. Override dei due skill del plugin

`CLAUDE.md` riceve una riga "Process override — final review and fix pass" accanto alle tre esistenti. La riga vale per `superpowers:executing-plans` e `superpowers:subagent-driven-development` e dice due cose:

1. la revisione finale è quella di PROCESS.md §6.4;
2. dopo il fix pass si lanciano solo i test dei file toccati, perché la suite completa la fa il Gate 1 (PROCESS.md §6.2).

La riga resta entro il tetto di `scripts/claude-md-guard.test.js`.

## 6. Documentazione

- `docs/scripts/site-export.md` cita dove stanno i test di site-export.
- `docs/superpowers/PROCESS.md` §6.1, §6.2 e §6.4, come sopra.
- `.claude/commands/finish-cycle.md`: Gate 1 step 2-3 e il "Backend re-run" del Gate 3.
- `CLAUDE.md`: la riga di override. La File structure non cambia, perché `scripts/site-export.mjs` resta la voce che rimanda a `docs/scripts/site-export.md`.

## Criteri di accettazione

1. **Stessi casi** — dopo il ciclo `npm test` ha lo stesso numero di test di prima, tutti verdi; i file nati dallo split di `scripts/site-export.test.js` contengono, sommati, gli stessi casi del file di partenza.
2. **Suite più veloce** — la durata di `npm test` è misurata prima e dopo, sulla stessa macchina con Docker spento, ed entrambe le misure stanno nel report; il dopo è più veloce. Il reporter JSON non mostra file di `scripts/site-export/` oltre circa 40 s.
3. **Skip del Gate 1** — `finish-cycle.md` Gate 1 descrive `<backend-green-sha>` e lo skip, il "Backend re-run" del Gate 3 usa lo stesso sha, PROCESS.md §6.2 rimanda lì.
4. **Revisione finale riusabile** — PROCESS.md §6.4 dice che la revisione finale del piano è un `/code-review` all'effort della classe, eseguito da un agente Opus, e che il Gate 3 la riusa con 0/0b.
5. **Override** — `CLAUDE.md` ha la riga "Process override — final review and fix pass" con i due punti del §5.
6. **Guard verdi** — `npm test` passa, compresi `scripts/claude-md-guard.test.js`, `scripts/doc-paths-guard.test.js`, `scripts/decision-ledger-guard.test.js` e `scripts/site-export-guard.test.js`.

## Decisioni aperte

1. **Si dividono i file di test lenti, senza cambiare i casi.** Alternativa scartata: una fixture condivisa (repository git costruito una volta e copiato), oppure far girare quei file solo quando cambiano i loro script. Perché: la divisione è meccanica e non tocca la copertura; il guadagno viene dal parallelismo dei worker già disponibili.
2. **jsdom resta l'ambiente di default.** Alternativa scartata: ambiente `node` per i guard di `scripts/`, con un controllo sui test che usano il DOM. Perché: la misura dà circa il 4% su `scripts/`, e un file usa davvero il DOM.
3. **Il run verde che conta è qualunque run verde della sessione, anche quello di un task del piano.** Alternativa scartata: solo i run registrati da `/finish-cycle`. Perché: il caso misurato è proprio il run del task seguito da un Gate 1 su `api/` invariato.
4. **La revisione finale la fa un agente Opus che invoca `/code-review`; le regole `high-risk` del Gate 3 non cambiano.** Alternativa scartata: permettere lo skip completo in `high-risk`, oppure far fare `/code-review` alla sessione stessa. Perché: 0b già riusa una revisione high e rivede solo i fix; in nativa la sessione può essere su Sonnet.
5. **`classify-cycle.test.js` e `security-scope.test.js` si dividono solo se la misura lo chiede.** Alternativa scartata: dividerli sempre. Perché: con site-export diviso, 33 s e 17 s potrebbero già stare sotto il nuovo minimo; dividerli senza bisogno è lavoro senza guadagno.
