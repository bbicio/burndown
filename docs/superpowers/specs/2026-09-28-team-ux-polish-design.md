# Team UX polish — ricerca/ordinamento/paginazione coda Unmatched, elenco progetti, paginazione Team (design)

Primo ciclo della priorità concordata 2026-09-28 in `project_team_ux_backlog.md` (memoria), dopo la chiusura di 3a/3b/3c/3d. Origine: backlog aperto dal ciclo "Team UX" del 2026-09-25 (`docs/superpowers/specs/2026-09-25-team-ux-design.md` §4, "fuori scope"), a sua volta motivato da ~150 persone in team e decine di nomi non abbinati per turnover.

Tipo: evoluzione di una pagina esistente (Scenario 2). Frontend + una piccola estensione API. Classificato **bounded** in brainstorming (nessun nuovo sottosistema, flusso già esistente in `team.html`/`api/src/routes/resources.js`); questo file formalizza per iscritto, per rispettare il processo standard del progetto (`docs/superpowers/PROCESS.md` §1), il design già discusso e approvato in chat.

## 1. Comportamento attuale

- **Tab Team** (`team.html:20-71`): ricerca (`filterText`) + "Show inactive", tabella ordinabile (`sortedResources` via `window.sortResources`, `js/lib/team-ui.js:21`), **nessuna paginazione** — tutte le righe filtrate sono renderizzate.
- **Tab Unmatched names** (`team.html:92-126`): tabella con colonne Name, Hours, Projects (solo un **conteggio**, non l'elenco dei project code), Assign to (`combo-select`), Assign/Ignore. **Nessuna ricerca, nessun ordinamento, nessuna paginazione** — tutte le righe sono renderizzate.
- **API `GET /api/resources/unmatched`** (`api/src/routes/resources.js:27-41`): restituisce per nome normalizzato `{ name_normalized, display_name, hours, projects (count), candidate_resource_ids }`. Non restituisce l'elenco dei `project_code`, solo `COUNT(DISTINCT project_code)`.

## 2. Comportamento atteso

1. **Tab Unmatched names — ricerca**: casella di testo sopra la tabella (stesso stile della ricerca del tab Team), filtra su `display_name` (case/accent-insensitive, stessa logica già usata per `filteredResources`).
2. **Tab Unmatched names — ordinamento**: intestazioni Name / Hours / Projects cliccabili, stesso pattern ▲/▼ e stato `sortKey`/`sortDir` del tab Team (chiave dedicata, non condivisa con la tabella Team).
3. **Tab Unmatched names — paginazione**: page size fisso 25, controlli Precedente/Successivo + indicatore pagina, nessuna persistenza tra sessioni. La pagina torna a 1 quando cambiano ricerca, ordinamento, o quando una riga viene rimossa dalla lista (assign/ignore/rescan).
4. **Tab Team — paginazione**: stesso pattern (page size 25, reset pagina a 1 al cambio di `filterText`/`showInactive`/ordinamento), aggiunta senza toccare ricerca/ordinamento esistenti.
5. **Elenco progetti per nome unmatched**: la cella "Projects" mostra il conteggio come oggi, cliccabile; il click apre un piccolo pannello/`<details>` inline con l'elenco dei `project_code` (ordine alfabetico). Nessuna nuova chiamata API — il dato arriva già con `GET /unmatched`.

## 3. Design

**API.** `GET /api/resources/unmatched` (`api/src/routes/resources.js`) aggiunge `project_codes: string[]` alla riga aggregata, via `array_agg(DISTINCT project_code ORDER BY project_code)` nella stessa query — `projects` (count) resta invariato per compatibilità, nessun consumer esistente si rompe. Nessuna migrazione, nessun nuovo endpoint.

**`js/lib/team-ui.js`.** Nuova funzione pura `paginate(items, page, pageSize)` → `{ pageItems, totalPages, page }` (clamp di `page` tra 1 e `totalPages`, `totalPages` minimo 1 anche a lista vuota), coperta da vitest, usata da entrambe le tabelle invece di duplicare la logica nel componente Vue. Bridge `window.paginate` come gli altri export del file.

**`team.html` — tab Team.** Stato `teamPage` (default 1); computed `pagedResources = window.paginate(this.sortedResources, this.teamPage, 25)`; la tabella itera su `pagedResources.pageItems`; controlli di paginazione sotto la tabella (Precedente/Successivo disabilitati ai margini, "Page X of Y"); `watch` su `filteredResources`/`sortKey`/`sortDir` che azzera `teamPage` a 1 (stesso pattern di reset già visto altrove nella pagina).

**`team.html` — tab Unmatched names.**
- Nuovo stato: `unmatchedFilterText` (ricerca), `unmatchedSortKey`/`unmatchedSortDir` (default `hours`/`desc`, per restare coerenti con l'ordine attuale del backend), `unmatchedPage`, `expandedProjects` (Set di `name_normalized` con l'elenco progetti aperto).
- Computed: `filteredUnmatched` (filtro su `display_name`, stessa logica case/accent-insensitive di `filteredResources`) → `sortedUnmatched` (`window.sortResources`, riusata anche qui: le chiavi `hours`/`projects`/`name` sono generiche, non serve una funzione separata — verificare in implementazione se `sortResources` richiede un adattamento per chiavi numeriche; se sì, generalizzarla lì invece di duplicarla) → `pagedUnmatched` (`window.paginate`).
- La cella "Projects" mostra `u.projects` come oggi; un click su `toggleProjects(u)` apre/chiude un `<details>`/riga espansa con `u.project_codes.join(', ')` o una lista puntata se preferibile in implementazione (dettaglio di markup, non di comportamento).
- Reset pagina a 1: `watch` su `unmatchedFilterText`, `unmatchedSortKey/Dir`, e dopo ogni `loadUnmatched()` (assign/ignore/rescan cambiano la lista).

**Dati.** Nessun cambio a `loadUnmatched()` oltre a ricevere il nuovo campo `project_codes` dalla risposta già chiamata.

## 4. Fuori scope (confermato dall'utente)

- Suggerimento "candidate" per nomi unmatched via token-overlap — **parcheggiato esplicitamente**, non è una bocciatura ma un "non ora"; va ripreso come voce separata in `project_team_ux_backlog.md` quando richiesto.
- Colonna progetti sempre visibile (si è scelto il pattern espandibile al click).
- Persistenza della pagina/ricerca/ordinamento tra sessioni o in URL.
- Modifica inline, pagina dedicata `resource.html`, deep link — invariato dal ciclo precedente.
- L'audit di navigazione — **cancellato**, non più un ciclo pianificato (decisione utente 2026-09-28).

## 5. Vincoli

- Nessun bundler/build step; Vue da CDN; `v-cloak` invariato; testi in inglese; niente `alert`/`confirm` nativi.
- `js/lib/team-ui.js` è un file versionato: bump `?v=N` sul suo `<script type="module" src="js/lib/team-ui.js?v=...">` in `team.html` (unico consumatore) dopo la modifica.
- Nessun cambio a `css/*` né a `js/api.js`.
- La query SQL modificata resta a rischio-zero di regressione: `project_codes` è additivo, `projects` (count) resta identico bit-per-bit rispetto a oggi.

## 6. Criteri di accettazione

1. Tab Unmatched names: digitare nella ricerca filtra le righe per nome; cliccare un'intestazione ordina (secondo clic inverte); con più di 25 righe compaiono i controlli di paginazione e funzionano correttamente insieme a ricerca/ordinamento.
2. Tab Team: con più di 25 righe filtrate compaiono i controlli di paginazione; cambiare ricerca, "Show inactive" o ordinamento riporta alla pagina 1.
3. Cliccare il conteggio "Projects" di una riga unmatched apre l'elenco dei project code di quel nome; un secondo click lo richiude.
4. Assign/Ignore/Rescan continuano a funzionare come oggi e la lista si aggiorna coerentemente con ricerca/ordinamento/paginazione attivi.
5. `npm test` verde, inclusi i nuovi test vitest per `paginate()`.
6. Nessuna regressione sulla risposta di `GET /api/resources/unmatched` per i consumer esistenti (il campo `projects` resta un numero identico a prima).
