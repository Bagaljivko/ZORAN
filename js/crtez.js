/*
 * Zoran — crtež zahvata iz pravih evolventi (SVG).
 * Geometrija je u čistim funkcijama (radi i u Node-u), a crtanje vraća SVG kao tekst.
 * Koordinate: matematički sistem (y nagore); pri ispisu u SVG y se menja u −y.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Crtez = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PI = Math.PI;
  function inv(t) { return Math.tan(t) - t; }
  function f(v) { return (Math.round(v * 1000) / 1000).toString(); }
  function pt(x, y) { return f(x) + ' ' + f(-y); }

  /**
   * Ugao od ose zuba do boka na poluprečniku R.
   * C = sₜ/(2r) + inv αₜ;  θ(R) = C − inv(acos(rb/R)), najmanje 0; ispod rb isto kao na rb.
   */
  function ugaoBoka(R, g, invAt) {
    var C = g.st / (2 * g.r) + invAt;
    var Rr = Math.max(R, g.rb);
    return Math.max(0, C - inv(Math.acos(Math.min(1, g.rb / Rr))));
  }

  /** Tačke jednog boka od d_f do dₐ (poluprečnik i ugao od ose zuba). */
  function tackeBoka(g, invAt, n) {
    n = n || 12;
    var pts = [];
    var r0 = Math.max(g.rf, g.rb);
    if (g.rf < g.rb) pts.push({ R: g.rf, t: ugaoBoka(g.rb, g, invAt) }); // radijalna linija ispod rb
    for (var i = 0; i < n; i++) {
      var R = r0 + (g.ra - r0) * i / (n - 1);
      pts.push({ R: R, t: ugaoBoka(R, g, invAt) });
    }
    return pts;
  }

  /**
   * Putanja (SVG "d") celog zupčanika sa centrom (cx, 0) i zaokretom fi0 (rad).
   * Zub: bok od d_f do dₐ, luk po temenu, drugi bok nazad, luk po podnožju do sledećeg zuba.
   */
  function putanjaZupcanika(g, invAt, cx, fi0, n) {
    var bok = tackeBoka(g, invAt, n);
    var korak = 2 * PI / g.z;
    var tRoot = Math.min(bok[0].t, korak / 2 - 1e-6);
    var tTip = bok[bok.length - 1].t;
    var d = '';
    function P(R, ang) { return pt(cx + R * Math.cos(ang), R * Math.sin(ang)); }
    for (var i = 0; i < g.z; i++) {
      var fi = fi0 + i * korak;
      // desni bok (manji ugao), od podnožja ka temenu
      for (var j = 0; j < bok.length; j++) {
        var tj = j === 0 ? tRoot : Math.min(bok[j].t, korak / 2);
        d += (i === 0 && j === 0 ? 'M' : 'L') + P(bok[j].R, fi - tj);
      }
      // luk po temenu (u smeru porasta ugla — u SVG sweep 0)
      d += 'A' + f(g.ra) + ' ' + f(g.ra) + ' 0 0 0 ' + P(g.ra, fi + Math.min(tTip, korak / 2));
      // levi bok nazad
      for (var k = bok.length - 2; k >= 0; k--) {
        var tk = k === 0 ? tRoot : Math.min(bok[k].t, korak / 2);
        d += 'L' + P(bok[k].R, fi + tk);
      }
      // luk po podnožju do sledećeg zuba
      d += 'A' + f(g.rf) + ' ' + f(g.rf) + ' 0 0 0 ' + P(g.rf, fi + korak - tRoot);
    }
    return d + 'Z';
  }

  /** Obris jednog zuba sa osom na uglu 0 i centrom u (0, 0) — za crveno označavanje. */
  function putanjaZuba(g, invAt, n) {
    var bok = tackeBoka(g, invAt, n);
    var korak = 2 * PI / g.z;
    var d = '';
    function P(R, ang) { return pt(R * Math.cos(ang), R * Math.sin(ang)); }
    for (var j = 0; j < bok.length; j++) d += (j ? 'L' : 'M') + P(bok[j].R, -Math.min(bok[j].t, korak / 2));
    var tTip = Math.min(bok[bok.length - 1].t, korak / 2);
    d += 'A' + f(g.ra) + ' ' + f(g.ra) + ' 0 0 0 ' + P(g.ra, tTip);
    for (var k = bok.length - 2; k >= 0; k--) d += 'L' + P(bok[k].R, Math.min(bok[k].t, korak / 2));
    return d + 'Z';
  }

  /**
   * Koji parovi zuba su u prodiranju pri zaokretu malog zupčanika ug1 (rad, matematički smer).
   * Par je u prodiranju dok mu je tačka dodira na zahvatnoj liniji van T₁T₂, tj. na delu A–T₁
   * (vrh velikog zupčanika u nozi malog) ili T₂–E (vrh malog u nozi velikog). Tu nema evolvente,
   * pa pravilan zahvat nije moguć.
   * Položaj dodira (donjeg) boka zuba i na liniji, mereno od T₁: s = r_b1·(αwt + C − φᵢ), C = sₜ/(2r) + inv αₜ
   * (iz uslova: polarni ugao tačke na liniji αwt − arctg(s/r_b) = φᵢ − C + inv α).
   * Isto važi i za drugu zahvatnu liniju (suprotan smer okretanja), simetrično u odnosu na osu.
   * Vraća {z1: [indeksi zuba malog], z2: [indeksi zuba velikog]}.
   */
  function zubiUProdiranju(rez, ug1) {
    var p = rez.par, g1 = rez.zupcanici[0], g2 = rez.zupcanici[1];
    var out = { z1: [], z2: [] };
    if (!(p.tA < 0 || p.tE < 0)) return out;
    ug1 = ug1 || 0;
    var ug2 = -ug1 * g1.z / g2.z;
    var k1 = 2 * PI / g1.z, k2 = 2 * PI / g2.z;
    var fi02 = PI + PI / g2.z + ug2;
    var aw = p.alfaWt, L = p.a * Math.sin(aw);
    var C1 = g1.st / (2 * g1.r) + p.invAt;
    var T = tackeZahvata(rez);
    var sA = p.tA, sE = L - p.tE; // A i E mereno od T₁
    function norm(x) { x = x % (2 * PI); if (x > PI) x -= 2 * PI; if (x <= -PI) x += 2 * PI; return x; }
    function dodaj(niz, i) { if (niz.indexOf(i) < 0) niz.push(i); }
    for (var i = 0; i < g1.z; i++) {
      var fi = ug1 + i * k1;
      [1, -1].forEach(function (zn) { // 1: zahvatna linija T₁T₂, −1: simetrična (drugi smer)
        var sx = g1.rb * norm(aw + C1 - zn * fi);
        var prodire = (p.tA < 0 && sx >= sA && sx < 0) || (p.tE < 0 && sx > L && sx <= sE);
        if (!prodire) return;
        var qx = T.T1.x + sx * T.u.x, qy = zn * (T.T1.y + sx * T.u.y);
        var rel = Math.atan2(qy, qx - p.a) - fi02;
        dodaj(out.z1, i);
        dodaj(out.z2, ((Math.round(rel / k2) % g2.z) + g2.z) % g2.z);
      });
    }
    return out;
  }

  /** SVG za zube u prodiranju (crveni obrisi) pri zaokretu ug1. */
  function prodiranjeSVG(rez, ug1) {
    var z = zubiUProdiranju(rez, ug1);
    if (!z.z1.length && !z.z2.length) return '';
    var p = rez.par, g1 = rez.zupcanici[0], g2 = rez.zupcanici[1];
    if (!rez._zubi) rez._zubi = [putanjaZuba(g1, p.invAt, 16), putanjaZuba(g2, p.invAt, 16)];
    var ug2 = -(ug1 || 0) * g1.z / g2.z;
    var s = '';
    z.z1.forEach(function (i) {
      var fi = (ug1 || 0) + i * 2 * PI / g1.z;
      s += '<path class="zub-prodire" transform="rotate(' + f(-fi * 180 / PI) + ')" d="' + rez._zubi[0] + '"/>';
    });
    z.z2.forEach(function (j) {
      var fi = PI + PI / g2.z + ug2 + j * 2 * PI / g2.z;
      s += '<path class="zub-prodire" transform="translate(' + f(p.a) + ' 0) rotate(' + f(-fi * 180 / PI) + ')" d="' + rez._zubi[1] + '"/>';
    });
    return s;
  }

  /** Karakteristične tačke zahvata. */
  function tackeZahvata(rez) {
    var p = rez.par, g1 = rez.zupcanici[0], g2 = rez.zupcanici[1];
    var aw = p.alfaWt, a = p.a;
    var c = Math.cos(aw), s = Math.sin(aw);
    var T1 = { x: g1.rb * c, y: g1.rb * s };
    var T2 = { x: a - g2.rb * c, y: -g2.rb * s };
    var u = { x: s, y: -c }; // smer T1 → T2
    var L = a * s;
    var sE = Math.sqrt(g1.ra * g1.ra - g1.rb * g1.rb);
    var sA = L - Math.sqrt(g2.ra * g2.ra - g2.rb * g2.rb);
    function na(sv) { return { x: T1.x + sv * u.x, y: T1.y + sv * u.y }; }
    return {
      O1: { x: 0, y: 0 }, O2: { x: a, y: 0 }, P: { x: g1.rw, y: 0 },
      T1: T1, T2: T2, A: na(sA), E: na(sE), u: u
    };
  }

  /** Okvir prikaza (viewBox) u matematičkim koordinatama. */
  function okvirPrikaza(rez, prikaz, odnosStrana) {
    var p = rez.par, g1 = rez.zupcanici[0], g2 = rez.zupcanici[1];
    odnosStrana = odnosStrana || 0.62; // visina / širina
    var x0, x1, cy = 0, w, h;
    if (prikaz === 'zona') {
      w = 9 * p.mt;
      h = w * odnosStrana;
      x0 = g1.rw - w / 2; x1 = x0 + w;
    } else if (prikaz === 'pregled') {
      var pad = 0.12 * g1.ra;
      x0 = -g1.ra - pad;
      x1 = g1.rw + Math.max(1.2 * g1.ra, 6 * p.mt);
      w = x1 - x0;
      h = Math.max(w * odnosStrana, 2 * g1.ra + 2 * pad);
      if (w * odnosStrana < h) { w = h / odnosStrana; x1 = x0 + w; }
    } else {
      var m = 0.05 * (p.a + g1.ra + g2.ra);
      x0 = -g1.ra - m; x1 = p.a + g2.ra + m;
      w = x1 - x0;
      h = Math.max(2 * Math.max(g1.ra, g2.ra) + 2 * m, w * odnosStrana);
      if (w * odnosStrana < h) { var nw = h / odnosStrana; x0 -= (nw - w) / 2; w = nw; }
    }
    return { x: x0, y: cy - h / 2, w: w, h: h };
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  /**
   * Kompletan SVG.
   * @param rez  rezultat Proracun.proracunaj
   * @param opt  {prikaz:'ceo'|'pregled'|'zona', odnosStrana, ugao1 (rad, za animaciju)}
   */
  function nacrtaj(rez, opt) {
    opt = opt || {};
    var prikaz = opt.prikaz || 'ceo';
    var p = rez.par, g1 = rez.zupcanici[0], g2 = rez.zupcanici[1];
    var v = okvirPrikaza(rez, prikaz, opt.odnosStrana);
    var T = tackeZahvata(rez);
    var fs = v.w / (prikaz === 'zona' ? 34 : prikaz === 'pregled' ? 30 : 32); // veličina slova u jedinicama crteža
    var vb = f(v.x) + ' ' + f(-(v.y + v.h)) + ' ' + f(v.w) + ' ' + f(v.h);

    var n = prikaz === 'zona' ? 24 : 12;
    var d1 = putanjaZupcanika(g1, p.invAt, 0, 0, n);
    var d2 = putanjaZupcanika(g2, p.invAt, 0, PI + PI / g2.z, n);

    function krug(cx, r, klasa) {
      return '<circle class="' + klasa + '" cx="' + f(cx) + '" cy="0" r="' + f(r) + '"/>';
    }
    function linija(A, B, klasa) {
      return '<line class="' + klasa + '" x1="' + f(A.x) + '" y1="' + f(-A.y) + '" x2="' + f(B.x) + '" y2="' + f(-B.y) + '"/>';
    }
    function oznaka(Q, tekst, dx, dy) {
      return '<text class="oz" x="' + f(Q.x + dx * fs) + '" y="' + f(-Q.y - dy * fs) + '" font-size="' + f(fs) + '">' + tekst + '</text>';
    }
    function tacka(Q) {
      return '<circle class="tc" cx="' + f(Q.x) + '" cy="' + f(-Q.y) + '" r="' + f(fs * 0.16) + '"/>';
    }

    var s = '';
    s += '<svg xmlns="http://www.w3.org/2000/svg" class="crtez-svg" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
      esc('Crtež zahvata para z₁ = ' + g1.z + ', z₂ = ' + g2.z) + '">';
    // osna linija
    var ext = 0.06 * v.w;
    s += linija({ x: Math.min(-g1.ra, v.x) - ext, y: 0 }, { x: Math.max(p.a + g2.ra, v.x + v.w) + ext, y: 0 }, 'osa');
    // kružnice
    s += krug(0, g1.rw, 'kotrljajna') + krug(p.a, g2.rw, 'kotrljajna');
    s += krug(0, g1.rb, 'osnovna') + krug(p.a, g2.rb, 'osnovna');
    // zupčanici (rotirajuće grupe)
    var ug1 = opt.ugao1 || 0;
    var ug2 = -ug1 * g1.z / g2.z;
    s += '<g id="zup1" transform="rotate(' + f(-ug1 * 180 / PI) + ' 0 0)"><path class="zub" pathLength="1" d="' + d1 + '"/></g>';
    s += '<g id="zup2" transform="rotate(' + f(-ug2 * 180 / PI) + ' ' + f(p.a) + ' 0)"><path class="zub" pathLength="1" transform="translate(' + f(p.a) + ' 0)" d="' + d2 + '"/></g>';
    // zahvatna linija
    s += linija(T.T1, T.T2, 'zahvatna');
    s += linija(T.A, T.E, 'aktivna');
    // prodiranje: deo zahvatne linije van T₁T₂ i krug oko mesta udara (crveno)
    if (p.tA < 0) {
      s += linija(T.A, T.T1, 'prodiranje-linija');
      // isto mesto za drugi smer okretanja (simetrično u odnosu na osu)
      [1, -1].forEach(function (zn) {
        s += '<circle class="prodiranje-krug" cx="' + f(T.T1.x) + '" cy="' + f(-zn * T.T1.y) + '" r="' + f(Math.max(fs * 1.4, -p.tA * 0.8)) + '"/>';
      });
    }
    if (p.tE < 0) {
      s += linija(T.T2, T.E, 'prodiranje-linija');
      [1, -1].forEach(function (zn) {
        s += '<circle class="prodiranje-krug" cx="' + f(T.T2.x) + '" cy="' + f(-zn * T.T2.y) + '" r="' + f(Math.max(fs * 1.4, -p.tE * 0.8)) + '"/>';
      });
    }
    s += '<g id="prodiranje">' + prodiranjeSVG(rez, ug1) + '</g>';
    // tačke i oznake
    [T.O1, T.O2, T.P, T.T1, T.T2, T.A, T.E].forEach(function (Q) { s += tacka(Q); });
    s += oznaka(T.O1, 'O<tspan baseline-shift="sub" font-size="70%">1</tspan>', -1.4, 0.5);
    s += oznaka(T.O2, 'O<tspan baseline-shift="sub" font-size="70%">2</tspan>', 0.4, 0.5);
    s += oznaka(T.P, 'P', 0.35, 0.45);
    s += oznaka(T.T1, 'T<tspan baseline-shift="sub" font-size="70%">1</tspan>', -1.4, 0.2);
    s += oznaka(T.T2, 'T<tspan baseline-shift="sub" font-size="70%">2</tspan>', 0.4, -1);
    s += oznaka(T.A, 'A', 0.4, -0.2);
    s += oznaka(T.E, 'E', -1.0, 0.25);
    s += '</svg>';
    return s;
  }

  return {
    ugaoBoka: ugaoBoka,
    tackeBoka: tackeBoka,
    putanjaZupcanika: putanjaZupcanika,
    tackeZahvata: tackeZahvata,
    putanjaZuba: putanjaZuba,
    zubiUProdiranju: zubiUProdiranju,
    prodiranjeSVG: prodiranjeSVG,
    okvirPrikaza: okvirPrikaza,
    nacrtaj: nacrtaj
  };
});
