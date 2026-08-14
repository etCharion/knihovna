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
  // Starší kniha, jejíž desetimístné ISBN končí písmenem X: 80-7203-068-X.
  '9788072030682': {
    title: 'Kniha se starým ISBN',
    authors: ['Karel Čapek'],
    publisher: 'Talpress',
    publishedDate: '1998',
    language: 'cs',
  },
};

/** Dotazy, které aplikace poslala do Google Books — kontroluje se jejich tvar. */
const dotazyNaGoogle = [];

/**
 * Napodobuje chování služby: na `isbn:<číslo>` vrátí jednu knihu, na
 * `intitle:`/`inauthor:` všechny, na které dotaz sedí.
 */
function najdiVKnihovne(dotaz) {
  const jakoPolozka = (isbn) => ({
    volumeInfo: {
      ...KNIHOVNA[isbn],
      industryIdentifiers: [{ type: 'ISBN_13', identifier: isbn }],
    },
  });

  const cislo = dotaz.replace('isbn:', '');
  if (KNIHOVNA[cislo]) return [jakoPolozka(cislo)];

  const hledane = [...dotaz.matchAll(/(?:intitle|inauthor):"([^"]*)"/g)]
    .map((nalez) => nalez[1].toLowerCase());
  if (!hledane.length) return [];

  return Object.keys(KNIHOVNA)
    .filter((isbn) => {
      const kniha = KNIHOVNA[isbn];
      const text = [kniha.title, kniha.subtitle, ...(kniha.authors || [])].join(' ').toLowerCase();
      return hledane.every((cast) => text.includes(cast));
    })
    .map(jakoPolozka);
}

/** Vrátí knihy podle dotazu, nebo prázdný výsledek jako skutečná služba. */
function odpovezJakoGoogleBooks(route) {
  const dotaz = new URL(route.request().url()).searchParams.get('q') || '';
  dotazyNaGoogle.push(dotaz);
  const nalezene = najdiVKnihovne(dotaz);
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(nalezene.length ? { items: nalezene } : { totalItems: 0 }),
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
                    '**/api.crossref.org/**', '**/covers.openlibrary.org/**',
                    '**/books.google.com/**']) {
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
t((await prvni.locator('td').nth(1).innerText()).trim() ===
  (await stranka.evaluate(() => JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].nazev)),
  'v buňce s názvem je přesně to, co je uložené');
t((await stranka.locator('#pocet').innerText()) === '1', 'počítadlo ukazuje jednu knihu');

/* ------------------------------------------------------------ neplatný kód */

await zadejIsbn(stranka, '1234567890123');
await stranka.waitForTimeout(300);
t((await stranka.locator('#hlaska').innerText()).includes('platné ISBN'), 'neplatné ISBN se odmítne');
t(await stranka.locator('#prekryv').isHidden(), 'a nabídka se ani neotevře');
t((await stranka.locator('tbody tr').count()) === 1, 'neplatný záznam se nepřidal');

/* --------------------------------------- návrh opravy kontrolní číslice */

// Skutečný případ z používání: u 0-8006-0773-3 nesedí poslední číslice, která
// je kontrolní. Nejde o starý formát, jen o překlep — a ten se dá dopočítat.
await zadejIsbn(stranka, '0-8006-0773-3');
await stranka.waitForTimeout(300);
t((await stranka.inputValue('#vstup-isbn')) === '978-0-8006-0773-9',
  'do pole se vloží opravené číslo', await stranka.inputValue('#vstup-isbn'));
t((await stranka.locator('#stav').innerText()).includes('kontrolní'),
  'a stav vysvětlí proč', await stranka.locator('#stav').innerText());
t(await stranka.locator('#prekryv').isHidden(),
  'nabídka se neotevře — návrh musí uživatel nejdřív potvrdit');
t((await stranka.locator('tbody tr').count()) === 1, 'a do tabulky se nic nepřidalo');
await stranka.fill('#vstup-isbn', '');

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

/* ------------------------------ odznak s počtem kusů se nesmí dostat do názvu */

// Dřív se odznak kreslil dovnitř upravitelné buňky, takže se při prvním
// klepnutí uložil jako součást názvu a v exportu pak místo názvu stálo „2×“.
const nazev = prvni.locator('[data-pole=nazev]');
await nazev.click();
await stranka.locator('#hledat').click(); // odklik jinam uloží
await stranka.waitForTimeout(200);
const nazevPoKliknuti = await stranka.evaluate(() =>
  JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].nazev);
