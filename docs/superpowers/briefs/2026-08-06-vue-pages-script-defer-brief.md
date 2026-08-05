# Brief — defer/async script loading across the 13 Vue pages

**Data:** 2026-08-06
**Scenario:** 2 — Evoluzione di feature esistente
**Origine:** Follow-up esplicitamente accantonato dal ciclo `2026-07-31-vue-fouc-vcloak` (vedi `docs/superpowers/reports/2026-07-31-worktree-vue-fouc-vcloak-finish-cycle.md`, Roadmap notes + Round 1 "accepted as follow-up"), rimasto non pianificato da allora; individuato ora come unico item del backlog storico ancora realmente aperto e senza brief/spec/plan.

## Current behavior

Ogni pagina Vue (tutte tranne il redirect di 9 righe `index.html`) carica script `<script src="...">` classici, non-`defer`/`async`, in ordine di documento, che bloccano il parsing HTML fino a download+esecuzione completati. Ordine tipico: librerie CDN (Vue, Bootstrap, talvolta Chart.js/xlsx/ExcelJS) → i moduli globali propri del progetto (`js/core.js`, `js/api.js`, `js/nav.js`, ecc.) → file `js/lib/*.js` con `type="module"` (già nativamente deferred) → uno `<script>` inline finale con `Vue.createApp({...}).mount(...)`.

Esempi concreti verificati:
- `pipeline.html:340-357`, `portfolio.html:491-506` — catena completa di script classici seguita da `js/lib/*` moduli e dallo script inline finale.
- `login.html:101-102` — solo Vue via CDN, poi `Vue.createApp({...})` chiamato immediatamente, in modo sincrono, subito dopo.
- `admin.html:239-252` — `Vue.createApp({...})` con un hook `created()` che chiama `initNav()` (definita in `js/nav.js`, caricato due righe sopra come script classico bloccante).
- `admin.html:242-246` — uno shim inline aggiuntivo (`function esc(s) {...}`) tra `js/api.js` e `js/core.js`, presente perché `nav.js`/`ratecards.js` leggono un `esc()` globale e questa pagina non carica `core.js`.

Solo `pipeline.html` e `costgrid.html` (2 occorrenze ciascuna di `DOMContentLoaded`) e `planning.html` (1 occorrenza) incapsulano parte della logica inline in un listener `DOMContentLoaded`. Le altre 10 pagine eseguono lo script inline finale **immediatamente, in modo sincrono, nella sua posizione nel documento** — funziona oggi solo perché tutti gli script precedenti sono anch'essi sincroni/bloccanti e quindi già eseguiti a quel punto.

**Rischio identificato durante la stesura di questo brief:** gli script marcati `defer` vengono eseguiti solo dopo che l'intero documento è stato parsato — cioè *dopo* uno script inline finale non-deferred, che invece viene eseguito immediatamente quando il parser lo raggiunge. Aggiungere `defer` solo ai tag `<script src>` precedenti, senza toccare lo script inline finale, romperebbe l'ordine di esecuzione su 10 delle 13 pagine: `Vue`, `initNav`, ecc. risulterebbero `undefined` nel momento in cui lo script inline prova a usarli — un errore di rottura immediato, non un edge case sottile.

## Expected behavior

Ridurre la finestra di schermo vuoto (tra il primo paint e il mount di Vue che rimuove `v-cloak`) marcando `defer` (o `async` dove applicabile) i tag `<script src>` non order-dependent su tutte le 13 pagine, **senza introdurre alcuna regressione funzionale** — ogni pagina deve continuare a funzionare esattamente come oggi. Poiché marcare `defer` sposta l'esecuzione degli script classici dopo la fine del parsing del documento, lo script inline finale di ogni pagina deve essere adattato per partecipare allo stesso ordine di esecuzione differito (es. convertendolo in `type="module"` — che secondo la spec HTML condivide la stessa coda ordinata "script che eseguiranno in ordine" degli script classici `defer` — oppure incapsulandone la logica in un listener `DOMContentLoaded`). Il meccanismo esatto è una decisione di design per `/brainstorming`.

