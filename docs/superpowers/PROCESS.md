# Processo di sviluppo — burndown (PDash)

> Documenta il workflow spec-driven come applicato finora. Le tre skill di processo previste (§4) sono tutte costruite: `feature-brief`, `domain-audit`, `audit-to-brief`.
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
| **Brief** | Descrizione del problema/obiettivo. Input varia per scenario (vedi §2). Prodotto dalla skill `feature-brief` (Scenari 1 e 2) o `audit-to-brief` (Scenario 3, a partire da un report d'audit già chiuso). |
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

- **Brief**: scritto da zero, nessun comportamento esistente da preservare. Prodotto dalla skill `feature-brief` — primo passo sempre una domanda esplicita di classificazione dello scenario, mai inferita dal testo della richiesta.
- **`/brainstorming`**: fissa lo scope escluso come guardia principale contro lo scope creep.
- **Esecuzione — guardia**: non farsi tentare da funzionalità aggiuntive non previste nello scope.

### Scenario 2 — Evoluzione di una feature esistente

- **Brief**: richiesta + lettura del comportamento attuale (codice esistente, bug incluso). Prodotto dalla skill `feature-brief`, stesso primo passo di classificazione dello Scenario 1.
- **`/brainstorming`**: prima di toccare codice, **characterization test** sul comportamento attuale per "pinnarlo".
- **Esecuzione — guardia**: non rompere un caller ignoto che dipende dal comportamento esistente.

### Scenario 3 — Audit → fix

- **Brief**: costruito a partire dai finding di un report d'audit già chiuso, citati per ID/numero. Prodotto dalla skill `audit-to-brief`, che prende il report come dato chiuso (non riesegue l'audit) e propone un raggruppamento dei finding in cicli — per causa radice condivisa o stesso file/funzione, mai "un finding per ciclo" né "tutti insieme" — da confermare esplicitamente con l'utente prima di scrivere i Brief. Passo non saltabile: **root-cause analysis esplicita**, ri-derivata indipendentemente dalla skill anche quando l'audit ha già raggruppato i finding — capire se finding apparentemente distinti condividono causa comune (es. stesso file, stessa funzione). Un finding di natura diversa dagli altri (es. una scelta di design, non una divergenza di correttezza/consistenza) va segnalato esplicitamente e trattato con un Brief in forma Scenario 2, non forzato nello schema meccanico audit-fix.
- **`/brainstorming`**: guardia specifica — se emerge un finding nuovo non previsto dall'audit originale, va sempre isolato a parte, mai risolto di straforo nello stesso ciclo.
- **Esecuzione — guardia**: isolare i finding nuovi emersi durante l'esecuzione, mai risolverli senza un Brief dedicato.

**Nota sull'audit stesso** (a monte del Brief, solo per lo Scenario 3): l'audit è un processo a sé — verifica soltanto, non fixa. Condotto dalla skill `domain-audit`: negoziazione esplicita dello scope (perimetro, cosa conta come finding, ground truth) prima di leggere codice, evidenza con citazioni file:linea per ogni claim, root-cause analysis prima di classificare, mai un fix durante l'audit (guardia che regge anche a una richiesta esplicita e ripetuta dell'utente di fixare al volo), finding fuori scope isolati in una sezione dedicata del report. Report persistito in `docs/superpowers/audits/`. Distinta dalla skill di sicurezza (`security-review`) — non sovrappone vulnerabilità/credenziali/injection.

---

## 3. Eccezioni concordate (esempi, non regola generale)

Le deroghe al processo standard sono permesse ma vanno sempre:
1. Decise esplicitamente in conversazione, non applicate di default.
2. Annotate nel report del ciclo interessato ("perché" e "cosa è stato saltato").
3. Mai generalizzate automaticamente al ciclo successivo — ogni deroga si conferma di nuovo, non si eredita.

**Esempio reale** (audit Resource Planning, luglio 2026): 3 cicli di fix mergiati separatamente, ma `/code-review` (gate 3 di `/finish-cycle`) eseguito per intero solo sul terzo ciclo, saltato esplicitamente sui primi due per contenere l'uso di token — con nota esplicita nel report di ciascun ciclo saltato.

---

## 4. Skill di processo

Tutte e tre costruite. Non una per scenario ma una per tipo di gap — ciascuna in `.claude/skills/<nome>/SKILL.md`:

- **`feature-brief`**: converte una richiesta grezza in un Brief strutturato per gli scenari 1 e 2. Primo passo sempre una domanda esplicita di classificazione dello scenario, mai inferita.
- **`domain-audit`**: conduce l'audit di dominio per lo scenario 3 — scope negoziato prima di leggere codice, evidenza file:linea per ogni claim, root-cause analysis, mai fix durante l'audit, finding fuori scope isolati in sezione dedicata. Non sovrappone la skill di sicurezza (`security-review`); tassonomia dei finding libera, decisa per singolo audit.
- **`audit-to-brief`**: prende un report d'audit già chiuso (generato da `domain-audit`) e costruisce il/i Brief di fix per lo scenario 3 — raggruppamento dei finding in cicli proposto e confermato con l'utente, mai deciso unilateralmente; finding di natura diversa (es. design vs. correttezza) segnalati e trattati con un Brief in forma Scenario 2. Costruita e testata sui due casi reali disponibili (audit Resource Planning, audit `js/ai.js`) dopo che il secondo caso si è accumulato — come previsto, per evitare di generalizzare da un solo audit.

---

## 5. Criterio di aggiornamento di questo documento

`/sync-docs` aggiorna questo file **solo se** il ciclo appena chiuso soddisfa almeno una di queste condizioni:
- Ha introdotto o modificato una delle skill di processo (`feature-brief`, `domain-audit`, `audit-to-brief`).
- Ha introdotto un'eccezione al processo standard che si prevede **ricorrente** (non una tantum già documentata nel report del singolo ciclo).
- Ha modificato lo scheletro comune a 7 fasi o le guardie specifiche di uno scenario.

Un ciclo che **esegue** il processo così com'è (la stragrande maggioranza dei casi) non è materiale per questo documento — resta nel report del singolo ciclo, non qui.
