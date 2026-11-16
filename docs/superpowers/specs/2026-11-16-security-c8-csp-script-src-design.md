# CSP senza `'unsafe-inline'` in `script-src` (B-497 parziale) — design spec

**Date:** 2026-11-16
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-16-security-c8-csp-script-src-brief.md`
**Scenario:** 2 (evoluzione)

Nessuna pagina contiene più uno script inline né un attributo handler; `script-src` ammette `'self'`, `'unsafe-eval'` e i soli file CDN usati, per URL esatto.

## 1. Fatti verificati

- `nginx.conf:24`: `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdn.sheetjs.com`, a livello `server`, pinnata da `scripts/security-headers-guard.test.js`.
- Script inline nelle pagine `*.html` della radice, per tipo:
  - lo snippet del `<head>` che legge `PDash_sidebarCollapsed`, identico in ogni pagina che chiama `initNav`;
  - i redirect di `index.html`, `config.html`, `master-client-groups.html` (`location.replace(...)`), ciascuno affiancato da un `<meta http-equiv="refresh" content="0; url=...">` e da un link;
  - lo shim `esc()` classico di `master-clients.html`, `master-currencies.html`, `master-pipelines.html`, `master-roles.html`, `timesheets.html`, `admin.html` (stessa funzione; in `admin.html` con un commento in più);
  - gli override `type="module"` che assegnano `window.*` in `pipeline.html` e `planning.html`, seguiti da uno script classico grande che registra il `Vue.createApp` dentro `DOMContentLoaded`; lo stesso schema classico in `costgrid.html`;
  - lo script `type="module"` con `Vue.createApp(...).mount(...)` delle altre pagine, comprese `login`, `activate`, `reset-password`, `terms`.
- `costgrid.html:718` e `:737` hanno `onclick="openClientEditModal(null)"` e `onclick="saveClientFromModal()"`, nei modali statici `#clientsModal`/`#clientEditModal`, fuori dalla root Vue `#costGridEditorSection`; le due funzioni sono globali di `js/clients.js`.
- Script CDN usati dalle pagine (tag e caricatori lazy):
  - `https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js`
  - `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`
  - `https://cdn.jsdelivr.net/npm/dompurify@3.4.18/dist/purify.min.js`
  - `https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js`
  - `https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js`
  - `https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js` (caricato lazy da `help.html`, build UMD)
  - `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`
  - `https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js`
- La location degli asset `^/(css|js)/[A-Za-z0-9_./-]+\.(css|js)$` serve `js/` senza autenticazione; un file sotto `js/pages/` vi rientra.
- Molti test sotto `js/lib/` e `scripts/` leggono il testo delle pagine `.html` e verificano presenza o assenza di codice dei loro script inline.
- Le pagine non hanno `Cache-Control`; la CSP è un header della risposta e il browser la conserva in cache con la pagina.

## 2. Pagine

- **Script delle pagine.** Ogni blocco `<script>` senza `src` che non è lo snippet del `<head>`, un redirect o lo shim `esc()` è spostato, con il contenuto identico, in `js/pages/<pagina>.js`. Il tag che lo sostituisce sta nella stessa posizione e ha lo stesso tipo: un blocco classico diventa `<script src="js/pages/<pagina>.js?v=1"></script>` senza `defer`, un blocco `type="module"` diventa `<script type="module" src="js/pages/<pagina>.js?v=1"></script>`. Una pagina con due blocchi spostati ha due file: quello del modulo di override si chiama `js/pages/<pagina>-overrides.js`.
- **Snippet del `<head>`** → `js/sidebar-state.js`, caricato come `<script src="js/sidebar-state.js?v=1"></script>` nello stesso punto del `<head>`, bloccante.
- **Shim `esc()`** → un solo `js/esc-shim.js` classico, caricato nella posizione del blocco che sostituisce.
- **Redirect.** Lo script è tolto; restano il `<meta http-equiv="refresh" content="0; ...">` e il link.
- **Handler di `costgrid.html`.** I due bottoni ricevono un `id` e perdono `onclick`; lo script della pagina li collega con `addEventListener('click', ...)` alle stesse chiamate.

## 3. CSP

`script-src 'self' 'unsafe-eval'` seguito dagli URL della sezione 1, uno per file, in quest'ordine. Il resto dell'header è invariato.

## 4. Test

