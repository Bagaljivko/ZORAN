# Zoran

**Z**et **O**bično **R**ačuna **A**psolutno **N**epogrešivo.

Zoran je besplatan kalkulator **cilindričnih evolventnih zupčanika sa pravim i kosim zubima**, napravljen da izgleda kao strana iz starog udžbenika Mašinskih elemenata. Radi u pregledaču, može da se instalira na telefon i posle prvog otvaranja radi i bez interneta.

Adresa: **https://bagaljivko.github.io/ZORAN/**

## Šta zna

- **Proračun** — unosiš z₁, z₂, mₙ, β, αₙ, širinu ozubljenja b i **osno rastojanje a koje zadaješ**; Zoran iz njega računa pomeranje profila (Σx, raspodela po DIN 3992), prikazuje ga ispod crteža i proverava da zaokružena pomeranja daju zadato a. Računa odmah, dok kucaš: prečnike (d, d_b, d_w, dₐ, d_f), debljine zuba, skraćenje temena, stepene sprezanja εα, εβ, εγ i upozorava na podsecanje, zašiljen vrh i εα < 1,1.
- **Crtež zahvata** — pravi evolventni profili, kotrljajne i osnovne kružnice, zahvatna linija T₁T₂ i aktivni deo AE; prikazi „Ceo par“, „Pregled“ i „Zona zahvata“, uz animaciju na dugme „Pokreni“.
- **Tablica** — svi rezultati, uz kopiranje svake vrednosti i „Kopiraj sve“.
- **Savetnik** — za zadato osno rastojanje računa Σx, raspodelu po DIN 3992 i predlaže bolje kombinacije modula (DIN 780) i broja zuba.
- **Uvoz** — čita parametre i sliku pregleda iz SolidWorks `.SLDPRT` fajla, lokalno.
- **Podešavanja** — mm ili inč, zarez ili tačka, 2–4 decimale, provera nove verzije, dijagnostika i **Podeli Zorana** (QR kod, sistemski meni za deljenje, kopiranje linka).

## Instalacija na telefon

**Android (Chrome, Edge, Samsung Internet)**
1. Otvori https://bagaljivko.github.io/ZORAN/.
2. Meni (⋮) › **Dodaj na početni ekran** ili **Instaliraj aplikaciju**.
3. Zoran se pojavljuje među aplikacijama i radi bez interneta.

**iPhone / iPad (Safari)**
1. Otvori adresu u Safariju.
2. Dugme **Deli** (kvadrat sa strelicom) › **Dodaj na početni ekran** › **Dodaj**.

**Windows i Mac** — Zoran radi u bilo kom savremenom pregledaču; u Chrome-u i Edge-u može da se instalira i preko ikonice u adresnoj traci.

Nova verzija: **Podešavanja › Proveri novu verziju › Osveži**.

Deljenje: **Podešavanja › Podeli Zorana › Podeli** — QR kod za skeniranje kamerom, a na telefonu i sistemski meni (Viber, WhatsApp, poruke, mejl…).

## Kako radi uvoz `.SLDPRT`

Fajl se čita **samo na tvom uređaju** — ništa se ne šalje na internet.

- **Stariji SolidWorks fajlovi (otprilike do 2014)** su OLE „compound“ fajlovi. Iz njih Zoran pouzdano čita korisnička svojstva (*Custom Properties*) i sliku pregleda.
- **Noviji fajlovi (2015 i dalje)** imaju zatvoren format. Zoran raspakuje komprimovane delove fajla i u njima traži sliku i imena svojstava. To je najbolji pokušaj — svaki pronađen podatak je označen kao „proveri“.

Za svaki podatak vidiš izvor i potvrdno polje; ono što nije pronađeno je obeleženo sa „nije pronađeno, unesi ručno“. Ništa se ne menja dok ne pritisneš **Primeni u proračun**.

Najsigurnije je da svojstva upiše makro [`tools/zoran-svojstva.bas`](tools/zoran-svojstva.bas) (uputstvo: [`tools/UPUTSTVO.md`](tools/UPUTSTVO.md)). Zoran traži svojstva `ZORAN_Modul`, `ZORAN_BrojZuba`, `ZORAN_UgaoNagiba`, `ZORAN_UgaoProfila`, `ZORAN_Sirina` i `ZORAN_PomeranjeProfila`, a prepoznaje i uobičajena imena (*Modul*, *Broj zuba*, *Module*, *Number of teeth*, *Helix angle*…).

U `tests/primeri/primer-ole.sldprt` je mali veštački OLE fajl za probu uvoza.

## Za programere

- Čist HTML, CSS i JavaScript, bez build koraka i bez frameworka. GitHub Pages iz grane `main`.
- `js/proracun.js` — proračun i savetnik (čiste funkcije), `js/crtez.js` — SVG crtež, `js/sldprt.js` — čitanje `.SLDPRT`, `js/app.js` — interfejs.
- Testovi: `node tests/proracun.test.js` (bez biblioteka). Cela provera pre objave (uređaji, offline, ažuriranje): `node tests/provera-aplikacije.js` (Playwright/Chromium).
- Pri svakoj promeni povećaj `CACHE_VERSION` u `sw.js` i `APP_VERSION` u `js/app.js`.
- Radni postupak i spisak provera pre svakog PR-a: [`CLAUDE.md`](CLAUDE.md).

## Licence spoljnih delova

- Fontovi **EB Garamond** i **IBM Plex Mono** su u `fonts/` — SIL Open Font License 1.1 (licence u istom folderu).
- **qrcode-generator** 2.0.4 (Kazuhiko Arase) je u `js/vendor/qrcode-generator.js` — MIT licenca, tekst u [`js/vendor/LICENSE-qrcode-generator.txt`](js/vendor/LICENSE-qrcode-generator.txt). QR kod se pravi lokalno, bez interneta. „QR Code“ je registrovani žig kompanije DENSO WAVE INCORPORATED.
