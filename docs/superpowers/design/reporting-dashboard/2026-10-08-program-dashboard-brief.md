# Brief per Claude Code — Program Dashboard (tavola 7.5)

> Incollato dall'utente in chat il 2026-10-08, salvato qui verbatim come input del ciclo.
> Le decisioni prese in `/brainstorming` che si discostano da questo testo sono nella spec
> `docs/superpowers/specs/2026-10-08-program-dashboard-design.md` §3, che prevale.

Immagini allegate:

| Tavola | Contenuto |
|---|---|
| 7.5a | Program Dashboard · vista List — **riferimento principale** |
| 7.5b | Program Dashboard · vista Timeline |
| 7.4d | Project Reporting dentro un programma — solo per il punto di ingresso "Program Dashboard →" |

Il reporting di progetto (7.4) è fuori scope: qui interessa solo come destinazione di "Reporting →" e come origine di "Program Dashboard →".

---

## 0. Natura dell'intervento

**Vista nuova.** Oggi la Program Dashboard non esiste: nel Portfolio il pulsante `Dashboard` del programma è inattivo con tooltip "coming soon" (brief Portfolio §1.2). Questo ciclo crea la pagina e attiva i punti di ingresso.

È una **panoramica del programma**: i progetti sono le righe, senza task né registrazioni. Serve a capire quale progetto va guardato; l'analisi si fa nel reporting del singolo progetto.

Vincoli dal `CLAUDE.md` del repo: niente build step, solo `var(--token)`, `?v=N` aggiornato sui file versionati toccati, shim/override solo `type="module"`, `#app-shell`/`#app-main` senza `overflow`/`position`/`transform`, `v-cloak` invariato, workflow `docs/superpowers/PROCESS.md` con `/finish-cycle`. **Le regole di business del codice hanno la precedenza sui disegni**: dati e importi della tavola sono illustrativi; formattazione solo via `formatMoney`, `fmtH`, `fmtVar`, `varColor`, `monthLabel`. Nessuna emoji.

## 1. Dove vive

- Proposta: terza vista dell'app Vue di `portfolio.html` → `view: 'overview' | 'dashboard' | 'program'`, metodo `showProgramDashboard(programId)`.
- URL `?programId=` gestito come `?projectId=`: `replaceState` all'apertura, ripristino al load, ritorno a `/portfolio.html` con "← Portfolio".
- Breadcrumb (`updateBreadcrumbs`): `Home / Portfolio / <Programma>`.
- Alternativa: pagina separata `program.html` (§9).

## 2. Ingressi e uscite

| Da | Elemento | Azione |
|---|---|---|
| Portfolio, vista Card e List | `Dashboard` / "Program Dashboard →" del programma | **da inattivo diventa attivo** → `showProgramDashboard(prog.id)` |
| Reporting di progetto (7.4d) | "Program Dashboard →" nella riga programma sopra il titolo e in fondo al menu dei fratelli | → `showProgramDashboard(project.program_id)` |
| Program Dashboard | "Reporting →" su ogni riga (List) o barra (Timeline) | → `showDashboard(project.id)` (reporting di progetto esistente) |

Nel reporting di progetto, se il progetto ha un programma, la breadcrumb diventa `Home / Portfolio / <Programma> / <Progetto>` con la voce programma cliccabile.

Togliere tooltip "Program Dashboard — coming soon" e stato disabilitato in tutti i punti sopra.

## 3. Testata

- Link compatto "← Portfolio".
- Etichetta "PROGRAM" (maiuscoletto), titolo 26px/700 navy con il nome del programma.
- Riga metadati: cliente · "N projects" · intervallo date (primo start → ultima end).
- Azioni a destra, alte 32px, icona SVG:
  - **Export PDF** — stampa della pagina (§9: in questo ciclo o dopo).
  - **Share** — **modale 6.5e** del brief Portfolio (`js/share-modal-component.js`), stessi endpoint e regole. In tavola appare come popover: non si implementa il popover.

## 4. KPI (4 tile)

| Tile | Contenuto | Calcolo |
|---|---|---|
| **Budget** | speso / venduto, barra, %, residuo | Σ dei progetti |
| **Hours** | consumate / vendute, barra, %, residuo | Σ dei progetti |
| **Time elapsed** | % trascorso, "N of M projects started" | dal primo start all'ultima end dei progetti |
| **Needs attention** | numero di progetti + motivo sintetico | progetti con almeno una condizione: status "Started at risk"; consumo ≥ 85%; consumo % − tempo % > 10 punti |

