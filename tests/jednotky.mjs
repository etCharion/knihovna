/**
 * Rychlé testy jednotlivých částí — běží v Node, bez prohlížeče a bez sítě.
 *
 * Spuštění:  node tests/jednotky.mjs
 */

import { jeIsbn10, jeIsbn13, jeKnizniKod, isbn10Na13, naFormat, normalizuj } from '../js/isbn.js';
import { najdiIsbnVTextu } from '../js/ocr.js';
import { najdiKnihu } from '../js/lookup.js';
import { slucDuplicity } from '../js/storage.js';
import { mailtoOdkaz, popisPoctu, popisPosledniZalohy } from '../js/zaloha.js';

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

/* ------------------------------------------------------------- záloha */

nadpis('Záloha e-mailem');
{
  const knihy = [
    { isbn: '9788073355067', nazev: 'Tajemství staré truhly', autor: 'Petra Svobodová',
      rok: '2006', kusu: 2 },
    { isbn: '9780306406157', nazev: 'Structure and Interpretation', autor: 'Harold Abelson' },
  ];

  t(popisPoctu(knihy) === '2 knihy (3 kusů)', 'počet titulů i kusů', popisPoctu(knihy));
  t(popisPoctu([knihy[1]]) === '1 kniha', 'jedna kniha se skloňuje', popisPoctu([knihy[1]]));
  t(popisPoctu(Array(7).fill(knihy[1])) === '7 knih', 'sedm knih', popisPoctu(Array(7).fill(knihy[1])));

  const odkaz = mailtoOdkaz(knihy, 'kdosi@example.com');
  t(odkaz.startsWith('mailto:kdosi%40example.com?'), 'adresa je v odkazu', odkaz.slice(0, 40));
  t(odkaz.includes('subject=Z%C3%A1loha%20knihovny'), 'předmět zprávy');

  const telo = decodeURIComponent(new URL(odkaz).searchParams.get('body'));
  t(telo.includes('1. Tajemství staré truhly — Petra Svobodová (2006), ISBN 9788073355067, 2×'),
    'kniha je vypsaná v textu zprávy včetně počtu kusů', telo.split('\n')[3]);
  t(telo.includes('Načíst zálohu'), 'zpráva říká, jak zálohu vrátit zpět');
  t(!/[\n"]/.test(odkaz), 'v samotném odkazu nezůstaly nezakódované konce řádků');

  // Dlouhý seznam by odkaz natáhl do délky, kterou poštovní programy ořežou.
  const hodne = Array.from({ length: 400 }, (_, i) => ({
    isbn: '9788073355067', nazev: `Kniha číslo ${i}`, autor: 'Jan Novák', rok: '2020',
  }));
  const dlouhy = decodeURIComponent(new URL(mailtoOdkaz(hodne)).searchParams.get('body'));
  t(dlouhy.length < 2000, 'dlouhý seznam se zkrátí', String(dlouhy.length));
  t(/… a další \d+ knih/.test(dlouhy), 'a je vidět, kolik knih se do zprávy nevešlo');
  t(mailtoOdkaz(hodne).startsWith('mailto:?'), 'bez adresy se odkaz otevře s prázdným příjemcem');
}

nadpis('Stav zálohy');
{
  // Bez localStorage (Node) se modul chová jako při první návštěvě.
  t(popisPosledniZalohy(3).includes('ještě nedělali'), 'nezálohovaná tabulka to řekne',
    popisPosledniZalohy(3));
  t(popisPosledniZalohy(0).includes('prázdná'), 'u prázdné tabulky se nestraší',
    popisPosledniZalohy(0));
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

console.log(selhani === 0 ? '\nVŠE PROŠLO' : `\n${selhani} testů selhalo`);
process.exit(selhani ? 1 : 0);
