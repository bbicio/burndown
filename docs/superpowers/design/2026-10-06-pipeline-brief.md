# Brief per Claude Code — Pipeline (tavole 4.4 → 4.13)

Tavole in `docs/superpowers/design/Pipeline/`.

## Decisioni prese prima del ciclo (2026-10-06) — prevalgono sul testo sotto

Prese in conversazione dopo la verifica del brief contro il codice e le tavole.

**Divisione in due cicli** (un worktree per volta, il secondo dopo il merge del primo):
- **Ciclo 1 — Board:** §1 (organizzazione CSS), §2 (layout, footer rimosso), §3 (header, menu anno, Open pipeline, estensione API conteggio offerte), §4 (toolbar, ricerca, Amounts), §5 (colonne e card), §7 per la board (tablet a colonne fisse, smartphone con tab di stadio e bottom sheet Filtri), §8/§9 per le parti toccate. Il pannello dettaglio resta quello attuale, salvo l'adeguamento minimo perché un click su una card non lo chiuda, se serve al ciclo.
- **Ciclo 2 — Pannello dettaglio:** §6 (contenitore, testata, 4 tab), §10 (estensione API POT), §7 per il pannello (sovrapposto / a tutto schermo).

**Decisioni puntuali:**
1. **Ricerca: filtro live come oggi** (`filterSearch` filtra mentre si digita). Il menu suggerimenti (4.7) è una scorciatoia: click su cliente → `filterClientIds = [id]`, click su proposta → `openDetailPanel`. Il piede "Press Enter to filter the board" non si usa: diventa "N more results — refine your search".
2. **Open pipeline = SIP + Expected + Anticipated.** Draft e Canceled non fanno parte della pipeline (Committed è escluso come da §3). La colonna Draft resta visibile con la regola attuale del server: ciascuno vede solo i propri Draft, admin compresi (`api/src/routes/cost-grids.js:134-165`).
3. **Menu anno: estendere l'API** con il conteggio offerte per anno (Draft e Canceled esclusi).
4. **Amounts: nessuna persistenza** in `localStorage` in questo ciclo (niente bump di `core.js`).
5. **Pannello dettaglio: 480px fisso** (non 560). Affiancato alla board quando le restano almeno 560px (≈ 2 colonne): da 1280px con sidebar aperta, da ≈ 1110px con il rail. Sotto soglia: sovrapposto a destra, 480px, backdrop leggero (tablet 1024). Smartphone: a tutto schermo. Soglie via media query combinate con `html[data-sidebar="collapsed"]`, senza JS.
6. **POT, liste proposte:** "Contributing proposals" e "Other proposals" mostrano tutte le proposte del target con owner e importo, anche quelle non condivise con l'utente (è solo informazione: nessun problema di riservatezza, decisione dell'utente).

**Verifiche già fatte sul codice** (da non rifare in `/brainstorming`): tutti i token della §9 esistono in `css/tokens.css`; `GET /api/pipeline-years` restituisce solo `id, year, active` (e i non-admin vedono solo gli anni attivi); `/api/pots/summary` non restituisce l'importo per proposta né expected/sip; `pbFmtDate` produce già "Oct 3, 2026"; visibilità dei bottoni come descritta in §5 (Share nascosto su Draft anche se la tavola 4.5 lo mostra: vale il codice).

**Copy aggiuntiva (§8):** tablet/smartphone "Originale" / "EUR" → "Original currency" / "All in EUR"; 4.7 "Clienti" → "Clients", piede come al punto 1.

---

Immagini allegate, una per tavola:

| Tavola | Contenuto |
|---|---|
| 4.4 | Board desktop: header, filtri, colonne, card |
| 4.5 | Stati della card (default, hover, selezionata, senza budget, "All in EUR", titolo lungo) |
| 4.6 | Menu anno "Pipeline 2026" |
| 4.7 | Ricerca con suggerimenti |
| 4.8 | Tablet 1024×768 e smartphone 390×844 |
| 4.9 | Smartphone, pannello Filtri aperto |
| 4.10 | Pannello dettaglio, tab Overview |
| 4.11 | Pannello dettaglio, tab Tasks |
| 4.12 | Pannello dettaglio, tab Linked projects |
| 4.13 | Pannello dettaglio, tab POT |