t(!nazevPoKliknuti.includes('×'), 'klepnutí do názvu tam nezapíše počet kusů', nazevPoKliknuti);
t(nazevPoKliknuti.includes('Structure and Interpretation'), 'a název zůstane celý',
  nazevPoKliknuti);
t((await stranka.locator('.odznak').innerText()) === '2×', 'odznak přitom v tabulce zůstane');

/* ------------------------------------------------------- úpravy a hledání */

// Upravitelné texty v řádku jsou název, autor, ISBN a poznámka; každý má
// v atributu data-pole, o který údaj jde.
const poznamka = prvni.locator('[data-pole=poznamka]');
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

const bunkaIsbn = prvni.locator('[data-pole=isbn]');

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

const noveIsbn = stranka.locator('tbody tr').first().locator('[data-pole=isbn]');
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

/* --------------------------------------- staré ISBN končící písmenem X */

// Od téhle chvíle se začíná s prázdnou tabulkou, ať se dá počítat s řádky.
await stranka.evaluate(() => localStorage.clear());
await stranka.reload({ waitUntil: 'networkidle' });
await stranka.locator('.rucne summary').click();

// Klávesnice je číselná, protože ISBN je skoro celé z číslic. Písmeno X na ní
// ale není, takže starší desetimístné ISBN nešlo zadat vůbec — od toho je
// přepínač. Číslo se proto ťuká po znacích jako na telefonu, ne vloží najednou.
t((await stranka.locator('#vstup-isbn').getAttribute('inputmode')) === 'numeric',
  've výchozím stavu je klávesnice číselná',
  String(await stranka.locator('#vstup-isbn').getAttribute('inputmode')));

await stranka.click('#btn-klavesnice');
t((await stranka.locator('#vstup-isbn').getAttribute('inputmode')) === 'text',
  'přepínač nabídne klávesnici s písmeny',
  String(await stranka.locator('#vstup-isbn').getAttribute('inputmode')));
t((await stranka.locator('#btn-klavesnice').getAttribute('aria-pressed')) === 'true',
  'a dá o sobě vědět i odečítači obrazovky');

await stranka.locator('#vstup-isbn').pressSequentially('80-7203-068-X');
t((await stranka.inputValue('#vstup-isbn')) === '80-7203-068-X',
  'písmeno X se dá do pole napsat', await stranka.inputValue('#vstup-isbn'));

await stranka.click('#form-rucne button[type=submit]');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-isbn').inputValue()) === '978-80-7203-068-2',
  'nabídka ukáže staré číslo převedené na ISBN-13',
  await stranka.locator('#nabidka-isbn').inputValue());
t((await stranka.locator('#nabidka-nazev').inputValue()).includes('Kniha se starým ISBN'),
  'a kniha se podle něj dohledala', await stranka.locator('#nabidka-nazev').inputValue());

await stranka.click('#btn-pridat');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
t((await stranka.locator('tbody tr').first().locator('td.isbn').innerText()) === '978-80-7203-068-2',
  'a v tabulce stojí převedená',
  await stranka.locator('tbody tr').first().locator('td.isbn').innerText());

// Zpátky na číslice, ať se dál zadává jako obvykle.
await stranka.click('#btn-klavesnice');
t((await stranka.locator('#vstup-isbn').getAttribute('inputmode')) === 'numeric',
  'přepínač jde vrátit zpátky na číslice');

/* -------------------------------------------------- časopis podle ISSN */

// Databáze, které ISSN znají, jsou v testu odstřižené — jde o to, že číslo
// projde kontrolou, uloží se ve správném tvaru a řádek vznikne.
await zadejIsbn(stranka, '0378-5955');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-isbn').inputValue()) === '0378-5955',
  'ISSN se ukazuje rozdělené uprostřed', await stranka.locator('#nabidka-isbn').inputValue());
const stavIssn = await stranka.locator('#nabidka-stav').innerText();
t(stavIssn.includes('ISSN 0378-5955'), 'a hláška mluví o ISSN, ne o ISBN', stavIssn);
t(!stavIssn.includes('Google Books') && !stavIssn.includes('Open Library'),
  'na ISSN se ptají jen zdroje, které periodika vedou', stavIssn);

