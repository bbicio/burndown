# Spec — `/finish-cycle` Gate 5 più leggero

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-28-finish-cycle-gate5-lighter-brief.md` (Scenario 2, evoluzione).
Design concordato in chat il 2026-10-28 (una fermata, §6b).

## 1. Scope

Il Gate 5 fa lo stesso lavoro e scrive lo stesso contenuto. Cambiano tre cose:
- non aspetta un "sì" che l'utente ha già dato al Gate 4;
- non lancia la suite completa quando il diff tocca solo documentazione;
- riusa al passo 2b i comandi di verifica registrati al Gate 3.

La sua durata reale, fino al commit, diventa misurabile.

## 2. Il predicato `docs-only` — `scripts/gate5-scope.mjs`

### 2.1 Regola

Un diff del Gate 5 è `docs-only` quando non è vuoto e ogni path che tocca è:
- un file che finisce in `.md`, oppure
- `js/lib/test-cases-parse.test.js`.

Qualunque altro path, compresi `scripts/claude-md-guard.test.js` e qualsiasi `.html`, `.js` o `.css`, lo rende `other`.

Base empirica: dal 2026-10-09, in 30 commit `docs: sync docs` del Gate 5, gli unici path non `.md` sono stati `js/lib/test-cases-parse.test.js` (11) e `scripts/claude-md-guard.test.js` (3). Il comando che lo misura è in §6.

### 2.2 Script

- **Esecuzione:** `node scripts/gate5-scope.mjs`, da `main` con il lavoro del Gate 5 non committato.
- **Cosa valuta:** l'unione dei path modificati, aggiunti e non tracciati (`git status --porcelain`), esclusi i path che `.gitignore` ignora.
- **Output:** la prima riga di stdout è `docs-only` oppure `other`; le righe seguenti sono i path giudicati.
- **Errori:** un errore di git dà exit non zero, e il chiamante lo tratta come `other`.
- **Struttura:** la funzione pura `classifyGate5(paths) → 'docs-only' | 'other'` è esportata ed è quella che il test pinna. Lo schema è lo stesso di `scripts/classify-cycle.mjs`.
- **Path non tracciati estranei:** un file non tracciato che non appartiene al Gate 5 (per esempio un log lasciato nella root) rende il diff `other`. Il Gate 5 allora chiede, come oggi. Il caso reale di oggi, `.superpowers_up.log` (l'output di `scripts/test-branch.sh up` rediretto a mano il 2026-10-24), entra in `.gitignore` in questo ciclo.

### 2.3 Guard sui test esclusi

`scripts/gate5-scope.test.js` fallisce se un file `js/lib/*.test.js` diverso da `js/lib/test-cases-parse.test.js`:
- contiene `.md` seguito da `'`, `"` o `` ` ``, oppure
- cita `live-docs`.

Il guard tiene vera l'ipotesi del subset di §3, cioè che nessun test escluso legga un file `.md`. Il suo limite va dichiarato nell'intestazione del test: vede i letterali, non un path costruito a runtime.

## 3. Gate 5 step 3 — test

- **Ordine:** prima del test si esegue `node scripts/gate5-scope.mjs`.
- **Con `docs-only`:** `npx vitest run scripts/ js/lib/test-cases-parse.test.js`.
- **Con `other`, o con lo script in errore:** `npm test`, come oggi.
- **Comune ai due casi:** il passo resta bloccante e un rosso ha la semantica di oggi (nessun `git add`, commit o push; si corregge su `main` e si rientra nel gate).

## 4. Pre-autorizzazione — Gate 4 step 2 e Gate 5 steps 5-6

### 4.1 Gate 4 step 2

- **Le due domande.** La stessa `AskUserQuestion` porta due domande:
  - "Proceed with merge? [yes/no]", testo invariato;
  - "Pre-authorise Gate 5's commit and push to main, if its diff is docs-only and its tests pass on the first run? [yes/no]".
- **`<gate5-preauthorised>`:**
  - vale vero solo con un "yes" esplicito alla seconda domanda e un "yes" alla prima;
  - una risposta non chiara vale falso;
  - senza lo strumento `AskUserQuestion`, le due domande si fanno in chat.

### 4.2 Gate 5

- **Il diff si mostra sempre** (passo 4).
- **Quando non si chiede.** Il passo 5 salta la domanda e il passo 6 committa e pusha se valgono tutte queste condizioni:
  - `<gate5-preauthorised>` è vero;
  - l'ultima esecuzione di `scripts/gate5-scope.mjs` stampa `docs-only`;
  - il passo 3 è stato verde alla sua prima esecuzione in questo gate.

  Il passo dichiara in una riga che usa la pre-autorizzazione e perché.
- **Quando si chiede.** In ogni altro caso si chiede come oggi. In particolare:
  - un rosso al passo 3, anche se corretto, annulla la pre-autorizzazione;
  - un rientro nel gate dopo una correzione chiede sempre.
- **Domande di classe B.** Le domande di `/sync-docs`, per esempio "user-visible?", restano domande e non sono coperte.

## 5. Orologio — pre-flight step 6, template del report, `scripts/cycle-times.mjs`

- **Report.** Pre-flight step 6 non cambia; il campo del Gate 5 del template diventa `Gate 5 (to report) <N>m`. Il commento del template dice che il Gate 5 fino al commit si legge in `node scripts/cycle-times.mjs`, colonna `merge→docs`.
- **Nuovo momento `docs`.** `scripts/cycle-times.mjs` aggiunge `docs` dopo `merge`: è l'ora d'autore del commit che ha aggiunto il report del ciclo (`git log --diff-filter=A --format=%aI -- <report>`, il primo in ordine cronologico).
- **Nuova colonna.** L'intestazione aggiunge `merge→docs`. Un report senza quel commit dà `unknown`, mai una stima.
- **Report passati.** Non si modificano. Il campo `Gate 5 <N>m` dei report vecchi resta com'è; il nuovo momento vale anche per loro, perché si ricava da git.

## 6. Follow-up — Gate 3 step 3 e Gate 5 step 2b

- **Gate 3.** Ogni follow-up accettato entra in `code_review_followups` con il round e con un comando di sola lettura che ne verifica lo stato (`grep -n …`, `git log …`). Se un comando non c'è, lo dice con `unverified — <cosa servirebbe>`.
- **Gate 5 step 2b.** Riesegue i comandi registrati in una sola chiamata e scrive nella cella `Verified how` il comando con il suo risultato e la data. Non ne compone di nuovi, salvo per un comando che non gira più.
- **Righe chiuse fuori dai finding.** Le righe che il ciclo chiude per motivi diversi da un finding del Gate 3 mantengono il comportamento di oggi.

Misura della base empirica di §2.1, da ripetere al momento del Piano: `git log --since=2026-10-09 --grep="^docs: sync docs" --format=%h main`, poi `git show --name-only` per ogni commit e il filtro dei path non `.md`.

## 7. Regole scritte

- **Passaggio di perimetro di `/sync-docs` (`.claude/skills/sync-docs/SKILL.md`, Process).**
  - Un nuovo primo passo: un solo `git diff --stat` del ciclo e un sì o no dichiarato per ciascuna sezione da 1 a 7 prima di leggerne i file. La sezione 7 (memoria) è sempre sì.
  - Le letture dei file delle sezioni con sì si fanno raggruppate.
  - Il passo di oggi "Read the current state of each file before editing" resta, sui file scelti.
- **Modifiche nel Gate 5 (`.claude/commands/finish-cycle.md`, preambolo del Gate 5).**
  - Le modifiche ai file, comprese quelle di `/sync-docs`, del report e di `docs/BACKLOG.md`, si fanno con lo strumento Edit o con uno script scritto in un file e poi eseguito.
  - Mai con `node -e` o `sed` con testo citato nella shell.

## 8. Documentazione

- **`docs/superpowers/PROCESS.md`:**
  - §1, nella riga di `/finish-cycle`: la seconda domanda del Gate 4, il subset di test e la pre-autorizzazione del Gate 5;
  - §4b punto 2 e §6.2: il Gate 5 step 3 lancia la suite completa o il subset `docs-only`.
- **`.gitignore`:** la riga `.superpowers_up.log`.
- **`CLAUDE.md`:** una voce per `scripts/gate5-scope.mjs` nel blocco File structure, di una o due righe, con il pin di `scripts/claude-md-guard.test.js` aggiornato nello stesso commit.

## Criteri di accettazione

1. **Predicato** — `scripts/gate5-scope.test.js` passa con questi casi:
   - solo `.md` → `docs-only`;
   - `.md` più `js/lib/test-cases-parse.test.js` → `docs-only`;
   - `scripts/claude-md-guard.test.js` → `other`;
   - un `.html` → `other`;
   - lista vuota → `other`.
2. **Guard** — `scripts/gate5-scope.test.js` fallisce su un `js/lib/*.test.js` fittizio che legge un `.md`, e passa sul repo così com'è.
3. **Subset** — il Gate 5 step 3 di `.claude/commands/finish-cycle.md` lancia `npx vitest run scripts/ js/lib/test-cases-parse.test.js` con `docs-only` e `npm test` con `other` o con lo script in errore.
4. **Pre-autorizzazione** — il Gate 4 step 2 porta la seconda domanda. Il Gate 5 committa senza chiedere solo quando valgono pre-autorizzazione, `docs-only` e verde al primo run; un rosso al passo 3 la annulla.
5. **Orologio** — `node scripts/cycle-times.mjs` stampa le colonne `docs` e `merge→docs`, con un valore per il ciclo `dates-c4-saves-period`. `scripts/cycle-times.test.js` pinna la colonna nuova e `unknown` quando il commit manca.
6. **Template** — il template del report porta `Gate 5 (to report) <N>m` e il rimando a `merge→docs`.
7. **Follow-up** — il Gate 3 step 3 registra un comando di verifica per ogni follow-up accettato, e il Gate 5 step 2b lo riesegue.
8. **Regole scritte** — `.claude/skills/sync-docs/SKILL.md` apre il Process con il passaggio di perimetro, e il preambolo del Gate 5 vieta `node -e` e il quoting della shell per le modifiche.
9. **PROCESS.md e CLAUDE.md** — §1, §4b punto 2 e §6.2 descrivono il Gate 5 come lo esegue il comando; `CLAUDE.md` elenca `scripts/gate5-scope.mjs`; `.gitignore` ignora `.superpowers_up.log`; `npm test` è verde.

## Decisioni aperte

1. **Un predicato unico per le opzioni 1 e 6, in uno script con test.** Alternativa scartata: due liste di path scritte nel testo. Perché: il Brief chiede una regola o un comando, e i commit del Gate 5 dal 2026-10-09 mostrano che il predicato basta.
2. **`scripts/claude-md-guard.test.js` resta fuori da `docs-only`.** Alternativa scartata: ammettere ogni `scripts/*.test.js`. Perché: toccarlo vuol dire cambiare un pin, che va visto prima del push; succede in 3 commit su 30.
3. **Un rosso al passo 3 annulla la pre-autorizzazione.** Alternativa scartata: pushare senza chiedere anche dopo la correzione. Perché: la correzione è un contenuto che il "sì" del Gate 4 non copriva.
4. **Due domande nella stessa `AskUserQuestion` al Gate 4.** Alternativa scartata: un'unica domanda a tre opzioni. Perché: "Proceed with merge?" resta letterale, e una risposta non chiara alla seconda vale "nessuna pre-autorizzazione".
5. **Il report misura il Gate 5 fino al report, `scripts/cycle-times.mjs` fino al commit.** Alternativa scartata: un secondo commit che completa il report. Perché: costerebbe un commit e un'attesa a ogni ciclo.
6. **Il momento `docs` è il commit che ha aggiunto il report del ciclo.** Alternativa scartata: riconoscere il soggetto `docs: sync docs + finish-cycle report for <branch>`. Perché: il path del report identifica il ciclo senza dipendere dal testo del messaggio.
7. **Il passo 2b riesegue i comandi registrati al Gate 3, invece di copiarli.** Alternativa scartata: copiare il risultato del Gate 3. Perché: la regola 3 di `docs/BACKLOG.md` chiede un comando eseguito, e i fix dei round successivi spostano le righe.
8. **Le opzioni 3 e 5 sono regole scritte:** la 3 nel Process di `/sync-docs`, la 5 nel preambolo del Gate 5. Alternativa scartata: abitudini in memoria. Perché: un'abitudine non arriva a una sessione nuova.
9. **Un file non tracciato non ignorato rende il diff `other`, e `.superpowers_up.log` entra in `.gitignore`.** Alternativa scartata: lasciare il file all'utente, oppure ignorare nel verdetto i non tracciati non `.md`. Perché: il predicato non conosce gli estranei e chiedere è l'uscita sicura, mentre senza la riga in `.gitignore` il file presente oggi renderebbe `other` ogni Gate 5. Nata scrivendo la Spec, scelta dall'utente il 2026-10-28.
