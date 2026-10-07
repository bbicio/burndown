# Brief per Claude Code — Cost Grid (tavole 5.17 → 5.21)

Immagini allegate, una per tavola (in questa stessa cartella):

| Tavola | File | Contenuto |
|---|---|---|
| 5.17 | `5.17-costgrid-con-task-inseriti.png` | Pagina desktop in SIP con task inseriti: header, card richiudibili, griglia con colonna fissa, rate custom/0, task già in progetto |
| 5.17b | `5.17-costgrid-con-opioni-roles.png` | Menu ⋮ di colonna ruolo aperto |
| 5.18a | `5-18.visualizzazione-resume-pannelli-chiusi.png` | Modalità selezione, target "New project" / stato con pannelli chiusi |
| 5.18b–c | `5.18-selezione-task-nuovo progetto-1/2/3.png` | Modalità selezione, modale "Generate project" (nome, codice, riepilogo) |
| 5.18d | `5.18.add-project-o-program.png` | Step 2 "Link to a program" |
| 5.18e | `5.18-aggiunta-task-progetto-esistente-monthly-phasing.png` | Modale "Add tasks to project" + Monthly Phasing |
| 5.19a–b | `5-18-tags-e-sharing.png` | Offer details / Tags / Sharing aperte |
| 5.20 | `5.20-tablet-view.png`, `mobile-view-*.png`, `mobil-view-3.png` | Tablet 1024×768 e smartphone 390×844 |
| 5.21 | `5.21-situazione-di-partenza-dopo-create.png` | Situazione di partenza: proposta nuova in Draft, form vuoto |

Riferimenti minori (dropdown/popup, non tavole numerate separate nel ciclo): `5.11-datepciker-start-date.png`, `5.12-datepicker-end-date.png`, `5.13-dropdown-ratecard.png`, `5.14-dropdown-stage.png`, `5.15-reassign-dropdown-utenti.png`, `5.16-popu-add-role.png`, `5.18-visualizzazione-costgrid.png`.

---

## 0. Natura dell'intervento

È un **restyling di `costgrid.html` dentro la sua struttura attuale**. Valgono queste regole:

- **Architettura:**
  - resta l'unica app Vue montata su `#costGridEditorSection`;
  - resta il bridge con `js/costgrid.js` (`renderCgEditor`/`renderCgVersionTabs`/`showCostGridEditorView` → `_cgVueApp`);
  - `this.draft === _cgDraft`, stesso oggetto: non clonarlo mai.
- **Funzioni globali invariate:**
  - autosave: `cgScheduleAutoSave`/`cgAutoSave`;
  - generazione e selezione: `cgGenerateProject`, `cgConfirmAndGenerate`, `cgDoGenerateProject`, `cgDoAddTasksToProject`, `cgExitSelectionMode`;
  - lock: `cgGetVersionLockState`;
  - calcoli: `cgCompute*Totals`, `resolveRoleRate`, `cgGetAssignedTaskIds`/`Names`.
- **Modali:** restano i modali Bootstrap esistenti (`#cgProjectNameModal`, `#cgCreateProgramModal`, `#cgAddToProjectModal`, `#cgRoleSelectModal`, `#cgNewVersionModal`, `#cgCloneModal`, `#confirmModal`) e il pattern `hideModalThen`. Si ristilizzano, non si sostituiscono.
- **Le regole di business del codice hanno la precedenza sui disegni.** Le tavole usano dati di esempio. Lock, permessi, visibilità dei bottoni, task "free" (con nome e non assegnati, doppio controllo id + nome), validazione delle ore (`isValidSoldHours`) e Currency lock restano quelli attuali. Le divergenze note sono elencate in §10.
- **Importi illustrativi.** La formattazione viene sempre da `formatMoney(amount, code, currencies)`, gli input da `formatMoneyInput`/`parseMoney`.

Vincoli dal `CLAUDE.md` del repo:
- Niente build step.
- Niente hex hardcoded: solo `var(--token)`.
- `?v=N` aggiornato su ogni file versionato modificato.
- `#app-shell`/`#app-main` senza `overflow`, `position`, `transform`.
- `v-cloak` resta su `#costGridEditorSection`.
- Workflow `docs/superpowers/PROCESS.md`, chiusura con `/finish-cycle`.

**Precedente da seguire:** il ciclo Pipeline appena chiuso. `css/pipeline.css` è caricato solo dalla sua pagina e usa solo token (`--space-*`, `--weight-*`, `--surface-*`, `--z-modal`, …), senza letterali di colore. Stessa impostazione qui.

