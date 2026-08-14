/**
 * Rychlé testy jednotlivých částí — běží v Node, bez prohlížeče a bez sítě.
 *
 * Spuštění:  node tests/jednotky.mjs
 */

import { jeIsbn10, jeIsbn13, jeKnizniKod, isbn10Na13, naFormat, normalizuj } from '../js/isbn.js';
import { najdiIsbnVTextu } from '../js/ocr.js';
import { hledejPodleTextu, najdiKnihu } from '../js/lookup.js';
import { doCsv, opravNazvySOdznakem, slucDuplicity, SLOUPCE } from '../js/storage.js';

let selhani = 0;
const t = (ok, popis, detail = '') => {
  if (!ok) selhani++;
  console.log(`${ok ? '✓' : '✗ SELHALO'} ${popis}${detail ? ' → ' + detail : ''}`);
};
const nadpis = (text) => console.log(`\n— ${text} —`);

/* ------------------------------------------------------------- ISBN */

nadpis('ISBN');
t(jeIsbn13('9788073355067'), 'platné ISBN-13');
t(!jeIsbn13('9788073355066'), 'špatná kontrolní číslice neprojde');
t(jeIsbn10('0306406152'), 'platné ISBN-10');
t(isbn10Na13('0306406152') === '9780306406157', 'převod ISBN-10 na 13');
t(normalizuj('978-80-7335-506-7') === '9788073355067', 'pomlčky se odstraní');
t(normalizuj('nesmysl') === null, 'nesmysl se odmítne');
t(!jeKnizniKod('4006381333931'), 'EAN od potravin není kniha');

// Starší desetimístná ISBN mají kontrolní číslici 10, která se píše jako X.
// Do aplikace se dřív nedala zadat: pole mělo číselnou klávesnici, na které
// písmeno není. Ověřuje se proto celá cesta takového čísla.
t(jeIsbn10('80-7203-068-X'), 'ISBN-10 s kontrolní číslicí X');
t(normalizuj('80-7203-068-X') === '9788072030682', 'X se převede na ISBN-13',
  String(normalizuj('80-7203-068-X')));
t(normalizuj('80-7203-068-x') === '9788072030682', 'na velikosti písmene nezáleží');
t(jeKnizniKod('80-7203-068-X'), 'a je to knižní kód');
t(normalizuj('043942089X') === '9780439420891', 'zahraniční ISBN-10 s X',
  String(normalizuj('043942089X')));
t(normalizuj('80-7203-068-1') === null, 'špatná kontrolní číslice místo X neprojde');

nadpis('Dělení pomlčkami');
// Kde pomlčky patří, se řídí oficiálními rozsahy — proto konkrétní příklady
// z různých zemí i různě velkých nakladatelů.
t(naFormat('9788073355067') === '978-80-7335-506-7', 'český nakladatel',
  naFormat('9788073355067'));
t(naFormat('9780306406157') === '978-0-306-40615-7', 'anglický nakladatel',
  naFormat('9780306406157'));
t(naFormat('9788024268705') === '978-80-242-6870-5', 'Karolinum', naFormat('9788024268705'));
t(naFormat('9788090789869') === '978-80-907898-6-9', 'malý nakladatel s dlouhým číslem',
  naFormat('9788090789869'));
t(naFormat('9791234567896').startsWith('979-'), 'nepřidělený rozsah aspoň s prefixem',
  naFormat('9791234567896'));
t(normalizuj(naFormat('9788073355067')) === '9788073355067', 'zápis s pomlčkami jde načíst zpět');

/* ------------------------------- vytažení ISBN z textu rozpoznaného OCR */

nadpis('Čtení ISBN z textu');
t(najdiIsbnVTextu('2015\n1 978-80-242-6870-5\n349\n')[0] === '9788024268705',
  'skutečný výstup rozpoznávání');
t(najdiIsbnVTextu('ISBN 0-306-40615-2')[0] === '9780306406157', 'ISBN-10 se převede na 13');
t(najdiIsbnVTextu('978 80 242 6870 5')[0] === '9788024268705', 'mezery místo pomlček');
t(najdiIsbnVTextu('20159788024268705349')[0] === '9788024268705', 'číslo přilepené k jiným');
t(najdiIsbnVTextu('cena 349 Kc, rok 2015, tiraz 3000').length === 0, 'běžná čísla neprojdou');
t(najdiIsbnVTextu('9788024268704').length === 0, 'špatná kontrolní číslice neprojde');

