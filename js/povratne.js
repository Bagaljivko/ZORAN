/*
 * Zoran — povratne informacije („Pošalji utisak“) i dijagnostika.
 * Čiste funkcije (rade i u Node-u, za testove) + hvatanje grešaka u pregledaču.
 *
 * Poruke idu u Google tabelu autora preko Google Apps Script veb-aplikacije (tools/zoran-povratne.gs).
 * Nema servera aplikacije. Ništa se ne šalje samo od sebe — samo kad korisnik pritisne „Pošalji“.
 */
(function (koren, fabrika) {
  var M = fabrika(koren);
  if (typeof module === 'object' && module.exports) module.exports = M;
  else koren.Povratne = M;
})(typeof self !== 'undefined' ? self : this, function (koren) {
  'use strict';

  /**
   * Adresa Apps Script veb-aplikacije (…/exec). Dok je prazna, „Pošalji“ nudi da se tekst
   * podeli ili kopira (kao ranije), pa se ništa ne gubi.
   */
  var ADRESA = 'https://script.google.com/macros/s/AKfycbw1Tv1wHAQe62E2fuo3NIMkKtdYMR_km56fVQEyL5katDCRtQ47UEJP5_PRduIaa4Mv/exec';

  var JEZIK = 'sr';
  var MAX_TEKST = 5000;
  var MAX_RED = 20;
  var MAX_GRESAKA = 30;
  var DAN = 86400000;

  var KLJUC = {
    red: 'zoran.povratne-red',       // poruke koje čekaju slanje
    id: 'zoran.povratne-id',         // nasumičan anonimni ID korisnika
    mejl: 'zoran.povratne-mejl',     // poslednji upisani mejl
    anketa: 'zoran.povratne-anketa'  // brojači retkog pitanja „Kako ti se sviđa ZORAN?“
  };
  /** Ključevi koji se nikad ne prenose u rezervne kopije ni sinhronizaciju (da se ništa ne pošalje dvaput). */
  var NE_SINHRONIZUJ = [KLJUC.red, KLJUC.id, KLJUC.anketa];

  /** Sav tekst ovog dela interfejsa, na jednom mestu (za prevod). */
  var TEKST = {
    sr: {
      vrste: { bug: 'Nešto ne radi', idea: 'Ideja', like: 'Sviđa mi se' },
      praznaPoruka: 'Napiši poruku.',
      predugacko: 'Poruka može imati najviše ' + MAX_TEKST + ' znakova.',
      losMejl: 'Mejl nije ispravan — proveri ga ili ostavi polje prazno.',
      poslato: 'Hvala — poslato.',
      sacuvano: 'Sačuvano — poslaće se kad budeš na mreži.',
      kopirano: 'Tekst je kopiran — nalepi ga u poruku ili mejl autoru.',
      nijeKopirano: 'Slanje trenutno nije moguće, a ni kopiranje nije uspelo.',
      anketaPitanje: 'Kako ti se sviđa ZORAN?',
      anketaDa: 'Sviđa mi se',
      anketaNe: 'Ne sviđa mi se',
      anketaPisi: 'Napiši…',
      anketaHvala: 'Hvala na oceni!',
      brzaDa: '👍 (brza ocena)',
      brzaNe: '👎 (brza ocena)'
    }
  };
  function t(kljuc) { return TEKST[JEZIK][kljuc]; }

  // ------------------------------------------------------------------
  // Provera unosa
  // ------------------------------------------------------------------
  function ispravanMejl(s) {
    return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(String(s || '').trim());
  }
  /** {tip, tekst, mejl} → {ok, greske: {tekst?, mejl?}} */
  function proveriUnos(u) {
    var greske = {};
    var tekst = String(u.tekst || '').trim();
    if (!tekst) greske.tekst = t('praznaPoruka');
    else if (tekst.length > MAX_TEKST) greske.tekst = t('predugacko');
    var mejl = String(u.mejl || '').trim();
    if (mejl && !ispravanMejl(mejl)) greske.mejl = t('losMejl');
    return { ok: !greske.tekst && !greske.mejl, greske: greske };
  }

  // ------------------------------------------------------------------
  // Skladište (localStorage ili zamena u testovima)
  // ------------------------------------------------------------------
  function citaj(sklad, kljuc, podr) {
    try { var v = sklad.getItem(kljuc); return v ? JSON.parse(v) : podr; } catch (e) { return podr; }
  }
  function pisi(sklad, kljuc, v) { try { sklad.setItem(kljuc, JSON.stringify(v)); } catch (e) { /* privatni režim */ } }

  function nasumicanId(slucajno) {
    var c = koren && koren.crypto;
    if (!slucajno && c && typeof c.randomUUID === 'function') return c.randomUUID();
    var r = slucajno || Math.random;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
      var n = Math.floor(r() * 16);
      return (ch === 'x' ? n : (n & 3) | 8).toString(16);
    });
  }
  /** Anonimni ID: napravi se jednom i čuva lokalno. */
  function korisnikId(sklad, slucajno) {
    var id = citaj(sklad, KLJUC.id, null);
    if (typeof id !== 'string' || id.length < 8) { id = nasumicanId(slucajno); pisi(sklad, KLJUC.id, id); }
    return id;
  }

  // ------------------------------------------------------------------
  // Poruka
  // ------------------------------------------------------------------
  /**
   * o: {tip, tekst, mejl, uid, verzija, ekran, uredjaj, tehnicki (string ili null), vreme}
   * Vraća objekat koji ide u tabelu (JSON).
   */
  function napraviPoruku(o) {
    var p = {
      kind: 'feedback',
      type: o.tip,
      text: String(o.tekst || '').trim().slice(0, MAX_TEKST),
      email: String(o.mejl || '').trim(),
      uid: o.uid,
      lang: o.jezik || JEZIK,
      version: o.verzija,
      screen: o.ekran,
      device: o.uredjaj,
      time: new Date(o.vreme || Date.now()).toISOString()
    };
    if (o.tehnicki) p.tech = o.tehnicki;
    return p;
  }
  function napraviDijagnostiku(o) {
    return {
      kind: 'diag',
      note: String(o.napomena || '').trim().slice(0, MAX_TEKST),
      email: String(o.mejl || '').trim(),
      uid: o.uid,
      lang: o.jezik || JEZIK,
      version: o.verzija,
      screen: o.ekran,
      device: o.uredjaj,
      report: o.izvestaj,
      time: new Date(o.vreme || Date.now()).toISOString()
    };
  }
  /** Tekst poruke za deljenje/kopiranje kad adresa za slanje još nije podešena. */
  function tekstZaDeljenje(p) {
    var r = [];
    if (p.kind === 'diag') r.push('ZORAN — dijagnostika (verzija ' + p.version + ')');
    else r.push('ZORAN — ' + (t('vrste')[p.type] || p.type) + ' (verzija ' + p.version + ')');
    r.push('');
    r.push(p.kind === 'diag' ? (p.note || '') : p.text);
    r.push('');
    r.push('—');
    r.push('Ekran: ' + p.screen + ' · Uređaj: ' + p.device);
    if (p.tech || p.report) { r.push(''); r.push(p.tech || p.report); }
    return r.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  // ------------------------------------------------------------------
  // Red za slanje (radi i bez mreže)
  // ------------------------------------------------------------------
  function procitajRed(sklad) {
    var r = citaj(sklad, KLJUC.red, []);
    return Array.isArray(r) ? r : [];
  }
  /** Dodaje poruku u red; čuva najviše MAX_RED (najstarije otpadaju). Vraća ID stavke. */
  function dodajURed(sklad, poruka) {
    var red = procitajRed(sklad);
    var id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    red.push({ id: id, p: poruka });
    if (red.length > MAX_RED) red = red.slice(red.length - MAX_RED);
    pisi(sklad, KLJUC.red, red);
    return id;
  }
  function ukloniIzReda(sklad, id) {
    pisi(sklad, KLJUC.red, procitajRed(sklad).filter(function (s) { return s.id !== id; }));
  }

  var uToku = null;
  /**
   * Šalje poruke iz reda, jednu po jednu. Stavka se uklanja tek kad fetch uspe
   * (Apps Script traži mode: 'no-cors', pa se odgovor ne može pročitati).
   * o: {sklad, fetch, adresa} → Promise<{poslato: [id], ostalo: broj}>
   */
  function isprazniRed(o) {
    if (uToku) return uToku.then(function () { return isprazniRed(o); });
    var poslato = [];
    var red = procitajRed(o.sklad);
    if (!o.adresa || !red.length) return Promise.resolve({ poslato: poslato, ostalo: red.length });
    var lanac = Promise.resolve(true);
    red.forEach(function (s) {
      lanac = lanac.then(function (dalje) {
        if (!dalje) return false;
        return o.fetch(o.adresa, { method: 'POST', mode: 'no-cors', body: JSON.stringify(s.p) }).then(function () {
          ukloniIzReda(o.sklad, s.id);
          poslato.push(s.id);
          return true;
        }, function () { return false; }); // nema mreže: ostalo čeka sledeći pokušaj
      });
    });
    uToku = lanac.then(function () {
      uToku = null;
      return { poslato: poslato, ostalo: procitajRed(o.sklad).length };
    }, function () { uToku = null; return { poslato: poslato, ostalo: procitajRed(o.sklad).length }; });
    return uToku;
  }

  // ------------------------------------------------------------------
  // Greške (poslednjih 30) — beleže se samo lokalno, u memoriji
  // ------------------------------------------------------------------
  var greske = [];
  function zabeleziGresku(poruka, stek, vreme) {
    var kratak = String(stek || '').split('\n').slice(0, 4).map(function (r) { return r.trim(); }).join(' | ');
    greske.push({ poruka: String(poruka || 'nepoznata greška').slice(0, 300), stek: kratak.slice(0, 500), vreme: new Date(vreme || Date.now()).toISOString() });
    if (greske.length > MAX_GRESAKA) greske.splice(0, greske.length - MAX_GRESAKA);
  }
  function poslednjeGreske() { return greske.slice(); }
  function obrisiGreske() { greske.length = 0; }
  function hvatajGreske(w) {
    if (!w || !w.addEventListener) return;
    w.addEventListener('error', function (e) {
      if (!e) return;
      if (e.error || e.message) zabeleziGresku(e.message || (e.error && e.error.message), e.error && e.error.stack ? e.error.stack : (e.filename ? e.filename + ':' + e.lineno : ''));
    });
    w.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      zabeleziGresku('Neobrađeno odbijanje: ' + (r && r.message ? r.message : String(r)), r && r.stack);
    });
  }

  // ------------------------------------------------------------------
  // Čišćenje osetljivih podataka iz izveštaja
  // ------------------------------------------------------------------
  var OSETLJIVO = [
    // ključ=vrednost (api_key, apikey, token, access_token, secret, password, auth, client_secret, session…)
    [/\b([\w-]*(?:api[_-]?key|apikey|key|token|secret|passw(?:or)?d|pwd|auth|session|sig|signature|code|credential)[\w-]*)(["']?\s*[=:]\s*["']?)[^\s"'&,;|)}]+/gi, '$1$2[uklonjeno]'],
    [/\bBearer\s+[\w.~+/=-]+/gi, 'Bearer [uklonjeno]'],
    [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[uklonjen token]'],          // JWT
    [/\bAIza[\w-]{20,}/g, '[uklonjen ključ]'],                       // Google API ključ
    [/\bya29\.[\w.-]+/g, '[uklonjen token]'],                        // Google OAuth token
    [/\b(?:sk|pk|rk)[-_](?:live|test|ant|proj)?[-_]?[\w-]{16,}/g, '[uklonjen ključ]'],
    [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[uklonjen token]'],          // GitHub
    [/\b[A-Za-z0-9+/_-]{32,}={0,2}/g, '[uklonjen dugačak niz]'],      // dugački nasumični nizovi
    [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[mejl]'],
    [/(https?:\/\/[^\s?#"'|)]+)[?#][^\s"'|)]*/g, '$1'],            // parametri u adresama
    [/[^\s/\\:"'|()]+\.(?:sldprt|prtdot|sldasm|slddrw|step|stp|iges|igs|dxf|dwg|pdf|xlsx?|docx?|csv|txt)\b/gi, '[fajl]']
  ];
  function ocisti(s) {
    var x = String(s == null ? '' : s);
    OSETLJIVO.forEach(function (p) { x = x.replace(p[0], p[1]); });
    return x;
  }

  /**
   * Tehnički izveštaj kao jedan tekst. d: {verzija, kes, jezik, jeziciUredjaja, uredjaj, ekran, naMrezi,
   * skladiste, dozvole {ime: stanje}, podesavanja {ime: vrednost}, greske [...]}
   * Sve prolazi kroz ocisti(); korisnikovi proračuni, fajlovi, ključevi i tokeni se ne upisuju.
   */
  function izvestaj(d) {
    var r = [];
    r.push('Aplikacija: ZORAN ' + d.verzija + ' · keš ' + (d.kes || 'nije učitan'));
    r.push('Jezik: ' + (d.jezik || JEZIK) + (d.jeziciUredjaja ? ' (uređaj: ' + d.jeziciUredjaja + ')' : ''));
    r.push('Uređaj: ' + d.uredjaj);
    r.push('Ekran: ' + d.ekran);
    r.push('Mreža: ' + (d.naMrezi ? 'na mreži' : 'bez mreže'));
    r.push('Skladište: ' + (d.skladiste || 'nepoznato'));
    var doz = d.dozvole || {};
    r.push('Dozvole: ' + (Object.keys(doz).length ? Object.keys(doz).map(function (k) { return k + '=' + doz[k]; }).join(', ') : 'nepoznato'));
    var pod = d.podesavanja || {};
    r.push('Podešavanja: ' + Object.keys(pod).map(function (k) { return k + '=' + pod[k]; }).join(', '));
    var g = (d.greske || []).slice(-MAX_GRESAKA);
    r.push('Greške (' + g.length + '):');
    g.forEach(function (x) { r.push('- ' + x.vreme + ' ' + x.poruka + (x.stek ? ' @ ' + x.stek : '')); });
    return ocisti(r.join('\n'));
  }

  // ------------------------------------------------------------------
  // Retko pitanje „Kako ti se sviđa ZORAN?“ — najviše dvaput, ikad
  // ------------------------------------------------------------------
  function danKljuc(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function novoStanjeAnkete(s) {
    s = s && typeof s === 'object' ? s : {};
    return { aktivnosti: s.aktivnosti || 0, prikazano: Array.isArray(s.prikazano) ? s.prikazano.slice(0, 2) : [], danaPosle: s.danaPosle || 0, poslednjiDan: s.poslednjiDan || '' };
  }
  /** Beleži dan korišćenja; posle prvog prikaza broji različite dane. */
  function zabeleziDan(stanje, sada) {
    var s = novoStanjeAnkete(stanje);
    var dan = danKljuc(sada);
    if (dan !== s.poslednjiDan) {
      s.poslednjiDan = dan;
      if (s.prikazano.length === 1) s.danaPosle++;
    }
    return s;
  }
  /**
   * Posle završene aktivnosti: {stanje, prikazi}.
   * Prvi put posle 3. aktivnosti; drugi put najmanje 14 dana i 5 različitih dana korišćenja kasnije; nikad više.
   */
  function posleAktivnosti(stanje, sada) {
    var s = zabeleziDan(stanje, sada);
    s.aktivnosti++;
    var prikazi = false;
    if (s.prikazano.length === 0 && s.aktivnosti >= 3) prikazi = true;
    else if (s.prikazano.length === 1 && sada - s.prikazano[0] >= 14 * DAN && s.danaPosle >= 5) prikazi = true;
    if (prikazi) { s.prikazano.push(sada); s.danaPosle = 0; }
    return { stanje: s, prikazi: prikazi };
  }

  return {
    ADRESA: ADRESA,
    JEZIK: JEZIK,
    MAX_TEKST: MAX_TEKST,
    MAX_RED: MAX_RED,
    MAX_GRESAKA: MAX_GRESAKA,
    KLJUC: KLJUC,
    NE_SINHRONIZUJ: NE_SINHRONIZUJ,
    TEKST: TEKST,
    t: t,
    ispravanMejl: ispravanMejl,
    proveriUnos: proveriUnos,
    korisnikId: korisnikId,
    napraviPoruku: napraviPoruku,
    napraviDijagnostiku: napraviDijagnostiku,
    tekstZaDeljenje: tekstZaDeljenje,
    procitajRed: procitajRed,
    dodajURed: dodajURed,
    isprazniRed: isprazniRed,
    zabeleziGresku: zabeleziGresku,
    poslednjeGreske: poslednjeGreske,
    obrisiGreske: obrisiGreske,
    hvatajGreske: hvatajGreske,
    ocisti: ocisti,
    izvestaj: izvestaj,
    zabeleziDan: zabeleziDan,
    posleAktivnosti: posleAktivnosti
  };
});

// U pregledaču greške se beleže od samog početka (pre app.js).
if (typeof window !== 'undefined' && window.Povratne) window.Povratne.hvatajGreske(window);
