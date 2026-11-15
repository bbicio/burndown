# Link delle notifiche validato (S-01) — design spec

**Date:** 2026-11-15
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-15-security-c1-notification-url-brief.md`
**Scenario:** 3 (correzione di divergenza), finding S-01 di `docs/superpowers/audits/2026-11-15-security-review-audit.md`

Un `url` di notifica è accettato solo se è un percorso relativo all'app o un URL assoluto sull'origine dell'app. La regola vive in un modulo gemello lato server e lato browser, ed è applicata in scrittura (`POST /api/notifications`), nella mail e al render nel client.

## 1. Fatti verificati

- `POST /api/notifications` controlla solo il titolo; `url || null` va in `INSERT` e nella mail (`api/src/routes/notifications.js:139`, `:168`, `:179`). Il broadcast è riservato all'admin, l'invio individuale no.
- `js/notifications.js` segue `n.url` con `window.location.href` a `:80` e `:156`, e lo mette in `data-url` e in `<a href>` a `:165-167`; `_esc` non tocca lo schema.
- `api/src/services/email.js:149` usa il valore se inizia con `http`, altrimenti lo accoda a `APP_URL`; `APP_URL` vale `http://localhost` se assente.
- I mittenti interni usano un percorso relativo (`auth.js:195`) o un URL assoluto su `APP_URL` (`config.js:198`, `cost-grids.js:1035`, `:1149`, `projects.js:719`).
- Il precedente dei moduli gemelli è `js/lib/dates.js` ↔ `api/src/lib/dates.js`.

## 2. Modulo gemello `notification-url`

`js/lib/notification-url.js` (ES module con bridge `window.`) e `api/src/lib/notification-url.js` (CommonJS), con la stessa logica e gli stessi test.

- `notificationUrl(value, origin)` restituisce `value` se valido, `null` altrimenti.
- `notificationUrlError(value, appUrl)` (solo server) restituisce `null` se valido, altrimenti `'url must be an app path or an absolute URL on the app origin'`.

**Regola.** Valido: `null`/`undefined`, oppure una stringa di al più 2048 caratteri, senza caratteri di controllo, spazi né `\`, che sia
- un percorso relativo: inizia con `/` e il secondo carattere non è `/`;
- un URL assoluto: `new URL(value)` con protocollo `http:` o `https:` e `origin` uguale all'origine di `origin` (browser: `location.origin`; server: `new URL(APP_URL || 'http://localhost').origin`).

Tutto il resto è non valido: `javascript:`, `data:`, `//host`, `/\evil`, `https://altro.host`, `http://app@evil.com`, valori con `\n`.

## 3. Punti di applicazione

