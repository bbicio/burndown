# CSP senza `'unsafe-inline'` in `script-src` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nessuno script inline né attributo handler nelle pagine; `script-src 'self' 'unsafe-eval'` + gli URL esatti dei file CDN usati.

**Architecture:** Gli script inline si spostano, identici, in `js/pages/*.js`, con tag nella stessa posizione e dello stesso tipo. I test continuano a leggere le pagine come prima: un setup globale di vitest restituisce, per ogni pagina della radice, il testo ricostruito con gli script reinseriti. `security-headers-guard` impara a confrontare URL con sorgenti CSP a path e pinna l'assenza di inline.

**Tech Stack:** HTML statico servito da nginx, Vue 3 da CDN, vitest 4 + jsdom, node per lo spostamento.

**Spec:** `docs/superpowers/specs/2026-11-16-security-c8-csp-script-src-design.md`
**Branch:** `security-c8-csp-script-src`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/sidebar-state.js`, `js/esc-shim.js`)

**Task indipendenti:** no. Ogni task parte dal commit del precedente (il Task 3 prova la copia esatta contro il commit del Task 2; il Task 4 pinna lo stato prodotto dal Task 3).

## Global Constraints

- Nessun build step né bundler: nginx serve i file come sono su disco.
- Ogni file nuovo sotto `js/` è referenziato con `?v=1`.
- File scritti in UTF-8 senza BOM, con i byte di fine riga originali; mai via `Get-Content`/`Set-Content`.
- Testo per l'utente in inglese.
- Mai `docker compose` sullo stack principale; la verifica usa `scripts/test-branch.sh`.
- Gli URL CDN di `script-src`, in quest'ordine:
  `https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js`
  `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`
  `https://cdn.jsdelivr.net/npm/dompurify@3.4.18/dist/purify.min.js`
  `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js`
  `https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js`
  `https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js`
  `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`
  `https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js`

## Review Focus

1. **Un global definito da uno script classico spostato e letto da uno script successivo della stessa pagina** deve esistere ancora in quel momento. Lo prova la copia esatta (Task 3): stesso tipo, stessa posizione, nessun `defer` aggiunto.
2. **Mermaid caricato lazy da `help.html`** sotto una CSP a path: la sonda del Task 5 apre un documento con un diagramma.
3. **Le pagine pubbliche senza sessione** devono ricevere i loro `js/pages/*.js` senza `auth_request`: lo verificano `scripts/nginx-serve.test.js` (ogni file tracciato) e la sonda del Task 5 da utente non loggato.
4. **La sidebar collassata non deve lampeggiare aperta al caricamento:** la sonda del Task 5 imposta `PDash_sidebarCollapsed='1'` e legge `data-sidebar` su `<html>` in `DOMContentLoaded`.
5. **Un test che legge una pagina senza passare dal setup** (es. `fs.promises`, `require`) vedrebbe la pagina senza script e passerebbe anche se sbaglia: il Task 1 verifica che nessun test legga file in quei modi.

---

### Task 1: lettura delle pagine ricostruita nei test

**Files:**
- Create: `scripts/lib/page-source.mjs`, `scripts/lib/page-source.setup.mjs`, `scripts/page-source.test.js`
- Modify: `vitest.config.js`

**Interfaces:**
- Produces: `pageSource(html: string, readFile: (relPath: string) => string): string`: sostituisce ogni `<script [type="module"] src="js/pages/<nome>.js?v=N"></script>` con `<script[ type="module"]>` + contenuto del file + `</script>`. `isRootPage(path: string, root: string): boolean`: vero se `path` risolto è `<root>/<nome>.html`. `rawReadFileSync`: il `readFileSync` reale di `node:fs`, esportato dal setup per chi deve leggere l'HTML così com'è su disco.
- Il setup (`vi.mock('node:fs', ...)`, nome esportato e `default`) fa restituire a `readFileSync` di una pagina della radice `pageSource(...)`; ogni altro path passa al reale.

