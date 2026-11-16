# HTML dei Termini e Condizioni sanitizzato al rendering (U-01) — design spec

**Date:** 2026-11-16
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-16-security-c7-terms-sanitize-brief.md`
**Scenario:** 3 (audit-fix), finding U-01 di `docs/superpowers/audits/2026-11-16-url-sinks-audit.md`

Il contenuto dei Termini e Condizioni arriva nel DOM solo dopo una sanitizzazione con un'allowlist di tag, attributi e schemi; il server rifiuta un `content` che non sia una stringa entro una lunghezza massima.

## 1. Fatti verificati

- `terms.html:69` e `privacy-notice.html:62` rendono `content` con `v-html`, senza sanitizzazione; i dati arrivano da `GET /api/app-settings/terms` (`api/src/routes/app-settings.js:33`).
- `PUT /api/app-settings/terms` (`app-settings.js:122-139`, `requireSysAdmin`) controlla solo `content === undefined`.
- Il contenuto di partenza (`api/src/db/migrations/015_app_settings.sql:12`) usa solo `<h2>`, `<p>`, `<ul>`, `<li>`, `<strong>`.
- Le due pagine caricano già librerie da CDN con SRI (`terms.html:89`, `privacy-notice.html:77-78`); `cdn.jsdelivr.net` è in `script-src` (`nginx.conf:24`).
- Il frontend ha `jsdom` e `vitest` come dipendenze di sviluppo (`package.json`); nessuna libreria di sanitizzazione HTML nel progetto.
- DOMPurify 3.4.18 è l'ultima versione su npm (2026-11-16); `https://cdn.jsdelivr.net/npm/dompurify@3.4.18/dist/purify.min.js` → `sha384-lkArbWjiZKuE+bzKbj1vOEF7DKYBDNvgwZMCt5OH8bdRB92zpzyNska9Q/XKPHQD`.

## 2. Sanitizzazione (browser)

Nuovo modulo `js/lib/terms-html.js` (ES module con bridge `window.safeTermsHtml`), `safeTermsHtml(html)` → stringa:

- Con `window.DOMPurify` presente: `DOMPurify.sanitize(html, CONFIG)` con
  - `ALLOWED_TAGS`: `h1 h2 h3 h4 p br hr ul ol li strong em b i u blockquote a table thead tbody tr th td`;
  - `ALLOWED_ATTR`: `href`;
  - `ALLOWED_URI_REGEXP`: path dell'app (`/` non seguito da `/`), `https:`, `http:`, `mailto:`; un altro `href` viene tolto;
  - un tag non ammesso viene rimosso e il suo testo resta (`<script>` e `<style>` con il loro contenuto spariscono).
- Senza `window.DOMPurify`: il testo con l'escape di `esc()` (fallisce chiuso, nessun HTML).
- Un valore non stringa → stringa vuota.

`terms.html` e `privacy-notice.html` caricano DOMPurify 3.4.18 da jsdelivr (path e hash di §1, `crossorigin="anonymous"`, `defer`) e `js/lib/terms-html.js?v=1` prima dello script della pagina; il `v-html` riceve `safeTermsHtml(...)` del contenuto.

## 3. Validazione (server)

`PUT /api/app-settings/terms`: un `content` che non sia una stringa o lungo più di 100000 caratteri → `400 { error: 'content must be a string of at most 100000 characters' }`, prima di ogni scrittura. Nessuna dipendenza nuova lato server.

## 4. Test

- vitest su `js/lib/terms-html.js` (DOMPurify come `devDependency` della radice, solo per i test, mai servito):
  - `<script>…</script>`, `<img src=x onerror=…>`, `<a href="javascript:…">`, `<a href="data:…">`, `style=`, `class=`, `id=` tolti;
  - il contenuto di `015_app_settings.sql`, un link `https:`, uno `mailto:` e un path `/pipeline.html` restano identici;
  - senza DOMPurify → testo con escape, nessun tag;
  - non stringa → `''`.
- `test-api.js`: `content` numero → 400; 100001 caratteri → 400; un contenuto valido come oggi.
- `scripts/cdn-integrity-guard.test.js` copre il nuovo tag CDN senza modifiche.

## 5. Contenuto in produzione

Nessun controllo preliminare del DB: la regola toglie solo markup non ammesso. Dopo il deploy il sysadmin apre la Privacy Notice e verifica che il testo sia invariato.

## 6. Stack principale

Al Gate 4, `docker compose restart api` (deroga di `CLAUDE.md`). Niente rebuild, niente migrazioni.

## Criteri di accettazione

1. **Sanitizzazione** — i payload di §4 non arrivano nel DOM di `terms.html` e `privacy-notice.html` (vitest su `terms-html.js`; nel browser, una bozza con quei payload resa sanitizzata).
2. **Formattazione** — il contenuto di partenza e i link ammessi restano identici (vitest).
3. **Validazione** — `PUT /api/app-settings/terms` con `content` non stringa o oltre 100000 caratteri → 400; con un contenuto valido come oggi (`test-api.js`).
4. **Versioni storiche** — una versione salvata con un payload è mostrata sanitizzata (rendering lato browser, verificato sullo stack di branch).
5. **Test** — `npm test` e `scripts/run-tests.sh` verdi; `cdn-integrity-guard` verde sul nuovo tag.
6. **Security review** — `/security-review` sul branch prima di `/finish-cycle`, senza finding nuovi, o con quelli trovati proposti come Brief a sé.

## Decisioni aperte

1. **Sanitizzazione nel browser al rendering, non sul server al salvataggio.** Alternativa scartata: DOMPurify con jsdom in `api/` al salvataggio, o entrambi. Perché: copre anche le versioni già salvate senza migrazione e non richiede il rebuild di `pdash-api`; scelta dell'utente.
2. **Allowlist: tag di testo e tabelle semplici, solo `href` sui link con path dell'app, `https`, `http`, `mailto`.** Alternativa scartata: la configurazione predefinita di DOMPurify. Perché: quella ammette anche `style`, `class`, immagini e altri schemi; scelta dell'utente.
3. **Lunghezza massima di `content`: 100000 caratteri.** Alternativa scartata: nessun limite. Perché: circa trenta volte il contenuto di partenza, e un limite chiude il corpo arbitrario; scelta dell'utente.
4. **Senza DOMPurify il contenuto si mostra come testo con escape.** Alternativa scartata: mostrare l'HTML grezzo come oggi. Perché: un CDN irraggiungibile non deve riaprire la falla.
5. **Nessun controllo preliminare del contenuto in produzione.** Alternativa scartata: leggere il contenuto attuale prima del deploy. Perché: la regola toglie solo markup non ammesso; resta una verifica visiva dopo il deploy.
