# Team UX minimo — pannello di dettaglio, tab, ordinamento, selettore con ricerca (design)

Ciclo piccolo tra il ciclo "team role by id" e il sottociclo 3c del Ciclo 3 (`docs/superpowers/specs/2026-09-25-resource-profile-design.md`). Origine: durante la verifica manuale del 3b l'utente ha segnalato che `team.html` non scala con ~150 persone e decine di nomi non abbinati (turnover), e che non esiste una vista di dettaglio della risorsa dove il 3c possa mostrare il profilo arricchito dagli actuals (memoria di progetto `project_team_ux_backlog.md`).

Tipo: evoluzione di una pagina esistente (Scenario 2). Solo frontend.

## 1. Comportamento attuale (`team.html`)

- Intestazione "Team (N)" e "+ New resource" (`:20-23`); ricerca e "Show inactive" (`:27-34`); `filteredResources` filtra su nome, email, label/codice del ruolo (`:247`).
- Tabella (`:36-71`): Name, Email, Role, Linked user, Status e i pulsanti Edit / Deactivate / Delete per riga. Righe non cliccabili, intestazioni non ordinabili; ordine del backend (cognome, nome); nessuna paginazione.
- Nessuna vista di dettaglio: `job_description` si vede solo nella modale di modifica `#resourceModal` (`:141`, `openEdit` `:399`).
- Coda "Unmatched names" (`:73-126`): una card sotto la tabella, tutte le righe, nessuna ricerca/ordinamento/limite; "Assign to" è un `<select>` con tutte le risorse (`:96-99`, `assignOptions` `:336`: candidati ambigui, poi attive, poi inattive marcate "(inactive)").
- Alias: un `<details>` (`:110-124`) con **tutti** gli alias; `GET /api/resources/aliases` restituisce già `resource_id`.
- Dati: `loadResources` (`:284`) e `loadUnmatched` (`:318`) leggono tutto senza paginazione.

## 2. Comportamento atteso

1. **Pannello di dettaglio** a destra (drawer), aperto dal clic su una riga (non sui suoi pulsanti), con tab **Details | Aliases | Experience profile**.
2. **Details** (sola lettura): nome, email, ruolo `label (code)`, utente collegato, job description, stato; pulsante **Edit** che apre la modale esistente. Deactivate/Delete restano nella riga.
3. **Aliases:** gli alias della risorsa (`aliases` filtrati per `resource_id`) con **Remove**; stato vuoto "No aliases for this resource."
4. **Experience profile:** segnaposto "No experience data yet. It will be built from uploaded actuals." (il 3c lo sostituisce).
5. **Ordinamento della tabella Team** per Name, Email, Role, Status (clic = ascendente, secondo clic = discendente, freccia sulla colonna attiva); ricerca e "Show inactive" restano; nessuna paginazione.
6. **Selettore con ricerca** al posto del `<select>` "Assign to": filtra digitando, inattive marcate "(inactive)", ambigui in cima, voce "— none —" per tornare al placeholder, tastiera, chiusura con clic fuori; **Assign** resta disattivato senza scelta.
7. **Tab di pagina** "Team" e "Unmatched names (N)" con contatore; la pagina parte su "Team".

## 3. Design

**Struttura del codice (approccio A).** Tutto dentro `team.html` (pagina Vue inline, come le altre) più un modulo puro `js/lib/team-ui.js` (ES module con bridge `window.*`, come gli altri `js/lib/`) con `sortResources` e `filterComboOptions`, coperto da vitest. Componente e pannello restano locali alla pagina (nessun consumatore in altre pagine: niente file condivisi né bump aggiuntivi).

**Pannello.** `position:fixed; top:0; right:0; bottom:0; width:860px; max-width:100%; z-index:1045` con testata blu e stile del dettaglio pipeline (`pipeline.html:165-182`). Il livello 1045 sta sopra la pagina e sotto le modali Bootstrap (1055): la modale Edit si apre sopra il pannello. Stato `selectedId` (id), `detailTab`. La risorsa mostrata è un computed su `resources` (non su `filteredResources`), quindi si aggiorna dopo un salvataggio e non dipende dal filtro; se non esiste più il pannello si chiude. Chiusura: ×, Esc, oppure `mousedown` fuori dal pannello, con registrazione dell'handler ritardata di 200 ms e guardia che ignora i clic dentro `.modal`/`.modal-backdrop` (stesso pattern di `pipeline.html:709-746`). Un clic su un pulsante di riga (Deactivate/Delete) è un clic fuori e chiude il pannello. Cambiare tab di pagina lo chiude.