/* --------------------------------------------------- slučování duplicit */

nadpis('Duplicity');
{
  const slouceno = slucDuplicity([
    { id: 'a', isbn: '111', nazev: 'Kniha', poznamka: 'první', kusu: 2 },
    { id: 'b', isbn: '111', nazev: '', vydavatel: 'Argo', poznamka: 'druhá', kusu: 1 },
    { id: 'c', isbn: '222', nazev: 'Jiná', kusu: 1 },
  ]);
  t(slouceno.length === 2, 'ze tří záznamů zbydou dva');
  t(slouceno[0].kusu === 3, 'kusy se sečtou');
  t(slouceno[0].nazev === 'Kniha', 'vyplněný název přebije prázdný');
  t(slouceno[0].vydavatel === 'Argo', 'doplní se údaj jen z druhého záznamu');
  t(slouceno[0].poznamka === 'první; druhá', 'poznámky se spojí');
  t(slucDuplicity([]).length === 0, 'prázdný seznam nevadí');
}

/* -------------------------------------- název pokažený odznakem s kusy */

nadpis('Odznak v názvu');
{
  const knihy = [
    { isbn: '111', nazev: '3×', kusu: 3 },
    { isbn: '222', nazev: 'Kniha z Karolina 2×', kusu: 2 },
    { isbn: '333', nazev: 'Kniha z Karolina', kusu: 2 },
    { isbn: '444', nazev: '3× Vraždy v Orient expresu', kusu: 1 },
  ];
  const opraveno = opravNazvySOdznakem(knihy);
  t(opraveno === 2, 'opraví se jen zasažené názvy', String(opraveno));
  t(knihy[0].nazev === '', 'z názvu, který byl jen odznak, zbude prázdno', `„${knihy[0].nazev}“`);
  t(knihy[1].nazev === 'Kniha z Karolina', 'jinde se odznak odřízne od názvu', knihy[1].nazev);
  t(knihy[2].nazev === 'Kniha z Karolina', 'nedotčený název zůstane');
  t(knihy[3].nazev === '3× Vraždy v Orient expresu', 'číslo uvnitř názvu se nesmí sáhnout',
    knihy[3].nazev);
}

/* ------------------------------------------------------- export do CSV */

