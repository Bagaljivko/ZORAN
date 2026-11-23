/*
 * ZORAN — automatska provera celog spiska iz CLAUDE.md.
 * Pokreni iz korena repoa:  node tests/provera-aplikacije.js
 *
 * Koristi Playwright i Chromium koji su već instalirani u okruženju (nisu zavisnost aplikacije).
 * Sama podiže lokalni server koji oponaša GitHub Pages putanju /ZORAN/, pa ne menja nijedan fajl:
 * nova verzija service worker-a za proveru ažuriranja se podmeće samo u odgovoru servera.
 * Izlazni kod je 0 samo ako sve provere prođu.
 */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var { chromium, devices } = require('playwright');

var KOREN = path.resolve(__dirname, '..');
var PORT = 8790 + Math.floor(Math.random() * 100);
var URL = 'http://127.0.0.1:' + PORT + '/ZORAN/';
var EKRANI = ['proracun', 'tablica', 'savetnik', 'uvoz', 'podesavanja'];
var APP_FAJLOVI = /^([^/]+\.html|manifest\.json|sw\.js|css\/|js\/|fonts\/.*\.woff2$|icons\/|novosti\/)/;

var rezultati = [];
function stavka(grupa, opis, ok, detalj) {
  rezultati.push({ grupa: grupa, opis: opis, ok: !!ok, detalj: detalj || '' });
}

// ---------------- lokalni server ----------------
var podmetniNovuVerziju = false;
var TIPOVI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.sldprt': 'application/octet-stream' };
var server = http.createServer(function (req, res) {
  var u = decodeURIComponent(req.url.split('?')[0]);
  if (u.indexOf('/ZORAN/') !== 0) { res.writeHead(404); return res.end(); }
  var rel = u.slice('/ZORAN/'.length) || 'index.html';
  var fajl = path.join(KOREN, rel);
  if (fajl.indexOf(KOREN) !== 0 || !fs.existsSync(fajl) || fs.statSync(fajl).isDirectory()) { res.writeHead(404); return res.end(); }
  var telo = fs.readFileSync(fajl);
  if (rel === 'sw.js' && podmetniNovuVerziju) telo = Buffer.from(telo.toString('utf8').replace(/CACHE_VERSION = '([^']+)'/, "CACHE_VERSION = '$1-provera'"));
  res.writeHead(200, { 'Content-Type': TIPOVI[path.extname(fajl).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(telo);
});

function cekaj(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function proveriUredjaj(b, ime, opcije, dodir) {
  var ctx = await b.newContext(opcije);
  var pg = await ctx.newPage();
  var konzola = [];
  pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.type() + ': ' + m.text()); });
  pg.on('pageerror', function (e) { konzola.push('pageerror: ' + e.message); });
  await pg.goto(URL);
  await cekaj(3300); // naslovna animacija
  var skrol = [], malo = [], fontovi = [];
  for (var i = 0; i < EKRANI.length; i++) {
    var e = EKRANI[i];
    await pg.evaluate(function (h) { location.hash = h; }, e);
    await cekaj(250);
    var r = await pg.evaluate(function () {
      function vid(el) {
        var s = getComputedStyle(el), b = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && b.width > 1 && b.height > 1 && el.closest('.ekran.aktivan, header, .donja-traka');
      }
      var malo = Array.prototype.slice.call(document.querySelectorAll('button, a, summary, .prekidac span, input:not([type=radio]):not([type=checkbox]):not([type=file])'))
        .filter(vid).map(function (el) { var b = el.getBoundingClientRect(); return [el, b]; })
        .filter(function (x) { return x[1].width < 43.5 || x[1].height < 43.5; })
        .map(function (x) { return (x[0].id || x[0].className || x[0].tagName) + ' ' + Math.round(x[1].width) + '×' + Math.round(x[1].height); });
      var fontovi = Array.prototype.slice.call(document.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=file]), textarea'))
        .filter(function (el) { return el.offsetParent; })
        .map(function (el) { return parseFloat(getComputedStyle(el).fontSize); }).filter(function (f) { return f < 16; });
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, malo: malo, fontovi: fontovi };
    });
    if (r.sw > r.iw) skrol.push(e + ' (' + r.sw + ' > ' + r.iw + ')');
    malo = malo.concat(r.malo.map(function (x) { return e + ': ' + x; }));
    fontovi = fontovi.concat(r.fontovi);
  }
  stavka('Uređaji', ime + ': bez horizontalnog skrola', !skrol.length, skrol.join('; '));
  stavka('Izgled', ime + ': dodirne površine ≥ 44×44 px', !malo.length, Array.from(new Set(malo)).slice(0, 6).join('; '));
  stavka('Uređaji', ime + ': polja za kucanje ≥ 16 px', !fontovi.length, fontovi.join(','));
  if (dodir) {
    await pg.evaluate(function () { location.hash = 'tablica'; });
    await cekaj(200);
    await pg.touchscreen.tap(200, 400); await cekaj(80); await pg.touchscreen.tap(200, 400); await cekaj(400);
    var zum = await pg.evaluate(function () { return visualViewport.scale; });
    stavka('Uređaji', ime + ': dvostruki dodir ne zumira', zum === 1, 'scale = ' + zum);
    // dva prsta i dugi dodir: ništa se ne zumira, tekst se ne označava i ne otvara se meni (osim u poljima)
    var dva = await pg.evaluate(function () {
      function dodir(id, x) { return new Touch({ identifier: id, target: document.body, clientX: x, clientY: 300 }); }
      var t2 = [dodir(1, 100), dodir(2, 250)];
      var start = new TouchEvent('touchstart', { touches: t2, targetTouches: t2, changedTouches: [t2[1]], cancelable: true, bubbles: true });
      document.body.dispatchEvent(start);
      var jedan = [dodir(3, 100)];
      var start1 = new TouchEvent('touchstart', { touches: jedan, targetTouches: jedan, changedTouches: jedan, cancelable: true, bubbles: true });
      document.body.dispatchEvent(start1);
      var naslov = document.querySelector('.tekuce-zaglavlje .levo'), polje = document.querySelector('#u-z1');
      var sel1 = new Event('selectstart', { bubbles: true, cancelable: true }); naslov.dispatchEvent(sel1);
      var sel2 = new Event('selectstart', { bubbles: true, cancelable: true }); polje.dispatchEvent(sel2);
      var meni = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); naslov.dispatchEvent(meni);
      return {
        dvaPrsta: start.defaultPrevented, jedanPrst: start1.defaultPrevented,
        tekst: getComputedStyle(naslov).userSelect || getComputedStyle(naslov).webkitUserSelect, polje: getComputedStyle(polje).userSelect || getComputedStyle(polje).webkitUserSelect,
        oznacavanje: sel1.defaultPrevented, oznacavanjePolja: sel2.defaultPrevented, meni: meni.defaultPrevented,
        touchAction: getComputedStyle(document.documentElement).touchAction
      };
    });
    stavka('Uređaji', ime + ': dva prsta ne rade ništa, dugi dodir ne označava tekst i ne otvara meni (polja za kucanje rade)',
      dva.dvaPrsta && !dva.jedanPrst && dva.tekst === 'none' && dva.polje !== 'none' && dva.oznacavanje && !dva.oznacavanjePolja && dva.meni && !/pinch|manipulation|auto/.test(dva.touchAction),
      JSON.stringify(dva));
    await pg.evaluate(function () { location.hash = 'proracun'; });
    await cekaj(200);
    var poslednje = await pg.evaluate(function () { var p = Array.prototype.slice.call(document.querySelectorAll('#forma-proracun input')).filter(function (x) { return x.offsetParent && x.type !== 'radio'; }); return '#' + p[p.length - 1].id; });
    await pg.tap(poslednje); await cekaj(700);
    var tast = await pg.evaluate(function (sel) {
      var r = document.querySelector(sel).getBoundingClientRect();
      return { traka: getComputedStyle(document.querySelector('.donja-traka')).display === 'none', vidljivo: r.top >= 0 && r.bottom <= visualViewport.height };
    }, poslednje);
    stavka('Uređaji', ime + ': dok se kuca, traka se sklanja i polje je vidljivo', tast.traka && tast.vidljivo, JSON.stringify(tast));
    await pg.evaluate(function () { document.activeElement.blur(); });
  } else {
    await pg.evaluate(function () { location.hash = 'proracun'; });
    await cekaj(250);
    var kolone = await pg.evaluate(function () { return getComputedStyle(document.querySelector('main')).gridTemplateColumns.split(' ').length; });
    stavka('Uređaji', ime + ': tri kolone', kolone === 3, kolone + ' kolone');
    // tastatura: Tab do „Podeli“, Enter otvara prozor, Escape zatvara i vraća fokus
    await pg.evaluate(function () { location.hash = 'podesavanja'; });
    await cekaj(250);
    await pg.focus('#dugme-podeli'); await pg.keyboard.press('Enter'); await cekaj(300);
    var otvoren = await pg.evaluate(function () { return document.querySelector('#prozor-podeli').open; });
    await pg.keyboard.press('Escape'); await cekaj(200);
    var zatvoren = await pg.evaluate(function () { return !document.querySelector('#prozor-podeli').open && document.activeElement.id === 'dugme-podeli'; });
    stavka('Uređaji', ime + ': rad tastaturom (Enter otvara, Escape zatvara i vraća fokus)', otvoren && zatvoren);
  }
  // stranica „Šta je novo“
  await pg.goto(URL + 'novosti.html'); await cekaj(600);
  var nov = await pg.evaluate(function () {
    var slike = Array.prototype.slice.call(document.images);
    var male = Array.prototype.slice.call(document.querySelectorAll('a')).filter(function (a) { var b = a.getBoundingClientRect(); return b.width && (b.height < 43.5); }).map(function (a) { return a.textContent.trim().slice(0, 20); });
    return { strana: /Šta je novo/.test((document.querySelector('h1') || {}).textContent || ''), skrol: document.documentElement.scrollWidth <= innerWidth, slike: slike.length, male: male };
  });
  await pg.evaluate(function () { return Promise.all(Array.prototype.slice.call(document.images).map(function (i) { i.loading = 'eager'; return i.decode().then(function () { return true; }, function () { return false; }); })); }).then(function (ok) { nov.neucitane = ok.filter(function (x) { return !x; }).length; });
  stavka('Uređaji', ime + ': „Šta je novo“ — bez skrola u stranu, sve slike se učitavaju, linkovi ≥ 44 px', nov.strana && nov.slike > 0 && nov.skrol && !nov.neucitane && !nov.male.length,
    (nov.strana ? '' : 'NIJE otvorena stranica „Šta je novo“; ') + 'slika: ' + nov.slike + (nov.neucitane ? ', neučitano: ' + nov.neucitane : '') + (nov.male.length ? ', mali linkovi: ' + nov.male.join('; ') : ''));
  stavka('Uređaji', ime + ': u konzoli nema grešaka ni upozorenja', !konzola.length, konzola.slice(0, 4).join(' | '));
  await ctx.close();
}

