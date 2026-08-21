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
 * `intitle:`/`inauthor:`/`inpublisher:` všechny, na které dotaz sedí.
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

  const hledane = [...dotaz.matchAll(/(intitle|inauthor|inpublisher):"([^"]*)"/g)]
    .map((nalez) => [nalez[1], nalez[2].toLowerCase()]);
  if (!hledane.length) return [];

  // Každý operátor se dívá do svého pole — jinak by `inpublisher` sedělo
  // i na knihu, která to slovo má jen v názvu, a test by nic neověřil.
  const poleProOperator = (kniha, operator) => (
    operator === 'inauthor' ? (kniha.authors || []).join(' ')
    : operator === 'inpublisher' ? (kniha.publisher || '')
    : [kniha.title, kniha.subtitle].filter(Boolean).join(' ')
  ).toLowerCase();

  return Object.keys(KNIHOVNA)
    .filter((isbn) => hledane.every(
      ([operator, cast]) => poleProOperator(KNIHOVNA[isbn], operator).includes(cast)
    ))
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

/**
 * Počká, než se nabídka otevře a než v ní doběhne dohledávání údajů.
 *
 * Čeká se na tlačítko „Vyhledat“, ne na „Přidat“: to je od té doby, co se
 * údaje vyplňují průběžně, živé po celou dobu — knihu jde potvrdit dřív,
 * než doběhne poslední databáze.
 */
async function pockejNaNabidku(str) {
  await str.waitForSelector('#prekryv:not([hidden])', { timeout: 10000 });
  await str.waitForFunction(() => !document.querySelector('#btn-znovu').disabled,
    null, { timeout: 20000 });
}

/**
 * Přepne na jednu ze tří záložek.
 *
 * Na telefonu je vidět vždycky jen jedna obrazovka, takže se test musí
 * přepnout stejně jako uživatel — jinak by klepal na skryté prvky.
 */
async function zalozka(str, cil) {
  // Otevřený spodní list překrývá i spodní lištu — uživatel by ho taky
  // nejdřív zavřel. Nabídky k potvrzení a detailu si testy řídí samy.
  for (const [list, zavrit] of [['#sheet-rucne', '#btn-rucne-zavrit'],
                                ['#sheet-policky', '#btn-policky-zavrit']]) {
    if (await str.locator(list).isVisible()) {
      await str.click(zavrit);
      await str.waitForSelector(list, { state: 'hidden', timeout: 5000 });
    }
  }
  await str.click(`#nav-${cil}`);
  await str.waitForSelector(`#obrazovka-${cil}:not([hidden])`, { timeout: 5000 });
}

/** Řádky knih v Knihovně. Poličky jsou ve výchozím stavu rozbalené. */
function knihy(str) {
  return str.locator('#skupiny-policek .polozka-radky');
}

/** Kolik knih je v Knihovně vidět. */
async function pocetKnih(str) {
  await zalozka(str, 'knihovna');
  return knihy(str).count();
}

/** Otevře detail knihy — v něm se upravuje všechno kromě názvu. */
async function otevriDetail(str, poradi = 0) {
  await zalozka(str, 'knihovna');
  await knihy(str).nth(poradi).locator('.kniha-otevrit-sipka').click();
  await str.waitForSelector('#sheet-detail:not([hidden])', { timeout: 5000 });
}

/** Zavře detail knihy tlačítkem Hotovo. */
async function zavriDetail(str) {
  await str.click('#btn-detail-hotovo');
  await str.waitForSelector('#sheet-detail', { state: 'hidden', timeout: 5000 });
}

/** Smaže knihu z Knihovny — mazání je v jejím detailu. */
async function smazKnihu(str, poradi = 0) {
  await otevriDetail(str, poradi);
  await str.click('#btn-detail-smazat');
  await str.waitForSelector('#sheet-detail', { state: 'hidden', timeout: 5000 });
}

/** Otevře spodní list s ručním zadáním ISBN. */
async function otevriRucne(str) {
  await zalozka(str, 'skener');
  await str.click('#btn-rucne-otevrit');
  await str.waitForSelector('#rucne-rezim-isbn:not([hidden])', { timeout: 5000 });
}

/** Otevře spodní list s hledáním podle názvu a dalších údajů. */
async function otevriHledaniPodleNazvu(str) {
  await zalozka(str, 'skener');
  await str.click('#btn-nazev-otevrit');
  await str.waitForSelector('#rucne-rezim-nazev:not([hidden])', { timeout: 5000 });
}

