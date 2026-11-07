/*
 * Zoran — proračun cilindričnih evolventnih zupčanika (pravi i kosi zubi).
 * Čiste funkcije, bez DOM-a. Radi i u pregledaču (window.Proracun) i u Node-u (require).
 *
 * Sve dužine su u milimetrima, uglovi na ulazu u stepenima, interno u radijanima.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Proracun = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PI = Math.PI;
  var DEG = PI / 180;

  /** Evolventna funkcija: inv(t) = tan t − t */
  function inv(t) {
    return Math.tan(t) - t;
  }

  /** Inverzna evolventna funkcija (Njutnova metoda). Vraća NaN ako nema rešenja. */
  function invInverse(v) {
    if (!(v > 0) || !isFinite(v)) return NaN;
    // Početna procena: za male uglove inv(t) ≈ t³/3
    var t = Math.min(Math.cbrt(3 * v), 1.4);
    for (var i = 0; i < 100; i++) {
      var tn = Math.tan(t);
      var f = tn - t - v;
      var d = tn * tn;
      if (d === 0) break;
      var dt = f / d;
      t -= dt;
      if (t <= 0) t = 1e-9;
      if (t >= PI / 2) t = PI / 2 - 1e-9;
      if (Math.abs(dt) < 1e-15) break;
    }
    if (Math.abs(inv(t) - v) > 1e-10 * Math.max(1, v)) return NaN;
    return t;
  }

  /** Parsira broj koji može imati zarez ili tačku kao decimalni znak. */
  function parsirajBroj(s) {
    if (typeof s === 'number') return isFinite(s) ? s : NaN;
    if (s === null || s === undefined) return NaN;
    var t = String(s).trim().replace(/−/g, '-').replace(/\s+/g, '');
    if (t === '') return NaN;
    if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return NaN;
    return parseFloat(t.replace(',', '.'));
  }

  // ------------------------------------------------------------------
  // Provera ulaza
  // ------------------------------------------------------------------

  var OPSEZI = {
    z1: { min: 5, max: 400, ceo: true, naziv: 'Broj zuba z₁' },
    z2: { min: 5, max: 1000, ceo: true, naziv: 'Broj zuba z₂' },
    mn: { min: 0.05, max: 100, naziv: 'Modul mₙ' },
    beta: { min: 0, max: 45, maxOtvoren: true, naziv: 'Ugao nagiba β' },
    alfaN: { min: 10, max: 35, naziv: 'Ugao profila αₙ' },
    b: { min: 0, minOtvoren: true, max: 10000, naziv: 'Širina b' },
    pom1: { naziv: 'Pomeranje profila (mali)' },
    pom2: { naziv: 'Pomeranje profila (veliki)' }
  };

  function proveriPolje(kljuc, v) {
    var o = OPSEZI[kljuc];
    if (typeof v !== 'number' || !isFinite(v)) return o.naziv + ': unesi broj (npr. 6,5).';
    if (o.ceo && Math.round(v) !== v) return o.naziv + ': mora biti ceo broj.';
    if (o.min !== undefined && (o.minOtvoren ? v <= o.min : v < o.min))
      return o.naziv + ': mora biti ' + (o.minOtvoren ? 'veće od ' : 'najmanje ') + formatBroja(o.min) + '.';
    if (o.max !== undefined && (o.maxOtvoren ? v >= o.max : v > o.max))
      return o.naziv + ': mora biti ' + (o.maxOtvoren ? 'manje od ' : 'najviše ') + formatBroja(o.max) + '.';
    return null;
  }

  function formatBroja(v) {
    return String(v).replace('.', ',');
  }

  // ------------------------------------------------------------------
  // Glavni proračun
  // ------------------------------------------------------------------

  /**
   * @param {object} u  {z1, z2, mn, beta, alfaN, pom1, pom2, b} — brojevi; beta i alfaN u stepenima.
   * @returns {object} { ok, greske[], upozorenja[], par, zupcanici:[z1, z2] }
   */
  function proracunaj(u) {
    var greske = [];
    ['z1', 'z2', 'mn', 'beta', 'alfaN', 'b', 'pom1', 'pom2'].forEach(function (k) {
      var g = proveriPolje(k, u[k]);
      if (g) greske.push({ polje: k, poruka: g });
    });
    if (greske.length) return { ok: false, greske: greske, upozorenja: [] };

    var z1 = u.z1, z2 = u.z2, mn = u.mn, b = u.b;
    var beta = u.beta * DEG, alfaN = u.alfaN * DEG;

    var x1 = u.pom1 / mn, x2 = u.pom2 / mn;
    if (Math.abs(x1) > 3 || Math.abs(x2) > 3) {
      greske.push({ polje: Math.abs(x1) > 3 ? 'pom1' : 'pom2', poruka: 'Pomeranje profila je preveliko: koeficijent x mora biti između −3 i 3.' });
      return { ok: false, greske: greske, upozorenja: [] };
    }

    var cb = Math.cos(beta);
    var mt = mn / cb;
    var alfaT = Math.atan(Math.tan(alfaN) / cb);
    var invAt = inv(alfaT);
    var zs = z1 + z2;
    var invAwt = invAt + 2 * Math.tan(alfaN) * (x1 + x2) / zs;
    var alfaWt = invInverse(invAwt);
    if (!isFinite(alfaWt)) {
      greske.push({ polje: 'pom1', poruka: 'Zbir pomeranja profila je previše negativan — ugao zahvata ne postoji. Povećaj pomeranje.' });
      return { ok: false, greske: greske, upozorenja: [] };
    }

    var a0 = mt * zs / 2;
    var a = a0 * Math.cos(alfaT) / Math.cos(alfaWt);
    var y = (a - a0) / mn;
    var k = (x1 + x2) - y;

    function zupcanik(z, x) {
      var d = mt * z;
      var db = d * Math.cos(alfaT);
      var dw = 2 * a * z / zs;
      var da = d + 2 * mn * (1 + x - k);
      var df = d - 2 * mn * (1.25 - x);
      var h = (da - df) / 2;
      var st = mt * PI / 2 + 2 * x * mn * Math.tan(alfaT);
      var alfaA = da > db ? Math.acos(db / da) : NaN;
      var sa = isFinite(alfaA) ? da * (st / d + invAt - inv(alfaA)) : NaN;
      var zn = z / (cb * cb * cb);
      var xmin = 1 - zn * Math.sin(alfaN) * Math.sin(alfaN) / 2;
      // debljina zuba na kotrljajnoj kružnici (za proveru bočnog zazora)
      var sw = dw * (st / d + invAt - inv(alfaWt));
      return {
        z: z, x: x, pomeranje: x * mn,
        d: d, db: db, dw: dw, da: da, df: df, h: h,
        r: d / 2, rb: db / 2, rw: dw / 2, ra: da / 2, rf: df / 2,
        st: st, sa: sa, sw: sw,
        alfaA: alfaA, zn: zn, xmin: xmin
      };
    }

    var g1 = zupcanik(z1, x1);
    var g2 = zupcanik(z2, x2);

    if (!isFinite(g1.alfaA) || !isFinite(g2.alfaA)) {
      greske.push({ polje: !isFinite(g1.alfaA) ? 'pom1' : 'pom2', poruka: 'Temena kružnica je manja od osnovne — zub ne može da se formira. Proveri pomeranje profila.' });
      return { ok: false, greske: greske, upozorenja: [] };
    }
    if (g1.df <= 0 || g2.df <= 0) {
      greske.push({ polje: g1.df <= 0 ? 'z1' : 'z2', poruka: 'Podnožna kružnica je manja od nule. Povećaj broj zuba ili pomeranje.' });
      return { ok: false, greske: greske, upozorenja: [] };
    }

    var pbt = PI * mt * Math.cos(alfaT);
    var g1a = Math.sqrt(g1.ra * g1.ra - g1.rb * g1.rb);
    var g2a = Math.sqrt(g2.ra * g2.ra - g2.rb * g2.rb);
    var gAlfa = g1a + g2a - a * Math.sin(alfaWt);
    var epsA = gAlfa / pbt;
    var epsB = b * Math.sin(beta) / (PI * mn);
    var epsG = epsA + epsB;

    var upozorenja = proveriUpozorenja(g1, g2, epsA, mn);

    return {
      ok: true,
      greske: [],
      upozorenja: upozorenja,
      ulaz: { z1: z1, z2: z2, mn: mn, beta: u.beta, alfaN: u.alfaN, pom1: u.pom1, pom2: u.pom2, b: b },
      par: {
        u: z2 / z1,
        mt: mt, alfaT: alfaT, alfaWt: alfaWt, invAt: invAt, invAwt: invAwt,
        a0: a0, a: a, y: y, k: k, sumaX: x1 + x2,
        pbt: pbt, gAlfa: gAlfa,
        epsA: epsA, epsB: epsB, epsG: epsG,
        b: b, beta: beta, alfaN: alfaN
      },
      zupcanici: [g1, g2]
    };
  }

  function proveriUpozorenja(g1, g2, epsA, mn) {
    var w = [];
    [g1, g2].forEach(function (g, i) {
      var oznaka = i === 0 ? 'z₁' : 'z₂';
      if (g.x < g.xmin - 1e-12)
        w.push({ kod: 'podsecanje', zupcanik: i, poruka: 'Podsecanje zuba na zupčaniku ' + oznaka + ': x = ' + formatBroja(g.x.toFixed(3)) + ' je manje od x_min = ' + formatBroja(g.xmin.toFixed(3)) + '.' });
      if (!(g.sa >= 0.25 * mn))
        w.push({ kod: 'zasiljen', zupcanik: i, poruka: 'Zašiljen vrh zuba na zupčaniku ' + oznaka + ': sₐ = ' + formatBroja(g.sa.toFixed(3)) + ' mm je manje od 0,25·mₙ = ' + formatBroja((0.25 * mn).toFixed(3)) + ' mm.' });
    });
    if (epsA < 1.1)
      w.push({ kod: 'epsilon', poruka: 'Stepen sprezanja profila εα = ' + formatBroja(epsA.toFixed(3)) + ' je manji od 1,1.' });
    return w;
  }

  // ------------------------------------------------------------------
  // Savetnik
  // ------------------------------------------------------------------

  var DIN780_RED1 = [0.05, 0.06, 0.08, 0.1, 0.12, 0.16, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 60];
  var DIN780_RED2 = [0.055, 0.07, 0.075, 0.09, 0.11, 0.14, 0.18, 0.22, 0.28, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.125, 1.375, 1.75, 2.25, 2.75, 3.25, 3.5, 3.75, 4.5, 5.5, 6.5, 7, 9, 11, 14, 18, 22, 27, 28, 36, 45, 55, 70];

  /** Raspodela zbira pomeranja prema DIN 3992 (reduktor), sa korekcijom za x_min. */
  function raspodelaDIN3992(sumaX, z1, z2, betaDeg, alfaNDeg) {
    var cb = Math.cos(betaDeg * DEG);
    var s2 = Math.pow(Math.sin(alfaNDeg * DEG), 2);
    var zn1 = z1 / (cb * cb * cb), zn2 = z2 / (cb * cb * cb);
    var u = z2 / z1;
    var imen = Math.log(zn1 * zn2 / 100);
    var x1;
    if (Math.abs(imen) < 1e-9) x1 = sumaX / 2;
    else x1 = sumaX / 2 + (0.5 - sumaX / 2) * Math.log(u) / imen;
    var x2 = sumaX - x1;
    var xmin1 = 1 - zn1 * s2 / 2, xmin2 = 1 - zn2 * s2 / 2;
    var pomereno = false;
    if (x1 < xmin1) { x1 = xmin1; x2 = sumaX - x1; pomereno = true; }
    if (x2 < xmin2) { x2 = xmin2; x1 = sumaX - x2; pomereno = true; }
    return { x1: x1, x2: x2, xmin1: xmin1, xmin2: xmin2, pomereno: pomereno };
  }

  /** Ocena jedne kombinacije za zadato osno rastojanje. */
  function oceniKombinaciju(a, z1, z2, mn, betaDeg, alfaNDeg, b) {
    var beta = betaDeg * DEG, alfaN = alfaNDeg * DEG;
    var mt = mn / Math.cos(beta);
    var alfaT = Math.atan(Math.tan(alfaN) / Math.cos(beta));
    var a0 = mt * (z1 + z2) / 2;
    var odnos = a0 * Math.cos(alfaT) / a;
    if (!(odnos > 0 && odnos < 1)) {
      return { ostvarivo: false, a0: a0, odnos: odnos };
    }
    var alfaWt = Math.acos(odnos);
    var sumaX = (inv(alfaWt) - inv(alfaT)) * (z1 + z2) / (2 * Math.tan(alfaN));
    var r = raspodelaDIN3992(sumaX, z1, z2, betaDeg, alfaNDeg);
    var rez = proracunaj({ z1: z1, z2: z2, mn: mn, beta: betaDeg, alfaN: alfaNDeg, pom1: r.x1 * mn, pom2: r.x2 * mn, b: b || 10 * mn });
    var upozorenja = rez.ok ? rez.upozorenja.slice() : [{ kod: 'greska', poruka: rez.greske.map(function (g) { return g.poruka; }).join(' ') }];
    if (sumaX > 1.2) upozorenja.push({ kod: 'sumaX', poruka: 'Zbir koeficijenata pomeranja Σx = ' + formatBroja(sumaX.toFixed(3)) + ' je veći od 1,2.' });
    if (sumaX < -0.5) upozorenja.push({ kod: 'sumaX', poruka: 'Zbir koeficijenata pomeranja Σx = ' + formatBroja(sumaX.toFixed(3)) + ' je manji od −0,5.' });
    var ocena;
    if (upozorenja.length) ocena = 'Loše';
    else if (sumaX >= -0.3 && sumaX <= 1.0) ocena = 'Dobro';
    else ocena = 'Prihvatljivo';
    return {
      ostvarivo: true,
      a: a, a0: a0, razlika: a - a0, alfaWt: alfaWt, sumaX: sumaX,
      x1: r.x1, x2: r.x2, pom1: r.x1 * mn, pom2: r.x2 * mn, pomereno: r.pomereno,
      epsA: rez.ok ? rez.par.epsA : NaN,
      rez: rez, upozorenja: upozorenja, ocena: ocena,
      z1: z1, z2: z2, mn: mn
    };
  }

  function bodujKombinaciju(k, mnKorisnik, odstupanjePct) {
    return Math.abs(k.sumaX - 0.35) - 0.6 * Math.min(k.epsA, 1.8) + 0.05 * Math.abs(odstupanjePct) +
      0.6 * Math.abs(k.mn - mnKorisnik) / mnKorisnik + (k.z1 < 14 ? 0.3 : 0);
  }

  /**
   * @param {object} u {a, z1, z2, mn, beta, alfaN, tol (u %), b?}
   */
  function savetnik(u) {
    var greske = [];
    var provera = { z1: u.z1, z2: u.z2, mn: u.mn, beta: u.beta, alfaN: u.alfaN };
    Object.keys(provera).forEach(function (k) {
      var g = proveriPolje(k, provera[k]);
      if (g) greske.push({ polje: k, poruka: g });
    });
    if (!(typeof u.a === 'number' && isFinite(u.a) && u.a > 0)) greske.push({ polje: 'a', poruka: 'Osno rastojanje a: unesi pozitivan broj.' });
    if (!(typeof u.tol === 'number' && isFinite(u.tol) && u.tol >= 0 && u.tol <= 50)) greske.push({ polje: 'tol', poruka: 'Odstupanje prenosnog odnosa: unesi broj između 0 i 50 %.' });
    if (greske.length) return { ok: false, greske: greske };

    var vlastita = oceniKombinaciju(u.a, u.z1, u.z2, u.mn, u.beta, u.alfaN, u.b);
    var odnos = u.z2 / u.z1;

    // Predlozi
    var moduli = DIN780_RED1.concat(DIN780_RED2, [u.mn]).filter(function (m) {
      return m >= 0.6 * u.mn - 1e-12 && m <= 1.5 * u.mn + 1e-12;
    });
    moduli = moduli.filter(function (m, i) { return moduli.indexOf(m) === i; }).sort(function (p, q) { return p - q; });

    var kandidati = [];
    moduli.forEach(function (m) {
      for (var z1 = 10; z1 <= 80; z1++) {
        var z2 = Math.round(z1 * odnos);
        if (z2 < 5) continue;
        var odst = (z2 / z1 - odnos) / odnos * 100;
        if (Math.abs(odst) > u.tol + 1e-9) continue;
        var k = oceniKombinaciju(u.a, z1, z2, m, u.beta, u.alfaN, u.b);
        if (!k.ostvarivo || k.upozorenja.length) continue;
        k.odstupanje = odst;
        k.bodovi = bodujKombinaciju(k, u.mn, odst);
        kandidati.push(k);
      }
    });
    kandidati.sort(function (p, q) { return p.bodovi - q.bodovi; });
    var predlozi = kandidati.slice(0, 4);

    var status;
    if (!predlozi.length) status = 'nema';
    else if (vlastita.ostvarivo && !vlastita.upozorenja.length) {
      var vb = bodujKombinaciju(vlastita, u.mn, 0);
      vlastita.bodovi = vb;
      var uListi = predlozi.some(function (p) { return p.z1 === u.z1 && p.z2 === u.z2 && p.mn === u.mn; });
      status = (uListi || vb <= predlozi[predlozi.length - 1].bodovi + 1e-12) ? 'medjuNajboljim' : 'postojiBolje';
    } else status = 'postojiBolje';

    return { ok: true, greske: [], vlastita: vlastita, predlozi: predlozi, status: status, brojKandidata: kandidati.length };
  }

  return {
    DEG: DEG,
    inv: inv,
    invInverse: invInverse,
    parsirajBroj: parsirajBroj,
    proveriPolje: proveriPolje,
    proracunaj: proracunaj,
    raspodelaDIN3992: raspodelaDIN3992,
    oceniKombinaciju: oceniKombinaciju,
    savetnik: savetnik,
    DIN780_RED1: DIN780_RED1,
    DIN780_RED2: DIN780_RED2,
    PODRAZUMEVANO: { z1: 16, z2: 58, mn: 6.5, beta: 9, alfaN: 20, pom1: 3.380, pom2: 3.705, b: 88 }
  };
});
