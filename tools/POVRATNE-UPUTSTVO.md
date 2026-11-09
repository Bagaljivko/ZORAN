# „Pošalji utisak“ — postavljanje Google tabele

Poruke iz ZORAN-a („Pošalji utisak“, „Pošalji dijagnostiku“, palac gore/dole) stižu u Google tabelu
preko Google Apps Script veb-aplikacije. Server nije potreban. Dok adresa nije upisana u aplikaciju,
„Pošalji“ nudi da se tekst podeli ili kopira, pa se ništa ne gubi.

## Postavljanje (jednom, oko 10 minuta)

1. Na [sheets.google.com](https://sheets.google.com) napravi novu praznu tabelu, npr. **ZORAN — utisci**.
2. U tabeli: **Extensions → Apps Script**.
3. Obriši sve u fajlu `Code.gs`, nalepi ceo sadržaj fajla [`zoran-povratne.gs`](zoran-povratne.gs) i sačuvaj (ikonica diskete).
4. Gore u padajućem meniju izaberi funkciju **setup** i pritisni **Run**.
   - Prvi put Google traži dozvolu: **Review permissions** → izaberi svoj nalog → ako se pojavi
     „Google hasn't verified this app“, **Advanced → Go to … (unsafe)** (to je tvoja skripta) → **Allow**.
   - U tabeli se pojave listovi **Feedback – English**, **Feedback – Srpski** i **Diagnostics** sa podebljanim, zamrznutim zaglavljem.
5. **Deploy → New deployment** → zupčanik pored „Select type“ → **Web app**:
   - Description: `ZORAN`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, pa kopiraj **Web app URL** (završava se sa `/exec`).
6. Proba: otvori taj URL u pregledaču — mora da piše **Feedback endpoint OK**.
7. Pošalji URL Claude-u (ili ga upiši u `js/povratne.js` kao `var ADRESA = '…/exec';`, povećaj verzije i objavi).

## Kad menjaš kod skripte

- Nalepi novi kod, sačuvaj i ponovo pokreni **setup**.
- **Deploy → Manage deployments** → olovka (Edit) → Version: **New version** → **Deploy**.
  Tako **adresa ostaje ista** i aplikaciju ne treba menjati. (Nemoj praviti „New deployment“ — to daje novu adresu.)

## Podešavanja u skripti

- `OBAVESTI_ZA_GRESKE = true` — za poruku „Nešto ne radi“ dobijaš mejl (na nalog koji je vlasnik skripte) sa tekstom, pošiljaocem, ekranom, verzijom i linkom ka tabeli. Stavi `false` da isključiš.
- `obrisiStare()` — briše redove starije od 2 godine (kako piše u `privatnost.html`). Da radi sama:
  u Apps Script-u **Triggers** (sat) → **Add Trigger** → funkcija `obrisiStare`, „Time-driven“, „Month timer“.

## Šta stiže

| List | Kolone |
| --- | --- |
| Feedback – Srpski / English | Time, Type, Text, Email, User ID, Screen, Version, Device, Tech data |
| Diagnostics | Time, Email, User ID, Version, Language, Device, Note, Report |

Svaka ćelija je skraćena, a vrednost koja počinje sa `=`, `+`, `-` ili `@` dobija `'` ispred, pa nikad ne postaje formula.
Zahtev za brisanje: pronađi redove po mejlu ili po „User ID“ i obriši ih.
