# Handbook: viewer unico della documentazione servita dall'app (ciclo 1) — design spec

**Date:** 2026-11-11
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-11-handbook-viewer-brief.md`
**Scenario:** 2 (evoluzione)

Tutta la documentazione letta nell'app vive in `handbook/`, divisa per pubblico (`public/` per ogni utente autenticato, `restricted/` per admin e sysadmin). Una sola pagina, `help.html`, la mostra con due renderer (markdown con Mermaid, test case). nginx fa rispettare il pubblico lato server. `test-cases.html`, `TEST_CASES.md`, `ARCHITECTURE.md` e `docs/ops/production-checklist.md` lasciano le loro posizioni attuali.

## 1. Fatti verificati nel codice (a `07ee2c9`)

- `nginx.conf` serve solo un elenco di path: le pagine `*.html` di root (pubbliche `login`/`activate`/`reset-password`, le altre con `auth_request /auth-check`), `location = /TEST_CASES.md` con autenticazione, i `.css`/`.js` di `css/` e `js/` senza autenticazione (test esclusi), e un `location / { return 404; }` finale. `scripts/nginx-serve.test.js` lo verifica su ogni file tracciato tramite il modello `scripts/lib/nginx-locations.mjs` (`isSite`, `RUNTIME_FETCHED = ['TEST_CASES.md']`).
- `/auth-check` fa proxy a `GET /api/auth/me`, che controlla solo la sessione. `requireAdmin` (`api/src/middleware/auth.js:38`) chiama `requireAuth` e risponde 403 `{ error: 'Admin access required' }` ai ruoli diversi da admin/sysadmin.
- `test-cases.html` (415 righe, senza `initNav`, colori esadecimali propri) importa `js/lib/test-cases-parse.js?v=1`, scarica `TEST_CASES.md` con `cache: 'no-store'`, controlla che il payload inizi con `# PDash — Test Cases`, salva gli esiti in `localStorage['pdash_test_state_v1']` e usa un `confirm()` nativo per "Reset all".
- Eccezioni per `test-cases.html`: `js/lib/foundations-guard.test.js:124`, `js/lib/page-names.test.js:41`.
- `scripts/classify-cycle.mjs`: `RUNTIME_LOADED_ROOT_MD = ['TEST_CASES.md']`; `qualifies()` concede no-code solo ai `.md` sotto `.claude/`, `docs/` o in root.
- `scripts/gate5-scope.mjs`: il sottoinsieme del Gate 5 esegue `npx vitest run scripts/ js/lib/test-cases-parse.test.js`; `mdReadingTests` controlla che nessun altro test sotto `js/` legga un `.md`.
- `scripts/doc-paths-guard.test.js:68-71`: `DOCS` = `liveMarkdown('docs')`, `liveMarkdown('.claude')` e i quattro `.md` di root; `scripts/lib/live-docs.mjs` `ROOTED` non conosce `handbook/`.
- `js/nav.js`: `NAV_MAIN` (Pipeline, Portfolio, Planning), gruppi per ruolo, menu account con `#nav-privacy-btn`; `js/lib/nav-model.test.js` fissa l'insieme degli id emessi; `js/lib/page-names.test.js` fissa l'elenco delle etichette del menu.
- Nessun worktree aperto (`git worktree list`): lo spostamento di `TEST_CASES.md` non ha rami in conflitto.

## 2. `handbook/`

```
handbook/
  manifest.json
  public/manual.md                 — segnaposto in inglese (contenuto nel ciclo 2)
  restricted/ARCHITECTURE.md       — git mv dalla root
  restricted/TEST_CASES.md         — git mv dalla root
  restricted/production-checklist.md — git mv da docs/ops/
```

`manifest.json`:

```json
{ "documents": [
  { "id": "manual", "title": "User manual", "audience": "public", "renderer": "markdown", "file": "public/manual.md" },
  { "id": "architecture", "title": "Architecture", "audience": "restricted", "renderer": "markdown", "file": "restricted/ARCHITECTURE.md" },
  { "id": "test-cases", "title": "Test cases", "audience": "restricted", "renderer": "test-cases", "file": "restricted/TEST_CASES.md" },
  { "id": "production-checklist", "title": "Production checklist", "audience": "restricted", "renderer": "markdown", "file": "restricted/production-checklist.md" }
] }
```

`file` è relativo a `handbook/` e deve iniziare con `<audience>/`: la cartella è l'unica fonte del pubblico, ed è la cartella che nginx protegge.

## 3. Controllo del ruolo lato server

- **API:** `GET /api/auth/admin-check` in `api/src/routes/auth.js`, `requireAdmin`, risponde `204` senza corpo. Senza sessione → 401 (da `requireAuth`), `user` → 403 (da `requireAdmin`). `ARCHITECTURE.md` riceve la route.
- **nginx:**
  - `location = /admin-check { internal; proxy_pass http://api:3000/api/auth/admin-check; … }`, gemello di `/auth-check`;
  - `location ~ ^/handbook/restricted/[A-Za-z0-9_./-]+\.(md|png)$` con `auth_request /admin-check;`, `error_page 401 = @to_login;`, `root`. Un `user` riceve il 403 di `auth_request`;
  - `location ~ ^/handbook/(public/[A-Za-z0-9_./-]+\.(md|png)|manifest\.json)$` con `auth_request /auth-check;`, `error_page 401 = @to_login;`, `root`;
  - `location = /test-cases.html { return 301 /help.html?doc=test-cases; }`;
  - `location = /TEST_CASES.md` viene rimosso.
- I due pattern di `handbook/` sono disgiunti, case-sensitive e senza `~` nella classe di caratteri: un nome corto 8.3 o una variante di maiuscole arriva al 404 finale.
- `help.html` è servita dalla regola esistente delle pagine di root.

## 4. `nginx-serve.test.js` e il modello

- `scripts/lib/nginx-locations.mjs`: ogni location riporta anche `authBy` (il target di `auth_request`, o `null`) e l'azione `redirect` per `return 301|302`. `auth` resta booleano.
- `isSite`: `RUNTIME_FETCHED` sparisce; sono sito `handbook/manifest.json` e i `.md`/`.png` sotto `handbook/public/` e `handbook/restricted/`.
- Asserzioni nuove:
  - ogni file tracciato sotto `handbook/restricted/` ha `authBy: '/admin-check'`; ogni altro file di `handbook/` ha `authBy: '/auth-check'`;
  - `/test-cases.html` ha azione `redirect`;
  - `ALWAYS_404` aggiunge `/handbook/`, `/handbook/RESTRICTED/TEST_CASES.md`, `/handbook/RESTRI~1/TEST_CASES.md`, `/handbook/public/x.txt`, `/handbook/x.md`;
  - il test è rosso quando la regola restricted usa `/auth-check` invece di `/admin-check`.

## 5. Il viewer: `help.html`

