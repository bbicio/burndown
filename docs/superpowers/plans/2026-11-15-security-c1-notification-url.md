# Link delle notifiche validato (S-01) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un `url` di notifica è accettato solo se è un percorso relativo all'app o un URL assoluto sull'origine dell'app, in scrittura, nella mail e al render nel client.

**Architecture:** Un modulo gemello `notification-url` (`api/src/lib/` CommonJS, `js/lib/` ES module con bridge `window.`), stesso schema di `dates.js`. Il server lo applica in `POST /api/notifications` e nella mail; il client lo applica ai tre punti di `js/notifications.js` che seguono o rendono `n.url`. Nessuna migration.

**Tech Stack:** Node/Express, `node:test` (backend), vitest + jsdom (frontend), `test-api.js` (integrazione).

**Spec:** `docs/superpowers/specs/2026-11-15-security-c1-notification-url-design.md`
**Branch:** `security-c1-notification-url`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/notifications.js` e il nuovo `js/lib/notification-url.js` su 20 pagine)

## Global Constraints

- Messaggio del `400`, esattamente: `url must be an app path or an absolute URL on the app origin`; `code: 'URL_RULE'`.
- Regola: `null`/`undefined` valido; stringa ≤ 2048 caratteri, senza caratteri di controllo (`\u0000-\u001f`, `\u007f`), spazi né `\`; percorso relativo = inizia con `/` e il secondo carattere non è `/`; assoluto = `new URL(v)` con protocollo `http:`/`https:` e `origin` uguale all'origine attesa.
- Origine attesa: browser `location.origin`; server `new URL(APP_URL || 'http://localhost').origin` (un `APP_URL` non parsabile rende invalido ogni assoluto).
- L'`url` si valida, non si normalizza; `createNotification` interno non cambia; nessuna migration.
- Testo rivolto all'utente in inglese.
- `?v=N`: ogni file versionato modificato si aggiorna in tutti i riferimenti (`CLAUDE.md`, «Cache-busting»).
- Nessuna operazione Docker sullo stack principale; il worktree nuovo ha bisogno di `.env` copiato dal checkout principale e di `npm ci` (root e `api/`).

## Review Focus

- `http://localhost@evil.com` e `http://evil.com@localhost`: il primo ha origine `evil.com` (invalido), il secondo `localhost` (valido, naviga su localhost) — il test fissa che si decide sull'origine parsata, non sul prefisso.
- `/%5Cevil` e `/%2F%2Fevil`: restano percorsi relativi validi (nessuna decodifica); il test lo fissa perché non devono diventare falsi positivi.
- `url` non stringa (`123`, `{}`, `['/a']`) nel body JSON: `400`, non un `500` né un cast silenzioso.
- Stringa vuota `''` e solo spazi: `''` equivale ad assente (la modale invia `undefined`, ma un client terzo può mandare `''`); `'   '` è invalido.
- Notifica via SSE con `url` non valido: non deve produrre link né toast navigabile, come una riga letta da `GET /api/notifications`.

## Esecuzione

I task non sono indipendenti: T2 e T6 leggono il modulo di T1, T5 legge quello di T2, T4 legge `notificationLink` di T1. Modalità **nativa** per §6.1 (ciclo piccolo, nessuna migration né nuova API, task sequenziali).

---

### Task 1: modulo lato server

**Files:**
- Create: `api/src/lib/notification-url.js`
- Test: `api/src/lib/notification-url.test.js`

