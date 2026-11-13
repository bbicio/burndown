# Dati di prova fissi per lo stack di verifica di PDash To Prod — design spec

**Date:** 2026-11-13
**Brief started:** unknown
**Brief:** nessuno: la richiesta e le decisioni sono state prese in chat il 2026-11-13 (nessun file di Brief, come ammette PROCESS.md §6b)
**Scenario:** 1 (nuova feature)

Lo stack di verifica `ithwg-check`, avviato da PDash To Prod dal clone Bitbucket, parte con il database vuoto: per provarlo a mano bisogna applicare le migrazioni, creare l'admin e inventare dei dati. Questa spec aggiunge uno script che crea sempre lo stesso dataset di prova tramite l'API, e un pulsante **Seed** nel pannello che esegue l'intera sequenza. Lo script vive in `burndown`; il pannello è un progetto a parte, fuori dai due repository.

## Comportamento atteso

1. **Il dataset.** `api/src/scripts/seed-smoke.js` crea, in un database vuoto e tramite l'API pubblica:
   - 3 clienti (*Aurora Pharma*, *Borealis Foods*, *Cobalt Retail*), i primi due nel gruppo *Northern Alliance*;
   - 4 ruoli in 2 team di fantasia (`NOVA - DEV`, `NOVA - QA`, `ORBIT - PM`, `ORBIT - DES`), con tariffe in euro;
   - la valuta USD attivata con un cambio fisso, e l'anno di pipeline in corso, visibile;
   - un POT per *Aurora Pharma* nell'anno in corso;
   - 5 offerte (cost grid) di fantasia, ognuna con 2 fasi, 4 task e 2 ruoli per task: SIP, Expected, Anticipated, Committed, Committed; una delle cinque in USD; le non-Draft sono pubblicate;
   - 3 progetti generati da offerte (Anticipated e le due Committed), con i task e i ruoli dell'offerta; i due delle Committed nello stesso programma *Programme Helios*;
   - 6 persone del Team con nomi di fantasia, una inattiva;
   - actuals per i 3 progetti, con i nomi delle persone del Team più un nome che nel Team non c'è (*Zed Unlisted*);
   - alcuni valori di tag (Market) assegnati a due offerte e ai loro progetti.
2. **Date.** L'anno di pipeline è l'anno in corso; periodi delle offerte, dei progetti e dei task e le date degli actuals sono spostamenti fissi da oggi, in modo che ci siano sempre mesi passati, correnti e futuri. Nomi, ore, tariffe e importi sono costanti.
3. **Verifica integrata.** A fine esecuzione lo script confronta con costanti il numero di clienti, ruoli, persone, offerte, progetti, programmi, POT e righe di actuals di ogni progetto, e il totale di budget di ogni offerta. Stampa una riga per controllo, `OK` o `MISMATCH`, ed esce con codice diverso da zero se ce n'è almeno una non `OK` o se una chiamata fallisce.
4. **Database non vuoto.** Se trova già dati (una offerta o un cliente), non crea niente, lo dice ed esce con codice diverso da zero.
5. **Isolamento.** Lo script accetta solo un URL `localhost` o `127.0.0.1` con porta esplicita diversa da 80 (la regola del seed di Planning), e non parla mai con lo stack principale.
6. **Il pulsante Seed.** Nella sezione "Verification stack" del pannello, dopo **Start**, un pulsante **Seed** esegue in sequenza, ognuno solo se il precedente è andato bene:
   1. controllo che i quattro container `ithwg-check-*` siano in esecuzione e sani;
   2. controllo che il database sia vuoto (la tabella `users` non esiste): altrimenti rifiuta e dice di usare **Stop and remove**;
   3. `npm run migrate` nel container api;
   4. creazione dell'admin con credenziali fisse di prova, e promozione a sysadmin;
   5. copia di `trust-device.js` di `burndown` nel container e creazione di un dispositivo fidato, il cui valore serve allo script;
   6. esecuzione di `seed-smoke.js` dalla cartella `burndown` contro `http://localhost:8190`.
   L'esito (ok o il primo passo fallito con il suo output) compare nella pagina e come riga `stack-seed` nella cronologia. Le credenziali di prova sono mostrate nella pagina.
7. **Accesso dal browser.** Il pulsante non cambia come ci si collega dal browser: il codice di accesso via email si riceve col catcher descritto nella pagina, come oggi.

## Vincoli

