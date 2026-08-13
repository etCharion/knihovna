/**
 * Automatický test celé aplikace ve skutečném prohlížeči.
 *
 * Spuštění:
 *   python3 -m http.server 8765          (v kořeni projektu, v jiném okně)
 *   node tests/e2e.mjs
 *
 * Skenování se testuje „nafilmovaným“ čárovým kódem: Chromiu se místo kamery
 * podstrčí video se skutečným EAN-13 kódem, takže se ověří i čtečka.
 *
 * Dotazy do databází knih se v testu podvrhují — test tak nezávisí
 * na připojení ani na limitech cizích služeb.
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = dirname(dirname(fileURLToPath(import.meta.url)));
const ADRESA = process.env.ADRESA || 'http://localhost:8765/';
const DOCASNY = mkdtempSync(join(tmpdir(), 'knihovna-test-'));
const VIDEO = join(DOCASNY, 'carovy-kod.y4m');
const ISBN_VE_VIDEU = '9780306406157';

let selhani = 0;
const t = (ok, popis, detail = '') => {
  if (!ok) selhani++;
  console.log(`${ok ? '✓' : '✗ SELHALO'} ${popis}${detail ? ' → ' + detail : ''}`);
};

if (!existsSync(VIDEO)) {
  execFileSync('python3', [join(KOREN, 'tests', 'vytvor-testovaci-video.py'), VIDEO], {
    stdio: 'inherit',
  });
}

/**
 * Podvržené odpovědi Google Books — stejný tvar, jaký vrací služba doopravdy.
 * Každé ISBN má jinou knihu, aby šlo poznat, že se po opravě čísla údaje
 * opravdu načetly znovu.
 */
const KNIHOVNA = {
  '9780306406157': {
    title: 'Structure and Interpretation of Computer Programs',
    subtitle: 'Second Edition',
    authors: ['Harold Abelson', 'Gerald Jay Sussman'],
    publisher: 'MIT Press',
    publishedDate: '1996-07-25',
    pageCount: 657,
    language: 'en',
    imageLinks: { thumbnail: 'http://books.google.com/books/content?id=x&img=1' },
  },
  '9788024268705': {
    title: 'Kniha z Karolina',
    authors: ['Jan Novák'],
    publisher: 'Karolinum',
    publishedDate: '2015',
    language: 'cs',
  },
  // Kód z reálného skenu — hlídá se na něm dělení pomlčkami i tvar dotazu.
  '9788073355067': {
    title: 'Český titul se sedmičkovým prefixem',
    authors: ['Petra Svobodová'],
    publisher: 'Fragment',
    publishedDate: '2006',
    language: 'cs',
  },
};

/** Dotazy, které aplikace poslala do Google Books — kontroluje se jejich tvar. */
const dotazyNaGoogle = [];

/** Vrátí knihu podle ISBN v dotazu, nebo prázdný výsledek jako skutečná služba. */
function odpovezJakoGoogleBooks(route) {
  const dotaz = new URL(route.request().url()).searchParams.get('q') || '';
  dotazyNaGoogle.push(dotaz);
  const kniha = KNIHOVNA[dotaz.replace('isbn:', '')];
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(kniha ? { items: [{ volumeInfo: kniha }] } : { totalItems: 0 }),
  });
}

