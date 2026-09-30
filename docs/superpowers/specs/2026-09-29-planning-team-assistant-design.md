# Planning team assistant (Cycle 4) — design

Data: 2026-09-29. Stato: bozza per revisione (§6 aggiornata 2026-09-30 dopo il Ciclo A). Ciclo 4 dell'iniziativa resource-allocation (1 team/attribute lists, 2 tag linking, 3 profilo risorsa, **4 assistente di allocazione**). Precede: `docs/superpowers/specs/2026-09-25-resource-profile-design.md`, `2026-09-29-profile-descriptions-topics-design.md`.

## 1. Obiettivo

Un admin o sysadmin, da `planning.html`, sceglie un progetto già presente in Planning (con task, ruoli e ore previste; con o senza actuals) e, tramite una chat, individua le risorse più adatte da allocare. Ogni risposta mostra **tre tabelle**, con le stesse colonne, e il razionale per ogni risorsa:

1. **Team migliore**: per ciascun job title (`roles.code`) dei task, le risorse con quel ruolo e più esperienza su progetti/task simili, a prescindere dall'allocazione.
2. **Team alternativo**: risorse con un ruolo diverso ma con esperienza sugli stessi task.
3. **Team disponibile**: stesso pool, ma l'ordine è guidato anche dalla disponibilità di ore.

I criteri, in ordine: profilo storico (actuals + tag + topic), corrispondenza job title, disponibilità. L'utente affina le liste dialogando ("escludi Mario", "solo oncologia", "almeno 10 h libere").

## 2. Decisioni concordate

- Calcolo **nel backend, deterministico**; l'LLM traduce frasi in parametri e scrive una sintesi. Le tabelle vengono dal risultato del calcolo, mai dal testo dell'LLM.
- Razionale per riga: **template deterministico** costruito dal backend con le prove numeriche (opzione A).
- Accesso: **solo admin e sysadmin**, controllato lato server (`requireAuth, requireAdmin`).
- Chiave LLM: solo `ANTHROPIC_API_KEY` del server (`.env`). **Le chiavi personali nel browser vengono eliminate** (§4). Un adattatore per modelli locali (LM Studio) è un ciclo successivo; il design lo rende possibile (§9).
- Disponibilità: soglia di carico target **32 h/settimana** (costante configurabile nel codice). Ore libere di una settimana = `max(0, 32 − carico)`, dove il carico è actuals + pianificato futuro, letto dalla proiezione `owner` del servizio di Planning (§6).
- Pool candidato: solo **risorse registrate e attive** (`team.html`). I nomi degli actuals non abbinati non sono candidabili; contano solo nel calcolo del carico se abbinati.
- Layout UI: pannello largo con le tre tabelle **impilate** (§10).

## 3. Fuori scope (backlog)

Riepilogo AI in Portfolio sul burndown (server-side, ciclo futuro sullo stesso `llm.js`); adattatore LM Studio/OpenAI-compatibile; persistenza delle conversazioni; pesi configurabili da UI; matching fuzzy dei nomi; export delle tabelle; suggerimento automatico di candidati per i nomi non abbinati.

## 4. Pulizia (primo task del ciclo)

Il vecchio assistente chiamava l'LLM dal browser con chiavi personali in `localStorage`. Si elimina tutto ciò che vive solo per quello.

| Elemento | Azione |
|---|---|
| `js/ai.js` (intero: `aiPlanMessages`, `aiPlanSend`, `renderAiPlanMessages`, `buildPlanningContext`, `openAiAnalysis`, `buildProjectSummary`, `callAi`) | eliminare; togliere i `<script>` da `planning.html` e `portfolio.html` |
| `planning.html`: bridge nascosto (`#aiPlanInput`, `#aiPlanMessages`, `#btnAiPlanSend`), sidebar vecchia, `sendAiMessage`, `clearAi`, `aiProviderBadgeText`, stato `aiMessages/aiInput/aiSending`, pulsante "🤖 AI Chat" | sostituire con il nuovo pannello (§10) |
| `portfolio.html`: pulsante "🤖 AI Analysis", `#aiModal`, `hasAiKey`, `openAiAnalysis` | eliminare |
| `js/nav.js` (tab "API & Integrations" del modale Settings: provider, modello, chiavi, GitHub PAT) e `js/settings.js` | eliminare tab, campi e relative funzioni; se il modale resta con la sola tab "Data Manager", togliere la barra delle tab |
| `js/core.js`: campi AI di `appSettings`, `AI_MODELS`, `hasAiKey`, `updateAiButtonVisibility` | eliminare; se `appSettings` resta vuoto, eliminarlo con `persistSettings` e `PDash_settings` |
| `js/sync.js` (Gist sync, non caricato da nessuna pagina) | eliminare |
| `cleanLegacyStorage()` | togliere `PDash_settings` dalla lista `keep`: le chiavi già salvate nei browser vengono cancellate al primo caricamento |
| `css/style.css` `#aiPlanSidebar` | rinominare/riusare per il nuovo pannello |
| `test-cases.html`, `TEST_CASES.md`, `docs/js/ai.md`, `docs/js/core.md`, `docs/js/nav.md`, `docs/pages/planning.md`, `docs/pages/portfolio.md`, `CLAUDE.md` | aggiornare o rimuovere i casi obsoleti |

