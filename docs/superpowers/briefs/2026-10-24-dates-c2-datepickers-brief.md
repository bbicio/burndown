# Brief — date, ciclo C2: datepicker e formato non ambiguo nei form

**Tipo:** evoluzione (Scenario 2), raggruppamento confermato dall'utente il 2026-10-24.
**Perché è diverso dal C1:** qui non si corregge un confronto mancante, si cambiano dei controlli e il formato con cui l'utente legge e digita le date. Ci sono decisioni aperte, elencate sotto, che spettano al `/brainstorming`.
**Origine:** `docs/superpowers/audits/2026-10-24-dates-form-validation-audit.md`, finding **D-09, D-10, D-13**. Più l'obiettivo dell'utente: sostituire nei form i campi data con datepicker.
**Dipende da:** C1 (`2026-10-24-dates-c1-shared-rule-brief.md`), di cui usa il modulo date e la regola. Prima di C3.

## Problema

Le date si inseriscono in tre modi diversi:
- con `cg-date-picker` in costgrid;
- con input nativi `type="month"`/`type="date"`, il cui formato segue la lingua del browser;
- con testo libero `gg/mm/aaaa` nei task di project-config.

Il formato digitato da `cg-date-picker` (`dd/mm/yyyy`) è ambiguo per un utente abituato a `mm/dd/yyyy`: `03/04/2026` viene accettato come 3 aprile senza alcun segnale.

## Comportamento attuale

- **D-09** `project-config.html:83-84`: Start ed End del progetto sono `<input type="month">` nativi, senza `min`/`max`. `onDateChange` (`:652-653`) è vuoto e `onSave` (`:841-858`) non controlla le date.
- **D-10** `project-config.html:146,148,937-949`: le date dei task sono testo con placeholder `gg/mm/aaaa`, che viola la regola dell'inglese. `itToYmd` accetta `31/04/2026` e, su input illeggibile, cancella la data senza avvisare.
- **D-13** `portfolio.html:552-554`: "Custom range" usa due `<input type="date">` nativi, senza vincolo d'ordine.
- `cg-date-picker` (`js/cg-controls.js:103-276`) mostra e legge `dd/mm/yyyy` e `mm/yyyy` fissi (`js/lib/cg-controls-calc.js:98-133`). Il placeholder è `dd/mm/yyyy`.
- Gli stili del picker esistono solo in `css/costgrid.css`, e `js/cg-controls.js` è caricato solo da `costgrid.html`.
- Nel resto dell'interfaccia la visualizzazione delle date è già mista: `cgFmtMonth` usa lo stile `en-GB` ("11 May 2026"), mentre portfolio e project-config usano `en-US` ("May 2026").
- Le tavole del redesign di project-config (`docs/superpowers/design/config-project/*.jpg`, non ancora committate) mostrano Start/End come "Dec 2025", con l'icona calendario. Il periodo del task compare come "Dec 1, 2025" – "Dec 31, 2026" su desktop e come un unico campo "Dec 1, 2025 – Dec 31, 2026" su smartphone.

## Comportamento atteso

- Ogni campo data editabile dei form usa un solo controllo condiviso. Il form vincola l'ordine (fine ≥ inizio) con la regola di C1.
- **Decisione dell'utente, 2026-10-24:** il testo digitato e mostrato è in un **formato non ambiguo**, con il mese in lettere, per esempio `Dec 1, 2025` e `Dec 2025`, coerente con le tavole. Non dipende dalla lingua del browser.
- Un valore rifiutato produce un messaggio, non un ritorno silenzioso al valore precedente.
- Il placeholder e ogni testo visibile all'utente sono in inglese.

## Decisioni aperte per il `/brainstorming`

1. **Il datepicker resta?** Domanda posta dall'utente. Le alternative:
   - (a) calendario a comparsa più campo digitabile nel formato non ambiguo;
   - (b) solo calendario, con il campo in sola lettura;
   - (c) solo campo digitabile, senza calendario.

   Le tavole mostrano l'icona calendario sui campi mese.
2. **Quali scritture accetta il parser.** Solo il formato canonico (`Dec 1, 2025`), oppure anche varianti come `1 Dec 2025`, ISO `2026-12-01` o il nome del mese per intero. In ogni caso il valore va sempre riformattato in quello canonico.
3. **Rapporto con il redesign di project-config**, il ciclo successivo:
   - (a) C2 sostituisce i campi sul markup attuale, e il redesign eredita il controllo;
   - (b) C2 tocca solo il controllo, costgrid e portfolio, e i campi di project-config passano al redesign.

   In entrambi i casi il controllo deve poter rendere le varianti delle tavole, compreso il campo intervallo unico su smartphone, se il brainstorming lo include.
4. **Dove vivono gli stili del picker:** in un foglio condiviso (`css/style.css` o un file nuovo), con gli aggiornamenti dei `?v=N` su ogni pagina che lo carica.
5. **Costgrid cambia formato anch'esso**, perché il componente è condiviso. Bisogna decidere se cambiano anche le visualizzazioni in sola lettura (`cgFmtMonth`, `pbFmtMonth`, `monthLabel`) o solo i campi.

## Vincoli

- Il formato per digitare e visualizzare passa per l'unico punto del modulo date di C1. Il componente non contiene logica di data propria.
- Lo storage e l'API non cambiano.
- PROCESS.md §6.6.1: la cartella `docs/superpowers/design/config-project/` va letta per intero e mappata tavola per tavola. Ogni controllo nativo lasciato come fallback va dichiarato campo per campo e confermato dall'utente.
- Le tavole vanno committate prima di aprire il ciclo, se il ciclo le usa (PROCESS.md, nota sull'handoff di design).
- Accessibilità: tastiera e `aria-label` come oggi in `cg-date-picker`.
- `?v=N` aggiornati per ogni file versionato toccato.

## Criteri di accettazione

1. Nessuna pagina contiene `<input type="date">`, `<input type="month">` o un input di testo usato come data. Lo verifica un guard test, che estende quello di C1.
2. Digitando `Dec 1, 2025` nel campo giorno si ottiene il valore di storage del 1° dicembre 2025. Un testo illeggibile o fuori `min`/`max` mostra un messaggio e non cambia il valore. Lo verificano i test del componente.
3. Nessun campo data mostra o accetta un formato numerico con giorno e mese entrambi a due cifre (`dd/mm`, `mm/dd`). Lo verifica un test.
4. Su project-config (o sul suo redesign, secondo la decisione 3) e sul range del portfolio non si può confermare una fine precedente all'inizio.
5. Gli shot di `scripts/shoot.mjs` delle pagine toccate sono letti e confrontati con le tavole, quando esistono.

## Scope escluso esplicitamente

- La validazione lato server e il modulo date (C1).
- Il vincolo "task dentro il periodo" (C3), anche se il controllo lo renderà possibile tramite `min`/`max`.
- Il resto del redesign di project-config (sezioni, layout, sidebar delle sezioni), tranne quanto la decisione 3 non vi includa.
- Gli item 3 e 5 del backlog.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
