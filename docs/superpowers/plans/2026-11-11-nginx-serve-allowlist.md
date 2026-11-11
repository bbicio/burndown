# nginx serve solo i file del sito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-11-nginx-serve-allowlist-design.md`
**Branch:** `nginx-serve-allowlist`
**Risk class:** high-risk — autenticazione e permessi (`nginx.conf` decide chi riceve quale file)

**Goal:** nginx serve solo le pagine `*.html` della root e i `.css`/`.js` di `css/`/`js/` (test esclusi); ogni altro path risponde 404.

**Architecture:** un modulo puro `scripts/lib/nginx-locations.mjs` legge le `location` di `nginx.conf` e ne simula la selezione; `scripts/nginx-serve-guard.test.js` lo applica a ogni file tracciato e a path sensibili non tracciati; `nginx.conf` passa a un elenco di location ammesse con un `location /` finale `return 404`. Montaggio Docker invariato.

**Tech Stack:** nginx (config), vitest, Node ESM.

**Indipendenza dei task:** sequenziali. Task 2 usa il modulo del Task 1; Task 3 documenta il risultato del Task 2.

## Global Constraints

- Il montaggio `./:/usr/share/nginx/html:ro` di `docker-compose.yml` non cambia; nessun file del sito si sposta.
- Autenticazione invariata: login/activate/reset-password e `css/`/`js/` senza `auth_request`; ogni altra pagina con `auth_request /auth-check` e `error_page 401 = @to_login`; `/api/`, SSE, `/auth-check`, `@to_login` identici a oggi.
- Docker sullo stack principale: durante i task mai `docker compose` contro `pdash-*`; il restart di `pdash-nginx` è solo al Gate 4, con backup e conferma dell'utente (spec §4). Mai `-v`/`--volumes`.
- Worktree come dice `PROCESS.md` §6.1b: `git worktree add .claude/worktrees/nginx-serve-allowlist -b nginx-serve-allowlist`, poi `git -C .claude/worktrees/nginx-serve-allowlist branch --show-current` deve stampare `nginx-serve-allowlist`; copiare `.env` dal checkout principale; `npm ci` nella root del worktree una volta.
- Durante i task si lanciano solo i test toccati (`npx vitest run <file>`); il verde completo è quello del Gate 1 di `/finish-cycle`.
- `nginx.conf` e i file con `\` si scrivono solo con Edit/Write, mai via `node -e`/shell.
- Un difetto nuovo trovato strada facendo va in `docs/BACKLOG.md`, non si corregge qui.

## Review Focus

1. **Directory e path senza estensione** (`/css/`, `/js/lib/`, `/docs`) — devono finire nel 404 finale, non in una location che serve file. Test nel Task 2.
2. **Pagine pubbliche protette per errore** — se `auth_request` finisce sulla location delle `.css`/`.js`, il login non carica i suoi script. Test nel Task 2 (`auth` false su css/js e sulle tre pagine pubbliche).
3. **Una pagina della root non protetta** — la location delle `*.html` della root deve avere `auth_request`. Test nel Task 2.
4. **`/favicon.ico` e `/.well-known/...`** — oggi ricevono `index.html` (200), domani 404; nessuna pagina li usa. Test nel Task 2 (404).
5. **Pattern che il parser non sa leggere** — una regex con `{`/`}` romperebbe il parsing a blocchi: il modulo deve lanciare un errore, non restituire location sbagliate. Test nel Task 1.

---

### Task 1: `scripts/lib/nginx-locations.mjs`

**Files:**
- Create: `scripts/lib/nginx-locations.mjs`
- Test: `scripts/lib/nginx-locations.test.js`

**Interfaces:**
- Produces:
  - `parseLocations(confText: string) => Array<{ modifier: '='|'^~'|'~'|'~*'|'', pattern: string, action: 'serve'|'404'|'proxy'|'other', auth: boolean }>` — nell'ordine del file; esclude le location named (`@…`) e quelle con `internal`. `action`: `'404'` se il corpo contiene `return 404`, altrimenti `'proxy'` se contiene `proxy_pass`, altrimenti `'serve'` se contiene `root`, altrimenti `'other'`. `auth`: il corpo contiene `auth_request`. Lancia `Error` se un pattern o un corpo contiene `{` annidato (un blocco `location` dentro un altro o un quantificatore `{n}`).
  - `selectLocation(locations, uri: string) => location | null` — ordine nginx: (1) `=` identico all'uri; (2) fra i prefissi (`''` e `'^~'`) che sono prefisso dell'uri, il più lungo; se è `^~` vince; (3) la prima regex (`~` sensibile, `~*` con flag `i`) che combacia, nell'ordine del file; (4) il prefisso più lungo del passo 2; (5) `null`.

- [ ] **Step 1: Scrivere i test**

`describe('parseLocations')`:
- su un testo con `location = /a { root /x; }`, `location @n { return 302 /l; }`, `location = /i { internal; proxy_pass http://h; }`, `location ~ ^/b\.html$ { auth_request /i; root /x; }`, `location /api/ { proxy_pass http://h; }`, `location / { return 404; }` → 4 location, nell'ordine `=`/`/a`/`serve`/`auth false`, `~`/`^/b\.html$`/`serve`/`auth true`, `''`/`/api/`/`proxy`, `''`/`/`/`404`;
- `location ~ ^/a{2}$ { root /x; }` → lancia;
- sul vero `nginx.conf` del repo → nessun errore e almeno una location `''` con pattern `/`.

`describe('selectLocation')`, su location costruite a mano:
- `=` batte una regex che combacia (`/` con `= /` e `~ ^/.*$`);
- `^~ /s/` batte la regex `~ \.css$` su `/s/a.css`;
- un prefisso semplice `/s/` perde contro la regex `~ \.css$` su `/s/a.css`;
- fra due regex che combaciano vince la prima del file;
- senza regex, vince il prefisso più lungo (`/api/` contro `/` su `/api/x`);
- `~*` combacia ignorando le maiuscole, `~` no;
- nessuna location → `null`.

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run scripts/lib/nginx-locations.test.js`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implementare i due export** in `scripts/lib/nginx-locations.mjs`, con un commento di testa che dice cosa simula e cosa no (nessun `if`, nessuna `location` annidata, nessun `alias`, nessun `try_files` interpretato).

Parsing: togliere i commenti `#…` a fine riga, poi una regex globale su `location\s+(=|\^~|~\*|~)?\s*(\S+)\s*\{([^{}]*)\}`; prima, se il testo di un blocco `location` contiene `{` prima della sua `}` di chiusura, lanciare.

- [ ] **Step 4: Verificare che passi**

Run: `npx vitest run scripts/lib/nginx-locations.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/nginx-locations.mjs scripts/lib/nginx-locations.test.js
git commit -m "test(scripts): nginx location selection model for the serve guard"
```

### Task 2: guard + `nginx.conf` in elenco ammessi

**Files:**
- Create: `scripts/nginx-serve-guard.test.js`
- Modify: `nginx.conf:62-89` (pagine pubbliche, blocco DEV-ONLY, asset pubblici, `location /`)

**Interfaces:**
- Consumes: `parseLocations`, `selectLocation` dal Task 1.

- [ ] **Step 1: Scrivere il guard**

Helper locale `violations(confText, trackedPaths) => string[]`, con `trackedPaths` da `git ls-files -z` (via `execFileSync`). Un path tracciato è **sito** se è `*.html` senza `/`, oppure `css/**.css`, oppure `js/**.js` che non finisce in `.test.js`/`.spec.js`. Per ogni path `p`, `uri = '/' + p`, `loc = selectLocation(parseLocations(confText), uri)`:
- sito → `loc?.action === 'serve'`;
- non sito che inizia con `api/` → `loc?.action === 'proxy'`;
- altro non sito → `loc?.action === '404'`.
Più, sempre attesi `'404'`: `/.env`, `/backups/pdash.dump`, `/.claude/worktrees/x/.env`, `/.git/HEAD`, `/shots/x.png`, `/.superpowers_up.log`, `/node_modules/vue/package.json`, `/favicon.ico`, `/.well-known/x.json`, `/css/`, `/js/lib/`, `/docs`, `/assets/chart.umd.min.js`.
Ogni violazione è una stringa `"<uri> → <azione trovata>, attesa <azione>"`.

Test:
- `violations(nginx.conf, tracked)` è `[]` (messaggio: l'elenco);
- `selectLocation(..., '/')` ha `modifier '='`, `action 'serve'`, `auth true`;
- `auth` è `false` su `/login.html`, `/activate.html`, `/reset-password.html`, `/css/style.css`, `/js/core.js`; `true` su `/pipeline.html`, `/_db-reset.html`;
- su `nginx.conf` con il blocco `location / { … }` finale tolto (sostituzione di stringa nel test), `violations` non è vuoto;
- su `nginx.conf` con `location /docs/ { root /usr/share/nginx/html; }` aggiunto prima di `location /`, `violations` contiene `/docs/BACKLOG.md`.

- [ ] **Step 2: Verificare che fallisca sul `nginx.conf` di oggi**

Run: `npx vitest run scripts/nginx-serve-guard.test.js`
Expected: FAIL, con fra le violazioni `/.env → serve, attesa 404` e `/CLAUDE.md → serve, attesa 404`.

- [ ] **Step 3: Riscrivere `nginx.conf`** secondo la tabella della spec §2:
  - le location di `/auth-check`, `@to_login`, SSE, `/api/` restano identiche;
  - il blocco DEV-ONLY si riduce a `location ~ ^/js/.+\.(test|spec)\.js$ { return 404; }`, posto **prima** della location degli asset;
  - gli asset diventano `location ~ ^/(css|js)/.+\.(css|js)$ { root /usr/share/nginx/html; }`;
  - si aggiungono `location = / { auth_request /auth-check; error_page 401 = @to_login; root /usr/share/nginx/html; try_files /index.html =404; }` e `location ~ ^/[A-Za-z0-9_-]+\.html$ { auth_request /auth-check; error_page 401 = @to_login; root /usr/share/nginx/html; try_files $uri =404; }`;
  - `location / { return 404; }` per ultimo;
  - il commento "PROTECTED APP"/"DEV-ONLY" diventa: nginx monta la root del repo ma serve solo ciò che una location elenca, tutto il resto è 404; il guard è `scripts/nginx-serve-guard.test.js`.

- [ ] **Step 4: Verificare guard e modulo**

Run: `npx vitest run scripts/nginx-serve-guard.test.js scripts/lib/nginx-locations.test.js`
Expected: PASS.

- [ ] **Step 5: Verificare la sintassi con un nginx vero (container usa e getta, non lo stack principale)**

Run: `MSYS_NO_PATHCONV=1 docker run --rm --add-host api:127.0.0.1 -v "$(pwd -W)/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:alpine nginx -t`
Expected: `syntax is ok` e `test is successful`.

- [ ] **Step 6: Commit**

```bash
git add nginx.conf scripts/nginx-serve-guard.test.js
git commit -m "fix(nginx): serve only site files, everything else 404"
```

### Task 3: documentazione e backlog

**Files:**
- Modify: `CLAUDE.md:64`, `ARCHITECTURE.md:1048`, `docs/ops/production-checklist.md` (sezione "Network and proxy"), `docs/BACKLOG.md` (riga nuova in fondo alla tabella)

- [ ] **Step 1: `CLAUDE.md:64`** — "…`vitest.config.js`, and any `*.test.js`/`*.spec.js` file are explicitly denied in `nginx.conf`." diventa: "…never served: `nginx.conf` serves only the root `*.html` pages and the `.css`/`.js` files under `css/` and `js/` (tests excluded); every other path answers 404 (`scripts/nginx-serve-guard.test.js`)."
- [ ] **Step 2: `ARCHITECTURE.md:1048`** — `← denies dev-only toolchain artifacts even though it bind-mounts the repo root` diventa `← serves only the listed site paths even though it bind-mounts the repo root`.
- [ ] **Step 3: checklist** — in "Network and proxy" una voce: `- [ ] **Only site files are served.** Signed in, `/.env`, `/backups/` and `/CLAUDE.md` answer 404 (`scripts/nginx-serve-guard.test.js` pins the rule). Failure: the browser downloads the file.`
- [ ] **Step 4: backlog** — riga `B-448` (o il numero libero successivo all'ultimo): i quattro file di `assets/` contengono `Host not in allowlist`, nessuna pagina li carica, nginx non li serve più; da cancellare. Evidenza: `git grep -n "assets/" -- '*.html' 'js/*.js'` → vuoto, 2026-11-11.
- [ ] **Step 5: guard documentali**

Run: `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js scripts/architecture-guard.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md ARCHITECTURE.md docs/ops/production-checklist.md docs/BACKLOG.md
git commit -m "docs: nginx serves only site files"
```

## Criteri di accettazione

Quelli della spec (`docs/superpowers/specs/2026-11-11-nginx-serve-allowlist-design.md`, "Criteri di accettazione", 1-8); il 6 è coperto dal Task 2, gli altri si verificano al Gate 2 (stack di branch, `curl` con e senza cookie) e al Gate 4 (stack principale).

## Decisioni aperte

1. **Verifica della sintassi con `nginx -t` in un container `nginx:alpine` usa e getta (Task 2, Step 5).** Alternativa scartata: affidarsi solo allo stack di branch del Gate 2. Perché: un errore di sintassi si vede in pochi secondi, prima del commit, senza toccare nessuno stack.
2. **Il guard considera `api/**` tracciato come atteso `proxy`, non `404`.** Alternativa scartata: pretendere 404 anche lì. Perché: `/api/` è del proxy per costruzione; che l'API non serva file lo prova il `curl` del criterio 1.