- **`POST /api/notifications`**: `notificationUrlError` subito dopo il controllo del titolo, prima del lookup dell'utente e di ogni `INSERT`. Rifiuto: `400 { error, code: 'URL_RULE' }`, per invio individuale e broadcast, senza creare righe.
- **`sendAdminNotificationEmail`**: il link si costruisce solo da un valore che passa la regola (assoluto: com'è; relativo: `APP_URL` + percorso); altrimenti niente link. Il `startsWith('http')` esce.
- **`js/notifications.js`**: un helper locale chiama `notificationUrl(n.url, location.origin)` e alimenta i tre punti (`:80`, `:156`, `:165-167`). Valore non valido: niente `data-url`, niente `<a>`, nessuna navigazione. Vale anche per le notifiche che arrivano via SSE.
- **Righe già salvate**: nessuna migration; le neutralizza il render.
- **`createNotification` interno**: invariato.
- **`terms.html`** (aggiunto dopo `/security-review`): `next` si segue solo se `notificationUrl(next, location.origin)` lo accetta, altrimenti `/pipeline.html`. Un percorso valido per la regola, come `/terms.html?next=javascript:…`, altrimenti raggiungerebbe il `window.location.href = this.next` della pagina. `js/nav.js:374` costruisce solo il valore (percorso corrente codificato) e non cambia: il controllo sta dove si naviga.

## 4. Test

- Unità su entrambi i gemelli, con la tabella dei casi del Brief e quelli di §2.
- jsdom: una notifica con `url = 'javascript:alert(1)'` non produce `href` pericoloso né navigazione al click.
- `test-api.js`: `400` + nessuna riga in `notifications` per `javascript:`, `data:`, `//example.com`, `https://example.com/x`, `/\evil`, percorso con `\n`; `201` per `/pipeline.html` e `${APP_URL}/pipeline.html`.
- Guard stretto (`js/lib/notification-url-guard.test.js`): in `js/notifications.js` ogni `location.href =` riceve un valore passato dal modulo; in `api/src/services/email.js` non compare `startsWith('http')`; ogni pagina che carica `notifications.js` carica anche `notification-url.js`; i `?v=N` di `notification-url.js` concordano.
- Bump dei `?v=N` di ogni file versionato toccato, in tutti i riferimenti.

## 5. Fuori scope

Header e CSP (ciclo 5); bonifica dei dati; il default mancante di `process.env.APP_URL` in `cost-grids.js:1035`, difetto già presente da proporre come Brief a sé.

## Decisioni aperte

1. **Approccio: modulo gemello con una funzione sola.** Alternativa scartata: validazione solo lato server più un controllo ad hoc nel client. Perché: la convenzione di `dates.js` e `money.js` e il vincolo «una sola definizione» del Brief.
2. **Si valida senza normalizzare: l'`url` si salva com'è stato inviato.** Alternativa scartata: ridurre gli assoluti a percorso relativo in scrittura. Perché: i mittenti interni salvano URL assoluti e devono restare invariati.
3. **Righe già salvate: neutralizzate solo al render, nessuna migration né bonifica.** Alternativa scartata: `UPDATE notifications SET url = NULL` sulle righe non valide. Perché: il controllo al render serve comunque (SSE e dati vecchi), e una migration a mano non aggiunge sicurezza.
4. **Rifiuto con `400` e `code: 'URL_RULE'`, prima di qualunque scrittura, broadcast compreso.** Alternativa scartata: salvare `url = null` e consegnare comunque la notifica. Perché: un `url` invalido è un errore del chiamante e non va corretto in silenzio, come per `DATE_RULE` e `MONEY_RULE`.
5. **Origine nel browser = `location.origin`; sul server = `APP_URL` con default `http://localhost`.** Alternativa scartata: esporre `APP_URL` al client. Perché: il client non ha un canale per leggerlo, e un `APP_URL` diverso dall'origine con cui l'utente apre l'app rende il link non seguibile, che è l'esito sicuro.
6. **Guard limitato a `js/notifications.js` e `email.js`.** Alternativa scartata: guard sull'intero repo contro `location.href = <dato>`. Perché: le altre pagine assegnano `location.href` legittimamente in molti punti, e un guard globale darebbe falsi positivi.
7. **`createNotification` interno non valida l'`url`.** Alternativa scartata: validare anche lì. Perché: i chiamanti sono codice del server con URL costruiti da noi, e il client neutralizza comunque al render.

8. **`terms.html` entra nel ciclo: il suo `?next=` passa dalla stessa regola.** Alternativa scartata: Brief separato per `terms.html`. Perché: il `/security-review` ha mostrato che senza questo S-01 resta aggirabile con un percorso valido, e l'utente ha deciso di chiuderlo qui (correzione di una riga, stesso modulo).

## Criteri di accettazione

1. **Rifiuto in scrittura** — `POST /api/notifications` con `url` `javascript:alert(1)`, `data:text/html,x`, `//example.com`, `https://example.com/x`, `/\evil` o un percorso con `\n` risponde `400` con `code: 'URL_RULE'` e nessuna riga nuova in `notifications` (query sul DB), anche in broadcast.
2. **Accettazione valida** — `url` `/pipeline.html` e `${APP_URL}/pipeline.html` rispondono `201`.
3. **Neutralizzazione al render** — una riga con `url = 'javascript:…'` inserita direttamente nel DB non ha `href` né `data-url` nel DOM e il click non naviga (test jsdom).
4. **Mail** — `sendAdminNotificationEmail` con un `url` non valido non emette link; con uno valido sì.
5. **Notifiche di sistema** — share, riassegnazione e rettifica restano consegnate con il loro link (test esistenti verdi).
6. **`terms.html`** — con `?next=javascript:…`, `?next=//example.com` o `?next=https://example.com` l'accettazione dei Terms porta a `/pipeline.html`; con `?next=/costgrid.html?cgId=1` porta a quella pagina (guard `js/lib/notification-url-guard.test.js`, verifica manuale al Gate 2).
7. **Suite** — `npm test` e la suite backend verdi; `/security-review` sul branch non trova più S-01 né ne introduce.