**Tab di pagina e del pannello.** Bootstrap `nav-tabs` (già caricato). Lo stato `pageTab` non è persistito e non c'è deep link (`?resourceId=`/hash): deciso di rimandarli (YAGNI); si aggiungono più avanti (ciclo 4) con poche righe.

**Ordinamento.** `sortResources(list, key, dir)` (pura): chiavi `name` (cognome poi nome), `email`, `role` (label poi codice), `status` (attive prima); `localeCompare` con `sensitivity:'base'`; `Array.sort` stabile con tie-break sul nome; `dir` `'asc'|'desc'`; non muta l'input. Applicata dopo la ricerca. Default: `name` ascendente (come l'ordine del backend).

**Selettore con ricerca.** Componente locale `combo-select` (`app.component`) con props `options` (`[{ id, label }]`, ordine deciso dal chiamante), `modelValue`, `placeholder`, `disabled`, evento `update:modelValue`. Input che mostra l'etichetta scelta; digitando filtra con `filterComboOptions(options, query)` (pura: insensibile a maiuscole e accenti; l'opzione resta se **ogni parola** della query è contenuta nell'etichetta, quindi "rossi mario" trova "Mario Rossi"; una sola parola = sottostringa; query vuota = tutte; preserva l'ordine); lista con altezza massima 240px scrollabile; voce "— none —" che azzera; frecce/Invio/Esc; `mousedown` fuori la chiude. Nella coda sostituisce il `<select>` mantenendo `assignChoice[u.name_normalized]` come modello.

**Dati e API.** Nessuna modifica a backend, API o schema: `aliases` è già caricato da `loadUnmatched()` e il pannello lo filtra lato client; `removeAlias` e `openEdit` sono riusati.

## 4. Fuori scope (confermato dall'utente)

- Contenuto dell'Experience profile (3c).
- Ricerca, ordinamento e limite di altezza nella coda dei nomi non abbinati (l'utente ha scelto solo il selettore con ricerca).
- Suggerimento del candidato per somiglianza, progetti in cui compare il nome, paginazione della lista Team, modifica inline nel pannello, pagina dedicata `resource.html`, deep link e persistenza della tab.
- L'audit di navigazione (sidebar) e qualunque abbinamento fuzzy automatico.

## 5. Vincoli

- Nessun bundler/build step; Vue da CDN; `v-cloak` invariato; testi in inglese; niente `alert`/`confirm` nativi (si usa `showConfirm` come già fa la pagina).
- Il nuovo `js/lib/team-ui.js` è un file versionato: il suo tag `<script type="module" src="js/lib/team-ui.js?v=1">` in `team.html` deve avere `?v=N` e ogni modifica futura richiede il bump; il codice che lo usa (`sortResources`, `filterComboOptions`) va letto solo in funzioni eseguite dopo `DOMContentLoaded` (regola dei bridge `window.*`).
- Nessun cambio a `css/*` e `js/api.js`: nessun altro bump `?v=N`.

## 6. Criteri di accettazione

1. Un clic su una riga apre il pannello con la risorsa giusta; un clic sui pulsanti della riga non lo apre (li esegue, chiudendo un pannello eventualmente aperto).
2. Le tre tab funzionano come descritto; Details mostra tutti i campi inclusa la job description; Edit apre la modale già precompilata e, dopo il salvataggio, il pannello mostra i dati aggiornati.
3. Il pannello si chiude con ×, Esc e clic fuori, e non si chiude quando si interagisce con una modale aperta da lui.
4. Aliases mostra solo gli alias della risorsa selezionata; Remove lo elimina e il nome torna nella coda.
5. Cliccare un'intestazione ordina la tabella; un secondo clic inverte l'ordine; ricerca e "Show inactive" continuano a funzionare insieme all'ordinamento.
6. Il selettore filtra digitando (maiuscole e accenti ininfluenti), mostra "(inactive)", tiene i candidati ambigui in cima, permette di tornare a "— none —", e funziona da tastiera; **Assign** resta disattivato senza scelta.
7. Le tab di pagina mostrano il contatore aggiornato dopo assegnazione, ignore, rescan e rimozione di un alias.
8. Nessuna regressione: creazione, modifica, attivazione/disattivazione, cancellazione, Rescan, Assign/Ignore/Remove e la suite esistente restano verdi (`npm test`, `scripts/run-tests.sh`).
9. Test vitest per `sortResources` (chiavi, direzione, stabilità, input non mutato, valori mancanti) e per `filterComboOptions` (accenti, maiuscole, query vuota, nessun risultato, ordine preservato).

## 7. Domande aperte per il piano

- Larghezza effettiva su schermi stretti (il pannello è `max-width:100%`): da verificare a mano.
- Comportamento del focus quando il pannello si apre (si lascia dove sta, o si sposta sul pannello): si lascia dov'è, nessun focus trap.
