/*
 * Testovi za Zoran — pokreni sa:  node tests/proracun.test.js
 * Bez spoljnih biblioteka.
 */
'use strict';
var path = require('path');
var fs = require('fs');
var zlib = require('zlib');
var P = require(path.join(__dirname, '..', 'js', 'proracun.js'));
var C = require(path.join(__dirname, '..', 'js', 'crtez.js'));
var S = require(path.join(__dirname, '..', 'js', 'sldprt.js'));

var prosli = 0, pali = 0;
var cekanje = [];
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
function jednako(a, b, tol, poruka) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((poruka || '') + ' očekivano ' + b + ' ± ' + tol + ', dobijeno ' + a);
}
function tacno(v, poruka) { if (!v) throw new Error(poruka || 'očekivano tačno'); }

var D = P.PODRAZUMEVANO;
var rez = P.proracunaj(D);

console.log('Proračun');

test('inv i inverzna inv su međusobno inverzne', function () {
  [1, 5, 14.5, 20, 25, 35, 45, 60].forEach(function (deg) {
    var t = deg * P.DEG;
    jednako(P.invInverse(P.inv(t)), t, 1e-12, deg + '°:');
  });
  tacno(isNaN(P.invInverse(-0.01)), 'negativan ulaz daje NaN');
});

test('parsiranje broja prihvata zarez i tačku', function () {
  jednako(P.parsirajBroj('6,5'), 6.5, 0);
  jednako(P.parsirajBroj(' 6.5 '), 6.5, 0);
  jednako(P.parsirajBroj('−0,25'), -0.25, 0);
  jednako(P.parsirajBroj(',5'), 0.5, 0);
  tacno(isNaN(P.parsirajBroj('6,5,1')));
  tacno(isNaN(P.parsirajBroj('abc')));
  tacno(isNaN(P.parsirajBroj('')));
});

test('podrazumevani ulazi: osno rastojanje ≈ 250 mm', function () {
  tacno(rez.ok, 'proračun mora uspeti');
  jednako(rez.par.a, 250, 0.05, 'a:');
});

test('podrazumevani ulazi: osnovne veličine', function () {
  var p = rez.par, g = rez.zupcanici;
  jednako(p.mt, 6.5 / Math.cos(9 * P.DEG), 1e-12, 'mt:');
  jednako(p.mt, 6.58102, 1e-5, 'mt:');
  jednako(p.alfaT / P.DEG, 20.2290, 1e-3, 'αt:');
  jednako(p.a0, 243.4979, 1e-3, 'a0:');
  jednako(g[0].d, 105.2964, 1e-3, 'd1:');
  jednako(g[1].d, 381.6994, 1e-3, 'd2:');
  jednako(g[0].x, 0.52, 1e-12, 'x1:');
  jednako(g[1].x, 0.57, 1e-12, 'x2:');
  jednako(p.epsB, 88 * Math.sin(9 * P.DEG) / (Math.PI * 6.5), 1e-12, 'εβ:');
  jednako(p.epsG, p.epsA + p.epsB, 1e-12, 'εγ:');
  tacno(p.epsA > 1.1 && p.epsA < 2, 'εα u razumnom opsegu');
  tacno(rez.upozorenja.length === 0, 'bez upozorenja za podrazumevane ulaze');
});

test('nezavisna provera: zbir debljina na kotrljajnim kružnicama = korak (nulti bočni zazor)', function () {
  // sw1 + sw2 = π·dw1/z1 važi samo ako je αwt (pa i a) tačno izračunato.
  var g = rez.zupcanici;
  jednako(g[0].sw + g[1].sw, Math.PI * g[0].dw / g[0].z, 1e-9);
});

test('nezavisna provera: db = dw·cos αwt za oba zupčanika', function () {
  rez.zupcanici.forEach(function (g) { jednako(g.db, g.dw * Math.cos(rez.par.alfaWt), 1e-9); });
});

test('nezavisna provera: εα drugom formulom (preko tan αa)', function () {
  // εα = [z1(tan αa1 − tan αwt) + z2(tan αa2 − tan αwt)] / (2π)  (čeoni presek)
  var g = rez.zupcanici, aw = rez.par.alfaWt;
  var e = (g[0].z * (Math.tan(g[0].alfaA) - Math.tan(aw)) + g[1].z * (Math.tan(g[1].alfaA) - Math.tan(aw))) / (2 * Math.PI);
  jednako(rez.par.epsA, e, 1e-9);
});