nadpis('Export do CSV');
{
  const csv = doCsv([
    { isbn: '9788024268705', nazev: 'Kniha z Karolina', autor: 'Jan Novák', rok: '2015',
      vydavatel: 'Karolinum', poznamka: 'půjčeno Petrovi', kusu: 3, pridano: '2026-08-12',
      zdroj: 'Knihovny.cz', stran: '253', jazyk: 'cs' },
    { isbn: '9780306406157', nazev: 'Bez kusů', autor: '' },
  ]);
  const radky = csv.replace(/^﻿/, '').split('\r\n');
  const hlavicka = radky[0].split(';');
  const prvni = radky[1].split(';');
  const hodnota = (popis) => prvni[hlavicka.indexOf(popis)];

  t(csv.startsWith('﻿'), 'CSV má BOM kvůli diakritice v Excelu');
  t(hlavicka[0] === 'Unikátní identifikátor definice knihy (ISBN)',
    'první sloupec je ISBN pod názvem, který čeká import', hlavicka[0]);
  t(hlavicka[1] === 'Autor' && hlavicka[2] === 'Název', 'pak autor a název',
    hlavicka.slice(1, 3).join(', '));
  t(hlavicka.join(';') ===
      'Unikátní identifikátor definice knihy (ISBN);Autor;Název;Rok vydání (titul);' +
      'Vydavatelství (titul);Počet;Poznámka',
    'názvy sloupců odpovídají polím importu', hlavicka.join(';'));

  // Kvůli tomuhle celá změna vznikla: pod hlavičkou musí stát ten údaj,
  // který slibuje — ne třeba počet kusů v názvu.
  t(hodnota('Název') === 'Kniha z Karolina', 'pod „Název“ je název', hodnota('Název'));
  t(hodnota('Autor') === 'Jan Novák', 'pod „Autor“ je autor', hodnota('Autor'));
  t(hodnota('Počet') === '3', 'pod „Počet“ je počet kusů', hodnota('Počet'));
  t(hodnota('Rok vydání (titul)') === '2015', 'rok vydání');
  t(hodnota('Vydavatelství (titul)') === 'Karolinum', 'vydavatelství');
  t(hodnota('Poznámka') === 'půjčeno Petrovi', 'poznámka');

  // Holé třináctimístné číslo si Excel přepíše na 9,78807E+12.
  t(hodnota('Unikátní identifikátor definice knihy (ISBN)') === '978-80-242-6870-5',
    'ISBN jde do CSV s pomlčkami',
    hodnota('Unikátní identifikátor definice knihy (ISBN)'));

  t(radky[2].split(';')[hlavicka.indexOf('Počet')] === '1',
    'chybějící počet kusů znamená jeden kus', radky[2]);

  // Prázdné sloupce by při párování polí importu jen mátly.
  t(!hlavicka.includes('Zdroj údajů') && !hlavicka.includes('Přidáno'),
    'vnitřní údaje aplikace v exportu nejsou', hlavicka.join(';'));
  t(SLOUPCE.every((s) => ['isbn', 'autor', 'nazev', 'rok', 'vydavatel', 'kusu', 'poznamka']
      .includes(s.klic)),
    'exportuje se jen to, co aplikace umí vyplnit',
    SLOUPCE.map((s) => s.klic).join(', '));
  t(radky.length === 3, 'řádek na knihu a jedna hlavička', String(radky.length));
}

/* ------------------------------------------------ dohledávání ve zdrojích */

nadpis('Dohledávání knihy');
const odpoved = (data) => Promise.resolve({ ok: true, json: async () => data });
const vypadek = () => Promise.reject(new Error('síť'));

{
  // Českým katalogům chybí obálky, Open Library je má — výsledek se skládá.
  globalThis.fetch = (url) => {
    if (url.includes('knihovny.cz')) {
      return odpoved({ records: [{ title: 'Test /', authors: { primary: { 'Novák, Jan': {} } } }] });
    }
    if (url.includes('googleapis')) return vypadek();
    return odpoved({ 'ISBN:9788073355067': { title: 'Test', cover: { medium: 'https://ol/x.jpg' } } });
  };
  const kniha = await najdiKnihu('9788073355067');
  t(kniha.nazev === 'Test' && kniha.autor === 'Jan Novák', 'text z českého katalogu', kniha.autor);
  t(kniha.obalka === 'https://ol/x.jpg', 'obálka z Open Library', kniha.obalka);
  t(kniha.zdroj === 'Knihovny.cz, Open Library', 'uvedou se oba přispěvatelé', kniha.zdroj);
  t(kniha.nalezeno && !kniha.nedostupne, 'označeno jako nalezené');
  t(kniha.selhalyZdroje.length === 1, 'výpadek jednoho zdroje ostatním nevadí');
}

{
  // Českou knihu, kterou Google nezná, musí najít někdo jiný.
  globalThis.fetch = (url) =>
    url.includes('googleapis') ? vypadek()
    : url.includes('openlibrary')
      ? odpoved({ 'ISBN:9788073355067': { title: 'Česká kniha', publishers: [{ name: 'Fragment' }] } })
      : vypadek();
  const kniha = await najdiKnihu('9788073355067');
  t(kniha.nazev === 'Česká kniha' && kniha.vydavatel === 'Fragment',
    'výpadek Google nezablokuje ostatní zdroje');
}

{
  globalThis.fetch = () => vypadek();
  const kniha = await najdiKnihu('9788073355067');
  t(!kniha.nalezeno && kniha.nedostupne, 'úplný výpadek se pozná od nenalezení');
}

{
  globalThis.fetch = (url) =>
    odpoved(url.includes('googleapis') ? { totalItems: 0 } : url.includes('openlibrary') ? {} : []);
  const kniha = await najdiKnihu('9788073355067');
  t(!kniha.nalezeno && !kniha.nedostupne, 'databáze odpověděly, ale knihu neznají');
}