- Tutto il testo rivolto all'utente è in inglese (`CLAUDE.md`).
- Il pannello esegue solo comandi dichiarati con argomenti costanti; i soli valori variabili sono la cartella `burndown` (da `config.json`) e il valore del dispositivo fidato, letto dall'output di `trust-device.js` e validato come esadecimale. Mai `-v`, mai container senza il prefisso `ithwg-check-`.
- Lo script non è classificato "sito" da `scripts/site-export.rules`: non va nel clone e non cambia l'export.
- Nessuna modifica a `trust-device.js`, a `site-export.rules`, al codice dell'app o allo schema.
- Lo script usa solo endpoint che esistono; dove un endpoint rifiuta il dato (valute, date, ruoli sui task, blocchi sui progetti), si corregge il dato dello script, non la regola.

## Scope escluso

Un dump del database; modifiche a `site-export.rules`; il seed sullo stack principale o su qualunque stack che non sia `ithwg-check`; un `--remove`; il catcher di posta e l'accesso dal browser senza codice; l'esecuzione della profilazione (Experience profile); dati per Draft e Canceled; modifiche a `seed-planning-golden.js`; `/finish-cycle`, ramo e worktree per questo ciclo (istruzione dell'utente, 2026-11-13).

## Criteri di accettazione

1. **Dataset creato** — su uno stack `ithwg-check` fresco, **Seed** termina con esito ok e `seed-smoke.js` stampa solo righe `OK`.
2. **Le cinque offerte si vedono** — aperta `http://localhost:8190/pipeline.html` con l'anno in corso, SIP, Expected, Anticipated e Committed contengono le 5 offerte, una con importo in USD.
3. **I progetti e gli actuals** — in Portfolio compaiono 3 progetti, due raggruppati in *Programme Helios*, ognuno con ore consumate e il nome *Zed Unlisted* nell'elenco dei nomi non abbinati di Team.
4. **Database non vuoto** — un secondo clic su **Seed** non modifica niente e mostra il messaggio che chiede **Stop and remove**; lo script lanciato a mano su dati esistenti esce con errore senza scrivere.
5. **Il pannello resta confinato** — `npm test` del pannello è verde, e i test provano che nessun comando di **Seed** nomina un container diverso da `ithwg-check-*` né usa `-v`.
6. **Il repository resta integro** — `npx vitest run scripts/` è verde in `burndown`, e `git diff --stat` del ciclo in `burndown` tocca solo `api/src/scripts/seed-smoke.js` più spec e piano.

## Decisioni aperte

1. **Lo script resta in `burndown` (`api/src/scripts/`, escluso dall'export) e il pannello lo lancia da lì.** Alternativa scartata: spostarlo in un percorso incluso nel clone. Perché: col pannello non serve e il clone su Bitbucket resta pulito.
2. **Script nuovo; `seed-planning-golden.js` non si tocca.** Alternativa scartata: estendere il seed di Planning. Perché: ha un altro scopo, il prefisso `GOLD-` e un `--remove` che qui non servono.
3. **`trust-device.js` si copia nel container con `docker cp` a ogni esecuzione di Seed.** Alternativa scartata: toglierlo dall'esclusione dell'export; leggere il codice da Mailpit. Perché: lascia il clone e l'export invariati.
4. **Un solo pulsante per tutta la sequenza.** Alternativa scartata: un pulsante per passo. Perché: l'utente vuole un pulsante e non gli script.
5. **Anno di pipeline in corso; date come spostamenti fissi da oggi.** Alternativa scartata: spostamenti dal 1° gennaio. Perché: a dicembre sarebbe tutto nel passato.
6. **Su un database non vuoto il pannello e lo script si rifiutano.** Alternativa scartata: cancellare e ricreare. Perché: lo stack parte sempre vuoto e un `down -v` si fa già con **Stop and remove**.
7. **Esecuzione con commit diretti su `main`, senza `/finish-cycle`; il pannello si committa nel suo repository; nessun push senza chiedere.** Alternativa scartata: ramo e `/finish-cycle`. Perché: istruzione esplicita dell'utente.
8. **La verifica è dentro lo script, con le cifre attese come costanti.** Alternativa scartata: un test vitest che lancia lo script. Perché: serve uno stack Docker, che i test automatici non devono avviare.
9. **Il pulsante non risolve l'accesso dal browser.** Alternativa scartata: avviare il catcher di posta dal pannello. Perché: è fuori dalla richiesta e il catcher è già descritto nella pagina.