test('bez pomeranja profila: a = a0, k = 0, dₐ = d + 2mₙ', function () {
  var r = P.proracunaj({ z1: 20, z2: 40, mn: 2, beta: 0, alfaN: 20, pom1: 0, pom2: 0, b: 20 });
  tacno(r.ok);
  jednako(r.par.a, 60, 1e-9);
  jednako(r.par.k, 0, 1e-9);
  jednako(r.zupcanici[0].da, 44, 1e-9);
  jednako(r.zupcanici[0].df, 35, 1e-9);
  jednako(r.par.epsA, 1.6349, 2e-3, 'εα (z 20/40, m 2):');
});

test('upozorenje: podsecanje za z = 8 bez pomeranja', function () {
  var r = P.proracunaj({ z1: 8, z2: 40, mn: 2, beta: 0, alfaN: 20, pom1: 0, pom2: 0, b: 20 });
  tacno(r.ok);
  tacno(r.upozorenja.some(function (w) { return w.kod === 'podsecanje' && w.zupcanik === 0; }));
});

test('upozorenje: zašiljen vrh za veliko pomeranje', function () {
  var r = P.proracunaj({ z1: 12, z2: 40, mn: 2, beta: 0, alfaN: 20, pom1: 2.0, pom2: 0, b: 20 });
  tacno(r.ok);
  tacno(r.upozorenja.some(function (w) { return w.kod === 'zasiljen'; }));
});

test('neispravan unos daje poruku na srpskom, bez izuzetka', function () {
  var r = P.proracunaj({ z1: NaN, z2: 58, mn: 6.5, beta: 9, alfaN: 20, pom1: 0, pom2: 0, b: 88 });
  tacno(!r.ok && r.greske[0].polje === 'z1' && /unesi broj/.test(r.greske[0].poruka));
  var r2 = P.proracunaj({ z1: 16.5, z2: 58, mn: 6.5, beta: 9, alfaN: 20, pom1: 0, pom2: 0, b: 88 });
  tacno(!r2.ok && /ceo broj/.test(r2.greske[0].poruka));
  var r3 = P.proracunaj({ z1: 16, z2: 58, mn: 6.5, beta: 9, alfaN: 20, pom1: -12, pom2: -12, b: 88 });
  tacno(!r3.ok, 'previše negativno pomeranje se odbija');
});

console.log('Savetnik');

test('povratni put: a iz proračuna → Σx = 1,09 i x₁ = 0,52', function () {
  var s = P.savetnik({ a: rez.par.a, z1: 16, z2: 58, mn: 6.5, beta: 9, alfaN: 20, tol: 2 });
  tacno(s.ok && s.vlastita.ostvarivo);
  jednako(s.vlastita.sumaX, 1.09, 1e-9, 'Σx:');
  jednako(s.vlastita.x1, 0.52, 0.002, 'x1 (DIN 3992):');
});

test('neostvarivo rastojanje je jasno označeno', function () {
  var s = P.savetnik({ a: 200, z1: 16, z2: 58, mn: 6.5, beta: 9, alfaN: 20, tol: 2 });
  tacno(s.ok && !s.vlastita.ostvarivo);
});

test('ocena: Σx = 1,09 → "Prihvatljivo"; Σx ≈ 0 → "Dobro"', function () {
  var s = P.savetnik({ a: 250, z1: 16, z2: 58, mn: 6.5, beta: 9, alfaN: 20, tol: 2 });
  tacno(s.vlastita.ocena === 'Prihvatljivo', 'dobijeno ' + s.vlastita.ocena);
  var a0 = P.proracunaj({ z1: 20, z2: 60, mn: 3, beta: 0, alfaN: 20, pom1: 0.6, pom2: -0.6, b: 30 }).par.a;
  var s2 = P.savetnik({ a: a0, z1: 20, z2: 60, mn: 3, beta: 0, alfaN: 20, tol: 2 });
  tacno(s2.vlastita.ocena === 'Dobro', 'dobijeno ' + s2.vlastita.ocena);
});