**Interfaces:**
- Produces (`module.exports`): `URL_RULE = 'URL_RULE'`; `URL_RULE_MESSAGE` (il messaggio di Global Constraints); `notificationUrl(value, origin: string) -> string|null`; `notificationUrlError(value, appUrl: string|undefined) -> string|null` (messaggio o `null`); `notificationLink(value, appUrl) -> string|null` (URL assoluto per la mail: assoluto valido com'è, relativo valido → `origin + value`, altrimenti `null`).

- [ ] **Step 1: Write the failing test** in `notification-url.test.js` (`node:test`, `assert/strict`), una tabella `[valore, atteso valido]` con `origin = 'http://localhost'`. Validi: `'/pipeline.html'`, `'/costgrid.html?cgId=1&verId=2#x'`, `'http://localhost/pipeline.html'`, `'http://localhost:80/x'`, `'http://evil.com@localhost/x'`, `'/%5Cevil'`, `'/%2F%2Fevil'`. Non validi: `'javascript:alert(1)'`, `'JaVaScRiPt:alert(1)'`, `'data:text/html,x'`, `'//example.com'`, `'/\\evil'`, `'\\\\host\\x'`, `'https://example.com/x'`, `'http://localhost.evil.com/x'`, `'http://localhost@evil.com/x'`, `'https://localhost/x'` (schema diverso), `'/a\nb'`, `'/a\u0000b'`, `'/a b'`, `'   '`, `'pipeline.html'`, `'/' + 'a'.repeat(2048)`, e non stringhe `123`, `{}`, `['/a']`. Assert: `notificationUrl(v, origin)` è `v` per i validi e `null` per gli altri; `notificationUrl(null|undefined|'', origin)` è `null` e `notificationUrlError(null|undefined|'', 'http://localhost')` è `null`; `notificationUrlError('javascript:x', 'http://localhost')` è `URL_RULE_MESSAGE`; `notificationUrlError(123, …)` è `URL_RULE_MESSAGE`; con `appUrl = undefined` un assoluto `http://localhost/x` è valido (default), con `appUrl = 'not a url'` un assoluto è invalido e `'/x'` resta valido; `notificationLink('/pipeline.html', 'http://localhost')` è `'http://localhost/pipeline.html'`, `notificationLink('http://localhost/a', …)` è `'http://localhost/a'`, `notificationLink('javascript:x', …)` e `notificationLink(null, …)` sono `null`.
- [ ] **Step 2: Run** `cd api && node --test src/lib/notification-url.test.js`. Expected: FAIL, modulo mancante.
- [ ] **Step 3: Implement** il modulo con le firme sopra. `notificationUrl`: `''`/`null`/`undefined` → `null`; non stringa → `null`; poi lunghezza, regex `/[\u0000- \u007f\\]/`, ramo relativo, ramo assoluto con `new URL` in `try/catch` e confronto `u.origin === origin` (protocollo `http:`/`https:`). `notificationUrlError` calcola l'origine da `appUrl || 'http://localhost'` in `try/catch` (origine `null` se non parsabile) e distingue «assente» da «presente ma non valido».
- [ ] **Step 4: Run** lo stesso comando. Expected: PASS.
- [ ] **Step 5: Commit** `feat(notifications): server-side notification-url rule`.

### Task 2: gemello browser e parità

**Files:**
- Create: `js/lib/notification-url.js`
- Test: `js/lib/notification-url.test.js`, `js/lib/notification-url-guard.test.js`

**Interfaces:**
- Consumes: `api/src/lib/notification-url.js` (T1), solo `notificationUrl`.
- Produces: `export function notificationUrl(value, origin)` e `window.notificationUrl = notificationUrl`.

- [ ] **Step 1: Write the failing tests.** `notification-url.test.js` (vitest): la stessa tabella di T1 contro `notificationUrl(v, 'http://localhost')`. `notification-url-guard.test.js`: stesso schema di `dates-guard.test.js` (`createRequire` verso `../../api/src/lib/notification-url.js`), la stessa tabella (copiata, non importata: i due test restano indipendenti) e `expect(web.notificationUrl(v, o)).toBe(server.notificationUrl(v, o))` per ogni caso, con due origini (`'http://localhost'`, `'https://app.example.com'`).
- [ ] **Step 2: Run** `npx vitest run js/lib/notification-url.test.js js/lib/notification-url-guard.test.js`. Expected: FAIL, modulo mancante.
- [ ] **Step 3: Implement** `js/lib/notification-url.js` con la stessa logica di `notificationUrl` del server (commento di testa: gemello di `api/src/lib/notification-url.js`, la parità è fissata da `notification-url-guard.test.js`). Le due copie devono produrre risultati identici, non condividere codice.
- [ ] **Step 4: Run** gli stessi file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(notifications): browser twin of notification-url`.

### Task 3: validazione in `POST /api/notifications`

**Files:**
- Modify: `api/src/routes/notifications.js:136-186` (importa `notificationUrlError`, `URL_RULE`)
- Modify: `test-api.js` (nuova `testNotificationUrl()` dopo `testMailFailures` in `main()`, più la riga della chiamata)

**Interfaces:**
- Consumes: `notificationUrlError(value, process.env.APP_URL)`, `URL_RULE`.

- [ ] **Step 1: Write the failing test** `testNotificationUrl()` con `section('Notification url rule (S-01)')`. Per ogni valore non valido di `javascript:alert(1)`, `data:text/html,x`, `//example.com`, `https://example.com/x`, `/\evil`, `'/a\nb'`, `123`: tag univoco nel valore dove è una stringa; `POST /api/notifications` come `adminCookie` con `{ userId: plain.id, title: '__nurl__', url, channels: ['push'] }` e come broadcast (senza `userId`); assert `status === 400`, `data.code === 'URL_RULE'`, `data.error` uguale al messaggio, e `sql('SELECT count(*)::int AS n FROM notifications WHERE title = $1', ['__nurl__'])` è `0`. Poi i `201`: `/pipeline.html` e `${APP}/pipeline.html` con `const APP = process.env.APP_URL || 'http://localhost'`, verificando la riga con `url` salvato com'è; un utente plain può mandare un `url` valido a un altro e riceve `400` per uno non valido (`getPlainUser()`); `url: ''` e assente → `201`. Cleanup: `DELETE FROM notifications WHERE title = '__nurl__'` con `sql`, anche in caso di fallimento di un assert.
- [ ] **Step 2: Run** `scripts/run-tests.sh` (unica esecuzione di questo task, vedi PROCESS.md §6.2). Expected: FAIL sui casi `400` (oggi `201`).
- [ ] **Step 3: Implement** in `POST /`: subito dopo il controllo del titolo, `const urlErr = notificationUrlError(url, process.env.APP_URL); if (urlErr) return res.status(400).json({ error: urlErr, code: URL_RULE });`; trattare `url === ''` come assente (già gestito dal modulo). Nessun altro cambiamento nella route.
- [ ] **Step 4: Run** `scripts/run-tests.sh`. Expected: `testNotificationUrl` verde e il resto invariato.
- [ ] **Step 5: Commit** `fix(notifications): reject a notification url outside the app origin (S-01)`.

### Task 4: link della mail

**Files:**
- Modify: `api/src/services/email.js:148-164` (importa `notificationLink`)
- Test: `api/src/lib/notification-url.test.js` (già copre `notificationLink`, T1)

**Interfaces:**
- Consumes: `notificationLink(value, APP_URL)`.

- [ ] **Step 1: Write the failing test** in `api/src/services/email-notification-link.test.js` (`node:test`) su una funzione pura `renderAdminNotificationLink(url)` che `email.js` esporta (vedi Step 3). Assert: `renderAdminNotificationLink('/pipeline.html')` contiene `href="http://localhost/pipeline.html"` (con `APP_URL` di default); `renderAdminNotificationLink('javascript:alert(1)')` e `renderAdminNotificationLink(null)` sono `''`; `renderAdminNotificationLink('/x"onmouseover="y')` non contiene `"onmouseover` non escapato.
- [ ] **Step 2: Run** `cd api && node --test src/services/email-notification-link.test.js`. Expected: FAIL, funzione mancante.
- [ ] **Step 3: Implement** `renderAdminNotificationLink(url)` in `email.js` con `notificationLink(url, APP_URL)` e `escapeHtml` (già importato), usarla in `sendAdminNotificationEmail` al posto della riga `link ? … : ''`, ed esportarla. Il `startsWith('http')` sparisce.
- [ ] **Step 4: Run** lo stesso comando. Expected: PASS.
- [ ] **Step 5: Commit** `fix(notifications): the notification email links only a valid url (S-01)`.

### Task 5: render e navigazione nel client, cablaggio delle pagine

**Files:**
- Modify: `js/notifications.js:78-81`, `:155-156`, `:162-177`
- Modify: le 20 pagine che includono `js/lib/notif-browser.js` (`grep -l "notif-browser" *.html`): una riga `<script type="module" src="js/lib/notification-url.js?v=1"></script>` subito dopo quella di `notif-browser.js`, e `js/notifications.js?v=4` → `?v=5`
- Modify: `js/lib/nav-shell-guard.test.js:97` (`?v=4` → `?v=5`)
- Test: `js/lib/notifications-ui.test.js` (nuovo `describe`)

**Interfaces:**
- Consumes: `window.notificationUrl(value, origin)` (T2), letto dentro le funzioni e mai a livello top-level.
- Produces: `function safeNotifUrl(url)` in `js/notifications.js`, `typeof window.notificationUrl === 'function' ? window.notificationUrl(url, location.origin) : null` (senza il modulo, nessun link: esito sicuro).

- [ ] **Step 1: Write the failing tests** in `notifications-ui.test.js`, esponendo `renderNotifItem` e `safeNotifUrl` dal `new Function` e impostando `globalThis.notificationUrl` con la vera funzione di `js/lib/notification-url.js` (import ES nel test, `location.origin` di jsdom). Assert: `renderNotifItem({ id: 'a', title: 't', created_at: new Date().toISOString(), url: 'javascript:alert(1)' })` non contiene `href=` né `data-url`; con `url: '/pipeline.html'` contiene `href="/pipeline.html"` e `data-url="/pipeline.html"`; con `url: 'http://evil.com/x'` nessun link; il click su un `.notif-item` costruito dal markup con `data-url` assente non cambia `location`; `safeNotifUrl` senza `window.notificationUrl` è `null`. La navigazione di `maybeShowBrowserNotification` e del click non è osservabile in jsdom (`location.href` non si sostituisce): la fissa il guard di T6, che impone `safeNotifUrl` su ogni `location.href =`.
- [ ] **Step 2: Run** `npx vitest run js/lib/notifications-ui.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Aggiungere `safeNotifUrl`; in `maybeShowBrowserNotification` e nel click della riga navigare solo se `safeNotifUrl(...)` è non nullo (la riga legge `safeNotifUrl(el.dataset.url)` anche lì, perché `data-url` è modificabile dal DOM); in `renderNotifItem` calcolare `const url = safeNotifUrl(n.url)` e usarlo per `urlAttr` e `linkHtml`. Poi cablare le 20 pagine e i due `?v=` (`sed -i` mirato, poi `git diff --stat` per controllare 20+1 file; un controllo con `grep -c "notification-url.js?v=1" *.html` deve dare una riga per pagina).
- [ ] **Step 4: Run** `npx vitest run js/lib/notifications-ui.test.js js/lib/nav-shell-guard.test.js js/lib/notification-url.test.js`. Expected: PASS. Prova manuale in browser (criterio 3 della spec, da fare una volta al Gate 2): inserire a mano nel DB una riga con `url = 'javascript:alert(1)'` e aprire il pannello: nessun link, nessuna navigazione al click.
- [ ] **Step 5: Commit** `fix(notifications): the client follows only a valid notification url (S-01)`.

### Task 6: guard stretto e verifica finale

**Files:**
- Modify: `js/lib/notification-url-guard.test.js` (aggiunge i controlli sui consumatori)

- [ ] **Step 1: Write the failing test** (aggiunto al file di T2): ogni occorrenza di `location.href =` in `js/notifications.js` sta su una riga che contiene `safeNotifUrl`; `api/src/services/email.js` non contiene `startsWith('http')`; ogni pagina `*.html` che include `js/notifications.js` include anche `js/lib/notification-url.js`, con un solo `?v=` per `notification-url.js` su tutte le pagine; `js/notifications.js` non legge `.url` di una notifica fuori da `safeNotifUrl`/`renderNotifItem`/`maybeShowBrowserNotification` (regex su `n\.url`, `el\.dataset\.url`).
- [ ] **Step 2: Run** `npx vitest run js/lib/notification-url-guard.test.js`. Expected: PASS se T4-T5 sono corretti; un FAIL indica un punto non cablato (correggerlo, non allentare il guard).
- [ ] **Step 3: Verifica finale.** `cd api && node --test src/**/*.test.js`, poi `npm test` dalla radice. Expected: entrambe verdi. `scripts/run-tests.sh` e `/security-review` sul branch li lancia `/finish-cycle` (Gate 3).
- [ ] **Step 4: Commit** `test(notifications): guard the notification-url consumers (S-01)`.

---

La documentazione (`docs/js/lib.md`, `docs/api/lib.md`, `docs/api/notifications.md`, `docs/js/notifications.md`) la aggiorna `/sync-docs` dentro `/finish-cycle`, non un task di questo piano.

## Decisioni aperte

1. **`renderAdminNotificationLink` esportata da `email.js` per rendere testabile il link della mail.** Alternativa scartata: esportare `transporter` o mockare `sendMail`. Perché: `email.js` non ha test e una funzione pura è la superficie più piccola da fissare.
2. **Il link della mail passa da `escapeHtml`, oltre alla regola.** Alternativa scartata: fidarsi della sola regola. Perché: la regola ammette `"`, `<` e `>` in un percorso relativo, e il link va dentro un attributo `href` HTML.
3. **`testNotificationUrl` legge l'`APP_URL` del server come `process.env.APP_URL || 'http://localhost'` e non cambia `docker-compose.yml`.** Alternativa scartata: aggiungere `APP_URL` al servizio `test`. Perché: tocca un file Docker condiviso, e il default coincide con quello della route; se `.env` imposta un `APP_URL` diverso, il caso `201` assoluto fallisce visibilmente.
4. **Senza `window.notificationUrl` il client non mostra nessun link.** Alternativa scartata: ricadere sul valore grezzo. Perché: un modulo non caricato non deve riaprire il buco; il guard di T6 impone che le pagine lo carichino.
5. **Il click rilegge `safeNotifUrl(el.dataset.url)` invece di fidarsi del `data-url` già filtrato al render.** Alternativa scartata: leggere `data-url` direttamente. Perché: l'attributo è nel DOM e può essere stato alterato dopo il render.