async function proveriPWA(b) {
  var ctx = await b.newContext();
  var pg = await ctx.newPage();
  var konzola = [];
  pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.text()); });
  pg.on('pageerror', function (e) { konzola.push(e.message); });
  await pg.goto(URL);
  await pg.waitForFunction(function () { return navigator.serviceWorker.controller; }, null, { timeout: 15000 });
  await cekaj(3300);
  // upiši probnu vrednost u prvo polje proračuna
  var prvo = await pg.evaluate(function () { return '#' + document.querySelector('#forma-proracun input').id; });
  await pg.fill(prvo, '21'); await cekaj(150);
  await ctx.setOffline(true);
  await pg.reload(); await cekaj(3300);
  var off = [];
  for (var i = 0; i < EKRANI.length; i++) {
    await pg.evaluate(function (h) { location.hash = h; }, EKRANI[i]); await cekaj(200);
    off.push(await pg.evaluate(function (h) { var s = document.querySelector('#ekran-' + h); return s.classList.contains('aktivan') && s.innerText.length > 40; }, EKRANI[i]));
  }
  stavka('PWA', 'Offline: svih 5 ekrana se učitava bez mreže', off.every(Boolean), off.join(','));
  var npg = await ctx.newPage();
  await npg.goto(URL + 'novosti.html').catch(function () {}); await cekaj(800);
  var novOff = await npg.evaluate(function () {
    return Promise.all(Array.prototype.slice.call(document.images).map(function (i) { i.loading = 'eager'; return i.decode().then(function () { return 1; }, function () { return 0; }); }))
      .then(function (r) { return { naslov: /Šta je novo/.test((document.querySelector('h1') || {}).textContent || ''), slike: r.length, ok: r.reduce(function (a, b) { return a + b; }, 0) }; });
  }).catch(function () { return { naslov: false, slike: 0, ok: 0 }; });
  stavka('PWA', 'Offline: „Šta je novo“ se otvara sa svim slikama', novOff.naslov && novOff.slike > 0 && novOff.ok === novOff.slike, novOff.ok + '/' + novOff.slike + ' slika');
  await npg.close();
  await ctx.setOffline(false);
  podmetniNovuVerziju = true;
  await pg.evaluate(function () { location.hash = 'podesavanja'; }); await cekaj(200);
  await pg.click('#dugme-proveri'); await cekaj(3500);
  var poruka = await pg.textContent('#stanje-verzije');
  stavka('PWA', '„Proveri novu verziju“ prikazuje „Nova verzija je spremna“', /Nova verzija je spremna/.test(poruka), poruka);
  var osvezeno = false;
  try { await Promise.all([pg.waitForNavigation({ timeout: 8000 }), pg.click('#dugme-osvezi')]); osvezeno = true; } catch (e) { /* ostaje false */ }
  await cekaj(3300);
  await pg.evaluate(function () { location.hash = 'podesavanja'; }); await cekaj(1500);
  var kes = await pg.textContent('[data-verzija-kesa]');
  stavka('PWA', '„Osveži“ učitava novu verziju', osvezeno && /-provera$/.test(kes), 'keš: ' + kes);
  var sacuvano = await pg.inputValue(prvo);
  stavka('PWA', 'Sačuvani podaci (localStorage) ostaju posle ažuriranja', sacuvano === '21', prvo + ' = ' + sacuvano);
  stavka('PWA', 'Konzola čista tokom offline rada i ažuriranja', !konzola.length, konzola.slice(0, 3).join(' | '));
  podmetniNovuVerziju = false;
  await ctx.close();
}

