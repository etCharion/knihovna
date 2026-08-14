/**
 * Záloha tabulky mimo tohle zařízení.
 *
 * Tabulka sama žije v paměti jednoho prohlížeče (localStorage). Když se
 * telefon ztratí nebo se smažou data stránky, je bez zálohy nenávratně po ní.
 * Aplikace je přitom pouhá statická stránka bez serveru, takže odesílat data
 * sama od sebe nikam nemůže — může ale využít, co nabízí prohlížeč:
 *
 *  1. **Sdílení** (Web Share API) — na telefonu otevře systémovou nabídku
 *     „Sdílet“, kde je Disk Google, Gmail, WhatsApp i uložení do souborů.
 *     Soubory jdou jako skutečné přílohy, takže tohle je nejkratší cesta,
 *     jak zálohu dostat na Disk nebo do e-mailu.
 *  2. **E-mail** (odkaz `mailto:`) — otevře rozepsanou zprávu. Přílohu
 *     prohlížeč přiložit neumí, proto se seznam vypíše do textu zprávy
 *     a soubory se zároveň stáhnou, aby se daly přiložit ručně.
 *  3. **Složka v počítači** (File System Access API) — jednou se vybere
 *     složka, typicky ta, kterou synchronizuje Disk Google nebo OneDrive,
 *     a aplikace do ní pak zálohu píše sama po každé změně tabulky.
 *     Tohle je jediná cesta, která nevyžaduje, aby si na zálohu člověk
 *     vzpomněl.
 *
 * Žádná z nich nepotřebuje vlastní server, přihlášení ani API klíč a data
 * putují jen tam, kam je uživatel sám pošle.
 */

import * as ulozne from './storage.js';

const KLIC_STAVU = 'knihovna.zaloha.v1';
const KLIC_ADRESY = 'knihovna.zaloha.adresa';

/** Rukojeť vybrané složky se nedá uložit do localStorage, jen do IndexedDB. */
const DB_NAZEV = 'knihovna-zaloha';
const DB_ULOZISTE = 'rukojeti';
const DB_KLIC_SLOZKY = 'slozka';

/** Prodleva, než se změna zapíše do složky — psaní v tabulce tak nedělá desítky zápisů. */
const PRODLEVA_ZAPISU = 2000;

/** Delší `mailto:` odkaz některé poštovní programy zkrátí nebo odmítnou. */
const DELKA_TELA_MAILU = 1400;

export function znacka(datum = new Date()) {
  return datum.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ soubory */

/**
 * Soubory jedné zálohy: CSV se otevře v Excelu, JSON umí aplikace nahrát zpět.
 * Posílají se oba, protože každý je na něco jiného.
 */
export function pripravSoubory(knihy = ulozne.vsechny()) {
  const den = znacka();
  return [
    new File([ulozne.doCsv(knihy)], `knihovna-${den}.csv`, { type: 'text/csv' }),
    new File([ulozne.doJson(knihy)], `knihovna-${den}.json`, { type: 'application/json' }),
  ];
}

/** „42 knih (47 kusů)“ — kusy se zmiňují jen tehdy, když se od počtu titulů liší. */
export function popisPoctu(knihy) {
  const kusu = knihy.reduce((soucet, kniha) => soucet + (Number(kniha.kusu) || 1), 0);
  const titulu = `${knihy.length} ${sklonuj(knihy.length, 'kniha', 'knihy', 'knih')}`;
  return kusu === knihy.length ? titulu : `${titulu} (${kusu} kusů)`;
}

function sklonuj(pocet, jedna, dve, vic) {
  if (pocet === 1) return jedna;
  return pocet >= 2 && pocet <= 4 ? dve : vic;
}

/* ------------------------------------------------------------ sdílení */

/**
 * Umí prohlížeč poslat soubory do systémové nabídky sdílení?
 *
 * Ptát se jen na `navigator.share` nestačí — sdílení textu zvládne i prohlížeč,
 * který soubory odmítne, a taková nabídka by k záloze nepomohla. Proto se
 * `canShare` zkouší na skutečném souboru.
 */
export function lzeSdilet() {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File(['x'], 'zkouska.csv', { type: 'text/csv' })] });
  } catch {
    return false;
  }
}