// Opravit číslo jde i tady, takže i tohle pole potřebuje přepínač klávesnice.
t((await stranka.locator('#nabidka-isbn').getAttribute('inputmode')) === 'numeric',
  'pole v nabídce má taky číselnou klávesnici');
await stranka.click('#btn-klavesnice-nabidka');
t((await stranka.locator('#nabidka-isbn').getAttribute('inputmode')) === 'text',
  'a stejný přepínač na písmena');
await stranka.click('#btn-klavesnice-nabidka');

await stranka.click('#btn-pridat');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
t((await stranka.locator('tbody tr').count()) === 2, 'časopis se do tabulky přidá',
  String(await stranka.locator('tbody tr').count()));
t((await stranka.locator('tbody tr').first().locator('td.isbn').innerText()) === '0378-5955',
  'i v tabulce', await stranka.locator('tbody tr').first().locator('td.isbn').innerText());

// Čárový kód časopisu (prefix 977) je totéž ISSN — nesmí vzniknout druhý řádek.
await zadejIsbn(stranka, '9770378595002');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-isbn').inputValue()) === '0378-5955',
  'z kódu časopisu se dopočítá ISSN', await stranka.locator('#nabidka-isbn').inputValue());
t(await stranka.locator('#nabidka-upozorneni').isVisible(),
  'a nabídka upozorní, že tenhle titul už v knihovně je');

await stranka.click('#btn-pridat');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
t((await stranka.locator('tbody tr').count()) === 2, 'takže jen přibude kus',
  String(await stranka.locator('tbody tr').count()));

// Časopis dál nepotřebujeme; ať se počítají jen knihy.
stranka.once('dialog', (d) => d.accept());
await stranka.locator('tbody tr').first().locator('.ikona-tlacitko').click();
await stranka.waitForTimeout(200);
t((await stranka.locator('tbody tr').count()) === 1, 'časopis se dá smazat');

/* ------------------------------- kniha z doby před ISBN (číslo ČNB) */

// Do systému ISBN se Československo zapojilo až v roce 1989; starší knihy
// mají jen číslo České národní bibliografie. Katalogy jsou v testu odstřižené,
// jde o to, že číslo projde a řádek vznikne se správně prázdným ISBN.
await zadejIsbn(stranka, 'cnb000123456');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-isbn').inputValue()) === 'cnb000123456',
  'ČNB projde jako platné číslo', await stranka.locator('#nabidka-isbn').inputValue());

await stranka.fill('#nabidka-nazev', 'Traktor v socialistickém zemědělství');
await stranka.fill('#nabidka-rok', '1974');
await stranka.click('#btn-pridat');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });

const staraKniha = stranka.locator('tbody tr').first();
t((await staraKniha.locator('td').nth(1).innerText()).includes('Traktor'),
  'kniha bez ISBN se do tabulky uloží', await staraKniha.locator('td').nth(1).innerText());
t((await staraKniha.locator('td.isbn [data-pole=isbn]').innerText()).trim() === '',
  'pole pro ISBN u ní zůstane prázdné',
  `„${await staraKniha.locator('td.isbn [data-pole=isbn]').innerText()}“`);
t((await staraKniha.locator('td.isbn .odznak-cnb').innerText()) === 'cnb000123456',
  'a ČNB stojí vedle něj', await staraKniha.locator('td.isbn .odznak-cnb').innerText());

// Druhý sken téže knihy nesmí založit další řádek — klíčem je ČNB.
const radkuPred = await stranka.locator('tbody tr').count();
await zadejIsbn(stranka, 'cnb000123456');
await pockejNaNabidku(stranka);
t(await stranka.locator('#nabidka-upozorneni').isVisible(),
  'nabídka pozná, že tuhle knihu už knihovna má');
await stranka.click('#btn-zahodit');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
t((await stranka.locator('tbody tr').count()) === radkuPred,
  'takže druhý řádek nevznikne', String(await stranka.locator('tbody tr').count()));

