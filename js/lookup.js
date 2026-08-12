/**
 * Dohledání údajů o knize podle ISBN.
 *
 * Zdroje se zkoušejí popořadě, dokud některý nevrátí aspoň název knihy.
 * Všechny jsou veřejné, bez API klíče a posílají CORS hlavičky, takže
 * fungují přímo z prohlížeče na GitHub Pages — není potřeba žádný server.
 */

import { ocisti } from './isbn.js';

const TIMEOUT_MS = 8000;

async function ziskej(url, typ = 'json') {
  const prerus = new AbortController();
  const casovac = setTimeout(() => prerus.abort(), TIMEOUT_MS);
  try {
    const odpoved = await fetch(url, { signal: prerus.signal });
    if (!odpoved.ok) throw new Error(`HTTP ${odpoved.status}`);
    return typ === 'json' ? await odpoved.json() : await odpoved.text();
  } finally {
    clearTimeout(casovac);
  }
}

function rok(text) {
  const nalez = String(text || '').match(/\d{4}/);
  return nalez ? nalez[0] : '';
}

/** Google Books — nejlepší pokrytí u zahraničních i řady českých titulů. */
async function googleBooks(isbn) {
  const data = await ziskej(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`
  );
  const polozka = data?.items?.[0]?.volumeInfo;
  if (!polozka?.title) return null;

  return {
    nazev: [polozka.title, polozka.subtitle].filter(Boolean).join(': '),
    autor: (polozka.authors || []).join(', '),
    vydavatel: polozka.publisher || '',
    rok: rok(polozka.publishedDate),
    stran: polozka.pageCount ? String(polozka.pageCount) : '',
    jazyk: polozka.language || '',
    obalka: (polozka.imageLinks?.thumbnail || '').replace(/^http:/, 'https:'),
    zdroj: 'Google Books',
  };
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
    zdroj: 'Open Library',
  };
}

/** Obálky knih (obalkyknih.cz) — česká databáze, u tuzemských titulů často jediná. */
async function obalkyKnih(isbn) {
  const dotaz = encodeURIComponent(JSON.stringify([{ isbn }]));
  const data = await ziskej(`https://www.obalkyknih.cz/api/books?multi=${dotaz}`);
  const polozka = Array.isArray(data) ? data[0] : null;
  const bib = polozka?.bibinfo || {};
  const nazev = bib.nazev || bib.title || polozka?.title;
  if (!nazev) return null;

  return {
    nazev: String(nazev),
    autor: String(bib.autor || bib.author || ''),
    vydavatel: String(bib.nakladatel || bib.publisher || ''),
    rok: rok(bib.rok_vydani || bib.year),
    stran: '',
    jazyk: 'cs',
    obalka: polozka.cover_medium_url || polozka.cover_preview510_url || '',
    zdroj: 'Obálky knih',
  };
}

const ZDROJE = [googleBooks, openLibrary, obalkyKnih];

/**
 * Náhradní obálka pro případ, že ji zdroj metadat nedodal.
 * Načítá se přímo do <img>, takže na ni CORS nemá vliv.
 */
export function nahradniObalka(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`;
}

/**
 * Zkusí všechny zdroje a vrátí první použitelný výsledek.
 * Když nic nenajde, vrátí záznam s prázdnými poli — knihu je pak
 * možné doplnit ručně, ať se sken neztratí.
 */
export async function najdiKnihu(isbnVstup) {
  const isbn = ocisti(isbnVstup);
  const chyby = [];
  let nejakyZdrojOdpovedel = false;

  for (const zdroj of ZDROJE) {
    try {
      const vysledek = await zdroj(isbn);
      nejakyZdrojOdpovedel = true;
      if (vysledek) {
        return { ...vysledek, isbn, nalezeno: true, nedostupne: false };
      }
    } catch (chyba) {
      chyby.push(`${zdroj.name}: ${chyba.message}`);
    }
  }

  // Rozdíl je podstatný: buď knihu nikdo nezná, nebo se jen nešlo nikam dovolat
  // (vypadlá síť, vyčerpaný limit dotazů). Podle toho se pak radí uživateli.
  const nedostupne = !nejakyZdrojOdpovedel;
  console.warn(nedostupne ? 'Zdroje nedostupné' : 'Kniha nenalezena', isbn, chyby);

  return {
    isbn,
    nazev: '',
    autor: '',
    vydavatel: '',
    rok: '',
    stran: '',
    jazyk: '',
    obalka: '',
    zdroj: '',
    nalezeno: false,
    nedostupne,
  };
}