nadpis('Český katalog (Knihovny.cz)');
{
  // Odpověď má tvar, jaký vrací VuFind: autoři jako objekt s klíči podle jmen,
  // název s katalogizační interpunkcí, rozsah jako popis „253 s. : il. ; 21 cm“.
  let adresa = '';
  globalThis.fetch = (url) => {
    if (!url.includes('knihovny.cz')) return Promise.reject(new Error('jiný zdroj'));
    adresa = url;
    return odpoved({
      resultCount: 1,
      records: [{
        title: 'Tajemství staré truhly : román /',
        authors: {
          primary: { 'Svobodová, Petra, 1970-': { role: ['aut'] } },
          secondary: { 'Novák, Jan': { role: ['ill'] } },
        },
        publishers: ['Fragment,'],
        publicationDates: ['2006'],
        languages: ['cze'],
        physicalDescriptions: ['253 s. : il. ; 21 cm'],
      }],
      status: 'OK',
    });
  };

  const kniha = await najdiKnihu('9788073355067');
  t(kniha.nazev === 'Tajemství staré truhly : román', 'z názvu zmizí katalogizační lomítko',
    kniha.nazev);
  t(kniha.autor === 'Petra Svobodová, Jan Novák', 'jména se otočí a letopočty zmizí',
    kniha.autor);
  t(kniha.vydavatel === 'Fragment', 'z nakladatele zmizí koncová čárka', kniha.vydavatel);
  t(kniha.rok === '2006', 'rok vydání');
  t(kniha.stran === '253', 'počet stran se vytáhne z popisu rozsahu', kniha.stran);
  t(kniha.jazyk === 'cs', 'kód jazyka se převede z cze na cs', kniha.jazyk);
  t(kniha.zdroj === 'Knihovny.cz', 'jako zdroj je uvedený katalog', kniha.zdroj);

  t(adresa.includes('type=ISN'), 'hledá se typem pro ISBN');
  t(adresa.includes('lookfor=9788073355067'), 'hledá se podle holého čísla');
  t(adresa.includes('field%5B%5D=title') && adresa.includes('field%5B%5D=authors'),
    'vyžádaná pole jsou v dotazu — jinak by se vrátil jen identifikátor');
}

{
  // Tečka za iniciálou ke jménu patří, koncová katalogizační tečka ne.
  globalThis.fetch = (url) => url.includes('knihovny.cz')
    ? odpoved({ records: [{ title: 'Kniha', authors: { primary: { 'Novák, J.': {} } } }] })
    : Promise.reject(new Error('jiný zdroj'));
  const kniha = await najdiKnihu('9788073355067');
  t(kniha.autor === 'J. Novák', 'iniciála si nechá tečku', kniha.autor);
}

{
  // Instituce jako autor se nesmí přehazovat.
  globalThis.fetch = (url) => url.includes('knihovny.cz')
    ? odpoved({ records: [{ title: 'Sborník', authors: { primary: { 'Univerzita Karlova, Filozofická fakulta': {} } } }] })
    : Promise.reject(new Error('jiný zdroj'));
  const kniha = await najdiKnihu('9788073355067');
  t(kniha.autor === 'Univerzita Karlova, Filozofická fakulta', 'název instituce zůstane, jak je',
    kniha.autor);
}

{
  // Když katalog knihu nemá, nesmí to shodit ostatní zdroje.
  globalThis.fetch = (url) => url.includes('knihovny.cz')
    ? odpoved({ resultCount: 0, status: 'OK' })
    : url.includes('googleapis')
      ? odpoved({ items: [{ volumeInfo: { title: 'Zná to jen Google' } }] })
      : Promise.reject(new Error('jiný zdroj'));
  const kniha = await najdiKnihu('9788073355067');
  t(kniha.nazev === 'Zná to jen Google', 'prázdný výsledek katalogu nevadí ostatním');
}