- **Characterization (Scenario 2), solo durante l'esecuzione.** Prima di spostare gli script si conserva l'HTML attuale di ogni pagina; dopo lo spostamento, per ogni pagina `pageSource(pagina)` è identico byte per byte a quell'HTML, escluse le modifiche dichiarate (snippet del `<head>`, shim, redirect, handler). Non resta nel repo.
- **`scripts/lib/page-source.mjs`**: `pageSource(pagina)` restituisce il testo della pagina con ogni tag `js/pages/…` sostituito dal blocco inline originale (stessi attributi, contenuto del file). Ogni test che legge il codice degli script di una pagina la usa al posto della lettura diretta del file.
- **`scripts/security-headers-guard.test.js`**: fallisce se una pagina contiene un `<script>` senza `src` o un attributo `on[a-z]+=`; se `script-src` contiene `'unsafe-inline'`, un host CDN senza path, o un URL CDN che nessuna pagina usa; se una pagina usa un URL CDN che non è in `script-src`.
- **`scripts/cdn-integrity-guard.test.js`**: legge anche `js/pages/`, dove si trova ora il caricatore di Mermaid.
- **Sonda CDP usa-e-getta** sullo stack di branch: ogni pagina della tabella Pages come sysadmin, `login`/`activate`/`reset-password` senza sessione, `terms`, `help.html` su un documento con un diagramma Mermaid; raccoglie `securitypolicyviolation` ed errori di console; inietta da console un `<script src>` di un pacchetto jsdelivr non elencato e uno script inline, attesi entrambi rifiutati.

## 5. Stack principale

Il merge non tocca `api/`. Al Gate 4 il reload di `pdash-nginx` principale si chiede all'utente.

## Criteri di accettazione

1. **CSP** — `script-src` in `nginx.conf` non contiene `'unsafe-inline'` né un host CDN senza path; `style-src` invariato.
2. **Nessuno script inline** — nessuna pagina `*.html` contiene un `<script>` senza `src` (pinnato da `security-headers-guard`).
3. **Handler** — nessun attributo `on[a-z]+=` nelle pagine `*.html` (pinnato da `security-headers-guard`); i bottoni "＋ New client" e "Save" del modale Clients di `costgrid.html` funzionano.
4. **CDN** — `script-src` elenca esattamente gli URL CDN usati dalle pagine (pinnato); sullo stack di branch un `<script src>` di un pacchetto jsdelivr non elencato, aggiunto da console, è rifiutato dalla CSP.
5. **Pagine** — ogni pagina della tabella Pages, `help.html` con un diagramma Mermaid e le pagine pubbliche si aprono sullo stack di branch senza violazioni CSP in console; le azioni principali funzionano.
6. **Copia esatta** — il characterization test della sezione 4 passa per ogni pagina.
7. **Test** — `npm test` verde.
8. **Security review** — `/security-review` sul branch senza finding nuovi, o con quelli trovati proposti come Brief a sé.

## Decisioni aperte

1. **Ogni script inline è spostato in un file servito da `'self'`, nessun hash nella CSP.** Alternativa scartata: hash per tutti o per una parte degli script. Perché: un hash obbliga a ricaricare nginx a ogni modifica dello script, e la pagina resta rotta fra il merge e il reload.
2. **Lo snippet del `<head>` diventa uno script esterno bloccante.** Alternativa scartata: un hash per lo snippet. Perché: una richiesta same-origin in più al primo caricamento costa meno di un hash da mantenere.
3. **I redirect restano affidati al solo `meta refresh`.** Alternativa scartata: un hash, o un `return 301` in nginx. Perché: il `meta refresh` c'è già e fa la stessa cosa.
4. **`script-src` elenca gli URL esatti dei file CDN.** Alternativa scartata: la directory versionata del pacchetto. Perché: è il perimetro più stretto e il guard lo tiene allineato.
5. **`js/pages/` è servito senza autenticazione come il resto di `js/`.** Alternativa scartata: una location con `auth_request` per `js/pages/`. Perché: il codice delle pagine non porta segreti e le API si proteggono da sé.
6. **CSP applicata direttamente.** Alternativa scartata: una fase `Content-Security-Policy-Report-Only`. Perché: non c'è un endpoint che raccolga i report, e la verifica legge comunque la console.
7. **Nessun `Cache-Control` sulle pagine.** Alternativa scartata: `no-cache` sulle `.html`. Perché: una pagina in cache viaggia con la propria CSP.
8. **Un solo ciclo.** Alternativa scartata: due cicli (handler, CDN e pagine piccole; poi gli script grandi). Perché: lo spostamento è meccanico e i test vanno adattati insieme ad esso.