test('predlozi: najviše 4, bez upozorenja, sortirani, u opsegu modula i odnosa', function () {
  var s = P.savetnik({ a: 250, z1: 16, z2: 58, mn: 6.5, beta: 9, alfaN: 20, tol: 2 });
  tacno(s.predlozi.length > 0 && s.predlozi.length <= 4);
  for (var i = 0; i < s.predlozi.length; i++) {
    var p = s.predlozi[i];
    tacno(p.upozorenja.length === 0);
    tacno(p.mn >= 0.6 * 6.5 && p.mn <= 1.5 * 6.5);
    tacno(Math.abs(p.odstupanje) <= 2);
    if (i) tacno(p.bodovi >= s.predlozi[i - 1].bodovi);
  }
  tacno(['postojiBolje', 'medjuNajboljim'].indexOf(s.status) >= 0);
});

test('raspodela DIN 3992 poštuje x_min', function () {
  var r = P.raspodelaDIN3992(-0.4, 10, 60, 0, 20);
  tacno(r.x1 >= r.xmin1 - 1e-12);
  jednako(r.x1 + r.x2, -0.4, 1e-12);
});

console.log('Crtež');

test('putanja zupčanika je konačna (bez NaN) za sva tri prikaza', function () {
  ['ceo', 'pregled', 'zona'].forEach(function (pr) {
    var svg = C.nacrtaj(rez, { prikaz: pr });
    tacno(svg.indexOf('NaN') < 0 && svg.indexOf('Infinity') < 0, pr);
    tacno(/<path class="zub"/.test(svg));
  });
});

test('A i E leže na temenim kružnicama i na zahvatnoj liniji', function () {
  var T = C.tackeZahvata(rez), g = rez.zupcanici;
  jednako(Math.hypot(T.E.x, T.E.y), g[0].ra, 1e-9, 'E na ra1:');
  jednako(Math.hypot(T.A.x - rez.par.a, T.A.y), g[1].ra, 1e-9, 'A na ra2:');
  jednako(Math.hypot(T.E.x - T.A.x, T.E.y - T.A.y) / rez.par.pbt, rez.par.epsA, 1e-9, 'AE / pbt = εα:');
});

test('ugao boka na podeonoj kružnici = sₜ/(2r)', function () {
  var g = rez.zupcanici[0];
  jednako(C.ugaoBoka(g.r, g, rez.par.invAt), g.st / (2 * g.r), 1e-12);
});

console.log('Uvoz .SLDPRT');

// --- Pomoćno: minimalni pisač OLE (Compound File) fajla, samo za testove ---
function napraviCFB(tokovi) {
  var SEC = 512, FREE = 0xFFFFFFFF, END = 0xFFFFFFFE, FATSECT = 0xFFFFFFFD;
  var podaci = tokovi.map(function (t) {
    var n = Math.max(4096, Math.ceil(t.bajtovi.length / SEC) * SEC); // ≥ 4096 → regularni FAT
    var b = Buffer.alloc(n); Buffer.from(t.bajtovi).copy(b);
    return { ime: t.ime, b: b, velicina: Math.max(4096, t.bajtovi.length) };
  });
  var brDir = Math.ceil((tokovi.length + 1) / 4);
  var fat = [FATSECT];
  for (var i = 0; i < brDir; i++) fat.push(i === brDir - 1 ? END : fat.length + 1);
  podaci.forEach(function (t) {
    t.start = fat.length;
    var n = t.b.length / SEC;
    for (var k = 0; k < n; k++) fat.push(k === n - 1 ? END : fat.length + 1);
  });
  if (fat.length > 128) throw new Error('test CFB prevelik');
  while (fat.length < 128) fat.push(FREE);
  var h = Buffer.alloc(512);
  Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]).copy(h, 0);
  h.writeUInt16LE(0x3E, 0x18); h.writeUInt16LE(3, 0x1A); h.writeUInt16LE(0xFFFE, 0x1C);
  h.writeUInt16LE(9, 0x1E); h.writeUInt16LE(6, 0x20);
  h.writeUInt32LE(1, 0x2C); h.writeUInt32LE(1, 0x30); h.writeUInt32LE(4096, 0x38);
  h.writeUInt32LE(END, 0x3C); h.writeUInt32LE(0, 0x40); h.writeUInt32LE(END, 0x44); h.writeUInt32LE(0, 0x48);
  h.writeUInt32LE(0, 0x4C); for (var d = 1; d < 109; d++) h.writeUInt32LE(FREE, 0x4C + d * 4);
  var fatB = Buffer.alloc(512); fat.forEach(function (v, j) { fatB.writeUInt32LE(v >>> 0, j * 4); });
  var dir = Buffer.alloc(brDir * 512);
  function ulaz(idx, ime, tip, desno, dete, start, vel) {
    var o = idx * 128;
    var nb = Buffer.from(ime + '\0', 'utf16le'); nb.copy(dir, o);
    dir.writeUInt16LE(nb.length, o + 64); dir[o + 66] = tip; dir[o + 67] = 1;
    dir.writeUInt32LE(FREE, o + 68); dir.writeUInt32LE(desno, o + 72); dir.writeUInt32LE(dete, o + 76);
    dir.writeUInt32LE(start >>> 0, o + 116); dir.writeUInt32LE(vel, o + 120);
  }
  ulaz(0, 'Root Entry', 5, FREE, podaci.length ? 1 : FREE, END, 0);
  podaci.forEach(function (t, j) { ulaz(j + 1, t.ime, 2, j + 1 < podaci.length ? j + 2 : FREE, FREE, t.start, t.velicina); });
  for (var e = podaci.length + 1; e < brDir * 4; e++) {
    dir.writeUInt32LE(FREE, e * 128 + 68); dir.writeUInt32LE(FREE, e * 128 + 72); dir.writeUInt32LE(FREE, e * 128 + 76);
  }
  return Buffer.concat([h, fatB, dir].concat(podaci.map(function (t) { return t.b; })));
}