const prohlizec = await chromium.launch({
  channel: 'chromium', // plné Chromium; „headless shell“ neumí kameru
  args: [
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${VIDEO}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const kontext = await prohlizec.newContext({
  permissions: ['camera'],
  viewport: { width: 390, height: 844 }, // rozměry běžného telefonu
  isMobile: true,
  hasTouch: true,
});
await kontext.grantPermissions(['camera'], { origin: new URL(ADRESA).origin });

const stranka = await kontext.newPage();
const chybyKonzole = [];
stranka.on('console', (m) => m.type() === 'error' && chybyKonzole.push(m.text()));
stranka.on('pageerror', (e) => chybyKonzole.push('pageerror: ' + e.message));

await stranka.route('**/books/v1/volumes**', odpovezJakoGoogleBooks);
for (const vzor of ['**/openlibrary.org/**', '**/obalkyknih.cz/**', '**/knihovny.cz/**',
                    '**/covers.openlibrary.org/**', '**/books.google.com/**']) {
  await stranka.route(vzor, (r) => r.abort());
}

await stranka.goto(ADRESA, { waitUntil: 'networkidle' });
t((await stranka.title()).includes('Knihovna'), 'stránka se načetla');

/* --------------------------- nabídka, která čeká na potvrzení uživatele */

/** Počká, než se nabídka otevře a než v ní doběhne dohledávání údajů. */
async function pockejNaNabidku(str) {
  await str.waitForSelector('#prekryv:not([hidden])', { timeout: 10000 });
  await str.waitForFunction(() => !document.querySelector('#btn-pridat').disabled,
    null, { timeout: 20000 });
}

/** Zadá ISBN ručně — kniha se tím zatím jen nabídne, neuloží. */
async function zadejIsbn(str, isbn) {
  // Ruční zadání je schované v rozbalovacím bloku, po každém načtení zavřeném.
  await str.evaluate(() => { document.querySelector('.rucne').open = true; });
  await str.fill('#vstup-isbn', isbn);
  await str.click('#form-rucne button[type=submit]');
}

/** Celá cesta od zadání čísla po uloženou knihu. */
async function pridejRucne(str, isbn) {
  await zadejIsbn(str, isbn);
  await pockejNaNabidku(str);
  await str.click('#btn-pridat');
  await str.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
}

/* ------------------------------------------------ ruční zadání a dohledání */

await stranka.locator('.rucne summary').click();
await zadejIsbn(stranka, '978-0-306-40615-7');
await pockejNaNabidku(stranka);

t((await stranka.locator('#nabidka-isbn').inputValue()) === '978-0-306-40615-7',
  'nabídka ukáže načtené ISBN s pomlčkami', await stranka.locator('#nabidka-isbn').inputValue());
t((await stranka.locator('#nabidka-nazev').inputValue()).includes('Structure and Interpretation'),
  'nabídka ukáže dohledaný název');
t((await stranka.locator('#nabidka-autor').inputValue()).includes('Harold Abelson'),
  'i autora');
t((await stranka.locator('tbody tr').count()) === 0,
  'dokud se nepotvrdí, do tabulky se nic neuloží');

await stranka.click('#btn-pridat');
await stranka.waitForSelector('#tabulka:not([hidden]) tbody tr', { timeout: 10000 });

const prvni = stranka.locator('tbody tr').first();
t((await prvni.locator('td').nth(1).innerText()).includes('Structure and Interpretation'),
  'název se dohledal a zobrazil');
t((await prvni.locator('td').nth(2).innerText()).includes('Harold Abelson'), 'autor se dohledal');
t((await prvni.locator('td').nth(3).innerText()) === '1996', 'rok se vytáhl z data vydání');
t((await prvni.locator('td').nth(4).innerText()) === 'MIT Press', 'vydavatel');
t((await prvni.locator('td.isbn').innerText()) === '978-0-306-40615-7', 'ISBN se zobrazuje se správnými pomlčkami');
t((await stranka.locator('#pocet').innerText()) === '1', 'počítadlo ukazuje jednu knihu');

/* ------------------------------------------------------------ neplatný kód */

await zadejIsbn(stranka, '1234567890123');
await stranka.waitForTimeout(300);
t((await stranka.locator('#hlaska').innerText()).includes('platné ISBN'), 'neplatné ISBN se odmítne');
t(await stranka.locator('#prekryv').isHidden(), 'a nabídka se ani neotevře');
t((await stranka.locator('tbody tr').count()) === 1, 'neplatný záznam se nepřidal');

/* --------------------------------------- oprava čísla přímo v nabídce */

// Kvůli tomuhle celá nabídka je: skener se splete a načte jiné číslo,
// než jaké je na knize. Opravit ho musí jít dřív, než se cokoliv uloží.
await zadejIsbn(stranka, '9788073355067');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-nazev').inputValue()).includes('sedmičkovým'),
  'nabídka nejdřív ukáže knihu podle načteného čísla');

await stranka.fill('#nabidka-isbn', '978-80-242-6870-5');
await stranka.click('#btn-znovu');
await stranka.waitForFunction(
  () => document.querySelector('#nabidka-nazev').value.includes('Karolina'),
  null, { timeout: 15000 }).catch(() => {});
t((await stranka.locator('#nabidka-nazev').inputValue()).includes('Kniha z Karolina'),
  'po opravě čísla se v nabídce načtou údaje jiné knihy',
  await stranka.locator('#nabidka-nazev').inputValue());
t((await stranka.locator('#nabidka-vydavatel').inputValue()) === 'Karolinum',
  'vymění se i vydavatel');

// Zahození nesmí po sobě nic nechat.
await stranka.click('#btn-zahodit');
await stranka.waitForTimeout(200);
t(await stranka.locator('#prekryv').isHidden(), 'zahození nabídku zavře');
t((await stranka.locator('tbody tr').count()) === 1, 'a do tabulky se nic nepřidalo');

// Ruční úprava údajů v nabídce se musí uložit tak, jak ji uživatel nechal.
await zadejIsbn(stranka, '978-80-242-6870-5');
await pockejNaNabidku(stranka);
await stranka.fill('#nabidka-nazev', 'Kniha z Karolina (ručně upraveno)');
await stranka.fill('#nabidka-poznamka', 'dárek');
await stranka.click('#btn-pridat');
await stranka.waitForTimeout(300);
t((await stranka.locator('tbody tr').count()) === 2, 'potvrzená kniha přibyla');
t((await stranka.locator('tbody tr').first().locator('td').nth(1).innerText())
    .includes('ručně upraveno'),
  'uložil se název upravený v nabídce');
t(await stranka.evaluate(() =>
    JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].poznamka === 'dárek'),
  'i poznámka z nabídky');

// Uklidí se, ať následující testy pracují s jedinou knihou.
stranka.once('dialog', (d) => d.accept());
await stranka.locator('tbody tr').first().locator('.ikona-tlacitko').click();
await stranka.waitForTimeout(200);
t((await stranka.locator('tbody tr').count()) === 1, 'smazání řádku zabralo');

/* ------------------------------------------------------------- duplicita */

await zadejIsbn(stranka, ISBN_VE_VIDEU);
await pockejNaNabidku(stranka);
t(await stranka.locator('#nabidka-upozorneni').isVisible(),
  'nabídka upozorní, že tenhle titul už v knihovně je');
t((await stranka.locator('#btn-pridat').innerText()).includes('další kus'),
  'a tlačítko rovnou nabídne přidání dalšího kusu',
  await stranka.locator('#btn-pridat').innerText());

await stranka.click('#btn-pridat');
await stranka.waitForTimeout(300);
t((await stranka.locator('tbody tr').count()) === 1, 'stejná kniha nevytvoří druhý řádek');
t((await stranka.locator('.odznak').innerText()) === '2×', 'místo toho přibude kus');

/* ------------------------------------------------------- úpravy a hledání */

// Upravitelné buňky jsou název, autor, ISBN a poznámka; ISBN má vlastní
// obsluhu, takže se pro jistotu vylučuje podle třídy.
const poznamka = prvni.locator('td.upravitelne:not(.isbn)').nth(2);
await poznamka.click();
await poznamka.fill('půjčeno Petrovi');
await stranka.locator('#hledat').click(); // odklik jinam uloží
await stranka.waitForTimeout(200);
t(await stranka.evaluate(() =>
    JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].poznamka === 'půjčeno Petrovi'),
  'poznámka napsaná v tabulce se uložila');

