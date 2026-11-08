<!-- ZORAN: posle dogovora sa vlasnikom, Claude pokreće proveru, popravlja sve što ne prolazi i sam spaja PR u main (vidi CLAUDE.md). -->

## Šta je urađeno


## Spisak iz CLAUDE.md
<!-- Nalepi izlaz komande: node tests/provera-aplikacije.js -->

### Proračun
- [ ] `node tests/proracun.test.js` prolazi (a ≈ 250 mm za podrazumevane ulaze)
- [ ] Nijedna formula se ne menja bez novog testa

### Uređaji
- [ ] iPhone 390×844, Android (Pixel 7), tablet 820×1180, desktop 1440 px
- [ ] Bez horizontalnog skrola, polja ≥ 16 px, bez zumiranja, tastatura ne prekriva polje
- [ ] U konzoli nema grešaka ni upozorenja

### PWA i ažuriranje
- [ ] `CACHE_VERSION` i `APP_VERSION` povećani; novi fajlovi u kešu `sw.js`
- [ ] Offline svih 5 ekrana; „Proveri novu verziju“ → „Osveži“; localStorage ostaje
- [ ] Sve putanje relativne (`./`)

### Izgled i pristupačnost
- [ ] Stil „Stari priručnik“, kontrast ≥ 4,5:1, dodirne površine ≥ 44×44 px
- [ ] Svaka nova vrednost ima ikonicu za kopiranje; sav novi tekst na srpskom

## Šta NIJE provereno
- Pravi iPhone, Android i iPad; Safari/WebKit i Edge.
