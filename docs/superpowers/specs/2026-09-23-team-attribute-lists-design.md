# Design — Team (anagrafica risorse) e Attribute Lists (tassonomia tag generica)

## Overview

Primo di quattro cicli previsti per l'iniziativa di allocazione risorse (vedi contesto sotto). Introduce due nuove pagine admin-only:

1. **`team.html`** — anagrafica delle risorse umane allocabili (nome, cognome, email, job title, job description), separata dalla tabella `users` ma collegabile opzionalmente a un account PDash esistente.
2. **`attribute-lists.html`** — un sistema di liste/tag generico e agnostico: l'admin crea liste (es. Market, Brand, Therapeutic Area, Service Type) e gli item di ciascuna, senza bisogno di codice dedicato per ogni nuova categoria.

Questo ciclo è puro add-on: nessuna pagina esistente cambia comportamento. I tag creati qui non sono ancora collegati a proposal/progetto — quel collegamento è il Ciclo 2 (fuori scope di questo spec). Il profilo risorsa arricchito dagli actuals è il Ciclo 3, e il motore di suggerimento AI + chatbot è il Ciclo 4 — nessuno dei due è toccato qui.

## 1. Modello dati

Nuova migration `api/src/db/migrations/020_resources_attribute_lists.sql`:

```sql
CREATE TABLE resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      VARCHAR(255) NOT NULL,
  last_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  job_title       VARCHAR(255) NOT NULL,
  job_description TEXT,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attribute_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attribute_list_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID NOT NULL REFERENCES attribute_lists(id) ON DELETE CASCADE,
  label       VARCHAR(255) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO attribute_lists (name, slug) VALUES
  ('Market', 'market'),
  ('Brand', 'brand'),
  ('Therapeutic Area', 'therapeutic-area'),
  ('Service Type', 'service-type');
```

Note:
- `resources.job_title` è testo libero, non una FK verso `roles` — il form CRUD (§3) offre un `<select>` precompilato con i `label` esistenti in `roles` più un'opzione "Other" che sblocca un campo testo. Questo evita un vincolo rigido pur mantenendo coerenza con i codici usati negli xls actuals (matching case-insensitive per stringa, stesso pattern già usato in `api/src/routes/timesheets.js` per il confronto ruolo/task).
- `resources.user_id` è opzionale — una risorsa può esistere senza alcun account PDash (freelance, risorse esterne).
- `attribute_lists.slug` è generato automaticamente dal nome alla creazione (slugify: minuscolo, spazi → `-`, caratteri non alfanumerici rimossi), immutabile una volta creato, con vincolo di unicità DB. Rinominare il campo `name` non cambia lo `slug`.
- Nessuna colonna di ordinamento manuale — le liste e gli item si presentano in ordine alfabetico per `name`/`label`.
- Nessun `DELETE` fisico su `attribute_lists`/`attribute_list_items` previsto lato API in questo ciclo — solo lo stato `inactive`, per non rompere futuri riferimenti da proposal/progetto (Ciclo 2). `resources` invece supporta sia `DELETE` fisico sia `inactive`, perché in questo ciclo nessun'altra tabella referenzia ancora `resources.id`.

## 2. API

Nuovo file `api/src/routes/resources.js`, montato su `/api/resources`, tutte le route `requireAuth, requireAdmin`:

| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/` | Lista tutte le risorse (incl. inactive), con eventuale `user_id` risolto a nome/email dell'utente collegato |
| POST | `/` | Crea risorsa |
| PATCH | `/:id` | Aggiorna campi (incl. `status`) |
| DELETE | `/:id` | Elimina fisicamente |

Nuovo file `api/src/routes/attribute-lists.js`, montato su `/api/attribute-lists`, tutte le route `requireAuth, requireAdmin`:

| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/` | Lista tutte le liste con conteggio item attivi |
| POST | `/` | Crea lista (`name` → genera `slug`, 409 se collisione) |
| PATCH | `/:id` | Rinomina `name` (slug invariato) |
| GET | `/:id/items` | Lista item di una lista (incl. inactive) |
| POST | `/:id/items` | Crea item |
| PATCH | `/:id/items/:itemId` | Aggiorna `label`/`status` |

