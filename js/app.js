/* Zoran — korisnički interfejs */
(function () {
  'use strict';

  var APP_VERSION = '1.12.1';
  var P = window.Proracun, C = window.Crtez;
  var LINK_APLIKACIJE = 'https://bagaljivko.github.io/ZORAN/';

  // Retko korišćeni moduli (uvoz .SLDPRT, QR kod) učitavaju se tek kad zatrebaju — iz keša, pa rade i offline.
  var ucitaneSkripte = {};
  function ucitajSkriptu(src) {
    if (!ucitaneSkripte[src]) ucitaneSkripte[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete ucitaneSkripte[src]; reject(new Error('modul „' + src + '“ nije učitan')); };
      document.head.appendChild(s);
    });
    return ucitaneSkripte[src];
  }
  function ucitajSldprt() { return ucitajSkriptu('./js/sldprt.js').then(function () { return window.Sldprt; }); }
  function ucitajQR() {
    return ucitajSkriptu('./js/vendor/qrcode-generator.js').then(function () { return ucitajSkriptu('./js/podeli.js'); }).then(function () { return window.Podeli; });
  }
  var DEG = P.DEG;
  var MM_PO_INCU = 25.4;

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function el(tag, attrs, deca) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (deca || []).forEach(function (d) { if (d) e.appendChild(typeof d === 'string' ? document.createTextNode(d) : d); });
    return e;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ------------------------------------------------------------------
  // Skladište
  // ------------------------------------------------------------------
  function citaj(kljuc, podr) {
    try { var v = localStorage.getItem(kljuc); return v ? JSON.parse(v) : podr; } catch (e) { return podr; }
  }
  var posleUpisa = null; // Google Drive: beleži izmene ključeva koji se sinhronizuju
  var skladisteZakljucano = false; // posle učitavanja kopije sa Drive-a, do ponovnog učitavanja stranice
  function pisi(kljuc, v) {
    if (skladisteZakljucano) return;
    var novo = JSON.stringify(v), staro = null;
    try { staro = localStorage.getItem(kljuc); localStorage.setItem(kljuc, novo); } catch (e) { /* privatni režim */ }
    if (posleUpisa && staro !== novo) posleUpisa(kljuc);
  }

  var pod = Object.assign({ jedinice: 'mm', znak: ',', decimale: 3 }, citaj('zoran.podesavanja', {}));

  // ------------------------------------------------------------------
  // Formatiranje brojeva
  // ------------------------------------------------------------------
  function fmt(v, dec) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    if (dec === undefined) dec = pod.decimale;
    var s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    if (pod.znak === ',') s = s.replace('.', ',');
    return s.replace('-', '−');
  }
  function zaKopiju(v, dec) { return fmt(v, dec).replace('−', '-'); }
  function duz(mm) { return pod.jedinice === 'in' ? mm / MM_PO_INCU : mm; }
  function izDuz(v) { return pod.jedinice === 'in' ? v * MM_PO_INCU : v; }
  function jedDuz() { return pod.jedinice === 'in' ? 'in' : 'mm'; }
  /** Broj u polju za unos (bez nepotrebnih nula). */
  function zaPolje(v) {
    if (!isFinite(v)) return '';
    var s = String(Math.round(v * 1e6) / 1e6);
    return pod.znak === ',' ? s.replace('.', ',') : s;
  }

  // ------------------------------------------------------------------
  // Ikonice
  // ------------------------------------------------------------------
  var IKONA_KOPIRAJ = '<svg class="ikona" viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="6.5" width="10" height="11"/><path d="M13.5 6.5v-3h-10v11h3"/></svg>' +
    '<svg class="kvacica" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg><span class="natpis">kopirano</span>';

  /** Kopira tekst; obećanje vraća true ako je kopiranje uspelo. */
  function kopirajTekst(tekst) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(tekst).then(function () { return true; }, function () { return kopirajRezervno(tekst); });
    }
    return Promise.resolve(kopirajRezervno(tekst));
  }
  function kopirajRezervno(tekst) {
    // u otvorenom modalnom prozoru ostatak stranice je neaktivan, pa polje ide u prozor
    var dom = document.querySelector('dialog[open]') || document.body;
    var t = el('textarea', { readonly: true, 'aria-hidden': 'true', style: 'position:fixed;top:-1000px;left:0;opacity:0;font-size:16px' });
    t.value = tekst;
    dom.appendChild(t);
    t.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    dom.removeChild(t);
    return ok;
  }
  function oznaciKopirano(dugme) {
    dugme.classList.add('kopirano');
    $('#obavestenje').textContent = 'Kopirano.';
    clearTimeout(dugme._tajmer);
    dugme._tajmer = setTimeout(function () { dugme.classList.remove('kopirano'); }, 1500);
  }
  function dugmeKopiraj(getTekst, opis) {
    var b = el('button', { type: 'button', class: 'kopiraj', 'aria-label': 'Kopiraj: ' + opis, title: 'Kopiraj', html: IKONA_KOPIRAJ });
    b.addEventListener('click', function () {
      kopirajTekst(getTekst()).then(function () { oznaciKopirano(b); });
    });
    return b;
  }

  /**
   * Red „Tablice“: naziv ······ vrednost jed [kopiraj]
   * spec: {naziv (HTML), v (broj), dec, jed, tekst (za Kopiraj sve), upozorenje}
   */
  function redTablice(spec) {
    var r = el('div', { class: 'red' + (spec.upozorenje ? ' upozorenje' : '') });
    r.appendChild(el('span', { class: 'naziv', html: spec.naziv }));
    r.appendChild(el('span', { class: 'tackice', 'aria-hidden': 'true' }));
    var vr = typeof spec.v === 'number' ? fmt(spec.v, spec.dec) : String(spec.v);
    r.appendChild(el('span', { class: 'vrednost', text: vr }));
    r.appendChild(el('span', { class: 'jed', text: spec.jed || '' }));
    if (typeof spec.v === 'number' && isFinite(spec.v)) {
      r.appendChild(dugmeKopiraj(function () { return zaKopiju(spec.v, spec.dec); }, (spec.tekst || spec.naziv.replace(/<[^>]+>/g, ''))));
    } else r.appendChild(el('span', { style: 'width:44px;flex:none' }));
    return r;
  }

  // ------------------------------------------------------------------
  // Navigacija
  // ------------------------------------------------------------------
  var EKRANI = {
    proracun: { naziv: 'Proračun', strana: 1 },
    tablica: { naziv: 'Tablica', strana: 2 },
    savetnik: { naziv: 'Savetnik', strana: 3 },
    uvoz: { naziv: 'Uvoz', strana: 4 },
    podesavanja: { naziv: 'Podešavanja', strana: 5 }
  };
  var sirokUpit = window.matchMedia('(min-width: 1100px)');
  var trenutni = 'proracun';

  function prikaziEkran(ime, bezIstorije) {
    if (!EKRANI[ime]) ime = 'proracun';
    trenutni = ime;
    var sirok = sirokUpit.matches;
    var radni = sirok && (ime === 'proracun' || ime === 'tablica');
    $('#sadrzaj').classList.toggle('radni', radni);
    Object.keys(EKRANI).forEach(function (k) {
      var vidljiv = radni ? (k === 'proracun' || k === 'tablica') : k === ime;
      $('#ekran-' + k).classList.toggle('aktivan', vidljiv);
    });
    var prikazano = radni ? 'proracun' : ime;
    $('#naziv-ekrana').textContent = radni ? 'Proračun · Tablica' : EKRANI[ime].naziv;
    $('#broj-strane').textContent = '— ' + EKRANI[prikazano].strana + ' —';
    $$('[data-idi]').forEach(function (b) {
      if (!b.closest('.donja-traka') && !b.closest('.gornja-traka')) return;
      var cilj = b.getAttribute('data-idi');
      var akt = cilj === ime || (radni && cilj === 'proracun');
      if (akt) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.title = 'Zoran — ' + (radni ? 'Proračun' : EKRANI[ime].naziv);
    if (!bezIstorije && location.hash !== '#' + ime) {
      try { history.replaceState(null, '', '#' + ime); } catch (e) { location.hash = ime; }
    }
    if (ime === 'podesavanja') osveziDijagnostiku();
    osveziVidljivo();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-idi]');
    if (b) prikaziEkran(b.getAttribute('data-idi'));
  });
  window.addEventListener('hashchange', function () { prikaziEkran(location.hash.slice(1), true); });
  (sirokUpit.addEventListener ? sirokUpit.addEventListener.bind(sirokUpit, 'change') : sirokUpit.addListener.bind(sirokUpit))(function () { prikaziEkran(trenutni, true); });

  // ------------------------------------------------------------------
  // Proračun: unos
  // ------------------------------------------------------------------
  var POLJA = ['z1', 'z2', 'mn', 'beta', 'alfaN', 'b', 'a', 'xz'];
  var DUZINSKA = { b: true, a: true };
  var poslednjiRez = null;   // poslednji ispravan rezultat
  var trenutniRez = null;    // rezultat za trenutni unos (može biti neispravan)

  function trenutnaRaspodela() {
    var r = $('input[name="raspodela"]:checked');
    return r ? r.value : 'din';
  }
  function postaviRaspodelu(nacin) {
    if (nacin !== 'x1' && nacin !== 'x2') nacin = 'din';
    $$('input[name="raspodela"]').forEach(function (r) { r.checked = r.value === nacin; });
    $('#polje-xz').hidden = nacin === 'din';
    $('#xz-indeks').textContent = nacin === 'x2' ? '₂' : '₁';
    if (nacin !== 'din' && $('#u-xz').value.trim() === '') $('#u-xz').value = '0';
  }
  function upisiUnos(vrednostiMm) {
    if (vrednostiMm.raspodela !== undefined) postaviRaspodelu(vrednostiMm.raspodela);
    POLJA.forEach(function (k) {
      if (vrednostiMm[k] === undefined) return;
      var v = vrednostiMm[k];
      $('#u-' + k).value = typeof v === 'number' ? zaPolje(DUZINSKA[k] ? duz(v) : v) : v;
    });
  }
  function procitajUnos() {
    var u = {};
    POLJA.forEach(function (k) {
      var v = P.parsirajBroj($('#u-' + k).value);
      u[k] = DUZINSKA[k] && isFinite(v) ? izDuz(v) : v;
    });
    u.raspodela = trenutnaRaspodela();
    return u;
  }
  function sacuvajUnos() {
    var u = procitajUnos(), sirovo = {};
    POLJA.forEach(function (k) { sirovo[k] = $('#u-' + k).value; });
    pisi('zoran.unos', { vrednosti: u, sirovo: sirovo, jedinice: pod.jedinice });
  }

  // Osno rastojanje: idealno (Σx ≈ 0,35, zaokruženo na 0,5 mm) se računa samo dok ga korisnik ručno ne promeni.
  var aRucno = !!citaj('zoran.aRucno', false);
  function idealnoA(u) {
    if (![u.z1, u.z2, u.mn, u.beta, u.alfaN].every(function (v) { return typeof v === 'number' && isFinite(v); })) return NaN;
    if (u.z1 < 5 || u.z2 < 5 || u.mn <= 0 || u.beta < 0 || u.beta >= 45 || u.alfaN < 10 || u.alfaN > 35) return NaN;
    return P.rastojanjeZaSumuX(u.z1, u.z2, u.mn, u.beta, u.alfaN, 0.35);
  }
  function postaviRucnoA(da) { aRucno = !!da; pisi('zoran.aRucno', aRucno); }
  function osveziNapomenuA(u) {
    var id = idealnoA(u);
    var h = $('#h-a');
    if (!isFinite(id)) { h.textContent = 'Iz njega se računa pomeranje profila.'; $('#idealno-a').hidden = true; return; }
    if (aRucno) {
      h.innerHTML = 'Ručno zadato. Idealno za ove zupčanike: ' + esc(fmt(duz(id), pod.jedinice === 'in' ? 3 : 1)) + ' ' + jedDuz() + ' (Σ<i>x</i> ≈ 0,35).';
      $('#idealno-a').hidden = Math.abs(id - (u.a || 0)) < 1e-6;
    } else {
      h.innerHTML = 'Idealno za ove zupčanike (Σ<i>x</i> ≈ 0,35) — računa se samo; slobodno ga promeni.';
      $('#idealno-a').hidden = true;
    }
  }

  function preracunaj() {
    if (!aRucno) {
      var id0 = idealnoA(procitajUnos());
      if (isFinite(id0)) $('#u-a').value = zaPolje(duz(id0));
    }
    var u = procitajUnos();
    var r = P.proracunajIzRastojanja(u);
    trenutniRez = r;
    osveziNapomenuA(u);
    // poruke po poljima
    POLJA.forEach(function (k) {
      $('#p-' + k).textContent = '';
      $('#u-' + k).removeAttribute('aria-invalid');
    });
    r.greske.forEach(function (g) {
      var p = $('#p-' + g.polje);
      if (p) { p.textContent = g.poruka; $('#u-' + g.polje).setAttribute('aria-invalid', 'true'); }
    });
    if (r.ok) poslednjiRez = r;
    zakaziCuvanje();
    prikaziRezultate();
  }

  // Čuvanje unosa: najviše jednom u 250 ms dok se kuca, odmah pri zatvaranju stranice.
  var tajmerCuvanja = 0;
  function zakaziCuvanje() { clearTimeout(tajmerCuvanja); tajmerCuvanja = setTimeout(sacuvajUnos, 250); }
  function sacuvajOdmah() { if (tajmerCuvanja) { clearTimeout(tajmerCuvanja); tajmerCuvanja = 0; sacuvajUnos(); } }
  window.addEventListener('pagehide', sacuvajOdmah);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sacuvajOdmah(); });

  // Kucanje: više pritisaka u istom kadru → jedan preračun.
  var zakazanPreracun = 0;
  function zakaziPreracun() {
    if (zakazanPreracun) return;
    zakazanPreracun = requestAnimationFrame(function () { zakazanPreracun = 0; preracunaj(); });
  }

  function prikaziUpozorenja(cilj, r) {
    var box = $(cilj);
    box.innerHTML = '';
    if (!r) return;
    if (!r.ok) {
      box.appendChild(el('p', { class: 'naslov', text: 'Unos nije ispravan' }));
      r.greske.forEach(function (g) { box.appendChild(el('p', { text: g.poruka })); });
      return;
    }
    if (r.upozorenja.length) {
      box.appendChild(el('p', { class: 'naslov', text: 'Upozorenja' }));
      r.upozorenja.forEach(function (w) { box.appendChild(el('p', { text: w.poruka })); });
    }
  }

  /** Ispod crteža: izračunato pomeranje profila i provera osnog rastojanja. */
  function prikaziPomeranje(rez) {
    var t = $('#tablica-pomeranje'), tp = $('#tablica-provera'), st = $('#provera-status');
    t.innerHTML = ''; tp.innerHTML = ''; st.textContent = ''; st.classList.remove('odstupa');
    if (!rez || !rez.raspodela) return;
    var rs = rez.raspodela, J = jedDuz(), u = rez.ulaz;
    [
      { naziv: 'Zbir koeficijenata Σ<i>x</i>', v: rs.sumaX, dec: 4, upozorenje: rs.sumaX > 1.2 || rs.sumaX < -0.5, tekst: 'Zbir koeficijenata Σx' },
      { naziv: 'Koeficijent <i>x</i>₁ (mali)', v: rs.x1, dec: 4, tekst: 'Koeficijent x1' },
      { naziv: 'Pomeranje profila <i>x</i>₁·<i>m</i>ₙ', v: duz(rs.pom1), dec: Math.max(3, pod.decimale), jed: J, tekst: 'Pomeranje profila 1' },
      { naziv: 'Koeficijent <i>x</i>₂ (veliki)', v: rs.x2, dec: 4, tekst: 'Koeficijent x2' },
      { naziv: 'Pomeranje profila <i>x</i>₂·<i>m</i>ₙ', v: duz(rs.pom2), dec: Math.max(3, pod.decimale), jed: J, tekst: 'Pomeranje profila 2' }
    ].forEach(function (sp) { t.appendChild(redTablice(sp)); });
    if (rs.pomereno) t.appendChild(el('p', { class: 'sitno', text: 'Raspodela je pomerena da oba koeficijenta budu najmanje x_min (bez podsecanja).' }));
    if (rs.nacin === 'x1' || rs.nacin === 'x2') {
      var zad = rs.nacin === 'x1' ? 1 : 2, ost = zad === 1 ? 2 : 1;
      t.appendChild(el('p', { class: 'sitno', html: 'Koeficijent <i>x</i>' + (zad === 1 ? '₁' : '₂') + ' je zadat' + (Math.abs(zad === 1 ? rs.x1 : rs.x2) < 1e-12 ? ' (bez pomeranja)' : '') +
        '; <i>x</i>' + (ost === 1 ? '₁' : '₂') + ' = Σ<i>x</i> − <i>x</i>' + (zad === 1 ? '₁' : '₂') + ' (nije po DIN 3992).' }));
    }

    // Provera: a iz pomeranja zaokruženih na prikazani broj decimala (u izabranim jedinicama)
    function zaokruzi(mm) { var f = Math.pow(10, pod.decimale); return izDuz(Math.round(duz(mm) * f) / f); }
    var aProvera = P.rastojanjeIzPomeranja(u, zaokruzi(rs.pom1), zaokruzi(rs.pom2));
    var razlika = aProvera - rs.a;
    [
      { naziv: 'Zadato osno rastojanje <i>a</i>', v: duz(rs.a), jed: J, tekst: 'Zadato osno rastojanje a' },
      { naziv: 'Osno rastojanje iz pomeranja', v: duz(aProvera), jed: J, tekst: 'Osno rastojanje iz pomeranja' },
      { naziv: 'Razlika', v: duz(razlika), dec: Math.max(pod.decimale, 4), jed: J, tekst: 'Razlika osnog rastojanja' }
    ].forEach(function (sp) { tp.appendChild(redTablice(sp)); });
    var tolerancija = 0.01; // mm
    if (isFinite(razlika) && Math.abs(razlika) <= tolerancija) {
      st.textContent = '✓ Podudara se sa zadatim osnim rastojanjem (odstupanje ispod ' + fmt(duz(tolerancija), pod.jedinice === 'in' ? 4 : 2) + ' ' + J + ').';
    } else {
      st.textContent = 'Odstupa od zadatog osnog rastojanja — proveri zaokruživanje pomeranja.';
      st.classList.add('odstupa');
    }
  }

  function prikaziNapomene(cilj, rez) {
    var box = $(cilj);
    box.innerHTML = '';
    if (!rez) return;
    var n = P.napomeneZaKonstrukciju(rez);
    if (!n.length) return;
    box.appendChild(el('p', { class: 'naslov', text: 'Napomene za konstrukciju' }));
    n.forEach(function (x) { box.appendChild(el('p', { text: x.poruka })); });
  }

  // Delovi ekrana koji treba ponovo da se iscrtaju; gradi se samo ono što je vidljivo.
  var zastarelo = { proracun: true, tablica: true, savetnik: true };
  function vidljivEkran(k) { return $('#ekran-' + k).classList.contains('aktivan'); }
  function osveziVidljivo() {
    if (zastarelo.proracun && vidljivEkran('proracun')) { zastarelo.proracun = false; prikaziProracunDeo(); crtaj(); }
    if (zastarelo.tablica && vidljivEkran('tablica')) { zastarelo.tablica = false; prikaziTablicuDeo(); }
    if (zastarelo.savetnik && vidljivEkran('savetnik')) { zastarelo.savetnik = false; racunajSavetnik(); }
  }
  function prikaziRezultate() {
    zastarelo.proracun = zastarelo.tablica = zastarelo.savetnik = true;
    osveziVidljivo();
    zakaziPozadinsko();
  }

  // Skriveni ekrani se pripremaju u pozadini, kad aplikacija miruje (posle kucanja),
  // pa je prelazak na Tablicu ili Savetnik odmah gotov, a kucanje ostaje brzo.
  var tajmerPozadine = 0;
  var cekajMirovanje = window.requestIdleCallback ? function (f) { return window.requestIdleCallback(f, { timeout: 1200 }); } : function (f) { return setTimeout(f, 60); };
  function zakaziPozadinsko() {
    clearTimeout(tajmerPozadine);
    tajmerPozadine = setTimeout(function () {
      cekajMirovanje(function () {
        if (zastarelo.tablica) { zastarelo.tablica = false; prikaziTablicuDeo(); }
        cekajMirovanje(function () {
          if (zastarelo.savetnik) { zastarelo.savetnik = false; racunajSavetnik(); }
        });
      });
    }, 350);
  }
  function prikaziSve() { // štampa: sve mora biti tačno, i ono što se ne vidi
    zastarelo.proracun = zastarelo.tablica = false;
    prikaziProracunDeo(); prikaziTablicuDeo(); crtaj(true);
  }

  function prikaziProracunDeo() {
    if (detaljiVratila && detaljiVratila.open) racunajVratilo();
    var r = trenutniRez;
    prikaziUpozorenja('#upozorenja-proracun', r);
    prikaziNapomene('#napomene-proracun', poslednjiRez);
    var napomena = $('#napomena-proracun');
    napomena.textContent = !r.ok && poslednjiRez ? 'Zoran obično računa apsolutno nepogrešivo — ali samo sa ispravnim podacima. Crtež i tablica prikazuju poslednji ispravan unos.' : '';

    var rez = poslednjiRez;
    var kratka = $('#tablica-kratka');
    kratka.innerHTML = '';
    prikaziPomeranje(rez);
    if (!rez) return;
    // kratka tablica (telefon)
    redoviTablice(rez).par.filter(function (s) { return s.kratko; }).forEach(function (s) { kratka.appendChild(redTablice(s)); });
  }

  function prikaziTablicuDeo() {
    var r = trenutniRez, rez = poslednjiRez;
    prikaziUpozorenja('#upozorenja-tablica', r);
    prikaziNapomene('#napomene-tablica', rez);
    prikaziSile();
    prikaziVarijante();
    var puna = $('#tablica-puna');
    puna.innerHTML = '';
    if (!rez) {
      puna.appendChild(el('p', { class: 'kurziv', text: 'Zoran obično računa apsolutno nepogrešivo — ali samo sa ispravnim podacima. Ispravi unos.' }));
      return;
    }
    var redovi = redoviTablice(rez);
    // puna tablica
    puna.appendChild(el('h3', { text: 'Par zupčanika' }));
    var t1 = el('div', { class: 'tablica' });
    redovi.par.forEach(function (s) { t1.appendChild(redTablice(s)); });
    puna.appendChild(t1);
    [0, 1].forEach(function (i) {
      var g = rez.zupcanici[i];
      puna.appendChild(el('h3', { html: (i === 0 ? 'Mali' : 'Veliki') + ' zupčanik, <i>z</i>' + (i === 0 ? '₁' : '₂') + ' = ' + g.z }));
      var t = el('div', { class: 'tablica' });
      redovi.zup[i].forEach(function (s) { t.appendChild(redTablice(s)); });
      puna.appendChild(t);
    });
  }

  function redoviTablice(rez) {
    var p = rez.par, J = jedDuz();
    var par = [
      { naziv: 'Prenosni odnos <i>u</i> = <i>z</i>₂/<i>z</i>₁', v: p.u, dec: 4, tekst: 'Prenosni odnos u' },
      { naziv: 'Čeoni modul <i>m</i>ₜ', v: duz(p.mt), jed: J, tekst: 'Čeoni modul mt' },
      { naziv: 'Čeoni ugao profila <i>α</i>ₜ', v: p.alfaT / DEG, dec: 4, jed: '°', tekst: 'Čeoni ugao profila αt' },
      { naziv: 'Pogonski ugao zahvata <i>α</i>wt', v: p.alfaWt / DEG, dec: 4, jed: '°', tekst: 'Pogonski ugao zahvata αwt' },
      { naziv: 'Nulto osno rastojanje <i>a</i>₀', v: duz(p.a0), jed: J, tekst: 'Nulto osno rastojanje a0' },
      { naziv: 'Osno rastojanje <i>a</i>', v: duz(p.a), jed: J, kratko: true, tekst: 'Osno rastojanje a' },
      { naziv: 'Zbir koeficijenata <i>x</i>₁ + <i>x</i>₂', v: p.sumaX, dec: 4, tekst: 'Zbir koeficijenata x1 + x2' },
      { naziv: 'Koeficijent razmicanja osa <i>y</i>', v: p.y, dec: 4, tekst: 'Koeficijent razmicanja osa y' },
      { naziv: 'Skraćenje temena <i>k</i>', v: p.k, dec: 4, tekst: 'Skraćenje temena k' },
      { naziv: 'Osnovni korak <i>p</i>bt', v: duz(p.pbt), jed: J, tekst: 'Osnovni korak pbt' },
      { naziv: 'Dužina aktivnog dela <i>AE</i>', v: duz(p.gAlfa), jed: J, tekst: 'Dužina aktivnog dela AE' },
      { naziv: 'Početak zahvata od <i>T</i>₁ (<i>T</i>₁<i>A</i>)', v: duz(p.tA), jed: J, upozorenje: p.tA < 0, tekst: 'Početak zahvata od T1 (T1A)' },
      { naziv: 'Kraj zahvata do <i>T</i>₂ (<i>ET</i>₂)', v: duz(p.tE), jed: J, upozorenje: p.tE < 0, tekst: 'Kraj zahvata do T2 (ET2)' },
      { naziv: 'Stepen sprezanja profila <i>ε</i>α', v: p.epsA, dec: 4, kratko: true, upozorenje: p.epsA < 1.1, tekst: 'Stepen sprezanja profila εα' },
      { naziv: 'Stepen sprezanja bokova <i>ε</i>β', v: p.epsB, dec: 4, kratko: true, tekst: 'Stepen sprezanja bokova εβ' },
      { naziv: 'Ukupni stepen sprezanja <i>ε</i>γ', v: p.epsG, dec: 4, kratko: true, tekst: 'Ukupni stepen sprezanja εγ' }
    ];
    var km = [P.kontrolneMere(rez, 0), P.kontrolneMere(rez, 1)];
    var zup = rez.zupcanici.map(function (g, i) {
      var ix = i === 0 ? '₁' : '₂', ixa = i === 0 ? '1' : '2';
      var podsec = rez.upozorenja.some(function (w) { return w.kod === 'podsecanje' && w.zupcanik === i; });
      var zas = rez.upozorenja.some(function (w) { return w.kod === 'zasiljen' && w.zupcanik === i; });
      return [
        { naziv: 'Pomeranje profila <i>x</i>·<i>m</i>ₙ', v: duz(g.pomeranje), dec: Math.max(3, pod.decimale), jed: J, tekst: 'Pomeranje profila ' + ixa },
        { naziv: 'Koeficijent pomeranja <i>x</i>' + ix, v: g.x, dec: 4, upozorenje: podsec, tekst: 'Koeficijent pomeranja x' + ixa },
        { naziv: 'Podeoni prečnik <i>d</i>' + ix, v: duz(g.d), jed: J, tekst: 'Podeoni prečnik d' + ixa },
        { naziv: 'Osnovni prečnik <i>d</i>b' + ix, v: duz(g.db), jed: J, tekst: 'Osnovni prečnik db' + ixa },
        { naziv: 'Kotrljajni prečnik <i>d</i>w' + ix, v: duz(g.dw), jed: J, tekst: 'Kotrljajni prečnik dw' + ixa },
        { naziv: 'Temeni prečnik <i>d</i>ₐ' + ix, v: duz(g.da), jed: J, tekst: 'Temeni prečnik da' + ixa },
        { naziv: 'Podnožni prečnik <i>d</i>f' + ix, v: duz(g.df), jed: J, tekst: 'Podnožni prečnik df' + ixa },
        { naziv: 'Visina zuba <i>h</i>', v: duz(g.h), jed: J, tekst: 'Visina zuba h' + ixa },
        { naziv: 'Debljina zuba <i>s</i>ₜ (podeona)', v: duz(g.st), jed: J, tekst: 'Debljina zuba st' + ixa },
        { naziv: 'Debljina na temenu <i>s</i>ₐ', v: duz(g.sa), jed: J, upozorenje: zas, tekst: 'Debljina na temenu sa' + ixa },
        { naziv: 'Ugao profila na temenu <i>α</i>ₐ', v: g.alfaA / DEG, dec: 4, jed: '°', tekst: 'Ugao profila na temenu αa' + ixa },
        { naziv: 'Ekvivalentni broj zuba <i>z</i>ₙ', v: g.zn, dec: 3, tekst: 'Ekvivalentni broj zuba zn' + ixa },
        { naziv: 'Granica podsecanja <i>x</i>min', v: g.xmin, dec: 4, tekst: 'Granica podsecanja xmin' + ixa },
        { naziv: 'Mera preko zuba <i>W</i>' + '<sub>' + km[i].k + '</sub> (preko ' + km[i].k + ' zuba)', v: duz(km[i].W), jed: J, upozorenje: !km[i].mozeW, tekst: 'Mera preko zuba W' + ixa + ' (k = ' + km[i].k + ')' },
        { naziv: 'Prečnik kuglice <i>D</i>M', v: duz(km[i].DM), jed: J, tekst: 'Prečnik kuglice DM' + ixa },
        { naziv: 'Mera preko kuglica <i>M</i>d', v: duz(km[i].Md), jed: J, upozorenje: !km[i].kuglicaDobra, tekst: 'Mera preko kuglica Md' + ixa }
      ];
    });
    return { par: par, zup: zup };
  }

  function tekstSvega() {
    var rez = poslednjiRez;
    if (!rez) return '';
    var redovi = redoviTablice(rez);
    var u = rez.ulaz;
    var linije = ['Zoran ' + APP_VERSION + ' — Zet Obično Računa Apsolutno Nepogrešivo', 'Zupčasti par z1 = ' + u.z1 + ', z2 = ' + u.z2 + ', mn = ' + zaKopiju(u.mn) + ' mm, β = ' + zaKopiju(u.beta) + '°, αn = ' + zaKopiju(u.alfaN) + '°, b = ' + zaKopiju(duz(u.b)) + ' ' + jedDuz() + ', zadato a = ' + zaKopiju(duz(u.a)) + ' ' + jedDuz(), ''];
    function dodaj(s) { linije.push(s.tekst + '\t' + zaKopiju(s.v, s.dec) + (s.jed ? '\t' + s.jed : '')); }
    linije.push('Par zupčanika'); redovi.par.forEach(dodaj);
    linije.push('', 'Mali zupčanik (z1 = ' + u.z1 + ')'); redovi.zup[0].forEach(dodaj);
    linije.push('', 'Veliki zupčanik (z2 = ' + u.z2 + ')'); redovi.zup[1].forEach(dodaj);
    var sile = trenutneSile();
    if (sile) { linije.push('', 'Sile u zahvatu (T1 = ' + zaKopiju(sile.T1, 1) + ' N·m)'); redoviSila(sile).forEach(dodaj); }
    if (rez.upozorenja.length) { linije.push('', 'Upozorenja'); rez.upozorenja.forEach(function (w) { linije.push(w.poruka); }); }
    var nap = P.napomeneZaKonstrukciju(rez);
    if (nap.length) { linije.push('', 'Napomene za konstrukciju'); nap.forEach(function (w) { linije.push(w.poruka); }); }
    return linije.join('\n');
  }

  // ------------------------------------------------------------------
  // Sile u zahvatu
  // ------------------------------------------------------------------
  function trenutneSile() {
    var T = P.parsirajBroj($('#u-T1').value);
    if (!poslednjiRez || !isFinite(T) || T <= 0) return null;
    return P.sileUZahvatu(poslednjiRez, T);
  }
  function redoviSila(f) {
    return [
      { naziv: 'Obimna sila <i>F</i>ₜ', v: f.Ft, dec: 1, jed: 'N', tekst: 'Obimna sila Ft' },
      { naziv: 'Radijalna sila <i>F</i>ᵣ', v: f.Fr, dec: 1, jed: 'N', tekst: 'Radijalna sila Fr' },
      { naziv: 'Aksijalna sila <i>F</i>ₐ', v: f.Fa, dec: 1, jed: 'N', tekst: 'Aksijalna sila Fa' },
      { naziv: 'Normalna sila na bok <i>F</i>ₙ', v: f.Fn, dec: 1, jed: 'N', tekst: 'Normalna sila Fn' },
      { naziv: 'Moment na velikom <i>T</i>₂ (bez gubitaka)', v: f.T2, dec: 1, jed: 'N·m', tekst: 'Moment na velikom T2' }
    ];
  }
  function prikaziSile() {
    var t = $('#tablica-sile'), por = $('#p-T1');
    t.innerHTML = ''; por.textContent = ''; $('#u-T1').removeAttribute('aria-invalid');
    var txt = $('#u-T1').value.trim();
    if (!txt) return;
    var T = P.parsirajBroj(txt);
    if (!isFinite(T) || T <= 0) { por.textContent = 'Obrtni moment: unesi pozitivan broj u N·m.'; $('#u-T1').setAttribute('aria-invalid', 'true'); return; }
    var f = trenutneSile();
    if (!f) return;
    redoviSila(f).forEach(function (sp) { t.appendChild(redTablice(sp)); });
    t.appendChild(el('p', { class: 'sitno', html: 'Sile deluju na kotrljajnom prečniku malog zupčanika: <i>F</i>ₜ = 2<i>T</i>₁/<i>d</i>w₁, <i>F</i>ᵣ = <i>F</i>ₜ·tan <i>α</i>wt, <i>F</i>ₐ = <i>F</i>ₜ·tan <i>β</i>w.' }));
  }

  // ------------------------------------------------------------------
  // Varijante — poređenje
  // ------------------------------------------------------------------
  var VARIJANTE_KLJUC = 'zoran.varijante';
  function citajVarijante() { var v = citaj(VARIJANTE_KLJUC, []); return Array.isArray(v) ? v : []; }
  function prikaziVarijante() {
    var okvir = $('#varijante');
    var lista = citajVarijante();
    okvir.innerHTML = '';
    $('#dugme-kopiraj-poredjenje').hidden = !lista.length;
    if (!lista.length) return;
    var J = jedDuz();
    var rez = lista.map(function (v) { return P.proracunajIzRastojanja(v.ulaz); });
    var redovi = [
      ['z₁ / z₂', function (r, v) { return v.ulaz.z1 + ' / ' + v.ulaz.z2; }],
      ['mₙ [mm]', function (r, v) { return fmt(v.ulaz.mn, 3).replace(/[,.]?0+$/, ''); }],
      ['β [°]', function (r, v) { return fmt(v.ulaz.beta, 2).replace(/[,.]?0+$/, ''); }],
      ['b [' + J + ']', function (r, v) { return fmt(duz(v.ulaz.b)); }],
      ['a [' + J + ']', function (r, v) { return fmt(duz(v.ulaz.a)); }],
      ['Σx', function (r) { return r.ok ? fmt(r.raspodela.sumaX, 4) : '—'; }],
      ['x₁ / x₂', function (r) { return r.ok ? fmt(r.raspodela.x1, 3) + ' / ' + fmt(r.raspodela.x2, 3) : '—'; }],
      ['dₐ₁ [' + J + ']', function (r) { return r.ok ? fmt(duz(r.zupcanici[0].da)) : '—'; }],
      ['dₐ₂ [' + J + ']', function (r) { return r.ok ? fmt(duz(r.zupcanici[1].da)) : '—'; }],
      ['εα', function (r) { return r.ok ? fmt(r.par.epsA, 3) : '—'; }],
      ['εβ', function (r) { return r.ok ? fmt(r.par.epsB, 3) : '—'; }],
      ['εγ', function (r) { return r.ok ? fmt(r.par.epsG, 3) : '—'; }],
      ['Upozorenja', function (r) { return !r.ok ? 'neispravno' : r.upozorenja.length ? String(r.upozorenja.length) : 'nema'; }, function (r) { return !r.ok || r.upozorenja.length; }]
    ];
    var tab = el('table', { class: 'varijante' });
    var glava = el('tr', null, [el('th', { scope: 'col', text: 'Veličina' })]);
    lista.forEach(function (v) { glava.appendChild(el('th', { scope: 'col', text: v.ime })); });
    tab.appendChild(el('thead', null, [glava]));
    var telo = el('tbody');
    redovi.forEach(function (red) {
      var tr = el('tr', null, [el('td', { text: red[0] })]);
      lista.forEach(function (v, i) { tr.appendChild(el('td', { class: red[2] && red[2](rez[i]) ? 'upozorenje' : null, text: red[1](rez[i], v) })); });
      telo.appendChild(tr);
    });
    var akc = el('tr', null, [el('td', { text: '' })]);
    lista.forEach(function (v, i) {
      akc.appendChild(el('td', { class: 'akcije' }, [
        el('button', { type: 'button', class: 'dugme', text: 'Učitaj', 'aria-label': 'Učitaj ' + v.ime + ' u proračun', onclick: function () {
          postaviRucnoA(true); upisiUnos(v.ulaz); preracunaj(); prikaziEkran('proracun');
          $('#napomena-proracun').textContent = 'Učitana je ' + v.ime + '.';
        } }), ' ',
        el('button', { type: 'button', class: 'dugme', text: 'Obriši', 'aria-label': 'Obriši ' + v.ime, onclick: function () {
          var l = citajVarijante(); l.splice(i, 1); pisi(VARIJANTE_KLJUC, l); prikaziVarijante();
        } })
      ]));
    });
    telo.appendChild(akc);
    tab.appendChild(telo);
    okvir.appendChild(tab);
  }
  function tekstPoredjenja() {
    var t = $('#varijante table');
    if (!t) return '';
    return Array.prototype.slice.call(t.rows).slice(0, -1).map(function (tr) {
      return Array.prototype.slice.call(tr.cells).map(function (c) { return c.textContent.replace(/\u2212/g, '-'); }).join('\t');
    }).join('\n');
  }

  // ------------------------------------------------------------------
  // Crtež i animacija
  // ------------------------------------------------------------------
  var prikaz = 'ceo';
  var animacija = { radi: false, ugao: 0, posl: 0, id: 0 };

  var crtajMastilom = false;
  var bezKretanjaUpit = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function crtaj(prinudno) {
    var okvir = $('#crtez');
    var rez = poslednjiRez;
    var vidljiv = prinudno || $('#ekran-proracun').classList.contains('aktivan');
    if (!rez) {
      okvir.innerHTML = '<div class="prazno">Crtež će se pojaviti kada unos bude ispravan.</div>';
      $('#potpis-crteza').textContent = '';
      return;
    }
    if (!vidljiv && okvir.firstChild) return;
    okvir.innerHTML = C.nacrtaj(rez, { prikaz: prikaz, ugao1: animacija.ugao, odnosStrana: 0.62 });
    if (crtajMastilom && !prinudno && !bezKretanjaUpit.matches && okvir.firstChild) {
      crtajMastilom = false;
      okvir.firstChild.classList.add('mastilo-crta');
    }
    okvir.classList.toggle('zastarelo', !!(trenutniRez && !trenutniRez.ok));
    $('#legenda-prodiranje').hidden = !(rez.par.tA < 0 || rez.par.tE < 0);
    var nazivPrikaza = { ceo: 'čeoni presek', pregled: 'čeoni presek, pregled', zona: 'zona zahvata, uveličano' }[prikaz];
    $('#potpis-crteza').innerHTML = '<span class="sl">Sl. 1.</span> Zahvat para <i>z</i>₁ = ' + rez.ulaz.z1 + ', <i>z</i>₂ = ' + rez.ulaz.z2 + ' (' + nazivPrikaza + ')';
  }

  function korakAnimacije(t) {
    if (!animacija.radi) return;
    var dt = animacija.posl ? Math.min(0.1, (t - animacija.posl) / 1000) : 0;
    animacija.posl = t;
    var rez = poslednjiRez;
    if (rez) {
      // obimna brzina ≈ 0,6 koraka u sekundi
      animacija.ugao += dt * 0.6 * 2 * Math.PI / rez.ulaz.z1;
      var g1 = $('#zup1'), g2 = $('#zup2');
      if (g1 && g2) {
        var u1 = -animacija.ugao * 180 / Math.PI;
        var u2 = animacija.ugao * rez.ulaz.z1 / rez.ulaz.z2 * 180 / Math.PI;
        g1.setAttribute('transform', 'rotate(' + u1.toFixed(4) + ' 0 0)');
        g2.setAttribute('transform', 'rotate(' + u2.toFixed(4) + ' ' + rez.par.a.toFixed(4) + ' 0)');
        // crveni zubi samo dok se stvarno preklapaju (prodiranje)
        if (rez.par.tA < 0 || rez.par.tE < 0) {
          var sloj = $('#prodiranje');
          var html = C.prodiranjeSVG(rez, animacija.ugao);
          if (sloj && sloj._html !== html) { sloj.innerHTML = html; sloj._html = html; }
        }
      }
    }
    animacija.id = requestAnimationFrame(korakAnimacije);
  }
  $('#dugme-animacija').addEventListener('click', function () {
    animacija.radi = !animacija.radi;
    this.textContent = animacija.radi ? 'Zaustavi' : 'Pokreni';
    this.setAttribute('aria-pressed', String(animacija.radi));
    if (animacija.radi) { animacija.posl = 0; animacija.id = requestAnimationFrame(korakAnimacije); }
    else cancelAnimationFrame(animacija.id);
  });
  $$('input[name="prikaz"]').forEach(function (r) {
    r.addEventListener('change', function () { prikaz = this.value; crtaj(); });
  });

  // ------------------------------------------------------------------
  // Savetnik
  // ------------------------------------------------------------------
  var SPOLJA = ['a', 'z1', 'z2', 'mn', 'beta', 'alfaN', 'tol'];

  function procitajSavetnik() {
    var u = {};
    SPOLJA.forEach(function (k) {
      var v = P.parsirajBroj($('#s-' + k).value);
      u[k] = k === 'a' && isFinite(v) ? izDuz(v) : v;
    });
    var b = poslednjiRez ? poslednjiRez.ulaz.b : undefined;
    u.b = b;
    return u;
  }
  function upisiSavetnik(v) {
    SPOLJA.forEach(function (k) {
      if (v[k] === undefined) return;
      $('#s-' + k).value = typeof v[k] === 'number' ? zaPolje(k === 'a' ? duz(v[k]) : v[k]) : v[k];
    });
  }
  function preuzmiIzProracuna() {
    var r = poslednjiRez;
    if (!r) return;
    upisiSavetnik({ a: r.ulaz.a !== undefined ? r.ulaz.a : Math.round(r.par.a * 100) / 100, z1: r.ulaz.z1, z2: r.ulaz.z2, mn: r.ulaz.mn, beta: r.ulaz.beta, alfaN: r.ulaz.alfaN });
    if (!$('#s-tol').value) $('#s-tol').value = zaPolje(2);
    racunajSavetnik();
  }
  $('#dugme-preuzmi').addEventListener('click', preuzmiIzProracuna);

  function racunajSavetnik() {
    var u = procitajSavetnik();
    var sirovo = {};
    SPOLJA.forEach(function (k) { sirovo[k] = $('#s-' + k).value; });
    pisi('zoran.savetnik', { vrednosti: u, sirovo: sirovo, jedinice: pod.jedinice });
    SPOLJA.forEach(function (k) { $('#sp-' + k).textContent = ''; $('#s-' + k).removeAttribute('aria-invalid'); });
    var out = $('#savetnik-rezultat');
    out.innerHTML = '';
    var s = P.savetnik(u);
    if (!s.ok) {
      s.greske.forEach(function (g) {
        var p = $('#sp-' + g.polje);
        if (p) { p.textContent = g.poruka; $('#s-' + g.polje).setAttribute('aria-invalid', 'true'); }
      });
      out.appendChild(el('div', { class: 'upozorenja', html: '<p class="naslov">Unos nije ispravan</p>' + s.greske.map(function (g) { return '<p>' + esc(g.poruka) + '</p>'; }).join('') }));
      return;
    }
    var v = s.vlastita, J = jedDuz();
    out.appendChild(el('h3', { text: 'Tvoje rešenje' }));
    if (!v.ostvarivo) {
      var najmanje = v.a0 * Math.cos(Math.atan(Math.tan(u.alfaN * DEG) / Math.cos(u.beta * DEG))) + 0;
      out.appendChild(el('div', { class: 'upozorenja', html:
        '<p class="naslov">Rastojanje nije ostvarivo</p>' +
        '<p>Za <i>a</i> = ' + esc(fmt(duz(u.a))) + ' ' + J + ' odnos <i>a</i>₀·cos <i>α</i>ₜ / <i>a</i> = ' + esc(fmt(v.odnos, 4)) + ' nije između 0 i 1, pa ugao zahvata ne postoji. ' +
        'Osno rastojanje mora biti veće od ' + esc(fmt(duz(najmanje))) + ' ' + J + ' (nulto rastojanje je <i>a</i>₀ = ' + esc(fmt(duz(v.a0))) + ' ' + J + '). Promeni rastojanje, modul ili broj zuba.</p>' }));
    } else {
      var t = el('div', { class: 'tablica' });
      [
        { naziv: 'Nulto osno rastojanje <i>a</i>₀', v: duz(v.a0), jed: J },
        { naziv: 'Razlika <i>a</i> − <i>a</i>₀', v: duz(v.razlika), jed: J },
        { naziv: 'Zbir koeficijenata Σ<i>x</i>', v: v.sumaX, dec: 4, upozorenje: v.sumaX > 1.2 || v.sumaX < -0.5 },
        { naziv: 'Koeficijent <i>x</i>₁', v: v.x1, dec: 4 },
        { naziv: 'Pomeranje profila 1 (<i>x</i>₁·<i>m</i>ₙ)', v: duz(v.pom1), jed: J },
        { naziv: 'Koeficijent <i>x</i>₂', v: v.x2, dec: 4 },
        { naziv: 'Pomeranje profila 2 (<i>x</i>₂·<i>m</i>ₙ)', v: duz(v.pom2), jed: J },
        { naziv: 'Stepen sprezanja profila <i>ε</i>α', v: v.epsA, dec: 4, upozorenje: v.epsA < 1.1 }
      ].forEach(function (sp) { t.appendChild(redTablice(sp)); });
      out.appendChild(t);
      out.appendChild(el('div', { class: 'ocena' + (v.ocena === 'Loše' ? ' lose' : ''), text: 'Ocena: ' + v.ocena }));
      if (v.pomereno) out.appendChild(el('p', { class: 'sitno', text: 'Raspodela je pomerena da oba koeficijenta budu najmanje x_min.' }));
      if (v.upozorenja.length) out.appendChild(el('div', { class: 'upozorenja', html: '<p class="naslov">Upozorenja</p>' + v.upozorenja.map(function (w) { return '<p>' + esc(w.poruka) + '</p>'; }).join('') }));
      var d = el('div', { class: 'dugmad' });
      d.appendChild(el('button', { type: 'button', class: 'pecat', text: 'Primeni u proračun', onclick: function () { primeniKombinaciju(v, u); } }));
      out.appendChild(d);
    }

    out.appendChild(el('h3', { text: 'Predlozi' }));
    var statusTekst = { postojiBolje: 'Postoji bolje rešenje.', medjuNajboljim: 'Tvoje rešenje je među najboljim.', nema: 'Nije pronađena nijedna kombinacija bez upozorenja u zadatim granicama.' }[s.status];
    out.appendChild(el('p', { class: 'status-predloga', text: statusTekst }));
    if (s.predlozi.length) {
      var lista = el('div', { class: 'predlozi' });
      s.predlozi.forEach(function (k, i) {
        var kartica = el('div', { class: 'predlog' + (i === 0 ? ' najbolje' : '') });
        kartica.appendChild(el('div', { class: 'zaglavlje', html: '<span><i>m</i>ₙ = ' + esc(zaPolje(k.mn)) + ' mm, <i>z</i>₁ = ' + k.z1 + ', <i>z</i>₂ = ' + k.z2 + '</span>' +
          '<span class="oznaka">' + (i === 0 ? 'Najbolje' : (i + 1) + '.') + '</span>' }));
        var t = el('div', { class: 'tablica' });
        [
          { naziv: 'Prenosni odnos', v: k.z2 / k.z1, dec: 4 },
          { naziv: 'Odstupanje odnosa', v: k.odstupanje, dec: 2, jed: '%' },
          { naziv: 'Σ<i>x</i>', v: k.sumaX, dec: 4 },
          { naziv: '<i>x</i>₁ / pomeranje', v: duz(k.pom1), jed: J, html2: k.x1 },
          { naziv: '<i>x</i>₂ / pomeranje', v: duz(k.pom2), jed: J, html2: k.x2 },
          { naziv: '<i>ε</i>α', v: k.epsA, dec: 4 }
        ].forEach(function (sp) {
          if (sp.html2 !== undefined) sp.naziv = sp.naziv.replace(' / pomeranje', ' = ' + esc(fmt(sp.html2, 3)) + ', pomeranje');
          t.appendChild(redTablice(sp));
        });
        kartica.appendChild(t);
        kartica.appendChild(el('div', { class: 'dugmad' }, [el('button', { type: 'button', class: 'dugme', text: 'Primeni', onclick: function () { primeniKombinaciju(k, u); } })]));
        lista.appendChild(kartica);
      });
      out.appendChild(lista);
    }
  }

  function primeniKombinaciju(k, u) {
    var b = poslednjiRez ? poslednjiRez.ulaz.b : P.PODRAZUMEVANO.b;
    postaviRucnoA(true);
    upisiUnos({ z1: k.z1, z2: k.z2, mn: k.mn, beta: u.beta, alfaN: u.alfaN, a: u.a, b: b, raspodela: 'din' }); // predlog Savetnika je po DIN 3992
    preracunaj();
    prikaziEkran('proracun');
    $('#napomena-proracun').innerHTML = 'Primenjeno iz Savetnika: <i>m</i>ₙ = ' + esc(zaPolje(k.mn)) + ' mm, <i>z</i>₁ = ' + k.z1 + ', <i>z</i>₂ = ' + k.z2 + '.';
  }

  // ------------------------------------------------------------------
  // Uvoz .SLDPRT
  // ------------------------------------------------------------------
  function inflateRaw(bajtovi) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('nema DecompressionStream'));
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bajtovi).catch(function () {});
    w.close().catch(function () {});
    return new Response(ds.readable).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }
  var poslednjaSlikaUrl = null;

  $('#uvoz-fajl').addEventListener('change', function () {
    var f = this.files && this.files[0];
    var stanje = $('#uvoz-stanje'), out = $('#uvoz-rezultat');
    out.innerHTML = '';
    if (!f) { stanje.textContent = ''; return; }
    if (f.size > 300 * 1024 * 1024) { stanje.textContent = 'Fajl je prevelik (više od 300 MB).'; return; }
    stanje.textContent = 'Čitam „' + f.name + '“ (' + (f.size / 1024).toFixed(0) + ' KB)…';
    f.arrayBuffer().then(function (ab) {
      return ucitajSldprt().then(function (Sl) {
        return Sl.analiziraj(new Uint8Array(ab), { inflateRaw: typeof DecompressionStream !== 'undefined' ? inflateRaw : null });
      });
    }).then(function (r) {
      stanje.textContent = '„' + f.name + '“ — ' + r.format + '.';
      prikaziUvoz(r, f.name);
    }).catch(function (e) {
      stanje.textContent = 'Fajl nije mogao da se pročita: ' + e.message;
    });
  });

  function prikaziUvoz(r, imeFajla) {
    var out = $('#uvoz-rezultat');
    out.innerHTML = '';
    if (poslednjaSlikaUrl) { URL.revokeObjectURL(poslednjaSlikaUrl); poslednjaSlikaUrl = null; }
    if (r.slika) {
      poslednjaSlikaUrl = URL.createObjectURL(new Blob([r.slika.bajtovi], { type: r.slika.tip }));
      var fig = el('figure');
      fig.appendChild(el('img', { class: 'pregled-slika', src: poslednjaSlikaUrl, alt: 'Slika pregleda iz fajla ' + imeFajla }));
      fig.appendChild(el('figcaption', { html: '<span class="sl">Sl. 2.</span> Pregled iz fajla „' + esc(imeFajla) + '“ (' + esc(r.slika.izvor) + ')' }));
      out.appendChild(fig);
    } else out.appendChild(el('p', { class: 'kurziv', text: 'Slika pregleda nije pronađena.' }));

    out.appendChild(el('h3', { text: 'Pronađeni podaci' }));
    var S = window.Sldprt;
    if (!S.PARAMETRI.some(function (par) { return r.parametri[par.kljuc] && isFinite(r.parametri[par.kljuc].vrednost); })) {
      out.appendChild(el('p', { class: 'kurziv', text: 'Zoran računa nepogrešivo, ali misli još ne čita — unesi podatke ručno.' }));
    }
    var cilj = el('div', { class: 'izbor' }, [
      el('span', { class: 'natpis-izbora', text: 'Broj zuba primeni na:' }),
      el('div', { class: 'prekidac', role: 'radiogroup', 'aria-label': 'Zupčanik' }, [
        el('label', null, [el('input', { type: 'radio', name: 'uvoz-cilj', value: '1', checked: true }), el('span', { html: 'mali (<i>z</i>₁)' })]),
        el('label', null, [el('input', { type: 'radio', name: 'uvoz-cilj', value: '2' }), el('span', { html: 'veliki (<i>z</i>₂)' })])
      ])
    ]);
    out.appendChild(cilj);

    var lista = el('div', { class: 'lista-nalaza' });
    S.PARAMETRI.forEach(function (par) {
      var n = r.parametri[par.kljuc];
      var nadjen = n && isFinite(n.vrednost);
      var id = 'uv-' + par.kljuc;
      var vred = nadjen ? (par.kljuc === 'pom' || par.kljuc === 'b' ? duz(n.vrednost) : n.vrednost) : NaN;
      var red = el('div', { class: 'nalaz' });
      var samoInfo = par.kljuc === 'pom'; // pomeranje se sada računa iz osnog rastojanja
      red.appendChild(el('input', { type: 'checkbox', id: id + '-da', checked: nadjen && !samoInfo, disabled: samoInfo, 'aria-label': 'Primeni ' + par.naziv }));
      var naziv = par.naziv.replace('[mm]', '[' + (par.kljuc === 'pom' || par.kljuc === 'b' ? jedDuz() : 'mm') + ']');
      red.appendChild(el('label', { for: id, text: naziv }));
      var inp = el('input', { type: 'text', id: id, inputmode: 'decimal', value: nadjen ? zaPolje(vred) : '', placeholder: '—' });
      if (samoInfo) inp.readOnly = true;
      else inp.addEventListener('input', function () { $('#' + id + '-da').checked = isFinite(P.parsirajBroj(inp.value)); });
      red.appendChild(inp);
      var izvor;
      if (nadjen) izvor = el('div', { class: 'izvor', text: 'Izvor: ' + n.izvor + ' — ' + (/kot/.test(n.izvor) ? 'kota' : 'svojstvo') + ' „' + n.ime + '“' + (n.napomena ? ' (' + n.napomena + ')' : '') });
      else if (n) izvor = el('div', { class: 'izvor nema', text: 'Svojstvo „' + n.ime + '“ postoji, ali vrednost „' + n.sirovo + '“ nije broj — unesi ručno.' });
      else izvor = el('div', { class: 'izvor nema', text: samoInfo ? 'nije pronađeno' : 'nije pronađeno, unesi ručno' });
      if (samoInfo) izvor.appendChild(document.createTextNode(' — samo za poređenje: Zoran pomeranje računa iz zadatog osnog rastojanja.'));
      red.appendChild(izvor);
      lista.appendChild(red);
    });
    out.appendChild(lista);

    var poruka = el('div', { class: 'napomena', 'aria-live': 'polite' });
    out.appendChild(el('div', { class: 'dugmad' }, [el('button', { type: 'button', class: 'pecat', text: 'Primeni u proračun', onclick: function () {
      var cil = ($('input[name="uvoz-cilj"]:checked') || {}).value || '1';
      var nove = {}, primenjeno = [];
      window.Sldprt.PARAMETRI.forEach(function (par) {
        if (par.kljuc === 'pom' || !$('#uv-' + par.kljuc + '-da').checked) return;
        var v = P.parsirajBroj($('#uv-' + par.kljuc).value);
        if (!isFinite(v)) return;
        if (par.kljuc === 'pom' || par.kljuc === 'b') v = izDuz(v);
        var k = par.kljuc === 'z' ? 'z' + cil : par.kljuc;
        nove[k] = v;
        primenjeno.push(par.naziv.replace(/\s*\[.*\]$/, ''));
      });
      if (!primenjeno.length) { poruka.textContent = 'Nijedan podatak nije označen.'; return; }
      upisiUnos(nove);
      preracunaj();
      prikaziEkran('proracun');
      $('#napomena-proracun').textContent = 'Primenjeno iz fajla „' + imeFajla + '“: ' + primenjeno.join(', ') + '.';
    } })]));
    out.appendChild(poruka);

    if (r.beleske.length) {
      out.appendChild(el('h3', { text: 'Beleške o čitanju' }));
      r.beleske.forEach(function (b) { out.appendChild(el('p', { class: 'sitno', text: b })); });
    }
    if (r.svaSvojstva.length) {
      var det = el('details');
      det.appendChild(el('summary', { text: 'Sva korisnička svojstva u fajlu (' + r.svaSvojstva.length + ')' }));
      var t = el('div', { class: 'tablica' });
      r.svaSvojstva.forEach(function (s) {
        t.appendChild(redTablice({ naziv: esc(s.ime), v: String(s.vrednost) }));
      });
      det.appendChild(t);
      out.appendChild(det);
    }
  }

  // ------------------------------------------------------------------
  // Podešavanja
  // ------------------------------------------------------------------
  function postaviPodesavanja() {
    $$('input[name="jedinice"]').forEach(function (r) { r.checked = r.value === pod.jedinice; });
    $$('input[name="znak"]').forEach(function (r) { r.checked = r.value === pod.znak; });
    $$('input[name="decimale"], input[name="decimale-brzo"]').forEach(function (r) { r.checked = Number(r.value) === pod.decimale; });
    $$('[data-jed-duzina]').forEach(function (s) { s.textContent = '[' + jedDuz() + ']'; });
    $('[data-napomena-inc]').hidden = pod.jedinice !== 'in';
  }
  function promeniPodesavanje(novo) {
    var staroU = procitajUnos(), staroS = procitajSavetnik();
    Object.assign(pod, novo);
    pisi('zoran.podesavanja', pod);
    postaviPodesavanja();
    // prepiši polja u novim jedinicama / decimalnom znaku
    var u = {};
    POLJA.forEach(function (k) { if (isFinite(staroU[k])) u[k] = staroU[k]; });
    u.raspodela = staroU.raspodela;
    upisiUnos(u);
    var s = {};
    SPOLJA.forEach(function (k) { if (isFinite(staroS[k])) s[k] = staroS[k]; });
    upisiSavetnik(s);
    preracunaj(); // označava i Savetnik kao zastareo; računa se kad se otvori
  }
  $$('input[name="jedinice"]').forEach(function (r) { r.addEventListener('change', function () { promeniPodesavanje({ jedinice: this.value }); }); });
  $$('input[name="znak"]').forEach(function (r) { r.addEventListener('change', function () { promeniPodesavanje({ znak: this.value }); }); });
  $$('input[name="decimale"]').forEach(function (r) { r.addEventListener('change', function () { promeniPodesavanje({ decimale: Number(this.value) }); }); });

  // ------------------------------------------------------------------
  // Service worker: verzija, ažuriranje, dijagnostika
  // ------------------------------------------------------------------
  var registracija = null;
  var verzijaKesa = null;
  var listaFajlova = null;
  var korisnikTraziOsvezavanje = false;

  function pitajSW() {
    return new Promise(function (resolve) {
      var c = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (!c) return resolve(null);
      var kanal = new MessageChannel();
      var t = setTimeout(function () { resolve(null); }, 1500);
      kanal.port1.onmessage = function (e) { clearTimeout(t); resolve(e.data); };
      c.postMessage({ tip: 'VERZIJA' }, [kanal.port2]);
    });
  }
  function osveziVerzijuKesa() {
    return pitajSW().then(function (d) {
      if (d) { verzijaKesa = d.verzija; listaFajlova = d.fajlovi; }
      else if (window.caches) {
        return caches.keys().then(function (k) {
          var z = k.filter(function (n) { return n.indexOf('zoran-') === 0; });
          verzijaKesa = z.length ? z[z.length - 1] : null;
        });
      }
    }).then(function () {
      $$('[data-verzija-kesa]').forEach(function (s) { s.textContent = verzijaKesa || 'nije učitan'; });
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (reg) {
        registracija = reg;
        return navigator.serviceWorker.ready;
      }).then(function () {
        setTimeout(osveziVerzijuKesa, 300);
      }).catch(function () { /* npr. file:// */ });
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (korisnikTraziOsvezavanje) { korisnikTraziOsvezavanje = false; location.reload(); }
      else osveziVerzijuKesa();
    });
  }

  function novaVerzijaSpremna() {
    $('#stanje-verzije').textContent = 'Nova verzija je spremna.';
    $('#dugme-osvezi').hidden = false;
  }
  $('#dugme-proveri').addEventListener('click', function () {
    var st = $('#stanje-verzije');
    if (!registracija) { st.textContent = 'Provera nije moguća: service worker nije aktivan (aplikacija mora biti otvorena preko https).'; return; }
    st.textContent = 'Proveravam…';
    var dugme = this;
    dugme.disabled = true;
    registracija.update().then(function () {
      if (registracija.waiting) return novaVerzijaSpremna();
      var inst = registracija.installing;
      if (inst) {
        st.textContent = 'Preuzimam novu verziju…';
        return new Promise(function (resolve) {
          inst.addEventListener('statechange', function () {
            if (inst.state === 'installed') { novaVerzijaSpremna(); resolve(); }
            else if (inst.state === 'redundant') { st.textContent = 'Preuzimanje nove verzije nije uspelo. Pokušaj ponovo.'; resolve(); }
            else if (inst.state === 'activated') { st.textContent = 'Imaš najnoviju verziju.'; resolve(); }
          });
        });
      }
      st.textContent = 'Imaš najnoviju verziju.';
    }).catch(function () {
      st.textContent = navigator.onLine ? 'Provera nije uspela. Pokušaj ponovo.' : 'Nema veze sa internetom — provera nije moguća.';
    }).then(function () { dugme.disabled = false; });
  });
  $('#dugme-osvezi').addEventListener('click', function () {
    if (registracija && registracija.waiting) {
      korisnikTraziOsvezavanje = true;
      registracija.waiting.postMessage({ tip: 'SKIP_WAITING' });
      setTimeout(function () { if (korisnikTraziOsvezavanje) location.reload(); }, 3000);
    } else location.reload();
  });

  function pregledac() {
    var ua = navigator.userAgent, m;
    if ((m = ua.match(/Edg\/([\d.]+)/))) return 'Edge ' + m[1];
    if ((m = ua.match(/OPR\/([\d.]+)/))) return 'Opera ' + m[1];
    if ((m = ua.match(/SamsungBrowser\/([\d.]+)/))) return 'Samsung Internet ' + m[1];
    if ((m = ua.match(/Firefox\/([\d.]+)/)) || (m = ua.match(/FxiOS\/([\d.]+)/))) return 'Firefox ' + m[1];
    if ((m = ua.match(/CriOS\/([\d.]+)/))) return 'Chrome (iOS) ' + m[1];
    if ((m = ua.match(/Chrome\/([\d.]+)/))) return (/HeadlessChrome/.test(ua) ? 'Chrome (headless) ' : 'Chrome ') + m[1];
    if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return 'Safari ' + m[1];
    return ua;
  }
  function sistem() {
    var ua = navigator.userAgent, m;
    if ((m = ua.match(/Android ([\d.]+)/))) return 'Android ' + m[1];
    if ((m = ua.match(/(iPhone|iPad|iPod).*OS ([\d_]+)/))) return 'iOS ' + m[2].replace(/_/g, '.') + ' (' + m[1] + ')';
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'iPadOS';
    if ((m = ua.match(/Mac OS X ([\d_.]+)/))) return 'macOS ' + m[1].replace(/_/g, '.');
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
    if (/Windows/.test(ua)) return 'Windows';
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Linux/.test(ua)) return 'Linux';
    return navigator.platform || 'nepoznat';
  }
  function mb(b) { return (b / 1048576).toFixed(1).replace('.', pod.znak) + ' MB'; }

  var dijagRedovi = [];
  function osveziDijagnostiku() {
    var redovi = [];
    var swStanje;
    if (!('serviceWorker' in navigator)) swStanje = 'nije podržan u ovom pregledaču';
    else if (navigator.serviceWorker.controller) swStanje = 'aktivan, kontroliše stranicu';
    else if (registracija && (registracija.installing || registracija.waiting)) swStanje = 'instalira se';
    else if (registracija) swStanje = 'registrovan, još ne kontroliše stranicu';
    else swStanje = 'nije registrovan';
    if (registracija && registracija.waiting) swStanje += '; nova verzija čeka';
    var samostalno = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    redovi.push(['Verzija aplikacije', APP_VERSION]);
    redovi.push(['Veza', navigator.onLine ? 'na mreži' : 'bez mreže (offline)']);
    redovi.push(['Offline spremnost', 'proveravam…', 'offline']);
    redovi.push(['Service worker', swStanje]);
    redovi.push(['Verzija keša', verzijaKesa || 'nije učitan']);
    redovi.push(['Način rada', samostalno ? 'instalirana aplikacija' : 'u pregledaču']);
    redovi.push(['Pregledač', pregledac()]);
    redovi.push(['Sistem', sistem()]);
    redovi.push(['Veličina ekrana', window.innerWidth + '×' + window.innerHeight + ' (ekran ' + screen.width + '×' + screen.height + ', gustina ' + (window.devicePixelRatio || 1) + ')']);
    redovi.push(['Jezik uređaja', (navigator.languages && navigator.languages.length ? navigator.languages.join(', ') : navigator.language) || 'nepoznat']);
    redovi.push(['Zauzeće skladišta', 'proveravam…', 'skladiste']);
    dijagRedovi = redovi;
    nacrtajDijagnostiku();

    var obecanja = [];
    if (navigator.storage && navigator.storage.estimate) {
      obecanja.push(navigator.storage.estimate().then(function (e) {
        postaviDijag('skladiste', mb(e.usage || 0) + ' od ' + mb(e.quota || 0));
      }).catch(function () { postaviDijag('skladiste', 'nije dostupno'); }));
    } else postaviDijag('skladiste', 'nije podržano');

    obecanja.push(osveziVerzijuKesa().then(function () {
      dijagRedovi.forEach(function (r) { if (r[0] === 'Verzija keša') r[1] = verzijaKesa || 'nije učitan'; });
      if (!window.caches || !verzijaKesa) { postaviDijag('offline', 'nije spremno — otvori aplikaciju jednom sa internetom preko https'); return; }
      return caches.open(verzijaKesa).then(function (c) {
        var lista = listaFajlova || [];
        if (!lista.length) return c.keys().then(function (k) { postaviDijag('offline', k.length ? 'keš ima ' + k.length + ' fajlova' : 'nije spremno'); });
        return Promise.all(lista.map(function (u) { return c.match(new Request(u, { mode: 'no-cors' })).then(function (r) { return !!r; }); })).then(function (ok) {
          var n = ok.filter(Boolean).length;
          postaviDijag('offline', n === lista.length ? 'spremno (' + n + '/' + lista.length + ' fajlova u kešu)' : 'delimično (' + n + '/' + lista.length + ' fajlova)');
        });
      });
    }).catch(function () { postaviDijag('offline', 'nepoznato'); }));
    return Promise.all(obecanja);
  }
  function postaviDijag(kljuc, v) {
    dijagRedovi.forEach(function (r) { if (r[2] === kljuc) r[1] = v; });
    nacrtajDijagnostiku();
  }
  function nacrtajDijagnostiku() {
    var t = $('#dijagnostika');
    t.innerHTML = '';
    dijagRedovi.forEach(function (r) { t.appendChild(redTablice({ naziv: r[0], v: r[1] })); });
  }
  window.addEventListener('online', function () { if (trenutni === 'podesavanja') osveziDijagnostiku(); });
  window.addEventListener('offline', function () { if (trenutni === 'podesavanja') osveziDijagnostiku(); });

  $('#dugme-kopiraj-dijag').addEventListener('click', function () {
    var b = this;
    var tekst = 'Zoran ' + APP_VERSION + ' — dijagnostika (Zet Obično Računa Apsolutno Nepogrešivo)\n' + dijagRedovi.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\nUA: ' + navigator.userAgent;
    kopirajTekst(tekst).then(function () {
      var stari = b.textContent;
      b.textContent = '✓ kopirano';
      b.classList.add('kopiraj-sve', 'kopirano');
      setTimeout(function () { b.textContent = stari; b.classList.remove('kopirano'); }, 1500);
    });
  });
  $('#dugme-obrisi').addEventListener('click', function () { $('#potvrda-brisanja').hidden = false; $('#dugme-obrisi-ne').focus(); });
  $('#dugme-obrisi-ne').addEventListener('click', function () { $('#potvrda-brisanja').hidden = true; });
  $('#dugme-obrisi-da').addEventListener('click', function () {
    var p = [];
    if (window.caches) p.push(caches.keys().then(function (k) { return Promise.all(k.map(function (n) { return caches.delete(n); })); }));
    if (navigator.serviceWorker) p.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    Promise.all(p).catch(function () {}).then(function () { location.reload(); });
  });

  $('#dugme-kopiraj-sve').addEventListener('click', function () {
    var b = this;
    kopirajTekst(tekstSvega()).then(function () {
      b.textContent = '✓ kopirano';
      b.classList.add('kopirano');
      $('#obavestenje').textContent = 'Sve vrednosti su kopirane.';
      setTimeout(function () { b.textContent = 'Kopiraj sve'; b.classList.remove('kopirano'); }, 1500);
    });
  });

  // ------------------------------------------------------------------
  // Podeli Zorana
  // ------------------------------------------------------------------
  var prozor = $('#prozor-podeli');
  var porukaDeljenja = $('#poruka-deljenja');
  var tajmerDeljenja = 0;
  var PORUKA_KOPIRANO = 'Link je kopiran. Pošalji ga kome god želiš.';
  var mozeDeljenje = typeof navigator.share === 'function';

  function prikaziPorukuDeljenja(tekst, trajanje) {
    clearTimeout(tajmerDeljenja);
    porukaDeljenja.textContent = tekst;
    if (trajanje) tajmerDeljenja = setTimeout(function () { porukaDeljenja.textContent = ''; }, trajanje);
  }
  function oznaciLink() {
    var link = $('#link-deljenja');
    try {
      var opseg = document.createRange();
      opseg.selectNodeContents(link);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(opseg);
    } catch (e) { /* bez označavanja */ }
  }
  function kopirajLink(trajanje) {
    return kopirajTekst(LINK_APLIKACIJE).then(function (ok) {
      if (ok) prikaziPorukuDeljenja(PORUKA_KOPIRANO, trajanje);
      else { oznaciLink(); prikaziPorukuDeljenja('Označi link i kopiraj ga.', 0); }
      return ok;
    });
  }
  function otvoriPodeli() {
    $('#link-deljenja').textContent = LINK_APLIKACIJE;
    if (!$('#qr-okvir').firstChild) {
      ucitajQR().then(function (Pd) {
        if (!$('#qr-okvir').firstChild) $('#qr-okvir').innerHTML = Pd.svg(LINK_APLIKACIJE, 'QR kod za ' + LINK_APLIKACIJE);
      }).catch(function () { $('#qr-okvir').innerHTML = '<p class="sitno">QR kod trenutno nije dostupan.</p>'; });
    }
    $('#dugme-posalji').hidden = !mozeDeljenje;
    prikaziPorukuDeljenja('', 0);
    if (typeof prozor.showModal === 'function') prozor.showModal();
    else prozor.setAttribute('open', '');
    document.documentElement.classList.add('prozor-otvoren');
    // Na računaru (bez sistemskog deljenja) link se odmah kopira.
    if (!mozeDeljenje) kopirajLink(0);
    (mozeDeljenje ? $('#dugme-posalji') : $('#dugme-kopiraj-link')).focus();
  }
  function zatvoriPodeli() {
    if (typeof prozor.close === 'function' && prozor.open) prozor.close();
    else { prozor.removeAttribute('open'); onZatvoren(); }
  }
  function onZatvoren() {
    document.documentElement.classList.remove('prozor-otvoren');
    clearTimeout(tajmerDeljenja);
    $('#dugme-podeli').focus();
  }
  $('#dugme-podeli').addEventListener('click', otvoriPodeli);
  $('#dugme-zatvori-podeli').addEventListener('click', zatvoriPodeli);
  prozor.addEventListener('close', onZatvoren);
  // dodir van prozora (na pozadinu) zatvara prozor
  prozor.addEventListener('click', function (e) {
    // prozor nema unutrašnju marginu, pa je klik čiji je cilj sam <dialog> klik na pozadinu
    if (e.target === prozor && e.detail !== 0) zatvoriPodeli();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && prozor.hasAttribute('open') && typeof prozor.showModal !== 'function') zatvoriPodeli();
  });
  $('#dugme-kopiraj-link').addEventListener('click', function () { kopirajLink(2000); });
  $('#dugme-posalji').addEventListener('click', function () {
    navigator.share({ title: 'Zoran', text: 'Zoran — Zet Obično Računa Apsolutno Nepogrešivo. Kalkulator zupčanika:', url: LINK_APLIKACIJE })
      .catch(function (e) {
        if (e && e.name === 'AbortError') return; // korisnik je odustao — bez poruke
        kopirajLink(2000);
      });
  });

  // ------------------------------------------------------------------
  // Ponašanje kao prava aplikacija: bez zumiranja, tastatura ne prekriva polje
  // ------------------------------------------------------------------
  // Safari (iOS) ignoriše user-scalable=no, pa se „pinch“ zaustavlja ovde.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
  });
  // dva ili više prstiju: gest se zaustavlja već kad drugi prst dotakne ekran (posle toga pregledač ga više ne pušta da se otkaže)
  document.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1 && e.cancelable) e.preventDefault();
  }, { passive: false });
  // dugi dodir na telefonu: bez menija (Copy / Web search / Share), osim u poljima za kucanje
  document.addEventListener('contextmenu', function (e) {
    var dodir = (e.pointerType === 'touch') || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !e.pointerType);
    if (dodir && !jePoljeZaKucanje(e.target)) e.preventDefault();
  });
  document.addEventListener('selectstart', function (e) {
    if (!jePoljeZaKucanje(e.target) && !(e.target.closest && e.target.closest('.link-deljenja'))) e.preventDefault();
  });
  // ako je pregledač ipak zumirao (npr. „uvek dozvoli zumiranje“ u podešavanjima pristupačnosti), vrati na 100 %
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      if (window.visualViewport.scale > 1.01) {
        var meta = document.querySelector('meta[name="viewport"]');
        if (meta) { var c = meta.getAttribute('content'); meta.setAttribute('content', c + ', minimum-scale=1'); setTimeout(function () { meta.setAttribute('content', c); }, 50); }
      }
    });
  }
  var poslednjiDodir = 0;
  document.addEventListener('touchend', function (e) {
    var sada = Date.now();
    var t = e.target;
    var polje = t && t.closest && t.closest('input, textarea, select, label');
    if (!polje && sada - poslednjiDodir < 350) e.preventDefault(); // dvostruki dodir
    poslednjiDodir = sada;
  }, { passive: false });
  function jePoljeZaKucanje(t) {
    return t && t.matches && t.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea');
  }
  document.addEventListener('focusin', function (e) {
    if (!jePoljeZaKucanje(e.target)) return;
    document.documentElement.classList.add('kucanje');
    var polje = e.target;
    // posle otvaranja tastature pomeri polje na sredinu vidljivog dela
    setTimeout(function () { if (document.activeElement === polje) polje.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
  });
  document.addEventListener('focusout', function (e) {
    if (!jePoljeZaKucanje(e.target)) return;
    setTimeout(function () { if (!jePoljeZaKucanje(document.activeElement)) document.documentElement.classList.remove('kucanje'); }, 50);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      var a = document.activeElement;
      if (jePoljeZaKucanje(a)) a.scrollIntoView({ block: 'center' });
    });
  }

  // ------------------------------------------------------------------
  // Naslovni ekran
  // ------------------------------------------------------------------
  $$('[data-verzija]').forEach(function (s) { s.textContent = 'verzija ' + APP_VERSION; });
  var naslovna = $('#naslovna');
  function skloniNaslovnu() {
    if (naslovna.classList.contains('skriveno')) return;
    naslovna.classList.add('skriveno');
    if (vidljivEkran('proracun')) { crtajMastilom = true; crtaj(); }
    setTimeout(function () { naslovna.style.display = 'none'; }, 400);
  }
  naslovna.addEventListener('pointerdown', skloniNaslovnu);
  naslovna.addEventListener('click', skloniNaslovnu);
  document.addEventListener('keydown', skloniNaslovnu, { once: true });
  // Animacija otkrivanja traje ≈ 2,6 s; dodir je preskače. Bez animacije (smanjeno kretanje) korica stoji 1,5 s.
  var bezKretanja = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(skloniNaslovnu, bezKretanja ? 1500 : 2100);
  // U Podešavanjima: dodir na naslov ponovo pušta animaciju
  var oApl = $('#o-aplikaciji');
  oApl.addEventListener('click', function () {
    oApl.classList.remove('animiraj');
    void oApl.offsetWidth; // ponovo pokreni CSS animaciju
    oApl.classList.add('animiraj');
  });

  // ------------------------------------------------------------------
  // Tablica: varijante, sile, štampa, link do proračuna
  // ------------------------------------------------------------------
  $('#dugme-sacuvaj-varijantu').addEventListener('click', function () {
    var r = poslednjiRez;
    if (!r) return;
    var l = citajVarijante();
    if (l.length >= 6) l.shift(); // najstarija izlazi
    var br = 1, imena = l.map(function (v) { return v.ime; });
    while (imena.indexOf('Varijanta ' + br) >= 0) br++;
    var u = r.ulaz;
    var rsv = r.raspodela || {};
    var ulazV = { z1: u.z1, z2: u.z2, mn: u.mn, beta: u.beta, alfaN: u.alfaN, b: u.b, a: u.a };
    if (rsv.nacin === 'x1' || rsv.nacin === 'x2') { ulazV.raspodela = rsv.nacin; ulazV.xz = rsv.nacin === 'x1' ? rsv.x1 : rsv.x2; }
    l.push({ ime: 'Varijanta ' + br, ulaz: ulazV });
    pisi(VARIJANTE_KLJUC, l);
    prikaziVarijante();
    $('#obavestenje').textContent = 'Sačuvana je Varijanta ' + br + '.';
  });
  $('#dugme-kopiraj-poredjenje').addEventListener('click', function () {
    var b = this;
    kopirajTekst(tekstPoredjenja()).then(function () {
      b.textContent = '✓ kopirano'; b.classList.add('kopiraj-sve', 'kopirano');
      setTimeout(function () { b.textContent = 'Kopiraj poređenje'; b.classList.remove('kopirano'); }, 1500);
    });
  });

  $('#u-T1').value = citaj('zoran.sile', '') || '';
  $('#u-T1').addEventListener('input', function () { pisi('zoran.sile', this.value); prikaziSile(); });

  function popuniZaglavljeStampe() {
    var r = poslednjiRez;
    if (!r) return;
    var u = r.ulaz, J = jedDuz();
    var datum = new Date();
    var dd = String(datum.getDate()).padStart(2, '0') + '.' + String(datum.getMonth() + 1).padStart(2, '0') + '.' + datum.getFullYear() + '.';
    $('#stampa-zaglavlje').innerHTML = '<div class="glava"><span>Mašinski elementi</span><span>ZORAN ' + esc(APP_VERSION) + ' · ' + dd + '</span></div>' +
      '<h1>Proračun zupčastog para <i>z</i>₁ = ' + u.z1 + ', <i>z</i>₂ = ' + u.z2 + '</h1>' +
      '<p><i>m</i>ₙ = ' + esc(fmt(u.mn, 3)) + ' mm · <i>β</i> = ' + esc(fmt(u.beta, 2)) + '° · <i>α</i>ₙ = ' + esc(fmt(u.alfaN, 2)) + '° · <i>b</i> = ' + esc(fmt(duz(u.b))) + ' ' + J +
      ' · zadato <i>a</i> = ' + esc(fmt(duz(u.a))) + ' ' + J + '</p>';
  }
  window.addEventListener('beforeprint', function () { popuniZaglavljeStampe(); prikaziSve(); });
  $('#dugme-stampaj').addEventListener('click', function () { popuniZaglavljeStampe(); prikaziSve(); window.print(); });

  function linkProracuna() {
    var r = poslednjiRez;
    if (!r) return LINK_APLIKACIJE;
    var u = r.ulaz, q = [];
    ['z1', 'z2', 'mn', 'beta', 'alfaN', 'b', 'a'].forEach(function (k) { q.push(k + '=' + encodeURIComponent(String(Math.round(u[k] * 1e6) / 1e6))); });
    var rs = r.raspodela;
    if (rs && rs.nacin && rs.nacin !== 'din') q.push('rasp=' + rs.nacin, 'xz=' + encodeURIComponent(String(Math.round((rs.nacin === 'x1' ? rs.x1 : rs.x2) * 1e6) / 1e6)));
    return LINK_APLIKACIJE + '?' + q.join('&');
  }
  $('#dugme-link-proracuna').addEventListener('click', function () {
    var link = linkProracuna(), poruka = $('#poruka-link');
    function kopiraj() {
      kopirajTekst(link).then(function (ok) {
        poruka.textContent = ok ? 'Link do ovog proračuna je kopiran — kolega ga otvara sa istim podacima.' : 'Kopiranje nije uspelo. Link: ' + link;
        if (ok) setTimeout(function () { poruka.textContent = ''; }, 3000);
      });
    }
    if (typeof navigator.share === 'function') {
      navigator.share({ title: 'ZORAN — proračun zupčanika', text: 'Proračun zupčastog para u ZORAN-u:', url: link }).catch(function (e) { if (!e || e.name !== 'AbortError') kopiraj(); });
    } else kopiraj();
  });

  /** Ulazni podaci iz linka (?z1=…&a=…); vraća objekat ili null. */
  function unosIzLinka() {
    if (!location.search) return null;
    var par = {}, ima = false;
    location.search.slice(1).split('&').forEach(function (d) {
      var kv = d.split('=');
      var k = decodeURIComponent(kv[0] || ''), v = P.parsirajBroj(decodeURIComponent(kv[1] || ''));
      if (POLJA.indexOf(k) >= 0 && isFinite(v)) { par[k] = v; ima = true; }
      if (k === 'rasp' && /^(din|x1|x2)$/.test(kv[1] || '')) par.raspodela = kv[1];
    });
    if (ima && !par.raspodela) par.raspodela = 'din';
    return ima ? par : null;
  }

  // ------------------------------------------------------------------
  // Korak 0: od vratila do modula i broja zuba
  // ------------------------------------------------------------------
  var VPOLJA = ['dv1', 'u', 'dv2', 'a'];
  var VDUZINSKA = { dv1: true, dv2: true, a: true };
  var detaljiVratila = $('#od-vratila');
  function procitajVratilo() {
    var u = {};
    VPOLJA.forEach(function (k) {
      var txt = $('#v-' + k).value.trim();
      var v = txt === '' ? undefined : P.parsirajBroj(txt);
      u[k] = (v !== undefined && VDUZINSKA[k] && isFinite(v)) ? izDuz(v) : v;
    });
    return u;
  }
  function racunajVratilo() {
    var out = $('#vratilo-rezultat');
    var sirovo = {};
    VPOLJA.forEach(function (k) { sirovo[k] = $('#v-' + k).value; $('#vp-' + k).textContent = ''; $('#v-' + k).removeAttribute('aria-invalid'); });
    pisi('zoran.vratilo', sirovo);
    out.innerHTML = '';
    var u = procitajVratilo();
    if (u.dv1 === undefined || u.u === undefined) {
      out.appendChild(el('p', { class: 'kurziv', text: 'Upiši prečnik vratila malog zupčanika i prenosni odnos.' }));
      return;
    }
    var gl = procitajUnos();
    u.beta = isFinite(gl.beta) ? gl.beta : P.PODRAZUMEVANO.beta;
    u.alfaN = isFinite(gl.alfaN) ? gl.alfaN : P.PODRAZUMEVANO.alfaN;
    u.b = isFinite(gl.b) ? gl.b : undefined;
    var r = P.predlogOdVratila(u);
    if (!r.ok) {
      r.greske.forEach(function (g) {
        var p = $('#vp-' + g.polje);
        if (p) { p.textContent = g.poruka; $('#v-' + g.polje).setAttribute('aria-invalid', 'true'); }
        else out.appendChild(el('p', { class: 'upozorenja', text: g.poruka }));
      });
      return;
    }
    if (!r.opcije.length) {
      out.appendChild(el('div', { class: 'upozorenja', html: '<p class="naslov">Nema predloga</p><p>Nijedan standardni modul ne daje zupčanik koji staje na ovo vratilo uz zadate uslove. ' +
        (r.imaA ? 'Probaj bez zadatog osnog rastojanja ili sa većim.' : 'Proveri prečnik vratila i prenosni odnos.') +
        ' Ako mali zupčanik mora biti manji, ozubljenje može da se izradi direktno na vratilu (zupčasto vratilo).</p>' }));
      return;
    }
    var J = jedDuz();
    var lista = el('div', { class: 'predlozi' });
    r.opcije.forEach(function (o, i) {
      var kart = el('div', { class: 'predlog' + (i === r.preporuka ? ' najbolje' : '') });
      kart.appendChild(el('div', { class: 'zaglavlje', html: '<span><i>m</i>ₙ = ' + esc(zaPolje(o.mn)) + ' mm' + (o.red2 ? ' <span class="sitno">(red 2)</span>' : '') +
        ', <i>z</i>₁ = ' + o.z1 + ', <i>z</i>₂ = ' + o.z2 + '</span><span class="oznaka">' + (i === r.preporuka ? 'Preporuka' : '') + '</span>' }));
      var t = el('div', { class: 'tablica' });
      [
        { naziv: 'Odnos <i>u</i> (' + esc(fmt(o.odstupanje, 2)) + ' %)', v: o.odnos, dec: 4 },
        { naziv: 'Prečnik <i>d</i>₁', v: duz(o.d1), jed: J },
        { naziv: 'Temeni <i>d</i>ₐ₁', v: duz(o.da1), jed: J },
        { naziv: 'Venac (' + esc(fmt(o.venac1 / o.mn, 1)) + '·<i>m</i>ₙ)', v: duz(o.venac1), jed: J },
        r.imaDv2 ? { naziv: 'Venac <i>z</i>₂ (' + esc(fmt(o.venac2 / o.mn, 1)) + '·<i>m</i>ₙ)', v: duz(o.venac2), jed: J } : null,
        { naziv: 'Rastojanje <i>a</i>', v: duz(o.a), jed: J },
        { naziv: 'Zbir pomeranja Σ<i>x</i>', v: o.sumaX, dec: 3 },
        { naziv: 'Stepen sprezanja <i>ε</i>α', v: o.epsA, dec: 3 }
      ].filter(Boolean).forEach(function (sp) { t.appendChild(redTablice(sp)); });
      kart.appendChild(t);
      kart.appendChild(el('div', { class: 'dugmad' }, [el('button', { type: 'button', class: 'dugme', text: 'Primeni', 'aria-label': 'Primeni modul ' + zaPolje(o.mn) + ', z₁ = ' + o.z1 + ', z₂ = ' + o.z2, onclick: function () {
        postaviRucnoA(r.imaA); // bez zadatog rastojanja opcija ima idealno a, pa ostaje automatsko
        upisiUnos({ z1: o.z1, z2: o.z2, mn: o.mn, a: o.a });
        preracunaj();
        detaljiVratila.open = false;
        $('#napomena-proracun').innerHTML = 'Primenjeno iz koraka 0: <i>m</i>ₙ = ' + esc(zaPolje(o.mn)) + ' mm, <i>z</i>₁ = ' + o.z1 + ', <i>z</i>₂ = ' + o.z2 + ', <i>a</i> = ' + esc(fmt(duz(o.a))) + ' ' + J + '.';
        $('#forma-proracun').scrollIntoView({ block: 'start', behavior: 'smooth' });
      } })]));
      lista.appendChild(kart);
    });
    out.appendChild(lista);
    out.appendChild(el('p', { class: 'sitno', text: 'Preporuka je opcija sa oko 20 zuba na malom zupčaniku — dobar odnos mirnoće rada i čvrstoće. Manji modul daje kompaktniji par, veći modul jače zube.' }));
  }
  (function () {
    var sac = citaj('zoran.vratilo', null);
    if (sac) VPOLJA.forEach(function (k) { if (typeof sac[k] === 'string') $('#v-' + k).value = sac[k]; });
    var zakazano = 0;
    VPOLJA.forEach(function (k) { $('#v-' + k).addEventListener('input', function () {
      if (!zakazano) zakazano = requestAnimationFrame(function () { zakazano = 0; racunajVratilo(); });
    }); });
    detaljiVratila.addEventListener('toggle', function () {
      if (!detaljiVratila.open) return;
      if (!$('#v-u').value && poslednjiRez) $('#v-u').value = zaPolje(Math.round(poslednjiRez.par.u * 1000) / 1000);
      racunajVratilo();
    });
  })();

  // ------------------------------------------------------------------
  // Pošalji utisak (povratne informacije) i dijagnostika — u Google tabelu autora
  // ------------------------------------------------------------------
  var F = window.Povratne;
  var ADRESA_POVRATNIH = window.ZORAN_ADRESA_POVRATNIH || F.ADRESA;
  var prozorUtisak = $('#prozor-utisak');
  var otvaracUtiska = null;
  var tajmerTosta = 0;

  function tost(tekst) {
    var t = $('#tost');
    t.textContent = tekst;
    t.hidden = false;
    clearTimeout(tajmerTosta);
    tajmerTosta = setTimeout(function () { t.hidden = true; }, 4000);
  }
  function uredjaj() {
    return sistem() + ', ' + pregledac() + ' · prozor ' + window.innerWidth + '×' + window.innerHeight + ', ekran ' + screen.width + '×' + screen.height + ' · UA: ' + navigator.userAgent;
  }
  /** Mejl prijavljenog naloga (kad bude veze sa nalogom); do tada poslednji upisani. */
  function predloziMejl() { return citaj(F.KLJUC.mejl, '') || ''; }

  function tehnickiIzvestaj() {
    var d = {
      verzija: APP_VERSION,
      kes: verzijaKesa,
      jezik: F.JEZIK,
      jeziciUredjaja: (navigator.languages && navigator.languages.length ? navigator.languages.join(', ') : navigator.language) || '',
      uredjaj: sistem() + ', ' + pregledac(),
      ekran: window.innerWidth + '×' + window.innerHeight + ' (ekran ' + screen.width + '×' + screen.height + ', gustina ' + (window.devicePixelRatio || 1) + ')',
      naMrezi: navigator.onLine,
      dozvole: {},
      podesavanja: {
        jedinice: pod.jedinice, znak: pod.znak === ',' ? 'zarez' : 'tačka', decimale: pod.decimale,
        osnoRastojanje: aRucno ? 'ručno' : 'idealno',
        nacin: ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone) ? 'instalirana' : 'pregledač',
        serviceWorker: !('serviceWorker' in navigator) ? 'nije podržan' : (navigator.serviceWorker.controller ? 'aktivan' : 'nije aktivan'),
        varijanti: (citaj(VARIJANTE_KLJUC, []) || []).length,
        porukaURedu: F.procitajRed(localStorage).length
      },
      greske: F.poslednjeGreske()
    };
    var obecanja = [];
    if (navigator.storage && navigator.storage.estimate) {
      obecanja.push(navigator.storage.estimate().then(function (e) { d.skladiste = mb(e.usage || 0) + ' od ' + mb(e.quota || 0); }, function () {}));
    }
    if (navigator.permissions && navigator.permissions.query) {
      ['persistent-storage', 'clipboard-write', 'notifications'].forEach(function (ime) {
        var q;
        try { q = navigator.permissions.query({ name: ime }); } catch (e) { d.dozvole[ime] = 'nepodržano'; return; }
        obecanja.push(Promise.resolve(q).then(function (s) { d.dozvole[ime] = s.state; }, function () { d.dozvole[ime] = 'nepodržano'; }));
      });
    }
    return Promise.all(obecanja).then(function () { return F.izvestaj(d); });
  }

  /** Šalje poruku: prvo u red, pa pokušaj slanja. Bez podešene adrese nudi deljenje/kopiranje teksta. */
  function posaljiPoruku(poruka) {
    if (!ADRESA_POVRATNIH) {
      var tekst = F.tekstZaDeljenje(poruka);
      var kopiraj = function () { return kopirajTekst(tekst).then(function (ok) { tost(ok ? F.t('kopirano') : F.t('nijeKopirano')); }); };
      if (typeof navigator.share === 'function') {
        return navigator.share({ title: 'ZORAN', text: tekst }).catch(function (e) { if (!e || e.name !== 'AbortError') return kopiraj(); });
      }
      return kopiraj();
    }
    var id = F.dodajURed(localStorage, poruka);
    if (!navigator.onLine) { tost(F.t('sacuvano')); return Promise.resolve(); }
    return F.isprazniRed({ sklad: localStorage, fetch: window.fetch.bind(window), adresa: ADRESA_POVRATNIH }).then(function (r) {
      tost(r.poslato.indexOf(id) >= 0 ? F.t('poslato') : F.t('sacuvano'));
    });
  }
  function isprazniRedPovratnih() {
    if (!ADRESA_POVRATNIH || !navigator.onLine) return;
    F.isprazniRed({ sklad: localStorage, fetch: window.fetch.bind(window), adresa: ADRESA_POVRATNIH });
  }
  window.addEventListener('online', isprazniRedPovratnih);

  function greskaPolja(polje, tekst) {
    var g = $('#' + polje.id + '-greska');
    g.textContent = tekst || '';
    if (tekst) polje.setAttribute('aria-invalid', 'true'); else polje.removeAttribute('aria-invalid');
  }
  function otvoriUtisak(tip, otvarac) {
    if (prozor.open) zatvoriPodeli();
    otvaracUtiska = otvarac || document.activeElement;
    var t = F.TEKST[F.JEZIK].vrste;
    $$('[data-vrsta]', prozorUtisak).forEach(function (s) { s.textContent = t[s.getAttribute('data-vrsta')]; });
    $$('input[name="vrsta-utiska"]', prozorUtisak).forEach(function (r) { r.checked = r.value === (tip || 'bug'); });
    $('#utisak-mejl').value = predloziMejl();
    $('#utisak-dijag').checked = true;
    greskaPolja($('#utisak-tekst'), '');
    greskaPolja($('#utisak-mejl'), '');
    if (typeof prozorUtisak.showModal === 'function') prozorUtisak.showModal();
    else prozorUtisak.setAttribute('open', '');
    document.documentElement.classList.add('prozor-otvoren');
    $('#utisak-tekst').focus();
  }
  function zatvoriUtisak() {
    if (typeof prozorUtisak.close === 'function' && prozorUtisak.open) prozorUtisak.close();
    else { prozorUtisak.removeAttribute('open'); onZatvorenUtisak(); }
  }
  function onZatvorenUtisak() {
    document.documentElement.classList.remove('prozor-otvoren');
    if (otvaracUtiska && document.contains(otvaracUtiska) && otvaracUtiska.focus) otvaracUtiska.focus();
  }
  prozorUtisak.addEventListener('close', onZatvorenUtisak);
  prozorUtisak.addEventListener('click', function (e) { if (e.target === prozorUtisak && e.detail !== 0) zatvoriUtisak(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && prozorUtisak.hasAttribute('open') && typeof prozorUtisak.showModal !== 'function') zatvoriUtisak();
  });
  $('#utisak-odustani').addEventListener('click', zatvoriUtisak);
  $('#dugme-utisak').addEventListener('click', function () { otvoriUtisak('bug', this); });
  $('#utisak-tekst').addEventListener('input', function () { if (this.value.trim()) greskaPolja(this, ''); });
  $('#utisak-mejl').addEventListener('input', function () { greskaPolja(this, ''); });

  $('#forma-utisak').addEventListener('submit', function (e) {
    e.preventDefault();
    var tekstPolje = $('#utisak-tekst'), mejlPolje = $('#utisak-mejl');
    var izabrano = $('input[name="vrsta-utiska"]:checked', prozorUtisak);
    var unos = { tip: izabrano ? izabrano.value : 'bug', tekst: tekstPolje.value, mejl: mejlPolje.value };
    var pr = F.proveriUnos(unos);
    greskaPolja(tekstPolje, pr.greske.tekst);
    greskaPolja(mejlPolje, pr.greske.mejl);
    if (!pr.ok) { (pr.greske.tekst ? tekstPolje : mejlPolje).focus(); return; }
    pisi(F.KLJUC.mejl, unos.mejl.trim());
    var dugme = $('#utisak-posalji');
    dugme.disabled = true;
    var ekran = trenutni;
    (($('#utisak-dijag').checked) ? tehnickiIzvestaj() : Promise.resolve(null)).then(function (teh) {
      var poruka = F.napraviPoruku({ tip: unos.tip, tekst: unos.tekst, mejl: unos.mejl, uid: F.korisnikId(localStorage), verzija: APP_VERSION, ekran: ekran, uredjaj: uredjaj(), tehnicki: teh });
      zatvoriUtisak();
      tekstPolje.value = '';
      return posaljiPoruku(poruka);
    }).catch(function () { tost(F.t('sacuvano')); }).then(function () { dugme.disabled = false; });
  });

  $('#dugme-posalji-dijag').addEventListener('click', function () {
    var dugme = this;
    dugme.disabled = true;
    tehnickiIzvestaj().then(function (izv) {
      var poruka = F.napraviDijagnostiku({ napomena: $('#dijag-napomena').value, mejl: predloziMejl(), uid: F.korisnikId(localStorage), verzija: APP_VERSION, ekran: trenutni, uredjaj: uredjaj(), izvestaj: izv });
      $('#dijag-napomena').value = '';
      return posaljiPoruku(poruka);
    }).catch(function () { tost(F.t('sacuvano')); }).then(function () { dugme.disabled = false; });
  });

  // Retko pitanje „Kako ti se sviđa ZORAN?“ posle završene radnje u Tablici (najviše dvaput, ikad)
  var pitanjePrikazanoSada = false;
  function pitajZaUtisak(dugme) {
    var pre = citaj(F.KLJUC.anketa, null), sada = Date.now();
    var r = F.posleAktivnosti(pre, sada);
    // ne uz molbu za deljenje i ne dvaput u istom otvaranju — tada se prikaz odlaže
    if (r.prikazi && (pitanjePrikazanoSada || !$('#molba-podeli').hidden)) {
      r.stanje.prikazano.pop();
      r.stanje.danaPosle = F.zabeleziDan(pre, sada).danaPosle;
      r.prikazi = false;
    }
    pisi(F.KLJUC.anketa, r.stanje);
    if (!r.prikazi) return;
    pitanjePrikazanoSada = true;
    var stari = $('#pitanje-utisak');
    if (stari) stari.remove();
    var red = el('div', { class: 'pitanje-utisak', id: 'pitanje-utisak', role: 'group', 'aria-label': F.t('anketaPitanje') });
    red.appendChild(el('span', { class: 'pitanje-tekst', text: F.t('anketaPitanje') }));
    var PALAC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10.5v9H4v-9zM7 19.5h9.2a2 2 0 0 0 2-1.6l1.2-6a2 2 0 0 0-2-2.4H13l.7-3.6A1.6 1.6 0 0 0 12.1 4L7 10.5"/></svg>';
    function brza(tip, tekst) {
      return function () {
        red.innerHTML = '';
        red.appendChild(el('span', { class: 'pitanje-tekst', text: F.t('anketaHvala') }));
        setTimeout(function () { red.remove(); }, 2500);
        posaljiPoruku(F.napraviPoruku({ tip: tip, tekst: tekst, mejl: predloziMejl(), uid: F.korisnikId(localStorage), verzija: APP_VERSION, ekran: trenutni, uredjaj: uredjaj(), tehnicki: null }));
      };
    }
    red.appendChild(el('button', { type: 'button', class: 'dugme palac', 'aria-label': F.t('anketaDa'), title: F.t('anketaDa'), html: PALAC, onclick: brza('like', F.t('brzaDa')) }));
    red.appendChild(el('button', { type: 'button', class: 'dugme palac palac-dole', 'aria-label': F.t('anketaNe'), title: F.t('anketaNe'), html: PALAC, onclick: brza('dislike', F.t('brzaNe')) }));
    red.appendChild(el('button', { type: 'button', class: 'dugme', text: F.t('anketaPisi'), onclick: function () { red.remove(); otvoriUtisak('idea', $('#dugme-kopiraj-sve')); } }));
    var mesto = dugme.closest('.dugmad') || dugme;
    mesto.parentNode.insertBefore(red, mesto.nextSibling);
  }
  ['#dugme-kopiraj-sve', '#dugme-stampaj', '#dugme-link-proracuna', '#dugme-sacuvaj-varijantu'].forEach(function (s) {
    $(s).addEventListener('click', function () { var b = this; setTimeout(function () { pitajZaUtisak(b); }, 600); });
  });
  pisi(F.KLJUC.anketa, F.zabeleziDan(citaj(F.KLJUC.anketa, null), Date.now()));
  setTimeout(isprazniRedPovratnih, 2500);

  $$('input[name="decimale-brzo"]').forEach(function (r) { r.addEventListener('change', function () { promeniPodesavanje({ decimale: Number(this.value) }); }); });

  // ------------------------------------------------------------------
  // Molba za deljenje: posle nekog vremena korišćenja, najviše jednom u 30 dana
  // ------------------------------------------------------------------
  var prikazanoObavestenje = false;
  function proveriMolbu() {
    var k = citaj('zoran.koriscenje', null) || {};
    var sada = Date.now(), DAN = 86400000;
    if (!k.prvi) k.prvi = sada;
    k.otvaranja = (k.otvaranja || 0) + 1;
    pisi('zoran.koriscenje', k);
    if (k.ne || k.podeljeno || prikazanoObavestenje) return;
    if (k.otvaranja < 5 || sada - k.prvi < 2 * DAN) return;
    if (k.pitano && sada - k.pitano < 30 * DAN) return;
    setTimeout(function () {
      if (!$('#obavestenje-verzija').hidden) return;
      var m = $('#molba-podeli');
      m.hidden = false;
      function zapamti(polje) { var x = citaj('zoran.koriscenje', {}) || {}; x[polje] = polje === 'pitano' ? Date.now() : true; x.pitano = Date.now(); pisi('zoran.koriscenje', x); m.hidden = true; }
      $('#molba-da').addEventListener('click', function () { zapamti('podeljeno'); prikaziEkran('podesavanja'); otvoriPodeli(); });
      $('#molba-kasnije').addEventListener('click', function () { zapamti('pitano'); });
      $('#molba-ne').addEventListener('click', function () { zapamti('ne'); });
    }, 20000);
  }

  // ------------------------------------------------------------------
  // Obaveštenje posle ažuriranja
  // ------------------------------------------------------------------
  (function obavestenjeOVerziji() {
    var bila = citaj('zoran.verzija', null);
    pisi('zoran.verzija', APP_VERSION);
    if (!bila || bila === APP_VERSION) return; // prva instalacija ili ista verzija
    prikazanoObavestenje = true;
    var o = $('#obavestenje-verzija');
    $$('[data-verzija-broj]').forEach(function (x) { x.textContent = APP_VERSION; });
    $('#link-novosti-baner').href = './novosti.html#v' + APP_VERSION.replace(/\./g, '-');
    o.hidden = false;
    $('#zatvori-obavestenje').addEventListener('click', function () { o.hidden = true; });
    $('#link-novosti-baner').addEventListener('click', function () { o.hidden = true; });
  })();

  // ------------------------------------------------------------------
  // Google Drive: čuvanje i sinhronizacija
  // ------------------------------------------------------------------
  (function googleDrive() {
    var D = window.ZoranDrive;
    if (!D) return;
    var sesija;
    try { sesija = window.sessionStorage; } catch (e) { sesija = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }; }
    // proba je završena: Drive je uključen za sve; stari probni link i oznaka se samo čiste
    try { localStorage.removeItem('zoran.drive-proba'); } catch (e) { /* nema */ }
    if (/[?&]drive=[01]\b/.test(location.search) && !unosIzLinka()) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* bez čišćenja */ } }
    $('#drive-sekcija').hidden = false;

    var uToku = false, tajmerSlanja = 0;
    function sada() { return Date.now(); }
    function token() { return D.tokenIzSesije(sesija, sada()); }
    function info() { return { verzija: APP_VERSION, uredjaj: sistem() + ', ' + pregledac() }; }
    function vreme(ms) {
      if (!ms) return '—';
      var d = new Date(ms);
      function dd(n) { return (n < 10 ? '0' : '') + n; }
      return dd(d.getDate()) + '.' + dd(d.getMonth() + 1) + '.' + d.getFullYear() + '. u ' + dd(d.getHours()) + ':' + dd(d.getMinutes());
    }
    function osveziPrikaz(poruka) {
      var s = D.stanje(localStorage);
      var povezano = !!s.povezano;
      $('#dugme-drive-povezi').hidden = povezano;
      $('#dugme-drive-sinh').hidden = !povezano;
      $('#dugme-drive-prekini').hidden = !povezano;
      var tekst;
      if (!povezano) tekst = 'Nije povezano.';
      else {
        tekst = 'Povezano' + (s.mejl ? ' sa ' + s.mejl : '') + '. ' + (s.poslednjaSinh ? 'Poslednja sinhronizacija: ' + vreme(s.poslednjaSinh) + '.' : 'Još nije sinhronizovano.');
        if (D.imaNeposlato(localStorage)) tekst += token() ? ' Čuvam izmene…' : ' Ima izmena koje nisu na Drive-u — dodirni „Sinhronizuj“.';
        else if (token()) tekst += ' Izmene se same čuvaju.';
      }
      $('#drive-stanje').textContent = poruka ? poruka + ' ' + tekst : tekst;
      var baner = $('#drive-baner');
      if (!povezano || token()) baner.hidden = true;
    }

    // Prozor „Pronađena kopija“
    var prozorD = $('#prozor-drive');
    var odgovorKopija = null;
    function pitajZaKopiju(opis) {
      var delovi = ['Sačuvana ' + vreme(opis.izmenjeno)];
      if (opis.uredjaj) delovi.push('na uređaju ' + opis.uredjaj);
      var sadrzaj = delovi.join(' ') + '.';
      if (opis.par) sadrzaj += ' Poslednji par: z₁ = ' + opis.par.z1 + ', z₂ = ' + opis.par.z2 + ', mₙ = ' + fmt(opis.par.mn, 2).replace(/[,.]?0+$/, '') + '.';
      sadrzaj += ' Varijanti: ' + opis.varijanti + '.';
      $('#drive-kopija-opis').textContent = sadrzaj;
      return new Promise(function (resolve) {
        odgovorKopija = resolve;
        if (prozor.open) zatvoriPodeli();
        if (typeof prozorD.showModal === 'function') prozorD.showModal(); else prozorD.setAttribute('open', '');
        document.documentElement.classList.add('prozor-otvoren');
        $('#drive-kopija-ucitaj').focus();
      });
    }
    function zavrsiKopiju(izbor) {
      var r = odgovorKopija; odgovorKopija = null;
      if (typeof prozorD.close === 'function' && prozorD.open) prozorD.close(); else prozorD.removeAttribute('open');
      document.documentElement.classList.remove('prozor-otvoren');
      if (r) r(izbor);
    }
    $('#drive-kopija-ucitaj').addEventListener('click', function () { zavrsiKopiju('ucitaj'); });
    $('#drive-kopija-zadrzi').addEventListener('click', function () { zavrsiKopiju('zadrzi'); });
    prozorD.addEventListener('close', function () { if (odgovorKopija) zavrsiKopiju('odustani'); });
    prozorD.addEventListener('click', function (e) { if (e.target === prozorD && e.detail !== 0) zavrsiKopiju('odustani'); });

    function obradiGresku(g) {
      if (g && g.kod === 'token') { D.obrisiToken(sesija); osveziPrikaz('Pristup Drive-u je istekao.'); return; }
      if (g && (g.kod === 'zatvoreno' || g.kod === 'odbijeno')) { osveziPrikaz('Google prozor je zatvoren — ništa nije promenjeno.'); return; }
      if (g && g.kod === 'mreza') { osveziPrikaz(navigator.onLine ? 'Google Drive trenutno nije dostupan.' : 'Nema interneta — sinhronizacija kad se veza vrati.'); return; }
      F.zabeleziGresku('Drive: ' + (g && g.message ? g.message : String(g)), g && g.stack);
      osveziPrikaz('Sinhronizacija nije uspela.');
    }
    function zavrsi(r) {
      if (r.rezultat === 'preuzeto') {
        skladisteZakljucano = true; // stranica sa starim podacima ne sme da prepiše kopiju dok se ponovo učitava
        try { sesija.setItem('zoran.drive-ucitano', '1'); } catch (e) { /* nema */ }
        location.reload();
        return;
      }
      if (r.rezultat === 'poslato') osveziPrikaz('Sačuvano na Drive.');
      else if (r.rezultat === 'nista') osveziPrikaz('Sve je već usklađeno.');
      else if (r.rezultat === 'odustao') osveziPrikaz('Ništa nije promenjeno.');
      else if (r.rezultat === 'sukob') osveziPrikaz('Na Drive-u ima novijih izmena sa drugog uređaja.');
    }
    function sinhronizuj(t, auto) {
      if (uToku) return Promise.resolve();
      uToku = true;
      return D.sinhronizuj({ sklad: localStorage, fetch: window.fetch.bind(window), token: t, info: info(), pitaj: pitajZaKopiju, auto: !!auto })
        .then(zavrsi, obradiGresku).then(function () { uToku = false; }, function () { uToku = false; });
    }
    /** Dodir korisnika: uzmi pristup (ako je istekao), pa sinhronizuj. */
    function dodirSinhronizuj(prviPut) {
      var t = token();
      if (t) return sinhronizuj(t, false);
      if (!navigator.onLine) { osveziPrikaz('Nema interneta.'); return Promise.resolve(); }
      var s = D.stanje(localStorage);
      osveziPrikaz('Otvaram Google prijavu…');
      return D.ucitajGIS(document).then(function (google) {
        return D.zatraziToken(google, { prompt: prviPut ? 'consent' : '', mejl: s.mejl });
      }).then(function (odg) {
        D.sacuvajToken(sesija, odg.token, odg.trajanje, sada());
        var st = D.stanje(localStorage);
        var bilo = st.povezano;
        st.povezano = true;
        D.sacuvajStanje(localStorage, st);
        if (!bilo || !st.mejl) {
          D.mejlNaloga({ fetch: window.fetch.bind(window), token: odg.token }).then(function (m) {
            if (!m) return;
            var x = D.stanje(localStorage); x.mejl = m; D.sacuvajStanje(localStorage, x); osveziPrikaz();
          });
        }
        return sinhronizuj(odg.token, false);
      }).catch(obradiGresku);
    }
    function zakaziSlanje(odmah) {
      clearTimeout(tajmerSlanja);
      if (!D.imaNeposlato(localStorage)) return;
      var t = token();
      if (!t || !navigator.onLine) { osveziPrikaz(); return; }
      tajmerSlanja = setTimeout(function () { sinhronizuj(token(), true); }, odmah ? 0 : 4000);
    }

    posleUpisa = function (kljuc) {
      if (D.SINHRONIZUJ.indexOf(kljuc) < 0) return;
      if (D.oznaciIzmenu(localStorage, sada())) zakaziSlanje(false);
    };
    window.addEventListener('online', function () { zakaziSlanje(true); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') zakaziSlanje(true); });

    $('#dugme-drive-povezi').addEventListener('click', function () { dodirSinhronizuj(true); });
    $('#dugme-drive-sinh').addEventListener('click', function () { dodirSinhronizuj(false); });
    $('#dugme-drive-prekini').addEventListener('click', function () {
      var t = token();
      if (t && window.google) D.ponistiPristup(window.google, t);
      D.obrisiToken(sesija);
      D.sacuvajStanje(localStorage, {});
      osveziPrikaz('Veza je prekinuta. Podaci na ovom uređaju i kopija na Drive-u ostaju.');
    });
    $('#drive-baner-sinh').addEventListener('click', function () { $('#drive-baner').hidden = true; dodirSinhronizuj(false); });
    $('#drive-baner-zatvori').addEventListener('click', function () { $('#drive-baner').hidden = true; });

    var ucitano = false;
    try { ucitano = sesija.getItem('zoran.drive-ucitano') === '1'; sesija.removeItem('zoran.drive-ucitano'); } catch (e) { ucitano = false; }
    if (ucitano) setTimeout(function () { tost('Učitani su podaci sa Google Drive-a.'); }, 400);
    osveziPrikaz(ucitano ? 'Učitano sa Drive-a.' : '');
    // podsetnik pri otvaranju: povezano, a pristup je istekao
    if (D.stanje(localStorage).povezano && !token() && !prikazanoObavestenje) $('#drive-baner').hidden = false;
    else if (token()) zakaziSlanje(true);
  })();

  proveriMolbu();

  // ------------------------------------------------------------------
  // Pokretanje
  // ------------------------------------------------------------------
  postaviPodesavanja();
  (function ucitajUnos() {
    var s = citaj('zoran.unos', null);
    if (s && s.vrednosti && citaj('zoran.aRucno', null) === null) postaviRucnoA(true); // postojeći korisnik: njegovo a se ne menja
    if (s && s.vrednosti) {
      // Stari unos (do 1.2.x) je imao pomeranja, a ne osno rastojanje: pretvori ih u a,
      // da korisnik posle ažuriranja dobije isti par.
      if (s.vrednosti.a === undefined && isFinite(s.vrednosti.pom1) && isFinite(s.vrednosti.pom2)) {
        var star = P.proracunaj(s.vrednosti);
        s.vrednosti.a = star.ok ? Math.round(star.par.a * 1000) / 1000 : P.PODRAZUMEVANO.a;
      }
      var v = {};
      POLJA.forEach(function (k) {
        var x = s.vrednosti[k];
        // neispravan unos vrati kao sirovi tekst da korisnik vidi šta je kucao
        v[k] = (typeof x === 'number' && isFinite(x)) ? x : (s.sirovo && s.sirovo[k] !== undefined ? s.sirovo[k] : P.PODRAZUMEVANO[k]);
      });
      v.raspodela = s.vrednosti.raspodela || 'din'; // unos pre 1.12.0 nema izbor raspodele: DIN 3992 kao do sada
      upisiUnos(v);
    } else upisiUnos(P.PODRAZUMEVANO);
    // proračun iz linka ima prednost nad sačuvanim unosom
    var izLinka = unosIzLinka();
    if (izLinka) {
      if (izLinka.a !== undefined) postaviRucnoA(true);
      upisiUnos(izLinka);
      setTimeout(function () { $('#napomena-proracun').textContent = 'Učitan je proračun iz linka.'; }, 0);
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* bez čišćenja adrese */ }
    }
  })();
  POLJA.forEach(function (k) { $('#u-' + k).addEventListener('input', zakaziPreracun); });
  $$('input[name="raspodela"]').forEach(function (r) {
    r.addEventListener('change', function () { postaviRaspodelu(this.value); preracunaj(); });
  });
  $('#u-a').addEventListener('input', function () { postaviRucnoA(true); });
  $('#dugme-idealno-a').addEventListener('click', function () {
    postaviRucnoA(false);
    preracunaj();
    $('#napomena-proracun').textContent = 'Osno rastojanje je vraćeno na idealno.';
  });
  $('#dugme-podrazumevano').addEventListener('click', function () {
    postaviRucnoA(true);
    upisiUnos(P.PODRAZUMEVANO);
    preracunaj();
    $('#napomena-proracun').textContent = 'Vraćene su podrazumevane vrednosti.';
  });
  preracunaj();

  (function ucitajSavetnik() {
    var s = citaj('zoran.savetnik', null);
    if (s && s.vrednosti) {
      var v = {};
      SPOLJA.forEach(function (k) {
        var x = s.vrednosti[k];
        v[k] = (typeof x === 'number' && isFinite(x)) ? x : (s.sirovo ? s.sirovo[k] : '');
      });
      upisiSavetnik(v);
    } else {
      var r = poslednjiRez;
      upisiSavetnik({ a: r ? Math.round(r.par.a) : 250, z1: r ? r.ulaz.z1 : 16, z2: r ? r.ulaz.z2 : 58, mn: r ? r.ulaz.mn : 6.5, beta: r ? r.ulaz.beta : 9, alfaN: r ? r.ulaz.alfaN : 20, tol: 2 });
    }
  })();
  SPOLJA.forEach(function (k) { $('#s-' + k).addEventListener('input', racunajSavetnik); });
  zastarelo.savetnik = true; // priprema se u pozadini ili kad se ekran otvori

  prikaziEkran(location.hash.slice(1) || 'proracun', true);
  try { console.info('%cZoran ' + APP_VERSION + '%c — Zet Obično Računa Apsolutno Nepogrešivo.', 'font: italic 600 14px Georgia, serif; color: #2B2117', 'font: italic 13px Georgia, serif; color: #54432F'); } catch (e) { /* nema konzole */ }
})();
