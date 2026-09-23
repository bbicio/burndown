# Design — Cycle 2: collegamento tag (attribute_lists) a proposal/progetto

## Overview

Secondo dei quattro cicli previsti per l'iniziativa di allocazione risorse (vedi `docs/superpowers/specs/2026-09-23-team-attribute-lists-design.md`, Cycle 1). Il Cycle 1 ha introdotto `attribute_lists`/`attribute_list_items` come tassonomia generica gestita da `attribute-lists.html`, ma completamente scollegata dal resto dell'app — nessuna pagina legge o scrive quei tag. Questo ciclo aggiunge il collegamento: un admin/editor può assegnare tag (Market, Brand, Therapeutic Area, Service Type, o qualunque lista futura) a una proposal (cost grid version) o a un progetto creato a mano.

Fuori scope (rimandato a cicli successivi):
- Filtro per tag nella filter bar del pipeline board (accanto a Owner/Client/Currency/Value).
- Qualunque visualizzazione dei tag in `portfolio.html`.
- Profilo risorsa arricchito da actuals (Cycle 3) e motore di suggerimento AI (Cycle 4) — non toccati qui.

## 1. Modello dati

Nuova migration `api/src/db/migrations/022_version_project_tags.sql`:

```sql
CREATE TABLE cost_grid_version_tags (
  version_id UUID NOT NULL REFERENCES cost_grid_versions(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES attribute_list_items(id),
  PRIMARY KEY (version_id, item_id)
);

CREATE TABLE project_tags (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES attribute_list_items(id),
  PRIMARY KEY (project_id, item_id)
);
```

Note:
- Nessuna `ON DELETE CASCADE` su `attribute_list_items(id)`: gli item non vengono mai eliminati fisicamente (solo `inactive`, per design del Cycle 1), quindi non serve gestire la cancellazione a cascata lato tag.
- `project_tags` è scritta e letta **solo** quando il progetto non ha `costGridRef` impostato. Quando `costGridRef` è presente, i tag effettivi sono quelli della versione collegata (vedi §3) — eventuali righe residue in `project_tags` per un progetto che in seguito acquisisce un `costGridRef` restano nel DB ma vengono ignorate, non è previsto un cleanup automatico (stesso trattamento riservato oggi a `config.projects[].pipeline` quando diventa ridondante rispetto al valore della versione collegata).
- Nessun vincolo di unicità aggiuntivo oltre alla PK composita: un item non può essere associato due volte alla stessa versione/progetto, ma la stessa versione può avere item di più liste diverse contemporaneamente (multi-select confermato).

## 2. API

Nuove route, montate sui router esistenti (`cost-grids.js` e `projects.js`), non un file a parte — seguono lo stesso ciclo di vita CRUD delle risorse a cui appartengono:

| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/cost-grids/:cgId/versions/:verId/tags` | Lista degli `item_id` (con `list_id`/`label` risolti) assegnati alla versione |
| PUT | `/api/cost-grids/:cgId/versions/:verId/tags` | Sostituisce l'intero set (`{ itemIds: string[] }`) — replace-all, stesso pattern già usato da `PUT .../structure` |
| GET | `/api/projects/:id/tags` | Lista degli `item_id` assegnati al progetto |
| PUT | `/api/projects/:id/tags` | Sostituisce l'intero set — **rifiuta con 409** se il progetto ha `costGridRef` impostato (i tag in quel caso si modificano solo dalla proposal collegata) |

Permessi: stesso modello già in vigore per la risorsa madre — `requireAuth` + editor/owner della cost grid version (non viewer) per il primo path, editor/owner del progetto per il secondo. Nessuna nuova voce in `auth.js`.

Validazione: ogni `item_id` nel payload deve esistere in `attribute_list_items` (qualunque `status`, anche `inactive` — un tag già assegnato e poi disattivato resta assegnato finché qualcuno non lo rimuove esplicitamente, stesso comportamento non distruttivo del resto del sistema di tassonomia); id sconosciuto → 400.

## 3. Risoluzione lato frontend

Nuova funzione `getProjectTags(projectId)` in `js/core.js`, gemella di `getProjectPipeline(projectId)` (stesso file, stessa logica):
1. Risolve il progetto e il suo `costGridRef`.
2. Se `costGridRef` è impostato: ritorna i tag della versione collegata (già caricati in `_cgStore`/via `cgLoadStructureFromApi`, che verrà esteso per includere anche i tag della versione nella stessa chiamata di caricamento struttura, evitando una fetch separata).
3. Altrimenti: ritorna i tag diretti del progetto (caricati insieme al resto di `config.projects[]` da `loadConfigFromApi()`, esteso per includere `tags` per-progetto).

Questa funzione è il solo punto di lettura usato da entrambe le pagine UI (§4, §5) — nessun'altra pagina la consuma in questo ciclo.

## 4. UI in `costgrid.html`

Nuova sezione collassabile "🏷 Tags", inserita tra "📄 Offer details" e "📤 Sharing" nell'ordine verticale della pagina, stesso pattern Vue delle sezioni esistenti (`section-card`/`section-header` cliccabile con freccia ▶/▼, variabile `tagsCollapsed` nel `data()`):

```html
<div class="section-card mb-3">
  <div class="section-header d-flex align-items-center" style="cursor:pointer;user-select:none" @click="tagsCollapsed = !tagsCollapsed">
    <span>{{ tagsCollapsed ? '▶' : '▼' }}</span>
    <span>🏷 Tags</span>
  </div>
  <div v-show="!tagsCollapsed" class="p-3">
    <!-- un blocco per lista attiva, multi-select sugli item attivi -->
  </div>
