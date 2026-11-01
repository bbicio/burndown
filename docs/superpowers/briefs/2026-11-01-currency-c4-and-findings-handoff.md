# Handoff — valute: ciclo c4, poi i finding aperti

**Scritto:** 2026-11-01, dopo il merge del ciclo c3 rate card (`3e37f54`, report `docs/superpowers/reports/2026-10-30-currency-c3-ratecard-finish-cycle.md`, docs `077f01a`).
**Per:** la sessione che apre il prossimo lavoro.

## Dove siamo

I quattro cicli nati dall'audit `docs/superpowers/audits/2026-10-29-currency-forms-audit.md`:

| Ciclo | Stato |
|---|---|
| c1 validazione server (`MONEY_RULE`) | mergiato `5d2c1bc` |
| c2 campi tariffa/POT su `money.js` | mergiato `0d3aa48` |
| c3 rate card del cliente (`hourly_rate` nullable, migrazione `029`) | mergiato `3e37f54`, `029` applicata sul DB principale |
| **c4 B-183** | **da fare** — esiste solo il brief |

## Ordine concordato con l'utente il 2026-10-30

1. **c4 adesso.** Brief: `docs/superpowers/briefs/2026-10-29-currency-c4-b183-version-rate-baselines-brief.md`. Prossimo passo: la Spec da quel brief (`superpowers:brainstorming`, PROCESS.md §6b). B-183: il cost grid converte le tariffe dei ruoli con il `current_rate` live della valuta, non con il `currency_rate` salvato sulla versione, quindi baseline dei ruoli e valore EUR della versione usano cambi diversi. Leggi la riga B-183 di `docs/BACKLOG.md` e rieseguine il comando prima di scrivere: le righe di codice citate possono essersi spostate.
2. **Cold review della serie c1-c4**, chiusa c4 (suggerita dall'ultima riga di ogni report di `/finish-cycle`). Può cambiare le priorità del punto 3.
3. **I finding, per tema, non uno per ciclo:**
   - **B-209 da solo**, con `/feature-brief`: il `PATCH /api/ratecards/:id/entries` sostituisce tutto l'insieme senza riconoscere una copia vecchia (due admin, pagina vecchia in cache, ruolo cancellato a modale aperta). Serve una decisione di design: token di versione sulla rate card, oppure salvataggio voce per voce.
   - **Campi soldi lato client, un ciclo:** B-196 (INR lakh non rileggibile), B-204 (decimali in eccesso arrotondati al risalvataggio), B-205 (regola "0 → `'0'`" ripetuta a mano), B-210 (rifiniture della modale rate card), B-185 (PTC e phasing ancora su `parseMoney`).
   - **Validazione server residua:** B-186 (seconda forma del body della structure `PUT`), B-207 (`POST /api/ratecards` senza cliente, clone che non copia `rate_overrides`).
   - **Pulizia:** B-211 (test) e B-212 (API), a basso rischio, agganciabili a uno dei cicli sopra.

## Fatti verificati il 2026-10-30 (da rieseguire, non da fidarsi)

- Sul DB principale `ratecard_entries` ha 8 righe in 1 rate card, nessuna con `hourly_rate` 0 o `NULL`:
  `docker exec pdash-db psql -U pdash -d pdash -Atc "select count(*) filter (where hourly_rate = 0), count(*) filter (where hourly_rate is null), count(*), count(distinct ratecard_id) from ratecard_entries"` → `0|0|8|1`.
- Quindi **B-208** (EUR 0 storici sui ruoli con solo override) riguarda 0 righe e il nuovo salvataggio non può più crearne: proposto all'utente di chiuderla con quel conteggio, **non ancora chiusa**.
- Per lo stesso motivo il rischio pratico di **B-209** oggi è basso: non blocca c4.

## Da sapere sull'ambiente

- Il ledger di esecuzione non può stare in `.superpowers/` (non è git-ignorato) e gli script SDD `task-start`/`task-done` non girano su questo host: ledger a mano nello scratchpad.
- In `high-risk` lo skip e il percorso ridotto del Gate 3 valgono solo se la review di esecuzione è stata un `/code-review` a effort high; una review fatta da un agente generico non conta, e Gate 3 rifà tre round completi.
- File misti CRLF/LF: modifica con il tool Edit o con uno script che preservi le fini riga, poi controlla i CR nel blob (`git show HEAD:<file>`); il ciclo c3 ha committato per errore `master-clients.html` intero in CRLF (corretto in `8d63f80`).

## Aggiornamento 2026-11-01 (dopo c4)

c4 mergiato `2704c47` (report `docs/superpowers/reports/2026-11-01-currency-c4-version-rate-finish-cycle.md`); **prossimo: cold review c1-c4** (solo verifica), portandoci dentro la decisione 2 della Spec c4 che non regge per le versioni salvate (tutti i ruoli si ricaricano Custom) e i follow-up B-213/B-214/B-215; poi i finding per tema come sopra, e decidere se chiudere B-208 dopo aver rieseguito il conteggio.

## Aggiornamento 2026-11-01 (dopo la cold review)

Cold review c1-c4 fatta: `docs/superpowers/audits/2026-11-01-currency-c1-c4-cold-review.md` (`810e0c1`). Il punto 3 sopra è **superato** dai quattro Brief seguenti, in quest'ordine confermato dall'utente:
1. `docs/superpowers/briefs/2026-11-01-currency-f1-client-money-fields-brief.md` — B-196, B-197, B-204, B-205, B-210, B-216 (audit-fix);
2. `docs/superpowers/briefs/2026-11-01-currency-f2-server-validation-brief.md` — B-185, B-186, B-188 (audit-fix); B-185 è la validazione server di PTC/phasing, non i campi client come diceva il punto 3 (F-04);
3. `docs/superpowers/briefs/2026-11-01-currency-f3-custom-rate-and-version-rate-brief.md` — B-195 con F-01, B-213, B-215 con F-05 (evoluzione);
4. `docs/superpowers/briefs/2026-11-01-currency-f4-ratecard-replace-and-clientless-brief.md` — B-209, B-207, B-212, B-211 (evoluzione).

Già fatto senza ciclo: B-190, B-208 e B-214 chiuse; aperta B-216; `docs/js/lib.md` corretto (F-03). **Prossimo: `/brainstorming` sul Brief f1.**