- [ ] **Step 1: test che falliscono** in `scripts/page-source.test.js`:
  - `pageSource` su `'a<script src="js/pages/x.js?v=1"></script>b'`, con `readFile` che dà `'CODE'`, restituisce `'a<script>CODE</script>b'`; con `type="module"` il risultato è `'a<script type="module">CODE</script>b'`;
  - lascia invariati `<script src="js/core.js?v=16">` e `<script defer src="https://unpkg.com/...">`;
  - `isRootPage` è vero per `join(ROOT,'costgrid.html')` e `'costgrid.html'`, falso per `join(ROOT,'handbook','x.html')` e per `join(tmpdir(),'costgrid.html')`;
  - `readFileSync('costgrid.html','utf8')` (import nominale) e `fs.readFileSync` (import `default`) restituiscono lo stesso testo di `rawReadFileSync`: oggi non c'è ancora nessun `js/pages/`.
- [ ] **Step 2:** `npx vitest run scripts/page-source.test.js` → FAIL (moduli assenti).
- [ ] **Step 3:** implementare i due moduli. Il setup ottiene il modulo reale con `vi.importActual` e passa a `pageSource` il reader reale, così non ricorre su se stesso. Aggiungere `setupFiles: ['scripts/lib/page-source.setup.mjs']` a `vitest.config.js`.
- [ ] **Step 4:** `npx vitest run scripts/page-source.test.js` → PASS; poi `npm test` → verde.
- [ ] **Step 5:** `grep -nE "fs/promises|readFile\(|require\(['\"](node:)?fs" js/lib/*.test.js scripts/*.test.js` non trova nessun test che legge una pagina `.html` in quei modi. Se ne trova uno, va convertito a `readFileSync`.
- [ ] **Step 6: commit** `test: read root pages through pageSource in every test`.

### Task 2: modifiche dichiarate (head, shim, redirect, handler)

**Files:**
- Create: `js/sidebar-state.js`, `js/esc-shim.js`
- Modify: ogni pagina `*.html` con lo snippet del `<head>`; `admin.html`, `master-clients.html`, `master-currencies.html`, `master-pipelines.html`, `master-roles.html`, `timesheets.html` (shim); `index.html`, `config.html`, `master-client-groups.html` (redirect); `costgrid.html:718,737` e il suo script `Vue.createApp`; `js/lib/master-data-guard.test.js:175,187`; i test che pinnano lo snippet (`js/lib/nav-behavior.test.js`, `js/lib/nav-shell.test.js`, `js/lib/nav-shell-guard.test.js`, `js/lib/program-guard.test.js`, `js/lib/core-storage.test.js` per quanto citano `PDash_sidebarCollapsed`)

