# Brief — finding valute, ciclo f4: la rate card sostituisce l'intero set senza riconoscere una copia vecchia

**Brief started:** 2026-11-01 19:45
**Tipo:** evoluzione (Scenario 2), nata dai follow-up del ciclo c3. **Perché non è un audit-fix come f1/f2:** B-209 e B-207 chiedono due decisioni di design che nessuna regola esistente risolve:
- come il salvataggio della rate card riconosce una copia vecchia;
- cosa significa, se significa qualcosa, una rate card senza cliente.

B-211 e B-212 sono pulizia meccanica nelle stesse route e negli stessi test.
**Raggruppamento e ordine** confermati dall'utente il 2026-11-01 (l'handoff `docs/superpowers/briefs/2026-11-01-currency-c4-and-findings-handoff.md` proponeva B-209 da solo, con B-211/B-212 "agganciabili").
**Origine:** righe di `docs/BACKLOG.md` **B-209, B-207, B-212, B-211**. La cold review `docs/superpowers/audits/2026-11-01-currency-c1-c4-cold-review.md` cita B-209 come l'unico modo rimasto per riscrivere le righe di B-208 (chiusa).
**Perché insieme:**
- B-212 è la stessa funzione di B-209: il `PATCH /api/ratecards/:id/entries` (`api/src/routes/config.js`), con un INSERT per voce e i `roleId` duplicati accettati.
- B-207 sta nelle stesse route (`POST /api/ratecards`, `POST /api/ratecards/clone`).
- B-211 sono i test RC di quelle route (`test-api.js`, `js/lib/master-clients-ratecard-guard.test.js`).

**Sequenza:** f1 campi client → f2 validazione server → f3 custom-ness e tasso della versione → f4 (questo).

## Problema

- **B-209:** il `PATCH …/entries` cancella le voci assenti dal body e riscrive le altre, senza sapere da quale stato è partito il client. Ne seguono tre casi:
  - due admin sulla stessa rate card perdono le modifiche l'uno dell'altro;
  - un browser ancora sulla `master-clients.html` in cache, precedente a c3, cancella le voci EUR 0 volute e trasforma NULL + override in 0 (il caso che riaprirebbe B-208);
  - un ruolo cancellato a modale aperta fa rifiutare l'intero salvataggio ("Unknown role in the entries").
- **B-207:** `POST /api/ratecards` senza `clientId` crea ancora una rate card senza cliente, che nessun consumatore legge come default dell'agenzia. `POST /api/ratecards/clone` copia la `hourly_rate` (ora anche `NULL`) di quella rate card in una rate card cliente senza i suoi `rate_overrides`, quindi una voce clonata può non esprimere niente.
- **B-212:** un INSERT per voce invece di uno solo con `unnest`; tre copie di `UUID_RE` in `api/src/routes`; `roleId` duplicati nel body accettati, con l'ultimo che vince.
- **B-211:**
  - quando la creazione del ruolo fallisce, il ramo che salta i test riporta solo RC-05/RC-06, e RC-07..RC-13 spariscono dal conteggio;
  - `testRatecards` chiama `ensureTestCurrencies()` una seconda volta;
  - il guard di `master-clients.html` riconosce solo il letterale `this.rc.` e controlla quasi niente quando il corpo non ha `await`.

## Comportamento attuale

Va riletto nel codice prima del brainstorming, e i comandi di evidenza delle quattro righe vanno rieseguiti.
- Unico chiamante della creazione: la modale di `master-clients.html`, che crea la rate card del cliente al primo accesso con `Api.ratecards.create(client.name, client.id)`.
- Nessun chiamante del clone: `Api.ratecards.clone` esiste in `js/api.js` ma nessuna pagina lo usa (grep del 2026-11-01).
- DB principale al 2026-11-01: 1 rate card, nessuna senza cliente (`select count(*) filter (where client_id is null), count(*) from ratecards` → `0|1`), 8 voci.

## Alternative da valutare nel brainstorming

