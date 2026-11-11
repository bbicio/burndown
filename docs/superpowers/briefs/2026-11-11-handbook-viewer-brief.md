# Brief — Handbook: viewer unico della documentazione servita dall'app (ciclo 1)

**Tipo:** evoluzione di una feature esistente (Scenario 2), confermato dall'utente il 2026-11-11.
**Origine:** richiesta in chat del 2026-11-11: un solo viewer per tutta la documentazione letta nell'app (manuale d'uso per tutti; documentazione tecnica, test case e checklist di produzione per admin/sysadmin), tutti i file in una sola sottocartella `handbook/`, la root ripulita da `TEST_CASES.md` e `test-cases.html`. Il viewer va in produzione, quindi anche su Bitbucket. Questo è il ciclo 1 di tre: il ciclo 2 migra il manuale, il ciclo 3 scrive i diagrammi Mermaid.

## Comportamento attuale

- **Test case.** `test-cases.html` è una pagina a sé, con una sidebar propria e senza `initNav` (nessun `initNav` nel file). Importa `parseTestCases`/`formatCell` da `js/lib/test-cases-parse.js?v=1` (`test-cases.html:216`), scarica `TEST_CASES.md` dalla root con `cache: 'no-store'` (`test-cases.html:396`), salva l'esito di ogni caso in `localStorage['pdash_test_state_v1']` (`test-cases.html:224-230`). Non ha voce di menu.
- **`TEST_CASES.md` è classificato come codice.** `scripts/classify-cycle.mjs:46` lo mette in `RUNTIME_LOADED_ROOT_MD`; `qualifies()` (`scripts/classify-cycle.mjs:83-89`) dà no-code solo ai `.md` sotto `.claude/`, sotto `docs/` o in root, eccetto quella lista. `sync-docs` §3 (`.claude/skills/sync-docs/SKILL.md:43-48`) dice che un ciclo che tocca solo `TEST_CASES.md` è `ordinary`, e che `js/lib/test-cases-parse.test.js` fissa il numero esatto di casi e sezioni.
- **Checklist di produzione.** `docs/ops/production-checklist.md`, da spuntare "in una copia o nel ticket di deploy, non qui" (riga 3). Non è servita da nessuna pagina.
- **Architettura.** `ARCHITECTURE.md` in root; `scripts/architecture-guard.test.js:66` lo legge per path. È citato da file vivi fuori da `docs/superpowers/` (`git grep -l "ARCHITECTURE.md" -- ':!docs/superpowers'`), fra cui `CLAUDE.md`, `finish-cycle.md`, `sync-docs`, `operational-manual`, `classify-cycle.test.js`, `claude-md-guard.test.js`, `doc-paths-guard.test.js`.
- **Manuale d'uso.** `docs/OPERATIONAL_MANUAL.html`, un HTML autonomo con gli screenshot in base64, rigenerato solo su richiesta (`sync-docs` §5b). Non è linkato dall'app.
- **Accesso via nginx.** `docker-compose.yml:101` monta tutta la root del repo in nginx. `location /` (`nginx.conf:82-89`) serve qualunque file a ogni utente autenticato: `auth_request /auth-check` → `GET /api/auth/me` (`nginx.conf:20-28`) controlla solo che la sessione sia valida, non il ruolo. `css/` e `js/` sono serviti senza autenticazione (`nginx.conf:76-78`); i file del toolchain dev rispondono 404 (`nginx.conf:66-73`).
- **Menu.** `js/nav.js:9-28`: `NAV_MAIN` (Pipeline, Portfolio, Planning) per tutti; i gruppi `NAV_GROUPS` filtrati per `roles` (Admin: admin+sysadmin; Sysadmin: solo sysadmin). Il menu account ha "Privacy Notice" (`js/nav.js:103`).
- **Export Bitbucket** (brief `2026-11-10-bitbucket-export-brief.md`, ciclo non ancora fatto): esclude `docs/`, `ARCHITECTURE.md`, `TEST_CASES.md`, `test-cases.html`, e lascia aperta la sorte di `js/lib/test-cases-parse.js` (domanda 5).

## Comportamento atteso

