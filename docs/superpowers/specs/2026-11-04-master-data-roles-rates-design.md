# Master Data — Roles & rates (phase 2, page 3 of 4) — design spec

**Date:** 2026-11-04
**Brief started:** unknown
**Brief:** `docs/superpowers/design/MD-Roles-Rates/2026-11-04-brief-master-data-roles-claude-code.md`
**Scenario:** 2 (evoluzione)

Fase 2 del redesign Master Data, terza pagina: il contenuto della sezione "Roles & rates" dentro la shell della
fase 1. La tabella piatta diventa una lista raggruppata per team con una colonna di tariffa per valuta attiva; la
form card diventa un pannello laterale unico per creazione e modifica; il `confirm()` nativo del delete diventa
un dialogo di conferma. Il brief è normativo dove differisce dalle note delle tavole; le regole attuali dell'app
vincono sulle tavole (brief §2). Le catture JPG che il brief colloca in `docs/captures/roles/` stanno nella
cartella design del brief. Nessuna modifica API, shell o regole di tariffa.

## 1. Obiettivo

- Lista per team (10.7a): gruppi richiudibili, una colonna per valuta attiva, stati di tariffa mancante, ricerca,
  filtro "Missing rates".
- Pannello laterale create/edit (10.7b, 10.7c) con Team + Role code + anteprima Full code e tariffe per valuta,
  con il comportamento attuale degli input money; gli override di valute inattive sopravvivono a una modifica.
- Delete tramite dialogo di conferma che segue la regola del server, errori dentro il dialogo (10.7d).
- Tablet e smartphone come 10.7e; niente emoji, niente `confirm()`/`alert()`, copy in inglese.

## 2. Fatti verificati nel codice (a `531a7c3`)

- `master-roles.html`: un'app Vue, `groupedRoles` per `extractTeam(code)` (prefisso prima del primo `" - "`,
  fallback primo token di `/[\s_-]/`, `'—'` se vuoto), ordinamento team poi label; form card `rf`; emoji
  ✏️ 🗑 ⚠️; `confirm()` in `deleteRole`; `globalError` con watcher scroll-to-top (`master-roles.html:264-268`).
- `loadAll()` mappa `hourly_rate || 0` in `rate`, `rate_overrides || {}` in `rateOverrides`; `Api.currencies.list()`
  restituisce tutte le valute, il form mostra solo le non-EUR `active`.
- `openRoleForm` carica **ogni** override salvato in `rf.overrideTexts`/`rf.stored`, anche di valute inattive;
  `saveRole` itera su tutti — per questo oggi sopravvivono a un edit.
- `showConfirm()` (`js/core.js:287`) esegue `onConfirm` e chiude subito il modal: non può tenerlo aperto con un
  errore. Precedente di modal Vue che resta aperto in errore: `#crRateConfirmModal` in `master-currencies.html`.
- Il "drawer" di Pipelines è CSS locale alla pagina (`.mdp-scrim`/`.mdp-drawer`, `master-pipelines.html:144`),
  non un componente condiviso.
- `cg-select` (`js/cg-controls.js`) ha `searchable` ma non accetta un valore digitato libero.
- `resolveRoleRate` (`js/lib/costgrid-calc.js:92`): per una valuta non-EUR senza override restituisce
  `Number((eurRate * currencyRate).toFixed(digits))`, `digits` da `currencyInfo(currency)` (`Intl`, indipendente
  dalla lista valute).