Prima di cancellare: grep dell'intero repo di ogni simbolo (già fatto per i principali: usato solo da Planning, Portfolio e Settings). Bump di **ogni** `?v=N` dei file toccati (`css/style.css`, `js/core.js`, `js/nav.js`, `js/settings.js` sono su quasi tutte le pagine).

## 5. Provenienza dei topic (prerequisito)

Oggi `aggregateProfile` (`api/src/lib/resource-profile.js`) salva in `resources.profile.topics` solo `{ topicId, projectCodes }`: un topic di progetto va a ogni contributore, un topic di task solo a chi ha ore su quel task, ma la distinzione si perde nell'aggregato.

Nuova forma di ogni elemento: `{ topicId, projectCodes, direct: { hours, projectCodes }, context: { projectCodes } }`.

- **direct**: il topic arriva da un task su cui la persona ha ore; `hours` = somma delle ore sui task collegati al topic.
- **context**: il topic arriva solo dalla descrizione del progetto (la persona ha lavorato sul progetto ma non su un task collegato). Se un progetto ha il topic sia a livello progetto sia a livello task su cui la persona ha ore, conta come `direct` per quel progetto.
- `projectCodes` resta (unione), per compatibilità con `team.html`. `version` del profilo sale a 2.
- `buildProfileTree` (`js/lib/team-ui.js`) e la scheda Experience di `team.html` mostrano "Direct experience" / "Project context" al posto dei chip piatti (modifica minima; stesso `?v` bump).
- Nessuna migrazione: JSONB. **Deploy:** eseguire "Rebuild" dalla console `profile-jobs.html`, altrimenti i profili in cache restano `version: 1` (il ranking li tratta come `context` e lo segnala nel razionale: "provenienza topic non disponibile, ricalcolare i profili").

## 6. Curva di carico

**Aggiornato 2026-09-30** (Ciclo A mergiato, `a07c7b8`): il carico per persona **non si ricalcola**, viene dal servizio di Planning (`docs/api/planning-model.md`, proiezione `owner`). Nessun `planning-load.js`, nessuna fixture condivisa, nessun port del calcolo: la regola resta una sola.

**Helper condiviso.** Dalla route `POST /api/planning/model` si estrae in `api/src/services/planning-data.js` (o modulo vicino) `computePlanningModel({ view, projectIds, teams, from, to, asOf, pulse, user })`: carica i dati dalla cache di 30 s, filtra i progetti per visibilità, costruisce le settimane, calcola `ownerStatus` e chiama `buildProjection`. La route diventa un sottile involucro; l'assistente lo chiama **in-process** (nessuna chiamata HTTP verso sé stesso). Comportamento e risposta della route restano identici (test PM-01..PM-07 invariati).

**Carico di una persona** = una chiamata `computePlanningModel` con `view: 'owner'`, `teams: []`, `pulse: false`, `asOf` = oggi (data locale del client, come per Planning), e:
- `projectIds` = tutti i progetti "come Planning": non `Canceled`, non `Completed`, **in qualsiasi stadio di pipeline** (SIP/Expected compresi, decisione utente 2026-09-30), **escluso il progetto target**. Il target si esclude omettendolo: la proiezione `owner` calcola il residuo per task, quindi l'esclusione è esatta. L'assistente è admin/sysadmin, quindi la visibilità copre ogni progetto.
- finestra `from` = lunedì di (oggi − 4 settimane), `to` = fine della finestra del target (§ sotto).
- Risultato: `ownerMap[nome].weekTotals[lunedì] = { hours, isPast }`, dove `hours` = actuals per le settimane passate e pianificato futuro per le altre, sommati su tutti i progetti. Le settimane con `isPast` danno il `currentLoad` (media delle ultime 4 settimane completate, solo actuals); le altre danno il carico pianificato.
- I nomi owner si convertono in `resourceId` con `matchOwner` (alias o nome esatto) su `data.resources`/`data.aliases`; nomi non abbinati o ambigui non contano nel carico di nessuna risorsa e non sono candidabili. Se più nomi puntano alla stessa risorsa, le ore si sommano. Il segnaposto "—" (nessun owner attivo) non è una persona e si ignora.

