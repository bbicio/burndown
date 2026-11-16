# Brief — Sicurezza ciclo 7: HTML dei Termini e Condizioni sanitizzato (U-01)

**Tipo:** correzione di divergenza (audit-fix, Scenario 3). Finding coperto: **U-01**, più il controllo di tipo/lunghezza di `content` nello stesso handler (nota fuori scope dello stesso report, inclusa per decisione dell'utente, 2026-11-16).
**Origine:** `docs/superpowers/audits/2026-11-16-url-sinks-audit.md`. Raggruppamento confermato dall'utente il 2026-11-16. Segue la CSP (ciclo 8, `docs/superpowers/briefs/2026-11-16-security-c8-csp-script-src-brief.md`).
**Criterio di raggruppamento:** stesso handler (`PUT /api/app-settings/terms`), stesso dato (`content` dei T&C).
**Natura:** divergenza di correttezza (HTML trattato come fidato senza essere sanitizzato), con dentro una scelta di design aperta (dove e con cosa sanitizzare) lasciata a `/brainstorming`.

## Problema

Il contenuto dei Termini e Condizioni è HTML scritto dal sysadmin, salvato così com'è e reso con `v-html` a ogni utente: un link `javascript:`, un `data:` o un attributo `on…=` nel contenuto girerebbe nella sessione di chiunque passi dalla pagina dei T&C o apra la Privacy Notice.

## Comportamento attuale

- Scrittura: `PUT /api/app-settings/terms` (`api/src/routes/app-settings.js:122-139`, `requireSysAdmin`) controlla solo `content === undefined` (`:125`) e salva il valore in `terms_versions.content` (pubblicazione) e `app_settings.terms_content` (bozza). Nessun controllo di tipo né di lunghezza.
- Editor: `_terms-editor.html:59`, `<textarea>` di HTML grezzo ("Edit HTML content below").
- Lettura: `GET /api/app-settings/terms` (`app-settings.js:33`, `requireAuth`), più `GET /terms/draft`, `/terms/versions`, `/terms/versions/:version` (`:56`, `:74`, `:94`, `requireSysAdmin`).
- Rendering senza sanitizzazione: `terms.html:69` (`v-html="termsContent"`, da `:114`) e `privacy-notice.html:62` (`v-html="content"`, da `:108`). `terms.html` è la pagina obbligatoria dopo ogni nuova versione (`js/nav.js:372-374`).
- Il contenuto di partenza (`api/src/db/migrations/015_app_settings.sql:12`) è HTML semplice: `<h2>`, `<p>` (ed eventualmente liste e link): la sanitizzazione non deve rovinarlo.
- La CSP attuale (`nginx.conf:24`) ammette `'unsafe-inline'`, quindi oggi non blocca il payload; il ciclo 8 la stringe, ma non è la correzione di questo bug.
- Nessuna libreria di sanitizzazione HTML nel progetto.

## Comportamento atteso

1. L'HTML dei T&C che arriva nel DOM non può contenere script, attributi `on…=`, né URL con schema diverso da `http:`, `https:`, `mailto:` o path dell'app; la formattazione legittima (titoli, paragrafi, liste, enfasi, link sicuri) resta.
2. `PUT /api/app-settings/terms` rifiuta un `content` che non sia una stringa, o oltre una lunghezza massima, con `400` e un messaggio in inglese.
3. Le versioni già salvate (incluse quelle storiche lette da `/terms/versions/:version`) vengono mostrate sanitizzate come quelle nuove.

## Vincoli

- Nessun build step: una libreria lato browser arriva da CDN con versione esatta, SRI e `crossorigin` (`scripts/cdn-integrity-guard.test.js`) e deve entrare nella CSP e, dopo il ciclo 8, nei suoi path; una libreria lato server entra in `api/package.json` con `npm audit` pulito e richiede il rebuild dell'immagine `pdash-api` (lezione del ciclo 2: `node_modules` è nell'immagine).
- Cache-busting `?v=N` su ogni file toccato; `v-cloak` e "Script loading order" di `CLAUDE.md`.
- La pubblicazione di una nuova versione forza tutti gli utenti a ri-accettare (`js/nav.js:372`): il ciclo non pubblica versioni né riscrive quelle esistenti senza una decisione esplicita dell'utente.
- Stack principale: nessuna modifica senza conferma; se serve un rebuild di `pdash-api`, conferma esplicita dell'utente, backup prima, mai `-v`.
- Testo per l'utente in inglese.
- **`/security-review` obbligatoria** sul branch prima di `/finish-cycle`.

## Criteri di accettazione

1. **Sanitizzazione** — un contenuto con `<script>`, `<img src=x onerror=…>`, `<a href="javascript:…">` e `<a href="data:…">` viene mostrato in `terms.html` e `privacy-notice.html` senza eseguire nulla e senza quei link/attributi (test che fallisce senza la correzione).
2. **Formattazione** — il contenuto di partenza di `015_app_settings.sql` (e un link `https:` e uno `mailto:`) resta identico dopo la sanitizzazione (test).
3. **Validazione** — `PUT /api/app-settings/terms` con `content` non stringa o troppo lungo → `400`; con un contenuto valido → come oggi (`test-api.js`).
4. **Versioni storiche** — una versione salvata prima del ciclo con un payload è mostrata sanitizzata.
5. **Test** — `npm test` e `scripts/run-tests.sh` verdi.
6. **Security review** — `/security-review` sul branch prima di `/finish-cycle`, senza finding nuovi, o con quelli trovati proposti come Brief a sé.

## Scope escluso esplicitamente

- La CSP (ciclo 8).
- Gli altri `v-html` di `help.html` (alimentati da file del repo, non scrivibili dagli utenti).
- `project-config.html:959`, `:1173` (`projectId` non codificato): riga di `docs/BACKLOG.md` dal `/finish-cycle` di questo ciclo.
- Un editor WYSIWYG o un formato diverso dall'HTML per i T&C.

## Domande aperte per `/brainstorming`

1. **Dove sanitizzare:** nel browser al rendering (copre anche le versioni storiche, libreria da CDN), sul server al salvataggio (il DB resta pulito, ma le versioni già salvate no), o entrambi.
2. **Con cosa:** DOMPurify (de facto standard, lato browser; lato server con jsdom) o un'allowlist propria; la scelta pesa su CSP, SRI e dipendenze.
3. **Allowlist di tag e attributi** ammessi, e degli schemi di URL (path dell'app, `http:`, `https:`, `mailto:`).
4. **Lunghezza massima** di `content`.
5. **Il contenuto attuale in produzione** va controllato prima (se contiene già markup che la sanitizzazione toglierebbe)? Come, senza leggere il DB di produzione dal repo.

## Nuovi finding durante il ciclo

Ogni nuovo finding scoperto durante `/brainstorming` o l'esecuzione di questo ciclo va **isolato e proposto come Brief a sé**, mai assorbito nel fix di questo ciclo (guardia dello Scenario 3 di `PROCESS.md`).