await stranka.fill('#hledat', 'abelson');
await stranka.waitForTimeout(200);
t((await stranka.locator('tbody tr').count()) === 1, 'hledání podle autora knihu najde');
await stranka.fill('#hledat', 'nesmysl-xyz');
await stranka.waitForTimeout(200);
t((await stranka.locator('tbody tr').count()) === 0, 'hledání bez shody nic nevrátí');
await stranka.fill('#hledat', '');

/* ------------------------------------------------------- oprava ISBN */

const bunkaIsbn = prvni.locator('td.isbn');

// Neplatné číslo se musí odmítnout a v buňce zůstane to původní.
await bunkaIsbn.click();
await bunkaIsbn.fill('123');
await stranka.locator('#hledat').click();
await stranka.waitForTimeout(300);
t((await stranka.locator('#hlaska').innerText()).includes('platné ISBN'), 'neplatná oprava ISBN se odmítne');
t((await bunkaIsbn.innerText()) === '978-0-306-40615-7', 'po odmítnutí zůstane původní ISBN',
  await bunkaIsbn.innerText());

// Oprava na jinou knihu: údaje se musí načíst znovu, ne zůstat po té staré.
await bunkaIsbn.click();
await bunkaIsbn.fill('978-80-242-6870-5');
await stranka.locator('#hledat').click();
await stranka.waitForFunction(
  () => document.querySelector('tbody tr td:nth-child(2)')?.textContent.includes('Karolina'),
  null, { timeout: 10000 }).catch(() => {});