## 1. Organizzazione CSS e template

- **Nuovo `css/costgrid.css?v=1`**, caricato solo da `costgrid.html`.
  - Ci vanno tutte le classi nuove `.cg-*`: header, card richiudibili, griglia, menu ⋮, barra di selezione, modali, media query.
  - `style.css` (caricato da 18 pagine) resta com'è: `.section-card`, `.tag-pill`, `.tags-section--readonly` continuano a funzionare. Il nuovo file sovrascrive solo dove serve.
- **Stili inline → classi.** Oggi la griglia è quasi tutta in `:style="{…}"` con hex (`#7f0b0b`, `#fffbe6`, `#ffe58f`, `#93c5fd`, `#f8877a`, `#86efac`, `#fcd34d`, `#555`, `#888`, `#444`, `#333`…) e var legacy (`--sand-*`, `--brand-mid`, `--indigo-*`).
  - Gli stati passano a classi modificatrici: `.is-custom`, `.is-zero`, `.is-assigned`, `.is-selected`, `.is-compact`.
  - Mappatura colori in §9.
- **Nessuna emoji** nell'interfaccia: 📄 🏷 📤 📊 👥 🚀 💾 ⧉ 🔗 ⬇ 🗑 ✏️ 🔒 ⚠️ ✎ ☑ ⇄ ⊕ ⊞ ⊟ ◀ ▶ 📅 👤.
  - Al loro posto SVG inline `stroke="currentColor"` 14/16px, oppure solo testo, come nelle tavole.
  - Vale anche per i titoli dei modali toccati (`🚀 Generate project` → "Generate project").
- **`v-html`** su `pipelineBadge`/`statusBadgeLarge` (Linked projects): si può tenere, perché sono helper condivisi. Se si toccano, bump e verifica su `pipeline.html`.

## 2. Header della proposta (5.17, 5.19a)

Sostituisce `.page-title-bar` + `.page-toolbar` + le version tabs con **una card unica**:

- **Riga 1:**
  - titolo `cg.name` 21px/800;
  - sotto, "Cost Grid · Client: {client} · {n} linked project(s)", oppure "No linked projects";
  - a destra la pillola dello stadio: colore dello stadio, testo `draft.pipeline`; Draft usa la pillola esistente.
- **Riga 2 sinistra:** controllo segmentato delle versioni.
  - Segmento "New version": in Draft è attivo e apre `openNewVersionModal`.
  - Fuori da Draft è visibile ma disabilitato, con lucchetto e tooltip "New versions can only be created while the proposal is in Draft". **Da confermare** (§10): oggi in SIP il bottone non c'è.
  - Poi una pillola per versione (`versionTabLabel`, `switchVersion`), con quella attiva navy.
  - Oggi le tabs compaiono con `versions.length > 0`. Il segmentato è sempre visibile.
- **Riga 2 destra:**
  - Save (`saveVersion`, con il guard double-submit attuale), Clone (`cloneProposal`, `proposalBusy`), Export XLS, divisore;
  - poi l'azione primaria magenta, una sola per stato:
    - Draft → **Publish to SIP** (`publishDraft`);
    - non-Draft, non locked e `hasFreeTasks` → **Generate project** (`generateProject`). In selezione diventa grigio non cliccabile, "Selecting tasks…".
  - Se non ci sono task liberi: testo "All tasks are in projects" al posto del bottone.
- **Restano, anche se non disegnati:**
  - **Share** (`openShareModal('cost_grid', …)`, solo non-Draft): bottone secondario dopo Export XLS;
  - **Delete version** (solo Draft): bottone testuale rosso a destra;
  - **← Pipeline** (`goBack`, con `backSaving`): link sopra la card, come in 5.10.
- **Banner:** lock (`isLocked`, `lockState.message`) e Draft restano tra header e card, ristilizzati con token warning/neutral e icona SVG.
- **Stato Draft (5.21):**
  - pillola "DRAFT";
  - segmento "+ New version" attivo;
  - Publish to SIP unica azione magenta; Generate project assente;
  - **Delete version** nel banner Draft come link testuale rosso (`deleteVersion`), al posto del bottone in toolbar.

## 3. Card richiudibili: Offer details, Tags, Sharing (5.19)