</div>
```

- Le liste (`GET /api/attribute-lists`) e i relativi item attivi (`GET /api/attribute-lists/:id/items`, filtrati client-side su `status === 'active'`) vengono caricati una volta al mount della pagina, come già avviene per client/programmi/ruoli.
- Un multi-select (`<select multiple>` o checkbox list, a seconda di quanti item ha in media una lista — dettaglio implementativo lasciato al piano) per ciascuna lista attiva.
- On-change: salvataggio immediato via `PUT .../tags` con l'intero set aggiornato (replace-all), stesso schema fire-and-forget di `onHeaderFieldChange`.
- Sola visualizzazione (nessun controllo editabile) quando `isLocked` o `cg?.myPermission === 'viewer'`, stesso gate già usato per gli altri campi header.

## 5. UI in `project-config.html`

Stessa sezione "🏷 Tags", stesso componente/pattern di rendering dei multi-select per lista, ma con un ramo condizionale sulla presenza di `costGridRef`:

- **Con `costGridRef`**: sola lettura, con una nota "Managed from the linked proposal" e un link diretto a `costgrid.html?cgId=...&verId=...` per andare a modificarli lì.
- **Senza `costGridRef`**: editabile, stesso salvataggio on-change via `PUT /api/projects/:id/tags`.

Nella modalità viewer della pagina (banner sticky read-only già esistente) la sezione tag è sola lettura indipendentemente da `costGridRef`, come ogni altro input della pagina.

## 6. Testing

- Backend (`node:test`): per entrambe le nuove coppie di route — replace-all corretto (aggiunta, rimozione, set vuoto), 400 su `item_id` inesistente, 403 su utente senza permesso di scrittura sulla risorsa madre, 409 su `PUT /api/projects/:id/tags` quando il progetto ha `costGridRef`.
- Nessuna nuova logica pura da estrarre in `js/lib/` — stesso ragionamento del Cycle 1: le due pagine restano CRUD diretto via Vue + `fetch`, senza calcoli client-side da isolare.
- `TEST_CASES.md`: nuova sezione con i casi manuali (assegnare tag su una proposal, verificare che il progetto generato li rispecchi in sola lettura, rimuovere un tag dalla proposal e verificare che sparisca anche dal progetto, creare/modificare tag su un progetto senza `costGridRef`).
- Verifica manuale via `scripts/test-branch.sh` prima del merge, come da prassi.

## Migrazione e sync-docs

- Migration `022_version_project_tags.sql` va applicata al main stack da `/finish-cycle` Gate 4 (step già corretto nel ciclo `worktree-admin-crud-consistency` per applicare automaticamente le migration pendenti prima del restart del backend).
- CLAUDE.md, ARCHITECTURE.md, PRD.md, TEST_CASES.md aggiornati a fine ciclo da `/sync-docs`, come da processo standard.