**Regole ereditate dalla vista By Owner (volute, il planner vede lo stesso numero):** un task senza date non ha fallback sul progetto e si distribuisce su tutte le settimane future della finestra; il residuo è per task sull'insieme dei ruoli; le righe actuals di domenica sono collocate in settimana; gli owner `inactive` non ricevono pianificato futuro. Le eventuali correzioni (seguito "By Owner e weekend") valgono automaticamente anche per l'assistente.

**Finestra del progetto target** (funzione pura `targetWindow`, nel modulo di ranking): dal max(oggi, inizio più precoce dei task del ruolo) alla fine più tarda, come settimane lunedì-domenica; senza date sui task, il periodo del progetto (mesi minimo/massimo di `monthly_distribution`/date). Progetto già iniziato: solo settimane future.

**Ore già sul progetto target:** somma delle ore actuals per risorsa sugli actuals del target (`groupActualsByProject` + `matchOwner`), letti dalla stessa cache; colonna dedicata, mai sottratte al carico (il target non è nel carico).

**Disponibilità** (funzione pura `availabilityForWindow`, in `team-ranking.js`): per ogni settimana della finestra del target, libere = `max(0, 32 − hours)` con `hours` dal `weekTotals` della risorsa (0 se assente). `freeAvg` = media, `freeMin` = minimo. `neededPerWeek` per ruolo = ore residue (o previste, se senza actuals) del ruolo sul target diviso per le settimane della sua finestra.

**Prestazioni:** una chiamata `owner` costa 0,55-0,8 s di calcolo (benchmark del Ciclo A, payload fino a 7,5 MB non compresso, irrilevante in-process). `/rank` ne fa una sola; `/chat` fino a 3 giri, quindi ~2 s di calcolo in più nel caso peggiore. Da misurare al Gate 2. Se troppo lento: restringere con `teams`/ruoli richiesti o pre-aggregare, come ciclo successivo.

## 7. Ranking

Modulo puro `api/src/lib/team-ranking.js`. Costanti (pesi, saturazioni, soglie) in testa al file, con i valori sotto come **valori iniziali da tarare con dati reali al Gate 2**.

**Requisito** (costruito dal progetto): per ogni `roles.code` dei task non completati: task del ruolo (nomi), ore, finestra; tag del progetto (`project_tags`); topic approvati collegati al progetto e ai task del ruolo.

**Punteggio di esperienza** `S(risorsa, ruolo) ∈ [0,100]`, somma pesata di componenti in [0,1], ognuna saturata con `1 − e^(−x/k)`:

| Componente | Peso | x | k |
|---|---|---|---|
| Ruolo | 30 | ore della risorsa con quel `roles.code` (`profile.roles`) | 200 |
| Tag | 30 | per ogni dimensione del progetto: ore su valori uguali a quelli del progetto (`profile.dimensions`); media pesata per dimensione (`therapeutic-area` 3, `brand` 3, `market` 2, `service-type` 2, altre 1) | 100 |
| Task | 25 | ore su task (in qualsiasi progetto) con nome normalizzato uguale, o con similarità di token (Jaccard ≥ 0.5), a uno dei task del ruolo | 100 |
| Topic | 15 | topic in comune: 1.0 se `direct`, 0.4 se solo `context`, divisi per il numero di topic del requisito (max 1) | — |

Se il requisito non ha tag o topic, la componente relativa è esclusa e i pesi rimanenti si rinormalizzano. Per il **team alternativo** la componente Ruolo è esclusa (pesi rinormalizzati) e serve `S ≥ MIN_ALT_SCORE` (iniziale 30).

**Le tre liste** (per ciascun `roles.code`, prime `topN` = 3 righe):
1. **Migliore**: risorse attive il cui `role_id` punta a quel codice, per `S` decrescente. Se `S < 10` la riga porta il flag "nessuna esperienza rilevante".
2. **Alternativo**: risorse attive con ruolo diverso e `S_alt ≥ MIN_ALT_SCORE`, per `S_alt` decrescente.
3. **Disponibile**: pool = migliore ∪ alternativo (tutte le risorse con ruolo uguale, o con `S_alt ≥ soglia`), ordine per `S × min(1, freeAvg / neededPerWeek)` (fattore 1 se `neededPerWeek` è ~0), a parità `freeAvg` decrescente. Filtro opzionale `minFreeHoursPerWeek`.