- La % del programma è **Σ Spent / Σ Sold**, non la media delle % dei progetti.
- Soglie barra come il Portfolio: navy < 85%, ambra ≥ 85%, rosso > 100%.
- Click su "Needs attention": filtra la lista su quei progetti (§9).

## 5. Program burndown

- Una card con il grafico delle **ore residue sommate di tutti i progetti**:
  - effettive → linea piena con area (`--chart-actual`);
  - previste da phasing → tratteggio magenta (`--chart-phasing`);
  - marcatore "Today" con le ore residue.
- **Nessun filtro per task**: i task non sono confrontabili tra un progetto e l'altro.
- Granularità: solo Monthly in questo ciclo (§9). Export PNG come icona, come nel progetto.
- Chart.js, colori letti con lo stesso `chartColor()` della vista progetto.

## 6. Projects · List | Timeline

Card con selettore segmentato **List | Timeline** nella testata.

**List (7.5a)**
- Colonne: Project (nome + codice monospace) · Status (pillola) · Sold · Spent · Remaining · Consumption · vs time · azione.
- Sold / Spent / Remaining: ore in evidenza, € sotto più piccolo (come nel reporting di progetto).
- **Consumption**: barra 5px + %, con **tacca grigia** alla posizione del tempo trascorso del progetto.
- **vs time**: scarto in punti (consumo % − tempo %), con segno; rosso oltre +10, verde sotto −10, neutro altrimenti.
- Azione: "Reporting →".
- Riga **Total** in fondo (somme, consumo complessivo).
- Ordinamento default: progetti di "Needs attention" in alto, poi per data di inizio. Ordinamento per colonna facoltativo.

**Timeline (7.5b)**
- Asse dei mesi dal primo start all'ultima end.
- Una barra per progetto da start a end, riempita in proporzione al consumo (stessi colori soglia), linea verticale "Today".
- A sinistra nome + codice; click sulla riga = "Reporting →".

## 7. Dati e backend

**Cosa c'è già**
- `GET /api/reporting/portfolio`: per progetto budget, `actual_hours`, start/end, status, currency, `program_name` — ma non `program_id`, non le ore vendute, non la serie mensile.
- `GET /api/reporting/projects/:id`: tutto il necessario per un progetto (cost grid, timesheet), ma una chiamata per progetto.
- Lato client, `programStatsMap` (Sold/Spent/Variance/durata per programma) e `cardDataMap` (per progetto) nel Portfolio.

**Cosa serve**
1. **Nuovo `GET /api/reporting/programs/:id`** che restituisce:
   - testata del programma (nome, cliente);
   - per ogni progetto visibile all'utente: id, nome, codice, status, start/end, currency, ore vendute, budget, ore ed € spesi;
   - serie mensile aggregata: ore residue effettive e previste (phasing) per il burndown.
   - Stessa visibilità di `projectsVisibilitySql`, stesso calcolo del budget di `/reporting/portfolio`, stesse tariffe di `/reporting/projects/:id`. Evita N chiamate.
2. **Coerenza dei numeri**: Sold, Spent e Remaining di ogni riga devono coincidere con quelli mostrati nel reporting del progetto e nella card del Portfolio. Proposta: estrarre i calcoli in un modulo comune (es. `js/reporting-metrics.js?v=1`) usato da Portfolio, reporting di progetto e Program Dashboard.
3. **Visibilità parziale**: se l'utente vede solo alcuni progetti del programma, totali e KPI si calcolano sui soli progetti visibili e la testata mostra "Showing N of M projects" (§9).
4. **Valute miste**: se i progetti hanno currency diverse, le somme in denaro non sono lecite senza conversione. Finché non si decide (§9): colonne e KPI in denaro mostrano "Mixed currencies", restano le ore.
5. Test `node:test` per endpoint, permessi e somma = totale.

## 8. Stati