nadpis('Náhradní obálka');
{
  const { nahradniObalka } = await import('../js/lookup.js');
  // Bez default=false vrací Open Library u neznámé knihy průhledný 1×1 px,
  // který se tváří jako úspěšně načtený obrázek.
  t(nahradniObalka('9788073355067').includes('default=false'),
    'u neznámé knihy se vyžádá poctivá chyba, ne prázdný obrázek');
  t(nahradniObalka('9788073355067').includes('9788073355067'), 'adresa obsahuje ISBN');
}

nadpis('Hlášení o zdrojích');
{
  // Přesně situace pozorovaná na telefonu: jeden zdroj odpoví a knihu nezná,
  // dva selžou — a je potřeba vědět které a proč, ne jen kolik.
  globalThis.fetch = (url) => {
    if (url.includes('knihovny.cz')) return odpoved({ resultCount: 0 });
    if (url.includes('openlibrary')) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.reject(Object.assign(new Error('přerušeno'), { name: 'AbortError' }));
  };
  const kniha = await najdiKnihu('9788073355067');
  t(kniha.selhalyZdroje.includes('Open Library (nedostupný)'),
    'zablokované spojení se pojmenuje', kniha.selhalyZdroje.join(', '));
  t(kniha.selhalyZdroje.includes('Google Books (nestihl odpovědět)'),
    'vypršení času se pojmenuje', kniha.selhalyZdroje.join(', '));
  t(!kniha.nedostupne, 'a nehlásí se úplný výpadek, když jeden zdroj odpověděl');
}

{
  // Vyčerpaná kvóta Google Books je běžný stav a nesmí vypadat jako chyba sítě.
  globalThis.fetch = () => Promise.resolve({ ok: false, status: 429 });
  const kniha = await najdiKnihu('9788073355067');
  t(kniha.selhalyZdroje.every((z) => z.includes('vyčerpaný limit dotazů')),
    'limit dotazů se popíše lidsky, ne jako HTTP 429', kniha.selhalyZdroje[0]);
}

{
  globalThis.fetch = () => Promise.resolve({ ok: false, status: 503 });
  const kniha = await najdiKnihu('9788073355067');
  t(kniha.selhalyZdroje[0].includes('HTTP 503'), 'jiné chyby serveru se ukážou i s kódem',
    kniha.selhalyZdroje[0]);
}

{
  // Databáze pracují s holými číslicemi; pomlčky jsou jen pro člověka.
  const adresy = [];
  globalThis.fetch = (url) => {
    adresy.push(url);
    return odpoved({ totalItems: 0 });
  };
  await najdiKnihu('978-80-7335-506-7');
  t(adresy.every((u) => !u.includes('978-80')), 'pomlčky se do dotazů nedostanou');
  t(adresy.some((u) => u.includes('isbn%3A9788073355067')), 'Google dostane isbn:<13 číslic>');
  t(adresy.some((u) => u.includes('ISBN%3A9788073355067')), 'Open Library dostane ISBN:<13 číslic>');
  t(adresy.some((u) => u.includes('lookfor=9788073355067')), 'Knihovny.cz dostanou holé číslo');
  t(!adresy.some((u) => u.includes('obalkyknih')),
    'Obálky knih se neptáme — z prohlížeče se z nich číst nedá');
}

/* ------------------------------------- hledání podle názvu a autora */

