# Handoff — audit: allineare la gestione delle valute nei form

**Scritto:** 2026-10-29, dopo il merge del ciclo POT reference version + version rate (`bed463c`, report `docs/superpowers/reports/2026-10-29-pot-reference-version-rate-finish-cycle.md`).
**Per:** la sessione che apre il prossimo lavoro.
**Sostituisce:** il passo 2 di `docs/superpowers/briefs/2026-10-29-pot-versions-rates-and-forms-audit-handoff.md`, il cui scope era più largo (tutta la validazione dei form).

## Cosa si fa

Si lancia `/domain-audit` con uno scope **già deciso dall'utente il 2026-10-29**: allineare la gestione delle valute in tutti i form dell'app. È l'item 5 della memoria `project_manual_test_findings_money_cleanup.md`. Solo verifica; i cicli di fix nascono dopo, con `audit-to-brief`.

Il resto dell'item 3 (obbligatorietà, lunghezze, unicità dei campi non monetari) **non** è in questo audit e resta aperto nella memoria.

## La decisione presa

CLAUDE.md, sezione "Money formatting and parsing", oggi esclude dalla regola "gli input tariffa `type="number"` e gli input ore". **L'utente ha deciso che l'eccezione va tolta per le tariffe:** una tariffa è un importo, ha una valuta e finisce nei totali. Ogni tariffa e ogni importo modificabile in un form deve seguire la stessa regola degli importi: `formatMoneyInput` al focus, `parseMoney` al blur, poi `formatMoney`, con il locale della propria valuta (`js/lib/money.js`).

La modifica a CLAUDE.md la fa il ciclo di fix che tocca il codice, non l'audit.

## Direzione proposta per le tre domande aperte

Proposte da Claude nella stessa conversazione; l'utente ha confermato lo scope, non ciascuna risposta. Lo skill le rimette sul tavolo quando concorda lo scope.

1. **Quale valuta formatta ogni tariffa:** quella del suo contesto. In `costgrid.html` la valuta della versione; in `master-clients.html` (rate card) la valuta della colonna; in `master-roles.html` la valuta del campo (EUR o quella del default per valuta); in `project-config.html` la valuta del progetto.
2. **Step `1` / `0.01`:** un'incoerenza, non una scelta. I decimali ammessi sono quelli della valuta (2 per EUR/USD/CHF, 0 per JPY), come già fa `money.js`.
3. **Importo del POT** (`master-pipelines.html`): sotto la regola, in EUR.

**Fuori per definizione:** le ore e i tassi di cambio di `master-currencies.html` (`step="0.000001"`).

## Punto di partenza (da rieseguire, non da fidarsi)

Censimento del 2026-10-29 fatto con `grep -n 'type="number"' *.html`:

| Pagina | Campo | Oggi |
|---|---|---|
| `costgrid.html` | tariffa oraria per ruolo (`cg-rate-input`, `onRateChange`) | `type="number" min="0" step="1"`: niente decimali |
| `master-roles.html` | "Default rate (€/h)" e "Default rate (<simbolo>/h)" per valuta | EUR `step="1"`, le altre valute `step="0.01"` |
| `master-clients.html` | tariffe della rate card (`rc-override-rate`, `rc-client-rate`) | `step="0.01"` e `step="1"` nella stessa tabella |
| `project-config.html` | `res.hourlyRate` delle risorse | `type="number" min="0" step="1"` |
| `master-pipelines.html` | importo del POT (form nuovo/modifica) | `type="number" min="0" step="1000"` |

Già conformi, da usare come riferimento: gli input importo di `costgrid.html` e `project-config.html` (PTC, phasing), `grep -ln "formatMoneyInput" *.html`.

Il `grep` non vede tutto: input generati in JS (`js/*.js`), modal iniettati, template Vue con binding diversi. L'audit cerca anche lì, e sul server controlla come le route leggono queste tariffe e importi (numero, stringa, arrotondamento, negativi).

## Da tenere separato

- **B-183** (`docs/BACKLOG.md`): l'editor del cost grid converte le tariffe EUR dei ruoli nella valuta della versione con il cambio **live** invece che con il tasso fisso della versione. Riguarda il *valore*, non il *formato*. Tocca gli stessi campi, quindi l'audit lo può includere, ma come finding a sé.
- **B-184**: controllo dati sul doppio collegamento proposta–progetto, non riguarda i form.

## Vincoli dell'audit

- Solo verifica: niente fix durante l'audit. Si chiude con la riga di `audit-to-brief` dello skill, senza invocarlo.
- Il report va in `docs/superpowers/audits/`.
- Le date sono fuori scope (cicli C1..C4). Un difetto trovato per caso fuori dallo scope va in `docs/BACKLOG.md`.
- Il ciclo appena chiuso ha reso il tasso della versione una decisione del server (`api/src/lib/version-rate.js`); l'audit non lo rimette in discussione.