Una risorsa può comparire in più tabelle e per più ruoli.

**Colonne identiche** nelle tre tabelle: risorsa, ruolo, punteggio, ore sul ruolo, tag principali (per dimensione, con ore), progetti simili (nome + ore, max 3), task simili, topic in comune (etichettati diretto/contesto), ore libere/sett (media e minima), carico attuale, ore già sul progetto, razionale.

**Razionale a template**: una frase composta dai numeri, ad es. "142 h come Data Analyst; 3 progetti in Oncology (Brand X: 90 h); topic 'Project coordination' (diretto, 60 h); 12 h/sett libere sulla finestra". Ordine e formato fissi; frammenti omessi se il dato è assente. Nessun LLM.

## 8. API

Nuovo `api/src/routes/planning-assistant.js`, montato su `/api/planning-assistant`, tutte `requireAuth, requireAdmin`.

- `POST /rank` — `{ projectId, params }` → `{ requirement, tables: { best, alternative, available }, params }`. Errori: 400 parametri non validi (messaggio per campo), 404 progetto assente, 422 progetto senza task con ruolo/ore (niente da allocare).
- `POST /chat` — `{ projectId, messages, params }` → `{ reply, params, tables }`. 503 se `llm.js` non è configurato o non risponde ("Assistant unavailable"); `/rank` continua a funzionare.
- `params` (oggetto piatto, validato lato server): `roles?: string[]`, `excludeResources?: string[]` (nomi, risolti lato server con `match-resource`; ambiguo o inesistente → errore per campo), `requireTags?: [{ list, value }]`, `preferTags?: [{ list, value }]`, `minFreeHoursPerWeek?: number`, `topN?: 1..10`, `window?: { from, to }` (`YYYY-MM-DD`), `includeAlternatives?: boolean`.
- Il progetto è identificato da `projects.id`. Nessun dato sensibile in log: le route non loggano né messaggi né tabelle.

## 9. Servizio LLM e chat

`api/src/services/llm.js`: interfaccia unica `chat({ system, messages, tools, signal })` → `{ text, toolCalls }`. Oggi un solo backend, Anthropic Messages API con tool use, via `fetch` (nessuna nuova dipendenza), timeout 30 s, come `callAnthropic` in `topic-extraction.js` (stessi `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`; i test puntano a uno stub locale). I messaggi d'errore non includono mai il corpo della risposta. Per i modelli locali basterà un secondo backend con la stessa interfaccia; il design ne limita i requisiti (§ tool piatti, compito piccolo).

**Ciclo di `/chat`:**
1. System prompt (fisso, in inglese) + riepilogo compatto dei requisiti del progetto in un blocco delimitato, trattato come **dati** (le descrizioni possono contenere testo arbitrario); conversazione (ultimi 20 messaggi).
2. L'LLM può chiamare `rank_team(params)` e `explain_resource({ name, role })`. Il server valida i parametri, esegue, restituisce un risultato compatto. Massimo 3 giri; parametro non valido → l'errore torna all'LLM.
3. Risposta finale: testo + `params` correnti + tabelle dell'ultimo `rank_team`. `explain_resource` restituisce la scomposizione del punteggio (componenti e ore) e le ore libere, per rispondere a "perché X non è tra i migliori?".
4. Il testo dell'LLM è **una sintesi e i suggerimenti sulle migliori combinazioni**, non un elenco di numeri; il prompt vieta di riportare cifre non presenti nei risultati dei tool.

**Sicurezza/privacy:** nomi, ore e carico delle risorse raggiungono l'API Anthropic finché non c'è il modello locale; da documentare in `docs/api/planning-assistant.md` e, come per i topic, l'admin ne è consapevole (accesso ristretto ad admin/sysadmin).

## 10. UI (`planning.html`)