// „Pošalji utisak“: prozor, upozorenja, tehnički podaci, red bez mreže, dijagnostika, retko pitanje.
// Slanje ide na lažnu adresu koju presreće Playwright — prava tabela se nikad ne dira.
var LAZNA_ADRESA = 'https://script.google.com/macros/s/PROVERA/exec';
async function proveriPovratne(b) {
  var ctx = await b.newContext(Object.assign({}, devices['iPhone 13']));
  await ctx.addInitScript(function (a) { window.ZORAN_ADRESA_POVRATNIH = a; }, LAZNA_ADRESA);
  var poslato = [];
  await ctx.route(LAZNA_ADRESA, function (route) {
    poslato.push(JSON.parse(route.request().postData() || '{}'));
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
  });
  var pg = await ctx.newPage();
  var konzola = [];
  pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.type() + ': ' + m.text()); });
  pg.on('pageerror', function (e) { konzola.push('pageerror: ' + e.message); });
  await pg.goto(URL);
  await cekaj(3300);
  await pg.evaluate(function () { location.hash = 'podesavanja'; }); await cekaj(250);
  await pg.click('#dugme-utisak'); await cekaj(300);
  var stanje = await pg.evaluate(function () {
    var d = document.querySelector('#prozor-utisak');
    return { modal: d.matches(':modal'), dijag: document.querySelector('#utisak-dijag').checked, vrsta: document.querySelector('input[name="vrsta-utiska"]:checked').value,
      skrol: document.documentElement.scrollWidth <= innerWidth, fokus: document.activeElement.id };
  });
  stavka('Povratne', 'Prozor se otvara iznad svega (modalno), fokus u poruci, „Priloži tehničke podatke“ uključeno', stanje.modal && stanje.dijag && stanje.vrsta === 'bug' && stanje.fokus === 'utisak-tekst' && stanje.skrol, JSON.stringify(stanje));
  var male = await pg.evaluate(function () {
    return Array.prototype.slice.call(document.querySelectorAll('#prozor-utisak button, #prozor-utisak .prekidac span, #prozor-utisak textarea, #prozor-utisak input[type=email], #prozor-utisak .potvrda-polje'))
      .map(function (el) { var r = el.getBoundingClientRect(); return [el.id || el.textContent.trim().slice(0, 14), r]; })
      .filter(function (x) { return x[1].width < 43.5 || x[1].height < 43.5; }).map(function (x) { return x[0] + ' ' + Math.round(x[1].width) + '×' + Math.round(x[1].height); });
  });
  stavka('Povratne', 'Prozor: dodirne površine ≥ 44×44 px', !male.length, male.join('; '));
  // prazna poruka
  await pg.click('#utisak-posalji'); await cekaj(300);
  var prazno = await pg.evaluate(function () { return { g: document.querySelector('#utisak-tekst-greska').textContent, otvoren: document.querySelector('#prozor-utisak').open }; });
  // neispravan mejl
  await pg.fill('#utisak-tekst', 'Probna poruka iz automatske provere'); await pg.fill('#utisak-mejl', 'nije-mejl');
  await pg.click('#utisak-posalji'); await cekaj(300);
  var los = await pg.evaluate(function () { return { g: document.querySelector('#utisak-mejl-greska').textContent, otvoren: document.querySelector('#prozor-utisak').open }; });
  stavka('Povratne', 'Prazna poruka i neispravan mejl daju upozorenje i ništa se ne šalje', /Napiši poruku/.test(prazno.g) && prazno.otvoren && /nije ispravan/.test(los.g) && los.otvoren && poslato.length === 0, JSON.stringify([prazno, los, poslato.length]));
  // ispravno, sa tehničkim podacima
  await pg.evaluate(function () { window.dispatchEvent(new ErrorEvent('error', { message: 'Probna greška access_token=ya29.TAJNA_VREDNOST_123 key=AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE1' })); });
  await pg.fill('#utisak-mejl', 'proba@primer.rs');
  await pg.click('#utisak-posalji'); await cekaj(1200);
  var tost1 = await pg.textContent('#tost');
  var p1 = poslato[0] || {};
  stavka('Povratne', 'Slanje: vrsta, tekst, mejl, anonimni ID, jezik, verzija, ekran, uređaj i tehnički podaci; „Hvala — poslato“',
    poslato.length === 1 && p1.type === 'bug' && /Probna poruka/.test(p1.text) && p1.email === 'proba@primer.rs' && /^[0-9a-f-]{36}$/.test(p1.uid || '') && p1.lang === 'sr' && p1.version && p1.screen === 'podesavanja' && /UA:/.test(p1.device || '') && /Greške \(\d+\)/.test(p1.tech || '') && /Hvala — poslato/.test(tost1),
    JSON.stringify({ n: poslato.length, type: p1.type, lang: p1.lang, screen: p1.screen, tost: tost1 }));
  stavka('Povratne', 'Tehnički podaci ne sadrže ključeve ni tokene', !/TAJNA_VREDNOST|AIzaSyFAKE/.test(JSON.stringify(p1)), (p1.tech || '').split('\n').filter(function (r) { return /Probna greška/.test(r); })[0] || 'nema greške u izveštaju');
  // isključeni tehnički podaci, mejl zapamćen
  await pg.click('#dugme-utisak'); await cekaj(300);
  var zapamcen = await pg.inputValue('#utisak-mejl');
  await pg.click('#prozor-utisak .izbor-vrste label:nth-child(2)');
  await pg.fill('#utisak-tekst', 'Ideja bez tehničkih podataka');
  await pg.click('#prozor-utisak .potvrda-polje'); await pg.click('#utisak-posalji'); await cekaj(1200);
  var p2 = poslato[1] || {};
  stavka('Povratne', 'Tehnički podaci se mogu isključiti; mejl se pamti za sledeći put', p2.type === 'idea' && !('tech' in p2) && zapamcen === 'proba@primer.rs', JSON.stringify({ type: p2.type, tech: 'tech' in p2, mejl: zapamcen }));
  // bez mreže: u red, pa slanje kad se mreža vrati
  await ctx.setOffline(true);
  await pg.click('#dugme-utisak'); await cekaj(300);
  await pg.fill('#utisak-tekst', 'Poruka poslata bez mreže'); await pg.click('#utisak-posalji'); await cekaj(1000);
  var off = await pg.evaluate(function () { return { tost: document.querySelector('#tost').textContent, red: JSON.parse(localStorage.getItem('zoran.povratne-red') || '[]').length }; });
  var preMreze = poslato.length;
  await ctx.setOffline(false); await cekaj(2000);
  var red2 = await pg.evaluate(function () { return JSON.parse(localStorage.getItem('zoran.povratne-red') || '[]').length; });
  stavka('Povratne', 'Bez mreže: „Sačuvano — poslaće se…“, poruka čeka u redu i šalje se kad se mreža vrati', /Sačuvano/.test(off.tost) && off.red === 1 && preMreze === 2 && poslato.length === 3 && red2 === 0 && /bez mreže/.test((poslato[2] || {}).text || ''),
    JSON.stringify({ tost: off.tost, red: off.red, posle: red2, poslato: poslato.length }));
  // dijagnostika
  await pg.fill('#dijag-napomena', 'Napomena uz dijagnostiku');
  await pg.click('#dugme-posalji-dijag'); await cekaj(1200);
  var d = poslato[3] || {};
  stavka('Povratne', 'Podešavanja › Dijagnostika › „Pošalji dijagnostiku“ šalje izveštaj (kind: diag) sa napomenom', d.kind === 'diag' && d.note === 'Napomena uz dijagnostiku' && /ZORAN \d/.test(d.report || '') && !/TAJNA_VREDNOST|AIzaSyFAKE/.test(d.report || ''), JSON.stringify({ kind: d.kind, note: d.note }));
  // retko pitanje: posle 3. radnje u Tablici, jednom
  await pg.evaluate(function () { location.hash = 'tablica'; }); await cekaj(300);
  var vidljivo = [];
  for (var i = 0; i < 4; i++) {
    await pg.click('#dugme-kopiraj-sve'); await cekaj(800);
    vidljivo.push(await pg.evaluate(function () { var r = document.querySelector('#pitanje-utisak'); return !!(r && r.offsetParent); }));
  }
  var preklapa = await pg.evaluate(function () {
    var r = document.querySelector('#pitanje-utisak'); if (!r) return 'nema';
    var a = r.getBoundingClientRect();
    return Array.prototype.slice.call(document.querySelectorAll('#ekran-tablica .dugmad button')).some(function (bt) { var q = bt.getBoundingClientRect(); return !(q.bottom <= a.top || q.top >= a.bottom || q.right <= a.left || q.left >= a.right); });
  });
  await pg.click('#pitanje-utisak .palac'); await cekaj(1200);
  var ocena = poslato[4] || {};
  stavka('Povratne', 'Retko pitanje: posle 3. radnje, ne prekriva dugmad, palac gore šalje ocenu jednim dodirom', vidljivo.join(',') === 'false,false,true,true' && preklapa === false && ocena.type === 'like',
    JSON.stringify({ vidljivo: vidljivo, preklapa: preklapa, ocena: ocena.type }));
  stavka('Povratne', 'Konzola čista tokom slanja, rada bez mreže i dijagnostike', !konzola.filter(function (k) { return !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(k); }).length, konzola.slice(0, 3).join(' | '));
  await ctx.close();
}