/** Zadá ISBN ručně — kniha se tím zatím jen nabídne, neuloží. */
async function zadejIsbn(str, isbn) {
  // Po každém načtení se spodní list zavře, takže se otevírá znovu.
  await otevriRucne(str);
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

await zadejIsbn(stranka, '978-0-306-40615-7');
await pockejNaNabidku(stranka);

t((await stranka.locator('#nabidka-isbn').inputValue()) === '978-0-306-40615-7',
  'nabídka ukáže načtené ISBN s pomlčkami', await stranka.locator('#nabidka-isbn').inputValue());
t((await stranka.locator('#nabidka-nazev').inputValue()).includes('Structure and Interpretation'),
  'nabídka ukáže dohledaný název');
t((await stranka.locator('#nabidka-autor').inputValue()).includes('Harold Abelson'),
  'i autora');
t(await stranka.evaluate(() => !localStorage.getItem('knihovna.knihy.v1')),
  'dokud se nepotvrdí, do knihovny se nic neuloží');

await stranka.click('#btn-pridat');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
await zalozka(stranka, 'knihovna');
await stranka.waitForSelector('#skupiny-policek .polozka-radky', { timeout: 10000 });

const prvni = knihy(stranka).first();
t((await prvni.locator('.kniha-nazev').innerText()).includes('Structure and Interpretation'),
  'název se dohledal a zobrazil');
t((await prvni.locator('.kniha-autor').innerText()).includes('Harold Abelson'), 'autor se dohledal');
t((await prvni.locator('.kniha-autor').innerText()).includes('1996'), 'rok se vytáhl z data vydání',
  await prvni.locator('.kniha-autor').innerText());
t((await prvni.locator('.kniha-autor').innerText()).includes('MIT Press'), 'vydavatel');
t((await prvni.locator('.kniha-cislo').innerText()) === '978-0-306-40615-7',
  'ISBN se zobrazuje se správnými pomlčkami', await prvni.locator('.kniha-cislo').innerText());
t((await prvni.locator('.kniha-nazev').innerText()).trim() ===
  (await stranka.evaluate(() => JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].nazev)),
  'v řádku je přesně ten název, který je uložený');
t((await stranka.locator('#pocet').innerText()) === '1 titul', 'počítadlo ukazuje jednu knihu',
  await stranka.locator('#pocet').innerText());

/* ------------------------------------------------------------ neplatný kód */

await zadejIsbn(stranka, '1234567890123');
await stranka.waitForTimeout(300);
t((await stranka.locator('#hlaska').innerText()).includes('platné ISBN'), 'neplatné ISBN se odmítne');
t(await stranka.locator('#prekryv').isHidden(), 'a nabídka se ani neotevře');
t((await pocetKnih(stranka)) === 1, 'neplatný záznam se nepřidal');

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
t((await pocetKnih(stranka)) === 1, 'a do knihovny se nic nepřidalo');
await otevriRucne(stranka);
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
t((await pocetKnih(stranka)) === 1, 'a do knihovny se nic nepřidalo');

// Ruční úprava údajů v nabídce se musí uložit tak, jak ji uživatel nechal.
await zadejIsbn(stranka, '978-80-242-6870-5');
await pockejNaNabidku(stranka);
await stranka.fill('#nabidka-nazev', 'Kniha z Karolina (ručně upraveno)');
await stranka.fill('#nabidka-poznamka', 'dárek');
await stranka.click('#btn-pridat');
await stranka.waitForTimeout(300);
t((await pocetKnih(stranka)) === 2, 'potvrzená kniha přibyla');
t((await knihy(stranka).first().locator('.kniha-nazev').innerText()).includes('ručně upraveno'),
  'uložil se název upravený v nabídce');
t(await stranka.evaluate(() =>
    JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].poznamka === 'dárek'),
  'i poznámka z nabídky');

// Uklidí se, ať následující testy pracují s jedinou knihou.
await smazKnihu(stranka);
t((await pocetKnih(stranka)) === 1, 'smazání knihy z detailu zabralo');

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
t((await pocetKnih(stranka)) === 1, 'stejná kniha nevytvoří druhý záznam');
t((await stranka.locator('.odznak-kusu-radky').innerText()) === '2×', 'místo toho přibude kus');

/* ------------------------------ odznak s počtem kusů se nesmí dostat do názvu */

// Dřív se odznak kreslil dovnitř upravitelné buňky, takže se při prvním
// klepnutí uložil jako součást názvu a v exportu pak místo názvu stálo „2×“.
const nazev = prvni.locator('.kniha-nazev');
await nazev.click();
await stranka.locator('#hledat').click(); // odklik jinam uloží
await stranka.waitForTimeout(200);
const nazevPoKliknuti = await stranka.evaluate(() =>
  JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].nazev);
t(!nazevPoKliknuti.includes('×'), 'klepnutí do názvu tam nezapíše počet kusů', nazevPoKliknuti);
t(nazevPoKliknuti.includes('Structure and Interpretation'), 'a název zůstane celý',
  nazevPoKliknuti);
t((await stranka.locator('.odznak-kusu-radky').innerText()) === '2×',
  'odznak přitom v seznamu zůstane');

/* ------------------------------------------------------- úpravy a hledání */

// Název se přepisuje rovnou v řádku, zbytek údajů v detailu knihy.
await nazev.click();
await stranka.keyboard.press('Control+a');
await stranka.keyboard.type('Structure and Interpretation of Computer Programs');
await stranka.keyboard.press('Enter');
await stranka.waitForTimeout(200);
t(await stranka.evaluate(() =>
    JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].nazev
      === 'Structure and Interpretation of Computer Programs'),
  'název přepsaný v řádku se uložil');