t((await prvni.locator('td').nth(1).innerText()).includes('Kniha z Karolina'),
  'po opravě ISBN se dohledaly nové údaje', await prvni.locator('td').nth(1).innerText());
t((await prvni.locator('td').nth(4).innerText()) === 'Karolinum', 'vyměnil se i vydavatel');
t(await stranka.evaluate(() => {
    const k = JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0];
    return k.isbn === '9788024268705' && k.poznamka === 'půjčeno Petrovi' && k.kusu === 2;
  }), 'oprava zachovala poznámku i počet kusů');

// Oprava na ISBN, které v tabulce už je, by dvě knihy slila v jednu.
// Nová kniha se vkládá na začátek tabulky, opravuje se tedy zase první řádek.
await pridejRucne(stranka, '9780306406157');
await stranka.waitForTimeout(300);
t((await stranka.locator('tbody tr').count()) === 2, 'do tabulky přibyla druhá kniha');

const noveIsbn = stranka.locator('tbody tr').first().locator('td.isbn');
t((await noveIsbn.innerText()) === '978-0-306-40615-7', 'nová kniha je nahoře');
await noveIsbn.click();
await noveIsbn.fill('978-80-242-6870-5');
await stranka.locator('#hledat').click();
await stranka.waitForTimeout(400);
t((await stranka.locator('#hlaska').innerText()).includes('už na téhle poličce je'),
  'oprava na už existující ISBN se odmítne');
t((await noveIsbn.innerText()) === '978-0-306-40615-7', 'a číslo zůstane nezměněné');
t((await stranka.locator('tbody tr').count()) === 2, 'nic se nesloučilo ani neztratilo');

/* ------------------------------------- konkrétní kód z reálného skenu */

// Zadává se s pomlčkami tak, jak je vytištěný na knize.
dotazyNaGoogle.length = 0;
await pridejRucne(stranka, '978-80-7335-506-7');
await stranka.waitForTimeout(300);

const ceska = stranka.locator('tbody tr').first();
t((await ceska.locator('td').nth(1).innerText()).includes('sedmičkovým'),
  '978-80-7335-506-7 projde vyhledáním', await ceska.locator('td').nth(1).innerText());
t((await ceska.locator('td.isbn').innerText()) === '978-80-7335-506-7',
  'a zobrazí se přesně tak, jak je vytištěný na knize',
  await ceska.locator('td.isbn').innerText());

// Databáze knih pomlčky neberou — do dotazu musí jít holé číslice.
t(dotazyNaGoogle.length > 0, 'dotaz do databáze odešel');
t(dotazyNaGoogle.every((d) => !d.includes('-')), 'dotaz neobsahuje pomlčky',
  dotazyNaGoogle.join(' | '));
t(dotazyNaGoogle.includes('isbn:9788073355067'), 'dotaz má tvar isbn:<13 číslic>',
  dotazyNaGoogle.join(' | '));

/* ------------------------------------------------------------- poličky */

await stranka.evaluate(() => localStorage.clear());
await stranka.reload({ waitUntil: 'networkidle' });

// Poličku jde založit rovnou z rozbalovátka u skenování.
stranka.once('dialog', (d) => d.accept('Obývák dole'));
await stranka.selectOption('#vyber-policka', { label: '➕ Nová polička…' });
await stranka.waitForTimeout(300);
t((await stranka.locator('#vyber-policka').inputValue()) === 'Obývák dole',
  'nová polička se rovnou nastaví pro skenování',
  await stranka.locator('#vyber-policka').inputValue());

await zadejIsbn(stranka, '9780306406157');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-policka').inputValue()) === 'Obývák dole',
  'nabídka předvyplní zvolenou poličku');
await stranka.click('#btn-pridat');
await stranka.waitForTimeout(300);
t((await stranka.locator('tbody tr').first().locator('.sloupec-policka select').inputValue())
    === 'Obývák dole',
  'polička se u knihy uloží');

// Tentýž titul na druhé poličce je druhý výtisk, ne duplicita.
// Druhá polička se zakládá ze správy poliček, ať se ověří i ta cesta.
await stranka.locator('.rozbalovaci summary', { hasText: 'Spravovat poličky' }).click();
stranka.once('dialog', (d) => d.accept('Ložnice'));
await stranka.click('#btn-nova-policka');
await stranka.waitForTimeout(300);
t((await stranka.locator('#seznam-policek li').count()) === 2,
  'správa poliček ukazuje obě poličky');