1. **Una cartella `handbook/` in root** contiene tutta la documentazione servita dall'app, divisa per pubblico:
   - `handbook/public/` — tutti gli utenti autenticati (in questo ciclo solo il segnaposto del manuale; il contenuto arriva nel ciclo 2);
   - `handbook/restricted/` — admin e sysadmin: `ARCHITECTURE.md` (spostato dalla root), `TEST_CASES.md` (spostato dalla root), la checklist di produzione (spostata da `docs/ops/`).
   - Un `handbook/manifest.json` elenca i documenti: id, titolo, pubblico, renderer, file.
2. **Un viewer unico** (pagina autenticata, nome da decidere) mostra i documenti del manifest che il ruolo dell'utente può vedere, con due renderer:
   - **markdown**: `marked` e `mermaid` da CDN, per architettura, checklist e manuale; i blocchi `mermaid` diventano diagrammi;
   - **test case**: il comportamento di oggi di `test-cases.html` (parsing con `test-cases-parse.js`, esito per caso salvato nella stessa chiave `localStorage`), dentro il viewer.
3. **`test-cases.html` è rimosso**; un vecchio link a `/test-cases.html` porta al documento dei test case nel viewer (redirect, come `config.html`).
4. **L'accesso ad admin/sysadmin è garantito dal server, non solo dall'interfaccia**: una richiesta diretta a un file sotto `/handbook/restricted/` da parte di un utente con ruolo `user` riceve un rifiuto, non il file.
5. **Voce "Help"** nel menu, visibile a tutti, che apre il viewer.
6. **`classify-cycle`**:
   - no-code: `handbook/**/*.md` e `handbook/**/*.png`, aggiunti o modificati;
   - ordinary: `handbook/manifest.json`, la pagina del viewer, ogni `.js`, `nginx.conf`, e ogni rinomina o spostamento di un file tra `handbook/public/` e `handbook/restricted/`.

   `RUNTIME_LOADED_ROOT_MD` sparisce (o resta vuota, da decidere).
7. **Un guard test in `npm test`** legge ogni `.md` sotto `handbook/` con il parser del renderer che il manifest gli assegna e fallisce su un documento che il viewer non saprebbe mostrare. Fallisce anche su un file del manifest che non esiste e su un `.md` di `handbook/` che il manifest non elenca.
8. **`/sync-docs`** punta ai nuovi percorsi. Ha step condizionali:
   - documentazione tecnica, quando il ciclo cambia layer, route, tabelle o flussi;
   - checklist di produzione, quando cambiano `ARCHITECTURE.md` o `PRD.md`;
   - manuale, quando cambia il comportamento visibile all'utente; è attivo dal ciclo 2.
9. **Il brief Bitbucket è corretto**: `handbook/`, la pagina del viewer e `js/lib/test-cases-parse.js` diventano "sito"; `docs/` resta escluso. L'utente accetta che architettura e checklist siano visibili a chi accede al repo Bitbucket.

## Vincoli

- **Nessun build step a runtime** (`CLAUDE.md` → "Testing & tooling"); librerie esterne solo da CDN.
- **La pagina del viewer segue le regole delle pagine autenticate**: page shell, `.ph`, `js/lib/icons.js` prima di `nav.js`, `v-cloak`, `?v=N` concordi; tutti i guard esistenti restano verdi (`nav-shell-guard`, `page-head-guard`, `foundations-guard`, `page-names`).
- **La chiave `pdash_test_state_v1` non cambia**: gli esiti già salvati nei browser restano. Non inizia con `PDash`, quindi `cleanLegacyStorage()` non la tocca.
- **La classificazione è per path, mai per contenuto** (come `classify-cycle.mjs` e `gate5-scope.mjs`); la regola vive in un solo posto ed è fissata da `classify-cycle.test.js`.
- **Testi dell'interfaccia in inglese.**
- **Ogni spostamento aggiorna tutte le citazioni vive**: `doc-paths-guard` e `claude-md-guard` restano verdi.
- **`nginx.conf` cambia**: per CLAUDE.md "Infrastructure safety", riavviare lo stack principale richiede conferma e backup; la verifica si fa sullo stack di branch.

## Criteri di accettazione

