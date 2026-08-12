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
  // 429 není chyba sítě ani aplikace — služba jen odmítla další dotazy.
  if (chyba?.message === 'HTTP 429') return 'vyčerpaný limit dotazů';
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

/**
 * Knihovnické katalogy zapisují název podle norem pro katalogizaci:
 * „Název : podtitul /“ — koncová interpunkce patří k záznamu, ne k titulu.
 */
function uklidNazev(text) {
  return String(text || '').replace(/\s*[/:;,]\s*$/, '').trim();
}

/**
 * Katalogy uvádějí autory jako „Novák, Jan, 1970-“. Letopočty jsou pro
 * odlišení jmenovců, do tabulky nepatří; a jméno se otočí do běžného
 * pořadí, aby sloupec vypadal stejně jako u ostatních zdrojů.
 */
function uklidAutora(jmeno) {
  let bezLet = String(jmeno || '')
    .replace(/,?\s*\d{3,4}\s*-\s*\d{0,4}\.?\s*$/, '')
    .replace(/,\s*$/, '')
    .trim();

  // Koncová tečka je katalogizační — kromě případu, kdy je to tečka
  // za iniciálou („Novák, J.“), tam ke jménu patří.
  if (bezLet.endsWith('.') && !/\p{Lu}\.$/u.test(bezLet)) {
    bezLet = bezLet.slice(0, -1).trim();
  }

  const casti = bezLet.split(',');
  if (casti.length === 2) {
    const [prijmeni, jmena] = casti.map((c) => c.trim());
    // Jen u obyčejných osobních jmen — u institucí a jmen s čárkami uvnitř ne.
    if (prijmeni && jmena && jmena.split(/\s+/).length <= 3 && !/\s/.test(prijmeni)) {
      return `${jmena} ${prijmeni}`;
    }
  }
  return bezLet;
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
 * Nepovinný klíč ke Google Books.
 *
 * Bez klíče spadají dotazy do sdílené kvóty, která bývá vyčerpaná — služba
 * pak odpovídá „HTTP 429“ a nenajde nic. Vlastní klíč je zdarma a kvótu má
 * jen pro sebe. Návod je v README v sekci „Google Books a limit dotazů“.
 *
 * Klíč tu bude veřejně vidět, což je u klíčů pro prohlížeč běžné a bezpečné
 * jedině tehdy, když se v Google Cloud omezí na vlastní doménu.
 */
const GOOGLE_KLIC = '';

/**
 * Google Books — nejširší záběr u zahraničních titulů.
 *
 * Když strukturované hledání podle ISBN nic nevrátí, zkusí se ještě totéž
 * číslo jako obyčejné klíčové slovo. U řady titulů je ISBN jen v popisu,
 * ne v rejstříku, a jinak by se nenašly.
 */
async function googleBooks(isbn) {
  const dotaz = async (q) => {
    const parametry = new URLSearchParams({ q });
    if (GOOGLE_KLIC) parametry.set('key', GOOGLE_KLIC);
    const data = await ziskej(`https://www.googleapis.com/books/v1/volumes?${parametry}`);
    return zGoogleBooks(data?.items?.[0]?.volumeInfo);
  };
  return (await dotaz(`isbn:${isbn}`)) || (await dotaz(isbn));
}

/**
 * Knihovny.cz — Centrální portál knihoven, který sdružuje katalogy zhruba
 * stovky českých knihoven včetně Národní knihovny. U českých titulů je to
 * zdaleka nejúplnější zdroj: co u nás vyšlo s ISBN, tam ve většině případů je.
 *
 * Portál běží na VuFindu, jehož API posílá hlavičku Access-Control-Allow-Origin,
 * takže se na něj dá ptát rovnou z prohlížeče. Bez výslovného výčtu polí by
 * vrátilo jen identifikátor záznamu, proto ten seznam v dotazu.
 */
async function knihovnyCz(isbn) {
  const pole = ['title', 'authors', 'publishers', 'publicationDates', 'languages',
                'physicalDescriptions'];
  const parametry = new URLSearchParams({ lookfor: isbn, type: 'ISN', limit: '1' });
  for (const p of pole) parametry.append('field[]', p);

  const data = await ziskej(`https://www.knihovny.cz/api/v1/search?${parametry}`);
  const zaznam = data?.records?.[0];
  if (!zaznam?.title) return null;

  // Autoři přicházejí jako objekt, kde klíče jsou jména: { primary: { "Novák, Jan": {…} } }
  const autori = [
    ...Object.keys(zaznam.authors?.primary || {}),
    ...Object.keys(zaznam.authors?.secondary || {}),
  ];
  // „253 s. : il. ; 21 cm“ → 253
  const stran = String(zaznam.physicalDescriptions?.[0] || '').match(/(\d+)\s*(?:s|str)\b/i);

  return {
    nazev: uklidNazev(zaznam.title),
    autor: autori.map(uklidAutora).filter(Boolean).join(', '),
    vydavatel: uklidNazev(zaznam.publishers?.[0] || ''),
    rok: rok(zaznam.publicationDates?.[0]),
    stran: stran ? stran[1] : '',
    jazyk: (zaznam.languages?.[0] || '').replace(/^cze$/, 'cs'),
    obalka: '',
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
  };
}

// Poznámka pro budoucnost: Obálky knih (obalkyknih.cz) sem nepatří, i když
// se to jako český zdroj nabízí. Z běžné webové stránky se z nich číst nedá:
// neposílají hlavičku CORS, odpovídají JSONP místo JSON a přístup pouštějí
// jen registrovaným knihovnám — na dotaz odpoví „Unknown referer. You need
// to sign up and provide your catalog URL“. Ověřeno dotazem z prohlížeče.
// Jejich data jsou dostupná knihovnám s vlastním katalogem, ne téhle aplikaci.

/**
 * Pořadí rozhoduje jen při shodě: u každého pole vyhraje první zdroj, který
 * ho vyplnil. České katalogy jsou proto první — většina skenovaných knih
 * bude česká a jejich záznamy mají správnou diakritiku i české názvy.
 */
const ZDROJE = [
  { nazev: 'Knihovny.cz', hledej: knihovnyCz },
  { nazev: 'Google Books', hledej: googleBooks },
  { nazev: 'Open Library', hledej: openLibrary },
];

/**
 * Náhradní obálka pro případ, že ji zdroj metadat nedodal.
 * Načítá se přímo do <img>, takže na ni CORS nemá vliv.
 *
 * Parametr default=false je důležitý: bez něj Open Library u neznámé knihy
 * nevrátí chybu, ale průhledný obrázek 1×1 px. Ten se načte „úspěšně“,
 * takže by se nikdy neuplatnil náhradní symbol a v tabulce by zůstalo
 * prázdné místo vypadající jako rozbitý obrázek.
 */
export function nahradniObalka(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false`;
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