- Token warning: `--color-warning`, `--color-warning-bg`, `--color-warning-text` (`css/tokens.css:71-73`).
- Guard: `js/lib/master-roles-rate-input-guard.test.js` (legge `master-roles.html`, pretende tra l'altro
  `v-model="rf.rateText"`, `v-model="rf.overrideTexts[cu.code]"`, `formatMoney(r.rate, 'EUR', currencies)`, niente
  `€/h`, il corpo di `saveRole` fino a `async deleteRole`); `js/lib/master-data-guard.test.js` (riga `PAGES` di
  Roles: `must: ['this.currencies    = currencies;', 'groupedRoles']`; blocco "no native dialog, emoji or form
  card" solo per `master-clients.html`).

## 3. Mappa tavola → sezione

| Tavola | Sezione |
|---|---|
| 10.7a `10.7a-roles-list.jpg` / `MDRoles.dc.html` default | §5 |
| 10.7b `10.7b-new-role-panel.jpg` / `panel=new` | §6 |
| 10.7c `10.7c-edit-role-panel.jpg` / `panel=edit` | §6 |
| 10.7d `10.7d-delete-confirm.jpg` / `confirm=true` | §7 |
| 10.7e `10.7e-tablet-smartphone.jpg` / `MDRolesResponsive.dc.html` | §8 |

Elementi delle tavole non costruiti: colonna "Used in", blocco usage nel pannello, conteggi nel dialogo (brief
§7.2); conteggio nel sub-nav (brief §7.6).

## 4. Architettura

- **`js/lib/master-roles.js`** (nuovo, ES module, `?v=1`, bridge `window.<name>` per export, come
  `master-clients.js`). Funzioni pure:
  - `extractTeam(code)` — spostata dalla pagina, comportamento identico.
  - `isMissingRate(rate)` — `true` per `null`, `undefined`, `0`.
  - `rateColumns(currencies)` — EUR (sempre, anche se assente dalla lista: `{ code: 'EUR' }`) poi ogni non-EUR
    `active` nell'ordine ricevuto.
  - `filterRoles(roles, { query, missingOnly })` — case-insensitive su label + code; `missingOnly` tiene i ruoli
    con `isMissingRate(rate)`.
  - `groupRoles(roles)` — `[{ team, roles, missing }]`, team con `localeCompare`, ruoli per label.
  - `fallbackRate(role, currency)` — `resolveRoleRate({ roleId, globalRate: rate, currency: code,
    currencyRate: current_rate, roleOverrides: {} })`.effectiveRate; `null` se `isMissingRate(rate)`.
  - `splitCode(code)` → `{ team, role }`: con `" - "` → team = `extractTeam(code)`, role = resto dopo il primo
    `" - "`; senza → `{ team: '', role: code }`.
  - `joinCode(team, role)` → `team ? team + ' - ' + role : role` (trim di entrambi).
  - `teamOptions(roles)` — team distinti dai codici con `" - "`, ordinati.
- **`master-roles.html`** — l'unica pagina toccata. CSS locale con prefisso `.mdr-`, solo token (nessun hex).
  Stato nuovo: `query`, `missingOnly`, `closedTeams` (Set in memoria), `phoneCurrency`, `del` (stato del
  dialogo). `rf` resta com'è, con in più `team` e `roleCode` (il `code` salvato è `joinCode`).

## 5. Lista (10.7a)

- Header della card: titolo "Roles & rates · N" (N = ruoli totali), descrizione "Agency rate card: every role with
  its default hourly rate in each active currency."; a destra, con wrap: ricerca 200px con icona, placeholder
  "Search role or code…"; switch `.md-switch` con modificatore ambra (`--color-warning`) "Missing rates · N";
  `.btn-primary` "+ Add role" (magenta, deviazione accettata come Clients).
- Colonne: "Role · code" | una per `rateColumns`, intestazione `currencyInfo(code, currencies).symbol + '/h'` |
  azioni. Intestazione 10px uppercase su `--surface-light`.
- Riga gruppo: chevron (ruota se aperto), team in grassetto, "N roles"/"1 role", pill ambra "N without € rate"
  quando N > 0; clic → apre/chiude. Default tutti aperti. Con ricerca o filtro attivi i gruppi con match sono
  forzati aperti e quelli senza match nascosti.
- Riga ruolo (min 50px): label 13px 600 con ellipsis e codice completo sotto in monospace muted.
  - EUR > 0: `formatMoney(r.rate, 'EUR', currencies)`, senza "/h".
  - EUR mancante: "No rate" in `--color-warning-text` 700, `title="No € rate: this role can't be priced"`, riga
    con sfondo `--color-warning-bg`.
  - Non-EUR con override: `formatMoney(value, code, currencies)`.
  - Non-EUR senza override: "—" muted, `title` "≈ <formatMoney(fallbackRate)> from € × rate", oppure "No rate" se
    manca anche l'EUR; stesso testo in `aria-label`.
  - Override di valute inattive: nessuna colonna.
- Azioni: link "Edit" (apre il pannello) e bottone cestino 30×30 (apre §7), SVG `ph-icon`.
- Colonna Role `position: sticky; left: 0`; la tabella scorre orizzontalmente dentro la card.
- Footer: "— = no rate in that currency: proposals in that currency fall back to the € rate × exchange rate.
  Clients can override rates in their own rate card."
- Vuoto: "No roles yet. Roles define columns in Cost Grid and drive rate calculations."; nessun match: "No roles
  match the current search."
- Errore di caricamento: dentro la card (alert), nessuno scroll. Il watcher su `globalError` si rimuove.

## 6. Pannello (10.7b, 10.7c)

- Wrapper `.mdr-drawer-wrap`: scrim navy (`--overlay-scrim`) e `<aside role="dialog" aria-modal="true">` 480px a
  destra, sul modello di `.mdp-drawer`. Chiude su scrim, ✕, Esc (non se un `.modal.show` è aperto), Cancel. Focus
  su Label all'apertura (`ref="rfLabel"`).
- Head: eyebrow "New role"/"Edit role", titolo "New role" / label del ruolo.
- Label — placeholder "e.g. Project Manager".
- Team + Role code affiancati. Team: combobox locale — input testo con una lista dei `teamOptions` filtrata mentre
  si scrive (apri su focus, frecce/Enter/Esc, clic su un'opzione), hint "Pick a team or type a new one". Role
  code: input monospace, placeholder "e.g. PROJECT MANAGER". All'apertura `splitCode(role.code)`; codice senza
  `" - "` → Team vuoto, Role code = codice intero, salvato invariato se il team resta vuoto.
- Riga Full code: `joinCode(rf.team, rf.roleCode)` in maiuscolo (solo anteprima; il server fa l'uppercase), a
  destra "Must match **Job Role: Name** in the XLS".
- "Default hourly rates": griglia a due colonne, un input per `rateColumns`, prefisso codice valuta, suffisso
  "/h". Stessi binding di oggi: `v-model="rf.rateText"` per EUR, `v-model="rf.overrideTexts[cu.code]"` per le
  altre, `@focus="onMoneyFocus(...)"`, `@blur="onMoneyBlur(...)"`.
  - EUR: hint "Required · base rate"; bordo e hint ambra quando vuoto.
  - Non-EUR vuoto: placeholder "≈ " + `formatMoneyInput(EUR × current_rate)` (logica attuale); hint "Empty: € rate
    × <current_rate>", oppure "Optional" se anche l'EUR è vuoto.
  - Non-EUR compilato: hint "Used as is in <CODE> proposals".
- Solo edit: riga "Changing a rate doesn't change existing cost grids."
- Footer: solo edit "Delete role" (testo rosso, chiude il pannello e apre §7); Cancel; primario "Create role" /
  "Save changes", disabilitato finché label o role code sono vuoti, spinner con `rf.loading`.
- `saveRole`: stesso corpo di oggi (stesse stringhe nello stesso ordine), con `code = joinCode(rf.team,
  rf.roleCode)`; errori in `rf.error` in cima al body del pannello. Successo: chiude il pannello, aggiorna la riga
  in place, rimuove il team del ruolo da `closedTeams`, ricerca e filtro restano.

## 7. Delete (10.7d)

- Modal Bootstrap `#roleDeleteModal` dentro `#app`, guidato da Vue sullo stato `del = { role, error, loading }`,
  aperto con `bootstrap.Modal.getOrCreateInstance(...).show()` dalla riga o dal footer del pannello.
- Titolo `Delete "<label>"?`; corpo "The role is removed from the agency rate card. Its custom rates in client
  rate cards are deleted too. A role used in a cost grid or assigned to a team resource can't be deleted."
  Nessun box grigio: senza conteggi (brief §7.2) non resta una riga vera da mostrarci.
- Bottoni: Cancel e "Delete role" (`.btn-danger`), spinner durante la richiesta.
- Successo: hide del modal, ruolo rimosso dalla lista. 400: `del.error` mostrato nel dialogo, Delete disabilitato,
  dialogo aperto; niente `alert()`, niente banner.
- Phone: stesso modal reso come bottom sheet via CSS (`.modal-dialog` in fondo, larghezza piena).

## 8. Responsive (10.7e)

- **Tablet (768–1023px):** header con titolo, "Missing rates · N" come toggle button 40px (`aria-pressed`) e "+ Add
  role"; ricerca in seconda riga a tutta larghezza. Tabella: Role, colonne valuta da 80px, chevron 36px; "Edit" e
  cestino nascosti; clic sulla riga apre il pannello. Controlli 40px. Pannello `min(480px, 100%)`.
- **Smartphone (< 768px):** ricerca 44px + "+ Add" 44px su una riga; `.md-seg` con un segmento per `rateColumns`
  (`phoneCurrency`, default EUR); chip "Missing rates · N" sotto. Team come piccolo heading uppercase; ogni ruolo
  una card (min 44px): label che va a capo, codice monospace sotto, a destra il valore nella valuta scelta —
  importo; "No rate" ambra con card ambra se manca l'EUR; "≈ <fallback>" in `--text-muted` se manca la non-EUR.
  Tap apre il pannello a schermo intero con footer sticky (Cancel / Save 46px), Delete nel footer, conferma come
  bottom sheet.

## 9. Componenti, token, icone, cache-busting

- Shell invariata. `.md-card`, `.md-switch`, `.md-seg`, `.btn-primary`, `.btn-danger`, `ph-icon` dal set
  esistente; nessuna emoji, nessun hex nella pagina.
- `master-roles.html` carica `js/lib/master-roles.js?v=1` prima dello script dell'app. Nessun file condiviso
  versionato cambia, quindi nessun altro `?v=` da aggiornare.

## 10. Test

- `master-roles-rate-input-guard.test.js` passa invariato.
- `master-data-guard.test.js`: blocco Roles con niente `confirm(`, `alert(`, emoji ✏️ 🗑 ⚠️, `form-card`, nessun
  watcher `globalError(msg)`; il `must` di Roles si aggiorna se `groupedRoles` cambia nome.
- Nuovo `js/lib/master-roles.test.js`: `extractTeam` (casi attuali); `groupRoles` ordinamento; `filterRoles` su
  label e code, `missingOnly` con EUR 0 e null; `rateColumns` EUR prima, solo attive, ordine dell'API;
  `fallbackRate` arrotondato ai decimali della valuta (es. JPY senza decimali) e `null` senza EUR;
  `splitCode`/`joinCode` round trip, codice senza `" - "` restituito invariato.
- Guard statico sulla pagina (nuovo `js/lib/master-roles-page-guard.test.js`): `openRoleForm` carica ogni
  override salvato e `saveRole` itera su `Object.entries(this.rf.overrideTexts)` (override inattivi preservati);
  il ramo catch del delete scrive `del.error` e non `globalError`.

## 11. Verifica visiva

`scripts/shoot.mjs` contro lo stack di branch (`scripts/test-branch.sh up`, `--base http://localhost:8081`,
`--settle 3000`) alle larghezze 1400, 1024, 390: lista (10.7a), pannello nuovo (10.7b), pannello edit su un ruolo
con un override mancante (10.7c), dialogo di delete (10.7d), tablet e phone (10.7e). I PNG si rileggono e si
confrontano con le tavole; gli scostamenti si presentano uno per uno (PROCESS.md §6.6.5).

## 12. Fuori scope

- Shell (fase 1), Clients & groups, Pipelines & POTs, Currencies.
- Catena di fallback delle tariffe, tariffe delle cost grid, rate card cliente, colonna `team`, regole di
  `DELETE /roles`, endpoint dei conteggi d'uso (brief §7.2).
- Stato URL (brief §8, opzionale).
- Comportamento delle cost grid con ruoli senza tariffa € (brief §7.4).

## Criteri di accettazione

1. **Lista per team** — gruppi ordinati per team e ruoli per label, richiudibili, "N roles" e pill "N without € rate"; ricerca su label e code e filtro Missing rates (0 e null) forzano aperti i gruppi con match (`master-roles.test.js`; Gate 2).
2. **Colonne valuta** — una colonna per EUR più ogni valuta non-EUR attiva, intestazione "<symbol>/h" (`master-roles.test.js`; Gate 2).
3. **Stati tariffa** — "No rate" ambra con riga ambra per EUR mancante; "—" con tooltip "≈ …" pari a `resolveRoleRate` arrotondato (`master-roles.test.js`; Gate 2).
4. **Pannello create/edit** — si apre da "+ Add role", "Edit" e (tablet/phone) dalla riga; chiude su scrim, ✕, Esc, Cancel; primario disabilitato senza label o role code; errori dentro il pannello (Gate 2).
5. **Team + Role code** — round trip con `code`; un codice senza " - " salvato invariato se il team resta vuoto; team nuovo digitabile (`master-roles.test.js`; Gate 2).
6. **Input money invariati** — il guard delle tariffe passa invariato; un override di una valuta inattiva sopravvive a un edit (`master-roles-rate-input-guard.test.js`, `master-roles-page-guard.test.js`; Gate 2).
7. **Delete** — dialogo con il testo della regola del server; un 400 resta nel dialogo con Delete disabilitato; nessun `confirm()`/`alert()`/emoji (`master-data-guard.test.js`; Gate 2).
8. **Responsive** — tablet 1024 e phone 390 come 10.7e; target ≥ 44px su phone; segmented per valuta e chip Missing rates (verifica visiva §11; Gate 2).

## Decisioni aperte

1. **Helper puri in un nuovo `js/lib/master-roles.js`.** Alternativa scartata: tutto nella pagina con test sul markup. Perché: il brief chiede test sul comportamento ed è il pattern delle pagine sorelle.
2. **Drawer con CSS locale alla pagina, copiato dal pattern `.mdp-drawer`.** Alternativa scartata: estrarre un `.md-drawer` condiviso in `css/style.css`. Perché: l'estrazione tocca `master-pipelines.html` e `style.css`, il brief limita il ciclo a una pagina.
3. **Dialogo di delete come modal Vue locale, sul precedente `#crRateConfirmModal`.** Alternativa scartata: estendere `showConfirm()` in `js/core.js` con un callback async che tiene aperto il dialogo. Perché: `showConfirm` chiude su OK e `core.js` è caricato da ogni pagina.
4. **Team come combobox locale (input + lista filtrata dei team esistenti).** Alternativa scartata: estendere `cg-select` o un `<datalist>` nativo. Perché: segue la tavola senza toccare file condivisi né lasciare un controllo nativo.
5. **Tooltip del "—" con `title` nativo più `aria-label`.** Alternativa scartata: tooltip Bootstrap. Perché: nessun init JS; su phone il valore "≈" è già scritto nella card.
6. **Nessuno stato URL.** Alternativa scartata: `?role=` e `?q=` (brief §8, opzionale). Perché: nessuna tavola lo richiede.
7. **Screenshot automatici con `scripts/shoot.mjs` nel Piano (1400/1024/390).** Alternativa scartata: solo la verifica dell'utente al Gate 2. Perché: redesign con tavole, come i cicli Master Data precedenti.
8. **Niente box grigio nel dialogo di delete.** Alternativa scartata: box con la sola riga sulle rate card cliente. Perché: senza conteggi (brief §7.2) il box ripeterebbe il corpo del dialogo.
9. **Brief e tavole committati insieme alla Spec.** Alternativa scartata: un commit separato prima. Perché: entrambi precedono il worktree (PROCESS.md §6.5).
