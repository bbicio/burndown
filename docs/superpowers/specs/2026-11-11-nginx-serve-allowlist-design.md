# nginx serve solo i file del sito — design spec

**Date:** 2026-11-11
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-11-nginx-serve-allowlist-brief.md`
**Scenario:** 2 (evoluzione)

nginx serve solo le pagine `*.html` della root e i `.css`/`.js` di `css/` e `js/` (test esclusi); ogni altro path risponde 404, anche per un utente autenticato e anche per un file aggiunto in futuro. Un guard test in `npm test` lo dimostra su ogni file tracciato.

## 1. Fatti verificati nel codice (a `b625a56`)

- `docker-compose.yml:101` monta la root del repo in `/usr/share/nginx/html`; `nginx.conf:82-89` (`location /`, `auth_request` + `try_files $uri $uri/ /index.html`) serve ogni file a ogni utente con sessione valida. Verificato a mano dall'utente su `/.env`.
- `nginx.conf:66-73` è l'unica protezione: 404 per `node_modules/`, i test sotto `js/` e `scripts/`, `package.json`, `package-lock.json`, `vitest.config.js`.
- `nginx.conf:76-78` serve `css/` e `js/` senza autenticazione (servono a login, attivazione, reset).
- I file tracciati sotto `css/` e `js/` sono solo `.css` e `.js` (`git ls-files css js | grep -vE '\.(css|js)$'` → vuoto).
- I quattro file di `assets/` contengono il testo `Host not in allowlist` e nessuna pagina né script li cita (`git grep -n "assets/" -- '*.html' 'js/*.js'` → vuoto).
- `scripts/run-tests.sh` non avvia nginx: `test-api.js` chiama `api:3000` direttamente.
- Il log di `pdash-nginx` (dal 2026-11-10 21:16 UTC) ha un solo 200 su un file sensibile: `/.env`, il test dell'utente del 2026-11-11 18:04. Riceve anche richieste `/C:/Users/.../Git/<pagina>.html` (conversione dei path di Git Bash), oggi servite dal fallback su `index.html`.

## 2. `nginx.conf`

Il montaggio Docker non cambia. Le location, in quest'ordine:

| Location | Comportamento | Autenticazione |
|---|---|---|
| `= /auth-check`, `@to_login`, `= /api/notifications/stream`, `/api/` | invariati | invariata |
| `~ ^/(login\|activate\|reset-password)\.html$` | serve il file | no |
| `~ ^/js/.+\.(test\|spec)\.js$` | `return 404` | — |
| `~ ^/(css\|js)/.+\.(css\|js)$` | serve il file | no |
| `= /` | serve `/index.html` | sì (`auth_request`, 401 → `@to_login`) |
| `~ ^/[A-Za-z0-9_-]+\.html$` | serve il file, `try_files $uri =404` | sì |
| `/` | `return 404` | — |

- Il blocco "DEV-ONLY TOOLCHAIN" si riduce alla sola regola dei test sotto `js/`; le altre diventano superflue per il `location /` finale. Il commento di testa spiega la regola: si serve solo ciò che una location elenca.
- Il fallback `try_files … /index.html` sparisce: un path sconosciuto risponde 404.
- Un path sotto `/api/` resta del proxy: l'API non serve file.

## 3. Guard

- **`scripts/lib/nginx-locations.mjs`** (puro): `parseLocations(confText)` restituisce i blocchi `location` del blocco `server` con modificatore (`=`, `^~`, `~`, `~*`, nessuno), pattern e azione (`serve` se il blocco ha `root`; `404` se ha `return 404`; `proxy` se ha `proxy_pass`; `other` altrimenti). `selectLocation(locations, uri)` applica l'ordine di nginx: corrispondenza esatta `=`; altrimenti il prefisso più lungo, e se è `^~` vince; altrimenti la prima regex che combacia nell'ordine del file; altrimenti il prefisso più lungo. Le location `internal`/named (`@…`) non partecipano.
- **`scripts/nginx-serve-guard.test.js`** (vitest, in `npm test`):
  - ogni pagina `*.html` tracciata nella root e ogni `.css`/`.js` tracciato sotto `css/` e `js/` che non sia `*.test.js`/`*.spec.js` → `serve`;
  - ogni altro file tracciato (`git ls-files`) → `404`, oppure `proxy` se il path inizia con `api/`;
  - una lista fissa di path non tracciati → `404`: `/.env`, `/backups/pdash.dump`, `/.claude/worktrees/x/.env`, `/.git/HEAD`, `/shots/x.png`, `/.superpowers_up.log`, `/node_modules/vue/package.json`;
  - `/` → la location `= /`;
  - test del modulo stesso su configurazioni di prova: precedenza `=` > `^~` > regex > prefisso, ordine fra regex.

## 4. Deploy sullo stack principale

`nginx.conf` è montato come singolo file: dopo il merge il container può continuare a leggere il vecchio. Al Gate 4 di `/finish-cycle`, dopo il merge e solo con la conferma esplicita dell'utente: `scripts/backup-db.sh`, poi `docker compose restart nginx`. Mai `down`, mai `-v`/`--volumes`; se il restart non si comporta come previsto ci si ferma e si chiede. Poi `curl` su `/.env` con il cookie → 404.

## 5. Documentazione

- `CLAUDE.md` → "Testing & tooling": la frase "explicitly denied in `nginx.conf`" diventa la regola nuova (nginx serve solo i path elencati; un file nuovo fuori da `css/`, `js/` e dalle pagine `.html` della root non è servito).
- `docs/ops/production-checklist.md`: una voce "Only site files are served" con il controllo (`/.env` e `/backups/` rispondono 404 da autenticati).
- `ARCHITECTURE.md` §7, directory tree: la riga di `nginx.conf` ("denies dev-only toolchain artifacts even though it bind-mounts the repo root") diventa "serves only the listed site paths even though it bind-mounts the repo root".
- `docs/BACKLOG.md`: una riga per cancellare i file corrotti di `assets/`.
- Il brief Bitbucket non cambia: le sue domande 1-2 su `docker-compose.yml`/`nginx.conf` restano sue.

## Criteri di accettazione

1. **Path sensibili da autenticato** — sullo stack di branch, con il cookie di un utente autenticato, rispondono 404 `/.env`, `/.env.example`, `/.git/HEAD`, `/.claude/settings.json` (o un altro file presente sotto `.claude/`), `/backups/` più il nome di un dump presente, `/api/src/index.js` (404 dall'API, non il file), `/scripts/backup-db.sh`, `/docs/BACKLOG.md`, `/CLAUDE.md`, `/TEST_CASES.md`, `/docker-compose.yml`, `/nginx.conf`, `/test-api.js`, `/package.json`, `/js/lib/money.test.js`, `/assets/chart.umd.min.js`.
2. **Path sensibili senza cookie** — gli stessi path rispondono 404 o 302 verso `/login.html`; in nessun caso arriva il contenuto del file.
3. **Pagine pubbliche** — senza cookie `/login.html`, `/activate.html`, `/reset-password.html` e i loro `css/`/`js/` rispondono 200.
4. **App intatta** — con il cookie, `/` porta alla pipeline e Pipeline, Portfolio, Planning, Master Data, Timesheets, User Admin, Team, Attribute Lists, Profile, Privacy Notice, DB Reset si aprono senza richieste fallite nella console di rete.
5. **API e notifiche** — `/api/auth/me` risponde e il pannello notifiche si aggiorna (SSE) come prima.
6. **Guard** — `scripts/nginx-serve-guard.test.js` è verde sul repo e rosso se si rimuove la location finale `return 404` o se si aggiunge `location /docs/ { root … }`.
7. **Suite** — `npm test` e `scripts/run-tests.sh` verdi.
8. **Stack principale** — dopo il restart confermato al Gate 4, `/.env` con il cookie risponde 404 su `http://localhost`.

