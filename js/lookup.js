/**
 * Dohledání údajů o knize podle ISBN.
 *
 * Zdroje se ptají všechny najednou a výsledky se slučují: jeden zná název
 * a autora, jiný má jen obálku — dohromady dají úplnější záznam, než kdyby
 * se braly popořadě a u prvního se skončilo. Výpadek jednoho zdroje navíc
 * nezastaví ostatní.
 *
 * Všechny jsou veřejné, bez API klíče a posílají CORS hlavičky, takže
 * fungují přímo z prohlížeče na GitHub Pages — není potřeba žádný server.
 *
 * Do dotazů jde ISBN vždy jako holých 13 číslic bez pomlček; s pomlčkami
 * si tyhle služby neporadí. Pomlčky jsou jen pro zobrazení uživateli.
 */

import { ocisti } from './isbn.js';

// Na mobilních datech bývají odpovědi pomalé, proto raději delší strpení.
const TIMEOUT_MS = 12000;

/**
 * Převede technickou chybu na něco, co jde ukázat uživateli.
 *
 * Rozlišuje tři případy, protože každý znamená něco jiného: server odmítl
 * (a řekl číslo), vypršel čas, nebo se spojení vůbec nenavázalo — což je
 * typicky vypadlé připojení nebo server, který prohlížeči nedovolí se zeptat.
 */
function popisChyby(chyba) {
  if (chyba?.name === 'AbortError') return 'nestihl odpovědět';
  if (chyba?.message?.startsWith('HTTP')) return chyba.message;
  return 'nedostupný';
}

/** Pole, která se z jednotlivých zdrojů skládají dohromady. */
const POLE = ['nazev', 'autor', 'vydavatel', 'rok', 'stran', 'jazyk', 'obalka'];

async function ziskej(url) {
  const prerus = new AbortController();
  const casovac = setTimeout(() => prerus.abort(), TIMEOUT_MS);
  try {
    const odpoved = await fetch(url, { signal: prerus.signal });
    if (!odpoved.ok) throw new Error(`HTTP ${odpoved.status}`);
    return await odpoved.json();
  } finally {
    clearTimeout(casovac);
  }
}

function rok(text) {
  const nalez = String(text || '').match(/\d{4}/);
  return nalez ? nalez[0] : '';
}

function zGoogleBooks(polozka) {
  if (!polozka?.title) return null;
  return {
    nazev: [polozka.title, polozka.subtitle].filter(Boolean).join(': '),
    autor: (polozka.authors || []).join(', '),
    vydavatel: polozka.publisher || '',
    rok: rok(polozka.publishedDate),
    stran: polozka.pageCount ? String(polozka.pageCount) : '',
    jazyk: polozka.language || '',
    obalka: (polozka.imageLinks?.thumbnail || '').replace(/^http:/, 'https:'),
  };
}

/**
 * Google Books — nejširší záběr.
 *
 * Když strukturované hledání podle ISBN nic nevrátí, zkusí se ještě totéž
 * číslo jako obyčejné klíčové slovo. U řady titulů (a hodně českých mezi ně
 * patří) je ISBN jen v popisu, ne v rejstříku, a jinak by se nenašly.
 */