- **Caricamento**: scheletri delle tile e della lista.
- **Programma senza progetti visibili**: messaggio "No projects in this program are visible to you." e "← Portfolio".
- **Progetto senza budget**: riga presente, Sold "—", barra vuota, "No budget"; escluso dalla % complessiva ma contato nei progetti.
- **Progetto senza registrazioni**: Spent 0, pillola neutra "No actuals".
- **Progetto non ancora iniziato**: tacca a 0, "vs time" "—".
- **Programma inesistente / accesso negato** (`?programId=` non valido): torna al Portfolio con notice, come `?notice=…` esistente.

## 9. Decisioni da confermare

1. Vista dentro `portfolio.html` (`?programId=`) o pagina separata.
2. Visibilità parziale: totali sui soli progetti visibili (con avviso) o accesso negato.
3. Valute miste: conversione (con quale tasso), totali per valuta, o solo ore.
4. "Needs attention": solo conteggio o anche filtro sulla lista.
5. Granularità del burndown: solo Monthly o le 4 opzioni del progetto.
6. Export PDF: in questo ciclo o successivo.
7. Soglia di "vs time" (proposta ±10 punti) e soglia "Needs attention" (≥85%).

## 10. Mappatura colori → token

| Uso | Token |
|---|---|
| Testo principale, titoli, link | `--brand-navy` |
| Hover link, serie prevista | `--brand-magenta` |
| Bordi, divisori | `--border-light` |
| Etichette, testi secondari, tacca tempo | `--text-muted`, `--text-faint` |
| Sfondi card, riga Total | `--surface-light`, `--surface-medium` |
| Barra ≥85% / >100%, vs time positivo | `--color-warning`, `--color-danger` |
| vs time negativo | `--color-success` |
| Serie grafico | `--chart-actual`, `--chart-phasing` |
| Stati progetto | `--status-*` |

## 11. Copy (inglese)

"Program", "N projects", "Budget", "Hours", "Time elapsed", "N of M projects started", "Needs attention", "Program burndown", "Remaining hours", "Today", "Projects", "List", "Timeline", "Sold", "Spent", "Remaining", "Consumption", "vs time", "Total", "Reporting →", "Export PDF", "Share", "← Portfolio", "Showing N of M projects", "Mixed currencies", "No budget", "No actuals", "No projects in this program are visible to you."

## 12. Responsive

Tablet 1024×768 e smartphone 390×844 **non ancora disegnati**. Regole provvisorie:
- KPI: 4 colonne → 2 sotto 1280 → 1 sotto 768.
- List: sotto 1024 nascondere Remaining e vs time; sotto 768 diventa elenco di card (nome, status, barra con tacca, Spent/Sold, "Reporting →").
- Timeline: solo da 1024 in su; sotto, il selettore List | Timeline sparisce e resta la List.
- Share: bottom sheet su smartphone (come brief Portfolio).

## 13. Fuori scope

- Reporting di progetto (7.4) oltre ai link di ingresso/uscita.
- Filtro Period, filtro per task, Breakdown e Entries a livello programma.
- Inviti esterni, Notify, Copy link nello Share.

## 14. Documentazione

- `docs/pages/portfolio.md`: vista `program`, ingressi e uscite.
- `CLAUDE.md`: file structure (modulo metriche se creato), descrizione Pages.
- `docs/api/…` / `ARCHITECTURE.md`: `GET /api/reporting/programs/:id`.
- Brief Portfolio: rimuovere il vincolo "Dashboard programma inattivo".

## 15. Checklist

- [ ] Vista `program` con `?programId=`, breadcrumb, "← Portfolio".
- [ ] Ingressi attivati: Dashboard programma nel Portfolio (Card e List), "Program Dashboard →" nella 7.4d.
- [ ] 4 KPI con somme dei progetti; % = Σ Spent / Σ Sold.
- [ ] Burndown aggregato (effettivo + previsto, Today), senza filtro task.
- [ ] List con tacca tempo, vs time, riga Total, "Reporting →" → `showDashboard`.
- [ ] Timeline con barre riempite e linea Today.
- [ ] Share = modale 6.5e.
- [ ] `GET /api/reporting/programs/:id` con visibilità + test `node:test`; somma righe = totale.
- [ ] Stati vuoti/parziali (§8); valute miste gestite.
- [ ] Nessuna emoji, nessun hex nuovo.
- [ ] Verifica a 1440, 1024, 390 con dati reali (programma con >8 progetti, uno senza budget, uno non iniziato).
- [ ] Docs aggiornate (§14).