Lo stato esiste già: `offerDetailsCollapsed`, `tagsCollapsed`, `sharingCollapsed`, oggi tutti `false` all'avvio e rimessi a `false` in `openVersion()`. Cambia la grafica, più tre regole:

- **Default per stato:** Draft → aperte. Non-Draft → chiuse.
- **Persistenza per proposta:** in `localStorage`, chiave `PDash_cgSections:{cgId}` con oggetto `{od, tags, sh}`. La chiave va nel `keep` Set di `core.js` (bump). Se presente, vince sul default.
- **Intestazione:**
  - è tutta cliccabile e accessibile (`role="button"`, `aria-expanded`, Enter/Space);
  - chevron SVG che ruota;
  - titolo 15px/800;
  - a destra un'etichetta muted: "Edit" o "Manage" quando chiusa, "Collapse" quando aperta.

**Offer details chiusa**
- Riga di fatti con etichette 10.5px uppercase, in tre gruppi separati da un filetto:
  - Period + Stage;
  - **Client + Ratecard + Currency**;
  - Owner.
- `offerDetailsSummary` diventa un oggetto strutturato, non più una stringa.
- La riga va a capo (`flex-wrap`) sotto i 1200px.

**Offer details aperta (5.19b)**, ordine dall'alto:
1. "Owner: **name** · Created: date" + **Reassign** a destra.
   - Solo `isAdminUser`, come oggi.
   - Il `<select>` diventa un dropdown con ricerca (vedi 5.15) che chiama la stessa `onReassignOwnerChange`.
   - Va bene anche tenere il `<select>` ristilizzato.
2. Nome (`draft.projectName`). Vedi §10 per l'etichetta.
3. Riquadro **Period** (Start, End) | riquadro **Stage** (280px).
   - Start e End restano `type="month"` (vedi §10).
   - Stage: Draft come testo; altrimenti il select attuale con i 5 stadi e `onPipelineChange`.
4. Riquadro **Client &amp; rates**, su una riga, nell'ordine **Client → Ratecard → Currency** (decisione presa):
   - Client: select + "+ New" (`openClientsModal`);
   - Ratecard: select "(optional)" con `— None (use global role rates) —`. Le opzioni restano `filteredRatecards`, che dipendono dal client: per questo viene subito dopo. Sotto, in muted, valuta e numero di ruoli se disponibili;
   - Currency (160px): **resta il select attuale** (`onCurrencyChange`).
     - Disabilitato con `currencyLocked` e `currencyLockTitle` come tooltip. Con lucchetto e nota "Locked: a project exists" quando `versionHasProjects`.
     - La riga "1 EUR = x" resta sotto, se valuta ≠ EUR.
5. Description (`draft.note`).
6. **Linked projects** (`linkedProjectDisplay`): non è nelle tavole ma resta, in fondo alla card aperta.

**Stato vuoto (5.21)**
- Il nome arriva dal popup New proposal.
- Valori vuoti in grigio:
  - Period "Not set" nel riepilogo; Start/End month "mm/yyyy";
  - Client "Unassigned" (sentinella `__unassigned__`, invariata);
  - Ratecard "— None (use global role rates) —", con sotto "Optional · filtered by client";
  - Currency: select libero su EUR, perché non ci sono progetti;
  - Description con placeholder.
- Stage in Draft: campo di sola lettura su sfondo grigio, come oggi (`isDraft`).
- Tags: nessuno selezionato. Sharing: solo l'owner, riepilogo "Only you · private Draft".
   - Card bordate: nome, codice monospace, pillole stadio/stato, "Tasks: …", link "Project Dashboard →" (`openLinkedProject`).
   - Stesso pattern della tab Linked projects della Pipeline (4.12).

**Tags**
- Chiusa: pill navy dei tag assegnati, con il nome della lista in chiaro ("Brand · Karomy"). Vuota: "None selected".
- Aperta: griglia a 2 colonne dei gruppi, con le `.tag-pill` attuali (input visivamente nascosto, stato inactive, readonly).
- Nessun cambio a `toggleTag`/`tagSaving`.

**Sharing**
- Chiusa: avatar sovrapposti (max 4 + "+n") + "N people · you are owner/editor/viewer".
- Aperta: `<share-list>` invariato.
- Servono il numero e le iniziali delle condivisioni: `<share-list>` oggi non li espone. Opzioni:
  - un evento `@loaded` dal componente, con bump e verifica su `pipeline.html`;
  - una lettura leggera di `Api.shares.list('cost_grid', cgId)` dalla pagina.
