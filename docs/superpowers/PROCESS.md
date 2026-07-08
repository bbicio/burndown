# Processo di sviluppo — burndown (PDash)

> **Stato: BOZZA.** Documenta il workflow spec-driven come applicato finora (Ciclo `/finish-cycle` mergiato su main, commit 8113b28, più i cicli in corso sull'audit Resource Planning). Da rivedere dopo la chiusura dei 3 cicli correnti e la costruzione della prima skill dedicata (`feature-brief`).
>
> Aggiornato via `/sync-docs`, ma solo quando un ciclo introduce un cambiamento reale al processo — non ad ogni esecuzione. Vedi criterio di aggiornamento in fondo al documento.

---

## 1. Scheletro comune

Ogni intervento sul codice, a prescindere dallo scenario, attraversa la stessa sequenza:

```
Brief → /brainstorming → Spec (committata) → /writing-plans → Piano (committato)
→ Esecuzione → /finish-cycle
```

| Fase | Cosa fa internamente |
|---|---|
| **Brief** | Descrizione del problema/obiettivo. Input varia per scenario (vedi §2). Non è una skill oggi — si scrive a mano in conversazione con Claude. |
| **`/brainstorming`** | Esplora alternative, pone domande di chiarimento, fissa esplicitamente lo **scope escluso**. Produce la Spec. |
| **Spec (committata)** | Documento di design: problema, comportamento atteso, vincoli, criteri di accettazione, scope escluso. Committata prima di procedere. |
| **`/writing-plans`** | Trasforma la Spec in un piano di esecuzione a step, ciascuno verificabile. |
| **Piano (committato)** | Sequenza di task eseguibili, committato prima dell'esecuzione. |
| **Esecuzione** | Subagent-driven, segue il piano passo per passo. Guardie specifiche per scenario (vedi §2). |
| **`/finish-cycle`** | Gate condizionali: `npm test` → suite Docker backend (se il diff tocca `api/`) → verifica manuale (ricerca spec/piano, sempre conferma, mai euristica) → `/code-review` (max 3 round) → merge `--no-ff` con riepilogo pre-merge esplicito → `/sync-docs` + report persistito in `docs/superpowers/reports/` con conferma esplicita di push → report finale in chat. Ogni gate di giudizio si ferma sempre; solo test/preflight sono automatici. |

---

## 2. I tre scenari

Le fasi centrali (Spec → `/writing-plans` → Piano) sono **identiche** nei tre scenari. Cambia solo cosa alimenta il Brief e quali guardie attivare durante l'esecuzione.

### Scenario 1 — Nuova feature

- **Brief**: scritto da zero, nessun comportamento esistente da preservare.
- **`/brainstorming`**: fissa lo scope escluso come guardia principale contro lo scope creep.
- **Esecuzione — guardia**: non farsi tentare da funzionalità aggiuntive non previste nello scope.

### Scenario 2 — Evoluzione di una feature esistente

- **Brief**: richiesta + lettura del comportamento attuale (codice esistente, bug incluso).
- **`/brainstorming`**: prima di toccare codice, **characterization test** sul comportamento attuale per "pinnarlo".
- **Esecuzione — guardia**: non rompere un caller ignoto che dipende dal comportamento esistente.

### Scenario 3 — Audit → fix

- **Brief**: costruito a partire dai finding di un report d'audit già chiuso, citati per ID/numero. Passo non saltabile: **root-cause analysis esplicita** — capire se finding apparentemente distinti condividono causa comune (es. stesso file, stessa funzione).
- **`/brainstorming`**: guardia specifica — se emerge un finding nuovo non previsto dall'audit originale, va sempre isolato a parte, mai risolto di straforo nello stesso ciclo.
- **Esecuzione — guardia**: isolare i finding nuovi emersi durante l'esecuzione, mai risolverli senza un Brief dedicato.

**Nota sull'audit stesso** (a monte del Brief, solo per lo Scenario 3): l'audit è un processo a sé — verifica soltanto, non fixa. Tassonomia dei finding, evidenza con citazioni file:linea, principio "verifica soltanto, mai fix durante l'audit". Report persistito in `docs/superpowers/audits/`.

---

## 3. Eccezioni concordate (esempi, non regola generale)

Le deroghe al processo standard sono permesse ma vanno sempre:
1. Decise esplicitamente in conversazione, non applicate di default.
2. Annotate nel report del ciclo interessato ("perché" e "cosa è stato saltato").
3. Mai generalizzate automaticamente al ciclo successivo — ogni deroga si conferma di nuovo, non si eredita.

**Esempio reale** (audit Resource Planning, luglio 2026): 3 cicli di fix mergiati separatamente, ma `/code-review` (gate 3 di `/finish-cycle`) eseguito per intero solo sul terzo ciclo, saltato esplicitamente sui primi due per contenere l'uso di token — con nota esplicita nel report di ciascun ciclo saltato.

---

## 4. Skill previste per normare il processo

Non ancora costruite (al momento di questa bozza). Tre skill, non una per scenario ma una per tipo di gap:

- **`feature-brief`** (priorità più alta): converte una richiesta grezza in un Brief strutturato per gli scenari 1 e 2.
- **Skill di audit** (nome da fissare): genera il report d'audit per lo scenario 3 — tassonomia finding, esecuzione sotto-domini, principio "verifica soltanto", standard di evidenza.
- **`audit-to-brief`**: prende un report d'audit già scritto e costruisce il Brief di fix per lo scenario 3. **Rimandata deliberatamente** finché non si accumula un secondo caso reale (oltre a quello Resource Planning) da cui generalizzare, per evitare di codificare scelte specifiche di un solo audit come regola universale.

---

## 5. Criterio di aggiornamento di questo documento

`/sync-docs` aggiorna questo file **solo se** il ciclo appena chiuso soddisfa almeno una di queste condizioni:
- Ha introdotto o modificato una delle skill di processo (`feature-brief`, audit, `audit-to-brief`).
- Ha introdotto un'eccezione al processo standard che si prevede **ricorrente** (non una tantum già documentata nel report del singolo ciclo).
- Ha modificato lo scheletro comune a 7 fasi o le guardie specifiche di uno scenario.

Un ciclo che **esegue** il processo così com'è (la stragrande maggioranza dei casi) non è materiale per questo documento — resta nel report del singolo ciclo, non qui.