// Google Drive: lažni Google nalog (window.google) i lažni Drive koji presreće Playwright — pravi Google se ne dira.
function napraviLazniDrive() {
  var fajlovi = {}, brojac = 0, sat = Date.now();
  var d = { fajlovi: fajlovi, otpremanja: [] };
  var CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
  d.obradi = function (route) {
    var req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    var u = new (require('url').URL)(req.url());
    function json(o) { return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(o) }); }
    if (!/^Bearer tok-/.test(req.headers().authorization || '')) return route.fulfill({ status: 401, headers: CORS, body: '{}' });
    var m;
    if (u.pathname === '/drive/v3/files' && req.method() === 'GET') return json({ files: Object.keys(fajlovi).map(function (id) { return { id: id, modifiedTime: fajlovi[id].vreme }; }) });
    if ((m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/))) return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: fajlovi[m[1]].sadrzaj });
    if (u.pathname === '/drive/v3/about') return json({ user: { emailAddress: 'proba@gmail.com' } });
    if ((m = u.pathname.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/))) {
      var granica = (req.headers()['content-type'].match(/boundary=(.+)$/) || [])[1];
      var delovi = req.postData().split('--' + granica).filter(function (x) { return x.trim() && x.trim() !== '--'; });
      var sadrzaj = delovi[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      var id = m[1] || ('f' + (++brojac));
      sat += 1000;
      fajlovi[id] = { sadrzaj: sadrzaj, vreme: new Date(sat).toISOString() };
      d.otpremanja.push(JSON.parse(sadrzaj));
      return json({ id: id, modifiedTime: fajlovi[id].vreme });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' });
  };
  return d;
}
function lazniGoogle() {
  window.__googlePrijava = 0;
  window.google = { accounts: { oauth2: {
    initTokenClient: function (cfg) { return { requestAccessToken: function () { window.__googlePrijava++; setTimeout(function () { cfg.callback({ access_token: 'tok-proba', expires_in: 3599 }); }, 50); } }; },
    revoke: function (t, cb) { if (cb) cb(); }
  } } };
}
async function proveriDrive(b) {
  var drive = napraviLazniDrive();
  var konzola = [];
  async function uredjaj(opcije) {
    var ctx = await b.newContext(opcije);
    await ctx.addInitScript(lazniGoogle);
    await ctx.route('https://www.googleapis.com/**', drive.obradi);
    await ctx.route('https://accounts.google.com/**', function (r) { r.abort(); });
    var pg = await ctx.newPage();
    pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.type() + ': ' + m.text()); });
    pg.on('pageerror', function (e) { konzola.push('pageerror: ' + e.message); });
    return { ctx: ctx, pg: pg };
  }
  // Drive je uključen za sve: vidi se bez posebnog linka; stari probni link se samo briše iz adrese
  var a = await uredjaj(Object.assign({}, devices['iPhone 13']));
  await a.pg.goto(URL + '#podesavanja'); await cekaj(3400);
  var vidljivoSvima = await a.pg.evaluate(function () { var s = document.querySelector('#drive-sekcija'); return !s.hidden && !!s.offsetParent; });
  await a.pg.goto(URL + '?drive=1#podesavanja'); await cekaj(3400);
  var vidljivo = await a.pg.evaluate(function () { return { sekcija: !document.querySelector('#drive-sekcija').hidden, adresa: location.search, proba: localStorage.getItem('zoran.drive-proba') }; });
  stavka('Drive', 'Deo za Drive se vidi svima, bez posebnog linka (stari link ?drive=1 se samo briše iz adrese)', vidljivoSvima && vidljivo.sekcija && vidljivo.adresa === '' && vidljivo.proba === null, JSON.stringify({ vidljivoSvima: vidljivoSvima, vidljivo: vidljivo }));
  await a.pg.evaluate(function () { location.hash = 'proracun'; }); await cekaj(300);
  await a.pg.fill('#u-z1', '23'); await cekaj(300);
  await a.pg.evaluate(function () { location.hash = 'podesavanja'; }); await cekaj(300);
  await a.pg.click('#dugme-drive-povezi'); await cekaj(1500);
  var st1 = await a.pg.textContent('#drive-stanje');
  var prvo = drive.otpremanja[0] || { podaci: {} };
  stavka('Drive', 'Prvi uređaj: „Poveži“ otvara Google prijavu i šalje podatke na Drive (bez reda poruka i anonimnog ID-a)',
    drive.otpremanja.length === 1 && /"z1":23/.test(prvo.podaci['zoran.unos'] || '') && !('zoran.povratne-red' in prvo.podaci) && !('zoran.povratne-id' in prvo.podaci) && /Povezano sa proba@gmail\.com/.test(st1),
    st1 + ' | otpremanja: ' + drive.otpremanja.length);
  // izmena se sama čuva dok pristup važi
  await a.pg.evaluate(function () { location.hash = 'proracun'; }); await cekaj(200);
  await a.pg.fill('#u-z1', '24'); await cekaj(5500);
  var posl = drive.otpremanja[drive.otpremanja.length - 1] || { podaci: {} };
  stavka('Drive', 'Izmena se sama sačuva na Drive dok pristup važi (bez novog dodira)', drive.otpremanja.length >= 2 && /"z1":24/.test(posl.podaci['zoran.unos'] || ''), 'otpremanja: ' + drive.otpremanja.length);
  // drugi uređaj: prijava sama nađe kopiju i ponudi je
  var r = await uredjaj({ viewport: { width: 1440, height: 900 } });
  await r.pg.goto(URL + '#podesavanja'); await cekaj(3400);
  await r.pg.click('#dugme-drive-povezi'); await cekaj(1500);
  var ponuda = await r.pg.evaluate(function () { var d = document.querySelector('#prozor-drive'); return { otvoren: d.open && d.matches(':modal'), opis: document.querySelector('#drive-kopija-opis').textContent }; });
  await Promise.all([r.pg.waitForNavigation({ timeout: 8000 }).catch(function () {}), r.pg.click('#drive-kopija-ucitaj')]);
  await cekaj(3600);
  var posle = await r.pg.evaluate(function () { return { z1: document.querySelector('#u-z1').value, tost: document.querySelector('#tost').textContent }; });
  stavka('Drive', 'Drugi uređaj: posle prijave sam nađe kopiju, ponudi je i „Učitaj kopiju“ prenosi podatke',
    ponuda.otvoren && /Sačuvana .*z₁ = 24/.test(ponuda.opis) && posle.z1 === '24' && /Učitani su podaci sa Google Drive-a/.test(posle.tost),
    JSON.stringify({ ponuda: ponuda, posle: posle }));
  // pristup istekao (nova sesija): podsetnik „Sinhronizuj“ pri otvaranju
  await r.pg.evaluate(function () { sessionStorage.clear(); }); await r.pg.reload(); await cekaj(3600);
  var baner = await r.pg.evaluate(function () { return !document.querySelector('#drive-baner').hidden; });
  await r.pg.click('#drive-baner-sinh'); await cekaj(1500);
  var posleDodira = await r.pg.evaluate(function () { return { baner: !document.querySelector('#drive-baner').hidden, prijava: window.__googlePrijava, ponuda: document.querySelector('#prozor-drive').open }; });
  stavka('Drive', 'Kad pristup istekne: pri otvaranju podsetnik, jedan dodir „Sinhronizuj“ obnavlja pristup bez nove ponude',
    baner && !posleDodira.baner && posleDodira.prijava === 1 && !posleDodira.ponuda, JSON.stringify({ baner: baner, posleDodira: posleDodira }));
  stavka('Drive', 'Konzola čista tokom povezivanja i sinhronizacije', !konzola.length, konzola.slice(0, 3).join(' | '));
  await a.ctx.close(); await r.ctx.close();
}

