# Spec — Meno run di `run-tests.sh`: percorso mirato per il backend nel worktree

**Brief started:** unknown
**Brief:** nessun Brief; passo 3 del piano di miglioramento del processo del 2026-11-10 (Scenario 2, evoluzione).
Design concordato in chat il 2026-11-10 (una fermata, §6b), nella forma ridotta: senza test pin.

## 1. Scope

Misura del 2026-11-10: un run di `scripts/run-tests.sh` dura 162 s, di cui 101 s di suite d'integrazione e circa 61 s fissi (db, migrazioni, build dell'api, avvio del container di test, teardown). I 3 round di Gate 3 di `two-step-c2-email-code` hanno lanciato un run ciascuno, e 4 run sono arrivati dai task del Piano.

La causa non è disciplina: il comando mirato indicato per il backend, `docker exec pdash-api node --test src/<file>`, gira nel container dello stack principale, che monta `src` del checkout principale e non quello del worktree. Per provare un fix in un worktree restava solo il run completo.

Questo ciclo, solo testo:
- il comando mirato per il backend diventa `cd api && node --test src/<file>`, dal worktree;
- `scripts/run-tests.sh` gira al Gate 1 e, **solo se** dopo il Gate 1 è cambiato qualcosa sotto `api/` (o `test-api.js`), **una volta** alla fine del Gate 3; mai per round;
- un Piano non prescrive `scripts/run-tests.sh` per task.

Fuori scope: un filtro in `test-api.js` (con due run per ciclo il risparmio sarebbe di circa 3 minuti); un test che fissi queste frasi; `npm test` (una suite completa al Gate 1 e il subset del Gate 5, già regolati); la durata di un singolo run; il Gate 5.

## 2. `docs/superpowers/PROCESS.md` §6.2

Nel punto "Durante i task si lanciano solo i file di test toccati o aggiunti":
- il comando backend diventa `cd api && node --test src/<file>`;
- una frase nuova: un Piano non prescrive `scripts/run-tests.sh` per task; l'unica eccezione è il task il cui prodotto è un controllo di `test-api.js`, che lo lancia una volta, al suo passo verde;
- una frase nuova: `scripts/run-tests.sh` gira al Gate 1 e, alle condizioni del Gate 3 di `/finish-cycle`, alla sua fine.

## 3. `.claude/commands/finish-cycle.md`

- **Gate 1, step 4:** prima di proseguire, si registra l'HEAD come `<gate1-green-HEAD>`.
- **Gate 3, step 3, il punto sui test del round:** `docker exec pdash-api node --test src/<file>` diventa `cd api && node --test src/<file>`. Il resto del punto, compresa la frase "this gate is never left red", resta.
- **Gate 3, paragrafo "Backend re-run" (nuovo), dopo lo step 4, valido su ogni uscita dal gate** (lo skip dello step 0, lo step 2 senza finding, l'opzione (b) del tetto dei round, lo step 4): prima di passare al Gate 4 si esegue `git diff --name-only <gate1-green-HEAD>..HEAD`. Se stampa un path sotto `api/` o `test-api.js`, si esegue `scripts/run-tests.sh` una volta. Se è rosso, si ferma e si rientra come dopo un rosso del Gate 1 step 3, e `<gate1-green-HEAD>` si registra di nuovo quando il Gate 1 torna verde. Se il diff non stampa nulla di quei path, non si esegue nulla e il report lo dice. Gli step 0 e 2 e l'opzione (b) rinviano a quel paragrafo al posto di "proceed to Gate 4".

## 4. `CLAUDE.md`

Nel paragrafo dei test backend, la frase "run via `docker exec pdash-api node --test src/...` if the host has no `api/node_modules` installed" diventa: i file che importano Express o il db richiedono `npm ci` una volta in `api/`, anche in un worktree. Nessuna giustificazione aggiunta; il blocco File structure, pinnato, non si tocca.

## Criteri di accettazione

1. **Comando mirato** — `grep -rn "docker exec pdash-api node --test" .claude/commands/finish-cycle.md docs/superpowers/PROCESS.md CLAUDE.md` non trova nulla; il Gate 3 e §6.2 nominano `cd api && node --test src/<file>`.
2. **Run alla fine del Gate 3** — il Gate 3 ha un paragrafo "Backend re-run", richiamato da tutte e quattro le uscite, che nomina `git diff --name-only <gate1-green-HEAD>..HEAD`, i path `api/` e `test-api.js`, e `scripts/run-tests.sh` una volta; il Gate 1 step 4 registra `<gate1-green-HEAD>`.
3. **Piani** — §6.2 dice che un Piano non prescrive `scripts/run-tests.sh` per task, con l'eccezione del task che produce un controllo di `test-api.js`.
4. **Documenti vivi** — `npm test` è verde, guard documentali compresi (`claude-md-guard`, `doc-paths-guard`).
5. **Ciclo senza codice** — `node scripts/classify-cycle.mjs` stampa `no-code` come prima riga.

## Decisioni aperte

1. **Il run di fine Gate 3 dipende da un diff, non da un conteggio di round.** Alternativa scartata: sempre un run alla fine del Gate 3. Perché: un ciclo i cui round non toccano `api/` non ha nulla di nuovo da provare.
2. **Il diff parte da `<gate1-green-HEAD>`, non da `main`.** Alternativa scartata: `main...HEAD`. Perché: il Gate 1 ha già provato tutto ciò che c'era a quell'HEAD.
3. **Il Gate 2 non ha un run suo.** Alternativa scartata: un run dopo le correzioni visive. Perché: il diff dello step 3b include i commit del Gate 2, quindi sono già coperti.
4. **Nessun test pin su queste frasi.** Alternativa scartata: asserzioni su `finish-cycle.md` come nel passo 2. Perché: fissano che il testo c'è, non che qualcuno lo segue.
5. **Nessun filtro in `test-api.js`.** Alternativa scartata: lanciare solo i controlli toccati. Perché: con due run per ciclo vale circa 3 minuti, per un lavoro sul file più grande dei test.
6. **L'eccezione dei task che producono un controllo di `test-api.js`.** Alternativa scartata: vietare `run-tests.sh` nei task senza eccezioni. Perché: un controllo d'integrazione nuovo si prova solo con quel run.
7. **Nessuna giustificazione di perché il comando `docker exec` sia sbagliato nei documenti vivi.** Alternativa scartata: spiegarlo in `CLAUDE.md`. Perché: la regola della documentazione è enunciare senza motivare; la ragione sta in questa Spec.
