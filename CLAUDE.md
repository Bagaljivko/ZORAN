# Zoran — radni postupak (CLAUDE.md)

Ovo je trajni radni postupak za projekat. **Pročitaj ga na početku svakog zadatka i drži ga se.**

## Glavno pravilo (dogovor sa vlasnikom repoa)

Vlasnik ne radi ništa na GitHub-u — sve ide preko razgovora sa Claude-om. Kad se dogovorimo oko izmene:

1. Uradi izmenu na radnoj grani (vidi „Pre svake izmene“).
2. Pokreni **`node tests/provera-aplikacije.js`** — ona proverava ceo spisak ispod — i ručno proveri ono što skripta ne pokriva (izgled izmenjenog dela na snimku ekrana, smisao novih tekstova).
3. Ako bilo šta ne prolazi ili je pokvareno, **popravi na licu mesta** i ponovo pokreni celu proveru, ne samo deo koji je pao.
4. Kad sve prođe: commit, push, otvori PR sa popunjenim spiskom, sačekaj da i GitHub-ova automatska provera „Provera“ (`.github/workflows/provera.yml`) bude zelena, pa **odmah sam spoji PR u `main`**. Ako GitHub-ova provera padne, popravi i ponovi. Grana se briše automatski (uključeno u podešavanjima repoa).
5. Javi vlasniku kratko šta je urađeno i da na telefonu pritisne Podešavanja › „Proveri novu verziju“ › „Osveži“.

Budi pažljiv: cilj je da se **ništa ne pokvari**. Ne menjaj ono što nije deo dogovora; ako izmena utiče na sačuvane podatke korisnika (localStorage), napravi prenos starih podataka. Ako dogovor nije jasan, prvo pitaj. Ako nešto važno ne može da se popravi ili proveri, **ne spajaj** — objasni vlasniku šta nedostaje.

- Repo: https://github.com/Bagaljivko/ZORAN — radi isključivo u ovom repou.
- Live: https://bagaljivko.github.io/ZORAN/ (GitHub Pages iz grane `main`, aplikacija živi na `/ZORAN/`).
- Ceo tekst u aplikaciji je na srpskom (latinica).

## Kako je projekat organizovan

- Čist HTML, CSS i JavaScript, bez build koraka i bez frameworka.
- `index.html` — svi ekrani (Proračun, Tablica, Savetnik, Uvoz, Podešavanja).
- `css/zoran.css` — stil „Stari priručnik“.
- `js/proracun.js` — proračun i savetnik (čiste funkcije, rade i u Node-u).
- `js/crtez.js` — SVG crtež zahvata. `js/sldprt.js` — čitanje `.SLDPRT`.
- `js/podeli.js` — QR kod za deljenje. `js/vendor/` — spoljne biblioteke (sa licencom).
- `js/app.js` — interfejs; ovde je `APP_VERSION`.
- `sw.js` — service worker; ovde je `CACHE_VERSION` i spisak fajlova za keš.
- `tests/proracun.test.js` — testovi proračuna (`node tests/proracun.test.js`, bez biblioteka).
- `tests/provera-aplikacije.js` — automatska provera celog spiska (uređaji, konzola, offline, ažuriranje, localStorage, keš, verzije, putanje). Koristi Playwright/Chromium iz okruženja; sama podiže server na `/ZORAN/` i ne menja fajlove. Izlaz 0 = sve prolazi.
- `tools/` — SolidWorks makro i uputstvo.
- `.github/workflows/provera.yml` — GitHub sam pokreće obe provere na svakom PR-u i posle spajanja u `main`. `.github/pull_request_template.md` — šablon opisa PR-a sa spiskom.

## Pre svake izmene

1. Povuci najnoviji `main` i napravi novu granu.
2. Pročitaj README i ovaj fajl, i pogledaj kako je postojeći kod organizovan.
3. Napiši kratak plan: šta menjaš, koje fajlove, šta može da se pokvari.

