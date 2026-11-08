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
var APP_FAJLOVI = /^(index\.html|manifest\.json|sw\.js|css\/|js\/|fonts\/.*\.woff2$|icons\/)/;

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
    await pg.evaluate(function () { location.hash = 'proracun'; });
    await cekaj(200);
    var poslednje = await pg.evaluate(function () { var p = document.querySelectorAll('#forma-proracun input'); return '#' + p[p.length - 1].id; });
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

function proveriStatiku() {
  // testovi proračuna
  var t = cp.spawnSync(process.execPath, [path.join(KOREN, 'tests', 'proracun.test.js')], { encoding: 'utf8' });
  var red = (t.stdout.match(/Ukupno:.*$/m) || [''])[0];
  stavka('Proračun', 'node tests/proracun.test.js prolazi', t.status === 0, red);
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
      if (/\.(js|css|woff2|png)$/.test(f) && uKesu.indexOf(rel) < 0) fale.push(rel);
    });
  }
  ['css', 'js', 'fonts', 'icons'].forEach(obidji);
  ['index.html', 'manifest.json'].forEach(function (f) { if (uKesu.indexOf(f) < 0) fale.push(f); });
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
  } catch (e) {
    stavka('Greška', 'Provera je prekinuta', false, e.message.split('\n')[0]);
  } finally {
    await b.close();
    server.close();
  }
  var REDOSLED = ['Proračun', 'Uređaji', 'PWA', 'Izgled', 'Greška'];
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