- Preferire la seconda: non tocca il componente condiviso.

## 4. Griglia (5.17, 5.17b)

**Contenitore**
- Resta la `<table id="cgGridTable">`.
- Scroll orizzontale nel suo contenitore. Il `max-height: calc(100vh - 300px)` attuale si può tenere (header sticky in alto) oppure togliere a favore dello scroll di pagina. **Preferito: togliere**, perché le card richiudibili liberano spazio.
- **Prima colonna fissa** (Phase / Task) su *tutte* le righe: `position:sticky; left:0`, sfondo opaco per tipo di riga, ombra 1px sul bordo destro. Oggi è sticky solo su `th` e `tfoot`.
- Larghezza 280px desktop, 220px tablet.
- **Nessun indicatore "N altri ruoli".** Si scorre e basta.

**Intestazione della card griglia**
- Titolo "Cost Grid".
- Legenda inline: Custom rate (swatch giallo), Missing rate (swatch rosso), Task in a project (icona link).
- A destra:
  - toggle **Compact columns**: è il `compactHeader` esistente, con la stessa chiave `PDash_cgCompactHeader`;
  - Add roles (`addRoleColumn`) e + Add phase (`addPhase`), solo `!isLocked`.
  - In selezione Add roles e + Add phase spariscono.

**Riepilogo (summary)**
- Riga "Totals by role" richiudibile (`summaryCollapsed`, invariato). In selezione parte chiusa.
- Etichette in inglese chiaro: "Hours by role", "Fees by role".

**Riga rate**
- Prima cella: badge valuta + "Hourly rates".
- Celle ruolo:
  - "EUR/h" + input numerico (`onRateChange`, invariato);
  - **custom** (`rateIsCustom`): sfondo giallo tenue, sotto "Custom · reset {baseline}". Il link chiama la stessa logica del campo svuotato: `role.rate = roleBaseline(r).effectiveRate`, `rateIsCustom = false`, autosave;
  - **zero**: sfondo rosso tenue, testo rosso, sotto "Missing rate". Anche l'header della colonna è rosso.
- Tooltip come oggi ("Custom (baseline …)", "Rate from roles registry / ratecard").

**Header colonne ruolo**
- Nome (2 righe max) + codice in muted (nascosto in compact) + bottone **⋮** 24px.
- Le 5 azioni oggi sempre visibili (◀ ▶ change dup remove) **vanno tutte nel menu ⋮** (5.17b):
  - intestazione: nome, codice, ore pianificate;
  - Move left / Move right (`moveRole(r, ∓1)`), disabilitati ai bordi;
  - Change role… (`changeRole`) e Duplicate with another role… (`duplicateRole`), che aprono `#cgRoleSelectModal` come oggi;
  - Reset rate to {baseline}, solo se custom;
  - **Remove column** (`removeRoleColumn`) in rosso. Se la colonna ha ore, la tavola chiede un secondo clic nel menu ("Click again to remove · Xh … will be deleted"). Va bene anche tenere lo `showConfirm` attuale: sceglierne uno, non tutti e due.
- Menu: popover posizionato sul bottone, chiusura con click fuori, Esc e scroll del contenitore. Non deve essere tagliato dall'`overflow` della tabella: renderlo fuori dallo scroll container (teleport su `body` o posizione `fixed`).
- Il menu non c'è quando `isLocked` o in selezione.

**Griglia senza ruoli (5.21)**
- Al posto delle colonne ruolo, una colonna tratteggiata di 260px su tutte le righe.
- Nell'header della colonna, il bottone "+ Add roles" (`addRoleColumn`).
- Nella riga task, il testo "Add roles to estimate hours for each task.".
- Totali a "—".
- Sostituisce la riga attuale "No roles added yet. Click 👥 + Add role…".
- Una Phase 1 con un task vuoto, come crea oggi la nuova proposta. Verificare in `cgCreateNewGrid`: se oggi parte senza fasi, si mantiene il comportamento attuale.

**Righe phase**
- Banda navy scura.
- Nome editabile, "+ Task" a pillola, ✕ di eliminazione.
- Date della fase in azzurro tenue (`phaseDatesLabel`). Totali e ore per ruolo come oggi.
- In selezione la ✕ e "+ Task" spariscono e compare **"Select free (n)"** (vedi §5).