**Interfaces:**
- Produces: `js/sidebar-state.js` contiene esattamente il corpo dello snippet attuale. `js/esc-shim.js` contiene la funzione `esc(s)` degli shim attuali. Bottoni `id="clientNewBtn"` e `id="clientSaveBtn"` (quest'ultimo id esiste già).

- [ ] **Step 1: aggiornare prima i test.**
  - Le asserzioni sullo snippet ora pretendono `<script src="js/sidebar-state.js?v=1"></script>` nella stessa posizione del `<head>` e il contenuto di `js/sidebar-state.js`.
  - `master-data-guard.test.js:175,187` pretende il `meta refresh` e l'assenza di `<script>` nei redirect.
  - Un test in `js/lib/costgrid-guard.test.js` pretende `id="clientNewBtn"` senza `onclick`, e due chiamate `addEventListener('click'` che invocano `openClientEditModal(null)` e `saveClientFromModal()`.
- [ ] **Step 2:** `npm test` → falliscono i test appena aggiornati.
- [ ] **Step 3: applicare le modifiche.**
  - In ogni pagina, il blocco dello snippet diventa `<script src="js/sidebar-state.js?v=1"></script>`, nella stessa posizione e senza `defer`.
  - Ogni shim diventa `<script src="js/esc-shim.js?v=1"></script>` nella posizione del blocco sostituito.
  - Dai tre redirect esce la riga `<script>location.replace(...)</script>`.
  - In `costgrid.html` i due `onclick` diventano `id`; il collegamento con `addEventListener` va nello script della pagina, accanto al suo `DOMContentLoaded`.
- [ ] **Step 4:** `npm test` → verde.
- [ ] **Step 5: commit** `feat(ui): no inline head snippet, esc shim, redirect script or onclick`.

### Task 3: spostamento degli script delle pagine

**Files:**
- Create: `js/pages/<pagina>.js` per ogni blocco `<script>` senza `src` rimasto; `js/pages/pipeline-overrides.js` e `js/pages/planning-overrides.js` per i moduli di override
- Modify: ogni pagina con un blocco rimasto

**Interfaces:**
- Consumes: `pageSource`, `rawReadFileSync` (Task 1).
- Produces: nessuna pagina contiene un `<script>` JavaScript senza `src` (`inlineScripts(raw).length === 0`, `scripts/lib/js-code.mjs`).

- [ ] **Step 1:** `grep -nE "import\.meta|currentScript|^\s*import\s" ` sui blocchi inline restanti (estratti con `inlineScripts`) → nessun risultato. Se ce n'è uno, ci si ferma: la copia non sarebbe equivalente.
- [ ] **Step 2: script usa-e-getta nella scratchpad, fuori dal repo.** Per ogni pagina e ogni blocco JavaScript senza `src` (stessa definizione di `inlineScripts`), scrive il contenuto byte per byte in `js/pages/<pagina>.js`. Il blocco `type="module"` che precede uno script classico, in `pipeline.html` e `planning.html`, va in `<pagina>-overrides.js`. Il blocco intero `<script…>…</script>` diventa il tag con lo stesso `type` e `src="js/pages/<file>.js?v=1"`, nessun altro attributo.
- [ ] **Step 3: characterization.** Per ogni pagina, `pageSource(rawReadFileSync(pagina), read)` è identico a `git show HEAD:<pagina>` (HEAD = commit del Task 2). Una qualunque differenza ferma il task.
- [ ] **Step 4:** nessuna pagina ha `inlineScripts(raw).length > 0`; `npm test` → verde con gli stessi conteggi del Task 2.
- [ ] **Step 5: commit** `refactor(ui): move every page script into js/pages/`.

### Task 4: CSP e guard

**Files:**
- Modify: `nginx.conf:24`, `scripts/lib/nginx-headers.mjs`, `scripts/lib/js-code.mjs`, `scripts/security-headers-guard.test.js` (header e regole), `docs/ops/security-headers.md`

**Interfaces:**
- Consumes: `rawReadFileSync` (Task 1), `inlineScripts` (`scripts/lib/js-code.mjs`).
- Produces:
  - `cspSourceMatches(source: string, url: string): boolean` in `nginx-headers.mjs`. Una sorgente senza path, o con path `/`, accetta l'origine intera. Un path che finisce con `/` accetta il prefisso. Un altro path accetta solo l'uguaglianza esatta. Query e frammento dell'URL sono ignorati. `'self'` e le altre parole chiave non accettano URL esterni.
  - `handlerAttributes(html: string): string[]` in `js-code.mjs`: gli attributi `on[a-z]+=` nei tag, esclusi i corpi degli `<script>` e i commenti.

- [ ] **Step 1: test che falliscono.**
  - `cspSourceMatches`:
    - `('https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js', '<stesso URL>?v=1')` → true;
    - con la sorgente `…/npm/marked@15.0.12/marked.min.js` e l'URL `…/npm/lodash@4.17.21/lodash.min.js` → false;
    - con la sorgente `'https://cdn.jsdelivr.net/npm/x@1.0.0/'` e l'URL `'https://cdn.jsdelivr.net/npm/x@1.0.0/a.js'` → true;
    - `('https://cdn.jsdelivr.net', '<qualunque path dell'host>')` → true.
  - `cspSourceProblems` rifiuta `'unsafe-inline'` in `script-src`, e una sorgente esterna di `script-src` senza path o con path `/`.
  - `handlerAttributes`:
    - `<button onclick="x()">` → `['onclick']`;
    - `<button @click="x">`, `<button v-on:click="x">` e uno `<script>a.onclick=f</script>` → `[]`.
  - Sul repo:
    1. nessuna pagina letta con `rawReadFileSync` ha uno script inline (`inlineScripts`) o un attributo handler;
    2. ogni URL di script esterno (tag e caricatori lazy, `scopeFiles`) è accettato da una sorgente di `script-src`;
    3. ogni sorgente di `script-src` con un path accetta almeno uno di quegli URL;
    4. il test esistente sulle origini passa da `includes(origin)` a `some(s => cspSourceMatches(s, url))`.

  Il test di `cspSourceProblems` "accepts the shape of the real policy" prende la forma nuova.
- [ ] **Step 2:** `npx vitest run scripts/security-headers-guard.test.js` → FAIL (funzioni assenti; la CSP attuale ha `'unsafe-inline'` e host interi).
- [ ] **Step 3: implementare le due funzioni.** In `nginx.conf:24` `script-src` diventa `'self' 'unsafe-eval'` seguito dagli otto URL delle Global Constraints, in quell'ordine; il resto dell'header resta identico. Aggiornare:
  - l'header di `security-headers-guard.test.js` (regole nuove, e il limite: gli handler nelle stringhe HTML di `js/*.js` non sono letti);
  - `docs/ops/security-headers.md`.
- [ ] **Step 4:** `npm test` → verde.
- [ ] **Step 5: mutazioni, una alla volta, ciascuna annullata subito dopo.** Ognuna deve far fallire `npm test`:
  1. rimettere `'unsafe-inline'` in `script-src`;
  2. sostituire l'URL di Mermaid con `https://cdn.jsdelivr.net`;
  3. aggiungere `<script>1</script>` a `profile.html`;
  4. aggiungere `onclick="x()"` a un bottone di `team.html`;
  5. cambiare la versione di marked in `help.html`;
  6. togliere `integrity` dal caricatore di Mermaid in `js/pages/help.js` (`cdn-integrity-guard`).
- [ ] **Step 6: commit** `feat(security): CSP script-src without 'unsafe-inline', CDN files by exact URL`.

### Task 5: verifica sullo stack di branch

**Files:** nessun file del repo; la sonda vive nella scratchpad.

- [ ] **Step 1:** `.env` copiato dal checkout principale nel worktree. Poi `scripts/test-branch.sh status`: se uno stack è già attivo per un'altra sessione, ci si ferma e si chiede. Altrimenti `scripts/test-branch.sh up`, poi `status` → `up`.
- [ ] **Step 2: sonda CDP usa-e-getta** (Chrome headless, come nel ciclo 5) contro `http://localhost:8081`. Le credenziali sysadmin vengono dall'utente, mai inventate.
  - **Pagine.** Ogni pagina della tabella Pages di `CLAUDE.md` da sysadmin; `login.html`, `activate.html`, `reset-password.html` senza sessione; `terms.html`; `help.html` su un documento del manuale con un blocco `mermaid`.
  - **Cosa registra.** Per ogni pagina, gli eventi `securitypolicyviolation`, gli errori di console e le risposte ≥ 400 di `js/`.
  - **Esito atteso.** Zero violazioni e zero errori su ogni pagina, e su `help.html` un `<svg>` di Mermaid nel documento.
- [ ] **Step 3: sidebar e iniezioni.**
  - `PDash_sidebarCollapsed='1'` in localStorage, reload di `pipeline.html`: in `DOMContentLoaded` `<html>` ha `data-sidebar="collapsed"`.
  - Da console vengono iniettati `<script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js">` e `<script>window.__x=1</script>`: due violazioni `script-src`, `window._` e `window.__x` restano `undefined`.
- [ ] **Step 4:** riportare i risultati della sonda per pagina. Lo stack resta su per il Gate 2 di `/finish-cycle`. Poi `/security-review` sul branch, prima di `/finish-cycle`.

## Decisioni aperte

1. **I test leggono le pagine tramite un `vi.mock('node:fs')` globale in `setupFiles`, che restituisce il testo ricostruito.** Alternativa scartata: sostituire a mano, nei circa 60 test che leggono pagine, ogni `readFileSync` con un helper. Perché: una lettura dimenticata vedrebbe la pagina senza script e passerebbe le asserzioni di assenza in silenzio, mentre il mock copre ogni chiamata.
2. **Le modifiche dichiarate dalla Spec (head, shim, redirect, handler) precedono lo spostamento, in un commit a sé.** Alternativa scartata: un solo commit. Perché: così la copia esatta si prova byte per byte contro `git show`, senza eccezioni da sottrarre.
3. **Il divieto di una sorgente senza path vale per ogni host esterno di `script-src`, non solo per i tre CDN.** Alternativa scartata: elencare gli host CDN nel guard. Perché: un host nuovo aggiunto intero riaprirebbe lo stesso bypass.
4. **I due handler di `costgrid.html` si collegano nello script della pagina.** Alternativa scartata: in `js/clients.js`. Perché: i modali stanno solo in `costgrid.html`.
