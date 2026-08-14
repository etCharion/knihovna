/**
 * Rychlé testy jednotlivých částí — běží v Node, bez prohlížeče a bez sítě.
 *
 * Spuštění:  node tests/jednotky.mjs
 */

import { jeIsbn10, jeIsbn13, jeIssn, jeKnizniKod, isbn10Na13, issnZKodu, naFormat, navrhniOpravu,
         normalizuj, rozpoznej } from '../js/isbn.js';
import { najdiIsbnVTextu } from '../js/ocr.js';
import { hledejPodleTextu, najdiKnihu } from '../js/lookup.js';

// Ukládání i záloha pracují s localStorage prohlížeče; v Node ho zastoupí tahle
// drobná náhrada, aby šlo testovat poličky bez spouštění prohlížeče.
// Oba moduly se proto načítají až za ní — bez localStorage by při prvním
// dotazu spadly.
const pamet = new Map();
globalThis.localStorage = {
  getItem: (klic) => (pamet.has(klic) ? pamet.get(klic) : null),
  setItem: (klic, hodnota) => pamet.set(klic, String(hodnota)),
  removeItem: (klic) => pamet.delete(klic),
  clear: () => pamet.clear(),
};

const ulozne = await import('../js/storage.js');
const { doCsv, opravNazvySOdznakem, slucDuplicity, SLOUPCE } = ulozne;
const { mailtoOdkaz, popisPoctu, popisPosledniZalohy } = await import('../js/zaloha.js');

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

nadpis('ISSN a periodika');
t(jeIssn('0378-5955'), 'platné ISSN');
t(!jeIssn('0378-5956'), 'špatná kontrolní číslice neprojde');
t(jeIssn('1050-124X'), 'ISSN s kontrolní číslicí X');
t(naFormat('03785955') === '0378-5955', 'ISSN se dělí uprostřed', naFormat('03785955'));

// Čárový kód časopisu: 977 + sedm číslic ISSN + dvojčíslí varianty + kontrola.
// Kontrolní číslice ISSN v kódu není, dopočítá se.
t(issnZKodu('9770378595002') === '03785955', 'ISSN z čárového kódu časopisu',
  String(issnZKodu('9770378595002')));
t(issnZKodu('9770378595019') === '03785955', 'jiné číslo vydání dá stejné ISSN',
  String(issnZKodu('9770378595019')));
t(issnZKodu('9770378595003') === null, 'kód s rozbitou kontrolní číslicí neprojde');
t(issnZKodu('9788073355067') === null, 'knižní kód není periodikum');

nadpis('Rozpoznání čísla');
t(rozpoznej('978-80-7335-506-7')?.druh === 'kniha', 'ISBN je kniha');
t(rozpoznej('80-7203-068-X')?.kod === '9788072030682', 'staré ISBN se převede');
t(rozpoznej('0378-5955')?.druh === 'periodikum', 'ISSN je periodikum');
t(rozpoznej('9770378595002')?.kod === '03785955', 'kód časopisu se převede na ISSN');
t(rozpoznej('4006381333931') === null, 'EAN od potravin neprojde');
t(rozpoznej('nesmysl') === null, 'nesmysl neprojde');

nadpis('Návrh opravy kontrolní číslice');
// Skutečný případ z používání: 0-8006-0773-3 z knihy Childsovy Old Testament
// Theology neprojde, protože kontrolní číslice má být 2. Není to starý formát,
// jen nesedí poslední číslice — a tu jde z těch ostatních dopočítat.
t(!jeIsbn10('0-8006-0773-3'), 'chybná kontrolní číslice se pozná');
t(navrhniOpravu('0-8006-0773-3') === '9780800607739', 'a nabídne se opravené číslo',
  String(navrhniOpravu('0-8006-0773-3')));
t(naFormat(navrhniOpravu('0-8006-0773-3')) === '978-0-8006-0773-9', 'i s pomlčkami',
  naFormat(String(navrhniOpravu('0-8006-0773-3'))));
t(navrhniOpravu('0306406152') === null, 'u platného čísla se nenabízí nic');
t(navrhniOpravu('9788073355066') === '9788073355067', 'totéž u třináctimístného',
  String(navrhniOpravu('9788073355066')));
t(navrhniOpravu('0378-5956') === '03785955', 'a u ISSN', String(navrhniOpravu('0378-5956')));
t(navrhniOpravu('4006381333931') === null, 'u kódu od zboží by návrh jen mátl');
t(navrhniOpravu('1234567890123') === null, 'stejně tak u čísla bez knižního prefixu');
t(navrhniOpravu('nesmysl') === null, 'a u nesmyslu není co navrhnout');

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

