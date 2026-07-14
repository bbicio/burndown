# Brief — Vue 3 migration roadmap for remaining Vanilla JS pages

**Scenario:** 2 — Evoluzione di una feature esistente.

## Scopo di questo Brief

Non copre la migrazione di una singola pagina — cattura l'obiettivo generale e lo stato attuale, come input per `/brainstorming`, che decomporrà il lavoro in una roadmap pagina-per-pagina. Ogni pagina della roadmap diventerà poi un ciclo Scenario 2 a sé (Brief → Spec → Piano → esecuzione → `/finish-cycle`), non eseguita da questo Brief.

## Comportamento attuale

**Direzione architetturale già dichiarata** (`ARCHITECTURE.md:13`): *"The frontend remains Vanilla JS in the short term. New pages (login, account activation, password recovery) are built in Vue 3 (CDN, no build step). Existing PDash views migrate to Vue incrementally."* Confermato anche in `docs/superpowers/specs/2026-07-01-frontend-test-infra-design.md:4`: l'infrastruttura di test (vitest + jsdom) e l'estrazione di funzioni pure in `js/lib/` sono state costruite esplicitamente come primo passo preparatorio di questa migrazione, "così che i futuri componenti Vue chiamino funzioni già testate."

**Stato reale, verificato via grep su `createApp`/`vue@3` in tutti gli `.html`:**

Pagine già su Vue 3 (CDN, `Vue.createApp`) — **6**:
- `login.html`, `activate.html`, `reset-password.html` — le "new pages" citate in `ARCHITECTURE.md:13`.
- `config.html`, `admin.html`, `timesheets.html` — migrate oltre quanto documentato in `ARCHITECTURE.md:13` (che menziona solo le prime 3); nessuna nota architetturale aggiornata registra questa estensione.

Pagine ancora Vanilla JS — **9** (`CLAUDE.md:52-65`, tabella Pages):
`index.html` (solo redirect, banale), `pipeline.html`, `portfolio.html`, `planning.html`, `costgrid.html`, `project-config.html`, `terms.html`, `migration.html`, `_db-reset.html`.

**Duplicazione di logica scoperta durante la verifica** (non nota prima di questo Brief): `config.html` (Vue) gestisce client/gruppi/programmi/ruoli/ratecards con la propria implementazione Vue interna (nessun `<script src="js/roles.js">`/`js/clients.js`/`js/programs.js`/`js/ratecards.js"` caricato — verificato via grep sui tag `<script>` di `config.html`). Le stesse entità hanno però un'implementazione Vanilla separata e tuttora attiva — `js/roles.js`, `js/clients.js`, `js/programs.js`, `js/ratecards.js` (documentate in `CLAUDE.md:144,149-154`) — caricata dalle pagine ancora Vanilla come modali condivisi: `project-config.html:223,229-230`, `pipeline.html:180,184-185`, `portfolio.html:435,443-444`, `costgrid.html:283-285,290`, `planning.html:216,222-223`. Cioè oggi esistono **due implementazioni parallele** delle stesse funzionalità (gestione ruoli/client/programmi/ratecard), una Vue dentro `config.html`, una Vanilla condivisa dalle altre 5 pagine — non ancora consolidate.

**Fondamenta già pronte per la migrazione** (`CLAUDE.md:85-124`): 4 moduli in `js/lib/` — `cfg-parse.js`, `planning-calc.js`, `status-rules.js`, `costgrid-calc.js` — logica pura già estratta da `config-form.js`/`planning.js`/`core.js`/`costgrid.js`, ES module con bridge `window.<name>` per i chiamanti classici esistenti, già chiamabile identicamente da futuri componenti Vue senza riscrittura.

## Comportamento atteso

Una roadmap confermata per migrare le 9 pagine Vanilla rimanenti a Vue 3 (CDN, nessun build step — vincolo confermato sotto), in un ordine di priorità esplicito, ciascuna come ciclo Scenario 2 indipendente — mai un'unica riscrittura big-bang. La roadmap deve anche includere una decisione su come risolvere la duplicazione ruoli/client/programmi/ratecard scoperta sopra (consolidare su un'unica implementazione Vue, o mantenerne due finché l'ultima pagina Vanilla che le usa non è migrata) — decisione da prendere in `/brainstorming`, non qui.

## Vincoli

- **Nessun build step**: Vue 3 resta via CDN (`<script src="https://unpkg.com/vue@3/...">`), coerente con le 6 pagine già migrate e con `ARCHITECTURE.md:21` ("No build step; each page is a self-contained HTML file"). Confermato esplicitamente con l'utente in questa conversazione — niente Vite, niente Single-File Components.
- Ogni pagina migrata deve restare un file HTML autonomo servito da nginx così com'è (nessuna modifica a `nginx.conf`/Dockerfile per introdurre un passo di compilazione).
- Le funzioni pure in `js/lib/` vanno riutilizzate dai nuovi componenti Vue esattamente come sono — non riscritte (vedi Scope escluso).
- Nessuna modifica al backend/API in questo lavoro — è un refactor di solo frontend.
- La duplicazione ruoli/client/programmi/ratecard (Vue in `config.html` vs Vanilla condiviso altrove) va esplicitamente affrontata nella roadmap, non ignorata.

## Criteri di accettazione

- [ ] `/brainstorming` produce una roadmap con le 9 pagine Vanilla rimanenti ordinate per priorità, con motivazione esplicita per l'ordine scelto.
- [ ] La roadmap specifica, per ciascuna pagina, se dipende da altre pagine della lista (es. componenti/modali condivisi) prima di poter essere migrata in isolamento.
- [ ] La roadmap include una decisione esplicita, con motivazione, su come risolvere la duplicazione ruoli/client/programmi/ratecard.
- [ ] La roadmap identifica la prima pagina da migrare e produce (o rimanda esplicitamente a un ciclo successivo) il Brief Scenario 2 per quella pagina specifica.
- [ ] Nessuna pagina già in Vue (le 6 elencate sopra) viene ri-toccata da questo lavoro.

## Scope escluso esplicitamente

*(confermato con l'utente)*

- Introduzione di un build step (Vite, Single-File Components, o qualunque pipeline di compilazione) — resta CDN.
- Riscrittura di `js/lib/*.js` — le funzioni pure esistenti vanno richiamate dai nuovi componenti Vue, non riscritte.
- Modifiche al backend/API (`api/src/routes/`, schema DB).
- Migrazione delle 6 pagine già in Vue (`login.html`, `activate.html`, `reset-password.html`, `config.html`, `admin.html`, `timesheets.html`) — già fatte, fuori scope.

## Domande aperte per `/brainstorming`

- Ordine di priorità delle 9 pagine: per rischio (pagine più semplici prima per validare il pattern) o per valore (pagine più usate prima)?
- La duplicazione ruoli/client/programmi/ratecard si risolve consolidando subito su Vue (prima ancora di migrare le pagine che oggi usano la versione Vanilla), o si lascia convivere finché l'ultima pagina Vanilla dipendente non è migrata?
- `project-config.html`, `pipeline.html`, `portfolio.html`, `costgrid.html`, `planning.html` condividono tutte `js/roles.js`/`js/clients.js`/`js/programs.js` come modali — la migrazione di una di queste pagine a Vue richiede che il modale condiviso sia anch'esso Vue, o può convivere temporaneamente un modale Vanilla dentro una pagina host Vue?
- `terms.html`, `migration.html`, `_db-reset.html` sono pagine minori/amministrative — vanno incluse nella roadmap con bassa priorità, o esplicitamente rimandate a "quando serve" senza una scadenza nella roadmap?

Brief ready. Next step: /brainstorming.