// A do sloupce, který import čeká jako ISBN, se ČNB nesmí dostat.
const [exportCnb] = await Promise.all([
  stranka.waitForEvent('download'),
  stranka.click('#btn-csv'),
]);
const cestaCnb = join(DOCASNY, 'cnb.csv');
await exportCnb.saveAs(cestaCnb);
t(!readFileSync(cestaCnb, 'utf8').includes('cnb000123456'),
  'ČNB se do exportu pro knihovní systém neplete');

stranka.once('dialog', (d) => d.accept());
await staraKniha.locator('.ikona-tlacitko').click();
await stranka.waitForTimeout(200);

/* --------------------------------------- hledání podle názvu a autora */

await stranka.evaluate(() => { document.querySelector('.rucne').open = true; });
await stranka.fill('#vstup-nazev', 'Kniha');
await stranka.click('#form-podle-nazvu button[type=submit]');
await stranka.waitForSelector('#vysledky-hledani:not([hidden]) .vysledek', { timeout: 10000 });

const nalezy = stranka.locator('#vysledky-hledani .vysledek');
t((await nalezy.count()) === 2, 'podle názvu se nabídnou obě knihy, které mu odpovídají',
  String(await nalezy.count()));
t((await nalezy.first().innerText()).includes('978-80-'), 'u nálezu je vidět ISBN s pomlčkami',
  await nalezy.first().innerText());
t((await stranka.locator('#vysledky-hledani .vysledek-stav', { hasText: 'už v knihovně' })
    .count()) === 1,
  'kniha, kterou už knihovna má, je v nabídce označená');

// Autor navíc zúží nabídku — hledá se podle obojího, ne jen podle názvu.
await stranka.fill('#vstup-autor', 'Novák');
await stranka.click('#form-podle-nazvu button[type=submit]');
await stranka.waitForFunction(
  () => document.querySelectorAll('#vysledky-hledani .vysledek').length === 1,
  null, { timeout: 10000 }).catch(() => {});
t((await nalezy.count()) === 1, 's autorem zbude jediná kniha', String(await nalezy.count()));
t((await nalezy.first().innerText()).includes('Kniha z Karolina'), 'a je to ta správná',
  await nalezy.first().innerText());

const dotazyPodleNazvu = dotazyNaGoogle.filter((d) => d.includes('intitle'));
t(dotazyPodleNazvu.some((d) => d.includes('inauthor')), 'do dotazu jde název i autor',
  dotazyPodleNazvu.join(' | '));
t(dotazyPodleNazvu.every((d) => !d.includes('isbn:')), 'a nemíchá se s hledáním podle čísla');

// Klepnutí knihu rovnou neuloží — otevře nabídku předvyplněnou z nálezu.
await nalezy.first().click();
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-nazev').inputValue()).includes('Kniha z Karolina'),
  'vybraná kniha se otevře v nabídce k potvrzení',
  await stranka.locator('#nabidka-nazev').inputValue());
t((await stranka.locator('#nabidka-isbn').inputValue()) === '978-80-242-6870-5',
  'se svým ISBN', await stranka.locator('#nabidka-isbn').inputValue());

await stranka.click('#btn-pridat');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
t((await stranka.locator('#pocet').innerText()) === '2', 'po potvrzení přibude do tabulky',
  await stranka.locator('#pocet').innerText());
t((await stranka.locator('tbody tr').first().locator('td').nth(4).innerText()) === 'Karolinum',
  'a s údaji dohledanými podle čísla');
t((await nalezy.first().innerText()).includes('už v knihovně'),
  'v nabídce se hned označí jako přidaná', await nalezy.first().innerText());

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

// Systémovou nabídku sdílení test podstrčí: skutečná by čekala na obsluhu
// od operačního systému. Zachytí se, co by aplikace odeslala.
await stranka.addInitScript(() => {
  window.__sdileno = [];
  navigator.canShare = (data) => Array.isArray(data?.files) && data.files.length > 0;
  navigator.share = async (data) => {
    window.__sdileno.push({
      nazvy: data.files.map((s) => s.name),
      text: data.text,
      obsah: await Promise.all(data.files.map((s) => s.text())),
    });
  };
});

await stranka.reload({ waitUntil: 'networkidle' });

const [zalohaJson] = await Promise.all([stranka.waitForEvent('download'), stranka.click('#btn-json')]);
const cestaJson = join(DOCASNY, 'zaloha.json');
await zalohaJson.saveAs(cestaJson);
t(zalohaJson.suggestedFilename().startsWith('knihovna-'), 'záloha má datum v názvu',
  zalohaJson.suggestedFilename());