await otevriDetail(stranka);
await stranka.fill('#detail-poznamka', 'půjčeno Petrovi');
await zavriDetail(stranka);
await stranka.waitForTimeout(200);
t(await stranka.evaluate(() =>
    JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].poznamka === 'půjčeno Petrovi'),
  'poznámka napsaná v detailu se uložila');

await zalozka(stranka, 'knihovna');
await stranka.fill('#hledat', 'abelson');
await stranka.waitForTimeout(200);
t((await knihy(stranka).count()) === 1, 'hledání podle autora knihu najde');
await stranka.fill('#hledat', 'nesmysl-xyz');
await stranka.waitForTimeout(200);
t((await knihy(stranka).count()) === 0, 'hledání bez shody nic nevrátí');
t(await stranka.locator('#prazdno').isVisible(),
  'a řekne se, že hledání nic nenašlo — obrazovka nezůstane prázdná');
await stranka.fill('#hledat', '');

/* ------------------------------------------------------- oprava ISBN */

// Neplatné číslo se musí odmítnout a v poli zůstane to původní.
await otevriDetail(stranka);
await stranka.fill('#detail-isbn', '123');
await stranka.locator('#detail-nazev').click(); // odklik jinam uloží
await stranka.waitForTimeout(400);
t((await stranka.locator('#hlaska').innerText()).includes('platné ISBN'),
  'neplatná oprava ISBN se odmítne');
t((await stranka.inputValue('#detail-isbn')) === '978-0-306-40615-7',
  'po odmítnutí zůstane původní ISBN', await stranka.inputValue('#detail-isbn'));

// Oprava na jinou knihu: údaje se musí načíst znovu, ne zůstat po té staré.
await stranka.fill('#detail-isbn', '978-80-242-6870-5');
await stranka.locator('#detail-nazev').click();
await stranka.waitForFunction(
  () => document.querySelector('#detail-nazev')?.value.includes('Karolina'),
  null, { timeout: 10000 }).catch(() => {});
t((await stranka.inputValue('#detail-nazev')).includes('Kniha z Karolina'),
  'po opravě ISBN se dohledaly nové údaje', await stranka.inputValue('#detail-nazev'));
t((await stranka.inputValue('#detail-vydavatel')) === 'Karolinum', 'vyměnil se i vydavatel');
await zavriDetail(stranka);
t(await stranka.evaluate(() => {
    const k = JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0];
    return k.isbn === '9788024268705' && k.poznamka === 'půjčeno Petrovi' && k.kusu === 2;
  }), 'oprava zachovala poznámku i počet kusů');

// Oprava na ISBN, které knihovna už má, by dvě knihy slila v jednu.
// Nová kniha se vkládá nahoru, opravuje se tedy zase první z nich.
await pridejRucne(stranka, '9780306406157');
await stranka.waitForTimeout(300);
t((await pocetKnih(stranka)) === 2, 'do knihovny přibyla druhá kniha');

await otevriDetail(stranka);
t((await stranka.inputValue('#detail-isbn')) === '978-0-306-40615-7', 'nová kniha je nahoře',
  await stranka.inputValue('#detail-isbn'));
await stranka.fill('#detail-isbn', '978-80-242-6870-5');
await stranka.locator('#detail-nazev').click();
await stranka.waitForTimeout(500);
t((await stranka.locator('#hlaska').innerText()).includes('už na téhle poličce je'),
  'oprava na už existující ISBN se odmítne', await stranka.locator('#hlaska').innerText());
t((await stranka.inputValue('#detail-isbn')) === '978-0-306-40615-7',
  'a číslo zůstane nezměněné', await stranka.inputValue('#detail-isbn'));
await zavriDetail(stranka);
t((await pocetKnih(stranka)) === 2, 'nic se nesloučilo ani neztratilo');

/* --------------------------------- rozepsané údaje v detailu se neztratí */

// Dvě místa, kde se rozdělaná práce dřív ztrácela: přepínač klávesnice
// (odchod z pole spouští uložení ISBN) a zavření detailu klávesou Esc
// (to z pole neodchází, takže se změna neuložila).
await otevriDetail(stranka);
await stranka.fill('#detail-isbn', '');
await stranka.locator('#detail-isbn').pressSequentially('80-7203-068');
await stranka.click('#btn-klavesnice-detail');
await stranka.waitForTimeout(300);
t((await stranka.inputValue('#detail-isbn')) === '80-7203-068',
  'přepnutí klávesnice nesmaže rozepsané číslo',
  await stranka.inputValue('#detail-isbn'));
t((await stranka.getAttribute('#detail-isbn', 'inputmode')) === 'text',
  'a klávesnice se přepne na písmena');

await stranka.locator('#detail-isbn').pressSequentially('-X');
await stranka.locator('#detail-nazev').click();
await stranka.waitForTimeout(600);
t((await stranka.inputValue('#detail-isbn')) === '978-80-7203-068-2',
  'staré číslo s X se v detailu převede na ISBN-13',
  await stranka.inputValue('#detail-isbn'));
await stranka.click('#btn-klavesnice-detail'); // zpátky na číslice

