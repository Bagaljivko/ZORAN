/*
 * Testovi za čuvanje na Google Drive-u — pokreni sa:  node tests/drive.test.js
 * Bez pravog Google-a: Drive je lažni server u memoriji, a fetch i localStorage su zamenjeni.
 */
'use strict';
var path = require('path');
var D = require(path.join(__dirname, '..', 'js', 'drive.js'));

var prosli = 0, pali = 0, cekanje = [];
function test(ime, fn) {
  try {
    var r = fn();
    if (r && typeof r.then === 'function') {
      cekanje.push(r.then(function () { prosli++; console.log('  ok   ' + ime); },
        function (e) { pali++; console.log('  PAO  ' + ime + '\n       ' + (e && e.message)); }));
      return;
    }
    prosli++; console.log('  ok   ' + ime);
  } catch (e) { pali++; console.log('  PAO  ' + ime + '\n       ' + e.message); }
}
function tacno(v, poruka) { if (!v) throw new Error(poruka || 'očekivano tačno'); }
function jednako(a, b, poruka) { if (a !== b) throw new Error((poruka || '') + ' očekivano ' + JSON.stringify(b) + ', dobijeno ' + JSON.stringify(a)); }

function memorija(pocetak) {
  var m = Object.assign({}, pocetak || {});
  return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m };
}

/** Lažni Google Drive (appDataFolder) koji razume zahteve iz js/drive.js. */
function lazniDrive() {
  var fajlovi = {}, brojac = 0, sat = Date.parse('2026-11-09T10:00:00Z');
  var drive = { fajlovi: fajlovi, zahtevi: [], istekao: false, mreza: true };
  function odg(status, telo) {
    return Promise.resolve({ status: status, ok: status >= 200 && status < 300, json: function () { return Promise.resolve(JSON.parse(telo)); }, text: function () { return Promise.resolve(telo); } });
  }
  drive.fetch = function (url, op) {
    op = op || {};
    drive.zahtevi.push({ url: url, metod: op.method || 'GET', auth: op.headers && op.headers.Authorization });
    if (!drive.mreza) return Promise.reject(new TypeError('Failed to fetch'));
    if (drive.istekao || !/^Bearer tok-/.test((op.headers || {}).Authorization || '')) return odg(401, '{"error":"unauthorized"}');
    var u = new URL(url);
    var m;
    if (u.pathname === '/drive/v3/files' && (op.method || 'GET') === 'GET') {
      tacno(u.searchParams.get('spaces') === 'appDataFolder', 'traži se samo u appDataFolder');
      var lista = Object.keys(fajlovi).map(function (id) { return { id: id, modifiedTime: fajlovi[id].vreme }; });
      return odg(200, JSON.stringify({ files: lista }));
    }
    if ((m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/)) && u.searchParams.get('alt') === 'media') {
      return fajlovi[m[1]] ? odg(200, fajlovi[m[1]].sadrzaj) : odg(404, '{}');
    }
    if (u.pathname === '/drive/v3/about') return odg(200, JSON.stringify({ user: { emailAddress: 'korisnik@gmail.com' } }));
    if ((m = u.pathname.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/))) {
      tacno(u.searchParams.get('uploadType') === 'multipart', 'multipart');
      var granica = (op.headers['Content-Type'].match(/boundary=(.+)$/) || [])[1];
      var delovi = op.body.split('--' + granica).filter(function (d) { return d.trim() && d.trim() !== '--'; });
      var meta = JSON.parse(delovi[0].split('\r\n\r\n')[1]);
      var sadrzaj = delovi[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      var id = m[1];
      if (!id) {
        jednako(op.method, 'POST'); jednako(meta.parents[0], 'appDataFolder'); jednako(meta.name, D.IME_FAJLA);
        id = 'f' + (++brojac);
      } else jednako(op.method, 'PATCH');
      sat += 60000;
      fajlovi[id] = { sadrzaj: sadrzaj, vreme: new Date(sat).toISOString() };
      return odg(200, JSON.stringify({ id: id, modifiedTime: fajlovi[id].vreme }));
    }
    return odg(404, '{}');
  };
  return drive;
}