## Scope escluso esplicitamente

- Spostare i file del sito o cambiare il montaggio Docker.
- Header di sicurezza HTTP, TLS, rate limiting.
- Revisione dei permessi delle route `/api/`.
- L'export Bitbucket.
- Il viewer `handbook/`.
- La conservazione dei log di nginx.
- La rotazione dei segreti di `.env`.
- La cancellazione dei file di `assets/` (riga di backlog).

## Decisioni aperte

1. **Elenco ammessi dentro `nginx.conf`, montaggio invariato.** Alternativa scartata: montare solo i path del sito (un mount per pagina, compose da toccare a ogni pagina nuova) o spostare le pagine in una sottocartella. Perché: una modifica in un solo file e il `location /` finale copre i file futuri.
2. **Nessuna definizione condivisa con l'export Bitbucket.** Alternativa scartata: un file di elenco unico. Perché: Bitbucket include `api/`, nginx non deve servirlo; gli insiemi sono diversi.
3. **`assets/` non è servito.** Alternativa scartata: servirlo come nel brief. Perché: contiene file corrotti che nessuno carica.
4. **Un path sconosciuto risponde 404, non `index.html`.** Alternativa scartata: tenere il fallback. Perché: nessuna pagina ne dipende e un link sbagliato diventa visibile.
5. **Le pagine dev (`test-cases.html`, `_db-reset.html`, `_terms-editor.html`) restano servite via la regola delle `.html` della root.** Alternativa scartata: regole per ruolo in nginx. Perché: il ruolo lo controlla l'app; nginx per ruolo arriva con il ciclo handbook.
6. **Il guard simula in JS la selezione delle location di nginx.** Alternativa scartata: un nginx vero dentro `run-tests.sh`, o un test che fissa il testo delle location. Perché: puro e veloce, copre ogni file tracciato; il comportamento reale lo prova il `curl` del Gate 2.
7. **Nessuna rotazione dei segreti in questo ciclo.** Alternativa scartata: ruotare `JWT_SECRET` e gli altri. Perché: app solo locale, unico accesso registrato a `/.env` è il test dell'utente; il report la segnala come azione facoltativa.
8. **Restart di nginx sullo stack principale chiesto al Gate 4, con backup prima.** Alternativa scartata: `nginx -s reload` automatico. Perché: le regole di `CLAUDE.md` lo vogliono confermato, e il reload non garantisce che il file montato sia quello nuovo.
