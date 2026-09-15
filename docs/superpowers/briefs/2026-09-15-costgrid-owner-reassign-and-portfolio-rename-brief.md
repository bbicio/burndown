# Brief — Rename "Portfolio" button + owner reassignment in costgrid.html

**Data:** 2026-09-15
**Scenario:** 2 — Evoluzione di una feature esistente

## Current behavior

**Bottone "Portfolio" (pipeline.html e costgrid.html):**
- `pipeline.html:279` — nel pannello di dettaglio di una proposta, sezione progetti collegati, il pulsante `📊 Portfolio` chiama `pbGoToPortfolio(lp.navId)` (`pipeline.html:814-816`), che naviga a `/portfolio.html?projectId=<id>` — la dashboard di quel progetto.
- `costgrid.html:145` — nella stessa area (progetti agganciati alla cost grid), il pulsante `📊 Portfolio` chiama `openLinkedProject(lp.currentProjId)` (`costgrid.html:968`), che a sua volta chiama `showDashboardView(projId)` — stessa destinazione.

**Riassegnazione owner (meccanismo esistente, diverso contesto):**
`_db-reset.html` ha un widget "Change proposal owner" (sysadmin-esclusivo, poiché l'intero router `api/src/routes/reset.js` è gated `requireAuth, requireSysAdmin` — `reset.js:8`) che chiama `PATCH /api/admin/reset/cost-grid/:cgId/owner` (`reset.js:82-129`). Corretto in un ciclo precedente (`docs/superpowers/reports/2026-09-12-worktree-fix-owner-reassign-shares-sync-finish-cycle.md`) per essere transazionale e sincronizzare `resource_shares`: aggiorna `cost_grids.owner_id`, rimuove la riga `resource_shares` (permission='owner') del vecchio owner, fa upsert di una riga owner per il nuovo. **Non tocca in alcun modo i progetti collegati alla cost grid, e non invia email.**

Il modello `resource_shares` (`resource_type, resource_id, user_id, permission, shared_by`, vincolo unico su `(resource_type, resource_id, user_id)`) è già usato identicamente per progetti (`api/src/routes/projects.js:339-342`) con `permission` limitato a `'editor'|'viewer'` sulla rotta di condivisione generica (l'owner si imposta solo a creazione o via riassegnazione dedicata).

Il servizio email (`api/src/services/email.js`) ha 5 funzioni esistenti, tutte costruite sullo stesso pattern: chiamano `renderEmailHtml({ appUrl, bodyHtml })` (`api/src/lib/email-template.js`) e passano il risultato a `transporter.sendMail`. Non esiste oggi una funzione per notificare una riassegnazione di ownership.

## Expected behavior

**Rename (pipeline.html + costgrid.html):** l'etichetta del pulsante `📊 Portfolio` diventa `📊 Project Dashboard` in entrambi i file. Nessun cambio di comportamento (stessa destinazione, stesso handler).

**Riassegnazione owner in costgrid.html:**
- Nuova sezione "Owner" nella card "Offer details" di `costgrid.html`, visibile solo ad admin/sysadmin (`isAdminRole`), accanto alla riga `Owner: 👤 <nome>, Created at: <data>` già esistente — un dropdown "Reassign to..." popolato con gli utenti attivi.
- Alla selezione, conferma esplicita via `showConfirm()` (mai `confirm()` nativo), poi:
  1. `cost_grids.owner_id` viene aggiornato al nuovo utente (vera riassegnazione di proprietà, non solo condivisione).
  2. `resource_shares` sulla cost grid viene sincronizzato con permission `'owner'` per il nuovo utente (stesso pattern già corretto in `reset.js`, il vecchio owner perde la riga `owner`).
  3. Per **ogni progetto collegato a qualsiasi versione** di questa cost grid (join su tutte le `cost_grid_versions` di questo `cost_grid_id` via `cg_version_projects`), viene fatto upsert di una riga `resource_shares` con `permission='editor'` per il nuovo utente — il vecchio owner non perde accesso ai progetti (solo alla cost grid).
  4. Viene inviata una email al nuovo owner (solo a lui) via una nuova funzione `sendOwnerReassignedEmail` in `email.js`, che riusa `renderEmailHtml` come le altre.
- Nuovo endpoint `PATCH /api/cost-grids/:id/reassign-owner`, gated `isAdminRole` (non l'endpoint sysadmin-only esistente in `reset.js`, che resta invariato) — transazione singola per i passi 1-3, invio email dopo commit riuscito.
- Nessuna restrizione per stage/lock (`isLocked`) — operazione amministrativa indipendente dallo stato della proposta.

## Constraints

- Non toccare l'endpoint sysadmin-only esistente (`reset.js`'s `PATCH /cost-grid/:cgId/owner`) né il widget `_db-reset.html` — restano il percorso sysadmin-esclusivo, invariato.
- Nessuna migrazione DB — `resource_shares`/`cost_grids.owner_id` hanno già lo schema necessario.
- Riusa `isAdminRole` (`api/src/lib/is-admin.js`) per il gate admin/sysadmin, coerente con il resto della codebase (non un controllo `role === 'admin'` inline).
- Riusa `renderEmailHtml`/il pattern esistente delle altre funzioni email — nessun nuovo sistema di template.
- La UI deve usare `showConfirm()` (il modal esistente dell'app), mai `confirm()`/`alert()` nativi.

## Acceptance criteria

1. In `pipeline.html` e `costgrid.html`, il pulsante mostra "📊 Project Dashboard" e naviga esattamente come prima (nessuna regressione sulla destinazione).
2. In `costgrid.html`, il dropdown "Reassign to..." è visibile solo per utenti con ruolo admin o sysadmin; assente/non interagibile per viewer/editor.
3. Dopo la riassegnazione: `cost_grids.owner_id` è il nuovo utente; `GET /api/cost-grids/:id/shares` mostra il nuovo utente con permission `'owner'` e non mostra più il vecchio owner con quella permission.
4. Dopo la riassegnazione: ogni progetto collegato a qualsiasi versione della cost grid mostra il nuovo utente con permission `'editor'` in `GET /api/projects/:id/shares` (o endpoint equivalente); il vecchio owner mantiene il proprio accesso pre-esistente sui progetti (non viene rimosso nulla lì).
5. Il nuovo owner riceve un'unica email (nessuna al vecchio owner), con contenuto costruito da `renderEmailHtml`.
6. La riassegnazione funziona indipendentemente dallo stage/lock della proposta (Draft, Committed, ecc.).
7. Un tentativo di riassegnazione da parte di un utente non admin/sysadmin è rifiutato lato server (403), anche se la UI dovesse essere in qualche modo raggiunta.

## Explicitly excluded scope

- **Non si tocca l'endpoint/widget sysadmin-only esistente** (`reset.js`, `_db-reset.html`) — resta com'è, un percorso amministrativo separato e indipendente.
- **Nessuna remediation dei 2 proposal di produzione con `resource_shares` non sincronizzati**, segnalati come roadmap item aperto nel ciclo precedente (`2026-09-12-worktree-fix-owner-reassign-shares-sync-finish-cycle.md`) — non collegato a questo lavoro, non affrontato qui.
- **Nessuna email al vecchio owner** — per decisione esplicita, solo il nuovo owner viene notificato.
- **Nessun cambio al modello di permesso generico di condivisione** (`js/shares.js`, il modal Share) — la riassegnazione owner è un'azione distinta e più ristretta (solo admin/sysadmin, solo dropdown dedicato), non un'estensione del modal di condivisione esistente.

## Domande aperte per `/brainstorming`

- Formato/contenuto esatto del testo dell'email di riassegnazione (oggetto, corpo) — da definire in fase di design.
- Dettagli UI esatti del dropdown (stile, posizione precisa nella card, comportamento di caricamento della lista utenti) — da rifinire in brainstorming con eventuale mockup se utile.

Brief ready. Next step: /brainstorming.
