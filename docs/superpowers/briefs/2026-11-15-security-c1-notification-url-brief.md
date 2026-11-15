# Brief — Sicurezza ciclo 1: link delle notifiche validato (S-01)

**Tipo:** correzione di divergenza (audit-fix, Scenario 3). Finding coperto: **S-01**.
**Origine:** `docs/superpowers/audits/2026-11-15-security-review-audit.md`, raggruppamento confermato dall'utente il 2026-11-15. Ordine di esecuzione: 1 di 6.

## Problema

Qualunque utente autenticato può inviare a un altro utente una notifica con un `url` arbitrario; il server lo salva e il client lo segue senza controllo. Con uno schema `javascript:` il click sulla notifica esegue script nell'origine dell'app con i privilegi del destinatario (admin compresi); con un indirizzo `http…` esterno la mail porta un link a scelta del mittente.

## Comportamento attuale

- Il server accetta qualsiasi stringa: `if (!title?.trim())` è l'unico controllo (`api/src/routes/notifications.js:139`) e `url || null` viene scritto così com'è (`:168`, `:179`). L'invio individuale richiede solo `requireAuth` (`:155-160` riserva all'admin il solo broadcast).
- Il client naviga verso il valore: `if (url) window.location.href = url;` (`js/notifications.js:80`, `:156`) e lo mette in `<a href="${_esc(n.url)}">` (`:167`). `esc()` (`js/core.js:201`) non tocca lo schema.
- La mail costruisce il link con `url.startsWith('http') ? url : APP_URL + url` (`api/src/services/email.js:149`).
- Chi invia legittimamente usa due forme: percorso relativo (`url: '/admin.html'`, `api/src/routes/auth.js:195`) e URL assoluto sull'origine dell'app (`url: \`${process.env.APP_URL}/pipeline.html\``, `api/src/routes/cost-grids.js:1035`, `:1149`). La modale «Send Notification» suggerisce un percorso relativo (`js/nav.js:456`, placeholder `/pipeline.html`).
- Le righe già salvate in `notifications.url` non sono state validate da nessuno.

## Comportamento atteso

1. Il server accetta come `url` solo `null`/assente, un percorso relativo all'app, oppure un URL assoluto la cui origine coincide con `APP_URL`; ogni altro valore è rifiutato con `400` e un messaggio in inglese, senza creare la notifica (né in broadcast, né individuale).
2. Il client, prima di navigare o di renderizzare l'`<a>`, applica la stessa regola e non segue un valore non valido (le righe vecchie già nel DB non devono poter eseguire nulla).
3. La mail usa solo URL che passano la stessa regola.
4. Le notifiche generate dal sistema (share, riassegnazione, rettifica) continuano a funzionare invariate.

## Vincoli

- **Una sola definizione della regola**, con gemello lato server e lato browser secondo la convenzione di `js/lib/` ↔ `api/src/lib/` (come `dates.js`, `money.js`), con test sul gemello e guard che impedisca a `window.location.href = <dato>` di comparire fuori dal modulo, se il ciclo lo ritiene proporzionato.
- Nessuna build; `?v=N` di ogni file versionato modificato aggiornato ovunque (`CLAUDE.md`, «Cache-busting»).
- Testo rivolto all'utente in inglese.
- Aggiungere casi a `test-api.js` (`javascript:`, `data:`, `//host`, `https://altro.host`, `\\`, caratteri di controllo, percorso valido, URL con origine di `APP_URL`) e test di unità sul modulo.

## Criteri di accettazione

1. `POST /api/notifications` con `url: "javascript:alert(1)"` → `400`, nessuna riga creata (query sul DB).
2. Stesso esito per `data:`, `//example.com`, `https://example.com/x`, `/\evil`, un percorso con `\n`; esito `201` per `/pipeline.html` e per `${APP_URL}/pipeline.html`.
3. Una riga di `notifications` inserita direttamente nel DB con `url = 'javascript:…'` non viene seguita al click né ha `href` pericoloso nel DOM (test jsdom).
4. Le notifiche di share/riassegnazione/rettifica restano consegnate con il loro link (test esistenti verdi).
5. `npm test` e la suite backend verdi.

## Scope escluso esplicitamente

- Header di sicurezza e CSP (S-06, ciclo 5).
- Ripulire o migrare le righe già salvate in `notifications.url`: il client le neutralizza al render; un'eventuale bonifica dei dati è decisione del ciclo, da proporre, non assunta.
- Qualunque altra superficie XSS (nessuna ulteriore è emersa nell'audit).

## Nuovi finding durante il ciclo

Ogni nuovo finding scoperto durante `/brainstorming` o l'esecuzione di questo ciclo va **isolato e proposto come Brief a sé**, mai assorbito nel fix di questo ciclo (guardia dello Scenario 3 di `PROCESS.md`).
