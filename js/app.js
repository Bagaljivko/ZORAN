/* Zoran — korisnički interfejs */
(function () {
  'use strict';

  var APP_VERSION = '1.0.0';
  var P = window.Proracun, C = window.Crtez, S = window.Sldprt;
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
  function pisi(kljuc, v) { try { localStorage.setItem(kljuc, JSON.stringify(v)); } catch (e) { /* privatni režim */ } }

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

  function kopirajTekst(tekst) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(tekst).catch(function () { return kopirajRezervno(tekst); });
    }
    return Promise.resolve(kopirajRezervno(tekst));
  }
  function kopirajRezervno(tekst) {
    var t = el('textarea', { readonly: true, style: 'position:fixed;top:-1000px;opacity:0' });
    t.value = tekst;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); } catch (e) { /* nema podrške */ }
    document.body.removeChild(t);
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
    if (ime === 'proracun' || ime === 'tablica') crtaj();
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
  var POLJA = ['z1', 'pom1', 'z2', 'pom2', 'mn', 'beta', 'alfaN', 'b'];
  var DUZINSKA = { pom1: true, pom2: true, b: true };
  var poslednjiRez = null;   // poslednji ispravan rezultat
  var trenutniRez = null;    // rezultat za trenutni unos (može biti neispravan)

  function upisiUnos(vrednostiMm) {
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
    return u;
  }
  function sacuvajUnos() {
    var u = procitajUnos(), sirovo = {};
    POLJA.forEach(function (k) { sirovo[k] = $('#u-' + k).value; });
    pisi('zoran.unos', { vrednosti: u, sirovo: sirovo, jedinice: pod.jedinice });
  }

  function preracunaj() {
    var u = procitajUnos();
    var r = P.proracunaj(u);
    trenutniRez = r;
    // poruke po poljima
    POLJA.forEach(function (k) {
      $('#p-' + k).textContent = '';
      $('#u-' + k).removeAttribute('aria-invalid');
    });
    r.greske.forEach(function (g) {
      var p = $('#p-' + g.polje);
      if (p) { p.textContent = g.poruka; $('#u-' + g.polje).setAttribute('aria-invalid', 'true'); }
    });
    // x = pomeranje / mₙ
    ['1', '2'].forEach(function (i) {
      var pom = u['pom' + i];
      $('#h-pom' + i).innerHTML = isFinite(pom) && isFinite(u.mn) && u.mn > 0
        ? '<i>x</i>' + (i === '1' ? '₁' : '₂') + ' = ' + esc(fmt(pom / u.mn, 4)) : '';
    });
    if (r.ok) poslednjiRez = r;
    sacuvajUnos();
    prikaziRezultate();
    crtaj();
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

  function prikaziRezultate() {
    var r = trenutniRez;
    prikaziUpozorenja('#upozorenja-proracun', r);
    prikaziUpozorenja('#upozorenja-tablica', r);
    var napomena = $('#napomena-proracun');
    napomena.textContent = !r.ok && poslednjiRez ? 'Crtež i tablica prikazuju poslednji ispravan unos.' : '';

    var rez = poslednjiRez;
    var kratka = $('#tablica-kratka'), puna = $('#tablica-puna');
    kratka.innerHTML = ''; puna.innerHTML = '';
    if (!rez) {
      puna.appendChild(el('p', { class: 'kurziv', text: 'Nema rezultata — ispravi unos.' }));
      return;
    }
    var redovi = redoviTablice(rez);
    // kratka tablica (telefon)
    redovi.par.filter(function (s) { return s.kratko; }).forEach(function (s) { kratka.appendChild(redTablice(s)); });
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
      { naziv: 'Stepen sprezanja profila <i>ε</i>α', v: p.epsA, dec: 4, kratko: true, upozorenje: p.epsA < 1.1, tekst: 'Stepen sprezanja profila εα' },
      { naziv: 'Stepen sprezanja bokova <i>ε</i>β', v: p.epsB, dec: 4, kratko: true, tekst: 'Stepen sprezanja bokova εβ' },
      { naziv: 'Ukupni stepen sprezanja <i>ε</i>γ', v: p.epsG, dec: 4, kratko: true, tekst: 'Ukupni stepen sprezanja εγ' }
    ];
    var zup = rez.zupcanici.map(function (g, i) {
      var ix = i === 0 ? '₁' : '₂', ixa = i === 0 ? '1' : '2';
      var podsec = rez.upozorenja.some(function (w) { return w.kod === 'podsecanje' && w.zupcanik === i; });
      var zas = rez.upozorenja.some(function (w) { return w.kod === 'zasiljen' && w.zupcanik === i; });
      return [
        { naziv: 'Pomeranje profila <i>x</i>·<i>m</i>ₙ', v: duz(g.pomeranje), jed: J, tekst: 'Pomeranje profila ' + ixa },
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
        { naziv: 'Granica podsecanja <i>x</i>min', v: g.xmin, dec: 4, tekst: 'Granica podsecanja xmin' + ixa }
      ];
    });
    return { par: par, zup: zup };
  }

  function tekstSvega() {
    var rez = poslednjiRez;
    if (!rez) return '';
    var redovi = redoviTablice(rez);
    var u = rez.ulaz;
    var linije = ['Zoran ' + APP_VERSION + ' — zupčasti par z1 = ' + u.z1 + ', z2 = ' + u.z2 + ', mn = ' + zaKopiju(u.mn) + ' mm, β = ' + zaKopiju(u.beta) + '°, αn = ' + zaKopiju(u.alfaN) + '°, b = ' + zaKopiju(duz(u.b)) + ' ' + jedDuz(), ''];
    function dodaj(s) { linije.push(s.tekst + '\t' + zaKopiju(s.v, s.dec) + (s.jed ? '\t' + s.jed : '')); }
    linije.push('Par zupčanika'); redovi.par.forEach(dodaj);
    linije.push('', 'Mali zupčanik (z1 = ' + u.z1 + ')'); redovi.zup[0].forEach(dodaj);
    linije.push('', 'Veliki zupčanik (z2 = ' + u.z2 + ')'); redovi.zup[1].forEach(dodaj);
    if (rez.upozorenja.length) { linije.push('', 'Upozorenja'); rez.upozorenja.forEach(function (w) { linije.push(w.poruka); }); }
    return linije.join('\n');
  }

  // ------------------------------------------------------------------
  // Crtež i animacija
  // ------------------------------------------------------------------
  var prikaz = 'ceo';
  var animacija = { radi: false, ugao: 0, posl: 0, id: 0 };

  function crtaj() {
    var okvir = $('#crtez');
    var rez = poslednjiRez;
    var vidljiv = $('#ekran-proracun').classList.contains('aktivan');
    if (!rez) {
      okvir.innerHTML = '<div class="prazno">Crtež će se pojaviti kada unos bude ispravan.</div>';
      $('#potpis-crteza').textContent = '';
      return;
    }
    if (!vidljiv && okvir.firstChild) return;
    okvir.innerHTML = C.nacrtaj(rez, { prikaz: prikaz, ugao1: animacija.ugao, odnosStrana: 0.62 });
    okvir.classList.toggle('zastarelo', !!(trenutniRez && !trenutniRez.ok));
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
    upisiSavetnik({ a: Math.round(r.par.a * 100) / 100, z1: r.ulaz.z1, z2: r.ulaz.z2, mn: r.ulaz.mn, beta: r.ulaz.beta, alfaN: r.ulaz.alfaN });
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
    upisiUnos({ z1: k.z1, z2: k.z2, mn: k.mn, beta: u.beta, alfaN: u.alfaN, pom1: Math.round(k.pom1 * 1000) / 1000, pom2: Math.round(k.pom2 * 1000) / 1000, b: b });
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
      return S.analiziraj(new Uint8Array(ab), { inflateRaw: typeof DecompressionStream !== 'undefined' ? inflateRaw : null });
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
    var cilj = el('div', { class: 'izbor' }, [
      el('span', { class: 'natpis-izbora', text: 'Broj zuba i pomeranje profila primeni na:' }),
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
      red.appendChild(el('input', { type: 'checkbox', id: id + '-da', checked: nadjen, 'aria-label': 'Primeni ' + par.naziv }));
      var naziv = par.naziv.replace('[mm]', '[' + (par.kljuc === 'pom' || par.kljuc === 'b' ? jedDuz() : 'mm') + ']');
      red.appendChild(el('label', { for: id, text: naziv }));
      var inp = el('input', { type: 'text', id: id, inputmode: 'decimal', value: nadjen ? zaPolje(vred) : '', placeholder: '—' });
      inp.addEventListener('input', function () { $('#' + id + '-da').checked = isFinite(P.parsirajBroj(inp.value)); });
      red.appendChild(inp);
      var izvor;
      if (nadjen) izvor = el('div', { class: 'izvor', text: 'Izvor: ' + n.izvor + ' — svojstvo „' + n.ime + '“' + (n.napomena ? ' (' + n.napomena + ')' : '') });
      else if (n) izvor = el('div', { class: 'izvor nema', text: 'Svojstvo „' + n.ime + '“ postoji, ali vrednost „' + n.sirovo + '“ nije broj — unesi ručno.' });
      else izvor = el('div', { class: 'izvor nema', text: 'nije pronađeno, unesi ručno' });
      red.appendChild(izvor);
      lista.appendChild(red);
    });
    out.appendChild(lista);

    var poruka = el('div', { class: 'napomena', 'aria-live': 'polite' });
    out.appendChild(el('div', { class: 'dugmad' }, [el('button', { type: 'button', class: 'pecat', text: 'Primeni u proračun', onclick: function () {
      var cil = ($('input[name="uvoz-cilj"]:checked') || {}).value || '1';
      var nove = {}, primenjeno = [];
      S.PARAMETRI.forEach(function (par) {
        if (!$('#uv-' + par.kljuc + '-da').checked) return;
        var v = P.parsirajBroj($('#uv-' + par.kljuc).value);
        if (!isFinite(v)) return;
        if (par.kljuc === 'pom' || par.kljuc === 'b') v = izDuz(v);
        var k = par.kljuc === 'z' ? 'z' + cil : par.kljuc === 'pom' ? 'pom' + cil : par.kljuc;
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
    $$('input[name="decimale"]').forEach(function (r) { r.checked = Number(r.value) === pod.decimale; });
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
    upisiUnos(u);
    var s = {};
    SPOLJA.forEach(function (k) { if (isFinite(staroS[k])) s[k] = staroS[k]; });
    upisiSavetnik(s);
    preracunaj();
    racunajSavetnik();
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
    var tekst = 'Zoran — dijagnostika\n' + dijagRedovi.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\nUA: ' + navigator.userAgent;
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
  // Naslovni ekran
  // ------------------------------------------------------------------
  $$('[data-verzija]').forEach(function (s) { s.textContent = 'verzija ' + APP_VERSION; });
  var naslovna = $('#naslovna');
  function skloniNaslovnu() {
    if (naslovna.classList.contains('skriveno')) return;
    naslovna.classList.add('skriveno');
    setTimeout(function () { naslovna.style.display = 'none'; }, 400);
  }
  naslovna.addEventListener('pointerdown', skloniNaslovnu);
  naslovna.addEventListener('click', skloniNaslovnu);
  document.addEventListener('keydown', skloniNaslovnu, { once: true });
  setTimeout(skloniNaslovnu, 1500);

  // ------------------------------------------------------------------
  // Pokretanje
  // ------------------------------------------------------------------
  postaviPodesavanja();
  (function ucitajUnos() {
    var s = citaj('zoran.unos', null);
    if (s && s.vrednosti) {
      var v = {};
      POLJA.forEach(function (k) {
        var x = s.vrednosti[k];
        // neispravan unos vrati kao sirovi tekst da korisnik vidi šta je kucao
        v[k] = (typeof x === 'number' && isFinite(x)) ? x : (s.sirovo && s.sirovo[k] !== undefined ? s.sirovo[k] : P.PODRAZUMEVANO[k]);
      });
      upisiUnos(v);
    } else upisiUnos(P.PODRAZUMEVANO);
  })();
  POLJA.forEach(function (k) { $('#u-' + k).addEventListener('input', preracunaj); });
  $('#dugme-podrazumevano').addEventListener('click', function () {
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
  racunajSavetnik();

  prikaziEkran(location.hash.slice(1) || 'proracun', true);
})();
