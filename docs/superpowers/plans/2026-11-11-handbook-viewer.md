# Handbook viewer (ciclo 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-11-handbook-viewer-design.md`
**Branch:** `handbook-viewer`
**Risk class:** high-risk — autenticazione e permessi (nuova route `admin-check`, `auth_request` per ruolo in `nginx.conf`)

**Goal:** tutta la documentazione servita dall'app vive in `handbook/` e si legge da una sola pagina, `help.html`; i documenti riservati sono negati ai `user` da nginx.

**Architecture:** una route `GET /api/auth/admin-check` alimenta un secondo `auth_request` di nginx su `handbook/restricted/`. La logica pura del viewer (visibilità, risoluzione dell'id, stato dei test case, `docProblems`) sta in `js/lib/handbook.js`, condivisa con `scripts/handbook-guard.test.js`. `help.html` è una pagina Vue con due renderer (markdown via `marked` + `mermaid` da CDN; test case via `test-cases-parse.js`).

**Tech Stack:** Express, nginx, Vue 3 (CDN), marked 15.0.12 e mermaid 11.4.1 (jsDelivr), vitest, node:test.

**Indipendenza dei task:** Task 1, 2, 4 e 6 sono indipendenti fra loro. Task 3 usa `docProblems` del Task 2. Task 5 usa il Task 2 e i path del Task 3. Task 7 documenta l'esito di tutti e va per ultimo.

## Global Constraints

- Worktree (`PROCESS.md` §6.1b): `git worktree add .claude/worktrees/handbook-viewer -b handbook-viewer`, poi `git -C .claude/worktrees/handbook-viewer branch --show-current` deve stampare `handbook-viewer`; copiare `.env` dal checkout principale; `npm ci` nella root e in `api/` del worktree, una volta.
- Docker: durante i task mai `docker compose` contro lo stack principale (`pdash-*`). La verifica sullo stack si fa con `scripts/test-branch.sh`. Il reload di `pdash-nginx` sullo stack principale si fa solo dopo il merge, con `scripts/backup-db.sh` e la conferma dell'utente. Mai `-v`/`--volumes`.
- Testi dell'interfaccia in inglese. Nessun build step a runtime; librerie esterne solo da CDN, versioni esatte: `https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js`, `https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs`.
- La chiave `localStorage` `pdash_test_state_v1` non cambia.
- Ogni file versionato che cambia contenuto riceve un nuovo `?v=N`, uguale in tutti i riferimenti del repo (`CLAUDE.md` → Cache-busting).
- File con `\` (regex, `nginx.conf`) solo con Edit/Write, mai via `node -e` o shell.
- HTML del repo solo con Edit/Write, mai con `Get-Content`/`Set-Content` (BOM).
- Durante i task si lanciano solo i test toccati (`npx vitest run <file>`, o `node --test <file>` da `api/`); il verde completo è quello del Gate 1.
- Un difetto nuovo trovato strada facendo va in `docs/BACKLOG.md`, non si corregge qui.

## Review Focus

1. **Sessione scaduta mentre il viewer è aperto** — il fetch del manifest o di un documento riceve la pagina di login (HTML, 200): il viewer mostra l'errore con l'invito ad accedere, non HTML di login renderizzato come markdown. Test nel Task 2 (`isHandbookPayload`).
2. **Un `user` apre `?doc=architecture` da un link condiviso** — si apre il primo documento visibile con "Document not available", mai il fetch del file riservato. Test nel Task 2 (`resolveDoc`).
3. **Un documento senza blocchi mermaid** — `mermaid` non viene importato. Test nel Task 2 (`hasMermaid`).
4. **Un fence ```` ``` ```` aperto dentro un blocco ```` ~~~ ```` o con più backtick** — non deve chiudere né aprire un blocco per errore. Test nel Task 2 (`docProblems`).
5. **Varianti di path verso i riservati** (`/handbook/RESTRICTED/…`, nome 8.3, `/handbook/x.md`) — 404, mai il file. Test nel Task 4.

---

### Task 1: route `GET /api/auth/admin-check`

**Files:**
- Modify: `api/src/routes/auth.js` (dopo `GET /me`, riga ~138)
- Modify: `test-api.js` (sezione `Auth`, dopo i test `A-06`)
- Modify: `ARCHITECTURE.md` (tabella delle route auth, dopo la riga di `GET /api/auth/me`, ~657)

**Interfaces:**
- Produces: `GET /api/auth/admin-check` → `204` (admin/sysadmin), `403` (`user`), `401` (senza sessione). Usata dal Task 4.

- [ ] **Step 1: test di integrazione in `test-api.js`**

```js
ok((await api('GET', '/api/auth/admin-check')).status === 401, 'A-07 admin-check without session → 401');
ok((await api('GET', '/api/auth/admin-check', null, adminCookie)).status === 204, 'A-07 admin-check as admin → 204');
ok((await api('GET', '/api/auth/admin-check', null, sysadminCookie)).status === 204, 'A-07 admin-check as sysadmin → 204');
const plainForCheck = await getPlainUserCookie();
ok((await api('GET', '/api/auth/admin-check', null, plainForCheck)).status === 403, 'A-07 admin-check as user → 403');
```

- [ ] **Step 2: route.** `router.get('/admin-check', requireAdmin, (req, res) => res.sendStatus(204));` con `requireAdmin` importato da `../middleware/auth` se non lo è già. Riga nella tabella di `ARCHITECTURE.md`: `| GET | /api/auth/admin-check | ✅ admin | 204 for admin/sysadmin, 403 otherwise; nginx's auth_request for handbook/restricted/ |`, nello stesso formato delle righe vicine.
- [ ] **Step 3:** `npx vitest run scripts/architecture-guard.test.js` → PASS; `scripts/run-tests.sh` → `A-07` verdi (oppure rimandato al Gate 1 se lo stack di test non è libero, dichiarandolo).
- [ ] **Step 4: commit** `feat(auth): GET /api/auth/admin-check for nginx role checks`.

---

### Task 2: `js/lib/handbook.js`

**Files:**
- Create: `js/lib/handbook.js`, `js/lib/handbook.test.js`

**Interfaces** (ES module, ogni export ha il bridge `window.<name> = <name>`):
- `visibleDocs(manifest, role) → doc[]` — i `manifest.documents` con `audience === 'public'`, più i `restricted` se `role` è `admin` o `sysadmin`; ordine del manifest.
- `resolveDoc(manifest, id, role) → { doc, notice }` — `doc` è il documento visibile con quell'`id`; se `id` è vuoto, il primo visibile e `notice: ''`; se `id` è sconosciuto o non visibile, il primo visibile e `notice: 'Document not available'`; nessun documento visibile → `{ doc: null, notice: 'Document not available' }`.
- `isHandbookPayload(text, doc) → boolean` — `false` se il testo, tolto il BOM, inizia con `<` (HTML del login); per `renderer === 'test-cases'` deve iniziare con `# PDash — Test Cases`.
- `hasMermaid(text) → boolean` — esiste un fence di apertura con info string `mermaid`.
- `nextTestState(s) → 'pass'|'fail'|'untested'` — untested → pass → fail → untested.
- `testStats(cases, state) → { p, f, u, total }` — `state[id]` assente vale `untested`.
- `docProblems(text, renderer) → string[]` — vuoto se il viewer sa mostrare il documento. `test-cases`: titolo `# PDash — Test Cases` mancante → un problema; ogni `warning` di `parseTestCases` (import ES da `./test-cases-parse.js`) → un problema. `markdown`: fence non chiuso a fine file; blocco mermaid vuoto; blocco mermaid la cui prima riga non vuota e non `%%` non inizia con uno di `MERMAID_TYPES`.
- `MERMAID_TYPES` (export): `flowchart graph sequenceDiagram classDiagram stateDiagram stateDiagram-v2 erDiagram journey gantt pie mindmap timeline gitGraph quadrantChart requirementDiagram C4Context block-beta architecture-beta sankey-beta xychart-beta`.

Regola dei fence (CommonMark, in breve): apertura = riga con al più 3 spazi e poi ≥ 3 `` ` `` o ≥ 3 `~`; si chiude con una riga dello stesso carattere, lunghezza ≥ quella di apertura, senza altro testo; dentro un blocco aperto ogni altro fence è contenuto.

- [ ] **Step 1: test** in `handbook.test.js`, uno per riga di questo elenco:
  - `visibleDocs` per `user` → solo `public`; per `admin` e `sysadmin` → tutti, ordine del manifest.
  - `resolveDoc(m, 'architecture', 'user')` → primo pubblico + `'Document not available'`; `resolveDoc(m, '', 'admin')` → primo visibile, notice `''`; `resolveDoc(m, 'nope', 'admin')` → primo visibile + notice; manifest senza pubblici e `user` → `doc: null`.
  - `isHandbookPayload('<!DOCTYPE html>…', md)` → false; `'﻿# PDash — Test Cases\n'` con doc test-cases → true; `'# Other'` con doc test-cases → false; `'# Title'` con doc markdown → true.
  - `hasMermaid('```mermaid\ngraph TD\n```')` → true; `'```js\nx\n```'` → false; `'~~~\n```mermaid\n~~~'` → false.
  - `nextTestState` sul ciclo completo; `testStats([{id:'a'},{id:'b'},{id:'c'}], {a:'pass', b:'fail'})` → `{p:1,f:1,u:1,total:3}`.
  - `docProblems`: `'```\nx'` → 1 problema; `'````\n```\n````'` → `[]`; `'~~~\n```\n~~~'` → `[]`; `'```mermaid\n\n```'` → 1; `'```mermaid\nfoo\n```'` → 1; `'```mermaid\n%% c\nflowchart LR\n```'` → `[]`; un test case con riga di tabella malformata → ≥ 1; `'# Other'` con `test-cases` → 1.
- [ ] **Step 2:** `npx vitest run js/lib/handbook.test.js` → FAIL (modulo mancante).
- [ ] **Step 3:** implementare `js/lib/handbook.js`.
- [ ] **Step 4:** `npx vitest run js/lib/handbook.test.js` → PASS.
- [ ] **Step 5: commit** `feat(handbook): pure viewer logic in js/lib/handbook.js`.

---

### Task 3: `handbook/`, manifest, guard, citazioni

**Files:**
- Move: `ARCHITECTURE.md` → `handbook/restricted/ARCHITECTURE.md`; `TEST_CASES.md` → `handbook/restricted/TEST_CASES.md`; `docs/ops/production-checklist.md` → `handbook/restricted/production-checklist.md`
- Create: `handbook/manifest.json` (contenuto esatto: spec §2), `handbook/public/manual.md`, `scripts/handbook-guard.test.js`
- Modify: `scripts/architecture-guard.test.js`, `js/lib/test-cases-parse.test.js`, `scripts/doc-paths-guard.test.js`, `scripts/lib/live-docs.mjs`, `scripts/claude-md-guard.test.js` (commenti), `scripts/gate5-scope.mjs` (commento), più ogni file vivo restituito dal grep dello Step 4

**Interfaces:**
- Consumes: `docProblems` (Task 2).
- Produces: i path `handbook/manifest.json`, `handbook/restricted/{ARCHITECTURE,TEST_CASES,production-checklist}.md`, `handbook/public/manual.md`.

- [ ] **Step 1: guard rosso.** `scripts/handbook-guard.test.js` legge `handbook/manifest.json` e i `.md` sotto `handbook/` (walk ricorsivo), e ha questi test:
  - `the manifest lists every handbook .md and every listed file exists`;
  - `each file sits in its audience folder` (`file.startsWith(audience + '/')`), con `audience ∈ {public, restricted}`, `renderer ∈ {markdown, test-cases}`, `id` unici;
  - `every document renders` → `docProblems(text, renderer)` è `[]` per ogni voce, con il messaggio che nomina file e problemi;
  - controlli negativi sulle funzioni di verifica del guard, con dati in memoria e non sul disco: un manifest con un file mancante, un `.md` non elencato e `restricted/x.md` con `audience: 'public'` producono ciascuno una violazione.

  Le verifiche sono funzioni pure nel file del test, `manifestViolations(manifest, mdPaths, exists)`, così i casi negativi non toccano il disco. Run: `npx vitest run scripts/handbook-guard.test.js` → FAIL (manca `handbook/`).
- [ ] **Step 2: spostamenti e file nuovi.** `git mv` dei tre file; `manifest.json` come nella spec §2; `manual.md` in inglese: titolo `# User manual` e una riga che dice che il manuale verrà spostato qui.
- [ ] **Step 3: lettori per path.**
  - `architecture-guard.test.js` legge `handbook/restricted/ARCHITECTURE.md`.
  - `test-cases-parse.test.js` legge `handbook/restricted/TEST_CASES.md`.
  - `doc-paths-guard.test.js`: `DOCS = [...liveMarkdown('docs'), ...liveMarkdown('.claude'), ...liveMarkdown('handbook'), 'CLAUDE.md', 'PRD.md']`.
  - `live-docs.mjs`: `ROOTED` aggiunge `handbook`.
- [ ] **Step 4: citazioni vive.** `git grep -n -e 'ARCHITECTURE\.md' -e 'TEST_CASES\.md' -e 'production-checklist' -- ':!docs/superpowers' ':!handbook/restricted/TEST_CASES.md'` e aggiornare ogni citazione che indica il file come path (non quelle che lo nominano come documento, per esempio "the ARCHITECTURE.md §5 table" resta valido se il contesto non è un path). Le citazioni di `test-cases.html` restano al Task 5.
- [ ] **Step 5:** `npx vitest run scripts/handbook-guard.test.js scripts/architecture-guard.test.js scripts/doc-paths-guard.test.js scripts/claude-md-guard.test.js js/lib/test-cases-parse.test.js scripts/gate5-scope.test.js` → PASS.
- [ ] **Step 6: commit** `refactor(handbook): move ARCHITECTURE, TEST_CASES and the production checklist into handbook/` (un solo commit, spec §8).

---

### Task 4: `nginx.conf` + modello + `nginx-serve.test.js`

**Files:**
- Modify: `nginx.conf`, `scripts/lib/nginx-locations.mjs`, `scripts/nginx-serve.test.js`

**Interfaces:**
- Consumes: la route del Task 1 (solo per nome: `http://api:3000/api/auth/admin-check`).
- Produces: `parseLocations` restituisce anche `authBy: string|null` e `action: 'redirect'` per `return 301|302`.

- [ ] **Step 1: modello, test rosso.** Nel blocco `describe` esistente:
  - `authBy` riporta `'/auth-check'` per `/pipeline.html` e `null` per `/login.html`;
  - un `location = /x { return 301 /y; }` ha `action: 'redirect'`.

  Run: FAIL.
- [ ] **Step 2: modello.** `authBy` = cattura di `/\bauth_request\s+(\S+?)\s*;/`, oppure `null`; `redirect` quando `/\breturn\s+30[12]\b/` (controllato dopo il `404`). Aggiornare l'intestazione del modulo.
- [ ] **Step 3: test dei path, rosso.**
  - `isSite`: tolto `RUNTIME_FETCHED`; `handbook/manifest.json` e `/^handbook\/(public|restricted)\/.+\.(md|png)$/` sono sito.
  - `ALWAYS_404` aggiunge `/handbook/`, `/handbook/RESTRICTED/TEST_CASES.md`, `/handbook/RESTRI~1/TEST_CASES.md`, `/handbook/public/x.txt`, `/handbook/x.md`.
  - Test nuovi:
    - `every tracked handbook/restricted/ file is behind /admin-check` (ogni file tracciato lì ha `authBy: '/admin-check'`);
    - `the rest of handbook/ is behind /auth-check`;
    - `/test-cases.html redirects` (`action: 'redirect'`);
    - `is red when restricted uses /auth-check` (sostituzione nel testo della conf, come i test "is red" esistenti).
  - Il test `the other root pages require auth` toglie `/TEST_CASES.md`.

  Run: FAIL.
- [ ] **Step 4: `nginx.conf`.**
  - Location (spec §3), messe dopo `location = /auth-check` (la `internal`) e prima del catch-all: `location = /admin-check { internal; proxy_pass http://api:3000/api/auth/admin-check; … }` con le stesse direttive di `/auth-check`; le due regex di `handbook/` (restricted prima) con `root /usr/share/nginx/html;`; `location = /test-cases.html { return 301 /help.html?doc=test-cases; }`.
  - Rimuovere `location = /TEST_CASES.md` e il suo commento.
  - Aggiornare il commento "SITE FILES ONLY".
- [ ] **Step 5:** `npx vitest run scripts/nginx-serve.test.js` → PASS.
- [ ] **Step 6: commit** `feat(nginx): serve handbook/, restricted/ for admins only; /test-cases.html redirects to the viewer`.

---

### Task 5: `help.html`, `css/help.css`, voce "Help", rimozione di `test-cases.html`

**Files:**
- Create: `help.html`, `css/help.css`
- Delete: `test-cases.html`
- Modify: `js/nav.js` (menu account), `js/lib/nav-model.test.js`, `js/lib/foundations-guard.test.js:124`, `js/lib/page-names.test.js:41`, ogni `*.html` che carica `js/nav.js` (bump `?v=`)

**Interfaces:**
- Consumes: Task 2 (`visibleDocs`, `resolveDoc`, `isHandbookPayload`, `hasMermaid`, `nextTestState`, `testStats`), `parseTestCases`/`formatCell`, i path del Task 3.

- [ ] **Step 1: nav, test rosso.** In `nav-model.test.js`:
  - `nav-help-link` entra nell'elenco degli id;
  - un test controlla che per `user`, `admin` e `sysadmin` `#nav-help-link` esista, con `href="/help.html"`, testo `Help`, un `svg`, e sia subito dopo la `<li>` di `#nav-privacy-btn`.

  Run: FAIL.
- [ ] **Step 2: nav.**
  - `<li><a class="dropdown-item" id="nav-help-link" href="/help.html">${navIcon('info')}Help</a></li>` dopo la riga di Privacy Notice.
  - Bump di `js/nav.js?v=23` → `?v=24` in ogni pagina (`git grep -l "nav.js?v=23"`).
  - Run `npx vitest run js/lib/nav-model.test.js js/lib/nav-shell-guard.test.js` → PASS.
- [ ] **Step 3: `help.html`.**
  - Stessa struttura e stessi `<script>` di `privacy-notice.html` (shell, snippet `PDash_sidebarCollapsed`, `v-cloak`, `.ph` con `Help`, `<title>PDash — Help</title>`).
  - In più: `<link rel="stylesheet" href="css/help.css?v=1">`, `<script defer src="https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js">`, `<script type="module" src="js/lib/test-cases-parse.js?v=1">`, `<script type="module" src="js/lib/handbook.js?v=1">`.
  - `initNav('help', { breadcrumbs: [{ label: 'Home', href: '/pipeline.html' }, { label: 'Help' }] })`.
  - **Caricamento.** Manifest e documento si caricano con `fetch(…, { cache: 'no-store' })`; un payload non valido o un errore di rete mostra `Could not load this document. Reload the page; if you are signed out, sign in first.`
  - **Markdown.** `marked.parse(text)` in un `div.hb-body` con `v-html`. Dopo il render, se `hasMermaid`:
    - `import('https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs')`;
    - `initialize({ startOnLoad: false, securityLevel: 'strict' })`;
    - ogni `code.language-mermaid` si sostituisce con un `<pre class="mermaid">` che ha il suo `textContent`;
    - poi `mermaid.run({ nodes })`.
  - **Test case.** Le stesse viste di `test-cases.html`: elenco delle sezioni con `p/total`, pill All/Passed/Failed/Untested, barra di avanzamento, banda degli avvisi, card con toggle, sottotitoli `###` e badge `API auto`/`vitest`.
    - Il testo delle celle va in `v-html="formatCell(…)"`.
    - Lo stato si legge e si scrive in `localStorage['pdash_test_state_v1']`, dentro try/catch.
    - "Reset all" usa `showConfirm('Reset all test results? This cannot be undone.', …)`, con la firma usata in `js/core.js`.
  - **Navigazione.** Elenco dei documenti in "Guides" e "Admin" (solo se non vuoto); sotto i 1024px una `<select>`. Un cambio di documento fa `history.replaceState(null, '', '?doc=' + id)`. Il notice di `resolveDoc` compare come `alert-warning` sopra il documento.
- [ ] **Step 4: `css/help.css`.**
  - Solo `var(--…)` da `tokens.css`, nessun esadecimale.
  - I colori pass/fail/untested riusano `--color-success-text`/`--color-danger-text`/`--text-muted` e i loro sfondi esistenti.
  - Media query 1023.98px per il passaggio elenco → select.
- [ ] **Step 5: rimozioni.**
  - `git rm test-cases.html`.
  - Togliere le eccezioni `test-cases.html` da `foundations-guard.test.js` e `page-names.test.js`.
  - Aggiornare le citazioni vive di `test-cases.html`: `git grep -n 'test-cases\.html' -- ':!docs/superpowers'`, tranne `nginx.conf`.
- [ ] **Step 6:** `npx vitest run js/lib/` → PASS (guard di pagina, foundations, page-names, nav, handbook).
- [ ] **Step 7: verifica visiva.**
  - `scripts/test-branch.sh up`.
  - `node scripts/shoot.mjs` su `/help.html?doc=architecture` e `/help.html?doc=test-cases` (admin) e su `/help.html` (`user`), alle larghezze di `docs/scripts/shoot.md`.
  - Leggere i PNG e confrontarli con la spec §5: layout a due colonne ≥ 1024px, select sotto.
- [ ] **Step 8: commit** `feat(help): single handbook viewer replaces test-cases.html; Help entry in the account menu`.

---

### Task 6: `classify-cycle.mjs`

**Files:**
- Modify: `scripts/classify-cycle.mjs`, `scripts/classify-cycle.test.js`

**Interfaces:**
- Produces: `classifyNameStatus(z)` senza il secondo parametro; `RUNTIME_LOADED_ROOT_MD` non esiste più.

- [ ] **Step 1: test rossi** (formato `-z` come i casi esistenti):
  - `M handbook/public/manual.md` → `no-code`;
  - `A handbook/public/img/x.png` → `no-code`;
  - `M handbook/restricted/TEST_CASES.md` → `no-code`;
  - `D handbook/public/old.md` → `no-code`;
  - `M handbook/manifest.json` → `ordinary`;
  - `R100 handbook/restricted/a.md handbook/public/a.md` → `ordinary`;
  - `R100 ARCHITECTURE.md handbook/restricted/ARCHITECTURE.md` → `ordinary`;
  - `R100 handbook/public/a.md handbook/public/b.md` → `no-code`;
  - `M TEST_CASES.md` (root, file non più caricato) → `no-code`.

  I test esistenti su `RUNTIME_LOADED_ROOT_MD` e sul parametro `exceptions` vanno tolti. Run: FAIL.
- [ ] **Step 2: implementazione.**
  - `qualifies(path)` accetta anche `handbook/**.md` e `handbook/**.png`.
  - Una funzione `audienceOf(path) → 'public'|'restricted'|null` (`null` fuori da `handbook/{public,restricted}/`).
  - Un record `R`/`C` con `audienceOf(old) !== audienceOf(new)` rende il ciclo `ordinary`.
  - Aggiornare l'intestazione del file (le eccezioni nominate spariscono).
- [ ] **Step 3:** `npx vitest run scripts/classify-cycle.test.js` → PASS.
- [ ] **Step 4: commit** `feat(classify-cycle): handbook/ docs are no-code, audience moves are ordinary`.

---

### Task 7: documentazione di processo e brief Bitbucket

**Files:**
- Modify: `.claude/skills/sync-docs/SKILL.md`, `docs/superpowers/PROCESS.md` (§4b, §6.4c se cita `RUNTIME_LOADED_ROOT_MD`), `CLAUDE.md`, `docs/css/stylesheets.md`, `docs/superpowers/briefs/2026-11-10-bitbucket-export-brief.md`, `.claude/commands/finish-cycle.md`
- Create: `docs/pages/help.md`

- [ ] **Step 1: `sync-docs`.**
  - Il §3 (`TEST_CASES.md` → ordinary) diventa: i `.md` di `handbook/` sono no-code, gli spostamenti fra pubblici sono ordinary; la regola sta in `scripts/classify-cycle.mjs`.
  - Tre step condizionali, come nella spec §8. Quello del manuale è marcato `active from handbook cycle 2`.
- [ ] **Step 2: `PROCESS.md` §4b.** Riga di `scripts/handbook-guard.test.js`: fallisce quando un documento del manifest manca, un `.md` di `handbook/` non è elencato, un pubblico non coincide con la cartella o il viewer non saprebbe mostrare un documento. Va tolta ogni citazione di `RUNTIME_LOADED_ROOT_MD`.
- [ ] **Step 3: `CLAUDE.md`.**
  - Riga `help.html` nella tabella Pages, con link a `docs/pages/help.md`.
  - Paragrafo di nginx in "Testing & tooling": `handbook/` servito, `restricted/` solo admin/sysadmin.
  - File structure: `handbook/` e `js/lib/handbook.js`, al posto di `test-cases.html`/`TEST_CASES.md`.
  - Il file deve restare sotto il tetto di `claude-md-guard`.
- [ ] **Step 4: altri documenti.**
  - `docs/pages/help.md`: lo stato attuale del viewer (renderer, ruoli, `?doc=`, chiave localStorage, CDN).
  - `docs/css/stylesheets.md`: riga di `css/help.css`.
  - `finish-cycle.md`: i casi di test del Gate 2 si leggono da `handbook/restricted/TEST_CASES.md`.
- [ ] **Step 5: brief Bitbucket** (spec §8):
  - inclusi `handbook/`, `help.html`, `js/lib/test-cases-parse.js`;
  - tolti dagli esclusi `ARCHITECTURE.md`, `TEST_CASES.md`, `test-cases.html`;
  - domanda 5 chiusa;
  - riga sull'accettazione dell'utente (architettura e checklist visibili su Bitbucket).
- [ ] **Step 6:** `npx vitest run scripts/` → PASS (guard documentali).
- [ ] **Step 7: commit** `docs: handbook viewer — process docs, CLAUDE.md, Bitbucket brief`.

## Criteri di accettazione

Quelli della spec (`docs/superpowers/specs/2026-11-11-handbook-viewer-design.md` → "Criteri di accettazione"), verificati al Gate 2 sullo stack di branch.

## Decisioni aperte

1. **Icona `info` per la voce Help.** Alternativa scartata: una nuova icona `help` in `js/lib/icons.js`. Perché: un'icona nuova obbliga a cambiare il `?v=` di `icons.js` in ogni pagina, e `info` dice già la stessa cosa.
2. **Le verifiche del guard sono funzioni pure nel file del test, con i casi negativi in memoria.** Alternativa scartata: fixture su disco sotto `scripts/`. Perché: una fixture `.md` sarebbe un documento vivo per `doc-paths-guard` e per il walk di `live-docs`.
3. **`classifyNameStatus` perde il parametro `exceptions`.** Alternativa scartata: tenerlo con un default vuoto. Perché: l'unico chiamante passava la lista che questo ciclo rimuove.
