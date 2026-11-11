# Brief — nginx serve solo i file del sito

**Tipo:** evoluzione di una feature esistente (Scenario 2), confermato dall'utente il 2026-11-11.
**Origine:** emerso il 2026-11-11 scrivendo il brief handbook (`2026-11-11-handbook-viewer-brief.md`). L'utente ha verificato di persona che, da autenticato, `http://localhost/.env` si scarica. Va fatto prima del ciclo handbook. L'app è raggiungibile solo dall'utente in locale. Nessuna mitigazione immediata: l'esposizione resta aperta fino al merge di questo ciclo, per scelta dell'utente.

## Comportamento attuale

- `docker-compose.yml:101` monta l'intera root del repo in nginx (`./:/usr/share/nginx/html:ro`), compresi file non tracciati e gitignored.
- `nginx.conf:82-89` (`location /`): qualunque file sotto la root viene servito a ogni utente con sessione valida. `auth_request /auth-check` → `GET /api/auth/me` (`nginx.conf:20-28`) controlla solo la sessione, non il ruolo. `try_files $uri $uri/ /index.html` serve `index.html` per un path inesistente.
- `nginx.conf:76-78` (`location ~ ^/(css|js)/`): `css/` e `js/` sono serviti **senza** autenticazione, perché servono alle pagine di login, attivazione e reset.
- `nginx.conf:66-73` (blocco "DEV-ONLY TOOLCHAIN"): l'unica protezione è una lista di eccezioni che rispondono 404 (`node_modules/`, `*.test.js`/`*.spec.js` sotto `js/` e `scripts/`, `package.json`, `package-lock.json`, `vitest.config.js`). Tutto il resto è servito.
- Quindi oggi un utente autenticato qualunque può scaricare, fra l'altro:
  - `.env` (`JWT_SECRET`, credenziali SMTP, chiavi API);
  - `backups/*` (dump `pg_dump` del DB);
  - `.claude/worktrees/*/.env`;
  - `.git/`, `api/`, `scripts/`, `docs/`, `shots/`, `.superpowers/`, `.superpowers_up.log`;
  - `CLAUDE.md`, `ARCHITECTURE.md`, `PRD.md`, `TEST_CASES.md`, `docker-compose.yml`, `nginx.conf`, `test-api.js`, `.env.example`.
- Lo stack di branch (`scripts/test-branch.sh:108-109`) e quello dei test (`scripts/run-tests.sh`) usano lo stesso `nginx.conf` e lo stesso montaggio.
- Il log di `pdash-nginx` copre solo dall'ultimo avvio del container (2026-11-10 21:16 UTC). In quel periodo l'unica richiesta a un file sensibile è il test dell'utente su `/.env` (2026-11-11 18:04, 200, da 172.18.0.1).

## Comportamento atteso

1. **nginx serve solo un elenco esplicito di file del sito**; ogni altro path risponde 404, anche un file aggiunto in futuro e non elencato. Il sito oggi è:
   - le pagine `*.html` della root;
   - `css/`;
   - `js/`, senza i `*.test.js`/`*.spec.js`;
   - `assets/`.

   Il ciclo handbook ci aggiungerà `handbook/` e il viewer.
2. **Le regole di autenticazione di oggi non cambiano**:
   - login, attivazione e reset sono pubblici;
   - `css/`/`js/`/`assets/` hanno la stessa regola di oggi (da confermare per `assets/`, vedi domande);
   - tutte le altre pagine richiedono la sessione;
   - `/api/` e lo stream SSE sono come oggi.
3. **Nessun file fuori dall'elenco è raggiungibile**, autenticati o no. In particolare non lo sono i file che iniziano con il punto (`.env`, `.git/`, `.claude/`…), `backups/`, `api/`, `scripts/`, `docs/`, i `.md` della root, `docker-compose.yml`, `nginx.conf`, `test-api.js`, `package*.json`, `vitest.config.js`, `node_modules/`.
4. **Un guard test** fallisce quando la configurazione rende servibile un path fuori dall'elenco, o quando un file del sito tracciato non è servito.
5. **Rotazione dei segreti** di `.env` (`JWT_SECRET` e gli altri): l'app è raggiungibile solo dall'utente in locale, quindi è prudenziale e non urgente. Si decide in brainstorming se farla in questo ciclo.

## Vincoli