await stranka.fill('#detail-poznamka', 'rozepsáno a zavřeno Escapem');
await stranka.keyboard.press('Escape');
await stranka.waitForSelector('#sheet-detail', { state: 'hidden', timeout: 5000 });
t(await stranka.evaluate(() => JSON.parse(localStorage.getItem('knihovna.knihy.v1'))
    .some((k) => k.poznamka === 'rozepsáno a zavřeno Escapem')),
  'zavření detailu Escapem rozepsanou poznámku uloží');

// Uklidí se, ať další blok počítá od dvou knih.
await otevriDetail(stranka);
await stranka.fill('#detail-isbn', '978-0-306-40615-7');
await stranka.locator('#detail-nazev').click();
await stranka.waitForTimeout(600);
await zavriDetail(stranka);

/* ------------------------------------- konkrétní kód z reálného skenu */

// Zadává se s pomlčkami tak, jak je vytištěný na knize.
dotazyNaGoogle.length = 0;
await pridejRucne(stranka, '978-80-7335-506-7');
await stranka.waitForTimeout(300);

await zalozka(stranka, 'knihovna');
const ceska = knihy(stranka).first();
t((await ceska.locator('.kniha-nazev').innerText()).includes('sedmičkovým'),
  '978-80-7335-506-7 projde vyhledáním', await ceska.locator('.kniha-nazev').innerText());
t((await ceska.locator('.kniha-cislo').innerText()) === '978-80-7335-506-7',
  'a zobrazí se přesně tak, jak je vytištěný na knize',
  await ceska.locator('.kniha-cislo').innerText());

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
await otevriRucne(stranka);

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
await zalozka(stranka, 'knihovna');
t((await knihy(stranka).first().locator('.kniha-cislo').innerText()) === '978-80-7203-068-2',
  'a v knihovně stojí převedená',
  await knihy(stranka).first().locator('.kniha-cislo').innerText());

// Zpátky na číslice, ať se dál zadává jako obvykle.
await otevriRucne(stranka);
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
t((await pocetKnih(stranka)) === 2, 'časopis se do knihovny přidá',
  String(await knihy(stranka).count()));
t((await knihy(stranka).first().locator('.kniha-cislo').innerText()) === '0378-5955',
  'i v seznamu', await knihy(stranka).first().locator('.kniha-cislo').innerText());

// Čárový kód časopisu (prefix 977) je totéž ISSN — nesmí vzniknout druhý řádek.
await zadejIsbn(stranka, '9770378595002');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-isbn').inputValue()) === '0378-5955',
  'z kódu časopisu se dopočítá ISSN', await stranka.locator('#nabidka-isbn').inputValue());
t(await stranka.locator('#nabidka-upozorneni').isVisible(),
  'a nabídka upozorní, že tenhle titul už v knihovně je');

await stranka.click('#btn-pridat');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
t((await pocetKnih(stranka)) === 2, 'takže jen přibude kus',
  String(await knihy(stranka).count()));

// Časopis dál nepotřebujeme; ať se počítají jen knihy.
await smazKnihu(stranka);
t((await pocetKnih(stranka)) === 1, 'časopis se dá smazat');

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

await zalozka(stranka, 'knihovna');
const staraKniha = knihy(stranka).first();
t((await staraKniha.locator('.kniha-nazev').innerText()).includes('Traktor'),
  'kniha bez ISBN se do knihovny uloží', await staraKniha.locator('.kniha-nazev').innerText());
t((await staraKniha.locator('.kniha-cislo').innerText()) === 'cnb000123456',
  'a vede se pod číslem ČNB', await staraKniha.locator('.kniha-cislo').innerText());
t(await stranka.evaluate(() =>
    JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].isbn === ''),
  'pole pro ISBN u ní zůstane prázdné');

// Druhý sken téže knihy nesmí založit další záznam — klíčem je ČNB.
const radkuPred = await pocetKnih(stranka);
await zadejIsbn(stranka, 'cnb000123456');
await pockejNaNabidku(stranka);
t(await stranka.locator('#nabidka-upozorneni').isVisible(),
  'nabídka pozná, že tuhle knihu už knihovna má');
await stranka.click('#btn-zahodit');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
t((await pocetKnih(stranka)) === radkuPred,
  'takže druhý záznam nevznikne', String(await knihy(stranka).count()));

// A do sloupce, který import čeká jako ISBN, se ČNB nesmí dostat.
await zalozka(stranka, 'zaloha');
const [exportCnb] = await Promise.all([
  stranka.waitForEvent('download'),
  stranka.click('#btn-csv'),
]);
const cestaCnb = join(DOCASNY, 'cnb.csv');
await exportCnb.saveAs(cestaCnb);
t(!readFileSync(cestaCnb, 'utf8').includes('cnb000123456'),
  'ČNB se do exportu pro knihovní systém neplete');

await smazKnihu(stranka);

/* --------------------------------- kniha úplně bez čísla (ani ČNB) */

