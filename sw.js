/**
 * Service worker — díky němu se aplikace načte i bez signálu
 * a jde přidat na plochu telefonu jako běžná appka.
 *
 * Samotné vyhledávání knih pochopitelně internet potřebuje;
 * offline funguje skenování a už uložená tabulka.
 */

const VERZE = 'knihovna-v3';

/**
 * Soubory aplikace — bez nich by se nespustila, proto se stahují dopředu.
 *
 * Rozpoznávání textu (vendor/tesseract/, skoro 7 MB) tu schválně není:
 * stáhne se teprve tomu, kdo si o čtení čísla řekne, a do cache se uloží
 * až tehdy — viz obsluha fetch níže.
 */
const ZAKLAD = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/isbn.js',
  './js/lookup.js',
  './js/ocr.js',
  './js/scanner.js',
  './js/storage.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/zxing.min.js',
  './vendor/isbn3.min.js',
];

self.addEventListener('install', (udalost) => {
  udalost.waitUntil(
    (async () => {
      const cache = await caches.open(VERZE);
      await cache.addAll(ZAKLAD);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (udalost) => {
  udalost.waitUntil(
    (async () => {
      const klice = await caches.keys();
      await Promise.all(klice.filter((k) => k !== VERZE).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (udalost) => {
  const pozadavek = udalost.request;
  if (pozadavek.method !== 'GET') return;

  const url = new URL(pozadavek.url);

  // Dotazy do databází knih se nikdy neberou z cache — potřebujeme čerstvá data.
  const jeApi = ['googleapis.com', 'openlibrary.org', 'obalkyknih.cz'].some((host) =>
    url.hostname.endsWith(host)
  );
  if (jeApi) return;

  udalost.respondWith(
    (async () => {
      const ulozene = await caches.match(pozadavek);
      if (ulozene) return ulozene;

      try {
        const odpoved = await fetch(pozadavek);
        // Povedené odpovědi ze stejného původu si necháme na příště.
        if (odpoved.ok && url.origin === self.location.origin) {
          const cache = await caches.open(VERZE);
          cache.put(pozadavek, odpoved.clone());
        }
        return odpoved;
      } catch (chyba) {
        // Offline a stránka není v cache → aspoň úvodní obrazovka.
        if (pozadavek.mode === 'navigate') {
          const nahrada = await caches.match('./index.html');
          if (nahrada) return nahrada;
        }
        throw chyba;
      }
    })()
  );
});