`requireAdmin` è già esteso ad `admin`+`sysadmin` (vedi `api/src/middleware/auth.js`, introdotto nel ciclo sysadmin) — nessuna modifica al middleware necessaria qui.

## 3. Pagina `team.html`

Vue 3 via CDN, stesso pattern strutturale di `admin.html` (full page, `<div id="app" v-cloak>`, `initNav('team')`, script `defer`, `?v=1` sui nuovi file). Gate d'accesso: `!['admin','sysadmin'].includes(user.role)` → messaggio "Access denied" (stesso pattern di `config.html`/`admin.html`).

- **Tabella principale**: colonne Nome, Cognome, Email, Job Title, Stato. Filtro testo libero (nome/email), toggle "Show inactive".
- **Modale Crea/Modifica risorsa**: campi Nome, Cognome, Email, Job Title (`<select>` popolato da `GET /api/config/roles` con opzione finale "Other..." che mostra un `<input>` testo), Job Description (`<textarea>`), collegamento utente opzionale (`<select>` con ricerca, popolato da `GET /api/users/active-list`, stesso endpoint già usato da `js/shares.js`).
- **Azioni riga**: Modifica (riapre la modale in edit), Attiva/Disattiva (`PATCH status`), Elimina (`showConfirm()` poi `DELETE`).
- Nessuna vista "profilo arricchito" — fuori scope (Ciclo 3).

## 4. Pagina `attribute-lists.html`

Vue 3 via CDN, stesso pattern/gate d'accesso di `team.html`.

- **Vista principale**: elenco liste (Nome, Slug, conteggio item attivi). Bottone "+ New list" (modale con solo il campo Nome; validazione lato server sulla collisione di slug). Azione "Rename" per modificare `name` (nessuna eliminazione lista in questo ciclo).
- **Vista drill-in** (click su una lista): tabella dei suoi item (Label, Stato), bottone "+ New item", azione "Edit label", toggle Attiva/Disattiva. Nessuna eliminazione fisica di item.
- Le 4 liste seed (Market, Brand, Therapeutic Area, Service Type) sono create vuote dalla migration — nessun item pre-popolato; l'admin li aggiunge dalla UI dopo il deploy.

## 5. Navigazione

`js/nav.js`: due nuove voci nel menu admin/sysadmin (stesso blocco condizionale `role === 'admin' || role === 'sysadmin'` già esistente per Config/Actuals Repository/User Admin):

```
<a class="nav-main-tab nav-admin-tab${activeTab === 'team' ? ' active' : ''}" href="/team.html">👥 Team</a>
<a class="nav-main-tab nav-admin-tab${activeTab === 'attributelists' ? ' active' : ''}" href="/attribute-lists.html">🏷 Attribute Lists</a>
```

## 6. Testing

- Backend: unit test (`node:test`, `api/src/lib/*.test.js` o inline in `attribute-lists.test.js` accanto alla route) per la funzione di slugify/unicità e per le transizioni di stato (`active`→`inactive` e viceversa, nessuna eliminazione fisica su liste/item).
- Nessuna nuova logica pura da estrarre in `js/lib/` — le due pagine sono CRUD diretto via Vue + `fetch`, senza calcoli lato client da testare in isolamento.
- Verifica manuale: creare una risorsa con job title da dropdown e una con "Other" + testo libero; creare una lista, verificarne lo slug generato, rinominarla e confermare che lo slug non cambi; disattivare un item e verificare che sparisca dal conteggio "active" ma resti visibile con "Show inactive".

## Fuori scope (rimandato ai cicli successivi)

- Collegamento dei tag di `attribute_lists` a proposal/progetto, e propagazione proposal → progetto (Ciclo 2).
- Profilo risorsa arricchito da actuals nel tempo, campo riassunto AI-generato (Ciclo 3).
- Motore di suggerimento allocazione AI e chatbot su `planning.html` (Ciclo 4).
- Matching automatico tra `resources` e le righe actuals (oggi identificate per nome libero nell'xls) — nessun collegamento `resources.id` ↔ dati actuals viene creato in questo ciclo.
