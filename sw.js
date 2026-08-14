/**
 * Service worker — díky němu se aplikace načte i bez signálu
 * a jde přidat na plochu telefonu jako běžná appka.
 *
 * Samotné vyhledávání knih pochopitelně internet potřebuje;
 * offline funguje skenování a už uložená tabulka.
 */

const VERZE = 'knihovna-v5';

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
  './js/zaloha.js',
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

  // Cizí adresy (databáze knih, obrázky obálek) si řídí prohlížeč sám.
  // Nemá smysl je ukládat a průchod přes service worker by jen komplikoval
  // dotazy přes hranice domén.
  const url = new URL(pozadavek.url);
  if (url.origin !== self.location.origin) return;

  // Velké knihovny ve vendor/ se mění jen s novou verzí a Tesseract má sám
  // o sobě 7 MB — ty se berou z cache. Vlastní soubory aplikace jsou drobné,
  // u nich je přednější mít vždy tu nejnovější.
  udalost.respondWith(
    url.pathname.includes('/vendor/') ? zCacheNejdriv(pozadavek) : zeSiteNejdriv(pozadavek)
  );
});

/**
 * Nejdřív síť, cache až když spojení selže.
 *
 * Dřív to bylo obráceně a mělo to ošklivý důsledek: jednou uložený soubor
 * se už nikdy nenahradil, takže na telefonu běžela stará verze aplikace
 * i dlouho po vydání oprav. Tímhle pořadím se to nemůže opakovat.
 */
async function zeSiteNejdriv(pozadavek) {
  const cache = await caches.open(VERZE);
  try {
    const odpoved = await fetch(pozadavek);
    if (odpoved.ok) cache.put(pozadavek, odpoved.clone());
    return odpoved;
  } catch (chyba) {
    const ulozene = await cache.match(pozadavek);
    if (ulozene) return ulozene;
    // Offline a stránka není uložená → aspoň úvodní obrazovka.
    if (pozadavek.mode === 'navigate') {
      const nahrada = await cache.match('./index.html');
      if (nahrada) return nahrada;
    }
    throw chyba;
  }
}

async function zCacheNejdriv(pozadavek) {
  const cache = await caches.open(VERZE);
  const ulozene = await cache.match(pozadavek);
  if (ulozene) return ulozene;

  const odpoved = await fetch(pozadavek);
  if (odpoved.ok) cache.put(pozadavek, odpoved.clone());
  return odpoved;
}