**Righe task**
- Cella fissa: input nome + ✕ (solo free e non locked).
- Se assegnato, al posto della ✕ un **lucchetto** con tooltip "Linked to a project: it can't be deleted", più il badge **"In {project name}"** sotto il nome.
  - Oggi il nome del progetto non è mostrato. Si ricava da `draft.linkedProjects[].taskIds`/`taskNames`, come in `linkedProjectDisplay`.
- Date From/To (input `cgIsoToIt`/`onTaskDateChange` invariati).
- Description, totali, PTC (logica `ptcFocusedTask` invariata), ore per ruolo (logica `hoursEditing` invariata).
  - Valore pieno in grassetto con bordo più scuro; vuoto "—".
- "+ Add task" sotto ogni fase, con il testo nella colonna fissa.
- **TOTAL** in fondo: sfondo tenue, prima cella fissa.

## 5. Selezione task (5.18)

Il flusso resta quello di oggi:

1. `cgGenerateProject` entra in selezione (richiede `projectName`).
2. `toggleTaskSelection`.
3. `cgConfirmAndGenerate` → `#cgProjectNameModal` → eventuale `#cgCreateProgramModal`.
4. Oppure `addToProject` → `#cgAddToProjectModal`.

**Griglia in selezione**
- Checkbox 18px nella colonna fissa, prima del nome.
- Task libero: cliccabile; selezionato → riga rosa tenue (`--brand-magenta-tint`).
- Task assegnato: checkbox grigia piena disabilitata, riga grigia, nome muted, badge "In {project}". Il tooltip della checkbox dice "Already in {project}".
- Riga phase: pillola **"Select free (n)"**. Se tutti i free della fase sono già selezionati, diventa "Clear phase" e toglie la selezione.
  - Oggi `selectAllFreeInPhase` aggiunge soltanto: va esteso a toggle.
  - Se nessun task è libero: "All in projects", non cliccabile.
- **Fix incluso:** `selectAllFreeInPhase`, `selectAllFree` e il conteggio dei free in `cgGenerateProject` oggi controllano solo l'id. Vanno allineati al doppio controllo id + nome, come `hasFreeTasks` e `isTaskAssigned`. È il finding round-3 aperto in `docs/superpowers/reports/2026-09-16-…-generate-program-finish-cycle.md`. Devono anche escludere i task senza nome, come fa `hasFreeTasks`.

**Barra in fondo**
- Sticky, navy, ombra verso l'alto. Sostituisce l'attuale.
- **Sinistra:** "{n} tasks selected" + link "Select all free (n)", che diventa "Clear selection" quando sono tutti selezionati.
- **Destra:**
  - controllo segmentato **New project | Existing project**:
    - Existing è disabilitato (con tooltip) se `draft.linkedProjects` è vuoto;
    - scegliendo Existing compare il dropdown dei linked projects, preselezionato se ce n'è uno solo. È l'`addToProjectSel` attuale;
  - divisore, Cancel (`cancelSelection`);
  - **un solo CTA magenta:** "Create project" (`confirmAndGenerate`) oppure "Add {n} to project" (`addToProject`). Disabilitato se 0 selezionati, o se in Existing non è scelto il progetto.
- Oggi i due CTA convivono, sempre visibili. La tavola li separa con il segmentato: è il cambiamento principale di 5.18.
- La barra va a capo su due righe se non c'è spazio (tablet con dropdown).

**Modali** (ristilizzati, stessa logica)
- **`#cgProjectNameModal` (5.18c):**
  - "Step 1 of 2" solo se seguirà il program step. Va calcolato con la stessa condizione che usa `cgSubmitProjectName`: nessun programma risolto da `findExistingProgramForProposal` **e** selezione parziale;
  - campi Project name (prefill attuale) e Project code (optional);
  - riquadro riepilogo: "{n} tasks selected · {hrs} · {amount}" + elenco "Phase · Task — hrs · amount";
  - nota "Description and task descriptions are copied into the new project…": è già comportamento reale, vedi `docs/pages/costgrid.md`;
  - CTA "Continue" se c'è lo step 2, altrimenti "Create project";
  - guard `submitting` invariato.
- **`#cgCreateProgramModal` (5.18d):**
  - "Step 2 of 2", testo introduttivo con "Only {n} of {m} tasks move into this project…";
  - due card radio:
    - **Create new program**: nome + ID;
    - **Link an existing program**: lista selezionabile dei `programs`.
  - È la stessa scelta dell'attuale `<select>` con `createProgramModal.existingId`: radio "new" ⇔ `existingId === ''`;
  - "Back" riapre il modale nome (con `hideModalThen`). CTA "Create program &amp; project" / "Link &amp; create project".