{
  // Tentýž titul na dvou poličkách jsou dva výtisky na dvou místech —
  // slití by právě tu informaci, o kterou u poliček jde, zahodilo.
  const slouceno = slucDuplicity([
    { id: 'a', isbn: '111', nazev: 'Kniha', policka: 'Obývák', kusu: 1 },
    { id: 'b', isbn: '111', nazev: 'Kniha', policka: 'Ložnice', kusu: 1 },
    { id: 'c', isbn: '111', nazev: 'Kniha', policka: 'Obývák', kusu: 2 },
  ]);
  t(slouceno.length === 2, 'stejná kniha na jiné poličce zůstane zvlášť');
  t(slouceno.find((k) => k.policka === 'Obývák').kusu === 3,
    'na téže poličce se kusy sečtou');
}

/* ------------------------------------------------------------- poličky */

nadpis('Poličky');
{
  localStorage.clear();

  t(ulozne.pridejPolicku('  Obývák   dole ') === 'Obývák dole', 'název se uklidí od mezer',
    ulozne.pridejPolicku('  Obývák   dole '));
  t(ulozne.pridejPolicku('obývák dole') === 'Obývák dole',
    'polička lišící se jen velikostí písmen se nezaloží podruhé');
  t(ulozne.pridejPolicku('   ') === null, 'polička bez názvu se nezaloží');

  ulozne.pridejPolicku('Ložnice');
  t(ulozne.policky().join('|') === 'Ložnice|Obývák dole', 'seznam je seřazený česky',
    ulozne.policky().join('|'));

  // Stejný titul na dvou poličkách = dva záznamy, opakovaný sken = další kus.
  ulozne.pridej({ isbn: '9788073355067', nazev: 'Kniha', policka: 'Obývák dole' });
  ulozne.pridej({ isbn: '9788073355067', nazev: 'Kniha', policka: 'Ložnice' });
  ulozne.pridej({ isbn: '9788073355067', nazev: 'Kniha', policka: 'Ložnice' });
  t(ulozne.vsechny().length === 2, 'dvě poličky = dva záznamy');
  t(ulozne.podleIsbn('9788073355067', 'Ložnice').kusu === 2,
    'druhý sken na téže poličce přidá kus');
  t(ulozne.podleIsbn('9788073355067', 'Obývák dole').kusu === 1,
    'a druhé poličky se to netýká');
  t(ulozne.vsudePodleIsbn('9788073355067').length === 2, 'titul se najde napříč poličkami');
  t(ulozne.podleIsbn('9788073355067', 'Půda') === null, 'na jiné poličce kniha není');

  t(ulozne.obsahPolicky('Ložnice').kusu === 2, 'přehled poličky počítá kusy');
  t(ulozne.obsahPolicky('Ložnice').titulu === 1, 'a odděleně tituly');

  // Nová polička se založí i tehdy, když ji uživatel jen napíše u knihy.
  ulozne.pridej({ isbn: '9780306406157', nazev: 'Jiná', policka: 'Půda' });
  t(ulozne.policky().includes('Půda'), 'polička z nové knihy se doplní do seznamu');

  ulozne.prejmenujPolicku('Ložnice', 'Ložnice u okna');
  t(ulozne.policky().includes('Ložnice u okna') && !ulozne.policky().includes('Ložnice'),
    'přejmenování se projeví v seznamu');
  t(ulozne.podleIsbn('9788073355067', 'Ložnice u okna')?.kusu === 2,
    'a knihy se přejmenovanou poličkou nesou dál');

  // Přejmenování na už existující poličku obě slije — kniha tam nesmí být dvakrát.
  ulozne.prejmenujPolicku('Ložnice u okna', 'Obývák dole');
  t(ulozne.podleIsbn('9788073355067', 'Obývák dole')?.kusu === 3,
    'slitím poliček se kusy sečtou', String(ulozne.podleIsbn('9788073355067', 'Obývák dole')?.kusu));
  t(ulozne.vsudePodleIsbn('9788073355067').length === 1, 'a zbyde jediný záznam');

  const dotcenych = ulozne.smazPolicku('Obývák dole');
  t(dotcenych === 1, 'zrušení poličky ohlásí, kolika knih se to týká');
  t(ulozne.vsechny().length === 2, 'knihy se zrušením poličky nemažou');
  t(ulozne.podleIsbn('9788073355067', '')?.kusu === 3, 'jen zůstanou bez zařazení');
  t(!ulozne.policky().includes('Obývák dole'), 'a polička ze seznamu zmizí');

  // Aktivní polička se drží mezi skeny; po zrušení nesmí zůstat viset.
  ulozne.nastavAktivniPolicku('Půda');
  t(ulozne.aktivniPolicka() === 'Půda', 'aktivní polička se pamatuje');
  ulozne.smazPolicku('Půda');
  t(ulozne.aktivniPolicka() === '', 'po zrušení se aktivní polička uvolní');
}