- Pagina Vue autenticata secondo le regole di `CLAUDE.md`: page shell, `.ph` "Help", `v-cloak`, `js/lib/icons.js` prima di `nav.js`, `?v=N` concordi, `<title>PDash — Help</title>`, `initNav('help', [{ label: 'Help' }])`. Stile con i token, in uno stylesheet proprio `css/help.css`.
- **Layout:** sopra i 1024px, a sinistra l'elenco dei documenti in due gruppi, "Guides" (pubblici) e "Admin" (riservati, solo per admin/sysadmin); a destra il documento. Sotto i 1024px l'elenco è una `<select>` in testa.
- **Link:** `?doc=<id>`, aggiornato con `history.replaceState` a ogni cambio. Un id assente apre il primo documento visibile; un id sconosciuto o non permesso apre il primo documento visibile con l'avviso "Document not available".
- **Caricamento:** `fetch('handbook/manifest.json', { cache: 'no-store' })` e poi il file del documento. Un payload che non è quello atteso (un 401 rediretto al login arriva come HTML con 200) mostra un errore con l'invito a ricaricare o ad accedere.
- **Renderer `markdown`:** `marked` da CDN con versione esatta; i blocchi ```` ```mermaid ```` diventano `<pre class="mermaid">`; `mermaid` (ESM da CDN, versione esatta, `securityLevel: 'strict'`, `startOnLoad: false`) è importato dinamicamente solo se il documento contiene un blocco mermaid. Nessuna sanitizzazione.
- **Renderer `test-cases`:** il comportamento di `test-cases.html` in Vue e nei token: elenco delle sezioni con i contatori, filtri All/Passed/Failed/Untested, barra di avanzamento, avvisi del parser, toggle untested → pass → fail per caso, sottotitoli dai `###`, badge "API auto"/"vitest". Stessa chiave `pdash_test_state_v1`, stesso controllo del titolo `# PDash — Test Cases`, "Reset all" con `showConfirm()`. Il testo delle celle passa da `formatCell` come oggi.
- **Logica pura** in `js/lib/handbook.js` (ES module con bridge `window.*`, test vitest accanto):
  - `visibleDocs(manifest, role)`, `resolveDoc(manifest, id, role)` → `{ doc, notice }`;
  - `nextTestState(s)`, `testStats(cases, state)`;
  - `docProblems(text, renderer)` → elenco di problemi, usato anche dal guard (§6).
- **Menu:** link "Help" (`id="nav-help-link"`, `href="/help.html"`, icona esistente) nel menu account, subito sotto "Privacy Notice". `nav-model.test.js` aggiunge l'id all'insieme fissato. `NAV_MAIN` e l'elenco di `page-names.test.js` non cambiano.
- `test-cases.html` viene eliminato; le eccezioni in `foundations-guard.test.js` e `page-names.test.js` spariscono.

## 6. Guard: `scripts/handbook-guard.test.js`

Guard documentale (suffisso `-guard.test.js`, riga nella tabella di `PROCESS.md` §4b). Sotto `scripts/`, entra nel sottoinsieme del Gate 5. Rosso quando:

- un `file` del manifest non esiste;
- un `.md` sotto `handbook/` non è elencato nel manifest;
- `file` non inizia con `<audience>/`, o `audience`/`renderer` hanno un valore sconosciuto, o un `id` è duplicato;
- `docProblems` restituisce problemi: per `test-cases`, titolo mancante o avvisi di `parseTestCases`; per `markdown`, un fence ```` ``` ```` non chiuso, un blocco mermaid vuoto o che non inizia con un tipo di diagramma noto.

Il conteggio esatto di casi e sezioni resta in `js/lib/test-cases-parse.test.js`, che legge il nuovo path.

## 7. `classify-cycle.mjs`

- `RUNTIME_LOADED_ROOT_MD` viene rimossa.
- No-code: `.md` e `.png` sotto `handbook/`, aggiunti, modificati o cancellati.
- Ordinary: un record di rinomina il cui path di partenza e di arrivo hanno un pubblico diverso: `handbook/public/`, `handbook/restricted/`, o fuori da `handbook/`.
- `handbook/manifest.json`, `help.html`, ogni `.js` e `nginx.conf` sono già ordinary.
- Casi nuovi in `classify-cycle.test.js`: modifica di un `.md` sotto `handbook/` → no-code; un `.png` sotto `handbook/` → no-code; `handbook/manifest.json` → ordinary; rinomina da `handbook/restricted/` a `handbook/public/` → ordinary; rinomina da root a `handbook/restricted/` → ordinary; `handbook/restricted/TEST_CASES.md` modificato → no-code.

## 8. Spostamenti e citazioni

Un solo commit esegue i tre `git mv` e aggiorna ogni citazione viva:

- `scripts/architecture-guard.test.js`, `js/lib/test-cases-parse.test.js`, `scripts/claude-md-guard.test.js` (commenti), `scripts/gate5-scope.mjs` (commento);
- `scripts/doc-paths-guard.test.js`: `DOCS` aggiunge `liveMarkdown('handbook')` e toglie `ARCHITECTURE.md`/`TEST_CASES.md` di root; `scripts/lib/live-docs.mjs` `ROOTED` aggiunge `handbook`;
- `CLAUDE.md`, `.claude/commands/finish-cycle.md`, `.claude/skills/sync-docs/SKILL.md`, `.claude/skills/operational-manual/SKILL.md` (solo il path di `ARCHITECTURE.md`), `PRD.md`, `docs/js/lib.md` e ogni altro file restituito da `git grep -l -e ARCHITECTURE.md -e TEST_CASES.md -e production-checklist -e test-cases.html -- ':!docs/superpowers'`.

Inoltre:

- `/sync-docs` riceve i tre step condizionali del brief: documentazione tecnica quando il ciclo cambia layer, route, tabelle o flussi; checklist di produzione quando cambiano `handbook/restricted/ARCHITECTURE.md` o `PRD.md`; manuale quando cambia il comportamento visibile all'utente, marcato "active from handbook cycle 2".
- `docs/superpowers/briefs/2026-11-10-bitbucket-export-brief.md`: `handbook/`, `help.html` e `js/lib/test-cases-parse.js` passano fra gli inclusi; `ARCHITECTURE.md`, `TEST_CASES.md` e `test-cases.html` escono dagli esclusi; la domanda 5 è chiusa; una riga registra che l'utente accetta che architettura e checklist siano visibili a chi accede al repo Bitbucket.
- `CLAUDE.md`: riga di `help.html` nella tabella delle pagine, la descrizione di nginx e del file structure aggiornate, `css/help.css` in `docs/css/stylesheets.md`.

## 9. Verifica e deploy

- Unit: `js/lib/handbook.test.js`, `scripts/handbook-guard.test.js`, `scripts/nginx-serve.test.js`, `scripts/classify-cycle.test.js`; `test-api.js` con 401/403/204 su `/api/auth/admin-check`.
- Stack di branch (`scripts/test-branch.sh`): `curl` su `/handbook/restricted/TEST_CASES.md` con il cookie di `user`, di admin, senza cookie; il viewer per `user`, admin, sysadmin; il numero di casi e sezioni confrontato con `test-cases.html` su `main`; un esito salvato prima del ciclo; un blocco mermaid temporaneo, non committato, in un documento riservato; `scripts/shoot.mjs` di `help.html` alle larghezze del progetto.
- Dopo il merge: `pdash-api` si riavvia per la deroga del Gate 4. Il reload di `pdash-nginx` sullo stack principale non è coperto dalla deroga: `scripts/backup-db.sh` e poi la conferma esplicita dell'utente (`CLAUDE.md` → Infrastructure safety, regola 3), mai `down`, mai `-v`.

## Criteri di accettazione

1. **Root ripulita** — `git ls-files TEST_CASES.md test-cases.html ARCHITECTURE.md docs/ops/production-checklist.md` è vuoto; `git ls-files handbook/` elenca `manifest.json`, `public/manual.md` e i tre documenti spostati.
2. **Viewer per ruolo** — sullo stack di branch, un `user` vede in `help.html` solo "User manual"; un admin e un sysadmin vedono anche Architecture, Test cases, Production checklist.
3. **Accesso lato server** — sullo stack di branch, `curl` su `/handbook/restricted/TEST_CASES.md` risponde 403 con il cookie di un `user`, 200 con il file con il cookie di un admin, 302 verso `/login.html` senza cookie.
4. **Test case invariati** — il documento Test cases nel viewer mostra le stesse sezioni e lo stesso numero di casi di `test-cases.html` su `main`, e un esito salvato prima del ciclo è ancora visibile.
5. **Mermaid** — un blocco mermaid temporaneo in un documento riservato è mostrato come diagramma.
6. **Redirect** — `/test-cases.html` porta a `/help.html?doc=test-cases`, che apre il documento Test cases.
7. **Voce Help** — il menu account mostra "Help" per `user`, admin e sysadmin, e apre `help.html`.
8. **Classificazione** — `classify-cycle.test.js` contiene i casi del §7 ed è verde.
9. **Guard dei documenti** — `scripts/handbook-guard.test.js` è rosso con una tabella malformata nei test case, un file del manifest mancante, un `.md` non elencato, un pubblico che non coincide con la cartella; verde sul repo.
10. **nginx** — `scripts/nginx-serve.test.js` è verde e contiene le asserzioni del §4.
11. **Architettura** — `scripts/architecture-guard.test.js` legge `handbook/restricted/ARCHITECTURE.md`, include la route `/api/auth/admin-check` ed è verde.
12. **Suite** — `npm test` (con `doc-paths-guard` e `claude-md-guard`) e `scripts/run-tests.sh` sono verdi.
13. **Brief Bitbucket** — elenca `handbook/`, `help.html` e `js/lib/test-cases-parse.js` fra gli inclusi.

## Scope escluso esplicitamente

- Il contenuto del manuale e la sua migrazione da `docs/OPERATIONAL_MANUAL.html` (ciclo 2), compreso l'adattamento della skill `operational-manual` oltre al path.
- I diagrammi Mermaid dell'architettura (ciclo 3) e il parse completo di Mermaid nel guard.
- Spostare `PRD.md` o altri file di `docs/`.
- Ricerca, indice automatico, ancore di sezione, stampa o export PDF nel viewer.
- Rendere interattiva la checklist di produzione.
- Correggere i vecchi percorsi nei documenti storici di `docs/superpowers/`.
- Realizzare l'export Bitbucket.
- Filtrare il manifest per ruolo lato server.

## Decisioni aperte

1. **Ruolo controllato con `GET /api/auth/admin-check` e un secondo `auth_request`.** Alternativa scartata: un header `X-User-Role` su `/me` con `auth_request_set` + `if`, o servire i file riservati dall'API. Perché: `if` in una location è fragile e il modello non lo legge, e il container `api` non monta `handbook/`.
2. **Un `user` riceve 403 su `handbook/restricted/`.** Alternativa scartata: 404. Perché: i titoli dei documenti riservati sono comunque nel manifest, unico e leggibile da ogni autenticato, quindi il 404 non nasconderebbe nulla.
3. **Viewer `help.html`, link `?doc=<id>` senza ancore di sezione.** Alternativa scartata: `docs.html` o ancore per titolo. Perché: "Help" è l'etichetta del menu, e `marked` non genera gli id dei titoli senza un'estensione.
4. **"Help" nel menu account, sotto "Privacy Notice".** Alternativa scartata: una voce in `NAV_MAIN`. Perché: `NAV_MAIN` raccoglie le aree di lavoro, e così `page-names` e il layout guard non cambiano.
5. **`/test-cases.html` è un redirect 301 in nginx.** Alternativa scartata: un file di redirect come `config.html`. Perché: il brief chiede che la root resti senza quel file.
6. **Nessuna sanitizzazione del markdown.** Alternativa scartata: DOMPurify da CDN. Perché: il contenuto viene solo dal repo, e mermaid gira in `strict`.
7. **Il guard usa controlli strutturali condivisi con il viewer (`docProblems`), non `marked` né `mermaid.parse`.** Alternativa scartata: le due librerie come devDependency. Perché: `marked` non fallisce mai su nessun testo, e `mermaid.parse` richiede il DOM.
8. **`RUNTIME_LOADED_ROOT_MD` viene rimossa.** Alternativa scartata: lasciarla vuota. Perché: nessun `.md` di root è più caricato dall'app, e la regola nuova vive in `qualifies()`.
9. **Blocco mermaid di prova temporaneo, non committato.** Alternativa scartata: un diagramma committato in un documento riservato. Perché: i diagrammi sono il contenuto del ciclo 3.
10. **Reload di `pdash-nginx` sullo stack principale a mano, con backup e conferma.** Alternativa scartata: estendere la deroga del Gate 4. Perché: la deroga è nominata per `docker compose restart api` soltanto.