- **`#cgAddToProjectModal` (5.18e):**
  - "Add {n} tasks to **{project}**?", elenco task con ore e importo, riga Total;
  - CTA "Add {n} tasks".
- **Esito:** si esce dalla selezione e i task prendono subito il badge.
  - Il dialog finale attuale ("✓ Project created … Open configuration to assign the Project ID?") **resta**, perché porta a `project-config.html`. Va solo tolta l'emoji.
  - Il toast delle tavole sostituisce il dialog solo nel caso "Add to existing", dove oggi non c'è navigazione.

## 6. Monthly Phasing

- Card in fondo, intestazione navy richiudibile (nuovo stato, aperta di default): "Monthly Phasing" + "Total: … · … · N months" (`phasingTotals`).
- Tabella Metric × mesi: **Budget ({currency})** in grassetto, con sotto una **barra sottile** proporzionale al mese massimo; **Hours** in muted.
- Scroll orizzontale come oggi.
- **Senza periodo (5.21):** oggi il pannello sparisce (`v-if="phasingMonths.length"`). La tavola tiene la card visibile con il messaggio "Set Start and End in Offer details to see the monthly breakdown. Values fill in as you add roles and hours.", e "no period set" nell'intestazione.
- **I calcoli non cambiano** (`phasingByMonth`): ripartizione uguale per mese del task, importo = ore × rate. Le tavole ripartiscono per giorni: vale il codice.

## 7. Responsive (5.20)

Media query in `costgrid.css`. Breakpoint del nav esistenti: ≥1024 sidebar/rail, <1024 navbar in alto.

**Tablet ~1024**
- Stessa pagina del desktop.
- Colonna fissa a 220px.
- La legenda esce dall'intestazione della griglia: restano i tooltip.
- Il riepilogo Offer details va a capo; la barra di selezione va su due righe se serve.
- Menu ⋮, modali e flusso identici.

**Smartphone (<768): layout diverso, non una griglia ristretta**
- **Header:**
  - titolo 18px, pillole stadio e versione;
  - azione primaria a tutta larghezza (Generate project / Publish to SIP);
  - bottone **⋯** che apre un bottom sheet con Save, Clone, Export XLS, Share, New version (bloccata fuori Draft), Delete version (Draft).
- **Offer details:**
  - chiusa = 4 fatti in griglia 2×2;
  - aperta = campi in colonna, input 44px;
  - Ratecard e Currency sulla stessa riga, subito dopo Client.
- **Tags:** pill 36px.
- **Sharing:** riga con avatar + "Manage", che apre la card con `<share-list>`.
- **Cost Grid:**
  - riquadro totali Cost &amp; fee / Hours / Pass-through;
  - segmentato **Tasks · Roles · Phasing**. Nuovo stato `mobileTab`, solo sotto il breakpoint; la tabella desktop è nascosta.
- **Tab Tasks:**
  - fasi come bande navy con totali;
  - task come righe con date, ore, importo e badge "In {project}";
  - il tap apre un **bottom sheet a tutta altezza** con:
    - totali del task;
    - ore per ruolo (input 44px, `inputmode="decimal"`, stessa validazione);
    - rate del ruolo con stato custom/0;
    - PTC, Description;
    - Delete task (solo free);
  - i dati sono gli stessi `draft.phases`.
- **Tab Roles:**
  - un ruolo per riga, barra sinistra gialla (custom) o rossa (0), pillola rate, ore totali;
  - ⋮ apre un sheet con:
    - rate editabile + Reset;
    - **Move up / Move down**, cioè `moveRole` ∓1, perché sono le colonne;
    - Change, Duplicate;
    - Remove;
  - "Add roles" in fondo.
- **Tab Phasing:** un mese per riga con importo, ore e barra.
- **Selezione:**
  - il tap sulla riga seleziona;
  - pannello fisso in basso: contatore + Select all free, segmentato New/Existing, dropdown se Existing, Cancel + CTA a tutta larghezza;
  - i modali diventano bottom sheet: si può usare `offcanvas-bottom` di Bootstrap o lo stesso modale con classe `modal-fullscreen-sm-down`;
  - lo step program resta.

**Suggerimento:** due cicli separati.
- **Ciclo A:** desktop + tablet (§2–§6 + tablet).
- **Ciclo B:** smartphone (nuovi stati e sheet).

