# Frontend test infrastructure — Ciclo 1 (pilota cfg-parse)

**Data:** 2026-07-01
**Contesto:** primo passo di una migrazione pianificata a Vue 3. Obiettivo di lungo periodo: separare logica pura da manipolazione DOM, così che i futuri componenti Vue chiamino funzioni già testate. Questo ciclo introduce l'infrastruttura di test (vitest + jsdom) ed estrae la prima fetta di funzioni pure a basso rischio come caso pilota del pattern.

## 1. Isolamento toolchain (dev-only, zero impatto runtime)

Il vincolo "no build step" del progetto si applica al **runtime servito da nginx**, non alla toolchain di sviluppo. Distinzione da preservare esplicitamente:

- `package.json` alla radice del repo, separato da `api/package.json` (che resta per le dipendenze dell'API). `node_modules/` in `.gitignore`.
- I test girano da terminale locale (`npm test`), non in un container Docker — a differenza del servizio `test` esistente in `docker-compose.yml` (integration test API contro DB reale), qui non serve un container perché i test toccano solo funzioni pure in jsdom, senza DB/API.
- Nessuna modifica a `docker-compose.yml` in questo ciclo.

### nginx: deny esplicito (non solo assenza di riferimento)

`nginx.conf` monta `./:/usr/share/nginx/html:ro` — l'**intera** cartella di progetto, non un sotto-path. `node_modules/`, se presente su disco, sarebbe fisicamente servibile a meno di un deny esplicito: `location /` è protetta da `auth_request` ma resta raggiungibile da qualunque utente autenticato, e il pattern pubblico `^/(css|js)/` è servito **senza** auth.

Punto critico aggiuntivo: i file di test colocati (`js/lib/*.test.js`) vivono dentro `js/`, che è già pubblico — sfuggirebbero a un deny generico su `node_modules`/`package.json`/cartella test. Serve un pattern dedicato per `*.test.js`/`*.spec.js`.

nginx valuta i blocchi `location` per specificità (match esatto > regex nell'ordine di apparizione > prefisso più lungo), non per ordine testuale puro — quindi i blocchi regex di deny vanno scritti con `location ~ ...` posizionati in modo da avere precedenza sul blocco prefisso `location ~ ^/(css|js)/`. Blocchi da aggiungere a `nginx.conf`, prima del blocco `^/(css|js)/`:

```nginx
# ── DEV-ONLY TOOLCHAIN — never served ──────────────────────────────────────
location ~ /node_modules/ { deny all; return 404; }
location ~ \.test\.js$    { deny all; return 404; }
location ~ \.spec\.js$    { deny all; return 404; }
location = /package.json         { deny all; return 404; }
location = /package-lock.json    { deny all; return 404; }
location = /vitest.config.js     { deny all; return 404; }
```

### CLAUDE.md

La frase "No package manager, no bundler, no tests, no linter on the frontend" va riscritta per riflettere: il vincolo "no bundler" sul **runtime** resta invariato; "no tests" diventa obsoleto — esiste ora una test toolchain (vitest + jsdom) isolata dal runtime e mai servita da nginx (vedi deny rules sopra).

## 2. Formato modulo + ordine di caricamento

Moduli estratti in `js/lib/` come ES module nativi (`export function ...`), con un bridge finale verso `window` per i caller classici esistenti:

```js
// js/lib/cfg-parse.js
export function cfgParseHours(str) { ... }
export function cfgFmtHours(n) { ... }
export function roundToQuarterHour(n) { ... }

// bridge per i caller classici esistenti — rimuovibile quando migrati a import diretto
window.cfgParseHours     = cfgParseHours;
window.cfgFmtHours       = cfgFmtHours;
window.roundToQuarterHour = roundToQuarterHour;
```

Caricato nelle pagine con:
```html
<script type="module" src="js/lib/cfg-parse.js"></script>
<script src="js/config-form.js"></script>  <!-- invariato, legge window.cfgParseHours -->
```

Vitest importa lo stesso file via `import { cfgParseHours } from '../js/lib/cfg-parse.js'` — nessun adattatore, nessuna interop CJS/ESM.

### Regola sull'ordine di caricamento (da documentare in CLAUDE.md, vale per tutte le estrazioni future)

Gli script `type="module"` sono sempre deferred: eseguono dopo il parsing HTML, prima di `DOMContentLoaded`, indipendentemente dalla loro posizione nel documento. Gli script classici non-deferred (`core.js`, `config-form.js`, ecc.) eseguono immediatamente al parsing, nell'ordine documentato in CLAUDE.md.

Conseguenza pratica: **una funzione bridgata su `window` può essere letta solo dentro handler asincroni o callback registrate per `DOMContentLoaded`, mai a livello top-level di uno script classico** (perché in quel momento il modulo potrebbe non aver ancora eseguito il bridge). Verificato per questo ciclo: `cfgParseHours`/`cfgFmtHours` sono chiamate solo dentro handler `focusin`/`focusout`/save — mai a livello di parsing — quindi nessun conflitto d'ordine per questa estrazione.

Se moduli futuri avranno bisogno di importarsi a vicenda, useranno `import` ES nativo tra loro (non il bridge `window`), che è risolto indipendentemente dall'ordine dei tag `<script>` nella pagina.

## 3. Struttura file e convenzione test

- `js/lib/cfg-parse.js` — modulo estratto
- `js/lib/cfg-parse.test.js` — test colocato (convenzione vitest standard; mirror per moduli futuri: `js/lib/<nome>.js` + `js/lib/<nome>.test.js`)
- `vitest.config.js` alla radice — `environment: 'jsdom'` (non necessario per queste funzioni pure, ma predispone l'infra per i moduli futuri che toccheranno il DOM)
- `package.json`: script `test` (run singolo) e `test:watch`

## 4. Verifica preliminare: cfgFmtHours vs. l'arrotondamento a config-form.js:848 NON sono la stessa operazione

Letto `config-form.js:825-849` (blocco reforecast) e `config-form.js:932-945` (`cfgFmtHours`/`cfgParseHours`):

- **`config-form.js:848`**: `newPlanning[ym] = Math.round(newPlanning[ym] * 4) / 4;` — arrotonda al quarto d'ora un valore numerico e lo riscrive nell'oggetto `newPlanning`, usato internamente dal calcolo di reforecast. Nessuna formattazione, nessun guard, nessuna conversione a stringa.
- **`cfgFmtHours` (riga 932-938)**: guard `!(n > 0)` → stringa vuota; poi arrotonda al quarto d'ora (`Math.round(n * 4) / 4`); poi **formatta per la UI** (`String(r)` se intero, altrimenti `r.toFixed(2)`).

Sono due funzioni con responsabilità diverse (una fa solo matematica su un valore intermedio, l'altra fa matematica + presentazione), che **condividono solo la sotto-espressione di arrotondamento**. Collassarle in un unico `roundToQuarterHour` che sostituisca entrambe cambierebbe il comportamento del sito a riga 848 (introdurrebbe un guard/formattazione che oggi non esiste) — non va fatto.

**Decisione:** estrarre un helper minimo `roundToQuarterHour(n)` contenente solo `Math.round(n * 4) / 4`, riusato:
- internamente da `cfgFmtHours` (che resta responsabile di guard + formattazione, ora chiamando l'helper per il solo arrotondamento);
- direttamente al posto dell'espressione inline a `config-form.js:848` (nessun cambio di comportamento, stesso risultato numerico, solo niente più duplicazione della costante `4`).

`cfgFmtHours` e `cfgParseHours` restano funzioni distinte con le loro responsabilità attuali — nessuna fusione oltre l'estrazione della sotto-espressione condivisa.

## 5. Flusso di estrazione (test-first, characterization)

Per ciascuna delle tre unità (`cfgParseHours`, `cfgFmtHours`, `roundToQuarterHour`):

1. **Characterization test scritto PRIMA di qualsiasi spostamento di codice**, contro le funzioni così come sono oggi in `config-form.js` (require/copy temporaneo o test diretto sul file esistente), per catturare il comportamento attuale — inclusi i bug storici già corretti:
   - REG-13: `cfgParseHours('22.25')` → `22.25`, non `2225` (verifica che il parsing bypassi `cfgParseMoney` e la sua logica de-DE che strippa `.`)
   - REG-14: arrotondamento quarto d'ora, es. `10.125` → `10.25`
   - Comportamento di **entrambi** i siti originali (riga 848 e `cfgFmtHours`) va coperto **indipendentemente** prima di qualsiasi deduplicazione, per dimostrare che la sotto-espressione condivisa produce risultati identici nei due contesti e che l'estrazione dell'helper non introduce cambi di comportamento.
2. Spostare le tre funzioni in `js/lib/cfg-parse.js` (formato ES module + bridge, vedi §2).
3. Sostituire l'espressione inline a `config-form.js:848` con una chiamata a `roundToQuarterHour(...)`.
4. Aggiornare le pagine HTML che caricano `config-form.js` aggiungendo il tag `<script type="module" src="js/lib/cfg-parse.js">` prima del tag classico esistente.
5. Rimuovere le definizioni originali di `cfgParseHours`/`cfgFmtHours` da `config-form.js` (le chiamate nel file restano invariate, ora risolte su `window` via bridge).
6. Eseguire i characterization test — devono passare senza modifiche, a conferma che l'estrazione non ha alterato il comportamento.
7. Verifica manuale in browser: inserire ore frazionarie (es. 22.25) in un campo planning, salvare, ricaricare, riaprire — il valore deve restare 22.25; lanciare il reforecast su un progetto con ore frazionarie di carry-over e verificare l'arrotondamento al quarto d'ora nei mesi futuri.

## Fuori scope per questo ciclo

Come cicli successivi separati, ciascuno con il proprio spec:
- Calcolo budget task/fase/totale (`cgComputeTaskTotals`/`cgComputePhaseTotals`/`cgComputeGrandTotals` in `js/costgrid.js`) — REG-07
- Catena di fallback rate (ratecard override → `role.rateOverrides[currency]` → EUR × factor) in `js/costgrid.js` — REG-11
- Risoluzione `linkedProjects` con `projectId` stale — richiede prima un refactoring di deduplicazione: la stessa logica di match è oggi duplicata inline in almeno 5 punti di `js/pipeline-board.js` (righe 64, 73, 358, 429, 675), non è una funzione a sé stante