{
  // Záloha z jiného telefonu přinese poličky jen u knih — musí se dopočítat.
  localStorage.clear();
  ulozne.importuj([
    { isbn: '9788073355067', nazev: 'Kniha', policka: 'Chodba', kusu: 1 },
    { isbn: '9788073355067', nazev: 'Kniha', policka: 'Sklep', kusu: 1 },
  ]);
  t(ulozne.vsechny().length === 2, 'import rozliší tentýž titul na dvou poličkách');
  t(ulozne.policky().join('|') === 'Chodba|Sklep', 'poličky ze zálohy se doplní do seznamu',
    ulozne.policky().join('|'));

  const znovu = ulozne.importuj([{ isbn: '9788073355067', nazev: 'Kniha', policka: 'Sklep' }]);
  t(znovu === 0, 'opakovaný import téhož záznamu nic nepřidá');
  localStorage.clear();
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
  // Prázdné úložiště znamená, že se ještě nezálohovalo.
  localStorage.clear();
  t(popisPosledniZalohy(3).includes('ještě nedělali'), 'nezálohovaná tabulka to řekne',
    popisPosledniZalohy(3));
  t(popisPosledniZalohy(0).includes('prázdná'), 'u prázdné tabulky se nestraší',
    popisPosledniZalohy(0));
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
      zdroj: 'Knihovny.cz', stran: '253', jazyk: 'cs', policka: 'Obývák dole' },
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
      'Vydavatelství (titul);Počet;Polička;Poznámka',
    'názvy sloupců odpovídají polím importu', hlavicka.join(';'));

  // Kvůli tomuhle celá změna vznikla: pod hlavičkou musí stát ten údaj,
  // který slibuje — ne třeba počet kusů v názvu.
  t(hodnota('Název') === 'Kniha z Karolina', 'pod „Název“ je název', hodnota('Název'));
  t(hodnota('Autor') === 'Jan Novák', 'pod „Autor“ je autor', hodnota('Autor'));
  t(hodnota('Počet') === '3', 'pod „Počet“ je počet kusů', hodnota('Počet'));
  t(hodnota('Rok vydání (titul)') === '2015', 'rok vydání');
  t(hodnota('Vydavatelství (titul)') === 'Karolinum', 'vydavatelství');
  t(hodnota('Polička') === 'Obývák dole', 'polička, aby se kniha dala najít na místě',
    hodnota('Polička'));
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
  t(SLOUPCE.every((s) =>
      ['isbn', 'autor', 'nazev', 'rok', 'vydavatel', 'kusu', 'policka', 'poznamka']
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

    if (url.includes('crossref')) {
      return odpoved({ message: { items: [
        // Crossref je hlavně na články — do nabídky nesmí.
        { type: 'journal-article', title: ['Božena Němcová a babička v kultuře'],
          ISSN: ['0378-5955'] },
        { type: 'monograph', title: ['Babička'], author: [{ given: 'Božena', family: 'Němcová' }],
          publisher: 'Vitalis', issued: { 'date-parts': [[2019]] }, ISBN: ['9788072030682'] },
      ] } });
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

  const { vysledky, bezCisla, nedostupne } =
    await hledejPodleTextu({ nazev: 'Babička', autor: 'Němcová' });

  t(vysledky.length === 2, 'ze čtyř zdrojů zbydou dvě různé knihy', String(vysledky.length));
  t(!nedostupne, 'zdroje odpověděly');
  t(bezCisla === 1, 'nález bez čísla se do nabídky nedostane, ale spočítá se', String(bezCisla));

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
  t(druha.rok === '2019', 'u sloučeného nálezu vyhraje rok od vydavatele z Crossrefu', druha.rok);
  t(druha.zdroj === 'Crossref, Open Library', 'a uvedou se oba zdroje', druha.zdroj);
  t(!vysledky.some((k) => k.nazev.includes('v kultuře')),
    'článek z časopisu se mezi knihy neplete',
    vysledky.map((k) => k.nazev).join(' | '));

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
  t(selhalyZdroje.length === 4, 'a jmenují se všechny zdroje, které mlčely',
    selhalyZdroje.join(', '));
}

/* ----------------------------------- dohledání periodika podle ISSN */

nadpis('Dohledání periodika');
{
  const adresy = [];
  globalThis.fetch = (url) => {
    adresy.push(url);
    if (url.includes('knihovny.cz')) {
      return odpoved({ records: [{
        title: 'Respekt /',
        publishers: ['R-Presse,'],
        publicationDates: ['1990'],
        languages: ['cze'],
      }] });
    }
    if (url.includes('crossref')) {
      return odpoved({ message: { title: 'Respekt', publisher: 'R-Presse' } });
    }
    return vypadek();
  };

  const casopis = await najdiKnihu('0378-5955');
  t(casopis.nazev === 'Respekt', 'časopis se najde podle ISSN', casopis.nazev);
  t(casopis.isbn === '03785955', 'a uloží se pod normalizovaným ISSN', casopis.isbn);
  t(casopis.selhalyZdroje.length === 0,
    'Google Books ani Open Library se na ISSN neptáme — ISSN neznají',
    casopis.selhalyZdroje.join(', '));
  t(!adresy.some((u) => u.includes('googleapis') || u.includes('openlibrary')),
    'takže tam žádný dotaz neodejde', adresy.join(' | '));
  t(adresy.some((u) => u.includes('lookfor=03785955') && u.includes('type=ISN')),
    'katalog dostane ISSN do rejstříku ISN');
  t(adresy.some((u) => u.includes('/journals/03785955')),
    'Crossref se ptá na záznam časopisu, ne na jeho články', adresy.join(' | '));
}

{
  // Skener chytí čárový kód časopisu (prefix 977), ne přímo ISSN.
  const adresy = [];
  globalThis.fetch = (url) => (adresy.push(url), odpoved({}));
  await najdiKnihu('9770378595002');
  t(adresy.every((u) => u.includes('03785955')), 'z kódu časopisu se dopočítá ISSN',
    adresy.join(' | '));
}

{
  // Neznámé ISSN vrací Crossref stavem 404 — to není výpadek zdroje.
  globalThis.fetch = (url) => url.includes('crossref')
    ? Promise.resolve({ ok: false, status: 404 })
    : odpoved({});
  const casopis = await najdiKnihu('0378-5955');
  t(!casopis.nalezeno && !casopis.nedostupne && casopis.selhalyZdroje.length === 0,
    'stav 404 znamená „neznám“, ne „nedostupný“', casopis.selhalyZdroje.join(', '));
}

nadpis('Crossref u knih');
{
  const adresy = [];
  globalThis.fetch = (url) => {
    adresy.push(url);
    if (!url.includes('crossref')) return vypadek();
    return odpoved({ message: { items: [
      // Kapitoly sdílejí ISBN s celou knihou — název kapitoly do tabulky nepatří.
      { type: 'book-chapter', title: ['Kapitola třetí'], ISBN: ['9780306406157'] },
      { type: 'monograph', title: ['Structure and Interpretation of Computer Programs'],
        author: [{ given: 'Harold', family: 'Abelson' }, { given: 'Gerald Jay', family: 'Sussman' }],
        publisher: 'MIT Press', issued: { 'date-parts': [[1996, 7, 25]] },
        ISBN: ['9780306406157'] },
    ] } });
  };

  const kniha = await najdiKnihu('9780306406157');
  t(kniha.nazev === 'Structure and Interpretation of Computer Programs',
    'z Crossrefu se bere kniha, ne kapitola z ní', kniha.nazev);
  t(kniha.autor === 'Harold Abelson, Gerald Jay Sussman', 'jména se poskládají', kniha.autor);
  t(kniha.rok === '1996', 'rok z pole issued', kniha.rok);
  t(kniha.vydavatel === 'MIT Press', 'vydavatel');
  t(adresy.some((u) => u.includes('filter=isbn%3A9780306406157')), 'hledá se podle ISBN');
  t(adresy.some((u) => u.includes('select=')), 'a vyžádají se jen potřebná pole — jinak by ' +
    'odpověď táhla i seznamy citací');
}

{
  // Open Library má dva rejstříky a neshodnou se; když mlčí první, zkusí se druhý.
  const adresy = [];
  globalThis.fetch = (url) => {
    adresy.push(url);
    if (url.includes('search.json')) {
      return odpoved({ docs: [{ title: 'Jen v rejstříku', author_name: ['Někdo'],
                                isbn: ['9780306406157'] }] });
    }
    if (url.includes('openlibrary')) return odpoved({});
    return vypadek();
  };
  const kniha = await najdiKnihu('9780306406157');
  t(kniha.nazev === 'Jen v rejstříku', 'druhý rejstřík Open Library zabere', kniha.nazev);
  t(adresy.some((u) => u.includes('search.json') && u.includes('isbn=9780306406157')),
    'a ptá se přímo na ISBN');
}

console.log(selhani === 0 ? '\nVŠE PROŠLO' : `\n${selhani} testů selhalo`);
process.exit(selhani ? 1 : 0);