## Constraints

- Nessuna modifica al comportamento visibile all'utente o alla logica applicativa — questo è puramente un cambiamento di timing/ordine di caricamento degli script.
- Nessun nuovo bundler o build step (invariante di progetto: nginx serve `js/`/`css/` così come sono su disco).
- Ogni pagina deve essere verificata individualmente: la struttura degli script non è identica su tutte le 13 (es. lo shim `esc()` inline di `admin.html`, il numero variabile di `js/lib/*` moduli per pagina, script CDN aggiuntivi solo su alcune pagine).
- Se una pagina viene convertita a `type="module"` per il suo script inline finale, qualunque dichiarazione a livello top del modulo (function/const) **non** diventa automaticamente una proprietà di `window` — a differenza di uno script classico. Va verificato caso per caso se qualche altra pagina/script si aspetta di leggere un global esposto da quello script inline (come nel caso noto di `admin.html`'s `esc()`).
- I file `js/lib/*.js` (già `type="module"`) non necessitano modifiche.
- Nessuna nuova dipendenza esterna.

## Acceptance criteria

- Ognuna delle 13 pagine Vue carica correttamente in un browser reale dopo la modifica, senza errori in console (in particolare nessun `ReferenceError`/`TypeError` riconducibile a un global non ancora definito).
- La verifica è manuale in browser per ogni pagina — non solo revisione del codice — poiché jsdom/vitest non possono esercitare il timing reale di caricamento degli script. I casi di test concreti per ciascuna pagina verranno indicati esplicitamente pagina per pagina durante l'implementazione (non genericamente "nessun errore in console"), data la richiesta esplicita dell'utente di non lasciare questo passaggio implicito.
- Nessuna delle 13 pagine mostra una regressione funzionale rispetto al comportamento pre-modifica (login, navigazione, azioni specifiche di pagina).
- La finestra di schermo vuoto/non stilizzato prima del mount di Vue risulta oggettivamente più corta o invariata nel caso peggiore (mai peggiore di oggi) — verificabile qualitativamente in browser (throttling di rete), non richiede una metrica automatizzata formale.

## Explicitly excluded scope

- Qualunque riscrittura del contenuto dei file `js/*.js` stessi (solo gli attributi dei tag `<script>` e l'eventuale wrapping/conversione dello script inline finale sono in scope).
- Il fix CSS/`v-cloak` (già completato nel ciclo 2026-07-31) — non riaperto qui.
- Qualunque cambiamento all'ordine logico/sequenziamento di caricamento dati delle pagine (chiamate API, `initNav()`, ecc.) oltre a quanto strettamente necessario per preservare l'ordine di esecuzione degli script — questo brief riguarda solo il *timing* del parsing/esecuzione degli script, non la loro logica interna.
- Introduzione di bundler, build step, o `<script type="module">` per gli stessi `js/*.js` classici esistenti (restano script classici, solo con `defer` aggiunto) — la conversione a modulo riguarda solo lo script inline finale di ciascuna pagina, se scelta come meccanismo.

## Domande aperte per `/brainstorming`

- Meccanismo esatto per far partecipare lo script inline finale di ciascuna pagina allo stesso ordine di esecuzione differito: conversione a `type="module"` (per pagina) vs. wrapping in `DOMContentLoaded`, o un meccanismo misto a seconda della pagina.
- Come gestire il caso specifico di `admin.html`'s shim `esc()` inline (attualmente un global letto da `nav.js`/`ratecards.js`) se il meccanismo scelto altera la sua visibilità come global.
- Se marcare gli script CDN di terze parti (Vue, Bootstrap, Chart.js, xlsx, ExcelJS) con `defer` o lasciarli invariati, dato che sono comunque cross-origin e generalmente già cacheati dal browser.

Brief ready. Next step: /brainstorming.