// Raspodela pomeranja: zadat koeficijent jednog zupčanika (0 = bez pomeranja)
async function proveriRaspodelu(b) {
  var ctx = await b.newContext(Object.assign({}, devices['iPhone 13']));
  var pg = await ctx.newPage();
  var konzola = [];
  pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.text()); });
  pg.on('pageerror', function (e) { konzola.push(e.message); });
  await pg.goto(URL + '?z1=40&z2=40&mn=2.5&beta=0&alfaN=20&b=40&a=101#proracun'); await cekaj(3400);
  var pre = await pg.evaluate(function () { var x = document.querySelector('#polje-xz'); return { skriveno: x.hidden && !x.offsetParent, din: document.querySelector('input[name="raspodela"]:checked').value }; });
  await pg.click('label:has(input[name="raspodela"][value="x1"])'); await cekaj(400);
  var x1 = await pg.evaluate(function () {
    var redovi = Array.prototype.slice.call(document.querySelectorAll('#tablica-pomeranje .red')).map(function (r) { return r.querySelector('.naziv').textContent + '=' + r.querySelector('.vrednost').textContent; });
    return { polje: !document.querySelector('#polje-xz').hidden, vrednost: document.querySelector('#u-xz').value, redovi: redovi, napomena: document.querySelector('#tablica-pomeranje .sitno') ? document.querySelector('#tablica-pomeranje .sitno').textContent : '', status: document.querySelector('#provera-status').textContent };
  });
  var ok1 = pre.skriveno && pre.din === 'din' && x1.polje && x1.vrednost === '0' &&
    x1.redovi.some(function (r) { return /x₁ \(mali\)=0,0000/.test(r); }) && x1.redovi.some(function (r) { return /x₂ \(veliki\)=0,4146/.test(r); }) && /bez pomeranja/.test(x1.napomena);
  stavka('Proračun', 'Raspodela „zadajem x₁“: polje sa 0, x₁ = 0, x₂ = Σx = 0,4146, napomena „bez pomeranja“', ok1, JSON.stringify(x1).slice(0, 300));
  // prazno polje → poruka; posle ponovnog otvaranja izbor ostaje
  await pg.fill('#u-xz', ''); await cekaj(300);
  var poruka = await pg.textContent('#p-xz');
  await pg.fill('#u-xz', '0'); await cekaj(600);
  await pg.goto(URL + '#proracun'); await cekaj(3400);
  var posle = await pg.evaluate(function () { return { nacin: document.querySelector('input[name="raspodela"]:checked').value, xz: document.querySelector('#u-xz').value, vidljivo: !document.querySelector('#polje-xz').hidden }; });
  stavka('Proračun', 'Prazno polje daje poruku „upiši 0“; izbor raspodele ostaje sačuvan posle ponovnog otvaranja', /upiši 0/.test(poruka) && posle.nacin === 'x1' && posle.xz === '0' && posle.vidljivo, JSON.stringify({ poruka: poruka, posle: posle }));
  // jednako klizanje: polje za koeficijent se skriva, ζ₁ = ζ₂
  await pg.click('label:has(input[name="raspodela"][value="klizanje"])'); await cekaj(500);
  var kl = await pg.evaluate(function () {
    var o = {};
    Array.prototype.slice.call(document.querySelectorAll('#tablica-pomeranje .red')).forEach(function (r) { o[r.querySelector('.naziv').textContent.trim()] = r.querySelector('.vrednost').textContent.trim(); });
    var x = document.querySelector('#polje-xz');
    return { z1: o['Specifično klizanje u podnožju ζ₁'], z2: o['Specifično klizanje u podnožju ζ₂'], xz: !x.offsetParent, nap: (document.querySelector('#tablica-pomeranje .sitno:last-of-type') || {}).textContent || '' };
  });
  stavka('Proračun', 'Raspodela „jednako klizanje“: ζ₁ = ζ₂ u tablici, polje za koeficijent skriveno, napomena', kl.z1 && kl.z1 === kl.z2 && kl.xz && /jednako na oba/.test(kl.nap), JSON.stringify(kl));
  stavka('Proračun', 'Raspodela: konzola čista', !konzola.length, konzola.slice(0, 3).join(' | '));
  await ctx.close();
}

