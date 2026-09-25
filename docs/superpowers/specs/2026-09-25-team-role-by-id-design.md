# Team — ruolo della risorsa per ID (design)

Piccolo ciclo tra il 3b e il 3c del Ciclo 3 (profilo risorsa da storico progetti, `docs/superpowers/specs/2026-09-25-resource-profile-design.md`). Origine: durante la verifica manuale del 3b l'utente ha notato che il dropdown "job title" di `team.html` salva `roles.label`, mentre il ruolo che arriva dagli XLS degli actuals è `roles.code`.

## Evidenza (dati reali, clone del `pdash-db`, 2026-09-25)

- Le stringhe di ruolo negli actuals sono i **codici** (es. `HWGACCSVS - DIRECTOR`): 9 dei 12 ruoli distinti negli actuals coincidono con un `roles.code`, **0** con un `roles.label`. Anche `project_tasks.resources[].role` contiene il codice.
- `resources.job_title` è testo libero (migrazione `020`), letto solo da `api/src/routes/resources.js`, `team.html` e dai test (`TM-04…TM-07`, `TM-10`). Nessun'altra pagina o JS condiviso lo usa.
- La spec del Ciclo 1 era incoerente: parlava di "coerenza con i codici usati negli xls actuals" ma faceva riempire il select con i `label`.

## Decisione (utente)

- **La risorsa è legata al ruolo per ID:** `resources.role_id → roles.id`, `NOT NULL`. Il match tra la stringa dell'XLS e `roles.code` resta per stringa (nell'upload), invariato.
- **Sparisce l'opzione "Other…"** (job title libero): ogni risorsa ha un ruolo esistente in `roles`; se manca, l'admin lo crea prima in Config → Roles.
- Il dropdown mostra **`label (code)`** con `role.id` come valore.

## Design

**Migrazione `025_resource_role_id.sql`** (idempotente, per la convenzione delle migrazioni del progetto):
1. `ALTER TABLE resources ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE RESTRICT`.
2. Un blocco `DO $$`, eseguito solo se la colonna `job_title` esiste ancora: riempie `role_id` confrontando `job_title` con `roles.code` (senza maiuscole, `btrim`) e poi con `roles.label`; se resta anche una sola riga senza ruolo, **fallisce con un errore esplicito** (`RAISE EXCEPTION`, nessuna perdita silenziosa); altrimenti `role_id SET NOT NULL` e `DROP COLUMN job_title`.
3. Nel `pdash-db` reale `resources` ha 0 righe (verificato sul clone), quindi non c'è nulla da convertire.

**API (`resources.js`, solo `requireAdmin`):**
- `POST`/`PATCH` accettano `roleId` al posto di `jobTitle`. `POST` lo richiede; `PATCH` rifiuta un valore vuoto. `roleId` non UUID → 400, UUID inesistente → 400 ("Role not found", distinguendo la FK dei ruoli da quella dell'utente collegato tramite `err.constraint`).
- `GET` restituisce `role_id`, `role_label`, `role_code` (JOIN su `roles`); `job_title` sparisce dalle risposte.

**`config.js` — `DELETE /api/roles/:id`:** oggi controlla solo `task_roles`; con la FK, cancellare un ruolo assegnato a una risorsa darebbe un 500. Aggiungere un controllo su `resources.role_id` con lo stesso stile del controllo esistente (400, "Cannot delete role assigned to a team resource") e gestire `23503` come rete di sicurezza.

**`team.html`:** colonna "Role" (label con il codice in secondario), select con `role.id`/`label (code)` (opzione disabilitata "Select a role…"), nessun input "Other", `openEdit` preseleziona `r.role_id`, `submitForm` invia `roleId` e valida che sia scelto; la ricerca filtra anche per ruolo. Il pannello "Unmatched names" non cambia.

**Effetti sugli altri flussi:** rinominare `label` o `code` di un ruolo in Config si propaga da solo alla risorsa (è per ID); l'upload XLS non cambia; i cicli 3c/4 potranno confrontare il ruolo degli actuals (`roles.code` → `roles.id`) con `resources.role_id` con una semplice join.

## Fuori scope

- Il ruolo per ID sui task dei progetti e sulle cost grid (restano per stringa/`role_id` come oggi).
- I 3 codici ruolo presenti negli actuals ma assenti da `roles` (problema di qualità dei dati, separato).
- Il ciclo "team UX" (lista, pannello di dettaglio, coda scalabile) e il 3c.

## Criteri di accettazione

1. La migrazione converte le risorse esistenti per `code`/`label`, oppure fallisce con un messaggio esplicito se una riga non ha un ruolo corrispondente; rieseguita è un no-op.
2. `POST`/`PATCH /api/resources` usano `roleId`; senza `roleId` (POST), vuoto, non UUID o inesistente → 400; `GET` restituisce `role_id`/`role_label`/`role_code`.
3. Cancellare un ruolo assegnato a una risorsa → 400 con messaggio chiaro, e riuscire dopo aver tolto la risorsa; rinominare un ruolo si riflette sulla risorsa.
4. `team.html` mostra `label (code)`, non offre "Other…", precarica il ruolo in modifica e richiede un ruolo.
5. Le suite esistenti restano verdi, con i test `TM-*` aggiornati e nuovi.