// Nejstarší tituly nemají ani ISBN, ani ČNB — katalog jim ho nepřidělil.
// Uložit se musí dát i tak, jen bez počítání kusů.
await otevriHledaniPodleNazvu(stranka);
await stranka.fill('#vstup-nazev', 'Kniha');
await stranka.click('#form-podle-nazvu button[type=submit]');
await stranka.waitForSelector('#vysledky-hledani:not([hidden]) .vysledek', { timeout: 10000 });

const radkuPredBezCisla = await pocetKnih(stranka);
await otevriHledaniPodleNazvu(stranka);
await stranka.locator('#vysledky-hledani .vysledek').first().click();
await pockejNaNabidku(stranka);
await stranka.fill('#nabidka-isbn', '');
await stranka.fill('#nabidka-nazev', 'Kniha bez jakéhokoliv čísla');
t(await stranka.locator('#nabidka-upozorneni').isVisible(),
  'nabídka řekne, že bez čísla nejde poznat duplicita');

await stranka.click('#btn-pridat');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
t((await pocetKnih(stranka)) === radkuPredBezCisla + 1,
  'kniha bez čísla se přidá', String(await knihy(stranka).count()));

const bezCisla = knihy(stranka).first();
t((await bezCisla.locator('.kniha-nazev').innerText()).includes('bez jakéhokoliv čísla'),
  's vyplněnými údaji', await bezCisla.locator('.kniha-nazev').innerText());
t((await bezCisla.locator('.kniha-cislo').innerText()) === 'bez čísla',
  'a v seznamu je poznat, že číslo nemá', await bezCisla.locator('.kniha-cislo').innerText());

// Bez čísla není podle čeho poznat duplicitu — druhé přidání je nový záznam.
await otevriHledaniPodleNazvu(stranka);
await stranka.locator('#vysledky-hledani .vysledek').first().click();
await pockejNaNabidku(stranka);
await stranka.fill('#nabidka-isbn', '');
await stranka.fill('#nabidka-nazev', 'Kniha bez jakéhokoliv čísla');
await stranka.click('#btn-pridat');
await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
t((await pocetKnih(stranka)) === radkuPredBezCisla + 2,
  'a druhé přidání zakládá další záznam, ne kus',
  String(await knihy(stranka).count()));

await smazKnihu(stranka);
await smazKnihu(stranka);
await otevriHledaniPodleNazvu(stranka);
await stranka.fill('#vstup-nazev', '');

/* --------------------------------------- hledání podle názvu a autora */

await otevriHledaniPodleNazvu(stranka);
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
await zalozka(stranka, 'knihovna');
t((await stranka.locator('#pocet').innerText()) === '2 tituly', 'po potvrzení přibude do knihovny',
  await stranka.locator('#pocet').innerText());
t((await knihy(stranka).first().locator('.kniha-autor').innerText()).includes('Karolinum'),
  'a s údaji dohledanými podle čísla',
  await knihy(stranka).first().locator('.kniha-autor').innerText());

// Spodní list se po přidání zavře; nabídka nálezů v něm ale zůstává.
await otevriHledaniPodleNazvu(stranka);
t((await nalezy.first().innerText()).includes('už v knihovně'),
  'v nabídce se hned označí jako přidaná', await nalezy.first().innerText());

/* ------------------------------ hledání podle nakladatelství a roku */

// Stejný titul vyšel u víc nakladatelů — bez těchhle polí by z nabídky
// nešlo poznat, které vydání je to v poličce.
await stranka.fill('#vstup-nazev', 'Kniha');
await stranka.fill('#vstup-autor', '');
await stranka.fill('#vstup-vydavatel', 'Karolinum');
await stranka.click('#form-podle-nazvu button[type=submit]');
await stranka.waitForSelector('#vysledky-hledani:not([hidden]) .vysledek', { timeout: 10000 });
t((await nalezy.count()) === 1, 'nakladatelství zúží nabídku', String(await nalezy.count()));
t((await nalezy.first().innerText()).includes('Karolinum'),
  'a zůstane kniha od něj', await nalezy.first().innerText());
t(dotazyNaGoogle.some((d) => d.includes('inpublisher:"Karolinum"')),
  'nakladatelství jde do dotazu vlastním operátorem',
  dotazyNaGoogle[dotazyNaGoogle.length - 1]);

// Rok se do Google Books poslat nedá, filtruje se až na hotové nabídce.
await stranka.fill('#vstup-vydavatel', '');
await stranka.fill('#vstup-rok', '2015');
await stranka.click('#form-podle-nazvu button[type=submit]');
await stranka.waitForSelector('#vysledky-hledani:not([hidden]) .vysledek', { timeout: 10000 });
t((await nalezy.count()) === 1, 'rok nechá v nabídce jen vydání z toho roku',
  String(await nalezy.count()));
t((await nalezy.first().innerText()).includes('2015'), 'a je to to správné',
  await nalezy.first().innerText());
t((await stranka.locator('#vysledky-hledani .napoveda').innerText()).includes('jiném roce'),
  'pod nabídkou se řekne, že kvůli roku nálezy vypadly',
  await stranka.locator('#vysledky-hledani .napoveda').innerText());

