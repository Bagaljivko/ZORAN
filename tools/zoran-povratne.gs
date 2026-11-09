/**
 * ZORAN — prijem povratnih informacija u Google tabelu (Google Apps Script).
 *
 * Kako se postavlja: vidi tools/POVRATNE-UPUTSTVO.md.
 * Kod se nalepi u Extensions → Apps Script tabele koja prima poruke, pa se jednom pokrene setup().
 */

/** Pošalji mi mejl kad stigne poruka „Nešto ne radi“. Stavi false da isključiš. */
var OBAVESTI_ZA_GRESKE = true;

/** Koliko dugo se čuvaju redovi (za obrisiStare). */
var CUVAJ_DANA = 730; // 2 godine

var JEZICI = { en: 'English', sr: 'Srpski' };
var ZAGLAVLJE_POVRATNE = ['Time', 'Type', 'Text', 'Email', 'User ID', 'Screen', 'Version', 'Device', 'Tech data'];
var ZAGLAVLJE_DIJAG = ['Time', 'Email', 'User ID', 'Version', 'Language', 'Device', 'Note', 'Report'];
var LIST_DIJAG = 'Diagnostics';
var MAX_CELIJA = 45000; // Google tabela prima najviše 50 000 znakova u ćeliji
var VRSTE = { bug: 'Something is wrong', idea: 'Idea', like: 'I like it', dislike: 'I don\'t like it' };

/** Ime lista za povratne informacije prema jeziku aplikacije. */
function imeListaPovratne(jezik) {
  var j = String(jezik || '').toLowerCase().slice(0, 2);
  return 'Feedback – ' + (JEZICI[j] || (j ? j.toUpperCase() : JEZICI.sr));
}

/** Svaka ćelija: skraćena, a vrednost koja počinje sa = + - @ dobija ' ispred da nikad ne postane formula. */
function ocistiCeliju(v, max) {
  var s = v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  s = s.slice(0, max || MAX_CELIJA);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function napraviList(tabela, ime, zaglavlje) {
  var list = tabela.getSheetByName(ime);
  if (!list) list = tabela.insertSheet(ime);
  if (list.getLastRow() === 0) list.appendRow(zaglavlje);
  list.getRange(1, 1, 1, zaglavlje.length).setFontWeight('bold');
  list.setFrozenRows(1);
  return list;
}

/** Pokreni jednom posle svake izmene koda: pravi listove sa podebljanim, zamrznutim zaglavljem. */
function setup() {
  var tabela = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(JEZICI).forEach(function (j) { napraviList(tabela, imeListaPovratne(j), ZAGLAVLJE_POVRATNE); });
  napraviList(tabela, LIST_DIJAG, ZAGLAVLJE_DIJAG);
}

function doGet() {
  return ContentService.createTextOutput('Feedback endpoint OK').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var p;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (greska) { return odgovor('bad json'); }
  if (!p || typeof p !== 'object') return odgovor('bad json');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tabela = SpreadsheetApp.getActiveSpreadsheet();
    var vreme = new Date();
    if (p.kind === 'diag') {
      napraviList(tabela, LIST_DIJAG, ZAGLAVLJE_DIJAG).appendRow([
        vreme, ocistiCeliju(p.email, 320), ocistiCeliju(p.uid, 80), ocistiCeliju(p.version, 40), ocistiCeliju(p.lang, 10),
        ocistiCeliju(p.device, 600), ocistiCeliju(p.note, 5000), ocistiCeliju(p.report)
      ]);
    } else {
      var vrsta = VRSTE[p.type] ? p.type : 'idea';
      napraviList(tabela, imeListaPovratne(p.lang), ZAGLAVLJE_POVRATNE).appendRow([
        vreme, ocistiCeliju(VRSTE[vrsta], 40), ocistiCeliju(p.text, 5000), ocistiCeliju(p.email, 320), ocistiCeliju(p.uid, 80),
        ocistiCeliju(p.screen, 80), ocistiCeliju(p.version, 40), ocistiCeliju(p.device, 600), ocistiCeliju(p.tech)
      ]);
      if (vrsta === 'bug' && OBAVESTI_ZA_GRESKE) obavestiMe(tabela, p);
    }
  } finally {
    lock.releaseLock();
  }
  return odgovor('ok');
}

function obavestiMe(tabela, p) {
  try {
    var vlasnik = Session.getEffectiveUser().getEmail();
    if (!vlasnik) return;
    MailApp.sendEmail({
      to: vlasnik,
      subject: 'ZORAN: prijavljena greška (verzija ' + String(p.version || '?').slice(0, 20) + ')',
      body: String(p.text || '').slice(0, 5000) + '\n\n—\nPošiljalac: ' + (String(p.email || '').slice(0, 320) || 'bez mejla') +
        '\nEkran: ' + String(p.screen || '').slice(0, 80) + '\nVerzija: ' + String(p.version || '').slice(0, 40) +
        '\nTabela: ' + tabela.getUrl()
    });
  } catch (greska) { /* mejl nije obavezan */ }
}

function odgovor(tekst) {
  return ContentService.createTextOutput(tekst).setMimeType(ContentService.MimeType.TEXT);
}

/** Neobavezno: briše redove starije od CUVAJ_DANA. Može se pokretati jednom mesečno (Triggers → Add trigger). */
function obrisiStare() {
  var granica = new Date(Date.now() - CUVAJ_DANA * 86400000);
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (list) {
    var ime = list.getName();
    if (ime !== LIST_DIJAG && ime.indexOf('Feedback – ') !== 0) return;
    var n = list.getLastRow();
    for (var r = n; r >= 2; r--) {
      var v = list.getRange(r, 1).getValue();
      if (v instanceof Date && v < granica) list.deleteRow(r);
    }
  });
}
