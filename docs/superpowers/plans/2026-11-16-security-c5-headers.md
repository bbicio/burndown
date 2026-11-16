# Header di sicurezza e Content-Security-Policy su nginx (S-06) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni risposta di nginx porta gli header di §2 della spec, con la CSP bloccante dopo una misura in Report-Only sullo stack di branch, e un guard test fallisce quando una `location` perde gli header o una pagina carica da un'origine che la policy non ammette.

**Architecture:** gli header stanno una volta sola a livello `server` di `nginx.conf`. Il nuovo `scripts/security-headers-guard.test.js` legge `nginx.conf` con `scripts/lib/nginx-locations.mjs` (blocchi) e un nuovo `scripts/lib/nginx-headers.mjs` (`add_header`, CSP), e le risorse esterne delle pagine con un nuovo `scripts/lib/cdn-urls.mjs`, in cui passa la lettura che oggi sta dentro `scripts/cdn-integrity-guard.test.js`. La CSP entra come `Content-Security-Policy-Report-Only`, si misura sul branch, poi diventa `Content-Security-Policy`.

**Tech Stack:** nginx (`nginx:alpine`), vitest (guard), `scripts/test-branch.sh`, `scripts/shoot.mjs`, Chrome via gli strumenti `claude-in-chrome` (console).

**Spec:** `docs/superpowers/specs/2026-11-16-security-c5-headers-design.md`
**Branch:** `security-c5-headers`
**Risk class:** high-risk — file condivisi caricati da più pagine: `nginx.conf` serve e protegge ogni pagina, e una CSP errata le rompe tutte (§6.1b)

**Indipendenza dei task:** i task non sono indipendenti (il 2 usa i lettori del 1, il 3 cambia la policy e la costante del guard del 2, il 4 rivede il risultato di tutti): esecuzione nativa (§6.1). Il worktree si crea come da §6.1b (`git worktree add .claude/worktrees/security-c5-headers -b security-c5-headers`), poi si copia `.env` dal checkout principale e si esegue `npm ci` in radice.

## Global Constraints

- Header a livello `server`, ognuno con `always`, valori di partenza esatti:
  - `Content-Security-Policy` (nel Task 2 come `Content-Security-Policy-Report-Only`): `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdn.sheetjs.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: blob: https://ik.imagekit.io; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: same-origin`
  - `Strict-Transport-Security: max-age=15552000`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - più `server_tokens off;` e `proxy_hide_header X-Powered-By;`