// Nesmyslný rok se nesmí tiše ignorovat — uživatel by čekal, že se podle
// něj hledalo.
await stranka.fill('#vstup-rok', '90. léta');
await stranka.click('#form-podle-nazvu button[type=submit]');
await stranka.waitForTimeout(300);
t((await stranka.locator('#hlaska').innerText()).includes('čtyři číslice'),
  'nesmyslný rok se odmítne', await stranka.locator('#hlaska').innerText());

/* ------------------------------------- vymazání všech polí hledání */

// Zapomenuté nakladatelství z minulého dotazu by ten další tiše zúžilo.
await stranka.fill('#vstup-nazev', 'Kniha');
await stranka.fill('#vstup-autor', 'Novák');
await stranka.fill('#vstup-vydavatel', 'Karolinum');
await stranka.fill('#vstup-rok', '2015');
await stranka.click('#btn-vymazat-hledani');
await stranka.waitForTimeout(200);

for (const pole of ['#vstup-nazev', '#vstup-autor', '#vstup-vydavatel', '#vstup-rok']) {
  t((await stranka.inputValue(pole)) === '', `${pole} se jedním tlačítkem vyprázdní`,
    await stranka.inputValue(pole));
}
t(await stranka.locator('#vysledky-hledani').isHidden(),
  'a nabídka z minulého hledání zmizí');

/* ------------------------------------------------------------- poličky */

await stranka.evaluate(() => localStorage.clear());
await stranka.reload({ waitUntil: 'networkidle' });

// Poličku jde založit rovnou ze spodního listu u skenování.
await zalozka(stranka, 'skener');
await stranka.click('#btn-policka-otevrit');
await stranka.waitForSelector('#sheet-policky:not([hidden])', { timeout: 5000 });
stranka.once('dialog', (d) => d.accept('Obývák dole'));
await stranka.click('#btn-nova-policka-sken');
await stranka.waitForTimeout(300);
t((await stranka.locator('#popisek-policky').innerText()) === 'Obývák dole',
  'nová polička se rovnou nastaví pro skenování',
  await stranka.locator('#popisek-policky').innerText());

await zadejIsbn(stranka, '9780306406157');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-policka').inputValue()) === 'Obývák dole',
  'nabídka předvyplní zvolenou poličku');
await stranka.click('#btn-pridat');
await stranka.waitForTimeout(300);
await otevriDetail(stranka);
t((await stranka.locator('#detail-policka').inputValue()) === 'Obývák dole',
  'polička se u knihy uloží', await stranka.locator('#detail-policka').inputValue());
await zavriDetail(stranka);

// Tentýž titul na druhé poličce je druhý výtisk, ne duplicita.
// Druhá polička se zakládá ze správy poliček na kartě Záloha.
await zalozka(stranka, 'zaloha');
stranka.once('dialog', (d) => d.accept('Ložnice'));
await stranka.click('#btn-nova-policka');
await stranka.waitForTimeout(300);
t((await stranka.locator('#seznam-policek .policka-radek').count()) === 2,
  'správa poliček ukazuje obě poličky',
  String(await stranka.locator('#seznam-policek .policka-radek').count()));
t((await stranka.locator('#seznam-policek .policka-nazev').first().innerText()) === 'Ložnice',
  'se jménem poličky',
  await stranka.locator('#seznam-policek .policka-nazev').first().innerText());

// Nová polička se ze správy nestaví jako cíl skenování — do té se skenuje dál.
await zalozka(stranka, 'skener');
await stranka.click('#btn-policka-otevrit');
await stranka.waitForSelector('#sheet-policky:not([hidden])', { timeout: 5000 });
await stranka.locator('.policka-vyber', { hasText: 'Ložnice' }).click();
await stranka.waitForSelector('#sheet-policky', { state: 'hidden', timeout: 5000 });
t((await stranka.locator('#popisek-policky').innerText()) === 'Ložnice',
  'polička jde pro skenování přepnout', await stranka.locator('#popisek-policky').innerText());

await zadejIsbn(stranka, '9780306406157');
await pockejNaNabidku(stranka);
t((await stranka.locator('#nabidka-upozorneni').innerText()).includes('Obývák dole'),
  'nabídka řekne, na které poličce už titul stojí',
  await stranka.locator('#nabidka-upozorneni').innerText());
await stranka.click('#btn-pridat');
await stranka.waitForTimeout(300);
t((await pocetKnih(stranka)) === 2,
  'stejná kniha na jiné poličce dostane vlastní záznam');

// Poličky nahradily filtr: každá je vlastní sbalitelná sekce.
const skupiny = stranka.locator('#skupiny-policek .skupina-policky');
t((await skupiny.count()) === 2, 'knihovna je rozdělená na dvě poličky',
  String(await skupiny.count()));
const nazvySkupin = await stranka.locator('#skupiny-policek .skupina-nazev').allInnerTexts();
t(nazvySkupin.includes('Obývák dole') && nazvySkupin.includes('Ložnice'),
  'sekce se jmenují po poličkách', nazvySkupin.join(', '));

const lozniceSekce = stranka.locator('.skupina-policky', { has: stranka.locator('.skupina-nazev', { hasText: 'Ložnice' }) });
t((await lozniceSekce.locator('.polozka-radky').count()) === 1,
  'v sekci poličky stojí jen její knihy');

