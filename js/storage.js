/**
 * Uložení tabulky knih do prohlížeče (localStorage).
 *
 * Data zůstávají v telefonu — nikam se neodesílají. Zálohu je potřeba
 * udělat exportem do CSV nebo JSON.
 */

import { naFormat } from './isbn.js';

const KLIC = 'knihovna.knihy.v1';
const KLIC_POLICKY = 'knihovna.policky.v1';
const KLIC_AKTIVNI = 'knihovna.policka-aktivni.v1';

/**
 * Sloupce exportu do CSV.
 *
 * Názvy sloupců jsou přesně ty, které nabízí školní knihovní systém při
 * importu (pole titulu i exempláře) — při párování sloupců se pak nemusí nic
 * dohledávat, názvy sedí na první pohled. Pořadí je ISBN, autor, název, tedy
 * od nejjistějšího údaje k těm ostatním.
 *
 * Jsou tu jen údaje, které aplikace opravdu má. Cenu, signaturu, přírůstkové
 * číslo ani kategorii z ISBN dohledat nejde a prázdný sloupec by při importu
 * jen mátl — kdo je potřebuje, dopíše si je v Excelu.
 *
 * Výjimkou je polička: tu aplikace zná, protože si ji uživatel u skenování
 * nastavil. Sloupec se jmenuje po ní, ne po poli systému — jak přesně se
 * umístění v importu jmenuje, se liší, a při párování se to dá vybrat ručně
 * (nebo sloupec přeskočit).
 *
 * ISBN se do CSV zapisuje s pomlčkami. Holé třináctimístné číslo si Excel
 * vyloží jako číslo a zobrazí ho jako 9,78807E+12; s pomlčkami je to text
 * a zůstane čitelné. V záloze do JSON se naopak drží holé číslice, aby se
 * s nimi dalo dál počítat.
 */
export const SLOUPCE = [
  { klic: 'isbn', popis: 'Unikátní identifikátor definice knihy (ISBN)', doCsv: naFormat },
  { klic: 'autor', popis: 'Autor' },
  { klic: 'nazev', popis: 'Název' },
  { klic: 'rok', popis: 'Rok vydání (titul)' },
  { klic: 'vydavatel', popis: 'Vydavatelství (titul)' },
  { klic: 'kusu', popis: 'Počet', doCsv: (kusu) => Number(kusu) || 1 },
  { klic: 'policka', popis: 'Polička' },
  { klic: 'poznamka', popis: 'Poznámka' },
];