- `TEST_CASES.md`, `test-cases.html` e `ARCHITECTURE.md` non sono più in root; `docs/ops/production-checklist.md` non esiste più; `git ls-files handbook/` mostra i tre documenti spostati e `manifest.json`.
- Sullo stack di branch, un utente `user` vede nel viewer solo i documenti pubblici; un admin e un sysadmin vedono anche i riservati.
- Sullo stack di branch, `curl` con il cookie di un `user` su un file sotto `/handbook/restricted/` non restituisce il file; con il cookie di un admin sì; senza cookie porta al login.
- Il documento dei test case nel viewer mostra le stesse sezioni e lo stesso numero di casi di `test-cases.html` prima del ciclo, e un esito salvato prima del ciclo è ancora visibile.
- Un blocco `mermaid` di prova in un documento riservato è mostrato come diagramma.
- `/test-cases.html` porta al documento dei test case nel viewer.
- La voce "Help" compare nel menu per `user`, admin e sysadmin.
- `classify-cycle.test.js` ha i casi: modifica di un `.md` sotto `handbook/` → `no-code`; un `.png` sotto `handbook/` → `no-code`; `handbook/manifest.json` → `ordinary`; rinomina da `handbook/restricted/` a `handbook/public/` → `ordinary`; `TEST_CASES.md` nel nuovo percorso → `no-code`.
- Il guard dei documenti è rosso con una tabella malformata nei test case, un file del manifest mancante, un `.md` non elencato; verde sul repo.
- `scripts/architecture-guard.test.js` legge `ARCHITECTURE.md` dal nuovo percorso ed è verde.
- `npm test`, `doc-paths-guard` e `claude-md-guard` sono verdi.
- Il brief Bitbucket elenca `handbook/`, la pagina del viewer e `js/lib/test-cases-parse.js` fra gli inclusi.

## Scope escluso (confermato dall'utente il 2026-11-11)

- Il contenuto del manuale e la sua migrazione da `docs/OPERATIONAL_MANUAL.html` (ciclo 2), compreso l'adattamento della skill `operational-manual`.
- I diagrammi Mermaid dell'architettura (ciclo 3): qui solo la capacità di mostrarli.
- Spostare `PRD.md` e qualunque altro file di `docs/`.
- Ricerca nel testo, indice automatico, stampa o export PDF nel viewer.
- Rendere interattiva la checklist di produzione (spunte salvate): resta in sola lettura.
- Correggere le citazioni dei vecchi percorsi nei documenti storici di `docs/superpowers/` (specs, plans, reports): restano come sono.
- Realizzare l'export Bitbucket: qui si corregge solo il brief.

## Domande aperte per `/brainstorming`

1. **Nome e URL del viewer** (`docs.html`? `help.html`?) e come un link punta a un documento (`?doc=<id>`, ancora per la sezione).
2. **Controllo del ruolo in nginx**: nuovo endpoint API (es. `GET /api/auth/admin-check`) per un secondo `auth_request` sotto `location /handbook/restricted/`, o un'altra strada. E che cosa risponde a un `user`: 403 o 404.
3. **Posizione della voce "Help"**: in `NAV_MAIN` o nel menu account vicino a "Privacy Notice". Va verificato l'effetto su `nav-model.test.js` e `nav-layout-guard.test.js`.
4. **Mermaid nel guard test**: `mermaid.parse` funziona sotto jsdom/node? Se no, quale controllo più leggero.
5. **Sicurezza del markdown**: il contenuto è del repo, ma passa da `innerHTML`. Si sanifica (DOMPurify da CDN) o no? Il manuale userà `<details>` grezzo.
6. **`RUNTIME_LOADED_ROOT_MD`**: si rimuove, o resta vuota per i casi futuri?
7. **`ARCHITECTURE.md` spostato**: è il rename con più citazioni vive. Si aggiornano tutte nello stesso commit dello spostamento?
8. **Ordine fra lo spostamento di `TEST_CASES.md` e i rami aperti**: un worktree aperto che modifica `TEST_CASES.md` (oggi `.claude/worktrees/backlog-b417-sse-revocation`) andrà in conflitto. Si aspetta il suo merge?
9. **Classe di rischio (§6.1b)**: tocca `nginx.conf`, un endpoint di autorizzazione e lo script che decide il percorso del Gate 2.
10. **Dipendenza dal ciclo di hardening nginx** (deciso il 2026-11-11, da fare prima di questo): se quel ciclo passa nginx a servire solo un elenco di path del sito, `handbook/` e la pagina del viewer vanno aggiunti a quell'elenco qui.

Brief ready. Next step: /brainstorming.