async function googleBooks(isbn) {
  const dotaz = async (q) => {
    const data = await ziskej(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}`);
    return zGoogleBooks(data?.items?.[0]?.volumeInfo);
  };
  return (await dotaz(`isbn:${isbn}`)) || (await dotaz(isbn));
}

/** Open Library — dobrý doplněk, hlavně u starších a anglických knih. */
async function openLibrary(isbn) {
  const klic = `ISBN:${isbn}`;
  const data = await ziskej(
    `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(klic)}&format=json&jscmd=data`
  );
  const polozka = data?.[klic];
  if (!polozka?.title) return null;

  return {
    nazev: [polozka.title, polozka.subtitle].filter(Boolean).join(': '),
    autor: (polozka.authors || []).map((a) => a.name).join(', '),
    vydavatel: (polozka.publishers || []).map((v) => v.name).join(', '),
    rok: rok(polozka.publish_date),
    stran: polozka.number_of_pages ? String(polozka.number_of_pages) : '',
    jazyk: (polozka.languages || []).map((j) => j.key.split('/').pop()).join(', '),
    obalka: polozka.cover?.medium || '',
  };
}

/**
 * Obálky knih (obalkyknih.cz) — česká databáze používaná knihovnami.
 *
 * Je to hlavně zdroj obálek a obsahů, ne katalog: pole `bibinfo` v odpovědi
 * je jen opis dotazu, ne údaje o knize, takže se z něj nedá číst název.
 * Bere se odsud proto především obálka, a bibliografická pole jen tehdy,
 * když je odpověď opravdu obsahuje.
 */
async function obalkyKnih(isbn) {
  const dotaz = encodeURIComponent(JSON.stringify([{ isbn }]));
  const data = await ziskej(`https://www.obalkyknih.cz/api/books?multi=${dotaz}`);
  const polozka = Array.isArray(data) ? data[0] : null;
  if (!polozka) return null;

  const obalka =
    polozka.cover_medium_url || polozka.cover_preview510_url || polozka.cover_thumbnail_url || '';
  const nazev = polozka.nazev || polozka.title || '';
  if (!obalka && !nazev) return null;

  return {
    nazev,
    autor: polozka.autor || polozka.author || '',
    vydavatel: polozka.nakladatel || polozka.publisher || '',
    rok: rok(polozka.rok_vydani || polozka.year),
    stran: '',
    jazyk: nazev ? 'cs' : '',
    obalka,
  };
}

const ZDROJE = [
  { nazev: 'Google Books', hledej: googleBooks },
  { nazev: 'Open Library', hledej: openLibrary },
  { nazev: 'Obálky knih', hledej: obalkyKnih },
];

/**
 * Náhradní obálka pro případ, že ji zdroj metadat nedodal.
 * Načítá se přímo do <img>, takže na ni CORS nemá vliv.
 */
export function nahradniObalka(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`;
}

/**
 * Zeptá se všech zdrojů a poskládá z odpovědí jeden záznam.
 *
 * Když se kniha nenajde, vrátí prázdná pole i s informací, jestli zdroje
 * mlčely (výpadek sítě, vyčerpaný limit dotazů), nebo odpověděly, že knihu
 * neznají. To jsou dvě různé situace a uživatel k nim potřebuje jinou radu.
 */
export async function najdiKnihu(isbnVstup) {
  const isbn = ocisti(isbnVstup);

  const odpovedi = await Promise.allSettled(ZDROJE.map((zdroj) => zdroj.hledej(isbn)));

  const kniha = Object.fromEntries(POLE.map((pole) => [pole, '']));
  const prispeli = [];
  const selhaly = [];
  let nekdoOdpovedel = false;

  odpovedi.forEach((odpoved, poradi) => {
    const zdroj = ZDROJE[poradi];

    if (odpoved.status === 'rejected') {
      selhaly.push(`${zdroj.nazev} (${popisChyby(odpoved.reason)})`);
      console.warn(`Zdroj ${zdroj.nazev} selhal:`, odpoved.reason);
      return;
    }
    nekdoOdpovedel = true;
    if (!odpoved.value) return;

    let pomohl = false;
    for (const pole of POLE) {
      if (!kniha[pole] && odpoved.value[pole]) {
        kniha[pole] = odpoved.value[pole];
        pomohl = true;
      }
    }
    if (pomohl) prispeli.push(zdroj.nazev);
  });

  const nalezeno = !!kniha.nazev;
  if (!nalezeno) {
    console.warn('Kniha nenalezena', isbn, { selhaly, odpovedeloZdroju: prispeli.length });
  }

  return {
    ...kniha,
    isbn,
    nalezeno,
    nedostupne: !nekdoOdpovedel,
    zdroj: prispeli.join(', '),
    selhalyZdroje: selhaly,
  };
}