- Pulsante "🤖 Team assistant" nella toolbar, visibile solo se `window.__navUser.role` è `admin` o `sysadmin` (il controllo reale è lato server).
- Pannello destro largo (~900 px, sopra la vista, riuso del guscio `#aiPlanSidebar` rinominato): in alto la chat (messaggi, input, "Nuova chat"), sotto le **tre tabelle impilate** con titolo, una sezione per job title, colonne identiche; scroll interno.
- **Avvio senza cold start**, composto dal client (i progetti sono già caricati): domanda "Cosa vuoi fare?", selettore del progetto (solo progetti in Planning con task) e 4-5 spunti cliccabili: "Team migliore per questo progetto", "Chi è più libero per il ruolo …", "Solo persone con esperienza su …", "Escludi … e ricalcola", "Perché … non è tra i migliori?".
- Pulsante "Calcola team" nel pannello: chiama `/rank` con i `params` correnti, senza LLM (funziona anche se `/chat` dà 503).
- La conversazione e i `params` vivono nello stato Vue; si azzerano con "Nuova chat" o al ricaricamento. Doppio invio protetto (input disabilitato durante la richiesta); errori mostrati come messaggio nella chat, mai `alert`.
- Testo utente della UI in inglese (vincolo di progetto). Nuovo `js/lib/team-assistant-ui.js` (ES module + bridge `window`) per la formattazione pura di righe e razionale, con vitest.

## 11. Errori e casi limite

- Progetto senza task con ruolo → 422, messaggio in chat.
- Nessuna risorsa con quel ruolo → tabella "Migliore" vuota con nota; le altre due possono comunque popolarsi.
- Risorsa senza profilo (`profile = NULL`, "No actuals matched"): compare solo nel team migliore, con punteggio 0 e flag; non nelle altre.
- Risorse inattive: mai proposte. Owner inattivi: non ricevono pianificato futuro (regola già in vigore).
- Nessuna disponibilità calcolabile (finestra vuota): `freeAvg` assente, fattore 1, razionale "disponibilità non calcolabile".
- LLM non disponibile: `/chat` 503; UI mantiene "Calcola team".

## 12. Test

- `node:test` puri: `resource-profile.test.js` (provenienza topic, v2), `planning-data`/`computePlanningModel` (helper estratto: stessa risposta della route; route PM-01..PM-07 invariate), test di `targetWindow`/`availabilityForWindow` (finestre, esclusione del target, nomi non abbinati, somma di più alias sulla stessa risorsa, settimane senza carico), `team-ranking.test.js` (componenti, saturazione, rinormalizzazione, tre liste, razionale, casi limite di §11), validazione dei `params`.
- Route con `llm.js` **finto** (iniettabile): `/rank`, `/chat` (giri di tool, parametro non valido, 503, limite di 3 giri), autorizzazione (utente semplice → 403).
- Integrazione in stack isolato (`scripts/run-tests.sh`): casi in `test-api.js`, con l'LLM stub via `ANTHROPIC_BASE_URL`. La suite non chiama mai l'API vera.
- vitest: `team-assistant-ui.js`, `buildProfileTree` con la provenienza.
- Gate 2 di `/finish-cycle` (manuale, dati reali): taratura dei pesi su ~150 persone, tempi di risposta di `/rank` (carica tutti i timesheet), chat vera con Anthropic.

## 13. Documentazione, deploy, memoria

Nuovo `docs/api/planning-assistant.md`; aggiornati `docs/pages/planning.md`, `docs/pages/team.md` (Experience), `docs/api/lib.md`, `docs/api/profile-engine.md`, `docs/js/*` toccati, `CLAUDE.md` (file structure, rimozione di `js/ai.js`/`js/sync.js`, nuove route/lib), `TEST_CASES.md`, `test-cases.html`. Nessuna migrazione. Deploy: `ANTHROPIC_API_KEY` nel `.env` del server (già usata per i topic); "Rebuild" dei profili da `profile-jobs.html`. `/finish-cycle` Gate 5 verifica anche lo step "Project memory" di `/sync-docs` (prima esecuzione, vedi memoria `project_team_ux_backlog`).

## 14. Rischi e limiti accettati

- **Taratura dei pesi**: i valori di §7 sono ipotesi; l'evidenza per riga (componenti) è esposta proprio per correggerli. Cambiarli è una modifica di codice.
- **Divergenza con Planning**: nessuna, il carico viene dal servizio di Planning. Contropartita: l'assistente eredita le regole della vista By Owner (§6), comprese quelle discusse nei seguiti.
- **Prestazioni**: `/rank` esegue una proiezione `owner` su tutti i progetti attivi (~0,6-0,8 s); cache dati di 30 s e misura al Gate 2.
- **Privacy**: dati delle persone verso l'API Anthropic fino al modello locale.
- Nomi degli actuals non abbinati: non candidabili e assenti dal carico finché non collegati a una risorsa.