var INFO = { verzija: '9.9.9', uredjaj: 'Android 14, Chrome 130' };
var t0 = Date.parse('2026-11-09T12:00:00Z');
function sat(pocetak) { var t = pocetak || t0; return function () { return (t += 1000); }; }
function podaciTelefona() {
  return {
    'zoran.unos': JSON.stringify({ vrednosti: { z1: 40, z2: 40, mn: 2.5, beta: 0, alfaN: 20, b: 40, a: 101 } }),
    'zoran.varijante': JSON.stringify([{ ime: 'V1' }, { ime: 'V2' }]),
    'zoran.podesavanja': JSON.stringify({ jedinice: 'mm', znak: ',', decimale: 4 }),
    'zoran.povratne-red': JSON.stringify([{ id: 'x', p: {} }]),
    'zoran.povratne-id': JSON.stringify('anon-id'),
    'zoran.koriscenje': JSON.stringify({ otvaranja: 9 })
  };
}
function povezi(sklad) { var s = D.stanje(sklad); s.povezano = true; D.sacuvajStanje(sklad, s); }
function sinh(sklad, drive, dodatno) {
  return D.sinhronizuj(Object.assign({ sklad: sklad, fetch: drive.fetch, token: 'tok-1', info: INFO, sada: sat(), pitaj: function () { throw new Error('nije trebalo pitati'); } }, dodatno || {}));
}

console.log('Snimak podataka');

test('na Drive idu proračun, varijante i podešavanja — ne i red poruka, anonimni ID ni brojači', function () {
  var s = D.snimak(memorija(podaciTelefona()), { verzija: '9.9.9', uredjaj: 'x', sada: t0 });
  jednako(s.app, 'ZORAN'); jednako(s.format, 1); jednako(s.izmenjeno, t0);
  tacno('zoran.unos' in s.podaci && 'zoran.varijante' in s.podaci && 'zoran.podesavanja' in s.podaci);
  ['zoran.povratne-red', 'zoran.povratne-id', 'zoran.koriscenje', 'zoran.drive', 'zoran.verzija'].forEach(function (k) { tacno(!(k in s.podaci), k + ' ne sme na Drive'); });
});
test('primena kopije zamenjuje sinhronizovane ključe i ne dira ostale', function () {
  var sklad = memorija({ 'zoran.unos': 'staro', 'zoran.sile': '"500"', 'zoran.povratne-id': '"moj-id"' });
  D.primeni(sklad, { app: 'ZORAN', format: 1, podaci: { 'zoran.unos': 'novo' } });
  jednako(sklad.getItem('zoran.unos'), 'novo');
  jednako(sklad.getItem('zoran.sile'), null, 'ključ kog nema u kopiji se briše:');
  jednako(sklad.getItem('zoran.povratne-id'), '"moj-id"', 'nesinhronizovani ključ ostaje:');
});
test('opis kopije za ponudu: vreme, uređaj, broj varijanti i poslednji par', function () {
  var o = D.opisSnimka(D.snimak(memorija(podaciTelefona()), { verzija: '9.9.9', uredjaj: 'Android 14', sada: t0 }));
  jednako(o.izmenjeno, t0); jednako(o.uredjaj, 'Android 14'); jednako(o.varijanti, 2);
  jednako(o.par.z1, 40); jednako(o.par.mn, 2.5);
});
test('neispravan sadržaj sa Drive-a se ne prihvata kao kopija', function () {
  tacno(!D.ispravanSnimak(null) && !D.ispravanSnimak({ app: 'DRUGO', format: 1, podaci: {} }) && !D.ispravanSnimak({ app: 'ZORAN', format: 1 }));
});

console.log('Odluka');

test('prva prijava sa postojećom kopijom → ponudi; bez kopije → pošalji', function () {
  jednako(D.odluka({}, { postoji: true, novo: true }), 'ponudi');
  jednako(D.odluka({}, { postoji: false, novo: false }), 'posalji');
});
test('kasnije: samo Drive promenjen → preuzmi; samo telefon → pošalji; oba → ponudi; ništa → ništa', function () {
  var s = { poslednjaSinh: 100, lokalnoIzmenjeno: 0 };
  jednako(D.odluka(s, { postoji: true, novo: true }), 'preuzmi');
  jednako(D.odluka(s, { postoji: true, novo: false }), 'nista');
  s.lokalnoIzmenjeno = 200;
  jednako(D.odluka(s, { postoji: true, novo: false }), 'posalji');
  jednako(D.odluka(s, { postoji: true, novo: true }), 'ponudi');
});
test('izmena se beleži samo kad je Drive povezan', function () {
  var sk = memorija();
  tacno(!D.oznaciIzmenu(sk, 5) && !D.imaNeposlato(sk));
  povezi(sk);
  tacno(D.oznaciIzmenu(sk, 5) && D.imaNeposlato(sk));
});

