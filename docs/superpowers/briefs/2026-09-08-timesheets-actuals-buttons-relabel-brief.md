# Brief — timesheets.html: allineare le etichette dei pulsanti actuals a portfolio.html

## Current behavior

**Tabella riassuntiva** (`timesheets.html:124-140`), azioni per riga:
- `👁 View` (`viewRows(r)`) — apre il modal con il dettaglio delle righe.
- `⬇ XLSX` (`downloadXlsx(r)`) — scarica l'export XLSX.
- `🗑 Delete all` (`deleteCode(r)`) — cancella tutti gli upload/righe per quel codice progetto, dietro conferma tramite `confirm()` nativo del browser (`timesheets.html:315`).

**Nessun pulsante di upload/"Load Actuals" esiste già oggi su questa pagina** — il testo di aiuto (`timesheets.html:54-59`) rimanda esplicitamente a "Load XLS" nella vista Project Reporting come unico punto di caricamento; questa pagina è solo di gestione (view/export/delete).

**Testo di aiuto correlato** (`timesheets.html:57`): `<strong>Delete all</strong> permanently removes every timesheet row for that project from the database.` — cita l'etichetta attuale del pulsante.

## Expected behavior

1. Rinominare `⬇ XLSX` → `⬇ Download actuals` (solo etichetta, nessun cambio di comportamento — resta `downloadXlsx(r)`).
2. Rinominare `🗑 Delete all` → `🗑 Delete actuals` (solo etichetta, nessun cambio di comportamento — resta `deleteCode(r)`).
3. `👁 View` invariato.
4. "Load Actuals" resta assente da questa pagina (requisito già soddisfatto oggi, nessuna modifica necessaria).
5. Aggiornare il testo di aiuto (`timesheets.html:57`) da `<strong>Delete all</strong> permanently removes...` a `<strong>Delete actuals</strong> permanently removes...`, per coerenza con la nuova etichetta.

## Constraints

- Nessun cambio di comportamento/funzionalità — solo etichette e il testo di aiuto correlato.
- Nessun cambio agli URL/nomi delle funzioni JS (`downloadXlsx`, `deleteCode`).

## Acceptance criteria

- [ ] Il pulsante precedentemente `⬇ XLSX` mostra `⬇ Download actuals`.
- [ ] Il pulsante precedentemente `🗑 Delete all` mostra `🗑 Delete actuals`.
- [ ] Il pulsante `👁 View` resta invariato.
- [ ] Nessun pulsante di upload/"Load Actuals" compare su questa pagina.
- [ ] Il testo di aiuto cita `<strong>Delete actuals</strong>` invece di `<strong>Delete all</strong>`.
- [ ] Nessun'altra funzionalità di `viewRows`, `downloadXlsx`, `deleteCode` cambia.

## Explicitly excluded scope

- Non tocco il `confirm()` nativo del browser in `deleteCode()` (`timesheets.html:315`) — violazione nota della convenzione del progetto (no `alert`/`confirm` nativi), preesistente, non richiesta in questo giro.
- Non tocco il resto della UI (filtri, colonne, selettore anno pipeline).