## 8. Copy (tutta in inglese)

| Oggi / in tavola | In produzione |
|---|---|
| "Summary (click to expand/collapse)" | "Totals by role" (chevron) |
| "Total Hrs by Role" / "Total Fee by Role" | "Hours by role" / "Fees by role" |
| "TOTAL COST and FEE" / "Total Pass through Costs" | "Total cost & fee" / "Pass-through" |
| "⚠️ rate 0" / "⚠️ 0" | "Missing rate" |
| "✎ custom" | "Custom · reset {baseline}" |
| "already assigned" | badge "In {project}" + tooltip "Already in {project}" |
| "☑ free" / "☑ All free tasks" | "Select free (n)" / "Select all free (n)" |
| "— Add to existing project —" | segmentato "Existing project" + "Choose a linked project…" |
| "▶ Create project" / "＋ Add to project" | "Create project" / "Add {n} to project" |
| "👥 + Add role" | "Add roles" |
| "🚀 Generate Project" | "Generate project" |
| "Già aggiunto" (residuo in 5.16) | "Already added" |
| placeholder date "gg/mm/aaaa" | "dd/mm/yyyy" |

Formati:
- date task dd/mm/yyyy (`cgIsoToIt`);
- date di fase "2 nov 2026 – 31 mar 2027" (`phaseDatesLabel`);
- ore con "h";
- importi solo via `formatMoney`.

## 9. Mappatura colori → token

