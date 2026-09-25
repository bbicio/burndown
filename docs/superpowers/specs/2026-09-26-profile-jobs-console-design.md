# Console dei job del profilo (Cycle 3d) — design

**Data:** 2026-09-26
**Stato:** design approvato in chat, spec da rivedere
**Contesto:** sottociclo 3d del Ciclo 3 (profilo risorsa). Estende la §5b di `docs/superpowers/specs/2026-09-25-resource-profile-design.md` (che resta il riferimento per il motore, le tabelle e le impostazioni) con le decisioni prese in fase di brainstorming. Dipende dal 3c, già in `main` (migrazione `026`, `profile-engine.js`, `profile-worker.js`, `POST /api/profile-jobs/run`).

## 1. Obiettivo e non-obiettivi

Dare all'admin una pagina dove **vedere quali progetti sono in coda di elaborazione e quando verranno elaborati**, **forzare un ricalcolo** e **regolare la pianificazione** del worker, con lo storico delle ultime esecuzioni. Oggi non c'è nessuna UI: un ricalcolo immediato si ottiene solo con `POST /api/profile-jobs/run` da un client autenticato, e l'intervallo si cambia solo via SQL.

**Fuori scope** (confermato dall'utente): notifiche push/email sui fallimenti, vista o modifica dei contributi per risorsa, grafici e statistiche dei run, cron/orari fissi, backoff configurabile oltre al throttle degli errori ripetuti, persistenza su DB dell'ultimo avvio del worker, badge di stato per riga in Timesheets, modifiche alla logica di profilo, al matching o al tab Experience di `team.html`, Planning, descrizioni di progetti/task, Ciclo 4.

## 2. Posizione: pagina dedicata raggiungibile solo da Timesheets

`profile-jobs.html` è una **pagina separata senza voce nel menu**. L'unico punto d'ingresso è un pulsante secondario "Profile processing →" nell'intestazione di `timesheets.html`, con un badge col numero di codici in coda (una `GET /api/profile-jobs` all'apertura; errori ignorati in silenzio).