/**
 * Otevře systémovou nabídku sdílení s oběma soubory zálohy.
 *
 * Když uživatel nabídku zavře, prohlížeč zamítne slib chybou `AbortError` —
 * to není porucha a volající to má brát jako „nic se nestalo“.
 */
export async function sdilej(knihy = ulozne.vsechny()) {
  await navigator.share({
    files: pripravSoubory(knihy),
    title: `Záloha knihovny ${znacka()}`,
    text: `Záloha seznamu knih — ${popisPoctu(knihy)}.`,
  });
  zapamatuj('sdílení', knihy);
}

/* ------------------------------------------------------------ e-mail */

export function adresaProZalohu() {
  try {
    return localStorage.getItem(KLIC_ADRESY) || '';
  } catch {
    return '';
  }
}

export function ulozAdresu(adresa) {
  try {
    localStorage.setItem(KLIC_ADRESY, adresa);
  } catch {
    /* nezapamatovaná adresa nic nerozbije */
  }
}

/**
 * Sestaví odkaz `mailto:` s rozepsanou zprávou.
 *
 * Seznam se vypisuje přímo do textu zprávy: příloha se z webové stránky
 * do e-mailu vložit nedá, ale text zálohou taky je — dá se z něj kdykoliv
 * přečíst, co v knihovně bylo, i kdyby se soubory ztratily. Delší seznam se
 * zkrátí, aby odkaz zůstal v mezích, které poštovní programy zvládnou.
 */
export function mailtoOdkaz(knihy, adresa = '') {
  const uvod = [
    `Záloha seznamu knih z aplikace Knihovna, ${new Date().toLocaleDateString('cs-CZ')}.`,
    `Obsah: ${popisPoctu(knihy)}.`,
    '',
  ];

  const radky = [];
  let delka = 0;
  let vynechano = 0;

  for (const [poradi, kniha] of knihy.entries()) {
    const radek = `${poradi + 1}. ${popisKnihy(kniha)}`;
    if (delka + radek.length > DELKA_TELA_MAILU) {
      vynechano = knihy.length - poradi;
      break;
    }
    radky.push(radek);
    delka += radek.length + 1;
  }

  if (vynechano) {
    radky.push(`… a další ${vynechano} ${sklonuj(vynechano, 'kniha', 'knihy', 'knih')} ` +
      '— celý seznam je v přiložených souborech.');
  }

  const zaver = [
    '',
    'Soubory knihovna-*.csv a knihovna-*.json se stáhly do tohoto zařízení — ' +
    'přiložte je ke zprávě, ať je záloha úplná.',
    'CSV otevře Excel, soubor JSON umí aplikace nahrát zpět tlačítkem „Načíst zálohu“.',
  ];

  const predmet = `Záloha knihovny ${znacka()} — ${popisPoctu(knihy)}`;
  const telo = [...uvod, ...radky, ...zaver].join('\n');

  return `mailto:${encodeURIComponent(adresa)}` +
    `?subject=${encodeURIComponent(predmet)}&body=${encodeURIComponent(telo)}`;
}

function popisKnihy(kniha) {
  const casti = [kniha.nazev || 'bez názvu'];
  if (kniha.autor) casti.push(kniha.autor);
  const rok = kniha.rok ? ` (${kniha.rok})` : '';
  const kusu = Number(kniha.kusu) > 1 ? `, ${kniha.kusu}×` : '';
  return `${casti.join(' — ')}${rok}, ISBN ${kniha.isbn}${kusu}`;
}

/** Otevře poštovní program s rozepsanou zálohou. */
export function posliEmailem(knihy = ulozne.vsechny(), adresa = adresaProZalohu()) {
  const odkaz = document.createElement('a');
  odkaz.href = mailtoOdkaz(knihy, adresa);
  odkaz.rel = 'noopener';
  document.body.appendChild(odkaz);
  odkaz.click();
  odkaz.remove();
  zapamatuj('e-mail', knihy);
}

/* -------------------------------------------------- složka v počítači */