- Nessun blocco `location` (nominati e `internal` compresi) contiene `add_header` o `proxy_hide_header`.
- Una correzione della CSP emersa dalla misura (Task 3) si riporta all'utente prima di renderla bloccante.
- Solo stack di branch. Nessun `docker compose` né `nginx -s reload` sullo stack principale durante l'esecuzione; il reload di `pdash-nginx` è al Gate 4 di `/finish-cycle`, con conferma esplicita dell'utente, mai `-v`/`--volumes`. Lo stack di branch usa le porte fisse di `scripts/test-branch.sh`: se è già su per un'altra sessione, ci si ferma e si chiede.
- `scripts/nginx-serve.test.js` invariato e verde; i test di `scripts/cdn-integrity-guard.test.js` invariati e verdi.
- Nessun `js/`/`css/` versionato è toccato: nessun `?v=N` da aggiornare. Nessuna pagina HTML è modificata, salvo le prove a mano del Task 2, che si annullano prima del commit.
- Codice con `\` scritto con Edit/Write, mai con `node -e` o script di shell.

## Review Focus

1. Una `location` futura con il proprio `add_header` (per esempio `Cache-Control` sugli asset) azzera in silenzio tutti gli header di sicurezza di quella `location`: il guard è rosso (Task 2).
2. Una risposta d'errore (404 del catch-all, 302 verso `login.html`, 403 di `/admin-check`) porta gli header come una 200: è `always` a garantirlo, il guard lo pretende e il Task 3 lo verifica con `curl` (Task 2, Task 3).
3. Una sorgente jolly (`*`, `https:`, `http:`, `data:` in `script-src`) svuota l'allowlist ma fa passare ogni pagina: il guard la rifiuta in `script-src` e `style-src`, e `data:` in `script-src` (Task 2).
4. Un tag CDN scritto su più righe, con `rel` dopo `href`, o un `<link rel="preconnect">` da un'origine nuova: il lettore lo riconosce, e un tipo di `<link>` non classificato fa fallire il guard invece di passare (Task 1, Task 2).
5. Mermaid in `help.html` (caricato su richiesta, disegna SVG con `<style>` interni) e un download `blob:`: nessuna violazione con la policy bloccante (Task 3).

---

### Task 1: Lettori condivisi delle risorse esterne

**Files:**
- Create: `scripts/lib/cdn-urls.mjs`
- Modify: `scripts/cdn-integrity-guard.test.js` (righe 44-84: costanti, `loaderApplies`, `scan`, `scopeFiles` passano al modulo; restano i test)
- Modify: `docs/BACKLOG.md` (riga B-494: `Where` e `Verified how` puntano al nuovo modulo)
- Test: `scripts/security-headers-guard.test.js` (creato qui con il solo blocco dei lettori)

**Interfaces:**
- Produces, da `scripts/lib/cdn-urls.mjs`:
  - `CDN_HOSTS: string[]` — invariato (`['cdn.jsdelivr.net', 'unpkg.com', 'cdn.sheetjs.com']`)
  - `scanCdnUrls(src: string, { html?: boolean }): { url, inTag, integrity, errors }[]` — l'attuale `scan`, spostata senza cambiare comportamento
  - `scopeFiles(root: string): string[]` — l'attuale `scopeFiles`, con la radice passata
  - `externalResources(src: string): { kind: 'script'|'stylesheet'|'icon'|'other', url: string }[]` — ogni `<script src="https://…">` e `<link href="https://…">` della pagina, qualunque host; `kind` da nome del tag e `rel` (`stylesheet`, `icon`; ogni altro `rel` è `other`). Usa lo stesso `TAG_RE` di `scanCdnUrls`.

- [ ] **Step 1: Test di `externalResources`** in `scripts/security-headers-guard.test.js`, `describe('externalResources')`:
  - `<script defer src="https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js" integrity="sha384-x" crossorigin="anonymous"></script>` → `[{ kind: 'script', url: 'https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js' }]`
  - `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">` → `kind: 'stylesheet'`
  - tag su tre righe con `href` prima di `rel="icon"` → `kind: 'icon'`
  - `<link rel="preconnect" href="https://fonts.example">` → `kind: 'other'`
  - `<script src="js/core.js?v=3"></script>` e `<a href="https://example.com">` → `[]`
- [ ] **Step 2:** `npx vitest run scripts/security-headers-guard.test.js` → FAIL (modulo inesistente).
- [ ] **Step 3: Crea `scripts/lib/cdn-urls.mjs`** spostando da `scripts/cdn-integrity-guard.test.js` costanti, `escapeRe`, `loaderApplies`, `scan` (esportata come `scanCdnUrls`) e `scopeFiles`, più `externalResources`. Il guard del ciclo 4 importa dal modulo; il suo header di commento resta nel test e cita il modulo per la lettura. Header del modulo: cosa legge e cosa no, nello stile di `scripts/lib/nginx-locations.mjs`.
- [ ] **Step 4:** `npx vitest run scripts/security-headers-guard.test.js scripts/cdn-integrity-guard.test.js` → PASS, con lo stesso numero di test del guard del ciclo 4 di prima dello spostamento.
- [ ] **Step 5: B-494.** In `docs/BACKLOG.md` la riga B-494 cita `scripts/cdn-integrity-guard.test.js` lines 51-52: aggiorna `Where` e il comando di `Verified how` al nuovo file e alle nuove righe (`grep -n "const TAG_RE\|const EXACT_RE" scripts/lib/cdn-urls.mjs`), stato invariato `open`.
- [ ] **Step 6:** `npx vitest run scripts/doc-paths-guard.test.js` → PASS.
- [ ] **Step 7: Commit**

```bash
git add scripts/lib/cdn-urls.mjs scripts/cdn-integrity-guard.test.js scripts/security-headers-guard.test.js docs/BACKLOG.md
git commit -m "test(csp): share the CDN reader, read external resources by kind (S-06)"
```

