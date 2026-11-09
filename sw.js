/* Zoran — service worker. Povećaj CACHE_VERSION pri svakoj promeni aplikacije. */
'use strict';

const CACHE_VERSION = 'zoran-v14';

// Sve putanje su relativne u odnosu na sw.js (radi i na https://bagaljivko.github.io/ZORAN/)
const FAJLOVI = [
  './',
  './index.html',
  './novosti.html',
  './privatnost.html',
  './novosti/v100-pregled.jpg',
  './novosti/v120-naslovna.jpg',
  './novosti/v120-podeli.jpg',
  './novosti/v130-pomeranje.jpg',
  './novosti/v130-unos.jpg',
  './novosti/v140-prodiranje.jpg',
  './novosti/v150-kontrolne-mere.jpg',
  './novosti/v150-napomene.jpg',
  './novosti/v150-sile.jpg',
  './novosti/v150-stampa.jpg',
  './novosti/v150-varijante.jpg',
  './novosti/v160-mastilo.jpg',
  './novosti/v170-korak0.jpg',
  './novosti/v170-predlog.jpg',
  './novosti/v180-decimale.jpg',
  './novosti/v180-osno.jpg',
  './novosti/v190-pitanje.jpg',
  './novosti/v190-utisak.jpg',
  './novosti/v1100-drive.jpg',
  './novosti/v1100-kopija.jpg',
  './novosti/v1110-drive-svi.jpg',
  './manifest.json',
  './css/zoran.css',
  './js/proracun.js',
  './js/crtez.js',
  './js/sldprt.js',
  './js/vendor/qrcode-generator.js',
  './js/podeli.js',
  './js/povratne.js',
  './js/drive.js',
  './js/app.js',
  './fonts/eb-garamond-latin-400-normal.woff2',
  './fonts/eb-garamond-latin-400-italic.woff2',
  './fonts/eb-garamond-latin-600-normal.woff2',
  './fonts/eb-garamond-latin-ext-400-normal.woff2',
  './fonts/eb-garamond-latin-ext-400-italic.woff2',
  './fonts/eb-garamond-latin-ext-600-normal.woff2',
  './fonts/eb-garamond-greek-400-normal.woff2',
  './fonts/eb-garamond-greek-400-italic.woff2',
  './fonts/eb-garamond-greek-600-normal.woff2',
  './fonts/ibm-plex-mono-latin-400-normal.woff2',
  './fonts/ibm-plex-mono-latin-ext-400-normal.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  // Ne aktivira se sam: čeka da korisnik u Podešavanjima pritisne „Osveži“
  // (pri prvoj instalaciji nema stare verzije, pa se aktivira odmah).
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(FAJLOVI.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((kljucevi) => Promise.all(
        kljucevi.filter((k) => k.startsWith('zoran-') && k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.tip === 'SKIP_WAITING') self.skipWaiting();
  if (d.tip === 'VERZIJA' && event.ports && event.ports[0]) {
    const osnova = self.registration.scope;
    event.ports[0].postMessage({ verzija: CACHE_VERSION, fajlovi: FAJLOVI.map((u) => new URL(u, osnova).href) });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigacija: tražena stranica iz keša (index.html, novosti.html…), inače index.html; radi i offline
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req, { ignoreSearch: true })
        .then((kes) => kes || fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true })))
    );
    return;
  }

  // Ostalo: prvo keš, pa mreža
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((kes) => kes || fetch(req).then((odg) => {
      if (odg && odg.ok && odg.type === 'basic') {
        const kopija = odg.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, kopija));
      }
      return odg;
    }))
  );
});
