# Processo di sviluppo — burndown (PDash)

> Documenta il workflow spec-driven come applicato finora. Fra le skill di processo (§5), `operational-manual` produce documentazione utente su richiesta — non fa parte della catena Brief→Spec→Piano, ma va mantenuta sincronizzata con il PRD, che è un insieme di file: `PRD.md` (sezioni trasversali + Indice) più `docs/prd/<area>.md` (vedi §5).
>
> Aggiornato via `/sync-docs`, ma solo quando un ciclo introduce un cambiamento reale al processo — non ad ogni esecuzione. Vedi criterio di aggiornamento in fondo al documento.
>
> **Come si citano le sezioni di questo documento:** sempre in forma piena — `§4b` per la sezione di primo livello, `§6.4b` per il punto dentro §6, `§6.6.5` per il punto dentro §6.6 — mai «4b» a secco.

---

## 1. Scheletro comune

Ogni intervento sul codice, a prescindere dallo scenario, attraversa la stessa sequenza:

```
Brief → /brainstorming → Spec (committata) → /writing-plans → Piano (committato)
→ Esecuzione → /finish-cycle
```

| Fase | Cosa fa internamente |
|---|---|
| **Brief** | Descrizione del problema/obiettivo. Input varia per scenario (vedi §2). Prodotto dalla skill `feature-brief` (Scenari 1 e 2) o `audit-to-brief` (Scenario 3, a partire da un report d'audit già chiuso). |
| **`/brainstorming`** | Esplora alternative, pone domande di chiarimento, fissa esplicitamente lo **scope escluso**. Produce la Spec. |
| **Spec (committata)** | Documento di design: problema, comportamento atteso, vincoli, criteri di accettazione (sezione in §6b), scope escluso. Committata prima di procedere. |
| **`/writing-plans`** | Trasforma la Spec in un piano di esecuzione a step, ciascuno verificabile. |
| **Piano (committato)** | Sequenza di task eseguibili, committato prima dell'esecuzione. Senza una Spec porta lui la sezione dei criteri di accettazione (§6b). |
| **Esecuzione** | Subagent-driven o nativa, scelta in base alla dimensione del ciclo (vedi §6), segue il piano passo per passo. Da qui Spec e Piano sono congelati: ogni scostamento va nelle Roadmap notes del report del ciclo. Guardie specifiche per scenario (vedi §2). Il completamento dell'esecuzione sfocia **sempre** in `/finish-cycle`, mai nella skill generica — vedi l'override in `CLAUDE.md`. |
| **`/finish-cycle`** | Terminale di ogni esecuzione in questo progetto — sostituisce `superpowers:finishing-a-development-branch`, non la segue. Ogni gate di giudizio si ferma sempre; i gate oggettivi — test e pre-flight — bloccano o sbloccano senza chiedere, e non chiedono nemmeno il restart del backend e la cancellazione del branch locale (§6b). I gate, nell'ordine reale del comando:<br>• **Gate 1 — test:** pre-check meccanico delle affermazioni sui `*.md` toccati dal branch (§6.4d, è lo step 0, prima dei test) → `npm test` → suite Docker backend (`scripts/run-tests.sh`) se il diff tocca `api/`, o se la rilevanza di un path toccato per il comportamento del backend è incerta.<br>• **Gate 2 — verifica manuale:** **`/code-review` parte in background all'apertura del gate** (§6.4b, è lo step 0, subito dopo la classificazione meccanica del ciclo); ambiente Docker isolato per il branch rilevato automaticamente via `scripts/test-branch.sh status` (riuso o rebuild se già attivo); ricerca spec/piano, sempre conferma, mai euristica; prima della domanda sulla verifica browser, la lista a spunta dei criteri di accettazione e dei casi di `TEST_CASES.md` del diff; **ramo per i cicli senza codice / no-code cycle** — il gate esegue `node scripts/classify-cycle.mjs` e, **solo** se la prima riga del suo stdout è `no-code`, mostra il diff e chiede di confermare la classificazione **invece di offrire lo stack Docker, cercare spec/piano e chiedere la verifica browser**, e il Gate 3 non si salta.<br>• **Gate 3 — code review:** raccoglie quella run come proprio round 1, e **prima di ogni nuovo round riesegue il pre-check del Gate 1 sulle correzioni appena fatte, seguito dai guard documentali** (§6.4d) (max 3 round; i finding si trattano qui, mai durante la verifica; i finding su Spec e Piano e sulla prosa preesistente innocua non si lavorano; saltato alle condizioni dello step 0 del gate, da leggere lì e non a memoria, §6.4).<br>• **Gate 4 — merge:** riepilogo pre-merge esplicito e "Proceed with merge?" → **`scripts/backup-db.sh`, automatico e prima che il merge cambi stato, ma solo se il diff aggiunge migrazioni o tocca `api/`** (cioè solo se lo stack sta per essere toccato) → `git merge --no-ff` + push → **applicazione automatica delle nuove migrazioni, se il diff tocca `api/src/db/migrations/`** → **restart automatico di `pdash-api`, se il diff tocca `api/`** (deroga nominata in `CLAUDE.md`) → pulizia worktree → cancellazione automatica del branch locale.<br>• **Gate 5 — `/sync-docs` e report:** `/sync-docs` → report persistito in `docs/superpowers/reports/` → **i follow-up accettati scritti come righe in `docs/BACKLOG.md`** (passo `2b`, automatico) → **`npm test` bloccante prima di mostrare il diff** (§4b) → conferma esplicita di push. `/sync-docs` aggiorna anche la **memoria di progetto** (vedi nota sotto), senza conferma ma sempre riportata nel report.<br>• **Gate 6 — report finale in chat.** |

**Nota — memoria di progetto:** la memoria di Claude (`~/.claude/projects/<progetto>/memory/`, indice `MEMORY.md`) sta fuori dal repo: non compare in nessun diff, non viene committata.
- **Regola:** `/sync-docs` (sezione 7) valuta la memoria a **ogni** esecuzione, cioè a ogni chiusura ciclo via `/finish-cycle` Gate 5. Trova i file `project` che citano il ciclo o un backlog toccato, e li aggiorna: stato (mergiato, data, hash, report), priorità e "prossimo ciclo" (comprese le decisioni prese durante il ciclo), prerequisiti e limiti chiusi; elimina le memorie superate e riallinea `MEMORY.md`.
- **Automatico, non silenzioso:** nessuna conferma, ma ogni modifica va riportata come *prima → dopo* nel riepilogo di `/sync-docs` e nella sezione "Memory outcome" del report del ciclo.
- **Mai inventare:** un fatto che il merge non stabilisce resta com'è ed è elencato come "unverified"; la memoria non duplica ciò che il repo già registra (il report del ciclo è quel registro).
- Le memorie `user`/`feedback`/`reference` non fanno parte di questo giro, salvo contraddizione diretta da parte del ciclo.

**Nota — handoff di design come input del Brief:** i cicli di redesign UI (fondamenta, navigazione, una pagina per volta) partono da un documento di handoff prodotto in Claude Design e salvato in `docs/superpowers/design/<data>-<ciclo>-handoff.md`, committato prima di aprire il worktree. L'handoff è un **input** della fase Brief (`feature-brief` lo legge e lo traduce nel Brief), non un sostituto di Brief/Spec: le sue affermazioni sul codice vanno **verificate contro il codice** in `/brainstorming`. Un ciclo per volta, ciascuno in un worktree creato dopo il merge del precedente.

---

## 2. I tre scenari

Le fasi centrali (Spec → `/writing-plans` → Piano) sono **identiche** nei tre scenari. Cambia solo cosa alimenta il Brief e quali guardie attivare durante l'esecuzione.

### Scenario 1 — Nuova feature

- **Brief**: scritto da zero, nessun comportamento esistente da preservare. Prodotto dalla skill `feature-brief` — primo passo sempre una domanda esplicita di classificazione dello scenario, mai inferita dal testo della richiesta.
- **`/brainstorming`**: fissa lo scope escluso come guardia principale contro lo scope creep.
- **Esecuzione — guardia**: non farsi tentare da funzionalità aggiuntive non previste nello scope.

### Scenario 2 — Evoluzione di una feature esistente

- **Brief**: richiesta + lettura del comportamento attuale (codice esistente, bug incluso). Prodotto dalla skill `feature-brief`, stesso primo passo di classificazione dello Scenario 1.
- **`/brainstorming`**: prima di toccare codice, **characterization test** sul comportamento attuale per "pinnarlo".
- **Esecuzione — guardia**: non rompere un caller ignoto che dipende dal comportamento esistente.

### Scenario 3 — Audit → fix

- **Brief**: costruito a partire dai finding di un report d'audit già chiuso, citati per ID/numero. Prodotto dalla skill `audit-to-brief`, che prende il report come dato chiuso (non riesegue l'audit) e propone un raggruppamento dei finding in cicli — per causa radice condivisa o stesso file/funzione, mai "un finding per ciclo" né "tutti insieme" — da confermare esplicitamente con l'utente prima di scrivere i Brief. Passo non saltabile: **root-cause analysis esplicita**, ri-derivata indipendentemente dalla skill anche quando l'audit ha già raggruppato i finding — capire se finding apparentemente distinti condividono causa comune (es. stesso file, stessa funzione). Un finding di natura diversa dagli altri (es. una scelta di design, non una divergenza di correttezza/consistenza) va segnalato esplicitamente e trattato con un Brief in forma Scenario 2, non forzato nello schema meccanico audit-fix.
- **`/brainstorming`**: guardia specifica — se emerge un finding nuovo non previsto dall'audit originale, va sempre isolato a parte, mai risolto di straforo nello stesso ciclo.
- **Esecuzione — guardia**: isolare i finding nuovi emersi durante l'esecuzione, mai risolverli senza un Brief dedicato.