Motivazione (scelta dell'utente dopo aver valutato tab in Timesheets e colonne nella tabella esistente): Timesheets ha già upload, dettaglio ed export e resta snello; la console elenca anche i codici presenti solo in `profile_project_state` (actuals cancellati in attesa di pulizia), che Timesheets non può mostrare; nessuna nuova voce nel menu ⚙ Admin.

- La pagina chiama `initNav('timesheets')`, così la tab Timesheets resta evidenziata; in alto un link "← Timesheets".
- Solo **admin o sysadmin**: redirect a `/pipeline.html` come `timesheets.html`, e ogni rotta è `requireAdmin` lato server.
- Nessuna modifica a `js/nav.js` e quindi nessun bump `?v` in cascata.

## 3. Pagina

Vue 3 da CDN, script `type="module"` finale come le altre pagine Vue, `v-cloak` sulla radice, testi in inglese, token di `css/tokens.css`, `css/admin-crud.css` riusato. Carica `core.js`, `api.js`, `nav.js`, `notifications.js`, `settings.js`; chiamate API con `fetch()` diretto (stile di `team.html`).

Dall'alto in basso:

1. **Impostazioni**: interruttore on/off e intervallo in minuti (intero 1–1440). Save attivo solo se cambia qualcosa; validazione sul client e sul server; dopo il salvataggio "Saved — applies on the next tick (within 60 s)". Sotto: la stima "next run" (`paused` → "Paused"; `due` → "On the next tick (within 60 s)"; `scheduled` → data e ora), con la nota che dopo un riavvio dell'API la stima riparte.
2. **Azioni globali**: **Recalculate now** (svuota la coda, parte senza conferma) e **Rebuild all** (conferma con `showConfirm()`).
3. **Elenco dei codici**: ricerca su codice e nome, filtro per stato (All / Queued / Error / Updated), ordinamento per codice, stato o ultima elaborazione, scroll interno senza paginazione. Colonne: progetto, codice, righe di actuals, risorse abbinate, stato, ultima elaborazione, prossima elaborazione, azioni. Stato vuoto: "No actuals uploaded yet." Errore per riga: badge rosso con il messaggio (tooltip e riga espandibile). Azioni per riga: **Process** (senza conferma) e **Remove from queue** (solo per le righe in coda, con conferma che precisa che il profilo già calcolato non cambia finché quel codice non viene rielaborato).
4. **Storico** (`<details>` richiudibile): quando, tipo (scheduled/manual/bootstrap), progetti, risorse, durata, errore.

Comportamento comune: una `GET /api/profile-jobs` al caricamento, un refresh automatico ogni 15 secondi mentre la scheda è visibile (si ferma in background) e uno dopo ogni azione; ogni pulsante ha una guardia anti-doppio click (`_loading`) ed è disabilitato mentre un'azione è in corso; un **409** mostra "A profile job is already running — try again in a moment."; errori di rete o risposte non-JSON in un alert globale in cima, separato dagli errori delle azioni. Niente `alert()`/`confirm()` nativi.

## 4. API (`api/src/routes/profile-jobs.js`)

Tutte dietro `router.use(requireAuth, requireAdmin)` (già presente). `POST /run` resta com'è.

| Rotta | Comportamento |
|---|---|
| `GET /api/profile-jobs` | `{ settings: { enabled, intervalMin }, schedule: { state, lastRunAt, nextRunAt }, queuedCount, projects: [...] }` |
| `PUT /api/profile-jobs/settings` | `{ enabled: boolean, intervalMin: integer 1–1440 }`; 400 per qualsiasi altro tipo o valore; scrive `'true'`/`'false'` e l'intero come stringa in `app_settings`, con `updated_by`; risponde con le impostazioni salvate |
| `POST /api/profile-jobs/rebuild` | `enqueueAll()` poi `processQueue('manual')`; 409 se un run è in corso (i codici restano comunque accodati e il messaggio lo dice) |
| `POST /api/profile-jobs/projects/:code/process` | accoda ed elabora solo quel codice; 404 se il codice non esiste né in `timesheets` né in `profile_project_state`; 409 se un run è in corso |
| `DELETE /api/profile-jobs/projects/:code/queue` | `queued_at = NULL` per quel codice, senza toccare il profilo; 404 se il codice non è tracciato |
| `GET /api/profile-jobs/runs` | ultimi 50 run, dal più recente |

`:code` è validato (non vuoto, al massimo 100 caratteri, dopo `trim`).

**Elenco `projects`**: unione di `timesheets` e `profile_project_state`, una riga per codice, in **una sola query aggregata**: `project_code`; `project_name` (progetto più vecchio con quel codice, altrimenti il codice); `rows` (somma delle righe di actuals); `resources` (conteggio reale dei contributi); `queued_at`, `last_processed_at`, `last_error`. Stato derivato: **Error** se c'è `last_error`; **Queued** se `queued_at` è valorizzato; **Updated** se elaborato e non in coda. I codici solo in `profile_project_state` hanno 0 righe. La prossima elaborazione per riga è quella del job se il codice è in coda, "—" altrimenti.

## 5. Modifiche al motore e al worker

1. **Process one** — `processQueue(trigger, { only })` in `profile-engine.js`: con `only` il claim si restringe a quel codice, con lo stesso lock advisory, la stessa transazione per codice e lo stesso trattamento dei fallimenti (il codice fallito resta escluso dal resto del run). Un run con `only` è sempre `manual` e sempre registrato.
2. **Throttle degli errori ripetuti** — funzione pura `shouldRecordRun({ trigger, projects, errors, lastRunError })` in `api/src/lib/job-schedule.js`, usata da `processQueue`: un run `scheduled`/`bootstrap` con zero progetti elaborati e **lo stesso errore** (stringa già composta come in `recordRun`) dell'ultimo run registrato non scrive una riga; errore diverso, run con lavoro effettivo e run `manual` si registrano sempre. Un codice che fallisce resta visibile per riga (`last_error`).
3. **Prossima elaborazione** — funzione pura `nextRunInfo(settings, lastRunStartedAt, now)` in `job-schedule.js`: spento → `paused`; mai eseguito o scaduto → `due`; altrimenti `scheduled` con ultimo avvio + intervallo. `profile-worker.js` esporta un getter dell'ultimo avvio (worker e API girano nello stesso processo). Come oggi (`isJobDue`), un run manuale dalla console non sposta il "prossimo".
4. **Limiti dichiarati** nella pagina: dopo il riavvio dell'API la stima riparte da `due`; ha la granularità del tick da 60 secondi.

**Nessuna migrazione.** Nessun cambiamento a `resource-profile.js`, al matching o alle rotte di `resources.js`.

## 6. Moduli e file

- Nuovo `profile-jobs.html`.
- Nuovo `js/lib/profile-jobs-ui.js` (`?v=1`, caricato solo da questa pagina; ES module con bridge `window.*`): filtro e ordinamento dell'elenco, etichetta di stato, testo del "next run", formato della durata. Vitest.
- `timesheets.html`: pulsante con badge.
- `api/src/routes/profile-jobs.js`, `api/src/lib/job-schedule.js` (+ test), `api/src/services/profile-engine.js`, `api/src/services/profile-worker.js`.
- Docs (via `/sync-docs`): `docs/api/profile-engine.md`, `docs/js/lib.md`, nuovo `docs/pages/profile-jobs.md`, `docs/pages/timesheets.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `TEST_CASES.md`/`test-cases.html`, `PRD.md` (pagina nuova, visibile), skill del manuale operativo.

## 7. Vincoli trasversali

- Nessun bundler né build step; testi in inglese; token del design system, niente hex hardcoded; `v-cloak` sulla radice.
- Nessun `alert()`/`confirm()` nativo: idioma `showConfirm()`/`showInfo()` di `js/core.js`.
- Ogni file con `?v=N` toccato va bumpato in tutte le pagine che lo caricano (qui solo il nuovo `profile-jobs-ui.js`, `?v=1`).
- Permessi: ogni rotta `requireAdmin` (admin o sysadmin), anche lato server; parametri SQL sempre parametrizzati; `:code` validato.
- Le azioni passano dal motore (`enqueueProjects`/`enqueueAll`/`processQueue`): lock advisory, `FOR UPDATE SKIP LOCKED`, un codice per transazione. Nessun accesso alle tabelle che aggiri il motore, salvo la lettura dell'elenco.
- L'intervallo sul DB reale è **1 minuto per prove** (deciso dall'utente, che lo riporterà a 10 dalla console); né spec né test devono dipendere da questo valore, e i test di integrazione ripristinano le impostazioni che modificano.
- Nessun `docker compose` sul main stack; verifica sullo stack isolato (`scripts/test-branch.sh`), che per questo ciclo non richiede migrazioni a mano.

## 8. Testing

- **`node:test`** (`api/src/lib/job-schedule.test.js`): `shouldRecordRun` (errore ripetuto saltato, errore diverso registrato, run con lavoro registrato, manuale sempre registrato, primo run senza precedente) e `nextRunInfo` (spento, mai eseguito, scaduto, futuro, intervallo non standard).
- **Vitest** (`js/lib/profile-jobs-ui.test.js`): filtro per testo e stato, ordinamenti, etichette, testo del "next run", durata.
- **Integrazione** (`test-api.js`, casi `PJ-*`): 401 senza login e 403 con l'utente non admin su tutte le rotte nuove; forma della `GET`; validazione del `PUT` (tipi, 0, 1441, non intero, non booleano) e scrittura dei valori canonici, con ripristino a fine test; `rebuild` svuota la coda e registra un run `manual`; `process` tocca solo il codice indicato e lascia in coda gli altri; 404 su codice sconosciuto; `remove` toglie solo dalla coda e lascia il profilo; `GET /runs` al massimo 50 righe dal più recente; throttle: due run schedulati identici falliti non producono due righe (verificato sulla funzione pura, e a livello di motore solo dove deterministico).
- **Non deterministici, quindi manuali**: il 409 (dipende dal timing del worker), il refresh automatico, il "next run" reale, la coda che si svuota a vista.
- **Verifica manuale** sullo stack del branch: pulsante con badge in Timesheets, ingresso alla pagina, tutte le azioni, widget con salvataggio e effetto senza riavvio, filtri, codice orfano, storico, permessi con un utente non admin.

## 9. Domande aperte

Nessuna bloccante. Da decidere in fase di piano: i nomi esatti delle colonne aggregate della query dell'elenco, e se il badge in Timesheets debba mostrare 0 o nascondersi quando la coda è vuota (proposta: nascosto).
