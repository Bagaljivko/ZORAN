/*
 * Zoran — lokalno čitanje SolidWorks .SLDPRT fajlova (najbolji pokušaj).
 *
 * 1) Stari format (otprilike do SolidWorks 2014): OLE / Compound File Binary.
 *    - Korisnička svojstva (Custom Properties) iz toka "\x05DocumentSummaryInformation",
 *      drugi odeljak (korisnički definisana svojstva). Ovo je pouzdano.
 *    - Slika pregleda iz toka "PreviewPNG" (PNG) ili "Preview" (DIB → BMP).
 * 2) Noviji format (2015+): sopstveni format sa blokovima komprimovanim "raw deflate"-om.
 *    - Traže se zaglavlja blokova (14 00 06 00 08 00), blokovi se raspakuju,
 *      a u njima se traži PNG i tekst sa imenima svojstava. Ovo je heuristika.
 *
 * Ništa se ne šalje na mrežu. Radi i u Node-u (za testove) uz prosleđenu funkciju za inflate.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sldprt = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OLE_SIG = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  var PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  var FMTID_USER = 'd5cdd505-2e9c-101b-9397-08002b2cf9ae';

  /** Parametri koje aplikacija traži i imena svojstava koja prepoznaje. */
  var PARAMETRI = [
    { kljuc: 'mn', naziv: 'Modul mₙ [mm]', imena: ['ZORAN_Modul', 'Modul', 'Normalni modul', 'Module', 'Normal module', 'NormalModule', 'mn', 'm_n', 'm'] },
    { kljuc: 'z', naziv: 'Broj zuba z', imena: ['ZORAN_BrojZuba', 'BrojZuba', 'Broj zuba', 'Number of teeth', 'NumberOfTeeth', 'Teeth', 'z'] },
    { kljuc: 'beta', naziv: 'Ugao nagiba β [°]', imena: ['ZORAN_UgaoNagiba', 'UgaoNagiba', 'Ugao nagiba', 'Helix angle', 'HelixAngle', 'beta'] },
    { kljuc: 'alfaN', naziv: 'Ugao profila αₙ [°]', imena: ['ZORAN_UgaoProfila', 'UgaoProfila', 'Ugao profila', 'Pressure angle', 'PressureAngle', 'alpha', 'alfa'] },
    { kljuc: 'b', naziv: 'Širina ozubljenja b [mm]', imena: ['ZORAN_Sirina', 'Sirina ozubljenja', 'Širina ozubljenja', 'Sirina zahvata', 'Širina zahvata', 'Sirina', 'Širina', 'Face width', 'FaceWidth', 'Width', 'b'] },
    { kljuc: 'pom', naziv: 'Pomeranje profila [mm]', imena: ['ZORAN_PomeranjeProfila', 'PomeranjeProfila', 'Pomeranje profila', 'Profile shift', 'ProfileShift'] }
  ];

  function normalizuj(s) {
    return String(s).toLowerCase()
      .replace(/[šś]/g, 's').replace(/[čć]/g, 'c').replace(/ž/g, 'z').replace(/đ/g, 'dj')
      .replace(/[\s_\-.]/g, '');
  }

  function poklapa(sig, buf, off) {
    for (var i = 0; i < sig.length; i++) if (buf[off + i] !== sig[i]) return false;
    return true;
  }

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
  function i32(b, o) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24); }

  function utf16(b, o, n) {
    var s = '';
    for (var i = 0; i + 1 < n; i += 2) {
      var c = u16(b, o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  var CP1252 = { 0x80: 0x20AC, 0x8A: 0x0160, 0x8E: 0x017D, 0x9A: 0x0161, 0x9E: 0x017E, 0x96: 0x2013, 0x97: 0x2014 };
  // Srpska slova u cp1250 (centralnoevropska Windows kodna strana)
  var CP1250 = { 0x8A: 0x0160, 0x9A: 0x0161, 0x8E: 0x017D, 0x9E: 0x017E, 0xC8: 0x010C, 0xE8: 0x010D, 0xC6: 0x0106, 0xE6: 0x0107, 0xD0: 0x0110, 0xF0: 0x0111, 0x80: 0x20AC, 0x96: 0x2013, 0x97: 0x2014 };
  function ansi(b, o, n, cp) {
    if (cp === 65001 && typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(b.subarray(o, o + n)).replace(/\0[\s\S]*$/, '');
    }
    var s = '';
    for (var i = 0; i < n; i++) {
      var c = b[o + i];
      if (c === 0) break;
      var mapa = cp === 1250 ? CP1250 : CP1252;
      s += String.fromCharCode(mapa[c] || c);
    }
    return s;
  }

  // ------------------------------------------------------------------
  // Compound File Binary (OLE)
  // ------------------------------------------------------------------

  function citajCFB(b) {
    if (!poklapa(OLE_SIG, b, 0)) throw new Error('Nije OLE fajl.');
    var secSize = 1 << u16(b, 0x1E);
    var miniSize = 1 << u16(b, 0x20);
    var numFat = u32(b, 0x2C);
    var dirStart = u32(b, 0x30);
    var cutoff = u32(b, 0x38);
    var miniFatStart = u32(b, 0x3C);
    var numMiniFat = u32(b, 0x40);
    var difatStart = u32(b, 0x44);
    var numDifat = u32(b, 0x48);
    var ENDOFCHAIN = 0xFFFFFFFE, FREESECT = 0xFFFFFFFF;

    function off(sid) { return (sid + 1) * secSize; }

    // DIFAT → lista FAT sektora
    var fatSecs = [];
    for (var i = 0; i < 109 && fatSecs.length < numFat; i++) {
      var s = u32(b, 0x4C + i * 4);
      if (s !== FREESECT) fatSecs.push(s);
    }
    var d = difatStart, guard = 0;
    while (fatSecs.length < numFat && d !== ENDOFCHAIN && d !== FREESECT && guard++ < 10000) {
      var o = off(d);
      for (var j = 0; j < secSize / 4 - 1 && fatSecs.length < numFat; j++) {
        var s2 = u32(b, o + j * 4);
        if (s2 !== FREESECT) fatSecs.push(s2);
      }
      d = u32(b, o + secSize - 4);
    }
    var fat = [];
    fatSecs.forEach(function (fs) {
      var o = off(fs);
      for (var k = 0; k < secSize / 4; k++) fat.push(u32(b, o + k * 4));
    });

    function lanac(start, tabela) {
      var out = [], s = start, g = 0;
      while (s !== ENDOFCHAIN && s !== FREESECT && s < tabela.length && g++ < 1e6) {
        out.push(s);
        s = tabela[s];
      }
      return out;
    }
    function citajLanac(start, velicina) {
      var secs = lanac(start, fat);
      var out = new Uint8Array(velicina === undefined ? secs.length * secSize : velicina);
      var p = 0;
      for (var i = 0; i < secs.length && p < out.length; i++) {
        var o = off(secs[i]);
        var n = Math.min(secSize, out.length - p, Math.max(0, b.length - o));
        out.set(b.subarray(o, o + n), p);
        p += n;
      }
      return out;
    }

    // Direktorijum
    var dirBytes = citajLanac(dirStart);
    var ulazi = [];
    for (var e = 0; e + 128 <= dirBytes.length; e += 128) {
      var nameLen = u16(dirBytes, e + 64);
      var tip = dirBytes[e + 66];
      ulazi.push({
        ime: utf16(dirBytes, e, Math.min(nameLen, 64)),
        tip: tip,
        levo: u32(dirBytes, e + 68), desno: u32(dirBytes, e + 72), dete: u32(dirBytes, e + 76),
        start: u32(dirBytes, e + 116),
        velicina: u32(dirBytes, e + 120)
      });
    }
    var koren = ulazi[0];
    if (!koren || koren.tip !== 5) throw new Error('Neispravan OLE direktorijum.');

    // Mini tok
    var miniFat = [];
    if (numMiniFat > 0 && miniFatStart !== ENDOFCHAIN) {
      var mf = citajLanac(miniFatStart);
      for (var m = 0; m + 4 <= mf.length; m += 4) miniFat.push(u32(mf, m));
    }
    var miniTok = koren.start !== ENDOFCHAIN ? citajLanac(koren.start, koren.velicina) : new Uint8Array(0);

    function sadrzaj(ul) {
      if (ul.velicina < cutoff) {
        var secs = lanac(ul.start, miniFat);
        var out = new Uint8Array(ul.velicina), p = 0;
        for (var i = 0; i < secs.length && p < out.length; i++) {
          var o = secs[i] * miniSize;
          var n = Math.min(miniSize, out.length - p);
          out.set(miniTok.subarray(o, o + n), p);
          p += n;
        }
        return out;
      }
      return citajLanac(ul.start, ul.velicina);
    }

    // Obilazak stabla
    var tokovi = [];
    var poseceni = {};
    function obidji(id, putanja) {
      if (id === FREESECT || id >= ulazi.length || poseceni[id]) return;
      poseceni[id] = true;
      var ul = ulazi[id];
      obidji(ul.levo, putanja);
      var p = putanja ? putanja + '/' + ul.ime : ul.ime;
      if (ul.tip === 2) tokovi.push({ ime: ul.ime, putanja: p, velicina: ul.velicina, citaj: sadrzaj.bind(null, ul) });
      else if (ul.tip === 1) obidji(ul.dete, p);
      obidji(ul.desno, putanja);
    }
    obidji(koren.dete, '');
    return tokovi;
  }

  // ------------------------------------------------------------------
  // OLE skup svojstava (Property Set)
  // ------------------------------------------------------------------

  function guid(b, o) {
    function h(n, w) { return ('00000000' + n.toString(16)).slice(-w); }
    var s = h(u32(b, o), 8) + '-' + h(u16(b, o + 4), 4) + '-' + h(u16(b, o + 6), 4) + '-';
    for (var i = 8; i < 10; i++) s += h(b[o + i], 2);
    s += '-';
    for (var j = 10; j < 16; j++) s += h(b[o + j], 2);
    return s;
  }

  function citajVrednost(b, o, cp) {
    var vt = u16(b, o);
    var p = o + 4;
    switch (vt) {
      case 2: return (u16(b, p) << 16) >> 16; // VT_I2
      case 3: return i32(b, p); // VT_I4
      case 4: return new DataView(b.buffer, b.byteOffset + p, 4).getFloat32(0, true); // VT_R4
      case 5: return new DataView(b.buffer, b.byteOffset + p, 8).getFloat64(0, true); // VT_R8
      case 11: return u16(b, p) !== 0; // VT_BOOL
      case 18: return u16(b, p); // VT_UI2
      case 19: return u32(b, p); // VT_UI4
      case 0x1E: { var n = u32(b, p); return cp === 1200 ? utf16(b, p + 4, n) : ansi(b, p + 4, n, cp); } // VT_LPSTR
      case 0x1F: { var n2 = u32(b, p); return utf16(b, p + 4, n2 * 2); } // VT_LPWSTR
      case 64: return '(datum)'; // VT_FILETIME
      default: return undefined;
    }
  }

  /** Vraća niz odeljaka; svaki ima fmtid i mapu {ime → vrednost} (za korisnička) ili {id → vrednost}. */
  function citajSkupSvojstava(b) {
    if (b.length < 48 || u16(b, 0) !== 0xFFFE) throw new Error('Neispravan skup svojstava.');
    var brOdeljaka = u32(b, 24);
    var odeljci = [];
    for (var s = 0; s < brOdeljaka && s < 4; s++) {
      var fmtid = guid(b, 28 + s * 20);
      var so = u32(b, 28 + s * 20 + 16);
      var brSv = u32(b, so + 4);
      var ids = [];
      for (var i = 0; i < brSv && i < 4096; i++) ids.push({ id: u32(b, so + 8 + i * 8), off: so + u32(b, so + 12 + i * 8) });
      var cp = 1252;
      ids.forEach(function (x) { if (x.id === 1) cp = u16(b, x.off + 4); });
      var recnik = {};
      ids.forEach(function (x) {
        if (x.id !== 0) return;
        var p = x.off, n = u32(b, p); p += 4;
        for (var k = 0; k < n && k < 4096; k++) {
          var pid = u32(b, p), len = u32(b, p + 4); p += 8;
          if (cp === 1200) { recnik[pid] = utf16(b, p, len * 2); p += len * 2; p = (p + 3) & ~3; }
          else { recnik[pid] = ansi(b, p, len, cp); p += len; }
        }
      });
      var vrednosti = {};
      ids.forEach(function (x) {
        if (x.id === 0 || x.id === 1 || x.id >= 0x80000000) return;
        var v;
        try { v = citajVrednost(b, x.off, cp); } catch (e) { v = undefined; }
        if (v === undefined) return;
        var ime = recnik[x.id] !== undefined ? recnik[x.id] : String(x.id);
        vrednosti[ime] = v;
      });
      odeljci.push({ fmtid: fmtid, vrednosti: vrednosti, korisnicki: fmtid === FMTID_USER });
    }
    return odeljci;
  }

  // ------------------------------------------------------------------
  // Slike
  // ------------------------------------------------------------------

  function nadjiPNG(b) {
    for (var i = 0; i + 8 < b.length; i++) {
      if (b[i] === 0x89 && poklapa(PNG_SIG, b, i)) {
        // prati delove do IEND
        var p = i + 8, g = 0;
        while (p + 12 <= b.length && g++ < 100000) {
          var len = ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
          var tip = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
          p += 12 + len;
          if (tip === 'IEND') return b.slice(i, p);
          if (len > b.length) break;
        }
      }
    }
    return null;
  }

  /** DIB (BITMAPINFOHEADER + pikseli) → BMP fajl. */
  function dibUBmp(dib) {
    if (dib.length < 40 || u32(dib, 0) < 40) return null;
    var hdr = u32(dib, 0), bpp = u16(dib, 14), clrUsed = u32(dib, 32);
    var pal = bpp <= 8 ? (clrUsed || (1 << bpp)) * 4 : 0;
    var komp = u32(dib, 16);
    if (komp === 3) pal += 12;
    var out = new Uint8Array(14 + dib.length);
    out[0] = 0x42; out[1] = 0x4D;
    var size = out.length, pix = 14 + hdr + pal;
    [size, 0, pix].forEach(function (v, k) {
      var o = 2 + k * 4;
      out[o] = v & 255; out[o + 1] = (v >> 8) & 255; out[o + 2] = (v >> 16) & 255; out[o + 3] = (v >>> 24) & 255;
    });
    out.set(dib, 14);
    return out;
  }

  // ------------------------------------------------------------------
  // Prepoznavanje svojstava
  // ------------------------------------------------------------------

  function izvuciBroj(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    var m = v.replace(/\u2212/g, '-').match(/[-+]?\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(',', '.')) : NaN;
  }

  /** Iz mape {ime: vrednost} izdvaja poznate parametre. */
  function prepoznaj(svojstva, izvor, rezultat) {
    var imenaNorm = {};
    Object.keys(svojstva).forEach(function (k) { imenaNorm[normalizuj(k)] = k; });
    PARAMETRI.forEach(function (par) {
      if (rezultat[par.kljuc] && rezultat[par.kljuc].pouzdano) return;
      for (var i = 0; i < par.imena.length; i++) {
        var orig = imenaNorm[normalizuj(par.imena[i])];
        if (orig === undefined) continue;
        var sirovo = svojstva[orig];
        var broj = izvuciBroj(sirovo);
        rezultat[par.kljuc] = {
          vrednost: broj, sirovo: String(sirovo), ime: orig, izvor: izvor, pouzdano: true,
          napomena: isFinite(broj) ? '' : 'vrednost nije broj'
        };
        return;
      }
    });
  }

  /** Heuristička pretraga teksta: ime svojstva, pa broj u blizini. */
  function pretraziTekst(tekst, izvor, rezultat) {
    PARAMETRI.forEach(function (par) {
      if (rezultat[par.kljuc]) return;
      for (var i = 0; i < par.imena.length; i++) {
        var ime = par.imena[i];
        if (ime.length < 5) continue; // kratka imena (z, b, mn…) daju lažna poklapanja
        var re = new RegExp(ime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ _]?') + '[^0-9\\-+]{0,80}?([-+]?\\d+(?:[.,]\\d+)?)', 'i');
        var m = tekst.match(re);
        if (m) {
          rezultat[par.kljuc] = { vrednost: parseFloat(m[1].replace(',', '.')), sirovo: m[1], ime: ime, izvor: izvor, pouzdano: false, napomena: 'proveri — pronađeno pretragom teksta' };
          return;
        }
      }
    });
  }

  function latin1(b, max) {
    var n = Math.min(b.length, max || b.length), s = '';
    for (var i = 0; i < n; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(n, i + 8192)));
    return s;
  }
  function utf16Tekst(b, max) {
    var n = Math.min(b.length, max || b.length) & ~1, s = '';
    for (var i = 0; i < n; i += 2) {
      var c = b[i] | (b[i + 1] << 8);
      s += (c >= 32 && c < 0xD800) ? String.fromCharCode(c) : ' ';
    }
    return s;
  }

  function dekodirajIme(nb) {
    // Imena blokova u novijem formatu su često "zarotirana" po bitovima; pokušaj sve rotacije.
    var najbolje = '', ocena = -1;
    for (var r = 0; r < 8; r++) {
      var s = '', dobri = 0;
      for (var i = 0; i < nb.length; i++) {
        var c = ((nb[i] << r) | (nb[i] >> (8 - r))) & 255;
        if (c >= 32 && c < 127) dobri++;
        s += String.fromCharCode(c);
      }
      if (dobri > ocena) { ocena = dobri; najbolje = s; }
    }
    return ocena >= nb.length * 0.9 ? najbolje.replace(/[^\x20-\x7e]/g, '?') : '';
  }

  // ------------------------------------------------------------------
  // Glavna funkcija
  // ------------------------------------------------------------------

  /**
   * @param {Uint8Array} bajtovi
   * @param {object} opt { inflateRaw: async (Uint8Array) => Uint8Array }
   * @returns {Promise<object>} { format, parametri: {kljuc → nalaz}, slika: {bajtovi, tip, izvor} | null, beleske[] , svaSvojstva }
   */
  function analiziraj(bajtovi, opt) {
    opt = opt || {};
    var b = bajtovi;
    var rezultat = {};
    var beleske = [];
    var slika = null;
    var svaSvojstva = [];

    if (poklapa(OLE_SIG, b, 0)) {
      var tokovi;
      try { tokovi = citajCFB(b); } catch (e) {
        return Promise.resolve({ format: 'OLE (oštećen)', parametri: rezultat, slika: null, beleske: ['OLE struktura ne može da se pročita: ' + e.message], svaSvojstva: [] });
      }
      beleske.push('Stari SolidWorks format (OLE). Pronađeno tokova: ' + tokovi.length + '.');
      tokovi.forEach(function (t) {
        if (t.ime === '\u0005DocumentSummaryInformation' || t.ime === '\u0005SummaryInformation') {
          try {
            citajSkupSvojstava(t.citaj()).forEach(function (od) {
              if (!od.korisnicki) return;
              Object.keys(od.vrednosti).forEach(function (k) { svaSvojstva.push({ ime: k, vrednost: od.vrednosti[k] }); });
              prepoznaj(od.vrednosti, 'Custom Properties (OLE)', rezultat);
            });
          } catch (e) { beleske.push('Skup svojstava "' + t.ime.replace('\u0005', '') + '" nije pročitan.'); }
        }
      });
      // Slika pregleda
      var redosled = tokovi.slice().sort(function (p, q) {
        function rang(t) { return /previewpng/i.test(t.ime) ? 0 : /preview/i.test(t.ime) ? 1 : 2; }
        return rang(p) - rang(q);
      });
      for (var i = 0; i < redosled.length && !slika; i++) {
        var t = redosled[i];
        if (t.velicina > 40 * 1024 * 1024) continue;
        var podaci = t.citaj();
        var png = nadjiPNG(podaci);
        if (png) slika = { bajtovi: png, tip: 'image/png', izvor: 'tok „' + t.putanja + '“' };
        else if (/preview/i.test(t.ime)) {
          var bmp = dibUBmp(podaci);
          if (bmp) slika = { bajtovi: bmp, tip: 'image/bmp', izvor: 'tok „' + t.putanja + '“ (DIB)' };
        }
      }
      // Rezervna tekstualna pretraga kroz manje tokove
      if (PARAMETRI.some(function (p) { return !rezultat[p.kljuc]; })) {
        tokovi.forEach(function (t) {
          if (t.velicina > 4 * 1024 * 1024) return;
          var podaci = t.citaj();
          pretraziTekst(utf16Tekst(podaci), 'tekst u toku „' + t.putanja + '“', rezultat);
          pretraziTekst(latin1(podaci), 'tekst u toku „' + t.putanja + '“', rezultat);
        });
      }
      return Promise.resolve({ format: 'OLE (stari format)', parametri: rezultat, slika: slika, beleske: beleske, svaSvojstva: svaSvojstva });
    }

    // Noviji format
    beleske.push('Noviji SolidWorks format (nije OLE). Koristi se heuristika — proveri svaki podatak.');
    var png0 = nadjiPNG(b);
    if (png0) slika = { bajtovi: png0, tip: 'image/png', izvor: 'nekomprimovani PNG u fajlu' };
    pretraziTekst(utf16Tekst(b, 8 * 1024 * 1024), 'tekst u fajlu', rezultat);
    pretraziTekst(latin1(b, 8 * 1024 * 1024), 'tekst u fajlu', rezultat);

    var inflate = opt.inflateRaw;
    if (!inflate) {
      beleske.push('Pregledač ne podržava raspakivanje (DecompressionStream), pa su komprimovani delovi preskočeni.');
      return Promise.resolve({ format: 'noviji format', parametri: rezultat, slika: slika, beleske: beleske, svaSvojstva: svaSvojstva });
    }

    var blokovi = [];
    for (var p = 0; p + 26 < b.length && blokovi.length < 4000; p++) {
      if (b[p] !== 0x14 || b[p + 1] !== 0 || b[p + 2] !== 0x06 || b[p + 3] !== 0 || b[p + 4] !== 0x08 || b[p + 5] !== 0) continue;
      var csize = u32(b, p + 14), usize = u32(b, p + 18), nlen = u16(b, p + 22), xlen = u16(b, p + 24);
      var start = p + 26 + nlen + xlen;
      if (nlen > 1024 || csize === 0 || start + csize > b.length || usize > 64 * 1024 * 1024) continue;
      blokovi.push({ start: start, csize: csize, ime: dekodirajIme(b.subarray(p + 26, p + 26 + nlen)) });
    }
    if (!blokovi.length) beleske.push('Nisu pronađeni komprimovani blokovi poznatog oblika.');
    else beleske.push('Pronađeno komprimovanih blokova: ' + blokovi.length + '.');

    var raspakovano = 0;
    var lanac = Promise.resolve();
    blokovi.forEach(function (bl) {
      lanac = lanac.then(function () {
        return Promise.resolve(inflate(b.subarray(bl.start, bl.start + bl.csize))).then(function (out) {
          if (!out || !out.length) return;
          raspakovano++;
          var izvor = 'blok' + (bl.ime ? ' „' + bl.ime + '“' : '');
          if (!slika) {
            var png = nadjiPNG(out);
            if (png) slika = { bajtovi: png, tip: 'image/png', izvor: 'PNG u komprimovanom ' + izvor };
          }
          if (PARAMETRI.some(function (q) { return !rezultat[q.kljuc]; })) {
            pretraziTekst(utf16Tekst(out, 4 * 1024 * 1024), 'tekst u komprimovanom ' + izvor, rezultat);
            pretraziTekst(latin1(out, 4 * 1024 * 1024), 'tekst u komprimovanom ' + izvor, rezultat);
          }
        }, function () { /* blok nije deflate — preskoči */ });
      });
    });
    return lanac.then(function () {
      if (blokovi.length) beleske.push('Uspešno raspakovano: ' + raspakovano + '.');
      return { format: 'noviji format', parametri: rezultat, slika: slika, beleske: beleske, svaSvojstva: svaSvojstva };
    });
  }

  return {
    PARAMETRI: PARAMETRI,
    citajCFB: citajCFB,
    citajSkupSvojstava: citajSkupSvojstava,
    nadjiPNG: nadjiPNG,
    dibUBmp: dibUBmp,
    normalizuj: normalizuj,
    analiziraj: analiziraj
  };
});
