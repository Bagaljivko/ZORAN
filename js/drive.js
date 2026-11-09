/*
 * Zoran — čuvanje na Google Drive-u korisnika (skrivena fascikla aplikacije, appDataFolder).
 * Bez servera: Google Identity Services daje pristup na sat vremena; posle toga korisnik dodirne „Sinhronizuj“.
 * Logika sinhronizacije su čiste funkcije (rade i u Node-u, za testove); fetch i token se prosleđuju spolja.
 */
(function (koren, fabrika) {
  var M = fabrika(koren);
  if (typeof module === 'object' && module.exports) module.exports = M;
  else koren.ZoranDrive = M;
})(typeof self !== 'undefined' ? self : this, function (koren) {
  'use strict';

  var CLIENT_ID = '320626380900-0thoauc366vq0ruhu1od4mq9vllrhggb.apps.googleusercontent.com';
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var IME_FAJLA = 'zoran-podaci.json';
  var GIS_SKRIPTA = 'https://accounts.google.com/gsi/client';
  var API = 'https://www.googleapis.com/drive/v3';
  var UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

  /** Ključevi koji se čuvaju na Drive-u (sve ostalo ostaje samo na uređaju). */
  var SINHRONIZUJ = ['zoran.unos', 'zoran.podesavanja', 'zoran.varijante', 'zoran.savetnik', 'zoran.vratilo', 'zoran.sile', 'zoran.aRucno', 'zoran.povratne-mejl'];
  var KLJUC = {
    stanje: 'zoran.drive',        // povezano, mejl, ID fajla, vreme poslednje sinhronizacije…
    token: 'zoran.drive-token'    // sessionStorage: pristup važi najviše sat vremena i briše se kad se zatvori aplikacija
  };

  function citaj(sklad, kljuc, podr) {
    try { var v = sklad.getItem(kljuc); return v ? JSON.parse(v) : podr; } catch (e) { return podr; }
  }
  function pisi(sklad, kljuc, v) { try { sklad.setItem(kljuc, JSON.stringify(v)); } catch (e) { /* privatni režim */ } }

  function stanje(sklad) {
    var s = citaj(sklad, KLJUC.stanje, null);
    return s && typeof s === 'object' ? s : {};
  }
  function sacuvajStanje(sklad, s) { pisi(sklad, KLJUC.stanje, s); }

  // ------------------------------------------------------------------
  // Snimak podataka
  // ------------------------------------------------------------------
  /** Snimak lokalnih podataka za Drive. info: {verzija, uredjaj, sada} */
  function snimak(sklad, info) {
    var podaci = {};
    SINHRONIZUJ.forEach(function (k) {
      var v = null;
      try { v = sklad.getItem(k); } catch (e) { v = null; }
      if (v !== null && v !== undefined) podaci[k] = v;
    });
    return { format: 1, app: 'ZORAN', verzija: info.verzija, uredjaj: info.uredjaj, izmenjeno: info.sada, podaci: podaci };
  }
  function ispravanSnimak(s) {
    return !!(s && typeof s === 'object' && s.app === 'ZORAN' && s.format === 1 && s.podaci && typeof s.podaci === 'object');
  }
  /** Upisuje snimak sa Drive-a u lokalno skladište (ključ koga nema u snimku briše se i lokalno). */
  function primeni(sklad, s) {
    SINHRONIZUJ.forEach(function (k) {
      try {
        if (Object.prototype.hasOwnProperty.call(s.podaci, k) && typeof s.podaci[k] === 'string') sklad.setItem(k, s.podaci[k]);
        else sklad.removeItem(k);
      } catch (e) { /* privatni režim */ }
    });
  }
  /** Kratak opis kopije za ponudu korisniku. */
  function opisSnimka(s) {
    var varijanti = 0;
    try { var v = JSON.parse(s.podaci['zoran.varijante'] || '[]'); varijanti = Array.isArray(v) ? v.length : 0; } catch (e) { varijanti = 0; }
    var unos = null;
    try { unos = JSON.parse(s.podaci['zoran.unos'] || 'null'); } catch (e) { unos = null; }
    var u = unos && unos.vrednosti ? unos.vrednosti : null;
    return {
      izmenjeno: s.izmenjeno || 0,
      uredjaj: s.uredjaj || '',
      verzija: s.verzija || '',
      varijanti: varijanti,
      par: u && isFinite(u.z1) && isFinite(u.z2) && isFinite(u.mn) ? { z1: u.z1, z2: u.z2, mn: u.mn } : null
    };
  }

  /** Beleži lokalnu izmenu (da se zna šta treba poslati). */
  function oznaciIzmenu(sklad, sada) {
    var s = stanje(sklad);
    if (!s.povezano) return false;
    s.lokalnoIzmenjeno = sada;
    sacuvajStanje(sklad, s);
    return true;
  }
  function imaNeposlato(sklad) {
    var s = stanje(sklad);
    return !!(s.povezano && (s.lokalnoIzmenjeno || 0) > (s.poslednjaSinh || 0));
  }

  /**
   * Šta raditi: 'ponudi' (pitaj korisnika da li da učita kopiju), 'preuzmi', 'posalji' ili 'nista'.
   * u: {postoji, novo} — da li na Drive-u postoji kopija i da li je promenjena od poslednje sinhronizacije.
   */
  function odluka(s, u) {
    var prvi = !s.poslednjaSinh;
    var lokalnoMenjano = (s.lokalnoIzmenjeno || 0) > (s.poslednjaSinh || 0);
    if (!u.postoji) return 'posalji';
    if (prvi) return 'ponudi';
    if (u.novo && lokalnoMenjano) return 'ponudi';
    if (u.novo) return 'preuzmi';
    if (lokalnoMenjano) return 'posalji';
    return 'nista';
  }

  // ------------------------------------------------------------------
  // Drive REST (fetch i token spolja)
  // ------------------------------------------------------------------
  function GreskaDrive(kod, poruka) { this.kod = kod; this.message = poruka || kod; }
  GreskaDrive.prototype = Object.create(Error.prototype);

  function zahtev(o, url, opcije) {
    opcije = opcije || {};
    opcije.headers = Object.assign({ Authorization: 'Bearer ' + o.token }, opcije.headers || {});
    return o.fetch(url, opcije).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new GreskaDrive('token', 'pristup je istekao ili nije dozvoljen (' + r.status + ')');
      if (!r.ok) throw new GreskaDrive('drive', 'Drive je odgovorio ' + r.status);
      return r;
    }, function () { throw new GreskaDrive('mreza', 'nema veze sa Google Drive-om'); });
  }
  function nadjiFajl(o) {
    var q = encodeURIComponent("name='" + IME_FAJLA + "' and trashed=false");
    return zahtev(o, API + '/files?spaces=appDataFolder&q=' + q + '&fields=' + encodeURIComponent('files(id,modifiedTime)') + '&orderBy=modifiedTime%20desc&pageSize=10')
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d.files && d.files.length ? d.files[0] : null; });
  }
  function preuzmiFajl(o, id) {
    return zahtev(o, API + '/files/' + encodeURIComponent(id) + '?alt=media').then(function (r) { return r.text(); }).then(function (t) {
      try { return JSON.parse(t); } catch (e) { return null; }
    });
  }
  /** Telo multipart/related zahteva (metapodaci + JSON). */
  function multipart(meta, sadrzaj, granica) {
    return '--' + granica + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + granica + '\r\nContent-Type: application/json\r\n\r\n' + sadrzaj + '\r\n--' + granica + '--';
  }
  function otpremiFajl(o, id, s) {
    var granica = 'zoran' + Math.random().toString(36).slice(2);
    var meta = id ? {} : { name: IME_FAJLA, parents: ['appDataFolder'], mimeType: 'application/json' };
    var url = UPLOAD + '/files' + (id ? '/' + encodeURIComponent(id) : '') + '?uploadType=multipart&fields=' + encodeURIComponent('id,modifiedTime');
    return zahtev(o, url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + granica }, body: multipart(meta, JSON.stringify(s), granica) })
      .then(function (r) { return r.json(); });
  }
  function mejlNaloga(o) {
    return zahtev(o, API + '/about?fields=' + encodeURIComponent('user(emailAddress)')).then(function (r) { return r.json(); })
      .then(function (d) { return d && d.user && d.user.emailAddress || ''; }, function () { return ''; });
  }

  /**
   * Sinhronizacija. o: {sklad, fetch, token, info: {verzija, uredjaj}, sada(), pitaj(opis) → Promise<'ucitaj'|'zadrzi'|'odustani'>, auto}
   * U automatskom režimu (auto: true) korisnik se ne pita: ako postoji novija kopija na Drive-u, a ima i lokalnih izmena,
   * ništa se ne menja i vraća se 'sukob'.
   * Vraća Promise<{rezultat: 'preuzeto'|'poslato'|'nista'|'sukob'|'odustao'}>
   */
  function sinhronizuj(o) {
    var sada = o.sada || Date.now;
    var s = stanje(o.sklad);
    var fajl = null, udaljeni = null;
    return nadjiFajl(o).then(function (f) {
      fajl = f;
      var novo = !!(f && f.modifiedTime !== s.driveVreme);
      if (f && (!s.poslednjaSinh || novo)) {
        return preuzmiFajl(o, f.id).then(function (d) { udaljeni = ispravanSnimak(d) ? d : null; return { postoji: !!udaljeni, novo: novo }; });
      }
      return { postoji: !!f, novo: novo };
    }).then(function (u) {
      var od = odluka(s, u);
      if (od === 'preuzmi' && !udaljeni) od = 'posalji';
      if (od === 'ponudi' && !udaljeni) od = 'posalji';
      if (od === 'ponudi') {
        if (o.auto) return { rezultat: 'sukob' };
        return Promise.resolve(o.pitaj(opisSnimka(udaljeni))).then(function (izbor) {
          if (izbor === 'ucitaj') return preuzmi();
          if (izbor === 'zadrzi') return posalji();
          return { rezultat: 'odustao' };
        });
      }
      if (od === 'preuzmi') return preuzmi();
      if (od === 'posalji') return posalji();
      s = stanje(o.sklad);
      s.poslednjaSinh = sada(); s.fileId = fajl ? fajl.id : s.fileId;
      sacuvajStanje(o.sklad, s);
      return { rezultat: 'nista' };
    });

    function preuzmi() {
      primeni(o.sklad, udaljeni);
      var t = stanje(o.sklad);
      t.fileId = fajl.id; t.driveVreme = fajl.modifiedTime; t.poslednjaSinh = sada(); t.lokalnoIzmenjeno = 0;
      sacuvajStanje(o.sklad, t);
      return { rezultat: 'preuzeto' };
    }
    function posalji() {
      var trenutak = sada();
      var snim = snimak(o.sklad, { verzija: o.info.verzija, uredjaj: o.info.uredjaj, sada: trenutak });
      return otpremiFajl(o, fajl ? fajl.id : null, snim).then(function (r) {
        var t = stanje(o.sklad);
        t.fileId = r.id || (fajl && fajl.id); t.driveVreme = r.modifiedTime || ''; t.poslednjaSinh = trenutak;
        if ((t.lokalnoIzmenjeno || 0) <= trenutak) t.lokalnoIzmenjeno = 0;
        sacuvajStanje(o.sklad, t);
        return { rezultat: 'poslato' };
      });
    }
  }

  // ------------------------------------------------------------------
  // Token (Google Identity Services) — samo u pregledaču
  // ------------------------------------------------------------------
  function tokenIzSesije(sesija, sada) {
    var t = citaj(sesija, KLJUC.token, null);
    return t && t.token && t.istice - 60000 > sada ? t.token : null;
  }
  function sacuvajToken(sesija, token, trajanjeSek, sada) {
    pisi(sesija, KLJUC.token, { token: token, istice: sada + (Number(trajanjeSek) || 3600) * 1000 });
  }
  function obrisiToken(sesija) { try { sesija.removeItem(KLJUC.token); } catch (e) { /* nema */ } }

  var gisObecanje = null;
  function ucitajGIS(dokument) {
    var w = koren;
    if (w.google && w.google.accounts && w.google.accounts.oauth2) return Promise.resolve(w.google);
    if (!gisObecanje) gisObecanje = new Promise(function (resolve, reject) {
      var sk = dokument.createElement('script');
      sk.src = GIS_SKRIPTA; sk.async = true;
      sk.onload = function () { if (w.google && w.google.accounts && w.google.accounts.oauth2) resolve(w.google); else { gisObecanje = null; reject(new GreskaDrive('gis', 'Google prijava nije učitana')); } };
      sk.onerror = function () { gisObecanje = null; reject(new GreskaDrive('mreza', 'Google prijava nije dostupna — proveri internet')); };
      dokument.head.appendChild(sk);
    });
    return gisObecanje;
  }
  /** Traži pristup (otvara Google prozor; mora se pozvati iz dodira korisnika). prompt: '' ili 'consent' */
  function zatraziToken(google, opcije) {
    return new Promise(function (resolve, reject) {
      var klijent = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        hint: opcije.mejl || undefined,
        callback: function (odg) {
          if (odg && odg.access_token) resolve({ token: odg.access_token, trajanje: odg.expires_in });
          else reject(new GreskaDrive('odbijeno', (odg && (odg.error_description || odg.error)) || 'pristup nije dat'));
        },
        error_callback: function (g) { reject(new GreskaDrive(g && g.type === 'popup_closed' ? 'zatvoreno' : 'odbijeno', (g && g.message) || 'Google prozor je zatvoren')); }
      });
      klijent.requestAccessToken({ prompt: opcije.prompt === undefined ? '' : opcije.prompt });
    });
  }
  function ponistiPristup(google, token) {
    try { if (google && google.accounts && google.accounts.oauth2 && token) google.accounts.oauth2.revoke(token, function () {}); } catch (e) { /* bez poništavanja */ }
  }

  return {
    CLIENT_ID: CLIENT_ID,
    SCOPE: SCOPE,
    IME_FAJLA: IME_FAJLA,
    SINHRONIZUJ: SINHRONIZUJ,
    KLJUC: KLJUC,
    GreskaDrive: GreskaDrive,
    stanje: stanje,
    sacuvajStanje: sacuvajStanje,
    snimak: snimak,
    ispravanSnimak: ispravanSnimak,
    primeni: primeni,
    opisSnimka: opisSnimka,
    oznaciIzmenu: oznaciIzmenu,
    imaNeposlato: imaNeposlato,
    odluka: odluka,
    multipart: multipart,
    nadjiFajl: nadjiFajl,
    preuzmiFajl: preuzmiFajl,
    otpremiFajl: otpremiFajl,
    mejlNaloga: mejlNaloga,
    sinhronizuj: sinhronizuj,
    tokenIzSesije: tokenIzSesije,
    sacuvajToken: sacuvajToken,
    obrisiToken: obrisiToken,
    ucitajGIS: ucitajGIS,
    zatraziToken: zatraziToken,
    ponistiPristup: ponistiPristup
  };
});