## Provera posle svake izmene (sve mora da prođe pre PR-a)

### Proračun
- [ ] `node tests/proracun.test.js` prolazi. Za podrazumevane ulaze a ≈ 250 mm.
- [ ] Nijedna formula se ne menja bez novog testa koji to pokriva.

### Uređaji (emulacija u Chromium-u, plus provera za Safari/WebKit ako je dostupan)
- [ ] iPhone (390×844, Safari): sve radi, bez horizontalnog skrolovanja, tastatura ne prekriva polje u koje se kuca, donja traka nije ispod „home“ linije (safe-area-inset).
- [ ] Android (Pixel 7, Chrome): isto kao iPhone.
- [ ] Tablet (iPad, 820×1180): raspored je čitljiv.
- [ ] Desktop 1440 px (Chrome, Edge, Safari na Mac-u): tri kolone, sve radi mišem i tastaturom.
- [ ] Dvostruki dodir i „pinch“ ne zumiraju aplikaciju (radi kao prava aplikacija), a fontovi su najmanje 16 px u poljima da iPhone ne zumira sam.
- [ ] U konzoli nema grešaka ni upozorenja.

### PWA i ažuriranje
- [ ] `CACHE_VERSION` u `sw.js` i broj verzije aplikacije (`APP_VERSION` u `js/app.js`) su povećani.
- [ ] Svaki novi fajl aplikacije (js, css, fontovi, ikonice) je dodat u keš u `sw.js`.
- [ ] Offline: posle prvog otvaranja i isključene mreže aplikacija se učitava sa svim ekranima.
- [ ] „Proveri novu verziju“ prikazuje „Nova verzija je spremna“, a „Osveži“ učitava novu verziju.
- [ ] Sve putanje su relativne (`./`), jer aplikacija živi na `/ZORAN/`.
- [ ] Sačuvani podaci korisnika (localStorage) ostaju posle ažuriranja.

### Izgled i pristupačnost
- [ ] Stil „Stari priručnik“ je očuvan (papir #EDE2C6, mastilo #2B2117, akcenat #8A2B1A).
- [ ] Kontrast teksta je najmanje 4,5:1, dodirne površine su najmanje 44×44 px.
- [ ] Svaka nova vrednost ima ikonicu za kopiranje.
- [ ] Sav novi tekst je na srpskom.

## Isporuka

- Otvori PR ka `main`. U opisu PR-a navedi ceo spisak sa [x] za ono što je prošlo (izlaz skripte `tests/provera-aplikacije.js` može da se nalepi), i napiši šta NIJE provereno (na primer: „nije testirano na pravom iPhone-u“).
- **Spajanje u `main` (stalna dozvola vlasnika repoa):** kada sve provere prođu, sam spoji PR u `main` (merge commit) bez čekanja na posebno odobrenje. Ako nešto ne prolazi, prvo to popravi; ako ne može da se popravi, ili nešto važno za tu izmenu nije moglo da se proveri, **ne spajaj** — ostavi PR otvoren i napiši vlasniku šta nedostaje.
- Posle spajanja proveri da je `main` ažuran, a sledeći zadatak počni od svežeg `main`-a (vidi „Pre svake izmene“).

## Saveti za proveru

- Najbrže: `node tests/provera-aplikacije.js` (traje oko 2 minuta).
- Lokalni server koji oponaša GitHub Pages putanju: iz roditeljskog foldera repoa pokreni `python3 -m http.server 8765` i otvori `http://127.0.0.1:8765/ZORAN/`.
- Playwright/Chromium: uređaji `iPhone 13` (390×844), `Pixel 7`, `iPad (gen 7)` ili ručno 820×1180, i 1440×900. Horizontalni skrol: `document.documentElement.scrollWidth <= innerWidth`.
- Offline: `context.setOffline(true)` pa `page.reload()`.
- Ažuriranje: privremeno promeni `CACHE_VERSION`, pritisni „Proveri novu verziju“, pa „Osveži“; posle vrati vrednost.
