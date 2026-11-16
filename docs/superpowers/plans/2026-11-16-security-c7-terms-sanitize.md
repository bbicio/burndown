# HTML dei Termini e Condizioni sanitizzato al rendering (U-01) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `terms.html` e `privacy-notice.html` mostrano i T&C solo dopo `safeTermsHtml()` (DOMPurify con un'allowlist), e `PUT /api/app-settings/terms` rifiuta un `content` non stringa o oltre 100000 caratteri.

**Architecture:** un modulo puro `js/lib/terms-html.js` incapsula DOMPurify (caricato da CDN con SRI) e il ripiego con escape; le due pagine lo usano in un computed passato a `v-html`. Il server aggiunge un controllo prima della scrittura.

**Tech Stack:** Vue 3 da CDN, DOMPurify 3.4.18, vitest + jsdom, Express, `test-api.js` via `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-11-16-security-c7-terms-sanitize-design.md`
**Branch:** `security-c7-terms-sanitize`
**Risk class:** high-risk — file condivisi caricati da più pagine (una libreria CDN nuova su `terms.html`, la pagina obbligatoria per ogni utente, e su `privacy-notice.html`) e una route di autorizzazione `requireSysAdmin`

**Indipendenza dei task:** 1 → 2 (le pagine usano il modulo); 3 indipendente; 4 dopo tutti.

## Global Constraints

- DOMPurify `3.4.18`, URL `https://cdn.jsdelivr.net/npm/dompurify@3.4.18/dist/purify.min.js`, `integrity="sha384-lkArbWjiZKuE+bzKbj1vOEF7DKYBDNvgwZMCt5OH8bdRB92zpzyNska9Q/XKPHQD"`, `crossorigin="anonymous"`, `defer`.
- `ALLOWED_TAGS`: `h1 h2 h3 h4 p br hr ul ol li strong em b i u blockquote a table thead tbody tr th td`; `ALLOWED_ATTR`: `href`; schemi: path dell'app (`/` non seguito da `/`), `https:`, `http:`, `mailto:`.
- Senza `window.DOMPurify`: testo con l'escape di `& < > "` (lo stesso di `esc()` di `js/core.js:201`, reimplementato nel modulo perché `terms.html` non carica `core.js`); un valore non stringa → `''`.
- Messaggio del server: `content must be a string of at most 100000 characters`, `400 { error }`.
- Nuovo file: `js/lib/terms-html.js?v=1`; ogni altro file versionato toccato riceve il suo `?v=N` aggiornato ovunque (`CLAUDE.md` "Cache-busting").
- Ogni modifica a un file HTML con lo strumento Edit (mai `Set-Content`, che aggiunge un BOM).
- Testo per l'utente in inglese.
- Stack principale: solo `docker compose restart api` al Gate 4.

## Review Focus

1. **Link relativi senza `/` iniziale** (`href="privacy.html"`, `href="#section"`): la regola di URI li toglie (solo `/…`, `https`, `http`, `mailto`) — atteso dalla Spec, ma va visto che il contenuto di partenza non ne ha. Test in Task 1 sul contenuto di `015_app_settings.sql`.
2. **`href` con maiuscole o spazi** (`JaVaScRiPt:`, ` javascript:`, `java&#x09;script:`): tolto. Test in Task 1.
3. **`//evil.com`** (path assoluto di protocollo): tolto, non è un path dell'app. Test in Task 1.
4. **DOMPurify che arriva dopo il primo render** (rete lenta): `defer` lo esegue prima del modulo della pagina (stessa coda), quindi al primo render c'è; se manca il computed mostra testo con escape. Coperto dall'ordine dei tag (Task 2, test di guardia) e dal test del ripiego (Task 1).
5. **`content` stringa vuota**: oggi accettata e salvata; resta accettata (è una stringa entro il limite). Test in Task 3.

---

### Task 1: `js/lib/terms-html.js`

**Files:**
- Create: `js/lib/terms-html.js`, `js/lib/terms-html.test.js`
- Modify: `package.json`, `package-lock.json` (`npm install --save-dev --save-exact dompurify@3.4.18`)

**Interfaces:**
- Produces: `export function safeTermsHtml(html: unknown): string`; bridge `window.safeTermsHtml = safeTermsHtml`.