function nacti() {
  try {
    const data = JSON.parse(localStorage.getItem(KLIC) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------ poličky */

/**
 * Polička je prostý text — název místa, kde kniha stojí („Obývák dole“).
 * Sjednotí se mezery a délka, ať se z překlepu v mezerách nestane druhá
 * polička téhož jména.
 */
export function upravNazevPolicky(nazev) {
  return String(nazev ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * Číslo, pod kterým tabulka řádek vede.
 *
 * U knih po roce 1989 je to ISBN, u časopisů ISSN. Starší české knihy žádné
 * nemají — ty jedou pod číslem České národní bibliografie. Vede se ve
 * vlastním poli, aby zůstalo poznat, že to ISBN není: sloupec ISBN u nich
 * zůstává prázdný a prázdný jde i do exportu, kde by ČNB knihovní systém
 * jen zmátlo.
 */
export function cisloZaznamu(kniha) {
  return kniha?.isbn || kniha?.cnb || '';
}

/**
 * Kniha se pozná podle svého čísla *a* poličky. Stejný titul na dvou
 * poličkách jsou dva záznamy — jinak by nešlo dohledat, kde který výtisk
 * stojí. Když se poličky nepoužívají, chová se všechno jako dřív.
 *
 * Kniha bez čísla klíč nemá — vrací se null. Není totiž podle čeho poznat,
 * že jde o tentýž titul: dva záznamy se stejným názvem klidně můžou být dvě
 * různé knihy. Takové řádky se proto nikdy neslučují ani nepočítají kusy,
 * každé přidání je nový řádek. To je ta cena za to, že jdou vůbec uložit.
 */
function klicZaznamu(kniha) {
  const cislo = cisloZaznamu(kniha);
  return cislo ? `${cislo}\u0000${upravNazevPolicky(kniha.policka)}` : null;
}

function nactiPolicky() {
  try {
    const data = JSON.parse(localStorage.getItem(KLIC_POLICKY) || '[]');
    return Array.isArray(data) ? data.map(upravNazevPolicky).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Uloží seznam poliček — bez prázdných, bez opakování a seřazený česky. */
function ulozPolicky(seznam) {
  const jedinecne = [];
  for (const nazev of seznam.map(upravNazevPolicky).filter(Boolean)) {
    if (!jedinecne.some((j) => j.toLowerCase() === nazev.toLowerCase())) jedinecne.push(nazev);
  }
  jedinecne.sort((a, b) => a.localeCompare(b, 'cs'));
  localStorage.setItem(KLIC_POLICKY, JSON.stringify(jedinecne));
  return jedinecne;
}

export function policky() {
  return nactiPolicky();
}

/** Založí poličku. Když už existuje (i jen jinak napsaná velikost písmen), vrátí tu stávající. */
export function pridejPolicku(nazev) {
  const cisty = upravNazevPolicky(nazev);
  if (!cisty) return null;
  const stavajici = nactiPolicky().find((p) => p.toLowerCase() === cisty.toLowerCase());
  if (stavajici) return stavajici;
  ulozPolicky([...nactiPolicky(), cisty]);
  return cisty;
}

/**
 * Přejmenuje poličku i u knih, které na ní stojí.
 *
 * Když se název trefí do jiné existující poličky, obě se tím slijí v jednu —
 * proto se pak ještě uklidí duplicity (tentýž titul by byl na téže poličce dvakrát).
 */
export function prejmenujPolicku(stary, novy) {
  const puvodni = upravNazevPolicky(stary);
  const cisty = upravNazevPolicky(novy);
  if (!puvodni || !cisty || puvodni === cisty) return null;

  const knihy = nacti();
  for (const kniha of knihy) {
    if (upravNazevPolicky(kniha.policka) === puvodni) kniha.policka = cisty;
  }
  uloz(slucDuplicity(knihy));

  ulozPolicky(nactiPolicky().map((p) => (p === puvodni ? cisty : p)));
  if (aktivniPolicka() === puvodni) nastavAktivniPolicku(cisty);
  return cisty;
}

/**
 * Zruší poličku. Knihy se nemažou — jen zůstanou bez poličky,
 * aby se omylem nepřišlo o naskenované záznamy.
 */
export function smazPolicku(nazev) {
  const cisty = upravNazevPolicky(nazev);
  if (!cisty) return 0;

  const knihy = nacti();
  let dotcenych = 0;
  for (const kniha of knihy) {
    if (upravNazevPolicky(kniha.policka) === cisty) {
      kniha.policka = '';
      dotcenych++;
    }
  }
  uloz(slucDuplicity(knihy));

  ulozPolicky(nactiPolicky().filter((p) => p !== cisty));
  if (aktivniPolicka() === cisty) nastavAktivniPolicku('');
  return dotcenych;
}

/** Polička, na kterou se ukládají nově naskenované knihy. */
export function aktivniPolicka() {
  try {
    return upravNazevPolicky(localStorage.getItem(KLIC_AKTIVNI) || '');
  } catch {
    return '';
  }
}

export function nastavAktivniPolicku(nazev) {
  localStorage.setItem(KLIC_AKTIVNI, upravNazevPolicky(nazev));
}

/**
 * Doplní do seznamu poličky, které jsou u knih, ale v seznamu chybí.
 * Tak se dostanou zpátky poličky ze zálohy pořízené v jiném telefonu.
 */
export function uklidPolicky() {
  const zKnih = nacti().map((k) => upravNazevPolicky(k.policka)).filter(Boolean);
  const pred = nactiPolicky();
  return ulozPolicky([...pred, ...zKnih]).length - pred.length;
}

/** Kolik titulů a kolik kusů na poličce stojí — pro přehled ve správě poliček. */
export function obsahPolicky(nazev) {
  const cisty = upravNazevPolicky(nazev);
  const knihy = nacti().filter((k) => upravNazevPolicky(k.policka) === cisty);
  return {
    titulu: knihy.length,
    kusu: knihy.reduce((soucet, k) => soucet + (Number(k.kusu) || 1), 0),
  };
}

/**
 * Sloučí záznamy o téže knize na téže poličce do jednoho.
 *
 * Nové skeny duplicitu neudělají — přičtou kus. Do tabulky se ale dvojí
 * záznam může dostat starší cestou: ze zálohy pořízené v jiném telefonu,
 * nebo z dat uložených dřívější verzí aplikace. Tohle to uklidí.
 *
 * Tentýž titul na dvou různých poličkách se ale nesloučí — to jsou dva
 * výtisky na dvou místech a o to při značení poliček jde.
 *
 * Počty kusů se sečtou, u ostatních polí vyhrává první neprázdná hodnota,
 * takže ručně doplněný název nepřebije prázdné místo z druhého záznamu.
 * Různé poznámky se spojí, aby se žádná neztratila.
 */
export function slucDuplicity(knihy) {
  const podleKlice = new Map();
  const vysledek = [];

  for (const kniha of knihy) {
    const klic = klicZaznamu(kniha);

    // Kniha bez čísla se slučovat nedá — projde beze změny.
    if (!klic) {
      vysledek.push({ ...kniha });
      continue;
    }

    const puvodni = podleKlice.get(klic);
    if (!puvodni) {
      const kopie = { ...kniha };
      podleKlice.set(klic, kopie);
      vysledek.push(kopie);
      continue;
    }

    puvodni.kusu = (Number(puvodni.kusu) || 1) + (Number(kniha.kusu) || 1);

    for (const [pole, hodnota] of Object.entries(kniha)) {
      if (pole === 'kusu' || pole === 'id' || pole === 'poznamka') continue;
      if (!puvodni[pole] && hodnota) puvodni[pole] = hodnota;
    }

    const poznamky = [puvodni.poznamka, kniha.poznamka].filter(Boolean);
    puvodni.poznamka = [...new Set(poznamky)].join('; ');
  }

  return vysledek;
}

/**
 * Odznak s počtem kusů („3×“) se dřív kreslil přímo dovnitř upravitelné buňky
 * s názvem. Buňka se ukládá tak, jak ji uživatel opustí, takže se odznak při
 * prvním klepnutí do buňky uložil jako součást názvu — v tabulce i v exportu
 * pak místo názvu stálo „3×“. Buňka je opravená (odznak je vedle upravitelné
 * části, ne v ní), tohle uklidí záznamy, které tak už vznikly.
 *
 * Odstraňuje se jen koncové „číslo ×“ — v žádném skutečném názvu knihy takový
 * konec nedává smysl, kdežto uvnitř názvu klidně být může („3× Vraždy“).
 */
const ODZNAK_NA_KONCI = /\s*\d+\s*×$/;

export function opravNazvySOdznakem(knihy) {
  let opraveno = 0;

  for (const kniha of knihy) {
    if (!ODZNAK_NA_KONCI.test(kniha.nazev || '')) continue;
    kniha.nazev = kniha.nazev.replace(ODZNAK_NA_KONCI, '').trim();
    opraveno++;
  }

  return opraveno;
}

/** Opraví názvy v uložených datech. Vrací, kolika řádků se to týkalo. */
export function uklidNazvy() {
  const knihy = nacti();
  const opraveno = opravNazvySOdznakem(knihy);
  if (opraveno) uloz(knihy);
  return opraveno;
}

/**
 * Uklidí duplicity v uložených datech. Vrací, kolik řádků ubylo,
 * aby šlo uživateli říct, jestli se vůbec něco stalo.
 */
export function uklidDuplicity() {
  const knihy = nacti();
  const slouceno = slucDuplicity(knihy);
  if (slouceno.length === knihy.length) return 0;
  uloz(slouceno);
  return knihy.length - slouceno.length;
}

/**
 * Posluchači změn tabulky. Díky nim se automatická záloha svěze na každé
 * úpravě, aniž by se musela dopisovat ke každému volání zvlášť — nová
 * místa, která tabulku mění, se zálohují sama.
 */
const posluchaci = new Set();

export function priZmene(posluchac) {
  posluchaci.add(posluchac);
}

function uloz(knihy) {
  localStorage.setItem(KLIC, JSON.stringify(knihy));
  for (const posluchac of posluchaci) {
    try {
      posluchac(knihy);
    } catch (chyba) {
      console.error(chyba);   // porucha zálohy nesmí shodit ukládání
    }
  }
  return knihy;
}

export function vsechny() {
  return nacti();
}

/**
 * Kniha s tímhle číslem na téhle poličce — jinde stejný titul stát může.
 * Bez čísla se nehledá: prázdný dotaz by jinak sedl na každou knihu, která
 * číslo nemá, a hlásil duplicitu tam, kde žádná není.
 */
export function podleIsbn(isbn, policka = '') {
  if (!isbn) return null;
  const cisty = upravNazevPolicky(policka);
  return nacti().find(
    (k) => cisloZaznamu(k) === isbn && upravNazevPolicky(k.policka) === cisty
  ) || null;
}

/** Všechny výtisky téhož titulu napříč poličkami — kvůli hlášce „máte i v ložnici“. */
export function vsudePodleIsbn(isbn) {
  return isbn ? nacti().filter((k) => cisloZaznamu(k) === isbn) : [];
}

/**
 * Přidá knihu. Když už tentýž titul na téže poličce je, jen zvýší počet kusů —
 * skenování stejného titulu podruhé tedy nedělá duplicity.
 */
export function pridej(kniha) {
  const knihy = nacti();
  const policka = upravNazevPolicky(kniha.policka);
  // Bez čísla není podle čeho poznat, že je to táž kniha — každé přidání
  // proto zakládá nový řádek.
  const cislo = cisloZaznamu(kniha);
  const existujici = cislo && knihy.find(
    (k) => cisloZaznamu(k) === cislo && upravNazevPolicky(k.policka) === policka
  );

  if (existujici) {
    existujici.kusu = (Number(existujici.kusu) || 1) + 1;
    uloz(knihy);
    return { zaznam: existujici, duplicita: true };
  }

  const zaznam = {
    id: crypto.randomUUID(),
    kusu: 1,
    poznamka: '',
    pridano: new Date().toISOString().slice(0, 10),
    ...kniha,
    policka,
  };
  knihy.unshift(zaznam);
  uloz(knihy);
  if (policka) pridejPolicku(policka);
  return { zaznam, duplicita: false };
}

export function uprav(id, zmeny) {
  const knihy = nacti();
  const kniha = knihy.find((k) => k.id === id);
  if (!kniha) return null;
  Object.assign(kniha, zmeny);
  uloz(knihy);
  return kniha;
}

/**
 * Přesune knihu na jinou poličku. Když tam tentýž titul už stojí,
 * oba záznamy se slijí a kusy se sečtou.
 */
export function presunNaPolicku(id, policka) {
  const cisty = upravNazevPolicky(policka);
  const knihy = nacti();
  const kniha = knihy.find((k) => k.id === id);
  if (!kniha) return null;

  kniha.policka = cisty;
  const slouceno = slucDuplicity(knihy);
  uloz(slouceno);
  if (cisty) pridejPolicku(cisty);
  return { policka: cisty, slouceno: slouceno.length !== knihy.length };
}

export function smaz(id) {
  uloz(nacti().filter((k) => k.id !== id));
}

export function smazVse() {
  uloz([]);
}

/**
 * Klíč pro import. U knihy s číslem je to číslo a polička; kniha bez čísla
 * se pozná podle svého vnitřního id, které přežije export i načtení zpět —
 * díky tomu nahrání téže zálohy podruhé nezdvojí ani takové řádky.
 */
function klicImportu(polozka) {
  return klicZaznamu(polozka) || (polozka?.id ? `id\u0000${polozka.id}` : null);
}

/**
 * Sloučí importovaná data se stávajícími. Podle čísla a poličky pozná,
 * co už tam je, takže se dá bez obav nahrát i starší záloha.
 */
export function importuj(polozky) {
  const knihy = nacti();
  const znama = new Set(knihy.map(klicImportu).filter(Boolean));
  let pridano = 0;

  for (const polozka of polozky) {
    if (!polozka || typeof polozka !== 'object') continue;
    const klic = klicImportu(polozka);
    if (klic && znama.has(klic)) continue;
    knihy.push({
      id: polozka.id || crypto.randomUUID(),
      kusu: Number(polozka.kusu) || 1,
      poznamka: polozka.poznamka || '',
      pridano: polozka.pridano || new Date().toISOString().slice(0, 10),
      ...polozka,
      policka: upravNazevPolicky(polozka.policka),
    });
    if (klic) znama.add(klic);
    pridano++;
  }

  uloz(knihy);
  uklidPolicky();
  return pridano;
}

function bunkaCsv(hodnota) {
  const text = String(hodnota ?? '');
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV se středníkem a BOM — v tomhle tvaru ho český Excel otevře
 * rovnou správně rozsloupcované a s diakritikou.
 */
export function doCsv(knihy = nacti()) {
  const hlavicka = SLOUPCE.map((s) => s.popis);
  const radky = knihy.map((kniha) =>
    SLOUPCE.map((s) => (s.doCsv ? s.doCsv(kniha[s.klic]) : kniha[s.klic]))
  );
  const text = [hlavicka, ...radky].map((r) => r.map(bunkaCsv).join(';')).join('\r\n');
  return '﻿' + text;
}

export function doJson(knihy = nacti()) {
  return JSON.stringify(knihy, null, 2);
}

export function stahni(obsah, nazevSouboru, typ) {
  const odkaz = document.createElement('a');
  const url = URL.createObjectURL(new Blob([obsah], { type: typ }));
  odkaz.href = url;
  odkaz.download = nazevSouboru;
  document.body.appendChild(odkaz);
  odkaz.click();
  odkaz.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