**Nota sull'audit stesso** (a monte del Brief, solo per lo Scenario 3): l'audit è un processo a sé — verifica soltanto, non fixa. Condotto dalla skill `domain-audit`: negoziazione esplicita dello scope (perimetro, cosa conta come finding, ground truth) prima di leggere codice, evidenza con citazioni file:linea per ogni claim, root-cause analysis prima di classificare, mai un fix durante l'audit (guardia che regge anche a una richiesta esplicita e ripetuta dell'utente di fixare al volo), finding fuori scope isolati in una sezione dedicata del report. Report persistito in `docs/superpowers/audits/`. Distinta dalla skill di sicurezza (`security-review`) — non sovrappone vulnerabilità/credenziali/injection.

**Cadenza raccomandata — audit di riconciliazione documentazione-vs-codice:** oltre all'uso ad-hoc dello Scenario 3 su un'area specifica, un audit `domain-audit` con il PRD come ground truth (scope: "tutte le pagine utente-facing vs il PRD") va considerato:
- **Obbligatorio** prima di ogni rigenerazione di `docs/OPERATIONAL_MANUAL.html` (skill `operational-manual`) — non generare il manuale su un PRD la cui accuratezza non è stata riverificata di recente.
- **Raccomandato come pratica standing**, a prescindere dalla generazione del manuale, con una cadenza indicativa di circa ogni 10 cicli `/finish-cycle` chiusi o ogni ~2 mesi, quale che venga prima.
- **L'audit può essere incrementale:** l'unità di audit è il file d'area; `PRD.md`'s Indice mappa ogni `§N` al file che lo contiene.