t((await stranka.locator('#seznam-policek .nazev-policky').first().innerText()) === 'Ložnice',
  'se jménem poličky',
  await stranka.locator('#seznam-policek .nazev-policky').first().innerText());
await zadejIsbn(stranka, '9780306406157');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-upozorneni').innerText()).includes('Obývák dole'),
  'nabídka řekne, na které poličce už titul stojí',
  await stranka.locator('#nabidka-upozorneni').innerText());
await stranka.click('#btn-pridat');
await stranka.waitForTimeout(300);
t((await stranka.locator('tbody tr').count()) === 2,
  'stejná kniha na jiné poličce dostane vlastní řádek');

await stranka.selectOption('#filtr-policka', 'Ložnice');
await stranka.waitForTimeout(200);
t((await stranka.locator('tbody tr').count()) === 1, 'filtr ukáže jen jednu poličku');
t((await stranka.locator('tbody tr').first().locator('.sloupec-policka select').inputValue())
    === 'Ložnice', 'a to tu vybranou');

await stranka.fill('#hledat', 'obývák');
await stranka.selectOption('#filtr-policka', { label: 'Všechny poličky' });
await stranka.waitForTimeout(200);
t((await stranka.locator('tbody tr').count()) === 1, 'polička se dá i vyhledat');
await stranka.fill('#hledat', '');

// Přesun knihy jinam: v tabulce, bez potvrzování.
await stranka.selectOption('#filtr-policka', 'Ložnice');
await stranka.waitForTimeout(200);
await stranka.locator('tbody tr').first().locator('.sloupec-policka select')
  .selectOption('Obývák dole');
await stranka.waitForTimeout(300);
t((await stranka.locator('#hlaska').innerText()).includes('kusy se sečetly'),
  'přesun na poličku s týmž titulem kusy sečte', await stranka.locator('#hlaska').innerText());
await stranka.selectOption('#filtr-policka', { label: 'Všechny poličky' });
await stranka.waitForTimeout(200);
t((await stranka.locator('tbody tr').count()) === 1, 'a zbyde jediný řádek');
t((await stranka.locator('.odznak').innerText()) === '2×', 'se dvěma kusy');

const [zalohaPolicky] = await Promise.all([
  stranka.waitForEvent('download'),
  stranka.click('#btn-csv'),
]);
const cestaPolicky = join(DOCASNY, 'policky.csv');
await zalohaPolicky.saveAs(cestaPolicky);
t(readFileSync(cestaPolicky, 'utf8').includes('Obývák dole'), 'polička je i v exportu CSV');

/* ------------------------------------------------------ skenování kamerou */

await stranka.evaluate(() => localStorage.clear());
await stranka.reload({ waitUntil: 'networkidle' });
await stranka.click('#btn-skenovat');
try {
  await pockejNaNabidku(stranka);
  t((await stranka.locator('#nabidka-nazev').inputValue()).includes('Structure and Interpretation'),
    'kamera přečetla čárový kód a kniha se nabídla k přidání');
  t((await stranka.locator('tbody tr').count()) === 0, 'sama se ale neuložila');
  t(await stranka.locator('#video').isVisible(), 'obraz z kamery je vidět');

  await stranka.click('#btn-pridat');
  await stranka.waitForSelector('#tabulka:not([hidden]) tbody tr', { timeout: 10000 });
  t((await prvni.locator('td').nth(1).innerText()).includes('Structure and Interpretation'),
    'po potvrzení je kniha v tabulce');
} catch {
  t(false, 'kamera přečetla čárový kód', await stranka.locator('#stav').innerText());
}

/* --------------------------------------------------- záloha, obnova, CSV */

odklikavejDialogy(stranka);

/* --------------------------------------------- úklid duplicit v datech */

// Takhle vypadají data ze zálohy z jiného telefonu nebo ze starší verze:
// tři záznamy, ale jen dvě různé knihy.
await stranka.evaluate(() => {
  localStorage.setItem('knihovna.knihy.v1', JSON.stringify([
    { id: 'a', isbn: '9788024268705', nazev: 'Kniha z Karolina', autor: 'Jan Novák',
      poznamka: 'první výtisk', kusu: 2, pridano: '2026-08-01' },
    { id: 'b', isbn: '9788024268705', nazev: '', autor: 'Jan Novák', vydavatel: 'Karolinum',
      poznamka: 'druhý výtisk', kusu: 1, pridano: '2026-08-05' },
    { id: 'c', isbn: '9780306406157', nazev: 'Jiná kniha', kusu: 1, pridano: '2026-08-06' },
  ]));
});
await stranka.reload({ waitUntil: 'networkidle' });