/** Vybírání složky umí zatím jen Chrome a Edge na počítači. */
export function lzeUkladatDoSlozky() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function otevriDb() {
  return new Promise((splneno, selhalo) => {
    const zadost = indexedDB.open(DB_NAZEV, 1);
    zadost.onupgradeneeded = () => zadost.result.createObjectStore(DB_ULOZISTE);
    zadost.onsuccess = () => splneno(zadost.result);
    zadost.onerror = () => selhalo(zadost.error);
  });
}

async function vDb(rezim, prace) {
  const db = await otevriDb();
  try {
    return await new Promise((splneno, selhalo) => {
      const transakce = db.transaction(DB_ULOZISTE, rezim);
      const zadost = prace(transakce.objectStore(DB_ULOZISTE));
      transakce.oncomplete = () => splneno(zadost?.result ?? null);
      transakce.onerror = () => selhalo(transakce.error);
      transakce.onabort = () => selhalo(transakce.error);
    });
  } finally {
    db.close();
  }
}

/** Vrátí uloženou rukojeť složky, nebo null. Zamčené IndexedDB (anonymní režim) nevadí. */
async function nactiSlozku() {
  if (!lzeUkladatDoSlozky()) return null;
  try {
    return await vDb('readonly', (uloziste) => uloziste.get(DB_KLIC_SLOZKY));
  } catch {
    return null;
  }
}

/**
 * Jak je automatická záloha nastavená:
 * `podporovano` — umí to prohlížeč, `jmeno` — vybraná složka,
 * `povoleno` — smí do ní aplikace psát právě teď.
 */
export async function stavSlozky() {
  if (!lzeUkladatDoSlozky()) return { podporovano: false, jmeno: '', povoleno: false };

  const slozka = await nactiSlozku();
  if (!slozka) return { podporovano: true, jmeno: '', povoleno: false };

  let povoleni = 'prompt';
  try {
    povoleni = await slozka.queryPermission({ mode: 'readwrite' });
  } catch {
    /* rukojeť ze starší verze prohlížeče — bere se jako nepovolená */
  }
  return { podporovano: true, jmeno: slozka.name, povoleno: povoleni === 'granted' };
}

/** Nechá uživatele vybrat složku pro zálohy a zapamatuje si ji i po vypnutí aplikace. */
export async function vyberSlozku() {
  const slozka = await window.showDirectoryPicker({
    id: 'knihovna-zaloha',
    mode: 'readwrite',
    startIn: 'documents',
  });
  await vDb('readwrite', (uloziste) => uloziste.put(slozka, DB_KLIC_SLOZKY));
  return slozka.name;
}

/**
 * Po novém otevření aplikace platí povolení k zápisu znovu potvrdit.
 * Prohlížeč se přitom smí zeptat jen v reakci na klepnutí uživatele.
 */