- [ ] **Step 1:** `npm install --save-dev --save-exact dompurify@3.4.18`; `npm audit --omit=dev` → 0 (la dipendenza è solo dev); `npm audit` → nessuna advisory nuova su `dompurify`.
- [ ] **Step 2: Test che fallisce** `js/lib/terms-html.test.js` (`// @vitest-environment jsdom`, `import createDOMPurify from 'dompurify'`; in un `beforeEach` `window.DOMPurify = createDOMPurify(window)`, in un test del ripiego `delete window.DOMPurify`):
  - `strips scripts and handlers`: per `<p>a</p><script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<p onclick="x()">b</p>` il risultato non contiene `script`, `onerror`, `onclick`, `<img`.
  - `drops unsafe hrefs`: `javascript:alert(1)`, `JaVaScRiPt:alert(1)`, ` javascript:alert(1)`, `data:text/html,x`, `//evil.com/x`, `vbscript:x` → `<a>` senza `href` (`expect(out).not.toMatch(/href=/)`).
  - `keeps allowed links`: `https://example.com/x`, `http://example.com`, `mailto:a@b.c`, `/pipeline.html` → `href` identico nel risultato.
  - `drops style, class and id`: `<p style="color:red" class="x" id="y">t</p>` → `<p>t</p>`.
  - `keeps the starting content`: il contenuto HTML di `api/src/db/migrations/015_app_settings.sql` (letto dal file con la regex `'(<h2>[\s\S]*?)'\)`, `''` → `'`) → `safeTermsHtml(c) === c`.
  - `falls back to escaped text without DOMPurify`: `safeTermsHtml('<b>x</b> & "y"') === '&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;'`.
  - `non-string gives an empty string`: `null`, `undefined`, `42`, `{}` → `''`.
- [ ] **Step 3:** `npx vitest run js/lib/terms-html.test.js` → FAIL, modulo assente.
- [ ] **Step 4:** implementare `safeTermsHtml` con la configurazione dei Global Constraints (`ALLOWED_URI_REGEXP` = `/^(?:https?:|mailto:|\/(?!\/))/i`), commento di testa di una riga come gli altri moduli di `js/lib/`, bridge `window`. Il file si scrive con lo strumento Write (la regex ha backslash).
- [ ] **Step 5:** test → PASS.
- [ ] **Step 6: Commit** `feat(terms): safeTermsHtml sanitises the Terms HTML with DOMPurify (U-01)`.

### Task 2: le due pagine

**Files:**
- Modify: `terms.html` (tag ~`:89-91`, `v-html` `:69`, Vue app `:91-…`)
- Modify: `privacy-notice.html` (tag ~`:77-87`, `v-html` `:62`, Vue app `:87-…`)
- Create: `js/lib/terms-html-guard.test.js`

**Interfaces:**
- Consumes: `window.safeTermsHtml` (Task 1).

- [ ] **Step 1: Guardia che fallisce** `js/lib/terms-html-guard.test.js`: per `terms.html` e `privacy-notice.html`, letti dal disco:
  - c'è un `<script defer src="https://cdn.jsdelivr.net/npm/dompurify@3.4.18/dist/purify.min.js" integrity="sha384-lkArbWjiZKuE+bzKbj1vOEF7DKYBDNvgwZMCt5OH8bdRB92zpzyNska9Q/XKPHQD" crossorigin="anonymous">`;
  - c'è `<script type="module" src="js/lib/terms-html.js?v=1">`;
  - entrambi stanno prima dell'ultimo `<script type="module">` inline (quello dell'app Vue);
  - ogni `v-html="…"` della pagina ha valore `safeContent`.
- [ ] **Step 2:** `npx vitest run js/lib/terms-html-guard.test.js` → FAIL.
- [ ] **Step 3:** nelle due pagine: i due tag prima dello script dell'app; un computed `safeContent() { return window.safeTermsHtml(this.termsContent) }` in `terms.html` (`this.content` in `privacy-notice.html`); `v-html="safeContent"`.
- [ ] **Step 4:** `npx vitest run js/lib/terms-html-guard.test.js scripts/cdn-integrity-guard.test.js scripts/security-headers-guard.test.js scripts/nginx-serve.test.js js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js` → PASS; controllo BOM: `head -c3 terms.html privacy-notice.html | od -c | head -2` non mostra `357 273 277`.
- [ ] **Step 5: Commit** `fix(terms): Terms and Privacy Notice render the Terms HTML through safeTermsHtml (U-01)`.