console.log('Sinhronizacija (lažni Drive)');

test('prvi uređaj: nema kopije → podaci se šalju u skrivenu fasciklu', function () {
  var drive = lazniDrive(), tel = memorija(podaciTelefona());
  povezi(tel);
  return sinh(tel, drive).then(function (r) {
    jednako(r.rezultat, 'poslato');
    var ids = Object.keys(drive.fajlovi); jednako(ids.length, 1);
    var kopija = JSON.parse(drive.fajlovi[ids[0]].sadrzaj);
    jednako(kopija.uredjaj, INFO.uredjaj);
    tacno(!('zoran.povratne-red' in kopija.podaci), 'red poruka nije na Drive-u');
    var st = D.stanje(tel); tacno(st.fileId === ids[0] && st.poslednjaSinh > 0 && !D.imaNeposlato(tel));
  });
});
test('prijava na drugom uređaju sama nađe kopiju i ponudi je; „Učitaj kopiju“ je upisuje', function () {
  var drive = lazniDrive(), tel = memorija(podaciTelefona()), racunar = memorija({ 'zoran.unos': JSON.stringify({ vrednosti: { z1: 16 } }) });
  povezi(tel); povezi(racunar);
  var ponudjeno = null;
  return sinh(tel, drive).then(function () {
    return sinh(racunar, drive, { pitaj: function (opis) { ponudjeno = opis; return Promise.resolve('ucitaj'); } });
  }).then(function (r) {
    jednako(r.rezultat, 'preuzeto');
    tacno(ponudjeno && ponudjeno.varijanti === 2 && ponudjeno.uredjaj === INFO.uredjaj, 'ponuda sa opisom kopije');
    jednako(racunar.getItem('zoran.unos'), tel.getItem('zoran.unos'));
    jednako(racunar.getItem('zoran.varijante'), tel.getItem('zoran.varijante'));
    jednako(racunar.getItem('zoran.povratne-red'), null, 'red poruka se ne prenosi:');
  });
});
test('„Zadrži podatke sa ovog uređaja“ šalje lokalne podatke preko kopije', function () {
  var drive = lazniDrive(), tel = memorija(podaciTelefona()), racunar = memorija({ 'zoran.unos': '"racunar"' });
  povezi(tel); povezi(racunar);
  return sinh(tel, drive).then(function () {
    return sinh(racunar, drive, { pitaj: function () { return 'zadrzi'; } });
  }).then(function (r) {
    jednako(r.rezultat, 'poslato');
    var k = JSON.parse(drive.fajlovi.f1.sadrzaj); jednako(k.podaci['zoran.unos'], '"racunar"');
    jednako(Object.keys(drive.fajlovi).length, 1, 'isti fajl se menja (PATCH), ne pravi se novi:');
  });
});
test('odustajanje od ponude ne menja ništa', function () {
  var drive = lazniDrive(), tel = memorija(podaciTelefona()), racunar = memorija({ 'zoran.unos': '"racunar"' });
  povezi(tel); povezi(racunar);
  var pre;
  return sinh(tel, drive).then(function () {
    pre = drive.fajlovi.f1.sadrzaj;
    return sinh(racunar, drive, { pitaj: function () { return 'odustani'; } });
  }).then(function (r) {
    jednako(r.rezultat, 'odustao'); jednako(racunar.getItem('zoran.unos'), '"racunar"'); jednako(drive.fajlovi.f1.sadrzaj, pre);
    tacno(!D.stanje(racunar).poslednjaSinh, 'sledeći put opet nudi');
  });
});
test('izmena na telefonu → računar je posle „Sinhronizuj“ preuzme bez pitanja', function () {
  var drive = lazniDrive(), tel = memorija(podaciTelefona()), racunar = memorija();
  povezi(tel); povezi(racunar);
  return sinh(tel, drive).then(function () {
    return sinh(racunar, drive, { pitaj: function () { return 'ucitaj'; } });
  }).then(function () {
    tel.setItem('zoran.sile', '"750"'); D.oznaciIzmenu(tel, Date.now() + 1e7);
    return sinh(tel, drive, { sada: sat(Date.now() + 2e7) });
  }).then(function (r) {
    jednako(r.rezultat, 'poslato');
    return sinh(racunar, drive);
  }).then(function (r) {
    jednako(r.rezultat, 'preuzeto'); jednako(racunar.getItem('zoran.sile'), '"750"');
  });
});
test('kad nema izmena ni na jednoj strani, ništa se ne šalje', function () {
  var drive = lazniDrive(), tel = memorija(podaciTelefona());
  povezi(tel);
  return sinh(tel, drive).then(function () {
    var n = drive.zahtevi.length;
    return sinh(tel, drive).then(function (r) {
      jednako(r.rezultat, 'nista');
      jednako(drive.zahtevi.slice(n).filter(function (z) { return z.metod !== 'GET'; }).length, 0);
      jednako(drive.zahtevi.slice(n).filter(function (z) { return /alt=media/.test(z.url); }).length, 0, 'kopija se ne preuzima ako se nije menjala:');
    });
  });
});
test('automatsko čuvanje ne pita i ne briše: kad su menjane obe strane vraća „sukob“', function () {
  var drive = lazniDrive(), tel = memorija(podaciTelefona()), racunar = memorija();
  povezi(tel); povezi(racunar);
  return sinh(tel, drive).then(function () { return sinh(racunar, drive, { pitaj: function () { return 'ucitaj'; } }); })
    .then(function () { tel.setItem('zoran.sile', '"1"'); D.oznaciIzmenu(tel, Date.now() + 1e7); return sinh(tel, drive, { sada: sat(Date.now() + 2e7) }); })
    .then(function () { racunar.setItem('zoran.sile', '"2"'); D.oznaciIzmenu(racunar, Date.now() + 3e7); return sinh(racunar, drive, { auto: true, sada: sat(Date.now() + 4e7) }); })
    .then(function (r) {
      jednako(r.rezultat, 'sukob'); jednako(racunar.getItem('zoran.sile'), '"2"');
      jednako(JSON.parse(drive.fajlovi.f1.sadrzaj).podaci['zoran.sile'], '"1"', 'Drive ostaje netaknut:');
    });
});
test('istekao pristup → greška „token“, podaci ostaju netaknuti', function () {
  var drive = lazniDrive(), tel = memorija(podaciTelefona());
  povezi(tel); drive.istekao = true;
  return sinh(tel, drive).then(function () { throw new Error('očekivana greška'); }, function (g) {
    jednako(g.kod, 'token'); jednako(Object.keys(drive.fajlovi).length, 0);
  });
});
test('bez mreže → greška „mreza“', function () {
  var drive = lazniDrive(), tel = memorija(podaciTelefona());
  povezi(tel); drive.mreza = false;
  return sinh(tel, drive).then(function () { throw new Error('očekivana greška'); }, function (g) { jednako(g.kod, 'mreza'); });
});
test('svaki zahtev nosi token, a mejl naloga se čita iz Drive-a', function () {
  var drive = lazniDrive();
  return D.mejlNaloga({ fetch: drive.fetch, token: 'tok-9' }).then(function (m) {
    jednako(m, 'korisnik@gmail.com');
    tacno(drive.zahtevi.every(function (z) { return z.auth === 'Bearer tok-9'; }));
  });
});

console.log('Pristup (token)');

test('token važi do minut pre isteka i čuva se samo u sesiji', function () {
  var ses = memorija();
  D.sacuvajToken(ses, 'tok-a', 3600, 1000);
  jednako(D.tokenIzSesije(ses, 1000 + 3500 * 1000), 'tok-a');
  jednako(D.tokenIzSesije(ses, 1000 + 3550 * 1000), null);
  D.obrisiToken(ses); jednako(D.tokenIzSesije(ses, 2000), null);
});
test('Client ID i dozvola: samo skrivena fascikla aplikacije (drive.appdata)', function () {
  tacno(/\.apps\.googleusercontent\.com$/.test(D.CLIENT_ID));
  jednako(D.SCOPE, 'https://www.googleapis.com/auth/drive.appdata');
});

Promise.all(cekanje).then(function () {
  console.log('\nUkupno: ' + prosli + ' prošlo, ' + pali + ' palo.');
  process.exit(pali ? 1 : 0);
});