t((await stranka.locator('tbody tr').count()) === 2, 'duplicitní ISBN se při načtení sloučilo');
const slouceny = await stranka.evaluate(() =>
  JSON.parse(localStorage.getItem('knihovna.knihy.v1')).find((k) => k.isbn === '9788024268705'));
t(slouceny.kusu === 3, 'počty kusů se sečetly', String(slouceny.kusu));
t(slouceny.nazev === 'Kniha z Karolina', 'zachoval se vyplněný název');
t(slouceny.vydavatel === 'Karolinum', 'a doplnil se údaj, který měl jen druhý záznam');
t(slouceny.poznamka === 'první výtisk; druhý výtisk', 'obě poznámky zůstaly', slouceny.poznamka);


await stranka.evaluate(() => {
  localStorage.setItem('knihovna.knihy.v1', JSON.stringify([
    { id: 'a', isbn: '9788024268705', nazev: 'Česká kniha s háčky',
      autor: 'Jan Novák; Eva Dvořáková', rok: '2015', vydavatel: 'Karolinum',
      poznamka: 'text s ; středníkem a "uvozovkami"', kusu: 3, pridano: '2026-08-12' },
  ]));
});
await stranka.reload({ waitUntil: 'networkidle' });

const [zalohaJson] = await Promise.all([stranka.waitForEvent('download'), stranka.click('#btn-json')]);
const cestaJson = join(DOCASNY, 'zaloha.json');
await zalohaJson.saveAs(cestaJson);
t(zalohaJson.suggestedFilename().startsWith('knihovna-'), 'záloha má datum v názvu',
  zalohaJson.suggestedFilename());

const [zalohaCsv] = await Promise.all([stranka.waitForEvent('download'), stranka.click('#btn-csv')]);
const cestaCsv = join(DOCASNY, 'export.csv');
await zalohaCsv.saveAs(cestaCsv);

await stranka.click('#btn-smazat-vse');
await stranka.waitForTimeout(200);
t((await stranka.locator('tbody tr').count()) === 0, 'mazání vyprázdní tabulku');

await stranka.setInputFiles('#soubor-import', cestaJson);
await stranka.waitForTimeout(400);
t((await stranka.locator('tbody tr').count()) === 1, 'záloha se nahraje zpět');
t((await stranka.locator('tbody tr').first().locator('td').nth(1).innerText()).includes('háčky'),
  'diakritika přežila zálohu i obnovu');
t(await stranka.evaluate(() =>
    JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].kusu === 3), 'počet kusů se zachoval');

await stranka.setInputFiles('#soubor-import', cestaJson);
await stranka.waitForTimeout(400);
t((await stranka.locator('tbody tr').count()) === 1, 'opakovaný import knihu nezdvojí');

const csv = readFileSync(cestaCsv, 'utf8');
t(csv.startsWith('﻿'), 'CSV má BOM, aby Excel poznal diakritiku');
t(csv.replace(/^﻿/, '').split('\r\n')[0].startsWith('ISBN;Název;Autor'),
  'CSV má českou hlavičku oddělenou středníky');
t(csv.includes('"text s ; středníkem a ""uvozovkami"""'), 'CSV zaobalilo středník i uvozovky');

// Holé 13místné číslo si Excel přepíše na 9,78807E+12; s pomlčkami je to text.
const radekCsv = csv.replace(/^﻿/, '').split('\r\n')[1];
t(radekCsv.startsWith('978-80-242-6870-5;'), 'CSV má ISBN s pomlčkami, aby ho Excel nebral jako číslo',
  radekCsv.slice(0, 30));
t(!/^9788024268705/.test(radekCsv), 'a ne jako holé číslo');

/* ------------------------------------------------------------- offline */

await stranka.waitForTimeout(500);
await kontext.setOffline(true);
try {
  await stranka.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  t((await stranka.locator('h1').innerText()).includes('Knihovna'), 'aplikace se načte i bez signálu');
  t((await stranka.locator('tbody tr').count()) === 1, 'tabulka je offline k dispozici');
  t(await stranka.evaluate(async () => !!(await caches.match('./vendor/zxing.min.js'))),
    'čtečka kódů je uložená pro offline');
} catch (chyba) {
  t(false, 'aplikace se načte i bez signálu', chyba.message.split('\n')[0]);
}
await kontext.setOffline(false);