// Sbalení sekce knihy schová, rozbalení je vrátí.
await lozniceSekce.locator('.skupina-hlavicka').click();
await stranka.waitForTimeout(200);
t((await lozniceSekce.locator('.polozka-radky').count()) === 0, 'sekce jde sbalit');
await lozniceSekce.locator('.skupina-hlavicka').click();
await stranka.waitForTimeout(200);
t((await lozniceSekce.locator('.polozka-radky').count()) === 1, 'a zase rozbalit');

await stranka.fill('#hledat', 'obývák');
await stranka.waitForTimeout(200);
t((await knihy(stranka).count()) === 1, 'polička se dá i vyhledat');
await stranka.fill('#hledat', '');
await stranka.waitForTimeout(200);

// Přesun knihy jinam je v jejím detailu.
const poradiLoznice = nazvySkupin.indexOf('Ložnice') === 0 ? 0 : 1;
await otevriDetail(stranka, poradiLoznice);
t((await stranka.locator('#detail-policka').inputValue()) === 'Ložnice',
  'detail ukáže poličku, na které kniha stojí');
await stranka.selectOption('#detail-policka', 'Obývák dole');
await stranka.waitForTimeout(400);
t((await stranka.locator('#hlaska').innerText()).includes('kusy se sečetly'),
  'přesun na poličku s týmž titulem kusy sečte', await stranka.locator('#hlaska').innerText());
t(await stranka.locator('#sheet-detail').isHidden(),
  'a detail se zavře — záznam, který se slil, už neexistuje');
t((await pocetKnih(stranka)) === 1, 'zbyde jediný záznam');
t((await stranka.locator('.odznak-kusu-radky').innerText()) === '2×', 'se dvěma kusy');

