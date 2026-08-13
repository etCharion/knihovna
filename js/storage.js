/**
 * Uložení tabulky knih do prohlížeče (localStorage).
 *
 * Data zůstávají v telefonu — nikam se neodesílají. Zálohu je potřeba
 * udělat exportem do CSV nebo JSON.
 */

import { naFormat } from './isbn.js';

const KLIC = 'knihovna.knihy.v1';

/**
 * Sloupce exportu do CSV.
 *
 * Názvy sloupců jsou přesně ty, které nabízí školní knihovní systém při
 * importu (pole titulu i exempláře) — při párování sloupců se pak nemusí nic
 * dohledávat, názvy sedí na první pohled. Pořadí je ISBN, autor, název, tedy
 * od nejjistějšího údaje k těm ostatním.
 *
 * Jsou tu jen údaje, které aplikace opravdu má. Cenu, signaturu, umístění,
 * přírůstkové číslo ani kategorii z ISBN dohledat nejde a prázdný sloupec by
 * při importu jen mátl — kdo je potřebuje, dopíše si je v Excelu.
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

/**
 * Sloučí záznamy se stejným ISBN do jednoho.
 *
 * Nové skeny duplicitu neudělají — přičtou kus. Do tabulky se ale dvojí
 * záznam může dostat starší cestou: ze zálohy pořízené v jiném telefonu,
 * nebo z dat uložených dřívější verzí aplikace. Tohle to uklidí.
 *
 * Počty kusů se sečtou, u ostatních polí vyhrává první neprázdná hodnota,
 * takže ručně doplněný název nepřebije prázdné místo z druhého záznamu.
 * Různé poznámky se spojí, aby se žádná neztratila.
 */
export function slucDuplicity(knihy) {
  const podleIsbn = new Map();

  for (const kniha of knihy) {
    const puvodni = podleIsbn.get(kniha.isbn);
    if (!puvodni) {
      podleIsbn.set(kniha.isbn, { ...kniha });
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

  return [...podleIsbn.values()];
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

function uloz(knihy) {
  localStorage.setItem(KLIC, JSON.stringify(knihy));
  return knihy;
}

export function vsechny() {
  return nacti();
}

export function podleIsbn(isbn) {
  return nacti().find((k) => k.isbn === isbn) || null;
}

/**
 * Přidá knihu. Když už ISBN v tabulce je, jen zvýší počet kusů —
 * skenování stejného titulu podruhé tedy nedělá duplicity.
 */
export function pridej(kniha) {
  const knihy = nacti();
  const existujici = knihy.find((k) => k.isbn === kniha.isbn);

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
  };
  knihy.unshift(zaznam);
  uloz(knihy);
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

export function smaz(id) {
  uloz(nacti().filter((k) => k.id !== id));
}

export function smazVse() {
  uloz([]);
}

/**
 * Sloučí importovaná data se stávajícími. Podle ISBN pozná, co už tam je,
 * takže se dá bez obav nahrát i starší záloha.
 */
export function importuj(polozky) {
  const knihy = nacti();
  const znama = new Set(knihy.map((k) => k.isbn));
  let pridano = 0;

  for (const polozka of polozky) {
    if (!polozka?.isbn || znama.has(polozka.isbn)) continue;
    knihy.push({
      id: polozka.id || crypto.randomUUID(),
      kusu: Number(polozka.kusu) || 1,
      poznamka: polozka.poznamka || '',
      pridano: polozka.pridano || new Date().toISOString().slice(0, 10),
      ...polozka,
    });
    znama.add(polozka.isbn);
    pridano++;
  }

  uloz(knihy);
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
