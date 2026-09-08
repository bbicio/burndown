# Design — Rinomina pulsanti actuals in timesheets.html

Brief: `docs/superpowers/briefs/2026-09-08-timesheets-actuals-buttons-relabel-brief.md`

## Overview

Allinea le etichette dei pulsanti di gestione actuals in `timesheets.html` a quelle già introdotte in `portfolio.html`/`project-config.html` in cicli precedenti. Tre modifiche testuali, nessun cambio di logica, funzione, o binding.

## Modifiche

1. **`timesheets.html:131`**: `⬇ XLSX` → `⬇ Download actuals`. Il binding `@click="downloadXlsx(r)"` resta invariato — solo il testo visibile del pulsante cambia.
2. **`timesheets.html:138`**: `🗑 Delete all` → `🗑 Delete actuals`. Il binding `@click="deleteCode(r)"` resta invariato.
3. **`timesheets.html:57`** (testo di aiuto): `<strong>Delete all</strong> permanently removes every timesheet row for that project from the database.` → `<strong>Delete actuals</strong> permanently removes every timesheet row for that project from the database.` — coerenza con la nuova etichetta del pulsante.

`👁 View` (riga 127) resta invariato. Nessun pulsante di upload/"Load Actuals" viene aggiunto — la pagina non ne ha mai avuto uno (l'upload avviene da "Load XLS" in Project Reporting, come già indicato nello stesso testo di aiuto), requisito già soddisfatto senza modifiche.

## Error handling

Non applicabile — nessuna logica toccata, solo stringhe statiche nel template.

## Testing

Nessun test automatico applicabile (nessuna logica JS/Vue testabile viene modificata, solo testo del template). Verifica manuale in browser:
- Le tre stringhe elencate sopra risultano effettivamente cambiate.
- Click su `⬇ Download actuals` scarica ancora l'XLSX corretto (comportamento invariato).
- Click su `🗑 Delete actuals` cancella ancora tutti gli upload del codice progetto dietro conferma (comportamento invariato).
- `👁 View` invariato.

## Explicitly excluded scope

(riportato dal Brief)

- Non si tocca il `confirm()` nativo del browser in `deleteCode()` (`timesheets.html:315`) — preesistente, non richiesto in questo giro.
- Nessun'altra modifica alla UI (filtri, colonne, selettore anno pipeline).