### Task 3: validazione di `content` sul server

**Files:**
- Modify: `api/src/routes/app-settings.js:125`
- Modify: `test-api.js` (accanto ai controlli esistenti dei T&C: cercare `app-settings/terms` in `test-api.js`; se non ce ne sono, in coda a `testSecurity()`)

- [ ] **Step 1: Controlli che falliscono** con il sysadmin (`sysadminCookie`), prefisso `TV-`; prima di tutto leggere `GET /api/app-settings/terms/draft` e, in `finally`, rimettere la bozza con `PUT { content: <bozza letta>, publishNewVersion: false }` (mai `publishNewVersion: true`):
  - `TV-01` `PUT { content: 42 }` → 400 con il messaggio dei Global Constraints;
  - `TV-02` `PUT { content: 'x'.repeat(100001) }` → 400;
  - `TV-03` `PUT { content: '<p>ok</p>', publishNewVersion: false }` → 200 come oggi;
  - `TV-04` `PUT { content: '', publishNewVersion: false }` → 200 (Review Focus 5).
- [ ] **Step 2:** `bash scripts/run-tests.sh` (`.env` copiato dal checkout principale) → TV-01 e TV-02 `✗`, TV-03 e TV-04 `✓`.
- [ ] **Step 3:** in `app-settings.js` sostituire il controllo `content === undefined` con `typeof content !== 'string' || content.length > 100000` → 400 con il messaggio esatto.
- [ ] **Step 4:** `bash scripts/run-tests.sh` → TV-01..04 `✓`, exit 0.
- [ ] **Step 5: Commit** `fix(api): Terms content must be a string of at most 100000 characters`.

### Task 4: BACKLOG e security review

**Files:**
- Modify: `docs/BACKLOG.md` (una riga dopo l'ultima)

- [ ] **Step 1:** riga nuova nel formato esistente (origine `docs/superpowers/audits/2026-11-16-url-sinks-audit.md`, note fuori scope, stato `open`): `project-config.html:959` e `:1173` costruiscono `/portfolio.html?projectId=` con l'id non codificato (innocuo per lo schema, incoerente con gli altri punti). Verifica: `grep -n "portfolio.html?projectId=' + this.project.id" project-config.html` → due righe, 2026-11-16.
- [ ] **Step 2: Commit** `docs(backlog): unencoded projectId in project-config links`.
- [ ] **Step 3: `/security-review` sul branch** (la sessione). Expected: nessun finding nuovo; un finding nuovo si propone come Brief a sé, salvo diversa decisione dell'utente.

## Criteri di accettazione

Quelli della Spec (`docs/superpowers/specs/2026-11-16-security-c7-terms-sanitize-design.md`, `## Criteri di accettazione`); i criteri 1 (nel browser) e 4 si verificano a mano al Gate 2 **sullo stack di branch** (dati clonati, mai il principale): in `_terms-editor.html` si pubblica una versione con i payload di Task 1, perché `GET /api/app-settings/terms` (`app-settings.js:33-41`) restituisce l'ultima versione pubblicata, non la bozza; poi si aprono `terms.html` (che compare subito, la versione è nuova) e la Privacy Notice.

## Decisioni aperte

1. **Il ripiego senza DOMPurify reimplementa l'escape nel modulo invece di chiamare `esc()` di `js/core.js`.** Alternativa scartata: caricare `core.js` in `terms.html`. Perché: `terms.html` oggi non lo carica, e il modulo resta autonomo e testabile.
2. **La pagina usa un computed `safeContent` invece di chiamare `safeTermsHtml` nel template.** Alternativa scartata: `v-html="safeTermsHtml(content)"`. Perché: un template Vue non vede i global di `window`.
3. **La verifica nel browser dei payload pubblica una versione sullo stack di branch.** Alternativa scartata: verificare solo la bozza. Perché: le due pagine mostrano la versione pubblicata; lo stack di branch ha dati clonati e si butta via.