await zalozka(stranka, 'zaloha');
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
  t(await stranka.evaluate(() => !localStorage.getItem('knihovna.knihy.v1')),
    'sama se ale neuložila');
  t(await stranka.locator('#video').isVisible(), 'obraz z kamery je vidět');

  await stranka.click('#btn-pridat');
  await stranka.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });

  // Právě přidané knihy jsou vidět rovnou pod skenovacím okénkem, ať se
  // při katalogizaci nemusí přepínat na Knihovnu.
  t((await stranka.locator('#seznam-nedavnych .kniha-radek').count()) === 1,
    'po potvrzení je kniha v seznamu právě přidaných',
    String(await stranka.locator('#seznam-nedavnych .kniha-radek').count()));

  // Kamera běží dál a tentýž kód by nabídla znovu — na Knihovnu se dá přejít
  // až po zastavení, protože nabídka k potvrzení překrývá i spodní lištu.
  await stranka.click('#btn-skenovat');
  await stranka.waitForTimeout(300);
  if (!(await stranka.locator('#prekryv').isHidden())) await stranka.click('#btn-zahodit');

  await zalozka(stranka, 'knihovna');
  await stranka.waitForSelector('#skupiny-policek .polozka-radky', { timeout: 10000 });
  t((await knihy(stranka).first().locator('.kniha-nazev').innerText())
      .includes('Structure and Interpretation'),
    'a je i v knihovně');
} catch (chyba) {
  t(false, 'kamera přečetla čárový kód',
    `${await stranka.locator('#stav').innerText()} | ${chyba.message.split('\n')[0]}`);
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

t((await pocetKnih(stranka)) === 2, 'duplicitní ISBN se při načtení sloučilo');
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
await zalozka(stranka, 'zaloha');

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

await zalozka(stranka, 'zaloha');
const [zalohaCsv] = await Promise.all([stranka.waitForEvent('download'), stranka.click('#btn-csv')]);
const cestaCsv = join(DOCASNY, 'export.csv');
await zalohaCsv.saveAs(cestaCsv);

// Mazání celé tabulky je schované v „Nebezpečných akcích“.
await stranka.locator('.karta-nebezpecne summary').click();
await stranka.click('#btn-smazat-vse');
await stranka.waitForTimeout(200);
t((await pocetKnih(stranka)) === 0, 'mazání vyprázdní knihovnu');
t(await stranka.locator('#prazdno').isVisible(), 'a řekne se, že tu zatím nic není');

await zalozka(stranka, 'zaloha');
await stranka.setInputFiles('#soubor-import', cestaJson);
await stranka.waitForTimeout(400);
t((await pocetKnih(stranka)) === 1, 'záloha se nahraje zpět');
t((await knihy(stranka).first().locator('.kniha-nazev').innerText()).includes('háčky'),
  'diakritika přežila zálohu i obnovu');
t(await stranka.evaluate(() =>
    JSON.parse(localStorage.getItem('knihovna.knihy.v1'))[0].kusu === 3), 'počet kusů se zachoval');

await zalozka(stranka, 'zaloha');
await stranka.setInputFiles('#soubor-import', cestaJson);
await stranka.waitForTimeout(400);
t((await pocetKnih(stranka)) === 1, 'opakovaný import knihu nezdvojí');

const csv = readFileSync(cestaCsv, 'utf8');
t(csv.startsWith('﻿'), 'CSV má BOM, aby Excel poznal diakritiku');

// Hlavička se jmenuje přesně jako pole, do kterých se tabulka nahrává
// ve školním systému — jinak by se sloupce musely párovat ručně.
const hlavickaCsv = csv.replace(/^﻿/, '').split('\r\n')[0];
t(hlavickaCsv === 'Unikátní identifikátor definice knihy (ISBN);Autor;Název;' +
  'Rok vydání (titul);Vydavatelství (titul);Místo vydání (titul);Počet;Polička;Poznámka',
  'CSV má hlavičku s názvy polí importu, oddělenou středníky', hlavickaCsv);
t(csv.includes('"text s ; středníkem a ""uvozovkami"""'), 'CSV zaobalilo středník i uvozovky');

// Holé 13místné číslo si Excel přepíše na 9,78807E+12; s pomlčkami je to text.
const radekCsv = csv.replace(/^﻿/, '').split('\r\n')[1];
t(radekCsv.startsWith('978-80-242-6870-5;'), 'CSV má ISBN s pomlčkami, aby ho Excel nebral jako číslo',
  radekCsv.slice(0, 30));
t(!/^9788024268705/.test(radekCsv), 'a ne jako holé číslo');
t(radekCsv.includes(';Česká kniha s háčky;2015;Karolinum;'),
  'a údaje stojí ve sloupcích, které je slibují', radekCsv);
t(radekCsv.includes(';2015;Karolinum;;3;'),
  'prázdné místo vydání má vlastní sloupec před počtem kusů', radekCsv);

/* ------------------------------------------- odeslání zálohy ze systému */

await zalozka(stranka, 'zaloha');
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
  t((await stranka.locator('#obrazovka-skener h1').innerText()).includes('Skenování'),
    'aplikace se načte i bez signálu');
  t((await pocetKnih(stranka)) === 1, 'knihovna je offline k dispozici');
  t(await stranka.evaluate(async () => !!(await caches.match('./vendor/zxing.min.js'))),
    'čtečka kódů je uložená pro offline');
  t(await stranka.evaluate(async () =>
      !!(await caches.match('./vendor/fonts/ibm-plex-serif-600-latin.woff2'))),
    'a písma taky — aplikace vypadá bez signálu stejně');
  t(await stranka.evaluate(() => document.fonts.check('600 1rem "IBM Plex Serif"')),
    'nadpisové písmo se offline opravdu použije');
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

// První klepnutí zapne režim čtení čísla a ukáže čtecí proužek, teprve
// druhé čte — proužek se musí dát nejdřív zaměřit.
await strankaOcr.click('#btn-cislo');
t(await strankaOcr.locator('#ctecka-pruh').isVisible(), 'objeví se čtecí proužek');
t(await strankaOcr.locator('#hledacek').isHidden(),
  'a rámeček na čárový kód ustoupí, ať je jasné, co se čte');

await strankaOcr.click('#btn-cislo');
try {
  await strankaOcr.waitForSelector('#prekryv:not([hidden])', { timeout: 60000 });
  t((await strankaOcr.locator('#nabidka-isbn').inputValue()) === '978-80-242-6870-5',
    'z vytištěného čísla se přečetlo správné ISBN',
    await strankaOcr.locator('#nabidka-isbn').inputValue());

  await strankaOcr.waitForFunction(() => !document.querySelector('#btn-znovu').disabled,
    null, { timeout: 20000 });
  await strankaOcr.click('#btn-pridat');
  await strankaOcr.waitForSelector('#prekryv', { state: 'hidden', timeout: 5000 });
  await zalozka(strankaOcr, 'knihovna');
  await strankaOcr.waitForSelector('#skupiny-policek .polozka-radky', { timeout: 10000 });
  t((await knihy(strankaOcr).first().locator('.kniha-nazev').innerText())
      .includes('Kniha z Karolina'),
    'a kniha se podle něj dohledala');
  await zalozka(strankaOcr, 'skener');
} catch {
  t(false, 'z vytištěného čísla se přečetlo správné ISBN', await strankaOcr.locator('#stav').innerText());
}

// Proužek jde posunout tahem a poloha se pamatuje — na tom stojí to, že si
// uživatel vybere, který řádek se přečte.
await strankaOcr.evaluate(() => {
  const pruh = document.querySelector('#ctecka-pruh');
  const udalost = (druh, y) => new PointerEvent(druh, { clientY: y, bubbles: true, pointerId: 1 });
  pruh.dispatchEvent(udalost('pointerdown', 200));
  pruh.dispatchEvent(udalost('pointermove', 260));
  pruh.dispatchEvent(udalost('pointerup', 260));
});
const ulozenyProuzek = await strankaOcr.evaluate(
  () => localStorage.getItem('knihovna.prouzek.v1'));
t(!!ulozenyProuzek, 'posun proužku si aplikace zapamatuje', String(ulozenyProuzek));
t(JSON.parse(ulozenyProuzek || '{}').stred > 0.5,
  'a proužek se opravdu posunul dolů', String(ulozenyProuzek));

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