function napraviKorisnickaSvojstva(svojstva) {
  // DocumentSummaryInformation sa jednim odeljkom korisničkih svojstava (cp 1250, VT_LPSTR)
  function enc(str) { // cp1250 za srpska slova, ostalo latin1
    var m = { 'Š': 0x8A, 'š': 0x9A, 'Ž': 0x8E, 'ž': 0x9E, 'Č': 0xC8, 'č': 0xE8, 'Ć': 0xC6, 'ć': 0xE6, 'Đ': 0xD0, 'đ': 0xF0 };
    return Buffer.from(Array.from(str).map(function (ch) { return m[ch] || ch.charCodeAt(0); }));
  }
  function pad4(b) { var n = (4 - b.length % 4) % 4; return Buffer.concat([b, Buffer.alloc(n)]); }
  var imena = Object.keys(svojstva);
  var dict = [Buffer.alloc(4)]; dict[0].writeUInt32LE(imena.length, 0);
  imena.forEach(function (ime, i) {
    var hdr = Buffer.alloc(8); hdr.writeUInt32LE(i + 2, 0); hdr.writeUInt32LE(ime.length + 1, 4);
    dict.push(hdr, enc(ime + '\0'));
  });
  var props = [{ id: 0, b: pad4(Buffer.concat(dict)) }];
  var cp = Buffer.alloc(8); cp.writeUInt16LE(2, 0); cp.writeUInt16LE(1250, 4);
  props.push({ id: 1, b: cp });
  imena.forEach(function (ime, i) {
    var v = String(svojstva[ime]);
    var hb = Buffer.alloc(8); hb.writeUInt32LE(0x1E, 0); hb.writeUInt32LE(v.length + 1, 4);
    props.push({ id: i + 2, b: pad4(Buffer.concat([hb, enc(v + '\0')])) });
  });
  var tabela = Buffer.alloc(8 + props.length * 8);
  var off = tabela.length;
  props.forEach(function (p, i) { tabela.writeUInt32LE(p.id, 8 + i * 8); tabela.writeUInt32LE(off, 12 + i * 8); off += p.b.length; });
  tabela.writeUInt32LE(off, 0); tabela.writeUInt32LE(props.length, 4);
  var odeljak = Buffer.concat([tabela].concat(props.map(function (p) { return p.b; })));
  var hdr = Buffer.alloc(48);
  hdr.writeUInt16LE(0xFFFE, 0); hdr.writeUInt32LE(1, 24);
  Buffer.from([0x05, 0xD5, 0xCD, 0xD5, 0x9C, 0x2E, 0x1B, 0x10, 0x93, 0x97, 0x08, 0x00, 0x2B, 0x2C, 0xF9, 0xAE]).copy(hdr, 28);
  hdr.writeUInt32LE(48, 44);
  return Buffer.concat([hdr, odeljak]);
}

var PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
var SVOJSTVA = { ZORAN_Modul: '6.5', ZORAN_BrojZuba: '16', ZORAN_UgaoNagiba: '9', ZORAN_UgaoProfila: '20', ZORAN_Sirina: '88', ZORAN_PomeranjeProfila: '3.380', Materijal: 'Č.4320' };
var oleFajl = napraviCFB([
  { ime: '\u0005DocumentSummaryInformation', bajtovi: napraviKorisnickaSvojstva(SVOJSTVA) },
  { ime: 'PreviewPNG', bajtovi: PNG1 }
]);
// Sačuvaj primer da može ručno da se proba u aplikaciji (Uvoz)
try {
  fs.mkdirSync(path.join(__dirname, 'primeri'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'primeri', 'primer-ole.sldprt'), oleFajl);
} catch (e) { /* nije bitno za test */ }

function inflateRaw(b) { return zlib.inflateRawSync(Buffer.from(b)); }

test('OLE: čita korisnička svojstva i sliku pregleda', function () {
  return S.analiziraj(new Uint8Array(oleFajl), { inflateRaw: inflateRaw }).then(function (r) {
    tacno(/OLE/.test(r.format), 'format: ' + r.format);
    jednako(r.parametri.mn.vrednost, 6.5, 0, 'mn:');
    jednako(r.parametri.z.vrednost, 16, 0, 'z:');
    jednako(r.parametri.beta.vrednost, 9, 0, 'β:');
    jednako(r.parametri.alfaN.vrednost, 20, 0, 'αn:');
    jednako(r.parametri.b.vrednost, 88, 0, 'b:');
    jednako(r.parametri.pom.vrednost, 3.38, 0, 'pomeranje:');
    tacno(r.parametri.mn.pouzdano && /OLE/.test(r.parametri.mn.izvor));
    tacno(r.slika && r.slika.tip === 'image/png' && r.slika.bajtovi.length === PNG1.length, 'slika pregleda');
    tacno(r.svaSvojstva.some(function (s) { return s.ime === 'Materijal' && s.vrednost === 'Č.4320'; }), 'cp1250 tekst (srpska slova)');
  });
});

test('noviji format: heuristika nalazi PNG i svojstva u deflate bloku', function () {
  var sadrzaj = Buffer.concat([
    Buffer.from('xxxx', 'latin1'), PNG1,
    Buffer.from('ZORAN_Modul\0\0 6.5 ZORAN_BrojZuba: 58 ZORAN_UgaoNagiba=9', 'utf16le')
  ]);
  var komp = zlib.deflateRawSync(sadrzaj);
  var ime = Buffer.from('Contents/Config-0', 'latin1');
  var hdr = Buffer.alloc(26);
  Buffer.from([0x14, 0, 0x06, 0, 0x08, 0]).copy(hdr, 0);
  hdr.writeUInt32LE(komp.length, 14); hdr.writeUInt32LE(sadrzaj.length, 18);
  hdr.writeUInt16LE(ime.length, 22); hdr.writeUInt16LE(0, 24);
  var fajl = Buffer.concat([Buffer.alloc(100, 7), hdr, ime, komp, Buffer.alloc(50, 3)]);
  return S.analiziraj(new Uint8Array(fajl), { inflateRaw: inflateRaw }).then(function (r) {
    tacno(r.format === 'noviji format');
    tacno(r.slika && r.slika.tip === 'image/png', 'PNG');
    jednako(r.parametri.mn.vrednost, 6.5, 0, 'mn:');
    jednako(r.parametri.z.vrednost, 58, 0, 'z:');
    jednako(r.parametri.beta.vrednost, 9, 0, 'β:');
    tacno(!r.parametri.mn.pouzdano, 'heuristika je označena kao nepouzdana');
    tacno(!r.parametri.b, 'širina nije pronađena');
  });
});

test('nepoznat fajl ne izaziva grešku', function () {
  return S.analiziraj(new Uint8Array([1, 2, 3, 4, 5]), { inflateRaw: inflateRaw }).then(function (r) {
    tacno(Object.keys(r.parametri).length === 0 && r.slika === null);
  });
});

Promise.all(cekanje).then(function () {
  console.log('\nUkupno: ' + (prosli + pali) + ', prošlo: ' + prosli + ', palo: ' + pali);
  process.exit(pali ? 1 : 0);
});
