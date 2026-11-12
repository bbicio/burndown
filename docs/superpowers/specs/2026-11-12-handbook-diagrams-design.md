# Handbook: diagrammi di architettura Mermaid in ARCHITECTURE.md — design spec

**Date:** 2026-11-12
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-12-handbook-diagrams-brief.md`
**Scenario:** 1 (nuova funzionalità)

`handbook/restricted/ARCHITECTURE.md` riceve diagrammi Mermaid che `help.html` disegna: contesto/container in §1, i sette flussi di §4 come `sequenceDiagram`, un `erDiagram` per ciascuna area di §5, e un `flowchart` stage → status in una nuova §5.9. `scripts/architecture-guard.test.js` verifica i nomi che i diagrammi citano (tabelle, route, stage/status) tramite un modulo puro con test propri. I diagrammi larghi scorrono orizzontalmente invece di rimpicciolirsi.

## 1. Fatti verificati nel codice (a `b527226`)

- ARCHITECTURE.md non ha blocchi `mermaid`; §4 ha sette flussi in testo con `→` (§4.1-§4.7); §5 descrive le tabelle in blocchi `sql` per area (§5.1-§5.8) e nomina tutte le tabelle create dalle migrazioni.
- `architecture-guard.test.js` controlla le route di §6 (`codeEndpoints()`), e che §5 nomini ogni tabella creata e ogni colonna aggiunta, con una ricerca a parola nuda su tutta la §5.
- `js/lib/handbook.js`: `docProblems` controlla solo la struttura dei blocchi `mermaid` (chiusura, blocco non vuoto, primo token fra `MERMAID_TYPES`); `fenceBlocks` non è esportata.
- `help.html` `renderMermaid`: `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })`, mermaid 11.4.1 da CDN; il chiamante cattura l'errore di `mermaid.run` con `console.error`.
- `css/help.css`: `.hb-body img, .hb-body svg { max-width: 100%; height: auto; }`, `.hb-body pre { overflow-x: auto; … }`, `.hb-body pre.mermaid { background; text-align: center }`.
- `nginx.conf`: `auth_request /auth-check` per le pagine e `handbook/`, `auth_request /admin-check` per `handbook/restricted/`.
- `docker-compose.yml`: `SMTP_*` e `ANTHROPIC_*` sull'`api`; servizi `db`, `api`, `nginx`, `adminer`, `test`.
- `js/lib/status-rules.js` `getStatusRule(pipeline)`: mappa stage → status ammessi; SIP `options: []` disabilitato, Canceled `options: null` disabilitato. Nessuna regola di transizione fra stage nel codice.
- `scripts/classify-cycle.mjs`: un ciclo è no-code solo se tocca `.md` (e `.png` sotto `handbook/`); questo ciclo, che cambia script, CSS e `help.html`, è ordinario.
- `vitest.config.js`: ambiente `jsdom` anche per `scripts/**/*.test.js`, quindi il guard può importare `js/lib/status-rules.js`.

## 2. Contenuto di ARCHITECTURE.md

- **§1 Overview** — dopo il testo esistente, un `flowchart LR` di contesto: Browser; CDN (Vue, Bootstrap, Mermaid); `pdash-nginx` (pagine, `handbook/`, proxy `/api`); `auth_request` `/auth-check` (pagine e `handbook/`) e `/admin-check` (`handbook/restricted/`) verso `pdash-api`; `pdash-api` → `pdash-db` (PostgreSQL 16); `pdash-api` → SMTP; `pdash-api` → API Anthropic; `pdash-adminer` → `pdash-db` marcato come strumento di sviluppo. Il servizio `test` resta fuori.
- **§4 Auth Flows** — ognuna delle sette sottosezioni: 2-4 righe di prosa (a cosa serve il flusso, chi lo avvia) e un `sequenceDiagram` che **sostituisce** il blocco di testo. Partecipanti: Utente/Admin, Browser, API, DB e Email dove serve. Ogni dettaglio del testo attuale resta come messaggio o `Note` (401 generico, 429 `RATE_LIMITED`, 403 disabled, cookie `pdash_device`/`pdash_challenge`, scadenze 48h/2h, `alt` dispositivo fidato vs codice email). Le chiamate API si scrivono `METODO /api/...`.
- **§5.1-§5.8** — in testa a ciascuna, un `erDiagram` concettuale: le tabelle dell'area, nessuna colonna, le FK dirette fra loro ricavate dai `REFERENCES` delle migrazioni; una tabella di un'altra area raggiunta da una FK compare come entità. I blocchi `sql` restano invariati.
- **§5.9 Pipeline stage and project status** (nuova) — una riga su dove vivono i due campi (`cost_grid_versions.pipeline`, propagato a `projects.pipeline`; `projects.status`) e un `flowchart LR`: cinque nodi stage senza archi fra loro; per ogni stage un arco verso ciascuno status che `getStatusRule()` ammette; SIP e Canceled un arco verso un nodo "status disabled".
- **Sintassi** — niente front matter YAML, niente `%%{init}%%`, niente `flowchart-elk`, tema di default.

## 3. Modulo `scripts/lib/mermaid-facts.mjs`

Puro, non legge file. Usa `fenceBlocks` esportata da `js/lib/handbook.js` per trovare i blocchi.

- `erEntities(body)` → nomi di entità di un `erDiagram`, dalle righe di relazione (`a ||--o{ b : "…"`) e dalle dichiarazioni isolate (`a {`, `a["alias"]`).
- `apiCalls(body)` → `{ method, path }` per ogni `GET|POST|PATCH|PUT|DELETE /api/...` nel blocco.
- `flowEdges(body)` → archi `{ from, to }` di un `flowchart`, risolti sull'etichetta dei nodi (`id["Started At Risk"]`) quando c'è, sull'id altrimenti.

`scripts/lib/mermaid-facts.test.js`, un test per caso: entità in relazione; entità isolata; alias; entità ripetuta contata una volta; blocco vuoto; path con `:id`; metodo minuscolo ignorato; `/api` senza metodo ignorato; arco con etichetta (`-- testo -->`); nodo dichiarato dopo l'arco che lo usa.

## 4. Guard

Nuovo `describe("ARCHITECTURE.md diagrams vs the code")` in `scripts/architecture-guard.test.js`:

1. Ogni entità di ogni `erDiagram` è una tabella creata da una migrazione e non eliminata da una successiva `DROP TABLE`. Test dei casi: presente, assente, rinominata, creata e poi eliminata.
2. Ogni `{ method, path }` di ogni blocco `mermaid` corrisponde a una route di `codeEndpoints()`, con la stessa normalizzazione dei parametri del confronto di §6.
3. Gli archi del `flowchart` di §5.9 sono esattamente quelli derivati da `getStatusRule()` per i cinque stage (disabilitato → "status disabled"): nessuno manca, nessuno in più.
4. Ogni sottosezione §4.x ha un `sequenceDiagram`, ogni §5.1-§5.8 un `erDiagram`, §5.9 un `flowchart`; così un diagramma rimosso non fa passare a vuoto i controlli 1-3.

Controlli esistenti "mentions every table" e "mentions every column": cercano nella §5 **privata dei blocchi `mermaid`**, così una tabella presente solo in un diagramma fa ancora fallire.

L'header del guard aggiunge ai limiti dichiarati: relazioni ER, ordine dei messaggi, prosa e diagramma di contesto non verificati.

## 5. Viewer e CSS

- `help.html` `mermaid.initialize` aggiunge `flowchart`, `sequence`, `er` con `useMaxWidth: false`: gli SVG tengono la larghezza naturale.
- `css/help.css`: `.hb-body pre.mermaid svg { max-width: none; }`; lo scorrimento viene da `.hb-body pre { overflow-x: auto }`. Un diagramma più largo della colonna scorre, anche su desktop.
- Bump `?v=` di `css/help.css` e `js/lib/handbook.js` in ogni riferimento.
- Errori di Mermaid: nessun cambiamento al viewer (riquadro di errore di Mermaid + `console.error`).

## 6. Verifica

- `npm test` (incluso `mermaid-facts.test.js`, `architecture-guard`, `handbook-guard`, i guard dei `?v=`).
- Branch stack (`scripts/test-branch.sh up`): `scripts/shoot.mjs` su `/help.html?doc=architecture` da admin a 1440px e 390px, con `--eval` che conta `pre.mermaid svg` e `svg[aria-roledescription="error"]`; PNG letti.
- Il Piano annota per ogni nodo/entità/messaggio il riferimento nel codice.
- Documenti: `docs/pages/help.md` (`useMaxWidth`, scorrimento), header di `architecture-guard.test.js`.

## Criteri di accettazione

1. **Diagrammi presenti** — §1 ha il `flowchart` di contesto, ognuna di §4.1-§4.7 un `sequenceDiagram` preceduto da prosa e senza il vecchio blocco di testo, ognuna di §5.1-§5.8 un `erDiagram`, §5.9 il `flowchart` stage → status.
2. **Test verdi** — `npm test` passa, inclusi `scripts/lib/mermaid-facts.test.js`, `scripts/architecture-guard.test.js` e `scripts/handbook-guard.test.js`.
3. **Guard efficace** — il guard fallisce su: un'entità ER inesistente, una tabella eliminata, una route inesistente in un diagramma, un arco stage → status in più o in meno, un `erDiagram` rimosso da una §5.x, una tabella nominata solo in un diagramma e non nel suo blocco `sql` (ciascun caso provato in un test o in una prova annotata nel Piano).
4. **Rendering** — sul branch stack, a 1440px e 390px, il numero di `pre.mermaid svg` è uguale al numero di blocchi `mermaid` del documento e nessuno è un riquadro di errore; PNG letti.
5. **Scorrimento** — a 390px un diagramma più largo della colonna scorre orizzontalmente a dimensione naturale invece di rimpicciolirsi.
6. **Stage/status fedele** — nessun arco fra stage; archi per stage uguali a `getStatusRule()`.
7. **Cache-busting** — ogni riferimento a `css/help.css` e `js/lib/handbook.js` ha il nuovo `?v=`.
8. **Fedeltà al codice** — ogni nodo, entità e messaggio dei diagrammi ha un riferimento al codice annotato nel Piano o nel report.

## Decisioni aperte

1. **Guard sui nomi.** Alternativa scartata: diagrammi solo concettuali senza test, guard completo con colonne e partecipanti, o deriva affidata a `/sync-docs`. Perché: scelta dell'utente; verifica ciò che cambia più spesso senza i casi limite di colonne e partecipanti.
2. **I `sequenceDiagram` sostituiscono il testo di tutti e sette i flussi, con prosa introduttiva.** Alternativa scartata: affiancarli al testo, o convertire solo 4.1/4.2/4.7. Perché: indicazione dell'utente; una sola fonte per flusso.
3. **Un `erDiagram` per area, concettuale.** Alternativa scartata: uno solo ridotto, o entrambi. Perché: scelta dell'utente; leggibile e vicino al suo blocco `sql`.
4. **Stage/status come `flowchart` stage → status in una nuova §5.9.** Alternativa scartata: `stateDiagram-v2` o tabella + diagramma; collocazione in §5.3/§5.4. Perché: il codice non ha transizioni, e i due campi stanno in due aree.
5. **Parser in un modulo puro con test propri, `fenceBlocks` esportata.** Alternativa scartata: parsing dentro il guard; un secondo parser dei fence. Perché: casi limite testati uno per uno (lezione 2 del ciclo 1); una sola definizione di blocco.
6. **I controlli di presenza di §5 escludono i blocchi `mermaid`.** Alternativa scartata: lasciarli invariati. Perché: altrimenti una tabella nominata solo nel diagramma passerebbe.
7. **Scorrimento orizzontale con `useMaxWidth: false` + `max-width: none`.** Alternativa scartata: solo CSS con `!important`, nessun CSS, diagrammi stretti. Perché: scelta dell'utente; Mermaid scrive `max-width` inline sull'SVG.
8. **Nessun cambiamento alla gestione errori di Mermaid nel viewer; B-452, B-458, B-462 restano aperte.** Alternativa scartata: messaggio d'errore nel viewer; chiuderle qui. Perché: il riquadro di Mermaid è visibile e la verifica di rendering lo intercetta; le funzioni che le riguardano non vengono usate.