nadpis('Hledání podle názvu a autora');
{
  const adresy = [];
  globalThis.fetch = (url) => {
    adresy.push(url);

    if (url.includes('knihovny.cz')) {
      return odpoved({ records: [
        {
          title: 'Babička : obrazy venkovského života /',
          authors: { primary: { 'Němcová, Božena, 1820-1862': {} } },
          publishers: ['Argo,'],
          publicationDates: ['2016'],
          languages: ['cze'],
          cleanIsbn: '9788025717721',
        },
        // Starší vydání ISBN nemají — nabídnout se nedá, jen spočítat.
        { title: 'Babička', authors: { primary: { 'Němcová, Božena': {} } } },
      ] });
    }

    if (url.includes('googleapis')) {
      return odpoved({ items: [{ volumeInfo: {
        title: 'Babička',
        authors: ['Božena Němcová'],
        publisher: 'Argo',
        publishedDate: '2016-01-01',
        imageLinks: { thumbnail: 'http://books.google.com/obalka.jpg' },
        industryIdentifiers: [
          { type: 'OTHER', identifier: 'XYZ12345' },
          { type: 'ISBN_13', identifier: '9788025717721' },
        ],
      } }] });
    }

    return odpoved({ docs: [{
      title: 'The Grandmother',
      author_name: ['Bozena Nemcova'],
      first_publish_year: 1891,
      publisher: ['Vitalis'],
      isbn: ['nesmysl', '9788072030682'],
      cover_i: 42,
    }] });
  };

  const { vysledky, bezIsbn, nedostupne } =
    await hledejPodleTextu({ nazev: 'Babička', autor: 'Němcová' });

  t(vysledky.length === 2, 'ze tří zdrojů zbydou dvě různé knihy', String(vysledky.length));
  t(!nedostupne, 'zdroje odpověděly');
  t(bezIsbn === 1, 'nález bez ISBN se do nabídky nedostane, ale spočítá se', String(bezIsbn));

  const [prvni, druha] = vysledky;
  t(prvni.nazev === 'Babička : obrazy venkovského života', 'český katalog je první a bez interpunkce',
    prvni.nazev);
  t(prvni.autor === 'Božena Němcová', 'jméno se otočí a letopočty zmizí', prvni.autor);
  t(prvni.isbn === '9788025717721', 'ISBN se vytáhne z pole cleanIsbn', prvni.isbn);
  t(prvni.zdroj === 'Knihovny.cz, Google Books', 'stejná kniha z více zdrojů je v nabídce jednou',
    prvni.zdroj);
  t(prvni.obalka === 'https://books.google.com/obalka.jpg',
    'a doplní se z nich, co první zdroj neměl', prvni.obalka);
  t(druha.isbn === '9788072030682', 'z hromádky čísel u díla projde jen platné ISBN', druha.isbn);
  t(druha.rok === '1891', 'rok se vezme z prvního vydání', druha.rok);

  t(adresy.some((u) => u.includes('intitle') && u.includes('inauthor')),
    'Google dostane název i autora zvlášť', adresy.find((u) => u.includes('googleapis')));
  t(adresy.some((u) => u.includes('knihovny.cz') && u.includes('type=AllFields')),
    'katalog hledá napříč poli, když je vyplněné obojí');
  t(adresy.some((u) => u.includes('field%5B%5D=cleanIsbn')),
    'a vyžádá si i ISBN — jinak by nález nešel uložit');
  t(adresy.some((u) => u.includes('openlibrary.org/search.json') && u.includes('author=')),
    'Open Library dostane autora jako vlastní parametr');
}

{
  // S jedním vyplněným polem se hledá přímo v jeho rejstříku, ne napříč vším.
  const adresy = [];
  globalThis.fetch = (url) => (adresy.push(url), odpoved({}));

  await hledejPodleTextu({ nazev: 'Babička' });
  t(adresy.some((u) => u.includes('knihovny.cz') && u.includes('type=Title')),
    'samotný název hledá katalog v názvech');

  adresy.length = 0;
  await hledejPodleTextu({ autor: 'Němcová' });
  t(adresy.some((u) => u.includes('knihovny.cz') && u.includes('type=Author')),
    'samotný autor v autorech');
}

{
  // Prázdný dotaz nemá koho obtěžovat.
  let dotazu = 0;
  globalThis.fetch = () => (dotazu++, odpoved({}));
  const { vysledky } = await hledejPodleTextu({ nazev: '  ', autor: '' });
  t(vysledky.length === 0 && dotazu === 0, 'prázdný dotaz nikam neodejde', String(dotazu));
}

{
  globalThis.fetch = () => vypadek();
  const { vysledky, nedostupne, selhalyZdroje } = await hledejPodleTextu({ nazev: 'Babička' });
  t(vysledky.length === 0 && nedostupne, 'úplný výpadek se pozná i při hledání podle názvu');
  t(selhalyZdroje.length === 3, 'a jmenují se všechny zdroje, které mlčely',
    selhalyZdroje.join(', '));
}

console.log(selhani === 0 ? '\nVŠE PROŠLO' : `\n${selhani} testů selhalo`);
process.exit(selhani ? 1 : 0);