// Kao prava aplikacija: Android „Nazad“ zatvara prozor i vraća na Proračun, bez povlačenja za osvežavanje
async function proveriNazad(b) {
  var ctx = await b.newContext(Object.assign({}, devices['Pixel 7']));
  var pg = await ctx.newPage();
  var konzola = [];
  pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.text()); });
  pg.on('pageerror', function (e) { konzola.push(e.message); });
  await pg.goto(URL); await cekaj(3400);
  function ekran() { return pg.evaluate(function () { var a = document.querySelector('.ekran.aktivan'); return a ? a.id.replace('ekran-', '') : ''; }); }
  await pg.click('.donja-traka [data-idi="tablica"]'); await cekaj(250);
  await pg.click('.donja-traka [data-idi="savetnik"]'); await cekaj(250);
  await pg.click('.donja-traka [data-idi="podesavanja"]'); await cekaj(250);
  var e1 = await ekran();
  await pg.click('#dugme-podeli'); await cekaj(300);
  var otvoren = await pg.evaluate(function () { return document.querySelector('#prozor-podeli').open; });
  await pg.goBack(); await cekaj(400);
  var posleNazadProzor = await pg.evaluate(function () { return { otvoren: document.querySelector('#prozor-podeli').open, ekran: document.querySelector('.ekran.aktivan').id }; });
  // prozor zatvoren dugmetom: ne ostaje „prazan“ korak u istoriji
  await pg.click('#dugme-utisak'); await cekaj(300);
  await pg.click('#utisak-odustani'); await cekaj(400);
  var e2 = await ekran();
  await pg.goBack(); await cekaj(400);
  var e3 = await ekran();
  var izlaz = await pg.evaluate(function () { return history.state && (history.state.zoranKorak || history.state.zoranProzor) ? 'ima još koraka' : 'početni korak'; });
  var stil = await pg.evaluate(function () { return getComputedStyle(document.documentElement).overscrollBehaviorY; });
  stavka('Uređaji', 'Android „Nazad“: prvo zatvara prozor, pa vraća na Proračun; sa Proračuna izlazi (bez praznih koraka)',
    e1 === 'podesavanja' && otvoren && !posleNazadProzor.otvoren && posleNazadProzor.ekran === 'ekran-podesavanja' && e2 === 'podesavanja' && e3 === 'proracun' && izlaz === 'početni korak',
    JSON.stringify({ e1: e1, otvoren: otvoren, posleNazadProzor: posleNazadProzor, e2: e2, e3: e3, izlaz: izlaz }));
  stavka('Uređaji', 'Bez „povuci za osvežavanje“ i elastičnog odskakanja (overscroll-behavior: none)', stil === 'none', stil);
  stavka('Uređaji', '„Nazad“: konzola čista', !konzola.length, konzola.slice(0, 3).join(' | '));
  await ctx.close();
}

// Tablica za radionički crtež: odstupanja → gornja/donja mera, izvoz u CSV, čuvanje unosa
async function proveriCrtez(b) {
  var ctx = await b.newContext(Object.assign({ acceptDownloads: true }, devices['iPhone 13']));
  var pg = await ctx.newPage();
  var konzola = [];
  pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.text()); });
  pg.on('pageerror', function (e) { konzola.push(e.message); });
  await pg.goto(URL + '?z1=40&z2=40&mn=2.5&beta=0&alfaN=20&b=40&a=101#tablica'); await cekaj(3400);
  await pg.fill('#c-asne1', '-0,019'); await pg.fill('#c-asni1', '-0,059'); await pg.fill('#c-kval1', '7f25 DIN 3967'); await pg.fill('#c-crtez2', 'D-2'); await cekaj(400);
  var t = await pg.evaluate(function () {
    var o = {};
    Array.prototype.slice.call(document.querySelectorAll('#tablice-crtez .tablica')).forEach(function (tb, i) {
      Array.prototype.slice.call(tb.querySelectorAll('.red')).forEach(function (r) { o[i + ':' + r.querySelector('.naziv').textContent.trim()] = r.querySelector('.vrednost').textContent.trim(); });
    });
    return { o: o, smerSkriven: document.querySelector('#izbor-smer').hidden };
  });
  var o = t.o;
  var ok = o['0:Mera preko zuba — gornja'] === '34,949' && o['0:Mera preko zuba — donja'] === '34,911' && !('1:Mera preko zuba — gornja' in o) &&
    o['0:Osno rastojanje a js7'] === '101,000' && /±0,0175/.test(o['0:Odstupanje osnog rastojanja'] || '') && o['0:Kvalitet i tolerancija'] === '7f25 DIN 3967' &&
    o['0:Spregnuti zupčanik — broj crteža'] === 'D-2' && o['0:Smer zavojnice'] === 'pravi zubi' && t.smerSkriven;
  stavka('Proračun', 'Tablica za crtež: W_k gornja/donja 34,949 / 34,911 (7f25), a js7 ±0,0175, kvalitet, broj crteža spregnutog', ok,
    JSON.stringify({ g: o['0:Mera preko zuba — gornja'], d: o['0:Mera preko zuba — donja'], a: o['0:Odstupanje osnog rastojanja'], smer: o['0:Smer zavojnice'] }));
  // pogrešan redosled odstupanja → poruka
  await pg.fill('#c-asne2', '-0,08'); await pg.fill('#c-asni2', '-0,02'); await cekaj(300);
  var poruka = await pg.textContent('#cp-tol2');
  await pg.fill('#c-asne2', ''); await pg.fill('#c-asni2', ''); await cekaj(300);
  // CSV
  var dl = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }).catch(function () { return null; }), pg.click('#dugme-csv')]);
  var csv = '';
  if (dl[0]) { var put = await dl[0].path(); csv = fs.readFileSync(put, 'utf8'); }
  stavka('Proračun', 'Pogrešan redosled odstupanja daje poruku; „Preuzmi za Excel“ daje CSV sa obe tablice', /mora biti veće/.test(poruka) && /^\ufeff/.test(csv) && /Mera preko zuba Wk gornja;34,949;mm/.test(csv) && /velikog zupčanika/.test(csv) && dl[0] && /zoran-crtez-z40-z40\.csv/.test(dl[0].suggestedFilename()),
    JSON.stringify({ poruka: poruka, ime: dl[0] && dl[0].suggestedFilename(), csv: csv.slice(0, 80) }));
  var sw = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }).catch(function () { return null; }), pg.click('[data-sw="1"]')]);
  var bas = '';
  if (sw[0]) bas = fs.readFileSync(await sw[0].path(), 'latin1');
  stavka('Proračun', '„Makro za SolidWorks — z₂“ preuzima .bas sa ZORAN_ svojstvima (samo ASCII)', sw[0] && /zoran-z40-solidworks\.bas/.test(sw[0].suggestedFilename()) && /ZORAN_PomeranjeProfila/.test(bas) && /^[\x00-\x7F]*$/.test(bas),
    JSON.stringify({ ime: sw[0] && sw[0].suggestedFilename(), duzina: bas.length }));
  await pg.reload(); await cekaj(3400);
  var sacuvano = await pg.evaluate(function () { return document.querySelector('#c-asne1').value + '|' + document.querySelector('#c-kval1').value; });
  stavka('Proračun', 'Unos za tablicu crteža ostaje posle ponovnog otvaranja; konzola čista', sacuvano === '-0,019|7f25 DIN 3967' && !konzola.length, sacuvano + ' ' + konzola.slice(0, 2).join(' | '));
  await ctx.close();
}