- **Nessun build step e nessun file del sito spostato**: è nginx a decidere cosa servire, il repo non si ristruttura (la `webfolder/` è stata scartata nel brief Bitbucket).
- **L'elenco del sito ha una sola definizione** (`CLAUDE.md` → "Writing documentation"). Se possibile la condivide con l'export Bitbucket (`2026-11-10-bitbucket-export-brief.md`, punto 2) invece di duplicarla.
- **Classificazione per path, mai per contenuto.**
- **Infrastructure safety** (`CLAUDE.md`): la verifica avviene sullo stack di branch. Applicare la modifica allo stack principale (`pdash-nginx`) dopo il merge richiede un backup con `scripts/backup-db.sh` e la conferma esplicita dell'utente, senza `-v`/`--volumes`. La deroga del Gate 4 copre solo `docker compose restart api`, non nginx.
- **Nessuna pagina dell'app smette di funzionare**: ogni pagina, ogni foglio di stile, ogni script e ogni asset oggi caricato si carica ancora.

## Criteri di accettazione

- Sullo stack di branch, con il cookie di un utente autenticato, rispondono 404:
  - `/.env`, `/.env.example`, `/.git/HEAD`, `/.claude/` (un file qualunque);
  - `/backups/` (un file qualunque);
  - `/api/src/index.js`, `/scripts/backup-db.sh`, `/docs/BACKLOG.md`;
  - `/CLAUDE.md`, `/TEST_CASES.md`;
  - `/docker-compose.yml`, `/nginx.conf`, `/test-api.js`, `/package.json`, `/js/lib/money.test.js`.
- Senza cookie, gli stessi path rispondono 404 o portano al login. In nessun caso arriva il contenuto del file.
- Senza cookie, `/login.html`, `/activate.html`, `/reset-password.html` e i `css/`/`js/` che caricano rispondono 200.
- Con il cookie, ogni pagina dell'app si apre senza richieste fallite nella console di rete. L'insieme di pagine da controllare va fissato in brainstorming.
- `/api/auth/me` e lo stream SSE `/api/notifications/stream` funzionano come prima.
- Il guard test è rosso su una configurazione che serve un path fuori dall'elenco, verde sul repo; è incluso in `npm test`.
- `npm test`, `test-api.js` (via `scripts/run-tests.sh`) e `doc-paths-guard` sono verdi.

## Scope escluso (confermato dall'utente il 2026-11-11)

- Lo spostamento dei file del sito in una sottocartella o il cambio del montaggio Docker (salvo che il brainstorming lo scelga come mezzo).
- Header di sicurezza HTTP (CSP, HSTS, `X-Frame-Options`…) e configurazione TLS.
- Rate limiting e altre difese nginx non legate a quali file si servono.
- Una revisione dei permessi delle route `/api/`.
- L'export Bitbucket in sé: qui al massimo si condivide la definizione dell'elenco.
- Il viewer `handbook/` (ciclo successivo).
- La conservazione dei log di nginx oltre il ciclo di vita del container.

## Domande aperte per `/brainstorming`

1. **Il mezzo.** Ci sono tre strade:
   - `location` nginx in allowlist con un `location /` finale che risponde 404;
   - un mount Docker solo delle cartelle e dei file del sito invece della root (i file `*.html` sono sciolti in root, quindi un mount per file o una cartella generata);
   - una combinazione delle due.

   Pesano la manutenzione all'arrivo di una pagina nuova e il comportamento con i file non tracciati.
2. **Una definizione condivisa con l'export Bitbucket**, o due definizioni tenute allineate da un test?
3. **`try_files ... /index.html`**: un path sconosciuto oggi restituisce `index.html` (redirect alla pipeline); domani 404. Va bene?
4. **`assets/`**: con o senza autenticazione? Oggi è servito da `location /`, quindi con sessione.
5. **Pagine dev-only** (`test-cases.html` finché esiste, `_db-reset.html`, `_terms-editor.html`): servite come oggi? Il loro accesso per ruolo è controllato dall'app, non da nginx.
6. **Come si scrive il guard test**: legge `nginx.conf` come testo, o interroga un nginx vero sullo stack di test (`scripts/run-tests.sh`) con un elenco di path?
7. **Rotazione dei segreti** in questo ciclo o fuori? Cambiare `JWT_SECRET` disconnette tutti (`docs/ops/production-checklist.md`).
8. **Classe di rischio (§6.1b)**: tocca `nginx.conf`, forse `docker-compose.yml`, e il deploy richiede un riavvio di nginx sullo stack principale.