// Popis stavu se překresluje až po dotazu na vybranou složku (IndexedDB),
// takže se na něj čeká — čtení hned po stažení by ho zastihlo neaktuální.
await stranka.waitForFunction(
  () => document.querySelector('#stav-zalohy')?.textContent.includes('Poslední záloha'),
  null, { timeout: 5000 }).catch(() => {});
t((await stranka.locator('#stav-zalohy').innerText()).includes('Poslední záloha'),
  'po stažení zálohy se ukáže, kdy naposledy proběhla',
  await stranka.locator('#stav-zalohy').innerText());

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

// Hlavička se jmenuje přesně jako pole, do kterých se tabulka nahrává
// ve školním systému — jinak by se sloupce musely párovat ručně.
const hlavickaCsv = csv.replace(/^﻿/, '').split('\r\n')[0];
t(hlavickaCsv === 'Unikátní identifikátor definice knihy (ISBN);Autor;Název;' +
  'Rok vydání (titul);Vydavatelství (titul);Počet;Polička;Poznámka',
  'CSV má hlavičku s názvy polí importu, oddělenou středníky', hlavickaCsv);
t(csv.includes('"text s ; středníkem a ""uvozovkami"""'), 'CSV zaobalilo středník i uvozovky');

// Holé 13místné číslo si Excel přepíše na 9,78807E+12; s pomlčkami je to text.
const radekCsv = csv.replace(/^﻿/, '').split('\r\n')[1];
t(radekCsv.startsWith('978-80-242-6870-5;'), 'CSV má ISBN s pomlčkami, aby ho Excel nebral jako číslo',
  radekCsv.slice(0, 30));
t(!/^9788024268705/.test(radekCsv), 'a ne jako holé číslo');
t(radekCsv.includes(';Česká kniha s háčky;2015;Karolinum;3;'),
  'a údaje stojí ve sloupcích, které je slibují', radekCsv);

/* ------------------------------------------- odeslání zálohy ze systému */

t(await stranka.locator('#btn-sdilet').isVisible(),
  'tlačítko pro odeslání zálohy se objeví, když prohlížeč umí sdílet soubory');
t(await stranka.locator('#btn-email').isVisible(), 'poslání e-mailem je k dispozici vždy');

await stranka.click('#btn-sdilet');
await stranka.waitForTimeout(300);

const sdileno = await stranka.evaluate(() => window.__sdileno);
t(sdileno.length === 1, 'klepnutí otevře systémovou nabídku sdílení', String(sdileno.length));
t(sdileno[0]?.nazvy.length === 2, 'posílají se dva soubory — CSV i JSON',
  (sdileno[0]?.nazvy || []).join(', '));
t(sdileno[0]?.nazvy.every((n) => /^knihovna-\d{4}-\d{2}-\d{2}\.(csv|json)$/.test(n)),
  'soubory mají v názvu datum zálohy', (sdileno[0]?.nazvy || []).join(', '));
t(sdileno[0]?.obsah.some((o) => o.includes('háčky')),
  'odeslaná data obsahují knihy z tabulky i s diakritikou');
t(JSON.parse(sdileno[0].obsah[1])[0].isbn === '9788024268705',
  'odeslaný JSON jde přečíst zpět jako záloha');

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
const DATOVE_ZDROJE = ['googleapis.com', 'openlibrary.org', 'obalkyknih.cz',
                       'knihovny.cz', 'crossref.org'];
const zvenku = [];
strankaOcr.on('request', (r) => {
  const url = new URL(r.url());
  const jeKod = ['script', 'fetch', 'xhr', 'other'].includes(r.resourceType());
  const jeDatovyZdroj = DATOVE_ZDROJE.some((h) => url.hostname.endsWith(h));
  if (jeKod && !jeDatovyZdroj && url.origin !== new URL(ADRESA).origin) zvenku.push(url.host);
});
await strankaOcr.route('**/books/v1/volumes**', odpovezJakoGoogleBooks);
for (const vzor of ['**/openlibrary.org/**', '**/obalkyknih.cz/**', '**/knihovny.cz/**',
                    '**/api.crossref.org/**', '**/covers.openlibrary.org/**']) {
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