// Čvrstoća zuba: bez momenta poruka, sa momentom sigurnosti, preopterećenje upozorava
async function proveriCvrstocu(b) {
  var ctx = await b.newContext(Object.assign({}, devices['Pixel 7']));
  var pg = await ctx.newPage();
  var konzola = [];
  pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.text()); });
  pg.on('pageerror', function (e) { konzola.push(e.message); });
  await pg.goto(URL + '#tablica'); await cekaj(3400);
  var bez = await pg.textContent('#cvrstoca-status');
  await pg.fill('#u-T1', '300'); await pg.fill('#k-n1', '1450'); await cekaj(400);
  function stanje() {
    return pg.evaluate(function () {
      var o = {};
      Array.prototype.slice.call(document.querySelectorAll('#tablica-cvrstoca .red')).forEach(function (r) { o[r.querySelector('.naziv').textContent.trim()] = { v: r.querySelector('.vrednost').textContent.trim(), up: r.classList.contains('upozorenje') }; });
      return { o: o, status: document.querySelector('#cvrstoca-status').textContent };
    });
  }
  var s1 = await stanje();
  var imena = Object.keys(s1.o);
  var ok1 = /Upiši obrtni moment/.test(bez) && imena.some(function (k) { return /^Sigurnost boka SH z₁/.test(k); }) && imena.some(function (k) { return /^Sigurnost korena SF z₂/.test(k); }) &&
    imena.some(function (k) { return /Dinamički faktor Kv/.test(k); }) && /dovoljna/.test(s1.status);
  stavka('Proračun', 'Čvrstoća zuba: bez momenta jasna poruka; sa T₁ = 300 N·m i n₁ = 1450 sigurnosti boka i korena, „dovoljna“', ok1, JSON.stringify({ bez: bez.slice(0, 40), status: s1.status.slice(0, 60), redova: imena.length }));
  await pg.selectOption('#k-mat1', 'c45n'); await pg.fill('#u-T1', '20000'); await cekaj(400);
  var s2 = await stanje();
  var crveno = Object.keys(s2.o).filter(function (k) { return s2.o[k].up; });
  await pg.selectOption('#k-mat2', 'rucno'); await cekaj(300);
  var rucno = await pg.evaluate(function () { return { vidljivo: !document.querySelector('[data-rucno="1"]').hidden, status: document.querySelector('#cvrstoca-status').textContent }; });
  stavka('Proračun', 'Čvrstoća zuba: preopterećenje daje „Nedovoljna sigurnost“ i crvene redove; „ručno“ traži σHlim i σFlim', /Nedovoljna sigurnost/.test(s2.status) && crveno.length > 0 && rucno.vidljivo && /ručno/.test(rucno.status),
    JSON.stringify({ crveno: crveno.length, rucno: rucno }));
  await pg.reload(); await cekaj(3400);
  var sac = await pg.evaluate(function () { return document.querySelector('#k-n1').value + '|' + document.querySelector('#k-mat1').value; });
  stavka('Proračun', 'Čvrstoća zuba: unos ostaje posle ponovnog otvaranja; konzola čista', sac === '1450|c45n' && !konzola.length, sac + ' ' + konzola.slice(0, 2).join(' | '));
  await ctx.close();
}

// Poruka autora: prikaže se, „Kako?“ otvara korake, „Pošalji utisak“ ima pripremljen tekst, posle zatvaranja se ne vraća
async function proveriPoruku(b) {
  var ctx = await b.newContext(Object.assign({}, devices['iPhone 13']));
  var pg = await ctx.newPage();
  var konzola = [];
  pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.text()); });
  pg.on('pageerror', function (e) { konzola.push(e.message); });
  await pg.goto(URL); await cekaj(3400);
  var vidljiv = await pg.evaluate(function () { var b = document.querySelector('#poruka-autora'); return !b.hidden && /SolidWorks/.test(b.textContent); });
  await pg.click('#poruka-autora-vise'); await cekaj(300);
  var prozor = await pg.evaluate(function () { var d = document.querySelector('#prozor-poruka'); return { otvoren: d.open && d.matches(':modal'), koraci: d.querySelectorAll('ol li').length, baner: !document.querySelector('#poruka-autora').hidden }; });
  await pg.click('#poruka-odgovori'); await cekaj(400);
  var utisak = await pg.evaluate(function () { return { otvoren: document.querySelector('#prozor-utisak').open, tekst: document.querySelector('#utisak-tekst').value, vrsta: document.querySelector('input[name="vrsta-utiska"]:checked').value }; });
  await pg.click('#utisak-odustani'); await cekaj(300);
  await pg.reload(); await cekaj(3400);
  var posle = await pg.evaluate(function () { return document.querySelector('#poruka-autora').hidden; });
  stavka('Uređaji', 'Poruka autora: vidi se jednom, „Kako?“ otvara korake, „Pošalji utisak“ sa pripremljenim tekstom, posle se ne vraća',
    vidljiv && prozor.otvoren && prozor.koraci === 5 && !prozor.baner && utisak.otvoren && /Makro za SolidWorks/.test(utisak.tekst) && utisak.vrsta === 'idea' && posle && !konzola.length,
    JSON.stringify({ vidljiv: vidljiv, prozor: prozor, utisak: { otvoren: utisak.otvoren, vrsta: utisak.vrsta }, posle: posle, konzola: konzola.slice(0, 2) }));
  await ctx.close();
}

// Anketa: ponudi se posle nekoliko otvaranja, šalje odgovore (lažna adresa), ne nudi se ponovo; dostupna u Podešavanjima
async function proveriAnketu(b) {
  var ctx = await b.newContext(Object.assign({}, devices['Pixel 7']));
  await ctx.addInitScript(function (a) {
    window.ZORAN_ADRESA_POVRATNIH = a;
    if (!localStorage.getItem('zoran.koriscenje')) {
      localStorage.setItem('zoran.koriscenje', JSON.stringify({ prvi: Date.now(), otvaranja: 4 }));
      localStorage.setItem('zoran.poruke', JSON.stringify({ 'solidworks-makro-2026-11': { procitano: true } }));
    }
  }, LAZNA_ADRESA);
  var poslato = [];
  await ctx.route(LAZNA_ADRESA, function (route) { poslato.push(JSON.parse(route.request().postData() || '{}')); route.fulfill({ status: 200, body: 'ok' }); });
  var pg = await ctx.newPage();
  var konzola = [];
  pg.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') konzola.push(m.text()); });
  pg.on('pageerror', function (e) { konzola.push(e.message); });
  await pg.goto(URL); await cekaj(5000);
  var ponudjena = await pg.evaluate(function () { return !document.querySelector('#molba-anketa').hidden; });
  await pg.click('#anketa-da'); await cekaj(300);
  await pg.click('#anketa-posalji'); await cekaj(200);
  var greska = await pg.textContent('#an-pomaze-greska');
  await pg.click('#prozor-anketa label:has(input[name="an-pomaze"][value="4"])');
  await pg.click('#prozor-anketa label:has(input[name="an-cesto"][value="nedeljno"])');
  await pg.click('#prozor-anketa label:has(input[value="Čvrstoća zuba"])');
  await pg.fill('#an-zelje', 'konusni zupčanici');
  await pg.click('#prozor-anketa label:has(input[name="an-preporuka"][value="da"])');
  await pg.click('#anketa-posalji'); await cekaj(1200);
  var p = poslato[0] || {};
  await pg.reload(); await cekaj(5000);
  var ponovo = await pg.evaluate(function () { return !document.querySelector('#molba-anketa').hidden; });
  await pg.evaluate(function () { location.hash = 'podesavanja'; }); await cekaj(300);
  await pg.click('#dugme-anketa'); await cekaj(300);
  var izPodesavanja = await pg.evaluate(function () { return document.querySelector('#prozor-anketa').open; });
  stavka('Povratne', 'Anketa: ponudi se posle 3+ otvaranja, traži ocenu, šalje odgovore (kind: anketa), ne nudi se ponovo, otvara se iz Podešavanja',
    ponudjena && /ocenu/.test(greska) && p.kind === 'anketa' && p.answers && p.answers.pomaze === 4 && p.answers.cesto === 'nedeljno' && p.answers.koristi.join() === 'Čvrstoća zuba' && /konusni/.test(p.answers.zelje) && p.answers.preporuka === 'da' && !ponovo && izPodesavanja && !konzola.length,
    JSON.stringify({ ponudjena: ponudjena, greska: greska, answers: p.answers, ponovo: ponovo, izPodesavanja: izPodesavanja, konzola: konzola.slice(0, 2) }));
  await ctx.close();
}

