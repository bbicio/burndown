# Processo di sviluppo — burndown (PDash)

> Documenta il workflow spec-driven come applicato finora. Le tre skill di processo del ciclo spec-driven (§5) sono tutte costruite: `feature-brief`, `domain-audit`, `audit-to-brief`. Una quarta skill, `operational-manual`, produce documentazione utente su richiesta — non fa parte della catena Brief→Spec→Piano, ma va mantenuta sincronizzata con `PRD.md` (vedi §5).
>
> Aggiornato via `/sync-docs`, ma solo quando un ciclo introduce un cambiamento reale al processo — non ad ogni esecuzione. Vedi criterio di aggiornamento in fondo al documento.

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
| **Spec (committata)** | Documento di design: problema, comportamento atteso, vincoli, criteri di accettazione, scope escluso. Committata prima di procedere. |
| **`/writing-plans`** | Trasforma la Spec in un piano di esecuzione a step, ciascuno verificabile. |
| **Piano (committato)** | Sequenza di task eseguibili, committato prima dell'esecuzione. |
| **Esecuzione** | Subagent-driven o nativa, scelta in base alla dimensione del ciclo (vedi §6), segue il piano passo per passo. Guardie specifiche per scenario (vedi §2). Il completamento dell'esecuzione (anche quando guidato da `superpowers:subagent-driven-development`, la cui skill generica termina normalmente con `superpowers:finishing-a-development-branch`) sfocia **sempre** in `/finish-cycle`, mai nella skill generica — vedi nota sotto. |
| **`/finish-cycle`** | Terminale di ogni esecuzione in questo progetto — sostituisce `superpowers:finishing-a-development-branch`, non la segue. Gate condizionali: `npm test` → suite Docker backend (se il diff tocca `api/`) → verifica manuale (ambiente Docker isolato per il branch rilevato automaticamente via scripts/test-branch.sh status — riuso o rebuild se già attivo; ricerca spec/piano, sempre conferma, mai euristica; **ramo per i cicli senza codice / no-code cycle**: il gate esegue `node scripts/classify-cycle.mjs` e, **solo** se la prima riga del suo stdout è `no-code`, mostra il diff e chiede di confermare la classificazione **invece di offrire lo stack Docker, cercare spec/piano e chiedere la verifica browser** — e il Gate 3 non si salta), **con `/code-review` lanciato in background all'apertura del gate** → gate code review, che raccoglie quella run come proprio round 1 (max 3 round; i finding si trattano qui, mai durante la verifica; saltato alle condizioni dello step 0 del gate, da leggere lì e non a memoria, vedi §6) → merge `--no-ff` con riepilogo pre-merge esplicito e pulizia worktree → `/sync-docs` + report persistito in `docs/superpowers/reports/` con conferma esplicita di push → report finale in chat. `/sync-docs` aggiorna anche la **memoria di progetto** (vedi nota sotto), senza conferma ma sempre riportata nel report. Ogni gate di giudizio si ferma sempre; solo test/preflight sono automatici. |

**Nota — perché non `finishing-a-development-branch`:** quella skill (di plugin, generica) non conosce i gate specifici di questo progetto (test, `/code-review`, `/sync-docs`, report persistito). Usarla al posto di `/finish-cycle` significa mergiare/pushare senza quei controlli. La regola è applicata anche in `CLAUDE.md` (che ha precedenza sulle skill), non solo qui.

**Nota — memoria di progetto (2026-09-29):** la memoria di Claude (`~/.claude/projects/<progetto>/memory/`, indice `MEMORY.md`) sta fuori dal repo: non compare in nessun diff, non viene committata, e prima di questa regola nessun passo del processo la toccava. I file di tipo `project` (stato dei cicli, backlog, prerequisiti di deploy, limiti noti) invecchiano quindi a ogni ciclo chiuso. Origine: il 2026-09-29 il file di backlog dava ancora "Team UX polish" come prossimo ciclo, quando quel ciclo e altri due erano già mergiati.
- **Regola:** `/sync-docs` (sezione 8) valuta la memoria a **ogni** esecuzione, cioè a ogni chiusura ciclo via `/finish-cycle` Gate 5. Trova i file `project` che citano il ciclo o un backlog toccato, e li aggiorna: stato (mergiato, data, hash, report), priorità e "prossimo ciclo" (comprese le decisioni prese durante il ciclo), prerequisiti e limiti chiusi; elimina le memorie superate e riallinea `MEMORY.md`.
- **Automatico, non silenzioso:** nessuna conferma (è stato di lavoro, non un artefatto rilasciato, e ogni modifica poggia su fatti già verificati dal merge), ma ogni modifica va riportata come *prima → dopo* nel riepilogo di `/sync-docs` e nella sezione "Memory outcome" del report del ciclo — l'unica traccia persistente, visto che non c'è diff.
- **Mai inventare:** un fatto che il merge non stabilisce resta com'è ed è elencato come "unverified"; la memoria non duplica ciò che il repo già registra (il report del ciclo è quel registro).
- Le memorie `user`/`feedback`/`reference` non fanno parte di questo giro, salvo contraddizione diretta da parte del ciclo.