const vazne = chybyKonzole.filter((c) => !/favicon|net::ERR_FAILED|Failed to load resource/i.test(c));
t(vazne.length === 0, 'v konzoli nejsou chyby', vazne.join(' | '));

await prohlizec.close();

/* ------------------------------------- čtení ISBN z čísla (kniha bez kódu) */

// Falešná kamera se nastavuje při startu prohlížeče, takže druhé video
// znamená druhý prohlížeč.
const VIDEO_CISLO = join(DOCASNY, 'cislo.y4m');
if (!existsSync(VIDEO_CISLO)) {
  execFileSync('node', [join(KOREN, 'tests', 'vytvor-video-s-cislem.mjs'), VIDEO_CISLO], {
    stdio: 'inherit',
  });
}

const prohlizecOcr = await chromium.launch({
  channel: 'chromium',
  args: [
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${VIDEO_CISLO}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const kontextOcr = await prohlizecOcr.newContext({
  permissions: ['camera'],
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const strankaOcr = await kontextOcr.newPage();

// Hlídá se, odkud se tahá kód. Dotazy do databází knih a obrázky obálek
// z cizích serverů jsou v pořádku — o ty tu nejde.
const DATOVE_ZDROJE = ['googleapis.com', 'openlibrary.org', 'obalkyknih.cz', 'knihovny.cz'];
const zvenku = [];
strankaOcr.on('request', (r) => {
  const url = new URL(r.url());
  const jeKod = ['script', 'fetch', 'xhr', 'other'].includes(r.resourceType());
  const jeDatovyZdroj = DATOVE_ZDROJE.some((h) => url.hostname.endsWith(h));
  if (jeKod && !jeDatovyZdroj && url.origin !== new URL(ADRESA).origin) zvenku.push(url.host);
});
await strankaOcr.route('**/books/v1/volumes**', odpovezJakoGoogleBooks);
for (const vzor of ['**/openlibrary.org/**', '**/obalkyknih.cz/**', '**/knihovny.cz/**',
                    '**/covers.openlibrary.org/**']) {
  await strankaOcr.route(vzor, (r) => r.abort());
}

await strankaOcr.goto(ADRESA, { waitUntil: 'networkidle' });
await strankaOcr.click('#btn-skenovat');
await strankaOcr.waitForTimeout(1500);
t(await strankaOcr.locator('#btn-cislo').isVisible(), 'tlačítko pro čtení čísla se objeví s kamerou');

await strankaOcr.click('#btn-cislo');
try {
  await strankaOcr.waitForSelector('#prekryv:not([hidden])', { timeout: 60000 });
  t((await strankaOcr.locator('#nabidka-isbn').inputValue()) === '978-80-242-6870-5',
    'z vytištěného čísla se přečetlo správné ISBN',
    await strankaOcr.locator('#nabidka-isbn').inputValue());

  await strankaOcr.waitForFunction(() => !document.querySelector('#btn-pridat').disabled,
    null, { timeout: 20000 });
  await strankaOcr.click('#btn-pridat');
  await strankaOcr.waitForSelector('#tabulka:not([hidden]) tbody tr', { timeout: 10000 });
  t((await strankaOcr.locator('tbody tr').first().locator('td').nth(1).innerText())
      .includes('Kniha z Karolina'),
    'a kniha se podle něj dohledala');
} catch {
  t(false, 'z vytištěného čísla se přečetlo správné ISBN', await strankaOcr.locator('#stav').innerText());
}

// Rozpoznávání textu je přibalené — nesmí se tahat z cizího serveru.
const ciziHosty = [...new Set(zvenku)].filter((h) => !h.includes('googleapis'));
t(ciziHosty.length === 0, 'OCR se načetlo z aplikace, ne z cizího CDN', ciziHosty.join(', '));

await prohlizecOcr.close();
console.log(selhani === 0 ? '\nVŠE PROŠLO' : `\n${selhani} testů selhalo`);
process.exit(selhani ? 1 : 0);

/** Potvrzovací dialogy (mazání) v testu odklikáváme automaticky. */
function odklikavejDialogy(str) {
  str.on('dialog', (d) => d.accept());
}