export async function obnovPovoleni() {
  const slozka = await nactiSlozku();
  if (!slozka) return false;
  return (await slozka.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function vypniSlozku() {
  try {
    await vDb('readwrite', (uloziste) => uloziste.delete(DB_KLIC_SLOZKY));
  } catch {
    /* když se úložiště neotevře, není co mazat */
  }
}

async function zapisSoubor(slozka, nazev, obsah, typ) {
  const soubor = await slozka.getFileHandle(nazev, { create: true });
  const zapis = await soubor.createWritable();
  try {
    await zapis.write(new Blob([obsah], { type: typ }));
    await zapis.close();
  } catch (chyba) {
    // Zavření by nedopsaný soubor potvrdilo — a přišli bychom o předchozí zálohu.
    await zapis.abort().catch(() => {});
    throw chyba;
  }
}

/**
 * Zapíše zálohu do vybrané složky. Vrací název složky, nebo null, když
 * složka není nastavená nebo k ní právě teď nemáme povolení.
 *
 * Kromě dvou souborů, které se přepisují (`knihovna-zaloha.json` a `.csv`),
 * se do podsložky `zalohy/` ukládá jeden soubor na den. Kdyby se tabulka
 * poškodila, je kam se vrátit — přepsaná záloha by tu chybu jen věrně
 * zkopírovala.
 */
export async function zapisDoSlozky(knihy = ulozne.vsechny()) {
  const slozka = await nactiSlozku();
  if (!slozka) return null;
  if ((await slozka.queryPermission({ mode: 'readwrite' })) !== 'granted') return null;

  // Prázdnou tabulku schválně nezapisujeme. Prohlížeč umí data stránky smazat
  // sám (úklid úložiště, vyčištění historie) a aplikace by se pak spustila
  // s prázdnou tabulkou — bez tohohle pojistky by tím přepsala i zálohu.
  if (!knihy.length) return null;

  const json = ulozne.doJson(knihy);
  await zapisSoubor(slozka, 'knihovna-zaloha.json', json, 'application/json');
  await zapisSoubor(slozka, 'knihovna-zaloha.csv', ulozne.doCsv(knihy), 'text/csv');

  const historie = await slozka.getDirectoryHandle('zalohy', { create: true });
  await zapisSoubor(historie, `knihovna-${znacka()}.json`, json, 'application/json');

  zapamatuj(`složka ${slozka.name}`, knihy);
  return slozka.name;
}

/* --------------------------------------------- automatické zálohování */

let ohlas = () => {};
let casovac = null;
let naposledZapsano = null;

/** Aplikace si tudy řekne, ať ji modul zpraví o výsledku automatického zápisu. */
export function priZapisu(posluchac) {
  ohlas = posluchac;
}

/**
 * Zapíše zálohu do složky, pokud je nastavená a data se od posledního
 * zápisu změnila. Volá se po každé úpravě tabulky, proto ta prodleva:
 * psaní poznámky v tabulce by jinak vyvolalo zápis po každém stisku klávesy.
 */
export function synchronizuj({ hned = false } = {}) {
  if (!lzeUkladatDoSlozky()) return;

  clearTimeout(casovac);
  casovac = setTimeout(async () => {
    const knihy = ulozne.vsechny();
    const json = ulozne.doJson(knihy);
    if (json === naposledZapsano) return;

    try {
      const kam = await zapisDoSlozky(knihy);
      if (!kam) return;
      naposledZapsano = json;
      ohlas({ ok: true, kam, pocet: knihy.length });
    } catch (chyba) {
      console.error(chyba);
      ohlas({ ok: false, chyba });
    }
  }, hned ? 0 : PRODLEVA_ZAPISU);
}

/* ------------------------------------------------- kdy se zálohovalo */

function zapamatuj(kam, knihy = ulozne.vsechny()) {
  try {
    localStorage.setItem(KLIC_STAVU, JSON.stringify({
      kdy: new Date().toISOString(),
      pocet: knihy.length,
      kam,
    }));
  } catch {
    /* bez zápisu se jen nezobrazí datum poslední zálohy */
  }
}

/** Ruční export do souboru je taky záloha — hlásí se sem z obsluhy tlačítek. */
export function zaznamenejExport(knihy = ulozne.vsechny()) {
  zapamatuj('soubor v zařízení', knihy);
}

export function posledniZaloha() {
  try {
    const stav = JSON.parse(localStorage.getItem(KLIC_STAVU) || 'null');
    return stav && stav.kdy ? stav : null;
  } catch {
    return null;
  }
}

/**
 * Věta pro uživatele o tom, jak je na tom se zálohou. Záměrně říká i to,
 * že se tabulka od zálohy změnila — jinak by se dala snadno přehlédnout.
 */
export function popisPosledniZalohy(pocetNyni = ulozne.vsechny().length) {
  const stav = posledniZaloha();
  if (!stav) {
    return pocetNyni
      ? 'Zálohu jste ještě nedělali — tabulka je jen v tomhle zařízení.'
      : 'Tabulka je prázdná, zálohovat není co.';
  }

  const kdy = new Date(stav.kdy).toLocaleString('cs-CZ', {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const kolik = `${stav.pocet} ${sklonuj(stav.pocet, 'kniha', 'knihy', 'knih')}`;
  const zmena = pocetNyni !== stav.pocet
    ? ` Od té doby se tabulka změnila — teď má ${pocetNyni} ` +
      `${sklonuj(pocetNyni, 'knihu', 'knihy', 'knih')}.`
    : '';

  return `Poslední záloha: ${kdy} — ${kolik}, ${stav.kam}.${zmena}`;
}