**Cadenza raccomandata — audit ARCHITECTURE.md/CLAUDE.md vs codice:** lo stesso schema, esteso ai due documenti di architettura/riferimento operativo. Un audit `domain-audit` con questi due file come ground truth (scope: "l'intero codebase vs ARCHITECTURE.md/CLAUDE.md, entrambe le direzioni") va considerato:
- **Raccomandato come pratica standing**, con la stessa cadenza indicativa di `PRD.md` — circa ogni 10 cicli `/finish-cycle` chiusi o ogni ~2 mesi, quale che venga prima.

---

## 3. Eccezioni concordate (esempi, non regola generale)

Le deroghe al processo standard sono permesse ma vanno sempre:
1. Decise esplicitamente in conversazione, non applicate di default.
2. Annotate nel report del ciclo interessato ("perché" e "cosa è stato saltato").
3. Mai generalizzate automaticamente al ciclo successivo — ogni deroga si conferma di nuovo, non si eredita.

---

## 4. Guardia infrastrutturale — comandi Docker sul main stack

Regola permanente (non un'eccezione una tantum), applicabile alla fase Esecuzione di **tutti e tre** gli scenari, ogni volta che un task/piano prevede di eseguire comandi `docker compose` contro lo stack principale (`pdash-db`/`pdash-api`/`pdash-nginx`/`pdash-adminer`, progetto `burndown`) invece che contro uno stack isolato (`scripts/test-branch.sh`, `scripts/run-tests.sh`).

**Regole (vincolanti, ripetute anche in `CLAUDE.md` §Infrastructure safety che ha precedenza sulle skill):**
1. Nessun `-v`/`--volumes` contro il main stack in nessuna circostanza; ogni dispatch che istruisce un agente a eseguire `docker compose down/up/restart` sul progetto principale deve vietarlo esplicitamente e imporre di fermarsi ed escalare (mai improvvisare un comando più aggressivo) se qualcosa non si comporta come atteso.
2. Snapshot (`pg_dump`) esplicito prima di qualunque operazione Docker-lifecycle delegata sul main stack — mai fare affidamento su un dump incidentale lasciato da un ciclo scollegato.
3. `docker compose down/up/restart` sul main stack, anche senza `-v`, richiede conferma esplicita dell'utente come qualunque azione ad alto rischio — non va trattato come "sicuro perché reversibile in teoria". **Unica deroga nominata, di pari portata a quella scritta in `CLAUDE.md`**: il `docker compose restart api` post-merge del Gate 4 step 7 gira senza chiedere — quel comando solo, in quel momento solo, mai `down`, mai `-v`. Non poggia sullo snapshot dello step 3, che è non bloccante. Preferire, quando il piano lo consente, la verifica contro uno stack isolato invece di toccare il main stack.

---

## 4b. Guardie meccaniche — i guard sulla documentazione

Accanto alla guardia infrastrutturale di §4, che è una regola di condotta, ci sono guardie che non dipendono dall'attenzione di nessuno: sono test, girano dentro `npm test`, e fermano il ciclo da sole. Quelle qui sotto sorvegliano **la documentazione e il processo**; `npm test` ne contiene altre, di prodotto (sotto `js/lib/`, sui token, sulla navigazione, sulle pagine), che non riguardano il processo. La lista autorevole è `ls scripts/*-guard.test.js`, e un ciclo che aggiunge un guard di processo **aggiunge anche la sua riga qui**.

| Guard | Diventa rosso quando |
|---|---|
| `scripts/architecture-guard.test.js` | un route handler, una tabella creata da una migrazione o una colonna aggiunta da un `ALTER TABLE` non è documentata in `ARCHITECTURE.md` §5/§6 |
| `scripts/claude-md-guard.test.js` | `CLAUDE.md` supera il proprio tetto, il blocco File structure si scosta dal pin esatto, o un documento vivo punta a una sua sezione che non esiste più |
| `scripts/doc-paths-guard.test.js` | un documento vivo cita un path di file del repo che non esiste e non è nella allowlist `GONE` |
| `scripts/decision-ledger-guard.test.js` | una Spec o un Piano datato dal 2026-10-12 non porta la sezione `## Decisioni aperte`, o ne porta una con una voce incompleta; una Spec, o un Piano senza Spec, datato dal 2026-10-24 non porta una `## Criteri di accettazione` valida (§6b) |

Due conseguenze operative — la prima specifica di `architecture-guard`, la seconda valida per tutti i cicli:

1. **Un rosso di `architecture-guard` si corregge sul branch, mai al Gate 5.** Il guard blocca il Gate 1; lo step che aggiorna `ARCHITECTURE.md` (`/sync-docs` §1) gira al Gate 5, cioè *dopo* il merge. Chi aggiunge un endpoint o una migrazione documenta §5/§6 prima di chiudere, altrimenti il Gate 1 non diventa verde.
2. **Il Gate 5 esegue `npm test` prima di mostrare il diff.** È lo step che modifica i numeri che i guard pinnano, ed è anche quello che pusha su `main`. Un rosso lì si corregge su `main` e si rientra nel gate — non è un "rilancia `/finish-cycle` da capo", perché il merge è già avvenuto.

**Il valore corrente dei pin non sta qui, sta nei test.** Questa sezione non riporta nessun valore pinnato e nessun conteggio che possa invecchiare. Chi deve sapere cosa un guard accetta oggi legge il file, mai una parafrasi — e ogni guard dichiara nella propria intestazione i limiti che **non** copre, che è la parte più facile da scambiare per copertura.

---

## 5. Skill di processo

Non una per scenario ma una per tipo di gap — ciascuna in `.claude/skills/<nome>/SKILL.md`. **Questo elenco è la definizione di «skill di processo»** cui rimanda la prima condizione della sezione `docs/superpowers/PROCESS.md` di `.claude/skills/sync-docs/SKILL.md` (cercarla per quel soggetto nell'heading, non per numero): una skill aggiunta qui rientra in quella condizione senza che nulla vada riscritto altrove.

- **`feature-brief`**: converte una richiesta grezza in un Brief strutturato per gli scenari 1 e 2. Primo passo sempre una domanda esplicita di classificazione dello scenario, mai inferita.
- **`domain-audit`**: conduce l'audit di dominio per lo scenario 3 — scope negoziato prima di leggere codice, evidenza file:linea per ogni claim, root-cause analysis, mai fix durante l'audit, finding fuori scope isolati in sezione dedicata. Non sovrappone la skill di sicurezza (`security-review`); tassonomia dei finding libera, decisa per singolo audit. Vedi anche la cadenza raccomandata in §2 per il suo uso come audit di riconciliazione `PRD.md`-vs-codice.
- **`audit-to-brief`**: prende un report d'audit già chiuso (generato da `domain-audit`) e costruisce il/i Brief di fix per lo scenario 3 — raggruppamento dei finding in cicli proposto e confermato con l'utente, mai deciso unilateralmente; finding di natura diversa (es. design vs. correttezza) segnalati e trattati con un Brief in forma Scenario 2.
- **`operational-manual`**: non fa parte della catena Brief→Spec→Piano — produce `docs/OPERATIONAL_MANUAL.html`, il manuale operativo utente-facing, **solo su richiesta esplicita**, mai automaticamente. Ha però un obbligo di sincronizzazione permanente con il PRD (`PRD.md` più `docs/prd/`): la skill contiene, inlineata al proprio interno (sezione "PDash detail-content reference"), l'elenco dettagliato di cosa documentare per ciascuna area del prodotto, mantenuto verificato contro il PRD. **`/sync-docs` (sezione 5b del proprio file) aggiorna questa sezione ogni volta che `PRD.md` o un file `docs/prd/` viene toccato nello stesso ciclo**. La generazione vera e propria dell'HTML resta un trigger separato e resta a richiesta.

---

## 6. Esecuzione proporzionata al ciclo

Le regole sotto valgono per tutti e tre gli scenari.

### 6.1 Modalità e modello, scelti al passaggio Piano → Esecuzione
- **La modalità va dichiarata, non dedotta da una parola dell'utente.** Claude dichiara la modalità che applicherebbe *e la regola di questo paragrafo che la giustifica* (es. "4 file di produzione, nessuna migrazione, nessuna nuova API, i 4 task toccano gli stessi 2 file → **nativa** per §6.1"). **Questa dichiarazione non è un turno a sé: viaggia dentro il passaggio di consegne di `/writing-plans`**, insieme al path del Piano e alle sue decisioni aperte (§6b). Una richiesta secca dell'utente ("subagent-driven") resta vincolante, ma va prima messa a confronto con la regola.
- **Il Piano deve dire se i task sono indipendenti.** Subagent-driven presuppone task indipendenti: se il Piano non lo afferma esplicitamente, la precondizione non è soddisfatta e si va in nativa.
- **Ciclo piccolo** (indicativamente ≤ 5 file, nessuna migrazione, nessuna nuova API, task fortemente sequenziali): esecuzione **nativa** (`superpowers:executing-plans`), oppure pochi task più grandi.
- **Ciclo grande o con task indipendenti:** subagent-driven.
- **Modello:** in subagent-driven gli implementatori girano su **Sonnet** (`model: sonnet`), mentre il coordinatore e la revisione finale dell'intero branch restano su Opus. In nativa l'utente cambia a mano il modello della sessione (`/model sonnet`) prima di implementare, e torna su Opus per la revisione finale e `/finish-cycle`. Brainstorming, spec, debugging e code review restano su Opus.
- **Contesto dei file nei dispatch.** Il prompt di dispatch di un implementer riporta il path assoluto del worktree (§6.1b), copia dal Piano la lista dei file del suo task e gli chiede di aprirli prima di modificare; il prompt di un reviewer riceve lo stesso path, la stessa lista e il range di commit da rivedere. In esecuzione nativa non c'è dispatch e il punto non si applica.

### 6.1b Classe di rischio, dichiarata al passaggio Piano → Esecuzione
- **Tre classi, per categoria e non per lista di file:**
  - **`high-risk`** — il Piano tocca almeno una di: migrazione DB; autenticazione o permessi; money o valute; file condivisi caricati da più pagine; operazioni distruttive (reset, script Docker o di backup).
  - **`low-risk`** — nessuna categoria `high-risk`, nessuna route API, nessun modulo `js/lib/` o `api/src/lib/`, nessun file di processo (`docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`).
  - **`standard`** — tutto il resto.
- **Nel dubbio, la classe più alta.**
- **La classe va dichiarata, non dedotta**, con la categoria che la giustifica, nella stessa forma della modalità di §6.1 e nella stessa fermata di `/writing-plans` (§6b).
- **L'header del Piano porta tre righe**, lette da `/finish-cycle` al Gate 2; `scripts/decision-ledger-guard.test.js` pretende `**Branch:**` e `**Risk class:**`:

  ```markdown
  **Spec:** `docs/superpowers/specs/<file>-design.md`
  **Branch:** `<nome esatto del branch>`
  **Risk class:** <low-risk|standard|high-risk> — <categoria che la giustifica>
  ```
- **Il worktree di esecuzione si crea con il nome dichiarato.** Dal checkout principale, su `main` locale, con Spec e Piano già committati, dove `<nome>` è il `**Branch:**` del Piano:

  ```bash
  git worktree add .claude/worktrees/<nome> -b <nome>
  git -C .claude/worktrees/<nome> branch --show-current
  ```

  Se il primo comando fallisce, o il secondo non stampa `<nome>`, ci si ferma prima di qualunque modifica. Mai `EnterWorktree`: la sessione entra nel worktree con `cd` e usa i path del worktree anche negli strumenti di file. In subagent-driven il worktree lo crea il coordinatore.
- **Effort di ogni `/code-review` del ciclo:** `low-risk` → low, `standard` → medium, `high-risk` → high. Piano non identificato dal Gate 2 → la classe si chiede all'utente; Piano identificato con classe assente o fuori da questi tre valori → `standard`. In `high-risk` lo skip completo del Gate 3 non si applica. Come `/finish-cycle` lo applica: Gate 2 e Gate 3 di `.claude/commands/finish-cycle.md`.

### 6.2 Test
- Con Node dell'host ≥ 20.12 `npm test` gira nativo. Il comando Docker `node:22` di `CLAUDE.md` resta solo come fallback per un host con Node vecchio.
- Un worktree nuovo non ha `node_modules`: subito dopo averlo creato, eseguire `npm ci` una volta (insieme alla copia di `.env`).
- **Durante i task si lanciano solo i file di test toccati o aggiunti** (`npx vitest run <file>`; backend: `docker exec pdash-api node --test src/<file>`). La suite completa gira **dentro `/finish-cycle`, in due punti, entrambi bloccanti**: al Gate 1 step 1, prima di qualunque verifica, e al Gate 5 step 3, sulle modifiche di `/sync-docs` e prima del push. Mai due suite complete in parallelo, e quando una è verde non si rileggono i suoi log: l'esito è l'esito.
- **Nel coordinatore non si fa una passata di fine esecuzione:** il Gate 1 ritesta lo stesso albero all'apertura di `/finish-cycle`.

### 6.3 Una sola verifica visiva per ciclo
- Di default la verifica visiva è quella dell'utente al Gate 2 di `/finish-cycle`; il Piano non include un task di screenshot automatici.
- Gli screenshot automatici si fanno solo se decisi esplicitamente in `/brainstorming` (es. confronto con le tavole di un handoff di design a più larghezze) e scritti nel Piano, con gli stati e le larghezze da coprire. **Lo strumento esiste già e non va reinventato: `scripts/shoot.mjs`** (vedi §6.6) — niente script usa-e-getta né server simulato, tranne per le pagine pubbliche se si vuole evitare il login.
- **Chrome headless funziona** contro lo stack reale (Claude in Chrome è bloccato per `localhost` da policy aziendale): «in questo ambiente non si può rendere la pagina» non è una motivazione valida per non verificare.
- Un difetto visivo piccolo trovato in verifica (poche righe di CSS/markup) si corregge direttamente nella sessione principale, con il test mirato: niente subagent dedicato.

### 6.4 Niente revisioni doppie sullo stesso diff

Se la revisione finale dell'intero branch (es. quella di subagent-driven) copre `main...HEAD` all'HEAD corrente, il Gate 3 di `/finish-cycle` non rilancia `/code-review`, salvo in `high-risk` (§6.1b): lo dichiara e lo annota nel report. Valgono anche i commit successivi che contengono solo le correzioni di quella revisione, purché già ri-revisionati. In esecuzione nativa non c'è revisione per task: resta la sola revisione finale (o il Gate 3).

### 6.4b Il Gate 3 parte in parallelo al Gate 2

`/code-review` si lancia **in background** quando si *apre* il Gate 2, non dopo il "yes" dell'utente: è di sola lettura, quindi gira mentre l'utente verifica nel browser e il suo tempo esce dal percorso critico. Il Gate 3 la raccoglie come proprio round 1 e resta il punto in cui i finding si mostrano e si trattano.
- **Tre vincoli.** I finding **non si mostrano e non si correggono** prima della risposta del Gate 2; il "no" del Gate 2 ferma il ciclo esattamente come prima; una run morta, scaduta o senza risultato leggibile vale **non revisionata**, mai "pulita", e il Gate 3 la rilancia.
- **Un commit nato durante il Gate 2 va comunque revisionato.** La revisione lanciata all'apertura copre l'HEAD di quel momento: se durante la verifica atterra una correzione, il Gate 3 aggiunge la revisione scoped di quei soli commit prima di mostrare i finding.
- **Per i fix nati dal Gate 2 la norma è la revisione scoped `<reviewed-sha>..HEAD`** — il punto 0b del Gate 3: il resto del diff è coperto dalla revisione lanciata all'apertura del gate, e rivederlo sarebbe la doppia revisione che §6.4 vieta.
- **Niente macchina a stati.** Un ampliamento di questo meccanismo passa da una spec, non da un diff.

### 6.4c Il Gate 2 ha un ramo per i cicli senza codice — no-code cycle

Prima di ogni altra cosa il Gate 2 classifica il ciclo in modo **meccanico**, eseguendo `node scripts/classify-cycle.mjs`: concede il ramo **solo** sul token letterale `no-code` come prima riga di stdout, e qualunque altro esito — `ordinary`, un errore, lo script assente, output vuoto — è un ciclo ordinario, così che un classificatore rotto non possa saltare una verifica. Su un ciclo senza codice il gate mostra il diff e chiede di **confermare la classificazione**, invece di offrire lo stack Docker, eseguire l'archeologia git di spec/piano e chiedere "Have you manually verified this in the browser?".
- **La regola vive nel codice, non qui.** `scripts/classify-cycle.mjs` decide, `scripts/classify-cycle.test.js` la pinna: casi unit sulla regola, più casi di integrazione su repository usa-e-getta che verificano **il comando** e non solo la regola. Chi deve sapere cosa qualifica legge il test, non una parafrasi. Resta il principio: **il test è la lista dei path**, mai un giudizio su "di cosa parla il ciclo".
- **Perché i guard sono quelli.** Un `*.md` di root che l'app carica a runtime conta come codice, perché cambiarlo cambia ciò che una pagina rende. Sotto `docs/` qualificano solo i `.md`. Sotto `.claude/` idem, e per una ragione più scomoda: a proteggere la regola non è `.gitignore` (che ignora il solo `settings.local.json`) ma il fatto che `.claude/settings.json` — il file condiviso con hook e permessi — oggi non esista. La lista delle eccezioni nominate è la costante `RUNTIME_LOADED_ROOT_MD` dello script: la aggiorna il ciclo stesso che introduce il `fetch`. Il contenuto corrente della costante sta nello script, non qui.
- **Il nome è "ciclo senza codice", non "process-only":** `PRD.md` e `docs/prd/` sono documentazione di prodotto, che "process-only" classificherebbe male.
- **Cosa NON cambia.** Lo step 0 (lancio di `/code-review` in background, §6.4b) si applica in **entrambi** i rami — con le sue stesse condizioni di skip e di scoping, che il ramo senza codice non altera — e **il Gate 3 non si salta per il fatto di essere un ciclo senza codice**. Restano invariati il preambolo del Gate 2 sul teardown, la domanda del browser sul ramo ordinario, e `npm test` al Gate 1 in ogni ciclo.
- **Una cosa invece si perde, e va annotata nel report:** saltando gli step 2-5 lo step 5 non raccoglie candidati — né Piano né Spec; il Piano trovato dall'identificazione del Gate 2 alimenta solo la classe di rischio — quindi il **controllo out-of-scope del Gate 4 non scatta**. E un chiarimento sul teardown: il ramo senza codice **non smonta nulla**, perché dei due punti in cui quel preambolo licenzia un `down` nessuno è raggiungibile qui — la domanda *letterale* del browser non viene posta, e lo step 1, che contiene l'altro (il ramo "rebuild"), è saltato; esegue `status` in sola lettura e, se trova uno stack acceso da un tentativo precedente, lo **dichiara** invece di rimuoverlo. Infine, un "no" alla domanda di classificazione non ferma il ciclo: significa "la classificazione è sbagliata", quindi si degrada al ramo ordinario (step 1-5 più la domanda del browser).

- **Il caso simmetrico: un ciclo `ordinary` che il browser non può mostrare.** Un ciclo di sola documentazione che aggiunge *un test di guardia* contiene un `.js`, quindi il classificatore dice `ordinary` e il Gate 2 pone la domanda sul browser su un diff in cui nessun file viene servito da nginx (un `*.test.js` non raggiunge mai una pagina). Non è un difetto del classificatore e **non va "risolto" allargandone la regola**: renderebbe il classificatore un giudice del contenuto, che è esattamente ciò che §6.4c vieta. Si tratta invece come quello che è — una **deroga §3**, decisa esplicitamente in conversazione e annotata nel report, senza stack e senza verifica browser. Se dovesse diventare frequente, la risposta è una domanda del Gate 2 formulata diversamente, non una modifica della classificazione.

### 6.4d Pre-check meccanico delle affermazioni, prima della revisione

Il Gate 1 di `/finish-cycle` apre con un passo 0 che rilegge le righe `*.md` aggiunte o modificate dal branch e ne verifica le affermazioni **meccanicamente**, prima che il Gate 2 lanci `/code-review`: grep di ogni predicato toccato, rimisura di ogni numero **ad HEAD** e non al commit che l'ha scritto, `git log` di ogni SHA e di ogni affermazione di ordine fra cicli, enumerazioni ricontrollate come classe. Le correzioni si applicano e si committano senza chiedere. La lista esatta sta nel comando, non qui.

- **Cosa non raggiunge.** Tutto ciò che è giudizio: se una regola è giusta, se una motivazione regge. Quello resta il mestiere del Gate 3.
- **Si riesegue a ogni giro di correzioni del Gate 3, non solo al Gate 1.**
- **I 10 minuti sono un tetto, non una stima.** Il controllo 1 non ha un limite superiore nella dimensione del diff, e il Gate 1 non si ferma per un umano: al decimo minuto il passo si interrompe, dichiara cosa è rimasto non controllato, e prosegue. Il resto è lavoro del Gate 3, dove sarebbe stato comunque.
- **È un esperimento, e si decide su numeri registrati, non su una formula.** Il report porta una riga in prosa: quanto è costato al Gate 1 e alle riesecuzioni del Gate 3, cosa ha intercettato in ciascuno dei due, e quanti dei finding del round 1 erano meccanici. **Dopo tre cicli si guardano e si decide**, e in assenza di evidenza che il passo previene difetti **si rimuove, non si raffina**: un pre-check che non previene finding è un secondo revisore più lento. Niente criterio aritmetico: delle due soglie proposte, una non era misurabile e l'altra era soddisfatta proprio dal caso in cui il passo non serve.

### 6.5 Brief e processo fuori dal ciclo
- Il Brief (e l'eventuale handoff di design) è pronto e committato **prima** di aprire il ciclo. Se arriva un brief nuovo che sostituisce quello in discussione, si riparte da `/brainstorming`, senza riconciliare i ragionamenti precedenti.
- Una modifica al processo emersa a metà ciclo si annota (in memoria o nel report) e si applica dopo `/finish-cycle`, con un commit `docs:` dedicato: non si discute durante l'esecuzione.

### 6.6 Cicli con tavole di design

#### 6.6.1 In `/brainstorming` si leggono TUTTE le tavole, non un campione
- Prima di scrivere la spec: `ls` della cartella design, poi una `Read` per **ogni** file immagine. Niente lettura a campione, e niente "le ho viste, corrispondono al brief" come conclusione.
- Output obbligatorio: una **mappa tavola → sezione di spec** che la implementa. Ogni tavola senza sezione corrispondente diventa una domanda esplicita all'utente ("la 5.11 mostra un datepicker custom: dentro o fuori scope?"), non un'omissione silenziosa.
- Un controllo nativo lasciato come fallback (`<select>`, `<input type="month">`) è una **decisione di fedeltà visiva**, non una scorciatoia di implementazione: va dichiarata per *ogni* campo a cui si applica e confermata dall'utente.

#### 6.6.2 Ogni task del Piano porta le sue tavole
- Ogni Task del Piano ha una riga `Boards:` con i path delle tavole che quel task deve riprodurre.
- Il prompt di dispatch (o, in nativa, il passo di implementazione) include quei path con l'istruzione di **aprirli e confrontare il proprio markup con l'immagine** prima di chiudere il task.
- Lo stesso vale per la revisione: un revisore senza l'immagine di riferimento può solo verificare la spec, non la fedeltà.

#### 6.6.3 Un passo di verifica va assegnato a chi può eseguirlo
- Un passo di verifica va assegnato all'esecutore che può compierlo (screenshot via `scripts/shoot.mjs`, oppure esplicitamente il Gate 2 dell'utente) — mai a un esecutore che non ha lo strumento.
- Non si eredita la verifica di qualcun altro.

#### 6.6.4 Strumento: `scripts/shoot.mjs`
```bash
node scripts/shoot.mjs --url /costgrid.html?cgId=UUID --out shots/costgrid \
  --widths 1440,1024,768 --email <admin> --password <pwd>
```
Opzioni, `--eval`, credenziali (`SHOOT_EMAIL`/`SHOOT_PASSWORD` in `.env`, mai `. ./.env`): `docs/scripts/shoot.md`. **I PNG vanno poi riletti con `Read` e confrontati davvero con le tavole** — generarli e non guardarli non è una verifica.

#### 6.6.5 Economia dei giri di cattura

Le pratiche sotto valgono per qualunque ciclo con verifica visiva automatica.

- **Prima lo stack giusto, poi tutto il resto.** `shoot.mjs` contro `http://localhost` rende il **checkout principale, non il worktree**: `docker-compose.yml:100` monta `./` della directory da cui lo stack è stato avviato. Da un worktree si lancia `scripts/test-branch.sh up` e si passa `--base http://localhost:8081` (la porta di `test-branch.sh`). Senza questo si confronta con le tavole la pagina *prima* delle modifiche.
- **`--settle 3000`, non il default.** Con il settle di default la pagina rende a metà caricamento: aspetto completo ma dati di un'altra fonte (client, stage e totali sbagliati). Meglio ancora: dentro lo snippet attendere un selettore (`waitFor('.cg-head-row th')`) invece di dormire un tempo fisso.
- **Raggruppare in un solo scatto gli stati che non si sovrappongono a schermo.** I popover si chiudono su `mousedown`, quindi un `element.click()` eseguito da `--eval` **non** chiude quello già aperto: più popover restano aperti insieme.
- **Da soli, invece, gli stati che *sono* il punto di un Review Focus.**
- **`--full` solo sullo stato di riferimento popolato;** per gli stati interattivi basta il viewport (meno PNG, confronto più leggibile). Per isolare una barra fissa in fondo alla pagina, `--height 420` invece di cercarla in uno screenshot a pagina intera.
- **Misurare, non stimare.** Per le domande di layout ("quanto è larga *davvero* questa colonna?") uno snippet che sostituisce il body con le misure (`document.body.innerHTML = '<pre>…'`) costa una run e dà numeri esatti invece di pixel contati a occhio su un PNG. Lo stesso snippet, iniettando un `<style>` con override `!important` e rimisurando dopo ogni override, permette di **sondare** quale cella impone un vincolo.
- **Il risultato si presenta come elenco di scostamenti, uno per uno, con una proposta fix-ora / accetta-e-registra, e si aspetta la decisione.** Non si corregge tutto d'ufficio: una buona metà sono scelte, non difetti. Gli "accetta" vanno scritti in `docs/pages/<pagina>.md` **con il motivo**, altrimenti riemergono come bug al ciclo dopo.
- **Un obiettivo numerico della spec si chiude con un numero misurato, non con "fatto".** Se non è raggiunto, si registra come parzialmente raggiunto, con la causa residua.

---

## 6b. Economia delle approvazioni

### Le quattro nature di una fermata

Una fermata nuova si classifica qui dentro, non si inventa.

- **A — cancello che serve perché le due uscite non sono equivalenti e il "no" è quella sicura.** Servono entrambe le condizioni. Il merge e il push le soddisfano: non farli lascia il mondo in uno stato coerente, farli può non lasciarlo. **Il criterio non è l'irreversibilità** — l'applicazione delle migrazioni del Gate 4 è irreversibile e gira comunque senza chiedere, perché il suo "no" lascerebbe schema e codice disallineati, cioè l'uscita *insicura*.
- **B — cancello informativo:** l'umano sa qualcosa che il processo non può derivare — la classificazione dello scenario, lo scope escluso, i chiarimenti, la verifica browser del Gate 2, la domanda "è user-visible?" di `/sync-docs`. La risposta è un **input**, non un assenso: toglierla non fa risparmiare, fa indovinare.
- **C — cancello di ratifica:** all'umano si chiede di benedire un artefatto che deve prima leggere. È la natura che la regola sotto trasforma.
- **D — cancello di disposizione:** cosa farne dei finding. Ogni finding è una decisione reale, ma la *domanda* non va ripetuta identica a ogni round (Gate 3, vedi `.claude/commands/finish-cycle.md`).

### La regola della ratifica

**Un gate di classe C non chiede «approvi?».** Presenta le decisioni che potevano andare diversamente e chiede se qualcuna va cambiata. **Con N=0 lo dichiara e procede senza attendere.**

**Cos'è «una decisione che poteva andare diversamente».** È una scelta che **non** è imposta dal Brief, da un artefatto a monte o da una regola scritta del progetto, **e** che un lettore informato potrebbe ragionevolmente volere diversa. Non lo sono: le conseguenze meccaniche di una decisione già nel ledger; le convenzioni del progetto; ciò che è già stato confermato in una fermata di classe B.

**Il confine dei guard.** Un guard può pretendere che l'artefatto **porti** l'informazione; non può mai giudicare se l'informazione è **corretta**.

### Dove si applica

- **`/brainstorming`: una fermata, non N+2.** Il design si presenta **una volta sola, intero**, chiuso dal ledger; la scelta fra i 2-3 approcci è la prima voce del ledger, non una fermata propria. Niente approvazioni sezione per sezione.
- **Un contenuto si ratifica una volta sola; trascriverlo in un file non è contenuto nuovo.** Dopo quell'unica fermata la spec si scrive, si committa, se ne dichiara il path e si prosegue: **non viene ri-ratificata**. Unica eccezione, meccanica e non discrezionale: **se scrivendo la spec nasce una decisione che non era nel ledger di chat, quella è N>0** e il gate si riapre su quelle sole voci.
- **`/writing-plans` + §6.1: una fermata, non due.** Il passaggio di consegne del Piano porta in un solo messaggio il path, le N decisioni aperte, la **modalità con citata la regola di §6.1 che la giustifica**, il modello e la **classe di rischio con la categoria di §6.1b che la giustifica**. La dichiarazione di §6.1 vive lì dentro, non in un turno a sé.
- **Gate 3 e Gate 4** di `/finish-cycle`: la regola di disposizione e le tre automazioni stanno nel comando, non qui.

### Il ledger

Sezione finale obbligatoria di **ogni Spec e ogni Piano datato dal 2026-10-12** (i documenti precedenti non ne hanno e non vanno modificati), intitolata esattamente `## Decisioni aperte`:

```markdown
## Decisioni aperte

1. **<la scelta fatta>.** Alternativa scartata: <cosa non si è fatto>. Perché: <una frase>.
```

L'unico corpo alternativo, quando non ce ne sono, è la sentinella `Nessuna.` — esito legittimo.

`scripts/decision-ledger-guard.test.js` lo pinna, con il suo taglio a data e la sua lista di esenzioni **chiusa**. Quello che il guard non vede, e non può vedere, è se il ledger è **completo**. Il limite è dichiarato nell'intestazione del guard; i soli presìdi sono che il ledger è committato e che il Piano rilegge la Spec.

**Criteri di accettazione (dal 2026-10-24).** Ogni Spec porta una sezione intitolata esattamente `## Criteri di accettazione`; un Piano la porta quando la sua riga `**Spec:**` non si apre con il path, tra backtick, di una Spec esistente. Almeno una voce, senza sentinella:

```markdown
## Criteri di accettazione

1. **<etichetta breve>** — <esito verificabile>
```

La pretende `scripts/decision-ledger-guard.test.js`; la legge il Gate 2 di `/finish-cycle`, che ne fa una lista a spunta (le etichette sono le opzioni).

**Header della Spec (dal 2026-10-14).** Ogni Spec porta nell'header la riga `**Brief started:** YYYY-MM-DD HH:MM`, oppure `**Brief started:** unknown`: l'ora di inizio di `/feature-brief`, o di `/brainstorming` quando il ciclo non ha Brief. La legge `scripts/cycle-times.mjs`; la pretende `scripts/decision-ledger-guard.test.js`.

---

## 7. Criterio di aggiornamento di questo documento

La regola — il gate a tre condizioni che decide se un ciclo chiuso è materiale per questo file, e l'obbligo di dichiararne l'esito nel report — sta in **un solo posto: la sezione intitolata `docs/superpowers/PROCESS.md` di `.claude/skills/sync-docs/SKILL.md`** (individuarla per quel soggetto nell'heading, non per il numero che lo precede).

Qui resta solo ciò che riguarda chi **scrive** in questo file fuori da `/sync-docs`: la prima delle tre condizioni rimanda all'elenco delle skill di processo di §5, quindi è §5 — e non la skill — il posto in cui una skill nuova va aggiunta.
