# Sicurezza nel processo di sviluppo — design spec

**Date:** 2026-11-17
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-16-security-process-brief.md`
**Scenario:** 2 (evoluzione del processo)
**Classe di rischio:** standard (file di processo: `docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`)
**Security surface:** no

La revisione di sicurezza diventa un passo ordinario di `/finish-cycle`, deciso da uno script sui path del diff, in background accanto a `/code-review`, senza fermate umane nuove. Le dipendenze passano da `npm audit` quando cambiano. Brief e Spec dichiarano a monte se il ciclo tocca una superficie di sicurezza.

## 1. Fatti verificati

- `grep -rn "security-review\|npm audit" .claude/ docs/superpowers/PROCESS.md` trova solo `PROCESS.md:62`, `:121` e `.claude/skills/domain-audit/SKILL.md:10`, che distinguono la skill di sicurezza da `domain-audit`. Nessun passo del processo la esegue.
- Nei cicli c1-c7 della serie security `/security-review` è stata lanciata a mano (report `docs/superpowers/reports/2026-11-1[56]-security-c*-finish-cycle.md`). Nel c1 ha trovato il `?next=` di `terms.html`, assente dal Brief.
- `.claude/commands/finish-cycle.md`, Gate 2 step 0, lancia `/code-review` in background e definisce `<reviewed-sha>`; il Gate 3 la raccoglie come round 1 e la tratta con le quattro opzioni, la regola dei round successivi, la text-only rule e il tetto dei 3 round.
- `scripts/classify-cycle.mjs` è il modello: funzione pura su `git diff --name-status --find-renames -C -C -z`, CLI con prima riga a token letterale, errori su stderr con exit non zero. Esporta `audienceOf`.
- `origin/HEAD` punta a `origin/main`, che coincide con `main` locale dopo il push di Gate 5. Il comando built-in `/security-review` lavora sulle "pending changes" del branch; il suo diff di riferimento non è documentato nel repo.
- Manifest delle dipendenze: `package.json` + `package-lock.json` alla radice (toolchain di test, mai servita), `api/package.json` + `api/package-lock.json` (runtime). Infrastruttura: `nginx.conf`, `api/Dockerfile`, `docker-compose.yml`.
- `scripts/decision-ledger-guard.test.js` pretende già header e sezioni delle Spec con un taglio a data (`**Brief started:**` dal 2026-10-14).

## 2. Script — `scripts/security-scope.mjs`

Funzione pura `classifySecurityScope(z)` sull'output di `git diff --name-status --find-renames -C -C -z` (stessa lettura dei record di `classify-cycle.mjs`: due path per R/C, il solo destinatario per C), più una CLI.

**Contratto della CLI** (`node scripts/security-scope.mjs [range]`, range di default `main...HEAD`):

```
review|skip
audit: <api> <.> | audit: none
<path che hanno fatto scattare il verdetto, uno per riga>
```

- `review` quando almeno un path tocca una superficie; `skip` altrimenti, diff vuoto incluso.
- `audit:` nomina `api` se il diff tocca `api/package.json` o `api/package-lock.json`, `.` se tocca `package.json` o `package-lock.json` alla radice; `none` altrimenti. È indipendente dalla prima riga.
- Ogni errore: niente su stdout, messaggio su stderr, exit non zero. **Chi legge il comando tratta qualunque esito che non sia la prima riga letterale `skip` come `review`, e qualunque seconda riga illeggibile come `audit: api .`.** Uno script rotto non toglie mai un controllo.

**Superfici** (la lista normativa è il test, non questa sezione):

- `api/src/**` tranne `*.test.js`, migrazioni `.sql` incluse;
- le pagine `*.html` alla radice e `js/**/*.js` tranne `*.test.js`;
- `nginx.conf`, `api/Dockerfile`, `docker-compose*.yml`;
- `package.json`, `package-lock.json`, `api/package.json`, `api/package-lock.json`;
- `handbook/manifest.json`, e uno spostamento o una copia fra pubblici di `handbook/` (stessa regola di `classify-cycle.mjs`, con `audienceOf` importato).

Non fanno scattare nulla: test (`*.test.js`, `test-api.js`), `css/`, ogni `.md`, `.md`/`.png` di `handbook/` nello stesso pubblico, `scripts/`, `.claude/`.

## 3. Test — `scripts/security-scope.test.js`

- Per ogni superficie almeno un caso `review` e un caso `skip` vicino (es. `api/src/routes/x.js` → review, `api/src/routes/x.test.js` → skip; `js/pages/a.js` → review, `css/a.css` → skip).
- Match per prefisso, mai per sottostringa (`docs/api/src/x.md` → skip).
- Rename: giudicato su entrambi i path (`js/a.js` → `docs/a.md` → review).
- Riga `audit:` per ciascuna combinazione dei due pacchetti, e `none`.
- Stream troncato → `review`.
- **Test incrociato:** su un insieme di diff che `classifyNameStatus` dà `no-code`, `classifySecurityScope` dà `skip`. Il ramo no-code di §6.4c non ha bisogno di una regola propria.
- Casi di integrazione della CLI su un repository usa-e-getta, come in `classify-cycle.test.js`: prima riga, riga `audit:`, errore fuori da un repository.

## 4. `/finish-cycle`

### 4.1 Gate 1 — `npm audit`

Dopo `npm test` verde (step 1) e prima dello step 2, esegue `node scripts/security-scope.mjs` e legge la riga `audit:`.

- `api`: `cd api && npm audit --omit=dev --audit-level=high`. Exit non zero con advisory `high` o `critical` → **rosso del Gate 1**, rientro come dopo un rosso dello step 1.
- `.`: `npm audit --audit-level=high` alla radice, **solo riportato**: la toolchain di test non arriva mai in produzione.
- Un audit che non riesce a girare (rete, registry, errore di npm) non blocca: il report dice "not run" con il motivo, mai "clean".
- `audit: none` → nessun audit; il report lo dice.

### 4.2 Gate 2 step 0 — seconda run in background

Nello stesso step che lancia `/code-review`:

- Esegue `node scripts/security-scope.mjs` e registra `<security-scope>` (verdetto e path).
- Su `review`, lancia un secondo agente in background che esegue `/security-review`. Il prompt fissa lo scope a `git diff main...HEAD` e dice all'agente di rivedere quel diff se quello del comando built-in differisce. Registra l'HEAD coperto come `<security-reviewed-sha>`.
- **Skip:** solo se in questa sessione una `/security-review` del branch ha già coperto l'HEAD corrente (le run a mano prima di `/finish-cycle`). Lo skip di `/code-review` (Gate 3 step 0, §6.4) non vale per la sicurezza.
- Su `skip`, nessuna run.
- Valgono i vincoli di §6.4b: niente finding mostrati né fix prima della risposta del Gate 2; se non si può mettere in background, lo si dice in una riga e la run passa al Gate 3.
- Sul ramo no-code lo script dà `skip` per costruzione (test incrociato), quindi il ramo non cambia.

### 4.3 Gate 3 — un solo round 1

- Raccoglie entrambe le run. I finding di `/security-review` entrano nel round 1 con il prefisso `[security]` e la gravità mappata: HIGH → Important, MEDIUM → Important, LOW → Minor. Stesse disposizioni per target, stesse quattro opzioni, stesse regole sui follow-up.
- **Run morta, scaduta o illeggibile** → "non revisionata": si rilancia `/security-review` al Gate 3, prima di mostrare il round.
- **HEAD mosso durante il Gate 2:** se i commit `<security-reviewed-sha>..HEAD` fanno dare `review` allo script su quell'intervallo, il `/code-review` scoped che il Gate 3 già aggiunge porta nel prompt la consegna di controllare anche la sicurezza di quei commit. Nessuna seconda `/security-review`.
- **Round successivi:** `/security-review` gira una volta per ciclo. Quando il round precedente ha corretto finding `[security]`, il `/code-review` scoped del round successivo li porta nel prompt con la consegna di verificare che i fix li chiudano senza aprirne altri. Il tetto dei 3 round e la text-only rule non cambiano.

### 4.4 Report (Gate 5)

- Riga `**Security review:**`: girata o no, perché (`<security-scope>` con i path che l'hanno fatta scattare, oppure skip con il motivo), numero di finding e loro disposizione.
- Riga dell'audit nel resoconto del Gate 1: pacchetti, esito (`clean`, `N advisory high+`, `not run — <motivo>`, `none`).

## 5. Security by design

- `.claude/skills/feature-brief/SKILL.md`: la sezione Constraints porta sempre la riga `**Security surface:** yes — <input | route | permissions | rendering of user data | dependencies> | no`, con la domanda posta all'utente quando il codice non la decide.
- Ogni Spec porta nell'header la stessa riga. Quando la risposta è `yes`, la Spec ha almeno un criterio di accettazione che copre quella superficie. La classe di rischio non si alza per questo.
- `scripts/decision-ledger-guard.test.js` pretende la riga `**Security surface:** yes …` oppure `**Security surface:** no` nelle Spec datate dal giorno del merge di questo ciclo. Ne controlla la presenza, non la correttezza (§6b, "Il confine dei guard").

## 6. Documentazione

- `docs/superpowers/PROCESS.md`: nuova §6.4e con il principio (revisione decisa dai path, in background, finding al Gate 3, fallimento = `review`; audit delle dipendenze al Gate 1) e i rimandi a `scripts/security-scope.mjs`, al suo test e a `finish-cycle.md`. Aggiorna `:62` e `:121` solo se diventano falsi. La §6b cita la riga `Security surface` accanto a `Brief started`.
- `.claude/commands/finish-cycle.md`: il comportamento delle §4.1-4.4.
- `CLAUDE.md`: una riga per `scripts/security-scope.mjs` nel blocco File structure, accanto a `classify-cycle.mjs`.
- La lista delle superfici non si ripete in nessun documento.

## 7. Verifica

Il ciclo è di processo: nessuna pagina da verificare nel browser. `npm test` verde, guard documentali inclusi. Una prova a secco di `node scripts/security-scope.mjs` sul branch stesso (atteso `skip`, `audit: none`) e su un intervallo storico con codice (atteso `review`).

## Criteri di accettazione

1. **Comando** — `node scripts/security-scope.mjs` stampa `review`/`skip` e la riga `audit:` secondo il contratto della §2; `scripts/security-scope.test.js` ha almeno un caso positivo e uno negativo per ogni superficie, il test incrociato con `classify-cycle` e i casi CLI.
2. **Gate 2** — `finish-cycle.md` lancia `/security-review` in background al Gate 2 step 0 solo su `review`, e il Gate 3 ne raccoglie i finding nel round 1 insieme a quelli di `/code-review`.
3. **Run non leggibile** — `finish-cycle.md` tratta una run di sicurezza morta, scaduta o illeggibile come non revisionata e la rilancia al Gate 3.
4. **Skip dichiarato** — su `skip` `/finish-cycle` non lancia `/security-review` e il report lo dice nella riga `**Security review:**`.
5. **Security by design** — `feature-brief` porta la riga `Security surface`; `decision-ledger-guard` la pretende nelle Spec dal giorno del merge.
6. **`npm audit`** — `finish-cycle.md` Gate 1 lo esegue secondo la riga `audit:`, bloccante su `api` a `high`, riportato sulla radice, "not run" quando non gira.
7. **Documenti** — `PROCESS.md` §6.4e descrive il principio e rimanda a script e comando senza elencare le superfici; `npm test` è verde, guard documentali inclusi.

## Decisioni aperte

1. **`/security-review` built-in come run separata.** Alternativa scartata: estendere il prompt di `/code-review`. Perché: il built-in ha un proprio filtro dei falsi positivi, che nei cicli c1-c7 ha trovato il `?next=` di `terms.html`.
2. **Tutto il frontend runtime (`*.html`, `js/`) fa scattare la revisione.** Alternativa scartata: solo `api/` e le pagine che rendono dati utente. Perché: i path non distinguono il rendering senza leggere il codice, e un guard regex sul codice è escluso dal Brief.
3. **La classe di rischio non cambia.** Alternativa scartata: una categoria sicurezza in `high-risk`. Perché: alzerebbe l'effort e toglierebbe lo skip a quasi ogni ciclo.
4. **Sicurezza una volta per ciclo; i fix li verifica il `/code-review` scoped.** Alternativa scartata: `/security-review` a ogni round. Perché: il built-in non si restringe a un intervallo e moltiplicherebbe i round.
5. **`npm audit` bloccante su `api` a `high`, solo riportato sulla radice.** Alternativa scartata: bloccante anche sulla radice, o a `moderate`. Perché: la radice non arriva in produzione e `moderate` fermerebbe cicli su advisory senza fix.
6. **Il fallimento dello script vale `review`.** Alternativa scartata: vale `skip`. Perché: un classificatore rotto non deve togliere un controllo.
7. **La riga `Security surface` è pinnata da `decision-ledger-guard` sulle Spec.** Alternativa scartata: solo prosa in `feature-brief`. Perché: una regola in prosa senza guard decade, e il guard ne legge la presenza, non il codice.
8. **Fuori scope: `npm outdated` e le deprecazioni** (la lezione di `multer` nel c4). Alternativa scartata: includerli. Perché: YAGNI; resta un candidato al BACKLOG.