Riconoscere una copia vecchia (B-209):
1. **Token di versione sulla rate card** (per esempio una colonna `updated_at` o `version`). Il client lo manda e il server rifiuta con un codice dedicato se è cambiato. La sostituzione dell'intero set resta.
2. **Salvataggio voce per voce** (`PUT`/`DELETE` di una singola voce). Niente più cancellazioni implicite, ma i salvataggi diventano tanti e la modale cambia flusso.
3. **Il client manda anche lo stato di partenza** e il server applica solo le differenze. Nessuno schema nuovo, ma il server diventa più complesso.

Ruolo cancellato a modale aperta, sotto ciascuna alternativa: ignorare la voce, oppure rifiutare con un messaggio che nomina il ruolo.

La rate card senza cliente (B-207):
1. **Eliminarla:** `POST /api/ratecards` richiede `clientId`; il clone viene rimosso (nessun chiamante) oppure clona da un'altra rate card cliente copiando anche gli override.
2. **Darle un significato:** diventa il default dell'agenzia, letto dai consumatori al posto di `roles.hourly_rate`. È un cambiamento di prezzi, molto più grande, e probabilmente fuori da questo ciclo.

## Comportamento atteso

- Un salvataggio partito da una copia vecchia della rate card non cancella né riscrive in silenzio voci che l'utente non ha visto.
- Un browser con la pagina precedente a c3 in cache non può più scrivere uno 0 al posto di NULL + override.
- Nessuna route crea o clona una rate card che nessun consumatore legge, oppure quella rate card ha un significato scritto nella Spec.
- `roleId` duplicati nel body vengono rifiutati; le voci si scrivono con una sola istruzione; `UUID_RE` ha una sola definizione.
- I test RC riportano sempre lo stesso numero di casi, saltati compresi.

## Vincoli

- Le regole delle voci introdotte da c3 restano valide: `ratecardEntryError`, `hourly_rate` NULL = default dell'agenzia, override per valuta.
- Una migrazione va numerata in `api/src/db/migrations/`, applicata a mano, e annotata in `docs/db/migrations.md`. Prima di applicarla al DB principale: backup (`scripts/backup-db.sh`) e conferma dell'utente (CLAUDE.md, Infrastructure safety).
- `master-clients.html` ha fini riga miste CRLF/LF: modifica con il tool Edit e controlla i CR nel blob (incidente di c3, `8d63f80`).
- Le pagine `.html` non sono versionate: la pagina in cache è il caso stesso di B-209, quindi la protezione deve stare sul server.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

Da rifinire nella Spec in base alle alternative scelte. Come minimo:
1. Un test in `test-api.js` verifica che un salvataggio partito da uno stato superato venga rifiutato, oppure applichi solo le differenze, secondo l'alternativa scelta, senza perdere le voci dell'altro salvataggio.
2. Un test verifica che un body con un `roleId` duplicato sia rifiutato.
3. Un test verifica il comportamento scelto per la creazione senza cliente e per il clone.
4. Un test verifica il comportamento scelto per un ruolo cancellato a modale aperta.
5. Il conteggio dei test RC è lo stesso con e senza fallimento della creazione del ruolo.
6. Le righe B-207, B-209, B-211 e B-212 di `docs/BACKLOG.md` sono chiuse, ciascuna con il comando rieseguito.
7. Verifica nel browser: due schede sulla stessa rate card, la seconda che salva dopo la prima, mostrano il comportamento scelto.
8. `npm test`, i test `node:test` di `api/` e il profilo di integrazione passano.

## Scope escluso esplicitamente

- La rate card senza cliente come default dell'agenzia che cambia i prezzi (alternativa 2 di B-207): se il brainstorming la sceglie, diventa un Brief a sé.
- L'export CSV della rate card (nota fuori perimetro della cold review).
- Le rifiniture della modale (B-210, ciclo f1) e il formato degli importi (ciclo f1).
- B-193 (type parser NUMERIC).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
