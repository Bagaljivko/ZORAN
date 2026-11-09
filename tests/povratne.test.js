/*
 * Testovi za „Pošalji utisak“ i dijagnostiku — pokreni sa:  node tests/povratne.test.js
 * Bez spoljnih biblioteka i bez pravog slanja: fetch, localStorage i Google Apps Script su zamenjeni.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var vm = require('vm');
var F = require(path.join(__dirname, '..', 'js', 'povratne.js'));

var prosli = 0, pali = 0, cekanje = [];
function test(ime, fn) {
  try {
    var r = fn();
    if (r && typeof r.then === 'function') {
      cekanje.push(r.then(function () { prosli++; console.log('  ok   ' + ime); },
        function (e) { pali++; console.log('  PAO  ' + ime + '\n       ' + e.message); }));
      return;
    }
    prosli++; console.log('  ok   ' + ime);
  } catch (e) { pali++; console.log('  PAO  ' + ime + '\n       ' + e.message); }
}
function tacno(v, poruka) { if (!v) throw new Error(poruka || 'očekivano tačno'); }
function jednako(a, b, poruka) { if (a !== b) throw new Error((poruka || '') + ' očekivano ' + JSON.stringify(b) + ', dobijeno ' + JSON.stringify(a)); }

function memorija() {
  var m = {};
  return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m };
}
var OSNOVA = { uid: 'test-uid-1234', verzija: '9.9.9', ekran: 'podesavanja', uredjaj: 'Linux, Chrome 1 · prozor 390×844' };
function poruka(tekst) { return F.napraviPoruku(Object.assign({ tip: 'idea', tekst: tekst || 'Probna poruka', mejl: '' }, OSNOVA)); }

console.log('Prozor „Pošalji utisak“');

test('poruka je obavezna: prazna ili samo razmaci se ne šalju', function () {
  var r = F.proveriUnos({ tip: 'bug', tekst: '   ', mejl: '' });
  tacno(!r.ok && r.greske.tekst, 'prazna poruka mora dati upozorenje');
  tacno(F.proveriUnos({ tip: 'bug', tekst: 'Ne radi uvoz', mejl: '' }).ok);
});
test('poruka najviše 5000 znakova', function () {
  tacno(F.proveriUnos({ tekst: new Array(5001).join('a') }).ok, '5000 znakova prolazi');
  tacno(!F.proveriUnos({ tekst: new Array(5002).join('a') }).ok, '5001 znak ne prolazi');
});
test('neispravan mejl daje upozorenje, prazan mejl je u redu', function () {
  ['ilija', 'a@b', 'a b@c.rs', '@c.rs', 'x@.rs', 'x@y.r'].forEach(function (m) {
    var r = F.proveriUnos({ tekst: 'x', mejl: m });
    tacno(!r.ok && r.greske.mejl, m + ' mora biti odbijen');
  });
  ['ime@firma.rs', 'ime.prezime+zoran@primer.co.uk', ' ime@firma.com '].forEach(function (m) { tacno(F.proveriUnos({ tekst: 'x', mejl: m }).ok, m + ' mora proći'); });
  tacno(F.proveriUnos({ tekst: 'x', mejl: '' }).ok);
});
test('svaka poruka ima vrstu, tekst, mejl, anonimni ID, jezik, verziju, ekran i uređaj', function () {
  var p = F.napraviPoruku(Object.assign({ tip: 'bug', tekst: '  Ne radi  ', mejl: 'ime@firma.rs ', tehnicki: 'izveštaj' }, OSNOVA));
  jednako(p.kind, 'feedback'); jednako(p.type, 'bug'); jednako(p.text, 'Ne radi'); jednako(p.email, 'ime@firma.rs');
  jednako(p.uid, OSNOVA.uid); jednako(p.lang, 'sr'); jednako(p.version, '9.9.9'); jednako(p.screen, 'podesavanja');
  jednako(p.device, OSNOVA.uredjaj); jednako(p.tech, 'izveštaj');
  tacno(!isNaN(Date.parse(p.time)), 'vreme');
});
test('bez tehničkih podataka kad je „Priloži tehničke podatke“ isključeno', function () {
  var p = F.napraviPoruku(Object.assign({ tip: 'idea', tekst: 'x', tehnicki: null }, OSNOVA));
  tacno(!('tech' in p), 'tech ne sme postojati');
});
test('anonimni ID se pravi jednom i ostaje isti', function () {
  var s = memorija();
  var a = F.korisnikId(s), b = F.korisnikId(s);
  tacno(/^[0-9a-f-]{36}$/.test(a), 'oblik UUID: ' + a);
  jednako(a, b);
  var s2 = memorija();
  tacno(F.korisnikId(s2) !== a, 'drugi uređaj ima drugi ID');
});
test('adresa za slanje je Apps Script veb-aplikacija (…/exec, https)', function () {
  tacno(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(F.ADRESA), F.ADRESA);
});
test('red i ID se nikad ne prenose u rezervne kopije ni sinhronizaciju', function () {
  tacno(F.NE_SINHRONIZUJ.indexOf(F.KLJUC.red) >= 0 && F.NE_SINHRONIZUJ.indexOf(F.KLJUC.id) >= 0);
});

console.log('Slanje i red bez mreže');

var ADRESA = 'https://script.google.com/macros/s/TEST/exec';
test('bez mreže poruka ostaje u redu, a sa mrežom se šalje i briše iz reda', function () {
  var s = memorija();
  F.dodajURed(s, poruka('prva'));
  var poslato = [];
  var mreza = false;
  function lazniFetch(url, op) {
    if (!mreza) return Promise.reject(new TypeError('Failed to fetch'));
    poslato.push({ url: url, op: op });
    return Promise.resolve({ type: 'opaque' });
  }
  return F.isprazniRed({ sklad: s, fetch: lazniFetch, adresa: ADRESA }).then(function (r) {
    jednako(r.ostalo, 1, 'bez mreže:'); jednako(poslato.length, 0);
    F.dodajURed(s, poruka('druga'));
    mreza = true;
    return F.isprazniRed({ sklad: s, fetch: lazniFetch, adresa: ADRESA });
  }).then(function (r) {
    jednako(r.poslato.length, 2); jednako(r.ostalo, 0); jednako(F.procitajRed(s).length, 0);
    jednako(poslato[0].url, ADRESA);
    jednako(poslato[0].op.method, 'POST'); jednako(poslato[0].op.mode, 'no-cors');
    jednako(JSON.parse(poslato[0].op.body).text, 'prva', 'redosled:');
    jednako(JSON.parse(poslato[1].op.body).text, 'druga');
  });
});
test('stavka se briše tek kad fetch uspe', function () {
  var s = memorija();
  F.dodajURed(s, poruka());
  var pusti;
  var p = F.isprazniRed({ sklad: s, fetch: function () { return new Promise(function (r) { pusti = r; }); }, adresa: ADRESA });
  return new Promise(function (r) { setTimeout(r, 10); }).then(function () {
    tacno(typeof pusti === 'function', 'fetch je pozvan');
    jednako(F.procitajRed(s).length, 1, 'dok fetch traje stavka je još u redu:');
    pusti({});
    return p;
  }).then(function () { jednako(F.procitajRed(s).length, 0); });
});
test('red čuva najviše 20 poruka (najstarije otpadaju)', function () {
  var s = memorija();
  for (var i = 1; i <= 25; i++) F.dodajURed(s, poruka('br ' + i));
  var r = F.procitajRed(s);
  jednako(r.length, 20); jednako(r[0].p.text, 'br 6'); jednako(r[19].p.text, 'br 25');
});
test('bez adrese ništa se ne šalje', function () {
  var s = memorija();
  F.dodajURed(s, poruka());
  var zvano = 0;
  return F.isprazniRed({ sklad: s, fetch: function () { zvano++; return Promise.resolve(); }, adresa: '' }).then(function (r) {
    jednako(zvano, 0); jednako(r.ostalo, 1);
  });
});
test('dva istovremena pražnjenja ne šalju istu poruku dvaput', function () {
  var s = memorija();
  F.dodajURed(s, poruka('jedna'));
  var zvano = 0;
  function f() { zvano++; return new Promise(function (r) { setTimeout(r, 5); }); }
  return Promise.all([F.isprazniRed({ sklad: s, fetch: f, adresa: ADRESA }), F.isprazniRed({ sklad: s, fetch: f, adresa: ADRESA })]).then(function () {
    jednako(zvano, 1); jednako(F.procitajRed(s).length, 0);
  });
});

console.log('Dijagnostika');

var TAJNE = [
  'AIzaSyD-FAKEfakeFAKEfakeFAKEfake12345', 'ya29.a0AfH6SMfakeTokenValue123', 'ghp_FAKEfakeFAKEfakeFAKEfake1234567890',
  'sk-ant-FAKEfakeFAKEfake1234567890', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlZmFrZQ', 'tajnaLozinka123', 'Kljuc987654', 'skriveno-tok-555'
];
function izvestajSaTajnama() {
  F.obrisiGreske();
  F.zabeleziGresku('Neuspelo: https://www.googleapis.com/drive/v3/files?access_token=' + TAJNE[1] + '&key=' + TAJNE[0], 'Error: x\n at f (app.js:1:2)');
  F.zabeleziGresku('Authorization: Bearer ' + TAJNE[4], '');
  F.zabeleziGresku('Neuspelo čitanje „Zupčanik Petrović.SLDPRT“ za ime@firma.rs', '');
  F.zabeleziGresku('config {"apiKey":"' + TAJNE[2] + '","password":"' + TAJNE[5] + '"} token=' + TAJNE[7], '');
  F.zabeleziGresku('client_secret=' + TAJNE[6] + ' i ' + TAJNE[3], '');
  return F.izvestaj({
    verzija: '9.9.9', kes: 'zoran-v99', jezik: 'sr', jeziciUredjaja: 'sr-RS, en', uredjaj: 'Android 14, Chrome 130',
    ekran: '412×915', naMrezi: true, skladiste: '1,2 MB od 500 MB', dozvole: { 'persistent-storage': 'granted' },
    podesavanja: { jedinice: 'mm', decimale: 3 }, greske: F.poslednjeGreske()
  });
}
test('izveštaj nikad ne sadrži ključeve ni tokene (ni delove)', function () {
  var izv = izvestajSaTajnama();
  TAJNE.forEach(function (x) {
    tacno(izv.indexOf(x) < 0, 'procurelo: ' + x);
    tacno(izv.indexOf(x.slice(-6)) < 0, 'procureo kraj: ' + x.slice(-6));
  });
  tacno(!/access_token=(?!\[uklonjeno\])/.test(izv) && !/Bearer (?!\[uklonjeno\])/.test(izv), 'oznake ostaju, vrednosti ne');
});
test('izveštaj ne sadrži mejlove ni imena fajlova', function () {
  var izv = izvestajSaTajnama();
  tacno(izv.indexOf('ime@firma.rs') < 0, 'mejl');
  tacno(izv.indexOf('Petrović') < 0 && izv.indexOf('.SLDPRT') < 0, 'ime fajla');
});
test('izveštaj ima verziju, keš, jezik, uređaj, ekran, mrežu, skladište, dozvole, podešavanja i greške', function () {
  var izv = izvestajSaTajnama();
  ['ZORAN 9.9.9', 'zoran-v99', 'Jezik: sr', 'Android 14', '412×915', 'na mreži', '1,2 MB', 'persistent-storage=granted', 'jedinice=mm', 'Greške (5)'].forEach(function (x) {
    tacno(izv.indexOf(x) >= 0, 'nedostaje: ' + x);
  });
});
test('čuva se najviše 30 poslednjih grešaka', function () {
  F.obrisiGreske();
  for (var i = 1; i <= 40; i++) F.zabeleziGresku('greška ' + i, '');
  var g = F.poslednjeGreske();
  jednako(g.length, 30); jednako(g[0].poruka, 'greška 11'); jednako(g[29].poruka, 'greška 40');
  F.obrisiGreske();
});
test('dijagnostika ima kind: diag i napomenu', function () {
  var d = F.napraviDijagnostiku(Object.assign({ napomena: ' Pukne pri uvozu ', mejl: '', izvestaj: 'IZV' }, OSNOVA));
  jednako(d.kind, 'diag'); jednako(d.note, 'Pukne pri uvozu'); jednako(d.report, 'IZV'); jednako(d.lang, 'sr');
});

console.log('Retko pitanje „Kako ti se sviđa ZORAN?“');

var DAN = 86400000;
var POCETAK = new Date(2026, 0, 5, 10, 0, 0).getTime();
test('prvi put posle 3. završene radnje', function () {
  var s = null, prikazi = [];
  for (var i = 0; i < 3; i++) { var r = F.posleAktivnosti(s, POCETAK + i * 60000); s = r.stanje; prikazi.push(r.prikazi); }
  jednako(prikazi.join(','), 'false,false,true');
});
test('drugi put tek posle 14 dana i 5 različitih dana korišćenja', function () {
  var s = null, r, i;
  for (i = 0; i < 3; i++) s = F.posleAktivnosti(s, POCETAK).stanje; // prikazano prvi put
  // 15 dana kasnije, ali samo 4 dana korišćenja posle prvog prikaza → još ne
  for (i = 1; i <= 4; i++) { r = F.posleAktivnosti(s, POCETAK + i * DAN); s = r.stanje; tacno(!r.prikazi, 'dan ' + i); }
  r = F.posleAktivnosti(s, POCETAK + 15 * DAN); s = r.stanje;
  tacno(r.prikazi, 'peti dan korišćenja i 15 dana kasnije → prikazuje se');
  // 5 dana korišćenja, ali manje od 14 dana → ne
  var t = null;
  for (i = 0; i < 3; i++) t = F.posleAktivnosti(t, POCETAK).stanje;
  for (i = 1; i <= 8; i++) { r = F.posleAktivnosti(t, POCETAK + i * DAN); t = r.stanje; tacno(!r.prikazi, '8 dana korišćenja, ali dan ' + i + ' < 14'); }
});
test('više radnji u istom danu se broji kao jedan dan korišćenja', function () {
  var s = null, i, r;
  for (i = 0; i < 3; i++) s = F.posleAktivnosti(s, POCETAK).stanje;
  for (i = 0; i < 50; i++) { r = F.posleAktivnosti(s, POCETAK + 20 * DAN + i * 60000); s = r.stanje; tacno(!r.prikazi); }
  jednako(s.danaPosle, 1);
});
test('pitanje se pojavljuje tačno dvaput, ikad (godina svakodnevnog korišćenja)', function () {
  var s = null, puta = 0;
  for (var d = 0; d < 365; d++) {
    s = F.zabeleziDan(s, POCETAK + d * DAN); // otvaranje aplikacije
    for (var k = 0; k < 4; k++) { var r = F.posleAktivnosti(s, POCETAK + d * DAN + k * 3600000); s = r.stanje; if (r.prikazi) puta++; }
  }
  jednako(puta, 2);
  jednako(s.prikazano.length, 2);
});
test('otvaranje aplikacije bez radnje se broji kao dan korišćenja', function () {
  var s = null, i;
  for (i = 0; i < 3; i++) s = F.posleAktivnosti(s, POCETAK).stanje;
  for (i = 1; i <= 14; i++) s = F.zabeleziDan(s, POCETAK + i * DAN);
  tacno(F.posleAktivnosti(s, POCETAK + 15 * DAN).prikazi);
});

console.log('Google tabela (Apps Script)');

function apsScript() {
  var tabela = { listovi: {}, url: 'https://docs.google.com/spreadsheets/d/TEST' };
  function list(ime) {
    var l = { ime: ime, redovi: [], zamrznuto: 0, podebljano: false };
    l.getName = function () { return ime; };
    l.getLastRow = function () { return l.redovi.length; };
    l.appendRow = function (r) { l.redovi.push(r); };
    l.getRange = function (red) { return { setFontWeight: function (w) { if (red === 1 && w === 'bold') l.podebljano = true; return this; }, getValue: function () { return l.redovi[red - 1][0]; } }; };
    l.setFrozenRows = function (n) { l.zamrznuto = n; };
    l.deleteRow = function (r) { l.redovi.splice(r - 1, 1); };
    return l;
  }
  var mejlovi = [];
  var ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: function () {
      return {
        getSheetByName: function (n) { return tabela.listovi[n] || null; },
        insertSheet: function (n) { tabela.listovi[n] = list(n); return tabela.listovi[n]; },
        getSheets: function () { return Object.keys(tabela.listovi).map(function (k) { return tabela.listovi[k]; }); },
        getUrl: function () { return tabela.url; }
      };
    } },
    ContentService: { MimeType: { TEXT: 'text' }, createTextOutput: function (t) { return { tekst: t, setMimeType: function () { return this; } }; } },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
    MailApp: { sendEmail: function (m) { mejlovi.push(m); } },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'vlasnik@primer.rs'; } }; } },
    Date: Date, JSON: JSON, String: String, Object: Object
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'tools', 'zoran-povratne.gs'), 'utf8'), ctx);
  ctx._tabela = tabela; ctx._mejlovi = mejlovi;
  ctx.posalji = function (p) { return ctx.doPost({ postData: { contents: JSON.stringify(p) } }); };
  return ctx;
}
test('setup() pravi listove sa podebljanim, zamrznutim zaglavljem', function () {
  var g = apsScript();
  g.setup(); g.setup(); // drugi put ne dupli zaglavlje
  ['Feedback – English', 'Feedback – Srpski', 'Diagnostics'].forEach(function (n) {
    var l = g._tabela.listovi[n];
    tacno(l, 'nema lista ' + n);
    tacno(l.podebljano && l.zamrznuto === 1, n + ': zaglavlje');
    jednako(l.redovi.length, 1, n + ' redova:');
  });
  jednako(g._tabela.listovi['Feedback – Srpski'].redovi[0].join('|'), 'Time|Type|Text|Email|User ID|Screen|Version|Device|Tech data');
  jednako(g._tabela.listovi.Diagnostics.redovi[0].join('|'), 'Time|Email|User ID|Version|Language|Device|Note|Report');
});
test('poruka ide u list prema jeziku, dijagnostika u „Diagnostics“', function () {
  var g = apsScript();
  g.setup();
  g.posalji(F.napraviPoruku(Object.assign({ tip: 'idea', tekst: 'srpski' }, OSNOVA)));
  g.posalji(Object.assign(F.napraviPoruku(Object.assign({ tip: 'like', tekst: 'english' }, OSNOVA)), { lang: 'en' }));
  g.posalji(F.napraviDijagnostiku(Object.assign({ napomena: 'nap', izvestaj: 'IZV' }, OSNOVA)));
  var sr = g._tabela.listovi['Feedback – Srpski'].redovi, en = g._tabela.listovi['Feedback – English'].redovi, di = g._tabela.listovi.Diagnostics.redovi;
  jednako(sr.length, 2); jednako(sr[1][2], 'srpski'); jednako(sr[1][1], 'Idea'); jednako(sr[1][5], 'podesavanja'); jednako(sr[1][6], '9.9.9');
  jednako(en.length, 2); jednako(en[1][2], 'english');
  jednako(di.length, 2); jednako(di[1][6], 'nap'); jednako(di[1][7], 'IZV'); jednako(di[1][4], 'sr');
});
test('ćelija nikad ne postaje formula i skraćuje se', function () {
  var g = apsScript();
  g.setup();
  g.posalji(F.napraviPoruku(Object.assign({ tip: 'idea', tekst: '=HYPERLINK("http://zlo")', mejl: '@zlo' }, OSNOVA, { ekran: '+1', uredjaj: '-cmd' })));
  var r = g._tabela.listovi['Feedback – Srpski'].redovi[1];
  jednako(r[2], '\'=HYPERLINK("http://zlo")'); jednako(r[3], "'@zlo"); jednako(r[5], "'+1"); jednako(r[7], "'-cmd");
  jednako(g.ocistiCeliju(new Array(60001).join('x')).length, 45000);
});
test('za „Nešto ne radi“ vlasnik dobija mejl sa tekstom, pošiljaocem, ekranom, verzijom i linkom tabele', function () {
  var g = apsScript();
  g.setup();
  g.posalji(F.napraviPoruku(Object.assign({ tip: 'idea', tekst: 'ideja' }, OSNOVA)));
  jednako(g._mejlovi.length, 0, 'ideja ne šalje mejl:');
  g.posalji(F.napraviPoruku(Object.assign({ tip: 'bug', tekst: 'Pukne uvoz', mejl: 'ime@firma.rs' }, OSNOVA)));
  jednako(g._mejlovi.length, 1);
  var m = g._mejlovi[0];
  jednako(m.to, 'vlasnik@primer.rs');
  ['Pukne uvoz', 'ime@firma.rs', 'podesavanja', '9.9.9', 'docs.google.com'].forEach(function (x) { tacno(m.body.indexOf(x) >= 0 || m.subject.indexOf(x) >= 0, 'mejl nema: ' + x); });
});
test('doGet vraća „Feedback endpoint OK“, a neispravan JSON ne ruši skriptu', function () {
  var g = apsScript();
  jednako(g.doGet().tekst, 'Feedback endpoint OK');
  jednako(g.doPost({ postData: { contents: '{nije json' } }).tekst, 'bad json');
});

Promise.all(cekanje).then(function () {
  console.log('\nUkupno: ' + prosli + ' prošlo, ' + pali + ' palo.');
  process.exit(pali ? 1 : 0);
});
