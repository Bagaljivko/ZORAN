/*
 * Zoran — QR kod za deljenje (lokalno, bez interneta).
 * Koristi biblioteku qrcode-generator (MIT, js/vendor/qrcode-generator.js).
 * Radi i u pregledaču (window.Podeli) i u Node-u (za testove).
 */
(function (root, factory) {
  'use strict';
  var qr = (typeof module === 'object' && module.exports)
    ? require('./vendor/qrcode-generator.js')
    : root.qrcode;
  var api = factory(qr);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Podeli = api;
})(typeof self !== 'undefined' ? self : this, function (qrcode) {
  'use strict';

  var LINK = 'https://bagaljivko.github.io/ZORAN/';
  var MASTILO = '#2B2117';
  var PAPIR = '#EDE2C6';
  var TIHA_ZONA = 4; // margina od 4 modula, po standardu

  /** Matrica QR koda (nivo korekcije M). Vraća {n, tamno(r, c)}. */
  function matrica(tekst) {
    var q = qrcode(0, 'M'); // 0 = najmanja verzija koja staje
    q.addData(tekst, 'Byte');
    q.make();
    var n = q.getModuleCount();
    return { n: n, tamno: function (r, c) { return q.isDark(r, c); } };
  }

  /** QR kao SVG tekst: mastilo na papiru, sa tihom zonom. */
  function svg(tekst, opis) {
    var m = matrica(tekst);
    var ukupno = m.n + 2 * TIHA_ZONA;
    var d = '';
    for (var r = 0; r < m.n; r++) {
      for (var c = 0; c < m.n; c++) {
        if (!m.tamno(r, c)) continue;
        // spoji uzastopne tamne module u redu u jedan pravougaonik
        var k = c;
        while (k + 1 < m.n && m.tamno(r, k + 1)) k++;
        d += 'M' + (c + TIHA_ZONA) + ' ' + (r + TIHA_ZONA) + 'h' + (k - c + 1) + 'v1h-' + (k - c + 1) + 'z';
        c = k;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + ukupno + ' ' + ukupno + '" shape-rendering="crispEdges" role="img" aria-label="' +
      (opis || 'QR kod') + '"><rect width="' + ukupno + '" height="' + ukupno + '" fill="' + PAPIR + '"/><path fill="' + MASTILO + '" d="' + d + '"/></svg>';
  }

  return { LINK: LINK, TIHA_ZONA: TIHA_ZONA, matrica: matrica, svg: svg };
});