---

### Task 2: Guard degli header e header in `nginx.conf` (CSP in Report-Only)

**Files:**
- Create: `scripts/lib/nginx-headers.mjs`
- Modify: `scripts/lib/nginx-locations.mjs` (nuove esportazioni, `parseLocations`/`selectLocation` invariate)
- Modify: `nginx.conf` (blocco `server`, prima della prima `location`)
- Test: `scripts/security-headers-guard.test.js`

**Interfaces:**
- Consumes: `externalResources`, `scanCdnUrls`, `scopeFiles` (Task 1).
- Produces:
  - `scripts/lib/nginx-locations.mjs`: `locationBlocks(confText): { pattern: string, body: string }[]` — ogni blocco `location`, nominati e `internal` compresi; `serverLevel(confText): string` — il testo del blocco `server` senza i blocchi `location` e senza commenti. Stessa politica di `parseLocations`: config illeggibile → `throw`.
  - `scripts/lib/nginx-headers.mjs`: `addHeaders(text): { name: string, value: string, always: boolean }[]` (valore tra virgolette doppie, singole o senza); `parseCsp(value): Map<string, string[]>` (direttive in minuscolo, sorgenti nell'ordine scritto).
  - Nel guard: `const CSP_HEADER = 'Content-Security-Policy-Report-Only'` — il Task 3 lo cambia.

- [ ] **Step 1: Test dei lettori**, `describe('nginx readers')`:
  - `addHeaders('add_header X-Frame-Options "DENY" always;')` → `[{ name: 'X-Frame-Options', value: 'DENY', always: true }]`; senza `always` → `always: false`; valore senza virgolette letto uguale.
  - `parseCsp("default-src 'self'; script-src 'self' https://a.example ;")` → `default-src: ["'self'"]`, `script-src: ["'self'", 'https://a.example']`.
  - `locationBlocks` su una config con `location @to_login { return 302 /login.html; }` e una `location = /x { internal; }` le restituisce entrambe; `serverLevel` di `server { add_header A "1" always; location / { add_header B "2"; } }` contiene `A` e non `B`.
- [ ] **Step 2: Test sul `nginx.conf` reale**, `describe('nginx.conf security headers')`:
  - `serverLevel` porta ognuno degli header di Global Constraints con `always: true` e il valore esatto (la CSP sotto il nome `CSP_HEADER`); nessun header sotto l'altro nome della CSP;
  - `serverLevel` contiene `server_tokens off;` e `proxy_hide_header X-Powered-By;`;
  - nessun `locationBlocks(...).body` contiene `add_header` o `proxy_hide_header` (il messaggio nomina la `location`);
  - CSP: `object-src` = `["'none'"]`, `base-uri` = `["'self'"]`, `form-action` = `["'self'"]`, `frame-ancestors` = `["'none'"]`, `default-src` = `["'self'"]`, `connect-src` = `["'self'"]`; nessuna sorgente `*`, `https:`, `http:` in `script-src` né `style-src`; nessun `data:` in `script-src`;
  - risorse: per ogni pagina e file `js/` di `scopeFiles(ROOT)`, ogni `externalResources` di `kind` `script` ha l'origine (`new URL(url).origin`) in `script-src`, `stylesheet` in `style-src`, `icon` in `img-src`; `other` fallisce con il path e l'URL; ogni `scanCdnUrls(...)` con `inTag: false` ha l'origine in `script-src`.
- [ ] **Step 3:** `npx vitest run scripts/security-headers-guard.test.js` → FAIL (lettori assenti, header assenti).
- [ ] **Step 4: Implementa** `locationBlocks`/`serverLevel`, `scripts/lib/nginx-headers.mjs`, e gli header in `nginx.conf` a livello `server` con un commento che dice la regola (nessun `add_header`/`proxy_hide_header` in una `location`, e perché) e rimanda al guard. Header di commento di `scripts/security-headers-guard.test.js`: perché esiste (S-06), le regole, e i limiti (non vede `if`, `include`, risorse caricate da CSS o da `fetch`; i caricatori lazy si assumono script).
- [ ] **Step 5:** `npx vitest run scripts/security-headers-guard.test.js scripts/nginx-serve.test.js scripts/cdn-integrity-guard.test.js` → PASS.
- [ ] **Step 6: Rosso a mano, una volta ciascuno, poi annulla:** un `add_header Cache-Control "no-store";` dentro `location = /` → rosso, con la `location` nominata; un `<script src="https://evil.example/x.js"></script>` in `login.html` → rosso, con la pagina e l'URL. `git status` pulito su `login.html` dopo l'annullamento.
- [ ] **Step 7: Commit**

```bash
git add nginx.conf scripts/lib/nginx-headers.mjs scripts/lib/nginx-locations.mjs scripts/security-headers-guard.test.js
git commit -m "feat(nginx): security headers at server level, CSP report-only, guard (S-06)"
```

---

### Task 3: Misura sul branch, CSP bloccante, nota per la produzione

**Files:**
- Modify: `nginx.conf` (nome dell'header CSP, eventuali correzioni della policy)
- Modify: `scripts/security-headers-guard.test.js` (`CSP_HEADER`, eventuali valori)
- Create: `docs/ops/security-headers.md`
- Modify: `docs/BACKLOG.md` (due righe nuove)

- [ ] **Step 1: Stack di branch.** `scripts/test-branch.sh status`; se `up` per un'altra sessione, ci si ferma e si chiede. Altrimenti `scripts/test-branch.sh up`. Dopo ogni modifica a `nginx.conf`: `docker exec pdash-nginx-<branch> nginx -s reload` (il nome con `docker ps --filter name=pdash-nginx-`), mai sullo stack principale.
- [ ] **Step 2: Misura in Report-Only.** Con gli strumenti `claude-in-chrome` (l'utente accede su `http://localhost:8081` se serve), apri `pipeline.html`, `costgrid.html` con una proposta, `planning.html`, `portfolio.html` (grafico Chart.js), `help.html` con un documento con diagramma Mermaid, `login.html`; `read_console_messages` con pattern `Content.Security.Policy|Refused`. Esercita anche un export (download `blob:`) e un import xlsx. Annota ogni violazione: pagina, direttiva, sorgente.
- [ ] **Step 3: Correzioni.** Se la misura chiede di cambiare la policy, presenta all'utente la modifica e il perché, e applicala solo dopo il suo sì, in `nginx.conf` e nei valori del guard insieme. Nessuna violazione → nessuna modifica, e lo si dice.
- [ ] **Step 4: Bloccante.** `CSP_HEADER = 'Content-Security-Policy'` nel guard e lo stesso nome in `nginx.conf`; `npx vitest run scripts/security-headers-guard.test.js` → PASS; reload del nginx di branch.
- [ ] **Step 5: Ripeti lo Step 2** con la policy bloccante → zero violazioni, pagine funzionanti. PNG con `node scripts/shoot.mjs --base http://localhost:8081 --url <pagina> --out <scratchpad>/shots/<pagina> --widths 1440` per le sei pagine, con le credenziali come da `docs/scripts/shoot.md`; leggi i PNG.
- [ ] **Step 6: Header con `curl -sI`** su `http://localhost:8081`: `/pipeline.html` senza cookie (302) e con il cookie `pdash_token` (200), `/login.html`, `/js/core.js`, `/handbook/manifest.json`, `/nonexistent` (404). Ognuna mostra gli header di Global Constraints, `Server: nginx` senza versione, nessun `X-Powered-By`; `curl -si http://localhost:8081/api/auth/me` (401) senza `X-Powered-By`.
- [ ] **Step 7: Clickjacking.** Nella scratchpad, un file HTML con `<iframe src="http://localhost:8081/admin.html">` servito da un server `node:http` usa e getta su una porta libera (non 5433/3001/8081/8082/8083); aperto con `claude-in-chrome`, l'iframe non mostra la pagina e la console riporta il rifiuto per `frame-ancestors`. Il server si chiude dopo.
- [ ] **Step 8: `docs/ops/security-headers.md`:** gli header attesi (rimando a `nginx.conf` come fonte, non una copia dei valori), il comando `curl -sI https://<host>/login.html` da lanciare sull'URL di produzione, e la regola: se lì mancano, la causa è un livello davanti a nginx e vanno replicati lì. Regole di `CLAUDE.md` «Writing documentation».
- [ ] **Step 9: `docs/BACKLOG.md`**, due righe con id nuovi dopo l'ultimo usato, `open`, `Verified how` con un comando: rate limit in nginx (`limit_req` sugli endpoint di autenticazione) quando la topologia di produzione è nota, con `real_ip` sul proxy reale (`grep -n "limit_req" nginx.conf` → nessuna riga); CSP stretta (nonce, niente `'unsafe-inline'`/`'unsafe-eval'`, Vue senza compilatore di template) (`grep -n "unsafe-eval" nginx.conf` → una riga).
- [ ] **Step 10:** `npm test` → tutti verdi.
- [ ] **Step 11: Commit**

```bash
git add nginx.conf scripts/security-headers-guard.test.js docs/ops/security-headers.md docs/BACKLOG.md
git commit -m "feat(nginx): enforce the CSP after measuring it on the branch stack (S-06)"
```

Lo stack di branch resta su: lo smonta `/finish-cycle` al Gate 2.

---

### Task 4: `/security-review` sul branch

**Files:** nessuna modifica prevista.

- [ ] **Step 1: Run `/security-review`** sul branch `security-c5-headers`, con i test del Task 3 verdi. Controlla che S-06 non si ripresenti e che il ciclo non ne introduca di nuovi.
- [ ] **Step 2: Disposizione.** Un finding nuovo si propone come Brief a sé (guardia dello Scenario 3), salvo diversa decisione dell'utente; un difetto del codice di questo ciclo si corregge nel branch con il test mirato e si riesegue la review. `/finish-cycle` non esegue questo passo da sé.
- [ ] **Step 3: Note per `/sync-docs`** (le scrive la procedura, non questo piano): la riga di `scripts/security-headers-guard.test.js` e di `scripts/lib/cdn-urls.mjs` nel blocco File structure di `CLAUDE.md`; il rimando a `docs/ops/security-headers.md`; al Gate 4 il reload di `pdash-nginx` sullo stack principale (`docker exec pdash-nginx nginx -s reload`) con conferma dell'utente.

---

## Decisioni aperte

1. **La console si legge con gli strumenti `claude-in-chrome`, i PNG con `scripts/shoot.mjs`.** Alternativa scartata: aggiungere a `shoot.mjs` un'opzione che salvi i messaggi di console. Perché: `shoot.mjs` non raccoglie la console oggi, e cambiarlo è lavoro su uno strumento di processo fuori dal ciclo; Chrome con DevTools lo fa già.
2. **Report-Only e bloccante in due commit, con il nome dell'header in una costante del guard.** Alternativa scartata: guard che accetta entrambi i nomi. Perché: dopo il merge il guard deve pretendere la CSP bloccante, e una costante cambiata nel Task 3 lo rende esplicito.
3. **Il guard fissa le direttive di chiusura, la copertura delle origini e l'assenza di jolly, non la stringa CSP intera.** Alternativa scartata: confronto esatto della stringa. Perché: un'origine nuova aggiunta per una pagina nuova non deve chiedere di riscrivere un test che non dice cosa protegge; ciò che protegge (chiusure, niente jolly) è fissato. Gli altri header invece sono fissati al valore esatto.
4. **Anche `proxy_hide_header` è vietato dentro una `location`.** Alternativa scartata: vietare solo `add_header` come dice il Brief. Perché: ha la stessa regola di eredità, e una `location` con il proprio `proxy_hide_header` ridarebbe `X-Powered-By`.
5. **I caricatori lazy si assumono script (`script-src`).** Alternativa scartata: classificarli dal codice che li carica. Perché: l'unico oggi è Mermaid, un `<script>`; il limite è scritto nell'header del guard.
6. **La lettura degli URL CDN passa in `scripts/lib/cdn-urls.mjs`, e B-494 vi si sposta.** Alternativa scartata: importare dal file di test del ciclo 4. Perché: un file `.test.js` non è un modulo da cui importare, e i lettori condivisi stanno in `scripts/lib/` come `scripts/lib/live-docs.mjs`.