function proveriStatiku() {
  // testovi proračuna
  var t = cp.spawnSync(process.execPath, [path.join(KOREN, 'tests', 'proracun.test.js')], { encoding: 'utf8' });
  var red = (t.stdout.match(/Ukupno:.*$/m) || [''])[0];
  stavka('Proračun', 'node tests/proracun.test.js prolazi', t.status === 0, red);
  var td = cp.spawnSync(process.execPath, [path.join(KOREN, 'tests', 'drive.test.js')], { encoding: 'utf8' });
  stavka('Drive', 'node tests/drive.test.js prolazi (snimak, odluka, ponuda kopije, sukob, istekao pristup)', td.status === 0, (td.stdout.match(/Ukupno:.*$/m) || [''])[0]);
  var tp = cp.spawnSync(process.execPath, [path.join(KOREN, 'tests', 'povratne.test.js')], { encoding: 'utf8' });
  stavka('Povratne', 'node tests/povratne.test.js prolazi (unos, red bez mreže, čišćenje izveštaja, retko pitanje, Apps Script)', tp.status === 0, (tp.stdout.match(/Ukupno:.*$/m) || [''])[0]);
  // relativne putanje
  var apsolutne = [];
  ['index.html', 'manifest.json', 'sw.js', 'css/zoran.css'].forEach(function (f) {
    var s = fs.readFileSync(path.join(KOREN, f), 'utf8');
    var m = s.match(/(src|href)="\/[^"]*"|url\(['"]?\/[^)]*\)|["']\/(js|css|icons|fonts)\//g);
    if (m) apsolutne.push(f + ': ' + m.join(', '));
  });
  var man = JSON.parse(fs.readFileSync(path.join(KOREN, 'manifest.json'), 'utf8'));
  stavka('PWA', 'Sve putanje su relativne (./), start_url i scope su "./"', !apsolutne.length && man.start_url === './' && man.scope === './', apsolutne.join('; '));
  // svaki fajl aplikacije je u kešu
  var sw = fs.readFileSync(path.join(KOREN, 'sw.js'), 'utf8');
  var lista = (sw.match(/const FAJLOVI = \[([\s\S]*?)\]/) || ['', ''])[1];
  var uKesu = (lista.match(/'\.\/[^']*'/g) || []).map(function (x) { return x.slice(3, -1); });
  var fale = [];
  function obidji(dir) {
    fs.readdirSync(path.join(KOREN, dir)).forEach(function (f) {
      var rel = dir + '/' + f;
      if (fs.statSync(path.join(KOREN, rel)).isDirectory()) return obidji(rel);
      if (/\.(js|css|woff2|png|jpg|jpeg|webp|svg)$/.test(f) && uKesu.indexOf(rel) < 0) fale.push(rel);
    });
  }
  ['css', 'js', 'fonts', 'icons', 'novosti'].forEach(function (d) { if (fs.existsSync(path.join(KOREN, d))) obidji(d); });
  fs.readdirSync(KOREN).filter(function (f) { return /\.html$/.test(f); }).concat(['manifest.json']).forEach(function (f) { if (uKesu.indexOf(f) < 0) fale.push(f); });
  stavka('PWA', 'Svaki fajl aplikacije je u kešu u sw.js', !fale.length, fale.join(', '));
  // verzije povećane ako su menjani fajlovi aplikacije
  var promenjeno = [];
  try {
    promenjeno = cp.execSync('git diff --name-only origin/main', { cwd: KOREN, encoding: 'utf8' }).split('\n').filter(function (f) { return APP_FAJLOVI.test(f); });
    var git = function (f) { return cp.execSync('git show origin/main:' + f, { cwd: KOREN, encoding: 'utf8' }); };
    var cv = function (s) { return (s.match(/CACHE_VERSION = '([^']+)'/) || [])[1]; };
    var av = function (s) { return (s.match(/APP_VERSION = '([^']+)'/) || [])[1]; };
    var staroC = cv(git('sw.js')), novoC = cv(sw);
    var staroA = av(git('js/app.js')), novoA = av(fs.readFileSync(path.join(KOREN, 'js/app.js'), 'utf8'));
    var ok = !promenjeno.length || (staroC !== novoC && staroA !== novoA);
    stavka('PWA', 'CACHE_VERSION i APP_VERSION povećani (ako su menjani fajlovi aplikacije)', ok,
      promenjeno.length ? (staroC + ' → ' + novoC + ', ' + staroA + ' → ' + novoA) : 'fajlovi aplikacije nisu menjani');
  } catch (e) {
    stavka('PWA', 'CACHE_VERSION i APP_VERSION povećani', false, 'nema origin/main za poređenje: ' + e.message.split('\n')[0]);
  }
}

(async function () {
  proveriStatiku();
  await new Promise(function (r) { server.listen(PORT, '127.0.0.1', r); });
  var b = await chromium.launch();
  try {
    await proveriUredjaj(b, 'iPhone (390×844)', Object.assign({}, devices['iPhone 13']), true);
    await proveriUredjaj(b, 'Android (Pixel 7)', Object.assign({}, devices['Pixel 7']), true);
    await proveriUredjaj(b, 'Tablet (820×1180)', { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true);
    await proveriUredjaj(b, 'Desktop (1440×900)', { viewport: { width: 1440, height: 900 } }, false);
    await proveriPWA(b);
    await proveriPovratne(b);
    await proveriRaspodelu(b);
    await proveriNazad(b);
    await proveriCrtez(b);
    await proveriCvrstocu(b);
    await proveriPoruku(b);
    await proveriAnketu(b);
    await proveriDrive(b);
  } catch (e) {
    stavka('Greška', 'Provera je prekinuta', false, e.message.split('\n')[0]);
  } finally {
    await b.close();
    server.close();
  }
  var REDOSLED = ['Proračun', 'Uređaji', 'PWA', 'Izgled', 'Povratne', 'Drive', 'Greška'];
  rezultati.sort(function (p, q) { return REDOSLED.indexOf(p.grupa) - REDOSLED.indexOf(q.grupa); });
  var grupa = '';
  rezultati.forEach(function (r) {
    if (r.grupa !== grupa) { grupa = r.grupa; console.log('\n### ' + grupa); }
    console.log('- [' + (r.ok ? 'x' : ' ') + '] ' + r.opis + (r.detalj ? ' — ' + r.detalj : ''));
  });
  var pali = rezultati.filter(function (r) { return !r.ok; }).length;
  function provera(n) { var d = n % 10, s = n % 100; return n + ' ' + (d >= 2 && d <= 4 && (s < 12 || s > 14) ? 'provere' : d === 1 && s !== 11 ? 'provera' : 'provera'); }
  console.log('\n' + (pali ? 'NE PROLAZI: ' + pali + ' od ' + provera(rezultati.length) + '.' : 'SVE PROLAZI (' + provera(rezultati.length) + ').'));
  process.exit(pali ? 1 : 0);
})();