**Nota — handoff di design come input del Brief (2026-10-02):** i cicli di redesign UI (fondamenta, navigazione, una pagina per volta) partono da un documento di handoff prodotto in Claude Design e salvato in `docs/superpowers/design/<data>-<ciclo>-handoff.md`, committato prima di aprire il worktree. L'handoff è un **input** della fase Brief (`feature-brief` lo legge e lo traduce nel Brief), non un sostituto di Brief/Spec: le sue affermazioni sul codice vanno **verificate contro il codice** in `/brainstorming` (nel primo ciclo erano sbagliati i contrasti calcolati, un token dato per inutilizzato e una dipendenza di layout obsoleta). Un ciclo per volta, nell'ordine fondamenta → navigazione → pagine, ciascuno in un worktree creato dopo il merge del precedente.

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

**Cadenza raccomandata — audit di riconciliazione documentazione-vs-codice (2026-09):** oltre all'uso ad-hoc dello Scenario 3 su un'area specifica, un audit `domain-audit` con `PRD.md` come ground truth (scope: "tutte le pagine utente-facing vs PRD.md", stesso perimetro del ciclo 2026-09-16) va considerato:
- **Obbligatorio** prima di ogni rigenerazione di `docs/OPERATIONAL_MANUAL.html` (skill `operational-manual`) — non generare il manuale su un `PRD.md` la cui accuratezza non è stata riverificata di recente.
- **Raccomandato come pratica standing**, a prescindere dalla generazione del manuale, con una cadenza indicativa di circa ogni 10 cicli `/finish-cycle` chiusi o ogni ~2 mesi, quale che venga prima — a scopo di prevenire l'accumulo silenzioso di scostamenti tra `PRD.md` e il comportamento reale dell'app, la stessa dinamica che ha prodotto i 14 finding del `2026-09-16-prd-vs-app-behavior-audit.md`.

**Cadenza raccomandata — audit ARCHITECTURE.md/CLAUDE.md vs codice (2026-09):** lo stesso schema, esteso ai due documenti di architettura/riferimento operativo, dopo che il ciclo `2026-09-17-architecture-claude-vs-app-behavior-audit.md` ha trovato 22 finding con lo stesso pattern di fondo — `CLAUDE.md` aggiornato quasi ad ogni ciclo (via `/sync-docs`), `ARCHITECTURE.md` no, accumulando scostamenti silenziosi (schema DB, migrazioni, endpoint, script infra). Un audit `domain-audit` con questi due file come ground truth (scope: "l'intero codebase vs ARCHITECTURE.md/CLAUDE.md, entrambe le direzioni") va considerato:
- **Raccomandato come pratica standing**, con la stessa cadenza indicativa di `PRD.md` — circa ogni 10 cicli `/finish-cycle` chiusi o ogni ~2 mesi, quale che venga prima. Non è legato alla generazione di alcun deliverable (a differenza del vincolo "obbligatorio" su `PRD.md` per `operational-manual`), quindi resta puramente su base di cadenza temporale/numero cicli.
- Non è necessario farlo sempre nella stessa sessione dell'audit `PRD.md` — sono due audit indipendenti con ground truth diversi — ma può essere comodo eseguirli in sequenza quando si apre una finestra di manutenzione documentale.

Nessuna delle due voci è una nuova skill né una modifica allo Scenario 3 — sono promemoria di cadenza per l'uso ricorrente di una skill già esistente.

---

## 3. Eccezioni concordate (esempi, non regola generale)

Le deroghe al processo standard sono permesse ma vanno sempre:
1. Decise esplicitamente in conversazione, non applicate di default.
2. Annotate nel report del ciclo interessato ("perché" e "cosa è stato saltato").
3. Mai generalizzate automaticamente al ciclo successivo — ogni deroga si conferma di nuovo, non si eredita.

