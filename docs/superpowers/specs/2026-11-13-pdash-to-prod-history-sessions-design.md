# PDash To Prod — cronologia raggruppata per sessione — design spec

**Date:** 2026-11-13
**Brief started:** unknown
**Brief:** nessuno: richiesta e decisioni prese in chat il 2026-11-13 (nessun file di Brief, come ammette PROCESS.md §6b)
**Scenario:** 2 (evoluzione)

La vista History del pannello PDash To Prod (`C:\Users\Fabrizio.Fortini\Progetti\PDash_To_Prod`, fuori da `burndown`) è un elenco piatto di record, uno per operazione, dal più recente: ogni passo dell'export e ogni azione dello stack è una riga e una giornata di prove diventa illeggibile. La spec raggruppa i record per **sessione**, cioè per esecuzione di `start-dashboard.cmd` (un avvio del server), con una riga di riepilogo per blocco. Il codice si modifica nel repository del pannello; spec e piano stanno in `burndown` perché i guard documentali sono qui.

## Comportamento attuale

- `dashboard/index.html` (`renderHistory`) mostra una tabella piatta: When, Operation, Outcome, Commit, Files, più un dettaglio per riga; filtri Operation e Outcome.
- Ogni record ha `id, runId, ts, durationMs, op, ok` più campi opzionali; `runId` lega solo i passi di uno stesso export, e le azioni dello stack hanno un `runId` proprio (`stack-<ora>`). Nessun campo identifica l'avvio del server.
- I record sono scritti da `dashboard/controller.mjs` (passi dell'export) e `dashboard/services.mjs` (azioni dello stack); `history.jsonl` è append-only e contiene già record senza identificativo di sessione.

## Comportamento atteso

1. **Identificativo di sessione.** Ogni avvio del server genera un `sessionId` (l'ora di avvio in ISO locale, come i campi `ts`) e lo scrive in ogni record che il controller e il servizio dello stack aggiungono da quel momento.
2. **Raggruppamento.** `GET /api/history` restituisce, oltre ai campi di oggi, `sessions`: un elenco di gruppi, dal più recente, ciascuno `{ key, kind, title, start, records, summary }`:
   - `kind: 'session'` per i record con `sessionId` uguale (una sessione), `title` = l'ora di avvio;
   - `kind: 'day'` per i record **senza** `sessionId`, raggruppati per giorno di calendario locale del loro `ts`, `title` = la data seguita da "(before sessions were recorded)";
   - i record di ogni gruppo sono dal più recente; i gruppi sono ordinati per il loro record più recente; un gruppo senza record non esiste; la somma dei record di tutti i gruppi è esattamente il numero di record letti.
3. **Riepilogo.** `summary` è una riga fatta di parti separate da ` · `, nell'ordine: (a) `"N export pushed"` se ci sono `push` riusciti (N = quanti), altrimenti `"N export step(s)"` se ci sono passi dell'export (N = quanti), altrimenti niente; (b) `"stack: " + le azioni dello stack in ordine cronologico senza il prefisso `stack-`` (ripetizioni incluse), se ce ne sono; (c) `"N failed"` se ci sono record con `ok` falso. Un gruppo di soli record riusciti non ha la parte (c).
4. **La vista.** Ogni gruppo è un blocco comprimibile (`<details>`) con titolo, riepilogo e un contatore dei record; si apre il solo blocco più recente. Dentro il blocco la tabella ha le colonne e il dettaglio di oggi. I filtri Operation e Outcome valgono dentro i blocchi e nascondono i blocchi rimasti senza righe. Il banner "Last published", il blocco "Pending", il controllo incrociato e la ricerca "Where did a file go?" non cambiano.
5. **Compatibilità.** Il formato di `history.jsonl` cambia solo per il campo `sessionId` in più nei record nuovi; i record vecchi non si riscrivono e la vista continua a leggerli.

## Vincoli

- Tutto il testo della pagina è in inglese.
- Nessun comando nuovo, nessuna dipendenza, nessun cambio di `steps.mjs` o di `docker.mjs`.
- Il raggruppamento è una funzione pura, provata con `node:test` del pannello (`npm test`); la pagina si limita a disegnare.
- Nessuna modifica a `burndown` oltre a questa spec e al suo piano.

## Scope escluso

Una vista a più livelli (sessione → export); la ricerca dentro le sessioni; cancellare o archiviare record; riscrivere `history.jsonl`; dedurre sessioni dai record vecchi; qualunque cambio al banner, al "Pending" o al controllo incrociato; `/finish-cycle`, ramo e worktree (istruzione dell'utente, 2026-11-13).

## Criteri di accettazione

1. **Sessioni** — avviato il pannello due volte con lo stesso `history.jsonl` e lanciato in ciascuna un passo (per esempio `repo-check`), la vista History mostra due blocchi di sessione distinti, quello della seconda sopra e aperto, quello della prima chiuso.
2. **Niente perso** — la somma dei record dei gruppi è uguale al numero di record del file, vecchi inclusi (`npm test` del pannello, test su un file con record con e senza `sessionId`).
3. **Record vecchi** — i 13 record già presenti compaiono in blocchi per giorno con il titolo "(before sessions were recorded)".
4. **Riepilogo** — per un gruppo con un export spinto, uno stack avviato, seminato e rimosso e un errore, la riga è `1 export pushed · stack: start, seed, stop · 1 failed` (test).
5. **Filtri** — scegliendo Operation "stack seed" restano visibili solo i blocchi con righe di quell'operazione, e le righe di quell'operazione (verifica a vista).
6. **Pannello integro** — `npm test` del pannello è verde, e `git diff --stat` del ciclo in `burndown` tocca solo questa spec e il suo piano.

## Decisioni aperte

1. **La sessione è l'ora di avvio del server, scritta in ogni record nuovo.** Alternativa scartata: dedurre le sessioni dagli intervalli fra record. Perché: è la definizione dell'utente (un'esecuzione del `.cmd`) e non richiede di indovinare.
2. **Il raggruppamento si calcola nel server con una funzione pura.** Alternativa scartata: raggruppare nella pagina. Perché: la pagina non ha test di logica e il riepilogo è una regola da provare.
3. **I record senza sessione si raggruppano per giorno di calendario locale.** Alternativa scartata: un solo blocco "older", o sessioni inferite da pause fra record. Perché: nessun dato affidabile le distingue, e il giorno è almeno una granularità onesta.
4. **Il riepilogo di una riga ha le tre parti della regola 3.** Alternativa scartata: nessun riepilogo. Perché: è ciò che rende la vista leggibile a colpo d'occhio, e l'utente l'ha approvato.
5. **Si apre solo il blocco più recente; i filtri nascondono i blocchi vuoti.** Alternativa scartata: tutti aperti. Perché: tornerebbe l'elenco lungo.
6. **Spec e piano vivono in `burndown`, il codice nel repository del pannello.** Alternativa scartata: documenti nel pannello. Perché: i guard (`decision-ledger-guard`) e la cartella `docs/superpowers` sono qui, come per il ciclo del Seed.
7. **Esecuzione con commit diretti, senza `/finish-cycle`; il pannello si committa nel suo repository; nessun push senza chiedere.** Alternativa scartata: ramo e `/finish-cycle`. Perché: istruzione esplicita dell'utente.
