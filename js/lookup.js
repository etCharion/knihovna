/**
 * Dohledání údajů o titulu — podle ISBN nebo ISSN, nebo podle názvu a autora.
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

import { jeIssn, jeKnizniKod, normalizuj, normalizujCnb, normalizujIssn, ocisti,
         rozpoznej } from './isbn.js';

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

/**
 * Kolik nálezů se bere z každého zdroje a kolik se jich nakonec nabídne.
 *
 * Hledání podle názvu vrací i desítky vydání téhož titulu; delší seznam už
 * na telefonu není k přečtení a vybrat se z něj stejně nedá.
 */
const NALEZU_ZE_ZDROJE = 10;
const NALEZU_CELKEM = 15;

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

/**
 * Totéž, ale „nemám takový záznam“ není chyba.
 *
 * Některá API odpovídají na neznámé číslo stavem 404 místo prázdného
 * výsledku. Bez tohohle rozlišení by se to uživateli hlásilo jako výpadek
 * zdroje, což je něco úplně jiného.
 */
async function ziskejNeboNic(url) {
  try {
    return await ziskej(url);
  } catch (chyba) {
    if (chyba?.message === 'HTTP 404') return null;
    throw chyba;
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

/**
 * Vybere z nabízených identifikátorů první, který je opravdu knižní ISBN.
 *
 * Zdroje jich u jednoho záznamu uvádějí několik (ISBN-10 i ISBN-13, občas
 * i kód od zboží nebo hloupost), takže se prostě vezme první, který projde
 * kontrolní číslicí. Desetimístné se převede na třináctimístné.
 */
function prvniIsbn(kandidati) {
  for (const kandidat of [].concat(kandidati || [])) {
    if (jeKnizniKod(kandidat)) return normalizuj(kandidat);
  }
  return '';
}

/** Totéž pro periodika. */
function prvniIssn(kandidati) {
  for (const kandidat of [].concat(kandidati || [])) {
    const issn = normalizujIssn(kandidat);
    if (issn) return issn;
  }
  return '';
}

/**
 * A totéž pro číslo České národní bibliografie u knih z doby před ISBN.
 *
 * Bere se z pole, o kterém se ví, že v něm ČNB je, takže se tu smí být
 * shovívavější než u ručně zadaného čísla: katalogy ho uvádějí jednou
 * s předponou (`cnb000123456`), jindy jako holé číslo. Předpona se v tom
 * druhém případě doplní — jinak by číslo propadlo a kniha by se nedala
 * nabídnout, přestože ji katalog identifikovat umí.
 */
function prvniCnb(kandidati) {
  for (const kandidat of [].concat(kandidati || [])) {
    const text = String(kandidat ?? '').trim();
    const cnb = normalizujCnb(text) || normalizujCnb(`cnb${text}`);
    if (cnb) return cnb;
  }
  return '';
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

/** Google Books — nejširší záběr u zahraničních titulů. */
async function googleBooksDotaz(q, maxResults = 1) {
  const parametry = new URLSearchParams({ q, maxResults: String(maxResults) });
  if (GOOGLE_KLIC) parametry.set('key', GOOGLE_KLIC);
  const data = await ziskej(`https://www.googleapis.com/books/v1/volumes?${parametry}`);
  return data?.items || [];
}

/**
 * Když strukturované hledání podle ISBN nic nevrátí, zkusí se ještě totéž
 * číslo jako obyčejné klíčové slovo. U řady titulů je ISBN jen v popisu,
 * ne v rejstříku, a jinak by se nenašly.
 */
async function googleBooks(isbn) {
  const podle = async (q) => zGoogleBooks((await googleBooksDotaz(q))[0]?.volumeInfo);
  return (await podle(`isbn:${isbn}`)) || (await podle(isbn));
}

/**
 * Hledání podle názvu a autora v Google Books.
 *
 * Uvozovky drží víceslovný název pohromadě — bez nich by `intitle:Babička
 * Němcová` znamenalo „v názvu Babička a kdekoliv Němcová“.
 */
async function googleBooksPodleTextu({ nazev, autor }) {
  const vUvozovkach = (text) => `"${text.replace(/"/g, ' ').trim()}"`;
  const casti = [];
  if (nazev) casti.push(`intitle:${vUvozovkach(nazev)}`);
  if (autor) casti.push(`inauthor:${vUvozovkach(autor)}`);

  const polozky = await googleBooksDotaz(casti.join(' '), NALEZU_ZE_ZDROJE);
  return polozky.map((polozka) => {
    const kniha = zGoogleBooks(polozka?.volumeInfo);
    if (!kniha) return null;
    const cisla = (polozka.volumeInfo.industryIdentifiers || []).map((i) => i.identifier);
    return { ...kniha, isbn: prvniIsbn(cisla) };
  }).filter(Boolean);
}

/**
 * Knihovny.cz — Centrální portál knihoven, který sdružuje katalogy zhruba
 * stovky českých knihoven včetně Národní knihovny. U českých titulů je to
 * zdaleka nejúplnější zdroj: co u nás vyšlo s ISBN, tam ve většině případů je.
 *
 * Portál běží na VuFindu, jehož API posílá hlavičku Access-Control-Allow-Origin,
 * takže se na něj dá ptát rovnou z prohlížeče. Bez výslovného výčtu polí by
 * vrátilo jen identifikátor záznamu, proto ten seznam v každém dotazu.
 */
/*
 * Poslední tři jsou číslo národní bibliografie (u nás ČNB) — jediné číslo,
 * které mají i knihy vydané před rokem 1989. Pod jakým jménem ho tenhle
 * katalog vydává, se nedalo ověřit, proto se říká o víc variant najednou:
 * neplatná jména polí VuFind mlčky přeskočí, takže dotaz navíc nic nestojí.
 */
const POLE_KNIHOVNY = ['title', 'authors', 'publishers', 'publicationDates', 'languages',
                       'physicalDescriptions', 'cleanIsbn', 'isbns', 'cleanIssn', 'issns',
                       'nbn', 'cleanNbn', 'nbns'];

async function knihovnyCzDotaz(lookfor, type, limit) {
  const parametry = new URLSearchParams({ lookfor, type, limit: String(limit) });
  for (const p of POLE_KNIHOVNY) parametry.append('field[]', p);

  const data = await ziskej(`https://www.knihovny.cz/api/v1/search?${parametry}`);
  return data?.records || [];
}

function zKnihovnyCz(zaznam) {
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

/**
 * Rejstřík `ISN` obsahuje ISBN i ISSN, takže na obojí stačí jeden dotaz.
 * ČNB v něm ale není — to se hledá napříč poli.
 */
async function knihovnyCz(kod) {
  const [zaznam] = await knihovnyCzDotaz(kod, normalizujCnb(kod) ? 'AllFields' : 'ISN', 1);
  return zKnihovnyCz(zaznam);
}

/**
 * Hledání podle názvu a autora v Knihovnách.cz.
 *
 * Katalog má pro každé pole vlastní rejstřík, takže když je vyplněné jen
 * jedno, ptáme se přesně do něj (`Title`, `Author`). Na obojí najednou
 * rejstřík není — tam se hledá napříč všemi poli.
 */
async function knihovnyCzPodleTextu({ nazev, autor }) {
  const { lookfor, type } =
    nazev && autor ? { lookfor: `${nazev} ${autor}`, type: 'AllFields' }
    : nazev ? { lookfor: nazev, type: 'Title' }
    : { lookfor: autor, type: 'Author' };

  const zaznamy = await knihovnyCzDotaz(lookfor, type, NALEZU_ZE_ZDROJE);
  return zaznamy.map((zaznam) => {
    const kniha = zKnihovnyCz(zaznam);
    if (!kniha) return null;
    // Co je: ISBN u novějších knih, ISSN u periodik, ČNB u toho, co vyšlo
    // před rokem 1989. Pořadí je od nejsdělnějšího čísla k tomu poslednímu.
    const isbn = prvniIsbn(zaznam.cleanIsbn || zaznam.isbns);
    const issn = prvniIssn(zaznam.cleanIssn || zaznam.issns);
    const cnb = prvniCnb(zaznam.nbn ?? zaznam.cleanNbn ?? zaznam.nbns);
    return { ...kniha, isbn: isbn || issn, cnb: isbn || issn ? '' : cnb };
  }).filter(Boolean);
}

/**
 * Crossref — rejstřík, do kterého odevzdávají metadata sami vydavatelé.
 *
 * Je tu kvůli zahraničním titulům. Google Books je zná, ale bez vlastního
 * klíče často odmítne odpovědět kvůli vyčerpané kvótě, a české katalogy mají
 * cizí knihy jen tehdy, když je nějaká knihovna u nás koupila. Crossref je
 * proti tomu zdarma, bez klíče, bez kvóty a jeho záznamy jsou od vydavatelů,
 * takže nakladatel a rok bývají přesné. Nejsilnější je u odborných knih.
 *
 * Rejstřík je hlavně na články, proto se ze všeho berou jen záznamy typu
 * kniha — jinak by se do nabídky pletly jednotlivé studie z časopisů.
 */
const CROSSREF = 'https://api.crossref.org';

/** Jen tahle pole, jinak odpověď táhne i celé seznamy citací. */
const CROSSREF_POLE = 'title,author,publisher,issued,ISBN,type';

const CROSSREF_TYPY_KNIH = ['book', 'monograph', 'edited-book', 'reference-book', 'book-set'];

function zCrossref(polozka) {
  if (!polozka?.title?.length) return null;

  const jmena = (polozka.author || [])
    .map((clovek) => [clovek.given, clovek.family].filter(Boolean).join(' ') || clovek.name || '')
    .filter(Boolean);

  return {
    nazev: polozka.title[0],
    autor: jmena.join(', '),
    vydavatel: polozka.publisher || '',
    rok: rok(polozka.issued?.['date-parts']?.[0]?.[0]),
    stran: '',
    jazyk: '',
    obalka: '',
  };
}

async function crossrefKnihy(parametry) {
  parametry.set('select', CROSSREF_POLE);
  const data = await ziskej(`${CROSSREF}/works?${parametry}`);
  return (data?.message?.items || []).filter((p) => CROSSREF_TYPY_KNIH.includes(p?.type));
}

async function crossref(kod) {
  // Periodikum má v Crossrefu vlastní záznam, ne jen jednotlivé články v něm.
  if (jeIssn(kod)) {
    const data = await ziskejNeboNic(`${CROSSREF}/journals/${encodeURIComponent(kod)}`);
    const casopis = data?.message;
    if (!casopis?.title) return null;
    return {
      nazev: casopis.title,
      autor: '',
      vydavatel: casopis.publisher || '',
      rok: '',
      stran: '',
      jazyk: '',
      obalka: '',
    };
  }

  // Podle ISBN odpovídá i kapitolami z téže knihy, proto se bere víc záznamů
  // a vybere se z nich ten, který je knihou.
  const knihy = await crossrefKnihy(new URLSearchParams({ filter: `isbn:${kod}`, rows: '5' }));
  return zCrossref(knihy[0]);
}

async function crossrefPodleTextu({ nazev, autor }) {
  const parametry = new URLSearchParams({ rows: String(NALEZU_ZE_ZDROJE) });
  if (nazev) parametry.set('query.bibliographic', nazev);
  if (autor) parametry.set('query.author', autor);

  const knihy = await crossrefKnihy(parametry);
  return knihy.map((polozka) => {
    const kniha = zCrossref(polozka);
    if (!kniha) return null;
    return { ...kniha, isbn: prvniIsbn(polozka.ISBN) };
  }).filter(Boolean);
}

/** Open Library — dobrý doplněk, hlavně u starších a anglických knih. */
async function openLibraryPodleIsbn(isbn) {
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
 * Open Library má dva rejstříky a neshodnou se: řada vydání, o kterých
 * `api/books` mlčí, ve vyhledávacím rejstříku je. Když první nic nevrátí,
 * zkusí se proto ještě druhý — stejná úvaha jako u Google Books.
 */
async function openLibrary(isbn) {
  const zApi = await openLibraryPodleIsbn(isbn);
  if (zApi) return zApi;

  const [zRejstriku] = await openLibraryRejstrik(new URLSearchParams({ isbn, limit: '1' }));
  return zRejstriku || null;
}

/**
 * Hledání podle názvu a autora v Open Library.
 *
 * Odpověď je tu na úrovni díla, ne konkrétního vydání: rok je rok prvního
 * vydání a pole `isbn` obsahuje čísla všech vydání dohromady. Vybrané ISBN
 * tedy nemusí patřit k roku a nakladateli, které se u nálezu ukazují — po
 * výběru se proto údaje ještě jednou dohledají podle samotného čísla.
 */
async function openLibraryRejstrik(parametry) {
  parametry.set('fields', 'title,subtitle,author_name,first_publish_year,publisher,isbn,language,cover_i');

  const data = await ziskej(`https://openlibrary.org/search.json?${parametry}`);
  return (data?.docs || [])
    .filter((dokument) => dokument?.title)
    .map((dokument) => ({
      nazev: [dokument.title, dokument.subtitle].filter(Boolean).join(': '),
      autor: (dokument.author_name || []).join(', '),
      vydavatel: (dokument.publisher || [])[0] || '',
      rok: rok(dokument.first_publish_year),
      stran: '',
      jazyk: (dokument.language || [])[0] || '',
      obalka: dokument.cover_i
        ? `https://covers.openlibrary.org/b/id/${dokument.cover_i}-M.jpg`
        : '',
      isbn: prvniIsbn(dokument.isbn),
    }));
}

async function openLibraryPodleTextu({ nazev, autor }) {
  const parametry = new URLSearchParams({ limit: String(NALEZU_ZE_ZDROJE) });
  if (nazev) parametry.set('title', nazev);
  if (autor) parametry.set('author', autor);
  return openLibraryRejstrik(parametry);
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
 *
 * `cisla` říká, na co se daného zdroje má vůbec smysl ptát. Google Books ani
 * Open Library neznají ani ISSN, ani ČNB, takže se jich na ně neptáme — jinak
 * by jen zdržely a v hlášce se objevily jako zdroj, který nic nenašel. ČNB
 * přiděluje česká Národní knihovna, takže tomu rozumí jen český katalog.
 */
const ZDROJE = [
  {
    nazev: 'Knihovny.cz',
    cisla: ['ISBN', 'ISSN', 'ČNB'],
    hledej: knihovnyCz,
    hledejText: knihovnyCzPodleTextu,
  },
  {
    nazev: 'Google Books',
    cisla: ['ISBN'],
    hledej: googleBooks,
    hledejText: googleBooksPodleTextu,
  },
  {
    nazev: 'Crossref',
    cisla: ['ISBN', 'ISSN'],
    hledej: crossref,
    hledejText: crossrefPodleTextu,
  },
  {
    nazev: 'Open Library',
    cisla: ['ISBN'],
    hledej: openLibrary,
    hledejText: openLibraryPodleTextu,
  },
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
 * Zeptá se zdrojů a poskládá z odpovědí jeden záznam. Ptají se jen ty, které
 * o daný druh čísla vůbec zavadí — u ISSN je to jiná sestava než u ISBN.
 *
 * Když se titul nenajde, vrátí prázdná pole i s informací, jestli zdroje
 * mlčely (výpadek sítě, vyčerpaný limit dotazů), nebo odpověděly, že ho
 * neznají. To jsou dvě různé situace a uživatel k nim potřebuje jinou radu.
 */
export async function najdiKnihu(kodVstup) {
  const rozpoznane = rozpoznej(kodVstup);
  const isbn = rozpoznane?.kod || ocisti(kodVstup);
  const jeCnbCislo = rozpoznane?.cislo === 'ČNB';
  const zdroje = ZDROJE.filter((zdroj) => zdroj.cisla.includes(rozpoznane?.cislo || 'ISBN'));

  const odpovedi = await Promise.allSettled(zdroje.map((zdroj) => zdroj.hledej(isbn)));

  const kniha = Object.fromEntries(POLE.map((pole) => [pole, '']));
  const prispeli = [];
  const selhaly = [];
  let nekdoOdpovedel = false;

  odpovedi.forEach((odpoved, poradi) => {
    const zdroj = zdroje[poradi];

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
    console.warn('Titul nenalezen', isbn, { selhaly, odpovedeloZdroju: prispeli.length });
  }

  return {
    ...kniha,
    // ČNB do sloupce ISBN nepatří — má vlastní pole a sloupec ISBN u takové
    // knihy zůstává prázdný, aby ho import knihovního systému nepotkal.
    isbn: jeCnbCislo ? '' : isbn,
    cnb: jeCnbCislo ? isbn : '',
    nalezeno,
    nedostupne: !nekdoOdpovedel,
    zdroj: prispeli.join(', '),
    selhalyZdroje: selhaly,
  };
}

/**
 * Najde tituly podle názvu, autora, nebo obojího.
 *
 * Na rozdíl od hledání podle čísla tu není jedna správná odpověď — vrací se
 * proto nabídka, ze které si uživatel vybere. Záznamy o témže titulu se z více
 * zdrojů slučují podle čísla, takže se jeden titul v nabídce neopakuje.
 *
 * Nabízí se všechno, co se našlo — i knihy úplně bez čísla. Starší české
 * tituly ISBN nemají, ČNB u nich katalog uvádí jen někdy a zahraniční
 * databáze ho neznají vůbec; kdyby se takové nálezy zahazovaly, nešly by
 * do knihovny vůbec dostat. Kde číslo je, slučují se podle něj záznamy
 * o témž titulu z více zdrojů; kde není, stojí každý nález sám za sebe —
 * není totiž podle čeho poznat, že jde o tutéž knihu.
 */
export async function hledejPodleTextu({ nazev = '', autor = '' } = {}) {
  const dotaz = { nazev: nazev.trim(), autor: autor.trim() };
  const prazdno = { vysledky: [], selhalyZdroje: [], nedostupne: false };
  if (!dotaz.nazev && !dotaz.autor) return prazdno;

  const odpovedi = await Promise.allSettled(ZDROJE.map((zdroj) => zdroj.hledejText(dotaz)));

  const podleCisla = new Map();
  const nabidka = [];
  const selhaly = [];
  let nekdoOdpovedel = false;

  odpovedi.forEach((odpoved, poradi) => {
    const zdroj = ZDROJE[poradi];

    if (odpoved.status === 'rejected') {
      selhaly.push(`${zdroj.nazev} (${popisChyby(odpoved.reason)})`);
      console.warn(`Zdroj ${zdroj.nazev} při hledání podle názvu selhal:`, odpoved.reason);
      return;
    }
    nekdoOdpovedel = true;

    for (const nalez of odpoved.value || []) {
      const cislo = nalez.isbn || nalez.cnb;

      // Bez čísla nejde poznat, že už tenhle titul v nabídce je — nález
      // se proto přidá zvlášť a se žádným jiným se neslučuje.
      if (!cislo) {
        nabidka.push({ ...nalez, zdroje: [zdroj.nazev] });
        continue;
      }

      const drivejsi = podleCisla.get(cislo);
      if (!drivejsi) {
        const zaznam = { ...nalez, zdroje: [zdroj.nazev] };
        podleCisla.set(cislo, zaznam);
        nabidka.push(zaznam);
        continue;
      }
      // Stejný titul z dalšího zdroje jen doplní, co u toho prvního chybí.
      for (const pole of POLE) {
        if (!drivejsi[pole] && nalez[pole]) drivejsi[pole] = nalez[pole];
      }
      // Jeden zdroj umí totéž číslo vrátit víckrát (různá vydání téhož titulu).
      if (!drivejsi.zdroje.includes(zdroj.nazev)) drivejsi.zdroje.push(zdroj.nazev);
    }
  });

  const vysledky = nabidka
    .slice(0, NALEZU_CELKEM)
    .map(({ zdroje, ...kniha }) => ({ ...kniha, zdroj: zdroje.join(', ') }));

  return { vysledky, selhalyZdroje: selhaly, nedostupne: !nekdoOdpovedel };
}