**Esempio reale** (audit Resource Planning, luglio 2026): 3 cicli di fix mergiati separatamente, ma `/code-review` (gate 3 di `/finish-cycle`) eseguito per intero solo sul terzo ciclo, saltato esplicitamente sui primi due per contenere l'uso di token — con nota esplicita nel report di ciascun ciclo saltato.

---

## 4. Guardia infrastrutturale — comandi Docker sul main stack

Regola permanente (non un'eccezione una tantum), applicabile alla fase Esecuzione di **tutti e tre** gli scenari, ogni volta che un task/piano prevede di eseguire comandi `docker compose` contro lo stack principale (`pdash-db`/`pdash-api`/`pdash-nginx`/`pdash-adminer`, progetto `burndown`) invece che contro uno stack isolato (`scripts/test-branch.sh`, `scripts/run-tests.sh`).

**Origine:** 2026-08-05, ciclo `worktree-docker-test-profile-container-names` — un subagente implementatore, incaricato di verificare `scripts/run-tests.sh` (isolamento del profilo test Docker), ha azzerato il volume dati reale del main stack (`burndown_pgdata`), quasi certamente eseguendo `docker compose down -v` contro il progetto principale invece che contro quello isolato (`pdash_test`) — probabilmente per abitudine, replicando la logica di cleanup dello script isolato stesso. Il recupero è riuscito solo grazie a un dump `pg_dump` lasciato per caso da un ciclo precedente scollegato, non per un meccanismo di sicurezza previsto. Dettagli completi: `docs/superpowers/reports/2026-08-05-worktree-docker-test-profile-container-names-finish-cycle.md`.

**Regole (vincolanti, ripetute anche in `CLAUDE.md` §Infrastructure safety che ha precedenza sulle skill):**
1. Nessun `-v`/`--volumes` contro il main stack in nessuna circostanza; ogni dispatch che istruisce un agente a eseguire `docker compose down/up/restart` sul progetto principale deve vietarlo esplicitamente e imporre di fermarsi ed escalare (mai improvvisare un comando più aggressivo) se qualcosa non si comporta come atteso.
2. Snapshot (`pg_dump`) esplicito prima di qualunque operazione Docker-lifecycle delegata sul main stack — mai fare affidamento su un dump incidentale lasciato da un ciclo scollegato.
3. `docker compose down/up/restart` sul main stack, anche senza `-v`, richiede conferma esplicita dell'utente come qualunque azione ad alto rischio — non va trattato come "sicuro perché reversibile in teoria". Preferire, quando il piano lo consente, la verifica contro uno stack isolato invece di toccare il main stack.

---

## 5. Skill di processo

Tutte e tre costruite. Non una per scenario ma una per tipo di gap — ciascuna in `.claude/skills/<nome>/SKILL.md`:

- **`feature-brief`**: converte una richiesta grezza in un Brief strutturato per gli scenari 1 e 2. Primo passo sempre una domanda esplicita di classificazione dello scenario, mai inferita.
- **`domain-audit`**: conduce l'audit di dominio per lo scenario 3 — scope negoziato prima di leggere codice, evidenza file:linea per ogni claim, root-cause analysis, mai fix durante l'audit, finding fuori scope isolati in sezione dedicata. Non sovrappone la skill di sicurezza (`security-review`); tassonomia dei finding libera, decisa per singolo audit. Vedi anche la cadenza raccomandata in §2 per il suo uso come audit di riconciliazione `PRD.md`-vs-codice.
- **`audit-to-brief`**: prende un report d'audit già chiuso (generato da `domain-audit`) e costruisce il/i Brief di fix per lo scenario 3 — raggruppamento dei finding in cicli proposto e confermato con l'utente, mai deciso unilateralmente; finding di natura diversa (es. design vs. correttezza) segnalati e trattati con un Brief in forma Scenario 2. Costruita e testata sui due casi reali disponibili (audit Resource Planning, audit `js/ai.js`) dopo che il secondo caso si è accumulato — come previsto, per evitare di generalizzare da un solo audit.
- **`operational-manual`** (2026-09-16, aggiunta): non fa parte della catena Brief→Spec→Piano — produce `docs/OPERATIONAL_MANUAL.html`, il manuale operativo utente-facing, **solo su richiesta esplicita**, mai automaticamente. Ha però un obbligo di sincronizzazione permanente con `PRD.md`: la skill contiene, inlineata al proprio interno (sezione "PDash detail-content reference", non solo referenziata da uno spec esterno — scelta deliberata per sopravvivere anche se lo spec viene archiviato/perso), l'elenco dettagliato di cosa documentare per ciascuna area del prodotto, mantenuto verificato contro `PRD.md`. **`/sync-docs` (§6b del proprio file) aggiorna questa sezione ogni volta che `PRD.md` viene toccato nello stesso ciclo** — così le due fonti non divergono di nuovo silenziosamente come accaduto prima del 2026-09-16. La generazione vera e propria dell'HTML resta un trigger separato e resta a richiesta.

---

## 6. Esecuzione proporzionata al ciclo (2026-10-06)

**Origine:** il ciclo pre-login restyling (7 file, solo CSS/markup) è durato 3h28m. Il tempo è andato in: 38 esecuzioni dei test in un container `node:22` che rifaceva `npm ci` ogni volta (44 min); verifica visiva con 3 giri di screenshot più un subagent dedicato a una correzione CSS di una riga (39 min); revisioni ripetute sullo stesso diff (4 per task, finale Opus, ri-revisione, poi di nuovo il Gate 3 di `/finish-cycle`); una discussione di processo a metà ciclo (17 min). Le regole sotto valgono per tutti e tre gli scenari.

**1. Modalità e modello, scelti al passaggio Piano → Esecuzione.**
- **La modalità va dichiarata, non dedotta da una parola dell'utente.** Al passaggio Piano → Esecuzione Claude dichiara in chat la modalità che applicherebbe *e la regola di questo paragrafo che la giustifica* (es. "4 file di produzione, nessuna migrazione, nessuna nuova API, i 4 task toccano gli stessi 2 file → **nativa** per §6.1; confermi?"), e attende la conferma. Una richiesta secca dell'utente ("subagent-driven") resta vincolante, ma va prima messa a confronto con la regola: nel ciclo Cost Grid A (2026-10-07) la richiesta è stata eseguita un secondo dopo senza verifica e i 4 implementatori sono poi girati **in serie, con zero sovrapposizione** — pagando per quattro volte il costo fisso del dispatch senza ottenere l'unico vantaggio della modalità, il parallelismo.
- **Il Piano deve dire se i task sono indipendenti.** Subagent-driven presuppone task indipendenti: se il Piano non lo afferma esplicitamente (il Piano del ciclo Cost Grid A non lo diceva da nessuna parte), la precondizione non è soddisfatta e si va in nativa.
- **Ciclo piccolo** (indicativamente ≤ 5 file, nessuna migrazione, nessuna nuova API, task fortemente sequenziali): esecuzione **nativa** (`superpowers:executing-plans`), oppure pochi task più grandi. Il costo fisso di ogni task subagent-driven (dispatch, pacchetto di revisione, revisore: 5–10 min) non si ripaga su modifiche di poche righe.
- **Ciclo grande o con task indipendenti:** subagent-driven.
- **Modello:** in subagent-driven gli implementatori girano su **Sonnet** (`model: sonnet`), mentre il coordinatore e la revisione finale dell'intero branch restano su Opus. In nativa l'utente cambia a mano il modello della sessione (`/model sonnet`) prima di implementare, e torna su Opus per la revisione finale e `/finish-cycle`. Brainstorming, spec, debugging e code review restano su Opus.

**2. Test.**
- Node dell'host ≥ 20.12 (dal 2026-10-06 il PC ha Node 24): `npm test` gira nativo, circa 48 s per la suite completa e circa 10 s per un singolo file. Il comando Docker `node:22` di `CLAUDE.md` resta solo come fallback per un host con Node vecchio.
- Un worktree nuovo non ha `node_modules`: subito dopo averlo creato, eseguire `npm ci` una volta (insieme alla copia di `.env`).
- **Durante i task si lanciano solo i file di test toccati o aggiunti** (`npx vitest run <file>`; backend: `docker exec pdash-api node --test src/<file>`). La suite completa gira **una volta** a fine esecuzione, nel coordinatore, e poi al Gate 1. Mai due suite complete in parallelo.

**3. Una sola verifica visiva per ciclo.**
- Di default la verifica visiva è quella dell'utente al Gate 2 di `/finish-cycle`; il Piano non include un task di screenshot automatici.
- Gli screenshot automatici si fanno solo se decisi esplicitamente in `/brainstorming` (es. confronto con le tavole di un handoff di design a più larghezze) e scritti nel Piano, con gli stati e le larghezze da coprire. **Lo strumento esiste già e non va reinventato: `scripts/shoot.mjs`** (vedi §6.6) — niente script usa-e-getta né server simulato, tranne per le pagine pubbliche se si vuole evitare il login.
- **Non è vero che "in questo ambiente non si può rendere la pagina".** Claude in Chrome è bloccato per `localhost` da policy aziendale, ma **Chrome headless funziona** contro lo stack reale (verificato 2026-10-07 su `http://localhost/login.html`). L'affermazione contraria, scritta nel messaggio di commit `e0ae807` e nella memoria di progetto al merge del ciclo Cost Grid A, è stata corretta: non va più usata come motivazione per non verificare.
- Un difetto visivo piccolo trovato in verifica (poche righe di CSS/markup) si corregge direttamente nella sessione principale, con il test mirato: niente subagent dedicato.

**4. Niente revisioni doppie sullo stesso diff.** Se la revisione finale dell'intero branch (es. quella di subagent-driven) copre `main...HEAD` all'HEAD corrente, il Gate 3 di `/finish-cycle` non rilancia `/code-review`: lo dichiara e lo annota nel report. Valgono anche i commit successivi che contengono solo le correzioni di quella revisione, purché già ri-revisionati. In esecuzione nativa non c'è revisione per task: resta la sola revisione finale (o il Gate 3).

**4b. Il Gate 3 parte in parallelo al Gate 2 (2026-10-08).** `/code-review` si lancia **in background** quando si *apre* il Gate 2, non dopo il "yes" dell'utente: è di sola lettura, quindi gira mentre l'utente verifica nel browser e il suo tempo esce dal percorso critico. Il Gate 3 la raccoglie come proprio round 1 e resta il punto in cui i finding si mostrano e si trattano.
- **Tre vincoli.** I finding **non si mostrano e non si correggono** prima della risposta del Gate 2 — un commit applicato mentre l'utente verifica gli farebbe verificare un albero che non esiste più; il "no" del Gate 2 ferma il ciclo esattamente come prima; una run morta, scaduta o senza risultato leggibile vale **non revisionata**, mai "pulita", e il Gate 3 la rilancia.
- **Un commit nato durante il Gate 2 va comunque revisionato.** La revisione lanciata all'apertura copre l'HEAD di quel momento: se durante la verifica atterra una correzione, il Gate 3 aggiunge la revisione scoped di quei soli commit prima di mostrare i finding. È il buco che la prima versione minima aveva lasciato aperto e che la revisione ha intercettato: senza quel passo la correzione arrivava al merge non revisionata.
- **Per i fix nati dal Gate 2 la norma è la revisione scoped `<reviewed-sha>..HEAD`** — il punto 0b del Gate 3, che **esisteva già e già citava le correzioni del Gate 2**: il resto del diff è coperto dalla revisione lanciata all'apertura del gate, e rivederlo sarebbe la doppia revisione che il punto 4 vieta.
- **Il guadagno atteso (10-20 min/ciclo) non è ancora misurato.** I campi durata del report esistono dal 2026-10-08 e partono vuoti: diventa verificabile solo dopo 2-3 cicli con durate registrate. E il confronto di Gate 2/Gate 3 con i cicli chiusi prima di quella data non è lecito, perché la revisione ora è contabilizzata in buona parte dentro il Gate 2.
- **Niente macchina a stati — lezione del ciclo stesso.** Il primo tentativo riscriveva i rami del Gate 3 intorno a cinque variabili di stato (`<reviewed-sha>`, `<in-flight-sha>`, finding parcheggiati, storico, follow-up): **quattro round di `/code-review`, 33 finding, nessuna convergenza** — la correzione di ogni round introduceva il difetto del successivo nello stesso punto, perché l'asincronia era stata infilata in un comando scritto come checklist sincrona, e metà del brief (la revisione scoped) era **già implementata** nel 0b preesistente. La versione tenuta è di poche righe — lancio in background, raccolta come prima azione del Gate 3, una frase su 0b — e lascia intatto il resto del gate. Un ampliamento di questo meccanismo passa da una spec, non da un diff.

**4c. Il Gate 2 ha un ramo per i cicli senza codice — no-code cycle (2026-10-09).** Prima di ogni altra cosa il Gate 2 classifica il ciclo in modo **meccanico**, eseguendo `node scripts/classify-cycle.mjs`: concede il ramo **solo** sul token letterale `no-code` come prima riga di stdout, e qualunque altro esito — `ordinary`, un errore, lo script assente, output vuoto — è un ciclo ordinario, così che un classificatore rotto non possa saltare una verifica. Su un ciclo senza codice il gate mostra il diff e chiede di **confermare la classificazione**, invece di offrire lo stack Docker, eseguire l'archeologia git di spec/piano e chiedere "Have you manually verified this in the browser?".
- **Perché esiste: integrità del gate, non risparmio di tempo.** Su un diff che non contiene nessun file caricato o eseguito dall'app quella domanda non ha una risposta onesta — "yes" è falso, "no" ferma il ciclo. Il programma di ottimizzazione processi contiene 4 cicli senza codice su 6: quattro occasioni di rispondere "yes" per formalità allo stesso gate nato dai due incidenti del 2026-09-15. I 2-5 minuti di spin-up Docker risparmiati, da soli, non giustificherebbero la modifica.
- **La regola vive nel codice, non qui.** `scripts/classify-cycle.mjs` decide, `scripts/classify-cycle.test.js` la pinna: 18 casi, di cui 5 su repo git usa-e-getta che verificano **il comando** e non solo la regola. Chi deve sapere cosa qualifica legge il test, non una parafrasi — e un `/code-review` futuro su questo meccanismo guarda il test, non la prosa. Resta il principio: **il test è la lista dei path**, mai un giudizio su "di cosa parla il ciclo".
- **Perché i guard sono quelli.** Un `*.md` di root che l'app carica a runtime conta come codice, perché cambiarlo cambia ciò che una pagina rende: `docker-compose.yml` monta la root del repo in nginx e `location /` la serve. Sotto `docs/` qualificano solo i `.md` — 66 file tracciati lì non lo sono, e `docs/OPERATIONAL_MANUAL.html` è verificabile *solo* in un browser. Sotto `.claude/` idem, e per una ragione più scomoda: a proteggere la regola non è `.gitignore` (che ignora il solo `settings.local.json`) ma il fatto che `.claude/settings.json` — il file condiviso con hook e permessi — oggi non esista. La lista delle eccezioni nominate è la costante `RUNTIME_LOADED_ROOT_MD` dello script, **oggi vuota**: la aggiorna il ciclo stesso che introduce il `fetch` — caso pendente, `test-cases.html` da `TEST_CASES.md`.
- **Il nome è "ciclo senza codice", non "process-only":** `PRD.md` e `docs/prd/` sono documentazione di prodotto, che "process-only" classificherebbe male.
- **Cosa NON cambia.** Lo step 0 (lancio di `/code-review` in background, punto 4b) si applica in **entrambi** i rami — con le sue stesse condizioni di skip e di scoping, che il ramo senza codice non altera — e **il Gate 3 non si salta per il fatto di essere un ciclo senza codice**: un diff di sola prosa è esattamente dove la revisione rende — un ciclo di split documentale ha prodotto 10 dei suoi 16 finding su prosa. Restano invariati il preambolo della porta a senso unico sul teardown, la domanda del browser sul ramo ordinario, e `npm test` al Gate 1 in ogni ciclo.
- **Una cosa invece si perde, e va annotata nel report:** saltando gli step 2-5 non viene identificato alcun file di piano, quindi il **controllo out-of-scope del Gate 4 non scatta**. E un chiarimento sul teardown: il ramo senza codice **non smonta nulla**, perché il preambolo del Gate 2 licenzia il teardown solo dopo il "yes" dell'utente alla domanda *letterale* del browser, che qui non viene posta; esegue `status` in sola lettura e, se trova uno stack acceso da un tentativo precedente, lo **dichiara** invece di rimuoverlo. Infine, un "no" alla domanda di classificazione non ferma il ciclo: significa "la classificazione è sbagliata", quindi si degrada al ramo ordinario (step 1-5 più la domanda del browser).

**5. Brief e processo fuori dal ciclo.**
- Il Brief (e l'eventuale handoff di design) è pronto e committato **prima** di aprire il ciclo. Se arriva un brief nuovo che sostituisce quello in discussione, si riparte da `/brainstorming`, senza riconciliare i ragionamenti precedenti.
- Una modifica al processo emersa a metà ciclo si annota (in memoria o nel report) e si applica dopo `/finish-cycle`, con un commit `docs:` dedicato: non si discute durante l'esecuzione.

---

## 6.6 Cicli con tavole di design (2026-10-07)

**Origine:** il ciclo Cost Grid redesign A è durato 4h30 e al Gate 2 l'UI è risultata "lontanissima dalle tavole". La retrospettiva (report in `~/.superpowers/diagnosing-superpowers/bc81e68a-6f44-4f39-90b5-1647f09afdbb/report.md`) ha stabilito che **nessun implementatore e nessun revisore ha mai aperto una tavola** (verificato su tutte e 23 le trascrizioni dei subagent) e che `/brainstorming` ne ha lette **5 su 24**, dichiarando poi "they match the brief precisely". Dei tre scostamenti trovati al Gate 2, due non richiedevano alcun browser: uno era una riga di spec non implementata (`Stage box, side by side, 280px stage box`) che il revisore del task ha comunque approvato come "Spec compliance ✅", gli altri due erano casi in cui l'implementatore **aveva seguito la spec** e la spec aveva divergito dalle tavole. Il punto cieco era l'immagine di riferimento mancante, non il motore di rendering.

**1. In `/brainstorming` si leggono TUTTE le tavole, non un campione.**
- Prima di scrivere la spec: `ls` della cartella design, poi una `Read` per **ogni** file immagine. Niente lettura a campione, e niente "le ho viste, corrispondono al brief" come conclusione.
- Output obbligatorio: una **mappa tavola → sezione di spec** che la implementa. Ogni tavola senza sezione corrispondente diventa una domanda esplicita all'utente ("la 5.11 mostra un datepicker custom: dentro o fuori scope?"), non un'omissione silenziosa.
- Un controllo nativo lasciato come fallback (`<select>`, `<input type="month">`) è una **decisione di fedeltà visiva**, non una scorciatoia di implementazione: va dichiarata per *ogni* campo a cui si applica e confermata dall'utente. Nel ciclo A il brief la ammetteva solo per Reassign e il tema è emerso come sorpresa al Gate 2 per Stage/Client/Ratecard e le date.

**2. Ogni task del Piano porta le sue tavole.**
- Ogni Task del Piano ha una riga `Boards:` con i path delle tavole che quel task deve riprodurre.
- Il prompt di dispatch (o, in nativa, il passo di implementazione) include quei path con l'istruzione di **aprirli e confrontare il proprio markup con l'immagine** prima di chiudere il task. Costo: zero agenti in più, due righe di prompt.
- Lo stesso vale per la revisione: un revisore senza l'immagine di riferimento può solo verificare la spec, non la fedeltà. Nel ciclo A nessuno dei 14 prompt di dispatch nominava una tavola.

**3. Un passo di verifica va assegnato a chi può eseguirlo.**
- Il Piano del ciclo A assegnava passi "Manual smoke check (desktop + 1024px + tablet)" a subagent senza browser: non sono stati eseguiti e nessuno ha dichiarato di averli saltati. Un passo di verifica va assegnato all'esecutore che può compierlo (screenshot via `scripts/shoot.mjs`, oppure esplicitamente il Gate 2 dell'utente) — mai a un esecutore che non ha lo strumento.
- Non si eredita la verifica di qualcun altro: la revisione finale del ciclo A ha scritto "the per-task manual smoke checks covered it, so I didn't re-verify in a browser" mentre gli implementatori avevano tutti dichiarato di non averli eseguiti.

**4. Strumento: `scripts/shoot.mjs`.**
```bash
node scripts/shoot.mjs --url /costgrid.html?cgId=UUID --out shots/costgrid \
  --widths 1440,1024,768 --email <admin> --password <pwd>
```
Node puro, nessuna dipendenza (usa `fetch` e `WebSocket` globali, Node ≥ 22 — l'host ha Node 24): fa il login via `POST /api/auth/login`, inietta il cookie `pdash_token` via CDP, emula ogni larghezza richiesta e salva un PNG per larghezza. `--full` per la pagina intera, `--settle` per i ms di attesa dopo il load (Vue monta dopo `DOMContentLoaded`, quindi un'attesa serve sempre). **Le credenziali si mettono una volta sola in `.env` come `SHOOT_EMAIL`/`SHOOT_PASSWORD`** (già gitignorato): lo script legge il file da sé, quindi **non serve e non va fatto `. ./.env`** — quel file contiene valori non shell-safe e il source fallisce a metà lasciando le variabili vuote (succede, verificato). Valgono anche `--email`/`--password` o le env var già esportate. Senza credenziali rende solo le pagine pubbliche. Non sa cliccare direttamente, ma `--eval '<js>'` / `--eval-file <path>` (più `--eval-settle <ms>`, default 400) eseguono uno snippet nella pagina dopo l'attesa di settle e prima dello scatto, una volta per larghezza: gli stati che richiedono interazione (selection mode, card chiuse/aperte, popup, datepicker aperto, griglia scrollata) si catturano così, cliccando il trigger dallo snippet. Un'eccezione nella pagina fa fallire la run (`shoot.mjs failed: --eval failed: …`, exit 1, nessun PNG) invece di salvare uno screenshot ingannevole; per snippet lunghi usare `--eval-file`, il quoting della shell di Windows è fragile. La cattura manuale resta il fallback per gli stati che nessuno snippet può raggiungere. **I PNG vanno poi riletti con `Read` e confrontati davvero con le tavole** — generarli e non guardarli non è una verifica.

**5. Economia dei giri di cattura (2026-10-07, ciclo Cost Grid fidelity).**

*Origine:* il passo "render vs tavole" di quel ciclo partiva da ~9 run di cattura più i giri statici. Le pratiche sotto lo hanno portato a 7 run utili e hanno evitato due confronti falsati. Valgono per qualunque ciclo con verifica visiva automatica.

- **Prima lo stack giusto, poi tutto il resto.** `shoot.mjs` contro `http://localhost` rende il **checkout principale, non il worktree**: `docker-compose.yml:100` monta `./` della directory da cui lo stack è stato avviato. Da un worktree si lancia `scripts/test-branch.sh up` e si passa `--base http://localhost:8081` (la porta di `test-branch.sh`). Senza questo si confronta con le tavole la pagina *prima* delle modifiche — è successo, ai Task 3-4 del ciclo, e non se ne accorge nessuno perché il render è perfettamente plausibile.
- **`--settle 3000`, non il default.** Con il settle di default la pagina rende a metà caricamento: aspetto completo ma dati di un'altra fonte (client, stage e totali sbagliati). È un falso credibile, il modo più facile per perdere mezz'ora. Meglio ancora: dentro lo snippet attendere un selettore (`waitFor('.cg-head-row th')`) invece di dormire un tempo fisso.
- **Raggruppare in un solo scatto gli stati che non si sovrappongono a schermo.** I popover si chiudono su `mousedown`, quindi un `element.click()` eseguito da `--eval` **non** chiude quello già aperto: più popover restano aperti insieme. In pratica: month picker del PERIOD + lista Stage in uno scatto, Client + Ratecard in un altro.
- **Da soli, invece, gli stati che *sono* il punto di un Review Focus.** Il menu ⋮ del ruolo e il datepicker aperto dopo uno scroll orizzontale della griglia erano la prova del Review Focus "popover teleportato, non clippato": raggrupparli avrebbe vanificato la verifica.
- **`--full` solo sullo stato di riferimento popolato;** per gli stati interattivi basta il viewport (meno PNG, confronto più leggibile). Per isolare una barra fissa in fondo alla pagina, `--height 420` invece di cercarla in uno screenshot a pagina intera.
- **Misurare, non stimare.** Per le domande di layout ("quanto è larga *davvero* questa colonna?") uno snippet che sostituisce il body con le misure (`document.body.innerHTML = '<pre>…'`) costa una run e dà numeri esatti invece di pixel contati a occhio su un PNG. Lo stesso snippet, iniettando un `<style>` con override `!important` e rimisurando dopo ogni override, permette di **sondare** quale cella impone un vincolo: è così che in G-15 si è localizzato il blocco della colonna fissa a 323px — e poi si è stabilito che tre fix plausibili non lo spostavano.
- **Il risultato si presenta come elenco di scostamenti, uno per uno, con una proposta fix-ora / accetta-e-registra, e si aspetta la decisione.** Non si corregge tutto d'ufficio: una buona metà sono scelte, non difetti. Gli "accetta" vanno scritti in `docs/pages/<pagina>.md` **con il motivo**, altrimenti riemergono come bug al ciclo dopo.
- **Un obiettivo numerico della spec si chiude con un numero misurato, non con "fatto".** G-15 chiedeva "5-6 colonne ruolo visibili a 1440": misurate 2 prima, 3-4 dopo i fix. Registrato come parzialmente raggiunto, con la causa residua e il perché resta — non spuntato.

---

## 7. Criterio di aggiornamento di questo documento

`/sync-docs` aggiorna questo file **solo se** il ciclo appena chiuso soddisfa almeno una di queste condizioni:
- Ha introdotto o modificato una delle skill di processo (`feature-brief`, `domain-audit`, `audit-to-brief`).
- Ha introdotto un'eccezione al processo standard che si prevede **ricorrente** (non una tantum già documentata nel report del singolo ciclo).
- Ha modificato lo scheletro comune a 7 fasi o le guardie specifiche di uno scenario. (Rientra qui anche la modifica dei gate di `/finish-cycle` o degli output di `/sync-docs`, come l'aggiunta della memoria di progetto del 2026-09-29.)

Un ciclo che **esegue** il processo così com'è (la stragrande maggioranza dei casi) non è materiale per questo documento — resta nel report del singolo ciclo, non qui.