| Uso | Token |
|---|---|
| Header tabella, banda totali, barra selezione, bottone primario pannello | `--brand-navy` |
| Riga phase | `--brand-mid` (#122258, già token) |
| Azione primaria, selezione, focus | `--brand-magenta` (+ `-hover`, `-tint`, `--focus-ring`) |
| Rate custom (oggi `#fffbe6`/`#ffe58f`/`--color-warning-text`) | `--color-warning-bg` / bordo `color-mix(in srgb, var(--color-warning) 55%, white)` / `--color-warning-text` |
| Rate 0 (oggi `#7f0b0b`, `#fff0f0`, `#f5c6cb`) | `--color-danger-bg` / testo `--color-danger-text`; header di colonna pieno `--color-danger-text` (#842029, il più vicino al #7F0B0B attuale) |
| Celle calcolate (oggi `--sand-50/100/200`) | `--surface-light` / `--surface-subtle`. Le var `--sand-*` restano in `style.css` per le altre pagine |
| Bordi | `--border-light`, `--border-medium` |
| Testi | `--text-primary`, `--text-muted`, `--text-faint`, `--text-disabled` |
| Badge "In project", checkbox bloccata | `--surface-medium` + `--text-muted` |
| Link Select free (oggi `#fcd34d`) | `--color-warning` su navy, verificando il contrasto ≥ 4.5:1 |
| Radius / ombre | `--radius-md` (8), `--radius-lg` (12) — le card a 14px delle tavole diventano 12; `--shadow-sm`/`--shadow-md` |

Non servono token nuovi. Se se ne volesse aggiungere uno, **solo se indispensabile**: costa il bump `tokens.css?v=9` → `v=10` su tutte le pagine e il test `tokens.test.js`. Alternativa: `color-mix()` sui token esistenti, dentro `costgrid.css`.

## 10. Divergenze tavole ↔ codice: decisioni prese (brainstorming 2026-10-07)

| # | Punto | Tavola | Codice | Decisione |
|---|---|---|---|---|
| 1 | Period | 5.21 a mese ("Start month / End month", mm/yyyy); 5.17–5.19 e 5.11–5.12 ancora a giorno | `type="month"`, `startDate` "YYYYMM" | **Tenere il mese**, come la 5.21. Le date a giorno nelle tavole compilate sono un residuo |
| 2 | Currency | in 5.10 "deriva dalla ratecard, sola lettura" | select libero, bloccato solo da `currencyLocked` | **Vale il codice.** Niente derivazione automatica |
| 3 | New version fuori Draft | visibile e disabilitato (in Draft attivo, 5.21) | nascosto fuori Draft | **Vale il codice: resta nascosto fuori Draft** — le versioni possono esistere/essere create/eliminate solo in Draft, per design. **Supplemento deciso:** "+ New version" non apre più `#cgNewVersionModal` (nessun campo nome): crea subito una versione con label di default (`v{n}`), apre/seleziona la nuova tab; l'etichetta diventa rinominabile inline con lo stesso pattern già usato per i nomi di fase (click-to-edit). Stesso principio del ciclo "New Proposal/Clone senza modale" (2026-10-07, `costgrid.html:38` + `js/costgrid.js`) |
| 4 | Delete phase con task in progetto | ✕ disabilitata | permessa (con conferma) | **Nuova regola: bloccare.** `deletePhase` si blocca con `showInfo` se la fase contiene task assegnati a un progetto (doppio controllo id+nome); la ✕ compare disabilitata con tooltip |
| 5 | Etichetta del nome | "Project name" | "Proposal name" (`draft.projectName`) | **Resta "Proposal name"** — il campo (`draft.projectName`) non cambia, solo l'etichetta attuale è quella corretta finché la proposta non diventa un progetto |
| 6 | Remove column | secondo clic nel menu | `showConfirm` | **Secondo clic nel menu ⋮** ("Click again to remove · Xh … will be deleted"), sostituisce `showConfirm` per questa sola azione |
| 7 | Esito "Create project" | toast | dialog con link a project-config | **Tenere il dialog** (§5) |
| 8 | Phasing | ripartizione per giorni, budget con PTC | ripartizione uguale per mese, solo ore × rate | **Vale il codice** (§6) |
| 9 | Ore non valide | — | `alert()` | Sostituire con `showInfo()` (stesso testo): l'ultimo `alert` nativo della pagina |
| 10 | Delete version | link nel banner Draft (5.21) | bottone in toolbar | Spostarlo nel banner: stessa funzione, stessa condizione `isDraft` |
| 11 | Monthly Phasing senza periodo | card con messaggio | pannello nascosto | Mostrare la card con il messaggio (§6) |

## 11. Documentazione da aggiornare

- `CLAUDE.md`: voce `costgrid.html` (card richiudibili con persistenza, menu ⋮, segmentato di selezione, `costgrid.css`); file structure.
- `docs/pages/costgrid.md`.
- `TEST_CASES.md` / `test-cases.html`:
  - persistenza delle card;
  - ⋮ Move/Remove;
  - reset rate;
  - Select free toggle;
  - Existing disabilitato senza linked projects;
  - fix id + nome.

## 12. Fuori scope

- Logica di rate (`resolveRoleRate`), totali, autosave, lock, permessi.
- API: nessuna modifica necessaria. Il numero di condivisioni usa l'endpoint shares esistente.
- `#cgRoleSelectModal` (Add roles / Change / Duplicate): solo restyle leggero, se si vuole, seguendo 5.16. Altrimenti resta com'è.
- Popup "New proposal" dalla Pipeline (5.9): ciclo separato.
- Pulizia delle var `--sand-*` / `--brand-mid` in `style.css`.

## 13. Checklist

- [ ] `css/costgrid.css?v=1` caricato solo da `costgrid.html`. `style.css`/`tokens.css` non toccati (o bump completo).
- [ ] Nessun hex nuovo, nessuna emoji, `:style` con colori sostituiti da classi.
- [ ] Header unico, primaria magenta unica per stato, Share e Delete version mantenuti.
- [ ] Card richiudibili: riepilogo strutturato, default Draft aperte / altri chiuse, persistenza per proposta.
- [ ] Offer details: Client → Ratecard → Currency in fila; Currency lock invariato; Linked projects in fondo.
- [ ] Griglia: prima colonna sticky su tutte le righe, menu ⋮ con 5 azioni, reset rate, compact columns, badge "In {project}" + lucchetto.
- [ ] Selezione: segmentato New/Existing, CTA unico, Select free toggle, fix id + nome.
- [ ] Modali ristilizzati: step indicator, riepilogo task, program a card radio.
- [ ] Monthly Phasing richiudibile con barre, calcolo invariato, messaggio senza periodo.
- [ ] Stato vuoto Draft (5.21): valori placeholder, colonna "+ Add roles", Delete version nel banner.
- [ ] Tablet (ciclo A); smartphone a tab + sheet (ciclo B).
- [ ] Copy in inglese (§8). Decisioni §10 chiuse prima dell'implementazione.
- [ ] `costgrid-calc.js` bump + test per ogni logica estratta (riepilogo, free tasks). `foundations-guard`/`nav-shell-guard`/`money-guard`/`project-rules-guard` verdi.
- [ ] Verifica a 1440, 1024 e 390px su proposta nuova vuota, Draft compilata, SIP con progetti, locked, viewer.
- [ ] Docs aggiornate (§11).
