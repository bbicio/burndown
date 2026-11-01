# Brief — finding valute, ciclo f1: i campi soldi lato client

**Brief started:** 2026-11-01 19:45
**Tipo:** audit-fix (Scenario 3). Raggruppamento e ordine confermati dall'utente il 2026-11-01.
**Origine:** cold review `docs/superpowers/audits/2026-11-01-currency-c1-c4-cold-review.md` (F-04) e i follow-up di c2/c3 raggruppati per tema nell'handoff `docs/superpowers/briefs/2026-11-01-currency-c4-and-findings-handoff.md` (punto 3). Righe di `docs/BACKLOG.md`: **B-196, B-197, B-204, B-205, B-210, B-216**.
**Perché insieme:** ogni voce passa per `readMoneyInput`/`formatMoneyInput` (`js/lib/money.js`) o per i loro chiamanti nei campi soldi delle pagine. B-197 non era nell'elenco dell'handoff, ma riguarda la stessa funzione di B-196.
**Sequenza:** f1 (questo) → f2 validazione server → f3 custom-ness e tasso della versione → f4 rate card.

## Problema

Dal ciclo c2 i campi tariffa e POT leggono il testo con `readMoneyInput`. Restano però diversi problemi:
- la lettura è troppo rigida in un caso e troppo permissiva in un altro;
- il formato al focus arrotonda in silenzio i valori salvati;
- la regola "uno 0 salvato si apre come `'0'`" è ripetuta a mano in ogni campo;
- i tre campi PTC e phasing usano ancora `parseMoney`, che non rifiuta niente.

## Comportamento attuale

Evidenze e comandi stanno nelle righe del backlog; vanno rieseguiti prima della Spec.
- **B-196:** `readMoneyInput` rifiuta il raggruppamento indiano. Per INR ≥ 1,00,000 il testo che `formatMoney` stesso scrive al blur (`₹ 1,23,456.00`) viene rifiutato al salvataggio. Probe del 2026-11-01: `NaN`.
- **B-197:** `stripDecoration` toglie ogni spazio e ogni copia del simbolo o del codice ISO prima di validare. Così `1 50` e `15€0` in EUR valgono 150 (probe del 2026-11-01: `150 150`), e un separatore delle migliaia a spazio (fr-FR, sv-SE) salta il controllo dei gruppi da 3 cifre.
- **B-204:** al focus `formatMoneyInput` arrotonda ai decimali della valuta un valore salvato che ne ha di più (`108.7654` → `108,77`, probe del 2026-11-01). Il salvataggio successivo manda allora un valore che l'utente non ha toccato: in `project-config.html`, nel form di `master-roles.html` e negli override della rate card (B-210).
- **B-205:** l'eccezione "uno 0 salvato si apre come `'0'`" è scritta a mano in `costgrid.html` (`onRateFocus`), `master-roles.html`, `master-pipelines.html` e `master-clients.html` (`amountText`, `onRcFocus`, B-210).
- **B-210:** rifiniture della modale rate card in `master-clients.html`:
  - il timer di 3 secondi del messaggio di successo può cancellare il messaggio di un salvataggio successivo;
  - `loadAll` carica `Api.roles.list()` e `this.roles`, che la modale non usa più;
  - le voci B-204/B-205 di questa modale.
- **B-216:** il PTC del cost grid (`costgrid.html`, `parseMoneyInput`) e il PTC e il phasing di `project-config.html` leggono il testo con `parseMoney`, che dà 0 su un testo illeggibile: nessun rifiuto, nessun esempio di formato.

**Causa:** c2 ha introdotto `readMoneyInput` per i soli campi tariffa e POT, partendo da `stripDecoration`, ereditata da `parseMoney`. Le regole di contorno (lo 0 salvato, l'arrotondamento al focus) sono rimaste nei singoli campi invece che nel modulo.

## Comportamento atteso

- `readMoneyInput` rilegge sempre il testo che `formatMoney` scrive per la stessa valuta, raggruppamento indiano compreso.
- `readMoneyInput` rifiuta un testo con il simbolo o uno spazio in mezzo alle cifre, e applica il controllo dei gruppi anche quando il separatore è uno spazio.
- Aprire e lasciare un campo senza modificarlo non cambia il valore salvato, anche se ha più decimali di quanti la valuta ne ammetta. Come trattare quel valore (mostrarlo intero, segnalarlo, rifiutarlo al salvataggio) lo decide il brainstorming.
- La regola dello 0 salvato vive in un solo punto di `money.js`; i campi la chiamano.
- I campi PTC e phasing usano `readMoneyInput`, con il rifiuto e l'esempio di formato come i campi tariffa.
- Il messaggio di un salvataggio della rate card non viene cancellato dal timer di un salvataggio precedente.

## Vincoli

- Le regole di CLAUDE.md, "Money formatting and parsing", restano valide: nessun `Intl.NumberFormat` fuori dal modulo, valuta della riga sempre passata, numeri e non stringhe verso il server.
- `js/lib/money.js` e ogni file toccato con `?v=N` vanno aggiornati in tutti i riferimenti. Ricorda B-200: `js/lib/costgrid-calc.js` importa `money.js?v=3` con la versione scritta nel file, quindi anche lui va aggiornato su `costgrid.html` e `pipeline.html`.
- I file HTML hanno fini riga miste CRLF/LF: modifica con il tool Edit e controlla i CR nel blob.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un test verifica che `readMoneyInput(formatMoney(x, c), c)` restituisca `x` per EUR, USD, CHF, JPY e INR, con valori sopra 1,00,000.
2. Un test verifica che `1 50` e `15€0` in EUR diano `NaN`, e che un importo fr-FR con gruppi sbagliati venga rifiutato.
3. Un test verifica che focus e blur su un valore con più decimali della valuta, senza digitare, lascino invariato il valore del modello.
4. `grep` della regola dello 0 salvato nelle pagine non trova più copie a mano: un test lo pinna.
5. Il PTC del cost grid e PTC/phasing di `project-config.html` rifiutano un testo illeggibile con `moneyFormatExample`; un test lo pinna.
6. Le righe B-196, B-197, B-204, B-205, B-210 e B-216 di `docs/BACKLOG.md` sono chiuse, ciascuna con il comando rieseguito.
7. `npm test` passa.

## Scope escluso esplicitamente

- La validazione server di PTC e phasing (B-185, ciclo f2).
- B-201 (lettura a ogni tasto nel cost grid), B-203 (testo non formattato all'apertura dei form), B-206 (rifiniture cosmetiche e dei test), B-199 (regex del money-guard), B-198 (prestazioni di `currencyInfo`).
- La sostituzione dell'intero set della rate card (B-209, ciclo f4).
- B-012, la lettura rigida di `parseMoney` in sé: questo ciclo sposta i campi su `readMoneyInput`, non cambia `parseMoney`.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