---

## 0. Natura dell'intervento

È un **restyling di `pipeline.html` dentro la sua struttura attuale**. Valgono queste regole:

- La pagina resta una sola, con una sola app Vue montata su `#pipelineBoardSection`.
- `data`, `computed` e `methods` restano dove sono e si estendono solo dove serve.
- Restano invariati:
  - il caricamento (`cgSyncFromApi`, `loadPipelineBudgetsFromApi`, `loadConfigFromApi`) e lo store `_cgStore` + `refreshTick`;
  - i filtri (`pbCardMatchesFilters`);
  - i modali Bootstrap (New proposal, Clone, Confirm, Share);
  - il redirect a `costgrid.html`;
  - `share-list`.
- **Le regole di business del codice hanno la precedenza sui disegni.** Le tavole usano dati di esempio. Permessi, visibilità dei bottoni, stadio di visualizzazione (`pbGetDisplayVersion`) e Draft mai filtrata restano quelli attuali.
- **Gli importi nelle tavole sono illustrativi.** La formattazione viene sempre da `formatMoney(amount, code, currencies)` (`js/lib/money.js`), con il locale della valuta. Non replicare il formato "€ 21.555,00" a mano.

Vincoli dal `CLAUDE.md` del repo:
- Niente build step.
- Niente hex hardcoded: solo `var(--token)`.
- `?v=N` aggiornato su ogni file versionato che si modifica.
- Shim e override solo nel pattern `type="module"`.
- `#app-shell`/`#app-main` senza `overflow`, `position`, `transform`.
- `v-cloak` resta su `.pb-board-root`.
- Workflow `docs/superpowers/PROCESS.md`, chiusura con `/finish-cycle`.

## 1. Organizzazione CSS (proposta)

Oggi la board è quasi tutta in `style="…"` inline e in stringhe HTML costruite in JS (`cardBudgetHtml`, `totalsHtml` via `v-html`).

- **Nuovo `css/pipeline.css?v=1`**, caricato solo da `pipeline.html`. È lo stesso precedente di `admin-crud.css` e `auth.css`.
  - Ci vanno tutte le classi nuove `.pb-*`: header, toolbar, colonna, card, pannello, tab, bottom sheet, media query.
  - Motivo: `style.css` è caricato da 18 pagine. Toccarlo obbliga a un bump su tutte e allarga il perimetro del test `nav-shell-guard`.
- **In `style.css` restano** `.pb-board-root` (layout in altezza documentato) e le regole legacy `.pb-column`/`.pb-col-body`/`.pb-card`. Il nuovo file le sovrascrive.
  - La pulizia di `style.css` va in un ciclo separato, con bump unico.
- **Niente nuovi token se evitabile** (eviterebbe il bump di `tokens.css?v=9` su 18 pagine). Mappatura in §9.
- **`v-html` per importi e totali → template Vue.** `cardBudgetHtml()` e `totalsHtml` diventano oggetti strutturati, per esempio `{ amount, sub, ptc, noBudget }` e `{ total, ptc, breakdown[], mixed }`, resi nel template.
  - La logica pura che serve va in `js/lib/pipeline-calc.js`, con test vitest (bump `?v=4` → `?v=5`).
  - Candidate: formattare un importo in modalità originale/EUR, comporre il totale di colonna con breakdown.
- **Nessuna emoji** nell'interfaccia: 🔍 🔗 👤 ✏️ ⧉ 🗑 🎯 📋 📊 💾. Al loro posto icone SVG inline `stroke="currentColor"` 14/16px, oppure solo testo, come nelle tavole.

## 2. Layout della pagina (4.4)

Struttura dentro `.pb-board-root`, colonna flex come oggi:

1. **Header**: titolo-menu anno a sinistra; "Open pipeline" + bottone **+ New Proposal** (magenta, l'unico della pagina) a destra.
2. **Toolbar**: ricerca (300px), dropdown Owner / Client / Currency / Value, spazio flessibile, interruttore **Amounts** (Original currency | All in EUR).
3. **Area principale**, nuova riga flex orizzontale con `flex:1; min-height:0`:
   - **board**: colonne con gap 12px, padding 0 24px 20px, scroll orizzontale;
   - **pannello dettaglio** (§6): fratello della board, non sovrapposto.

Il **footer dei totali** (`.pb-col-footer`) **viene rimosso**: i totali passano nell'intestazione di colonna.

Sfondo pagina `--surface-subtle`, colonne su grigio leggermente più scuro, card bianche.

## 3. Header e menu anno (4.6)

- **Titolo** "Pipeline {{ selectedYear }}" 26px/700 navy + chevron SVG (al posto del triangolo CSS). Sottotitolo invariato.
- **Menu**: card bianca 300px, radius 12px, ombra morbida.
  - Etichetta di gruppo "AVAILABLE PIPELINES".
  - Una riga per `pipelineYears`. La riga dell'anno selezionato ha sfondo `--brand-magenta-tint`, bordo sinistro 3px magenta e pillola **"Current"**.
  - La riga mostra il numero di offerte (Canceled escluse).
    - **Da verificare**: `Api.pipelineYears.list()` probabilmente non restituisce il conteggio. Se manca, mostrare per ora "Closed" sugli anni `active === false` e lasciare il conteggio a un'estensione API (§10).
- Comportamento invariato: `selectYear()` fa redirect con `?year=`.
- **Open pipeline**: somma ≈ EUR di tutte le colonne tranne Committed e Canceled, etichetta "OPEN PIPELINE" 10px uppercase, valore 17px/700.
  - Usa i totali già calcolati da `pbComputeColumnTotals`.
  - **Da confermare**: Draft inclusa o no (la tavola la include).

## 4. Toolbar, ricerca, Amounts (4.4, 4.7)

**Dropdown filtri**
- Restano i dropdown Bootstrap con checkbox: stesso comportamento, stessi badge di conteggio, stesso "Include PTC in value".
- Trigger ristilizzati: bianco, bordo `--border-light`, radius 8px, 12.5px.
- "Clear filters" diventa link testuale, senza ✕ rosso.

**Ricerca**
- Input con icona SVG, placeholder "Search proposal or client…". In focus: bordo magenta + `--focus-ring`.
- Menu suggerimenti a discesa (400px), calcolato lato client su tutte le card dell'anno:
  - stato vuoto: "Search by proposal title or client name in Pipeline {{ year }}.";
  - gruppo **CLIENTS**: nome evidenziato + "N proposals". Click → `filterClientIds = [id]`;
  - gruppo **PROPOSALS**: max 4 righe. Titolo evidenziato, importo, puntino stato · stadio · cliente. Click → `openDetailPanel(cgId, verId)`;
  - piede: "Press Enter to filter the board · N more results";
  - nessun risultato: "No results for "…"".
- **Decisione da confermare con me**: oggi `filterSearch` filtra mentre si digita. La tavola prevede suggerimenti mentre si digita e filtro della board su Enter. Se si adotta, serve uno stato separato (`searchQuery` per il menu, `filterSearch` assegnato su Enter). Altrimenti si tiene il filtro live e il menu è solo una scorciatoia.
- Chiusura con click fuori ed Esc.

**Amounts**
- Nuovo stato `currencyMode: 'original' | 'eur'`, controllo segmentato.
- In "All in EUR" card e intestazioni mostrano l'equivalente EUR e, in piccolo, "from CHF 20'046.15".
- La conversione usa lo stesso tasso di oggi: `currencyRate` dello snapshot di versione, come il "≈" attuale.
- Persistenza facoltativa in `localStorage`. La chiave va aggiunta al `keep` Set di `core.js` (bump).

## 5. Colonne e card (4.4, 4.5)

**Colonna**
- Radius 12px, bordo superiore 3px nel colore dello stadio. Nessuno sfondo colorato a tutta altezza.
- Intestazione cliccabile, che comprime o espande la colonna:
  - nome + pillola conteggio; totale a destra;
  - riga PTC "+ € X PTC" se > 0;
  - se la colonna è multi-valuta e la modalità è Original: totale "≈ € …" e pillole per valuta sotto.
- **Colonne comprimibili**: nuovo stato `collapsedStages`.
  - Le colonne vuote partono compresse.
  - Compressa = striscia 44px con conteggio, nome in verticale e totale in verticale se ha card.
  - Persistenza non richiesta.
- Colonna vuota espansa: riquadro tratteggiato "No offers".

**Card**, gerarchia dall'alto:
1. Cliente (11px muted) · pillola "Linked" se `linkedProjects.length` · versione a destra.
2. Titolo 12.5px/600 navy, max 2 righe (`-webkit-line-clamp:2`, `overflow-wrap:anywhere`), titolo completo nel `title`.
3. Importo 15px/700. Se valuta estera, "≈ € …" accanto. "No budget" in grigio se zero.
4. Riga "+ X PTC" se > 0.
5. Riga meta separata da un filetto: data · spazio · owner (testo, senza 👤).

Draft con bordo tratteggiato: si può tenere, non è in tavola ma non va contro.

**Stati**
- Hover: bordo più scuro + ombra leggera. La riga meta mostra le azioni testuali **Edit · Clone · Share · Delete**.
  - Visibilità esattamente come oggi:
    - Edit e Clone nascosti se `myPermission === 'viewer'`;
    - Share nascosto su Draft;
    - Delete solo su Draft e non-viewer.
  - Delete in `--color-danger`.
  - Tutte con `@click.stop`.
- Selezionata (pannello aperto su quella card): bordo magenta + anello `--focus-ring`.
- Senza hover (touch): le azioni non compaiono sulla card. Si usano quelle del pannello.

**Colori stadio**: da `PB_STAGE_STYLE`, che va sistemato: Draft ha oggi hex hardcoded (§9).

## 6. Pannello dettaglio (4.10 → 4.13)

**Contenitore**
- Da `position:absolute` 860px sovrapposto a **colonna flex 560px affiancata alla board**: la board si restringe.
  - Fondo bianco, bordo sinistro, bordo superiore 3px colore stadio, scroll interno solo sul corpo.
- Click su un'altra card: il pannello cambia contenuto senza chiudersi.
  - Adeguare `_pbDetailOutsideClickHandler` perché un click su `.pb-card` non chiuda il pannello.
  - Il resto del comportamento resta: i modali sono esclusi, il click fuori chiude.
- Aggiungere la chiusura con Esc.

**Testata** (sostituisce la barra navy)
- Riga 1: pillola stadio · pillola "Linked project" · spazio · "Version" + controllo segmentato con le versioni · ✕ (SVG).
  - **Le versioni restano cliccabili** come oggi (`openDetailPanel(cgId, ver.versionId)`).
  - Il pallino colorato di stadio per versione si può tenere dentro il segmento.
- Cliente (12px muted), titolo 19px/700.
- "Owner **Name** · Created on {date}".
- Azioni: **Edit** (navy pieno, primaria del pannello), **Clone**, **Share** (bianchi con bordo), Delete a destra in testo rosso.
  - Stesse condizioni di visibilità attuali.
  - Delete chiama `deleteSelectedVersion`.
- Tab con barra magenta sotto l'attiva: **Overview · Tasks (n) · Linked projects (n) · POT**.
  - Nuovo stato `detailTab`, che torna a `overview` quando si apre un'altra card.
- Stati `detailLoading` ed errore come oggi, ristilizzati: spinner magenta e messaggio in `--color-danger-text`.

**Overview (4.10)**
- Tre riquadri: Professional fees, PTC, **Total budget** (riquadro navy). Se la valuta è estera, sotto "≈ € …".
- Period e Currency in griglia a due colonne.
  - Il bottone **Refresh rate** (`rateStale`, solo admin) resta accanto a Currency, come link o bottone secondario senza ↺.
  - La riga "1 € = x CHF" resta.
- Nota (`selectedVersion.note`) se presente.
- **Shared with**: si usa il componente `<share-list>` esistente.
  - Non modificare `js/share-list-component.js`: lo usa anche `costgrid.html`.
  - Allineamento visivo con selettori discendenti in `pipeline.css`, se basta. Se servono modifiche al componente (per esempio togliere "👥"), farle con bump e verifica anche su costgrid.

**Tasks (4.11)**
- Per fase: intestazione con nome + totale e filetto navy 2px.
- Tabella a griglia: TASK · PERIOD · HOURS · AMOUNT.
- Righe da `taskTotals`/`taskDateRange` come oggi.
- Vuoto: "No tasks defined in this version's cost grid."

**Linked projects (4.12)**
- Card bordata per progetto:
  - nome, codice monospace, link "Project Dashboard →" in magenta (`pbGoToPortfolio`);
  - pillole stadio + stato progetto (`statusBadgeLarge` o equivalente con token: "Started At Risk" in danger tenue);
  - riga "Tasks: …".
- Vuoto: "No linked projects. Projects are generated from the Cost Grid with "Generate project"."

**POT (4.13)**
- Intestazione:
  - "POTENTIAL (POT)", nome target + anno, percentuale grande;
  - "of target reached by Committed + Anticipated".
- Barra 12px:
  - segmenti Committed, Anticipated, Expected, SIP (SIP a strisce);
  - tacca verticale navy "Target" nella posizione 100% del target;
  - legenda con valori;
  - nota: "Progress and gap count Committed + Anticipated only. SIP and Expected are upcoming pipeline."
- Griglia 2×2:
  - Committed (% del target), Anticipated (% del target), Total (C+A);
  - **Gap to target** = Target − (C + A). Se negativo → etichetta "Over target", valore "+ € X" in `--color-success`.
- **Contributing proposals**: solo Committed e Anticipated, con titolo, meta (cliente · Pipeline anno), pillola stadio, importo.
- **Other proposals · not in total**: tutte le altre (SIP, Expected), in grigio.
- Stati:
  - nessun POT → "No POT target for {target} in {year}." (testo attuale);
  - Draft → "Draft proposals don't count toward the POT." (oggi la sezione sparisce).
- `totColor` oggi usa hex. Passa a token oppure sparisce, perché la tavola non colora la percentuale.

## 7. Responsive (4.8, 4.9)

Breakpoint già esistenti nel nav: ≥1024 sidebar/rail, <1024 navbar in alto. Le media query vanno in `pipeline.css`.

**Tablet ~1024**
- Colonne a larghezza fissa (circa 260px) con scroll orizzontale; l'ultima resta tagliata a vista.
- Niente azioni hover sulle card.
- Pannello: sovrapposto a destra (560px o `min(560px, 100%)`) con backdrop leggero, perché affiancato non ci sta.

**Smartphone (<768)**
- Header: titolo-menu anno 20px + "Open pipeline" sotto; bottone **+ New**.
- Riga: ricerca a tutta larghezza + bottone **Filters**. Target 44px.
- **Tab di stadio scorrevoli** con conteggio, indicatore 3px colore stadio. Mostrano una colonna alla volta.
  - Nuovo stato `mobileStage`. Le colonne desktop sono nascoste a questo breakpoint.
- Riepilogo dello stadio attivo (nome, "N offers", totale, pillole valuta) sopra la lista.
- Card a tutta larghezza, testi un po' più grandi (titolo 14px, importo 16px).
- **Filters** apre un bottom sheet:
  - contenuto: Amounts, Owner/Client/Currency/Value in griglia 2×2, bottone navy **Show results**;
  - usare `offcanvas-bottom` di Bootstrap (già caricato), non un componente nuovo;
  - i filtri sono gli stessi `filter*` del desktop.
- Pannello dettaglio: a tutto schermo, non disegnato. Testata compatta, tab scorrevoli.

## 8. Copy (tutta in inglese)

Alcune tavole contengono residui italiani dei prototipi. Correzioni:

| In tavola | In produzione |
|---|---|
| "Pipeline disponibili" | "Available pipelines" |
| "Corrente" | "Current" |
| "Clienti" | "Clients" |
| "Ore" / "Importo" | "Hours" / "Amount" |
| "da CHF …" | "from CHF …" |
| "Invio per filtrare la board · altri N risultati" | "Press Enter to filter the board · N more results" |
| tooltip "Espandi/Comprimi colonna" | "Expand column" / "Collapse column" |

Formati:
- date "Oct 3, 2026": verificare che `pbFmtDate` lo produca;
- ore con suffisso "h";
- importi solo via `formatMoney`.

## 9. Mappatura colori → token

| Uso | Token |
|---|---|
| Testo principale, bottone secondario | `--brand-navy` |
| Bottone primario, selezione, tab attiva | `--brand-magenta` (+ `-hover`, `-tint`) |
| Bordi | `--border-light` |
| Testi secondari | `--text-muted`, `--text-faint` |
| Sfondi | `--surface-subtle`, `--surface-medium` |
| Radius | `--radius-md` (8), `--radius-lg` (12) |
| Ombre | `--shadow-sm` / `--shadow-md` |
| Stadi | `--pipeline-{sip,expected,anticipated,committed,canceled}-{bg,color}` |
| **Draft** (oggi `#f8f9fa/#adb5bd/#6c757d` in `PB_STAGE_STYLE`) | `--surface-light` / `--text-disabled` / `--text-muted`. Niente token `--pipeline-draft-*` in questo ciclo |
| Gap superato, errori | `--color-success`, `--color-danger` |

La barra POT a strisce (SIP) si fa con `repeating-linear-gradient` sui token di SIP.

## 10. Estensioni API necessarie (POT, menu anno)

`GET /api/pots/summary` (`api/src/routes/pots.js`) oggi restituisce:
- `pot`;
- `committed_total`, `anticipated_total`;
- `proposals` **senza importo**, solo l'anno richiesto, senza Draft.

La tavola 4.13 richiede:
1. `expected_total` e `sip_total`, calcolati come gli altri due (stesso `feeExpr`, su tutte le proposte, EUR);
2. `value` (EUR) per ogni proposta della lista. Lo stesso calcolo esiste già nell'endpoint dettagli POT (righe ~338-383);
3. **"Other proposals" di qualsiasi annata**: decisione presa ("of any vintage"). Oggi la query filtra per `pipeline_year`. Serve una seconda query, o un parametro, per le proposte del target negli altri anni, escluse dal totale.

Aggiunte retro-compatibili: campi nuovi, nessun campo rimosso. Test `node:test` se si estrae la logica in `api/src/lib/`.

Facoltativo: conteggio offerte per anno nel menu (§3).

## 11. Documentazione da aggiornare

- `CLAUDE.md`:
  - "Pipeline board layout": nuova riga flex board + pannello, footer rimosso;
  - "Each pipeline column footer shows…": i totali passano nell'intestazione;
  - descrizione del pannello dettaglio (oggi due colonne 50%);
  - file structure (`css/pipeline.css`).
- `docs/pages/pipeline.md`.

## 12. Fuori scope

- Logica dei filtri e dei permessi.
- Calcolo dei budget.
- Modali New proposal / Clone / Confirm / JSON viewer: solo pulizia emoji nei titoli, se si vuole.
- `costgrid.html`.
- Pulizia delle regole `.pb-*` legacy in `style.css`.

## 13. Checklist

- [ ] `css/pipeline.css?v=1` caricato solo da `pipeline.html`. `style.css` e `tokens.css` non toccati (o bump completo se toccati).
- [ ] Niente `v-html` per importi e totali. Nessun hex nuovo. Nessuna emoji.
- [ ] Footer totali rimosso. Totali e breakdown valuta nell'intestazione.
- [ ] Colonne comprimibili. Le vuote partono compresse.
- [ ] Card: gerarchia della tavola, azioni hover con le regole di visibilità attuali, stato selezionato.
- [ ] Amounts Original/EUR su card, colonne e Open pipeline.
- [ ] Ricerca con suggerimenti (clienti → filtro, proposta → pannello).
- [ ] Menu anno ristilizzato con "Current".
- [ ] Pannello affiancato 560px, 4 tab, versioni cliccabili, cambio card senza chiusura, Esc.
- [ ] POT con Expected/SIP, Gap/Over target, contributing e other proposals (API estesa).
- [ ] Tablet: colonne fisse con scroll, pannello sovrapposto. Smartphone: tab stadio, bottom sheet Filters, pannello a tutto schermo.
- [ ] Copy tutta in inglese (§8).
- [ ] `pipeline-calc.js` bump + test. `foundations-guard`/`nav-shell-guard`/`money-guard` verdi.
- [ ] Verifica a 1440, 1024 e 390px con dati reali multi-valuta.
- [ ] Docs aggiornate (§11).
